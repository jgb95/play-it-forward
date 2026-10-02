import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configSchema } from "../shared/model.ts";
import { Store } from "../server/store.ts";
import { SimulationAdapter } from "../server/payments.ts";
import { createApp } from "../server/app.ts";
const config = configSchema.parse(
  JSON.parse(readFileSync("config.json", "utf8")),
);
const token = "test-operator-token-at-least-24";
async function setup(mode: "demo" | "signet" = "demo") {
  const store = new Store(":memory:", config, mode);
  const runtime = createApp(store, new SimulationAdapter(), token, {
    serveStatic: false,
  });
  const server = runtime.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  const post = (url: string, body: unknown = {}, cookie = "") =>
    fetch(base + "/api" + url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  const close = async () => {
    runtime.close();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  };
  return { base, post, store, close };
}
test("mobile request / server simulation / duplicate / auth / burst", async () => {
  const s = await setup();
  try {
    assert.equal(
      (await s.post("/admin/simulate", { amount: 100 })).status,
      401,
    );
    assert.equal(
      (
        await s.post("/contributions", {
          amount: 1.5,
          name: "x",
          method: "bitcoin",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await s.post("/contributions", {
          amount: 1,
          name: "x".repeat(33),
          method: "bitcoin",
        })
      ).status,
      400,
    );
    const res = await s.post("/contributions", {
        amount: 1000,
        name: "<img onerror=x>",
        method: "lightning",
      }),
      c = await res.json();
    assert.equal(res.status, 201);
    await s.post("/contributions/" + c.id + "/simulate");
    await s.post("/contributions/" + c.id + "/simulate");
    assert.equal(s.store.state().total, 1000);
    const login = await s.post("/admin/login", { token });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.match(cookie, /pif_session=/);
    const burst = await s.post(
      "/admin/simulate",
      { amount: 1000, count: 100 },
      cookie,
    );
    assert.equal(burst.status, 200);
    assert.equal(s.store.state().total, 101000);
    assert.equal(s.store.state().count, 101);
    await s.post("/admin/reset", {}, cookie);
    assert.equal(s.store.state().total, 0);
    const publicState = JSON.stringify(
      await (await fetch(s.base + "/api/state")).json(),
    );
    assert.ok(!publicState.includes(token));
  } finally {
    await s.close();
  }
});
test("live network forbids all simulated credits and resets", async () => {
  const s = await setup("signet");
  try {
    const login = await s.post("/admin/login", { token });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    for (const path of [
      "/admin/reset",
      "/admin/simulate",
      "/contributions/anything/simulate",
    ])
      assert.equal((await s.post(path, { amount: 5000 }, cookie)).status, 403);
    assert.equal(s.store.state().total, 0);
  } finally {
    await s.close();
  }
});
test("SSE resumes bounded receipt history then supplies authoritative state", async () => {
  const s = await setup();
  try {
    const c = await (
      await s.post("/contributions", { amount: 5000, method: "ark", name: "" })
    ).json();
    await s.post("/contributions/" + c.id + "/simulate");
    const controller = new AbortController();
    const res = await fetch(s.base + "/api/events", {
      headers: { "Last-Event-ID": "0" },
      signal: controller.signal,
    });
    const reader = res.body!.getReader();
    const chunk = await reader.read();
    const str = new TextDecoder().decode(chunk.value);
    assert.match(str, /event: catchup/);
    assert.match(str, /event: snapshot/);
    assert.match(str, /"total":5000/);
    controller.abort();
  } finally {
    await s.close();
  }
});

test("director controls validate settings and live mode refuses movie simulation", async () => {
  const s = await setup("signet");
  try {
    const login = await s.post("/admin/login", { token });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await s.post("/admin/movie", { action: "start", duration: 60 }, cookie))
        .status,
      403,
    );
    assert.equal(
      (
        await s.post(
          "/admin/presentation",
          { pace: "cinematic", cueSeconds: 3.6, volume: 0.4 },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await s.post(
          "/admin/presentation",
          { pace: "cinematic", cueSeconds: -1, volume: 0.4 },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal((await s.post("/admin/skip", {}, cookie)).status, 200);
    assert.equal(s.store.state().total, 0);
  } finally {
    await s.close();
  }
});
test("movie controls require login, support pause/stop and reject invalid durations", async () => {
  const s = await setup();
  try {
    assert.equal(
      (await s.post("/admin/movie", { action: "start", duration: 60 })).status,
      401,
    );
    const login = await s.post("/admin/login", { token });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await s.post("/admin/movie", { action: "start", duration: 1 }, cookie))
        .status,
      400,
    );
    assert.equal(
      (await s.post("/admin/movie", { action: "start", duration: 60 }, cookie))
        .status,
      200,
    );
    const pause = await s.post("/admin/movie", { action: "pause" }, cookie);
    assert.equal((await pause.json()).paused, true);
    assert.equal(
      (await s.post("/admin/movie", { action: "stop" }, cookie)).status,
      200,
    );
  } finally {
    await s.close();
  }
});
test("rehearsal credits cannot change the event ledger and cookies stay scoped", async () => {
  const eventStore = new Store(":memory:", config, "signet"),
    demoStore = new Store(":memory:", config, "demo");
  const rehearsal = createApp(demoStore, new SimulationAdapter(), token, {
    serveStatic: false,
    cookiePath: "/rehearsal/api/admin",
  });
  const event = createApp(eventStore, new SimulationAdapter(), token, {
    serveStatic: false,
    rehearsal: rehearsal.app,
  });
  const server = event.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const login = await fetch(base + "/rehearsal/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.match(
      login.headers.get("set-cookie")!,
      /Path=\/rehearsal\/api\/admin/,
    );
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const gift = await fetch(base + "/rehearsal/api/admin/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ amount: 5000 }),
    });
    assert.equal(gift.status, 200);
    assert.equal(demoStore.state().total, 5000);
    assert.equal(eventStore.state().total, 0);
  } finally {
    event.close();
    rehearsal.close();
    await new Promise<void>((r) => server.close(() => r()));
    eventStore.close();
    demoStore.close();
  }
});

test("run management is authenticated, saved replays pin a run and rehearsal cannot spend", async () => {
  const s = await setup();
  try {
    assert.equal((await s.post("/admin/runs", { name: "New" })).status, 401);
    assert.equal(
      (await s.post("/admin/withdrawals/send", { id: "x", confirm: "SEND" }))
        .status,
      401,
    );
    const login = await s.post("/admin/login", { token }),
      cookie = login.headers.get("set-cookie")!.split(";")[0];
    await s.post("/admin/simulate", { amount: 123 }, cookie);
    const old = s.store.state().eventKey;
    assert.equal(
      (await s.post("/admin/runs", { name: "Second" }, cookie)).status,
      200,
    );
    assert.equal(s.store.state().total, 0);
    await s.post("/admin/simulate", { amount: 45 }, cookie);
    const oldHistory = await (
      await fetch(s.base + "/api/history?run=" + old)
    ).json();
    assert.equal(oldHistory.finalTotal, 123);
    assert.equal(
      (await (await fetch(s.base + "/api/history?run=featured")).json())
        .eventKey,
      old,
    );
    assert.equal(
      (
        await s.post(
          "/admin/runs/feature",
          { id: s.store.state().eventKey },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await (await fetch(s.base + "/api/history?run=featured")).json())
        .finalTotal,
      45,
    );
    assert.equal(
      (
        await s.post(
          "/admin/withdrawals/preview",
          { kind: "ark", destination: "x" },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await s.post(
          "/admin/withdrawals/send",
          { id: "x", confirm: "SEND" },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(s.store.state().total, 45);
  } finally {
    await s.close();
  }
});

test("public feed validates cursors, scopes saved runs and excludes checkout details", async () => {
  const s = await setup();
  try {
    const c = await (
      await s.post("/contributions", {
        amount: 12,
        method: "bitcoin",
        name: "Visitor",
      })
    ).json();
    await s.post("/contributions/" + c.id + "/simulate");
    const r = await fetch(s.base + "/api/feed"),
      feed = await r.json();
    assert.equal(r.status, 200);
    assert.equal(feed.entries[0].amount, 12);
    assert.equal(feed.entries[0].method, "bitcoin");
    assert.equal(feed.entries[0].status, "confirmed");
    for (const key of ["requestId", "destination", "uri", "invoice"])
      assert.equal(key in feed.entries[0], false);
    for (const query of [
      "limit=101",
      "before=-1",
      "cutoff=999999",
      "limit=1.5",
    ])
      assert.equal((await fetch(s.base + "/api/feed?" + query)).status, 400);
    assert.equal((await fetch(s.base + "/api/feed?run=unknown")).status, 404);
    assert.equal(
      (await (await fetch(s.base + "/api/feed?run=featured")).json()).eventKey,
      s.store.state().eventKey,
    );
  } finally {
    await s.close();
  }
});
