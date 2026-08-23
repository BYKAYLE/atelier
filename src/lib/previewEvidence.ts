// ── 이번 턴이 프리뷰에 영향을 줬는가 (검증 카드 노출 게이트) ────────────────
// 왜: 프리뷰 URL이 세션에 한 번 잡히면 그 뒤 모든 턴에 검증 카드가 따라붙었다.
// 인사 한 마디만 한 턴에도 "프리뷰 검증 완료 · HTTP 200"이 붙어 근거가 아니라
// 소음이 됐다. 판정 기준을 "세션에 URL이 있나"에서 "이번 턴이 무엇을 했나"로 옮긴다.
//
// ★260804 프로바이더 4레인 emit 전수 감사 (src-tauri/src/agent.rs + gjc 패키지 소스 직독).
// 도구 이벤트만 세던 1차 판정이 두 레인에서 구조적으로 항상 0이 되어 "절대 미노출"로
// 뒤집힌 원인이 여기 있다:
//   claude   parse_claude_line L2650-2676 — content_block_start(비-text) → kind:"tool"
//            (text=도구명 Edit/Bash…, status=블록타입)                        → 관측 가능
//   codex    parse_codex_line  L2969-2982 — item.completed(비 agent_message) → kind:"tool"
//            (text=item_type command_execution/file_change…)                 → 관측 가능
//   gajecode run_gajecode      L3719-3730 — stdout 전량이 kind:"delta"(status=None,
//            text=`{line}\n`, raw=원문 라인). kind:"tool" emit 0건. 더구나 atelier 는
//            gjc 를 `--print`(mode 기본값 "text") 로 띄우므로 stdout 에는 도구 진행 로그가
//            아예 없고 최종 assistant 텍스트만 나온다
//            (@gajae-code/coding-agent src/modes/print-mode.ts runPrintMode text 분기,
//             src/main.ts L1347 `const mode = parsedArgs.mode || "text"`).   → 관측 불가
//   hermes   run_hermes        L4192 — `if machine_readable_output { continue; }` 가
//            stdout 라인 처리 전체를 차단한다(L3949 `= true` 하드코딩, 재대입 없음).
//            그 아래 L4206/4236/4256/4275/4317/4439/4515 의 kind:"tool" emit 은 전부
//            도달 불가 코드다. 실제로 나오는 건 status(hermes.starting/idle)와
//            result·error(hermes.completed) 뿐이다.                          → 관측 불가
//
// 그래서 판정을 3층으로 쌓는다.
//   1층 도구 이벤트  — claude/codex 는 이것만으로 침묵을 "무영향"으로 읽어도 안전하다.
//   2층 stdout 라인  — 런타임이 그대로 흘린 한 줄에서 실행 흔적을 읽는다(가재코드 레인).
//   3층 워크스페이스 실측 — 관측 불가 레인에서만, 턴 전용 baseline 과 대조해 "이 턴에
//        파일이 바뀌었나"를 직접 잰다.
//
// 3층에서 worktree diff 전체를 쓰지 않는 이유: agent_git_state 는 파일 "수"만 주므로 이미
// dirty 한 리포에서 재편집을 못 잡고, baseline 없이 agent_change_summary 를 부르면
// 워크스페이스 전체(scope:"workspace")를 돌려주므로 상시 dirty 리포에서 항상 true 다.
// 턴 전용 baseline 이 실제로 해소된 경우(scope:"run")에만 실측값을 신뢰한다. 그리고 그
// baseline 은 "변경 검토" 버튼이 쥔 것과 별개의 id 여야 한다 — agent_change_summary 는
// 넘긴 id 를 소비(remove)하므로 같은 id 를 쓰면 사용자의 변경 검토가 죽는다.
export type AgentToolImpactClass = "workspace" | "read-only" | "unknown";

/** 스트림에서 이 턴의 워크스페이스 변경을 관측할 수 있는 레인인가. */
export type LaneEvidenceChannel = "tool-events" | "blind";

/** 턴 전용 baseline 실측 결과. "unknown"은 판정 근거로 쓰지 않는다. */
export type WorkspaceMutationProbe = "changed" | "unchanged" | "unknown";

