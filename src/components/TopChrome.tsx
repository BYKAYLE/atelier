import React from "react";
import { cls, Tweaks } from "../lib/tokens";
import { I } from "./Icons";

interface Props {
  screen: string;
  setScreen: (s: string) => void;
  tw: Tweaks;
  setTw: (p: Partial<Tweaks>) => void;
}

const TopChrome: React.FC<Props> = ({ screen, setScreen, tw, setTw }) => {
  const dark = tw.dark;
  const copy = tw.language === "en"
    ? {
        preview: "Preview",
        nav: { welcome: "Home", agent: "Work", settings: "Settings" },
        theme: "Toggle theme",
        settings: "Settings",
      }
    : {
        preview: "미리보기",
        nav: { welcome: "홈", agent: "작업", settings: "설정" },
        theme: "테마 전환",
        settings: "설정",
      };
  return (
    <div
      className={cls(
        "h-10 shrink-0 flex items-center justify-between px-3 border-b",
        dark ? "bg-dbg border-dline" : "bg-cream border-line",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="font-display text-[15px] leading-none font-semibold tracking-tight pl-1"
          style={{ color: dark ? "#faf9f5" : "#2d2d2d" }}
        >
          Atelier
        </span>
        <span
          className={cls(
            "text-[11px] font-mono uppercase tracking-wider",
            dark ? "text-dsub" : "text-sub",
          )}
        >
          {copy.preview}
        </span>
      </div>

      <div
        className={cls(
          "flex items-center p-0.5 rounded-[10px] border text-[12px] font-medium",
          dark ? "bg-dmuted border-dline" : "bg-muted border-line",
        )}
      >
        {[
          ["welcome", copy.nav.welcome],
          ["agent", copy.nav.agent],
          // ["design", "디자인"],  // 보류 — 코드 모드 우선 (260427)
          ["settings", copy.nav.settings],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setScreen(k)}
            className={cls(
              "px-3 h-7 rounded-[7px] transition-colors duration-200",
              screen === k
                ? dark
                  ? "bg-dsurf text-dink shadow-[0_0_0_1px_#3d3d3b]"
                  : "bg-surface text-ink shadow-[0_0_0_1px_#e5e3db]"
                : dark
                  ? "text-dsub hover:text-dink"
                  : "text-sub hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <IconBtn dark={dark} title={copy.theme} onClick={() => setTw({ dark: !dark })}>
          {dark ? I.sun : I.moon}
        </IconBtn>
        <IconBtn
          dark={dark}
          title={copy.settings}
          active={screen === "settings"}
          onClick={() => setScreen("settings")}
        >
          {I.gear}
        </IconBtn>
      </div>
    </div>
  );
};

interface IconBtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  dark: boolean;
  active?: boolean;
}

export const IconBtn: React.FC<IconBtnProps> = ({
  children,
  onClick,
  title,
  dark,
  active,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    className={cls(
      "h-7 w-7 rounded-[7px] grid place-items-center transition-colors duration-200",
      active
        ? dark
          ? "bg-dsurf text-dink"
          : "bg-surface text-ink"
        : dark
          ? "text-dsub hover:bg-dmuted hover:text-dink"
          : "text-sub hover:bg-muted hover:text-ink",
    )}
  >
    {children}
  </button>
);

export default TopChrome;
