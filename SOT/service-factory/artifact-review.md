# Service Factory Artifact Review

factory_id: sf-20260531-133552
state_file: /Users/kansic/Service/atelier/SOT/service-factory-state.json
generated_at: 2026-07-29T23:52:44+09:00

## Validation
- valid: True
- errors: 0
- warnings: 0

## Completion Claim Guard
```json
{
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
```

## Approval Gates
```json
[
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
]
```

## Agent Requests
```json
[
  {
    "id": "current_state::state_mapper",
    "stage": "current_state",
    "agent_type": "code-mapper",
    "kind": "explorer",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/current-state.md"
    ],
    "success_criteria": [
      "current repo/runtime/SOT/install state",
      "verification baseline",
      "known constraints"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/current_state--state_mapper.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "last_run_id": "sf-run-20260531-194533",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/current-state.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper/stdout.txt"
    ],
    "next_step": "continue the Service Factory managed cycle",
    "failure_class": null,
    "finished_at": "2026-05-31T19:45:33+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/current_state-state_mapper",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper",
          "--request-id",
          "current_state::state_mapper",
          "--agent-type",
          "code-mapper",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/current_state--state_mapper.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/current_state-state_mapper",
          "--run-id",
          "sf-run-20260531-194533"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper/stdout.txt"
      }
    ]
  },
  {
    "id": "research_intelligence::research_director",
    "stage": "research_intelligence",
    "agent_type": "k-dense-researcher",
    "kind": "planner",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/research-dossier.md"
    ],
    "success_criteria": [
      "k-dense skill routing plan",
      "literature/database/source strategy",
      "hypotheses and counter-hypotheses",
      "evidence quality tiers"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/research_intelligence--research_director.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "last_run_id": "sf-run-20260729-235243",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/research_intelligence-research_director",
    "finished_at": "2026-07-29T23:52:44+09:00",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/research-dossier.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-235243/research_intelligence-research_director/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-235243/research_intelligence-research_director/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-235243/research_intelligence-research_director/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-235243/research_intelligence-research_director/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-235243/research_intelligence-research_director/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-235243/research_intelligence-research_director/stdout.txt"
    ],
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-235243/research_intelligence-research_director",
          "--request-id",
          "research_intelligence::research_director",
          "--agent-type",
          "k-dense-researcher",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/research_intelligence--research_director.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/research_intelligence-research_director",
          "--run-id",
          "sf-run-20260729-235243"
        ],
        "exit_code": 0,
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-235243/research_intelligence-research_director/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-235243/research_intelligence-research_director/stderr.txt"
      }
    ],
    "failure_class": null,
    "next_step": "continue the Service Factory managed cycle"
  },
  {
    "id": "research_intelligence::market_researcher",
    "stage": "research_intelligence",
    "agent_type": "market-researcher",
    "kind": "planner",
    "status": "queued",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/market-research.md"
    ],
    "success_criteria": [
      "competitor/substitute landscape",
      "adoption and positioning risks",
      "freshness and source caveats"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/research_intelligence--market_researcher.md",
    "spawn_policy": "spawn_when_stage_unblocked"
  },
  {
    "id": "research_intelligence::evidence_synthesizer",
    "stage": "research_intelligence",
    "agent_type": "knowledge-synthesizer",
    "kind": "planner",
    "status": "queued",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/evidence-map.md"
    ],
    "success_criteria": [
      "deduplicated claims",
      "confidence levels",
      "decision implications",
      "unresolved conflicts"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/research_intelligence--evidence_synthesizer.md",
    "spawn_policy": "spawn_when_stage_unblocked"
  },
  {
    "id": "research_intelligence::methodology_reviewer",
    "stage": "research_intelligence",
    "agent_type": "research-methodologist",
    "kind": "reviewer",
    "status": "queued",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/research-qc.md"
    ],
    "success_criteria": [
      "research design critique",
      "bias and falsification checks",
      "minimum next evidence slice"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/research_intelligence--methodology_reviewer.md",
    "spawn_policy": "spawn_when_stage_unblocked"
  },
  {
    "id": "development_plan::strategy_planner",
    "stage": "development_plan",
    "agent_type": "project-manager",
    "kind": "planner",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/development-plan.md"
    ],
    "success_criteria": [
      "gap analysis",
      "ordered task packets",
      "execution and verification strategy"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/development_plan--strategy_planner.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "last_run_id": "sf-run-20260531-194555",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/development-plan.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner/stdout.txt"
    ],
    "next_step": "continue the Service Factory managed cycle",
    "failure_class": null,
    "finished_at": "2026-05-31T19:45:55+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/development_plan-strategy_planner",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner",
          "--request-id",
          "development_plan::strategy_planner",
          "--agent-type",
          "project-manager",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/development_plan--strategy_planner.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/development_plan-strategy_planner",
          "--run-id",
          "sf-run-20260531-194555"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner/stdout.txt"
      }
    ]
  },
  {
    "id": "product_brief::product_manager",
    "stage": "product_brief",
    "agent_type": "product-manager",
    "kind": "planner",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/product-brief.md"
    ],
    "success_criteria": [
      "acceptance criteria",
      "user-visible core loop",
      "non-goals and forbidden actions"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/product_brief--product_manager.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "artifact_dir": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager",
    "modified_files": [
      "/Users/kansic/Service/atelier/.service-factory/worktrees/product_brief-product_manager/SOT/service-factory/product-brief.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager/product-brief.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager/result.json"
    ],
    "last_run_id": "sf-run-20260531-135614",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/product-brief.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager/product-brief.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/stdout.txt"
    ],
    "dispatch_path": "/Users/kansic/Service/atelier/SOT/service-factory/bridge/sf-run-20260531-133552/product_brief-product_manager/dispatch.md",
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
    "failure_class": null,
    "finished_at": "2026-05-31T13:56:14+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/product_brief-product_manager",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager",
          "--request-id",
          "product_brief::product_manager",
          "--agent-type",
          "product-manager",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/product_brief--product_manager.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/product_brief-product_manager",
          "--run-id",
          "sf-run-20260531-135614"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/stdout.txt"
      }
    ]
  },
  {
    "id": "repo_map::repo_mapper",
    "stage": "repo_map",
    "agent_type": "code-mapper",
    "kind": "explorer",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/repo-map.md"
    ],
    "success_criteria": [
      "entrypoints",
      "run commands",
      "high-risk surfaces"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/repo_map--repo_mapper.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "last_run_id": "sf-run-20260531-135614",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/repo-map.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/stdout.txt"
    ],
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
    "failure_class": null,
    "finished_at": "2026-05-31T13:56:15+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/repo_map-repo_mapper",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper",
          "--request-id",
          "repo_map::repo_mapper",
          "--agent-type",
          "code-mapper",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/repo_map--repo_mapper.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/repo_map-repo_mapper",
          "--run-id",
          "sf-run-20260531-135614"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/stdout.txt"
      }
    ]
  },
  {
    "id": "architecture::architect",
    "stage": "architecture",
    "agent_type": "architect-reviewer",
    "kind": "planner",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/architecture.md"
    ],
    "success_criteria": [
      "service boundaries",
      "data flow",
      "risk surface",
      "rollback assumptions"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/architecture--architect.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "last_run_id": "sf-run-20260531-135615",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/architecture.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/stdout.txt"
    ],
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
    "failure_class": null,
    "finished_at": "2026-05-31T13:56:15+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/architecture-architect",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect",
          "--request-id",
          "architecture::architect",
          "--agent-type",
          "architect-reviewer",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/architecture--architect.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/architecture-architect",
          "--run-id",
          "sf-run-20260531-135615"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/stdout.txt"
      }
    ]
  },
  {
    "id": "decomposition::decomposer",
    "stage": "decomposition",
    "agent_type": "project-manager",
    "kind": "planner",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/decomposition.md"
    ],
    "success_criteria": [
      "task breakdown",
      "file ownership",
      "parallel groups",
      "blocked dependencies"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/decomposition--decomposer.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "last_run_id": "sf-run-20260531-135615",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/decomposition.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer/stdout.txt"
    ],
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
    "failure_class": null,
    "finished_at": "2026-05-31T13:56:16+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/decomposition-decomposer",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer",
          "--request-id",
          "decomposition::decomposer",
          "--agent-type",
          "project-manager",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/decomposition--decomposer.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/decomposition-decomposer",
          "--run-id",
          "sf-run-20260531-135615"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer/stdout.txt"
      }
    ]
  },
  {
    "id": "parallel_implementation::builder",
    "stage": "parallel_implementation",
    "agent_type": "fullstack-developer",
    "kind": "worker",
    "status": "completed",
    "available": true,
    "owned_paths": [],
    "success_criteria": [
      "goal-specific implementation diff",
      "modified files",
      "local verification evidence"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/parallel_implementation--builder.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/implementation-report.md"
    ],
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/implementation-report.md"
    ],
    "validation_note": "actual implementation evidence attached after code, test, package, install, and security hardening verification",
    "validation_resolved_at": "2026-05-31T14:31:26+09:00"
  },
  {
    "id": "integration::integrator",
    "stage": "integration",
    "agent_type": "fullstack-developer",
    "kind": "integrator",
    "status": "completed",
    "available": true,
    "owned_paths": [],
    "success_criteria": [
      "integrated diff",
      "build/test rerun",
      "handoff to reviewers"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/integration--integrator.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "last_run_id": "sf-run-20260531-135616",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/integration-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator/stdout.txt"
    ],
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
    "failure_class": null,
    "finished_at": "2026-05-31T13:56:17+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/integration-integrator",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator",
          "--request-id",
          "integration::integrator",
          "--agent-type",
          "fullstack-developer",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/integration--integrator.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/integration-integrator",
          "--run-id",
          "sf-run-20260531-135616"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator/stdout.txt"
      }
    ]
  },
  {
    "id": "verification::reviewer",
    "stage": "verification",
    "agent_type": "reviewer",
    "kind": "reviewer",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/reviewer-report.md"
    ],
    "success_criteria": [
      "behavioral correctness",
      "regression risk",
      "real verification evidence"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/verification--reviewer.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/reviewer-report.md"
    ],
    "last_run_id": "sf-run-20260531-141543",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/reviewer-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135617/verification-reviewer/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135617/verification-reviewer/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135617/verification-reviewer/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135617/verification-reviewer/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135617/verification-reviewer/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135617/verification-reviewer/stdout.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/stdout.txt"
    ],
    "next_step": "spawn a specialist LLM agent for this mandatory review stage",
    "failure_class": "agent_unavailable",
    "finished_at": "2026-05-31T14:15:43+09:00",
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/verification-reviewer",
    "validation_resolved_at": "2026-05-31T14:17:33+09:00",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer",
          "--request-id",
          "verification::reviewer",
          "--agent-type",
          "reviewer",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/verification--reviewer.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/verification-reviewer",
          "--run-id",
          "sf-run-20260531-141543"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/stdout.txt"
      }
    ]
  },
  {
    "id": "verification::critic",
    "stage": "verification",
    "agent_type": "risk-manager",
    "kind": "critic",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/critic-report.md"
    ],
    "success_criteria": [
      "false-green risks",
      "mock-only risks",
      "missing rollback or edge cases"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/verification--critic.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/critic-report.md"
    ],
    "last_run_id": "sf-run-20260531-135618",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/critic-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/stdout.txt"
    ],
    "next_step": "spawn or attach specialist evidence for this mandatory stage",
    "failure_class": "insufficient_independent_evidence",
    "finished_at": "2026-05-31T13:56:18+09:00",
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/verification-critic",
    "validation_resolved_at": "2026-05-31T14:17:42+09:00",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic",
          "--request-id",
          "verification::critic",
          "--agent-type",
          "risk-manager",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/verification--critic.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/verification-critic",
          "--run-id",
          "sf-run-20260531-135618"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/stdout.txt"
      }
    ]
  },
  {
    "id": "security_review::security_auditor",
    "stage": "security_review",
    "agent_type": "security-auditor",
    "kind": "auditor",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/security-audit.md"
    ],
    "success_criteria": [
      "CRITICAL=0",
      "HIGH=0 or exception",
      "scope and evidence"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/security_review--security_auditor.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/security-audit.md"
    ],
    "last_run_id": "sf-run-20260531-135619",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/stdout.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/security-audit.md"
    ],
    "next_step": "spawn or attach specialist evidence for this mandatory stage",
    "failure_class": "insufficient_independent_evidence",
    "finished_at": "2026-05-31T13:56:19+09:00",
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/security_review-security_auditor",
    "validation_resolved_at": "2026-05-31T14:17:42+09:00",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor",
          "--request-id",
          "security_review::security_auditor",
          "--agent-type",
          "security-auditor",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/security_review--security_auditor.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/security_review-security_auditor",
          "--run-id",
          "sf-run-20260531-135619"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/stdout.txt"
      }
    ]
  },
  {
    "id": "verification::runtime_probe",
    "stage": "verification",
    "agent_type": "Probe",
    "kind": "auditor",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/probe-report.md"
    ],
    "success_criteria": [
      "probe exit code",
      "summary.json pass/fail",
      "report.md path"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/verification--runtime_probe.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/probe-report.md"
    ],
    "last_run_id": "sf-run-20260531-135618",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/probe-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/stdout.txt"
    ],
    "next_step": "spawn or attach specialist evidence for this mandatory stage",
    "failure_class": "insufficient_independent_evidence",
    "finished_at": "2026-05-31T13:56:18+09:00",
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/verification-runtime_probe",
    "validation_resolved_at": "2026-05-31T14:17:42+09:00",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe",
          "--request-id",
          "verification::runtime_probe",
          "--agent-type",
          "Probe",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/verification--runtime_probe.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/verification-runtime_probe",
          "--run-id",
          "sf-run-20260531-135618"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/stdout.txt"
      }
    ]
  },
  {
    "id": "deployment_readiness::deployment_readiness",
    "stage": "deployment_readiness",
    "agent_type": "deployment-engineer",
    "kind": "auditor",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/deployment-readiness.md"
    ],
    "success_criteria": [
      "staging or skip reason",
      "rollback plan",
      "release blockers"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/deployment_readiness--deployment_readiness.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/deployment-readiness.md"
    ],
    "last_run_id": "sf-run-20260531-135619",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/deployment-readiness.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness/stdout.txt"
    ],
    "next_step": "spawn or attach specialist evidence for this mandatory stage",
    "failure_class": "insufficient_independent_evidence",
    "finished_at": "2026-05-31T13:56:19+09:00",
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/deployment_readiness-deployment_readiness",
    "validation_resolved_at": "2026-05-31T14:17:42+09:00",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness",
          "--request-id",
          "deployment_readiness::deployment_readiness",
          "--agent-type",
          "deployment-engineer",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/deployment_readiness--deployment_readiness.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/deployment_readiness-deployment_readiness",
          "--run-id",
          "sf-run-20260531-135619"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness/stdout.txt"
      }
    ]
  },
  {
    "id": "final_audit::final_audit",
    "stage": "final_audit",
    "agent_type": "reviewer",
    "kind": "auditor",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/final-audit.md"
    ],
    "success_criteria": [
      "gate summary",
      "known issues",
      "delivery report",
      "residual risks"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/final_audit--final_audit.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/final-audit.md"
    ],
    "last_run_id": "sf-run-20260531-135620",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/final-audit.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit/stdout.txt"
    ],
    "next_step": "spawn or attach specialist evidence for this mandatory stage",
    "failure_class": "insufficient_independent_evidence",
    "finished_at": "2026-05-31T13:56:20+09:00",
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/final_audit-final_audit",
    "validation_resolved_at": "2026-05-31T14:17:42+09:00",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit",
          "--request-id",
          "final_audit::final_audit",
          "--agent-type",
          "reviewer",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/final_audit--final_audit.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/final_audit-final_audit",
          "--run-id",
          "sf-run-20260531-135620"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit/stdout.txt"
      }
    ]
  },
  {
    "id": "delivery::delivery_publisher",
    "stage": "delivery",
    "agent_type": "deployment-engineer",
    "kind": "auditor",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/delivery.md"
    ],
    "success_criteria": [
      "release channel publish executed (default: GitHub Release tag+artifact+install note)",
      "delivery verification evidence (release URL reachable / artifact download OK / web live URL 200 + probe smoke)",
      "production_deploy approval consumed with reference (pending approval = blocked)"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/delivery--delivery_publisher.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/delivery-verification-independent.md"
    ],
    "artifact_dir": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-232527/delivery-delivery_publisher",
    "modified_files": [
      "SOT/service-factory/delivery.md"
    ],
    "last_run_id": "sf-run-20260728-232527",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/delivery-verification-independent.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-232527/delivery-delivery_publisher/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-232527/delivery-delivery_publisher/result.json",
      "Atelier_0.2.15_aarch64.dmg (sha256 f23b2c19cb67afdb8c3774b3d9e8047f2347462cc4c9b2140ad269b8bd3457ac)",
      "SOT/service-factory/delivery.md",
      "https://github.com/BYKAYLE/atelier/releases/tag/v0.2.15"
    ],
    "dispatch_path": "/Users/kansic/Service/atelier/SOT/service-factory/bridge/sf-run-20260728-232527/delivery-delivery_publisher/dispatch.md",
    "next_step": "user_receipt: 사용자 문서 + 대표님 인수 확인",
    "failure_class": "child_result_trust_boundary",
    "finished_at": "2026-07-28T23:27:13+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/delivery-delivery_publisher",
    "validation_resolved_at": "2026-07-28T23:29:25+09:00",
    "commands_run": [
      "git tag -a v0.2.15 fd47fba",
      "git push origin v0.2.15",
      "gh release create v0.2.15 <dmg> --notes-file <notes>",
      "gh release view/download + sha256 대조",
      "curl -I release URL"
    ]
  },
  {
    "id": "user_receipt::user_docs_writer",
    "stage": "user_receipt",
    "agent_type": "documentation-engineer",
    "kind": "builder",
    "status": "completed",
    "available": true,
    "owned_paths": [
      "SOT/service-factory/user-receipt.md"
    ],
    "success_criteria": [
      "user-facing docs (설치·사용법·온보딩) exist at delivered channel",
      "ceo_acceptance recorded (데모 링크/실행 방법 제시 + 대표님 확인 기록 — 유일한 사람 게이트)"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/user_receipt--user_docs_writer.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/user-receipt.md"
    ],
    "artifact_dir": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233522/user_receipt-user_docs_writer",
    "modified_files": [
      "SOT/service-factory/user-receipt.md"
    ],
    "last_run_id": "sf-run-20260728-233522",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233522/user_receipt-user_docs_writer/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233522/user_receipt-user_docs_writer/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/user-receipt.md",
      "SOT/service-factory/user-receipt.md",
      "https://github.com/BYKAYLE/atelier/releases/tag/v0.2.15 (사용자 문서 실재)"
    ],
    "dispatch_path": "/Users/kansic/Service/atelier/SOT/service-factory/bridge/sf-run-20260728-233522/user_receipt-user_docs_writer/dispatch.md",
    "next_step": "대표님 인수 확인 접수 → resolve-validation → user_receipt done → delivered",
    "failure_class": null,
    "finished_at": "2026-07-28T23:35:23+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/user_receipt-user_docs_writer",
    "validation_resolved_at": "2026-07-29T00:02:14+09:00",
    "commands_run": [
      "릴리스 노트 사용자 문서 검증(gh release view)"
    ]
  },
  {
    "id": "parallel_implementation::agent_runtime_worker",
    "stage": "parallel_implementation",
    "agent_type": "tooling-engineer",
    "kind": "worker",
    "status": "completed",
    "available": true,
    "owned_paths": [],
    "success_criteria": [
      "Dynamic specialist for goal keywords: service factory, autonomous product delivery, spawn"
    ],
    "prompt_path": "SOT/service-factory/agent-prompts/parallel_implementation--agent_runtime_worker.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "last_run_id": "sf-run-20260531-135616",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/implementation-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker/agent-launch.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker/local-worker-report.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker/stderr.txt",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker/stdout.txt"
    ],
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
    "failure_class": null,
    "finished_at": "2026-05-31T13:56:16+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/parallel_implementation-agent_runtime_worker",
    "commands_run": [
      {
        "argv": [
          "/opt/homebrew/opt/python@3.14/bin/python3.14",
          "/Users/kansic/.claude/skills/release/scripts/service_factory_local_worker.py",
          "--artifact-dir",
          "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker",
          "--request-id",
          "parallel_implementation::agent_runtime_worker",
          "--agent-type",
          "tooling-engineer",
          "--state-file",
          "/Users/kansic/Service/atelier/SOT/service-factory-state.json",
          "--project",
          "/Users/kansic/Service/atelier",
          "--prompt-file",
          "/Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/parallel_implementation--agent_runtime_worker.md",
          "--worktree",
          "/Users/kansic/Service/atelier/.service-factory/worktrees/parallel_implementation-agent_runtime_worker",
          "--run-id",
          "sf-run-20260531-135616"
        ],
        "exit_code": 0,
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker/stderr.txt",
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker/stdout.txt"
      }
    ]
  },
  {
    "agent_type": "orchestration-reviewer",
    "artifact_dir": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233003/delivery-elaboration-1",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/delivery-elaboration-disposition.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233003/delivery-elaboration-1/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233003/delivery-elaboration-1/result.json",
      "이 result.json 자체가 갭 목록 산출물"
    ],
    "available": true,
    "commands_run": [
      "cat SOT/service-factory/delivery.md",
      "cat SOT/service-factory/delivery-verification-independent.md",
      "gh release view v0.2.15 --json body,assets",
      "gh release view v0.1.66 --json tagName,url",
      "gh release list --limit 20",
      "gh release view v0.1.66 --json assets -q '.assets[].name'",
      "grep -ri \"intel|x86_64|minimum|macos 1[0-9]\" SOT/service-factory/delivery.md SOT/service-factory/delivery-verification-independent.md",
      "grep -rli \"파일럿|pilot\" SOT/service-factory/*.md",
      "grep -B2 -A5 \"파일럿|pilot\" SOT/service-factory/mission-charter.md SOT/service-factory/deployment-readiness.md",
      "cat SOT/service-factory/current-state.md",
      "python3 -c \"json.load(open('SOT/service-factory-state.json')) -> approval_gates['production_deploy']\"",
      "grep -in \"롤백|rollback|이전 버전|revert|downgrade\" SOT/service-factory/delivery.md SOT/service-factory/delivery-verification-independent.md"
    ],
    "dispatch_path": "/Users/kansic/Service/atelier/SOT/service-factory/bridge/sf-run-20260728-233003/delivery-elaboration-1/dispatch.md",
    "elaboration_round": 1,
    "failure_class": "child_result_trust_boundary",
    "finished_at": "2026-07-28T23:33:03+09:00",
    "id": "delivery::elaboration-1",
    "kind": "self_elaboration",
    "last_run_id": "sf-run-20260728-233003",
    "modified_files": [],
    "next_step": "blocking 갭 없음 — 위 4건 non-blocking 권고를 릴리스 노트 개선(최소 OS 버전+플랫폼 스코프 고지+롤백 안내) 및 delivery-verification-independent.md 범위 확장(승인 게이트 증거 재현 항목 추가) 백로그로 반영 권고. 즉시 조치 불필요.",
    "owned_paths": [],
    "prompt_path": "SOT/service-factory/agent-prompts/delivery--elaboration-1.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "stage": "delivery",
    "status": "completed",
    "success_criteria": [
      "이 stage 산출물의 미커버 gap/빠진 디테일을 발굴한다",
      "발굴된 각 gap 을 resolve 하거나, gap 이 없으면 'gap 없음'을 명시 evidence 로 기록한다"
    ],
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/delivery-elaboration-disposition.md"
    ],
    "validation_resolved_at": "2026-07-28T23:33:35+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/delivery-elaboration-1"
  },
  {
    "agent_type": "orchestration-reviewer",
    "artifact_dir": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233335/delivery-elaboration-2",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/delivery-elaboration-disposition.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233335/delivery-elaboration-2/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233335/delivery-elaboration-2/result.json",
      "delivery-elaboration-disposition.md 대조"
    ],
    "available": true,
    "commands_run": [
      "gh release view v0.2.15 --json body",
      "gh release view v0.1.66 --json tagName,url",
      "gh release view v0.2.15 --json assets --jq '.assets[].name'",
      "gh release view v0.2.15 --json isDraft,isPrerelease,tagName,publishedAt"
    ],
    "dispatch_path": "/Users/kansic/Service/atelier/SOT/service-factory/bridge/sf-run-20260728-233335/delivery-elaboration-2/dispatch.md",
    "elaboration_round": 2,
    "failure_class": "child_result_trust_boundary",
    "finished_at": "2026-07-28T23:34:30+09:00",
    "id": "delivery::elaboration-2",
    "kind": "self_elaboration",
    "last_run_id": "sf-run-20260728-233335",
    "modified_files": [],
    "next_step": "delivery stage 종결",
    "owned_paths": [],
    "prompt_path": "SOT/service-factory/agent-prompts/delivery--elaboration-2.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "stage": "delivery",
    "status": "completed",
    "success_criteria": [
      "이 stage 산출물의 미커버 gap/빠진 디테일을 발굴한다",
      "발굴된 각 gap 을 resolve 하거나, gap 이 없으면 'gap 없음'을 명시 evidence 로 기록한다"
    ],
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/delivery-elaboration-disposition.md"
    ],
    "validation_resolved_at": "2026-07-28T23:34:49+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/delivery-elaboration-2"
  },
  {
    "agent_type": "orchestration-reviewer",
    "artifact_dir": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-000221/user_receipt-elaboration-1",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-000221/user_receipt-elaboration-1/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-000221/user_receipt-elaboration-1/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/user-receipt.md"
    ],
    "available": true,
    "commands_run": [
      "cat SOT/service-factory/user-receipt.md",
      "gh release view v0.2.15 --json body,tagName,publishedAt,assets",
      "gh repo view --json hasIssuesEnabled,url",
      "grep -i updater src-tauri/tauri.conf.json src-tauri/Cargo.toml",
      "curl -sI -L https://github.com/BYKAYLE/atelier/releases/latest/download/latest.json",
      "gh release view v0.1.66 --json body -q .body"
    ],
    "dispatch_path": "/Users/kansic/Service/atelier/SOT/service-factory/bridge/sf-run-20260729-000221/user_receipt-elaboration-1/dispatch.md",
    "elaboration_round": 1,
    "failure_class": "child_result_trust_boundary",
    "finished_at": "2026-07-29T00:04:15+09:00",
    "id": "user_receipt::elaboration-1",
    "kind": "self_elaboration",
    "last_run_id": "sf-run-20260729-000221",
    "modified_files": [],
    "next_step": "user_receipt 종결 → delivered",
    "owned_paths": [],
    "prompt_path": "SOT/service-factory/agent-prompts/user_receipt--elaboration-1.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "stage": "user_receipt",
    "status": "completed",
    "success_criteria": [
      "이 stage 산출물의 미커버 gap/빠진 디테일을 발굴한다",
      "발굴된 각 gap 을 resolve 하거나, gap 이 없으면 'gap 없음'을 명시 evidence 로 기록한다"
    ],
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/user-receipt.md"
    ],
    "validation_resolved_at": "2026-07-29T00:04:29+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/user_receipt-elaboration-1"
  },
  {
    "agent_type": "orchestration-reviewer",
    "artifact_dir": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-000429/user_receipt-elaboration-2",
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-000429/user_receipt-elaboration-2/events.jsonl",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260729-000429/user_receipt-elaboration-2/result.json",
      "/Users/kansic/Service/atelier/SOT/service-factory/user-receipt.md",
      "gh release view v0.2.15 body 실측",
      "user-receipt.md §H2 정련 결과 대조"
    ],
    "available": true,
    "commands_run": [
      "gh release view v0.2.15 --repo BYKAYLE/atelier --json body,isDraft,isPrerelease",
      "curl -sI https://github.com/BYKAYLE/atelier/releases/download/v0.2.15/latest.json"
    ],
    "dispatch_path": "/Users/kansic/Service/atelier/SOT/service-factory/bridge/sf-run-20260729-000429/user_receipt-elaboration-2/dispatch.md",
    "elaboration_round": 2,
    "failure_class": "child_result_trust_boundary",
    "finished_at": "2026-07-29T00:05:24+09:00",
    "id": "user_receipt::elaboration-2",
    "kind": "self_elaboration",
    "last_run_id": "sf-run-20260729-000429",
    "modified_files": [],
    "next_step": "user_receipt 종결 → delivered",
    "owned_paths": [],
    "prompt_path": "SOT/service-factory/agent-prompts/user_receipt--elaboration-2.md",
    "spawn_policy": "spawn_when_stage_unblocked",
    "stage": "user_receipt",
    "status": "completed",
    "success_criteria": [
      "이 stage 산출물의 미커버 gap/빠진 디테일을 발굴한다",
      "발굴된 각 gap 을 resolve 하거나, gap 이 없으면 'gap 없음'을 명시 evidence 로 기록한다"
    ],
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/user-receipt.md"
    ],
    "validation_resolved_at": "2026-07-29T00:05:24+09:00",
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/user_receipt-elaboration-2"
  }
]
```