// 위 감사 결과를 그대로 표로 옮긴 것. 레인을 추가하면 여기 등록해야 하고, 등록하지 않은
// 이름은 blind 로 떨어져 노출 쪽으로 기운다(놓치는 것이 소음보다 위험하다).
export const AGENT_LANE_EVIDENCE_CHANNEL: Record<string, LaneEvidenceChannel> = {
  claude: "tool-events",
  codex: "tool-events",
  gajecode: "blind",
  hermes: "blind",
  grok: "blind",
};

export function laneEvidenceChannel(lane: string | null | undefined): LaneEvidenceChannel {
  const key = String(lane ?? "").trim().toLowerCase();
  return AGENT_LANE_EVIDENCE_CHANNEL[key] || "blind";
}

export interface TurnPreviewImpact {
  /** 이 턴을 실행한 프로바이더 레인 (관측 가능 여부 판정에 쓴다) */
  lane: string | null;
  /** 이번 턴에 관측한 전체 스트림 이벤트 수 (0이면 관측 실패로 보고 노출한다) */
  observedEvents: number;
  /** 워크스페이스를 바꿀 수 있는 도구 (편집·쉘·패치 등) */
  workspaceToolEvents: number;
  /** 조회 전용 도구 (읽기·검색·사고) */
  readOnlyToolEvents: number;
  /** 분류 실패한 도구 — 보수적으로 "영향 있음"으로 취급한다 */
  unclassifiedToolEvents: number;
  /** 런타임이 원문 그대로 올려보낸 stdout 라인 수 (가재코드 레인의 delta) */
  runtimeStdoutLines: number;
  /** 그중 실제 실행·편집 흔적으로 읽힌 라인 수 */
  workspaceStdoutLines: number;
  /** 이번 턴 중 프리뷰 URL이 새로 잡히거나 바뀌었나 */
  previewUrlChanged: boolean;
  /** 턴 전용 baseline 대조 실측값 (관측 불가 레인에서만 채운다) */
  workspaceMutation: WorkspaceMutationProbe;
}

// 조회만 하는 도구/아이템 타입. 여기 없는 이름은 전부 "영향 있음" 쪽으로 기운다.
const READ_ONLY_AGENT_TOOLS = new Set([
  "read",
  "grep",
  "glob",
  "ls",
  "list",
  "notebookread",
  "notebook_read",
  "websearch",
  "web_search",
  "webfetch",
  "web_fetch",
  "todowrite",
  "todoread",
  "todo_list",
  "exitplanmode",
  "askuserquestion",
  "thinking",
  "redacted_thinking",
  "reasoning",
  "agent_message",
  "text",
]);

// 워크스페이스를 바꿀 수 있는 도구/아이템 타입.
const WORKSPACE_AGENT_TOOLS = new Set([
  "edit",
  "multiedit",
  "write",
  "notebookedit",
  "notebook_edit",
  "bash",
  "bashoutput",
  "killshell",
  "shell",
  "exec",
  "local_shell_call",
  "task",
  "applypatch",
  "apply_patch",
  "patch_apply",
  "file_change",
  "command_execution",
  "mcp_tool_call",
  "computer_use",
  "tool_use",
]);

// hermes/가재코드는 도구 이름 대신 진행 라인을 흘린다. 라인 마커로 분류한다.
const WORKSPACE_ACTIVITY_MARKERS = [
  "$ ",
  "running:",
  "tool:",
  "diff --git",
  "@@ ",
  "repls=",
  "📝 코드 변경",
  " exec ",
  "🔧",
  "▶",
  "💻",
  "⚙",
  "✍",
  "🐍",
  "⚡",
];

const READ_ONLY_ACTIVITY_MARKERS = [" skill ", "📚", "📖", "🔎", "📋", "🧠", "🌐", "📸"];

