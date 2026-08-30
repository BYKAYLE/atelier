# Evidence Log

## 2026-08-18 Hermes/Gajaecode Grok model provider and installed 0.2.27 proof

- Official xAI API contract verified from current docs: model `grok-4.5`,
  aliases `grok-4.5-latest` and `grok-build-latest`, OpenAI-compatible base
  `https://api.x.ai/v1`, bearer `XAI_API_KEY`, 500K context, and reasoning
  levels `low|medium|high`.
- Installed Hermes source already contains first-class `xai` provider routing,
  `XAI_API_KEY`, and `https://api.x.ai/v1` support. Installed Gajaecode source
  contains first-class `xai` provider/model and effort support.
- The installed Connections UI visibly shows `Grok (xAI)` in both Hermes and
  Gajaecode cards. The gray credential indicators are truthful because the
  current Grok browser subscription is not an xAI API key.
- Installed proof:
  - version `0.2.27`;
  - candidate/installed executable SHA-256
    `c08d3749d8a70ede6709ab1d3585b91ee8b9a97835c9a429d8240c77076d9a22`;
  - local codesign, renderer-ready receipt, candidate/install hash equality,
    Spotlight singleton, and restored mobile route pass.

## 2026-08-18 authenticated Grok call and installed 0.2.26 proof

- The Atelier-launched official device authorization completed and the
  provider-local auth detector moved from pending to connected without copying
  any global Grok credential.
- Authenticated `grok models` returned default `grok-4.6` and available
  `grok-4.5`; source defaults and effort normalization were corrected to this
  live contract.
- A bounded proof call used `grok-4.6`, `low`, `--sandbox read-only`, only the
  `read_file` tool, one maximum turn, and no subagents. It returned
  `GROK_ATELIER_OK`, `end_turn`, and a session ID. Receipt:
  `artifacts/grok-authenticated-proof.json`.
- Installed proof:
  - Atelier version `0.2.26`;
  - candidate/installed executable SHA-256
    `18674fb1c840bf671da5efd9e34b8f9cecadf50bbc3200aa4bdb65767b98e7a9`;
  - local codesign, renderer-ready receipt, and executable hash equality pass;
  - Spotlight returns only `/Applications/Atelier.app`;
  - mobile Tailscale route restored to `127.0.0.1:64724`.

## 2026-08-18 Grok Build integration and installed 0.2.25 proof

- Official source contract: `https://x.ai/cli` and
  `xai-org/grok-build`; pinned stable version `1.0.4`.
- Real managed-runtime proof:
  - executable:
    `/Users/kansic/Library/Application Support/com.atelier.app/providers/grok/bin/grok`;
  - `grok 1.0.4 (d846eb93d94d)`;
  - SHA-256
    `39366f7756a090b735cc1df8c93a8c0c3c7871555cf6cbb28f9351ca82936485`;
  - strict code signature valid, Developer ID Application X.AI Corporation,
    team `5Y6N3AJ54S`;
  - schema-2 readiness receipt records provider `grok`, runtime pin `1.0.4`,
    zero adapter-injected skills, and the isolated executable path.
- Auth boundary: no global Grok CLI or global Grok auth was imported. Browser
  OAuth and `XAI_API_KEY` are supported, but the installed runtime currently
  remains `not_connected` pending user authentication.
- Source verification passed for production frontend build and focused
  provider identity, compact Connections, permission, OAuth URL, answer
  rendering, mobile continuity, remote follow-up, automation, registry,
  Grok JSON/result, effort, and auth detection tests.
- Installed proof:
  - Atelier version `0.2.25`;
  - candidate/installed executable SHA-256
    `aad217646b9eab11afdbacff0ed105ae1e7d841d570ea132bfdf56615a3c89e7`;
  - local codesign, renderer-ready receipt, and executable hash equality pass;
  - the installed Profiles screen visibly includes `Grok Build` / `grok`;
  - Spotlight returns only `/Applications/Atelier.app`.
- No database, existing task/session, credential, or user-authored skill data
  was deleted.

## 2026-08-17 Hermes/Gajaecode card standard and installed 0.2.24 proof

- `ConnectionsPanel` now mounts the same shared managed-agent update component
  once for Hermes and once for Gajaecode. The component owns common status,
  version, message, update, and update-check layout and interaction slots.
- Provider-runtime identity and compact Connections layout smokes passed. The
  identity smoke also verifies the shared-component use count and ordering
  after runtime evidence and before provider-specific controls.
- Production frontend build and focused Hermes/Gajaecode Rust pin tests passed.
- Installed proof:
  - version `0.2.24`;
  - candidate and installed executable SHA-256
    `9cd61a96f118a692660751c931c27f595074f8d6ac0678589e141c017e0db481`;
  - local codesign, renderer-ready receipt, and candidate/install hash equality
    passed;
  - Spotlight returns only `/Applications/Atelier.app`; the source bundle is
    preserved as a non-app `.build-artifact`.
- Installation temporarily restarted Atelier's mobile server. Tailscale Serve
  restored the same tailnet-only HTTPS `:8443/atelier` route against the new
  local listener `127.0.0.1:60662`.
- No database, task/session, credential, provider state, or user-authored skill
  data was deleted.

## 2026-08-17 Gajaecode 0.14.0 update and installed 0.2.23 proof

- The npm package `gajae-code@0.14.0` passed an isolated compatibility proof
  under Atelier's actual managed HOME, `GJC_CODING_AGENT_DIR`, Bun `1.3.14`,
  and `setup defaults --check` contract.
- Focused verification passed: provider-runtime identity smoke, production
  frontend build, update-status comparison, Gajaecode exact-pin/readiness,
  Hermes pinned-spec, and Hermes readiness/integrity tests.
- The real managed Gajaecode update path reported ordered
  `checking -> installing -> bootstrapping_skills -> verifying -> ready`, then
  independently returned GJC `0.14.0`, Bun `1.3.14`, four default skills, and
  `update_available=false` from the schema-2 receipt.
- Installed proof:
  - source/candidate/installed version: `0.2.23`;
  - candidate and installed executable SHA-256:
    `6c5d40b9e89d4a51a451bd45ced2ab57dab8a5754a1bac3d2537679631b0396d`;
  - local codesign, candidate/install hash equality, and installed
    renderer-ready receipt passed;
  - the installed Connections screen visibly shows current/support GJC
    `0.14.0` and an explicit `업데이트 확인` button.
- The previous `0.2.22` app was moved to a `.noindex` recovery archive. No
  provider database, user session, credential, or user-authored skill data was
  deleted.
- The release bundle and DMG were produced, but the release command stopped at
  public updater signing because `TAURI_SIGNING_PRIVATE_KEY` is unavailable.

## 2026-08-02 Composer explanation removal and local 0.2.20 proof

- `AgentWorkspace` no longer mounts the generic runtime-identity explanation
  under the structured composer. Focused source assertions also reject the
  removed identity summary, progress-label helper, and generic launcher copy.
- Preserved surfaces were verified: model/provider/permission controls, Gajae
  primary actions, Stella launch action, runtime failure/observation/unavailable
  banners, and Connections provider/skill identity contracts.
- Verification passed:
  - provider-runtime, Stella-row, permission-capability, and Connections smokes;
  - production frontend build and 24-contract/10-feature Orca gate;
  - Rust all-target/all-feature suite: 254 passed, 0 failed, 6 ignored;
  - strict format, Clippy, diff, release-security, npm-audit, and RustSec gates.
- Installed proof:
  - source/candidate/installed version: `0.2.20`;
  - candidate and installed executable SHA-256:
    `098ac2aaa404deab7d1432868450ca1859049bdd4c1892554594f99dfa3d773e`;
  - codesign and renderer-ready receipt passed at
    `artifacts/macos-installed-candidate-proof.json`;
  - installed Hermes composer screenshot:
    `artifacts/atelier-0.2.20-agent-workspace-description-removed.png`;
  - prior `0.2.19` app preserved at
    `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.19-before-0.2.20-description-removal-20260802.app`.
- Gajae DB/WAL/SHM path count stayed 9 before and after installation. No
  database/user-data deletion, public publication, or notarization occurred.

## 2026-08-02 Reproducible managed Gajae update and local 0.2.19 proof

- Verified the installed managed-update contract no longer stalls on a
  `npm latest`-driven early-return path; check/action now follows the same
  Atelier-supported pin `0.12.8`.
- Updated-source and installed-app verification for this release used
  `cargo test --all-targets --all-features` and reported
  254 passed, 0 failed, 6 ignored; strict Clippy, production build, release
  audit, the 24-contract/10-feature Orca gate, provider/connection smokes, and
  no known npm/RustSec vulnerabilities.
- Built and signed local `0.2.19` artifacts, including DMG, with installed-app
  executable match:
  - candidate/install version: `0.2.19`
  - executable SHA-256:
    `a72a251ff88977a22bb1e6720db64e47863bc7d9182dc8c06e3ebd5cdcbe2754`
  - prior app preserved at
    `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.18-before-0.2.19-gajecode-update-20260802.app`
  - codesign and installed renderer-ready checks passed.
- Real managed GJC proof against the installed runtime root shows:
  - the production ensure path updated `gjc/0.11.7` to `gjc/0.12.8`, with Bun
    `1.3.14` and 4 verified default skills;
  - the schema-2 receipt records the exact pins, executable, and skill count,
    while a separate post-update status reports `update_available: false`;
  - runtime DB/WAL/SHM paths were unchanged before/after update (9 files hashed
    identically), confirming no DB/data deletion in this flow.
- Session-level evidence remained local-only, and all claims are bounded to local
  installed-candidate truth; physical Windows, public distribution, and public
  signing/notarization were not claimed.

## 2026-07-29 Stella status-row removal and installed 0.2.16 proof

- The persistent status card, status refresh control, and background
  `stellaFactoryStatus` query were removed from `AgentWorkspace`; Stella
  launcher/bootstrap/autopilot and safety behavior remain present.
- Verification:
  - `smoke:stella-status-row`, `smoke:stella-safety`,
    `smoke:settings-navigation`, and `smoke:connections-layout` passed;
  - production frontend build passed;
  - Rust library tests: 239 passed, 0 failed, 4 ignored.
- Installed proof:
  - candidate and installed version: `0.2.16`;
  - candidate and installed executable SHA-256:
    `fcf5b07fb7625ebb82db19378643ce7542359bf12b33e8f0a6c9184c96d8da22`;
  - local codesign and installed renderer-ready checks passed;
  - receipt: `artifacts/macos-installed-candidate-proof.json`;
  - DMG: `src-tauri/target/release/bundle/dmg/Atelier_0.2.16_aarch64.dmg`,
    SHA-256
    `9212a2778a4329cc53a1bae113f2dc7de6d42a0304f503ce2bbb1c13df500592`;
  - installed UI screenshot:
    `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.16-stella-status-row-removed.png`.
- Boundary: local signing and local installed-candidate proof only; Developer ID
  notarization and public distribution are not claimed.

## 2026-07-26 Gajae provider parity and installed 0.2.15 proof

- Gajae remains an Atelier-owned GJC adapter with isolated HOME/config/session/
  skill paths. The provider selector changes only the model provider inside
  Gajae; it does not convert task identity to Codex.
- Gajae settings expose `Claude`, `Codex`, and `Alibaba Cloud` as new-task
  defaults. Hermes and Gajae saved defaults are read when a new session is
  created unless a profile explicitly supplies provider/model flags. An
  explicit composer change updates that session and the future default without
  rewriting other existing sessions.
- Gajae Codex uses the canonical ChatGPT subscription access token only through
  `OPENAI_CODEX_OAUTH_TOKEN` in the one-time isolated child environment.
  Refresh tokens, API-key fallback, personal global skills/config, and
  `agent.db` are not copied.
- Fresh source/build verification:
  - provider preference, Gajae routing, settings navigation, and provider usage
    smokes passed;
  - production frontend build passed;
  - Rust library tests: 239 passed, 0 failed, 4 ignored.
- Final package/install proof:
  - candidate and installed version: `0.2.15`;
  - candidate and `/Applications/Atelier.app` executable SHA-256:
    `d1c433a730536868433140949cf468420dea6ae48cf129edfa5099bd0f72b1a9`;
  - local codesign and installed renderer-ready pass;
  - receipt:
    `artifacts/macos-installed-candidate-proof.json`;
  - DMG:
    `src-tauri/target/release/bundle/dmg/Atelier_0.2.15_aarch64.dmg`,
    SHA-256
    `003f096d352150c349077ff026ee8592a115697cff8ea72ae3bf459c5a0a427a`.
- Click-driven installed-app evidence:
  - selected Gajae Codex, restarted Atelier, and confirmed the Codex selection
    persisted;
  - created a new Gajae task without sending a prompt and confirmed its composer
    opened at model provider `Codex`, model `5.5`;
  - restored the pre-proof user default to Claude;
  - screenshots:
    `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.15-gajae-model-providers.png`
    and
    `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.15-gajae-codex-default-new-task.png`.
- Boundary: no prompt was sent during the click proof. A real authenticated
  provider response, clean second-company-Mac proof, Developer ID
  notarization, public distribution, and physical Windows proof remain open.

## 2026-07-26 Reproducible managed Hermes and Gajae runtime (Installed 0.2.14)

- Source capability and runtime contract includes:
  - managed runtime pin policy constants in `credentials.rs`,
  - `ensure_managed_agent_runtime_blocking_at` state machine with
    `checking/installing/bootstrapping_skills/verifying/ready/failed`,
  - readiness receipt writes and `repaired` flag tracking.
- `agent_send` now requires managed-runtime readiness for Hermes and Gajae and
  passes the readiness artifact into command execution.
- `run_gajecode` and `run_hermes` command wrappers use the managed runtime
  command helper when `managed_runtime` is present and enforce managed-path
  prerequisites.
- `agent_sandbox.rs` adds macOS sandbox launch behavior for managed commands with
  bounded read/write root handling.
- `agent_registry.rs` now advertises managed runtime execution controller,
  runtime skill ownership metadata, and automatic online bootstrap for Hermes and
  Gajae, replacing prior blanket-disabled managed-capability behavior for these
  providers.
- `src/lib/tauri.ts`, `src/components/AgentWorkspace.tsx`,
  and `src/components/ConnectionsPanel.tsx` were updated to expose managed
  runtime status, progress, unavailable reason, and runtime identity fields.
- `tools/agent-permission-capability-smoke.ts` and
  `tools/provider-runtime-identity-smoke.ts` now assert managed progress states,
  runtime capability identity, and managed API preparation.
- Real bootstrap defect and recovery:
  - uv installed pinned Hermes Agent v0.19.0 but its wheel omitted repository
    `skills/`, so the initial installed UI failed closed on a missing manifest;
  - Atelier now uses exact-commit `git archive`, Git-object verification, and a
    durable SHA-256 source manifest;
  - durable source contains 453 files and produces 73 verified installed
    skills; invalid prior trees are moved to quarantine;
  - normal runtime commands clear `HERMES_BUNDLED_SKILLS`; only the repair sync
    receives the durable source path.
- Gajaecode isolation proof:
  - `gjc/0.11.7` and managed Bun `1.3.14`;
  - four verified defaults: `deep-interview`, `ralplan`, `team`, `ultragoal`;
  - canonical skill root is
    `providers/gajecode/home/.gjc/agent/skills`, outside personal global skill
    roots.
- Fresh final source verification:
  - Rust: 230 passed, 0 failed, 3 ignored;
  - strict all-target/all-feature Clippy, format, and diff hygiene passed;
  - production frontend build, runtime identity, permission capability, and
    Gajae routing smokes passed;
  - Orca: 23 contract smokes, 10 removable backend features;
  - npm audit: 0 vulnerabilities;
  - RustSec: 0 vulnerabilities, with 18 unmaintained and 2 unsound upstream
    warnings retained.
- Local package/install proof:
  - app version: `0.2.14`;
  - candidate and `/Applications/Atelier.app` executable SHA-256:
    `4ee04fbed757f015c910171f4e7c0c3979ca009d396f90a6abfb890e2e1b1868`;
  - DMG: 13,649,087 bytes, SHA-256
    `3f9aba91eee83ec12cb1da2a24d3a470ff5cafd2d2e2668011a37e010563cd5b`;
  - local codesign, renderer-ready, and 1600 x 900 installed-window checks pass;
  - installed UI `설치·복구` reports runtime/default-skill ready for Hermes and
    Gajaecode;
  - installed Hermes and Gajaecode task composers no longer render the prior
    blanket-disabled warning and instead expose the Atelier-managed runtime and
    adapter skill-owner identity.
- The same source tree now preserves existing platform limits:
  Hermes/Gajae managed runtime is macOS-enabled; non-macOS remains explicitly
  unavailable with disabled reason.
- Scope and boundary:
  source, local build, installed app, and runtime receipts are verified
  separately. No authenticated/paid provider response, credential bundling,
  Developer ID notarization, public distribution, or physical Windows proof is
  claimed.

## 2026-07-23 Release Publication Gate Hardening (Source/Workflow)

- The version-tag workflow now keeps macOS and Windows assets in one private
  draft and seals the complete asset set in `release-manifest.json`; it cannot
  publish a partial release.
- macOS publication candidates must prove Developer ID Application signing,
  Gatekeeper acceptance, and stapled notarization tickets for the app and DMG.
- The Windows physical gate downloads and installs the exact signed draft MSI,
  verifies Authenticode and embedded resources, restarts the same installed
  executable, and records exact version, renderer, persistence, visible browser
  handoff, Claude/Codex authentication, and optional Smart App Control proof.
- A separate `production-release` environment workflow validates the selected
  successful physical-gate run and exact manifest/source binding. It is the
  only code path that can remove draft state, and requires `PUBLISH <tag>`.
- Cross-review hardening now rejects evidence mixed across workflow runs,
  requires candidate/package/provider receipts to share the exact run ID and
  source SHA, extracts the NSIS payload with 7-Zip, and binds its executable,
  resources, version, and Authenticode status to the sealed manifest. The
  publisher also re-downloads the remote draft immediately before publication
  and rejects any manifest change after evidence validation.
- The macOS notarization gate now mounts the stapled DMG, copies the app into a
  fresh installed location, and repeats Developer ID, Gatekeeper, stapler,
  exact-version, and renderer-ready checks against that installed copy.
- Candidate sealing, tamper rejection, publication-evidence rejection, and the
  release-security audit pass locally. This is source/workflow evidence only;
  no Developer ID/SignPath credentials, physical Windows runner result, or
  public GitHub release is inferred or claimed.

## 2026-07-22 Atelier 0.2.12 Release Candidate

- Hardened provider CLI installation so release builds no longer execute
  remote shell or PowerShell payloads. Claude Code, Codex, Bun, Gajae Code,
  and Hermes installs are pinned to reviewed package versions or an immutable
  Git commit, execute on a blocking worker with a 20-minute timeout, drain both
  output streams, retain only a bounded 64 KiB tail, redact credentials, and
  verify the installed CLI before reporting success.
- Corrected user-visible release paths: preview diagnostics now remain bound to
  the normalized preview route and origin, Hermes workload changes reach its
  runtime prompt, composer menus are keyboard accessible, and compact layouts
  retain a usable send action without clipping.
- Fresh source verification on version 0.2.12:
  - Orca feature release gate passed 20 contract smokes and ten independently
    removable backend feature builds;
  - Rust passed 188 tests with zero failures and one intentionally ignored
    live-subscription test; all-target/all-feature Clippy passed with warnings
    denied;
  - production frontend build, updater contract, formatting, diff hygiene, and
    npm audit passed; npm reported zero vulnerabilities;
  - the release audit reported zero RustSec vulnerabilities, with 18
    unmaintained and two unsound upstream advisories retained as warnings.
- macOS package and installed-app proof:
  - DMG: `Atelier_0.2.12_aarch64.dmg`, 13,484,669 bytes, SHA-256
    `097a42df0f98ac265dbc4abe6c46a9de5fcb7ff838a04fa71931cd1235eb4332`;
  - packaged and installed executable SHA-256
    `2f0a1ab865eaa98edd2c69ede60608300581d060771ff23b00eaf67145233549`;
  - `/Applications/Atelier.app` reports 0.2.12, matches the packaged bundle,
    passes strict local-signature verification, and produced a renderer-ready
    receipt for the installed executable and `main` window;
  - WindowServer observed the installed `Atelier` window at 1600 x 900. The
    installed-window screenshot itself was black because screen-recording
    permission was unavailable, so source-renderer visual evidence and
    installed-window metadata are intentionally recorded as separate proofs;
  - the previous installation is preserved at
    `/tmp/atelier-preinstall.dN7g77/Atelier.app`.
