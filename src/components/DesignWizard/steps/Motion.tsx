import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readDesignResource, saveDesignArtifact, readTextFile } from "../../../lib/tauri";
import { askDesignClaude } from "../designClaude";
import { PHILOSOPHIES, type DesignProject, type Philosophy } from "../useDesignProject";

interface Props {
  project: DesignProject;
  onChange: (patch: Partial<DesignProject>) => void;
  onPrev: () => void;
  onNext: () => void;
  onPreview: (url: string) => void;
  dark: boolean;
}

/**
 * Stage 5 — Motion.
 * Stage 4 hi-fi HTML에 학파 톤에 맞는 모션·micro-interaction·scroll reveal을 입힌 단일 HTML 생성.
 * 콘텐츠/레이아웃/색/타이포는 보존, 모션 추가만.
 */
export default function Motion({ project, onChange, onPrev, onNext, onPreview, dark }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const philLabel = (id: Philosophy) => PHILOSOPHIES.find((p) => p.id === id)?.label ?? id;

  async function generate() {
    if (!project.hifi) {
      setError("Stage 4 Hi-fi HTML이 없습니다. 먼저 Hi-fi를 생성해주세요.");
      return;
    }
    if (!project.brief) {
      setError("Stage 1 Brief가 비어 있습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const phi = project.hifi.basePhilosophy;
      const sysPrompt = await readDesignResource("prompts/05-motion.md");
      const philosophyDoc = await readDesignResource(`philosophies/${phiToFile(phi)}.md`);
      const brand = await readDesignResource("brand/bykayle.md");
      const hifiHtml = await readTextFile(project.hifi.path);

      const userInput = [
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
        "## HIFI_HTML",
        hifiHtml,
        "",
        "위 입력으로 Stage 5 motion HTML 한 개를 출력하세요. 콘텐츠/레이아웃/색/타이포는 보존하고 모션만 추가합니다.",
      ].join("\n");

      const html = await askDesignClaude(sysPrompt, userInput);
      const cleaned = stripCodeFence(html);
      const savedPath = await saveDesignArtifact(
        project.projectId,
        `motion/${phi}.html`,
        cleaned,
      );
      onChange({
        motion: { path: savedPath, basePhilosophy: phi, createdAt: Date.now() },
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function previewMotion() {
    if (!project.motion) return;
    onPreview(convertFileSrc(project.motion.path));
  }

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442";

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Stage 5</div>
        <div className={`text-[14px] font-medium ${ink}`}>Motion — 애니메이션</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          Hi-fi HTML에 학파 톤에 맞는 scroll reveal · hover · micro-interaction을 입힙니다. 콘텐츠는 보존됩니다.
        </div>
      </div>

      <div className={`p-3 rounded-[8px] border ${surface}`}>
        <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-2`}>입력 hi-fi</div>
        {project.hifi ? (
          <div className="flex flex-col gap-1">
            <div className={`text-[12px] font-medium ${ink}`}>{philLabel(project.hifi.basePhilosophy)}</div>
            <div className={`text-[10px] font-mono truncate ${subtle}`} title={project.hifi.path}>
              {project.hifi.path.split("/").slice(-3).join("/")}
            </div>
          </div>
        ) : (
          <div className={`text-[11px] ${subtle}`}>
            Stage 4에서 Hi-fi를 먼저 생성해주세요.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy || !project.hifi || !project.brief}
          className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white disabled:opacity-40 whitespace-nowrap"
          style={{ background: accent }}
          data-testid="design-motion-generate"
        >
          {busy ? "모션 적용 중…" : project.motion ? "재생성" : "모션 적용"}
        </button>
        {project.motion && !busy && (
          <button
            type="button"
            onClick={previewMotion}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-motion-preview"
          >
            Preview ↗
          </button>
        )}
        <button
          type="button"
          onClick={onPrev}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
        >
          ← Hi-fi
        </button>
        {project.motion && !busy && (
          <button
            type="button"
            onClick={onNext}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-motion-next"
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

      {project.motion && (
        <div className={`p-3 rounded-[8px] border ${surface}`} data-testid="design-motion-result">
          <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-1`}>산출물</div>
          <div className={`text-[12px] ${ink} mb-1`}>모션 HTML 저장 완료</div>
          <div className={`text-[10px] font-mono truncate ${subtle}`} title={project.motion.path}>
            {project.motion.path.split("/").slice(-3).join("/")}
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
