import React, { lazy, Suspense, useEffect, useState } from "react";
import { useTweaks } from "../lib/useTweaks";
import { ACCENTS, cls } from "../lib/tokens";
import TopChrome from "./TopChrome";
import Welcome from "./Welcome";
import Main from "./Main";
import Settings from "./Settings";
const DesignPage = lazy(() => import("./DesignPage"));

const App: React.FC = () => {
  const [tw, setTw] = useTweaks();
  const accent = ACCENTS[tw.accent] || ACCENTS.terracotta;
  const [screen, setScreen] = useState<string>(
    () => localStorage.getItem("atelier.screen") || "main",
  );

  useEffect(() => {
    localStorage.setItem("atelier.screen", screen);
  }, [screen]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", tw.dark ? accent.dark : accent.light);
    root.style.setProperty("--accent-hover", accent.hover);
    document.body.classList.toggle("dark", tw.dark);
  }, [tw.dark, accent]);

  return (
    <div
      className={cls(
        "h-full w-full flex flex-col",
        tw.dark ? "bg-dbg text-dink" : "bg-cream text-ink",
      )}
    >
      <TopChrome screen={screen} setScreen={setScreen} tw={tw} setTw={setTw} />
      <div className="flex-1 min-h-0 relative">
        {/* Main과 Settings는 mount 유지 + display 토글. 화면 전환 시 탭/xterm
            상태(채팅 내역, 실행 중 claude 세션 등)가 초기화되는 현상 방지. */}
        <div
          className="absolute inset-0"
          style={{ display: screen === "main" ? "block" : "none" }}
        >
          <Main tw={tw} />
        </div>
        <div
          className="absolute inset-0"
          style={{ display: screen === "settings" ? "block" : "none" }}
        >
          <Settings tw={tw} setTw={setTw} />
        </div>
        {/* 디자인 모드 — lazy import. 클릭 전엔 chunk 미로드. */}
        {screen === "design" && (
          <Suspense
            fallback={
              <div
                className={cls(
                  "absolute inset-0 flex items-center justify-center text-[13px]",
                  tw.dark ? "text-dsub" : "text-sub",
                )}
              >
                Design 모드 로딩 중…
              </div>
            }
          >
            <div className="absolute inset-0">
              <DesignPage tw={tw} />
            </div>
          </Suspense>
        )}
        {screen === "welcome" && <Welcome tw={tw} setScreen={setScreen} />}
      </div>
    </div>
  );
};

export default App;
