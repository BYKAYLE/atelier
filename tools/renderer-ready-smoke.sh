#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="${1:-$ROOT_DIR/src-tauri/target/release/bundle/macos/Atelier.app}"
EXE="$APP/Contents/MacOS/atelier"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "renderer-ready smoke currently requires macOS" >&2
  exit 1
fi
if [[ ! -x "$EXE" ]]; then
  echo "Atelier executable is missing: $EXE" >&2
  exit 1
fi

LOG_FILE="$(mktemp "${TMPDIR:-/tmp}/atelier-renderer-ready.XXXXXX.log")"
"$EXE" >"$LOG_FILE" 2>&1 &
APP_PID=$!

cleanup() {
  if kill -0 "$APP_PID" 2>/dev/null; then
    kill -TERM "$APP_PID" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "$APP_PID" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL "$APP_PID" 2>/dev/null || true
  fi
  rm -f "$LOG_FILE"
}
trap cleanup EXIT

probe_output=""
for _ in {1..120}; do
  if probe_output="$("$EXE" --atelier-renderer-ready-probe 2>/dev/null)"; then
    break
  fi
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "Atelier exited before the renderer became ready" >&2
    cat "$LOG_FILE" >&2
    exit 1
  fi
  sleep 0.25
done

if [[ -z "$probe_output" ]]; then
  echo "Atelier renderer did not become ready within 30 seconds" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

PROBE_OUTPUT="$probe_output" EXPECTED_PID="$APP_PID" EXPECTED_EXE="$EXE" python3 - <<'PY'
import json
import os
from pathlib import Path

receipt = json.loads(os.environ["PROBE_OUTPUT"])
expected_pid = int(os.environ["EXPECTED_PID"])
expected_exe = Path(os.environ["EXPECTED_EXE"]).resolve()
actual_exe = Path(receipt["executablePath"]).resolve()
assert receipt["schemaVersion"] == 1, receipt
assert receipt["windowLabel"] == "main", receipt
assert receipt["status"] == "ready", receipt
assert receipt["pid"] == expected_pid, receipt
assert actual_exe == expected_exe, receipt
print(json.dumps(receipt, ensure_ascii=False, separators=(",", ":")))
PY
