# Orca-Informed Atelier Upgrade Roadmap

Last updated: 2026-07-17

## Decision

Atelier will adopt proven Orca runtime patterns without becoming an Orca fork.
The existing Tauri/Rust shell, structured agent workspace, Stella Mode,
preview/review surfaces, updater identity, and user-facing workflows remain the
product foundation.

Orca is used as a reference for PTY lifecycle, output backpressure, hidden
session handling, agent interoperability, worktree isolation, hooks, and remote
continuity. Electron-specific implementation and default unrestricted execution
are not copied.

## User-Facing Feature Truth

The earlier roadmap over-reported Orca adoption by counting runtime foundations
and pure-function smoke tests as complete product workflows. The 2026-07-13
source, package, and installed-app audit is recorded in
`orca-parity-audit-2026-07-13.md`. The corrected truth is:

| Orca capability | Atelier status | Verified boundary |
|---|---|---|
| Detached PTY ownership and reattachment | Validated foundation | A real supervisor smoke reconnects three live sessions and the Rust supervisor tests pass. Physical Windows remains externally gated. |
| One prompt across isolated worktrees | Functional beta | Concurrent dispatch and isolated worktree UI exist. Rust isolation tests pass, but there is no installed-app end-to-end receipt for the complete fan-out flow. |
| Compare parallel candidates | Functional beta | Candidate state, branch, and changed-file summaries exist in the workspace UI. Selection and comparison have no frontend end-to-end test. |
| Adopt a winner without overwriting source edits | Functional beta | Conflict-checked patch adoption is covered by Rust tests. The UI handoff is not yet covered by an installed-app user-flow test. Automatic merge and commit remain prohibited. |
| Persistent terminal splits | Isolated from release UI | Split primitives remain in source, but the release UI deliberately exposes one global Terminal workspace. The duplicate task-workspace terminal entry is removed, hidden renderers are deferred until measurable, and browser smoke covers Sessions-to-Terminal activation plus restart recovery. |
| Quick Open | Functional beta | One palette now searches persisted sessions, active task/worktree files, and workspace commands. Agents, branches, and repository symbols remain pending. |
| Preview inspection and element selection | Prototype | Localhost preview evidence and a bounded picker contract exist. The picker smoke uses fabricated data; the current suite has no repeatable installed-app click-to-element end-to-end gate. |
| Line-level diff annotations | Partial implementation | Diff parsing, annotation state, and prompt formatting exist. The smoke is parser-only and the full add-resolve-send UI flow has no frontend end-to-end test. |
| Integrated file editor | Functional beta | The central workspace now has a task-rooted file tree, recursive file search, persistent multi-tab drafts, dirty-close protection, direct diff navigation, and explicit safe save. Syntax services, diagnostics, autosave, and conflict-aware reload remain pending. |
| Source-control workspace | Functional beta | Changed files and unified diffs are first-class workspace views with index/worktree state, stage, unstage, branch/upstream metadata, ahead/behind counts, recent history, and explicit manual commit. Conflict resolution, safe undo, and frontend E2E remain pending. |
| GitHub and Linear workflows | Implemented, approval-gated | Read surfaces and typed mutations are independent modules. Every mutation uses an exact, expiring, one-use approval and private receipt. |
| SSH worktrees and port forwarding | Implemented, approval-gated | Host-key trust is explicit, tunnels bind to loopback, and remote worktree creation uses a typed preview and one-use approval. No physical remote host was mutated in validation. |
| Provider usage surfaces | Implemented within documented limits | OpenRouter uses its documented key endpoint on explicit refresh. Claude and Codex expose official CLI/connection state because subscription quota APIs are not documented. |
| Public Atelier automation CLI | Implemented | The signed executable supports bounded status, snapshot, verification, task dispatch, cancellation, and worktree commands without arbitrary shell input. |
| Rich repository previews | Implemented | Markdown, bounded repository text, images, and PDF previews are workspace-scoped and independent from localhost app preview ownership. |
| Notifications, mobile continuity, and Computer Use | Implemented as opt-in modules | Notifications are opt-in. LAN mobile control requires TLS and device pairing. Follow-ups and the three-action Computer Use allowlist require desktop approval; physical Windows remains externally gated. |

This table is the release truth. A runtime primitive is not counted as an
adopted Orca feature until a user can invoke it in Atelier, the complete flow is
covered by a representative test, and the installed application supplies a
runtime receipt or physical-platform observation.

## Non-Negotiable Safety Boundary

