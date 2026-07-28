# Feature Plan: Runtime Safety and Preview Truth

Last updated: 2026-07-25 KST

Status: P0 and provider-capability source gates pass; provider model-provider parity
is source/build/installed validated at 0.2.15, with authenticated provider-turn proof pending.

## Goal

Make Atelier's current user-visible safety and preview behavior truthful enough
for supervised daily use: no raw provider bypass option, no mixed-negation or
direct-CLI preflight bypass, and no preview Start control when managed preview
execution is intentionally disabled by the backend.

## Work Items

### P0-1 — Shared safety policy behavior — complete

- Refactor the TypeScript Stella preflight and Rust backend detector to inspect
  local clauses instead of applying a request-wide negation exemption.
- Add guarded categories for external publication, paid actions, destructive
  Git, and irreversible migrations.
- Keep policy/prohibition wording usable so requests such as "block database
  deletion" are not falsely rejected.
- Add positive, negated, mixed-negation, Korean, and English regression cases.

Affected surfaces:

- `src/lib/stellaFactory.ts`
- `src-tauri/src/stella.rs`

### P0-2 — Direct CLI and permission bypass closure — complete

- Apply the Rust prompt guard to direct CLI arguments before validation or
  process spawn.
- Add direct Gajae print/query regression cases.
- Normalize legacy `full`, `bypass`, and `danger` values to Basic.
- Remove provider flags that bypass all approvals and sandboxing.
- Remove `full` from the visible picker and slash-command help while keeping
  legacy session data readable and safely migrated.

Affected surfaces:

- `src-tauri/src/agent.rs`
- `src/components/AgentWorkspace.tsx`
- focused smoke/tests under `tools/` if needed

### P0-3 — Managed preview capability truth — complete

- Add a serializable backend capability response with `managed_start`,
  `external_loopback_inspection`, and the fail-closed reason.
- Register and expose the capability through the Tauri bridge.
- Default the frontend to disabled until capability evidence arrives.
- When disabled, hide command/Start controls and show a concise explanation
  that a separately trusted localhost service can still be inspected.
- Preserve Stop for an already-running managed process and preserve health,
  DOM, screenshot, console, and network inspection.

Affected surfaces:

- `src-tauri/src/agent_preview.rs`
- `src-tauri/src/lib.rs`
- `src/lib/tauri.ts`
- `src/components/AgentWorkspace.tsx`
- focused preview smoke/tests under `tools/`

### P0-4 — Dependency security regression — complete

- Update PostCSS to a non-vulnerable compatible release.
- Refresh the lockfile and require `npm audit` to report no high/critical
  advisory introduced by this dependency.

Affected surfaces:

- `package.json`
- `package-lock.json`

### P1-1 — Provider capability truth — superseded and completed by managed runtime

- Keep managed Basic/Auto execution in the existing Claude/Codex paths.
- Enable Hermes and Gajaecode only through readiness-gated Atelier-owned
  runtimes and the macOS managed sandbox.
- Refuse unsupported platform or unready execution before process spawn and
  show the exact preparation/disabled reason in the UI.
- Keep direct CLI as a separate manual, limited path. Do not present it as the
  same contract as managed structured execution.

### P1-2 — Hermes/Gajae provider model-default parity — source/build/installed validated

- Persist Hermes model-provider as “새 작업 기본 모델 공급자” for new sessions.
- Add Gajae model-provider controls (`Claude`, `Codex`, `Alibaba Cloud`) to the
  settings card and store defaults only for new-session bootstrap.
- Keep composer controls as current-session state, with optional sync to next-session
  defaults, and do not mutate existing persisted sessions.
- Add Gajae Codex auth bridge into the isolated GJC child-env via access-token
  env only.
- Fail-closed when auth is missing/expired and keep provider identity/wiring
  visible in UI without claiming successful execution.
- Keep Gajae Codex readiness truthful: the selected backend is shown as ready
  only when the upstream Codex ChatGPT subscription login exists, matching the
  isolated child-env bridge contract.

## Acceptance Criteria

- A mixed request that negates DB deletion but requests user-data deletion is
  blocked in TypeScript and Rust.
- Safety-policy wording such as "do not delete the database; implement a guard"
  remains allowed.
- Direct `/gjc -p`-style dangerous text is rejected before any provider process
  can spawn.
- Claude, Codex, and Hermes receive no raw full-bypass flag from any persisted
  permission value.
- The permission UI offers only Basic and Auto Review, and legacy Full sessions
  render as Basic.
- Claude and Codex managed sessions support Basic/Auto. Hermes and Gajaecode
  support Basic/Auto only through verified Atelier-managed macOS runtimes and
  fail closed before spawn when readiness is absent.
