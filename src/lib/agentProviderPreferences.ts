import { safeLocalStorageGet, safeLocalStorageSet } from "./storage.ts";

export type HermesModelProvider = "openai-codex" | "anthropic" | "openrouter" | "alibaba";
export type GajaeModelProvider = "claude" | "codex" | "alibaba";

export type ModelProviderCredentialStatus = {
  oauth_logged_in?: boolean | null;
  api_key_present?: boolean | null;
};

export const HERMES_PROVIDER_PREFERENCE_KEY = "atelier.hermes.backend";
export const GAJAE_PROVIDER_PREFERENCE_KEY = "atelier.gajecode.backend";

export const DEFAULT_HERMES_MODEL_PROVIDER: HermesModelProvider = "openai-codex";
export const DEFAULT_GAJAE_MODEL_PROVIDER: GajaeModelProvider = "claude";

export type NewSessionProviderResolution<TProvider extends string> = {
  provider: TProvider;
  explicitModel: string | null;
  source: "profile-provider" | "profile-model" | "saved-preference";
};

type NewSessionProviderInput<TProvider extends string> = {
  profileId?: string | null;
  profileCommand?: string | null;
  savedPreference?: TProvider | null;
};

type ProfileProviderOverrides = {
  provider: string | null;
  model: string | null;
};

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeHermesModelProvider(value: unknown): HermesModelProvider {
  const normalized = normalizedString(value);
  if (
    normalized === "openai-codex"
    || normalized === "anthropic"
    || normalized === "openrouter"
    || normalized === "alibaba"
  ) {
    return normalized;
  }
  return DEFAULT_HERMES_MODEL_PROVIDER;
}

export function normalizeGajaeModelProvider(value: unknown): GajaeModelProvider {
  const normalized = normalizedString(value);
  if (normalized === "claude" || normalized === "codex" || normalized === "alibaba") {
    return normalized;
  }
  return DEFAULT_GAJAE_MODEL_PROVIDER;
}

export function readHermesModelProviderPreference(): HermesModelProvider {
  const saved = safeLocalStorageGet(HERMES_PROVIDER_PREFERENCE_KEY);
  const normalized = normalizeHermesModelProvider(saved);
  if (saved !== null && saved !== normalized) {
    safeLocalStorageSet(HERMES_PROVIDER_PREFERENCE_KEY, normalized);
  }
  return normalized;
}

export function readGajaeModelProviderPreference(): GajaeModelProvider {
  const saved = safeLocalStorageGet(GAJAE_PROVIDER_PREFERENCE_KEY);
  const normalized = normalizeGajaeModelProvider(saved);
  if (saved !== null && saved !== normalized) {
    safeLocalStorageSet(GAJAE_PROVIDER_PREFERENCE_KEY, normalized);
  }
  return normalized;
}

export function writeHermesModelProviderPreference(provider: HermesModelProvider) {
  return safeLocalStorageSet(
    HERMES_PROVIDER_PREFERENCE_KEY,
    normalizeHermesModelProvider(provider),
  );
}

export function writeGajaeModelProviderPreference(provider: GajaeModelProvider) {
  return safeLocalStorageSet(
    GAJAE_PROVIDER_PREFERENCE_KEY,
    normalizeGajaeModelProvider(provider),
  );
}

function unquoteFlagValue(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function profileProviderOverrides(command?: string | null): ProfileProviderOverrides {
  const parts = command?.trim().split(/\s+/).filter(Boolean) ?? [];
  let provider: string | null = null;
  let model: string | null = null;
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts[index];
    const next = parts[index + 1];
    if (current === "--provider" && next) {
      provider = unquoteFlagValue(next);
      index += 1;
      continue;
    }
    if (current.startsWith("--provider=")) {
      provider = unquoteFlagValue(current.slice("--provider=".length));
      continue;
    }
    if ((current === "-m" || current === "--model") && next) {
      model = unquoteFlagValue(next);
      index += 1;
      continue;
    }
    if (current.startsWith("--model=")) {
      model = unquoteFlagValue(current.slice("--model=".length));
    }
  }
  return { provider, model };
}

export function profileModelOverride(command?: string | null) {
  return profileProviderOverrides(command).model;
}

function isBuiltInHermesDefault(profileId?: string | null, command?: string | null) {
  if (profileId !== "hermes") return false;
  // This model flag ships with Atelier as the legacy Hermes default; it is not
  // a user-authored override and must not make the Connections preference inert.
  return command?.trim().replace(/\s+/g, " ") === "hermes chat -m gpt-5.5 --max-turns 25";
}

