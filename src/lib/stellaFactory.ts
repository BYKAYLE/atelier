import type { AgentProvider, StellaFactoryAutopilotResult, StellaFactoryBootstrapResult, StellaProbeResult, StellaProjectAnalysis } from "./tauri";

export type StellaFactoryCommand = "goal" | "analyze" | "probe" | "audit";

export type StellaFactoryRequest = {
  command: StellaFactoryCommand;
  body: string;
  title: string;
  prompt: string;
};

export type StellaFactorySafetyBlock = {
  label: string;
  message: string;
};

export type StellaFactoryPreflight = {
  analysis?: StellaProjectAnalysis | null;
  bootstrap?: StellaFactoryBootstrapResult | null;
  autopilot?: StellaFactoryAutopilotResult | null;
  probe?: StellaProbeResult | null;
  error?: string | null;
};

type Language = "ko" | "en";

const SOT_PATHS = [
  "SOT/L1-project-summary.md",
  "SOT/autonomous-workspace-contract.md",
  "SOT/service-factory-state.json",
  "SOT/service-factory/current-state.md",
  "SOT/service-factory/development-plan.md",
  "SOT/service-factory/",
  "SOT/tasks.md",
  "SOT/evidence-log.md",
];

export function formatStellaFactoryInstruction(args: {
  language: Language;
  provider: AgentProvider;
  providerLabel: string;
  cwd?: string | null;
}) {
  const { language, provider, providerLabel, cwd } = args;
  const workspace = cwd?.trim() || "(not set)";
  if (language === "en") {
    return [
      "Stella Factory autonomous development contract:",
      `- Runtime provider: ${providerLabel} (${provider}). Workspace: ${workspace}.`,
      "- Preserve the existing terminal/service behavior. Upgrade in place; do not rebuild from scratch unless explicitly requested.",
      "- Convert natural-language goals into development tasks: objective, constraints, target files, execution plan, verification plan, done_when, and rollback path.",
      "- Mandatory development order: first capture the current state, then write the goal-to-plan strategy, then execute and verify. Do not jump straight into implementation for broad goals.",
      "- If the goal is broad product delivery, service evolution, or an Antigravity-style autonomous build, treat it as a durable Service Factory run, not a single feature ticket.",
      "- For Service Factory runs, maintain state under SOT/service-factory-state.json plus current-state, development-plan, mission, research, capability map, agent topology, roadmap, QC matrix, and readiness artifacts under SOT/service-factory/.",
      "- For Factory goal runs, if the local Stella bridge exists, immediately run the managed cycle before any completion claim: python3 ~/.claude/skills/stella/scripts/stella_service_factory.py autopilot --project <workspace> --goal <objective> --max-cycles 12 --pretty.",
      "- A single implemented feature is not done unless it closes the declared milestone and the readiness report proves no remaining factory queue is required.",
      "- Before broad edits, inspect the real code, run surfaces, docs, tests, and SOT status. Prefer existing patterns over new architecture.",
      "- Execute safely: small commands first, capture evidence, avoid destructive or irreversible operations.",
      "- Forbidden without explicit approval: database deletion, user-data deletion, production deploy/submission, credential exposure, paid purchases, and external publication. External network calls are allowed only when required by the user task or dependency verification; state why when used.",
      "- After code edits, verify with the narrowest meaningful checks first, then broader build/test/probe checks when risk justifies it.",
      "- Use role delegation internally: Stella judges priority and scope, Worker implements, Probe verifies, Security reviews risk, Release checks packaging/update readiness, Auditor closes with evidence.",
      "- Keep or update SOT when the work changes project behavior. Preferred files: " + SOT_PATHS.join(", ") + ".",
      "- Final answer must be concise, evidence-based, and free of raw terminal logs unless the user explicitly asks for them.",
    ].join("\n");
  }
  return [
    "Stella Factory 자율 개발 계약:",
    `- 실행 provider: ${providerLabel} (${provider}). 작업공간: ${workspace}.`,
    "- 기존 터미널/서비스 동작을 보존하세요. 명시 요청이 없는 한 처음부터 다시 만들지 말고 현재 구조 위에서 고도화하세요.",
    "- 자연어 목표를 개발 작업으로 변환하세요: objective, constraints, target files, execution plan, verification plan, done_when, rollback path.",
    "- 필수 개발 순서: 먼저 현재 상태를 파악하고, 그다음 목표 달성 계획을 정리한 뒤, 실행/검증으로 들어갑니다. 넓은 목표에서 바로 구현부터 시작하지 마세요.",
    "- 목표가 제품 단위 개발, 기존 서비스 고도화, Antigravity급 자율 빌드라면 단일 기능 티켓이 아니라 지속되는 Service Factory run으로 취급하세요.",
    "- Service Factory run에서는 SOT/service-factory-state.json과 SOT/service-factory/ 아래 current-state, development-plan, mission, research, capability map, agent topology, roadmap, QC matrix, readiness 산출물을 유지하세요.",
    "- Factory goal run에서는 로컬 Stella bridge가 있으면 완료를 말하기 전에 반드시 managed cycle을 실행하세요: python3 ~/.claude/skills/stella/scripts/stella_service_factory.py autopilot --project <workspace> --goal <objective> --max-cycles 12 --pretty.",
    "- 단일 기능 구현은 완료가 아닙니다. 선언한 milestone이 닫히고 readiness report가 남은 factory queue가 없음을 증명할 때만 완료입니다.",
    "- 넓은 수정 전에는 실제 코드, 실행 표면, 문서, 테스트, SOT 상태를 먼저 확인하세요. 새 구조보다 기존 패턴을 우선합니다.",
    "- 안전하게 실행하세요: 작은 명령부터 수행하고, 증거를 수집하며, 파괴적/되돌리기 어려운 작업은 피합니다.",
    "- 명시 승인 없이 금지: DB 삭제, 사용자 데이터 삭제, 프로덕션 배포/제출, 자격증명 노출, 유료 결제, 외부 게시. 외부 네트워크 호출은 사용자 작업 또는 의존성 검증에 필요할 때만 사용하고 이유를 남기세요.",
    "- 코드 수정 후에는 위험도에 맞게 가장 좁은 검증부터 실행하고, 필요하면 build/test/probe 검증까지 확장하세요.",
    "- 역할 위임을 내부적으로 적용하세요: Stella는 우선순위와 범위를 판단, Worker는 구현, Probe는 검증, Security는 위험 검토, Release는 패키징/업데이트 준비, Auditor는 증거 기반 종료.",
    "- 프로젝트 동작이 바뀌면 SOT를 유지/갱신하세요. 권장 파일: " + SOT_PATHS.join(", ") + ".",
    "- 최종 답변은 짧고 증거 중심으로 작성하며, 사용자가 명시하지 않는 한 터미널 로그 원문은 출력하지 마세요.",
  ].join("\n");
}

