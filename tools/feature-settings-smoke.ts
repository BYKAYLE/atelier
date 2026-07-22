import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

interface ModuleContract {
  id: string;
  featureFile: string;
  runtimeFiles: string[];
  runtimeKeys: string[];
  lockedKeys?: string[];
}

function read(path: string) {
  return readFileSync(path, "utf8");
}

function assertContains(source: string, needle: string, context: string) {
  assert.ok(source.includes(needle), `${context}: missing ${needle}`);
}

const store = read("src/features/featureSettings.ts");
for (const contract of [
  'const STORAGE_KEY = "atelier.featureSettings.v1"',
  "version: 1",
  "sanitizeValues",
  "safeLocalStorageGet",
  "safeLocalStorageSet",
  "subscribeFeatureSettings",
  "resetFeatureSettings",
]) {
  assertContains(store, contract, "feature settings store");
}

const panel = read("src/features/FeatureSettingsPanel.tsx");
for (const contract of [
  "FeatureSettingsPanel",
  "setFeatureSetting",
  "resetFeatureSettings",
  'definition.kind === "locked"',
  'definition.kind === "select"',
  'definition.kind === "number"',
  'role="switch"',
  "overflow-hidden rounded-full",
  "absolute left-0.5 top-0.5",
  'data-testid="feature-module-picker"',
  'data-testid="feature-module-options"',
  "data-feature-module-option={module.id}",
  "aria-pressed={selected}",
  'data-testid="selected-feature-settings"',
  "selectedModuleId",
]) {
  assertContains(panel, contract, "feature settings panel");
}
assert.ok(!panel.includes('data-testid="feature-module-select"'), "feature settings panel: native select must stay removed");

const registry = read("src/features/featureRegistry.tsx");
assertContains(registry, "settings?: FeatureSettingsContribution", "feature registry settings contribution");
assertContains(registry, "getFeatureSetting(module.id, \"enabled\"", "disabled source-control filtering");

const app = read("src/components/App.tsx");
const settings = read("src/components/Settings.tsx");
assertContains(app, 'settingsSection: "features"', "settings navigation");
assertContains(settings, 'section === "features"', "settings section");
assertContains(settings, "FeatureSettingsPanel", "settings panel mount");

