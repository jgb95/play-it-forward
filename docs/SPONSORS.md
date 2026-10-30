# Sponsors and city editions

The operator desk's **Next run's city** dropdown selects Berlin or Seoul. **Finish run & start new** saves the current story and starts the selected city at zero. The existing wallet, contribution methods, goal and milestone amounts carry over. Late payments remain with the run that issued them. Saved replays keep their city, music and sponsor configuration after a restart.

Seoul's original six scenes visit Seoul Station, Cheonggyecheon, Gwangjang Market, Namsan Tower, Gyeongbokgung and Community House Masil. These are stylized artwork, not a navigational walking route. Both cities have original synthesized music; **Sound on** enables the city's loop and gift phrases. The operator volume controls both. Sound starts off, and muting stops it. No licensed songs or external music streams are required.

## Configure a sponsor reel

The screen displays two or three main sponsors continuously while the supporting roster rotates alongside the adventure. Totals and the QR stay visible, including fullscreen. Reduced motion shows all supporters without rotation. A missing image shows the sponsor's name.

In the operator desk, open **Sponsors for the next run** under **Game runs & replay**. Edit names, bundled logo paths and tiers; use **Keep visible** or **Rotate** to move any sponsor between groups. **Earlier**, **Later**, **Add** and **Remove** change the roster and rotation order. Choose the seconds per rotating card. Selecting another city loads its preset. These edits apply when you choose **Finish run & start new** and are captured with that run, including after a server restart. They do not rewrite the city presets in `config.json`.

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

The next-run endpoint accepts up to 32 KB of JSON for a full roster; other request bodies retain their 4 KB limit. Oversized bodies return HTTP 413.

At most three sponsors may stay visible and 30 supporters may rotate, with 4–60 seconds per card. Names can also be supplied without images. Logos must use local asset paths with letters, digits, hyphens and underscores, ending in PNG, JPG, JPEG, WebP or SVG. Query strings, remote hosts and parent directory traversal are rejected. Put files under `public/sponsors` and rebuild to bundle them. Keep old asset filenames immutable so saved replays retain their artwork. The same sponsor object works in either array: placement and order are configuration, with no sponsor names hardcoded in the reel.

The bundled rosters come from the official [Berlin payments edition](https://btcpp.dev/berlin26), reviewed October 4, 2026, and [Seoul privacy edition](https://btcpp.dev/seoul), reviewed October 3, 2026. Both presets keep HRF and NYDIG visible. Berlin has 14 rotating sponsors and media partners; Seoul has six. The site's "Title sponsors" tier remains attached to Mempool.space in Berlin and Btrust in Seoul. Either can be promoted into the third fixed slot through the editor. Review the roster and logo colors with the organizer before a venue run. Logo ownership and source URLs are in `public/sponsors/ATTRIBUTION.txt`.

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

On the isolated rehearsal desk, select Seoul, promote Btrust into the third fixed slot, and start a run. Open its screen, check all three fixed logos, the rotating roster, sound/mute and reduced motion, then run the rehearsal movie through all six locations. Reopen a saved Berlin run to verify that its original city and roster remain. Check the deployed fullscreen layout and scan the QR with a physical phone before the event. Live payment and withdrawal verification still follows the existing payment runbook.
