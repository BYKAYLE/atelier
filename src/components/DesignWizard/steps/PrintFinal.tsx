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
 * Stage 4 — Print Final (outputType === "print").
 * Layout markdown → 인쇄용 HTML (bleed + Print CSS) 정밀화.
 */
export default function PrintFinal({ project, onChange, onPrev, onNext, onPreview, dark }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const philLabel = (id: Philosophy) => PHILOSOPHIES.find((p) => p.id === id)?.label ?? id;
  const selected = project.selectedWireframe;

  useAutoTrigger(
    !!project.autoMode &&
      !!project.print?.layoutMd &&
      !!selected &&
      !project.print?.finalPath &&
      !busy,
    () => generate(),
  );
  useAutoAdvance(
    !!project.autoMode && !!project.print?.finalPath && !busy,
    onNext,
  );

  async function generate() {
    if (!project.print?.layoutMd) {
      setError("Stage 3 layout이 비어 있습니다.");
      return;
    }
    if (!selected) {
      setError("선택된 학파가 없습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sysPrompt = await readDesignResource("prompts/print/04-final.md");
      const philosophyDoc = await readDesignResource(`philosophies/${phiToFile(selected)}.md`);
      const brand = await readDesignResource("brand/bykayle.md");
      const tailwindBase = await readDesignResource("component-library/00-tailwind-base.md");

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
        "## COMPONENT_LIBRARY",
        tailwindBase,
        "",
        "## PRINT_LAYOUT_MD",
        project.print.layoutMd,
        "",
        "위 입력으로 Print final HTML을 출력하세요. mm 사이즈를 px로 정확히 환산하고 bleed/Print CSS 포함.",
      ].join("\n");

      const html = await askDesignClaude(sysPrompt, userInput);
      const cleaned = stripHtmlFence(html);
      validateHtmlOutput(cleaned);
      const savedPath = await saveDesignArtifact(
        project.projectId,
        `print/${selected}-final.html`,
        cleaned,
      );
      onChange({
        print: {
          ...project.print,
          finalPath: savedPath,
          createdAt: Date.now(),
        },
      });
    } catch (e) {
      setError(`Final 생성 실패: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function previewFinal() {
    if (!project.print?.finalPath) return;
    onPreview(convertFileSrc(project.print.finalPath));
  }

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442";
  const ready = !!project.print?.layoutMd && !!selected;
  const generated = !!project.print?.finalPath;

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="design-print-final">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Stage 4 · Print</div>
        <div className={`text-[14px] font-medium ${ink}`}>Final — 인쇄용 정밀화</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          Layout 기반으로 mm 사이즈·bleed·Print CSS를 적용한 인쇄용 HTML 생성.
        </div>
      </div>

      <div className={`p-3 rounded-[8px] border ${surface}`}>
        <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-2`}>입력 layout</div>
        {project.print?.layoutMd ? (
          <div className="flex flex-col gap-1">
            <div className={`text-[12px] font-medium ${ink}`}>
              {selected ? philLabel(selected) : "—"} · 사이즈·grid·위계 정의 완료
            </div>
            <div className={`text-[10px] ${subtle}`}>{project.print.layoutMd.length}자</div>
          </div>
        ) : (
          <div className={`text-[11px] ${subtle}`}>
            Stage 3에서 layout을 먼저 생성해주세요.
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
          data-testid="design-print-final-generate"
        >
          {busy ? "Final 생성 중…" : generated ? "재생성" : "Final 생성"}
        </button>
        {generated && !busy && (
          <button
            type="button"
            onClick={previewFinal}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-print-final-preview"
          >
            Preview ↗
          </button>
        )}
        <button
          type="button"
          onClick={onPrev}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
        >
          ← Layout
        </button>
        {generated && !busy && (
          <button
            type="button"
            onClick={onNext}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-print-final-next"
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
        <div className={`p-3 rounded-[8px] border ${surface}`} data-testid="design-print-final-result">
          <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-1`}>산출물</div>
          <div className={`text-[12px] ${ink} mb-1`}>인쇄용 HTML 저장 완료</div>
          <div className={`text-[10px] font-mono truncate ${subtle}`} title={project.print?.finalPath ?? ""}>
            {(project.print?.finalPath ?? "").split("/").slice(-3).join("/")}
          </div>
        </div>
      )}
    </div>
  );
}

