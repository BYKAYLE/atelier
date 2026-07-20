import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync(new URL("../src-tauri/src/computer_use.rs", import.meta.url), "utf8");
const panel = readFileSync(
  new URL("../src/components/computer-use/ComputerUsePanel.tsx", import.meta.url),
  "utf8",
);
const bindings = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const feature = readFileSync(
  new URL("../src/components/computer-use/feature.tsx", import.meta.url),
  "utf8",
);
const controlRequest = readFileSync(
  new URL("../src/components/computer-use/controlRequest.ts", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../src/components/AgentWorkspace.tsx", import.meta.url),
  "utf8",
);

for (const action of [
  "atelier.focus",
  "browser.open",
  "preview.open",
  "preview.screenshot",
  "preview.snapshot",
  "preview.click",
  "preview.type",
  "preview.key",
  "preview.resize",
]) {
  assert.match(backend, new RegExp(action.replace(".", "\\.")));
}
assert.doesNotMatch(backend, /std::process::Command|\.shell\(\)\.command|crate::pty/);
assert.match(backend, /APPROVAL_TTL_MS/);
assert.match(backend, /constant_time_equal/);
assert.match(backend, /prepared\.remove\(action_id\.trim\(\)\)/);
assert.match(backend, /if !state\.enabled/);
assert.match(backend, /state\.prepared\.clear\(\)/);
assert.match(backend, /state\.authorized\.clear\(\)/);
assert.match(backend, /parsed\.scheme\(\) != "https"/);
assert.match(backend, /matches!\(host, "localhost" \| "127\.0\.0\.1" \| "::1"\)/);
assert.match(backend, /computer_use_authorize/);
assert.match(backend, /computer_use_complete/);
assert.match(panel, /전체 중지/);
assert.match(panel, /이 동작만 승인/);
assert.match(panel, /devScreenScreenshot/);
assert.match(panel, /devScreenSnapshot/);
assert.match(panel, /devScreenClick/);
assert.match(panel, /devScreenType/);
assert.match(panel, /devScreenKey/);
assert.match(panel, /devScreenResize/);
assert.match(panel, /computerUsePrepared/);
assert.match(bindings, /computerUseExecute/);
assert.match(bindings, /computerUseAuthorize/);
assert.match(bindings, /computerUseComplete/);
assert.match(bindings, /computerUsePrepared/);
assert.match(app, /computer_use::computer_use_execute/);
assert.match(app, /computer_use::computer_use_authorize/);
assert.match(app, /computer_use::computer_use_complete/);
assert.match(app, /computer_use::computer_use_prepared/);
assert.match(feature, /controlRequestHandler:\s*handleComputerUseControlRequest/);
assert.match(controlRequest, /request\.action !== "computer\.use"/);
assert.match(controlRequest, /computerUsePrepare/);
assert.match(controlRequest, /value: optionalText\(request\.payload\.value\)/);
assert.match(workspace, /handleFeatureControlRequest\(request\)/);

console.log("computer use smoke: passed");