- Distribution truth: the macOS artifact uses the local Atelier identity and
  is not Developer ID notarized, so Gatekeeper rejects it for public
  distribution. GitHub has updater signing secrets but no Apple notarization
  credentials or SignPath configuration. Physical Windows browser visibility,
  provider acceptance, Smart App Control, signed update survival, and public
  Windows signing therefore remain mandatory external gates. No unsigned
  public release was published.
- No database, user data, credential store, production deployment, or external
  service data was deleted or modified.

## 2026-07-21 Offline Parallel Agent Runtime Verification (Source Only)

- Added `npm run harness:parallel-agent`, which executes the existing frontend
  session/fleet contracts, one real backend three-turn adapter E2E, and four
  worktree isolation/adoption tests without provider calls.
- Fresh harness result: three concurrent turns, A/C completed, B cancelled,
  per-turn workspace and event isolation, one terminal lifecycle per turn,
  empty child registry, cancelled parent/child PIDs reaped, four worktree tests,
  and `externalProviderCalls: 0`.
- Independent QC caught a pre-existing test receipt path that touched the real
  app-support directory mtime. The tests now inject and assert a temporary
  receipt path; corrected before/after mtime stayed `1784564140`, with no
  retained receipt, fixture process, or temporary directory.
- Fresh regression evidence: frontend build passed; Rust 159/159 passed;
  strict all-target Clippy passed; Windows test target cross-check passed;
  common feature gate passed 17 contract smokes and ten removable backends;
  npm and RustSec audits reported zero vulnerabilities.
- Truth boundary: backend runtime plus frontend/worktree contracts are source
  verified. The installed 0.2.11 app was not replaced, a click-driven UI E2E
  was not claimed, and the borrowed GPU server/local model remained untouched.

## 2026-07-20 Session Execution and OAuth Stabilization (0.2.11)

- Extracted per-session turn ownership from the monolithic workspace into
  `sessionRunRegistry.ts` and `useSessionRunRegistry.ts`. Independent sessions
  can remain live concurrently, an old finalizer cannot clear a newer turn,
  and an explicit user stop takes precedence over interruption cleanup.
- Added `smoke:session-runs` and wired it into the shared Orca feature release
  gate plus release-security audit. The combined gate passes 16 contract
  smokes and ten removable backend features.
- Corrected the provider-login frontend so a failed browser handoff is not
  marked as opened. OAuth URLs now receive bounded, duplicate-safe retries
  while preserving a successful native backend handoff.
- Fresh source verification:
  - frontend production build passes;
  - native and Store Rust suites pass 157/157 each;
  - native and Store strict Clippy pass;
  - normal and Store Windows targets pass `cargo-xwin check`;
  - PTY supervisor reconnects three parallel sessions and measures 1.297 ms
    median / 1.386 ms p95 across 100 writes;
  - updater contract covers macOS, Windows MSI, and Windows NSIS; npm reports
    zero vulnerabilities and the release audit reports zero RustSec
    vulnerabilities.
- Fresh macOS package and installed truth:
  - DMG: `Atelier_0.2.11_aarch64.dmg`, SHA-256
    `8419ed9658fe74ecd982e7caebb016fd6f91bfbacc78624364810a93dbbf5589`;
  - packaged and installed executable SHA-256
    `ea828514cb964113da658e07024e9cc9ec3ebdc5665b19422009c0446dbc6b50`;
  - `/Applications/Atelier.app` reports version `0.2.11`, passes strict local
    signature verification, and emits a renderer receipt for the installed
    executable with window `main` and status `ready`;
  - the previous installed bundle is preserved under
    `/tmp/atelier-preinstall.BZh4Xz/Atelier.app`.
- Physical Windows browser visibility, provider acceptance, Smart App Control,
  public Windows signing, and macOS notarization remain external gates. No
  database, user data, provider credential store, or production deployment was
  modified.

## 2026-07-14 Workbench Shell Stabilization Release Candidate (0.2.8)

- Resumed from the interrupted dirty-worktree state rather than repeating the
  already-reflected 0.2.5 release work. Source and installed metadata were
  already at 0.2.8, but the newest frontend files were newer than both `dist`
  and the installed app, while living SOT documents still described 0.2.7 or
  the historical 0.2.5 scope.
- Finished the workbench shell contract:
  - one global Terminal destination with no duplicate task-mode terminal;
  - no duplicate cwd field in the structured workspace;
  - distinct sessions, profiles, report, plugin, code, changes, and worktree
    icons;
  - hidden terminal initialization deferred until the host is measurable, with
    resize observation for later layout changes.
- Fresh source verification passed:
  - `npm run build`;
  - fixture, workbench, performance, terminal-layout, diff-review,
    element-picker, preview-URL, updater, PTY-supervisor, and release-security
    smokes;
  - native and Store Rust suites, 90/90 each;
  - native and Store `cargo clippy --all-targets -- -D warnings`.
- Fresh macOS package and installed truth:
  - DMG: `Atelier_0.2.8_aarch64.dmg`, 11,347,307 bytes, SHA-256
    `0ffdd3711864d95602640458543a5f355571727c4cd62195577df04e0e39c0d8`;
  - installed executable: 23,424,224 bytes, SHA-256
    `1cf32ddc6dbb47ed5225a65d349bd438032880a7ebd054e5c7a64170c30f59f6`;
  - package and installed app bundles compare without differences;
  - strict signature and DMG payload verification pass;
  - installed renderer receipt reports version `0.2.8`, canonical executable
    `/Applications/Atelier.app/Contents/MacOS/atelier`, window `main`, and
    status `ready`;
  - the prior installed bundle is preserved at
    `/tmp/Atelier.app.before-0.2.8-20260714-140509`.
- Installed visual verification opened Sessions, Code, and Changes at 1600x900.
  A separate 900x720 pass collapsed the global navigation to its icon rail and
  retained the workbench tabs, transcript, and composer without incoherent
  overlap. The PTY supervisor smoke reattached three sessions and measured
  1.283 ms median / 1.338 ms p95 across 100 writes.
- Physical Windows interaction, public Windows signing, and macOS Developer ID
  notarization remain external gates. No database, user data, provider
  credential store, production deployment, paid action, or external publication
  was modified.

## 2026-07-13 Packaged Renderer Readiness Release Candidate (0.2.5)

- Added a private executable-scoped `renderer-ready-<path-sha256>.json` receipt written only after the React
  root mounts. The receipt binds schema, app version, live PID, canonical
  executable path, main-window label, timestamp, and `ready` status; the native
  probe rejects stale, dead-process, wrong-version, wrong-executable, and
  non-ready receipts.
- Removed the two-frame `requestAnimationFrame` dependency discovered by the
  package smoke. A background or occluded WebKit window can defer animation
  frames indefinitely even after first paint, so readiness now records at the
  top-level React mount and is overwritten with `error` if the boot boundary
  catches a render failure.
- `tools/renderer-ready-smoke.sh`, the macOS bundle verifier, GitHub macOS
  release job, Windows provider smoke, physical Windows gate, and release
  security audit now require the same exact-executable renderer evidence.
- Fresh automated verification: frontend production build; native and Store
  Rust suites 86/86 each; strict native/Store Clippy; terminal, PTY, diff,
  element-picker, performance, updater, actionlint, ShellCheck, diff hygiene,
  and release-security gates all pass.
- macOS package and installed truth:
  - DMG: `Atelier_0.2.5_aarch64.dmg`, 11,274,548 bytes, SHA-256
    `a0351eaa3cef8d3d20e3f98b21a0985389cb07a238004b416a7b7afd36b6cd3e`;
  - installed executable: 23,187,008 bytes, SHA-256
    `10764ca0a2ec9891e81629f364966cd0e0cf9a90e7aa4d88813a828f3329de58`;
  - `/Applications/Atelier.app` and its native version probe report `0.2.5`;
    strict local signature verification and DMG payload verification pass;
  - installed renderer receipt reports `0.2.5`, canonical
    `/Applications/Atelier.app/Contents/MacOS/atelier`, window `main`, and
    status `ready`;
  - installed Codex browser handoff probe exits 0 and an unrelated HTTPS URL is
    rejected with exit 1;
  - installed PTY supervisor reattached three parallel sessions and measured
    1.572 ms median / 1.932 ms p95 across 100 writes.
  - candidate and installed apps remain simultaneously probeable through two
    separate chmod-0600 path-hashed receipts; candidate verification no longer
    invalidates installed-app evidence.
- Windows cross-target truth:
  - normal PE32+ GUI x86-64: 23,311,360 bytes, SHA-256
    `48d203f5d224438aac6d483f2094102c0e6589152042db179b469aae695ec008`;
  - Store PE32+ GUI x86-64: 18,575,360 bytes, SHA-256
    `191357241c17009dd685d67be2b3d5740dea5584ea41b254599b78f8875d0b63`;
  - both contain the 0.2.5 renderer probe and WinRT-first OAuth handoff paths.
- Physical Windows browser/login, Smart App Control, signed restart survival,
  public Windows signing, and Developer ID notarization remain external gates.
  No database, user data, provider credential store, production deployment,
  paid action, or external publication was modified.

## 2026-07-13 Agent Workspace Performance Release Candidate (0.2.4)

- Removed the parent-level one-second elapsed-time state from the 9,500-line
  `AgentWorkspace` render path. Elapsed activity now updates inside one memoized
  activity row instead of rebuilding every transcript message and Markdown node
  once per second while any task is busy.
- Kept the composer ref-backed and uncontrolled during normal typing. Historical
  transcript messages now use CSS `content-visibility: auto`, while the actively
  streaming message stays visible, reducing layout and paint work on long tasks
  without changing message order or persistence.
- Added `npm run smoke:agent-performance` and made macOS, Windows direct, Windows
  Store, and the release-security audit enforce the same typing/timer/transcript
  performance contract.
- Fresh automated verification: frontend build, performance/terminal/diff/
  element/updater/fixture smokes, actionlint, release audit, diff hygiene,
  native and Store Rust suites (83/83 each), strict native/Store Clippy, and
  strict normal/Store Windows MSVC cross-target Clippy/link all pass.
- macOS package and installed truth:
  - DMG: `Atelier_0.2.4_aarch64.dmg`, 11,264,036 bytes, SHA-256
    `e4e03bc0dc8e91c4d01b8a04cebb48b89dff77d9f6d7abf729ea14b4bb29d9a0`;
  - installed executable: 23,130,272 bytes, SHA-256
    `b23e9a13e971c194350aca66acbd5d6a9a645746be1b5d92e5c9e884d6359434`;
  - installed short/native version probes report `0.2.4`, strict local
    signature verification passes, the allowlisted OAuth helper passes and an
    unrelated HTTPS URL is rejected;
  - installed PTY reconnect retained three sessions and measured 1.593 ms
    median / 2.054 ms p95 across 100 writes.
- Windows cross-target truth:
  - normal PE32+ GUI x86-64: 23,454,208 bytes, SHA-256
    `35a597b904d9aba3777c4ff30557e943ec89e6ca889b7a284779a0895bf0c942`;
  - Store PE32+ GUI x86-64: 18,624,512 bytes, SHA-256
    `a7dc105a0df23d9a67e4cf8edfd7aeb9b44569de25a6db97c38a4dd63c45fd6f`.
- The automated macOS launch session created the same layer-zero WebKit/window
  surfaces for both the retained 0.2.3 app and 0.2.4, but neither became an
  accessibility/on-screen window in that non-interactive launch context. This
  is not counted as fresh visual proof or as a 0.2.4-only regression; a normal
  logged-in user-session visual receipt remains separate.
- Physical Windows browser/login, Smart App Control, signed restart survival,
  public Windows signing, and Developer ID notarization remain external gates.
  No database, user data, credential store, production deployment, paid action,
  or external publication was modified.

## 2026-07-13 Post-0.2.3 Release Gate Hardening (Unpublished Source)

- Replaced the prototype-era README with the actual 0.2.3 product contract:
  structured agent tasks, detached terminal sessions, optional worktree
  isolation, line-level review, bounded preview/element evidence, Stella Mode,
  provider-owned authentication, and separate local/physical/public release
  truth are now documented without marking external gates complete.
- Extended `tools/windows-provider-smoke.ps1` beyond process-launch return
  codes. It records newly observed Edge/Chrome/Firefox-family processes after
  the Atelier OAuth handoff and can separately require a visible top-level
  browser window on an interactive physical runner.
- The manual GitHub-hosted Windows provider workflow now builds the real
  Atelier helper and can require browser-process evidence. The physical Windows
  release workflow additionally requires visible-window evidence before it can
  accept browser authentication.
- Current GitHub repository truth, read without exposing secret values:
  - configured Action secrets: only the two Tauri updater signing keys;
  - configured Action variables: none;
  - registered self-hosted runners: zero.
  Apple Developer ID, SignPath, physical Windows, and Smart App Control proof
  therefore remain external release gates.
- Fresh verification after the hardening: frontend build, fixture harness,
  terminal/diff/element/updater smokes, actionlint, release audit, diff hygiene,
  and native plus Store Rust suites (83/83 each) pass. The new PowerShell browser
  observation path still requires execution on Windows and is not inferred from
  macOS parsing or cross-compilation.

## 2026-07-13 Signed OAuth Helper and Worktree Stability Release Candidate (0.2.3)

- Promoted the Windows subscription-browser and parallel worktree fixes into a
  distinct updater-visible version. `package.json`, npm lock metadata,
  `Cargo.toml`, the Atelier Cargo lock package, and `tauri.conf.json` all report
  `0.2.3`.
- Windows provider CLIs now receive the installed signed Atelier executable as
  `BROWSER`. When invoked with a login URL, the binary enters a headless helper
  mode, accepts only allowlisted Claude/Codex HTTPS hosts, opens through the
  WinRT/COM/system chain, and exits before constructing a webview. The physical
  Windows gate runs this exact helper mode before the official Codex device and
  Claude setup-token flows.
- Parallel candidate adoption no longer relies on wall-clock resolution alone
  for temporary Git index names. A process-local atomic sequence prevents
  same-process collisions, and both index and `.lock` paths are cleaned after
  success or failure. Five consecutive parallel worktree test runs passed.
- Automated verification truth:
  - frontend build, updater, PTY, terminal-layout, diff-review, element-picker,
    and provider fixture smokes: pass;
  - native and `store-build` Rust suites: 83/83 each;
  - strict native, Store, and Windows MSVC cross-target Clippy: pass;
  - npm audit and RustSec release audit: zero known vulnerabilities; 17
    unmaintained and 2 unsound upstream warnings remain tracked.
- macOS package and installed truth:
  - DMG: `Atelier_0.2.3_aarch64.dmg`, 11,264,932 bytes, SHA-256
    `9976bcaafe4be42bbae304af0c9722d5047dbb8d4f93d4881b7975c303faf9b9`;
  - installed executable SHA-256:
    `8474ac02f6cf3ac30686ad3d0ac1c337e106363de2cbe80ad3da4bdc00c4a2f3`;
  - `/Applications/Atelier.app` and the native version probe report `0.2.3`;
    strict local signature verification passes;
  - installed helper accepts the Codex device URL and rejects unrelated HTTPS;
  - installed PTY supervisor retained three sessions across reconnect and
    measured 1.549 ms median / 2.207 ms p95 across 100 writes.
- Windows cross-target truth:
  - normal PE32+ GUI x86-64, 23,454,208 bytes, SHA-256
    `21177cdc9e7797ff1317e1338e58d44a0409d21519bc932b29bca1a7450a1cc3`;
  - Store-feature PE32+ GUI x86-64, 18,625,536 bytes, SHA-256
    `ad70f4183610c90aaa4d454e168bf617259a7907a25f5d2ff49d569e7930b4ad`;
  - binary string inspection confirms the signed-helper entry point and URL
    rejection path are present. This does not prove a browser appeared on a
    physical Windows desktop.
- External gates remain physical Windows browser/login, Smart App Control,
  exact-version signed restart survival, public Windows signing, and macOS
  Developer ID/notarization. No database, user data, credential store,
  production deployment, paid action, or external publication was modified.

## 2026-07-13 Click-to-Select Preview Evidence Release Candidate (0.2.2)

- Added an Orca-informed, user-invoked element picker to the existing localhost
  Tauri dev-screen bridge. The inspected app receives a temporary overlay; one
  captured click selects the target without activating its original action,
  and `Escape` cancels the picker.
- The returned evidence is deliberately bounded to a stable CSS selector,
  tag/role, visible label, shallow allowlisted markup, viewport rectangle, and
  48 explicitly allowed computed-style properties. Input values, `src`/`href`,
  handlers, arbitrary `data-*`, cookies, storage, response bodies, headers, URL
  queries, and fragments are excluded or rejected again by the host normalizer.
- The selected element is shown in the Inspector, can be attached to the next
  request, remains visible as a removable composer chip, and is then delivered
  through the existing agent prompt/queue boundary. The normalized selection
  is copied into the queued-turn payload, survives persistence/reload, and is
  reused unchanged by background and parallel runs rather than reading mutable
  composer state at execution time. It does not execute Git, mutate the
  inspected page, or bypass permission controls.
- Hardened the repeated Windows subscription-browser boundary without adding a
  script helper. Provider CLIs now receive the installed, signed Atelier
  executable as `BROWSER`; when invoked with a provider OAuth URL, Atelier
  validates the Claude/Codex HTTPS allowlist, opens through the existing
  WinRT/COM/system fallback chain, and exits before creating a webview. The
  physical Windows gate exercises both the native probe and this exact signed
  helper mode before running official device/setup-token login commands.
- A Store-suite run exposed a real parallel worktree-adoption race: two tests
  could receive the same temporary Git index name at coarse clock resolution.
  The index now includes a process-local atomic sequence and removes both the
  index and lock path on every result. Five consecutive parallel worktree test
  runs and the full Store suite pass after the fix.
- Browser evidence:
  - the real picker script aligned its overlay exactly with a 160 x 44 target,
    suppressed the target click, returned the expected `data-testid` selector,
    omitted a seeded private value, and cancelled cleanly with `Escape`;
    evidence: `/tmp/atelier-element-picker-overlay-fixed.png`;
  - production UI at 1280 x 820 exposed one `요소 선택` action, produced no
    page errors, and retained 1280/1280 document width; evidence:
    `/tmp/atelier-element-picker-ui-0.2.2.png`.
- Automated verification truth:
  - frontend production build; element-picker, diff-review, terminal-layout,
    updater-contract, installed PTY, and fixture-agent smokes; locked npm audit;
    actionlint; diff hygiene; and release security audit: pass;
  - native and `store-build` Rust suites: 83/83 each;
  - strict native and Store Clippy: pass with warnings denied;
  - RustSec: zero vulnerabilities, with 17 unmaintained and 2 unsound upstream
    warnings retained as tracked metadata.
- macOS package and installed truth:
  - DMG: `Atelier_0.2.2_aarch64.dmg`, 11,264,309 bytes, SHA-256
    `161a2fe744acf2f478afd664917c73293334f49dac517f7075990c50107d0861`;
  - installed executable SHA-256:
    `040dccec2656a5fbb265a29b80e781d295716099a8e3e3626461289d06807f54`;
  - `/Applications/Atelier.app`, Info.plist, and the native version probe report
    `0.2.2`; strict local signature verification passes;
  - the installed executable retained three hidden PTY sessions across fresh
    clients and measured 1.574 ms median / 1.768 ms p95 across 100 writes;
  - installed signed-helper mode accepted the Codex device URL and rejected an
    unrelated HTTPS URL with exit code 1.
- Windows cross-target truth through `cargo-xwin`:
  - normal PE32+ GUI x86-64, 23,454,208 bytes, SHA-256
    `f6b082f38865b4375c6928558aa04da2d2724edd1545f9aa6d985d256705bf9d`;
  - Store-feature PE32+ GUI x86-64, 18,626,048 bytes, SHA-256
    `14869004d23a775be6982e65546f305a6bf04fcf0c8c1b23ab04e25edef25efd`;
  - both cross-linked executables contain the signed-helper entry point and
    provider URL rejection strings. This is binary-presence evidence, not a
    claim that a physical Windows browser became visible.
