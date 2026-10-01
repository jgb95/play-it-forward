import "dotenv/config";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const mode = process.env.PAYMENT_MODE ?? "demo";
if (!["demo", "signet", "mainnet"].includes(mode))
  throw Error("Invalid network");
const dir = process.argv[2];
if (!dir) throw Error("Usage: pnpm backup /secure/backup/directory");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(
  resolve(process.env.DATA_DIR ?? "data", mode + ".sqlite"),
  { readOnly: true },
);
const destination = resolve(dir, mode + "-" + Date.now() + ".sqlite");
await backup(db, destination);
db.close();
console.log("Ledger backup completed: " + destination);
