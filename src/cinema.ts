import type { Celebration } from "../shared/model";
export class CelebrationQueue {
  private pending: Celebration[] = [];
  private seen: number;
  private until = 0;
  constructor(eventId: number) {
    this.seen = eventId;
  }
  enqueue(events: Celebration[]) {
    for (const event of events)
      if (event.id > this.seen) {
        this.pending.push(event);
        this.seen = event.id;
      }
  }
  next(now: number, ready: boolean, seconds: number) {
    if (!ready || now < this.until || !this.pending.length) return undefined;
    this.until = now + seconds;
    return this.pending.shift();
  }
  get count() {
    return this.pending.length;
  }
  clear(eventId: number) {
    this.pending = [];
    this.seen = eventId;
    this.until = 0;
  }
}
// Dense recaps keep every gift's energy while drawing a bounded number of trails.
export function blendMagic<T extends { amount: number }>(
  values: T[],
  limit = 24,
): T[] {
  if (values.length <= limit) return values;
  const count = values.length - limit + 1,
    merged = values.slice(0, count);
  return [
    { ...merged.at(-1)!, amount: merged.reduce((n, v) => n + v.amount, 0) },
    ...values.slice(count),
  ];
}
