# Feature Plan: Offline Parallel Agent E2E

Last updated: 2026-07-21 KST

## Goal

Create a deterministic offline proof that Atelier can run independent agent
turns concurrently, route events by turn, cancel one turn without stopping the
others, preserve a single terminal lifecycle state, and reap the cancelled
turn's process tree.

## Implementation

1. Add a Rust `cfg(test)` launch override at the Gajae adapter boundary.
2. Drive the public `agent_send` and `agent_cancel` commands with a temporary
   local fixture executable under Tauri's mock runtime.
3. Assert three-turn event isolation, two successful completions, one explicit
   cancellation, empty child registry, and dead shell/child PIDs.
4. Add a platform-aware harness command and include it in the shared feature
   release gate without claiming Unix process-tree proof on Windows.
5. Run targeted and full frontend/Rust/security regression gates and record the
   exact source-layer result separately from installed-app truth.

## Acceptance Criteria

- The fixture cannot be selected or enabled in a production build.
- No external network, API key, provider login, or user configuration is used.
- All three turns emit only their own markers.
- Turns A and C complete; turn B ends exactly once as cancelled.
- Cancelling B does not terminate A or C and leaves no registered child or live
  fixture process.
- Existing worktree isolation tests and release audit remain green.
