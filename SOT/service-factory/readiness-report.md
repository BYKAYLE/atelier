# Readiness Report

generated_at: 2026-07-23T02:13:43+09:00

## Goal

Stabilize Atelier as a distributable local agent workspace without hiding the
difference between source readiness, package readiness, installed state, and
public distribution state.

## Current Readiness

`release_candidate_with_external_gates`

This is not a public-release completion claim. Stella Factory completion remains
blocked until the three unmet Definition of Done items have execution receipts.

## Truth Surfaces

- Source and automated checks: ready at commit `efee003` on
  `codex/release-readiness-final`.
- Local macOS package: `0.2.12` builds successfully and passes strict bundle,
  DMG payload, renderer-readiness, and local-signing verification.
- Installed macOS app: `/Applications/Atelier.app` is version `0.2.12`, is
  running, and its signed executable exactly matches the packaged app executable
  at SHA-256
  `009e3a0926524a4d6b70fff16ce9b59f1fe258d959d1e82bc686d3f898c11997`.
- Public macOS release: blocked. The local certificate is not a Developer ID
  Application certificate, and notarization and stapling receipts do not exist.
- Windows source and workflow gates: ready for CI execution. The release workflow
  now fails closed when Windows signing configuration or required release
  evidence is absent.
- Windows physical proof: blocked until a physical Windows runner proves visible
  Claude/Codex browser login, authenticated CLI state, Smart App Control,
  signed-installer execution, and exact-version restart survival.
- Signed direct Windows installer: blocked until SignPath or an equivalent public
  signing path signs the final artifact and the signature receipt passes.
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
