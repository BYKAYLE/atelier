# Change Request: Reproducible Hermes and Gajaecode Runtime

Status: Hermes state-backed final-answer and provider-neutral rendering contract
verified and locally installed at 0.2.20; Gajae provider-turn and second
clean-Mac proof remain pending
Approved by: user
Approved at: 2026-07-25 KST

## Request

Fix remaining parity gaps in managed Hermes/Gajaecode operation for provider model
selection, without reintroducing per-user global dependency. A company user must
be able to install Atelier on a different Mac and begin with the same pinned
agent runtime, default skills, policy, and working flow without separately
installing skills or relying on the original developer's global Mac state.

### 2026-07-30 Rendering Root-Cause Amendment

The user additionally approved correcting the recurring Hermes answer-rendering
failure at its execution boundary. The authorized result is not a CSS-only
workaround: Atelier must prevent provider progress/tool diagnostics from entering
assistant text, preserve streamed line boundaries, avoid eager injection of the
entire managed skill inventory, and keep the managed SQLite store usable inside
the existing macOS sandbox.

### 2026-07-31 Verified-Answer Amendment

Later real long-run evidence disproved the assumption that `chat -Q` stdout is
always answer-only. The authorized recurrence-prevention result therefore
treats provider stdout/streamed drafts as evidence rather than a canonical
answer, verifies Hermes's exact final assistant row from managed state, and
applies the same terminal-result authority and lossless historical recovery to
Claude, Hermes, Codex, and Gajaecode.

### 2026-08-02 Gajae update-contract amendment

Gajae update checks were falsely using npm latest as the gate while install/repair
remained pinned, which allowed “update available” states without actual version
correction. The updated contract is now fixed to compare and action on the same
Atelier-supported pin (`0.12.8`), make the update command return verified
production readiness, re-read a separate post-update status, and remove the
npm-latest/pinned-install mismatch.

### 2026-08-02 Composer explanation-removal amendment

The user explicitly requested removal of the always-visible composer sentence
that repeated agent, model-provider, managed-runtime, and bundled-skill identity.
The approved result removes only that non-actionable explanation and its
description-only derivation code. Model/provider controls, Gajae primary-action
controls, Stella launch action, permissions, and actionable runtime/authentication
status banners remain visible and behaviorally unchanged.

### 2026-08-02 Mobile QR and reachable-address amendment

The user explicitly requested QR pairing and reported that the current mobile
monitor URL cannot be reached. Live inspection reproduced the issue: the
installed `0.2.20` server was healthy on `127.0.0.1` but listened on loopback
only, so both the Mac's Wi-Fi and Tailscale addresses refused connections.

The approved result must therefore do more than render a QR code. Atelier must
make loopback-only state unmistakable, provide an explicit safe transition to a
phone-reachable listener, advertise a reachable LAN or Atelier-supported private
overlay address, and encode that exact short-lived one-use pairing URL in an
accessible QR. Existing TLS, certificate-fingerprint, token, expiry, revocation,
read-only scope, and per-device follow-up approval boundaries must remain intact.

The user then clarified that the intended client is a normal iPhone or Android
browser connecting to an Atelier host on either Windows or macOS, including
when the phone is outside the host's local network. This explicitly expands the
approved result with a separate Tailscale mode. That mode must use Tailscale
Serve only, remain reachable solely inside the same tailnet, bind Atelier's
backend to loopback, and never invoke or advertise Tailscale Funnel. Atelier
must discover the platform CLI, report actionable readiness, own the Serve
process lifecycle, preserve unrelated Serve configuration, and encode only the
tailnet HTTPS URL plus pairing identifier in the QR. Tailscale installation and
same-tailnet sign-in are the only additional device prerequisites; this does
not change the requirement that Atelier-managed agent runtimes and skills work
without separate skill installation.

### 2026-08-02 External Tailnet Access proof amendment

The user requested external phone access irrespective of local Wi‑Fi and confirmed
that remote access should work for both Windows and macOS hosts when the phone is
on the same Tailscale tailnet. The approved target is tailnet-only access via
Tailscale Serve, with backend loopback binding and no direct public/funnel
listener exposure.

### 2026-08-02 Mobile task-continuity correction

After the tailnet connection became reachable, the user confirmed that the real
purpose is to open the existing Atelier work on a phone and continue that exact
work. The current Mobile Monitor does not meet that goal: it exposes only
provider/lifecycle counters, while desktop sessions and messages remain inside
the renderer local store; its existing follow-up proposal path creates a new
session after desktop approval instead of resuming the selected session.

