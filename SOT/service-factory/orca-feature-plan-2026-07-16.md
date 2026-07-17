# Orca capability adoption plan

Status: active execution plan
Baseline: Atelier 0.2.9
Reference: `stablyai/orca` public feature surface as of 2026-07-16

## Product rule

Atelier adopts useful Orca workflows without becoming an Orca clone. Every new
capability is independently owned, tested, and removable. `AgentWorkspace.tsx`
remains a composition root and receives only stable inputs and callbacks.

## Existing capability map

| Capability | Current Atelier truth | Action |
| --- | --- | --- |
| Structured CLI agents | Claude, Codex, Hermes, and Gajae adapters exist | Harden, do not replace |
| Detached PTY and restart recovery | Validated foundation | Keep one global Terminal surface |
| Parallel worktrees | Functional beta | Add installed-app flow receipts |
| Code and source control workbench | Functional beta | Add diagnostics and conflict-aware reload |
| Quick Open | Tasks, files, and workspace commands | Extend to branches, symbols, and agent actions |
| Preview and element selection | Localhost evidence plus prototype picker | Add rich file previews and full E2E proof |
| Diff annotations | Partial implementation | Complete add-resolve-send workflow |

## Phase 1 - Local control plane

Independent modules:

1. `session-inbox`: running, attention, completion, durable unread, and manual
   mark-unread filtering.
2. `desktop-notifications`: optional completion and attention notifications,
   driven only by normalized lifecycle events.
3. `quick-open-index`: branches, repository symbols, worktrees, and agent
   actions behind one bounded search contract.
4. `rich-preview`: Markdown, image, PDF, and repository-document previews with
   file-size and workspace boundaries.

Exit criteria: inactive work is observable without opening raw logs, and every
state can be reproduced by a focused contract test.

## Phase 2 - Review and orchestration

Independent modules:

1. `review-workflow`: complete line-comment, resolve, resend, and evidence flow.
2. `agent-fleet`: fan-out presets, candidate comparison, stop-all, and explicit
   winner adoption receipts.
3. `editor-diagnostics`: diagnostics, explicit autosave policy, and
   conflict-aware reload.
4. `atelier-cli`: supported local commands for task dispatch, worktree create,
   status, snapshot, and verification.

Exit criteria: a user can dispatch, compare, review, and safely adopt a result
without leaving Atelier or mutating the source worktree implicitly.

## Phase 3 - External and remote workflows

Independent modules:

1. `github-workflows`: issues, pull requests, checks, and review handoff.
2. `ssh-workspaces`: host registry, host-key trust, reconnect, remote worktrees,
   and explicit port forwarding.
3. `provider-usage`: documented provider usage and reset-time surfaces only;
   no credential scraping or private OAuth emulation.
4. `linear-workflows`: added only after GitHub and local review are stable.

Exit criteria: every external or remote action is explicit, auditable,
revocable, and permission-scoped.

## Phase 4 - Optional continuity

Independent modules:

1. `mobile-pairing`: encrypted device pairing, revocation, and command approval.
2. `remote-steering`: read-only monitoring first, then bounded follow-up input.
3. `computer-use`: visible, consented actions with receipts and a kill switch.

Exit criteria: no remote command can bypass desktop approval, workspace scope,
or the existing safety boundary.

## Safety boundary

- Database deletion, user-data deletion, production deployment, paid actions,
  credential exposure, external publication, auto-merge, and auto-commit remain
  prohibited without explicit approval.
- Provider CLIs continue to own subscription authentication and model catalogs.
- Optional dependencies use capability checks and fail closed.
- New-feature patches and existing-feature enhancements remain separate lanes.

## Implementation receipt

The first Phase 1 slice is implemented as the independent `session-inbox`
module. It provides running, attention, and unread filters; durable read
receipts; manual mark-unread; and distinct running, attention, and unread
indicators. It does not alter provider execution, PTY ownership, session
persistence, or worktree behavior.

Validation on 2026-07-16:

- session inbox state smoke: passed
- workbench contract smoke: passed
- composer performance smoke: passed
- production renderer build: passed
- Rust backend tests: 96 passed
- signed macOS bundle and installed renderer receipt: passed

