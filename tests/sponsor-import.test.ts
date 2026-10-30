import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { importSponsor } from "../scripts/import-sponsor.ts";

const available = (() => {
  try {
    execFileSync("magick", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const vectorAvailable =
  available &&
  (() => {
    try {
      execFileSync("gs", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
test(
  "source logos import to PNG with dimensions and transparency intact, refusing overwrite",
  { skip: !available },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "sponsor-import-"));
    try {
      for (const ext of ["png", "jpg", "jpeg", "tif", "tiff", "psd"]) {
        const input = join(dir, `source.${ext}`),
          output = join(dir, `${ext}.png`);
        execFileSync("magick", [
          "-size",
          "120x60",
          "xc:none",
          "-fill",
          "#f5a623",
          "-draw",
          "rectangle 20,10 100,50",
          input,
        ]);
        const original = readFileSync(input);
        await importSponsor(input, output);
        assert.equal(
          execFileSync("magick", ["identify", "-format", "%wx%h", output], {
            encoding: "utf8",
          }),
          "120x60",
        );
        if (!["jpg", "jpeg"].includes(ext))
          assert.equal(
            execFileSync(
              "magick",
              [output, "-format", "%[fx:p{0,0}.a]", "info:"],
              { encoding: "utf8" },
            ),
            "0",
          );
        assert.deepEqual(readFileSync(input), original);
        await assert.rejects(importSponsor(input, output), /exists/i);
      }
      const bad = join(dir, "invalid.ai");
      writeFileSync(bad, "not a PDF-compatible illustrator file");
      await assert.rejects(
        importSponsor(bad, join(dir, "invalid.png")),
        /PDF-compatible/,
      );
      await assert.rejects(
        importSponsor(join(dir, "source.txt"), join(dir, "bad.png")),
        /Unsupported/,
      );
      await assert.rejects(
        importSponsor(join(dir, "source.png"), join(dir, "bad.jpg")),
        /PNG/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
test(
  "PDF-compatible Illustrator artwork rasterizes at presentation resolution",
  { skip: !vectorAvailable },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "sponsor-ai-"));
    try {
      const ps = join(dir, "vector.ps"),
        ai = join(dir, "vector.ai"),
        output = join(dir, "vector.png");
      writeFileSync(
        ps,
        "%!PS\n<< /PageSize [300 100] >> setpagedevice\n1 0.5 0 setrgbcolor\n20 20 260 60 rectfill\nshowpage\n",
      );
      execFileSync("gs", [
        "-q",
        "-dBATCH",
        "-dNOPAUSE",
        "-dSAFER",
        "-sDEVICE=pdfwrite",
        `-sOutputFile=${ai}`,
        ps,
      ]);
      await importSponsor(ai, output);
      assert.equal(
        execFileSync("magick", ["identify", "-format", "%wx%h", output], {
          encoding: "utf8",
        }),
        "1200x400",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
