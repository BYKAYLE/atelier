import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { cls, PROFILES, Tweaks } from "../lib/tokens";
import { I } from "./Icons";
import {
  clipboardSaveImage,
  isTauri,
  onPtyData,
  onPtyExit,
  ptyKill,
  ptyResize,
  ptySpawn,
  ptyWrite,
} from "../lib/tauri";

interface Tab {
  id: string;
  profile: string;
  name: string;
  dot: string;
  term: Terminal;
  fit: FitAddon;
  unlistenData?: () => void;
  unlistenExit?: () => void;
}

interface Props {
  tw: Tweaks;
}

const Main: React.FC<Props> = ({ tw }) => {
  const dark = tw.dark;
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const termContainerRef = useRef<HTMLDivElement | null>(null);

  // 탭 하나 추가
  async function spawnTab(profileId: string) {
    if (!isTauri()) {
      console.warn("Tauri 환경 아님 — 프로토타입 모드");
      return;
    }
    const p = PROFILES.find((x) => x.id === profileId) || PROFILES[0];
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", Menlo, monospace',
      fontSize: tw.terminalFontPx,
      cursorStyle: tw.cursorStyle,
      cursorBlink: true,
      theme: dark
        ? {
            background: "#1f1f1d",
            foreground: "#faf9f5",
            cursor: "#da7756",
            selectionBackground: "#3d3d3b",
          }
        : {
            background: "#ffffff",
            foreground: "#2d2d2d",
            cursor: "#c96442",
            selectionBackground: "#e5e3db",
          },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    // 일단 크기를 기본값으로 — mount 후 fit
    const cols = 80;
    const rows = 24;

    const { id } = await ptySpawn(p.id, cols, rows);
    const unlistenData = await onPtyData(id, (bytes) => {
      term.write(bytes);
    });
    const unlistenExit = await onPtyExit(id, (code) => {
      term.writeln(`\r\n\x1b[90m[exit ${code ?? "?"}]\x1b[0m`);
    });

    term.onData((d) => {
      ptyWrite(id, d).catch(console.error);
    });
    term.onResize(({ cols, rows }) => {
      ptyResize(id, cols, rows).catch(console.error);
    });

    const tab: Tab = {
      id,
      profile: p.id,
      name: p.name,
      dot: p.dot,
      term,
      fit,
      unlistenData,
      unlistenExit,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveId(id);
    setShowPicker(false);
  }

  // 첫 mount에 claude 탭 자동 개설
  useEffect(() => {
    if (!isTauri()) return;
    if (tabs.length === 0) {
      spawnTab("claude").catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 활성 탭 DOM 붙이기 + fit
  useEffect(() => {
    const host = termContainerRef.current;
    if (!host) return;
    host.innerHTML = "";
    const tab = tabs.find((t) => t.id === activeId);
    if (!tab) return;
    tab.term.open(host);
    requestAnimationFrame(() => {
      try {
        tab.fit.fit();
      } catch {}
      tab.term.focus();
    });
    const onResize = () => {
      try {
        tab.fit.fit();
      } catch {}
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [activeId, tabs]);

  // 클립보드 이미지 paste — Ctrl+V 전역 처리
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          e.preventDefault();
          const blob = it.getAsFile();
          if (!blob) return;
          const buf = new Uint8Array(await blob.arrayBuffer());
          try {
            const path = await clipboardSaveImage(buf);
            const tab = tabs.find((t) => t.id === activeId);
            if (tab) {
              // 경로를 현재 세션 stdin에 주입 — Claude Code는 드랍된 파일을 첨부로 인식
              await ptyWrite(tab.id, path);
            }
          } catch (err) {
            console.error("clipboard image error", err);
          }
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [activeId, tabs]);

  // 탭 닫기
  async function closeTab(id: string) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    tab.unlistenData?.();
    tab.unlistenExit?.();
    try {
      await ptyKill(id);
    } catch {}
    tab.term.dispose();
    setTabs((prev) => prev.filter((t) => t.id !== id));
    setActiveId((curr) => {
      if (curr !== id) return curr;
      const rest = tabs.filter((t) => t.id !== id);
      return rest.length ? rest[rest.length - 1].id : null;
    });
  }

  return (
    <div
      className={cls(
        "h-full w-full flex fade-in",
        dark ? "bg-dbg text-dink" : "bg-cream text-ink",
      )}
    >
      {/* Sidebar */}
      <aside
        className={cls(
          "w-[240px] shrink-0 h-full border-r flex flex-col",
          dark ? "border-dline" : "border-line",
        )}
      >
        <div
          className={cls(
            "h-10 px-3 flex items-center border-b text-[11px] font-mono uppercase tracking-wider",
            dark ? "border-dline text-dsub" : "border-line text-sub",
          )}
        >
          세션
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-0.5">
          {tabs.length === 0 && (
            <div
              className={cls(
                "text-[12px] leading-[1.6] p-3 rounded-[8px]",
                dark ? "text-dsub" : "text-sub",
              )}
            >
              열린 세션이 없습니다. 아래 + 버튼으로 새 세션을 시작하세요.
            </div>
          )}
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={cls(
                "w-full h-9 px-2.5 rounded-[7px] text-left text-[13px] flex items-center gap-2.5 transition-colors group",
                activeId === t.id
                  ? dark
                    ? "bg-dmuted text-dink"
                    : "bg-surface text-ink shadow-[0_0_0_1px_#e5e3db]"
                  : dark
                    ? "text-dsub hover:text-dink hover:bg-[#2a2a28]"
                    : "text-sub hover:text-ink hover:bg-muted",
              )}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: t.dot }}
              />
              <span className="flex-1 truncate">{t.name}</span>
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                className={cls(
                  "opacity-0 group-hover:opacity-100 h-5 w-5 grid place-items-center rounded-[4px]",
                  dark ? "hover:bg-[#3d3d3b]" : "hover:bg-line",
                )}
              >
                {I.x}
              </span>
            </button>
          ))}
        </div>

        <div className={cls("relative border-t p-2", dark ? "border-dline" : "border-line")}>
          <button
            onClick={() => setShowPicker((v) => !v)}
            className={cls(
              "w-full h-9 rounded-[7px] text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors",
              dark
                ? "text-dsub hover:text-dink hover:bg-dmuted"
                : "text-sub hover:text-ink hover:bg-muted",
            )}
          >
            {I.plus} 새 세션
          </button>
          {showPicker && (
            <div
              className={cls(
                "absolute bottom-12 left-2 right-2 rounded-[10px] border overflow-hidden z-10",
                dark ? "bg-dsurf border-dline" : "bg-surface border-line",
              )}
            >
              {PROFILES.filter((p) => p.id !== "custom").map((p) => (
                <button
                  key={p.id}
                  onClick={() => spawnTab(p.id)}
                  className={cls(
                    "w-full h-9 px-3 text-left text-[13px] flex items-center gap-2.5 transition-colors",
                    dark ? "hover:bg-dmuted text-dink" : "hover:bg-muted text-ink",
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: p.dot }}
                  />
                  {p.name}
                  <span
                    className={cls(
                      "ml-auto font-mono text-[11px]",
                      dark ? "text-dsub" : "text-sub",
                    )}
                  >
                    {p.cmd}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main split */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div
          className={cls(
            "h-10 px-4 flex items-center justify-between border-b",
            dark ? "border-dline" : "border-line",
          )}
        >
          <div
            className={cls(
              "text-[12px] font-mono",
              dark ? "text-dsub" : "text-sub",
            )}
          >
            {activeId
              ? tabs.find((t) => t.id === activeId)?.name
              : "세션 없음"}
          </div>
          <div
            className={cls(
              "text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5",
              dark ? "text-dsub" : "text-sub",
            )}
          >
            {I.paperclip} Ctrl+V 이미지 붙여넣기 지원
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Terminal */}
          <div className="flex-1 min-w-0 relative">
            {!isTauri() && (
              <div
                className={cls(
                  "absolute inset-0 z-10 flex items-center justify-center p-8 text-center",
                  dark ? "text-dsub" : "text-sub",
                )}
              >
                <div>
                  <div
                    className={cls(
                      "text-[14px] mb-2",
                      dark ? "text-dink" : "text-ink",
                    )}
                  >
                    Tauri 런타임에서만 실제 터미널이 동작합니다.
                  </div>
                  <div className="text-[12px]">
                    <code className="font-mono">npm run tauri:dev</code> 로 실행하세요.
                  </div>
                </div>
              </div>
            )}
            <div
              ref={termContainerRef}
              className={cls(
                "h-full w-full",
                dark ? "bg-dbg" : "bg-cream",
              )}
            />
          </div>

          {/* Preview */}
          <div
            className={cls(
              "w-[420px] shrink-0 border-l flex flex-col",
              dark ? "border-dline bg-dsurf" : "border-line bg-surface",
            )}
          >
            <div
              className={cls(
                "h-10 px-3 flex items-center border-b text-[11px] font-mono uppercase tracking-wider",
                dark ? "border-dline text-dsub" : "border-line text-sub",
              )}
            >
              {I.eye} 미리보기
            </div>
            <div className="flex-1 overflow-auto p-6">
              <h2
                className={cls(
                  "font-display text-[22px] font-[500] tracking-[-0.01em] leading-[1.18] mb-3",
                  dark ? "text-dink" : "text-ink",
                )}
              >
                결과물이 여기에 자동으로 표시됩니다.
              </h2>
              <p
                className={cls(
                  "text-[13.5px] leading-[1.7]",
                  dark ? "text-dsub" : "text-sub",
                )}
              >
                세션이 HTML·마크다운·이미지를 생성하면 라이브 프리뷰가 열립니다.
                <br />
                Claude Code 아티팩트와 궁합이 좋습니다.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 text-[12px]">
                {[
                  { k: "Ctrl+V", v: "이미지 붙여넣기" },
                  { k: "Ctrl+T", v: "새 탭" },
                  { k: "Ctrl+W", v: "탭 닫기" },
                  { k: "Ctrl+P", v: "미리보기 토글" },
                ].map((r) => (
                  <div
                    key={r.k}
                    className={cls(
                      "flex items-center justify-between p-2 rounded-[6px] border",
                      dark ? "border-dline" : "border-line",
                    )}
                  >
                    <span className={cls("font-mono", dark ? "text-dsub" : "text-sub")}>
                      {r.k}
                    </span>
                    <span
                      className={cls(
                        "text-[11px]",
                        dark ? "text-dink" : "text-ink",
                      )}
                    >
                      {r.v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Main;
