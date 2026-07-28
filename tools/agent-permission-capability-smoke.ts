import assert from "node:assert/strict";
import fs from "node:fs";

const agent = fs.readFileSync(new URL("../src-tauri/src/agent.rs", import.meta.url), "utf8");
const sandbox = fs.readFileSync(new URL("../src-tauri/src/agent_sandbox.rs", import.meta.url), "utf8");
const registry = fs.readFileSync(new URL("../src-tauri/src/agent_registry.rs", import.meta.url), "utf8");
const workspace = fs.readFileSync(new URL("../src/components/AgentWorkspace.tsx", import.meta.url), "utf8");
const tauri = fs.readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const gate = fs.readFileSync(new URL("./orca-feature-release-gate.mjs", import.meta.url), "utf8");

assert.match(registry, /cfg!\(target_os = "macos"\)[\s\S]*Self::Hermes \| Self::GajaeCode/);
assert.match(registry, /execution_controller: "atelier_macos_sandbox_exec"/);
assert.match(registry, /skill_owner: "atelier_managed_hermes"/);
assert.match(registry, /skill_owner: "gajecode_isolated"/);
assert.match(registry, /automatic_online_runtime_bootstrap: true/);

const managedSend = agent.slice(
  agent.indexOf("pub async fn agent_send"),
  agent.indexOf("pub fn agent_runtime_capabilities"),
);
assert.ok(managedSend.indexOf("AgentProviderKind::parse") >= 0);
assert.ok(
  managedSend.indexOf("ensure_managed_agent_permission_support(provider_kind)?")
    < managedSend.indexOf("ensure_managed_agent_runtime"),
  "platform capability must fail closed before automatic runtime bootstrap",
);
assert.match(managedSend, /begin_agent_lifecycle[\s\S]*runtime\.preparing[\s\S]*ensure_managed_agent_runtime/);
assert.match(managedSend, /run_adapter_turn_after_lifecycle/);
assert.match(agent, /wrap_ready_managed_command\([\s\S]*ManagedSandboxSpec/);
assert.match(sandbox, /const MACOS_SANDBOX_EXEC: &str = "\/usr\/bin\/sandbox-exec"/);
assert.match(sandbox, /\(deny default\)/);
assert.doesNotMatch(sandbox, /\(allow default\)/);
assert.match(sandbox, /\(deny appleevent-send\)/);
assert.match(sandbox, /\(deny mach-lookup\)/);
assert.match(sandbox, /\(deny mach-register\)/);
assert.match(sandbox, /provider_immutable_roots[\s\S]*\(deny file-write\*/);
assert.match(sandbox, /ManagedSandboxPermission::Auto[\s\S]*workspace\.to_path_buf/);
assert.match(sandbox, /this platform is unsupported and execution was not started/);
assert.match(
  agent,
  /"sandbox":\{"enabled":true,"autoAllowBashIfSandboxed":false,"allowUnsandboxedCommands":false,"failIfUnavailable":true\}/,
);
assert.match(agent, /push_claude_permission_args\(&mut cmd, &permission_mode\)/);

const directGuard = agent.slice(
  agent.indexOf("fn run_agent_cli_command"),
  agent.indexOf("fn guard_agent_cli_request"),
);
assert.ok(directGuard.indexOf("guard_agent_cli_request") < directGuard.indexOf("validate_agent_cli_command"));

assert.match(tauri, /supports_managed_agent_send: boolean/);
assert.match(tauri, /managed_agent_send_disabled_reason\?: string \| null/);
assert.match(workspace, /agentRuntimeCapabilities\(\)/);
assert.match(workspace, /isRestrictedDirectGajaeCliInput\(input\)/);
assert.match(tauri, /adapter_provider: string/);
assert.match(tauri, /execution_controller: string/);
assert.match(tauri, /skill_owner: string/);
assert.match(tauri, /automatic_online_runtime_bootstrap: boolean/);
assert.match(gate, /smoke:agent-permission-capability/);

console.log("agent permission capability smoke: ok");
