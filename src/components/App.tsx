import React, { useEffect, useState } from "react";
import { useTweaks } from "../lib/useTweaks";
import { ACCENTS, cls } from "../lib/tokens";
import TopChrome from "./TopChrome";
import Welcome from "./Welcome";
import Main from "./Main";
import Settings from "./Settings";

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
        {screen === "welcome" && <Welcome tw={tw} setScreen={setScreen} />}
        {screen === "main" && <Main tw={tw} />}
        {screen === "settings" && <Settings tw={tw} setTw={setTw} />}
      </div>
    </div>
  );
};

export default App;
