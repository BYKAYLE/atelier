import { useEffect, useRef } from "react";
import { useFeatureSetting } from "../../features/featureSettings";
import { automationsTick } from "../../lib/tauri";
import type { Tweaks } from "../../lib/tokens";

interface Props {
  tw: Tweaks;
}

const AutomationBackground: React.FC<Props> = () => {
  const [enabled] = useFeatureSetting<boolean>("automations", "enabled", true);
  const [tickSeconds] = useFeatureSetting<number>("automations", "tickSeconds", 15);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    async function tick() {
      if (disposed || runningRef.current) return;
      runningRef.current = true;
      try {
        await automationsTick();
      } catch (error) {
        console.warn("Automation schedule tick failed", error);
      } finally {
        runningRef.current = false;
      }
    }

    void tick();
    const interval = window.setInterval(
      () => void tick(),
      Math.max(5, Math.min(300, tickSeconds)) * 1_000,
    );
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [enabled, tickSeconds]);

  return null;
};

export default AutomationBackground;
