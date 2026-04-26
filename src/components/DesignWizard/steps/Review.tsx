import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  readDesignResource,
  saveDesignArtifact,
  readTextFile,
  openDesignProjectDir,
  exportDesignProjectZip,
} from "../../../lib/tauri";
import { askDesignClaude } from "../designClaude";
import { PHILOSOPHIES, type DesignProject, type Philosophy } from "../useDesignProject";
import { phiToFile, stripCodeFence, stripHtmlFence } from "../utils";
import { useAutoTrigger } from "../useAutoStage";

interface Props {
  project: DesignProject;
  onChange: (patch: Partial<DesignProject>) => void;
  onPrev: () => void;
  dark: boolean;
}

/**
 * Stage 6 — Review.
 * 모든 산출물(brief, system tokens, wireframe, hi-fi, motion)을 LLM이 종합 평가.
 * 점수·강점·이슈·개선안을 markdown 보고서로 출력. 프로젝트 폴더 열기 버튼 제공.
 */
export default function Review({ project, onChange, onPrev, dark }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [zipPath, setZipPath] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [iterHistory, setIterHistory] = useState<{ round: number; before: number; after: number }[]>([]);

  const philLabel = (id: Philosophy) => PHILOSOPHIES.find((p) => p.id === id)?.label ?? id;

  // Auto pipeline 종료 단계: review 자동 generate (단발 트리거)
  useAutoTrigger(
    !!project.autoMode &&
      !!project.brief &&
      !!project.selectedWireframe &&
      !project.review &&
      !busy,
    () => generate(),
  );

  // review 완료되면 autoMode 자동 해제 (재진입 방지 + 사용자에게 컨트롤 반환)
  // useAutoAdvance와 다르게 onChange 호출이라 별도 useEffect 유지.
  useEffect(() => {
    if (project.autoMode && project.review && !busy) {
      onChange({ autoMode: false });
    }
  }, [project.autoMode, project.review, busy, onChange]);

  async function generate() {
    if (!project.brief) {
      setError("Stage 1 Brief가 비어 있습니다.");
      return;
    }
    if (!project.selectedWireframe) {
      setError("Stage 3에서 학파를 선택해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const phi = project.selectedWireframe;
      const philosophyDoc = await readDesignResource(`philosophies/${phiToFile(phi)}.md`);
      const brand = await readDesignResource("brand/bykayle.md");
      const systemTokens = project.system?.content ?? "(Stage 2 미수행)";

      let userInput: string;
      let promptPath: string;

      if (project.outputType === "ci") {
        // CI 모드 — brand system + assets HTML 검토
        promptPath = "prompts/ci/06-review.md";
        const ciSystemMd = project.ci?.systemMd ?? "(Stage 3 미수행)";
        const ciAssetsHtml = project.ci?.applicationsMd
          ? await readTextFile(project.ci.applicationsMd)
          : "(Stage 4 미수행)";
        userInput = [
          "## BRIEF",
          project.brief,
          "",
          "## SYSTEM_TOKENS",
          systemTokens,
          "",
          "## SELECTED_PHILOSOPHY",
          phi,
          "",
          "## PHILOSOPHY_DOC",
          philosophyDoc,
          "",
          "## BRAND_PACK",
          brand,
          "",
          "## CI_SYSTEM_MD",
          ciSystemMd,
          "",
          "## CI_ASSETS_HTML",
          ciAssetsHtml,
          "",
          "위 입력으로 CI Review markdown 보고서를 출력하세요.",
        ].join("\n");
      } else if (project.outputType === "app") {
        promptPath = "prompts/app/06-review.md";
        const appFlowMd = project.app?.flowMd ?? "(Stage 3 미수행)";
        const appScreensHtml = project.app?.screensPath
          ? await readTextFile(project.app.screensPath)
          : "(Stage 4 미수행)";
        userInput = [
          "## BRIEF",
          project.brief,
          "",
          "## SYSTEM_TOKENS",
          systemTokens,
          "",
          "## SELECTED_PHILOSOPHY",
          phi,
          "",
          "## PHILOSOPHY_DOC",
          philosophyDoc,
          "",
          "## BRAND_PACK",
          brand,
          "",
          "## APP_FLOW_MD",
          appFlowMd,
          "",
          "## APP_SCREENS_HTML",
          appScreensHtml,
          "",
          "위 입력으로 App Review markdown 보고서를 출력하세요.",
        ].join("\n");
      } else if (project.outputType === "print") {
        promptPath = "prompts/print/06-review.md";
        const printLayoutMd = project.print?.layoutMd ?? "(Stage 3 미수행)";
        const printFinalHtml = project.print?.finalPath
          ? await readTextFile(project.print.finalPath)
          : "(Stage 4 미수행)";
        userInput = [
          "## BRIEF",
          project.brief,
          "",
          "## SYSTEM_TOKENS",
          systemTokens,
          "",
          "## SELECTED_PHILOSOPHY",
          phi,
          "",
          "## PHILOSOPHY_DOC",
          philosophyDoc,
          "",
          "## BRAND_PACK",
          brand,
          "",
          "## PRINT_LAYOUT_MD",
          printLayoutMd,
          "",
          "## PRINT_FINAL_HTML",
          printFinalHtml,
          "",
          "위 입력으로 Print Review markdown 보고서를 출력하세요.",
        ].join("\n");
      } else {
        // Web 모드 — 기존 흐름
        promptPath = "prompts/06-review.md";
        const wireframe = project.wireframes[phi];
        const wireframeHtml = wireframe ? await readTextFile(wireframe.path) : "(없음)";
        const hifiHtml = project.hifi ? await readTextFile(project.hifi.path) : "(Stage 4 미수행)";
        const motionHtml = project.motion ? await readTextFile(project.motion.path) : "(Stage 5 미수행)";
        userInput = [
          "## BRIEF",
          project.brief,
          "",
          "## SYSTEM_TOKENS",
          systemTokens,
          "",
          "## SELECTED_PHILOSOPHY",
          phi,
          "",
          "## PHILOSOPHY_DOC",
          philosophyDoc,
          "",
          "## BRAND_PACK",
          brand,
          "",
          "## WIREFRAME_HTML",
          wireframeHtml,
          "",
          "## HIFI_HTML",
          hifiHtml,
          "",
          "## MOTION_HTML",
          motionHtml,
          "",
          "위 입력으로 Stage 6 review markdown 보고서를 출력하세요.",
        ].join("\n");
      }

      const sysPrompt = await readDesignResource(promptPath);
      const md = await askDesignClaude(sysPrompt, userInput);
      const cleaned = stripCodeFence(md);
      const score = parseScore(cleaned);
      const savedPath = await saveDesignArtifact(project.projectId, "review/report.md", cleaned);
      onChange({
        review: { content: cleaned, path: savedPath, score, createdAt: Date.now() },
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyReport() {
    if (!project.review?.content) return;
    try {
      await navigator.clipboard.writeText(project.review.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError(`복사 실패: ${String(e)}`);
    }
  }

  async function openFolder() {
    try {
      await openDesignProjectDir(project.projectId);
    } catch (e) {
      setError(`폴더 열기 실패: ${String(e)}`);
    }
  }

  async function exportZip() {
    setExporting(true);
    setError(null);
    try {
      const path = await exportDesignProjectZip(project.projectId);
      setZipPath(path);
    } catch (e) {
      setError(`ZIP 내보내기 실패: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  /** 점수 미달 자동 개선 루프 — 1라운드:
   *  1) 04-hifi-refine 프롬프트로 hi-fi 재생성 (기존 hi-fi + review 보고서 입력)
   *  2) 같은 review 프롬프트로 재평가
   *  3) 점수 변화 history에 기록
   *  반복 실행 가능. 최대 3회 권장 (수동 클릭).
   */
  async function refineAndReview() {
    if (!project.review || !project.hifi || !project.brief || !project.selectedWireframe) {
      setError("개선 루프는 Stage 4 hi-fi + Stage 6 review가 모두 있어야 합니다.");
      return;
    }
    const beforeScore = project.review.score ?? 0;
    setRefining(true);
    setError(null);
    try {
      const phi = project.hifi.basePhilosophy;
      // 1) hi-fi 재생성
      const refinePrompt = await readDesignResource("prompts/04-hifi-refine.md");
      const philosophyDoc = await readDesignResource(`philosophies/${phiToFile(phi)}.md`);
      const brand = await readDesignResource("brand/bykayle.md");
      const previousHifi = await readTextFile(project.hifi.path);
      const refineInput = [
        "## BRIEF",
        project.brief,
        "",
        "## PHILOSOPHY_NAME",
        phi,
        "",
        "## PHILOSOPHY_DOC",
        philosophyDoc,
        "",
        "## BRAND_PACK",
        brand,
        "",
        "## PREVIOUS_HIFI_HTML",
        previousHifi,
        "",
        "## REVIEW_REPORT",
        project.review.content,
        "",
        "위 입력으로 review 피드백을 반영한 새 hi-fi HTML을 출력하세요.",
      ].join("\n");
      const newHifiHtml = await askDesignClaude(refinePrompt, refineInput);
      const cleanedHifi = stripHtmlFence(newHifiHtml);
      const hifiPath = await saveDesignArtifact(
        project.projectId,
        `hifi/${phi}.html`,
        cleanedHifi,
      );
      onChange({
        hifi: { path: hifiPath, basePhilosophy: phi, createdAt: Date.now() },
      });

      // 2) 재평가 (같은 review 프롬프트, 새 hi-fi 사용)
      const reviewPrompt = await readDesignResource("prompts/06-review.md");
      const wireframe = project.wireframes[phi];
      const wireframeHtml = wireframe ? await readTextFile(wireframe.path) : "(없음)";
      const motionHtml = project.motion
        ? await readTextFile(project.motion.path)
        : "(Stage 5 미수행)";
      const systemTokens = project.system?.content ?? "(Stage 2 미수행)";
      const reviewInput = [
        "## BRIEF",
        project.brief,
        "",
        "## SYSTEM_TOKENS",
        systemTokens,
        "",
        "## SELECTED_PHILOSOPHY",
        phi,
        "",
        "## PHILOSOPHY_DOC",
        philosophyDoc,
        "",
        "## BRAND_PACK",
        brand,
        "",
        "## WIREFRAME_HTML",
        wireframeHtml,
        "",
        "## HIFI_HTML",
        cleanedHifi,
        "",
        "## MOTION_HTML",
        motionHtml,
        "",
        "위 입력으로 Stage 6 review markdown 보고서를 출력하세요.",
      ].join("\n");
      const newReviewMd = await askDesignClaude(reviewPrompt, reviewInput);
      const cleanedReview = stripCodeFence(newReviewMd);
      const newScore = parseScore(cleanedReview);
      const reviewPath = await saveDesignArtifact(
        project.projectId,
        "review/report.md",
        cleanedReview,
      );
      onChange({
        review: {
          content: cleanedReview,
          path: reviewPath,
          score: newScore,
          createdAt: Date.now(),
        },
      });

      // 3) history 기록
      const round = iterHistory.length + 1;
      setIterHistory((prev) => [
        ...prev,
        { round, before: beforeScore, after: newScore ?? 0 },
      ]);
    } catch (e) {
      setError(`개선 루프 실패: ${String(e)}`);
    } finally {
      setRefining(false);
    }
  }

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442";

  const ready = !!project.brief && !!project.selectedWireframe;
  const score = project.review?.score;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Stage 6</div>
        <div className={`text-[14px] font-medium ${ink}`}>Review — 평가 / Export</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          모든 산출물을 종합 평가하고 점수·이슈·개선안을 보고서로 출력합니다. 프로젝트 폴더에 review/report.md로 저장됩니다.
        </div>
      </div>

      <div className={`p-3 rounded-[8px] border ${surface}`}>
        <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-2`}>입력 산출물</div>
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          <span className={subtle}>Brief</span>
          <span className={ink}>{project.brief ? "✓" : "—"}</span>
          <span className={subtle}>System tokens</span>
          <span className={ink}>{project.system ? "✓" : "—"}</span>
          <span className={subtle}>선택 학파</span>
          <span className={ink}>{project.selectedWireframe ? philLabel(project.selectedWireframe) : "—"}</span>
          <span className={subtle}>Hi-fi</span>
          <span className={ink}>{project.hifi ? "✓" : "—"}</span>
          <span className={subtle}>Motion</span>
          <span className={ink}>{project.motion ? "✓" : "—"}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy || !ready}
          className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white disabled:opacity-40 whitespace-nowrap"
          style={{ background: accent }}
          data-testid="design-review-generate"
        >
          {busy ? "평가 중…" : project.review ? "재평가" : "평가 생성"}
        </button>
        <button
          type="button"
          onClick={openFolder}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
          data-testid="design-review-open-folder"
        >
          📂 프로젝트 폴더
        </button>
        <button
          type="button"
          onClick={exportZip}
          disabled={exporting}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap disabled:opacity-40 ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
          data-testid="design-review-export-zip"
          title="프로젝트 전체를 ~/Downloads에 zip으로 내보내고 Finder에서 표시"
        >
          {exporting ? "내보내는 중…" : "📦 ZIP 내보내기"}
        </button>
        <button
          type="button"
          onClick={onPrev}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
        >
          ← Motion
        </button>
        {project.review && !busy && (
          <button
            type="button"
            onClick={copyReport}
            title={copied ? "복사됨" : "보고서 markdown 복사"}
            aria-label="보고서 복사"
            className={`h-9 w-9 inline-flex items-center justify-center rounded-[6px] border transition-colors ${
              copied
                ? "border-emerald-500/40 text-emerald-500"
                : dark
                  ? "border-dline text-dsub hover:text-dink hover:bg-[#2a2a28]"
                  : "border-line text-sub hover:text-ink hover:bg-muted"
            }`}
            data-testid="design-review-copy"
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
        )}
      </div>

      {!ready && (
        <div className={`text-[11px] p-2 rounded-[4px] border ${surface} ${subtle}`}>
          Stage 1 Brief + Stage 3 wireframe 선택은 필수입니다. (System / Hi-fi / Motion은 선택)
        </div>
      )}

      {zipPath && (
        <div
          className={`text-[11px] p-2 rounded-[4px] border ${surface} ${ink} flex items-center gap-2`}
          data-testid="design-review-zip-result"
        >
          <span style={{ color: accent }}>📦</span>
          <span className="font-medium">ZIP 생성 완료 — Finder에서 표시됨</span>
          <span className={`font-mono truncate flex-1 min-w-0 ${subtle}`} title={zipPath}>
            {zipPath.split("/").slice(-2).join("/")}
          </span>
        </div>
      )}

      {error && (
        <div className="text-[11px] text-red-500 p-2 rounded-[4px] border border-red-300/40 bg-red-50/10">
          {error}
        </div>
      )}

      {typeof score === "number" && (
        <div
          className={`p-3 rounded-[8px] border flex items-center gap-3 ${surface}`}
          data-testid="design-review-score"
        >
          <div
            className={`text-[36px] font-bold tabular-nums`}
            style={{ color: score >= 85 ? "#6b8e6e" : score >= 70 ? accent : "#b34a3a" }}
          >
            {score}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className={`text-[12px] font-medium ${ink}`}>
              {score >= 85 ? "Pass" : score >= 70 ? "Conditional" : "Fail"}
            </div>
            <div className={`text-[10px] ${subtle}`}>종합 점수 (LLM 평가)</div>
          </div>
          {score < 85 && project.hifi && (
            <button
              type="button"
              onClick={refineAndReview}
              disabled={refining || iterHistory.length >= 3}
              title={
                iterHistory.length >= 3
                  ? "자동 개선 최대 3회까지"
                  : "review 피드백을 hi-fi에 반영하고 재평가합니다"
              }
              className={`h-9 px-3 rounded-[6px] text-[11px] font-medium border whitespace-nowrap disabled:opacity-40 ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
              data-testid="design-review-refine"
            >
              {refining ? "개선 중…" : `🔁 개선 + 재평가${iterHistory.length > 0 ? ` (${iterHistory.length}/3)` : ""}`}
            </button>
          )}
        </div>
      )}

      {iterHistory.length > 0 && (
        <div
          className={`p-2.5 rounded-[6px] border ${surface}`}
          data-testid="design-review-iter-history"
        >
          <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-2`}>개선 루프 기록</div>
          <div className="flex flex-col gap-1">
            {iterHistory.map((h) => {
              const delta = h.after - h.before;
              return (
                <div key={h.round} className="flex items-center gap-2 text-[11px]">
                  <span className={`${subtle} font-mono w-12`}>R{h.round}</span>
                  <span className={`tabular-nums ${ink}`}>{h.before}</span>
                  <span className={subtle}>→</span>
                  <span
                    className={`tabular-nums font-medium`}
                    style={{ color: h.after >= 85 ? "#6b8e6e" : h.after >= 70 ? accent : "#b34a3a" }}
                  >
                    {h.after}
                  </span>
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: delta > 0 ? "#6b8e6e" : delta < 0 ? "#b34a3a" : subtle }}
                  >
                    ({delta > 0 ? "+" : ""}
                    {delta})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {project.review && (
        <div
          className={`mt-2 p-3 rounded-[8px] border overflow-auto ${surface} ${ink}`}
          style={{ maxHeight: "60vh", fontSize: 12, lineHeight: 1.55 }}
          data-testid="design-review-result"
        >
          <div className="atelier-markdown">
            <ReactMarkdown>{project.review.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * "85/100" 또는 "**85/100**" 패턴에서 첫 번째 점수 파싱.
 * 평가 보고서 § 1. 종합 점수 첫 줄에 등장하는 형식.
 */
function parseScore(md: string): number | undefined {
  const m = md.match(/(\d{1,3})\s*\/\s*100/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n) || n < 0 || n > 100) return undefined;
  return n;
}
