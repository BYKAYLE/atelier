#!/usr/bin/env bash
set -euo pipefail

# Canonical installed-app replacement path for the local macOS candidate.
#
# Structural guard (SOT/issues.md 2026-08-24 recommendation): an installed
# candidate must never again outrun the repository. Replacing
# /Applications/Atelier.app is REFUSED when the working tree is dirty
# (tracked or untracked changes) or when HEAD carries no version tag (v*).
# The single explicit override is ATELIER_INSTALL_GATE_OVERRIDE_REASON: when
# set, the install proceeds and the reason is recorded in the
# installed-candidate proof JSON by tools/macos-installed-candidate-proof.sh.
#
# Flow: gate -> candidate validation -> backup -> quit -> replace (ditto)
#       -> relaunch -> installed-candidate proof.
# `--check-only` evaluates the gate and exits without touching anything.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANDIDATE_APP="${MACOS_CANDIDATE_APP:-$ROOT_DIR/src-tauri/target/release/bundle/macos/Atelier.app}"
INSTALLED_APP="${MACOS_INSTALLED_APP:-/Applications/Atelier.app}"
BACKUP_DIR="${ATELIER_INSTALL_BACKUP_DIR:-$HOME/Library/Application Support/Atelier/Backups.noindex}"
BACKUP_LABEL="${ATELIER_INSTALL_BACKUP_LABEL:-}"
OVERRIDE_REASON="${ATELIER_INSTALL_GATE_OVERRIDE_REASON:-}"

CHECK_ONLY=0
for argument in "$@"; do
  case "$argument" in
    --check-only) CHECK_ONLY=1 ;;
    *)
      echo "unknown argument: $argument (supported: --check-only)" >&2
      exit 2
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS candidate install requires macOS" >&2
  exit 1
fi

# --- Install gate -----------------------------------------------------------
DIRTY_LIST="$(git -C "$ROOT_DIR" status --porcelain --untracked-files=all)"
VERSION_TAG="$(git -C "$ROOT_DIR" tag --points-at HEAD | grep -E '^v[0-9]' | head -n 1 || true)"
HEAD_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"

GATE_FAILED=0
if [[ -n "$DIRTY_LIST" ]]; then
  GATE_FAILED=1
  echo "install gate: the working tree is dirty at HEAD $HEAD_SHA:" >&2
  printf '%s\n' "$DIRTY_LIST" | head -n 20 >&2
fi
if [[ -z "$VERSION_TAG" ]]; then
  GATE_FAILED=1
  echo "install gate: HEAD $HEAD_SHA carries no version tag (v*)" >&2
fi

if [[ "$GATE_FAILED" == "1" ]]; then
  if [[ -n "$OVERRIDE_REASON" ]]; then
    echo "install gate OVERRIDDEN — reason: $OVERRIDE_REASON" >&2
    echo "the override reason is recorded in the installed-candidate proof" >&2
  else
    echo "install refused: commit (and tag) the source state first, or set" >&2
    echo "ATELIER_INSTALL_GATE_OVERRIDE_REASON to proceed with a recorded reason" >&2
    exit 1
  fi
else
  echo "install gate passed: clean working tree, HEAD $HEAD_SHA tagged $VERSION_TAG"
fi

if [[ "$CHECK_ONLY" == "1" ]]; then
  echo "check-only: no install performed"
  exit 0
fi

# --- Candidate validation (before touching the installed app) ---------------
EXPECTED_VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"

plist_value() {
  /usr/libexec/PlistBuddy -c "Print :$2" "$1/Contents/Info.plist"
}

if [[ ! -d "$CANDIDATE_APP" || ! -f "$CANDIDATE_APP/Contents/Info.plist" ]]; then
  echo "candidate app is missing: $CANDIDATE_APP" >&2
  exit 1
fi
CANDIDATE_VERSION="$(plist_value "$CANDIDATE_APP" CFBundleShortVersionString)"
if [[ "$CANDIDATE_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "candidate version mismatch: expected $EXPECTED_VERSION, found $CANDIDATE_VERSION" >&2
  exit 1
fi
codesign --verify --deep --strict "$CANDIDATE_APP"

# --- Backup of the currently installed app ----------------------------------
if [[ -d "$INSTALLED_APP" ]]; then
  INSTALLED_VERSION="$(plist_value "$INSTALLED_APP" CFBundleShortVersionString)"
  TIMESTAMP="$(date +%Y%m%d%H%M%S)"
  BACKUP_PATH="$BACKUP_DIR/Atelier-${INSTALLED_VERSION}-before-${CANDIDATE_VERSION}${BACKUP_LABEL:+-$BACKUP_LABEL}-${TIMESTAMP}.app"
  mkdir -p "$BACKUP_DIR"
  ditto "$INSTALLED_APP" "$BACKUP_PATH"
  echo "installed app backed up: $BACKUP_PATH"

  INSTALLED_EXECUTABLE="$INSTALLED_APP/Contents/MacOS/$(plist_value "$INSTALLED_APP" CFBundleExecutable)"
  osascript -e 'tell application "Atelier" to quit' >/dev/null 2>&1 || true
  for _ in {1..60}; do
    if ! ps -axo comm= | grep -Fxq "$INSTALLED_EXECUTABLE"; then
      break
    fi
    sleep 0.5
  done
  if ps -axo comm= | grep -Fxq "$INSTALLED_EXECUTABLE"; then
    echo "installed Atelier did not quit within 30 seconds; aborting before replacement" >&2
    exit 1
  fi
fi

# --- Replace ----------------------------------------------------------------
rm -rf "$INSTALLED_APP"
ditto "$CANDIDATE_APP" "$INSTALLED_APP"
echo "installed app replaced from candidate: $INSTALLED_APP"

# --- Relaunch and prove -----------------------------------------------------
open -a "$INSTALLED_APP"
NEW_EXECUTABLE="$INSTALLED_APP/Contents/MacOS/$(plist_value "$INSTALLED_APP" CFBundleExecutable)"
for _ in {1..60}; do
  if ps -axo comm= | grep -Fxq "$NEW_EXECUTABLE"; then
    break
  fi
  sleep 0.5
done

bash "$ROOT_DIR/tools/macos-installed-candidate-proof.sh"
