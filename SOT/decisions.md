# Decisions

## 2026-08-03 — Restore only explicitly enabled Tailscale mobile access

Decision: a successful explicit Tailscale server start persists a private
restart preference. Ordinary app Exit preserves it, while explicit Stop disarms
it before attempting Serve cleanup. Startup restore is bounded, loopback-only,
tailnet-only, and re-runs the existing Funnel rejection checks.

Reason: mobile continuity cannot work while the Mac app silently drops its
endpoint on every restart, but silently enabling LAN or public access would
expand authority. Persisting only the user's Tailscale choice keeps continuity
without converting Atelier into a public service.

## 2026-08-03 — Mobile continuation targets an existing task, never a new task

Decision: a paired mobile device receives only a bounded redacted projection and
an opaque task ID. A direct instruction is accepted only with explicit
`task:followup` device scope, the current published revision, and an exact match
to the desktop-owned workspace/provider/model/permission tuple. Any stale,
missing, or changed target fails closed without calling the normal new-session
dispatcher.

Reason: mobile access is useful only when it preserves the user's current task
and provider resume context. Allowing the phone to choose execution identity or
fall back to a new task would make the visible continuity claim false.

## 2026-08-03 — A background rejection cannot replace the committed app shell

Decision: Atelier owns one React root for the lifetime of the renderer. The
global error handlers may show a fallback only before the shell commits;
afterward, non-fatal background errors are logged without replacing the UI.
Renderer readiness is reported only when the app shell exists and is refreshed
periodically. Mobile projection catches synchronous legacy-data errors locally.

Reason: the previous global fallback attempted a second `createRoot` after any
unhandled asynchronous error. That made an unrelated background failure capable
of converting a healthy installed window into a blank surface while an earlier
receipt still claimed `ready`.

Current disposition: `supervised local candidate, public release blocked`.

## 2026-08-02 — Keep composer identity actionable, not repetitive

Decision: remove the always-visible composer prose that repeats agent,
provider, managed-runtime, and bundled-skill identity. Preserve identity where
it controls behavior (model/provider selectors), preserve Gajae/Stella actions,
and preserve runtime/authentication banners only when they communicate a live
state or required action.

Reason: the repeated sentence consumed composer space without helping the user
act. Removing it reduces visual noise while keeping operational truth and
failure recovery visible.

## 2026-07-26 — Keep Hermes durable bundled source separate from runtime skills

Decision: obtain Hermes default skills from an exact pinned-commit `git archive`,
verify the archive against Git objects, preserve a SHA-256 durable source under
the provider root, and sync into the separate runtime skill tree only during
bootstrap/repair.

Reason:

- the real uv-built Hermes wheel omits the repository-root `skills/` directory;
- a mutable checkout or Mac-global skill directory cannot provide reproducible
  company-machine behavior;
- normal Hermes startup must not receive `HERMES_BUNDLED_SKILLS`, because that
  source is bootstrap input rather than writable runtime state;
- invalid prior trees must be quarantined rather than deleted.

## 2026-07-25 — Enable Hermes/Gajaecode managed runtime with reproducible bootstrap

Decision: make managed Hermes and Gajaecode supported on macOS through an
Atelier-owned pinned runtime and default-skill bootstrap path.

Reason:

- managed execution must be capability-aware and not depend on personal global
  Claude/Codex skill state;
- provider readiness needs explicit, bounded repair and verification states before
  first managed turn;
- OS containment and auth/state ownership must be handled by Atelier-owned
  boundaries, then reflected in the runtime identity shown to users.

## 2026-07-25 — Treat prompt guards as defense in depth

Decision: keep the shared prompt corpus and clause-local deny behavior as an
immediate guardrail, but do not represent it as a complete action boundary.

Reason: protected effects occur at provider tool/action execution time. The P1
architecture must place an app-owned proxy in that path and issue scoped,
expiring, one-use approval receipts for protected effects.

## 2026-07-25 — Remove Full and keep managed preview fail-closed

Decision: Basic is the default permission, Auto retains sandboxing and approval
checks, and visible/raw Full bypass paths remain removed. Atelier-managed preview
start remains disabled until an app-owned listener can enforce the binding
contract; separately trusted localhost inspection remains available.

Reason: the UI and persisted/runtime behavior must reflect the enforcement
Atelier can actually prove.

## 2026-07-25 — Make managed execution capability provider-specific

Decision: managed capability remains provider-specific and platform-scoped.
Claude/Codex support managed Basic/Auto in existing paths; Hermes and Gajaecode now
use Atelier-managed bootstrap and sandboxed execution on macOS with explicit
identity and automatic runtime repair semantics.

Reason: provider capability claims must reflect enforceable runtime ownership
and OS boundaries, not only picker display or static defaults.

## 2026-07-21 — Test the provider boundary without shipping a fake provider

Decision: use a Rust `cfg(test)` launch override and make the Rust test binary
act as the child provider fixture.

Reasons:

- exercises the real adapter, subprocess, event, lifecycle, and cancellation
  path;
- runs on macOS, Linux, and Windows without installing Gajae/Hermes/Qwen;
- cannot appear in a production provider list or accept user traffic;
- avoids provider credentials, API charges, and borrowed-server changes.

## 2026-07-21 — Keep worktree receipts inside the test store

Decision: production adoption continues using the application receipt folder,
while tests inject a receipt directory under their unique temporary store.

Reason: test verification must not touch user application data, even briefly.
