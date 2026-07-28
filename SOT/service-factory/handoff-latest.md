# Service Factory Handoff

current_status: supervised_local_candidate_public_release_blocked
current_updated_at: 2026-07-26 KST

## Current Handoff

- Source candidate `0.2.14` passes 230 all-feature Rust tests with 3 ignored, 23
  Orca contract smokes across 10 removable features, strict
  all-target/all-feature Clippy, format/diff checks, `npm audit` 0, and RustSec
  0 known vulnerabilities with 18 unmaintained and 2 unsound warnings.
- Managed preview start is fail-closed; separately trusted localhost inspection
  remains available.
- Basic is the default. Auto retains sandboxing and approvals; visible/raw Full
  bypass is removed.
- Managed capability is provider-specific: Claude/Codex support Basic/Auto;
  Hermes/Gajaecode require pinned Atelier-owned macOS runtimes, isolated
  default skills, and sandbox readiness. Direct CLI remains a separate manual,
  limited path.
- Installed runtime receipts verify Gajaecode 0.11.7/Bun 1.3.14/four defaults
  and Hermes pinned commit/453 durable files/73 installed skills.
- Frontend and Rust guard behavior shares a prompt corpus. Phrase matching is
  defense in depth, not a complete action/tool guarantee.
- Successor P1: app-owned action/tool proxy plus scoped, expiring, one-use
  approval receipts.
- Locally signed `0.2.14` is installed and independently verified by matching
  candidate/installed executable SHA-256, codesign, renderer readiness, and UI
  evidence. The dirty-worktree proof uses the executable SHA-256 as the build
  identifier; HEAD is not unique build proof.
- The prior `0.2.13` app was moved, not deleted, to
  `/Users/kansic/Library/Application Support/Atelier/Backups/Atelier-0.2.13-before-0.2.14.app`.
- No public publish, Developer ID signing, notarization, or physical Windows
  proof was performed.

Verdict: `supervised local candidate, public release blocked`.

## Historical Factory Record

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
