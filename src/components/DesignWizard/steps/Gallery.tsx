import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { PHILOSOPHIES, type DesignProject, type Philosophy } from "../useDesignProject";

interface Props {
  project: DesignProject;
  onPreview: (url: string) => void;
  onSelectStage: (stage: 1 | 2 | 3 | 4 | 5 | 6) => void;
  dark: boolean;
}

/**
 * Atelier Design Wizard — Gallery view.
 * 프로젝트의 모든 산출물을 한 화면에서 비교/탐색. 클릭 시 우측 iframe에 로드.
 * 위저드 헤더의 "갤러리" 토글로 진입.
 */
export default function Gallery({ project, onPreview, onSelectStage, dark }: Props) {
  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442";

  const philLabel = (id: Philosophy) => PHILOSOPHIES.find((p) => p.id === id)?.label ?? id;

  function previewArtifact(path: string) {
    onPreview(convertFileSrc(path));
  }

  const wireframeEntries = (Object.entries(project.wireframes) as [Philosophy, { path: string }][])
    .filter(([, w]) => !!w);

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="design-gallery">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Gallery</div>
        <div className={`text-[14px] font-medium ${ink}`}>산출물 한 화면 비교</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          모든 단계 산출물을 클릭해 우측 미리보기에서 확인합니다. 우측 viewport 토글로 모바일·태블릿·데스크탑 비교 가능.
        </div>
      </div>

      {/* Brief */}
      <Section
        label="Stage 1 — Brief"
        empty={!project.brief}
        emptyText="아직 PRD가 없습니다."
        dark={dark}
        accent={accent}
        onJump={() => onSelectStage(1)}
      >
        {project.brief && (
          <div className={`text-[11px] line-clamp-3 ${subtle}`}>{project.brief.slice(0, 220)}…</div>
        )}
      </Section>

      {/* System Tokens */}
      <Section
        label="Stage 2 — System Tokens"
        empty={!project.system}
        emptyText="아직 토큰이 없습니다."
        dark={dark}
        accent={accent}
        onJump={() => onSelectStage(2)}
      >
        {project.system && (
          <div className="flex flex-col gap-1">
            {project.system.recommendedPhilosophy && (
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[9px] font-medium px-1.5 py-0.5 rounded-[3px] uppercase tracking-wider"
                  style={{ background: accent, color: "#fff" }}
                >
                  추천
                </span>
                <span className={`text-[11px] ${ink}`}>
                  {philLabel(project.system.recommendedPhilosophy)}
                </span>
              </div>
            )}
            <div className={`text-[10px] line-clamp-2 ${subtle}`}>
              {project.system.content.slice(0, 180)}…
            </div>
          </div>
        )}
      </Section>

      {/* Wireframes 3안 */}
      <Section
        label="Stage 3 — Wireframe (3안)"
        empty={wireframeEntries.length === 0}
        emptyText="아직 wireframe이 없습니다."
        dark={dark}
        accent={accent}
        onJump={() => onSelectStage(3)}
      >
        <div className="grid grid-cols-1 gap-1.5">
          {PHILOSOPHIES.map((p) => {
            const w = project.wireframes[p.id];
            if (!w) return null;
            const isSelected = project.selectedWireframe === p.id;
            const isRecommended = project.system?.recommendedPhilosophy === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => previewArtifact(w.path)}
                className={`text-left p-2 rounded-[4px] border transition-colors ${surface} ${ink} hover:opacity-80`}
                style={isSelected ? { boxShadow: `0 0 0 1px ${accent}` } : undefined}
                data-testid={`gallery-wireframe-${p.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] font-medium ${ink} flex items-center gap-1.5`}>
                    {p.label}
                    {isSelected && <span style={{ color: accent }}>✓</span>}
                    {isRecommended && !isSelected && (
                      <span
                        className="text-[8.5px] font-medium px-1 py-0.5 rounded-[3px] uppercase tracking-wider"
                        style={{ background: accent, color: "#fff" }}
                      >
                        추천
                      </span>
                    )}
                  </span>
                  <span className={`text-[10px] ${subtle}`}>{p.sub}</span>
                </div>
                <div className={`text-[9.5px] mt-1 font-mono truncate ${subtle}`} title={w.path}>
                  {w.path.split("/").slice(-2).join("/")}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Hi-fi */}
      <Section
        label="Stage 4 — Hi-fi"
        empty={!project.hifi}
        emptyText="아직 hi-fi가 없습니다."
        dark={dark}
        accent={accent}
        onJump={() => onSelectStage(4)}
      >
        {project.hifi && (
          <button
            type="button"
            onClick={() => previewArtifact(project.hifi!.path)}
            className={`w-full text-left p-2 rounded-[4px] border transition-colors ${surface} ${ink} hover:opacity-80`}
            data-testid="gallery-hifi"
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-medium ${ink}`}>
                {philLabel(project.hifi.basePhilosophy)} · 정밀 styling
              </span>
            </div>
            <div className={`text-[9.5px] mt-1 font-mono truncate ${subtle}`} title={project.hifi.path}>
              {project.hifi.path.split("/").slice(-2).join("/")}
            </div>
          </button>
        )}
      </Section>

      {/* Motion */}
      <Section
        label="Stage 5 — Motion"
        empty={!project.motion}
        emptyText="아직 motion이 없습니다."
        dark={dark}
        accent={accent}
        onJump={() => onSelectStage(5)}
      >
        {project.motion && (
          <button
            type="button"
            onClick={() => previewArtifact(project.motion!.path)}
            className={`w-full text-left p-2 rounded-[4px] border transition-colors ${surface} ${ink} hover:opacity-80`}
            data-testid="gallery-motion"
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-medium ${ink}`}>
                {philLabel(project.motion.basePhilosophy)} · 모션
              </span>
            </div>
            <div className={`text-[9.5px] mt-1 font-mono truncate ${subtle}`} title={project.motion.path}>
              {project.motion.path.split("/").slice(-2).join("/")}
            </div>
          </button>
        )}
      </Section>

      {/* Review */}
      <Section
        label="Stage 6 — Review"
        empty={!project.review}
        emptyText="아직 review가 없습니다."
        dark={dark}
        accent={accent}
        onJump={() => onSelectStage(6)}
      >
        {project.review && (
          <div className={`p-2 rounded-[4px] border ${surface} ${ink}`}>
            <div className="flex items-center gap-2">
              {typeof project.review.score === "number" && (
                <span
                  className="text-[16px] font-bold tabular-nums"
                  style={{
                    color:
                      project.review.score >= 85
                        ? "#6b8e6e"
                        : project.review.score >= 70
                          ? accent
                          : "#b34a3a",
                  }}
                >
                  {project.review.score}
                </span>
              )}
              <span className={`text-[10px] ${subtle}`}>
                {project.review.score !== undefined && project.review.score >= 85
                  ? "Pass"
                  : project.review.score !== undefined && project.review.score >= 70
                    ? "Conditional"
                    : project.review.score !== undefined
                      ? "Fail"
                      : "—"}
              </span>
            </div>
            <div className={`text-[10px] mt-1 line-clamp-2 ${subtle}`}>
              {project.review.content.slice(0, 160)}…
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

interface SectionProps {
  label: string;
  empty: boolean;
  emptyText: string;
  dark: boolean;
  accent: string;
  onJump: () => void;
  children?: React.ReactNode;
}

function Section({ label, empty, emptyText, dark, onJump, children }: SectionProps) {
  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className={`text-[10px] uppercase tracking-wider ${subtle}`}>{label}</div>
        <button
          type="button"
          onClick={onJump}
          className={`text-[10px] ${subtle} hover:underline`}
          title="해당 단계로 이동"
        >
          단계로 →
        </button>
      </div>
      {empty ? (
        <div className={`text-[11px] ${subtle}`}>{emptyText}</div>
      ) : (
        <div className={ink}>{children}</div>
      )}
    </div>
  );
}
