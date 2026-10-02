# Play It Forward

**A little kindness. A long way.** An open-source, self-hostable donation adventure for bitcoin++ Berlin, payments edition.

A shared human courier explores six Berlin locations while contributions grow a real community bonus prize pool. Donations unlock orange accessories, ambient celebrations, and a hackathon hall. All progression is driven by **cumulative sats received**, never by the number of donations. Milestones do not spend or reserve funds.

## Run the playable demo

Requires **Node.js 24+** (SQLite is built in) and **pnpm 11.19.0**. Install pnpm with `npm install -g pnpm@11.19.0` if necessary.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put that random value into `.env` as `ADMIN_TOKEN`. Leave `PAYMENT_MODE=demo`.

```sh
pnpm build
PUBLIC_URL=http://localhost:3000 pnpm start
```

Open **http://localhost:3000/screen** on the venue screen, **/donate** on a phone, and **/admin** for operator controls. The operator token unlocks the desk; the session lasts eight hours. In demo mode, the mobile page includes a **Send demo sats** button. Demo receipts use their own database and cannot enter a live pool.

For development, run `pnpm server` and `pnpm dev` in two terminals. The Vite frontend at port 5173 proxies `/api` to port 3000. Set `PUBLIC_URL=http://localhost:5173`.

For phone access over a LAN, bind the server with `HOST=0.0.0.0` and set `PUBLIC_URL=http://YOUR-LAN-IP:3000`. The QR points at this URL; `localhost` is only useful on the host computer.

## How it plays

| Sats raised | Location | Reward |
| ---: | --- | --- |
| 0 | Berlin Hauptbahnhof | Basic satchel |
| 50,000 | Spree | Orange hat |
| 150,000 | Alexanderplatz | Sunglasses |
| 350,000 | East Side Gallery | bitcoin++ shirt |
| 700,000 | Brandenburg Gate | Orange bag |
| 1,250,000 | Hackathon hall entrance | Hall key |
| 2,000,000 | Vault opens | Shared treasure |

A donation gets its own light trail even when it crosses no milestone. Bursts play one named celebration at a time, with varied colored light trails and a short musical phrase when sound is enabled; accounting and the exact total update immediately. A large gift crosses intermediate scenes in a short montage and awards all earned accessories. The open hall continues to accumulate treasure in visual tiers based on sats, with an unlimited exact pool total up to JavaScript's safe integer limit.

The bottom progress bar measures sats toward the hall; the chapter tracker measures sats between the current and next milestone. The journey dots identify the six places. The operator's receipt count is diagnostic only.

## Configure an event

Edit `config.json` (or set `CONFIG_PATH`). Branding, chapter names, scene assignments, subtitles, accessory rewards, milestone amounts, goal, contribution methods, and public URL are configurable. The current renderer includes six Berlin scenes; a new visual theme requires supplying new scene artwork/rendering code. There is no theme editor or multi-event platform in this prototype.

`PUBLIC_URL` overrides the configured URL. All secrets belong in `.env`, never in the configuration or frontend. The app supports `demo`, `signet`, and `mainnet`; each has a distinct ledger file under `DATA_DIR`.

## Real payments with Bark

The direct REST adapter targets **barkd 0.7.1** and checks that version and wallet network. No wallet SDK or node runs in the browser. The organizer controls the Bark wallet; contributors keep using their own compatible wallets.

Follow [Bark setup and settlement checks](docs/PAYMENTS.md), then [VPS deployment](docs/DEPLOYMENT.md). Mainnet refuses to start unless `LIVE_PAYMENTS_ENABLED=true` and the public URL uses HTTPS.

Lightning is credited only when Bark reports `settled` and an attributable successful history movement exists. The credit is the movement's actual net received sats, after any receiving fee. Ark receipts use successful movements attributed to the unique issued Ark address. Bitcoin receipts use matching transaction outputs after one confirmation. Every receipt is uniquely keyed; polling, reconnection, and restart do not count it twice. Addresses remain attributable for additional and late payments.

## Architecture and API

React + Canvas 2D frontend; Express + SQLite server; one production process serves both. Fonts and pixel-art primitives are bundled locally. There are no external asset services, analytics, or login requirements for donors.

- `GET /api/state`: public configuration and authoritative sats/chapter state.
- `GET /api/events`: SSE snapshots, donation events, resets, and bounded catch-up. Supports `Last-Event-ID`.
- `POST /api/contributions`: `{ amount, name?, method }` creates a payment request; never credits it.
- `GET /api/contributions/:id`: destination, expiry, status, and actual credited amount. Treat the random request URL as private to its donor.
- `POST /api/contributions/:id/simulate`: idempotent demo-only receipt.
- `POST /api/admin/login`: operator token exchanged for an HttpOnly cookie.
- Authenticated `/api/admin/health`, `/simulate`, `/reset`, `/reconcile`, and `/logout`.

