import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_GAJAE_MODEL_PROVIDER,
  DEFAULT_HERMES_MODEL_PROVIDER,
  GAJAE_PROVIDER_PREFERENCE_KEY,
  HERMES_PROVIDER_PREFERENCE_KEY,
  gajecodeCredentialReady,
  modelForGajaeProvider,
  readGajaeModelProviderPreference,
  readHermesModelProviderPreference,
  resolveGajaeNewSessionProvider,
  resolveHermesNewSessionProvider,
  writeGajaeModelProviderPreference,
  writeHermesModelProviderPreference,
} from "../src/lib/agentProviderPreferences.ts";

const source = readFileSync("src/components/ConnectionsPanel.tsx", "utf8");
const workspaceSource = readFileSync("src/components/AgentWorkspace.tsx", "utf8");
const agentSource = readFileSync("src-tauri/src/agent.rs", "utf8");

function assertContainsIn(haystack: string, needle: string, context: string) {
  assert.ok(haystack.includes(needle), `${context}: missing ${needle}`);
}

function assertContains(needle: string, context: string) {
  assertContainsIn(source, needle, context);
}

for (const contract of [
  'data-testid="connection-provider-picker"',
  'data-testid="selected-connection-provider"',
  'data-connection-provider={provider.id}',
  'data-provider-card={def.id}',
  'data-provider-connected={connected ? "true" : "false"}',
  'data-provider-oauth-connected={oauthLoggedIn ? "true" : "false"}',
  'data-provider-oauth-action={def.id}',
  'data-testid="provider-login-modal"',
  'data-provider={provider}',
  'data-provider-login-detected={detected ? "true" : "false"}',
  'data-testid="connection-panel-error"',
  'data-testid="connection-panel-notice"',
  'data-testid="provider-oauth-code-entry"',
  'data-testid="oauth-code-entry"',
  "selectedProviderId",
  'data-testid="browser-handoff-diagnostics"',
  'data-testid="connection-tools"',
  '<FeaturePanels slot="connections" tw={tw} />',
]) {
  assertContains(contract, "compact connections layout");
}

assertContains(
  "if (s.oauth_logged_in)",
  "subscription login completion must require OAuth rather than an API key",
);
// 안내문과 입력칸이 갈라지면 사용자는 붙여넣을 곳 없이 안내만 읽게 된다.
assertContains(
  "codeEntry && !loginModal",
  "the authentication code field must survive closing the login modal",
);
assert.ok(
  !/const \[code, setCode\] = useState/.test(source),
  "the code field state must live in the panel, not inside the modal that can be closed",
);
assertContains(
  "loginState.submit_warning",
  "a code submit that the CLI never answered must reach the user",
);
assert.ok(
  !/Paste the browser authentication code into the field below\./.test(source),
  "copy must not point at a field that only exists inside the modal",
);
assertContains(
  'value: "anthropic"',
  "Hermes must expose Claude as a first-class model provider",
);
assertContains(
  "GAJECODE_BACKENDS",
  "Gajae Code must expose model-provider choices in Connections",
);
assertContains(
  'credentialProvider: "claude"',
  "Hermes Claude backend must reuse the canonical Claude credential",
);
assertContains(
  "readGajaeModelProviderPreference",
  "Gajae Code must read its shared provider preference",
);
assertContains(
  '"새 작업 기본 모델 공급자"',
  "Korean copy must make the new-task default scope explicit",
);
assertContains(
  '"Default model provider for new tasks"',
  "English copy must make the new-task default scope explicit",
);
assertContains(
  "modelProviderDefaultHelp",
  "Provider settings must explain that current tasks remain unchanged",
);
assertContains(
  "gajecodeNeedCred",
  "Gajae Code Connections card must explain missing upstream credentials",
);
assertContains(
  "gajecodeCredentialReady",
  "Gajae Code credential readiness must follow the managed runtime contract",
);
assertContains(
  'Uses the Codex ChatGPT subscription login above',
  "Gajae Code Codex copy must match the OAuth-only bridge contract",
);
assertContains(
  "statuses={statuses}",
  "Gajae Code Connections card must receive upstream credential statuses",
);
assertContainsIn(
  workspaceSource,
  '{ value: "anthropic", label: "Claude" }',
  "Hermes workspace provider picker must expose Claude",
);
assertContainsIn(
  workspaceSource,
  "resolveGajaeNewSessionProvider",
  "Workspace must resolve the persisted Gajae new-task preference",
);
assertContainsIn(
  workspaceSource,
  "resolveHermesNewSessionProvider",
  "Workspace must resolve the persisted Hermes new-task preference",
);
assertContainsIn(
  workspaceSource,
  "writeGajaeModelProviderPreference(arg);",
  "Changing the Gajae provider from the composer must update the saved preference",
);
assertContainsIn(
  workspaceSource,
  "writeHermesModelProviderPreference(arg);",
  "Changing the Hermes provider from the composer must update the saved preference",
);
assertContainsIn(
  workspaceSource,
  'if (provider === "hermes" && hermesProvider === "anthropic") return "claude"',
  "Hermes Claude sessions must use Claude subscription usage",
);
assertContainsIn(
  workspaceSource,
  '? liveClaudeModels',
  "Hermes Claude must reuse the live Claude model catalog",
);
assertContainsIn(
  agentSource,
  '"anthropic" | "claude" => "anthropic".to_string()',
  "Hermes Claude aliases must route to the native Anthropic provider",
);
assertContainsIn(
  agentSource,
  'inject_agent_cli_credential_env(&mut cmd, "claude")',
  "Hermes Claude must receive the canonical Claude credential at runtime",
);
assert.ok(
  !source.includes("if (s.oauth_logged_in || s.api_key_present)"),
  "subscription login must not report success from API-key presence alone",
);

