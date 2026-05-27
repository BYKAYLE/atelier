# Atelier Project Summary

Last updated: 2026-05-28

## Identity

Atelier is an already-working Tauri desktop workspace for local terminal and
coding-agent workflows. It must not be treated as a greenfield rebuild.

## Current Runtime Shape

- Frontend: Vite, React, TypeScript, Tailwind-style utility classes.
- Desktop shell: Tauri v2.
- Native backend: Rust commands under `src-tauri/src`.
- Terminal surface: xterm.js PTY workspace in `src/components/Main.tsx`.
- Structured agent surface: `src/components/AgentWorkspace.tsx`.
- Agent adapters: Claude Code, Codex CLI, and Hermes through
  `src-tauri/src/agent.rs`.
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

## Current Gap

The code is ahead of the public README. AgentWorkspace already implements much
of the Codex-like surface, but the durable project SOT and factory-level task
contract were missing. This SOT is the starting point for that contract.
