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

## 2026-05-28 Factory On-Demand Default

User-visible follow-up:

- Changed the default Atelier ontology mode from `stella` to `direct`.
- Stopped prepending the Stella Factory autonomous-development contract to every
  normal agent prompt.
- The Factory contract and preflight evidence now apply only when a Factory
  command is used: `/goal`, `/analyze`, `/probe`, or `/audit`.
- Existing sessions created under the old always-on Stella default are migrated
  once to `direct`, so Factory is no longer silently active in old task tabs.
- Updated the prompt action strip label to show Factory is on demand:
  `필요 시 Stella Factory`.
- Version bumped to `0.1.39` for this behavior change.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests on `0.1.39`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-27T20-51-34-733Z.json`.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.39_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.39` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.39`.
- Visual app check:
  `/tmp/atelier-factory-on-demand-039.png` shows `필요 시 Stella Factory`.

## 2026-05-28 Factory Button Press State

User-visible follow-up:

- Changed the Factory strip label from a filled chip to plain muted text so it
  no longer looks permanently enabled.
- Factory quick buttons now show a pressed state only while the prompt starts
  with their matching command: `/goal`, `/analyze`, `/probe`, or `/audit`.
- Pressing the active quick button again removes the Factory command prefix and
  returns the strip to the unpressed state.
- Version bumped to `0.1.40` for this visible interaction fix.

Validation evidence:

- `npm run build` passed.
- Headless Chrome visual check:
  `/tmp/atelier-factory-default-off.png` shows the default Factory strip with no
  pressed quick action.
- Headless Chrome interaction check:
  before pressing Factory quick actions, `aria-pressed` was `[]`; after pressing
  `목표`, `aria-pressed` was `["목표"]` and the prompt value was `/goal `.
- Visual active-state check:
  `/tmp/atelier-factory-goal-active.png` shows only the `목표` quick action in
  the pressed state.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests on `0.1.40`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-27T22-40-20-271Z.json`.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.40_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.40` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.40`.

## 2026-05-28 Factory Main Toggle Button

User-visible follow-up:

- Changed the `필요 시 Stella Factory` label into a real toggle button.
- The Factory main button now uses the same pressed/unpressed visual behavior as
  the Goal/Analyze/Probe/Audit quick buttons.
- Pressing the Factory main button turns on the default `/goal` Factory mode;
  pressing it again clears the active Factory command.
- Version bumped to `0.1.41` for this interaction fix.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests on `0.1.41`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-27T23-16-03-514Z.json`.
- Headless Chrome main-toggle interaction check:
  before press `aria-pressed` was `[]`, after pressing `필요 시 Stella Factory`
  it was `["필요 시 Stella Factory", "목표"]` with prompt value `/goal `, and
  after pressing it again `aria-pressed` returned to `[]` with an empty prompt.
- Visual checks:
  `/tmp/atelier-factory-main-default-041.png`,
  `/tmp/atelier-factory-main-active-041.png`,
  `/tmp/atelier-factory-main-cleared-041.png`.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.41_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.41` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.41`.

## 2026-05-31 Hermes-Like Desktop Shell

User-visible follow-up:

- Replaced the top segmented chrome with a Hermes-style left desktop sidebar.
- Preserved the existing mounted Atelier work surfaces: structured agent chat,
  workbench/code-preview, design mode, and settings.
- Added sidebar entries for Chat, Sessions, Workbench, Design, Models, Skills,
  Providers, Profiles, Gateway, Updates, and Settings.
- Connected Providers/Gateway/Profiles/Updates/Settings sidebar entries to the
  matching Settings sections instead of creating empty placeholder screens.
- Persisted the selected sidebar module and Settings section so refresh/reopen
  does not show mismatched navigation state.
- Version bumped to `0.1.42` for this shell update.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed 23 tests on
  `0.1.42`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-30T18-07-43-043Z.json`.
- Browser visual check:
  `/tmp/atelier-hermes-shell-v1-updated.png` shows the Hermes-style sidebar in
  the dev build.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.42_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.42` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.42`.
- Installed app visual check:
  `/tmp/atelier-installed-0.1.42-shell.png` shows the shell running from
  `/Applications/Atelier.app`.

## 2026-05-31 Single Settings Navigation

User-visible follow-up:

- Removed the nested Settings sidebar that duplicated the new global left
  navigation.
- Moved Settings subsections into the global sidebar: Appearance, Terminal,
  Profiles, Providers, Preview, Shortcuts, and Updates.
- Removed the temporary Gateway duplicate because it opened the same Connections
  surface as Providers.
- Migrated saved `settings` and `gateway` nav IDs to `appearance` and
  `providers` so older local state does not leave the sidebar without an active
  item.
- Version bumped to `0.1.43` for this navigation cleanup.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed 23 tests on
  `0.1.43`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-30T18-44-32-150Z.json`.
- Browser visual check:
  `/tmp/atelier-settings-single-nav.png` shows a single left navigation and a
  settings content pane without the second sidebar.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.43_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.43` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.43`.
- Installed app visual check:
  `/tmp/atelier-installed-0.1.43-single-settings-nav.png` shows the cleaned
  single-sidebar settings view.
