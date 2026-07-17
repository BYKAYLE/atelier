# Stella Factory Task Ledger

Last updated: 2026-07-14

## Completed

- Resumed the interrupted 0.2.8 workbench finishing pass from the exact dirty
  source state. The release UI now keeps one global Terminal destination,
  defers hidden terminal initialization until its host is measurable, observes
  host resizes, removes the duplicate workspace cwd field, and uses distinct
  icons for sessions, profiles, reports, plugins, code, changes, and worktrees.
- Re-ran the frontend build, fixture harness, workbench, performance, terminal,
  diff, preview, element-picker, updater, PTY-supervisor, and release-security
  gates. Native and Store Rust suites pass 90/90 each, and both native and Store
  Clippy pass with warnings denied.
- Rebuilt and strictly verified `Atelier_0.2.8_aarch64.dmg`, preserved the prior
  installed bundle under `/tmp`, and replaced `/Applications/Atelier.app` with
  the exact packaged app. Version, bundle diff, signature, executable hash, and
  installed renderer-ready receipt all match the 0.2.8 package.
- Opened the installed app and exercised Sessions, Code, and Changes at
  1600x900, then checked the compact 900x720 layout. The navigation collapses to
  its icon rail and the workbench tabs, transcript, and composer remain usable
  without incoherent overlap. Physical Windows and public signing/notarization
  remain external gates.

- Released and installed the local 0.2.5 renderer-readiness candidate. The
  packaged app records a private receipt only after the top-level React root
  mounts and the native probe verifies version, live PID, canonical executable,
  main-window label, freshness, and ready status.
- Reproduced and fixed the package-smoke stall caused by waiting for two
  `requestAnimationFrame` callbacks while WebKit was backgrounded. The signed
  app, DMG payload, and installed `/Applications/Atelier.app` now pass the same
  renderer startup gate.
- Added renderer readiness to macOS release verification, Windows provider and
  physical release gates, and the release-security audit. Built 0.2.5 normal
  and Store PE32+ x86-64 executables with the same probe and OAuth handoff path.
- Re-ran frontend build, native/Store 86-test suites, strict native/Store
  Clippy, all runtime/UI smokes, actionlint, ShellCheck, diff hygiene, package
  trust, installed PTY reconnect, and release security audit successfully.

- Released and installed the local 0.2.4 performance candidate. Normal composer
  typing remains ref-backed, busy-task elapsed clocks update only inside a
  memoized activity row, and completed off-screen transcript messages use
  content visibility without hiding the active stream.
- Added `smoke:agent-performance` to macOS, Windows direct, Windows Store, and
  release-audit gates. Frontend, fixture, terminal/diff/element/updater,
  actionlint, release audit, native/Store 83-test suites, strict native/Store
  Clippy, and strict normal/Store Windows MSVC cross-target gates pass.
- Built and installed `Atelier_0.2.4_aarch64.dmg`, verified version, signature,
  OAuth helper allowlist, and three-session PTY reconnect. Cross-linked normal
  and Store 0.2.4 PE32+ x86-64 executables.
- Compared installed 0.2.4 with retained 0.2.3 under the same automated macOS
  launch context. Both create native layer-zero surfaces but neither exposes an
  accessibility/on-screen window there, so this run does not claim fresh visual
  proof or misclassify the environment behavior as a 0.2.4 regression.

- Replaced the stale prototype README with the verified 0.2.4 feature, safety,
  development, packaging, and external-gate contract.
- Added Windows OAuth browser process observation to the provider smoke and
  required a visible browser window in the manual physical release gate. A
  helper exit code alone can no longer satisfy that gate.
- Re-ran frontend, fixture, terminal/diff/element/updater, actionlint, release
  audit, diff hygiene, and native/Store 83-test suites after the gate change.
  The new Windows-only observation remains pending an actual Windows run.

- Released the local 0.2.3 stability candidate so the OAuth and worktree fixes
  are distinguishable by GitHub/Tauri update version checks.
- Replaced Windows provider `BROWSER=explorer.exe` orchestration with the
  installed signed Atelier executable. Its headless mode validates provider
  HTTPS URLs and exits before UI startup; the physical Windows gate invokes the
  same mode before interactive subscription login.
- Fixed the temporary Git index race found during parallel worktree candidate
  adoption. Five repeated parallel test runs and full native/Store 83-test
  suites pass.
- Built, strictly verified, and installed `/Applications/Atelier.app` 0.2.3;
  installed OAuth allowlist and three-session PTY reconnect smokes pass.
- Cross-linked normal and Store Windows 0.2.3 PE32+ x86-64 executables. Visible
  Windows browser/login, Smart App Control, signed restart, public Windows
  signing, and macOS notarization remain external gates.

- Released the 0.2.2 click-to-select preview evidence milestone. A user can arm
  the localhost Tauri dev-screen picker, hover an element, click once to select
  it without triggering the page action, or cancel with `Escape`.
