#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BUNDLE_ROOT="${MACOS_BUNDLE_ROOT:-$ROOT_DIR/target/universal-apple-darwin/release/bundle}"
OUTPUT="${MACOS_EVIDENCE_OUTPUT:-$ROOT_DIR/macos-release-evidence.json}"
RELEASE_TAG="${RELEASE_TAG:-${GITHUB_REF_NAME:-}}"
RELEASE_SOURCE_SHA="${RELEASE_SOURCE_SHA:-${GITHUB_SHA:-}}"
EXPECTED_VERSION="$(node -p "require('./package.json').version")"

if [[ "$RELEASE_TAG" != "v$EXPECTED_VERSION" ]]; then
  echo "macOS evidence tag mismatch: expected v$EXPECTED_VERSION, found ${RELEASE_TAG:-missing}" >&2
  exit 1
fi
if [[ ! "$RELEASE_SOURCE_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "RELEASE_SOURCE_SHA must be a full 40-character Git commit SHA" >&2
  exit 1
fi
if [[ ! -d "$BUNDLE_ROOT" ]]; then
  echo "macOS bundle root does not exist: $BUNDLE_ROOT" >&2
  exit 1
fi

find_exactly_one() {
  local label="$1"
  shift
  local matches=()
  while IFS= read -r path; do
    [[ -n "$path" ]] && matches+=("$path")
  done < <(find "$@" | sort)
  if [[ ${#matches[@]} -ne 1 ]]; then
    echo "$label must have exactly one match; found ${#matches[@]}" >&2
    printf '  %s\n' "${matches[@]:-}" >&2
    exit 1
  fi
  printf '%s\n' "${matches[0]}"
}

BUILT_APP="$(find_exactly_one "built Atelier.app" "$BUNDLE_ROOT" -type d -name Atelier.app -prune)"
DMG_PATH="$(find_exactly_one "macOS DMG" "$BUNDLE_ROOT" -type f -name '*.dmg')"
UPDATER_PATH="$(find_exactly_one "macOS updater archive" "$BUNDLE_ROOT" -type f -name '*.app.tar.gz')"

MOUNT_ROOT="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/atelier-release-dmg.XXXXXX")"
UPDATER_ROOT="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/atelier-release-updater.XXXXXX")"
DMG_MOUNTED=0
cleanup() {
  if [[ "$DMG_MOUNTED" == "1" ]]; then
    hdiutil detach "$MOUNT_ROOT" -quiet 2>/dev/null || true
  fi
  rm -rf "$MOUNT_ROOT" "$UPDATER_ROOT"
}
trap cleanup EXIT

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

app_version() {
  /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$1/Contents/Info.plist"
}

app_executable() {
  local executable
  executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$1/Contents/Info.plist")"
  printf '%s/Contents/MacOS/%s\n' "$1" "$executable"
}

signing_details() {
  codesign -dv --verbose=4 "$1" 2>&1
}

verify_developer_id_signature() {
  local label="$1"
  local target="$2"
  local details
  codesign --verify --deep --strict --verbose=2 "$target"
  details="$(signing_details "$target")"
  if ! grep -q '^Authority=Developer ID Application:' <<<"$details"; then
    echo "$label is not signed with a Developer ID Application identity" >&2
    printf '%s\n' "$details" >&2
    exit 1
  fi
}

verify_app() {
  local label="$1"
  local app="$2"
  verify_developer_id_signature "$label" "$app"
  spctl --assess --type execute --verbose=4 "$app"
  xcrun stapler validate "$app"
  local version
  version="$(app_version "$app")"
  if [[ "$version" != "$EXPECTED_VERSION" ]]; then
    echo "$label version mismatch: expected $EXPECTED_VERSION, found $version" >&2
    exit 1
  fi
}

verify_app "built app" "$BUILT_APP"
"$ROOT_DIR/tools/renderer-ready-smoke.sh" "$BUILT_APP"

verify_developer_id_signature "DMG" "$DMG_PATH"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"

hdiutil attach "$DMG_PATH" -nobrowse -readonly -mountpoint "$MOUNT_ROOT" -quiet
DMG_MOUNTED=1
DMG_APP="$(find_exactly_one "DMG Atelier.app" "$MOUNT_ROOT" -maxdepth 2 -type d -name Atelier.app -prune)"
verify_app "DMG embedded app" "$DMG_APP"

tar -xzf "$UPDATER_PATH" -C "$UPDATER_ROOT"
UPDATER_APP="$(find_exactly_one "updater Atelier.app" "$UPDATER_ROOT" -type d -name Atelier.app -prune)"
verify_app "updater embedded app" "$UPDATER_APP"

BUILT_EXE="$(app_executable "$BUILT_APP")"
DMG_EXE="$(app_executable "$DMG_APP")"
UPDATER_EXE="$(app_executable "$UPDATER_APP")"
BUILT_EXE_SHA="$(sha256_file "$BUILT_EXE")"
DMG_EXE_SHA="$(sha256_file "$DMG_EXE")"
UPDATER_EXE_SHA="$(sha256_file "$UPDATER_EXE")"
if [[ "$BUILT_EXE_SHA" != "$DMG_EXE_SHA" || "$BUILT_EXE_SHA" != "$UPDATER_EXE_SHA" ]]; then
  echo "Atelier executable differs between built app, DMG, and updater archive" >&2
  exit 1
fi

BUILT_IDENTITY="$(signing_details "$BUILT_APP" | awk -F= '/^Authority=Developer ID Application:/{print $2; exit}')"
DMG_IDENTITY="$(signing_details "$DMG_PATH" | awk -F= '/^Authority=Developer ID Application:/{print $2; exit}')"
TEAM_IDENTIFIER="$(signing_details "$BUILT_APP" | awk -F= '/^TeamIdentifier=/{print $2; exit}')"
DMG_SHA="$(sha256_file "$DMG_PATH")"
UPDATER_SHA="$(sha256_file "$UPDATER_PATH")"

export OUTPUT RELEASE_TAG RELEASE_SOURCE_SHA EXPECTED_VERSION
export DMG_NAME="$(basename "$DMG_PATH")" DMG_SHA DMG_IDENTITY
export UPDATER_NAME="$(basename "$UPDATER_PATH")" UPDATER_SHA
export BUILT_EXE_SHA DMG_EXE_SHA UPDATER_EXE_SHA BUILT_IDENTITY TEAM_IDENTIFIER
node --input-type=module <<'NODE'
import { writeFileSync } from "node:fs";
import { resolveReleaseRepository } from "./.github/scripts/release-contract.mjs";

const repository = resolveReleaseRepository();
const verifiedApp = (executableSha256) => ({
  version: process.env.EXPECTED_VERSION,
  executableSha256,
  codesignVerified: true,
  developerIdApplication: true,
  gatekeeperAccepted: true,
  notarizationStapled: true,
});
const evidence = {
  schemaVersion: 1,
  status: "verified",
  releaseRepository: repository.slug,
  releaseTag: process.env.RELEASE_TAG,
  version: process.env.EXPECTED_VERSION,
  sourceSha: process.env.RELEASE_SOURCE_SHA.toLowerCase(),
  generatedAt: new Date().toISOString(),
  signing: {
    appIdentity: process.env.BUILT_IDENTITY,
    dmgIdentity: process.env.DMG_IDENTITY,
    teamIdentifier: process.env.TEAM_IDENTIFIER,
  },
  artifacts: {
    builtApp: verifiedApp(process.env.BUILT_EXE_SHA),
    dmg: {
      name: process.env.DMG_NAME,
      sha256: process.env.DMG_SHA,
      codesignVerified: true,
      developerIdApplication: true,
      gatekeeperAccepted: true,
      notarizationStapled: true,
      embeddedApp: verifiedApp(process.env.DMG_EXE_SHA),
    },
    updater: {
      name: process.env.UPDATER_NAME,
      sha256: process.env.UPDATER_SHA,
      embeddedApp: verifiedApp(process.env.UPDATER_EXE_SHA),
    },
  },
  consistency: {
    versionsMatch: true,
    executableHashesMatch: true,
  },
};
writeFileSync(process.env.OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
NODE

echo "macOS release evidence written: $OUTPUT"