The second Phase 1 slice is implemented as the independent
`desktop-notifications` module. Notifications are opt-in, request OS permission
only from the user's toggle, ignore restored history, de-duplicate stable states,
and fire only when a task changes to completed or needs-attention while it is not
the foreground task. Provider execution and raw terminal output remain outside
the module.

Validation on 2026-07-16:

- desktop notification transition smoke: passed
- session inbox regression smoke: passed
- workbench independent-module contract smoke: passed
- agent composer performance smoke: passed
- Gajae command routing smoke: passed
- terminal layout smoke: passed
- preview URL smoke: 9 passed
- diff review smoke: passed
- production renderer build: passed
- Rust backend tests: 96 passed
- Rust formatting check: passed
- Rust Clippy: passed after excluding the pre-existing `run_gajecode` and
  `run_gajecode_inner` argument-count lint; strict `-D warnings` still records
  those two existing findings as cleanup debt
- signed macOS app and DMG verification: passed
- `/Applications/Atelier.app` executable hash matches the packaged app: passed
- installed renderer receipt: version `0.2.9`, installed executable path,
  `main` window, and `ready` state confirmed
- installed UI inspection: notification toggle fits the Session Inbox toolbar
  and remains off by default without requesting permission on launch

The third Phase 1 slice is implemented as the independent `quick-open-index`
module. The existing command, task, and workspace-file results now share one
ranked search surface with repository symbols, local branches, and worktrees.
Selecting a symbol opens the exact file and line. Selecting a worktree opens a
matching task when one exists or changes the active workspace root for review.
Selecting a branch opens its matching task or Source Control; it never checks
out, creates, deletes, or otherwise mutates a branch or worktree.

The Rust index is read-only and bounded. It skips hidden, generated, oversized,
and credential-like paths; caps source files, bytes, symbols, and result counts;
runs the blocking scan outside the async command path; and keeps a short-lived
15-second workspace cache. The TypeScript result merger and scoring rules live
in a removable frontend module instead of `AgentWorkspace.tsx`.

Validation on 2026-07-16:

- quick-open scoring, category merge, symbol-line, and path smoke: passed
- workbench independent-module and read-only Git contract smoke: passed
- session inbox and desktop notification regression smokes: passed
- agent composer performance smoke: passed
- Gajae command routing smoke: passed
- terminal layout smoke: passed
- preview URL smoke: 9 passed
- diff review smoke: passed
- production renderer build: passed
- Rust backend tests: 100 passed
- Rust formatting check: passed
- Rust Clippy with the two recorded pre-existing argument-count findings
  excluded: passed
- signed macOS app and DMG verification: passed
- `/Applications/Atelier.app` executable hash matches the packaged app: passed
- installed renderer receipt: version `0.2.9`, installed executable path,
  `main` window, and `ready` state confirmed
- Quick Open Playwright inspection at 1440x900 and 760x640: passed with no
  horizontal overflow or overlapping command rows

The fourth Phase 1 slice is implemented as the independent `rich-preview`
module. Quick Open and the Code workbench now render Markdown, repository text,
local raster images, and PDF files without routing binary files through the
UTF-8 editor. Markdown opens in preview mode by default and can return to the
editor without losing its tab. Image and PDF tabs remain read-only previews.

This is intentionally separate from the existing localhost app preview. The
rich-preview module owns repository files only; it does not start, stop, probe,
or navigate a development server. The Rust reader canonicalizes the active
workspace and target, rejects sibling and credential-like paths, bounds source
and rendered bytes, and performs blocking I/O outside the async command path.
Remote Markdown links and embedded images are not fetched automatically.

Validation on 2026-07-16:

- rich-preview classification, byte formatting, and base64 smoke: passed
- Rust workspace-boundary, credential-path, UTF-8, and size-limit tests: passed
- workbench binary UTF-8 bypass and independent ownership contract: passed
- quick-open index regression smoke: passed
- session inbox and desktop notification regression smokes: passed
- agent composer performance smoke: passed
- Gajae command routing smoke: passed
- terminal layout smoke: passed
- preview URL smoke: 9 passed
- diff review smoke: passed
- production renderer build: passed
- Rust backend tests: 106 passed
- Rust formatting and Clippy checks: passed
- Playwright Markdown inspection at 1440x900 and 720x620: passed with no page
  overflow or component errors
- Playwright image inspection at 1100x720: passed with the 960x540 source
  decoded and rendered at its natural aspect ratio
