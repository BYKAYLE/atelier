# Evidence Map

updated_at: 2026-07-17T20:39:00+09:00

| Capability | Source evidence | Runtime/package evidence | Status |
|---|---|---|---|
| Detached PTY ownership and reconnect | `src-tauri/src/pty_supervisor.rs`, `src-tauri/src/pty.rs` | `npm run smoke:pty-supervisor`; installed p95 1.932 ms; persistent nested split UI | ready |
| Packaged renderer readiness | `src-tauri/src/runtime_receipt.rs`, `src/main.tsx` | exact executable/PID/version/window/status receipt; signed package and installed-app probes pass | ready |
| Long-session typing and transcript rendering | `src/components/AgentWorkspace.tsx`, `src/index.css` | `npm run smoke:agent-performance`; all release workflows enforce contract | ready |
| Persistent terminal pane tree | `src/lib/terminalLayout.ts`, `src/components/Main.tsx` | module smoke plus browser right/down, drag, keyboard, reload, and close-collapse checks | ready |
| Normalized provider lifecycle and cancel | `src-tauri/src/agent_lifecycle.rs`, `src-tauri/src/agent_registry.rs` | 86 Rust tests; fixture harness | ready |
| Optional task isolation | `src-tauri/src/agent_worktree.rs` | overlap/refusal and non-overlap adoption tests | ready |
| Candidate comparison and adoption | `src/components/AgentWorkspace.tsx`, `agent_worktree.rs` | alternate-index conflict tests; explicit UI action | ready |
| Line-level change review | `src/lib/diffReview.ts`, `src/components/AgentWorkspace.tsx` | parser smoke; desktop/compact add, persist, send, resolve, reload checks | ready |
| Automatic preview evidence | `src/lib/devScreen.ts`, `src/components/AgentWorkspace.tsx` | real bridge fixture plus success/failure completion capture contract | ready |
| Click-to-select preview target | `src/lib/devScreen.ts`, `src/components/AgentWorkspace.tsx` | exact overlay geometry, suppressed page click, Escape cancel, composer attachment, dedicated smoke | ready |
| Preview evidence security boundary | `tools/release-security-audit.mjs` | four seeded secrets/query absent; release audit pass | ready |
| Public Atelier CLI and control plane | `src-tauri/src/atelier_cli.rs`, `src-tauri/src/control_plane.rs` | CLI/control-plane smoke; bounded command and path tests; abandoned-claim recovery | ready |
| GitHub workflow handoff | `src-tauri/src/github_workflows.rs`, `src/components/github-workflows/` | typed read/mutation contracts, exact approval hashes, private receipts, focused smoke | ready |
| Linear workflow handoff | `src-tauri/src/linear_workflows.rs`, `src/components/linear-workflows/` | fixed GraphQL operations, exact approval hashes, no-delete contract, focused smoke | ready |
| SSH workspaces and loopback tunnels | `src-tauri/src/ssh_workspaces.rs`, `src/components/ssh-workspaces/` | explicit host-key trust, typed worktree approval, focused smoke; no live remote mutation | ready_source |
| Provider usage | `src-tauri/src/provider_usage.rs`, `src/components/provider-usage/` | documented OpenRouter parser plus Claude/Codex official CLI-state contract | ready |
| Mobile pairing and monitoring | `src-tauri/src/mobile_control.rs`, `src/components/mobile-control/` | actual LAN HTTPS `/health` test, one-use pairing, revocation, focused smoke | ready_local |
| Remote follow-up | `src-tauri/src/remote_followup.rs`, `src/components/remote-followup/` | proposal-only mobile path, exact desktop approval, existing task queue dispatch | ready_local |
| Approval-based Computer Use | `src-tauri/src/computer_use.rs`, `src/components/computer-use/` | disabled default, three-action allowlist, expiry/one-use approval and receipts | ready_local |
| macOS package/install reflection | `tools/build-macos-bundle.sh`, `tools/verify-macos-bundle.sh` | `Atelier_0.2.9_aarch64.dmg`; executable SHA-256 `a8eb9f13f9d85d11c392292f48dd53f81dbf8ed16b19db4ecee8798888dc67c8`; strict local signature, renderer receipt, cold launch, and close/relaunch visible-window probes pass | ready_local |
| Windows normal/Store source and link | workflows, `tools/windows-provider-smoke.ps1` | two PE32+ x86-64 links and strict cargo-xwin Clippy | ready_cross_target |
| Physical Windows OAuth/Smart App Control/update survival | hosted process-observation and manual visible-window workflows | source contract passes; no registered physical runner or Windows execution receipt | validation_required |
| Public signing and notarization | release workflows | SignPath/Developer ID credentials not available locally | external_gate |

## Primary Receipts

- `SOT/evidence-log.md`
- `SOT/service-factory/deployment-readiness.md`
- `SOT/service-factory/final-audit.md`
- `SOT/service-factory/orca-adoption-roadmap.md`
- `src-tauri/target/atelier-harness/atelier-agent-harness-2026-07-12T15-42-52-373Z.json`

## Non-Evidence

- A successful cross-target link is not physical Windows behavior.
- A native OAuth helper exit code is not proof that a browser became visible or
  that the provider accepted the login.
- A local signing identity is not a public Gatekeeper/notarization identity.
- A generated file name is not package reflection unless version, signature,
  hash, and installed executable are checked separately.
- A renderer-ready receipt from an already-running process is not proof that a
  newly replaced bundle created a visible window. The 0.2.9 receipt therefore
  includes a clean process launch plus a macOS window-count and screenshot
  observation.
