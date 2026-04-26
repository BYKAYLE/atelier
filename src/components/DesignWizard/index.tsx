import React, { useState } from "react";
import { useDesignProject, type Stage } from "./useDesignProject";
import Brief from "./steps/Brief";
import System from "./steps/System";
import Wireframe from "./steps/Wireframe";
import HiFi from "./steps/HiFi";
import Motion from "./steps/Motion";
import Review from "./steps/Review";
import Gallery from "./steps/Gallery";

interface Props {
  dark: boolean;
  /** 우측 Preview iframe에 file://* 또는 일반 URL을 로드한다. */
  onPreviewUrl: (url: string) => void;
}

const STAGES: { id: Stage; label: string; sub: string; active: boolean }[] = [
  { id: 1, label: "Brief", sub: "PRD 초안", active: true },
  { id: 2, label: "System", sub: "디자인 토큰", active: true },
  { id: 3, label: "Wireframe", sub: "3안 비교", active: true },
  { id: 4, label: "Hi-fi", sub: "정밀 styling", active: true },
  { id: 5, label: "Motion", sub: "애니메이션", active: true },
  { id: 6, label: "Review", sub: "평가/export", active: true },
];

/**
 * Atelier Design Wizard — 6단계 stepper. 모두 활성.
 * 좌측 사이드바 [디자인] 탭 클릭 시 lazy import.
 */
export default function DesignWizard({ dark, onPreviewUrl }: Props) {
  const { project, update, setStage, reset } = useDesignProject();
  const [view, setView] = useState<"wizard" | "gallery">("wizard");

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const accent = "#c96442";

  function gotoNextActive(from: Stage) {
    // 다음 active 단계로 이동. Phase 1은 1 → 3 점프.
    const next = STAGES.find((s) => s.id > from && s.active);
    if (next) setStage(next.id);
  }

  function gotoPrevActive(from: Stage) {
    const prev = [...STAGES].reverse().find((s) => s.id < from && s.active);
    if (prev) setStage(prev.id);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="design-wizard">
      {/* 헤더: 프로젝트 ID + 갤러리 토글 + reset */}
      <div className={`px-3 py-2 border-b ${dark ? "border-dline" : "border-line"}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Atelier Design</div>
            <div className={`text-[10.5px] font-mono truncate ${subtle}`} title={project.projectId}>
              {project.projectId}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setView(view === "wizard" ? "gallery" : "wizard")}
              className={`text-[10.5px] px-2 h-6 rounded-[4px] border whitespace-nowrap ${dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink"}`}
              style={view === "gallery" ? { boxShadow: `0 0 0 1px ${accent}` } : undefined}
              data-testid="design-view-toggle"
              title={view === "wizard" ? "갤러리 보기" : "위저드 보기"}
            >
              {view === "wizard" ? "갤러리" : "위저드"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("새 디자인 프로젝트를 시작할까요? 현재 진행은 저장된 상태로 남습니다.")) {
                  reset();
                  setView("wizard");
                }
              }}
              className={`text-[10.5px] px-2 h-6 rounded-[4px] border whitespace-nowrap ${dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink"}`}
            >
              새로
            </button>
          </div>
        </div>
      </div>

      {/* Stepper — 위저드 모드에서만 노출 */}
      {view === "wizard" && (
      <div className={`px-2 py-2 border-b flex gap-1 overflow-x-auto ${dark ? "border-dline" : "border-line"}`} data-testid="design-stepper">
        {STAGES.map((s) => {
          const isCurrent = project.stage === s.id;
          const isDone = isStageDone(project, s.id);
          return (
            <button
              key={s.id}
              type="button"
              disabled={!s.active}
              onClick={() => s.active && setStage(s.id)}
              className={`flex-1 min-w-[60px] py-1.5 px-2 rounded-[6px] text-left transition-colors ${!s.active ? "opacity-30 cursor-not-allowed" : ""} ${isCurrent ? (dark ? "bg-[#2a2a28]" : "bg-muted") : ""}`}
              style={isCurrent ? { boxShadow: `0 0 0 1px ${accent}` } : undefined}
              data-testid={`design-step-${s.id}`}
            >
              <div className={`text-[9px] font-mono ${subtle}`}>{s.id}</div>
              <div className={`text-[11px] font-medium ${ink}`}>
                {s.label} {isDone && <span style={{ color: accent }}>✓</span>}
              </div>
              <div className={`text-[9px] truncate ${subtle}`}>{s.sub}</div>
            </button>
          );
        })}
      </div>
      )}

      {/* 본문 — 위저드 단계 또는 갤러리 */}
      <div className="flex-1 overflow-auto">
      {view === "gallery" && (
        <Gallery
          project={project}
          onPreview={onPreviewUrl}
          onSelectStage={(s) => {
            setStage(s);
            setView("wizard");
          }}
          dark={dark}
        />
      )}
      {view === "wizard" && (<>

        {project.stage === 1 && (
          <Brief
            project={project}
            onChange={update}
            onNext={() => gotoNextActive(1)}
            dark={dark}
          />
        )}
        {project.stage === 2 && (
          <System
            project={project}
            onChange={update}
            onPrev={() => gotoPrevActive(2)}
            onNext={() => gotoNextActive(2)}
            dark={dark}
          />
        )}
        {project.stage === 3 && (
          <Wireframe
            project={project}
            onChange={update}
            onPrev={() => gotoPrevActive(3)}
            onNext={() => gotoNextActive(3)}
            onPreview={onPreviewUrl}
            dark={dark}
          />
        )}
        {project.stage === 4 && (
          <HiFi
            project={project}
            onChange={update}
            onPrev={() => gotoPrevActive(4)}
            onNext={() => gotoNextActive(4)}
            onPreview={onPreviewUrl}
            dark={dark}
          />
        )}
        {project.stage === 5 && (
          <Motion
            project={project}
            onChange={update}
            onPrev={() => gotoPrevActive(5)}
            onNext={() => gotoNextActive(5)}
            onPreview={onPreviewUrl}
            dark={dark}
          />
        )}
        {project.stage === 6 && (
          <Review
            project={project}
            onChange={update}
            onPrev={() => gotoPrevActive(6)}
            dark={dark}
          />
        )}
      </>)}
      </div>
    </div>
  );
}

function isStageDone(project: ReturnType<typeof useDesignProject>["project"], stage: Stage): boolean {
  if (stage === 1) return !!project.brief;
  if (stage === 2) return !!project.system;
  if (stage === 3) return Object.keys(project.wireframes).length > 0;
  if (stage === 4) return !!project.hifi;
  if (stage === 5) return !!project.motion;
  if (stage === 6) return !!project.review;
  return false;
}