- signed macOS app and DMG verification: passed
- `/Applications/Atelier.app` executable SHA-256 matches the packaged app:
  `0b45d255ea1b137d2f759017bfd53627f7f2a90172ced90f39dde7ba7a14036c`
- installed renderer receipt: version `0.2.9`, executable path
  `/Applications/Atelier.app/Contents/MacOS/atelier`, `main` window, and `ready`
  state confirmed

Phase 1 exit status: implemented, regression-verified, packaged, and reflected
in the installed macOS app.

The first Phase 2 slice is implemented as the independent `review-workflow`
module. Line comments now have a durable dispatch lifecycle (`queued`,
`running`, `responded`, `failed`, and `cancelled`), bounded response evidence,
retry attempts, and unsent-comment detection. Sending a review creates an
isolated queued turn and does not consume text or attachments waiting in the
main composer. A pending dispatch cannot be sent twice, and an interrupted
running receipt is marked cancelled on restart instead of being presented as a
successful response.

Review comments remain manually resolved. A provider response is evidence that
the request returned, not proof that every line comment was correctly applied.
Provider cooldown retries and the existing task queue remain the execution
owners; the review module records transitions without creating a second agent
runtime.

Source and build validation on 2026-07-16:

- review lifecycle, retry, bounded evidence, and unsent-comment smoke: passed
- diff review regression smoke: passed
- workbench independent ownership and duplicate-pending contract: passed
- session inbox, desktop notifications, quick-open, rich-preview, Gajae
  routing, terminal layout, preview URL, and composer performance smokes:
  passed
- production renderer build: passed
- Playwright review status inspection at 1440x1000 and 820x760: passed with no
  horizontal overflow; response evidence expanded correctly at both widths
- Rust formatting check: passed
- strict Rust Clippy with `-D warnings`: passed; the prior Gajae argument-count
  cleanup debt was removed by passing the existing adapter request structure
  through the Gajae boundary
- Rust backend tests: 106 passed
- release credential, target dependency, and RustSec audit: passed with 0 known
  vulnerabilities; upstream unmaintained and unsound advisories remain recorded
- whitespace/error-marker check (`git diff --check`): passed

Installed-app reflection on 2026-07-16:

- signed macOS app and DMG verification: passed
- packaged and installed executable SHA-256 match:
  `474d8cc7b8ca2ce0d39590a684e5ea4e026709734971ad543057be63dbd5d66d`
- installed bundle signature: valid and satisfies its designated requirement
- installed renderer receipt: version `0.2.9`, executable path
  `/Applications/Atelier.app/Contents/MacOS/atelier`, `main` window, and `ready`
  state confirmed
- installed app visual inspection: existing user sessions remained available and
  the main workspace rendered without a blank or broken window

The second Phase 2 slice is implemented as the independent `agent-fleet`
module. The fleet panel compares bounded profile candidates and can launch the
existing profile-backed agent runtime with the `core`, `balanced`, or `all`
preset. Candidate work remains isolated until the user explicitly adopts it.

Adoption is fail-closed. A durable receipt records `verifying`, `adopted`,
`failed`, or `cancelled`; an interrupted `verifying` receipt becomes
`cancelled` on restart rather than looking successful. The existing Rust
adoption command validates the canonical repository and base/head relationship,
uses an isolated temporary Git index, refuses conflicts, runs `git apply
--check`, bounds the patch to 64 MiB, and stores the receipt with mode 0600.
Stopping the fleet or retrying failed/cancelled adoption remains explicit.

Source and build validation on 2026-07-16:

- agent-fleet preset, lifecycle, migration, retry, and fail-closed restart
  smoke: passed
- workbench independent-module and adoption-boundary contracts: passed
- review workflow, session inbox, desktop notification, quick-open,
  rich-preview, diff-review, agent-performance, Gajae routing, terminal layout,
  and preview URL regression smokes: passed
- production renderer build: passed
- Rust backend tests: 106 passed
- Rust formatting check: passed
- strict Rust Clippy with `-D warnings`: passed
- release credential, target dependency, and RustSec audit: passed with 0 known
  vulnerabilities; upstream unmaintained and unsound advisories remain recorded
- Playwright inspection at desktop and compact widths: passed; three candidates
  render in one desktop row, compact cards wrap without body, panel, or launcher
  overflow
