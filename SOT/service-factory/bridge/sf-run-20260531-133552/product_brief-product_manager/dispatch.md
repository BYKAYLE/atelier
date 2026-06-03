# Service Factory Codex Bridge Dispatch

factory_id: sf-20260531-133552
request_id: product_brief::product_manager
agent_type: product-manager
stage: product_brief
state_file: /Users/kansic/Service/atelier/SOT/service-factory-state.json
workspace: /Users/kansic/Service/atelier/.service-factory/worktrees/product_brief-product_manager
prompt_file: /Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/product_brief--product_manager.md
artifact_dir: /Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager
result_file: /Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager/result.json

## Mission
Complete only this Service Factory request. You are not alone in the codebase. Do not revert unrelated changes, and keep your work inside the assigned workspace and owned paths.

## Source Prompt
Read the prompt file above first. It contains the goal, owned paths, success criteria, forbidden actions, and required return shape.

## Required Output
Write `/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-133552/product_brief-product_manager/result.json` with JSON:

```json
{
  "status": "done|blocked|validation_required|failed",
  "modified_files": [],
  "commands_run": [],
  "artifacts": [],
  "findings_or_risks": [],
  "failure_category": null,
  "next_step": ""
}
```

## Guardrails
- Do not perform DB/data deletion.
- Do not run destructive filesystem commands.
- Do not deploy to production.
- Do not expand paid API budget.
- Do not communicate externally as the user/company.
- Do not run offensive security testing or broad scanning.
- If independent verification is missing, set `status` to `validation_required`.
