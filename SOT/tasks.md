# Stella Factory Task Ledger

Last updated: 2026-07-10

## Completed

- Identified Atelier as an existing Vite/React + Tauri/Rust desktop app rather
  than a greenfield project.
- Identified existing Codex-like surfaces:
  - structured agent workspace
  - Claude/Codex/Hermes adapters
  - queue mode
  - model/provider controls
  - permission controls
  - preview service and health checks
  - change baseline/summary/review/undo
  - agent harness
- Added a durable SOT foundation for autonomous workspace behavior.
- Added Stella Factory prompt contract and task commands:
  `/goal`, `/analyze`, `/probe`, `/audit`.
- Added Rust-side Stella Factory core commands:
  - `stella_project_analysis`
  - `stella_workspace_probe`
  - `stella_record_evidence`
- Added backend prompt safety guard before Claude/Codex/Hermes execution.
- Connected Factory runs to preflight project analysis, optional Probe execution,
  and SOT evidence append.
- Added a Hermes Desktop-style Factory entry point to the global shell and a
  visible Stella Factory brief in the task pane. The brief seeds `/goal` and
  `/analyze` prompts without making Factory always-on.
- Removed duplicate left-nav entries that pointed at the same agent workspace:
  `Chat`, `Models`, and `Factory`. The remaining `Sessions` item now owns the
  agent workspace, while Factory/model controls stay inside the work surface.
- Moved installable extensions out of the task list into a dedicated
  `Plugins & Skills` screen, with plugins and built-in skills separated.
- Corrected Stella Factory invocation and completion semantics so
  `스텔라 팩토리` / `Stella Factory` natural-language requests route into the
  Factory goal path and product-wide goals cannot close after a single feature
  without Service Factory readiness evidence.
- Added a real Factory bootstrap path: Factory goal requests now create
  or resume `SOT/service-factory-state.json`, seed required product-scale
  artifacts, and attach the state/readiness/next-action evidence before the
  provider starts. `/analyze` remains analysis-only and does not launch the
  managed autopilot side effect.
- Added a managed Factory autopilot path: Factory goal requests now run the
  Stella Service Factory bridge after bootstrap when available, execute
  queued agent requests through a command-backed local worker, collect
  `result.json` artifacts, write recovery proof, and report readiness in the
  preflight evidence.
- Hardened the managed path after reviewer/security findings so local workers
  cannot create false-green mandatory review/security/release completion.
- Ran the active Atelier Factory state to `pilot_ready` with readiness score
  `0.95`, managed backend `spawn_runtime_command`, attached specialist
  validation evidence, and no primary blocker.
- Resolved the remaining `parallel_implementation::builder` request with actual
  implementation evidence, leaving zero queued/in-progress/blocked Factory
  requests in the active state.
