import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { readDesignResource, saveDesignArtifact } from "../../../lib/tauri";
import { askDesignClaude } from "../designClaude";
import { PHILOSOPHIES, type DesignProject, type Philosophy } from "../useDesignProject";
import { phiToFile, stripCodeFence } from "../utils";
import { useAutoTrigger, useAutoAdvance } from "../useAutoStage";

interface Props {
  project: DesignProject;
  onChange: (patch: Partial<DesignProject>) => void;
  onPrev: () => void;
  onNext: () => void;
  dark: boolean;
}

/**
 * Stage 3 — App Flow (outputType === "app"일 때만 렌더).
 * Wireframe 대신 사용. 학파별로 IA + 화면 정의 + 컴포넌트 인벤토리 markdown 생성.
 */
export default function AppFlow({ project, onChange, onPrev, onNext, dark }: Props) {
  const [busyPhilosophy, setBusyPhilosophy] = useState<Philosophy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useAutoTrigger(
    !!project.autoMode &&
      !!project.brief &&
      !project.app?.flowMd &&
      !busyPhilosophy,
    () => {
      const phi: Philosophy = project.system?.recommendedPhilosophy ?? PHILOSOPHIES[0].id;
      generateFlow(phi);
    },
  );
  useAutoAdvance(
    !!project.autoMode &&
      !!project.app?.flowMd &&
      !!project.selectedWireframe &&
      !busyPhilosophy,
    onNext,
  );

  async function generateFlow(phi: Philosophy) {
    if (!project.brief) {
      setError("Stage 1 Brief가 비어 있습니다.");
      return;
    }
    setBusyPhilosophy(phi);
    setError(null);
    try {
      const sysPrompt = await readDesignResource("prompts/app/03-flow.md");
      const philosophyDoc = await readDesignResource(`philosophies/${phiToFile(phi)}.md`);
      const brand = await readDesignResource("brand/bykayle.md");

      const userInput = [
        "## BRIEF",
        project.brief,
        "",
        ...(project.system?.content
          ? ["## SYSTEM_TOKENS", project.system.content, ""]
          : []),
        "## PHILOSOPHY_NAME",
        phi,
        "",
        "## PHILOSOPHY_DOC",
        philosophyDoc,
        "",
        "## BRAND_PACK",
        brand,
        "",
        "위 입력으로 App flow markdown을 출력하세요.",
      ].join("\n");

      const md = await askDesignClaude(sysPrompt, userInput);
      const cleaned = stripCodeFence(md);
      const basePath = await saveDesignArtifact(
        project.projectId,
        `app/${phi}-flow.md`,
        cleaned,
      );
      onChange({
        app: { flowMd: cleaned, basePath, createdAt: Date.now() },
        selectedWireframe: phi,
      });
    } catch (e) {
      setError(`${phi}: ${String(e)}`);
    } finally {
      setBusyPhilosophy(null);
    }
  }

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442";
  const ready = !!project.app?.flowMd && !!project.selectedWireframe;
  const recommended = project.system?.recommendedPhilosophy;

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="design-app-flow">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Stage 3 · App</div>
        <div className={`text-[14px] font-medium ${ink}`}>Flow — IA·화면·컴포넌트</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          학파를 선택하면 그 톤으로 IA 트리·5~7개 핵심 화면·컴포넌트 인벤토리를 markdown으로 정의합니다.
          다음 단계에서 device frame mockup HTML로 정밀화합니다.
        </div>
      </div>

      {!project.brief && (
        <div className={`text-[11px] p-2 rounded-[4px] border ${surface} ${subtle}`}>
          Stage 1 Brief가 비어 있습니다.
        </div>
      )}

      {error && (
        <div className="text-[11px] text-red-500 p-2 rounded-[4px] border border-red-300/40 bg-red-50/10">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPrev}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
        >
          ← System
        </button>
        {ready && (
          <button
            type="button"
            onClick={onNext}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-app-flow-next"
          >
            Screens →
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2" data-testid="design-app-philosophy-cards">
        {PHILOSOPHIES.map((p) => {
          const isBusy = busyPhilosophy === p.id;
          const isSelected = project.selectedWireframe === p.id;
          const isRecommended = recommended === p.id;
          const ringStyle = isSelected
            ? { boxShadow: `0 0 0 2px ${accent}` }
            : isRecommended
              ? { boxShadow: `0 0 0 1px ${accent}` }
              : undefined;
          return (
            <div
              key={p.id}
              className={`p-3 rounded-[8px] border transition-colors ${surface}`}
              style={ringStyle}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className={`text-[12px] font-medium truncate ${ink} flex items-center gap-1.5`}>
                    {p.label}
                    {isRecommended && !isSelected && (
                      <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded-[3px] uppercase tracking-wider whitespace-nowrap"
                        style={{ background: accent, color: "#fff" }}
                      >
                        추천
                      </span>
                    )}
                  </div>
                  <div className={`text-[10px] truncate ${subtle}`}>{p.sub}</div>
                </div>
                <button
                  type="button"
                  onClick={() => generateFlow(p.id)}
                  disabled={!!busyPhilosophy || !project.brief}
                  className={`h-7 px-3 rounded-[4px] text-[11px] border disabled:opacity-40 whitespace-nowrap shrink-0 ${
                    isSelected
                      ? "text-white"
                      : dark
                        ? "border-dline text-dink"
                        : "border-line text-ink"
                  }`}
                  style={isSelected ? { background: accent, borderColor: accent } : undefined}
                  data-testid={`design-app-generate-${p.id}`}
                >
                  {isBusy ? "…" : isSelected ? "선택됨 ✓" : "이 학파로 생성"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {project.app?.flowMd && (
        <div
          className={`mt-2 p-3 rounded-[8px] border overflow-auto ${surface} ${ink}`}
          style={{ maxHeight: "55vh", fontSize: 12, lineHeight: 1.55 }}
          data-testid="design-app-flow-result"
        >
          <div className="atelier-markdown">
            <ReactMarkdown>{project.app.flowMd}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

