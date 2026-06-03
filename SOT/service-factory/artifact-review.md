# Service Factory Artifact Review

factory_id: sf-20260531-133552
state_file: /Users/kansic/Service/atelier/SOT/service-factory-state.json
generated_at: 2026-05-31T23:30:36+09:00

## Validation
- valid: True
- errors: 0
- warnings: 0

## Approval Gates
```json
[
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/current_state-state_mapper",
    "finished_at": "2026-05-31T19:45:33+09:00",
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
    "failure_class": null,
    "next_step": "continue the Service Factory managed cycle",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194533/current_state-state_mapper/stderr.txt"
      }
    ]
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/development_plan-strategy_planner",
    "finished_at": "2026-05-31T19:45:55+09:00",
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
    "failure_class": null,
    "next_step": "continue the Service Factory managed cycle",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-194555/development_plan-strategy_planner/stderr.txt"
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/product_brief-product_manager",
    "finished_at": "2026-05-31T13:56:14+09:00",
    "modified_files": [
      "/Users/kansic/Service/atelier/.service-factory/worktrees/product_brief-product_manager/SOT/service-factory/product-brief.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager/product-brief.md",
      "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager/result.json"
    ],
    "dispatch_path": "/Users/kansic/Service/atelier/SOT/service-factory/bridge/sf-run-20260531-133552/product_brief-product_manager/dispatch.md",
    "last_run_id": "sf-run-20260531-135614",
    "artifact_dir": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager",
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
    "failure_class": null,
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/stderr.txt"
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/repo_map-repo_mapper",
    "finished_at": "2026-05-31T13:56:15+09:00",
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
    "failure_class": null,
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/stderr.txt"
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/architecture-architect",
    "finished_at": "2026-05-31T13:56:15+09:00",
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
    "failure_class": null,
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/stderr.txt"
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/decomposition-decomposer",
    "finished_at": "2026-05-31T13:56:16+09:00",
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
    "failure_class": null,
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135615/decomposition-decomposer/stderr.txt"
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
    "artifacts": [
      "/Users/kansic/Service/atelier/SOT/service-factory/implementation-report.md"
    ],
    "validation_evidence": [
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/integration-integrator",
    "finished_at": "2026-05-31T13:56:17+09:00",
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
    "failure_class": null,
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/integration-integrator/stderr.txt"
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/verification-reviewer",
    "finished_at": "2026-05-31T14:15:43+09:00",
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
    "failure_class": "agent_unavailable",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/reviewer-report.md"
    ],
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "validation_resolved_at": "2026-05-31T14:17:33+09:00",
    "next_step": "spawn a specialist LLM agent for this mandatory review stage",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/stderr.txt"
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/verification-critic",
    "finished_at": "2026-05-31T13:56:18+09:00",
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
    "failure_class": "insufficient_independent_evidence",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/critic-report.md"
    ],
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "validation_resolved_at": "2026-05-31T14:17:42+09:00",
    "next_step": "spawn or attach specialist evidence for this mandatory stage",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/stderr.txt"
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/security_review-security_auditor",
    "finished_at": "2026-05-31T13:56:19+09:00",
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
    "failure_class": "insufficient_independent_evidence",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/security-audit.md"
    ],
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "validation_resolved_at": "2026-05-31T14:17:42+09:00",
    "next_step": "spawn or attach specialist evidence for this mandatory stage",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/stderr.txt"
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/verification-runtime_probe",
    "finished_at": "2026-05-31T13:56:18+09:00",
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
    "failure_class": "insufficient_independent_evidence",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/probe-report.md"
    ],
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "validation_resolved_at": "2026-05-31T14:17:42+09:00",
    "next_step": "spawn or attach specialist evidence for this mandatory stage",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/stderr.txt"
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/deployment_readiness-deployment_readiness",
    "finished_at": "2026-05-31T13:56:19+09:00",
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
    "failure_class": "insufficient_independent_evidence",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/deployment-readiness.md"
    ],
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "validation_resolved_at": "2026-05-31T14:17:42+09:00",
    "next_step": "spawn or attach specialist evidence for this mandatory stage",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135619/deployment_readiness-deployment_readiness/stderr.txt"
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/final_audit-final_audit",
    "finished_at": "2026-05-31T13:56:20+09:00",
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
    "failure_class": "insufficient_independent_evidence",
    "validation_evidence": [
      "/Users/kansic/Service/atelier/SOT/service-factory/final-audit.md"
    ],
    "validation_note": "specialist evidence attached after reviewer/security audit fixes",
    "validation_resolved_at": "2026-05-31T14:17:42+09:00",
    "next_step": "spawn or attach specialist evidence for this mandatory stage",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135620/final_audit-final_audit/stderr.txt"
      }
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
    "worktree_path": "/Users/kansic/Service/atelier/.service-factory/worktrees/parallel_implementation-agent_runtime_worker",
    "finished_at": "2026-05-31T13:56:16+09:00",
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
    "failure_class": null,
    "next_step": "continue the Service Factory managed cycle until mandatory verification, security, deployment readiness, and final audit complete",
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
        "stdout_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker/stdout.txt",
        "stderr_path": "/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135616/parallel_implementation-agent_runtime_worker/stderr.txt"
      }
    ]
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
  "blueprint_count": 15,
  "instance_count": 23,
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
      "id": "blueprint:parallel_implementation::agent_runtime_worker",
      "type": "AgentBlueprint",
      "agent_type": "tooling-engineer",
      "stage": "parallel_implementation",
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
      "to": "blueprint:parallel_implementation::agent_runtime_worker",
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
    }
  ]
}
```

## Execution Plan
```json
{
  "runner_version": "0.2",
  "mode": "plan_only_until_parent_spawns_agents",
  "operating_contract": {
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
  },
  "worktree_isolation": {
    "enabled": true,
    "root": ".service-factory/worktrees",
    "policy": "one_writer_per_owned_path"
  },
  "parallel_groups": [
    {
      "id": "state_and_strategy",
      "stages": [
        "current_state",
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
    "parallel_implementation::agent_runtime_worker"
  ],
  "foundry_required": [],
  "last_run_id": "sf-run-20260531-233035"
}
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

## Known Issues
```json
[]
```
