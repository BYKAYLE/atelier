import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { readDesignResource } from "../../../lib/tauri";
import { askDesignClaude } from "../designClaude";
import type {
  DesignProject,
  OutputType,
  BriefQuestion,
  BriefAnswers,
} from "../useDesignProject";
import { OUTPUT_TYPES } from "../useDesignProject";
import BriefQuestions from "../BriefQuestions";
import { stripJsonFence } from "../utils";

interface Props {
  project: DesignProject;
  onChange: (patch: Partial<DesignProject>) => void;
  onNext: () => void;
  dark: boolean;
}

/**
 * Stage 1 — Brief.
 * 사용자 자연어 → atelier가 brief system prompt 조립 → claude PTY 호출 → PRD 초안 마크다운.
 * 결과는 프로젝트 상태에 저장되어 다음 단계(Wireframe)에서 입력으로 사용.
 */
export default function Brief({ project, onChange, onNext, dark }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressChars, setProgressChars] = useState(0);
  const [copied, setCopied] = useState(false);
  const [questionsBusy, setQuestionsBusy] = useState(false);
  const autoQuestionsTriggered = useRef(false);
  const autoBriefTriggered = useRef(false);
  const autoAnswerFilled = useRef(false);

  async function copyBrief() {
    if (!project.brief) return;
    try {
      await navigator.clipboard.writeText(project.brief);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError(`복사 실패: ${String(e)}`);
    }
  }

  /** Stage 1A — 명확화 질문 생성 */
  async function generateQuestions() {
    if (!project.briefInput.trim()) return;
    setQuestionsBusy(true);
    setError(null);
    try {
      const sysPrompt = await readDesignResource("prompts/01-brief-questions.md");
      const axesPath =
        project.outputType === "ci"
          ? "decision-axes/ci.md"
          : project.outputType === "app"
            ? "decision-axes/app.md"
            : project.outputType === "print"
              ? "decision-axes/print.md"
              : "decision-axes/web.md";
      const decisionAxes = await readDesignResource(axesPath);
      const userInput = [
        "## BRIEF_INPUT",
        project.briefInput,
        "",
        "## OUTPUT_TYPE",
        project.outputType,
        "",
        "## DECISION_AXES",
        decisionAxes,
      ].join("\n");
      const raw = await askDesignClaude(sysPrompt, userInput);
      const cleaned = stripJsonFence(raw);
      const parsed = JSON.parse(cleaned) as { questions: BriefQuestion[] };
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new Error("질문 생성 결과가 비어 있습니다");
      }
      onChange({ briefQuestions: parsed.questions, briefAnswers: {} });
    } catch (e) {
      setError(`질문 생성 실패: ${String(e)}`);
    } finally {
      setQuestionsBusy(false);
    }
  }

  /** Stage 1B — 답변 + briefInput 합쳐 PRD 생성 */
  async function generate() {
    setBusy(true);
    setError(null);
    setProgressChars(0);
    try {
      const systemPrompt = await readDesignResource("prompts/01-brief.md");
      const answersBlock = formatAnswers(project.briefQuestions, project.briefAnswers);
      const userInput = answersBlock
        ? [
            "## ORIGINAL_BRIEF",
            project.briefInput,
            "",
            "## CLARIFICATION_ANSWERS",
            answersBlock,
            "",
            "## OUTPUT_TYPE",
            project.outputType,
            "",
            "위 입력으로 PRD를 작성하세요. 답변 내용을 PRD 본문에 자연스럽게 통합하세요.",
          ].join("\n")
        : project.briefInput;
      const result = await askDesignClaude(systemPrompt, userInput);
      onChange({ brief: result });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** 답변 한 항목 갱신 */
  function setAnswer(id: string, value: string | string[]) {
    const next: BriefAnswers = { ...(project.briefAnswers ?? {}), [id]: value };
    onChange({ briefAnswers: next });
  }

  // 자동 모드 1A: briefInput만 있고 questions 없으면 자동 생성
  useEffect(() => {
    if (
      project.autoMode &&
      project.briefInput.trim() &&
      !project.briefQuestions &&
      !questionsBusy &&
      !autoQuestionsTriggered.current
    ) {
      autoQuestionsTriggered.current = true;
      generateQuestions();
    }
  }, [project.autoMode, project.briefInput, project.briefQuestions, questionsBusy]);

  // 자동 모드 답변 채움: 질문 생긴 직후, 모든 single/multi 질문에 "decide-for-me" 자동 선택
  useEffect(() => {
    if (
      project.autoMode &&
      project.briefQuestions &&
      project.briefQuestions.length > 0 &&
      !project.brief &&
      !autoAnswerFilled.current
    ) {
      autoAnswerFilled.current = true;
      const auto: BriefAnswers = {};
      for (const q of project.briefQuestions) {
        if (q.type === "single-choice") {
          const decide = q.options?.find((o) => o.value === "decide-for-me");
          if (decide) auto[q.id] = decide.value;
        }
        // multi-choice / free-text는 자동 모드에선 빈값 (시스템이 brief 톤 따라 결정)
      }
      onChange({ briefAnswers: { ...(project.briefAnswers ?? {}), ...auto } });
    }
  }, [project.autoMode, project.briefQuestions, project.brief, project.briefAnswers, onChange]);

  // 자동 모드 1B: 답변 채워졌으면 PRD 자동 생성
  useEffect(() => {
    if (
      project.autoMode &&
      project.briefQuestions &&
      project.briefAnswers &&
      Object.keys(project.briefAnswers).length > 0 &&
      !project.brief &&
      !busy &&
      !autoBriefTriggered.current
    ) {
      autoBriefTriggered.current = true;
      generate();
    }
  }, [project.autoMode, project.briefQuestions, project.briefAnswers, project.brief, busy]);

  // 자동 모드: brief 생성되면 다음 단계 자동 진행
  useEffect(() => {
    if (project.autoMode && project.brief && !busy) {
      const t = window.setTimeout(() => onNext(), 600);
      return () => window.clearTimeout(t);
    }
  }, [project.autoMode, project.brief, busy, onNext]);

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442"; // 바이케일 Medical Warmth

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Stage 1</div>
        <div className={`text-[14px] font-medium ${ink}`}>Brief — 무엇을 만드시나요?</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          자연어로 원하는 것을 적어주세요. 페르소나, 목표, 핵심 시나리오를 자동으로 정리합니다.
        </div>
      </div>

      {/* 출력 종류 selector — Stage 3·4가 이 값에 따라 분기 */}
      <div className="flex flex-col gap-1.5">
        <div className={`text-[10px] uppercase tracking-wider ${subtle}`}>출력 종류</div>
        <div className="grid grid-cols-2 gap-1.5">
          {OUTPUT_TYPES.map((t) => {
            const isCurrent = project.outputType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={!t.active || busy}
                onClick={() => onChange({ outputType: t.id })}
                className={`text-left p-2 rounded-[6px] border transition-colors ${surface} ${!t.active ? "opacity-30 cursor-not-allowed" : "hover:opacity-80"}`}
                style={isCurrent ? { boxShadow: `0 0 0 1.5px ${accent}` } : undefined}
                data-testid={`design-brief-output-${t.id}`}
              >
                <div className={`text-[11px] font-medium ${ink} flex items-center gap-1`}>
                  {t.label}
                  {isCurrent && <span style={{ color: accent }}>✓</span>}
                  {!t.active && <span className={`text-[9px] ${subtle}`}>예정</span>}
                  {t.beta && (
                    <span
                      className="text-[8.5px] font-medium px-1 py-0.5 rounded-[3px] uppercase tracking-wider"
                      style={{ background: "#9b9890", color: "#fff" }}
                      title="기능은 동작하나 추가 정밀화 예정"
                    >
                      베타
                    </span>
                  )}
                </div>
                <div className={`text-[9.5px] ${subtle} truncate`}>{t.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      <textarea
        value={project.briefInput}
        onChange={(e) => onChange({ briefInput: e.target.value })}
        placeholder="예: 의료진이 외래 환자의 처방전을 빠르게 검토하고 한 번에 수정·승인할 수 있는 데스크탑 도구. 보통 컴퓨터 앞에서 사용. 1분 내에 환자 1명 처리가 목표."
        rows={6}
        className={`w-full text-[12px] p-3 rounded-[6px] border resize-y ${surface} ${ink} font-mono leading-[1.5]`}
        disabled={busy}
        data-testid="design-brief-input"
      />

      <div className="flex flex-wrap gap-2">
        {/* 1단계: 질문 생성 (briefQuestions 없을 때) */}
        {!project.briefQuestions && (
          <button
            type="button"
            onClick={generateQuestions}
            disabled={questionsBusy || !project.briefInput.trim()}
            className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white disabled:opacity-40 transition-opacity whitespace-nowrap"
            style={{ background: accent }}
            data-testid="design-brief-questions"
            title="brief를 분석해 방향성을 좁히는 명확화 질문을 만듭니다"
          >
            {questionsBusy ? "질문 생성 중…" : "방향 질문 받기"}
          </button>
        )}
        {/* 2단계: PRD 생성 (briefQuestions 있고 brief 없을 때) */}
        {project.briefQuestions && !project.brief && (
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white disabled:opacity-40 transition-opacity whitespace-nowrap"
            style={{ background: accent }}
            data-testid="design-brief-generate"
          >
            {busy ? "PRD 생성 중…" : "답변 반영 PRD 생성"}
          </button>
        )}
        {/* 또는 질문 건너뛰고 바로 PRD */}
        {project.briefQuestions && !project.brief && !busy && (
          <button
            type="button"
            onClick={() => {
              onChange({ briefQuestions: undefined, briefAnswers: undefined });
            }}
            className={`h-9 px-3 rounded-[6px] text-[11px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink"}`}
            title="질문지 무시하고 brief만으로 다시 생성"
          >
            질문 다시
          </button>
        )}
        {/* PRD 생성 후 (기존 동작) */}
        {project.brief && !busy && (
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className={`h-9 px-3 rounded-[6px] text-[11px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-brief-regenerate"
            title="답변 다시 반영해 PRD 재생성"
          >
            재생성
          </button>
        )}
        {project.brief && !busy && (
          <>
            <button
              type="button"
              onClick={() => {
                onChange({ autoMode: true });
                onNext();
              }}
              className="h-9 px-4 rounded-[6px] text-[12px] font-semibold text-white whitespace-nowrap"
              style={{ background: accent }}
              title="Stage 2~6을 사용자 클릭 없이 자동 실행. Stage 3 학파 선택만 사용자 입력."
              data-testid="design-brief-auto-pipeline"
            >
              ⚡ 전체 자동 실행
            </button>
            <button
              type="button"
              onClick={onNext}
              className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border transition-colors whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
              data-testid="design-brief-next"
            >
              수동 →
            </button>
            <button
              type="button"
              onClick={copyBrief}
              title={copied ? "복사됨" : "PRD 초안 전체를 클립보드로 복사"}
              aria-label="PRD 초안 복사"
              className={`h-9 w-9 inline-flex items-center justify-center rounded-[6px] border transition-colors ${
                copied
                  ? "border-emerald-500/40 text-emerald-500"
                  : dark
                    ? "border-dline text-dsub hover:text-dink hover:bg-[#2a2a28]"
                    : "border-line text-sub hover:text-ink hover:bg-muted"
              }`}
              data-testid="design-brief-copy"
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-500 p-2 rounded-[4px] border border-red-300/40 bg-red-50/10">
          {error}
        </div>
      )}

      {/* Stage 1A 명확화 질문지 */}
      {project.briefQuestions && project.briefQuestions.length > 0 && !project.brief && (
        <div
          className={`mt-2 p-3 rounded-[8px] border ${surface}`}
          data-testid="design-brief-questions-area"
        >
          <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-3`}>
            방향 정렬 — 답변하면 PRD에 반영됩니다
          </div>
          <BriefQuestions
            questions={project.briefQuestions}
            answers={project.briefAnswers ?? {}}
            onAnswer={setAnswer}
            dark={dark}
          />
        </div>
      )}

      {project.brief && (
        <div
          className={`mt-2 p-3 rounded-[8px] border overflow-auto ${surface} ${ink} relative`}
          style={{ maxHeight: "60vh", fontSize: 12, lineHeight: 1.55 }}
          data-testid="design-brief-result"
        >
          <div className="atelier-markdown">
            <ReactMarkdown>{project.brief}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/** 답변 → PRD 프롬프트에 박을 텍스트 블록으로 변환 */
function formatAnswers(
  questions: BriefQuestion[] | undefined,
  answers: BriefAnswers | undefined,
): string {
  if (!questions || !answers || Object.keys(answers).length === 0) return "";
  const lines: string[] = [];
  for (const q of questions) {
    const a = answers[q.id];
    if (a === undefined || a === "" || (Array.isArray(a) && a.length === 0)) continue;
    let answerText = "";
    if (q.type === "free-text") {
      answerText = String(a);
    } else if (q.type === "multi-choice" && Array.isArray(a) && q.options) {
      answerText = a
        .map((v) => q.options!.find((o) => o.value === v)?.label ?? v)
        .join(", ");
    } else if (q.type === "single-choice" && q.options) {
      const opt = q.options.find((o) => o.value === a);
      answerText = opt?.label ?? String(a);
      if (a === "decide-for-me") answerText = "(시스템에 위임)";
    }
    lines.push(`- **${q.title}**: ${answerText}`);
  }
  return lines.join("\n");
}
