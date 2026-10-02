import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  configSchema,
  progression,
  recruitmentThreshold,
  type StoryEvent,
} from "../shared/model.ts";
import { Store } from "../server/store.ts";
import { SimulationAdapter } from "../server/payments.ts";
import { createApp } from "../server/app.ts";
import { RecapTimeline, ReplayReader } from "../src/playback.ts";
import { MovieDirector } from "../server/movie.ts";
import {
  MempoolAccelerator,
  SimulatedAccelerator,
  verifyAccelerationInvoice,
} from "../server/acceleration.ts";
const original = JSON.parse(readFileSync("config.json", "utf8"));
const config = configSchema.parse({
  ...original,
  goal: 107,
  chapters: original.chapters.map((c: any, i: number) => ({
    ...c,
    threshold: [0, 9, 24, 39, 62, 83][i],
  })),
});
test("odd configurable midpoints recruit each permanent member exactly once; gift count is irrelevant", () => {
  for (let i = 0; i < 6; i++) {
    const mid = recruitmentThreshold(config, i);
    assert.equal(progression(mid - 1, config).crew.length, i);
    assert.equal(progression(mid, config).crew.length, i + 1);
  }
  assert.equal(progression(config.goal, config).crew.length, 6);
  assert.equal(progression(config.goal + 1, config).progress, 1);
  assert.throws(() =>
    configSchema.parse({
      ...config,
      chapters: config.chapters.map((c) => ({
        ...c,
        recruit: config.chapters[0].recruit,
      })),
    }),
  );
});
test("recap travels each earned portion naturally, lasts at most 30 seconds and acknowledges all 100 receipts", () => {
  const events: StoryEvent[] = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    kind: "donation",
    created: i * 999999,
    payload: { amount: 1, total: i + 1, name: "x" },
  }));
  const recap = new RecapTimeline(config, 100, events);
  assert.ok(recap.duration <= 30);
  assert.equal(recap.sample(0).progress, 0);
  const pulses = [];
  for (let t = 0; t <= recap.duration + 0.1; t += 0.05)
    pulses.push(...recap.due(t));
  assert.equal(pulses.length, 100);
  for (let ch = 0; ch < 6; ch++) {
    const samples = [];
    for (let t = 0; t < recap.duration; t += 0.01) {
      const p = recap.sample(t);
      if (p.chapter === ch) samples.push(p.progress);
    }
    assert.ok(samples.some((x) => x > 0 && x < 0.5));
  }
  const reader = new ReplayReader(events);
  const got = [];
  for (let t = 0; t < 200; t++) {
    const e = reader.next(t, true, 1);
    if (e) got.push(e.id);
  }
  assert.deepEqual(
    got,
    events.map((e) => e.id),
  );
});
test("movie includes every midpoint and threshold and reaches alternate goal exactly", () => {
  const movie = new MovieDirector();
  movie.start(1, 30, 0, config);
  let total = 0;
  const points = [];
  for (let t = 1; t <= 31001; t += 100) {
    const gift = movie.due(t, total);
    if (gift) {
      total += gift;
      points.push(total);
    }
  }
  assert.equal(total, config.goal);
  for (let i = 0; i < 6; i++)
    assert.ok(points.includes(recruitmentThreshold(config, i)));
});
test("pending journal deduplicates polls; fixed replay cutoff excludes late archive receipts and leaves ledger unchanged", async () => {
  const store = new Store(":memory:", config, "demo");
  const c = await new SimulationAdapter().create(15, "Alice", "bitcoin");
  store.add(c);
  const o = {
    key: "bitcoin:abc:0",
    txid: "abc",
    requestId: c.id,
    amount: 15,
    name: "Alice",
    status: "pending" as const,
  };
  assert.ok(store.observe(o));
  assert.equal(store.observe(o), null);
  assert.equal(store.state().total, 0);
  store.credit({ key: o.key, requestId: c.id, amount: 15 });
  const cutoff = store.state().eventId;
  store.setEventMode("archive");
  store.credit({ key: "late", requestId: c.id, amount: 7 });
  const h = store.history(0, cutoff, 1);
  assert.equal(h.finalTotal, 15);
  assert.equal(h.more, true);
  assert.equal(store.history(h.after, cutoff).events.length, 1);
  assert.equal(store.state().total, 22);
  assert.equal(store.history().finalTotal, 22);
  store.close();
});
test("Express includes complete lowest price and rejects changed price or mismatched invoice", async () => {
  const sim = new SimulatedAccelerator(100000);
  const good = await sim.invoice(await sim.quote("tx", "c"));
  assert.throws(() =>
    verifyAccelerationInvoice(good.invoice, good.totalSats + 1),
  );
  let fee = 100;
  const bodies: any[] = [];
  const adapter = new MempoolAccelerator((async (_: any, init: any) => {
    if (init.body) bodies.push(JSON.parse(init.body));
    return new Response(
      JSON.stringify({
        options: [{ fee: 300 }, { fee }],
        mempoolBaseFee: 20,
        vsizeFee: 30,
        availablePaymentMethods: { bitcoin: { enabled: true } },
      }),
    );
  }) as typeof fetch);
  const q = await adapter.quote("tx", "c");
  assert.equal(q.totalSats, 150);
  assert.equal(q.serviceSats, 50);
  assert.equal(q.boostSats, 100);
  assert.deepEqual(bodies[0], { txInput: "tx" });
  fee = 101;
  await assert.rejects(adapter.invoice(q), /price changed/);
  await assert.rejects(adapter.invoice({ ...q, expires: 0 }), /expired/);
});
test("rehearsal pending Express confirmation is once-only; archive closes new checkout while late status remains", async () => {
  const store = new Store(":memory:", config, "demo");
  const runtime = createApp(
    store,
    new SimulationAdapter(),
    "long-enough-operator-token-for-tests",
    { serveStatic: false },
  );
  const server = runtime.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + (server.address() as any).port + "/api";
  let cookie = "";
  const post = async (path: string, body: any) =>
    fetch(url + path, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
  try {
    const login = await post("/admin/login", {
      token: "long-enough-operator-token-for-tests",
    });
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    const o = await (
      await post("/admin/onchain", {
        action: "detect",
        amount: 19,
        name: "Berlin",
      })
    ).json();
    assert.equal(store.state().total, 0);
    for (const action of ["quote", "invoice", "accept", "confirm", "confirm"])
      assert.equal(
        (await post("/admin/onchain", { action, key: o.key })).status,
        200,
      );
    assert.equal(store.state().total, 19);
    assert.equal(store.state().count, 1);
    assert.equal(store.attempt(o.txid)?.status, "confirmed");
    assert.ok(
      (await post("/admin/onchain", { action: "accept", key: o.key })).status >=
        400,
    );
    await post("/admin/event-mode", { mode: "archive" });
    assert.equal(
      (
        await post("/contributions", {
          amount: 1,
          name: "",
          method: "lightning",
        })
      ).status,
      409,
    );
    assert.equal(
      (await fetch(url + "/contributions/" + o.requestId)).status,
      200,
    );
    const before = store.state().total;
    await fetch(url + "/history");
    assert.equal(store.state().total, before);
  } finally {
    runtime.close();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});

test("public Express invoice contract validates exact total and provider acceptance without pool spending", async () => {
  const sim = new SimulatedAccelerator(1500000);
  const inv = await sim.invoice(await sim.quote("abc", "c"));
  const paths: string[] = [];
  const service = new MempoolAccelerator((async (input: any, init: any) => {
    const path = new URL(input).pathname;
    paths.push(path);
    const result = path.endsWith("estimate")
      ? { options: [{ fee: 100 }], mempoolBaseFee: 20, vsizeFee: 30 }
      : path.endsWith("/invoice")
        ? {
            btcpayInvoiceId: "remote-id",
            addresses: { BTC_LightningLike: inv.invoice },
          }
        : { txid: "abc", status: "requested" };
    return new Response(JSON.stringify(result));
  }) as typeof fetch);
  const quote = await service.quote("abc", "c");
  const attempt = await service.invoice(quote);
  assert.equal(attempt.totalSats, 150);
  assert.equal(await service.status(attempt), "accepted");
  assert.ok(paths.includes("/api/v1/services/accelerator/invoice"));
});
test("concurrent Express invoice requests issue one invoice; confirmation racing creation prevents an active attempt", async () => {
  const store = new Store(":memory:", config, "demo");
  let invoices = 0;
  let release: () => void = () => {};
  const sim = new SimulatedAccelerator(config.goal);
  const accelerator = {
    quote: sim.quote.bind(sim),
    status: sim.status.bind(sim),
    invoice: async (q: any) => {
      invoices++;
      await new Promise<void>((r) => (release = r));
      return sim.invoice(q);
    },
  };
  const runtime = createApp(
    store,
    new SimulationAdapter(),
    "long-enough-operator-token-for-tests",
    { serveStatic: false, accelerator },
  );
  const server = runtime.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port + "/api";
  const post = (path: string, body: any, cookie = "") =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
  try {
    const login = await post("/admin/login", {
      token: "long-enough-operator-token-for-tests",
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const o = await (
      await post("/admin/onchain", { action: "detect", amount: 7 }, cookie)
    ).json();
    const q = await (
      await post("/contributions/" + o.requestId + "/acceleration/quote", {
        txid: o.txid,
      })
    ).json();
    const first = post(
      "/contributions/" + o.requestId + "/acceleration/invoice",
      { quoteId: q.id },
    );
    while (invoices === 0) await new Promise((r) => setTimeout(r, 1));
    assert.ok(
      (
        await post("/contributions/" + o.requestId + "/acceleration/invoice", {
          quoteId: q.id,
        })
      ).status >= 400,
    );
    await post("/admin/onchain", { action: "confirm", key: o.key }, cookie);
    release();
    assert.ok((await first).status >= 400);
    assert.equal(invoices, 1);
    assert.equal(store.attempt(o.txid), undefined);
    assert.equal(store.state().total, 7);
  } finally {
    release();
    runtime.close();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});

test("100 compressed pulses blend into bounded trails without discarding any gift amount", async () => {
  const { blendMagic } = await import("../src/cinema.ts");
  const gifts = Array.from({ length: 100 }, (_, i) => ({
    amount: i + 1,
    id: i,
  }));
  const trails = blendMagic(gifts);
  assert.equal(trails.length, 24);
  assert.equal(
    trails.reduce((n, t) => n + t.amount, 0),
    5050,
  );
  assert.equal(trails.at(-1)?.id, 99);
});
test("pending observations and active Express attempts survive database reopening", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(tmpdir() + "/pif-story-");
  try {
    const path = dir + "/demo.sqlite";
    let store = new Store(path, config, "demo");
    const c = await new SimulationAdapter().create(13, "Recover me", "bitcoin");
    store.add(c);
    store.observe({
      key: "bitcoin:tx:0",
      requestId: c.id,
      txid: "tx",
      amount: 13,
      name: c.name,
      status: "pending",
    });
    const sim = new SimulatedAccelerator(config.goal);
    const attempt = await sim.invoice(await sim.quote("tx", c.id));
    store.setAttempt(attempt);
    const cutoff = store.state().eventId;
    store.close();
    store = new Store(path, config, "demo");
    assert.equal(store.state().total, 0);
    assert.equal(store.state().onchain?.length, 1);
    assert.equal(store.attempt("tx")?.invoiceId, attempt.invoiceId);
    assert.equal(store.history().cutoff, cutoff);
    const key = store.state().eventKey;
    store.reset();
    assert.notEqual(store.state().eventKey, key);
    assert.equal(store.state().onchain?.length, 0);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
