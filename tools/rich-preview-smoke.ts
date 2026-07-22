import assert from "node:assert/strict";

import {
  defaultsToRichPreview,
  formatPreviewBytes,
  requiresRichPreview,
  richPreviewHintForPath,
  supportsRichPreview,
} from "../src/components/rich-preview/richPreview.ts";

assert.equal(richPreviewHintForPath("/repo/README.md"), "markdown");
assert.equal(richPreviewHintForPath("C:\\repo\\docs\\manual.pdf"), "pdf");
assert.equal(richPreviewHintForPath("/repo/screens/app.webp"), "image");
assert.equal(richPreviewHintForPath("/repo/reports/result.json"), "text");
assert.equal(richPreviewHintForPath("/repo/archive.zip"), "unsupported");

assert.equal(supportsRichPreview("/repo/README.md"), true);
assert.equal(supportsRichPreview("/repo/archive.zip"), false);
assert.equal(requiresRichPreview("/repo/manual.pdf"), true);
assert.equal(requiresRichPreview("/repo/README.md"), false);
assert.equal(defaultsToRichPreview("/repo/README.md"), true);
assert.equal(defaultsToRichPreview("/repo/config.json"), false);

assert.equal(formatPreviewBytes(512), "512 B");
assert.equal(formatPreviewBytes(2048), "2.0 KB");
assert.equal(formatPreviewBytes(2 * 1024 * 1024), "2.0 MB");

console.log("PASS rich preview file classification");
console.log("PASS binary preview routing and Markdown defaults");
console.log("PASS bounded preview metadata formatting");
