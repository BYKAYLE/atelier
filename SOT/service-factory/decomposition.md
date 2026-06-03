# Stella Factory Decomposition

generated_at: 2026-05-31T13:56:16+09:00

## Goal

Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## Milestones

1. Product brief and repo map.
2. Architecture and decomposition.
3. Managed implementation/runtime proof.
4. Independent review, critic, security, and Probe checks.
5. Deployment readiness and final audit.

## Agent Requests

- `product_brief::product_manager`: stage `product_brief`, agent `product-manager`, status `completed`
- `repo_map::repo_mapper`: stage `repo_map`, agent `code-mapper`, status `completed`
- `architecture::architect`: stage `architecture`, agent `architect-reviewer`, status `completed`
- `decomposition::decomposer`: stage `decomposition`, agent `project-manager`, status `queued`
- `integration::integrator`: stage `integration`, agent `fullstack-developer`, status `queued`
- `verification::reviewer`: stage `verification`, agent `reviewer`, status `queued`
- `verification::critic`: stage `verification`, agent `risk-manager`, status `queued`
- `security_review::security_auditor`: stage `security_review`, agent `security-auditor`, status `queued`
- `verification::runtime_probe`: stage `verification`, agent `Probe`, status `queued`
- `deployment_readiness::deployment_readiness`: stage `deployment_readiness`, agent `deployment-engineer`, status `queued`
- `final_audit::final_audit`: stage `final_audit`, agent `reviewer`, status `queued`
- `parallel_implementation::agent_runtime_worker`: stage `parallel_implementation`, agent `tooling-engineer`, status `queued`

## Parallel Groups

- Planning can run product brief and repo map with low conflict.
- Implementation must own bounded files and preserve unrelated changes.
- Verification, critic, security, Probe, release, and final audit can run after
  the implementation evidence is present.
