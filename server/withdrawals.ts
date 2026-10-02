import { randomUUID } from "node:crypto";
import { backup } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { address, Transaction } from "bitcoinjs-lib";
import { BarkAdapter } from "./payments.ts";
import { Store } from "./store.ts";
export class Withdrawals {
  constructor(
    private store: Store,
    private bark: BarkAdapter,
  ) {}
  list() {
    return this.store.db
      .prepare("SELECT payload FROM withdrawals ORDER BY rowid DESC LIMIT 30")
      .all()
      .map((x) => JSON.parse(String(x.payload)));
  }
  save(p: any) {
    this.store.db
      .prepare("INSERT OR REPLACE INTO withdrawals VALUES(?,?)")
      .run(p.id, JSON.stringify(p));
  }
  async balances() {
    const identity = await this.bark.health();
    this.store.bindWallet(identity);
    return {
      ark: await this.bark.api<any>("/wallet/balance"),
      bitcoin: await this.bark.api<any>("/onchain/balance"),
    };
  }
  async estimate(kind: "ark" | "bitcoin", destination: string) {
    const decoded = address.fromBech32(destination);
    const prefix = this.bark.network === "mainnet" ? "bc" : "tb";
    if (
      decoded.prefix !== prefix ||
      decoded.version !== 1 ||
      decoded.data.length !== 32
    )
      throw Error("Use a Taproot Bitcoin address on this wallet’s network");
    const balance = await this.balances();
    if (kind === "ark") {
      const q = await this.bark.api<any>(
        "/fees/offboard-all?address=" + encodeURIComponent(destination),
      );
      if (
        q.gross_amount_sat !== balance.ark.spendable_sat ||
        q.net_amount_sat <= 0 ||
        q.fee_sat < 0 ||
        q.gross_amount_sat !== q.net_amount_sat + q.fee_sat
      )
        throw Error("Invalid withdrawal estimate");
      return {
        gross: q.gross_amount_sat,
        fee: q.fee_sat,
        net: q.net_amount_sat,
        fingerprint: JSON.stringify(q),
      };
    }
    // Drain spends all wallet UTXOs. Restrict review to a completely confirmed wallet.
    if (balance.bitcoin.total_sat !== balance.bitcoin.confirmed_sat)
      throw Error(
        "Wait for pending Bitcoin transactions to confirm before draining",
      );
    const utxos = await this.bark.api<any[]>("/onchain/utxos");
    const txs = await this.bark.api<any[]>("/onchain/transactions");
    for (const u of utxos) {
      const [txid, vout] = u.outpoint.split(":");
      const row = txs.find((t) => t.txid === txid);
      if (!row) throw Error("Cannot estimate this wallet’s input");
      const out = Transaction.fromHex(row.tx).outs[Number(vout)];
      if (
        !out ||
        out.script.length !== 34 ||
        out.script[0] !== 0x51 ||
        Number(out.value) !== u.amount_sat
      )
        throw Error("Unsupported withdrawal input");
    }
    const rates = await this.bark.api<any>("/fees/onchain");
    const rate = rates.regular_sat_per_vb;
    if (!Number.isSafeInteger(rate) || rate < 1 || !utxos.length)
      throw Error("No spendable funds or valid fee estimate");
    const gross = utxos.reduce((n, u) => n + u.amount_sat, 0);
    if (gross !== balance.bitcoin.confirmed_sat)
      throw Error("Wallet changed; review again");
    // Version, locktime, compact counts, SegWit marker, key-path witnesses and one P2TR output.
    if (utxos.length > 252)
      throw Error("This large wallet needs a dedicated transaction review");
    const fee = Math.ceil(10.5 + utxos.length * 57.5 + 43) * rate;
    if (gross - fee < 330)
      throw Error("Balance is too small after estimated fees");
    return {
      gross,
      fee,
      net: gross - fee,
      fingerprint: JSON.stringify({ utxos, rate }),
    };
  }
  blocked() {
    return this.store.db
      .prepare("SELECT payload FROM withdrawals")
      .all()
      .map((x) => JSON.parse(String(x.payload)))
      .some((p) => ["checking", "submitted", "unknown"].includes(p.status));
  }
  async preview(kind: "ark" | "bitcoin", destination: string) {
    if (this.blocked())
      throw Error(
        "An earlier withdrawal needs wallet inspection before preparing another transfer",
      );
    if (this.store.eventMode() !== "archive")
      throw Error("Close contributions with Event archive before withdrawing");
    const q = await this.estimate(kind, destination);
    if (this.blocked()) throw Error("A withdrawal is already being submitted");
    const p = {
      id: randomUUID(),
      kind,
      destination,
      ...q,
      created: Date.now(),
      expires: Date.now() + 60000,
      status: "review",
      feeEstimated: kind === "bitcoin",
    };
    this.save(p);
    return p;
  }
  async send(id: string) {
    const row = this.store.db
      .prepare("SELECT payload FROM withdrawals WHERE id=?")
      .get(id);
    if (!row) throw Error("Unknown withdrawal review");
    const p = JSON.parse(String(row.payload));
    if (p.status !== "review" || p.expires <= Date.now())
      throw Error(
        "Review expired or already submitted; refresh wallet history",
      );
    if (this.store.eventMode() !== "archive")
      throw Error("Close contributions before withdrawing");
    if (this.blocked())
      throw Error("A withdrawal is already submitted; inspect wallet history");
    // Claim synchronously before awaiting: a double click can never submit twice.
    p.status = "checking";
    this.save(p);
    try {
      const fresh = await this.estimate(p.kind, p.destination);
      if (fresh.fingerprint !== p.fingerprint)
        throw Error("Balance or fee changed; prepare a fresh review");
      const file = String(this.store.db.location());
      if (file && file !== ":memory:") {
        const dir = join(dirname(file), "withdrawal-backups");
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const dest = join(dir, p.id + ".sqlite");
        await backup(this.store.db, dest);
        chmodSync(dest, 0o600);
      }
    } catch (e) {
      p.status = "cancelled";
      p.error = (e as Error).message;
      this.save(p);
      throw e;
    }
    // Persist before making the money-moving call. A timeout or process crash requires manual inspection, never automatic retry.
    p.status = "submitted";
    this.save(p);
    try {
      const result = await this.bark.api<any>(
        p.kind === "ark" ? "/wallet/offboard/all" : "/onchain/drain",
        p.kind === "ark"
          ? { address: p.destination }
          : { destination: p.destination },
      );
      p.txid = result.offboard_txid ?? result.txid;
      if (!/^[0-9a-f]{64}$/.test(p.txid))
        throw Error("Unexpected withdrawal response");
      p.status = "broadcast";
      this.save(p);
      return p;
    } catch (e) {
      p.status = "unknown";
      p.error =
        "Check Bark wallet transactions before another withdrawal; the broadcast result is uncertain.";
      this.save(p);
      throw Error(p.error);
    }
  }
}
