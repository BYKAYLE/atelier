// Stella Mode 단계별 모델 배정 계약 (정적 매핑 v1).
//
// 원칙 (SOT/L2-features/feature-stage-model-assignment.md 정본):
// 1. 미지정 = 세션 모델 상속. 오버라이드가 하나도 없으면 기존 단일 세션 실행
//    경로를 그대로 탄다 — 이 모듈은 그 경우 실행 파라미터를 전혀 바꾸지 않는다.
// 2. fail-closed: 검증 실패는 조용한 대체가 아니라 명시적 오류다.
// 3. 정적 매핑만 지원한다 (동적 판정기 없음).
// 4. 단계 간 컨텍스트는 대화 승계가 아니라 산출물 명시 전달(stage handoff)이다.

export type StageAgentProvider = "claude" | "codex" | "hermes" | "gajecode" | "grok";

export const STELLA_STAGES = [
  "planning",
  "execution",
  "verification",
  "security",
  "audit",
] as const;

export type StellaStage = (typeof STELLA_STAGES)[number];

export const STAGE_MODELS_STORAGE_KEY = "atelier.stella.stageModels.v1";

/** hermes 하위 backend 정본 (컴포저 HERMES_PROVIDERS 와 동형). */
export const STAGE_HERMES_BACKENDS = [
  "openai-codex",
  "anthropic",
  "openrouter",
  "alibaba",
  "grok",
] as const;

/** 단계 하나의 정적 배정. 비어 있는 필드는 세션 값을 상속한다.
 *  backend 는 provider=hermes 일 때만 유효하며, 모델 값 유도가 모호한 경우
 *  (예: OpenRouter 카탈로그의 anthropic/claude-*)를 확정하기 위해 영속된다. */
export type StageModelAssignment = {
  provider?: StageAgentProvider;
  backend?: string;
  model?: string;
  effort?: string;
};

export type StageModelAssignments = Partial<Record<StellaStage, StageModelAssignment>>;

export type StageSessionDefaults = {
  provider: StageAgentProvider;
  model: string;
  effort: string;
};

export type StageExecutionPlan = {
  stage: StellaStage;
  provider: StageAgentProvider;
  /** hermes 실행의 명시적 하위 backend (없으면 모델 값에서 유도). */
  backend?: string;
  model: string;
  effort: string;
  providerOverridden: boolean;
  modelOverridden: boolean;
  effortOverridden: boolean;
};

export type StageHandoff = {
  stage: StellaStage;
  provider: StageAgentProvider;
  model: string;
  summary: string;
};

export type StageReceipt = {
  stage: StellaStage;
  provider: StageAgentProvider;
  /** managed 하위 backend (hermes/gajecode 실행 시 — 예: alibaba, openrouter). */
  backend?: string;
  model: string;
  effort: string;
  status: "done" | "error" | "stopped" | "interrupted";
  durationMs: number;
  summary: string;
};

export type StageRunState = {
  runId: string;
  stage: StellaStage;
  stageIndex: number;
  assignments: StageModelAssignments;
  baseText: string;
  handoffs: StageHandoff[];
  receipts: StageReceipt[];
};

type Language = "ko" | "en";

const STAGE_LABELS: Record<StellaStage, { ko: string; en: string }> = {
  planning: { ko: "계획", en: "Planning" },
  execution: { ko: "구현", en: "Execution" },
  verification: { ko: "검증", en: "Verification" },
  security: { ko: "보안", en: "Security" },
  audit: { ko: "감사", en: "Audit" },
};

const STAGE_PROVIDERS: readonly StageAgentProvider[] = [
  "claude",
  "codex",
  "hermes",
  "gajecode",
  "grok",
];

/** 단계 provider 오버라이드로 허용되는 대상 (세션 provider와 다를 때).
 *  0.2.30(v1.1): top-level provider 5종 전부 교차 지정 가능 — 이 기능의 원래
 *  목적이 "계획=claude, 구현=grok/codex" 같은 공급사 혼합이다. 경계: hermes/
 *  gajecode 의 하위 backend 는 단계 계약이 직접 표현하지 않고 **모델 값에서
 *  유도**된다 (hermes: inferHermesProviderFromModel, 기본 openai-codex;
 *  gajecode: 모델 접두사). provider 오버라이드에는 항상 명시적 모델이 필요하다. */
