# Decision log

Lightweight ADR-style notes. Newest first.

## 2026-07-26 — Plan first, milk MVP second

**Context:** Large automation surface (Keep + Sainsbury’s + learning + notifications).  
**Decision:** Ship planning docs + dry-run scaffold before any live retailer writes.  
**Consequences:** Safe demos via `milk:resolve` / `milk:push`; live work gated by `SAINSBURYS_WRITE_ENABLED`.

## 2026-07-26 — List owned by app; Keep is an adapter

**Context:** Official Google Keep API is enterprise-only.  
**Decision:** Internal list model is source of truth; Keep sync optional behind `ListSource`.  
**Consequences:** UI works for both partners even if Keep auth breaks.

## 2026-07-26 — Basket only, never checkout

**Context:** Success is human sign-off on the Sainsbury’s order.  
**Decision:** Autopilot may add basket lines only; no payment/slot-booking automation in MVP.  
**Consequences:** Lower risk; matches stated success criteria.
