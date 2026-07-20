#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT_DIR/src-tauri/target/release/bundle/macos/Atelier.app"
DMG_DIR="$ROOT_DIR/src-tauri/target/release/bundle/dmg"
shopt -s nullglob
DMG_CANDIDATES=("$DMG_DIR"/Atelier_*.dmg)
DMG=""
for candidate in "${DMG_CANDIDATES[@]}"; do
  if [[ -z "$DMG" || "$candidate" -nt "$DMG" ]]; then
    DMG="$candidate"
  fi
done

if [[ ! -d "$APP" || -z "$DMG" || ! -f "$DMG" ]]; then
  echo "macOS app or DMG bundle is missing" >&2
  exit 1
fi

codesign --verify --deep --strict "$APP"
LOCAL_SIGNING_BYPASS=0
if [[ "${ATELIER_ALLOW_LOCAL_SIGNING:-0}" != "1" ]]; then
  spctl --assess --type execute --verbose=4 "$APP"
else
  LOCAL_SIGNING_BYPASS=1
  echo "warning: Gatekeeper assessment skipped for explicitly allowed local signing" >&2
fi
"$ROOT_DIR/tools/renderer-ready-smoke.sh" "$APP"

MOUNT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/atelier-dmg.XXXXXX")"
cleanup() {
  hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true
  rmdir "$MOUNT_DIR" 2>/dev/null || true
}
trap cleanup EXIT

hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT_DIR" -quiet
DMG_APP="$MOUNT_DIR/Atelier.app"
DMG_PLIST="$DMG_APP/Contents/Info.plist"

codesign --verify --deep --strict "$DMG_APP"
if [[ "$LOCAL_SIGNING_BYPASS" != "1" ]]; then
  spctl --assess --type execute --verbose=4 "$DMG_APP"
fi
for key in \
  NSContactsUsageDescription \
  NSPhotoLibraryUsageDescription \
  NSAppleEventsUsageDescription \
  NSMicrophoneUsageDescription \
  NSCameraUsageDescription
do
  if /usr/libexec/PlistBuddy -c "Print :$key" "$DMG_PLIST" >/dev/null 2>&1; then
    echo "unexpected protected-resource declaration in packaged app: $key" >&2
    exit 1
  fi
done

if [[ "$LOCAL_SIGNING_BYPASS" == "1" ]]; then
  echo "verified local signed app, renderer readiness, and DMG payload; Gatekeeper distribution proof was not claimed: $DMG"
else
  echo "verified signed app, Gatekeeper policy, renderer readiness, and DMG payload: $DMG"
fi
