# Changelog

## 2026-08-25 — 0.2.30 stage-model v1.1: cross-provider stages, assignment survival, fresh OpenRouter catalog

Three defects reported from the CEO's first real use of 0.2.29:

- **Cross-provider stage assignment** ("공급사를 병합해서 사용을 못하는
  구조인데?"): each stage row now has a provider selector plus that provider's
  model selector. All five top-level providers (claude/codex/hermes/gajecode/
  grok) can be mixed per stage — the feature's original purpose (e.g. planning
  on Claude, execution on Grok/Codex). A provider override always requires an
  explicit model. The hermes/gajecode sub-backend is derived from the model
  value (`claude-*` → Anthropic, `vendor/model` → OpenRouter, default Codex) —
  a documented contract boundary, not a silent limitation. A stage provider
  whose runtime/authentication is not ready shows an inline warning in the row
  and stops fail-closed with the reason at run time.
- **Assignment "reset" defect** ("다른 모델 선택하면 초기화돼"): root cause was
  display collapse, not data loss — stage rows rendered options from the
  *session* provider catalog, so after a session provider/model switch an
  assigned model was no longer among the options and `ComposerSelectMenu` fell
  back to the first option ("세션 모델 상속"), making persisted assignments
  look wiped (worse, a run would still use the hidden assignment). Fixed by
  survival rules now written into the contract
  (`STAGE_ASSIGNMENT_SURVIVAL_RULES`): assignments are independent of session
  state, updates are row-scoped, clearing requires an explicit action (row
  "상속" or the new `stage-model-reset` button), and off-catalog assignments
  render as "현재 선택: …" instead of masquerading as inherit. Pinned by
  `smoke:stella-stage-models` source gates.
- **Stale OpenRouter catalog** ("모델이 최신화가 안 되고 있음"): the live
  fetch + 5-minute refresh + cache pipeline was already in place, but
  `parse_openrouter_model_options` dropped every model whose `expiration_date`
  merely *existed*. OpenRouter attaches far-future dates (e.g. 2098-12-31) to
  brand-new models, so the newest releases (z-ai/glm-5.3, glm-5-turbo,
  moonshotai/kimi-k2.5, stealth/ox-alpha, …) were hidden — measured on the
  real cache: 9 of 417 models filtered, all of them recent. Models are now
  hidden only when the expiration date has actually passed (RFC3339 or
  YYYY-MM-DD; unparseable dates keep the model listed). Rust tests cover
  future/past/null/unparseable cases plus an `--ignored` live-cache
  measurement (417/417 visible after the fix).
- Proof (installed app `0.2.30`, executable SHA-256
  `88e459338da776c1cb7b6c6a5a3db51dc177191a4c1e9814365dfe72b55266ca`,
  candidate/installed match, codesign verified; 0.2.29 backup preserved):
  cross-provider staged dispatch `fed49a83-2698-45f5-9a52-1743918f8c2d`
  completed `succeeded` — planning `codex`/`gpt-5.5`/`low` (45s), the other
  four stages `claude`/`claude-haiku-4-5-20251001` (14/27/17/114s), provider,
  model, and effort stamped in every stage receipt. Fail-closed proofs:
  unknown stage provider `openai` rejected at dispatch
  (`4a4119d9-7524-4dec-934e-c184441fe5f9`); `grok` provider override without a
  model stopped at stage 1/5 with the reason
  (`8d20b8d0-9cb5-4b02-997b-47a36027ce0b`). No new atelier entries in
  `~/Library/Logs/DiagnosticReports`.

## 2026-08-25 — 0.2.29 Stella Mode per-stage model assignment (static mapping v1)

- Stella Mode runs can now assign a different provider/model/effort per stage
  (`planning`, `execution`, `verification`, `security`, `audit`). New pure
  contract module `src/lib/stellaStageModels.ts` owns the stage canon,
  untrusted-input parsing, inheritance resolution, pre-spawn catalog
  validation, stage prompt/handoff/receipt assembly, and persistence guards.
- Invariants: unassigned stages inherit the session model, and a run with zero
  overrides never enters the staged path — the existing single-session Stella
  execution is untouched (gated by `hasStageOverrides`, pinned by the new
  `smoke:stella-stage-models` source assertions). Fail-closed everywhere: an
  unknown model, an unsupported provider override, a bad effort, or a spawn
  failure stops the run at that stage with the stage name and reason in the UI
  message, `SOT/evidence-log.md`, and the receipt — no silent substitution.
