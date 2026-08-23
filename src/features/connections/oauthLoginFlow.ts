export type OauthLoginProvider = "claude" | "codex" | "grok";

export interface LoginUrlAttempt {
  url: string;
  count: number;
  lastAt: number;
}

export interface LoginUrlAttemptPlan {
  shouldOpen: boolean;
  next: LoginUrlAttempt;
  reason: "open" | "cooldown" | "limit";
}

export const OAUTH_LOGIN_RETRY_LIMIT = 3;
export const OAUTH_LOGIN_RETRY_COOLDOWN_MS = 2_000;
export const OAUTH_LOGIN_SIGNAL_TIMEOUT_MS = 20_000;

const ALLOWED_HOSTS: Record<OauthLoginProvider, readonly string[]> = {
  claude: ["claude.ai", "claude.com", "anthropic.com"],
  codex: ["openai.com", "chatgpt.com"],
  grok: ["x.ai", "grok.com"],
};

export function isAllowedOauthLoginUrl(provider: string, value: string): boolean {
  if (provider !== "claude" && provider !== "codex" && provider !== "grok") return false;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HOSTS[provider].some(
      (root) => host === root || host.endsWith(`.${root}`),
    );
  } catch {
    return false;
  }
}

export function planOauthLoginUrlAttempt(
  previous: LoginUrlAttempt | undefined,
  url: string,
  now: number,
  force = false,
): LoginUrlAttemptPlan {
  const current = previous?.url === url
    ? previous
    : { url, count: 0, lastAt: 0 };

  if (!force && current.count >= OAUTH_LOGIN_RETRY_LIMIT) {
    return { shouldOpen: false, next: current, reason: "limit" };
  }
  if (
    !force
    && current.count > 0
    && now - current.lastAt < OAUTH_LOGIN_RETRY_COOLDOWN_MS
  ) {
    return { shouldOpen: false, next: current, reason: "cooldown" };
  }

  return {
    shouldOpen: true,
    next: {
      url,
      count: current.count + 1,
      lastAt: now,
    },
    reason: "open",
  };
}

export function hasOauthLoginSignalTimedOut(
  startedAt: number,
  now: number,
  active: boolean,
  browserOpened: boolean,
  loginUrl?: string | null,
): boolean {
  return (
    active
    && !browserOpened
    && !loginUrl
    && now - startedAt >= OAUTH_LOGIN_SIGNAL_TIMEOUT_MS
  );
}
