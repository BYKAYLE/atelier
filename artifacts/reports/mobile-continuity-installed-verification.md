# Mobile continuity installed verification

Verified: 2026-08-03 KST

## Outcome

Installed Atelier `0.2.22` renders normally, keeps the existing 3 desktop tasks,
and exposes their bounded conversation through the tailnet-only mobile endpoint.
The existing `Mobile browser` is authorized to continue a selected task.

## Proof matrix

| Surface | Result |
| --- | --- |
| Persisted WebKit store (read only) | 3 sessions, 224 valid messages, unchanged |
| Live mobile monitor | 3 sessions, 1 active, 180 bounded messages |
| Response minimization | no internal session IDs, absolute paths, raw execution fields, or obvious secret patterns |
| Tailnet health | `atelier-mobile-control` 0.2.22, `ok` |
| Restart recovery | deliberate installed-app restart restored the same tailnet URL while Mac was locked |
| Existing paired phone | mobile task continuation enabled |
| Candidate vs installed | exact SHA-256 match |
| Renderer | shell-backed ready receipt and visual capture pass |
| Rust | 276 passed, 0 failed, 6 ignored/manual |

Executable SHA-256:
`64de149c1842e0091db02724ca0c1b4c58cfb65c4d122114b38285371a29dbb6`

Installed proof: `artifacts/macos-installed-candidate-proof.json`

Visual proofs: `artifacts/mobile-continuity-installed.png` (paired-device
continuation permission) and `artifacts/mobile-continuity-tailnet-active.png`
(installed renderer and active tailnet-only server).

The final installed hash is bound by the JSON installed proof. The visual files
record the same `0.2.22` UI flow before the final native redaction and restart
recovery hardening; they are UI evidence, not executable-hash evidence.

## Non-claims

This is a locally signed installed-Mac proof. Developer ID notarization, public
distribution, physical Windows, and an artificial paid/provider follow-up are
not claimed. No database or user data was deleted.
