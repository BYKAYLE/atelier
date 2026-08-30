import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AgentWorkspace.tsx", import.meta.url), "utf8");

assert.match(
  source,
  /openDialog\(\{\s*directory: true,\s*multiple: false,/s,
  "new tasks must use the native single-directory picker",
);
assert.match(
  source,
  /const workspace = await pickProjectWorkspace\(\);\s*if \(!workspace\) return null;\s*setCwd\(workspace\);\s*return createSession\(profile, provider, workspace\);/s,
  "cancelling the folder picker must not create a task",
);
assert.match(
  source,
  /const createSession = \([\s\S]*?workspace: string,[\s\S]*?makeSession\(profile, provider, undefined, workspace\)/,
  "task creation must receive an explicit workspace instead of inheriting stale state",
);
assert.match(
  source,
  /cwd: workspace,/,
  "the selected project folder must be persisted on the task",
);
assert.match(
  source,
  /onClick=\{\(\) => void changeActiveWorkspace\(\)\}/,
  "the active task must expose folder recovery in the workspace header",
);
assert.match(
  source,
  /active\.cwd \|\| copy\.chooseWorkspace/,
  "the active project folder must remain visible",
);

console.log("workspace selection smoke passed");
