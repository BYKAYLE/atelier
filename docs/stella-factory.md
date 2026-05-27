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
