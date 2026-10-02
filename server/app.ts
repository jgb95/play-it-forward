import express from "express";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Config } from "../shared/model.ts";
import { contributionSchema } from "../shared/model.ts";
import {
  defaultPresentation,
  presentationSchema,
} from "../shared/presentation.ts";
import { MovieDirector } from "./movie.ts";
import { Store } from "./store.ts";
import type { PaymentAdapter } from "./payments.ts";
export function createApp(
  store: Store,
  adapter: PaymentAdapter,
  adminToken: string,
  options: {
    serveStatic?: boolean;
    reconcileMs?: number;
    rehearsal?: express.Express;
    cookiePath?: string;
  } = {},
) {
  const app = express();
  if (options.rehearsal) app.use("/rehearsal", options.rehearsal);
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(express.json({ limit: "4kb" }));
  const sessions = new Map<string, number>(),
    limits = new Map<string, { count: number; until: number }>(),
    clients = new Set<express.Response>();
  let lastSync: number | null = null,
    syncError: string | null = null,
    syncing = false;
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Cache-Control": "no-store",
    });
    if (req.path.startsWith("/api")) {
      const key =
        (req.ip ?? "local") +
        ":" +
        (req.path.includes("login") ? "login" : "api");
      const now = Date.now();
      let l = limits.get(key);
      if (!l || l.until < now) {
        l = { count: 0, until: now + 60000 };
        limits.set(key, l);
      }
      const max = req.path.includes("login") ? 10 : 600;
      if (++l.count > max) {
        res.status(429).json({ error: "Please wait a moment and try again." });
        return;
      }
      if (
        req.method === "POST" &&
        req.get("origin") &&
        req.get("origin") !== new URL(store.config.publicUrl).origin
      ) {
        res.status(403).json({ error: "Origin rejected" });
        return;
      }
    }
    next();
  });
  let presentation = { ...defaultPresentation };
  const movie = new MovieDirector();
  const state = () => store.state();
  const send = (
    res: express.Response,
    event: string,
    payload: unknown,
    id?: number,
  ) => {
    if (res.writableLength > 256000) {
      res.end();
      return;
    }
    res.write(
      `${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
    );
  };
  const broadcast = (event: string, payload: unknown, id?: number) =>
    clients.forEach((res) => send(res, event, payload, id));
  const credit = (receipt: Parameters<Store["credit"]>[0]) => {
    const event = store.credit(receipt);
    if (event) broadcast("donation", { event, state: state() }, event.id);
    return event;
  };
  async function reconcile() {
    if (syncing) return;
    syncing = true;
    try {
      const identity = await adapter.health?.();
      if (identity) store.bindWallet(identity);
      for (const r of await adapter.reconcile(store.all())) credit(r);
      lastSync = Date.now();
      syncError = null;
    } catch (e) {
      syncError =
        e instanceof Error ? e.message : "Payment service unavailable";
    } finally {
      syncing = false;
    }
  }
  app.get("/api/state", (_req, res) =>
    res.json({ config: store.config, state: state(), presentation }),
  );
  app.get("/api/events", (req, res) => {
    if (clients.size >= 150) {
      res.status(503).end();
      return;
    }
    res.set({
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const current = state();
    const after = Number(
      req.get("last-event-id") ?? req.query.after ?? current.eventId,
    );
    if (
      Number.isSafeInteger(after) &&
      after >= 0 &&
      current.eventId - after <= 20
    ) {
      for (const e of store.events(after))
        send(
          res,
          "catchup",
          { kind: e.kind, event: JSON.parse(e.payload) },
          e.id,
        );
    }
    send(res, "snapshot", current, current.eventId);
    send(res, "presentation", presentation);
    clients.add(res);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
  });
  app.post("/api/contributions", async (req, res, next) => {
    try {
      const parsed = contributionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error:
            "Enter whole sats (1–1,000,000,000), a name up to 32 characters, and a payment method.",
        });
        return;
      }
      if (!store.config.methods.includes(parsed.data.method)) {
        res.status(400).json({ error: "Payment method is disabled" });
        return;
      }
      const identity = await adapter.health?.();
      if (identity) store.bindWallet(identity);
      const c = await adapter.create(
        parsed.data.amount,
        parsed.data.name,
        parsed.data.method,
      );
      store.add(c);
      res.status(201).json(c);
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/contributions/:id", (req, res) => {
    const c = store.get(req.params.id);
    if (!c) {
      res.status(404).json({ error: "Contribution not found" });
      return;
    }
    res.json(c);
  });
  app.post("/api/contributions/:id/simulate", (req, res) => {
    if (store.mode !== "demo") {
      res
        .status(403)
        .json({ error: "Simulation is disabled for real payments" });
      return;
    }
    const c = store.get(req.params.id);
    if (!c) {
      res.status(404).end();
      return;
    }
    credit({ key: "demo:" + c.id, requestId: c.id, amount: c.amount });
    res.json(store.get(c.id));
  });
  app.post("/api/admin/login", (req, res) => {
    const a = createHash("sha256")
        .update(String(req.body.token ?? ""))
        .digest(),
      b = createHash("sha256").update(adminToken).digest();
    if (!timingSafeEqual(a, b)) {
      res.status(401).json({ error: "Incorrect operator token" });
      return;
    }
    const token = randomBytes(32).toString("hex");
    sessions.set(token, Date.now() + 8 * 3600000);
    res.setHeader(
      "Set-Cookie",
      `pif_session=${token}; HttpOnly; SameSite=Strict; Path=${options.cookiePath ?? "/api/admin"}; Max-Age=28800${store.config.publicUrl.startsWith("https:") ? "; Secure" : ""}`,
    );
    res.json({ ok: true });
  });
  app.use("/api/admin", (req, res, next) => {
    const token = req
      .get("cookie")
      ?.split("; ")
      .find((x) => x.startsWith("pif_session="))
      ?.slice(12);
    if (!token || !sessions.has(token) || sessions.get(token)! < Date.now()) {
      res.status(401).json({ error: "Operator login required" });
      return;
    }
    next();
  });
  app.get("/api/admin/health", (_req, res) =>
    res.json({
      mode: store.mode,
      lastSync,
      syncError,
      screenConnections: clients.size,
      state: state(),
      presentation,
      movie: movie.status(Date.now()),
      liveReady: store.mode === "mainnet" && !syncError && lastSync !== null,
    }),
  );
  app.post("/api/admin/logout", (req, res) => {
    const token = req
      .get("cookie")
      ?.split("; ")
      .find((x) => x.startsWith("pif_session="))
      ?.slice(12);
    if (token) sessions.delete(token);
    res.setHeader(
      "Set-Cookie",
      `pif_session=; HttpOnly; SameSite=Strict; Path=${options.cookiePath ?? "/api/admin"}; Max-Age=0`,
    );
    res.json({ ok: true });
  });
  app.post("/api/admin/reset", (_req, res) => {
    if (store.mode !== "demo") {
      res.status(403).json({ error: "Live funds cannot be reset" });
      return;
    }
    movie.stop();
    store.reset();
    broadcast("reset", state(), state().eventId);
    res.json(state());
  });
  app.post("/api/admin/simulate", async (req, res, next) => {
    try {
      if (store.mode !== "demo") {
        res
          .status(403)
          .json({ error: "Simulation is disabled for real payments" });
        return;
      }
      const count = Number(req.body.count ?? 1);
      if (!Number.isInteger(count) || count < 1 || count > 100) {
        res.status(400).json({ error: "Burst size must be 1–100" });
        return;
      }
      const d = contributionSchema.safeParse({
        amount: req.body.amount,
        name: req.body.name ?? "Berlin community",
        method: "lightning",
      });
      if (!d.success) {
        res.status(400).json({ error: "Invalid amount or name" });
        return;
      }
      for (let i = 0; i < count; i++) {
        const c = await adapter.create(d.data.amount, d.data.name, "lightning");
        store.add(c);
        credit({ key: "demo:" + c.id, requestId: c.id, amount: c.amount });
      }
      res.json(state());
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/admin/presentation", (req, res) => {
    const parsed = presentationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid presentation settings" });
      return;
    }
    presentation = { ...parsed.data, skip: presentation.skip };
    broadcast("presentation", presentation);
    res.json(presentation);
  });
  app.post("/api/admin/skip", (_req, res) => {
    presentation.skip++;
    broadcast("presentation", presentation);
    res.json(presentation);
  });
  app.post("/api/admin/movie", (req, res) => {
    if (store.mode !== "demo") {
      res
        .status(403)
        .json({
          error: "Movie simulation is only available in rehearsal/demo",
        });
      return;
    }
    const now = Date.now();
    try {
      switch (req.body.action) {
        case "start":
          if (movie.status(now).running)
            throw Error("Stop the current movie first");
          movie.start(now, req.body.duration, state().total, store.config);
          break;
        case "pause":
          movie.pause(now);
          break;
        case "resume":
          movie.resume(now);
          break;
        case "stop":
          movie.stop();
          break;
        default:
          res.status(400).json({ error: "Unknown movie action" });
          return;
      }
      res.json(movie.status(now));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  let movieTicking = false;
  const movieTimer = setInterval(async () => {
    if (movieTicking || store.mode !== "demo") return;
    movieTicking = true;
    try {
      const amount = movie.due(Date.now(), state().total);
      if (amount > 0) {
        const c = await adapter.create(
          amount,
          "Berlin movie crew",
          "lightning",
        );
        store.add(c);
        credit({ key: "demo:" + c.id, requestId: c.id, amount: c.amount });
      }
    } catch {
      movie.stop();
    } finally {
      movieTicking = false;
    }
  }, 250);
  app.post("/api/admin/reconcile", async (_req, res) => {
    await reconcile();
    res.json({ lastSync, syncError });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Unknown API route" }),
  );
  if (options.serveStatic !== false) {
    const dir = resolve("dist");
    app.use(express.static(dir, { maxAge: "1h" }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(dir, "index.html")),
    );
  }
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(503).json({
        error:
          error instanceof SyntaxError
            ? "Invalid request body"
            : "Payment service is unavailable. Please try again shortly.",
      });
    },
  );
  const interval = setInterval(() => {
    void reconcile();
    const now = Date.now();
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    for (const [k, v] of sessions) if (v < now) sessions.delete(k);
  }, options.reconcileMs ?? 5000);
  void reconcile();
  return {
    app,
    reconcile,
    close: () => {
      clearInterval(interval);
      clearInterval(movieTimer);
      clients.forEach((res) => res.end());
    },
  };
}
