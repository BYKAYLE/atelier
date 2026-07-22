import assert from "node:assert/strict";
import {
  buildBalancedTerminalLayout,
  collectTerminalLayoutLeaves,
  isTerminalSurfaceMeasurable,
  parseTerminalLayout,
  reconcileTerminalLayout,
  splitTerminalLayout,
  updateTerminalSplitRatio,
} from "../src/lib/terminalLayout.ts";

let splitSequence = 0;
const nextId = () => `test-split-${++splitSequence}`;

const balanced = buildBalancedTerminalLayout(["a", "b", "c", "d"], 0, nextId);
assert.ok(balanced && balanced.type === "split");
assert.equal(balanced.direction, "vertical");
assert.deepEqual(collectTerminalLayoutLeaves(balanced), ["a", "b", "c", "d"]);

const split = splitTerminalLayout(balanced, "b", "e", "horizontal", "manual-split");
assert.deepEqual(collectTerminalLayoutLeaves(split), ["a", "b", "e", "c", "d"]);
assert.ok(JSON.stringify(split).includes('"id":"manual-split"'));

const resized = updateTerminalSplitRatio(split, "manual-split", 0.99);
assert.ok(resized);
const resizedText = JSON.stringify(resized);
assert.ok(resizedText.includes('"ratio":0.85'));

const reconciled = reconcileTerminalLayout(resized, ["a", "c", "d", "new"], nextId);
assert.deepEqual(collectTerminalLayoutLeaves(reconciled), ["a", "c", "d", "new"]);
assert.equal(new Set(collectTerminalLayoutLeaves(reconciled)).size, 4);

const serialized = JSON.stringify(reconciled);
assert.deepEqual(parseTerminalLayout(serialized), reconciled);
assert.equal(parseTerminalLayout("not-json"), null);
assert.equal(parseTerminalLayout('{"type":"leaf","logId":""}'), null);
assert.equal(parseTerminalLayout('{"type":"split","id":"x","direction":"diagonal"}'), null);

const duplicateLeaf = JSON.stringify({
  type: "split",
  id: "duplicate",
  direction: "vertical",
  ratio: 0.5,
  first: { type: "leaf", logId: "same" },
  second: { type: "leaf", logId: "same" },
});
assert.equal(parseTerminalLayout(duplicateLeaf), null);

const measurableSurface = {
  active: true,
  connected: true,
  display: "block",
  visibility: "visible",
  width: 960,
  height: 540,
};
assert.equal(isTerminalSurfaceMeasurable(measurableSurface), true);
assert.equal(isTerminalSurfaceMeasurable({ ...measurableSurface, active: false }), false);
assert.equal(isTerminalSurfaceMeasurable({ ...measurableSurface, display: "none" }), false);
assert.equal(isTerminalSurfaceMeasurable({ ...measurableSurface, width: 0, height: 0 }), false);

console.log(JSON.stringify({
  ok: true,
  leaves: collectTerminalLayoutLeaves(reconciled),
  persistedRatio: 0.85,
  malformedRejected: true,
  hiddenRendererDeferred: true,
}));
