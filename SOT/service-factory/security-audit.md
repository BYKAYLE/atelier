# Stella Factory Security Audit

generated_at: 2026-05-31T14:20:00+09:00

## Scope

Local Factory bootstrap/autopilot, state-file trust, command execution, child
result trust, and frontend-triggered Factory execution.

## Result

- CRITICAL: 0
- HIGH: 0
- MEDIUM: 0
- LOW: 1

## Findings Closed

- HIGH fixed: repo-controlled absolute or root-escaping `prompt_path` values
  are rejected, and unknown preserved request entries are dropped during plan
  merge.
- MEDIUM fixed: child `result.json` trust now requires matching `request_id`,
  matching `run_id`, matching artifact directory, existing artifact paths, and
  structured command evidence.
- LOW reduced: `/analyze` no longer launches the managed autopilot path; only
  explicit Factory goal mode does.

## Residual Risk

- The goal path can still run a long local Factory cycle. This matches the
  requested "스텔라팩토리 호출 시 끝까지 진행" behavior, but a future UI should show
  cancellable background progress rather than blocking the send path.

## Safety Gates Preserved

- DB/user-data deletion: approval required.
- Production deploy/publication: approval required.
- Paid API expansion: approval required.
- External communication and offensive security: approval/scope required.
