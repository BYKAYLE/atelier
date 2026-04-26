import React, { useState, lazy, Suspense } from "react";
import { cls, Tweaks } from "../lib/tokens";
import { I } from "./Icons";

/**
 * 디자인 모드 페이지 — 상단 [디자인] 탭 클릭 시 mount.
 * 구조: [좌측 디자인 워크플로우 메뉴] [중앙 단계별 폼] [우측 preview]
 * 코드 모드의 세션/파일 사이드바와 별개. 디자인 모드 전용.
 */
const DesignWizard = lazy(() => import("./DesignWizard"));

interface Props {
  tw: Tweaks;
}

type PreviewVP = "mobile" | "tablet" | "desktop";
const VP_SIZES: Record<PreviewVP, { w: number | "100%"; h: number | "100%" }> = {
  mobile: { w: 390, h: 844 },
  tablet: { w: 834, h: 1194 },
  desktop: { w: "100%", h: "100%" },
};

export default function DesignPage({ tw }: Props) {
  const dark = tw.dark;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [previewVP, setPreviewVP] = useState<PreviewVP>("desktop");

  return (
    <div className={cls("h-full w-full flex", dark ? "bg-dbg text-dink" : "bg-cream text-ink")}>
      {/* 좌측 — 디자인 워크플로우 메뉴 (코드 모드 사이드바와 별개) */}
      <aside
        className={cls(
          "w-[280px] shrink-0 border-r flex flex-col",
          dark ? "border-dline bg-dbg" : "border-line bg-cream",
        )}
      >
        <Suspense
          fallback={
            <div className={cls("p-4 text-[12px]", dark ? "text-dsub" : "text-sub")}>
              Design Wizard 로딩 중…
            </div>
          }
        >
          <DesignWizard
            dark={dark}
            onPreviewUrl={(url) => {
              setPreviewUrl(url);
              setPreviewReloadKey((n) => n + 1);
            }}
          />
        </Suspense>
      </aside>

      {/* 우측 — Preview iframe + viewport toggle (대형 미리보기) */}
      <div className="flex-1 min-w-0 flex flex-col">
          <div
            className={cls(
              "flex-1 min-w-0 flex flex-col",
              dark ? "bg-dsurf" : "bg-surface",
            )}
          >
            <div
              className={cls(
                "h-10 px-3 flex items-center gap-2 border-b text-[11px] font-mono",
                dark ? "border-dline text-dsub" : "border-line text-sub",
              )}
            >
              <span className="uppercase tracking-wider flex items-center gap-1 shrink-0">
                {I.eye} 미리보기
              </span>
              <span
                className={cls(
                  "flex-1 min-w-0 truncate text-[11px]",
                  dark ? "text-dink" : "text-ink",
                )}
                title={previewUrl || ""}
              >
                {previewUrl || "결과물 대기"}
              </span>
              {previewUrl && (
                <>
                  <div
                    className={cls(
                      "shrink-0 inline-flex items-center rounded-[5px] overflow-hidden border",
                      dark ? "border-dline" : "border-line",
                    )}
                  >
                    {(
                      [
                        ["mobile", "📱", "모바일 (390×844)"],
                        ["tablet", "▭", "태블릿 (834×1194)"],
                        ["desktop", "🖥", "데스크탑 (100%)"],
                      ] as const
                    ).map(([vp, icon, t]) => (
                      <button
                        key={vp}
                        type="button"
                        onClick={() => setPreviewVP(vp)}
                        title={t}
                        className={cls(
                          "h-6 w-7 inline-flex items-center justify-center text-[11px] transition-colors",
                          previewVP === vp
                            ? dark
                              ? "bg-dline text-dink"
                              : "bg-line text-ink"
                            : dark
                              ? "text-dsub hover:text-dink hover:bg-[#2a2a28]"
                              : "text-sub hover:text-ink hover:bg-muted",
                        )}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewReloadKey((n) => n + 1)}
                    className={cls(
                      "shrink-0 px-1.5 py-0.5 rounded-[4px] text-[10px]",
                      dark ? "hover:bg-[#3d3d3b]" : "hover:bg-line",
                    )}
                    title="새로고침"
                  >
                    ↻
                  </button>
                </>
              )}
            </div>
            <div className="flex-1 overflow-auto relative">
              {previewUrl ? (
                previewVP === "desktop" ? (
                  <iframe
                    key={`${previewUrl}#${previewReloadKey}#${previewVP}`}
                    src={previewUrl}
                    title="Design Preview"
                    className="absolute inset-0 w-full h-full border-0"
                    sandbox="allow-scripts allow-forms allow-popups"
                  />
                ) : (
                  <div
                    className={cls(
                      "absolute inset-0 overflow-auto flex items-start justify-center p-6",
                      dark ? "bg-[#0e0e0c]" : "bg-[#e8e6df]",
                    )}
                  >
                    <div
                      className={cls(
                        "shrink-0 shadow-[0_4px_24px_rgba(0,0,0,0.18)] rounded-[12px] overflow-hidden border",
                        dark ? "border-dline bg-dsurf" : "border-line bg-surface",
                      )}
                      style={{
                        width: VP_SIZES[previewVP].w,
                        height: VP_SIZES[previewVP].h,
                        maxWidth: "100%",
                      }}
                    >
                      <iframe
                        key={`${previewUrl}#${previewReloadKey}#${previewVP}`}
                        src={previewUrl}
                        title="Design Preview"
                        className="w-full h-full border-0 block"
                        sandbox="allow-scripts allow-forms allow-popups"
                      />
                    </div>
                  </div>
                )
              ) : (
                <div
                  className={cls(
                    "absolute inset-0 flex items-center justify-center text-[12px] p-4 text-center",
                    dark ? "text-dsub" : "text-sub",
                  )}
                >
                  좌측에서 Wireframe 생성 시 자동으로 표시됩니다.
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  );
}
