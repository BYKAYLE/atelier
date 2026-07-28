# Stella Factory Final Audit

generated_at: 2026-07-13T09:35:39+09:00

reconciled_at: 2026-07-26 KST

## Current Judgment

`supervised local candidate, public release blocked`

- Atelier `0.2.14` source gates pass: all-feature Rust 230 passed / 3 ignored;
  Orca 23 contract smokes / 10 removable features; strict
  all-target/all-feature Clippy; format/diff checks; `npm audit` 0; RustSec 0
  known vulnerabilities with 18 unmaintained and 2 unsound warnings.
- Managed preview start is fail-closed and separately trusted localhost
  inspection remains available.
- Basic is the default; Auto retains sandbox and approval checks; visible/raw
  Full bypass is removed.
- Managed permission capability is provider-specific: Claude/Codex support
  Basic/Auto. Hermes/Gajaecode require pinned Atelier-owned macOS runtimes,
  isolated skills, and sandbox readiness; absent readiness fails before spawn.
  Direct CLI remains separate and limited.
- Installed runtime receipts verify Gajaecode 0.11.7/Bun 1.3.14/four defaults
  and Hermes pinned commit/453 durable files/73 installed skills.
- Frontend and Rust guards share a prompt corpus, but phrase matching is not a
  complete action-level guarantee.
- The P1 app-owned action/tool proxy and scoped approval receipts remain open.
- The locally signed `0.2.14` candidate is installed and verified by exact
  candidate/installed executable SHA-256 equality, codesign, renderer readiness,
  and UI evidence. The dirty-worktree proof uses the executable SHA-256 as the
  build identifier; HEAD is not unique build proof.
- No public publish, Developer ID signing, notarization, deployment, DB/data
  deletion, paid action, credential mutation, or physical Windows proof
  occurred.

continuation_verified_at: 2026-07-14T14:40:43+09:00

> Continuation update: Atelier 0.2.8 is now the reflected local macOS baseline.
> It adds the integrated Conversation/Code/Changes workbench and a finishing
> shell pass with one global Terminal destination, distinct navigation icons,
> measurable-host terminal initialization, and compact-window verification.
> The historical 0.2.5 judgment below remains scoped to its original audit;
> broader P1 workbench gaps and external physical/public release gates remain
> open.

## Judgment

> Scope correction (2026-07-13): this historical judgment validates the
> existing 0.2.5 runtime/package scope. It is not evidence that Orca-class
> editor, source-control, browser, SSH, account-usage, CLI, or mobile workflows
> are complete. See `orca-parity-audit-2026-07-13.md` for current product truth.

Atelier 0.2.5 is a reflected local release candidate. The runtime now has a
detached, reconnectable PTY supervisor; normalized Claude/Codex/Hermes/Gajae
lifecycle and cancellation; provider-owned authentication boundaries; optional
task worktrees; capability-aware model/workload execution; and bounded,
redacted preview HTTP/server/browser evidence. It also has task-wide Quick Open and an
explicit conflict-checked path for adopting completed parallel candidates
without resetting, merging, or committing user work. Existing terminal,
structured chat, preview, updater, and permission workflows remain intact.
The release surface now also exposes runtime identity, browser-handoff method,
read-only Smart App Control state, and direct Claude/Codex browser probes in the
installed UI instead of leaving those checks only in an external script. The
terminal surface exposes a persistent nested split tree backed by the same PTY
supervisor. It supports right/down actions, pointer and keyboard resizing,
reload restoration, and branch collapse after pane close while retaining the
single terminal plus preview workflow.

The change-review surface now provides old/new line numbers, bounded persistent
comments, resolve/reopen/delete controls, semantic restoration after harmless
diff-header movement, and structured agent follow-up. It does not alter Git,
stage files, merge, commit, or bypass the existing worktree/adoption checks.

The preview Inspector now supports explicit click-to-select evidence. A
temporary overlay runs only through the localhost Tauri bridge, blocks the
selected page action, and returns a bounded selector, safe shallow markup,
viewport rectangle, and allowlisted computed CSS. Input values, URL-bearing
attributes, event handlers, arbitrary data attributes, cookies, storage,
headers, bodies, queries, and fragments are not sent to the agent. The user can
cancel with `Escape`, clear the selection, or attach it to exactly the next
request. Normalized evidence is copied into the queued-turn payload, retained
across persistence/reload, and reused unchanged by background and parallel
execution through the existing permission boundary.

