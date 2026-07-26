# Architecture

## System context

```text
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ Google Keep │────►│  Autopilot API   │────►│ Sainsbury’s grocery│
│  (adapter)  │     │  + weekly job    │     │   (basket only)    │
└─────────────┘     └────────┬─────────┘     └────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
              ┌─────▼─────┐    ┌──────▼──────┐
              │  Web UI   │    │ Push notify │
              │ (household)│    │  (mobile)   │
              └───────────┘    └─────────────┘
```

## Bounded contexts

1. **List** — items to buy, source sync, check-off state  
2. **Resolve** — map free-text → product UID + quantity + confidence  
3. **Basket** — Sainsbury’s session, search, add/remove, dry-run  
4. **Notify** — push after a run  
5. **Learn** — preferences from human-confirmed selections  
6. **Household** — you + partner access to the shared UI  

## Core domain model

```ts
// Conceptual — see packages/shared

Item {
  id, rawText, status: open|resolved|pushed|done|skipped
  source: keep|manual|import
}

ProductCandidate {
  productUid, sku, name, sizeLabel, price, imageUrl
}

Preference {
  termNormalized   // "milk"
  productUid
  defaultQty
  confirmations
  lastConfirmedAt
}

Resolution {
  itemId
  chosen: ProductCandidate
  qty
  confidence: 0..1
  reason: "exact_preference" | "size_match" | "search_rank" | "needs_review"
}

BasketRun {
  id, scheduledFor, startedAt, finishedAt
  status: dry_run|partial|pushed|failed|awaiting_signoff
  lines: [{ itemId, productUid, qty, result }]
}
```

## Adapter interfaces

All external systems sit behind ports so MVP can run offline:

```ts
interface ListSource {
  pullOpenItems(): Promise<ListItem[]>
  markDone?(externalId: string): Promise<void>
}

interface GroceryRetailer {
  search(query: string): Promise<ProductCandidate[]>
  addToBasket(productUid: string, qty: number): Promise<void>
  getBasket(): Promise<BasketSnapshot>
}

interface Notifier {
  notify(message: NotificationPayload): Promise<void>
}

interface PreferenceStore {
  get(term: string): Promise<Preference | null>
  recordConfirmation(term: string, productUid: string, qty: number, context: ShopContext): Promise<void>
}
```

### Implementations (planned)

| Port | Dry-run / MVP | Production |
|------|---------------|------------|
| `ListSource` | In-memory / SQLite seeded with “milk” | Google Keep adapter + UI writes |
| `GroceryRetailer` | Fixture catalogue + log-only basket | Sainsbury’s HTTP client |
| `Notifier` | Console / file | ntfy or Web Push |
| `PreferenceStore` | SQLite | Same, later Postgres |

## Resolution algorithm (milk-first)

```text
normalize("Milk") → "milk"
preference = store.get("milk")
candidates = retailer.search("milk")   // or "semi skimmed milk 4l" if known

if preference matches a candidate:
  return { product: preference.productUid, qty: preference.defaultQty, confidence: 0.95 }

if user previously confirmed size family (4l):
  pick best size-family match, confidence: 0.7

else:
  return top search hit with confidence: 0.4 → UI must approve before basket add
```

Weekly job only auto-adds when `confidence >= threshold` (default `0.8`).

## Learning signals

Captured on human sign-off / override:

| Signal | Use |
|--------|-----|
| Confirmed SKU for term | Primary preference |
| Quantity | Default qty |
| Days since last main shop | Later: qty uplift |
| Mid-week vs weekend run | Top-up detection |
| Override away from suggestion | Negative signal / retrain |

## Security

- Store Sainsbury’s session material encrypted at rest.
- Keep master token / OAuth secrets in env / secret manager only.
- Household UI behind simple auth (shared password or magic links initially).
- Audit every basket mutation.
- Feature flags: `SAINSBURYS_WRITE_ENABLED=false` until milk dry-runs look correct.

## Deployment sketch

```text
[cron] weekly-run → api worker
[web]  Next.js UI → api
[db]   SQLite file volume (MVP)
```

Single small host is enough for two users.

## Package map

```text
packages/shared   types + pure resolve helpers
apps/api          HTTP + jobs + adapters
apps/web          household list + run review
```
