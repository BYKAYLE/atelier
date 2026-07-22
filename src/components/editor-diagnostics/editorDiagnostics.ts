import type { AgentEditorSnapshot } from "../../lib/tauri";

export type EditorSavePolicy = "manual" | "after-delay";
export type EditorExternalDecision = "establish" | "unchanged" | "reload" | "conflict";
export type EditorDiagnosticSeverity = "error" | "warning";

export interface EditorDiagnostic {
  id: string;
  line: number;
  column: number;
  severity: EditorDiagnosticSeverity;
  source: "merge" | "json";
  message: string;
}

export const EDITOR_SAVE_POLICY_STORAGE_KEY = "atelier.editor.save-policy.v1";
export const EDITOR_AUTOSAVE_DELAY_MS = 1_200;
export const EDITOR_SNAPSHOT_POLL_MS = 1_800;

export function normalizeEditorSavePolicy(value: unknown): EditorSavePolicy {
  return value === "after-delay" ? "after-delay" : "manual";
}

export function shouldScheduleEditorAutosave(input: {
  policy: EditorSavePolicy;
  dirty: boolean;
  saving: boolean;
  previewOpen: boolean;
  hasConflict: boolean;
}): boolean {
  return input.policy === "after-delay"
    && input.dirty
    && !input.saving
    && !input.previewOpen
    && !input.hasConflict;
}

export function classifyExternalEditorChange(
  baseline: AgentEditorSnapshot | null,
  current: AgentEditorSnapshot,
  dirty: boolean,
): EditorExternalDecision {
  if (!baseline) return "establish";
  if (sameEditorSnapshot(baseline, current)) return "unchanged";
  if (!current.exists || dirty) return "conflict";
  return "reload";
}

export function sameEditorSnapshot(
  left: AgentEditorSnapshot,
  right: AgentEditorSnapshot,
): boolean {
  return left.exists === right.exists && left.contentSha256 === right.contentSha256;
}

export function collectEditorDiagnostics(path: string, contents: string): EditorDiagnostic[] {
  const diagnostics = collectMergeDiagnostics(contents);
  if (path.toLowerCase().endsWith(".json")) {
    const jsonDiagnostic = collectJsonDiagnostic(contents);
    if (jsonDiagnostic) diagnostics.push(jsonDiagnostic);
  }
  return diagnostics.slice(0, 100);
}

function collectMergeDiagnostics(contents: string): EditorDiagnostic[] {
  const lines = contents.split("\n");
  const markers = lines.flatMap((line, index) => {
    const trimmed = line.trimStart();
    const marker = trimmed.startsWith("<<<<<<<")
      ? "<<<<<<<"
      : trimmed.startsWith(">>>>>>>")
        ? ">>>>>>>"
        : /^={7,}(?:\s.*)?$/.test(trimmed)
          ? "======="
          : null;
    return marker ? [{ line: index + 1, column: line.length - trimmed.length + 1, marker }] : [];
  });
  const completeConflict = ["<<<<<<<", "=======", ">>>>>>>"]
    .every((marker) => markers.some((entry) => entry.marker === marker));
  if (!completeConflict) return [];

  return markers.map((entry, index) => ({
    id: `merge-${entry.line}-${index}`,
    line: entry.line,
    column: entry.column,
    severity: "error" as const,
    source: "merge" as const,
    message: "해결되지 않은 Git 병합 표식",
  }));
}

function collectJsonDiagnostic(contents: string): EditorDiagnostic | null {
  if (!contents.trim()) return null;
  try {
    JSON.parse(contents);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const explicit = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    let line = explicit ? Number(explicit[1]) : 1;
    let column = explicit ? Number(explicit[2]) : 1;
    if (!explicit) {
      const positionMatch = message.match(/position\s+(\d+)/i);
      if (positionMatch) {
        const position = Math.max(0, Number(positionMatch[1]));
        const prefix = contents.slice(0, position);
        line = prefix.split("\n").length;
        column = position - prefix.lastIndexOf("\n");
      }
    }
    return {
      id: "json-parse",
      line: Number.isFinite(line) ? Math.max(1, line) : 1,
      column: Number.isFinite(column) ? Math.max(1, column) : 1,
      severity: "error",
      source: "json",
      message: `JSON 구문 오류: ${message}`,
    };
  }
}
