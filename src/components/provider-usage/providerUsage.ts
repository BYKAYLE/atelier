import type { ProviderUsageEntry } from "../../lib/tauri";

function subscriptionWindowLabel(
  minutes: number | null | undefined,
  id: string,
  language: "ko" | "en",
): string {
  if (minutes === 300 || id === "five_hour") return language === "ko" ? "5시간" : "5h";
  if (minutes === 10_080 || id === "seven_day") return language === "ko" ? "7일" : "7d";
  return language === "ko" ? "한도" : "Limit";
}

export function providerQuotaLabel(entry: ProviderUsageEntry, language: "ko" | "en"): string {
  const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
  if (entry.subscriptionUsage?.windows.length) {
    return [...entry.subscriptionUsage.windows]
      .sort((left, right) => (left.windowMinutes ?? Number.MAX_SAFE_INTEGER) - (right.windowMinutes ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 2)
      .map((window) => language === "ko"
        ? `${subscriptionWindowLabel(window.windowMinutes, window.id, language)} 사용 ${number(window.usedPercent)}%`
        : `${subscriptionWindowLabel(window.windowMinutes, window.id, language)} ${number(window.usedPercent)}% used`)
      .join(" · ");
  }
  if (typeof entry.quotaUsed === "number" && typeof entry.quotaLimit === "number") {
    return language === "ko"
      ? `${number(entry.quotaUsed)} 사용 / ${number(entry.quotaLimit)} 한도`
      : `${number(entry.quotaUsed)} used / ${number(entry.quotaLimit)} limit`;
  }
  if (typeof entry.quotaRemaining === "number") {
    return language === "ko" ? `${number(entry.quotaRemaining)} 남음` : `${number(entry.quotaRemaining)} remaining`;
  }
  if (!entry.connected) return language === "ko" ? "연결 안 됨" : "Not connected";
  return language === "ko" ? "사용량 데이터 대기" : "Waiting for usage data";
}

export function providerUsageTone(entry: ProviderUsageEntry): "ok" | "warn" | "neutral" {
  if (entry.error) return "warn";
  if (entry.connected) return "ok";
  return "neutral";
}