- visual evidence: `/tmp/atelier-agent-fleet-desktop.png`,
  `/tmp/atelier-agent-fleet-launcher.png`, and
  `/tmp/atelier-agent-fleet-compact.png`

Installed-app reflection on 2026-07-16:

- signed macOS app and DMG verification: passed
- packaged and installed executable SHA-256 match:
  `cf617602b3d6a09522224bc86831a3e52d6442795ccc427717ad4951816bc43c`
- installed bundle version: `0.2.9`
- installed renderer receipt: process `60809`, executable path
  `/Applications/Atelier.app/Contents/MacOS/atelier`, `main` window, and `ready`
  state confirmed
- installed app was restored from its minimized state and visually inspected;
  existing sessions and the main workspace rendered without a blank window
- installed visual evidence: `/tmp/atelier-installed-agent-fleet.png`

Next Orca adoption slice after installed reflection: Phase 2
`editor-diagnostics`.

The third Phase 2 slice is implemented as the independent
`editor-diagnostics` module. The Code workbench keeps manual save as the
default and offers an explicit delayed autosave policy. Every write compares
the last observed SHA-256 snapshot before changing the file, so an external
edit or delete is surfaced as a conflict instead of being overwritten.

Dirty drafts are preserved when the file changes on disk. A clean tab reloads
automatically, while a dirty tab pauses autosave and offers explicit reload or
keep-edit actions. The diagnostics surface is bounded and currently reports
merge-conflict markers and JSON parse locations. Selecting a diagnostic moves
the editor cursor to the recorded line and column.

The Rust boundary canonicalizes the workspace and target, rejects sibling and
credential-like paths, bounds files to 2 MiB, performs blocking work outside
the async command path, and uses a compare-before-write request. Existing
provider, PTY, worktree, task queue, and preview ownership remain unchanged.

Source and build validation on 2026-07-17:

- editor snapshot, conflict classification, and diagnostics smoke: passed
- workbench independent-module, safe-write, and draft-preservation contracts:
  passed
- review workflow, agent fleet, quick-open, rich-preview, session inbox,
  desktop notification, Gajae routing, terminal layout, preview URL, diff
  review, and composer performance regressions: passed
- production renderer build: passed
- Rust formatting and strict Clippy with `-D warnings`: passed
- Rust backend tests: 107 passed, 0 failed
- release credential, target dependency, and RustSec audit: passed with 0 known
  vulnerabilities; 17 upstream unmaintained and 2 upstream unsound advisories
  remain recorded
- whitespace/error-marker check (`git diff --check`): passed
- desktop and compact Playwright inspection: passed with no body or workbench
  overflow; conflict actions wrap without covering the editor toolbar
- editor visual evidence: `/tmp/atelier-editor-diagnostics-desktop.png` and
  `/tmp/atelier-editor-diagnostics-compact.png`

Installed-app reflection on 2026-07-17:

- signed macOS app and DMG verification: passed
- packaged and installed executable SHA-256 match:
  `fc1ca0b23bd6e7f8982e71664491737562e8e89e275b4bb275c9d78daeefbf34`
- installed bundle version: `0.2.9`
- installed renderer receipt: process `98795`, executable path
  `/Applications/Atelier.app/Contents/MacOS/atelier`, `main` window, and `ready`
  state confirmed
- installed app and Code workbench rendered without a blank or broken window;
  existing user sessions remained available
- installed visual evidence:
  `/tmp/atelier-installed-editor-diagnostics-code.png`
- previous installed bundle backup:
  `/tmp/Atelier.pre-editor-diagnostics.0.2.9.app`

Next Orca adoption slice after installed reflection: Phase 2 `atelier-cli`.

The fourth Phase 2 slice is implemented as the independent `atelier-cli` and
`control-plane` modules. The executable now exposes explicit commands for
version and runtime status, bounded workspace snapshots and verification, task
dispatch and status, cancellation before execution, and isolated worktree
creation. It does not accept an arbitrary shell command.

Mutating requests are serialized into the private, versioned `control/v1`
queue and consumed by the running desktop app. Agent tasks use the existing
provider/profile/model/effort/permission session runtime. Worktree requests use
the existing Rust worktree engine. Both write a terminal success, failure, or
cancelled receipt. Claims record their process ID and timestamp; an abandoned
claim is converted to a failed receipt on the next launch and is not silently
replayed.

