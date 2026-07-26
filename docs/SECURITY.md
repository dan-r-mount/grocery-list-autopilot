# Security & login

## Goals

- **No Sainsbury’s email/password in git, `.env`, or source code**
- You (and your partner) can open the app on a **Google Pixel** and complete login flows there
- Autopilot can use a Sainsbury’s **session** to fill the basket, but **never** places the order
- Fail closed: if the retailer vault is locked or the session expired, weekly push does not write

## Two separate login problems

| Concern | Who | Mechanism |
|---------|-----|-----------|
| **Household app access** | You + partner | **Passkeys (WebAuthn)** on the Pixel / laptop |
| **Sainsbury’s retailer session** | You (account owner) | **Interactive browser connect** → encrypted session vault |

Partner can use the shared list UI with a passkey. Only the Sainsbury’s account holder needs to run **Connect Sainsbury’s**.

## Household auth — passkeys

Why passkeys:

- Built into Pixel / Chrome — biometric unlock, no shared password to leak
- Phishing-resistant
- No Google OAuth client secrets or household passwords in `.env`

Bootstrap:

1. First visitor to a fresh install registers the **first household passkey** (you).
2. While signed in, you can create a short-lived **partner invite** code.
3. Partner opens the app on their phone, enters the invite, registers their own passkey.
4. API sessions are httpOnly cookies after a successful passkey assertion.

Mobile requirement: passkeys need a **secure context (HTTPS)** except on `localhost`.  
For Pixel testing against a home server, use the Cloudflare tunnel helper (see below) so the phone hits `https://…`.

## Sainsbury’s — secure connect (no stored password)

Sainsbury’s has no OAuth for personal third-party apps. The secure pattern is:

```text
Tap “Connect Sainsbury’s” on Pixel
        │
        ▼
Server starts an isolated browser session (Playwright)
        │
        ▼
Phone shows a live view of that browser (screenshots + taps)
        │
        ▼
You complete Sainsbury’s login + MFA yourself
        │
        ▼
App extracts session cookies / tokens only
        │
        ▼
Encrypts them into the retailer vault with your vault passphrase
        │
        ▼
Browser session is destroyed — password never persisted
```

### Vault rules

- At rest: **AES-256-GCM** ciphertext in `data/sainsburys.vault`
- Key: derived with **scrypt** from a **vault passphrase you enter in the UI** (not stored on disk, not in `.env`)
- In memory: after unlock/connect, plaintext session may be held until TTL expiry or process restart
- Weekly job: if vault locked / session missing → notify “Reconnect Sainsbury’s” and skip writes
- Disconnect: deletes vault ciphertext and clears memory

### What we never do

- Store Sainsbury’s password
- Put session JSON in `.env`
- Auto-checkout or save card details
- Log raw cookies

## Config vs secrets

Allowed as plain config (optional env or UI): ports, feature flags, public web origin, ntfy topic name.

Must not live in `.env`:

- Sainsbury’s password
- Sainsbury’s session cookies
- Household shared passwords
- Keep master tokens (if Keep is added later, use the same vault pattern)

Server-generated secrets (HMAC for app cookies, etc.) live under `data/` with restrictive permissions — created on first boot, not checked into git.

## Pixel testing

1. Start API + web bound to all interfaces.
2. Run `scripts/mobile-tunnel.sh` (Cloudflare quick tunnel) → get an `https://*.trycloudflare.com` URL.
3. Open that URL on the Pixel Chrome/browser.
4. Register passkey (fingerprint / screen lock).
5. Set vault passphrase → **Connect Sainsbury’s** → complete login in the live view.
6. Run a dry-run push from the phone UI.

Same Wi‑Fi HTTP to a LAN IP is fine for crude UI checks, but **passkeys will not work** without HTTPS.

## Threat notes

| Threat | Mitigation |
|--------|------------|
| Stolen `data/sainsburys.vault` file | Useless without vault passphrase |
| XSS stealing retailer session | httpOnly app cookie; CSP later; never expose vault key to JS |
| Partner overreach | Partner passkeys can use list UI; Connect Sainsbury’s limited to signed-in users (optionally owner-only later) |
| Session replay after disconnect | Disconnect wipes vault; retailer should invalidate on password change |
| Tunnel URL leakage | Quick tunnels are unguessable but treat as sensitive while running |

## Implementation status

| Piece | Status |
|-------|--------|
| Security model (this doc) | Done |
| Passkey register / login / partner invite | Done |
| Encrypted retailer vault | Done |
| Live mobile connect view (Playwright) | Done (install Chromium via `pnpm playwright:install`) |
| Cloudflare tunnel script for Pixel | Done (`pnpm mobile` / `pnpm tunnel`) |
| ntfy push to Pixel | Done (topic configured in UI) |
| Production hardening (CSP, rate limits, owner role) | Later |
