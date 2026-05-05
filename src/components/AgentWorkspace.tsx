import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  agentChangeSummary,
  agentSend,
  agentUndoChanges,
  homeDir,
  isTauri,
  onAgentEvent,
  previewHealthCheck,
  previewServiceStart,
  previewServiceStatus,
  previewServiceStop,
} from "../lib/tauri";
import type {
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

interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  createdAt: number;
  status?: "streaming" | "done" | "error";
  changes?: AgentChangeSummary | null;
  activities?: AgentActivity[];
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
  codexEffort?: CodexEffort;
  codexSpeed?: CodexSpeed;
  permissionMode?: AgentPermissionMode;
  cwd: string;
  providerSessionId?: string;
  messages: ChatMessage[];
  rawEvents: string[];
  updatedAt: number;
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
const TASK_LIST_VISIBLE_KEY = "atelier.agent.tasklist.visible.v1";
const DEFAULT_PROVIDER: AgentProvider = "claude";
const DEFAULT_HERMES_PROVIDER: HermesInferenceProvider = "openai-codex";
const DEFAULT_CODEX_EFFORT: CodexEffort = "xhigh";
const DEFAULT_CODEX_SPEED: CodexSpeed = "default";
const DEFAULT_PERMISSION_MODE: AgentPermissionMode = "full";
const MAX_RAW_EVENTS = 120;
const MAX_RAW_EVENT_CHARS = 12000;
const STREAM_FLUSH_MS = 48;
const SMOOTH_OUTPUT_FPS = 60;
const SMOOTH_FRAME_MS = 1000 / SMOOTH_OUTPUT_FPS;
const PREVIEW_VP_SIZES: Record<Exclude<PreviewViewport, "desktop">, { w: number; h: number }> = {
  mobile: { w: 390, h: 844 },
  tablet: { w: 834, h: 1194 },
};
const LOCAL_PREVIEW_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#]|$)/i;
const TERMINAL_ISSUE_RE =
  /\b(?:error|failed|failure|exception|panic|traceback|npm ERR|EADDRINUSE|ECONNREFUSED|ECONNRESET|vite error|compile failed|compilation failed)\b/i;

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
    dot: "#8b4a73",
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
          profileDot: session.profileDot || meta.dot,
          model: provider === "hermes"
            ? normalizeHermesModel(hermesProvider || DEFAULT_HERMES_PROVIDER, session.model || meta.defaultModel)
            : normalizeModel(provider, session.model || meta.defaultModel),
          hermesProvider,
          codexEffort: provider === "codex" ? normalizeCodexEffort(session.codexEffort) : undefined,
          codexSpeed: provider === "codex" ? normalizeCodexSpeed(session.codexSpeed) : undefined,
          permissionMode: normalizePermissionMode(session.permissionMode),
          cwd: session.cwd || "",
          providerSessionId: session.providerSessionId,
          messages: Array.isArray(session.messages) ? session.messages : [],
          rawEvents: Array.isArray(session.rawEvents) ? session.rawEvents : [],
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
  const matches = text.match(/https?:\/\/[^\s<>"'`)\]]+/g);
  if (!matches?.length) return null;
  return matches[matches.length - 1].replace(/[.,;:]+$/, "");
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

function stripAnsi(text: string) {
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    "",
  );
}

function cleanAgentText(text?: string | null) {
  if (!text) return "";
  return stripAnsi(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("session_id:"))
    .join("\n")
    .trim();
}

function cleanAgentDelta(text?: string | null) {
  if (!text) return "";
  return stripAnsi(text).replace(/\r\n?/g, "\n");
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

function formatAgentPrompt(text: string, language: "ko" | "en", previewContext?: string | null) {
  const context = previewContext
    ? language === "en"
      ? ["", "", "---", "Atelier preview diagnostics:", previewContext].join("\n")
      : ["", "", "---", "Atelier 프리뷰 진단:", previewContext].join("\n")
    : "";
  const instruction = language === "en"
    ? [
        "",
        "",
        "---",
        "Atelier display guidance:",
        "- Keep terminal commands, JSON events, internal routing, and raw tool logs out of the user-facing answer.",
        "- Show the result in natural language, with concise progress only when it helps.",
        "- Use GitHub-flavored Markdown. Use real Markdown tables when a table is useful.",
      ].join("\n")
    : [
        "",
        "",
        "---",
        "Atelier 표시 지침:",
        "- 터미널 명령, JSON 이벤트, 내부 라우팅, 원본 도구 로그를 사용자 답변에 그대로 쓰지 마세요.",
        "- 결과는 자연어 중심으로 보여주고, 진행 설명은 필요할 때만 짧게 정리하세요.",
        "- GitHub-flavored Markdown을 사용하고, 표가 필요하면 실제 Markdown 표로 작성하세요.",
      ].join("\n");
  return `${text}${context}${instruction}`;
}

function revealStepSize(remaining: number, elapsedMs: number) {
  const frameScale = clampNumber(elapsedMs / SMOOTH_FRAME_MS, 0.75, 3);
  const charsPerFrame =
    remaining > 7000 ? 72
      : remaining > 2600 ? 38
        : remaining > 900 ? 20
          : remaining > 280 ? 10
            : 4;
  return Math.max(1, Math.ceil(charsPerFrame * frameScale));
}

const AgentWorkspace: React.FC<{ tw: Tweaks }> = ({ tw }) => {
  const dark = tw.dark;
  const [sessions, setSessions] = useState<AgentSession[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY));
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState(() => localStorage.getItem(CWD_KEY) || "");
  const [showEvents, setShowEvents] = useState(false);
  const [showTaskList, setShowTaskList] = useState(() => localStorage.getItem(TASK_LIST_VISIBLE_KEY) !== "0");
  const [showPreview, setShowPreview] = useState(() => localStorage.getItem(PREVIEW_VISIBLE_KEY) !== "0");
  const [previewUrl, setPreviewUrl] = useState(() => localStorage.getItem(PREVIEW_KEY) || "");
  const [previewInput, setPreviewInput] = useState(() => localStorage.getItem(PREVIEW_KEY) || "");
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [previewCheck, setPreviewCheck] = useState<PreviewCheckResult | null>(null);
  const [previewChecking, setPreviewChecking] = useState(false);
  const [previewDiagnostics, setPreviewDiagnostics] = useState<PreviewDiagnostic[]>([]);
  const [previewService, setPreviewService] = useState<PreviewServiceStatus | null>(null);
  const [previewServiceCommand, setPreviewServiceCommand] = useState(() => localStorage.getItem(PREVIEW_SERVICE_COMMAND_KEY) || "");
  const [previewServiceBusy, setPreviewServiceBusy] = useState(false);
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
  const [busyTurnId, setBusyTurnId] = useState<string | null>(null);
  const [visibleTextById, setVisibleTextById] = useState<Record<string, string>>({});
  const [reviewOpenById, setReviewOpenById] = useState<Record<string, boolean>>({});
  const [expandedDiffByKey, setExpandedDiffByKey] = useState<Record<string, boolean>>({});
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const permissionMenuRef = useRef<HTMLDivElement | null>(null);
  const skipRenameCommitRef = useRef(false);
  const pendingStreamRef = useRef<Record<string, PendingAgentStream>>({});
  const animatedAssistantIdsRef = useRef<Set<string>>(new Set());
  const smoothTargetsRef = useRef<Record<string, string>>({});
  const smoothFrameRef = useRef<number | null>(null);
  const smoothLastTickRef = useRef(0);
  const autoScrollRef = useRef(true);
  const previewResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const previewAutoStartRef = useRef<Record<string, number>>({});
  const lastPreviewCommandRef = useRef<string | null>(null);

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
        cwd: "Working folder",
        noAgentProfiles: "No Claude/Hermes/Codex profiles in Settings.",
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
        intelligence: "Intelligence",
        speed: "Speed",
        model: "Agent workspace",
        running: "running",
        done: "done",
        thinking: "thinking",
        preparing: "preparing",
        runningPrefix: "running",
        usingTool: "using tool",
        changedFiles: (count: number) => `${count} files changed`,
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
        cwd: "작업 폴더",
        noAgentProfiles: "설정 프로필에 Claude/Hermes/Codex가 없습니다.",
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
        intelligence: "인텔리전스",
        speed: "속도",
        model: "에이전트 작업",
        running: "실행 중",
        done: "완료",
        thinking: "생각 중",
        preparing: "준비 중",
        runningPrefix: "실행 중",
        usingTool: "도구 사용 중",
        changedFiles: (count: number) => `${count}개 파일 변경됨`,
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

  const lastAssistantStatus = (session: AgentSession) => {
    const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
    return lastAssistant?.status;
  };

  const isSessionDone = (session: AgentSession) => lastAssistantStatus(session) === "done";
  const isSessionRunning = (session: AgentSession) => lastAssistantStatus(session) === "streaming";

  const scrollTranscriptToBottom = () => {
    const el = scrollRef.current;
    if (!el || !autoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
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
    if (smoothFrameRef.current !== null) return;
    smoothFrameRef.current = window.requestAnimationFrame(revealSmoothOutput);
  };

  const revealSmoothOutput = (now: number) => {
    const elapsed = smoothLastTickRef.current
      ? Math.min(90, now - smoothLastTickRef.current)
      : SMOOTH_FRAME_MS;
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
          changed = true;
          hasPending = next[id].length < target.length;
          continue;
        }
        const remaining = target.length - current.length;
        if (remaining <= 0) continue;
        const step = revealStepSize(remaining, elapsed);
        next[id] = target.slice(0, current.length + step);
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
    if (sessions.length > 0 && !activeId) {
      setActiveId(sessions[0].id);
    }
  }, [activeId, sessions]);

  useEffect(() => {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch {}
  }, [sessions]);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

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
    scrollTranscriptToBottom();
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
    if (Object.keys(targets).some((id) => (visibleTextById[id] || "") !== targets[id])) {
      scheduleSmoothOutput();
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
      pendingStreamRef.current = {};
      smoothTargetsRef.current = {};
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
    setSessions((prev) => prev.map((s) => (s.id === id ? patcher(s) : s)));
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
      profileDot: profile?.dot || meta.dot,
      model: provider === "hermes"
        ? normalizeHermesModel(hermesProvider || DEFAULT_HERMES_PROVIDER, profile ? modelFromProfile(profile, provider) : meta.defaultModel)
        : normalizeModel(provider, profile ? modelFromProfile(profile, provider) : meta.defaultModel),
      hermesProvider,
      codexEffort: provider === "codex" ? DEFAULT_CODEX_EFFORT : undefined,
      codexSpeed: provider === "codex" ? DEFAULT_CODEX_SPEED : undefined,
      permissionMode: DEFAULT_PERMISSION_MODE,
      cwd,
      messages: [],
      rawEvents: [],
      updatedAt: Date.now(),
    };
  };

  const createSession = (profile: Profile | undefined, provider: AgentProvider, clearInput = true) => {
    const session = makeSession(profile, provider);
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.id);
    setShowProfilePicker(false);
    if (clearInput) setInput("");
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
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) {
      const next = sessions.find((s) => s.id !== id);
      setActiveId(next?.id || null);
    }
  };

  const beginRename = (session: AgentSession) => {
    skipRenameCommitRef.current = false;
    setActiveId(session.id);
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

  const loadPreviewUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    setPreviewUrl(normalized);
    setPreviewInput(normalized);
    setShowPreview(true);
  };

  const applyPreviewInput = () => loadPreviewUrl(previewInput);

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
    const clean = clipActivityText(command, 220);
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
    patchSession(active.id, (session) => ({ ...session, model, updatedAt: Date.now() }));
  };

  const updateActiveHermesProvider = (hermesProvider: HermesInferenceProvider) => {
    if (!active) return;
    patchSession(active.id, (session) => ({
      ...session,
      hermesProvider,
      model: HERMES_MODEL_OPTIONS[hermesProvider].some((option) => option.value === normalizeHermesModel(hermesProvider, session.model))
        ? normalizeHermesModel(hermesProvider, session.model)
        : defaultHermesModel(hermesProvider),
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

  const activityFromEvent = (event: AgentStreamEvent): Omit<AgentActivity, "id" | "createdAt" | "active"> | null => {
    const rawJson = parseRawJson(event.raw);
    const command = commandFromValue(rawJson);
    if (event.kind === "tool") {
      if (command) {
        return {
          kind: "running",
          label: `${copy.runningPrefix} ${clipActivityText(command)}`,
        };
      }
      const tool = clipActivityText(event.text || event.status || "");
      return tool ? { kind: "tool", label: `${copy.usingTool} ${tool}` } : null;
    }
    if (event.kind === "status") {
      const status = event.status || "";
      if (/starting|started|init|system|turn\.started|thread\.started/i.test(status)) {
        return { kind: "thinking", label: copy.thinking };
      }
      if (/completed|complete|done|finish/i.test(status)) return null;
      return status ? { kind: "status", label: clipActivityText(status) } : { kind: "thinking", label: copy.thinking };
    }
    if (event.kind === "raw" && command) {
      return {
        kind: "running",
        label: `${copy.runningPrefix} ${clipActivityText(command)}`,
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

  const flushAgentStream = (assistantId: string) => {
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
    patchSession(pending.sessionId, (session) => ({
      ...session,
      providerSessionId: providerSessionId || session.providerSessionId,
      rawEvents: rawEvents.length
        ? [...session.rawEvents, ...rawEvents].slice(-MAX_RAW_EVENTS)
        : session.rawEvents,
      messages: text
        ? session.messages.map((m) =>
            m.id === pending.assistantId
              ? { ...m, text: `${m.text}${text}`, status: "streaming" as const }
              : m,
          )
        : session.messages,
      updatedAt: Date.now(),
    }));
  };

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
    if (!pending.timer) {
      pending.timer = window.setTimeout(() => flushAgentStream(assistantId), STREAM_FLUSH_MS);
    }
  };

  const handleAgentEvent = (sessionId: string, assistantId: string, event: AgentStreamEvent) => {
    rememberPreviewStartCommand(event);
    maybeAutoPreview(event);
    noteTerminalIssue(event);
    if (event.kind === "status" || event.kind === "tool" || event.kind === "raw") {
      pushActivity(sessionId, assistantId, event);
    }
    if (event.kind === "delta") {
      enqueueAgentStream(sessionId, assistantId, event);
      return;
    }
    if (event.raw || event.provider_session_id) {
      enqueueAgentStream(sessionId, assistantId, {
        ...event,
        text: null,
      });
    }
    flushAgentStream(assistantId);
    if (event.kind !== "result" && event.kind !== "error") return;
    finishActivities(sessionId, assistantId);
    patchSession(sessionId, (session) => {
      const providerSessionId = event.provider_session_id || session.providerSessionId;
      const messages = session.messages.map((m) => {
        if (m.id !== assistantId) return m;
        if (event.kind === "result") {
          const text = cleanAgentText(event.text) || m.text;
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
  };

  const attachChangeSummary = async (sessionId: string, assistantId: string, sessionCwd: string) => {
    if (!isTauri()) return;
    try {
      const summary = await agentChangeSummary(sessionCwd || cwd || null);
      if (!summary.is_git || summary.files.length === 0) return;
      patchSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((m) =>
          m.id === assistantId ? { ...m, changes: summary } : m,
        ),
        updatedAt: Date.now(),
      }));
    } catch (err) {
      console.warn("agent change summary failed", err);
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
    if (!summary || (!summary.files.length && !summary.undo_applied)) return null;
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

  const renderAgentActivity = (message: ChatMessage) => {
    if (message.role !== "assistant" || message.status !== "streaming") return null;
    const activities = message.activities?.length
      ? message.activities.slice(-3)
      : [{
          id: "fallback-thinking",
          kind: "thinking" as const,
          label: copy.thinking,
          active: true,
          createdAt: Date.now(),
        }];
    return (
      <div className="atelier-activity-stack" aria-live="polite">
        {activities.map((activity) => (
          <div className={cls("atelier-activity-line", activity.active ? "atelier-activity-active" : "")} key={activity.id}>
            <span className="atelier-activity-icon" aria-hidden="true">
              {activity.kind === "thinking" ? "…" : I.terminal}
            </span>
            <span className="atelier-activity-label">{activity.label}</span>
          </div>
        ))}
      </div>
    );
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busyTurnId) return;
    const session = active || (() => {
      const fresh = makeSession(fallbackProfile, fallbackProvider, text.slice(0, 42));
      setSessions((prev) => [fresh, ...prev]);
      setActiveId(fresh.id);
      return fresh;
    })();
    const meta = providerMeta(session.provider);

    const userId = nowId("user");
    const assistantId = nowId("assistant");
    const turnId = nowId("turn");
    const createdAt = Date.now();
    animatedAssistantIdsRef.current.add(assistantId);
    autoScrollRef.current = true;
    setVisibleTextById((prev) => ({ ...prev, [assistantId]: "" }));
    setInput("");
    setBusyTurnId(turnId);
    patchSession(session.id, (s) => ({
      ...s,
      title: s.messages.length === 0 && !s.titleEdited ? text.slice(0, 48) : s.title,
      cwd,
      messages: [
        ...s.messages,
        { id: userId, role: "user", text, createdAt, status: "done" },
        { id: assistantId, role: "assistant", text: "", createdAt, status: "streaming" },
      ],
      updatedAt: createdAt,
    }));

    let unlisten: (() => void) | undefined;
    try {
      if (isTauri()) {
        unlisten = await onAgentEvent(turnId, (event) => handleAgentEvent(session.id, assistantId, event));
        const result = await agentSend({
          provider: session.provider,
          turnId,
          prompt: formatAgentPrompt(
            text,
            tw.language,
            formatPreviewPromptContext(tw.language, previewUrl, previewCheck, previewDiagnostics, previewService),
          ),
          resumeSessionId: session.providerSessionId || null,
          cwd: cwd || null,
          model: session.model || meta.defaultModel,
          hermesProvider: session.provider === "hermes"
            ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
            : null,
          effort: session.provider === "codex" ? normalizeCodexEffort(session.codexEffort) : null,
          speed: session.provider === "codex" ? normalizeCodexSpeed(session.codexSpeed) : null,
          permissionMode: normalizePermissionMode(session.permissionMode),
        });
        flushAgentStream(assistantId);
        delete pendingStreamRef.current[assistantId];
        patchSession(session.id, (s) => ({
          ...s,
          providerSessionId: result.provider_session_id || s.providerSessionId,
          rawEvents: (s.rawEvents.length > 0 ? s.rawEvents : result.raw_events.map(clipRawEvent))
            .slice(-MAX_RAW_EVENTS),
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: cleanAgentText(result.text) || m.text || cleanAgentText(result.error) || "",
                  status: result.is_error ? "error" : "done",
                }
              : m,
          ),
          updatedAt: Date.now(),
        }));
        if (!result.is_error) {
          await attachChangeSummary(session.id, assistantId, cwd || session.cwd);
        }
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        patchSession(session.id, (s) => ({
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
      patchSession(session.id, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistantId
            ? { ...m, text: `실행 실패: ${String(err)}`, status: "error" }
            : m,
        ),
      }));
    } finally {
      unlisten?.();
      flushAgentStream(assistantId);
      delete pendingStreamRef.current[assistantId];
      setBusyTurnId(null);
    }
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
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: profile.dot }} />
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
          {sessions.length === 0 && (
            <div className={cls("p-3 text-[12px] leading-[1.55]", dark ? "text-dsub" : "text-sub")}>
              {copy.noMessages}
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveId(s.id)}
              onDoubleClick={() => beginRename(s)}
              onKeyDown={(e) => {
                if (editingSessionId === s.id) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveId(s.id);
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
                    background: `${s.profileDot || providerMeta(s.provider).dot}22`,
                    boxShadow: `inset 0 0 0 1px ${s.profileDot || providerMeta(s.provider).dot}66`,
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
          <div className={cls("mt-3 text-[10px] font-mono [writing-mode:vertical-rl]", dark ? "text-dsub" : "text-sub")}>
            {copy.title}
          </div>
        </aside>
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        <div className={cls("h-12 px-4 border-b flex items-center gap-3", dark ? "border-dline" : "border-line")}>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium truncate">{active?.title || active?.profileName || activeProviderMeta.label}</div>
            <div className={cls("text-[10px] font-mono truncate", dark ? "text-dsub" : "text-sub")}>
              {copy.subtitle}
            </div>
          </div>
          <label className={cls("text-[10px] font-mono uppercase tracking-wider", dark ? "text-dsub" : "text-sub")}>
            {copy.cwd}
          </label>
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
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
          <button
            type="button"
            onClick={() => setShowEvents((v) => !v)}
            className={cls(
              "h-8 px-2.5 rounded-[6px] text-[12px]",
              showEvents
                ? dark ? "bg-dline text-dink" : "bg-line text-ink"
                : dark ? "text-dsub hover:bg-dmuted hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
            )}
          >
            {copy.events}
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div
            ref={scrollRef}
            onScroll={handleTranscriptScroll}
            className="flex-1 min-w-0 overflow-auto px-5 py-4"
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
                  return (
                  <article key={m.id} className={cls("flex min-w-0 gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                    {m.role !== "user" && (
                      <div
                        className="mt-1 h-7 w-7 shrink-0 rounded-[7px] text-white grid place-items-center text-[10px] font-semibold"
                        style={{ background: active?.profileDot || activeProviderMeta.dot }}
                      >
                        {activeProviderMeta.short}
                      </div>
                    )}
                    <div
                      className={cls(
                        "min-w-0 max-w-[min(78%,760px)] overflow-hidden rounded-[8px] px-3.5 py-2.5 border text-[13px] leading-[1.65] break-words",
                        m.role === "user"
                          ? dark ? "bg-[#34312e] border-[#4a4039] text-dink" : "bg-[#fff8f2] border-[#eed7c8] text-ink"
                        : dark ? "bg-dmuted border-dline text-dink" : "bg-surface border-line text-ink",
                      )}
                    >
                      {displayText ? (
                        useStreamingRenderer ? (
                          <div className="atelier-streaming-text min-w-0 max-w-full" aria-live="polite">
                            {displayText}
                            <span className="atelier-streaming-caret" aria-hidden="true" />
                          </div>
                        ) : (
                          <div className="atelier-chat-markdown min-w-0 max-w-full">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={CHAT_MARKDOWN_COMPONENTS}>
                              {m.text}
                            </ReactMarkdown>
                          </div>
                        )
                      ) : (
                        <span className={cls("font-mono", dark ? "text-dsub" : "text-sub")}>
                          {copy.running}...
                        </span>
                      )}
                      {m.status === "streaming" && (
                        renderAgentActivity(m)
                      )}
                      {m.role === "assistant" && renderChangeSummary(m)}
                    </div>
                  </article>
                  );
                })}
              </div>
            )}
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
                <span className={cls("text-[11px] font-mono uppercase tracking-wider shrink-0", dark ? "text-dsub" : "text-sub")}>
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
                      "flex-1 min-w-0 h-6 px-2 rounded-[4px] border text-[11px] font-mono outline-none",
                      dark
                        ? "bg-dmuted border-dline text-dink placeholder:text-dsub"
                        : "bg-muted border-line text-ink placeholder:text-sub",
                    )}
                    aria-label={copy.previewUrl}
                  />
                  <button
                    type="submit"
                    className={cls(
                      "shrink-0 h-6 px-2 rounded-[4px] text-[10px]",
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
                        "h-6 w-6 text-[10px] font-mono",
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
              <div className={cls("flex-1 min-h-0 relative overflow-auto", dark ? "bg-[#11110f]" : "bg-[#e8e6df]")}>
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
                  <div className={cls("h-full flex items-center justify-center text-center px-8 text-[13px] leading-[1.7]", dark ? "text-dsub" : "text-sub")}>
                    {copy.noPreview}
                  </div>
                )}
              </div>
            </aside>
          )}

          {showEvents && (
            <aside className={cls("w-[360px] shrink-0 border-l flex flex-col", dark ? "border-dline" : "border-line")}>
              <div className={cls("h-10 px-3 border-b flex items-center text-[11px] font-mono uppercase tracking-wider", dark ? "border-dline text-dsub" : "border-line text-sub")}>
                {copy.events}
              </div>
              <pre className={cls("m-0 p-3 flex-1 overflow-auto text-[10.5px] leading-[1.45] whitespace-pre-wrap", dark ? "text-dsub" : "text-sub")}>
                {active?.rawEvents?.length ? active.rawEvents.join("\n") : copy.emptyEvents}
              </pre>
            </aside>
          )}
        </div>

        <form onSubmit={onSubmit} className={cls("border-t p-3", dark ? "border-dline" : "border-line")}>
          <div className={cls("max-w-[920px] mx-auto rounded-[9px] border p-2", dark ? "bg-dmuted border-dline" : "bg-surface border-line")}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
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
              <div className={cls("flex-1 text-[10.5px]", dark ? "text-dsub" : "text-sub")}>
                {busyTurnId ? copy.draftHint : "⌘/Ctrl + Enter"}
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {activeProvider === "hermes" && (
                  <>
                    <span className={cls("text-[10px] font-mono uppercase tracking-wider", dark ? "text-dsub" : "text-sub")}>
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
                <span className={cls("text-[10px] font-mono uppercase tracking-wider", dark ? "text-dsub" : "text-sub")}>
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
                disabled={!input.trim() || !!busyTurnId}
                className="h-8 px-4 rounded-[7px] text-[12px] font-medium text-white disabled:opacity-40"
                style={{ background: "var(--accent)" }}
              >
                {busyTurnId ? copy.running : copy.send}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

export default AgentWorkspace;