- External gates remain unchanged: physical Windows browser/login, Smart App
  Control, exact-version signed restart survival, public Windows signing, and
  macOS Developer ID/notarization are not inferred from cross-target artifacts.
  No database, user data, provider credential store, production deployment,
  paid action, or external publication was modified.

## 2026-07-13 Line-Level Change Review Release Candidate (0.2.1)

- Upgraded the existing file-level change panel to a line-aware review surface
  without changing the Git baseline, Undo, worktree, or candidate-adoption
  boundaries. Unified diffs now expose old/new line numbers and distinguish
  metadata, hunks, context, additions, and deletions.
- A reviewer can attach comments to an exact changed line, persist them with
  the task, resolve or reopen them, delete them, and deliver all unresolved
  comments to the active agent as one structured follow-up. If the task is
  already running, the review uses Atelier's queue path instead of interrupting
  the active turn.
- Annotation restoration matches both the stable line key and the semantic
  file/kind/old-line/new-line/code tuple, so harmless diff-header changes do not
  orphan an existing comment.
- Browser/UI verification:
  - desktop flow added and persisted a comment on `src/app.ts:L11`, delivered
    the structured follow-up, produced no page errors, and retained zero
    document-width overflow; evidence:
    `/tmp/atelier-line-review.png`;
  - 720 x 760 compact flow kept horizontal scrolling inside the diff, retained
    zero page overflow, resolved a comment, reloaded, and restored the resolved
    state; evidence: `/tmp/atelier-line-review-compact.png`.
- Automated verification truth:
  - frontend production build, diff-review and terminal-layout smokes, fixture
    harness, npm audit, actionlint, diff hygiene, and release security audit:
    pass;
  - native and `store-build` Rust suites: 82/82 each;
  - strict native and Store Clippy: pass with warnings denied;
  - RustSec: zero vulnerabilities, with 17 unmaintained and 2 unsound upstream
    warnings retained as tracked metadata.
- macOS package and installed truth:
  - DMG: `Atelier_0.2.1_aarch64.dmg`, 11,253,473 bytes, SHA-256
    `6d42ef539d9369bed63365b1d51485dac6be8923367c7d5c4516dc3fcc434c38`;
  - installed executable SHA-256:
    `4337f9b9ca0e0d477d5f3b1ceec1963052f6469f63954457643c300cd0db6ea5`;
  - `/Applications/Atelier.app` and its native version probe report `0.2.1`;
    strict local signature verification passes;
  - installed PTY smoke retained three sessions and measured 1.572 ms median /
    2.002 ms p95 across 100 writes;
  - CoreGraphics reports two layer-zero Atelier windows, including the
    1568 x 882 main window. Screen capture returned black, so it is not cited as
    fresh installed-UI visual evidence.
- Windows cross-target truth:
  - normal PE32+ GUI x86-64, 23,450,112 bytes, SHA-256
    `db6836b1a219a57068a780f36a127547fc691e9666e92a324bd1fa6947554915`;
  - Store-feature PE32+ GUI x86-64, 18,625,024 bytes, SHA-256
    `e71b74969d30eaf5e2d966ffa0de3b72e2916ba3f1aa0e23ff8fc4b1d7101443`.
- External gates remain unchanged: physical Windows browser/login, Smart App
  Control, exact-version signed restart survival, public Windows signing, and
  macOS Developer ID/notarization are not inferred from cross-target artifacts.
  No database, user data, provider credential store, production deployment,
  paid action, or external publication was modified.

## 2026-07-13 Persistent Terminal Workspace Release Candidate (0.2.0)

- Restored the Terminal navigation and replaced the one-level grid with a
  persistent nested pane tree. The active CLI can split right or down, repeat
  those splits at arbitrary depth, and retain the existing single-terminal plus
  Preview workflow.
- Pane ratios can be changed by pointer drag or keyboard arrows, are clamped to
  a usable range, persist across renderer reloads, and collapse their empty
  branch when a pane closes. Existing xterm hosts are reparented rather than
  restarted, preserving the detached PTY session and scrollback.
- Added the terminal-layout contract smoke to the macOS, Windows direct, and
  Windows Store release workflows and to the release security audit.
- Browser/UI verification against the production frontend confirmed:
  - repeated right/down actions produced three terminal hosts and two nested
    split branches;
  - keyboard and pointer resizing changed and persisted the stored ratio;
  - reload restored the exact pane tree and closing one pane reduced it to two
    hosts and one split without a page error;
  - both keyboard shortcuts invoke the same right/down split paths.
  Evidence is retained at `/tmp/atelier-terminal-panes.png`.
- Automated verification truth:
  - frontend production build, terminal-layout smoke, diff hygiene, fixture
    harness, updater contract, actionlint, release security audit, and locked
    npm audit: pass;
  - Rust suite: 82/82 pass in native and `store-build` configurations;
  - strict native, Windows normal, and Windows Store Clippy: pass with warnings
    denied;
  - source PTY reconnect retained three sessions and measured 1.592 ms median /
    1.860 ms p95 over 100 writes;
  - installed PTY reconnect retained three sessions and measured 1.563 ms
    median / 1.974 ms p95 over 100 writes.
- Windows cross-target truth:
  - normal PE32+ GUI x86-64 SHA-256:
    `432d7b8690dfba1c547c00da02fa19f83f1a4d3ba32d39d03f1459725e7f1825`;
  - Store-feature PE32+ GUI x86-64 SHA-256:
    `85acfa6e5e4b4f030a65ba9b7a2383b2c95e25560689a8c822f11501d15c7147`.
- macOS package and installed truth:
  - DMG: `Atelier_0.2.0_aarch64.dmg`, 11,252,187 bytes, SHA-256
    `a667ff0505fcdc5d040f2bbfc56aae645ce353a96f92ded9e5b22cd65a24d08a`;
  - installed executable SHA-256:
    `17332a5d6c70cb0050b7e35cb57efc6d7ef38b33b1a21a7407f5348d350d17b1`;
  - `/Applications/Atelier.app` and its native version probe report `0.2.0`;
    strict local signature verification passes.
- External release truth is unchanged: physical Windows browser/login, Smart
  App Control, signed restart survival, public Windows signing, and macOS
  Developer ID/notarization remain external gates. No database, user data,
  provider credential store, production deployment, paid action, or external
  publication was modified.

## 2026-07-13 Resumed Goal Runtime Candidate (0.1.99)

- Resumed the persistent Orca-informed product goal without resetting the dirty
  workspace or replacing existing terminal, task, preview, and permission
  workflows.
- A provider failure now captures the matching localhost preview evidence just
  like a successful turn. Explicit user stop/interruption remains the only
  reason to skip final DOM/screenshot/console/network capture.
- Windows OAuth browser handoff now tries the Windows Runtime
  `Launcher::LaunchUriAsync` path on a dedicated initialized thread before the
  existing COM STA `ShellExecuteExW`, `explorer.exe`, and FileProtocolHandler
  fallbacks. Provider HTTPS allowlists and the no-`cmd.exe` URL boundary remain
  release-audited.
- The terminal workspace exposes an explicit split action. It clones the active
  CLI profile into a new persistent session, switches to the existing grid
  layout, and is available through the icon action or `Cmd/Ctrl+Backslash`.
- Verification truth:
  - frontend production build and diff hygiene: pass;
  - Rust suite: 82/82 pass;
  - strict native, Windows normal, and Windows `store-build` Clippy: pass with
    warnings denied;
  - fixture harness, updater contract, release security audit, source and
    installed PTY supervisor smokes: pass;
  - installed PTY reconnect retained three parallel sessions and measured
    1.544 ms median / 1.615 ms p95 over 100 writes.
- Windows cross-target truth:
  - normal PE32+ GUI x86-64 SHA-256:
    `233b3f63cf1583f3fa5fbb678a8ec3f5d4bd839526981ba531683130c02773db`;
  - Store-feature PE32+ GUI x86-64 SHA-256:
    `608890d0fd73adeda2aead87829c5b4dd70e7afbbe1955048ded3b5a6e50e905`.
- macOS package and installed truth:
  - DMG: `Atelier_0.1.99_aarch64.dmg`, 11,250,168 bytes, SHA-256
    `9f89a1b0cefb2dc1e89e799feea09221c29ce2af502464548a315db1455822fe`;
  - packaged and installed executable SHA-256:
    `99df7f90b9f2cae24afe73145c0cf5fe58d5368f0fc5317358bd03996f3e7331`;
  - `/Applications/Atelier.app` and its native version probe report `0.1.99`;
    strict local signature verification and installed Claude/Codex browser
    probes pass;
  - CoreGraphics reports two layer-zero Atelier windows, including the
    1568 x 882 main window.
- External release truth is unchanged: GitHub reports zero self-hosted runners,
  the macOS host has no PowerShell runtime for the Windows execution self-test,
  and no physical Windows browser, Smart App Control, Authenticode, signed
  restart-survival, Developer ID/notarization, external publication, database,
  user-data, or credential-store mutation is claimed.

## 2026-07-13 Automatic Preview Evidence Candidate (0.1.98)

- Removed the manual-inspection dependency from task evidence. A visible
  localhost preview now arms the Tauri dev-screen bridge in the background,
  remembers the matching bridge host/port/window, rejects diagnostics from a
  different preview origin, and performs a full DOM/screenshot/console/network
  capture when the provider turn finishes.
- HTTP resource entries with status 400 or higher now count as network
  failures even when the browser does not emit a separate resource-error event.
  Evidence remains bounded and excludes bodies, headers, cookies, storage,
  URL user info, query strings, and fragments.
- Real bridge fixture truth without pressing the manual `검사` action:
  - automatic diagnostics arming executed twice, followed by Tauri window
    discovery, native screenshot capture, DOM snapshot, and final diagnostics;
  - the completed task stored DOM 1, screenshot captured, console errors 2,
    warnings 1, network requests 1, and network failures 1 for an HTTP 500;
  - four seeded secrets and the seeded URL query were absent from persisted
    task evidence; redacted runtime/console values remained readable as
    `<redacted>`;
  - the compact application render retained zero horizontal document overflow.
    Evidence is retained at `/tmp/atelier-auto-preview-evidence.png`.
- Verification truth:
  - frontend production build and diff hygiene: pass;
  - Rust suite: 82/82 pass;
  - strict native, Windows normal, and Windows `store-build` Clippy: pass with
    warnings denied;
  - agent fixture, updater contract, source and installed PTY supervisor smoke,
    release security audit, and Service Factory structural validation: pass;
  - source PTY reconnect measured 1.603 ms median / 1.902 ms p95; the installed
    executable measured 1.556 ms median / 2.209 ms p95 over 100 writes.
- Windows cross-target truth:
  - normal PE32+ GUI x86-64 SHA-256:
    `6fce7a834c9e70ceac28b2e5282a5bea384fd4a18cbc6c9488361fc094c8b878`;
  - Store-feature PE32+ GUI x86-64 SHA-256:
    `e4437f6364609a915fd7ba05b224e4b32baa7d23a2ebda0493d4388d30dee639`.
- macOS package and installed truth:
  - DMG: `Atelier_0.1.98_aarch64.dmg`, 11,251,303 bytes, SHA-256
    `8a819d3d9811f996a8901368d0693e837e45ff464481abead172cf9916cf2927`;
  - packaged and installed executable SHA-256:
    `3d234323d1448545a75300f510e5790703eae471573134ca177bff46c574eabf`;
  - `/Applications/Atelier.app` and its native version probe report `0.1.98`;
    strict local signature verification and installed Claude/Codex OAuth
    browser probes pass;
  - CoreGraphics reports the installed process owns an on-screen 1600 x 900
    `Atelier` window. The current desktop capture process returned an all-black
    image, so no fresh visual screenshot is claimed from that capture.
- External release truth is unchanged: no physical Windows runner evidence,
  public Windows signing, Developer ID/notarization, GitHub publication,
  production deployment, credential mutation, database deletion, or user-data
  deletion was performed.

## 2026-07-12 Preview Console and Network Evidence Candidate (0.1.97)

- Extended the localhost-only Tauri dev-screen bridge with bounded browser
  diagnostics. It records warning/error console entries, runtime errors,
  resource timing/status metadata, and resource failures. It does not collect
  response bodies, request headers, cookies, or browser storage.
- Sanitized diagnostic URLs by removing user info, query strings, and fragments,
  and redacted bearer/basic credentials, provider keys, access/refresh tokens,
  authorization values, client secrets, and passwords before the result reaches
  task persistence or the next agent prompt.
- Attached console and network counts plus expandable evidence to the assistant
  task response. The same redacted evidence is included in the next provider
  context so an agent can inspect a reported preview failure without requiring a
  pasted screenshot.
- Browser fixture truth:
  - Tauri bridge status, DOM snapshot, and PNG screenshot capture passed.
  - Two console entries, one runtime error, one resource entry, and one network
    failure were retained while four seeded secrets and all URL query data were
    absent from the normalized payload.
  - Desktop and 720 x 900 compact renders exposed both evidence sections with
    zero document-width overflow. Evidence is retained at
    `/tmp/atelier-preview-diagnostics-desktop.png`,
    `/tmp/atelier-preview-diagnostics-expanded.png`, and
    `/tmp/atelier-preview-diagnostics-compact.png`.
- Verification truth:
  - Frontend production build and formatting: pass.
  - Rust suite: 82/82 pass. The worktree overlap test also passed in isolation;
    its assertion now includes the unexpected runtime error if it ever fails
    again instead of hiding the diagnostic.
  - Strict native, Windows normal, and Windows `store-build` Clippy: pass with
    warnings denied.
  - Agent fixture, source and installed PTY supervisor smoke, updater contract,
    diff hygiene, and release security audit: pass. RustSec reports zero known
    vulnerabilities with 17 unmaintained and 2 unsound upstream warnings.
  - Source PTY smoke retained three sessions across reconnect and measured
    1.292 ms median / 1.369 ms p95 over 100 writes. The installed executable
    measured 1.299 ms median / 1.612 ms p95.
- Windows cross-target truth:
  - Normal PE32+ GUI x86-64 SHA-256:
    `2ae7e11c105e0ee695d5004ec4c409b21610134e658ee4b9b4237300e23206d8`.
  - Store-feature PE32+ GUI x86-64 SHA-256:
    `fae436877a8d6e6dfacce38c300f7ba72eba3e4b30031502425c6af62770764e`.
  - No physical Windows runner is registered, so browser-auth appearance,
    Smart App Control acceptance, Authenticode, and update-survival evidence are
    not inferred from the cross-target artifacts.
- macOS package and installed truth:
  - DMG: `Atelier_0.1.97_aarch64.dmg`, 11,248,840 bytes.
  - DMG SHA-256:
    `b02f6e8682a00d53e228df087234b1cf60eafb0bbfc57da46cfacc242cd50878`.
  - Packaged and installed executable SHA-256:
    `10971b3d3d237b90923c1ef23b254d05c8888c548f07a9b1775d198e91d57171`.
  - `/Applications/Atelier.app` and the native version probe both report
    `0.1.97`; strict local signature verification passes.
  - Installed Claude and Codex OAuth browser probes return exit code 0.
  - The installed `Atelier` window was captured from the running packaged
    process at `/tmp/atelier-0.1.97-installed.png`.
- External release truth remains unchanged: the GitHub public release is still
  `v0.1.66`, no self-hosted Windows runner is registered, and this Mac has only
  the local `Atelier Local Code Signing` identity. No GitHub release, production
  deployment, database/data deletion, credential-store mutation, or external
  publication was performed.

## 2026-07-12 Quick Open, Candidate Adoption, and Runtime Diagnostics Candidate (0.1.96)

- Added task-wide Quick Open across persisted sessions, agents, source
  workspaces, and isolated-worktree branches. The workspace exposes a visible
  search action, keyboard navigation, `Cmd/Ctrl+P`, and a native macOS menu
  accelerator that forwards the command into the Tauri renderer.
- Moved the Windows OAuth browser handoff onto a dedicated COM STA thread before
  calling `ShellExecuteExW`. This prevents a Tauri MTA worker from producing an
  incompatible COM-apartment handoff while retaining the trusted
  `explorer.exe` and `FileProtocolHandler` fallbacks.
- Added first-class release diagnostics inside Atelier. Settings now reports the
  running app version, platform/architecture, browser-handoff contract, and the
  read-only Windows Smart App Control registry state. Connections exposes
  allowlisted Claude/Codex browser probes so a physical machine can test the
  exact native handoff without starting or mutating an authentication session.
- Added explicit candidate adoption for completed parallel worktrees. Atelier
  verifies source/candidate repository identity and the expected branch, builds
  the candidate patch through a private alternate Git index, runs
  `git apply --check`, and applies only conflict-free changes. It never resets,
  merges, commits, or removes user work and retains a private patch receipt.
- Verification truth:
  - Frontend production build: pass.
  - Rust suite: 82/82 pass, including non-overlapping dirty-source adoption,
    overlapping-source refusal, and a real loopback HTTP preview fixture that
    verifies request path, status, page title, and body evidence. The added
    registry-contract test locks Smart App Control to `0=Off`, `1=On`, and
    `2=Evaluation`.
  - Strict native and Windows MSVC cargo-xwin Clippy: pass with warnings denied.
  - Agent fixture, three-session PTY reconnect/latency smoke, updater contract,
    and release security audit: pass. RustSec: zero known vulnerabilities; the
    tracked upstream 17 unmaintained and 2 unsound warnings remain.
  - Normal and Store-feature Windows release targets both link to PE32+ GUI
    x86-64 executables after the STA handoff change. Their SHA-256 values are
    `a95ff3c75c79d6fd5d21c8be6b38c31867f9911285aa015b4b2d7581854bc858`
    and `99f9560de11ba899e1409b52cea17aaeab58d52309152419d53786f637400daf`.
- macOS package and installed truth:
  - DMG: `Atelier_0.1.96_aarch64.dmg`, 11,240,463 bytes.
  - DMG SHA-256:
    `fe9063bde79cf7de6a01af0aef7c6e61e65bbe522f88c2c4b84a1894f66bb167`.
  - Installed/package executable SHA-256:
    `bac172fbe0729f583258868c4f6e2916833c48778acd8a96824e01a644848998`.
  - Installed native version probe: `0.1.96`; strict signature verification,
    package/install executable hash equality, and the native `Navigate` menu
    registration passed.
  - The installed executable's restricted Codex and Claude OAuth browser probes
    both returned exit code 0 after the package refresh.
  - The installed detached supervisor retained three parallel sessions across
    reconnect and measured 1.551 ms median / 1.623 ms p95 input latency across
    100 writes.
  - The packaged frontend rendered the new Connections and Updates diagnostic
    surfaces without horizontal overflow. Visual evidence is retained at
    `/tmp/atelier-0.1.96-connections-ui.png` and
    `/tmp/atelier-0.1.96-updates-runtime-ui.png`. The installed native process
    owns the `Atelier` main window; the logged-in macOS session was locked, so
    no fresh installed-window screenshot is claimed.
  - Installed-app Quick Open opened through both the `Navigate > Quick Open...`
    menu and the physical `Cmd+P` key code. Visual evidence is retained at
    `/tmp/atelier-0.1.96-quick-open-menu.png` and
    `/tmp/atelier-0.1.96-quick-open-keycode.png`.
- Physical Windows browser-auth completion, Smart App Control acceptance,
  signed update survival, and public macOS notarization remain external
  validation gates.

## 2026-07-12 OAuth Handoff Stability Candidate (0.1.95)

- Fixed a provider-login race where a long OAuth URL could be accepted at the
  current end of a PTY read before later query parameters, including
  `redirect_uri`, had arrived. Runtime extraction now waits for a delimiter or
  a stable 500 ms capture before opening the URL.
- Kept the Rust provider allowlist and native OS browser call as the first
  path, then added an independently allowlisted Tauri shell fallback for
  packaged hosts where the direct Windows handoff is rejected.
