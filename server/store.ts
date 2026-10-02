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
import { progression } from "../shared/model.ts";
export class Store {
  db: DatabaseSync;
  constructor(
    path: string,
    public config: Config,
    public mode: State["mode"],
  ) {
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
  add(c: Contribution) {
    this.db
      .prepare("INSERT INTO requests VALUES(?,?,?,?,?,?,?,?)")
      .run(
        c.id,
        c.amount,
        c.name,
        c.method,
        c.destination,
        c.uri,
        c.expires,
        c.created,
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
  state(): State {
    const s = this.db
      .prepare(
        "SELECT COALESCE(SUM(amount),0) total,COUNT(*) count FROM receipts",
      )
      .get()!;
    const total = Number(s.total);
    return {
      total,
      count: Number(s.count),
      ...progression(total, this.config),
      eventId: Number(
        this.db.prepare("SELECT COALESCE(MAX(id),0) id FROM events").get()!.id,
      ),
      mode: this.mode,
      eventMode: this.eventMode(),
      eventKey: this.metadata("eventKey")!,
      onchain: this.observations().filter((x) => x.status === "pending"),
    };
  }
  credit(r: Receipt) {
    if (!Number.isSafeInteger(r.amount) || r.amount <= 0)
      throw Error("Invalid verified receipt");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const request = this.get(r.requestId);
      if (!request) throw Error("Unknown contribution");
      const before = this.state();
      if (!Number.isSafeInteger(before.total + r.amount))
        throw Error("Pool exceeds safe integer range");
      const changed = this.db
        .prepare("INSERT OR IGNORE INTO receipts VALUES(?,?,?)")
        .run(r.key, r.requestId, r.amount).changes;
      if (!changed) {
        this.db.exec("COMMIT");
        return null;
      }
      const after = this.state();
      const payload = {
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
          .prepare("INSERT INTO events(kind,payload,created) VALUES(?,?,?)")
          .run("donation", JSON.stringify(payload), Date.now()).lastInsertRowid,
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
        "SELECT id,kind,payload FROM events WHERE id>? ORDER BY id LIMIT 200",
      )
      .all(after) as unknown as { id: number; kind: string; payload: string }[];
  }
  reset() {
    if (this.mode !== "demo")
      throw Error("Reset is available only in demo mode");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(
        "DELETE FROM receipts; DELETE FROM requests; DELETE FROM observations; DELETE FROM acceleration_quotes; DELETE FROM accelerations",
      );
      this.db
        .prepare("UPDATE metadata SET value=? WHERE key='storyConfig'")
        .run(JSON.stringify(this.config));
      this.db
        .prepare("UPDATE metadata SET value=? WHERE key='eventKey'")
        .run(randomUUID());
      this.db
        .prepare("INSERT INTO events(kind,payload,created) VALUES(?,?,?)")
        .run("reset", "{}", Date.now());
      this.db.exec("COMMIT");
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
  journal(kind: StoryEvent["kind"], payload: unknown) {
    const created = Date.now();
    const id = Number(
      this.db
        .prepare("INSERT INTO events(kind,payload,created) VALUES(?,?,?)")
        .run(kind, JSON.stringify(payload), created).lastInsertRowid,
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
  history(after = 0, cutoff = this.state().eventId, limit = 200): HistoryPage {
    const reset = Number(
      this.db
        .prepare(
          "SELECT COALESCE(MAX(id),0) id FROM events WHERE kind='reset' AND id<=?",
        )
        .get(cutoff)!.id,
    );
    const rows = this.db
      .prepare(
        "SELECT id,kind,payload,created FROM events WHERE id>? AND id<=? ORDER BY id LIMIT ?",
      )
      .all(Math.max(after, reset), cutoff, limit + 1) as {
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
        "SELECT payload FROM events WHERE kind='donation' AND id<=? AND id>? ORDER BY id DESC LIMIT 1",
      )
      .get(cutoff, reset) as { payload: string } | undefined;
    const config = JSON.parse(this.metadata("storyConfig")!);
    config.publicUrl = this.config.publicUrl;
    return {
      config,
      eventKey: this.metadata("eventKey")!,
      events,
      cutoff,
      after: events.at(-1)?.id ?? Math.max(after, reset),
      more: rows.length > limit,
      finalTotal: last ? JSON.parse(last.payload).total : 0,
    };
  }
  close() {
    this.db.close();
  }
}
