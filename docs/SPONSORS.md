# Sponsors and city editions

The operator desk's **Next run's city** dropdown selects Berlin or Seoul. **Finish run & start new** saves the current story and starts the selected city at zero. The existing wallet, contribution methods, goal and milestone amounts carry over. Late payments remain with the run that issued them. Saved replays keep their city, music and sponsor configuration after a restart.

Seoul's original six scenes visit Seoul Station, Cheonggyecheon, Gwangjang Market, Namsan Tower, Gyeongbokgung and Community House Masil. These are stylized artwork, not a navigational walking route. Both cities have original synthesized music; **Sound on** enables the city's loop and gift phrases. The operator volume controls both. Sound starts off, and muting stops it. No licensed songs or external music streams are required.

## Configure a sponsor reel

The screen displays up to two headline sponsors continuously while the supporting roster rotates alongside the adventure. Totals and the QR stay visible, including fullscreen. Reduced motion shows all supporters without rotation. A missing image shows the sponsor's name.

`config.json` accepts an optional `sponsors` object and optional `sponsorLocales.berlin` / `sponsorLocales.seoul` overrides. An override replaces the complete roster for that city; omit it to use the common roster. Use empty headline/supporting arrays to disable a city's sponsors. Configuration changes apply to the next run after a server restart, preserving earlier replay configurations.

```json
{
  "sponsors": {
    "headline": [
      { "name": "Human Rights Foundation", "logo": "/sponsors/hrf.svg" },
      { "name": "NYDIG", "logo": "/sponsors/nydig.svg" }
    ],
    "supporting": [
      { "name": "Your supporter", "logo": "/sponsors/supporter-2026.png", "tier": "Workshop sponsors" }
    ],
    "seconds": 8
  }
}
```

At most 30 supporters may rotate, with 4–60 seconds per card. Names can also be supplied without images. Logos must use local asset paths with letters, digits, hyphens and underscores, ending in PNG, JPG, JPEG, WebP or SVG. Query strings, remote hosts and parent directory traversal are rejected. Put files under `public/sponsors` and rebuild to bundle them. Keep old asset filenames immutable so saved replays retain their artwork.

The bundled Seoul roster comes from [the official event page](https://btcpp.dev/seoul), reviewed October 3, 2026. HRF and NYDIG occupy the headline positions. Btrust is a title sponsor; the configuration keeps that tier separate from the two headline positions. Review the roster and logo colors with the organizer before a venue run. Logo ownership and source URLs are in `public/sponsors/ATTRIBUTION.txt`.

## Import design files

PNG/JPEG files can be bundled directly. For TIFF, PSD or Illustrator, install **ImageMagick 7** (`magick`). Illustrator import also needs **Ghostscript** and ImageMagick PDF reading enabled by the machine's policy. These are operator workstation tools; the deployed app needs neither.

```sh
pnpm sponsors:import ./source-logo.tiff public/sponsors/supporter-2026.png
pnpm sponsors:import ./source-logo.psd public/sponsors/supporter-2026-v2.png
pnpm sponsors:import ./source-logo.ai public/sponsors/supporter-2026-v3.png
```

The importer accepts `.png`, `.jpg`, `.jpeg`, `.tif`, `.tiff`, `.psd` and `.ai`. It reads TIFF's first page, PSD's saved composite, or PDF-compatible Illustrator's first artboard. Save Illustrator artwork with **Create PDF Compatible File** enabled. Older PostScript AI files or PSD files without a usable saved composite should be exported to PNG or SVG in the original design app. The importer refuses unsupported files and existing output paths; it does not change the original.

Output is sRGB PNG with transparency, capped at 2400 pixels on either axis without enlarging raster sources. Vector AI renders at 288 DPI before the cap. Embedded metadata is removed. Imports have a 128 MB source limit, bounded ImageMagick resources and a one-minute timeout. Use trusted sponsor artwork locally; this is not a public upload endpoint. Check brand colors visually, especially for CMYK/spot-color artwork. A low-resolution source cannot recover detail through conversion; request a larger original or a vector export.

## Venue check

Run the regression suite and production build. Import tests exercise real PNG/JPEG/TIFF/PSD/AI conversion when ImageMagick and Ghostscript are installed; environments without those tools skip the applicable import checks.

On the isolated rehearsal desk, select Seoul and start a run. Open its screen, check headline/supporter logos, sound/mute and reduced motion, then run the rehearsal movie through all six locations. Reopen a saved Berlin run to verify that its original city remains. Check the deployed fullscreen layout and scan the QR with a physical phone before the event. Live payment and withdrawal verification still follows the existing payment runbook.
