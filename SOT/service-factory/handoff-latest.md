# Service Factory Handoff

factory_id: sf-20260531-133552
status: running
state_file: /Users/kansic/Service/atelier/SOT/service-factory-state.json
updated_at: 2026-07-29T23:52:44+09:00

## Goal
Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## Current Run Log
```json
{
  "current_owner": "Stella",
  "last_command": "service_factory.py review-report",
  "last_artifact": "/Users/kansic/Service/atelier/SOT/service-factory/artifact-review.md",
  "blocked_reason": null,
  "next_step": "continue next service_factory.py run cycle or review artifacts",
  "completion_claim_guard": {
    "probe_required": true,
    "probe_verified": true,
    "completion_claim_allowed": true,
    "blockers": [],
    "delivery_gate": {
      "blockers": []
    },
    "depth_gate": {
      "dod": {
        "checklist_present": true,
        "total": 8,
        "satisfied": 8,
        "unmet_ids": [],
        "fulfillment_rate": 1.0,
        "all_met": true
      },
      "elaboration_blockers": []
    },
    "parity_gate": {
      "budget": {
        "budget_present": false,
        "task_class": null,
        "classified": false,
        "discretion_enabled": false,
        "rounds_cap": 0
      },
      "discretion_blockers": [],
      "intent": {
        "ledger_present": false,
        "total": 0,
        "reconciled": 0,
        "unreconciled_ids": []
      }
    }
  },
  "command_owner": "Stella",
  "execution_controller": "Release"
}
```

## Handoff Contract
```json
{
  "factory_id": "sf-20260531-133552",
  "request_id": "research_intelligence::market_researcher",
  "run_id": null,
  "stage": "research_intelligence",
  "command_owner": "Stella",
  "current_owner": "Stella",
  "execution_controller": "Release",
  "successor_role": "market-researcher",
  "status": "queued",
  "backend": "command",
  "last_command": "service_factory.py review-report",
  "last_artifact": "/Users/kansic/Service/atelier/SOT/service-factory/artifact-review.md",
  "failure_category": null,
  "blocked_reason": null,
  "next_step": "continue next service_factory.py run cycle or review artifacts",
  "owned_paths": [
    "SOT/service-factory/market-research.md"
  ],
  "pending_artifacts": [],
  "approval_gate_snapshot": [
    {
      "evidence": [],
      "id": "db_data_deletion",
      "requires_human_approval": true,
      "status": "pending"
    },
    {
      "evidence": [],
      "id": "production_deploy",
      "requires_human_approval": true,
      "status": "pending"
    },
    {
      "evidence": [],
      "id": "paid_api_budget",
      "requires_human_approval": true,
      "status": "pending"
    },
    {
      "evidence": [],
      "id": "external_communication",
      "requires_human_approval": true,
      "status": "pending"
    },
    {
      "evidence": [],
      "id": "offensive_security",
      "requires_human_approval": true,
      "status": "pending"
    }
  ],
  "agent_topology_snapshot": {
    "version": "stella-factory-agent-topology-v1",
    "blueprints": 25,
    "instances": 36,
    "kanban_role": "projection_only"
  },
  "mandatory_requests_remaining": [],
  "retry_count": 0,
  "respawn_eligible": false,
  "lease_owner": null,
  "lease_expires_at": null,
  "resume_command": "python3 /Users/kansic/.claude/skills/release/scripts/service_factory.py run --state /Users/kansic/Service/atelier/SOT/service-factory-state.json --request research_intelligence::market_researcher --backend command",
  "completion_claim_guard": {
    "probe_required": true,
    "probe_verified": true,
    "completion_claim_allowed": true,
    "blockers": [],
    "delivery_gate": {
      "blockers": []
    },
    "depth_gate": {
      "dod": {
        "checklist_present": true,
        "total": 8,
        "satisfied": 8,
        "unmet_ids": [],
        "fulfillment_rate": 1.0,
        "all_met": true
      },
      "elaboration_blockers": []
    },
    "parity_gate": {
      "budget": {
        "budget_present": false,
        "task_class": null,
        "classified": false,
        "discretion_enabled": false,
        "rounds_cap": 0
      },
      "discretion_blockers": [],
      "intent": {
        "ledger_present": false,
        "total": 0,
        "reconciled": 0,
        "unreconciled_ids": []
      }
    }
  }
}
```

## Stage Counts
```json
{
  "blocked": 0,
  "discarded": 0,
  "done": 15,
  "in_progress": 0,
  "queued": 2,
  "validation_required": 0
}
```

## Queued Agent Requests
```json
[
  "research_intelligence::market_researcher",
  "research_intelligence::evidence_synthesizer",
  "research_intelligence::methodology_reviewer"
]
```

## Missing Capabilities
```json
[]
```

## Operating Contract
```json
{
  "required_order": [
    "current_state",
    "research_intelligence",
    "development_plan",
    "execution_verification"
  ],
  "rule": "Always inspect current state first, then run research intelligence and hypothesis QC, then write a goal-to-plan strategy, then execute and verify. Do not start implementation before current-state, research, and development-plan artifacts exist unless the user explicitly requests a trivial one-shot task.",
  "version": "state-plan-execute-v1",
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
      "id": "research_intelligence",
      "name": "Research Intelligence and Hypothesis QC",
      "rule": "Before product planning, run K-Dense-backed research, market/technical evidence gathering, hypothesis framing, counter-evidence search, and methodology review. Planning must cite this research lane instead of relying on unsupported intuition.",
      "artifacts": [
        "SOT/service-factory/research-dossier.md",
        "SOT/service-factory/evidence-map.md",
        "SOT/service-factory/research-qc.md"
      ]
    },
    {
      "id": "development_plan",
      "name": "Goal-to-Plan Strategy",
      "rule": "Convert the goal, current-state baseline, and research intelligence into a gap analysis, ordered task packets, role assignments, owned paths, done_when, and verification strategy.",
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