const CROSS_PROVIDER_OVERRIDES: readonly StageAgentProvider[] = [
  "claude",
  "codex",
  "grok",
  "hermes",
  "gajecode",
];

/** 배정 생존 규칙 (0.2.30 명문화 — 초기화 결함 수리의 계약 기준):
 *  1. 배정은 세션 상태와 독립된 전역 값이다. 세션 모델 변경, 세션 provider
 *     전환, 패널 닫기/재열기, 앱 재시작 어느 것도 배정을 지우지 않는다.
 *  2. 한 단계 행의 변경은 그 행만 바꾼다 — 다른 행을 초기화하지 않는다.
 *  3. 배정 삭제는 명시적 조작(행에서 "상속" 선택, 또는 전체 초기화 버튼)만
 *     가능하다.
 *  4. 표시 규칙: 배정 모델이 현재 카탈로그에 없어도 행은 "상속"으로 위장하지
 *     않고 배정 값을 그대로 보여야 한다 (조용한 표시 붕괴 금지). */
export const STAGE_ASSIGNMENT_SURVIVAL_RULES = [
  "independent-of-session-state",
  "row-scoped-updates",
  "explicit-clear-only",
  "no-silent-display-collapse",
] as const;

// ── 공급 경로 도달성 계약 (0.2.31, 부류 규칙) ────────────────────────────
//
// 규칙: 컴포저에서 선택 가능한 모든 공급 경로(top-level provider + managed
// 하위 backend)는 단계 provider 셀렉터에서도 **한 번의 선택**으로 도달
// 가능해야 한다. 하위 backend 로만 존재하는 공급 경로(alibaba, openrouter,
// 향후 추가분)는 top-level 과 동급의 셀렉터 항목으로 파생 노출된다.
// 열거가 아니라 파생이다 — hermes backend 목록에 새 backend 가 추가되면
// 단계 셀렉터 항목도 자동으로 나타나야 하며, 전수 대조 스모크가 이를
// diff=0 으로 고정한다.

/** top-level provider 로 동일 공급 경로가 이미 존재하는 hermes backend.
 *  여기 없는 backend 는 단계 셀렉터에 전용 항목으로 파생된다. */
export const HERMES_BACKEND_TOP_LEVEL_EQUIVALENTS: Record<string, StageAgentProvider> = {
  "openai-codex": "codex",
  anthropic: "claude",
  grok: "grok",
};

export type StageSupplyEntry = {
  /** 셀렉터 값. top-level 은 provider id, backend 파생 항목은 `hermes:<backend>`. */
  value: string;
  label: string;
  provider: StageAgentProvider;
  hermesBackend?: string;
};

/** 단계 provider 셀렉터 항목 파생. providers/hermesBackends 는 컴포저가 실제
 *  사용하는 카탈로그 배열을 그대로 넘겨야 한다 (별도 열거 금지). */
export function deriveStageSupplyEntries(args: {
  providers: Array<{ id: StageAgentProvider; label: string }>;
  hermesBackends: Array<{ value: string; label: string }>;
}): StageSupplyEntry[] {
  const entries: StageSupplyEntry[] = args.providers.map((provider) => ({
    value: provider.id,
    label: provider.label,
    provider: provider.id,
  }));
  for (const backend of args.hermesBackends) {
    if (HERMES_BACKEND_TOP_LEVEL_EQUIVALENTS[backend.value]) continue;
    entries.push({
      value: `hermes:${backend.value}`,
      label: backend.label,
      provider: "hermes",
      hermesBackend: backend.value,
    });
  }
  return entries;
}

/** 전수 대조: 컴포저 공급 경로(모든 top-level provider + 모든 hermes backend)
 *  중 단계 셀렉터에서 도달 불가능한 경로 목록을 돌려준다. 게이트 기준 diff=0. */
