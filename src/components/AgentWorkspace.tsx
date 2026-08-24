import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  devScreenCheck,
  devScreenClick,
  devScreenDiagnostics,
  devScreenElementPickerCancel,
  devScreenElementPickerPoll,
  devScreenElementPickerStart,
  devScreenJs,
  devScreenKey,
  devScreenResize,
  devScreenScreenshot,
  devScreenSnapshot,
  devScreenStatus,
  devScreenType,
  formatDevScreenElementSelectionPrompt,
  normalizeDevScreenElementSelection,
} from "../lib/devScreen";
import {
  formatStellaOntologyInstruction,
  isStellaOntologyMode,
  labelForStellaOntologyMode,
  normalizeStellaOntologyMode,
} from "../lib/stellaOntology";
import type { StellaOntologyMode } from "../lib/stellaOntology";
import {
  containsProtectedActionIntent,
  detectStellaFactorySafetyBlock,
  formatStellaFactoryPreflightBlock,
  formatStellaFactoryInstruction,
  parseStellaFactoryCommand,
} from "../lib/stellaFactory";
import type { StellaFactoryCommand } from "../lib/stellaFactory";
import {
  STAGE_MODELS_STORAGE_KEY,
  STELLA_STAGES,
  advanceStageRunState,
  buildStageHandoff,
  buildStageReceipt,
  buildStageTurnPrompt,
  createStageRunState,
  hasStageOverrides,
  normalizeStageRunState,
  parseStageModelAssignments,
  resolveStageExecution,
  serializeStageModelAssignments,
  stageLabel,
  stageReceiptLine,
  validateStageExecution,
} from "../lib/stellaStageModels";
import type {
  StageModelAssignments,
  StageReceipt,
  StageRunState,
  StellaStage,
} from "../lib/stellaStageModels";
import { safeLocalStorageGet, safeLocalStorageSet } from "../lib/storage";
import {
  presentAgentAnswer,
  selectTerminalAgentAnswer,
  unverifiedIntermediateNotice,
} from "../lib/agentAnswerContract";
import {
  inferGajaeModelProviderFromModel as inferGajaeProviderFromModel,
  inferHermesModelProviderFromModel as inferHermesProviderFromModel,
  modelForGajaeProvider,
  normalizeHermesModelProvider,
  profileModelOverride,
  readGajaeModelProviderPreference,
  readHermesModelProviderPreference,
  resolveGajaeNewSessionProvider,
  resolveHermesNewSessionProvider,
  writeGajaeModelProviderPreference,
  writeHermesModelProviderPreference,
} from "../lib/agentProviderPreferences";
import type {
  GajaeModelProvider as GajaeInferenceProvider,
  HermesModelProvider as HermesInferenceProvider,
} from "../lib/agentProviderPreferences";
import { findUrl, isAutoReviewablePreviewUrl, restoreAutoPreviewUrl } from "../lib/previewUrl";
import { resolvePreviewVisibilityFallback } from "../lib/previewSessionState";
import {
  buildTaskPreviewEvidence,
  createTurnPreviewImpact,
  noteTurnPreviewImpactEvent,
  previewDiagnosticsMatchPreview,
  turnAffectedPreview,
  turnNeedsWorkspaceMutationProbe,
  workspaceMutationFromChangeSummary,
} from "../lib/previewEvidence";
import type { TaskPreviewEvidence, TurnPreviewImpact } from "../lib/previewEvidence";
import {
  formatReviewAnnotationsPrompt,
  normalizeReviewAnnotations,
  parseUnifiedDiff,
  reviewAnnotationMatchesLine,
  reviewLineLabel,
} from "../lib/diffReview";
import type { ChangeReviewAnnotation, DiffReviewLine } from "../lib/diffReview";
import { classifyGajaePrefixedInput, splitCliArgs } from "../lib/gajaeCommand";
import {
  ACADEMIC_RESEARCH_SLASH_COMMANDS,
  parseAcademicResearchCommand,
} from "../lib/academicResearch";
import type {
  DevScreenActionResult,
  DevScreenCheckResult,
  DevScreenDiagnosticsResult,
  DevScreenElementPickerResult,
  DevScreenElementSelection,
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
  agentRuntimeCapabilities,
	agentQuickOpenIndex,
	  agentSend,
  agentUndoChanges,
  agentWorktreeAdopt,
  agentWorktreePrepare,
	  academicResearchInstallClaudePlugin,
  clipboardSaveImage,
	  claudeModelOptions,
	  codexModelOptions,
  controlRequestClaim,
  controlRequestComplete,
  controlRequestsPending,
  homeDir,
  isTauri,
  mobileControlSessionsPublish,
  onAgentEvent,
  onAgentLifecycle,
  onManagedAgentRuntimeProgress,
  onAgentSubscriptionUsage,
  onAgentTokenUsage,
  onQuickOpenRequested,
  openRouterModelOptions,
  previewCapability,
  previewHealthCheck,
  previewServiceStart,
  previewServiceStatus,
  previewServiceStop,
  providerSubscriptionUsage,
  searchWorkspaceFiles,
  stellaFactoryAutopilot,
  stellaFactoryBootstrap,
  stellaProjectAnalysis,
  stellaRecordEvidence,
  stellaWorkspaceProbe,
} from "../lib/tauri";
import type {
  AgentChangeBaseline,
  AgentChangeSummary,
  AtelierControlRequest,
  AgentLifecycleEvent,
  AgentLifecyclePhase,
  AgentPermissionMode,
  AgentProvider,
  AgentQuickOpenIndexEntry,
  AgentRuntimeCapability,
  ManagedAgentRuntimeProgress,
  MobileControlSessionsPublishInput,
  AgentStreamEvent,
  AgentTokenUsageEvent,
  AgentWorktreeInfo,
  FsEntry,
  ProviderSubscriptionUsage,
  PreviewCapability,
  PreviewCheckResult,
  PreviewServiceStatus,
} from "../lib/tauri";
import { cls, Profile, Tweaks } from "../lib/tokens";
import ComposerSelectMenu from "./ComposerSelectMenu";
import { I } from "./Icons";
import CodexModelMenu from "./agent-composer/CodexModelMenu";
import { useSessionRunRegistry } from "./agent-runtime/useSessionRunRegistry";
import {
  AgentFleetLauncher,
  AgentFleetPanel,
  beginAgentFleetAdoption,
  completeAgentFleetAdoption,
  failAgentFleetAdoption,
  finalizeInterruptedAgentFleetAdoption,
  legacyAgentFleetAdoptionHistory,
  normalizeAgentFleetAdoptionHistory,
  selectAgentFleetProfileIds,
} from "./agent-fleet";
import type {
  AgentFleetAdoptionHistory,
  AgentFleetCandidateView,
  AgentFleetPreset,
} from "./agent-fleet";
import { DesktopNotificationToggle, useDesktopNotifications } from "./desktop-notifications";
import type { DesktopNotificationTask } from "./desktop-notifications";
import {
  createReviewDispatch,
  finalizeInterruptedReviewWorkflow,
  normalizeReviewDispatchContext,
  normalizeReviewWorkflowState,
  ReviewWorkflowStatus,
  transitionReviewWorkflow,
} from "./review-workflow";
import {
  handleFeatureControlRequest,
  normalizeFeatureControlTask,
  type SourceControlWorkItem,
} from "../features/featureRegistry";
import type {
  ChangeReviewWorkflowState,
  ReviewDispatchContext,
  ReviewWorkflowPhase,
} from "./review-workflow";
import {
  buildQuickOpenResults,
  sameQuickOpenPath,
} from "./quick-open-index";
import type {
  QuickOpenCommandDefinition,
  QuickOpenCommandId,
  QuickOpenItem,
  QuickOpenSessionCandidate,
} from "./quick-open-index";
import { SessionInboxToolbar, useSessionInbox } from "./session-inbox";
import type { SessionInboxItem, SessionInboxPhase } from "./session-inbox";
import ChangesWorkbench from "./workbench/ChangesWorkbench";
import CodeWorkbench from "./workbench/CodeWorkbench";
import WorkspaceModeBar from "./workbench/WorkspaceModeBar";
import type { WorkspaceView } from "./workbench/WorkspaceModeBar";
import {
  normalizeSessionTokenUsage,
  type SessionTokenUsage,
} from "./workbench/sessionTokenUsage";
import { normalizeSubscriptionUsage } from "./workbench/subscriptionUsage";

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
  disabled?: boolean;
  supported_reasoning_levels?: string[];
  default_reasoning_level?: string | null;
  requires_multi_agent_v2?: boolean;
};

type OpenRouterEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
type CodexEffort = "low" | "medium" | "high" | "xhigh" | "ultra";
type WorkloadLevel = OpenRouterEffort | CodexEffort;
type CodexSpeed = "default" | "fast";
type SlashCommandScope = "atelier" | AgentProvider;

type SlashCommandSpec = {
  command: string;
  insert: string;
  scope: SlashCommandScope;
  detailKo: string;
  detailEn: string;
};

type GajaeCommandSpec = SlashCommandSpec & {
  primaryLabelKo?: string;
  primaryLabelEn?: string;
};

type VisiblePermissionMode = Exclude<AgentPermissionMode, "full">;

const GAJAE_CODE_COMMANDS: GajaeCommandSpec[] = [
  {
    command: "gjc <message>",
    insert: "/gjc ",
    scope: "gajecode",
    detailKo: "가재코드 에이전트에 자연어 작업 요청",
    detailEn: "Send a natural-language task to the Gajae Code agent",
    primaryLabelKo: "GJC",
    primaryLabelEn: "GJC",
  },
  {
    command: "gjc --help",
    insert: "/gjc --help",
    scope: "gajecode",
    detailKo: "Gajae Code 전체 도움말",
    detailEn: "Show Gajae Code help",
  },
  {
    command: "gjc --version",
    insert: "/gjc --version",
    scope: "gajecode",
    detailKo: "설치된 Gajae Code 버전 확인",
    detailEn: "Show installed Gajae Code version",
  },
  {
    command: "gjc --list-models",
    insert: "/gjc --list-models",
    scope: "gajecode",
    detailKo: "설정된 provider 모델 목록 확인",
    detailEn: "List configured provider models",
  },
  {
    command: "gjc -p <prompt>",
    insert: "/gjc -p ",
    scope: "gajecode",
    detailKo: "비대화형 프롬프트 실행 후 종료",
    detailEn: "Run a non-interactive prompt and exit",
  },
  {
    command: "gjc --continue <message>",
    insert: "/gjc --continue ",
    scope: "gajecode",
    detailKo: "이전 Gajae Code 세션 이어가기",
    detailEn: "Continue the previous Gajae Code session",
  },
  {
    command: "gjc --resume <session>",
    insert: "/gjc --resume ",
    scope: "gajecode",
    detailKo: "세션 ID 또는 경로로 재개",
    detailEn: "Resume by session id or path",
  },
  {
    command: "gjc --worktree <message>",
    insert: "/gjc --worktree ",
    scope: "gajecode",
    detailKo: "격리 worktree에서 작업 시작",
    detailEn: "Start work in an isolated worktree",
  },
  {
    command: "gjc --export <session.jsonl>",
    insert: "/gjc --export ",
    scope: "gajecode",
    detailKo: "세션 파일을 HTML로 내보내기",
    detailEn: "Export a session file to HTML",
  },
  {
    command: "gjc skills list",
    insert: "/gjc skills list",
    scope: "gajecode",
    detailKo: "격리된 Gajae Code 스킬 목록",
    detailEn: "List isolated Gajae Code skills",
  },
  {
    command: "gjc skills read <name>",
    insert: "/gjc skills read ",
    scope: "gajecode",
    detailKo: "Gajae Code 스킬 내용 읽기",
    detailEn: "Read a Gajae Code skill",
  },
  {
    command: "gjc session list",
    insert: "/gjc session list",
    scope: "gajecode",
    detailKo: "GJC 관리 tmux 세션 목록",
    detailEn: "List GJC-managed tmux sessions",
  },
  {
    command: "gjc session status <session>",
    insert: "/gjc session status ",
    scope: "gajecode",
    detailKo: "GJC 관리 세션 상태 확인",
    detailEn: "Inspect a GJC-managed session",
  },
  {
    command: "gjc setup defaults --check",
    insert: "/gjc setup defaults --check",
    scope: "gajecode",
    detailKo: "기본 설정 설치 여부만 점검",
    detailEn: "Check default setup without installing",
  },
  {
    command: "gjc setup python --check",
    insert: "/gjc setup python --check",
    scope: "gajecode",
    detailKo: "Python 도구 의존성 점검",
    detailEn: "Check Python tool dependencies",
  },
  {
    command: "gjc setup hermes --smoke",
    insert: "/gjc setup hermes --smoke",
    scope: "gajecode",
    detailKo: "Hermes MCP 설정 smoke 점검",
    detailEn: "Run Hermes MCP setup smoke checks",
  },
  {
    command: "gjc team <workers:role> <task>",
    insert: "/gjc team 3:executor ",
    scope: "gajecode",
    detailKo: "tmux 기반 병렬 코딩 팀 실행",
    detailEn: "Run a tmux-backed parallel coding team",
    primaryLabelKo: "Team",
    primaryLabelEn: "Team",
  },
  {
    command: "gjc rlm <task>",
    insert: "/gjc rlm ",
    scope: "gajecode",
    detailKo: "RLM 연구 모드 실행",
    detailEn: "Run RLM research mode",
    primaryLabelKo: "RLM",
    primaryLabelEn: "RLM",
  },
  {
    command: "gjc rlm --data <DATA.md> <task>",
    insert: "/gjc rlm --data ",
    scope: "gajecode",
    detailKo: "데이터 문서를 붙인 RLM 연구 모드",
    detailEn: "Run RLM with a data document",
  },
  {
    command: "gjc notify status",
    insert: "/gjc notify status",
    scope: "gajecode",
    detailKo: "알림/텔레그램 연동 상태 확인",
    detailEn: "Show notification or Telegram pairing status",
  },
  {
    command: "gjc notify setup",
    insert: "/gjc notify setup",
    scope: "gajecode",
    detailKo: "텔레그램 알림 설정 시작",
    detailEn: "Start Telegram notification setup",
  },
  {
    command: "gjc mcp-serve coordinator --check --json",
    insert: "/gjc mcp-serve coordinator --check --json",
    scope: "gajecode",
    detailKo: "Coordinator MCP 서버 설정 점검",
    detailEn: "Check coordinator MCP server configuration",
  },
  {
    command: "gjc web-search <query>",
    insert: "/gjc web-search ",
    scope: "gajecode",
    detailKo: "Gajae Code 웹 검색 명령",
    detailEn: "Run Gajae Code web search",
  },
  {
    command: "gjc q <query>",
    insert: "/gjc q ",
    scope: "gajecode",
    detailKo: "web-search 짧은 별칭",
    detailEn: "Short alias for web-search",
  },
  {
    command: "gjc harness --help",
    insert: "/gjc harness --help",
    scope: "gajecode",
    detailKo: "Harness 명령 도움말",
    detailEn: "Show harness command help",
  },
  {
    command: "gjc coordinator --help",
    insert: "/gjc coordinator --help",
    scope: "gajecode",
    detailKo: "Coordinator 명령 도움말",
    detailEn: "Show coordinator command help",
  },
  {
    command: "gjc team --help",
    insert: "/gjc team --help",
    scope: "gajecode",
    detailKo: "Team 명령 도움말",
    detailEn: "Show team command help",
  },
  {
    command: "gjc ultragoal --help",
    insert: "/gjc ultragoal --help",
    scope: "gajecode",
    detailKo: "Ultragoal 명령 도움말",
    detailEn: "Show ultragoal command help",
  },
  {
    command: "gjc config --help",
    insert: "/gjc config --help",
    scope: "gajecode",
    detailKo: "Config 명령 도움말",
    detailEn: "Show config command help",
  },
  {
    command: "gjc daemon --help",
    insert: "/gjc daemon --help",
    scope: "gajecode",
    detailKo: "Daemon 명령 도움말",
    detailEn: "Show daemon command help",
  },
  {
    command: "gjc contribute-pr --help",
    insert: "/gjc contribute-pr --help",
    scope: "gajecode",
    detailKo: "기여 PR 준비 명령 도움말",
    detailEn: "Show contribute-pr command help",
  },
  {
    command: "gjc deep-interview --help",
    insert: "/gjc deep-interview --help",
    scope: "gajecode",
    detailKo: "Deep interview 명령 도움말",
    detailEn: "Show deep-interview command help",
  },
  {
    command: "gjc migrate --help",
    insert: "/gjc migrate --help",
    scope: "gajecode",
    detailKo: "Migrate 명령 도움말",
    detailEn: "Show migrate command help",
  },
  {
    command: "gjc launch --help",
    insert: "/gjc launch --help",
    scope: "gajecode",
    detailKo: "Launch 명령 도움말",
    detailEn: "Show launch command help",
  },
  {
    command: "gjc update --help",
    insert: "/gjc update --help",
    scope: "gajecode",
    detailKo: "Update 명령 도움말",
    detailEn: "Show update command help",
  },
];

const GAJAE_PRIMARY_COMMANDS = GAJAE_CODE_COMMANDS.filter(
  (command) => command.primaryLabelKo && command.primaryLabelEn,
);

function activeFactoryCommandFromText(rawText: string): StellaFactoryCommand | null {
  const trimmed = rawText.trimStart();
  const slash = trimmed.match(/^\/(goal|analyze|probe|audit)(?:\s|$)/i);
  if (slash) return slash[1].toLowerCase() as StellaFactoryCommand;
  return /^(?:\/\s*)?(?:스텔라\s*(?:모드|팩토리)|stella\s+(?:mode|factory))(?:\s*(?:로|으로|를|을|는|은|:|：|\.|-|—)\s*)?/i.test(trimmed)
    ? "goal"
    : null;
}

function stripFactoryCommandPrefix(rawText: string): string {
  return rawText
    .trimStart()
    .replace(/^\/(?:goal|analyze|probe|audit)(?:\s+)?/i, "")
    .replace(/^(?:\/\s*)?(?:스텔라\s*(?:모드|팩토리)|stella\s+(?:mode|factory))(?:\s*(?:로|으로|를|을|는|은|:|：|\.|-|—)\s*)?/i, "")
    .trimStart();
}

type ComposerUiState = {
  hasText: boolean;
  slashText: string;
  factoryCommand: StellaFactoryCommand | null;
  restrictedDirectGajaeInput: boolean;
};

function composerUiStateFromText(rawText: string): ComposerUiState {
  const slashText = rawText.trimStart().startsWith("/") && !rawText.includes("\n") ? rawText : "";
  return {
    hasText: rawText.trim().length > 0,
    slashText,
    factoryCommand: activeFactoryCommandFromText(rawText),
    restrictedDirectGajaeInput: isRestrictedDirectGajaeCliInput(rawText),
  };
}

function sameComposerUiState(left: ComposerUiState, right: ComposerUiState): boolean {
  return left.hasText === right.hasText
    && left.slashText === right.slashText
    && left.factoryCommand === right.factoryCommand
    && left.restrictedDirectGajaeInput === right.restrictedDirectGajaeInput;
}

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
  intermediateDraft?: string;
  unverifiedIntermediate?: boolean;
  lifecyclePhase?: AgentLifecyclePhase;
  worktree?: AgentWorktreeInfo;
  previewEvidence?: TaskPreviewEvidence;
  reviewAnnotations?: ChangeReviewAnnotation[];
  reviewWorkflow?: ChangeReviewWorkflowState;
}

function preserveIntermediateDraft(
  message: ChatMessage,
  terminalText: string,
): string | undefined {
  const draft = message.text.trim();
  if (!draft || draft === terminalText.trim()) return message.intermediateDraft;
  return message.intermediateDraft || message.text;
}

function finalizeOrphanedStreamingMessages(messages: ChatMessage[]) {
  let changed = false;
  const next = messages.map((message) => {
    if (message.role !== "assistant" || message.status !== "streaming") return message;
    changed = true;
    return {
      ...message,
      status: "error" as const,
      unverifiedIntermediate: true,
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
  factoryCommand?: StellaFactoryCommand;
  factoryEvidence?: string;
  elementSelection?: DevScreenElementSelection;
  attachments: ChatAttachment[];
  cwd: string;
  createdAt: number;
  autoRetryCount?: number;
  notBefore?: number;
  reviewRequest?: ReviewDispatchContext;
  controlRequestId?: string;
  /** Stella Mode 단계 분할 실행 상태. 존재하면 이 턴은 특정 단계의 실행이다.
   *  오버라이드 없는 실행에는 절대 실리지 않는다 (기존 단일 실행 경로 보존). */
  stageRun?: StageRunState;
};

type SmoothRevealState = {
  carry: number;
  pauseUntil: number;
};

interface AgentSession {
  id: string;
  /** Stable opaque identity used only to bind a paired mobile task to this session. */
  mobileTaskId: string;
  title: string;
  titleEdited?: boolean;
  provider: AgentProvider;
  profileId?: string;
  profileName?: string;
  profileDot?: string;
  model: string;
  hermesProvider?: HermesInferenceProvider;
  stellaOntologyMode?: StellaOntologyMode;
  codexEffort?: WorkloadLevel;
  codexSpeed?: CodexSpeed;
  permissionMode?: AgentPermissionMode;
  queueMode?: boolean;
  worktreeEnabled?: boolean;
  worktreeInfo?: AgentWorktreeInfo;
  parallelBatchId?: string;
  parallelBatchLabel?: string;
  parallelSourceSessionId?: string;
  parallelCandidateIndex?: number;
  parallelCandidateCount?: number;
  parallelAdoptedAt?: number;
  parallelAdoptionSummary?: string;
  parallelAdoption?: AgentFleetAdoptionHistory;
  cwd: string;
  providerSessionId?: string;
  providerSessionModel?: string;
  providerSessionHermesProvider?: HermesInferenceProvider;
  tokenUsage?: SessionTokenUsage;
  subscriptionUsage?: ProviderSubscriptionUsage;
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
const MOBILE_CONTINUITY_MAX_SESSIONS = 24;
const MOBILE_CONTINUITY_MAX_MESSAGES = 60;
// Keep this aligned with Rust's mobile_continuity::MAX_TEXT_CHARS guard.
const MOBILE_CONTINUITY_MAX_MESSAGE_TEXT_CHARS = 12_000;
const MOBILE_CONTINUITY_PUBLISH_DEBOUNCE_MS = 300;
const MOBILE_CONTINUITY_HEARTBEAT_MS = 5_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function createMobileTaskId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    // The opaque task id is still protected by the paired-device bearer token.
    // This fallback keeps legacy/degraded webviews from discarding stored work.
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const PREVIEW_SERVICE_COMMAND_KEY = "atelier.agent.preview.service.command.v1";
const DEV_SCREEN_VISIBLE_KEY = "atelier.agent.devscreen.visible.v1";
const DEV_SCREEN_HOST_KEY = "atelier.agent.devscreen.host.v1";
const DEV_SCREEN_PORT_KEY = "atelier.agent.devscreen.port.v1";
const DEV_SCREEN_WINDOW_KEY = "atelier.agent.devscreen.window.v1";
const TASK_LIST_VISIBLE_KEY = "atelier.agent.tasklist.visible.v1";
const COMPOSER_HEIGHT_KEY = "atelier.agent.composer.height.v1";
const WORKSPACE_VIEW_KEY = "atelier.agent.workspace.view.v1";
const FACTORY_DEFAULT_OFF_MIGRATION_KEY = "atelier.agent.factory.defaultOff.v1";
const DEFAULT_PROVIDER: AgentProvider = "claude";
const DEFAULT_HERMES_PROVIDER: HermesInferenceProvider = "openai-codex";
const DEFAULT_WORKLOAD: WorkloadLevel = "xhigh";
const DEFAULT_CODEX_EFFORT: CodexEffort = DEFAULT_WORKLOAD;
const DEFAULT_CODEX_SPEED: CodexSpeed = "default";
const DEFAULT_PERMISSION_MODE: AgentPermissionMode = "basic";
const MAX_RAW_EVENTS = 120;
const MAX_RAW_EVENT_CHARS = 12000;
const MAX_PERSISTED_SESSIONS = 24;
const MAX_PERSISTED_MESSAGES_PER_SESSION = 80;
const MAX_PERSISTED_MESSAGE_TEXT_CHARS = 24000;
const MAX_PERSISTED_RAW_EVENTS = 24;
const MAX_PERSISTED_RAW_EVENT_CHARS = 1800;
const MAX_PERSISTED_ACTIVITIES = 16;
const MAX_PERSISTED_ATTACHMENTS = 8;
const MAX_PERSISTED_QUEUED_TURNS = 16;
const MAX_PERSISTED_CHANGE_FILES = 40;
const MAX_PERSISTED_CHANGE_DIFF_CHARS = 6000;
const MAX_PERSISTED_CHANGE_PATCH_CHARS = 12000;
const MAX_PERSISTED_REVIEW_ANNOTATIONS = 80;
const FALLBACK_PERSISTED_MESSAGES_PER_SESSION = 24;
const FALLBACK_PERSISTED_MESSAGE_TEXT_CHARS = 6000;
const MAX_COMPACT_AGENT_CONTEXT_CHARS = 9000;
const MAX_COMPACT_AGENT_CONTEXT_MESSAGES = 8;
const STREAM_FLUSH_MS = 70;
const FINAL_ONLY_WORKSPACE_STREAMING = true;
const CHANGE_BASELINE_TIMEOUT_MS = 650;
// 종료된 턴의 지각 이벤트로 프리뷰 영향 신호 맵이 무한히 자라지 않게 상한을 둔다.
const MAX_TRACKED_TURN_IMPACTS = 32;

function mobileContinuityStatus(
  session: AgentSession,
  isBusy: boolean,
): MobileControlSessionsPublishInput["sessions"][number]["status"] {
  const messages = Array.isArray(session.messages) ? session.messages : [];
  const latestMessage = messages[messages.length - 1];
  if (isBusy && latestMessage?.lifecyclePhase === "waiting_for_user") return "waiting";
  if (isBusy || latestMessage?.status === "streaming") return "running";
  if ((session.queuedTurns?.length || 0) > 0 || latestMessage?.status === "queued") return "queued";
  if (latestMessage?.role === "assistant" && latestMessage.status === "error") return "failed";
  if (latestMessage?.role === "assistant" && latestMessage.status === "done") return "completed";
  return "idle";
}

function mobileContinuityPublishInput(
  sessions: AgentSession[],
  activeSessionId: string | null,
  busyTurnIdsBySession: Record<string, string | undefined>,
): MobileControlSessionsPublishInput {
  // Mobile continuity has no full-permission execution contract. Excluding it
  // keeps one desktop-only session from rejecting the entire native snapshot.
  const publishableSessions = sessions.filter(
    (session) => session.permissionMode !== "full",
  );
  const activeSession = activeSessionId
    ? publishableSessions.find((session) => session.id === activeSessionId) || null
    : null;
  const recentSessions = [...publishableSessions]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter((session) => session.id !== activeSession?.id)
    .slice(0, MOBILE_CONTINUITY_MAX_SESSIONS - (activeSession ? 1 : 0));
  return {
    activeSessionId: activeSession?.id || null,
    sessions: (activeSession ? [activeSession, ...recentSessions] : recentSessions)
      .map((session) => ({
        sessionId: session.id,
        mobileTaskId: session.mobileTaskId,
        title: session.title,
        provider: session.provider,
        model: session.model,
        workspace: session.cwd,
        permissionMode: normalizePermissionMode(session.permissionMode),
        status: mobileContinuityStatus(session, Boolean(busyTurnIdsBySession[session.id])),
        updatedAtMs: session.updatedAt,
        messages: (Array.isArray(session.messages) ? session.messages : [])
          .filter((message): message is ChatMessage & { role: "user" | "assistant" } =>
            Boolean(
              message
              && (message.role === "user" || message.role === "assistant")
              && typeof message.text === "string"
              && message.text.trim().length > 0,
            ),
          )
          .slice(-MOBILE_CONTINUITY_MAX_MESSAGES)
          .map((message) => ({
            messageId: message.id,
            role: message.role,
            text: message.text.slice(0, MOBILE_CONTINUITY_MAX_MESSAGE_TEXT_CHARS),
            createdAtMs: message.createdAt,
            ...(message.status ? { status: message.status } : {}),
          })),
      })),
  };
}

interface MobileContinuityDispatchPayload {
  mobileContinuity: true;
  targetSessionId: string;
  mobileTaskId: string;
  revision: number;
  prompt: string;
  expectedWorkspace: string;
  expectedProvider: string;
  expectedModel: string;
  expectedPermissionMode: string;
  clientRequestId: string;
}

function parseMobileContinuityDispatchPayload(
  payload: Record<string, unknown>,
): MobileContinuityDispatchPayload | null {
  if (payload.mobileContinuity !== true) return null;
  const targetSessionId = payload.targetSessionId;
  const mobileTaskId = payload.mobileTaskId;
  const revision = payload.revision;
  const prompt = payload.prompt;
  const expectedWorkspace = payload.expectedWorkspace;
  const expectedProvider = payload.expectedProvider;
  const expectedModel = payload.expectedModel;
  const expectedPermissionMode = payload.expectedPermissionMode;
  const clientRequestId = payload.clientRequestId;
  if (
    typeof targetSessionId !== "string"
    || typeof mobileTaskId !== "string"
    || typeof revision !== "number"
    || typeof prompt !== "string"
    || typeof expectedWorkspace !== "string"
    || typeof expectedProvider !== "string"
    || typeof expectedModel !== "string"
    || typeof expectedPermissionMode !== "string"
    || typeof clientRequestId !== "string"
  ) return null;
  if (!isUuid(mobileTaskId) || !targetSessionId.trim() || !prompt.trim()) return null;
  if (!Number.isInteger(revision) || revision < 0) return null;
  return {
    mobileContinuity: true,
    targetSessionId,
    mobileTaskId,
    revision,
    prompt,
    expectedWorkspace,
    expectedProvider,
    expectedModel,
    expectedPermissionMode,
    clientRequestId,
  };
}
const SMOOTH_OUTPUT_FPS = 30;
const SMOOTH_FRAME_MS = 1000 / SMOOTH_OUTPUT_FPS;
const SMOOTH_BACKGROUND_CATCH_UP_MS = 900;
const INPUT_REVEAL_PAUSE_MS = 80;
const SESSION_PERSIST_DEBOUNCE_MS = 260;
const HERMES_GOLD = "#8a8218";
const PREVIEW_VP_SIZES: Record<Exclude<PreviewViewport, "desktop">, { w: number; h: number }> = {
  mobile: { w: 390, h: 844 },
  tablet: { w: 834, h: 1194 },
};
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

function composerMinHeight() {
  if (typeof window === "undefined") return 150;
  // Short windows wrap the action controls onto multiple rows. Keep those
  // controls usable before yielding more space to the transcript/workbench.
  if (window.innerHeight <= 600) return 180;
  if (window.innerHeight <= 720) return 156;
  return 150;
}

function composerMaxHeight() {
  if (typeof window === "undefined") return 460;
  return clampNumber(window.innerHeight - 150, composerMinHeight(), 560);
}

function initialComposerHeight() {
  const saved = Number(safeLocalStorageGet(COMPOSER_HEIGHT_KEY));
  return clampNumber(Number.isFinite(saved) && saved > 0 ? saved : 260, composerMinHeight(), composerMaxHeight());
}

function initialWorkspaceView(): WorkspaceView {
  const saved = safeLocalStorageGet(WORKSPACE_VIEW_KEY);
  return saved === "code" || saved === "changes" ? saved : "conversation";
}

function resolveWorkspaceFilePath(root: string, path: string): string {
  if (!path) return path;
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return path;
  const separator = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]$/, "")}${separator}${path}`;
}

function relativeWorkspaceFilePath(root: string, path: string): string {
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedPath = path.replace(/\\/g, "/");
  return normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : normalizedPath;
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
  if (/\btemporarily limiting requests\b/i.test(t) || /\baccounts exhausted\b/i.test(t)) return true;
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
  const hasElapsedTail = /(?:["'`])?\s+\d+(?:\.\d+)?s\s*(?:\[(?:error|exit\s+-?\d+)\])?$/i.test(t);
  if (!hasElapsedTail) return false;
  const startsLikeShell =
    /^\$?\s*(?:cd|docker|ssh|bash|sh|zsh|fish|python3?|npm|npx|pnpm|yarn|bun|cargo|git|node|deno|uv|curl|wget|rsync|scp|sed|awk|grep|rg|cat|tail|head|ls|find|mkdir|cp|mv|rm|printf|echo|pgrep|launchctl|osascript)\b/i.test(t)
    || /^\$?\s*\/(?:usr|bin|sbin|opt|Users|Volumes|volume1|tmp|var)\//i.test(t)
    || /^\$?\s*(?:\.\.?\/)?[\w./-]+\.sh\b/i.test(t);
  const containsShellChain =
    /\s(?:&&|\|\||;)\s*(?:\/(?:usr|bin|sbin|opt|Users|Volumes|volume1|tmp|var)\/)?(?:docker|python3?|npm|npx|pnpm|yarn|cargo|git|node|curl|bash|sh|find|pgrep|launchctl|printf|echo)\b/i.test(t);
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
  if (/^printf\s+['"]?=+/.test(t) && /\b(?:find|pgrep|launchctl|PlistBuddy|Applications|LaunchAgents)\b/.test(t)) return true;
  if (/\b(?:doneprintf|true\/usr\/libexec|LaunchAgents|LaunchDaemons)\b/.test(t) && /\d+(?:\.\d+)?s\s*\[exit\s+-?\d+\]$/i.test(t)) return true;
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
    defaultModel: "claude-opus-4-8",
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
  {
    id: "gajecode",
    label: "가재코드",
    short: "Gj",
    defaultModel: "claude-opus-4-8",
    dot: "#7a6f1a",
    newTitleKo: "새 가재코드 작업",
    newTitleEn: "New Gajae Code workspace",
  },
  {
    id: "grok",
    label: "Grok Build",
    short: "Gk",
    defaultModel: "grok-4.6",
    dot: "#111111",
    newTitleKo: "새 Grok 작업",
    newTitleEn: "New Grok workspace",
  },
];

const CLAUDE_MODELS: ModelOption[] = [
  { value: "claude-opus-4-8", label: "Opus 4.8" },
  { value: "claude-fable-5", label: "Fable 5" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

const OPENAI_CODEX_MODELS: ModelOption[] = [
  { value: "gpt-5.5", label: "GPT-5.5" },
];

const OPENROUTER_MODELS: ModelOption[] = [
  { value: "openai/gpt-5.5", label: "OpenAI GPT-5.5" },
  { value: "openai/gpt-5.5-pro", label: "OpenAI GPT-5.5 Pro" },
  { value: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8" },
  { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { value: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" },
];

const ALIBABA_TOKEN_PLAN_MODELS: ModelOption[] = [
  { value: "qwen3.8-max-preview", label: "Qwen 3.8 Max (Preview)" },
  { value: "qwen3.7-plus", label: "Qwen 3.7 Plus" },
  { value: "qwen3.7-max", label: "Qwen 3.7 Max" },
  { value: "qwen3.6-flash", label: "Qwen 3.6 Flash" },
  { value: "glm-5.2", label: "GLM 5.2" },
];

const CODEX_MODELS: ModelOption[] = [
  { value: "gpt-5.5", label: "GPT-5.5" },
];

const GAJECODE_MODELS: ModelOption[] = [
  { value: "claude-opus-4-8", label: "Opus 4.8" },
  { value: "claude-fable-5", label: "Fable 5" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

const GROK_MODELS: ModelOption[] = [
  { value: "grok-4.6", label: "Grok 4.6" },
  { value: "grok-4.5", label: "Grok 4.5" },
];

const GAJECODE_ALIBABA_MODELS: ModelOption[] = [
  { value: "alibaba-token-plan/qwen3.8-max-preview", label: "Qwen 3.8 Max Preview" },
  { value: "alibaba-token-plan/glm-5.2", label: "GLM 5.2" },
];

const GROK_API_MODELS: ModelOption[] = [
  { value: "grok-4.5", label: "Grok 4.5" },
  { value: "grok-4.5-latest", label: "Grok 4.5 Latest" },
  { value: "grok-build-latest", label: "Grok Build Latest" },
];

const GAJECODE_GROK_MODELS: ModelOption[] = GROK_API_MODELS.map((option) => ({
  ...option,
  value: `xai/${option.value}`,
}));

function gajecodeModelOptions(
  provider: GajaeInferenceProvider,
  claudeModels: ModelOption[],
  codexModels: ModelOption[],
): ModelOption[] {
  if (provider === "claude") return claudeModels.length > 0 ? claudeModels : GAJECODE_MODELS;
  if (provider === "alibaba") return GAJECODE_ALIBABA_MODELS;
  if (provider === "grok") return GAJECODE_GROK_MODELS;
  return (codexModels.length > 0 ? codexModels : CODEX_MODELS).map((option) => ({
    ...option,
    value: `codex/${option.value}`,
  }));
}

const MODEL_OPTIONS: Record<AgentProvider, ModelOption[]> = {
  claude: CLAUDE_MODELS,
  hermes: OPENAI_CODEX_MODELS,
  codex: CODEX_MODELS,
  gajecode: GAJECODE_MODELS,
  grok: GROK_MODELS,
};

const HERMES_PROVIDERS: Array<{ value: HermesInferenceProvider; label: string }> = [
  { value: "openai-codex", label: "Codex" },
  { value: "anthropic", label: "Claude" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "alibaba", label: "Alibaba Cloud" },
  { value: "grok", label: "Grok" },
];

const GAJECODE_PROVIDERS: Array<{ value: GajaeInferenceProvider; label: string }> = [
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
  { value: "alibaba", label: "Alibaba Cloud" },
  { value: "grok", label: "Grok" },
];

const HERMES_MODEL_OPTIONS: Record<HermesInferenceProvider, ModelOption[]> = {
  "openai-codex": OPENAI_CODEX_MODELS,
  anthropic: CLAUDE_MODELS,
  openrouter: OPENROUTER_MODELS,
  alibaba: ALIBABA_TOKEN_PLAN_MODELS,
  grok: GROK_API_MODELS,
};

const CODEX_EFFORTS: Array<{ value: CodexEffort; ko: string; en: string }> = [
  { value: "low", ko: "낮음", en: "Low" },
  { value: "medium", ko: "중간", en: "Medium" },
  { value: "high", ko: "높음", en: "High" },
  { value: "xhigh", ko: "매우 높음", en: "Very high" },
  { value: "ultra", ko: "울트라 코드", en: "Ultra Code" },
];

const GROK_API_EFFORTS = CODEX_EFFORTS.filter((option) =>
  option.value === "low" || option.value === "medium" || option.value === "high");

function coerceGrokApiEffort(value: WorkloadLevel): CodexEffort {
  return value === "low" || value === "medium" ? value : "high";
}

const OPENROUTER_EFFORTS: Array<{ value: OpenRouterEffort; ko: string; en: string }> = [
  { value: "none", ko: "추론 끔", en: "Reasoning off" },
  { value: "minimal", ko: "최소", en: "Minimal" },
  { value: "low", ko: "낮음", en: "Low" },
  { value: "medium", ko: "중간", en: "Medium" },
  { value: "high", ko: "높음", en: "High" },
  { value: "xhigh", ko: "매우 높음", en: "Very high" },
  { value: "max", ko: "최대", en: "Maximum" },
];

const GAJECODE_QWEN_THINKING: Array<{ value: OpenRouterEffort; ko: string; en: string }> = [
  { value: "none", ko: "추론 끔", en: "Reasoning off" },
  { value: "high", ko: "추론 켬", en: "Reasoning on" },
];

const GAJECODE_GLM_EFFORTS = OPENROUTER_EFFORTS;

const CODEX_SPEEDS: Array<{ value: CodexSpeed; ko: string; en: string }> = [
  { value: "default", ko: "기본", en: "Default" },
  { value: "fast", ko: "빠름", en: "Fast" },
];

const PERMISSION_MODES: Array<{
  value: VisiblePermissionMode;
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
    detailKo: "읽기 전용 점검",
    detailEn: "Read-only inspection",
    icon: I.hand,
  },
  {
    value: "auto",
    ko: "자동 검토",
    en: "Auto review",
    detailKo: "샌드박스 수정 + 위험 명령 승인",
    detailEn: "Sandboxed edits + command approval",
    icon: I.shieldCheck,
  },
];

const isProvider = (value: unknown): value is AgentProvider =>
  value === "claude" || value === "hermes" || value === "codex" || value === "gajecode" || value === "grok";

const normalizeSessionProvider = (value: unknown): AgentProvider => {
  if (isProvider(value)) return value;
  if (typeof value !== "string") return DEFAULT_PROVIDER;

  const normalized = value.trim().toLowerCase();
  if (normalized === "gajae" || normalized === "gajec" || normalized === "gjc" || normalized === "gajaecode") {
    return "gajecode";
  }
  if (normalized === "가재코드") return "gajecode";
  if (normalized === "grok" || normalized === "grok-build" || normalized === "xai") return "grok";
  return DEFAULT_PROVIDER;
};

const isHermesProvider = (value: unknown): value is HermesInferenceProvider =>
  value === "openai-codex" || value === "anthropic" || value === "openrouter" || value === "alibaba" || value === "grok";

const isGajaeProvider = (value: unknown): value is GajaeInferenceProvider =>
  value === "claude" || value === "codex" || value === "alibaba" || value === "grok";

const isCodexEffort = (value: unknown): value is CodexEffort =>
  value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "ultra";

const isOpenRouterEffort = (value: unknown): value is OpenRouterEffort =>
  value === "none"
  || value === "minimal"
  || value === "low"
  || value === "medium"
  || value === "high"
  || value === "xhigh"
  || value === "max";

const isWorkloadLevel = (value: unknown): value is WorkloadLevel =>
  isCodexEffort(value) || isOpenRouterEffort(value);

const isCodexSpeed = (value: unknown): value is CodexSpeed =>
  value === "default" || value === "fast";

const PREVIEW_CAPABILITY_FAIL_CLOSED: PreviewCapability = {
  managed_start: false,
  external_loopback_inspection: true,
  managed_start_reason: null,
};

function managedAgentPermissionDisabledReason(
  provider: AgentProvider,
  capability: AgentRuntimeCapability | undefined,
  language: Tweaks["language"],
  _capabilityError?: string | null,
) {
  // The adapter registry is authoritative. Loading or refreshing this
  // metadata must not create a blanket composer lock on a supported Mac.
  if (!capability || capability.supports_managed_agent_send) return null;
  const unsupportedPlatform = /unsupported|platform|sandbox-exec|macos/i.test(
    capability.managed_agent_send_disabled_reason || "",
  );
  if (provider === "gajecode") {
    return language === "en"
      ? unsupportedPlatform
        ? "Gajae Code managed tasks require Atelier's supported macOS isolated runtime. Direct GJC, Team, and RLM commands remain available."
        : "Gajae Code needs runtime repair. Open Settings > Connections > Gajae Code and run Install/repair. Direct GJC, Team, and RLM commands remain available."
      : unsupportedPlatform
        ? "가재코드 관리 작업은 Atelier가 지원하는 macOS 격리 런타임이 필요합니다. GJC·Team·RLM 직접 명령은 계속 사용할 수 있습니다."
        : "가재코드 실행 준비를 복구해야 합니다. 설정 > 연결 > 가재코드에서 설치·복구를 실행하세요. GJC·Team·RLM 직접 명령은 계속 사용할 수 있습니다.";
  }
  if (provider === "hermes") {
    return language === "en"
      ? unsupportedPlatform
        ? "Hermes managed tasks require Atelier's supported macOS isolated runtime."
        : "Hermes needs runtime or authentication repair. Open Settings > Connections > Hermes and run Install/repair."
      : unsupportedPlatform
        ? "Hermes 관리 작업은 Atelier가 지원하는 macOS 격리 런타임이 필요합니다."
        : "Hermes 실행 또는 인증 준비를 복구해야 합니다. 설정 > 연결 > Hermes에서 설치·복구를 실행하세요.";
  }
  if (provider === "grok") {
    return language === "en"
      ? unsupportedPlatform
        ? "Grok managed tasks require Atelier's verified macOS isolated runtime."
        : "Grok needs runtime or authentication repair. Open Settings > Connections > Grok and run Install/repair."
      : unsupportedPlatform
        ? "Grok 관리 작업은 Atelier가 검증한 macOS 격리 런타임이 필요합니다."
        : "Grok 실행 또는 인증 준비를 복구해야 합니다. 설정 > 연결 > Grok에서 설치·복구를 실행하세요.";
  }
  return capability.managed_agent_send_disabled_reason
    || (language === "en"
      ? `${providerMeta(provider).label} managed agent execution is unavailable.`
      : `${providerMeta(provider).label} 관리형 에이전트 실행을 사용할 수 없습니다.`);
}

function managedPermissionControlDisabledReason(
  provider: AgentProvider,
  capability: AgentRuntimeCapability | undefined,
  language: Tweaks["language"],
) {
  if (!capability || capability.supports_permission_mode) return null;
  return language === "en"
    ? `${providerMeta(provider).label} cannot apply Atelier Basic/Auto permissions on this runtime.`
    : `${providerMeta(provider).label}는 현재 실행환경에서 Atelier Basic/Auto 권한을 적용할 수 없습니다.`;
}

function runtimeCapabilityObservationNotice(
  provider: AgentProvider,
  capabilityError: string | null,
  language: Tweaks["language"],
) {
  if (!capabilityError || (provider !== "hermes" && provider !== "gajecode" && provider !== "grok")) return null;
  return language === "en"
    ? "Atelier could not refresh runtime readiness. You can still send the task; if preparation fails, use Install/repair in Settings > Connections."
    : "실행 준비 상태를 새로 확인하지 못했습니다. 작업은 계속 보낼 수 있으며, 준비가 실패하면 설정 > 연결에서 설치·복구를 실행하세요.";
}

function actionableManagedAgentFailure(
  provider: AgentProvider,
  error: unknown,
  language: Tweaks["language"],
) {
  const raw = cleanAgentText(String(error instanceof Error ? error.message : error)).replace(/^Error:\s*/i, "");
  if (provider !== "hermes" && provider !== "gajecode" && provider !== "grok") return raw;
  const lower = raw.toLowerCase();
  const authenticationFailure = /\b401\b|\b403\b|unauthori[sz]ed|authentication|invalid credentials?|api[-_\s]?key|oauth|refresh token|log(?:ged)? in|sign in/.test(lower);
  if (authenticationFailure) {
    return language === "en"
      ? "The selected model provider needs authentication. Open Settings > Connections, reconnect its subscription or API key, then send the task again."
      : "선택한 모델 공급자의 인증이 필요합니다. 설정 > 연결에서 해당 구독 또는 API 키를 다시 연결한 뒤 작업을 다시 보내세요.";
  }
  const runtimeFailure = /managed runtime|runtime readiness|bootstrap|installer|isolated skill|readiness receipt|provenance|executable is missing|runtime preparation/.test(lower);
  if (runtimeFailure) {
    const agent = provider === "gajecode"
      ? (language === "en" ? "Gajae Code" : "가재코드")
      : provider === "grok"
        ? "Grok"
        : "Hermes";
    return language === "en"
      ? `${agent} automatic preparation failed. Open Settings > Connections > ${agent}, run Install/repair, then send the task again.`
      : `${agent} 자동 준비에 실패했습니다. 설정 > 연결 > ${agent}에서 설치·복구를 실행한 뒤 작업을 다시 보내세요.`;
  }
  return raw;
}

function isRestrictedDirectGajaeCliInput(rawText: string) {
  const classified = classifyGajaePrefixedInput(rawText);
  if (classified.kind === "cli") return true;
  const command = rawText.trim().split(/\s+/, 1)[0]?.toLowerCase();
  return command === "/skills" || command === "/mcp" || command === "/status";
}

const isPermissionMode = (value: unknown): value is VisiblePermissionMode =>
  value === "basic" || value === "auto";

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
  if (first === "gjc" || first === "gajae-code" || first === "cmdc" || first === "command-code" || (first === "cmd" && /가재|gajae|command code/i.test(profile.name))) return "gajecode";
  if (first === "grok" || /grok build|xai/i.test(profile.name)) return "grok";
  return null;
}

function defaultHermesModel(hermesProvider: HermesInferenceProvider) {
  if (hermesProvider === "anthropic") return CLAUDE_MODELS[0].value;
  if (hermesProvider === "openrouter") return "openai/gpt-5.5";
  if (hermesProvider === "alibaba") return "qwen3.8-max-preview";
  if (hermesProvider === "grok") return "grok-4.5";
  return "gpt-5.5";
}

function subscriptionProviderForSession(
  provider: AgentProvider,
  hermesProvider: HermesInferenceProvider,
  gajaeProvider: GajaeInferenceProvider,
): "codex" | "claude" | null {
  if (provider === "codex") return "codex";
  if (provider === "claude") return "claude";
  if (provider === "hermes" && hermesProvider === "openai-codex") return "codex";
  if (provider === "hermes" && hermesProvider === "anthropic") return "claude";
  if (provider === "gajecode" && gajaeProvider === "codex") return "codex";
  if (provider === "gajecode" && gajaeProvider === "claude") return "claude";
  return null;
}

function defaultGajaeModel(provider: GajaeInferenceProvider) {
  if (provider === "codex") return "codex/gpt-5.5";
  if (provider === "alibaba") return GAJECODE_ALIBABA_MODELS[0].value;
  if (provider === "grok") return GAJECODE_GROK_MODELS[0].value;
  return "claude-opus-4-8";
}

function modelOptionsFor(
  provider: AgentProvider,
  selected?: string | null,
  hermesProvider: HermesInferenceProvider = DEFAULT_HERMES_PROVIDER,
  claudeModels: ModelOption[] = CLAUDE_MODELS,
  codexModels: ModelOption[] = CODEX_MODELS,
  openRouterModels: ModelOption[] = OPENROUTER_MODELS,
) {
  const liveClaudeModels = claudeModels.length > 0 ? claudeModels : CLAUDE_MODELS;
  const liveCodexModels = codexModels.length > 0 ? codexModels : CODEX_MODELS;
  const liveOpenRouterModels = openRouterModels.length > 0 ? openRouterModels : OPENROUTER_MODELS;
  const options = provider === "hermes"
    ? (hermesProvider === "openai-codex"
        ? liveCodexModels
        : hermesProvider === "anthropic"
          ? liveClaudeModels
        : hermesProvider === "openrouter"
          ? liveOpenRouterModels
          : HERMES_MODEL_OPTIONS[hermesProvider])
      : provider === "codex"
        ? liveCodexModels
      : provider === "claude"
          ? liveClaudeModels
          : provider === "gajecode"
            ? gajecodeModelOptions(inferGajaeProviderFromModel(selected), liveClaudeModels, liveCodexModels)
            : provider === "grok"
              ? GROK_MODELS
            : MODEL_OPTIONS[provider] || [];
  const trimmed = selected?.trim();
  if (!trimmed || options.some((option) => option.value === trimmed)) return options;
  return [{ value: trimmed, label: `현재 선택: ${trimmed}` }, ...options];
}

function labelForOption(options: ModelOption[], value: string) {
  return options.find((option) => option.value === value)?.label || value;
}

function sanitizeModelOptions(options: ModelOption[]) {
  const seen = new Set<string>();
  const clean: ModelOption[] = [];
  for (const option of options) {
    const value = option.value?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    clean.push({
      value,
      label: option.label?.trim() || value,
      disabled: option.disabled,
      supported_reasoning_levels: option.supported_reasoning_levels,
      default_reasoning_level: option.default_reasoning_level,
      requires_multi_agent_v2: option.requires_multi_agent_v2,
    });
  }
  return clean;
}

function coerceModelToOptions(model: string, options: ModelOption[]) {
  if (model.trim()) return model;
  return options.find((option) => !option.disabled)?.value || model;
}

function normalizeCodexEffort(value?: unknown): CodexEffort {
  if (isCodexEffort(value)) return value;
  if (value === "max") return "ultra";
  if (value === "minimal" || value === "none") return "low";
  return DEFAULT_CODEX_EFFORT;
}

function normalizeWorkloadLevel(value?: unknown): WorkloadLevel {
  return isWorkloadLevel(value) ? value : DEFAULT_WORKLOAD;
}

function normalizeWorkloadInput(value: string): WorkloadLevel | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  if (isWorkloadLevel(normalized)) return normalized;
  if (["none", "off", "disabled", "추론끔", "끔"].includes(normalized)) return "none";
  if (["minimal", "minimum", "최소"].includes(normalized)) return "minimal";
  if (["low", "light", "basic", "낮음", "가벼움", "작게"].includes(normalized)) return "low";
  if (["medium", "normal", "balanced", "중간", "보통", "기본"].includes(normalized)) return "medium";
  if (["high", "deep", "높음", "깊게"].includes(normalized)) return "high";
  if (["xhigh", "veryhigh", "매우높음", "아주높음"].includes(normalized)) return "xhigh";
  if (["max", "maximum", "최대"].includes(normalized)) return "max";
  if (["ultra", "ultracode", "울트라", "울트라코드"].includes(normalized)) return "ultra";
  return null;
}

function openRouterEffortOptions(model: string, options: ModelOption[]) {
  const metadata = options.find((option) => option.value === model);
  const supported = metadata?.supported_reasoning_levels;
  if (!supported?.length) return [];
  return OPENROUTER_EFFORTS.filter((option) => supported.includes(option.value));
}

function coerceOpenRouterEffort(
  workload: WorkloadLevel,
  model: string,
  options: ModelOption[],
): OpenRouterEffort | null {
  const effortOptions = openRouterEffortOptions(model, options);
  if (!effortOptions.length) return null;
  const supported = effortOptions.map((option) => option.value);
  const mapped = workload === "ultra" ? "max" : workload;
  if (isOpenRouterEffort(mapped) && supported.includes(mapped)) return mapped;
  const metadataDefault = options.find((option) => option.value === model)?.default_reasoning_level;
  if (isOpenRouterEffort(metadataDefault) && supported.includes(metadataDefault)) return metadataDefault;
  if (supported.includes("medium")) return "medium";
  return supported[0] || null;
}

function gajecodeAlibabaEffortOptions(model: string) {
  return model.includes("/glm-5.2") ? GAJECODE_GLM_EFFORTS : GAJECODE_QWEN_THINKING;
}

function coerceGajaeAlibabaEffort(workload: WorkloadLevel, model: string): OpenRouterEffort {
  if (!model.includes("/glm-5.2")) return workload === "none" ? "none" : "high";
  if (workload === "ultra") return "max";
  return isOpenRouterEffort(workload) ? workload : "medium";
}

function nativeCodexEffort(workload: WorkloadLevel, model: string, options: ModelOption[]): string {
  const codexWorkload = normalizeCodexEffort(workload);
  const supported = options.find((option) => option.value === model)?.supported_reasoning_levels || [];
  if (supported.includes(codexWorkload)) return codexWorkload;
  if (codexWorkload === "ultra" && supported.includes("max")) return "max";
  if (codexWorkload === "ultra" && supported.includes("xhigh")) return "xhigh";
  return codexWorkload === "ultra" ? "xhigh" : codexWorkload;
}

function normalizeCodexSpeed(value?: unknown): CodexSpeed {
  return isCodexSpeed(value) ? value : DEFAULT_CODEX_SPEED;
}

function normalizeHermesProvider(value?: unknown): HermesInferenceProvider {
  return normalizeHermesModelProvider(value);
}

function normalizePermissionMode(value?: unknown): AgentPermissionMode {
  if (typeof value !== "string") return DEFAULT_PERMISSION_MODE;
  const normalized = value.trim().toLowerCase();
  if (normalized === "basic" || normalized === "default") return "basic";
  if (normalized === "auto" || normalized === "autoreview" || normalized === "auto-review") return "auto";
  if (normalized === "full" || normalized === "bypass" || normalized === "danger") return "basic";
  return DEFAULT_PERMISSION_MODE;
}

function labelForCodexEffort(value: CodexEffort, language: Tweaks["language"]) {
  const option = CODEX_EFFORTS.find((item) => item.value === value) || CODEX_EFFORTS[0];
  return language === "en" ? option.en : option.ko;
}

function labelForWorkload(value: WorkloadLevel, language: Tweaks["language"]) {
  const option = OPENROUTER_EFFORTS.find((item) => item.value === value)
    || CODEX_EFFORTS.find((item) => item.value === value)
    || CODEX_EFFORTS[0];
  return language === "en" ? option.en : option.ko;
}

function labelForCodexSpeed(value: CodexSpeed, language: Tweaks["language"]) {
  const option = CODEX_SPEEDS.find((item) => item.value === value) || CODEX_SPEEDS[0];
  return language === "en" ? option.en : option.ko;
}

function compactCodexModelLabel(label: string, value: string) {
  const raw = (label || value).trim();
  return raw
    .replace(/^OpenAI\s+/i, "")
    .replace(/^GPT[-\s]*/i, "")
    .replace(/^Codex[-\s]*/i, "")
    .trim() || value;
}

function codexToolbarLabel(modelLabel: string, modelValue: string) {
  return compactCodexModelLabel(modelLabel, modelValue);
}

function workloadDirectiveForPrompt(workload: WorkloadLevel, language: Tweaks["language"]) {
  const label = labelForWorkload(workload, language);
  const detail = {
    none: language === "en"
      ? "Disable optional model reasoning and answer directly."
      : "선택형 모델 추론을 끄고 직접적으로 처리하세요.",
    minimal: language === "en"
      ? "Use the smallest available reasoning budget and keep latency low."
      : "가능한 최소 추론 예산을 사용해 지연을 낮추세요.",
    low: language === "en"
      ? "Keep the pass light and concise. Prefer the smallest safe change."
      : "가볍고 빠르게 처리하세요. 안전한 최소 변경을 우선하세요.",
    medium: language === "en"
      ? "Use a balanced pass. Inspect enough context, implement, and verify the result."
      : "균형 있게 진행하세요. 필요한 맥락을 확인하고 구현과 검증을 함께 수행하세요.",
    high: language === "en"
      ? "Use a deeper pass. Check edge cases, preserve existing behavior, and verify carefully."
      : "더 깊게 진행하세요. 경계 사례와 기존 동작 보존을 확인하고 꼼꼼히 검증하세요.",
    xhigh: language === "en"
      ? "Use the deepest practical pass. Plan, inspect, implement, recover from failures, and verify evidence before finishing."
      : "가능한 가장 깊게 진행하세요. 계획, 조사, 구현, 실패 복구, 증거 검증까지 마친 뒤 종료하세요.",
    max: language === "en"
      ? "Use the maximum reasoning budget supported by the selected model."
      : "선택한 모델이 지원하는 최대 추론 예산을 사용하세요.",
    ultra: language === "en"
      ? "Use Ultra Code mode. Treat this as a full autonomous coding pass: decompose the goal, inspect the codebase, make coordinated edits, run focused verification, recover from failures, and summarize evidence."
      : "울트라 코드 모드로 진행하세요. 목표를 개발 작업으로 분해하고, 코드베이스를 조사하고, 필요한 수정을 통합적으로 수행하고, 집중 검증과 실패 복구를 거쳐 증거 중심으로 마무리하세요.",
  }[workload];
  return language === "en"
    ? `Workload: ${label} (${workload}). ${detail}`
    : `작업량: ${label}(${workload}). ${detail}`;
}

function formatWorkloadAgentPrompt(prompt: string, workload: WorkloadLevel, language: Tweaks["language"], provider: AgentProvider) {
  // Codex receives normal levels through native model_reasoning_effort. Ultra Code needs an explicit app-level directive too.
  if ((provider === "codex" || provider === "grok") && workload !== "ultra") return prompt;
  return `${workloadDirectiveForPrompt(workload, language)}\n\n${prompt}`;
}

function labelForPermissionMode(value: AgentPermissionMode, language: Tweaks["language"]) {
  const option = PERMISSION_MODES.find((item) => item.value === normalizePermissionMode(value)) || PERMISSION_MODES[0];
  return language === "en" ? option.en : option.ko;
}

function permissionUsageMessage(language: Tweaks["language"]) {
  return language === "en" ? "Usage: /permission basic|auto" : "사용법: /permission basic|auto";
}

function permissionFullRejectedMessage(language: Tweaks["language"]) {
  return language === "en"
    ? "Atelier no longer exposes /permission full. Legacy full-bypass values fall back to read-only Basic; use Auto Review only for sandboxed workspace edits."
    : "Atelier는 더 이상 /permission full을 노출하지 않습니다. 기존 full-bypass 값은 읽기 전용 Basic으로 강등되며, 샌드박스 작업공간 수정에만 Auto Review를 사용하세요.";
}

function findModelOptionValue(options: ModelOption[], input: string) {
  const query = input.trim().toLowerCase();
  if (!query) return null;
  return options.find((option) =>
    !option.disabled && (option.value.toLowerCase() === query || option.label.toLowerCase() === query),
  )?.value || null;
}

function slashCommandsFor(
  provider: AgentProvider,
  hermesProvider: HermesInferenceProvider,
  modelOptions: ModelOption[],
): SlashCommandSpec[] {
  const modelValues = modelOptions.filter((option) => !option.disabled).map((option) => option.value).join(" | ");
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
      detailKo: "스텔라 모드 호환 Goal 호출. 기본 사용은 버튼의 자연어 런처를 권장",
      detailEn: "Stella Mode-compatible Goal call. Prefer the button's natural-language launcher",
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
      command: "/isolation workspace|worktree",
      insert: "/isolation ",
      scope: "atelier",
      detailKo: "현재 작업을 원본 폴더 또는 격리 Git worktree에서 실행",
      detailEn: "Run this task in the source workspace or an isolated Git worktree",
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
      command: "/permission basic|auto",
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
    {
      command: "/workload low|medium|high|xhigh|ultra",
      insert: "/workload ",
      scope: provider,
      detailKo: "작업량 변경",
      detailEn: "Change workload",
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
        command: "/provider openai-codex|anthropic|openrouter|alibaba",
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

  if (provider === "gajecode") {
    return [
      ...common,
      {
        command: "/provider claude|codex|alibaba",
        insert: "/provider ",
        scope: "gajecode",
        detailKo: "가재코드 하위 provider 변경",
        detailEn: "Change Gajae Code sub-provider",
      },
      ...GAJAE_CODE_COMMANDS,
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

function modelLookupKey(value: string) {
  return value.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, " ");
}

function normalizeModel(provider: AgentProvider, model?: string | null) {
  const trimmed = model?.trim();
  if (!trimmed) return providerMeta(provider).defaultModel;
  const key = modelLookupKey(trimmed);

  if (provider === "claude") {
    const legacy: Record<string, string> = {
	      default: "claude-sonnet-4-6",
	      sonnet: "claude-sonnet-4-6",
	      opus: "claude-opus-4-8",
        "opus 48": "claude-opus-4-8",
        "opus 4.8": "claude-opus-4-8",
        "opus 47": "claude-opus-4-8",
        "opus 4.7": "claude-opus-4-8",
	      haiku: "claude-haiku-4-5-20251001",
	      best: "claude-opus-4-8",
	      opusplan: "claude-opus-4-8",
	      "sonnet[1m]": "claude-sonnet-4-6",
	      "opus[1m]": "claude-opus-4-8",
      fable: "claude-fable-5",
      "fable 55": "claude-fable-5",
      "fable 5": "claude-fable-5",
      "fable 5.5": "claude-fable-5",
      "claude-fable-55": "claude-fable-5",
      "claude-fable-5": "claude-fable-5",
      "claude-fable-5.5": "claude-fable-5",
      "claude-fable-5-5": "claude-fable-5",
        "claude-opus-48": "claude-opus-4-8",
        "claude-opus-4.8": "claude-opus-4-8",
        "claude-opus-47": "claude-opus-4-8",
        "claude-opus-4.7": "claude-opus-4-8",
	      "claude-opus-4-7": "claude-opus-4-8",
	      "claude-opus-4-1": "claude-opus-4-8",
	      "claude-opus-4-1-20250805": "claude-opus-4-8",
	      "claude-opus-4-20250514": "claude-opus-4-8",
      "sonnet 46": "claude-sonnet-4-6",
      "sonnet 4.6": "claude-sonnet-4-6",
      "claude-sonnet-46": "claude-sonnet-4-6",
      "claude-sonnet-4.6": "claude-sonnet-4-6",
      "claude-sonnet-4": "claude-sonnet-4-6",
      "claude-sonnet-4-20250514": "claude-sonnet-4-6",
      "haiku 45": "claude-haiku-4-5-20251001",
      "haiku 4.5": "claude-haiku-4-5-20251001",
      "claude-haiku-45": "claude-haiku-4-5-20251001",
      "claude-haiku-4.5": "claude-haiku-4-5-20251001",
      "claude-haiku-4-5": "claude-haiku-4-5-20251001",
      "claude-3-5-haiku-latest": "claude-haiku-4-5-20251001",
      "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
    };
    return legacy[key] || trimmed;
  }

  if (provider === "codex") {
    return trimmed;
  }

  if (provider === "gajecode") {
    if (key.startsWith("codex/")) return trimmed;
    const legacy: Record<string, string> = {
      default: "claude-opus-4-8",
      opus: "claude-opus-4-8",
      "opus 48": "claude-opus-4-8",
      "opus 4.8": "claude-opus-4-8",
      "opus 47": "claude-opus-4-8",
      "opus 4.7": "claude-opus-4-8",
      best: "claude-opus-4-8",
      fable: "claude-fable-5",
      "fable 55": "claude-fable-5",
      "fable 5": "claude-fable-5",
      "fable 5.5": "claude-fable-5",
      sonnet: "claude-sonnet-4-6",
      haiku: "claude-haiku-4-5-20251001",
      "deepseek/deepseek-v4-flash": "claude-opus-4-8",
      "deepseek/deepseek-v4-pro": "claude-opus-4-8",
      "gpt-5.5": "claude-opus-4-8",
      "openai/gpt-5.5": "claude-opus-4-8",
      "claude-opus-48": "claude-opus-4-8",
      "claude-opus-4.8": "claude-opus-4-8",
      "claude-opus-47": "claude-opus-4-8",
      "claude-opus-4.7": "claude-opus-4-8",
      "claude-opus-4-7": "claude-opus-4-8",
      "claude-opus-4-1": "claude-opus-4-8",
      "claude-opus-4-1-20250805": "claude-opus-4-8",
      "claude-opus-4-20250514": "claude-opus-4-8",
      "claude-fable-55": "claude-fable-5",
      "claude-fable-5": "claude-fable-5",
      "claude-fable-5.5": "claude-fable-5",
      "claude-fable-5-5": "claude-fable-5",
      "sonnet 46": "claude-sonnet-4-6",
      "sonnet 4.6": "claude-sonnet-4-6",
      "claude-sonnet-46": "claude-sonnet-4-6",
      "claude-sonnet-4.6": "claude-sonnet-4-6",
      "claude-sonnet-4": "claude-sonnet-4-6",
      "claude-sonnet-4-20250514": "claude-sonnet-4-6",
      "haiku 45": "claude-haiku-4-5-20251001",
      "haiku 4.5": "claude-haiku-4-5-20251001",
      "claude-haiku-45": "claude-haiku-4-5-20251001",
      "claude-haiku-4.5": "claude-haiku-4-5-20251001",
      "claude-haiku-4-5": "claude-haiku-4-5-20251001",
      "claude-3-5-haiku-latest": "claude-haiku-4-5-20251001",
      "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
    };
    return legacy[key] || trimmed;
  }

  return trimmed;
}

function normalizeHermesModel(hermesProvider: HermesInferenceProvider, model?: string | null) {
  const trimmed = normalizeModel("hermes", model);
  if (!trimmed || trimmed === providerMeta("hermes").defaultModel) return defaultHermesModel(hermesProvider);
  if (hermesProvider === "anthropic") {
    const candidate = trimmed.startsWith("anthropic/")
      ? trimmed.slice("anthropic/".length)
      : normalizeModel("claude", trimmed);
    return candidate || defaultHermesModel(hermesProvider);
  }
  if (hermesProvider === "alibaba") {
    const aliases: Record<string, string> = {
      "qwen3.8": "qwen3.8-max-preview",
      "qwen-3.8": "qwen3.8-max-preview",
      "qwen3.8-max": "qwen3.8-max-preview",
      "glm5.2": "glm-5.2",
      "glm-5-2": "glm-5.2",
    };
    const candidate = aliases[trimmed.toLowerCase()] || trimmed;
    return ALIBABA_TOKEN_PLAN_MODELS.some((option) => option.value === candidate)
      ? candidate
      : defaultHermesModel(hermesProvider);
  }
  if (hermesProvider === "grok") {
    return GROK_API_MODELS.some((option) => option.value === trimmed)
      ? trimmed
      : defaultHermesModel(hermesProvider);
  }
  if (hermesProvider === "openrouter") {
    if (/^gpt-5\.(?:2|3-codex|4|4-mini)$/.test(trimmed)) return "openai/gpt-5.5";
    const legacy: Record<string, string> = {
      "gpt-5.5": "openai/gpt-5.5",
	      "claude-opus-4-8": "anthropic/claude-opus-4.8",
	      "claude-opus-4-7": "anthropic/claude-opus-4.8",
      "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
      "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
    };
    return legacy[trimmed] || trimmed;
  }
  if (hermesProvider === "openai-codex" && trimmed.startsWith("openai/")) {
    return trimmed.slice("openai/".length);
  }
  if (hermesProvider === "openai-codex") {
    return trimmed;
  }
  return trimmed;
}

const nowId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function providerCooldownSecondsFromText(text?: string | null): number | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const looksLikeCooldown =
    lower.includes("temporarily limiting requests") ||
    lower.includes("accounts exhausted") ||
    lower.includes("server is temporarily limiting") ||
    (lower.includes("retry in") && lower.includes("not your usage limit")) ||
    text.includes("공급자 계정 풀이 일시 제한") ||
    text.includes("서버 쪽 요청 제한");
  if (!looksLikeCooldown) return null;
  const retryMatch = lower.match(/retry\s+in\s+(\d+)\s*s\b/);
  const koreanMatch = text.match(/(?:약\s*)?(\d+)\s*초/);
  const seconds = retryMatch
    ? Number.parseInt(retryMatch[1], 10)
    : koreanMatch
      ? Number.parseInt(koreanMatch[1], 10)
      : 300;
  if (!Number.isFinite(seconds) || seconds <= 0) return 300;
  return Math.min(Math.max(seconds, 5), 900);
}

function compactTextForPersistence(text: string | undefined, maxChars: number) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n... truncated for Atelier local history ...`;
}

function compactRawEventsForPersistence(rawEvents?: string[]) {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) return [];
  return rawEvents
    .slice(-MAX_PERSISTED_RAW_EVENTS)
    .map((event) => compactTextForPersistence(event, MAX_PERSISTED_RAW_EVENT_CHARS));
}

function compactChangeSummaryForPersistence(summary?: AgentChangeSummary | null): AgentChangeSummary | null | undefined {
  if (!summary) return summary;
  return {
    ...summary,
    files: Array.isArray(summary.files)
      ? summary.files.slice(0, MAX_PERSISTED_CHANGE_FILES).map((file) => ({
          ...file,
          diff: compactTextForPersistence(file.diff, MAX_PERSISTED_CHANGE_DIFF_CHARS),
        }))
      : [],
    patch:
      typeof summary.patch === "string" && summary.patch.length <= MAX_PERSISTED_CHANGE_PATCH_CHARS
        ? summary.patch
        : "",
  };
}

function compactMessageForPersistence(message: ChatMessage, textLimit = MAX_PERSISTED_MESSAGE_TEXT_CHARS): ChatMessage {
  return {
    ...message,
    text: compactTextForPersistence(message.text, textLimit),
    intermediateDraft: message.intermediateDraft
      ? compactTextForPersistence(message.intermediateDraft, textLimit)
      : undefined,
    changes: compactChangeSummaryForPersistence(message.changes),
    reviewAnnotations: Array.isArray(message.reviewAnnotations)
      ? normalizeReviewAnnotations(message.reviewAnnotations).slice(-MAX_PERSISTED_REVIEW_ANNOTATIONS)
      : undefined,
    reviewWorkflow: normalizeReviewWorkflowState(message.reviewWorkflow),
    changesLoading: false,
    activities: Array.isArray(message.activities)
      ? message.activities.slice(-MAX_PERSISTED_ACTIVITIES).map((activity) => ({ ...activity, active: false }))
      : undefined,
    attachments: Array.isArray(message.attachments)
      ? message.attachments.slice(-MAX_PERSISTED_ATTACHMENTS)
      : undefined,
    rawEvents: compactRawEventsForPersistence(message.rawEvents),
  };
}

function compactQueuedTurnForPersistence(turn: QueuedAgentTurn): QueuedAgentTurn {
  const elementSelection = normalizeDevScreenElementSelection(turn.elementSelection);
  return {
    ...turn,
    text: compactTextForPersistence(turn.text, MAX_PERSISTED_MESSAGE_TEXT_CHARS),
    displayText: compactTextForPersistence(turn.displayText, MAX_PERSISTED_MESSAGE_TEXT_CHARS),
    factoryEvidence: compactTextForPersistence(turn.factoryEvidence, MAX_PERSISTED_MESSAGE_TEXT_CHARS),
    elementSelection: elementSelection || undefined,
    reviewRequest: normalizeReviewDispatchContext(turn.reviewRequest),
    attachments: Array.isArray(turn.attachments) ? turn.attachments.slice(-MAX_PERSISTED_ATTACHMENTS) : [],
    stageRun: normalizeStageRunState(turn.stageRun) || undefined,
  };
}

function compactSessionForPersistence(session: AgentSession, fallback = false): AgentSession {
  const messageLimit = fallback ? FALLBACK_PERSISTED_MESSAGES_PER_SESSION : MAX_PERSISTED_MESSAGES_PER_SESSION;
  const textLimit = fallback ? FALLBACK_PERSISTED_MESSAGE_TEXT_CHARS : MAX_PERSISTED_MESSAGE_TEXT_CHARS;
  return {
    ...session,
    messages: Array.isArray(session.messages)
      ? session.messages.slice(-messageLimit).map((message) => compactMessageForPersistence(message, textLimit))
      : [],
    queuedTurns: Array.isArray(session.queuedTurns)
      ? session.queuedTurns.slice(-MAX_PERSISTED_QUEUED_TURNS).map(compactQueuedTurnForPersistence)
      : [],
    rawEvents: compactRawEventsForPersistence(session.rawEvents),
  };
}

function compactSessionsForPersistence(sessions: AgentSession[], fallback = false) {
  return sessions
    .slice(0, MAX_PERSISTED_SESSIONS)
    .map((session) => compactSessionForPersistence(session, fallback));
}

function persistSessions(sessions: AgentSession[]) {
  try {
    const compacted = compactSessionsForPersistence(sessions);
    if (safeLocalStorageSet(SESSIONS_KEY, JSON.stringify(compacted))) return;
    safeLocalStorageSet(SESSIONS_KEY, JSON.stringify(compactSessionsForPersistence(sessions, true)));
  } catch (err) {
    console.warn("persist sessions skipped", err);
  }
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
    const raw = safeLocalStorageGet(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed) && parsed.length > 0) {
      const shouldResetLegacyStellaDefault = safeLocalStorageGet(FACTORY_DEFAULT_OFF_MIGRATION_KEY) !== "1";
      if (shouldResetLegacyStellaDefault) safeLocalStorageSet(FACTORY_DEFAULT_OFF_MIGRATION_KEY, "1");
      return parsed.map((session: Partial<AgentSession>) => {
        const provider = normalizeSessionProvider(session.provider);
        const meta = providerMeta(provider);
        const hermesProvider = provider === "hermes"
          ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
          : undefined;
        const stellaOntologyMode = shouldResetLegacyStellaDefault && session.stellaOntologyMode === "stella"
          ? "direct"
          : normalizeStellaOntologyMode(session.stellaOntologyMode, provider);
        return {
          id: session.id || nowId("agent"),
          mobileTaskId: isUuid(session.mobileTaskId) ? session.mobileTaskId : createMobileTaskId(),
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
          stellaOntologyMode,
          codexEffort: normalizeWorkloadLevel(session.codexEffort),
          codexSpeed: provider === "codex" ? normalizeCodexSpeed(session.codexSpeed) : undefined,
          permissionMode: normalizePermissionMode(session.permissionMode),
          queueMode: Boolean(session.queueMode),
          worktreeEnabled: Boolean(session.worktreeEnabled),
          worktreeInfo:
            session.worktreeInfo
            && typeof session.worktreeInfo.source_cwd === "string"
            && typeof session.worktreeInfo.worktree_cwd === "string"
            && typeof session.worktreeInfo.branch === "string"
              ? session.worktreeInfo
              : undefined,
          parallelBatchId: typeof session.parallelBatchId === "string" ? session.parallelBatchId : undefined,
          parallelBatchLabel: typeof session.parallelBatchLabel === "string" ? session.parallelBatchLabel : undefined,
          parallelSourceSessionId: typeof session.parallelSourceSessionId === "string" ? session.parallelSourceSessionId : undefined,
          parallelCandidateIndex: typeof session.parallelCandidateIndex === "number" ? session.parallelCandidateIndex : undefined,
          parallelCandidateCount: typeof session.parallelCandidateCount === "number" ? session.parallelCandidateCount : undefined,
          parallelAdoptedAt: typeof session.parallelAdoptedAt === "number" ? session.parallelAdoptedAt : undefined,
          parallelAdoptionSummary: typeof session.parallelAdoptionSummary === "string" ? session.parallelAdoptionSummary : undefined,
          parallelAdoption: finalizeInterruptedAgentFleetAdoption(
            normalizeAgentFleetAdoptionHistory(session.parallelAdoption)
              || legacyAgentFleetAdoptionHistory({
                adoptedAt: typeof session.parallelAdoptedAt === "number" ? session.parallelAdoptedAt : undefined,
                summary: typeof session.parallelAdoptionSummary === "string" ? session.parallelAdoptionSummary : undefined,
                batchId: typeof session.parallelBatchId === "string" ? session.parallelBatchId : undefined,
                candidateSessionId: session.id,
                sourceSessionId: typeof session.parallelSourceSessionId === "string" ? session.parallelSourceSessionId : undefined,
              }),
          ),
          cwd: session.cwd || "",
          providerSessionId: session.providerSessionId,
          providerSessionModel: typeof session.providerSessionModel === "string" ? session.providerSessionModel : undefined,
          providerSessionHermesProvider: isHermesProvider(session.providerSessionHermesProvider)
            ? session.providerSessionHermesProvider
            : undefined,
          tokenUsage: normalizeSessionTokenUsage(session.tokenUsage),
          subscriptionUsage: normalizeSubscriptionUsage(session.subscriptionUsage),
          messages: Array.isArray(session.messages)
              ? finalizeOrphanedStreamingMessages(session.messages.map((message) => ({
                ...message,
                reviewAnnotations: normalizeReviewAnnotations(message.reviewAnnotations),
                reviewWorkflow: finalizeInterruptedReviewWorkflow(message.reviewWorkflow),
              })))
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
                  elementSelection: normalizeDevScreenElementSelection(turn.elementSelection) || undefined,
                  reviewRequest: normalizeReviewDispatchContext(turn.reviewRequest),
                  attachments: Array.isArray(turn.attachments) ? turn.attachments : [],
                  cwd: typeof turn.cwd === "string" ? turn.cwd : "",
                  createdAt: typeof turn.createdAt === "number" ? turn.createdAt : Date.now(),
                  notBefore: typeof turn.notBefore === "number" ? turn.notBefore : undefined,
                  stageRun: normalizeStageRunState(turn.stageRun) || undefined,
                }))
            : [],
          rawEvents: Array.isArray(session.rawEvents) ? session.rawEvents : [],
          previewUrl: restoreAutoPreviewUrl(session.previewUrl),
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
  } catch (error) {
    console.warn("load agent sessions failed", error);
  }
  return [];
}

function clipRawEvent(raw: string) {
  return raw.length > MAX_RAW_EVENT_CHARS
    ? `${raw.slice(0, MAX_RAW_EVENT_CHARS)}\n... truncated ...`
    : raw;
}

function findPreviewUrl(text?: string | null) {
  return findUrl(text);
}

function cleanStoredPreviewUrl(text?: string | null) {
  if (!text) return "";
  return findPreviewUrl(text) || text.trim();
}

function isLocalPreviewUrl(url?: string | null) {
  return isAutoReviewablePreviewUrl(url);
}

function devScreenMatchesPreview(diagnostics: DevScreenDiagnosticsResult | null | undefined, previewUrl: string) {
  return previewDiagnosticsMatchPreview(diagnostics, previewUrl);
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

function improveReadableMarkdown(text: string) {
  if (!text) return text;
  const lines = text.split("\n");
  let inCodeFence = false;
  const out = lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      return line;
    }
    if (inCodeFence) return line;
    const trimmed = line.trim();
    if (
      !trimmed ||
      /^(\||#{1,6}\s|[-*+]\s|\d+\.\s|>|<\/?\w+)/.test(trimmed)
    ) {
      return line;
    }
    return line
      .replace(/([^\n])\s+(\d{1,2})\.\s+(?=\S)/g, "$1\n\n$2. ")
      .replace(/\s+(이\s+\d+개(?:가|는)\s+)/g, "\n\n$1")
      .replace(/\s+(대상\s+코드베이스\b)/g, "\n\n$1")
      .replace(/\s+(혹시\s+[^.?!。]*[?？])\s*/g, "\n\n$1\n\n")
      .replace(/\s+(예를\s+들어[:：]?)/g, "\n\n$1");
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanAgentDelta(text?: string | null) {
  if (!text) return "";
  // A delta is only one fragment of the response. ANSI and CRLF sequences can
  // both straddle fragment/flush boundaries, so preserve it byte-for-byte
  // until the accumulated display value is available.
  return text;
}

function normalizeAgentDisplayText(text: string) {
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
      && cleanAgentText(message.text).trim().length > 0
      && !containsProtectedActionIntent(cleanAgentText(message.text))
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
  explicitContext?: string | null,
  attachments: ChatAttachment[] = [],
) {
  const context = explicitContext
    ? language === "en"
      ? ["", "", "---", "Atelier bounded context:", explicitContext].join("\n")
      : ["", "", "---", "Atelier 제한 컨텍스트:", explicitContext].join("\n")
    : "";
  const attachmentContext = formatAttachmentPrompt(attachments, language);
  const fastPatchContext = formatFastPatchPrompt(text, language);
  const instruction = language === "en"
    ? [
        "",
        "",
        "---",
	        "Atelier display guidance:",
	        "- Maintain a professional, respectful tone. If the user writes in Korean, answer in polite Korean 존댓말 and never use casual 반말.",
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
	        "- 대표님께 답변하듯 전문적이고 공손하게 답변하세요. 한국어 답변은 항상 존댓말을 사용하고 반말, 거친 명령형, 친한 척하는 구어체를 쓰지 마세요.",
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
  explicitContext: string | null,
  attachments: ChatAttachment[],
  mode: StellaOntologyMode,
  provider: AgentProvider,
  factoryEnabled: boolean,
  cwd?: string | null,
) {
  const base = formatAgentPrompt(text, language, explicitContext, attachments);
  const ontology = formatStellaOntologyInstruction({
    mode,
    language,
    providerLabel: providerMeta(provider).label,
    cwd,
  });
  const factory = factoryEnabled
    ? formatStellaFactoryInstruction({
        language,
        provider,
        providerLabel: providerMeta(provider).label,
        cwd,
      })
    : "";
  const requestLabel = language === "en" ? "User request:" : "대표님 요청:";
  const layers = [factory, ontology].filter(Boolean).join("\n\n");
  if (!layers) return base;
  return `${layers}\n\n---\n${requestLabel}\n${base}`;
}

function revealCharsPerSecond(remaining: number) {
  if (remaining > 9000) return 920;
  if (remaining > 4200) return 760;
  if (remaining > 1600) return 560;
  if (remaining > 520) return 420;
  return 260;
}

function revealFrameCap(remaining: number) {
  if (remaining > 4200) return 22;
  if (remaining > 1600) return 16;
  if (remaining > 520) return 10;
  return 6;
}

function revealPauseMs(target: string, nextLength: number, remainingAfter: number) {
  const ch = target[nextLength - 1];
  if (!ch) return 0;
  const longAnswerScale = remainingAfter > 4200 ? 0.45 : remainingAfter > 1200 ? 0.7 : 1;
  if (ch === "\n") return Math.round((target[nextLength] === "\n" ? 55 : 30) * longAnswerScale);
  if (/[.!?。！？]/.test(ch)) return Math.round(45 * longAnswerScale);
  if (/[,;:，、]/.test(ch)) return Math.round(15 * longAnswerScale);
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

interface AgentActivityViewProps {
  createdAt: number;
  currentLabel: string;
  language: Tweaks["language"];
  icon: React.ReactNode;
  dark: boolean;
  canStop: boolean;
  stopping: boolean;
  stopLabel: string;
  stoppingLabel: string;
  onStop: () => void;
}

const AgentActivityView = React.memo(function AgentActivityView({
  createdAt,
  currentLabel,
  language,
  icon,
  dark,
  canStop,
  stopping,
  stopLabel,
  stoppingLabel,
  onStop,
}: AgentActivityViewProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [createdAt]);
  const elapsedSec = Math.max(0, Math.floor((now - createdAt) / 1000));
  const elapsedLabel = language === "en"
    ? `Working for ${elapsedSec}s`
    : `${elapsedSec}s 동안 작업 중입니다`;

  return (
    <div className="atelier-activity-codex" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="atelier-activity-elapsed">{elapsedLabel}</div>
        {canStop && (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            className={cls(
              "shrink-0 h-8 rounded-[7px] border px-3 inline-flex items-center gap-2 text-[12px] font-medium disabled:opacity-50",
              dark
                ? "border-[#7a4638] bg-[#2a211e] text-[#f28b68] hover:bg-[#342722]"
                : "border-[#d7a08a] bg-[#fff4ef] text-[#b94f2f] hover:bg-[#ffe8df]",
            )}
            aria-label={stopping ? stoppingLabel : stopLabel}
            title={stopping ? stoppingLabel : stopLabel}
            data-testid="agent-stop-activity"
          >
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-current" />
            <span>{stopping ? stoppingLabel : stopLabel}</span>
          </button>
        )}
      </div>
      <div className="atelier-activity-line atelier-activity-active">
        <span className="atelier-activity-icon" aria-hidden="true">{icon}</span>
        <span className="atelier-activity-label">{currentLabel}</span>
      </div>
    </div>
  );
});

const AgentWorkspace: React.FC<{ tw: Tweaks; onOpenTerminal?: () => void; isActive?: boolean }> = ({
  tw,
  onOpenTerminal,
  isActive = true,
}) => {
  const dark = tw.dark;
  const [sessions, setSessions] = useState<AgentSession[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string | null>(() => safeLocalStorageGet(ACTIVE_KEY));
  const [composerUi, setComposerUi] = useState<ComposerUiState>(() => composerUiStateFromText(""));
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [isPastingImage, setIsPastingImage] = useState(false);
  const [cwd, setCwd] = useState(() => safeLocalStorageGet(CWD_KEY) || "");
  // Stella Mode 단계별 모델 배정 — 전역 기본값(localStorage). 실행 시작 시
  // 스냅샷을 payload.stageRun 에 넣으므로 실행 중 변경은 진행 중 런에 영향 없다.
  const [stageModelAssignments, setStageModelAssignments] = useState<StageModelAssignments>(
    () => parseStageModelAssignments(safeLocalStorageGet(STAGE_MODELS_STORAGE_KEY)).assignments,
  );
  const stageModelAssignmentsRef = useRef<StageModelAssignments>(stageModelAssignments);
  const [showStageModelPanel, setShowStageModelPanel] = useState(false);
  const [stageRunStatusBySession, setStageRunStatusBySession] = useState<
    Record<string, { stage: StellaStage; stageIndex: number; provider: string; model: string } | null>
  >({});
  const updateStageModelAssignment = (stage: StellaStage, model: string) => {
    setStageModelAssignments((current) => {
      const next: StageModelAssignments = { ...current };
      if (!model) {
        delete next[stage];
      } else {
        next[stage] = { ...(next[stage] || {}), model };
      }
      stageModelAssignmentsRef.current = next;
      safeLocalStorageSet(STAGE_MODELS_STORAGE_KEY, serializeStageModelAssignments(next));
      return next;
    });
  };
  const setStageRunStatus = (
    sessionId: string,
    status: { stage: StellaStage; stageIndex: number; provider: string; model: string } | null,
  ) => {
    setStageRunStatusBySession((current) => ({ ...current, [sessionId]: status }));
  };
  const [showTaskList, setShowTaskList] = useState(() => safeLocalStorageGet(TASK_LIST_VISIBLE_KEY) !== "0");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => initialWorkspaceView());
  const [workspaceChanges, setWorkspaceChanges] = useState<AgentChangeSummary | null>(null);
  const [workspaceChangesLoading, setWorkspaceChangesLoading] = useState(false);
  const [workspaceChangesError, setWorkspaceChangesError] = useState<string | null>(null);
  const [workbenchFilePath, setWorkbenchFilePath] = useState<string | null>(null);
  const [workbenchInitialLine, setWorkbenchInitialLine] = useState<number | null>(null);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const isActiveRef = useRef(isActive);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenIndex, setQuickOpenIndex] = useState(0);
  const [quickOpenFiles, setQuickOpenFiles] = useState<FsEntry[]>([]);
  const [quickOpenIndexedEntries, setQuickOpenIndexedEntries] = useState<AgentQuickOpenIndexEntry[]>([]);
  const quickOpenInputRef = useRef<HTMLInputElement>(null);
  const [showPreview, setShowPreview] = useState(
    () => resolvePreviewVisibilityFallback(
      safeLocalStorageGet(PREVIEW_VISIBLE_KEY),
      safeLocalStorageGet(DEV_SCREEN_VISIBLE_KEY),
    ),
  );
  const [previewUrl, setPreviewUrl] = useState(() => cleanStoredPreviewUrl(safeLocalStorageGet(PREVIEW_KEY) || ""));
  const previewUrlRef = useRef(previewUrl);
  const [previewInput, setPreviewInput] = useState(() => cleanStoredPreviewUrl(safeLocalStorageGet(PREVIEW_KEY) || ""));
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [previewCheck, setPreviewCheck] = useState<PreviewCheckResult | null>(null);
  const [previewChecking, setPreviewChecking] = useState(false);
  const [previewDiagnostics, setPreviewDiagnostics] = useState<PreviewDiagnostic[]>([]);
  const [previewService, setPreviewService] = useState<PreviewServiceStatus | null>(null);
  const [previewCapabilityState, setPreviewCapabilityState] = useState<PreviewCapability>(PREVIEW_CAPABILITY_FAIL_CLOSED);
  const [previewCapabilityError, setPreviewCapabilityError] = useState<string | null>(null);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<AgentRuntimeCapability[] | null>(null);
  const [runtimeCapabilityError, setRuntimeCapabilityError] = useState<string | null>(null);
  const [managedRuntimeProgress, setManagedRuntimeProgress] = useState<
    Partial<Record<AgentProvider, ManagedAgentRuntimeProgress>>
  >({});
  const [previewServiceCommand, setPreviewServiceCommand] = useState(() =>
    cleanStoredPreviewServiceCommand(safeLocalStorageGet(PREVIEW_SERVICE_COMMAND_KEY) || ""),
  );
  const [previewServiceBusy, setPreviewServiceBusy] = useState(false);
  const [showDevScreen, setShowDevScreen] = useState(() => safeLocalStorageGet(DEV_SCREEN_VISIBLE_KEY) === "1");
  const [devScreenHost, setDevScreenHost] = useState(() => safeLocalStorageGet(DEV_SCREEN_HOST_KEY) || "127.0.0.1");
  const [devScreenPort, setDevScreenPort] = useState(() => safeLocalStorageGet(DEV_SCREEN_PORT_KEY) || "");
  const [devScreenWindow, setDevScreenWindow] = useState(() => safeLocalStorageGet(DEV_SCREEN_WINDOW_KEY) || "main");
  const [devScreenBusy, setDevScreenBusy] = useState(false);
  const [devScreenStatusResult, setDevScreenStatusResult] = useState<DevScreenStatusResult | null>(null);
  const [devScreenScreenshotResult, setDevScreenScreenshotResult] = useState<DevScreenScreenshotResult | null>(null);
  const [devScreenSnapshotResult, setDevScreenSnapshotResult] = useState<DevScreenSnapshotResult | null>(null);
  const [devScreenDiagnosticsResult, setDevScreenDiagnosticsResult] = useState<DevScreenDiagnosticsResult | null>(null);
  const [devScreenCheckResult, setDevScreenCheckResult] = useState<DevScreenCheckResult | null>(null);
  const devScreenDiagnosticsResultRef = useRef<DevScreenDiagnosticsResult | null>(devScreenDiagnosticsResult);
  const devScreenCheckResultRef = useRef<DevScreenCheckResult | null>(devScreenCheckResult);
  devScreenDiagnosticsResultRef.current = devScreenDiagnosticsResult;
  devScreenCheckResultRef.current = devScreenCheckResult;
  const devScreenCheckUrlRef = useRef("");
  const devScreenArmKeyRef = useRef("");
  const [devScreenActionResult, setDevScreenActionResult] = useState<DevScreenActionResult | null>(null);
  const [devScreenError, setDevScreenError] = useState<string | null>(null);
  const [devScreenJsCode, setDevScreenJsCode] = useState("document.title");
  const [devScreenSelector, setDevScreenSelector] = useState("button");
  const [devScreenText, setDevScreenText] = useState("");
  const [devScreenKeyName, setDevScreenKeyName] = useState("Enter");
  const [devScreenResizeWidth, setDevScreenResizeWidth] = useState("1440");
  const [devScreenResizeHeight, setDevScreenResizeHeight] = useState("980");
  const [devScreenPickerStatus, setDevScreenPickerStatus] = useState<DevScreenElementPickerResult["status"]>("idle");
  const [devScreenElementSelection, setDevScreenElementSelection] = useState<DevScreenElementSelection | null>(null);
  const [devScreenSelectionAttached, setDevScreenSelectionAttached] = useState(false);
  const [devScreenPickerError, setDevScreenPickerError] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(() =>
    clampNumber(Number(safeLocalStorageGet(PREVIEW_WIDTH_KEY)) || 430, 320, 760),
  );
  const [resizingPreview, setResizingPreview] = useState(false);
  const [composerHeight, setComposerHeight] = useState(() => initialComposerHeight());
  const [resizingComposer, setResizingComposer] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState<React.CSSProperties | null>(null);
  const [claudeRuntimeModels, setClaudeRuntimeModels] = useState<ModelOption[]>(CLAUDE_MODELS);
  const [codexRuntimeModels, setCodexRuntimeModels] = useState<ModelOption[]>(CODEX_MODELS);
  const [openRouterRuntimeModels, setOpenRouterRuntimeModels] = useState<ModelOption[]>(OPENROUTER_MODELS);
  const [previewVP, setPreviewVP] = useState<PreviewViewport>(() => {
    const saved = safeLocalStorageGet(PREVIEW_VP_KEY);
    return saved === "mobile" || saved === "tablet" || saved === "desktop" ? saved : "desktop";
  });
  const sessionsRef = useRef<AgentSession[]>(sessions);
  const refreshClaudeRuntimeModels = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const result = await claudeModelOptions();
      const next = sanitizeModelOptions(result.models || []);
      if (next.length > 0) setClaudeRuntimeModels(next);
    } catch (err) {
      console.warn("claude model options refresh failed", err);
    }
  }, []);
  const refreshCodexRuntimeModels = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const result = await codexModelOptions();
      const next = sanitizeModelOptions(result.models || []);
      if (next.length > 0) setCodexRuntimeModels(next);
    } catch (err) {
      console.warn("codex model options refresh failed", err);
    }
  }, []);
  const refreshOpenRouterRuntimeModels = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const result = await openRouterModelOptions();
      const next = sanitizeModelOptions(result.models || []);
      if (next.length > 0) setOpenRouterRuntimeModels(next);
    } catch (err) {
      console.warn("openrouter model options refresh failed", err);
    }
  }, []);

  useEffect(() => {
    isActiveRef.current = isActive;
    if (!isActive) setShowQuickOpen(false);
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    refreshClaudeRuntimeModels().catch(console.error);
    refreshCodexRuntimeModels().catch(console.error);
    refreshOpenRouterRuntimeModels().catch(console.error);
    const timer = window.setInterval(() => {
      refreshClaudeRuntimeModels().catch(console.error);
      refreshCodexRuntimeModels().catch(console.error);
      refreshOpenRouterRuntimeModels().catch(console.error);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [isActive, refreshClaudeRuntimeModels, refreshCodexRuntimeModels, refreshOpenRouterRuntimeModels]);

  useEffect(() => {
    if (!isTauri()) {
      setPreviewCapabilityState(PREVIEW_CAPABILITY_FAIL_CLOSED);
      setPreviewCapabilityError(null);
      return;
    }
    let cancelled = false;
    previewCapability()
      .then((result) => {
        if (cancelled) return;
        setPreviewCapabilityState({
          managed_start: Boolean(result?.managed_start),
          external_loopback_inspection: result?.external_loopback_inspection !== false,
          managed_start_reason: result?.managed_start_reason || null,
        });
        setPreviewCapabilityError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setPreviewCapabilityState(PREVIEW_CAPABILITY_FAIL_CLOSED);
        setPreviewCapabilityError(String(error instanceof Error ? error.message : error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      setRuntimeCapabilities([
        {
          id: "claude",
          label: "Claude Code",
          cli: "claude",
          auth_owner: "provider_cli",
          adapter_provider: "claude",
          execution_controller: "claude_cli_sandbox",
          skill_owner: "claude_cli",
          automatic_online_runtime_bootstrap: false,
          supports_resume: true,
          supports_model_catalog: true,
          supports_permission_mode: true,
          supports_managed_agent_send: true,
          managed_agent_send_disabled_reason: null,
        },
        {
          id: "codex",
          label: "Codex CLI",
          cli: "codex",
          auth_owner: "provider_cli",
          adapter_provider: "codex",
          execution_controller: "codex_cli_sandbox",
          skill_owner: "codex_cli",
          automatic_online_runtime_bootstrap: false,
          supports_resume: true,
          supports_model_catalog: true,
          supports_permission_mode: true,
          supports_managed_agent_send: true,
          managed_agent_send_disabled_reason: null,
        },
        {
          id: "hermes",
          label: "Hermes Agent",
          cli: "hermes",
          auth_owner: "provider_or_scoped_backend_bridge",
          adapter_provider: "hermes",
          execution_controller: "atelier_macos_sandbox_exec",
          skill_owner: "atelier_managed_hermes",
          automatic_online_runtime_bootstrap: true,
          supports_resume: true,
          supports_model_catalog: true,
          supports_permission_mode: true,
          supports_managed_agent_send: true,
          managed_agent_send_disabled_reason: null,
        },
        {
          id: "gajecode",
          label: "Gajae Code",
          cli: "gjc",
          auth_owner: "atelier_scoped_provider_bridge",
          adapter_provider: "gajecode",
          execution_controller: "atelier_macos_sandbox_exec",
          skill_owner: "gajecode_isolated",
          automatic_online_runtime_bootstrap: true,
          supports_resume: true,
          supports_model_catalog: true,
          supports_permission_mode: true,
          supports_managed_agent_send: true,
          managed_agent_send_disabled_reason: null,
        },
        {
          id: "grok",
          label: "Grok Build",
          cli: "grok",
          auth_owner: "grok_cli_or_xai_api_key",
          adapter_provider: "grok",
          execution_controller: "atelier_macos_sandbox_exec+grok_seatbelt",
          skill_owner: "grok_isolated_home",
          automatic_online_runtime_bootstrap: true,
          supports_resume: true,
          supports_model_catalog: false,
          supports_permission_mode: true,
          supports_managed_agent_send: true,
          managed_agent_send_disabled_reason: null,
        },
      ]);
      setRuntimeCapabilityError(null);
      return;
    }
    let cancelled = false;
    agentRuntimeCapabilities()
      .then((result) => {
        if (cancelled) return;
        setRuntimeCapabilities(result);
        setRuntimeCapabilityError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setRuntimeCapabilities([]);
        setRuntimeCapabilityError(String(error instanceof Error ? error.message : error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    onManagedAgentRuntimeProgress((event) => {
      if (cancelled) return;
      setManagedRuntimeProgress((current) => ({ ...current, [event.provider]: event }));
    })
      .then((dispose) => {
        if (cancelled) dispose();
        else unlisten = dispose;
      })
      .catch((error) => console.warn("managed runtime progress listener failed", error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  const {
    busyTurnIdsBySession,
    busyTurnIdsRef,
    stoppingTurnId,
    beginRunForSession,
    finishRunForSession,
    markTurnInterrupted,
    markTurnStopped,
    markStoppingTurn,
    clearStoppingTurn,
    turnTerminationIntent,
    clearTurnIntent,
  } = useSessionRunRegistry();

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const publish = () => {
      if (disposed) return;
      try {
        const input = mobileContinuityPublishInput(sessions, activeId, busyTurnIdsBySession);
        void mobileControlSessionsPublish(input)
          .catch((error) => console.warn("mobile continuity session publish failed", error));
      } catch (error) {
        console.warn("mobile continuity session projection failed", error);
      }
    };
    const debounceTimer = window.setTimeout(publish, MOBILE_CONTINUITY_PUBLISH_DEBOUNCE_MS);
    const heartbeatTimer = window.setInterval(publish, MOBILE_CONTINUITY_HEARTBEAT_MS);
    return () => {
      disposed = true;
      window.clearTimeout(debounceTimer);
      window.clearInterval(heartbeatTimer);
    };
  }, [activeId, busyTurnIdsBySession, sessions]);

  const [visibleTextById, setVisibleTextById] = useState<Record<string, string>>({});
  const [reviewOpenById, setReviewOpenById] = useState<Record<string, boolean>>({});
  const [expandedDiffByKey, setExpandedDiffByKey] = useState<Record<string, boolean>>({});
  const [reviewTargetKey, setReviewTargetKey] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState("");
  const [logsOpenById, setLogsOpenById] = useState<Record<string, boolean>>({});
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [showParallelLauncher, setShowParallelLauncher] = useState(false);
  const [parallelProfileIds, setParallelProfileIds] = useState<string[]>([]);
  const [parallelLaunching, setParallelLaunching] = useState(false);
  const [parallelError, setParallelError] = useState<string | null>(null);
  const [stoppingParallelBatchId, setStoppingParallelBatchId] = useState<string | null>(null);
  const [adoptCandidateId, setAdoptCandidateId] = useState<string | null>(null);
  const [adoptingCandidateId, setAdoptingCandidateId] = useState<string | null>(null);
  const [adoptError, setAdoptError] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [slashSelection, setSlashSelection] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const inputDraftRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const slashMenuPopoverRef = useRef<HTMLDivElement | null>(null);
  const skipRenameCommitRef = useRef(false);
  const previewHydratingSessionRef = useRef<string | null>(null);
  const pendingStreamRef = useRef<Record<string, PendingAgentStream>>({});
  const providerCooldownRetryTimersRef = useRef<Record<string, number>>({});
  const animatedAssistantIdsRef = useRef<Set<string>>(new Set());
  const backgroundedAssistantIdsRef = useRef<Set<string>>(new Set());
  const smoothTargetsRef = useRef<Record<string, string>>({});
  const smoothRevealStateRef = useRef<Record<string, SmoothRevealState>>({});
  const smoothFrameRef = useRef<number | null>(null);
  const smoothLastTickRef = useRef(0);
  const lastActivityPulseRef = useRef<Record<string, { key: string; at: number }>>({});
  // 이번 턴이 워크스페이스/프리뷰를 건드렸는지 스트림에서 직접 누적한다.
  // 프리뷰 검증 카드는 이 신호가 "영향 있음"일 때만 붙는다.
  const turnPreviewImpactRef = useRef<Record<string, TurnPreviewImpact>>({});
  // 스트림으로 관측이 안 되는 레인(가재코드·Hermes) 전용 실측 baseline id.
  // "변경 검토" 버튼이 쥔 baseline 과 반드시 다른 id 여야 한다 — agent_change_summary 가
  // 넘긴 id 를 소비하므로, 같은 id 를 쓰면 사용자의 변경 검토가 죽는다.
  const turnPreviewProbeBaselineRef = useRef<Record<string, string>>({});
  const scrollFrameRef = useRef<number | null>(null);
  const inputRevealPauseUntilRef = useRef(0);
  const persistSessionsTimerRef = useRef<number | null>(null);
  const autoScrollRef = useRef(true);
  const activeIdRef = useRef<string | null>(activeId);
  const previewResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const composerResizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const controlRequestHandlerRef = useRef<(request: AtelierControlRequest) => Promise<void>>(
    async () => undefined,
  );
  const controlRequestProcessingRef = useRef<Set<string>>(new Set());

  const syncComposerUi = (next: string) => {
    const nextUi = composerUiStateFromText(next);
    setComposerUi((current) => sameComposerUiState(current, nextUi) ? current : nextUi);
  };

  const setComposerInput = (next: string) => {
    inputDraftRef.current = next;
    const el = inputRef.current;
    if (el && el.value !== next) el.value = next;
    setComposerUi(composerUiStateFromText(next));
  };

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
        quickOpen: "Quick Open",
        quickOpenPlaceholder: "Search commands, tasks, files, symbols, branches, and worktrees",
        quickOpenEmpty: "No matching workspace result.",
        quickOpenRecent: "Workspace index",
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
        previewServicePolicyDisabled: "Atelier-managed start is disabled for security. Run a separately trusted localhost service first, then inspect its URL here.",
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
        devScreenPickElement: "Select element",
        devScreenPickingElement: "Click an element in the target app · Esc to cancel",
        devScreenCancelPick: "Cancel selection",
        devScreenSelectedElement: "Selected element",
        devScreenAttachSelection: "Add to next request",
        devScreenSelectionAttached: "Included in next request",
        devScreenClearSelection: "Clear",
        devScreenPickerRequiresApp: "Element selection requires the installed Atelier app.",
        devScreenActionOk: "Screen action complete",
        devScreenActionFailed: (message: string) => `Screen action failed: ${message}`,
        cwd: "Working folder",
        noAgentProfiles: "No Claude/Hermes/Codex/Gajae Code profiles in Settings.",
        parallel: "Parallel",
        parallelTitle: "Parallel worktrees",
        parallelDescription: "Send this prompt to multiple isolated agents, then compare their results.",
        parallelSelect: "Select at least two agents.",
        parallelPromptRequired: "Enter a prompt before starting parallel work.",
        parallelGitRequired: "Parallel worktrees require a Git repository working folder.",
        parallelLaunch: "Run in parallel",
        parallelLaunching: "Preparing...",
        parallelPresetCore: "Core 2",
        parallelPresetBalanced: "Balanced 3",
        parallelPresetAll: "All",
        parallelCompare: "Parallel results",
        parallelCandidates: (count: number) => `${count} candidates`,
        parallelProgress: (completed: number, count: number) => `${completed}/${count} finished`,
        parallelRunning: "running",
        parallelDone: "done",
        parallelFailed: "failed",
        parallelWaiting: "waiting",
        parallelNoChanges: "No changes yet",
        parallelNoResponse: "No final response yet",
        parallelOpen: "Open",
        parallelAdopt: "Adopt changes",
        parallelAdopting: "Adopting...",
        parallelAdopted: "Adopted",
        parallelAdoptionVerifying: "Verifying adoption",
        parallelAdoptionFailed: "Adoption failed",
        parallelAdoptionCancelled: "Adoption interrupted",
        parallelAdoptionEvidence: "Adoption evidence",
        parallelPatchReceipt: "Patch receipt",
        parallelAdoptTitle: "Adopt this candidate?",
        parallelAdoptDescription: "Atelier will verify the complete patch against the source workspace before applying it. Conflicts leave the source untouched.",
        parallelAdoptDirty: "The source workspace already has local changes. Non-overlapping edits are preserved; overlapping edits are rejected.",
        parallelAdoptCancel: "Cancel",
        parallelAdoptFailed: (message: string) => `Adoption failed: ${message}`,
        parallelStopAll: "Stop all",
        parallelStoppingAll: "Stopping...",
        factoryLabel: "Stella Mode",
        factoryLauncherTitle: "Start or resume a Stella Mode autonomous development session",
        placeholder: "Ask the selected agent to change, inspect, or explain this workspace...",
        send: "Send",
        stop: "Stop",
        stopping: "Stopping...",
        stopHint: "A running turn finishes through the selected CLI; terminal fallback remains available.",
        stoppedResponse: "Run stopped by the user.",
        stopFailed: (message: string) => `Stop failed: ${message}`,
        noMessages: "Start a structured agent session. Messages and raw events are saved locally.",
        events: "Events",
        emptyEvents: "No stream events yet.",
        renameHint: "Double-click to rename",
        agentLabel: "Agent",
        providerLabel: "Model provider",
        modelLabel: "Model",
        workloadLabel: "Workload",
        permissionLabel: "Permission",
        ontologyLabel: "Mode",
        intelligence: "Intelligence",
        reasoning: "Reasoning",
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
        providerCooldownRetry: (provider: string, seconds: number, scheduled: boolean) =>
          scheduled
            ? `${provider} is temporarily limiting requests. This is a provider/account-pool cooldown, not your usage limit. Atelier kept this turn and will retry it once in about ${seconds}s.`
            : `${provider} is temporarily limiting requests. This is a provider/account-pool cooldown, not your usage limit. Retry this turn after about ${seconds}s.`,
        queueEmpty: "Queue is empty.",
        queueCleared: "Queue cleared.",
        queueRunStarted: "Queued turn started.",
        stellaModeOn: "Stella/Atelier ontology mode is on.",
        modeChanged: (mode: string) => `Atelier ontology mode: ${mode}`,
        modeUsage: "Usage: /mode direct|stella|evidence",
        slashUnknown: (command: string) => `Unknown slash command: ${command}`,
        slashHelp: [
          "Slash commands:",
          "Stella Mode <goal> - run planning, execution, verification, security, and final audit automatically",
          "/goal <objective> - legacy Goal call",
          "/analyze · /probe · /audit - internal Stella Mode review commands",
          "/stella - turn on Stella/Atelier ontology mode",
          "/mode direct|stella|evidence - change Atelier ontology mode",
          "/isolation workspace|worktree - choose source workspace or isolated Git worktree",
          "/que - toggle queue mode",
          "/queue - show queued turns",
          "/queue clear - clear queued turns",
          "/queue run - run next queued turn when idle",
          "/que <message> - queue this message without interrupting the current run",
          "/preview <url> - open preview URL",
          "/cwd <path> - change working folder",
          "/model <model> - change the current CLI model",
          "/workload low|medium|high|xhigh|ultra - change workload",
          "/permission basic|auto - change CLI permission mode",
          "/provider openai-codex|anthropic|openrouter|alibaba - change Hermes provider",
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
        showLogs: "Show raw logs",
        hideLogs: "Hide raw logs",
        undo: "Undo",
        review: "Review",
        expandAll: "Expand",
        collapseAll: "Collapse",
        hideTaskList: "Hide task list",
        showTaskList: "Show task list",
        noDiff: "No text diff available.",
        addLineReview: "Add line comment",
        lineReviewPlaceholder: "Describe the issue or requested change",
        saveLineReview: "Save comment",
        cancelLineReview: "Cancel",
        resolveLineReview: "Resolve comment",
        reopenLineReview: "Reopen comment",
        deleteLineReview: "Delete comment",
        reviewCommentCount: (count: number) => `${count} open comments`,
        sendLineReviews: "Send review",
        undoDone: "Undo applied.",
        undoFailed: (message: string) => `Undo failed: ${message}`,
      }
    : {
        title: "작업",
        subtitle: "터미널 화면 대신 Claude, Hermes, Codex를 구조화된 작업 UI로 보여줍니다.",
        newSession: "새 작업",
        quickOpen: "빠른 열기",
        quickOpenPlaceholder: "명령, 작업, 파일, 심볼, 브랜치, 워크트리 검색",
        quickOpenEmpty: "일치하는 워크스페이스 결과가 없습니다.",
        quickOpenRecent: "워크스페이스 인덱스",
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
        previewServicePolicyDisabled: "Atelier 관리 시동은 보안상 비활성입니다. 별도로 신뢰한 localhost 서비스를 먼저 실행한 뒤 여기서 URL을 검사할 수 있습니다.",
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
        devScreenPickElement: "요소 선택",
        devScreenPickingElement: "대상 앱에서 요소를 클릭하세요 · Esc로 취소",
        devScreenCancelPick: "선택 취소",
        devScreenSelectedElement: "선택한 요소",
        devScreenAttachSelection: "다음 요청에 추가",
        devScreenSelectionAttached: "다음 요청에 포함됨",
        devScreenClearSelection: "지우기",
        devScreenPickerRequiresApp: "요소 선택은 설치된 Atelier 앱에서 사용할 수 있습니다.",
        devScreenActionOk: "화면 작업 완료",
        devScreenActionFailed: (message: string) => `화면 작업 실패: ${message}`,
        cwd: "작업 폴더",
        noAgentProfiles: "설정 프로필에 Claude/Hermes/Codex/가재코드가 없습니다.",
        parallel: "병렬",
        parallelTitle: "병렬 워크트리",
        parallelDescription: "같은 요청을 여러 격리 에이전트에 보내고 결과를 비교합니다.",
        parallelSelect: "에이전트를 두 개 이상 선택하세요.",
        parallelPromptRequired: "병렬 실행할 요청을 먼저 입력하세요.",
        parallelGitRequired: "병렬 워크트리는 Git 저장소 작업 폴더에서 사용할 수 있습니다.",
        parallelLaunch: "병렬 실행",
        parallelLaunching: "준비 중…",
        parallelPresetCore: "핵심 2",
        parallelPresetBalanced: "균형 3",
        parallelPresetAll: "전체",
        parallelCompare: "병렬 결과 비교",
        parallelCandidates: (count: number) => `후보 ${count}개`,
        parallelProgress: (completed: number, count: number) => `${completed}/${count} 완료`,
        parallelRunning: "실행 중",
        parallelDone: "완료",
        parallelFailed: "실패",
        parallelWaiting: "대기",
        parallelNoChanges: "아직 변경 없음",
        parallelNoResponse: "아직 최종 응답 없음",
        parallelOpen: "열기",
        parallelAdopt: "변경 채택",
        parallelAdopting: "채택 중…",
        parallelAdopted: "채택 완료",
        parallelAdoptionVerifying: "채택 검증 중",
        parallelAdoptionFailed: "채택 실패",
        parallelAdoptionCancelled: "채택 중단됨",
        parallelAdoptionEvidence: "채택 증거",
        parallelPatchReceipt: "패치 영수증",
        parallelAdoptTitle: "이 후보를 채택할까요?",
        parallelAdoptDescription: "전체 패치를 원본 작업공간에 미리 검사한 뒤 적용합니다. 충돌하면 원본 파일은 전혀 변경하지 않습니다.",
        parallelAdoptDirty: "원본 작업공간에 기존 로컬 변경이 있습니다. 겹치지 않는 변경은 보존하고, 겹치는 변경은 채택을 거절합니다.",
        parallelAdoptCancel: "취소",
        parallelAdoptFailed: (message: string) => `채택 실패: ${message}`,
        parallelStopAll: "전체 중지",
        parallelStoppingAll: "중지 중…",
        factoryLabel: "스텔라 모드",
        factoryLauncherTitle: "스텔라 모드 자율 개발 세션 시작 또는 재개",
        placeholder: "선택한 에이전트에게 이 작업공간의 수정, 분석, 설명을 요청하세요...",
        send: "보내기",
        stop: "중지",
        stopping: "중지 중…",
        stopHint: "실행 중인 턴은 선택한 CLI가 끝낼 때 완료됩니다. 터미널은 보조 화면으로 남겨둡니다.",
        stoppedResponse: "사용자가 실행을 중지했습니다.",
        stopFailed: (message: string) => `중지 실패: ${message}`,
        noMessages: "구조화된 에이전트 세션을 시작하세요. 메시지와 원본 이벤트가 로컬에 저장됩니다.",
        events: "이벤트",
        emptyEvents: "아직 스트림 이벤트가 없습니다.",
        renameHint: "더블클릭해 이름 변경",
        agentLabel: "에이전트",
        providerLabel: "모델 공급자",
        modelLabel: "모델",
        workloadLabel: "작업량",
        permissionLabel: "권한",
        ontologyLabel: "모드",
        intelligence: "인텔리전스",
        reasoning: "추론",
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
        providerCooldownRetry: (provider: string, seconds: number, scheduled: boolean) =>
          scheduled
            ? `${provider} 공급자 계정 풀이 일시 제한에 걸렸습니다. 사용량 초과가 아니라 서버 쪽 요청 제한입니다. Atelier가 이 작업을 보존했고 약 ${seconds}초 뒤 한 번 자동으로 다시 시도합니다.`
            : `${provider} 공급자 계정 풀이 일시 제한에 걸렸습니다. 사용량 초과가 아니라 서버 쪽 요청 제한입니다. 약 ${seconds}초 뒤 같은 작업을 다시 시도하세요.`,
        queueEmpty: "대기열이 비어 있습니다.",
        queueCleared: "대기열을 비웠습니다.",
        queueRunStarted: "대기 중인 명령을 실행했습니다.",
        stellaModeOn: "Stella/Atelier 온톨로지 모드가 켜졌습니다.",
        modeChanged: (mode: string) => `Atelier 온톨로지 모드: ${mode}`,
        modeUsage: "사용법: /mode direct|stella|evidence",
        slashUnknown: (command: string) => `알 수 없는 슬래시 명령어입니다: ${command}`,
        slashHelp: [
          "슬래시 명령어:",
          "스텔라 모드 <목표> - 목표 달성까지 계획-실행-검증-감사를 자동 진행",
          "/goal <objective> - 레거시 Goal 호출",
          "/analyze · /probe · /audit - 스텔라 모드 내부 검토 명령",
          "/stella - Stella/Atelier 온톨로지 모드 켜기",
          "/mode direct|stella|evidence - Atelier 온톨로지 실행 모드 변경",
          "/isolation workspace|worktree - 원본 폴더 또는 격리 Git worktree 선택",
          "/que - 대기열 모드 켜기/끄기",
          "/queue - 대기열 보기",
          "/queue clear - 대기열 비우기",
          "/queue run - 지금 한가하면 다음 대기 명령 실행",
          "/que <message> - 현재 실행을 끊지 않고 이 메시지를 대기열로 넣기",
          "/preview <url> - 프리뷰 URL 열기",
          "/cwd <path> - 작업 폴더 변경",
          "/model <model> - 현재 CLI 모델 변경",
          "/workload low|medium|high|xhigh|ultra - 작업량 변경",
          "/permission basic|auto - CLI 실행 권한 변경",
          "/provider openai-codex|anthropic|openrouter|alibaba - Hermes provider 변경",
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
        showLogs: "원본 로그 보기",
        hideLogs: "원본 로그 숨기기",
        undo: "실행 취소",
        review: "리뷰",
        expandAll: "펼치기",
        collapseAll: "접기",
        hideTaskList: "작업 목록 숨기기",
        showTaskList: "작업 목록 보이기",
        noDiff: "표시할 텍스트 diff가 없습니다.",
        addLineReview: "줄 의견 추가",
        lineReviewPlaceholder: "문제점이나 요청할 변경을 적어주세요",
        saveLineReview: "의견 저장",
        cancelLineReview: "취소",
        resolveLineReview: "의견 해결",
        reopenLineReview: "의견 다시 열기",
        deleteLineReview: "의견 삭제",
        reviewCommentCount: (count: number) => `미해결 의견 ${count}개`,
        sendLineReviews: "리뷰 전달",
        undoDone: "실행 취소가 적용되었습니다.",
        undoFailed: (message: string) => `실행 취소 실패: ${message}`,
      };

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) || sessions[0] || null,
    [activeId, sessions],
  );
  const activeExecutionCwd = active?.worktreeEnabled && active.worktreeInfo?.worktree_cwd
    ? active.worktreeInfo.worktree_cwd
    : cwd;
  const quickOpenResults = useMemo<Array<QuickOpenItem<AgentSession>>>(() => {
    const labels = tw.language === "en"
      ? {
          conversation: ["Conversation", "Open the current task conversation"],
          code: ["Code", "Open the integrated multi-file editor"],
          changes: ["Source control", "Review, stage, and commit Git changes"],
          preview: [showPreview ? "Hide preview" : "Show preview", "Toggle the live preview panel"],
          terminal: ["Terminal", "Open the supervised terminal workspace"],
          newTask: ["New task", "Choose an agent and start a local task"],
        }
      : {
          conversation: ["대화", "현재 작업 대화 열기"],
          code: ["코드", "통합 다중 파일 편집기 열기"],
          changes: ["소스 제어", "Git 변경 검토, 스테이징, 커밋"],
          preview: [showPreview ? "프리뷰 숨기기" : "프리뷰 보이기", "라이브 프리뷰 패널 전환"],
          terminal: ["터미널", "감독되는 터미널 워크스페이스 열기"],
          newTask: ["새 작업", "에이전트를 선택해 로컬 작업 시작"],
        };
    const rawCommandDefinitions: Array<[QuickOpenCommandId, string[]]> = [
      ["conversation", labels.conversation],
      ["code", labels.code],
      ["changes", labels.changes],
      ["preview", labels.preview],
      ["terminal", labels.terminal],
      ["new-task", labels.newTask],
    ];
    const commands: QuickOpenCommandDefinition[] = rawCommandDefinitions.map(([command, values]) => ({
        command,
        label: values[0],
        detail: values[1],
      }));
    const sessionCandidates: Array<QuickOpenSessionCandidate<AgentSession>> = [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 24)
      .map((session) => {
        const meta = providerMeta(session.provider);
        const sourceCwd = session.worktreeInfo?.source_cwd || session.cwd;
        return {
          session,
          key: `session:${session.id}`,
          label: session.title,
          detail: `${sourceCwd}${session.worktreeInfo?.branch ? ` · ${session.worktreeInfo.branch}` : ""}`,
          trailing: session.profileName || meta.label,
          searchable: [
            session.title,
            session.profileName,
            meta.label,
            meta.short,
            sourceCwd,
            session.cwd,
            session.worktreeInfo?.worktree_cwd,
            session.worktreeInfo?.branch,
          ],
          updatedAt: session.updatedAt,
        };
      });
    return buildQuickOpenResults({
      query: quickOpenQuery,
      commands,
      files: quickOpenFiles,
      sessions: sessionCandidates,
      indexedEntries: quickOpenIndexedEntries,
      maxResults: 40,
    });
  }, [quickOpenFiles, quickOpenIndexedEntries, quickOpenQuery, sessions, showPreview, tw.language]);
  useEffect(() => {
    const query = quickOpenQuery.trim();
    if (!showQuickOpen || !query || !activeExecutionCwd.trim() || !isTauri()) {
      setQuickOpenFiles([]);
      setQuickOpenIndexedEntries([]);
      return;
    }
    let disposed = false;
    const timer = window.setTimeout(() => {
      Promise.allSettled([
        searchWorkspaceFiles(activeExecutionCwd, query, 24),
        agentQuickOpenIndex(activeExecutionCwd, query, 32),
      ]).then(([fileResult, indexResult]) => {
        if (disposed) return;
        setQuickOpenFiles(fileResult.status === "fulfilled" ? fileResult.value : []);
        setQuickOpenIndexedEntries(indexResult.status === "fulfilled" ? indexResult.value.entries : []);
      });
    }, 90);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [activeExecutionCwd, quickOpenQuery, showQuickOpen]);
  const latestSessionChanges = useMemo(() => {
    const messages = active?.messages || [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].changes) return messages[index].changes || null;
    }
    return null;
  }, [active?.messages]);
  const visibleWorkspaceChanges = workspaceChanges || latestSessionChanges;
  const refreshWorkspaceChanges = useCallback(async () => {
    if (!isTauri() || !activeExecutionCwd.trim()) {
      setWorkspaceChanges(null);
      setWorkspaceChangesError(null);
      return;
    }
    setWorkspaceChangesLoading(true);
    setWorkspaceChangesError(null);
    try {
      setWorkspaceChanges(await agentChangeSummary(activeExecutionCwd));
    } catch (err) {
      setWorkspaceChangesError(String(err instanceof Error ? err.message : err));
    } finally {
      setWorkspaceChangesLoading(false);
    }
  }, [activeExecutionCwd]);
  // active 세션 기준 busy 가드 — 다른 세션이 바빠도 active가 한가하면 입력 가능.
  const busyTurnId: string | null = active ? busyTurnIdsBySession[active.id] || null : null;
  const isStoppingActiveTurn = Boolean(busyTurnId && stoppingTurnId === busyTurnId);

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
    const fallbackVisible = resolvePreviewVisibilityFallback(
      safeLocalStorageGet(PREVIEW_VISIBLE_KEY),
      safeLocalStorageGet(DEV_SCREEN_VISIBLE_KEY),
    );
    const fallbackVPRaw = safeLocalStorageGet(PREVIEW_VP_KEY);
    const fallbackVP: PreviewViewport =
      fallbackVPRaw === "mobile" || fallbackVPRaw === "tablet" || fallbackVPRaw === "desktop"
        ? fallbackVPRaw
        : "desktop";
    const fallbackWidth = clampNumber(Number(safeLocalStorageGet(PREVIEW_WIDTH_KEY)) || 430, 320, 760);
    const sessionPreviewUrl = cleanStoredPreviewUrl(active.previewUrl ?? "");
    previewUrlRef.current = sessionPreviewUrl;
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
    const fallbackVisible = resolvePreviewVisibilityFallback(
      safeLocalStorageGet(PREVIEW_VISIBLE_KEY),
      safeLocalStorageGet(DEV_SCREEN_VISIBLE_KEY),
    );
    const fallbackVPRaw = safeLocalStorageGet(PREVIEW_VP_KEY);
    const fallbackVP: PreviewViewport =
      fallbackVPRaw === "mobile" || fallbackVPRaw === "tablet" || fallbackVPRaw === "desktop"
        ? fallbackVPRaw
        : "desktop";
    const fallbackWidth = clampNumber(Number(safeLocalStorageGet(PREVIEW_WIDTH_KEY)) || 430, 320, 760);
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
  const agentFleetProfiles = useMemo(
    () => agentProfiles.map(({ profile, provider }) => ({
      id: profile.id,
      provider,
      name: profile.name,
      short: providerMeta(provider).short,
      dot: normalizeAgentDotColor(profile.dot || providerMeta(provider).dot),
    })),
    [agentProfiles],
  );
  const fallbackProfile = agentProfiles[0]?.profile;
  const fallbackProvider = agentProfiles[0]?.provider || DEFAULT_PROVIDER;
  const activeProvider = active?.provider || fallbackProvider;
  const activeProviderMeta = providerMeta(activeProvider);
  const rawActiveModel = active?.model || activeProviderMeta.defaultModel;
  const activeHermesProvider = activeProvider === "hermes"
    ? normalizeHermesProvider(active?.hermesProvider || inferHermesProviderFromModel(rawActiveModel))
    : DEFAULT_HERMES_PROVIDER;
  const activeGajaeProvider = activeProvider === "gajecode"
    ? inferGajaeProviderFromModel(rawActiveModel)
    : "claude";
  const activeSubscriptionProvider = subscriptionProviderForSession(
    activeProvider,
    activeHermesProvider,
    activeGajaeProvider,
  );
  const activeSubscriptionUsage = active?.subscriptionUsage?.provider === activeSubscriptionProvider
    ? active.subscriptionUsage
    : undefined;
  const normalizedActiveModel = activeProvider === "hermes"
    ? normalizeHermesModel(activeHermesProvider, rawActiveModel)
    : normalizeModel(activeProvider, rawActiveModel);
  const activeModelOptions = modelOptionsFor(activeProvider, normalizedActiveModel, activeHermesProvider, claudeRuntimeModels, codexRuntimeModels, openRouterRuntimeModels);
  const activeModel = (activeProvider === "claude" || activeProvider === "codex" || activeProvider === "gajecode" || activeProvider === "grok" || (activeProvider === "hermes" && isHermesProvider(activeHermesProvider)))
    ? coerceModelToOptions(normalizedActiveModel, activeModelOptions)
    : normalizedActiveModel;
  const activeModelLabel = labelForOption(activeModelOptions, activeModel);
  const slashCommands = useMemo(
    () => slashCommandsFor(activeProvider, activeHermesProvider, activeModelOptions),
    [activeProvider, activeHermesProvider, activeModelOptions],
  );
  const visibleSlashCommands = useMemo(
    () => {
      const items = filterSlashCommands(slashCommands, composerUi.slashText, tw.language);
      return activeProvider === "gajecode" ? items : items.slice(0, 18);
    },
    [activeProvider, slashCommands, composerUi.slashText, tw.language],
  );
  const showSlashMenu = Boolean(composerUi.slashText) && visibleSlashCommands.length > 0;
  const activeSlashSelection = Math.min(slashSelection, Math.max(visibleSlashCommands.length - 1, 0));
  const selectedSlashCommand = visibleSlashCommands[activeSlashSelection];
  const activeCodexEffort = normalizeCodexEffort(active?.codexEffort);
  const activeWorkload = normalizeWorkloadLevel(active?.codexEffort);
  const activeOpenRouterModel = activeProvider === "hermes" && activeHermesProvider === "openrouter";
  const activeGajaeAlibabaModel = activeProvider === "gajecode" && activeGajaeProvider === "alibaba";
  const activeHermesGrokModel = activeProvider === "hermes" && activeHermesProvider === "grok";
  const activeGajaeGrokModel = activeProvider === "gajecode" && activeGajaeProvider === "grok";
  const activeOpenRouterEffortOptions = activeOpenRouterModel
    ? openRouterEffortOptions(activeModel, activeModelOptions)
    : [];
  const activeOpenRouterEffort = activeOpenRouterModel
    ? coerceOpenRouterEffort(activeWorkload, activeModel, activeModelOptions)
    : null;
  const activeWorkloadOptions = activeOpenRouterModel
    ? activeOpenRouterEffortOptions
    : activeGajaeAlibabaModel
      ? gajecodeAlibabaEffortOptions(activeModel)
      : activeHermesGrokModel || activeGajaeGrokModel
        ? GROK_API_EFFORTS
      : CODEX_EFFORTS;
  const activeWorkloadValue: WorkloadLevel = activeOpenRouterModel
    ? activeOpenRouterEffort || activeWorkload
    : activeGajaeAlibabaModel
      ? coerceGajaeAlibabaEffort(activeWorkload, activeModel)
      : activeHermesGrokModel || activeGajaeGrokModel
        ? coerceGrokApiEffort(activeWorkload)
      : activeCodexEffort;
  const showActiveWorkload = !activeOpenRouterModel || activeOpenRouterEffortOptions.length > 0;
  const activeCodexSpeed = normalizeCodexSpeed(active?.codexSpeed);
  const activeCodexModelSurface = activeProvider === "codex"
    || (activeProvider === "hermes" && activeHermesProvider === "openai-codex")
    || (activeProvider === "gajecode" && activeGajaeProvider === "codex");
  const activeCodexToolbarLabel = codexToolbarLabel(activeModelLabel, activeModel);
  const activePermissionMode = normalizePermissionMode(active?.permissionMode);
  const activeRuntimeCapability = runtimeCapabilities?.find((capability) => capability.id === activeProvider);
  const activeManagedAgentDisabledReason = managedAgentPermissionDisabledReason(
    activeProvider,
    activeRuntimeCapability,
    tw.language,
    runtimeCapabilityError,
  );
  const activePermissionControlDisabledReason = managedPermissionControlDisabledReason(
    activeProvider,
    activeRuntimeCapability,
    tw.language,
  );
  const activeRuntimeObservationNotice = runtimeCapabilityObservationNotice(
    activeProvider,
    runtimeCapabilityError,
    tw.language,
  );
  const activeAdapterManagedRuntime = activeProvider === "hermes" || activeProvider === "gajecode" || activeProvider === "grok";
  const activeRuntimeProgress = activeAdapterManagedRuntime
    ? managedRuntimeProgress[activeProvider]
    : undefined;
  const activeRuntimeProgressFailure = activeRuntimeProgress?.state === "failed"
    ? actionableManagedAgentFailure(
        activeProvider,
        `managed runtime preparation failed: ${activeRuntimeProgress.message}`,
        tw.language,
      )
    : null;
  const activeModelSurfaceTitle = activeProvider === "hermes" || activeProvider === "gajecode"
    ? `${copy.agentLabel} ${activeProviderMeta.label} · ${copy.providerLabel} ${
        activeProvider === "hermes"
          ? labelForOption(HERMES_PROVIDERS, activeHermesProvider)
          : labelForOption(GAJECODE_PROVIDERS, activeGajaeProvider)
      }`
    : activeProviderMeta.label;
  const directGajaeCliInput = activeProvider === "gajecode"
    && pendingAttachments.length === 0
    && composerUi.restrictedDirectGajaeInput;
  const managedComposerSendDisabled = Boolean(activeManagedAgentDisabledReason) && !directGajaeCliInput;
  const localPreview = isLocalPreviewUrl(previewUrl);
  const previewManagedStartEnabled = previewCapabilityState.managed_start;
  const previewExternalInspectionEnabled = previewCapabilityState.external_loopback_inspection;
  const previewManagedRunning = Boolean(previewService?.managed && previewService?.running);
  const previewBadgeTone = previewChecking
      ? "checking"
      : previewCheck?.ok
        ? "ok"
        : previewCheck
          ? "error"
          : previewUrl
            ? "linked"
            : "idle";
  const previewBadgeText = previewChecking
      ? copy.previewChecking
      : previewCheck?.ok
        ? copy.previewOk
        : previewCheck
          ? copy.previewIssue
          : previewUrl
            ? copy.previewLinked
            : "";
  const visiblePreviewDiagnostics = previewDiagnostics.slice(-3);
  const previewServiceLabel = previewService?.running
    ? `${copy.previewServiceManaged}${previewService.pid ? ` · ${previewService.pid}` : ""}`
    : previewService?.managed
      ? copy.previewServiceIdle
      : copy.previewServiceExternal;
  const previewServiceOutput = previewService?.recent_output?.slice(-2) || [];
  const previewServicePolicyMessage = copy.previewServicePolicyDisabled;
  const previewServicePolicyReason = previewCapabilityState.managed_start_reason || previewCapabilityError;
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
  const latestDevScreenDiagnostics = devScreenCheckResult?.diagnostics || devScreenDiagnosticsResult;
  const latestDevScreenNetworkFailureCount = latestDevScreenDiagnostics
    ? latestDevScreenDiagnostics.networkFailures.length
      + latestDevScreenDiagnostics.networkEntries.filter((entry) => Number(entry.status || 0) >= 400).length
    : 0;
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
  }, [composerUi.slashText, activeProvider, activeHermesProvider]);

  const lastAssistantStatus = (session: AgentSession) => {
    const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
    return lastAssistant?.status;
  };

  const isSessionRunning = (session: AgentSession) =>
    Boolean(busyTurnIdsBySession[session.id])
    || lastAssistantStatus(session) === "streaming"
    || Boolean(session.queuedTurns?.length);
  const isSessionDone = (session: AgentSession) =>
    !isSessionRunning(session) && lastAssistantStatus(session) === "done";

  const sessionInboxItems = useMemo<SessionInboxItem[]>(() => sessions.map((session) => {
    const lastAssistant = [...session.messages].reverse().find((message) => message.role === "assistant");
    const needsAttention = lastAssistant?.status === "error"
      || lastAssistant?.lifecyclePhase === "failed"
      || lastAssistant?.lifecyclePhase === "waiting_for_user";
    const phase: SessionInboxPhase = needsAttention
      ? "attention"
      : isSessionRunning(session)
        ? "running"
        : isSessionDone(session)
          ? "done"
          : "idle";
    return { id: session.id, updatedAt: session.updatedAt, phase };
  }), [busyTurnIdsBySession, sessions]);
  const {
    filter: sessionInboxFilter,
    setFilter: setSessionInboxFilter,
    counts: sessionInboxCounts,
    visibleIds: sessionInboxVisibleIds,
    unreadIds: sessionInboxUnreadIds,
    markRead: markSessionRead,
    toggleUnread: toggleSessionUnread,
  } = useSessionInbox(sessionInboxItems, activeId);
  const filteredSessions = useMemo(
    () => sessions.filter((session) => sessionInboxVisibleIds.has(session.id)),
    [sessionInboxVisibleIds, sessions],
  );
  const sessionInboxPhaseById = useMemo(
    () => new Map(sessionInboxItems.map((item) => [item.id, item.phase])),
    [sessionInboxItems],
  );
  const desktopNotificationTasks = useMemo<DesktopNotificationTask[]>(() => {
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    return sessionInboxItems.map((item) => {
      const session = sessionById.get(item.id);
      return {
        ...item,
        title: session?.title || (session ? providerMeta(session.provider).label : "Atelier"),
      };
    });
  }, [sessionInboxItems, sessions]);
  const desktopNotifications = useDesktopNotifications(
    desktopNotificationTasks,
    activeId,
    tw.language === "en" ? "en" : "ko",
  );

  const activeParallelSessions = useMemo(() => {
    if (!active?.parallelBatchId) return [];
    return sessions
      .filter((session) => session.parallelBatchId === active.parallelBatchId)
      .sort((left, right) => (left.parallelCandidateIndex || 0) - (right.parallelCandidateIndex || 0));
  }, [active?.parallelBatchId, sessions]);

  const parallelSessionStatus = (session: AgentSession) => {
    if (isSessionRunning(session)) return "running" as const;
    const status = lastAssistantStatus(session);
    if (status === "error") return "failed" as const;
    if (status === "done") return "done" as const;
    return "waiting" as const;
  };

  const parallelSessionChanges = (session: AgentSession) => {
    const summary = [...session.messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.changes)?.changes;
    return summary || null;
  };

  const parallelSessionPreview = (session: AgentSession) => {
    const message = [...session.messages]
      .reverse()
      .find((item) => item.role === "assistant" && cleanAgentText(item.text));
    if (!message) return copy.parallelNoResponse;
    return clipActivityText(cleanAgentText(message.text).replace(/\s+/g, " "), 180);
  };

  const activeFleetCandidates: AgentFleetCandidateView[] = activeParallelSessions.map((candidate) => {
    const changes = parallelSessionChanges(candidate);
    const phase = parallelSessionStatus(candidate);
    const meta = providerMeta(candidate.provider);
    return {
      id: candidate.id,
      profileName: candidate.profileName || meta.label,
      providerShort: meta.short,
      dot: normalizeAgentDotColor(candidate.profileDot || meta.dot),
      branch: candidate.worktreeInfo?.branch,
      phase,
      changeCount: changes?.files.length,
      additions: changes?.additions,
      deletions: changes?.deletions,
      preview: parallelSessionPreview(candidate),
      adoption: candidate.parallelAdoption,
      canAdopt: phase === "done" && Boolean(changes?.files.length && candidate.worktreeInfo),
    };
  });

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

  const startComposerResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    composerResizeRef.current = { startY: event.clientY, startH: composerHeight };
    setResizingComposer(true);
  };

  const handleComposerResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? 24 : -24;
    setComposerHeight((height) =>
      clampNumber(height + delta, composerMinHeight(), composerMaxHeight()),
    );
  };

  const handlePreviewResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const max = clampNumber(window.innerWidth - 640, 360, 920);
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    setPreviewWidth((width) => clampNumber(width + delta, 320, max));
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
    if (activeId) safeLocalStorageSet(ACTIVE_KEY, activeId);
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
    safeLocalStorageSet(CWD_KEY, cwd);
  }, [cwd]);

  useEffect(() => {
    safeLocalStorageSet(TASK_LIST_VISIBLE_KEY, showTaskList ? "1" : "0");
  }, [showTaskList]);

  useEffect(() => {
    safeLocalStorageSet(WORKSPACE_VIEW_KEY, workspaceView);
  }, [workspaceView]);

  useEffect(() => {
    setWorkspaceChanges(null);
    setWorkspaceChangesError(null);
    if (workspaceView === "changes") {
      refreshWorkspaceChanges().catch(console.error);
    }
  }, [activeExecutionCwd, refreshWorkspaceChanges, workspaceView]);

  useEffect(() => {
    safeLocalStorageSet(PREVIEW_VISIBLE_KEY, showPreview ? "1" : "0");
  }, [showPreview]);

  useEffect(() => {
    safeLocalStorageSet(PREVIEW_KEY, previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    safeLocalStorageSet(PREVIEW_WIDTH_KEY, String(previewWidth));
  }, [previewWidth]);

  useEffect(() => {
    safeLocalStorageSet(COMPOSER_HEIGHT_KEY, String(composerHeight));
  }, [composerHeight]);

  useEffect(() => {
    safeLocalStorageSet(PREVIEW_VP_KEY, previewVP);
  }, [previewVP]);

  useEffect(() => {
    safeLocalStorageSet(PREVIEW_SERVICE_COMMAND_KEY, previewServiceCommand);
  }, [previewServiceCommand]);

  useEffect(() => {
    safeLocalStorageSet(DEV_SCREEN_VISIBLE_KEY, showDevScreen ? "1" : "0");
  }, [showDevScreen]);

  useEffect(() => {
    safeLocalStorageSet(DEV_SCREEN_HOST_KEY, devScreenHost);
  }, [devScreenHost]);

  useEffect(() => {
    safeLocalStorageSet(DEV_SCREEN_PORT_KEY, devScreenPort);
  }, [devScreenPort]);

  useEffect(() => {
    safeLocalStorageSet(DEV_SCREEN_WINDOW_KEY, devScreenWindow);
  }, [devScreenWindow]);

  useEffect(() => {
    const targetUrl = cleanStoredPreviewUrl(previewUrl);
    const armKey = [
      targetUrl,
      previewReloadKey,
      devScreenHost.trim(),
      devScreenPort.trim(),
      devScreenWindow.trim(),
    ].join("|");
    if (devScreenArmKeyRef.current !== armKey) {
      devScreenArmKeyRef.current = armKey;
      setDevScreenDiagnosticsResult(null);
      if (cleanStoredPreviewUrl(devScreenCheckUrlRef.current) !== targetUrl) {
        devScreenCheckUrlRef.current = "";
        setDevScreenCheckResult(null);
      }
    }
    if (!isTauri() || !showPreview || !isLocalPreviewUrl(targetUrl)) return;

    let cancelled = false;
    let timer: number | undefined;
    const retryDelays = [220, 900, 1800];
    const arm = (index: number) => {
      timer = window.setTimeout(async () => {
        try {
          const trimmedPort = devScreenPort.trim();
          const result = await devScreenDiagnostics({
            host: devScreenHost.trim() || "127.0.0.1",
            port: trimmedPort ? Number(trimmedPort) : null,
            windowLabel: devScreenWindow.trim() || "main",
            timeoutMs: trimmedPort ? 900 : 1400,
          });
          if (cancelled || !devScreenMatchesPreview(result, targetUrl)) return;
          setDevScreenDiagnosticsResult(result);
          setDevScreenHost((current) => current === result.host ? current : result.host);
          setDevScreenPort((current) => current === String(result.port) ? current : String(result.port));
          setDevScreenWindow((current) => current === result.windowLabel ? current : result.windowLabel);
          setDevScreenError(null);
        } catch {
          if (!cancelled && index + 1 < retryDelays.length) arm(index + 1);
        }
      }, retryDelays[index]);
    };
    arm(0);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    showPreview,
    previewUrl,
    previewReloadKey,
    devScreenHost,
    devScreenPort,
    devScreenWindow,
  ]);

  useEffect(() => {
    if (cwd) return;
    homeDir().then((h) => setCwd(h)).catch(() => {});
  }, [cwd]);

  useEffect(() => {
    if (!showSlashMenu) {
      setSlashMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 8;
      const width = Math.min(
        Math.max(280, rect.width),
        Math.max(280, window.innerWidth - viewportPadding * 2),
      );
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      );
      const availableAbove = Math.max(0, rect.top - gap - viewportPadding);
      const availableBelow = Math.max(0, window.innerHeight - rect.bottom - gap - viewportPadding);
      const openAbove = availableAbove >= 180 || availableAbove >= availableBelow;
      const available = openAbove ? availableAbove : availableBelow;
      const maxHeight = Math.max(120, Math.min(286, available));

      setSlashMenuPosition({
        left,
        width,
        maxHeight,
        ...(openAbove
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [composerHeight, showSlashMenu, visibleSlashCommands.length]);

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
    if (!resizingComposer) return;
    const onPointerMove = (event: PointerEvent) => {
      const state = composerResizeRef.current;
      if (!state) return;
      setComposerHeight(clampNumber(state.startH + state.startY - event.clientY, composerMinHeight(), composerMaxHeight()));
    };
    const onPointerUp = () => {
      composerResizeRef.current = null;
      setResizingComposer(false);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [resizingComposer]);

  useEffect(() => {
    const clampComposerToViewport = () => {
      setComposerHeight((height) => clampNumber(height, composerMinHeight(), composerMaxHeight()));
    };
    clampComposerToViewport();
    window.addEventListener("resize", clampComposerToViewport);
    return () => window.removeEventListener("resize", clampComposerToViewport);
  }, []);

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
      Object.values(providerCooldownRetryTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      if (smoothFrameRef.current !== null) {
        window.cancelAnimationFrame(smoothFrameRef.current);
      }
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      persistSessionsNow(sessionsRef.current);
      pendingStreamRef.current = {};
      providerCooldownRetryTimersRef.current = {};
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
    if (!previewExternalInspectionEnabled) {
      setPreviewChecking(false);
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
  }, [previewUrl, previewReloadKey, previewExternalInspectionEnabled, tw.language]);

  const patchSession = (id: string, patcher: (session: AgentSession) => AgentSession) => {
    const next = sessionsRef.current.map((s) => (s.id === id ? patcher(s) : s));
    sessionsRef.current = next;
    persistSessionsSoon(next);
    setSessions(next);
  };

  const captureMessagePreviewEvidence = async (
    sessionId: string,
    assistantId: string,
    candidateUrl: string,
  ) => {
    const targetUrl = cleanStoredPreviewUrl(candidateUrl);
    if (!isTauri() || !previewExternalInspectionEnabled || !isLocalPreviewUrl(targetUrl)) return;

    const [healthResult, serviceResult] = await Promise.allSettled([
      previewHealthCheck(targetUrl),
      previewServiceStatus(targetUrl),
    ]);
    const health = healthResult.status === "fulfilled" ? healthResult.value : null;
    const service = serviceResult.status === "fulfilled" ? serviceResult.value : null;
    const checkedScreen = devScreenCheckResultRef.current;
    const armedDiagnostics = devScreenDiagnosticsResultRef.current;
    const matchingCheck = devScreenMatchesPreview(checkedScreen?.diagnostics, targetUrl)
      ? checkedScreen
      : null;
    const diagnostics = matchingCheck?.diagnostics
      || (devScreenMatchesPreview(armedDiagnostics, targetUrl) ? armedDiagnostics : null);
    const evidence = buildTaskPreviewEvidence({
      previewUrl: targetUrl,
      health,
      healthError: healthResult.status === "rejected" ? healthResult.reason : null,
      service,
      serviceError: serviceResult.status === "rejected" ? serviceResult.reason : null,
      diagnostics,
      screenshotCaptured: Boolean(matchingCheck?.screenshot?.dataUrl),
    });

    patchSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((message) => (
        message.id === assistantId ? { ...message, previewEvidence: evidence } : message
      )),
      updatedAt: Date.now(),
    }));
  };

  // 턴 종료 후 프리뷰 검증 카드를 붙일지 최종 판정하고, 통과할 때만 실제 계측을 돈다.
  // 관측 불가 레인은 여기서 턴 전용 baseline 을 해소해 "이 턴에 파일이 바뀌었나"를 실측한다.
  // finally 안에서 await 하지 않으려고 통째로 떼어냈다 — 실측이 늦어도 다음 큐 턴 시작을
  // 막으면 안 된다.
  const resolveTurnPreviewEvidence = async (input: {
    sessionId: string;
    assistantId: string;
    previewUrl: string;
    cwd: string | null;
    impact: TurnPreviewImpact | null;
    previewUrlChanged: boolean;
    probeBaselineId: string;
    allowCapture: boolean;
  }) => {
    let impact = input.impact
      ? {
          ...input.impact,
          previewUrlChanged: input.impact.previewUrlChanged || input.previewUrlChanged,
        }
      : null;
    // baseline 은 잡았으면 반드시 해소한다. 중단된 턴이라 카드를 안 붙이더라도 그냥 두면
    // Rust 쪽 baseline 맵(상한 64)을 갉아먹어 "변경 검토" baseline 이 먼저 밀려난다.
    if (input.probeBaselineId && isTauri()) {
      try {
        const summary = await agentChangeSummary(input.cwd, input.probeBaselineId);
        const mutation = workspaceMutationFromChangeSummary(summary);
        if (impact) impact = { ...impact, workspaceMutation: mutation };
      } catch (error) {
        // 실측 실패는 "무영향"의 근거가 아니다 — unknown 그대로 두면 노출 쪽으로 기운다.
        console.warn("turn preview impact probe failed", error);
      }
    }
    if (!input.allowCapture) return;
    if (!turnAffectedPreview(impact)) return;
    await captureMessagePreviewEvidence(input.sessionId, input.assistantId, input.previewUrl);
  };

  useEffect(() => {
    const sessionId = active?.id;
    const provider = activeSubscriptionProvider;
    if (!sessionId || !provider || !isTauri()) return undefined;

    let cancelled = false;
    const refresh = async () => {
      try {
        const result = normalizeSubscriptionUsage(await providerSubscriptionUsage(provider));
        if (cancelled || !result) return;
        patchSession(sessionId, (session) => {
          if (
            session.subscriptionUsage
            && session.subscriptionUsage.capturedAtUnixMs > result.capturedAtUnixMs
          ) {
            return session;
          }
          return { ...session, subscriptionUsage: result, updatedAt: Date.now() };
        });
      } catch (error) {
        console.warn(`Failed to refresh ${provider} subscription usage`, error);
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 5 * 60 * 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active?.id, active?.tokenUsage?.timestamp_ms, activeSubscriptionProvider]);

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
        devScreenCheckUrlRef.current = previewUrlRef.current;
        setDevScreenCheckResult(result);
        setDevScreenDiagnosticsResult(result.diagnostics);
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
        devScreenCheckUrlRef.current = "";
        setDevScreenCheckResult(null);
        setDevScreenActionResult(null);
      },
    );

  const runDevScreenSnapshot = () =>
    runDevScreenAction(
      () => devScreenSnapshot(devScreenOptions()),
      (result) => {
        setDevScreenSnapshotResult(result);
        devScreenCheckUrlRef.current = "";
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

  const recordDevScreenPickerResult = (result: DevScreenElementPickerResult) => {
    if (result.host && result.host !== devScreenHost) setDevScreenHost(result.host);
    if (result.port && String(result.port) !== devScreenPort) setDevScreenPort(String(result.port));
    if (result.windowLabel && result.windowLabel !== devScreenWindow) setDevScreenWindow(result.windowLabel);
    setDevScreenError(null);
    setDevScreenPickerStatus(result.status);
    setDevScreenPickerError(result.error || null);
    if (result.selection) {
      setDevScreenElementSelection(result.selection);
      setDevScreenSelectionAttached(false);
    }
  };

  const runDevScreenElementPickerStart = async () => {
    if (devScreenBusy || devScreenPickerStatus === "armed") return;
    if (!isTauri()) {
      setDevScreenPickerError(copy.devScreenPickerRequiresApp);
      setDevScreenPickerStatus("error");
      return;
    }
    setDevScreenBusy(true);
    setDevScreenError(null);
    setDevScreenPickerError(null);
    setDevScreenElementSelection(null);
    setDevScreenSelectionAttached(false);
    try {
      recordDevScreenPickerResult(await devScreenElementPickerStart(devScreenOptions()));
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      setDevScreenPickerError(message);
      setDevScreenPickerStatus("error");
    } finally {
      setDevScreenBusy(false);
    }
  };

  const cancelDevScreenElementPicker = async () => {
    if (devScreenPickerStatus !== "armed") return;
    setDevScreenPickerStatus("cancelled");
    try {
      recordDevScreenPickerResult(await devScreenElementPickerCancel(devScreenOptions()));
    } catch (error) {
      setDevScreenPickerError(String(error instanceof Error ? error.message : error));
    }
  };

  const clearDevScreenElementSelection = () => {
    setDevScreenPickerStatus("idle");
    setDevScreenElementSelection(null);
    setDevScreenSelectionAttached(false);
    setDevScreenPickerError(null);
  };

  useEffect(() => {
    if (devScreenPickerStatus !== "armed") return;
    let cancelled = false;
    let polling = false;
    const timer = window.setInterval(() => {
      if (cancelled || polling) return;
      polling = true;
      devScreenElementPickerPoll(devScreenOptions())
        .then((result) => {
          if (!cancelled) recordDevScreenPickerResult(result);
        })
        .catch((error) => {
          if (cancelled) return;
          setDevScreenPickerError(String(error instanceof Error ? error.message : error));
          setDevScreenPickerStatus("error");
        })
        .finally(() => {
          polling = false;
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [devScreenPickerStatus, devScreenHost, devScreenPort, devScreenWindow]);

  useEffect(() => {
    if (devScreenPickerStatus === "armed") {
      void devScreenElementPickerCancel(devScreenOptions()).catch(() => undefined);
    }
    setDevScreenPickerStatus("idle");
    setDevScreenElementSelection(null);
    setDevScreenSelectionAttached(false);
    setDevScreenPickerError(null);
  }, [activeId, previewUrl]);

  useEffect(() => {
    if (showPreview && showDevScreen) return;
    if (devScreenPickerStatus === "armed") {
      void devScreenElementPickerCancel(devScreenOptions()).catch(() => undefined);
      setDevScreenPickerStatus("idle");
    }
    setDevScreenPickerError(null);
  }, [showPreview, showDevScreen]);

  const resetComposer = () => {
    setComposerInput("");
    setPendingAttachments([]);
    setPasteError(null);
  };

  const selectSession = (id: string) => {
    if (id !== activeId) resetComposer();
    const nextSession = sessionsRef.current.find((session) => session.id === id);
    if (nextSession?.cwd) setCwd(nextSession.cwd);
    markSessionRead(id);
    activeIdRef.current = id;
    setActiveId(id);
  };

  const openQuickOpen = useCallback(() => {
    setQuickOpenQuery("");
    setQuickOpenIndex(0);
    setQuickOpenFiles([]);
    setQuickOpenIndexedEntries([]);
    setShowQuickOpen(true);
  }, []);

  const requestQuickOpen = useCallback(() => openQuickOpen(), [openQuickOpen]);

  const chooseQuickOpenItem = (item: QuickOpenItem<AgentSession>) => {
    if (item.kind === "session") {
      selectSession(item.candidate.session.id);
    } else if (item.kind === "file") {
      setWorkbenchFilePath(item.file.path);
      setWorkbenchInitialLine(null);
      setWorkspaceView("code");
    } else if (item.kind === "index") {
      if (item.entry.kind === "symbol" && item.entry.path) {
        setWorkbenchFilePath(item.entry.path);
        setWorkbenchInitialLine(item.entry.line);
        setWorkspaceView("code");
      } else {
        const matchingSession = sessionsRef.current.find((session) => (
          sameQuickOpenPath(session.worktreeInfo?.worktree_cwd, item.entry.path)
          || (item.entry.branch && session.worktreeInfo?.branch === item.entry.branch)
        ));
        if (matchingSession) {
          selectSession(matchingSession.id);
        } else if (item.entry.kind === "worktree" && item.entry.path) {
          setCwd(item.entry.path);
          setWorkspaceView("code");
        } else {
          setWorkspaceView("changes");
          refreshWorkspaceChanges().catch(console.error);
        }
      }
    } else {
      switch (item.command) {
        case "conversation":
          setWorkspaceView("conversation");
          break;
        case "code":
          setWorkspaceView("code");
          break;
        case "changes":
          setWorkspaceView("changes");
          refreshWorkspaceChanges().catch(console.error);
          break;
        case "preview":
          setShowPreview((visible) => !visible);
          break;
        case "terminal":
          onOpenTerminal?.();
          break;
        case "new-task":
          setShowTaskList(true);
          setShowProfilePicker(true);
          break;
      }
    }
    setShowQuickOpen(false);
  };

  useEffect(() => {
    const onQuickOpenKey = (event: KeyboardEvent) => {
      if (!isActiveRef.current) return;
      const key = event.key.toLocaleLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key === "p") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) requestQuickOpen();
        return;
      }
      if (showQuickOpen && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setShowQuickOpen(false);
      }
    };
    document.addEventListener("keydown", onQuickOpenKey, true);
    return () => document.removeEventListener("keydown", onQuickOpenKey, true);
  }, [requestQuickOpen, showQuickOpen]);

  useEffect(() => {
    if (!isTauri() || !isActive) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    onQuickOpenRequested(requestQuickOpen)
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => console.warn("quick open menu listener unavailable", error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [isActive, requestQuickOpen]);

  useEffect(() => {
    if (!showQuickOpen) return;
    const frame = window.requestAnimationFrame(() => quickOpenInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [showQuickOpen]);

  const makeSession = (
    profile: Profile | undefined,
    provider: AgentProvider,
    title?: string,
  ): AgentSession => {
    const meta = providerMeta(provider);
    const id = nowId("agent");
    const profileName = profile?.name || meta.label;
    const hermesDefaults = provider === "hermes"
      ? resolveHermesNewSessionProvider({
        profileId: profile?.id,
        profileCommand: profile?.cmd,
        savedPreference: readHermesModelProviderPreference(),
      })
      : null;
    const gajaeDefaults = provider === "gajecode"
      ? resolveGajaeNewSessionProvider({
        profileId: profile?.id,
        profileCommand: profile?.cmd,
        savedPreference: readGajaeModelProviderPreference(),
      })
      : null;
    const hermesProvider = hermesDefaults?.provider;
    const rawGajaeModel = gajaeDefaults?.explicitModel
      ? (gajaeDefaults.source === "profile-provider"
        ? modelForGajaeProvider(gajaeDefaults.provider, gajaeDefaults.explicitModel)
        : gajaeDefaults.explicitModel)
      : gajaeDefaults
        ? defaultGajaeModel(gajaeDefaults.provider)
        : null;
    const rawModel = hermesDefaults
      ? hermesDefaults.explicitModel || defaultHermesModel(hermesDefaults.provider)
      : rawGajaeModel
        || profileModelOverride(profile?.cmd)
        || meta.defaultModel;
    const normalizedModel = provider === "hermes"
      ? normalizeHermesModel(hermesProvider || DEFAULT_HERMES_PROVIDER, rawModel)
      : normalizeModel(provider, rawModel);
    const modelOptions = modelOptionsFor(provider, normalizedModel, hermesProvider || DEFAULT_HERMES_PROVIDER, claudeRuntimeModels, codexRuntimeModels, openRouterRuntimeModels);
    const initialModel = (provider === "claude" || provider === "codex" || provider === "gajecode" || provider === "grok" || (provider === "hermes" && isHermesProvider(hermesProvider)))
      ? coerceModelToOptions(normalizedModel, modelOptions)
      : normalizedModel;
    const defaultTitle = tw.language === "en"
      ? `New ${profileName} workspace`
      : `새 ${profileName} 작업`;
    return {
      id,
      mobileTaskId: createMobileTaskId(),
      title: title || defaultTitle,
      titleEdited: Boolean(title),
      provider,
      profileId: profile?.id || provider,
      profileName,
      profileDot: normalizeAgentDotColor(profile?.dot || meta.dot),
      model: initialModel,
      hermesProvider,
      stellaOntologyMode: normalizeStellaOntologyMode(undefined, provider),
      codexEffort: DEFAULT_WORKLOAD,
      codexSpeed: provider === "codex" ? DEFAULT_CODEX_SPEED : undefined,
      permissionMode: DEFAULT_PERMISSION_MODE,
      queueMode: false,
      worktreeEnabled: false,
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

  const openParallelLauncher = () => {
    if (showParallelLauncher) {
      setShowParallelLauncher(false);
      setParallelError(null);
      return;
    }
    const preferredIds = [
      active?.profileId,
      ...agentProfiles.map(({ profile }) => profile.id),
    ].filter((id, index, items): id is string => Boolean(id) && items.indexOf(id) === index);
    const ordered = preferredIds.flatMap((id) => agentFleetProfiles.filter((profile) => profile.id === id));
    setParallelProfileIds(selectAgentFleetProfileIds(ordered, "balanced"));
    setParallelError(null);
    setComposerHeight((height) => Math.max(height, Math.min(320, composerMaxHeight())));
    setShowParallelLauncher(true);
  };

  const toggleParallelProfile = (profileId: string) => {
    setParallelProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId],
    );
    setParallelError(null);
  };

  const applyParallelPreset = (preset: AgentFleetPreset) => {
    setParallelProfileIds(selectAgentFleetProfileIds(agentFleetProfiles, preset));
    setParallelError(null);
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
    previewUrlRef.current = normalized;
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

  const prepareWorktreeForSession = async (
    session: AgentSession,
    sourceCwd: string,
  ): Promise<AgentWorktreeInfo> => {
    if (session.worktreeInfo?.worktree_cwd) return session.worktreeInfo;
    if (!sourceCwd.trim()) {
      throw new Error(
        tw.language === "en"
          ? "Choose a Git working folder before enabling worktree isolation."
          : "worktree 격리를 사용하려면 먼저 Git 작업 폴더를 선택하세요.",
      );
    }
    const worktree = await agentWorktreePrepare(sourceCwd, session.id);
    patchSession(session.id, (current) => ({
      ...current,
      worktreeInfo: worktree,
      updatedAt: Date.now(),
    }));
    return worktree;
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

  const startManagedPreviewService = async () => {
    if (!previewManagedStartEnabled || !previewUrl || !isLocalPreviewUrl(previewUrl) || previewServiceBusy || !isTauri()) return;
    setPreviewServiceBusy(true);
    pushPreviewDiagnostic({
      source: "preview",
      level: "info",
      text: copy.previewServiceStarting,
    });
    try {
      let serviceCwd = activeExecutionCwd || null;
      if (active?.worktreeEnabled) {
        const worktree = await prepareWorktreeForSession(active, active.cwd || cwd);
        serviceCwd = worktree.worktree_cwd;
      }
      const status = await previewServiceStart({
        url: previewUrl,
        cwd: serviceCwd,
        command: previewServiceCommand || null,
        autoRestart: false,
      });
      setPreviewService(status);
      if (status.command && !previewServiceCommand) setPreviewServiceCommand(status.command);
      pushPreviewDiagnostic({
        source: "preview",
        level: "ok",
        text: copy.previewServiceStarted(status.pid),
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
    const timer = window.setInterval(syncStatus, isActive ? 2200 : 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isActive, previewUrl]);

  const updateActiveModel = (model: string) => {
    if (!active) return;
    patchSession(active.id, (session) => {
      const hermesProvider = session.provider === "hermes"
        ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
        : DEFAULT_HERMES_PROVIDER;
      const normalizedModel = session.provider === "hermes"
        ? normalizeHermesModel(hermesProvider, model)
        : normalizeModel(session.provider, model);
      const options = modelOptionsFor(session.provider, normalizedModel, hermesProvider, claudeRuntimeModels, codexRuntimeModels, openRouterRuntimeModels);
      const nextModel = (session.provider === "claude" || session.provider === "codex" || session.provider === "gajecode" || session.provider === "grok" || (session.provider === "hermes" && isHermesProvider(hermesProvider)))
        ? coerceModelToOptions(normalizedModel, options)
        : normalizedModel;
      const changed = nextModel !== session.model;
      const nextWorkload = session.provider === "hermes" && hermesProvider === "openrouter"
        ? coerceOpenRouterEffort(normalizeWorkloadLevel(session.codexEffort), nextModel, options)
        : normalizeWorkloadLevel(session.codexEffort);
      return {
        ...session,
        model: nextModel,
        codexEffort: nextWorkload || session.codexEffort,
        providerSessionId: changed ? undefined : session.providerSessionId,
        providerSessionModel: changed ? undefined : session.providerSessionModel,
        providerSessionHermesProvider: changed ? undefined : session.providerSessionHermesProvider,
        tokenUsage: changed ? undefined : session.tokenUsage,
        subscriptionUsage: changed ? undefined : session.subscriptionUsage,
        updatedAt: Date.now(),
      };
    });
    if (active.provider === "gajecode") {
      writeGajaeModelProviderPreference(inferGajaeProviderFromModel(model));
    } else if (active.provider === "hermes") {
      writeHermesModelProviderPreference(
        normalizeHermesProvider(active.hermesProvider || inferHermesProviderFromModel(active.model)),
      );
    }
  };

  const updateActiveCodexEffort = (effort: CodexEffort) => {
    if (!active) return;
    patchSession(active.id, (session) => ({ ...session, codexEffort: effort, updatedAt: Date.now() }));
  };

  const updateActiveWorkload = (workload: WorkloadLevel) => {
    if (!active) return;
    patchSession(active.id, (session) => ({ ...session, codexEffort: workload, updatedAt: Date.now() }));
  };

  const updateActiveCodexSpeed = (speed: CodexSpeed) => {
    if (!active) return;
    patchSession(active.id, (session) => ({ ...session, codexSpeed: speed, updatedAt: Date.now() }));
  };

  const updateActivePermissionMode = (permissionMode: VisiblePermissionMode) => {
    if (!active) return;
    patchSession(active.id, (session) => ({ ...session, permissionMode, updatedAt: Date.now() }));
  };

  const toggleActiveWorktree = () => {
    if (!active || busyTurnId) return;
    const enabling = !active.worktreeEnabled;
    patchSession(active.id, (session) => ({
      ...session,
      worktreeEnabled: enabling,
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
    const now = Date.now();
    const activityKey = `${activity.kind}:${activity.label}`;
    const previousPulse = lastActivityPulseRef.current[assistantId];
    if (previousPulse?.key === activityKey && now - previousPulse.at < 650) return;
    lastActivityPulseRef.current[assistantId] = { key: activityKey, at: now };
    patchSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((m) => {
        if (m.id !== assistantId) return m;
        const prev = m.activities || [];
        const last = prev[prev.length - 1];
        const nextActivity: AgentActivity = {
          ...activity,
          id: nowId("activity"),
          createdAt: now,
          active: m.status === "streaming",
        };
        const next = last?.label === nextActivity.label
          ? [...prev.slice(0, -1), { ...last, active: nextActivity.active, createdAt: nextActivity.createdAt }]
          : [...prev.map((item) => ({ ...item, active: false })), nextActivity].slice(-4);
        return { ...m, activities: next };
      }),
      updatedAt: now,
    }));
  };

  const finishActivities = (sessionId: string, assistantId: string) => {
    delete lastActivityPulseRef.current[assistantId];
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
      rawEvents: session.rawEvents,
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

  // 턴 시작 시점에 레인을 심어 둔다. 레인을 모르면 판정이 blind 로 떨어져 늘 노출되므로,
  // 첫 이벤트를 기다리지 않고 프로바이더를 아는 이 시점에 등록한다.
  const startTurnPreviewImpact = (assistantId: string, lane: string) => {
    const store = turnPreviewImpactRef.current;
    const tracked = Object.keys(store);
    if (tracked.length >= MAX_TRACKED_TURN_IMPACTS) delete store[tracked[0]];
    store[assistantId] = createTurnPreviewImpact(lane);
  };

  const noteTurnPreviewImpact = (assistantId: string, event: AgentStreamEvent) => {
    const store = turnPreviewImpactRef.current;
    if (!store[assistantId]) {
      const tracked = Object.keys(store);
      if (tracked.length >= MAX_TRACKED_TURN_IMPACTS) delete store[tracked[0]];
      store[assistantId] = createTurnPreviewImpact();
    }
    noteTurnPreviewImpactEvent(store[assistantId], event);
  };

  const handleAgentEvent = (sessionId: string, assistantId: string, event: AgentStreamEvent) => {
    // lifecycle 이벤트는 같은 스트림 이벤트에서 파생되므로 여기서만 집계한다(중복 방지).
    noteTurnPreviewImpact(assistantId, event);
    if (sessionId === activeIdRef.current) {
      noteTerminalIssue(event);
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
    const finalVisibleText = selectTerminalAgentAnswer({
      terminalResultPresent: true,
      terminalText: cleanAgentText(event.text),
      streamedDraft: pendingStreamRef.current[assistantId]?.text,
      fallbackText: event.kind === "error" || event.is_error ? "Agent error" : copy.noResponse,
    });
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
          return {
            ...m,
            text: finalVisibleText,
            status: event.is_error ? "error" as const : "done" as const,
            intermediateDraft: preserveIntermediateDraft(m, finalVisibleText),
            unverifiedIntermediate: false,
          };
        }
        if (event.kind === "error") {
          return {
            ...m,
            text: finalVisibleText,
            status: "error" as const,
            intermediateDraft: preserveIntermediateDraft(m, finalVisibleText),
            unverifiedIntermediate: false,
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

  const handleAgentTokenUsage = (sessionId: string, event: AgentTokenUsageEvent) => {
    const tokenUsage = normalizeSessionTokenUsage(event);
    if (!tokenUsage) return;
    patchSession(sessionId, (session) => {
      if (session.tokenUsage && session.tokenUsage.timestamp_ms > tokenUsage.timestamp_ms) {
        return session;
      }
      return { ...session, tokenUsage, updatedAt: Date.now() };
    });
  };

  const handleAgentSubscriptionUsage = (
    sessionId: string,
    event: ProviderSubscriptionUsage,
  ) => {
    const subscriptionUsage = normalizeSubscriptionUsage(event);
    if (!subscriptionUsage) return;
    patchSession(sessionId, (session) => {
      if (
        session.subscriptionUsage
        && session.subscriptionUsage.capturedAtUnixMs > subscriptionUsage.capturedAtUnixMs
      ) {
        return session;
      }
      return { ...session, subscriptionUsage, updatedAt: Date.now() };
    });
  };

  const handleAgentLifecycle = (
    sessionId: string,
    assistantId: string,
    event: AgentLifecycleEvent,
  ) => {
    if (event.phase === "started") {
      pushActivity(sessionId, assistantId, {
        kind: "status",
        status: event.status || "starting",
        text: null,
        raw: null,
        provider_session_id: event.provider_session_id,
        is_error: false,
      });
    } else if (event.phase === "tool_started") {
      pushActivity(sessionId, assistantId, {
        kind: "tool",
        status: event.status || "tool",
        text: event.summary,
        raw: null,
        provider_session_id: event.provider_session_id,
        is_error: false,
      });
    } else if (event.phase === "waiting_for_user") {
      pushActivity(sessionId, assistantId, {
        kind: "status",
        status: event.status || "waiting_for_user",
        text: event.summary,
        raw: null,
        provider_session_id: event.provider_session_id,
        is_error: false,
      });
    }

    if (event.terminal) finishActivities(sessionId, assistantId);
    patchSession(sessionId, (session) => ({
      ...session,
      providerSessionId: event.provider_session_id || session.providerSessionId,
      messages: session.messages.map((message) => {
        if (message.id !== assistantId) return message;
        const lifecyclePhase = event.phase;
        if (event.phase === "cancelled") {
          const terminalText = copy.stoppedResponse;
          return {
            ...message,
            lifecyclePhase,
            text: terminalText,
            status: "done" as const,
            intermediateDraft: preserveIntermediateDraft(message, terminalText),
            unverifiedIntermediate: false,
          };
        }
        if (event.phase === "failed" && message.status === "streaming") {
          const terminalText = cleanAgentText(event.summary) || "Agent error";
          return {
            ...message,
            lifecyclePhase,
            text: terminalText,
            status: "error" as const,
            intermediateDraft: preserveIntermediateDraft(message, terminalText),
            unverifiedIntermediate: false,
          };
        }
        if (event.phase === "completed" && message.status === "streaming") {
          return {
            ...message,
            lifecyclePhase,
            status: "error" as const,
            unverifiedIntermediate: true,
          };
        }
        return { ...message, lifecyclePhase };
      }),
      updatedAt: Date.now(),
    }));
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

  const diffReviewTargetKey = (messageId: string, filePath: string, lineKey: string) =>
    `${messageId}:${filePath}:${lineKey}`;

  const openLineReview = (messageId: string, filePath: string, line: DiffReviewLine) => {
    if (!line.annotatable) return;
    const key = diffReviewTargetKey(messageId, filePath, line.key);
    setReviewTargetKey((current) => current === key ? null : key);
    setReviewDraft("");
  };

  const saveLineReview = (
    sessionId: string,
    messageId: string,
    filePath: string,
    line: DiffReviewLine,
  ) => {
    const body = reviewDraft.trim();
    if (!body || !line.annotatable) return;
    const annotation: ChangeReviewAnnotation = {
      id: nowId("line-review"),
      filePath,
      lineKey: line.key,
      kind: line.kind === "addition" || line.kind === "deletion" ? line.kind : "context",
      oldLine: line.oldLine,
      newLine: line.newLine,
      lineText: line.raw,
      body,
      resolved: false,
      createdAt: Date.now(),
    };
    patchSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((item) => item.id === messageId
        ? { ...item, reviewAnnotations: [...(item.reviewAnnotations || []), annotation] }
        : item),
      updatedAt: Date.now(),
    }));
    setReviewTargetKey(null);
    setReviewDraft("");
  };

  const updateLineReview = (sessionId: string, messageId: string, annotationId: string, resolved: boolean) => {
    patchSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((item) => item.id === messageId
        ? {
            ...item,
            reviewAnnotations: (item.reviewAnnotations || []).map((annotation) =>
              annotation.id === annotationId ? { ...annotation, resolved } : annotation,
            ),
          }
        : item),
      updatedAt: Date.now(),
    }));
  };

  const deleteLineReview = (sessionId: string, messageId: string, annotationId: string) => {
    patchSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((item) => item.id === messageId
        ? {
            ...item,
            reviewAnnotations: (item.reviewAnnotations || []).filter((annotation) => annotation.id !== annotationId),
          }
        : item),
      updatedAt: Date.now(),
    }));
  };

  const updateReviewWorkflowStatus = (
    sessionId: string,
    request: ReviewDispatchContext | undefined,
    status: ReviewWorkflowPhase,
    details: {
      responseMessageId?: string;
      responseExcerpt?: string;
      error?: string;
    } = {},
  ) => {
    if (!request) return;
    patchSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((item) => item.id === request.sourceMessageId
        ? {
            ...item,
            reviewWorkflow: transitionReviewWorkflow(item.reviewWorkflow, request, status, details),
          }
        : item),
      updatedAt: Date.now(),
    }));
  };

  const sendLineReviews = async (message: ChatMessage) => {
    if (!active) return;
    const prompt = formatReviewAnnotationsPrompt(
      message.reviewAnnotations || [],
      tw.language === "en" ? "en" : "ko",
    );
    if (!prompt) return;
    const dispatch = createReviewDispatch({
      dispatchId: nowId("review-dispatch"),
      sessionId: active.id,
      sourceMessageId: message.id,
      annotations: message.reviewAnnotations || [],
      state: message.reviewWorkflow,
    });
    if (!dispatch) return;
    const sessionId = active.id;
    const createdAt = Date.now();
    const payload: QueuedAgentTurn = {
      id: nowId("queued-turn"),
      userMessageId: nowId("user"),
      text: prompt,
      displayText: prompt,
      attachments: [],
      cwd: active.cwd || cwd,
      createdAt,
      reviewRequest: dispatch.context,
    };
    const isBusy = Boolean(busyTurnIdsRef.current[sessionId]);
    patchSession(sessionId, (session) => ({
      ...session,
      queuedTurns: isBusy ? [...(session.queuedTurns || []), payload] : (session.queuedTurns || []),
      messages: [
        ...(isBusy ? session.messages : finalizeOrphanedStreamingMessages(session.messages)).map((item) =>
          item.id === message.id ? { ...item, reviewWorkflow: dispatch.state } : item,
        ),
        {
          id: payload.userMessageId,
          role: "user",
          text: prompt,
          createdAt,
          status: isBusy ? "queued" : "done",
          attachments: [],
        },
      ],
      updatedAt: createdAt,
    }));
    if (!isBusy) await runAgentTurn(sessionId, payload);
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
    const reviewAnnotations = message.reviewAnnotations || [];
    const openReviewAnnotations = reviewAnnotations.filter((annotation) => !annotation.resolved);
    const allOpen = summary.files.length > 0
      && summary.files.every((file) => expandedDiffByKey[`${message.id}:${file.path}`]);
    return (
      <div className={cls("atelier-change-panel mt-3", dark ? "atelier-change-panel-dark" : "")}>
        <div className="atelier-change-header">
          <div className="atelier-change-title">
            <span>{copy.changedFiles(summary.files.length)}</span>
            <span className="atelier-change-add">+{summary.additions}</span>
            <span className="atelier-change-del">-{summary.deletions}</span>
            {openReviewAnnotations.length > 0 && (
              <span className="atelier-change-review-count">
                {copy.reviewCommentCount(openReviewAnnotations.length)}
              </span>
            )}
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
        <ReviewWorkflowStatus
          annotations={reviewAnnotations}
          state={message.reviewWorkflow}
          language={tw.language === "en" ? "en" : "ko"}
          disabled={!active}
          onSend={() => { sendLineReviews(message).catch(console.error); }}
        />
        {summary.files.map((file) => {
          const key = `${message.id}:${file.path}`;
          const open = reviewOpenById[message.id] || expandedDiffByKey[key];
          const parsedLines = parseUnifiedDiff(file.diff);
          const fileAnnotations = reviewAnnotations.filter((annotation) => annotation.filePath === file.path);
          return (
            <div className="atelier-change-file" key={file.path}>
              <button type="button" className="atelier-change-row" onClick={() => toggleFileDiff(message.id, file.path)}>
                <span className="atelier-change-path">{file.path}</span>
                <span className="atelier-change-add">+{file.additions}</span>
                <span className="atelier-change-del">-{file.deletions}</span>
                <span className={cls("atelier-change-chevron", open ? "atelier-change-chevron-open" : "")}>⌄</span>
              </button>
              {open && (
                <div className="atelier-change-diff">
                  {parsedLines.length === 0 ? (
                    <div className="atelier-diff-empty">{copy.noDiff}</div>
                  ) : parsedLines.map((line) => {
                    const targetKey = diffReviewTargetKey(message.id, file.path, line.key);
                    const lineAnnotations = fileAnnotations.filter((annotation) =>
                      reviewAnnotationMatchesLine(annotation, line),
                    );
                    return (
                      <div className="atelier-diff-line-shell" key={line.key}>
                        <button
                          type="button"
                          className={cls(
                            "atelier-diff-line",
                            `atelier-diff-line-${line.kind}`,
                            line.annotatable ? "atelier-diff-line-annotatable" : "",
                          )}
                          disabled={!line.annotatable}
                          onClick={() => openLineReview(message.id, file.path, line)}
                          aria-label={line.annotatable ? copy.addLineReview : undefined}
                          title={line.annotatable ? copy.addLineReview : undefined}
                        >
                          <span className="atelier-diff-line-number">{line.oldLine ?? ""}</span>
                          <span className="atelier-diff-line-number">{line.newLine ?? ""}</span>
                          <span className="atelier-diff-code">{line.raw || " "}</span>
                          <span className="atelier-diff-comment-indicator" aria-hidden="true">
                            {lineAnnotations.length > 0 ? lineAnnotations.length : line.annotatable ? I.comment : null}
                          </span>
                        </button>
                        {lineAnnotations.map((annotation) => (
                          <div
                            key={annotation.id}
                            className={cls("atelier-diff-comment", annotation.resolved ? "atelier-diff-comment-resolved" : "")}
                          >
                            <span className="atelier-diff-comment-location">
                              {reviewLineLabel(annotation, tw.language === "en" ? "en" : "ko")}
                            </span>
                            <span className="atelier-diff-comment-body">{annotation.body}</span>
                            <button
                              type="button"
                              onClick={() => active && updateLineReview(active.id, message.id, annotation.id, !annotation.resolved)}
                              title={annotation.resolved ? copy.reopenLineReview : copy.resolveLineReview}
                              aria-label={annotation.resolved ? copy.reopenLineReview : copy.resolveLineReview}
                            >
                              {I.check}
                            </button>
                            <button
                              type="button"
                              onClick={() => active && deleteLineReview(active.id, message.id, annotation.id)}
                              title={copy.deleteLineReview}
                              aria-label={copy.deleteLineReview}
                            >
                              {I.x}
                            </button>
                          </div>
                        ))}
                        {reviewTargetKey === targetKey && active && (
                          <div className="atelier-diff-comment-editor">
                            <textarea
                              autoFocus
                              value={reviewDraft}
                              onChange={(event) => setReviewDraft(event.target.value)}
                              placeholder={copy.lineReviewPlaceholder}
                              maxLength={2000}
                              onKeyDown={(event) => {
                                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                  event.preventDefault();
                                  saveLineReview(active.id, message.id, file.path, line);
                                }
                                if (event.key === "Escape") {
                                  setReviewTargetKey(null);
                                  setReviewDraft("");
                                }
                              }}
                            />
                            <div className="atelier-diff-comment-editor-actions">
                              <button type="button" onClick={() => { setReviewTargetKey(null); setReviewDraft(""); }}>
                                {copy.cancelLineReview}
                              </button>
                              <button
                                type="button"
                                disabled={!reviewDraft.trim()}
                                onClick={() => saveLineReview(active.id, message.id, file.path, line)}
                              >
                                {copy.saveLineReview}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
    const fallbackLabel = tw.language === "en" ? "Thinking" : "생각 중";
    const currentLabel = last?.label || fallbackLabel;
    const icon = !last || last.kind === "thinking" ? "…" : I.terminal;
    return (
      <AgentActivityView
        createdAt={message.createdAt}
        currentLabel={currentLabel}
        language={tw.language}
        icon={icon}
        dark={dark}
        canStop={Boolean(busyTurnId)}
        stopping={isStoppingActiveTurn}
        stopLabel={copy.stop}
        stoppingLabel={copy.stopping}
        onStop={stopActiveTurn}
      />
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

  const renderTaskEvidence = (message: ChatMessage) => {
    if (message.role !== "assistant" || (!message.worktree && !message.previewEvidence)) return null;
    return (
      <div className={cls(
        "mt-3 overflow-hidden rounded-[8px] border text-[11px]",
        dark ? "border-dline bg-dsurf text-dsub" : "border-line bg-muted text-sub",
      )}>
        {message.worktree && (
          <div className={cls(
            "grid grid-cols-[18px_minmax(0,1fr)] gap-2 px-3 py-2.5",
            message.previewEvidence ? (dark ? "border-b border-dline" : "border-b border-line") : "",
          )}>
            <span className="mt-0.5 text-[#e26f4f]" aria-hidden="true">{I.split}</span>
            <div className="min-w-0">
              <div className={cls("font-medium", dark ? "text-dink" : "text-ink")}>
                {tw.language === "en" ? "Isolated worktree" : "격리 worktree"} · {message.worktree.branch}
              </div>
              <div className="mt-0.5 truncate font-mono" title={message.worktree.worktree_cwd}>
                {message.worktree.worktree_cwd}
              </div>
              {message.worktree.source_dirty && (
                <div className="mt-1 text-[#d79b3d]">
                  {tw.language === "en"
                    ? "Source workspace edits were preserved and were not copied into this worktree."
                    : "원본 작업공간의 기존 변경은 보존했으며 이 worktree로 복사하지 않았습니다."}
                </div>
              )}
            </div>
          </div>
        )}
        {message.previewEvidence && (
          <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 px-3 py-2.5">
            <span className={cls("mt-0.5", message.previewEvidence.ok ? "text-[#31b879]" : "text-[#d9534f]")} aria-hidden="true">
              {I.eye}
            </span>
            <div className="min-w-0">
              <div className={cls("font-medium", dark ? "text-dink" : "text-ink")}>
                {message.previewEvidence.ok
                  ? (tw.language === "en" ? "Preview verified" : "프리뷰 검증 완료")
                  : (tw.language === "en" ? "Preview issue detected" : "프리뷰 문제 감지")}
                {message.previewEvidence.status ? ` · HTTP ${message.previewEvidence.status}` : ""}
                {message.previewEvidence.serviceRunning !== undefined
                  ? ` · ${message.previewEvidence.serviceRunning
                    ? (tw.language === "en" ? "service running" : "서비스 실행 중")
                    : (tw.language === "en" ? "service stopped" : "서비스 중지됨")}`
                  : ""}
                {message.previewEvidence.servicePid ? ` · PID ${message.previewEvidence.servicePid}` : ""}
              </div>
              <div className="mt-0.5 truncate" title={message.previewEvidence.url}>{message.previewEvidence.url}</div>
              <div className="mt-1 font-mono">
                {message.previewEvidence.networkMethod || "GET"}
                {message.previewEvidence.checkedAt
                  ? ` · ${new Date(message.previewEvidence.checkedAt).toLocaleTimeString()}`
                  : ""}
                {message.previewEvidence.serviceRestarts
                  ? ` · ${tw.language === "en" ? "restarts" : "재시작"} ${message.previewEvidence.serviceRestarts}`
                  : ""}
              </div>
              {(message.previewEvidence.domNodes !== undefined || message.previewEvidence.screenshotCaptured) && (
                <div className="mt-1 font-mono">
                  {message.previewEvidence.domNodes !== undefined ? `DOM ${message.previewEvidence.domNodes}` : ""}
                  {message.previewEvidence.domNodes !== undefined && message.previewEvidence.screenshotCaptured ? " · " : ""}
                  {message.previewEvidence.screenshotCaptured ? (tw.language === "en" ? "screenshot captured" : "스크린샷 캡처됨") : ""}
                </div>
              )}
              {(message.previewEvidence.browserErrorCount !== undefined
                || message.previewEvidence.networkRequestCount !== undefined) && (
                <div className="mt-1 font-mono">
                  Console {message.previewEvidence.browserErrorCount || 0}
                  {message.previewEvidence.browserWarningCount ? `/${message.previewEvidence.browserWarningCount} warn` : ""}
                  {" · "}Network {message.previewEvidence.networkRequestCount || 0}
                  {message.previewEvidence.networkFailureCount ? `/${message.previewEvidence.networkFailureCount} failed` : ""}
                </div>
              )}
              {message.previewEvidence.error && <div className="mt-1 text-[#d9534f]">{message.previewEvidence.error}</div>}
              {message.previewEvidence.serviceError && <div className="mt-1 text-[#d9534f]">{message.previewEvidence.serviceError}</div>}
              {message.previewEvidence.bodyText && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer select-none">
                    {tw.language === "en" ? "HTTP response evidence" : "HTTP 응답 증거"}
                  </summary>
                  <div className="mt-1 whitespace-pre-wrap break-words font-mono">
                    {message.previewEvidence.bodyText}
                  </div>
                </details>
              )}
              {Boolean(message.previewEvidence.serviceOutput?.length) && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer select-none">
                    {tw.language === "en" ? "Preview server output" : "프리뷰 서버 출력"}
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono">
                    {message.previewEvidence.serviceOutput?.join("\n")}
                  </pre>
                </details>
              )}
              {Boolean(message.previewEvidence.consoleEvidence?.length) && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer select-none">
                    {tw.language === "en" ? "Browser console evidence" : "브라우저 콘솔 증거"}
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono">
                    {message.previewEvidence.consoleEvidence?.join("\n")}
                  </pre>
                </details>
              )}
              {Boolean(message.previewEvidence.networkEvidence?.length) && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer select-none">
                    {tw.language === "en" ? "Browser network evidence" : "브라우저 네트워크 증거"}
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono">
                    {message.previewEvidence.networkEvidence?.join("\n")}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderedTranscriptMessages = useMemo(() => {
    if (!active) return null;
    return active.messages.map((m) => {
      const isStreamingAssistant = m.role === "assistant" && m.status === "streaming";
      const isAnimatedAssistant = m.role === "assistant" && animatedAssistantIdsRef.current.has(m.id);
      const answerPresentation = m.unverifiedIntermediate
        ? {
            text: unverifiedIntermediateNotice(tw.language),
            changed: true,
          }
        : presentAgentAnswer({
            provider: active.provider,
            role: m.role,
            status: m.status,
            text: m.text,
            language: tw.language,
          });
      const displayText = answerPresentation.changed
        ? answerPresentation.text
        : (animatedAssistantIdsRef.current.has(m.id)
            ? (visibleTextById[m.id] || "")
            : m.text);
      const storedOriginalText = answerPresentation.changed
        ? m.text
        : (m.intermediateDraft || "");
      const showStoredOriginal = Boolean(storedOriginalText)
        && (Boolean(m.unverifiedIntermediate) || answerPresentation.changed || m.status === "error");
      const isRevealing = !answerPresentation.changed && isAnimatedAssistant && displayText !== m.text;
      const useStreamingRenderer = isStreamingAssistant || isRevealing;
      const normalizedDisplayText = m.role === "assistant"
        ? normalizeAgentDisplayText(displayText)
        : displayText;
      const cleanedRenderedText = useStreamingRenderer
        ? cleanStreamingText(collapseDumpyText(normalizedDisplayText)).replace(/\s+$/g, "")
        : collapseDumpyText(normalizedDisplayText).replace(/\s+$/g, "");
      const renderedText = m.role === "assistant" && !useStreamingRenderer
        ? improveReadableMarkdown(cleanedRenderedText)
        : cleanedRenderedText;
      const hasRenderedText = renderedText.trim().length > 0;
      return (
        <article
          key={m.id}
          className={cls("atelier-transcript-message flex min-w-0 gap-3", m.role === "user" ? "justify-end" : "justify-start")}
          data-streaming={m.status === "streaming" ? "true" : "false"}
        >
          {m.role !== "user" && (
            <div
              className="mt-1 h-7 w-7 shrink-0 rounded-[7px] text-white grid place-items-center text-[10px] font-semibold"
              style={{ background: normalizeAgentDotColor(active.profileDot || activeProviderMeta.dot) }}
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
                    "flex-1 max-w-full text-[13.5px] leading-[1.68] py-1",
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
            {m.role === "assistant" && showStoredOriginal && (
              <details className={cls("mt-2 rounded-[6px] border px-2.5 py-2 text-[11px]", dark ? "border-dline text-dsub" : "border-line text-sub")}>
                <summary className="cursor-pointer select-none font-medium">
                  {tw.language === "en" ? "Show stored original" : "저장된 원문 보기"}
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.55]">
                  {storedOriginalText}
                </pre>
              </details>
            )}
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
            {m.status === "streaming" && renderAgentActivity(m)}
            {m.role === "assistant" && renderTaskEvidence(m)}
            {m.role === "assistant" && renderChangeSummary(m)}
            {m.role === "assistant" && renderAgentLogs(m)}
          </div>
        </article>
      );
    });
  }, [
    active?.id,
    active?.messages,
    active?.profileDot,
    active?.cwd,
    active?.provider,
    activeProviderMeta.dot,
    activeProviderMeta.short,
    visibleTextById,
    dark,
    copy,
    expandedDiffByKey,
    reviewOpenById,
    logsOpenById,
    cwd,
    tw.language,
  ]);

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
    if (provider === "gajecode") return "가재코드";
    if (provider === "grok") return "Grok";
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
    const runArgs = session.provider === "gajecode" && args[0]?.toLowerCase() === "gjc"
      ? args.slice(1)
      : args;
    if (runArgs.length === 0) {
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
        args: runArgs,
        cwd: session.cwd || cwd,
      });
      localAssistantMessage(session.id, rawText, formatCliCommandResult(session.provider, runArgs, result));
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

  const applySlashCommand = (command: SlashCommandSpec) => {
    setComposerInput(command.insert);
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const cursor = command.insert.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const applyFactoryLauncher = () => {
    const current = inputDraftRef.current.trim();
    const body = stripFactoryCommandPrefix(current);
    const prefix = tw.language === "en" ? "Stella Mode " : "스텔라 모드 ";
    const next = body ? `${prefix}${body}` : prefix;
    setComposerInput(next);
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const cursor = el.value.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const startNextQueuedTurn = (sessionId: string) => {
    window.setTimeout(() => {
      if (busyTurnIdsRef.current[sessionId]) return;
      const session = sessionsRef.current.find((item) => item.id === sessionId);
      const nextTurn = session?.queuedTurns?.[0];
      if (!session || !nextTurn) return;
      const waitMs = Math.max(0, (nextTurn.notBefore || 0) - Date.now());
      if (waitMs > 0) {
        const timerKey = `queue:${sessionId}`;
        if (providerCooldownRetryTimersRef.current[timerKey]) {
          window.clearTimeout(providerCooldownRetryTimersRef.current[timerKey]);
        }
        providerCooldownRetryTimersRef.current[timerKey] = window.setTimeout(() => {
          delete providerCooldownRetryTimersRef.current[timerKey];
          startNextQueuedTurn(sessionId);
        }, waitMs);
        return;
      }
      patchSession(sessionId, (current) => ({
        ...current,
        queuedTurns: (current.queuedTurns || []).filter((turn) => turn.id !== nextTurn.id),
        updatedAt: Date.now(),
      }));
      runAgentTurn(sessionId, nextTurn).catch(console.error);
    }, 0);
  };

  useEffect(() => {
    sessionsRef.current.forEach((session) => {
      if (session.queuedTurns?.length) startNextQueuedTurn(session.id);
    });
  }, []);

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
      const options = modelOptionsFor(session.provider, session.model || providerMeta(session.provider).defaultModel, hermesProvider, claudeRuntimeModels, codexRuntimeModels, openRouterRuntimeModels);
      const help = slashCommandsFor(session.provider, hermesProvider, options)
        .map((item) => {
          const detail = tw.language === "en" ? item.detailEn : item.detailKo;
          return `${item.command} - ${detail}`;
        })
        .join("\n");
      localAssistantMessage(session.id, rawText, `${tw.language === "en" ? "Slash commands" : "슬래시 명령어"}:\n${help}`);
      return true;
    }

    if (command === "/goal" || command === "/analyze" || command === "/probe" || command === "/audit") {
      const usage = {
        "/goal": tw.language === "en" ? "Usage: /goal <objective>" : "사용법: /goal <목표>",
        "/analyze": tw.language === "en" ? "Usage: /analyze <scope>" : "사용법: /analyze <범위>",
        "/probe": tw.language === "en" ? "Usage: /probe <scope>" : "사용법: /probe <검증 범위>",
        "/audit": tw.language === "en" ? "Usage: /audit <scope>" : "사용법: /audit <감사 범위>",
      } as Record<string, string>;
      localAssistantMessage(
        session.id,
        rawText,
        usage[command],
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

    if (command === "/isolation") {
      const requested = arg.toLowerCase();
      if (requested !== "workspace" && requested !== "worktree") {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en"
            ? "Usage: /isolation workspace|worktree"
            : "사용법: /isolation workspace|worktree",
        );
        return true;
      }
      const enabled = requested === "worktree";
      patchSession(session.id, (current) => ({
        ...current,
        worktreeEnabled: enabled,
        updatedAt: Date.now(),
      }));
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en"
          ? enabled
            ? "Isolated worktree is on. The next run will prepare a task branch without changing source-workspace edits."
            : "Isolation is off. The next run will use the source workspace."
          : enabled
            ? "격리 worktree를 켰습니다. 다음 실행은 원본 작업공간의 기존 변경을 건드리지 않고 별도 작업 브랜치를 준비합니다."
            : "격리를 껐습니다. 다음 실행부터 원본 작업공간을 사용합니다.",
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
        for (const [timerKey, timer] of Object.entries(providerCooldownRetryTimersRef.current)) {
          if (timerKey === `queue:${session.id}` || timerKey.startsWith(`${session.id}:`)) {
            window.clearTimeout(timer);
            delete providerCooldownRetryTimersRef.current[timerKey];
          }
        }
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
      const options = modelOptionsFor(session.provider, session.model || providerMeta(session.provider).defaultModel, hermesProvider, claudeRuntimeModels, codexRuntimeModels, openRouterRuntimeModels);
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
      const normalizedModel = session.provider === "hermes"
        ? normalizeHermesModel(nextHermesProvider, requested)
        : normalizeModel(session.provider, requested);
      const nextOptions = modelOptionsFor(session.provider, normalizedModel, nextHermesProvider, claudeRuntimeModels, codexRuntimeModels, openRouterRuntimeModels);
      const nextModel = (session.provider === "claude" || session.provider === "codex" || session.provider === "gajecode" || session.provider === "grok" || (session.provider === "hermes" && isHermesProvider(nextHermesProvider)))
        ? coerceModelToOptions(normalizedModel, nextOptions)
        : normalizedModel;
      const nextWorkload = session.provider === "hermes" && nextHermesProvider === "openrouter"
        ? coerceOpenRouterEffort(normalizeWorkloadLevel(session.codexEffort), nextModel, nextOptions)
        : normalizeWorkloadLevel(session.codexEffort);
      if (session.provider === "gajecode") {
        writeGajaeModelProviderPreference(inferGajaeProviderFromModel(nextModel));
      } else if (session.provider === "hermes") {
        writeHermesModelProviderPreference(nextHermesProvider);
      }
      patchSession(session.id, (current) => ({
        ...current,
        model: nextModel,
        codexEffort: nextWorkload || current.codexEffort,
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
        tokenUsage: current.model !== nextModel || current.hermesProvider !== nextHermesProvider
          ? undefined
          : current.tokenUsage,
        subscriptionUsage: current.model !== nextModel || current.hermesProvider !== nextHermesProvider
          ? undefined
          : current.subscriptionUsage,
        updatedAt: Date.now(),
      }));
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en"
          ? `Model changed: ${nextModel}${session.provider === "hermes" ? `\nNext Hermes run: --provider ${nextHermesProvider} --model ${nextModel}` : ""}`
          : `모델을 변경했습니다: ${nextModel}${session.provider === "hermes" ? `\n다음 Hermes 실행에 적용됩니다: --provider ${nextHermesProvider} --model ${nextModel}` : ""}`,
      );
      return true;
    }

    if (command === "/gjc" || command === "/hermes" || command === "/claude" || command === "/codex" || command === "/gajecode") {
      const provider = command === "/gjc" ? "gajecode" : command.slice(1) as AgentProvider;
      if (session.provider !== provider) {
        localAssistantMessage(session.id, rawText, providerOnlyMessage(provider));
        return true;
      }
      if (provider === "gajecode") {
        const classified = classifyGajaePrefixedInput(rawText);
        if (classified.kind === "prompt") return false;
        if (classified.kind === "empty") {
          localAssistantMessage(
            session.id,
            rawText,
            tw.language === "en" ? "Usage: /gjc <task or CLI command>" : "사용법: /gjc <자연어 작업 또는 CLI 명령>",
          );
          return true;
        }
        if (classified.kind === "cli") {
          await runProviderCliSlashCommand(session, rawText, classified.args);
          return true;
        }
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
      if (session.provider !== "hermes" && session.provider !== "gajecode") {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "/skills is available in Hermes and Gajae Code sessions." : "/skills는 Hermes/가재코드 작업에서 사용할 수 있습니다.",
        );
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
      if (session.provider !== "hermes" && session.provider !== "gajecode") {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en" ? "/status is available in Hermes and Gajae Code sessions." : "/status는 Hermes/가재코드 작업에서 사용할 수 있습니다.",
        );
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
      const capability = runtimeCapabilities?.find((item) => item.id === session.provider);
      const permissionDisabledReason = managedAgentPermissionDisabledReason(
        session.provider,
        capability,
        tw.language,
        runtimeCapabilityError,
      ) || managedPermissionControlDisabledReason(session.provider, capability, tw.language);
      if (permissionDisabledReason) {
        localAssistantMessage(session.id, rawText, permissionDisabledReason);
        return true;
      }
      const normalizedArg = arg.trim().toLowerCase();
      if (!arg) {
        localAssistantMessage(
          session.id,
          rawText,
          permissionUsageMessage(tw.language),
        );
        return true;
      }
      if (/^(full|bypass|danger)$/i.test(normalizedArg)) {
        localAssistantMessage(session.id, rawText, permissionFullRejectedMessage(tw.language));
        return true;
      }
      if (!isPermissionMode(normalizedArg)) {
        localAssistantMessage(session.id, rawText, permissionUsageMessage(tw.language));
        return true;
      }
      patchSession(session.id, (current) => ({ ...current, permissionMode: normalizedArg, updatedAt: Date.now() }));
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en"
          ? `Permission changed: ${labelForPermissionMode(normalizedArg, "en")}`
          : `권한을 변경했습니다: ${labelForPermissionMode(normalizedArg, "ko")}`,
      );
      return true;
    }

    if (command === "/provider") {
      if (session.provider === "gajecode") {
        if (!arg || !isGajaeProvider(arg)) {
          localAssistantMessage(session.id, rawText, tw.language === "en" ? "Usage: /provider claude|codex|alibaba" : "사용법: /provider claude|codex|alibaba");
          return true;
        }
        const defaultModel = defaultGajaeModel(arg);
        const options = modelOptionsFor("gajecode", defaultModel, DEFAULT_HERMES_PROVIDER, claudeRuntimeModels, codexRuntimeModels, openRouterRuntimeModels);
        const nextModel = options[0]?.value || defaultModel;
        writeGajaeModelProviderPreference(arg);
        patchSession(session.id, (current) => ({
          ...current,
          model: nextModel,
          providerSessionId: undefined,
          providerSessionModel: undefined,
          updatedAt: Date.now(),
        }));
        const providerLabel = GAJECODE_PROVIDERS.find((item) => item.value === arg)?.label || arg;
        localAssistantMessage(session.id, rawText, tw.language === "en" ? `Gajae provider changed: ${providerLabel}` : `가재코드 provider를 ${providerLabel}로 변경했습니다.`);
        return true;
      }
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
            ? "Usage: /provider openai-codex|anthropic|openrouter|alibaba"
            : "사용법: /provider openai-codex|anthropic|openrouter|alibaba",
        );
        return true;
      }
      const providerOptions = modelOptionsFor("hermes", defaultHermesModel(arg), arg, claudeRuntimeModels, codexRuntimeModels, openRouterRuntimeModels);
      const nextModel = providerOptions[0]?.value || defaultHermesModel(arg);
      writeHermesModelProviderPreference(arg);
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
          ? `Hermes provider changed: ${arg} · ${nextModel}\nNext Hermes run: --provider ${arg} --model ${nextModel}`
          : `Hermes provider를 변경했습니다: ${arg} · ${nextModel}\n다음 Hermes 실행에 적용됩니다: --provider ${arg} --model ${nextModel}`,
      );
      return true;
    }

    if (command === "/effort" || command === "/workload") {
      const requestedWorkload = arg ? normalizeWorkloadInput(arg) : null;
      if (!requestedWorkload) {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en"
            ? "Usage: /workload none|minimal|low|medium|high|xhigh|max|ultra"
            : "사용법: /workload none|minimal|low|medium|high|xhigh|max|ultra",
        );
        return true;
      }
      const hermesProvider = session.provider === "hermes"
        ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
        : DEFAULT_HERMES_PROVIDER;
      const modelOptions = modelOptionsFor(
        session.provider,
        session.model,
        hermesProvider,
        claudeRuntimeModels,
        codexRuntimeModels,
        openRouterRuntimeModels,
      );
      const workload = session.provider === "hermes" && hermesProvider === "openrouter"
        ? coerceOpenRouterEffort(requestedWorkload, session.model, modelOptions)
        : requestedWorkload;
      if (!workload) {
        localAssistantMessage(
          session.id,
          rawText,
          tw.language === "en"
            ? "The selected OpenRouter model does not expose a reasoning control."
            : "선택한 OpenRouter 모델은 추론 작업량 조절을 지원하지 않습니다.",
        );
        return true;
      }
      patchSession(session.id, (current) => ({ ...current, codexEffort: workload, updatedAt: Date.now() }));
      localAssistantMessage(
        session.id,
        rawText,
        tw.language === "en"
          ? `Workload changed: ${labelForWorkload(workload, "en")}`
          : `작업량을 변경했습니다: ${labelForWorkload(workload, "ko")}`,
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
      patchSession(session.id, (current) => ({
        ...current,
        cwd: arg,
        worktreeInfo: undefined,
        updatedAt: Date.now(),
      }));
      localAssistantMessage(session.id, rawText, `${copy.cwd}: ${arg}`);
      return true;
    }

    localAssistantMessage(session.id, rawText, copy.slashUnknown(commandToken));
    return true;
  };

  const runHermesProviderCommandFromPicker = async (hermesProvider: HermesInferenceProvider) => {
    if (!active || active.provider !== "hermes") return;
    if (activeHermesProvider === hermesProvider) return;
    if (hermesProvider === "anthropic") refreshClaudeRuntimeModels().catch(console.error);
    if (hermesProvider === "openrouter") refreshOpenRouterRuntimeModels().catch(console.error);
    const command = `/provider ${hermesProvider}`;
    setComposerInput(command);
    await handleSlashCommand(active, command);
    setComposerInput("");
  };

  const runHermesModelCommandFromPicker = async (model: string) => {
    if (!active || active.provider !== "hermes") return;
    if (activeModel === model) return;
    const command = `/model ${model}`;
    setComposerInput(command);
    await handleSlashCommand(active, command);
    setComposerInput("");
  };

  const runGajaeModelCommandFromPicker = async (model: string) => {
    if (!active || active.provider !== "gajecode") return;
    if (activeModel === model) return;
    const command = `/model ${model}`;
    setComposerInput(command);
    await handleSlashCommand(active, command);
    setComposerInput("");
  };

  const runGajaeProviderCommandFromPicker = async (provider: GajaeInferenceProvider) => {
    if (!active || active.provider !== "gajecode" || activeGajaeProvider === provider) return;
    const command = `/provider ${provider}`;
    setComposerInput(command);
    await handleSlashCommand(active, command);
    setComposerInput("");
  };

  const runAgentTurn = async (sessionId: string, payload: QueuedAgentTurn) => {
    if (busyTurnIdsRef.current[sessionId]) return;
    const session = sessionsRef.current.find((item) => item.id === sessionId);
    if (!session) return;
    const capability = runtimeCapabilities?.find((item) => item.id === session.provider);
    const permissionDisabledReason = managedAgentPermissionDisabledReason(
      session.provider,
      capability,
      tw.language,
      runtimeCapabilityError,
    );
    if (permissionDisabledReason) {
      const assistantId = nowId("assistant");
      patchSession(sessionId, (current) => ({
        ...current,
        messages: finalizeOrphanedStreamingMessages(current.messages)
          .map((message) =>
            message.id === payload.userMessageId ? { ...message, status: "done" as const } : message,
          )
          .concat({
            id: assistantId,
            role: "assistant",
            text: permissionDisabledReason,
            createdAt: Date.now(),
            status: "error",
          }),
        updatedAt: Date.now(),
      }));
      updateReviewWorkflowStatus(sessionId, payload.reviewRequest, "failed", {
        responseMessageId: assistantId,
        responseExcerpt: permissionDisabledReason,
        error: permissionDisabledReason,
      });
      throw new Error(permissionDisabledReason);
    }
    const meta = providerMeta(session.provider);
    const assistantId = nowId("assistant");
    const turnId = nowId("turn");
    const turnStartedAt = Date.now();
    // Stella Mode 단계 분할 실행: 이 턴이 특정 단계라면 (provider, model, effort)를
    // 정적 배정 계약으로 해석한다. stageRun 이 없으면 아래 전 구간은 기존 단일
    // 세션 실행 경로와 동일하게 동작한다 (runProvider === session.provider).
    const stageRun = payload.stageRun;
    const stageSessionDefaults = {
      provider: session.provider,
      model: session.model || meta.defaultModel,
      effort: normalizeWorkloadLevel(session.codexEffort) as string,
    };
    const stagePlan = stageRun
      ? resolveStageExecution(stageRun.stage, stageRun.assignments, stageSessionDefaults)
      : null;
    const runProvider: AgentProvider = stagePlan && isProvider(stagePlan.provider)
      ? stagePlan.provider
      : session.provider;
    const runMeta = runProvider === session.provider ? meta : providerMeta(runProvider);
    // 턴 시작 시점의 프리뷰 URL. 턴 도중 새로 잡히거나 바뀌면 그 자체가 "영향 있음"이다.
    const previewUrlAtTurnStart = cleanStoredPreviewUrl(
      (sessionId === activeIdRef.current ? previewUrlRef.current : session.previewUrl) || "",
    );
    startTurnPreviewImpact(assistantId, runProvider);
    let runCwd = payload.cwd || session.cwd || cwd;
    const fastPatchTask = isFastPatchTask(payload.text);
    const hermesProvider = runProvider === "hermes"
      ? normalizeHermesProvider(session.hermesProvider || inferHermesProviderFromModel(session.model))
      : null;
    let stageModelOverride = stagePlan?.modelOverridden ? stagePlan.model : null;
    let stageValidationPlan = stagePlan;
    if (stageRun && stagePlan) {
      // 실행 카탈로그 대조 (fail-closed): "현재 선택" 폴백 항목은 카탈로그가 아니다.
      // 카탈로그 = 런타임 모델 목록 ∪ 정적 정본 카탈로그 — 런타임 목록이 docs 유래
      // dated ID 만 담고 있어도 정본 short ID(claude-sonnet-4-6 등)는 유효하다.
      const stageCatalog = modelOptionsFor(
        runProvider,
        null,
        hermesProvider || DEFAULT_HERMES_PROVIDER,
        claudeRuntimeModels,
        codexRuntimeModels,
        openRouterRuntimeModels,
      )
        .concat(
          modelOptionsFor(
            runProvider,
            null,
            hermesProvider || DEFAULT_HERMES_PROVIDER,
            CLAUDE_MODELS,
            CODEX_MODELS,
            OPENROUTER_MODELS,
          ),
        )
        .concat(
          runProvider === "gajecode" && stagePlan.model
            ? modelOptionsFor(
                runProvider,
                stagePlan.model,
                hermesProvider || DEFAULT_HERMES_PROVIDER,
                claudeRuntimeModels,
                codexRuntimeModels,
                openRouterRuntimeModels,
              ).filter((option) => option.label !== `현재 선택: ${stagePlan.model}`)
            : [],
        )
        .filter((option) => !option.disabled)
        .map((option) => option.value);
      // 정본 별칭 해석: "sonnet 4.6" 같은 별칭이 정본 ID 로 정규화되어 카탈로그에
      // 있으면 그 정본 ID 로 실행한다. 정규화 결과도 카탈로그 밖이면 fail-closed.
      if (stageModelOverride && !stageCatalog.includes(stageModelOverride)) {
        const aliasResolved = runProvider === "hermes"
          ? normalizeHermesModel(hermesProvider || DEFAULT_HERMES_PROVIDER, stageModelOverride)
          : normalizeModel(runProvider, stageModelOverride);
        if (stageCatalog.includes(aliasResolved)) {
          stageModelOverride = aliasResolved;
          stageValidationPlan = { ...stagePlan, model: aliasResolved };
        }
      }
      const stageError = validateStageExecution(stageValidationPlan, stageSessionDefaults, stageCatalog, tw.language);
      if (stageError) {
        delete turnPreviewImpactRef.current[assistantId];
        const failedReceipt = buildStageReceipt({
          stage: stageRun.stage,
          provider: stagePlan.provider,
          model: stagePlan.model,
          effort: stagePlan.effort,
          status: "error",
          durationMs: 0,
          resultText: stageError,
        });
        const stageFailureText = tw.language === "en"
          ? `Stella staged run stopped at stage ${stageRun.stageIndex + 1}/${STELLA_STAGES.length} (${stageRun.stage}): ${stageError}`
          : `스텔라 단계 분할 실행이 ${stageRun.stageIndex + 1}/${STELLA_STAGES.length} 단계(${stageLabel(stageRun.stage, tw.language)})에서 중단됐습니다: ${stageError}`;
        const failAssistantId = nowId("assistant");
        patchSession(sessionId, (current) => ({
          ...current,
          messages: finalizeOrphanedStreamingMessages(current.messages)
            .map((message) =>
              message.id === payload.userMessageId ? { ...message, status: "done" as const } : message,
            )
            .concat({
              id: failAssistantId,
              role: "assistant",
              text: stageFailureText,
              createdAt: Date.now(),
              status: "error",
            }),
          updatedAt: Date.now(),
        }));
        setStageRunStatus(sessionId, null);
        updateReviewWorkflowStatus(sessionId, payload.reviewRequest, "failed", {
          responseMessageId: failAssistantId,
          responseExcerpt: stageFailureText,
          error: stageFailureText,
        });
        if (isTauri()) {
          stellaRecordEvidence({
            cwd: runCwd || null,
            title: `Stella stage ${stageRun.stageIndex + 1}/${STELLA_STAGES.length} ${stageRun.stage}: blocked`,
            body: [stageReceiptLine(failedReceipt, tw.language), "", stageError].join("\n"),
          }).catch(console.warn);
          if (payload.controlRequestId) {
            await controlRequestComplete(
              payload.controlRequestId,
              "failed",
              clipBlockText(stageFailureText, 1200),
              {
                sessionId,
                provider: session.provider,
                model: session.model,
                workspace: runCwd || null,
                stageReceipts: [...stageRun.receipts, failedReceipt],
              },
            ).catch((error) => console.warn("Atelier CLI stage receipt write failed", error));
          }
        }
        return;
      }
    }
    const normalizedRunModel = stageModelOverride
      ? stageModelOverride
      : runProvider === "hermes"
        ? normalizeHermesModel(hermesProvider || DEFAULT_HERMES_PROVIDER, session.model || runMeta.defaultModel)
        : normalizeModel(runProvider, session.model || runMeta.defaultModel);
    const runModelOptions = modelOptionsFor(
      runProvider,
      normalizedRunModel,
      hermesProvider || DEFAULT_HERMES_PROVIDER,
      claudeRuntimeModels,
      codexRuntimeModels,
      openRouterRuntimeModels,
    );
    // 단계 오버라이드 모델은 카탈로그 검증(위)을 통과한 값만 그대로 쓴다 —
    // coerce 경로의 조용한 대체(fallback)를 타지 않는다 (fail-closed).
    const runModel = stageModelOverride
      ? stageModelOverride
      : (runProvider === "claude" || runProvider === "codex" || runProvider === "gajecode" || runProvider === "grok" || (runProvider === "hermes" && isHermesProvider(hermesProvider)))
        ? coerceModelToOptions(normalizedRunModel, runModelOptions)
        : normalizedRunModel;
    if (stageRun && stagePlan) {
      setStageRunStatus(sessionId, {
        stage: stageRun.stage,
        stageIndex: stageRun.stageIndex,
        provider: runProvider,
        model: runModel,
      });
    }
    const useHermesCodexFastPath = runProvider === "hermes" && hermesProvider === "openai-codex";
    const hermesResumeMatches = runProvider === "hermes"
      && Boolean(session.providerSessionId)
      && session.providerSessionModel === runModel
      && session.providerSessionHermesProvider === hermesProvider;
    const modelChangedForRun = runModel !== session.model;
    // 단계 분할 실행은 provider 대화를 승계하지 않는다 — 컨텍스트는 stage handoff
    // 산출물로만 전달한다 (계약 원칙 4).
    const resumeSessionId = stageRun
      ? null
      : runProvider === "hermes"
        ? (useHermesCodexFastPath || !hermesResumeMatches ? null : session.providerSessionId || null)
        : (!modelChangedForRun && (!session.providerSessionModel || session.providerSessionModel === runModel)
            ? session.providerSessionId || null
            : null);
    const selectedElementContext = formatDevScreenElementSelectionPrompt(
      payload.elementSelection,
      tw.language,
    );
    // Do not let a quoted historical/DOM literal turn a safe current request
    // into a false block at the backend's full executable-prompt guard.
    const explicitlySelectedElementContext = selectedElementContext
      && !containsProtectedActionIntent(selectedElementContext)
      ? selectedElementContext
      : null;
    const compactContext = useHermesCodexFastPath
      ? formatCompactAgentContext(session.messages, tw.language, payload.userMessageId)
      : null;
    // Preview URL, health/body, service stdout, DOM snapshots, and browser
    // diagnostics are local-only UI state. Only a user's explicit element
    // selection may cross this boundary into a provider request.
    const visualContext = [explicitlySelectedElementContext, compactContext]
      .filter(Boolean)
      .join("\n\n") || null;

    backgroundedAssistantIdsRef.current.delete(assistantId);
    autoScrollRef.current = true;
    if (!beginRunForSession(sessionId, turnId)) return;
	  updateReviewWorkflowStatus(sessionId, payload.reviewRequest, "running", {
	    responseMessageId: assistantId,
	  });
	    patchSession(sessionId, (s) => ({
	      ...s,
	      cwd: runCwd,
	      // 단계 오버라이드 모델은 이 턴에만 적용된다 — 세션의 선택 모델을 덮어쓰지 않는다.
	      model: stageRun ? s.model : runModel,
	      providerSessionId: stageRun ? s.providerSessionId : modelChangedForRun ? undefined : s.providerSessionId,
	      providerSessionModel: stageRun ? s.providerSessionModel : modelChangedForRun ? undefined : s.providerSessionModel,
	      providerSessionHermesProvider: stageRun ? s.providerSessionHermesProvider : modelChangedForRun ? undefined : s.providerSessionHermesProvider,
	      tokenUsage: stageRun ? s.tokenUsage : modelChangedForRun ? undefined : s.tokenUsage,
	      subscriptionUsage: stageRun ? s.subscriptionUsage : modelChangedForRun ? undefined : s.subscriptionUsage,
	      messages: finalizeOrphanedStreamingMessages(s.messages)
	        .map((message) =>
	          message.id === payload.userMessageId ? { ...message, status: "done" as const } : message,
        )
        .concat({ id: assistantId, role: "assistant", text: "", createdAt: Date.now(), status: "streaming" }),
      updatedAt: Date.now(),
    }));

    let unlisten: (() => void) | undefined;
    let unlistenLifecycle: (() => void) | undefined;
    let unlistenSubscriptionUsage: (() => void) | undefined;
    let unlistenTokenUsage: (() => void) | undefined;
    // 단계 분할 실행에서 이번 턴이 다음 단계를 큐에 넣었는지 (finally 의 상태줄 정리에 사용).
    let stageContinues = false;
    try {
      if (isTauri()) {
        if (session.worktreeEnabled) {
          const worktree = await prepareWorktreeForSession(session, runCwd);
          runCwd = worktree.worktree_cwd;
          patchSession(sessionId, (current) => ({
            ...current,
            worktreeInfo: worktree,
            messages: current.messages.map((message) =>
              message.id === assistantId ? { ...message, worktree } : message,
            ),
            updatedAt: Date.now(),
          }));
        }
        const changeBaseline = fastPatchTask
          ? null
          : await captureChangeBaselineForTurn(runCwd || null, CHANGE_BASELINE_TIMEOUT_MS);
        // 가재코드·Hermes 는 스트림에 도구 이벤트가 구조적으로 없다(previewEvidence.ts 레인 감사).
        // 프리뷰 URL 이 잡힌 세션에서만 실측용 baseline 을 하나 더 잡아, 턴이 끝난 뒤
        // "이 턴에 파일이 바뀌었나"를 직접 재서 카드 노출을 판정한다. 위 changeBaseline 은
        // "변경 검토" 버튼 소유이므로 여기서 절대 재사용·소비하지 않는다.
        if (turnNeedsWorkspaceMutationProbe(runProvider, Boolean(previewUrlAtTurnStart))) {
          const probeBaseline = await captureChangeBaselineForTurn(
            runCwd || null,
            CHANGE_BASELINE_TIMEOUT_MS,
          );
          if (probeBaseline?.id) turnPreviewProbeBaselineRef.current[assistantId] = probeBaseline.id;
        }
        unlisten = await onAgentEvent(turnId, (event) => handleAgentEvent(sessionId, assistantId, event));
        unlistenTokenUsage = await onAgentTokenUsage(turnId, (event) =>
          handleAgentTokenUsage(sessionId, event),
        );
        unlistenSubscriptionUsage = await onAgentSubscriptionUsage(turnId, (event) =>
          handleAgentSubscriptionUsage(sessionId, event),
        );
        unlistenLifecycle = await onAgentLifecycle(turnId, (event) =>
          handleAgentLifecycle(sessionId, assistantId, event),
        );
        const requestedWorkload = stagePlan?.effortOverridden
          ? normalizeWorkloadLevel(stagePlan.effort)
          : fastPatchTask ? "low" : normalizeWorkloadLevel(session.codexEffort);
        const runOpenRouterEffort = runProvider === "hermes" && hermesProvider === "openrouter"
          ? coerceOpenRouterEffort(requestedWorkload, runModel, runModelOptions)
          : null;
        const runGajaeAlibabaEffort = runProvider === "gajecode" && inferGajaeProviderFromModel(runModel) === "alibaba"
          ? coerceGajaeAlibabaEffort(requestedWorkload, runModel)
          : null;
        const runGrokBackendEffort = (runProvider === "hermes" && hermesProvider === "grok")
          || (runProvider === "gajecode" && inferGajaeProviderFromModel(runModel) === "grok")
          ? coerceGrokApiEffort(requestedWorkload)
          : null;
        const codexStyleRun = runProvider === "codex"
          || (runProvider === "hermes" && hermesProvider === "openai-codex")
          || (runProvider === "gajecode" && inferGajaeProviderFromModel(runModel) === "codex");
        const grokStyleRun = runProvider === "grok";
        const runWorkload = runOpenRouterEffort
          || runGajaeAlibabaEffort
          || runGrokBackendEffort
          || (codexStyleRun ? normalizeCodexEffort(requestedWorkload) : requestedWorkload);
        const runHermesEffort = runProvider === "hermes" ? runWorkload : null;
        const basePrompt = formatOntologyAgentPrompt(
          payload.text,
          tw.language,
          visualContext,
          payload.attachments,
          normalizeStellaOntologyMode(session.stellaOntologyMode, runProvider),
          runProvider,
          Boolean(payload.factoryCommand),
          runCwd,
        );
        const result = await agentSend({
          provider: runProvider,
          turnId,
          prompt: formatWorkloadAgentPrompt(basePrompt, runWorkload, tw.language, runProvider),
          safetySubject: payload.displayText || null,
          resumeSessionId,
          cwd: runCwd || null,
          model: runModel,
          hermesProvider,
          effort: runProvider === "codex" || (runProvider === "gajecode" && inferGajaeProviderFromModel(runModel) === "codex")
            ? nativeCodexEffort(runWorkload, runModel, runModelOptions)
            : grokStyleRun
              ? runWorkload
              : runHermesEffort || runGajaeAlibabaEffort,
          speed: runProvider === "codex" || (runProvider === "gajecode" && inferGajaeProviderFromModel(runModel) === "codex")
            ? (fastPatchTask ? "fast" : normalizeCodexSpeed(session.codexSpeed))
            : null,
          permissionMode: normalizePermissionMode(session.permissionMode),
        });
	        flushAgentStream(assistantId);
	        delete pendingStreamRef.current[assistantId];
	        const terminationIntent = turnTerminationIntent(turnId);
	        const wasInterrupted = terminationIntent === "interrupted";
	        const wasStopped = terminationIntent === "stopped";
	        let finalTextForReveal = "";
	        const fallbackRawEvents = result.raw_events.slice(-MAX_RAW_EVENTS).map(clipRawEvent);
        const cooldownSeconds = result.is_error && !wasInterrupted && !wasStopped
          ? providerCooldownSecondsFromText([
              result.error || "",
              result.text || "",
              ...fallbackRawEvents,
            ].join("\n"))
          : null;
        const shouldScheduleCooldownRetry = cooldownSeconds !== null && (payload.autoRetryCount || 0) < 1;
        const retryPayload: QueuedAgentTurn | null = shouldScheduleCooldownRetry && cooldownSeconds !== null
          ? {
              ...payload,
              id: nowId("queued-turn"),
              autoRetryCount: (payload.autoRetryCount || 0) + 1,
              createdAt: Date.now(),
              notBefore: Date.now() + cooldownSeconds * 1000,
            }
          : null;
        patchSession(sessionId, (s) => ({
          ...s,
          // 단계 턴의 provider 세션은 승계 금지 대상이므로 세션 상태에 남기지 않는다.
          providerSessionId: stageRun
            ? s.providerSessionId
            : result.provider_session_id || (resumeSessionId ? s.providerSessionId : undefined),
          queuedTurns: retryPayload
            ? [retryPayload, ...(s.queuedTurns || [])]
            : s.queuedTurns,
          providerSessionModel: stageRun
            ? s.providerSessionModel
            : result.provider_session_id
              ? runModel
              : (resumeSessionId ? s.providerSessionModel : undefined),
          providerSessionHermesProvider: stageRun
            ? s.providerSessionHermesProvider
            : session.provider === "hermes"
              ? (result.provider_session_id
                  ? hermesProvider || undefined
                  : (resumeSessionId ? s.providerSessionHermesProvider : undefined))
              : s.providerSessionHermesProvider,
          messages: s.messages.map((m) =>
            {
              if (m.id !== assistantId) return m;
              const existingRawEvents = m.rawEvents || [];
              const messageRawEvents = existingRawEvents.length ? existingRawEvents : fallbackRawEvents;
              const actionableFailure = result.is_error
                ? actionableManagedAgentFailure(
                    session.provider,
                    result.error || result.text || "Agent error",
                    tw.language,
                  )
                : "";
              finalTextForReveal = cooldownSeconds !== null
                ? copy.providerCooldownRetry(meta.label, cooldownSeconds, shouldScheduleCooldownRetry)
                : selectTerminalAgentAnswer({
                    terminalResultPresent: true,
                    terminalText: actionableFailure
                      || cleanAgentText(result.text)
                      || (wasStopped
                        ? copy.stoppedResponse
                        : wasInterrupted
                          ? copy.interruptedResponse
                          : ""),
                    terminalErrorText: cleanAgentText(result.error),
                    streamedDraft: cleanAgentText(m.text),
                    fallbackText: result.is_error
                      ? `실행 실패: ${result.error || "Agent error"}`
                      : copy.noResponse,
                  });
              const messageWithRawEvents = {
                ...m,
                rawEvents: messageRawEvents.length
                  ? messageRawEvents.slice(-MAX_RAW_EVENTS)
                  : m.rawEvents,
              };
              return {
                  ...messageWithRawEvents,
                  text: finalTextForReveal,
                  status: wasStopped || wasInterrupted || shouldScheduleCooldownRetry ? "done" : result.is_error ? "error" : "done",
                  intermediateDraft: preserveIntermediateDraft(
                    messageWithRawEvents,
                    finalTextForReveal,
                  ),
                  unverifiedIntermediate: false,
                  changeBaselineId: !result.is_error && !wasInterrupted && !wasStopped ? changeBaseline?.id || null : null,
                  changeCwd: !result.is_error && !wasInterrupted && !wasStopped ? runCwd : m.changeCwd,
                  changes: !result.is_error && !wasInterrupted && !wasStopped ? null : m.changes,
                  changesLoading: false,
                  changesChecked: false,
                  changesError: null,
              };
            },
          ),
          updatedAt: Date.now(),
        }));
        updateReviewWorkflowStatus(
          sessionId,
          payload.reviewRequest,
          shouldScheduleCooldownRetry
            ? "queued"
            : wasStopped || wasInterrupted
              ? "cancelled"
              : result.is_error
                ? "failed"
                : "responded",
          {
            responseMessageId: assistantId,
            responseExcerpt: shouldScheduleCooldownRetry ? undefined : finalTextForReveal,
            error: result.is_error && !shouldScheduleCooldownRetry ? result.error || finalTextForReveal : undefined,
          },
        );
        // Stella Mode 단계 분할: 단계 receipt 기록 후, 성공이면 다음 단계 턴을
        // handoff 산출물과 함께 큐 맨 앞에 넣는다. 실패/중단은 fail-closed —
        // 남은 단계를 실행하지 않고 종료 사유를 남긴다.
        let stageReceiptsSoFar: StageReceipt[] | null = null;
        let stageTerminalControlStatus: "succeeded" | "failed" | "cancelled" | null = null;
        if (stageRun && !shouldScheduleCooldownRetry) {
          const stageStatus: StageReceipt["status"] = wasStopped
            ? "stopped"
            : wasInterrupted
              ? "interrupted"
              : result.is_error
                ? "error"
                : "done";
          const stageReceipt = buildStageReceipt({
            stage: stageRun.stage,
            provider: isProvider(runProvider) ? runProvider : session.provider,
            model: runModel,
            effort: String(runWorkload),
            status: stageStatus,
            durationMs: Date.now() - turnStartedAt,
            resultText: finalTextForReveal || result.error || "",
          });
          stageReceiptsSoFar = [...stageRun.receipts, stageReceipt];
          stellaRecordEvidence({
            cwd: runCwd || null,
            title: `Stella stage ${stageRun.stageIndex + 1}/${STELLA_STAGES.length} ${stageRun.stage}: ${payload.displayText || stageRun.baseText.slice(0, 80)}`,
            body: [
              stageReceiptLine(stageReceipt, tw.language),
              `Workspace: ${runCwd || "(not set)"}`,
              `\nResult:\n${clipBlockText(finalTextForReveal || result.error || copy.noResponse, 6000)}`,
            ].join("\n"),
          }).catch(console.warn);
          if (stageStatus === "done") {
            const nextStageState = advanceStageRunState(stageRun, {
              handoff: buildStageHandoff({
                stage: stageRun.stage,
                provider: stageReceipt.provider,
                model: runModel,
                resultText: finalTextForReveal,
              }),
              receipt: stageReceipt,
            });
            if (nextStageState) {
              const nextCreatedAt = Date.now();
              const nextStageLabelText = tw.language === "en"
                ? `[Stella stage ${nextStageState.stageIndex + 1}/${STELLA_STAGES.length} — ${nextStageState.stage}]`
                : `[스텔라 단계 ${nextStageState.stageIndex + 1}/${STELLA_STAGES.length} — ${stageLabel(nextStageState.stage, tw.language)}]`;
              // 인용 오탐 방지: handoff 는 이전 단계 산출물(데이터)이지 새 지시가
              // 아니다. 보안 검토 문구("자격증명 노출: 검출 안됨" 등)가 백엔드
              // 안전 게이트의 실행 전 프롬프트 스캔과 충돌하면 그 handoff 요약만
              // 생략하고 evidence-log 참조 안내로 대체한다 (element selection 의
              // quoted-literal 오탐 방지와 같은 원칙). 실측 사례: 4/5 security
              // handoff 가 5/5 audit 스폰을 credential-exposure 로 차단.
              const promptSafeHandoffs = nextStageState.handoffs.map((handoff) =>
                containsProtectedActionIntent(handoff.summary)
                  ? {
                      ...handoff,
                      summary: tw.language === "en"
                        ? `(stage completed with status "done"; its summary quotes safety-gate vocabulary and is omitted from this prompt. Read the full ${handoff.stage} record in SOT/evidence-log.md.)`
                        : `(이 단계는 status "done" 으로 완료됐지만, 요약이 안전 게이트 어휘를 인용하고 있어 프롬프트에서 생략했습니다. 전체 내용은 SOT/evidence-log.md 의 ${handoff.stage} 기록을 참조하세요.)`,
                    }
                  : handoff,
              );
              const nextPayload: QueuedAgentTurn = {
                id: nowId("queued-turn"),
                userMessageId: nowId("user"),
                text: buildStageTurnPrompt({
                  stage: nextStageState.stage,
                  stageIndex: nextStageState.stageIndex,
                  baseText: nextStageState.baseText,
                  handoffs: promptSafeHandoffs,
                  language: tw.language,
                }),
                displayText: nextStageLabelText,
                factoryCommand: payload.factoryCommand,
                factoryEvidence: payload.factoryEvidence,
                attachments: [],
                cwd: payload.cwd,
                createdAt: nextCreatedAt,
                controlRequestId: payload.controlRequestId,
                stageRun: nextStageState,
              };
              patchSession(sessionId, (s) => ({
                ...s,
                queuedTurns: [nextPayload, ...(s.queuedTurns || [])],
                messages: [
                  ...s.messages,
                  {
                    id: nextPayload.userMessageId,
                    role: "user",
                    text: nextStageLabelText,
                    createdAt: nextCreatedAt,
                    status: "queued",
                    attachments: [],
                  },
                ],
                updatedAt: nextCreatedAt,
              }));
              stageContinues = true;
            } else {
              stageTerminalControlStatus = "succeeded";
            }
          } else {
            stageTerminalControlStatus = wasStopped || wasInterrupted ? "cancelled" : "failed";
          }
        }
        if (
          payload.controlRequestId
          && !shouldScheduleCooldownRetry
          && (!stageRun || stageTerminalControlStatus)
        ) {
          const controlStatus = stageRun
            ? stageTerminalControlStatus!
            : wasStopped || wasInterrupted
              ? "cancelled"
              : result.is_error
                ? "failed"
                : "succeeded";
          await controlRequestComplete(
            payload.controlRequestId,
            controlStatus,
            clipBlockText(finalTextForReveal || result.error || copy.noResponse, 1200),
            {
              sessionId,
              provider: session.provider,
              model: runModel,
              workspace: runCwd || null,
              ...(stageReceiptsSoFar ? { stageReceipts: stageReceiptsSoFar } : {}),
            },
          ).catch((error) => console.warn("Atelier CLI receipt write failed", error));
        }
        if (finalTextForReveal && (!isWorkspaceForeground() || backgroundedAssistantIdsRef.current.has(assistantId))) {
          revealMessageImmediately(assistantId, finalTextForReveal);
        }
        backgroundedAssistantIdsRef.current.delete(assistantId);
        if (payload.factoryCommand && !stageRun) {
          stellaRecordEvidence({
            cwd: runCwd || null,
            title: `Stella Mode ${payload.factoryCommand}: ${payload.displayText || payload.text}`,
            body: [
              `Provider: ${session.provider}`,
              `Model: ${runModel}`,
              `Workspace: ${runCwd || "(not set)"}`,
              `Status: ${wasStopped ? "stopped" : wasInterrupted ? "interrupted" : result.is_error ? "error" : "done"}`,
              payload.factoryEvidence ? `\nPreflight:\n${clipBlockText(payload.factoryEvidence, 4000)}` : "",
              `\nResult:\n${clipBlockText(finalTextForReveal || result.error || copy.noResponse, 6000)}`,
            ].filter(Boolean).join("\n"),
          }).catch(console.warn);
        }
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const fallbackText = "Tauri 런타임에서 선택한 에이전트 adapter가 연결됩니다.";
        patchSession(sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? { ...m, text: fallbackText, status: "done" }
              : m,
          ),
        }));
        updateReviewWorkflowStatus(sessionId, payload.reviewRequest, "responded", {
          responseMessageId: assistantId,
          responseExcerpt: fallbackText,
        });
      }
    } catch (err) {
      flushAgentStream(assistantId);
      delete pendingStreamRef.current[assistantId];
      const terminationIntent = turnTerminationIntent(turnId);
      const wasInterrupted = terminationIntent === "interrupted";
      const wasStopped = terminationIntent === "stopped";
      let finalTextForReveal = "";
      patchSession(sessionId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: (() => {
                  const caughtFailure = wasStopped
                    ? copy.stoppedResponse
                    : wasInterrupted
                      ? copy.interruptedResponse
                      : session.provider === "hermes" || session.provider === "gajecode"
                        ? actionableManagedAgentFailure(session.provider, err, tw.language)
                        : `실행 실패: ${String(err)}`;
                  finalTextForReveal = selectTerminalAgentAnswer({
                    terminalResultPresent: true,
                    streamedDraft: cleanAgentText(m.text),
                    terminalErrorText: caughtFailure,
                    fallbackText: caughtFailure,
                  });
                  return finalTextForReveal;
                })(),
                status: wasStopped || wasInterrupted ? "done" : "error",
                intermediateDraft: preserveIntermediateDraft(m, finalTextForReveal),
                unverifiedIntermediate: false,
              }
            : m,
        ),
      }));
      updateReviewWorkflowStatus(
        sessionId,
        payload.reviewRequest,
        wasStopped || wasInterrupted ? "cancelled" : "failed",
        {
          responseMessageId: assistantId,
          responseExcerpt: finalTextForReveal,
          error: wasStopped || wasInterrupted ? undefined : finalTextForReveal || String(err),
        },
      );
      // 단계 분할 실행에서 스폰 자체가 실패해도 fail-closed: 실패한 단계·사유를
      // receipt 로 남기고 남은 단계는 실행하지 않는다.
      const caughtStageReceipts: StageReceipt[] | null = stageRun
        ? [
            ...stageRun.receipts,
            buildStageReceipt({
              stage: stageRun.stage,
              provider: isProvider(runProvider) ? runProvider : session.provider,
              model: runModel,
              effort: stagePlan?.effort || String(normalizeWorkloadLevel(session.codexEffort)),
              status: wasStopped ? "stopped" : wasInterrupted ? "interrupted" : "error",
              durationMs: Date.now() - turnStartedAt,
              resultText: finalTextForReveal || String(err),
            }),
          ]
        : null;
      if (payload.controlRequestId) {
        await controlRequestComplete(
          payload.controlRequestId,
          wasStopped || wasInterrupted ? "cancelled" : "failed",
          clipBlockText(finalTextForReveal || String(err), 1200),
          {
            sessionId,
            provider: session.provider,
            model: runModel,
            workspace: runCwd || null,
            ...(caughtStageReceipts ? { stageReceipts: caughtStageReceipts } : {}),
          },
        ).catch((error) => console.warn("Atelier CLI failure receipt write failed", error));
      }
      if (finalTextForReveal && (!isWorkspaceForeground() || backgroundedAssistantIdsRef.current.has(assistantId))) {
        revealMessageImmediately(assistantId, finalTextForReveal);
      }
      backgroundedAssistantIdsRef.current.delete(assistantId);
      if (stageRun && isTauri() && caughtStageReceipts) {
        stellaRecordEvidence({
          cwd: runCwd || null,
          title: `Stella stage ${stageRun.stageIndex + 1}/${STELLA_STAGES.length} ${stageRun.stage}: spawn failure`,
          body: [
            stageReceiptLine(caughtStageReceipts[caughtStageReceipts.length - 1], tw.language),
            `Workspace: ${runCwd || "(not set)"}`,
            `\nError:\n${clipBlockText(finalTextForReveal || String(err), 6000)}`,
          ].join("\n"),
        }).catch(console.warn);
      } else if (payload.factoryCommand && isTauri()) {
        stellaRecordEvidence({
          cwd: runCwd || null,
          title: `Stella Mode ${payload.factoryCommand}: ${payload.displayText || payload.text}`,
          body: [
            `Provider: ${session.provider}`,
            `Model: ${runModel}`,
            `Workspace: ${runCwd || "(not set)"}`,
            "Status: error",
            payload.factoryEvidence ? `\nPreflight:\n${clipBlockText(payload.factoryEvidence, 4000)}` : "",
            `\nError:\n${clipBlockText(finalTextForReveal, 6000)}`,
          ].filter(Boolean).join("\n"),
        }).catch(console.warn);
      }
    } finally {
      unlisten?.();
      unlistenLifecycle?.();
      unlistenSubscriptionUsage?.();
      unlistenTokenUsage?.();
      flushAgentStream(assistantId);
      delete pendingStreamRef.current[assistantId];
      const completionIntent = turnTerminationIntent(turnId);
      const completedSession = sessionsRef.current.find((item) => item.id === sessionId);
      const completedPreviewUrl = sessionId === activeIdRef.current
        ? previewUrlRef.current
        : completedSession?.previewUrl || "";
      // 프리뷰 검증 카드는 "세션에 URL이 있다"가 아니라 "이번 턴이 프리뷰에 영향을 줬다"일 때만 붙인다.
      const turnPreviewImpact = turnPreviewImpactRef.current[assistantId] || null;
      delete turnPreviewImpactRef.current[assistantId];
      const turnPreviewProbeBaselineId = turnPreviewProbeBaselineRef.current[assistantId] || "";
      delete turnPreviewProbeBaselineRef.current[assistantId];
      const previewUrlChangedThisTurn =
        cleanStoredPreviewUrl(completedPreviewUrl) !== previewUrlAtTurnStart;
      const allowPreviewCapture = completionIntent !== "interrupted"
        && completionIntent !== "stopped"
        && Boolean(completedPreviewUrl);
      if (allowPreviewCapture || turnPreviewProbeBaselineId) {
        void resolveTurnPreviewEvidence({
          sessionId,
          assistantId,
          previewUrl: completedPreviewUrl,
          cwd: runCwd || null,
          impact: turnPreviewImpact,
          previewUrlChanged: previewUrlChangedThisTurn,
          probeBaselineId: turnPreviewProbeBaselineId,
          allowCapture: allowPreviewCapture,
        }).catch((error) => console.warn("Local preview evidence capture failed", error));
      }
      // 단계가 이어지면 다음 턴이 상태줄을 갱신하고, 종료(성공/실패/중단)면 지운다.
      if (stageRun && !stageContinues) setStageRunStatus(sessionId, null);
      clearTurnIntent(turnId);
      finishRunForSession(sessionId, turnId);
      startNextQueuedTurn(sessionId);
    }
  };

  const send = async () => {
    const text = inputDraftRef.current.trim();
    const attachments = pendingAttachments;
    const userText = text || (attachments.length > 0 ? copy.imageOnlyPrompt : "");
    if ((!userText && attachments.length === 0) || isPastingImage) return;
    const quePrefixedText = attachments.length === 0 ? parseQuePrefixedMessage(userText) : null;
    const factoryRequest = attachments.length === 0
      ? parseStellaFactoryCommand(userText, tw.language)
      : null;
    const factorySafetyBlock = attachments.length === 0
      ? detectStellaFactorySafetyBlock(userText, tw.language)
      : null;
    const session = active || (() => {
      const initialTitle = factoryRequest?.title || quePrefixedText || userText;
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
    if (factorySafetyBlock) {
      localAssistantMessage(session.id, userText, factorySafetyBlock.message);
      setComposerInput("");
      setPendingAttachments([]);
      setPasteError(null);
      return;
    }
    const gajaePrefixedInput = session.provider === "gajecode" && attachments.length === 0
      ? classifyGajaePrefixedInput(userText)
      : { kind: "none" } as const;
    const gajaePromptText = gajaePrefixedInput.kind === "prompt"
      ? gajaePrefixedInput.prompt
      : null;
    const academicResearchRequest = !quePrefixedText && !factoryRequest && !gajaePromptText && attachments.length === 0
      ? parseAcademicResearchCommand(userText, tw.language, session.provider)
      : null;
    if (!quePrefixedText && !factoryRequest && !academicResearchRequest && gajaePrefixedInput.kind === "cli") {
      setComposerInput("");
      setPendingAttachments([]);
      setPasteError(null);
      await runProviderCliSlashCommand(session, userText, gajaePrefixedInput.args);
      return;
    }
    if (!quePrefixedText && !factoryRequest && !academicResearchRequest && !gajaePromptText && attachments.length === 0 && await handleSlashCommand(session, userText)) {
      setComposerInput("");
      setPendingAttachments([]);
      setPasteError(null);
      return;
    }
    const permissionDisabledReason = managedAgentPermissionDisabledReason(
      session.provider,
      runtimeCapabilities?.find((capability) => capability.id === session.provider),
      tw.language,
      runtimeCapabilityError,
    );
    if (permissionDisabledReason) {
      localAssistantMessage(session.id, userText, permissionDisabledReason);
      setComposerInput("");
      setPendingAttachments([]);
      setPasteError(null);
      return;
    }
    let turnText = quePrefixedText
      ? quePrefixedText
      : factoryRequest
        ? factoryRequest.prompt
        : academicResearchRequest
          ? academicResearchRequest.prompt
          : gajaePromptText || userText;
    let factoryEvidence: string | undefined;
    // 단계별 모델 오버라이드가 있으면 이번 스텔라 실행은 단계 분할 경로다.
    // 스냅샷을 여기서 고정해 실행 중 전역 변경이 진행 중 런에 영향 없게 한다.
    const stagedAssignmentsSnapshot = factoryRequest
      ? { ...stageModelAssignmentsRef.current }
      : null;
    const useStagedFactoryRun = Boolean(
      factoryRequest && stagedAssignmentsSnapshot && hasStageOverrides(stagedAssignmentsSnapshot),
    );
    if (factoryRequest && isTauri()) {
      try {
        const analysis = await stellaProjectAnalysis(cwd || null);
        const runManagedFactory = factoryRequest.command === "goal";
        const bootstrap = runManagedFactory
          ? await stellaFactoryBootstrap({
              cwd: cwd || null,
              goal: factoryRequest.body,
            })
          : null;
        // 단계 분할 런은 자체가 단계 오케스트레이션이므로 managed autopilot
        // 사전 사이클은 실행하지 않는다 (이중 오케스트레이션 방지).
        const autopilot = runManagedFactory && !useStagedFactoryRun
          ? await stellaFactoryAutopilot({
              cwd: cwd || null,
              goal: factoryRequest.body,
              maxCycles: 12,
            })
          : null;
        const probe = factoryRequest.command === "probe" || factoryRequest.command === "audit"
          ? await stellaWorkspaceProbe({
              cwd: cwd || null,
              profile: factoryRequest.command === "audit" ? "full" : "focused",
            })
          : null;
        factoryEvidence = formatStellaFactoryPreflightBlock({ analysis, bootstrap, autopilot, probe }, tw.language);
      } catch (err) {
        factoryEvidence = formatStellaFactoryPreflightBlock({ error: String(err) }, tw.language);
      }
      turnText = `${turnText}\n\n---\n${factoryEvidence}`;
    }
    const visibleUserText = userText;
    const elementSelection = devScreenSelectionAttached
      ? normalizeDevScreenElementSelection(devScreenElementSelection) || undefined
      : undefined;

    setComposerInput("");
    setPendingAttachments([]);
    setPasteError(null);

    const createdAt = Date.now();
    const initialStageRun = useStagedFactoryRun && stagedAssignmentsSnapshot
      ? createStageRunState({
          runId: nowId("stage-run"),
          assignments: stagedAssignmentsSnapshot,
          baseText: turnText,
        })
      : undefined;
    const payload: QueuedAgentTurn = {
      id: nowId("queued-turn"),
      userMessageId: nowId("user"),
      text: initialStageRun
        ? buildStageTurnPrompt({
            stage: initialStageRun.stage,
            stageIndex: initialStageRun.stageIndex,
            baseText: initialStageRun.baseText,
            handoffs: initialStageRun.handoffs,
            language: tw.language,
          })
        : turnText,
      displayText: visibleUserText,
      factoryCommand: factoryRequest?.command,
      factoryEvidence,
      elementSelection,
      attachments,
      cwd,
      createdAt,
      stageRun: initialStageRun,
    };
    const isBusy = Boolean(busyTurnIdsRef.current[session.id]);
    const queueMode = Boolean(session.queueMode);
    const shouldQueue = isBusy && (queueMode || Boolean(quePrefixedText));
    patchSession(session.id, (s) => ({
      ...s,
      title: s.messages.length === 0 && !s.titleEdited
        ? (academicResearchRequest?.title || factoryRequest?.title || turnText).slice(0, 48)
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
    if (elementSelection) setDevScreenSelectionAttached(false);

    if (isBusy) {
      if (!shouldQueue) {
        const activeTurnId = busyTurnIdsRef.current[session.id];
        if (activeTurnId && isTauri()) {
          markTurnInterrupted(activeTurnId);
          agentCancel(activeTurnId).catch(console.warn);
        }
      }
      return;
    }
    await runAgentTurn(session.id, payload);
  };

  const startSourceControlWorkItem = async (item: SourceControlWorkItem) => {
    const workspace = item.workspace.trim() || activeExecutionCwd.trim() || cwd.trim();
    if (!workspace) {
      throw new Error(
        tw.language === "en"
          ? "Choose a Git working folder before starting this work item."
          : "이 작업 항목을 시작하려면 먼저 Git 작업 폴더를 선택하세요.",
      );
    }

    const sourceSession = active;
    const provider = sourceSession?.provider || fallbackProvider;
    const profile = sourceSession
      ? agentProfiles.find(({ profile: candidate, provider: candidateProvider }) =>
          candidateProvider === provider && candidate.id === sourceSession.profileId,
        )?.profile
      : fallbackProfile;
    const title = `${item.externalId} ${item.title}`.slice(0, 48);
    const session = makeSession(profile, provider, title);
    if (sourceSession && sourceSession.provider === provider) {
      session.model = sourceSession.model;
      session.hermesProvider = sourceSession.hermesProvider;
      session.stellaOntologyMode = sourceSession.stellaOntologyMode;
      session.codexEffort = sourceSession.codexEffort;
      session.codexSpeed = sourceSession.codexSpeed;
      session.permissionMode = sourceSession.permissionMode;
    }
    session.cwd = workspace;
    session.worktreeEnabled = true;

    const createdAt = Date.now();
    const payload: QueuedAgentTurn = {
      id: nowId("queued-turn"),
      userMessageId: nowId("user"),
      text: item.prompt,
      displayText: item.prompt,
      attachments: [],
      cwd: workspace,
      createdAt,
    };
    session.messages = [{
      id: payload.userMessageId,
      role: "user",
      text: item.prompt,
      createdAt,
      status: "done",
      attachments: [],
    }];
    session.updatedAt = createdAt;

    const nextSessions = [session, ...sessionsRef.current];
    sessionsRef.current = nextSessions;
    persistSessionsNow(nextSessions);
    setSessions(nextSessions);
    activeIdRef.current = session.id;
    setActiveId(session.id);
    setCwd(workspace);
    setWorkspaceView("conversation");
    setShowProfilePicker(false);
    resetComposer();
    await runAgentTurn(session.id, payload);
  };

  controlRequestHandlerRef.current = async (pendingRequest) => {
    const request = await controlRequestClaim(pendingRequest.requestId);
    try {
      const isMobileContinuityRequest = request.action === "task.dispatch"
        && request.payload.mobileContinuity === true;
      if (isMobileContinuityRequest) {
        const continuation = parseMobileContinuityDispatchPayload(request.payload);
        if (!continuation) {
          throw new Error("The mobile continuation request is malformed.");
        }
        const session = sessionsRef.current.find((item) => item.id === continuation.targetSessionId);
        if (!session) {
          throw new Error("The mobile continuation target session no longer exists.");
        }
        const expectedPermissionMode = normalizePermissionMode(session.permissionMode);
        if (
          session.mobileTaskId !== continuation.mobileTaskId
          || session.cwd !== continuation.expectedWorkspace
          || session.provider !== continuation.expectedProvider
          || session.model !== continuation.expectedModel
          || expectedPermissionMode !== continuation.expectedPermissionMode
        ) {
          throw new Error("The mobile continuation no longer matches the selected desktop session.");
        }

        const createdAt = Date.now();
        const payload: QueuedAgentTurn = {
          id: nowId("queued-turn"),
          userMessageId: nowId("user"),
          text: continuation.prompt,
          displayText: continuation.prompt,
          attachments: [],
          cwd: session.cwd,
          createdAt,
          controlRequestId: request.requestId,
        };
        const wasBusy = Boolean(busyTurnIdsRef.current[session.id]);
        patchSession(session.id, (current) => ({
          ...current,
          queuedTurns: [...(current.queuedTurns || []), payload],
          messages: [
            ...current.messages,
            {
              id: payload.userMessageId,
              role: "user",
              text: continuation.prompt,
              createdAt,
              status: "queued",
              attachments: [],
            },
          ],
          updatedAt: createdAt,
        }));
        if (!wasBusy) {
          patchSession(session.id, (current) => ({
            ...current,
            queuedTurns: (current.queuedTurns || []).filter((turn) => turn.id !== payload.id),
            updatedAt: Date.now(),
          }));
          await runAgentTurn(session.id, payload);
        }
        return;
      }

      const featureResult = await handleFeatureControlRequest(request);
      if (featureResult) {
        await controlRequestComplete(
          request.requestId,
          "succeeded",
          featureResult.summary,
          featureResult.detail,
        );
        return;
      }

      if (request.action === "worktree.create") {
        const workspace = typeof request.workspace === "string" ? request.workspace : "";
        const taskId = typeof request.payload.taskId === "string" ? request.payload.taskId.trim() : "";
        if (!workspace || !taskId) throw new Error("The worktree request is missing workspace or taskId.");
        const worktree = await agentWorktreePrepare(workspace, taskId);
        await controlRequestComplete(
          request.requestId,
          "succeeded",
          `Prepared isolated worktree ${worktree.branch}`,
          worktree,
        );
        return;
      }

      if (request.action !== "task.dispatch") {
        throw new Error(`Unsupported Atelier control action: ${request.action}`);
      }
      const controlTask = normalizeFeatureControlTask(request, cwd);
      const {
        provider: providerValue,
        prompt,
        workspace,
      } = controlTask;
      const profile = agentProfiles.find((item) => item.provider === providerValue)?.profile;
      const session = makeSession(profile, providerValue, prompt.slice(0, 42));
      session.cwd = workspace;
      if (controlTask.model) {
        session.model = controlTask.model;
      }
      if (controlTask.effort) {
        session.codexEffort = normalizeCodexEffort(controlTask.effort);
      }
      if (controlTask.permissionMode) {
        session.permissionMode = normalizePermissionMode(controlTask.permissionMode);
      }

      let turnText = prompt;
      let factoryCommand: StellaFactoryCommand | undefined;
      let factoryEvidence: string | undefined;
      // CLI `--stage-models`: normalize 단계에서 이미 형식 검증(fail-closed)을 통과한
      // 배정만 도착한다. 오버라이드가 있으면 단계 분할 실행 경로로 진입한다.
      const controlStageAssignments = controlTask.stellaMode && controlTask.stageModels
        && hasStageOverrides(controlTask.stageModels)
        ? controlTask.stageModels
        : null;
      if (controlTask.stellaMode) {
        const factoryRequest = parseStellaFactoryCommand(`/goal ${prompt}`, tw.language);
        if (factoryRequest) {
          factoryCommand = factoryRequest.command;
          turnText = factoryRequest.prompt;
          try {
            const analysis = await stellaProjectAnalysis(workspace || null);
            const bootstrap = await stellaFactoryBootstrap({
              cwd: workspace || null,
              goal: factoryRequest.body,
            });
            // 단계 분할 런은 자체가 단계 오케스트레이션 — autopilot 사전 사이클 생략.
            const autopilot = controlStageAssignments
              ? null
              : await stellaFactoryAutopilot({
                  cwd: workspace || null,
                  goal: factoryRequest.body,
                  maxCycles: 12,
                });
            factoryEvidence = formatStellaFactoryPreflightBlock(
              { analysis, bootstrap, autopilot, probe: null },
              tw.language,
            );
            turnText = `${turnText}\n\n---\n${factoryEvidence}`;
          } catch (error) {
            factoryEvidence = formatStellaFactoryPreflightBlock({ error: String(error) }, tw.language);
            turnText = `${turnText}\n\n---\n${factoryEvidence}`;
          }
        }
      }

      const createdAt = Date.now();
      const controlStageRun = controlStageAssignments
        ? createStageRunState({
            runId: nowId("stage-run"),
            assignments: controlStageAssignments,
            baseText: turnText,
          })
        : undefined;
      const payload: QueuedAgentTurn = {
        id: nowId("queued-turn"),
        userMessageId: nowId("user"),
        text: controlStageRun
          ? buildStageTurnPrompt({
              stage: controlStageRun.stage,
              stageIndex: controlStageRun.stageIndex,
              baseText: controlStageRun.baseText,
              handoffs: controlStageRun.handoffs,
              language: tw.language,
            })
          : turnText,
        displayText: prompt,
        factoryCommand,
        factoryEvidence,
        attachments: [],
        cwd: workspace,
        createdAt,
        controlRequestId: request.requestId,
        stageRun: controlStageRun,
      };
      session.messages = [{
        id: payload.userMessageId,
        role: "user",
        text: prompt,
        createdAt,
        status: "done",
        attachments: [],
      }];
      const nextSessions = [session, ...sessionsRef.current];
      sessionsRef.current = nextSessions;
      persistSessions(nextSessions);
      setSessions(nextSessions);
      if (!activeIdRef.current) {
        activeIdRef.current = session.id;
        setActiveId(session.id);
      }
      await runAgentTurn(session.id, payload);
    } catch (error) {
      await controlRequestComplete(
        request.requestId,
        "failed",
        clipBlockText(String(error), 1200),
        { action: request.action },
      ).catch((receiptError) => console.warn("Atelier CLI rejection receipt failed", receiptError));
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let polling = false;
    const poll = async () => {
      if (disposed || polling) return;
      polling = true;
      try {
        const requests = await controlRequestsPending();
        for (const request of requests) {
          if (disposed || controlRequestProcessingRef.current.has(request.requestId)) continue;
          controlRequestProcessingRef.current.add(request.requestId);
          controlRequestHandlerRef.current(request)
            .catch((error) => console.warn("Atelier CLI request handling failed", error))
            .finally(() => controlRequestProcessingRef.current.delete(request.requestId));
        }
      } catch (error) {
        console.warn("Atelier CLI request polling failed", error);
      } finally {
        polling = false;
      }
    };
    poll().catch(console.warn);
    const timer = window.setInterval(() => poll().catch(console.warn), isActive ? 750 : 4000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [isActive]);

  const launchParallelRun = async () => {
    if (parallelLaunching || isPastingImage) return;
    const text = inputDraftRef.current.trim();
    const attachments = pendingAttachments;
    const userText = text || (attachments.length > 0 ? copy.imageOnlyPrompt : "");
    if (!userText) {
      setParallelError(copy.parallelPromptRequired);
      return;
    }
    const selectedProfiles = agentProfiles.filter(({ profile }) => parallelProfileIds.includes(profile.id));
    if (selectedProfiles.length < 2) {
      setParallelError(copy.parallelSelect);
      return;
    }
    if (!cwd.trim()) {
      setParallelError(copy.parallelGitRequired);
      return;
    }

    setParallelLaunching(true);
    setParallelError(null);
    try {
      if (isTauri()) {
        const sourceSummary = await agentChangeSummary(cwd, null);
        if (!sourceSummary.is_git) {
          setParallelError(copy.parallelGitRequired);
          return;
        }
      }

      const createdAt = Date.now();
      const elementSelection = devScreenSelectionAttached
        ? normalizeDevScreenElementSelection(devScreenElementSelection) || undefined
        : undefined;
      const batchId = nowId("parallel");
      const batchLabel = userText.replace(/\s+/g, " ").trim().slice(0, 48);
      const sourceSessionId = active?.id;
      const candidates = selectedProfiles.map(({ profile, provider }, index) => {
        const session = makeSession(profile, provider, `${batchLabel} · ${profile.name}`);
        const userMessageId = nowId("user");
        const payload: QueuedAgentTurn = {
          id: nowId("queued-turn"),
          userMessageId,
          text: userText,
          displayText: userText,
          elementSelection,
          attachments,
          cwd,
          createdAt,
        };
        session.cwd = cwd;
        session.worktreeEnabled = true;
        session.parallelBatchId = batchId;
        session.parallelBatchLabel = batchLabel;
        session.parallelSourceSessionId = sourceSessionId;
        session.parallelCandidateIndex = index + 1;
        session.parallelCandidateCount = selectedProfiles.length;
        session.messages = [{
          id: userMessageId,
          role: "user",
          text: userText,
          createdAt,
          status: "done",
          attachments,
        }];
        session.updatedAt = createdAt;
        return { session, payload };
      });

      const nextSessions = [...candidates.map(({ session }) => session), ...sessionsRef.current];
      sessionsRef.current = nextSessions;
      persistSessionsNow(nextSessions);
      setSessions(nextSessions);
      const firstSession = candidates[0].session;
      activeIdRef.current = firstSession.id;
      setActiveId(firstSession.id);
      setCwd(firstSession.cwd);
      setShowParallelLauncher(false);
      resetComposer();
      if (elementSelection) setDevScreenSelectionAttached(false);

      candidates.forEach(({ session, payload }) => {
        runAgentTurn(session.id, payload).catch((err) => console.error("parallel agent run failed", err));
      });
    } catch (err) {
      setParallelError(String(err instanceof Error ? err.message : err));
    } finally {
      setParallelLaunching(false);
    }
  };

  const stopParallelBatch = async () => {
    const batchId = active?.parallelBatchId;
    if (!batchId || stoppingParallelBatchId === batchId) return;
    const runningTurns = activeParallelSessions
      .map((session) => ({ sessionId: session.id, turnId: busyTurnIdsRef.current[session.id] }))
      .filter((item): item is { sessionId: string; turnId: string } => Boolean(item.turnId));
    if (runningTurns.length === 0) return;
    if (!isTauri()) {
      setPasteError(copy.stopFailed("Tauri runtime unavailable"));
      return;
    }

    setStoppingParallelBatchId(batchId);
    setPasteError(null);
    runningTurns.forEach(({ turnId }) => markTurnStopped(turnId));
    const results = await Promise.allSettled(
      runningTurns.map(({ turnId }) => agentCancel(turnId)),
    );
    let failed = 0;
    results.forEach((result, index) => {
      if (result.status === "rejected" || result.value === false) {
        failed += 1;
        clearTurnIntent(runningTurns[index].turnId);
      }
    });
    if (failed > 0) {
      setPasteError(copy.stopFailed(
        tw.language === "en"
          ? `${failed} parallel runs could not be stopped.`
          : `병렬 실행 ${failed}개를 중지하지 못했습니다.`,
      ));
    }
    setStoppingParallelBatchId(null);
  };

  const adoptionCandidate = adoptCandidateId
    ? sessions.find((session) => session.id === adoptCandidateId) || null
    : null;
  const adoptionChanges = adoptionCandidate ? parallelSessionChanges(adoptionCandidate) : null;

  const adoptParallelCandidate = async () => {
    const candidate = adoptionCandidate;
    if (!candidate?.worktreeInfo || !candidate.parallelBatchId || adoptingCandidateId) return;
    if (!isTauri()) {
      setAdoptError(copy.parallelAdoptFailed("Tauri runtime unavailable"));
      return;
    }
    const receiptId = nowId("fleet-adoption");
    const adoptionStartedAt = Date.now();
    patchSession(candidate.id, (session) => ({
      ...session,
      parallelAdoption: beginAgentFleetAdoption(session.parallelAdoption, {
        id: receiptId,
        batchId: candidate.parallelBatchId || "",
        candidateSessionId: candidate.id,
        sourceSessionId: candidate.parallelSourceSessionId,
        sourceCwd: candidate.worktreeInfo?.source_cwd,
        worktreeCwd: candidate.worktreeInfo?.worktree_cwd,
        branch: candidate.worktreeInfo?.branch,
        baseHead: candidate.worktreeInfo?.head,
        now: adoptionStartedAt,
      }),
      updatedAt: adoptionStartedAt,
    }));
    setAdoptingCandidateId(candidate.id);
    setAdoptError(null);
    try {
      const result = await agentWorktreeAdopt(candidate.worktreeInfo);
      const summary = `${result.file_count} files · +${result.additions} -${result.deletions}`;
      patchSession(candidate.id, (session) => ({
        ...session,
        parallelAdoption: completeAgentFleetAdoption(
          session.parallelAdoption,
          receiptId,
          result,
        ),
        parallelAdoptedAt: Date.now(),
        parallelAdoptionSummary: summary,
        updatedAt: Date.now(),
      }));
      setAdoptCandidateId(null);
      const sourceSessionId = candidate.parallelSourceSessionId;
      if (sourceSessionId && sessionsRef.current.some((session) => session.id === sourceSessionId)) {
        patchSession(sourceSessionId, (session) => ({ ...session, updatedAt: Date.now() }));
      }
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err);
      patchSession(candidate.id, (session) => ({
        ...session,
        parallelAdoption: failAgentFleetAdoption(session.parallelAdoption, receiptId, message),
        updatedAt: Date.now(),
      }));
      setAdoptError(copy.parallelAdoptFailed(message));
    } finally {
      setAdoptingCandidateId(null);
    }
  };

  async function stopActiveTurn() {
    if (!active || !busyTurnId || isStoppingActiveTurn) return;
    if (!isTauri()) {
      setPasteError(copy.stopFailed("Tauri runtime unavailable"));
      return;
    }
    const turnId = busyTurnId;
    markStoppingTurn(turnId);
    setPasteError(null);
    try {
      const stopped = await agentCancel(turnId);
      if (!stopped) {
        clearTurnIntent(turnId);
        clearStoppingTurn(turnId);
        setPasteError(copy.stopFailed(tw.language === "en" ? "No running process was found." : "실행 중인 프로세스를 찾지 못했습니다."));
      }
    } catch (err) {
      clearTurnIntent(turnId);
      clearStoppingTurn(turnId);
      setPasteError(copy.stopFailed(String(err)));
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send().catch(console.error);
  };

  const activeFactoryCommand = composerUi.factoryCommand;

  const createSessionFromRail = () => {
    if (agentProfiles.length === 1) {
      createSession(agentProfiles[0].profile, agentProfiles[0].provider);
      return;
    }
    setShowTaskList(true);
    setShowProfilePicker(true);
  };

  const renderTaskIconRail = (collapsed: boolean) => (
    <div className="atelier-task-icon-rail">
      <button
        type="button"
        onClick={() => setShowTaskList(collapsed)}
        className={cls(
          "atelier-task-icon-button",
          dark ? "text-dsub hover:bg-dmuted hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
        )}
        title={collapsed ? copy.showTaskList : copy.hideTaskList}
        aria-label={collapsed ? copy.showTaskList : copy.hideTaskList}
      >
        {collapsed ? "›" : "‹"}
      </button>
      <button
        type="button"
        onClick={openQuickOpen}
        className={cls(
          "atelier-task-icon-button",
          dark ? "text-dsub hover:bg-dmuted hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
        )}
        title={`${copy.quickOpen} · ⌘/Ctrl+P`}
        aria-label={copy.quickOpen}
      >
        {I.search}
      </button>
      <button
        type="button"
        onClick={createSessionFromRail}
        className={cls(
          "atelier-task-icon-button",
          dark ? "text-dsub hover:bg-dmuted hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
        )}
        title={copy.newSession}
        aria-label={copy.newSession}
      >
        {I.plus}
      </button>
      <div className="atelier-task-icon-list">
        {sessions.map((s) => {
          const color = normalizeAgentDotColor(s.profileDot || providerMeta(s.provider).dot);
          const selected = active?.id === s.id;
          const running = isSessionRunning(s);
          const attention = sessionInboxPhaseById.get(s.id) === "attention";
          const unread = sessionInboxUnreadIds.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSession(s.id)}
              className={cls(
                "atelier-task-session-icon",
                selected
                  ? dark ? "bg-dmuted" : "bg-surface shadow-[0_0_0_1px_#e5e3db]"
                  : dark ? "hover:bg-[#2a2a28]" : "hover:bg-muted",
              )}
              title={s.title || s.profileName || providerMeta(s.provider).label}
              aria-label={s.title || s.profileName || providerMeta(s.provider).label}
            >
              <span
                className={cls("atelier-task-session-badge", dark ? "text-dink" : "text-ink")}
                style={{
                  background: `${color}22`,
                  boxShadow: `inset 0 0 0 1px ${color}66`,
                }}
              >
                {providerMeta(s.provider).short}
              </span>
              {running && <span className="atelier-task-session-indicator atelier-agent-spinner" />}
              {!running && attention && <span className="atelier-task-session-indicator atelier-agent-attention-dot" />}
              {!running && !attention && unread && <span className="atelier-task-session-indicator atelier-agent-done-dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={cls("atelier-workspace-root h-full w-full flex min-w-0", dark ? "bg-dbg text-dink" : "bg-cream text-ink")}>
      {showQuickOpen && (
        <div
          className="fixed inset-0 z-[220] flex items-start justify-center bg-black/45 px-3 pt-[10vh]"
          onMouseDown={() => setShowQuickOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={copy.quickOpen}
            className={cls(
              "w-full max-w-[680px] overflow-hidden rounded-[8px] border shadow-2xl",
              dark ? "border-dline bg-dsurf" : "border-line bg-surface",
            )}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={cls("flex h-12 items-center gap-3 border-b px-4", dark ? "border-dline" : "border-line")}>
              <span className={dark ? "text-dsub" : "text-sub"}>{I.search}</span>
              <input
                ref={quickOpenInputRef}
                value={quickOpenQuery}
                onChange={(event) => {
                  setQuickOpenQuery(event.target.value);
                  setQuickOpenIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setQuickOpenIndex((index) => Math.min(index + 1, Math.max(0, quickOpenResults.length - 1)));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setQuickOpenIndex((index) => Math.max(0, index - 1));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    const selected = quickOpenResults[quickOpenIndex];
                    if (selected) chooseQuickOpenItem(selected);
                  }
                }}
                placeholder={copy.quickOpenPlaceholder}
                className={cls(
                  "min-w-0 flex-1 bg-transparent text-[14px] outline-none",
                  dark ? "text-dink placeholder:text-dsub" : "text-ink placeholder:text-sub",
                )}
              />
              <kbd className={cls("text-[10px] font-mono", dark ? "text-dsub" : "text-sub")}>ESC</kbd>
            </div>
            <div className="max-h-[min(60vh,520px)] overflow-y-auto p-2">
              <div className={cls("px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase", dark ? "text-dsub" : "text-sub")}>
                {copy.quickOpenRecent}
              </div>
              {quickOpenResults.length === 0 ? (
                <div className={cls("px-3 py-8 text-center text-[13px]", dark ? "text-dsub" : "text-sub")}>
                  {copy.quickOpenEmpty}
                </div>
              ) : quickOpenResults.map((item, index) => {
                const session = item.kind === "session" ? item.candidate.session : null;
                const sourceCwd = session ? session.worktreeInfo?.source_cwd || session.cwd : "";
                const meta = session ? providerMeta(session.provider) : null;
                const label = item.kind === "command"
                  ? item.label
                  : item.kind === "file"
                    ? item.file.name
                    : item.kind === "index"
                      ? item.entry.label
                      : item.candidate.label;
                const detail = item.kind === "command"
                  ? item.detail
                  : item.kind === "file"
                    ? relativeWorkspaceFilePath(activeExecutionCwd, item.file.path)
                    : item.kind === "index"
                      ? item.entry.detail
                      : item.candidate.detail || `${sourceCwd}${session?.worktreeInfo?.branch ? ` · ${session.worktreeInfo.branch}` : ""}`;
                const trailing = item.kind === "command"
                  ? (tw.language === "en" ? "Command" : "명령")
                  : item.kind === "file"
                    ? (tw.language === "en" ? "File" : "파일")
                    : item.kind === "index"
                      ? tw.language === "en"
                        ? item.entry.kind === "symbol" ? "Symbol" : item.entry.kind === "worktree" ? "Worktree" : "Branch"
                        : item.entry.kind === "symbol" ? "심볼" : item.entry.kind === "worktree" ? "워크트리" : "브랜치"
                      : item.candidate.trailing;
                const secondaryIcon = item.kind === "file"
                  ? I.split
                  : item.kind === "index"
                    ? item.entry.kind === "symbol"
                      ? I.code
                      : item.entry.kind === "worktree"
                        ? I.worktree
                        : I.changes
                  : item.kind === "command"
                    ? item.command === "terminal"
                      ? I.terminal
                      : item.command === "preview"
                        ? I.eye
                        : item.command === "new-task"
                          ? I.plus
                          : I.zap
                    : I.comment;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseEnter={() => setQuickOpenIndex(index)}
                    onClick={() => chooseQuickOpenItem(item)}
                    className={cls(
                      "flex w-full items-center gap-3 rounded-[6px] px-3 py-2 text-left",
                      index === quickOpenIndex
                        ? dark ? "bg-dmuted" : "bg-muted"
                        : dark ? "hover:bg-[#292927]" : "hover:bg-muted/70",
                    )}
                  >
                    {session && meta ? (
                      <span
                        className={cls("grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[9px] font-semibold", dark ? "text-dink" : "text-ink")}
                        style={{
                          background: `${normalizeAgentDotColor(session.profileDot || meta.dot)}22`,
                          boxShadow: `inset 0 0 0 1px ${normalizeAgentDotColor(session.profileDot || meta.dot)}66`,
                        }}
                      >
                        {meta.short}
                      </span>
                    ) : (
                      <span className={cls("grid h-7 w-7 shrink-0 place-items-center rounded-[6px]", dark ? "bg-[#2a2a28] text-dsub" : "bg-muted text-sub")}>
                        {secondaryIcon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{label}</span>
                      <span className={cls("mt-0.5 block truncate text-[10.5px] font-mono", dark ? "text-dsub" : "text-sub")}>
                        {detail}
                      </span>
                    </span>
                    <span className={cls("shrink-0 text-[10px]", dark ? "text-dsub" : "text-sub")}>
                      {item.kind === "index" && item.entry.current
                        ? `${trailing} · ${tw.language === "en" ? "Current" : "현재"}`
                        : trailing}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {adoptionCandidate?.worktreeInfo && adoptionChanges && (
        <div
          className="fixed inset-0 z-[230] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={() => adoptingCandidateId ? undefined : setAdoptCandidateId(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={copy.parallelAdoptTitle}
            className={cls(
              "w-full max-w-[620px] overflow-hidden rounded-[8px] border shadow-2xl",
              dark ? "border-dline bg-dsurf" : "border-line bg-surface",
            )}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={cls("border-b px-4 py-3", dark ? "border-dline" : "border-line")}>
              <div className="text-[15px] font-semibold">{copy.parallelAdoptTitle}</div>
              <div className={cls("mt-1 text-[11.5px] leading-[1.55]", dark ? "text-dsub" : "text-sub")}>
                {copy.parallelAdoptDescription}
              </div>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className={cls("rounded-[6px] border px-3 py-2", dark ? "border-dline bg-dmuted" : "border-line bg-muted/60")}>
                <div className="truncate text-[12px] font-medium">{adoptionCandidate.profileName || providerMeta(adoptionCandidate.provider).label}</div>
                <div className={cls("mt-1 truncate text-[10.5px] font-mono", dark ? "text-dsub" : "text-sub")}>
                  {adoptionCandidate.worktreeInfo.branch} · {adoptionChanges.files.length} files · +{adoptionChanges.additions} -{adoptionChanges.deletions}
                </div>
              </div>
              {adoptionCandidate.worktreeInfo.source_dirty && (
                <div className={cls("rounded-[6px] border px-3 py-2 text-[11px] leading-[1.5]", dark ? "border-[#72543c] bg-[#2a241e] text-[#e4b07c]" : "border-[#e2bd91] bg-[#fff8ec] text-[#8a5728]")}>
                  {copy.parallelAdoptDirty}
                </div>
              )}
              <div className={cls("max-h-[230px] overflow-y-auto rounded-[6px] border", dark ? "border-dline" : "border-line")}>
                {adoptionChanges.files.slice(0, 20).map((file) => (
                  <div key={file.path} className={cls("flex items-center gap-2 border-b px-3 py-2 text-[10.5px] last:border-b-0", dark ? "border-dline" : "border-line")}>
                    <span className={cls("w-[62px] shrink-0 uppercase", file.status === "deleted" ? "text-[#e06a5f]" : file.status === "added" ? "text-[#31b879]" : dark ? "text-dsub" : "text-sub")}>
                      {file.status}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>{file.path}</span>
                    <span className="shrink-0 font-mono"><span className="text-[#31b879]">+{file.additions}</span> <span className="text-[#e06a5f]">-{file.deletions}</span></span>
                  </div>
                ))}
                {adoptionChanges.files.length > 20 && (
                  <div className={cls("px-3 py-2 text-[10.5px]", dark ? "text-dsub" : "text-sub")}>
                    +{adoptionChanges.files.length - 20} more
                  </div>
                )}
              </div>
              {adoptError && (
                <div className="rounded-[6px] border border-[#8c3f38] bg-[#3a211f] px-3 py-2 text-[11px] leading-[1.5] text-[#ffaaa1]">
                  {adoptError}
                </div>
              )}
            </div>
            <div className={cls("flex justify-end gap-2 border-t px-4 py-3", dark ? "border-dline" : "border-line")}>
              <button
                type="button"
                disabled={Boolean(adoptingCandidateId)}
                onClick={() => setAdoptCandidateId(null)}
                className={cls("h-8 rounded-[6px] border px-3 text-[11.5px] disabled:opacity-50", dark ? "border-dline text-dsub hover:bg-dmuted" : "border-line text-sub hover:bg-muted")}
              >
                {copy.parallelAdoptCancel}
              </button>
              <button
                type="button"
                disabled={Boolean(adoptingCandidateId)}
                onClick={() => adoptParallelCandidate().catch(console.error)}
                className="h-8 rounded-[6px] border border-[#b65338] bg-[#9f4933] px-3 text-[11.5px] font-medium text-white hover:bg-[#b65338] disabled:opacity-50"
              >
                {adoptingCandidateId ? copy.parallelAdopting : copy.parallelAdopt}
              </button>
            </div>
          </section>
        </div>
      )}
      {showTaskList ? (
      <aside className={cls("atelier-task-sidebar border-r flex flex-col", dark ? "border-dline" : "border-line")}>
        <div className="atelier-task-sidebar-compact">{renderTaskIconRail(false)}</div>
        <div className="atelier-task-sidebar-content flex min-h-0 flex-1 flex-col">
        <div className={cls("h-12 px-3 flex items-center gap-2 border-b relative", dark ? "border-dline" : "border-line")}>
          <div className="font-display text-[18px] font-medium flex-1">{copy.title}</div>
          <button
            type="button"
            onClick={openQuickOpen}
            className={cls(
              "h-8 w-8 rounded-[7px] text-[14px] grid place-items-center",
              dark ? "text-dsub hover:bg-dmuted hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
            )}
            title={`${copy.quickOpen} · ⌘/Ctrl+P`}
            aria-label={copy.quickOpen}
          >
            {I.search}
          </button>
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
        <SessionInboxToolbar
          dark={dark}
          language={tw.language === "en" ? "en" : "ko"}
          filter={sessionInboxFilter}
          counts={sessionInboxCounts}
          onChange={setSessionInboxFilter}
          trailingControl={(
            <DesktopNotificationToggle
              dark={dark}
              language={tw.language === "en" ? "en" : "ko"}
              enabled={desktopNotifications.enabled}
              permission={desktopNotifications.permission}
              busy={desktopNotifications.busy}
              error={desktopNotifications.error}
              onToggle={() => desktopNotifications.toggle().catch(console.error)}
            />
          )}
        />
        <div className="flex-1 min-h-0 overflow-auto p-2">
          {sessions.length === 0 && (
            <div className={cls("p-3 text-[12px] leading-[1.55]", dark ? "text-dsub" : "text-sub")}>
              {copy.noMessages}
            </div>
          )}
          {sessions.length > 0 && filteredSessions.length === 0 && (
            <div className={cls("p-3 text-[12px] leading-[1.55]", dark ? "text-dsub" : "text-sub")}>
              {tw.language === "en" ? "No tasks match this filter." : "이 필터에 표시할 작업이 없습니다."}
            </div>
          )}
          {filteredSessions.map((s) => (
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
                    {s.profileName || providerMeta(s.provider).label}
                    {s.parallelBatchId ? ` · ${s.parallelCandidateIndex || 1}/${s.parallelCandidateCount || 1}` : ""}
                    {` · ${s.providerSessionId ? "resume" : "new"} · ${relTime(s.updatedAt)}`}
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
                {!isSessionRunning(s) && sessionInboxPhaseById.get(s.id) === "attention" && (
                  <span
                    className="mt-0.5 h-5 w-5 shrink-0 grid place-items-center"
                    aria-label={tw.language === "en" ? "Needs attention" : "확인 필요"}
                    title={tw.language === "en" ? "Needs attention" : "확인 필요"}
                  >
                    <span className="atelier-agent-attention-dot" />
                  </span>
                )}
                {!isSessionRunning(s)
                  && sessionInboxPhaseById.get(s.id) !== "attention"
                  && sessionInboxUnreadIds.has(s.id) && (
                  <span
                    className="mt-0.5 h-5 w-5 shrink-0 grid place-items-center"
                    aria-label={tw.language === "en" ? "Unread" : "읽지 않음"}
                    title={tw.language === "en" ? "Unread" : "읽지 않음"}
                  >
                    <span className="atelier-agent-done-dot" />
                  </span>
                )}
                {!isSessionRunning(s) && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSessionUnread(s.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSessionUnread(s.id);
                    }}
                    className={cls(
                      "opacity-0 group-hover:opacity-100 focus:opacity-100 h-5 w-5 grid place-items-center rounded-[4px]",
                      dark ? "text-dsub hover:text-dink hover:bg-[#3d3d3b]" : "text-sub hover:text-ink hover:bg-line",
                    )}
                    title={sessionInboxUnreadIds.has(s.id)
                      ? tw.language === "en" ? "Mark as read" : "읽음으로 표시"
                      : tw.language === "en" ? "Mark as unread" : "읽지 않음으로 표시"}
                    aria-label={sessionInboxUnreadIds.has(s.id)
                      ? tw.language === "en" ? "Mark as read" : "읽음으로 표시"
                      : tw.language === "en" ? "Mark as unread" : "읽지 않음으로 표시"}
                  >
                    {sessionInboxUnreadIds.has(s.id) ? I.eye : I.eyeOff}
                  </span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                  className={cls(
                    "opacity-0 group-hover:opacity-100 focus:opacity-100 h-5 w-5 grid place-items-center rounded-[4px]",
                    dark ? "text-dsub hover:text-dink hover:bg-[#3d3d3b]" : "text-sub hover:text-ink hover:bg-line",
                  )}
                  title={tw.language === "en" ? "Delete session" : "세션 삭제"}
                  aria-label={tw.language === "en" ? "Delete session" : "세션 삭제"}
                >
                  {I.x}
                </span>
              </div>
            </div>
          ))}
        </div>
        </div>
      </aside>
      ) : (
        <aside className={cls("atelier-task-rail border-r flex flex-col items-center py-2", dark ? "border-dline" : "border-line")}>
          {renderTaskIconRail(true)}
        </aside>
      )}

      <main className="atelier-workspace-main relative flex-1 min-w-0 flex flex-col">
        <div className={cls("atelier-workspace-header border-b flex items-center gap-3", dark ? "border-dline" : "border-line")}>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium truncate">{active?.title || active?.profileName || activeProviderMeta.label}</div>
            <div className={cls("text-[11.5px] font-mono truncate", dark ? "text-dsub" : "text-sub")}>
              {copy.subtitle}
            </div>
          </div>
        </div>

        <WorkspaceModeBar
          dark={dark}
          language={tw.language}
          view={workspaceView}
          previewActive={showPreview}
          changeCount={visibleWorkspaceChanges?.files.length || 0}
          modelLabel={activeModelLabel}
          tokenUsage={active?.tokenUsage}
          subscriptionUsage={activeSubscriptionUsage}
          running={Boolean(active && isSessionRunning(active))}
          onViewChange={setWorkspaceView}
          onTogglePreview={() => setShowPreview((visible) => !visible)}
        />

        <div className="relative flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 flex flex-col">
            <div
              ref={scrollRef}
              onScroll={handleTranscriptScroll}
              className={cls(
                "flex-1 min-h-0 overflow-auto px-5 py-4",
                workspaceView !== "conversation" && "hidden",
              )}
            >
              <AgentFleetPanel
                dark={dark}
                icon={I.parallel}
                batchLabel={active?.parallelBatchLabel}
                activeCandidateId={active?.id}
                candidates={activeFleetCandidates}
                stopping={stoppingParallelBatchId === active?.parallelBatchId}
                copy={{
                  compare: copy.parallelCompare,
                  progress: copy.parallelProgress,
                  running: copy.parallelRunning,
                  done: copy.parallelDone,
                  failed: copy.parallelFailed,
                  waiting: copy.parallelWaiting,
                  noChanges: copy.parallelNoChanges,
                  open: copy.parallelOpen,
                  adopt: copy.parallelAdopt,
                  adopted: copy.parallelAdopted,
                  adoptedFiles: (count) => tw.language === "en" ? `${count} files` : `${count}개 파일`,
                  adoptionVerifying: copy.parallelAdoptionVerifying,
                  adoptionFailed: copy.parallelAdoptionFailed,
                  adoptionCancelled: copy.parallelAdoptionCancelled,
                  adoptionEvidence: copy.parallelAdoptionEvidence,
                  patchReceipt: copy.parallelPatchReceipt,
                  stopAll: copy.parallelStopAll,
                  stoppingAll: copy.parallelStoppingAll,
                }}
                onOpenCandidate={selectSession}
                onAdoptCandidate={(candidateId) => {
                  setAdoptError(null);
                  setAdoptCandidateId(candidateId);
                }}
                onStopAll={() => stopParallelBatch().catch(console.error)}
              />
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
                <div className="w-full max-w-[920px] mx-auto space-y-5">
                  {renderedTranscriptMessages}
                </div>
              )}
            </div>

            <div className={cls("min-h-0 flex-1 flex-col", workspaceView === "code" ? "flex" : "hidden")}>
              <CodeWorkbench
                dark={dark}
                language={tw.language}
                isActive={isActive && workspaceView === "code"}
                rootPath={activeExecutionCwd}
                initialPath={workbenchFilePath}
                initialLine={workbenchInitialLine}
                onSaved={() => refreshWorkspaceChanges().catch(console.error)}
              />
            </div>

            <div className={cls("min-h-0 flex-1 flex-col", workspaceView === "changes" ? "flex" : "hidden")}>
              <ChangesWorkbench
                dark={dark}
                language={tw.language}
                rootPath={activeExecutionCwd}
                summary={visibleWorkspaceChanges}
                loading={workspaceChangesLoading}
                error={workspaceChangesError}
                onRefresh={refreshWorkspaceChanges}
                onStartWorkItem={startSourceControlWorkItem}
                onOpenFile={(path) => {
                  setWorkbenchFilePath(resolveWorkspaceFilePath(activeExecutionCwd, path));
                  setWorkspaceView("code");
                }}
              />
            </div>

            <form
              onSubmit={onSubmit}
              onPaste={handleAttachmentPaste}
              className={cls(
                "atelier-composer-shell border-t p-3",
                composerHeight <= 230 ? "atelier-composer-compact" : "",
                dark ? "border-dline" : "border-line",
              )}
              style={{ height: composerHeight }}
            >
              <div className={cls("atelier-composer-panel relative w-full max-w-[920px] mx-auto rounded-[9px] border p-2", dark ? "bg-dmuted border-dline" : "bg-surface border-line")}>
                <div
	                  role="separator"
	                  aria-orientation="horizontal"
	                  aria-label={tw.language === "en" ? "Resize chat input" : "채팅 입력창 크기 조절"}
	                  aria-valuemin={composerMinHeight()}
	                  aria-valuemax={composerMaxHeight()}
	                  aria-valuenow={Math.round(composerHeight)}
	                  tabIndex={0}
	                  title={tw.language === "en" ? "Drag to resize chat input" : "드래그해서 채팅 입력창 크기 조절"}
	                  onPointerDown={startComposerResize}
	                  onKeyDown={handleComposerResizeKeyDown}
                  className={cls("atelier-composer-resize-handle", resizingComposer ? "atelier-composer-resize-handle-active" : "")}
                />
                {(pendingAttachments.length > 0 || isPastingImage || pasteError || (devScreenSelectionAttached && devScreenElementSelection)) && (
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
                    {devScreenSelectionAttached && devScreenElementSelection && (
                      <div className="atelier-attachment-chip" title={devScreenElementSelection.selector}>
                        {I.search}
                        <span>{copy.devScreenSelectedElement}</span>
                        <span className="atelier-attachment-name">{devScreenElementSelection.selector}</span>
                        <button
                          type="button"
                          onClick={() => setDevScreenSelectionAttached(false)}
                          aria-label={copy.removeAttachment}
                          title={copy.removeAttachment}
                        >
                          {I.x}
                        </button>
                      </div>
                    )}
                    {isPastingImage && <div className="atelier-attachment-status">{copy.imagePasting}</div>}
                    {pasteError && <div className="atelier-attachment-error">{pasteError}</div>}
                  </div>
                )}
                {showParallelLauncher && (
                  <AgentFleetLauncher
                    dark={dark}
                    icon={I.parallel}
                    profiles={agentFleetProfiles}
                    selectedIds={parallelProfileIds}
                    launching={parallelLaunching}
                    error={parallelError}
                    copy={{
                      title: copy.parallelTitle,
                      description: copy.parallelDescription,
                      presetCore: copy.parallelPresetCore,
                      presetBalanced: copy.parallelPresetBalanced,
                      presetAll: copy.parallelPresetAll,
                      launch: copy.parallelLaunch,
                      launching: copy.parallelLaunching,
                    }}
                    onPreset={applyParallelPreset}
                    onToggle={toggleParallelProfile}
                    onLaunch={() => launchParallelRun().catch(console.error)}
                  />
                )}
                {activeProvider === "gajecode" && (
                  <div
                    className={cls(
                      "mb-2 flex items-center gap-1.5 border-b pb-2",
                      dark ? "border-dline" : "border-line",
                    )}
                    data-testid="gajae-primary-actions"
                  >
                    {GAJAE_PRIMARY_COMMANDS.map((command) => {
                      const label = tw.language === "en"
                        ? command.primaryLabelEn
                        : command.primaryLabelKo;
                      return (
                        <button
                          key={command.command}
                          type="button"
                          onClick={() => applySlashCommand(command)}
                          className={cls(
                            "h-7 rounded-[7px] border px-3 text-[11px] font-medium transition-colors",
                            dark
                              ? "border-[#4b4b48] bg-[#272725] text-dink hover:border-[#7d4b43] hover:bg-[#34302e]"
                              : "border-line bg-surface text-ink hover:border-[#d56f55] hover:bg-[#fff6f2]",
                          )}
                          title={tw.language === "en" ? command.detailEn : command.detailKo}
                          aria-label={tw.language === "en" ? command.detailEn : command.detailKo}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {activeProvider !== "gajecode" && (
                  <>
                    <div className={cls("atelier-factory-launcher mb-2 flex items-center gap-2 border-b pb-2", dark ? "border-dline" : "border-line")}>
                      <button
                        type="button"
                        onClick={applyFactoryLauncher}
                        className={cls(
                          "h-7 shrink-0 rounded-[7px] px-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium border transition-colors",
                          activeFactoryCommand
                            ? dark
                              ? "bg-[#3a2a23] border-[#e26f4f] text-dink"
                              : "bg-[#fff1eb] border-[#e26f4f] text-ink"
                            : dark
                              ? "border-[#6f4a3f] bg-[#302925] text-dink hover:bg-[#3a2f2a]"
                              : "border-[#e26f4f] bg-surface text-ink hover:bg-[#fff6f2]",
                        )}
                        title={copy.factoryLauncherTitle}
                        aria-label={copy.factoryLauncherTitle}
                        aria-pressed={activeFactoryCommand === "goal"}
                      >
                        <span className="text-[#e26f4f]">{I.zap}</span>
                        <span>{copy.factoryLabel}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowStageModelPanel((value) => !value)}
                        aria-pressed={showStageModelPanel}
                        aria-label={tw.language === "en" ? "Stage model assignment" : "단계별 모델 배정"}
                        title={tw.language === "en"
                          ? "Assign a model per Stella Mode stage (planning/execution/verification/security/audit). Unassigned stages inherit the session model."
                          : "스텔라 모드 단계(계획/구현/검증/보안/감사)별 모델을 배정합니다. 미지정 단계는 세션 모델을 상속합니다."}
                        data-testid="stage-model-toggle"
                        className={cls(
                          "h-7 shrink-0 rounded-[7px] px-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium border transition-colors",
                          hasStageOverrides(stageModelAssignments) || showStageModelPanel
                            ? dark
                              ? "bg-[#3a2a23] border-[#e26f4f] text-dink"
                              : "bg-[#fff1eb] border-[#e26f4f] text-ink"
                            : dark
                              ? "border-dline bg-dsurf text-dsub hover:text-dink"
                              : "border-line bg-surface text-sub hover:text-ink",
                        )}
                      >
                        <span>
                          {tw.language === "en" ? "Stage models" : "단계 모델"}
                          {hasStageOverrides(stageModelAssignments)
                            ? ` · ${STELLA_STAGES.filter((stage) => stageModelAssignments[stage]?.model).length}`
                            : ""}
                        </span>
                      </button>
                      {(() => {
                        const stageStatus = active ? stageRunStatusBySession[active.id] : null;
                        if (!stageStatus) return null;
                        return (
                          <span
                            data-testid="stage-model-status"
                            className={cls(
                              "min-w-0 truncate text-[11px] font-mono",
                              dark ? "text-dsub" : "text-sub",
                            )}
                            title={`${stageStatus.provider}:${stageStatus.model}`}
                          >
                            {tw.language === "en"
                              ? `Stage ${stageStatus.stageIndex + 1}/${STELLA_STAGES.length} · ${stageStatus.stage} · ${stageStatus.model}`
                              : `단계 ${stageStatus.stageIndex + 1}/${STELLA_STAGES.length} · ${stageLabel(stageStatus.stage, tw.language)} · ${stageStatus.model}`}
                          </span>
                        );
                      })()}
                    </div>
                    {showStageModelPanel && (
                      <div
                        data-testid="stage-model-panel"
                        className={cls(
                          "mb-2 rounded-[9px] border p-2 flex flex-col gap-1.5",
                          dark ? "border-dline bg-dsurf" : "border-line bg-surface",
                        )}
                      >
                        <div className={cls("text-[11px] leading-[1.45]", dark ? "text-dsub" : "text-sub")}>
                          {tw.language === "en"
                            ? "Per-stage model for Stella Mode runs. Default inherits the session model; overrides split the run into sequential stages with explicit handoffs."
                            : "스텔라 모드 실행의 단계별 모델입니다. 기본값은 세션 모델 상속이며, 오버라이드가 있으면 실행이 단계별로 분할되고 handoff 산출물로 컨텍스트가 전달됩니다."}
                        </div>
                        {STELLA_STAGES.map((stage) => {
                          const assignedModel = stageModelAssignments[stage]?.model || "";
                          const inheritLabel = tw.language === "en" ? "Inherit session model" : "세션 모델 상속";
                          return (
                            <div
                              key={stage}
                              data-testid={`stage-model-row-${stage}`}
                              className="flex items-center gap-2"
                            >
                              <span className={cls("w-[104px] shrink-0 text-[11px] font-mono", dark ? "text-dink" : "text-ink")}>
                                {`${stage === "planning" ? 1 : stage === "execution" ? 2 : stage === "verification" ? 3 : stage === "security" ? 4 : 5}. ${stageLabel(stage, tw.language)}`}
                              </span>
                              <ComposerSelectMenu
                                dark={dark}
                                value={assignedModel}
                                options={[
                                  { value: "", label: inheritLabel },
                                  ...activeModelOptions,
                                ]}
                                onChange={(value) => updateStageModelAssignment(stage, value)}
                                disabled={!active || !!busyTurnId}
                                ariaLabel={tw.language === "en" ? `${stage} stage model` : `${stageLabel(stage, tw.language)} 단계 모델`}
                                title={tw.language === "en" ? `${stage} stage model` : `${stageLabel(stage, tw.language)} 단계 모델`}
                                triggerClassName="atelier-model-trigger h-7 min-w-[168px] max-w-[228px] rounded-[7px] border px-2.5 text-[11px] font-mono outline-none flex items-center justify-between gap-2"
                                menuWidth={292}
                                testId={`stage-model-menu-${stage}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
	                {showSlashMenu && slashMenuPosition && createPortal(
	                  <div
	                    ref={slashMenuPopoverRef}
	                    style={slashMenuPosition}
	                    className={cls(
	                      "atelier-slash-menu fixed z-[210] overflow-y-auto overscroll-contain rounded-[10px] border p-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.34)]",
	                      dark ? "atelier-slash-menu-dark text-dink" : "atelier-slash-menu-light text-ink",
	                    )}
	                    role="listbox"
	                    aria-label="Slash commands"
                      data-testid="slash-command-menu"
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
                  </div>,
                  document.body,
                )}
                {activeRuntimeProgressFailure && !activeManagedAgentDisabledReason && (
                  <div
                    role="status"
                    data-testid="managed-agent-runtime-bootstrap-failed"
                    className={cls(
                      "atelier-factory-launcher-copy mb-2 rounded-[7px] border px-2.5 py-2 text-[11px] leading-[1.45]",
                      dark
                        ? "border-[#7a4638] bg-[#2a211e] text-[#f0a38a]"
                        : "border-[#d7a08a] bg-[#fff4ef] text-[#9a472f]",
                    )}
                  >
                    {activeRuntimeProgressFailure}
                  </div>
                )}
                {activeRuntimeObservationNotice && !activeManagedAgentDisabledReason && !activeRuntimeProgressFailure && (
                  <div
                    role="status"
                    data-testid="managed-agent-runtime-observation"
                    className={cls(
                      "atelier-factory-launcher-copy mb-2 rounded-[7px] border px-2.5 py-2 text-[11px] leading-[1.45]",
                      dark
                        ? "border-[#4b5f70] bg-[#202a33] text-[#b7cde0]"
                        : "border-[#9eb9cf] bg-[#f2f8fc] text-[#365e7a]",
                    )}
                  >
                    {activeRuntimeObservationNotice}
                  </div>
                )}
                {activeManagedAgentDisabledReason && (
                  <div
                    role="status"
                    data-testid="managed-agent-runtime-unavailable"
                    className={cls(
                      "atelier-factory-launcher-copy mb-2 rounded-[7px] border px-2.5 py-2 text-[11px] leading-[1.45]",
                      dark
                        ? "border-[#7a4638] bg-[#2a211e] text-[#f0a38a]"
                        : "border-[#d7a08a] bg-[#fff4ef] text-[#9a472f]",
                    )}
                  >
                    {activeManagedAgentDisabledReason}
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  defaultValue={inputDraftRef.current}
                  onChange={(e) => {
                    inputRevealPauseUntilRef.current = performance.now() + INPUT_REVEAL_PAUSE_MS;
                    inputDraftRef.current = e.target.value;
                    syncComposerUi(e.target.value);
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
	                  aria-label={copy.placeholder}
                  className={cls(
                    "atelier-composer-textarea w-full min-h-[44px] resize-none bg-transparent outline-none text-[13px] leading-[1.6] px-1",
                    dark ? "text-dink placeholder:text-dsub" : "text-ink placeholder:text-sub",
                  )}
                />
                <div className="atelier-composer-controls mt-2 flex items-center gap-2">
                  <div className={cls("atelier-composer-hint flex-1 text-[12px] leading-[1.45]", dark ? "text-dsub" : "text-sub")}>
                    {"⌘/Ctrl + Enter"}
                  </div>
                  <div className="atelier-composer-actions shrink-0 flex items-center gap-1.5">
                    {(activeProvider === "hermes" || activeProvider === "gajecode") && (
                      <>
                        <span className={cls("atelier-composer-control-label text-[11px] font-mono uppercase tracking-wider", dark ? "text-dsub" : "text-sub")}>
                          {copy.providerLabel}
                        </span>
                        <ComposerSelectMenu
                          dark={dark}
                          value={activeProvider === "hermes" ? activeHermesProvider : activeGajaeProvider}
                          options={activeProvider === "hermes" ? HERMES_PROVIDERS : GAJECODE_PROVIDERS}
                          onChange={(value) => {
                            if (activeProvider === "hermes") {
                              runHermesProviderCommandFromPicker(value as HermesInferenceProvider).catch(console.error);
                            } else {
                              runGajaeProviderCommandFromPicker(value as GajaeInferenceProvider).catch(console.error);
                            }
                          }}
                          disabled={!active || !!busyTurnId}
                          ariaLabel={copy.providerLabel}
                          title={activeModelSurfaceTitle}
                          triggerClassName="atelier-provider-trigger h-8 min-w-[116px] max-w-[142px] rounded-[7px] border px-2.5 text-[11px] font-mono outline-none flex items-center justify-between gap-2"
                          menuWidth={180}
                          testId={activeProvider === "hermes" ? "hermes-provider-menu" : "gajecode-provider-menu"}
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={toggleActiveWorktree}
                      disabled={!active || !!busyTurnId}
                      aria-pressed={Boolean(active?.worktreeEnabled)}
                      aria-label={tw.language === "en" ? "Toggle isolated worktree" : "격리 worktree 전환"}
                      title={active?.worktreeEnabled
                        ? (tw.language === "en"
                            ? `Isolated worktree on${active.worktreeInfo?.branch ? ` · ${active.worktreeInfo.branch}` : ""}`
                            : `격리 worktree 켜짐${active.worktreeInfo?.branch ? ` · ${active.worktreeInfo.branch}` : ""}`)
                        : (tw.language === "en" ? "Run in an isolated Git worktree" : "격리 Git worktree에서 실행")}
                      className={cls(
                        "atelier-composer-secondary-action atelier-icon-tooltip relative",
                        "h-8 w-8 shrink-0 rounded-[7px] border grid place-items-center transition-colors disabled:opacity-45",
                        active?.worktreeEnabled
                          ? dark
                            ? "border-[#e26f4f] bg-[#3a2a23] text-[#f08a6d]"
                            : "border-[#e26f4f] bg-[#fff1eb] text-[#c95f42]"
                          : dark
                            ? "border-dline bg-dsurf text-dsub hover:text-dink"
                            : "border-line bg-surface text-sub hover:text-ink",
                      )}
                      data-tooltip={tw.language === "en" ? "Isolated worktree" : "격리 워크트리"}
                      data-testid="worktree-toggle"
                    >
                      {I.worktree}
                    </button>
                    <button
                      type="button"
                      onClick={openParallelLauncher}
                      disabled={agentProfiles.length < 2 || parallelLaunching}
                      aria-pressed={showParallelLauncher}
                      aria-label={copy.parallelTitle}
                      title={copy.parallelDescription}
                      className={cls(
                        "atelier-composer-secondary-action atelier-icon-tooltip relative",
                        "h-8 w-8 shrink-0 rounded-[7px] border grid place-items-center transition-colors disabled:opacity-45",
                        showParallelLauncher
                          ? dark
                            ? "border-[#e26f4f] bg-[#3a2a23] text-[#f08a6d]"
                            : "border-[#e26f4f] bg-[#fff1eb] text-[#c95f42]"
                          : dark
                            ? "border-dline bg-dsurf text-dsub hover:text-dink"
                            : "border-line bg-surface text-sub hover:text-ink",
                      )}
                      data-tooltip={copy.parallel}
                      data-testid="parallel-launcher-toggle"
                    >
                      {I.parallel}
                    </button>
                    <ComposerSelectMenu
                      dark={dark}
                      value={activePermissionMode}
                      options={PERMISSION_MODES.map((option) => ({
                        value: option.value,
                        label: tw.language === "en" ? option.en : option.ko,
                        icon: option.icon,
                        title: tw.language === "en" ? option.detailEn : option.detailKo,
                      }))}
                      onChange={(value) => updateActivePermissionMode(value as VisiblePermissionMode)}
                      disabled={!active || !!busyTurnId || Boolean(activeManagedAgentDisabledReason || activePermissionControlDisabledReason)}
                      ariaLabel={copy.permissionLabel}
                      title={activeManagedAgentDisabledReason || activePermissionControlDisabledReason || copy.permissionLabel}
                      triggerClassName="atelier-permission-trigger h-8 min-w-[112px] max-w-[148px] rounded-[7px] border px-2.5 text-[11px] font-mono outline-none flex items-center justify-between gap-2"
                      menuWidth={218}
                      testId="permission-menu"
                    />
                    <span className={cls("atelier-composer-control-label text-[11px] font-mono uppercase tracking-wider", dark ? "text-dsub" : "text-sub")}>
                      {copy.modelLabel}
                    </span>
                    {activeCodexModelSurface ? (
                      <CodexModelMenu
                        dark={dark}
                        language={tw.language}
                        disabled={!active || !!busyTurnId}
                        contextKey={`${active?.id || "none"}:${activeProvider}:${activeHermesProvider}`}
                        title={activeModelSurfaceTitle}
                        modelLabel={copy.modelLabel}
                        reasoningLabel={copy.reasoning}
                        speedLabel={copy.speed}
                        toolbarLabel={activeCodexToolbarLabel}
                        modelValue={activeModel}
                        modelOptions={activeModelOptions}
                        effortValue={activeCodexEffort}
                        effortOptions={CODEX_EFFORTS}
                        speedValue={activeCodexSpeed}
                        speedOptions={CODEX_SPEEDS}
                        onOpen={() => refreshCodexRuntimeModels().catch(console.error)}
                        onEffortChange={(value) => updateActiveCodexEffort(value as CodexEffort)}
                        onModelChange={(value) => {
                          if (activeProvider === "hermes") {
                            runHermesModelCommandFromPicker(value).catch(console.error);
                          } else {
                            updateActiveModel(value);
                          }
                        }}
                        onSpeedChange={(value) => updateActiveCodexSpeed(value as CodexSpeed)}
                      />
                    ) : (
                      <ComposerSelectMenu
                        dark={dark}
                        value={activeModel}
                        options={activeModelOptions}
                        onChange={(value) => {
                          if (activeProvider === "hermes") {
                            runHermesModelCommandFromPicker(value).catch(console.error);
                          } else if (activeProvider === "gajecode") {
                            runGajaeModelCommandFromPicker(value).catch(console.error);
                          } else {
                            updateActiveModel(value);
                          }
                        }}
                        onOpen={() => {
                          if (activeProvider === "claude") {
                            refreshClaudeRuntimeModels().catch(console.error);
                          } else if (activeProvider === "gajecode") {
                            if (activeGajaeProvider === "claude") refreshClaudeRuntimeModels().catch(console.error);
                            if (activeGajaeProvider === "codex") refreshCodexRuntimeModels().catch(console.error);
                          } else if (activeProvider === "hermes" && activeHermesProvider === "anthropic") {
                            refreshClaudeRuntimeModels().catch(console.error);
                          } else if (activeProvider === "hermes" && activeHermesProvider === "openrouter") {
                            refreshOpenRouterRuntimeModels().catch(console.error);
                          }
                        }}
                        disabled={!active || !!busyTurnId}
                        ariaLabel={copy.modelLabel}
                        title={activeModelSurfaceTitle}
                        triggerClassName="atelier-model-trigger h-8 min-w-[134px] max-w-[190px] rounded-[7px] border px-2.5 text-[11px] font-mono outline-none flex items-center justify-between gap-2"
                        menuWidth={292}
                        testId="agent-model-menu"
                      />
                    )}
                    {showActiveWorkload && (
                      <>
                        <span className={cls("atelier-composer-control-label text-[11px] font-mono uppercase tracking-wider", dark ? "text-dsub" : "text-sub")}>
                          {activeOpenRouterModel
                            ? (tw.language === "en" ? "Reasoning" : "추론")
                            : copy.workloadLabel}
                        </span>
                        <ComposerSelectMenu
                          dark={dark}
                          value={activeWorkloadValue}
                          options={activeWorkloadOptions.map((option) => ({
                            value: option.value,
                            label: tw.language === "en" ? option.en : option.ko,
                          }))}
                          onChange={(value) => updateActiveWorkload(value as WorkloadLevel)}
                          disabled={!active || !!busyTurnId}
                          ariaLabel={activeOpenRouterModel
                            ? (tw.language === "en" ? "Reasoning" : "추론")
                            : copy.workloadLabel}
                          triggerClassName="atelier-workload-trigger h-8 min-w-[94px] max-w-[132px] rounded-[7px] border px-2.5 text-[11px] font-mono outline-none flex items-center justify-between gap-2"
                          menuWidth={164}
                          testId="workload-menu"
                        />
                      </>
                    )}
                  </div>
                  {busyTurnId && (
                    <button
                      type="button"
                      onClick={stopActiveTurn}
                      disabled={isStoppingActiveTurn}
                      className={cls(
                        "shrink-0 h-8 px-3 rounded-[7px] border inline-flex items-center gap-2 text-[12px] font-medium whitespace-nowrap disabled:opacity-50",
                        dark
                          ? "border-[#7a4638] bg-[#2a211e] text-[#f28b68] hover:bg-[#342722]"
                          : "border-[#d7a08a] bg-[#fff4ef] text-[#b94f2f] hover:bg-[#ffe8df]",
                      )}
                      aria-label={isStoppingActiveTurn ? copy.stopping : copy.stop}
                      title={isStoppingActiveTurn ? copy.stopping : copy.stop}
                      data-testid="agent-stop-composer"
                    >
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-current" />
                      <span>{isStoppingActiveTurn ? copy.stopping : copy.stop}</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={(!composerUi.hasText && pendingAttachments.length === 0) || isPastingImage || managedComposerSendDisabled}
                    title={managedComposerSendDisabled ? activeManagedAgentDisabledReason || undefined : undefined}
                    aria-label={managedComposerSendDisabled ? activeManagedAgentDisabledReason || copy.send : copy.send}
                    data-testid="agent-send"
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
              className={cls("atelier-preview-pane relative shrink-0 border-l flex flex-col", dark ? "border-dline bg-dsurf" : "border-line bg-surface")}
              style={{ width: previewWidth }}
            >
              <div
	                role="separator"
	                aria-orientation="vertical"
	                aria-label={tw.language === "en" ? "Resize preview" : "프리뷰 크기 조절"}
	                aria-valuemin={320}
	                aria-valuemax={Math.round(clampNumber(window.innerWidth - 640, 360, 920))}
	                aria-valuenow={Math.round(previewWidth)}
	                tabIndex={0}
	                onPointerDown={startPreviewResize}
	                onKeyDown={handlePreviewResizeKeyDown}
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
                {previewBadgeText && (
                  <span className={cls("atelier-preview-badge", `atelier-preview-badge-${previewBadgeTone}`)}>
                    {previewBadgeText}
                  </span>
                )}
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
                    disabled={!previewExternalInspectionEnabled}
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
                  disabled={!previewExternalInspectionEnabled}
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
                  disabled={!previewExternalInspectionEnabled}
                  className={cls(
                    "shrink-0 h-6 px-2 rounded-[4px] text-[10px]",
                    showDevScreen
                      ? dark ? "bg-dline text-dink" : "bg-line text-ink"
                      : dark ? "text-dsub hover:bg-[#3d3d3b] hover:text-dink" : "text-sub hover:bg-line hover:text-ink",
                  )}
                >
                  {copy.devScreen}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className={cls(
                    "shrink-0 h-6 w-6 rounded-[4px] inline-grid place-items-center",
                    dark ? "text-dsub hover:bg-[#3d3d3b] hover:text-dink" : "text-sub hover:bg-line hover:text-ink",
                  )}
                  title={tw.language === "en" ? "Close preview" : "프리뷰 닫기"}
                  aria-label={tw.language === "en" ? "Close preview" : "프리뷰 닫기"}
                >
                  {I.x}
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
                        {previewManagedStartEnabled && (
                          <>
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
                              onClick={startManagedPreviewService}
                              disabled={previewServiceBusy}
                              className={cls(
                                "atelier-preview-service-button",
                                dark ? "atelier-preview-service-button-dark" : "",
                              )}
                            >
                              {previewServiceBusy ? copy.previewServiceStarting : copy.previewServiceStart}
                            </button>
                          </>
                        )}
                        {previewManagedRunning && (
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
                      {!previewManagedStartEnabled && (
                        <div className="atelier-preview-diagnostic atelier-preview-diagnostic-info">
                          <span className="atelier-preview-diagnostic-source">{copy.previewService}</span>
                          <span className="atelier-preview-diagnostic-text">
                            {previewServicePolicyMessage}
                            {previewServicePolicyReason ? ` (${previewServicePolicyReason})` : ""}
                          </span>
                        </div>
                      )}
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
                    <button
                      type="button"
                      onClick={devScreenPickerStatus === "armed" ? cancelDevScreenElementPicker : runDevScreenElementPickerStart}
                      disabled={devScreenBusy}
                      className={cls("atelier-devscreen-button atelier-devscreen-picker-button", devScreenPickerStatus === "armed" ? "is-active" : "")}
                    >
                      <span className="atelier-devscreen-picker-icon" aria-hidden="true">
                        {devScreenPickerStatus === "armed" ? I.x : I.search}
                      </span>
                      {devScreenPickerStatus === "armed" ? copy.devScreenCancelPick : copy.devScreenPickElement}
                    </button>
                  </div>

                  {(devScreenPickerStatus === "armed" || devScreenElementSelection || devScreenPickerError) && (
                    <div className={cls("atelier-devscreen-picker", dark ? "atelier-devscreen-picker-dark" : "")}>
                      {devScreenPickerStatus === "armed" && (
                        <div className="atelier-devscreen-picker-live">
                          <span className="atelier-devscreen-picker-pulse" aria-hidden="true" />
                          <span>{copy.devScreenPickingElement}</span>
                        </div>
                      )}
                      {devScreenElementSelection && (
                        <div className="atelier-devscreen-selection">
                          <div className="atelier-devscreen-selection-main">
                            <span className="atelier-devscreen-selection-kicker">{copy.devScreenSelectedElement}</span>
                            <code>{devScreenElementSelection.selector}</code>
                            {(devScreenElementSelection.label || devScreenElementSelection.text) && (
                              <span className="atelier-devscreen-selection-label">
                                {devScreenElementSelection.label || devScreenElementSelection.text}
                              </span>
                            )}
                            <span className="atelier-devscreen-selection-meta">
                              {devScreenElementSelection.tag} · {devScreenElementSelection.rect.width}×{devScreenElementSelection.rect.height}
                              {` · ${Object.keys(devScreenElementSelection.styles).length} CSS`}
                            </span>
                          </div>
                          <div className="atelier-devscreen-selection-actions">
                            <button
                              type="button"
                              onClick={() => setDevScreenSelectionAttached(true)}
                              className={cls("atelier-devscreen-button", devScreenSelectionAttached ? "is-active" : "")}
                              disabled={devScreenSelectionAttached}
                            >
                              {devScreenSelectionAttached ? copy.devScreenSelectionAttached : copy.devScreenAttachSelection}
                            </button>
                            <button type="button" onClick={clearDevScreenElementSelection} className="atelier-devscreen-button">
                              {copy.devScreenClearSelection}
                            </button>
                          </div>
                        </div>
                      )}
                      {devScreenPickerError && (
                        <div className="atelier-devscreen-picker-error">{devScreenPickerError}</div>
                      )}
                    </div>
                  )}

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
                      {latestDevScreenDiagnostics && (
                        <div className={cls(
                          "atelier-preview-diagnostic",
                          latestDevScreenDiagnostics.runtimeErrors.length
                            || latestDevScreenNetworkFailureCount
                            || latestDevScreenDiagnostics.consoleEntries.some((entry) => entry.level === "error")
                            ? "atelier-preview-diagnostic-error"
                            : "atelier-preview-diagnostic-ok",
                        )}>
                          <span className="atelier-preview-diagnostic-source">browser</span>
                          <span className="atelier-preview-diagnostic-text">
                            Console {latestDevScreenDiagnostics.consoleEntries.length + latestDevScreenDiagnostics.runtimeErrors.length}
                            {" · "}Network {latestDevScreenDiagnostics.networkEntries.length}
                            {latestDevScreenNetworkFailureCount
                              ? ` · ${latestDevScreenNetworkFailureCount} failed`
                              : ""}
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

                  {(latestDevScreenScreenshot?.dataUrl || latestDevScreenSnapshot?.text || latestDevScreenDiagnostics || latestDevScreenData) && (
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
                      {latestDevScreenDiagnostics && (
                        <div className={cls("atelier-devscreen-panel", dark ? "atelier-devscreen-panel-dark" : "")}>
                          <div className="atelier-devscreen-panel-title">
                            {tw.language === "en" ? "Browser diagnostics" : "브라우저 진단"}
                          </div>
                          <pre>{[
                            ...latestDevScreenDiagnostics.runtimeErrors.map((entry) => `[runtime error] ${entry}`),
                            ...latestDevScreenDiagnostics.consoleEntries.map((entry) => `[${entry.level}] ${entry.text}`),
                            ...latestDevScreenDiagnostics.networkFailures.map((entry) => `[network failed] ${entry}`),
                            ...latestDevScreenDiagnostics.networkEntries.map((entry) => [
                              `[${entry.initiatorType}]`,
                              entry.status || "status n/a",
                              `${entry.durationMs}ms`,
                              entry.url,
                            ].join(" ")),
                          ].join("\n") || (tw.language === "en" ? "No browser issues captured." : "수집된 브라우저 문제가 없습니다.")}</pre>
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
                {previewUrl && previewExternalInspectionEnabled ? (
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
                  <div
                    className={cls(
                      "absolute inset-0 grid place-items-center px-6 text-center text-[13px]",
                      dark ? "bg-[#151513] text-dsub" : "bg-muted text-sub",
                    )}
                    aria-label={copy.noPreview}
                  >
                    {copy.noPreview}
                  </div>
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
