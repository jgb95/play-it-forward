# Sponsors and city editions implementation plan

**Goal:** Add sharp sponsor rotation and selectable Berlin/Seoul adventures to the existing venue presentation.

**Architecture:** Optional validated sponsor data and locale metadata travel with each saved configuration. A separate React sponsor strip renders logos at display resolution; city-aware Canvas backgrounds and Web Audio accompany the existing journey.

**Tech stack:** React, Canvas 2D, Web Audio, Express, SQLite, Zod, local ImageMagick/Ghostscript import.

- [x] Add failing configuration and run tests in `tests/locales.test.ts`: legacy defaults, unsafe logo paths, city transformation, saved replay, late receipts, restart, authenticated selection.
- [x] Extend `shared/model.ts`; add `shared/locales.ts`; update `server/store.ts` and the existing new-run endpoint without changing receipt or withdrawal code.
- [x] Add `src/seoul.ts`, city-aware background caching, city names in visible copy and a locale dropdown in the saved-run controls.
- [x] Add `src/SponsorReel.tsx` and scoped styles; validate sponsor paths and roster bounds; keep headline positions visible and rotate supporting sponsors. Use plain names on load failure and static rosters with reduced motion.
- [x] Add original synthesized city music in `src/music.ts`; use the existing explicit sound opt-in and volume setting, and stop scheduled audio on mute/unmount.
- [x] Add `scripts/import-sponsor.ts` and import tests. Read source files locally; convert the first TIFF page/PSD composite/PDF-compatible AI page to sRGB PNG, preserving aspect ratio and transparency. Refuse overwrite and unsupported sources.
- [x] Bundle official Seoul headline logos with source attribution. Document per-city sponsor overrides, import limits and the next-run selection behavior.
- [x] Support the October 4 requirement for two or three interchangeable fixed sponsors and variable rosters. Add next-run editing, validate before saving, preserve captured replay rosters, and bundle the official Berlin 2026 sponsor list with attribution.
- [x] Verify the integrated branch with the regression suite and production build. The contribution fork is available; prepare the reviewed branch for an upstream PR.