## Agent Topology
```json
{
  "version": "stella-factory-agent-topology-v1",
  "command_owner": "Stella",
  "execution_controller": "Release",
  "source_of_truth": "SOT/service-factory-state.json",
  "kanban_role": "projection_only",
  "agent_creation_rule": "AgentBlueprint designs specialists; AgentInstance proves a spawned/run unit; AgentManifest is only reusable after a manifest exists.",
  "not_agent_creation": [
    "prompt file only",
    "worktree path only",
    "result file only without a blueprint/instance link",
    "kanban card only"
  ],
  "layers": [
    {
      "id": "command",
      "owner": "Stella",
      "responsibility": "goal normalization, AgentTopology, final readiness decision"
    },
    {
      "id": "runtime",
      "owner": "Release",
      "responsibility": "state ledger, dispatch, collect, gates, handoff, recovery"
    },
    {
      "id": "specialists",
      "owner": "AgentBlueprint/AgentInstance",
      "responsibility": "bounded research, implementation, review, Probe, security, release audit"
    }
  ],
  "blueprint_count": 25,
  "instance_count": 36,
  "manifest_candidates": [],
  "nodes": [
    {
      "id": "stella",
      "type": "CommandOwner",
      "owner": "Stella"
    },
    {
      "id": "release",
      "type": "ExecutionController",
      "owner": "Release"
    },
    {
      "id": "blueprint:current_state::state_mapper",
      "type": "AgentBlueprint",
      "agent_type": "code-mapper",
      "stage": "current_state",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:research_intelligence::research_director",
      "type": "AgentBlueprint",
      "agent_type": "k-dense-researcher",
      "stage": "research_intelligence",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:research_intelligence::market_researcher",
      "type": "AgentBlueprint",
      "agent_type": "market-researcher",
      "stage": "research_intelligence",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:research_intelligence::evidence_synthesizer",
      "type": "AgentBlueprint",
      "agent_type": "knowledge-synthesizer",
      "stage": "research_intelligence",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:research_intelligence::methodology_reviewer",
      "type": "AgentBlueprint",
      "agent_type": "research-methodologist",
      "stage": "research_intelligence",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:development_plan::strategy_planner",
      "type": "AgentBlueprint",
      "agent_type": "project-manager",
      "stage": "development_plan",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:product_brief::product_manager",
      "type": "AgentBlueprint",
      "agent_type": "product-manager",
      "stage": "product_brief",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:repo_map::repo_mapper",
      "type": "AgentBlueprint",
      "agent_type": "code-mapper",
      "stage": "repo_map",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:architecture::architect",
      "type": "AgentBlueprint",
      "agent_type": "architect-reviewer",
      "stage": "architecture",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:decomposition::decomposer",
      "type": "AgentBlueprint",
      "agent_type": "project-manager",
      "stage": "decomposition",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:parallel_implementation::builder",
      "type": "AgentBlueprint",
      "agent_type": "fullstack-developer",
      "stage": "parallel_implementation",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:integration::integrator",
      "type": "AgentBlueprint",
      "agent_type": "fullstack-developer",
      "stage": "integration",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:verification::reviewer",
      "type": "AgentBlueprint",
      "agent_type": "reviewer",
      "stage": "verification",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:verification::critic",
      "type": "AgentBlueprint",
      "agent_type": "risk-manager",
      "stage": "verification",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:security_review::security_auditor",
      "type": "AgentBlueprint",
      "agent_type": "security-auditor",
      "stage": "security_review",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:verification::runtime_probe",
      "type": "AgentBlueprint",
      "agent_type": "Probe",
      "stage": "verification",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:deployment_readiness::deployment_readiness",
      "type": "AgentBlueprint",
      "agent_type": "deployment-engineer",
      "stage": "deployment_readiness",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:final_audit::final_audit",
      "type": "AgentBlueprint",
      "agent_type": "reviewer",
      "stage": "final_audit",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:delivery::delivery_publisher",
      "type": "AgentBlueprint",
      "agent_type": "deployment-engineer",
      "stage": "delivery",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:user_receipt::user_docs_writer",
      "type": "AgentBlueprint",
      "agent_type": "documentation-engineer",
      "stage": "user_receipt",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:parallel_implementation::agent_runtime_worker",
      "type": "AgentBlueprint",
      "agent_type": "tooling-engineer",
      "stage": "parallel_implementation",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:delivery::elaboration-1",
      "type": "AgentBlueprint",
      "agent_type": "orchestration-reviewer",
      "stage": "delivery",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:delivery::elaboration-2",
      "type": "AgentBlueprint",
      "agent_type": "orchestration-reviewer",
      "stage": "delivery",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:user_receipt::elaboration-1",
      "type": "AgentBlueprint",
      "agent_type": "orchestration-reviewer",
      "stage": "user_receipt",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "blueprint:user_receipt::elaboration-2",
      "type": "AgentBlueprint",
      "agent_type": "orchestration-reviewer",
      "stage": "user_receipt",
      "manifest_status": "installed_or_builtin"
    },
    {
      "id": "instance:sf-run-20260531-133552::product_brief::product_manager",
      "type": "AgentInstance",
      "blueprint_id": "product_brief::product_manager",
      "status": "validation_required",
      "runtime": "codex_bridge"
    },
    {
      "id": "instance:sf-run-20260531-135614::product_brief::product_manager",
      "type": "AgentInstance",
      "blueprint_id": "product_brief::product_manager",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135614::repo_map::repo_mapper",
      "type": "AgentInstance",
      "blueprint_id": "repo_map::repo_mapper",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135615::architecture::architect",
      "type": "AgentInstance",
      "blueprint_id": "architecture::architect",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135615::decomposition::decomposer",
      "type": "AgentInstance",
      "blueprint_id": "decomposition::decomposer",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135616::parallel_implementation::agent_runtime_worker",
      "type": "AgentInstance",
      "blueprint_id": "parallel_implementation::agent_runtime_worker",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135616::integration::integrator",
      "type": "AgentInstance",
      "blueprint_id": "integration::integrator",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135617::verification::reviewer",
      "type": "AgentInstance",
      "blueprint_id": "verification::reviewer",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135618::verification::critic",
      "type": "AgentInstance",
      "blueprint_id": "verification::critic",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135618::verification::runtime_probe",
      "type": "AgentInstance",
      "blueprint_id": "verification::runtime_probe",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135619::security_review::security_auditor",
      "type": "AgentInstance",
      "blueprint_id": "security_review::security_auditor",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135619::deployment_readiness::deployment_readiness",
      "type": "AgentInstance",
      "blueprint_id": "deployment_readiness::deployment_readiness",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-135620::final_audit::final_audit",
      "type": "AgentInstance",
      "blueprint_id": "final_audit::final_audit",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-141543::verification::reviewer",
      "type": "AgentInstance",
      "blueprint_id": "verification::reviewer",
      "status": "blocked",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-141543::verification::reviewer",
      "type": "AgentInstance",
      "blueprint_id": "verification::reviewer",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260531-135618::verification::critic",
      "type": "AgentInstance",
      "blueprint_id": "verification::critic",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260531-135618::verification::runtime_probe",
      "type": "AgentInstance",
      "blueprint_id": "verification::runtime_probe",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260531-135619::security_review::security_auditor",
      "type": "AgentInstance",
      "blueprint_id": "security_review::security_auditor",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260531-135619::deployment_readiness::deployment_readiness",
      "type": "AgentInstance",
      "blueprint_id": "deployment_readiness::deployment_readiness",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260531-135620::final_audit::final_audit",
      "type": "AgentInstance",
      "blueprint_id": "final_audit::final_audit",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260531-141543::parallel_implementation::builder",
      "type": "AgentInstance",
      "blueprint_id": "parallel_implementation::builder",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260531-194533::current_state::state_mapper",
      "type": "AgentInstance",
      "blueprint_id": "current_state::state_mapper",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260531-194555::development_plan::strategy_planner",
      "type": "AgentInstance",
      "blueprint_id": "development_plan::strategy_planner",
      "status": "completed",
      "runtime": "command"
    },
    {
      "id": "instance:sf-run-20260728-232527::delivery::delivery_publisher",
      "type": "AgentInstance",
      "blueprint_id": "delivery::delivery_publisher",
      "status": "validation_required",
      "runtime": "codex_bridge"
    },
    {
      "id": "instance:sf-run-20260728-232527::delivery::delivery_publisher",
      "type": "AgentInstance",
      "blueprint_id": "delivery::delivery_publisher",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260728-233003::delivery::elaboration-1",
      "type": "AgentInstance",
      "blueprint_id": "delivery::elaboration-1",
      "status": "validation_required",
      "runtime": "codex_bridge"
    },
    {
      "id": "instance:sf-run-20260728-233003::delivery::elaboration-1",
      "type": "AgentInstance",
      "blueprint_id": "delivery::elaboration-1",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260728-233335::delivery::elaboration-2",
      "type": "AgentInstance",
      "blueprint_id": "delivery::elaboration-2",
      "status": "validation_required",
      "runtime": "codex_bridge"
    },
    {
      "id": "instance:sf-run-20260728-233335::delivery::elaboration-2",
      "type": "AgentInstance",
      "blueprint_id": "delivery::elaboration-2",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260728-233522::user_receipt::user_docs_writer",
      "type": "AgentInstance",
      "blueprint_id": "user_receipt::user_docs_writer",
      "status": "validation_required",
      "runtime": "codex_bridge"
    },
    {
      "id": "instance:sf-run-20260728-233522::user_receipt::user_docs_writer",
      "type": "AgentInstance",
      "blueprint_id": "user_receipt::user_docs_writer",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260729-000221::user_receipt::elaboration-1",
      "type": "AgentInstance",
      "blueprint_id": "user_receipt::elaboration-1",
      "status": "validation_required",
      "runtime": "codex_bridge"
    },
    {
      "id": "instance:sf-run-20260729-000221::user_receipt::elaboration-1",
      "type": "AgentInstance",
      "blueprint_id": "user_receipt::elaboration-1",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260729-000429::user_receipt::elaboration-2",
      "type": "AgentInstance",
      "blueprint_id": "user_receipt::elaboration-2",
      "status": "validation_required",
      "runtime": "codex_bridge"
    },
    {
      "id": "instance:sf-run-20260729-000429::user_receipt::elaboration-2",
      "type": "AgentInstance",
      "blueprint_id": "user_receipt::elaboration-2",
      "status": "completed",
      "runtime": "validation_resolution"
    },
    {
      "id": "instance:sf-run-20260729-235243::research_intelligence::research_director",
      "type": "AgentInstance",
      "blueprint_id": "research_intelligence::research_director",
      "status": "completed",
      "runtime": "command"
    }
  ],
  "edges": [
    {
      "from": "stella",
      "to": "release",
      "relationship": "commands_runtime_adapter"
    },
    {
      "from": "stella",
      "to": "blueprint:current_state::state_mapper",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:research_intelligence::research_director",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:research_intelligence::market_researcher",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:research_intelligence::evidence_synthesizer",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:research_intelligence::methodology_reviewer",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:development_plan::strategy_planner",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:product_brief::product_manager",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:repo_map::repo_mapper",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:architecture::architect",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:decomposition::decomposer",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:parallel_implementation::builder",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:integration::integrator",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:verification::reviewer",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:verification::critic",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:security_review::security_auditor",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:verification::runtime_probe",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:deployment_readiness::deployment_readiness",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:final_audit::final_audit",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:delivery::delivery_publisher",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:user_receipt::user_docs_writer",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:parallel_implementation::agent_runtime_worker",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:delivery::elaboration-1",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:delivery::elaboration-2",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:user_receipt::elaboration-1",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "stella",
      "to": "blueprint:user_receipt::elaboration-2",
      "relationship": "authorizes_specialist_blueprint"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-133552::product_brief::product_manager",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135614::product_brief::product_manager",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135614::repo_map::repo_mapper",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135615::architecture::architect",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135615::decomposition::decomposer",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135616::parallel_implementation::agent_runtime_worker",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135616::integration::integrator",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135617::verification::reviewer",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135618::verification::critic",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135618::verification::runtime_probe",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135619::security_review::security_auditor",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135619::deployment_readiness::deployment_readiness",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135620::final_audit::final_audit",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-141543::verification::reviewer",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-141543::verification::reviewer",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135618::verification::critic",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135618::verification::runtime_probe",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135619::security_review::security_auditor",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135619::deployment_readiness::deployment_readiness",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-135620::final_audit::final_audit",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-141543::parallel_implementation::builder",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-194533::current_state::state_mapper",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260531-194555::development_plan::strategy_planner",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260728-232527::delivery::delivery_publisher",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260728-232527::delivery::delivery_publisher",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260728-233003::delivery::elaboration-1",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260728-233003::delivery::elaboration-1",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260728-233335::delivery::elaboration-2",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260728-233335::delivery::elaboration-2",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260728-233522::user_receipt::user_docs_writer",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260728-233522::user_receipt::user_docs_writer",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260729-000221::user_receipt::elaboration-1",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260729-000221::user_receipt::elaboration-1",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260729-000429::user_receipt::elaboration-2",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260729-000429::user_receipt::elaboration-2",
      "relationship": "dispatches_or_collects_instance"
    },
    {
      "from": "release",
      "to": "instance:sf-run-20260729-235243::research_intelligence::research_director",
      "relationship": "dispatches_or_collects_instance"
    }
  ]
}
```

