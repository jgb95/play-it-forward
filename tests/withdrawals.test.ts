import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configSchema } from "../shared/model.ts";
import { Store } from "../server/store.ts";
import { Withdrawals } from "../server/withdrawals.ts";
import type { BarkAdapter } from "../server/payments.ts";
import { Transaction } from "bitcoinjs-lib";
const config = configSchema.parse(
    JSON.parse(readFileSync("config.json", "utf8")),
  ),
  dest = "bc1pjvqmw8kcsfrqwsz2vd56f5sx9seh74huju8qzn3xx7dpcj8ttmushxc6aa";
function fixture() {
  const s = new Store(":memory:", config, "mainnet");
  s.setEventMode("archive");
  let sends = 0,
    fee = 100,
    fail = false,
    delay: Promise<void> | undefined,
    ark = 10000,
    bitcoin = 10000,
    pending = 0,
    failAt = 0,
    changeAfterFirst = false;
  const calls: string[] = [];
  const tx = new Transaction();
  tx.addInput(Buffer.alloc(32), 0);
  tx.addOutput(
    Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32)]),
    10000n,
  );
  const bark = {
    network: "mainnet",
    health: async () => "wallet",
    api: async (p: string, b?: unknown) => {
      if (b) {
        sends++;
        calls.push(p);
        if (delay) await delay;
        if (fail || sends === failAt) throw Error("timeout");
        if (p === "/onchain/drain") bitcoin = 0;
        else ark = 0;
        if (changeAfterFirst && sends === 1) fee++;
        return { txid: "a".repeat(64), offboard_txid: "b".repeat(64) };
      }
      if (p === "/wallet/balance")
        return { spendable_sat: ark, pending_lightning_send_sat: pending };
      if (p === "/onchain/balance")
        return { total_sat: bitcoin, confirmed_sat: bitcoin };
      if (p.startsWith("/fees/offboard-all"))
        return {
          gross_amount_sat: ark,
          net_amount_sat: ark - fee,
          fee_sat: fee,
          vtxos_spent: ["v"],
        };
      if (p === "/onchain/utxos")
        return [
          {
            outpoint: tx.getId() + ":0",
            amount_sat: 10000,
            confirmation_height: 1,
          },
        ];
      if (p === "/onchain/transactions")
        return [{ txid: tx.getId(), tx: tx.toHex() }];
      if (p === "/fees/onchain") return { regular_sat_per_vb: 2 };
      throw Error(p);
    },
  } as unknown as BarkAdapter;
  return {
    s,
    w: new Withdrawals(s, bark),
    sends: () => sends,
    change: () => fee++,
    fail: () => (fail = true),
    delay: (p: Promise<void>) => (delay = p),
    balances: (a: number, b: number) => {
      ark = a;
      bitcoin = b;
    },
    pending: () => (pending = 1),
    failSecond: () => (failAt = 2),
    changeAfterFirst: () => (changeAfterFirst = true),
    calls,
  };
}
test("withdrawal preview never sends or changes ledger; explicit submit is once-only", async () => {
  const f = fixture();
  try {
    const p = await f.w.preview("ark", dest);
    assert.equal(p.net, 9900);
    assert.equal(f.sends(), 0);
    await f.w.send(p.id);
    assert.equal(f.sends(), 1);
    assert.equal(f.s.state().total, 0);
    await assert.rejects(f.w.send(p.id), /already/);
  } finally {
    f.s.close();
  }
});
test("on-chain drain review estimates a single-output Taproot transaction", async () => {
  const f = fixture();
  try {
    const p = await f.w.preview("bitcoin", dest);
    assert.equal(p.fee, 222);
    assert.equal(p.net, 9778);
    assert.equal(p.feeEstimated, true);
    await f.w.send(p.id);
    assert.equal(f.sends(), 1);
  } finally {
    f.s.close();
  }
});
test("stale quotes, balance changes, network mismatch and open checkout reject before sending", async () => {
  const f = fixture();
  try {
    await assert.rejects(f.w.preview("ark", dest.replace("bc1", "tb1")));
    const p = await f.w.preview("ark", dest);
    f.change();
    await assert.rejects(f.w.send(p.id), /changed/);
    assert.equal(f.sends(), 0);
    const expired = await f.w.preview("ark", dest);
    expired.expires = 0;
    f.w.save(expired);
    await assert.rejects(f.w.send(expired.id), /expired/);
    f.s.setEventMode("live");
    const liveReview = await f.w.preview("all", dest);
    assert.equal(liveReview.gross, 20000);
    await assert.rejects(f.w.send(liveReview.id), /Close/);
    assert.equal(f.sends(), 0);
  } finally {
    f.s.close();
  }
});
test("uncertain broadcast is durable and blocks automatic retry and new withdrawals", async () => {
  const f = fixture();
  try {
    const p = await f.w.preview("ark", dest);
    f.fail();
    await assert.rejects(f.w.send(p.id), /uncertain/);
    assert.equal(f.w.list()[0].status, "unknown");
    await assert.rejects(f.w.send(p.id));
    await assert.rejects(f.w.preview("bitcoin", dest));
    assert.equal(f.sends(), 1);
  } finally {
    f.s.close();
  }
});
test("concurrent reviews cannot drain the same wallet twice", async () => {
  const f = fixture();
  try {
    const a = await f.w.preview("ark", dest),
      b = await f.w.preview("bitcoin", dest);
    let release!: () => void;
    f.delay(new Promise<void>((r) => (release = r)));
    const pending = f.w.send(a.id);
    await assert.rejects(f.w.send(b.id), /already/);
    release();
    await pending;
    assert.equal(f.sends(), 1);
  } finally {
    f.s.close();
  }
});

