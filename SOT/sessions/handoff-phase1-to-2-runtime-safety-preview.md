# Phase Handoff — Runtime Safety and Preview Truth

Date: 2026-07-25 KST

Historical handoff note: the Hermes/Gajaecode disabled-capability statement
below was superseded on 2026-07-26 by the installed 0.2.14 managed-runtime
receipt. The safety/preview boundary remains applicable.

## Decisions

- Close the immediately exploitable prompt and direct-CLI gaps first because
  every autonomous workflow depends on this boundary.
- Remove raw provider sandbox bypass until Atelier owns a scoped action-policy
  and approval-receipt layer.
- Keep managed preview fail-closed and make the UI reflect that capability
  instead of weakening the backend policy.
- Include the PostCSS high advisory because a security regression blocks a
  trustworthy new source candidate.

## Rejected

- Enabling managed package-script preview without an Atelier-owned listener was
  rejected because the current macOS sandbox cannot guarantee loopback-only
  binding.
- Treating prompt matching as a complete action proxy was rejected; this cycle
  is an immediate guardrail improvement, not the final architecture.

## Risks

- False-positive safety matches: medium likelihood, high workflow impact;
  mitigate with clause-local tests in Korean and English.
- Legacy Full sessions changing behavior: high likelihood, beneficial security
  impact; migrate deterministically to Basic and reflect it in the UI.
- Frontend/backend capability drift: low likelihood after this change; mitigate
  with one backend capability contract and focused smoke coverage.

## F-Phase 2 Entry Conditions

- [x] Existing SOT and current code paths inspected.
- [x] User approval is explicit in the current request.
- [x] Files and parallel ownership boundaries identified.
- [x] DB/data deletion, deployment, publication, and push excluded.

## F-Phase 2 Closure

- Atelier `0.2.13` source gates pass: 209 all-feature Rust tests with 1 ignored,
  23 Orca smokes across 10 removable features, strict all-target/all-feature
  Clippy, format/diff checks, `npm audit` with 0 vulnerabilities, and RustSec
  with 0 known vulnerabilities plus 18 unmaintained and 2 unsound warnings.
- Managed preview remains fail-closed while separately trusted localhost
  inspection remains available.
- Basic is the default. Auto retains sandbox and approval enforcement; visible
  and raw Full bypass paths are removed.
- Managed capability is provider-specific: Claude/Codex support Basic/Auto;
  Hermes/Gajaecode managed execution advertises false, shows a disabled reason,
  and fails before lifecycle/spawn. Direct CLI remains a separate manual,
  limited path.
- A shared prompt corpus checks frontend and Rust guard behavior. It is defense
  in depth, not a complete action-level control.
- Successor priority is the P1 app-owned action/tool proxy and scoped approval
  receipt architecture.
- Handoff verdict: `supervised local candidate, public release blocked`.
- No public publish, public signing, notarization, deployment, DB/data deletion,
  paid action, or credential mutation occurred.
- The full source gate includes provider-capability hardening. The locally
  signed `0.2.13` package is installed and separately verified through exact
  executable hash equality, codesign, renderer readiness, and UI evidence.
- This install does not prove Developer ID signing, notarization, public
  distribution, or physical Windows behavior.