- Staged orchestration reuses the existing `agent_send` → per-provider spawn
  path (`--model`) turn by turn; no new spawn route. Stage context crosses
  stages only through explicit `STAGE HANDOFF` summaries (`resumeSessionId` is
  forced null; provider session state is not persisted from stage turns). A
  successful stage enqueues the next stage at the front of the session queue; a
  staged run skips the managed autopilot pre-cycle since the stage pipeline is
  the orchestration.
- Global defaults persist in localStorage `atelier.stella.stageModels.v1` and
  are snapshotted into the run at start, so mid-run edits never affect an
  in-flight run. The stage-model override applies to its turn only and never
  overwrites the session's selected model.
- UI: `단계 모델` toggle next to the Stella launcher opens a five-row stage ×
  model panel (default "세션 모델 상속", reusing the live model catalog and
  `ComposerSelectMenu`; testids `stage-model-toggle`, `stage-model-panel`,
  `stage-model-row-*`, `stage-model-menu-*`). During a staged run the launcher
  row shows the current stage and model (`stage-model-status`).
- CLI: `atelier task dispatch ... --stella --stage-models '<json>'` with
  fail-closed Rust-side JSON/stage/field validation (requires `--stella`), a
  second contract-module validation at normalize time, and per-stage
  `stageReceipts` (provider/model/effort/status/duration) in the terminal
  receipt. Documented in `docs/atelier-cli.md`.
- v1 boundaries: cross-provider stage overrides are limited to
  `claude`/`codex`/`grok` and require an explicit model; `hermes`/`gajecode`
  cross-overrides are rejected with a reason (their sub-provider selection is
  not expressible in the stage contract). The UI panel exposes model overrides
  for the current session provider; provider/effort overrides ride the CLI.
- Tests: `smoke:stella-stage-models` (inheritance identity, fail-closed
  validation, parsing, stage transitions, handoff assembly, serialization
  round-trip, wiring source gates), Rust
  `stage_models_json_is_validated_fail_closed`,
  `stage_models_option_requires_stella_mode`, and
  `stage_distinct_models_reach_model_arg_unmerged`.
- Fixed during installed-app verification: the first staged real dispatch
  (receipt `5932cbee-033f-4e70-a105-829e1234b793`) wrongly rejected the
  canonical ID `claude-sonnet-4-6` because the pre-spawn catalog only consulted
  the runtime model list (docs-derived dated IDs). The stage catalog is now the
  union of the runtime list and the static canonical catalog, and an
  off-catalog alias is executed only when its canonical normalization
  (`normalizeModel`/`normalizeHermesModel`) lands in the catalog; anything else
  still stops fail-closed at the stage.
- Fixed during installed-app verification (second staged dispatch,
  `4a678551-0f77-4547-a12a-48007dbf80c6`): stages 1–4 completed on distinct
  models (planning `claude-sonnet-4-6`, execution/verification/security
  `claude-haiku-4-5-20251001`), but the security stage's handoff quoted the
  phrase "자격증명 노출: 검출 안됨" and the backend safety gate's full-prompt
  scan blocked the audit-stage spawn as credential exposure. Handoffs are prior
  stage output (data), not new instructions, so a handoff summary that trips
  `containsProtectedActionIntent` is now omitted from the next-stage prompt and
  replaced with an evidence-log pointer — the same quoted-literal false-block
  rule the DevScreen element selection already follows. Receipts and
  `SOT/evidence-log.md` keep the full text.
- Proof (installed app `0.2.29`, executable SHA-256
  `38f3698ba1b1f960d050f13fe42cc076efdd5589a0e941b2ac14cc927c812b93`,
  candidate/installed hashes match, codesign verified): headless staged
  dispatch `60dde806-2573-4f14-8f6f-d755edeaec61` on a scratch workspace
  completed `succeeded` with all five stage receipts `done` — planning
  `claude-sonnet-4-6` (65s), execution/verification/security/audit
  `claude-haiku-4-5-20251001` (29s/35s/16s/35s) — two distinct models in one
  Stella run with the model name stamped in every stage receipt. Fail-closed
  proof `1978cbcf-f66b-4884-b9df-6daf1bd8f9ac`: `claude-nonexistent-9` stopped
  the run at stage 1/5 with the model name and reason, no substitution. No new
  atelier entries in `~/Library/Logs/DiagnosticReports`.

## 2026-08-24 — 0.2.28 upstream-latest display, Gajaecode 0.15.0, Bun 1.4.0

- Managed-agent `업데이트 확인` now also reports what upstream currently
  publishes, next to the Atelier support pin: Gajaecode via the managed Bun
  (`bun pm view gajae-code version`, falling back to `npm view`), Hermes via
  `git ls-remote --tags` (highest `v*` tag, date-like tags compared
  numerically), and Grok via `https://x.ai/cli/stable`. Lookups are bounded to
  5 seconds, fail soft (`upstream_error` with a short reason), and are cached
  per provider in `providers/<id>/upstream-check.json` for six hours; the
  manual check button bypasses the cache.
