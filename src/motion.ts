// Presentation only: the ledger remains the source of chapter progress.
export type Destination = { chapter: number; progress: number };
export type Pose = Destination & {
  nextChapter?: number;
  slide: number;
  walking: boolean;
  transitioning: boolean;
};
export function courierX(chapter: number, progress: number) {
  return 64 + (chapter === 5 ? 436 : 512) * Math.max(0, Math.min(1, progress));
}
const ease = (p: number) => p * p * (3 - 2 * p);
type Phase = {
  kind: "move" | "approach" | "slide";
  start: number;
  duration: number;
  from: number;
  to: number;
};
export class JourneyMotion {
  private chapter: number;
  private progress: number;
  private target: Destination;
  private phase?: Phase;
  private deadline = 0;
  private traveling = false;
  constructor(target: Destination) {
    this.chapter = target.chapter;
    this.progress = target.progress;
    this.target = { ...target };
  }
  snap(target: Destination) {
    this.chapter = target.chapter;
    this.progress = target.progress;
    this.target = { ...target };
    this.phase = undefined;
    this.traveling = false;
  }
  update(target: Destination, now: number, snap = false) {
    if (
      snap ||
      target.chapter < this.chapter ||
      (target.chapter === this.target.chapter &&
        target.progress < this.target.progress)
    ) {
      this.snap(target);
      return;
    }
    if (
      target.chapter === this.target.chapter &&
      target.progress === this.target.progress
    )
      return;
    this.sample(now);
    this.target = { ...target };
    if (target.chapter > this.chapter) {
      if (!this.phase || this.phase.kind === "move") {
        this.deadline = now + 4;
        this.traveling = true;
        this.phase = {
          kind: "approach",
          start: now,
          duration: 0.35,
          from: this.progress,
          to: 1,
        };
      }
      // Extend the destination, never restart an active camera transition.
    } else {
      this.phase = {
        kind: "move",
        start: now,
        duration: 0.7,
        from: this.progress,
        to: target.progress,
      };
    }
  }
  sample(now: number): Pose {
    if (this.traveling && now >= this.deadline) this.snap(this.target);
    while (this.phase && now >= this.phase.start + this.phase.duration) {
      const phase = this.phase;
      const end = phase.start + phase.duration;
      if (phase.kind === "slide") {
        this.chapter++;
        this.progress = 0;
      } else this.progress = phase.to;
      if (this.chapter < this.target.chapter && phase.kind === "slide") {
        this.phase = {
          kind: "approach",
          start: end,
          duration: 0.15,
          from: 0,
          to: 1,
        };
      } else if (this.chapter < this.target.chapter) {
        const hops = this.target.chapter - this.chapter;
        const duration = Math.max(
          0.01,
          Math.min(1, (this.deadline - end - 0.7 - (hops - 1) * 0.15) / hops),
        );
        this.phase = { kind: "slide", start: end, duration, from: 0, to: 1 };
      } else if (this.progress !== this.target.progress) {
        this.phase = {
          kind: "move",
          start: end,
          duration: 0.7,
          from: this.progress,
          to: this.target.progress,
        };
      } else {
        this.phase = undefined;
        this.traveling = false;
      }
    }
    if (!this.phase)
      return {
        chapter: this.chapter,
        progress: this.progress,
        slide: 0,
        walking: false,
        transitioning: false,
      };
    const phase = this.phase;
    const p = ease(
      Math.max(0, Math.min(1, (now - phase.start) / phase.duration)),
    );
    if (phase.kind === "slide")
      return {
        chapter: this.chapter,
        nextChapter: this.chapter + 1,
        progress: 1,
        slide: p,
        walking: true,
        transitioning: true,
      };
    this.progress = phase.from + (phase.to - phase.from) * p;
    return {
      chapter: this.chapter,
      progress: this.progress,
      slide: 0,
      walking: Math.abs(phase.to - phase.from) > 0.00001,
      transitioning: phase.kind === "approach",
    };
  }
}
