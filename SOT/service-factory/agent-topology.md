# Atelier Stella Factory Agent Topology

generated_at: 2026-05-31T23:31:00+09:00
state_file: `/Users/kansic/Service/atelier/SOT/service-factory-state.json`

## Control Plane

- `Stella`: command owner, goal normalization, AgentTopology decision, final readiness judgment.
- `Release`: execution controller, state ledger, dispatch, collect, gates, handoff, recovery.
- `Kanban`: projection only. The source of truth is `SOT/service-factory-state.json`.

## Active Topology

- AgentBlueprints: 15
- AgentInstances: 23
- AgentManifest candidates missing: 0
- Factory readiness: `pilot_ready`
- Primary blocker: none

## Creation Rule

- `AgentBlueprint` means a task-scoped specialist design derived from the goal.
- `AgentInstance` means a spawned, dispatched, running, or completed work unit with result evidence.
- `AgentManifest` means a reusable specialist only after a manifest exists or is explicitly promoted.
- `agent_request` is a queue packet for Release; it is not by itself an AgentInstance.

Prompt files, worktree paths, result files, and kanban cards alone do not prove agent creation.

## Verification Snapshot

- `stella_command_owner`: ready
- `agent_topology`: ready
- `agent_runner_plan`: ready
- `spawn_runtime`: ready
- `mandatory_verification_chain`: ready
- `recovery_proof`: ready