- Contract kept: `update_available`, readiness, and the install target remain
  bound to the exact Atelier pin. The provider-runtime-identity smoke now
  asserts that no `update_available` function body consults the upstream
  reference, replacing the former "no latest-version lookup exists" assertion.
  New pure module `src/lib/agentUpstreamContract.ts` derives the card line
  (`업스트림 최신 X 출시 · Atelier 검증 대기` / `업스트림과 동일` /
  `업스트림 확인 불가: 사유`).
- Raised the Gajaecode support pin from `0.14.0` to `0.15.0`. Because 0.15.0
  hard-fails below Bun 1.4.0 (`engines.bun >=1.4.0`, enforced in its cli.ts),
  the managed Bun moved from `1.3.14` to `1.4.0` with SHA-256 values from the
  official `bun-v1.4.0` SHASUMS256.txt. Upstream retired the bundled `team`
  skill and ships `autoresearch`; the managed default-skill set follows and the
  skill bootstrap version is now `atelier-default-skills-integrity-v3`.
- Dropped `--no-extensions` from the isolated `gjc --print` launch: gjc only
  honors it under ACP and 0.15.0 rejects it for a local launch
  (`Unknown option: --no-extensions`, observed in the first installed-app
  turn). Extension/skill isolation continues to come from the Atelier-owned
  HOME/GJC_HOME and provider workspace.
- Hermes pin promotion to `v2026.8.19` (`fcbd107`, 0.20.5) was evaluated and
  held. The `[anthropic]` extra, `HERMES_YOLO_MODE`, the `chat -Q` flags, and
  the `state.db` schema all survive upstream, but upstream's `setup.py` has
  blocked wheel builds since 2026-07-22 (#68217, present in every release from
  `v2026.7.30`), so `uv tool install` — Atelier's entire managed Hermes install
  path — fails with "Building wheels or sdists for hermes-agent is not
  supported". The pin stays at `3ef6bbd` (`v2026.7.20`); see issues.
- Proof: isolated real-package Gajaecode update on a copy of the managed root
  reached `runtime_pin=0.15.0`, `dependency_pin=1.4.0`, four verified skills.
  The production managed root was then updated through the installed app's own
  readiness path (`readiness.json` runtimePin `0.15.0`, dependencyPin `1.4.0`,
  `gjc --version` `0.15.0`). Real upstream lookups resolved `0.15.0`,
  `v2026.8.19`, and `1.0.5` through the new module and replayed from cache.
- Built, locally signed, installed, and renderer-proved Atelier `0.2.28`.
  Candidate and installed executable SHA-256 values match at
  `b8cdfa26598f61bf77fdc564505434d9b65e0a5d59ea73526c00b5ae18b21057`.
  The previous app is preserved at
  `/Users/kansic/Library/Application Support/Atelier/Backups.noindex/Atelier-0.2.27-before-0.2.28-upstream-display-20260824-034025.app`.
- Not claimed: the Connections-tab rendering of the new upstream line was not
  exercised visually, and the post-fix installed-app Gajaecode 0.15.0 turn is
  queued (`35b5a25d-3b66-48c9-93a8-175403b025cf`) but unclaimed because the
  macOS session was screen-locked during verification and WebKit suspends the
  renderer; the receipt must be read after unlock.

## 2026-08-18 — 0.2.27 Grok models in Hermes and Gajaecode

- Added `Grok (xAI)` to the Hermes and Gajaecode model-provider selectors.
- Added xAI API model choices `grok-4.5`, `grok-4.5-latest`, and
  `grok-build-latest`; xAI's official OpenAI-compatible endpoint is
  `https://api.x.ai/v1` and requires `XAI_API_KEY`.
- Kept authentication boundaries explicit: the connected Grok CLI browser
  session is not copied into Hermes or Gajaecode. Both adapters require the
  xAI API key stored in Atelier's secure Grok provider card.
- Hermes routes the selected backend to its built-in `xai` provider and injects
  only `XAI_API_KEY` into the child. Gajaecode routes exact `xai/<model>`
  selectors and injects the same child-only key.
- Grok API reasoning is limited to the documented `low`, `medium`, and `high`
  levels; unsupported Atelier values clamp to `high` before execution.
- Provider preference, credential readiness, selector prefixes, model defaults,
  xAI routing, missing-key failure, compact Connections, build, and focused Rust
  tests passed.
