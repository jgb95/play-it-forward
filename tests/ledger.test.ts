import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configSchema, progression } from "../shared/model.ts";
import { Store } from "../server/store.ts";
import { SimulationAdapter } from "../server/payments.ts";
const config = configSchema.parse(
  JSON.parse(readFileSync("config.json", "utf8")),
);
test("amount boundaries and accessories, including an open vault", () => {
  for (const [i, t] of [
    ...config.chapters.slice(1).map((c) => c.threshold),
    config.goal,
  ].entries()) {
    assert.equal(progression(t - 1, config).level, i);
    assert.equal(progression(t, config).level, i + 1);
  }
  assert.equal(progression(2000001, config).vaultOpen, true);
  assert.equal(progression(2000001, config).remaining, 0);
  assert.equal(progression(2000001, config).progress, 1);
  assert.equal(progression(1000000000, config).treasureTier, 12);
  assert.equal(progression(2000000, config).rewards.length, 5);
});
test("strict increasing configuration and invalid amounts are rejected", () => {
  assert.equal(configSchema.safeParse({ ...config, goal: 1 }).success, false);
  const store = new Store(":memory:", config, "demo");
  assert.throws(() =>
    store.credit({ key: "bad", requestId: "bad", amount: 0.1 }),
  );
  store.close();
});
test("one large gift and 100 small gifts give identical progress", async () => {
  const a = new Store(":memory:", config, "demo"),
    b = new Store(":memory:", config, "demo"),
    sim = new SimulationAdapter();
  for (const [store, count, amount] of [
    [a, 1, 700000],
    [b, 100, 7000],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const c = await sim.create(amount, "Berlin", "lightning");
      store.add(c);
      store.credit({ key: c.id, requestId: c.id, amount });
    }
  }
  for (const key of [
    "total",
    "level",
    "chapter",
    "progress",
    "remaining",
    "treasureTier",
    "vaultOpen",
  ] as const)
    assert.equal(a.state()[key], b.state()[key]);
  a.close();
  b.close();
});
test("duplicate receipts, multiple payments, crash recovery and event IDs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pif-")),
    path = join(dir, "test.sqlite");
  let store = new Store(path, config, "demo");
  const c = await new SimulationAdapter().create(2100000, "<script>", "ark");
  store.add(c);
  const receipt = { key: "first", requestId: c.id, amount: 2100000 };
  assert.equal(store.credit(receipt)?.previousLevel, 0);
  assert.equal(store.credit(receipt), null);
  store.credit({ key: "second", requestId: c.id, amount: 50000 });
  assert.equal(store.get(c.id)?.received, 2150000);
  const cursor = store.state().eventId;
  store.close();
  store = new Store(path, config, "demo");
  assert.equal(store.state().total, 2150000);
  assert.equal(store.credit(receipt), null);
  assert.equal(store.events(0).length, 2);
  store.reset();
  assert.equal(store.state().total, 0);
  assert.ok(store.state().eventId > cursor);
  store.close();
  rmSync(dir, { recursive: true });
});

test("expired requests remain attributable for late payments", async () => {
  const store = new Store(":memory:", config, "signet");
  const c = await new SimulationAdapter().create(5000, "", "bitcoin");
  c.expires = 1;
  store.add(c);
  assert.equal(store.get(c.id)?.status, "expired");
  store.credit({ key: "late:outpoint", requestId: c.id, amount: 7000 });
  assert.equal(store.get(c.id)?.status, "paid");
  assert.equal(store.state().total, 7000);
  store.close();
});

test("ledger binds to one organizer wallet to prevent movement-ID collisions", () => {
  const s = new Store(":memory:", config, "signet");
  s.bindWallet("first");
  s.bindWallet("first");
  assert.throws(() => s.bindWallet("second"), /wallet changed/);
  assert.equal(s.state().total, 0);
  s.close();
});
