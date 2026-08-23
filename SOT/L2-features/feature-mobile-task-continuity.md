# Feature: Mobile Existing-Task Continuity

Updated: 2026-08-03 KST
Status: implemented, locally installed, and live visibility verified

## User outcome

A paired iPhone or Android browser can list existing Atelier tasks, read a
bounded and redacted conversation, select one task, and submit the next
instruction into that same desktop session. The phone does not mirror macOS and
does not create a separate task to imitate continuity.

## Runtime contract

- Renderer assigns and persists one opaque UUID per desktop session.
- Renderer publishes at most 24 sessions and 60 user/assistant messages per
  session to an in-memory native registry with a heartbeat.
- Native code redacts credentials and full paths, emits workspace basename only,
  and omits provider session IDs, raw events, activities, diffs, attachments,
  token usage, and internal desktop session IDs.
- Direct continuation requires paired-device `task:followup`, strict Host and
  Origin, bearer token, current revision, UUID, bounded prompt, idempotency, and
  per-device rate limiting.
- Desktop rechecks opaque ID, workspace, provider, model, and permission mode,
  then appends to the exact session queue. Missing or changed targets fail closed
  and never enter the normal new-session path.
- The older `command:propose` flow remains a separate desktop-approval path.
- Only an explicit Tailscale start enables restart restore. Ordinary app Exit
  preserves that intent; explicit Stop disables it before Serve cleanup. Restore
  is bounded and reuses the same loopback-only, no-Funnel Tailscale checks.

## Installed evidence

- Version: `0.2.22`
- Candidate/installed SHA-256:
  `64de149c1842e0091db02724ca0c1b4c58cfb65c4d122114b38285371a29dbb6`
- Persisted store preserved: 3 sessions, 224 messages.
- Live tailnet projection: 3 sessions, 1 active, 180 bounded messages.
- Redaction/projection assertions: no internal session IDs, absolute workspace
  paths, raw execution fields, or obvious credential patterns.
- Existing `Mobile browser`: `monitor:read` plus `task:followup` enabled.
- `/atelier/health`: service `atelier-mobile-control`, version `0.2.22`, status
  `ok`.
- Tailnet only; no Funnel/public endpoint.
- Installed restart proof: the endpoint stopped with the app and automatically
  returned health `ok` after relaunch while the Mac was locked.

## Renderer recurrence prevention

- One React root is retained for the renderer lifetime.
- Global asynchronous failures cannot replace a committed application shell.
- Mobile projection validates legacy message shape and catches synchronous
  projection errors.
- Readiness requires a committed app shell and is refreshed as a heartbeat.

## Verification

- Production frontend build: pass.
- Mobile, remote follow-up, session-run, and agent-stream rendering smokes: pass.
- Rust all-feature: 276 passed, 0 failed, 6 ignored/manual.
- Strict Clippy, Rust format, and diff checks: pass.
- Candidate/installed codesign, hash equality, renderer readiness: pass.
- Installed ScreenCaptureKit visual evidence: pass.
  `artifacts/mobile-continuity-installed.png` records paired-device permission;
  `artifacts/mobile-continuity-tailnet-active.png` records the active installed
  tailnet-only server without exposing a pairing code.

## Boundaries

- No database, session, message, credential, or user file was deleted.
- A read-only runtime-probe device was paired to verify the live response; it
  was not granted continuation permission.
- A provider-backed follow-up was not injected into an existing user task solely
  for testing. Exact-session dispatch is covered by Rust and source-contract
  gates; the current paired phone is ready for the user's next real instruction.
- Physical Windows and public notarized distribution are not claimed.
