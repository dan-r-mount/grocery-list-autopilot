#!/usr/bin/env bash
set -euo pipefail
echo "Install deps, then try the milk dry-run:"
echo "  pnpm install"
echo "  pnpm --filter @gla/shared build"
echo "  pnpm milk:resolve"
echo "  pnpm milk:push"
echo "  pnpm dev:api   # terminal 1"
echo "  pnpm dev:web   # terminal 2 → http://localhost:3000"
