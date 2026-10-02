import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type {
  Config,
  Contribution,
  Receipt,
  State,
  Observation,
  AccelerationQuote,
  AccelerationAttempt,
  StoryEvent,
  HistoryPage,
} from "../shared/model.ts";
import { ContributionFeed, type FeedPage } from "../shared/feed.ts";
import { progression } from "../shared/model.ts";
export class Store {
  db: DatabaseSync;
  nextConfig: Config;
  private feedCache = new Map<
    string,
    { cutoff: number; projection: ContributionFeed }
  >();
  constructor(
    path: string,
    public config: Config,
    public mode: State["mode"],
  ) {
    this.nextConfig = structuredClone(config);
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,amount INTEGER NOT NULL,name TEXT NOT NULL,method TEXT NOT NULL,destination TEXT NOT NULL,uri TEXT NOT NULL,expires INTEGER,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS receipts(key TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES requests(id),amount INTEGER NOT NULL CHECK(amount>0));
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,payload TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS observations(key TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS acceleration_quotes(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS accelerations(txid TEXT PRIMARY KEY,payload TEXT NOT NULL);`);
    this.db
      .prepare("INSERT OR IGNORE INTO metadata VALUES(?,?)")
      .run("eventKey", randomUUID());
    this.db
      .prepare("INSERT OR IGNORE INTO metadata VALUES(?,?)")
      .run("storyConfig", JSON.stringify(config));
    this.db.exec("BEGIN IMMEDIATE");
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,name TEXT NOT NULL,config TEXT NOT NULL,created INTEGER NOT NULL,finished INTEGER);
      CREATE TABLE IF NOT EXISTS withdrawals(id TEXT PRIMARY KEY,payload TEXT NOT NULL);`);
    const key = this.metadata("eventKey")!;
    for (const table of ["requests", "events"]) {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((x) => x.name === "run_id")) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN run_id TEXT`);
        this.db.prepare(`UPDATE ${table} SET run_id=?`).run(key);
      }
    }
    this.db
      .prepare("INSERT OR IGNORE INTO runs VALUES(?,?,?,?,NULL)")
      .run(key, "Berlin adventure", this.metadata("storyConfig")!, Date.now());
    this.db.exec("COMMIT");
    const active = this.db
      .prepare("SELECT config FROM runs WHERE id=?")
      .get(key);
    if (active)
      this.config = {
        ...JSON.parse(String(active.config)),
        publicUrl: config.publicUrl,
      };
  }
  bindWallet(fingerprint: string) {
    const existing = this.db
      .prepare("SELECT value FROM metadata WHERE key='wallet'")
      .get();
    if (existing && existing.value !== fingerprint)
      throw Error(
        "Bark wallet changed: restore the matched wallet and ledger before continuing",
      );
    this.db
      .prepare("INSERT OR IGNORE INTO metadata VALUES('wallet',?)")
      .run(fingerprint);
  }
  add(c: Contribution, runId = this.metadata("eventKey")!) {
    this.db
      .prepare(
        "INSERT INTO requests(id,amount,name,method,destination,uri,expires,created,run_id) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        c.id,
        c.amount,
        c.name,
        c.method,
        c.destination,
        c.uri,
        c.expires,
        c.created,
        runId,
      );
  }
  all() {
    return (
      this.db
        .prepare("SELECT * FROM requests ORDER BY created")
        .all() as unknown as Contribution[]
    ).map((c) => this.get(c.id)!);
  }
  get(id: string): Contribution | undefined {
    const r = this.db
      .prepare("SELECT * FROM requests WHERE id=?")
      .get(id) as unknown as Contribution | undefined;
    if (!r) return;
    const received = Number(
      this.db
        .prepare(
          "SELECT COALESCE(SUM(amount),0) n FROM receipts WHERE request_id=?",
        )
        .get(id)!.n,
    );
    return {
      ...r,
      received,
      onchain: this.observations().filter((x) => x.requestId === id),
      acceleration: this.observations()
        .filter((x) => x.requestId === id)
        .map((x) => this.attempt(x.txid))
        .find(Boolean),
      status:
        received > 0
          ? "paid"
          : r.expires && r.expires < Date.now()
            ? "expired"
            : "pending",
    };
  }
  state(runId = this.metadata("eventKey")!): State {
    const s = this.db
      .prepare(
        "SELECT COALESCE(SUM(r.amount),0) total,COUNT(*) count FROM receipts r JOIN requests q ON q.id=r.request_id WHERE q.run_id=?",
      )
      .get(runId)!;
    const total = Number(s.total);
    return {
      total,
      count: Number(s.count),
      ...progression(total, this.runConfig(runId)),
      eventId: Number(
        this.db.prepare("SELECT COALESCE(MAX(id),0) id FROM events").get()!.id,
      ),
      mode: this.mode,
      eventMode: this.eventMode(),
      eventKey: runId,
      onchain: this.observations().filter(
        (x) => x.status === "pending" && this.requestRun(x.requestId) === runId,
      ),
    };
  }
  credit(r: Receipt) {
    if (!Number.isSafeInteger(r.amount) || r.amount <= 0)
      throw Error("Invalid verified receipt");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const request = this.get(r.requestId);
      if (!request) throw Error("Unknown contribution");
      const runId = this.requestRun(r.requestId)!;
      const before = this.state(runId);
      if (!Number.isSafeInteger(before.total + r.amount))
        throw Error("Pool exceeds safe integer range");
      const changed = this.db
        .prepare("INSERT OR IGNORE INTO receipts VALUES(?,?,?)")
        .run(r.key, r.requestId, r.amount).changes;
      if (!changed) {
        this.db.exec("COMMIT");
        return null;
      }
      const after = this.state(runId);
      const payload = {
        runId,
        amount: r.amount,
        name: request.name,
        method: request.method,
        requestId: request.id,
        receiptKey: r.key,
        level: after.level,
        previousLevel: before.level,
        total: after.total,
      };
      const id = Number(
        this.db
          .prepare(
            "INSERT INTO events(kind,payload,created,run_id) VALUES(?,?,?,?)",
          )
          .run("donation", JSON.stringify(payload), Date.now(), runId)
          .lastInsertRowid,
      );
      this.db.exec("COMMIT");
      return { id, ...payload };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  events(after: number) {
    return this.db
      .prepare(
        "SELECT id,kind,payload FROM events WHERE id>? AND run_id=? ORDER BY id LIMIT 200",
      )
      .all(after, this.metadata("eventKey")!) as unknown as {
      id: number;
      kind: string;
      payload: string;
    }[];
  }
  reset() {
    if (this.mode !== "demo")
      throw Error("Reset is available only in demo mode");
    this.startRun("Rehearsal adventure");
  }
  requestRun(id: string): string | undefined {
    return this.db.prepare("SELECT run_id FROM requests WHERE id=?").get(id)
      ?.run_id as string | undefined;
  }
  runConfig(id: string): Config {
    const row = this.db.prepare("SELECT config FROM runs WHERE id=?").get(id);
    if (!row) throw Error("Unknown run");
    const config = JSON.parse(String(row.config));
    config.publicUrl = this.config.publicUrl;
    return config;
  }
  runs() {
    return this.db
      .prepare(
        "SELECT id,name,created,finished FROM runs ORDER BY created DESC,rowid DESC",
      )
      .all()
      .map((r) => ({
        ...r,
        total: this.state(String(r.id)).total,
        active: r.id === this.metadata("eventKey"),
        featured: r.id === this.metadata("featuredRun"),
      }));
  }
  featureRun(id: string) {
    this.runConfig(id);
    this.db
      .prepare("INSERT OR REPLACE INTO metadata VALUES('featuredRun',?)")
      .run(id);
  }
  startRun(name: string) {
    if (!name.trim() || name.length > 80)
      throw Error("Enter a run name of 1–80 characters");
    const id = randomUUID(),
      now = Date.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old = this.metadata("eventKey")!;
      this.db.prepare("UPDATE runs SET finished=? WHERE id=?").run(now, old);
      if (!this.metadata("featuredRun")) this.featureRun(old);
      this.db
        .prepare("INSERT INTO runs VALUES(?,?,?,?,NULL)")
        .run(id, name.trim(), JSON.stringify(this.nextConfig), now);
      this.db
        .prepare("UPDATE metadata SET value=? WHERE key='eventKey'")
        .run(id);
      this.db
        .prepare("UPDATE metadata SET value=? WHERE key='storyConfig'")
        .run(JSON.stringify(this.nextConfig));
      this.config = structuredClone(this.nextConfig);
      this.setEventMode("live");
      this.journal("reset", {});
      this.db.exec("COMMIT");
      return id;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  metadata(key: string) {
    return (
      this.db.prepare("SELECT value FROM metadata WHERE key=?").get(key) as
        | { value: string }
        | undefined
    )?.value;
  }
  eventMode(): "live" | "archive" {
    return this.metadata("eventMode") === "archive" ? "archive" : "live";
  }
  setEventMode(mode: "live" | "archive") {
    this.db
      .prepare("INSERT OR REPLACE INTO metadata VALUES(?,?)")
      .run("eventMode", mode);
  }
  journal(kind: StoryEvent["kind"], payload: any) {
    const created = Date.now();
    const id = Number(
      this.db
        .prepare(
          "INSERT INTO events(kind,payload,created,run_id) VALUES(?,?,?,?)",
        )
        .run(
          kind,
          JSON.stringify(payload),
          created,
          payload.requestId
            ? this.requestRun(payload.requestId)!
            : payload.txid
              ? (this.observations()
                  .filter((o) => o.txid === payload.txid)
                  .map((o) => this.requestRun(o.requestId))[0] ??
                this.metadata("eventKey")!)
              : this.metadata("eventKey")!,
        ).lastInsertRowid,
    );
    return { id, kind, created, payload };
  }
  observations(): Observation[] {
    return (
      this.db
        .prepare("SELECT payload FROM observations ORDER BY rowid")
        .all() as { payload: string }[]
    ).map((x) => JSON.parse(x.payload));
  }
  observe(value: Observation) {
    if (
      !Number.isSafeInteger(value.amount) ||
      value.amount < 1 ||
      !this.get(value.requestId)
    )
      throw Error("Invalid observed output");
    const old = (
      this.db
        .prepare("SELECT payload FROM observations WHERE key=?")
        .get(value.key) as { payload: string } | undefined
    )?.payload;
    const payload = JSON.stringify(value);
    if (old === payload) return null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT OR REPLACE INTO observations VALUES(?,?)")
        .run(value.key, payload);
      const event = this.journal("onchain", value);
      this.db.exec("COMMIT");
      return event;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  quote(value: AccelerationQuote) {
    this.db
      .prepare("INSERT INTO acceleration_quotes VALUES(?,?)")
      .run(value.id, JSON.stringify(value));
  }
  getQuote(id: string): AccelerationQuote | undefined {
    const row = this.db
      .prepare("SELECT payload FROM acceleration_quotes WHERE id=?")
      .get(id) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) : undefined;
  }
  attempt(txid: string): AccelerationAttempt | undefined {
    const row = this.db
      .prepare("SELECT payload FROM accelerations WHERE txid=?")
      .get(txid) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) : undefined;
  }
  attempts(): AccelerationAttempt[] {
    return (
      this.db.prepare("SELECT payload FROM accelerations").all() as {
        payload: string;
      }[]
    ).map((x) => JSON.parse(x.payload));
  }
  setAttempt(value: AccelerationAttempt) {
    const old = this.attempt(value.txid);
    if (JSON.stringify(old) === JSON.stringify(value)) return null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT OR REPLACE INTO accelerations VALUES(?,?)")
        .run(value.txid, JSON.stringify(value));
      const event = this.journal("acceleration", {
        txid: value.txid,
        status: value.status,
        totalSats: value.totalSats,
      });
      this.db.exec("COMMIT");
      return event;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  history(
    after = 0,
    cutoff = this.state().eventId,
    limit = 200,
    runId = this.metadata("eventKey")!,
  ): HistoryPage {
    const config = this.runConfig(runId);
    const reset = Number(
      this.db
        .prepare(
          "SELECT COALESCE(MAX(id),0) id FROM events WHERE kind='reset' AND id<=? AND run_id=?",
        )
        .get(cutoff, runId)!.id,
    );
    const rows = this.db
      .prepare(
        "SELECT id,kind,payload,created FROM events WHERE id>? AND id<=? AND run_id=? ORDER BY id LIMIT ?",
      )
      .all(Math.max(after, reset), cutoff, runId, limit + 1) as {
      id: number;
      kind: StoryEvent["kind"];
      payload: string;
      created: number;
    }[];
    const events = rows
      .slice(0, limit)
      .map((x) => ({ ...x, payload: JSON.parse(x.payload) }));
    const last = this.db
      .prepare(
        "SELECT payload FROM events WHERE kind='donation' AND id<=? AND id>? AND run_id=? ORDER BY id DESC LIMIT 1",
      )
      .get(cutoff, reset, runId) as { payload: string } | undefined;

    return {
      config,
      eventKey: runId,
      events,
      cutoff,
      after: events.at(-1)?.id ?? Math.max(after, reset),
      more: rows.length > limit,
      finalTotal: last ? JSON.parse(last.payload).total : 0,
    };
  }
  feed(
    before = Number.MAX_SAFE_INTEGER,
    cutoff = this.state().eventId,
    limit = 50,
    runId = this.metadata("eventKey")!,
  ): FeedPage {
    // Share a rebuildable projection across viewers of the same fixed snapshot.
    const cached = this.feedCache.get(runId);
    let projection = cached?.cutoff === cutoff ? cached.projection : undefined;
    if (!projection) {
      projection = new ContributionFeed();
      let page = this.history(0, cutoff, 200, runId);
      for (;;) {
        for (const event of page.events) projection.apply(event);
        if (!page.more) break;
        page = this.history(page.after, cutoff, 200, runId);
      }
      if (this.feedCache.size >= 4 && !this.feedCache.has(runId))
        this.feedCache.delete(this.feedCache.keys().next().value!);
      this.feedCache.set(runId, { cutoff, projection });
    }
    const rows = projection.rows(before, limit + 1);
    const entries = rows.slice(0, limit);
    return {
      eventKey: runId,
      cutoff,
      entries,
      more: rows.length > limit,
      before: entries.at(-1)?.firstId ?? before,
    };
  }
  close() {
    this.db.close();
  }
}
