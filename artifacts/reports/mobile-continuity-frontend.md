# Mobile continuity frontend report

## Decision and implementation

- `AgentSession.mobileTaskId` is a persisted opaque UUID. New sessions use `crypto.randomUUID()` with a `crypto.getRandomValues()` UUID-v4 fallback. Older local-storage sessions without a valid UUID are migrated while retaining their existing session id, provider resume id, and messages.
- The always-mounted workspace publishes a debounced (300 ms) and five-second heartbeat snapshot through `mobile_control_sessions_publish`. The projection is limited to 24 recent sessions and 60 non-empty user/assistant messages per session, with text capped at 12,000 characters to match `mobile_continuity::MAX_TEXT_CHARS`.
- Snapshot input carries the exact trusted workspace, provider, model, permission mode, task id, and calculated status. It deliberately excludes attachments and paths, raw events, activities, intermediate drafts, diffs, provider session ids, and token data.
- Mobile continuation accepts `basic` and `auto` only, matching the native contract. Desktop `full` sessions are excluded from the mobile snapshot so one ineligible session cannot reject the entire publish.
- A `task.dispatch` payload marked `mobileContinuity: true` is handled before ordinary dispatch. It must resolve to the existing target session and match the task id, workspace, provider, model, and permission mode exactly. Invalid or stale requests fail through the existing control receipt path and never create a session.
- A valid mobile prompt is inserted as a natural-language queued turn with the original control request id. Busy sessions retain their current run and append the turn; an idle session removes its just-added queue record and starts the same turn through the normal run path, preserving provider resume behavior and final receipt completion.
- The paired-device control now distinguishes `task:followup` direct continuation from legacy `command:propose`. Legacy proposal capability remains visible and compatible but is not shown as direct mobile continuation permission.

## Validation

- `npm run smoke:mobile-control` passed.
- `npm run smoke:agent-performance` passed.
- `npm run smoke:agent-permission-capability` passed.
- `npm run smoke:agent-stream-rendering` passed.
- `npm run smoke:provider-runtime-identity` passed.
- `npm run build` passed (TypeScript strict and Vite). Vite reported its pre-existing large-chunk advisory only.

## Remaining integration risk

- This validates renderer/API contracts and source behavior. A paired-device runtime test still needs a real native `task:followup` request with a current snapshot to verify the end-to-end mobile HTTP receipt and that stale workspace/model values are rejected by both native and renderer gates.
