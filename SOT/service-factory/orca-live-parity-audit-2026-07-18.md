# Orca live parity audit

Date: 2026-07-18 KST
Last verified: 2026-07-20 KST
Atelier base head before this working-tree pass: `84bcac3e5b4790e2ad3438431127baf7001157ba`
Atelier installed distribution before this pass: `0.2.10`
Atelier source target for this pass: `0.2.11`
Orca reference head: `53aeeb710c45aa22738f891ad60ba3886163e67b`
Orca reference date: `2026-07-20T01:43:22-07:00`

## Verdict

Atelier now has ten compile-time detachable Orca-informed packages. This pass
finishes the runtime-configuration boundary for all ten packages and raises
four packages from a settings/read surface to a complete task workflow:

- Every adopted package now publishes a versioned, type-checked settings schema
  and consumes those settings in its real runtime path. The settings page is no
  longer a decorative copy of Orca's preferences UI.
- Disabling a package prevents new runtime actions and removes its contributed
  source-control integrations. Existing SSH or mobile resources can still be
  stopped safely after the package is disabled.
- Safety-critical approval, data-deletion, production-deployment, credential,
  host-trust, and external-communication boundaries remain locked in native code
  and cannot be weakened from the settings UI.

- A GitHub issue or pull request can create and immediately dispatch an isolated
  agent task.
- A Linear issue can create and immediately dispatch an isolated agent task.
- Computer Use can execute approved local preview focus, open, screenshot,
  snapshot, click, type, key, and resize actions without arbitrary shell input.
- The Atelier CLI can prepare those same UI actions for exact review in the
  desktop application.
- A new development-services package discovers local listening ports, attributes
  them to the current workspace where the operating system exposes process
  metadata, opens their local URL, and stops a revalidated PID only after a
  one-use exact approval.
- SSH port forwarding now reports connected, reconnecting, and failed states,
  retains bounded diagnostics, sends keepalives, uses a user-configurable bounded
  retry budget of 0-20 attempts (default 5), and keeps an explicit
  reconnect/stop path in the workspace UI.
- SSH workspaces now include a bounded remote directory browser, UTF-8 text
  editor, conflict-aware one-use approved writes, and a remote login shell that
  opens in Atelier's existing persistent PTY surface.
- A detachable Automations package schedules manual, interval, or daily agent
  tasks through Atelier's existing durable task dispatcher. Scheduled runs allow
  only basic or auto permission, preserve definitions/history while disabled,
  and skip stale wake-ups outside a bounded grace period.

This is not a claim that Atelier and Orca are identical products. Orca remains
ahead in terminal split maturity, mobile steering depth, and broad
provider/account integration. Those gaps are kept explicit below.

## Behavior comparison

| Orca workflow | Atelier behavior at this source | Verification | Status |
| --- | --- | --- | --- |
| One prompt across isolated worktrees | Existing agent fleet fan-out creates isolated candidates and requires explicit adoption | Workbench contracts and Rust worktree tests | Functional beta |
| GitHub task to worktree | GitHub issue/PR action creates a new provider/model/permission-matched isolated task and dispatches it | GitHub workflow smoke, production build, isolated Cargo feature | Implemented |
| Linear task to worktree | Linear issue action creates and dispatches the same isolated task shape | Linear workflow smoke, production build, isolated Cargo feature | Implemented |
| CLI task and UI automation | Bounded CLI supports task/worktree commands plus preview open, screenshot, snapshot, click, fill, key, resize, and focus preparation | Atelier CLI and Computer Use smokes, Rust tests | Implemented with approval |
| Computer Use | Preview and browser actions are allowlisted, URL/selector/text/key/viewport bounded, and exact-action approved | Four Rust tests and Computer Use smoke | Implemented with approval |
| Local workspace ports | Local listeners are scanned without shell interpolation, related to the workspace, opened, and approval-stopped after PID/port revalidation | macOS/Linux/Windows parser tests and development-services smoke | Implemented locally |
| Quick Open | Sessions, task-rooted files, symbols, Git index, and workspace commands are bounded and read-only | Workbench contract smoke | Functional beta |
| Source control and review | Stage, unstage, manual commit, diff review, durable evidence, and conflict-aware worktree adoption exist | Workbench contracts and Rust Git/worktree tests | Functional beta |
| Persistent terminal | Detached PTY, replay, acknowledgement, backpressure, restart recovery, and one global terminal surface exist | Rust PTY tests and Workbench contracts | Implemented, no infinite split UI |
| SSH worktrees, files, terminal, and forwarding | Typed remote inspection/worktree/task approvals, bounded remote file browse/edit with conflict-aware approved writes, persistent-PTY remote login shell launch, and managed local port forwarding with keepalive and bounded recovery | SSH smoke, eleven Rust SSH tests, production build, isolated Cargo feature | Functional beta |
| Mobile companion | TLS LAN pairing, device state, proposals, approval, and receipts exist | Mobile and remote-followup smokes, TLS Rust test | Partial versus Orca |
| Provider usage | OpenRouter documented usage plus provider CLI status/version surfaces exist | Provider usage smoke | Documented subset |
| Automations | Manual, interval, and daily tasks dispatch through the existing queue with bounded missed-run handling and durable run receipts | Automations smoke, Rust schedule tests, production and isolated builds | Implemented while Atelier is running |

