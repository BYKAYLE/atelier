import assert from "node:assert/strict";
import type { ChangeReviewAnnotation } from "../src/lib/diffReview.ts";
import {
  createReviewDispatch,
  finalizeInterruptedReviewWorkflow,
  normalizeReviewDispatchContext,
  normalizeReviewWorkflowState,
  summarizeReviewWorkflow,
  transitionReviewWorkflow,
} from "../src/components/review-workflow/reviewWorkflow.ts";

const annotations: ChangeReviewAnnotation[] = [{
  id: "annotation-1",
  filePath: "src/app.ts",
  lineKey: "addition:1",
  kind: "addition",
  oldLine: null,
  newLine: 12,
  lineText: "+return true;",
  body: "Add a regression test.",
  resolved: false,
  createdAt: 10,
}];

const dispatch = createReviewDispatch({
  dispatchId: "dispatch-1",
  sessionId: "session-1",
  sourceMessageId: "assistant-1",
  annotations,
  now: 100,
});
assert.ok(dispatch);
assert.deepEqual(dispatch.context.annotationIds, ["annotation-1"]);
assert.equal(summarizeReviewWorkflow(annotations, dispatch.state).pending, 1);
assert.equal(summarizeReviewWorkflow(annotations, dispatch.state).unsent, 0);

let state = transitionReviewWorkflow(dispatch.state, dispatch.context, "running", {
  now: 200,
  responseMessageId: "assistant-2",
});
assert.equal(state.receipts[0].status, "running");
assert.equal(state.receipts[0].attempt, 1);

state = transitionReviewWorkflow(state, dispatch.context, "queued", { now: 300 });
state = transitionReviewWorkflow(state, dispatch.context, "running", { now: 400 });
assert.equal(state.receipts[0].attempt, 2);

state = transitionReviewWorkflow(state, dispatch.context, "responded", {
  now: 500,
  responseMessageId: "assistant-2",
  responseExcerpt: "Applied the review and ran the focused test.",
});
assert.equal(state.receipts[0].status, "responded");
assert.equal(state.receipts[0].completedAt, 500);
assert.match(state.receipts[0].responseExcerpt || "", /focused test/);

const interrupted = finalizeInterruptedReviewWorkflow(
  transitionReviewWorkflow(state, dispatch.context, "running", { now: 600 }),
  700,
);
assert.equal(interrupted?.receipts[0].status, "cancelled");
assert.equal(interrupted?.receipts[0].completedAt, 700);

const secondAnnotation = { ...annotations[0], id: "annotation-2", newLine: 14 };
assert.equal(summarizeReviewWorkflow([...annotations, secondAnnotation], state).unsent, 1);
assert.equal(summarizeReviewWorkflow([...annotations, secondAnnotation], state).pending, 0);

assert.deepEqual(normalizeReviewDispatchContext({
  ...dispatch.context,
  annotationIds: ["annotation-1", "annotation-1"],
})?.annotationIds, ["annotation-1"]);
assert.equal(normalizeReviewDispatchContext({ ...dispatch.context, sessionId: "" }), undefined);
assert.equal(normalizeReviewWorkflowState({ receipts: [{ id: "bad" }] }), undefined);

console.log(JSON.stringify({
  ok: true,
  status: state.receipts[0].status,
  attempts: state.receipts[0].attempt,
  unsentAfterNewComment: summarizeReviewWorkflow([...annotations, secondAnnotation], state).unsent,
}));
