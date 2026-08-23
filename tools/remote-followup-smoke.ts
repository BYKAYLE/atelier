import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync(new URL("../src-tauri/src/remote_followup.rs", import.meta.url), "utf8");
const mobile = readFileSync(new URL("../src-tauri/src/mobile_control.rs", import.meta.url), "utf8");
const panel = readFileSync(
  new URL("../src/components/remote-followup/RemoteFollowupPanel.tsx", import.meta.url),
  "utf8",
);
const bindings = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const legacyMobileFollowup = mobile.slice(
  mobile.indexOf("async fn followup("),
  mobile.indexOf("fn mobile_routes()"),
);

assert.match(backend, /APPROVAL_TTL_MS/);
assert.match(backend, /constant_time_equal/);
assert.match(backend, /actions\.remove\(&action_id\)/);
assert.match(backend, /task\.dispatch/);
assert.match(backend, /mobile-followup:/);
assert.match(backend, /status != "pending" && status != "approving"/);
assert.doesNotMatch(backend, /"basic"\s*\|\s*"auto"\s*\|\s*"full"/);
assert.ok(legacyMobileFollowup.length > 0, "legacy mobile follow-up handler must remain available");
assert.doesNotMatch(legacyMobileFollowup, /enqueue_request\(/);
assert.match(legacyMobileFollowup, /remote_followup::submit_proposal/);
assert.match(mobile, /\/api\/v1\/followups/);
assert.match(mobile, /\/api\/v1\/session-followups/);
assert.match(panel, /정확한 실행 내용 확인/);
assert.match(panel, /승인하고 작업 큐에 등록/);
assert.doesNotMatch(panel, /option value="full"/);
assert.match(bindings, /remoteFollowupExecute/);
assert.match(app, /remote_followup::remote_followup_execute/);

console.log("remote follow-up smoke: passed");
