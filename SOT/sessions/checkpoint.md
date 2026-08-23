# Checkpoint — Hermes, Gajaecode and Grok Managed Usability

Updated: 2026-08-24 KST
Branch: `codex/release-readiness-final` (pushed to `origin` on 2026-08-24;
`main` untouched, no force)
Builder: release (Stella delegation SM-260824-6f4adf)
Version: source, candidate and installed app all `0.2.27`
(installed SHA-256 `c08d3749d8a70ede6709ab1d3585b91ee8b9a97835c9a429d8240c77076d9a22`,
built 2026-08-18 02:25 KST, codesign verified, renderer-ready)
Git: previous HEAD `fd47fba` (2026-07-28, 0.2.15) → `5cef1dc` (chore: ignore
rules) → `e4082eb` (feat: 0.2.16–0.2.27 source, tools, CI) → docs commit
tagged `v0.2.27` (this file is part of it, so its own hash is recorded in the
Stella mission report, not here).
Phase: repository landing and ledger reconciliation after 0.2.27
Step: the twelve locally installed versions since 0.2.15 are now committed,
tagged and pushed; foreign 2026-08-21 scratch output is quarantined outside
the tree; rustfmt is clean; the hermes temporary `approvals` block is removed.

## 2026-08-24 repository landing

- [x] Quarantine the 2026-08-21 bk-wiki-v2 scratch output (31 MB, 15 paths)
  to `/Users/kansic/bk-wiki-v2/inbox/atelier-misplaced-260821/` with
  `README-origin.md`; nothing deleted.
- [x] Move `SOT/service-factory-state.json.bak` to
  `/Users/kansic/Service/_quarantine/atelier-cleanup-260824/`.
- [x] Ignore `/tmp/` and `artifacts/**/*.png`; keep JSON proofs and markdown
  reports under `artifacts/` tracked; keep the tracked convention for
  `SOT/service-factory/{runs,bridge}/sf-run-*`.
- [x] `cargo fmt` on the last agent.rs diff; `cargo fmt --check` exit 0.
- [x] Gates before commit: `npx tsc -b` 0, `npx tsc --noEmit` 0,
  `cargo check` 0, secret scan 0 real hits (fixture strings only), no
  `*.key`/`*.pub`/`*.pem` staged.
- [x] Commit series `5cef1dc`, `e4082eb`, docs commit; tag `v0.2.27`; push
  branch and tag to `origin`.
- [x] `SOT/issues.md` reconciled to 0.2.27: OAuth (SM-260803-f0ea82) and
  rustfmt closed, two incidents recorded, two new recommendations.
- [x] hermes `config.yaml`: temporary `approvals: mode: 'off'` block removed
  (backup `config.yaml.bak-260824`), because installed `0.2.27` injects
  `HERMES_YOLO_MODE=1` from `agent.rs`.

## Previous step (2026-08-03, 0.2.22)

Installed `0.2.22` exposes the existing bounded conversation on the tailnet
mobile page and routes an authorized follow-up to the selected desktop session.
The blank installed renderer was recovered without resetting the 3 stored
sessions or 224 messages. Tailnet access remains active and private.

## In Progress

- [x] Publish existing task/conversation projections and authorize the current
  paired phone for exact-session continuation.
- [x] Recover the installed renderer, replace the app, and prove source,
  package, installed, and live tailnet surfaces separately.
- [x] Complete three explicit modes: local-only, selected private LAN, and
  Tailscale Serve for same-tailnet remote access.
- [x] Preserve unrelated Serve handlers and prove Atelier removes only its exact
  foreground handler on stop path; cleanup revalidation is still in progress for
  SIGTERM edge cases.
- [x] Render the exact mode-specific short-lived pairing URL as an accessible QR
  with manual URL/code fallback; never include the six-digit code in the URL.
- [x] Build, install, and prove `0.2.21` over real LAN and Tailscale HTTPS paths
  without deleting DB/data or enabling Funnel/public publication.

## Completed

- [x] Install and visually verify `0.2.22`; candidate/installed SHA-256
  `64de149c1842e0091db02724ca0c1b4c58cfb65c4d122114b38285371a29dbb6`.
- [x] Verify live mobile monitor projection: 3 sessions, 1 active, 180 bounded
  messages, no internal session IDs/absolute paths/raw execution fields/obvious
  secrets.
- [x] Pass Rust all-feature 276/0/6, strict Clippy, format/diff, production build,
  and mobile/session/rendering smokes.
- [x] Prove an explicit Tailscale remote start survives an installed-app restart
  while the Mac is locked, and prove explicit Stop disarms future restore before
  Serve cleanup.
