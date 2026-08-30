# Issues

Updated: 2026-08-25 KST. Source and installed app: `0.2.31`
(installed executable SHA-256 `7c8de545…4f6c`, codesign verified).
Current disposition: `supervised local candidate, public release blocked`.

Git baseline: branch `codex/release-readiness-final`, previous HEAD `fd47fba`
(2026-07-28, 0.2.15). On 2026-08-24 the 0.2.16–0.2.27 working tree landed as
`5cef1dc` (chore: ignore rules), `e4082eb` (feat: 0.2.16–0.2.27 source), and
the docs commit tagged `v0.2.27`; the branch is pushed to `origin` for the
first time in the same session. 0.2.28 landed as `04cbc7b` (`v0.2.28`);
0.2.29 adds the Stella Mode stage-model commits on the same branch.

## Open

- 0.2.31 boundary: the OpenRouter staged-run proof stops at the credential
  boundary — receipt `c97a1ae7-c141-4e7f-9f8d-2f08f9f98e9f` shows the correct
  routing (provider=hermes, backend=openrouter, model
  `anthropic/claude-haiku-4.5`) and a clean fail-closed message asking to
  connect OpenRouter in 설정 > 연결. The machine has no OpenRouter credential;
  after the CEO connects one, re-run the same dispatch for a full `succeeded`
  proof. The Alibaba supply path is fully proven
  (`9bcc655e-a778-4d36-99c9-9fdcee7a0caa`, planning hermes/alibaba/
  qwen3.7-plus succeeded).

- P0 residual (08-25 internal-report exposure, tag now clean): two admin
  follow-ups remain unconfirmed — the GitHub Support purge of the
  now-unreferenced `37a6b1b` objects from caches, and the relocation of the
  scheduled task that writes company reports so its output never lands inside
  a public repo working tree. The tag exposure itself is closed (see Resolved
  2026-08-30), and the recurrence class is mechanically blocked by the
  `reports/` ignore rule, the repo hygiene gate, and the no-`git add -A`
  release rule.

- 0.2.29/0.2.30 verification boundary: the stage-model composer surfaces
  (`stage-model-toggle`/`stage-model-panel`/`stage-model-status`, and the
  0.2.30 per-row provider selector, reset button, and auth warning) are covered
  by source/type gates, and staged execution — including the 0.2.30
  cross-provider path — is proven headlessly through installed CLI receipts,
  but the panel rendering has not been visually exercised in the running UI.
  Same class as the standing Connections-tab visual gap below. The 0.2.29
  "reset" complaint was root-caused to a display collapse (fixed in 0.2.30
  with contract survival rules); if the CEO still sees a reset after 0.2.30,
  capture the exact interaction sequence — the remaining candidates would be
  interaction paths outside the panel.
- 0.2.30 CLI parse message: an unknown stage provider (e.g. "openai") is
  rejected fail-closed, but the receipt message says the assignment "must be
  an object with provider/model/effort strings" instead of naming the invalid
  provider. Cosmetic; sharpen in a later pass.
- Parallel-session WIP preserved, not merged: an interrupted parallel session
  left an unreviewed gajecode-OpenRouter provider work-in-progress in the main
  tree (agent.rs, AgentWorkspace.tsx, ConnectionsPanel.tsx,
  agentProviderPreferences.ts, two smokes). It is preserved verbatim on branch
  `wip/gajecode-openrouter-260824` (local, commit `8b29897`) and deliberately
  excluded from the 0.2.29 release; that feature needs its own gates before it
  can land.