The payment adapter creates receiving instructions and reconciles verified receipts. Cashu can be added as another adapter. It must redeem/verify tokens and persist a stable receipt identity before crediting money.

SQLite transactions atomically record receipts and durable display events. Total raised is computed from the receipt ledger, not wallet balance differences. Current wallet balance can diverge because of fees, withdrawals, and maintenance; the UI labels **pool raised**, not a live spendable-balance guarantee.

## Verify

```sh
pnpm test
pnpm build
pnpm bark:smoke  # requires a configured local signet wallet
```

Tests cover amount thresholds, amount-vs-count equivalence, multi-level gifts, post-goal enrichment, duplicate receipts, reopen/restart, late payments, network isolation, admin authentication, bursts, SSE recovery, Lightning settlement, signet invoice expiry, and Bitcoin output attribution. The signet smoke test checks the actual receive APIs; it does not make a payment.

For manual UI checks, open the screen and mobile page together; send a 1,000-sat gift, a 100-payment burst, and a gift crossing several chapters. Check exact totals, accessories, trails, responsive layouts, motion controls, and disabled live-mode demo controls. Scan the deployed screen QR with a real phone before the venue run.

## Current limits

This is a hackathon prototype, with a working simulated game and a Bark receive adapter. Lightning settlement was verified with a 5,000-sat Phoenix payment on a Linux VPS, including restart and duplicate reconciliation checks. Bitcoin and Ark receiving APIs were checked on mainnet without funded settlement; funded signet coverage and the physical venue QR scan remain operator checks. A one-confirmation Bitcoin credit is treated as durable; automatic reorg reversals are not implemented. No organizer spending, refund, payout, Cashu or voting is included. Live Express remains disabled pending a donor-paid verification test.

MIT licensed original code and procedural art. Bundled DM Sans and IBM Plex Mono fonts retain their upstream SIL Open Font License. bitcoin++ branding remains the event's branding.

### Presenting the adventure

Open `/` for the overview and select **Present adventure** to open `/screen`. The presentation fills the viewport; its **Fullscreen** button enters browser fullscreen (Escape exits). Operator controls fade after inactivity and return on pointer movement or keyboard focus. The exact pool total, QR code, fund mode, and connection status stay visible.

Dark mode is the default. The header theme button switches every page between light and dark and remembers the choice in this browser. Sound remains off by default. Motion respects the system reduced-motion preference and can also be switched off in the presentation footer.

The courier walks from left to right according to **sats within the current chapter**, then the camera slides into the next scene. Quiet periods use a planted-foot idle pose. Cinematic travel is the default, with a multi-chapter montage capped at 18 seconds. The operator can choose the original snappy pace (four-second montage), adjust celebration spacing and sound volume, or skip the remaining visual queue; totals and rewards update immediately. Loading or reconnecting restores the current position without replaying old travel. Beyond the goal, the courier stays beside the open hall while treasure continues to grow.

### Rehearsal and movie controls

`/rehearsal/screen`, `/rehearsal/donate`, and `/rehearsal/admin` always use a separate simulated ledger, even when the main event runs on mainnet. The admin token is shared, but rehearsal cookies and money are isolated. Network selection for the main event remains a server environment setting and requires a restart.

The director desk can run a 30–1,800-second movie that schedules simulated gifts through every remaining milestone and reaches the exact goal at the chosen duration. Start below the goal; reset only the rehearsal pool to run it again. Pause stops new movie gifts while existing celebrations finish. Manual gifts count toward the same target. Presentation settings and movie scheduling are temporary: restarting stops the movie and restores default pace. Receipts and totals remain durable.


## Crew, recording and playback

Each chapter can configure `recruit: { id, name, role, sprite }`. Supported sprites: volunteer, tinkerer, hacker, artist, builder, host. Recruitment is derived at `start + ceil((end-start)/2)`, including an odd-sized interval. The last chapter ends at `goal`. Legacy `vault` scene identifiers render the hall. Optional `contributionPresets` configure the checkout buttons; otherwise amounts derive from the goal.

The first visit recaps the recorded adventure in at most 30 seconds. Every receipt gets a pulse; dense history blends particles. Completion is remembered locally per event. `/screen?live=1` bypasses the recap for operators. `/screen?intro=1` requests it again. `/screen?replay=1` runs a visitor-local historical replay with pause, speed, restart and optional loop. Playback uses a fixed journal cutoff and the captured story configuration; it never writes receipts or contacts a payment wallet. Existing donation-only history replays ordinary encounters.

