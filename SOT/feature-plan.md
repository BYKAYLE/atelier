# Feature Plan: Runtime Safety and Preview Truth

Last updated: 2026-08-02 KST

Status: P0 and provider-capability gates pass; Hermes rendering/context/runtime
closure is source/build/installed and authenticated managed-path verified at
0.2.20 with provider-neutral terminal-answer and Atelier-supported Gajae update
contract. Gajae authenticated-turn proof remains pending.

## Goal

Make Atelier's current user-visible safety and preview behavior truthful enough
for supervised daily use: no raw provider bypass option, no mixed-negation or
direct-CLI preflight bypass, and no preview Start control when managed preview
execution is intentionally disabled by the backend.

## Work Items

### P1-5 — Mobile reachable pairing and QR — in progress (partial closure)

- Reproduce and correct the loopback-only state that previously advertised
  `127.0.0.1` to a phone while refusing Wi-Fi/Tailscale connections.
- Keep exposure explicit with three modes: current-computer only, one selected
  private LAN address, or Tailscale remote access for Windows/macOS hosts and
  iPhone/Android browsers signed into the same tailnet.
- Advertise only the exact LAN HTTPS endpoint covered by the local certificate
  or the exact tailnet HTTPS endpoint terminated by Tailscale Serve. Funnel and
  public-internet publication are out of scope and must remain disabled.
- Preserve unrelated Tailscale Serve configuration, bind the Tailscale backend
  to loopback, stop only Atelier's exact handler, and retain the five-minute
  one-use pairing/token/revocation contract.
- Render an accessible, local QR code from the exact pairing URL with copy and
  manual-code fallback, expiry handling, and no external QR service.
- Add backend and frontend regression tests, prove both the real LAN HTTPS path
  and the real tailnet-only Serve path, then build/install/visually verify
  `0.2.21` without claiming physical Windows proof.

Current status note:

- Tailnet proof is implemented and verified on-device: remote URL
  `https://kansic-macbookpro.tailb0943d.ts.net:8443/atelier/` is served by
  Tailscale Serve (no Funnel, no public publication), backend remains loopback,
  and unrelated Serve handlers are preserved.
- `app.js` and `/atelier/health` checks pass on the tailnet endpoint; Host/Origin
  API constraints are enforced (invalid calls yield expected rejection status).
- Physical iPhone Safari launch from the pairing URL succeeded with active tailnet
  transfer counters.
- Full all-feature verification is closed at `268` passed and `6` ignored; strict
  all-target/all-feature Clippy, the mobile-control smoke, production frontend
  build, and diff check all pass.
- The foreground Serve lifecycle now uses a parent-bound Unix pipe guard and a
  Windows kill-on-close Job Object. Installed-process SIGTERM proof and the normal
  UI Stop flow both remove the exact handler, close the backend port, and leave
  Serve status `{}`.

Affected surfaces:

- `src-tauri/src/mobile_control.rs`
- `src/components/mobile-control/RemoteAccessSection.tsx`
- `src/components/mobile-control/mobileControl.ts`
- `tools/mobile-control-smoke.ts`
- dependency/version/release evidence as required

### P1-6 — Mobile existing-work continuity — implemented and installed

- Bridge the renderer-owned session store to a native in-memory continuity
  registry using bounded, sanitized session/message projections.
- Show the active and recent Atelier work on the mobile page, including title,
  provider, state, update time, and user/final-assistant conversation, while
  excluding raw events, reasoning/tool output, credentials, provider session
  IDs, attachment paths, and full workspace paths.
- Give every desktop session an opaque persisted mobile task ID. Mobile requests
  carry only that ID, a bounded prompt, an idempotency ID, and the published
  revision; provider/model/workspace/permission remain desktop-owned.
- Require the existing explicit per-device follow-up permission before direct
  continuation, enforce rate limits and idempotency, and fail closed when the
  renderer heartbeat, task mapping, or revision is stale.
- Dispatch the request to the exact existing `AgentSession` queue, preserving
  its provider resume ID and busy/queued behavior. Never fall back to creating a
  new session when the target cannot be resolved.
- Add Rust and source-contract tests for visibility, redaction, IDOR/revision
  rejection, replay handling, and same-session dispatch; then verify through the
  installed app and the physical mobile browser.

Current verified state:

- Installed `0.2.22` preserved the 3 existing desktop sessions and 224 stored
  messages; no local session or message data was reset.
- The live tailnet monitor projection returned 3 tasks and the configured 60
  most recent eligible messages per task, for 180 messages total.
- Runtime assertions confirmed opaque task IDs, basename-only workspace output,
  and absence of internal session IDs, raw execution fields, absolute paths, and
  obvious credential patterns.
- The existing paired phone device is authorized for `task:followup`. Static,
  Rust, and source-contract coverage proves exact-session queue dispatch and no
  new-session fallback. A paid/provider live test instruction was not injected
  into the user's existing task merely for proof.
- Renderer recurrence prevention now keeps one React root, treats background
  failures as non-fatal after the shell commits, catches synchronous mobile
  projection errors, and records a shell-backed readiness heartbeat.
