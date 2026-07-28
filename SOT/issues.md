# Issues

Current disposition: `supervised local candidate, public release blocked`.

## Open

- P1: prompt phrase matching does not mediate the actual provider tool/action
  boundary. Add an app-owned action/tool proxy with scoped, expiring, one-use
  approval receipts before claiming action-level safety.
- Gajae internal Codex still needs a real installed-app provider turn covering
  both the missing/expired-token failure and a successful authenticated
  response. Source tests and click-driven provider/default reflection are
  complete; no paid provider request was made in this phase.
- Public distribution remains blocked by Developer ID notarization, Windows
  public signing, and physical Windows OAuth/install/restart evidence.
- P2: the production frontend bundle still emits a large-chunk/code-splitting
  warning. This is performance debt, not a source or local-install failure.
- A click-driven installed-app E2E covering React parallel launch, native
  worktree preparation, IPC, adapter execution, comparison, and adoption is not
  yet implemented. Current proof combines frontend contracts with backend E2E
  and worktree integration tests.
- A real self-hosted model response has not been tested. The borrowed GPU
  server was intentionally left unchanged in this phase.
- Windows code compiles and links through `cargo xwin`; real `taskkill` and
  `tasklist` behavior still requires a physical Windows runner.
- A second physical clean company Mac and an authenticated full managed response
  for Hermes and Gajaecode remain distribution-level validation. Runtime and
  default-skill preparation are already verified in the installed app.

## Resolved in this session

- The locally signed `0.2.15` candidate is installed at
  `/Applications/Atelier.app`; candidate/installed executable SHA-256 matches at
  `d1c433a730536868433140949cf468420dea6ae48cf129edfa5099bd0f72b1a9`,
  codesign and renderer readiness pass, and the installed app exposes Gajae
  `Claude`, `Codex`, and `Alibaba Cloud` defaults.
- Hermes and Gajae settings now drive newly created sessions instead of acting
  as ornamental values. Installed-app proof changed Gajae to Codex, restarted
  Atelier, confirmed persistence, and opened a new Gajae task at
  `Codex` / `5.5`; the original Claude default was restored.
- Gajae Codex readiness and execution now follow the real GJC `0.11.7`
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
  with version `0.11.7`, managed Bun `1.3.14`, and four verified defaults.
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
