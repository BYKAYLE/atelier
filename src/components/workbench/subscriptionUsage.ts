import type {
  ProviderSubscriptionUsage,
  SubscriptionRateLimitWindow,
} from "../../lib/tauri";
import {
  sessionTokenUsagePresentation,
  type SessionTokenUsage,
  type SessionTokenUsagePresentation,
} from "./sessionTokenUsage";

function finitePercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

function finiteNonNegative(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function normalizeWindow(value: unknown): SubscriptionRateLimitWindow | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SubscriptionRateLimitWindow>;
  const usedPercent = finitePercent(candidate.usedPercent);
  const remainingPercent = finitePercent(candidate.remainingPercent);
  if (typeof candidate.id !== "string" || !candidate.id.trim() || usedPercent === null || remainingPercent === null) {
    return null;
  }
  return {
    id: candidate.id.trim(),
    label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : null,
    usedPercent,
    remainingPercent,
    windowMinutes: finiteNonNegative(candidate.windowMinutes),
    resetsAtUnixSeconds: finiteNonNegative(candidate.resetsAtUnixSeconds),
  };
}

export function normalizeSubscriptionUsage(
  value: unknown,
): ProviderSubscriptionUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<ProviderSubscriptionUsage>;
  if (typeof candidate.provider !== "string" || typeof candidate.source !== "string") return undefined;
  const capturedAtUnixMs = finiteNonNegative(candidate.capturedAtUnixMs);
  const windows = Array.isArray(candidate.windows)
    ? candidate.windows.map(normalizeWindow).filter((window): window is SubscriptionRateLimitWindow => Boolean(window))
    : [];
  if (capturedAtUnixMs === null || windows.length === 0) return undefined;
  return {
    provider: candidate.provider.trim(),
    plan: typeof candidate.plan === "string" && candidate.plan.trim() ? candidate.plan.trim() : null,
    windows,
    source: candidate.source.trim(),
    capturedAtUnixMs,
  };
}

function windowLabel(window: SubscriptionRateLimitWindow, language: "ko" | "en"): string {
  const minutes = window.windowMinutes;
  if (minutes === 300) return language === "en" ? "5h" : "5시간";
  if (minutes === 10_080) return language === "en" ? "7d" : "7일";
  if (typeof minutes === "number" && minutes > 0 && minutes % 1_440 === 0) {
    return language === "en" ? `${minutes / 1_440}d` : `${minutes / 1_440}일`;
  }
  if (typeof minutes === "number" && minutes > 0 && minutes % 60 === 0) {
    return language === "en" ? `${minutes / 60}h` : `${minutes / 60}시간`;
  }
  if (window.id === "five_hour") return language === "en" ? "5h" : "5시간";
  if (window.id === "seven_day") return language === "en" ? "7d" : "7일";
  return window.label || (language === "en" ? "Limit" : "한도");
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function resetLabel(unixSeconds: number | null | undefined, language: "ko" | "en"): string | null {
  if (typeof unixSeconds !== "number" || unixSeconds <= 0) return null;
  const date = new Date(unixSeconds * 1_000);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function subscriptionUsagePresentation(
  subscription: ProviderSubscriptionUsage | undefined,
  sessionTokens: SessionTokenUsage | undefined,
  language: "ko" | "en",
  running: boolean,
): SessionTokenUsagePresentation {
  if (!subscription?.windows.length) {
    return sessionTokenUsagePresentation(sessionTokens, language, running);
  }

  const windows = [...subscription.windows]
    .sort((left, right) => (left.windowMinutes ?? Number.MAX_SAFE_INTEGER) - (right.windowMinutes ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 2);
  const value = windows
    .map((window) => language === "en"
      ? `${windowLabel(window, language)} ${formatPercent(window.usedPercent)} used`
      : `${windowLabel(window, language)} 사용 ${formatPercent(window.usedPercent)}`)
    .join(" · ");
  const provider = subscription.provider === "codex"
    ? "Codex"
    : subscription.provider === "claude"
      ? "Claude"
      : subscription.provider;
  const details = windows.map((window) => {
    const reset = resetLabel(window.resetsAtUnixSeconds, language);
    const base = language === "en"
      ? `${windowLabel(window, language)} window: ${formatPercent(window.usedPercent)} used, ${formatPercent(window.remainingPercent)} remaining`
      : `${windowLabel(window, language)} 창: ${formatPercent(window.usedPercent)} 사용, ${formatPercent(window.remainingPercent)} 남음`;
    if (!reset) return base;
    return language === "en" ? `${base}, resets ${reset}` : `${base}, ${reset} 초기화`;
  });
  const plan = subscription.plan ? ` ${subscription.plan}` : "";
  return {
    value,
    detail: language === "en"
      ? `${provider}${plan} subscription limits. ${details.join(". ")}. Source: ${subscription.source}. Exact remaining token counts are not exposed by the subscription service.`
      : `${provider}${plan} 구독 한도입니다. ${details.join(". ")}. 출처: ${subscription.source}. 구독 서비스가 정확한 남은 토큰 수는 제공하지 않습니다.`,
    consumedPercent: Math.max(...windows.map((window) => window.usedPercent)),
    reported: true,
  };
}
