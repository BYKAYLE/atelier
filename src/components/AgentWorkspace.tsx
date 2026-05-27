import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  devScreenCheck,
  devScreenClick,
  devScreenJs,
  devScreenKey,
  devScreenResize,
  devScreenScreenshot,
  devScreenSnapshot,
  devScreenStatus,
  devScreenType,
} from "../lib/devScreen";
import {
  formatStellaOntologyInstruction,
  isStellaOntologyMode,
  labelForStellaOntologyMode,
  normalizeStellaOntologyMode,
} from "../lib/stellaOntology";
import type { StellaOntologyMode } from "../lib/stellaOntology";
import {
  ACADEMIC_RESEARCH_SLASH_COMMANDS,
  parseAcademicResearchCommand,
} from "../lib/academicResearch";
import type {
  DevScreenActionResult,
  DevScreenCheckResult,
  DevScreenOptions,
  DevScreenScreenshotResult,
  DevScreenSnapshotResult,
  DevScreenStatusResult,
} from "../lib/devScreen";
import {
  agentCancel,
  agentChangeBaseline,
  agentChangeSummary,
  agentCliCommand,
  agentSend,
  agentUndoChanges,
  academicResearchInstallClaudePlugin,
  clipboardSaveImage,
  homeDir,
  isTauri,
  onAgentEvent,
  previewHealthCheck,
  previewServiceStart,
  previewServiceStatus,
  previewServiceStop,
} from "../lib/tauri";
import type {
  AgentChangeBaseline,
  AgentChangeSummary,
  AgentPermissionMode,
  AgentProvider,
  AgentStreamEvent,
  PreviewCheckResult,
  PreviewServiceStatus,
} from "../lib/tauri";
import { cls, Profile, Tweaks } from "../lib/tokens";
import { I } from "./Icons";

type Role = "user" | "assistant" | "system";

type ProviderMeta = {
  id: AgentProvider;
  label: string;
  short: string;
  defaultModel: string;
  dot: string;
  newTitleKo: string;
  newTitleEn: string;
};

type ModelOption = {
  value: string;
  label: string;
};

type CodexEffort = "low" | "medium" | "high" | "xhigh";
type CodexSpeed = "default" | "fast";
type CodexMenuPanel = "root" | "model" | "speed";
type HermesInferenceProvider = "anthropic" | "openai-codex" | "openrouter";
type SlashCommandScope = "atelier" | AgentProvider;
type WorkspacePluginId = "academic-research-claude";
type WorkspacePluginInstallStatus = "idle" | "installing" | "installed" | "error";

type SlashCommandSpec = {
  command: string;
  insert: string;
  scope: SlashCommandScope;
  detailKo: string;
  detailEn: string;
};

type WorkspacePluginSpec = {
  id: WorkspacePluginId;
  provider: AgentProvider;
  titleKo: string;
  titleEn: string;
  detailKo: string;
  detailEn: string;
};

type WorkspacePluginInstallState = {
  status: WorkspacePluginInstallStatus;
  message?: string;
};

type ChatAttachment = {
  id: string;
  kind: "image";
  name: string;
  path: string;
  size?: number;
  mime?: string;
};

interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  createdAt: number;
  status?: "queued" | "streaming" | "done" | "error";
  changes?: AgentChangeSummary | null;
  changeBaselineId?: string | null;
  changeCwd?: string;
  changesLoading?: boolean;
  changesChecked?: boolean;
  changesError?: string | null;
  activities?: AgentActivity[];
  attachments?: ChatAttachment[];
  rawEvents?: string[];
}

const ORPHANED_RUN_TEXT = "이전 실행이 중단되어 응답을 완료하지 못했습니다.";

function finalizeOrphanedStreamingMessages(messages: ChatMessage[]) {
  let changed = false;
  const next = messages.map((message) => {
    if (message.role !== "assistant" || message.status !== "streaming") return message;
    changed = true;
    const text = cleanAgentText(message.text);
    return {
      ...message,
      text: text || ORPHANED_RUN_TEXT,
      status: text ? ("done" as const) : ("error" as const),
      activities: message.activities?.map((activity) => ({ ...activity, active: false })),
    };
  });
  return changed ? next : messages;
}

type AgentActivityKind = "thinking" | "running" | "tool" | "status";

interface AgentActivity {
  id: string;
  kind: AgentActivityKind;
  label: string;
  detail?: string;
  active?: boolean;
  createdAt: number;
}

type PendingAgentStream = {
  sessionId: string;
  assistantId: string;
  text: string;
  rawEvents: string[];
  providerSessionId?: string | null;
  timer?: number;
};

type QueuedAgentTurn = {
  id: string;
  userMessageId: string;
  text: string;
  displayText?: string;
  attachments: ChatAttachment[];
  cwd: string;
  createdAt: number;
};

type SmoothRevealState = {
  carry: number;
  pauseUntil: number;
};

interface AgentSession {
  id: string;
  title: string;
  titleEdited?: boolean;
  provider: AgentProvider;
  profileId?: string;
  profileName?: string;
  profileDot?: string;
  model: string;
  hermesProvider?: HermesInferenceProvider;
  stellaOntologyMode?: StellaOntologyMode;
  codexEffort?: CodexEffort;
  codexSpeed?: CodexSpeed;
  permissionMode?: AgentPermissionMode;
  queueMode?: boolean;
  cwd: string;
  providerSessionId?: string;
  providerSessionModel?: string;
  providerSessionHermesProvider?: HermesInferenceProvider;
  messages: ChatMessage[];
  queuedTurns?: QueuedAgentTurn[];
  rawEvents: string[];
  updatedAt: number;
  // 세션별 프리뷰 상태 — 작업탭마다 독립적으로 유지된다.
  previewUrl?: string;
  previewVisible?: boolean;
  previewViewport?: PreviewViewport;
  previewWidth?: number;
  previewServiceCommand?: string;
}

type PreviewViewport = "mobile" | "tablet" | "desktop";
type PreviewDiagnosticSource = "terminal" | "preview";
type PreviewDiagnosticLevel = "info" | "ok" | "error";

interface PreviewDiagnostic {
  id: string;
  source: PreviewDiagnosticSource;
  level: PreviewDiagnosticLevel;
  text: string;
  createdAt: number;
}

const SESSIONS_KEY = "atelier.agent.sessions.v1";
const ACTIVE_KEY = "atelier.agent.active.v1";
const CWD_KEY = "atelier.agent.cwd.v1";
const PREVIEW_KEY = "atelier.agent.preview.url.v1";
const PREVIEW_VISIBLE_KEY = "atelier.agent.preview.visible.v1";
const PREVIEW_VP_KEY = "atelier.agent.preview.viewport.v1";
const PREVIEW_WIDTH_KEY = "atelier.agent.preview.width.v1";
const PREVIEW_SERVICE_COMMAND_KEY = "atelier.agent.preview.service.command.v1";
const DEV_SCREEN_VISIBLE_KEY = "atelier.agent.devscreen.visible.v1";
const DEV_SCREEN_HOST_KEY = "atelier.agent.devscreen.host.v1";
const DEV_SCREEN_PORT_KEY = "atelier.agent.devscreen.port.v1";
const DEV_SCREEN_WINDOW_KEY = "atelier.agent.devscreen.window.v1";
const TASK_LIST_VISIBLE_KEY = "atelier.agent.tasklist.visible.v1";
const DEFAULT_PROVIDER: AgentProvider = "claude";
const DEFAULT_HERMES_PROVIDER: HermesInferenceProvider = "openai-codex";
const DEFAULT_CODEX_EFFORT: CodexEffort = "xhigh";
const DEFAULT_CODEX_SPEED: CodexSpeed = "default";
const DEFAULT_PERMISSION_MODE: AgentPermissionMode = "full";
const MAX_RAW_EVENTS = 120;
const MAX_RAW_EVENT_CHARS = 12000;
const MAX_COMPACT_AGENT_CONTEXT_CHARS = 9000;
const MAX_COMPACT_AGENT_CONTEXT_MESSAGES = 8;
const STREAM_FLUSH_MS = 120;
const FINAL_ONLY_WORKSPACE_STREAMING = true;
const CHANGE_BASELINE_TIMEOUT_MS = 650;
const SMOOTH_OUTPUT_FPS = 30;
const SMOOTH_FRAME_MS = 1000 / SMOOTH_OUTPUT_FPS;
const SMOOTH_BACKGROUND_CATCH_UP_MS = 900;
const INPUT_REVEAL_PAUSE_MS = 220;
const SESSION_PERSIST_DEBOUNCE_MS = 260;
const HERMES_GOLD = "#8a8218";
const PREVIEW_VP_SIZES: Record<Exclude<PreviewViewport, "desktop">, { w: number; h: number }> = {
  mobile: { w: 390, h: 844 },
  tablet: { w: 834, h: 1194 },
};
const LOCAL_PREVIEW_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#]|$)/i;
const TERMINAL_ISSUE_RE =
  /\b(?:error|failed|failure|exception|panic|traceback|npm ERR|EADDRINUSE|ECONNREFUSED|ECONNRESET|vite error|compile failed|compilation failed)\b/i;
const NO_AGENT_RESPONSE_KO = "응답을 완료하지 못했습니다. 같은 작업에서 다시 요청하면 이어서 확인할 수 있습니다.";
const NO_AGENT_RESPONSE_EN = "The agent finished without a final response. Ask again in this task to continue.";

function isFastPatchTask(text: string) {
  const clean = text.trim();
  if (!clean || clean.length > 900) return false;
  const lower = clean.toLowerCase();
  const deepWork =
    /원인|분석|조사|아키텍처|구조|설계|보안|전체\s*(검사|점검|확인)|배포|릴리즈|패키징|스토어|인증|테스트\s*(전부|전체)|full\s+(audit|test|review)|security|architecture|release|deploy/.test(
      lower,
    );
  if (deepWork) return false;
  return /한글|한국어|영어|번역|문구|텍스트|라벨|레이블|표기|오타|띄어쓰기|색상|컬러|배지|badge|label|copy|text|translate|translation|korean|english|typo|wording|color|colour/.test(
    lower,
  );
}

function normalizeAgentDotColor(color?: string | null) {
  const c = (color || "").trim().toLowerCase();
  if (c === "#fffb00" || c === "#ffff00" || c === "#fff800" || c === "#c4bc00") return HERMES_GOLD;
  return color || HERMES_GOLD;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function noAgentResponseText(language?: string) {
  return language === "en" ? NO_AGENT_RESPONSE_EN : NO_AGENT_RESPONSE_KO;
}

async function captureChangeBaselineForTurn(cwd: string | null, timeoutMs: number) {
  let timeoutId: number | undefined;
  const baselinePromise = agentChangeBaseline(cwd).catch((err) => {
    console.warn("agent change baseline failed", err);
    return null;
  });
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
  });
  const baseline = await Promise.race<AgentChangeBaseline | null>([baselinePromise, timeoutPromise]);
  if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  return baseline;
}

// 응답 본문의 raw dump 자동 축약.
// Claude.app 스타일을 목표로 답변 외 메타(프롬프트 echo, hermes 초기화 메시지, diff hunk, 명령 dump)를 가린다.
// 원본은 m.text에 그대로 남아 있으므로 토글 확장도 가능.
// 박스 라인 ( ━━━ / ─── / ═══ / --- 8자 이상 연속, 가운데에 ⋮ provider 라벨이 끼어있는 경우 포함)
function isBoxSeparator(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^[━─═—\-]{8,}/.test(t)) return true;
  // 라인 안에 8자+ 연속 ━ 가 있으면 박스 헤더로 간주 ("━━━ ⋮ Hermes ━━━")
  if (/[━─═]{8,}/.test(t)) return true;
  return false;
}

function isProviderLabel(line: string): boolean {
  const t = line.trim();
  // ⋮ · • ◆ ◇ ⚕ ❀ ✦ ★ 등 + provider 이름 + 좌우 ─ ━ 장식 허용
  if (/^[─━═\s]*[⋮·•◆◇⚕❀✦★]\s+(Hermes|Claude|Codex|GPT|OpenAI|Anthropic)/i.test(t)) return true;
  // 박스 구분선 안에 ⚕ Hermes 등 (예: "─  ⚕ Hermes  ─────...")
  if (/[⋮·•◆◇⚕❀✦★]\s+(Hermes|Claude|Codex|GPT|OpenAI|Anthropic)/i.test(t) && /[─━═]/.test(t)) return true;
  return false;
}

function stripHermesPreamble(input: string): string {
  // 첫 ━━ 박스 구분선까지의 모든 텍스트 = 메타/instruction echo. 모두 drop.
  // 박스 구분선 자체 + 바로 다음 ⋮ Provider 라벨도 drop.
  const lines = input.split("\n");
  let firstSepIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 80); i += 1) {
    if (isBoxSeparator(lines[i])) {
      firstSepIdx = i;
      break;
    }
  }
  if (firstSepIdx >= 0) {
    let start = firstSepIdx + 1;
    // 박스 헤더 바로 다음의 ⋮ Provider 라벨 + 빈 줄 + 추가 구분선 모두 skip
    while (
      start < lines.length &&
      (lines[start].trim() === "" || isProviderLabel(lines[start]) || isBoxSeparator(lines[start]))
    ) {
      start += 1;
    }
    return lines.slice(start).join("\n");
  }

  // 박스가 없으면 기존 메타 키워드 기반 fallback
  const metaPatterns = [
    /^Initializing agent/,
    /^↺\s*Resumed session/,
    /^📦\s*Preflight compression/,
    /^Loading session/,
    /^Continuing session/,
  ];
  let lastMetaIdx = -1;
  const scanLimit = Math.min(lines.length, 60);
  for (let i = 0; i < scanLimit; i += 1) {
    if (metaPatterns.some((re) => re.test(lines[i]))) {
      lastMetaIdx = i;
    }
  }
  if (lastMetaIdx >= 0) {
    let start = lastMetaIdx + 1;
    while (
      start < lines.length &&
      (lines[start].trim() === "" || isBoxSeparator(lines[start]) || isProviderLabel(lines[start]))
    ) {
      start += 1;
    }
    return lines.slice(start).join("\n");
  }
  if (lines[0]?.startsWith("Query:")) {
    let i = 0;
    let inInstruction = false;
    while (i < lines.length && i < 60) {
      const t = lines[i].trim();
      if (/^Atelier (표시 지침|display guidance)/.test(t)) inInstruction = true;
      if (inInstruction && t === "") {
        i += 1;
        break;
      }
      i += 1;
    }
    return lines.slice(i).join("\n");
  }
  return input;
}

// 본문 끝의 trailing meta 제거 (Resume / Session / Duration / Messages / Tokens / Title 단독 라인 + 박스 구분선 + ⚕ 라벨)
function stripHermesTrailing(input: string): string {
  const lines = input.split("\n");
  let end = lines.length;
  const trailingPatterns = [
    /^Resume\s+(?:this session\s+)?with:?/i,
    /^Session:\s/,
    /^Duration:\s/,
    /^Messages:\s/,
    /^Tokens:\s/,
    /^Title:\s/,
    /^Continuing session/,
    /^\s+hermes\s+--/, // "  hermes --resume ..." 들여쓰기 명령 라인
  ];
  while (end > 0) {
    const raw = lines[end - 1];
    const t = raw.trim();
    if (
      t === "" ||
      isBoxSeparator(raw) ||
      isProviderLabel(raw) ||
      trailingPatterns.some((re) => re.test(raw)) ||
      trailingPatterns.some((re) => re.test(t))
    ) {
      end -= 1;
      continue;
    }
    break;
  }
  return lines.slice(0, end).join("\n");
}

// 사고/도구 진행 narration은 본문에서 제거. (별도 status 영역 차후 작업)
function stripThinkingLines(input: string): string {
  if (!input) return input;
  return input
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^(?:Thinking|Tinkering|Considering|Planning|Analyzing|Searching|Reading|Editing|Writing|Reasoning)\.{0,3}$/i.test(t)) return false;
      if (/^(?:\.{2,3}|…)?\s*생각\s*중$/.test(t)) return false;
      if (/^(?:•|·|●)?\s*Thinking/i.test(t)) return false;
      if (/^(?:•|·|●)?\s*Tinkering/i.test(t)) return false;
      return true;
    })
    .join("\n");
}

function isAgentActivityLine(line: string): boolean {
  const t = line.trim().replace(/^(?:Hm|Cl|Ci|Cd)\s+/, "");
  if (!t) return false;
  if (isProviderDiagnosticLine(t)) return true;
  if (/^⚠️?\s*Compression summary failed\b/i.test(t)) return true;
  if (/Inserted a fallback context marker/i.test(t)) return true;
  if (/^⟳\s*compacting context/i.test(t)) return true;
  if (/^⚠️?\s*Session compressed\b/i.test(t)) return true;
  if (/\(tip\)\s*That tool ran/i.test(t)) return true;
  if (/Use\s+\/verbose\s+to cycle tool-progress display modes/i.test(t)) return true;
  if (/^📝\s*코드 변경\b/u.test(t)) return true;
  if (/omitted\s+\d+\s+diff line/i.test(t)) return true;
  const hasActivityIcon = /[📚🐍💻📖🔎📋🧠🔧⚙▶✍🌐📸⚡⚠🔌⏱⏳📝]/u.test(t);
  if (t.startsWith("┊") && hasActivityIcon) return true;
  if (/^┊\s*review diff\b/i.test(t)) return true;
  if (
    hasActivityIcon &&
    /\b(skill|exec|read|write|grep|plan|memory|review diff|navigate|snapshot|browser[_-]?\w*)\b|\$\s/.test(t)
  ) {
    return true;
  }
  return false;
}

function isProviderDiagnosticLine(line: string): boolean {
  const t = line.trim().replace(/^(?:Hm|Cl|Ci|Cd)\s+/, "");
  if (!t) return false;
  if (/\bNo response from provider for \d+s\b/i.test(t)) return true;
  if (/\bAPI call failed\s*\(attempt\s+\d+\/\d+\):\s*TimeoutError\b/i.test(t)) return true;
  if (/\bNon-streaming API call timed out\b/i.test(t)) return true;
  if (/\bAborting call\b/i.test(t) && /\bprovider\b/i.test(t)) return true;
  if (/^⚠️?\s*(?:No response from provider|API call failed)\b/i.test(t)) return true;
  if (/^(?:🔌\s*)?Provider:\s+/i.test(t)) return true;
  if (/^(?:🌐\s*)?Endpoint:\s+/i.test(t)) return true;
  if (/^(?:📝\s*)?Error:\s+Non-streaming API call timed out\b/i.test(t)) return true;
  if (/^(?:⏱️?\s*)?Elapsed:\s+\d+(?:\.\d+)?s\b/i.test(t)) return true;
  if (/^(?:⏳\s*)?Retrying in\s+\d+(?:\.\d+)?s\b/i.test(t)) return true;
  if (/\bTimeoutError\b/i.test(t) && /\b(?:API|provider|non-streaming|attempt)\b/i.test(t)) return true;
  return false;
}