- Built, locally signed, installed, and renderer-proved Atelier `0.2.27`.
  Candidate and installed executable SHA-256 values match at
  `c08d3749d8a70ede6709ab1d3585b91ee8b9a97835c9a429d8240c77076d9a22`.
  The previous app is preserved at
  `/Users/kansic/Library/Application Support/Atelier/Backups.noindex/Atelier-0.2.26-before-0.2.27-hermes-gajae-grok-20260818-022501.app`.
- The tailnet-only `/atelier` route restored against local port `49420`.

## 2026-08-18 — 0.2.26 authenticated Grok model contract

- Completed the real Grok device login from Atelier and retained the credential
  only in the Atelier-owned Grok HOME.
- Replaced the unverified `grok-build` model assumption after the authenticated
  CLI reported the actual account catalog: default `grok-4.6`, optional
  `grok-4.5`.
- Normalized Atelier workload values to the model's real effort contract:
  `low`, `medium`, `high`, `xhigh`; `none/minimal -> low` and
  `max/ultra -> xhigh`.
- A real read-only, one-turn authenticated call returned exactly
  `GROK_ATELIER_OK`, `stopReason=end_turn`, and a provider session ID.
- Built, locally signed, installed, and renderer-proved Atelier `0.2.26`.
  Candidate and installed executable SHA-256 values match at
  `18674fb1c840bf671da5efd9e34b8f9cecadf50bbc3200aa4bdb65767b98e7a9`.
  The previous app is preserved at
  `/Users/kansic/Library/Application Support/Atelier/Backups.noindex/Atelier-0.2.25-before-0.2.26-grok-live-model-20260818-021241.app`.
- The tailnet-only `/atelier` route restored against local port `64724`.
  Public updater signing remains blocked by the unavailable Tauri private key.

## 2026-08-18 — 0.2.25 managed Grok Build agent

- Added xAI's official Grok Build CLI as Atelier's fifth structured agent,
  including fixed profile, Connections provider card, browser login, xAI API
  key support, update status, terminal profile, automations, remote follow-up,
  mobile continuity, and provider-common answer rendering.
- Installed Grok `1.0.4` into an Atelier-owned HOME instead of importing a
  user's global `~/.grok`. The macOS arm64 binary is pinned by SHA-256
  `39366f7756a090b735cc1df8c93a8c0c3c7871555cf6cbb28f9351ca82936485`
  and verified with xAI Developer ID team `5Y6N3AJ54S` before publication.
- Added Grok JSON headless execution with session resume, `grok-build` and
  `grok-4.5` model choices, official reasoning-effort mapping, Basic read-only
  tools, Auto workspace sandboxing, provider-local auth, cancellation, and
  terminal-result-only rendering.
- Browser OAuth accepts only approved HTTPS roots under `x.ai` and `grok.com`.
  The current installed runtime is intentionally not marked connected until
  the user completes Grok browser login or stores an `xai-...` API key.
- Focused provider/runtime, permissions, OAuth, rendering, mobile, remote
  follow-up, automation, registry, JSON-result, auth-detection, and real managed
  install proofs passed.
- Built, locally signed, installed, and renderer-proved Atelier `0.2.25`.
  Candidate and installed executable SHA-256 values match at
  `aad217646b9eab11afdbacff0ed105ae1e7d841d570ea132bfdf56615a3c89e7`.
  The previous app is preserved at
  `/Users/kansic/Library/Application Support/Atelier/Backups.noindex/Atelier-0.2.24-before-0.2.25-grok-build-20260818-020230.app`.
- The tailnet-only `/atelier` mobile route restored against local port `63753`.
  Public updater signing remains blocked by the unavailable Tauri private key.

## 2026-08-17 — 0.2.24 managed-agent card layout standard

- Introduced one shared `ManagedAgentUpdatePanel` contract for Hermes and
  Gajaecode instead of maintaining two independent update layouts.
- Standardized both cards to the same sequence: execution/install-repair,
  runtime readiness evidence, update status/actions, provider-specific content,
  and the default model-provider selector.
- Standardized update status tone, version row, optional message, active update
  button, persistent `업데이트 확인` button, disabled states, spacing, and
  right-aligned action placement. Gajaecode retains its agent-owned Skills
  section and three-provider grid; Hermes retains its four-provider grid.
- Added a regression contract that requires exactly two uses of the shared
  update panel and verifies its position between runtime evidence and the
  provider-specific controls in both cards.
- Built, locally signed, installed, and renderer-proved Atelier `0.2.24`.
  Candidate and installed executable SHA-256 values match at
  `9cd61a96f118a692660751c931c27f595074f8d6ac0678589e141c017e0db481`.
  The previous app is preserved at
  `/Users/kansic/Library/Application Support/Atelier/Backups.noindex/Atelier-0.2.23-before-0.2.24-agent-card-standard-20260817-185350.app`.