// 런타임이 그대로 흘린 stdout "한 줄"에서 실제 실행·편집을 읽어내는 패턴.
// 전부 줄 시작 앵커라는 점이 과잉 노출 방지 장치다. 에이전트가 본문에서 설명만 하는
// 문장("diff 를 보여드리면", "빌드를 돌리면 됩니다", "$ 기호로 시작하는 명령을 쓰세요")은
// 앵커+뒤따르는 ASCII 토큰 조건을 만족하지 못해 걸리지 않는다. 1차 판정이 쓰던
// includes("$ ")·includes("⚡") 류 부분 문자열 매칭이 바로 그 사고를 냈었다.
const WORKSPACE_STDOUT_LINE_PATTERNS: RegExp[] = [
  /^diff --git /,
  /^--- a\//,
  /^\+\+\+ b\//,
  /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/,
  // "$ npm run build" — 달러 뒤에 반드시 ASCII 명령 토큰이 와야 한다.
  /^\$ [A-Za-z0-9._/~-][\w./-]*(?:\s|$)/,
  /^(?:Running|Executing|Tool|Command):\s+[A-Za-z0-9._/~-][\w./-]*/i,
];

/**
 * 런타임이 CLI stdout 한 줄을 원문 그대로 올려보낸 delta 인가.
 *
 * run_gajecode L3717-3730 은 같은 줄을 text(`{line}\n`)와 raw(`line`) 두 필드에 함께 담는다.
 * 반대로 parse_claude_line L2637-2648 의 delta 는 text=모델이 쓴 토막글, raw=JSON 프레임이라
 * 두 필드가 같아질 수 없다. 이 동일성 검사가 "런타임이 뱉은 출력"과 "모델이 쓴 서술"을
 * 가르는 경계이며, 서술 쪽을 아예 스캔 대상에서 제외해 과잉 노출을 원천 차단한다.
 */
export function isRuntimeStdoutEcho(event: {
  text?: string | null;
  raw?: string | null;
}): boolean {
  const text = String(event?.text ?? "");
  const raw = String(event?.raw ?? "");
  if (!text || !raw) return false;
  const line = text.replace(/\n+$/, "");
  // 여러 줄이 한 이벤트에 뭉쳐 왔다면 라인 단위 에코가 아니다.
  if (line.includes("\n")) return false;
  return line === raw.replace(/\n+$/, "");
}

export function classifyRuntimeStdoutLine(line: string): "workspace" | "narrative" {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return "narrative";
  return WORKSPACE_STDOUT_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))
    ? "workspace"
    : "narrative";
}

/** agent_change_summary 응답을 실측값으로 환산. baseline 이 해소된 경우만 신뢰한다. */
export function workspaceMutationFromChangeSummary(
  summary: { is_git?: boolean; scope?: string | null; files?: unknown[] } | null | undefined,
): WorkspaceMutationProbe {
  if (!summary) return "unknown";
  // scope 가 "run" 이 아니면 baseline 이 해소되지 않아 워크스페이스 전체를 받은 것이다.
  // 상시 dirty 리포에서는 언제나 changed 로 읽히므로 판정 근거로 쓰면 안 된다.
  if (!summary.is_git || summary.scope !== "run") return "unknown";
  return (summary.files?.length || 0) > 0 ? "changed" : "unchanged";
}

/**
 * 이 턴에 워크스페이스 실측(턴 전용 baseline)이 필요한가.
 * 카드가 붙을 일이 없는 턴(프리뷰 URL 없음)에는 비용을 쓰지 않고,
 * 스트림으로 관측 가능한 레인도 실측 없이 도구 이벤트만으로 판정한다.
 */
export function turnNeedsWorkspaceMutationProbe(
  lane: string | null | undefined,
  hasPreviewUrl: boolean,
): boolean {
  if (!hasPreviewUrl) return false;
  return laneEvidenceChannel(lane) === "blind";
}

export function createTurnPreviewImpact(lane?: string | null): TurnPreviewImpact {
  return {
    lane: lane ? String(lane) : null,
    observedEvents: 0,
    workspaceToolEvents: 0,
    readOnlyToolEvents: 0,
    unclassifiedToolEvents: 0,
    runtimeStdoutLines: 0,
    workspaceStdoutLines: 0,
    previewUrlChanged: false,
    workspaceMutation: "unknown",
  };
}

