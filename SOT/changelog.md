# Changelog

## 2026-07-26 — 0.2.15 provider-default parity and installed proof

- Added Hermes/Gajae “새 작업 기본 모델 공급자” persistence for new sessions
  while keeping existing sessions unchanged unless explicitly edited.
- Added the Gajae Connections provider block for `Claude`, `Codex`, and
  `Alibaba Cloud`, and wired the saved default into new-session bootstrap.
- Bridged Gajae Codex through the isolated child env with access-token-only
  handling, then aligned the Connections readiness badge so Codex shows ready
  only when the upstream ChatGPT subscription login exists.
- Passed provider preference/routing/settings/usage smokes, the production
  frontend build, and 239 Rust tests with 4 ignored.
- Built, signed, installed, and proved the local `0.2.15` candidate. Candidate
  and installed executable SHA-256 match at
  `d1c433a730536868433140949cf468420dea6ae48cf129edfa5099bd0f72b1a9`, and
  renderer-ready proof was written to
  `artifacts/macos-installed-candidate-proof.json`.
- Click-driven installed-app proof changed Gajae from Claude to Codex,
  restarted Atelier, confirmed the selection persisted, and opened a new Gajae
  task showing `Codex` / `5.5`. The original Claude default was restored after
  verification.

## 2026-07-26 — 0.2.14 Atelier-only managed runtime installation

- Fixed the real Hermes first-use failure where the uv-built wheel omitted
  bundled skills. Atelier now materializes 453 pinned source files from the
  exact Git commit and verifies 73 installed skills.
- Kept Gajaecode independent under its Atelier-owned GJC HOME/config/session
  and skill namespace; prepared four integrity-checked defaults without reading
  Mac-global Codex/Claude/Hermes skills.
- Hardened Basic/Auto macOS sandbox profiles, provider-local Python/runtime
  paths, checksummed uv/Bun downloads, receipts, quarantine recovery, and
  first-send automatic preparation.
- Passed 230 Rust tests with 3 ignored, strict Clippy, production frontend
  build, format/diff hygiene, provider identity/permission/routing smokes,
  npm/RustSec audits, and the 23-contract/10-feature Orca gate.
- Built and installed the locally signed 0.2.14 candidate. Candidate and
  installed executable SHA-256 match at
  `4ee04fbed757f015c910171f4e7c0c3979ca009d396f90a6abfb890e2e1b1868`;
  renderer readiness and installed UI preparation for both providers pass.
- Boundary: no paid provider response, credential bundling, public publish,
  Developer ID notarization, or physical Windows claim was made.

## 2026-07-25 — Reproducible managed Hermes/Gajaecode runtime (F-Phase 2, 0.2.14 source candidate)

- Reintroduced managed execution for Hermes and Gajae through Atelier-owned
  macOS runtime provisioning instead of capability-flag-only disabled states.
- Added managed runtime auto-bootstrap and repair flow with source-verified progress:
  `checking`, `installing`, `bootstrapping_skills`, `verifying`, `ready`,
  `failed`.
- Added pinned runtime policy constants and receipts so Hermes and Gajae bootstrap
  from fixed install specs and fixed skill bundles.
- Routed Hermes/Gajae managed turns to readiness-gated command execution with
  sandboxed workspace isolation and explicit runtime identity metadata.
- Updated frontend/runtime capability UX to reflect managed runtime availability,
  bootstrap state, and explicit disable/reason behavior when unavailable.
- Added API/API-like exposure for `providerPrepareManagedRuntime` and
  `ManagedAgentRuntimeReadiness` to keep command, event, and UI layers aligned.
- Added and updated smokes to validate capability metadata, managed progress
  transitions, and runtime identity fields.
- Historical phase boundary: this section records the source-only F-Phase 2
  state; the 2026-07-26 entry records the later installed-app proof.

## 2026-07-25 — 0.2.13 Supervised Local Candidate

- Closed mixed-negation and direct-CLI guard gaps and applied a shared
  Korean/English prompt corpus across frontend and Rust regression behavior.
- Removed visible and raw Full bypass paths. Basic is the default; Auto retains
  sandboxing and approval checks.
- Made managed preview start truthfully fail-closed while retaining inspection
  of a separately trusted localhost service.
- Resolved the PostCSS advisory and passed 209 all-feature Rust tests with 1
  ignored, 23 Orca contract smokes across 10 removable features, strict
  all-target/all-feature Clippy, format/diff checks, `npm audit` with 0
  vulnerabilities, and RustSec with 0 known vulnerabilities plus 18
  unmaintained and 2 unsound warnings.
- The receipt includes provider-capability hardening: Claude/Codex managed
  Basic/Auto only; Hermes/Gajaecode managed capability false with UI reason and
  lifecycle/spawn-before fail-closed; direct CLI separate and limited.
- Built `Atelier_0.2.13_aarch64.dmg`, installed the locally signed candidate at
  `/Applications/Atelier.app`, matched candidate/installed executable SHA-256 at
  `3cce1530628decc24ac0d1955082f93ebf9bcebf327926fdc5f085850c3c9acf`,
  and passed codesign plus renderer-ready checks.
- Preserved the prior `0.2.12` app at
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.12-before-0.2.13.app`;
  it was moved, not deleted, and no longer depends on temporary-directory
  retention.
- Recorded the remaining P1 boundary: an app-owned action/tool proxy with scoped
  approval receipts. Phrase matching alone is not a complete guarantee.
- Verdict: `supervised local candidate, public release blocked`. No public
  publish, public signing, notarization, or deployment was performed.

## 2026-07-22 — 0.2.12 Release Candidate

- Pinned all managed CLI installers and removed remote shell execution.
- Added bounded installer output capture, timeout cleanup, credential
  redaction, background execution, and post-install CLI verification.
- Fixed preview evidence route fidelity, Hermes workload runtime reflection,
  keyboard navigation for composer menus, and compact-window send controls.
- Passed the complete Orca feature gate, 188 Rust tests, strict Clippy,
  production build, updater contract, npm audit, and release security audit.
- Built and installed the exact locally signed macOS package. Public release is
  held until Developer ID notarization and signed physical-Windows evidence are
  available.

## 2026-07-21 — Offline Parallel Agent Verification

- Added a test-only Gajae launch seam and cross-platform self-hosted fixture.
- Added real three-turn adapter, event isolation, selective cancellation,
  exactly-once lifecycle, workspace prompt, process-tree, and cleanup proof.
- Added `npm run harness:parallel-agent` and enforced it in the shared Orca
  feature release gate and release-security audit.
- Isolated worktree adoption receipts inside test temporary storage and added
  regression assertions that prevent user app-data paths from being reused.
- Did not package, install, deploy, connect a provider, or modify the temporary
  GPU server.
