#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-local}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS bundle builds must run on macOS" >&2
  exit 1
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  if security find-identity -v -p codesigning | grep -Fq '"Atelier Local Code Signing"'; then
    export APPLE_SIGNING_IDENTITY="Atelier Local Code Signing"
  else
    export APPLE_SIGNING_IDENTITY="-"
  fi
fi

cd "$ROOT_DIR"
if [[ "$MODE" == "local" ]]; then
  npx tauri build --config src-tauri/tauri.local.conf.json
elif [[ "$MODE" == "release" ]]; then
  npx tauri build
else
  echo "unknown build mode: $MODE" >&2
  exit 1
fi

npm run tauri:trust
