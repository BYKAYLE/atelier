# Service Factory Handoff

factory_id: sf-20260531-133552
status: validation_required
state_file: /Users/kansic/Service/atelier/SOT/service-factory-state.json
updated_at: 2026-05-31T23:30:35+09:00

## Goal
Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## Current Run Log
```json
{
  "current_owner": "Stella",
  "last_command": "service_factory.py review-report",
  "last_artifact": "/Users/kansic/Service/atelier/SOT/service-factory/artifact-review.md",
  "blocked_reason": "no_dispatchable_requests",
  "next_step": "resolve blocked dependencies or select a queued request",
  "command_owner": "Stella",
  "execution_controller": "Release"
}
```

## Handoff Contract
```json
{
  "factory_id": "sf-20260531-133552",
  "request_id": null,
  "run_id": "sf-run-20260531-233035",
  "stage": null,
  "command_owner": "Stella",
  "current_owner": "Stella",
  "execution_controller": "Release",
  "successor_role": null,
  "status": "validation_required",
  "backend": "command",
  "last_command": "service_factory.py review-report",
  "last_artifact": "/Users/kansic/Service/atelier/SOT/service-factory/artifact-review.md",
  "failure_category": null,
  "blocked_reason": "no_dispatchable_requests",
  "next_step": "resolve blocked dependencies or select a queued request",
  "owned_paths": [],
  "pending_artifacts": [],
  "approval_gate_snapshot": [
    {
      "id": "db_data_deletion",
      "status": "pending",
      "requires_human_approval": true,
      "evidence": []
    },
    {
      "id": "production_deploy",
      "status": "pending",
      "requires_human_approval": true,
      "evidence": []
    },
    {
      "id": "paid_api_budget",
      "status": "pending",
      "requires_human_approval": true,
      "evidence": []
    },
    {
      "id": "external_communication",
      "status": "pending",
      "requires_human_approval": true,
      "evidence": []
    },
    {
      "id": "offensive_security",
      "status": "pending",
      "requires_human_approval": true,
      "evidence": []
    }
  ],
  "agent_topology_snapshot": {
    "version": "stella-factory-agent-topology-v1",
    "blueprints": 15,
    "instances": 23,
    "kanban_role": "projection_only"
  },
  "mandatory_requests_remaining": [],
  "retry_count": 0,
  "respawn_eligible": false,
  "lease_owner": null,
  "lease_expires_at": null,
  "resume_command": "python3 /Users/kansic/.claude/skills/release/scripts/service_factory.py status --state /Users/kansic/Service/atelier/SOT/service-factory-state.json"
}
```

## Stage Counts
```json
{
  "blocked": 0,
  "discarded": 0,
  "done": 13,
  "in_progress": 0,
  "queued": 0,
  "validation_required": 0
}
```

## Queued Agent Requests
```json
[]
```

## Missing Capabilities
```json
[]
```

## Operating Contract
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

## Resume Rule
Read this handoff, then `SOT/service-factory-state.json`. Do not start new work before checking `run_log.next_step`, queued agent requests, file leases, and approval gates.