export function classifyAgentToolEvent(event: {
  status?: string | null;
  text?: string | null;
}): AgentToolImpactClass {
  const status = String(event?.status ?? "").trim().toLowerCase();
  // hermes/가재코드가 diff·치환 블록을 흘렸다는 것은 이미 파일을 건드렸다는 뜻이다.
  if (status.startsWith("hermes.diff") || status.startsWith("hermes.replacement_block")) {
    return "workspace";
  }
  const label = String(event?.text ?? "").trim() || status;
  if (!label) return "unknown";
  const normalized = label.toLowerCase();
  if (READ_ONLY_AGENT_TOOLS.has(normalized)) return "read-only";
  if (WORKSPACE_AGENT_TOOLS.has(normalized)) return "workspace";
  // MCP 도구는 무엇을 하는지 알 수 없다 → 영향 있음으로 본다.
  if (normalized.startsWith("mcp__")) return "workspace";
  if (WORKSPACE_ACTIVITY_MARKERS.some((marker) => normalized.includes(marker))) return "workspace";
  if (READ_ONLY_ACTIVITY_MARKERS.some((marker) => normalized.includes(marker))) return "read-only";
  return "unknown";
}

export function noteTurnPreviewImpactEvent(
  impact: TurnPreviewImpact,
  event: {
    kind?: string | null;
    status?: string | null;
    text?: string | null;
    raw?: string | null;
  },
): TurnPreviewImpact {
  impact.observedEvents += 1;
  if (event?.kind === "tool") {
    const impactClass = classifyAgentToolEvent(event);
    if (impactClass === "workspace") impact.workspaceToolEvents += 1;
    else if (impactClass === "read-only") impact.readOnlyToolEvents += 1;
    else impact.unclassifiedToolEvents += 1;
    return impact;
  }
  // delta 레인. 런타임이 원문 그대로 올린 stdout 라인만 본다 — 모델이 쓴 서술 조각은
  // raw(JSON 프레임)와 text 가 달라 여기 들어오지 못한다.
  if (event?.kind === "delta" && isRuntimeStdoutEcho(event)) {
    impact.runtimeStdoutLines += 1;
    if (classifyRuntimeStdoutLine(String(event.text ?? "")) === "workspace") {
      impact.workspaceStdoutLines += 1;
    }
  }
  // status/result/error 의 text 는 에이전트가 쓴 본문(hermes 는 state.db 에서 검증한 최종
  // 답변)이라 판정 근거로 쓰지 않는다. 여기를 스캔하면 "diff 를 보여드리면" 같은 서술에
  // 걸려 1차 사고(과잉 노출)로 되돌아간다.
  return impact;
}

// 애매하면 노출한다 — 검증 결과를 놓치는 쪽이 소음보다 위험하다.
export function turnAffectedPreview(impact: TurnPreviewImpact | null | undefined): boolean {
  if (!impact) return true;
  if (impact.previewUrlChanged) return true;
  // 실측이 최우선이다 — 파일이 실제로 바뀌었으면 스트림이 조용해도 노출한다.
  if (impact.workspaceMutation === "changed") return true;
  // 스트림을 하나도 못 봤으면 판정 근거가 없다 → 억제하지 않는다.
  if (impact.observedEvents === 0) return true;
  if (impact.workspaceToolEvents > 0) return true;
  if (impact.workspaceStdoutLines > 0) return true;
  if (impact.unclassifiedToolEvents > 0) return true;
  // 턴 전용 baseline 이 "이 턴에 바뀐 파일 0"을 실측했으면 침묵을 믿어도 된다.
  if (impact.workspaceMutation === "unchanged") return false;
  // 도구 이벤트가 구조적으로 나오지 않는 레인(가재코드·Hermes)은 침묵이 "무영향"의
  // 근거가 되지 못한다. 실측까지 없으면 판정 불가이므로 노출로 기운다.
  if (laneEvidenceChannel(impact.lane) === "blind") return true;
  return false;
}

