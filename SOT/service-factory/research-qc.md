# Research Quality Control

updated_at: 2026-07-13T01:16:04+09:00

## Quality Gates

- Existing Atelier behavior was treated as the baseline; Orca was a reference,
  not permission for a rewrite.
- User-invokable features were separated from hidden runtime primitives in the
  capability table in `orca-adoption-roadmap.md`.
- Source truth, automated runtime truth, package truth, installed-app truth,
  physical-platform truth, and public-release truth are recorded separately.
- Security review rejects response bodies, request headers, cookies, browser
  storage, query strings, URL credentials, provider tokens, and credential-store
  scraping from preview evidence.
- Database deletion, user-data deletion, production deployment, paid actions,
  credential mutation, and external publication remain outside autonomous work.

## Reproducibility

- Frontend: `npm run build`.
- Rust: `cargo test --manifest-path src-tauri/Cargo.toml` and strict Clippy.
- Windows: strict normal/Store cargo-xwin Clippy plus both release links.
- Agent semantics: `npm run harness:fixture`.
- Session continuity: source and installed `npm run smoke:pty-supervisor`.
- Update contract: `npm run smoke:updater-contract`.
- Security/release: `npm run audit:release`.
- SOT shape: Service Factory `validate`.

## Residual Uncertainty

- Physical Windows browser appearance, authentication completion, Smart App
  Control, signed installer reputation, and update survival remain unobserved.
- Public macOS Gatekeeper behavior remains unobserved without Developer ID and
  notarization.
- Optional durable full network waterfalls, arbitrary pane splitting,
  line-level annotations, remote SSH worktrees, and mobile continuity are not
  release claims.

## QC Verdict

`local_release_candidate_with_external_platform_gates`
