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
