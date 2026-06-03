# Stella Factory Product Brief

Last updated: 2026-05-31
Stage: `product_brief`
Owner: Product Manager

## Product Recommendation

Ship now a **Factory Run Control Loop** for Atelier rather than attempting a
fully autonomous multi-agent mesh in one pass.

The immediate product win is not "more agents." It is giving the user a
trustworthy way to start a broad Factory goal, see what the system is doing,
know which gate is blocking completion, and resume safely after interruption.

This means the first shippable scope should make research, capability map,
agent topology, dispatch/collect, Probe, security, release, final audit, and
heartbeat continuation visible and durable as a run control plane, even if some
specialist steps are still assisted or partially manual behind the scenes.

## User Problem

- The user can already invoke Stella Factory from natural language and run
  `/goal`, `/analyze`, `/probe`, and `/audit`, but broad product work still
  feels like a smart chat turn rather than a durable autonomous factory run.
- The user cannot yet reliably see a single source of truth for objective,
  current milestone, missing roles, gate status, evidence, readiness, and next
  executable action.
- A single completed feature could still be mistaken for product completion if
  the remaining research, QC, release, or continuation queue is not made
  explicit.

## Current Behavior

- Atelier already has a structured agent workspace, provider selection, queue
  mode, Factory invocation, project analysis, workspace Probe, evidence logging,
  and safety gates.
- Existing documentation already defines the intended Service Factory artifacts,
  role model, and completion rule.
- The largest gap is not raw execution capability. The gap is durable run state,
  user-visible orchestration, and trustworthy continuation for long-horizon
  product work.

## Target User Outcome

When the user says "Stella Factory this product goal," Atelier should behave
like a local autonomous delivery control room:

- It converts the goal into a durable run packet.
- It shows the current milestone, owner, checks, and evidence.
- It makes Probe, security, release, and final audit gates explicit.
- It writes a continuation state instead of silently stopping early.
- It closes only when readiness is truly met.

## Success Signals

- In pilot runs, `5/5` broad Factory goals persist `objective`,
  `current_milestone`, `readiness`, and `next_action` after interruption or app
  restart.
- `0` Factory runs self-close while required roadmap or QC items remain open.
- At least one visible workspace panel shows the run packet, gate states, and
  latest evidence without requiring the user to inspect raw SOT files manually.
- Safety gates continue to block forbidden destructive actions without reducing
  normal local development flows.

## Options Considered

### Option A: Full Autonomous Multi-Agent Mesh Now

- Impact: high if it works.
- Effort: very high.
- Risk: very high.
- Time-to-learn: slow, because failures become harder to explain and recover.
- Tradeoff: maximizes ambition but creates an opaque system before trust,
  control, and policy layers are reliable.

### Option B: Factory Run Control Loop First

- Impact: high on trust, usability, and execution quality.
- Effort: medium.
- Risk: medium.
- Time-to-learn: fast, because every later specialist improvement inherits the
  same run packet, gate model, and continuation contract.
- Tradeoff: some specialist behaviors remain partially manual at first, but the
  product becomes operable and truthfully inspectable.

### Option C: Keep Adding Feature-Level Factory Helpers

- Impact: low on the core user problem.
- Effort: low.
- Risk: medium, because it creates more surface area without solving run-level
  trust and completion semantics.
- Tradeoff: easier to ship in the short term, but it prolongs ambiguity about
  what Factory actually guarantees.

## Recommendation

Recommend **Option B**.

The next milestone should establish Stella Factory as a durable operating layer
for long-running product work before we deepen automation. This gives users a
clear mental model, gives engineering a stable artifact contract, and reduces
the risk of "agent theater" where more automation exists on paper than in
trustworthy product behavior.

## Ship Now

### Scope Boundary

- Bootstrap a durable Service Factory run when the objective is product-wide,
  long-running, or explicitly Antigravity-style.
- Persist the run packet in SOT with product brief, mission, capability map,
  agent topology, roadmap, QC matrix, readiness state, and next action.
- Show a user-visible Factory status/task packet panel inside the Agent
  Workspace.
- Track dispatch/collect status per milestone with explicit owner, status,
  evidence, blocker, and next action fields.
- Require Probe, security, release, and final-audit gates to resolve as
  `pass`, `fail`, or `manual_needed` before the run can close.
- Write heartbeat-ready continuation state after each milestone or interruption.

### Rationale

- This scope directly solves the user problem of trust, observability, and safe
  continuation.
- It reuses the project analysis, Probe, and evidence primitives that Atelier
  already has.
