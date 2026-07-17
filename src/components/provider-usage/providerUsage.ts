import type { ProviderUsageEntry } from "../../lib/tauri";

export function providerQuotaLabel(entry: ProviderUsageEntry, language: "ko" | "en"): string {
  const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
  if (typeof entry.quotaUsed === "number" && typeof entry.quotaLimit === "number") {
    return language === "ko"
      ? `${number(entry.quotaUsed)} 사용 / ${number(entry.quotaLimit)} 한도`
      : `${number(entry.quotaUsed)} used / ${number(entry.quotaLimit)} limit`;
  }
  if (typeof entry.quotaRemaining === "number") {
    return language === "ko" ? `${number(entry.quotaRemaining)} 남음` : `${number(entry.quotaRemaining)} remaining`;
  }
  return language === "ko" ? "공개 사용량 API 없음" : "No documented usage API";
}

export function providerUsageTone(entry: ProviderUsageEntry): "ok" | "warn" | "neutral" {
  if (entry.error) return "warn";
  if (entry.connected) return "ok";
  return "neutral";
}
