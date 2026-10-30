import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configSchema } from "../shared/model.ts";
import { withLocale } from "../shared/locales.ts";
import { Store } from "../server/store.ts";
import { SimulationAdapter } from "../server/payments.ts";
import { createApp } from "../server/app.ts";

const raw = JSON.parse(readFileSync("config.json", "utf8"));
test("locale and sponsor data survive config validation without changing legacy defaults", () => {
  const { locale, sponsors, sponsorLocales, ...oldConfig } = raw;
  const legacy = configSchema.parse(oldConfig);
  assert.equal(legacy.goal, raw.goal);
  assert.equal(legacy.locale, undefined);
  assert.equal(legacy.sponsors, undefined);
  const parsed = configSchema.parse({
    ...raw,
    locale: "seoul",
    sponsors: {
      headline: [{ name: "HRF", logo: "/sponsors/hrf.svg" }],
      supporting: [
        {
          name: "Community",
          logo: "/sponsors/community.png",
          tier: "Workshop",
        },
      ],
      seconds: 8,
    },
  });
  assert.equal(parsed.locale, "seoul");
  assert.equal(parsed.sponsors!.supporting[0].tier, "Workshop");
});
test("city selection captures Seoul while old receipts and replay retain Berlin", async () => {
  const config = configSchema.parse(raw);
  const s = new Store(":memory:", config, "demo");
  try {
    const c = await new SimulationAdapter().create(100, "old", "bitcoin");
    s.add(c);
    const old = s.state().eventKey!;
    const next = s.startRun("Seoul adventure", "seoul");
    assert.equal(s.config.locale, "seoul");
    assert.equal(s.config.chapters[0].name, "Seoul Station");
    assert.equal(s.config.chapters[5].name, "Community House Masil");
    assert.equal(s.config.goal, config.goal);
    assert.deepEqual(s.config.methods, config.methods);
    assert.deepEqual(
      s.config.chapters.map((c) => c.threshold),
      config.chapters.map((c) => c.threshold),
    );
    s.credit({ key: "late", requestId: c.id, amount: 100 });
    assert.equal(s.state().total, 0);
    assert.equal(s.state(old).total, 100);
    assert.equal(
      s.history(0, undefined, 200, old).config.chapters[0].name,
      "Berlin Hauptbahnhof",
    );
    assert.equal(s.history(0, undefined, 200, next).config.locale, "seoul");
    assert.throws(() => (s.startRun as any)("Invalid", "unknown"));
    assert.equal(s.state().eventKey, next);
  } finally {
    s.close();
  }
});
test("Seoul supplies local companion names even for legacy chapters without recruits", () => {
  const config = configSchema.parse({
    ...raw,
    chapters: raw.chapters.map(({ recruit, ...chapter }: any) => chapter),
  });
  const seoul = withLocale(config, "seoul");
  assert.equal(seoul.chapters[0].recruit?.name, "Min");
});
test("city sponsor overrides and captured replay assets survive a restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "city-runs-"));
  const path = join(dir, "runs.sqlite");
  const config = configSchema.parse(raw);
  let store = new Store(path, config, "demo");
  try {
    const id = store.startRun("Seoul", "seoul");
    assert.equal(store.config.sponsors?.supporting.length, 6);
    store.close();
    store = new Store(
      path,
      {
        ...config,
        sponsorLocales: { seoul: { headline: [], supporting: [], seconds: 8 } },
      },
      "demo",
    );
    assert.equal(store.config.locale, "seoul");
    assert.equal(store.runConfig(id).sponsors?.supporting.length, 6);
    store.startRun("New roster", "seoul");
    assert.equal(store.config.sponsors?.headline.length, 0);
    assert.equal(store.runConfig(id).sponsors?.supporting.length, 6);
    store.startRun("Berlin", "berlin");
    assert.equal(store.config.sponsors?.supporting.length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("locale selection is authenticated and the public state changes with the run", async () => {
  const store = new Store(":memory:", configSchema.parse(raw), "demo");
  const runtime = createApp(
    store,
    new SimulationAdapter(),
    "test-token-longer-than-24-chars",
    { serveStatic: false },
  );
  const server = runtime.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const post = (path: string, body: unknown, cookie = "") =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await post("/admin/runs", { name: "Seoul", locale: "seoul" })).status,
      401,
    );
    const login = await post("/admin/login", {
      token: "test-token-longer-than-24-chars",
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await post("/admin/runs", { name: "Seoul", locale: "bogus" }, cookie))
        .status,
      400,
    );
    assert.equal(
      (await post("/admin/runs", { name: "Seoul", locale: "seoul" }, cookie))
        .status,
      200,
    );
    const state = await (await fetch(base + "/state")).json();
    assert.equal(state.config.locale, "seoul");
    assert.equal(state.state.total, 0);
  } finally {
    runtime.close();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});
test("sponsor configuration rejects remote assets, traversal, unsafe URLs and unbounded reels", () => {
  for (const logo of [
    "https://example.com/a.png",
    "//example.com/a.png",
    "/../a.png",
    "/sponsors/%2e%2e/a.png",
    "/sponsors/a.svg?x=1",
    "/sponsors/a.psd",
  ]) {
    assert.equal(
      configSchema.safeParse({
        ...raw,
        sponsors: { headline: [{ name: "Sponsor", logo }] },
      }).success,
      false,
      logo,
    );
  }
  assert.equal(
    configSchema.safeParse({ ...raw, locale: "unknown" }).success,
    false,
  );
  assert.equal(
    configSchema.safeParse({
      ...raw,
      sponsors: { headline: Array(3).fill({ name: "Sponsor" }) },
    }).success,
    false,
  );
  assert.equal(
    configSchema.safeParse({ ...raw, sponsors: { seconds: 0 } }).success,
    false,
  );
});
