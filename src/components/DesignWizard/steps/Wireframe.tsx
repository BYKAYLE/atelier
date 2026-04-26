import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readDesignResource, saveDesignArtifact } from "../../../lib/tauri";
import { askDesignClaude } from "../designClaude";
import { PHILOSOPHIES, type DesignProject, type Philosophy } from "../useDesignProject";
import { phiToFile, stripHtmlFence } from "../utils";
import { useAutoTrigger, useAutoAdvance } from "../useAutoStage";

interface Props {
  project: DesignProject;
  onChange: (patch: Partial<DesignProject>) => void;
  onPreview: (filePath: string) => void;
  onPrev: () => void;
  onNext: () => void;
  dark: boolean;
}

/**
 * Stage 3 — Wireframe.
 * Brief 기반 3개 학파에서 mid-fi HTML 시안 3안을 순차 생성한다.
 * (병렬은 단일 claude 세션 가정으로 어렵기 때문에 순차. 사용자 인지에는 진행 표시).
 * 카드 3개에서 선택해 우측 preview에 file:// 로 로드. 선택 후 Stage 4(Hi-fi)로 진행.
 */
export default function Wireframe({ project, onChange, onPreview, onPrev, onNext, dark }: Props) {
  const [busyPhilosophy, setBusyPhilosophy] = useState<Philosophy | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto pipeline: 자동 모드 mount 시 모든 학파(3안) generateAll 단발 실행.
  useAutoTrigger(
    !!project.autoMode &&
      !!project.brief &&
      Object.keys(project.wireframes).length === 0 &&
      !busyPhilosophy,
    () => generateAll(),
  );
  // 학파 선택되면 자동으로 다음 단계 진행 (Stage 4 hi-fi)
  useAutoAdvance(
    !!project.autoMode &&
      !!project.selectedWireframe &&
      Object.keys(project.wireframes).length > 0 &&
      !busyPhilosophy,
    onNext,
  );

  async function generateOne(phi: Philosophy) {
    if (!project.brief) {
      setError("먼저 Stage 1에서 Brief를 생성해주세요.");
      return;
    }
    setBusyPhilosophy(phi);
    setError(null);
    try {
      const sysPrompt = await readDesignResource("prompts/03-wireframe.md");
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
        "위 입력으로 Stage 3 wireframe HTML 한 개를 출력하세요.",
        "SYSTEM_TOKENS가 있으면 학파 doc·brand pack과 함께 토큰 값을 우선 적용합니다.",
      ].join("\n");

      const html = await askDesignClaude(sysPrompt, userInput);
      // claude가 ```html ... ``` 으로 감쌀 수 있어 제거.
      const cleaned = stripHtmlFence(html);
      const savedPath = await saveDesignArtifact(
        project.projectId,
        `wireframe/${phi}.html`,
        cleaned,
      );
      onChange({
        wireframes: {
          ...project.wireframes,
          [phi]: { path: savedPath, createdAt: Date.now() },
        },
      });
    } catch (e) {
      setError(`${phi}: ${String(e)}`);
    } finally {
      setBusyPhilosophy(null);
    }
  }

  async function generateAll() {
    for (const p of PHILOSOPHIES) {
      // eslint-disable-next-line no-await-in-loop
      await generateOne(p.id);
    }
  }

  function selectAndPreview(phi: Philosophy) {
    const w = project.wireframes[phi];
    if (!w) return;
    onChange({ selectedWireframe: phi });
    // Tauri asset protocol — file://는 webview CSP에 차단되므로 asset:// 변환.
    const assetUrl = convertFileSrc(w.path);
    onPreview(assetUrl);
  }

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442";

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Stage 3</div>
        <div className={`text-[14px] font-medium ${ink}`}>Wireframe — 3안 비교</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          Brief를 기반으로 3개 학파의 lo-fi HTML 시안을 생성합니다. 카드를 클릭하면 우측 preview에 표시됩니다.
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generateAll}
          disabled={!!busyPhilosophy || !project.brief}
          className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white disabled:opacity-40 whitespace-nowrap"
          style={{ background: accent }}
          data-testid="design-wireframe-generate-all"
        >
          {busyPhilosophy ? `${busyPhilosophy} 생성 중…` : "3안 모두 생성"}
        </button>
        <button
          type="button"
          onClick={onPrev}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
        >
          ← Brief
        </button>
        {project.selectedWireframe && (
          <button
            type="button"
            onClick={onNext}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-wireframe-next"
          >
            Hi-fi 단계 →
          </button>
        )}
      </div>

      {!project.brief && (
        <div className={`text-[11px] p-2 rounded-[4px] border ${surface} ${subtle}`}>
          Stage 1 Brief가 비어 있습니다. 먼저 Brief를 생성해주세요.
        </div>
      )}

      {error && (
        <div className="text-[11px] text-red-500 p-2 rounded-[4px] border border-red-300/40 bg-red-50/10">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2" data-testid="design-wireframe-cards">
        {PHILOSOPHIES.map((p) => {
          const w = project.wireframes[p.id];
          const isBusy = busyPhilosophy === p.id;
          const isSelected = project.selectedWireframe === p.id;
          const isRecommended = project.system?.recommendedPhilosophy === p.id;
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
                        title="Stage 2 시스템 토큰이 추천한 학파"
                      >
                        추천
                      </span>
                    )}
                  </div>
                  <div className={`text-[10px] truncate ${subtle}`}>{p.sub}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => generateOne(p.id)}
                    disabled={!!busyPhilosophy || !project.brief}
                    className={`h-7 px-2 rounded-[4px] text-[11px] border disabled:opacity-40 whitespace-nowrap ${dark ? "border-dline text-dink" : "border-line text-ink"}`}
                  >
                    {isBusy ? "…" : w ? "재생성" : "생성"}
                  </button>
                  {w && (
                    <button
                      type="button"
                      onClick={() => selectAndPreview(p.id)}
                      className="h-7 px-2 rounded-[4px] text-[11px] text-white whitespace-nowrap"
                      style={{ background: accent }}
                      data-testid={`design-wireframe-select-${p.id}`}
                    >
                      {isSelected ? "선택됨 ✓" : "선택"}
                    </button>
                  )}
                </div>
              </div>
              {w && (
                <div className={`text-[10px] mt-2 font-mono truncate ${subtle}`} title={w.path}>
                  {w.path.split("/").slice(-3).join("/")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

