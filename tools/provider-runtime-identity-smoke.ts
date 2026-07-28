import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync(new URL("../src/components/AgentWorkspace.tsx", import.meta.url), "utf8");
const connections = readFileSync(new URL("../src/components/ConnectionsPanel.tsx", import.meta.url), "utf8");
const tauri = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const cliInstallers = readFileSync(new URL("../src/lib/cliInstallers.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

for (const label of [
  'agentLabel: "에이전트"',
  'providerLabel: "모델 공급자"',
  'executionLabel: "실행"',
  'skillsLabel: "스킬"',
]) {
  assert.ok(workspace.includes(label), `workspace identity must expose ${label}`);
}

assert.match(
  workspace,
  /첫 사용 시 고정 버전 격리 런타임과 어댑터 전용 기본 스킬을 자동 준비합니다\. 별도 스킬 설치는 필요 없습니다\./,
);
assert.match(workspace, /data-testid="agent-runtime-identity"/);
assert.match(workspace, /activeModelSurfaceTitle[\s\S]*copy\.agentLabel[\s\S]*copy\.providerLabel/);
assert.match(
  workspace,
  /activeProvider === "hermes"[\s\S]*labelForOption\(HERMES_PROVIDERS[\s\S]*labelForOption\(GAJECODE_PROVIDERS/,
  "Hermes/Gajae agent identity must remain separate from its selected model provider",
);

assert.match(
  workspace,
  /if \(!capability \|\| capability\.supports_managed_agent_send\) return null/,
  "capability loading must not create a blanket composer lock; the backend send flag is authoritative",
);
assert.doesNotMatch(workspace, /managed-agent-permission-disabled-reason/);
assert.doesNotMatch(workspace, /Gajae Code managed agent execution is disabled/);
assert.doesNotMatch(workspace, /Hermes managed agent execution is disabled/);
assert.match(workspace, /data-testid="managed-agent-runtime-unavailable"/);
assert.match(workspace, /Direct GJC, Team, and RLM commands remain available/);
assert.match(workspace, /function actionableManagedAgentFailure/);
assert.match(workspace, /선택한 모델 공급자의 인증이 필요합니다/);
assert.match(workspace, /설치·복구를 실행한 뒤 작업을 다시 보내세요/);
assert.match(workspace, /onManagedAgentRuntimeProgress/);
assert.match(workspace, /bootstrapping_skills: \{ ko: "전용 기본 스킬 준비 중…"/);
assert.match(workspace, /data-testid="managed-agent-runtime-bootstrap-failed"/);
assert.match(
  workspace,
  /data-testid="managed-agent-runtime-bootstrap-failed"[\s\S]*atelier-factory-launcher-copy/,
  "transient runtime banners must collapse before reduced-window send controls",
);
assert.match(workspace, /isRestrictedDirectGajaeCliInput\(input\)/);
assert.match(workspace, /Boolean\(activeManagedAgentDisabledReason\) && !directGajaeCliInput/);

const permissionBlock = workspace.slice(
  workspace.indexOf("const PERMISSION_MODES"),
  workspace.indexOf("const isProvider"),
);
assert.match(permissionBlock, /value: "basic"/);
assert.match(permissionBlock, /value: "auto"/);
assert.doesNotMatch(permissionBlock, /value: "full"/);
assert.match(workspace, /command: "\/permission basic\|auto"/);
assert.match(workspace, /data-testid="agent-send"/);
assert.match(workspace, /data-testid="agent-stop-composer"/);
assert.match(workspace, /\(e\.metaKey \|\| e\.ctrlKey\) && e\.key === "Enter"/);
assert.match(styles, /\.atelier-composer-compact \.atelier-factory-launcher-copy[\s\S]*display: none !important/);

for (const field of [
  "adapter_provider: string",
  "execution_controller: string",
  "skill_owner: string",
  "automatic_online_runtime_bootstrap: boolean",
  "supports_managed_agent_send: boolean",
]) {
  assert.ok(tauri.includes(field), `runtime capability must type ${field}`);
}
assert.match(workspace, /execution_controller: "atelier_macos_sandbox_exec"/);
assert.match(workspace, /skill_owner: "atelier_managed_hermes"/);
assert.match(workspace, /skill_owner: "gajecode_isolated"/);
for (const field of [
  "providerRoot: string",
  "runtimePin: string",
  "dependencyPin?: string | null",
  "policyVersion: string",
  "skillBootstrapVersion: string",
  "receiptPath: string",
]) {
  assert.ok(tauri.includes(field), `runtime readiness must type ${field}`);
}
assert.match(tauri, /"bootstrapping_skills"/);
assert.match(tauri, /listen<ManagedAgentRuntimeProgress>\("managed-agent-runtime-progress"/);
assert.match(tauri, /invoke\("provider_prepare_managed_runtime", \{ provider \}\)/);

assert.match(connections, /agentKind: "에이전트"/);
assert.match(connections, /modelProviderKind: "모델 공급자"/);
assert.match(connections, /hermesBackendLabel: "새 작업 기본 모델 공급자"/);
assert.match(connections, /gajecodeBackendLabel: "새 작업 기본 모델 공급자"/);
assert.match(connections, /modelProviderDefaultHelp/);
assert.match(connections, /data-testid="gajecode-install-repair"/);
assert.match(connections, /data-testid="gajecode-isolated-skills"/);
assert.match(connections, /await providerPrepareManagedRuntime\("gajecode"\)/);
assert.match(connections, /await providerPrepareManagedRuntime\("hermes"\)/);
assert.match(connections, /data-testid="gajecode-runtime-progress"/);
assert.match(connections, /data-testid="hermes-runtime-progress"/);
assert.match(connections, /data-testid="managed-runtime-readiness-receipt"/);
assert.match(
  connections,
  /Mac의 공용 스킬을 가져오지 않으며 별도 설치가 필요 없습니다/,
);
assert.match(
  connections,
  /첫 사용 시 고정 버전 런타임과 전용 기본 스킬을 자동 준비하므로 Atelier만 설치하면 됩니다/,
);

assert.match(cliInstallers, /gajecode:\s*\{\s*executable: "gjc"/);
assert.doesNotMatch(cliInstallers, /profile\.autoInstall === "gajecode"/);

console.log("provider runtime identity smoke: ok");