Source, build, and live development-app validation on 2026-07-17:

- Atelier CLI schema and frontend request-normalization smoke: passed
- explicit-command and shell-literal Rust tests: passed
- control path traversal, atomic claim, terminal receipt, and abandoned-claim
  recovery tests: passed
- CLI snapshot against the Atelier repository: passed; branch, HEAD, dirty
  file count, package manager, and package scripts were reported
- full CLI to desktop integration: passed using an isolated temporary Git
  repository; request `cff6af61-9478-449d-b3ad-7992d58b8972` created branch
  `atelier/gui-smoke-3e8f3fe1` through the existing worktree engine and wrote a
  succeeded receipt
- production renderer build: passed
- Rust backend tests: 112 passed, 0 failed
- Rust formatting and strict Clippy with `-D warnings`: passed

Installed-app reflection remains intentionally pending until the final unified
macOS and Windows packaging gate. Source/build truth is not being presented as
installed truth.

Next Orca adoption slice: Phase 3 `github-workflows`.

The first Phase 3 slice is implemented as the independent
`github-workflows` module. It reuses the existing Changes workbench instead of
adding a second repository screen. The read path reports the authenticated
GitHub identity, repository, issues, pull requests, review requests, and check
rollups through the installed `gh` CLI without reading token or credential
files.

Every remote mutation is constrained to one of six typed actions: issue create
or comment, pull request create or comment, review submit, and reviewer request.
The backend prepares an exact preview and SHA-256 approval hash with a five
minute expiry. Execution requires that action ID and exact hash, rechecks the
repository, consumes the approval before invoking `gh`, and writes a private
receipt. There is no arbitrary shell input and no background mutation.

Source and build validation on 2026-07-17:

- GitHub draft normalization, reviewer parsing, search, and check-label smoke:
  passed
- allowlist, reviewer validation, JSON parsing, and approval-hash Rust tests:
  5 passed, 0 failed
- production renderer build: passed
- Rust formatting and strict Clippy with `-D warnings`: passed
- live read-only repository probe: `BYKAYLE/atelier`, default branch `main`,
  authenticated repository read succeeded; issue list currently returned zero
  items
- no issue, pull request, review, reviewer, or comment mutation was executed

Installed-app reflection remains pending until the final unified packaging
gate. Source/build truth is not being presented as installed truth.

Next Orca adoption slice: Phase 3 `ssh-workspaces` and `provider-usage`.

The second Phase 3 slice is implemented as the independent `ssh-workspaces`
and `provider-usage` modules. SSH profiles live in Atelier's private control
store and are archived rather than hard-deleted. Connections require an
explicit host-key probe and exact SHA-256 fingerprint approval. Connection
checks use strict host-key verification and non-interactive SSH. Port forwarding
is loopback-only, explicitly started and stopped, and all running tunnel
children are stopped when Atelier exits.

Remote worktree creation accepts only validated paths, refs, and task names.
It produces an exact preview and SHA-256 approval hash with a five-minute
expiry, consumes approval before execution, and never accepts arbitrary local
shell input. The Connections screen exposes profile editing, host-key trust,
connection probes, loopback tunnels, and the final worktree approval without
adding a duplicate top-level navigation surface.

Provider usage is also an explicit user action. Claude and Codex report only
official CLI and connection state because their subscription quotas have no
documented non-interactive API. OpenRouter usage uses its documented
`GET /api/v1/key` endpoint only after the user presses refresh; stored key
material is used inside the backend and is never returned to the renderer.
Hermes and Gajae Code point to their selected backend rather than fabricating a
second quota.

Source and build validation on 2026-07-17:

- SSH validation, task slug, and approval-hash Rust tests: 4 passed, 0 failed
- provider version normalization and documented OpenRouter response parsing
  Rust tests: 2 passed, 0 failed
- SSH workspace and provider usage frontend smokes: passed
- production renderer build: passed
- Rust formatting and strict Clippy with `-D warnings`: passed
- no remote SSH connection, tunnel, worktree creation, or paid provider request
  was executed during validation

Installed-app reflection remains pending until the final unified packaging
gate. Source/build truth is not being presented as installed truth.

