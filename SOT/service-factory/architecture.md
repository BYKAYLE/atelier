# Stella Factory Architecture

generated_at: 2026-05-31T13:56:15+09:00

## Goal

Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## Control Plane

Stella Factory is a control plane layered over Atelier's existing agent chat.
The frontend recognizes Stella Factory invocations, the Tauri backend creates or
resumes durable SOT state, and the Release Service Factory scripts execute the
long-running multi-agent workflow.

## Data Flow

1. User enters `스텔라 팩토리 ...` or `/goal ...`.
2. `src/lib/stellaFactory.ts` converts the natural language request into a
   product-scale factory prompt.
3. `src/components/AgentWorkspace.tsx` gathers preflight evidence through Tauri.
4. `src-tauri/src/stella.rs` writes bootstrap artifacts and state.
5. `service_factory.py` plans agent requests, executes managed cycles, records
   results, gates, recovery proof, and readiness.

## Risk Surface

- Local command execution must remain allowlisted and no-shell.
- Agent results must be validated before promotion.
- Safety gates for DB deletion, user-data deletion, production deploy, paid API
  expansion, external communication, and offensive security must remain intact.
- Generated worktrees and artifacts are evidence, not permission to overwrite
  unrelated user changes.
