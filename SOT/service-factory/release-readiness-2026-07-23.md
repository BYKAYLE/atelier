# Atelier 0.2.12 Release Readiness Evidence

generated_at: 2026-07-23T20:12:04+09:00
source_base_commit: eb44c2c13c0b729aa43190eef77ff437ba9bf0c2
branch: codex/release-readiness-final

## Source And Automated Gates

- Release URL, repository, tag, asset, signature, and manifest contracts fail
  closed.
- Local and CI release checks now share `tools/release-preflight.mjs`. It binds
  the three version sources, GitHub repository, updater endpoint and public key,
  direct/Store updater separation, clean tracked source, and the complete Apple,
  Tauri, and SignPath credential-name set. Reports contain presence only, never
  credential values.
- The tag workflow evaluates that contract in strict mode before either platform
  build and preserves `release-preflight.json` even when the gate blocks.
- macOS release evidence binds the app, DMG, updater archive, Developer ID team,
  notarization, stapling, version, renderer readiness, and executable hashes.
- Windows release evidence requires a timestamped Authenticode signature on the
  installer, packaged payload, and installed executable before publication.
- Windows publication receipts are now bound to one release tag, source SHA,
  GitHub run ID, positive run attempt, and named physical runner across the
  runner preflight, candidate, package, and provider evidence. The publisher
  also verifies the exact successful physical-gate job and its Windows x64
  self-hosted labels before accepting those receipts.
- A separate `Windows Release Runner Doctor` workflow now checks the physical
  host before a release tag exists. It requires the interactive self-hosted
  Windows x64 runner context and checks desktop visibility, required tools,
  writable storage, pending reboot, baseline installation, default browser,
  Authenticode trust, and optional Smart App Control state. Its report phase is
  `windows-runner-doctor`, so candidate and publication validators cannot treat
  preparation evidence as a release receipt. The workflow does not download a
  candidate or hold publication permissions.
- Windows Store detection now uses the real Appx package identity or the
  `WindowsApps` location. Product-name heuristics no longer suppress the GitHub
  updater for a normal installer.
- Store packaging executes the lockfile-pinned `@microsoft/winappcli@0.3.1`
  entry point. A mutable global CLI cannot silently change package output.
- Claude and Codex browser-login URLs are HTTPS/provider allowlisted. The UI
  applies a bounded retry plan, while the physical Windows gate separately
  requires a newly observed visible native-browser process and authenticated
  CLI receipt. A browser that was already open before the login probe no longer
  satisfies publication evidence.
- The Orca feature gate passed 20 contract smokes across 10 removable backend
  features and restores the full production bundle in `finally`, including
  after a restricted-build failure.
- The final frontend manifest contains all 10 default features and no excluded
  features.
- Frontend build, release-candidate smoke, publish-evidence smoke, updater
  contract smoke, OAuth-login smoke, release security audit, Orca feature gate,
  Rust format, Clippy, tests, and native/store builds passed on this source
  candidate.
- The final release-evidence hardening pass additionally passed `actionlint`,
  `git diff --check`, `npm run build`, and the release preflight, OAuth,
  updater, candidate, publication-evidence, and security-audit smokes. PowerShell
  execution remains intentionally unclaimed on this macOS host.
- Commit `eb44c2c` additionally passed the Windows runner doctor contract smoke,
  workflow lint, release security audit, release preflight smoke,
  release-candidate smoke, publication-evidence smoke, updater-contract smoke,
  OAuth-login smoke, frontend production build, and whitespace validation.
- Hermes now exposes Anthropic as a selectable backend, reuses the verified
  Claude subscription/API credential path, consumes the live Claude model
  catalog, and normalizes `/provider anthropic`. Its backend-routing regression
  test passes.
- Rust tests: 190 passed, 0 failed, 1 ignored in both native and store-feature
  configurations.
- `npm audit --audit-level=low`: 0 known vulnerabilities.
- RustSec release audit: 0 release-target vulnerabilities. Upstream warnings
  remain (`unmaintained: 18`, `unsound: 2`) and are not represented as clean.
- Windows PowerShell physical/provider smokes cannot execute on this macOS host;
  their real-device evidence remains a separate required gate.
- A cached local
  `CARGO_NET_OFFLINE=true cargo xwin check --target x86_64-pc-windows-msvc
  --manifest-path src-tauri/Cargo.toml --all-targets` completed successfully at
  commit `eb44c2c`. This is Windows source-compilation proof only. It is not
  Windows package-install, OAuth-browser, Smart App Control, updater-survival,
  or Authenticode proof.
- The shared preflight now has an opt-in release-infrastructure phase. At commit
  `eb44c2c`, `npm run release:readiness` passed the version, repository,
  updater, clean-source, macOS toolchain, GitHub API, protected production
  environment, and required-reviewer checks. Its JSON report is schema 2 and
  records credential names only; secret values are neither read nor serialized.
- The local host has `security`, `codesign`, `spctl`, `hdiutil`, `notarytool`,
  and `stapler`, but its keychain has no Developer ID Application identity.
- The GitHub repository currently has only `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. It is missing the seven Apple/SignPath
  repository secrets and both SignPath repository variables required by the
  release workflow. The `production-release` environment exists, enforces its
  branch policy, and has one required reviewer; it has no environment-level
  credentials. No matching self-hosted Windows x64 runner is registered or
  online.
- The exact infrastructure blockers recorded in
  `artifacts/release-readiness-preflight.json` are
  `macos-developer-id-identity`, `github-release-secrets`,
  `github-release-variables`, `github-windows-runner-registration`, and
  `github-windows-runner-online`.

## Local macOS Package

- App bundle:
  `src-tauri/target/release/bundle/macos/Atelier.app`
- DMG:
  `src-tauri/target/release/bundle/dmg/Atelier_0.2.12_aarch64.dmg`
- DMG SHA-256:
  `37241c6367ed6971726b5aa6f6b3151cf0090c0cf20ae7fe1053f07c8fcc57aa`
- DMG bytes: `13484993`
- DMG built at: `2026-07-23T19:57:30+0900`
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
- Running PID at evidence time: `28062`
- Renderer receipt: version `0.2.12`, PID `28062`, window `main`, status `ready`.
- Packaged executable SHA-256:
  `0a7b87c262ccdbca8f94b3fc3c31638a620ab2cdfcdae9b513464165343c2c60`
- Installed executable SHA-256:
  `0a7b87c262ccdbca8f94b3fc3c31638a620ab2cdfcdae9b513464165343c2c60`
- Reflection verdict: exact match.
- The installed application bundle was replaced with the verified candidate
  after the prior process exited. Application Support, credentials, user data,
  and databases were not modified or deleted.

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
   GitHub currently reports no registered self-hosted runner. Therefore neither
   `windows-release-runner-doctor.yml` nor
   `windows-physical-release-gate.yml` can produce real-device evidence yet.
2. `windows-public-signing`: SignPath credentials, project configuration, and a
   timestamped signed final installer receipt are absent.
3. `mac-public-notarization`: Developer ID Application identity, notarization
   credentials, notarization acceptance, and stapling receipts are absent.

The macOS keychain currently contains an Atelier local signing identity and an
Apple Development identity. Neither is a Developer ID Application identity for
public distribution.

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