export function parseStellaFactoryCommand(rawText: string, language: Language): StellaFactoryRequest | null {
  const trimmed = rawText.trim();
  const match = trimmed.match(/^\/(goal|analyze|probe|audit)(?:\s+([\s\S]*))?$/i);
  const alias = match ? null : parseStellaFactoryAlias(trimmed);
  if (!match && !alias) return null;
  const command = match ? (match[1].toLowerCase() as StellaFactoryCommand) : alias!.command;
  const body = (match ? match[2] || "" : alias!.body).trim();
  if (!body) return null;
  return {
    command,
    body,
    title: factoryTitle(command, body, language),
    prompt: buildStellaFactoryPrompt(command, body, language),
  };
}

export function detectStellaFactorySafetyBlock(rawText: string, language: Language): StellaFactorySafetyBlock | null {
  const trimmed = rawText.trim();
  if (!isStellaFactoryInvocation(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  const normalized = trimmed.replace(/\s+/g, " ");
  const negated = /하지\s*마|하지\s*말|삭제하지|지우지|금지|do\s+not|don't|without\s+delet/i.test(normalized);

  const rules = [
    {
      labelKo: "DB/테이블 삭제",
      labelEn: "database/table deletion",
      patterns: [
        /\b(drop|truncate)\s+(database|schema|table)\b/i,
        /\bdelete\s+from\b/i,
        /db\s*삭제/i,
        /데이터베이스\s*삭제/i,
        /테이블\s*(삭제|초기화|비우)/i,
      ],
    },
    {
      labelKo: "사용자 데이터 삭제",
      labelEn: "user-data deletion",
      patterns: [
        /사용자\s*데이터\s*(삭제|초기화|비우)/i,
        /유저\s*데이터\s*(삭제|초기화|비우)/i,
        /\bdelete\s+(all\s+)?user\s+data\b/i,
        /\bwipe\s+(all\s+)?user\s+data\b/i,
      ],
    },
    {
      labelKo: "프로덕션 배포/제출",
      labelEn: "production deploy/submission",
      patterns: [
        /프로덕션\s*(배포|제출|릴리스|업로드)/i,
        /운영\s*(배포|제출|릴리스|업로드)/i,
        /\bproduction\s+(deploy|submit|release|publish)\b/i,
        /\bdeploy\s+to\s+prod(uction)?\b/i,
      ],
    },
    {
      labelKo: "외부 공개/게시",
      labelEn: "external publication",
      patterns: [
        /외부\s*(게시|공개|출판)/i,
        /(github|npm|pypi|store|스토어).*(publish|upload|release|게시|업로드|릴리스)/i,
      ],
    },
    {
      labelKo: "자격증명 노출",
      labelEn: "credential exposure",
      patterns: [
        /(api\s*key|token|secret|password|비밀번호|토큰|시크릿|자격증명).*(print|show|expose|dump|출력|보여|노출)/i,
        /(print|show|expose|dump|출력|보여|노출).*(api\s*key|token|secret|password|비밀번호|토큰|시크릿|자격증명)/i,
      ],
    },
  ];

  for (const rule of rules) {
    if (negated && !/(deploy|publish|release|submit|배포|제출|릴리스|업로드)/i.test(lower)) continue;
    if (rule.patterns.some((pattern) => pattern.test(trimmed))) {
      const label = language === "en" ? rule.labelEn : rule.labelKo;
      return {
        label,
        message: language === "en"
          ? `Stella Factory safety gate stopped this request before agent execution because it appears to request ${label}. Send a narrower request with explicit approval if this action is truly intended.`
          : `Stella Factory 안전 게이트가 에이전트 실행 전에 이 요청을 멈췄습니다. 요청에 ${label} 작업이 포함된 것으로 보입니다. 정말 필요한 작업이면 별도 명시 승인을 포함해 더 좁은 범위로 다시 요청해주세요.`,
      };
    }
  }

  return null;
}

function parseStellaFactoryAlias(trimmed: string): { command: StellaFactoryCommand; body: string } | null {
  const match = trimmed.match(/^(?:\/\s*)?(?:스텔라\s*팩토리|stella\s+factory)(?:\s*(?:로|으로|를|을|는|은|:|：|\.|-|—)\s*)?([\s\S]*)$/i);
  if (!match) return null;
  return { command: "goal", body: match[1] || "" };
}

function isStellaFactoryInvocation(trimmed: string) {
  return /^\/(goal|analyze|probe|audit)\b/i.test(trimmed) || parseStellaFactoryAlias(trimmed) !== null;
}

export function buildStellaFactoryPrompt(
  command: StellaFactoryCommand,
  body: string,
  language: Language,
) {
  const objective = body.trim();
  if (language === "en") {
    const intro = commandIntroEn(command);
    return [
      `${intro}`,
      "",
      `Objective: ${objective}`,
      "",
      "Required workflow:",
      "1. Current state discovery: inspect the actual code, runtime, installed app/package state, SOT, dirty paths, existing capabilities, risks, and verification baseline.",
      "2. Goal-to-plan strategy: explain the gap between current state and the target, then define task packets with role, owned paths, done_when, verification, and rollback/retry criteria.",
      "3. Execution and verification: implement scoped task packets, integrate, run checks, and loop back to planning if evidence fails.",
      "4. Decide whether this is a feature ticket or a Service Factory run. Product-wide, long-horizon, autonomous, or existing-service evolution goals are Service Factory runs.",
      "5. For Service Factory runs, create or update SOT/service-factory-state.json and SOT/service-factory artifacts: current-state.md, development-plan.md, mission-charter.md, research-dossier.md, capability-map.md, agent-topology.md, roadmap.md, qc-matrix.md, readiness-report.md.",
      command === "goal"
        ? "6. If available, run the managed bridge cycle now: python3 ~/.claude/skills/stella/scripts/stella_service_factory.py autopilot --project <workspace> --goal <objective> --max-cycles 12 --pretty."
        : "6. This is not goal mode. Do not run managed autopilot from analysis/probe/audit mode unless the user explicitly asks to start a Factory goal run.",
      "7. Map required roles before implementation: product/research, architect, worker, reviewer, critic, Probe, security, release, final-audit. Record missing capabilities instead of pretending they exist.",
      "8. Preserve existing working features and patch only the surfaces needed for the current milestone.",
      "9. Execute commands safely, summarize evidence, and avoid destructive operations.",
      "10. Implement file changes when needed, then run focused verification.",
      "11. If the work touches agent execution, preview, updater, packaging, or permissions, run an extra Probe/Security/Release check.",
      "12. Record changed assumptions, decisions, commands, and evidence in SOT when project behavior or workflow changes.",
      "13. Stop only when done_when is satisfied, readiness is pilot_ready/full_ready, or a concrete blocker is proven. Do not stop only because one feature was implemented.",
      "",
      "Hard safety gates:",
      "- No DB deletion, user-data deletion, production deploy/submission, external publication, credential disclosure, or paid action without explicit approval.",
      "- Do not overwrite unrelated user changes.",
      "- Do not replace the app architecture unless the existing path is proven impossible.",
    ].join("\n");
  }

  const intro = commandIntroKo(command);
  return [
    `${intro}`,
    "",
    `목표: ${objective}`,
    "",
    "필수 workflow:",
    "1. 현재 상태 파악: 실제 코드, 실행 방식, 설치본/패키지 상태, SOT, 변경 파일, 현재 기능, 위험, 검증 기준선을 확인합니다.",
    "2. 목표 달성 계획: 현재 상태와 목표 사이의 gap을 설명하고 role, owned paths, done_when, verification, rollback/retry 기준이 있는 task packet으로 분해합니다.",
    "3. 실행/검증: 좁게 나눈 task packet을 구현하고 통합, 검증을 실행하며 증거가 실패하면 다시 계획으로 돌아갑니다.",
    "4. 이것이 단일 기능 티켓인지 Service Factory run인지 판정합니다. 제품 단위, 장기 목표, 자율 개발, 기존 서비스 고도화 목표는 Service Factory run입니다.",
    "5. Service Factory run이면 SOT/service-factory-state.json과 SOT/service-factory 산출물을 생성/갱신합니다: current-state.md, development-plan.md, mission-charter.md, research-dossier.md, capability-map.md, agent-topology.md, roadmap.md, qc-matrix.md, readiness-report.md.",
    command === "goal"
      ? "6. 가능하면 지금 managed bridge cycle을 실행합니다: python3 ~/.claude/skills/stella/scripts/stella_service_factory.py autopilot --project <workspace> --goal <objective> --max-cycles 12 --pretty."
      : "6. goal 모드가 아니므로 사용자가 Factory goal run 시작을 명시하지 않은 한 managed autopilot을 실행하지 않습니다.",
    "7. 구현 전 필요한 역할을 매핑합니다: product/research, architect, worker, reviewer, critic, Probe, security, release, final-audit. 없는 역량은 있는 척하지 말고 missing_capabilities로 기록합니다.",
    "8. 기존에 동작하는 기능을 보존하고 현재 milestone에 필요한 표면만 좁게 패치합니다.",
    "9. 명령은 안전하게 실행하고 증거를 요약하며 파괴적 작업은 피합니다.",
    "10. 필요한 파일 수정을 진행한 뒤 집중 검증을 실행합니다.",
    "11. 에이전트 실행, 프리뷰, 업데이트, 패키징, 권한을 건드리면 Probe/Security/Release 검수를 추가합니다.",
    "12. 프로젝트 동작이나 작업 방식이 바뀌면 결정, 명령, 증거를 SOT에 기록합니다.",
    "13. done_when이 충족되거나 readiness가 pilot_ready/full_ready에 도달하거나 구체적인 차단 사유가 증명될 때만 멈춥니다. 단일 기능을 하나 구현했다는 이유만으로 종료하지 않습니다.",
    "",
    "강제 안전 게이트:",
    "- 명시 승인 없이 DB 삭제, 사용자 데이터 삭제, 프로덕션 배포/제출, 외부 게시, 자격증명 노출, 유료 결제를 하지 않습니다.",
    "- 관련 없는 사용자 변경을 덮어쓰지 않습니다.",
    "- 기존 경로가 불가능하다는 근거 없이 앱 구조를 교체하지 않습니다.",
  ].join("\n");
}

export function formatStellaFactoryPreflightBlock(
  preflight: StellaFactoryPreflight,
  language: Language,
) {
  const { analysis, probe, error } = preflight;
  const lines: string[] = [];
  if (language === "en") {
    lines.push("Atelier Stella Factory preflight evidence:");
    if (analysis) {
      lines.push(`- Workspace root: ${analysis.root}`);
      lines.push(`- Project: ${analysis.project_name || "(unknown)"}`);
      lines.push(`- Stack: ${analysis.frameworks.length ? analysis.frameworks.join(", ") : "(not detected)"}`);
      lines.push(`- Git: ${analysis.is_git ? "yes" : "no"}; dirty paths: ${analysis.dirty_files.length}`);
      lines.push(`- Verification candidates: ${analysis.verification_commands.join(" | ") || "(none detected)"}`);
      const missingSot = analysis.sot_files.filter((item) => !item.exists).map((item) => item.path);
      lines.push(`- SOT: ${missingSot.length ? `missing ${missingSot.join(", ")}` : "present"}`);
      if (analysis.risk_flags.length) lines.push(`- Risk flags: ${analysis.risk_flags.join(" | ")}`);
    }
    if (preflight.bootstrap) {
      const bootstrap = preflight.bootstrap;
      const created = bootstrap.artifacts.filter((item) => item.created).length;
      const existing = bootstrap.artifacts.length - created;
      lines.push(`- Factory state: ${bootstrap.created_state ? "created" : "resumed"} ${bootstrap.state_path}`);
      lines.push(`- Factory artifacts: ${created} created, ${existing} existing; readiness ${bootstrap.readiness}`);
      if (bootstrap.next_actions.length) lines.push(`- Factory next: ${bootstrap.next_actions.slice(0, 2).join(" | ")}`);
    }
    if (preflight.autopilot) {
      const autopilot = preflight.autopilot;
      const verdict = factoryAutopilotVerdict(autopilot);
      lines.push(`- Managed autopilot: ${autopilot.ran ? (autopilot.success ? "completed" : "needs review") : "unavailable"}${verdict ? `; verdict ${verdict}` : ""}`);
      lines.push(`- Managed autopilot runtime: ${Math.round(autopilot.duration_ms / 1000)}s; bridge: ${autopilot.bridge_path || "(missing)"}`);
      if (autopilot.next_actions.length) lines.push(`- Managed autopilot next: ${autopilot.next_actions.slice(0, 2).join(" | ")}`);
    }
    if (probe) {
      lines.push(`- Probe profile: ${probe.profile}; result: ${probe.success ? "pass" : "fail"}`);
      probe.commands.forEach((cmd) => {
        lines.push(`  - ${cmd.success ? "PASS" : "FAIL"} ${cmd.command} (${Math.round(cmd.duration_ms / 1000)}s)`);
      });
    }
    if (error) lines.push(`- Preflight error: ${error}`);
  } else {
    lines.push("Atelier Stella Factory 사전 증거:");
    if (analysis) {
      lines.push(`- 작업 루트: ${analysis.root}`);
      lines.push(`- 프로젝트: ${analysis.project_name || "(알 수 없음)"}`);
      lines.push(`- 스택: ${analysis.frameworks.length ? analysis.frameworks.join(", ") : "(감지 안됨)"}`);
      lines.push(`- Git: ${analysis.is_git ? "사용" : "미사용"}; 변경 경로: ${analysis.dirty_files.length}`);
      lines.push(`- 검증 후보: ${analysis.verification_commands.join(" | ") || "(감지 안됨)"}`);
      const missingSot = analysis.sot_files.filter((item) => !item.exists).map((item) => item.path);
      lines.push(`- SOT: ${missingSot.length ? `${missingSot.join(", ")} 누락` : "존재"}`);
      if (analysis.risk_flags.length) lines.push(`- 위험 신호: ${analysis.risk_flags.join(" | ")}`);
    }
    if (preflight.bootstrap) {
      const bootstrap = preflight.bootstrap;
      const created = bootstrap.artifacts.filter((item) => item.created).length;
      const existing = bootstrap.artifacts.length - created;
      lines.push(`- Factory 상태: ${bootstrap.created_state ? "생성" : "재개"} ${bootstrap.state_path}`);
      lines.push(`- Factory 산출물: ${created}개 생성, ${existing}개 기존; readiness ${bootstrap.readiness}`);
      if (bootstrap.next_actions.length) lines.push(`- Factory 다음 작업: ${bootstrap.next_actions.slice(0, 2).join(" | ")}`);
    }
    if (preflight.autopilot) {
      const autopilot = preflight.autopilot;
      const verdict = factoryAutopilotVerdict(autopilot);
      lines.push(`- Managed autopilot: ${autopilot.ran ? (autopilot.success ? "완료" : "검토 필요") : "사용 불가"}${verdict ? `; verdict ${verdict}` : ""}`);
      lines.push(`- Managed autopilot 실행: ${Math.round(autopilot.duration_ms / 1000)}초; bridge: ${autopilot.bridge_path || "(없음)"}`);
      if (autopilot.next_actions.length) lines.push(`- Managed autopilot 다음 작업: ${autopilot.next_actions.slice(0, 2).join(" | ")}`);
    }
    if (probe) {
      lines.push(`- Probe 프로필: ${probe.profile}; 결과: ${probe.success ? "통과" : "실패"}`);
      probe.commands.forEach((cmd) => {
        lines.push(`  - ${cmd.success ? "PASS" : "FAIL"} ${cmd.command} (${Math.round(cmd.duration_ms / 1000)}s)`);
      });
    }
    if (error) lines.push(`- 사전 증거 수집 오류: ${error}`);
  }
  return lines.join("\n");
}

function factoryAutopilotVerdict(result: StellaFactoryAutopilotResult) {
  const summary = result.summary as {
    assessment?: { verdict?: unknown };
    steps?: Array<{ json?: { verdict?: unknown; assessment?: { verdict?: unknown } } }>;
  } | null | undefined;
  const direct = summary?.assessment?.verdict;
  if (typeof direct === "string") return direct;
  const steps = Array.isArray(summary?.steps) ? summary?.steps : [];
  for (const step of [...steps].reverse()) {
    const verdict = step?.json?.verdict || step?.json?.assessment?.verdict;
    if (typeof verdict === "string") return verdict;
  }
  return null;
}

function factoryTitle(command: StellaFactoryCommand, body: string, language: Language) {
  const prefix = language === "en"
    ? ({ goal: "Goal", analyze: "Analyze", probe: "Probe", audit: "Audit" } as const)[command]
    : ({ goal: "목표", analyze: "분석", probe: "검증", audit: "감사" } as const)[command];
  return `${prefix}: ${body}`.slice(0, 48);
}

function commandIntroKo(command: StellaFactoryCommand) {
  switch (command) {
    case "analyze":
      return "Stella Factory 분석 모드입니다. 현재 앱의 실제 코드, 실행 방식, 기능 완성도, SOT/문서/테스트 상태를 먼저 분석하세요.";
    case "probe":
      return "Stella Factory Probe 모드입니다. 구현 결과가 실제로 동작하는지 증거 중심으로 검증하세요.";
    case "audit":
      return "Stella Factory 최종감사 모드입니다. 보안, 권한, 배포준비, 업데이트, 회귀 위험을 점검하세요.";
    default:
      return "Stella Factory Goal 모드입니다. 자연어 목표를 개발 작업으로 바꾸고 완료까지 진행하세요.";
  }
}

function commandIntroEn(command: StellaFactoryCommand) {
  switch (command) {
    case "analyze":
      return "Stella Factory analysis mode. Analyze the real code, run method, feature completeness, SOT/docs/tests status first.";
    case "probe":
      return "Stella Factory Probe mode. Verify that the implementation really works with evidence.";
    case "audit":
      return "Stella Factory final audit mode. Review security, permissions, release readiness, updater, and regression risk.";
    default:
      return "Stella Factory Goal mode. Convert the natural-language objective into development work and carry it to completion.";
  }
}
