import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync(new URL("../src-tauri/src/computer_use.rs", import.meta.url), "utf8");
const panel = readFileSync(
  new URL("../src/components/computer-use/ComputerUsePanel.tsx", import.meta.url),
  "utf8",
);
const bindings = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

for (const action of ["atelier.focus", "browser.open", "preview.open"]) {
  assert.match(backend, new RegExp(action.replace(".", "\\.")));
}
assert.doesNotMatch(backend, /std::process::Command|\.shell\(\)\.command|crate::pty/);
assert.match(backend, /APPROVAL_TTL_MS/);
assert.match(backend, /constant_time_equal/);
assert.match(backend, /prepared\.remove\(action_id\.trim\(\)\)/);
assert.match(backend, /if !state\.enabled/);
assert.match(backend, /state\.prepared\.clear\(\)/);
assert.match(backend, /parsed\.scheme\(\) != "https"/);
assert.match(panel, /전체 중지/);
assert.match(panel, /이 동작만 승인/);
assert.match(bindings, /computerUseExecute/);
assert.match(app, /computer_use::computer_use_execute/);

console.log("computer use smoke: passed");
