import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
assertContains(
  'type HermesBackend = "openai-codex" | "anthropic" | "openrouter" | "alibaba"',
  "Hermes must expose Claude as a first-class backend",
);
assertContains(
  'credentialProvider: "claude"',
  "Hermes Claude backend must reuse the canonical Claude credential",
);
assertContainsIn(
  workspaceSource,
  '{ value: "anthropic", label: "Claude" }',
  "Hermes workspace provider picker must expose Claude",
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

console.log("connections compact layout smoke passed");
