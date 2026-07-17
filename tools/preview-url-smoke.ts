import { findAutoPreviewUrl, isAutoReviewablePreviewUrl, restoreAutoPreviewUrl } from "../src/lib/previewUrl.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  findAutoPreviewUrl("provider endpoint: https://chatgpt.com/backend-api/codex") === null,
  "provider/API URLs must not be mistaken for an auto-review preview",
);
assert(
  findAutoPreviewUrl("docs https://example.com then preview http://localhost:5173/app.") === "http://localhost:5173/app",
  "the latest supported localhost URL should be selected and trailing punctuation removed",
);
assert(
  findAutoPreviewUrl("preview http://127.0.0.1:3000/path?mode=test#main") === "http://127.0.0.1:3000/path?mode=test#main",
  "localhost path, query, and fragment must be preserved",
);
assert(
  findAutoPreviewUrl("http://localhost.evil.example:3000") === null,
  "lookalike hosts must not pass the localhost boundary",
);
assert(
  findAutoPreviewUrl("https://localhost:3000") === null,
  "HTTPS must not auto-arm a checker that only supports local HTTP",
);
assert(isAutoReviewablePreviewUrl("http://0.0.0.0:4173"), "0.0.0.0 preview should remain supported");
assert(isAutoReviewablePreviewUrl("http://[::1]:4173"), "IPv6 loopback preview should remain supported");
assert(!isAutoReviewablePreviewUrl("file:///tmp/index.html"), "file URLs must remain outside automatic review");
assert(
  restoreAutoPreviewUrl("https://chatgpt.com/backend-api/codex") === undefined,
  "stale remote URLs from earlier auto-detection must be cleared on session restore",
);

console.log("preview URL smoke: 9/9 passed");
