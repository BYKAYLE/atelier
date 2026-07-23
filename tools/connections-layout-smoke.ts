import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/ConnectionsPanel.tsx", "utf8");

function assertContains(needle: string, context: string) {
  assert.ok(source.includes(needle), `${context}: missing ${needle}`);
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