assert.equal(
  (source.match(/<ProviderCard/g) ?? []).length,
  1,
  "provider details must be rendered through one selected ProviderCard path",
);
assert.equal(
  (source.match(/<HermesCard/g) ?? []).length,
  1,
  "Hermes details must be rendered only for the selected provider",
);
assert.equal(
  (source.match(/<GajecodeCard/g) ?? []).length,
  1,
  "Gajae Code update details must be rendered only for the selected provider",
);

const preferenceStorage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    get length() {
      return preferenceStorage.size;
    },
    clear() {
      preferenceStorage.clear();
    },
    getItem(key: string) {
      return preferenceStorage.get(key) ?? null;
    },
    key(index: number) {
      return [...preferenceStorage.keys()][index] ?? null;
    },
    removeItem(key: string) {
      preferenceStorage.delete(key);
    },
    setItem(key: string, value: string) {
      preferenceStorage.set(key, String(value));
    },
  } satisfies Storage,
});

preferenceStorage.set(HERMES_PROVIDER_PREFERENCE_KEY, "not-a-provider");
assert.equal(readHermesModelProviderPreference(), DEFAULT_HERMES_MODEL_PROVIDER);
assert.equal(
  preferenceStorage.get(HERMES_PROVIDER_PREFERENCE_KEY),
  DEFAULT_HERMES_MODEL_PROVIDER,
  "invalid Hermes storage must be repaired to the safe default",
);
preferenceStorage.set(GAJAE_PROVIDER_PREFERENCE_KEY, "unexpected");
assert.equal(readGajaeModelProviderPreference(), DEFAULT_GAJAE_MODEL_PROVIDER);
assert.equal(
  preferenceStorage.get(GAJAE_PROVIDER_PREFERENCE_KEY),
  DEFAULT_GAJAE_MODEL_PROVIDER,
  "invalid Gajae storage must be repaired to the safe default",
);

assert.equal(writeHermesModelProviderPreference("anthropic"), true);
assert.equal(readHermesModelProviderPreference(), "anthropic");
assert.equal(writeGajaeModelProviderPreference("codex"), true);
assert.equal(readGajaeModelProviderPreference(), "codex");
assert.equal(writeHermesModelProviderPreference("grok"), true);
assert.equal(readHermesModelProviderPreference(), "grok");
assert.equal(writeGajaeModelProviderPreference("grok"), true);
assert.equal(readGajaeModelProviderPreference(), "grok");