- Locked Stella Factory's development method to `current_state ->
  development_plan -> execution_verification`. Broad Factory goals must now
  capture the real repo/runtime/SOT/install baseline before planning, then turn
  the gap into task packets before implementation.
- Added the active `current_state::state_mapper` and
  `development_plan::strategy_planner` requests and completed both, leaving the
  active Factory state with zero queued/in-progress/blocked requests.
- Moved the Stella Factory direction into the Stella ontology: Stella is now the
  Factory `command_owner`, Release is the runtime/state/gate adapter, kanban is
  only a state projection, and agent creation must distinguish
  AgentBlueprint/AgentInstance/AgentManifest from prompt/worktree artifacts.
- Materialized the active Atelier Stella Factory state with
  `command_owner: Stella`, `execution_controller: Release`, explicit
  `control_plane`, `kanban_projection`, 15 AgentBlueprints, 23 AgentInstances,
  and `agent_topology`.
- Upgraded readiness, handoff, and artifact-review surfaces so
  `stella_command_owner` and `agent_topology` are verified capabilities rather
  than informal claims.
- Fixed Release Service Factory atomic writes to use unique temp paths, avoiding
  concurrent `.tmp` replacement races during report/status generation.
- Ran Atelier through the Stella bridge autopilot and confirmed
  `pilot_ready`, no primary blocker, and warning-free Factory validation.
- Added the first user-visible Atelier product upgrade from that Factory state:
  the agent workspace now shows a live Factory status strip with readiness,
  Stella -> Release control, AgentBlueprint/AgentInstance counts, done/open
  stage counts, blocker, next step, and manual refresh.
- Simplified the Agent Workspace Factory controls to one user-facing
  `Stella Factory` launcher. The former `Goal`, `Analyze`, `Probe`, and `Audit`
  controls remain compatible internal/legacy commands, but the main UI now
  treats planning, implementation, verification, security, and final audit as a
  single autonomous Factory session behind one goal entry point.
- Completed the 0.1.79 release-stability pass across provider execution,
  subscription login, credential boundaries, retry handling, packaging, and
  release gates.
- Fixed OAuth URL truncation by allocating a wide login PTY and keeping URL
  parsing/provider validation in the Rust backend.
- Added a native Windows browser-open fallback chain and removed temporary
  browser helper scripts that can be blocked by Smart App Control.
- Unified Windows CLI resolution for regular sessions and login sessions,
  including npm command shims and Claude's Git Bash requirement.
- Removed direct reads from Claude Code's external macOS keychain item. Atelier
  now owns its cached login state and refreshes its Claude subscription token
  inside the Atelier credential boundary.
- Stopped persistent credential fan-out to Gajae Code and Hermes. Gajae gets a
  per-process Claude OAuth token; Hermes receives a staged Codex access token
  that is scrubbed after the run.
- Changed the default permission policy from full access to automatic
  workspace access. Explicit full access remains an opt-in mode.
- Updated Codex invocation to current global sandbox/approval flags and removed
  the deprecated `--full-auto` argument.
- Added Windows installer/MSIX payload smoke tests, optional Authenticode
  verification, and release-workflow gates that refuse unsigned publication.
- Added a release security audit and closed the RustSec vulnerability in the
  locked QUIC dependency.
- Changed Codex subscription sign-in to device authorization so the app can
  open a stable login page and display the one-time code even when a packaged
  Windows app cannot complete a localhost browser handoff.
- Moved the Codex model menu to a viewport-level portal with bounded height and
  independent scrolling so small/resized windows cannot clip models or effort
  controls inside the composer.
- Reset the menu scroll position on reasoning/model/speed panel changes and
  verified the installed app's complete Codex model list at 560 px width.
- Removed the composer-level vertical scroll and moved slash suggestions to a
  viewport portal so textarea resizing and slash commands remain compatible.
- Hid the code/terminal navigation tab and migrated stale saved terminal routes
  back to Sessions without deleting the underlying terminal implementation.
- Built and installed `/Applications/Atelier.app` 0.1.79, verified its code
  signature and confirmed the installed process is running from that bundle.

## Release Validation Remaining

- Run the strict Windows provider smoke and interactive Claude/Codex browser
  sign-in on a physical Windows machine. The macOS host cannot prove Windows
  default-browser behavior or Smart App Control acceptance.
- Run the signed Windows package smoke after SignPath returns the installer.
- Produce the public macOS release with a Developer ID Application certificate
  and Apple notarization credentials. The local 0.1.79 build uses a local
  hardened-runtime certificate and is intentionally rejected by Gatekeeper.
- Keep the compatibility bundle identifier `com.atelier.app` until an explicit
  updater/keychain/store identity migration is designed and tested.

## Known Constraints

- Agent CLIs can still execute their own internal tool calls when the user
  explicitly selects full permission. The default is now automatic workspace
  access, and full access remains a deliberate bypass choice.
- Windows source, packaging scripts, and CI gates are release-candidate ready,
  but interactive Windows OAuth remains `validation_required` until exercised
  on a physical Windows host.
- Public macOS distribution remains blocked by external Developer ID and
  notarization credentials even though the local installed app is reflected.
- `src/components/AgentWorkspace.tsx.bak` exists as an untracked backup and is
  intentionally not part of the working patch.
