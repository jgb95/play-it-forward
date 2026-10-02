import express from "express";
import {
  randomUUID,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { resolve } from "node:path";
import type {
  Config,
  Observation,
  AccelerationAttempt,
} from "../shared/model.ts";
import { contributionSchema } from "../shared/model.ts";
import {
  defaultPresentation,
  presentationSchema,
} from "../shared/presentation.ts";
import {
  MempoolAccelerator,
  SimulatedAccelerator,
  type Accelerator,
} from "./acceleration.ts";
import { MovieDirector } from "./movie.ts";
import { Store } from "./store.ts";
import { Withdrawals } from "./withdrawals.ts";
import { BarkAdapter } from "./payments.ts";
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
    accelerator?: Accelerator;
    accelerationEnabled?: boolean;
  } = {},
) {
  const withdrawals =
    adapter instanceof BarkAdapter
      ? new Withdrawals(store, adapter)
      : undefined;
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
  const accelerator =
    options.accelerator ??
    (store.mode === "demo"
      ? new SimulatedAccelerator(store.config.goal)
      : new MempoolAccelerator());
  const accelerationEnabled =
    store.mode === "demo" || options.accelerationEnabled === true;
  const invoiceLocks = new Set<string>();
  let accelerationError: string | null = null;
  const publishStory = (event: ReturnType<Store["journal"]> | null) => {
    if (
      event &&
      (event.payload.requestId
        ? store.requestRun(event.payload.requestId) === state().eventKey
        : event.payload.txid
          ? store
              .observations()
              .some(
                (o) =>
                  o.txid === event.payload.txid &&
                  store.requestRun(o.requestId) === state().eventKey,
              )
          : true)
    )
      broadcast(
        event.kind === "acceleration" ? "acceleration" : "onchain",
        { event, state: state() },
        event.id,
      );
  };
  function observe(value: Observation) {
    publishStory(store.observe(value));
  }
  function attempt(value: AccelerationAttempt) {
    publishStory(store.setAttempt(value));
  }
  function attributable(requestId: string, txid: string) {
    const output = store
      .observations()
      .find(
        (x) =>
          x.requestId === requestId &&
          x.txid === txid &&
          x.status === "pending",
      );
    if (!output)
      throw Error("No verified pending output for this contribution");
    return output;
  }
  async function prepareInvoice(requestId: string, quoteId: string) {
    const q = store.getQuote(quoteId);
    if (!q || q.requestId !== requestId || q.expires <= Date.now())
      throw Error("Express quote expired; request a new quote");
    attributable(requestId, q.txid);
    if (invoiceLocks.has(q.txid))
      throw Error("Express invoice is being prepared; please retry");
    invoiceLocks.add(q.txid);
    try {
      const existing = store.attempt(q.txid);
      if (existing?.status === "accepted" || existing?.status === "confirmed")
        throw Error("This transaction already has Express delivery");
      if (existing?.status === "invoice" && existing.expires > Date.now()) {
        if (existing.totalSats !== q.totalSats)
          throw Error(
            "An active invoice has a different price; wait for it to expire",
          );
        return existing;
      }
      const value = await accelerator.invoice(q);
      attributable(requestId, q.txid); // It may have confirmed while the provider was responding.
      attempt(value);
      return value;
    } finally {
      invoiceLocks.delete(q.txid);
    }
  }

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
    if (event && event.runId === state().eventKey)
      broadcast("donation", { event, state: state() }, event.id);
    return event;
  };
  async function reconcile() {
    if (syncing) return;
    syncing = true;
    try {
      const identity = await adapter.health?.();
      if (identity) store.bindWallet(identity);
      const requests = store.all();
      if (adapter.inspect)
        for (const output of await adapter.inspect(requests)) {
          const a = store.attempt(output.txid);
          observe({
            ...output,
            ...(a?.status === "accepted"
              ? { acceleration: "accepted" as const }
              : {}),
            ...(a?.status === "failed"
              ? { acceleration: "failed" as const }
              : {}),
          });
          if (output.status === "confirmed" && a && a.status !== "confirmed")
            attempt({ ...a, status: "confirmed" });
        }
      for (const r of await adapter.reconcile(requests)) credit(r);
      if (accelerationEnabled)
        for (const a of store.attempts()) {
          if (!["invoice", "accepted"].includes(a.status)) continue;
          try {
            const status = await accelerator.status(a);
            attempt({ ...a, status });
            if (status === "accepted" || status === "failed")
              for (const o of store
                .observations()
                .filter((o) => o.txid === a.txid && o.status === "pending"))
                observe({ ...o, acceleration: status });
            accelerationError = null;
          } catch (e) {
            accelerationError = (e as Error).message;
          }
        }
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
    res.json({
      config: store.config,
      state: state(),
      presentation,
      accelerationEnabled,
    }),
  );
  app.get("/api/history", (req, res) => {
    const after = Number(req.query.after ?? 0),
      cutoff = Number(req.query.cutoff ?? state().eventId);
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isSafeInteger(cutoff) ||
      cutoff < 0 ||
      cutoff > state().eventId
    ) {
      res.status(400).json({ error: "Invalid history cursor" });
      return;
    }
    const runId =
      req.query.run === "featured"
        ? (store.metadata("featuredRun") ?? state().eventKey)
        : String(req.query.run ?? state().eventKey);
    try {
      res.json(store.history(after, cutoff, 200, runId));
    } catch {
      res.status(404).json({ error: "Run not found" });
    }
  });
  app.get("/api/feed", (req, res) => {
    const before = Number(req.query.before ?? Number.MAX_SAFE_INTEGER);
    const cutoff = Number(req.query.cutoff ?? state().eventId);
    const limit = Number(req.query.limit ?? 50);
    if (
      ![before, cutoff, limit].every(Number.isSafeInteger) ||
      before < 0 ||
      cutoff < 0 ||
      cutoff > state().eventId ||
      limit < 1 ||
      limit > 100
    ) {
      res.status(400).json({ error: "Invalid feed cursor" });
      return;
    }
    const run =
      req.query.run === "featured"
        ? (store.metadata("featuredRun") ?? state().eventKey)
        : String(req.query.run ?? state().eventKey);
    try {
      res.json(store.feed(before, cutoff, limit, run));
    } catch {
      res.status(404).json({ error: "Run not found" });
    }
  });
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
      if (store.eventMode() === "archive") {
        res
          .status(409)
          .json({ error: "The event has ended. Enjoy the community replay." });
        return;
      }
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
      const runId = state().eventKey;
      const identity = await adapter.health?.();
      if (identity) store.bindWallet(identity);
      const c = await adapter.create(
        parsed.data.amount,
        parsed.data.name,
        parsed.data.method,
      );
      store.add(c, runId);
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
  app.post(
    "/api/contributions/:id/acceleration/quote",
    async (req, res, next) => {
      try {
        if (!accelerationEnabled) {
          res.status(503).json({
            error:
              "Live Express is awaiting its integration check. Your payment confirms normally.",
          });
          return;
        }
        const txid = String(req.body.txid ?? "");
        attributable(req.params.id, txid);
        const q = await accelerator.quote(txid, req.params.id);
        store.quote(q);
        res.json(q);
      } catch (e) {
        next(e);
      }
    },
  );
  app.post(
    "/api/contributions/:id/acceleration/invoice",
    async (req, res, next) => {
      try {
        if (!accelerationEnabled) {
          res.status(503).json({ error: "Live Express is not enabled" });
          return;
        }
        res.json(
          await prepareInvoice(req.params.id, String(req.body.quoteId ?? "")),
        );
      } catch (e) {
        next(e);
      }
    },
  );
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
      accelerationEnabled,
      accelerationError,
      lastSync,
      syncError,
      screenConnections: clients.size,
      state: state(),
      presentation,
      movie: movie.status(Date.now()),
      runs: store.runs(),
      withdrawalsEnabled: !!withdrawals,
      withdrawals: withdrawals?.list() ?? [],
      liveReady: store.mode === "mainnet" && !syncError && lastSync !== null,
    }),
  );
  app.post("/api/admin/event-mode", (req, res) => {
    if (!["live", "archive"].includes(req.body.mode)) {
      res.status(400).json({ error: "Choose live or archive" });
      return;
    }
    store.setEventMode(req.body.mode);
    broadcast("snapshot", state(), state().eventId);
    res.json(state());
  });
  app.post("/api/admin/runs", (req, res) => {
    try {
      movie.stop();
      stagedMovie = undefined;
      store.startRun(String(req.body.name ?? ""));
      broadcast("reset", state(), state().eventId);
      res.json(store.runs());
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  app.post("/api/admin/runs/feature", (req, res) => {
    try {
      store.featureRun(String(req.body.id));
      res.json(store.runs());
    } catch {
      res.status(404).json({ error: "Run not found" });
    }
  });
  app.get("/api/admin/wallet", async (_req, res) => {
    try {
      if (!withdrawals)
        throw Error("Real wallet withdrawals are unavailable in rehearsal");
      res.json(await withdrawals.balances());
    } catch (e) {
      res.status(503).json({ error: (e as Error).message });
    }
  });
  app.post("/api/admin/withdrawals/preview", async (req, res) => {
    try {
      if (!withdrawals) throw Error("Simulation cannot withdraw real funds");
      if (req.body.kind !== undefined && req.body.kind !== "all")
        throw Error("Withdrawals always use the whole wallet");
      res.json(
        await withdrawals.preview("all", String(req.body.destination ?? "")),
      );
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  app.post("/api/admin/withdrawals/send", async (req, res) => {
    try {
      if (!withdrawals || req.body.confirm !== "SEND")
        throw Error("Confirm the reviewed withdrawal explicitly");
      res.json(await withdrawals.send(String(req.body.id)));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  async function demoDetection(amount: number, name: string) {
    const parsed = contributionSchema.parse({
      amount,
      name,
      method: "bitcoin",
    });
    const c = await adapter.create(parsed.amount, parsed.name, "bitcoin");
    store.add(c);
    const txid = randomBytes(32).toString("hex");
    const o: Observation = {
      key: `bitcoin:${txid}:0`,
      txid,
      requestId: c.id,
      amount: c.amount,
      name: c.name,
      status: "pending",
    };
    observe(o);
    return o;
  }
  async function demoAction(action: string, key: string) {
    const o = store.observations().find((x) => x.key === key);
    if (!o) throw Error("Unknown rehearsal output");
    if (action === "confirm") {
      if (o.status === "replaced" || o.status === "dropped")
        throw Error("This output is no longer active");
      observe({ ...o, status: "confirmed" });
      const a = store.attempt(o.txid);
      if (a) attempt({ ...a, status: "confirmed" });
      credit({ key: o.key, requestId: o.requestId, amount: o.amount });
    } else if (action === "quote") {
      if (o.status !== "pending")
        throw Error("Only pending outputs can use Express");
      const q = await accelerator.quote(o.txid, o.requestId);
      store.quote(q);
      return q;
    } else if (action === "invoice") {
      const q = await accelerator.quote(o.txid, o.requestId);
      store.quote(q);
      return prepareInvoice(o.requestId, q.id);
    } else if (action === "accept" || action === "fail") {
      if (o.status !== "pending")
        throw Error("Only pending outputs can use Express");
      const a = store.attempt(o.txid);
      if (!a) throw Error("Create an Express invoice first");
      const status = action === "accept" ? "accepted" : "failed";
      attempt({ ...a, status });
      observe({ ...o, acceleration: status });
    } else if (action === "replace") {
      if (o.status !== "pending")
        throw Error("Only pending outputs can be replaced");
      const txid = randomBytes(32).toString("hex");
      observe({ ...o, status: "replaced", replacement: txid });
      observe({
        ...o,
        key: `bitcoin:${txid}:0`,
        txid,
        acceleration: undefined,
      });
    } else if (action === "drop") {
      if (o.status !== "pending")
        throw Error("Only pending outputs can be dropped");
      observe({ ...o, status: "dropped" });
    } else throw Error("Unknown rehearsal action");
    return store.get(o.requestId);
  }
  app.post("/api/admin/onchain", async (req, res, next) => {
    try {
      if (store.mode !== "demo") {
        res
          .status(403)
          .json({ error: "Rehearsal only; live receipts cannot be simulated" });
        return;
      }
      res.json(
        req.body.action === "detect"
          ? await demoDetection(
              req.body.amount,
              req.body.name ?? "Berlin supporter",
            )
          : await demoAction(req.body.action, req.body.key),
      );
    } catch (e) {
      next(e);
    }
  });
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
    stagedMovie = undefined;
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
      res.status(403).json({
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
          stagedMovie = undefined;
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
  let stagedMovie:
    | {
        index: number;
        observation: Observation;
        express: boolean;
        stage: number;
      }
    | undefined;
  let movieTicking = false;
  const movieTimer = setInterval(async () => {
    if (movieTicking || store.mode !== "demo") return;
    movieTicking = true;
    try {
      const preview = movie.preview(Date.now(), state().total);
      if (
        preview &&
        preview.amount > 0 &&
        preview.method === "bitcoin" &&
        preview.remaining <= Math.min(1500, preview.interval * 0.7)
      ) {
        if (!stagedMovie || stagedMovie.index !== preview.index)
          stagedMovie = {
            index: preview.index,
            observation: await demoDetection(
              preview.amount,
              "A friend on the Mempool platform",
            ),
            express: preview.express,
            stage: 0,
          };
        if (
          stagedMovie.express &&
          stagedMovie.stage === 0 &&
          preview.remaining <= preview.interval * 0.4
        ) {
          await demoAction("invoice", stagedMovie.observation.key);
          stagedMovie.stage = 1;
        }
        if (
          stagedMovie.express &&
          stagedMovie.stage === 1 &&
          preview.remaining <= preview.interval * 0.2
        ) {
          await demoAction("accept", stagedMovie.observation.key);
          stagedMovie.stage = 2;
        }
      }
      const method = preview?.method ?? "lightning";
      const amount = movie.due(Date.now(), state().total);
      if (amount > 0) {
        if (stagedMovie && method === "bitcoin") {
          if (stagedMovie.observation.amount !== amount) {
            // A manual gift changed the target during staging.
            await demoAction("drop", stagedMovie.observation.key);
            const replacement = await demoDetection(
              amount,
              "Berlin movie crew",
            );
            await demoAction("confirm", replacement.key);
          } else await demoAction("confirm", stagedMovie.observation.key);
          stagedMovie = undefined;
        } else {
          const c = await adapter.create(amount, "Berlin movie crew", method);
          store.add(c);
          credit({ key: "demo:" + c.id, requestId: c.id, amount: c.amount });
        }
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
