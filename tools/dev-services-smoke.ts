import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync(new URL("../src-tauri/src/dev_services.rs", import.meta.url), "utf8");
const panel = readFileSync(
  new URL("../src/components/dev-services/DevServicesPanel.tsx", import.meta.url),
  "utf8",
);
const feature = readFileSync(
  new URL("../src/components/dev-services/feature.tsx", import.meta.url),
  "utf8",
);
const bindings = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

for (const token of [
  '"lsof"',
  '"-nP"',
  '"-iTCP"',
  '"-sTCP:LISTEN"',
  '"-Fpcn"',
  'fixed_output("netstat", &["-ano", "-p", "tcp"])',
  'fixed_output("ss", &["-ltnpH"])',
]) {
  assert.ok(backend.includes(token), `missing fixed scanner token: ${token}`);
}
assert.doesNotMatch(backend, /sh\s*-c|cmd(?:\.exe)?\s*\/C|powershell/i);
assert.match(backend, /service_for_pid_port\(input\.pid, input\.port\)/);
assert.match(backend, /service_for_pid_port\(pid, port\)/);
assert.match(backend, /constant_time_equal/);
assert.match(backend, /APPROVAL_TTL_MS/);
assert.match(backend, /\.remove\(action_id\.trim\(\)\)/);
assert.match(panel, /devServicesScan/);
assert.match(panel, /devServiceStopPrepare/);
assert.match(panel, /devServiceStopExecute/);
assert.match(panel, /window\.confirm\(prepared\.preview\)/);
assert.match(feature, /id: "dev-services"/);
assert.match(bindings, /export async function devServicesScan/);
assert.match(bindings, /export async function devServiceStopExecute/);
assert.match(app, /dev_services::dev_services_scan/);
assert.match(app, /dev_services::dev_service_stop_execute/);

console.log("development services smoke: passed");