- Added a regression covering partial and terminated Claude OAuth URLs. The
  frontend production build, all 78 Rust tests, strict Windows MSVC cargo-xwin
  Clippy, updater contract smoke, and release security audit passed. RustSec
  reported zero vulnerabilities; the existing upstream 17 unmaintained and 2
  unsound warnings remain tracked.
- macOS package and installed truth:
  - DMG: `Atelier_0.1.95_aarch64.dmg`, 11,198,409 bytes.
  - DMG SHA-256:
    `7e2d92279d5c6c1c5f01e640024818ab3d660ec5054d271756496a31dd960612`.
  - Installed/package executable SHA-256:
    `d03234f0916ff5c671590425ec584e6a4c1a3139cca1d809e9daa690152c186e`.
  - Installed native version probe: `0.1.95`; strict signature verification
    and a visible installed-app launch passed.
- Physical Windows browser appearance, provider authentication completion,
  Smart App Control acceptance, and signed update survival remain external
  validation gates and are not claimed complete from this macOS host.

## 2026-07-12 Parallel-Workflow UX Candidate (0.1.94)

- Expanded the parallel-worktree launcher to at least 320 px when opened so
  profile selection and launch controls remain reachable without manual
  composer resizing.
- Added batch progress, completed/failed accounting, a batch-level stop action,
  two-line final-response previews, explicit candidate navigation, and
  immediate tooltips for the isolated-worktree and parallel-run icons.
- Browser interaction checks confirmed the launcher height (`320`), visible
  batch stop action while turns were active, `3/3` completion, three candidate
  response previews, and zero document-width overflow at 1440 x 900 and
  820 x 720. Light and dark visual passes preserved readable contrast.
- Frontend production build and the full Rust library suite passed (77/77).
  Release security audit reported zero RustSec vulnerabilities, while the
  existing upstream unmaintained/unsound warnings remain tracked.
- macOS package and installed truth:
  - DMG: `Atelier_0.1.94_aarch64.dmg`, 11,200,195 bytes.
  - DMG SHA-256:
    `62be660c8d4a9b8b51b17aef2fce6fa93a90eddf7806211c849ae55a5764f12e`.
  - Installed/package executable SHA-256:
    `3349e9060720c3d84727dc5408ae26ed86c33f2ecdbb5edf714a37804974d1a0`.
  - Installed native version probe: `0.1.94`; package/install directory
    comparison, strict signature verification, and installed launch passed.
- Physical Windows interaction and public-signing evidence remain separate
  external gates.

## 2026-07-12 Orca Parallel-Worktree Candidate (0.1.93)

- Corrected the Orca adoption record so runtime primitives are no longer
  reported as complete user-facing features. The feature-truth table now keeps
  parallel worktrees, terminal splits, design selection, diff annotations,
  remote worktrees, integrations, and mobile continuity separate.
- Added a visible parallel-worktree launcher to the agent composer. One prompt
  can select two or more configured agent profiles; Atelier creates a separate
  persisted session and isolated Git worktree for every candidate and starts
  the turns concurrently without replacing the existing single-session flow.
- Added a batch comparison surface showing candidate provider, run state,
  worktree branch, changed-file count, additions, and deletions. Candidate
  sessions are grouped and numbered in the task list. Automatic winner merge
  remains intentionally unavailable until conflict-safe integration is
  implemented.
- Browser checks passed at 1440 x 900, 1280 x 820, and 820 x 720. The launcher,
  profile selection, and comparison panel were visible, three candidates
  completed in the browser adapter fixture, and compact document scroll width
  equaled client width (`820 == 820`).
- Frontend production build passed. The full Rust library suite passed 77/77;
  the worktree tests specifically preserved source edits and reused task
  branches.
- macOS package and installed truth:
  - DMG: `Atelier_0.1.93_aarch64.dmg`, 11,201,583 bytes.
  - DMG SHA-256:
    `05c54e892d5ad8e9f396eaada601d2f7b0707c4e96d3b609b429cdb2f0868c57`.
  - Installed/package executable SHA-256:
    `0f4b085dd01744a9d88e8fc8ffdecc57720e832d3518362cc9ef0115cc604`.
  - Installed short/build/native version-probe value: `0.1.93`.
  - Strict local signature, package-to-install directory comparison, and
    installed launch passed.
- Physical Windows execution and public signing/notarization remain external
  gates; no Windows completion is inferred from this macOS candidate.

## 2026-07-12 Preview-Evidence Release Candidate (0.1.92)

- Extended each completed task's preview evidence with a bounded HTTP response
  body, request method/time, managed-service PID/restart/error state, and the
  six most recent bounded server-output lines. Raw preview output is redacted
  before native storage and Tauri emission; frontend persistence and provider
  prompt assembly perform a second redaction pass.
- Browser visual checks expanded both HTTP and server-output details at
  1440 x 900 and 720 x 900. Document scroll width equaled client width in both
  cases, all evidence stayed inside the response panel, and no page error was
  reported. These checks do not claim full browser-console or network-waterfall
  archival.
- Normal and Store Rust suites each passed 77/77 with strict Clippy. Frontend
  production build, fixture harness, updater contract, PTY supervisor smoke,
  locked production npm audit, actionlint, ShellCheck, diff hygiene, native
  PowerShell parse/self-test, and release security audit passed. RustSec found
  zero known vulnerabilities, with 17 unmaintained and 2 unsound upstream
  warnings still tracked.
- Fresh real-provider smokes passed:
  - Claude subscription: `claude-sonnet-5`, final text `OK`, exit 0.
  - Codex ChatGPT login: `gpt-5.6-sol`, native `ultra`, final text `OK`, exit 0.
  - Hermes: `openai-codex/gpt-5.5`, final text containing `OK`, exit 0.
- macOS package and installed truth:
  - DMG: `Atelier_0.1.92_aarch64.dmg`, 11,201,621 bytes.
  - DMG SHA-256:
    `952ac67e9efd9dcb405d38bc92767a7b6690c06902586e82465f487aeace6323`.
  - Installed/package executable SHA-256:
    `af763827ebf6fe6c6467330babe42e5b5c23946225f0a0d661417a81f4d0a778`.
  - Installed short/build/version-probe value: `0.1.92`.
  - Strict local signature and installed Codex/Claude native browser probes:
    pass.
  - Installed supervisor smoke: three parallel sessions reattached; 1,000
    writes measured 1.640 ms median / 2.043 ms p95.
- Windows cross-target truth:
  - Normal SHA-256:
    `147926b72f58e852b4482c10f82760fa2cb46fc03a7814962d0a9ba535364a40`.
  - Store SHA-256:
    `8418d52de47452e1d80f832ff00f6cf69559baa262b6a2675a53d4296dfe2f9a`.
  - Both are PE32+ x86-64 GUI executables and pass strict cargo-xwin Clippy.
- Physical Windows execution and public signing/notarization remain external
  gates. No physical Windows runner is registered, so browser auth, signed
  restart survival, and Smart App Control are not inferred from cross-linking.

## 2026-07-12 Physical-Gate Release Candidate (0.1.91)

- Added the native `--atelier-version-probe` and a manual self-hosted Windows
  release gate. The gate records the exact installed path/version, Authenticode
  status, restart result, native Atelier OAuth browser probe, post-login
  Claude/Codex status, and Smart App Control state in a redacted JSON artifact.
- Parsed `tools/windows-provider-smoke.ps1` with PowerShell, passed every GitHub
  workflow through actionlint, and added a release-audit invariant preventing
  removal of the physical-device contract.
- The native PowerShell parser exposed and closed an invalid `return switch`
  construct that x86 container emulation had not reported reliably. The final
  self-test passes and locks Smart App Control values to `0=Off`, `1=On`, and
  `2=Evaluation` without writing to the registry.
- Fresh real-provider smokes passed after packaging:
  - Claude subscription: `claude-sonnet-5`, final text `OK`, exit 0.
  - Codex ChatGPT login: `gpt-5.6-sol`, native `ultra`, final text `OK`, exit 0.
  - Hermes: `openai-codex/gpt-5.5`, final text containing `OK`, exit 0.
- Normal and Store Rust suites passed 76/76 with strict Clippy. Frontend build,
  release security audit, actionlint, version consistency, diff hygiene, and
  Windows normal/Store strict cargo-xwin Clippy plus release linking passed.
- macOS package and installed truth:
  - DMG: `Atelier_0.1.91_aarch64.dmg`, 11,193,759 bytes.
  - DMG SHA-256:
    `9776178959d5057a26a6d249d13f8feab984c9303b23c3054245ef963abe1cb3`.
  - Installed/package executable SHA-256:
    `4843055f9d377ad9d5e19bfd04ec58fb07b6b6ab53f8a299e49ac75a3cd0d0ce`.
  - Installed short/build/version-probe value: `0.1.91`.
  - Strict local signature and Codex/Claude native OAuth probes: pass.
  - Installed supervisor smoke: three parallel sessions reattached; 1,000
    writes measured 1.576 ms median / 2.268 ms p95.
- Windows cross-target truth:
  - Normal SHA-256:
    `738a43fe7db22d9a778be8fd090cc2739cba01f4b5e41b02316511b023cfc111`.
  - Store SHA-256:
    `5c70806456f03484bc292a882a5d265e676f3b8bb006f01640d546aafd104bc9`.
  - Both are PE32+ x86-64 GUI executables.
- Physical Windows execution and public signing/notarization remain external
  gates. Their absence is not reported as a local implementation failure or a
  completed public release.

## 2026-07-12 Codex Capability-Aware Release Candidate (0.1.90)

- Reproduced the Codex failure independently of Atelier authentication:
  `gpt-5.6-sol` returned a reserved `collaboration.spawn_agent` schema error
  without the v2 runtime and succeeded with `multi_agent_v2` plus native
  `ultra` effort.
- Extended Codex model options with supported reasoning levels, default effort,
  and collaboration-runtime requirements from the provider-owned model cache.
- Added model-aware Rust normalization and matching harness behavior. Legacy
  models fall back to `xhigh`; Ultra-capable models retain native `ultra` and
  enable `multi_agent_v2` before `codex exec`.
- Real provider smokes passed:
  - Claude subscription: `claude-sonnet-5`, final text `OK`, exit 0.
  - Codex ChatGPT login: `gpt-5.6-sol`, `ultra`, final text `OK`, exit 0.
  - Hermes: `openai-codex/gpt-5.5`, final text `OK`, exit 0.
- Normal and Store Rust suites passed 76/76 with strict Clippy. Windows normal
  and Store configurations passed strict cargo-xwin Clippy and linked PE32+
  x86-64 executables.
- macOS package truth:
  - DMG: `Atelier_0.1.90_aarch64.dmg`, 11,198,612 bytes.
  - DMG SHA-256:
    `cdc4c8de4995f5a65c45879c0207f4a0b9ac8dab5b709ad5efdee5bee6f9a62a`.
  - Installed/package executable SHA-256:
    `d65693a3ab8bd7429199ae7adbcdf7258f7de239ffc1b40069165810bab9d729`.
  - Installed version: 0.1.90; strict local signature: pass.
  - Installed OAuth browser probes: Codex exit 0, Claude exit 0.
  - Installed supervisor smoke: three parallel sessions reattached; 1,000
    writes measured 1.557 ms median / 1.740 ms p95.
- Windows cross-target truth:
  - Normal SHA-256:
    `f73dee6f4ccf59c613ae33d7706bf3e153c41bfb2c230b7cc762a4f2008f2177`.
  - Store SHA-256:
    `11c9b1a603ef15bb7589acf45ae51356916efac9d7f6830b2cdd4f6a9d49ebc5`.
- Browser visual checks at 1440 x 900 and 720 x 900 had no document overflow;
  the Codex workload/model menu remained inside the viewport. A fresh installed
  app screenshot is not claimed because the current macOS screen capture was
  black.
- Physical Windows remains an explicit gate: no VM or self-hosted runner was
  available on this host, so browser auth, signed restart survival, and Smart
  App Control are not inferred from cross-compilation.

## 2026-07-12 Provider-Owned Authentication Boundary (0.1.89)

Implemented:

- Removed Atelier's temporary Codex access-token staging into Hermes
  `auth.json`. Current Hermes releases own their provider authentication and
  can resolve the canonical Codex CLI credential without Atelier copying it.
- Removed the startup migration writer as well. Atelier no longer reads,
  writes, or deletes Hermes provider authentication state. Legacy access-only
  entries from older releases contain no refresh token and expire naturally.
- Removed Claude credential-file import and Atelier's private OAuth refresh
  implementation. Claude Code continues to own its interactive login; the only
  automated bridge is the official `claude setup-token` command, whose
  inference-only token is stored in Atelier's own keychain entry without a
  refresh token.
- Direct Claude Code child processes receive that setup token only through
  `CLAUDE_CODE_OAUTH_TOKEN`; isolated Gajae Code child processes receive it only
  through `ANTHROPIC_OAUTH_TOKEN`. The release audit rejects external Claude
  credential reads, private token-endpoint calls, and refresh-token caching.
- Advanced all manifests and lockfiles together to 0.1.89.

Source and cross-target evidence:

- Normal and `store-build` configurations each passed 75 Rust tests and strict
  native clippy after the credential-boundary change.
- Both configurations passed strict `x86_64-pc-windows-msvc` clippy and linked
  as PE32+ x86-64 GUI executables. The normal executable SHA-256 is
  `1cb16d9a368e4a24dbd06ad33ac427216c341430bc745ea0c7993a088074c588`;
  the Store-feature executable SHA-256 is
  `6769900bab7bba7ee0b8f9b6cb82994ddd06a5e7c012b5ff9ff1819085bd5111`.
- The release-security audit accepted the provider-owned authentication
  contract and reports zero RustSec vulnerabilities.
- The Windows provider smoke now obtains Hermes authentication state through
  `hermes auth status openai-codex`; it no longer opens or parses Hermes
  `auth.json`. The release audit enforces this script boundary.
- The Windows login smoke now mirrors Atelier's actual `codex login
  --device-auth` and `claude setup-token` flows, supports Windows PowerShell
  5.1 process APIs, drains child output without pipe deadlock, and can invoke
  the Atelier executable's native browser probe. Its syntax passed the official
  PowerShell 7.6.2 AST parser.
- The locally installed provider CLIs expose those exact current commands:
  Claude Code 2.1.204 reports `setup-token` as the subscription-token flow, and
  Codex CLI 0.144.0 reports the `login --device-auth` option.
- The smoke summary is refreshed after the interactive flows instead of
  retaining the pre-login state. `-Strict -Login` now fails unless an actual
  Atelier executable accepts the native browser handoff and both Codex and
  Claude report authenticated state afterward; the PowerShell-only fallback is
  diagnostic evidence and cannot satisfy this release gate.
- The manually dispatched Windows provider-smoke workflow now pins checkout and
  artifact-upload actions to full commit SHAs, and the release audit scans that
  workflow alongside the main and Store release workflows.
- Main macOS, Windows, signing, and Store jobs now use `npm ci` against the
  committed lockfile. A clean local `npm ci --legacy-peer-deps` restored 249
  packages with zero vulnerabilities and the production build passed afterward.
- Playwright rendered the source UI at 1440 x 900 in light and dark themes and
  at 720 x 900 in the compact layout. The navigation collapses to the icon rail
  before the workspace, the composer remains visible, and no blank screen,
  clipped controls, or incoherent overlap was observed.
- The macOS build and mounted-DMG verification scripts pass ShellCheck without
  findings. The verifier re-mounted the 0.1.89 DMG and accepted its embedded app
  signature and protected-resource declaration boundary.
- A scan of every added diff line found zero private-key, provider-token, AWS
  key, GitHub token, or bearer-token patterns. OAuth redaction tests construct
  their fake token at runtime so public scanners do not mistake fixtures for
  credentials.
- The physical smoke resolves the Atelier executable from source builds,
  current-user/system GitHub installs, a running process, or the Microsoft Store
  package returned by `Get-AppxPackage`, covering both `Atelier` and `Atelier
  Agent` installation identities before running the native browser probe.
- Windows browser handoff now initializes COM and calls `ShellExecuteExW` with
  `SEE_MASK_NOASYNC` from worker threads. Codex device authorization pre-opens
  its validated `https://auth.openai.com/codex/device` page before waiting for
  the CLI's one-time code; generated browser helper scripts were removed.
- The generic file-preview backend now blocks canonical provider and shell
  credential paths, including default macOS and Windows Hermes roots,
  `HERMES_HOME`, corrupt auth backups, OAuth/MCP token subtrees, Codex auth,
  Claude credentials, SSH, cloud credentials, and package-manager credential
  files. Project files with generic names such as `auth.json` remain readable.

macOS package and installed-app evidence:

- `npm run tauri:build` produced and verified
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.89_aarch64.dmg`.
- The final DMG is 11,199,653 bytes with SHA-256
  `308e8600d62843ac057d967c41a9eacbde754c0c2b5a24bbd42d31e10ead44dd`.
- `/Applications/Atelier.app` reports 0.1.89, passes strict local signature
  verification, and exactly matches the packaged executable at SHA-256
  `1fcbda12574f77d9e0ebbba2442e71f5a40bf609f4c09a7ef11b3125985ee0ee`.
- The installed executable passed launcher exit, fresh-client reconnect, three
  concurrent hidden sessions, and 1,000 PTY writes with exit code 0, 1.583 ms
  median input latency, and 1.726 ms p95.
- The installed executable's restricted Codex and Claude browser probes both
  returned exit code 0 through the same native handoff used by subscription
  login.
- CoreGraphics reports the installed process and two layer-zero Atelier
  windows, including the 1568 x 882 main window. `lsappinfo` reports bundle ID
  `com.atelier.app` for the installed process.

Remaining truth boundary:

- Physical Windows interactive browser authentication, signed-installer
  update survival, and Smart App Control still require device evidence.
- Public macOS distribution still requires Developer ID signing and Apple
  notarization.

## 2026-07-12 Cross-Platform Release Candidate (0.1.88)

Implemented:

- Closed Windows-only compile and lint drift in agent launch, credential
  installation, PTY environment, and supervisor test paths without changing
  the macOS runtime contract.
- Kept normal GitHub builds and Microsoft Store builds as separate updater
  capabilities while compiling both from the same 0.1.88 source revision.
- Advanced all package manifests and lockfiles together to 0.1.88.

Source and Windows artifact evidence:

- Normal and `store-build` configurations each passed 69 Rust tests and strict
  native clippy. Both configurations also passed strict
  `x86_64-pc-windows-msvc` clippy through `cargo-xwin`.
- Normal and Store-feature Windows release links produced valid PE32+ x86-64
  GUI executables. Their captured SHA-256 values are
  `2632173355813fc0116aa340cc0b129b4f3e9fba5c18a5b093fd6d34100b5698`
  and
  `6ece8097f6fbd7ac4bf0e9d39b4f2bb1b1653c6aca53fb65e5a4a74271ee8eba`.
- Frontend production packaging, Rust formatting, diff hygiene, agent fixtures,
  workflow lint, npm audit, updater-contract smoke, and release-security audit
  passed. The npm audit reports zero vulnerabilities and the release audit
  reports zero RustSec vulnerabilities.

macOS package and installed-app evidence:

- `npm run tauri:build` produced
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.88_aarch64.dmg`.
- The mounted-DMG verifier accepted the embedded signature and confirmed that
  protected Contacts, Photos, Apple Events, microphone, and camera usage keys
  are absent.
- The final DMG is 11,287,148 bytes with SHA-256
  `95304021ab3fe5cfe7e52e2463fa77a15d24b26299bf7acebf25fc1038578a49`.
- `/Applications/Atelier.app` reports 0.1.88, passes strict local signature
  verification, and its executable exactly matches the packaged executable at
  SHA-256
  `3ee81d60450d60775d13c79152832a0bc02ebe294515cc751bdc3fa5a404ee89`.
- The installed executable passed 1,000 PTY writes with launcher exit,
  reconnect, exit code 0, 1.648 ms median input latency, and 1.889 ms p95.
- CoreGraphics reports the installed process and its Atelier main window. The
  active macOS session is behind `Window Server: Display 1 Shield`, so the
  window is intentionally recorded as off-screen and no visual screenshot is
  claimed.

Remaining truth boundary:

- Cross-compilation proves Windows source and linker integrity, not physical
  Windows behavior. Interactive Claude/Codex browser sign-in, signed-installer
  update survival, and Smart App Control still require a physical Windows run.
