# Grocery List Autopilot

Personal grocery autopilot for a couple: sync a shared shopping list, map vague items (e.g. “milk”) to the Sainsbury’s products you actually buy, add them to your Sainsbury’s basket on a weekly schedule, notify you, and never place the order without a human sign-off.

## Goal (first success)

1. **Milk** appears on the shopping list.
2. The app resolves it to the usual product (e.g. 4L semi-skimmed) using learned preferences.
3. It adds that product to the Sainsbury’s basket.
4. You get a push notification.
5. You (or your partner) review the basket on Sainsbury’s and **sign off** the order.

After that works reliably, expand to the rest of the list and richer learning (top-ups mid-week, shopping-frequency patterns, quantity adjustments).

## Status

Planning, dry-run scaffold, and **secure login foundation** (passkeys + encrypted Sainsbury’s vault). See:

- [Product & delivery plan](docs/PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security & login](docs/SECURITY.md)
- [Milk MVP](docs/MVP.md)
- [Risks & constraints](docs/RISKS.md)

## High-level flow

```text
Google Keep list ──► Autopilot sync ──► Preference resolver ──► Sainsbury’s basket
                           │                      │
                           ▼                      ▼
                     Shared web UI          Push notification
                           │
                           ▼
                  Human reviews & checks out
```

## Repo layout

```text
apps/web          Shared shopping-list UI (you + partner)
apps/api          Sync, resolve, schedule, notify, Sainsbury’s adapter
packages/shared   Shared types and contracts
docs/             Plans and decisions
scripts/          Local helpers
```

## Principles

- **Human signs off** — the app adds to basket; it does not checkout.
- **Learn from choices** — every confirmed product/qty becomes training signal.
- **Start narrow** — milk first, then categories, then full list.
- **Prefer durable integrations** — Keep and Sainsbury’s both lack friendly personal APIs; adapters must isolate that fragility.

## Next step

Read [docs/PLAN.md](docs/PLAN.md) and [docs/MVP.md](docs/MVP.md), then implement Phase 0 locally against a dry-run Sainsbury’s adapter.

## Local dry-run

```bash
pnpm install
pnpm --filter @gla/shared build
pnpm milk:resolve    # milk → preferred 4L product
pnpm milk:push       # dry-run weekly basket push + notify log
pnpm dev:api         # http://localhost:3001 (binds 0.0.0.0)
pnpm dev:web         # http://localhost:3000
```

## Secure login (Pixel)

Sainsbury’s email/password are **never** stored in `.env`. You sign into the app with a **passkey**, then use **Connect Sainsbury’s** to complete login in a live browser view; only an encrypted session vault is kept (`data/sainsburys.vault`).

Details: [docs/SECURITY.md](docs/SECURITY.md)

### Test on a Google Pixel

1. Start `pnpm dev:api` and `pnpm dev:web`.
2. Run `scripts/mobile-tunnel.sh` (needs `cloudflared`) and open the `https://*.trycloudflare.com` URL on the Pixel.
3. Register a passkey (fingerprint / screen lock).
4. Set a vault passphrase → **Connect on this phone** → sign in to Sainsbury’s in the live view → **Save encrypted session**.

Passkeys require HTTPS on a phone; plain `http://LAN-IP:3000` is not enough.
