// Original Seoul-inspired pixel artwork. The shared walkway/portal positions stay
// aligned with the existing actors and deterministic replay encounters.
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
function windows(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  cols: number,
  rows: number,
) {
  for (let a = 0; a < cols; a++)
    for (let b = 0; b < rows; b++)
      rect(
        c,
        x + a * 16,
        y + b * 17,
        7,
        9,
        (a + b) % 3 ? "#79acbf" : "#ffd39b",
      );
}
function roof(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  polygon(
    c,
    [
      [x - 12, y + 15],
      [x + 12, y + 10],
      [x + w / 2, y - 8],
      [x + w - 12, y + 10],
      [x + w + 12, y + 15],
      [x + w, y + 22],
      [x, y + 22],
    ],
    "#234b58",
  );
  rect(c, x - 10, y + 15, w + 20, 3, "#76b5b3");
  for (let a = x + 8; a < x + w; a += 12) rect(c, a, y + 12, 2, 8, "#527781");
}
function label(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = "#ffe3b8",
) {
  c.fillStyle = color;
  c.font = "bold 9px monospace";
  c.fillText(text, x, y);
}
export function seoulArchitecture(
  c: CanvasRenderingContext2D,
  scene: number,
  open: boolean,
  tier: number,
) {
  // A dusk skyline, with Namsan rising above the shared street.
  polygon(
    c,
    [
      [0, 154],
      [80, 116],
      [147, 150],
      [236, 96],
      [300, 148],
      [380, 105],
      [450, 151],
      [550, 109],
      [640, 154],
      [640, 221],
      [0, 221],
    ],
    "#2d4059",
  );
  for (let i = 0; i < 13; i++) {
    const x = i * 52,
      y = 132 + ((i * 19) % 36);
    rect(c, x, y, 35, 221 - y, "#354765");
    windows(c, x + 6, y + 9, 2, 3);
  }
  if (scene === 0) {
    // Old Seoul Station: brick wings, central dome and a clock.
    rect(c, 92, 123, 450, 101, "#9b6462");
    rect(c, 85, 116, 464, 10, "#e4b69a");
    windows(c, 108, 139, 11, 4);
    windows(c, 365, 139, 10, 4);
    rect(c, 264, 101, 100, 123, "#c7aa91");
    for (let i = 0; i < 44; i++) {
      const u = (i - 22) / 22;
      rect(
        c,
        270 + i * 2,
        83 - Math.sqrt(Math.max(0, 1 - u * u)) * 28,
        2,
        30,
        "#587c7e",
      );
    }
    rect(c, 307, 42, 8, 15, "#c1c7b0");
    rect(c, 305, 116, 18, 18, "#f5dec0");
    rect(c, 313, 119, 2, 9, "#39586b");
    rect(c, 313, 126, 6, 2, "#39586b");
    rect(c, 288, 179, 56, 45, "#203d4e");
    label(c, "SEOUL STATION", 274, 156);
  } else if (scene === 1) {
    // Sunken Cheonggyecheon stream and stepped banks.
    rect(c, 0, 155, 640, 63, "#1c5869");
    for (let i = 0; i < 55; i++)
      rect(
        c,
        (i * 71) % 640,
        160 + ((i * 13) % 53),
        15 + (i % 4) * 5,
        2,
        ["#9dd8c5", "#dfbc99", "#568ca4"][i % 3],
      );
    rect(c, 0, 147, 640, 8, "#a6aaa5");
    for (let i = 0; i < 5; i++) {
      rect(c, 0, 184 + i * 7, 125 + i * 12, 6, "#8b9197");
      rect(c, 527 - i * 12, 184 + i * 7, 113 + i * 12, 6, "#8b9197");
    }
    rect(c, 214, 151, 220, 12, "#baaea0");
    rect(c, 231, 162, 15, 49, "#8f8f99");
    rect(c, 397, 162, 15, 49, "#8f8f99");
    for (let x = 220; x < 430; x += 14) rect(c, x, 134, 2, 17, "#6d838b");
    rect(c, 214, 133, 220, 3, "#a9bbba");
    label(c, "CHEONGGYECHEON", 273, 119);
  } else if (scene === 2) {
    // Covered market arcade, cloth awnings and warm food stalls.
    polygon(
      c,
      [
        [27, 119],
        [320, 63],
        [613, 119],
        [594, 132],
        [320, 85],
        [44, 132],
      ],
      "#416578",
    );
    for (let x = 39; x < 613; x += 75) {
      rect(c, x, 128, 57, 97, "#6a525d");
      rect(c, x - 3, 125, 64, 12, x % 2 ? "#d08477" : "#baae77");
      rect(c, x + 8, 148, 40, 45, "#283e50");
      rect(c, x + 5, 192, 48, 6, "#c39c79");
      for (let j = 0; j < 5; j++)
        rect(c, x + 9 + j * 8, 185 - (j % 2) * 4, 6, 7, "#f4c783");
      rect(c, x + 25, 138, 8, 8, "#ffd9a2");
    }
    rect(c, 227, 86, 192, 24, "#223d4d");
    label(c, "GWANGJANG MARKET", 249, 102);
    for (let x = 85; x < 590; x += 80) {
      rect(c, x, 119, 2, 32, "#c5b49a");
      rect(c, x - 6, 148, 14, 15, "#f5ad88");
    }
  } else if (scene === 3) {
    // N Seoul Tower above the Namsan wooded ridge.
    polygon(
      c,
      [
        [0, 205],
        [135, 155],
        [236, 172],
        [337, 98],
        [447, 154],
        [550, 172],
        [640, 213],
        [640, 224],
        [0, 224],
      ],
      "#385c5d",
    );
    rect(c, 332, 69, 10, 99, "#9baabc");
    rect(c, 335, 18, 4, 28, "#c2d5db");
    rect(c, 319, 52, 35, 9, "#b6c4cd");
    rect(c, 316, 61, 42, 18, "#607d92");
    rect(c, 314, 60, 46, 3, "#daabc9");
    rect(c, 320, 69, 34, 4, "#f2cd9b");
    rect(c, 333, 167, 9, 20, "#b5afa8");
    for (let i = 0; i < 20; i++) {
      const x = 15 + i * 32,
        y = 196 + ((i * 7) % 21);
      rect(c, x, y - 20, 4, 27, "#263f4d");
      rect(c, x - 8, y - 33, 22, 19, "#507872");
    }
    rect(c, 55, 182, 129, 32, "#1f4050");
    label(c, "NAMSAN / SEOUL", 66, 202);
  } else if (scene === 4) {
    // Palace gate: stone arches and two curved tiled roof levels.
    rect(c, 127, 170, 382, 54, "#b2b4a7");
    for (let x = 187; x < 470; x += 96) {
      rect(c, x, 188, 48, 36, "#28424e");
      rect(c, x + 5, 180, 38, 9, "#28424e");
    }
    rect(c, 143, 123, 347, 49, "#ab7766");
    for (let x = 154; x < 486; x += 27) {
      rect(c, x, 129, 6, 43, "#d6927a");
      rect(c, x + 7, 132, 13, 27, "#386d68");
    }
    roof(c, 135, 108, 365);
    rect(c, 187, 76, 258, 39, "#bb8070");
    for (let x = 195; x < 442; x += 24) {
      rect(c, x, 82, 5, 31, "#d69d7d");
      rect(c, x + 6, 85, 12, 21, "#3d7771");
    }
    roof(c, 180, 60, 273);
    label(c, "GYEONGBOKGUNG", 266, 149);
  } else {
    // Venue-inspired community building, with the existing hall doorway.
    rect(c, 35, 80, 570, 151, "#485569");
    rect(c, 35, 80, 570, 5, "#a1b9b9");
    windows(c, 56, 105, 24, 3);
    rect(c, 75, 168, 358, 53, open ? "#a9a789" : "#294c5b");
    for (let x = 85; x < 426; x += 45) {
      rect(c, x, 168, 3, 52, "#56767c");
      if (open) {
        rect(c, x + 8, 194, 28, 3, "#d4bd96");
        rect(c, x + 12, 178, 20, 13, "#244651");
        rect(c, x + 14, 180, 16, 8, "#a4e2cb");
      }
    }
    rect(c, 183, 76, 283, 36, "#243e51");
    label(c, "bitcoin++ / SEOUL", 240, 94);
    label(c, "COMMUNITY HOUSE MASIL", 223, 106, "#a7d3ce");
    rect(c, 454, 125, 102, 109, "#739b9a");
    rect(c, 461, 130, 88, 102, open ? "#ffcf96" : "#234857");
    if (open) {
      label(c, "COME BUILD!", 466, 154, "#31556a");
      for (let i = 0; i < Math.min(tier, 12); i++)
        rect(
          c,
          467 + (i % 6) * 12,
          216 - Math.floor(i / 6) * 8,
          9,
          6,
          "#f4e0a1",
        );
    }
  }
  rect(c, 0, 221, 640, 5, "#abb0aa");
}
