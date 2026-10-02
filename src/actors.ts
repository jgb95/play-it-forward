import { encounterPose, portalFor, formationSlot } from "./encounters";
import { clipEntrance } from "./scenery";
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
  facing = 1,
) {
  const [coat, skin, hair] = outfits[sprite] ?? outfits.volunteer;
  const step = walking ? Math.sin(time * 11) : 0;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  };
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.scale(scale * facing, scale);
  rect(-6, 0, 13, 2, "#09232966");
  rect(-4, -12, 3, 12, "#22303b");
  rect(2, -12, 3, 12, "#283847");
  rect(-5, -1 + Math.max(0, step), 5, 2, "#e5d8bc");
  rect(1, -1 + Math.max(0, -step), 5, 2, "#cbbfb0");
  c.translate(0, walking ? -Math.abs(step) * 0.6 : Math.sin(time * 2) * 0.25);
  rect(-6, -25, 12, 14, coat);
  const swing = walking ? step * 2 : 0;
  rect(-7, -22 + swing, 2, 10, coat);
  rect(-7, -13 + swing, 2, 3, skin);
  rect(6, -23 - swing, 2, waving ? 5 : 10, coat);
  if (waving) rect(7, -22, 6, 3, coat);
  rect(waving ? 12 : 6, waving ? -22 : -14 - swing, 3, 3, skin);
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
  scene = 0,
  handing = new Set<string>(),
  joinSeconds = 2.1,
) {
  for (let i = crew.length - 1; i >= 0; i--) {
    const member = crew[i];
    if (handing.has(member.id)) continue;
    const slot = formationSlot(x, y, i);
    const target = slot.x,
      feet = slot.y;
    const joined = joins.get(member.id),
      p =
        joined === undefined || reduced
          ? 1
          : Math.min(1, Math.max(0, (time - joined) / joinSeconds));
    const portal = portalFor(scene, i);
    const pavement = Math.max(0, (p - 0.3) / 0.7);
    const memberX = p < 1 ? portal.x + (target - portal.x) * pavement : target;
    const memberY =
      p < 0.3
        ? portal.y + (5 * p) / 0.3
        : portal.y + (feet - portal.y) * pavement;
    c.save();
    if (p < 1) clipEntrance(c, portal);
    actor(
      c,
      memberX,
      memberY,
      reduced ? 0 : time,
      member.sprite,
      walking || p < 1,
      p > 0.7 && p < 0.95,
      1.25,
      p < 1 && target < portal.x ? -1 : 1,
    );
    c.restore();
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
  scene = 0,
) {
  const pose = encounterPose(scene, id, x, y, age, duration, reduced);
  c.save();
  clipEntrance(c, pose.portal);
  if (id % 4 === 1) {
    c.strokeStyle = "#bed9d4";
    c.lineWidth = 1;
    for (const dx of [-13, 13]) {
      c.beginPath();
      c.arc(pose.x + dx, pose.y - 4, 7, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = "#dbac71";
    c.beginPath();
    c.moveTo(pose.x - 13, pose.y - 4);
    c.lineTo(pose.x, pose.y - 16);
    c.lineTo(pose.x + 13, pose.y - 4);
    c.closePath();
    c.stroke();
  }
  actor(
    c,
    pose.x,
    pose.y,
    reduced ? 0 : time,
    ["volunteer", "tinkerer", "hacker", "artist", "builder", "host"][id % 6],
    pose.walking,
    pose.reaching,
    1.4,
    pose.facing,
  );
  c.restore();
  return {
    x: pose.x + pose.facing * 19,
    y: pose.y - 29,
    transfer: pose.transfer,
    reaching: pose.reaching,
  };
}
