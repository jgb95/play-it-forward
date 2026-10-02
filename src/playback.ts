import {
  progression,
  type Config,
  type State,
  type StoryEvent,
  type HistoryPage,
  type Observation,
} from "../shared/model";
export type PlaybackSession = {
  id: string;
  kind: "intro" | "replay";
  history: HistoryPage;
};
export type PlaybackControl = { paused: boolean; speed: number; loop: boolean };
export function emptyState(config: Config, mode: State["mode"]): State {
  return {
    total: 0,
    count: 0,
    eventId: 0,
    mode,
    ...progression(0, config),
    onchain: [],
  };
}
export class ReplayReader {
  private index = 0;
  private until = 0;
  private observations = new Map<string, Observation>();
  constructor(readonly events: StoryEvent[]) {}
  next(now: number, ready: boolean, spacing: number) {
    if (!ready || now < this.until || this.index >= this.events.length)
      return undefined;
    const event = this.events[this.index++];
    this.until =
      now + (event.kind === "donation" ? spacing : Math.min(1, spacing));
    if (event.kind === "onchain")
      this.observations.set(event.payload.key, event.payload);
    if (event.kind === "acceleration")
      for (const [key, o] of this.observations)
        if (o.txid === event.payload.txid)
          this.observations.set(key, {
            ...o,
            ...(["accepted", "failed"].includes(event.payload.status)
              ? { acceleration: event.payload.status }
              : {}),
          });
    return event;
  }
  pending() {
    return [...this.observations.values()].filter(
      (o) => o.status === "pending",
    );
  }
  finished(now: number) {
    return this.index === this.events.length && now >= this.until;
  }
  get count() {
    return this.index;
  }
}
type Segment = {
  kind: "walk" | "hold" | "slide";
  chapter: number;
  from: number;
  to: number;
  start: number;
  end: number;
};
export class RecapTimeline {
  readonly duration: number;
  private segments: Segment[] = [];
  private index = 0;
  private observations = new Map<string, Observation>();
  private markers: { time: number; event: StoryEvent }[] = [];
  constructor(
    private config: Config,
    readonly finalTotal: number,
    events: StoryEvent[],
  ) {
    const target = progression(finalTotal, config);
    let clock = 0;
    const add = (
      kind: Segment["kind"],
      chapter: number,
      from: number,
      to: number,
      duration: number,
    ) => {
      this.segments.push({
        kind,
        chapter,
        from,
        to,
        start: clock,
        end: clock + duration,
      });
      clock += duration;
    };
    add("hold", 0, 0, 0, 1.4);
    for (let chapter = 0; chapter <= target.chapter; chapter++) {
      const end = chapter === target.chapter ? target.progress : 1;
      if (end >= 0.5) {
        add("walk", chapter, 0, 0.5, 2);
        add("hold", chapter, 0.5, 0.5, 0.4);
        if (end > 0.5) add("walk", chapter, 0.5, end, (end - 0.5) * 4);
      } else if (end > 0) add("walk", chapter, 0, end, end * 4);
      add("hold", chapter, end, end, chapter === target.chapter ? 1.2 : 0.4);
      if (chapter < target.chapter) add("slide", chapter, 1, 1, 0.8);
    }
    this.duration = Math.min(30, Math.max(8, clock));
    const factor = this.duration / clock;
    this.segments = this.segments.map((s) => ({
      ...s,
      start: s.start * factor,
      end: s.end * factor,
    }));
    let total = 0;
    for (const event of events) {
      if (event.kind === "donation") total = event.payload.total;
      this.markers.push({ time: this.timeForTotal(total), event });
    }
    // Preserve journal order when several phases share an amount. No historical quiet periods.
    let previous = 0;
    for (const marker of this.markers) {
      marker.time = Math.max(previous, marker.time);
      previous = marker.time;
    }
  }
  private timeForTotal(total: number) {
    if (total >= this.config.goal) return this.duration - 1;
    const p = progression(total, this.config);
    const segment = this.segments.find(
      (s) => s.kind === "walk" && s.chapter === p.chapter && s.to >= p.progress,
    );
    if (!segment)
      return (
        this.segments.find((s) => s.chapter === p.chapter)?.start ??
        this.duration - 1
      );
    return (
      segment.start +
      ((segment.end - segment.start) * (p.progress - segment.from)) /
        Math.max(0.0001, segment.to - segment.from)
    );
  }
  sample(now: number) {
    const time = Math.max(0, Math.min(this.duration, now));
    const s = this.segments.find((s) => time < s.end) ?? this.segments.at(-1)!;
    const p = Math.max(0, Math.min(1, (time - s.start) / (s.end - s.start)));
    const eased = p * p * (3 - 2 * p);
    return {
      chapter: s.chapter,
      progress: s.from + (s.to - s.from) * eased,
      walking: s.kind === "walk" || s.kind === "slide",
      transitioning: s.kind === "slide",
      slide: s.kind === "slide" ? eased : 0,
      ...(s.kind === "slide" ? { nextChapter: s.chapter + 1 } : {}),
    };
  }
  due(now: number) {
    const events: StoryEvent[] = [];
    while (
      this.index < this.markers.length &&
      this.markers[this.index].time <= now
    ) {
      const e = this.markers[this.index++].event;
      events.push(e);
      if (e.kind === "onchain") this.observations.set(e.payload.key, e.payload);
      if (e.kind === "acceleration")
        for (const [key, o] of this.observations)
          if (
            o.txid === e.payload.txid &&
            ["accepted", "failed"].includes(e.payload.status)
          )
            this.observations.set(key, {
              ...o,
              acceleration: e.payload.status,
            });
    }
    return events;
  }
  pending() {
    return [...this.observations.values()].filter(
      (o) => o.status === "pending",
    );
  }
  finished(now: number) {
    return now >= this.duration;
  }
}
