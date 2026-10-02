import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configSchema, progression } from "../shared/model.ts";
import { JourneyMotion, courierX } from "../src/motion.ts";
const config = configSchema.parse(
  JSON.parse(readFileSync("config.json", "utf8")),
);
test("sats set start, midpoint, and end positions in every chapter", () => {
  config.chapters.forEach((ch, i) => {
    const end = config.chapters[i + 1]?.threshold ?? config.goal;
    assert.equal(courierX(i, progression(ch.threshold, config).progress), 64);
    assert.equal(
      courierX(i, progression((ch.threshold + end) / 2, config).progress),
      (64 + courierX(i, 1)) / 2,
    );
    assert.ok(
      courierX(i, progression(end - 1, config).progress) >
        courierX(i, 1) - 0.02,
    );
  });
});
test("idle remains planted and equal total sats produce equal positions", () => {
  const one = new JourneyMotion(progression(25000, config));
  const many = new JourneyMotion(
    progression(
      Array(100)
        .fill(250)
        .reduce((a, b) => a + b),
      config,
    ),
  );
  for (const time of [0, 1, 60, 1000]) {
    assert.deepEqual(one.sample(time), many.sample(time));
    assert.equal(one.sample(time).progress, 0.5);
    assert.equal(one.sample(time).walking, false);
  }
});
test("within-chapter movement eases for 700ms then stops", () => {
  const m = new JourneyMotion(progression(0, config));
  m.update(progression(25000, config), 1);
  assert.ok(Math.abs(m.sample(1.35).progress - 0.25) < 1e-9);
  assert.equal(m.sample(1.71).progress, 0.5);
  assert.equal(m.sample(1.71).walking, false);
});
test("threshold completes outgoing chapter then slides into next", () => {
  const m = new JourneyMotion(progression(49000, config));
  m.update(progression(50000, config), 0);
  const seam = m.sample(0.85);
  assert.equal(seam.chapter, 0);
  assert.equal(seam.nextChapter, 1);
  assert.equal(seam.progress, 1);
  assert.ok(seam.slide > 0 && seam.slide < 1);
  assert.equal(m.sample(1.4).chapter, 1);
  assert.equal(m.sample(1.4).progress, 0);
});
test("all-threshold montage is bounded and settles at the open vault", () => {
  const m = new JourneyMotion(progression(0, config));
  m.update(progression(2100000, config), 0);
  const visited = new Set<number>();
  for (let t = 0; t < 4; t += 0.01) visited.add(m.sample(t).chapter);
  assert.equal(visited.size, 6);
  assert.equal(m.sample(4.001).chapter, 5);
  assert.equal(m.sample(4.001).progress, 1);
  assert.equal(m.sample(4.001).walking, false);
  m.update(progression(9000000, config), 5);
  assert.equal(courierX(5, m.sample(100).progress), 500);
});
test("incoming donations extend travel without restarting the current slide", () => {
  const m = new JourneyMotion(progression(49000, config));
  m.update(progression(60000, config), 0);
  const before = m.sample(0.8);
  m.update(progression(400000, config), 0.8);
  assert.deepEqual(m.sample(0.8), before);
  const settled = m.sample(4.001);
  assert.equal(settled.chapter, 3);
  assert.equal(settled.progress, progression(400000, config).progress);
});
test("reconnection, reduced motion, and reset snap without historical travel", () => {
  const m = new JourneyMotion(progression(0, config));
  m.update(progression(1900000, config), 0);
  m.update(progression(1900000, config), 0.5, true);
  assert.equal(m.sample(0.5).walking, false);
  assert.equal(m.sample(0.5).progress, progression(1900000, config).progress);
  m.update(progression(0, config), 1);
  assert.deepEqual(m.sample(1), {
    chapter: 0,
    progress: 0,
    slide: 0,
    walking: false,
    transitioning: false,
  });
});

test("late donations cannot stretch an active montage beyond four seconds", () => {
  const m = new JourneyMotion(progression(0, config));
  m.update(progression(400000, config), 0);
  m.sample(2.3);
  m.update(progression(2100000, config), 2.3);
  const pose = m.sample(4);
  assert.equal(pose.chapter, 5);
  assert.equal(pose.progress, 1);
  assert.equal(pose.walking, false);
});