- Candidate/installed SHA-256 equality, local codesign, renderer readiness,
  production build, focused smokes, strict Clippy, format/diff, and all-feature
  Rust `276/0/6` pass.
- A persisted, explicit Tailscale-start preference now restores the tailnet-only
  endpoint after app restart. Explicit Stop disarms restore before cleanup, and
  a real locked-Mac restart returned health `ok` without enabling Funnel.

Affected surfaces:

- `src-tauri/src/mobile_continuity.rs`
- `src-tauri/src/mobile_control.rs`
- `src-tauri/src/lib.rs`
- `src/components/AgentWorkspace.tsx`
- `src/components/mobile-control/RemoteAccessSection.tsx`
- `src/lib/tauri.ts`
- `tools/mobile-control-smoke.ts`

### P1-4 — Remove redundant composer runtime explanation — complete

- Remove the always-visible agent/provider/runtime/skill identity sentence from
  Hermes, Claude, Codex, and Gajae structured composers.
- Remove description-only derivation and copy fields while preserving model and
  provider controls, permissions, primary actions, Stella launch, and actionable
  runtime/authentication banners.
- Lock the absence contract with a focused source smoke, pass the related UI,
  build, Rust, security, and release gates, then install and visually verify the
  locally signed `0.2.20` candidate.

Affected surfaces:

- `src/components/AgentWorkspace.tsx`
- `tools/provider-runtime-identity-smoke.ts`
- release/version metadata and installed-candidate evidence

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

### P0-5 — Hermes verified answer and bounded initial context — complete

- Use Hermes's supported `chat -Q` lifecycle while treating stdout as bounded
  diagnostics, validating the stderr session identity, and selecting only the
  exact new final assistant row from managed state.
- Preserve newline boundaries per stream fragment and render every live
  streaming assistant turn through the plain pre-wrap path.
- Make terminal result/error authoritative for Claude, Hermes, Codex, and
  Gajaecode; streamed drafts and restored orphans remain visibly unverified
  evidence.
- Verify the Atelier-owned 73-skill manifest at readiness, but leave installed
  skills discoverable for on-demand loading instead of eagerly passing all of
  them through `--skills`.
- Grant only literal metadata/existence traversal on managed path ancestors so
  SQLite/WAL opens without widening sibling subtree reads.
- Prove the exact production auth + sandbox + command path with a real managed
  Hermes turn and a read-only SQLite integrity/session check.

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
  - Installed 0.2.19 candidate and `/Applications/Atelier.app` match on
    version, executable SHA-256, codesign, and renderer-ready receipt.

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

- The mobile remote-access proof work moved installed evidence to `0.2.21` with
  remote endpoint checks for `/atelier/`, `app.js`, and `/atelier/health`, plus
  same-tailnet iPhone Safari launch verification. Candidate/installed hash:
  `f03d9cf2c77b9f66cb42579202bd37d0f0e28fd114e075edccb642593b550dfc`.
  The final all-feature, strict Clippy, frontend smoke/build, installed renderer,
  normal Stop, and SIGTERM lifecycle gates are closed. Physical Windows,
  off-LAN cellular, notarization, and public distribution remain unclaimed.

---

# Feature Plan: Reproducible Managed Provider Runtime

Last updated: 2026-08-02 KST

Status: runtime/bootstrap, provider defaults, and Hermes authenticated managed
turn verified; Gajae authenticated-turn remains pending, but managed Gajae
update contract now matches Atelier-supported pin `0.12.8` in source/installed.

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
  verify the Atelier-managed skill inventory, and let Hermes discover those
  installed skills on demand without eager whole-inventory prompt preload.
- Trigger and verify Hermes bundled-skill synchronization before readiness.
- Use `chat -Q` as the structured answer contract; never parse the human TUI
  transcript into assistant text.
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

- Exact managed versions and skill counts: Gajaecode 0.12.8, Bun 1.3.14, four
  defaults; Hermes pinned commit `3ef6bbd…`, 453 durable files, 73 installed
  skills.
- Installed 0.2.19 preparation/repair passes for both providers without a
  separate CLI or skill installation.
- Candidate/installed executable SHA-256 equality at
  `a72a251ff88977a22bb1e6720db64e47863bc7d9182dc8c06e3ebd5cdcbe2754`,
  local codesign, renderer readiness, Rust 254/0/6, strict Clippy, build,
  release audit, and Orca 24/10 pass.
- The real managed Gajaecode update changed `0.11.7` to `0.12.8`, kept Bun
  `1.3.14` and four defaults ready, returned `update_available: false` from the
  separate status check, and preserved identical hashes for all nine
  DB/WAL/SHM files.
- A real Atelier-managed Hermes turn passed by rejecting 24 untrusted stdout
  bytes and returning the 23-byte verified final state answer. The reproduced
  13,112-character historical record recovers its final display without
  `Planning`/`****` blocks or stored-data mutation.
- A separate clean company Mac and authenticated Gajae provider response remain
  validation, not implementation blockers.