- The existing tailnet-only `/atelier` mobile route restored after installation
  on the new local listener port `60662`. Public updater signing remains
  blocked by the unavailable Tauri private key.

## 2026-08-17 — 0.2.23 managed GJC 0.14.0 update and visible update check

- Raised the Atelier-supported managed Gajaecode pin from `0.12.8` to
  `0.14.0` after an isolated real-package proof with the same HOME, GJC agent
  directory, Bun, and default-skill environment used by Atelier.
- Kept reproducible installs: update availability and installation still use
  one exact Atelier support pin rather than installing a mutable npm-latest at
  button-click time.
- Replaced the icon-only refresh affordance with a persistent, explicit
  `업데이트 확인` button for both Hermes and Gajaecode. Hermes now says
  `Atelier 지원 버전` instead of incorrectly implying an upstream-latest check.
- Ran the production managed-runtime update path against the installed GJC
  root. It updated `0.12.8` to `0.14.0`, retained Bun `1.3.14`, verified four
  adapter-owned default skills, and published a matching schema-2 readiness
  receipt.
- Built, locally signed, installed, and renderer-proved Atelier `0.2.23`.
  Candidate and installed executable SHA-256 values match at
  `6c5d40b9e89d4a51a451bd45ced2ab57dab8a5754a1bac3d2537679631b0396d`.
  The prior app is preserved at
  `/Users/kansic/Library/Application Support/Atelier/Backups.noindex/Atelier-0.2.22-before-0.2.23-gajecode-0.14.0-20260817-184045.app`.
- Public updater signing did not run because this Mac has no Tauri updater
  private key. Developer ID notarization, public publication, and physical
  Windows proof remain unclaimed.

## 2026-08-03 — 0.2.22 existing-work mobile continuity and renderer recovery

- Replaced the lifecycle-counter-only mobile monitor with a bounded projection
  of existing Atelier sessions and their user/final-assistant conversation.
- Added persisted opaque mobile task IDs, native redaction, stale/revision
  checks, idempotency, per-device throttling, and a direct `task:followup`
  capability that queues only into the exact selected desktop session.
- Kept the legacy approval-based proposal path separate and prohibited any
  missing-target fallback that would create a new session.
- Corrected the installed blank-window failure path: global asynchronous errors
  no longer create a second React root or replace a committed shell, renderer
  readiness is shell-backed and refreshed, and malformed legacy message data
  cannot escape the mobile projection callback.
- Preserved all 3 installed sessions and 224 stored messages. The live tailnet
  API returned 3 tasks and 180 bounded messages with no internal session IDs,
  absolute workspace paths, raw execution fields, or obvious credential
  patterns.
- Enabled mobile continuation for the existing `Mobile browser` device and left
  Tailscale tailnet-only access running at the configured `/atelier/` path. No
  Funnel/public endpoint was enabled.
- Built, locally signed, installed, visually captured, and renderer-proved
  `0.2.22`. Candidate/installed executable SHA-256 match at
  `64de149c1842e0091db02724ca0c1b4c58cfb65c4d122114b38285371a29dbb6`.
  The replaced app remains recoverable at
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.22-before-renderer-recovery-20260803-003602.app`.
- Final gates: production build and focused smokes pass; Rust all-feature
  `276 passed / 0 failed / 6 ignored`; strict Clippy, format, and diff checks
  pass. Public notarization and physical Windows proof remain unclaimed.
- Hardened mobile projection redaction for generic Unix paths, `file://` paths,
  Windows paths after assignment delimiters, and custom token/passphrase
  assignments while preserving normal HTTPS links.
- Persisted only an explicit Tailscale remote-start choice and restored it on
  app restart with bounded retries. Explicit Stop disables restore before Serve
  cleanup. A real restart while the Mac was locked restored health `ok`; Funnel
  remained disabled.

## 2026-08-02 — 0.2.20 composer explanation removal

- Removed the always-visible structured-composer sentence that repeated agent,
  internal model provider, Atelier-managed runtime, and adapter-skill identity.
  Gajae primary actions, Stella launch, model/provider/permission controls, and
  actionable runtime/authentication banners remain intact.
- Removed the now-dead description-only runtime identity derivation and copy
  fields, and added focused regression assertions that the generic launcher
  descriptions cannot return.
- Passed provider-runtime, Stella-row, permission-capability, and Connections
  smokes; production frontend build; Rust 254 passed, 0 failed, 6 ignored;
  strict format/Clippy/diff checks; release audit; 24-contract/10-feature Orca
  gate; npm audit and RustSec with 0 known vulnerabilities. Existing upstream
  Rust warnings remain 18 unmaintained and 3 unsound.
