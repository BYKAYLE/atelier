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
  "selectedProviderId",
  'data-testid="browser-handoff-diagnostics"',
  'data-testid="connection-tools"',
  '<FeaturePanels slot="connections" tw={tw} />',
]) {
  assertContains(contract, "compact connections layout");
}

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
