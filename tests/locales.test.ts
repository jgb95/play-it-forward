import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configSchema, sponsorsSchema } from "../shared/model.ts";
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
    assert.equal(
      store.config.sponsors?.supporting.length,
      config.sponsors?.supporting.length,
    );
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
    const before = store.state().eventKey;
    assert.equal(
      (
        await post(
          "/admin/runs",
          {
            name: "Bad roster",
            locale: "seoul",
            sponsors: { headline: Array(4).fill({ name: "Extra" }) },
          },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(store.state().eventKey, before);
    const health = await (
      await fetch(base + "/admin/health", {
        headers: { Cookie: cookie },
      })
    ).json();
    assert.deepEqual(health.sponsorPresets.berlin, raw.sponsors);
    assert.deepEqual(health.sponsorPresets.seoul, raw.sponsorLocales.seoul);
    const custom = sponsorsSchema.parse({
      headline: [
        { name: "Main one" },
        { name: "Main two" },
        { name: "Main three" },
      ],
      supporting: Array.from({ length: 12 }, (_, i) => ({
        name: `Partner ${i + 1}`,
      })),
      seconds: 4,
    });
    assert.equal(
      (
        await post(
          "/admin/runs",
          { name: "Seoul", locale: "seoul", sponsors: custom },
          cookie,
        )
      ).status,
      200,
    );
    const state = await (await fetch(base + "/state")).json();
    assert.equal(state.config.locale, "seoul");
    assert.deepEqual(state.config.sponsors, custom);
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
      sponsors: { headline: Array(4).fill({ name: "Sponsor" }) },
    }).success,
    false,
  );
  assert.equal(
    configSchema.safeParse({ ...raw, sponsors: { seconds: 0 } }).success,
    false,
  );
});

test("two or three persistent sponsors accept interchangeable rosters of five or twelve", () => {
  for (const headlineCount of [2, 3]) {
    for (const supportingCount of [5, 12]) {
      const roster = sponsorsSchema.parse({
        headline: Array.from({ length: headlineCount }, (_, i) => ({
          name: `Title ${i + 1}`,
        })),
        supporting: Array.from({ length: supportingCount }, (_, i) => ({
          name: `Supporter ${i + 1}`,
          logo: `/sponsors/supporter-${i + 1}.png`,
        })),
      });
      const promoted = roster.supporting.pop()!;
      const demoted = roster.headline.shift()!;
      roster.headline.push(promoted);
      roster.supporting.unshift(demoted);
      assert.deepEqual(sponsorsSchema.parse(roster), roster);
      assert.equal(roster.headline.length, headlineCount);
      assert.equal(roster.supporting.length, supportingCount);
      assert.equal(roster.headline.at(-1)?.logo, promoted.logo);
    }
  }
  assert.equal(
    sponsorsSchema.safeParse({ supporting: Array(31).fill({ name: "Extra" }) })
      .success,
    false,
  );
});

test("a custom next-run roster is validated before saving and survives restart without changing presets", () => {
  const dir = mkdtempSync(join(tmpdir(), "sponsor-runs-"));
  const path = join(dir, "runs.sqlite");
  const config = configSchema.parse(raw);
  let store = new Store(path, config, "demo");
  const custom = sponsorsSchema.parse({
    headline: [{ name: "One" }, { name: "Two" }, { name: "Promoted" }],
    supporting: Array.from({ length: 12 }, (_, i) => ({
      name: `Partner ${i}`,
    })),
    seconds: 5,
  });
  try {
    const old = store.state().eventKey!;
    assert.throws(() =>
      store.startRun("Invalid", "seoul", {
        ...custom,
        headline: Array(4).fill({ name: "Extra" }),
      }),
    );
    assert.equal(store.state().eventKey, old);
    assert.equal(store.runs().length, 1);
    const id = store.startRun("Custom Seoul", "seoul", custom);
    assert.deepEqual(store.config.sponsors, custom);
    assert.equal(store.config.goal, config.goal);
    assert.deepEqual(store.config.methods, config.methods);
    assert.deepEqual(store.runConfig(old).sponsors, config.sponsors);
    store.close();
    store = new Store(path, config, "demo");
    assert.deepEqual(store.config.sponsors, custom);
    store.startRun("Default Seoul", "seoul");
    assert.deepEqual(store.config.sponsors, config.sponsorLocales!.seoul);
    assert.deepEqual(store.runConfig(id).sponsors, custom);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a full sponsor roster saves over HTTP while other payloads remain bounded", async () => {
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
  const sponsor = (i: number) => ({
    name: `${i} `.padEnd(80, "N"),
    tier: "Supporter".padEnd(40, "T"),
    logo: `/sponsors/partner-${i}.png`,
  });
  const sponsors = sponsorsSchema.parse({
    headline: Array.from({ length: 3 }, (_, i) => sponsor(i)),
    supporting: Array.from({ length: 30 }, (_, i) => sponsor(i + 3)),
    seconds: 4,
  });
  const body = { name: "Full Seoul roster", locale: "seoul", sponsors };
  assert.ok(Buffer.byteLength(JSON.stringify(body)) > 4096);
  try {
    const login = await post("/admin/login", {
      token: "test-token-longer-than-24-chars",
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await post("/admin/runs", body)).status, 401);
    assert.equal((await post("/admin/runs", body, cookie)).status, 200);
    const state = await (await fetch(base + "/state")).json();
    assert.equal(state.config.locale, "seoul");
    assert.deepEqual(state.config.sponsors, sponsors);
    const activeRun = store.state().eventKey;
    assert.equal(
      (
        await post(
          "/admin/runs",
          { ...body, padding: "x".repeat(32768) },
          cookie,
        )
      ).status,
      413,
    );
    assert.equal(store.state().eventKey, activeRun);
    assert.equal(
      (await post("/contributions", { amount: 100, name: "x".repeat(4096) }))
        .status,
      413,
    );
  } finally {
    runtime.close();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});
