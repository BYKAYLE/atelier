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
          미리보기
        </span>
      </div>

      <div
        className={cls(
          "flex items-center p-0.5 rounded-[10px] border text-[12px] font-medium",
          dark ? "bg-dmuted border-dline" : "bg-muted border-line",
        )}
      >
        {[
          ["welcome", "홈"],
          ["main", "코드"],
          ["design", "디자인"],
          ["settings", "설정"],
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
        <IconBtn dark={dark} title="테마 전환" onClick={() => setTw({ dark: !dark })}>
          {dark ? I.sun : I.moon}
        </IconBtn>
        <IconBtn dark={dark} title="설정" onClick={() => setScreen("settings")}>
          {I.gear}
        </IconBtn>
        <div
          className={cls(
            "ml-1 h-7 w-7 rounded-full grid place-items-center text-[11px] font-semibold",
            dark ? "bg-[#3a3a37] text-dink" : "bg-muted text-ink",
          )}
        >
          JK
        </div>
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
    onClick={onClick}
    title={title}
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