- Direct CLI is visibly and architecturally separate from managed execution.
- The backend capability reports managed preview Start as disabled and the UI
  renders no dead Start control.
- Existing external localhost preview inspection continues to work.
- Focused tests, production frontend build, Rust tests, strict Clippy, format,
  and dependency security checks pass.
- Source/build, installed-app, and public-release truth are reported
  separately.

- Provider settings parity:
  - Hermes/Gajae saved defaults apply only to newly created sessions.
  - Existing sessions stay unchanged unless explicitly edited.
  - Gajae Codex requires isolated child-env access-token bridge to run; no
    refresh-token or global-state copy.
  - `설치·복구` + reopen + new-session-start reflects the persisted provider
    default in behavior.
  - Installed 0.2.15 candidate and `/Applications/Atelier.app` match on version,
    executable SHA-256, codesign, and renderer-ready receipt.

## Main Risks

- Over-broad phrase matching could block legitimate security work. Clause-local
  negation and policy-oriented test cases are therefore mandatory.
- Removing raw Full can surprise an existing session. Legacy migration must be
  automatic and the UI wording must explain that guardrails remain active.
- Preview capability loading must fail closed without hiding inspection of an
  already-running external localhost service.

## Out of Scope / Next Milestones

- P1: app-owned action/tool proxy with scoped one-use approval receipts. This is
  required before phrase matching can be treated as an action-level guarantee.
- Durable Stella job IDs, journal streaming, cancel/resume, and restart
  reattachment.
- Structured-agent process reattachment and backend conversation storage.
- Provider manifest consolidation and full workbench modularization.

## Verified Outcome

- Atelier `0.2.14` passes 230 all-feature Rust tests with 3 ignored, 23 Orca
  contract smokes across 10 removable features, strict all-target/all-feature
  Clippy, production build gates, format/diff checks, `npm audit` with 0
  vulnerabilities, and RustSec with 0 known vulnerabilities plus 18
  unmaintained and 2 unsound upstream warnings.
- Basic is the default permission. Auto retains sandbox and approval behavior;
  visible and raw Full bypass paths are removed.
- Managed Basic/Auto is provider-capability scoped: Claude/Codex retain their
  existing paths; Hermes/Gajaecode require verified Atelier-managed runtimes,
  isolated skills, and the macOS sandbox. Direct CLI remains separate.
- Managed preview start is fail-closed; trusted external localhost inspection
  remains available.
- Frontend and Rust behavior is covered by a shared prompt guard corpus. The
  corpus reduces drift but does not turn a phrase denylist into a complete
  security boundary.
- Verdict: `supervised local candidate, public release blocked`.
- This cycle did not publish, publicly sign, notarize, or deploy an artifact.
- The provider-capability change is included in the full source-gate receipt.
- The locally signed `0.2.14` candidate is installed and verified separately
  from source truth: candidate/installed executable hashes match, codesign
  passes, and renderer readiness reports `ready`.
- Developer ID signing, notarization, public distribution, and physical Windows
  proof remain unclaimed.

---

# Feature Plan: Reproducible Managed Provider Runtime

Last updated: 2026-07-26 KST

Status: implementation-in-progress; runtime/bootstrap verified, provider default
model settings and Codex bridge parity pending installed proof

## Goal

A company user installs Atelier on a new Mac and can immediately select Hermes
or Gajaecode without a separate CLI or skill installation. Atelier prepares the
same pinned runtime, default skills, policy, and isolated provider home for
every user. Account authentication and API entitlement remain user-specific.

## Historical Starting Facts

- At the start, Gajaecode `0.11.6` was installed while Atelier pinned `0.11.7`;
  the installed check did not reject this mismatch.
- Gajaecode had embedded default skills and supported `gjc setup defaults`, but
  Atelier neither ran that setup nor auto-installed Gajaecode on first use.
- Gajaecode's canonical skill root is `.gjc/agent/skills`; the starting
  `.gjc/skills` paths are not the CLI contract.
- Selecting a Codex-backed model in a Gajaecode task previously routed execution
  to native Codex, breaking Gajaecode session and skill ownership.
- Hermes previously fell back to a personal global installation, profile,
  configuration, and skills when no Atelier-managed runtime existed.
- Neither CLI alone can enforce Atelier's Basic/Auto workspace boundary.
  Gajaecode tool allowlists and Hermes toolsets are not OS isolation.
- `/usr/bin/sandbox-exec` is available on the current macOS target and can
  contain child processes, including provider tool subprocesses.

## Work Items

### R1 — Pinned isolated runtime readiness

- Require Atelier-managed Hermes and Gajaecode executables for managed tasks.
- Verify exact pinned version/commit instead of accepting any executable that
  answers `--version`.
