# Atelier 0.2.12 Release Readiness Evidence

generated_at: 2026-07-23T09:06:47+09:00
source_commit: 6d5fe145755a39ba64bf55c27535aef56e0254c7
branch: codex/release-readiness-final

## Source And Automated Gates

- Release URL, repository, tag, asset, signature, and manifest contracts fail
  closed.
- macOS release evidence binds the app, DMG, updater archive, Developer ID team,
  notarization, stapling, version, renderer readiness, and executable hashes.
- Windows release evidence requires a timestamped Authenticode signature on the
  installer, packaged payload, and installed executable before publication.
- Windows Store detection now uses the real Appx package identity or the
  `WindowsApps` location. Product-name heuristics no longer suppress the GitHub
  updater for a normal installer.
- Store packaging executes the lockfile-pinned `@microsoft/winappcli@0.3.1`
  entry point. A mutable global CLI cannot silently change package output.
- Claude and Codex browser-login URLs are HTTPS/provider allowlisted. The UI
  applies a bounded retry plan, while the physical Windows gate separately
  requires a visible native-browser handoff and authenticated CLI receipt.
- The Orca feature gate passed 20 contract smokes across 10 removable backend
  features and restores the full production bundle in `finally`, including
  after a restricted-build failure.
- The final frontend manifest contains all 10 default features and no excluded
  features.
- Frontend build, release-candidate smoke, publish-evidence smoke, updater
  contract smoke, OAuth-login smoke, release security audit, Orca feature gate,
  Rust format, Clippy, tests, and native/store builds passed on this source
  candidate.
- Rust tests: 188 passed, 0 failed, 1 ignored in both native and store-feature
  configurations.
- `npm audit --audit-level=low`: 0 known vulnerabilities.
- RustSec release audit: 0 release-target vulnerabilities. Upstream warnings
  remain (`unmaintained: 18`, `unsound: 2`) and are not represented as clean.
- Windows PowerShell physical/provider smokes cannot execute on this macOS host;
  their real-device evidence remains a separate required gate.

## Local macOS Package

- App bundle:
  `src-tauri/target/release/bundle/macos/Atelier.app`
- DMG:
  `src-tauri/target/release/bundle/dmg/Atelier_0.2.12_aarch64.dmg`
- DMG SHA-256:
  `3c0ab0cbbc41fcfa149580ae1e766b3c731c50e131276b2c3ea66896d6954fb7`
- DMG bytes: `13478098`
- DMG built at: `2026-07-23T09:01:00+0900`
- Bundle verification: strict code-signature verification passed.
- Renderer readiness: passed for the packaged and installed executables.
- Signing identity: `Atelier Local Code Signing`.
- Public trust: not established. This identity is not a Developer ID Application
  identity and cannot satisfy the public macOS release gate. Notarization was
  skipped because Apple signing/notarization credentials are not configured.

## Installed macOS Reflection

- Installed path: `/Applications/Atelier.app`
- Installed version: `0.2.12`
- Running executable: `/Applications/Atelier.app/Contents/MacOS/atelier`
- Running PID at evidence time: `90097`
- Renderer receipt: version `0.2.12`, PID `90097`, window `main`, status `ready`.
- Packaged executable SHA-256:
  `0bddffc993bd7849176fc77e97e3470eb3ffdfa6bd98c9b0248fba7f3459d159`
- Installed executable SHA-256:
  `0bddffc993bd7849176fc77e97e3470eb3ffdfa6bd98c9b0248fba7f3459d159`
- Reflection verdict: exact match.
- Previous installed bundle was preserved at
  `/tmp/Atelier.app.pre-release-20260723-090155`; no user data or database was
  deleted.

## Residual Engineering Debt

- The production JavaScript entry chunk is approximately 1.42 MB after
  minification. Vite emits a chunk-size warning; this is performance debt, not
  a packaging failure.
- The bundle identifier `com.atelier.app` triggers Tauri's warning about an
  identifier ending in `.app`. It is retained for compatibility with installed
  identity and credential storage and must be migrated deliberately, not during
  this release gate.
- The release security audit records upstream Rust maintenance and unsoundness
  warnings. These require dependency-owner remediation or a separately reviewed
  migration and are not hidden by the target-specific vulnerability result.

## External Release Gates

1. `physical-windows`: no physical Windows execution receipt exists for visible
   Claude/Codex browser login, authenticated CLI state, Smart App Control,
   timestamped signed-installer launch, and exact-version restart survival.
2. `windows-public-signing`: SignPath credentials, project configuration, and a
   timestamped signed final installer receipt are absent.
3. `mac-public-notarization`: Developer ID Application identity, notarization
   credentials, notarization acceptance, and stapling receipts are absent.

## Distribution Boundary

- GitHub was read at evidence time. Public latest is `v0.1.66`, published
  `2026-07-04T08:21:53Z`.
- No `0.2.12` tag was created.
- No GitHub release was created or modified.
- No installer was publicly uploaded.
- No production deployment, paid action, credential mutation, database deletion,
  or user-data deletion occurred.
- A direct installer upgrade is not evidence of the in-app updater path. The
  updater needs a previous public version and public `latest.json` canary after
  the first signed release establishes the channel.

## Release Decision

Source candidate: verified.

Local macOS package and installed application: verified.

Public distribution: not approved. It remains gated by public macOS signing and
notarization, timestamped Windows signing, and a physical Windows login/update
receipt.
