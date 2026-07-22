# Atelier 0.2.12 Release Readiness Evidence

generated_at: 2026-07-23T02:13:43+09:00
source_commit: efee0032e93aad549c0fa35f6ec585de8ce93f13
branch: codex/release-readiness-final

## Source And Automated Gates

- Release URL, repository, tag, asset, signature, and manifest contracts fail
  closed.
- macOS release evidence binds the app, DMG, updater archive, Developer ID team,
  notarization, stapling, version, renderer readiness, and executable hashes.
- Windows release evidence records the installed executable hash and requires
  configured public signing before publication.
- The protected release workflow validates source/tag ancestry, repository
  identity, existing releases, required secrets, and platform evidence before it
  can publish.
- Frontend build, release-candidate smoke, publish-evidence smoke, updater
  contract smoke, release security audit, Orca feature gate, Rust format,
  Clippy, tests, and native/store builds passed on this source candidate.
- Rust tests: 188 passed, 0 failed, 1 ignored in both native and store-feature
  configurations.
- `npm audit --audit-level=low`: 0 known vulnerabilities.

## Local macOS Package

- App bundle:
  `src-tauri/target/release/bundle/macos/Atelier.app`
- DMG:
  `src-tauri/target/release/bundle/dmg/Atelier_0.2.12_aarch64.dmg`
- Bundle verification: strict code-signature verification passed.
- Renderer readiness: passed for the packaged and installed executables.
- Signing identity: `Atelier Local Code Signing`.
- Public trust: not established. This identity is not a Developer ID Application
  identity and cannot satisfy the public macOS release gate.

## Installed macOS Reflection

- Installed path: `/Applications/Atelier.app`
- Installed version: `0.2.12`
- Running executable: `/Applications/Atelier.app/Contents/MacOS/atelier`
- Packaged executable SHA-256:
  `009e3a0926524a4d6b70fff16ce9b59f1fe258d959d1e82bc686d3f898c11997`
- Installed executable SHA-256:
  `009e3a0926524a4d6b70fff16ce9b59f1fe258d959d1e82bc686d3f898c11997`
- Reflection verdict: exact match.
- Previous installed bundle was preserved at
  `/tmp/Atelier.app.pre-efee003`; no user data or database was deleted.

## External Release Gates

1. `physical-windows`: no physical Windows execution receipt exists for visible
   Claude/Codex browser login, authenticated CLI state, Smart App Control,
   signed-installer launch, and exact-version restart survival.
2. `windows-public-signing`: SignPath credentials, project configuration, and a
   signed final installer receipt are absent.
3. `mac-public-notarization`: Developer ID Application identity, notarization
   credentials, notarization acceptance, and stapling receipts are absent.

## Distribution Boundary

- No `0.2.12` tag was created.
- No GitHub release was created or modified.
- No installer was publicly uploaded.
- No production deployment, paid action, credential mutation, database deletion,
  or user-data deletion occurred.
- Public latest remains `v0.1.66` until the external gates above pass.

## Release Decision

Local installed candidate: verified.

Public distribution: blocked by external signing and physical-Windows evidence.
