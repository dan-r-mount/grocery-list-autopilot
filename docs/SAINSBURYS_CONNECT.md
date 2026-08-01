# Sainsbury’s Connect — working through Akamai

## What’s actually failing

From a US/cloud datacenter IP, even a plain HTTPS request is refused:

```text
GET https://www.sainsburys.co.uk/  →  403 Access Denied (Akamai)
```

So this is **not** “your passphrase is wrong” and not only “Playwright looks like a bot.”  
Sainsbury’s grocery site is **geo/IP locked** (UK) and bot-scored. Our temporary demo host was in **AWS Ashburn (US)** — blocked before any login form can load.

## What has to be true for Connect to work

| Requirement | Why |
|-------------|-----|
| **UK egress IP** | Akamai geo gate |
| **Good IP reputation** | Prefer **UK residential or mobile**, not random datacenter |
| **Real browser session** | Login + MFA; earn Akamai cookies (`_abck`, etc.) |
| **Sticky IP for that session** | Sensor cookies are bound to the IP |

Weekly basket API calls after login must use the **same class of UK egress**, or the session dies.

## Supported Connect modes (product)

### A0. Persistent browser profile — recommended

Autopilot keeps its own Chromium profile (`data/browser-profile`). You sign in once inside it; the session then behaves like any everyday browser session — cookies rotate in place and nothing is exported. Run this on a UK home machine and the geo gate disappears.

Full comparison of auth approaches: [AUTH_OPTIONS.md](./AUTH_OPTIONS.md).

### A. Server Connect + UK proxy (production default for always-on hosts)

1. Configure a **UK residential/mobile proxy** in Settings (sticky session).
2. Autopilot launches a hardened Playwright browser **through that proxy**.
3. You complete login/MFA in the live view on your phone.
4. Session cookies are sealed into the encrypted vault.

Same path for demo and production: only the proxy credentials / host region change.

### B. On-device Pixel login (uses *your* mobile UK IP)

1. Autopilot opens an in-app WebView to Sainsbury’s on the Pixel.
2. You log in normally (real Chrome WebView, EE/O2/etc. IP).
3. The app reads the WebView cookie jar and seals it into the vault.
4. Later jobs reuse that session via UK egress (proxy or UK-hosted API).

This is the right answer when the **API runs in the cloud** but **login happens on your phone**.

## What we will not do

- Pretend a “demo vault” replaces Sainsbury’s login
- Store your Sainsbury’s password in `.env`
- Auto-checkout

## Operator checklist

1. Open **Settings → Sainsbury’s egress** and run **Test reachability**.
2. If blocked, set a UK residential proxy (or install the Pixel app for on-device login).
3. Tap **Connect Sainsbury’s**, complete MFA, **Save encrypted session**.
4. Run a dry-run, then enable live basket writes when ready.
