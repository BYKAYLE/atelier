# Stella Factory Task Ledger

Last updated: 2026-06-14

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

## Next Upgrades

- Replace the local no-cost worker with true specialist LLM subagent spawning
  for implementation-heavy product goals while keeping the same
  dispatch/collect/result contract.
- Add a visible task packet/status panel so the user can see objective,
  done_when, checks, and evidence per run.
- Add preview/dev-screen Probe integration so UI/runtime failures are captured
  alongside build/test evidence.
- Add a controlled command proxy for provider tool calls when full permission is
  selected, so destructive shell commands can be blocked below the prompt layer.
- Add release readiness checklist integration for updater, GitHub release, MSIX,
  signing, and Store packaging.
- Expand the Factory status strip into a per-run task packet view with
  objective, constraints, done_when, checks, evidence, and final audit state.
- Add installed-state probing to the `Plugins & Skills` screen so plugins can
  show installed/disabled status before the user clicks install.

## Known Constraints

- Agent CLIs can still execute their own internal tool calls when the user
  selects full permission. Atelier now blocks known forbidden intent before
  provider launch, but provider-level shell enforcement still needs a controlled
  execution proxy or provider tool policy integration.
- `src/components/AgentWorkspace.tsx.bak` exists as an untracked backup and is
  intentionally not part of the working patch.
