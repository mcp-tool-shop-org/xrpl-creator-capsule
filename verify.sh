#!/usr/bin/env bash
set -euo pipefail

echo "=== TypeScript check ==="
npx tsc --noEmit

echo "=== Tests ==="
npx vitest run

echo "=== Verify complete ==="