test("whole-wallet review combines both balances and sends both exactly once to one destination", async () => {
  const f = fixture();
  try {
    const p = await f.w.preview("all", dest);
    assert.equal(p.gross, 20000);
    assert.equal(p.fee, 322);
    assert.equal(p.net, 19678);
    assert.deepEqual(
      p.parts?.map((x) => x.kind),
      ["bitcoin", "ark"],
    );
    assert.equal(f.sends(), 0);
    const result = await f.w.send(p.id);
    assert.equal(result.status, "broadcast");
    assert.equal(
      result.parts.filter((x: any) => x.status === "broadcast").length,
      2,
    );
    assert.deepEqual(f.calls, ["/onchain/drain", "/wallet/offboard/all"]);
    assert.equal((await f.w.balances()).ark.spendable_sat, 0);
    assert.equal((await f.w.balances()).bitcoin.total_sat, 0);
    await assert.rejects(f.w.send(p.id));
    assert.equal(f.sends(), 2);
    assert.equal(f.s.state().total, 0);
  } finally {
    f.s.close();
  }
});
test("whole-wallet withdrawal skips empty balances and refuses an empty or busy wallet", async () => {
  const f = fixture();
  try {
    f.balances(10000, 0);
    const p = await f.w.preview("all", dest);
    assert.equal(p.parts?.length, 1);
    assert.equal(p.parts?.[0].kind, "ark");
    await f.w.send(p.id);
    assert.equal(f.sends(), 1);
    await assert.rejects(f.w.preview("all", dest), /empty/);
    f.balances(10000, 10000);
    f.pending();
    await assert.rejects(f.w.preview("all", dest), /pending/);
  } finally {
    f.s.close();
  }
});
test("second-leg failure retains the first transaction and blocks another sweep", async () => {
  const f = fixture();
  try {
    const p = await f.w.preview("all", dest);
    f.failSecond();
    await assert.rejects(f.w.send(p.id), /uncertain/);
    const saved = f.w.list()[0];
    assert.equal(saved.parts[0].status, "broadcast");
    assert.equal(saved.parts[1].status, "unknown");
    assert.ok(saved.parts[0].txid);
    await assert.rejects(f.w.preview("all", dest));
    assert.equal(f.sends(), 2);
  } finally {
    f.s.close();
  }
});
test("changed second-leg quote stops safely and a new review includes only the remaining balance", async () => {
  const f = fixture();
  try {
    const p = await f.w.preview("all", dest);
    f.changeAfterFirst();
    const partial = await f.w.send(p.id);
    assert.equal(partial.status, "partial");
    assert.equal(partial.parts[0].status, "broadcast");
    assert.equal(f.sends(), 1);
    const remainder = await f.w.preview("all", dest);
    assert.equal(remainder.parts?.length, 1);
    assert.equal(remainder.parts?.[0].kind, "ark");
    await f.w.send(remainder.id);
    assert.deepEqual(f.calls, ["/onchain/drain", "/wallet/offboard/all"]);
  } finally {
    f.s.close();
  }
});