The approved correction is therefore to publish a bounded, sanitized projection
of the current desktop sessions to the native mobile server, show the active and
recent work with user/final-assistant messages, and route a mobile follow-up into
the selected existing session queue. Mobile input must not choose or alter the
workspace, provider, model, permission mode, provider session ID, or raw tool
state. Raw CLI events, reasoning/progress dumps, credentials, attachment paths,
and full filesystem paths must not be returned. Follow-ups require an explicitly
enabled paired-device scope, an opaque mobile task ID, revision validation,
idempotency, rate limiting, and the existing Host/Origin/token boundaries. A
missing or changed desktop session must fail closed and must never create a new
session as fallback.

Latest verified facts:

- Installed `0.2.22` now publishes the existing renderer work to mobile: a live
  tailnet monitor request returned 3 tasks, 1 active task, and 180 bounded
  messages. The response exposed no internal session IDs, absolute workspace
  paths, raw execution fields, or obvious credential patterns.
- The previously paired `Mobile browser` device now has the explicit
  `task:followup` capability. The external endpoint remains tailnet-only and its
  `/atelier/health` response reports version `0.2.22` and status `ok`.
- The installed blank-window regression was corrected without clearing local
  storage: all 3 persisted sessions and 224 stored messages remained present.
  Background promise failures can no longer replace the committed application
  root, and mobile projection failures are caught before reaching global render
  recovery.
- Candidate and installed executable SHA-256 match at
  `64de149c1842e0091db02724ca0c1b4c58cfb65c4d122114b38285371a29dbb6`;
  local codesign and installed renderer readiness pass.
- Tailscale remote access persists only after an explicit Tailscale start. A
  real installed-app restart restored `/atelier/health` while the Mac was
  locked; explicit Stop disables future restore before runtime cleanup.
- Remote mode uses Tailscale Serve only (no Funnel), with exact reachable URL
  `https://kansic-macbookpro.tailb0943d.ts.net:8443/atelier/`.
- Mobile access now has explicit three modes: local-only, selected private LAN,
  and same-tailnet Tailscale remote mode.
- Tailscale mode keeps Atelier backend bound to `127.0.0.1` and preserves unrelated
  Serve handlers while keeping only the Atelier-owned path mapping.
- QR pairing now encodes the exact remote URL plus pairing identifier; it does
  not include raw six-digit codes in the URL.
- Installed proof reached ready state for `0.2.21` with candidate/installed hash
  `f03d9cf2c77b9f66cb42579202bd37d0f0e28fd114e075edccb642593b550dfc`.
- Tailnet endpoint checks were performed on the Mac HTTPS stack:
  `/atelier/` page `200`, `/atelier/app.js` `200`, `/atelier/health` `200`,
  TLS verify success path, and Host/Origin rejection for invalid API calls
  (`403`/`401` as expected).
- Physical iPhone Safari launch via pairing URL was executed on tailnet and observed
  Tailscale activity counters increasing (`Rx 122908 -> 128476`,
  `Tx 166316 -> 184020`), confirming the physical mobile browser reached Atelier
  through the tailnet URL rather than a mirroring path.
- Final all-feature Rust verification passed (`274` passed, `6` ignored), strict
  all-target/all-feature Clippy passed with warnings denied, and the mobile-control
  smoke, production frontend build, and `git diff --check` all passed.
- Installed-process SIGTERM proof and the normal UI Stop flow both remove the exact
  Atelier Serve handler, close the loopback backend port, and reap the foreground
  Serve guard/child. The final post-stop Serve status is `{}`.

Remaining unverified boundaries:

- Physical cellular-network path and physical Windows verification were not
  performed.
- Public notarized/distribution release is still out of scope.

## Authorized Scope

- Verify the real installed Hermes and Gajaecode CLI permission, sandbox,
  approval, skill, configuration, and first-run contracts before changing the
  adapter.
- Restore managed task input, lifecycle, cancellation, worktree, and result
  collection for both adapters without restoring Full/bypass execution.
- Keep adapter identity separate from its internal model provider. Selecting
  Codex inside Gajaecode must not make the UI claim the task itself is a Codex
  adapter task.
- Keep Gajaecode's CLI, settings, skills, setup, and update flow in an isolated
  Gajaecode-owned namespace. Do not import personal Codex, Claude, Hermes, or
  Atelier global skills.
- Ensure Hermes/Gajae model-provider selection is contractually split from
  adapter identity: settings represent a new-session default, while an explicit
  composer provider/model change updates the current session and the future
  new-session default. Other existing sessions remain unchanged.
- Add Gajae internal model-provider settings (Claude / Codex / Alibaba) in settings
  UI and persist only what is needed for new-session defaulting.
- Bridge Gajae Codex auth to the isolated child env as an access-token only
  (no refresh-token, no personal skill/config migration, no agent.db export).
