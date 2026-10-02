import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContributionFeed } from "../shared/feed.ts";
import { configSchema, type StoryEvent } from "../shared/model.ts";
import { Store } from "../server/store.ts";
import { ReplayReader } from "../src/playback.ts";
const config = configSchema.parse(
  JSON.parse(readFileSync("config.json", "utf8")),
);
const event = (
  id: number,
  kind: StoryEvent["kind"],
  payload: any,
): StoryEvent => ({ id, kind, payload, created: id * 1000 });
const pending = {
  key: "bitcoin:tx:0",
  requestId: "private-request",
  txid: "tx",
  amount: 111,
  name: "<b>visitor</b>",
  status: "pending",
};
test("pending output updates in place, fees stay separate, duplicates and extra outputs remain distinct", () => {
  const f = new ContributionFeed();
  f.apply(event(1, "onchain", pending));
  f.apply(
    event(2, "acceleration", { txid: "tx", status: "invoice", totalSats: 999 }),
  );
  assert.equal(f.rows()[0].express, false);
  f.apply(
    event(3, "acceleration", {
      txid: "tx",
      status: "accepted",
      totalSats: 999,
    }),
  );
  f.apply(event(3, "onchain", { ...pending, status: "confirmed" }));
  assert.equal(
    f.rows()[0].status,
    "pending",
    "only a credited receipt marks the feed confirmed",
  );
  f.apply(
    event(4, "donation", {
      receiptKey: pending.key,
      amount: 111,
      name: pending.name,
      method: "bitcoin",
    }),
  );
  f.apply(
    event(4, "donation", {
      receiptKey: pending.key,
      amount: 111,
      name: pending.name,
      method: "bitcoin",
    }),
  );
  f.apply(event(5, "onchain", pending)); // stale observation cannot unconfirm a credited receipt
  assert.deepEqual(
    f.rows().map((r) => [r.firstId, r.amount, r.status, r.express]),
    [[1, 111, "confirmed", true]],
  );
  f.apply(event(6, "onchain", { ...pending, key: "bitcoin:tx:1", amount: 22 }));
  assert.equal(f.rows().length, 2);
  assert.equal(f.rows()[0].express, true);
  assert.ok(!JSON.stringify(f.rows()).includes("private-request"));
  f.apply(event(7, "acceleration", { txid: "tx", status: "failed" }));
  assert.ok(f.rows().every((r) => !r.express));
});
test("recorded replacements, drops and missing legacy methods are truthful", () => {
  const f = new ContributionFeed();
  f.apply(event(1, "onchain", pending));
  f.apply(event(2, "onchain", { ...pending, status: "replaced" }));
  f.apply(
    event(3, "onchain", {
      ...pending,
      key: "bitcoin:replacement:0",
      txid: "replacement",
    }),
  );
  assert.equal(f.rows()[1].status, "replaced");
  f.apply(
    event(4, "onchain", {
      ...pending,
      key: "bitcoin:replacement:0",
      txid: "replacement",
      status: "dropped",
    }),
  );
  assert.equal(f.rows()[0].status, "dropped");
  f.apply(event(5, "donation", { amount: 42, name: "Legacy" }));
  assert.equal(f.rows()[0].method, undefined);
  f.apply(event(6, "reset", {}));
  assert.equal(f.rows().length, 0);
});
test("replay projection reveals only consumed events and does not mutate journal payloads", () => {
  const journal = [
    event(1, "onchain", pending),
    event(2, "acceleration", { txid: "tx", status: "accepted" }),
    event(3, "donation", {
      receiptKey: pending.key,
      amount: 111,
      name: "Visitor",
    }),
  ];
  const original = JSON.stringify(journal);
  const reader = new ReplayReader(journal),
    f = new ContributionFeed();
  assert.equal(f.rows().length, 0);
  f.apply(reader.next(0, true, 1)!);
  assert.equal(f.rows()[0].status, "pending");
  assert.equal(reader.next(0.5, false, 1), undefined);
  f.apply(reader.next(1, true, 1)!);
  assert.equal(f.rows()[0].express, true);
  f.apply(reader.next(2, true, 1)!);
  assert.equal(f.rows()[0].status, "confirmed");
  assert.equal(JSON.stringify(journal), original);
});
test("feed pagination pins run and cutoff, survives restart and accounts for a 100-receipt burst", () => {
  const dir = mkdtempSync(join(tmpdir(), "pif-feed-")),
    path = join(dir, "ledger.sqlite");
  let store = new Store(path, config, "demo");
  try {
    const run = store.state().eventKey!;
    const req = {
      id: "private-request",
      amount: 10,
      name: "Burst",
      method: "ark" as const,
      destination: "private-address",
      uri: "private-invoice",
      expires: null,
      created: Date.now(),
      status: "pending" as const,
      received: 0,
    };
    store.add(req);
    for (let i = 0; i < 100; i++)
      store.credit({ key: `burst:${i}`, requestId: req.id, amount: 10 });
    const first = store.feed();
    assert.equal(first.entries.length, 50);
    assert.equal(first.more, true);
    store.credit({ key: "late", requestId: req.id, amount: 9 });
    const older = store.feed(first.before, first.cutoff, 50, run);
    assert.equal(older.entries.length, 50);
    assert.equal(older.more, false);
    assert.equal(
      new Set([...first.entries, ...older.entries].map((e) => e.key)).size,
      100,
    );
    assert.equal(
      [...first.entries, ...older.entries].reduce((n, e) => n + e.amount, 0),
      1000,
    );
    assert.equal(store.state().total, 1009);
    const safe = JSON.stringify(first);
    assert.ok(
      !safe.includes("private-address") &&
        !safe.includes("private-invoice") &&
        !safe.includes(req.id),
    );
    store.close();
    store = new Store(path, config, "demo");
    assert.deepEqual(store.feed(Number.MAX_SAFE_INTEGER, first.cutoff), first);
    store.startRun("Next");
    assert.equal(store.feed().entries.length, 0);
    assert.equal(
      store.feed(Number.MAX_SAFE_INTEGER, store.state().eventId, 100, run)
        .entries.length,
      100,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("legacy live journal methods are recovered from original receipts without rewriting history", () => {
  const store = new Store(":memory:", config, "mainnet");
  try {
    for (const method of ["lightning", "ark"] as const) {
      const id = "request-" + method;
      store.add({
        id,
        amount: 5000,
        name: method + " visitor",
        method,
        destination: "private",
        uri: "private",
        expires: null,
        created: 1,
        status: "pending",
        received: 0,
      });
      const credit = store.credit({
        key: "receipt-" + method,
        requestId: id,
        amount: 5000,
      })!;
      const old = {
        amount: credit.amount,
        name: credit.name,
        total: credit.total,
        level: credit.level,
        previousLevel: credit.previousLevel,
      };
      store.db
        .prepare("UPDATE events SET payload=? WHERE id=?")
        .run(JSON.stringify(old), credit.id);
    }
    const history = store.history();
    assert.deepEqual(
      history.events.map((e) => e.payload.method),
      ["lightning", "ark"],
    );
    assert.deepEqual(
      store.feed().entries.map((e) => e.method),
      ["ark", "lightning"],
    );
    assert.equal(store.state().total, 10000);
    const originals = store.db
      .prepare("SELECT payload FROM events WHERE kind='donation'")
      .all();
    assert.ok(originals.every((e) => !JSON.parse(String(e.payload)).method));
    assert.ok(!JSON.stringify(store.feed()).includes("private"));
  } finally {
    store.close();
  }
});