- Hermes pin promotion is blocked upstream: every hermes-agent release from
  `v2026.7.30` onward (including `v2026.8.19` / `fcbd107`, 0.20.5) ships a
  `setup.py` guard (#68217, 2026-07-22) that refuses wheel builds, so
  `uv tool install "hermes-agent[anthropic] @ git+…"` fails. Atelier stays on
  `3ef6bbd` (`v2026.7.20`). Moving forward requires a new managed install
  strategy (editable `uv sync` checkout, upstream shell installer, or the
  `HERMES_NIX_BUILD` escape hatch — the last is an upstream-internal switch and
  was deliberately not used). The Connections card now shows the newer upstream
  tag as a reference only.
- 0.2.28 verification gap (remaining): the Connections-tab rendering of the
  upstream reference line has still not been visually exercised.
- CLOSED 2026-08-24: installed-app real turns on 0.2.28 both succeeded once the
  macOS session was unlocked (screen lock had suspended the WebKit renderer, so
  the queued turn stayed unclaimed). Gajaecode 0.15.0 turn
  `35b5a25d-3b66-48c9-93a8-175403b025cf` completed `succeeded` with summary
  `0.2.28` (model `claude-opus-4-8`, ~51.6 min). The Hermes regression turn
  `cdc520bc-36e9-4b31-9799-7a56b8d4de71` (pin `3ef6bbd`, model `gpt-5.5`)
  completed `succeeded` with summary `0.2.28` (~15.3 min). Provider readiness
  re-checked at the same time: `runtimePin` `0.15.0`, `dependencyPin` `1.4.0`,
  installed `CFBundleShortVersionString` `0.2.28`; no new atelier entries in
  `~/Library/Logs/DiagnosticReports`.
- Recorded and closed in 0.2.28: managed-agent `업데이트 확인` compared only
  against the Atelier pin and never consulted upstream, so newer upstream
  releases (gajae 0.15.0, hermes v2026.8.19, grok 1.0.5) were invisible.
- P1: prompt phrase matching does not mediate the actual provider tool/action
  boundary. Add an app-owned action/tool proxy with scoped, expiring, one-use
  approval receipts before claiming action-level safety.
- Public distribution remains blocked by Developer ID notarization, Windows
  public signing, physical Windows OAuth/install/restart evidence, and the
  unavailable Tauri updater private key (`release-preflight-current.json`
  still reports `updater-public-key` and `github-release-secrets` failures).
- A click-driven installed-app E2E covering React parallel launch, native
  worktree preparation, IPC, adapter execution, comparison, and adoption is not
  yet implemented. Current proof combines frontend contracts with backend E2E
  and worktree integration tests.
- P2: the production frontend bundle still emits a large-chunk/code-splitting
  warning (`dist/` index chunk ~1.5 MB). Performance debt, not a source or
  local-install failure.
- Physical Windows host/mobile proof and a post-0.2.22 physical-phone direct
  provider turn remain unverified. The current Mac tailnet endpoint, installed
  mobile projection, and exact-session dispatch contracts are verified; no paid
  provider instruction was injected solely for testing. Windows code compiles
  and links through `cargo xwin`; real `taskkill`/`tasklist` behavior still
  requires a physical Windows runner.
- A real self-hosted model response has not been tested. The borrowed GPU
  server was intentionally left unchanged.
- Gajae internal Codex still needs a real installed-app provider turn covering
  both the missing/expired-token failure and a successful authenticated
  response. A second physical clean company Mac and an authenticated
  installed-app Gajaecode response remain distribution-level validation.
- Grok: the installed runtime is authenticated on this Mac (`0.2.26` proof
  `GROK_ATELIER_OK`), but a multi-turn, tool-using Grok Build task in the
  installed app has not been exercised beyond the one-turn read-only proof.

## Recommendations (2026-08-24) — IMPLEMENTED in 0.2.34 (2026-08-30)

- Gate installed-app replacement on a committed source state — implemented:
  `tools/install-macos-candidate.sh` (`npm run install:candidate:mac`) is the
  canonical replacement path (gate → candidate validation → backup → quit →
  ditto → relaunch → proof) and refuses when the working tree is dirty or
  HEAD carries no `v*` tag. The single override,
  `ATELIER_INSTALL_GATE_OVERRIDE_REASON`, records its reason into the proof
  JSON; the proof also records `versionTagOnHead` at proof time.
- Repo-root hygiene check — implemented: `tools/repo-hygiene.mjs` fails
  `release:preflight` (check `repo-hygiene-untracked`) and `audit:release`
  with the offending list when untracked files appear outside
  `src/ src-tauri/ tools/ SOT/ artifacts/ docs/ PRD/`.
- Both gates are covered by the forced-trigger mutation smoke
  `smoke:release-guards` (untagged HEAD refused, dirty tree refused, override
  honored and recorded, foreign untracked paths listed, non-git fails
  closed), plus a live mutation against the real `audit:release` (planted
  root file → exit 1 with the file named; clean → exit 0).

## Resolved 2026-08-30

- P0 (08-25) remote-tag exposure closed: `git ls-remote origin` verified on
  2026-08-30 that `refs/tags/v0.2.30` points at the clean `4747644` (the
  rewritten tip without the internal report), matching the local tag. The
  ruleset-blocked repoint the incident called for was completed by the admin.
  Residual admin follow-ups (GitHub cache purge, report-writer relocation)
  stay tracked under Open.
- Third foreign-scratch recurrence quarantined and the class mechanized: an
  untracked `scripts/migrate_hermes_role_crons.py` (+ `__pycache__/`), a
  Hermes cron role-isolation migration script operating only on
  `~/.hermes/**` (created 2026-08-26 by a session with `cwd=atelier`), was
  moved without deletion to
  `/Users/kansic/Service/_quarantine/atelier-cleanup-260830/` with a
  `README-origin.md`. After the 08-21 scrape output and the 08-25 report
  drop, this third recurrence is why the repo hygiene gate above now fails
  the audit/preflight mechanically instead of relying on manual sweeps.
- The 27-day uncommitted-accumulation class is structurally closed: the
  0.2.32–0.2.33 working tree (17 tracked files, +1,525/−1,883, plus the new
  workspace-selection smoke) landed as three logical commits (`e1487c2` feat
  workspace folder selection / `2816fe3` chore agents+version sync /
  `5d65b26` SOT docs) with explicit file staging, and the install gate now
  refuses to replace the installed app from an uncommitted tree.
- nanoid advisory GHSA-2v37-7h3g-55p8 (high, custom generators can loop
  indefinitely when size is zero): fixed via `npm audit fix`
  (3.3.16 → 3.3.18, lockfile-only); `npm audit` reports 0 vulnerabilities and
  the frontend build plus smokes re-passed.

## Incidents recorded 2026-08-24

- Uncommitted accumulation, 27 days: between 2026-07-28 (`fd47fba`, 0.2.15)
  and 2026-08-24, twelve versions (0.2.16–0.2.27) were built, signed,
  installed, and proved, while nothing was committed — 63 tracked files
  (+18,626/−3,372) and 54 untracked paths lived only in one working copy, and
  25 local commits were never pushed because the branch did not exist on
  `origin`. The installed-candidate proof for 0.2.27 records
  `workingTreeDirtyAtProofTime: true`. Closed by the 2026-08-24 commit series
  and first push; see the recommendation above for the structural fix.
- Foreign scratch output in the repo root (2026-08-21 09:14–09:34 KST): a
  bk-wiki-v2 agent session (`pythagoras`, `company_work.sqlite3`
  `support_program` upsert) ran with `cwd=atelier` and wrote 31 MB of scraped
  support-program HTML, nine `tmp_*.py` scripts, two JSON ledgers, a report,
  and `reports/2026-08-21_pythagoras_internal_tech_report.md` into this tree.
  Moved without deletion to
  `/Users/kansic/bk-wiki-v2/inbox/atelier-misplaced-260821/` with a
  `README-origin.md`. `SOT/service-factory-state.json.bak` (0.2.14-era
  backup) was moved to `/Users/kansic/Service/_quarantine/atelier-cleanup-260824/`.

## Resolved 2026-08-24

- Claude subscription OAuth login (SM-260803-f0ea82 and follow-up, rounds
  1–6): the `sk-ant-oat` bypass in `provider_save_api_key` is removed and the
  UI routes subscriptions to the login button; the three completion defects
  (login watch decoupled from modal lifetime, keychain write refusal surfaced
  as `ClaudeTokenCapture`, stale error cleared on already-connected early
  return) are fixed; PTY CR-separated code submission, 10-second no-response
  warning, duplicate-attempt epoch isolation, ANSI-clean errors, single
  `auto_open_login_url` gate, and stream-latched one-shot signals are in
  `0.2.22`. Status: approved in the Stella ledger.
- rustfmt: the last remaining `cargo fmt --check` diff (agent.rs effort
  match expression) is formatted in `e4082eb`; `cargo fmt --check` exits 0.
- The hermes `approvals: mode: 'off'` temporary block (260803 round10) in the
  Atelier-owned hermes `config.yaml` is removed now that the installed `0.2.27`
  carries the `HERMES_YOLO_MODE=1` child-env injection (`agent.rs`); a
  backup `config.yaml.bak-260824` is kept beside it.

## Resolved in earlier sessions (0.2.13–0.2.22)

- Mobile access no longer shows only lifecycle counters. Installed `0.2.22`
  returned 3 existing tasks, 1 active task, and 180 bounded messages over the
  tailnet endpoint, and the existing `Mobile browser` device is authorized to
  continue a selected task.
- The installed blank-window regression is closed by single-root renderer
  recovery, shell-backed readiness, and local projection error containment.
  Existing local storage remained intact at 3 sessions and 224 messages.
- Candidate and installed `0.2.22` executable hashes match at
  `64de149c1842e0091db02724ca0c1b4c58cfb65c4d122114b38285371a29dbb6`;
  codesign, renderer readiness, visual capture, tailnet health, and full source
  gates pass.
- The restart-only mobile outage is resolved: an explicitly enabled Tailscale
  endpoint restores after app restart, while explicit Stop disarms restore even
  if Serve cleanup later reports an error.
- The redundant composer runtime-identity sentence was removed in `0.2.20`
  without removing model/provider/permission controls, Gajae/Stella actions, or
  actionable runtime/authentication banners. Independent source review found no
  P0-P3 defect, and installed-app visual proof confirms the sentence is absent.
- The locally signed `0.2.20` candidate is installed at
  `/Applications/Atelier.app`; candidate/installed executable SHA-256 matches at
  `098ac2aaa404deab7d1432868450ca1859049bdd4c1892554594f99dfa3d773e`,
  codesign and renderer readiness pass, and the prior `0.2.19` app remains in
  the Atelier backup folder.

- The recurring rendering failure is closed at the provider-common terminal
  boundary: Claude, Hermes, Codex, and Gajaecode never promote a streamed draft
  over a terminal result/error, and historical dense progress records are
  recovered at display time without mutating stored originals.
- The `0.2.17` four-boundary mitigation was incomplete because `chat -Q`
  stdout was not a canonical final-answer channel for long/tool-heavy runs.
  `0.2.18` treats stdout as diagnostics and verifies the exact new Hermes final
  answer from managed state with strict session/turn/ancestry/status checks.
- Real managed Hermes session `20260731_163009_66f19f` passed the new contract:
  24 stdout bytes were rejected as untrusted and 23 verified state answer bytes
  were returned. The real historical 13,112-character contaminated record now
  displays a 1,839-character recovered answer with no `Planning` or `****`
  block while the original remains unchanged.
- Gajae update was stuck in a false no-op path because install/repair used a
  pinned target while the check advertised npm latest. The managed update
  contract now compares and acts on Atelier-supported `0.12.8`, updates through
  production ensure, and re-reads a separate status that returns
  `update_available: false` when current.
- The locally signed `0.2.19` candidate is installed at
  `/Applications/Atelier.app`; candidate/installed executable SHA-256 matches at
  `a72a251ff88977a22bb1e6720db64e47863bc7d9182dc8c06e3ebd5cdcbe2754`,
  codesign and renderer readiness pass.
- The locally signed `0.2.15` candidate was installed before later
  replacements; its candidate/installed executable SHA-256 matched at
  `d1c433a730536868433140949cf468420dea6ae48cf129edfa5099bd0f72b1a9`,
  codesign and renderer readiness passed, and the installed app exposed Gajae
  `Claude`, `Codex`, and `Alibaba Cloud` defaults.
- Hermes and Gajae settings now drive newly created sessions instead of acting
  as ornamental values. Installed-app proof changed Gajae to Codex, restarted
  Atelier, confirmed persistence, and opened a new Gajae task at
  `Codex` / `5.5`; the original Claude default was restored.
- Gajae Codex readiness and execution now follow the real GJC `0.12.8`
  contract: ChatGPT subscription access token only, passed once in the isolated
  child environment, with no API-key fallback, refresh-token copy, personal
  skill/config import, or `agent.db` export.
- Final 0.2.15 focused gates pass: Rust 239/0/4, provider preference/routing/
  settings/usage smokes, and the production frontend build.
- The locally signed `0.2.14` candidate was installed before the 0.2.15
  replacement; its candidate/installed executable SHA-256 matched at
  `4ee04fbed757f015c910171f4e7c0c3979ca009d396f90a6abfb890e2e1b1868`,
  codesign and renderer readiness pass, and installed UI runtime preparation is
  verified for both managed providers.
- Gajaecode now uses an Atelier-owned GJC runtime/config/session/skill namespace
  with version `0.12.8`, managed Bun `1.3.14`, and four verified defaults.
- Hermes's real missing-wheel-skills failure is repaired from an exact pinned
  Git archive: 453 durable files and 73 installed skills match, provider-local
  Python is enforced, and prior invalid trees are quarantined instead of
  deleted.
- Final 0.2.14 gates pass: Rust 230/0/3, Orca 23/10, strict Clippy,
  format/diff, frontend build, npm audit 0, and RustSec 0 vulnerabilities with
  retained upstream maintenance warnings.
- Managed preview Start now fails closed and the UI preserves inspection of a
  separately trusted localhost service.
- Provider-capability enforcement now includes Atelier-managed, macOS-only managed
  Hermes and Gajae execution paths.
- Managed runtime bootstrap and readiness support for Hermes and Gajae is
  implemented:
  - pinned installer policy and runtime identity metadata,
  - automatic bootstrap and verification states,
  - explicit progress surface in UI,
  - workspace sandbox launch on managed command execution.
- Visible and raw Full bypass paths are removed. Basic is the default and Auto
  retains sandboxing plus approval behavior.
- Frontend and Rust guard behavior uses a shared prompt corpus. This closes known
  drift cases without asserting that a phrase denylist is complete.
- Superseded checkpoint: Atelier `0.2.13` source gates passed 209 all-feature
  Rust tests with 1 ignored,
  23 Orca smokes across 10 removable features, strict all-target/all-feature
  Clippy, format/diff checks, `npm audit` 0, and RustSec 0 known vulnerabilities
  with 18 unmaintained and 2 unsound warnings retained.
- The locally signed `0.2.13` candidate previously passed installed-app proof;
  `/Applications/Atelier.app` advanced through 0.2.14 and is now 0.2.15. The
  prior `0.2.12` app remains
  recoverable at
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.12-before-0.2.13.app`.
- Independent QC found that the pre-existing worktree adoption test briefly
  wrote and removed its own test receipt under Atelier's real app-support
  directory, changing only the directory mtime. No receipt file remained.
  Tests now inject a temporary receipt directory, assert the resulting path,
  and preserve the real app-support directory mtime across the harness.
- Windows process-exit verification now rejects a failed `tasklist` command
  instead of treating empty output as successful cleanup.
- Fixture timeout and panic paths now issue cancellation cleanup for all turns.
