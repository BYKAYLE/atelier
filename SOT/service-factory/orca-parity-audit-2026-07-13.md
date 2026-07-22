# Orca vs Atelier 0.2.8 Product Parity Audit

Audit date: 2026-07-14 KST

## Baselines

- Orca: `stablyai/orca` commit
  `7b3103f8909848a35934c2749607c50f70485963`, dated 2026-07-13.
- Atelier source: `/Users/kansic/Service/atelier`, package version `0.2.8`, with
  an intentionally preserved dirty worktree.
- Atelier installed app: `/Applications/Atelier.app`, version `0.2.8`, renderer
  receipt confirmed against the installed executable.
- Audit rule: source presence, isolated unit logic, packaged binary presence,
  and a user-verifiable workflow are separate truth surfaces.

## Executive Finding

Atelier now has a visible Orca-informed local workbench in addition to its
runtime foundations, but it is not yet at total Orca feature parity. The
installed app is not stale: its version matches the source package and its main
renderer returned a ready receipt. The 0.2.8 workbench adds persistent multi-tab
editing, functional source control, and one tasks/files/commands palette without
replacing Atelier's compact structured-agent UI. Its finishing pass also removes
the duplicate task-terminal/cwd chrome, distinguishes navigation icons, and
defers hidden terminal rendering until the host is measurable.

Three foundations are substantial:

1. Bounded PTY transport and detached supervisor reattachment.
2. Optional Git worktree isolation with conflict-checked candidate adoption.
3. A structured multi-provider task workspace with code, changes, preview, and
   review state.

Most visible Orca parity claims remain functional beta, limited integration, or
prototype work. The previous roadmap made this harder to see by calling a
feature implemented when only its state model or parser smoke had passed.

## Scale and Architecture

| Surface | Orca baseline | Atelier 0.2.8 | Consequence |
|---|---|---|---|
| Desktop shell | Electron, React, Node native services | Tauri, React, Rust | Keep Tauri/Rust; copying Orca's shell would add migration risk without product value. |
| TypeScript surface | 6,840 TS/TSX files, about 620,640 lines | 49 TS/TSX files, 26,471 lines | Direct feature-count parity is not a patch-sized task. Scope must be staged. |
| Native surface | Node native modules plus platform helpers | 13 Rust files, 16,869 lines | Atelier's Rust PTY and Git safety layer is an asset to preserve. |
| Main domains | 75 main-process feature directories | Provider, PTY, worktree, preview, update, and app services are concentrated in a small set of modules | Missing boundaries increase regression risk. |
| Renderer domains | 50 component feature directories | `AgentWorkspace.tsx` is 9,668 lines; `Main.tsx` is 2,891 lines; `index.css` is 2,132 lines | Code/changes/mode-bar modules now exist, but the two core components and global stylesheet remain too large and still require staged extraction. |
| Test inventory | 2,779 spec/test files; 128 e2e-like files | No frontend `.test` or `.spec` files; seven tool smokes plus Rust tests | Atelier cannot currently prove most user workflows before packaging. |
| Editor stack | Integrated editor, diff, source control, file workflows | Task-rooted multi-tab editor plus first-class source-control and unified-diff views | The local workbench is now actionable; syntax services, diagnostics, conflict resolution, and safe undo remain. |
| Terminal stack | WebGL terminals, splits, restart survival, extensive scroll tests | xterm canvas, real supervisor, split UI, state-only split smoke | Runtime foundation is credible; interaction and rendering parity are not proven. |

The size comparison does not mean Atelier should reproduce all Orca code. It
shows why adopting labels and isolated helpers cannot produce the same visible
workspace. Atelier should preserve its smaller security-focused core and add
only product workflows that serve its local autonomous-development goal.

## Capability Matrix

Status definitions:

- **Validated foundation**: real runtime behavior is exercised, not only a
  parser or state helper.
- **Functional beta**: source and UI path exist, but representative installed
  user-flow coverage is missing.
- **Limited/partial**: only a narrower version of the Orca capability exists.
- **Not implemented**: there is no equivalent user workflow.

