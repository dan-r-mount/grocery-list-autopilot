# Authentication approaches — what’s actually appropriate

Short answer: **cookie export is the worst of the workable options**, and it’s only there because the demo runs on a US cloud host. For a real household deployment, the right model is a **persistent browser profile on a machine you own in the UK** — or letting the **phone itself be the agent**.

## Why there’s no clean option

Sainsbury’s groceries has:

- no public OAuth / partner API for personal basket automation
- no API keys or scoped tokens for consumers
- Akamai bot management plus a UK geo gate

So there is nothing to “integrate with” in the normal sense. Every approach is some form of *acting as you, in a browser you control*. The engineering question is therefore **where the session lives and who can see it**, not “which API do we call.”

## Options, ranked

### 1. Persistent browser profile on your own machine — recommended

Autopilot keeps one long-lived Chromium profile (`data/browser-profile`). You log in **once** inside it; afterwards the browser holds the session exactly like your everyday browser.

| Property | Result |
|----------|--------|
| Credentials seen by app | None — you type into the retailer’s own page |
| Session export | **Never happens** |
| Session refresh | Automatic; cookies rotate in place |
| Akamai / geo | Solved for free when the machine is on your UK home network |
| Blast radius | Session material stays on hardware you own |

Downsides: needs an always-on machine (a spare laptop, mini PC, or Raspberry Pi) and the profile directory is sensitive (use disk encryption; we set `0700`).

This is implemented: **Connect (persistent profile)** in the UI.

### 2. Phone as the agent

The Android app holds the logged-in WebView session and performs basket operations itself; the server only sends it a shopping list. Auth never leaves the device.

Best privacy story, but the phone must run the weekly job (WorkManager), and building basket logic twice is real work. Good future direction if you want zero server-held session material.

### 3. Browser extension in your own browser

An extension acts inside your existing logged-in session. No session storage at all. But it only runs when the browser is open, so “every week automatically” becomes unreliable.

### 4. Cloud host + UK residential proxy + exported cookies — last resort

What the current cloud demo does. It is the **weakest** option because:

- the cookie jar (a bearer credential) is transported off-device
- it lives on a host you don’t own
- proxies add another party who can see the traffic
- sessions expire and must be re-exported manually

Keep it only for a cloud deployment you control, with the vault encrypted (already the case) and short session lifetimes.

### 5. Things that don’t help

| Idea | Why not |
|------|---------|
| Store email + password and auto-login | Worst option: durable credential at rest, breaks on MFA, invites account lockout |
| Scraping-as-a-service APIs | Catalogue data only; cannot touch *your* basket |
| Passkeys for Sainsbury’s | Improves *your* login, doesn’t give an agent access |
| “Just use the mobile app API” | Same auth problem, plus attestation |

## What this means for the demo you tried

Typing your real Sainsbury’s login into a temporary cloud-hosted browser, then shipping cookies to that host, is **not** something to do with a real account. That path exists to prove the mechanism only. Use option 1 on your own machine for the real connection.

## Household app login is a separate, solved problem

Access to Autopilot itself (you + partner) uses **passkeys** — phishing-resistant, no shared password, nothing sensitive in config. That part is already the appropriate modern answer; the awkwardness is entirely on the retailer side.

## Decision

- **Default:** persistent profile, self-hosted in the UK
- **Fallback:** UK residential proxy with the same persistent profile
- **Last resort:** encrypted cookie import (Pixel Session Saver), for cloud demos
- **Never:** retailer password stored by the app; auto-checkout
