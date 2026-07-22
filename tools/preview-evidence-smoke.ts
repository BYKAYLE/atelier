import assert from "node:assert/strict";
import {
  buildTaskPreviewEvidence,
  previewDiagnosticsMatchPreview,
  redactPreviewEvidenceText,
  sanitizePreviewEvidenceUrl,
} from "../src/lib/previewEvidence.ts";

assert.equal(
  sanitizePreviewEvidenceUrl("http://user:pass@localhost:5173/admin?token=secret#panel"),
  "http://localhost:5173/admin",
);
assert.equal(
  previewDiagnosticsMatchPreview(
    { pageUrl: "http://127.0.0.1:5173/other?secret=value" },
    "http://localhost:5173/admin",
  ),
  false,
);
assert.equal(
  previewDiagnosticsMatchPreview(
    { pageUrl: "http://127.0.0.1:5173/admin/runtime?secret=value" },
    "http://localhost:5173/admin/",
  ),
  true,
);
assert.equal(
  previewDiagnosticsMatchPreview(
    { pageUrl: "http://127.0.0.1:5173/admin/runtime" },
    "http://localhost:5173/",
  ),
  true,
);
assert.equal(
  previewDiagnosticsMatchPreview(
    { pageUrl: "http://localhost:4173/" },
    "http://localhost:5173/admin",
  ),
  false,
);
assert.match(redactPreviewEvidenceText("Authorization: Bearer abcdefghijklmnop"), /\[redacted\]/);
assert.match(redactPreviewEvidenceText("api_key=sk-proj-1234567890abcdef"), /\[redacted\]/);
assert.match(redactPreviewEvidenceText('{"password":"private-value"}'), /\[redacted\]/);
assert.equal(
  redactPreviewEvidenceText("password authentication failed for user admin"),
  "password authentication failed for user admin",
  "ordinary diagnostics must remain readable when they do not contain an assignment",
);

const evidence = buildTaskPreviewEvidence({
  previewUrl: "http://localhost:5173/admin?api_key=private#debug",
  health: {
    url: "http://localhost:5173/admin?api_key=private#debug",
    ok: true,
    status: 200,
    title: "Admin",
    body_text: "ready token=private-token-value",
    checked_at: 1234,
  },
  service: {
    managed: true,
    running: true,
    pid: 42,
    restarts: 1,
    recent_output: [
      "listening on 5173",
      "Authorization: Bearer abcdefghijklmnop",
    ],
  },
  diagnostics: {
    pageUrl: "http://127.0.0.1:5173/admin",
    armedAt: 1200,
    consoleEntries: [
      { level: "warn", text: "deprecated API" },
      { level: "error", text: "request failed api_key=private-value" },
    ],
    runtimeErrors: ["Uncaught Error: password authentication failed"],
    networkEntries: [
      {
        url: "http://localhost:5173/api/health?access_token=private#response",
        initiatorType: "fetch",
        status: 500,
        durationMs: 10.4,
      },
    ],
    networkFailures: ["GET /api/private?token=value failed"],
  },
  screenshotCaptured: true,
});

assert.equal(evidence.url, "http://localhost:5173/admin");
assert.equal(evidence.ok, true);
assert.equal(evidence.networkMethod, "GET");
assert.equal(evidence.serviceRunning, true);
assert.equal(evidence.browserErrorCount, 2);
assert.equal(evidence.browserWarningCount, 1);
assert.equal(evidence.networkFailureCount, 2);
assert.equal(evidence.screenshotCaptured, true);
assert.ok(evidence.bodyText?.includes("[redacted]"));
assert.ok(evidence.serviceOutput?.every((line) => !line.includes("abcdefghijklmnop")));
assert.ok(evidence.consoleEvidence?.every((line) => !line.includes("private-value")));
assert.ok(evidence.networkEvidence?.every((line) => !line.includes("access_token")));
assert.ok(evidence.networkEvidence?.every((line) => !line.includes("token=value")));

const bounded = buildTaskPreviewEvidence({
  previewUrl: "http://localhost:3000",
  health: {
    url: "http://localhost:3000",
    ok: false,
    body_text: "x".repeat(8_000),
    error: "y".repeat(3_000),
    checked_at: 99,
  },
  service: {
    managed: true,
    running: false,
    restarts: 0,
    recent_output: Array.from({ length: 30 }, (_, index) => `line ${index}`),
  },
});
assert.ok((bounded.bodyText?.length || 0) < 4_100);
assert.ok((bounded.error?.length || 0) < 1_300);
assert.equal(bounded.serviceOutput?.length, 12);

console.log("preview evidence smoke: passed");