Preview responses now carry console warning/error counts, runtime errors,
resource status/timing metadata, and failures without collecting response
bodies, headers, cookies, storage, URL user info, queries, or fragments. The
same bounded evidence is available to the next agent turn. Diagnostics are now
armed automatically for the matching localhost preview and the full capture
runs at provider-turn completion, including provider failures unless the user
explicitly stops or interrupts the turn; manual `검사` is no longer a
prerequisite.

The Rust suite passes 86/86 in native and Store configurations, and native plus Windows MSVC Clippy pass with
warnings denied. Frontend build, fixture agent harness, updater/PTY smokes, release and dependency
audits, actionlint, ShellCheck, SOT validation, Windows
normal/Store cross-linking, and responsive preview-evidence checks pass. The
previously recorded real-provider calls returned `OK` through Claude Sonnet 4.6, Codex GPT-5.5
xhigh, and Hermes OpenAI-Codex/GPT-5.5.

Long-session responsiveness now has an explicit release invariant: normal
typing remains ref-backed, elapsed-time updates are isolated to a memoized
activity row, and completed transcript messages can skip off-screen layout and
paint while the active stream remains visible.

Package startup now has a separate truth surface. The top-level React boot
boundary writes a private renderer receipt, and the native probe verifies the
current version, live PID, canonical executable, main-window label, freshness,
and ready status. Signed macOS package verification and the physical Windows
gate reject process-only startup without this evidence.

## Evidence-Based Status

- `code_test`: ready
- `sot_state`: structurally valid, no errors or warnings
- `stella_readiness`: `pilot_ready`; local DoD 5/8, with only physical Windows,
  public Windows signing, and macOS notarization left unmet
- `mac_package`: reflected, version 0.2.5
- `mac_installed`: reflected and signed, version 0.2.5
- `mac_renderer_ready`: installed exact-executable/PID/window/status pass
- `mac_quick_open_visual`: pass through native menu and physical `Cmd+P` key
- `mac_oauth_browser_probes`: Codex and Claude pass through installed executable
- `mac_pty_supervisor`: installed three-session reconnect pass, 1.572 ms median
  and 1.932 ms p95 across 100 writes
- `oauth_signed_browser_helper`: installed helper allows a provider URL,
  rejects unrelated HTTPS, and is embedded in normal/Store Windows binaries;
  physical Windows browser visibility remains unproven
- `windows_browser_observation_gate`: source and workflow contract require a
  browser process, and the physical gate requires a visible window; neither is
  counted as runtime evidence until the unpublished workflow runs on Windows
- `preview_element_selection`: real overlay geometry, target-click suppression,
  `Escape` cancellation, host redaction, prompt attachment, and release smoke
  pass
- `mac_runtime_diagnostics_ui`: prior preview console/network receipts remain;
  the current automated launch context did not expose an on-screen/AX window
  for either retained 0.2.3 or 0.2.4, so no fresh visual pass is claimed
- `mac_public_release`: blocked by Developer ID/notarization
- `windows_cross_target`: normal and Store PE32+ x86-64 linked
- `windows_oauth_handoff_source`: WinRT-first plus dedicated COM STA fallback
  passes strict MSVC cross-target Clippy and release linking
- `windows_runtime_diagnostics`: in-app native handoff probe and read-only Smart
  App Control/runtime identity surfaces implemented and cross-linked
- `windows_physical_gate`: workflow and smoke ready; zero registered runners
- `windows_interactive_oauth`: validation required on physical Windows
- `windows_public_installer`: blocked until SignPath output passes signed smoke

## Historical 0.2.5 Final Status

`release_candidate_with_external_gates`

The local native runtime and automated package candidate are complete for the
historically defined 0.2.5 scope. The broader workspace product is not complete:
P0 stabilization and P1 workbench integration in the parity audit remain open.
The persistent product goal also remains active because public cross-platform
distribution must not be claimed until a physical
Windows machine records browser login, signed restart survival, and Smart App
Control evidence, and public signing/notarization gates are satisfied. No
database, user data, provider credential store, production deployment, paid
action, or external publication was modified during this audit.
