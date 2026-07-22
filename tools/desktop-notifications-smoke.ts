import assert from "node:assert/strict";
import {
  collectDesktopNotificationTransitions,
  createDesktopNotificationSnapshot,
} from "../src/components/desktop-notifications/desktopNotificationState.ts";
import type { DesktopNotificationTask } from "../src/components/desktop-notifications/desktopNotificationState.ts";

const running: DesktopNotificationTask[] = [
  { id: "active", title: "Active task", updatedAt: 10, phase: "running" },
  { id: "background", title: "Background task", updatedAt: 20, phase: "running" },
];
const initial = createDesktopNotificationSnapshot(running);

let result = collectDesktopNotificationTransitions(initial, [
  { ...running[0], updatedAt: 11, phase: "done" },
  { ...running[1], updatedAt: 21, phase: "attention" },
], { activeId: "active", workspaceForeground: true });

assert.deepEqual(result.events, [
  { id: "background", title: "Background task", kind: "attention" },
], "foreground active task is quiet while an inactive attention event is delivered");

result = collectDesktopNotificationTransitions(initial, [
  { ...running[0], updatedAt: 11, phase: "done" },
  { ...running[1], updatedAt: 21, phase: "done" },
], { activeId: "active", workspaceForeground: false });

assert.deepEqual(result.events.map((event) => event.id), ["active", "background"],
  "backgrounded workspace delivers completion for active and inactive tasks");

result = collectDesktopNotificationTransitions(result.snapshot, [
  { ...running[0], updatedAt: 11, phase: "done" },
  { ...running[1], updatedAt: 21, phase: "done" },
], { activeId: "active", workspaceForeground: false });
assert.equal(result.events.length, 0, "stable terminal state never produces duplicate notifications");

const newTask = collectDesktopNotificationTransitions({}, [
  { id: "restored", title: "Restored task", updatedAt: 99, phase: "done" },
], { activeId: null, workspaceForeground: false });
assert.equal(newTask.events.length, 0, "first-seen restored tasks do not back-notify");

console.log("PASS desktop notification transitions, foreground suppression, and de-duplication");