export function stageSupplyCoverageDiff(args: {
  providers: Array<{ id: StageAgentProvider; label: string }>;
  hermesBackends: Array<{ value: string; label: string }>;
}): string[] {
  const entries = deriveStageSupplyEntries(args);
  const reachable = new Set(entries.map((entry) => entry.value));
  const missing: string[] = [];
  for (const provider of args.providers) {
    if (!reachable.has(provider.id)) missing.push(provider.id);
  }
  for (const backend of args.hermesBackends) {
    const equivalent = HERMES_BACKEND_TOP_LEVEL_EQUIVALENTS[backend.value];
    if (equivalent ? !reachable.has(equivalent) : !reachable.has(`hermes:${backend.value}`)) {
      missing.push(`hermes:${backend.value}`);
    }
  }
  return missing;
}

const STAGE_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

const MAX_HANDOFF_CHARS = 2400;
const MAX_RECEIPT_SUMMARY_CHARS = 400;

export function isStellaStage(value: unknown): value is StellaStage {
  return typeof value === "string" && (STELLA_STAGES as readonly string[]).includes(value);
}

export function stageLabel(stage: StellaStage, language: Language): string {
  return language === "en" ? STAGE_LABELS[stage].en : STAGE_LABELS[stage].ko;
}

function isStageProvider(value: unknown): value is StageAgentProvider {
  return typeof value === "string" && (STAGE_PROVIDERS as readonly string[]).includes(value);
}

function isStageEffort(value: unknown): boolean {
  return typeof value === "string" && (STAGE_EFFORTS as readonly string[]).includes(value);
}

function cleanAssignment(raw: unknown): StageModelAssignment | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const out: StageModelAssignment = {};
  const provider = typeof record.provider === "string" ? record.provider.trim().toLowerCase() : "";
  if (provider) {
    if (!isStageProvider(provider)) return null;
    out.provider = provider;
  }
  const backend = typeof record.backend === "string" ? record.backend.trim().toLowerCase() : "";
  if (backend) {
    if (!(STAGE_HERMES_BACKENDS as readonly string[]).includes(backend)) return null;
    out.backend = backend;
  }
  const model = typeof record.model === "string" ? record.model.trim() : "";
  if (model) out.model = model;
  const effort = typeof record.effort === "string" ? record.effort.trim().toLowerCase() : "";
  if (effort) out.effort = effort;
  if (!out.provider && !out.backend && !out.model && !out.effort) return null;
  return out;
}

/**
 * 신뢰할 수 없는 입력(localStorage/CLI JSON)을 단계 배정으로 정규화한다.
 * 알 수 없는 단계 키나 형식이 틀린 배정은 오류로 반환한다 (fail-closed).
 */
export function parseStageModelAssignments(
  raw: unknown,
): { assignments: StageModelAssignments; errors: string[] } {
  const errors: string[] = [];
  const assignments: StageModelAssignments = {};
  if (raw === undefined || raw === null) return { assignments, errors };
  let value: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { assignments, errors };
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      return { assignments, errors: [`stage-models JSON parse failed: ${String(error)}`] };
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { assignments, errors: ["stage-models must be a JSON object keyed by stage name"] };
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!isStellaStage(key)) {
      errors.push(`unknown stage "${key}" (expected one of: ${STELLA_STAGES.join(", ")})`);
      continue;
    }
    const cleaned = cleanAssignment(entry);
    if (cleaned === null) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)
        && Object.keys(entry as Record<string, unknown>).length === 0) {
        continue; // 빈 객체 = 상속 (무해)
      }
      errors.push(`stage "${key}" assignment must be an object with provider/model/effort strings`);
      continue;
    }
    assignments[key] = cleaned;
  }
  return { assignments, errors };
}

export function hasStageOverrides(assignments: StageModelAssignments | null | undefined): boolean {
  if (!assignments) return false;
  return STELLA_STAGES.some((stage) => {
    const entry = assignments[stage];
    return Boolean(entry && (entry.provider || entry.backend || entry.model || entry.effort));
  });
}

/**
 * 상속 해석: 단계 배정이 비어 있으면 세션 값을 그대로 돌려준다.
 * 오버라이드가 0개인 실행에서 이 함수의 결과는 세션 파라미터와 정확히 같아야
 * 한다 (기존 단일 실행 경로와의 동등성 보증 — 스모크로 고정).
 */
