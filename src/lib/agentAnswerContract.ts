export type AgentAnswerLanguage = "ko" | "en";
export type AgentAnswerRole = "user" | "assistant" | "system";
export type AgentAnswerStatus = "queued" | "streaming" | "done" | "error";

export interface AgentAnswerPresentationInput {
  provider?: string | null;
  role: AgentAnswerRole;
  status?: AgentAnswerStatus | null;
  text: string;
  language: AgentAnswerLanguage;
}

export interface AgentAnswerPresentation {
  text: string;
  changed: boolean;
  reason: "context_limit" | "dense_progress" | null;
  recoveredSuffix: boolean;
}

export interface TerminalAgentAnswerInput {
  terminalResultPresent: boolean;
  terminalText?: string | null;
  terminalErrorText?: string | null;
  streamedDraft?: string | null;
  fallbackText: string;
}

type ActivityToken = {
  end: number;
  index: number;
  label: string;
};

const BOLD_SEGMENT_RE = /\*\*([^*\r\n]{3,180})\*\*/g;
const PROGRESS_ACTIVITY_RE =
  /^(?:Adding|Analyzing|Assessing|Beginning|Checking|Cleaning|Clarifying|Compacting|Confirming|Considering|Deciding|Defining|Delegating|Designing|Editing|Enforcing|Ensuring|Establishing|Expanding|Extending|Fixing|Identifying|Implementing|Inspecting|Integrating|Investigating|Isolating|Loading|Locating|Modifying|Patching|Planning|Preparing|Reading|Reasoning|Regenerating|Reviewing|Running|Scheduling|Searching|Strengthening|Summarizing|Tinkering|Updating|Validating|Verifying|Writing)\b/i;
const CONTEXT_LIMIT_RE =
  /Context length exceeded\s*\(([\d,]+)\s*tokens\)\.\s*Cannot compress further\.?/i;

function firstNonEmpty(values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value?.trim()) return value;
  }
  return "";
}

/**
 * A terminal adapter result is authoritative. Once it exists, a streamed draft
 * can remain in raw evidence, but it must never become the persisted answer.
 */
export function selectTerminalAgentAnswer(input: TerminalAgentAnswerInput): string {
  if (input.terminalResultPresent) {
    return firstNonEmpty([
      input.terminalText,
      input.terminalErrorText,
      input.fallbackText,
    ]);
  }
  // A streamed draft is evidence, not a verified answer. Callers preserve it
  // separately in `intermediateDraft`; even a non-terminal fallback must not
  // promote it to canonical message text.
  return firstNonEmpty([
    input.terminalText,
    input.terminalErrorText,
    input.fallbackText,
  ]);
}

