# Stella Factory Development Plan

generated_at: 2026-05-31T19:45:55+09:00

## Goal

Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## Operating Method

1. 현재 상태 파악: 코드, 런타임, 설치본, SOT, 변경 파일, 검증 기준선을 먼저 확인한다.
2. 목표 달성 계획: 현재 상태와 목표 사이의 gap을 작업팩, 담당 역할, owned paths, done_when, 검증 명령으로 쪼갠다.
3. 실행/검증: 작업팩 단위로 구현하고 통합, Probe, 보안, 릴리스, 최종감사를 통과하지 못하면 계획으로 되돌린다.

## Contract

```json
{
  "version": "state-plan-execute-v1",
  "required_order": [
    "current_state",
    "development_plan",
    "execution_verification"
  ],
  "rule": "Always inspect current state first, then write a goal-to-plan strategy, then execute and verify. Do not start implementation before current-state and development-plan artifacts exist unless the user explicitly requests a trivial one-shot task.",
  "phases": [
    {
      "id": "current_state",
      "name": "Current State Discovery",
      "rule": "Inspect the real repo, runtime, installed app, SOT, dirty paths, existing capabilities, risks, and verification baseline before deciding implementation.",
      "artifacts": [
        "SOT/service-factory/current-state.md"
      ]
    },
    {
      "id": "development_plan",
      "name": "Goal-to-Plan Strategy",
      "rule": "Convert the goal and current-state baseline into a gap analysis, ordered task packets, role assignments, owned paths, done_when, and verification strategy.",
      "artifacts": [
        "SOT/service-factory/development-plan.md"
      ]
    },
    {
      "id": "execution_verification",
      "name": "Execution and Evidence Loop",
      "rule": "Execute bounded task packets, integrate changes, run Probe/security/release/final-audit gates, and loop back to planning on failure or missing evidence.",
      "artifacts": [
        "SOT/service-factory/progress.jsonl",
        "SOT/service-factory/artifact-review.md",
        "SOT/service-factory/antigravity-readiness.md"
      ]
    }
  ]
}
```

## Gap Strategy

- 스텔라팩토리는 바로 구현부터 시작하지 않는다.
- 먼저 `current-state.md`로 기준선을 고정하고, 이 문서로 실행 순서와 검증 전략을 정한다.
- 단일 기능 완료는 milestone 결과일 뿐이며, readiness가 `pilot_ready`/`full_ready`이거나 구체적 blocker가 있어야 종료한다.
- local worker evidence는 control-loop proof로 취급하고, 구현/보안/Probe/릴리스 판단에는 specialist evidence를 붙인다.

## Task Packets

- `current_state::state_mapper`: stage `current_state`, agent `code-mapper`, status `completed`, owned_paths=['SOT/service-factory/current-state.md']
- `development_plan::strategy_planner`: stage `development_plan`, agent `project-manager`, status `completed`, owned_paths=['SOT/service-factory/development-plan.md']
- `product_brief::product_manager`: stage `product_brief`, agent `product-manager`, status `completed`, owned_paths=['SOT/service-factory/product-brief.md']
- `repo_map::repo_mapper`: stage `repo_map`, agent `code-mapper`, status `completed`, owned_paths=['SOT/service-factory/repo-map.md']
- `architecture::architect`: stage `architecture`, agent `architect-reviewer`, status `completed`, owned_paths=['SOT/service-factory/architecture.md']
- `decomposition::decomposer`: stage `decomposition`, agent `project-manager`, status `completed`, owned_paths=['SOT/service-factory/decomposition.md']
- `parallel_implementation::builder`: stage `parallel_implementation`, agent `fullstack-developer`, status `completed`, owned_paths=[]
- `integration::integrator`: stage `integration`, agent `fullstack-developer`, status `completed`, owned_paths=[]
- `verification::reviewer`: stage `verification`, agent `reviewer`, status `completed`, owned_paths=['SOT/service-factory/reviewer-report.md']
- `verification::critic`: stage `verification`, agent `risk-manager`, status `completed`, owned_paths=['SOT/service-factory/critic-report.md']
- `security_review::security_auditor`: stage `security_review`, agent `security-auditor`, status `completed`, owned_paths=['SOT/service-factory/security-audit.md']
- `verification::runtime_probe`: stage `verification`, agent `Probe`, status `completed`, owned_paths=['SOT/service-factory/probe-report.md']
- `deployment_readiness::deployment_readiness`: stage `deployment_readiness`, agent `deployment-engineer`, status `completed`, owned_paths=['SOT/service-factory/deployment-readiness.md']
- `final_audit::final_audit`: stage `final_audit`, agent `reviewer`, status `completed`, owned_paths=['SOT/service-factory/final-audit.md']
- `parallel_implementation::agent_runtime_worker`: stage `parallel_implementation`, agent `tooling-engineer`, status `completed`, owned_paths=[]

## Verification Strategy

- Factory state validation is mandatory after plan/run/collect.
- Frontend and Rust checks run according to touched surfaces.
- Installed app parity is checked after Tauri packaging changes.
- Security, Probe, deployment readiness, and final audit remain required for readiness promotion.