- [x] Reproduce the `0.2.20` loopback-only mobile connection failure: loopback
  health succeeds while Wi-Fi/Tailscale addresses refuse the listener.
- [x] Prove a physical iPhone can reach the host over LAN and reaches the new
  self-signed TLS handshake boundary before the expected first-visit warning.
- [x] Enable tailnet HTTPS/Serve, remove the activation flow's optional Funnel
  policy, and verify current node capabilities contain `https` but no `funnel`.
- [x] Complete the `0.2.20` composer description-removal source, install, and
  visual-proof cycle.
- [x] Loaded the Atelier SOT and confirmed project ownership.
- [x] Matched the user-visible failure to the provider-capability blanket block.
- [x] User explicitly approved fixing both Hermes and Gajaecode.
- [x] Verify the live Hermes CLI permission/sandbox/approval contract.
- [x] Verify the live Gajaecode CLI permission/sandbox/approval contract.
- [x] Verify isolated runtime/default-skill bootstrap paths for a clean Mac.
- [x] Scope a safe managed execution path, identity-correct UI, and automatic
  readiness repair.
- [x] Implement macOS workspace sandbox and adapter-owned execution routing.
- [x] Implement exact-pin runtime/default-skill auto-bootstrap.
- [x] Implement identity-correct, non-blocking readiness UX.
- [x] Independently QC, build, install, and visually verify the 0.2.13 source and
  installed app boundaries that already exist in this branch.
- [x] Diagnose the real Hermes wheel omission, replace mutable-checkout copying
  with an exact-commit durable archive, and verify 73 installed skills.
- [x] Build and install 0.2.14, match candidate/installed executable hashes, and
  exercise `설치·복구` for Hermes and Gajaecode in the installed UI.
- [x] Build and install the final 0.2.15 candidate, match candidate/installed
  executable hashes, and pass renderer-ready proof.
- [x] Add source-side wiring for Hermes model default + Gajae provider picker and
  child-env auth bridge contract.
- [x] Verify via source/build/installed proof that saved model defaults are applied
  only to newly created sessions, while existing sessions remain unchanged unless
  explicitly edited.
- [x] In the installed app, change Gajae from Claude to Codex, restart the app,
  confirm Codex remains selected, and create a new Gajae task showing
  `Codex` / `5.5`; restore the prior Claude default afterward.
- [x] Remove the persistent `스텔라 모드 상태 없음` composer row, retain Stella
  execution/safety controls, and verify the installed 0.2.16 UI.
- [x] Identify the initial 0.2.17 Hermes rendering causes from live evidence
  instead of treating the symptom as CSS-only breakage.
- [x] Remove eager managed-Hermes `--skills` preload while retaining
  Atelier-owned managed skill inventory verification.
- [x] Move managed Hermes to the machine-readable `chat -Q` contract and keep
  stderr-only session metadata out of the visible answer body.
- [x] Restore SQLite `state.db` access for managed Hermes on macOS without
  widening sibling personal-path reads.
- [x] Build/install the 0.2.17 local candidate and match candidate/installed
  executable hashes with installed renderer-ready proof.
- [x] Run the exact managed Hermes temporary-auth, HOME, sandbox, skill, and
  `chat -Q` path against Codex and record that the short marker happened to
  return answer-only stdout, with a persisted session, 14,388 first-call input
  tokens, and SQLite `quick_check=ok`; this was historical evidence, not a
  general stdout contract.
- [x] Reproduce the later long-run failure from the real persisted
  13,112-character record and managed Hermes state, disproving the assumption
  that quiet stdout is always answer-only.
- [x] Make Hermes stdout diagnostic-only and select the exact new final answer
  from managed state with fail-closed session, turn, ancestry, status, and size
  validation.
- [x] Apply one terminal/rendering contract to Claude, Hermes, Codex, and
  Gajaecode; preserve streamed drafts and contaminated originals as evidence
  without promoting them to verified answers.
- [x] Build/install `0.2.19`, match candidate/installed executable hashes,
  pass renderer-ready proof, and pass a real managed Hermes turn through the new
  verified-answer path.
- [x] Fix managed Gajae update no-op behavior by aligning check/action to the
  Atelier-supported pin and updating in-place from `gjc/0.11.7` to
  `gjc/0.12.8`; verify four defaults, the schema-2 receipt, separate
  `update_available: false` status, and unchanged hashes for nine DB/WAL/SHM
  files.
- [ ] Verify via installed app auth path for Gajae Codex when token bridge is missing
  vs present by observing a real provider response/failure.

## Current Problem