| Orca capability | Atelier status | Evidence and gap |
|---|---|---|
| Any CLI agent | Limited/partial | Four registered providers are structured; arbitrary CLI onboarding and adapter generation are not first-class. |
| Parallel isolated worktrees | Functional beta | Fan-out code and worktree creation exist; the complete prompt-to-candidates flow lacks frontend E2E and installed receipt. |
| Candidate comparison | Functional beta | Batch candidate state and changed-file summaries exist; comparison interaction is untested. |
| Winner adoption | Functional beta | Rust tests verify common repo, branch, base, conflict, and dirty-source preservation. UI confirmation is not E2E tested. |
| Detached sessions | Validated foundation | Supervisor smoke reconnects three parallel sessions and reports low local input transport latency. |
| Terminal splits | Functional beta | Nested split rendering and resizing exist. The smoke only tests `terminalLayout.ts`; WebGL, scroll pinning, restart, and pane interaction are not E2E gated. |
| Quick Open | Functional beta | One shortcut and dialog search sessions, active task/worktree files, and workspace commands. Agents, branches, and symbols are not yet indexed. |
| Embedded browser and Design Mode | Prototype | Localhost bridge contracts expose screenshot, DOM, console, network, click, type, and picker calls. The checked-in picker smoke normalizes fabricated selection data; the current suite has no repeatable installed-app page-driving gate. |
| Diff annotation workflow | Partial implementation | Parser, persistent annotation data, resolve/reopen/delete, and prompt formatting exist. No frontend flow test proves add-to-line through agent delivery. |
| File editor and autosave | Functional beta | The task-rooted editor supports recursive search, multi-tab dirty drafts, dirty-close protection, explicit safe save, and direct diff navigation. It does not yet provide autosave, syntax services, diagnostics, or conflict-aware reload. |
| Source-control workbench | Functional beta | Central source control now separates index/worktree state and supports stage, unstage, branch/upstream metadata, ahead/behind counts, recent history, diffs, and manual commit. Conflict resolution and safe undo remain unimplemented. |
| GitHub and Linear | Not implemented | No product modules or SDKs exist for native issue, PR, review, or inbox workflows. |
| SSH worktrees and forwarding | Not implemented | Shell text may contain `ssh`, but there is no host registry, remote worktree lifecycle, reconnect, or port-forwarding product layer. |
| Account switcher and usage | Not implemented | Provider authentication exists; multi-account hot-swap, quota, and rate-reset surfaces do not. |
| Public automation CLI | Not implemented | Internal headless modes are implementation details, not a versioned Atelier CLI. |
| Rich repo previews | Limited implementation | Localhost HTML and diagnostics are supported; Markdown, images, PDF, and document tabs are not integrated workspace previews. |
| Notifications and unread | Limited implementation | Task running/done markers exist; OS notifications, needs-attention routing, and durable unread controls do not. |
| Computer Use | Not implemented | No consented desktop-control runtime or platform adapters exist. |
| Mobile companion | Not implemented | No paired mobile client, encrypted transport, device revocation, or remote approval channel exists. |

## What Is Real Today

### Runtime plane

- The PTY supervisor smoke launches real processes, reconnects after launcher
  exit, keeps three parallel sessions alive, and exercises 100 input writes.
- Rust supervisor tests cover restart and cleanup behavior.
- Output transport has bounded batching and replay metadata rather than relying
  solely on renderer state.

### Worktree safety plane

- Rust tests cover slugging, source-edit preservation, overlap refusal, and
  non-overlap adoption.
- Candidate adoption verifies Git common directory, expected branch, base
  commit, and source conflict state before applying an unstaged patch.
- Automatic merge, commit, reset, and production-worktree replacement remain
  outside the workflow.

### Structured workspace plane

- Claude, Codex, Hermes, and Gajae adapters share task lifecycle state.
- Background sessions, cancellation, queued follow-up input, model selection,
  preview evidence, diff summaries, task-local raw logs, task-rooted editing,
  and changed-file review are represented.
- These are meaningful Atelier-specific strengths and should be retained.

### Integrated workbench plane

- Conversation, Code, and Changes are primary workspace modes; Preview remains
  independently toggleable so editing and the running result can be inspected
  together.
- Code view is rooted in the active task or isolated worktree and has bounded
  recursive search, persistent multi-tab drafts, dirty-close protection, and
  explicit save.
- Changes view separates staged and unstaged state, exposes branch/upstream and
  recent history, supports stage/unstage/manual commit, and renders unified
  diffs with direct editor navigation.
- Quick Open combines tasks, active-root files, and workspace commands in one
  keyboard-driven palette.
- Terminal uses the validated detached PTY surface through an explicit action;
  it is not duplicated inside the agent renderer.
- The installed 0.2.8 app returned a renderer-ready receipt from
  `/Applications/Atelier.app`, and the detached supervisor retained 1.338 ms p95
  local input transport in the release smoke.

## Why It Did Not Look Applied

1. `terminal-layout-smoke.ts` tests serialization, tree edits, and ratio clamps;
   it never clicks a split button, types into a pane, scrolls, or restarts the
   app.
2. `diff-review-smoke.ts` parses one static diff and formats a prompt; it never
   opens the review UI or sends a line comment.
3. `devscreen-element-picker-smoke.ts` supplies a fabricated element object; it
   never opens a page or selects an element. Historical SOT mentions a manual
   browser script, but that is not a repeatable installed-app gate in the current
   frontend suite.
