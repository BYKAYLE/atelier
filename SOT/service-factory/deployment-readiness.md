# Stella Mode Deployment Readiness

generated_at: 2026-07-13T09:35:39+09:00

continuation_verified_at: 2026-07-14T14:40:43+09:00

orca_module_gate_verified_at: 2026-07-18T01:59:32+09:00

orca_runtime_settings_installed_at: 2026-07-20T02:00:00+09:00

orca_modular_automations_installed_at: 2026-07-20T19:16:27+09:00

execution_lifecycle_stabilization_installed_at: 2026-07-20T20:14:15+09:00

> Modular feature-package update: the ten adopted Orca-informed capabilities
> now own `feature.manifest.json` contracts that drive frontend inclusion,
> Cargo features, declared dependencies, and focused smoke tests. The release
> gate passes 16 contract smokes and all ten backend features in isolation.
> Agent turn ownership is now session-scoped through a dedicated registry, so
> concurrent background sessions, exact-turn finalization, stale-finalizer
> rejection, and explicit-stop precedence are release-gated instead of being
> coupled to the active React session. Failed OAuth browser handoffs are no
> longer recorded as successful and receive bounded, duplicate-safe retries.
> The Rust suite passes 157 tests in both native and Store configurations,
> strict Clippy passes for both, Windows normal and Store configurations pass
> `cargo-xwin check`, and the release audit reports zero RustSec
> vulnerabilities. The locally signed macOS `0.2.11` bundle is installed at
> `/Applications/Atelier.app`; the installed and packaged executable SHA-256
> values both equal
> `ea828514cb964113da658e07024e9cc9ec3ebdc5665b19422009c0446dbc6b50`,
> the DMG SHA-256 is
> `8419ed9658fe74ecd982e7caebb016fd6f91bfbacc78624364810a93dbbf5589`,
> and the installed renderer receipt reports the main window ready. Public
> notarization and physical Windows login/browser proof remain external gates.

> Prior runtime-settings install evidence (`0.2.10`): the nine detachable Orca-informed modules
> now expose versioned settings that are consumed by their runtime paths. The
> full feature gate passes 13 contract smokes and all nine isolated Rust
> features; the Rust suite passes 153 tests. The signed macOS `0.2.10` bundle
> is installed at `/Applications/Atelier.app`, the installed and packaged
> executable SHA-256 values both equal
> `edb92b0eb95ac7f8348619599cc933c7d0d3ed7314e57c36cf6b6b00b40144f0`,
> and the installed renderer receipt reports the main window ready. Physical
> Windows login/browser behavior remains a separate unclaimed evidence surface.

> Prior Orca module evidence (`0.2.9`): eight optional capabilities now register through the
> frontend feature registry and matching Cargo feature flags. The shared
> `gate:orca-features` command passes ten contract smokes, a restricted
> frontend build, the backend with all optional modules removed, and every
> backend module in isolation. Release, Windows Store, Windows provider, and
> dedicated Windows package-verification workflows use Node 22 and run this
> gate. The installed macOS 0.2.9 executable exactly matches the packaged
> executable and reports a live renderer-ready receipt. Windows hosted and
> physical execution remain separate unclaimed evidence surfaces.

> Continuation update: the local source, package, and installed macOS baseline
> advanced to 0.2.8. Frontend build, workbench/runtime smokes, native and Store
> Rust suites at 90/90, strict native/Store Clippy, signed app/DMG verification,
> exact installed-bundle reflection, renderer-ready receipt, and visible
> 1600x900 plus compact 900x720 workbench checks pass. The detailed 0.2.5 body
> below remains historical evidence; physical Windows, public Windows signing,
> and Developer ID notarization are still external gates.

## Verdict

release_candidate_with_external_platform_gates

> Scope correction (2026-07-13): this verdict covers the existing 0.2.5 native
> runtime and package contract. It does not mean Orca product parity or a fully
> integrated development workbench. The user-facing parity audit and required
> P0/P1 work are recorded in `orca-parity-audit-2026-07-13.md`.

Atelier 0.2.5 satisfies the local source, macOS package, installed-app, and
Windows cross-link gates. Public distribution is not yet claimed because the
physical Windows interactive flow and public signing identities are external
evidence that this macOS host cannot produce.

## Source Truth

- Version metadata is consistent across `package.json`, `Cargo.toml`,
  `Cargo.lock`, `package-lock.json`, and `tauri.conf.json`: `0.2.5`.
- Frontend production build passes. The current Quick Open searches up to 24
  persisted sessions by task, provider, source folder, and isolated-worktree
  branch; it is not yet a file, command, or repository-context palette. The
  desktop shell also publishes a native `Cmd/Ctrl+P` accelerator.