- The macOS package remains locally signed. Public distribution still requires
  Developer ID signing and Apple notarization.

## 2026-07-12 Distribution Readiness Audit (0.1.87)

Implemented:

- Made the native backend the authoritative browser opener for packaged Claude
  and Codex subscription login. Frontend fallback opens only when the backend
  explicitly reports that it did not open the browser, preventing duplicate or
  no-op platform fallbacks. Codex now supports the same forced reconnect path
  as Claude.
- Added an explicit runtime updater capability. Microsoft Store builds report
  GitHub self-update as unavailable even when installed outside a recognizable
  WindowsApps path; normal GitHub installs retain the updater.
- Removed steady-state Gajae credential reads from Claude Code's private
  credential file. Explicit login/repair may import once into Atelier-owned
  storage, and startup scrubs stale Atelier-managed Hermes Codex access.
- Removed broad macOS TCC declarations and added a package gate that fails if
  Contacts, Photos, Apple Events, microphone, or camera usage keys reappear.
- Upgraded Vite to 6.4.3 and cleared the npm audit. Release and Store workflows
  now run the stricter audit, Rust tests, clippy, provider fixtures, PTY smoke,
  updater contract, and release-security gates on their native platforms.
- Added a deterministic setup-time main-window reveal while retaining the
  macOS reopen path. The installed process publishes the configured 1600 x 900
  main window. The active macOS user session was locked during final shell
  verification, so no visual screenshot is claimed.

Validation evidence:

- `npm run tauri:build` passed and the mounted-DMG verifier accepted the signed
  payload and empty protected-permission metadata.
- Normal and `store-build` configurations each passed 69 Rust tests and strict
  clippy. Rust formatting and `git diff --check` passed.
- `npm audit --audit-level=low` reports zero vulnerabilities. The release audit
  reports zero RustSec vulnerabilities; 17 unmaintained and 2 unsound advisory
  warnings remain upstream metadata rather than known exploitable findings.
- Agent fixtures, `actionlint`, and the updater contract smoke passed. The
  updater fixture covers Darwin plus Windows generic/MSI/NSIS aliases and
  rejects unsigned metadata.
- The installed executable passed 1,000 PTY writes with launcher exit,
  reconnect, exact completion, 1.598 ms median input latency, and 1.819 ms p95.
- `/Applications/Atelier.app` reports 0.1.87 and passes strict local signature
  verification.
- Final DMG: `Atelier_0.1.87_aarch64.dmg`, 11,286,412 bytes, SHA-256
  `ad6ec9196b2c66424dccced4c926ba5dd89efd8415dc6bcab1e63feda5d16677`.

Remaining truth boundary:

- Native Windows Actions now contain the full gates, but a physical Windows
  browser-auth, signed-installer update-survival, and Smart App Control run is
  still required before claiming Windows distribution completion.
- The macOS package uses the local hardened-runtime identity. Public macOS
  distribution still requires Developer ID signing and Apple notarization.

## 2026-07-11 Agent Lifecycle, Isolation, and Preview Evidence

Implemented:

- Added a common adapter dispatch path for Claude Code, Codex, Hermes, and
  Gajae Code with seven normalized lifecycle phases and exactly-once terminal
  state.
- Added optional task worktrees under Atelier application data. Production code
  contains no reset, delete, auto-remove, or automatic merge path.
- Attached worktree branch/path/source-dirty facts and localhost preview health,
  HTTP/title, service, and recent bridge evidence to the corresponding task.
- Made the supervisor smoke write count configurable and fixed descriptor
  cleanup to wait for the detached supervisor process to exit.
- Forced accepted supervisor request sockets into bounded blocking I/O. This
  prevents a listener-inherited transient `WouldBlock` from failing a valid
  high-frequency request.
- Added responsive composer constraints so the task input remains usable after
  the navigation rails collapse in a minimum-size window.
- Prepared an isolated worktree before a preview-only start, and bound final
  preview evidence to the post-run URL so an older DOM/screenshot result cannot
  be attached to a different preview address.
- Added a distinct-task worktree regression in addition to same-task reuse.
- Removed the Windows `cmd.exe start` browser fallback, compiled Microsoft
  Store builds without the updater feature, and pinned every GitHub Action to a
  full commit SHA.

Source validation evidence:

- All 67 Rust tests, strict clippy, Rust formatting, and native build passed.
- The real Git fixture test preserved an uncommitted source edit, created an
  external isolated worktree from committed HEAD, reused that task worktree on
  the second preparation, and created a distinct branch/path for another task.
- The 1,000-write supervisor run reconnected successfully, restored ordered
  output, exited with code 0, and measured 1.66 ms median / 1.92 ms p95 input
  latency. A second 2,000-write run passed at 1.63 ms median / 2.15 ms p95.
- Agent fixture harness, npm production audit, release security audit, and
  RustSec audit passed with zero known vulnerabilities.
- Browser measurements at 720 x 620 and 560 x 420 reported document dimensions
  equal to the viewport. The final 560 x 420 regression kept the composer at
  y=420 and the send control at y=403 without document scrolling.
- Both normal and `store-build` Rust configurations passed all 67 tests and
  strict clippy. `actionlint`, diff hygiene, agent fixtures, npm production
  audit, release policy audit, and RustSec audit also passed.

Package and installed-app evidence:

- `npm run tauri:build` produced
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.86_aarch64.dmg`.
- The final DMG is 11,282,284 bytes with SHA-256
  `9f725d343f9ce751c5f737994edd063a787653934445b7d47c1d5d91bf92e37a`.
- macOS permission metadata and entitlements now enter the bundle before Tauri
  signs it. The package gate mounts the finished DMG and verifies the embedded
  app's strict signature and required Info.plist keys instead of modifying only
  the loose app after DMG creation.
- The packaged executable passed 1,000 writes at 1.55 ms median / 2.33 ms p95.
- `/Applications/Atelier.app` reports 0.1.86, satisfies strict local signature
  verification, and its installed executable passed 1,000 writes at 1.56 ms
  median / 2.45 ms p95.
- Launch Services identifies the foreground application as bundle
  `com.atelier.app`, version 0.1.86, executable
  `/Applications/Atelier.app/Contents/MacOS/atelier`. CoreGraphics reports its
  1600 x 900 Atelier window and WebKit child processes. Desktop capture was
  unavailable to the shell because macOS screen/accessibility permission was
  not granted, so no visual screenshot is claimed.

Remaining truth boundary:

- Physical Windows browser-auth, update-survival, and Smart App Control remain
  device validation requirements; macOS evidence cannot satisfy them.

## 2026-07-11 Orca-Informed Runtime Foundation

Reviewed:

- Compared Atelier's current Tauri PTY and structured-agent runtime with Orca's
  background PTY, bounded output, hidden-session, agent adapter, worktree,
  hook, and remote-continuity architecture.
- Chose selective adoption instead of an Electron fork or unrestricted default
  execution. The active contract is
  `SOT/service-factory/orca-adoption-roadmap.md`.

Implemented:

- Added a bounded 64-entry PTY output queue between the native reader and Tauri
  event bridge.
- Increased native reads to 8 KiB and coalesced output up to 64 KiB or 8 ms per
  event, preserving append-only logs when the renderer disconnects.
- Reused one streaming UTF-8 decoder for frontend metadata inspection while
  retaining original bytes for xterm rendering.
- Added a shared provider registry for Claude Code, Codex, Hermes, and Gajae
  Code, then routed structured chat and safe CLI dispatch through the same
  provider parser.
- Bumped release metadata to 0.1.82.
- Added per-session PTY transport counters and a structured replay snapshot
  command, then advanced the release candidate to 0.1.83. The counters
  distinguish bytes read, emitted, queued, maximum queued, and bridge-dropped.
- Added monotonic output sequences, renderer acknowledgements, bounded replay
  snapshots, gap recovery, and persisted live-session reclamation for the
  0.1.84 warm-reattachment release candidate.

Validation evidence:

- Sustained-output regression passed with 256 bounded-queue chunks and exact
  byte/order preservation.
- All 57 Rust library tests passed.
- Frontend production build and TypeScript checks passed.
- `cargo clippy --all-targets -- -D warnings` passed.
- Agent fixture harness and release security audit passed; the audit reports
  zero RustSec vulnerabilities and no long-lived cross-provider token fan-out.
- `npm run tauri:build` produced
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.82_aarch64.dmg`.
- `/Applications/Atelier.app` reports 0.1.82, passes strict signature
  verification, uses hardened runtime, and runs from the installed bundle.
- Installed-app visual evidence:
  `/tmp/atelier-0.1.82-installed.png`.
- The transport-counter reconciliation test verifies emitted plus dropped bytes
  drain the observable queue without underflow.
- All 58 Rust library tests, frontend build, strict clippy, fixture harness, and
  release security audit passed for 0.1.83.
- `npm run tauri:build` produced
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.83_aarch64.dmg`.
- `/Applications/Atelier.app` reports 0.1.83, passes strict signature
  verification, runs from the installed bundle, and owns a 1600 x 900 main
  window.
- macOS logged framework-level AppIntents and WebKit sandbox service-denial
  diagnostics during launch, but no Rust panic or process termination occurred.
- All 60 Rust library tests, frontend production build, Rust formatting, and
  strict clippy passed for the 0.1.84 warm-reattachment source candidate.
- `npm run tauri:build` produced
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.84_aarch64.dmg`.
- `/Applications/Atelier.app` reports 0.1.84, passes strict signature
  verification, runs from the installed bundle, and owns a 1600 x 900 main
  window.
- Agent fixture harness and the release security audit passed for 0.1.84; the
  latter reports zero RustSec vulnerabilities and no long-lived
  cross-provider token fan-out.
- Installed-app visual evidence:
  `/tmp/atelier-0.1.84-installed.png`.
- Added the 0.1.85 detached PTY supervisor source candidate and kept the
  previous in-process PTY backend as a startup fallback.
- A real headless-process smoke reconnected after the original client closed,
  recovered `supervisor-ready` and `supervisor-done` in order, observed exit
  code 0, and cleaned the completed session without a stale-process error.
- The repeatable cross-platform supervisor harness measured 1.58 ms median and
  2.15 ms p95 input IPC latency across 100 requests on macOS.
- The Unix detach regression proves the supervisor owns a process session
  distinct from the app shell. Release and Store workflows now run the same
  supervisor harness on Windows before packaging.
- `npm run tauri:build` produced
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.85_aarch64.dmg`.
- The packaged and installed 0.1.85 executables both passed the supervisor
  reconnect harness. The installed run measured 1.32 ms median / 1.40 ms p95
  input IPC latency, returned exit code 0, and restored the complete ordered
  output journal.
- `/Applications/Atelier.app` reports 0.1.85, passes strict local signature
  verification, runs from the installed bundle, and owns a 1600 x 900 main
  window after activation.
- Installed-app visual evidence:
  `/tmp/atelier-0.1.85-installed.png`.
- A macOS-hosted `x86_64-pc-windows-msvc` check reached native crypto
  dependencies but could not continue because the host has no Windows SDK
  headers (`windows.h`, `assert.h`). Windows source/package truth therefore
  remains assigned to the Windows Actions and physical-device gates.

Honest boundary:

- Physical Windows validation remains a later release gate.
- The macOS app is locally signed, not Apple Developer ID notarized.

## 2026-07-11 Composer Menu Unification

Implemented:

- Replaced the Hermes provider, non-Codex model, workload, permission, and bug
  report area native menus with one shared `ComposerSelectMenu` surface.
- Standardized composer option text at 11 px, rows at 36 px, selected checks,
  borders, dark/light colors, viewport-aware placement, and bounded scrolling.
- Matched the existing Codex reasoning/model/speed menu to the same compact
  typography and row geometry.
- Bumped the local release candidate metadata to 0.1.81.

Validation evidence:

- Frontend build, fixture harness, Rust fmt/clippy, all 51 Rust tests, npm
  production audit, release audit, actionlint, and diff hygiene passed.
- `npm run tauri:build` produced `Atelier_0.1.81_aarch64.dmg`.
- `/Applications/Atelier.app` reports 0.1.81, passes strict code-signature
  verification, and is running from the installed bundle.
- Installed-app visual checks show the same compact menu treatment for Hermes
  provider, permission, Codex model hierarchy, and workload:
  - `/tmp/atelier-0.1.81-provider-menu.png`
  - `/tmp/atelier-0.1.81-permission-menu.png`
  - `/tmp/atelier-0.1.81-model-menu.png`
  - `/tmp/atelier-0.1.81-workload-menu.png`

## 2026-07-11 Agent Turn Cancellation

Implemented:

- Added an explicit square stop control beside live agent activity and in the
  composer action row for every active turn.
- Connected both controls to the existing `agent_cancel` command with visible
  stopping and failure states.
- Started each Unix agent CLI in its own process group and changed cancellation
  to terminate that group, covering subprocesses spawned by agent tool calls.
- Bumped the local release candidate metadata to 0.1.80.

Validation evidence:

- Frontend build, fixture harness, Rust fmt/clippy, release audit, and all 51
  Rust tests passed.
- `terminate_agent_pid_stops_agent_process_group` proves an agent shell and its
  inherited child process exit through the cancel path.
- `npm run tauri:build` produced `Atelier_0.1.80_aarch64.dmg`.
- `/Applications/Atelier.app` reports 0.1.80, passes strict code-signature
  verification, and is running from the installed bundle.

## 2026-07-10 Release Stability and OAuth Hardening

Observed failure classes:

- Windows provider subscription buttons could leave the app waiting without a
  browser round trip.
- Long provider OAuth URLs could wrap in a narrow pseudo-terminal and lose
  query parameters such as `redirect_uri`, `state`, or PKCE values.
- Provider credentials had spread across Atelier, Claude Code, Gajae, and
  Hermes ownership boundaries.
- Missing permission state inherited a full-access default.
- Windows release publication did not have enough package-content and signed
  artifact proof.

Implemented:

- Wide OAuth PTY, provider-scoped HTTPS URL extraction, native Windows browser
  fallback, shared Windows CLI resolver, and visible login failure/timeout
  states.
- Atelier-owned Claude subscription cache/refresh; no direct external Claude
  Code keychain read.
- Per-process Gajae Claude OAuth and temporary Hermes Codex access staging with
  post-run scrub.
- Automatic workspace permission as the safe default and current Codex global
  sandbox/approval arguments.
- Windows MSI/NSIS/MSIX package smoke, optional Authenticode enforcement,
  strict provider-install smoke, and no unsigned publication fallback.
- Release dependency audit and Tauri release build without devtools.

Validation evidence:

- Build, fixture harness, production npm audit, Rust fmt/clippy/test (50 tests),
  release audit, actionlint, and diff hygiene passed.
- Real Claude subscription and Codex ChatGPT provider smokes passed with
  explicit supported models.
- Version metadata is consistent at 0.1.79.
- `/Applications/Atelier.app` reports 0.1.79, passes local code-signature
  verification, and is running from the installed bundle.
- `Atelier_0.1.79_aarch64.dmg` was produced.
- The installed app was reduced to a 560 px-wide workspace and the Codex model
  menu remained inside the viewport. Its model panel displayed GPT-5.5,
  GPT-5.6 Sol/Terra/Luna, GPT-5.4, GPT-5.4 Mini, and GPT-5.3 Codex Spark.
- Switching between reasoning/model/speed panels now resets the independent
  menu scroll position so a previously scrolled panel cannot hide model rows.
- Removed the composer's own scroll container while preserving long-text
  scrolling inside the textarea. Slash commands now render in a viewport-level
  portal so removing composer overflow does not clip the command list.
- Removed the code/terminal navigation item and migrated saved `main` or
  `terminal` navigation state back to Sessions. The installed app was visually
  checked with the terminal icon absent and the slash menu visible.

Honest boundary:

- Gatekeeper rejects the locally signed app because it is not Developer ID
  signed/notarized.
- Physical Windows OAuth and Smart App Control behavior were not executed on
  this macOS host and remain validation-required.

## 2026-05-28 Stella Factory Baseline

Observed repository state:

- No existing `SOT/` directory was present.
- `package.json` exposes build, Tauri, harness, Windows Store, and provider smoke
  scripts.
- `README.md` still describes the earlier GUI terminal positioning and does not
  fully reflect the structured AgentWorkspace.
- `src/components/AgentWorkspace.tsx` contains the main structured autonomous
  workspace surface.
- `src/components/Main.tsx` preserves the xterm PTY terminal surface.
- `src-tauri/src/agent.rs` contains Claude, Codex, Hermes, preview service,
  change summary, and CLI validation logic.
- `docs/atelier-agent-harness.md` documents provider adapter checks.

Patch intent:

- Preserve existing terminal and agent behavior.
- Add a Stella Factory autonomous-development contract.
- Make `/goal`, `/analyze`, `/probe`, and `/audit` route through the existing
  agent workspace instead of creating a separate app flow.

## 2026-05-28 Stella Factory Runtime Core

Implemented runtime-level Factory support:

- Added `src-tauri/src/stella.rs` with project analysis, workspace probe, SOT
  evidence append, and prompt safety guard.
- Registered Tauri commands:
  - `stella_project_analysis`
  - `stella_workspace_probe`
  - `stella_record_evidence`
- Added backend guard before `agent_send` and `agent_claude_send` spawn provider
  CLIs.
- Added frontend wiring so Factory commands attach local project evidence before
  provider execution.
- Added SOT recording after Factory agent turns finish or fail.

Validation evidence:

- `npm run build` passed.

## 2026-07-15 UI Duplication Audit And Hierarchy Cleanup

Reflected product corrections:

- Removed the repeated workspace path field from the task header. The Code
  workbench remains the single place for rooted path navigation and file
  breadcrumbs.
- Kept one global Terminal entry and one live Preview control while renaming
  the settings release surface to `Patch & feedback` so it is not mistaken for
  the live preview.
- Assigned distinct icons to Sessions, Profiles, Plugins & Skills, Code,
  Changes, release feedback, and isolated worktrees.
- Retained the shared chevron only for controls with the same dropdown
  interaction, such as model and workload selectors.

Validation evidence:

- `npm run smoke:workbench` passed 21 workbench contract checks, including
  single-terminal, no-header-CWD, rooted-Code-breadcrumb, and unique-navigation
  icon contracts.
- `npm run build` passed with 342 transformed modules.
- Playwright wide and compact viewport audits found no repeated global
  navigation icon signatures. The only repeated visible button signature was
  the intentional dropdown chevron shared by model and workload selectors.
- Playwright confirmed the task header contains zero `작업 폴더` labels and the
  Code workbench still renders rooted navigation controls.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed all 90 Rust tests.
- Terminal layout, diff review, preview URL, agent performance, and updater
  contract smoke tests passed.
- `npm run audit:release` reported zero RustSec vulnerabilities in the release
  dependency graph.
- `npm run tauri:build` produced signed `Atelier.app` and
  `Atelier_0.2.9_aarch64.dmg` bundles.
- `/Applications/Atelier.app` was replaced only after its prior bundle was
  backed up under `/tmp`. The installed binary hash matched the build binary,
  strict code-sign verification passed, and two consecutive renderer-ready
  restart probes plus the final live launch reported app version `0.2.9`.

## 2026-07-14 Terminal Surface And Restart Rendering

Release decision:

- Kept one user-facing Terminal workspace in the global navigation.
- Removed the duplicate Terminal button beside Preview in the agent workspace;
  Quick Open can still navigate to the global Terminal workspace.
- Deferred xterm and Canvas renderer creation while Main is hidden or has a
  zero-size host, and added ResizeObserver-based refitting after activation.

Validation evidence:

- `npm run smoke:terminal-layout` passed with `hiddenRendererDeferred: true`.
- `npm run smoke:workbench` passed the single-terminal, hidden-initialization,
  and resize-observer contracts.
- `npm run build` passed.
- Playwright started on Sessions with zero `.xterm` nodes, opened Terminal at
  928 x 855 with a 910 x 855 canvas, returned to Sessions, and reopened the
  same measurable terminal surface after a simulated restart.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed 90 tests.
- `npm run tauri:build` produced signed `Atelier.app` and
  `Atelier_0.2.8_aarch64.dmg` artifacts.
- `/Applications/Atelier.app` was replaced with 0.2.8; package and installed
  executable SHA-256 values matched, and two consecutive installed-app
  renderer-ready probes returned `status: ready` from distinct process IDs.

## 2026-07-14 Orca-Informed Local Workbench 0.2.7

Implemented product surfaces:

- Added persistent multi-tab task-rooted editing with dirty-state retention,
  dirty-close confirmation, direct diff navigation, and explicit safe save.
- Promoted Source control to a functional workspace with staged/unstaged state,
  branch/upstream and ahead/behind metadata, per-file and bulk stage/unstage,
  recent commit history, unified diff inspection, and explicit manual commit.
- Replaced split Quick Open behavior with one `Cmd/Ctrl+P` palette for tasks,
  active task/worktree files, and workspace commands.
- Kept automatic commit, discard/reset, database/data deletion, production
  deployment, and unrestricted remote actions outside the workflow.

Verification evidence:

- `cargo test --manifest-path src-tauri/Cargo.toml`: 90 passed, 0 failed.
  Tests include a real temporary Git repository and reject traversal/absolute
  paths for stage and unstage requests.
- `npm run build`: passed; 342 modules transformed.
- `npm run smoke:workbench`: 10/10 contracts passed.
- `npm run smoke:agent-performance`: passed.
- `npm run smoke:pty-supervisor`: three sessions reattached; 100 input writes,
  median 1.628 ms and p95 1.863 ms.
- Terminal layout, diff review, preview URL, updater contract, and release
  security smokes passed. RustSec reported 0 vulnerabilities; upstream audit
  metadata still reports 17 unmaintained and 2 unsound warnings.
- Playwright rendered Conversation, Code, Source control, and unified Quick
  Open at 1440x960. At 900x720, document `scrollWidth == clientWidth` and
  `scrollHeight == clientHeight`; the navigation reduced to the compact icon
  rail without page overflow.
- Built and locally signed `Atelier_0.2.7_aarch64.dmg`; strict bundle signature
  verification passed.
- Replaced `/Applications/Atelier.app` only after preserving the prior bundle
  at `/tmp/Atelier.app.pre-orca-workbench-20260714-032525`.
- Packaged and installed executable SHA-256:
  `94770ab8aa5913b91fb2b986f30056b92fed5b2260525f347fe7d212bcabba83`.
- Installed renderer receipt reported app version `0.2.7`, window `main`, and
  status `ready` from `/Applications/Atelier.app/Contents/MacOS/atelier`.

Release boundary:

- This is a validated macOS local beta slice, not total Orca parity.
- Physical Windows browser authentication, updater survival, signing, and
  Smart App Control remain external release gates and are not claimed from a
  macOS cross-build or source inspection.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests.
- `npm run harness:fixture` passed.
- `git diff --check` passed.
- `npm run tauri:build` passed and produced:
  - `src-tauri/target/release/bundle/macos/Atelier.app`
  - `src-tauri/target/release/bundle/dmg/Atelier_0.1.36_aarch64.dmg`

## 2026-05-28 Installed Build and Release Version

- Version bumped to `0.1.37` for this Stella Factory patch upload.
- `npm run tauri:build` passed for `0.1.37`.
- `/Applications/Atelier.app` was replaced with the `0.1.37` app bundle and
  passed `codesign --verify --deep --strict`.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests on `0.1.37`.
- Local release asset:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.37_aarch64.dmg`.

