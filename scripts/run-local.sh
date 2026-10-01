#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v node >/dev/null 2>&1; then
  PIF_NODE="$(command -v node)"
else
  PIF_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$PIF_NODE" ]]; then
  echo 'Install Node.js 24+ to run Play It Forward.' >&2
  exit 1
fi
if [[ ! -d node_modules || ! -f dist/index.html ]]; then
  echo 'Install dependencies and run pnpm build first. See README.md.' >&2
  exit 1
fi
exec "$PIF_NODE" --import tsx server/index.ts