- Default execution stays workspace-scoped and reviewable.
- Database deletion, user-data deletion, production deployment, paid actions,
  credential exposure, and external publication require explicit approval.
- Provider CLIs own subscription authentication and provider model discovery.
  Atelier may orchestrate those flows but must not emulate private OAuth
  protocols or read another app's credentials directly.
- Full permission remains an explicit opt-in, never the default.

## Track A: Runtime Plane

### A1. Bounded PTY output transport

Status: implemented and macOS package validated in 0.1.83.

- Read PTY output in 8 KiB chunks.
- Use a bounded native queue to apply producer-side backpressure.
- Coalesce output up to 64 KiB or 8 ms before crossing the Tauri event bridge.
- Preserve append-only session logs even if the renderer disappears.
- Decode each frontend batch once while xterm keeps receiving the original
  bytes.

Done when sustained-output tests preserve exact byte order, the full Rust and
frontend suites pass, and the installed app handles burst output without input
lag or unbounded memory growth.

### A2. Observable session transport

Status: implemented and release-gated in 0.1.84.

- Stable session identifiers independent of visible tabs.
- Per-session queue depth, emitted bytes, dropped bytes, and last-activity
  diagnostics.
- Snapshot and acknowledgement protocol for warm renderer reattachment.
- Hidden sessions remain alive with reduced rendering work.

The runtime publishes stable PTY/log IDs, bytes read/emitted, current and
maximum queued bytes, batch count, bridge-dropped bytes, start time, last
activity, and replay snapshot metadata. Output frames are sequence-numbered,
the renderer acknowledges applied frames, gaps recover through a bounded
snapshot, and a renderer reload can reclaim the existing live PTY without
spawning a duplicate process.

### A3. Detached PTY supervisor

Status: implemented, macOS package-validated, and Windows cross-target linked
in 0.1.89; physical Windows validation remains a release gate.

- Move long-lived PTY ownership behind a small local supervisor process.
- Reattach after renderer reload and application shell restart.
- Keep process termination explicit and scoped to the owned process tree.
- Restore terminal state from a snapshot plus append-only output tail.

The supervisor reuses the signed Atelier executable in a headless mode instead
of shipping a second helper binary. It binds only to loopback, authenticates
each request with a user-private random token, survives the app shell process,
and exits after an idle period with no running sessions. If it cannot start,
Atelier retains the previous in-process PTY path as a visible-log fallback.

## Track B: Agent Interoperability

Status: normalized lifecycle implemented in 0.1.86 and revalidated in the
installed macOS 0.1.92 package and Windows cross-target release build.

Introduce one `AgentAdapter` registry for Claude Code, Codex, Hermes, and Gajae
Code. Each adapter owns detection, platform-specific launch resolution, prompt
delivery, readiness, resumability, cancellation, hooks, authentication owner,
and model-capability discovery.

The shared registry centralizes provider identity, CLI identity,
authentication ownership, resume support, model-catalog support, and permission
support. A common adapter dispatches all four providers and publishes a
per-turn ordered lifecycle while retaining provider-specific raw logs. Terminal
state is exactly once: late output cannot turn a completed, failed, or cancelled
turn back into a running task.

Normalize provider output into these lifecycle events:

- `started`
- `output`
- `tool_started`
- `waiting_for_user`
- `completed`
- `failed`
- `cancelled`

Provider-specific text remains available in raw logs but does not directly
drive task completion UI.

Claude subscription automation follows the provider-owned boundary: Atelier
invokes the official `claude setup-token` command when the user explicitly
reconnects, stores only the resulting inference token in its own keychain item,
and injects it into direct Claude or isolated Gajae child processes. Atelier
does not read Claude Code's credential store, retain Claude refresh tokens, or
call Anthropic's private OAuth token endpoint.

