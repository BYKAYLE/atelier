import React from "react";
import { createPortal } from "react-dom";
import type { DesignProject } from "./useDesignProject";

interface Props {
  project: DesignProject;
  onCancel: () => void;
  dark: boolean;
}

/**
 * AutoOverlay — 자동 파이프라인 진행 중 floating status panel.
 * 상단 progress bar(전체 폭) + 우측 하단 floating card. createPortal로 document.body에 mount.
 * Tauri WebView fixed positioning 보장.
 * project.autoMode가 true이고 review 미완성이면 표시.
 */
export default function AutoOverlay({ project, onCancel, dark }: Props) {
  if (!project.autoMode || project.review) return null;
  if (typeof document === "undefined") return null;

  const isWeb = project.outputType === "web";
  const isCi = project.outputType === "ci";
  const isApp = project.outputType === "app";
  const isPrint = project.outputType === "print";

  const accent = "#c96442";

  // outputType별 Stage 3·4 라벨 + done 조건
  const stage3Label = isCi ? "Brand System" : isApp ? "App Flow" : isPrint ? "Print Layout" : "Wireframe";
  const stage3Sub = isCi ? "학파별 시스템" : isApp ? "IA·화면 정의" : isPrint ? "사이즈·grid" : "3안 비교";
  const stage3Done = isCi
    ? !!project.ci?.systemMd
    : isApp
      ? !!project.app?.flowMd
      : isPrint
        ? !!project.print?.layoutMd
        : Object.keys(project.wireframes).length > 0;

  const stage4Label = isCi ? "Assets" : isApp ? "App Screens" : isPrint ? "Print Final" : "Hi-fi";
  const stage4Sub = isCi ? "SVG 로고" : isApp ? "device frame" : isPrint ? "인쇄용 정밀" : "정밀 styling";
  const stage4Done = isCi
    ? !!project.ci?.applicationsMd
    : isApp
      ? !!project.app?.screensPath
      : isPrint
        ? !!project.print?.finalPath
        : !!project.hifi;

  // 단계별 상태 — done / current / pending
  type StepState = "done" | "current" | "pending" | "skipped";
  const steps: { id: number; label: string; sub: string; state: StepState }[] = [
    {
      id: 1,
      label: "Brief",
      sub: "PRD 정제",
      state: project.brief ? "done" : "current",
    },
    {
      id: 2,
      label: "System",
      sub: "디자인 토큰",
      state: project.system
        ? "done"
        : project.stage === 2
          ? "current"
          : "pending",
    },
    {
      id: 3,
      label: stage3Label,
      sub: stage3Sub,
      state: stage3Done ? "done" : project.stage === 3 ? "current" : "pending",
    },
    {
      id: 4,
      label: stage4Label,
      sub: stage4Sub,
      state: stage4Done ? "done" : project.stage === 4 ? "current" : "pending",
    },
    {
      id: 5,
      label: "Motion",
      sub: isWeb ? "애니메이션" : "(웹 외 스킵)",
      state: !isWeb
        ? "skipped"
        : project.motion
          ? "done"
          : project.stage === 5
            ? "current"
            : "pending",
    },
    {
      id: 6,
      label: "Review",
      sub: "평가 + export",
      state: project.review
        ? "done"
        : project.stage === 6
          ? "current"
          : "pending",
    },
  ];

  const currentStep = steps.find((s) => s.state === "current");
  const doneCount = steps.filter((s) => s.state === "done").length;
  const totalActiveCount = steps.filter((s) => s.state !== "skipped").length;
  const progressPct = Math.round((doneCount / totalActiveCount) * 100);

  // 학파 선택 대기 중인지 — Stage 3 산출물 생성됐지만 selectedWireframe 없을 때
  const waitingPhilosophyPick =
    project.stage === 3 &&
    !project.selectedWireframe &&
    (isCi
      ? !!project.ci?.systemMd
      : isApp
        ? !!project.app?.flowMd
        : isPrint
          ? !!project.print?.layoutMd
          : Object.keys(project.wireframes).length === 3);

  return createPortal(
    <>
      {/* 상단 전체 폭 progress bar — 화면 어디서든 자동 모드 인지 가능 */}
      <div
        className="fixed top-0 left-0 right-0 z-[200] pointer-events-none"
        data-testid="design-auto-progress-top"
      >
        <div className="h-[3px] w-full" style={{ background: dark ? "#3d3d3b" : "#e5e3db" }}>
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              background: accent,
              boxShadow: `0 0 8px ${accent}`,
            }}
          />
        </div>
      </div>

    <div
      className="fixed bottom-6 right-6 z-[200] w-[340px] rounded-[10px] border shadow-2xl backdrop-blur-md pointer-events-auto"
      style={{
        background: dark ? "rgba(38, 38, 36, 0.97)" : "rgba(255, 255, 255, 0.97)",
        borderColor: accent,
        boxShadow: `0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px ${accent}`,
      }}
      data-testid="design-auto-overlay"
    >
      {/* 헤더 */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 border-b"
        style={{ borderColor: dark ? "#3d3d3b" : "#e5e3db" }}
      >
        {/* 회전 spinner */}
        {!waitingPhilosophyPick && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="animate-spin shrink-0"
            style={{ color: accent }}
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
            <path
              d="M21 12a9 9 0 0 1-9 9"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        )}
        {waitingPhilosophyPick && (
          <span className="shrink-0 text-[14px]" style={{ color: accent }}>⏸</span>
        )}
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: dark ? "#a1a1a1" : "#6b6b6b" }}
          >
            {waitingPhilosophyPick ? "사용자 선택 대기" : "자동 실행 중"}
          </div>
          <div
            className="text-[12px] font-medium truncate"
            style={{ color: dark ? "#faf9f5" : "#2d2d2d" }}
          >
            {currentStep
              ? `Stage ${currentStep.id} · ${currentStep.label} ${waitingPhilosophyPick ? "" : "생성 중…"}`
              : "마무리 중…"}
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 text-[10.5px] px-2 h-6 rounded-[4px] border whitespace-nowrap"
          style={{
            borderColor: dark ? "#3d3d3b" : "#e5e3db",
            color: dark ? "#a1a1a1" : "#6b6b6b",
          }}
          title="자동 모드 중단"
          data-testid="design-auto-cancel"
        >
          중단
        </button>
      </div>

      {/* 진행률 바 */}
      <div className="px-3 pt-2.5">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span style={{ color: dark ? "#a1a1a1" : "#6b6b6b" }}>
            {doneCount} / {totalActiveCount}
          </span>
          <span style={{ color: dark ? "#a1a1a1" : "#6b6b6b" }}>{progressPct}%</span>
        </div>
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: dark ? "#3d3d3b" : "#e5e3db" }}
        >
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${progressPct}%`, background: accent }}
          />
        </div>
      </div>

      {/* 단계 리스트 */}
      <div className="px-3 py-2.5 flex flex-col gap-1">
        {steps.map((s) => {
          const dotColor =
            s.state === "done"
              ? accent
              : s.state === "current"
                ? accent
                : s.state === "skipped"
                  ? dark
                    ? "#3d3d3b"
                    : "#e5e3db"
                  : dark
                    ? "#3d3d3b"
                    : "#e5e3db";
          const textColor =
            s.state === "done" || s.state === "current"
              ? dark
                ? "#faf9f5"
                : "#2d2d2d"
              : s.state === "skipped"
                ? dark
                  ? "#6b6b6b"
                  : "#9b9890"
                : dark
                  ? "#a1a1a1"
                  : "#6b6b6b";
          return (
            <div key={s.id} className="flex items-center gap-2 text-[11px]">
              <div className="w-4 shrink-0 flex items-center justify-center">
                {s.state === "done" ? (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={accent}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : s.state === "current" ? (
                  <span
                    className="block w-2 h-2 rounded-full animate-pulse"
                    style={{ background: dotColor }}
                  />
                ) : s.state === "skipped" ? (
                  <span style={{ color: dotColor, fontSize: 10 }}>—</span>
                ) : (
                  <span
                    className="block w-1.5 h-1.5 rounded-full"
                    style={{ background: dotColor }}
                  />
                )}
              </div>
              <span style={{ color: textColor }} className="font-medium">
                {s.label}
              </span>
              <span
                className="text-[10px]"
                style={{ color: dark ? "#a1a1a1" : "#9b9890" }}
              >
                {s.sub}
              </span>
            </div>
          );
        })}
      </div>

      {waitingPhilosophyPick && (
        <div
          className="px-3 py-2 text-[10.5px] border-t"
          style={{
            borderColor: dark ? "#3d3d3b" : "#e5e3db",
            color: dark ? "#a1a1a1" : "#6b6b6b",
          }}
        >
          좌측에서 학파 1개를 선택하면 나머지 단계가 자동 진행됩니다.
        </div>
      )}
    </div>
    </>,
    document.body,
  );
}
