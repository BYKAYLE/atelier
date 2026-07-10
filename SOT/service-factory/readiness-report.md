# Readiness Report

generated_at: 2026-07-10T18:28:00+09:00

## Goal

Stabilize Atelier as a distributable local agent workspace without hiding the
difference between source readiness, installed state, and public release state.

## Current Readiness

`release_candidate_with_external_gates`

## Truth Surfaces

- Source and automated checks: ready.
- Installed macOS app: reflected at 0.1.79 and running from
  `/Applications/Atelier.app`.
- Public macOS release: blocked on Developer ID signing and notarization.
- Windows source and package gates: ready for CI execution.
- Windows interactive Claude/Codex subscription login: validation required on a
  physical Windows machine.
- Signed direct Windows installer: blocked until SignPath signs the artifact.

## Next Executable Action

Run the release workflow with production signing secrets, then execute the
physical-Windows OAuth and signed-installer checklist before publication.