function normalizeHermesProfileProvider(value: unknown): HermesModelProvider {
  const normalized = normalizedString(value);
  if (normalized === "claude") return "anthropic";
  if (normalized === "codex" || normalized === "openai") return "openai-codex";
  return normalizeHermesModelProvider(normalized);
}

function normalizeGajaeProfileProvider(value: unknown): GajaeModelProvider {
  const normalized = normalizedString(value);
  if (normalized === "anthropic") return "claude";
  if (normalized === "openai-codex" || normalized === "openai") return "codex";
  return normalizeGajaeModelProvider(normalized);
}

export function inferHermesModelProviderFromModel(model?: string | null): HermesModelProvider {
  const trimmed = model?.trim() ?? "";
  if (!trimmed) return DEFAULT_HERMES_MODEL_PROVIDER;
  if (/^(?:anthropic\/)?claude-/i.test(trimmed)) return "anthropic";
  if (/^(?:qwen|glm)-?/i.test(trimmed)) return "alibaba";
  if (trimmed.includes("/")) return "openrouter";
  return DEFAULT_HERMES_MODEL_PROVIDER;
}

export function inferGajaeModelProviderFromModel(model?: string | null): GajaeModelProvider {
  const trimmed = model?.trim().toLowerCase() ?? "";
  if (trimmed.startsWith("codex/") || trimmed.startsWith("openai-codex/")) return "codex";
  if (trimmed.startsWith("alibaba-token-plan/")) return "alibaba";
  return DEFAULT_GAJAE_MODEL_PROVIDER;
}

export function modelForGajaeProvider(provider: GajaeModelProvider, model: string) {
  const trimmed = model.trim();
  const withoutKnownPrefix = trimmed
    .replace(/^codex\//i, "")
    .replace(/^openai-codex\//i, "")
    .replace(/^alibaba-token-plan\//i, "")
    .replace(/^anthropic\//i, "");
  if (provider === "codex") return `codex/${withoutKnownPrefix}`;
  if (provider === "alibaba") return `alibaba-token-plan/${withoutKnownPrefix}`;
  return withoutKnownPrefix;
}

export function gajecodeCredentialReady(
  provider: GajaeModelProvider,
  status?: ModelProviderCredentialStatus | null,
) {
  if (!status) return false;
  if (provider === "codex") return Boolean(status.oauth_logged_in);
  if (provider === "alibaba") return Boolean(status.api_key_present);
  return Boolean(status.oauth_logged_in || status.api_key_present);
}

export function resolveHermesNewSessionProvider({
  profileId,
  profileCommand,
  savedPreference = DEFAULT_HERMES_MODEL_PROVIDER,
}: NewSessionProviderInput<HermesModelProvider>): NewSessionProviderResolution<HermesModelProvider> {
  const overrides = isBuiltInHermesDefault(profileId, profileCommand)
    ? { provider: null, model: null }
    : profileProviderOverrides(profileCommand);
  if (overrides.provider) {
    return {
      provider: normalizeHermesProfileProvider(overrides.provider),
      explicitModel: overrides.model,
      source: "profile-provider",
    };
  }
  if (overrides.model) {
    return {
      provider: inferHermesModelProviderFromModel(overrides.model),
      explicitModel: overrides.model,
      source: "profile-model",
    };
  }
  return {
    provider: normalizeHermesModelProvider(savedPreference),
    explicitModel: null,
    source: "saved-preference",
  };
}

export function resolveGajaeNewSessionProvider({
  profileId: _profileId,
  profileCommand,
  savedPreference = DEFAULT_GAJAE_MODEL_PROVIDER,
}: NewSessionProviderInput<GajaeModelProvider>): NewSessionProviderResolution<GajaeModelProvider> {
  const overrides = profileProviderOverrides(profileCommand);
  if (overrides.provider) {
    return {
      provider: normalizeGajaeProfileProvider(overrides.provider),
      explicitModel: overrides.model,
      source: "profile-provider",
    };
  }
  if (overrides.model) {
    return {
      provider: inferGajaeModelProviderFromModel(overrides.model),
      explicitModel: overrides.model,
      source: "profile-model",
    };
  }
  return {
    provider: normalizeGajaeModelProvider(savedPreference),
    explicitModel: null,
    source: "saved-preference",
  };
}
