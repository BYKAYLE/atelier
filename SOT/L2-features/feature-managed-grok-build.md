# Feature: Managed Grok Build agent

Status: installed and authenticated local candidate
Updated: 2026-08-18 KST

## Goal

Expose xAI's official Grok Build CLI as a first-class Atelier agent without
depending on a user's global CLI, HOME, credentials, sessions, or skills.

## Implemented contract

- Fixed profile and structured provider id: `grok`.
- Managed macOS runtime under
  `Application Support/com.atelier.app/providers/grok`.
- Exact official binary pin: `1.0.4`; arm64/x86_64 SHA-256 values embedded.
- Developer ID signature verification before managed publication.
- Atelier-owned `HOME`, XDG state/cache/temp, `.grok` sessions, auth, and skills.
- Browser login restricted to approved `x.ai`/`grok.com` HTTPS roots.
- Optional `XAI_API_KEY` from the OS secure store, injected only into the child.
- JSON headless execution, final answer selection, session resume, cancellation,
  live-account model choices (`grok-4.6`, `grok-4.5`), effort selection, Basic
  read-only and Auto workspace sandbox policies.
- Terminal profile, automations, remote follow-up, mobile continuity, provider
  usage inventory, and provider-common answer rendering integration.
- Hermes and Gajaecode model-provider selectors expose API-backed Grok 4.5
  choices through their built-in xAI transports. These routes require the xAI
  API key and deliberately do not reuse the Grok CLI browser credential.

## Verified local state

- Grok: `1.0.4 (d846eb93d94d)`.
- Runtime receipt: schema 2, pin `1.0.4`, exact executable, zero injected skills.
- Grok binary SHA-256:
  `39366f7756a090b735cc1df8c93a8c0c3c7871555cf6cbb28f9351ca82936485`.
- xAI Developer ID team: `5Y6N3AJ54S`.
- Atelier installed candidate: `0.2.27`, renderer ready, candidate/install hashes
  equal.
- Authenticated proof: `grok-4.6`, read-only sandbox, one turn, final
  `GROK_ATELIER_OK`, `end_turn`, provider session ID returned.

## Remaining distribution boundary

Source presence, CLI installation, authentication, authenticated model response,
local app installation, and public distribution remain separate proof surfaces.
Developer ID notarization, public updater signing, and physical Windows proof
are not claimed.