- It creates a stable base for later specialist automation without forcing a
  risky architecture reset.

## Next

- Add preview/dev-screen Probe coverage so UI/runtime regressions appear in the
  same gate model as build/test evidence.
- Add release-readiness checklist integration for updater, signing, Store/MSIX,
  and GitHub release flows.
- Expand dispatch/collect so available specialist agents can run in parallel
  where evidence boundaries are clean.

## Later

- Add a controlled command proxy or provider-tool policy layer below full
  permission mode.
- Add optional external research connectors only when current product goals
  justify them.
- Consider deeper autonomous release orchestration after safety, audit, and
  packaging gates have proven reliable locally.

## User-Visible Core Loop

1. The user launches a broad goal with `Stella Factory` or `/goal`.
2. Atelier classifies the request as a Service Factory run and bootstraps the
   run packet plus missing artifacts.
3. The Agent Workspace shows objective, active milestone, role ownership, gate
   status, evidence summary, readiness, and next action.
4. Stella dispatches the current milestone to the right execution role and
   records collectable outputs.
5. Probe, security, release, and final audit update their gate states from
   evidence, not from intent alone.
6. If the run is incomplete, Atelier writes heartbeat continuation state and
   leaves a clear next executable action.
7. The run closes only at `pilot_ready`, `full_ready`, or a concrete approval
   gate/blocker.

## Acceptance Criteria

- A broad Factory goal creates or updates durable Service Factory artifacts
  rather than ending as a single transient chat turn.
- `SOT/service-factory-state.json` records at minimum:
  `objective`, `classification`, `current_milestone`, `open_queue`,
  `missing_capabilities`, `gate_status`, `readiness`, and `next_action`.
- `SOT/service-factory/` contains at minimum:
  `mission-charter.md`, `product-brief.md`, `capability-map.md`,
  `agent-topology.md`, `roadmap.md`, `qc-matrix.md`, and
  `readiness-report.md`.
- The user can see the active run packet in the workspace without opening raw
  markdown files manually.
- Dispatch/collect entries show who owns the milestone, what evidence was
  collected, what blocked progress, and what should run next.
- Probe, security, release, and final audit cannot be silently skipped on a run
  that touches their surfaces.
- Interruption or restart preserves enough state to resume from the next action
  instead of regenerating the run from scratch.
- Factory completion is blocked when roadmap or QC items remain open.

## Non-Goals

- Rebuilding Atelier from scratch.
- Replacing direct Claude, Codex, or Hermes sessions with mandatory Factory
  wrapping.
- Shipping full autonomous specialist execution before run-state trust exists.
- Automating production deploys, external publishing, or Store submission.
- Expanding into paid tooling or always-on cloud orchestration for this
  milestone.

## Forbidden Actions

- DB deletion or user-data deletion without explicit approval.
- Destructive migrations, volume deletion, or destructive git operations.
- Production deploy/submission or production data writes.
- Paid API or tooling budget expansion.
- External communication as the user or company.
- Offensive security testing or broad scanning.

## Dependencies

- Existing Stella Factory invocation and safety-gate path.
- Existing project analysis, Probe, and evidence logging surfaces.
- A stable SOT artifact contract that engineering can write and read across
  turns.
- UI capacity in Agent Workspace for a visible task packet and readiness panel.

## Key Risks And Mitigations

- Risk: a visible Factory surface over-promises automation before enforcement is
  strong enough.
  Mitigation: make gate states explicit, keep `manual_needed` honest, and defer
  hidden automation.
- Risk: specialist roles become decorative checkboxes.
  Mitigation: require owner, evidence, and next action for each milestone and
  gate.
- Risk: full-permission providers can still act below the prompt layer.
  Mitigation: keep this as a known constraint, do not market it as solved, and
  prioritize command-policy work in a later milestone.
- Risk: release/security checks slow iteration if treated as always-on.
  Mitigation: trigger them conditionally based on touched surfaces and closure
  intent.

## Unresolved Decisions

- Product owner: define the threshold between `validation_required`,
  `pilot_ready`, and `full_ready`.
- Engineering lead: choose whether dispatch/collect starts as SOT-driven
  orchestration or a richer runtime scheduler.
- Security owner: define the acceptable below-provider command policy for full
  permission mode.
- Release owner: define the minimum evidence for updater/signing/release-ready
  closure.

## Next Step

Use this brief as the scope boundary for the next Service Factory stages:
capability map, agent topology, roadmap, and readiness state bootstrap.
