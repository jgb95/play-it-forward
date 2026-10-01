import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Config, Contribution, Receipt, State } from "../shared/model.ts";
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
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,payload TEXT NOT NULL,created INTEGER NOT NULL);`);
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
      this.db.exec("DELETE FROM receipts; DELETE FROM requests");
      this.db
        .prepare("INSERT INTO events(kind,payload,created) VALUES(?,?,?)")
        .run("reset", "{}", Date.now());
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
