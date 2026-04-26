import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { readDesignResource } from "../../../lib/tauri";
import { askDesignClaude } from "../designClaude";
import type { DesignProject } from "../useDesignProject";

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

  async function generate() {
    setBusy(true);
    setError(null);
    setProgressChars(0);
    try {
      const systemPrompt = await readDesignResource("prompts/01-brief.md");
      const result = await askDesignClaude(systemPrompt, project.briefInput);
      onChange({ brief: result });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

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
        <button
          type="button"
          onClick={generate}
          disabled={busy || !project.briefInput.trim()}
          className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white disabled:opacity-40 transition-opacity whitespace-nowrap"
          style={{ background: accent }}
          data-testid="design-brief-generate"
        >
          {busy ? `생성 중… (${progressChars} chars)` : "PRD 초안 생성"}
        </button>
        {project.brief && !busy && (
          <>
            <button
              type="button"
              onClick={onNext}
              className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border transition-colors whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
              data-testid="design-brief-next"
            >
              다음 단계 →
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
