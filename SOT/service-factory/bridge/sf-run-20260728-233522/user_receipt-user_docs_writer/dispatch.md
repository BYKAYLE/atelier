# Service Factory Codex Bridge Dispatch

factory_id: sf-20260531-133552
request_id: user_receipt::user_docs_writer
agent_type: documentation-engineer
stage: user_receipt
state_file: SOT/service-factory-state.json
workspace: /Users/kansic/Service/atelier/.service-factory/worktrees/user_receipt-user_docs_writer
prompt_file: /Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/user_receipt--user_docs_writer.md
artifact_dir: /Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233522/user_receipt-user_docs_writer
result_file: /Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233522/user_receipt-user_docs_writer/result.json

## Mission
Complete only this Service Factory request. You are not alone in the codebase. Do not revert unrelated changes, and keep your work inside the assigned workspace and owned paths.

## Source Prompt
Read the prompt file above first. It contains the goal, owned paths, success criteria, forbidden actions, and required return shape.

## Required Output
Write `/Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260728-233522/user_receipt-user_docs_writer/result.json` with JSON:

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