function isElapsedShellToolLine(text: string): boolean {
  const t = text.trim().replace(/^(?:Hm|Cl|Ci|Cd)\s+/, "");
  if (!t) return false;
  const hasElapsedTail = /(?:["'`])?\s+\d+(?:\.\d+)?s\s*(?:\[error\])?$/i.test(t);
  if (!hasElapsedTail) return false;
  const startsLikeShell =
    /^\$?\s*(?:cd|docker|ssh|bash|sh|zsh|fish|python3?|npm|npx|pnpm|yarn|bun|cargo|git|node|deno|uv|curl|wget|rsync|scp|sed|awk|grep|rg|cat|tail|head|ls|find|mkdir|cp|mv|rm|printf|echo)\b/i.test(t)
    || /^\$?\s*\/(?:usr|bin|sbin|opt|Users|Volumes|volume1|tmp|var)\//i.test(t)
    || /^\$?\s*(?:\.\.?\/)?[\w./-]+\.sh\b/i.test(t);
  const containsShellChain =
    /\s(?:&&|\|\||;)\s*(?:\/(?:usr|bin|sbin|opt|Users|Volumes|volume1|tmp|var)\/)?(?:docker|python3?|npm|npx|pnpm|yarn|cargo|git|node|curl|bash|sh)\b/i.test(t);
  return startsLikeShell || containsShellChain;
}

function isAgentCommandDumpLine(line: string): boolean {
  const t = line.trim().replace(/^(?:Hm|Cl|Ci|Cd)\s+/, "");
  if (!t) return false;
  if (isElapsedShellToolLine(t)) return true;
  if (/^repls\s*=\s*\{/.test(t)) return true;
  if (/^['"][^'"]+\.(?:tsx|ts|jsx|js|py|css|json)['"]\s*:\s*\{/.test(t)) return true;
  if (/^(?:for\s+rel,\s*mp\s+in\s+repls\.items\(\)|p\s*=\s*root\s*\/\s*rel|if\s+not\s+p\.exists\(\)|if\s+text\s*!=\s*old|p\.write_text\(|text\s*=\s*text\.replace\()/u.test(t)) return true;
  if (/\brepls\s*=\s*\{/.test(t) && /\.(?:tsx|ts|jsx|js|py|css|json)['"]\s*:\s*\{/.test(t)) return true;
  if (/\b(?:p\.write_text|text\s*=\s*text\.replace|repls\.items\(\))\b/u.test(t)) return true;
  if (/^(?:write|edit)\s+\/(?:tmp|var|Users)\//i.test(t)) return true;
  if (/^navigate\s+(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(?::\d+)?/i.test(t)) return true;
  if (/\bsnapshot\s+full\s+\d+(?:\.\d+)?s\b/i.test(t)) return true;
  if (/\bbrowser[_-]?\w*\s+\d+(?:\.\d+)?s\s*(?:\[error\])?/i.test(t)) return true;
  if (/\b(?:write|navigate|snapshot|browser[_-]?\w*)\b.*\d+(?:\.\d+)?s(?:\s*\[error\])?/i.test(t)) return true;
  if (/\bproc\s+(?:wait|log|poll)\s+proc_[a-f0-9]+\b/i.test(t)) return true;
  if (/^if\s+lsof\s+.*tcp:\d+/.test(t)) return true;
  if (/\blsof\s+-ti\s+tcp:\d+/.test(t)) return true;
  if (/\bkill\s+\$\(lsof\b/.test(t)) return true;
  if (/\/dev\/null/.test(t) && /\b(?:lsof|kill)\b/.test(t)) return true;
  if (/^for\s+port\s+in\s+\[[\d,\s]+\]:/.test(t)) return true;
  if (/\bsocket\.socket\(\)|\.settimeout\(|\.connect\(\(['"]127\.0\.0\.1['"]/.test(t)) return true;
  if (/^finally:\s*s\.close\(\)/.test(t)) return true;
  if (/^for\s+url\s+in\s+https?:\/\//.test(t) && /\bdo\b/.test(t)) return true;
  if (/^code=\$\(curl\b/.test(t)) return true;
  if (/^bytes=\$\(wc\s+-c\b/.test(t)) return true;
  if (/\bcurl\s+-k\b/.test(t) || /\bcurl\b.*--max-time\b/.test(t)) return true;
  if (/\/tmp\/(?:kn|atelier|preview)?_?check\b/.test(t)) return true;
  if (/\bwc\s+-c\b.*\btr\s+-d\b/.test(t)) return true;
  if (/\becho\s+["']?\$url\s+\$code\s+\$bytes/.test(t)) return true;
  if (/^from\s+pathlib\s+import\s+Path\b/.test(t)) return true;
  if (/^(?:p|path|env_path)=Path\(/.test(t)) return true;
  if (/^vals=\{\}/.test(t)) return true;
  if (/^if\s+not\s+line\s+or\s+line\.strip\(\)/.test(t)) return true;
  if (/^[kv]\s*,\s*[v=]|^k,v\s*=/.test(t)) return true;
  if (/^for\s+k\s+in\b/.test(t)) return true;
  if (/^v=vals\.get\(/.test(t)) return true;
  if (/^if\s+v\s+is\s+None\s+or\s+v==/.test(t)) return true;
  if (/^elif\s+k\.endswith\(/.test(t)) return true;
  if (/^else:\s*status=/.test(t)) return true;
  if (/^PY$/.test(t)) return true;
  if (/KANSICRICH_MODE|DASHBOARD_API_TOKEN|BINANCE_API_KEY|TELEGRAM_BOT_TOKEN|RUNNER_PORT/.test(t)) return true;
  if (/docker\s+compose\s+ps\b/.test(t)) return true;
  if (/^import\s+os\b.*\broots=\[/.test(t)) return true;
  if (/\bimport\s+os\b.*\broots=\[/.test(t)) return true;
  if (/\b(files|roots)=\[[^\]]*\].*\b(rglob|splitlines|read_text)\b/.test(t)) return true;
  if (/\bdef\s+\w+\([^)]*\):.*\bsubprocess\b/.test(t)) return true;
  if (/\bfiles=\[p\s+for\s+p\s+in\b/.test(t)) return true;
  if (/\bfor\s+d\s+in\s+\[/.test(t) && /\bfiles=/.test(t)) return true;
  if (/\blines=sum\b|\blen\(files\)|p\.read_text\(|list\(root\/d\)\.rglob/.test(t)) return true;
  if (/^(files\s+if|any\(|in\s+\[|print\(f|for\s+p\s+in\s+files\b)/.test(t)) return true;
  if (/\bhermes\s+kanban\s+--board\b/.test(t)) return true;
  if (/\bNEW_(?:HYGIENE|DASH)=/.test(t)) return true;
  if (/\b--idempotency-key\b/.test(t)) return true;
  const looksLikeCode =
    /^(from\s+\w+\s+import|import\s+\w+|root=|files=|cmd=|out=|try:|except\s+|for\s+\w+\s+in|if\s+|print\(|PY\s+)/.test(t) ||
    /\bfor\s+\w+\s+in\b.*\bprint\(/.test(t);
  const hasToolContext =
    /\/Users\/|subprocess|Path\(|\bPath\b|rglob\(|\.read_text\(|splitlines\(|\d+(?:\.\d+)?s\s*(?:\[error\])?$/.test(t);
  const looksLikeShell =
    /^\$?\s*(hermes|python3?|npm|cargo|git|node)\s+/.test(t) &&
    /\d+(?:\.\d+)?s(?:\s+\[error\])?$/.test(t);
  return (looksLikeCode && hasToolContext) || looksLikeShell;
}

function isSocketProbeLine(line: string): boolean {
  const t = line.trim().replace(/^(?:Hm|Cl|Ci|Cd)\s+/, "");
  if (!t) return false;
  return /^import\s+socket\b/.test(t)
    || /^for\s+port\s+in\s+\[[\d,\s]+\]:/.test(t)
    || /\bs\s*=\s*socket\.socket\(\)/.test(t)
    || /\bs\.settimeout\(/.test(t)
    || /\bs\.connect\(\(['"]127\.0\.0\.1['"]\s*,\s*port\)\)/.test(t)
    || /print\(port,\s*['"](open|closed)['"]\)/.test(t)
    || /^except\s+Exception\s+as\s+e:\s*print\(port,\s*['"]closed['"]\)/.test(t)
    || /^try:\s*$/.test(t)
    || /^finally:\s*s\.close\(\)/.test(t)
    || /\bproc\s+(?:wait|log|poll)\s+proc_[a-f0-9]+\b/i.test(t);
}

function isSocketProbeBlockAt(lines: string[], start: number): boolean {
  const first = lines[start]?.trim().replace(/^(?:Hm|Cl|Ci|Cd)\s+/, "") || "";
  if (!/^import\s+socket\b/.test(first)) return false;
  const window = lines
    .slice(start, Math.min(lines.length, start + 9))
    .map((line) => line.trim().replace(/^(?:Hm|Cl|Ci|Cd)\s+/, ""))
    .join("\n");
  return /^import\s+socket\b/m.test(window)
    && /^for\s+port\s+in\s+\[[\d,\s]+\]:/m.test(window)
    && /\bsocket\.socket\(\)/.test(window)
    && /\.connect\(\(['"]127\.0\.0\.1['"]\s*,\s*port\)\)/.test(window);
}

function isSocketProbeDumpText(input: string): boolean {
  const lines = input.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (isSocketProbeBlockAt(lines, i)) return true;
  }
  return false;
}

function stripAgentActivityLines(input: string): string {
  if (!input) return input;
  const lines = input.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isSocketProbeBlockAt(lines, i)) {
      i += 1;
      while (i < lines.length && (lines[i].trim() === "" || isSocketProbeLine(lines[i]))) {
        i += 1;
      }
      continue;
    }
    const line = lines[i];
    if (!isAgentActivityLine(line) && !isAgentCommandDumpLine(line)) {
      out.push(line);
    }
    i += 1;
  }
  return out.join("\n");
}

function isAgentDumpText(input: string): boolean {
  const t = input.trim().replace(/^(?:Hm|Cl|Ci|Cd)\s+/, "");
  if (!t) return false;
  if (isSocketProbeDumpText(t)) return true;
  if (/\brepls\s*=\s*\{/.test(t) && /\b(?:p\.write_text|text\s*=\s*text\.replace|repls\.items\(\))\b/u.test(t)) return true;
  const lines = t.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    return lines.every((line) => isAgentActivityLine(line) || isAgentCommandDumpLine(line));
  }
  if (isAgentActivityLine(t) || isAgentCommandDumpLine(t)) return true;
  if (/for\s+url\s+in\s+https?:\/\//.test(t) && /\bcurl\b/.test(t) && /\bbytes=\$\(wc\s+-c\b/.test(t)) return true;
  if (/for\s+d\s+in\s+\['src'/.test(t) && /\brglob\(/.test(t)) return true;
  if (/\bfiles\s*\+=\s*list\(\(root\/d\)\.rglob/.test(t)) return true;
  if (/\bimport\s+os\b.*\broots=\[/.test(t) && /\bos\.walk\(/.test(t)) return true;
  if (/def\s+create\(title,\s*body,\s*assignee/.test(t) && /hermes['"]?\s*,\s*['"]kanban/.test(t)) return true;
  if (/--body\s+['"]Context:/.test(t) && /--assignee\b/.test(t) && /--idempotency-key\b/.test(t)) return true;
  if (/printf\s+['"]\\nNEW_HYGIENE/.test(t) || /\bNEW_HYGIENE=/.test(t) || /\bNEW_DASH=/.test(t)) return true;
  if (/^📦\s*Preflight compression\b/u.test(t)) return true;
  if (/^📝\s*코드 변경\s+\d+줄\s*\(생략됨\)/u.test(t)) return true;
  return false;
}

function isDiffFileHeaderLine(line: string): boolean {
  const t = line.trim();
  return /^diff\s+--git\s+/i.test(t)
    || /^---\s+a\//.test(t)
    || /^\+\+\+\s+b\//.test(t)
    || /^[ab]\/{1,2}[^\s].*\s+→\s+[ab]\/{1,2}[^\s]/.test(t)
    || /^[ab]\/{2}\/Users\//.test(t);
}

function isDiffHunkHeaderLine(line: string): boolean {
  return /^@@\s*-\d+(?:,\d+)?\s*\+\d+(?:,\d+)?\s*@@/.test(line.trim());
}

function isDiffContinuationLine(line: string): boolean {
  return line.trim() === "" || /^[ +\-]/.test(line);
}

function stripUnifiedDiffBlocks(input: string): string {
  if (!input) return input;
  const lines = input.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isDiffFileHeaderLine(line) && !isDiffHunkHeaderLine(line)) {
      out.push(line);
      i += 1;
      continue;
    }

    i += 1;
    while (i < lines.length) {
      const cur = lines[i];
      if (isDiffFileHeaderLine(cur) || isDiffHunkHeaderLine(cur) || isDiffContinuationLine(cur)) {
        i += 1;
        continue;
      }
      break;
    }
  }
  return out.join("\n");
}

// 스트리밍 화면용 공백 정제. 저장 원본(m.text)에는 적용 안 함.
// - 줄 끝 trailing whitespace 제거
// - 연속 공백 1칸으로 축약 (단 들여쓰기 보존, 코드블록 ``` 내부는 원본 유지)
function cleanStreamingText(input: string): string {
  if (!input) return input;
  const lines = input.split("\n");
  let inCodeFence = false;
  const out: string[] = [];
  for (const raw of lines) {
    if (/^```/.test(raw.trim())) {
      inCodeFence = !inCodeFence;
      out.push(raw.replace(/[ \t]+$/g, ""));
      continue;
    }
    if (inCodeFence) {
      out.push(raw);
      continue;
    }
    // trailing whitespace 제거
    let cleaned = raw.replace(/[ \t]+$/g, "");
    // 들여쓰기(첫 공백)는 보존, 그 이후 연속 공백 2개+를 1개로
    const leadingMatch = cleaned.match(/^(\s*)(.*)$/);
    if (leadingMatch) {
      const leading = leadingMatch[1];
      const body = leadingMatch[2].replace(/[ \t]{2,}/g, " ");
      cleaned = leading + body;
    }
    out.push(cleaned);
  }
  return out.join("\n");
}

function collapseDumpyText(input: string): string {
  if (!input) return input;
  if (isAgentDumpText(input)) return "";
  const stripped = stripAgentActivityLines(stripUnifiedDiffBlocks(stripHermesTrailing(stripThinkingLines(stripHermesPreamble(input)))));
  if (isAgentDumpText(stripped)) return "";
  const lines = stripped.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // diff 블록 시작 감지: @@ -X,Y +X,Y @@ 또는 a//path → b//path 류 파일 헤더
    if (isDiffHunkHeaderLine(line) || isDiffFileHeaderLine(line)) {
      let j = i;
      while (j < lines.length) {
        const cur = lines[j];
        if (isDiffFileHeaderLine(cur) || isDiffHunkHeaderLine(cur) || isDiffContinuationLine(cur)) {
          j += 1;
          continue;
        }
        break;
      }
      i = j;
      continue;
    }
    // 명령 라인 연속 압축
    const isShellLine = /^\s*(?:\$|Running:|Tool:|>\s)/.test(line);
    if (isShellLine) {
      let count = 0;
      let j = i;
      while (j < lines.length && /^\s*(?:\$|Running:|Tool:|>\s)/.test(lines[j])) {
        count += 1;
        j += 1;
      }
      if (count >= 3) {
        out.push(`💻 터미널 ${count}건 (생략됨)`);
        i = j;
        continue;
      }
    }
    out.push(line);
    i += 1;
  }
  const collapsed = out.join("\n");
  return isAgentDumpText(collapsed) ? "" : collapsed;
}

const CHAT_MARKDOWN_COMPONENTS = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="atelier-chat-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

const PROVIDERS: ProviderMeta[] = [
  {
    id: "claude",
    label: "Claude Code",
    short: "Cl",
    defaultModel: "claude-sonnet-4-6",
    dot: "#c96442",
    newTitleKo: "새 Claude 작업",
    newTitleEn: "New Claude workspace",
  },
  {
    id: "hermes",
    label: "Hermes",
    short: "Hm",
    defaultModel: "gpt-5.5",
    dot: "#8a8218",
    newTitleKo: "새 Hermes 작업",
    newTitleEn: "New Hermes workspace",
  },
  {
    id: "codex",
    label: "Codex CLI",
    short: "Cx",
    defaultModel: "gpt-5.5",
    dot: "#4b7bd1",
    newTitleKo: "새 Codex 작업",
    newTitleEn: "New Codex workspace",
  },
];

const WORKSPACE_PLUGINS: WorkspacePluginSpec[] = [
  {
    id: "academic-research-claude",
    provider: "claude",
    titleKo: "Academic Research Skills",
    titleEn: "Academic Research Skills",
    detailKo: "Claude Code용 연구, 문헌조사, 논문 작성 워크플로 플러그인",
    detailEn: "Claude Code research, literature review, and paper-writing workflow plugin",
  },
];

const CLAUDE_MODELS: ModelOption[] = [
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 · 20251001" },
];

const OPENAI_CODEX_MODELS: ModelOption[] = [
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { value: "gpt-5.2", label: "GPT-5.2" },
];

const OPENROUTER_MODELS: ModelOption[] = [
  { value: "openai/gpt-5.5", label: "OpenAI GPT-5.5" },
  { value: "openai/gpt-5.5-pro", label: "OpenAI GPT-5.5 Pro" },
  { value: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7" },
  { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { value: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" },
];

const CODEX_MODELS: ModelOption[] = [
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { value: "gpt-5.2", label: "GPT-5.2" },
];

const MODEL_OPTIONS: Record<AgentProvider, ModelOption[]> = {
  claude: CLAUDE_MODELS,
  hermes: OPENAI_CODEX_MODELS,
  codex: CODEX_MODELS,
};

const HERMES_PROVIDERS: Array<{ value: HermesInferenceProvider; label: string }> = [
  { value: "anthropic", label: "Claude" },
  { value: "openai-codex", label: "Codex" },
  { value: "openrouter", label: "OpenRouter" },
];

const HERMES_MODEL_OPTIONS: Record<HermesInferenceProvider, ModelOption[]> = {
  anthropic: CLAUDE_MODELS,
  "openai-codex": OPENAI_CODEX_MODELS,
  openrouter: OPENROUTER_MODELS,
};

const CODEX_EFFORTS: Array<{ value: CodexEffort; ko: string; en: string }> = [
  { value: "low", ko: "낮음", en: "Low" },
  { value: "medium", ko: "중간", en: "Medium" },
  { value: "high", ko: "높음", en: "High" },
  { value: "xhigh", ko: "매우 높음", en: "Very high" },
];

const CODEX_SPEEDS: Array<{ value: CodexSpeed; ko: string; en: string }> = [
  { value: "default", ko: "기본", en: "Default" },
  { value: "fast", ko: "빠름", en: "Fast" },
];

const PERMISSION_MODES: Array<{
  value: AgentPermissionMode;
  ko: string;
  en: string;
  detailKo: string;
  detailEn: string;
  icon: React.ReactNode;
}> = [
  {
    value: "basic",
    ko: "기본 권한",
    en: "Basic permission",
    detailKo: "확인 중심",
    detailEn: "Confirm-first",
    icon: I.hand,
  },
  {
    value: "auto",
    ko: "자동 검토",
    en: "Auto review",
    detailKo: "자동 실행 + 보호",
    detailEn: "Auto with guardrails",
    icon: I.shieldCheck,
  },
  {
    value: "full",
    ko: "전체 권한",
    en: "Full permission",
    detailKo: "승인 없이 진행",
    detailEn: "No prompts",
    icon: I.shieldAlert,
  },
];

const isProvider = (value: unknown): value is AgentProvider =>
  value === "claude" || value === "hermes" || value === "codex";

const isHermesProvider = (value: unknown): value is HermesInferenceProvider =>
  value === "anthropic" || value === "openai-codex" || value === "openrouter";

const isCodexEffort = (value: unknown): value is CodexEffort =>
  value === "low" || value === "medium" || value === "high" || value === "xhigh";

const isCodexSpeed = (value: unknown): value is CodexSpeed =>
  value === "default" || value === "fast";

const isPermissionMode = (value: unknown): value is AgentPermissionMode =>
  value === "basic" || value === "auto" || value === "full";

const providerMeta = (provider?: string | null) =>
  PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0];

function providerFromProfile(profile: Profile): AgentProvider | null {
  if (isProvider(profile.autoInstall)) return profile.autoInstall;
  if (isProvider(profile.id)) return profile.id;
  const cmd = profile.cmd.trim().toLowerCase();
  if (!cmd) return null;
  const first = cmd.split(/\s+/)[0].split(/[\\/]/).pop() || "";
  if (first.includes("claude")) return "claude";
  if (first.includes("hermes")) return "hermes";
  if (first.includes("codex")) return "codex";
  return null;
}

function modelFromProfile(profile: Profile, provider: AgentProvider) {
  const parts = profile.cmd.trim().split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    const current = parts[i];
    const next = parts[i + 1];
    if ((current === "-m" || current === "--model") && next) return next;
    if (current.startsWith("--model=")) return current.slice("--model=".length);
  }
  return providerMeta(provider).defaultModel;
}

function hermesProviderFromProfile(profile?: Profile) {
  const parts = profile?.cmd.trim().split(/\s+/) || [];
  for (let i = 0; i < parts.length; i++) {
    const current = parts[i];
    const next = parts[i + 1];
    if (current === "--provider" && next) return normalizeHermesProvider(next);
    if (current.startsWith("--provider=")) return normalizeHermesProvider(current.slice("--provider=".length));
  }
  return DEFAULT_HERMES_PROVIDER;
}

function defaultHermesModel(hermesProvider: HermesInferenceProvider) {
  if (hermesProvider === "anthropic") return "claude-sonnet-4-6";
  if (hermesProvider === "openrouter") return "openai/gpt-5.5";
  return "gpt-5.5";
}

function inferHermesProviderFromModel(model?: string | null) {
  const trimmed = model?.trim();
  if (!trimmed) return DEFAULT_HERMES_PROVIDER;
  if (trimmed.startsWith("anthropic/") || trimmed.startsWith("openai/")) return "openrouter";
  if (trimmed.startsWith("claude-") || trimmed === "sonnet" || trimmed === "opus" || trimmed === "haiku") return "anthropic";
  return DEFAULT_HERMES_PROVIDER;
}

function modelOptionsFor(
  provider: AgentProvider,
  selected?: string | null,
  hermesProvider: HermesInferenceProvider = DEFAULT_HERMES_PROVIDER,
) {
  const options = provider === "hermes"
    ? HERMES_MODEL_OPTIONS[hermesProvider]
    : MODEL_OPTIONS[provider] || [];
  const trimmed = selected?.trim();
  if (!trimmed || options.some((option) => option.value === trimmed)) return options;
  return [{ value: trimmed, label: `사용자 지정: ${trimmed}` }, ...options];
}

function labelForOption(options: ModelOption[], value: string) {
  return options.find((option) => option.value === value)?.label || value;
}

function normalizeCodexEffort(value?: unknown): CodexEffort {
  return isCodexEffort(value) ? value : DEFAULT_CODEX_EFFORT;
}

function normalizeCodexSpeed(value?: unknown): CodexSpeed {
  return isCodexSpeed(value) ? value : DEFAULT_CODEX_SPEED;
}

function normalizeHermesProvider(value?: unknown): HermesInferenceProvider {
  return isHermesProvider(value) ? value : DEFAULT_HERMES_PROVIDER;
}

function normalizePermissionMode(value?: unknown): AgentPermissionMode {
  return isPermissionMode(value) ? value : DEFAULT_PERMISSION_MODE;
}

function labelForCodexSpeed(value: CodexSpeed, language: Tweaks["language"]) {
  const option = CODEX_SPEEDS.find((item) => item.value === value) || CODEX_SPEEDS[0];
  return language === "en" ? option.en : option.ko;
}

function labelForPermissionMode(value: AgentPermissionMode, language: Tweaks["language"]) {
  const option = PERMISSION_MODES.find((item) => item.value === value) || PERMISSION_MODES[0];
  return language === "en" ? option.en : option.ko;
}

function findModelOptionValue(options: ModelOption[], input: string) {
  const query = input.trim().toLowerCase();
  if (!query) return null;
  return options.find((option) =>
    option.value.toLowerCase() === query || option.label.toLowerCase() === query,
  )?.value || null;
}

function slashCommandsFor(
  provider: AgentProvider,
  hermesProvider: HermesInferenceProvider,
  modelOptions: ModelOption[],
): SlashCommandSpec[] {
  const modelValues = modelOptions.map((option) => option.value).join(" | ");
  const common: SlashCommandSpec[] = [
    {
      command: "/help",
      insert: "/help",
      scope: "atelier",
      detailKo: "슬래시 명령어 전체 보기",
      detailEn: "Show all slash commands",
    },
    {
      command: "/goal <objective>",
      insert: "/goal ",
      scope: "atelier",
      detailKo: "목표 달성까지 계획-실행-검증을 반복하는 Goal 모드로 실행",
      detailEn: "Run in Goal mode and keep iterating until the objective is satisfied",
    },
    ...ACADEMIC_RESEARCH_SLASH_COMMANDS.map((item) => ({
      ...item,
      scope: "atelier" as const,
    })),
    {
      command: "/stella",
      insert: "/stella",
      scope: "atelier",
      detailKo: "Stella/Atelier 온톨로지 모드로 전환",
      detailEn: "Switch to Stella/Atelier ontology mode",
    },
    {
      command: "/mode direct|stella|evidence",
      insert: "/mode ",
      scope: "atelier",
      detailKo: "Atelier 온톨로지 실행 모드 변경",
      detailEn: "Change Atelier ontology execution mode",
    },
    {
      command: "/que",
      insert: "/que",
      scope: "atelier",
      detailKo: "실행 중 새 메시지를 대기열로 쌓기/해제",
      detailEn: "Toggle queue mode for messages sent during a run",
    },
    {
      command: "/que <message>",
      insert: "/que ",
      scope: "atelier",
      detailKo: "현재 실행을 끊지 않고 이 메시지를 대기열로 넣기",
      detailEn: "Queue this message without interrupting the current run",
    },
    {
      command: "/queue",
      insert: "/queue",
      scope: "atelier",
      detailKo: "현재 대기열 보기",
      detailEn: "Show queued turns",
    },
    {
      command: "/queue clear",
      insert: "/queue clear",
      scope: "atelier",
      detailKo: "대기 중인 요청 비우기",
      detailEn: "Clear queued turns",
    },
    {
      command: "/queue run",
      insert: "/queue run",
      scope: "atelier",
      detailKo: "대기 중인 다음 요청 실행",
      detailEn: "Run the next queued turn when idle",
    },
    {
      command: "/preview <url>",
      insert: "/preview ",
      scope: "atelier",
      detailKo: "프리뷰 URL 연결",
      detailEn: "Open a preview URL",
    },
    {
      command: "/cwd <path>",
      insert: "/cwd ",
      scope: "atelier",
      detailKo: "작업 폴더 변경",
      detailEn: "Change the working folder",
    },
    {
      command: "/permission basic|auto|full",
      insert: "/permission ",
      scope: provider,
      detailKo: "CLI 실행 권한 변경",
      detailEn: "Change CLI permission mode",
    },
    {
      command: "/model <model>",
      insert: "/model ",
      scope: provider,
      detailKo: `모델 변경: ${modelValues}`,
      detailEn: `Change model: ${modelValues}`,
    },
  ];

  if (provider === "hermes") {
    return [
      ...common,
      {
        command: "/hermes <command>",
        insert: "/hermes ",
        scope: "hermes",
        detailKo: "Hermes CLI 전용 명령 실행",
        detailEn: "Run a Hermes CLI command",
      },
      {
        command: "/provider anthropic|openai-codex|openrouter",
        insert: "/provider ",
        scope: "hermes",
        detailKo: `Hermes 하위 provider 변경 (현재 ${hermesProvider})`,
        detailEn: `Change Hermes sub-provider (current ${hermesProvider})`,
      },
      {
        command: "/plugins",
        insert: "/plugins",
        scope: "hermes",
        detailKo: "Hermes 플러그인 목록",
        detailEn: "List Hermes plugins",
      },
      {
        command: "/plugin on <name>",
        insert: "/plugin on ",
        scope: "hermes",
        detailKo: "Hermes 플러그인 활성화",
        detailEn: "Enable a Hermes plugin",
      },
      {
        command: "/plugin off <name>",
        insert: "/plugin off ",
        scope: "hermes",
        detailKo: "Hermes 플러그인 비활성화",
        detailEn: "Disable a Hermes plugin",
      },
      {
        command: "/tools",
        insert: "/tools",
        scope: "hermes",
        detailKo: "Hermes 도구 목록",
        detailEn: "List Hermes tools",
      },
      {
        command: "/tool on <name>",
        insert: "/tool on ",
        scope: "hermes",
        detailKo: "Hermes 도구 활성화",
        detailEn: "Enable a Hermes tool",
      },
      {
        command: "/tool off <name>",
        insert: "/tool off ",
        scope: "hermes",
        detailKo: "Hermes 도구 비활성화",
        detailEn: "Disable a Hermes tool",
      },
      {
        command: "/skills",
        insert: "/skills",
        scope: "hermes",
        detailKo: "Hermes 스킬 목록",
        detailEn: "List Hermes skills",
      },
      {
        command: "/mcp",
        insert: "/mcp",
        scope: "hermes",
        detailKo: "Hermes MCP 서버 목록",
        detailEn: "List Hermes MCP servers",
      },
      {
        command: "/logs",
        insert: "/logs",
        scope: "hermes",
        detailKo: "Hermes 로그 요약",
        detailEn: "Show Hermes logs",
      },
      {
        command: "/doctor",
        insert: "/doctor",
        scope: "hermes",
        detailKo: "Hermes 진단",
        detailEn: "Run Hermes doctor",
      },
      {
        command: "/status",
        insert: "/status",
        scope: "hermes",
        detailKo: "Hermes 상태 확인",
        detailEn: "Show Hermes status",
      },
    ];
  }

  if (provider === "codex") {
    return [
      ...common,
      {
        command: "/codex <command>",
        insert: "/codex ",
        scope: "codex",
        detailKo: "Codex CLI 전용 명령 실행",
        detailEn: "Run a Codex CLI command",
      },
      {
        command: "/effort low|medium|high|xhigh",
        insert: "/effort ",
        scope: "codex",
        detailKo: "Codex 추론 강도 변경",
        detailEn: "Change Codex reasoning effort",
      },
      {
        command: "/speed default|fast",
        insert: "/speed ",
        scope: "codex",
        detailKo: "Codex 응답 속도 tier 변경",
        detailEn: "Change Codex speed tier",
      },
      {
        command: "/mcp",
        insert: "/mcp",
        scope: "codex",
        detailKo: "Codex MCP 서버 목록",
        detailEn: "List Codex MCP servers",
      },
      {
        command: "/features",
        insert: "/features",
        scope: "codex",
        detailKo: "Codex feature flag 목록",
        detailEn: "List Codex feature flags",
      },
      {
        command: "/feature on <name>",
        insert: "/feature on ",
        scope: "codex",
        detailKo: "Codex feature flag 활성화",
        detailEn: "Enable a Codex feature flag",
      },
      {
        command: "/feature off <name>",
        insert: "/feature off ",
        scope: "codex",
        detailKo: "Codex feature flag 비활성화",
        detailEn: "Disable a Codex feature flag",
      },
      {
        command: "/login status",
        insert: "/login status",
        scope: "codex",
        detailKo: "Codex 로그인 상태 확인",
        detailEn: "Show Codex login status",
      },
    ];
  }

  return [
    ...common,
    {
      command: "/claude <command>",
      insert: "/claude ",
      scope: "claude",
      detailKo: "Claude Code CLI 전용 명령 실행",
      detailEn: "Run a Claude Code CLI command",
    },
    {
      command: "/plugins",
      insert: "/plugins",
      scope: "claude",
      detailKo: "Claude 플러그인 목록",
      detailEn: "List Claude plugins",
    },
    {
      command: "/plugin on <name>",
      insert: "/plugin on ",
      scope: "claude",
      detailKo: "Claude 플러그인 활성화",
      detailEn: "Enable a Claude plugin",
    },
    {
      command: "/plugin off <name>",
      insert: "/plugin off ",
      scope: "claude",
      detailKo: "Claude 플러그인 비활성화",
      detailEn: "Disable a Claude plugin",
    },
    {
      command: "/mcp",
      insert: "/mcp",
      scope: "claude",
      detailKo: "Claude MCP 서버 목록",
      detailEn: "List Claude MCP servers",
    },
    {
      command: "/doctor",
      insert: "/doctor",
      scope: "claude",
      detailKo: "Claude Code 진단",
      detailEn: "Run Claude Code doctor",
    },
    {
      command: "/auth status",
      insert: "/auth status",
      scope: "claude",
      detailKo: "Claude 인증 상태 확인",
      detailEn: "Show Claude auth status",
    },
  ];
}

function filterSlashCommands(commands: SlashCommandSpec[], input: string, language: Tweaks["language"]) {
  const normalized = input.trim().toLowerCase();
  if (!normalized.startsWith("/")) return [];
  if (normalized === "/") return commands;
  const query = normalized.slice(1);
  return commands.filter((item) => {
    const detail = language === "en" ? item.detailEn : item.detailKo;
    return `${item.command} ${item.scope} ${detail}`.toLowerCase().includes(query);
  });
}

function buildGoalPrompt(goal: string, language: Tweaks["language"]) {
  const objective = goal.trim();
  if (!objective) return "";
  if (language === "en") {
    return [
      "Goal mode is enabled.",
      "",
      `Primary objective: ${objective}`,
      "",
      "Instructions:",
      "- Work autonomously until the objective is actually satisfied or clearly blocked.",
      "- Plan, execute, verify, and keep iterating instead of stopping after analysis.",
      "- Prefer concrete changes, evidence, and checks over suggestions.",
      "- If you hit a real blocker, explain exactly what is blocked and what remains.",
      "- Keep updates concise and momentum-oriented.",
    ].join("\n");
  }
  return [
    "Goal 모드가 활성화되었습니다.",
    "",
    `최우선 목표: ${objective}`,
    "",
    "지침:",
    "- 목표가 실제로 달성되거나 명확한 차단 사유가 생길 때까지 자율적으로 계속 진행합니다.",
    "- 분석에서 멈추지 말고 계획 -> 실행 -> 검증 -> 재시도를 반복합니다.",
    "- 제안보다 실제 변경, 근거, 검증 결과를 우선합니다.",
    "- 실제 차단 요인이 있으면 무엇이 막혔는지와 남은 일을 정확히 설명합니다.",
    "- 진행 상황 공유는 짧고 분명하게 유지합니다.",
  ].join("\n");
}

function normalizeModel(provider: AgentProvider, model?: string | null) {
  const trimmed = model?.trim();
  if (!trimmed) return providerMeta(provider).defaultModel;

  if (provider === "claude") {
    const legacy: Record<string, string> = {
      default: "claude-sonnet-4-6",
      sonnet: "claude-sonnet-4-6",
      opus: "claude-opus-4-7",
      haiku: "claude-haiku-4-5-20251001",
      best: "claude-opus-4-7",
      opusplan: "claude-opus-4-7",
      "sonnet[1m]": "claude-sonnet-4-6",
      "opus[1m]": "claude-opus-4-7",
      "claude-opus-4-1": "claude-opus-4-7",
      "claude-opus-4-1-20250805": "claude-opus-4-7",
      "claude-opus-4-20250514": "claude-opus-4-7",
      "claude-sonnet-4": "claude-sonnet-4-6",
      "claude-sonnet-4-20250514": "claude-sonnet-4-6",
      "claude-haiku-4-5": "claude-haiku-4-5-20251001",
      "claude-3-5-haiku-latest": "claude-haiku-4-5-20251001",
      "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
    };
    return legacy[trimmed] || trimmed;
  }

  if (trimmed === "gpt-5.4-nano") return "gpt-5.4-mini";
  return trimmed;
}

function normalizeHermesModel(hermesProvider: HermesInferenceProvider, model?: string | null) {
  const trimmed = normalizeModel(hermesProvider === "anthropic" ? "claude" : "hermes", model);
  if (!trimmed || trimmed === providerMeta("hermes").defaultModel) return defaultHermesModel(hermesProvider);
  if (hermesProvider === "openrouter") {
    const legacy: Record<string, string> = {
      "gpt-5.5": "openai/gpt-5.5",
      "gpt-5.4": "openai/gpt-5.4",
      "gpt-5.4-mini": "openai/gpt-5.4-mini",
      "gpt-5.3-codex": "openai/gpt-5.3-codex",
      "claude-opus-4-7": "anthropic/claude-opus-4.7",
      "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
      "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
    };
    return legacy[trimmed] || trimmed;
  }
  if (hermesProvider === "openai-codex" && trimmed.startsWith("openai/")) {
    return trimmed.slice("openai/".length);
  }
  return trimmed;
}

const nowId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function persistSessions(sessions: AgentSession[]) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {}
}

function relTime(ts: number) {
  const sec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function loadSessions(): AgentSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((session: Partial<AgentSession>) => {
        const provider = isProvider(session.provider) ? session.provider : DEFAULT_PROVIDER;
        const meta = providerMeta(provider);
        const hermesProvider = provider === "hermes"
          ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
          : undefined;
        return {
          id: session.id || nowId("agent"),
          title: session.title || meta.newTitleKo,
          titleEdited: Boolean(session.titleEdited),
          provider,
          profileId: session.profileId || provider,
          profileName: session.profileName || meta.label,
          profileDot: normalizeAgentDotColor(session.profileDot || meta.dot),
          model: provider === "hermes"
            ? normalizeHermesModel(hermesProvider || DEFAULT_HERMES_PROVIDER, session.model || meta.defaultModel)
            : normalizeModel(provider, session.model || meta.defaultModel),
          hermesProvider,
          stellaOntologyMode: normalizeStellaOntologyMode(session.stellaOntologyMode, provider),
          codexEffort: provider === "codex" ? normalizeCodexEffort(session.codexEffort) : undefined,
          codexSpeed: provider === "codex" ? normalizeCodexSpeed(session.codexSpeed) : undefined,
          permissionMode: normalizePermissionMode(session.permissionMode),
          queueMode: Boolean(session.queueMode),
          cwd: session.cwd || "",
          providerSessionId: session.providerSessionId,
          providerSessionModel: typeof session.providerSessionModel === "string" ? session.providerSessionModel : undefined,
          providerSessionHermesProvider: isHermesProvider(session.providerSessionHermesProvider)
            ? session.providerSessionHermesProvider
            : undefined,
          messages: Array.isArray(session.messages)
            ? finalizeOrphanedStreamingMessages(session.messages)
            : [],
          queuedTurns: Array.isArray(session.queuedTurns)
            ? session.queuedTurns
                .filter((turn): turn is QueuedAgentTurn =>
                  Boolean(
                    turn &&
                    typeof turn.id === "string" &&
                    typeof turn.userMessageId === "string" &&
                    typeof turn.text === "string",
                  ),
                )
                .map((turn) => ({
                  ...turn,
                  attachments: Array.isArray(turn.attachments) ? turn.attachments : [],
                  cwd: typeof turn.cwd === "string" ? turn.cwd : "",
                  createdAt: typeof turn.createdAt === "number" ? turn.createdAt : Date.now(),
                }))
            : [],
          rawEvents: Array.isArray(session.rawEvents) ? session.rawEvents : [],
          previewUrl: typeof session.previewUrl === "string" ? session.previewUrl : undefined,
          previewVisible: typeof session.previewVisible === "boolean" ? session.previewVisible : undefined,
          previewViewport:
            session.previewViewport === "mobile" || session.previewViewport === "tablet" || session.previewViewport === "desktop"
              ? session.previewViewport
              : undefined,
          previewWidth: typeof session.previewWidth === "number" ? clampNumber(session.previewWidth, 320, 760) : undefined,
          previewServiceCommand: typeof session.previewServiceCommand === "string" ? session.previewServiceCommand : undefined,
          updatedAt: session.updatedAt || Date.now(),
        };
      });
    }
  } catch {}
  return [];
}

function clipRawEvent(raw: string) {
  return raw.length > MAX_RAW_EVENT_CHARS
    ? `${raw.slice(0, MAX_RAW_EVENT_CHARS)}\n... truncated ...`
    : raw;
}

function findPreviewUrl(text?: string | null) {
  if (!text) return null;
  const matches = text.match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+/g);
  if (!matches?.length) return null;
  return matches[matches.length - 1].replace(/[.,;:]+$/, "");
}

function cleanStoredPreviewUrl(text?: string | null) {
  if (!text) return "";
  return findPreviewUrl(text) || text.trim();
}

function isLocalPreviewUrl(url?: string | null) {
  return Boolean(url && LOCAL_PREVIEW_RE.test(url.trim()));
}

function parseRawJson(raw?: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function commandFromValue(value: unknown, depth = 0): string | null {
  if (!value || depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = commandFromValue(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["command", "cmd", "shell_command", "script"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().replace(/\s+/g, " ");
    }
  }
  for (const key of ["args", "argv"]) {
    const candidate = record[key];
    if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string")) {
      const joined = candidate.join(" ").trim();
      if (joined) return joined.replace(/\s+/g, " ");
    }
  }
  for (const nested of Object.values(record)) {
    const found = commandFromValue(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function clipActivityText(text: string, max = 120) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function clipBlockText(text: string, max = 12_000) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function stripAnsi(text: string) {
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    "",
  );
}

function splitCliArgs(input: string) {
  const args: string[] = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    args.push(value.replace(/\\"/g, "\""));
  }
  return args;
}

function parseCliTableRows(output: string) {
  const rows: string[][] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(/[┃│]/g, "|");
    if (!line.includes("|") || !/[A-Za-z0-9가-힣_]/.test(line)) continue;
    const parts = line.split("|");
    if (parts.length < 4) continue;
    if (!parts[0].trim()) parts.shift();
    if (parts.length > 0 && !parts[parts.length - 1].trim()) parts.pop();
    const cells = parts.map((part) => part.trim());
    if (cells.some((cell) => /[┏┓┗┛┡┩└┘╇╆╅╄╋┳┻━─]/.test(cell))) continue;
    rows.push(cells);
  }
  return rows;
}

function markdownTableCell(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|");
}

function summarizeHermesPluginsOutput(output: string, language: Tweaks["language"]) {
  const rows = parseCliTableRows(output);
  const plugins: Array<{ name: string; status: string; version: string; description: string; source: string }> = [];
  for (const cells of rows) {
    const [name = "", status = "", version = "", description = "", source = ""] = cells;
    if (!name || name.toLowerCase() === "name") continue;
    if (status && version && source) {
      plugins.push({ name, status, version, description, source });
    } else if (plugins.length > 0 && description) {
      const last = plugins[plugins.length - 1];
      last.description = `${last.description} ${description}`.replace(/\s+/g, " ").trim();
    }
  }
  if (plugins.length === 0) return null;

  const lines = [
    language === "en" ? "Hermes plugins:" : "Hermes 플러그인:",
    "",
    language === "en"
      ? "| Name | Status | Version | Source | Description |"
      : "| 이름 | 상태 | 버전 | 출처 | 설명 |",
    "|---|---|---:|---|---|",
    ...plugins.map((plugin) => {
      const desc = clipActivityText(plugin.description, 120);
      return [
        markdownTableCell(plugin.name),
        markdownTableCell(plugin.status),
        markdownTableCell(plugin.version),
        markdownTableCell(plugin.source),
        markdownTableCell(desc),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
    }),
    "",
    language === "en"
      ? "Toggle: /plugin on <name> or /plugin off <name>"
      : "전환: /plugin on <name> 또는 /plugin off <name>",
  ];
  return lines.join("\n");
}

function structuredCliOutput(provider: AgentProvider, args: string[], output: string, language: Tweaks["language"]) {
  const lower = args.map((arg) => arg.toLowerCase());
  if (provider === "hermes" && lower[0] === "plugins" && (!lower[1] || lower[1] === "list" || lower[1] === "ls")) {
    return summarizeHermesPluginsOutput(output, language);
  }
  return null;
}

function cleanAgentText(text?: string | null) {
  if (!text) return "";
  const normalized = stripAnsi(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("session_id:"))
    .join("\n")
    .trim();
  return collapseDumpyText(normalized).trim();
}

function cleanAgentDelta(text?: string | null) {
  if (!text) return "";
  return collapseDumpyText(stripAnsi(text).replace(/\r\n?/g, "\n"));
}

function terminalIssueFromEvent(event: AgentStreamEvent) {
  const rawJson = parseRawJson(event.raw);
  const parts = [event.text, event.status].filter(Boolean) as string[];
  if (!rawJson && event.raw) parts.push(event.raw);
  const text = cleanAgentText(parts.join("\n"));
  if (!text) return null;
  if (event.kind === "error" || event.is_error || TERMINAL_ISSUE_RE.test(text)) {
    return clipActivityText(text, 180);
  }
  return null;
}

function isPreviewStartCommand(text: string) {
  return /\b(npm\s+run\s+(dev|start|preview)|pnpm\s+(dev|start|preview)|yarn\s+(dev|start|preview)|bun\s+(run\s+)?(dev|start|preview)|vite\b|next\s+dev|python3?\s+-m\s+http\.server|ollama\s+serve)\b/i
    .test(text);
}

function normalizePreviewStartCommand(text?: string | null) {
  if (!text) return "";
  let clean = stripAnsi(text).replace(/\s+/g, " ").trim();
  clean = clean.replace(/^(?:도구 사용 중|using tool|실행 중|running)\b[:：|]?\s*/i, "").trim();
  clean = clean.replace(/^┊\s*/u, "").trim();
  clean = clean.replace(/^["'`]*\s*/, "").trim();
  clean = clean.replace(/^[📚🐍💻📖🔎📋🧠🔧⚙▶]\s*/u, "").trim();
  clean = clean.replace(/^[$|>]\s*/, "").trim();
  clean = clean.replace(/^[📚🐍💻📖🔎📋🧠🔧⚙▶]\s*/u, "").trim();
  clean = clean.replace(/^\$\s*/, "").trim();
  clean = clean.replace(/\s+\d+(?:\.\d+)?s(?:\s+\[error\])?$/i, "").trim();
  return isPreviewStartCommand(clean) ? clean : "";
}

function cleanStoredPreviewServiceCommand(text?: string | null) {
  if (!text) return "";
  const normalized = normalizePreviewStartCommand(text);
  if (isAgentActivityLine(text) || isAgentCommandDumpLine(text)) return normalized;
  return text.trim();
}

function formatPreviewPromptContext(
  language: "ko" | "en",
  previewUrl: string,
  previewCheck: PreviewCheckResult | null,
  diagnostics: PreviewDiagnostic[],
  service: PreviewServiceStatus | null,
) {
  if (!previewUrl) return "";
  const lines: string[] = [];
  const label = language === "en"
    ? {
        url: "URL",
        status: "Health",
        error: "Error",
        title: "Title",
        body: "Visible server text",
        service: "Managed service",
        command: "Start command",
        log: "Recent service log",
        diagnostic: "Recent diagnostic",
      }
    : {
        url: "URL",
        status: "검토 상태",
        error: "에러",
        title: "제목",
        body: "화면/서버 본문",
        service: "관리 서비스",
        command: "시동 명령",
        log: "최근 서비스 로그",
        diagnostic: "최근 진단",
      };

  lines.push(`${label.url}: ${previewUrl}`);
  if (previewCheck) {
    lines.push(`${label.status}: ${previewCheck.ok ? "ok" : "error"}${previewCheck.status ? ` HTTP ${previewCheck.status}` : ""}`);
    if (previewCheck.error) lines.push(`${label.error}: ${clipActivityText(previewCheck.error, 360)}`);
    if (previewCheck.title) lines.push(`${label.title}: ${clipActivityText(previewCheck.title, 220)}`);
    if (previewCheck.body_text) lines.push(`${label.body}: ${clipActivityText(previewCheck.body_text, 700)}`);
  }
  if (service?.managed) {
    lines.push(`${label.service}: ${service.running ? "running" : "stopped"}${service.pid ? ` PID ${service.pid}` : ""}`);
    if (service.command) lines.push(`${label.command}: ${clipActivityText(service.command, 260)}`);
    service.recent_output.slice(-3).forEach((line) => {
      lines.push(`${label.log}: ${clipActivityText(line, 300)}`);
    });
  }
  diagnostics.slice(-3).forEach((diagnostic) => {
    lines.push(`${label.diagnostic}: ${clipActivityText(diagnostic.text, 360)}`);
  });
  return lines.join("\n");
}

function formatDevScreenPromptContext(
  language: "ko" | "en",
  status: DevScreenStatusResult | null,
  snapshot: DevScreenSnapshotResult | null,
  check: DevScreenCheckResult | null,
  lastAction: DevScreenActionResult | null,
  error: string | null,
) {
  const latestStatus = check?.status || status;
  const latestSnapshot = check?.snapshot || snapshot;
  if (!latestStatus && !latestSnapshot && !lastAction && !error) return "";
  const label = language === "en"
    ? {
        section: "Atelier Tauri dev screen:",
        bridge: "Bridge",
        window: "Window",
        snapshot: "DOM snapshot",
        action: "Last screen action",
        error: "Screen error",
      }
    : {
        section: "Atelier Tauri 개발 화면:",
        bridge: "Bridge",
        window: "창",
        snapshot: "DOM 스냅샷",
        action: "최근 화면 액션",
        error: "화면 에러",
      };
  const lines = [label.section];
  if (latestStatus) {
    lines.push(`${label.bridge}: ${latestStatus.host}:${latestStatus.port}`);
    lines.push(`${label.window}: ${latestStatus.windowLabel}`);
  }
  if (latestSnapshot?.text) {
    lines.push(`${label.snapshot}:\n${clipActivityText(latestSnapshot.text, 1400)}`);
  }
  if (lastAction) {
    lines.push(`${label.action}: ${clipActivityText(JSON.stringify(lastAction.data), 520)}`);
  }
  if (error) {
    lines.push(`${label.error}: ${clipActivityText(error, 520)}`);
  }
  return lines.join("\n");
}

function attachmentFileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || "pasted-image.png";
}

async function imageBlobToPngBytes(blob: Blob): Promise<Uint8Array> {
  if (blob.type === "image/png") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is unavailable");
    ctx.drawImage(bitmap, 0, 0);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((converted) => {
        if (converted) resolve(converted);
        else reject(new Error("Could not convert image to PNG"));
      }, "image/png");
    });
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

function formatAttachmentPrompt(attachments: ChatAttachment[], language: "ko" | "en") {
  if (attachments.length === 0) return "";
  const lines = attachments.map((attachment, index) =>
    language === "en"
      ? `Image ${index + 1}: ${attachment.path}`
      : `이미지 ${index + 1}: ${attachment.path}`,
  );
  return language === "en"
    ? ["", "", "---", "Attached images saved by Atelier:", ...lines, "Open these local image files directly when the request refers to the pasted image."].join("\n")
    : ["", "", "---", "Atelier가 저장한 첨부 이미지:", ...lines, "붙여넣은 이미지를 언급한 요청이면 위 로컬 이미지 파일을 직접 열어서 확인하세요."].join("\n");
}

function formatCompactAgentContext(
  messages: ChatMessage[],
  language: "ko" | "en",
  currentUserMessageId?: string | null,
) {
  const candidates = messages
    .filter((message) =>
      message.id !== currentUserMessageId
      && message.status !== "queued"
      && message.status !== "streaming"
      && cleanAgentText(message.text).trim().length > 0,
    )
    .slice(-MAX_COMPACT_AGENT_CONTEXT_MESSAGES)
    .map((message) => {
      const label = message.role === "user"
        ? language === "en" ? "User" : "사용자"
        : language === "en" ? "Assistant" : "에이전트";
      return `${label}: ${clipActivityText(cleanAgentText(message.text), 1600)}`;
    });

  const out: string[] = [];
  let used = 0;
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const line = candidates[i];
    const nextUsed = used + line.length + 1;
    if (out.length > 0 && nextUsed > MAX_COMPACT_AGENT_CONTEXT_CHARS) break;
    out.unshift(line);
    used = nextUsed;
  }
  if (out.length === 0) return "";
  return language === "en"
    ? [
        "Atelier bounded continuity context:",
        "The provider session was not resumed because the Hermes/Codex backend becomes very slow with large non-streaming histories. Use only this compact context plus the current request.",
        ...out,
      ].join("\n")
    : [
        "Atelier 제한 컨텍스트:",
        "Hermes/Codex 백엔드는 긴 비스트리밍 세션 이력에서 급격히 느려지므로 provider 세션 resume 대신 아래 짧은 최근 맥락만 사용합니다.",
        ...out,
      ].join("\n");
}

function formatFastPatchPrompt(text: string, language: "ko" | "en") {
  if (!isFastPatchTask(text)) return "";
  return language === "en"
    ? [
        "",
        "",
        "---",
        "Atelier fast patch mode:",
        "- This looks like a small wording, localization, label, typo, or visual-token edit. Prioritize a narrow edit over broad investigation.",
        "- Find the exact target with 1-3 focused `rg` searches, patch only the matching files, and avoid repo-wide audits or architecture analysis.",
        "- Do not run a full production build, browser screenshot pass, or long QA loop unless the user explicitly asked or the quick patch clearly fails.",
        "- For dashboard English-to-Korean requests, translate the visible UI labels in place first. Do not change strategy logic, DB files, generated data, or unrelated copy.",
        "- Final answer should be brief: changed files and whether a quick check ran.",
      ].join("\n")
    : [
        "",
        "",
        "---",
        "Atelier 빠른 패치 모드:",
        "- 이 요청은 문구, 한글화, 라벨, 오타, 색상 토큰 같은 작은 수정으로 보입니다. 넓은 조사보다 좁은 패치를 우선하세요.",
        "- 대상은 `rg` 1-3번으로 바로 찾고, 맞는 파일만 수정하세요. 전체 저장소 감사나 구조 분석으로 확장하지 마세요.",
        "- 사용자가 명시하지 않았거나 빠른 패치가 실패한 경우가 아니면 전체 production build, 브라우저 스크린샷 검사, 긴 QA 루프를 실행하지 마세요.",
        "- 대시보드 영어→한글 요청은 보이는 UI 라벨을 먼저 제자리에서 번역하세요. 전략 로직, DB 파일, 생성 데이터, 무관한 문구는 건드리지 마세요.",
        "- 최종 답변은 짧게: 변경 파일과 빠른 확인 여부만 말하세요.",
      ].join("\n");
}

function formatAgentPrompt(
  text: string,
  language: "ko" | "en",
  previewContext?: string | null,
  attachments: ChatAttachment[] = [],
) {
  const context = previewContext
    ? language === "en"
      ? ["", "", "---", "Atelier preview diagnostics:", previewContext].join("\n")
      : ["", "", "---", "Atelier 프리뷰 진단:", previewContext].join("\n")
    : "";
  const attachmentContext = formatAttachmentPrompt(attachments, language);
  const fastPatchContext = formatFastPatchPrompt(text, language);
  const instruction = language === "en"
    ? [
        "",
        "",
        "---",
        "Atelier display guidance:",
        "- Output ONLY the final result in natural language. No procedural narration, no thought process, no tool logs.",
        "- NEVER print raw diffs, unified diff hunks (@@ -X,Y +X,Y @@), file path headers (a/path → b/path), or line-by-line added/removed code in the answer. Summarize code changes in one sentence (e.g. \"PositionCard.tsx: removed Trash2 import, switched to getApiToken\").",
        "- Do not print terminal commands, $-prefixed lines, JSON events, MCP routing, or raw tool stdout. Summarize tool work as a count or outcome only.",
        "- Long code blocks must be replaced by a one-line outcome summary unless the user explicitly asked to see the code.",
        "- Use GitHub-flavored Markdown sparingly. Tables only when truly useful. Short answers > long answers.",
      ].join("\n")
    : [
        "",
        "",
        "---",
        "Atelier 표시 지침:",
        "- 최종 결과만 자연어로 답변. 절차 narration, 사고 과정, 도구 로그 출력 금지.",
        "- diff/hunk(@@ -X,Y +X,Y @@), 파일 경로 헤더(a//path → b//path), 한 줄 한 줄 추가/삭제된 코드 절대 출력 금지. 코드 변경은 한 문장으로 요약 (예: \"PositionCard.tsx: Trash2 import 제거 + getApiToken 통합\").",
        "- 터미널 명령, $ 시작 라인, JSON 이벤트, MCP 라우팅, 원본 도구 stdout 그대로 출력 금지. 도구 작업은 건수나 결과만 요약.",
        "- 긴 코드 블록은 한 줄 결과 요약으로 대체하세요. 사용자가 명시적으로 코드 보여달라고 한 경우만 예외.",
        "- GitHub-flavored Markdown은 절제해서 사용. 표는 정말 필요할 때만. 짧은 답변 > 긴 답변.",
      ].join("\n");
  return `${text}${attachmentContext}${context}${fastPatchContext}${instruction}`;
}

function formatOntologyAgentPrompt(
  text: string,
  language: "ko" | "en",
  previewContext: string | null,
  attachments: ChatAttachment[],
  mode: StellaOntologyMode,
  provider: AgentProvider,
  cwd?: string | null,
) {
  const base = formatAgentPrompt(text, language, previewContext, attachments);
  const ontology = formatStellaOntologyInstruction({
    mode,
    language,
    providerLabel: providerMeta(provider).label,
    cwd,
  });
  if (!ontology) return base;
  const requestLabel = language === "en" ? "User request:" : "대표님 요청:";
  return `${ontology}\n\n---\n${requestLabel}\n${base}`;
}

function revealCharsPerSecond(remaining: number) {
  if (remaining > 9000) return 150;
  if (remaining > 4200) return 132;
  if (remaining > 1600) return 112;
  if (remaining > 520) return 104;
  return 60;
}

function revealFrameCap(remaining: number) {
  if (remaining > 520) return 2;
  return 1;
}

function revealPauseMs(target: string, nextLength: number, remainingAfter: number) {
  const ch = target[nextLength - 1];
  if (!ch) return 0;
  const longAnswerScale = remainingAfter > 4200 ? 0.45 : remainingAfter > 1200 ? 0.7 : 1;
  if (ch === "\n") return Math.round((target[nextLength] === "\n" ? 140 : 70) * longAnswerScale);
  if (/[.!?。！？]/.test(ch)) return Math.round(130 * longAnswerScale);
  if (/[,;:，、]/.test(ch)) return Math.round(55 * longAnswerScale);
  return 0;
}

function avoidHalfSurrogate(target: string, nextLength: number) {
  if (nextLength <= 0 || nextLength >= target.length) return nextLength;
  const prev = target.charCodeAt(nextLength - 1);
  const next = target.charCodeAt(nextLength);
  if (prev >= 0xd800 && prev <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
    return nextLength + 1;
  }
  return nextLength;
}

function revealNextLength(
  target: string,
  currentLength: number,
  elapsedMs: number,
  now: number,
  state: SmoothRevealState,
) {
  const remaining = target.length - currentLength;
  if (remaining <= 0) return currentLength;
  if (now < state.pauseUntil) return currentLength;

  state.carry += (revealCharsPerSecond(remaining) * elapsedMs) / 1000;
  let step = Math.floor(state.carry);
  if (step < 1) return currentLength;

  const cappedStep = Math.min(step, revealFrameCap(remaining), remaining);
  state.carry -= cappedStep;
  let nextLength = avoidHalfSurrogate(target, currentLength + cappedStep);

  if (nextLength < target.length && /\s/.test(target[nextLength]) && cappedStep < revealFrameCap(remaining)) {
    nextLength += 1;
  }

  const pause = revealPauseMs(target, nextLength, target.length - nextLength);
  if (pause > 0) {
    state.pauseUntil = now + pause;
    state.carry = Math.min(state.carry, 0.25);
  }

  return nextLength;
}

const AgentWorkspace: React.FC<{ tw: Tweaks }> = ({ tw }) => {
  const dark = tw.dark;
  const [sessions, setSessions] = useState<AgentSession[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY));
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [isPastingImage, setIsPastingImage] = useState(false);
  const [cwd, setCwd] = useState(() => localStorage.getItem(CWD_KEY) || "");
  const [showTaskList, setShowTaskList] = useState(() => localStorage.getItem(TASK_LIST_VISIBLE_KEY) !== "0");
  const [showPreview, setShowPreview] = useState(
    () => localStorage.getItem(PREVIEW_VISIBLE_KEY) === "1" || localStorage.getItem(DEV_SCREEN_VISIBLE_KEY) === "1",
  );
  const [previewUrl, setPreviewUrl] = useState(() => cleanStoredPreviewUrl(localStorage.getItem(PREVIEW_KEY) || ""));
  const [previewInput, setPreviewInput] = useState(() => cleanStoredPreviewUrl(localStorage.getItem(PREVIEW_KEY) || ""));
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [previewCheck, setPreviewCheck] = useState<PreviewCheckResult | null>(null);
  const [previewChecking, setPreviewChecking] = useState(false);
  const [previewDiagnostics, setPreviewDiagnostics] = useState<PreviewDiagnostic[]>([]);
  const [previewService, setPreviewService] = useState<PreviewServiceStatus | null>(null);
  const [previewServiceCommand, setPreviewServiceCommand] = useState(() =>
    cleanStoredPreviewServiceCommand(localStorage.getItem(PREVIEW_SERVICE_COMMAND_KEY) || ""),
  );
  const [previewServiceBusy, setPreviewServiceBusy] = useState(false);
  const [showDevScreen, setShowDevScreen] = useState(() => localStorage.getItem(DEV_SCREEN_VISIBLE_KEY) === "1");
  const [devScreenHost, setDevScreenHost] = useState(() => localStorage.getItem(DEV_SCREEN_HOST_KEY) || "127.0.0.1");
  const [devScreenPort, setDevScreenPort] = useState(() => localStorage.getItem(DEV_SCREEN_PORT_KEY) || "");
  const [devScreenWindow, setDevScreenWindow] = useState(() => localStorage.getItem(DEV_SCREEN_WINDOW_KEY) || "main");
  const [devScreenBusy, setDevScreenBusy] = useState(false);
  const [devScreenStatusResult, setDevScreenStatusResult] = useState<DevScreenStatusResult | null>(null);
  const [devScreenScreenshotResult, setDevScreenScreenshotResult] = useState<DevScreenScreenshotResult | null>(null);
  const [devScreenSnapshotResult, setDevScreenSnapshotResult] = useState<DevScreenSnapshotResult | null>(null);
  const [devScreenCheckResult, setDevScreenCheckResult] = useState<DevScreenCheckResult | null>(null);
  const [devScreenActionResult, setDevScreenActionResult] = useState<DevScreenActionResult | null>(null);
  const [devScreenError, setDevScreenError] = useState<string | null>(null);
  const [devScreenJsCode, setDevScreenJsCode] = useState("document.title");
  const [devScreenSelector, setDevScreenSelector] = useState("button");
  const [devScreenText, setDevScreenText] = useState("");
  const [devScreenKeyName, setDevScreenKeyName] = useState("Enter");
  const [devScreenResizeWidth, setDevScreenResizeWidth] = useState("1440");
  const [devScreenResizeHeight, setDevScreenResizeHeight] = useState("980");
  const [previewWidth, setPreviewWidth] = useState(() =>
    clampNumber(Number(localStorage.getItem(PREVIEW_WIDTH_KEY)) || 430, 320, 760),
  );
  const [resizingPreview, setResizingPreview] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showPermissionMenu, setShowPermissionMenu] = useState(false);
  const [codexMenuPanel, setCodexMenuPanel] = useState<CodexMenuPanel>("root");
  const [previewVP, setPreviewVP] = useState<PreviewViewport>(() => {
    const saved = localStorage.getItem(PREVIEW_VP_KEY);
    return saved === "mobile" || saved === "tablet" || saved === "desktop" ? saved : "desktop";
  });
  const sessionsRef = useRef<AgentSession[]>(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  // 세션별 busy turn 추적 — 한 세션에서 진행 중이어도 다른 세션은 입력 가능.
  const [busyTurnIdsBySession, setBusyTurnIdsBySession] = useState<Record<string, string>>({});
  const busyTurnIdsRef = useRef<Record<string, string>>({});
  const setBusyForSession = (sessionId: string, turnId: string | null) => {
    setBusyTurnIdsBySession((prev) => {
      if (turnId === null) {
        if (!(sessionId in prev)) return prev;
        const next = { ...prev };
        delete next[sessionId];
        busyTurnIdsRef.current = next;
        return next;
      }
      const next = { ...prev, [sessionId]: turnId };
      busyTurnIdsRef.current = next;
      return next;
    });
  };
  const anyBusy = Object.keys(busyTurnIdsBySession).length > 0;
  // active 세션의 turnId (있으면 입력 가드 적용, 없으면 다른 세션이 바빠도 입력 가능)
  // 아래에서 active를 사용하지만 여기선 미선언이라 effect에서 사용 시 별도로 참조.
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!anyBusy) return;
    const handle = window.setInterval(() => setNowTickMs(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [anyBusy]);
  const [visibleTextById, setVisibleTextById] = useState<Record<string, string>>({});
  const [reviewOpenById, setReviewOpenById] = useState<Record<string, boolean>>({});
  const [expandedDiffByKey, setExpandedDiffByKey] = useState<Record<string, boolean>>({});
  const [logsOpenById, setLogsOpenById] = useState<Record<string, boolean>>({});
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [showPluginList, setShowPluginList] = useState(true);
  const [pluginInstallState, setPluginInstallState] = useState<Partial<Record<WorkspacePluginId, WorkspacePluginInstallState>>>({});
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [slashSelection, setSlashSelection] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const permissionMenuRef = useRef<HTMLDivElement | null>(null);
  const skipRenameCommitRef = useRef(false);
  const previewHydratingSessionRef = useRef<string | null>(null);
  const pendingStreamRef = useRef<Record<string, PendingAgentStream>>({});
  const interruptedTurnIdsRef = useRef<Set<string>>(new Set());
  const animatedAssistantIdsRef = useRef<Set<string>>(new Set());
  const backgroundedAssistantIdsRef = useRef<Set<string>>(new Set());
  const smoothTargetsRef = useRef<Record<string, string>>({});
  const smoothRevealStateRef = useRef<Record<string, SmoothRevealState>>({});
  const smoothFrameRef = useRef<number | null>(null);
  const smoothLastTickRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const inputRevealPauseUntilRef = useRef(0);
  const persistSessionsTimerRef = useRef<number | null>(null);
  const autoScrollRef = useRef(true);
  const activeIdRef = useRef<string | null>(activeId);
  const previewResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const previewAutoStartRef = useRef<Record<string, number>>({});
  const lastPreviewCommandRef = useRef<string | null>(null);

  const persistSessionsNow = (next: AgentSession[] = sessionsRef.current) => {
    if (persistSessionsTimerRef.current !== null) {
      window.clearTimeout(persistSessionsTimerRef.current);
      persistSessionsTimerRef.current = null;
    }
    persistSessions(next);
  };

  const persistSessionsSoon = (next: AgentSession[] = sessionsRef.current) => {
    if (persistSessionsTimerRef.current !== null) window.clearTimeout(persistSessionsTimerRef.current);
    persistSessionsTimerRef.current = window.setTimeout(() => {
      persistSessionsTimerRef.current = null;
      persistSessions(next);
    }, SESSION_PERSIST_DEBOUNCE_MS);
  };

  const copy = tw.language === "en"
    ? {
        title: "Workspace",
        subtitle: "Claude, Hermes, and Codex run behind a structured desktop workspace.",
        newSession: "New",
        preview: "Preview",
        previewUrl: "Preview URL",
        open: "Open",
        noPreview: "Paste a localhost URL or let an agent output one.",
        previewLinked: "Linked",
        previewChecking: "Checking",
        previewOk: "No issues",
        previewIssue: "Issue",
        previewOnlyLocal: "Only localhost previews can be inspected.",
        terminalIssue: "Terminal issue",
        previewService: "Service",
        previewServiceManaged: "Managed by Atelier",
        previewServiceExternal: "External process",
        previewServiceIdle: "Not managed",
        previewServiceCommand: "Start command",
        previewServicePlaceholder: "Auto-detect from package.json or enter a command",
        previewServiceStart: "Start",
        previewServiceStop: "Stop",
        previewServiceStarting: "Starting",
        previewServiceStarted: (pid?: number | null) => `Preview service started${pid ? ` · PID ${pid}` : ""}`,
        previewServiceStopped: "Preview service stopped",
        previewServiceStartFailed: (message: string) => `Preview service failed: ${message}`,
        previewServiceRestarting: "Preview service restarted by Atelier",
        previewStatusOk: (status?: number | null, title?: string | null) =>
          `Preview responded${status ? ` HTTP ${status}` : ""}${title ? ` · ${title}` : ""}`,
        previewStatusError: (message: string) => `Preview check failed: ${message}`,
        devScreen: "Inspect",
        devScreenBridge: "Bridge",
        devScreenHost: "Host",
        devScreenPort: "Port",
        devScreenWindow: "Window",
        devScreenReady: "Ready",
        devScreenIdle: "Idle",
        devScreenBusy: "Checking",
        devScreenError: "No bridge",
        devScreenStatus: "Status",
        devScreenCheck: "Check",
        devScreenShot: "Shot",
        devScreenDom: "DOM",
        devScreenJs: "JS",
        devScreenClick: "Click",
        devScreenType: "Type",
        devScreenKey: "Key",
        devScreenResize: "Resize",
        devScreenSelector: "Selector",
        devScreenText: "Text",
        devScreenCode: "Code",
        devScreenSize: "Size",
        devScreenResult: "Result",
        devScreenSnapshot: "Snapshot",
        devScreenNoShot: "No screenshot",
        devScreenActionOk: "Screen action complete",
        devScreenActionFailed: (message: string) => `Screen action failed: ${message}`,
        cwd: "Working folder",
        noAgentProfiles: "No Claude/Hermes/Codex profiles in Settings.",
        plugins: "Plugins",
        pluginsHint: "Plugins are not installed automatically. Choose only what this workspace needs.",
        pluginInstall: "Install",
        pluginInstalling: "Installing",
        pluginInstalled: "Installed",
        pluginFailed: "Failed",
        placeholder: "Ask the selected agent to change, inspect, or explain this workspace...",
        send: "Send",
        stopHint: "A running turn finishes through the selected CLI; terminal fallback remains available.",
        draftHint: "You can keep typing the next message while this turn runs.",
        noMessages: "Start a structured agent session. Messages and raw events are saved locally.",
        events: "Events",
        emptyEvents: "No stream events yet.",
        renameHint: "Double-click to rename",
        providerLabel: "Provider",
        modelLabel: "Model",
        permissionLabel: "Permission",
        ontologyLabel: "Mode",
        intelligence: "Intelligence",
        speed: "Speed",
        model: "Agent workspace",
        running: "running",
        done: "done",
        thinking: "thinking",
        noResponse: NO_AGENT_RESPONSE_EN,
        queued: "queued",
        queuedSend: "Queue",
        interruptSend: "Switch task",
        queueAdded: "Queued. It will run after the current turn.",
        queueModeOn: "Queue mode is on. New messages during a run will be queued.",
        queueModeOff: "Queue mode is off. New messages during a run will switch the active turn.",
        interrupting: "Switching to the new request.",
        interruptedResponse: "Previous run was switched to your new request.",
        queueEmpty: "Queue is empty.",
        queueCleared: "Queue cleared.",
        queueRunStarted: "Queued turn started.",
        stellaModeOn: "Stella/Atelier ontology mode is on.",
        modeChanged: (mode: string) => `Atelier ontology mode: ${mode}`,
        modeUsage: "Usage: /mode direct|stella|evidence",
        slashUnknown: (command: string) => `Unknown slash command: ${command}`,
        slashHelp: [
          "Slash commands:",
          "/goal <objective> - run until the objective is satisfied or clearly blocked",
          "/stella - turn on Stella/Atelier ontology mode",
          "/mode direct|stella|evidence - change Atelier ontology mode",
          "/que - toggle queue mode",
          "/queue - show queued turns",
          "/queue clear - clear queued turns",
          "/queue run - run next queued turn when idle",
          "/que <message> - queue this message without interrupting the current run",
          "/preview <url> - open preview URL",
          "/cwd <path> - change working folder",
          "/model <model> - change the current CLI model",
          "/permission basic|auto|full - change CLI permission mode",
          "/provider anthropic|openai-codex|openrouter - change Hermes provider",
          "/effort low|medium|high|xhigh - change Codex reasoning effort",
          "/speed default|fast - change Codex speed tier",
        ].join("\n"),
        attachedImage: "Image attached",
        removeAttachment: "Remove attachment",
        imagePasting: "Saving pasted image...",
        imagePasteFailed: (message: string) => `Image paste failed: ${message}`,
        imageOnlyPrompt: "Please inspect the attached image.",
        preparing: "preparing",
        runningPrefix: "running",
        usingTool: "using tool",
        changedFiles: (count: number) => `${count} files changed this run`,
        reviewReady: "Review changes when needed",
        reviewChanges: "Review changes",
        reviewingChanges: "Checking changes",
        noChanges: "No file changes in this run.",
        logs: "Logs",
        showLogs: "Show logs",
        hideLogs: "Hide logs",
        undo: "Undo",
        review: "Review",
        expandAll: "Expand",
        collapseAll: "Collapse",
        hideTaskList: "Hide task list",
        showTaskList: "Show task list",
        noDiff: "No text diff available.",
        undoDone: "Undo applied.",
        undoFailed: (message: string) => `Undo failed: ${message}`,
      }
    : {
        title: "작업",
        subtitle: "터미널 화면 대신 Claude, Hermes, Codex를 구조화된 작업 UI로 보여줍니다.",
        newSession: "새 작업",
        preview: "프리뷰",
        previewUrl: "프리뷰 URL",
        open: "열기",
        noPreview: "localhost URL을 붙여넣거나 에이전트가 출력하면 자동으로 열립니다.",
        previewLinked: "연결됨",
        previewChecking: "검토 중",
        previewOk: "문제 없음",
        previewIssue: "문제 있음",
        previewOnlyLocal: "localhost 프리뷰만 자동 검토할 수 있습니다.",
        terminalIssue: "터미널 문제",
        previewService: "서비스",
        previewServiceManaged: "Atelier 관리 중",
        previewServiceExternal: "외부 프로세스",
        previewServiceIdle: "관리 안 됨",
        previewServiceCommand: "시동 명령",
        previewServicePlaceholder: "package.json에서 자동 감지하거나 명령 입력",
        previewServiceStart: "시동",
        previewServiceStop: "정지",
        previewServiceStarting: "시동 중",
        previewServiceStarted: (pid?: number | null) => `프리뷰 서비스 시동됨${pid ? ` · PID ${pid}` : ""}`,
        previewServiceStopped: "프리뷰 서비스 정지됨",
        previewServiceStartFailed: (message: string) => `프리뷰 서비스 실패: ${message}`,
        previewServiceRestarting: "Atelier가 프리뷰 서비스를 다시 시동했습니다",
        previewStatusOk: (status?: number | null, title?: string | null) =>
          `프리뷰 응답 확인${status ? ` HTTP ${status}` : ""}${title ? ` · ${title}` : ""}`,
        previewStatusError: (message: string) => `프리뷰 검토 실패: ${message}`,
        devScreen: "검사",
        devScreenBridge: "Bridge",
        devScreenHost: "호스트",
        devScreenPort: "포트",
        devScreenWindow: "창",
        devScreenReady: "준비됨",
        devScreenIdle: "대기",
        devScreenBusy: "검사 중",
        devScreenError: "연결 없음",
        devScreenStatus: "상태",
        devScreenCheck: "검사",
        devScreenShot: "캡처",
        devScreenDom: "DOM",
        devScreenJs: "JS",
        devScreenClick: "클릭",
        devScreenType: "입력",
        devScreenKey: "키",
        devScreenResize: "크기",
        devScreenSelector: "선택자",
        devScreenText: "텍스트",
        devScreenCode: "코드",
        devScreenSize: "크기",
        devScreenResult: "결과",
        devScreenSnapshot: "스냅샷",
        devScreenNoShot: "캡처 없음",
        devScreenActionOk: "화면 작업 완료",
        devScreenActionFailed: (message: string) => `화면 작업 실패: ${message}`,
        cwd: "작업 폴더",
        noAgentProfiles: "설정 프로필에 Claude/Hermes/Codex가 없습니다.",
        plugins: "플러그인",
        pluginsHint: "플러그인은 자동 설치하지 않습니다. 필요한 항목만 직접 설치하세요.",
        pluginInstall: "설치",
        pluginInstalling: "설치 중",
        pluginInstalled: "설치됨",
        pluginFailed: "실패",
        placeholder: "선택한 에이전트에게 이 작업공간의 수정, 분석, 설명을 요청하세요...",
        send: "보내기",
        stopHint: "실행 중인 턴은 선택한 CLI가 끝낼 때 완료됩니다. 터미널은 보조 화면으로 남겨둡니다.",
        draftHint: "실행 중에도 다음 메시지를 계속 입력할 수 있습니다.",
        noMessages: "구조화된 에이전트 세션을 시작하세요. 메시지와 원본 이벤트가 로컬에 저장됩니다.",
        events: "이벤트",
        emptyEvents: "아직 스트림 이벤트가 없습니다.",
        renameHint: "더블클릭해 이름 변경",
        providerLabel: "제공자",
        modelLabel: "모델",
        permissionLabel: "권한",
        ontologyLabel: "모드",
        intelligence: "인텔리전스",
        speed: "속도",
        model: "에이전트 작업",
        running: "실행 중",
        done: "완료",
        thinking: "생각 중",
        noResponse: NO_AGENT_RESPONSE_KO,
        queued: "대기 중",
        queuedSend: "대기열 추가",
        interruptSend: "전환 실행",
        queueAdded: "대기열에 추가했습니다. 현재 작업이 끝나면 이어서 실행됩니다.",
        queueModeOn: "대기열 모드가 켜졌습니다. 실행 중 새 메시지는 대기열에 쌓입니다.",
        queueModeOff: "대기열 모드가 꺼졌습니다. 실행 중 새 메시지는 현재 실행을 새 요청으로 전환합니다.",
        interrupting: "새 요청으로 전환합니다.",
        interruptedResponse: "이전 실행을 새 요청으로 전환했습니다.",
        queueEmpty: "대기열이 비어 있습니다.",
        queueCleared: "대기열을 비웠습니다.",
        queueRunStarted: "대기 중인 명령을 실행했습니다.",
        stellaModeOn: "Stella/Atelier 온톨로지 모드가 켜졌습니다.",
        modeChanged: (mode: string) => `Atelier 온톨로지 모드: ${mode}`,
        modeUsage: "사용법: /mode direct|stella|evidence",
        slashUnknown: (command: string) => `알 수 없는 슬래시 명령어입니다: ${command}`,
        slashHelp: [
          "슬래시 명령어:",
          "/goal <objective> - 목표 달성 또는 명확한 차단까지 반복 진행",
          "/stella - Stella/Atelier 온톨로지 모드 켜기",
          "/mode direct|stella|evidence - Atelier 온톨로지 실행 모드 변경",
          "/que - 대기열 모드 켜기/끄기",
          "/queue - 대기열 보기",
          "/queue clear - 대기열 비우기",
          "/queue run - 지금 한가하면 다음 대기 명령 실행",
          "/que <message> - 현재 실행을 끊지 않고 이 메시지를 대기열로 넣기",
          "/preview <url> - 프리뷰 URL 열기",
          "/cwd <path> - 작업 폴더 변경",
          "/model <model> - 현재 CLI 모델 변경",
          "/permission basic|auto|full - CLI 실행 권한 변경",
          "/provider anthropic|openai-codex|openrouter - Hermes provider 변경",
          "/effort low|medium|high|xhigh - Codex 추론 강도 변경",
          "/speed default|fast - Codex 속도 tier 변경",
        ].join("\n"),
        attachedImage: "이미지 첨부됨",
        removeAttachment: "첨부 삭제",
        imagePasting: "붙여넣은 이미지 저장 중...",
        imagePasteFailed: (message: string) => `이미지 붙여넣기 실패: ${message}`,
        imageOnlyPrompt: "첨부한 이미지를 확인해줘.",
        preparing: "준비 중",
        runningPrefix: "실행 중",
        usingTool: "도구 사용 중",
        changedFiles: (count: number) => `이번 실행 변경 ${count}개 파일`,
        reviewReady: "필요할 때 변경사항 리뷰",
        reviewChanges: "변경사항 리뷰",
        reviewingChanges: "변경 확인 중",
        noChanges: "이번 실행에서 변경된 파일이 없습니다.",
        logs: "로그",
        showLogs: "로그 보기",
        hideLogs: "로그 숨기기",
        undo: "실행 취소",
        review: "리뷰",
        expandAll: "펼치기",
        collapseAll: "접기",
        hideTaskList: "작업 목록 숨기기",
        showTaskList: "작업 목록 보이기",
        noDiff: "표시할 텍스트 diff가 없습니다.",
        undoDone: "실행 취소가 적용되었습니다.",
        undoFailed: (message: string) => `실행 취소 실패: ${message}`,
      };

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) || sessions[0] || null,
    [activeId, sessions],
  );
  // active 세션 기준 busy 가드 — 다른 세션이 바빠도 active가 한가하면 입력 가능.
  const busyTurnId: string | null = active ? busyTurnIdsBySession[active.id] || null : null;

  // 작업탭마다 프리뷰 상태가 독립적이도록 활성 세션의 값으로 로컬 상태를 hydrate.
  // 프리뷰 표시 여부는 사용자가 직접 켠 경우에만 복원한다.
  const previewHydratedSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    if (previewHydratedSessionIdRef.current === active.id) return;
    previewHydratingSessionRef.current = active.id;
    previewHydratedSessionIdRef.current = active.id;
    // URL/서비스 명령은 세션별 고유 데이터 — 글로벌 폴백 없이 비어 있으면 빈 상태로 둔다.
    // 뷰포트/폭은 UI 환경설정이지만 표시 여부는 수동 opt-in으로만 복원한다.
    const fallbackVisible = localStorage.getItem(PREVIEW_VISIBLE_KEY) === "1" || localStorage.getItem(DEV_SCREEN_VISIBLE_KEY) === "1";
    const fallbackVPRaw = localStorage.getItem(PREVIEW_VP_KEY);
    const fallbackVP: PreviewViewport =
      fallbackVPRaw === "mobile" || fallbackVPRaw === "tablet" || fallbackVPRaw === "desktop"
        ? fallbackVPRaw
        : "desktop";
    const fallbackWidth = clampNumber(Number(localStorage.getItem(PREVIEW_WIDTH_KEY)) || 430, 320, 760);
    const sessionPreviewUrl = cleanStoredPreviewUrl(active.previewUrl ?? "");
    setPreviewUrl(sessionPreviewUrl);
    setPreviewInput(sessionPreviewUrl);
    setShowPreview(active.previewVisible ?? fallbackVisible);
    setPreviewVP((active.previewViewport as PreviewViewport | undefined) ?? fallbackVP);
    setPreviewWidth(active.previewWidth ?? fallbackWidth);
    const serviceCommand = cleanStoredPreviewServiceCommand(active.previewServiceCommand ?? "");
    setPreviewServiceCommand(serviceCommand);
    if ((active.previewUrl ?? "") !== sessionPreviewUrl || (active.previewServiceCommand ?? "") !== serviceCommand) {
      patchSession(active.id, (session) => ({
        ...session,
        previewUrl: sessionPreviewUrl || undefined,
        previewServiceCommand: serviceCommand || undefined,
        updatedAt: Date.now(),
      }));
    }
    // 세션 전환 시 런타임 캐시 초기화 (이전 세션 응답이 잠시 보이는 것 방지)
    setPreviewCheck(null);
    setPreviewService(null);
    setPreviewDiagnostics([]);
  }, [active?.id]);

  // 로컬 프리뷰 상태가 변경되면 활성 세션에도 반영.
  // 값이 이미 같으면 patch를 생략해 무한 재귀를 막는다.
  useEffect(() => {
    if (!active) return;
    if (previewHydratedSessionIdRef.current !== active.id) return;
    const fallbackVisible = localStorage.getItem(PREVIEW_VISIBLE_KEY) === "1";
    const fallbackVPRaw = localStorage.getItem(PREVIEW_VP_KEY);
    const fallbackVP: PreviewViewport =
      fallbackVPRaw === "mobile" || fallbackVPRaw === "tablet" || fallbackVPRaw === "desktop"
        ? fallbackVPRaw
        : "desktop";
    const fallbackWidth = clampNumber(Number(localStorage.getItem(PREVIEW_WIDTH_KEY)) || 430, 320, 760);
    const expectedVisible = active.previewVisible ?? fallbackVisible;
    const expectedVP = (active.previewViewport as PreviewViewport | undefined) ?? fallbackVP;
    const expectedWidth = active.previewWidth ?? fallbackWidth;
    const expectedUrl = cleanStoredPreviewUrl(active.previewUrl ?? "");
    const expectedCommand = cleanStoredPreviewServiceCommand(active.previewServiceCommand ?? "");
    if (previewHydratingSessionRef.current === active.id) {
      const hydrated =
        expectedUrl === previewUrl &&
        expectedVisible === showPreview &&
        expectedVP === previewVP &&
        expectedWidth === previewWidth &&
        expectedCommand === previewServiceCommand;
      if (!hydrated) return;
      previewHydratingSessionRef.current = null;
    }
    if (
      expectedUrl === previewUrl &&
      expectedVisible === showPreview &&
      expectedVP === previewVP &&
      expectedWidth === previewWidth &&
      expectedCommand === previewServiceCommand
    ) {
      return;
    }
    patchSession(active.id, (s) => ({
      ...s,
      previewUrl,
      previewVisible: showPreview,
      previewViewport: previewVP,
      previewWidth,
      previewServiceCommand,
    }));
  }, [
    previewUrl,
    showPreview,
    previewVP,
    previewWidth,
    previewServiceCommand,
    active?.id,
    active?.previewUrl,
    active?.previewVisible,
    active?.previewViewport,
    active?.previewWidth,
    active?.previewServiceCommand,
  ]);
  const agentProfiles = useMemo(
    () => tw.profiles
      .map((profile) => ({ profile, provider: providerFromProfile(profile) }))
      .filter((item): item is { profile: Profile; provider: AgentProvider } => Boolean(item.provider)),
    [tw.profiles],
  );
  const fallbackProfile = agentProfiles[0]?.profile;
  const fallbackProvider = agentProfiles[0]?.provider || DEFAULT_PROVIDER;
  const activeProvider = active?.provider || fallbackProvider;
  const activeProviderMeta = providerMeta(activeProvider);
  const activeModel = active?.model || activeProviderMeta.defaultModel;
  const activeHermesProvider = activeProvider === "hermes"
    ? normalizeHermesProvider(active?.hermesProvider || inferHermesProviderFromModel(activeModel))
    : DEFAULT_HERMES_PROVIDER;
  const activeModelOptions = modelOptionsFor(activeProvider, activeModel, activeHermesProvider);
  const activeModelLabel = labelForOption(activeModelOptions, activeModel);
  const slashCommands = useMemo(
    () => slashCommandsFor(activeProvider, activeHermesProvider, activeModelOptions),
    [activeProvider, activeHermesProvider, activeModelOptions],
  );
  const visibleSlashCommands = useMemo(
    () => filterSlashCommands(slashCommands, input, tw.language).slice(0, 18),
    [slashCommands, input, tw.language],
  );
  const showSlashMenu = input.trimStart().startsWith("/") && !input.includes("\n") && visibleSlashCommands.length > 0;
  const activeSlashSelection = Math.min(slashSelection, Math.max(visibleSlashCommands.length - 1, 0));
  const selectedSlashCommand = visibleSlashCommands[activeSlashSelection];
  const activeCodexEffort = normalizeCodexEffort(active?.codexEffort);
  const activeCodexSpeed = normalizeCodexSpeed(active?.codexSpeed);
  const activePermissionMode = normalizePermissionMode(active?.permissionMode);
  const activePermissionOption = PERMISSION_MODES.find((option) => option.value === activePermissionMode) || PERMISSION_MODES[0];
  const activePermissionLabel = labelForPermissionMode(activePermissionMode, tw.language);
  const localPreview = isLocalPreviewUrl(previewUrl);
  const previewBadgeTone = !previewUrl
    ? "idle"
    : previewChecking
      ? "checking"
      : previewCheck?.ok
        ? "ok"
        : previewCheck
          ? "error"
          : "linked";
  const previewBadgeText = !previewUrl
    ? copy.preview
    : previewChecking
      ? copy.previewChecking
      : previewCheck?.ok
        ? copy.previewOk
        : previewCheck
          ? copy.previewIssue
          : copy.previewLinked;
  const visiblePreviewDiagnostics = previewDiagnostics.slice(-3);
  const previewServiceLabel = previewService?.running
    ? `${copy.previewServiceManaged}${previewService.pid ? ` · ${previewService.pid}` : ""}`
    : previewService?.managed
      ? copy.previewServiceIdle
      : copy.previewServiceExternal;
  const previewServiceOutput = previewService?.recent_output?.slice(-2) || [];
  const devScreenBadgeTone = devScreenError
    ? "error"
    : devScreenBusy
      ? "checking"
      : (devScreenCheckResult || devScreenStatusResult)
        ? "ok"
        : "idle";
  const devScreenBadgeText = devScreenError
    ? copy.devScreenError
    : devScreenBusy
      ? copy.devScreenBusy
      : (devScreenCheckResult || devScreenStatusResult)
        ? copy.devScreenReady
        : copy.devScreenIdle;
  const latestDevScreenStatus = devScreenCheckResult?.status || devScreenStatusResult;
  const latestDevScreenScreenshot = devScreenCheckResult?.screenshot || devScreenScreenshotResult;
  const latestDevScreenSnapshot = devScreenCheckResult?.snapshot || devScreenSnapshotResult;
  const latestDevScreenData = devScreenActionResult
    ? JSON.stringify(devScreenActionResult.data, null, 2)
    : latestDevScreenStatus
      ? JSON.stringify({
          ok: latestDevScreenStatus.ok,
          host: latestDevScreenStatus.host,
          port: latestDevScreenStatus.port,
          window: latestDevScreenStatus.windowLabel,
        }, null, 2)
      : "";

  const isWorkspaceForeground = () =>
    document.visibilityState === "visible" && document.hasFocus();

  const revealTargetsImmediately = (targets: Record<string, string> = smoothTargetsRef.current) => {
    const entries = Object.entries(targets);
    if (entries.length === 0) return;
    setVisibleTextById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, target] of entries) {
        if (next[id] === target) continue;
        next[id] = target;
        smoothRevealStateRef.current[id] = { carry: 0, pauseUntil: 0 };
        changed = true;
      }
      return changed ? next : prev;
    });
    if (smoothFrameRef.current !== null) {
      window.cancelAnimationFrame(smoothFrameRef.current);
      smoothFrameRef.current = null;
    }
    smoothLastTickRef.current = 0;
  };

  const revealMessageImmediately = (assistantId: string, text: string) => {
    if (!text) return;
    revealTargetsImmediately({ [assistantId]: text });
  };

  const markStreamingTurnsBackgrounded = () => {
    sessionsRef.current.forEach((session) => {
      session.messages.forEach((message) => {
        if (message.role === "assistant" && message.status === "streaming") {
          backgroundedAssistantIdsRef.current.add(message.id);
        }
      });
    });
  };

  useEffect(() => {
    setSlashSelection(0);
  }, [input, activeProvider, activeHermesProvider]);

  const lastAssistantStatus = (session: AgentSession) => {
    const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
    return lastAssistant?.status;
  };

  const isSessionRunning = (session: AgentSession) =>
    Boolean(busyTurnIdsBySession[session.id]) || lastAssistantStatus(session) === "streaming";
  const isSessionDone = (session: AgentSession) =>
    !isSessionRunning(session) && lastAssistantStatus(session) === "done";

  const scrollTranscriptToBottom = () => {
    const el = scrollRef.current;
    if (!el || !autoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  };

  const scheduleTranscriptScroll = () => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollTranscriptToBottom();
    });
  };

  const handleTranscriptScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < 56;
  };

  const startPreviewResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    previewResizeRef.current = { startX: event.clientX, startW: previewWidth };
    setResizingPreview(true);
  };

  const scheduleSmoothOutput = () => {
    if (!isWorkspaceForeground()) {
      revealTargetsImmediately();
      return;
    }
    if (smoothFrameRef.current !== null) return;
    smoothFrameRef.current = window.requestAnimationFrame(revealSmoothOutput);
  };

  const revealSmoothOutput = (now: number) => {
    if (now < inputRevealPauseUntilRef.current) {
      smoothFrameRef.current = window.requestAnimationFrame(revealSmoothOutput);
      return;
    }
    const rawElapsed = smoothLastTickRef.current
      ? now - smoothLastTickRef.current
      : SMOOTH_FRAME_MS;
    if (!isWorkspaceForeground() || rawElapsed > SMOOTH_BACKGROUND_CATCH_UP_MS) {
      revealTargetsImmediately();
      return;
    }
    const elapsed = Math.min(90, rawElapsed);
    if (elapsed < SMOOTH_FRAME_MS * 0.72) {
      smoothFrameRef.current = window.requestAnimationFrame(revealSmoothOutput);
      return;
    }
    smoothLastTickRef.current = now;

    let hasPending = false;
    setVisibleTextById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, target] of Object.entries(smoothTargetsRef.current)) {
        const current = next[id] || "";
        if (current === target) continue;
        if (!target.startsWith(current)) {
          next[id] = target.slice(0, Math.min(current.length, target.length));
          smoothRevealStateRef.current[id] = { carry: 0, pauseUntil: 0 };
          changed = true;
          hasPending = next[id].length < target.length;
          continue;
        }
        const remaining = target.length - current.length;
        if (remaining <= 0) continue;
        const revealState = smoothRevealStateRef.current[id] || { carry: 0, pauseUntil: 0 };
        smoothRevealStateRef.current[id] = revealState;
        const nextLength = revealNextLength(target, current.length, elapsed, now, revealState);
        if (nextLength <= current.length) {
          hasPending = true;
          continue;
        }
        next[id] = target.slice(0, nextLength);
        changed = true;
        hasPending = true;
      }
      return changed ? next : prev;
    });

    if (hasPending) {
      smoothFrameRef.current = window.requestAnimationFrame(revealSmoothOutput);
    } else {
      smoothFrameRef.current = null;
      smoothLastTickRef.current = 0;
    }
  };

  useEffect(() => {
    if (sessions.length === 0) {
      if (activeId) {
        activeIdRef.current = null;
        setActiveId(null);
      }
      return;
    }
    if (!activeId || !sessions.some((session) => session.id === activeId)) {
      activeIdRef.current = sessions[0].id;
      setActiveId(sessions[0].id);
    }
  }, [activeId, sessions]);

  useEffect(() => {
    persistSessionsSoon(sessions);
  }, [sessions]);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    let changed = false;
    const next = sessionsRef.current.map((session) => {
      if (busyTurnIdsBySession[session.id]) return session;
      const messages = finalizeOrphanedStreamingMessages(session.messages);
      if (messages === session.messages) return session;
      changed = true;
      return { ...session, messages, updatedAt: Date.now() };
    });
    if (!changed) return;
    sessionsRef.current = next;
    setSessions(next);
  }, [busyTurnIdsBySession]);

  useEffect(() => {
    localStorage.setItem(CWD_KEY, cwd);
  }, [cwd]);

  useEffect(() => {
    localStorage.setItem(TASK_LIST_VISIBLE_KEY, showTaskList ? "1" : "0");
  }, [showTaskList]);

  useEffect(() => {
    localStorage.setItem(PREVIEW_VISIBLE_KEY, showPreview ? "1" : "0");
  }, [showPreview]);

  useEffect(() => {
    localStorage.setItem(PREVIEW_KEY, previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    localStorage.setItem(PREVIEW_WIDTH_KEY, String(previewWidth));
  }, [previewWidth]);

  useEffect(() => {
    localStorage.setItem(PREVIEW_VP_KEY, previewVP);
  }, [previewVP]);

  useEffect(() => {
    localStorage.setItem(PREVIEW_SERVICE_COMMAND_KEY, previewServiceCommand);
  }, [previewServiceCommand]);

  useEffect(() => {
    localStorage.setItem(DEV_SCREEN_VISIBLE_KEY, showDevScreen ? "1" : "0");
  }, [showDevScreen]);

  useEffect(() => {
    localStorage.setItem(DEV_SCREEN_HOST_KEY, devScreenHost);
  }, [devScreenHost]);

  useEffect(() => {
    localStorage.setItem(DEV_SCREEN_PORT_KEY, devScreenPort);
  }, [devScreenPort]);

  useEffect(() => {
    localStorage.setItem(DEV_SCREEN_WINDOW_KEY, devScreenWindow);
  }, [devScreenWindow]);

  useEffect(() => {
    if (cwd) return;
    homeDir().then((h) => setCwd(h)).catch(() => {});
  }, [cwd]);

  useEffect(() => {
    if (activeProvider === "codex") return;
    setShowModelMenu(false);
    setCodexMenuPanel("root");
  }, [activeProvider]);

  useEffect(() => {
    if (!showModelMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && modelMenuRef.current?.contains(target)) return;
      setShowModelMenu(false);
      setCodexMenuPanel("root");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowModelMenu(false);
      setCodexMenuPanel("root");
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showModelMenu]);

  useEffect(() => {
    if (!showPermissionMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && permissionMenuRef.current?.contains(target)) return;
      setShowPermissionMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowPermissionMenu(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showPermissionMenu]);

  useEffect(() => {
    if (!resizingPreview) return;
    const onPointerMove = (event: PointerEvent) => {
      const state = previewResizeRef.current;
      if (!state) return;
      const max = clampNumber(window.innerWidth - 640, 360, 920);
      setPreviewWidth(clampNumber(state.startW + state.startX - event.clientX, 320, max));
    };
    const onPointerUp = () => {
      previewResizeRef.current = null;
      setResizingPreview(false);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [resizingPreview]);

  useEffect(() => {
    scheduleTranscriptScroll();
  }, [active?.messages, visibleTextById, busyTurnId]);

  useEffect(() => {
    autoScrollRef.current = true;
    window.requestAnimationFrame(scrollTranscriptToBottom);
  }, [activeId]);

  useEffect(() => {
    const targets: Record<string, string> = {};
    active?.messages.forEach((message) => {
      if (message.role !== "assistant") return;
      if (!animatedAssistantIdsRef.current.has(message.id)) return;
      targets[message.id] = message.text;
    });
    smoothTargetsRef.current = targets;
    for (const id of Object.keys(smoothRevealStateRef.current)) {
      if (!(id in targets)) delete smoothRevealStateRef.current[id];
    }
    setVisibleTextById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(targets)) {
        if (next[id] === undefined) {
          next[id] = "";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    const needsReveal = Object.keys(targets).some((id) => (visibleTextById[id] || "") !== targets[id]);
    if (needsReveal) {
      const shouldCatchUp = !isWorkspaceForeground()
        || Object.keys(targets).some((id) => backgroundedAssistantIdsRef.current.has(id));
      if (shouldCatchUp) {
        revealTargetsImmediately(targets);
      } else {
        scheduleSmoothOutput();
      }
    }
  }, [active?.messages, visibleTextById]);

  useEffect(() => {
    return () => {
      Object.values(pendingStreamRef.current).forEach((pending) => {
        if (pending.timer) window.clearTimeout(pending.timer);
      });
      if (smoothFrameRef.current !== null) {
        window.cancelAnimationFrame(smoothFrameRef.current);
      }
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      persistSessionsNow(sessionsRef.current);
      pendingStreamRef.current = {};
      smoothTargetsRef.current = {};
      smoothRevealStateRef.current = {};
      backgroundedAssistantIdsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!previewUrl) {
      setPreviewCheck(null);
      setPreviewChecking(false);
      return;
    }
    if (!isLocalPreviewUrl(previewUrl)) {
      setPreviewChecking(false);
      const result: PreviewCheckResult = {
        url: previewUrl,
        ok: false,
        status: null,
        title: null,
        body_text: null,
        error: copy.previewOnlyLocal,
        checked_at: Date.now(),
      };
      setPreviewCheck(result);
      setPreviewDiagnostics((prev) => [
        ...prev,
        {
          id: nowId("preview-diagnostic"),
          source: "preview" as const,
          level: "info" as const,
          text: copy.previewOnlyLocal,
          createdAt: Date.now(),
        },
      ].slice(-5));
      return;
    }
    if (!isTauri()) {
      setPreviewChecking(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPreviewChecking(true);
      previewHealthCheck(previewUrl)
        .then((result) => {
          if (cancelled) return;
          setPreviewCheck(result);
          const previewText = result.ok
            ? copy.previewStatusOk(result.status, result.title)
            : [
                copy.previewStatusError(result.error || "unknown"),
                result.body_text ? clipActivityText(result.body_text, 360) : "",
              ].filter(Boolean).join(" · ");
          setPreviewDiagnostics((prev) => [
            ...prev,
            {
              id: nowId("preview-diagnostic"),
              source: "preview" as const,
              level: result.ok ? ("ok" as const) : ("error" as const),
              text: previewText,
              createdAt: Date.now(),
            },
          ].slice(-5));
        })
        .catch((err) => {
          if (cancelled) return;
          const message = String(err);
          setPreviewCheck({
            url: previewUrl,
            ok: false,
            status: null,
            title: null,
            body_text: null,
            error: message,
            checked_at: Date.now(),
          });
          setPreviewDiagnostics((prev) => [
            ...prev,
            {
              id: nowId("preview-diagnostic"),
              source: "preview" as const,
              level: "error" as const,
              text: copy.previewStatusError(message),
              createdAt: Date.now(),
            },
          ].slice(-5));
        })
        .finally(() => {
          if (!cancelled) setPreviewChecking(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [previewUrl, previewReloadKey, tw.language]);

  const patchSession = (id: string, patcher: (session: AgentSession) => AgentSession) => {
    const next = sessionsRef.current.map((s) => (s.id === id ? patcher(s) : s));
    sessionsRef.current = next;
    persistSessionsSoon(next);
    setSessions(next);
  };

  const updateWorkspaceCwd = (value: string) => {
    setCwd(value);
    const id = activeIdRef.current;
    if (!id) return;
    patchSession(id, (current) =>
      current.cwd === value ? current : { ...current, cwd: value, updatedAt: Date.now() },
    );
  };

  const devScreenOptions = (): DevScreenOptions => {
    const trimmedPort = devScreenPort.trim();
    return {
      host: devScreenHost.trim() || "127.0.0.1",
      port: trimmedPort ? Number(trimmedPort) : null,
      windowLabel: devScreenWindow.trim() || "main",
      timeoutMs: 8000,
    };
  };

  const recordDevScreenSuccess = (result: { port?: number; host?: string; windowLabel?: string; status?: DevScreenStatusResult }) => {
    const source = result.port ? result : result.status;
    if (source?.host && source.host !== devScreenHost) setDevScreenHost(source.host);
    if (source?.port && String(source.port) !== devScreenPort) setDevScreenPort(String(source.port));
    if (source?.windowLabel && source.windowLabel !== devScreenWindow) setDevScreenWindow(source.windowLabel);
    setDevScreenError(null);
  };

  const runDevScreenAction = async <T extends { port?: number; host?: string; windowLabel?: string; status?: DevScreenStatusResult }>(
    task: () => Promise<T>,
    onResult: (result: T) => void,
  ) => {
    if (devScreenBusy) return;
    setDevScreenBusy(true);
    setDevScreenError(null);
    try {
      const result = await task();
      recordDevScreenSuccess(result);
      onResult(result);
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err);
      setDevScreenError(message);
    } finally {
      setDevScreenBusy(false);
    }
  };

  const runDevScreenStatus = () =>
    runDevScreenAction(
      () => devScreenStatus(devScreenOptions()),
      (result) => {
        setDevScreenStatusResult(result);
        setDevScreenActionResult(null);
      },
    );

  const runDevScreenCheck = () =>
    runDevScreenAction(
      () => devScreenCheck(devScreenOptions()),
      (result) => {
        setDevScreenCheckResult(result);
        setDevScreenStatusResult(result.status);
        setDevScreenScreenshotResult(result.screenshot);
        setDevScreenSnapshotResult(result.snapshot);
        setDevScreenActionResult(null);
      },
    );

  const runDevScreenScreenshot = () =>
    runDevScreenAction(
      () => devScreenScreenshot(devScreenOptions()),
      (result) => {
        setDevScreenScreenshotResult(result);
        setDevScreenCheckResult(null);
        setDevScreenActionResult(null);
      },
    );

  const runDevScreenSnapshot = () =>
    runDevScreenAction(
      () => devScreenSnapshot(devScreenOptions()),
      (result) => {
        setDevScreenSnapshotResult(result);
        setDevScreenCheckResult(null);
        setDevScreenActionResult(null);
      },
    );

  const runDevScreenJs = () =>
    runDevScreenAction(
      () => devScreenJs(devScreenOptions(), devScreenJsCode),
      (result) => setDevScreenActionResult(result),
    );

  const runDevScreenClick = () =>
    runDevScreenAction(
      () => devScreenClick(devScreenOptions(), devScreenSelector),
      (result) => setDevScreenActionResult(result),
    );

  const runDevScreenType = () =>
    runDevScreenAction(
      () => devScreenType(devScreenOptions(), devScreenSelector, devScreenText),
      (result) => setDevScreenActionResult(result),
    );

  const runDevScreenKey = () =>
    runDevScreenAction(
      () => devScreenKey(devScreenOptions(), devScreenKeyName),
      (result) => setDevScreenActionResult(result),
    );

  const runDevScreenResize = () =>
    runDevScreenAction(
      () => devScreenResize(devScreenOptions(), Number(devScreenResizeWidth), Number(devScreenResizeHeight)),
      (result) => setDevScreenActionResult(result),
    );

  const resetComposer = () => {
    setInput("");
    setPendingAttachments([]);
    setPasteError(null);
  };

  const selectSession = (id: string) => {
    if (id !== activeId) resetComposer();
    const nextSession = sessionsRef.current.find((session) => session.id === id);
    if (nextSession?.cwd) setCwd(nextSession.cwd);
    activeIdRef.current = id;
    setActiveId(id);
  };

  const makeSession = (
    profile: Profile | undefined,
    provider: AgentProvider,
    title?: string,
  ): AgentSession => {
    const meta = providerMeta(provider);
    const id = nowId("agent");
    const profileName = profile?.name || meta.label;
    const hermesProvider = provider === "hermes" ? hermesProviderFromProfile(profile) : undefined;
    const defaultTitle = tw.language === "en"
      ? `New ${profileName} workspace`
      : `새 ${profileName} 작업`;
    return {
      id,
      title: title || defaultTitle,
      titleEdited: Boolean(title),
      provider,
      profileId: profile?.id || provider,
      profileName,
      profileDot: normalizeAgentDotColor(profile?.dot || meta.dot),
      model: provider === "hermes"
        ? normalizeHermesModel(hermesProvider || DEFAULT_HERMES_PROVIDER, profile ? modelFromProfile(profile, provider) : meta.defaultModel)
        : normalizeModel(provider, profile ? modelFromProfile(profile, provider) : meta.defaultModel),
      hermesProvider,
      stellaOntologyMode: normalizeStellaOntologyMode(undefined, provider),
      codexEffort: provider === "codex" ? DEFAULT_CODEX_EFFORT : undefined,
      codexSpeed: provider === "codex" ? DEFAULT_CODEX_SPEED : undefined,
      permissionMode: DEFAULT_PERMISSION_MODE,
      queueMode: false,
      cwd,
      messages: [],
      queuedTurns: [],
      rawEvents: [],
      updatedAt: Date.now(),
    };
  };

  const createSession = (profile: Profile | undefined, provider: AgentProvider, clearInput = true) => {
    const session = makeSession(profile, provider);
    const nextSessions = [session, ...sessionsRef.current];
    sessionsRef.current = nextSessions;
    persistSessions(nextSessions);
    setSessions(nextSessions);
    activeIdRef.current = session.id;
    setActiveId(session.id);
    setShowProfilePicker(false);
    if (clearInput) resetComposer();
    return session;
  };

  const handleNewSessionClick = () => {
    if (agentProfiles.length === 1) {
      createSession(agentProfiles[0].profile, agentProfiles[0].provider);
      return;
    }
    setShowProfilePicker((v) => !v);
  };

  const deleteSession = (id: string) => {
    if (editingSessionId === id) cancelRename(true);
    const nextSessions = sessionsRef.current.filter((s) => s.id !== id);
    sessionsRef.current = nextSessions;
    persistSessions(nextSessions);
    setSessions(nextSessions);
    if (activeId === id) {
      const next = nextSessions[0];
      activeIdRef.current = next?.id || null;
      setActiveId(next?.id || null);
      resetComposer();
    }
  };

  const beginRename = (session: AgentSession) => {
    skipRenameCommitRef.current = false;
    selectSession(session.id);
    setEditingSessionId(session.id);
    setEditingTitle(session.title || providerMeta(session.provider).label);
  };

  const cancelRename = (skipCommit = false) => {
    skipRenameCommitRef.current = skipCommit;
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const commitRename = () => {
    if (skipRenameCommitRef.current) {
      skipRenameCommitRef.current = false;
      return;
    }
    const id = editingSessionId;
    if (!id) return;
    const nextTitle = editingTitle.trim();
    patchSession(id, (session) => ({
      ...session,
      title: nextTitle || session.title,
      titleEdited: nextTitle ? true : session.titleEdited,
      updatedAt: Date.now(),
    }));
    cancelRename();
  };

  const loadPreviewUrl = (url: string, options?: { reveal?: boolean }) => {
    const trimmed = cleanStoredPreviewUrl(url);
    if (!trimmed) return;
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    setPreviewUrl(normalized);
    setPreviewInput(normalized);
    if (options?.reveal) setShowPreview(true);
  };

  const applyPreviewInput = () => loadPreviewUrl(previewInput, { reveal: true });

  const pushPreviewDiagnostic = (diagnostic: Omit<PreviewDiagnostic, "id" | "createdAt">) => {
    setPreviewDiagnostics((prev) => {
      const nextItem: PreviewDiagnostic = {
        ...diagnostic,
        id: nowId("preview-diagnostic"),
        createdAt: Date.now(),
      };
      const last = prev[prev.length - 1];
      if (last?.source === nextItem.source && last.level === nextItem.level && last.text === nextItem.text) {
        return [...prev.slice(0, -1), nextItem];
      }
      return [...prev, nextItem].slice(-5);
    });
  };

  const noteTerminalIssue = (event: AgentStreamEvent) => {
    const issue = terminalIssueFromEvent(event);
    if (!issue) return;
    pushPreviewDiagnostic({
      source: "terminal",
      level: "error",
      text: `${copy.terminalIssue}: ${issue}`,
    });
  };

  const rememberPreviewStartCommand = (event: AgentStreamEvent) => {
    const command = commandFromValue(parseRawJson(event.raw)) || event.text || event.status || "";
    const clean = normalizePreviewStartCommand(clipActivityText(command, 220));
    if (!clean || !isPreviewStartCommand(clean)) return;
    lastPreviewCommandRef.current = clean;
    if (!previewServiceCommand) setPreviewServiceCommand(clean);
  };

  const startManagedPreviewService = async (silent = false) => {
    if (!previewUrl || !isLocalPreviewUrl(previewUrl) || previewServiceBusy || !isTauri()) return;
    setPreviewServiceBusy(true);
    if (!silent) {
      pushPreviewDiagnostic({
        source: "preview",
        level: "info",
        text: copy.previewServiceStarting,
      });
    }
    try {
      const status = await previewServiceStart({
        url: previewUrl,
        cwd: cwd || null,
        command: previewServiceCommand || null,
        autoRestart: true,
      });
      setPreviewService(status);
      if (status.command && !previewServiceCommand) setPreviewServiceCommand(status.command);
      pushPreviewDiagnostic({
        source: "preview",
        level: "ok",
        text: silent ? copy.previewServiceRestarting : copy.previewServiceStarted(status.pid),
      });
      setPreviewReloadKey((n) => n + 1);
    } catch (err) {
      const message = String(err);
      pushPreviewDiagnostic({
        source: "preview",
        level: "error",
        text: copy.previewServiceStartFailed(message),
      });
    } finally {
      setPreviewServiceBusy(false);
    }
  };

  const stopManagedPreviewService = async () => {
    if (!previewUrl || !isLocalPreviewUrl(previewUrl) || previewServiceBusy || !isTauri()) return;
    setPreviewServiceBusy(true);
    try {
      const status = await previewServiceStop(previewUrl);
      setPreviewService(status);
      pushPreviewDiagnostic({
        source: "preview",
        level: "info",
        text: copy.previewServiceStopped,
      });
    } catch (err) {
      pushPreviewDiagnostic({
        source: "preview",
        level: "error",
        text: copy.previewServiceStartFailed(String(err)),
      });
    } finally {
      setPreviewServiceBusy(false);
    }
  };

  useEffect(() => {
    if (!previewUrl || !isLocalPreviewUrl(previewUrl) || !isTauri()) {
      setPreviewService(null);
      return;
    }
    let cancelled = false;
    const syncStatus = () => {
      previewServiceStatus(previewUrl)
        .then((status) => {
          if (cancelled) return;
          setPreviewService(status);
        })
        .catch(() => {
          if (!cancelled) setPreviewService(null);
        });
    };
    syncStatus();
    const timer = window.setInterval(syncStatus, 2200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!previewUrl || !isLocalPreviewUrl(previewUrl) || previewServiceBusy) return;
    const error = previewCheck?.error || "";
    const needsStart = Boolean(previewCheck && !previewCheck.ok && /connect|ECONN|refused|연결/i.test(error));
    if (!needsStart) return;
    const now = Date.now();
    if (now - (previewAutoStartRef.current[previewUrl] || 0) < 30000) return;
    if (previewService?.running) return;
    previewAutoStartRef.current[previewUrl] = now;
    startManagedPreviewService(true);
  }, [previewCheck?.checked_at, previewUrl, previewService?.running, previewServiceBusy]);

  useEffect(() => {
    if (!previewUrl || !isLocalPreviewUrl(previewUrl) || previewServiceBusy) return;
    if (!previewService?.managed || !previewService.auto_restart || previewService.running || !previewService.command) return;
    const now = Date.now();
    if (now - (previewAutoStartRef.current[previewUrl] || 0) < 8000) return;
    previewAutoStartRef.current[previewUrl] = now;
    startManagedPreviewService(true);
  }, [previewService?.running, previewService?.managed, previewService?.last_error, previewUrl, previewServiceBusy]);

  const updateActiveModel = (model: string) => {
    if (!active) return;
    patchSession(active.id, (session) => {
      const hermesProvider = session.provider === "hermes"
        ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
        : DEFAULT_HERMES_PROVIDER;
      const nextModel = session.provider === "hermes"
        ? normalizeHermesModel(hermesProvider, model)
        : normalizeModel(session.provider, model);
      const changed = nextModel !== session.model;
      return {
        ...session,
        model: nextModel,
        providerSessionId: changed ? undefined : session.providerSessionId,
        providerSessionModel: changed ? undefined : session.providerSessionModel,
        providerSessionHermesProvider: changed ? undefined : session.providerSessionHermesProvider,
        updatedAt: Date.now(),
      };
    });
  };

  const updateActiveHermesProvider = (hermesProvider: HermesInferenceProvider) => {
    if (!active) return;
    patchSession(active.id, (session) => ({
      ...session,
      hermesProvider,
      model: HERMES_MODEL_OPTIONS[hermesProvider].some((option) => option.value === normalizeHermesModel(hermesProvider, session.model))
        ? normalizeHermesModel(hermesProvider, session.model)
        : defaultHermesModel(hermesProvider),
      providerSessionId: undefined,
      providerSessionModel: undefined,
      providerSessionHermesProvider: undefined,
      updatedAt: Date.now(),
    }));
  };

  const updateActiveCodexEffort = (effort: CodexEffort) => {
    if (!active) return;
    patchSession(active.id, (session) => ({ ...session, codexEffort: effort, updatedAt: Date.now() }));
  };

  const updateActiveCodexSpeed = (speed: CodexSpeed) => {
    if (!active) return;
    patchSession(active.id, (session) => ({ ...session, codexSpeed: speed, updatedAt: Date.now() }));
  };

  const updateActivePermissionMode = (permissionMode: AgentPermissionMode) => {
    if (!active) return;
    patchSession(active.id, (session) => ({ ...session, permissionMode, updatedAt: Date.now() }));
    setShowPermissionMenu(false);
  };

  const maybeAutoPreview = (event: AgentStreamEvent) => {
    const url = findPreviewUrl(event.text) || findPreviewUrl(event.raw);
    if (url) {
      if (!previewServiceCommand && lastPreviewCommandRef.current) {
        setPreviewServiceCommand(lastPreviewCommandRef.current);
      }
      loadPreviewUrl(url);
    }
  };

  const rememberInactiveSessionPreview = (sessionId: string, event: AgentStreamEvent) => {
    const command = commandFromValue(parseRawJson(event.raw)) || event.text || event.status || "";
    const previewCommand = normalizePreviewStartCommand(clipActivityText(command, 220));
    const url = findPreviewUrl(event.text) || findPreviewUrl(event.raw);
    if (!previewCommand && !url) return;

    patchSession(sessionId, (session) => ({
      ...session,
      previewUrl: url || session.previewUrl,
      previewVisible: session.previewVisible,
      previewServiceCommand: session.previewServiceCommand || previewCommand || undefined,
      updatedAt: Date.now(),
    }));
  };

  const activityFromEvent = (event: AgentStreamEvent): Omit<AgentActivity, "id" | "createdAt" | "active"> | null => {
  const rawJson = parseRawJson(event.raw);
  const command = commandFromValue(rawJson);
  if (event.kind === "tool") {
    if (event.status === "hermes.diff" || isDiffFileHeaderLine(event.text || "") || isDiffHunkHeaderLine(event.text || "")) {
      return null;
    }
    if (command) {
      return {
          kind: "running",
          label: copy.runningPrefix,
        };
      }
      const tool = clipActivityText(event.text || event.status || "");
      if (!tool) return null;
      if (isAgentActivityLine(tool) || isAgentCommandDumpLine(tool)) {
        return { kind: "tool", label: copy.usingTool };
      }
      return { kind: "tool", label: `${copy.usingTool} ${tool}` };
    }
    if (event.kind === "status") {
      const status = event.status || "";
      if (status === "hermes.provider_diagnostic") {
        return {
          kind: "status",
          label: tw.language === "en" ? "Provider is delayed; retrying" : "모델 응답 지연, 재시도 중",
        };
      }
      if (/starting|started|init|system|turn\.started|thread\.started/i.test(status)) {
        return { kind: "thinking", label: copy.thinking };
      }
      if (/completed|complete|done|finish/i.test(status)) return null;
      return status ? { kind: "status", label: clipActivityText(status) } : { kind: "thinking", label: copy.thinking };
    }
    if (event.kind === "raw" && command) {
      return {
        kind: "running",
        label: copy.runningPrefix,
      };
    }
    return null;
  };

  const pushActivity = (sessionId: string, assistantId: string, event: AgentStreamEvent) => {
    const activity = activityFromEvent(event);
    if (!activity) return;
    patchSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((m) => {
        if (m.id !== assistantId) return m;
        const prev = m.activities || [];
        const last = prev[prev.length - 1];
        const nextActivity: AgentActivity = {
          ...activity,
          id: nowId("activity"),
          createdAt: Date.now(),
          active: m.status === "streaming",
        };
        const next = last?.label === nextActivity.label
          ? [...prev.slice(0, -1), { ...last, active: nextActivity.active, createdAt: nextActivity.createdAt }]
          : [...prev.map((item) => ({ ...item, active: false })), nextActivity].slice(-4);
        return { ...m, activities: next };
      }),
      updatedAt: Date.now(),
    }));
  };

  const finishActivities = (sessionId: string, assistantId: string) => {
    patchSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((m) =>
        m.id === assistantId && m.activities?.length
          ? { ...m, activities: m.activities.map((item) => ({ ...item, active: false })) }
          : m,
      ),
      updatedAt: Date.now(),
    }));
  };

  const flushAgentStream = (assistantId: string, revealImmediately = false) => {
    const pending = pendingStreamRef.current[assistantId];
    if (!pending) return;
    if (pending.timer) {
      window.clearTimeout(pending.timer);
      pending.timer = undefined;
    }

    const text = cleanAgentDelta(pending.text);
    const rawEvents = pending.rawEvents;
    const providerSessionId = pending.providerSessionId;
    pending.text = "";
    pending.rawEvents = [];
    pending.providerSessionId = undefined;

    if (!text && rawEvents.length === 0 && !providerSessionId) return;
    let nextVisibleText = "";
    patchSession(pending.sessionId, (session) => ({
      ...session,
      providerSessionId: providerSessionId || session.providerSessionId,
      rawEvents: rawEvents.length
        ? [...session.rawEvents, ...rawEvents].slice(-MAX_RAW_EVENTS)
        : session.rawEvents,
      messages: text
        ? session.messages.map((m) =>
            m.id === pending.assistantId
              ? {
                  ...m,
                  text: (() => {
                    nextVisibleText = `${m.text}${text}`;
                    return nextVisibleText;
                  })(),
                  status: "streaming" as const,
                  rawEvents: rawEvents.length
                    ? [...(m.rawEvents || []), ...rawEvents].slice(-MAX_RAW_EVENTS)
                    : m.rawEvents,
                }
              : m,
          )
        : rawEvents.length
          ? session.messages.map((m) =>
              m.id === pending.assistantId
                ? { ...m, rawEvents: [...(m.rawEvents || []), ...rawEvents].slice(-MAX_RAW_EVENTS) }
                : m,
            )
          : session.messages,
      updatedAt: Date.now(),
    }));
    if (revealImmediately && nextVisibleText) {
      backgroundedAssistantIdsRef.current.add(assistantId);
      revealMessageImmediately(assistantId, nextVisibleText);
      persistSessionsNow(sessionsRef.current);
    }
  };

  const flushAllAgentStreams = (revealImmediately = false) => {
    Object.keys(pendingStreamRef.current).forEach((assistantId) =>
      flushAgentStream(assistantId, revealImmediately),
    );
  };

  useEffect(() => {
    const flushOnInactive = () => {
      markStreamingTurnsBackgrounded();
      flushAllAgentStreams(true);
      revealTargetsImmediately();
      persistSessionsNow(sessionsRef.current);
    };
    const flushOnVisibility = () => {
      if (document.visibilityState !== "visible") flushOnInactive();
    };

    document.addEventListener("visibilitychange", flushOnVisibility);
    window.addEventListener("blur", flushOnInactive);
    window.addEventListener("pagehide", flushOnInactive);
    return () => {
      document.removeEventListener("visibilitychange", flushOnVisibility);
      window.removeEventListener("blur", flushOnInactive);
      window.removeEventListener("pagehide", flushOnInactive);
    };
  }, []);

  const enqueueAgentStream = (sessionId: string, assistantId: string, event: AgentStreamEvent) => {
    const pending = pendingStreamRef.current[assistantId] || {
      sessionId,
      assistantId,
      text: "",
      rawEvents: [],
    };
    pending.sessionId = sessionId;
    pending.assistantId = assistantId;
    pendingStreamRef.current[assistantId] = pending;

    if (event.text) pending.text += event.text;
    if (event.raw) pending.rawEvents.push(clipRawEvent(event.raw));
    if (event.provider_session_id) pending.providerSessionId = event.provider_session_id;
    if (FINAL_ONLY_WORKSPACE_STREAMING && isWorkspaceForeground()) {
      return;
    }
    if (!isWorkspaceForeground()) {
      backgroundedAssistantIdsRef.current.add(assistantId);
      flushAgentStream(assistantId, true);
      return;
    }
    if (!pending.timer) {
      pending.timer = window.setTimeout(() => flushAgentStream(assistantId), STREAM_FLUSH_MS);
    }
  };

  const handleAgentEvent = (sessionId: string, assistantId: string, event: AgentStreamEvent) => {
    if (sessionId === activeIdRef.current) {
      rememberPreviewStartCommand(event);
      maybeAutoPreview(event);
      noteTerminalIssue(event);
    } else {
      rememberInactiveSessionPreview(sessionId, event);
    }
    if (event.kind === "status" || event.kind === "tool" || event.kind === "raw") {
      pushActivity(sessionId, assistantId, event);
    }
    if (event.kind === "delta") {
      if (event.text && isAgentDumpText(event.text)) {
        pushActivity(sessionId, assistantId, {
          ...event,
          kind: "tool",
          status: event.status || "atelier.filtered_delta",
        });
        enqueueAgentStream(sessionId, assistantId, {
          ...event,
          text: null,
        });
        return;
      }
      enqueueAgentStream(sessionId, assistantId, event);
      return;
    }
    if (event.raw || event.provider_session_id) {
      enqueueAgentStream(sessionId, assistantId, {
        ...event,
        text: null,
      });
    }
    if (event.kind !== "result" && event.kind !== "error") {
      if (!FINAL_ONLY_WORKSPACE_STREAMING || !isWorkspaceForeground()) {
        flushAgentStream(assistantId);
      }
      return;
    }
    flushAgentStream(assistantId);
    finishActivities(sessionId, assistantId);
    const finalVisibleText = cleanAgentText(event.text);
    const shouldRevealFinalNow = sessionId !== activeIdRef.current
      || !isWorkspaceForeground()
      || backgroundedAssistantIdsRef.current.has(assistantId);
    if (finalVisibleText && shouldRevealFinalNow) {
      revealMessageImmediately(assistantId, finalVisibleText);
    }
    patchSession(sessionId, (session) => {
      const providerSessionId = event.provider_session_id || session.providerSessionId;
      const messages = session.messages.map((m) => {
        if (m.id !== assistantId) return m;
        if (event.kind === "result") {
          const text = finalVisibleText || cleanAgentText(m.text) || copy.noResponse;
          return {
            ...m,
            text,
            status: event.is_error ? "error" as const : "done" as const,
          };
        }
        if (event.kind === "error") {
          return {
            ...m,
            text: cleanAgentText(event.text) || m.text || "Agent error",
            status: "error" as const,
          };
        }
        return m;
      });
      return { ...session, providerSessionId, messages, updatedAt: Date.now() };
    });
    if (shouldRevealFinalNow) {
      backgroundedAssistantIdsRef.current.delete(assistantId);
    }
  };

  const loadMessageChanges = async (
    sessionId: string,
    assistantId: string,
    sessionCwd: string,
    baselineId?: string | null,
  ) => {
    if (!isTauri()) return;
    patchSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((m) =>
        m.id === assistantId
          ? { ...m, changesLoading: true, changesError: null }
          : m,
      ),
      updatedAt: Date.now(),
    }));
    try {
      const summary = await agentChangeSummary(sessionCwd || cwd || null, baselineId || null);
      patchSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                changes: summary.is_git ? summary : null,
                changeBaselineId: null,
                changesLoading: false,
                changesChecked: true,
                changesError: null,
              }
            : m,
        ),
        updatedAt: Date.now(),
      }));
    } catch (err) {
      console.warn("agent change summary failed", err);
      patchSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                changesLoading: false,
                changesError: String(err),
              }
            : m,
        ),
        updatedAt: Date.now(),
      }));
    }
  };

  const undoMessageChanges = async (sessionId: string, messageId: string, summary: AgentChangeSummary) => {
    if (!summary.patch.trim()) return;
    try {
      await agentUndoChanges(summary.cwd || cwd, summary.patch);
      const refreshed = await agentChangeSummary(summary.cwd || cwd || null);
      patchSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) =>
          m.id === messageId
            ? { ...m, changes: { ...refreshed, undo_applied: true } }
            : m,
        ),
        updatedAt: Date.now(),
      }));
    } catch (err) {
      const message = String(err);
      patchSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) =>
          m.id === messageId
            ? { ...m, changes: { ...summary, undo_error: message } }
            : m,
        ),
        updatedAt: Date.now(),
      }));
    }
  };

  const toggleReview = (messageId: string, open?: boolean) => {
    setReviewOpenById((prev) => ({ ...prev, [messageId]: open ?? !prev[messageId] }));
  };

  const toggleFileDiff = (messageId: string, filePath: string) => {
    const key = `${messageId}:${filePath}`;
    setExpandedDiffByKey((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllDiffs = (messageId: string, summary: AgentChangeSummary, open: boolean) => {
    setReviewOpenById((prev) => ({ ...prev, [messageId]: open }));
    setExpandedDiffByKey((prev) => {
      const next = { ...prev };
      summary.files.forEach((file) => {
        next[`${messageId}:${file.path}`] = open;
      });
      return next;
    });
  };

  const renderChangeSummary = (message: ChatMessage) => {
    const summary = message.changes;
    const canLoadChanges = Boolean(message.changeBaselineId);
    if (!summary || (!summary.files.length && !summary.undo_applied)) {
      if (!canLoadChanges && !message.changesLoading && !message.changesChecked && !message.changesError) return null;
      return (
        <div className={cls("atelier-change-panel atelier-change-panel-compact mt-3", dark ? "atelier-change-panel-dark" : "")}>
          <div className="atelier-change-header">
            <div className="atelier-change-title">
              <span>{message.changesChecked ? copy.noChanges : copy.reviewReady}</span>
            </div>
            {(!message.changesChecked || message.changesError) && (
              <div className="atelier-change-actions">
                <button
                  type="button"
                  disabled={message.changesLoading || !active || !canLoadChanges}
                  onClick={() =>
                    active && loadMessageChanges(
                      active.id,
                      message.id,
                      message.changeCwd || active.cwd || cwd,
                      message.changeBaselineId || null,
                    )
                  }
                >
                  {message.changesLoading ? copy.reviewingChanges : copy.reviewChanges} ↗
                </button>
              </div>
            )}
          </div>
          {message.changesError && (
            <div className="atelier-change-error">{message.changesError}</div>
          )}
        </div>
      );
    }
    if (!summary.scope && !summary.undo_applied) return null;
    const allOpen = summary.files.length > 0
      && summary.files.every((file) => expandedDiffByKey[`${message.id}:${file.path}`]);
    return (
      <div className={cls("atelier-change-panel mt-3", dark ? "atelier-change-panel-dark" : "")}>
        <div className="atelier-change-header">
          <div className="atelier-change-title">
            <span>{copy.changedFiles(summary.files.length)}</span>
            <span className="atelier-change-add">+{summary.additions}</span>
            <span className="atelier-change-del">-{summary.deletions}</span>
          </div>
          <div className="atelier-change-actions">
            <button
              type="button"
              disabled={!summary.patch.trim() || summary.undo_applied}
              onClick={() => active && undoMessageChanges(active.id, message.id, summary)}
              title={copy.undo}
            >
              {copy.undo} ↶
            </button>
            <button type="button" onClick={() => toggleReview(message.id, true)}>
              {copy.review} ↗
            </button>
            <button type="button" onClick={() => setAllDiffs(message.id, summary, !allOpen)}>
              {allOpen ? copy.collapseAll : copy.expandAll} ↕
            </button>
          </div>
        </div>
        {summary.files.map((file) => {
          const key = `${message.id}:${file.path}`;
          const open = reviewOpenById[message.id] || expandedDiffByKey[key];
          return (
            <div className="atelier-change-file" key={file.path}>
              <button type="button" className="atelier-change-row" onClick={() => toggleFileDiff(message.id, file.path)}>
                <span className="atelier-change-path">{file.path}</span>
                <span className="atelier-change-add">+{file.additions}</span>
                <span className="atelier-change-del">-{file.deletions}</span>
                <span className={cls("atelier-change-chevron", open ? "atelier-change-chevron-open" : "")}>⌄</span>
              </button>
              {open && (
                <pre className="atelier-change-diff">
                  {file.diff.trim() || copy.noDiff}
                </pre>
              )}
            </div>
          );
        })}
        {summary.undo_applied && (
          <div className="atelier-change-note">{copy.undoDone}</div>
        )}
        {summary.undo_error && (
          <div className="atelier-change-error">{copy.undoFailed(summary.undo_error)}</div>
        )}
      </div>
    );
  };

  // codex/claude 스타일: "Ns 동안 작업 중입니다" + 현재 활동 한 줄
  const renderAgentActivity = (message: ChatMessage) => {
    if (message.role !== "assistant" || message.status !== "streaming") return null;
    const last = message.activities?.length
      ? message.activities[message.activities.length - 1]
      : null;
    const elapsedSec = Math.max(0, Math.floor((nowTickMs - message.createdAt) / 1000));
    const elapsedLabel = tw.language === "en"
      ? `Working for ${elapsedSec}s`
      : `${elapsedSec}s 동안 작업 중입니다`;
    const fallbackLabel = tw.language === "en" ? "Thinking" : "생각 중";
    const currentLabel = last?.label || fallbackLabel;
    const icon = !last || last.kind === "thinking" ? "…" : I.terminal;
    return (
      <div className="atelier-activity-codex" aria-live="polite">
        <div className="atelier-activity-elapsed">{elapsedLabel}</div>
        <div className="atelier-activity-line atelier-activity-active">
          <span className="atelier-activity-icon" aria-hidden="true">{icon}</span>
          <span className="atelier-activity-label">{currentLabel}</span>
        </div>
      </div>
    );
  };

  const renderAgentLogs = (message: ChatMessage) => {
    if (message.role !== "assistant" || !message.rawEvents?.length) return null;
    const open = Boolean(logsOpenById[message.id]);
    return (
      <div className="atelier-log-shell">
        <button
          type="button"
          className={cls("atelier-log-toggle", dark ? "atelier-log-toggle-dark" : "")}
          onClick={() => setLogsOpenById((prev) => ({ ...prev, [message.id]: !prev[message.id] }))}
        >
          {open ? copy.hideLogs : copy.showLogs} · {message.rawEvents.length}
        </button>
        {open && (
          <pre className={cls("atelier-log-panel", dark ? "atelier-log-panel-dark" : "")}>
            {message.rawEvents.slice(-40).join("\n")}
          </pre>
        )}
      </div>
    );
  };

  const handleAttachmentPaste = async (event: React.ClipboardEvent<HTMLElement>) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    const nativeEvent = event.nativeEvent as ClipboardEvent & { stopImmediatePropagation?: () => void };
    nativeEvent.stopImmediatePropagation?.();

    setPasteError(null);
    setIsPastingImage(true);
    try {
      const attachments: ChatAttachment[] = [];
      for (const item of imageItems) {
        const blob = item.getAsFile();
        if (!blob) continue;
        const pngBytes = await imageBlobToPngBytes(blob);
        const path = await clipboardSaveImage(pngBytes);
        attachments.push({
          id: nowId("attachment"),
          kind: "image",
          name: attachmentFileName(path),
          path,
          size: pngBytes.byteLength,
          mime: "image/png",
        });
      }
      if (attachments.length > 0) {
        setPendingAttachments((prev) => [...prev, ...attachments]);
      }
    } catch (err) {
      setPasteError(copy.imagePasteFailed(String(err)));
    } finally {
      setIsPastingImage(false);
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  };

  const localAssistantMessage = (sessionId: string, userText: string, assistantText: string) => {
    const createdAt = Date.now();
    patchSession(sessionId, (session) => ({
      ...session,
      messages: [
        ...(busyTurnIdsRef.current[sessionId] ? session.messages : finalizeOrphanedStreamingMessages(session.messages)),
        { id: nowId("user"), role: "user", text: userText, createdAt, status: "done" },
        { id: nowId("assistant"), role: "assistant", text: assistantText, createdAt, status: "done" },
      ],
      updatedAt: createdAt,
    }));
  };

  const installWorkspacePlugin = async (plugin: WorkspacePluginSpec) => {
    if (pluginInstallState[plugin.id]?.status === "installing") return;
    setPluginInstallState((prev) => ({
      ...prev,
      [plugin.id]: { status: "installing" },
    }));
    try {
      const result = await academicResearchInstallClaudePlugin();
      setPluginInstallState((prev) => ({
        ...prev,
        [plugin.id]: {
          status: result.installed ? "installed" : "error",
          message: result.message,
        },
      }));
    } catch (err) {
      setPluginInstallState((prev) => ({
        ...prev,
        [plugin.id]: {
          status: "error",
          message: String(err),
        },
      }));
    }
  };

  const queueSummaryText = (session: AgentSession) => {
    const queued = session.queuedTurns || [];
    if (queued.length === 0) return copy.queueEmpty;
    return queued
      .map((turn, index) => `${index + 1}. ${clipActivityText(turn.text, 96)}`)
      .join("\n");
  };

  const providerCommandLabel = (provider: AgentProvider) => {
    if (provider === "hermes") return "Hermes";
    if (provider === "codex") return "Codex";
    return "Claude";
  };

  const providerOnlyMessage = (provider: AgentProvider) => {
    const label = providerCommandLabel(provider);
    return tw.language === "en"
      ? `This command is available in ${label} sessions.`
      : `이 명령은 ${label} 작업에서 사용할 수 있습니다.`;
  };

  const formatCliCommandResult = (
    provider: AgentProvider,
    args: string[],
    result: Awaited<ReturnType<typeof agentCliCommand>>,
  ) => {
    const label = providerCommandLabel(provider);
    const commandLine = [label.toLowerCase(), ...args].join(" ");
    const header = result.timed_out
      ? (tw.language === "en" ? `${label} command timed out: ${commandLine}` : `${label} 명령 시간이 초과되었습니다: ${commandLine}`)
      : result.success
        ? (tw.language === "en" ? `${label} command completed: ${commandLine}` : `${label} 명령 완료: ${commandLine}`)
        : (tw.language === "en" ? `${label} command failed: ${commandLine}` : `${label} 명령 실패: ${commandLine}`);
    const output = stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
    if (!output) return header;
    const structured = structuredCliOutput(provider, args, output, tw.language);
    if (structured) return `${header}\n\n${structured}`;
    return `${header}\n\n\`\`\`\n${clipBlockText(output)}\n\`\`\``;
  };

  const runProviderCliSlashCommand = async (session: AgentSession, rawText: string, args: string[]) => {
    if (args.length === 0) {
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en" ? "Usage: /<provider> <command>" : "사용법: /<provider> <command>",
      );
      return;
    }
    try {
      const result = await agentCliCommand({
        provider: session.provider,
        args,
        cwd: session.cwd || cwd,
      });
      localAssistantMessage(session.id, rawText, formatCliCommandResult(session.provider, args, result));
    } catch (err) {
      localAssistantMessage(
        session.id,
        rawText,
        `${providerCommandLabel(session.provider)} ${tw.language === "en" ? "command failed" : "명령 실패"}: ${String(err)}`,
      );
    }
  };

  const parseQuePrefixedMessage = (rawText: string) => {
    const trimmed = rawText.trim();
    const match = trimmed.match(/^\/que\s+([\s\S]+)$/i);
    if (!match) return null;
    const body = match[1].trim();
    if (!body) return null;
    if (/^(?:on|off|clear|run)$/i.test(body)) return null;
    return body;
  };

  const parseGoalPrefixedMessage = (rawText: string) => {
    const trimmed = rawText.trim();
    const match = trimmed.match(/^\/goal\s+([\s\S]+)$/i);
    if (!match) return null;
    const body = match[1].trim();
    if (!body) return null;
    return body;
  };

  const applySlashCommand = (command: SlashCommandSpec) => {
    setInput(command.insert);
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const cursor = command.insert.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const startNextQueuedTurn = (sessionId: string) => {
    window.setTimeout(() => {
      if (busyTurnIdsRef.current[sessionId]) return;
      const session = sessionsRef.current.find((item) => item.id === sessionId);
      const nextTurn = session?.queuedTurns?.[0];
      if (!session || !nextTurn) return;
      patchSession(sessionId, (current) => ({
        ...current,
        queuedTurns: (current.queuedTurns || []).filter((turn) => turn.id !== nextTurn.id),
        updatedAt: Date.now(),
      }));
      runAgentTurn(sessionId, nextTurn).catch(console.error);
    }, 0);
  };

  const handleSlashCommand = async (session: AgentSession, rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed.startsWith("/")) return false;

    const [commandToken = "", ...rest] = trimmed.split(/\s+/);
    const command = commandToken.toLowerCase();
    const arg = rest.join(" ").trim();

    if (command === "/help") {
      const hermesProvider = session.provider === "hermes"
        ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
        : DEFAULT_HERMES_PROVIDER;
      const options = modelOptionsFor(session.provider, session.model || providerMeta(session.provider).defaultModel, hermesProvider);
      const help = slashCommandsFor(session.provider, hermesProvider, options)
        .map((item) => {
          const detail = tw.language === "en" ? item.detailEn : item.detailKo;
          return `${item.command} - ${detail}`;
        })
        .join("\n");
      localAssistantMessage(session.id, rawText, `${tw.language === "en" ? "Slash commands" : "슬래시 명령어"}:\n${help}`);
      return true;
    }

    if (command === "/goal") {
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en"
          ? "Usage: /goal <objective>"
          : "사용법: /goal <목표>",
      );
      return true;
    }

    if (command === "/ars-install-claude") {
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en"
          ? "Installing the native Claude Code Academic Research Skills plugin..."
          : "Claude Code용 Academic Research Skills 원본 플러그인을 설치하는 중입니다...",
      );
      try {
        const result = await academicResearchInstallClaudePlugin();
        localAssistantMessage(
          session.id,
          rawText,
          [
            result.message,
            "",
            result.enabled
              ? (tw.language === "en" ? "Claude plugin is enabled. Open a new Claude session if it does not appear immediately." : "Claude 플러그인이 활성화되었습니다. 바로 보이지 않으면 새 Claude 작업을 열면 됩니다.")
              : (tw.language === "en" ? "Installed, but Claude reported it may still be disabled. Use /plugin on academic-research-skills in a Claude session." : "설치는 됐지만 Claude가 비활성 상태로 보고할 수 있습니다. Claude 작업에서 /plugin on academic-research-skills를 실행하세요."),
          ].join("\n"),
        );
      } catch (err) {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en"
            ? `Claude plugin install failed: ${String(err)}`
            : `Claude 플러그인 설치 실패: ${String(err)}`,
        );
      }
      return true;
    }

    if (command === "/stella") {
      patchSession(session.id, (current) => ({ ...current, stellaOntologyMode: "stella", updatedAt: Date.now() }));
      localAssistantMessage(session.id, rawText, copy.stellaModeOn);
      return true;
    }

    if (command === "/mode") {
      const requested = arg.toLowerCase();
      if (!isStellaOntologyMode(requested)) {
        localAssistantMessage(session.id, rawText, copy.modeUsage);
        return true;
      }
      patchSession(session.id, (current) => ({ ...current, stellaOntologyMode: requested, updatedAt: Date.now() }));
      localAssistantMessage(
        session.id,
        rawText,
        copy.modeChanged(labelForStellaOntologyMode(requested, tw.language)),
      );
      return true;
    }

    if (command === "/que" && !arg) {
      const nextMode = !session.queueMode;
      patchSession(session.id, (current) => ({ ...current, queueMode: nextMode, updatedAt: Date.now() }));
      localAssistantMessage(session.id, rawText, nextMode ? copy.queueModeOn : copy.queueModeOff);
      return true;
    }

    if (command === "/queue" || command === "/que") {
      if (arg === "on" || arg === "off") {
        const nextMode = arg === "on";
        patchSession(session.id, (current) => ({ ...current, queueMode: nextMode, updatedAt: Date.now() }));
        localAssistantMessage(session.id, rawText, nextMode ? copy.queueModeOn : copy.queueModeOff);
        return true;
      }
      if (arg === "clear") {
        patchSession(session.id, (current) => ({
          ...current,
          queuedTurns: [],
          messages: current.messages.map((message) =>
            message.status === "queued" ? { ...message, status: "error" as const } : message,
          ),
          updatedAt: Date.now(),
        }));
        localAssistantMessage(session.id, rawText, copy.queueCleared);
        return true;
      }
      if (arg === "run") {
        if (!busyTurnIdsRef.current[session.id]) {
          startNextQueuedTurn(session.id);
          localAssistantMessage(session.id, rawText, copy.queueRunStarted);
        } else {
          localAssistantMessage(session.id, rawText, copy.queueAdded);
        }
        return true;
      }
      localAssistantMessage(session.id, rawText, queueSummaryText(session));
      return true;
    }

    if (command === "/model") {
      const hermesProvider = session.provider === "hermes"
        ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
        : DEFAULT_HERMES_PROVIDER;
      const options = modelOptionsFor(session.provider, session.model || providerMeta(session.provider).defaultModel, hermesProvider);
      if (!arg) {
        const list = options.map((option) => `- ${option.value} (${option.label})`).join("\n");
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? `Available models:\n${list}` : `사용 가능한 모델:\n${list}`,
        );
        return true;
      }
      const requested = findModelOptionValue(options, arg) || arg;
      const nextHermesProvider = session.provider === "hermes"
        ? inferHermesProviderFromModel(requested)
        : hermesProvider;
      const nextModel = session.provider === "hermes"
        ? normalizeHermesModel(nextHermesProvider, requested)
        : normalizeModel(session.provider, requested);
      patchSession(session.id, (current) => ({
        ...current,
        model: nextModel,
        hermesProvider: current.provider === "hermes" ? nextHermesProvider : current.hermesProvider,
        providerSessionId: current.model !== nextModel || current.hermesProvider !== nextHermesProvider
          ? undefined
          : current.providerSessionId,
        providerSessionModel: current.model !== nextModel || current.hermesProvider !== nextHermesProvider
          ? undefined
          : current.providerSessionModel,
        providerSessionHermesProvider: current.model !== nextModel || current.hermesProvider !== nextHermesProvider
          ? undefined
          : current.providerSessionHermesProvider,
        updatedAt: Date.now(),
      }));
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en" ? `Model changed: ${nextModel}` : `모델을 변경했습니다: ${nextModel}`,
      );
      return true;
    }

    if (command === "/hermes" || command === "/claude" || command === "/codex") {
      const provider = command.slice(1) as AgentProvider;
      if (session.provider !== provider) {
        localAssistantMessage(session.id, rawText, providerOnlyMessage(provider));
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, splitCliArgs(arg));
      return true;
    }

    if (command === "/plugins") {
      if (session.provider !== "hermes" && session.provider !== "claude") {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "/plugins is available in Claude and Hermes sessions." : "/plugins는 Claude/Hermes 작업에서 사용할 수 있습니다.",
        );
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["plugins", "list"]);
      return true;
    }

    if (command === "/plugin") {
      if (session.provider !== "hermes" && session.provider !== "claude") {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en"
            ? "Codex does not expose plugin on/off here. Use /features or /codex plugin marketplace --help."
            : "Codex 플러그인 on/off는 여기서 제공되지 않습니다. /features 또는 /codex plugin marketplace --help를 사용하세요.",
        );
        return true;
      }
      const [mode = "", name = ""] = rest;
      const action = mode === "on" || mode === "enable" ? "enable" : mode === "off" || mode === "disable" ? "disable" : "";
      if (!action || !name) {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "Usage: /plugin on|off <name>" : "사용법: /plugin on|off <name>",
        );
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["plugins", action, name]);
      return true;
    }

    if (command === "/tools") {
      if (session.provider !== "hermes") {
        localAssistantMessage(session.id, rawText, providerOnlyMessage("hermes"));
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["tools", "list"]);
      return true;
    }

    if (command === "/tool") {
      if (session.provider !== "hermes") {
        localAssistantMessage(session.id, rawText, providerOnlyMessage("hermes"));
        return true;
      }
      const [mode = "", name = ""] = rest;
      const action = mode === "on" || mode === "enable" ? "enable" : mode === "off" || mode === "disable" ? "disable" : "";
      if (!action || !name) {
        localAssistantMessage(session.id, rawText, tw.language === "en" ? "Usage: /tool on|off <name>" : "사용법: /tool on|off <name>");
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["tools", action, name]);
      return true;
    }

    if (command === "/skills") {
      if (session.provider !== "hermes") {
        localAssistantMessage(session.id, rawText, providerOnlyMessage("hermes"));
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["skills", "list"]);
      return true;
    }

    if (command === "/mcp") {
      await runProviderCliSlashCommand(session, rawText, ["mcp", "list"]);
      return true;
    }

    if (command === "/doctor") {
      if (session.provider !== "hermes" && session.provider !== "claude") {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "/doctor is available in Claude and Hermes sessions." : "/doctor는 Claude/Hermes 작업에서 사용할 수 있습니다.",
        );
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["doctor"]);
      return true;
    }

    if (command === "/logs") {
      if (session.provider !== "hermes") {
        localAssistantMessage(session.id, rawText, providerOnlyMessage("hermes"));
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["logs"]);
      return true;
    }

    if (command === "/status") {
      if (session.provider !== "hermes") {
        localAssistantMessage(session.id, rawText, providerOnlyMessage("hermes"));
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["status"]);
      return true;
    }

    if (command === "/auth" && arg === "status") {
      if (session.provider !== "claude") {
        localAssistantMessage(session.id, rawText, providerOnlyMessage("claude"));
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["auth", "status"]);
      return true;
    }

    if (command === "/login" && arg === "status") {
      if (session.provider !== "codex") {
        localAssistantMessage(session.id, rawText, providerOnlyMessage("codex"));
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["login", "status"]);
      return true;
    }

    if (command === "/features") {
      if (session.provider !== "codex") {
        localAssistantMessage(session.id, rawText, providerOnlyMessage("codex"));
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["features", "list"]);
      return true;
    }

    if (command === "/feature") {
      if (session.provider !== "codex") {
        localAssistantMessage(session.id, rawText, providerOnlyMessage("codex"));
        return true;
      }
      const [mode = "", name = ""] = rest;
      const action = mode === "on" || mode === "enable" ? "enable" : mode === "off" || mode === "disable" ? "disable" : "";
      if (!action || !name) {
        localAssistantMessage(session.id, rawText, tw.language === "en" ? "Usage: /feature on|off <name>" : "사용법: /feature on|off <name>");
        return true;
      }
      await runProviderCliSlashCommand(session, rawText, ["features", action, name]);
      return true;
    }

    if (command === "/permission") {
      if (!arg || !isPermissionMode(arg)) {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "Usage: /permission basic|auto|full" : "사용법: /permission basic|auto|full",
        );
        return true;
      }
      patchSession(session.id, (current) => ({ ...current, permissionMode: arg, updatedAt: Date.now() }));
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en"
          ? `Permission changed: ${labelForPermissionMode(arg, "en")}`
          : `권한을 변경했습니다: ${labelForPermissionMode(arg, "ko")}`,
      );
      return true;
    }

    if (command === "/provider") {
      if (session.provider !== "hermes") {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "/provider is available in Hermes sessions." : "/provider는 Hermes 작업에서 사용할 수 있습니다.",
        );
        return true;
      }
      if (!arg || !isHermesProvider(arg)) {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en"
            ? "Usage: /provider anthropic|openai-codex|openrouter"
            : "사용법: /provider anthropic|openai-codex|openrouter",
        );
        return true;
      }
      const nextModel = defaultHermesModel(arg);
      patchSession(session.id, (current) => ({
        ...current,
        hermesProvider: arg,
        model: nextModel,
        providerSessionId: undefined,
        providerSessionModel: undefined,
        providerSessionHermesProvider: undefined,
        updatedAt: Date.now(),
      }));
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en"
          ? `Hermes provider changed: ${arg} · ${nextModel}`
          : `Hermes provider를 변경했습니다: ${arg} · ${nextModel}`,
      );
      return true;
    }

    if (command === "/effort") {
      if (session.provider !== "codex") {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "/effort is available in Codex CLI sessions." : "/effort는 Codex CLI 작업에서 사용할 수 있습니다.",
        );
        return true;
      }
      if (!arg || !isCodexEffort(arg)) {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "Usage: /effort low|medium|high|xhigh" : "사용법: /effort low|medium|high|xhigh",
        );
        return true;
      }
      patchSession(session.id, (current) => ({ ...current, codexEffort: arg, updatedAt: Date.now() }));
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en" ? `Codex effort changed: ${arg}` : `Codex 추론 강도를 변경했습니다: ${arg}`,
      );
      return true;
    }

    if (command === "/speed") {
      if (session.provider !== "codex") {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "/speed is available in Codex CLI sessions." : "/speed는 Codex CLI 작업에서 사용할 수 있습니다.",
        );
        return true;
      }
      if (!arg || !isCodexSpeed(arg)) {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "Usage: /speed default|fast" : "사용법: /speed default|fast",
        );
        return true;
      }
      patchSession(session.id, (current) => ({ ...current, codexSpeed: arg, updatedAt: Date.now() }));
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en" ? `Codex speed changed: ${arg}` : `Codex 속도를 변경했습니다: ${arg}`,
      );
      return true;
    }

    if (command === "/preview") {
      if (!arg) {
        localAssistantMessage(session.id, rawText, tw.language === "en" ? "Usage: /preview <url>" : "사용법: /preview <url>");
        return true;
      }
      loadPreviewUrl(arg, { reveal: true });
      localAssistantMessage(session.id, rawText, `${copy.preview}: ${arg}`);
      return true;
    }

    if (command === "/cwd") {
      if (!arg) {
        localAssistantMessage(session.id, rawText, tw.language === "en" ? "Usage: /cwd <path>" : "사용법: /cwd <path>");
        return true;
      }
      setCwd(arg);
      patchSession(session.id, (current) => ({ ...current, cwd: arg, updatedAt: Date.now() }));
      localAssistantMessage(session.id, rawText, `${copy.cwd}: ${arg}`);
      return true;
    }

    localAssistantMessage(session.id, rawText, copy.slashUnknown(commandToken));
    return true;
  };

  const runAgentTurn = async (sessionId: string, payload: QueuedAgentTurn) => {
    if (busyTurnIdsRef.current[sessionId]) return;
    const session = sessionsRef.current.find((item) => item.id === sessionId);
    if (!session) return;
    const meta = providerMeta(session.provider);
    const assistantId = nowId("assistant");
    const turnId = nowId("turn");
    const runCwd = payload.cwd || session.cwd || cwd;
    const fastPatchTask = isFastPatchTask(payload.text);
    const hermesProvider = session.provider === "hermes"
      ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
      : null;
    const runModel = session.provider === "hermes"
      ? normalizeHermesModel(hermesProvider || DEFAULT_HERMES_PROVIDER, session.model || meta.defaultModel)
      : normalizeModel(session.provider, session.model || meta.defaultModel);
    const useHermesCodexFastPath = session.provider === "hermes" && hermesProvider === "openai-codex";
    const hermesResumeMatches = session.provider === "hermes"
      && Boolean(session.providerSessionId)
      && session.providerSessionModel === runModel
      && session.providerSessionHermesProvider === hermesProvider;
    const resumeSessionId = session.provider === "hermes"
      ? (useHermesCodexFastPath || !hermesResumeMatches ? null : session.providerSessionId || null)
      : session.providerSessionId || null;
    const previewContext = sessionId === activeIdRef.current
      ? formatPreviewPromptContext(tw.language, previewUrl, previewCheck, previewDiagnostics, previewService)
      : null;
    const devScreenContext = sessionId === activeIdRef.current
      ? formatDevScreenPromptContext(
          tw.language,
          devScreenStatusResult,
          devScreenSnapshotResult,
          devScreenCheckResult,
          devScreenActionResult,
          devScreenError,
        )
      : null;
    const compactContext = useHermesCodexFastPath
      ? formatCompactAgentContext(session.messages, tw.language, payload.userMessageId)
      : null;
    const visualContext = [previewContext, devScreenContext, compactContext].filter(Boolean).join("\n\n") || null;

    backgroundedAssistantIdsRef.current.delete(assistantId);
    autoScrollRef.current = true;
    setBusyForSession(sessionId, turnId);
    patchSession(sessionId, (s) => ({
      ...s,
      cwd: runCwd,
      messages: finalizeOrphanedStreamingMessages(s.messages)
        .map((message) =>
          message.id === payload.userMessageId ? { ...message, status: "done" as const } : message,
        )
        .concat({ id: assistantId, role: "assistant", text: "", createdAt: Date.now(), status: "streaming" }),
      updatedAt: Date.now(),
    }));

    let unlisten: (() => void) | undefined;
    try {
      if (isTauri()) {
        const changeBaseline = fastPatchTask
          ? null
          : await captureChangeBaselineForTurn(runCwd || null, CHANGE_BASELINE_TIMEOUT_MS);
        unlisten = await onAgentEvent(turnId, (event) => handleAgentEvent(sessionId, assistantId, event));
        const result = await agentSend({
          provider: session.provider,
          turnId,
          prompt: formatOntologyAgentPrompt(
            payload.text,
            tw.language,
            visualContext,
            payload.attachments,
            normalizeStellaOntologyMode(session.stellaOntologyMode, session.provider),
            session.provider,
            runCwd,
          ),
          resumeSessionId,
          cwd: runCwd || null,
          model: runModel,
          hermesProvider,
          effort: session.provider === "codex" ? (fastPatchTask ? "low" : normalizeCodexEffort(session.codexEffort)) : null,
          speed: session.provider === "codex" ? (fastPatchTask ? "fast" : normalizeCodexSpeed(session.codexSpeed)) : null,
          permissionMode: normalizePermissionMode(session.permissionMode),
        });
        flushAgentStream(assistantId);
        delete pendingStreamRef.current[assistantId];
        const wasInterrupted = interruptedTurnIdsRef.current.has(turnId);
        let finalTextForReveal = "";
        const fallbackRawEvents = result.raw_events.slice(-MAX_RAW_EVENTS).map(clipRawEvent);
        patchSession(sessionId, (s) => ({
          ...s,
          providerSessionId: result.provider_session_id || (resumeSessionId ? s.providerSessionId : undefined),
          providerSessionModel: result.provider_session_id
            ? runModel
            : (resumeSessionId ? s.providerSessionModel : undefined),
          providerSessionHermesProvider: session.provider === "hermes"
            ? (result.provider_session_id
                ? hermesProvider || undefined
                : (resumeSessionId ? s.providerSessionHermesProvider : undefined))
            : s.providerSessionHermesProvider,
          messages: s.messages.map((m) =>
            {
              if (m.id !== assistantId) return m;
              const existingRawEvents = m.rawEvents || [];
              const messageRawEvents = existingRawEvents.length ? existingRawEvents : fallbackRawEvents;
              return {
                  ...m,
                  text: (() => {
                    finalTextForReveal = cleanAgentText(result.text)
                    || cleanAgentText(m.text)
                    || (wasInterrupted ? copy.interruptedResponse : "")
                    || cleanAgentText(result.error)
                    || (result.is_error ? `실행 실패: ${result.error || "Agent error"}` : copy.noResponse);
                    return finalTextForReveal;
                  })(),
                  status: wasInterrupted ? "done" : result.is_error ? "error" : "done",
                  rawEvents: messageRawEvents.length ? messageRawEvents.slice(-MAX_RAW_EVENTS) : m.rawEvents,
                  changeBaselineId: !result.is_error && !wasInterrupted ? changeBaseline?.id || null : null,
                  changeCwd: !result.is_error && !wasInterrupted ? runCwd : m.changeCwd,
                  changes: !result.is_error && !wasInterrupted ? null : m.changes,
                  changesLoading: false,
                  changesChecked: false,
                  changesError: null,
              };
            },
          ),
          updatedAt: Date.now(),
        }));
        if (finalTextForReveal && (!isWorkspaceForeground() || backgroundedAssistantIdsRef.current.has(assistantId))) {
          revealMessageImmediately(assistantId, finalTextForReveal);
        }
        backgroundedAssistantIdsRef.current.delete(assistantId);
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        patchSession(sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? { ...m, text: "Tauri 런타임에서 선택한 에이전트 adapter가 연결됩니다.", status: "done" }
              : m,
          ),
        }));
      }
    } catch (err) {
      flushAgentStream(assistantId);
      delete pendingStreamRef.current[assistantId];
      const wasInterrupted = interruptedTurnIdsRef.current.has(turnId);
      let finalTextForReveal = "";
      patchSession(sessionId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: (() => {
                  finalTextForReveal = cleanAgentText(m.text)
                    || (wasInterrupted ? copy.interruptedResponse : `실행 실패: ${String(err)}`);
                  return finalTextForReveal;
                })(),
                status: wasInterrupted ? "done" : "error",
              }
            : m,
        ),
      }));
      if (finalTextForReveal && (!isWorkspaceForeground() || backgroundedAssistantIdsRef.current.has(assistantId))) {
        revealMessageImmediately(assistantId, finalTextForReveal);
      }
      backgroundedAssistantIdsRef.current.delete(assistantId);
    } finally {
      unlisten?.();
      flushAgentStream(assistantId);
      delete pendingStreamRef.current[assistantId];
      interruptedTurnIdsRef.current.delete(turnId);
      setBusyForSession(sessionId, null);
      startNextQueuedTurn(sessionId);
    }
  };

  const send = async () => {
    const text = input.trim();
    const attachments = pendingAttachments;
    const userText = text || (attachments.length > 0 ? copy.imageOnlyPrompt : "");
    if ((!userText && attachments.length === 0) || isPastingImage) return;
    const quePrefixedText = attachments.length === 0 ? parseQuePrefixedMessage(userText) : null;
    const goalPrefixedText = parseGoalPrefixedMessage(userText);
    const session = active || (() => {
      const initialTitle = goalPrefixedText || quePrefixedText || userText;
      const fresh = makeSession(
        fallbackProfile,
        fallbackProvider,
        initialTitle.slice(0, 42),
      );
      const nextSessions = [fresh, ...sessionsRef.current];
      sessionsRef.current = nextSessions;
      persistSessionsSoon(nextSessions);
      setSessions(nextSessions);
      activeIdRef.current = fresh.id;
      setActiveId(fresh.id);
      return fresh;
    })();
    const academicResearchRequest = !quePrefixedText && !goalPrefixedText && attachments.length === 0
      ? parseAcademicResearchCommand(userText, tw.language, session.provider)
      : null;
    const turnText = quePrefixedText
      ? quePrefixedText
      : goalPrefixedText
        ? buildGoalPrompt(goalPrefixedText, tw.language)
        : academicResearchRequest
          ? academicResearchRequest.prompt
          : userText;
    const visibleUserText = userText;

    setInput("");
    setPendingAttachments([]);
    setPasteError(null);

    if (!quePrefixedText && !goalPrefixedText && !academicResearchRequest && attachments.length === 0 && await handleSlashCommand(session, userText)) return;

    const createdAt = Date.now();
    const payload: QueuedAgentTurn = {
      id: nowId("queued-turn"),
      userMessageId: nowId("user"),
      text: turnText,
      displayText: visibleUserText,
      attachments,
      cwd,
      createdAt,
    };
    const isBusy = Boolean(busyTurnIdsRef.current[session.id]);
    const queueMode = Boolean(session.queueMode);
    const shouldQueue = isBusy && (queueMode || Boolean(quePrefixedText));
    patchSession(session.id, (s) => ({
      ...s,
      title: s.messages.length === 0 && !s.titleEdited
        ? (academicResearchRequest?.title || goalPrefixedText || turnText).slice(0, 48)
        : s.title,
      cwd,
      queuedTurns: isBusy
        ? shouldQueue
          ? [...(s.queuedTurns || []), payload]
          : [payload, ...(s.queuedTurns || [])]
        : (s.queuedTurns || []),
      messages: [
        ...(isBusy ? s.messages : finalizeOrphanedStreamingMessages(s.messages)),
        {
          id: payload.userMessageId,
          role: "user",
          text: payload.displayText || turnText,
          createdAt,
          status: shouldQueue ? "queued" : "done",
          attachments,
        },
      ],
      updatedAt: createdAt,
    }));

    if (isBusy) {
      if (!shouldQueue) {
        const activeTurnId = busyTurnIdsRef.current[session.id];
        if (activeTurnId && isTauri()) {
          interruptedTurnIdsRef.current.add(activeTurnId);
          agentCancel(activeTurnId).catch(console.warn);
        }
      }
      return;
    }
    await runAgentTurn(session.id, payload);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send().catch(console.error);
  };

  return (
    <div className={cls("h-full w-full flex", dark ? "bg-dbg text-dink" : "bg-cream text-ink")}>
      {showTaskList ? (
      <aside className={cls("w-[280px] shrink-0 border-r flex flex-col", dark ? "border-dline" : "border-line")}>
        <div className={cls("h-12 px-3 flex items-center gap-2 border-b relative", dark ? "border-dline" : "border-line")}>
          <div className="font-display text-[18px] font-medium flex-1">{copy.title}</div>
          <button
            type="button"
            onClick={() => setShowTaskList(false)}
            className={cls(
              "h-8 w-8 rounded-[7px] text-[14px] grid place-items-center",
              dark ? "text-dsub hover:bg-dmuted hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
            )}
            title={copy.hideTaskList}
            aria-label={copy.hideTaskList}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={handleNewSessionClick}
            className={cls(
              "h-8 px-2.5 rounded-[7px] text-[12px] font-medium inline-flex items-center gap-1.5",
              dark ? "bg-dmuted text-dink hover:bg-[#343431]" : "bg-surface text-ink hover:bg-muted",
            )}
          >
            {I.plus} {copy.newSession}
          </button>
          {showProfilePicker && (
            <div
              className={cls(
                "absolute top-11 left-3 right-3 z-20 rounded-[9px] border overflow-hidden shadow-lg",
                dark ? "bg-dsurf border-dline" : "bg-surface border-line",
              )}
            >
              {agentProfiles.length === 0 ? (
                <div className={cls("px-3 py-2.5 text-[12px] leading-[1.5]", dark ? "text-dsub" : "text-sub")}>
                  {copy.noAgentProfiles}
                </div>
              ) : (
                agentProfiles.map(({ profile, provider }) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => createSession(profile, provider)}
                    className={cls(
                      "w-full h-10 px-3 text-left text-[12px] flex items-center gap-2.5 transition-colors",
                      dark ? "text-dink hover:bg-dmuted" : "text-ink hover:bg-muted",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: normalizeAgentDotColor(profile.dot) }} />
                    <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                    <span className={cls("shrink-0 text-[10px] font-mono", dark ? "text-dsub" : "text-sub")}>
                      {providerMeta(provider).label}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-2">
          <div
            className={cls(
              "mb-2 rounded-[8px] border overflow-hidden",
              dark ? "border-dline bg-[#20201e]" : "border-line bg-surface",
            )}
          >
            <button
              type="button"
              onClick={() => setShowPluginList((v) => !v)}
              className={cls(
                "w-full h-9 px-2.5 flex items-center gap-2 text-left",
                dark ? "text-dink hover:bg-dmuted" : "text-ink hover:bg-muted",
              )}
            >
              <span className="h-5 w-5 shrink-0 grid place-items-center">{I.zap}</span>
              <span className="min-w-0 flex-1 text-[12px] font-medium truncate">{copy.plugins}</span>
              <span
                className={cls(
                  "h-5 w-5 shrink-0 grid place-items-center transition-transform",
                  showPluginList ? "rotate-180" : "",
                  dark ? "text-dsub" : "text-sub",
                )}
              >
                {I.chevron}
              </span>
            </button>
            {showPluginList && (
              <div className={cls("border-t px-2.5 py-2", dark ? "border-dline" : "border-line")}>
                <div className={cls("mb-2 text-[10.5px] leading-[1.45]", dark ? "text-dsub" : "text-sub")}>
                  {copy.pluginsHint}
                </div>
                <div className="space-y-1.5">
                  {WORKSPACE_PLUGINS.map((plugin) => {
                    const state = pluginInstallState[plugin.id]?.status || "idle";
                    const message = pluginInstallState[plugin.id]?.message || "";
                    const isInstalling = state === "installing";
                    const provider = providerMeta(plugin.provider);
                    const title = tw.language === "en" ? plugin.titleEn : plugin.titleKo;
                    const detail = tw.language === "en" ? plugin.detailEn : plugin.detailKo;
                    const actionLabel = state === "installed"
                      ? copy.pluginInstalled
                      : state === "error"
                        ? copy.pluginFailed
                        : isInstalling
                          ? copy.pluginInstalling
                          : copy.pluginInstall;
                    return (
                      <div
                        key={plugin.id}
                        className={cls(
                          "rounded-[7px] border p-2",
                          dark ? "border-dline bg-[#242421]" : "border-line bg-bg",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={cls(
                              "mt-0.5 h-5 w-5 rounded-[6px] shrink-0 grid place-items-center text-[8.5px] font-semibold tracking-normal",
                              dark ? "text-dink" : "text-ink",
                            )}
                            style={{
                              background: `${provider.dot}22`,
                              boxShadow: `inset 0 0 0 1px ${provider.dot}66`,
                            }}
                            title={provider.label}
                          >
                            {provider.short}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className={cls("truncate text-[12px] font-medium", dark ? "text-dink" : "text-ink")}>
                              {title}
                            </div>
                            <div className={cls("mt-0.5 text-[10.5px] leading-[1.4]", dark ? "text-dsub" : "text-sub")}>
                              {detail}
                            </div>
                            {message && (
                              <div className={cls("mt-1 text-[9.5px] leading-[1.35] break-words", state === "error" ? "text-red-400" : dark ? "text-dsub" : "text-sub")}>
                                {message}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => installWorkspacePlugin(plugin)}
                          disabled={isInstalling}
                          className={cls(
                            "mt-2 h-7 w-full rounded-[6px] text-[11px] font-medium transition-colors disabled:opacity-60",
                            state === "installed"
                              ? dark ? "bg-[#173427] text-[#86efac]" : "bg-[#e8f7ee] text-[#166534]"
                              : dark ? "bg-dmuted text-dink hover:bg-[#393936]" : "bg-muted text-ink hover:bg-line",
                          )}
                        >
                          {actionLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {sessions.length === 0 && (
            <div className={cls("p-3 text-[12px] leading-[1.55]", dark ? "text-dsub" : "text-sub")}>
              {copy.noMessages}
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => selectSession(s.id)}
              onDoubleClick={() => beginRename(s)}
              onKeyDown={(e) => {
                if (editingSessionId === s.id) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectSession(s.id);
                }
              }}
              role="button"
              tabIndex={0}
              className={cls(
                "group w-full text-left px-2.5 py-2 rounded-[7px] mb-1 transition-colors cursor-pointer",
                active?.id === s.id
                  ? dark ? "bg-dmuted" : "bg-surface shadow-[0_0_0_1px_#e5e3db]"
                  : dark ? "hover:bg-[#2a2a28]" : "hover:bg-muted",
              )}
              title={copy.renameHint}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cls(
                    "mt-0.5 h-5 w-5 rounded-[6px] shrink-0 grid place-items-center text-[8.5px] font-semibold tracking-normal",
                    dark ? "text-dink" : "text-ink",
                  )}
                  style={{
                    background: `${normalizeAgentDotColor(s.profileDot || providerMeta(s.provider).dot)}22`,
                    boxShadow: `inset 0 0 0 1px ${normalizeAgentDotColor(s.profileDot || providerMeta(s.provider).dot)}66`,
                  }}
                  title={s.profileName || providerMeta(s.provider).label}
                >
                  {providerMeta(s.provider).short}
                </span>
                <div className="min-w-0 flex-1">
                  {editingSessionId === s.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRename(true);
                        }
                      }}
                      className={cls(
                        "w-full h-6 px-1.5 rounded-[4px] border text-[12px] font-medium outline-none",
                        dark
                          ? "bg-dsurf border-dline text-dink"
                          : "bg-surface border-line text-ink",
                      )}
                    />
                  ) : (
                    <div className={cls("truncate text-[12px] font-medium", dark ? "text-dink" : "text-ink")}>
                      {s.title || providerMeta(s.provider).label}
                    </div>
                  )}
                  <div className={cls("mt-0.5 text-[9.5px] font-mono truncate", dark ? "text-dsub" : "text-sub")}>
                    {s.profileName || providerMeta(s.provider).label} · {s.providerSessionId ? "resume" : "new"} · {relTime(s.updatedAt)}
                  </div>
                </div>
                {isSessionRunning(s) && (
                  <span
                    className="mt-0.5 h-5 w-5 shrink-0 grid place-items-center"
                    aria-label={copy.running}
                    title={copy.running}
                  >
                    <span className="atelier-agent-spinner" />
                  </span>
                )}
                {!isSessionRunning(s) && isSessionDone(s) && (
                  <span
                    className="mt-0.5 h-5 w-5 shrink-0 grid place-items-center"
                    aria-label={copy.done}
                    title={copy.done}
                  >
                    <span className="atelier-agent-done-dot" />
                  </span>
                )}
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                  className={cls(
                    "opacity-0 group-hover:opacity-100 h-5 w-5 grid place-items-center rounded-[4px]",
                    dark ? "text-dsub hover:text-dink hover:bg-[#3d3d3b]" : "text-sub hover:text-ink hover:bg-line",
                  )}
                  title="세션 삭제"
                >
                  {I.x}
                </span>
              </div>
            </div>
          ))}
        </div>
      </aside>
      ) : (
        <aside className={cls("w-11 shrink-0 border-r flex flex-col items-center py-2", dark ? "border-dline" : "border-line")}>
          <button
            type="button"
            onClick={() => setShowTaskList(true)}
            className={cls(
              "h-8 w-8 rounded-[7px] text-[14px] grid place-items-center",
              dark ? "text-dsub hover:bg-dmuted hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
            )}
            title={copy.showTaskList}
            aria-label={copy.showTaskList}
          >
            ›
          </button>
          <div className={cls("mt-3 text-[11px] font-mono [writing-mode:vertical-rl]", dark ? "text-dsub" : "text-sub")}>
            {copy.title}
          </div>
        </aside>
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        <div className={cls("h-12 px-4 border-b flex items-center gap-3", dark ? "border-dline" : "border-line")}>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium truncate">{active?.title || active?.profileName || activeProviderMeta.label}</div>
            <div className={cls("text-[11.5px] font-mono truncate", dark ? "text-dsub" : "text-sub")}>
              {copy.subtitle}
            </div>
          </div>
          <label className={cls("text-[11px] font-mono uppercase tracking-wider", dark ? "text-dsub" : "text-sub")}>
            {copy.cwd}
          </label>
          <input
            value={cwd}
            onChange={(e) => updateWorkspaceCwd(e.target.value)}
            className={cls(
              "h-8 w-[360px] px-2.5 rounded-[6px] border text-[11px] font-mono outline-none",
              dark ? "bg-dmuted border-dline text-dink" : "bg-surface border-line text-ink",
            )}
          />
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className={cls(
              "h-8 px-2.5 rounded-[6px] text-[12px]",
              showPreview
                ? dark ? "bg-dline text-dink" : "bg-line text-ink"
                : dark ? "text-dsub hover:bg-dmuted hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
            )}
          >
            {copy.preview}
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 flex flex-col">
            <div
              ref={scrollRef}
              onScroll={handleTranscriptScroll}
              className="flex-1 min-h-0 overflow-auto px-5 py-4"
            >
              {!active || active.messages.length === 0 ? (
                <div className={cls("h-full flex items-center justify-center text-center text-[13px]", dark ? "text-dsub" : "text-sub")}>
                  <div>
                    <div className={cls("font-display text-[24px] mb-2", dark ? "text-dink" : "text-ink")}>
                      {active?.profileName || activeProviderMeta.label}
                    </div>
                    <div className="max-w-[460px] leading-[1.7]">{copy.noMessages}</div>
                  </div>
                </div>
              ) : (
                <div className="max-w-[920px] mx-auto space-y-5">
                  {active.messages.map((m) => {
                    const isAnimatedAssistant = m.role === "assistant" && animatedAssistantIdsRef.current.has(m.id);
                    const displayText = animatedAssistantIdsRef.current.has(m.id)
                      ? (visibleTextById[m.id] || "")
                      : m.text;
                    const isRevealing = isAnimatedAssistant && displayText !== m.text;
                    const useStreamingRenderer = isAnimatedAssistant && (m.status === "streaming" || isRevealing);
                    const renderedText = useStreamingRenderer
                      ? cleanStreamingText(collapseDumpyText(displayText)).replace(/\s+$/g, "")
                      : collapseDumpyText(m.text).replace(/\s+$/g, "");
                    const hasRenderedText = renderedText.trim().length > 0;
                    return (
                    <article key={m.id} className={cls("flex min-w-0 gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                      {m.role !== "user" && (
                        <div
                          className="mt-1 h-7 w-7 shrink-0 rounded-[7px] text-white grid place-items-center text-[10px] font-semibold"
                          style={{ background: normalizeAgentDotColor(active?.profileDot || activeProviderMeta.dot) }}
                        >
                          {activeProviderMeta.short}
                        </div>
                      )}
                      <div
                        className={cls(
                          "min-w-0 overflow-hidden text-[13px] break-words",
                          m.role === "user"
                            ? cls(
                                "max-w-[min(78%,760px)] rounded-[8px] px-3.5 py-2.5 border leading-[1.65]",
                                dark ? "bg-[#34312e] border-[#4a4039] text-dink" : "bg-[#fff8f2] border-[#eed7c8] text-ink",
                              )
                            : cls(
                                "flex-1 max-w-full font-mono leading-[1.55] py-1",
                                dark ? "text-dink" : "text-ink",
                              ),
                        )}
                      >
                        {hasRenderedText ? (
                          useStreamingRenderer ? (
                            <div className="atelier-streaming-text min-w-0 max-w-full" aria-live="polite">
                              {renderedText}
                              <span className="atelier-streaming-caret" aria-hidden="true" />
                            </div>
                          ) : (
                            <div className="atelier-chat-markdown min-w-0 max-w-full">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={CHAT_MARKDOWN_COMPONENTS}>
                                {renderedText}
                              </ReactMarkdown>
                            </div>
                          )
                        ) : m.role === "assistant" && m.status === "streaming" ? (
                          <span className={cls("font-mono", dark ? "text-dsub" : "text-sub")}>
                            {copy.running}...
                          </span>
                        ) : m.role === "assistant" ? (
                          <span className={cls("font-sans", dark ? "text-dsub" : "text-sub")}>
                            {copy.noResponse}
                          </span>
                        ) : null}
                        {m.attachments && m.attachments.length > 0 && (
                          <div className={cls("atelier-chat-attachments", hasRenderedText ? "mt-2" : "")}>
                            {m.attachments.map((attachment) => (
                              <div key={attachment.id} className="atelier-chat-attachment" title={attachment.path}>
                                {I.image}
                                <span>{attachment.name || attachmentFileName(attachment.path)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {m.role === "user" && m.status === "queued" && (
                          <div className={cls("mt-1 text-[10.5px] font-mono", dark ? "text-dsub" : "text-sub")}>
                            {copy.queued}
                          </div>
                        )}
                        {m.status === "streaming" && (
                          renderAgentActivity(m)
                        )}
                        {m.role === "assistant" && renderChangeSummary(m)}
                        {m.role === "assistant" && renderAgentLogs(m)}
                      </div>
                    </article>
                    );
                  })}
                </div>
              )}
            </div>

            <form
              onSubmit={onSubmit}
              onPaste={handleAttachmentPaste}
              className={cls("border-t p-3", dark ? "border-dline" : "border-line")}
            >
              <div className={cls("relative max-w-[920px] mx-auto rounded-[9px] border p-2", dark ? "bg-dmuted border-dline" : "bg-surface border-line")}>
                {(pendingAttachments.length > 0 || isPastingImage || pasteError) && (
                  <div className="atelier-attachment-tray">
                    {pendingAttachments.map((attachment) => (
                      <div key={attachment.id} className="atelier-attachment-chip" title={attachment.path}>
                        {I.image}
                        <span>{copy.attachedImage}</span>
                        <span className="atelier-attachment-name">{attachment.name}</span>
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(attachment.id)}
                          aria-label={copy.removeAttachment}
                          title={copy.removeAttachment}
                        >
                          {I.x}
                        </button>
                      </div>
                    ))}
                    {isPastingImage && <div className="atelier-attachment-status">{copy.imagePasting}</div>}
                    {pasteError && <div className="atelier-attachment-error">{pasteError}</div>}
                  </div>
                )}
	                {showSlashMenu && (
	                  <div
	                    className={cls(
	                      "atelier-slash-menu absolute left-0 right-0 bottom-full z-50 mb-2 max-h-[286px] overflow-auto rounded-[10px] border p-1.5",
	                      dark ? "atelier-slash-menu-dark text-dink" : "atelier-slash-menu-light text-ink",
	                    )}
	                    role="listbox"
	                    aria-label="Slash commands"
                  >
                    {visibleSlashCommands.map((item, index) => {
                      const selected = index === activeSlashSelection;
                      const scopeLabel = item.scope === "atelier" ? "Atelier" : providerMeta(item.scope).label;
                      const detail = tw.language === "en" ? item.detailEn : item.detailKo;
                      return (
                        <button
                          key={`${item.scope}:${item.command}`}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applySlashCommand(item);
                          }}
	                          className={cls(
	                            "atelier-slash-item w-full min-w-0 rounded-[7px] px-2.5 py-2 text-left grid grid-cols-[minmax(118px,0.6fr)_74px_minmax(0,1fr)] gap-2 items-center",
	                            selected
	                              ? dark ? "atelier-slash-item-selected-dark" : "atelier-slash-item-selected-light"
	                              : dark ? "atelier-slash-item-dark" : "atelier-slash-item-light",
	                          )}
                          role="option"
                          aria-selected={selected}
                        >
                          <span className="min-w-0 truncate font-mono text-[12px]">{item.command}</span>
                          <span className={cls("min-w-0 truncate text-[10px] uppercase tracking-wide", dark ? "text-dsub" : "text-sub")}>
                            {scopeLabel}
                          </span>
                          <span className={cls("min-w-0 truncate text-[11px]", dark ? "text-dsub" : "text-sub")}>
                            {detail}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    inputRevealPauseUntilRef.current = performance.now() + INPUT_REVEAL_PAUSE_MS;
                    setInput(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (showSlashMenu) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSlashSelection((value) => Math.min(value + 1, visibleSlashCommands.length - 1));
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setSlashSelection((value) => Math.max(value - 1, 0));
                        return;
                      }
                      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
                        e.preventDefault();
                        if (selectedSlashCommand) applySlashCommand(selectedSlashCommand);
                        return;
                      }
                    }
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      send().catch(console.error);
                    }
                  }}
                  placeholder={copy.placeholder}
                  className={cls(
                    "w-full min-h-[76px] max-h-[180px] resize-y bg-transparent outline-none text-[13px] leading-[1.6] px-1",
                    dark ? "text-dink placeholder:text-dsub" : "text-ink placeholder:text-sub",
                  )}
                />
                <div className="mt-2 flex items-center gap-2">
                  <div className={cls("flex-1 text-[12px] leading-[1.45]", dark ? "text-dsub" : "text-sub")}>
                    {busyTurnId ? copy.draftHint : "⌘/Ctrl + Enter"}
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {activeProvider === "hermes" && (
                      <>
                        <span className={cls("text-[11px] font-mono uppercase tracking-wider", dark ? "text-dsub" : "text-sub")}>
                          {copy.providerLabel}
                        </span>
                        <select
                          value={activeHermesProvider}
                          onChange={(e) => updateActiveHermesProvider(e.target.value as HermesInferenceProvider)}
                          disabled={!active || !!busyTurnId}
                          className={cls(
                            "h-8 max-w-[132px] rounded-[7px] border px-2 text-[11px] font-mono outline-none",
                            dark
                              ? "bg-dsurf border-dline text-dink disabled:text-dsub"
                              : "bg-surface border-line text-ink disabled:text-sub",
                          )}
                          aria-label={copy.providerLabel}
                          title="Hermes provider"
                        >
                          {HERMES_PROVIDERS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    <div ref={permissionMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (!active || busyTurnId) return;
                          setShowPermissionMenu((value) => !value);
                        }}
                        disabled={!active || !!busyTurnId}
                        className={cls(
                          "h-8 min-w-[112px] max-w-[148px] rounded-[7px] border px-2.5 text-[11px] font-mono outline-none flex items-center justify-between gap-2",
                          dark
                            ? "bg-dsurf border-dline text-dink disabled:text-dsub"
                            : "bg-surface border-line text-ink disabled:text-sub",
                        )}
                        aria-label={copy.permissionLabel}
                        aria-haspopup="menu"
                        aria-expanded={showPermissionMenu}
                        title={copy.permissionLabel}
                      >
                        <span className="shrink-0 opacity-80">{activePermissionOption.icon}</span>
                        <span className="truncate">{activePermissionLabel}</span>
                        <span className={cls("shrink-0 transition-transform", showPermissionMenu ? "rotate-180" : "")}>
                          {I.chevron}
                        </span>
                      </button>
                      {showPermissionMenu && (
                        <div
                          className={cls(
                            "absolute bottom-10 right-0 z-50 w-[218px] rounded-[14px] border p-2 shadow-[0_16px_44px_rgba(0,0,0,0.34)]",
                            dark
                              ? "bg-[#2c2c2b]/95 border-[#444442] text-dink backdrop-blur"
                              : "bg-[#f1efea]/95 border-[#d4d0c7] text-ink backdrop-blur",
                          )}
                          role="menu"
                        >
                          {PERMISSION_MODES.map((option) => {
                            const selected = activePermissionMode === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => updateActivePermissionMode(option.value)}
                                className={cls(
                                  "h-11 w-full rounded-[12px] px-3 flex items-center gap-3 text-[15px] text-left",
                                  selected
                                    ? dark ? "bg-[#444442] text-dink" : "bg-[#dedbd3] text-ink"
                                    : dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                                )}
                                role="menuitemradio"
                                aria-checked={selected}
                                title={tw.language === "en" ? option.detailEn : option.detailKo}
                              >
                                <span className="shrink-0 opacity-85">{option.icon}</span>
                                <span className="min-w-0 flex-1 truncate">{tw.language === "en" ? option.en : option.ko}</span>
                                {selected && <span className="text-[20px] leading-none">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <span className={cls("text-[11px] font-mono uppercase tracking-wider", dark ? "text-dsub" : "text-sub")}>
                      {copy.modelLabel}
                    </span>
                    {activeProvider === "codex" ? (
                      <div ref={modelMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (!active || busyTurnId) return;
                            setShowModelMenu((value) => !value);
                            setCodexMenuPanel("root");
                          }}
                          disabled={!active || !!busyTurnId}
                          className={cls(
                            "h-8 min-w-[134px] max-w-[190px] rounded-[7px] border px-2.5 text-[11px] font-mono outline-none flex items-center justify-between gap-2",
                            dark
                              ? "bg-dsurf border-dline text-dink disabled:text-dsub"
                              : "bg-surface border-line text-ink disabled:text-sub",
                          )}
                          aria-label={copy.modelLabel}
                          aria-haspopup="menu"
                          aria-expanded={showModelMenu}
                          title={activeProviderMeta.label}
                        >
                          <span className="truncate">{activeModelLabel}</span>
                          <span className={cls("shrink-0 transition-transform", showModelMenu ? "rotate-180" : "")}>
                            {I.chevron}
                          </span>
                        </button>
                        {showModelMenu && (
                          <div
                            className={cls(
                              "absolute bottom-10 right-0 z-50 w-[292px] rounded-[16px] border p-2 shadow-[0_16px_44px_rgba(0,0,0,0.34)]",
                              dark
                                ? "bg-[#2c2c2b]/95 border-[#444442] text-dink backdrop-blur"
                                : "bg-[#f1efea]/95 border-[#d4d0c7] text-ink backdrop-blur",
                            )}
                            role="menu"
                            data-testid="codex-model-menu"
                          >
                            {codexMenuPanel === "root" && (
                              <>
                                <div className={cls("px-3 pt-1 pb-2 text-[13px]", dark ? "text-dsub" : "text-sub")}>
                                  {copy.intelligence}
                                </div>
                                {CODEX_EFFORTS.map((option) => {
                                  const selected = activeCodexEffort === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => updateActiveCodexEffort(option.value)}
                                      className={cls(
                                        "h-10 w-full rounded-[12px] px-3 flex items-center justify-between text-[15px] text-left",
                                        selected
                                          ? dark ? "bg-[#444442] text-dink" : "bg-[#dedbd3] text-ink"
                                          : dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                                      )}
                                      role="menuitemradio"
                                      aria-checked={selected}
                                    >
                                      <span>{tw.language === "en" ? option.en : option.ko}</span>
                                      {selected && <span className="text-[20px] leading-none">✓</span>}
                                    </button>
                                  );
                                })}
                                <div className={cls("my-2 border-t", dark ? "border-[#444442]" : "border-[#d8d4cc]")} />
                                <button
                                  type="button"
                                  onClick={() => setCodexMenuPanel("model")}
                                  className={cls(
                                    "h-10 w-full rounded-[12px] px-3 flex items-center justify-between gap-3 text-[15px] text-left",
                                    dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                                  )}
                                  role="menuitem"
                                >
                                  <span className="truncate">{activeModelLabel}</span>
                                  <span className={cls("text-[22px]", dark ? "text-dsub" : "text-sub")}>›</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCodexMenuPanel("speed")}
                                  className={cls(
                                    "h-10 w-full rounded-[12px] px-3 flex items-center justify-between gap-3 text-[15px] text-left",
                                    dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                                  )}
                                  role="menuitem"
                                >
                                  <span>{copy.speed}</span>
                                  <span className="ml-auto text-[13px] opacity-70">
                                    {labelForCodexSpeed(activeCodexSpeed, tw.language)}
                                  </span>
                                  <span className={cls("text-[22px]", dark ? "text-dsub" : "text-sub")}>›</span>
                                </button>
                              </>
                            )}
                            {codexMenuPanel === "model" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setCodexMenuPanel("root")}
                                  className={cls(
                                    "h-9 w-full rounded-[10px] px-3 flex items-center gap-2 text-[13px]",
                                    dark ? "text-dsub hover:bg-[#393937]" : "text-sub hover:bg-[#e4e1da]",
                                  )}
                                >
                                  <span className="text-[18px]">‹</span>
                                  <span>{copy.modelLabel}</span>
                                </button>
                                <div className={cls("my-1 border-t", dark ? "border-[#444442]" : "border-[#d8d4cc]")} />
                                {activeModelOptions.map((option) => {
                                  const selected = activeModel === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => {
                                        updateActiveModel(option.value);
                                        setCodexMenuPanel("root");
                                      }}
                                      className={cls(
                                        "h-10 w-full rounded-[12px] px-3 flex items-center justify-between gap-3 text-[15px] text-left",
                                        selected
                                          ? dark ? "bg-[#444442] text-dink" : "bg-[#dedbd3] text-ink"
                                          : dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                                      )}
                                      role="menuitemradio"
                                      aria-checked={selected}
                                    >
                                      <span className="truncate">{option.label}</span>
                                      {selected && <span className="text-[20px] leading-none">✓</span>}
                                    </button>
                                  );
                                })}
                              </>
                            )}
                            {codexMenuPanel === "speed" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setCodexMenuPanel("root")}
                                  className={cls(
                                    "h-9 w-full rounded-[10px] px-3 flex items-center gap-2 text-[13px]",
                                    dark ? "text-dsub hover:bg-[#393937]" : "text-sub hover:bg-[#e4e1da]",
                                  )}
                                >
                                  <span className="text-[18px]">‹</span>
                                  <span>{copy.speed}</span>
                                </button>
                                <div className={cls("my-1 border-t", dark ? "border-[#444442]" : "border-[#d8d4cc]")} />
                                {CODEX_SPEEDS.map((option) => {
                                  const selected = activeCodexSpeed === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => {
                                        updateActiveCodexSpeed(option.value);
                                        setCodexMenuPanel("root");
                                      }}
                                      className={cls(
                                        "h-10 w-full rounded-[12px] px-3 flex items-center justify-between text-[15px] text-left",
                                        selected
                                          ? dark ? "bg-[#444442] text-dink" : "bg-[#dedbd3] text-ink"
                                          : dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                                      )}
                                      role="menuitemradio"
                                      aria-checked={selected}
                                    >
                                      <span>{tw.language === "en" ? option.en : option.ko}</span>
                                      {selected && <span className="text-[20px] leading-none">✓</span>}
                                    </button>
                                  );
                                })}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <select
                        value={activeModel}
                        onChange={(e) => updateActiveModel(e.target.value)}
                        disabled={!active || !!busyTurnId}
                        className={cls(
                          "h-8 max-w-[180px] rounded-[7px] border px-2 text-[11px] font-mono outline-none",
                          dark
                            ? "bg-dsurf border-dline text-dink disabled:text-dsub"
                            : "bg-surface border-line text-ink disabled:text-sub",
                        )}
                        aria-label={copy.modelLabel}
                        title={activeProviderMeta.label}
                      >
                        {activeModelOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={(!input.trim() && pendingAttachments.length === 0) || isPastingImage}
                    className="h-8 px-4 rounded-[7px] text-[12px] font-medium text-white disabled:opacity-40"
                    style={{ background: "var(--accent)" }}
                  >
                    {busyTurnId ? (active?.queueMode ? copy.queuedSend : copy.interruptSend) : copy.send}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {showPreview && (
            <aside
              className={cls("relative shrink-0 border-l flex flex-col", dark ? "border-dline bg-dsurf" : "border-line bg-surface")}
              style={{ width: previewWidth }}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                onPointerDown={startPreviewResize}
                className={cls(
                  "absolute left-[-4px] top-0 z-20 h-full w-2 cursor-col-resize",
                  resizingPreview ? "bg-terra/30" : "hover:bg-terra/20",
                )}
                title="resize preview"
              />
              <div className={cls("h-10 px-3 border-b flex items-center gap-2", dark ? "border-dline" : "border-line")}>
                <span className={cls("text-[12px] font-mono uppercase tracking-wider shrink-0", dark ? "text-dsub" : "text-sub")}>
                  {copy.preview}
                </span>
                <span className={cls("atelier-preview-badge", `atelier-preview-badge-${previewBadgeTone}`)}>
                  {previewBadgeText}
                </span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyPreviewInput();
                  }}
                  className="flex-1 min-w-0 flex items-center gap-1"
                >
                  <input
                    value={previewInput}
                    onChange={(e) => setPreviewInput(e.target.value)}
                    placeholder="http://localhost:5173"
                    className={cls(
                      "flex-1 min-w-0 h-6 px-2 rounded-[4px] border text-[12px] font-mono outline-none",
                      dark
                        ? "bg-dmuted border-dline text-dink placeholder:text-dsub"
                        : "bg-muted border-line text-ink placeholder:text-sub",
                    )}
                    aria-label={copy.previewUrl}
                  />
                  <button
                    type="submit"
                    className={cls(
                      "shrink-0 h-6 px-2 rounded-[4px] text-[11.5px]",
                      dark ? "bg-dline hover:bg-[#3d3d3b] text-dink" : "bg-line hover:bg-muted text-ink",
                    )}
                  >
                    {copy.open}
                  </button>
                </form>
                <div className={cls("shrink-0 inline-flex items-center rounded-[5px] overflow-hidden border", dark ? "border-dline" : "border-line")}>
                  {([
                    ["mobile", "M"],
                    ["tablet", "T"],
                    ["desktop", "D"],
                  ] as const).map(([vp, label]) => (
                    <button
                      key={vp}
                      type="button"
                      onClick={() => setPreviewVP(vp)}
                      className={cls(
                        "h-6 w-6 text-[11.5px] font-mono",
                        previewVP === vp
                          ? dark ? "bg-dline text-dink" : "bg-line text-ink"
                          : dark ? "text-dsub hover:text-dink hover:bg-[#2a2a28]" : "text-sub hover:text-ink hover:bg-muted",
                      )}
                      title={vp}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewReloadKey((n) => n + 1)}
                  className={cls(
                    "shrink-0 h-6 w-6 rounded-[4px] text-[12px]",
                    dark ? "text-dsub hover:bg-[#3d3d3b] hover:text-dink" : "text-sub hover:bg-line hover:text-ink",
                  )}
                  title="reload"
                >
                  ↻
                </button>
                <button
                  type="button"
                  onClick={() => setShowDevScreen((value) => !value)}
                  className={cls(
                    "shrink-0 h-6 px-2 rounded-[4px] text-[10px]",
                    showDevScreen
                      ? dark ? "bg-dline text-dink" : "bg-line text-ink"
                      : dark ? "text-dsub hover:bg-[#3d3d3b] hover:text-dink" : "text-sub hover:bg-line hover:text-ink",
                  )}
                >
                  {copy.devScreen}
                </button>
              </div>
              {previewUrl && (
                <div className={cls("atelier-preview-diagnostics", dark ? "atelier-preview-diagnostics-dark" : "")}>
                  <div className="atelier-preview-diagnostic atelier-preview-diagnostic-info">
                    <span className="atelier-preview-diagnostic-source">
                      {copy.previewLinked}
                    </span>
                    <span className="atelier-preview-diagnostic-text">{previewUrl}</span>
                  </div>
                  {localPreview && (
                    <div className="atelier-preview-service">
                      <div className="atelier-preview-diagnostic atelier-preview-diagnostic-info">
                        <span className="atelier-preview-diagnostic-source">{copy.previewService}</span>
                        <span className="atelier-preview-diagnostic-text">{previewServiceLabel}</span>
                      </div>
                      <div className="atelier-preview-service-controls">
                        <input
                          value={previewServiceCommand}
                          onChange={(e) => setPreviewServiceCommand(e.target.value)}
                          placeholder={copy.previewServicePlaceholder}
                          className={cls(
                            "atelier-preview-service-input",
                            dark ? "atelier-preview-service-input-dark" : "",
                          )}
                          aria-label={copy.previewServiceCommand}
                        />
                        <button
                          type="button"
                          onClick={() => startManagedPreviewService(false)}
                          disabled={previewServiceBusy}
                          className={cls(
                            "atelier-preview-service-button",
                            dark ? "atelier-preview-service-button-dark" : "",
                          )}
                        >
                          {previewServiceBusy ? copy.previewServiceStarting : copy.previewServiceStart}
                        </button>
                        {previewService?.running && (
                          <button
                            type="button"
                            onClick={stopManagedPreviewService}
                            disabled={previewServiceBusy}
                            className={cls(
                              "atelier-preview-service-button atelier-preview-service-stop",
                              dark ? "atelier-preview-service-button-dark" : "",
                            )}
                          >
                            {copy.previewServiceStop}
                          </button>
                        )}
                      </div>
                      {previewServiceOutput.map((line, index) => (
                        <div key={`${line}-${index}`} className="atelier-preview-diagnostic atelier-preview-diagnostic-info">
                          <span className="atelier-preview-diagnostic-source">log</span>
                          <span className="atelier-preview-diagnostic-text">{line}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {previewChecking && (
                    <div className="atelier-preview-diagnostic atelier-preview-diagnostic-info">
                      <span className="atelier-preview-diagnostic-source">{copy.previewChecking}</span>
                      <span className="atelier-preview-diagnostic-text">
                        {localPreview ? copy.previewUrl : copy.previewOnlyLocal}
                      </span>
                    </div>
                  )}
                  {visiblePreviewDiagnostics.map((diagnostic) => (
                    <div
                      key={diagnostic.id}
                      className={cls(
                        "atelier-preview-diagnostic",
                        `atelier-preview-diagnostic-${diagnostic.level}`,
                      )}
                    >
                      <span className="atelier-preview-diagnostic-source">
                        {diagnostic.source === "terminal" ? "Terminal" : copy.preview}
                      </span>
                      <span className="atelier-preview-diagnostic-text">{diagnostic.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {showDevScreen && (
                <div className={cls("atelier-preview-inspector", dark ? "atelier-preview-inspector-dark" : "")}>
                  <div className={cls("h-10 px-3 border-b flex items-center gap-2", dark ? "border-dline" : "border-line")}>
                    <span className={cls("text-[12px] font-mono uppercase tracking-wider shrink-0", dark ? "text-dsub" : "text-sub")}>
                      {copy.devScreen}
                    </span>
                    <span className={cls("atelier-preview-badge", `atelier-preview-badge-${devScreenBadgeTone}`)}>
                      {devScreenBadgeText}
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-1">
                      <input
                        value={devScreenHost}
                        onChange={(e) => setDevScreenHost(e.target.value)}
                        className={cls(
                          "h-6 min-w-0 flex-1 px-2 rounded-[4px] border text-[12px] font-mono outline-none",
                          dark ? "bg-dmuted border-dline text-dink" : "bg-muted border-line text-ink",
                        )}
                        aria-label={copy.devScreenHost}
                      />
                      <input
                        value={devScreenPort}
                        onChange={(e) => setDevScreenPort(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                        placeholder="auto"
                        className={cls(
                          "h-6 w-14 px-2 rounded-[4px] border text-[12px] font-mono outline-none",
                          dark ? "bg-dmuted border-dline text-dink" : "bg-muted border-line text-ink",
                        )}
                        aria-label={copy.devScreenPort}
                      />
                      <input
                        value={devScreenWindow}
                        onChange={(e) => setDevScreenWindow(e.target.value)}
                        className={cls(
                          "h-6 w-16 px-2 rounded-[4px] border text-[12px] font-mono outline-none",
                          dark ? "bg-dmuted border-dline text-dink" : "bg-muted border-line text-ink",
                        )}
                        aria-label={copy.devScreenWindow}
                      />
                    </div>
                  </div>

                  <div className={cls("atelier-devscreen-toolbar", dark ? "atelier-devscreen-toolbar-dark" : "")}>
                    <button type="button" onClick={runDevScreenStatus} disabled={devScreenBusy} className="atelier-devscreen-button">
                      {copy.devScreenStatus}
                    </button>
                    <button type="button" onClick={runDevScreenCheck} disabled={devScreenBusy} className="atelier-devscreen-button">
                      {copy.devScreenCheck}
                    </button>
                    <button type="button" onClick={runDevScreenScreenshot} disabled={devScreenBusy} className="atelier-devscreen-button">
                      {copy.devScreenShot}
                    </button>
                    <button type="button" onClick={runDevScreenSnapshot} disabled={devScreenBusy} className="atelier-devscreen-button">
                      {copy.devScreenDom}
                    </button>
                  </div>

                  <div className={cls("atelier-devscreen-controls", dark ? "atelier-devscreen-controls-dark" : "")}>
                    <div className="atelier-devscreen-row">
                      <input
                        value={devScreenJsCode}
                        onChange={(e) => setDevScreenJsCode(e.target.value)}
                        className="atelier-devscreen-input"
                        aria-label={copy.devScreenCode}
                      />
                      <button type="button" onClick={runDevScreenJs} disabled={devScreenBusy} className="atelier-devscreen-button">
                        {copy.devScreenJs}
                      </button>
                    </div>
                    <div className="atelier-devscreen-row">
                      <input
                        value={devScreenSelector}
                        onChange={(e) => setDevScreenSelector(e.target.value)}
                        className="atelier-devscreen-input"
                        aria-label={copy.devScreenSelector}
                      />
                      <button type="button" onClick={runDevScreenClick} disabled={devScreenBusy} className="atelier-devscreen-button">
                        {copy.devScreenClick}
                      </button>
                    </div>
                    <div className="atelier-devscreen-row">
                      <input
                        value={devScreenText}
                        onChange={(e) => setDevScreenText(e.target.value)}
                        className="atelier-devscreen-input"
                        aria-label={copy.devScreenText}
                      />
                      <button type="button" onClick={runDevScreenType} disabled={devScreenBusy} className="atelier-devscreen-button">
                        {copy.devScreenType}
                      </button>
                    </div>
                    <div className="atelier-devscreen-row">
                      <input
                        value={devScreenKeyName}
                        onChange={(e) => setDevScreenKeyName(e.target.value)}
                        className="atelier-devscreen-input atelier-devscreen-input-short"
                        aria-label={copy.devScreenKey}
                      />
                      <button type="button" onClick={runDevScreenKey} disabled={devScreenBusy} className="atelier-devscreen-button">
                        {copy.devScreenKey}
                      </button>
                      <input
                        value={devScreenResizeWidth}
                        onChange={(e) => setDevScreenResizeWidth(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                        className="atelier-devscreen-size"
                        aria-label={`${copy.devScreenSize} width`}
                      />
                      <input
                        value={devScreenResizeHeight}
                        onChange={(e) => setDevScreenResizeHeight(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                        className="atelier-devscreen-size"
                        aria-label={`${copy.devScreenSize} height`}
                      />
                      <button type="button" onClick={runDevScreenResize} disabled={devScreenBusy} className="atelier-devscreen-button">
                        {copy.devScreenResize}
                      </button>
                    </div>
                  </div>

                  {(latestDevScreenStatus || devScreenError) && (
                    <div className={cls("atelier-preview-diagnostics", dark ? "atelier-preview-diagnostics-dark" : "")}>
                      {latestDevScreenStatus && (
                        <div className="atelier-preview-diagnostic atelier-preview-diagnostic-ok">
                          <span className="atelier-preview-diagnostic-source">{copy.devScreenBridge}</span>
                          <span className="atelier-preview-diagnostic-text">
                            {latestDevScreenStatus.host}:{latestDevScreenStatus.port} · {latestDevScreenStatus.windowLabel}
                          </span>
                        </div>
                      )}
                      {devScreenError && (
                        <div className="atelier-preview-diagnostic atelier-preview-diagnostic-error">
                          <span className="atelier-preview-diagnostic-source">error</span>
                          <span className="atelier-preview-diagnostic-text">{copy.devScreenActionFailed(devScreenError)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {(latestDevScreenScreenshot?.dataUrl || latestDevScreenSnapshot?.text || latestDevScreenData) && (
                    <div className={cls("atelier-preview-inspector-results", dark ? "atelier-preview-inspector-results-dark" : "")}>
                      {latestDevScreenScreenshot?.dataUrl && (
                        <div className="atelier-devscreen-shot-wrap">
                          <img
                            src={latestDevScreenScreenshot.dataUrl}
                            alt={copy.devScreenShot}
                            className="atelier-devscreen-shot"
                          />
                        </div>
                      )}
                      {latestDevScreenSnapshot?.text && (
                        <div className={cls("atelier-devscreen-panel", dark ? "atelier-devscreen-panel-dark" : "")}>
                          <div className="atelier-devscreen-panel-title">{copy.devScreenSnapshot}</div>
                          <pre>{latestDevScreenSnapshot.text}</pre>
                        </div>
                      )}
                      {latestDevScreenData && (
                        <div className={cls("atelier-devscreen-panel", dark ? "atelier-devscreen-panel-dark" : "")}>
                          <div className="atelier-devscreen-panel-title">{copy.devScreenResult}</div>
                          <pre>{latestDevScreenData}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className={cls("flex-1 min-h-0 relative overflow-auto", previewUrl ? (dark ? "bg-[#11110f]" : "bg-[#e8e6df]") : "bg-black")}>
                {previewUrl ? (
                  previewVP === "desktop" ? (
                    <iframe
                      key={`${previewUrl}#${previewReloadKey}#${previewVP}`}
                      src={previewUrl}
                      title="Atelier Agent Preview"
                      className="absolute inset-0 w-full h-full border-0 bg-white"
                      sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                    />
                  ) : (
                    <div className="absolute inset-0 overflow-auto flex items-start justify-center p-4">
                      <div
                        className={cls(
                          "shrink-0 rounded-[10px] overflow-hidden border shadow-[0_8px_30px_rgba(0,0,0,0.18)] bg-white",
                          dark ? "border-dline" : "border-line",
                        )}
                        style={{
                          width: PREVIEW_VP_SIZES[previewVP].w,
                          height: PREVIEW_VP_SIZES[previewVP].h,
                          maxWidth: "100%",
                        }}
                      >
                        <iframe
                          key={`${previewUrl}#${previewReloadKey}#${previewVP}`}
                          src={previewUrl}
                          title="Atelier Agent Preview"
                          className="block h-full w-full border-0 bg-white"
                          sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                        />
                      </div>
                    </div>
                  )
                ) : (
                  <div className="absolute inset-0 bg-black" aria-label={copy.noPreview} />
                )}
              </div>
            </aside>
          )}

        </div>
      </main>
    </div>
  );
};

export default AgentWorkspace;