export interface TaskPreviewEvidence {
  url: string;
  ok: boolean;
  status?: number | null;
  title?: string | null;
  error?: string | null;
  checkedAt: number;
  serviceRunning?: boolean;
  servicePid?: number;
  serviceRestarts?: number;
  serviceError?: string;
  serviceOutput?: string[];
  bodyText?: string;
  networkMethod?: "GET";
  domNodes?: number;
  screenshotCaptured?: boolean;
  diagnosticsArmedAt?: number;
  browserErrorCount?: number;
  browserWarningCount?: number;
  consoleEvidence?: string[];
  networkRequestCount?: number;
  networkFailureCount?: number;
  networkEvidence?: string[];
}

interface PreviewHealthEvidence {
  url: string;
  ok: boolean;
  status?: number | null;
  title?: string | null;
  body_text?: string | null;
  error?: string | null;
  checked_at: number;
}

interface PreviewServiceEvidence {
  managed: boolean;
  running: boolean;
  pid?: number | null;
  restarts: number;
  last_error?: string | null;
  recent_output: string[];
}

interface PreviewConsoleEvidence {
  level: "warn" | "error";
  text: string;
}

interface PreviewNetworkEvidence {
  url: string;
  initiatorType: string;
  status?: number;
  durationMs: number;
  transferSize?: number;
}

interface PreviewBrowserDiagnostics {
  pageUrl: string;
  armedAt: number;
  consoleEntries: PreviewConsoleEvidence[];
  runtimeErrors: string[];
  networkEntries: PreviewNetworkEvidence[];
  networkFailures: string[];
}

export interface BuildTaskPreviewEvidenceInput {
  previewUrl: string;
  health?: PreviewHealthEvidence | null;
  healthError?: unknown;
  service?: PreviewServiceEvidence | null;
  serviceError?: unknown;
  diagnostics?: PreviewBrowserDiagnostics | null;
  domNodes?: number;
  screenshotCaptured?: boolean;
}

const REDACTED = "[redacted]";
const MAX_TEXT_LENGTH = 4_000;
const MAX_LINE_LENGTH = 900;
const MAX_EVIDENCE_LINES = 12;

const TOKEN_PATTERNS = [
  /\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}\b/g,
  /\b(?:xox[aboprs]-)[A-Za-z0-9-]{12,}\b/g,
  /\bAKIA[A-Z0-9]{12,}\b/g,
];

function clip(value: string, max = MAX_TEXT_LENGTH) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n...[truncated]`;
}

export function redactPreviewEvidenceText(value: unknown, max = MAX_TEXT_LENGTH) {
  let text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, REDACTED)
    .replace(/\b(Authorization\s*:\s*)(?:Bearer|Basic)\s+[^\s,;]+/gi, `$1${REDACTED}`)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_.=-]{12,}/gi, `$1 ${REDACTED}`)
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${REDACTED}@`)
    .replace(
      /(["']?(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|auth[_-]?token|password|passwd|secret|cookie|authorization)["']?\s*[:=]\s*)["']?[^\s,"';}]+["']?/gi,
      `$1${REDACTED}`,
    );
  for (const pattern of TOKEN_PATTERNS) text = text.replace(pattern, REDACTED);
  return clip(text.trim(), Math.max(0, max));
}

export function sanitizePreviewEvidenceUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return redactPreviewEvidenceText(raw, 500);
  }
}

function localPreviewOriginKey(value: unknown) {
  const sanitized = sanitizePreviewEvidenceUrl(value);
  if (!sanitized) return "";
  try {
    const url = new URL(sanitized);
    const host = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(url.hostname)
      ? "loopback"
      : url.hostname;
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return `${url.protocol}//${host}:${port}`;
  } catch {
    return "";
  }
}

