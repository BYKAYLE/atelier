# Evidence Log

## 2026-05-28 Stella Factory Baseline

Observed repository state:

- No existing `SOT/` directory was present.
- `package.json` exposes build, Tauri, harness, Windows Store, and provider smoke
  scripts.
- `README.md` still describes the earlier GUI terminal positioning and does not
  fully reflect the structured AgentWorkspace.
- `src/components/AgentWorkspace.tsx` contains the main structured autonomous
  workspace surface.
- `src/components/Main.tsx` preserves the xterm PTY terminal surface.
- `src-tauri/src/agent.rs` contains Claude, Codex, Hermes, preview service,
  change summary, and CLI validation logic.
- `docs/atelier-agent-harness.md` documents provider adapter checks.

Patch intent:

- Preserve existing terminal and agent behavior.
- Add a Stella Factory autonomous-development contract.
- Make `/goal`, `/analyze`, `/probe`, and `/audit` route through the existing
  agent workspace instead of creating a separate app flow.

## 2026-05-28 Stella Factory Runtime Core

Implemented runtime-level Factory support:

- Added `src-tauri/src/stella.rs` with project analysis, workspace probe, SOT
  evidence append, and prompt safety guard.
- Registered Tauri commands:
  - `stella_project_analysis`
  - `stella_workspace_probe`
  - `stella_record_evidence`
- Added backend guard before `agent_send` and `agent_claude_send` spawn provider
  CLIs.
- Added frontend wiring so Factory commands attach local project evidence before
  provider execution.
- Added SOT recording after Factory agent turns finish or fail.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests.
- `npm run harness:fixture` passed.
- `git diff --check` passed.
- `npm run tauri:build` passed and produced:
  - `src-tauri/target/release/bundle/macos/Atelier.app`
  - `src-tauri/target/release/bundle/dmg/Atelier_0.1.36_aarch64.dmg`

## 2026-05-28 Installed Build and Release Version

- Version bumped to `0.1.37` for this Stella Factory patch upload.
- `npm run tauri:build` passed for `0.1.37`.
- `/Applications/Atelier.app` was replaced with the `0.1.37` app bundle and
  passed `codesign --verify --deep --strict`.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests on `0.1.37`.
- Local release asset:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.37_aarch64.dmg`.

## 2026-05-28 Visible Factory Controls

User-visible follow-up:

- Added an always-visible `Stella Factory` action strip above the AgentWorkspace
  prompt.
- Added quick actions for `/goal`, `/analyze`, `/probe`, and `/audit` so the
  Factory capability is visible without needing to remember slash commands.
- Version bumped to `0.1.38` for the visible UI follow-up.

Validation evidence:

- `npm run build` passed before packaging.
- `npm run tauri:build` passed for `0.1.38`.
- `/Applications/Atelier.app` was replaced with the `0.1.38` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.38`.
- Visual app check:
  `/tmp/atelier-work-ax3-038.png` shows the `Stella Factory` action strip.
- Interaction check:
  `/tmp/atelier-work-goal-ax-038.png` shows the `목표` quick action filling
  `/goal` in the prompt.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests on `0.1.38`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-27T19-22-29-033Z.json`.
