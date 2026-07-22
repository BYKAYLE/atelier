import assert from "node:assert/strict";
import {
  createInitialSessionInboxState,
  filterSessionInboxItems,
  isSessionInboxItemUnread,
  markSessionInboxItemRead,
  markSessionInboxItemUnread,
  pruneSessionInboxState,
  sessionInboxCounts,
} from "../src/components/session-inbox/sessionInboxState.ts";
import type { SessionInboxItem } from "../src/components/session-inbox/sessionInboxState.ts";

const initialItems: SessionInboxItem[] = [
  { id: "active", updatedAt: 10, phase: "idle" },
  { id: "running", updatedAt: 20, phase: "running" },
  { id: "attention", updatedAt: 30, phase: "attention" },
];

let state = createInitialSessionInboxState(initialItems);
assert.equal(sessionInboxCounts(initialItems, state).unread, 0, "existing sessions start read");

const updatedItems = initialItems.map((item) => item.id === "running" ? { ...item, updatedAt: 21 } : item);
assert.equal(isSessionInboxItemUnread(updatedItems[1], state), true, "inactive update becomes unread");
assert.deepEqual(
  filterSessionInboxItems(updatedItems, state, "attention").map((item) => item.id),
  ["attention"],
  "attention filter is phase-owned",
);
assert.deepEqual(
  filterSessionInboxItems(updatedItems, state, "unread").map((item) => item.id),
  ["running"],
  "unread filter follows read receipt",
);

state = markSessionInboxItemRead(state, updatedItems[1]);
assert.equal(isSessionInboxItemUnread(updatedItems[1], state), false, "opening a session marks it read");

state = markSessionInboxItemUnread(state, "active");
assert.equal(isSessionInboxItemUnread(updatedItems[0], state), true, "manual unread survives without new output");
assert.deepEqual(sessionInboxCounts(updatedItems, state), {
  all: 3,
  running: 1,
  attention: 1,
  unread: 1,
});

state = pruneSessionInboxState(state, updatedItems.filter((item) => item.id !== "active"));
assert.equal("active" in state.forcedUnreadById, false, "deleted sessions are pruned");

console.log("PASS session inbox state, filters, read receipts, and pruning");
