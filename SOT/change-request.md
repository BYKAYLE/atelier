# Change Request: Reproducible Hermes and Gajaecode Runtime

Status: implementation advanced; source/build/installed 0.2.15 validated, authenticated provider-turn proof still pending
Approved by: user
Approved at: 2026-07-25 KST

## Request

Fix remaining parity gaps in managed Hermes/Gajaecode operation for provider model
selection, without reintroducing per-user global dependency. A company user must
be able to install Atelier on a different Mac and begin with the same pinned
agent runtime, default skills, policy, and working flow without separately
installing skills or relying on the original developer's global Mac state.

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

- Final local candidate is `0.2.15`; candidate and installed executable
  SHA-256 match at
  `d1c433a730536868433140949cf468420dea6ae48cf129edfa5099bd0f72b1a9`.
- Gajaecode is isolated under Atelier-owned GJC paths at `0.11.7` with managed
  Bun `1.3.14` and four verified defaults. Personal Mac skill roots are not
  imported.
- Hermes is pinned to commit `3ef6bbd…`, uses provider-local Python, and
  verifies 453 durable source files against 73 installed skills.
- The installed UI successfully executes `설치·복구` for both providers.
- Source gates pass at Rust 239/0/4, Orca 23/10, strict Clippy, build,
  format/diff, and zero known npm/RustSec vulnerabilities.
- Hermes and Gajae now expose settings-driven model-provider defaults in source
  and installed app flows, and the Gajae Codex readiness badge follows the
  OAuth-only child-env bridge contract instead of treating an API key as
  sufficient.
- Installed-app interaction confirms that a Gajae provider change survives an
  app restart and that a newly created Gajae task opens with the persisted
  provider/model (`Codex` / `5.5`). The pre-proof user default was restored to
  `Claude` after the check.
- Remaining validation is currently a full authenticated provider response on a
  separate clean company Mac. Credentials, entitlement, and paid calls remain
  user-specific and were not bundled or exercised.
