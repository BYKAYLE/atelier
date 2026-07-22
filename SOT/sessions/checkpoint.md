# Session Checkpoint

Updated: 2026-07-23 00:45 KST
Branch: `codex/orca-modular-release-gate`
Baseline commit: `50624e0` plus current release-publication gate candidate
State: 0.2.12 local candidate installed; fail-closed publication source gate verified; external signing and physical proof pending

## Durable Stop Point

- Source, macOS package, and `/Applications/Atelier.app` are version 0.2.12.
- The offline parallel-agent E2E, safe worktree receipt injection, pinned CLI
  installers, preview-route fidelity, Hermes workload reflection, keyboard
  menus, and compact composer layout are implemented.
- The packaged and installed executable hashes match, strict local-signature
  verification passes, and installed renderer/window evidence is recorded.
- Version tags now create a sealed private draft only. A distinct protected
  publisher validates the exact candidate manifest and one selected successful
  interactive Windows physical-gate run before it can remove draft state.
- Candidate, package, and provider receipts now bind to one exact run ID and
  source SHA; MSI and NSIS inner payloads are verified, the remote draft is
  re-downloaded immediately before publication, and the stapled macOS DMG is
  tested through a fresh installed copy.
- Pre-existing untracked paths `:-`, `target/`, and `tmp/` are user-owned and
  must remain untouched.

## Verified

- Three concurrent turns, selective cancellation, event/workspace isolation,
  terminal lifecycle uniqueness, process-tree cleanup, and four worktree tests.
- Full 188-pass Rust suite, strict all-feature Clippy, production frontend
  build, 20-contract/ten-feature gate, updater contract, npm audit, and
  zero-vulnerability RustSec release audit.
- GitHub Actions syntax, release-candidate tamper/signature rejection, and
  publication-evidence rejection gates pass locally.

## Next Boundary

Do not publish or describe 0.2.12 as publicly signed. The repository currently
has Tauri updater signing secrets only; it has no Apple Developer ID or
notarization secrets, SignPath configuration, `production-release` environment,
or self-hosted interactive Windows runner. The next independent stage is to
configure those external gates, then produce real Developer ID/notarization and
signed physical-Windows proof for visible subscription browsers, provider
acceptance, Smart App Control, update installation, relaunch, and version
persistence.