- Completed parallel candidates can be explicitly adopted only after
  same-repository, branch, base-commit, and conflict checks. The alternate-index
  patch path preserves dirty source edits and never auto-merges or commits.
- File review now parses old/new unified-diff line numbers, persists bounded
  line comments, restores comments by semantic line identity, and sends open
  comments to the active agent through the safe follow-up/queue path.
- The localhost Tauri Inspector now offers an explicit element picker. The
  injected overlay suppresses the selected page action and the host accepts
  only a bounded selector, safe shallow markup, viewport rectangle, and
  allowlisted computed CSS. The selected target is normalized into one
  subsequent queued-turn payload, persists across reload, and remains stable
  for background and parallel execution through the existing permission
  boundary.
- The Rust suite passes 86 tests and strict native plus Windows MSVC Clippy
  with warnings denied.
- Native and `store-build` Windows targets pass strict cargo-xwin Clippy and
  link as PE32+ x86-64 GUI executables.
- Windows OAuth URL activation now tries WinRT `Launcher::LaunchUriAsync` on a
  dedicated initialized thread before the dedicated COM STA
  `ShellExecuteExW` and trusted system-binary fallbacks. This closes both the
  packaged-app URI activation and async-worker apartment gaps in source and
  cross-link truth; a physical Windows browser appearance check remains
  mandatory.
- Provider CLIs no longer depend on `explorer.exe` as their primary `BROWSER`
  command. The installed signed Atelier executable acts as a headless helper,
  validates provider HTTPS hosts, invokes the same native chain, and exits
  before webview startup. The physical gate executes this exact helper mode in
  addition to the existing native probe.
- The Windows provider smoke now snapshots known browser processes before the
  native handoff and can require a newly observed browser process afterward.
  The physical release workflow additionally requires a visible top-level
  browser window, so an exit-zero helper with no browser is a failure.
- Settings exposes the exact runtime version, platform/architecture, browser
  handoff contract, and read-only Smart App Control state. Connections exposes
  Claude/Codex probe buttons that invoke the same native allowlisted handoff as
  provider login without starting an auth session.
- Agent fixture harness, locked npm production audit, updater-contract smoke,
  actionlint, ShellCheck, diff hygiene, and release security audit pass.
- The agent-workspace performance smoke proves that normal typing stays
  ref-backed, elapsed-time ticks are isolated to one memoized activity row, and
  only completed transcript messages receive `content-visibility: auto`.
- Packaged startup now emits a private renderer receipt only after the
  top-level React root mounts. The CLI probe validates version, live PID,
  canonical executable, main-window label, freshness, and ready status. macOS
  package verification and the physical Windows gate require this receipt.
- The current Service Factory state validates with no errors or warnings under
  the state-plan-execute contract and assesses as `pilot_ready`. Its DoD is 5/8:
  the three unmet items are physical Windows evidence, public Windows signing,
  and public macOS notarization; historical stage completion was preserved.
- Preview verification automatically arms against the matching localhost
  preview and, when a turn finishes or fails, persists bounded HTTP response evidence,
  process PID, restart count, recent server output, browser warning/error
  diagnostics, and network resource/failure metadata after credential and URL
  redaction. HTTP resource status 400 or higher is treated as a failure even
  without a separate browser resource-error event. Browser
  checks at 1200 x 713 and 720 x 900 show zero document-width overflow with
  all evidence sections expanded. Response bodies, request headers, cookies,
  browser storage, and durable full-waterfall archives are not collected.
- A real loopback HTTP fixture verifies the current preview checker sends the
  expected path/query and captures HTTP status, page title, and body evidence.
- RustSec reports zero vulnerabilities. Upstream metadata still reports 17
  unmaintained and 2 unsound warnings; these are tracked as upstream warnings,
  not silently discarded.

## Runtime Truth

- Claude real-provider smoke completed through the local subscription and
  returned `OK` from `claude-sonnet-4-6`.
- Codex real-provider smoke completed through the local ChatGPT login and
  returned `OK` from `gpt-5.5` with `xhigh` effort.
- Codex model metadata now carries supported reasoning levels. Models that
  advertise native `ultra` automatically start the CLI with
  `multi_agent_v2`; legacy models fall back from unsupported `ultra` to
  `xhigh` without inheriting an invalid global effort.
- Hermes real-provider smoke completed through `openai-codex/gpt-5.5` and
  returned `OK`.
- The detached executable kept three hidden PTY sessions alive across a fresh
  client reconnect. A fresh installed-executable 100-write latency run measured
  1.572 ms median and 1.932 ms p95.
