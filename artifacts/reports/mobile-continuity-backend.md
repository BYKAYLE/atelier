# Mobile continuity backend report

## Decision and boundary

- The renderer publishes a bounded, canonical-workspace-validated session snapshot through `mobile_control_sessions_publish`.
- The mobile HTTP surface receives only a redacted projection. It never returns an internal session id, complete workspace path, permission mode, provider session id, raw event/tool activity, reasoning, or attachment path.
- Direct continuation is a separate `task:followup` device scope. Legacy `command:propose` and `/api/v1/followups` remain the desktop-approval compatibility path.

## Implemented behavior

- In-memory trusted registry: 30 sessions, 100 messages/session, 12k message text, 1MB serialized payload; allowed providers and `basic`/`auto` permission modes only.
- Canonical workspace is used for the control-plane write while the validated renderer workspace spelling is retained as `expectedWorkspace` for exact-session runtime matching.
- Per-session revisions only rotate when its execution target tuple changes; heartbeat/message updates retain the revision. A registry heartbeat older than 15 seconds fails closed with the same 404 response for stale, unknown task, and revision mismatch.
- `POST /api/v1/session-followups` requires strict same-origin policy, device bearer authentication, `task:followup`, UUID task/client ids, and a 1..4000 character prompt. It queues only `task.dispatch` for the registered target; no new-session fallback exists.
- Request cache is device + client request id bounded to 256 receipts; duplicate requests replay the original receipt without a duplicate queue write. Rate limit is 10 accepted requests/device/minute.
- Mobile page now presents `Atelier 작업 이어가기`, redacted session history, active selection, direct continuation only when `taskFollowup` exists, read-only guidance otherwise, and signature-gated refresh rendering.

## Validation run

- `cargo fmt --check`
- `cargo clippy --features orca-mobile-control -- -D warnings`
- `cargo test --features orca-mobile-control mobile_continuity::tests -- --test-threads=1` (5 passed)
- `cargo test --features orca-mobile-control mobile_control::tests::static_home_external_js_and_request_policy_are_enforced -- --test-threads=1` (passed)
- `cargo test --features orca-mobile-control mobile_control::tests::session_followup_rate_limit_is_bounded_per_device -- --test-threads=1` (passed)

## Remaining verification

- Full desktop renderer publish/consumer integration needs an actual running app and a live device token. The backend rejects stale publish state by design, so the renderer must publish at a cadence below 15 seconds.