export function resolveStageExecution(
  stage: StellaStage,
  assignments: StageModelAssignments,
  session: StageSessionDefaults,
): StageExecutionPlan {
  const entry = assignments[stage] || {};
  const providerOverridden = Boolean(entry.provider && entry.provider !== session.provider);
  const modelOverridden = Boolean(entry.model && entry.model !== session.model);
  const effortOverridden = Boolean(entry.effort && entry.effort !== session.effort);
  return {
    stage,
    provider: entry.provider || session.provider,
    ...(entry.backend ? { backend: entry.backend } : {}),
    model: entry.model || session.model,
    effort: entry.effort || session.effort,
    providerOverridden,
    modelOverridden,
    effortOverridden,
  };
}

/**
 * 실행 직전 검증 (fail-closed). 문제가 있으면 사람이 읽을 수 있는 사유를
 * 반환하고, 호출자는 해당 단계에서 실행을 중단해야 한다.
 * `availableModels` 는 실행 시점 카탈로그(런타임 모델 목록 포함)의 값 목록이다.
 */
export function validateStageExecution(
  plan: StageExecutionPlan,
  session: StageSessionDefaults,
  availableModels: readonly string[],
  language: Language,
): string | null {
  const label = stageLabel(plan.stage, language);
  if (plan.providerOverridden) {
    if (!CROSS_PROVIDER_OVERRIDES.includes(plan.provider)) {
      return language === "en"
        ? `Stage "${label}" provider override "${plan.provider}" is not supported; use one of ${CROSS_PROVIDER_OVERRIDES.join(", ")} or inherit the session provider.`
        : `"${label}" 단계의 provider 오버라이드 "${plan.provider}"는 지원되지 않습니다. ${CROSS_PROVIDER_OVERRIDES.join(", ")} 중 하나를 쓰거나 세션 provider를 상속하세요.`;
    }
    if (!plan.modelOverridden) {
      return language === "en"
        ? `Stage "${label}" overrides the provider to "${plan.provider}" but does not name a model; a provider override requires an explicit model.`
        : `"${label}" 단계가 provider를 "${plan.provider}"로 바꾸면서 모델을 지정하지 않았습니다. provider 오버라이드에는 명시적 모델이 필요합니다.`;
    }
  }
  if (plan.modelOverridden && !availableModels.includes(plan.model)) {
    return language === "en"
      ? `Stage "${label}" requested model "${plan.model}" which is not in the ${plan.provider} model catalog; the stage was stopped instead of silently substituting another model.`
      : `"${label}" 단계가 지정한 모델 "${plan.model}"이 ${plan.provider} 모델 카탈로그에 없습니다. 다른 모델로 조용히 대체하지 않고 해당 단계에서 중단했습니다.`;
  }
  if (plan.backend && plan.provider !== "hermes") {
    return language === "en"
      ? `Stage "${label}" names backend "${plan.backend}" but its provider is "${plan.provider}"; a backend applies only to hermes stages.`
      : `"${label}" 단계가 backend "${plan.backend}"를 지정했지만 provider가 "${plan.provider}"입니다. backend는 hermes 단계에만 적용됩니다.`;
  }
  if (plan.effortOverridden && !isStageEffort(plan.effort)) {
    return language === "en"
      ? `Stage "${label}" effort "${plan.effort}" is not a recognized level (${STAGE_EFFORTS.join(", ")}).`
      : `"${label}" 단계의 effort "${plan.effort}"는 지원 값(${STAGE_EFFORTS.join(", ")})이 아닙니다.`;
  }
  void session;
  return null;
}

