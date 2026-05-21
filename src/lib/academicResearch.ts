import type { AgentProvider } from "./tauri";

export type AcademicResearchMode =
  | "pipeline"
  | "plan"
  | "literature-review"
  | "paper"
  | "review"
  | "revision"
  | "citation-check"
  | "abstract"
  | "disclosure"
  | "format-convert";

export type AcademicResearchSlashCommand = {
  command: string;
  insert: string;
  detailKo: string;
  detailEn: string;
};

export type AcademicResearchRequest = {
  mode: AcademicResearchMode;
  title: string;
  prompt: string;
};

const MODE_BY_COMMAND: Record<string, AcademicResearchMode> = {
  "/ars": "pipeline",
  "/ars-full": "pipeline",
  "/ars-plan": "plan",
  "/ars-lit-review": "literature-review",
  "/ars-paper": "paper",
  "/ars-review": "review",
  "/ars-revision": "revision",
  "/ars-citation-check": "citation-check",
  "/ars-abstract": "abstract",
  "/ars-disclosure": "disclosure",
  "/ars-format-convert": "format-convert",
};

export const ACADEMIC_RESEARCH_SLASH_COMMANDS: AcademicResearchSlashCommand[] = [
  {
    command: "/ars <goal>",
    insert: "/ars ",
    detailKo: "연구-문헌조사-작성-검토-수정 파이프라인 실행",
    detailEn: "Run the research-writing-review-revision pipeline",
  },
  {
    command: "/ars-plan <topic>",
    insert: "/ars-plan ",
    detailKo: "연구 질문과 논문 구조를 소크라틱 방식으로 설계",
    detailEn: "Plan research questions and paper structure with Socratic scoping",
  },
  {
    command: "/ars-lit-review <topic>",
    insert: "/ars-lit-review ",
    detailKo: "문헌조사·체계적 리뷰·근거 공백 맵 작성",
    detailEn: "Build a literature review, systematic-review plan, and evidence-gap map",
  },
  {
    command: "/ars-paper <materials>",
    insert: "/ars-paper ",
    detailKo: "IMRaD/리뷰 논문 초안 구조와 작성 체크포인트 생성",
    detailEn: "Create an IMRaD or review-paper draft structure and writing checkpoints",
  },
  {
    command: "/ars-review <draft>",
    insert: "/ars-review ",
    detailKo: "편집자·방법론·도메인·반대자 관점의 피어리뷰",
    detailEn: "Run editor, methodology, domain, and devil's-advocate peer review",
  },
  {
    command: "/ars-revision <comments>",
    insert: "/ars-revision ",
    detailKo: "리뷰 코멘트 대응표와 수정 우선순위 생성",
    detailEn: "Create a response matrix and revision priorities from reviewer comments",
  },
  {
    command: "/ars-citation-check <draft>",
    insert: "/ars-citation-check ",
    detailKo: "주장-출처 연결, 인용 누락, 검증 필요 항목 점검",
    detailEn: "Audit claim-source links, missing citations, and verification gaps",
  },
  {
    command: "/ars-install-claude",
    insert: "/ars-install-claude",
    detailKo: "Claude Code용 원본 Academic Research Skills 플러그인 설치",
    detailEn: "Install the native Claude Code Academic Research Skills plugin",
  },
];

const MODE_LABEL_KO: Record<AcademicResearchMode, string> = {
  pipeline: "학술 연구 전체 파이프라인",
  plan: "연구 설계",
  "literature-review": "문헌조사",
  paper: "논문 작성",
  review: "피어리뷰",
  revision: "리비전",
  "citation-check": "인용 검증",
  abstract: "초록 작성",
  disclosure: "AI 사용 고지",
  "format-convert": "형식 변환",
};

const MODE_LABEL_EN: Record<AcademicResearchMode, string> = {
  pipeline: "academic research pipeline",
  plan: "research planning",
  "literature-review": "literature review",
  paper: "paper drafting",
  review: "peer review",
  revision: "revision planning",
  "citation-check": "citation verification",
  abstract: "abstract drafting",
  disclosure: "AI disclosure",
  "format-convert": "format conversion",
};

