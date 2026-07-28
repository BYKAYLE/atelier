# Phase Handoff — F-Phase 2 to F-Phase 3

Date: 2026-07-26 KST
Feature: reproducible managed Hermes and Gajaecode runtime
Phase: F-Phase 3 installed bootstrap slice complete / authenticated turn deferred

## Decisions

- Keep managed Hermes and Gajae execution enabled through Atelier-managed macOS
  bootstrap and sandbox, with no unmanaged global-skill dependency.
- Keep non-macOS managed execution disabled with explicit user-facing
  reason.
- Move click-driven installed-app clean-machine managed-start validation and
  physical Windows integration to phase 3.
- Preserve the existing direct-CLI path as separate and limited.
- Keep Gajaecode's runtime, config, session, model config, and default skill
  namespace under Atelier-owned GJC paths. Never import personal Mac skills.
- Repair Hermes from an exact pinned Git archive because the uv-built wheel
  omits the repository-root `skills/` directory.

## Rejected

- Re-enabling managed capability via static provider flags only.
  → This repeats the pre-F-Phase-2 failure mode of disabling signal mismatch.
- Treating pinned/runtime progress proof as a substitute for installed-app managed
  validation.
  → Source-only readiness is meaningful but not a full end-user execution proof.

## Risks

- First install/repair requires network access and can fail independently from
  session/credential flows. A verified durable Hermes bundle permits later
  skill repair without trusting a mutable worktree.
- macOS `sandbox-exec` remains legacy; runtime containment behavior should be
  re-validated when platform policy changes.
- Provider CLI contract drift can invalidate pin assumptions between releases.

## F-Phase 2 Completion (Source-Verified)

- [x] Base source branch for this handoff is `0.2.14`.
- [x] Implement managed Hermes/Gajae runtime paths with readiness gating.
- [x] Add automatic bootstrap and repair behavior with verifiable progress states.
- [x] Pin runtime/spec metadata and receipt metadata.
- [x] Align managed-capability identity and progress telemetry between Rust,
  Tauri binding, UI, and smoke checks.
- [x] Keep Basic default and non-macOS managed disable reasons explicit.

## F-Phase 3 Entry Conditions

- [x] Run and log installed-app React/IPC runtime preparation for Hermes and
  Gajaecode.
- [x] Reproduce the Hermes missing-wheel-skills failure and confirm installed-app
  pinned repair.
- [x] Verify isolated CLI versions, readiness receipts, and default skill counts.
- [ ] Confirm one authenticated full managed response for Hermes and Gajaecode
  on a separate clean company Mac without bundling user credentials.
- [ ] Add non-macOS user-guidance and refusal tests for managed managed-start
  flows.
- [ ] Carry forward unresolved P1 action/tool proxy work unchanged.

## Handoff Verdict

- Source, local build, installed-app runtime preparation, and runtime receipts
  are verified separately.
- Atelier-only installation now supplies the pinned runtimes and default skills;
  provider login/API entitlement remains per user.
- `supervised local candidate, public release blocked` remains true until
  authenticated-turn and public release gates are complete.
