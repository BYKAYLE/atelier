import type { AgentProvider, StellaProbeResult, StellaProjectAnalysis } from "./tauri";

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
  probe?: StellaProbeResult | null;
  error?: string | null;
};

type Language = "ko" | "en";

const SOT_PATHS = [
  "SOT/L1-project-summary.md",
  "SOT/autonomous-workspace-contract.md",
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
  if (!match) return null;
  const command = match[1].toLowerCase() as StellaFactoryCommand;
  const body = (match[2] || "").trim();
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
  if (!/^\/(goal|analyze|probe|audit)\b/i.test(trimmed)) return null;
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
      "1. Convert the objective into a concrete development task packet.",
      "2. Inspect the current project structure, run method, docs, tests, and SOT before changing behavior.",
      "3. Preserve existing working features and patch only the surfaces needed for the objective.",
      "4. Execute commands safely, summarize evidence, and avoid destructive operations.",
      "5. Implement file changes when needed, then run focused verification.",
      "6. If the work touches agent execution, preview, updater, packaging, or permissions, run an extra Probe/Security/Release check.",
      "7. Record changed assumptions, decisions, commands, and evidence in SOT when project behavior or workflow changes.",
      "8. Stop only when done_when is satisfied or a concrete blocker is proven.",
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
    "1. 목표를 구체적인 개발 작업 패킷으로 변환합니다.",
    "2. 동작 변경 전 현재 프로젝트 구조, 실행 방법, 문서, 테스트, SOT를 확인합니다.",
    "3. 기존에 동작하는 기능을 보존하고 목표에 필요한 표면만 좁게 패치합니다.",
    "4. 명령은 안전하게 실행하고 증거를 요약하며 파괴적 작업은 피합니다.",
    "5. 필요한 파일 수정을 진행한 뒤 집중 검증을 실행합니다.",
    "6. 에이전트 실행, 프리뷰, 업데이트, 패키징, 권한을 건드리면 Probe/Security/Release 검수를 추가합니다.",
    "7. 프로젝트 동작이나 작업 방식이 바뀌면 결정, 명령, 증거를 SOT에 기록합니다.",
    "8. done_when이 충족되거나 구체적인 차단 사유가 증명될 때만 멈춥니다.",
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
