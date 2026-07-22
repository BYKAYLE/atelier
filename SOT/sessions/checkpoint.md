# Session Checkpoint

Updated: 2026-07-22 22:56 KST
Branch: `codex/orca-modular-release-gate`
Baseline commit: `89205a5`
State: 0.2.12 local release candidate installed; public signing gates pending

## Durable Stop Point

- Source, macOS package, and `/Applications/Atelier.app` are version 0.2.12.
- The offline parallel-agent E2E, safe worktree receipt injection, pinned CLI
  installers, preview-route fidelity, Hermes workload reflection, keyboard
  menus, and compact composer layout are implemented.
- The packaged and installed executable hashes match, strict local-signature
  verification passes, and installed renderer/window evidence is recorded.
- Pre-existing untracked paths `:-`, `target/`, and `tmp/` are user-owned and
  must remain untouched.

## Verified

- Three concurrent turns, selective cancellation, event/workspace isolation,
  terminal lifecycle uniqueness, process-tree cleanup, and four worktree tests.
- Full 188-pass Rust suite, strict all-feature Clippy, production frontend
  build, 20-contract/ten-feature gate, updater contract, npm audit, and
  zero-vulnerability RustSec release audit.

## Next Boundary

Do not publish or describe 0.2.12 as publicly signed. The next independent
stage is Apple Developer ID notarization plus signed physical-Windows proof for
visible subscription browsers, provider acceptance, Smart App Control, update
installation, relaunch, and version persistence.
