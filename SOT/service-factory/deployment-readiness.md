# Stella Factory Deployment Readiness

generated_at: 2026-07-10T18:28:00+09:00

## Verdict

release_candidate_with_external_gates

## Local macOS Evidence

- Version metadata is consistent across `package.json`, `Cargo.toml`, and
  `tauri.conf.json`: `0.1.79`.
- `npm run tauri:build` produced:
  - `src-tauri/target/release/bundle/macos/Atelier.app`
  - `src-tauri/target/release/bundle/dmg/Atelier_0.1.79_aarch64.dmg`
- `/Applications/Atelier.app` reports short/build version `0.1.79`.
- `codesign --verify --deep --strict --verbose=2` passes.
- The installed app process runs from
  `/Applications/Atelier.app/Contents/MacOS/atelier`.
- `spctl` rejects the local bundle because its authority is
  `Atelier Local Code Signing`; this is expected and is not public-distribution
  proof.

## Automated Release Gates

- Frontend build, fixture harness, npm production audit, Rust formatting,
  warning-free clippy, 50 Rust tests, release security audit, actionlint, and
  diff hygiene pass.
- Claude real-provider smoke passes with the local Claude subscription and
  `claude-opus-4-8`.
- Codex real-provider smoke passes with the local ChatGPT login and explicit
  `gpt-5.5`.
- Windows workflows install and smoke Claude/Codex/Hermes, inspect MSI/NSIS/MSIX
  payloads, and require Authenticode after signing.
- The release workflow has no unsigned Windows publication fallback.

## Required Before Public Release

- macOS: Developer ID Application signing plus Apple notarization/stapling.
- Windows direct installer: successful SignPath signing and signed-package
  smoke.
- Windows Store: successful MSIX package smoke and Partner Center validation.
- Physical Windows: interactive Claude and Codex browser-login round trip,
  including default-browser launch and Smart App Control behavior.

## Boundaries

- No external publication or production deployment was performed in this run.
- A macOS host cannot provide evidence that an interactive Windows browser flow
  works on the target machine.
