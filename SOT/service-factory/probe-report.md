# Stella Factory Probe Report

generated_at: 2026-07-13T09:35:39+09:00

## Commands

- `npm run build` -> 0
- `npm run harness:fixture` -> 0
- real Claude/Codex/Hermes harness calls -> `OK`, exit 0
- `npm audit --omit=dev` -> 0 vulnerabilities
- native and Store strict Clippy -> 0
- native and Store Rust test suites -> 86/86 each
- parallel worktree-adoption tests -> 5 consecutive 4/4 passes
- Windows normal and Store cargo-xwin strict Clippy/link -> PE32+ x86-64
- `npm run smoke:devscreen-picker` -> host redaction/prompt contract pass
- real browser picker script -> exact overlay geometry, suppressed target
  action, bounded selector/CSS evidence, and Escape cancellation pass
- `npm run smoke:pty-supervisor` -> reconnect and parallel-session pass
- `npm run smoke:updater-contract` -> updater platform contract pass
- `npm run smoke:agent-performance` -> ref-backed composer, activity-row-only
  elapsed timer, and completed-transcript content visibility pass
- `npm run audit:release` -> 0 known vulnerabilities
- `actionlint` -> 0
- `shellcheck tools/*.sh` -> 0
- Windows PowerShell browser-process/visible-window gate -> source invariant
  and actionlint pass; target-host execution still required
- Service Factory state validation -> valid, no errors or warnings
- `git diff --check` -> 0
- `npm run tauri:build` -> 0
- packaged renderer-ready probe -> exact 0.2.5 executable/PID/window/status
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app` -> 0
- installed short/native version probes -> 0.2.5
- installed renderer-ready probe -> 0.2.5, live installed PID, window `main`,
  status `ready`
- installed Codex and Claude browser probes -> 0
- installed signed OAuth helper -> allowed Codex URL exit 0; unrelated HTTPS
  URL rejected with exit 1
- installed PTY smoke -> three reattached sessions; 100 writes at 1.572 ms
  median / 1.932 ms p95
- installed automated visual probe -> layer-zero surfaces exist, but no
  accessibility/on-screen window in the current non-interactive launch context;
  retained 0.2.3 reproduces the same result, so no fresh visual pass is claimed
- preview-evidence UI at 1440 x 900 and 720 x 900 -> zero horizontal
  overflow with HTTP/server details expanded

## Result

Source, provider adapters, local package, installed macOS reflection, preview
evidence, click-to-select target handoff, and Windows cross-target gates pass. Public signing/notarization and
physical-Windows browser authentication, signed restart survival, and Smart App
Control remain external validation gates and are not inferred from this host.
