import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readDesignResource, saveDesignArtifact } from "../../../lib/tauri";
import { askDesignClaude } from "../designClaude";
import { PHILOSOPHIES, type DesignProject, type Philosophy } from "../useDesignProject";

interface Props {
  project: DesignProject;
  onChange: (patch: Partial<DesignProject>) => void;
  onPrev: () => void;
  onNext: () => void;
  onPreview: (filePath: string) => void;
  dark: boolean;
}

/**
 * Stage 4 — Hi-fi.
 * Stage 3에서 사용자가 선택한 wireframe HTML을 입력으로,
 * design-engine prompts/04-hifi.md + bykayle brand + philosophy doc + brief를 결합해
 * 정밀 hi-fi HTML 한 개를 claude --print 단발 호출로 생성.
 */
export default function HiFi({ project, onChange, onPrev, onNext, onPreview, dark }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected: Philosophy | undefined = project.selectedWireframe;
  const baseWireframe = selected ? project.wireframes[selected] : undefined;

  async function generate() {
    if (!selected || !baseWireframe) {
      setError("Stage 3에서 선택한 wireframe이 없습니다. 먼저 wireframe을 선택해주세요.");
      return;
    }
    if (!project.brief) {
      setError("Stage 1 Brief가 비어 있습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sysPrompt = await readDesignResource("prompts/04-hifi.md");
      const philosophyDoc = await readDesignResource(`philosophies/${phiToFile(selected)}.md`);
      const brand = await readDesignResource("brand/bykayle.md");

      // 선택된 wireframe HTML을 atelier 자체 read 경로로 가져와야 하지만,
      // save_design_artifact가 반환한 절대 경로는 sandbox(HOME 하위)이므로
      // read_text_file로 안전하게 읽을 수 있음. lib/tauri의 readTextFile 사용.
      const { readTextFile } = await import("../../../lib/tauri");
      const wireframeHtml = await readTextFile(baseWireframe.path);

      const userInput = [
        "## BRIEF",
        project.brief,
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
        "## SELECTED_WIREFRAME_HTML",
        wireframeHtml,
        "",
        "위 입력으로 Stage 4 hi-fi HTML 한 개를 출력하세요. mid-fi 콘텐츠는 보존하고 디테일/스타일/인터랙션을 정밀화합니다.",
      ].join("\n");

      const html = await askDesignClaude(sysPrompt, userInput);
      const cleaned = stripCodeFence(html);
      const savedPath = await saveDesignArtifact(
        project.projectId,
        `hifi/${selected}.html`,
        cleaned,
      );
      onChange({
        hifi: {
          path: savedPath,
          basePhilosophy: selected,
          createdAt: Date.now(),
        },
      });
      // 생성 직후 preview에 자동 로드
      onPreview(convertFileSrc(savedPath));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function previewHifi() {
    if (!project.hifi) return;
    onPreview(convertFileSrc(project.hifi.path));
  }

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442";

  const philLabel = selected
    ? PHILOSOPHIES.find((p) => p.id === selected)?.label ?? selected
    : "—";

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="design-hifi-panel">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Stage 4</div>
        <div className={`text-[14px] font-medium ${ink}`}>Hi-fi — 정밀 styling</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          선택한 wireframe을 bykayle brand + design tokens로 정밀 변환합니다.
          Pretendard typography scale, spacing system, shadow scale, motion curves가 적용됩니다.
        </div>
      </div>

      <div className={`p-3 rounded-[8px] border ${surface}`}>
        <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-2`}>입력 wireframe</div>
        {baseWireframe ? (
          <div className="flex flex-col gap-1">
            <div className={`text-[12px] font-medium ${ink}`}>{philLabel}</div>
            <div className={`text-[10px] font-mono truncate ${subtle}`} title={baseWireframe.path}>
              {baseWireframe.path.split("/").slice(-3).join("/")}
            </div>
          </div>
        ) : (
          <div className={`text-[11px] ${subtle}`}>
            Stage 3에서 wireframe을 선택해주세요. Stage 4는 선택된 wireframe을 입력으로 받습니다.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy || !baseWireframe || !project.brief}
          className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white disabled:opacity-40 whitespace-nowrap"
          style={{ background: accent }}
          data-testid="design-hifi-generate"
        >
          {busy ? "Hi-fi 변환 중…" : project.hifi ? "재생성" : "Hi-fi 변환"}
        </button>
        {project.hifi && !busy && (
          <button
            type="button"
            onClick={previewHifi}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-hifi-preview"
          >
            Preview ↗
          </button>
        )}
        <button
          type="button"
          onClick={onPrev}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
        >
          ← Wireframe
        </button>
        {project.hifi && !busy && (
          <button
            type="button"
            onClick={onNext}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-hifi-next"
          >
            Motion →
          </button>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-500 p-2 rounded-[4px] border border-red-300/40 bg-red-50/10">
          {error}
        </div>
      )}

      {project.hifi && (
        <div className={`p-3 rounded-[8px] border ${surface}`} data-testid="design-hifi-result">
          <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-1`}>산출물</div>
          <div className={`text-[12px] ${ink} mb-1`}>hi-fi HTML 저장 완료</div>
          <div className={`text-[10px] font-mono truncate ${subtle}`} title={project.hifi.path}>
            {project.hifi.path.split("/").slice(-3).join("/")}
          </div>
        </div>
      )}
    </div>
  );
}

function phiToFile(phi: Philosophy): string {
  switch (phi) {
    case "pentagram":
      return "01-pentagram";
    case "field-io":
      return "02-field-io";
    case "kenya-hara":
      return "03-kenya-hara";
    case "linear":
      return "04-linear";
  }
}

function stripCodeFence(s: string): string {
  const m = s.match(/```(?:html|HTML)?\s*\n([\s\S]*?)\n```/);
  if (m) return m[1];
  return s.trim();
}
