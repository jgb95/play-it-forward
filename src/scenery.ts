import {
  scenePortals,
  type Portal,
  type ExpressCue,
  orbitingOutputs,
} from "./encounters";
import type { Observation } from "../shared/model";
const rect = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
function polygon(
  c: CanvasRenderingContext2D,
  points: number[][],
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}
function arch(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  for (let col = 0; col < w; col += 2) {
    const u = (col - w / 2) / (w / 2),
      rise = (Math.sqrt(Math.max(0, 1 - u * u)) * w) / 2;
    rect(c, x + col, y + w / 2 - rise, 2, h - w / 2 + rise, color);
  }
}
function windows(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  columns: number,
  rows: number,
  spacing = 17,
) {
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < columns; i++) {
      rect(
        c,
        x + i * spacing,
        y + j * 19,
        9,
        12,
        (i + j) % 3 ? "#387679" : "#ffca80",
      );
      rect(c, x + i * spacing + 1, y + j * 19, 2, 12, "#b8dce433");
      rect(c, x + i * spacing, y + j * 19 + 6, 9, 1, "#243943");
    }
}
function tree(c: CanvasRenderingContext2D, x: number, y: number) {
  rect(c, x - 2, y - 42, 4, 42, "#263b39");
  for (let i = 0; i < 19; i++)
    rect(
      c,
      x - 25 + ((i * 17) % 43),
      y - 74 + ((i * 11) % 40),
      12,
      10,
      ["#2d6359", "#54846b", "#79916a"][i % 3],
    );
}
function bridgeTower(c: CanvasRenderingContext2D, x: number, y: number, s = 1) {
  rect(c, x, y, 19 * s, 45 * s, "#a65f5b");
  rect(c, x + 3 * s, y, 4 * s, 43 * s, "#d18a74");
  polygon(
    c,
    [
      [x - 3 * s, y],
      [x + 9 * s, y - 29 * s],
      [x + 23 * s, y],
    ],
    "#4b4353",
  );
  rect(c, x + 8 * s, y + 12 * s, 4 * s, 12 * s, "#253a4d");
  for (let i = 0; i < 3; i++)
    rect(c, x + i * 7 * s, y - 3 * s, 4 * s, 5 * s, "#c38069");
}
export function galleryBackdrop(c: CanvasRenderingContext2D) {
  rect(c, 365, 127, 230, 7, "#aa7267");
  for (let x = 373; x < 588; x += 23) arch(c, x, 134, 17, 28, "#3a4758");
  bridgeTower(c, 412, 90, 0.8);
  bridgeTower(c, 509, 90, 0.8);
  rect(c, 384, 120, 182, 2, "#d5a078");
}
export function architecture(c: CanvasRenderingContext2D, scene: number) {
  if (scene === 0) {
    // Washingtonplatz facade: curved transparent hall between two office wings.
    for (const x of [34, 455]) {
      rect(c, x, 68, 150, 147, "#37586a");
      windows(c, x + 9, 80, 8, 7, 17);
      rect(c, x, 68, 150, 4, "#a7bac0");
    }
    rect(c, 173, 102, 290, 122, "#29545e");
    for (let x = 175; x < 464; x += 3) {
      const u = (x - 319) / 146,
        top = 103 - Math.sqrt(Math.max(0, 1 - u * u)) * 51;
      rect(c, x, top, 3, 224 - top, "#326e79");
    }
    for (let x = 181; x < 463; x += 18) {
      const u = (x - 319) / 146,
        top = 103 - Math.sqrt(Math.max(0, 1 - u * u)) * 51;
      rect(c, x, top, 2, 221 - top, "#9fbbc4");
      rect(c, x + 2, top + 5, 4, 212 - top, "#bde5ed20");
    }
    for (let y = 103; y < 206; y += 20) rect(c, 175, y, 288, 2, "#7999a1");
    rect(c, 177, 163, 282, 7, "#273b49");
    rect(c, 183, 170, 272, 2, "#ffcd88");
    rect(c, 187, 197, 267, 25, "#152e3a");
    for (let x = 202; x < 448; x += 34) {
      rect(c, x, 202, 23, 20, "#7aacad");
      rect(c, x + 10, 202, 2, 20, "#e0cfa6");
    }
    rect(c, 284, 177, 82, 15, "#203640");
    c.fillStyle = "#ffe4b9";
    c.font = "7px monospace";
    c.fillText("HAUPTBAHNHOF", 291, 187);
    rect(c, 313, 127, 22, 14, "#d96556");
    c.fillStyle = "#fff0da";
    c.font = "bold 9px monospace";
    c.fillText("DB", 318, 138);
    for (let x = 48; x < 600; x += 36) rect(c, x, 230, 25, 1, "#b2b3a633");
    tree(c, 28, 234);
    tree(c, 610, 233);
  } else if (scene === 1) {
    // Museum Island river bend, Bode-inspired dome and masonry bridge.
    rect(c, 0, 153, 640, 79, "#164d59");
    rect(c, 0, 157, 640, 5, "#407574");
    rect(c, 195, 100, 239, 52, "#b29486");
    rect(c, 199, 98, 230, 5, "#deb28c");
    windows(c, 211, 110, 12, 2, 18);
    rect(c, 282, 71, 65, 32, "#c4a48e");
    for (let i = 0; i < 22; i++) {
      const u = (i - 11) / 11;
      rect(
        c,
        282 + i * 3,
        72 - Math.sqrt(Math.max(0, 1 - u * u)) * 23,
        3,
        29,
        "#637978",
      );
    }
    rect(c, 310, 40, 4, 10, "#d4c7a0");
    rect(c, 306, 49, 13, 3, "#d4c7a0");
    rect(c, 27, 123, 175, 13, "#bb9c87");
    rect(c, 18, 131, 190, 11, "#8f837b");
    for (let x = 32; x < 204; x += 55) arch(c, x, 140, 43, 44, "#214c58");
    rect(c, 18, 130, 190, 2, "#ebbf95");
    for (let x = 28; x < 207; x += 15) rect(c, x, 119, 2, 12, "#766b68");
    for (let i = 0; i < 65; i++)
      rect(
        c,
        (i * 67) % 640,
        165 + ((i * 13) % 60),
        8 + (i % 5) * 4,
        1,
        ["#67bdad55", "#f6bf8755", "#a7c3d544"][i % 3],
      );
    for (let i = 0; i < 12; i++)
      rect(c, 212 + i * 18, 168 + (i % 4) * 7, 5, 25 - (i % 5), "#ffc08218");
    rect(c, 0, 231, 640, 5, "#bcaa94");
    for (let x = 0; x < 640; x += 22) rect(c, x, 217, 2, 17, "#172f38");
    rect(c, 0, 216, 640, 2, "#334954");
    tree(c, 18, 242);
    tree(c, 610, 239);
  } else if (scene === 2) {
    rect(c, 25, 119, 188, 108, "#757b85");
    windows(c, 35, 132, 10, 4);
    rect(c, 25, 117, 188, 4, "#b7aba2");
    rect(c, 437, 115, 188, 111, "#58677b");
    windows(c, 450, 130, 10, 5);
    rect(c, 358, 79, 7, 147, "#aebcca");
    rect(c, 361, 22, 2, 30, "#b4cbd5");
    rect(c, 360, 29, 4, 3, "#e48e7a");
    rect(c, 360, 40, 4, 3, "#e48e7a");
    for (let row = 0; row < 25; row += 2) {
      const u = (row - 12) / 13,
        half = Math.sqrt(Math.max(0, 1 - u * u)) * 19;
      rect(
        c,
        362 - half,
        52 + row,
        half * 2,
        2,
        ["#c3d6d6", "#8da6b7", "#dfd9c2"][Math.floor(row / 5) % 3],
      );
    }
    rect(c, 350, 62, 26, 3, "#e5cfb5");
    rect(c, 357, 78, 11, 5, "#6a8597");
    rect(c, 267, 204, 54, 5, "#536779");
    rect(c, 289, 165, 7, 38, "#b4b8ac");
    polygon(
      c,
      [
        [264, 162],
        [280, 152],
        [310, 152],
        [325, 162],
        [313, 181],
        [276, 181],
      ],
      "#4a747d",
    );
    rect(c, 265, 162, 59, 2, "#ead7a8");
    for (let i = 0; i < 5; i++) {
      rect(c, 270 + i * 10, 167, 1, 10, "#cfd4b1");
      c.fillStyle = "#ffe3ac";
      c.font = "7px monospace";
      c.fillText(String(i + 12), 271 + i * 10, 174);
    }
    c.strokeStyle = "#c7bba1";
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(294, 140, 17, 5, 0.4, 0, Math.PI * 2);
    c.ellipse(294, 140, 7, 15, -0.4, 0, Math.PI * 2);
    c.stroke();
    rect(c, 0, 228, 640, 6, "#ab9a91");
    for (let x = 0; x < 640; x += 42)
      rect(c, x, 263 + (x % 3) * 5, 39, 1, "#a89e9755");
    tree(c, 626, 241);
  } else if (scene === 4) {
    rect(c, 165, 112, 315, 15, "#d6b697");
    rect(c, 175, 104, 295, 8, "#e7c7a1");
    rect(c, 161, 127, 323, 22, "#b8947d");
    for (let i = 0; i < 21; i++)
      rect(c, 171 + i * 14, 134, 8, 6, i % 3 ? "#cba78a" : "#866f66");
    rect(c, 163, 147, 319, 6, "#ebc7a0");
    for (let i = 0; i < 6; i++) {
      const x = 181 + i * 51;
      rect(c, x - 5, 151, 27, 7, "#ead0a5");
      rect(c, x, 158, 17, 66, "#bfa084");
      rect(c, x + 2, 158, 3, 66, "#efd2a2");
      rect(c, x + 11, 158, 2, 66, "#8d7b70");
      for (let j = 0; j < 3; j++)
        rect(c, x + 4 + j * 4, 160, 1, 62, "#dac29b44");
      rect(c, x - 4, 221, 25, 5, "#e5c7a2");
    }
    rect(c, 163, 227, 320, 5, "#8b7a73");
    rect(c, 157, 232, 334, 3, "#c4aa8f");
    for (let i = 0; i < 4; i++) {
      const x = 298 + i * 11;
      rect(c, x, 93, 8, 7, "#346c68");
      rect(c, x + 2, 100, 2, 8, "#346c68");
      rect(c, x + 6, 100, 2, 8, "#346c68");
      rect(c, x + 5, 89, 3, 5, "#346c68");
    }
    rect(c, 320, 83, 7, 10, "#346c68");
    rect(c, 321, 70, 3, 14, "#346c68");
    rect(c, 316, 71, 13, 2, "#508881");
    rect(c, 308, 104, 32, 3, "#346c68");
    for (const x of [44, 536]) {
      rect(c, x, 161, 62, 67, "#878e90");
      windows(c, x + 9, 169, 3, 3);
    }
    tree(c, 23, 241);
    tree(c, 611, 241);
    rect(c, 158, 235, 334, 1, "#e3b88666");
  }
}
export function hallDetails(
  c: CanvasRenderingContext2D,
  open: boolean,
  tier: number,
) {
  // Industrial window frames and warm workspaces inspired by w3.hub.
  for (let i = 0; i < 6; i++) {
    const x = 78 + i * 58;
    rect(c, x, 126, 46, 76, open ? "#887d66" : "#2e535e");
    for (let j = 0; j < 4; j++) rect(c, x, 139 + j * 17, 46, 2, "#243d45");
    rect(c, x + 21, 126, 3, 76, "#243d45");
    rect(c, x + 3, 128, 3, 68, "#d3e4d333");
  }
  for (const x of [57, 428, 579]) {
    rect(c, x, 211, 15, 20, "#c17d6c");
    for (let j = 0; j < 5; j++)
      rect(c, x - 6 + j * 6, 185 + (j % 2) * 9, 7, 22, "#4b8c6b");
  }
  if (open)
    for (let i = 0; i < 6 + Math.min(tier, 12); i++) {
      const x = 85 + (i % 9) * 40,
        y = 179 + Math.floor(i / 9) * 29;
      rect(c, x, y, 31, 3, "#b59074");
      rect(c, x + 3, y + 3, 2, 15, "#4b4449");
      rect(c, x + 26, y + 3, 2, 15, "#4b4449");
      rect(c, x + 7, y - 12, 17, 11, "#243d49");
      rect(c, x + 9, y - 10, 13, 6, ["#84d9c5", "#e0a8ce", "#f2cd85"][i % 3]);
      rect(c, x + 18, y + 6, 7, 9, ["#5eab9f", "#d887a6", "#bdad6b"][i % 3]);
    }
}
export function drawPortals(c: CanvasRenderingContext2D, scene: number) {
  for (const p of scenePortals[scene] ?? scenePortals[0]) {
    if (p.kind === "door") {
      // Gate passages and the hall's central door already belong to the architecture.
      if ((scene === 4 && p.x === 298) || (scene === 5 && p.x === 505))
        continue;
      rect(c, p.x - 19, p.y - 54, 38, 55, "#8d9182");
      arch(c, p.x - 15, p.y - 50, 30, 50, "#152c39");
      rect(c, p.x - 15, p.y - 4, 30, 4, "#aaa092");
      rect(c, p.x - 13, p.y - 48, 2, 41, "#5b8180");
    } else if (p.kind === "stairs") {
      rect(c, p.x - 23, p.y - 17, 46, 17, "#182e3c");
      for (let i = 0; i < 4; i++)
        rect(c, p.x - 18 - i, p.y - 13 + i * 4, 36 + i * 2, 2, "#8b8d92");
      for (const dx of [-24, 23]) {
        rect(c, p.x + dx, p.y - 31, 2, 32, "#63929d");
        rect(c, p.x + dx - 3, p.y - 33, 8, 2, "#bdd0c5");
      }
      rect(c, p.x - 6, p.y - 52, 13, 13, "#3476a0");
      c.fillStyle = "#f4e1ba";
      c.font = "bold 10px monospace";
      c.fillText("U", p.x - 3, p.y - 42);
    } else {
      rect(c, p.x - 12, p.y - 6, 24, 7, "#6b7172");
      tree(c, p.x - 28, p.y + 4);
    }
  }
}
export function clipEntrance(c: CanvasRenderingContext2D, portal: Portal) {
  c.beginPath();
  c.rect(0, portal.y, 640, 300 - portal.y);
  c.rect(portal.x - 15, portal.y - 50, 30, 51);
  c.clip();
}
export function expressTrain(
  c: CanvasRenderingContext2D,
  cue: ExpressCue,
  time: number,
  reduced: boolean,
) {
  const p = Math.max(
    0,
    Math.min(1, (time - (cue.born ?? time)) / (cue.duration ?? 3.2)),
  );
  if (reduced) return;
  const x = -250 + p * 1140,
    y = 186;
  for (let i = 0; i < 3; i++) {
    const tx = x - i * 76;
    rect(c, tx, y, 71, 26, "#395caf");
    rect(c, tx + 2, y + 3, 67, 2, "#82b1f0");
    for (let j = 0; j < 4; j++)
      rect(c, tx + 7 + j * 15, y + 7, 11, 10, "#bae5ed");
    rect(c, tx, y + 22, 71, 4, "#213c68");
    rect(c, tx + 8, y + 26, 8, 3, "#183140");
    rect(c, tx + 54, y + 26, 8, 3, "#183140");
  }
  polygon(
    c,
    [
      [x + 71, y],
      [x + 88, y + 9],
      [x + 88, y + 23],
      [x + 71, y + 26],
    ],
    "#456bba",
  );
  rect(c, x + 77, y + 15, 9, 3, "#ffdfa1");
  // Accelerator sparkles echo the official mark; the HUD/feed retain official branding.
  for (const [dx, dy, size] of [
    [35, -7, 5],
    [49, -12, 3],
    [22, -14, 2],
  ]) {
    rect(c, x + dx - size, y + dy, 2 * size + 1, 1, "#e7f0ff");
    rect(c, x + dx, y + dy - size, 1, 2 * size + 1, "#e7f0ff");
  }
  c.font = "bold 7px monospace";
  c.fillStyle = "#ffffff";
  c.fillText("MEMPOOL EXPRESS", x - 142, y + 21);
  for (let i = 0; i < 9; i++)
    rect(c, x - 238 - i * 9, y + 4 + (i % 5) * 4, 8 + i * 3, 1, "#88bfff66");
}
export function expressOrbits(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  observations: Observation[],
  reduced: boolean,
) {
  const outputs = orbitingOutputs(observations);
  if (!outputs.length) return;
  const count = Math.min(12, outputs.length * 3);
  for (let i = 0; i < count; i++) {
    const key = outputs[i % outputs.length].key;
    const seed = [...key].reduce((n, ch) => n + ch.charCodeAt(0), 0);
    const a = (reduced ? 0 : time * 0.9) + seed + i * 2.399;
    const px = x - 8 + Math.cos(a) * 24,
      py = y - 29 + Math.sin(a) * 12;
    rect(c, px - 2, py - 2, 5, 5, "#547ec533");
    rect(c, px, py, 2, 2, i % 2 ? "#c9e6ff" : "#81b4ff");
  }
}
