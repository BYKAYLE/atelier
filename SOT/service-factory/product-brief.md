# Stella Factory Product Brief

generated_at: 2026-05-31T13:56:14+09:00

## Goal

Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## Product Outcome

Stella Factory must turn a natural-language product goal into a durable,
multi-stage development run. It may not finish after one unrelated feature
patch. A run stays open until planning, implementation, verification, security,
release readiness, and final audit are either completed or blocked with
evidence.

## Acceptance Criteria

- `SOT/service-factory-state.json` is the durable source of truth.
- Agent requests are generated, executed, collected, and assessed.
- Managed runtime evidence exists, not only manual bridge instructions.
- Mandatory verification, security, deployment readiness, and final audit
requests complete before readiness promotion.
- DB/user-data deletion and production deploy remain approval-gated.
