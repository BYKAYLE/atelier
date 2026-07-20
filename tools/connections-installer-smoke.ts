import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cliInstallErrorMessage,
  cliInstallOutcome,
  isCliInstallActive,
} from "../src/components/connections/installState.ts";

assert.equal(isCliInstallActive({ phase: "started" } as any), true);
assert.equal(isCliInstallActive({ phase: "running" } as any), true);
assert.equal(isCliInstallActive({ phase: "failed" } as any), false);
assert.equal(isCliInstallActive(null), false);

assert.equal(
  cliInstallOutcome({
    provider: "codex",
    cli_installed: false,
    install_state: { phase: "running" } as any,
    oauth_logged_in: false,
    api_key_present: false,
    api_key_masked: "",
    supports_oauth: true,
    supports_api: true,
  }),
  "running",
);
assert.equal(
  cliInstallOutcome({
    provider: "codex",
    cli_installed: true,
    install_state: { phase: "failed" } as any,
    oauth_logged_in: false,
    api_key_present: false,
    api_key_masked: "",
    supports_oauth: true,
    supports_api: true,
  }),
  "succeeded",
);
assert.equal(
  cliInstallErrorMessage({ phase: "failed", detail: "codex installer exited with code 1." } as any),
  "codex installer exited with code 1.",
);
assert.equal(cliInstallErrorMessage({ phase: "failed" } as any), "CLI installation failed.");

const panel = readFileSync("src/components/ConnectionsPanel.tsx", "utf8");
for (const contract of [
  'from "./connections/installState"',
  "pollCliInstallStatus(",
  "status?.install_state ?? observedInstallState",
  "cliInstallErrorMessage(",
  "isCliInstallActive(",
]) {
  assert.ok(panel.includes(contract), `ConnectionsPanel contract missing: ${contract}`);
}

console.log("connections installer smoke passed");
