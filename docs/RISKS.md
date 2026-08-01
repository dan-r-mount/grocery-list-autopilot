# Risks & constraints

## Critical constraints

### Google Keep

- Official Keep API is **Workspace enterprise-only**, not suitable for a normal consumer Gmail/Keep setup.
- Unofficial clients (`gkeepapi`) need powerful account tokens and can break without notice.
- **Mitigation:** `ListSource` interface; UI-owned list as durable primary; Keep as optional sync.

### Sainsbury’s

- No public personal basket API; internals can change and may conflict with site terms.
- Login often involves MFA; sessions expire (~days).
- Bot protection / WAF may block automation.
- **Mitigation:** dry-run by default; encrypted session store; human re-auth flow; Playwright fallback; **never checkout automatically**.

### Legal / ToS

Automating a supermarket site and unofficial Keep access may violate terms of service. This project is a **personal household tool**, not a product for redistribution. Use at your own risk; prefer read/search first, then minimal basket writes.

## Product risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Wrong product added (e.g. 1L instead of 4L) | Wasted run / bad trust | Confidence threshold; UI approve low-confidence; learn from overrides |
| Partner and you disagree on brand | Churn in preferences | Show both last picks; allow per-term lock |
| Notification missed | Stale basket / forgotten clear | Persistent UI “needs sign-off”; email fallback |
| Keep sync deletes items unexpectedly | Data loss | Never auto-delete Keep items in MVP; only suggest check-off |

## Technical risks

| Risk | Mitigation |
|------|------------|
| Sainsbury’s endpoint drift | Adapter isolation + contract tests with recorded fixtures |
| Secret leakage (session cookies) | `.env` gitignored; secret manager in prod; redact logs |
| Overbuilt ML too early | Frequency tables first; patterns only after N signed-off shops |

## Security checklist (before live writes)

- [ ] `SAINSBURYS_WRITE_ENABLED` defaults false
- [ ] Session encryption key required
- [ ] Audit log for every add
- [ ] Rate limits on retailer calls
- [ ] No checkout / payment endpoints wired
