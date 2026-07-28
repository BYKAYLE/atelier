# Atelier Project Summary

Last updated: 2026-07-26

## Identity

Atelier is an already-working Tauri desktop workspace for local terminal and
coding-agent workflows. It must not be treated as a greenfield rebuild.

## Current Verdict

`supervised local candidate, public release blocked`

- Current source candidate: `0.2.14`.
- Source gates: 230 all-feature Rust tests passed with 3 ignored; Orca passed 23
  contract smokes across 10 removable features; strict
  all-target/all-feature Clippy and format/diff checks passed; `npm audit`
  reports 0 vulnerabilities; RustSec reports 0 known vulnerabilities with 18
  unmaintained and 2 unsound upstream warnings retained.
- Managed preview start is fail-closed. Atelier can still inspect a separately
  trusted localhost service.
- Basic is the default permission. Auto keeps sandboxing and approval checks
  active; visible and raw Full bypass paths are removed.
- Managed execution is capability-scoped by provider: Claude/Codex support
  Basic/Auto through their existing paths; Hermes/Gajaecode use pinned,
  Atelier-owned macOS runtimes, isolated homes/default skills, and the managed
  sandbox. Direct CLI is a separate manual, limited path.
- Gajaecode is pinned at 0.11.7 with managed Bun 1.3.14 and four adapter-owned
  defaults. Hermes is pinned by commit, retains 453 durable bundled-source
  files, and verifies 73 installed skills.
- Frontend and Rust prompt guards share a regression corpus, but phrase matching
  is not a complete action-level guarantee.
- The locally signed `0.2.14` candidate is installed at
  `/Applications/Atelier.app`. Candidate and installed executable SHA-256 values
  match at
  `4ee04fbed757f015c910171f4e7c0c3979ca009d396f90a6abfb890e2e1b1868`;
  codesign and renderer-ready checks pass. This is local installed-candidate
  proof, not Developer ID/notarization/public-distribution proof.
- The proof was created from a dirty worktree. HEAD
  `35e6b0d92eba33ca5644b4d209ef1eaac75d987b` does not uniquely identify this
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

The installed macOS `0.2.14` baseline builds on detached PTY supervision with a
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
longer stages Codex access tokens into Hermes state; each CLI owns its provider
authentication. Package reflection is independently proven by a private
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
contract. Its immediate full-gate task is provider-capability truth:
Claude/Codex managed Basic/Auto only, Hermes/Gajaecode managed fail-closed, and a
separate manual/limited direct CLI. Its durable P1 safety gap is an app-owned
action/tool proxy with scoped approval receipts: a prompt phrase denylist cannot
guarantee what an external provider tool actually executes. The remaining distribution gaps are
physical Windows proof and public macOS/Windows signing and notarization. The
broader P1 product gap still includes durable job reattachment, syntax-aware
editing, diagnostics/autosave, conflict-safe source control, indexed symbols,
and repeatable browser-backed workbench E2E coverage. Production bundle code
splitting remains P2 because the current build still emits a large-chunk
warning. The active SOT separates source, package, installed-app, and
physical-platform truth.