## 2026-05-28 Visible Factory Controls

User-visible follow-up:

- Added an always-visible `Stella Factory` action strip above the AgentWorkspace
  prompt.
- Added quick actions for `/goal`, `/analyze`, `/probe`, and `/audit` so the
  Factory capability is visible without needing to remember slash commands.
- Version bumped to `0.1.38` for the visible UI follow-up.

Validation evidence:

- `npm run build` passed before packaging.
- `npm run tauri:build` passed for `0.1.38`.
- `/Applications/Atelier.app` was replaced with the `0.1.38` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.38`.
- Visual app check:
  `/tmp/atelier-work-ax3-038.png` shows the `Stella Factory` action strip.
- Interaction check:
  `/tmp/atelier-work-goal-ax-038.png` shows the `목표` quick action filling
  `/goal` in the prompt.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests on `0.1.38`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-27T19-22-29-033Z.json`.

## 2026-05-28 Factory On-Demand Default

User-visible follow-up:

- Changed the default Atelier ontology mode from `stella` to `direct`.
- Stopped prepending the Stella Factory autonomous-development contract to every
  normal agent prompt.
- The Factory contract and preflight evidence now apply only when a Factory
  command is used: `/goal`, `/analyze`, `/probe`, or `/audit`.
- Existing sessions created under the old always-on Stella default are migrated
  once to `direct`, so Factory is no longer silently active in old task tabs.
- Updated the prompt action strip label to show Factory is on demand:
  `필요 시 Stella Factory`.
- Version bumped to `0.1.39` for this behavior change.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests on `0.1.39`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-27T20-51-34-733Z.json`.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.39_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.39` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.39`.
- Visual app check:
  `/tmp/atelier-factory-on-demand-039.png` shows `필요 시 Stella Factory`.

## 2026-05-28 Factory Button Press State

User-visible follow-up:

- Changed the Factory strip label from a filled chip to plain muted text so it
  no longer looks permanently enabled.
- Factory quick buttons now show a pressed state only while the prompt starts
  with their matching command: `/goal`, `/analyze`, `/probe`, or `/audit`.
- Pressing the active quick button again removes the Factory command prefix and
  returns the strip to the unpressed state.
- Version bumped to `0.1.40` for this visible interaction fix.

Validation evidence:

- `npm run build` passed.
- Headless Chrome visual check:
  `/tmp/atelier-factory-default-off.png` shows the default Factory strip with no
  pressed quick action.
- Headless Chrome interaction check:
  before pressing Factory quick actions, `aria-pressed` was `[]`; after pressing
  `목표`, `aria-pressed` was `["목표"]` and the prompt value was `/goal `.
- Visual active-state check:
  `/tmp/atelier-factory-goal-active.png` shows only the `목표` quick action in
  the pressed state.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests on `0.1.40`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-27T22-40-20-271Z.json`.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.40_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.40` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.40`.

## 2026-05-28 Factory Main Toggle Button

User-visible follow-up:

- Changed the `필요 시 Stella Factory` label into a real toggle button.
- The Factory main button now uses the same pressed/unpressed visual behavior as
  the Goal/Analyze/Probe/Audit quick buttons.
- Pressing the Factory main button turns on the default `/goal` Factory mode;
  pressing it again clears the active Factory command.
- Version bumped to `0.1.41` for this interaction fix.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed
  23 tests on `0.1.41`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-27T23-16-03-514Z.json`.
- Headless Chrome main-toggle interaction check:
  before press `aria-pressed` was `[]`, after pressing `필요 시 Stella Factory`
  it was `["필요 시 Stella Factory", "목표"]` with prompt value `/goal `, and
  after pressing it again `aria-pressed` returned to `[]` with an empty prompt.
- Visual checks:
  `/tmp/atelier-factory-main-default-041.png`,
  `/tmp/atelier-factory-main-active-041.png`,
  `/tmp/atelier-factory-main-cleared-041.png`.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.41_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.41` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.41`.

## 2026-05-31 Hermes-Like Desktop Shell

User-visible follow-up:

- Replaced the top segmented chrome with a Hermes-style left desktop sidebar.
- Preserved the existing mounted Atelier work surfaces: structured agent chat,
  workbench/code-preview, design mode, and settings.
- Added sidebar entries for Chat, Sessions, Workbench, Design, Models, Skills,
  Providers, Profiles, Gateway, Updates, and Settings.
- Connected Providers/Gateway/Profiles/Updates/Settings sidebar entries to the
  matching Settings sections instead of creating empty placeholder screens.
- Persisted the selected sidebar module and Settings section so refresh/reopen
  does not show mismatched navigation state.
- Version bumped to `0.1.42` for this shell update.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed 23 tests on
  `0.1.42`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-30T18-07-43-043Z.json`.
- Browser visual check:
  `/tmp/atelier-hermes-shell-v1-updated.png` shows the Hermes-style sidebar in
  the dev build.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.42_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.42` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.42`.
- Installed app visual check:
  `/tmp/atelier-installed-0.1.42-shell.png` shows the shell running from
  `/Applications/Atelier.app`.

## 2026-05-31 Single Settings Navigation

User-visible follow-up:

- Removed the nested Settings sidebar that duplicated the new global left
  navigation.
- Moved Settings subsections into the global sidebar: Appearance, Terminal,
  Profiles, Providers, Preview, Shortcuts, and Updates.
- Removed the temporary Gateway duplicate because it opened the same Connections
  surface as Providers.
- Migrated saved `settings` and `gateway` nav IDs to `appearance` and
  `providers` so older local state does not leave the sidebar without an active
  item.
- Version bumped to `0.1.43` for this navigation cleanup.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed 23 tests on
  `0.1.43`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-30T18-44-32-150Z.json`.
- Browser visual check:
  `/tmp/atelier-settings-single-nav.png` shows a single left navigation and a
  settings content pane without the second sidebar.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.43_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.43` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.43`.
- Installed app visual check:
  `/tmp/atelier-installed-0.1.43-single-settings-nav.png` shows the cleaned
  single-sidebar settings view.

## 2026-05-31 Stella Factory Direction Surface

User-visible follow-up:

- Added `Factory` to the global Intelligence navigation so Stella Factory is a
  first-class Hermes Desktop-style workspace area, not a hidden slash-command
  feature.
- Added a visible Stella Factory brief to the task pane. It explains that
  Factory is on demand and provides two prompt presets:
  - `Set direction` / `방향 잡기` seeds a `/goal` request for evolving Atelier
    toward a Hermes Desktop-like local autonomous development workspace.
  - `Analyze current app` / `현재 앱 분석` seeds a `/analyze` request that
    preserves the existing app before deciding what to upgrade.
- Kept Factory off by default. Direct Claude, Hermes, and Codex sessions still
  run without Factory wrapping unless the user chooses a Factory action.
- Version bumped to `0.1.44` for this direction-surface patch.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed 23 tests on
  `0.1.44`.
- `npm run harness:fixture` passed and wrote:
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-30T19-14-39-815Z.json`.
- Browser visual check:
  `/tmp/atelier-0.1.44-factory-brief-browser.png` shows the global `Factory`
  navigation item plus the task-pane Stella Factory brief and presets.
- `npm run tauri:build` passed and produced:
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.44_aarch64.dmg`.
- `/Applications/Atelier.app` was replaced with the `0.1.44` app bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.44`.

## 2026-05-31 Navigation and Plugin Catalog Cleanup

User-visible follow-up:

- Removed duplicate left navigation entries that pointed to the same agent
  workspace:
  - `Chat` was merged into `Sessions`.
  - `Models` was removed from the left nav because model selection already
    lives in the chat composer.
  - `Factory` was removed from the left nav because the Stella Factory brief
    already lives above the task list and remains on demand.
- Renamed `Skills` into a dedicated `Plugins & Skills` workspace screen.
- Moved the Academic Research plugin install card out of the task list and into
  the new `Plugins & Skills` screen.
- Split the new screen into:
  - installable plugins
  - built-in skills
- Version bumped to `0.1.45` for this navigation/catalog cleanup.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed: 23 tests.
- `npm run harness:fixture` passed and wrote
  `src-tauri/target/atelier-harness/atelier-agent-harness-2026-05-31T01-53-47-659Z.json`.
- Browser visual checks:
  - `/tmp/atelier-0.1.45-nav-sessions.png` confirms the left nav no longer
    shows duplicate `Chat`, `Models`, or `Factory` entries.
  - `/tmp/atelier-0.1.45-plugin-skills.png` confirms the dedicated
    `Plugins & Skills` screen separates plugins from built-in skills.
- `npm run tauri:build` passed and produced:
  - `src-tauri/target/release/bundle/macos/Atelier.app`
  - `src-tauri/target/release/bundle/dmg/Atelier_0.1.45_aarch64.dmg`
- `/Applications/Atelier.app` was replaced with the 0.1.45 bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.45`.

## 2026-05-31 Stella Factory Autonomy Contract Correction

Root-cause follow-up:

- Confirmed that Factory was documented and implemented as an on-demand
  slash-command wrapper, so broad goals could be compressed into one feature
  task and then marked complete.
- Added natural-language Factory invocation for `스텔라 팩토리` / `Stella
  Factory` so the phrase routes to the Factory goal path instead of a normal
  direct provider message.
- Expanded the Factory prompt contract to classify broad product/service
  evolution goals as durable Service Factory runs.
- Required product-scale Factory artifacts:
  `SOT/service-factory-state.json`, mission charter, research dossier,
  capability map, agent topology, roadmap, QC matrix, and readiness report.
- Added the rule that a single feature implementation is only a milestone
  result, not a Factory completion, unless readiness proves the declared product
  goal is actually satisfied.

Validation evidence:

- `python3 ~/.claude/skills/stella/scripts/stella_ontology.py validate` passed.
- `python3 ~/.claude/skills/stella/scripts/stella_ontology.py normalize
  '스텔라 팩토리. Atelier를 Antigravity급 로컬 자율 개발 워크스페이스로 고도화해.'`
  routes to `service-factory` with product-wide done_when and stop rules.
- `npm run build` passed for the updated Atelier frontend.

## 2026-05-31 Stella Factory Bootstrap Runtime

Runtime follow-up:

- Added the `stella_factory_bootstrap` Tauri command.
- Factory `goal` and `analyze` requests now create or resume
  `SOT/service-factory-state.json` before the provider turn starts.
- The bootstrap seeds required product-scale artifacts under
  `SOT/service-factory/`: mission charter, research dossier, capability map,
  agent topology, roadmap, QC matrix, readiness report, and progress log.
- Factory preflight evidence now includes state path, artifact creation counts,
  readiness, and next executable actions.
- Added a Rust test proving the bootstrap creates state and required artifacts
  in a home-scoped workspace.
- Bootstrapped the active Atelier factory run through the Stella service-factory
  bridge. The resulting state is valid, generated 12 agent requests, dispatched
  the first product-manager request into an isolated worktree, and assessed the
  current readiness as `foundation_ready_but_not_autonomous`.

Validation evidence:

- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed 24
  tests.
- `npm run build` passed.

## 2026-05-31 Atelier Product Upgrade: Visible Factory Status

Product change:

- Added a Tauri command, `stella_factory_status`, that reads the active
  `SOT/service-factory-state.json` for the current workspace and returns a
  compact app-ready summary.
- Wired the Agent Workspace composer to load and refresh the Factory state.
- Added a visible Factory status strip showing readiness, Stella -> Release
  control, AgentBlueprint count, AgentInstance count, done/open stages, blocker,
  and next step.
- The status strip is read-only and does not mutate Factory state.

Validation evidence:

- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed 24
  tests.

## 2026-05-31 Stella Factory Autopilot Hardening

Review follow-up:

- Ran independent reviewer and security subagents against the managed autopilot
  changes.
- Fixed the first-run schema mismatch by making Tauri bootstrap initialize the
  Release Service Factory schema when the release script exists.
- Hardened state trust:
  - unknown preserved request entries are dropped during planning
  - `prompt_path` must be project-relative and cannot escape the workspace
  - invalid existing state is not blindly trusted by the Stella bridge
- Hardened child result trust:
  - child `result.json` must match `request_id`, `run_id`, and artifact dir
  - referenced artifacts must exist under allowed roots
  - command evidence must include structured argv and return code data
- Removed false-green readiness from no-cost local workers. Mandatory
  verification/security/deployment/final-audit stages now require specialist or
  validation-resolution evidence.
- Limited managed autopilot side effects to Factory goal mode; `/analyze` now
  remains analysis-only preflight.

Validation evidence:

- `python3 -m py_compile ~/.claude/skills/release/scripts/service_factory.py
  ~/.claude/skills/release/scripts/service_factory_local_worker.py
  ~/.claude/skills/stella/scripts/stella_service_factory.py` passed.
- `python3 ~/.claude/skills/release/scripts/service_factory.py autopilot
  --project /Users/kansic/Service/atelier --goal "Atelier Stella Factory smoke
  rerun" --max-cycles 2 --pretty` no longer reports a false green without
  specialist evidence.
- Attached reviewer, critic, Probe, security, deployment, and final-audit
  evidence through `resolve-validation --force`.
- Final assessment is `pilot_ready` with readiness score `0.95`, blocker
  `null`, and no open mandatory verification-chain requests.
- `npm run tauri:build` passed and produced
  `src-tauri/target/release/bundle/macos/Atelier.app` plus
  `src-tauri/target/release/bundle/dmg/Atelier_0.1.45_aarch64.dmg`.
- `/Applications/Atelier.app` was updated from the new bundle with `ditto`.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `strings /Applications/Atelier.app/Contents/MacOS/atelier | rg
  "stella_factory_autopilot|stella_factory_bootstrap"` confirms the installed
  binary includes the new Factory commands.
- `python3 ~/.claude/skills/stella/scripts/stella_service_factory.py status
  --project /Users/kansic/Service/atelier --pretty` passed validation and wrote
  `SOT/service-factory/antigravity-readiness.md`.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed: 23 tests.

## 2026-05-31 Stella Factory Managed Autopilot Runtime

Runtime follow-up:

- Added a managed `autopilot` command to the Release Service Factory script and
  the Stella bridge wrapper.
- Added a no-cost local worker backend that can execute queued
  `agent_requests`, write durable `result.json` files, create stage artifacts,
  run factory validation, and leave residual-risk notes when specialist LLM
  agents are still required.
- Added the `stella_factory_autopilot` Tauri command and wired Factory
  `goal` preflight to run the managed cycle after bootstrap.
- Updated the Factory prompt contract so providers must run the managed bridge
  cycle before claiming completion.
- Ran the active Atelier Factory through managed requests, then attached
  specialist validation evidence for mandatory review/security/probe/release
  stages. Readiness is now `pilot_ready` with score `0.95`, blocker `null`,
  managed backend `spawn_runtime_command`, and recovery proof.

Validation evidence:

- `python3 -m py_compile ~/.claude/skills/release/scripts/service_factory.py
  ~/.claude/skills/release/scripts/service_factory_local_worker.py
  ~/.claude/skills/stella/scripts/stella_service_factory.py` passed.
- `python3 ~/.claude/skills/stella/scripts/stella_service_factory.py autopilot
  --project /Users/kansic/Service/atelier ... --max-cycles 12 --pretty`
  completed with `verdict: pilot_ready`.
- `python3 ~/.claude/skills/release/scripts/service_factory.py validate
  --project /Users/kansic/Service/atelier --pretty` passed.
- `python3 ~/.claude/skills/release/scripts/service_factory.py assess
  --project /Users/kansic/Service/atelier --write-report --pretty` reports
  `readiness_score: 0.95`, `verdict: pilot_ready`, `primary_blocker: null`.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed 24
  tests.
- `npm run build` passed.

## 2026-05-31 Stella Factory Final Queue Closure

Runtime follow-up:

- Resolved `parallel_implementation::builder` with actual implementation
  evidence in `SOT/service-factory/implementation-report.md`.
- Re-ran factory validation and readiness assessment after the queue closure.
- Active Factory request counts are now `done: 11`, `queued: 0`,
  `in_progress: 0`, `blocked: 0`, and `validation_required: 0`.

Validation evidence:

- `python3 ~/.claude/skills/release/scripts/service_factory.py validate
  --project /Users/kansic/Service/atelier --pretty` passed.
- `python3 ~/.claude/skills/release/scripts/service_factory.py assess
  --project /Users/kansic/Service/atelier --write-report --pretty` reports
  `readiness_score: 0.95`, `verdict: pilot_ready`, `primary_blocker: null`.
- `python3 ~/.claude/skills/release/scripts/service_factory.py status
  --project /Users/kansic/Service/atelier --pretty` reports no next queued
  request.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed 24
  tests after formatting.
- `npm run tauri:build` passed after the final formatting pass.
- `/Applications/Atelier.app` was refreshed from the final macOS bundle,
  re-signed, and verified with
  `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`.

## 2026-05-31 Stella Factory State-Plan-Execute Contract

Runtime follow-up:

