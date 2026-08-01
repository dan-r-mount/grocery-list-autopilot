# Testing on your Google Pixel

You do **not** install or run `pnpm` on the phone.

| Where | What you do |
|-------|-------------|
| **Computer** (laptop/desktop) | Install Node, run the app, create an HTTPS link |
| **Pixel** | Open that link in Chrome and use the UI |

Think of the computer as the “server in your house.” The phone is just a remote control.

## One-time setup on your computer

1. Install [Node.js 20+](https://nodejs.org/) (includes corepack).
2. Clone the repo and install deps:

```bash
git clone https://github.com/dan-r-mount/grocery-list-autopilot.git
cd grocery-list-autopilot
git checkout cursor/plan-and-scaffold-068d   # or main once merged
corepack enable
pnpm install
pnpm --filter @gla/shared build
pnpm playwright:install
```

3. Start everything for phone testing:

```bash
pnpm mobile
```

That starts the API, the website, and a temporary HTTPS tunnel. In the terminal you will see a URL like:

```text
https://random-words-here.trycloudflare.com
```

## On the Pixel

1. Open **Chrome**.
2. Paste that `https://…` URL.
3. Tap **Register passkey** (use fingerprint / screen lock).
4. Optional: install **[ntfy](https://play.google.com/store/apps/details?id=io.heckel.ntfy)** from Play Store, create/subscribe to a topic, enter that topic in the app’s notification settings, tap **Send test notification**.
5. Set a vault passphrase → **Connect on this phone** → sign into Sainsbury’s in the live view → **Save encrypted session**.
6. Tap **Dry-run weekly push** to see milk resolve without a real basket write.

## If `pnpm mobile` fails

Run three terminals manually:

```bash
# Terminal 1
pnpm dev:api

# Terminal 2
pnpm dev:web

# Terminal 3
pnpm tunnel
```

`pnpm tunnel` uses `npx cloudflared` — you do not need to install Cloudflare permanently.

## Why HTTPS?

Passkeys on Android only work on **secure** sites (`https://` or `localhost`).  
Opening `http://192.168.x.x:3000` on the Pixel will usually block passkey registration.

## What you need to do vs what the agent does

- **You:** run `pnpm mobile` on a computer you trust, open the printed URL on the Pixel, register a passkey, connect Sainsbury’s if you want a real session.
- **Do not** complete a real Sainsbury’s login against a stranger’s cloud machine — use your own laptop/home PC so the encrypted vault stays with you.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Passkey button errors / “secure context” | Use the `https://*.trycloudflare.com` URL, not a LAN IP |
| Live Sainsbury’s view blank | On the computer: `pnpm playwright:install` |
| Tunnel URL dies | Keep the `pnpm mobile` terminal open; run it again for a new URL |
| Partner can’t get in | While signed in, tap **Partner invite**, send them the code + tunnel URL |