## Runtime settings parity for adopted packages

This table covers only the ten Orca-informed packages Atelier has deliberately
adopted. Orca exposes hundreds of broader product preferences; copying those
unrelated settings would create dead controls and is not part of this claim.

| Package | Settings connected to runtime |
| --- | --- |
| Atelier CLI | Package enablement and command permission policy |
| GitHub workflows | Package enablement and actual auto-refresh interval |
| Linear workflows | Package enablement and actual auto-refresh interval |
| SSH workspaces | Package enablement, automatic reconnect, native retry budget, and default local/remote ports |
| Provider usage | Package enablement and actual auto-refresh interval |
| Remote follow-up | Package enablement plus provider, effort, permission, and Stella defaults |
| Mobile control | Package enablement and default loopback/LAN surface |
| Computer Use | Package enablement, bridge timeout, receipt limit, and external HTTPS-browser permission |
| Development services | Package enablement, scan-on-open, and unmatched-service visibility |
| Automations | Package enablement and actual scheduler check interval; schedule definitions and history remain preserved while disabled |

The store uses `atelier.featureSettings.v1`, validates persisted types and
bounds, migrates old values safely, and resets invalid entries to schema
defaults. The settings contract smoke proves that every declared field has a
runtime consumer instead of merely rendering in the panel.

## Detachable packages

| Frontend package | Rust feature | Removal boundary |
| --- | --- | --- |
| `atelier-cli` | `orca-atelier-cli` | CLI parser and control-task adapter |
| `github-workflows` | `orca-github-workflows` | GitHub read/mutation/task workflow |
| `linear-workflows` | `orca-linear-workflows` | Linear read/mutation/task workflow |
| `ssh-workspaces` | `orca-ssh-workspaces` | Remote workspace workflow |
| `provider-usage` | `orca-provider-usage` | Provider status and documented usage |
| `remote-followup` | `orca-remote-followup` | Remote proposal and approval workflow |
| `mobile-control` | `orca-mobile-control` | Pairing and mobile continuity surface |
| `computer-use` | `orca-computer-use` | Approval-based local UI automation |
| `dev-services` | `orca-dev-services` | Local port discovery and approved stop |
| `automations` | `orca-automations` | Safe scheduled task dispatch and run history |

Each package owns a `feature.manifest.json` containing its frontend id, Rust
feature/module, smoke script, and explicit dependencies. `npm run
gate:orca-features` discovers those manifests instead of maintaining a second
hard-coded package list. It proves that all ten backend features compile in
isolation and that excluded frontend packages are physically absent from the
restricted production chunks. `mobile-control` intentionally declares its
dependency on `remote-followup`; other packages may be removed independently.

## Safety boundary

- Port discovery uses fixed `lsof`, `netstat`, or `ss` argument arrays and never
  interpolates workspace or user text into a shell.
- A service stop is prepared, bound to the exact PID and port, expires after five
  minutes, is single-use, and revalidates port ownership immediately before
  sending a graceful termination request.
- Computer Use accepts only known browser/preview operations. It cannot execute
  arbitrary shell, delete data, deploy production, read credentials, or automate
  unrelated desktop applications.
- GitHub, Linear, SSH, mobile, and remote follow-up mutations retain their exact,
  expiring approval and receipt boundaries.
