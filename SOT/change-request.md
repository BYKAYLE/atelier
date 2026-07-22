# Change Request: Offline Parallel Agent Runtime Verification

Status: approved for implementation
Approved by: user
Approved at: 2026-07-21 KST

## Request

Verify Atelier's currently hard-to-test self-hosted and parallel-agent behavior
before installing a local model on the temporary GPU server.

## Authorized Scope

- Add an offline, test-only provider launch seam.
- Exercise three concurrent agent turns through the real backend adapter,
  event, lifecycle, cancellation, subprocess, and process-group paths.
- Reuse the existing worktree isolation tests in the same verification gate.
- Add repeatable local commands and durable evidence.

## Explicit Boundaries

- Do not connect to an external model or provider API.
- Do not install Atelier, Gajae Code, Hermes, Qwen, or other software on the
  borrowed server in this phase.
- Do not modify provider credentials, databases, user data, or the installed
  `/Applications/Atelier.app` bundle.
- Do not publish, deploy, push, or create a release.