- Make Atelier's installer/first-run flow prepare pinned provider runtimes and
  default skills in Atelier-managed locations so users do not perform a
  separate skill installation.
- Add readiness inspection and bounded repair behavior that explains only
  genuinely user-specific blockers such as authentication or API entitlement.
- Prove the clean-user bootstrap contract without reading or mutating provider
  credentials and add focused plus full regression gates.

## Explicit Boundaries

- Do not delete databases, user data, user-owned files, or existing untracked
  paths.
- Do not run production deployment, publication, paid actions, or `git push`.
- Do not modify provider credentials or external provider configuration.
- Do not bundle account credentials, API keys, personal provider state, or
  personal global skills.
- Do not represent online first-run provisioning as offline availability.
- Do not claim that prompt policy or provider-native controls are a complete
  app-owned action/tool proxy.
- Preserve the existing Claude/Codex managed permission behavior, direct Gajae
  workflows, stop/cancel paths, and user-owned untracked paths.

## Starting Baseline

- Atelier `0.2.13` source gates are green: 209 all-feature Rust tests passed with
  1 ignored, the Orca gate passed 23 contract smokes across 10 removable
  features, strict all-target/all-feature Clippy passed, `npm audit` reports 0
  vulnerabilities, and RustSec reports 0 known vulnerabilities with 18
  unmaintained and 2 unsound upstream warnings retained. Format and diff checks
  pass.
- Managed preview start remains fail-closed. Inspection of a separately trusted
  localhost service remains available.
- The visible and runtime raw Full path is removed. Basic is the default; Auto
  keeps provider sandboxing and approval checks active.
- Managed permission capability is provider-specific: Claude and Codex support
  managed Basic/Auto. Hermes and Gajaecode are blanket-disabled before
  lifecycle/spawn and expose the blocking reason in the UI. This is the
  user-visible defect being corrected.
- Frontend and Rust guards are exercised by a shared prompt corpus. Phrase
  matching is an interim guardrail, not a complete action-level guarantee.
- Current verdict: `supervised local candidate, public release blocked`.
- No public publish, public signing, notarization, deployment, DB/data deletion,
  paid action, or credential mutation was performed.
- The app-owned action/tool proxy and scoped approval receipts remain P1.
- The locally signed `0.2.13` candidate is installed at
  `/Applications/Atelier.app`; candidate/installed executable hashes match,
  codesign passes, and the renderer reports `ready`.

## Verified Outcome

- Final local candidate is `0.2.19`; candidate and installed executable
  SHA-256 match at
  `a72a251ff88977a22bb1e6720db64e47863bc7d9182dc8c06e3ebd5cdcbe2754`.
- Gajaecode is isolated under Atelier-owned GJC paths at `0.12.8` with managed
  Bun `1.3.14` and four verified defaults. Personal Mac skill roots are not
  imported.
- Hermes is pinned to commit `3ef6bbd…`, uses provider-local Python, and
  verifies 453 durable source files against 73 installed skills.
- The installed UI successfully executes `설치·복구` for both providers.
- Source gates pass at Rust 254/0/6, Orca 24/10, strict Clippy, production build,
  release audit, provider/connection smokes, and zero known npm/RustSec
  vulnerabilities.
- Hermes and Gajae now expose settings-driven model-provider defaults in source
  and installed app flows, and the Gajae Codex readiness badge follows the
  OAuth-only child-env bridge contract instead of treating an API key as
  sufficient.
- Installed-app interaction confirms that a Gajae provider change survives an
  app restart and that a newly created Gajae task opens with the persisted
  provider/model (`Codex` / `5.5`). The pre-proof user default was restored to
  `Claude` after the check.
- A real 13,112-character persisted Hermes contamination record with 119
  `****` boundaries now recovers its 1,839-character final display without
  progress blocks, while the stored original remains unchanged.
- The exact Atelier-managed Hermes auth, runtime, sandbox, on-demand skill, and
  state-verification path completed real Codex-backed session
  `20260731_163009_66f19f`. It rejected 24 stdout bytes as untrusted and
  returned the 23-byte verified final state answer.
- The real managed Gajaecode runtime updated from `0.11.7` to `0.12.8`; Bun
  remained `1.3.14`, four adapter defaults and the schema-2 receipt verified,
  the separate status returned `update_available: false`, and all nine
  DB/WAL/SHM hashes remained unchanged.
- Remaining validation is Gajae's authenticated provider turn and a second
  physical clean company Mac. Credentials and entitlement remain user-specific
  and are not bundled.
- Current release boundary: local installed-candidate proof only; no public
  publish, public signing, notarization, or physical Windows/OAuth claims.
