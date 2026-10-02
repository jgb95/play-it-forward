import { actor, crewActors, supporter } from "./actors";
import {
  architecture,
  galleryBackdrop,
  hallDetails,
  drawPortals,
  expressTrain,
  expressOrbits,
} from "./scenery";
import {
  companionHandoff,
  equippedRewards,
  pickupProgress,
  portalFor,
  type Pickup,
  type ExpressCue,
} from "./encounters";
import type { Recruit } from "../shared/model";
import type { State } from "../shared/model";
const W = 640,
  H = 300;
const palette = {
  ink: "#142c2d",
  deep: "#0d2025",
  teal: "#285956",
  mint: "#78a99a",
  orange: "#ffa34d",
  gold: "#ffd897",
  stone: "#acaa88",
};
let seed = 8;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function box(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}
function glow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "#ffa34d00");
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
function building(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
  lit = true,
) {
  box(c, x, y, w, h, col);
  box(c, x - 2, y, w + 4, 4, "#425451");
  for (let a = x + 7; a < x + w - 5; a += 13)
    for (let b = y + 12; b < y + h - 6; b += 18) {
      box(
        c,
        a,
        b,
        6,
        9,
        lit && rand() > 0.4
          ? ["#ffd58a", "#ef987e", "#97c9c2"][Math.floor(rand() * 3)]
          : "#203e40",
      );
      box(c, a, b + 4, 6, 1, col);
    }
  for (let a = y + 9; a < y + h; a += 12) box(c, x, a, w, 1, "#ffffff06");
}
function tree(c: CanvasRenderingContext2D, x: number, y: number, s = 1) {
  box(c, x - 2, y - 35 * s, 5, 38 * s, "#263936");
  for (let i = 0; i < 30; i++)
    box(
      c,
      x - 24 * s + rand() * 44 * s,
      y - 62 * s + rand() * 39 * s,
      10 * s,
      8 * s,
      rand() > 0.6 ? "#617356" : "#354d3e",
    );
}
function lamp(c: CanvasRenderingContext2D, x: number, y: number) {
  box(c, x, y - 57, 2, 57, "#10272a");
  box(c, x - 7, y - 58, 15, 3, "#233b37");
  box(c, x - 4, y - 56, 8, 8, palette.gold);
  box(c, x - 6, y - 48, 12, 2, "#10272a");
  glow(c, x, y - 51, 30, "#ffbc5935");
}
function stall(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
) {
  box(c, x, y, 54, 30, "#182e2d");
  box(c, x - 4, y - 6, 62, 8, color);
  box(c, x + 2, y + 2, 2, 27, "#9e895a");
  box(c, x + 49, y + 2, 2, 27, "#9e895a");
  box(c, x + 5, y + 14, 43, 5, "#b78b4d");
  for (let i = 0; i < 8; i++)
    box(c, x + 8 + i * 4, y + 9, 3, 5, i % 2 ? "#bd6744" : "#cab35b");
  glow(c, x + 26, y + 6, 30, "#ffb84b28");
}
export function background(scene: number, vaultOpen: boolean, tier: number) {
  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const c = cvs.getContext("2d")!;
  seed = 7 + scene;
  const sky = c.createLinearGradient(0, 0, 0, 240);
  const skies = [
    ["#243b58", "#b87972", "#ffbd7b"],
    ["#193d57", "#9c7990", "#fbbf8c"],
    ["#273b60", "#b87685", "#ffba69"],
    ["#30395d", "#ae6a84", "#efa76e"],
    ["#273d59", "#ba837c", "#ffce89"],
    ["#192e43", "#57665a", "#d5aa66"],
  ][scene];
  sky.addColorStop(0, skies[0]);
  sky.addColorStop(0.65, skies[1]);
  sky.addColorStop(1, skies[2]);
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  box(c, 493, 35, 23, 23, "#e3d4a1");
  box(c, 489, 39, 31, 15, "#e3d4a1");
  glow(c, 504, 46, 55, "#ffd49c20");
  for (let i = 0; i < 16; i++)
    building(
      c,
      i * 44 - 10,
      105 + rand() * 40,
      35 + rand() * 25,
      110,
      "#334758",
    );
  box(c, 0, 219, 640, 81, "#51434c");
  box(c, 0, 221, 640, 5, "#b3a07a");
  for (let i = 0; i < 1000; i++) {
    const x = rand() * 640,
      y = 230 + rand() * 70;
    box(c, x, y, 2 + rand() * 5, 1, rand() > 0.4 ? "#78635d" : "#303f48");
  }
  if ([0, 1, 2, 4].includes(scene)) {
    architecture(c, scene);
  } else if (scene === 3) {
    galleryBackdrop(c);

    box(c, 40, 140, 560, 80, "#c8b686");
    for (let x = 40; x < 600; x += 70) {
      box(c, x, 138, 3, 84, "#74836a");
      const colors = ["#f89954", "#518e88", "#d8bb75", "#a47578"];
      box(c, x + 5, 150, 59, 58, colors[Math.floor(x / 70) % 4]);
      for (let i = 0; i < 16; i++)
        box(
          c,
          x + rand() * 62,
          150 + rand() * 56,
          4 + rand() * 15,
          3,
          colors[i % 4],
        );
    }
    c.fillStyle = "#1e5352";
    c.font = "bold 20px monospace";
    c.fillText("LOVE", 70, 189);
    c.fillStyle = "#ffda8c";
    c.fillText("++", 421, 189);
    for (let i = 0; i < 12; i++) {
      box(c, 258 + i * 5, 156 + Math.sin(i * 0.6) * 10, 5, 31, "#edb270");
      box(c, 258 + i * 5, 184 + Math.sin(i * 0.6) * 8, 5, 5, "#183d40");
    }
    tree(c, 23, 230, 1.3);
    tree(c, 619, 232, 1.4);
    lamp(c, 200, 241);
    lamp(c, 518, 241);
  } else {
    box(c, 0, 0, 640, 300, "#1d3040");
    building(c, 35, 85, 570, 145, "#39484a", false);
    for (let row = 0; row < 13; row++)
      for (let col = 0; col < 35; col++)
        box(
          c,
          40 + col * 16 + (row % 2) * 8,
          89 + row * 10,
          13,
          7,
          row % 3 ? "#4c514d" : "#565247",
        );
    box(c, 47, 103, 548, 6, "#81968b");
    box(c, 70, 120, 530, 104, "#173337");
    for (let i = 0; i < 7; i++) {
      box(c, 80 + i * 57, 127, 47, 74, vaultOpen ? "#b4a672" : "#315454");
      box(c, 102 + i * 57, 127, 2, 74, "#1f4343");
      box(c, 80 + i * 57, 153, 47, 2, "#2d4642");
    }
    box(c, 182, 76, 283, 38, "#1c343b");
    box(c, 185, 79, 277, 2, "#eaad6b");
    c.fillStyle = "#ffe5b4";
    c.font = "bold 15px monospace";
    c.fillText("bitcoin++", 233, 96);
    c.font = "8px monospace";
    c.fillText("COMMUNITY BUILD NIGHT", 242, 108);
    box(c, 454, 125, 102, 109, "#4e807c");
    box(c, 461, 130, 88, 102, vaultOpen ? "#ffc885" : "#1d4449");
    if (vaultOpen) {
      glow(c, 480, 175, 150, "#ffc87966");
      box(c, 460, 139, 84, 8, "#fff0b8");
      for (let i = 0; i < 6 + Math.min(tier, 12); i++) {
        const x = 90 + (i % 9) * 48,
          y = 178 + Math.floor(i / 9) * 29;
        box(c, x, y, 36, 3, "#b98f68");
        box(c, x + 3, y + 3, 2, 16, "#59473e");
        box(c, x + 29, y + 3, 2, 16, "#59473e");
        box(c, x + 6, y - 14, 22, 13, "#223946");
        box(c, x + 8, y - 12, 18, 8, ["#80d8bb", "#df9ec6", "#edc272"][i % 3]);
        box(c, x + 16, y - 1, 2, 2, "#d1cda5");
        box(c, x + 20, y + 5, 5, 8, ["#79aca0", "#ac7fab", "#d79d76"][i % 3]);
        box(c, x + 20, y + 1, 4, 4, "#d8af88");
      }
      c.fillStyle = "#274944";
      c.font = "bold 8px monospace";
      c.fillText("COME BUILD!", 466, 154);
    } else {
      box(c, 504, 131, 2, 99, "#79a799");
      box(c, 492, 179, 3, 5, "#ffe0a0");
      box(c, 513, 179, 3, 5, "#ffe0a0");
      c.fillStyle = "#ffe0ac";
      c.font = "7px monospace";
      c.fillText("GET THE CREW", 469, 150);
      c.fillText("TOGETHER", 475, 160);
    }
    box(c, 0, 235, 640, 65, "#64515b");
    box(c, 0, 234, 640, 2, "#c2a276");
    lamp(c, 57, 233);
    lamp(c, 594, 233);
    for (let i = 0; i < 14; i++) {
      const x = 50 + i * 41,
        y = 61 + Math.sin(i * 0.4) * 9;
      box(c, x, y, 2, 2, "#ffe4aa");
      glow(c, x, y, 14, "#ffb75128");
    }
    for (let i = 0; i < 70; i++)
      box(c, rand() * 640, 242 + rand() * 57, 6, 1, "#c6a38222");
  }
  if (scene === 5) hallDetails(c, vaultOpen, tier);
  drawPortals(c, scene);
  // Restrained lighting frames each location without masking its landmarks.
  if (scene !== 5) {
    for (let i = 0; i < 16; i++) {
      const x = 18 + i * 40,
        y = 30 + Math.sin(i * 0.4) * 7;
      box(c, x, y, 40, 1, "#172c38");
      box(c, x + 18, y + 3, 3, 4, i % 3 ? "#ffcd83" : "#f3a8a4");
      glow(c, x + 19, y + 5, 15, "#ffb85635");
    }
    for (let i = 0; i < 10; i++) {
      const x = 22 + i * 61;
      box(c, x, 207, 4, 5, "#b99382");
      box(
        c,
        x - 1,
        212,
        6,
        9,
        ["#d57865", "#467d8c", "#aa8753", "#785d8c"][i % 4],
      );
      box(c, x, 221, 2, 6, "#203138");
      box(c, x + 3, 221, 2, 6, "#203138");
    }
  }
  for (let side = 0; side < 2; side++)
    for (let i = 0; i < 22; i++) {
      const x = side ? 606 + rand() * 34 : rand() * 34,
        y = 281 + rand() * 19;
      box(c, x, y, 2, 9, "#397c61");
      box(c, x - 2, y - 2, 5, 3, ["#f39c86", "#ffcf77", "#ac8bcc"][i % 3]);
    }
  for (let i = 0; i < 300; i++)
    box(c, rand() * 640, rand() * 300, 1, 1, "#fff6c10c");
  return cvs;
}
function courier(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  rewards: string[],
  celebrate: boolean,
  walking: boolean,
  reaching = 0,
) {
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.scale(2, 2);
  const step = walking ? Math.sin(t * 12) : 0,
    bob = walking ? Math.abs(step) * 0.7 : 0;
  box(c, -8, 1, 18, 2, "#102a2588");
  c.translate(0, -bob);
  box(c, -5, -14, 4, 13 + (step > 0 ? 0 : -1), "#152425");
  box(c, 1, -14, 4, 13 + (step > 0 ? -1 : 0), "#1d3030");
  box(c, -6, -2 + Math.max(0, step), 6, 3, "#d4c8ad");
  box(c, 0, -2 + Math.max(0, -step), 7, 3, "#c9bfa8");
  // Feet stay planted while the torso breathes and gently vibes.
  c.translate(
    walking ? 0 : Math.sin(t * 1.8) * 0.1,
    walking
      ? 0
      : Math.sin(t * 2.2) * 0.45 + (celebrate ? Math.sin(t * 5) * 0.6 : 0),
  );
  box(c, -7, -30, 14, 18, "#172729");
  box(c, -5, -30, 10, 3, "#273737");
  box(c, -9, -28, 3, reaching < 0 ? 7 : 13, "#1c3030");
  if (reaching < 0) box(c, -15, -23, 7, 3, "#1c3030");
  box(c, reaching < 0 ? -17 : -9, reaching < 0 ? -23 : -16, 3, 3, "#c9a780");
  box(c, 7, -27, 3, reaching > 0 ? 6 : 11, "#233837");
  if (reaching > 0) box(c, 8, -23, 7, 3, "#233837");
  box(c, reaching > 0 ? 14 : 7, reaching > 0 ? -23 : -16, 3, 4, "#c9a780");
  box(c, -5, -43, 11, 13, "#d0aa80");
  box(c, -6, -44, 12, 5, "#2b3029");
  box(c, -6, -40, 3, 7, "#2b3029");
  box(c, 2, -37, 2, 2, "#28342e");
  box(c, 5, -35, 2, 3, "#d0aa80");
  box(c, 1, -32, 4, 1, "#9b705a");
  if (rewards.includes("hat")) {
    box(c, -7, -46, 14, 5, "#688baa");
    box(c, -6, -49, 11, 4, "#476b94");
    box(c, 4, -43, 6, 2, "#7e9eb9");
    box(c, -2, -47, 5, 1, "#f4eee1");
    box(c, -1, -46, 3, 1, "#f4eee1");
  }
  if (rewards.includes("sunglasses")) {
    box(c, -3, -39, 10, 4, "#34424d");
    box(c, -2, -38, 3, 2, "#e7b369bb");
    box(c, 3, -38, 3, 2, "#e7b369bb");
    box(c, -2, -38, 1, 1, "#fff0bd");
  }
  if (rewards.includes("shirt")) {
    box(c, -2, -25, 4, 8, "#f7931a");
    box(c, 2, -24, 2, 3, "#f7931a");
    box(c, 2, -21, 2, 3, "#f7931a");
    box(c, -3, -24, 1, 6, "#f7931a");
    box(c, -1, -26, 1, 10, "#f7931a");
    box(c, 1, -26, 1, 10, "#f7931a");
    box(c, 0, -23, 2, 1, "#172729");
    box(c, 0, -20, 2, 1, "#172729");
  }
  box(c, -6, -29, 2, 17, "#9c8767");
  box(c, -9, -19, 10, 9, rewards.includes("bag") ? "#ffa34d" : "#9a7c55");
  box(c, -8, -17, 8, 2, rewards.includes("bag") ? "#ffcf84" : "#b99a6f");
  box(c, -4, -14, 2, 2, "#f8d49c");
  if (rewards.includes("key")) {
    box(c, 8, -13, 1, 6, "#ffda78");
    box(c, 7, -14, 3, 3, "#ffda78");
    box(c, 9, -9, 2, 1, "#ffda78");
  }
  c.restore();
}
function accessory(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  reward: string,
) {
  if (reward === "hat") {
    box(c, x - 10, y - 6, 18, 8, "#52789f");
    box(c, x + 4, y, 11, 3, "#7897b6");
    box(c, x - 4, y - 4, 7, 2, "#f0eee4");
  } else if (reward === "sunglasses") {
    box(c, x - 11, y - 3, 9, 7, "#e6b36e");
    box(c, x + 2, y - 3, 9, 7, "#e6b36e");
    box(c, x - 2, y - 2, 4, 2, "#354a56");
    box(c, x - 11, y - 4, 22, 1, "#354a56");
  } else if (reward === "shirt") {
    box(c, x - 9, y - 9, 18, 20, "#172729");
    box(c, x - 14, y - 7, 28, 6, "#172729");
    box(c, x - 3, y - 4, 7, 10, "#f7931a");
    box(c, x - 1, y - 6, 1, 14, "#f7931a");
    box(c, x + 2, y - 6, 1, 14, "#f7931a");
  } else if (reward === "bag") {
    box(c, x - 10, y - 7, 20, 15, "#ffa34d");
    box(c, x - 8, y - 10, 16, 3, "#b67c57");
    box(c, x - 8, y - 4, 16, 3, "#ffd18b");
    box(c, x - 1, y, 3, 4, "#fff0bf");
  } else {
    box(c, x - 8, y - 7, 8, 8, "#ffe09b");
    box(c, x - 6, y - 5, 4, 4, "#546467");
    box(c, x - 1, y - 3, 14, 3, "#ffe09b");
    box(c, x + 8, y - 1, 3, 4, "#ffe09b");
  }
}
export type Trail = {
  born: number;
  index: number;
  amount: number;
  milestone: boolean;
  duration: number;
  visitor?: boolean;
};
function environment(
  c: CanvasRenderingContext2D,
  bg: HTMLCanvasElement,
  state: State,
  time: number,
  reduced: boolean,
) {
  const t = reduced ? 0 : time;
  c.imageSmoothingEnabled = false;
  c.drawImage(bg, 0, 0);
  const scene = state.chapter;
  if (scene === 0 || scene === 2) {
    const x = ((t * (scene === 0 ? 22 : 16)) % 950) - 280;
    box(c, x, 198, 155, 19, scene === 0 ? "#b8bec5" : "#e7c34e");
    for (let i = 0; i < 9; i++) box(c, x + 6 + i * 16, 201, 10, 9, "#234746");
    box(c, x, 213, 155, 4, "#2a3b36");
    box(c, x + 15, 215, 9, 4, "#122d2c");
    box(c, x + 125, 215, 9, 4, "#122d2c");
  }
  if (scene === 1)
    for (let i = 0; i < 16; i++)
      box(c, (i * 47 + t * 5) % 640, 190 + (i % 5) * 7, 14, 1, "#c0b78955");
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4 + t * 0.15;
    const px = (i * 93 + t * 3) % 640,
      py = 70 + ((i * 23) % 155) + Math.sin(a) * 5;
    const alpha = 0.2 + (0.3 * (1 + Math.sin(t * 1.4 + i))) / 2;
    box(c, px, py, 2, 2, `rgba(255,213,136,${alpha})`);
  }
  if (scene === 3 && !reduced)
    for (let i = 0; i < 7; i++)
      box(
        c,
        (t * 12 + i * 113) % 640,
        220 + Math.sin(t + i) * 20,
        3,
        2,
        "#bc9d66",
      );
  if (state.vaultOpen) {
    glow(c, 489, 171, 75, "#ffd16e22");
    for (let i = 0; i < state.treasureTier * 2; i++)
      box(
        c,
        435 + ((i * 31) % 111),
        135 + Math.sin(t * 2 + i) * 8 + (i % 3) * 22,
        2,
        2,
        "#ffdda0",
      );
  }
}
export function render(
  c: CanvasRenderingContext2D,
  bg: HTMLCanvasElement,
  state: State,
  time: number,
  trails: Trail[],
  reduced: boolean,
  pose: {
    x: number;
    pickups?: Pickup[];
    express?: ExpressCue;
    walking: boolean;
    crew?: Recruit[];
    waiting?: Recruit;
    joins?: Map<string, number>;
    joinSeconds?: number;
    slide: number;
    incoming?: { bg: HTMLCanvasElement; state: State };
  },
) {
  c.clearRect(0, 0, W, H);
  c.save();
  c.translate(-W * pose.slide, 0);
  environment(c, bg, state, time, reduced);
  if (pose.incoming) {
    c.translate(W, 0);
    environment(c, pose.incoming.bg, pose.incoming.state, time, reduced);
  }
  if (pose.express) expressTrain(c, pose.express, time, reduced);
  c.restore();
  const x = pose.x,
    y = 254;
  if (pose.waiting) {
    const portal = portalFor(state.chapter, (pose.crew ?? []).length);
    actor(
      c,
      portal.x,
      portal.y,
      reduced ? 0 : time,
      pose.waiting.sprite,
      false,
      false,
      1.25,
    );
  }
  crewActors(
    c,
    x,
    y,
    reduced ? 0 : time,
    pose.crew ?? [],
    pose.walking && !reduced,
    pose.joins ?? new Map(),
    reduced,
    state.chapter,
    new Set(
      (pose.pickups ?? [])
        .filter((p) => time >= p.born)
        .map((p) => pose.crew?.[Math.max(0, p.giver - 1)]?.id)
        .filter((id): id is string => !!id),
    ),
    pose.joinSeconds,
  );
  const visitor = trails.findLast(
    (trail) => trail.visitor && time - trail.born < trail.duration,
  );
  const donor = visitor
    ? supporter(
        c,
        x,
        y,
        time,
        visitor.index,
        time - visitor.born,
        reduced,
        visitor.duration,
        state.chapter,
      )
    : undefined;
  if (visitor && donor?.reaching && donor.transfer === 0) {
    glow(c, donor.x, donor.y, 17, "#ffe3a377");
    box(c, donor.x - 4, donor.y - 4, 9, 9, "#ffcd74");
    box(c, donor.x - 1, donor.y - 2, 3, 5, "#fff1c9");
  }
  courier(
    c,
    x,
    y,
    reduced ? 0 : time,
    equippedRewards(state.rewards, pose.pickups ?? [], time, reduced),
    trails.length > 0,
    pose.walking && !reduced,
    donor?.reaching
      ? Math.sign(donor.x - x)
      : (pose.pickups ?? []).some(
            (p) => time >= p.born && pickupProgress(p, time, reduced) < 0.8,
          )
        ? -1
        : 0,
  );
  for (const pickup of pose.pickups ?? []) {
    if (time < pickup.born) continue;
    const p = pickupProgress(pickup, time, reduced);
    if (p >= 1) continue;
    const memberIndex = Math.max(0, pickup.giver - 1),
      member = pose.crew?.[memberIndex];
    const handoff = companionHandoff(x, y, memberIndex, p);
    if (member)
      actor(
        c,
        handoff.x,
        handoff.y,
        reduced ? 0 : time,
        member.sprite,
        handoff.walking,
        handoff.reaching,
        1.25,
        1,
      );
    const giver = member
      ? { x: handoff.x + 17, y: handoff.y - 28 }
      : supporter(
          c,
          x,
          y,
          time,
          pickup.giver + 20,
          time - pickup.born,
          reduced,
          pickup.duration,
          state.chapter,
        );
    if (p < 0.28 || p >= 0.65) continue;
    const q = Math.max(0, Math.min(1, (p - 0.42) / 0.23));
    const receiveX = x + Math.sign(giver.x - x) * 25;
    const itemX = giver.x + (receiveX - giver.x) * q;
    const itemY = giver.y + (y - 43 - giver.y) * q - Math.sin(q * Math.PI) * 9;
    accessory(c, itemX, itemY, pickup.reward);
    glow(c, itemX, itemY, 18, "#ffd78c55");
  }
  expressOrbits(
    c,
    x,
    y,
    time,
    (state.onchain ?? []).filter((o) => o.txid !== pose.express?.txid),
    reduced,
  );
  if (reduced && trails.length) glow(c, x - 8, y - 27, 34, "#ffb95755");
  for (const trail of reduced ? [] : trails) {
    const age = time - trail.born,
      p = trail.visitor
        ? Math.max(0, Math.min(1, (age / trail.duration - 0.42) / 0.22))
        : Math.min(1, age / trail.duration);
    if (age < 0) continue;
    const color = ["255,206,122", "127,226,211", "255,168,182", "181,169,255"][
      trail.index % 4
    ];
    const origins = [
      [42, 65],
      [595, 76],
      [116, 148],
      [517, 117],
      [315, 36],
      [35, 210],
      [610, 205],
    ];
    const [sx, sy] =
      trail.visitor && donor
        ? [donor.x, donor.y]
        : origins[trail.index % origins.length];
    const strength = Math.min(
      2.4,
      1 + Math.log10(Math.max(1, trail.amount) + 1) * 0.1,
    );
    if (p > 0 && p < 1) {
      for (let j = 0; j < 24; j++) {
        const q = Math.max(0, p - j * 0.012);
        const tx = sx + (x - 8 - sx) * q + Math.sin(q * Math.PI * 2) * 18,
          ty =
            sy +
            (y - 27 - sy) * q -
            Math.sin(q * Math.PI) * (45 + (trail.index % 3) * 14);
        glow(
          c,
          tx,
          ty,
          j < 3 ? 10 * strength : 3,
          `rgba(${color},${(1 - j / 24) * 0.13})`,
        );
        box(
          c,
          tx,
          ty,
          j < 3 ? 3 * strength : 2,
          j < 3 ? 3 * strength : 2,
          `rgba(${color},${1 - j / 25})`,
        );
        if (j % 3 === 0)
          box(
            c,
            tx + Math.sin(time * 4 + j) * 9,
            ty + Math.cos(time * 3 + j) * 7,
            1,
            1,
            "#fff6da",
          );
      }
      glow(c, sx, sy, 26 * Math.sin(p * Math.PI), `rgba(${color},.22)`);
    }
    const arrival = Math.max(
      0,
      age - trail.duration * (trail.visitor ? 0.64 : 0.8),
    );
    if (arrival > 0 && arrival < 2.4) {
      const fade = 1 - arrival / 2.4;
      glow(
        c,
        x - 8,
        y - 27,
        (28 + arrival * 28) * strength,
        `rgba(${color},${fade * 0.27})`,
      );
      c.strokeStyle = `rgba(${color},${fade * 0.65})`;
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(
        x,
        y + 2,
        13 + arrival * 40,
        3 + arrival * 8,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
      for (let j = 0; j < (trail.milestone ? 28 : 12); j++) {
        const a = j * 2.399,
          radius = arrival * (18 + (j % 5) * 4);
        box(
          c,
          x - 8 + Math.cos(a) * radius,
          y - 27 + Math.sin(a) * radius - arrival * 13,
          2,
          2,
          `rgba(${color},${fade})`,
        );
      }
      // A gift briefly lights the city, not just the satchel.
      for (const lx of [67, 163, 453, 556])
        glow(c, lx, 191, 22 + arrival * 6, `rgba(255,197,113,${fade * 0.13})`);
    }
    if (trail.milestone && age > 0.6 && age < 4.8) {
      const fade = Math.sin(Math.min(1, (age - 0.6) / 4.2) * Math.PI);
      for (let j = 0; j < 24; j++) {
        const fx = (j * 79 + trail.index * 43) % W,
          fy = 26 + ((age * 20 + j * 17) % 170);
        box(c, fx, fy, 2, 4, `rgba(${color},${fade * 0.75})`);
      }
    }
  }
  // Drifting petals and a soft foreground vignette: atmospheric depth without moving the courier.
  if (!reduced && state.chapter !== 5)
    for (let i = 0; i < 7; i++) {
      const px = (i * 101 + time * 5) % W,
        py = 60 + ((i * 31 + time * 8) % 210);
      box(
        c,
        px + Math.sin(time + i) * 7,
        py,
        2,
        1,
        i % 2 ? "#ffd2b355" : "#d8b5f055",
      );
    }
  const vignette = c.createLinearGradient(0, 260, 0, H);
  vignette.addColorStop(0, "#17233200");
  vignette.addColorStop(1, "#17233255");
  c.fillStyle = vignette;
  c.fillRect(0, 260, W, 40);
}
