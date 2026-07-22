import assert from "node:assert/strict";
import {
  formatReviewAnnotationsPrompt,
  normalizeReviewAnnotations,
  parseUnifiedDiff,
  reviewAnnotationMatchesLine,
} from "../src/lib/diffReview.ts";

const diff = [
  "diff --git a/src/app.ts b/src/app.ts",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -10,3 +10,4 @@ function run() {",
  " const before = true;",
  "-return before;",
  "+const after = false;",
  "+return after;",
  " }",
].join("\n");

const lines = parseUnifiedDiff(diff);
const deletion = lines.find((line) => line.kind === "deletion");
const additions = lines.filter((line) => line.kind === "addition");
assert.equal(deletion?.oldLine, 11);
assert.equal(deletion?.newLine, null);
assert.deepEqual(additions.map((line) => line.newLine), [11, 12]);
assert.equal(lines.find((line) => line.kind === "context")?.oldLine, 10);
assert.equal(lines.filter((line) => line.annotatable).length, 5);

const annotations = normalizeReviewAnnotations([{
  id: "review-1",
  filePath: "src/app.ts",
  lineKey: additions[0].key,
  kind: "addition",
  oldLine: null,
  newLine: additions[0].newLine,
  lineText: additions[0].raw,
  body: "Keep the previous behavior.",
  resolved: false,
  createdAt: 1,
}, {
  id: "invalid",
  body: "missing location",
}]);
assert.equal(annotations.length, 1);
assert.equal(reviewAnnotationMatchesLine({ ...annotations[0], lineKey: "legacy-key" }, additions[0]), true);
assert.match(formatReviewAnnotationsPrompt(annotations, "en"), /src\/app\.ts:L11/);
assert.match(formatReviewAnnotationsPrompt(annotations, "ko"), /줄 단위 리뷰 의견/);
assert.equal(formatReviewAnnotationsPrompt([{ ...annotations[0], resolved: true }], "en"), "");

console.log(JSON.stringify({
  ok: true,
  parsed: lines.length,
  annotatable: lines.filter((line) => line.annotatable).length,
  additions: additions.map((line) => line.newLine),
}));
