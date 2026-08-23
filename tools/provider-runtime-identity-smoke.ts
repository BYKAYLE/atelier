import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gajecodeUpdateMatchesReadiness } from "../src/lib/gajecodeUpdateContract.ts";
import {
  compareUpstreamToPin,
  upstreamReferenceLine,
} from "../src/lib/agentUpstreamContract.ts";

const workspace = readFileSync(new URL("../src/components/AgentWorkspace.tsx", import.meta.url), "utf8");
const connections = readFileSync(new URL("../src/components/ConnectionsPanel.tsx", import.meta.url), "utf8");
const managedAgentUpdatePanel = readFileSync(
  new URL("../src/components/connections/ManagedAgentUpdatePanel.tsx", import.meta.url),
  "utf8",
);
const tauri = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const credentials = readFileSync(new URL("../src-tauri/src/credentials.rs", import.meta.url), "utf8");
const upstreamCheck = readFileSync(new URL("../src-tauri/src/upstream_check.rs", import.meta.url), "utf8");
const cliInstallers = readFileSync(new URL("../src/lib/cliInstallers.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const gajecodeCard = connections.slice(
  connections.indexOf("const GajecodeCard"),
  connections.indexOf("const GrokRuntimeCard"),
);
const grokCard = connections.slice(
  connections.indexOf("const GrokRuntimeCard"),
  connections.indexOf("const LoginModal"),
);
const hermesCard = connections.slice(
  connections.indexOf("const HermesCard"),
  connections.indexOf("const GajecodeCard"),
);

for (const label of [
  'agentLabel: "에이전트"',
  'providerLabel: "모델 공급자"',
]) {
  assert.ok(workspace.includes(label), `workspace identity must expose ${label}`);
}

assert.doesNotMatch(workspace, /data-testid="agent-runtime-identity"/);
assert.doesNotMatch(workspace, /activeRuntimeIdentitySummary/);
assert.doesNotMatch(workspace, /managedRuntimeProgressLabel/);
assert.doesNotMatch(
  workspace,
  /One launcher for goal, analysis, verification, security, and final audit\.|목표만 입력하면 계획, 실행, 검증, 보안, 최종감사까지 자동 진행합니다\./,
);
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
assert.match(workspace, /activeRuntimeProgress\?\.state === "failed"/);
assert.match(workspace, /data-testid="managed-agent-runtime-bootstrap-failed"/);
assert.match(
  workspace,
  /data-testid="managed-agent-runtime-bootstrap-failed"[\s\S]*atelier-factory-launcher-copy/,
  "transient runtime banners must collapse before reduced-window send controls",
);
assert.match(workspace, /restrictedDirectGajaeInput: isRestrictedDirectGajaeCliInput\(rawText\)/);
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
assert.match(connections, /data-testid="hermes-install-repair"/);
assert.match(connections, /data-testid="gajecode-install-repair"/);
assert.equal(
  connections.match(/<ManagedAgentUpdatePanel/g)?.length,
  3,
  "Hermes, Gajae Code, and Grok must share one managed-agent update panel contract",
);
assert.match(managedAgentUpdatePanel, /data-testid=\{`\$\{provider\}-update-panel`\}/);
assert.match(managedAgentUpdatePanel, /data-testid=\{`\$\{provider\}-update-check`\}/);
assert.match(managedAgentUpdatePanel, /data-testid=\{`\$\{provider\}-update`\}/);
assert.match(managedAgentUpdatePanel, /flex items-center justify-between gap-3 flex-wrap/);
for (const [name, card, providerLabel] of [
  ["Hermes", hermesCard, "copy.hermesBackendLabel"],
  ["Gajae Code", gajecodeCard, "copy.gajecodeBackendLabel"],
] as const) {
  const runtimeEvidence = card.indexOf("<RuntimeReadinessEvidence");
  const updatePanel = card.indexOf("<ManagedAgentUpdatePanel");
  const providerSection = card.indexOf(providerLabel);
  assert.ok(runtimeEvidence >= 0, `${name} must expose managed runtime evidence`);
  assert.ok(updatePanel > runtimeEvidence, `${name} update panel must follow runtime readiness`);
  assert.ok(providerSection > updatePanel, `${name} provider-specific controls must follow the shared update panel`);
}
assert.ok(
  grokCard.indexOf("<ManagedAgentUpdatePanel") > grokCard.indexOf("<RuntimeReadinessEvidence"),
  "Grok update panel must follow managed runtime readiness",
);
assert.match(connections, /id: "grok"/);
assert.match(connections, /await grokCheckUpdate\(options\)/);
assert.match(connections, /await grokCheckUpdate\(\)/);
assert.match(connections, /const nextReadiness = await grokUpdate\(\)/);
assert.match(connections, /data-testid="gajecode-isolated-skills"/);
assert.match(connections, /await providerPrepareManagedRuntime\("gajecode"\)/);
assert.match(connections, /await providerPrepareManagedRuntime\("hermes"\)/);
assert.match(connections, /const readiness = await gajecodeUpdate\(\)/);
assert.match(connections, /gajecodeUpdateLatest: "Atelier 지원 버전"/);
assert.match(connections, /gajecodeUpdateMatchesReadiness\(readiness, next\)/);
assert.match(connections, /throw new Error\(copy\.gajecodeUpdateVerificationFailed\)/);
assert.match(connections, /setPreparationError\(String\(error\)\)/);
assert.doesNotMatch(gajecodeCard, /5 \* 60 \* 1000/);
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
// raw PTY 에서 Enter 는 CR 이고 파이프 stdin 은 LF 다. 한쪽으로 일괄 치환하면
// 코드 글자는 들어가는데 제출만 성립하지 않는 무증상 실패로 되돌아간다.
assert.match(
  credentials,
  /OAuthLoginInput::Process\(_\) => b"\\n",\s*\n\s*OAuthLoginInput::Pty\(_\) => b"\\r",/,
  "the oauth code submit terminator must stay split per transport",
);
assert.match(
  credentials,
  /fn submit_needs_detached_enter/,
  "the carriage return must be written on its own so the TUI reads it as Enter",
);
assert.match(
  credentials,
  /fn terminate_stale_oauth_login/,
  "a new login must end the previous attempt before it takes over the code channel",
);
assert.match(
  credentials,
  /fn redact_login_output[\s\S]{0,400}strip_ansi_sequences/,
  "user-facing login output must be stripped of terminal control noise",
);

assert.match(credentials, /const GAJAE_CODE_PACKAGE: &str = "gajae-code@0\.15\.0"/);
assert.match(credentials, /const GAJAE_CODE_VERSION: &str = "0\.15\.0"/);
assert.match(credentials, /const GROK_VERSION: &str = "1\.0\.4"/);
assert.match(credentials, /const BUN_VERSION: &str = "1\.4\.0"/);
assert.match(credentials, /GROK_MACOS_AARCH64_SHA256/);
assert.match(credentials, /Developer ID verification/);
// 업스트림 최신 버전은 참고 표시 전용이다. update_available 산출 함수 본문에는
// upstream 토큰이 등장해선 안 된다 — 설치 대상은 언제나 Atelier 지원 pin.
function fnBody(source: string, signature: RegExp): string {
  const start = source.search(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`unterminated body for ${signature}`);
}
for (const signature of [
  /fn gajecode_update_status\(/,
  /fn grok_update_status\(/,
  /fn hermes_update_status_base\(/,
  /fn hermes_install_record_is_current\(/,
]) {
  const body = fnBody(credentials, signature);
  assert.ok(
    !/upstream_latest_version\s*[^:]|upstream_reference_for|resolve_upstream_reference/.test(
      body.replace(/upstream_(latest_version|latest_tag|checked_at|error): None/g, ""),
    ),
    `${signature} must not consult the upstream reference when deciding update_available`,
  );
}
assert.match(credentials, /with_gajecode_upstream\(status, upstream_reference_for\("gajecode", force\)\)/);
assert.match(credentials, /with_hermes_upstream\(status, upstream_reference_for\("hermes", force\)\)/);
assert.match(credentials, /upstream_reference_for\("grok", force\)/);
assert.match(upstreamCheck, /UPSTREAM_CHECK_TIMEOUT: Duration = Duration::from_secs\(5\)/);
assert.match(upstreamCheck, /UPSTREAM_CACHE_TTL: Duration = Duration::from_secs\(6 \* 60 \* 60\)/);
assert.match(upstreamCheck, /UPSTREAM_CACHE_FILE: &str = "upstream-check\.json"/);
assert.doesNotMatch(
  upstreamCheck.split("\n").filter((line) => !line.trimStart().startsWith("//")).join("\n"),
  /update_available/,
  "the upstream lookup module must not know about update_available",
);
assert.match(tauri, /upstream_latest_version: string \| null;/);
assert.match(managedAgentUpdatePanel, /data-testid=\{`\$\{provider\}-upstream-reference`\}/);
for (const provider of ["hermes", "gajecode", "grok"]) {
  assert.match(
    connections,
    new RegExp(`provider="${provider}"[\\s\\S]{0,2500}upstreamText=\\{upstreamReferenceLine\\(`),
    `${provider} card must render the upstream reference line`,
  );
}
assert.equal(
  (connections.match(/onCheck=\{\(\) => void refreshUpdate\(\{ force: true \}\)\}/g) ?? []).length,
  3,
  "the manual check button must bypass the upstream cache for all three agents",
);
assert.doesNotMatch(credentials, /GAJAE_CODE_PACKAGE_NAME/);
assert.match(
  credentials,
  /pub async fn gajecode_update<R: Runtime>[\s\S]*ensure_managed_agent_runtime\(&app, "gajecode"\)\.await/,
);
assert.match(
  tauri,
  /export async function gajecodeUpdate\(\): Promise<ManagedAgentRuntimeReadiness>/,
);

const readiness = { ready: true, runtimePin: "0.15.0" };
const verified = {
  installed: true,
  current_version: "0.15.0",
  latest_version: "0.15.0",
  update_available: false,
};
assert.equal(gajecodeUpdateMatchesReadiness(readiness, verified), true);
assert.equal(
  gajecodeUpdateMatchesReadiness(readiness, {
    ...verified,
    current_version: "0.12.8",
    update_available: true,
  }),
  false,
  "a stale post-update CLI status must enter the visible failure branch",
);
assert.equal(
  gajecodeUpdateMatchesReadiness(readiness, {
    ...verified,
    latest_version: "0.12.9",
  }),
  false,
  "a support-pin disagreement must never render an update success notice",
);

// agentUpstreamContract: 순수 비교·문구 계약
assert.equal(compareUpstreamToPin("0.15.0", "0.14.0"), "ahead");
assert.equal(compareUpstreamToPin("0.14.0", "0.14.0"), "same");
assert.equal(compareUpstreamToPin("0.13.9", "0.14.0"), "behind");
assert.equal(compareUpstreamToPin("2026.8.19", "v2026.7.20"), "ahead");
assert.equal(compareUpstreamToPin("2026.8.19", "2026.8.9"), "ahead", "date-like tags compare numerically");
assert.equal(compareUpstreamToPin(null, "0.14.0"), "unknown");
assert.equal(compareUpstreamToPin("1.0.5", "3ef6bbd"), "unknown");
assert.equal(upstreamReferenceLine({ pin: "0.14.0", status: null, language: "ko" }), null);
const upstreamOk = { upstream_latest_version: "0.15.0", upstream_checked_at: "2026-08-24T00:00:00Z", upstream_error: null };
assert.equal(
  upstreamReferenceLine({ pin: "0.14.0", status: upstreamOk, language: "ko" }),
  "업스트림 최신 0.15.0 출시 · Atelier 검증 대기",
);
assert.equal(
  upstreamReferenceLine({ pin: "0.15.0", status: upstreamOk, language: "ko" }),
  "업스트림 최신 0.15.0 · 업스트림과 동일",
);
assert.equal(
  upstreamReferenceLine({ pin: "0.14.0", status: upstreamOk, language: "en" }),
  "Upstream latest 0.15.0 released · awaiting Atelier verification",
);
assert.equal(
  upstreamReferenceLine({
    pin: "0.14.0",
    status: { upstream_latest_version: null, upstream_checked_at: "2026-08-24T00:00:00Z", upstream_error: "git ls-remote: 5초 내 응답 없음" },
    language: "ko",
  }),
  "업스트림 확인 불가: git ls-remote: 5초 내 응답 없음",
);
assert.equal(
  upstreamReferenceLine({
    pin: "3ef6bbd",
    pinVersionLabel: "v2026.7.20",
    upstreamLabel: "v2026.8.19",
    status: { upstream_latest_version: "2026.8.19", upstream_latest_tag: "v2026.8.19", upstream_checked_at: "x", upstream_error: null },
    language: "ko",
  }),
  "업스트림 최신 v2026.8.19 출시 · Atelier 검증 대기",
);

console.log("provider runtime identity smoke: ok");
