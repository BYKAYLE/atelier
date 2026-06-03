# QC Matrix

## Verification Candidates

- `git diff --check`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture`
- `npm run harness:fixture`

## Required Gates

- Type/build checks for changed frontend surfaces.
- Rust/Tauri tests for backend command or permission changes.
- Harness/fixture checks for agent runtime changes.
- UI/runtime Probe when user-visible behavior changes.
- Security review for auth, command execution, credential, data, or network surfaces.
- Release readiness for installer/updater/version changes.

## Readiness Promotion

`pilot_ready` requires passing applicable gates and naming residual risks.
