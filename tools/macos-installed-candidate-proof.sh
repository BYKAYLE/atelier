#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANDIDATE_APP="${MACOS_CANDIDATE_APP:-$ROOT_DIR/src-tauri/target/release/bundle/macos/Atelier.app}"
INSTALLED_APP="${MACOS_INSTALLED_APP:-/Applications/Atelier.app}"
OUTPUT="${MACOS_INSTALLED_PROOF_OUTPUT:-$ROOT_DIR/artifacts/macos-installed-candidate-proof.json}"
EXPECTED_VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "installed macOS candidate proof requires macOS" >&2
  exit 1
fi

for app in "$CANDIDATE_APP" "$INSTALLED_APP"; do
  if [[ ! -d "$app" ]]; then
    echo "Atelier app is missing: $app" >&2
    exit 1
  fi
  if [[ ! -f "$app/Contents/Info.plist" ]]; then
    echo "Atelier Info.plist is missing: $app/Contents/Info.plist" >&2
    exit 1
  fi
done

plist_value() {
  local app="$1"
  local key="$2"
  /usr/libexec/PlistBuddy -c "Print :$key" "$app/Contents/Info.plist"
}

app_executable() {
  local app="$1"
  local executable
  executable="$(plist_value "$app" "CFBundleExecutable")"
  printf '%s/Contents/MacOS/%s\n' "$app" "$executable"
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

CANDIDATE_VERSION="$(plist_value "$CANDIDATE_APP" "CFBundleShortVersionString")"
INSTALLED_VERSION="$(plist_value "$INSTALLED_APP" "CFBundleShortVersionString")"
CANDIDATE_BUNDLE_ID="$(plist_value "$CANDIDATE_APP" "CFBundleIdentifier")"
INSTALLED_BUNDLE_ID="$(plist_value "$INSTALLED_APP" "CFBundleIdentifier")"
CANDIDATE_EXE="$(app_executable "$CANDIDATE_APP")"
INSTALLED_EXE="$(app_executable "$INSTALLED_APP")"

if [[ "$CANDIDATE_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "candidate version mismatch: expected $EXPECTED_VERSION, found $CANDIDATE_VERSION" >&2
  exit 1
fi
if [[ "$INSTALLED_VERSION" != "$CANDIDATE_VERSION" ]]; then
  echo "installed version mismatch: candidate $CANDIDATE_VERSION, installed $INSTALLED_VERSION" >&2
  exit 1
fi
if [[ "$INSTALLED_BUNDLE_ID" != "$CANDIDATE_BUNDLE_ID" ]]; then
  echo "installed bundle identifier mismatch: candidate $CANDIDATE_BUNDLE_ID, installed $INSTALLED_BUNDLE_ID" >&2
  exit 1
fi
if [[ ! -x "$CANDIDATE_EXE" || ! -x "$INSTALLED_EXE" ]]; then
  echo "candidate or installed Atelier executable is missing" >&2
  exit 1
fi

codesign --verify --deep --strict "$CANDIDATE_APP"
codesign --verify --deep --strict "$INSTALLED_APP"

CANDIDATE_EXE_SHA="$(sha256_file "$CANDIDATE_EXE")"
INSTALLED_EXE_SHA="$(sha256_file "$INSTALLED_EXE")"
if [[ "$INSTALLED_EXE_SHA" != "$CANDIDATE_EXE_SHA" ]]; then
  echo "installed executable differs from the candidate" >&2
  echo "candidate: $CANDIDATE_EXE_SHA" >&2
  echo "installed: $INSTALLED_EXE_SHA" >&2
  exit 1
fi

RUNNING_PIDS=()
while read -r pid command; do
  if [[ "$command" == "$INSTALLED_EXE" ]]; then
    RUNNING_PIDS+=("$pid")
  fi
done < <(ps -axo pid=,comm=)

if [[ ${#RUNNING_PIDS[@]} -gt 1 ]]; then
  echo "multiple installed Atelier processes are running: ${RUNNING_PIDS[*]}" >&2
  exit 1
fi

OWNED_PID=""
LOG_FILE=""
if [[ ${#RUNNING_PIDS[@]} -eq 1 ]]; then
  APP_PID="${RUNNING_PIDS[0]}"
else
  LOG_FILE="$(mktemp "${TMPDIR:-/tmp}/atelier-installed-proof.XXXXXX.log")"
  "$INSTALLED_EXE" >"$LOG_FILE" 2>&1 &
  APP_PID=$!
  OWNED_PID="$APP_PID"
fi

cleanup() {
  if [[ -n "$OWNED_PID" ]] && kill -0 "$OWNED_PID" 2>/dev/null; then
    kill -TERM "$OWNED_PID" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "$OWNED_PID" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL "$OWNED_PID" 2>/dev/null || true
  fi
  [[ -z "$LOG_FILE" ]] || rm -f "$LOG_FILE"
}
trap cleanup EXIT

PROBE_OUTPUT=""
for _ in {1..120}; do
  if PROBE_OUTPUT="$("$INSTALLED_EXE" --atelier-renderer-ready-probe 2>/dev/null)"; then
    break
  fi
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "installed Atelier exited before the renderer became ready" >&2
    [[ -z "$LOG_FILE" ]] || cat "$LOG_FILE" >&2
    exit 1
  fi
  sleep 0.25
done

if [[ -z "$PROBE_OUTPUT" ]]; then
  echo "installed Atelier renderer did not become ready within 30 seconds" >&2
  [[ -z "$LOG_FILE" ]] || cat "$LOG_FILE" >&2
  exit 1
fi

SOURCE_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
mkdir -p "$(dirname "$OUTPUT")"

export OUTPUT SOURCE_SHA EXPECTED_VERSION CANDIDATE_VERSION INSTALLED_VERSION
export CANDIDATE_BUNDLE_ID INSTALLED_BUNDLE_ID CANDIDATE_APP INSTALLED_APP
export CANDIDATE_EXE INSTALLED_EXE CANDIDATE_EXE_SHA INSTALLED_EXE_SHA
export PROBE_OUTPUT APP_PID
node --input-type=module <<'NODE'
import {
  mkdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

const receipt = JSON.parse(process.env.PROBE_OUTPUT);
const expectedPid = Number(process.env.APP_PID);
const installedExecutable = realpathSync(process.env.INSTALLED_EXE);
const receiptExecutable = realpathSync(receipt.executablePath);

if (
  receipt.schemaVersion !== 1 ||
  receipt.status !== "ready" ||
  receipt.windowLabel !== "main" ||
  receipt.pid !== expectedPid ||
  receipt.appVersion !== process.env.EXPECTED_VERSION ||
  receiptExecutable !== installedExecutable
) {
  throw new Error(`invalid installed renderer receipt: ${JSON.stringify(receipt)}`);
}

process.kill(expectedPid, 0);

const evidence = {
  schemaVersion: 1,
  status: "verified",
  proofType: "local-installed-candidate",
  sourceSha: process.env.SOURCE_SHA,
  version: process.env.EXPECTED_VERSION,
  bundleIdentifier: process.env.CANDIDATE_BUNDLE_ID,
  generatedAt: new Date().toISOString(),
  candidate: {
    appPath: realpathSync(process.env.CANDIDATE_APP),
    executablePath: realpathSync(process.env.CANDIDATE_EXE),
    version: process.env.CANDIDATE_VERSION,
    executableSha256: process.env.CANDIDATE_EXE_SHA,
    codesignVerified: true,
  },
  installed: {
    appPath: realpathSync(process.env.INSTALLED_APP),
    executablePath: installedExecutable,
    version: process.env.INSTALLED_VERSION,
    executableSha256: process.env.INSTALLED_EXE_SHA,
    codesignVerified: true,
    rendererReady: receipt,
  },
  consistency: {
    versionsMatch: true,
    bundleIdentifiersMatch: true,
    executableHashesMatch: true,
  },
  limitations: {
    developerIdNotarizationClaimed: false,
    publicDistributionClaimed: false,
  },
};

mkdirSync(dirname(process.env.OUTPUT), { recursive: true });
writeFileSync(process.env.OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence, null, 2));
NODE

echo "installed macOS candidate proof written: $OUTPUT"