export function parseAcademicResearchCommand(
  rawText: string,
  language: "ko" | "en",
  provider: AgentProvider,
): AcademicResearchRequest | null {
  const trimmed = rawText.trim();
  const match = trimmed.match(/^(\/ars(?:-[a-z-]+)?)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;

  const command = match[1].toLowerCase();
  const mode = MODE_BY_COMMAND[command];
  if (!mode) return null;

  const body = (match[2] || "").trim();
  const label = language === "en" ? MODE_LABEL_EN[mode] : MODE_LABEL_KO[mode];
  return {
    mode,
    title: `${command.replace("/", "")}: ${body || label}`.slice(0, 48),
    prompt: buildAcademicResearchPrompt(mode, body, language, provider),
  };
}

function modeInstruction(mode: AcademicResearchMode, language: "ko" | "en") {
  const ko: Record<AcademicResearchMode, string> = {
    pipeline:
      "Stage 0 intake → Stage 1 research scope → Stage 2 literature map → Stage 2.5 integrity gate → Stage 3 draft architecture → Stage 4 peer review → Stage 5 revision plan → Stage 6 finalization dashboard 순서로 진행하세요. 한 번에 다 쓰기보다 현재 자료 상태를 판별하고 다음 체크포인트 산출물부터 만드세요.",
    plan:
      "연구 질문, 범위, 방법론 후보, 자료 수집 전략, 논문 구조를 설계하세요. 주제가 흐리면 먼저 3-5개의 좁히는 질문을 하되, 바로 쓸 수 있는 연구 설계표도 함께 제시하세요.",
    "literature-review":
      "문헌조사 프로토콜, 검색 키워드, 포함/제외 기준, PRISMA식 선별 흐름, 핵심 연구 흐름, 근거 공백, 반대 근거, 검증 필요한 주장 목록을 만드세요.",
    paper:
      "IMRaD, 이론 논문, 또는 문헌리뷰 논문 중 가장 맞는 구조를 고르고 초안 아키텍처, 섹션별 논지, 필요한 표/그림, 작성 순서, 아직 쓰면 안 되는 부분을 분리하세요.",
    review:
      "편집장, 방법론 리뷰어, 도메인 리뷰어, 엄격한 반대자 관점으로 읽고, 0-100 품질 점수, 강점, 치명적 약점, desk reject 위험, 수정 우선순위를 제시하세요. 원문을 바꾸지 말고 리뷰만 하세요.",
    revision:
      "리뷰 코멘트를 claim 단위로 분해하고, 대응 전략, 수정 위치, 필요한 추가 근거, 반박 가능 항목, response-to-reviewers 표를 만드세요.",
    "citation-check":
      "주장-출처 매트릭스를 만들고, 출처가 직접 지지하는 주장과 추론이 필요한 주장, 인용 누락, 과장 표현, 검증 불가 항목을 분리하세요. 출처를 지어내지 마세요.",
    abstract:
      "연구문제, 방법, 핵심 결과, 기여, 한계가 드러나는 초록을 작성하되, 확인되지 않은 결과는 placeholder로 표시하세요.",
    disclosure:
      "AI 사용 범위, 사람의 책임 범위, 검증 절차, 데이터/인용 무결성 확인을 포함한 학술지 제출용 AI disclosure 초안을 만드세요.",
    "format-convert":
      "목표 형식에 맞춰 구조 변환 계획을 세우고, 인용 스타일, 표/그림, heading level, LaTeX/Markdown/DOCX 변환 위험을 체크하세요.",
  };

  const en: Record<AcademicResearchMode, string> = {
    pipeline:
      "Run Stage 0 intake → Stage 1 research scope → Stage 2 literature map → Stage 2.5 integrity gate → Stage 3 draft architecture → Stage 4 peer review → Stage 5 revision plan → Stage 6 finalization dashboard. Do not silently write everything at once; identify the current material state and produce the next checkpoint artifact first.",
    plan:
      "Design the research question, scope, methodology options, data/source strategy, and paper structure. If the topic is underspecified, ask 3-5 narrowing questions while still producing a useful planning table.",
    "literature-review":
      "Create a literature-review protocol, search keywords, inclusion/exclusion criteria, PRISMA-style screening flow, research streams, evidence gaps, counter-evidence, and claims needing verification.",
    paper:
      "Choose the best structure among IMRaD, theoretical paper, or literature review, then produce draft architecture, section claims, needed tables/figures, writing order, and parts that must not be written yet.",
    review:
      "Review from editor-in-chief, methodology reviewer, domain reviewer, and strict devil's-advocate perspectives. Produce 0-100 quality score, strengths, fatal weaknesses, desk-reject risk, and revision priorities. Review only; do not rewrite the manuscript.",
    revision:
      "Decompose reviewer comments into claim-level tasks and produce response strategy, revision locations, needed evidence, defensible rebuttals, and a response-to-reviewers matrix.",
    "citation-check":
      "Build a claim-source matrix and separate directly supported claims, inferential claims, missing citations, overclaims, and unverifiable items. Do not invent sources.",
    abstract:
      "Draft an abstract showing research problem, method, key findings, contribution, and limitations. Mark unverified results as placeholders.",
    disclosure:
      "Draft a journal-ready AI disclosure covering AI usage scope, human responsibility, verification process, and data/citation integrity checks.",
    "format-convert":
      "Plan conversion to the target format, checking citation style, tables/figures, heading levels, and LaTeX/Markdown/DOCX conversion risks.",
  };

  return language === "en" ? en[mode] : ko[mode];
}

function buildAcademicResearchPrompt(
  mode: AcademicResearchMode,
  body: string,
  language: "ko" | "en",
  provider: AgentProvider,
) {
  const label = language === "en" ? MODE_LABEL_EN[mode] : MODE_LABEL_KO[mode];
  const userMaterial = body || (language === "en" ? "(No topic/material supplied yet.)" : "(아직 주제/자료가 충분히 제공되지 않았습니다.)");

  const ko = [
    "Atelier 내장 Academic Research 모드로 실행하세요.",
    "",
    "중요:",
    "- 이 모드는 특정 Claude 플러그인에 의존하지 않는 provider 공통 연구 워크플로입니다.",
    "- 원본 자료/출처/데이터가 없으면 없는 것으로 표시하고, 논문·출처·DOI를 지어내지 마세요.",
    "- 상업 제품에 외부 CC BY-NC 원문을 복사해 넣는 방식이 아니라, 연구 품질 게이트 패턴만 일반화해서 사용합니다.",
    `- 현재 실행 provider: ${provider}. provider별 도구가 다르면 가능한 범위 안에서 같은 산출물 구조를 유지하세요.`,
    "",
    `작업 모드: ${label}`,
    modeInstruction(mode, language),
    "",
    "공통 품질 게이트:",
    "1. 연구 질문/주장 단위로 쪼개기",
    "2. source passport: 각 핵심 주장마다 출처, 검증 상태, locator 또는 확인 방법 표시",
    "3. material passport: 사용자가 제공한 자료, 생성한 해석, 아직 필요한 자료를 분리",
    "4. integrity review: 과장, 인용 공백, 방법론 약점, 재현성 리스크 표시",
    "5. reviewer loop: 강점보다 수정 우선순위와 다음 행동을 더 분명히 표시",
    "",
    "출력 형식:",
    "- 한국어로 답하세요.",
    "- 표는 필요할 때만 쓰고, 긴 표 대신 핵심 항목 중심으로 정리하세요.",
    "- 마지막에 '다음 체크포인트'를 3개 이내로 제시하세요.",
    "",
    "사용자 자료/요청:",
    userMaterial,
  ];

  const en = [
    "Run Atelier built-in Academic Research mode.",
    "",
    "Important:",
    "- This is a provider-neutral research workflow and must not depend on a Claude-only plugin.",
    "- If source material or data is missing, mark it as missing. Do not fabricate papers, sources, DOIs, or results.",
    "- Do not copy external CC BY-NC prompt text into the product; use generalized research quality-gate patterns only.",
    `- Current provider: ${provider}. Keep the same artifact structure even if provider-specific tools differ.`,
    "",
    `Mode: ${label}`,
    modeInstruction(mode, language),
    "",
    "Common quality gates:",
    "1. Decompose into research questions and claim units.",
    "2. Source passport: for each key claim, show source, verification state, locator, or verification method.",
    "3. Material passport: separate user-provided material, generated interpretation, and still-needed material.",
    "4. Integrity review: flag overclaims, citation gaps, methodology weaknesses, and reproducibility risks.",
    "5. Reviewer loop: make revision priorities and next action clearer than praise.",
    "",
    "Output:",
    "- Answer in English unless the user's material clearly requests another language.",
    "- Use tables only when useful; prefer compact, high-signal artifacts.",
    "- End with no more than three next checkpoints.",
    "",
    "User material/request:",
    userMaterial,
  ];

  return (language === "en" ? en : ko).join("\n");
}