The authenticated Event archive switch persists separately from the wallet network. It closes **new** checkout requests. Existing request status and Bark reconciliation remain active, including late payments. Restarting replay captures the new history cutoff.

## Pending Bitcoin and Express

Bark's actual transaction outputs are tracked by `txid:vout`; they remain separate from the confirmed prize pool. Competing input spends can establish replacement. Missing provider data does not establish a dropped transaction. Rehearsal controls explicitly exercise replacement/drop behavior. A transaction merely absent from providers remains pending conservatively.

Express uses Mempool's public estimate/invoice/status endpoints, chooses the lowest option and includes base and vsize service fees. A fresh quote and the decoded Lightning invoice must agree exactly. Only one active invoice per transaction is issued by this app; confirmation remains Bark's responsibility. Donors pay acceleration separately. Fees never enter the ledger and the app cannot spend organizer funds.

`MEMPOOL_ACCELERATION_ENABLED=true` enables live Express **only on mainnet**. Leave it unset until the current API contract checks and a user-paid test pass. Contract fixtures are covered by tests; a real paid acceleration has not yet been verified. Failed/unavailable Express leaves the transaction and explorer link visible.

`/rehearsal/admin` offers pending detection, quote/invoice, acceptance/failure, confirmation, replacement and drop. Movie mode derives gifts from every remaining midpoint and milestone, includes Lightning/Ark/ordinary Bitcoin/Express, and reaches the goal exactly at the chosen schedule duration. The cinematic queue finishes afterward. The rehearsal replay link plays the journal from that run. Demo acceleration invoices must not be paid; simulated acceptance is an operator action.

Additive SQLite tables store observations, quotes and acceleration attempts. The event journal records state changes once and confirmed receipts atomically. Back up the complete database with SQLite's backup API and the private Bark wallet separately before upgrades.


### October 2 story release verification

The regression suite has 42 passing tests, including 100-receipt bursts, odd chapter midpoint calculations, pending output identity/replacement outages, complete Express pricing, invoice amount mismatches, concurrent invoice requests, confirmation during invoice creation, archive checkout, late receipts and fixed replay cutoffs. A 30-second rehearsal schedule reached the configured goal exactly and recorded 12 donations, 15 pending state changes and three complete Express flows. Browser playback acknowledged all 12 donations, completed with all six companions, and the recap also acknowledged all 12 before joining live.

The deployed live ledger remained at 10,000 sats / two receipts following restart and reconciliation. Live Express is disabled. A funded Express test and physical phone QR scan remain outstanding. The venue layout was inspected at 1280×720 and 1920×1080, including fullscreen entry and exit. Mobile viewport overrides were ignored by the in-app browser, so a physical/mobile-browser layout and QR scan remain operator checks.

## Saved runs and withdrawals

Admin’s **Finish run & start new** saves the current run and starts a new one at zero. Rehearsal reset now does the same; it never deletes receipts. Each run captures its story configuration, totals and journal. Existing data migrates into the initial Berlin run. Payment requests remain attached to their issuing run, including late payments. Updating the configuration file applies to the next run after restarting the server.

Each saved run has a replay link (`/screen?replay=1&run=RUN_ID`). **Use as public replay** selects the run shown by ordinary archive replay links. Live introductions always recap the active run. History pagination pins both its run ID and cutoff. The active run and public replay selection persist across restarts.

**Withdraw funds** shows Ark and confirmed Bitcoin balances for the shared wallet, across all runs. Close contributions with Event archive, enter a receiving Taproot Bitcoin address, then review either the entire Ark balance or the entire on-chain balance. These are separate transactions. Reviews expire in 60 seconds. Type SEND and click Send funds to broadcast; previews never send. On-chain fees are estimated from confirmed wallet inputs and Bark’s regular fee rate. Bark determines the final fee at broadcast time; this API does not support a strict fee cap. Wait for any pending on-chain transactions before draining. Withdrawals leave recorded totals and replays intact.

Withdrawal attempts persist independently of donation events. A private SQLite backup is saved under `DATA_DIR/withdrawal-backups` before broadcast; the organizer must also retain their wallet backup. Changed balances or estimates cancel the review. Duplicate clicks are refused. A timeout or crash after submission blocks further withdrawal attempts until an operator inspects Bark’s transactions; never blindly retry an uncertain broadcast. This recovery currently requires server-side inspection of the withdrawals table. Rehearsal cannot access the real withdrawal adapter.

Authenticated endpoints: GET `/api/admin/wallet`; POST `/api/admin/withdrawals/preview` (`kind`, `destination`); POST `/api/admin/withdrawals/send` (`id`, `confirm: "SEND"`); POST `/api/admin/runs` (`name`); POST `/api/admin/runs/feature` (`id`). Run summaries and recent withdrawals are included in admin health.
