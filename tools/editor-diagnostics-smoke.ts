import assert from "node:assert/strict";
import type { AgentEditorSnapshot } from "../src/lib/tauri.ts";
import {
  classifyExternalEditorChange,
  collectEditorDiagnostics,
  normalizeEditorSavePolicy,
  sameEditorSnapshot,
  shouldScheduleEditorAutosave,
} from "../src/components/editor-diagnostics/editorDiagnostics.ts";

const snapshot = (hash: string | null, exists = true): AgentEditorSnapshot => ({
  root: "/workspace",
  path: "/workspace/file.json",
  exists,
  sizeBytes: hash?.length || 0,
  modifiedUnixMs: 100,
  contentSha256: hash,
});

assert.equal(normalizeEditorSavePolicy("after-delay"), "after-delay");
assert.equal(normalizeEditorSavePolicy("always"), "manual");
assert.equal(shouldScheduleEditorAutosave({
  policy: "after-delay",
  dirty: true,
  saving: false,
  previewOpen: false,
  hasConflict: false,
}), true);
assert.equal(shouldScheduleEditorAutosave({
  policy: "after-delay",
  dirty: true,
  saving: false,
  previewOpen: false,
  hasConflict: true,
}), false);

const baseline = snapshot("aaa");
assert.equal(classifyExternalEditorChange(null, baseline, false), "establish");
assert.equal(classifyExternalEditorChange(baseline, snapshot("aaa"), true), "unchanged");
assert.equal(classifyExternalEditorChange(baseline, snapshot("bbb"), false), "reload");
assert.equal(classifyExternalEditorChange(baseline, snapshot("bbb"), true), "conflict");
assert.equal(classifyExternalEditorChange(baseline, snapshot(null, false), false), "conflict");
assert.equal(sameEditorSnapshot(snapshot("aaa"), snapshot("aaa")), true);

const mergeDiagnostics = collectEditorDiagnostics("merge.ts", [
  "<<<<<<< HEAD",
  "const version = 1;",
  "=======",
  "const version = 2;",
  ">>>>>>> branch",
].join("\n"));
assert.equal(mergeDiagnostics.length, 3);
assert.equal(mergeDiagnostics[0].line, 1);

const jsonDiagnostics = collectEditorDiagnostics("broken.json", "{\n  \"ok\": true,\n  nope\n}");
assert.equal(jsonDiagnostics.length, 1);
assert.equal(jsonDiagnostics[0].source, "json");
assert.ok(jsonDiagnostics[0].line >= 1);
assert.deepEqual(collectEditorDiagnostics("valid.json", "{\"ok\":true}"), []);

console.log(JSON.stringify({
  ok: true,
  externalConflict: classifyExternalEditorChange(baseline, snapshot("bbb"), true),
  diagnostics: mergeDiagnostics.length + jsonDiagnostics.length,
}));