- The Terminal navigation is visible again. Repeated right/down split actions
  clone the active CLI profile into a nested pane tree; pointer and keyboard
  resizing persist ratios, reload restores the tree, and closing a pane
  collapses its empty branch without changing the single terminal plus preview
  workflow.

## macOS Package and Installed Truth

- `npm run tauri:build` produced:
  - `src-tauri/target/release/bundle/macos/Atelier.app`
  - `src-tauri/target/release/bundle/dmg/Atelier_0.2.5_aarch64.dmg`
- The DMG is 11,274,548 bytes with SHA-256
  `a0351eaa3cef8d3d20e3f98b21a0985389cb07a238004b416a7b7afd36b6cd3e`.
- `/Applications/Atelier.app` reports version `0.2.5` and its native
  `--atelier-version-probe` returns `0.2.5`.
- The installed executable SHA-256 is
  `10764ca0a2ec9891e81629f364966cd0e0cf9a90e7aa4d88813a828f3329de58`.
- `codesign --verify --deep --strict` passes for the installed app.
- The installed `--atelier-renderer-ready-probe` reports the 0.2.5 installed
  executable, a live PID, window `main`, and status `ready`.
- A concurrent candidate-app smoke writes a separate executable-path-hashed
  receipt and leaves the installed-app receipt valid.
- The installed executable's signed helper accepts the allowlisted Codex OAuth
  URL with exit code 0 and rejects an unrelated HTTPS URL with exit code 1.
- The preview evidence surface retains the prior production desktop/compact
  receipts. In the fresh automated launch context, both the retained 0.2.3 app
  and 0.2.4 create layer-zero native surfaces but expose no accessibility or
  on-screen window. Therefore the black capture is not cited as fresh visual
  proof and this run does not attribute the launch-context behavior to 0.2.4.
- The installed app exposes the native `Navigate` menu and Quick Open
  accelerator. The modal opened from both the menu item and the physical
  `Cmd+P` key code in the installed app; visual evidence is retained at
  `/tmp/atelier-0.1.96-quick-open-menu.png` and
  `/tmp/atelier-0.1.96-quick-open-keycode.png`.
- The installed process runs from
  `/Applications/Atelier.app/Contents/MacOS/atelier`.

## Windows Cross-Target Truth

- Normal executable SHA-256:
  `48d203f5d224438aac6d483f2094102c0e6589152042db179b469aae695ec008`.
- Store executable SHA-256:
  `191357241c17009dd685d67be2b3d5740dea5584ea41b254599b78f8875d0b63`.
- Both artifacts are PE32+ x86-64 GUI executables.
- Release workflows use locked npm installs, full-SHA action pins, separate
  Store/updater feature sets, and post-signing package validation.
- The strict Windows provider smoke resolves MSI, NSIS, Store, running-process,
  and build-tree installs; invokes the exact Atelier native browser probe; and
  re-queries Claude and Codex authentication after interactive login.
- The manual self-hosted Windows gate additionally requires the expected
  installed version, a valid Authenticode signature, exact-executable restart,
  and Smart App Control state evidence. The release audit requires its
  mapping/redaction/quoting self-test contract and the workflow passes
  `actionlint`; execution of the PowerShell self-test remains part of the
  physical Windows gate because this macOS host has no PowerShell runtime. The
  Smart App Control probe is read-only.
- GitHub currently reports zero registered self-hosted runners for this
  repository, so no physical Windows evidence is inferred from the workflow.
- GitHub currently exposes only the two Tauri updater signing secret names and
  no Action variables. Apple Developer ID and SignPath configuration therefore
  remain absent from current repository evidence.
- The new GitHub-hosted browser-process probe and physical visible-window gate
  are source-validated by actionlint and the release audit but have not run from
  this unpublished worktree. They are not counted as Windows runtime evidence.

## Required Before Public Release

- Physical Windows: install the signed package, run Codex device login and
  Claude setup-token login, prove default-browser launch, close/reopen the app,
  prove the updated version survives restart, and record Smart App Control
  behavior.
- Windows direct installer: obtain a successful SignPath signature and run the
  signed-package smoke.
- Windows Store: run Partner Center package validation for the final MSIX.
- macOS public distribution: sign with Developer ID Application and complete
  Apple notarization/stapling.

## Safety Boundary

- No database, user data, provider credential store, production deployment,
  paid action, or external publication was modified in this run.
- Atelier invokes provider-owned authentication flows and stores only its own
  documented setup-token bridge material. It does not read or copy Claude Code,
  Codex, or Hermes refresh-token stores.