Cross-platform browser activation uses trusted system paths only. Windows
creates a dedicated COM STA and uses `ShellExecuteExW` with
`SEE_MASK_NOASYNC`, so Tauri MTA workers cannot silently inherit an
incompatible apartment model. Codex device authorization exposes and pre-opens
its validated public device page, and the physical Windows smoke can call the
exact native handoff through the Atelier executable instead of substituting a
PowerShell-only test.
Installed macOS 0.2.5 and both Windows cross-target binaries now use the signed
Atelier executable itself as the provider CLI `BROWSER` helper. The headless
entry point accepts only allowlisted Claude/Codex HTTPS login URLs, invokes the
same native activation chain, and exits before the Tauri webview starts. This
is source and binary-presence evidence; visible browser appearance and completed
authentication on physical Windows remain mandatory external receipts.
OAuth URLs are not opened from an unterminated PTY chunk; this prevents a long
Claude URL from losing trailing state, challenge, or redirect parameters. If
the native path rejects a validated provider URL, the packaged UI can use the
independent Tauri OS-open path under the same HTTPS host allowlist.
The strict physical gate then re-queries both provider CLIs and rejects a run
unless Codex and Claude are authenticated after the interactive flow.
The same gate now records the installed executable version and Authenticode
status, restarts that exact executable, and captures the Windows Smart App
Control state before accepting the device as release evidence.
Those physical checks now have first-class in-app counterparts: Settings shows
runtime identity, native browser-handoff method, and read-only Smart App Control
state, while Connections can probe the exact fixed Claude/Codex public URL
handoff without launching an authentication transaction. A successful native
return remains transport evidence only; visible browser appearance and completed
login still require a physical Windows observation.

Codex's live model cache is also treated as execution metadata rather than a
display-only list. Supported reasoning levels are passed to the frontend and
normalized again in the Rust adapter. Models advertising native `ultra`
automatically enable `multi_agent_v2`; older models receive a supported effort
instead of inheriting an invalid global setting. Real smokes cover Claude,
Codex Ultra Code, and Hermes provider paths.

## Track C: Work Isolation and Review

Status: optional product integration implemented in 0.1.86 and revalidated in
the installed macOS 0.1.89 package and Windows cross-target release build.

- Optional per-task Git worktree, never mandatory for simple chat.
- Branch and changed-file identity attached to the task.
- Diff, review, undo, and integration evidence share one task ledger.
- Existing user changes are preserved and never reset by automation.

The composer exposes an explicit worktree toggle and `/isolation` command.
Isolated worktrees live under Atelier's application-data directory rather than
inside the user's repository. Reusing a task reuses its branch and worktree;
Atelier never resets, merges, or removes the user's production worktree.

Completed candidates can now be adopted only through an explicit confirmation
surface. Atelier verifies the Git common directory, expected task branch, base
commit, and source conflict state; computes tracked, untracked, and binary
changes through an alternate index; runs a dry conflict check; then applies the
patch without staging or committing source work. A private patch receipt is
retained for inspection. Conflicting candidates are refused without changing
the source workspace.

## Track D: Preview and Design Inspection

Status: task evidence integration implemented in 0.1.86, extended in the
installed macOS 0.1.92 package with bounded HTTP/server evidence, and extended
again in installed macOS 0.1.97 with bounded, redacted console/runtime/network
metadata. Installed macOS 0.1.98 removes the manual-inspection prerequisite by
arming the matching preview bridge in the background and capturing the full
evidence bundle when each provider turn completes. Durable full-waterfall
archival remains a later inspection extension.

Installed macOS 0.2.2 preserves the same bounded capture for failed provider
turns and adds explicit visual selection after the evidence contract stabilized.
The picker supplies only a safe selector, shallow markup, viewport geometry,
and allowlisted computed CSS. Explicit stop and interrupt actions still
suppress final inspection so a user cancellation cannot trigger unexpected
follow-up work.

- Keep localhost-only automatic preview access.
- Attach console, network, DOM, screenshot, and server-process evidence to the
  active task.
- Make preview-server lifecycle owned by the task runtime so closing a terminal
  tab cannot silently kill the preview.
- Keep visual selection user-invoked, cancellable, localhost-only, and attached
  to the next request through the existing queue and permission boundaries.

Successful turns now attach localhost health, HTTP status and bounded response
body, page title or error, managed preview-service PID/restart/error state,
recent redacted server output, and recent preview-bridge DOM/screenshot evidence
to the same task response. When worktree isolation is active, managed preview
starts from the isolated working directory even if preview starts before the
first agent turn. Final evidence is URL-bound so stale bridge results cannot be
reused after the preview address changes. Backend output is redacted before it
is stored or emitted; the frontend repeats redaction before persistence and
provider context assembly. The browser bridge now also retains bounded
warning/error console entries, runtime errors, resource status/timing metadata,
and resource failures. URL user info, query strings, fragments, and credential
patterns are removed before task storage; bodies, headers, cookies, and browser
storage are never read.

## Track E: Remote Continuity

Status: implemented as an optional, fail-closed continuity plane in 0.2.9.

- Mobile control starts disabled and read-only.
- Loopback uses HTTP; LAN binding requires a private address and HTTPS with a
  private self-signed certificate whose SHA-256 fingerprint is shown in the UI.
