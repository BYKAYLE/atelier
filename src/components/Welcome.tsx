import React from "react";
import { cls, MOD_KEY, Tweaks } from "../lib/tokens";
import { I } from "./Icons";

interface Props {
  tw: Tweaks;
  setScreen: (s: string) => void;
}

const Welcome: React.FC<Props> = ({ tw, setScreen }) => {
  const dark = tw.dark;
  const headline = tw.welcomeHeadline;
  const sub = tw.welcomeSub;

  return (
    <div
      className={cls(
        "h-full w-full fade-in flex flex-col justify-center",
        dark ? "bg-dbg" : "bg-cream",
      )}
    >
      <div className="max-w-[860px] mx-auto px-10 w-full">
        <div
          className={cls(
            "text-[11px] font-mono uppercase tracking-[0.2em] mb-6",
            dark ? "text-dsub" : "text-sub",
          )}
        >
          Atelier · v0.1 미리보기
        </div>

        <h1
          className={cls(
            "font-display font-[450] tracking-[-0.02em] text-[clamp(44px,6vw,76px)] leading-[1.12]",
            dark ? "text-dink" : "text-ink",
          )}
        >
          {headline.split(" ").map((w, i, arr) => {
            const isLast = i === arr.length - 1;
            return (
              <React.Fragment key={i}>
                {isLast ? (
                  <span className="font-semibold" style={{ color: "var(--accent)" }}>
                    {w}
                  </span>
                ) : (
                  w
                )}
                {i < arr.length - 1 && (
                  <>
                    {w.endsWith(",") ? <br /> : " "}
                  </>
                )}
              </React.Fragment>
            );
          })}
        </h1>

        <p
          className={cls(
            "mt-5 text-[16px] leading-[1.65] max-w-[640px]",
            dark ? "text-dsub" : "text-sub",
          )}
        >
          {sub}
        </p>

        <div className="mt-8 flex items-center gap-3">
          <button
            onClick={() => setScreen("main")}
            className="h-10 px-5 rounded-[8px] text-[14px] font-medium text-white transition-colors"
            style={{ background: "var(--accent)" }}
          >
            새 세션 시작
          </button>
          <button
            onClick={() => setScreen("settings")}
            className={cls(
              "h-10 px-5 rounded-[8px] text-[14px] font-medium border transition-colors",
              dark
                ? "border-dline text-dsub hover:text-dink hover:bg-dmuted"
                : "border-line text-sub hover:text-ink hover:bg-muted",
            )}
          >
            설정 열기
          </button>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-4 max-w-[640px]">
          {[
            { icon: I.image, title: "이미지 붙여넣기", body: `${MOD_KEY}+V로 스크린샷을 그대로` },
            { icon: I.eye, title: "라이브 프리뷰", body: "HTML·마크다운 자동 렌더" },
            { icon: I.zap, title: "가벼움", body: "Tauri · 네이티브 속도" },
          ].map((f, i) => (
            <div
              key={i}
              className={cls(
                "p-4 rounded-[10px] border",
                dark ? "border-dline bg-dsurf" : "border-line bg-surface",
              )}
            >
              <div
                className="h-7 w-7 rounded-[7px] grid place-items-center mb-3"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {f.icon}
              </div>
              <div
                className={cls(
                  "text-[13.5px] font-medium mb-1",
                  dark ? "text-dink" : "text-ink",
                )}
              >
                {f.title}
              </div>
              <div
                className={cls(
                  "text-[12px] leading-[1.55]",
                  dark ? "text-dsub" : "text-sub",
                )}
              >
                {f.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Welcome;
