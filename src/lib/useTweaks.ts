import { useCallback, useEffect, useState } from "react";
import { DEFAULT_TWEAKS, Tweaks } from "./tokens";

const KEY = "atelier.tweaks";

function load(): Tweaks {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_TWEAKS };
    return { ...DEFAULT_TWEAKS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_TWEAKS };
  }
}

export function useTweaks(): [Tweaks, (patch: Partial<Tweaks>) => void] {
  const [tw, setTw] = useState<Tweaks>(() => load());
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(tw));
    } catch {}
  }, [tw]);
  const patch = useCallback((p: Partial<Tweaks>) => {
    setTw((prev) => ({ ...prev, ...p }));
  }, []);
  return [tw, patch];
}
