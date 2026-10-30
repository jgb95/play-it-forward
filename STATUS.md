# Project status

Updated October 3, 2026.

The sponsor/city branch adds sharp DOM logos alongside the adventure, two persistent headline positions, a configurable supporter rotation, Berlin/Seoul selection for new saved runs, six original Seoul scenes and original synthesized city music. TIFF, PSD and PDF-compatible Illustrator sources import locally to browser-ready PNGs; PNG and JPEG can also be supplied directly. The bundled Seoul roster and logo attribution come from the official event website.

Validation: 83 tests pass with zero skips, TypeScript and the production build pass, and the diff has no whitespace errors. Tests include real PNG/JPEG/TIFF/PSD/AI conversion, preserved original sources, overwrite refusal, legacy config compatibility, restart/replay city and sponsor capture, authenticated selection, late receipts and configuration carried in new-run SSE updates. The existing payment/withdrawal regressions remain passing.

Browser inspection at 1280×800 confirms sponsor images use smooth rendering, reduced motion exposes the full roster, the QR remains visible, sound toggles, and broken-image fallback displays names. All six Seoul scenes render with actors through the browser Canvas engine. The collaborative preview's native animation-frame, screenshot and resize facilities were unavailable during inspection; full animation, fullscreen/mobile behavior and physical venue QR scanning still need a normal visible browser/venue check. YouTube's channel and videos were found, but playable video retrieval returned HTTP 403, so exact reel timing was not verified.

Existing active runs retain their captured configuration. Restart after config changes, then start a new selected-city run to adopt the new roster. Asset filenames used by saved runs must remain immutable. No live wallet, payment mode, deployed instance or balances were modified during this work.

The branch is prepared for submission to the existing official repository. Submission currently needs repository write access; no fork or separate hosted product has been created. Deployment and funded event verification remain operator work under the existing payment runbook.
