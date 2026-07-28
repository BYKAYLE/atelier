# Preview Truth Builder Report

Updated: 2026-07-25 KST

## Judgment

- Managed preview start must remain fail-closed in the frontend until the Rust backend explicitly reports capability truth.
- External localhost inspection remains allowed and should stay visible even when Atelier-managed start is disabled.
- The visible permission surface must no longer advertise or accept raw `full`;
  legacy `full`/`bypass`/`danger` values render as Basic.

## Implementation

### Backend

- `src-tauri/src/agent_preview.rs`
  - Added shared `MANAGED_PREVIEW_DISABLED_REASON` constant.
  - Added serializable `PreviewCapability { managed_start, external_loopback_inspection, managed_start_reason }`.
  - Added `preview_capability` Tauri command and a unit test that proves the capability response and `ensure_managed_preview_execution_enabled()` share the same fail-closed reason.
- `src-tauri/src/lib.rs`
  - Registered `agent_preview::preview_capability`.

### Frontend bridge

- `src/lib/tauri.ts`
  - Added `PreviewCapability` type and `previewCapability()` invoke wrapper.
  - Kept the separately edited `RemoteFollowupApprovalInput.permissionMode` line in its current shared-worktree state.

### UI

- `src/components/AgentWorkspace.tsx`
  - Added fail-closed preview capability state with runtime loading from Tauri.
  - Hid preview managed-start input/button unless backend capability says `managed_start: true`.
  - Preserved `Stop` when a managed preview process is already running.
  - Added explicit Korean/English explanation that Atelier-managed start is disabled for security and that a separately trusted localhost service can still be inspected.
  - Kept localhost preview health/inspection surfaces intact.
  - Reduced visible permission choices to `basic` and `auto`.
  - Normalized legacy `full`/`bypass`/`danger` values to Basic.
  - Changed slash help to `basic|auto` only and rejected `/permission full` with guardrail guidance instead of applying it.

### Focused smoke

- `tools/preview-capability-smoke.ts`
  - Verifies backend capability contract, Tauri wrapper, fail-closed frontend
    default, localized preview-disabled copy, legacy `full -> basic`
    normalization, and `/permission full` rejection/help contract from source.

## Validation

- Passed: `node --experimental-strip-types tools/preview-capability-smoke.ts`
- Passed: `cargo check --lib --manifest-path src-tauri/Cargo.toml`
- The earlier worker-local test compile blocker was cleared during integration.
- Integrated `0.2.13` source gate: 209 all-feature Rust tests passed with 1
  ignored, 23 Orca contract smokes passed across 10 removable features, strict
  all-target/all-feature Clippy passed, and format/diff checks passed.

## Remaining / Risk

- Managed start intentionally remains fail-closed. A separately trusted
  localhost service can still be inspected.
- The locally signed `0.2.13` installed app shows the external-inspection-only
  preview state. Candidate/installed executable hashes match, codesign and
  renderer-ready checks pass, and the visual receipt is
  `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-preview-disabled.png`.
- The 209/23 full-gate receipt includes provider-capability hardening.
- Verdict: `supervised local candidate, public release blocked`.
- No public publish, public signing, or notarization was performed.
