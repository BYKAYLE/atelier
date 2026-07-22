# Stella Factory Security Audit

generated_at: 2026-07-13T09:35:39+09:00

## Scope

Provider login and execution, credential storage/refresh, permission defaults,
OAuth URL handling, preview evidence, updater packaging, dependency advisories,
Windows physical-gate evidence, and release publication gates.

## Result

- Known exploitable dependency advisories: 0.
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
- Missing or invalid permission state now defaults to automatic workspace
  access, not full access.
- High-confidence secret scanning found no private key or provider-token
  material across 339 tracked/untracked source files.
- RustSec reports zero known vulnerabilities. The 17 unmaintained and 2 unsound
  upstream warnings remain visible rather than being suppressed.
- Release Tauri builds no longer enable devtools.
- Renderer startup receipts are stored per executable-path SHA-256 in the
  private app cache, chmod 0600 on Unix, and accepted only when version, live
  PID, canonical executable, window label, timestamp, and ready status match
  the probing binary. Build candidates cannot overwrite installed-app proof.

## Residual Risk

- Explicit full permission intentionally bypasses provider sandbox/approval
  controls.
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
