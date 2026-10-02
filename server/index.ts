import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configSchema } from "../shared/model.ts";
import { Store } from "./store.ts";
import { SimulationAdapter, BarkAdapter } from "./payments.ts";
import { createApp } from "./app.ts";
const config = configSchema.parse(
  JSON.parse(readFileSync(process.env.CONFIG_PATH ?? "config.json", "utf8")),
);
if (process.env.PUBLIC_URL)
  config.publicUrl = new URL(process.env.PUBLIC_URL).origin;
const mode = process.env.PAYMENT_MODE ?? "demo";
if (!["demo", "signet", "mainnet"].includes(mode))
  throw Error("PAYMENT_MODE must be demo, signet or mainnet");
const token = process.env.ADMIN_TOKEN;
if (!token || token.length < 24)
  throw Error("Set ADMIN_TOKEN to a random token of at least 24 characters");
if (
  mode === "mainnet" &&
  (process.env.LIVE_PAYMENTS_ENABLED !== "true" ||
    !config.publicUrl.startsWith("https://"))
)
  throw Error(
    "Mainnet requires LIVE_PAYMENTS_ENABLED=true and a public HTTPS URL",
  );
if (mode !== "demo" && !process.env.BARK_TOKEN)
  throw Error("BARK_TOKEN is required");
const store = new Store(
  resolve(process.env.DATA_DIR ?? "data", mode + ".sqlite"),
  config,
  mode as "demo" | "signet" | "mainnet",
);
const adapter =
  mode === "demo"
    ? new SimulationAdapter()
    : new BarkAdapter(
        process.env.BARK_URL ?? "http://127.0.0.1:3001",
        process.env.BARK_TOKEN!,
        mode as "signet" | "mainnet",
      );
const rehearsalStore = new Store(
  resolve(process.env.DATA_DIR ?? "data", "rehearsal.sqlite"),
  config,
  "demo",
);
const rehearsal = createApp(rehearsalStore, new SimulationAdapter(), token, {
  cookiePath: "/rehearsal/api/admin",
});
const runtime = createApp(store, adapter, token, { rehearsal: rehearsal.app });
const server = runtime.app.listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST ?? "127.0.0.1",
  () =>
    console.log(
      `Play It Forward · ${mode} · http://127.0.0.1:${process.env.PORT ?? 3000}`,
    ),
);
function shutdown() {
  runtime.close();
  rehearsal.close();
  server.close(() => {
    store.close();
    rehearsalStore.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
