import assert from "node:assert/strict";
import {
  beginAgentFleetAdoption,
  completeAgentFleetAdoption,
  detectAgentFleetPreset,
  failAgentFleetAdoption,
  finalizeInterruptedAgentFleetAdoption,
  latestAgentFleetAdoption,
  legacyAgentFleetAdoptionHistory,
  normalizeAgentFleetAdoptionHistory,
  selectAgentFleetProfileIds,
  summarizeAgentFleetCandidates,
} from "../src/components/agent-fleet/agentFleet.ts";

const profiles = [
  { id: "claude-primary", provider: "claude" },
  { id: "claude-review", provider: "claude" },
  { id: "codex-primary", provider: "codex" },
  { id: "hermes-primary", provider: "hermes" },
];

assert.deepEqual(selectAgentFleetProfileIds(profiles, "core"), ["claude-primary", "codex-primary"]);
assert.deepEqual(selectAgentFleetProfileIds(profiles, "balanced"), ["claude-primary", "codex-primary", "hermes-primary"]);
assert.deepEqual(selectAgentFleetProfileIds(profiles, "all"), profiles.map((profile) => profile.id));
assert.equal(
  detectAgentFleetPreset(profiles, ["hermes-primary", "claude-primary", "codex-primary"]),
  "balanced",
);

const summary = summarizeAgentFleetCandidates([
  { phase: "running" },
  { phase: "done" },
  { phase: "failed" },
  { phase: "waiting" },
]);
assert.deepEqual(summary, {
  running: 1,
  done: 1,
  failed: 1,
  waiting: 1,
  completed: 2,
  total: 4,
});

let history = beginAgentFleetAdoption(undefined, {
  id: "receipt-1",
  batchId: "batch-1",
  candidateSessionId: "candidate-1",
  sourceSessionId: "source-1",
  sourceCwd: "/workspace",
  worktreeCwd: "/worktrees/candidate-1",
  branch: "atelier/candidate-1",
  baseHead: "a".repeat(40),
  now: 100,
});
assert.equal(latestAgentFleetAdoption(history)?.status, "verifying");

history = completeAgentFleetAdoption(history, "receipt-1", {
  source_cwd: "/workspace",
  worktree_cwd: "/worktrees/candidate-1",
  branch: "atelier/candidate-1",
  base_head: "a".repeat(40),
  file_count: 4,
  additions: 27,
  deletions: 3,
  source_dirty_before: true,
  receipt_path: "/receipts/candidate-1.patch",
}, 200) || history;
const adopted = latestAgentFleetAdoption(history);
assert.equal(adopted?.status, "adopted");
assert.equal(adopted?.fileCount, 4);
assert.equal(adopted?.patchReceiptPath, "/receipts/candidate-1.patch");

history = beginAgentFleetAdoption(history, {
  id: "receipt-2",
  batchId: "batch-1",
  candidateSessionId: "candidate-1",
  now: 300,
});
history = failAgentFleetAdoption(history, "receipt-2", "patch conflict", 400) || history;
assert.equal(latestAgentFleetAdoption(history)?.status, "failed");
assert.equal(latestAgentFleetAdoption(history)?.error, "patch conflict");

const interrupted = finalizeInterruptedAgentFleetAdoption(beginAgentFleetAdoption(history, {
  id: "receipt-3",
  batchId: "batch-1",
  candidateSessionId: "candidate-1",
  now: 500,
}), 600);
assert.equal(latestAgentFleetAdoption(interrupted)?.status, "cancelled");
assert.equal(latestAgentFleetAdoption(interrupted)?.completedAt, 600);

const legacy = legacyAgentFleetAdoptionHistory({
  adoptedAt: 700,
  summary: "2 files · +9 -1",
  batchId: "batch-legacy",
  candidateSessionId: "candidate-legacy",
});
assert.equal(latestAgentFleetAdoption(legacy)?.status, "adopted");
assert.equal(latestAgentFleetAdoption(legacy)?.additions, 9);
assert.equal(normalizeAgentFleetAdoptionHistory({ receipts: [{ id: "invalid" }] }), undefined);

console.log(JSON.stringify({
  ok: true,
  presets: {
    core: selectAgentFleetProfileIds(profiles, "core"),
    balanced: selectAgentFleetProfileIds(profiles, "balanced"),
    all: selectAgentFleetProfileIds(profiles, "all"),
  },
  adoptedFiles: adopted?.fileCount,
  interrupted: latestAgentFleetAdoption(interrupted)?.status,
}));