- SSH automatic recovery is limited to the configured native retry budget
  (0-20, default 5) with bounded backoff. It is never persisted across an
  Atelier restart, so a new app launch cannot initiate an external SSH
  connection without the user starting a tunnel again.
- Remote paths are normalized and canonically contained under the profile root,
  symlink entries cannot be opened directly, directory results are capped at 500
  entries, and text reads are limited to one MiB of UTF-8 without NUL bytes.
- Remote writes are held in memory until an exact, expiring, single-use approval
  is accepted. Pending approvals are bounded and replaced per file. The old hash
  is revalidated immediately before an atomic replace, and the resulting content
  and hash are read back for verification.
- Automations cannot request full permission, execute arbitrary shell text,
  delete data, deploy production, or bypass the existing task dispatcher. The UI
  intentionally exposes pause rather than destructive definition deletion.

## Current-head evidence

| Gate | Result |
| --- | --- |
| `npm run gate:orca-features` | PASS: 15 contract smokes, Workbench contracts, production build, restricted frontend bundles, dependency expansion, and 10 isolated Rust features |
| `npm run smoke:feature-boundaries` | PASS: 10 removable packages with package-owned manifests and exact Cargo dependency parity |
| `npm run smoke:feature-settings` | PASS: 10 removable modules, versioned migration, runtime consumers, and locked native safety boundaries |
| `cargo test --manifest-path src-tauri/Cargo.toml --all-features` | PASS: 157 tests |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | PASS |
| `cargo xwin clippy --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc --all-targets --all-features -- -D warnings` | PASS |
| `npm run audit:release` | PASS: credential boundary checks and 0 RustSec vulnerabilities in release target graphs |
| updater contract | PASS: macOS plus Windows MSI/NSIS platform aliases, signature rejection, and relaunch-after-install behavior |
| macOS package/install reflection | PASS: locally signed `0.2.11` app and DMG, packaged and installed executable SHA-256 `401efd494be682650e0c6fabd978c5e2e0514ac8dd4f3838ebbe9913bb555751`, DMG SHA-256 `a993030ee912003a63a8d05fa702f490863b93e27707b33140e9e251f1a50ac4`, installed renderer receipt ready |
| Development-service platform parsing | PASS: macOS `lsof`, Windows `netstat`, and Linux `ss` fixtures |
| SSH workspace contracts | PASS: 11 Rust tests plus frontend/backend smoke for browse, read, bounded approved write, conflict handling, and terminal launch |

## Remaining parity gaps

1. SSH file and terminal workflows are implemented over audited SSH commands
   rather than an embedded SFTP transport. The remote shell uses Atelier's
   existing persistent PTY/replay surface. This source pass did not physically
   exercise either path against an external SSH host. Forwarding is intentionally
   not restarted after an app relaunch without a fresh user action.
2. Atelier deliberately keeps one stable detached terminal surface; it does not
   copy Orca's infinite split terminal UX.
3. Mobile continuity is a paired approval plane, not a full native iOS/Android
   companion with every live steering surface.
4. Claude and Codex subscription usage/account switching remain provider-owned;
   Atelier does not scrape private credentials or undocumented quota APIs.
5. Windows process working-directory ownership is not reported because Windows
   has no stable non-privileged equivalent of macOS `lsof` or Linux `/proc`.
6. This pass completes settings parity for the ten adopted detachable packages,
   not every preference exposed by the full Orca product.
7. This pass proves source, macOS build/install reflection, and cross-platform
   parser behavior. It does not claim a physical Windows login,
   browser-visibility, Smart App Control, or installer receipt.
8. Automations run while the Atelier desktop process is alive; they are not an
   operating-system daemon and do not launch the app after it has been quit.

## Truth surfaces

- **Source truth:** implemented in the current working tree.
- **Build truth:** production frontend, all Rust tests, all feature-isolation
  checks, clippy, and release security audit pass.
- **Installed macOS truth:** `/Applications/Atelier.app` is version `0.2.11`;
  its executable exactly matches the packaged app and its renderer-ready receipt
  reports the main window ready from the installed path.
- **Physical Windows truth:** not exercised from this macOS workstation.
- **Distribution truth:** no release or GitHub upload was performed in this pass.
