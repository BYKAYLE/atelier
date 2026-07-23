# Readiness Report

generated_at: 2026-07-23T20:12:04+09:00

## Goal

Stabilize Atelier as a distributable local agent workspace without hiding the
difference between source readiness, package readiness, installed state, and
public distribution state.

## Current Readiness

`release_candidate_with_external_gates`

This is not a public-release completion claim. Stella Factory completion remains
blocked until the three unmet Definition of Done items have execution receipts.

## Truth Surfaces

- Source and automated checks: the current candidate on
  `codex/release-readiness-final`, based on commit `eb44c2c`, passes the release
  evidence smoke, release security audit, shared preflight smoke, OAuth login
  flow smoke, updater contract smoke, release-candidate smoke, frontend build,
  Windows runner doctor contract smoke, workflow lint, and whitespace audit.
  Hermes also exposes an Anthropic backend backed by the existing Claude
  subscription/API credential path and the live Claude model catalog.
- External infrastructure preflight: schema 2 inspected the source, local
  release host, and GitHub configuration without reading secret values. The
  clean-source, macOS toolchain, GitHub API, protected `production-release`
  environment, and required-reviewer checks pass.
- Local macOS package: `0.2.12` builds successfully and passes strict bundle,
  DMG payload, renderer-readiness, and local-signing verification.
- Installed macOS app: `/Applications/Atelier.app` is version `0.2.12`, is
  running, and its signed executable exactly matches the packaged app executable
  at SHA-256
  `0a7b87c262ccdbca8f94b3fc3c31638a620ab2cdfcdae9b513464165343c2c60`.
- Public macOS release: blocked. The local certificate is not a Developer ID
  Application certificate, and notarization and stapling receipts do not exist.
- Windows source and workflow gates: ready for CI execution. The release workflow
  now fails closed when Windows signing configuration or required release
  evidence is absent. Candidate, package, provider, and runner-preflight receipts
  must agree on release tag, source SHA, GitHub run ID, run attempt, and physical
  runner name. Existing browser windows are not accepted as new login evidence.
  A preparation-only doctor workflow verifies the interactive runner before a
  tag is created and emits a distinct phase that publication cannot consume.
  In addition, all Rust targets pass a cached `cargo-xwin` check for
  `x86_64-pc-windows-msvc` on this source candidate. This proves Windows source
  compilation only; it does not replace package, browser, signature, or
  physical-device evidence.
- Windows physical proof: blocked until a physical Windows runner proves visible
  Claude/Codex browser login, authenticated CLI state, Smart App Control,
  signed-installer execution, and exact-version restart survival.
  GitHub currently has no registered self-hosted runner, so neither a runner
  doctor receipt nor a physical-gate workflow receipt exists.
- Signed direct Windows installer: blocked until SignPath or an equivalent public
  signing path signs the final artifact and the signature receipt passes.
- Release credentials: the repository currently contains the two Tauri updater
  signing secrets only. Apple Developer ID/notarization and SignPath credentials
  and both SignPath variables are absent. The local keychain has no Developer ID
  Application identity. No matching self-hosted Windows x64 runner is registered
  or online, so the infrastructure preflight correctly returns `blocked`.
- Public GitHub distribution: still `v0.1.66`; no `0.2.12` tag or release was
  published from this unsigned local candidate.

## Evidence

See `SOT/service-factory/release-readiness-2026-07-23.md` for the exact local
candidate evidence and the remaining external gates.

## Next Executable Action

Provision the production signing identities and CI secrets, register the
interactive Windows x64 runner, pass `Windows Release Runner Doctor`, run the
protected release workflow, and attach the macOS notarization/stapling receipt
plus the physical-Windows OAuth, signature, and restart-survival receipt before
any tag or public release is created.
