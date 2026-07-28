# Readiness Report

generated_at: 2026-07-23T20:12:04+09:00
reconciled_at: 2026-07-26 KST

## Goal

Stabilize Atelier as a distributable local agent workspace without hiding the
difference between source readiness, package readiness, installed state, and
public distribution state.

## Current Readiness

`supervised local candidate, public release blocked`

This is a supervised local source/package/install statement. Public release
remains blocked by the P1 action boundary, public signing and notarization, and
physical Windows evidence.

## Truth Surfaces

- Current `0.2.14` source and automated checks: 230 all-feature Rust tests passed
  with 3 ignored; the Orca gate passed 23 contract smokes across 10 removable
  features; strict all-target/all-feature Clippy and format/diff checks passed;
  `npm audit` reports 0 vulnerabilities; and RustSec reports 0 known
  vulnerabilities while retaining 18 unmaintained and 2 unsound warnings.
- Runtime-safety source contract: managed preview start is fail-closed; trusted
  external localhost inspection remains available. Basic is the default and
  Auto retains sandboxing and approvals; visible/raw Full bypass is removed.
  Frontend and Rust guards share a prompt corpus, but phrase matching is not a
  complete action-level guarantee.
- Provider capability source: Claude/Codex support managed Basic/Auto.
  Hermes/Gajaecode use pinned Atelier-owned macOS runtimes, isolated default
  skills, and sandbox readiness; absent readiness fails before spawn. Direct
  CLI remains a separate manual, limited path.
- Installed runtime preparation: Gajaecode 0.11.7/Bun 1.3.14 with four verified
  defaults; Hermes pinned commit with 453 durable files and 73 installed
  skills. No user credentials are bundled.
- Historical `0.2.12` source and automated checks: the candidate on
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
- Current local macOS package: `0.2.14` builds successfully and passes codesign,
  executable-hash, and renderer-readiness verification. DMG SHA-256 is
  `3f9aba91eee83ec12cb1da2a24d3a470ff5cafd2d2e2668011a37e010563cd5b`.
- Installed macOS app: `/Applications/Atelier.app` is version `0.2.14`, is
  renderer-ready, and its executable exactly matches the candidate at SHA-256
  `4ee04fbed757f015c910171f4e7c0c3979ca009d396f90a6abfb890e2e1b1868`.
  The proof records a dirty worktree, so HEAD does not uniquely identify the
  build; the executable SHA-256 does.
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
- Public GitHub distribution at the 2026-07-23 evidence time was `v0.1.66`; no
  `0.2.12`, `0.2.13`, or `0.2.14` release is claimed by this reconciliation.
- Current cycle actions: no public publish, public signing, notarization,
  deployment, DB/data deletion, paid action, or credential mutation occurred.

## Evidence

See `SOT/service-factory/release-readiness-2026-07-23.md` for the exact local
candidate evidence and the remaining external gates.

## Next Executable Action

Implement the app-owned action/tool proxy and scoped approval receipts.
Separately, provision the production signing identities and CI secrets, register the
interactive Windows x64 runner, pass the protected release gates, and attach
macOS notarization/stapling plus physical-Windows receipts before any public
release.
