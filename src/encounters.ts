import type { Observation, StoryEvent } from "../shared/model";

export type Portal = { x: number; y: number; kind: "door" | "stairs" | "path" };
export const scenePortals: Portal[][] = [
  [
    { x: 178, y: 226, kind: "door" },
    { x: 532, y: 231, kind: "stairs" },
  ],
  [
    { x: 72, y: 231, kind: "path" },
    { x: 528, y: 231, kind: "stairs" },
  ],
  [
    { x: 116, y: 231, kind: "stairs" },
    { x: 525, y: 226, kind: "door" },
  ],
  [
    { x: 558, y: 224, kind: "door" },
    { x: 64, y: 231, kind: "path" },
  ],
  [
    { x: 298, y: 220, kind: "door" },
    { x: 72, y: 231, kind: "path" },
  ],
  [
    { x: 505, y: 234, kind: "door" },
    { x: 110, y: 230, kind: "door" },
  ],
];
export function portalFor(scene: number, id: number): Portal {
  const portals = scenePortals[scene] ?? scenePortals[0];
  return portals[Math.abs(id) % portals.length];
}
const clamp = (p: number) => Math.max(0, Math.min(1, p));
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
// Feet travel out of the opening, along the pavement, then back through it.
export function encounterPose(
  scene: number,
  id: number,
  x: number,
  y: number,
  age: number,
  duration: number,
  reduced = false,
) {
  const portal = portalFor(scene, id);
  const p = reduced ? 0.5 : clamp(age / duration);
  const side = portal.x < x ? -1 : 1;
  const meet = Math.max(25, Math.min(615, x + side * 43));
  let travel = p < 0.32 ? p / 0.32 : p > 0.76 ? (1 - p) / 0.24 : 1;
  travel = clamp(travel);
  const emerged = clamp(travel / 0.3);
  const pavement = clamp((travel - 0.3) / 0.7);
  return {
    x: mix(portal.x, meet, pavement),
    y: mix(portal.y - 52, portal.y, emerged) + (y - portal.y) * pavement,
    portal,
    walking: travel < 0.999,
    facing: (p > 0.76 ? -side : side) === 1 ? -1 : 1,
    reaching: p >= 0.32 && p <= 0.65,
    transfer: clamp((p - 0.42) / 0.22),
    p,
  };
}
export type Pickup = {
  reward: string;
  born: number;
  duration: number;
  giver: number;
};
export function pickupProgress(pickup: Pickup, time: number, reduced = false) {
  return reduced ? 1 : clamp((time - pickup.born) / pickup.duration);
}
export function equippedRewards(
  rewards: string[],
  pickups: Pickup[],
  time: number,
  reduced: boolean,
) {
  return rewards.filter(
    (reward) =>
      !pickups.some(
        (p) => p.reward === reward && pickupProgress(p, time, reduced) < 0.65,
      ),
  );
}
export type ExpressCue = {
  id: number;
  txid: string;
  amount: number;
  name: string;
  born?: number;
  duration?: number;
};
// A presentation projection: it cannot credit a receipt or modify progression.
export class ExpressQueue {
  private seen = new Set<number>();
  private accepted = new Set<string>();
  private pending: ExpressCue[] = [];
  private cancelled = new Set<string>();
  enqueue(event: StoryEvent, observations: Observation[]) {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    if (
      (event.kind === "onchain" &&
        ["replaced", "dropped"].includes(event.payload.status)) ||
      (event.kind === "acceleration" && event.payload.status === "failed")
    ) {
      this.cancelled.add(event.payload.txid);
      return;
    }
    if (event.kind !== "acceleration" || event.payload.status !== "accepted")
      return;
    const txid = event.payload.txid;
    if (this.accepted.has(txid)) return;
    this.accepted.add(txid);
    const outputs = (event.payload.pendingOutputs ?? observations).filter(
      (o: Observation) => o.txid === txid && o.status === "pending",
    );
    if (!outputs.length) return; // Confirmation won the race; no stale waiting train.
    this.pending.push({
      id: event.id,
      txid,
      amount: outputs.reduce((n: number, o: Observation) => n + o.amount, 0),
      name: outputs[0].name,
    });
  }
  next(ready: boolean, observations: Observation[]) {
    if (!ready) return undefined;
    while (this.pending.length) {
      const cue = this.pending.shift()!;
      if (
        !this.cancelled.has(cue.txid) &&
        !observations.some(
          (o) => o.txid === cue.txid && o.acceleration === "failed",
        )
      )
        return cue;
    }
    return undefined;
  }
  restore(observations: Observation[]) {
    this.pending = [];
    this.seen.clear();
    this.cancelled.clear();
    this.accepted = new Set(
      observations
        .filter((o) => o.acceleration === "accepted")
        .map((o) => o.txid),
    );
  }
  get nextId() {
    return this.pending[0]?.id ?? Infinity;
  }
  get count() {
    return this.pending.length;
  }
}
export function orbitingOutputs(observations: Observation[] = []) {
  return [
    ...new Map(
      observations
        .filter((o) => o.status === "pending" && o.acceleration === "accepted")
        .map((o) => [o.key, o]),
    ).values(),
  ];
}

export function formationSlot(x: number, y: number, index: number) {
  const spacing = Math.min(24, Math.max(10, (x - 18) / 3));
  return {
    x: Math.max(12, x - (Math.floor(index / 2) + 1) * spacing),
    y: y - (index % 2 ? 17 : 2),
  };
}
export function companionHandoff(
  x: number,
  y: number,
  index: number,
  progress: number,
) {
  const from = formationSlot(x, y, index);
  const approach =
    progress < 0.28
      ? progress / 0.28
      : progress > 0.76
        ? (1 - progress) / 0.24
        : 1;
  const p = Math.max(0, Math.min(1, approach));
  return {
    x: from.x + (x - 43 - from.x) * p,
    y: from.y + (y - from.y) * p,
    walking: p < 1,
    reaching: progress >= 0.28 && progress <= 0.65,
  };
}
