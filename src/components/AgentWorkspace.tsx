import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  agentSend,
  homeDir,
  isTauri,
  onAgentEvent,
} from "../lib/tauri";
import type { AgentProvider, AgentStreamEvent } from "../lib/tauri";
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
}

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
  cwd: string;
  providerSessionId?: string;
  messages: ChatMessage[];
  rawEvents: string[];
  updatedAt: number;
}

type PreviewViewport = "mobile" | "tablet" | "desktop";

const SESSIONS_KEY = "atelier.agent.sessions.v1";
const ACTIVE_KEY = "atelier.agent.active.v1";
const CWD_KEY = "atelier.agent.cwd.v1";
const PREVIEW_KEY = "atelier.agent.preview.url.v1";
const PREVIEW_VISIBLE_KEY = "atelier.agent.preview.visible.v1";
const PREVIEW_VP_KEY = "atelier.agent.preview.viewport.v1";
const DEFAULT_PROVIDER: AgentProvider = "claude";
const DEFAULT_HERMES_PROVIDER: HermesInferenceProvider = "openai-codex";
const DEFAULT_CODEX_EFFORT: CodexEffort = "xhigh";
const DEFAULT_CODEX_SPEED: CodexSpeed = "default";
const MAX_RAW_EVENTS = 120;
const MAX_RAW_EVENT_CHARS = 12000;
const PREVIEW_VP_SIZES: Record<Exclude<PreviewViewport, "desktop">, { w: number; h: number }> = {
  mobile: { w: 390, h: 844 },
  tablet: { w: 834, h: 1194 },
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

const isProvider = (value: unknown): value is AgentProvider =>
  value === "claude" || value === "hermes" || value === "codex";

const isHermesProvider = (value: unknown): value is HermesInferenceProvider =>
  value === "anthropic" || value === "openai-codex" || value === "openrouter";

const isCodexEffort = (value: unknown): value is CodexEffort =>
  value === "low" || value === "medium" || value === "high" || value === "xhigh";

const isCodexSpeed = (value: unknown): value is CodexSpeed =>
  value === "default" || value === "fast";

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

function labelForCodexSpeed(value: CodexSpeed, language: Tweaks["language"]) {
  const option = CODEX_SPEEDS.find((item) => item.value === value) || CODEX_SPEEDS[0];
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

const AgentWorkspace: React.FC<{ tw: Tweaks }> = ({ tw }) => {
  const dark = tw.dark;
  const [sessions, setSessions] = useState<AgentSession[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY));
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState(() => localStorage.getItem(CWD_KEY) || "");
  const [showEvents, setShowEvents] = useState(false);
  const [showPreview, setShowPreview] = useState(() => localStorage.getItem(PREVIEW_VISIBLE_KEY) !== "0");
  const [previewUrl, setPreviewUrl] = useState(() => localStorage.getItem(PREVIEW_KEY) || "");
  const [previewInput, setPreviewInput] = useState(() => localStorage.getItem(PREVIEW_KEY) || "");
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [codexMenuPanel, setCodexMenuPanel] = useState<CodexMenuPanel>("root");
  const [previewVP, setPreviewVP] = useState<PreviewViewport>(() => {
    const saved = localStorage.getItem(PREVIEW_VP_KEY);
    return saved === "mobile" || saved === "tablet" || saved === "desktop" ? saved : "desktop";
  });
  const [busyTurnId, setBusyTurnId] = useState<string | null>(null);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const skipRenameCommitRef = useRef(false);

  const copy = tw.language === "en"
    ? {
        title: "Workspace",
        subtitle: "Claude, Hermes, and Codex run behind a structured desktop workspace.",
        newSession: "New",
        preview: "Preview",
        previewUrl: "Preview URL",
        open: "Open",
        noPreview: "Paste a localhost URL or let an agent output one.",
        cwd: "Working folder",
        noAgentProfiles: "No Claude/Hermes/Codex profiles in Settings.",
        placeholder: "Ask the selected agent to change, inspect, or explain this workspace...",
        send: "Send",
        stopHint: "A running turn finishes through the selected CLI; terminal fallback remains available.",
        noMessages: "Start a structured agent session. Messages and raw events are saved locally.",
        events: "Events",
        emptyEvents: "No stream events yet.",
        renameHint: "Double-click to rename",
        providerLabel: "Provider",
        modelLabel: "Model",
        intelligence: "Intelligence",
        speed: "Speed",
        model: "Agent workspace",
        running: "running",
        done: "done",
      }
    : {
        title: "작업",
        subtitle: "터미널 화면 대신 Claude, Hermes, Codex를 구조화된 작업 UI로 보여줍니다.",
        newSession: "새 작업",
        preview: "프리뷰",
        previewUrl: "프리뷰 URL",
        open: "열기",
        noPreview: "localhost URL을 붙여넣거나 에이전트가 출력하면 자동으로 열립니다.",
        cwd: "작업 폴더",
        noAgentProfiles: "설정 프로필에 Claude/Hermes/Codex가 없습니다.",
        placeholder: "선택한 에이전트에게 이 작업공간의 수정, 분석, 설명을 요청하세요...",
        send: "보내기",
        stopHint: "실행 중인 턴은 선택한 CLI가 끝낼 때 완료됩니다. 터미널은 보조 화면으로 남겨둡니다.",
        noMessages: "구조화된 에이전트 세션을 시작하세요. 메시지와 원본 이벤트가 로컬에 저장됩니다.",
        events: "이벤트",
        emptyEvents: "아직 스트림 이벤트가 없습니다.",
        renameHint: "더블클릭해 이름 변경",
        providerLabel: "제공자",
        modelLabel: "모델",
        intelligence: "인텔리전스",
        speed: "속도",
        model: "에이전트 작업",
        running: "실행 중",
        done: "완료",
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

  const lastAssistantStatus = (session: AgentSession) => {
    const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
    return lastAssistant?.status;
  };

  const isSessionDone = (session: AgentSession) => lastAssistantStatus(session) === "done";
  const isSessionRunning = (session: AgentSession) => lastAssistantStatus(session) === "streaming";

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
    localStorage.setItem(PREVIEW_VISIBLE_KEY, showPreview ? "1" : "0");
  }, [showPreview]);

  useEffect(() => {
    localStorage.setItem(PREVIEW_KEY, previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    localStorage.setItem(PREVIEW_VP_KEY, previewVP);
  }, [previewVP]);

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
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.messages, busyTurnId]);

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

  const maybeAutoPreview = (event: AgentStreamEvent) => {
    const url = findPreviewUrl(event.text) || findPreviewUrl(event.raw);
    if (url) loadPreviewUrl(url);
  };

  const handleAgentEvent = (sessionId: string, assistantId: string, event: AgentStreamEvent) => {
    maybeAutoPreview(event);
    patchSession(sessionId, (session) => {
      const rawEvents = event.raw
        ? [...session.rawEvents, clipRawEvent(event.raw)].slice(-MAX_RAW_EVENTS)
        : session.rawEvents;
      const providerSessionId = event.provider_session_id || session.providerSessionId;
      const messages = session.messages.map((m) => {
        if (m.id !== assistantId) return m;
        if (event.kind === "delta" && event.text) {
          return { ...m, text: m.text + event.text, status: "streaming" as const };
        }
        if (event.kind === "result") {
          return {
            ...m,
            text: event.text || m.text,
            status: event.is_error ? "error" as const : "done" as const,
          };
        }
        if (event.kind === "error") {
          return { ...m, text: event.text || m.text || "Agent error", status: "error" as const };
        }
        return m;
      });
      return { ...session, providerSessionId, rawEvents, messages, updatedAt: Date.now() };
    });
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
          prompt: text,
          resumeSessionId: session.providerSessionId || null,
          cwd: cwd || null,
          model: session.model || meta.defaultModel,
          hermesProvider: session.provider === "hermes"
            ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
            : null,
          effort: session.provider === "codex" ? normalizeCodexEffort(session.codexEffort) : null,
          speed: session.provider === "codex" ? normalizeCodexSpeed(session.codexSpeed) : null,
        });
        patchSession(session.id, (s) => ({
          ...s,
          providerSessionId: result.provider_session_id || s.providerSessionId,
          rawEvents: (s.rawEvents.length > 0 ? s.rawEvents : result.raw_events.map(clipRawEvent))
            .slice(-MAX_RAW_EVENTS),
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: result.text || m.text || result.error || "",
                  status: result.is_error ? "error" : "done",
                }
              : m,
          ),
          updatedAt: Date.now(),
        }));
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
      setBusyTurnId(null);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send().catch(console.error);
  };

  return (
    <div className={cls("h-full w-full flex", dark ? "bg-dbg text-dink" : "bg-cream text-ink")}>
      <aside className={cls("w-[280px] shrink-0 border-r flex flex-col", dark ? "border-dline" : "border-line")}>
        <div className={cls("h-12 px-3 flex items-center gap-2 border-b relative", dark ? "border-dline" : "border-line")}>
          <div className="font-display text-[18px] font-medium flex-1">{copy.title}</div>
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
          <div ref={scrollRef} className="flex-1 min-w-0 overflow-auto px-5 py-4">
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
                {active.messages.map((m) => (
                  <article key={m.id} className={cls("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                    {m.role !== "user" && (
                      <div
                        className="mt-1 h-7 w-7 rounded-[7px] text-white grid place-items-center text-[10px] font-semibold"
                        style={{ background: active?.profileDot || activeProviderMeta.dot }}
                      >
                        {activeProviderMeta.short}
                      </div>
                    )}
                    <div
                      className={cls(
                        "max-w-[78%] rounded-[8px] px-3.5 py-2.5 border text-[13px] leading-[1.65]",
                        m.role === "user"
                          ? dark ? "bg-[#34312e] border-[#4a4039] text-dink" : "bg-[#fff8f2] border-[#eed7c8] text-ink"
                          : dark ? "bg-dmuted border-dline text-dink" : "bg-surface border-line text-ink",
                      )}
                    >
                      {m.text ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-transparent prose-pre:p-0">
                          <ReactMarkdown>{m.text}</ReactMarkdown>
                        </div>
                      ) : (
                        <span className={cls("font-mono", dark ? "text-dsub" : "text-sub")}>
                          {copy.running}...
                        </span>
                      )}
                      {m.status === "streaming" && (
                        <div className={cls("mt-2 text-[10px] font-mono", dark ? "text-dsub" : "text-sub")}>
                          {copy.running}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {showPreview && (
            <aside className={cls("w-[430px] shrink-0 border-l flex flex-col", dark ? "border-dline bg-dsurf" : "border-line bg-surface")}>
              <div className={cls("h-10 px-3 border-b flex items-center gap-2", dark ? "border-dline" : "border-line")}>
                <span className={cls("text-[11px] font-mono uppercase tracking-wider shrink-0", dark ? "text-dsub" : "text-sub")}>
                  {copy.preview}
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
              disabled={!!busyTurnId}
            />
            <div className="mt-2 flex items-center gap-2">
              <div className={cls("flex-1 text-[10.5px]", dark ? "text-dsub" : "text-sub")}>
                {busyTurnId ? copy.stopHint : "⌘/Ctrl + Enter"}
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