## Execution Plan
```json
{
  "runner_version": "0.2",
  "mode": "spawn_runtime_command",
  "operating_contract": {
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
  },
  "worktree_isolation": {
    "enabled": true,
    "root": ".service-factory/worktrees",
    "policy": "one_writer_per_owned_path"
  },
  "parallel_groups": [
    {
      "id": "state_research_strategy",
      "stages": [
        "current_state",
        "research_intelligence",
        "development_plan"
      ],
      "max_parallel": 1
    },
    {
      "id": "planning",
      "stages": [
        "product_brief",
        "repo_map"
      ],
      "max_parallel": 2
    },
    {
      "id": "implementation",
      "stages": [
        "parallel_implementation"
      ],
      "max_parallel": 3
    },
    {
      "id": "review",
      "stages": [
        "verification",
        "security_review"
      ],
      "max_parallel": 3
    }
  ],
  "watchdog": {
    "enabled": true,
    "stale_after_minutes": 15,
    "progress_files": [
      "SOT/service-factory/progress.jsonl",
      "SOT/service-factory/handoff-latest.md"
    ],
    "action": "mark_blocked_or_respawn_from_handoff"
  },
  "handoff": {
    "enabled": true,
    "required_fields": [
      "factory_id",
      "request_id",
      "run_id",
      "stage",
      "command_owner",
      "current_owner",
      "execution_controller",
      "successor_role",
      "status",
      "backend",
      "last_command",
      "last_artifact",
      "failure_category",
      "blocked_reason",
      "next_step",
      "owned_paths",
      "pending_artifacts",
      "approval_gate_snapshot",
      "agent_topology_snapshot",
      "mandatory_requests_remaining",
      "retry_count",
      "respawn_eligible",
      "lease_owner",
      "lease_expires_at",
      "resume_command"
    ]
  },
  "automatic_gates": [
    {
      "id": "node-test",
      "cmd": "npm test",
      "argv": [
        "npm",
        "test"
      ],
      "stage": "verification",
      "optional": true,
      "trusted": false,
      "network_policy": "disabled_by_policy",
      "env_policy": "minimal_allowlist"
    },
    {
      "id": "node-build",
      "cmd": "npm run build",
      "argv": [
        "npm",
        "run",
        "build"
      ],
      "stage": "verification",
      "optional": true,
      "trusted": false,
      "network_policy": "disabled_by_policy",
      "env_policy": "minimal_allowlist"
    },
    {
      "id": "node-typecheck",
      "cmd": "npm run typecheck",
      "argv": [
        "npm",
        "run",
        "typecheck"
      ],
      "stage": "verification",
      "optional": true,
      "trusted": false,
      "network_policy": "disabled_by_policy",
      "env_policy": "minimal_allowlist"
    },
    {
      "id": "service-factory-validate",
      "cmd": "/opt/homebrew/opt/python@3.14/bin/python3.14 /Users/kansic/.claude/skills/release/scripts/service_factory.py validate --project .",
      "argv": [
        "/opt/homebrew/opt/python@3.14/bin/python3.14",
        "/Users/kansic/.claude/skills/release/scripts/service_factory.py",
        "validate",
        "--project",
        "."
      ],
      "stage": "final_audit",
      "optional": false,
      "trusted": true,
      "network_policy": "disabled_by_policy",
      "env_policy": "minimal_allowlist"
    }
  ],
  "ready_to_spawn": [
    "current_state::state_mapper",
    "research_intelligence::research_director",
    "research_intelligence::market_researcher",
    "research_intelligence::evidence_synthesizer",
    "research_intelligence::methodology_reviewer",
    "development_plan::strategy_planner",
    "product_brief::product_manager",
    "repo_map::repo_mapper",
    "architecture::architect",
    "decomposition::decomposer",
    "parallel_implementation::builder",
    "integration::integrator",
    "verification::reviewer",
    "verification::critic",
    "security_review::security_auditor",
    "verification::runtime_probe",
    "deployment_readiness::deployment_readiness",
    "final_audit::final_audit",
    "delivery::delivery_publisher",
    "user_receipt::user_docs_writer",
    "parallel_implementation::agent_runtime_worker",
    "delivery::elaboration-1",
    "delivery::elaboration-2",
    "user_receipt::elaboration-1",
    "user_receipt::elaboration-2"
  ],
  "foundry_required": [],
  "last_run_id": "sf-run-20260729-235243"
}
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

## Known Issues
```json
[]
```
