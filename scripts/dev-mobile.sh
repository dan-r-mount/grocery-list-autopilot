#!/usr/bin/env bash
# Start API + web + HTTPS tunnel for Pixel testing.
# You run this on a computer. On the phone you only open the printed URL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. On the computer:"
  echo "  corepack enable && corepack prepare pnpm@9.15.0 --activate"
  exit 1
fi

pnpm --filter @gla/shared build

export HOST=0.0.0.0
export PORT=3001
export WEB_ORIGIN=http://127.0.0.1:3000

PIDS=()
cleanup() {
  echo
  echo "Stopping local processes…"
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

echo "Starting API on :3001 …"
pnpm dev:api &
PIDS+=($!)

echo "Starting web on :3000 …"
pnpm dev:web &
PIDS+=($!)

echo "Waiting for web to come up…"
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo
echo "============================================================"
echo "  On your Google Pixel: open the HTTPS URL printed below"
echo "  in Chrome. Do NOT run pnpm on the phone."
echo "============================================================"
echo

# Prefer installed cloudflared; otherwise npx.
if command -v cloudflared >/dev/null 2>&1; then
  cloudflared tunnel --url http://127.0.0.1:3000
else
  echo "(Using npx cloudflared — first run may download the binary)"
  npx --yes cloudflared tunnel --url http://127.0.0.1:3000
fi
