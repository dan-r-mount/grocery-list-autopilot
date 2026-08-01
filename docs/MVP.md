# Milk MVP

Smallest end-to-end slice that proves the product.

## User story

> As a household, when **milk** is on our shopping list, Autopilot should put **our usual milk** into the Sainsbury’s basket, tell me on my phone, and wait for me to complete the order.

## Acceptance criteria

1. An open list item exists with text containing `milk` (case-insensitive).
2. Resolver selects a preferred product when a preference exists (seeded initially, e.g. 4L semi-skimmed).
3. In **dry-run** mode, the system records “would add SKU X qty N” without calling Sainsbury’s write APIs.
4. In **live** mode (flag on), the system adds that product to the logged-in Sainsbury’s basket.
5. A push notification is sent: items added + reminder to review basket and clear the list.
6. Web UI shows the run: item → product → qty → status `awaiting_human_signoff`.
7. After human checkout, marking the run as signed off records a preference confirmation (learning signal).
8. The app **never** places the order or takes payment.

## Non-goals for MVP

- Syncing the whole Keep list automatically (manual/seeded item is enough)
- Multi-item weekly batch
- Fancy ML / pattern detection
- Delivery slot booking
- Partner accounts beyond shared UI access

## Demo script

```text
1. Seed preference: milk → <productUid> qty 1 (or 2)
2. Seed list: ["milk"]
3. Run: pnpm --filter api milk:resolve   # shows chosen product + confidence
4. Run: pnpm --filter api milk:push --dry-run
5. Open web UI → see pending sign-off
6. (Later) enable write flag → real basket add → phone notification
7. Checkout on Sainsbury’s → mark signed off in UI → preference confirmations++
```

## Metrics of “it worked”

- First live run: milk appears in Sainsbury’s basket with correct size/variant.
- Notification received within ~1 minute of the job.
- You complete checkout without editing the milk line.
- Second run reuses the same SKU without asking (confidence ≥ 0.8).
