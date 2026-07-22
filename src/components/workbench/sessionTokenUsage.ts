import type { AgentTokenUsageEvent } from "../../lib/tauri";

export type SessionTokenUsage = AgentTokenUsageEvent;

function finiteToken(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

export function normalizeSessionTokenUsage(value: unknown): SessionTokenUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<AgentTokenUsageEvent>;
  const totalTokens = finiteToken(candidate.total_tokens);
  const inputTokens = finiteToken(candidate.input_tokens);
  const outputTokens = finiteToken(candidate.output_tokens);
  const timestampMs = finiteToken(candidate.timestamp_ms);
  if (totalTokens === null || inputTokens === null || outputTokens === null || timestampMs === null) {
    return undefined;
  }
  const contextWindow = finiteToken(candidate.context_window);
  const reportedRemaining = finiteToken(candidate.remaining_tokens);
  const remainingTokens = contextWindow === null
    ? null
    : Math.min(contextWindow, reportedRemaining ?? Math.max(0, contextWindow - totalTokens));
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: finiteToken(candidate.cache_read_tokens),
    cache_write_tokens: finiteToken(candidate.cache_write_tokens),
    total_tokens: totalTokens,
    context_window: contextWindow,
    remaining_tokens: remainingTokens,
    model: typeof candidate.model === "string" && candidate.model.trim() ? candidate.model.trim() : null,
    source: typeof candidate.source === "string" && candidate.source.trim() ? candidate.source : "provider",
    timestamp_ms: timestampMs,
  };
}

export function formatCompactTokens(value: number): string {
  const tokenCount = Math.max(0, Math.floor(value));
  if (tokenCount >= 1_000_000) {
    return `${(tokenCount / 1_000_000).toFixed(tokenCount >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  }
  if (tokenCount >= 1_000) {
    return `${(tokenCount / 1_000).toFixed(tokenCount >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  }
  return tokenCount.toLocaleString("en-US");
}

export interface SessionTokenUsagePresentation {
  value: string;
  detail: string;
  consumedPercent: number | null;
  reported: boolean;
}

export function sessionTokenUsagePresentation(
  usage: SessionTokenUsage | undefined,
  language: "ko" | "en",
  running: boolean,
): SessionTokenUsagePresentation {
  if (!usage) {
    return {
      value: running
        ? (language === "en" ? "Checking usage" : "사용량 확인 중")
        : (language === "en" ? "Remaining unavailable" : "잔량 미제공"),
      detail: language === "en"
        ? "This agent has not reported token usage for the current session yet. Subscription quota is not estimated."
        : "이 에이전트가 현재 세션의 토큰 사용량을 아직 보고하지 않았습니다. 구독 할당량은 추정하지 않습니다.",
      consumedPercent: null,
      reported: false,
    };
  }

  const contextWindow = usage.context_window ?? null;
  const remaining = usage.remaining_tokens ?? (
    contextWindow === null ? null : Math.max(0, contextWindow - usage.total_tokens)
  );
  if (contextWindow !== null && remaining !== null) {
    const consumed = Math.min(contextWindow, Math.max(0, contextWindow - remaining));
    const consumedPercent = contextWindow > 0 ? Math.min(100, (consumed / contextWindow) * 100) : 0;
    return {
      value: language === "en"
        ? `${formatCompactTokens(remaining)} left`
        : `${formatCompactTokens(remaining)} 남음`,
      detail: language === "en"
        ? `Current session context: ${formatCompactTokens(consumed)} used of ${formatCompactTokens(contextWindow)}. This is not the remaining monthly or weekly subscription quota.`
        : `현재 세션 컨텍스트: ${formatCompactTokens(contextWindow)} 중 ${formatCompactTokens(consumed)} 사용. 월간·주간 구독 잔여량이 아닙니다.`,
      consumedPercent,
      reported: true,
    };
  }

  return {
    value: language === "en"
      ? `${formatCompactTokens(usage.total_tokens)} used`
      : `${formatCompactTokens(usage.total_tokens)} 사용`,
    detail: language === "en"
      ? `The agent reported ${formatCompactTokens(usage.total_tokens)} tokens for this run, but did not expose a context limit, so the remaining amount cannot be calculated.`
      : `에이전트가 이번 실행에서 ${formatCompactTokens(usage.total_tokens)} 토큰을 보고했지만 컨텍스트 한도를 제공하지 않아 잔량은 계산할 수 없습니다.`,
    consumedPercent: null,
    reported: true,
  };
}
