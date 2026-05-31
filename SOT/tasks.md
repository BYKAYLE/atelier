# Stella Factory Task Ledger

Last updated: 2026-05-31

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

## Next Upgrades

- Add actual `SOT/service-factory-state.json` bootstrap for active long-running
  Atelier product runs, then wire the run state into a visible Factory status
  panel.
- Add a visible task packet/status panel so the user can see objective,
  done_when, checks, and evidence per run.
- Add preview/dev-screen Probe integration so UI/runtime failures are captured
  alongside build/test evidence.
- Add a controlled command proxy for provider tool calls when full permission is
  selected, so destructive shell commands can be blocked below the prompt layer.
- Add release readiness checklist integration for updater, GitHub release, MSIX,
  signing, and Store packaging.
- Expand the Factory brief into a per-run task packet view with objective,
  constraints, done_when, checks, evidence, and final audit state.
- Add installed-state probing to the `Plugins & Skills` screen so plugins can
  show installed/disabled status before the user clicks install.

## Known Constraints

- Agent CLIs can still execute their own internal tool calls when the user
  selects full permission. Atelier now blocks known forbidden intent before
  provider launch, but provider-level shell enforcement still needs a controlled
  execution proxy or provider tool policy integration.
- `src/components/AgentWorkspace.tsx.bak` exists as an untracked backup and is
  intentionally not part of the working patch.
