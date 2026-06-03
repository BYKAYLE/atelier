# Agent Launch Instructions

factory_id: sf-20260531-133552
request_id: repo_map::repo_mapper
agent_type: code-mapper
backend: manual
workspace: /Users/kansic/Service/atelier/.service-factory/worktrees/repo_map-repo_mapper
prompt_file: /Users/kansic/Service/atelier/SOT/service-factory/agent-prompts/repo_map--repo_mapper.md
artifact_dir: /Users/kansic/Service/atelier/SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper

## Action
Spawn the requested agent with the prompt file above. The agent must write its result as JSON-compatible handoff fields and preserve stdout/stderr/tool evidence under this artifact directory.

## Required Result Fields
- status: done|blocked|validation_required
- modified_files
- commands_run with exit codes
- artifacts
- findings_or_risks
- next_step

## Guardrails
Do not perform DB/data deletion, destructive filesystem deletion, production deployment, paid API budget expansion, external communication, or offensive security testing unless the state file has an explicit approved gate with evidence.
