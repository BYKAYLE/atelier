# Stella Factory Autonomous Workspace Contract

Last updated: 2026-05-28

## Operating Principle

Atelier is not being replaced. It is being upgraded in place from a terminal
service into a local autonomous development workspace.

## Default Workflow

Every non-trivial development request should follow this loop:

1. Normalize the user goal into:
   - objective
   - constraints
   - forbidden actions
   - target surface
   - target files or modules
   - execution plan
   - verification plan
   - done_when
   - rollback path
2. Inspect the real repository state before editing.
3. Prefer existing architecture, adapters, styles, and IPC commands.
4. Apply the smallest coherent patch that satisfies the objective.
5. Verify with focused checks first.
6. Escalate to broader build, test, harness, preview, package, or release checks
   when the touched surface requires it.
7. Record meaningful decisions and evidence in SOT.
8. Report concise results, not raw logs.

## Role Model

- Stella: judgment, scope, priority, and final decision owner.
- Worker: implementation executor for code/docs/tests.
- Probe: evidence verifier for runtime, UI, preview, and test output.
- Security: permission, credential, destructive-action, and network-risk review.
- Release: packaging, updater, signing, Store, and GitHub Release readiness.
- Auditor: final pass that checks whether done_when is truly satisfied.

## Approval Gates

The following are forbidden without explicit approval from the user:

- database deletion
- user-data deletion
- irreversible data migration
- production deployment or Store submission
- external publication
- credential disclosure
- paid purchases or paid API setup
- destructive git operations such as hard reset

External network calls should be limited to dependency verification, release
checks, or user-requested integration checks. Record the reason when they matter.

## Current App Hooks

- `/goal <objective>`: run a full autonomous development loop.
- `/analyze <scope>`: analyze code, runtime, docs, tests, and SOT before edits;
  Atelier attaches Rust-collected project evidence to the provider prompt.
- `/probe <scope>`: verify implementation evidence and blockers; Atelier runs
  a provider-independent workspace probe before delegating.
- `/audit <scope>`: run security, permission, release readiness, and regression
  audit; Atelier includes project evidence and probe results.
- `/que <message>` and `/queue`: queue work while another turn runs.
- `/permission basic|auto|full`: choose CLI permission behavior.

## Runtime Enforcement

The Factory contract is enforced in two layers:

1. Frontend command parsing blocks obvious forbidden Factory requests before
   queuing an agent turn.
2. Rust backend prompt guard blocks forbidden intent again before spawning
   Claude, Codex, or Hermes.

The current hard block covers DB/table deletion, user-data deletion,
production deployment/submission, external publication, and credential exposure
when they are present as the active user objective. Safety-policy text such as
"do not delete DB data" is intentionally ignored so the contract itself does
not block normal work.

## Built-In Probe

`stella_workspace_probe` runs only allowlisted local commands without a shell.
For this repository it can collect:

- `git diff --check`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture`
- `npm run harness:fixture`

Probe output is clipped before being returned to the UI or SOT.

## Evidence Expectations

Evidence can come from:

- focused source inspection with file paths
- build/test/harness command results
- Tauri/Rust command tests
- preview health checks and local browser/dev-screen checks
- GitHub release/update metadata checks
- change summary and diff review

Raw terminal dumps are not SOT. SOT should capture the decision, command, result,
and remaining risk.