- Auto-install or repair a missing/mismatched runtime before the first managed
  task. This online first-run must not require a separate user installation
  step.
- Force provider-specific HOME/config roots under Atelier Application Support.
- Seed and verify bundled default skills in those isolated roots.
- Do not copy or import personal global Codex, Claude, Hermes, Gajaecode, or
  Atelier skills.

### R2 — Workspace-contained managed execution

- Wrap managed Hermes and Gajaecode process trees in an Atelier-owned macOS
  sandbox.
- Basic: read the selected workspace but deny workspace writes.
- Auto: allow writes only to the selected task workspace and provider-owned
  runtime/state paths.
- Deny access to unrelated user paths and retain network/process access needed
  by the provider runtime.
- Keep Full/bypass/yolo/oneshot paths prohibited.
- Preserve turn lifecycle, cancellation, worktree isolation, prompt preflight,
  and provider output normalization.

### R3 — Gajaecode execution and skill ownership

- A Gajaecode task always executes through isolated GJC, including when its
  internal model provider is Codex.
- Keep GJC/Team/RLM direct workflows separate and unchanged.
- Use the canonical `.gjc/agent/skills` path and run `gjc setup defaults` in the
  same isolated environment after installation.
- Basic additionally limits built-in tools to the confirmed read/search/find
  set; the OS sandbox remains the actual path boundary.

### R4 — Hermes execution and skill ownership

- Remove global Hermes fallback for managed tasks.
- Set an Atelier-owned `HERMES_HOME`, disable personal config/rules/plugins/MCP,
  and allow only explicitly selected Atelier-managed Hermes skills.
- Trigger and verify Hermes bundled-skill synchronization before readiness.
- Do not use `--yolo`, `--oneshot`, or any approval-bypass path.

### R5 — Identity-correct readiness UX

- Re-enable the natural-language composer only after the selected adapter route
  is ready or can be repaired automatically.
- Display adapter, internal model provider, execution controller, and skill
  owner as separate concepts.
- Replace the blanket blocking banner with bounded preparation progress or a
  user-specific authentication/API entitlement message.
- Keep the permission picker aligned with the OS-enforced Basic/Auto policy.

### R6 — Provider-model default parity (settings + installed proof)

- Add settings UI for Hermes provider defaults and Gajae internal model provider.
- Route saved default values into new session creation only.
- Preserve existing sessions unless profile/model flags are explicitly set.
- Inject Gajae Codex access token to GJC child-env only when selected; no token
  migration into provider DB, refresh-token, or global skill/config import.
- Revalidate in installed-App flow: reopen installed app, open Connections, change
  model preference, create new session, and assert model/provider mapping.

Acceptance:

- New-session defaults from settings match composer model route.
- Invalid or missing persisted provider key falls back to contract default safely.
- Missing/expired auth surfaces explicit user-facing status without hidden fallback.

## Acceptance Criteria

- An empty simulated Atelier Application Support root can bootstrap the exact
  pinned Hermes/Gajaecode runtimes and default skills without reading personal
  global provider state.
- No manual CLI or skill installation is required; first-run network download
  is allowed and reported truthfully.
- Gajaecode+Codex invokes GJC, not native Codex, and resolves only Gajaecode
  skills.
- Hermes resolves only the Atelier-managed runtime/home/skills for managed
  tasks.
- Basic denies a write outside and inside the selected workspace while allowing
  workspace reads.
- Auto allows a write inside the selected workspace and denies an unrelated
  user-path write.
- Both providers can begin, stream, stop, and finish through the common
  lifecycle.
- Focused tests, production build, all-feature Rust tests, strict Clippy,
  security audit, installed-app renderer proof, and visible UI interaction
  checks pass.

## Explicit Non-Claims

- This cycle does not claim offline first-run because Bun/Gajaecode and
  Python/uv/Hermes payloads are not yet shipped as app resources.
- Provider authentication and paid/API entitlement are not bundled.
- macOS workspace sandboxing does not create Windows/Linux parity.
- The provider-native agent is still not an app-owned structured tool proxy;
  the existing P1 approval-receipt milestone remains open.

## Verified Outcome

- Exact managed versions and skill counts: Gajaecode 0.11.7, Bun 1.3.14, four
  defaults; Hermes pinned commit `3ef6bbd…`, 453 durable files, 73 installed
  skills.
- Installed 0.2.14 UI preparation/repair passes for both providers without a
  separate CLI or skill installation.
- Candidate/installed hash equality, local codesign, renderer readiness, Rust
  230/0/3, strict Clippy, build, audits, and Orca 23/10 pass.
- A separate clean company Mac and authenticated provider response remain
  validation, not an implementation blocker.
