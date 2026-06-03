# Service Factory Agent Request

factory_id: sf-20260531-133552
stage: development_plan
role: planner
agent_type: project-manager
status: completed
command_owner: Stella
execution_controller: Release

## Goal
Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## Mandatory Working Method
Every development request must follow this order:

1. Current state discovery: inspect the actual repo, runtime, SOT, dirty paths,
   installed/build state, capabilities, constraints, and verification baseline.
2. Goal-to-plan strategy: explain the gap from current state to the target,
   then define task packets with owner, owned paths, done_when, verification,
   and rollback/retry criteria.
3. Execution and verification loop: implement only the scoped task packet,
   integrate, verify, and loop back to the plan when evidence fails.

Do not begin broad implementation before current-state and development-plan
evidence exists. If the task is narrow enough to execute directly, state that
it is a narrow one-shot and still record the baseline and verification evidence.

Stella is the command owner. Release is the runtime adapter/state ledger for
dispatch, collect, gates, handoff, and recovery. Treat this request as an
AgentBlueprint until an actual run/result creates an AgentInstance.

## Owned Paths
[
  "SOT/service-factory/development-plan.md"
]

## Success Criteria
[
  "gap analysis",
  "ordered task packets",
  "execution and verification strategy"
]

## Forbidden Without Explicit User Approval
- DB/data deletion
- destructive migrations or volume deletion
- production deploy or production data writes
- paid API budget expansion
- external communication as the user/company
- offensive security testing or broad scanning

## Approval Gates
{
  "db_data_deletion": "forbidden_without_explicit_user_approval",
  "production_deploy": "requires_explicit_user_approval",
  "paid_api_budget": "requires_explicit_user_approval",
  "external_communication": "requires_explicit_user_approval",
  "offensive_security": "requires_explicit_user_approval_and_scope"
}

## Required Return Shape
Return JSON-compatible handoff fields:
- status: done|blocked|validation_required
- modified_files
- commands_run with exit codes
- artifacts
- findings or risks
- next_step

Do not mark the work done from self-check only. If independent verification is missing, use validation_required.
