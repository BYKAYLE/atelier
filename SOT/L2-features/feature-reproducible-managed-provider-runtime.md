# Feature: Reproducible managed Hermes and Gajaecode runtime

Status: installed-app runtime/bootstrap and provider model-default parity verified;
authenticated Gajae Codex provider-turn proof pending (0.2.15 local candidate)
Updated: 2026-07-26 KST
Release/install status: locally signed 0.2.15 candidate installed and matched;
public distribution remains blocked

Goal

- Restore managed task execution for Hermes and Gajaecode by making Atelier provision
  pinned runtimes and default skills automatically, isolate workspace execution under
  an Atelier-owned boundary on macOS, and expose truthful adapter ownership
  in the UI.

Implemented Contract

- `agent_send` now runs managed Hermes and Gajae turns through the
  `ensure_managed_agent_runtime` path.
- `ManagedAgentRuntimeReadiness` is enforced before Hermes/Gajae command launch.
- Runtime preparation is emitted as ordered progress states:
  `checking`, `installing`, `bootstrapping_skills`, `verifying`, `ready`, and
  `failed`.
- Installer and skill bootstrap receipts are persisted in app-support runtime folders
  with versioned pin contracts:
  - Hermes pinned by git commit
    `3ef6bbd201263d354fd83ec55b3c306ded2eb72a`.
  - Gajaecode pinned at `0.11.7` with managed Bun `1.3.14`.
  - Shared policy constant:
    `atelier-managed-basic-auto-v1`.
- Gajaecode uses only
  `providers/gajecode/home/.gjc/agent/skills`; Atelier prepares the four
  adapter-owned defaults and does not import personal Mac Codex, Claude,
  Hermes, or Atelier skill folders.
- Hermes no longer relies on the installed wheel containing the upstream
  `skills/` tree. Atelier creates a durable source under
  `providers/hermes/bundled/skills` from an exact-commit `git archive`,
  verifies archive files against Git objects, and verifies the durable
  SHA-256 manifest against the 73 installed bundled skills.
- Existing invalid Hermes skill or bundled-source trees are moved to bounded
  quarantine folders before repair instead of being deleted.
- On macOS, Hermes/Gajae runtime commands are launched through the sandbox
  profile path with explicit file-root read/write boundaries.
- `credentials.rs` now returns readiness receipts with repair/skip behavior, and the
  frontend receives them as API types in `src/lib/tauri.ts`.
- Capability metadata now advertises:
  - managed runtime owner identity,
  - controlled runtime skill namespace,
  - permission support, and
  - automatic online bootstrap.
- Provider workspace identity and runtime skill controls are surfaced in
  `AgentWorkspace.tsx`, including unavailable, progress, bootstrap status, and
  failure states.
- API and tooling smoke checks now verify managed-runtime progress state and
  runtime identity fields.
- Settings/model-provider parity implemented:
  - Hermes settings model selection is wired as a new-session default contract.
  - Gajae settings now include internal provider selector (`Claude`, `Codex`,
    `Alibaba Cloud`) for new-session bootstrap.
  - Existing sessions remain immutable unless explicitly edited.
  - Gajae Codex runs through managed GJC with an access-token-only child-env
    bridge; no refresh-token, global skill/config, or `agent.db` migration.
  - Installed-app interaction proves provider persistence across app restart
    and new-task reflection (`Codex` / `5.5`); the prior Claude default was
    restored after proof.

Safety and Platform Boundaries

- On non-macOS, managed execution path remains blocked with explicit disabled
  reason.
- Existing direct CLI path remains separate and does not inherit managed runtime
  claims.
- Runtime, default skills, permission policy, and adapter identity are
  reproducible. User authentication, provider entitlement, billing, and model
  availability remain user-specific and are never bundled.
- Existing action-tool proxy milestone remains pending and is not represented as done
  by this feature.

Verification Evidence

- Source verification across
  `src-tauri/src/agent.rs`, `src-tauri/src/agent_sandbox.rs`,
  `src-tauri/src/agent_registry.rs`, `src-tauri/src/credentials.rs`,
  `src/lib/tauri.ts`, `src/components/AgentWorkspace.tsx`,
  `src/components/ConnectionsPanel.tsx`,
  `tools/agent-permission-capability-smoke.ts`,
  and `tools/provider-runtime-identity-smoke.ts`.
- Rust all-feature library verification: 239 passed, 0 failed, 4 ignored.
- Strict all-target/all-feature Clippy, format, diff hygiene, production
  frontend build, provider identity, permission, and Gajae routing smokes:
  passed.
- Orca gate: 23 contract smokes across 10 removable backend features.
- Dependency audit: npm 0 vulnerabilities; RustSec 0 vulnerabilities with
  18 unmaintained and 2 unsound upstream warnings retained.
- Installed 0.2.15 candidate and `/Applications/Atelier.app` executable
  SHA-256 match:
  `d1c433a730536868433140949cf468420dea6ae48cf129edfa5099bd0f72b1a9`.
- Installed UI `설치·복구` proof:
  - Gajaecode `gjc/0.11.7`, Bun `1.3.14`, 4 verified default skills.
  - Hermes Agent `v0.19.0`, 453 durable source files, 73 verified installed
    skills, provider-local Python 3.11.15.
- Installed UI provider-default proof:
  - Gajae changed from Claude to Codex, survived app restart, and a newly
    created Gajae task opened with `Codex` / `5.5`.
  - the original Claude default was restored after the proof.
- Open follow-up evidence remains:
  - explicit installed-app failure should be observed when the Gajae Codex
    token bridge is absent/expired, and a successful authenticated provider
    response should be observed when it is available.
- This feature does not claim an authenticated/paid provider response,
  notarized public distribution, or physical Windows evidence.

Dependencies and Recovery

- Runtime bootstrap can be rerun through `설치·복구`; the previously observed
  Hermes wheel-without-skills state was recovered through this installed-app
  path.
- If managed installs or skill bootstrap are missing or fail integrity checks,
  readiness fails closed, preserves the prior tree in quarantine when
  applicable, and retries pinned repair before writing a new receipt.
