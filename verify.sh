#!/usr/bin/env bash
set -euo pipefail

echo "=== TypeScript check ==="
# Build mode, and both project graphs, deliberately.
#
# The root tsconfig.json is solution-style ("files": [] plus "references"), and
# a bare `tsc --noEmit` against it resolves ZERO files and exits 0 no matter how
# broken the code is. Only build mode traverses project references. app/ is a
# second, separate graph that the root does not reference, so it is named here
# explicitly or it is never checked at all.
#
# To confirm this gate can still fail, introduce a type error and re-run: it
# must exit non-zero. A type-check step that cannot go red is worse than none,
# because it reports a safety property it never verified.
npx tsc -b tsconfig.json app/tsconfig.json

echo "=== Tests (engine) ==="
npx vitest run

echo "=== Tests (desktop app) ==="
# The root vitest config excludes app/**, so these do not run above. The desktop
# app is what ships in the installer; leaving it out of this script meant a
# regression there could reach a release with every local and CI check green.
(cd app && npx vitest run)

echo "=== Verify complete ==="
