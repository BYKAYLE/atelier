import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyGajaePrefixedInput } from "../src/lib/gajaeCommand.ts";

const naturalPrompt = "어 미러링이 되는거 확인 근데 내시경의 원형 마스크형태로 만들어줘";

assert.deepEqual(classifyGajaePrefixedInput(`/gjc ${naturalPrompt}`), {
  kind: "prompt",
  prompt: naturalPrompt,
});
assert.deepEqual(classifyGajaePrefixedInput(`gjc ${naturalPrompt}`), {
  kind: "prompt",
  prompt: naturalPrompt,
});
assert.deepEqual(classifyGajaePrefixedInput("/gajecode 자연어 작업 요청"), {
  kind: "prompt",
  prompt: "자연어 작업 요청",
});
assert.deepEqual(classifyGajaePrefixedInput("/gjc --help"), {
  kind: "cli",
  args: ["--help"],
});
assert.deepEqual(classifyGajaePrefixedInput("/gjc skills read \"insane search\""), {
  kind: "cli",
  args: ["skills", "read", "insane search"],
});
assert.deepEqual(classifyGajaePrefixedInput("/gjc -p \"quick prompt\""), {
  kind: "cli",
  args: ["-p", "quick prompt"],
});
assert.deepEqual(classifyGajaePrefixedInput("/gjc team 3:executor implement the approved plan"), {
  kind: "cli",
  args: ["team", "3:executor", "implement", "the", "approved", "plan"],
});
assert.deepEqual(classifyGajaePrefixedInput("/gjc rlm inspect the benchmark"), {
  kind: "cli",
  args: ["rlm", "inspect", "the", "benchmark"],
});
assert.deepEqual(classifyGajaePrefixedInput("/gjc"), { kind: "empty" });
assert.deepEqual(classifyGajaePrefixedInput("/codex inspect this"), { kind: "none" });

const workspaceSource = readFileSync(new URL("../src/components/AgentWorkspace.tsx", import.meta.url), "utf8");
assert.match(
  workspaceSource,
  /\.\.\.GAJAE_CODE_COMMANDS/,
  "Gajae Code commands must remain available in the slash command palette",
);
assert.doesNotMatch(
  workspaceSource,
  /gajecodeQuickCommands|gjc commands|gjc 명령어/,
  "Gajae Code management commands must not occupy a persistent composer toolbar",
);
assert.match(workspaceSource, /data-testid="gajae-primary-actions"/);
assert.equal(
  workspaceSource.match(/primaryLabelKo:/g)?.length,
  3,
  "Only GJC, Team, and RLM should be persistent Gajae Code actions",
);
for (const command of ["/gjc ", "/gjc team 3:executor ", "/gjc rlm "]) {
  assert.match(workspaceSource, new RegExp(`insert: "${command}"`));
}

console.log("gajae command routing smoke: ok");
