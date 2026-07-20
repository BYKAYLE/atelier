import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const backend = read("src-tauri/src/automations.rs");
const feature = read("src/components/automations/feature.tsx");
const page = read("src/components/automations/AutomationsPage.tsx");
const background = read("src/components/automations/AutomationBackground.tsx");
const bindings = read("src/lib/tauri.ts");
const app = read("src-tauri/src/lib.rs");

assert.match(feature, /id: "automations"/);
assert.match(feature, /settingsPage:/);
assert.match(feature, /background: AutomationBackground/);
assert.match(background, /automationsTick/);
assert.match(background, /Math\.max\(5, Math\.min\(300, tickSeconds\)\)/);

for (const command of [
  "automations_snapshot",
  "automation_upsert",
  "automation_set_enabled",
  "automation_run_now",
  "automations_tick",
]) {
  assert.match(backend, new RegExp(`fn ${command}`));
  assert.ok(app.includes(`automations::${command}`));
}

assert.match(backend, /enqueue_request\(\s*"task\.dispatch"/);
assert.doesNotMatch(backend, /Command::new|sh\s*-c|cmd(?:\.exe)?\s*\/C|powershell/i);
assert.match(backend, /Scheduled automations allow basic or auto permission only/);
assert.match(backend, /missed-run grace/i);
assert.match(backend, /canonical_workspace/);
assert.match(page, /automationRunNow/);
assert.match(page, /automationSetEnabled/);
assert.match(page, /No automations yet/);
assert.match(bindings, /export async function automationsSnapshot/);
assert.match(bindings, /export async function automationRunNow/);

console.log("automations smoke: passed");
