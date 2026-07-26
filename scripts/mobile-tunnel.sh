#!/usr/bin/env bash
# Expose the Vite UI (with /api proxy) over HTTPS for Pixel passkey testing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found."
  echo "Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  echo "Or:      npx --yes cloudflared tunnel --url http://127.0.0.1:3000"
  exit 1
fi

echo "Make sure these are already running:"
echo "  pnpm dev:api"
echo "  pnpm dev:web"
echo
echo "Starting HTTPS quick tunnel to http://127.0.0.1:3000 ..."
echo "Open the printed https://*.trycloudflare.com URL on your Pixel."
exec cloudflared tunnel --url http://127.0.0.1:3000
