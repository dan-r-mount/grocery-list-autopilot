#!/usr/bin/env bash
set -euo pipefail
echo "Install deps, then try the milk dry-run:"
echo "  pnpm install"
echo "  pnpm --filter @gla/shared build"
echo "  pnpm milk:resolve"
echo "  pnpm milk:push"
echo "  pnpm test:vault"
echo "  pnpm playwright:install   # for live Sainsbury's connect on Pixel"
echo "  pnpm dev:api              # terminal 1"
echo "  pnpm dev:web              # terminal 2 → http://localhost:3000"
echo "  scripts/mobile-tunnel.sh  # HTTPS URL for Pixel passkeys"
echo
echo "Security model: docs/SECURITY.md"