- Added a second host-side security boundary that accepts only a bounded
  selector, safe shallow markup, rectangle, and explicit computed-CSS
  allowlist. Input values, URL attributes, event handlers, arbitrary data
  attributes, cookies, storage, headers, bodies, queries, and fragments are not
  carried into agent context.
- Connected selected elements to the Inspector and next-request composer chip.
  Agent delivery snapshots normalized evidence into the queued-turn payload,
  persists it across reload, and clears the composer attachment only after the
  payload is accepted. Background and parallel runs use the same immutable
  payload instead of later mutable UI state.
- Added a dedicated element-picker smoke to macOS, Windows direct, and Windows
  Store release jobs and made the release security audit enforce the same
  localhost, redaction, and bounded-evidence contract.
- Verified real overlay geometry, target-click suppression, `Escape` cleanup,
  1280px UI containment, and zero page errors. Built and installed
  `/Applications/Atelier.app` 0.2.2 with a valid strict local signature.
- Cross-linked 0.2.2 normal and Store Windows PE32+ x86-64 executables through
  `cargo-xwin`. Physical Windows browser authentication, Smart App Control,
  public signing, and macOS notarization remain external release gates.
- Replaced Windows provider `BROWSER=explorer.exe` orchestration with the
  installed signed Atelier executable. Its headless helper validates only
  Claude/Codex HTTPS login hosts and hands them to the WinRT/COM/system browser
  chain without creating a second app window or temporary script.
- Extended the physical Windows gate to prove the exact signed-helper entry
  point before official Codex device and Claude setup-token flows. Fixed a
  parallel worktree-adoption temporary-index race found by Store tests and
  passed five repeated parallel runs plus the complete 83-test suites.

- Released the 0.2.1 line-level change-review milestone. Existing file review
  now shows old/new line numbers and supports persistent comments on additions,
  deletions, and context lines.
- Added comment resolve/reopen/delete controls and structured delivery of all
  unresolved comments to the active agent. Busy tasks receive review feedback
  through the existing queue instead of being interrupted.
- Added semantic annotation restoration so comments survive harmless unified
  diff header/index changes, plus a dedicated parser/prompt/persistence smoke
  enforced by macOS, Windows direct, and Windows Store release jobs.
- Verified desktop and 720px compact interaction, reload persistence, internal
  diff scrolling, and zero page overflow. Built and installed
  `/Applications/Atelier.app` 0.2.1 with a valid strict local signature.
- Cross-linked 0.2.1 normal and Store Windows PE32+ x86-64 executables. Physical
  Windows browser authentication, Smart App Control, public signing, and macOS
  notarization remain external release gates.

- Released the 0.2.0 persistent terminal workspace milestone. Terminal is
  visible again and repeated right/down splits create a nested pane tree backed
  by the existing detached PTY supervisor.
- Added pointer and keyboard divider resizing, ratio persistence, renderer
  reload restoration, and empty-branch collapse without restarting xterm or
  losing scrollback.
- Added the terminal-layout smoke to macOS, Windows direct, and Windows Store
  release jobs and made the release security audit enforce the same contract.
- Built, verified, and installed `/Applications/Atelier.app` 0.2.0. The strict
  local signature and native version probe pass; the installed supervisor
  retained three sessions with 1.563 ms median / 1.974 ms p95 input latency.
- Cross-linked normal and Store-feature Windows PE32+ x86-64 executables for
  0.2.0. Physical Windows browser authentication, Smart App Control, signed
  restart survival, public Windows signing, and macOS notarization remain
  explicit external release gates.

- Identified Atelier as an existing Vite/React + Tauri/Rust desktop app rather
  than a greenfield project.
- Identified existing Codex-like surfaces:
  - structured agent workspace
  - Claude/Codex/Hermes adapters
  - queue mode
  - model/provider controls
  - permission controls
  - preview service and health checks
  - change baseline/summary/review/undo
  - agent harness
- Added a durable SOT foundation for autonomous workspace behavior.
- Added Stella Factory prompt contract and task commands:
  `/goal`, `/analyze`, `/probe`, `/audit`.
- Added Rust-side Stella Factory core commands:
  - `stella_project_analysis`
  - `stella_workspace_probe`
  - `stella_record_evidence`
- Added backend prompt safety guard before Claude/Codex/Hermes execution.
- Connected Factory runs to preflight project analysis, optional Probe execution,
  and SOT evidence append.
- Added a Hermes Desktop-style Factory entry point to the global shell and a
  visible Stella Factory brief in the task pane. The brief seeds `/goal` and
  `/analyze` prompts without making Factory always-on.
- Removed duplicate left-nav entries that pointed at the same agent workspace:
  `Chat`, `Models`, and `Factory`. The remaining `Sessions` item now owns the
  agent workspace, while Factory/model controls stay inside the work surface.
- Moved installable extensions out of the task list into a dedicated
  `Plugins & Skills` screen, with plugins and built-in skills separated.
