import { randomUUID } from "node:crypto";
import { address, Transaction, networks } from "bitcoinjs-lib";
import bolt11 from "bolt11";
import type { Contribution, Method, Receipt } from "../shared/model.ts";
export interface PaymentAdapter {
  health?(): Promise<string>;
  create(amount: number, name: string, method: Method): Promise<Contribution>;
  reconcile(requests: Contribution[]): Promise<Receipt[]>;
}
export class SimulationAdapter implements PaymentAdapter {
  async create(
    amount: number,
    name: string,
    method: Method,
  ): Promise<Contribution> {
    const id = randomUUID();
    return {
      id,
      amount,
      name,
      method,
      destination: "demo:" + id,
      uri: "demo:" + id,
      created: Date.now(),
      expires: null,
      status: "pending" as const,
      received: 0,
    };
  }
  async reconcile() {
    return [];
  }
}
type Movement = {
  id: number;
  status: string;
  effective_balance_sat: number;
  received_on: {
    destination: { type: string; value: string };
    amount_sat: number;
  }[];
};
type WalletTx = {
  txid: string;
  tx: string;
  confirmation: { height: number } | null;
};
export const BARK_VERSION = "0.7.1";
export class BarkAdapter implements PaymentAdapter {
  private versionChecked = false;
  async health() {
    if (!this.versionChecked) {
      const r = await this.request(this.base + "/api-docs/openapi.json", {
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok || (await r.json()).info?.version !== BARK_VERSION)
        throw Error("Expected Bark " + BARK_VERSION);
      this.versionChecked = true;
    }
    const wallet = await this.api<{ fingerprint: string | null }>("/wallet");
    if (!wallet.fingerprint) throw Error("Bark wallet is not configured");
    const info = await this.api<{ network: string }>("/wallet/ark-info");
    if (
      info.network !== (this.network === "mainnet" ? "bitcoin" : "signet") &&
      info.network !== this.network
    )
      throw Error("Bark wallet network does not match PAYMENT_MODE");
    return wallet.fingerprint;
  }

  constructor(
    public base: string,
    private token: string,
    public network: "signet" | "mainnet",
    private request: typeof fetch = fetch,
  ) {
    const u = new URL(base);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
      throw Error("Bark must bind to localhost");
  }
  async api<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.request(this.base + "/api/v1" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw Error("Bark request failed (" + res.status + ")");
    return (await res.json()) as T;
  }
  async create(
    amount: number,
    name: string,
    method: Method,
  ): Promise<Contribution> {
    await this.health();
    let destination: string,
      uri: string,
      expires: number | null = null;
    if (method === "lightning") {
      const v = await this.api<{ invoice: string }>(
        "/lightning/receives/invoice",
        {
          amount_sat: amount,
          description: "Play It Forward · community prize pool",
        },
      );
      destination = v.invoice;
      uri = "lightning:" + destination;
      const invoice = bolt11.decode(
        destination,
        this.network === "signet"
          ? {
              bech32: destination.startsWith("lntbs") ? "tbs" : "tb",
              pubKeyHash: 111,
              scriptHash: 196,
              validWitnessVersions: [0, 1],
            }
          : undefined,
      );
      expires =
        (invoice.timeExpireDate ??
          (invoice.timestamp ?? Math.floor(Date.now() / 1000)) + 3600) * 1000;
    } else {
      const v = await this.api<{ address: string }>(
        method === "ark" ? "/wallet/addresses/next" : "/onchain/addresses/next",
        {},
      );
      destination = v.address;
      uri =
        method === "bitcoin"
          ? `bitcoin:${destination}?amount=${(amount / 100000000).toFixed(8)}`
          : destination;
    }
    return {
      id: randomUUID(),
      amount,
      name,
      method,
      destination,
      uri,
      expires,
      created: Date.now(),
      received: 0,
      status: "pending" as const,
    };
  }
  async reconcile(requests: Contribution[]) {
    if (!requests.length) return [];
    const receipts: Receipt[] = [];
    const offchain = requests.filter((x) => x.method !== "bitcoin");
    if (offchain.length) {
      const history = await this.api<Movement[]>("/history");
      for (const c of offchain) {
        let settled = c.method !== "lightning";
        if (!settled) {
          const status = await this.api<{ state: string }>(
            "/lightning/receives/" + encodeURIComponent(c.destination),
          );
          settled = status.state === "settled";
        }
        if (!settled) continue;
        for (const m of history) {
          const type = c.method === "ark" ? "ark" : "invoice";
          const destinations = m.received_on.filter(
            (d) =>
              d.destination.type === type &&
              d.destination.value === c.destination,
          );
          if (
            m.status === "successful" &&
            destinations.length &&
            m.effective_balance_sat > 0
          ) {
            if (m.received_on.length !== destinations.length)
              throw Error("Ambiguous Bark movement attribution");
            receipts.push({
              key: "bark:movement:" + m.id,
              requestId: c.id,
              amount: m.effective_balance_sat,
            });
          }
        }
      }
    }
    const bitcoin = requests.filter((x) => x.method === "bitcoin");
    if (bitcoin.length) {
      const transactions = await this.api<WalletTx[]>("/onchain/transactions");
      for (const tx of transactions) {
        if (!tx.confirmation) continue;
        const parsed = Transaction.fromHex(tx.tx);
        if (parsed.getId() !== tx.txid)
          throw Error("Bark transaction identity mismatch");
        for (const c of bitcoin) {
          const script = Buffer.from(
            address.toOutputScript(
              c.destination,
              this.network === "mainnet" ? networks.bitcoin : networks.testnet,
            ),
          );
          parsed.outs.forEach((out, i) => {
            if (Buffer.from(out.script).equals(script) && out.value > 0n)
              receipts.push({
                key: `bitcoin:${tx.txid}:${i}`,
                requestId: c.id,
                amount: Number(out.value),
              });
          });
        }
      }
    }
    return receipts;
  }
}
