# Bark receiving setup

## Install a pinned local daemon

Download the official **0.7.1** binary appropriate to your platform from [Bark releases](https://gitlab.com/ark-bitcoin/bark/-/releases/bark-0.7.1). The tested Linux x86_64 file is `barkd-0.7.1-linux-x86_64`. Place it at `/usr/local/bin/barkd-0.7.1`, make it executable, and verify `--version`. Keep this wallet separate from any existing personal wallet.

```sh
barkd-0.7.1 --datadir ./bark-signet --host 127.0.0.1 --port 3001
```

In a separate terminal, get the generated token with `barkd-0.7.1 --datadir ./bark-signet secret show`. Put it into `BARK_TOKEN` in your app's private `.env`; use `BARK_URL=http://127.0.0.1:3001` and `PAYMENT_MODE=signet`. Do not publish the daemon port or enable cross-origin browser access.

```sh
pnpm bark:create-wallet
pnpm bark:smoke
pnpm build
PUBLIC_URL=http://localhost:3000 pnpm start
```

Wallet creation generates a new seed inside the daemon's data directory and fails if a wallet already exists. This smoke test creates receiving instructions for all three methods and decodes invoice expiry; it does not establish settlement correctness.

Signet endpoints used by the setup script:

- Ark: `https://ark.signet.2nd.dev`
- Esplora: `https://esplora.signet.2nd.dev`

[Second's faucet](https://signet.2nd.dev/) requires GitHub login. Use a separate funded signet sender wallet to contribute via the mobile page. The Second team at the hackathon can help with signet funds and compatible wallets.

## Settlement acceptance run

1. Create a 5,000-sat Lightning request; pay its signet invoice. Confirm the app credits only after `settled`, and the amount matches the attributable net receive movement.
2. Pay the exact Ark address shown by the app. Confirm its successful history movement has `received_on.destination.type=ark` and the exact address value. Send again to the same address; both receipts should count once.
3. Send Bitcoin to a fresh app address. Verify pending before confirmation and credited after one confirmation. Send an additional payment to the same address. Restart the app before confirmation; verify recovery after it returns.
4. Repeat reconciliation and restart both services. Exact raised total must remain unchanged. Wallet refresh, funding to unrelated addresses, and outgoing movements must not grow the game.
5. Run the screen and phone together. Verify celebrations, visible names, and the same exact total on both.

Receipt keys are Bark history movement IDs and Bitcoin `txid:vout` outpoints. Keep the app ledger and Bark wallet database as a matched pair. Restoring only a seed can reconstruct funds but cannot reconstruct receipt history safely.

## Mainnet

Use a **new mainnet wallet directory**, a separate app ledger, and the VPS HTTPS URL. Mainnet defaults in the setup script are `https://ark.second.tech` and `https://mempool.second.tech/api`, from [Second's connection details](https://second.tech/docs/connection-details). `ARK_SERVER` and `ESPLORA_URL` can override these when creating the wallet.

Set `PAYMENT_MODE=mainnet` and run `pnpm bark:create-wallet --mainnet` once. Complete backups, then enable `LIVE_PAYMENTS_ENABLED=true`. Mainnet instructions and the app should stay private to the operator until the small real-sats smoke test passes; publish the venue QR afterward. The app has no automated spending endpoints. Use organizer tools separately for prize distribution.

## Wallet upkeep and backup

Keep Bark running so its background daemon synchronizes receives and maintains VTXOs. Watch service logs and verify refresh behavior with the Second team before leaving funds unattended. Do not upgrade or recreate this wallet during the event without a backup and a reconciliation check.

Record the seed offline before real donations. Bark stores the mnemonic in its data directory; follow [Second's backup instructions](https://second.tech/docs/backups) for retrieval. A seed alone does not preserve history or exits. Keep encrypted off-machine backups of the full wallet state, and verify restoration. For a consistent manual directory snapshot, stop Bark first, copy the full directory securely, then restart. Never copy only a SQLite main file while it is being written. Second's experimental continuous backup tools need their own restore test.

Use `pnpm backup /secure/ledger-backups` for a consistent app-ledger SQLite snapshot without stopping the app. Preserve the configuration and wallet state alongside it. See deployment docs for the restore sequence.