- Pairing is short-lived and one-use; devices are individually revocable.
- A paired device may propose a follow-up only after explicit per-device
  permission. The desktop must then approve the exact text before the existing
  task queue receives it.
- Computer Use starts disabled, has a kill switch, and permits only focusing
  Atelier, opening an HTTPS browser URL, or opening a loopback preview URL.
- There is no arbitrary remote shell, mouse, keyboard, production deployment,
  data deletion, or credential transfer path.

The source, tests, macOS package, and installed macOS app are reflected. A
physical Windows package/login/update observation remains a separate release
gate and is not inferred from macOS or CI evidence.

## Track F: Integrated Local Workbench

Status: second production slice and its shell-stabilization pass are
implemented, packaged, and installed on macOS in 0.2.8.

Atelier now exposes one compact workbench mode bar inside the structured agent
workspace:

- Conversation preserves the existing task transcript and composer.
- Code opens a task/worktree-rooted file tree, recursive file search, persistent
  multi-tab editor drafts, dirty-close protection, and explicit save.
- Changes opens index/worktree status, staged and unstaged counts, branch and
  upstream metadata, changed-file diffs, recent history, stage/unstage actions,
  and an explicit manual commit form.
- Quick Open uses one `Cmd/Ctrl+P` palette for tasks, task-rooted files, and
  workspace commands including Conversation, Code, Source control, Preview,
  Terminal, and New task.
- Preview is an independent toggle, so code or changes can stay visible beside
  the running application instead of becoming a mutually exclusive tab.
- Terminal opens the existing detached PTY workspace rather than embedding a
  second terminal renderer and destabilizing the proven supervisor path.
- The shell keeps Terminal as one global destination, removes duplicate cwd
  chrome from the task workspace, assigns distinct icons to global and
  workbench actions, and delays hidden terminal initialization until its host
  has measurable dimensions. A resize observer refits visible terminals after
  layout changes.

The file backend remains workspace-scoped, rejects credential-sensitive home
paths, refuses symlink traversal, limits reads and writes to 2 MiB, and uses an
atomic replacement path on Unix. File search skips dependency, build, VCS, and
hidden directories and is bounded by visited and returned-result limits.

Validation evidence for 0.2.8:

- Frontend production build passed.
- All 90 Rust tests passed, including a real temporary Git repository covering
  staged, unstaged, untracked, and history state plus traversal rejection.
- Workbench contract, agent performance, terminal layout, diff review, preview
  URL, updater contract, and release security smokes passed.
- Detached PTY smoke reattached three sessions and measured 100 writes at
  1.283 ms p50 and 1.338 ms p95 on this macOS host.
- The installed app visibly opened Sessions, Code, and Changes at 1600x900. A
  separate 900x720 pass collapsed the left navigation to its compact icon rail
  while retaining the workbench tabs, transcript, and composer without
  incoherent overlap. This does not replace the remaining browser-backed E2E
  gate.
- The signed app and DMG passed bundle verification.
- `/Applications/Atelier.app` was replaced with 0.2.8 after preserving the prior
  bundle as `/tmp/Atelier.app.before-0.2.8-20260714-140509`; packaged and
  installed executable SHA-256 values match at
  `1cf32ddc6dbb47ed5225a65d349bd438032880a7ebd054e5c7a64170c30f59f6`, and
  the installed executable returned a `main` renderer receipt with status
  `ready`.

This slice is intentionally not described as full Orca parity. Remaining P1
work includes syntax-aware editing, diagnostics and autosave, conflict-aware
source-control and safe undo, inline review comments in the central workbench,
Tauri-backed browser E2E coverage, and palette indexes for agents, branches,
and repository symbols.

## Release Gates

Every runtime milestone must pass:

1. Frontend production build and Rust test suite.
2. PTY output flood, cancellation, hidden-session, and restart/reattach tests
   appropriate to the touched stage.
3. Installed macOS app reflection and strict local signature verification.
4. Physical Windows package, browser-auth, update-survival, and Smart App
   Control smoke before claiming Windows completion.
5. SOT evidence separating source truth, package truth, installed-app truth,
   and physical-platform truth.

## Completion Definition

The migration is complete only when Atelier can keep multiple background agent
and terminal sessions alive, resume their state after UI restart, normalize
provider lifecycle events, isolate optional development tasks, inspect the
running preview, and pass macOS plus physical Windows release gates without
weakening the permission model.