- Installed runtime preparation, repair, provider-neutral rendering recurrence
  prevention, and an authenticated managed Hermes turn are verified on the
  current Mac.
- A direct standalone Hermes replay still fails closed without the app-owned
  temporary Codex credential staging path, as designed.
- A second physical clean company Mac and a full authenticated Gajaecode turn
  remain the distribution-level confirmation.
- Non-macOS support remains intentionally disabled with explicit reason strings.
- Final source and installed-Mac verification is closed for Tailscale external
  access: all-feature Rust is `268` passed and `6` ignored, strict Clippy passes,
  the installed candidate hash is
  `f03d9cf2c77b9f66cb42579202bd37d0f0e28fd114e075edccb642593b550dfc`,
  and normal Stop plus SIGTERM both reap the owned Serve process and mapping.
- Physical cellular-network and physical Windows external-access confirmation
  remain unverified; notarized/public distribution remains unclaimed.

## Acceptance Criteria

- [x] Hermes and Gajaecode can accept and run managed tasks through their real
  supported CLI contracts (source verified).
- [x] A clean company Mac needs only the Atelier installer; pinned provider
  runtimes and default skills are prepared in Atelier-owned locations.
- [x] Gajaecode keeps its own skill namespace and never imports personal
  Codex/Claude/Atelier global skills (source verified).
- [x] Personal global CLI or skill state cannot silently change the resulting
  work level (source verified).
- [x] Authentication/API entitlement remains explicit user-specific state and
  is never bundled.
- [x] Basic remains the default and no Full/bypass path returns.
- [x] The UI distinguishes the Atelier agent adapter from an adapter's internal
  model provider.
- [x] Unsupported permission claims fail clearly without disabling every task.
- [x] Stop/cancel, lifecycle, worktree, safety preflight, and direct CLI
  boundaries remain intact.
- [x] Installed-app interaction proof confirms runtime/default-skill preparation
  and repair are usable without separate skill installation.
- [x] Installed-app proof boundary is closed for version/hash/codesign/renderer-ready,
  and click-driven app-reopen/new-session proof confirms persisted Gajae model
  defaults are used in new sessions while existing sessions remain immutable by
  default.
- [x] The exact Atelier-managed Hermes production path returns only the
  state-verified assistant answer; stdout and streamed drafts cannot become the
  canonical answer.
- [ ] Installed-app interaction proof confirms Gajae Codex uses GJC child-env via
  provider token and fails clearly when missing/expired.
- [ ] A separate clean company Mac confirms a full authenticated managed
  response and installed rendering behavior for both providers.

## Starting Baseline

- Source and installed local candidate: `0.2.27` (baseline text below was
  written at `0.2.19`; counts are that snapshot unless restated above).
- Rust all-features: 254 passed, 0 failed, 6 ignored.
- Orca: 24 contract smokes across 10 removable features.
- Strict all-target/all-feature Clippy: passed.
- `npm audit`: 0 vulnerabilities.
- RustSec: 0 known vulnerabilities; 18 unmaintained and 3 unsound upstream
  warnings remain visible.
- Format and diff checks: passed.
- Preview: managed start fail-closed; trusted external localhost inspection
  retained.
- Permission: Basic default; Auto sandbox plus approvals; visible/raw Full
  removed.
- Provider scope: Claude/Codex support managed Basic/Auto. Hermes and Gajaecode now
  use Atelier-managed bootstrap/sandbox on macOS and remain disabled with reason on
  non-macOS.
- Guard: shared frontend/Rust prompt corpus; phrase denylist is not a complete
  action guarantee.
- Verdict: `supervised local candidate, public release blocked`.
- Installed: `/Applications/Atelier.app` `0.2.19`; candidate/installed
  executable SHA-256
  `a72a251ff88977a22bb1e6720db64e47863bc7d9182dc8c06e3ebd5cdcbe2754`;
  codesign and renderer-ready pass.
- Runtime receipts: Gajaecode 4 verified defaults at `0.12.8`/Bun `1.3.14`;
  Hermes 73 verified skills at pinned commit `3ef6bbd…`.

## Safety Boundaries

- Preserve user-owned untracked paths `artifacts/*.png` and `tmp/` (both are
  now gitignored, never deleted by tooling).
- Do not delete DB/data, publish, deploy, or modify credentials. Pushes happen
  only with explicit approval from the owner, only to
  `codex/release-readiness-final`, never to `main`, never with force
  (2026-08-24 precedent).
- Do not replace `/Applications/Atelier.app` or run `tauri:build` from a
  dirty or unpushed tree without recording it in the proof (see
  `SOT/issues.md` recommendation).
- Keep source/build, installed-app, and public-release evidence separate.
