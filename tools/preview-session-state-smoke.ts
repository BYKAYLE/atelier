import assert from "node:assert/strict";
import { resolvePreviewVisibilityFallback } from "../src/lib/previewSessionState.ts";

assert.equal(resolvePreviewVisibilityFallback(null, null), false);
assert.equal(resolvePreviewVisibilityFallback("0", "0"), false);
assert.equal(resolvePreviewVisibilityFallback("1", "0"), true);
assert.equal(resolvePreviewVisibilityFallback("0", "1"), false);
assert.equal(resolvePreviewVisibilityFallback(null, "1"), true);
assert.equal(resolvePreviewVisibilityFallback(undefined, "1"), true);

console.log(JSON.stringify({
  ok: true,
  explicitPreviewChoiceWins: true,
  legacyDevScreenFallbackRetained: true,
}));
