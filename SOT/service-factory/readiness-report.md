# Readiness Report

generated_at: 2026-07-23T10:33:23+09:00

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
  `codex/release-readiness-final`, based on commit `38b411d`, passes the release
  evidence smoke, release security audit, shared preflight smoke, OAuth login
  flow smoke, updater contract smoke, release-candidate smoke, frontend build,
  workflow lint, and whitespace audit.
- Local macOS package: `0.2.12` builds successfully and passes strict bundle,
  DMG payload, renderer-readiness, and local-signing verification.
- Installed macOS app: `/Applications/Atelier.app` is version `0.2.12`, is
  running, and its signed executable exactly matches the packaged app executable
  at SHA-256
  `e198d7f8a3bd6928c917a77c5830cdb3b6169d2e3236d73bfb1137d983a1a953`.
- Public macOS release: blocked. The local certificate is not a Developer ID
  Application certificate, and notarization and stapling receipts do not exist.
- Windows source and workflow gates: ready for CI execution. The release workflow
  now fails closed when Windows signing configuration or required release
  evidence is absent. Candidate, package, provider, and runner-preflight receipts
  must agree on release tag, source SHA, GitHub run ID, run attempt, and physical
  runner name. Existing browser windows are not accepted as new login evidence.
- Windows physical proof: blocked until a physical Windows runner proves visible
  Claude/Codex browser login, authenticated CLI state, Smart App Control,
  signed-installer execution, and exact-version restart survival.
  GitHub currently has no registered self-hosted runner and no physical-gate
  workflow execution receipt.
- Signed direct Windows installer: blocked until SignPath or an equivalent public
  signing path signs the final artifact and the signature receipt passes.
- Release credentials: the repository currently contains the two Tauri updater
  signing secrets only. Apple Developer ID/notarization and SignPath credentials
  are absent, so the strict shared preflight correctly returns `blocked`.
- Public GitHub distribution: still `v0.1.66`; no `0.2.12` tag or release was
  published from this unsigned local candidate.

## Evidence

See `SOT/service-factory/release-readiness-2026-07-23.md` for the exact local
candidate evidence and the remaining external gates.

## Next Executable Action

Provision the production signing identities and CI secrets, run the protected
release workflow, and attach the macOS notarization/stapling receipt plus the
physical-Windows OAuth, signature, and restart-survival receipt before any tag or
public release is created.
