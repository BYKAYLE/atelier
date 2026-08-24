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

/** 단계 하나의 정적 배정. 비어 있는 필드는 세션 값을 상속한다. */
export type StageModelAssignment = {
  provider?: StageAgentProvider;
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

/** 단계 provider 오버라이드로 허용되는 대상 (세션 provider와 다를 때). Managed
 *  런타임의 하위 provider 선택(hermes/gajecode 서브 프로바이더)은 단계 계약이
 *  표현할 수 없으므로 v1 에서는 교차 오버라이드를 단순 spawn 계열로 제한한다. */
const CROSS_PROVIDER_OVERRIDES: readonly StageAgentProvider[] = ["claude", "codex", "grok"];

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
  const model = typeof record.model === "string" ? record.model.trim() : "";
  if (model) out.model = model;
  const effort = typeof record.effort === "string" ? record.effort.trim().toLowerCase() : "";
  if (effort) out.effort = effort;
  if (!out.provider && !out.model && !out.effort) return null;
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
    return Boolean(entry && (entry.provider || entry.model || entry.effort));
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
  model: string;
  effort: string;
  status: StageReceipt["status"];
  durationMs: number;
  resultText: string;
}): StageReceipt {
  return {
    stage: args.stage,
    provider: args.provider,
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
    if (entry && (entry.provider || entry.model || entry.effort)) compact[stage] = entry;
  }
  return JSON.stringify(compact);
}

export function stageReceiptLine(receipt: StageReceipt, language: Language): string {
  const label = stageLabel(receipt.stage, language);
  return `${receipt.stage} (${label}) — provider=${receipt.provider} model=${receipt.model} effort=${receipt.effort} status=${receipt.status} duration=${Math.round(receipt.durationMs / 1000)}s`;
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