function normalizedText(text: string): string {
  return text
    .replace(/\u001B(?:[@-_][0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function activityTokens(text: string): ActivityToken[] {
  const tokens: ActivityToken[] = [];
  for (const match of text.matchAll(BOLD_SEGMENT_RE)) {
    const label = (match[1] || "").replace(/\s+/g, " ").trim();
    if (!PROGRESS_ACTIVITY_RE.test(label) || match.index === undefined) continue;
    tokens.push({
      index: match.index,
      end: match.index + match[0].length,
      label: label.toLowerCase(),
    });
  }
  return tokens;
}

function longestDenseActivityRun(text: string, tokens: ActivityToken[]): number {
  let longest = tokens.length > 0 ? 1 : 0;
  let current = longest;
  for (let index = 1; index < tokens.length; index += 1) {
    const gap = text.slice(tokens[index - 1].end, tokens[index].index);
    current = /^[\s*]*$/.test(gap) ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function repeatedActivityCount(tokens: ActivityToken[]): number {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token.label, (counts.get(token.label) || 0) + 1);
  }
  let repeated = 0;
  for (const count of counts.values()) {
    repeated += Math.max(0, count - 1);
  }
  return repeated;
}

function isProgressControlLine(line: string): boolean {
  const value = line.trim();
  if (!value) return true;
  return /^(?:↩\s*Background task running|⚠️?\s*Reached maximum iterations|Context length exceeded\b|Error during OpenAI-compatible API call\b|Compacting context\b|Atelier (?:표시 지침|display guidance):|Resume this session with:|Session:\s|Duration:\s|Messages:\s|Tokens:\s|Title:\s|hermes\s+--resume\b|[─━═—-]{8,})/i
    .test(value);
}

function recoveredSuffix(text: string, lastActivityEnd: number): string {
  const lines = text.slice(lastActivityEnd).split("\n");
  while (lines.length > 0 && isProgressControlLine(lines[0])) {
    lines.shift();
  }
  const suffix = lines.join("\n").trim();
  if (!suffix || !/[\p{L}\p{N}]/u.test(suffix)) return "";
  return suffix;
}

function contextLimitTokenCount(text: string): string | null {
  if (text.length < 800) return null;
  const contaminationSignatures = [
    "Beginning repo inspection and session search",
    "Compacting context — summarizing earlier conversation so I can continue",
    "Error during OpenAI-compatible API call #",
    "Atelier 표시 지침:",
  ];
  const signatureCount = contaminationSignatures.filter((signature) =>
    text.includes(signature)
  ).length;
  const match = text.match(CONTEXT_LIMIT_RE);
  return signatureCount >= 3 && match ? match[1] : null;
}

function denseProgressAnalysis(text: string): {
  contaminated: boolean;
  lastActivityEnd: number;
} {
  const tokens = activityTokens(text);
  if (tokens.length < 6) {
    return { contaminated: false, lastActivityEnd: 0 };
  }

  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const firstIsInPrefix = first.index <= Math.min(600, Math.floor(text.length * 0.35));
  const activitySpan = last.end - first.index;
  const fourStarBoundaries = text.match(/\*{4}/g)?.length || 0;
  const repeated = repeatedActivityCount(tokens);
  const longestRun = longestDenseActivityRun(text, tokens);
  const structuralDensity =
    (fourStarBoundaries >= 2 && longestRun >= 3)
    || (repeated >= 2 && longestRun >= 4)
    || (tokens.length >= 10 && longestRun >= 8);

  return {
    contaminated: firstIsInPrefix && activitySpan >= 180 && structuralDensity,
    lastActivityEnd: last.end,
  };
}

function progressHiddenNotice(language: AgentAnswerLanguage): string {
  return language === "en"
    ? "Progress logs mixed into this answer were hidden. The original record is preserved."
    : "이전 실행에서 답변에 섞인 진행 로그를 숨겼습니다. 원본 기록은 보존되어 있습니다.";
}

export function unverifiedIntermediateNotice(language: AgentAnswerLanguage): string {
  return language === "en"
    ? "The run ended without a verified terminal answer. Unverified intermediate output was hidden; you can inspect it in the stored original below."
    : "검증된 최종 답변 없이 실행이 종료되어 중간 출력은 숨겼습니다. 아래 저장된 원문에서 확인할 수 있습니다.";
}

function contextLimitNotice(language: AgentAnswerLanguage, tokenCount: string): string {
  if (language === "en") {
    return `This earlier run stopped after exceeding its context limit (${tokenCount} tokens). Its progress transcript was mistakenly stored as the answer. The original record is preserved, and new runs use the answer-only output path.`;
  }
  return `이전 실행은 컨텍스트 한도(${tokenCount}토큰)를 초과해 종료되었습니다. 당시 진행 로그가 답변으로 잘못 저장됐지만 원본 기록은 보존되어 있습니다. 새 실행부터는 답변 전용 출력 경로를 사용합니다.`;
}

/**
 * Produces a display-only answer. It never mutates the stored transcript, so
 * raw evidence remains available while completed assistant messages stay
 * readable. Provider is deliberately not part of the classification.
 */
export function presentAgentAnswer(
  input: AgentAnswerPresentationInput,
): AgentAnswerPresentation {
  if (
    input.role !== "assistant"
    || (input.status !== "done" && input.status !== "error")
  ) {
    return {
      text: input.text,
      changed: false,
      reason: null,
      recoveredSuffix: false,
    };
  }

  const text = normalizedText(input.text);
  const tokenCount = contextLimitTokenCount(text);
  if (tokenCount) {
    return {
      text: contextLimitNotice(input.language, tokenCount),
      changed: true,
      reason: "context_limit",
      recoveredSuffix: false,
    };
  }

  const analysis = denseProgressAnalysis(text);
  if (!analysis.contaminated) {
    return {
      text: input.text,
      changed: false,
      reason: null,
      recoveredSuffix: false,
    };
  }

  const suffix = recoveredSuffix(text, analysis.lastActivityEnd);
  const notice = progressHiddenNotice(input.language);
  return {
    text: suffix ? `${notice}\n\n${suffix}` : notice,
    changed: true,
    reason: "dense_progress",
    recoveredSuffix: Boolean(suffix),
  };
}
