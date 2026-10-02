import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { configSchema } from "../shared/model.ts";
import { Store } from "../server/store.ts";
import { SimulationAdapter } from "../server/payments.ts";
const config = configSchema.parse(
  JSON.parse(readFileSync("config.json", "utf8")),
);
test("new run saves history, isolates totals, attributes late receipts and keeps fixed cutoffs", async () => {
  const s = new Store(":memory:", config, "mainnet"),
    sim = new SimulationAdapter();
  try {
    const c = await sim.create(100, "old", "bitcoin");
    s.add(c);
    s.credit({ key: "first", requestId: c.id, amount: 100 });
    const old = s.state().eventKey!,
      cutoff = s.state().eventId;
    const next = s.startRun("Next adventure");
    assert.equal(s.state().total, 0);
    assert.equal(s.all().length, 1);
    s.credit({ key: "late", requestId: c.id, amount: 70 });
    assert.equal(s.state().total, 0);
    assert.equal(s.get(c.id)?.received, 170);
    assert.equal(s.history(0, cutoff, 200, old).finalTotal, 100);
    assert.equal(s.history(0, undefined, 200, old).finalTotal, 170);
    assert.equal(s.history(0, undefined, 200, next).finalTotal, 0);
    assert.equal(s.metadata("featuredRun"), old);
    const n = await sim.create(20, "new", "ark");
    s.add(n);
    s.credit({ key: "next", requestId: n.id, amount: 20 });
    assert.equal(s.state().total, 20);
    assert.equal(s.state(old).total, 170);
    s.featureRun(next);
    assert.equal(s.metadata("featuredRun"), next);
    assert.throws(() => s.featureRun("missing"));
    assert.equal(s.credit({ key: "late", requestId: c.id, amount: 70 }), null);
  } finally {
    s.close();
  }
});
test("saved configurations and run selection survive restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "runs-")),
    path = join(dir, "db.sqlite");
  let s = new Store(path, config, "demo");
  const old = s.state().eventKey!;
  s.startRun("Second");
  s.featureRun(old);
  s.close();
  s = new Store(path, { ...config, goal: config.goal + 1 }, "demo");
  assert.equal(s.config.goal, config.goal);
  assert.equal(s.runs().length, 2);
  assert.equal(s.metadata("featuredRun"), old);
  const next = s.startRun("New config");
  assert.equal(s.runConfig(next).goal, config.goal + 1);
  assert.equal(s.runConfig(old).goal, config.goal);
  s.close();
  rmSync(dir, { recursive: true });
});
test("legacy ledger migrates without changing receipts or event IDs", () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-")),
    path = join(dir, "db.sqlite");
  const db = new DatabaseSync(path);
  db.exec(
    `CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE requests(id TEXT PRIMARY KEY,amount INTEGER,name TEXT,method TEXT,destination TEXT,uri TEXT,expires INTEGER,created INTEGER);CREATE TABLE receipts(key TEXT PRIMARY KEY,request_id TEXT,amount INTEGER);CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT,payload TEXT,created INTEGER);`,
  );
  db.prepare("INSERT INTO metadata VALUES('eventKey','legacy')").run();
  db.prepare("INSERT INTO metadata VALUES('storyConfig',?)").run(
    JSON.stringify(config),
  );
  db.exec(
    "INSERT INTO requests VALUES('a',50,'x','bitcoin','address','uri',NULL,1);INSERT INTO receipts VALUES('r','a',50)",
  );
  db.prepare("INSERT INTO events VALUES(7,'donation',?,1)").run(
    JSON.stringify({ amount: 50, total: 50 }),
  );
  db.close();
  const s = new Store(path, config, "mainnet");
  assert.equal(s.state().total, 50);
  assert.equal(s.state().eventId, 7);
  assert.equal(s.history().finalTotal, 50);
  s.startRun("Fresh");
  assert.equal(s.state().total, 0);
  assert.equal(s.get("a")?.received, 50);
  s.close();
  rmSync(dir, { recursive: true });
});
