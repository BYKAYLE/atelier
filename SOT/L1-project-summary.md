# Atelier Project Summary

Last updated: 2026-08-30

## Identity

Atelier is an already-working Tauri desktop workspace for local terminal and
coding-agent workflows. It must not be treated as a greenfield rebuild.

## Current Verdict

`supervised local candidate, public release blocked`

- Current source and locally installed candidate: `0.2.34` (installed through
  the gated canonical path; first proof with a clean working tree).
- New tasks now require an explicit native project-folder selection after the
  agent is chosen. Cancelling the picker creates no task, the chosen source
  workspace is persisted on that task, and the current path plus a folder
  recovery action remain visible in the workspace header. This prevents a
  stale global or deleted temporary scratchpad path from being inherited by a
  new task.
- Stella Mode supports per-stage model assignment (static mapping v1.1):
  planning/execution/verification/security/audit stages can each run a
  different provider/model/effort through the existing per-provider spawn
  path, with session inheritance for unassigned stages, fail-closed
  validation, explicit `STAGE HANDOFF` context transfer (no conversation
  resume), per-stage receipts in SOT evidence and CLI terminal receipts, a
  five-row stage panel with per-row provider+model selectors (all five
  top-level providers mixable; hermes/gajecode sub-backend derived from the
  model value; explicit reset button; contract survival rules so assignments
  outlive session switches), and
  `atelier task dispatch --stella --stage-models '<json>'` for headless staged
  runs — cross-provider proven on the installed app (codex planning + claude
  stages in one run; hermes+alibaba qwen stage in one run). Supply-path rule
  (0.2.31): every composer-selectable supply path, including backend-only
  Alibaba Cloud and OpenRouter, is one selection away in the stage selector,
  derived from the real composer catalogs and pinned by a coverage-diff smoke;
  the backend is a persisted assignment field that beats model-value
  inference. Zero-override runs keep the unchanged single-session path. The
  OpenRouter catalog lists live models until their expiration date actually
  passes (`SOT/L2-features/feature-stage-model-assignment.md`).
- Source gates (measured 2026-08-30 on the 0.2.34 tree): 334 Rust tests passed
  with 8 ignored (all targets, all features); Orca previously passed 24
  contract smokes across 10 removable features; strict
  all-target/all-feature Clippy and format/diff checks passed; `npm audit`
  reports 0 vulnerabilities (nanoid raised GHSA-2v37-7h3g-55p8 until the
  3.3.18 fix on 2026-08-30); RustSec reports 0 known vulnerabilities with 18
  unmaintained and 3 unsound upstream warnings retained.
- Structural release guards (0.2.34): `tools/install-macos-candidate.sh` is
  the canonical installed-app replacement path and refuses to replace the
  installed app while the working tree is dirty or HEAD carries no version
  tag (single override env, reason recorded in the proof JSON, which now also
  records `versionTagOnHead`); `tools/repo-hygiene.mjs` fails
  `release:preflight` and `audit:release` when untracked files appear outside
  the known layout. Both gates carry a forced-trigger mutation smoke
  (`smoke:release-guards`).
- Managed preview start is fail-closed. Atelier can still inspect a separately
  trusted localhost service.
- Basic is the default permission. Auto keeps sandboxing and approval checks
  active; visible and raw Full bypass paths are removed.
- Managed execution is capability-scoped by provider: Claude/Codex support
  Basic/Auto through their existing paths; Hermes/Gajaecode use pinned,
  Atelier-owned macOS runtimes, isolated homes/default skills, and the managed
  sandbox. Direct CLI is a separate manual, limited path.
- Gajaecode is pinned at 0.15.2 with managed Bun 1.4.0 and four adapter-owned
  defaults (`autoresearch`, `deep-interview`, `ralplan`, `ultragoal`). Hermes
  is pinned by commit (`3ef6bbd`, `v2026.7.20`), retains 453 durable
  bundled-source files, and verifies 73 installed skills; newer Hermes releases
  cannot be installed through `uv tool install` because upstream blocks wheel
  builds since 2026-07-22.
- Managed-agent update checks show the upstream-latest version as a reference
  next to the Atelier pin (6h cache, 5s timeout, fail-soft). Update
  availability and the install target remain pin-based.
