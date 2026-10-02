import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  configSchema,
  progression,
  type Celebration,
} from "../shared/model.ts";
import { CelebrationQueue } from "../src/cinema.ts";
import { JourneyMotion } from "../src/motion.ts";
import { MovieDirector } from "../server/movie.ts";
const config = configSchema.parse(
  JSON.parse(readFileSync("config.json", "utf8")),
);
const gifts: Celebration[] = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  amount: 1000,
  name: "Gift " + i,
  total: (i + 1) * 1000,
  level: 0,
  previousLevel: 0,
}));
test("100 simultaneous receipts play once each in order, at distinct times", () => {
  const queue = new CelebrationQueue(0);
  queue.enqueue(gifts);
  queue.enqueue(gifts);
  assert.equal(queue.count, 100);
  assert.equal(queue.next(0, true, 3.6)?.id, 1);
  assert.equal(queue.next(1, true, 3.6), undefined);
  assert.equal(queue.next(4, false, 3.6), undefined);
  const ids = [1];
  for (let i = 1; i < 100; i++) ids.push(queue.next(i * 4, true, 3.6)!.id);
  assert.deepEqual(
    ids,
    gifts.map((g) => g.id),
  );
  assert.equal(queue.count, 0);
});
test("reconnection and operator skip discard the historical presentation backlog", () => {
  const queue = new CelebrationQueue(0);
  queue.enqueue(gifts);
  queue.clear(100);
  queue.enqueue(gifts);
  assert.equal(queue.count, 0);
});
test("cinematic montage takes more time but remains bounded", () => {
  const motion = new JourneyMotion(progression(0, config), true);
  motion.update(progression(2100000, config), 0);
  assert.equal(motion.sample(4).walking, true);
  assert.equal(motion.sample(18).chapter, 5);
  assert.equal(motion.sample(18).progress, 1);
  assert.equal(motion.sample(18).walking, false);
});
test("movie reaches the exact goal at its scheduled end, visiting all stops", () => {
  const movie = new MovieDirector();
  movie.start(1000, 180, 0, config);
  let total = 0;
  const chapters = new Set<number>();
  for (let ms = 1000; ms <= 181000; ms += 250) {
    total += movie.due(ms, total);
    chapters.add(progression(total, config).chapter);
    if (ms < 181000) assert.ok(total < config.goal);
  }
  assert.equal(total, config.goal);
  assert.equal(chapters.size, 6);
  assert.equal(movie.status(181000).running, false);
});
test("movie pause/resume, stop, partial pool and manual gifts are safe", () => {
  const movie = new MovieDirector();
  movie.start(0, 60, 100000, config);
  movie.pause(2000);
  assert.equal(movie.due(30000, 100000), 0);
  movie.resume(32000);
  assert.equal(movie.status(33000).elapsed, 3);
  let total = 150000; // Another simulated donor contributed while the movie was paused.
  for (let ms = 33000; ms <= 90000; ms += 250) total += movie.due(ms, total);
  assert.equal(total, config.goal);
  assert.throws(() => movie.start(0, 5, 0, config));
  assert.throws(() => movie.start(0, 60, config.goal, config));
  movie.start(0, 60, 0, config);
  movie.stop();
  assert.equal(movie.due(90000, 0), 0);
});
