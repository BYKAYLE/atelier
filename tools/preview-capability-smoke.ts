import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const backend = read("src-tauri/src/agent_preview.rs");
const app = read("src-tauri/src/lib.rs");
const bindings = read("src/lib/tauri.ts");
const workspace = read("src/components/AgentWorkspace.tsx");

assert.match(
  backend,
  /const MANAGED_PREVIEW_DISABLED_REASON: &str =\s*"Managed package-script preview is disabled by Atelier's hardened security policy\./,
  "preview backend should keep the managed-start fail-closed reason in one shared constant",
);
assert.match(
  backend,
  /pub struct PreviewCapability \{[\s\S]*managed_start: bool,[\s\S]*external_loopback_inspection: bool,[\s\S]*managed_start_reason: Option<String>,[\s\S]*\}/,
  "preview capability response should expose managed start, loopback inspection, and the fail-closed reason",
);
assert.match(
  backend,
  /fn preview_capability_snapshot\(\) -> PreviewCapability \{[\s\S]*managed_start: false,[\s\S]*external_loopback_inspection: true,[\s\S]*managed_start_reason: Some\(MANAGED_PREVIEW_DISABLED_REASON\.to_string\(\)\),[\s\S]*\}/,
  "preview capability should fail closed while preserving external localhost inspection",
);
assert.match(
  backend,
  /pub fn preview_capability\(\) -> PreviewCapability \{\s*preview_capability_snapshot\(\)\s*\}/,
  "preview capability should be exported as a Tauri command",
);
assert.match(
  backend,
  /fn start_preview_service[\s\S]*?validate_preview_service_port\(parsed\.port\)\?;[\s\S]*?ensure_managed_preview_execution_enabled\(\)\?;[\s\S]*?validate_provided_preview_command[\s\S]*?spawn_preview_child/,
  "managed preview start should enforce the fail-closed capability before resolving or spawning a workspace command",
);
assert.match(app, /agent_preview::preview_capability/, "app should register the preview capability command");
assert.match(bindings, /export interface PreviewCapability \{/, "tauri bindings should expose the preview capability type");
assert.match(bindings, /export async function previewCapability\(\): Promise<PreviewCapability> \{\s*return invoke\("preview_capability"\);\s*\}/, "tauri bindings should expose the preview capability invoke wrapper");

assert.match(
  workspace,
  /const PREVIEW_CAPABILITY_FAIL_CLOSED: PreviewCapability = \{\s*managed_start: false,\s*external_loopback_inspection: true,\s*managed_start_reason: null,\s*\}/,
  "workspace should default managed preview capability to fail closed before runtime evidence arrives",
);
assert.match(
  workspace,
  /const previewExternalInspectionEnabled = previewCapabilityState\.external_loopback_inspection;/,
  "external localhost inspection should follow the backend capability instead of being stored without effect",
);
assert.match(
  workspace,
  /previewCapabilityState\.managed_start_reason \|\| previewCapabilityError/,
  "the visible managed-start policy should render the backend-provided reason",
);
assert.match(
  workspace,
  /previewServicePolicyDisabled: "Atelier-managed start is disabled for security\. Run a separately trusted localhost service first, then inspect its URL here\."/,
  "English preview policy copy should explain the disabled managed start path",
);
assert.match(
  workspace,
  /previewServicePolicyDisabled: "Atelier 관리 시동은 보안상 비활성입니다\. 별도로 신뢰한 localhost 서비스를 먼저 실행한 뒤 여기서 URL을 검사할 수 있습니다\."/,
  "Korean preview policy copy should explain the disabled managed start path",
);
assert.match(
  workspace,
  /if \(normalized === "full" \|\| normalized === "bypass" \|\| normalized === "danger"\) return "basic";/,
  "legacy full permission values should normalize to read-only basic mode",
);
assert.match(
  workspace,
  /command: "\/permission basic\|auto"/,
  "slash command picker should only advertise basic and auto permission modes",
);
assert.doesNotMatch(
  workspace,
  /\/permission basic\|auto\|full/,
  "help and picker text should no longer advertise full permission",
);
assert.match(
  workspace,
  /Atelier no longer exposes \/permission full\. Legacy full-bypass values fall back to read-only Basic; use Auto Review only for sandboxed workspace edits\./,
  "slash command handler should reject /permission full with guardrail guidance",
);

console.log("preview capability smoke: passed");
