import test from "node:test";
import assert from "node:assert/strict";
import {
  encounterPose,
  portalFor,
  scenePortals,
  equippedRewards,
  ExpressQueue,
  orbitingOutputs,
  formationSlot,
  companionHandoff,
} from "../src/encounters.ts";
import { ContributionFeed } from "../shared/feed.ts";
import type { Observation, StoryEvent } from "../shared/model.ts";
const output: Observation = {
  key: "bitcoin:tx:0",
  requestId: "request",
  txid: "tx",
  amount: 123,
  name: "Build together!",
  status: "pending",
};
const event = (
  id: number,
  kind: StoryEvent["kind"],
  payload: any,
): StoryEvent => ({ id, kind, payload, created: id });
test("every scene has two grounded paths, deterministic selection and planted handoff feet", () => {
  for (let scene = 0; scene < 6; scene++) {
    assert.equal(scenePortals[scene].length, 2);
    assert.notDeepEqual(portalFor(scene, 1), portalFor(scene, 2));
    assert.deepEqual(portalFor(scene, 100), portalFor(scene, 100));
    for (const x of [64, 320, 576])
      for (const id of [1, 2]) {
        const entry = encounterPose(scene, id, x, 254, 0, 4);
        assert.equal(entry.x, portalFor(scene, id).x);
        const a = encounterPose(scene, id, x, 254, 1.5, 4),
          b = encounterPose(scene, id, x, 254, 2, 4);
        assert.equal(a.x, b.x);
        assert.equal(a.y, b.y);
        assert.equal(a.walking, false);
        assert.equal(b.reaching, true);
        assert.ok(b.transfer > 0);
        const exit = encounterPose(scene, id, x, 254, 4, 4);
        assert.equal(exit.x, entry.x);
        assert.equal(exit.y, entry.y);
        assert.ok(a.x >= 25 && a.x <= 615);
        const still = encounterPose(scene, id, x, 254, 0, 4, true);
        assert.equal(still.walking, false);
        assert.equal(still.reaching, true);
      }
  }
});
test("accessories equip at visible contact, while restoration and reduced motion equip immediately", () => {
  const rewards = ["hat", "shirt"];
  const pickups = [{ reward: "hat", born: 10, duration: 2, giver: 1 }];
  assert.deepEqual(equippedRewards(rewards, pickups, 11, false), ["shirt"]);
  assert.deepEqual(equippedRewards(rewards, pickups, 11.31, false), rewards);
  assert.deepEqual(equippedRewards(rewards, pickups, 10, true), rewards);
  assert.deepEqual(equippedRewards(rewards, [], 10, false), rewards);
});
test("ordinary pending text is hidden, Express reveals it, receipt credit confirms once without changing amounts", () => {
  const f = new ContributionFeed();
  f.apply(event(1, "onchain", output));
  assert.equal(f.rows()[0].name, "");
  f.apply(
    event(2, "acceleration", { txid: "tx", status: "invoice", totalSats: 999 }),
  );
  assert.equal(f.rows()[0].name, "");
  f.apply(
    event(3, "acceleration", {
      txid: "tx",
      status: "accepted",
      totalSats: 999,
    }),
  );
  assert.equal(f.rows()[0].name, output.name);
  assert.equal(f.rows()[0].status, "pending");
  assert.equal(f.rows()[0].amount, 123);
  f.apply(
    event(4, "donation", {
      receiptKey: output.key,
      amount: 123,
      name: output.name,
      method: "bitcoin",
    }),
  );
  assert.equal(f.rows().length, 1);
  assert.equal(f.rows()[0].name, output.name);
  assert.equal(f.rows()[0].status, "confirmed");
});
test("Express queues only accepted active transactions, deduplicates and restores without replaying trains", () => {
  const q = new ExpressQueue();
  const accepted = { ...output, acceleration: "accepted" as const };
  q.enqueue(event(1, "acceleration", { txid: "tx", status: "invoice" }), [
    output,
  ]);
  assert.equal(q.count, 0);
  const e = event(2, "acceleration", { txid: "tx", status: "accepted" });
  q.enqueue(e, [accepted]);
  q.enqueue(e, [accepted]);
  q.enqueue(event(3, "acceleration", e.payload), [accepted]);
  assert.equal(q.count, 1);
  assert.equal(q.next(false, [accepted]), undefined);
  assert.equal(q.next(true, [accepted])?.amount, 123);
  assert.equal(q.count, 0);
  q.restore([accepted]);
  q.enqueue(e, [accepted]);
  assert.equal(q.count, 0);
  q.restore([]);
  q.enqueue(e, [accepted]);
  assert.equal(
    q.next(true, [])?.txid,
    "tx",
    "queued acceptance is still shown if confirmation arrives before presentation",
  );
  q.restore([]);
  q.enqueue(e, [{ ...accepted, status: "confirmed" }]);
  assert.equal(q.count, 0);
});
test("waiting orbit budget preserves output identities and removes confirmed, failed, replaced or dropped outputs", () => {
  const active = { ...output, acceleration: "accepted" as const };
  const outputs = [
    active,
    active,
    { ...active, key: "bitcoin:tx:1", amount: 5 },
    { ...active, key: "c", status: "confirmed" as const },
    { ...active, key: "r", status: "replaced" as const },
    { ...active, key: "d", status: "dropped" as const },
    { ...active, key: "f", acceleration: "failed" as const },
  ];
  assert.deepEqual(
    orbitingOutputs(outputs).map((o) => o.key),
    [output.key, "bitcoin:tx:1"],
  );
});

test("acceptance can arrive before its observation update without losing the train", () => {
  const q = new ExpressQueue();
  q.enqueue(event(1, "acceleration", { txid: "tx", status: "accepted" }), [
    output,
  ]);
  assert.equal(q.next(true, [output])?.txid, "tx");
});
test("six companions occupy distinct formation slots even at the left edge; handoffs return them to the same slot", () => {
  for (const x of [64, 320, 576]) {
    const slots = Array.from({ length: 6 }, (_, i) => formationSlot(x, 254, i));
    assert.equal(new Set(slots.map((p) => `${p.x}/${p.y}`)).size, 6);
    for (let i = 0; i < 6; i++) {
      assert.deepEqual(
        companionHandoff(x, 254, i, 0),
        companionHandoff(x, 254, i, 1),
      );
      assert.equal(companionHandoff(x, 254, i, 0.5).walking, false);
      assert.equal(companionHandoff(x, 254, i, 0.5).reaching, true);
    }
  }
});

test("recorded acceptance snapshot keeps rehearsal trains after fast confirmation; explicit drop cancels queued trains", () => {
  const q = new ExpressQueue();
  const accepted = event(10, "acceleration", {
    txid: "tx",
    status: "accepted",
    pendingOutputs: [output],
  });
  q.enqueue(accepted, []);
  assert.equal(q.nextId, 10);
  assert.equal(q.next(true, [])?.name, output.name);
  q.restore([]);
  q.enqueue(accepted, []);
  q.enqueue(event(11, "onchain", { ...output, status: "dropped" }), []);
  assert.equal(q.next(true, []), undefined);
});
