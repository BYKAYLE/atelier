import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFeatureSetting } from "../../features/featureSettings";
import { providerUsageSnapshot, type ProviderUsageSnapshot } from "../../lib/tauri";
import { cls, type Tweaks } from "../../lib/tokens";
import { I } from "../Icons";
import { providerQuotaLabel, providerUsageTone } from "./providerUsage";

interface Props {
  tw: Tweaks;
}

const ProviderUsagePanel: React.FC<Props> = ({ tw }) => {
  const [featureEnabled] = useFeatureSetting<boolean>("provider-usage", "enabled", true);
  const [autoRefreshMinutes] = useFeatureSetting<number>("provider-usage", "autoRefreshMinutes", 0);
  const [snapshot, setSnapshot] = useState<ProviderUsageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const ko = tw.language === "ko";
  const dark = tw.dark;

  const refresh = useCallback(async () => {
    if (!featureEnabled) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await providerUsageSnapshot());
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [featureEnabled]);

  useEffect(() => {
    if (!featureEnabled || autoRefreshMinutes <= 0) return;
    refresh().catch(console.error);
    const timer = window.setInterval(() => {
      refresh().catch(console.error);
    }, autoRefreshMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefreshMinutes, featureEnabled, refresh]);

  return (
    <section className={cls("rounded-lg border p-4", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[14px] font-medium">
            <span className="text-[var(--accent)]">{I.globe}</span>
            {ko ? "공급자 사용량" : "Provider usage"}
          </div>
          <p className={cls("mt-1 text-[12.5px] leading-relaxed", dark ? "text-dsub" : "text-sub")}>
            {ko
              ? "공식적으로 공개된 사용량만 조회합니다. 자격증명이나 비공개 엔드포인트는 읽지 않습니다."
              : "Reads only documented usage surfaces. Credentials and private endpoints are never exposed."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || !featureEnabled}
          className={cls(
            "h-8 shrink-0 rounded-md border px-3 text-[12px] font-medium disabled:opacity-50",
            dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
          )}
        >
          {loading ? (ko ? "조회 중..." : "Loading...") : ko ? "사용량 새로고침" : "Refresh usage"}
        </button>
      </div>

      {!featureEnabled && (
        <div className={cls("mt-3 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
          {ko ? "기능 설정에서 공급자 사용량을 켜세요." : "Enable provider usage in Feature settings."}
        </div>
      )}

      {featureEnabled && snapshot && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {snapshot.entries.map((entry) => {
            const tone = providerUsageTone(entry);
            const color = tone === "ok" ? "#2f7d5b" : tone === "warn" ? "#c2742b" : "#94a3b8";
            return (
              <article
                key={entry.provider}
                className={cls("min-w-0 rounded-md border px-3 py-2.5", dark ? "border-dline bg-dbg" : "border-line bg-cream")}
              >
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                  <span className="text-[12.5px] font-medium">{entry.displayName}</span>
                  {entry.version && (
                    <span className={cls("ml-auto truncate text-[10.5px] gb-mono", dark ? "text-dsub" : "text-sub")}>
                      {entry.version}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-[12px] font-medium">{providerQuotaLabel(entry, tw.language)}</div>
                {entry.accountLabel && (
                  <div className={cls("mt-1 truncate text-[11px]", dark ? "text-dsub" : "text-sub")}>
                    {entry.accountLabel}
                  </div>
                )}
                <div className={cls("mt-1 text-[10.5px] leading-relaxed", dark ? "text-dsub" : "text-sub")}>
                  {entry.note}
                </div>
                {entry.error && <div className="mt-1 text-[10.5px] text-red-500">{entry.error}</div>}
              </article>
            );
          })}
        </div>
      )}

      {featureEnabled && !snapshot && !error && (
        <div className={cls("mt-3 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
          {ko
            ? "외부 조회는 버튼을 누를 때만 실행됩니다."
            : "External usage lookup runs only when you press refresh."}
        </div>
      )}
      {error && <div className="mt-3 text-[11.5px] text-red-500">{error}</div>}
    </section>
  );
};

export default ProviderUsagePanel;
