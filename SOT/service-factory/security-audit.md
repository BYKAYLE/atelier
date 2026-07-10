# Stella Factory Security Audit

generated_at: 2026-07-10T18:28:00+09:00

## Scope

Provider login and execution, credential storage/refresh, permission defaults,
OAuth URL handling, updater packaging, dependency advisories, and release
publication gates.

## Result

- Known exploitable dependency advisories: 0.
- Release-blocking credential findings: 0.
- Unsigned public Windows fallback: removed.
- Public macOS trust: not yet satisfied; external signing gate remains.

## Findings Closed

- OAuth URLs can no longer be silently truncated by the login PTY width.
- Browser URLs are accepted only for provider HTTPS hosts before opening.
- Windows browser opening uses native trusted executables instead of generated
  helper scripts.
- Atelier no longer reads Claude Code's external macOS keychain item.
- Gajae does not persist the Claude subscription credential in its database.
- Hermes receives only a staged Codex access token, which is scrubbed after the
  provider run; refresh credentials remain owned by their source CLI.
- Missing or invalid permission state now defaults to automatic workspace
  access, not full access.
- The locked vulnerable `quinn-proto` version was updated to 0.11.15.
- Release Tauri builds no longer enable devtools.

## Residual Risk

- Explicit full permission intentionally bypasses provider sandbox/approval
  controls.
- Interactive Windows OAuth and Smart App Control behavior require target-host
  validation and cannot be proven from macOS.
- The local macOS certificate is not a Developer ID certificate, so Gatekeeper
  correctly rejects the locally signed bundle for public distribution.

## Safety Gates Preserved

- DB/user-data deletion: approval required.
- Production deploy/publication: approval required.
- Paid API expansion: approval required.
- External communication and offensive security: approval/scope required.