- Added the mandatory Stella Factory development order:
  `current_state -> development_plan -> execution_verification`.
- Updated frontend Factory prompts so broad goals cannot jump straight into
  implementation before current-state discovery and goal-to-plan strategy.
- Updated Tauri bootstrap to seed `current-state.md` and
  `development-plan.md` artifacts.
- Updated Release Service Factory stages, agent prompts, execution plan,
  readiness assessment, handoff, and review reports to carry the same contract.
- Completed the active `current_state::state_mapper` and
  `development_plan::strategy_planner` requests through the managed bridge.

Validation evidence:

- `python3 -m py_compile ~/.claude/skills/release/scripts/service_factory.py
  ~/.claude/skills/release/scripts/service_factory_local_worker.py
  ~/.claude/skills/stella/scripts/stella_service_factory.py` passed.
- `python3 ~/.claude/skills/stella/scripts/stella_service_factory.py autopilot
  --project /Users/kansic/Service/atelier --goal "Stella Factory development
  method upgrade..." --max-cycles 8 --max-requests 1 --pretty` completed.
- `python3 ~/.claude/skills/release/scripts/service_factory.py status
  --project /Users/kansic/Service/atelier --pretty` reports `done: 13`,
  `queued: 0`, `blocked: 0`, and no next queued request.
- `python3 ~/.claude/skills/release/scripts/service_factory.py validate
  --project /Users/kansic/Service/atelier --pretty` passed.
- `python3 ~/.claude/skills/release/scripts/service_factory.py assess
  --project /Users/kansic/Service/atelier --write-report --pretty` reports
  `readiness_score: 0.96`, `verdict: pilot_ready`, `primary_blocker: null`,
  and `state_plan_execute_contract: ready`.
- `npm run build` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed 24
  tests.
- `npm run tauri:build` passed and produced the macOS app bundle plus DMG.
- `/Applications/Atelier.app` was refreshed from the final bundle, re-signed,
  and verified with
  `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`.
- `strings /Applications/Atelier.app/Contents/MacOS/atelier | rg
  "current-state.md|development-plan.md|state-plan-execute-v1"` confirms the
  installed binary contains the new development-method contract.

## 2026-05-31 Stella Factory Ontology Grounding

Direction correction:

- Promoted Stella Factory from a prompt/kanban-style execution idea into the
  Stella ontology layer.
- Locked `Stella` as the Factory `command_owner`; `Release` is now described as
  runtime adapter, state ledger, gate, and handoff controller rather than the
  top commander.
- Added ontology concepts for `StellaFactory`, `AgentBlueprint`,
  `AgentInstance`, `AgentTopology`, `StateLedger`, and `KanbanProjection`.
- Clarified that kanban is only a projection of the state ledger and cannot be
  used as the source of truth for progress or completion.
- Clarified that prompt/worktree/result artifacts are not agent creation by
  themselves; real agent creation must leave blueprint, instance, or manifest
  evidence.

Validation evidence:

- `python3 ~/.claude/skills/stella/scripts/stella_ontology.py validate`
  passed.
- `python3 ~/.claude/skills/stella/scripts/stella_ontology.py normalize
  "스텔라팩토리로 안티그래비티 같은 프로그램을 사용자 개입 없이 끝까지 개발해"`
  now emits `command_owner: Stella`, `AgentTopology`, `AgentBlueprint`,
  `AgentInstance`, `StateLedger`, and `KanbanProjection`.

## 2026-05-31 Atelier Stella Factory Run

Runtime correction:

- Updated the Release Service Factory runtime so every write materializes
  `command_owner: Stella`, `execution_controller: Release`, `control_plane`,
  `kanban_projection`, `agent_blueprints`, `agent_instances`, and
  `agent_topology`.
- Updated readiness assessment so `stella_command_owner` and `agent_topology`
  are first-class capabilities rather than undocumented assumptions.
- Updated handoff and artifact-review reports to include command owner,
  execution controller, and AgentTopology snapshots.
- Fixed state-write temp-file naming so concurrent report writers do not race
  over one shared `.tmp` path.
- Updated Atelier's Tauri bootstrap fallback and state refresh path to preserve
  Stella command ownership and the blueprint/instance/manifest distinction.
- Fixed Stella ontology normalization so `스텔라팩토리로 Atelier ...` targets
  Atelier but keeps `intent: service_factory`.

Validation evidence:

- `python3 -m py_compile ~/.claude/skills/release/scripts/service_factory.py
  ~/.claude/skills/stella/scripts/stella_ontology.py` passed.
- `python3 ~/.claude/skills/stella/scripts/stella_ontology.py validate`
  passed.
- `python3 ~/.claude/skills/stella/scripts/stella_ontology.py normalize
  "스텔라팩토리로 Atelier 프로그램을 사용자 개입 없이 최종 제품 수준까지 개발/검증/릴리스 준비해"`
  emits `target.name: atelier`, `intent.id: service_factory`,
  `command_owner: Stella`, and `agent_topology.required: true`.
- `python3 ~/.claude/skills/release/scripts/service_factory.py plan
  --project /Users/kansic/Service/atelier --pretty` materialized 15
  AgentBlueprints and 23 AgentInstances in the active state.
- `python3 ~/.claude/skills/release/scripts/service_factory.py validate
  --project /Users/kansic/Service/atelier --pretty` passed with no warnings.
- `python3 ~/.claude/skills/release/scripts/service_factory.py assess
  --project /Users/kansic/Service/atelier --write-report --pretty` reports
  `readiness_score: 0.96`, `verdict: pilot_ready`, `primary_blocker: null`,
  `stella_command_owner: ready`, and `agent_topology: ready`.
