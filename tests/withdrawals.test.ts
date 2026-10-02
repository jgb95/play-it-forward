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
    delay: Promise<void> | undefined;
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
        if (delay) await delay;
        if (fail) throw Error("timeout");
        return { txid: "a".repeat(64), offboard_txid: "b".repeat(64) };
      }
      if (p === "/wallet/balance") return { spendable_sat: 10000 };
      if (p === "/onchain/balance")
        return { total_sat: 10000, confirmed_sat: 10000 };
      if (p.startsWith("/fees/offboard-all"))
        return {
          gross_amount_sat: 10000,
          net_amount_sat: 10000 - fee,
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
    await assert.rejects(f.w.preview("ark", dest), /Close/);
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
