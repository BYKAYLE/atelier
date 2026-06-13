# Stella Factory

Stella Factory is Atelier's autonomous-development layer. It upgrades the
existing terminal and structured agent workspace without replacing them.

## What It Adds

- Goal normalization for natural-language development requests.
- One primary user-facing Factory launcher through `스텔라 팩토리` /
  `Stella Factory`, with `/goal` kept as a compatibility path.
- Rust-side project analysis before edits.
- Provider-independent workspace probes for build/test/harness evidence.
- SOT evidence recording after Factory runs.
- Backend safety guard before Claude/Codex/Hermes process launch.
- Role delegation across Stella, Worker, Probe, Security, Release, and Auditor.
- SOT recording for durable project state.
- Durable Service Factory artifacts for product-wide goals:
  `SOT/service-factory-state.json` and `SOT/service-factory/`.
- A fixed development operating loop:
  current state discovery -> goal-to-plan strategy -> execution and
  verification.
- Managed Service Factory autopilot when the local Stella bridge is available:
  plan agent requests, execute command-backed worker cycles, collect
  `result.json`, write recovery proof, and assess readiness before the provider
  claims completion.

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
Factory run: inspect the current state, write the goal-to-plan strategy, define
the mission, map agents, create a milestone queue, run the current milestone,
verify, record evidence, and leave an explicit continuation state if the product
is not yet `pilot_ready` or `full_ready`.

Direct Claude, Hermes, and Codex sessions remain available without Factory
wrapping.

## Workspace Launcher

Use the single `Stella Factory` button or type one of these natural-language
launchers in the Agent Workspace input:

```text
스텔라 팩토리 <objective>
Stella Factory <objective>
```

The launcher keeps the selected provider in the loop and runs the managed
Service Factory autopilot when the local bridge exists. Broad goals no longer
stop at a single feature patch: Atelier bootstraps durable state, runs the
managed cycle, attaches the readiness verdict, and then sends the provider the
full contract and evidence.

`/goal`, `/analyze`, `/probe`, and `/audit` remain accepted for compatibility and
internal review workflows. They should not be presented as separate user steps;
analysis, Probe, security review, and final audit are part of the single Factory
session.

After provider execution, Atelier appends a compact evidence entry to
`SOT/evidence-log.md`.

## Product-Scale Factory Runs

For broad service goals, Stella Factory must maintain these artifacts before it
claims completion:

- `SOT/service-factory-state.json`: active phase, readiness, open queue, gates,
  missing capabilities, and next action.
- `SOT/service-factory/current-state.md`: actual repo/runtime/installed app/SOT
  baseline, dirty paths, current capabilities, risks, and verification
  candidates.
- `SOT/service-factory/development-plan.md`: gap from current state to target,
  task packets, role assignments, owned paths, done_when, checks, and rollback
  or retry strategy.
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

## Operating Loop

Every Factory development goal follows this order:

1. Current state discovery: inspect the real code, runtime, installed app,
   package state, SOT, dirty paths, capability baseline, and available checks.
2. Goal-to-plan strategy: explain the gap to the target, then split the work
   into task packets with role, owned paths, done_when, verification, and
   rollback/retry criteria.
3. Execution and verification: implement bounded task packets, integrate them,
   run build/test/Probe/security/release/final-audit evidence, and return to
   the plan when evidence fails.

Broad goals must not jump directly into implementation. Narrow one-shot tasks
may execute directly only after they record the baseline and verification
evidence.

## Managed Autopilot

The local bridge command is:

```text
python3 ~/.claude/skills/stella/scripts/stella_service_factory.py autopilot --project <workspace> --goal <objective> --max-cycles 12 --pretty
```

It uses the Release Service Factory state machine, a conservative no-cost local
worker, command-backed `agent_results`, automatic validation gates, handoff
files, and recovery proof. This is a pilot-ready local orchestration runtime,
not a promise that every future product goal can be finished without specialist
implementation agents.

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
