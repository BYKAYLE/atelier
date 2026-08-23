# Session Log — Mobile Existing-Task Continuity

Date: 2026-08-03 KST
Branch: `codex/release-readiness-final`
Version: `0.2.22`

## Result

Closed the gap between “mobile endpoint is reachable” and “the same Atelier work
is visible and continuable.” The installed app now publishes existing tasks and
bounded conversation, the current paired phone is allowed to continue them, and
tailnet-only access is left running.

## Evidence

- Local WebKit storage, read only: 3 sessions, 224 valid messages; no reset.
- Live monitor: 3 sessions, 1 active, 180 projected messages.
- Tailnet health: version 0.2.22, status ok.
- Installed candidate SHA-256:
  `64de149c1842e0091db02724ca0c1b4c58cfb65c4d122114b38285371a29dbb6`.
- Rust: 276 passed, 0 failed, 6 ignored/manual.
- Frontend build, focused smokes, Clippy, format/diff, codesign, renderer-ready,
  and installed visual capture: pass.

## Recovery work

The first 0.2.22 installation produced a blank window even though its early
receipt said ready. Root inspection found a global fallback capable of creating
a second React root after an unrelated asynchronous failure. Recovery changed
the lifecycle to one root, non-destructive post-commit error handling, local
projection containment, and shell-backed readiness. The rebuilt installed app
renders normally.

The prior remote server also disappeared on every app restart because the
explicit Tailscale start was not persisted. The installed runtime now restores
only that explicit choice with bounded retries. A deliberate restart while the
Mac was locked first removed the endpoint and then restored health `ok` on the
same tailnet URL. Explicit Stop disarms restore before cleanup.

## Safety and truth boundary

- No DB/data/session/message deletion.
- Replaced app preserved as a recoverable backup.
- No Funnel, public publication, notarization, push, or paid provider turn.
- Physical Windows remains unverified.
