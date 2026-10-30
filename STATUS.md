# Project status

Updated October 30, 2026.

This branch adds sponsor rotation and editing, Berlin/Seoul selection for new runs,
six original Seoul scenes, and original synthesized city soundtracks. Sponsor logos
render outside the pixel canvas. Up to three headline sponsors stay visible, and
up to 30 supporting sponsors rotate. Operators can promote, demote, reorder, add
and remove sponsors. PNG/JPEG artwork is supported directly; a local importer
converts TIFF, PSD and PDF-compatible Illustrator artwork without overwriting
existing assets. Bundled rosters retain source and trademark attribution.

Integration is based on official `main` at `e482c7b`, fetched October 30. The
contribution fork is available; the former fork-creation restriction no longer
blocks submission. The feature commits are preserved separately from the review
fixes. No upstream application commits were missing from the original base.

Review fixes allow a valid complete roster through the next-run endpoint with a
bounded 32 KB JSON limit, retain 4 KB limits elsewhere, and return HTTP 413 for
oversized bodies. Page routes now serve correctly from hidden checkout paths.
The Seoul journey and donation headings use the selected city.

Verification: all 88 tests pass with zero skips; TypeScript and the production
build pass. Run `pnpm test` and `pnpm build` (the equivalent npm scripts also
work). The fresh suite includes regression tests for full-roster HTTP saves,
authentication, oversized requests and production routes from hidden directories.
Headless Chromium checks exercise operator login, sponsor promotion, city changes
through SSE, bundled logo loading, sponsor rotation, sound controls, reduced
motion, a 390-pixel donation layout, simulated donation isolation and a saved
Berlin replay. No browser page errors were observed in that run.

Existing active runs retain their captured configuration. Restart after config
file changes, then start a selected-city run to adopt the new preset. Roster edits
are captured with the new run and survive restart; they do not change city
presets. Asset filenames used by saved runs must remain immutable. Receipt
attribution and wallet-network selection remain independent of presentation.

Deployment, funded payment/Express acceptance, native fullscreen and physical
phone QR scanning remain operator checks under the payment and deployment
runbooks. This review exercised an isolated simulated instance only.
