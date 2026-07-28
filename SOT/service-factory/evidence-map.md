# Evidence Map

updated_at: 2026-07-26 KST

Current verdict: `supervised local candidate, public release blocked`.

`ready` in this table describes the named capability and evidence surface. It
does not imply fresh installed-app reflection or public-release approval.

| Capability | Source evidence | Runtime/package evidence | Status |
|---|---|---|---|
| `0.2.14` source gates | integrated source candidate | all-feature Rust 230 passed / 3 ignored; Orca 23 smokes / 10 removable features; strict all-target/all-feature Clippy; format/diff; `npm audit` 0; RustSec known vulnerabilities 0 with 18 unmaintained and 2 unsound warnings | ready_source |
| Permission boundary | guarded permission normalization and UI/runtime contract | Basic default; Auto sandbox plus approvals; visible/raw Full removed | ready_source |
| Provider-managed capability | provider capability contract plus installed readiness receipts | Claude/Codex managed Basic/Auto; Hermes/Gajaecode pinned Atelier-owned macOS runtimes with isolated skills and sandbox; absent readiness fails before spawn; direct CLI separate/manual/limited | ready_local |
| Managed provider bootstrap | `credentials.rs`, `agent.rs`, `agent_sandbox.rs`, installed UI | Gajaecode 0.11.7/Bun 1.3.14/4 defaults; Hermes pinned commit/453 durable files/73 installed skills; installed `설치·복구` passes | ready_local |
| Managed preview truth | backend capability plus UI reflection | managed start fail-closed; separately trusted localhost inspection retained | ready_source |
| Prompt guard parity | shared Korean/English frontend/Rust prompt corpus | known allow/block/mixed-negation cases pass; phrase denylist is not a complete action guarantee | defense_in_depth |
| Protected action mediation | planned app-owned action/tool proxy and scoped approval receipts | no action-level proxy receipt | p1_blocker |
| Detached PTY ownership and reconnect | `src-tauri/src/pty_supervisor.rs`, `src-tauri/src/pty.rs` | `npm run smoke:pty-supervisor`; installed p95 1.932 ms; persistent nested split UI | ready |
| Packaged renderer readiness | `src-tauri/src/runtime_receipt.rs`, `src/main.tsx` | `0.2.14` exact executable/PID/version/window/status receipt; candidate/install hash match; codesign pass | ready_local |
| Long-session typing and transcript rendering | `src/components/AgentWorkspace.tsx`, `src/index.css` | `npm run smoke:agent-performance`; all release workflows enforce contract | ready |
| Persistent terminal pane tree | `src/lib/terminalLayout.ts`, `src/components/Main.tsx` | module smoke plus browser right/down, drag, keyboard, reload, and close-collapse checks | ready |
| Normalized provider lifecycle and cancel | `src-tauri/src/agent_lifecycle.rs`, `src-tauri/src/agent_registry.rs` | 157-test all-feature Rust suite; fixture harness | ready |
| Session-scoped agent execution lifecycle | `src/components/agent-runtime/sessionRunRegistry.ts`, `src/components/agent-runtime/useSessionRunRegistry.ts` | concurrent-session, exact-turn finalize, stale-finalizer, and stop-precedence smoke enforced by `gate:orca-features` | ready |
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
| Development-service ownership | `src-tauri/src/dev_services.rs`, `src/components/dev-services/` | macOS, Windows, and Linux parser fixtures; PID-bound stop approval | ready_source |
| In-process automations | `src-tauri/src/automations.rs`, `src/components/automations/` | manual, interval, and daily schedules; bounded missed-run handling; queue dispatch and receipts | ready_local |
| Removable feature packages | `src/components/*/feature.manifest.json`, `vite.config.ts`, `src-tauri/Cargo.toml` | 10 isolated frontend/backend builds plus declared dependency-expansion smoke | ready |
| macOS package/install reflection | `tools/build-macos-bundle.sh`, `tools/verify-macos-bundle.sh`, installed proof JSON | `Atelier_0.2.14_aarch64.dmg`; candidate/installed executable SHA-256 `4ee04fbed757f015c910171f4e7c0c3979ca009d396f90a6abfb890e2e1b1868`; DMG SHA-256 `3f9aba91eee83ec12cb1da2a24d3a470ff5cafd2d2e2668011a37e010563cd5b`; local codesign, renderer-ready, and managed-provider UI evidence pass; dirty worktree means HEAD is not the build identifier | ready_local |
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
- Passing a prompt corpus is not proof that an external provider tool cannot
  perform an unmediated protected effect.
- The `0.2.14` local install is not Developer ID signing, notarization, public
  distribution, or physical Windows proof.
- A dirty-worktree HEAD SHA does not uniquely identify the installed candidate;
  the executable SHA-256 does.
- A renderer-ready receipt from an already-running process is not proof that a
  newly replaced bundle created a visible window. The current `0.2.12` receipt
  was produced from the newly copied `/Applications/Atelier.app` executable;
  the app was then relaunched from that installed path for visual reflection.
