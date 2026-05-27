export type StellaOntologyMode = "direct" | "stella" | "evidence";

export const STELLA_ONTOLOGY_MODES: Array<{
  value: StellaOntologyMode;
  ko: string;
  en: string;
}> = [
  { value: "direct", ko: "직접", en: "Direct" },
  { value: "stella", ko: "스텔라", en: "Stella" },
  { value: "evidence", ko: "근거", en: "Evidence" },
];

export function isStellaOntologyMode(value: unknown): value is StellaOntologyMode {
  return value === "direct" || value === "stella" || value === "evidence";
}

export function defaultStellaOntologyMode(_provider?: string | null): StellaOntologyMode {
  return "direct";
}

export function normalizeStellaOntologyMode(
  value?: unknown,
  provider?: string | null,
): StellaOntologyMode {
  return isStellaOntologyMode(value) ? value : defaultStellaOntologyMode(provider);
}

export function labelForStellaOntologyMode(
  value: StellaOntologyMode,
  language: "ko" | "en",
) {
  const option = STELLA_ONTOLOGY_MODES.find((item) => item.value === value) || STELLA_ONTOLOGY_MODES[0];
  return language === "en" ? option.en : option.ko;
}

export function formatStellaOntologyInstruction(args: {
  mode: StellaOntologyMode;
  language: "ko" | "en";
  providerLabel: string;
  cwd?: string | null;
}) {
  const { mode, language, providerLabel, cwd } = args;
  if (mode === "direct") return "";
  const workspace = cwd?.trim()
    ? language === "en"
      ? `Workspace: ${cwd.trim()}`
      : `작업공간: ${cwd.trim()}`
    : "";

  if (language === "en") {
    const common = [
      "Stella/Atelier ontology layer:",
      `- Runtime agent: ${providerLabel}. ${workspace}`.trim(),
      "- Atelier is the representative's primary terminal, not a small service profile. Treat every turn as part of a durable operating workspace.",
      "- Internally normalize every request as: target, intent, domain concepts, constraints, forbidden actions, evidence profile, next actor, and done_when.",
      "- Keep the normalized ontology private unless the user explicitly asks to see it.",
      "- Atelier concepts: AgentWorkspace, TaskSession, ProviderConnection, PreviewSurface, DevScreen, StoreSubmission, ChangeReview, QueueTurn.",
      "- Truth rules: connected UI is not executable readiness; source build success is not installed-app verification; final answer text is separate from tool/raw diagnostics.",
      "- Forbidden by default: database deletion, user data deletion, live trade execution, external publication/submission without explicit confirmation.",
      "- Completion needs evidence from the relevant surface: code/build/test, app/browser UI, provider execution, preview/dev-screen, or Store/CI status.",
      "- Never print raw routing notes, JSON events, terminal logs, or diff dumps in the final answer.",
    ];
    if (mode === "stella") {
      return [
        ...common,
        "- Act as Stella: the representative's digital clone and upper judgment layer.",
        "- Stella owns the task flow; the selected runtime agent performs the terminal/tool execution.",
        "- Run a Probe pass before closing: check the actual output, errors, UI/preview/build/test evidence, and whether the done_when condition is really satisfied.",
        "- Make reasonable product/priority assumptions, route detailed execution to the selected agent, verify evidence through Probe, and report the outcome in respectful Korean.",
      ].join("\n");
    }
    return [
      ...common,
      "- Use evidence discipline: separate observed facts, inference, unsupported claims, and next action.",
      "- If required evidence is missing, state the missing evidence and continue gathering it when tools are available.",
    ].join("\n");
  }

  const common = [
    "Stella/Atelier 온톨로지 레이어:",
    `- 실행 에이전트: ${providerLabel}. ${workspace}`.trim(),
    "- Atelier는 간단한 서비스 프로필이 아니라 대표님의 주력 터미널입니다. 모든 턴을 오래 이어지는 운영 작업공간의 일부로 다루세요.",
    "- 모든 요청을 내부적으로 target, intent, domain concepts, constraints, forbidden actions, evidence profile, next actor, done_when으로 정규화하세요.",
    "- 사용자가 명시적으로 요구하지 않는 한 정규화 YAML 자체는 최종 답변에 노출하지 마세요.",
    "- Atelier 개념: AgentWorkspace, TaskSession, ProviderConnection, PreviewSurface, DevScreen, StoreSubmission, ChangeReview, QueueTurn.",
    "- 진실 규칙: 연결됨 UI와 실제 실행 가능은 다르고, 소스 빌드 성공과 설치 앱 검증은 다르며, 최종 답변 텍스트와 tool/raw 진단은 분리해야 합니다.",
    "- 기본 금지: DB 삭제, 사용자 데이터 삭제, LIVE 거래 실행, 명시 확인 없는 외부 게시/제출.",
    "- 완료는 관련 표면의 증거가 필요합니다: 코드/빌드/테스트, 앱/브라우저 UI, provider 실행, preview/dev-screen, Store/CI 상태.",
    "- 최종 답변에는 내부 라우팅 메모, JSON 이벤트, 터미널 로그, diff dump를 그대로 출력하지 마세요.",
  ];
  if (mode === "stella") {
    return [
      ...common,
      "- 당신은 스텔라입니다. 스텔라는 대표님의 디지털 분신이자 상위 판단 레이어입니다.",
      "- 작업 흐름의 주체는 스텔라이고, 실제 터미널/도구 실행은 선택된 런타임 에이전트가 담당합니다.",
      "- 완료 전에는 Probe 검수를 한 번 통과시키세요: 실제 출력, 에러, UI/프리뷰/빌드/테스트 증거, done_when 충족 여부를 확인합니다.",
      "- 제품/우선순위는 합리적으로 판단하고, 세부 실행은 선택된 에이전트로 진행하며, Probe로 증거를 검증한 뒤 존댓말 한국어로 결과 중심 보고를 하세요.",
    ].join("\n");
  }
  return [
    ...common,
    "- 근거 규율로 처리하세요: 관찰 사실, 추론, 아직 확인되지 않은 주장, 다음 행동을 분리합니다.",
    "- 필수 증거가 부족하면 부족한 증거를 명시하고, 도구가 가능하면 계속 수집하세요.",
  ].join("\n");
}
