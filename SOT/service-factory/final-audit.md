# Stella Factory Final Audit

generated_at: 2026-07-11T04:24:00+09:00

## Judgment

Atelier 0.1.81 is a local release candidate. The stability pass closes the
observed cross-provider execution, OAuth URL, Windows launcher, credential
fan-out, retry, permission-default, and unsigned-release weaknesses at the code
and automated-gate levels. Active turns now expose stop controls and cancel the
full agent process group on Unix. Composer selection menus now share one compact,
viewport-safe implementation instead of mixing native and custom surfaces.

## Evidence-Based Status

- `code_test`: ready
- `mac_installed`: reflected, version 0.1.81
- `mac_public_release`: blocked by Developer ID/notarization
- `windows_ci_package`: release candidate
- `windows_interactive_oauth`: validation required on physical Windows
- `windows_public_installer`: blocked until SignPath output passes signed smoke

## Final Status

`release_candidate_with_external_gates`

The project must not be advertised as a fully public-distribution-ready build
until the external signing and physical-Windows checks above are evidenced.