Next Orca adoption slice: Phase 3 `linear-workflows`.

The third Phase 3 slice is implemented as the independent `linear-workflows`
module. It is mounted inside the existing Changes workbench so local review,
GitHub, and Linear remain one coherent review surface without duplicating the
top-level navigation.

Linear access uses only the official GraphQL endpoint and a personal API key
stored by Atelier's credential backend. The key is never returned to the
renderer, logs, previews, or receipts. Read operations are explicit refreshes;
there is no polling and no renderer-supplied GraphQL. Remote mutation is limited
to issue creation, issue comments, and status changes. Every mutation requires
an exact preview, a SHA-256 approval hash with a five-minute expiry, a matching
Linear account recheck, and a one-use approval before execution. Private
receipts are written after the attempt. There is no delete operation.

Source and build validation on 2026-07-17:

- Linear snapshot parsing, action allowlist, approval-hash binding, and fixed
  query-variable separation Rust tests: 4 passed, 0 failed
- Linear workflow frontend contract smoke: passed
- production renderer build: passed
- Rust formatting and strict Clippy with `-D warnings`: passed
- no real Linear account read, paid request, issue mutation, comment, or status
  change was executed during validation

Installed-app reflection remains pending until the final unified packaging
gate. Source/build truth is not being presented as installed truth.

Next Orca adoption slice: Phase 4 `mobile-control` pairing and read-only remote
monitoring.

The Phase 4 continuity slice is implemented as the independent
`mobile-control`, `remote-followup`, and `computer-use` modules. Mobile access
starts disabled and read-only. Pairing codes are short-lived and one-use,
paired devices can be revoked, and follow-up permission is granted per device.
Loopback mode remains HTTP; LAN mode is fail-closed unless a private LAN
address is available and then serves HTTPS with a persistent, private
self-signed certificate and a visible SHA-256 fingerprint.

Remote devices can inspect bounded task state and propose follow-up text only.
The desktop user must approve the exact proposal before Atelier queues it
through the existing task dispatch runtime. The approval is one-use and
expires after five minutes. Computer Use remains off by default and accepts
only three typed actions: focus Atelier, open an HTTPS browser URL, or open a
loopback preview URL. It has no arbitrary shell, mouse, or keyboard primitive,
and every execution writes a private receipt.

Unified source and build validation on 2026-07-17:

- all 141 Rust tests passed, including an actual HTTPS mobile `/health` probe
- Rust formatting and strict Clippy with `-D warnings` passed
- frontend production build passed; the existing bundle-size warning remains
  informational
- all 24 focused frontend/runtime smokes passed, including Atelier CLI, GitHub,
  Linear, SSH, provider usage, mobile control, remote follow-up, Computer Use,
  PTY reconnect, updater platforms, workbench, preview, and review flows
- release-target dependency audit reported zero known vulnerabilities for the
  actual macOS and Windows release graphs
- the all-target lockfile audit still reports two `quick-xml` advisories in the
  Linux-only Wayland clipboard dependency path plus upstream maintenance
  warnings; that crate is absent from the macOS and Windows release graphs
- actionlint, fixture harness, updater contract, release audit, and
  `git diff --check` passed

Unified macOS package and installed-app reflection on 2026-07-17:

- packaged app:
  `src-tauri/target/release/bundle/macos/Atelier.app`
- disk image: `src-tauri/target/release/bundle/dmg/Atelier_0.2.9_aarch64.dmg`
- packaged and installed executable SHA-256:
  `a8eb9f13f9d85d11c392292f48dd53f81dbf8ed16b19db4ecee8798888dc67c8`
- `/Applications/Atelier.app` reports version `0.2.9`, passes strict local
  signature verification, and returns a `main` renderer receipt with status
  `ready`
- a clean launch and a close/relaunch cycle both produced one visible `Atelier`
  window; `/tmp/atelier-installed-orca-all-0.2.9-cold.png` records the installed
  UI
- the pre-replacement app is preserved at
  `/tmp/Atelier.pre-orca-all-20260717-203144.app`

Orca-informed source implementation is complete for the planned modules.
Physical Windows package installation, visible Claude/Codex browser login,
signed update survival, and Smart App Control remain external device evidence;
public macOS notarization remains an external credential gate. These are not
reported as completed by the macOS source/build receipt.
