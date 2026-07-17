export type DiffReviewLineKind = "meta" | "hunk" | "context" | "addition" | "deletion";

export interface DiffReviewLine {
  key: string;
  kind: DiffReviewLineKind;
  raw: string;
  oldLine: number | null;
  newLine: number | null;
  annotatable: boolean;
}

export interface ChangeReviewAnnotation {
  id: string;
  filePath: string;
  lineKey: string;
  kind: DiffReviewLineKind;
  oldLine: number | null;
  newLine: number | null;
  lineText: string;
  body: string;
  resolved: boolean;
  createdAt: number;
}

const HUNK_HEADER = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/;

export function parseUnifiedDiff(diff: string): DiffReviewLine[] {
  if (!diff.trim()) return [];
  let oldLine: number | null = null;
  let newLine: number | null = null;
  let inHunk = false;

  return diff.replace(/\r\n/g, "\n").split("\n").map((raw, index) => {
    const hunk = raw.match(HUNK_HEADER);
    if (hunk) {
      oldLine = Number.parseInt(hunk[1], 10);
      newLine = Number.parseInt(hunk[2], 10);
      inHunk = true;
      return {
        key: `${index}:hunk`,
        kind: "hunk" as const,
        raw,
        oldLine: null,
        newLine: null,
        annotatable: false,
      };
    }

    if (!inHunk || raw.startsWith("diff --git ") || raw.startsWith("index ")
      || raw.startsWith("--- ") || raw.startsWith("+++ ") || raw.startsWith("\\ No newline")) {
      return {
        key: `${index}:meta`,
        kind: "meta" as const,
        raw,
        oldLine: null,
        newLine: null,
        annotatable: false,
      };
    }

    if (raw.startsWith("+")) {
      const line = newLine;
      newLine = newLine === null ? null : newLine + 1;
      return {
        key: `${index}:add:${line ?? ""}`,
        kind: "addition" as const,
        raw,
        oldLine: null,
        newLine: line,
        annotatable: line !== null,
      };
    }

    if (raw.startsWith("-")) {
      const line = oldLine;
      oldLine = oldLine === null ? null : oldLine + 1;
      return {
        key: `${index}:del:${line ?? ""}`,
        kind: "deletion" as const,
        raw,
        oldLine: line,
        newLine: null,
        annotatable: line !== null,
      };
    }

    const currentOld = oldLine;
    const currentNew = newLine;
    oldLine = oldLine === null ? null : oldLine + 1;
    newLine = newLine === null ? null : newLine + 1;
    return {
      key: `${index}:ctx:${currentOld ?? ""}:${currentNew ?? ""}`,
      kind: "context" as const,
      raw,
      oldLine: currentOld,
      newLine: currentNew,
      annotatable: currentOld !== null || currentNew !== null,
    };
  });
}

export function normalizeReviewAnnotations(value: unknown): ChangeReviewAnnotation[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-80).flatMap((entry): ChangeReviewAnnotation[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<ChangeReviewAnnotation>;
    if (typeof item.id !== "string" || typeof item.filePath !== "string"
      || typeof item.lineKey !== "string" || typeof item.body !== "string") return [];
    const kind = item.kind === "addition" || item.kind === "deletion" || item.kind === "context"
      ? item.kind
      : "context";
    return [{
      id: item.id,
      filePath: item.filePath.slice(0, 800),
      lineKey: item.lineKey.slice(0, 160),
      kind,
      oldLine: typeof item.oldLine === "number" && Number.isFinite(item.oldLine) ? item.oldLine : null,
      newLine: typeof item.newLine === "number" && Number.isFinite(item.newLine) ? item.newLine : null,
      lineText: typeof item.lineText === "string" ? item.lineText.slice(0, 1000) : "",
      body: item.body.trim().slice(0, 2000),
      resolved: Boolean(item.resolved),
      createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
        ? item.createdAt
        : Date.now(),
    }];
  }).filter((item) => item.body.length > 0);
}

export function reviewAnnotationMatchesLine(annotation: ChangeReviewAnnotation, line: DiffReviewLine) {
  if (annotation.lineKey === line.key) return true;
  return annotation.kind === line.kind
    && annotation.oldLine === line.oldLine
    && annotation.newLine === line.newLine
    && annotation.lineText === line.raw;
}

export function reviewLineLabel(annotation: ChangeReviewAnnotation, language: "ko" | "en") {
  if (annotation.kind === "deletion") {
    return language === "en" ? `old L${annotation.oldLine ?? "?"}` : `기존 L${annotation.oldLine ?? "?"}`;
  }
  return `L${annotation.newLine ?? annotation.oldLine ?? "?"}`;
}

export function formatReviewAnnotationsPrompt(
  annotations: ChangeReviewAnnotation[],
  language: "ko" | "en",
) {
  const open = annotations.filter((item) => !item.resolved);
  if (!open.length) return "";
  const intro = language === "en"
    ? "Apply the following line-level review comments to the current changes. Preserve unrelated user edits, run focused verification, and report how each comment was addressed."
    : "다음 줄 단위 리뷰 의견을 현재 변경사항에 반영해줘. 관련 없는 사용자 변경은 보존하고, 필요한 검증을 실행한 뒤 각 의견을 어떻게 처리했는지 알려줘.";
  const rows = open.slice(0, 40).map((item, index) => [
    `${index + 1}. ${item.filePath}:${reviewLineLabel(item, language)}`,
    `   ${language === "en" ? "Code" : "코드"}: ${item.lineText.trim().slice(0, 500) || "(empty line)"}`,
    `   ${language === "en" ? "Review" : "의견"}: ${item.body}`,
  ].join("\n"));
  return [intro, "", ...rows].join("\n");
}