- Gajaecode 0.15.2 passed isolated registry-integrity, install, CLI, default
  skill, full Atelier regression, and real managed-runtime update proof. The
  nine DB/WAL/SHM hashes were unchanged. Hermes v2026.8.19 was also actually
  tested, but its source intentionally rejects Atelier's current `uv tool
  install` path; the card now reports `Atelier 설치 방식 변경 필요` instead of
  implying an active background validation.
- Grok Build is a fifth structured agent, pinned at official xAI CLI `1.0.4`
  under an Atelier-owned HOME. Browser OAuth is connected and a real
  `grok-4.6` read-only turn returned verified final text and a session ID.
- Hermes and Gajaecode additionally expose xAI API-backed Grok 4.5 models. This
  route requires an `XAI_API_KEY`; it does not reuse the Grok CLI browser token.
- The real managed Gajaecode runtime was updated from 0.14.0 through 0.15.0 to
  0.15.2 (Bun 1.3.14 to 1.4.0) through the installed app's readiness path. Its separate post-update status reports
  `update_available: false`, and all nine DB/WAL/SHM file hashes remained
  unchanged.
- Claude, Hermes, Codex, and Gajaecode share one terminal-answer contract:
  verified terminal result/error wins over streamed drafts. The real
  13,112-character Hermes contamination record recovers its final conclusion
  without `Planning`/`****` blocks while the stored original remains unchanged.
- The structured composer no longer repeats the non-actionable
  agent/provider/runtime/skill identity sentence. Model/provider/permission
  controls, Gajae/Stella actions, and actionable runtime/authentication banners
  remain available.
- Frontend and Rust prompt guards share a regression corpus, but phrase matching
  is not a complete action-level guarantee.
- The locally signed `0.2.34` candidate is installed at
  `/Applications/Atelier.app`. Candidate and installed executable SHA-256 values
  match at
  `c9bd04758dabfa741a1b3b941362178c58e6db40a499e6c0ecbbfa38577f3e1c`;
  codesign and renderer-ready checks pass, and for the first time the proof
  records `workingTreeDirtyAtProofTime: false` with
  `versionTagOnHead: v0.2.34` and `headShaUniquelyIdentifiesBuild: true`
  (source `7ae16bb`). This is local installed-candidate proof, not Developer
  ID/notarization/public-distribution proof.
- Mobile continuity publishes a bounded and native-redacted projection of the
  existing desktop work instead of lifecycle counters only. The current
  installed runtime exposed 3 existing tasks and 180 bounded messages over the
  tailnet-only endpoint, with no internal session IDs, absolute workspace paths,
  raw execution fields, or obvious credential patterns in the response.
- The existing `Mobile browser` device is explicitly authorized for direct
  continuation. A mobile instruction is revision-bound to the selected opaque
  task ID and enters that exact desktop session queue; resolution failure never
  falls back to a new session.
- An explicitly started Tailscale mobile endpoint now restores after an app
  restart, including while the Mac is locked. An explicit Stop disarms restore
  before Serve cleanup, and every restore still enforces loopback binding,
  tailnet-only Serve, and Funnel rejection.
- Renderer health now uses one React root, ignores non-fatal background
  rejections after the application shell commits, and refreshes a shell-backed
  readiness receipt. The prior blank installed window was reproduced and the
  final installed screen was captured after recovery.
- The proof was created from a dirty worktree. HEAD
  `fd47fbac31f6068bd3005174f8e1e3cd901ef5d0` does not uniquely identify this
  build; the installed candidate identifier is the executable SHA-256 above.
- No public publish, Developer ID signing, notarization, or Windows physical
  proof was performed or claimed in this cycle.

## Current Runtime Shape

- Frontend: Vite, React, TypeScript, Tailwind-style utility classes.
- Desktop shell: Tauri v2.
- Native backend: Rust commands under `src-tauri/src`.
- Terminal surface: xterm.js PTY workspace in `src/components/Main.tsx`.
- Structured agent surface: `src/components/AgentWorkspace.tsx`.
- Agent adapters: Claude Code, Codex CLI, Hermes, and Gajae Code through a
  shared registry and normalized lifecycle in `src-tauri/src/agent.rs`.
- Preview surface: local-only preview health checks, fail-closed Atelier-managed
  start, and inspection of separately trusted localhost services.
- Release/update surface: GitHub Releases, Tauri updater `latest.json`, macOS
  DMG/app bundle, Windows MSI/NSIS, optional SignPath and Microsoft Store MSIX.

## Preserve

- Existing terminal sessions, xterm rendering, clipboard-image paste, session
  restoration, and file preview behavior.
- Structured agent chat with smooth reveal, queue mode, raw-event log toggle,
  change summary/review/undo controls, model/provider/permission controls, and
  preview diagnostics.
- Claude/Codex/Hermes CLI compatibility and current authentication behavior.
- Local preview restrictions: automatic inspection stays limited to localhost.
- Existing installer/update/signing workflow and harness checks.

## Upgrade Direction

Atelier should evolve into a Codex-like local autonomous development partner:

1. Convert natural-language goals into development task packets.
2. Analyze project structure and run methods before editing.
3. Execute safe commands and collect evidence.
4. Modify files, test, verify, and recover from failure.
5. Delegate by role: Stella, Worker, Probe, Security, Release, Auditor.
6. Run Probe/security/release readiness before closure.
7. Record durable state and evidence in SOT.
8. Block database deletion, user-data deletion, production deployment,
   credential exposure, paid actions, and external publication unless explicitly
   approved.

The current architecture reference is Orca, but the adoption policy is a
selective transplant rather than a product fork. Atelier keeps Tauri/Rust,
structured chat, Stella Mode, the current updater identity, and its conservative
permission defaults. Bounded PTY flow, observable warm reattachment, detached
runtime supervision, normalized agent lifecycles, optional task worktrees, and
task-linked preview evidence are now integrated. Encrypted remote control stays
deferred behind separate permission and device-revocation gates.

The installed macOS `0.2.19` baseline builds on detached PTY supervision with a
common agent lifecycle, optional task isolation, and task-linked preview
evidence. Preview evidence now includes bounded, redacted HTTP response and
managed-server output alongside PID, restart, DOM, screenshot, browser
console/runtime, and network resource/failure state. The browser bridge is
armed automatically for the matching localhost origin and final evidence is
captured at turn completion, including failed turns, without requiring a manual
inspection click. The Inspector also offers an explicit click-to-select path:
it overlays a localhost Tauri target, suppresses the original page action, and
attaches only a bounded selector, safe shallow markup, viewport rectangle, and
allowlisted computed CSS to the next request. It adds a persistent nested terminal pane tree with
right/down splits, pointer/keyboard resizing, reload restoration, and clean
close collapse, plus task-wide Quick Open and explicit conflict-checked adoption of completed
parallel-worktree candidates without resetting, merging, or committing user
work. File review now exposes old/new line numbers, persists bounded comments,
and sends unresolved review feedback back to the agent through the normal queue
boundary. The structured task surface now provides Conversation, Code, and
Changes modes, a task-rooted multi-tab editor, and explicit source-control
actions while keeping Preview independent and exposing Terminal only once in
global navigation. Compact navigation uses purpose-specific icons and hidden
terminal renderers wait for a measurable host before initialization. It
also maps Codex's live model capability metadata to native
reasoning and collaboration flags, closing the `gpt-5.6-sol` Ultra Code schema
failure without changing the user's global Codex configuration. It closes the
native OAuth-open source path with a signed Atelier headless helper,
WinRT-first Windows activation, and COM/system fallbacks, Store-updater capability,
credential ownership, macOS permission, long-session renderer performance, and release-audit gaps found during the
final review. Normal and Store-feature Windows targets now also pass strict
cross-target clippy and produce linked PE32+ x86-64 executables. Atelier no
longer treats Hermes quiet stdout as a final-answer boundary: the managed path
uses `chat -Q`, keeps `session_id:` on stderr, treats stdout as bounded
diagnostic evidence, and selects only the exact new final assistant row from
managed state after turn, resume/compression ancestry, active/compacted,
tool-call, stale-row, and size validation. The provider-neutral frontend
contract also keeps streamed drafts as evidence rather than verified answers
and recovers historical dense progress records without changing stored
originals. Atelier validates the 73-skill manifest without eager `--skills`
preload and preserves installed skill discoverability under the Atelier-owned
Hermes home. Atelier still stages
a temporary Codex access token into the managed Hermes auth store for the
duration of an app-owned turn; direct standalone Hermes replay outside Atelier
correctly fails closed without that staging. Package reflection is independently proven by a private
renderer receipt that binds the current version, live PID, canonical installed
executable, main-window label, freshness, and React-root ready state; macOS and
physical Windows release gates reject a process-only launch without this
evidence. See
`SOT/service-factory/orca-adoption-roadmap.md` for the active architecture
contract and remaining completion gates.

## Current Gap

The current source has detached PTY ownership, restart replay, normalized
provider lifecycle, optional task worktrees, task-linked preview evidence,
fail-closed managed preview start, and an enforced long-session rendering
contract. Hermes/Gajaecode managed Basic/Auto now require pinned Atelier-owned
runtimes and fail closed when readiness or user authentication is absent; direct
CLI remains a separate manual/limited route. Hermes's state-backed final-answer
provenance, context-budget, and SQLite sandbox boundaries are verified through
an authenticated managed turn. Its durable P1 safety gap is an app-owned
action/tool proxy with scoped approval receipts: a prompt phrase denylist cannot
guarantee what an external provider tool actually executes. The remaining distribution gaps are
physical Windows proof and public macOS/Windows signing and notarization. The
broader P1 product gap still includes durable job reattachment, syntax-aware
editing, diagnostics/autosave, conflict-safe source control, indexed symbols,
and repeatable browser-backed workbench E2E coverage. Production bundle code
splitting remains P2 because the current build still emits a large-chunk
warning. The active SOT separates source, package, installed-app, and
physical-platform truth.
