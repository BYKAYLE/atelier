# Contributing to Atelier

## Development Setup

Atelier uses Node.js, TypeScript, Rust, and Tauri.

```bash
npm ci --legacy-peer-deps
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

Run the focused smoke tests for every surface changed by the patch. Release,
updater, authentication, credential, or installer changes must also pass:

```bash
npm run smoke:updater-contract
npm run smoke:release-candidate
npm run smoke:publish-evidence
npm run smoke:release-preflight
npm run audit:release
```

## Change Rules

- Keep optional capabilities independently removable and preserve feature
  boundary tests.
- Do not read or copy provider-owned refresh tokens into Atelier storage.
- Do not delete databases or user data.
- Do not publish, deploy, charge, or contact external services without explicit
  approval.
- Never commit API keys, OAuth codes, credentials, private logs, or generated
  evidence containing personal data.
- Preserve existing behavior unless the change and migration are documented.

## Proof Required

Report each verified truth surface separately:

- source and tests;
- production build;
- packaged candidate;
- installed application;
- signed public distribution;
- physical Windows or macOS evidence when platform behavior is involved.

A successful source build is not proof that an installed updater or public
release works.

## Pull Requests

Use the pull request template, keep changes scoped, and list the exact commands
that passed. Release workflow changes must fail closed when required evidence is
missing.
