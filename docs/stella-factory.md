# Stella Factory

Stella Factory is Atelier's autonomous-development layer. It upgrades the
existing terminal and structured agent workspace without replacing them.

## What It Adds

- Goal normalization for natural-language development requests.
- Natural-language Factory invocation through `스텔라 팩토리` / `Stella Factory`,
  not only `/goal`.
- Rust-side project analysis before edits.
- Provider-independent workspace probes for build/test/harness evidence.
- SOT evidence recording after Factory runs.
- Backend safety guard before Claude/Codex/Hermes process launch.
- Role delegation across Stella, Worker, Probe, Security, Release, and Auditor.
- SOT recording for durable project state.
- Durable Service Factory artifacts for product-wide goals:
  `SOT/service-factory-state.json` and `SOT/service-factory/`.

## Hermes Desktop Direction

Atelier's product direction is a Hermes Desktop-like local workspace, not a
separate always-on agent. The global shell should expose the major work areas:

- Chat and Sessions for agent work.
- Workbench and Preview for code/runtime inspection.
- Models, Factory, Skills, Providers, and Profiles for agent control.
- Updates and Settings for packaging, release, and app-level configuration.

Factory remains on demand at the entry point, but a Factory run is not a
single-turn feature wrapper. When the goal is product-wide, long-running, or
Antigravity-style autonomous delivery, Stella must treat it as a durable Service
Factory run: define the mission, map agents, create a milestone queue, run the
current milestone, verify, record evidence, and leave an explicit continuation
state if the product is not yet `pilot_ready` or `full_ready`.

Direct Claude, Hermes, and Codex sessions remain available without Factory
wrapping.

## Workspace Commands

Use these in the Agent Workspace input:

```text
/스텔라 팩토리 <objective>
스텔라 팩토리 <objective>
/goal <objective>
/analyze <scope>
/probe <scope>
/audit <scope>
```

These commands do not create a separate runtime. They expand into a structured
task contract, attach local evidence, and run through the selected provider:
Claude, Hermes, or Codex.

Before provider execution:

- `/goal` and `/analyze` attach project analysis.
- `/probe` attaches project analysis plus focused probe output.
- `/audit` attaches project analysis plus full probe output.

After provider execution, Atelier appends a compact evidence entry to
`SOT/evidence-log.md`.

## Product-Scale Factory Runs

For broad service goals, Stella Factory must maintain these artifacts before it
claims completion:

- `SOT/service-factory-state.json`: active phase, readiness, open queue, gates,
  missing capabilities, and next action.
- `SOT/service-factory/mission-charter.md`: user goal, non-goals, safety gates,
  and done_when.
- `SOT/service-factory/research-dossier.md`: current market, reference product,
  community, paper, and docs research when the goal depends on external facts.
- `SOT/service-factory/capability-map.md`: current app capabilities vs required
  final-product capabilities.
- `SOT/service-factory/agent-topology.md`: Stella, worker, reviewer, critic,
  Probe, security, release, final-audit, and missing specialist roles.
- `SOT/service-factory/roadmap.md`: milestones, parallelizable work, blockers,
  and acceptance checks.
- `SOT/service-factory/qc-matrix.md`: tests, UI/runtime checks, security review,
  release checks, and final audit criteria.
- `SOT/service-factory/readiness-report.md`: why the run is `running`,
  `validation_required`, `blocked`, `pilot_ready`, or `full_ready`.

One finished feature is only a milestone result. It is not a Factory completion
unless the readiness report proves that the declared product goal has no
remaining required queue.

## Safety

The factory contract forbids the following without explicit user approval:

- database deletion
- user-data deletion
- production deployment/submission
- external publication
- credential disclosure
- paid actions
- destructive git operations

Safety is checked in the frontend and again in the Rust backend before spawning
the selected provider. The direct provider CLI slash-command surface is also
intentionally allowlisted for status, plugin, auth, feature, and diagnostic
commands.

Provider CLIs can still perform their own tool calls when full permission is
selected. The next hardening step is a controlled command proxy/tool policy
layer below provider execution.