- Built, locally signed, installed, renderer-proved, and visually inspected
  `0.2.20`. Candidate and installed executable SHA-256 values match at
  `098ac2aaa404deab7d1432868450ca1859049bdd4c1892554594f99dfa3d773e`.
  The prior app was moved, not deleted, to
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.19-before-0.2.20-description-removal-20260802.app`.
- Nine Gajae DB/WAL/SHM paths remained present before and after installation;
  no database or user data was deleted. This remains local installed-candidate
  proof only, without public publication or notarization claims.

## 2026-08-02 — 0.2.19 managed GJC update contract fix

- Fixed a false-no-op path in managed Gajae update readiness: checks no longer
  depend on npm-latest alone, and the Atelier update contract now uses the same
  support pin (`0.12.8`) as the managed install action.
- Updated runtime UX/status to show Atelier-supported runtime versioning and
  explicit mismatch/error state instead of silent 5-minute polling loops.
- Resolved managed update-command behavior so AppHandle production `ensure`
  returns immediate readiness and explicit validation failure reasons before
  any downstream action.
- Verified source/build/update gates in `0.2.19`: Rust all-feature
  254/0/6, strict all-target/all-feature Clippy, production build, release audit,
  24-contract/10-feature Orca gate, provider/connection smokes, and
  `npm audit`/RustSec with 0 vulnerabilities
  (unmaintained 18, unsound 3 warnings retained).
- Built, locally signed, installed, and renderer-proved `0.2.19`.
  Candidate/installed executable SHA-256 values match at
  `a72a251ff88977a22bb1e6720db64e47863bc7d9182dc8c06e3ebd5cdcbe2754`.
  The prior `0.2.18` app was moved, not deleted, to
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.18-before-0.2.19-gajecode-update-20260802.app`.
- Verified the real managed update from `gjc/0.11.7` to `gjc/0.12.8`: Bun
  remained `1.3.14`, four defaults and the schema-2 receipt verified, and the
  separate post-update status returned `update_available: false`. Nine
  DB/WAL/SHM file counts and hashes were identical before and after.
- Boundary remains local installed-candidate proof only: no public publish,
  no notarization claim, no Windows physical proof, and no cross-company
  authenticated response claim.

## 2026-07-31 — 0.2.18 verified-answer and provider-neutral rendering contract

- Corrected the `0.2.17` assumption that `hermes chat -Q` stdout was a
  canonical answer-only channel. A later real long run persisted a
  13,112-character mixed transcript with 119 `****` progress boundaries while
  the managed Hermes state held the exact 1,791-character final assistant
  answer.
- Hermes stdout is now bounded diagnostic evidence only. After a normal
  successful exit, Atelier validates the stderr session ID and reads the exact
  new final assistant content from the managed `state.db`, with turn,
  resume/compression ancestry, active/compacted/tool-call, size, and stale-row
  checks that fail closed.
- Added one provider-neutral terminal/rendering contract for Claude, Hermes,
  Codex, and Gajaecode: a terminal result or error is authoritative, streamed
  drafts remain evidence only, and restored runs without a verified terminal
  answer are visibly marked unverified.
- Added display-only recovery for historical dense progress contamination. It
  preserves a valid final suffix, hides progress blocks, and keeps the complete
  stored original available without mutating LocalStorage or provider DBs.
- Passed the 4-provider rendering smoke, production frontend build, release
  audit, strict Clippy, and all-feature Rust suite at 253 passed, 0 failed, and
  5 ignored. A separately invoked real managed Hermes proof passed as session
  `20260731_163009_66f19f`, selecting 23 answer bytes from state while rejecting
  24 stdout bytes as untrusted.
