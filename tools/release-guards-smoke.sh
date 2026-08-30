#!/usr/bin/env bash
set -euo pipefail

# Mutation smoke for the two structural release guards:
#   1) tools/install-macos-candidate.sh install gate (dirty tree / missing
#      version tag / explicit override), exercised in --check-only mode.
#   2) tools/repo-hygiene.mjs foreign-untracked-path gate.
# Every case runs in a throwaway scratch git repository so the real working
# tree and the installed app are never touched, and each refusal is measured
# as a real non-zero exit code (forced-trigger mutation, not a vacuous pass).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "release guards smoke requires macOS (install gate is a macOS path)" >&2
  exit 1
fi

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/atelier-guards-smoke.XXXXXX")"
trap 'rm -rf "$SCRATCH"' EXIT

GIT=(git -c user.email=guards-smoke@atelier.invalid -c "user.name=Atelier Guards Smoke")

run_expect() {
  # run_expect <expected_rc> <needle> <label> -- command...
  local expected_rc="$1" needle="$2" label="$3"
  shift 4
  local output rc
  set +e
  output="$("$@" 2>&1)"
  rc=$?
  set -e
  if [[ "$rc" != "$expected_rc" ]]; then
    echo "FAIL [$label]: expected exit $expected_rc, got $rc" >&2
    echo "$output" >&2
    exit 1
  fi
  if [[ -n "$needle" ]] && ! grep -qF "$needle" <<<"$output"; then
    echo "FAIL [$label]: output does not contain '$needle'" >&2
    echo "$output" >&2
    exit 1
  fi
  echo "ok [$label]"
}

# --- 1) Install gate --------------------------------------------------------
GATE_REPO="$SCRATCH/install-gate-repo"
mkdir -p "$GATE_REPO/tools"
cp "$ROOT_DIR/tools/install-macos-candidate.sh" "$GATE_REPO/tools/"
cd "$GATE_REPO"
git init -q
printf '{"version":"0.0.1"}\n' > package.json
"${GIT[@]}" add package.json tools/install-macos-candidate.sh
"${GIT[@]}" commit -qm "guards smoke fixture"

run_expect 1 "no version tag" "install gate refuses an untagged HEAD" -- \
  bash tools/install-macos-candidate.sh --check-only

"${GIT[@]}" tag v0.0.1
run_expect 0 "install gate passed" "install gate passes a clean tagged HEAD" -- \
  bash tools/install-macos-candidate.sh --check-only

touch zz-foreign-scratch.tmp
run_expect 1 "dirty" "install gate refuses a dirty working tree" -- \
  bash tools/install-macos-candidate.sh --check-only

run_expect 0 "OVERRIDDEN" "install gate honors the explicit recorded override" -- \
  env ATELIER_INSTALL_GATE_OVERRIDE_REASON="guards smoke forced override" \
  bash tools/install-macos-candidate.sh --check-only

rm zz-foreign-scratch.tmp

# --- 2) Repo hygiene gate ---------------------------------------------------
HYGIENE_REPO="$SCRATCH/hygiene-repo"
mkdir -p "$HYGIENE_REPO"
cd "$HYGIENE_REPO"
git init -q
printf '# fixture\n' > README.md
"${GIT[@]}" add README.md
"${GIT[@]}" commit -qm "hygiene smoke fixture"

mkdir -p SOT tools
touch SOT/notes.md tools/new-smoke.mjs
run_expect 0 "0 outside the known layout" "hygiene allows layout-internal untracked paths" -- \
  node "$ROOT_DIR/tools/repo-hygiene.mjs"

mkdir -p scripts
touch scripts/migrate_foreign_crons.py zz_foreign_scratch.py
run_expect 1 "scripts/migrate_foreign_crons.py" "hygiene fails on foreign untracked paths" -- \
  node "$ROOT_DIR/tools/repo-hygiene.mjs"
run_expect 1 "zz_foreign_scratch.py" "hygiene lists every foreign untracked path" -- \
  node "$ROOT_DIR/tools/repo-hygiene.mjs"

NOGIT_DIR="$SCRATCH/no-git"
mkdir -p "$NOGIT_DIR"
cd "$NOGIT_DIR"
run_expect 2 "unavailable" "hygiene fails closed outside a git repository" -- \
  node "$ROOT_DIR/tools/repo-hygiene.mjs"

echo "release guards smoke: ok"
