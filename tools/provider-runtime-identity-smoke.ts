import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gajecodePatchMatchesReadiness } from "../src/lib/gajecodeUpdateContract.ts";
import {
  compareUpstreamToPin,
  patchButtonContract,
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
const cli = readFileSync(new URL("../src-tauri/src/atelier_cli.rs", import.meta.url), "utf8");
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
assert.match(connections, /await providerPatchUpstream\("hermes"\)/);
assert.match(connections, /await providerPatchUpstream\("gajecode"\)/);
assert.match(connections, /await grokCheckUpdate\(\)/);
assert.match(connections, /const nextReadiness = await grokUpdate\(\)/);
assert.match(connections, /data-testid="gajecode-isolated-skills"/);
assert.match(connections, /await providerPrepareManagedRuntime\("gajecode"\)/);
assert.match(connections, /await providerPrepareManagedRuntime\("hermes"\)/);
assert.match(connections, /gajecodeUpdateLatest: "최신 상태"/);
assert.match(connections, /gajecodePatchMatchesReadiness\(outcome, readiness, next\)/);
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

assert.match(credentials, /const GAJAE_CODE_PACKAGE: &str = "gajae-code@0\.15\.2"/);
assert.match(credentials, /const GAJAE_CODE_VERSION: &str = "0\.15\.2"/);
assert.match(credentials, /const GROK_VERSION: &str = "1\.0\.4"/);
assert.match(credentials, /const BUN_VERSION: &str = "1\.4\.0"/);
assert.match(credentials, /GROK_MACOS_AARCH64_SHA256/);
assert.match(credentials, /Developer ID verification/);
// 패치 계약: hermes/gajecode 의 update_available 은 "업스트림이 설치본보다
// 최신"일 때만 참이다 — 업스트림 참조를 부착하는 with_*_upstream 이 판정을
// 소유한다. grok 은 패치 범위 밖이라 pin 복원 판정을 유지하며, 그 판정 함수
// 본문에는 upstream 토큰이 등장해선 안 된다.
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
for (const signature of [/fn with_gajecode_upstream\(/, /fn with_hermes_upstream\(/]) {
  const body = fnBody(credentials, signature);
  assert.ok(
    /update_available = status\.installed/.test(body),
    `${signature} must derive update_available from the attached upstream reference`,
  );
}
const grokBody = fnBody(credentials, /fn grok_update_status\(/);
assert.ok(
  !/upstream_latest_version\s*[^:]|upstream_reference_for|resolve_upstream_reference/.test(
    grokBody.replace(/upstream_(latest_version|latest_tag|checked_at|error): None/g, ""),
  ),
  "grok stays pin-based: its update decision must not consult the upstream reference",
);
// 베이스라인 계약: 핀은 최소 검증 기준선이다 — 기준선보다 최신인 설치본을
// 핀으로 되돌리는 다운그레이드 경로가 있어선 안 된다.
assert.ok(
  !/지원 버전으로 복원/.test(credentials),
  "the pin-restore (downgrade) message must not exist anymore",
);
assert.match(
  fnBody(credentials, /fn verify_gajecode_components_at\(/),
  /compare_semver\(&detected, GAJAE_CODE_VERSION\) == std::cmp::Ordering::Less/,
  "gajecode readiness must fail only below the baseline, not above it",
);
assert.match(
  fnBody(credentials, /fn gajecode_repair_package_spec_at\(/),
  /installed_version/,
  "re-provisioning must reinstall the receipt-proven installed version",
);
// 패치 파이프라인 fail-closed 골격: 백업 → 설치 → 검증 → 롤백.
const providerPatch = readFileSync(new URL("../src-tauri/src/provider_patch.rs", import.meta.url), "utf8");
for (const marker of [
  "fn acquire_patch_lock",
  "fn ensure_no_active_patch",
  "patch_backup",
  "patch_rollback",
  "패치 실패 — 롤백됨",
  "prune_old_backups",
  "fn install_hermes_engine_at",
  "uv sync --frozen --extra anthropic",
]) {
  assert.ok(providerPatch.includes(marker), `provider_patch.rs must keep: ${marker}`);
}
assert.match(
  credentials,
  /crate::provider_patch::ensure_no_active_patch\(app_support, provider\)\?;/,
  "provisioning must fail fast while a patch holds the cross-process lock",
);
assert.match(
  cli,
  /fn run_provider\(/,
  "the CLI must expose the same patch pipeline headlessly (atelier provider patch)",
);
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
assert.match(managedAgentUpdatePanel, /data-patch-state=\{patch\?\.state\}/);
assert.match(managedAgentUpdatePanel, /data-testid=\{`\$\{provider\}-patch-detail`\}/);
for (const provider of ["hermes", "gajecode", "grok"]) {
  assert.match(
    connections,
    new RegExp(`provider="${provider}"[\\s\\S]{0,3500}upstreamText=\\{upstreamReferenceLine\\(`),
    `${provider} card must render the upstream reference line`,
  );
}
// hermes/gajecode 카드는 상태형 패치 버튼 계약을 사용하고, grok 은 사용하지 않는다.
for (const provider of ["hermes", "gajecode"]) {
  assert.match(
    connections,
    new RegExp(`provider="${provider}"[\\s\\S]{0,4500}patch=\\{patchButtonContract\\(`),
    `${provider} card must drive the stateful patch button contract`,
  );
}
assert.ok(
  !new RegExp('provider="grok"[\\s\\S]{0,4500}patch=\\{').test(connections),
  "grok stays on the legacy restore-only button (no patch contract)",
);
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

// gajecodePatchMatchesReadiness: 수령증과 독립 CLI 재확인이 패치 버전에
// 합의해야만 성공을 렌더한다. 핀(runtimePin)은 기준선일 뿐이라 설치본이
// 앞서 있어도 성공이다.
const readiness = { ready: true, runtimePin: "0.15.2", installedVersion: "0.16.4" };
const outcome = { toVersion: "0.16.4" };
const verified = { installed: true, current_version: "0.16.4" };
assert.equal(gajecodePatchMatchesReadiness(outcome, readiness, verified), true);
assert.equal(
  gajecodePatchMatchesReadiness(outcome, readiness, {
    ...verified,
    current_version: "0.15.2",
  }),
  false,
  "a stale post-patch CLI status must enter the visible failure branch",
);
assert.equal(
  gajecodePatchMatchesReadiness(
    outcome,
    { ...readiness, installedVersion: "0.15.2" },
    verified,
  ),
  false,
  "a receipt that disagrees with the patch target must never render success",
);
assert.equal(
  gajecodePatchMatchesReadiness(outcome, { ...readiness, ready: false }, verified),
  false,
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
  "업스트림 최신 0.15.0 출시 · Atelier 호환성 미검증",
);
assert.equal(
  upstreamReferenceLine({ pin: "0.14.0", status: upstreamOk, language: "ko", patchable: true }),
  "업스트림 최신 0.15.0 출시 · 패치로 설치할 수 있습니다",
);
assert.equal(
  upstreamReferenceLine({ pin: "0.15.0", status: upstreamOk, language: "ko" }),
  "업스트림 최신 0.15.0 · 업스트림과 동일",
);
assert.equal(
  upstreamReferenceLine({ pin: "0.16.0", status: upstreamOk, language: "ko", patchable: true }),
  "업스트림 최신 0.15.0 · 설치된 버전이 더 최신",
);
assert.equal(
  upstreamReferenceLine({ pin: "0.14.0", status: upstreamOk, language: "en", patchable: true }),
  "Upstream latest 0.15.0 released · installable via patch",
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
    pin: "v2026.7.20",
    pinVersionLabel: "v2026.7.20",
    upstreamLabel: "v2026.8.31",
    status: { upstream_latest_version: "2026.8.31", upstream_latest_tag: "v2026.8.31", upstream_checked_at: "x", upstream_error: null },
    language: "ko",
    patchable: true,
  }),
  "업스트림 최신 v2026.8.31 출시 · 패치로 설치할 수 있습니다",
);

// patchButtonContract: 상태형 단일 버튼 4상태 계약
assert.deepEqual(
  patchButtonContract({ installed: true, updateAvailable: false, targetLabel: null, patching: false, lastError: null, language: "ko" }),
  { state: "up-to-date", label: "최신 상태", enabled: false, detail: null },
);
assert.deepEqual(
  patchButtonContract({ installed: true, updateAvailable: true, targetLabel: "v2026.8.31", patching: false, lastError: null, language: "ko" }),
  { state: "patch-available", label: "패치 가능 (v2026.8.31)", enabled: true, detail: null },
);
assert.deepEqual(
  patchButtonContract({ installed: true, updateAvailable: true, targetLabel: "0.16.4", patching: true, lastError: null, language: "ko" }),
  { state: "patching", label: "패치 중…", enabled: false, detail: null },
);
const failed = patchButtonContract({
  installed: true,
  updateAvailable: true,
  targetLabel: "0.16.4",
  patching: false,
  lastError: "패치 실패 — 롤백됨: 검증 실패",
  language: "ko",
});
assert.equal(failed.state, "patch-failed");
assert.equal(failed.enabled, true, "a rolled-back patch must stay retryable");
assert.equal(failed.detail, "패치 실패 — 롤백됨: 검증 실패");
assert.equal(
  patchButtonContract({ installed: false, updateAvailable: true, targetLabel: "x", patching: false, lastError: null, language: "en" }).state,
  "up-to-date",
);

console.log("provider runtime identity smoke: ok");
