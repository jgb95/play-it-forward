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
      box(c, a, b, 6, 9, lit && rand() > 0.4 ? "#b79b59" : "#203e40");
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
  sky.addColorStop(0, "#183f42");
  sky.addColorStop(0.65, "#527468");
  sky.addColorStop(1, "#c8a36b");
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
      "#294a49",
    );
  box(c, 0, 219, 640, 81, "#3b4940");
  box(c, 0, 221, 640, 5, "#b3a07a");
  for (let i = 0; i < 1000; i++) {
    const x = rand() * 640,
      y = 230 + rand() * 70;
    box(c, x, y, 2 + rand() * 5, 1, rand() > 0.4 ? "#536053" : "#243d36");
  }
  if (scene === 0) {
    box(c, 110, 70, 380, 141, "#233f40");
    box(c, 100, 68, 400, 7, "#77928a");
    for (let x = 119; x < 490; x += 21) {
      box(c, x, 78, 16, 110, "#39716d");
      box(c, x + 1, 79, 7, 108, "#72a09822");
      box(c, x + 7, 78, 2, 110, "#81978a");
    }
    for (let y = 84; y < 186; y += 17) box(c, 110, y, 380, 2, "#183d3e");
    box(c, 114, 185, 372, 26, "#192f30");
    box(c, 250, 110, 100, 13, "#162d2e");
    c.fillStyle = "#f1dba2";
    c.font = "7px monospace";
    c.fillText("BERLIN HAUPTBAHNHOF", 261, 119);
    for (let x = 114; x < 490; x += 63) {
      box(c, x, 185, 6, 37, "#56716a");
      glow(c, x + 31, 192, 32, "#ffd08d30");
    }
    for (let x = 0; x < 640; x += 40) {
      box(c, x, 210, 26, 3, "#667c6e");
      box(c, x, 215, 26, 3, "#b39c70");
    }
    tree(c, 67, 225, 1.4);
    tree(c, 556, 228, 1.35);
    stall(c, 26, 246, "#a66a43");
    stall(c, 540, 247, "#3d7770");
  } else if (scene === 1) {
    box(c, 0, 167, 640, 64, "#255453");
    for (let i = 0; i < 210; i++)
      box(
        c,
        rand() * 640,
        176 + rand() * 53,
        3 + rand() * 18,
        1,
        ["#547c69", "#749182", "#ac9c6e"][i % 3],
      );
    box(c, 0, 177, 640, 8, "#8c9073");
    for (let x = 0; x < 640; x += 100) {
      box(c, x, 185, 32, 40, "#596952");
      box(c, x + 4, 183, 24, 3, "#a5a080");
    }
    box(c, 0, 165, 640, 3, "#293d37");
    for (let x = 0; x < 640; x += 12) box(c, x, 158, 2, 19, "#293d37");
    building(c, 12, 93, 82, 65, "#756f57");
    building(c, 99, 107, 70, 51, "#796d53");
    building(c, 425, 77, 104, 81, "#8a7d61");
    tree(c, 50, 237, 1.55);
    tree(c, 578, 236, 1.5);
    lamp(c, 163, 239);
    lamp(c, 453, 239);
    box(c, 408, 245, 38, 5, "#92704b");
    box(c, 410, 250, 3, 9, "#233b37");
    box(c, 441, 250, 3, 9, "#233b37");
  } else if (scene === 2) {
    box(c, 383, 72, 6, 130, "#9aab97");
    box(c, 380, 50, 12, 7, "#afbaa5");
    box(c, 374, 57, 24, 13, "#a7b4a1");
    box(c, 368, 60, 36, 5, "#cbd1b8");
    box(c, 385, 20, 2, 33, "#adbba8");
    box(c, 385, 31, 5, 2, "#d46d48");
    building(c, 28, 122, 162, 86, "#787e64");
    building(c, 454, 119, 150, 92, "#666f5d");
    for (let x = 40; x < 185; x += 20) box(c, x, 120, 12, 4, "#b7a784");
    box(c, 174, 186, 94, 29, "#324b40");
    box(c, 181, 179, 79, 7, "#8c8a61");
    box(c, 215, 166, 8, 13, "#9b936a");
    box(c, 209, 161, 20, 7, "#baab7b");
    box(c, 319, 177, 10, 44, "#6a826f");
    box(c, 307, 175, 34, 4, "#a3b394");
    box(c, 312, 180, 24, 16, "#417367");
    c.fillStyle = "#d8c698";
    c.font = "8px monospace";
    c.fillText("14:++", 313, 192);
    tree(c, 590, 236, 1.2);
    lamp(c, 93, 242);
    stall(c, 478, 251, "#ac753e");
  } else if (scene === 3) {
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
  } else if (scene === 4) {
    building(c, 34, 147, 120, 65, "#8a8970");
    building(c, 486, 147, 121, 65, "#8a8970");
    box(c, 169, 128, 304, 19, "#baae86");
    box(c, 177, 118, 288, 10, "#d5bf8e");
    box(c, 165, 146, 312, 7, "#7e8167");
    for (let x = 181; x < 466; x += 49) {
      box(c, x, 151, 18, 62, "#b6ad86");
      box(c, x + 3, 151, 4, 61, "#d5bf91");
      box(c, x - 3, 208, 24, 7, "#d0b992");
      box(c, x - 3, 150, 24, 4, "#e0c69a");
    }
    box(c, 301, 105, 38, 14, "#526a55");
    box(c, 316, 88, 6, 20, "#36564c");
    for (let i = 0; i < 4; i++) {
      box(c, 301 + i * 11, 99, 9, 5, "#244e46");
      box(c, 303 + i * 11, 102, 3, 8, "#244e46");
    }
    box(c, 297, 91, 12, 8, "#244e46");
    box(c, 302, 84, 5, 9, "#244e46");
    tree(c, 64, 233, 1.4);
    tree(c, 574, 233, 1.4);
    lamp(c, 153, 240);
    lamp(c, 491, 240);
  } else {
    box(c, 0, 0, 640, 300, "#162e2c");
    for (let i = 0; i < 320; i++)
      box(
        c,
        rand() * 640,
        rand() * 220,
        15 + rand() * 28,
        7 + rand() * 16,
        i % 3 === 0 ? "#33473b" : "#223b33",
      );
    box(c, 0, 222, 640, 78, "#344435");
    c.save();
    c.translate(170, 0);
    box(c, 204, 62, 230, 166, "#56624a");
    box(c, 211, 55, 216, 179, "#73806a");
    box(c, 218, 61, 202, 165, "#233c35");
    c.fillStyle = "#a09b68";
    c.beginPath();
    c.arc(319, 150, 72, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#344c3d";
    c.beginPath();
    c.arc(319, 150, 65, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      box(c, 317 + Math.cos(a) * 68, 148 + Math.sin(a) * 68, 4, 4, "#d2bc7f");
    }
    if (vaultOpen) {
      box(c, 251, 84, 135, 137, "#112521");
      glow(c, 317, 170, 95, "#ffc77766");
      for (let i = 0; i < 70 + tier * 20; i++) {
        const x = 262 + rand() * 110,
          y = 174 + rand() * 45;
        box(c, x, y, 5, 3, ["#e8b761", "#ffda86", "#a08040"][i % 3]);
      }
      box(c, 280, 160, 65, 20, "#93623c");
      box(c, 280, 155, 65, 7, "#ffc675");
      box(c, 309, 166, 8, 9, "#ffd78b");
    } else {
      box(c, 289, 144, 60, 6, "#8e986d");
      box(c, 315, 121, 6, 51, "#8e986d");
      box(c, 309, 143, 19, 10, "#d1b781");
    }
    c.restore();
    lamp(c, 175, 231);
    lamp(c, 465, 231);
    stall(c, 44, 243, "#3a6150");
    box(c, 510, 238, 46, 22, "#815834");
    box(c, 507, 235, 52, 5, "#b3874e");
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
    walking ? 0 : Math.sin(t * 1.8) * 0.35,
    walking
      ? 0
      : Math.sin(t * 2.2) * 0.45 + (celebrate ? Math.sin(t * 5) * 0.6 : 0),
  );
  box(c, -7, -30, 14, 18, rewards.includes("shirt") ? "#f69743" : "#172729");
  box(c, -5, -30, 10, 3, "#273737");
  box(c, -9, -28, 3, 13, "#1c3030");
  box(c, -9, -16, 3, 3, "#c9a780");
  box(c, 7, -27, 3, 11, "#233837");
  box(c, 7, -16, 3, 4, "#c9a780");
  box(c, -5, -43, 11, 13, "#d0aa80");
  box(c, -6, -44, 12, 5, "#2b3029");
  box(c, -6, -40, 3, 7, "#2b3029");
  box(c, 2, -37, 2, 2, "#28342e");
  box(c, 5, -35, 2, 3, "#d0aa80");
  box(c, 1, -32, 4, 1, "#9b705a");
  if (rewards.includes("hat")) {
    box(c, -7, -46, 14, 5, "#ffa34d");
    box(c, -6, -49, 11, 4, "#ed8b36");
    box(c, 4, -43, 6, 2, "#ffa34d");
    box(c, -1, -47, 3, 2, "#ffe0ac");
  }
  if (rewards.includes("sunglasses")) {
    box(c, -3, -38, 10, 3, "#111f20");
    box(c, 0, -38, 2, 1, "#739488");
  }
  if (rewards.includes("shirt")) {
    box(c, -3, -24, 2, 5, "#ffe3ac");
    box(c, 0, -24, 2, 5, "#ffe3ac");
    box(c, -4, -22, 7, 1, "#ffe3ac");
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
export type Trail = { born: number; index: number };
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
    box(c, x, 198, 155, 19, scene === 0 ? "#c49150" : "#d0b16e");
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
    walking: boolean;
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
  c.restore();
  const x = pose.x,
    y = 254;
  courier(
    c,
    x,
    y,
    reduced ? 0 : time,
    state.rewards,
    trails.length > 0,
    pose.walking && !reduced,
  );
  if (reduced && trails.length) glow(c, x - 8, y - 27, 25, "#ffb95744");
  for (const trail of reduced ? [] : trails) {
    const p = Math.min(1, (time - trail.born) / 1.6);
    if (p < 0 || p >= 1) continue;
    const sx = 630 - (trail.index % 5) * 18,
      sy = 48 + (trail.index % 7) * 16;
    for (let j = 0; j < 9; j++) {
      const q = Math.max(0, p - j * 0.016);
      const tx = sx + (x - 8 - sx) * q,
        ty = sy + (y - 27 - sy) * q - Math.sin(q * Math.PI) * 58;
      box(
        c,
        tx,
        ty,
        j < 2 ? 4 : 2,
        j < 2 ? 4 : 2,
        `rgba(255,211,126,${1 - j / 10})`,
      );
    }
    glow(c, x - 8, y - 27, 25 * p, "#ffb95744");
  }
}
