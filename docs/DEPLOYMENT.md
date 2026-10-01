# Deploy on a Linux VPS

This project ships deployment files; it does not provision a VPS or purchase a domain. Use a Linux VPS with Node.js 24+, pnpm 11.19.0, systemd, and Caddy. Node must be available at `/usr/bin/node`; edit `ExecStart` if your installation differs.

## First deploy the simulation

1. Point the `playitforward.money` DNS A record at the VPS. Add an AAAA record only if IPv6 is configured. Allow inbound 80/443. Keep 3000 and 3001 private.
2. Create a `playforward` system user. Put the repository at `/opt/play-it-forward`. Build with `pnpm install --frozen-lockfile && pnpm build`. The service runs TypeScript through the pinned `tsx` dependency; keep production and dev dependencies installed for this release.
3. Create `/var/lib/play-it-forward` owned by `playforward:playforward`, mode 0700. Give that account read access to the app checkout. Do not put secrets in the web-served directory.
4. Copy `deploy/production.env.example` to `/etc/play-it-forward.env`. Set a random `ADMIN_TOKEN` generated with `openssl rand -hex 32`; leave `PAYMENT_MODE=demo`. Restrict the env file to root, mode 0600. Systemd loads it before switching service users.
5. Copy `deploy/play-it-forward.service` to `/etc/systemd/system/`. Run `sudo systemctl daemon-reload` and `sudo systemctl enable --now play-it-forward`.
6. Install the provided Caddy site block in `/etc/caddy/Caddyfile` (merge it if other sites exist), validate with `sudo caddy validate --config /etc/caddy/Caddyfile`, and reload Caddy. The domain must resolve before certificate issuance.
7. Check `/screen`, `/donate`, and `/admin` over HTTPS. Confirm a 100-payment simulated burst and a multi-milestone gift. Scan the screen QR with a physical phone. The URL in the QR must be the public domain, not localhost.

## Enable Bark in stages

Follow `PAYMENTS.md` first. Download pinned Bark 0.7.1 from official releases, make the binary executable, and place it at the path used in `deploy/barkd.service`. Copy that unit into `/etc/systemd/system/`. For signet testing, change its datadir to `/var/lib/play-it-forward/bark-signet`. Start the daemon and create the wallet using the setup script and a private operator env file.

`/etc/play-it-forward.env` is not automatically read by command-line scripts. For maintenance commands, run them from the checkout with `DOTENV_CONFIG_PATH=/path/to/private/operator.env` (owned by the operator, mode 0600). Copy only the necessary Bark settings into this file; never print tokens to a shared log. Do not source an untrusted shell env file.

Retrieve the daemon token as its service user with `sudo -u playforward /usr/local/bin/barkd-0.7.1 --datadir /var/lib/play-it-forward/bark-signet secret show`. Put the token in the private operator file and service env file. Set the network to signet, run the create-wallet and smoke scripts, restart the app, and complete the funded acceptance run.

For mainnet, switch the daemon to the separate `bark-mainnet` directory, retrieve that directory's token, and create its wallet using `PAYMENT_MODE=mainnet` and `--mainnet`. Preserve signet data. Back up the new mainnet wallet before using it. Set `PAYMENT_MODE=mainnet`, its `BARK_TOKEN`, and `LIVE_PAYMENTS_ENABLED=true` in the service env. Restart Bark and the app; test a small contribution privately before displaying the QR publicly. `/admin` should report successful reconciliation. No real wallet credentials ship in this repo.

## Monitoring

```sh
sudo systemctl status play-it-forward barkd caddy
sudo journalctl -u play-it-forward -u barkd -f
```

The operator desk shows network mode, last successful reconciliation, errors, and connected pages. A failed reconciliation preserves the ledger; no speculative credit is issued. The venue screen shows a reconnect message when its SSE connection drops, and restores the current total on reconnection. Neither a new screen nor a restarted server replays the full animation history.

## Back up and recover

Back up the app ledger with `pnpm backup /secure/backup-directory`, using the same `DATA_DIR` and `PAYMENT_MODE` as the service. SQLite's online backup includes WAL changes. Encrypt backups, keep copies off the VPS, and preserve the event config and full Bark wallet data separately.

To restore: stop the app and Bark; preserve the current directories as a rollback copy; restore the matched wallet snapshot, config, and ledger snapshot; restore ownership and private permissions; start Bark, then the app. The app reconciles on startup. Compare totals with the backup and receipt history, and manually test idempotent reconciliation before displaying the QR again. Do not point an old ledger at a newly created wallet, because Bark movement IDs are wallet-local.

The donation total measures net credited receipts raised through the app, not the remaining spendable wallet balance. A seed-only wallet recovery lacks payment history and requires an accounting review rather than automatic reconstruction of donations.

## Updating

Back up before an update. Keep Node 24+ and Bark 0.7.1 for this release. Run tests and the build, restart the app, and verify health and totals. The adapter rejects an incompatible daemon version or mismatched network. Node's SQLite migrations currently only create missing tables; no destructive migration is included. Keep the previous checkout and backups for rollback.
