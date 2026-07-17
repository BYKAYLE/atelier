import assert from "node:assert/strict";
import {
  emptyLinearActionDraft,
  linearActionInput,
  searchLinearIssues,
  statesForDraft,
} from "../src/components/linear-workflows/linearWorkflow.ts";
import type { LinearWorkflowSnapshot } from "../src/lib/tauri.ts";

const snapshot: LinearWorkflowSnapshot = {
  schemaVersion: 1,
  connected: true,
  viewer: { id: "user-1", name: "Ada" },
  teams: [{
    id: "team-1",
    key: "ENG",
    name: "Engineering",
    states: [
      { id: "done", name: "Done", type: "completed", position: 3 },
      { id: "started", name: "In Progress", type: "started", position: 2 },
    ],
  }],
  issues: [{
    id: "issue-1",
    identifier: "ENG-7",
    title: "Ship Linear workflow",
    url: "https://linear.app/example/issue/ENG-7",
    state: { id: "started", name: "In Progress", type: "started" },
    team: { id: "team-1", key: "ENG", name: "Engineering" },
  }],
  fetchedAtUnixMs: Date.now(),
};

const draft = emptyLinearActionDraft("issue.status", snapshot.issues[0], snapshot.teams[0]);
assert.equal(draft.issueId, "issue-1");
assert.equal(draft.teamId, "team-1");
assert.deepEqual(statesForDraft(snapshot, draft).map((state) => state.id), ["started", "done"]);
assert.equal(searchLinearIssues(snapshot.issues, "eng-7").length, 1);
assert.equal(searchLinearIssues(snapshot.issues, "missing").length, 0);

const input = linearActionInput({
  ...draft,
  kind: "issue.comment",
  body: "  reviewed  ",
});
assert.equal(input.body, "reviewed");
assert.equal(input.issueId, "issue-1");

console.log("linear workflows smoke passed");