function clipText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}\n…(clipped)`;
}

const STAGE_DIRECTIVES: Record<StellaStage, { ko: string; en: string }> = {
  planning: {
    ko: "이 단계의 역할: 계획 수립 전담. 코드를 수정하지 말고, 현재 상태 확인과 목표 gap 분석 후 작업 패킷(대상 파일, done_when, 검증 명령, 롤백)을 담은 실행 계획만 산출하세요.",
    en: "Role of this stage: planning only. Do not modify code. Inspect the current state, analyze the goal gap, and produce an execution plan of task packets (target files, done_when, verification commands, rollback).",
  },
  execution: {
    ko: "이 단계의 역할: 구현 전담. 이전 단계 handoff의 계획에 따라 범위를 지키며 구현하고, 변경 요지와 산출물 경로를 남기세요.",
    en: "Role of this stage: implementation. Follow the plan from the previous stage handoff, stay in scope, and record what changed with artifact paths.",
  },
  verification: {
    ko: "이 단계의 역할: 검증 전담. 이전 단계들의 handoff에 명시된 구현을 증거 기반으로 검증(빌드/테스트/실측)하고, PASS/FAIL과 근거를 남기세요. 수정은 검증에 필요한 최소한만 허용됩니다.",
    en: "Role of this stage: verification. Verify the implementation named in earlier handoffs with evidence (build/tests/runtime checks) and record PASS/FAIL with proof. Only minimal fixes needed for verification are allowed.",
  },
  security: {
    ko: "이 단계의 역할: 보안 검토 전담. 이번 변경 표면의 권한, 자격증명, 명령 실행, 데이터 위험을 점검하고 발견 사항과 심각도를 남기세요.",
    en: "Role of this stage: security review. Inspect permissions, credentials, command execution, and data risks on the changed surfaces; record findings with severity.",
  },
  audit: {
    ko: "이 단계의 역할: 최종 감사 전담. 전체 단계 handoff를 근거로 완료 여부를 판정하고, 잔여 이슈와 readiness 결론을 남기세요.",
    en: "Role of this stage: final audit. Judge completion against all stage handoffs, and record residual issues plus a readiness verdict.",
  },
};

function formatHandoffBlock(handoffs: StageHandoff[], language: Language): string {
  if (handoffs.length === 0) return "";
  const header = language === "en"
    ? "Explicit stage handoffs from completed stages (context is passed only through these summaries, not conversation history):"
    : "완료된 단계의 명시적 handoff (컨텍스트는 대화 이력이 아니라 이 요약으로만 전달됩니다):";
  const blocks = handoffs.map((handoff, index) => {
    const label = stageLabel(handoff.stage, language);
    return [
      `[handoff ${index + 1}/${handoffs.length}] stage=${handoff.stage} (${label}) provider=${handoff.provider} model=${handoff.model}`,
      clipText(handoff.summary, MAX_HANDOFF_CHARS),
    ].join("\n");
  });
  return [header, ...blocks].join("\n\n");
}

/**
 * 단계 턴 프롬프트 조립: 원본 목표(baseText) + 단계 역할 지시 + handoff 주입.
 */
export function buildStageTurnPrompt(args: {
  stage: StellaStage;
  stageIndex: number;
  baseText: string;
  handoffs: StageHandoff[];
  language: Language;
}): string {
  const { stage, stageIndex, baseText, handoffs, language } = args;
  const label = stageLabel(stage, language);
  const position = `${stageIndex + 1}/${STELLA_STAGES.length}`;
  const intro = language === "en"
    ? `Stella Mode staged run — stage ${position}: ${stage} (${label}).`
    : `스텔라 모드 단계 분할 실행 — ${position} 단계: ${stage} (${label}).`;
  const directive = language === "en" ? STAGE_DIRECTIVES[stage].en : STAGE_DIRECTIVES[stage].ko;
  const handoffBlock = formatHandoffBlock(handoffs, language);
  const outro = language === "en"
    ? "End your answer with a section titled \"STAGE HANDOFF\" that lists artifact paths, key decisions, and instructions for the next stage."
    : "답변 마지막에 \"STAGE HANDOFF\" 섹션으로 산출물 경로, 핵심 결정, 다음 단계 지시를 정리하세요.";
  return [intro, directive, baseText, handoffBlock, outro].filter(Boolean).join("\n\n");
}

export function buildStageHandoff(args: {
  stage: StellaStage;
  provider: StageAgentProvider;
  model: string;
  resultText: string;
}): StageHandoff {
  return {
    stage: args.stage,
    provider: args.provider,
    model: args.model,
    summary: clipText(args.resultText || "(no output)", MAX_HANDOFF_CHARS),
  };
}

export function buildStageReceipt(args: {
  stage: StellaStage;
  provider: StageAgentProvider;
  backend?: string | null;
  model: string;
  effort: string;
  status: StageReceipt["status"];
  durationMs: number;
  resultText: string;
}): StageReceipt {
  return {
    stage: args.stage,
    provider: args.provider,
    ...(args.backend ? { backend: args.backend } : {}),
    model: args.model,
    effort: args.effort,
    status: args.status,
    durationMs: Math.max(0, Math.round(args.durationMs)),
    summary: clipText(args.resultText || "", MAX_RECEIPT_SUMMARY_CHARS),
  };
}

export function createStageRunState(args: {
  runId: string;
  assignments: StageModelAssignments;
  baseText: string;
}): StageRunState {
  return {
    runId: args.runId,
    stage: STELLA_STAGES[0],
    stageIndex: 0,
    assignments: args.assignments,
    baseText: args.baseText,
    handoffs: [],
    receipts: [],
  };
}

export function isTerminalStage(state: StageRunState): boolean {
  return state.stageIndex >= STELLA_STAGES.length - 1;
}

/** 성공한 단계의 결과를 반영해 다음 단계 상태를 만든다. */
export function advanceStageRunState(
  state: StageRunState,
  completed: { handoff: StageHandoff; receipt: StageReceipt },
): StageRunState | null {
  if (isTerminalStage(state)) return null;
  const nextIndex = state.stageIndex + 1;
  return {
    ...state,
    stage: STELLA_STAGES[nextIndex],
    stageIndex: nextIndex,
    handoffs: [...state.handoffs, completed.handoff],
    receipts: [...state.receipts, completed.receipt],
  };
}

/** localStorage 영속 페이로드 직렬화 (전역 기본값). */
export function serializeStageModelAssignments(assignments: StageModelAssignments): string {
  const compact: StageModelAssignments = {};
  for (const stage of STELLA_STAGES) {
    const entry = assignments[stage];
    if (entry && (entry.provider || entry.backend || entry.model || entry.effort)) compact[stage] = entry;
  }
  return JSON.stringify(compact);
}

export function stageReceiptLine(receipt: StageReceipt, language: Language): string {
  const label = stageLabel(receipt.stage, language);
  const backend = receipt.backend ? ` backend=${receipt.backend}` : "";
  return `${receipt.stage} (${label}) — provider=${receipt.provider}${backend} model=${receipt.model} effort=${receipt.effort} status=${receipt.status} duration=${Math.round(receipt.durationMs / 1000)}s`;
}

/** 영속 복원 시 stageRun 상태의 형식 방어. 손상되면 null (기존 경로로 폴백). */
export function normalizeStageRunState(raw: unknown): StageRunState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.runId !== "string" || !record.runId) return null;
  if (!isStellaStage(record.stage)) return null;
  const stageIndex = typeof record.stageIndex === "number" ? record.stageIndex : -1;
  if (stageIndex < 0 || stageIndex >= STELLA_STAGES.length) return null;
  if (STELLA_STAGES[stageIndex] !== record.stage) return null;
  if (typeof record.baseText !== "string" || !record.baseText.trim()) return null;
  const { assignments, errors } = parseStageModelAssignments(record.assignments);
  if (errors.length > 0) return null;
  const handoffs = Array.isArray(record.handoffs)
    ? record.handoffs.filter((item): item is StageHandoff =>
        typeof item === "object" && item !== null
        && isStellaStage((item as StageHandoff).stage)
        && typeof (item as StageHandoff).summary === "string"
        && typeof (item as StageHandoff).model === "string"
        && isStageProvider((item as StageHandoff).provider))
    : [];
  const receipts = Array.isArray(record.receipts)
    ? record.receipts.filter((item): item is StageReceipt =>
        typeof item === "object" && item !== null
        && isStellaStage((item as StageReceipt).stage)
        && typeof (item as StageReceipt).model === "string"
        && isStageProvider((item as StageReceipt).provider))
    : [];
  return {
    runId: record.runId,
    stage: record.stage,
    stageIndex,
    assignments,
    baseText: record.baseText,
    handoffs,
    receipts,
  };
}
