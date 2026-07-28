# Checkpoint — Hermes and Gajaecode Managed Usability

Updated: 2026-07-26 KST
Branch: `codex/release-readiness-final`
Builder: feature builder
Phase: F-Phase 3 installed bootstrap slice + provider model defaults parity
Step: final 0.2.15 package installed; Hermes/Gajaecode runtime, default-skill
readiness, and settings-driven model defaults are source/build/installed
verified. Authenticated provider-turn proof remains pending.

## Completed

- [x] Loaded the Atelier SOT and confirmed project ownership.
- [x] Matched the user-visible failure to the provider-capability blanket block.
- [x] User explicitly approved fixing both Hermes and Gajaecode.
- [x] Verify the live Hermes CLI permission/sandbox/approval contract.
- [x] Verify the live Gajaecode CLI permission/sandbox/approval contract.
- [x] Verify isolated runtime/default-skill bootstrap paths for a clean Mac.
- [x] Scope a safe managed execution path, identity-correct UI, and automatic
  readiness repair.
- [x] Implement macOS workspace sandbox and adapter-owned execution routing.
- [x] Implement exact-pin runtime/default-skill auto-bootstrap.
- [x] Implement identity-correct, non-blocking readiness UX.
- [x] Independently QC, build, install, and visually verify the 0.2.13 source and
  installed app boundaries that already exist in this branch.
- [x] Diagnose the real Hermes wheel omission, replace mutable-checkout copying
  with an exact-commit durable archive, and verify 73 installed skills.
- [x] Build and install 0.2.14, match candidate/installed executable hashes, and
  exercise `설치·복구` for Hermes and Gajaecode in the installed UI.
- [x] Build and install the final 0.2.15 candidate, match candidate/installed
  executable hashes, and pass renderer-ready proof.
- [x] Add source-side wiring for Hermes model default + Gajae provider picker and
  child-env auth bridge contract.
- [x] Verify via source/build/installed proof that saved model defaults are applied
  only to newly created sessions, while existing sessions remain unchanged unless
  explicitly edited.
- [x] In the installed app, change Gajae from Claude to Codex, restart the app,
  confirm Codex remains selected, and create a new Gajae task showing
  `Codex` / `5.5`; restore the prior Claude default afterward.
- [ ] Verify via installed app auth path for Gajae Codex when token bridge is missing
  vs present by observing a real provider response/failure.

## Current Problem

- Installed runtime preparation and repair are verified. A paid/authenticated
  provider response was intentionally not executed in this checkpoint.
- Model-provider default UI and Codex auth bridge behavior are now reflected in
  source/build/installed 0.2.15. A paid/authenticated provider turn remains a
  separate proof boundary.
- A second physical clean company Mac and a full authenticated managed turn
  remain the distribution-level confirmation.
- Non-macOS support remains intentionally disabled with explicit reason strings.

## Acceptance Criteria

- [x] Hermes and Gajaecode can accept and run managed tasks through their real
  supported CLI contracts (source verified).
- [x] A clean company Mac needs only the Atelier installer; pinned provider
  runtimes and default skills are prepared in Atelier-owned locations.
- [x] Gajaecode keeps its own skill namespace and never imports personal
  Codex/Claude/Atelier global skills (source verified).
- [x] Personal global CLI or skill state cannot silently change the resulting
  work level (source verified).
- [x] Authentication/API entitlement remains explicit user-specific state and
  is never bundled.
- [x] Basic remains the default and no Full/bypass path returns.
- [x] The UI distinguishes the Atelier agent adapter from an adapter's internal
  model provider.
- [x] Unsupported permission claims fail clearly without disabling every task.
- [x] Stop/cancel, lifecycle, worktree, safety preflight, and direct CLI
  boundaries remain intact.
- [x] Installed-app interaction proof confirms runtime/default-skill preparation
  and repair are usable without separate skill installation.
- [x] Installed-app proof boundary is closed for version/hash/codesign/renderer-ready,
  and click-driven app-reopen/new-session proof confirms persisted Gajae model
  defaults are used in new sessions while existing sessions remain immutable by
  default.
- [ ] Installed-app interaction proof confirms Gajae Codex uses GJC child-env via
  provider token and fails clearly when missing/expired.
- [ ] A separate clean company Mac confirms a full authenticated managed
  response for both providers.

## Starting Baseline

- Source and installed local candidate: `0.2.15`.
- Rust all-features: 239 passed, 0 failed, 4 ignored.
- Orca: 23 contract smokes across 10 removable features.
- Strict all-target/all-feature Clippy: passed.
- `npm audit`: 0 vulnerabilities.
- RustSec: 0 known vulnerabilities; 18 unmaintained and 2 unsound upstream
  warnings remain visible.
- Format and diff checks: passed.
- Preview: managed start fail-closed; trusted external localhost inspection
  retained.
- Permission: Basic default; Auto sandbox plus approvals; visible/raw Full
  removed.
- Provider scope: Claude/Codex support managed Basic/Auto. Hermes and Gajaecode now
  use Atelier-managed bootstrap/sandbox on macOS and remain disabled with reason on
  non-macOS.
- Guard: shared frontend/Rust prompt corpus; phrase denylist is not a complete
  action guarantee.
- Verdict: `supervised local candidate, public release blocked`.
- Installed: `/Applications/Atelier.app` `0.2.15`; candidate/installed
  executable SHA-256
  `d1c433a730536868433140949cf468420dea6ae48cf129edfa5099bd0f72b1a9`;
  codesign and renderer-ready pass.
- Runtime receipts: Gajaecode 4 verified defaults at `0.11.7`/Bun `1.3.14`;
  Hermes 73 verified skills at pinned commit `3ef6bbd…`.

## Safety Boundaries

- Preserve user-owned untracked paths `:-`, `artifacts/`, and `tmp/`.
- Do not delete DB/data, publish, deploy, push, or modify credentials.
- Keep source/build, installed-app, and public-release evidence separate.
