import type { Recruit } from "../shared/model";
const outfits: Record<string, [string, string, string]> = {
  volunteer: ["#f6a552", "#e4bd9b", "#443632"],
  tinkerer: ["#76bda5", "#ac795b", "#332c35"],
  hacker: ["#aa9ad5", "#ddb799", "#26283e"],
  artist: ["#ec8ca4", "#9f7058", "#542f35"],
  builder: ["#e3bd6b", "#c79a7d", "#423e33"],
  host: ["#69b6ce", "#d4b399", "#263847"],
};
export function actor(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  sprite: string,
  walking: boolean,
  waving = false,
  scale = 1.4,
) {
  const [coat, skin, hair] = outfits[sprite] ?? outfits.volunteer;
  const step = walking ? Math.sin(time * 11) : 0;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  };
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.scale(scale, scale);
  rect(-6, 0, 13, 2, "#09232966");
  rect(-4, -12, 3, 12, "#22303b");
  rect(2, -12, 3, 12, "#283847");
  rect(-5, -1 + Math.max(0, step), 5, 2, "#e5d8bc");
  rect(1, -1 + Math.max(0, -step), 5, 2, "#cbbfb0");
  c.translate(0, walking ? -Math.abs(step) * 0.6 : Math.sin(time * 2) * 0.25);
  rect(-6, -25, 12, 14, coat);
  rect(-7, -22, 2, 10, coat);
  rect(-7, -13, 2, 3, skin);
  rect(6, -23, 2, waving ? 5 : 10, coat);
  rect(waving ? 8 : 6, waving ? -26 : -14, 3, 3, skin);
  rect(-4, -36, 9, 11, skin);
  rect(-5, -37, 11, 4, hair);
  rect(-5, -34, 2, 7, hair);
  rect(2, -31, 1, 1, "#22323a");
  rect(1, -27, 3, 1, "#8c5f54");
  if (sprite === "volunteer") {
    rect(-6, -39, 13, 4, "#ffa94c");
    rect(3, -37, 5, 2, "#ffd089");
    rect(-1, -22, 3, 4, "#ffe1a1");
  }
  if (sprite === "tinkerer") {
    rect(-5, -37, 10, 2, "#ebc76f");
    rect(-4, -22, 8, 12, "#486269");
    rect(0, -20, 1, 8, "#bdced0");
  }
  if (sprite === "hacker") {
    rect(-5, -34, 11, 3, "#222438");
    rect(-6, -36, 2, 9, "#9ae1d4");
    rect(-1, -20, 5, 3, "#b9c5f2");
  }
  if (sprite === "artist") {
    rect(-6, -39, 13, 3, "#b97ac0");
    rect(-4, -20, 2, 3, "#74d7c4");
    rect(0, -18, 2, 2, "#ffe294");
    rect(7, -16, 1, 8, "#dbb28d");
  }
  if (sprite === "builder") {
    rect(-5, -40, 10, 3, "#ffc966");
    rect(-7, -37, 14, 2, "#ffb551");
    rect(-5, -24, 2, 10, "#fff0ac");
    rect(3, -24, 2, 10, "#fff0ac");
  }
  if (sprite === "host") {
    rect(-2, -24, 4, 5, "#fde5b2");
    rect(-1, -24, 2, 3, "#f79e57");
    rect(7, -15, 4, 6, "#d8dfda");
  }
  c.restore();
}
export function crewActors(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  crew: Recruit[],
  walking: boolean,
  joins: Map<string, number>,
  reduced: boolean,
) {
  for (let i = crew.length - 1; i >= 0; i--) {
    const member = crew[i],
      column = Math.floor(i / 2) + 1,
      row = i % 2;
    const target = Math.max(12, x - column * 24),
      feet = y - (row ? 17 : 2);
    const joined = joins.get(member.id),
      p =
        joined === undefined || reduced
          ? 1
          : Math.min(1, Math.max(0, (time - joined) / 1.3));
    const from = Math.min(617, x + 65);
    actor(
      c,
      from + (target - from) * (p * p * (3 - 2 * p)),
      feet,
      reduced ? 0 : time,
      member.sprite,
      walking || p < 1,
      p < 0.5,
      1.25,
    );
  }
}
export function supporter(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  id: number,
  age: number,
  reduced: boolean,
  duration = 3.2,
) {
  const p = reduced ? 0.5 : Math.max(0, Math.min(1, age / duration));
  const meet = Math.min(613, x + 34),
    spawn = Math.min(631, x + 105);
  const distance = p < 0.3 ? 1 - p / 0.3 : p > 0.72 ? (p - 0.72) / 0.28 : 0;
  const donorX = meet + (spawn - meet) * distance;
  c.save();
  c.globalAlpha = p > 0.9 ? (1 - p) / 0.1 : 1;
  if (id % 4 === 1) {
    c.strokeStyle = "#bad4cb";
    c.lineWidth = 2;
    for (const wx of [donorX - 13, donorX + 13]) {
      c.beginPath();
      c.arc(wx, y - 4, 7, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = "#deaa69";
    c.beginPath();
    c.moveTo(donorX - 13, y - 4);
    c.lineTo(donorX, y - 16);
    c.lineTo(donorX + 13, y - 4);
    c.lineTo(donorX - 13, y - 4);
    c.stroke();
  }
  actor(
    c,
    donorX,
    y - (id % 4 === 1 ? 6 : 0),
    reduced ? 0 : time,
    ["volunteer", "tinkerer", "hacker", "artist", "builder", "host"][id % 6],
    distance > 0.05,
    p >= 0.3 && p <= 0.72,
  );
  c.restore();
  return { x: donorX - 9, y: y - 24 };
}
