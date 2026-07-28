# Phase Handoff — F-Phase 1 to F-Phase 2

Date: 2026-07-25 KST
Feature: reproducible Hermes and Gajaecode managed runtime

## Decisions

- Preserve internal isolation while removing user installation work.
  → Atelier will auto-provision pinned runtimes and default skills under its
  Application Support root; personal global provider state is not a valid
  managed-runtime dependency.
- Keep adapter identity separate from model-provider identity.
  → A Gajaecode task using a Codex-backed model is still executed, owned, and
  skilled by Gajaecode.
- Restore Basic/Auto only with an Atelier-owned OS boundary.
  → CLI prompts, toolsets, and provider approval modes are not accepted as a
  workspace sandbox.
- Treat this cycle as online first-run.
  → No separate manual installation is allowed, but offline availability is not
  claimed until provider payloads are bundled as signed app resources.

## Rejected

- Simply setting Hermes/Gajaecode capability booleans to true.
  → This would restore host-wide tool access and re-enable the Gajaecode-to-
  native-Codex identity leak.
- Reusing Mac-global Codex/Claude/Atelier skills.
  → This violates the Gajaecode independent-skill contract and makes company
  machines non-reproducible.
- Calling provider approval prompts a security boundary.
  → Both upstream CLIs document or expose paths that require OS isolation.

## Risks

- macOS `sandbox-exec` is deprecated even though it is present on the current
  target.
  → Keep capability platform-scoped, test actual containment, and retain the
  longer-term app-owned tool gateway milestone.
- First-run provisioning requires network access and can fail independently of
  authentication.
  → Report runtime preparation and account readiness separately.
- Provider CLIs can change their embedded skill or tool contracts.
  → Pin exact versions/commits and verify readiness instead of accepting any
  executable on PATH.

## F-Phase 2 Entry Conditions

- [x] User explicitly approved fixing Hermes and Gajaecode.
- [x] Atelier SOT ownership verified.
- [x] Real Hermes CLI contract inspected without provider calls.
- [x] Real Gajaecode CLI contract inspected without provider calls.
- [x] Current adapter, installation, skill, and UI paths mapped.
- [x] Scope and acceptance criteria recorded in `SOT/feature-plan.md`.
