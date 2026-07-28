# Feature: Runtime Safety and Preview Truth

Status: historical 0.2.13 record; provider-capability section superseded
Updated: 2026-07-25 KST
Verdict: `supervised local candidate, public release blocked`

Superseding note (2026-07-26 KST): Hermes/Gajaecode are no longer
blanket-disabled. They now require the pinned Atelier-managed runtime,
isolated default skills, and macOS sandbox described in
`feature-reproducible-managed-provider-runtime.md`. The prompt, permission, and
preview findings below remain the historical 0.2.13 safety record.

## Goal

Make Atelier safe and truthful enough for supervised local daily use without
representing prompt matching, local signing, or macOS installation as a complete
action-security or public-release guarantee.

## Implemented Contract

### Prompt guard

- Frontend and Rust behavior is exercised by a shared Korean/English corpus.
- Mixed-negation and direct-CLI dangerous requests are checked before provider
  spawn.
- Phrase matching is defense in depth. It does not mediate the actual provider
  tool/action effect and is not a complete safety guarantee.

### Permissions and provider capability

- Basic is the default.
- Auto retains sandboxing and approvals.
- Visible/raw Full is removed; legacy `full`, `bypass`, and `danger` normalize
  to Basic.
- Claude and Codex support managed Basic/Auto.
- Hermes and Gajaecode advertise managed execution capability false, display the
  provider-specific disabled reason, and fail before lifecycle/spawn.
- Restricted Gajaecode direct CLI remains a separate manual, allowlisted path.
  It does not inherit managed-execution claims.

### Preview

- Atelier-managed preview start remains fail-closed.
- A separately trusted localhost service can still be inspected.
- The UI does not expose a dead managed Start control.

## Source Verification

- Version: `0.2.13`.
- Rust all-features: 209 passed, 0 failed, 1 ignored.
- Orca: 23 contract smokes across 10 removable features.
- Strict all-target/all-feature Clippy: pass.
- Format and diff checks: pass.
- `npm audit`: 0 vulnerabilities.
- RustSec: 0 known vulnerabilities; 18 unmaintained and 2 unsound upstream
  warnings remain visible.

## Local Package And Installed-App Evidence

- Candidate app:
  `/Users/kansic/Service/atelier/src-tauri/target/release/bundle/macos/Atelier.app`.
- DMG:
  `/Users/kansic/Service/atelier/src-tauri/target/release/bundle/dmg/Atelier_0.2.13_aarch64.dmg`.
- Installed app: `/Applications/Atelier.app`.
- Candidate and installed version: `0.2.13`.
- Candidate and installed executable SHA-256:
  `3cce1530628decc24ac0d1955082f93ebf9bcebf327926fdc5f085850c3c9acf`.
- DMG SHA-256:
  `d55d6f21e9b4373aa1d83455bcbc6adea447b485eedceb8f380287d3437d5851`.
- Candidate and installed codesign: pass.
- Renderer receipt: PID `74123`, window `main`, status `ready`.
- Prior `0.2.12` app was moved without deletion to
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.12-before-0.2.13.app`.

Machine-readable proof:

`/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-installed-proof.json`

The proof records `workingTreeDirtyAtProofTime: true` and
`headShaUniquelyIdentifiesBuild: false`. HEAD
`35e6b0d92eba33ca5644b4d209ef1eaac75d987b` is context, not the unique build
identity. The executable SHA-256 is the installed-candidate identifier.

## Installed UI Evidence

- Installed app:
  `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-installed.png`
- Basic/Auto permission menu:
  `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-permission-menu.png`
- Hermes managed-execution block:
  `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-hermes-blocked.png`
- Gajaecode managed-execution block:
  `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-gajae-blocked.png`
- Preview external-inspection-only state:
  `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-preview-disabled.png`

## Remaining

- P1: app-owned action/tool proxy with scoped, expiring, one-use approval
  receipts.
- P2: production bundle code splitting for the current large-chunk warning.
- External release gates: Developer ID signing and notarization, public Windows
  signing, physical Windows login/install/restart evidence, and public
  publication.

No public publish, Developer ID signing, notarization, production deployment,
DB/data deletion, paid action, credential mutation, or physical Windows proof is
claimed.
