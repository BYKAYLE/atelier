import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearSessionComposerDraft,
  createSessionComposerDraft,
  readSessionComposerDraft,
  upsertSessionComposerDraft,
} from "../src/components/agent-composer/sessionDraftStore.ts";

type Session = {
  id: string;
  draft?: ReturnType<typeof createSessionComposerDraft>;
};

const attachment = {
  id: "attachment-a1",
  kind: "image" as const,
  name: "diagram.png",
  path: "/tmp/diagram.png",
  size: 128,
  mime: "image/png",
};

let sessions: Session[] = [{ id: "session-a" }, { id: "session-b" }];

const draftA = createSessionComposerDraft("draft for A", [attachment], 8);
assert.ok(draftA, "draft A should exist");
let result = upsertSessionComposerDraft(sessions, "session-a", draftA);
assert.equal(result.changed, true, "storing A should change the session list");
sessions = result.sessions;

assert.deepEqual(
  readSessionComposerDraft(sessions, "session-a"),
  draftA,
  "switching away from A must preserve its text and attachments",
);
assert.equal(
  readSessionComposerDraft(sessions, "session-b"),
  undefined,
  "an untouched B session should stay empty",
);

const draftB = createSessionComposerDraft("draft for B", [], 8);
assert.ok(draftB, "draft B should exist");
result = upsertSessionComposerDraft(sessions, "session-b", draftB);
assert.equal(result.changed, true, "storing B should change the session list");
sessions = result.sessions;

assert.deepEqual(
  readSessionComposerDraft(sessions, "session-a"),
  draftA,
  "switching A -> B -> A must restore A without losing its attachment",
);
assert.deepEqual(
  readSessionComposerDraft(sessions, "session-b"),
  draftB,
  "B should keep its own draft independently",
);

result = clearSessionComposerDraft(sessions, "session-a");
assert.equal(result.changed, true, "successful send should clear A's draft");
sessions = result.sessions;

assert.equal(
  readSessionComposerDraft(sessions, "session-a"),
  undefined,
  "successful send should clear only A",
);
assert.deepEqual(
  readSessionComposerDraft(sessions, "session-b"),
  draftB,
  "clearing A must not touch B",
);

const workspaceSource = readFileSync("src/components/AgentWorkspace.tsx", "utf8");
assert.match(
  workspaceSource,
  /const draftState = flushComposerDraftToSession\(currentActiveId\);/,
  "session selection must flush the current draft before switching",
);
assert.match(
  workspaceSource,
  /syncComposerDraft\(readSessionComposerDraft\(sessionsRef\.current, activeId\)\);/,
  "active session changes must hydrate the target draft",
);
assert.match(
  workspaceSource,
  /draft: undefined,/,
  "successful sends must clear the persisted session draft",
);

console.log(JSON.stringify({
  ok: true,
  restoreAcrossSessions: true,
  clearOnlySentSession: true,
  integration: "AgentWorkspace",
}));
