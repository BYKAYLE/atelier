# Stella Factory Reviewer Report

generated_at: 2026-07-13T09:35:39+09:00

## Scope

Review of the Orca-informed local workspace and release-candidate upgrade
across:

- `src/components/AgentWorkspace.tsx`
- `src/lib/tauri.ts`
- `src-tauri/src/agent.rs`
- `src-tauri/src/agent_lifecycle.rs`
- `src-tauri/src/agent_registry.rs`
- `src-tauri/src/agent_worktree.rs`
- `src-tauri/src/credentials.rs`
- `src-tauri/src/pty.rs`
- `src-tauri/src/pty_output.rs`
- `src-tauri/src/pty_supervisor.rs`
- updater, packaging, physical-Windows workflows, and SOT evidence

## Findings Closed

- Long-running PTYs survive renderer and app-shell disconnects through a bounded
  loopback supervisor and replay journal; cancellation remains process-tree
  scoped.
- Provider execution uses one lifecycle/registry contract while retaining raw
  provider logs and provider-owned authentication boundaries.
- Codex model capability metadata changes actual effort/runtime flags; legacy
  values cannot silently select an unsupported execution mode.
- Task isolation preserves the user's existing dirty workspace and never
  resets, merges, or deletes it automatically.
- Preview HTTP/body/server evidence is bounded, URL-bound, and redacted before
  storage and again before provider context reuse.
- Click-to-select preview handoff is explicit and cancellable. Selector,
  geometry, shallow markup, and computed CSS are bounded and normalized again
  outside the inspected page before becoming next-request context.
- Normal/Store native tests, Windows cross-linking, real providers, package and
  installed macOS reflection, responsive UI, update contract, and release
  audits all have fresh evidence.
- The Windows CLI browser helper now reuses the signed Atelier executable and
  rejects unrelated HTTPS hosts before native activation. A flaky temporary
  Git index collision in parallel worktree adoption was reproduced, fixed with
  a per-process sequence, and passed five repeated parallel test runs.
- Windows release automation now distinguishes helper return, browser-process
  observation, and visible-window evidence. The workflow source passes
  actionlint, but no Windows execution receipt exists for this unpublished
  change.
- The long-session review found and closed a parent-level one-second rerender
  loop. Timer updates now stay inside one memoized activity row, composer typing
  remains ref-backed, and completed off-screen transcript nodes can skip layout
  and paint under a dedicated release smoke.
- The package-startup review found a false stall in the first readiness design:
  background WebKit can defer `requestAnimationFrame` indefinitely. Readiness
  now records at the React root mount, errors overwrite it, and native
  validation binds it to the exact version, live PID, canonical executable,
  main window, and freshness window.

## Review Judgment

No blocking native-runtime or local-package finding remains for the narrow
0.2.5 contract reviewed here. This does not close the broader product review:
the frontend has no component/E2E suite, core workspace components remain
monolithic, and multiple Orca-inspired workflows are beta, partial, or absent.
Those P0/P1 findings are tracked in `orca-parity-audit-2026-07-13.md`. Physical
Windows interactive proof and public Windows/macOS signing remain separate
external release gates.