4. `preview-url-smoke.ts` checks URL allowlisting only; it does not start or
   inspect a preview.
5. The frontend has no component or end-to-end test suite, while its two core
   components have grown into large shared-state modules.
6. The production bundle contains a roughly 1.19 MB minified main chunk, which
   reinforces the need for feature boundaries and lazy loading.

The current smokes are useful unit checks. The defect is treating them as
release proof for complete UI workflows. The 0.2.8 renderer receipt proves the
installed shell and central workbench load; it does not replace the missing
browser-driven editor, source-control, and preview E2E flows.

## Confirmed Work Scope

### P0 - Stabilize release truth and architecture

Goal: stop recurring regressions before adding another large feature family.

1. Split `AgentWorkspace.tsx` into session, composer, worktree, review, preview,
   and provider feature modules with explicit state contracts.
2. Split terminal ownership, layout, tab chrome, and preview composition out of
   `Main.tsx`.
3. Add frontend unit/component tests for queueing, cancellation, model routing,
   session switching, split layout, review annotations, and preview state.
4. Add installed-app user-flow harnesses for background sessions, terminal
   splits, worktree fan-out/adoption, diff review, and preview inspection.
5. Replace version-only completion claims with source, test, package, installed,
   and physical-platform receipts.
6. Keep physical Windows browser authentication, updater survival, signing, and
   Smart App Control as mandatory release gates.

Exit criteria:

- No feature can be marked implemented from a pure-function smoke alone.
- Core UI flows have regression tests and installed-app receipts.
- The existing provider, PTY, updater, and permission behavior is preserved.

### P1 - Complete the local development workbench

Status: second central workbench slice and shell-stabilization pass shipped in
0.2.8; the broader track is still in progress.

Goal: make the Orca-inspired work visible and useful in normal development.

1. Promote worktree fan-out, candidate progress, side-by-side diff comparison,
   and explicit adoption into a first-class workspace surface.
2. Extend the integrated editor from tabs and explicit save to autosave, syntax
   services, diagnostics, and conflict-aware reload.
3. Extend source control from explicit stage/unstage/manual commit and history
   to conflicts and safe undo without automatic commits.
4. Expand Quick Open from sessions, files, and commands to agents, branches,
   symbols, and repository context through one indexed command palette.
5. Finish terminal quality with renderer E2E coverage, pinned scrollback,
   restart recovery, pane focus, keyboard control, and optional WebGL fallback.
6. Turn preview inspection into a real browser-backed user flow with element
   selection, screenshot, console/network evidence, and reproducible tests.
7. Support file and image attachment directly in the composer and editor.

Exit criteria:

- A user can start parallel candidates, inspect code and preview, annotate a
  diff, adopt one candidate, run verification, and inspect the evidence without
  leaving Atelier.

### P2 - Add remote and service integrations

Goal: add high-value Orca capabilities after the local workbench is stable.

1. GitHub issue, PR, review, and check-run workflows; Linear only after GitHub
   and local source control are proven.
2. SSH host registry, host-key trust, remote worktree lifecycle, reconnect,
   port forwarding, and remote cleanup receipts.
3. Provider account switcher, usage and reset-time telemetry using documented
   provider surfaces only.
4. A supported `atelier` CLI for worktree creation, task dispatch, snapshot,
   verification, and status queries.
5. Rich Markdown, image, PDF, and document previews.

Exit criteria:

- Remote and external actions are explicit, auditable, revocable, and cannot
  bypass the existing permission model.

### P3 - Optional continuity features

Goal: add convenience without delaying a trustworthy desktop release.

1. OS notifications, needs-attention routing, and durable unread state.
2. Explicitly consented Computer Use with visible action receipts and a kill
   switch.
3. Mobile companion only after encrypted pairing, device revocation, command
   approval, and remote-session threat modeling are complete.

## Out of Scope and Safety Boundaries

- Do not replace Tauri/Rust with Electron merely to resemble Orca.
- Do not copy Orca implementation code or private provider protocols.
- Do not read another application's credentials directly.
- Do not make unrestricted execution the default.
- Do not delete databases, user data, worktrees, branches, or production state
  as part of adoption work.
- Do not auto-merge, auto-commit, publish externally, deploy production, or
  initiate paid actions without explicit approval.

## Release Recommendation

Atelier 0.2.8 should be described as a structured local multi-agent workspace
with validated PTY/worktree foundations and an actionable local development
workbench, not as total Orca parity. It is suitable for macOS beta use after the
local release gates above, while a broad cross-platform release still requires
physical Windows browser-auth/update receipts and browser-driven regression
coverage for the central workbench. P2 and P3 remain later tracks rather than
claims attached to this build.
