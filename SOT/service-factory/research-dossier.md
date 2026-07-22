# Research Dossier

updated_at: 2026-07-13T01:16:04+09:00

## Objective

Preserve Atelier's existing Tauri/Rust terminal and security boundaries while
adopting the Orca capabilities that materially improve a local autonomous
development workspace.

## Compared Surfaces

- Upstream reference: `stablyai/orca`, used for product and runtime patterns,
  not copied as an Electron implementation dependency.
- Atelier runtime: PTY ownership and replay, agent lifecycle normalization,
  task isolation, candidate review/adoption, preview evidence, native OAuth
  browser handoff, updater, and package gates.
- User-observed failure history: hidden sessions stopping, delayed terminal
  output, incomplete responses, stale preview context, Windows browser handoff,
  package/version drift, and accidental credential-boundary crossings.

## Findings Adopted

1. A bounded detached PTY supervisor is more important than arbitrary visual
   terminal splits. Atelier now retains sessions through renderer and shell
   reconnect with sequence snapshots and explicit cancellation.
2. Provider-specific text cannot own task completion. A common lifecycle
   (`started`, `output`, `tool_started`, `waiting_for_user`, `completed`,
   `failed`, `cancelled`) now owns terminal state while raw logs remain visible.
3. Parallel work needs isolation and an explicit adoption gate. Task worktrees,
   candidate comparison, conflict checks, and alternate-index patch adoption
   are implemented without automatic merge, commit, or reset.
4. Preview validation must be task evidence, not a separate manual workflow.
   Atelier now auto-arms the matching localhost browser bridge and captures
   HTTP/service/DOM/screenshot/console/runtime/network evidence when a provider
   turn completes.
5. Cross-device and remote continuity are valuable but remain deferred until
   device trust, revocation, encryption, and physical-platform evidence exist.

## Deliberately Not Adopted

- Electron-specific process and rendering architecture.
- Default unrestricted execution.
- Automatic winner merge/commit.
- Remote SSH credentials, account sync, mobile control, GitHub/Linear inbox,
  and click-to-edit Chromium design handoff before local release gates close.

## Evidence Boundary

- Source and automated evidence is local and repeatable.
- macOS package and installed-app evidence is produced from the signed local
  bundle and `/Applications/Atelier.app`.
- Windows normal/Store binaries are cross-linked PE evidence only. They do not
  prove default-browser appearance, Smart App Control acceptance, Authenticode,
  or restart survival on a physical Windows machine.
- Public macOS distribution is not claimed without Developer ID notarization.

## Current Decision

The local runtime foundation and automatic preview-evidence workflow are release
candidate quality. Keep the persistent product goal active for physical Windows
interactive evidence and public signing/notarization rather than reopening the
completed local runtime architecture.
