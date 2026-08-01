# Decision log

Lightweight ADR-style notes. Newest first.

## 2026-08-01 — Persistent browser profile is the primary auth model

**Context:** Sainsbury’s has no consumer OAuth; exporting a cookie jar to a cloud host makes a bearer credential portable and puts it on hardware the household doesn’t own.  
**Decision:** Default to a long-lived Chromium profile on a self-hosted UK machine — log in once, never export session material. Proxy mode reuses the same profile; encrypted cookie import is demoted to a cloud-demo fallback.  
**Consequences:** Needs an always-on home machine; profile directory is sensitive (0700 + disk encryption). See [AUTH_OPTIONS.md](./AUTH_OPTIONS.md).

## 2026-07-26 — Work through Sainsbury’s Akamai, don’t bypass with demo vault

**Context:** US/cloud IPs get HTTP 403 Access Denied before login; demo vault is not a substitute.  
**Decision:** Require UK residential/mobile egress for server Connect, plus Pixel cookie-import login that uses the phone’s real UK IP.  
**Consequences:** Probe + proxy settings + hardened Playwright; phone import is the phone-only path that actually authenticates.

## 2026-07-26 — Passkeys + encrypted retailer vault (no Sainsbury’s secrets in .env)

**Context:** Sainsbury’s login must work from a Pixel without hard-coded credentials or session JSON in `.env`.  
**Decision:** Household access via WebAuthn passkeys; Sainsbury’s via interactive connect → AES-GCM vault unlocked by UI passphrase; app cookie signing secret generated under `data/`.  
**Consequences:** Pixel testing needs HTTPS (Cloudflare tunnel). Partner can use the UI without holding the retailer password.

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
