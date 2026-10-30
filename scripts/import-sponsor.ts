import { execFile } from "node:child_process";
import {
  constants,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
export async function importSponsor(input: string, output: string) {
  const ext = extname(input).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".tif", ".tiff", ".psd", ".ai"].includes(ext))
    throw Error(
      "Unsupported source. Use PNG, JPEG, TIFF, PSD or PDF-compatible Illustrator .ai.",
    );
  if (extname(output).toLowerCase() !== ".png")
    throw Error("Output must be PNG.");
  const source = resolve(input),
    destination = resolve(output);
  const size = statSync(source).size;
  if (size > 128 * 1024 * 1024)
    throw Error("Source exceeds the 128 MB import limit.");
  if (ext === ".ai") {
    const file = openSync(source, "r"),
      header = Buffer.alloc(5);
    try {
      readSync(file, header, 0, 5, 0);
    } finally {
      closeSync(file);
    }
    if (header.toString() !== "%PDF-")
      throw Error(
        "A PDF-compatible Illustrator file is required. Save with Create PDF Compatible File enabled, or export a PNG/SVG.",
      );
  }
  const dir = mkdtempSync(join(tmpdir(), "pif-logo-"));
  try {
    // Controlled filenames prevent ImageMagick interpreting user filename syntax.
    const local = join(dir, "source" + (ext === ".ai" ? ".pdf" : ext));
    const converted = join(dir, "logo.png");
    copyFileSync(source, local);
    try {
      await run(
        "magick",
        [
          "-limit",
          "memory",
          "256MiB",
          "-limit",
          "map",
          "512MiB",
          "-limit",
          "disk",
          "1GiB",
          ...(ext === ".ai" ? ["-density", "288", "-background", "none"] : []),
          local + "[0]",
          "-auto-orient",
          "-colorspace",
          "sRGB",
          "-resize",
          "2400x2400>",
          "-strip",
          "PNG32:" + converted,
        ],
        { timeout: 60000, maxBuffer: 64 * 1024 },
      );
    } catch {
      throw Error(
        "Logo conversion failed. Install ImageMagick 7 (magick); Illustrator also needs Ghostscript and PDF read permission. For unsupported PSD/AI artwork, export a PNG or SVG from the design app.",
      );
    }
    mkdirSync(dirname(destination), { recursive: true });
    try {
      copyFileSync(converted, destination, constants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw Error(
          "Output already exists. Choose a new filename; imported logos used by saved runs must stay immutable.",
        );
      throw error;
    }
    return destination;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [, , input, output] = process.argv;
  if (!input || !output) {
    console.error(
      "Usage: pnpm sponsors:import SOURCE public/sponsors/unique-name.png",
    );
    process.exitCode = 1;
  } else {
    importSponsor(input, output)
      .then(() =>
        console.log(
          "Sponsor PNG imported. Add its /sponsors/ path to config.json.",
        ),
      )
      .catch((e) => {
        console.error((e as Error).message);
        process.exitCode = 1;
      });
  }
}
