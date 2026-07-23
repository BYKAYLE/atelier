# GitHub Release Readiness

Assessment date: 2026-07-23

Candidate version: `0.2.12`

Scope: direct GitHub distribution. Microsoft Store submission and approval are
outside this assessment.

## Verdict

The source, local build, local macOS package, and currently installed macOS
application pass the available local gates. Public GitHub distribution remains
blocked because the repository does not yet have the production signing,
notarization, and physical Windows evidence required by the release workflow.

Do not create or publish the version tag until every item in "Distribution
blockers" is resolved and the sealed evidence validator accepts one exact
candidate.

## Verified Locally

| Surface | Result | Evidence |
| --- | --- | --- |
| Source metadata | Pass | `package.json`, `Cargo.toml`, `Cargo.lock`, and `tauri.conf.json` resolve to `0.2.12`. |
| Frontend production build | Pass | TypeScript and Vite production build completed. The largest JavaScript chunk is about 1.42 MB before gzip and remains a performance debt. |
| Rust backend | Pass | `cargo check`, formatting, and the complete test suite passed: 188 passed, 0 failed, 1 ignored live subscription test. |
| Security and release contracts | Pass | Release audit, updater contract, publish evidence, candidate evidence, OAuth flow, Windows runner doctor, and workflow lint gates passed. |
| Optional feature isolation | Pass | Ten optional modules were removed individually from frontend and Rust builds, dependency expansion was checked, and the complete bundle was restored. |
| Runtime regressions | Pass | PTY, review, agent fleet, editor diagnostics, CLI, GitHub, Linear, SSH, provider usage, mobile control, remote follow-up, preview, notifications, and input-performance smokes passed. |
| PTY responsiveness | Pass | Local median input round trip was about 1.58 ms and p95 about 1.92 ms. |
| macOS local package | Pass with limitation | `Atelier.app` and `Atelier_0.2.12_aarch64.dmg` were produced, locally signed, launched to a renderer-ready receipt, and checked for protected resource declarations. Generated package receipts hold the exact app and DMG hashes because signing or rebuilding a container changes artifact bytes. Developer ID notarization and stapling were not available. |
| Installed macOS app | Pass | `npm run release:installed-proof:mac` verifies `/Applications/Atelier.app` as version `0.2.12` with bundle identifier `com.atelier.app`. Its executable SHA-256 exactly matches the locally packaged candidate, and its installed-path renderer-ready receipt reports `status: ready`. The machine-readable receipt, including exact hashes, is written to `artifacts/macos-installed-candidate-proof.json`. |
| Responsive renderer | Pass with limitation | The production renderer was inspected at 1600x900, 900x800, and 720x700 without root overflow, black screen, clipped composer, or hidden send button. Native macOS screen capture permission was unavailable, so this is renderer evidence rather than a native permission-flow recording. |
| Compact navigation accessibility | Pass | Compact theme and settings controls have localized accessible names and tooltips. |

## Distribution Blockers

1. Apple Developer ID and notarization credentials are not configured:
   `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
   `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and
   `APPLE_TEAM_ID`.
2. Windows SignPath configuration is incomplete:
   `SIGNPATH_API_TOKEN`, `SIGNPATH_ORGANIZATION_ID`, and
   `SIGNPATH_PROJECT_SLUG`.
3. No online interactive self-hosted Windows x64 release runner is registered.
4. No physical Windows evidence currently proves the exact candidate's
   Authenticode signature, native Claude/Codex browser login, real Tauri updater
   installation, updater-driven relaunch, installed executable hash, and
   restart persistence.
5. No sealed private draft has passed the approval-protected publish validator,
   so GitHub release assets and `latest.json` are not distribution proof.

## Residual Risks

- The main renderer chunk is about 1.42 MB before gzip. This is not a release
  correctness failure, but code splitting should be scheduled before the UI
  grows further.
- The dependency audit reports upstream unmaintained packages. The two unsound
  advisories observed locally are absent from macOS/Windows runtime target
  trees or limited to Tauri build dependencies, but they should remain tracked.
- The bundle identifier ends in `.app`, which Tauri warns can conflict with the
  application bundle extension. Changing it requires an explicit application
  identity and updater migration rather than a last-minute rename.
- One live Claude subscription usage test is intentionally ignored unless a
  signed-in subscription is available.

## Publication Rule

A GitHub release is ready only when all of these truth surfaces agree:

1. the reviewed source commit and version tag;
2. signed and notarized macOS assets;
3. timestamp-signed Windows assets;
4. one physical Windows updater and provider-authentication evidence set from
   the same GitHub run and source commit;
5. the sealed manifest and updater metadata;
6. approval from the protected `production-release` environment.

Until then, `0.2.12` is a locally validated release candidate, not a public
production release.
