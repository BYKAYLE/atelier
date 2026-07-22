# Offline Parallel Agent E2E

Status: source verified
Verified: 2026-07-21 KST
Release/install status: not packaged or installed

## Capability

Atelier now has a deterministic offline harness for the parallel-agent runtime.
It launches three turns through the real `agent_send` adapter boundary and real
child processes without using a provider API, credential, model, or network.

The harness proves:

- three turns are simultaneously registered;
- each turn receives its own canonical workspace path in the provider prompt;
- event channels do not contain another turn's marker;
- turns A and C complete while turn B alone is cancelled;
- every turn publishes exactly one terminal lifecycle state;
- cancelling B preserves A and C;
- the cancelled provider process and its child process are both reaped;
- the child registry is empty at completion;
- worktree creation, reuse, source-edit preservation, adoption, and conflict
  refusal pass in test-only temporary storage.

## Safety Boundary

- The launch override is compiled only under Rust `cfg(test)`.
- Tauri's mock runtime is enabled only as a development dependency.
- The fixture reuses the Rust test executable and cannot be selected from the
  production UI, configuration, or provider registry.
- Test worktrees and adoption receipts stay under unique temporary paths.
- Timeout and panic cleanup cancel any remaining fixture turns.
- `npm run harness:parallel-agent` reports `externalProviderCalls: 0`.

## Verification Command

```text
npm run harness:parallel-agent
```

Expected summary:

```json
{"ok":true,"provider":"offline test-only fixture","concurrentTurns":3,"completedTurns":2,"cancelledTurns":1,"eventIsolation":true,"terminalLifecycleExactlyOnce":true,"cancelledProcessTreeReaped":true,"worktreeIsolationTests":4,"externalProviderCalls":0}
```

## Truth Boundary

This is strong backend adapter/event/lifecycle/cancellation/process-tree proof,
combined with frontend orchestration contracts and independent worktree tests.
It is not yet a click-driven installed-app E2E from React through worktree
preparation and Tauri IPC, and it does not prove a real Qwen or other local
model response. Those remain separate next-stage tests after provider setup.
