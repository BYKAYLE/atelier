import assert from "node:assert/strict";
import type { AtelierControlRequest } from "../src/lib/tauri.ts";
import { normalizeControlTask } from "../src/components/atelier-cli/controlRequest.ts";

const request: AtelierControlRequest = {
  schemaVersion: 1,
  requestId: "123e4567-e89b-12d3-a456-426614174000",
  action: "task.dispatch",
  source: "atelier-cli",
  createdAtUnixMs: Date.now(),
  workspace: "/workspace",
  payload: {
    provider: "CODEX",
    prompt: "  inspect this repository  ",
    model: " gpt-5.6-sol ",
    effort: "high",
    permissionMode: "default",
    stellaMode: true,
  },
};

assert.deepEqual(normalizeControlTask(request, "/fallback"), {
  provider: "codex",
  prompt: "inspect this repository",
  workspace: "/workspace",
  model: "gpt-5.6-sol",
  effort: "high",
  permissionMode: "default",
  stellaMode: true,
});

assert.throws(
  () => normalizeControlTask({ ...request, payload: { provider: "shell", prompt: "rm" } }, "/workspace"),
  /Unsupported agent provider/,
);
assert.throws(
  () => normalizeControlTask({ ...request, payload: { provider: "codex", prompt: "  " } }, "/workspace"),
  /prompt is empty/,
);

console.log(JSON.stringify({ ok: true, module: "atelier-cli", schemaVersion: 1 }));