- Corrected Stella Factory invocation and completion semantics so
  `스텔라 팩토리` / `Stella Factory` natural-language requests route into the
  Factory goal path and product-wide goals cannot close after a single feature
  without Service Factory readiness evidence.
- Added a real Factory bootstrap path: Factory goal requests now create
  or resume `SOT/service-factory-state.json`, seed required product-scale
  artifacts, and attach the state/readiness/next-action evidence before the
  provider starts. `/analyze` remains analysis-only and does not launch the
  managed autopilot side effect.
- Added a managed Factory autopilot path: Factory goal requests now run the
  Stella Service Factory bridge after bootstrap when available, execute
  queued agent requests through a command-backed local worker, collect
  `result.json` artifacts, write recovery proof, and report readiness in the
  preflight evidence.
- Hardened the managed path after reviewer/security findings so local workers
  cannot create false-green mandatory review/security/release completion.
- Ran the active Atelier Factory state to `pilot_ready` with readiness score
  `0.95`, managed backend `spawn_runtime_command`, attached specialist
  validation evidence, and no primary blocker.
- Resolved the remaining `parallel_implementation::builder` request with actual
  implementation evidence, leaving zero queued/in-progress/blocked Factory
  requests in the active state.
- Locked Stella Factory's development method to `current_state ->
  development_plan -> execution_verification`. Broad Factory goals must now
  capture the real repo/runtime/SOT/install baseline before planning, then turn
  the gap into task packets before implementation.
- Added the active `current_state::state_mapper` and
  `development_plan::strategy_planner` requests and completed both, leaving the
  active Factory state with zero queued/in-progress/blocked requests.
- Moved the Stella Factory direction into the Stella ontology: Stella is now the
  Factory `command_owner`, Release is the runtime/state/gate adapter, kanban is
  only a state projection, and agent creation must distinguish
  AgentBlueprint/AgentInstance/AgentManifest from prompt/worktree artifacts.
- Materialized the active Atelier Stella Factory state with
  `command_owner: Stella`, `execution_controller: Release`, explicit
  `control_plane`, `kanban_projection`, 15 AgentBlueprints, 23 AgentInstances,
  and `agent_topology`.
- Upgraded readiness, handoff, and artifact-review surfaces so
  `stella_command_owner` and `agent_topology` are verified capabilities rather
  than informal claims.
- Fixed Release Service Factory atomic writes to use unique temp paths, avoiding
  concurrent `.tmp` replacement races during report/status generation.
- Ran Atelier through the Stella bridge autopilot and confirmed
  `pilot_ready`, no primary blocker, and warning-free Factory validation.
- Added the first user-visible Atelier product upgrade from that Factory state:
  the agent workspace now shows a live Factory status strip with readiness,
  Stella -> Release control, AgentBlueprint/AgentInstance counts, done/open
  stage counts, blocker, next step, and manual refresh.
- Simplified the Agent Workspace Factory controls to one user-facing
  `Stella Factory` launcher. The former `Goal`, `Analyze`, `Probe`, and `Audit`
  controls remain compatible internal/legacy commands, but the main UI now
  treats planning, implementation, verification, security, and final audit as a
  single autonomous Factory session behind one goal entry point.
- Completed the 0.1.79 release-stability pass across provider execution,
  subscription login, credential boundaries, retry handling, packaging, and
  release gates.
- Fixed OAuth URL truncation by allocating a wide login PTY and keeping URL
  parsing/provider validation in the Rust backend.
- Added a native Windows browser-open fallback chain and removed temporary
  browser helper scripts that can be blocked by Smart App Control.
- Unified Windows CLI resolution for regular sessions and login sessions,
  including npm command shims and Claude's Git Bash requirement.
- Removed direct reads from Claude Code's external macOS keychain item. Atelier
  now owns its cached login state and refreshes its Claude subscription token
  inside the Atelier credential boundary.
- Stopped persistent credential fan-out to Gajae Code and Hermes. Gajae gets a
  per-process Claude OAuth token; Hermes receives a staged Codex access token
  that is scrubbed after the run.
- Changed the default permission policy from full access to automatic
  workspace access. Explicit full access remains an opt-in mode.
- Updated Codex invocation to current global sandbox/approval flags and removed
  the deprecated `--full-auto` argument.
- Added Windows installer/MSIX payload smoke tests, optional Authenticode
  verification, and release-workflow gates that refuse unsigned publication.
- Added a release security audit and closed the RustSec vulnerability in the
  locked QUIC dependency.
- Changed Codex subscription sign-in to device authorization so the app can
  open a stable login page and display the one-time code even when a packaged
  Windows app cannot complete a localhost browser handoff.
- Moved the Codex model menu to a viewport-level portal with bounded height and
  independent scrolling so small/resized windows cannot clip models or effort
  controls inside the composer.
- Reset the menu scroll position on reasoning/model/speed panel changes and
  verified the installed app's complete Codex model list at 560 px width.
- Removed the composer-level vertical scroll and moved slash suggestions to a
  viewport portal so textarea resizing and slash commands remain compatible.
- Hid the code/terminal navigation tab and migrated stale saved terminal routes
  back to Sessions without deleting the underlying terminal implementation.
- Built and installed `/Applications/Atelier.app` 0.1.79, verified its code
  signature and confirmed the installed process is running from that bundle.
- Added visible stop controls to both the live activity row and composer while
  an agent turn is running. On Unix, each Claude/Codex/Hermes/Gajae turn now
  owns a process group so stopping a turn also terminates its spawned tools.
- Built and installed `/Applications/Atelier.app` 0.1.80 and verified the
  process-group cancellation regression test, package, signature, and process.
- Replaced mixed native/custom composer dropdowns with one shared compact menu
  surface for provider, permission, model, workload, and bug-report area
  selection. Codex's nested reasoning/model/speed menu now uses the same 11 px
  typography, row height, selected treatment, and viewport-safe scrolling.
- Built and installed `/Applications/Atelier.app` 0.1.81, then visually verified
  the provider, permission, model, and workload menus in the installed app.
- Reviewed the current Atelier runtime against Orca's PTY lifecycle,
  backpressure, agent interoperability, worktree, hooks, and remote-continuity
  patterns. Adopted a selective-transplant architecture contract that preserves
  Tauri/Rust and Atelier's conservative permission model.
- Added the first runtime-plane upgrade: bounded PTY output buffering, native
  batch coalescing before the Tauri event bridge, and single-pass frontend text
  decoding while preserving raw xterm bytes and append-only logs.
- Added a shared backend agent registry for Claude Code, Codex, Hermes, and
  Gajae Code. Structured chat and direct safe CLI commands now share provider
  parsing, while the registry publishes CLI, authentication ownership, resume,
  model-catalog, and permission capabilities for later adapter normalization.
- Built `Atelier_0.1.82_aarch64.dmg`, installed
  `/Applications/Atelier.app` 0.1.82, verified its strict local signature and
  hardened runtime, launched the installed bundle, and visually confirmed the
  workspace rendered from that process.
- Added the 0.1.83 observable-session foundation: `pty_list` now reports stable
  session/log identity and transport counters, while `session_log_snapshot`
  returns byte-exact replay data with total size, replay size, and truncation
  state. Bridge emission failures and post-disconnect output are counted
  separately instead of appearing as successful delivery.
- Built `Atelier_0.1.83_aarch64.dmg`, installed
  `/Applications/Atelier.app` 0.1.83, passed strict signature verification,
  launched the installed executable, and confirmed its 1600 x 900 main window
  remained present.
- Added the 0.1.84 warm-reattachment protocol: every PTY output batch carries a
  monotonic sequence, renderer acknowledgements are tracked, missing ranges
  recover from a bounded native journal, and persisted tabs reclaim matching
  live sessions after a WebView reload instead of creating duplicate CLIs.
- Built `Atelier_0.1.84_aarch64.dmg`, installed
  `/Applications/Atelier.app` 0.1.84, verified its strict local signature,
  launched the installed bundle, and passed the 60-test Rust suite, frontend
  build, fixture harness, and release security audit.
- Added the 0.1.85 detached PTY supervisor release candidate. The signed
  Atelier executable can relaunch itself in headless supervisor mode, own PTYs
  beyond renderer/app-shell lifetime, authenticate loopback IPC with a private
  token, recover output through the sequence journal, and fall back to the
  in-process runtime if supervisor startup fails.
- Added a cross-platform `smoke:pty-supervisor` release gate covering spawn,
  input, client disconnect, reconnect, output recovery, completion, cleanup,
  and input latency. The macOS source run restored exact output and measured a
  1.58 ms median / 2.15 ms p95 across 100 input requests.
- Built `Atelier_0.1.85_aarch64.dmg`, installed
  `/Applications/Atelier.app` 0.1.85, verified its strict local signature, and
  reran the supervisor harness against both the packaged and installed
  executables.
- Added one normalized `AgentAdapter` lifecycle for Claude Code, Codex, Hermes,
  and Gajae Code. Every turn now emits ordered started/output/tool/waiting and
  exactly one completed/failed/cancelled terminal state while preserving raw
  provider events.
- Added optional per-task Git worktree isolation without resetting or deleting
  the user's working tree. The active branch, isolated path, source dirty state,
  change baseline, and preview evidence are attached to the task ledger.
- Connected successful agent turns to localhost preview health, HTTP/title
  evidence, managed preview service state, and recent preview-bridge evidence.
- Extended the detached-supervisor harness to configurable long runs and passed
  1,000 writes with reconnect, ordered recovery, and 1.65 ms median / 1.92 ms
  p95 input latency on macOS.
- Verified the responsive workspace at 720 x 620 and 560 x 420: no document
  overflow, the composer remains fully visible, and send/worktree controls stay
  reachable while navigation rails collapse first.
- Fixed a release-stress race where a nonblocking supervisor listener could
  yield a transient nonblocking request socket on macOS. Accepted request
  sockets are now switched to bounded blocking I/O before reading one JSON
  envelope; 1,000- and 2,000-write runs both passed afterward.
- Built `Atelier_0.1.86_aarch64.dmg`, installed
  `/Applications/Atelier.app` 0.1.86, verified its strict local signature, and
  passed the 1,000-write supervisor harness against both packaged and installed
  executables.
- Closed the independent release review: preview-only starts now prepare the
  selected task worktree, final preview evidence uses the final URL and rejects
  stale bridge evidence, and distinct tasks receive distinct worktrees while
  additional turns in one task continue in the same worktree.
- Hardened release supply-chain boundaries by pinning GitHub Actions to full
  commit SHAs, compiling Store packages without the updater plugin, and
  removing the raw `cmd.exe start` browser fallback on Windows.
- Moved macOS permission metadata and entitlement signing ahead of DMG
  generation. The package gate now mounts the completed DMG and verifies its
  embedded app. The final artifact is 11,282,284 bytes with SHA-256
  `9f725d343f9ce751c5f737994edd063a787653934445b7d47c1d5d91bf92e37a`.
- Reinstalled the final package at `/Applications/Atelier.app`; version,
  bundle identity, strict signature, 1600 x 900 native window, WebKit process
  tree, and 1,000-write detached-supervisor smoke all reflect 0.1.86.
- Completed the 0.1.87 distribution-readiness review: native OAuth opening is
  authoritative, Store updater capability is explicit, Gajae steady-state
  credentials are Atelier-owned, stale Hermes staging is scrubbed, broad macOS
  permission declarations are absent, and frontend/Rust audits are release
  gates.
- Built and installed `Atelier_0.1.87_aarch64.dmg`, verified the mounted DMG and
  installed signature, passed 69 tests in normal and Store configurations,
  passed both strict clippy configurations, and passed the installed executable
  1,000-write supervisor reconnect smoke at 1.598 ms median / 1.819 ms p95.
- Verified the installed process owns the configured 1600 x 900 main window.
  The macOS session was locked during the final shell check, so window-server
  evidence is recorded without claiming a fresh screenshot.
- Advanced the release candidate to 0.1.88 and closed Windows-only compile and
  lint drift in agent launch, credential installation, PTY environment, and
  supervisor test paths.
- Passed 69 tests and strict clippy in normal and Store configurations, then
  passed strict Windows cross-target clippy and linked both configurations as
  valid PE32+ x86-64 GUI executables.
- Built and installed `Atelier_0.1.88_aarch64.dmg`, verified the mounted DMG and
  installed signature, matched the installed/package executable hashes, and
  passed the installed executable 1,000-write reconnect smoke at 1.648 ms
  median / 1.889 ms p95.
- Preserved the release truth boundary: Windows source/link evidence is now
  present, while interactive browser authentication, signed update survival,
  and Smart App Control remain physical-device gates.
- Removed Atelier-managed Codex token staging and startup mutation of Hermes
  auth state. Hermes now fully owns provider authentication; old access-only
  entries contain no refresh token and expire naturally.
- Replaced direct Hermes `auth.json` parsing in the Windows provider smoke with
  the provider-owned `hermes auth status openai-codex` interface and extended
  the release audit to reject a regression.
- Hardened the generic file-preview command so canonical paths into Hermes,
  Codex, Claude, SSH, cloud, GitHub CLI, and package-manager credential stores
  are rejected without blocking ordinary project `auth.json` files.
- Advanced the final local release candidate to 0.1.89, reran 75 tests and
  strict clippy in normal, Store, and Windows cross-target configurations, and
  linked normal and Store Windows PE32+ executables.
- Built and installed `Atelier_0.1.89_aarch64.dmg`, verified package and
  installed signatures and hashes, then passed the installed executable
  three-session hidden/reconnect smoke and 1,000-write latency run at 1.583 ms
  median / 1.726 ms p95.
- Expanded the file-preview credential boundary across macOS, Windows, and
  custom Hermes roots, including corrupt auth backups and OAuth/MCP token
  subtrees, while preserving access to ordinary project `auth.json` files.
- Replaced Claude credential-store import and private OAuth refresh emulation
  with the official `claude setup-token` bridge. Direct Claude and isolated
  Gajae child processes receive the access token through provider-specific
  process environment only; no Claude refresh token is copied or retained by
  Atelier.
- Replaced background-thread `ShellExecuteW` with COM-initialized
  `ShellExecuteExW` plus `SEE_MASK_NOASYNC`, pre-opened the validated Codex
  device-auth URL, and removed generated OAuth browser scripts. Added an
  Atelier-native browser probe and aligned the Windows provider smoke with
  `device-auth`/`setup-token` while retaining Windows PowerShell 5.1 support.
- Made the Windows login smoke re-read Codex and Claude authentication after
  the interactive flow. Strict login validation now requires the packaged
  Atelier native browser probe and authenticated post-login provider status, so
  a browser fallback or stale pre-login summary cannot create a false pass.
- Pinned the remaining manual Windows provider-smoke workflow actions to full
  commit SHAs and extended the release audit to enforce that workflow too.
- Replaced release-job `npm install` calls with lockfile-enforced `npm ci` and
  added an audit invariant so dependency resolution cannot silently drift.
- Extended physical Windows executable discovery across debug/release builds,
  NSIS/MSI locations, running Atelier processes, and Microsoft Store packages so
  the same browser probe can validate both `Atelier` and `Atelier Agent` installs.
- Advanced the local release candidate to 0.1.90 and fixed the real Codex
  `gpt-5.6-sol` failure. The model cache now supplies supported reasoning
  levels, native `ultra` remains native, and models requiring the reserved
  collaboration schema automatically enable `multi_agent_v2`.
- Strengthened the agent harness so a zero exit without assistant text cannot
  produce a false pass. Fresh real-provider smokes returned `OK` from Claude
  Sonnet 5, Codex 5.6 Sol Ultra, and Hermes on openai-codex/GPT-5.5.
- Passed 76 tests and strict Clippy in normal and Store configurations, strict
  Windows cross-target Clippy, frontend build, fixture harness, updater
  contract, npm audit, actionlint, ShellCheck, release security audit, and
  RustSec with zero known vulnerabilities.
- Built and installed `Atelier_0.1.90_aarch64.dmg`, matched package and
  installed executable hashes, passed strict signature verification, exercised
  both installed native OAuth browser probes, and passed the installed
  three-session reconnect plus 1,000-write smoke at 1.557 ms median / 1.740 ms
  p95.
- Linked normal and Store Windows 0.1.90 executables as PE32+ x86-64. Physical
  Windows browser-login, signed update survival, and Smart App Control remain
  external device evidence rather than inferred completion.
- Advanced the reflected candidate to 0.1.91 after adding an installed-version
  probe and a self-hosted physical Windows release gate. The gate validates the
  exact installed executable, Authenticode signature, restart survival, Atelier
  native browser handoff, post-login Claude/Codex state, and Smart App Control
  evidence in one redacted JSON report.
- Rebuilt and installed `Atelier_0.1.91_aarch64.dmg`; package and installed
  executable hashes match, strict local signature and both OAuth probes pass,
  and the installed supervisor reconnect smoke passed with three sessions and
  1,000 writes at 1.576 ms median / 2.268 ms p95.
- Re-ran fresh real-provider smokes after installation: Claude Sonnet 5, Codex
  5.6 Sol Ultra, and Hermes on openai-codex/GPT-5.5 each returned `OK`.
- Re-linked normal and Store Windows 0.1.91 PE32+ x86-64 executables, parsed the
  Windows smoke with PowerShell itself, and passed the new workflow through
  actionlint and the release-security invariant.
- Corrected the Smart App Control registry interpretation to Microsoft's
  documented `0=Off`, `1=On`, `2=Evaluation` contract. Added a native PowerShell
  self-test for that mapping, secret redaction, and Windows argument quoting;
  the physical gate reads this state without modifying Windows policy.
- Advanced the reflected candidate to 0.1.92 and extended task-linked preview
  evidence with bounded HTTP body, method/timestamp, service PID/restarts/error,
  and recent preview-server output. Native output is redacted before storage and
  event emission; the frontend redacts again before persistence or provider
  context assembly.
- Expanded both preview-evidence sections in browser checks at 1440 x 900 and
  720 x 900. Both viewports had zero document-width overflow and preserved
  readable wrapping inside the task response.
- Passed 77 tests and strict Clippy in normal and Store configurations, strict
  Windows cargo-xwin Clippy and PE32+ x86-64 linking, frontend build, real and
  fixture provider harnesses, updater and PTY smokes, npm audit, actionlint,
  ShellCheck, PowerShell self-test, diff hygiene, and release security audit.
- Built and installed `Atelier_0.1.92_aarch64.dmg`; package and installed
  executable SHA-256 match, all three installed version probes report 0.1.92,
  strict signature and both OAuth browser probes pass, and the installed PTY
  supervisor handled three reconnecting sessions plus 1,000 writes at 1.640 ms
  median / 2.043 ms p95.
- Re-ran real Claude Sonnet 5, Codex GPT-5.6-Sol Ultra, and Hermes
  openai-codex/GPT-5.5 provider calls; all produced `OK` and exited 0.
- Refreshed Factory agent prompts against the current state-plan-execute
  contract and added the three research-role compatibility entries without
  resetting historical stage completion. `service_factory.py validate` now
  reports `valid: true` with no errors or warnings.
- Advanced the installed macOS candidate to 0.1.93 with Atelier's first actual
  user-facing Orca workflow: one prompt can launch multiple configured agents
  concurrently in isolated worktrees, and a shared comparison panel reports
  candidate state, branch, and change totals. Browser checks passed at desktop
  and compact widths, the frontend build and 77 Rust tests passed, and the
  installed/package executable hashes match.
- Kept winner adoption, arbitrary terminal splits, Quick Open, click-to-select
  Design Mode, line annotations, GitHub/Linear, SSH worktrees, and mobile
  continuity explicitly open instead of counting their lower-level primitives
  as completed product features.
- Advanced the installed macOS candidate to 0.1.94 with functional parallel UX:
  automatic composer expansion, batch progress, batch-level stop, candidate
  response previews, explicit navigation, and unfamiliar-icon tooltips. Light,
  dark, desktop, and compact browser passes had no horizontal overflow; the
  frontend build, 77 Rust tests, release audit, signed package verification,
  installed hash match, and installed launch passed.
- Advanced the installed macOS candidate to 0.1.95 and fixed OAuth browser URL
  truncation across PTY chunks. Provider URLs must now be terminated or stable
  before opening, and a provider-domain-validated Tauri OS-open fallback runs
  only after the native Rust path fails. Frontend build, 78 Rust tests, strict
  Windows cargo-xwin Clippy, updater contract smoke, release audit, signed
  package verification, installed hash match, and visible installed launch
  passed. Physical Windows interaction remains `validation_required`.
- Advanced the reflected candidate to 0.1.96 with task-wide Quick Open and
  explicit conflict-safe adoption of completed parallel-worktree candidates.
  Adoption uses a private alternate Git index, same-repository/branch/base
  validation, `git apply --check`, and a private receipt; it refuses overlap
  without mutating dirty source work and never auto-merges or commits.
- Passed the frontend build, all 81 Rust tests, strict native and Windows MSVC
  Clippy, fixture harness, PTY reconnect/latency smoke, updater contract, and
  release security audit. Normal and Store-feature Windows targets both linked
  PE32+ x86-64 executables.
- Built and installed `Atelier_0.1.96_aarch64.dmg`; package and installed
  executable SHA-256 match and strict signature/version probes pass. The native
  Navigate menu is present, and Quick Open opens through both the menu and the
  physical `Cmd+P` key code in the installed app.
- Moved Windows OAuth browser activation to a dedicated COM STA before
  `ShellExecuteExW`, then passed frontend build, 81 Rust tests, native and
  normal/Store MSVC strict Clippy, release audit, and both PE32+ release links.
  Physical Windows auth/Smart App Control and public macOS notarization remain
  `validation_required`.
- Added in-app runtime release diagnostics and Claude/Codex native browser-probe
  controls. The Updates screen now shows app/platform/architecture, the exact OS
  handoff contract, and read-only Smart App Control state; the Connections
  probes use fixed provider URLs and do not start or modify authentication.
- Rebuilt and reinstalled macOS 0.1.96, matched package/install executable hashes,
  passed strict signing and both installed native browser probes, rendered both
  diagnostic screens, passed 82 Rust tests, and cross-linked fresh normal and
  Store PE32+ Windows executables. Physical Windows interaction remains the
  separate validation gate.
- Advanced the installed macOS candidate to 0.1.97 with bounded browser
  console/runtime and network resource/failure evidence attached to each task
  result and to the next agent context. URLs and credential patterns are
  redacted before persistence; bodies, headers, cookies, and browser storage
  remain outside the collection boundary.
- Verified the dev-screen bridge with seeded console, runtime, network, DOM,
  and screenshot data. Four seeded secrets and all URL query data were absent
  from the normalized result. Desktop and 720 x 900 compact evidence renders
  passed with zero document-width overflow.
- Passed frontend build, 82 Rust tests, strict native and normal/Store Windows
  MSVC Clippy, fixture harness, source and installed PTY reconnect/latency
  smokes, updater contract, release audit, and normal/Store PE32+ release links.
- Built and installed `Atelier_0.1.97_aarch64.dmg`; package/install executable
  hashes match, strict local signing and native version probes pass, and the
  installed `Atelier` window was captured. Physical Windows browser auth,
  Smart App Control, public Windows signing, and macOS notarization remain
  `validation_required` external gates.
- Advanced the installed macOS candidate to 0.1.98. A matching localhost
  preview now arms browser diagnostics automatically and provider-turn
  completion captures DOM, screenshot, console/runtime, and network evidence
  without requiring the user to press `검사` first. HTTP status 400+ counts as
  a network failure, and stale diagnostics from a different origin are refused.
- Proved the automatic path through a real bridge fixture: DOM 1, screenshot,
  console errors 2, warning 1, request 1, HTTP 500 failure 1; four seeded
  secrets and URL query data were absent from persisted evidence.
- Passed frontend build, 82 Rust tests, strict native and normal/Store Windows
  Clippy, fixture harness, updater contract, release audit, source/installed PTY
  reconnect smokes, and both Windows PE links. Built and installed
  `Atelier_0.1.98_aarch64.dmg`; version, strict signature, installed browser
  probes, and the on-screen 1600 x 900 native window record pass. Physical
  Windows interaction and public signing/notarization remain external gates.
- Resumed the persistent Orca-informed goal and advanced the reflected local
  candidate to `0.1.99` without resetting the existing dirty workspace.
- Added a direct terminal split action and `Cmd/Ctrl+Backslash` shortcut that
  clone the active CLI profile into a persistent grid session while preserving
  the existing single terminal plus preview mode.
- Extended automatic preview evidence to failed provider turns while preserving
  explicit stop/interruption as the no-capture boundary.
- Added WinRT `Launcher::LaunchUriAsync` as the first Windows OAuth browser
  handoff, retaining COM STA `ShellExecuteExW` and trusted OS fallbacks.
- Passed frontend build, 82 Rust tests, strict native and normal/Store Windows
  Clippy, fixture/updater/release audits, source/installed PTY smokes, and both
  Windows PE links. Built and installed `Atelier_0.1.99_aarch64.dmg`; package
  and installed executable hashes match, local signature and Claude/Codex
  browser probes pass. Physical Windows and public signing/notarization remain
  external gates.

## Orca-Informed Upgrade Queue

- Decide whether optional durable browser-console and full network-waterfall
  archives are worth adding beyond the current bounded task evidence. Any such
  archive must preserve the existing no-body/no-header/no-cookie boundary.
- Keep encrypted remote continuity deferred until local permission, revocation,
  and physical-platform evidence are complete.

## Release Validation Remaining

- Run the strict Windows provider smoke and interactive Claude/Codex browser
  sign-in on a physical Windows machine. The macOS host cannot prove Windows
  default-browser behavior or Smart App Control acceptance.
- Run the signed Windows package smoke after SignPath returns the installer.
- Produce the public macOS release with a Developer ID Application certificate
  and Apple notarization credentials. Local builds use a local
  hardened-runtime certificate and is intentionally rejected by Gatekeeper.
- Keep the compatibility bundle identifier `com.atelier.app` until an explicit
  updater/keychain/store identity migration is designed and tested.

## Known Constraints

- Agent CLIs can still execute their own internal tool calls when the user
  explicitly selects full permission. The default is now automatic workspace
  access, and full access remains a deliberate bypass choice.
- Windows source, packaging scripts, and CI gates are release-candidate ready,
  but interactive Windows OAuth remains `validation_required` until exercised
  on a physical Windows host.
- Public macOS distribution remains blocked by external Developer ID and
  notarization credentials even though the local installed app is reflected.

## Orca capability completion receipt - 2026-07-17

- Completed the planned independent Orca-informed modules: public Atelier CLI,
  GitHub workflows, Linear workflows, SSH workspaces, provider usage, mobile
  pairing/read-only monitoring, approved remote follow-up, and approval-based
  Computer Use.
- Hardened LAN mobile continuity so private-network binding uses HTTPS with a
  private persistent certificate and visible fingerprint; loopback remains
  HTTP. Added an actual HTTPS `/health` test and fail-closed LAN address checks.
- Preserved the execution boundary: no arbitrary remote shell, mouse, keyboard,
  deletion, deployment, external publication, or unapproved mutation path was
  added. External mutations remain typed, exact-hash approved, expiring,
  one-use, and privately receipted.
- Passed all 141 Rust tests, strict Rust formatting/Clippy, the frontend
  production build, all 24 focused smokes, actionlint, fixture harness, updater
  contract, release audit, and diff hygiene.
- The actual macOS/Windows release dependency graphs contain zero known
  vulnerabilities. The all-target lockfile still reports two Linux-only
  Wayland `quick-xml` advisories and upstream maintenance warnings; these are
  not hidden or counted as release-target vulnerabilities.
- Built `Atelier_0.2.9_aarch64.dmg`, installed `/Applications/Atelier.app`,
  matched the packaged/installed executable SHA-256 at
  `a8eb9f13f9d85d11c392292f48dd53f81dbf8ed16b19db4ecee8798888dc67c8`,
  and passed strict local signature plus renderer-ready checks.
- Corrected the installed reflection procedure after an old resident process
  produced a false black-screen observation. A clean launch and close/relaunch
  both created one visible `Atelier` window; the installed screenshot is
  `/tmp/atelier-installed-orca-all-0.2.9-cold.png`.
- Physical Windows package installation, visible Claude/Codex browser login,
  signed update survival, and Smart App Control remain `validation_required`.
  Public macOS notarization remains blocked on external Developer ID/notary
  credentials; neither external gate is inferred from the completed macOS
  source/build/install receipt.
