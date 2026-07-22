import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  beginSessionRun,
  clearTurnTermination,
  finishSessionRun,
  markTurnTermination,
} from "../src/components/agent-runtime/sessionRunRegistry.ts";

let runs = {};
const first = beginSessionRun(runs, "session-a", "turn-a");
assert.equal(first.accepted, true);
runs = first.registry;

const parallel = beginSessionRun(runs, "session-b", "turn-b");
assert.equal(parallel.accepted, true, "independent sessions must run concurrently");
runs = parallel.registry;

const duplicate = beginSessionRun(runs, "session-a", "turn-a-new");
assert.equal(duplicate.accepted, false, "one session must own only one active turn");
assert.equal(duplicate.registry, runs, "rejected runs must not publish a new registry");

const staleFinish = finishSessionRun(runs, "session-a", "turn-stale");
assert.equal(staleFinish.cleared, false, "a stale finalizer must not clear the live turn");
assert.equal(staleFinish.registry["session-a"], "turn-a");

const finished = finishSessionRun(runs, "session-a", "turn-a");
assert.equal(finished.cleared, true);
assert.equal(finished.registry["session-a"], undefined);
assert.equal(finished.registry["session-b"], "turn-b", "finishing one session must preserve background runs");

let intents = markTurnTermination({}, "turn-c", "interrupted");
intents = markTurnTermination(intents, "turn-c", "stopped");
intents = markTurnTermination(intents, "turn-c", "interrupted");
assert.equal(intents["turn-c"], "stopped", "an explicit stop must outrank an interruption");
assert.deepEqual(clearTurnTermination(intents, "turn-c"), {});

const workspace = readFileSync("src/components/AgentWorkspace.tsx", "utf8");
const hook = readFileSync("src/components/agent-runtime/useSessionRunRegistry.ts", "utf8");
assert.match(workspace, /useSessionRunRegistry\(\)/);
assert.match(workspace, /beginRunForSession\(sessionId, turnId\)/);
assert.match(workspace, /finishRunForSession\(sessionId, turnId\)/);
assert.doesNotMatch(workspace, /interruptedTurnIdsRef|stoppedTurnIdsRef/);
assert.match(hook, /busyTurnIdsRef\.current = next;\s*setBusyTurnIdsBySession\(next\)/);

console.log(JSON.stringify({
  ok: true,
  concurrentSessions: true,
  staleFinalizerGuard: true,
  stopPrecedence: true,
}));
