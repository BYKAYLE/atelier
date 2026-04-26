import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readDesignResource, saveDesignArtifact } from "../../../lib/tauri";
import { askDesignClaude, validateHtmlOutput } from "../designClaude";
import { PHILOSOPHIES, type DesignProject, type Philosophy } from "../useDesignProject";
import { phiToFile, stripHtmlFence } from "../utils";
import { useAutoTrigger, useAutoAdvance } from "../useAutoStage";

interface Props {
  project: DesignProject;
  onChange: (patch: Partial<DesignProject>) => void;
  onPrev: () => void;
  onNext: () => void;
  onPreview: (url: string) => void;
  dark: boolean;
}

/**
 * Stage 4 — CI Assets (outputType === "ci"일 때만 렌더).
 * Stage 3에서 생성한 brand system markdown을 입력으로 SVG 로고 + 응용 mockup HTML 한 페이지 생성.
 */
export default function CIAssets({ project, onChange, onPrev, onNext, onPreview, dark }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetsPath, setAssetsPath] = useState<string | null>(null);

  const philLabel = (id: Philosophy) => PHILOSOPHIES.find((p) => p.id === id)?.label ?? id;
  const selected = project.selectedWireframe;

  useAutoTrigger(
    !!project.autoMode &&
      !!project.ci?.systemMd &&
      !!selected &&
      !project.ci?.applicationsMd &&
      !busy,
    () => generate(),
  );
  useAutoAdvance(
    !!project.autoMode && !!(assetsPath || project.ci?.applicationsMd) && !busy,
    onNext,
  );

  async function generate() {
    if (!project.ci?.systemMd) {
      setError("Stage 3 brand system이 비어 있습니다. 먼저 학파를 선택해 시스템을 생성해주세요.");
      return;
    }
    if (!selected) {
      setError("선택된 학파가 없습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sysPrompt = await readDesignResource("prompts/ci/04-assets.md");
      const philosophyDoc = await readDesignResource(`philosophies/${phiToFile(selected)}.md`);
      const brand = await readDesignResource("brand/bykayle.md");

      const userInput = [
        "## BRIEF",
        project.brief ?? "",
        "",
        "## PHILOSOPHY_NAME",
        selected,
        "",
        "## PHILOSOPHY_DOC",
        philosophyDoc,
        "",
        "## BRAND_PACK",
        brand,
        "",
        "## CI_SYSTEM_MD",
        project.ci.systemMd,
        "",
        "위 입력으로 CI assets HTML 한 페이지를 출력하세요.",
      ].join("\n");

      const html = await askDesignClaude(sysPrompt, userInput);
      const cleaned = stripHtmlFence(html);
      validateHtmlOutput(cleaned);
      const savedPath = await saveDesignArtifact(
        project.projectId,
        `ci/${selected}-assets.html`,
        cleaned,
      );
      setAssetsPath(savedPath);
      onChange({
        ci: {
          ...project.ci,
          // 자산 페이지 경로를 applicationsMd에 임시 저장 (간단히 한 슬롯 재활용)
          applicationsMd: savedPath,
          createdAt: Date.now(),
        },
      });
    } catch (e) {
      setError(`자산 생성 실패: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function previewAssets() {
    const path = assetsPath ?? project.ci?.applicationsMd;
    if (!path) return;
    onPreview(convertFileSrc(path));
  }

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442";
  const ready = !!project.ci?.systemMd && !!selected;
  const generated = !!(assetsPath || project.ci?.applicationsMd);

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="design-ci-assets">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Stage 4 · CI</div>
        <div className={`text-[14px] font-medium ${ink}`}>Assets — 로고 + 응용 mockup</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          Stage 3 brand system을 기반으로 인라인 SVG 로고 4종 + 컬러 swatch + 타이포 미리보기 + 응용 mockup 4종을 단일 HTML 페이지로 생성합니다.
        </div>
      </div>

      <div className={`p-3 rounded-[8px] border ${surface}`}>
        <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-2`}>입력 brand system</div>
        {project.ci?.systemMd ? (
          <div className="flex flex-col gap-1">
            <div className={`text-[12px] font-medium ${ink}`}>
              {selected ? philLabel(selected) : "—"} · 시스템 정의 완료
            </div>
            <div className={`text-[10px] ${subtle}`}>{project.ci.systemMd.length}자</div>
          </div>
        ) : (
          <div className={`text-[11px] ${subtle}`}>
            Stage 3에서 학파를 선택해 brand system을 먼저 생성해주세요.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy || !ready}
          className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white disabled:opacity-40 whitespace-nowrap"
          style={{ background: accent }}
          data-testid="design-ci-assets-generate"
        >
          {busy ? "자산 생성 중…" : generated ? "재생성" : "자산 생성"}
        </button>
        {generated && !busy && (
          <button
            type="button"
            onClick={previewAssets}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-ci-assets-preview"
          >
            Preview ↗
          </button>
        )}
        <button
          type="button"
          onClick={onPrev}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
        >
          ← Brand System
        </button>
        {generated && !busy && (
          <button
            type="button"
            onClick={onNext}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-ci-assets-next"
          >
            Review →
          </button>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-500 p-2 rounded-[4px] border border-red-300/40 bg-red-50/10">
          {error}
        </div>
      )}

      {generated && (
        <div className={`p-3 rounded-[8px] border ${surface}`} data-testid="design-ci-assets-result">
          <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-1`}>산출물</div>
          <div className={`text-[12px] ${ink} mb-1`}>CI 자산 HTML 저장 완료 (Preview에서 확인)</div>
          <div className={`text-[10px] font-mono truncate ${subtle}`} title={assetsPath ?? project.ci?.applicationsMd ?? ""}>
            {(assetsPath ?? project.ci?.applicationsMd ?? "").split("/").slice(-3).join("/")}
          </div>
        </div>
      )}
    </div>
  );
}