- Built, locally signed, installed, and renderer-proved `0.2.18`.
  Candidate/installed executable SHA-256 values match at
  `591f88709e6d3e8183bd98610e2e37aeb7ca1d2dd101e451760f07a8090dc57c`.
  The prior `0.2.17` app was moved without deletion to
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.17-before-0.2.18-render-contract-20260731.app`.
- Boundary: this is a locally signed installed candidate on the current Mac.
  Developer ID notarization, public distribution, physical Windows, and a
  second clean company Mac are not claimed.

## 2026-07-29 — 0.2.16 persistent Stella status row removal

- Removed the always-visible `스텔라 모드 상태 없음` row and its misleading
  eye-shaped refresh control from the structured task composer.
- Removed the corresponding background status polling and dead responsive CSS.
  Stella launch actions, bootstrap/autopilot commands, and safety guards remain
  unchanged.
- Added a focused source regression smoke, passed the production frontend build,
  related UI/safety smokes, and 239 Rust tests with 4 ignored.
- Built, locally signed, installed, and visually verified `0.2.16`. Candidate
  and installed executable SHA-256 match at
  `fcf5b07fb7625ebb82db19378643ce7542359bf12b33e8f0a6c9184c96d8da22`.

## 2026-07-26 — 0.2.15 provider-default parity and installed proof

- Added Hermes/Gajae “새 작업 기본 모델 공급자” persistence for new sessions
  while keeping existing sessions unchanged unless explicitly edited.
- Added the Gajae Connections provider block for `Claude`, `Codex`, and
  `Alibaba Cloud`, and wired the saved default into new-session bootstrap.
- Bridged Gajae Codex through the isolated child env with access-token-only
  handling, then aligned the Connections readiness badge so Codex shows ready
  only when the upstream ChatGPT subscription login exists.
- Passed provider preference/routing/settings/usage smokes, the production
  frontend build, and 239 Rust tests with 4 ignored.
- Built, signed, installed, and proved the local `0.2.15` candidate. Candidate
  and installed executable SHA-256 match at
  `d1c433a730536868433140949cf468420dea6ae48cf129edfa5099bd0f72b1a9`, and
  renderer-ready proof was written to
  `artifacts/macos-installed-candidate-proof.json`.
- Click-driven installed-app proof changed Gajae from Claude to Codex,
  restarted Atelier, confirmed the selection persisted, and opened a new Gajae
  task showing `Codex` / `5.5`. The original Claude default was restored after
  verification.

## 2026-07-26 — 0.2.14 Atelier-only managed runtime installation

- Fixed the real Hermes first-use failure where the uv-built wheel omitted
  bundled skills. Atelier now materializes 453 pinned source files from the
  exact Git commit and verifies 73 installed skills.
- Kept Gajaecode independent under its Atelier-owned GJC HOME/config/session
  and skill namespace; prepared four integrity-checked defaults without reading
  Mac-global Codex/Claude/Hermes skills.
- Hardened Basic/Auto macOS sandbox profiles, provider-local Python/runtime
  paths, checksummed uv/Bun downloads, receipts, quarantine recovery, and
  first-send automatic preparation.
- Passed 230 Rust tests with 3 ignored, strict Clippy, production frontend
  build, format/diff hygiene, provider identity/permission/routing smokes,
  npm/RustSec audits, and the 23-contract/10-feature Orca gate.
- Built and installed the locally signed 0.2.14 candidate. Candidate and
  installed executable SHA-256 match at
  `4ee04fbed757f015c910171f4e7c0c3979ca009d396f90a6abfb890e2e1b1868`;
  renderer readiness and installed UI preparation for both providers pass.
- Boundary: no paid provider response, credential bundling, public publish,
  Developer ID notarization, or physical Windows claim was made.

## 2026-07-25 — Reproducible managed Hermes/Gajaecode runtime (F-Phase 2, 0.2.14 source candidate)

- Reintroduced managed execution for Hermes and Gajae through Atelier-owned
  macOS runtime provisioning instead of capability-flag-only disabled states.
- Added managed runtime auto-bootstrap and repair flow with source-verified progress:
  `checking`, `installing`, `bootstrapping_skills`, `verifying`, `ready`,
  `failed`.
- Added pinned runtime policy constants and receipts so Hermes and Gajae bootstrap
  from fixed install specs and fixed skill bundles.
- Routed Hermes/Gajae managed turns to readiness-gated command execution with
  sandboxed workspace isolation and explicit runtime identity metadata.
- Updated frontend/runtime capability UX to reflect managed runtime availability,
  bootstrap state, and explicit disable/reason behavior when unavailable.
- Added API/API-like exposure for `providerPrepareManagedRuntime` and
  `ManagedAgentRuntimeReadiness` to keep command, event, and UI layers aligned.
- Added and updated smokes to validate capability metadata, managed progress
  transitions, and runtime identity fields.
- Historical phase boundary: this section records the source-only F-Phase 2
  state; the 2026-07-26 entry records the later installed-app proof.

## 2026-07-25 — 0.2.13 Supervised Local Candidate

- Closed mixed-negation and direct-CLI guard gaps and applied a shared
  Korean/English prompt corpus across frontend and Rust regression behavior.
- Removed visible and raw Full bypass paths. Basic is the default; Auto retains
  sandboxing and approval checks.
- Made managed preview start truthfully fail-closed while retaining inspection
  of a separately trusted localhost service.
- Resolved the PostCSS advisory and passed 209 all-feature Rust tests with 1
  ignored, 23 Orca contract smokes across 10 removable features, strict
  all-target/all-feature Clippy, format/diff checks, `npm audit` with 0
  vulnerabilities, and RustSec with 0 known vulnerabilities plus 18
  unmaintained and 2 unsound warnings.
- The receipt includes provider-capability hardening: Claude/Codex managed
  Basic/Auto only; Hermes/Gajaecode managed capability false with UI reason and
  lifecycle/spawn-before fail-closed; direct CLI separate and limited.
- Built `Atelier_0.2.13_aarch64.dmg`, installed the locally signed candidate at
  `/Applications/Atelier.app`, matched candidate/installed executable SHA-256 at
  `3cce1530628decc24ac0d1955082f93ebf9bcebf327926fdc5f085850c3c9acf`,
  and passed codesign plus renderer-ready checks.
- Preserved the prior `0.2.12` app at
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.12-before-0.2.13.app`;
  it was moved, not deleted, and no longer depends on temporary-directory
  retention.
