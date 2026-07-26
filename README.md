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

Planning and scaffolding only. See:

- [Product & delivery plan](docs/PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
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