function normalizedPreviewPath(value: unknown) {
  const sanitized = sanitizePreviewEvidenceUrl(value);
  if (!sanitized) return "";
  try {
    const pathname = new URL(sanitized).pathname.replace(/\/{2,}/g, "/") || "/";
    return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function previewDiagnosticsMatchPreview(
  diagnostics: { pageUrl?: string | null } | null | undefined,
  previewUrl: string,
) {
  const previewOrigin = localPreviewOriginKey(previewUrl);
  const diagnosticsOrigin = localPreviewOriginKey(diagnostics?.pageUrl);
  if (!previewOrigin || !diagnosticsOrigin || previewOrigin !== diagnosticsOrigin) return false;
  const previewPath = normalizedPreviewPath(previewUrl);
  const diagnosticsPath = normalizedPreviewPath(diagnostics?.pageUrl);
  if (!previewPath || !diagnosticsPath) return false;
  return previewPath === "/"
    || diagnosticsPath === previewPath
    || diagnosticsPath.startsWith(`${previewPath}/`);
}

function evidenceLines(values: unknown[]) {
  return values
    .map((value) => redactPreviewEvidenceText(value, MAX_LINE_LENGTH))
    .filter(Boolean)
    .slice(-MAX_EVIDENCE_LINES);
}

function networkEvidenceLine(entry: PreviewNetworkEvidence) {
  const status = Number(entry.status || 0);
  const parts = [
    entry.initiatorType || "request",
    sanitizePreviewEvidenceUrl(entry.url),
    status > 0 ? `HTTP ${status}` : "",
    Number.isFinite(entry.durationMs) ? `${Math.max(0, Math.round(entry.durationMs))}ms` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function buildTaskPreviewEvidence(input: BuildTaskPreviewEvidenceInput): TaskPreviewEvidence {
  const { health, service, diagnostics } = input;
  const consoleEvidence = diagnostics
    ? evidenceLines([
        ...diagnostics.runtimeErrors.map((text) => `error: ${text}`),
        ...diagnostics.consoleEntries.map((entry) => `${entry.level}: ${entry.text}`),
      ])
    : [];
  const networkEvidence = diagnostics
    ? evidenceLines([
        ...diagnostics.networkFailures.map((text) => `failed: ${text}`),
        ...diagnostics.networkEntries.map(networkEvidenceLine),
      ])
    : [];
  const networkFailureCount = diagnostics
    ? diagnostics.networkFailures.length
      + diagnostics.networkEntries.filter((entry) => Number(entry.status || 0) >= 400).length
    : undefined;
  const managedService = Boolean(service?.managed);
  const healthError = redactPreviewEvidenceText(health?.error || input.healthError, 1_200);
  const serviceError = redactPreviewEvidenceText(service?.last_error || input.serviceError, 1_200);
  const serviceOutput = evidenceLines(service?.recent_output || []);

  return {
    url: sanitizePreviewEvidenceUrl(health?.url || input.previewUrl),
    ok: Boolean(health?.ok) && (!managedService || Boolean(service?.running)),
    status: health?.status,
    title: redactPreviewEvidenceText(health?.title, 300) || undefined,
    error: healthError || undefined,
    checkedAt: Number(health?.checked_at || Date.now()),
    serviceRunning: managedService ? Boolean(service?.running) : undefined,
    servicePid: managedService && service?.pid ? Number(service.pid) : undefined,
    serviceRestarts: managedService && service?.restarts ? Number(service.restarts) : undefined,
    serviceError: serviceError || undefined,
    serviceOutput: serviceOutput.length ? serviceOutput : undefined,
    bodyText: redactPreviewEvidenceText(health?.body_text, MAX_TEXT_LENGTH) || undefined,
    networkMethod: "GET",
    domNodes: typeof input.domNodes === "number" && Number.isFinite(input.domNodes)
      ? Math.max(0, Math.round(input.domNodes))
      : undefined,
    screenshotCaptured: input.screenshotCaptured || undefined,
    diagnosticsArmedAt: diagnostics?.armedAt,
    browserErrorCount: diagnostics
      ? diagnostics.runtimeErrors.length
        + diagnostics.consoleEntries.filter((entry) => entry.level === "error").length
      : undefined,
    browserWarningCount: diagnostics
      ? diagnostics.consoleEntries.filter((entry) => entry.level === "warn").length
      : undefined,
    consoleEvidence: consoleEvidence.length ? consoleEvidence : undefined,
    networkRequestCount: diagnostics?.networkEntries.length,
    networkFailureCount,
    networkEvidence: networkEvidence.length ? networkEvidence : undefined,
  };
}
