import type { Config } from "../shared/model";
export class MovieDirector {
  private started = 0;
  private pausedAt: number | null = null;
  private pausedMs = 0;
  private duration = 180;
  private points: number[] = [];
  private index = 0;
  private running = false;
  start(now: number, duration: number, total: number, config: Config) {
    if (!Number.isInteger(duration) || duration < 30 || duration > 1800)
      throw Error("Choose 30–1800 seconds");
    if (total >= config.goal)
      throw Error("Reset the demo before starting another movie");
    this.started = now;
    this.duration = duration;
    this.pausedAt = null;
    this.pausedMs = 0;
    this.index = 0;
    this.running = true;
    const stops = [
      total,
      ...config.chapters.map((c) => c.threshold).filter((t) => t > total),
      config.goal,
    ];
    const steps = Math.max(
      1,
      Math.min(6, Math.floor(duration / ((stops.length - 1) * 6))),
    );
    this.points = [];
    for (let i = 1; i < stops.length; i++)
      for (let j = 1; j <= steps; j++)
        this.points.push(
          Math.round(stops[i - 1] + ((stops[i] - stops[i - 1]) * j) / steps),
        );
  }
  pause(now: number) {
    if (this.running && this.pausedAt === null) this.pausedAt = now;
  }
  resume(now: number) {
    if (this.pausedAt !== null) {
      this.pausedMs += now - this.pausedAt;
      this.pausedAt = null;
    }
  }
  stop() {
    this.running = false;
    this.pausedAt = null;
  }
  status(now: number) {
    const elapsed = this.running
      ? Math.max(
          0,
          ((this.pausedAt ?? now) - this.started - this.pausedMs) / 1000,
        )
      : 0;
    return {
      running: this.running,
      paused: this.pausedAt !== null,
      duration: this.duration,
      elapsed: Math.min(elapsed, this.duration),
      remaining: this.running ? Math.max(0, this.duration - elapsed) : 0,
      gifts: this.index,
      planned: this.points.length,
    };
  }
  due(now: number, total: number): number {
    if (!this.running || this.pausedAt !== null) return 0;
    const elapsed = (now - this.started - this.pausedMs) / 1000;
    if (this.index >= this.points.length || total >= this.points.at(-1)!) {
      this.stop();
      return 0;
    }
    if (elapsed < (this.duration * (this.index + 1)) / this.points.length)
      return 0;
    const amount = Math.max(0, this.points[this.index++] - total);
    if (this.index >= this.points.length) this.stop();
    return amount;
  }
}
