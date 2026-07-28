# Stella Factory Security Audit

generated_at: 2026-07-13T09:35:39+09:00
reconciled_at: 2026-07-26 KST

## Scope

Provider login and execution, credential storage/refresh, permission defaults,
OAuth URL handling, preview evidence, updater packaging, dependency advisories,
Windows physical-gate evidence, and release publication gates.

## Result

- Known exploitable dependency advisories: 0.
- `npm audit`: 0 vulnerabilities on the `0.2.14` source candidate.
- RustSec: 0 known vulnerabilities; 18 unmaintained and 2 unsound upstream
  warnings remain visible.
- Release-blocking credential findings: 0.
- Unsigned public Windows fallback: removed.
- Public macOS trust: not yet satisfied; external signing gate remains.

## Findings Closed

- OAuth URLs can no longer be silently truncated by the login PTY width.
- Browser URLs are accepted only for provider HTTPS hosts before opening.
- Windows provider CLIs use the installed signed Atelier executable as a
  headless browser helper. It accepts only allowlisted Claude/Codex HTTPS URLs,
  uses the native WinRT/COM/system chain, and never creates generated scripts.
- Atelier no longer reads Claude Code's external macOS keychain item.
- Gajae does not persist the Claude subscription credential in its database.
- Atelier no longer stages or copies Codex credentials into Hermes state.
  Claude Code, Codex, and Hermes each own their provider authentication.
- The only automated Claude bridge invokes the official `claude setup-token`
  command after explicit user reconnection and stores the resulting
  inference-only token in Atelier's own keychain item; no refresh token or
  private OAuth endpoint is used.
- Preview server output is redacted before native storage/event emission and
  redacted again before frontend persistence or provider context assembly.
- The click-to-select bridge is localhost-only and user-invoked. It never reads
  input values, cookies, storage, response bodies, or headers. A second
  host-side normalizer rejects value/URL/event selectors and strips unsafe
  markup attributes even if an inspected page tampers with picker state.
- Historical `0.2.12` behavior defaulted missing or invalid permission state to
  automatic workspace access rather than Full.
- The current permission contract is stricter: Basic is the default; Auto keeps
  provider sandboxing and approval checks; visible/raw Full bypass is removed.
- Managed Basic/Auto capability is provider-scoped. Claude/Codex retain their
  existing paths; Hermes/Gajaecode require verified Atelier-owned macOS
  runtimes, isolated homes/default skills, and the deny-default sandbox.
- Gajaecode's four default skills are protected by a per-file SHA-256 manifest.
  Hermes archive files are checked against the pinned Git objects, durable
  source uses a SHA-256 manifest, and 73 installed skill hashes must match.
  Invalid prior trees are quarantined rather than deleted.
- uv and Bun macOS downloads use embedded official SHA-256 values before atomic
  publication. Hermes Python resolves inside the provider-local `uv-python`
  root.
- Managed preview start fails closed. Inspection is limited to a separately
  trusted localhost service when Atelier does not own the listener.
- Frontend and Rust prompt guards are exercised by a shared regression corpus.
- High-confidence secret scanning found no private key or provider-token
  material across 339 tracked/untracked source files.
- The historical audit reported zero known RustSec vulnerabilities and kept its
  upstream maintenance/quality warnings visible rather than suppressing them.
- Release Tauri builds no longer enable devtools.
- Renderer startup receipts are stored per executable-path SHA-256 in the
  private app cache, chmod 0600 on Unix, and accepted only when version, live
  PID, canonical executable, window label, timestamp, and ready status match
  the probing binary. Build candidates cannot overwrite installed-app proof.
- The locally signed `0.2.14` candidate/installed executable hashes match and
  codesign plus renderer readiness pass. The proof records a dirty worktree and
  uses the executable SHA-256, not HEAD, as the build artifact identifier.

## Residual Risk

- Phrase denylist matching cannot prove or mediate the actual provider
  tool/action effect. The P1 app-owned action/tool proxy and scoped approval
  receipts remain required.
- Interactive Windows OAuth and Smart App Control behavior require target-host
  validation and cannot be proven from macOS.
- Browser warning/error and resource metadata are captured only in bounded,
  redacted form. Durable console history and full network-waterfall archival
  remain intentionally absent to avoid secret and storage amplification.
- The local macOS certificate is not a Developer ID certificate, so Gatekeeper
  correctly rejects the locally signed bundle for public distribution.

## Safety Gates Preserved

- DB/user-data deletion: approval required.
- Production deploy/publication: approval required.
- Paid API expansion: approval required.
- External communication and offensive security: approval/scope required.

## Current Verdict

`supervised local candidate, public release blocked`

No public publish, public signing, notarization, deployment, DB/data deletion,
paid action, or credential mutation was performed in the `0.2.14` cycle.
