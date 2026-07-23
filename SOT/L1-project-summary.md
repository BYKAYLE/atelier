# Atelier Project Summary

Last updated: 2026-07-14

## Identity

Atelier is an already-working Tauri desktop workspace for local terminal and
coding-agent workflows. It must not be treated as a greenfield rebuild.

## Current Runtime Shape

- Frontend: Vite, React, TypeScript, Tailwind-style utility classes.
- Desktop shell: Tauri v2.
- Native backend: Rust commands under `src-tauri/src`.
- Terminal surface: xterm.js PTY workspace in `src/components/Main.tsx`.
- Structured agent surface: `src/components/AgentWorkspace.tsx`.
- Agent adapters: Claude Code, Codex CLI, Hermes, and Gajae Code through a
  shared registry and normalized lifecycle in `src-tauri/src/agent.rs`.
- Preview surface: local-only preview health checks and managed preview service.
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

The installed macOS 0.2.12 baseline builds on detached PTY supervision with a
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

The public README now matches the implemented product and its safety boundary.
The local runtime has detached PTY ownership, restart replay, normalized
provider lifecycle, optional task worktrees, task-linked preview evidence, and
an enforced long-session rendering contract. The remaining release gap is
physical Windows proof and public macOS distribution identity, not another
local-runtime rewrite. The broader P1 product gap still includes syntax-aware
editing, diagnostics/autosave, conflict-safe source control, indexed symbols,
and repeatable browser-backed workbench E2E coverage. The active SOT separates
source, package, installed-app, and physical-platform truth.
