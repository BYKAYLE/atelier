import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const preflight = readFileSync("tools/windows-physical-runner-preflight.ps1", "utf8");
const workflow = readFileSync(".github/workflows/windows-release-runner-doctor.yml", "utf8");

for (const contract of [
  '[CmdletBinding(DefaultParameterSetName = "Release")]',
  'ParameterSetName = "Doctor"',
  'phase = if ($isDoctor) { "windows-runner-doctor" }',
  'githubContextPresent = -not [string]::IsNullOrWhiteSpace($env:RUNNER_NAME)',
  'if (-not $isDoctor -or $RequireGitHubRunner)',
]) {
  assert.ok(preflight.includes(contract), `missing doctor preflight contract: ${contract}`);
}

for (const contract of [
  "workflow_dispatch:",
  "runs-on: [self-hosted, windows, x64]",
  '"-Doctor"',
  '"-RequireGitHubRunner"',
  '"-Strict"',
  "if: always()",
  "windows-runner-doctor.json",
]) {
  assert.ok(workflow.includes(contract), `missing runner doctor workflow contract: ${contract}`);
}

assert.ok(
  preflight.includes('phase = if ($isDoctor) { "windows-runner-doctor" } else { "windows-runner-preflight" }'),
  "doctor reports must remain distinguishable from publication evidence",
);
assert.ok(
  !workflow.includes("gh release download") && !workflow.includes("--draft=false"),
  "runner doctor must not download or publish release assets",
);

console.log("Windows runner doctor smoke passed.");
