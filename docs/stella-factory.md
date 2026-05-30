# Stella Factory

Stella Factory is Atelier's autonomous-development layer. It upgrades the
existing terminal and structured agent workspace without replacing them.

## What It Adds

- Goal normalization for natural-language development requests.
- Rust-side project analysis before edits.
- Provider-independent workspace probes for build/test/harness evidence.
- SOT evidence recording after Factory runs.
- Backend safety guard before Claude/Codex/Hermes process launch.
- Role delegation across Stella, Worker, Probe, Security, Release, and Auditor.
- SOT recording for durable project state.

## Hermes Desktop Direction

Atelier's product direction is a Hermes Desktop-like local workspace, not a
separate always-on agent. The global shell should expose the major work areas:

- Chat and Sessions for agent work.
- Workbench and Preview for code/runtime inspection.
- Models, Factory, Skills, Providers, and Profiles for agent control.
- Updates and Settings for packaging, release, and app-level configuration.

Factory remains on demand. The user chooses it only when they want Stella to
turn a natural-language goal into a development packet, analyze the repository,
run probes, audit risk, and record evidence. Direct Claude, Hermes, and Codex
sessions remain available without Factory wrapping.

## Workspace Commands

Use these in the Agent Workspace input:

```text
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
