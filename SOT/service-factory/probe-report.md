# Stella Factory Probe Report

generated_at: 2026-07-10T18:28:00+09:00

## Commands

- `npm run build` -> 0
- `npm run harness:fixture` -> 0
- `npm audit --omit=dev --audit-level=high` -> 0 vulnerabilities
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` -> 0
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` -> 0
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` -> 50 passed
- `npm run audit:release` -> 0 known vulnerabilities
- `actionlint` -> 0
- `git diff --check` -> 0
- real Claude harness with `opus` and automatic permission -> 0
- real Codex harness with `gpt-5.5` and automatic permission -> 0
- `npm run tauri:build` -> 0
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app` -> 0
- installed `CFBundleShortVersionString` / `CFBundleVersion` -> 0.1.79

## Result

Source, provider adapters, local package, and installed macOS reflection pass.
Public signing and physical-Windows OAuth remain external validation gates.
