# Service Factory Recovery Proof

factory_id: sf-20260531-133552
state_file: /Users/kansic/Service/atelier/SOT/service-factory-state.json
generated_at: 2026-05-31T23:30:36+09:00

## Verdict

- recovery_proof: ready
- recovered_requests: 2

## Recovery Pairs
```json
[
  {
    "request_id": "product_brief::product_manager",
    "predecessor_run_id": "sf-run-20260531-133552",
    "predecessor_backend": "codex_bridge",
    "predecessor_status": "validation_required",
    "predecessor_failure_category": null,
    "successor_run_id": "sf-run-20260531-135614",
    "successor_backend": "command",
    "successor_status": "completed",
    "successor_artifact_dir": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager"
  },
  {
    "request_id": "verification::reviewer",
    "predecessor_run_id": "sf-run-20260531-141543",
    "predecessor_backend": "command",
    "predecessor_status": "blocked",
    "predecessor_failure_category": "agent_unavailable",
    "successor_run_id": "sf-run-20260531-135617",
    "successor_backend": "command",
    "successor_status": "completed",
    "successor_artifact_dir": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135617/verification-reviewer"
  }
]
```

## Interpretation

This report proves the recovery path when at least one mandatory request has a failed, blocked, or validation-required predecessor run and a later managed backend successor run with completed evidence. It is a local-staging recovery proof, not a production rollback drill.