const modules: ModuleContract[] = [
  {
    id: "atelier-cli",
    featureFile: "src/components/atelier-cli/feature.tsx",
    runtimeFiles: ["src/components/atelier-cli/feature.tsx"],
    runtimeKeys: ["enabled", "permissionPolicy"],
  },
  {
    id: "github-workflows",
    featureFile: "src/components/github-workflows/feature.tsx",
    runtimeFiles: ["src/components/github-workflows/GithubWorkflowPanel.tsx"],
    runtimeKeys: ["enabled", "refreshIntervalSeconds"],
    lockedKeys: ["writeApproval"],
  },
  {
    id: "linear-workflows",
    featureFile: "src/components/linear-workflows/feature.tsx",
    runtimeFiles: ["src/components/linear-workflows/LinearWorkflowPanel.tsx"],
    runtimeKeys: ["enabled", "refreshIntervalSeconds"],
    lockedKeys: ["writeApproval"],
  },
  {
    id: "ssh-workspaces",
    featureFile: "src/components/ssh-workspaces/feature.tsx",
    runtimeFiles: ["src/components/ssh-workspaces/SshWorkspacesPanel.tsx", "src-tauri/src/ssh_workspaces.rs"],
    runtimeKeys: ["enabled", "autoReconnect", "maxReconnectAttempts", "defaultLocalPort", "defaultRemotePort"],
    lockedKeys: ["strictHostKey"],
  },
  {
    id: "provider-usage",
    featureFile: "src/components/provider-usage/feature.tsx",
    runtimeFiles: ["src/components/provider-usage/ProviderUsagePanel.tsx"],
    runtimeKeys: ["enabled", "autoRefreshMinutes"],
    lockedKeys: ["documentedSurfacesOnly"],
  },
  {
    id: "mobile-control",
    featureFile: "src/components/mobile-control/feature.tsx",
    runtimeFiles: ["src/components/mobile-control/RemoteAccessSection.tsx"],
    runtimeKeys: ["enabled", "allowLanDefault"],
    lockedKeys: ["manualStart", "pairingTtlMinutes"],
  },
  {
    id: "remote-followup",
    featureFile: "src/components/remote-followup/feature.tsx",
    runtimeFiles: ["src/components/remote-followup/RemoteFollowupPanel.tsx"],
    runtimeKeys: ["enabled", "defaultProvider", "defaultEffort", "defaultPermission", "defaultStellaMode"],
    lockedKeys: ["approvalRequired"],
  },
  {
    id: "computer-use",
    featureFile: "src/components/computer-use/feature.tsx",
    runtimeFiles: ["src/components/computer-use/ComputerUsePanel.tsx", "src/components/computer-use/controlRequest.ts"],
    runtimeKeys: ["enabled", "bridgeTimeoutSeconds", "receiptLimit", "allowExternalBrowser"],
    lockedKeys: ["perActionApproval"],
  },
  {
    id: "dev-services",
    featureFile: "src/components/dev-services/feature.tsx",
    runtimeFiles: ["src/components/dev-services/DevServicesPanel.tsx"],
    runtimeKeys: ["enabled", "scanOnOpen", "showUnmatched"],
    lockedKeys: ["stopApproval"],
  },
  {
    id: "automations",
    featureFile: "src/components/automations/feature.tsx",
    runtimeFiles: [
      "src/components/automations/AutomationBackground.tsx",
      "src/components/automations/AutomationsPage.tsx",
    ],
    runtimeKeys: ["enabled", "tickSeconds"],
    lockedKeys: ["safeDispatch"],
  },
];

for (const module of modules) {
  const definition = read(module.featureFile);
  assertContains(definition, `id: "${module.id}"`, `${module.id} registration`);
  const runtime = module.runtimeFiles.map(read).join("\n");
  for (const key of module.runtimeKeys) {
    assertContains(definition, `key: "${key}"`, `${module.id} setting schema`);
    assertContains(runtime, `"${key}"`, `${module.id} runtime setting`);
  }
  for (const key of module.lockedKeys ?? []) {
    assertContains(definition, `key: "${key}"`, `${module.id} locked setting`);
    assertContains(definition, 'kind: "locked"', `${module.id} locked safety setting`);
  }
}

const githubBackend = read("src-tauri/src/github_workflows.rs");
assertContains(githubBackend, "github_workflow_prepare", "GitHub prepare/execute approval");
assertContains(githubBackend, "github_workflow_execute", "GitHub prepare/execute approval");

const linearBackend = read("src-tauri/src/linear_workflows.rs");
assertContains(linearBackend, "linear_workflow_prepare", "Linear prepare/execute approval");
assertContains(linearBackend, "linear_workflow_execute", "Linear prepare/execute approval");

const sshBackend = read("src-tauri/src/ssh_workspaces.rs");
for (const contract of ["trusted_host", "max_reconnect_attempts", "TUNNEL_DEFAULT_MAX_RESTARTS"]) {
  assertContains(sshBackend, contract, "SSH native safety/reconnect settings");
}

const computerBackend = read("src-tauri/src/computer_use.rs");
for (const contract of ["computer_use_prepare", "computer_use_authorize", "computer_use_execute"]) {
  assertContains(computerBackend, contract, "Computer Use one-time approval");
}

const devBackend = read("src-tauri/src/dev_services.rs");
assertContains(devBackend, "dev_service_stop_prepare", "development service stop approval");
assertContains(devBackend, "dev_service_stop_execute", "development service stop approval");

console.log(`feature settings smoke passed (${modules.length} removable modules)`);