- Recorded the remaining P1 boundary: an app-owned action/tool proxy with scoped
  approval receipts. Phrase matching alone is not a complete guarantee.
- Verdict: `supervised local candidate, public release blocked`. No public
  publish, public signing, notarization, or deployment was performed.

## 2026-07-22 — 0.2.12 Release Candidate

- Pinned all managed CLI installers and removed remote shell execution.
- Added bounded installer output capture, timeout cleanup, credential
  redaction, background execution, and post-install CLI verification.
- Fixed preview evidence route fidelity, Hermes workload runtime reflection,
  keyboard navigation for composer menus, and compact-window send controls.
- Passed the complete Orca feature gate, 188 Rust tests, strict Clippy,
  production build, updater contract, npm audit, and release security audit.
- Built and installed the exact locally signed macOS package. Public release is
  held until Developer ID notarization and signed physical-Windows evidence are
  available.

## 2026-07-30 — 0.2.17 initial Hermes rendering mitigation (superseded)

- Mitigated the original TUI parsing, eager skill preload, newline, and SQLite
  sandbox failures by switching Atelier-managed Hermes turns to `hermes chat
  -Q` and treating `session_id:` as stderr-only metadata. Later long-run
  evidence showed that quiet stdout can still mix reasoning/progress records
  with the final answer, so this was not a canonical final-answer boundary.
- Removed Atelier's eager `--skills <name>` preload loop for the 73 managed
  Hermes skills. The managed skill manifest remains a hard readiness boundary,
  but the skills now stay installed under the Atelier-owned Hermes home and are
  discovered on demand instead of being injected wholesale into every initial
  prompt.
- Added explicit Hermes runtime error normalization for the two real failure
  classes observed in production evidence: context-window overflow and
  `unable to open database file`.
- Added macOS sandbox ancestor literal metadata/test-existence rules so the
  managed Hermes `state.db` can open with SQLite WAL semantics without granting
  subtree reads to sibling personal paths.
- Preserved newline boundaries in streaming assistant text and forced live
  streaming assistant turns to stay on the plain pre-wrap renderer path so
  incremental chunks cannot collapse into dense unreadable blocks.
- Added a non-destructive compatibility renderer for already persisted Hermes
  TUI contamination: exact legacy failure signatures render a concise recovery
  notice while the stored original remains untouched.
- Verified source/build/install boundaries for `0.2.17`: targeted Rust tests,
  `cargo check`, `npm run build`, `npm run smoke:agent-stream-rendering`,
  local signed macOS bundle build, and installed-candidate proof all passed.
- Installed `/Applications/Atelier.app` was updated to `0.2.17`, matched the
  candidate executable SHA-256
  `b862a24e57be0fe6df233ac8c1177420381eba9215e2c07253208e6719b24db1`, and
  passed the renderer-ready installed proof.
- Added and explicitly ran an ignored real-provider contract test through the
  same temporary Codex staging, managed HOME, sandbox, on-demand skill, and
  quiet-query path as Atelier. Session `20260730_004403_923602` returned only
  the requested 24-byte answer on stdout, used 14,388 first-call input tokens,
  and persisted to a SQLite store whose `quick_check` is `ok`.
- That short marker request happened to return answer-only stdout; it did not
  establish an answer-only stdout contract for long or tool-heavy Hermes runs.
- Boundary: this historical slice was superseded by the verified-answer
  contract in `0.2.18`.

## 2026-07-21 — Offline Parallel Agent Verification

- Added a test-only Gajae launch seam and cross-platform self-hosted fixture.
- Added real three-turn adapter, event isolation, selective cancellation,
  exactly-once lifecycle, workspace prompt, process-tree, and cleanup proof.
- Added `npm run harness:parallel-agent` and enforced it in the shared Orca
  feature release gate and release-security audit.
- Isolated worktree adoption receipts inside test temporary storage and added
  regression assertions that prevent user app-data paths from being reused.
- Did not package, install, deploy, connect a provider, or modify the temporary
  GPU server.