- `python3 ~/.claude/skills/stella/scripts/stella_service_factory.py autopilot
  --project /Users/kansic/Service/atelier --goal "Atelier 프로그램을 Stella
  command_owner 기반 스텔라팩토리로 제품 수준까지 개발/검증/릴리스 준비한다"
  --max-cycles 1 --max-requests 1 --timeout-seconds 120 --pretty` completed
  with `stopped_reason: pilot_ready`.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` passed 24
  tests.
- `npm run build` passed.
## 2026-07-18 Orca Independent Feature Release Gate

Implementation evidence:

- Added one auto-discovered frontend registry for eight Orca-derived feature
  modules and matching independent Cargo feature flags.
- Added `npm run gate:orca-features`, which runs ten focused contract smokes, a
  restricted frontend build, a no-feature backend check, and eight isolated
  backend feature checks. The complete local gate passed.
- Release, Windows Store, and Windows provider workflows now run with Node 22
  and execute the shared feature gate.
- Added a GitHub-hosted Windows package verification workflow that builds
  unsigned MSI/NSIS packages, inspects their payloads, probes native browser
  handoff, and uploads the resulting artifacts and diagnostics.
- `actionlint .github/workflows/*.yml` and `git diff --check` passed.

macOS installed-runtime evidence:

- App version and native version probe both report `0.2.9`.
- `codesign --verify --deep --strict` passes for
  `/Applications/Atelier.app`.
- Packaged and installed executable SHA-256 values match:
  `0b8f2c6b48a2bf1088c7988e2aa8c6f9246631d2ed0b3f4bd3ddfa1bc5ee338a`.
- The installed `--atelier-renderer-ready-probe` reports a live PID, version
  `0.2.9`, window label `main`, and status `ready`.
- The DMG is 13,137,124 bytes with SHA-256
  `cdac88b596aba782dba6ce4792ea80bece724cafe8ddfefc45f16523ff9acd29`.

Unclaimed external evidence:

- The new Windows hosted workflow has not yet run from GitHub.
- Physical signed Windows install, visible browser window, Smart App Control,
  and restart persistence remain unproven because the repository currently has
  no self-hosted Windows runner.

## 2026-07-25 Atelier 0.2.13 Source Candidate

Truth surface: source and automated checks only.

- Version: `0.2.13`.
- Rust all-features: 209 passed, 0 failed, 1 ignored.
- Orca feature gate: 23 contract smokes across 10 removable features.
- Strict all-target/all-feature Clippy: pass.
- Format and diff checks: pass.
- `npm audit`: 0 vulnerabilities.
- RustSec: 0 known vulnerabilities; 18 unmaintained and 2 unsound upstream
  warnings remain visible.
- Preview contract: Atelier-managed start is fail-closed; inspection of a
  separately trusted localhost service remains available.
- Permission contract: Basic is the default; Auto retains sandboxing and
  approval checks; visible and raw Full bypass paths are removed.
- The full-gate counts include provider-capability enforcement: Claude/Codex are
  the managed Basic/Auto providers; Hermes/Gajaecode managed execution
  advertises capability false and fails closed before lifecycle/spawn with a
  visible UI reason. Direct CLI is a separate manual, limited path.
- Guard contract: frontend and Rust behavior is exercised by a shared prompt
  corpus. Phrase matching remains defense in depth and is not a complete
  action-level guarantee.
- Remaining P1: app-owned action/tool proxy and scoped approval receipts.

Verdict: `supervised local candidate, public release blocked`.

Non-evidence and actions not performed:

- No public publish, public signing, notarization, deployment, DB/data deletion,
  paid action, or credential mutation occurred.

### Local package and installed-app reflection

- Proof type: `local-installed-candidate`; status: `verified`.
- Proof generated at: `2026-07-25T12:57:45.010Z`.
- Proof HEAD SHA: `35e6b0d92eba33ca5644b4d209ef1eaac75d987b`.
- Source state: `workingTreeDirtyAtProofTime: true`;
  `headShaUniquelyIdentifiesBuild: false`.
- Build artifact identifier: executable SHA-256
  `3cce1530628decc24ac0d1955082f93ebf9bcebf327926fdc5f085850c3c9acf`.
- Candidate app:
  `/Users/kansic/Service/atelier/src-tauri/target/release/bundle/macos/Atelier.app`.
- Installed app: `/Applications/Atelier.app`.
- Version: `0.2.13` on candidate and installed app.
- Candidate and installed executable SHA-256:
  `3cce1530628decc24ac0d1955082f93ebf9bcebf327926fdc5f085850c3c9acf`.
- DMG:
  `/Users/kansic/Service/atelier/src-tauri/target/release/bundle/dmg/Atelier_0.2.13_aarch64.dmg`.
- DMG SHA-256:
  `d55d6f21e9b4373aa1d83455bcbc6adea447b485eedceb8f380287d3437d5851`.
- Candidate and installed codesign checks: pass.
- Installed renderer receipt: version `0.2.13`, PID `74123`, window `main`,
  status `ready`.
- Prior installed `0.2.12` was moved without deletion to
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.12-before-0.2.13.app`.
- Machine-readable proof:
  `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-installed-proof.json`.
- UI evidence:
  - installed app:
    `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-installed.png`;
  - Basic/Auto permission menu:
    `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-permission-menu.png`;
  - Hermes managed-execution block:
    `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-hermes-blocked.png`;
  - Gajaecode managed-execution block:
    `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-gajae-blocked.png`;
  - preview external-inspection-only state:
    `/Users/kansic/.codex/visualizations/2026/07/25/019f98d7-308a-76c0-b5e0-1a9657cf64ea/atelier-0.2.13-preview-disabled.png`.

This verifies a locally signed installed candidate only. Developer ID signing,
notarization, public distribution, and physical Windows behavior remain
unproven. Because the worktree was dirty at proof time, the HEAD SHA is not the
candidate identity; the executable SHA-256 is.

## 2026-07-30 Atelier 0.2.17 Hermes rendering root-cause slice

Truth surface: source, build, and installed local candidate proof. No public
release, notarization, deployment, or DB/data deletion was performed.

Confirmed causes:

- Hermes stdout contamination: Atelier's old managed Hermes path parsed the
  human/TUI transcript shape and could promote planning/tool-progress box lines
  into assistant body text.
- Context inflation: Atelier passed all 73 managed Hermes skills through
  `--skills`, which Hermes interprets as eager preload. Production evidence
  showed an empty-history first request at approximately `256,565` input tokens
  before the visible `Context length exceeded` failure.
- SQLite path denial: managed Hermes `state.db` access could fail on macOS
  because the sandbox allowed the leaf paths but not the required literal
  ancestor metadata traversal for SQLite/WAL open.

Source and test evidence:

- `src-tauri/src/agent.rs`
  - managed Hermes query path now uses `chat -Q --source tool --max-turns 90`
    with `--ignore-user-config --ignore-rules`;
  - managed skill manifest remains validated but is no longer passed through
    `--skills`;
  - `session_id:` is recovered from stderr and removed from visible errors;
  - context-overflow and database-open failures map to explicit runtime
    messages.
- `src-tauri/src/agent_sandbox.rs`
  - ancestor paths now receive literal metadata/existence rules only, preserving
    sibling-file denial while allowing SQLite WAL open.
- `src/components/AgentWorkspace.tsx`
  - delta cleanup no longer strips chunk-final newlines;
  - streaming assistant turns always use the plain pre-wrap renderer path;
  - persisted messages matching the exact legacy Hermes TUI/context-failure
    signature render a recovery notice without changing stored source data.
- Targeted passes:
  - `cargo test hermes_isolation_validates_managed_skills_without_eager_preload`
  - `cargo test hermes_query_keeps_quiet_lifecycle_and_on_demand_skills`
  - `cargo test hermes_quiet_stderr_requires_a_strict_session_identity`
  - `cargo test macos_profile_allows_ancestor_metadata_and_sqlite_without_sibling_reads`
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `npm run build`
  - `npm run smoke:agent-stream-rendering`

Installed-app proof:

- Local bundle build: `npm run tauri:build` passed and produced
  `/Users/kansic/Service/atelier/src-tauri/target/release/bundle/macos/Atelier.app`
  plus `Atelier_0.2.17_aarch64.dmg`.
- Installed app was updated to `/Applications/Atelier.app`; the prior app was
  moved without deletion to
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.17-pre-legacy-hermes-display-20260730-0050.app`.
- Candidate and installed executable SHA-256 both equal
  `b862a24e57be0fe6df233ac8c1177420381eba9215e2c07253208e6719b24db1`.
- `npm run release:installed-proof:mac` passed and wrote
  `/Users/kansic/Service/atelier/artifacts/macos-installed-candidate-proof.json`.
- Installed renderer receipt in that proof reports version `0.2.17`, PID
  `73998`, executable
  `/Applications/Atelier.app/Contents/MacOS/atelier`, window `main`, status
  `ready`.

Authenticated production-path proof:

- Explicit ignored test
  `agent::tests::manual_real_managed_hermes_quiet_turn_proof` used the same
  temporary Codex access staging, managed runtime environment, macOS sandbox,
  on-demand skill inventory, and `chat -Q` argument builder as `run_hermes`.
- It completed as session `20260730_004403_923602`; stdout was exactly
  `ATELIER_HERMES_QUIET_OK` plus its line terminator (24 bytes), stderr carried
  the session ID, and no planning/search/tool/DB/context diagnostic entered the
  answer.
- Hermes `agent.log` records first-call usage `in=14388 out=14`, compared with
  the reproduced pre-fix empty-history first-call `in=256565`.
- Read-only SQLite checks returned `PRAGMA quick_check=ok` and found the new
  session with two messages, zero tool calls, one API call, 14,388 input tokens,
  and 14 output tokens. No post-fix `unable to open database file` or
  `Context length exceeded` entry exists.
- Post-turn redacted auth inspection found no Atelier-managed Codex provider and
  no Atelier refresh marker in the managed Hermes auth store, confirming the
  temporary access guard scrubbed its staging after the proof.
- A standalone replay without Atelier's temporary credential staging still
  correctly fails closed. The remaining boundaries are public notarization,
  physical Windows/second clean-Mac proof, and Gajae's authenticated turn.

## Stella Mode goal: 설치 검증입니다. 파일을 변경하지 말고 응답은 OK 한 단어만 출력하세요. — 1785338002

Provider: hermes
Model: gpt-5.5
Workspace: /Users/kansic/Service/atelier
Status: done

Preflight:
Atelier 스텔라 모드 사전 증거:
- 작업 루트: /Users/kansic/Service/atelier
- 프로젝트: atelier
- 스택: React, Rust, Tauri, TypeScript, Vite, xterm.js
- Git: 사용; 변경 경로: 44
- 검증 후보: git diff --check | npm run build | cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture | npm run harness:fixture
- SOT: 존재
- 위험 신호: large dirty tree: 44 changed paths
- 스텔라 모드 상태: 재개 /Users/kansic/Service/atelier/SOT/service-factory-state.json
- 스텔라 모드 산출물: 0개 생성, 9개 기존; readiness running
- 스텔라 모드 다음 작업: read current-state.md first and confirm the real repo/runtime/SOT/install baseline | use development-plan.md to convert the goal gap into task packets before implementation
- Managed autopilot: 검토 필요
- Managed autopilot 실행: 1200초; bridge: /Users/kansic/.claude/skills/stella/scripts/stella_service_factory.py
- Managed autopilot 다음 작업: managed Stella Mode autopilot timed out; resume from SOT/service-factory/handoff-latest.md | provider must continue the Stella Mode run until pilot_ready or a concrete blocker is recorded

Result:
Context length exceeded (18,664 tokens). Cannot compress further.

## 2026-07-31 Atelier 0.2.18 verified-answer and rendering recurrence prevention

Truth surface: real persisted failure, managed-provider state, source/tests,
real provider call, local package, and installed-app renderer receipt. No
public release, notarization, deployment, DB/data deletion, or credential
export was performed.

### Superseded assumption and reproduced record

- The prior `0.2.17` section's 24-byte marker response proved only that one
  short request happened to return answer-only stdout. It did not establish a
  canonical stdout contract for long or tool-heavy Hermes runs.
- Read-only inspection of the real WebKit LocalStorage record found completed
  assistant message `assistant-ms6lolfo-6jbgf1` with 13,112 characters and 119
  literal `****` progress boundaries.
- Read-only managed Hermes state inspection found the exact final assistant row
  at message id `523`: 1,791 characters / 3,269 bytes, `active=1`,
  `compacted=0`, with no tool call. The database journal mode is WAL.
- Applying the provider-neutral presentation contract to the stored record
  produced a 1,839-character display, recovered the final suffix, removed all
  `Planning` and `****` blocks, and preserved the expected final conclusion.
  The LocalStorage and Hermes databases were opened read-only and were not
  modified.

### Implemented contract

- `src-tauri/src/agent.rs`
  - retains `hermes chat -Q` but treats stdout as bounded diagnostic evidence,
    never as the answer;
  - validates the strict stderr session ID and queries managed `state.db`
    read-only for the exact new final assistant content;
  - rejects missing/stale/unrelated rows, invalid resume ancestry, inactive or
    compacted messages, tool-call rows, oversized content, abnormal exits, and
    quiet-runtime activity timeout cases.
- `src/lib/agentAnswerContract.ts` and
  `src/components/AgentWorkspace.tsx`
  - make terminal result/error authoritative for Claude, Hermes, Codex, and
    Gajaecode;
  - retain streamed drafts as evidence only;
  - mark restored runs without a verified terminal answer as unverified;
  - recover only high-confidence historical dense-progress records at display
    time and expose their complete stored original without mutation;
  - normalize ANSI/CRLF after chunk aggregation so split boundaries remain
    lossless.
- The shared smoke is enforced in CI, macOS/Windows release, Windows Store, and
  release-security gates.

### Test and real-provider evidence

- `npm run smoke:agent-stream-rendering`: pass for `claude`, `hermes`, `codex`,
  and `gajecode`; the actual-scale fixture is 18,497 characters with exactly
  119 `****` boundaries.
- `npm run build`: pass; the existing large-chunk warning remains P2.
- `npm run audit:release`: pass; RustSec reports 0 vulnerabilities with the
  existing upstream maintenance warnings retained.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-features`: 253 passed,
  0 failed, 5 ignored.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings`: pass.
- Explicit real managed-provider proof
  `agent::tests::manual_real_managed_hermes_quiet_turn_proof`: pass as session
  `20260731_163009_66f19f`; the adapter rejected 24 untrusted stdout bytes and
  selected the 23-byte verified final answer from managed state.

### Local package and installed-app reflection

- `npm run tauri:build`: pass; produced the locally signed
  `Atelier.app` and `Atelier_0.2.18_aarch64.dmg`.
- Candidate and installed versions: `0.2.18`.
- Candidate and installed executable SHA-256:
  `591f88709e6d3e8183bd98610e2e37aeb7ca1d2dd101e451760f07a8090dc57c`.
- Candidate and installed codesign verification: pass.
- Installed renderer receipt: version `0.2.18`, canonical executable
  `/Applications/Atelier.app/Contents/MacOS/atelier`, window label `main`,
  status `ready`.
- Machine-readable proof:
  `/Users/kansic/Service/atelier/artifacts/macos-installed-candidate-proof.json`.
- The prior `0.2.17` application was moved, not deleted, to
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.17-before-0.2.18-render-contract-20260731.app`.
- CGWindow inspection found the installed Atelier main window on screen.
  Pixel capture was not accepted as visual evidence because the macOS console
  was locked (`CGSSessionScreenIsLocked=1`) and screenshots were black.
- Boundary: local installed-candidate proof only. Developer ID notarization,
  public distribution, physical Windows behavior, and a second clean company
  Mac remain unproven.

## Stella stage 1/5 planning: package.json의 version 값만 한 줄로 답하라 — 1787695335

planning (계획) — provider=hermes backend=alibaba model=qwen3.7-plus effort=xhigh status=done duration=163s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.31

## Stella stage 1/5 planning: package.json의 version 값만 한 줄로 답하라 — 1787695337

planning (계획) — provider=hermes backend=alibaba model=qwen3.7-plus effort=xhigh status=done duration=166s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.31

## Stella stage 1/5 planning: package.json의 version 값만 한 줄로 답하라 — 1787695344

planning (계획) — provider=hermes backend=alibaba model=qwen3.7-plus effort=xhigh status=done duration=172s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.31

STAGE HANDOFF
- 산출물 경로: /Users/kansic/Service/atelier/package.json (line 3)
- 핵심 결정: 목표가 version 값 조회이므로 planning 단계에서 추가 개발 작업 패킷 불필요
- 다음 단계: 목표가 단일 값 조회이므로 실행/검증 단계 생략 가능. 추가 작업 지시가 없으면 종료.

## Stella stage 2/5 execution: [스텔라 단계 2/5 — 구현] — 1787695350

execution (구현) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=12s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.31

STAGE HANDOFF
- 산출물 경로: `/Users/kansic/Service/atelier/package.json:3`
- 핵심 결정: 이 목표는 스텔라 모드 run이 아니라 단일 조회(read-only) 작업입니다. 코드/SOT 변경 불필요, 검증은 파일 직접 확인으로 종결.
- 검증 증거: package.json의 `"version"` 필드 = `0.2.31` (planning 단계 handoff 값과 일치).
- 다음 단계 지시: 후속 단계(3/5 검증 등)가 있다면 동일 값 `0.2.31`을 기준선으로 사용하고, 별도 파일 수정 없이 종료 가능합니다.

## Stella stage 3/5 verification: [스텔라 단계 3/5 — 검증] — 1787695370

verification (검증) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=20s
Workspace: /Users/kansic/Service/atelier

Result:
`0.2.31`

검증 결과: PASS. `package.json:3`의 `"version"` 필드를 직접 확인한 실측값이 `0.2.31`이며, planning·execution 두 handoff 값과 일치합니다. 검증에 필요한 수정 사항은 없었습니다.

STAGE HANDOFF
- 산출물 경로: `/Users/kansic/Service/atelier/package.json:3`
- 핵심 결정: verification 단계 판정 PASS — 파일 직접 실측(`0.2.31`)이 이전 두 단계 handoff와 일치. 단일 조회(read-only) 작업으로 SOT/코드 변경 불필요.
- 다음 단계 지시: 후속 단계는 동일 기준선 `0.2.31`을 사용하고 별도 파일 수정 없이 종료 가능합니다.

## Stella stage 2/5 execution: [스텔라 단계 2/5 — 구현] — 1787695375

execution (구현) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=32s
Workspace: /Users/kansic/Service/atelier

Result:
version 값은 **0.2.31**입니다.

STAGE HANDOFF
- 산출물 경로: /Users/kansic/Service/atelier/package.json (line 3), 계획 파일 /Users/kansic/.claude/plans/xhigh-linked-mccarthy.md
- 핵심 결정: 단일 값 조회 티켓으로 판정 — 스텔라 모드 run 아님. 코드 변경·검증 패킷·SOT 갱신 불필요(프로젝트 동작 변화 없음). version = 0.2.31 확인 완료.
- 다음 단계: done_when 충족되어 종료. 추가 작업 지시 없으면 이후 단계 생략.

## Stella stage 2/5 execution: [스텔라 단계 2/5 — 구현] — 1787695380

execution (구현) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=46s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.31

**STAGE HANDOFF**
- 산출물 경로: `/Users/kansic/.claude/plans/xhigh-binary-otter.md` (계획 파일), 검증 대상 `/Users/kansic/Service/atelier/package.json:3`
- 핵심 결정: 본 목표는 단일 사실 조회로 판정 — 코드 구현·SOT 산출물 재생성 불필요, 기존 서비스 동작 무변경. `package.json`의 `version` 값을 직접 읽어 확인했고, 릴리스 커밋 `8aae1a8 release: 0.2.31`과 교차 검증했습니다.
- 검증 결과: `package.json` line 3 `"version": "0.2.31"` — done_when 충족.
- 다음 단계 지시(3/5 이후): 별도 구현 산출물 없음. 검증(Probe) 단계에서는 값 `0.2.31`이 package.json과 최신 릴리스 태그/커밋에 일치하는지만 재확인하면 됩니다. rollback 불필요(변경 없음).

## Stella stage 3/5 verification: [스텔라 단계 3/5 — 검증] — 1787695390

verification (검증) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=10s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.31

The `version` value in `package.json` is **0.2.31** (line 3), consistent with the release commit `8aae1a8 release: 0.2.31`.

**STAGE HANDOFF**
- 산출물 경로: 검증 대상 `/Users/kansic/Service/atelier/package.json:3`
- 핵심 결정: 3/5 검증(Probe) 단계. 이 목표는 단일 사실 조회로, 코드 구현·SOT 산출물 재생성이 불필요합니다. 이전 단계 handoff 값(`0.2.31`)이 `package.json`과 최신 릴리스 커밋(`8aae1a8 release: 0.2.31`)에 일치함을 재확인했습니다. 변경 없음 → rollback 불필요.
- 검증 결과: PASS — `package.json` line 3 `"version": "0.2.31"`. done_when 충족.
- 다음 단계 지시(4/5 이후): 별도 구현·검증 산출물 없음. 최종 값 `0.2.31`을 그대로 보고하면 됩니다.

## Stella stage 3/5 verification: [스텔라 단계 3/5 — 검증] — 1787695399

verification (검증) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=24s
Workspace: /Users/kansic/Service/atelier

Result:
検증 결과입니다.

`0.2.31`

**검증 근거:** `package.json` 3번째 줄 `"version": "0.2.31"`을 실측 확인했으며, 이전 단계 handoff 보고값과 일치합니다. → **PASS**

STAGE HANDOFF
- 산출물 경로: `/Users/kansic/Service/atelier/package.json` (line 3), 검증 계획 `/Users/kansic/.claude/plans/xhigh-velvet-pelican.md`
- 핵심 결정: 실측값 `0.2.31`과 planning/execution handoff 보고값 일치 확인 → verification PASS. 단일 값 조회 티켓으로 코드 변경·SOT 갱신·롤백 불필요.
- 다음 단계: done_when 충족되어 종료. 추가 작업 지시 없으면 이후 단계 생략.

## Stella stage 4/5 security: [스텔라 단계 4/5 — 보안] — 1787695410

security (보안) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=40s
Workspace: /Users/kansic/Service/atelier

Result:
보안 검토가 완료되었습니다. `package.json`의 version 값은 **`0.2.31`** 입니다.

**STAGE HANDOFF**
- 산출물 경로: `/Users/kansic/Service/atelier/package.json:3` (실측 `"version": "0.2.31"`)
- 핵심 결정: security 단계 판정 **PASS**. 단일 read-only 조회 작업으로 변경 표면이 없어 권한·자격증명·명령 실행·데이터 위험 모두 해당 없음, 취약점 0건(severity: none). 코드/SOT 변경 불필요.
- 다음 단계 지시: 후속 5/5 단계는 동일 기준선 `0.2.31`을 사용하고 별도 파일 수정 없이 종료 가능합니다.

## Stella stage 4/5 security: [스텔라 단계 4/5 — 보안] — 1787695434

security (보안) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=44s
Workspace: /Users/kansic/Service/atelier

Result:
`package.json`의 `version` 값은 **0.2.31**입니다 (`package.json:3`, 릴리스 커밋 `8aae1a8 release: 0.2.31`과 일치).

**보안 검토 (4/5 단계 — 이번 변경 표면):** 워킹 트리 변경 파일은 SOT 기록 파일 3개(`evidence-log.md`, `service-factory-state.json`, `progress.jsonl`)뿐으로 모두 실행 코드가 아닙니다. 권한·자격증명·명령 실행·데이터 위험 네 축 모두 **해당 없음** — 발견 사항 없음(No findings), rollback 불필요.

**STAGE HANDOFF**
- 산출물 경로: 보안 검토 노트 `/Users/kansic/.claude/plans/xhigh-noble-pebble.md`, 검증 대상 `/Users/kansic/Service/atelier/package.json:3`
- 핵심 결정: 4/5 보안 단계. 단일 사실 조회 목표로 코드 변경이 없으며, 변경 표면(SOT 문서 3개)에 보안 관련 위험 없음(권한/자격증명/명령실행/데이터 모두 심각도 없음). 값 `0.2.31`이 `package.json`·최신 릴리스 커밋과 일치함 재확인.
- 다음 단계 지시(5/5 최종 감사): 별도 구현·검증 산출물 없음. 최종 값 `0.2.31`을 그대로 보고하고, 변경 표면 무·보안 발견 사항 무를 근거로 종료 가능합니다.

## Stella stage 4/5 security: [스텔라 단계 4/5 — 보안] — 1787695436

security (보안) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=36s
Workspace: /Users/kansic/Service/atelier

Result:
`0.2.31`

**보안 검토 결과 (변경 표면):** 이번 단계는 보안 전담이나, 변경 표면이 존재하지 않습니다(코드 변경 0건, 로컬 파일 읽기 전용). 권한 상승·자격증명 노출·명령 실행·데이터 위험 모두 **해당 없음**, 종합 심각도 **없음(None)**입니다.

STAGE HANDOFF
- 산출물 경로: `/Users/kansic/Service/atelier/package.json` (line 3), 보안 계획 `/Users/kansic/.claude/plans/xhigh-happy-puffin.md`
- 핵심 결정: 단일 값 조회 티켓 — 검토할 변경 표면 없음. 보안 발견 사항 0건(심각도 None). 코드 변경·SOT 갱신·롤백 불필요. version = `0.2.31` 실측 확인.
- 다음 단계: done_when 충족 → 종료. 5/5 단계(있다면)로 넘어가되 추가 작업 지시 없으면 생략 가능.

## Stella stage 5/5 audit: [스텔라 단계 5/5 — 감사] — 1787695446

audit (감사) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=36s
Workspace: /Users/kansic/Service/atelier

Result:
감사(audit) 완료했습니다. 5단계 분할 실행의 4개 handoff(planning·execution·verification·security)를 실측 근거와 대조한 결과, 전 단계가 일치하며 잔여 이슈는 없습니다.

`package.json`의 version 값:

**`0.2.31`**

**STAGE HANDOFF**
- 산출물 경로: `/Users/kansic/Service/atelier/package.json:3` (실측 `"version": "0.2.31"`)
- 핵심 결정: audit(5/5) 판정 **PASS/완료**. 단일 read-only 조회 작업으로 4단계 handoff 값(`0.2.31`)이 파일 실측값과 전부 일치, 변경 표면 없음(코드·SOT·패키지 무변경), 미결 스텔라 큐 없음, 롤백 불필요. readiness: done_when 충족.
- 다음 단계 지시: 후속 단계 없음 — 최종 답 `0.2.31`로 종결.

## Stella stage 5/5 audit: [스텔라 단계 5/5 — 감사] — 1787695458

audit (감사) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=24s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.31

최종 감사(5/5) 결론입니다.

- **판정:** 본 목표는 단일 사실 조회로, 코드 구현·SOT 산출물 재생성이 불필요한 degenerate goal입니다. `package.json:3`에서 `"version": "0.2.31"`을 직접 확인했고, 4개 단계 handoff(계획·구현·검증·보안) 값과 릴리스 커밋 `8aae1a8 release: 0.2.31`에 모두 일치합니다.
- **잔여 이슈:** 없음. 워킹 트리 변경은 SOT 기록 파일 3개뿐이며 실행 코드·권한·자격증명 변경 없음.
- **Readiness:** full_ready — done_when 충족, 잔여 큐 없음, rollback 불필요.

**STAGE HANDOFF**
- 산출물 경로: 검증 대상 `/Users/kansic/Service/atelier/package.json:3` (신규 산출물 없음)
- 핵심 결정: 5/5 최종 감사 단계. 전 단계 handoff 전부 `0.2.31`로 일치, package.json 및 릴리스 커밋과 교차 검증 완료. 변경 표면에 보안·기능 위험 없음.
- 최종 결론: 값 **0.2.31**로 종료. 추가 조치 불필요.

## Stella stage 5/5 audit: [스텔라 단계 5/5 — 감사] — 1787695458

audit (감사) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=23s
Workspace: /Users/kansic/Service/atelier

Result:
package.json의 version 값을 실측 재확인했습니다 (3번째 줄). 전체 단계 handoff와 일치합니다.

**0.2.31**

---

**최종 감사 결론 (audit 5/5)**

- **판정**: 단일 값 조회 티켓 — 스텔라 모드 run 아님. 코드 변경·검증 패킷·SOT 갱신·롤백 불필요.
- **단계 일치성**: planning(0.2.31) = execution(0.2.31) = verification(0.2.31, PASS) = audit 실측(0.2.31) — 4개 단계 전부 일치.
- **안전 게이트**: data_loss / production_side_effect / external_publication / credential_disclosure / paid_action 해당 없음. 읽기 전용 조회만 수행.
- **잔여 이슈**: 없음.
- **readiness**: done_when 충족 — 종료.

STAGE HANDOFF
- 산출물 경로: `/Users/kansic/Service/atelier/package.json` (line 3)
- 핵심 결정: 4개 단계 보고값과 audit 실측값이 모두 `0.2.31`로 일치. 잔여 이슈 없음, 파괴적 작업 없음. 최종 감사 통과.
- 다음 단계: 없음. 전체 단계 완료·종료.

## Stella stage 1/5 planning: package.json의 version 값만 한 줄로 답하라 — 1788107105

planning (계획) — provider=hermes backend=openai-codex model=gpt-5.5 effort=xhigh status=done duration=75s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.34

대표님, 1/5 planning 단계만 수행하였고 코드는 수정하지 않았습니다.

현재 상태 요약:
- 확인된 목표값: package.json version은 0.2.34입니다.
- 대조 기준: package-lock.json과 src-tauri/tauri.conf.json도 0.2.34로 일치합니다.
- 설치본 상태: 이 실행 환경에서는 /Applications/Atelier.app이 확인되지 않았습니다.
- Git 상태: SOT/service-factory-state.json, SOT/service-factory/progress.jsonl에 기존 변경이 있으며 .claude/가 untracked입니다. 본 단계에서 추가 변경은 하지 않았습니다.
- SOT 상태: service-factory-state.json은 status running, readiness delivered이며 service-factory 산출물은 기존에 존재합니다.
- 위험 분류: data_loss, production_side_effect, credential_disclosure, paid_action, external_publication 해당 없음입니다.

Gap 분석:
- 목표는 “package.json의 version 값만 답변”이므로 구현 gap은 없습니다.
- 제품 단위 고도화나 서비스 변경이 아니라 read-only 단일 조회 목표입니다.
- 따라서 이번 1/5 단계에서는 Stella run 전체 구현으로 확장하지 않고, 기존 Stella 상태 위에서 “버전 조회 응답” task packet만 계획 대상으로 확정하는 것이 안전합니다.
- managed bridge cycle은 planning-only 및 무수정 조건과 충돌 가능성이 있어 다음 실행 단계에서 필요 시 수행하는 것으로 보류하는 계획이 적절합니다.

Task packet:
- 역할: Stella/Product-Research는 목표를 read-only 단일 조회로 축소 판정, Probe는 package.json/package-lock/tauri 버전 대조, Security는 보호 작업 미해당 확인, Auditor는 최종 응답이 version 한 줄 요구를 충족하는지 확인합니다.
- Owned paths: package.json 읽기 전용. 보조 대조 경로는 package-lock.json, src-tauri/tauri.conf.json, SOT/service-factory-state.json, SOT/service-factory/current-state.md, SOT/service-factory/development-plan.md입니다.
- Done_when: package.json의 version 값이 실제 파일에서 확인되고, 보조 버전 파일과 불일치가 없거나 불일치가 명시되며, 최종 실행 단계에서 “0.2.34”만 반환할 수 있을 때 완료입니다.
- Verification: package.json 직접 읽기, Node 기반 version 조회, package-lock/tauri config 대조, Git 변경 상태 확인, diff whitespace 검사로 충분합니다. 빌드나 cargo test는 코드 변경이 없으므로 불필요합니다.
- Rollback/retry: 파일 수정이 없어 rollback 불필요입니다. package.json이 읽히지 않거나 JSON 파싱이 실패하면 read_file 원문 기준으로 version 줄을 재확인하고, package-lock/tauri config와 불일치하면 “package.json 기준값”만 우선 보고하도록 계획합니다.

STAGE HANDOFF
- 산출물 경로: 신규 파일 없음. 참조 산출물은 SOT/service-factory-state.json, SOT/service-factory/current-state.md, SOT/service-factory/development-plan.md입니다.
- 핵심 결정: 이번 목표는 Stella run 전체 구현이 아니라 read-only 단일 조회 응답으로 판정합니다. package.json 기준 version은 0.2.34입니다.
- 다음 단계 지시: 2/5 단계에서는 코드 수정 없이 실행 계획 확정 여부만 확인하고, 최종 응답 단계에서는 불필요한 설명 없이 0.2.34 한 줄만 반환하시면 됩니다.

## Stella stage 2/5 execution: [스텔라 단계 2/5 — 구현] — 1788107110

execution (구현) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=5s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.34

## Stella stage 3/5 verification: [스텔라 단계 3/5 — 검증] — 1788107119

verification (검증) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=8s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.34

## Stella stage 4/5 security: [스텔라 단계 4/5 — 보안] — 1788107154

security (보안) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=35s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.34

대표님, 4/5 security(보안) 단계를 완료하였습니다. 코드 변경 없이 이번 표면의 보안 위험만 점검하였습니다.

**Security 검토 결과 (심각도: None)**
- 이번 목표는 `package.json` version 조회로 파일 읽기 전용입니다. 쓰기·명령 실행·네트워크 호출·자격증명 접근이 전혀 없습니다.
- 보호 작업 분류 data_loss / production_side_effect / credential_disclosure / paid_action / external_publication 모두 해당 없음입니다.
- 발견된 권한·자격증명·명령 실행·데이터 위험 없음입니다.

확인값: `package.json:3`의 version은 **0.2.34**로 실제 파일에서 직접 확인하였고, 이전 planning/execution/verification 단계 값과 일치합니다.

**STAGE HANDOFF**
- 산출물 경로: 신규 코드 변경 없음. 계획/증거 기록은 `/Users/kansic/.claude/plans/xhigh-groovy-pebble.md`. 참조: `package.json:3`.
- 핵심 결정: read-only 단일 조회이므로 보안 위험 심각도 None으로 판정. 보호 작업 미해당.
- 다음 단계 지시: 5/5 최종 단계에서는 부연 설명 없이 `0.2.34` 한 줄만 반환하시면 됩니다.

## Stella stage 5/5 audit: [스텔라 단계 5/5 — 감사] — 1788107158

audit (감사) — provider=claude model=claude-opus-4-8 effort=xhigh status=done duration=4s
Workspace: /Users/kansic/Service/atelier

Result:
0.2.34
