import type { Locale } from "../shared/model";

// Original phrases, synthesized locally. No recordings or external music service.
export const cityScores = {
  berlin: {
    bpm: 104,
    notes: [57, 64, 60, 64, 57, 67, 64, 60, 53, 60, 57, 60, 55, 62, 59, 62],
    bass: [45, 45, 41, 43],
    wave: "triangle",
  },
  seoul: {
    bpm: 78,
    notes: [62, 66, 69, 73, 74, 73, 69, 66, 62, 66, 69, 66, 59, 62, 66, 69],
    bass: [38, 43, 38, 35],
    wave: "sine",
  },
} as const;
export function startCityMusic(
  context: AudioContext,
  locale: Locale,
  volume: number,
) {
  const score = cityScores[locale];
  const master = context.createGain();
  master.gain.value = volume * 0.12;
  master.connect(context.destination);
  let beat = 0,
    next = context.currentTime + 0.05;
  const active = new Set<OscillatorNode>();
  function note(midi: number, at: number, duration: number, level: number) {
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = score.wave;
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(master);
    active.add(oscillator);
    oscillator.onended = () => {
      active.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
  }
  function schedule() {
    if (context.state !== "running") return;
    if (next < context.currentTime) next = context.currentTime + 0.05;
    while (next < context.currentTime + 0.3) {
      note(score.notes[beat % 16], next, 0.65, 0.65);
      if (beat % 4 === 0)
        note(score.bass[Math.floor(beat / 4) % 4], next, 0.9, 0.8);
      beat++;
      next += 30 / score.bpm;
    }
  }
  schedule();
  const timer = setInterval(schedule, 100);
  return () => {
    clearInterval(timer);
    master.disconnect();
    active.forEach((o) => o.stop());
  };
}