assert.equal(
  gajecodeCredentialReady("codex", { oauth_logged_in: true, api_key_present: false }),
  true,
  "Gajae Codex must accept the canonical ChatGPT subscription OAuth login",
);
assert.equal(
  gajecodeCredentialReady("codex", { oauth_logged_in: false, api_key_present: true }),
  false,
  "Gajae Codex must not claim ready from an API key that its managed bridge cannot use",
);
assert.equal(
  gajecodeCredentialReady("alibaba", { oauth_logged_in: true, api_key_present: false }),
  false,
  "Gajae Alibaba must not claim ready from OAuth state",
);
assert.equal(
  gajecodeCredentialReady("alibaba", { oauth_logged_in: false, api_key_present: true }),
  true,
  "Gajae Alibaba must accept its Token Plan API key",
);
assert.equal(
  gajecodeCredentialReady("grok", { oauth_logged_in: true, api_key_present: false }),
  false,
  "Gajae Grok must not reuse the Grok CLI browser subscription",
);
assert.equal(
  gajecodeCredentialReady("grok", { oauth_logged_in: false, api_key_present: true }),
  true,
  "Gajae Grok must require the xAI API key",
);
assert.equal(modelForGajaeProvider("grok", "grok-4.5"), "xai/grok-4.5");
assert.equal(
  gajecodeCredentialReady("claude", { oauth_logged_in: true, api_key_present: false }),
  true,
  "Gajae Claude must accept a Claude subscription login",
);
assert.equal(
  gajecodeCredentialReady("claude", { oauth_logged_in: false, api_key_present: true }),
  true,
  "Gajae Claude must accept a Claude API key",
);
assert.equal(
  gajecodeCredentialReady("claude", { oauth_logged_in: false, api_key_present: false }),
  false,
  "Gajae Claude must reject a missing credential",
);
assert.equal(
  gajecodeCredentialReady("codex", null),
  false,
  "Gajae providers must fail closed while credential status is unavailable",
);

assert.deepEqual(
  resolveHermesNewSessionProvider({
    profileId: "hermes",
    profileCommand: "hermes chat -m gpt-5.5 --max-turns 25",
    savedPreference: "anthropic",
  }),
  {
    provider: "anthropic",
    explicitModel: null,
    source: "saved-preference",
  },
  "the shipped Hermes profile must allow the Connections default to control a new task",
);
assert.deepEqual(
  resolveHermesNewSessionProvider({
    profileId: "custom-hermes",
    profileCommand: "hermes chat --provider openrouter --model anthropic/claude-opus-4.8",
    savedPreference: "anthropic",
  }),
  {
    provider: "openrouter",
    explicitModel: "anthropic/claude-opus-4.8",
    source: "profile-provider",
  },
  "an explicit Hermes profile provider/model must override the saved default",
);
assert.deepEqual(
  resolveHermesNewSessionProvider({
    profileId: "custom-hermes-model",
    profileCommand: "hermes chat --model claude-sonnet-4-6",
    savedPreference: "openai-codex",
  }),
  {
    provider: "anthropic",
    explicitModel: "claude-sonnet-4-6",
    source: "profile-model",
  },
  "an explicit Hermes model must infer and override the saved provider",
);
assert.deepEqual(
  resolveGajaeNewSessionProvider({
    profileId: "gajecode",
    profileCommand: "gjc",
    savedPreference: "codex",
  }),
  {
    provider: "codex",
    explicitModel: null,
    source: "saved-preference",
  },
  "a new Gajae task must use the saved provider when the profile has no override",
);
assert.deepEqual(
  resolveGajaeNewSessionProvider({
    profileId: "custom-gajae",
    profileCommand: "gjc --provider alibaba --model qwen3.8-max-preview",
    savedPreference: "codex",
  }),
  {
    provider: "alibaba",
    explicitModel: "qwen3.8-max-preview",
    source: "profile-provider",
  },
  "an explicit Gajae profile provider/model must override the saved default",
);
assert.equal(
  modelForGajaeProvider("alibaba", "qwen3.8-max-preview"),
  "alibaba-token-plan/qwen3.8-max-preview",
  "an explicit Gajae provider must be represented in the runtime model prefix",
);
assert.deepEqual(
  resolveGajaeNewSessionProvider({
    profileId: "custom-gajae-model",
    profileCommand: "gjc --model codex/gpt-5.5",
    savedPreference: "claude",
  }),
  {
    provider: "codex",
    explicitModel: "codex/gpt-5.5",
    source: "profile-model",
  },
  "an explicit Gajae model must infer and override the saved provider",
);

const loadSessionsContract = workspaceSource.slice(
  workspaceSource.indexOf("function loadSessions()"),
  workspaceSource.indexOf("const AgentWorkspace:"),
);
assert.doesNotMatch(
  loadSessionsContract,
  /read(?:Hermes|Gajae)ModelProviderPreference|resolve(?:Hermes|Gajae)NewSessionProvider/,
  "restoring a persisted session must not apply a later new-task provider preference",
);
const makeSessionContract = workspaceSource.slice(
  workspaceSource.indexOf("const makeSession ="),
  workspaceSource.indexOf("const createSession ="),
);
assert.match(makeSessionContract, /resolveHermesNewSessionProvider/);
assert.match(makeSessionContract, /resolveGajaeNewSessionProvider/);

console.log("connections compact layout smoke passed");
