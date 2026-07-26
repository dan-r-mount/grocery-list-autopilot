# Product & delivery plan

## Problem

You and your partner keep a shopping list in Google Notes/Keep. Every week, those items need to land in a Sainsbury’s basket with the *right* products (not just any “milk”), then someone reviews and completes checkout. Doing that manually is repetitive; the interesting part is learning preferences and patterns over time.

## Success definition

| Level | What “done” means |
|-------|-------------------|
| **MVP** | “Milk” on the list → preferred 4L (or whatever you always pick) added to Sainsbury’s basket → push notification → human checkout |
| **v1** | Full weekly list sync, shared UI, remove/confirm items after push, basic SKU memory |
| **v2** | Pattern learning (top-up milk mid-week, order more when shopping less often), confidence scores, partner overrides |
| **Out of scope (for now)** | Auto-checkout, payment, delivery-slot booking without confirmation |

## Personas & access

- **You** — Google Keep source account, Sainsbury’s account owner, receives push notifications.
- **Partner** — shared web UI access (same household list), can confirm/override product picks; does not need Keep/Sainsbury’s credentials.

## Source of truth strategy

Google Keep’s official API is **enterprise-only**. For a personal project:

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **A. Unofficial Keep sync** (`gkeepapi` / private Keep API) | Matches current habit | Fragile auth (master token), ToS risk, can break | Use as Phase 1 *adapter*, behind an interface |
| **B. App-owned list + Keep as optional import** | Stable, shareable UI becomes primary | Slight habit change | **Preferred long-term** |
| **C. Google Tasks / Sheets** | Official OAuth APIs | Not your current list | Fallback if Keep adapter fails |

**Decision for MVP:** treat the shopping list as an internal model. Implement a `ListSource` interface with:

1. `Manual` / UI source (always available)
2. `GoogleKeep` adapter (best-effort sync of one named list, e.g. “Shopping”)

That way the product works even when Keep auth breaks.

## Sainsbury’s strategy

There is **no public personal basket API**. Practical approaches:

1. **HTTP adapter** against Sainsbury’s internal grocery APIs (search + add-to-basket), using a refreshed session (cookies + auth token). Reference community work such as `uk-grocery-cli` for endpoint shapes.
2. **Browser automation** (Playwright) as a fallback when APIs change.
3. **Never auto-checkout** — basket only; human completes order on sainsburys.co.uk / app.

Auth reality: sessions expire; MFA is common. Plan for a **session refresh ritual** (you re-authenticate periodically; the app stores encrypted session material).

## Learning model (start simple)

For the milk example:

1. When resolving “milk”, search Sainsbury’s candidates.
2. Rank by:
   - exact previous confirmed SKU
   - same size/variant family (4L, semi-skimmed, brand)
   - household default if no history
3. On human confirmation (order placed / item accepted in UI), write a `Preference` record:
   - list term → product UID / SKU
   - quantity
   - context features later: days since last shop, weekday, main vs top-up run
4. Pattern jobs (post-MVP) look for correlations such as:
   - higher milk qty when gap between shops > N days
   - mid-week top-up when milk appears mid-cycle

Do **not** start with ML. Start with deterministic rules + frequency counts; graduate to simple models only when you have enough signed-off orders.

## Weekly push workflow

```text
Sunday evening (configurable)
  1. Sync list source → open items
  2. Resolve each item → product + qty (confidence score)
  3. Low-confidence items held for UI approval
  4. High-confidence items added to Sainsbury’s basket
  5. Push notify: “N items added — review basket & clear list”
  6. UI shows run report; humans remove/check off Keep/app items after checkout
```

## Phased delivery

### Phase 0 — Foundations (this PR)

- Repo layout, docs, shared contracts
- Dry-run adapters (no real Keep / Sainsbury’s calls)
- Local “milk” resolution demo with seeded preference

### Phase 1 — Milk MVP

- Shared web UI: list view, suggested product for milk, accept/override
- Sainsbury’s search + add-to-basket behind feature flag
- Manual session import for Sainsbury’s auth
- One push channel (e.g. ntfy or Web Push)
- Cron / scheduled job stub for weekly run
- After successful add: notification + UI state `awaiting_human_signoff`

### Phase 2 — Keep sync + multi-item

- Google Keep list adapter
- Resolve multiple list lines
- Remove/check-off guidance after push
- Partner invite (simple shared household auth)

### Phase 3 — Learning & patterns

- Preference store with confirmation feedback loop
- Quantity suggestions from history
- Top-up vs main-shop classification
- Confidence thresholds and “ask before add”

### Phase 4 — Hardening

- Session refresh UX, monitoring, API drift detection
- Playwright fallback path
- Audit log of every basket mutation

## Suggested stack

| Layer | Choice | Why |
|-------|--------|-----|
| Monorepo | pnpm workspaces + TypeScript | One language across UI/API |
| Web | Next.js (App Router) | Simple shared UI + auth later |
| API / jobs | Node (Nest or lightweight Hono/Fastify) | Fits TS monorepo; easy cron |
| DB | SQLite → Postgres | SQLite for solo MVP; Postgres when hosted |
| Keep adapter | Optional Python sidecar or HTTP bridge | `gkeepapi` is Python-first |
| Sainsbury’s | Custom TS client + dry-run mode | Isolate fragility |
| Notifications | ntfy.sh (fastest) or Web Push | Mobile alert without building an app |
| Hosting | Single VPS / Fly.io / Railway | Needs persistent session + cron |

## Open decisions (need your input later)

1. Confirm list source is **Google Keep** (vs Notes app / Tasks).
2. Preferred notification channel (ntfy, Telegram, WhatsApp, Web Push).
3. Who owns the Sainsbury’s login / Nectar account.
4. Weekly run day/time and timezone.
5. Whether the web UI should become the primary list (Keep as sync only).

## Immediate implementation order after this plan lands

1. Seeded preference: `milk` → example 4L SKU
2. Dry-run weekly job that “adds” milk and emits a notification payload
3. Minimal shared UI showing list + last run
4. Real Sainsbury’s search (read-only) before write
5. Real add-to-basket + human sign-off checklist
