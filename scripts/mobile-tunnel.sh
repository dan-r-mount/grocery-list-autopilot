#!/usr/bin/env bash
# HTTPS tunnel only (API + web must already be running).
set -euo pipefail

echo "Tunneling http://127.0.0.1:3000 …"
echo "Open the https://*.trycloudflare.com URL on your Pixel Chrome."
echo

if command -v cloudflared >/dev/null 2>&1; then
  exec cloudflared tunnel --url http://127.0.0.1:3000
fi
exec npx --yes cloudflared tunnel --url http://127.0.0.1:3000
