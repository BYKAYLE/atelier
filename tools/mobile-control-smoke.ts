import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isAllowedTailscaleActivationUrl,
  isLanPairingUrl,
  isLocalPairingUrl,
  isTailscalePairingUrl,
  lanPairingUrl,
  pairingSecondsLeft,
  preferredMobileNetworkAddress,
  preferredPairingUrlForMode,
  tailscalePairingUrl,
} from "../src/components/mobile-control/mobileControl.ts";

const pairingId = "123e4567-e89b-42d3-a456-426614174000";
const loopbackUrl = `http://127.0.0.1:4000/?pairing=${pairingId}`;
const lanUrl = `https://192.168.1.20:4000/?pairing=${pairingId}`;
const tailscaleUrl = `https://atelier-mac.tail1234.ts.net:8443/atelier/?pairing=${pairingId}`;
const networkCandidates = [
  { interfaceName: "Ethernet", address: "192.168.1.20", recommended: false },
  { interfaceName: "Wi-Fi", address: "10.0.0.12", recommended: true },
];

assert.equal(pairingSecondsLeft(61_000, 1_000), 60);
assert.equal(pairingSecondsLeft(1_000, 2_000), 0);

assert.equal(isLocalPairingUrl(loopbackUrl), true);
assert.equal(isLocalPairingUrl(`http://localhost:4000/?pairing=${pairingId}`), true);
assert.equal(isLocalPairingUrl(`http://127.0.0.1/?pairing=${pairingId}`), false);
assert.equal(isLocalPairingUrl(`http://127.0.0.1:4000/atelier/?pairing=${pairingId}`), false);

assert.equal(isLanPairingUrl(lanUrl), true);
assert.equal(lanPairingUrl([loopbackUrl, lanUrl]), lanUrl);
assert.equal(lanPairingUrl([loopbackUrl]), null);
assert.equal(isLanPairingUrl(`https://172.16.0.5:4000/?pairing=${pairingId}`), true);
assert.equal(isLanPairingUrl(`https://10.0.0.12:4000/?pairing=${pairingId}`), true);
assert.equal(isLanPairingUrl(`https://127.0.0.1:4000/?pairing=${pairingId}`), false);
assert.equal(isLanPairingUrl(`https://100.87.248.11:4000/?pairing=${pairingId}`), false);
assert.equal(isLanPairingUrl(`https://169.254.12.4:4000/?pairing=${pairingId}`), false);
assert.equal(isLanPairingUrl(`http://192.168.1.20:4000/?pairing=${pairingId}`), false);
assert.equal(isLanPairingUrl(`https://192.168.1.20:4000/?pairing=${pairingId}&code=123456`), false);
assert.equal(isLanPairingUrl(`https://192.168.1.20:4000/?pairing=${pairingId}&extra=1`), false);

assert.equal(isTailscalePairingUrl(tailscaleUrl), true);
assert.equal(tailscalePairingUrl([loopbackUrl, lanUrl, tailscaleUrl]), tailscaleUrl);
assert.equal(isTailscalePairingUrl(`http://atelier-mac.tail1234.ts.net:8443/atelier/?pairing=${pairingId}`), false);
assert.equal(isTailscalePairingUrl(`https://atelier-mac.tail1234.ts.net:443/atelier/?pairing=${pairingId}`), false);
assert.equal(isTailscalePairingUrl(`https://atelier-mac.tail1234.ts.net:8443/?pairing=${pairingId}`), false);
assert.equal(isTailscalePairingUrl(`https://atelier-mac.tail1234.ts.net:8443/atelier?pairing=${pairingId}`), false);
assert.equal(isTailscalePairingUrl(`https://atelier-mac.ts.net:8443/atelier/?pairing=${pairingId}`), false);
assert.equal(isTailscalePairingUrl(`https://atelier-mac.tail1234.ts.net.evil.example:8443/atelier/?pairing=${pairingId}`), false);
assert.equal(isTailscalePairingUrl(`https://atelier-mac.tail1234.ts.net:8443/atelier/?pairing=${pairingId}&code=123456`), false);

assert.equal(preferredPairingUrlForMode([lanUrl, loopbackUrl, tailscaleUrl], "local"), loopbackUrl);
assert.equal(preferredPairingUrlForMode([loopbackUrl, tailscaleUrl, lanUrl], "lan"), lanUrl);
assert.equal(preferredPairingUrlForMode([loopbackUrl, lanUrl, tailscaleUrl], "tailscale"), tailscaleUrl);
assert.equal(preferredPairingUrlForMode([loopbackUrl, lanUrl], "tailscale"), null);

assert.equal(isAllowedTailscaleActivationUrl("https://login.tailscale.com/f/serve?node=n123"), true);
assert.equal(isAllowedTailscaleActivationUrl("http://login.tailscale.com/f/serve?node=n123"), false);
assert.equal(isAllowedTailscaleActivationUrl("https://login.tailscale.com.evil.example/f/serve?node=n123"), false);
assert.equal(isAllowedTailscaleActivationUrl("https://login.tailscale.com/f/serve"), false);
assert.equal(isAllowedTailscaleActivationUrl("https://login.tailscale.com/f/serve?node=n123&next=https://evil.example"), false);
assert.equal(isAllowedTailscaleActivationUrl("https://user@login.tailscale.com/f/serve?node=n123"), false);
assert.equal(isAllowedTailscaleActivationUrl("https://login.tailscale.com/f/serve?node=n123#fragment"), false);

assert.equal(preferredMobileNetworkAddress([], null), null);
assert.equal(preferredMobileNetworkAddress([networkCandidates[0]], null), "192.168.1.20");
assert.equal(preferredMobileNetworkAddress(networkCandidates, null), "10.0.0.12");
assert.equal(preferredMobileNetworkAddress(networkCandidates, "192.168.1.20"), "192.168.1.20");
assert.equal(preferredMobileNetworkAddress(networkCandidates, "172.16.0.5"), "10.0.0.12");

const backend = readFileSync(new URL("../src-tauri/src/mobile_control.rs", import.meta.url), "utf8");
const continuityBackend = readFileSync(new URL("../src-tauri/src/mobile_continuity.rs", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/mobile-control/RemoteAccessSection.tsx", import.meta.url), "utf8");
const tauri = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/App.tsx", import.meta.url), "utf8");
const mobileJsSource = backend.match(/const MOBILE_JS: &str = r##"([\s\S]*?)"##;/)?.[1] ?? "";
const workspace = readFileSync(new URL("../src/components/AgentWorkspace.tsx", import.meta.url), "utf8");
const rendererBoot = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../src/components/App.tsx", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const pairingUrlBuilder = backend.match(/fn pairing_urls\([\s\S]*?\n\}/)?.[0] ?? "";

function assertSourceMatch(source: string, pattern: RegExp, message: string): void {
  assert.ok(pattern.test(source), message);
}

assert.equal(packageJson.dependencies["qrcode.react"], "4.2.0");

assertSourceMatch(backend, /mobile_control_tailscale_status/, "backend must expose Tailscale preflight status");
assertSourceMatch(backend, /connection_mode/, "backend must expose the finalized connection_mode contract");
assertSourceMatch(backend, /blocked_reason/, "backend must report why Tailscale cannot start");
assertSourceMatch(backend, /dns_name/, "backend must report the Tailscale DNS name");
assertSourceMatch(backend, /serve_url/, "backend must report the tailnet-only Serve URL");
assertSourceMatch(backend, /tailscale_ips/, "backend must report Tailscale addresses");
assertSourceMatch(backend, /https_port/, "backend must report the Serve HTTPS port");
assertSourceMatch(backend, /TAILSCALE_SERVE_PORT[^\n]*8443/, "backend must reserve Serve HTTPS port 8443");
assertSourceMatch(backend, /TAILSCALE_SERVE_PATH[^\n]*\/atelier/, "backend must mount the Atelier Serve path");
assertSourceMatch(backend, /server-preference\.json/, "backend must persist the explicit Tailscale restore choice");
assertSourceMatch(backend, /restore_server_after_restart/, "backend must restore explicitly enabled tailnet access after restart");
assertSourceMatch(backend, /explicit_stop_with\([\s\S]*set_tailscale_restore_enabled\(false\)[\s\S]*stop_server_inner/, "an explicit stop must disable Tailscale restore before runtime cleanup");
assertSourceMatch(backend, /mobile_control_network_candidates/, "backend must retain LAN candidate discovery");
assertSourceMatch(continuityBackend, /mobile_control_sessions_publish/, "backend must accept mobile continuity session snapshots");
assertSourceMatch(continuityBackend, /mobile_task_id/, "backend continuity snapshots must bind the opaque mobile task id");
assertSourceMatch(continuityBackend, /MAX_TEXT_CHARS: usize = 12_000/, "backend and renderer must share the 12,000 character message limit");
assertSourceMatch(continuityBackend, /redact_mobile_message_text/, "mobile conversation text must pass the native redaction boundary");
assertSourceMatch(continuityBackend, /agent_preview::redact_cli_output/, "mobile conversation text must reuse credential redaction");
assertSourceMatch(continuityBackend, /\[workspace\]/, "mobile conversation text must redact local workspace roots");
assertSourceMatch(backend, /task:followup/, "backend must expose the task-bound follow-up scope");
assertSourceMatch(backend, /from_tcp_rustls/, "backend must retain LAN TLS");
assertSourceMatch(backend, /certificate_fingerprint/, "backend must retain LAN certificate fingerprinting");
assertSourceMatch(backend, /monitor:read/, "backend must retain read-only pairing scope");
assertSourceMatch(backend, /command:propose/, "backend must retain explicit follow-up scope");
assertSourceMatch(backend, /PAIRING_TTL_MS/, "backend must retain pairing expiry");
assertSourceMatch(backend, /revoked_at_ms/, "backend must retain device revocation");
assert.match(pairingUrlBuilder, /\?pairing=\{pairing_id\}/);
assert.doesNotMatch(pairingUrlBuilder, /&code=/);
assert.doesNotMatch(backend, /bootstrap\.code/);

assert.match(tauri, /export type MobileConnectionMode = "local" \| "lan" \| "tailscale"/);
assert.match(tauri, /export interface MobileTailscaleStatus/);
for (const field of ["installed", "running", "serveEnabled", "active", "dnsName", "tailscaleIps", "serveUrl", "activationUrl", "blockedReason", "httpsPort", "path"]) {
  assert.match(tauri, new RegExp(`\\b${field}:`));
}
assert.match(tauri, /connectionMode: MobileConnectionMode/);
assert.match(tauri, /tailscale: MobileTailscaleStatus \| null/);
assert.match(tauri, /invoke\("mobile_control_tailscale_status"\)/);
assert.match(tauri, /invoke\("mobile_control_server_start", \{ allowLan, port, lanIp, connectionMode \}\)/);
assert.match(tauri, /export interface MobileControlSessionsPublishInput/);
assert.match(tauri, /mobileTaskId: string/);
assert.match(tauri, /mobileControlSessionsPublish\(/);
assert.match(tauri, /invoke\("mobile_control_sessions_publish", \{ input \}\)/);

assert.match(workspace, /mobileTaskId: string/);
assert.match(workspace, /globalThis\.crypto/);
assert.match(workspace, /cryptoApi\.randomUUID/);
assert.match(workspace, /cryptoApi\.getRandomValues/);
assert.match(workspace, /mobileTaskId: isUuid\(session\.mobileTaskId\) \? session\.mobileTaskId : createMobileTaskId\(\)/);
assert.match(workspace, /mobileTaskId: createMobileTaskId\(\)/);
assert.match(workspace, /MOBILE_CONTINUITY_MAX_SESSIONS = 24/);
assert.match(workspace, /MOBILE_CONTINUITY_MAX_MESSAGES = 60/);
assert.match(workspace, /MOBILE_CONTINUITY_MAX_MESSAGE_TEXT_CHARS = 12_000/);
assert.match(workspace, /mobileControlSessionsPublish\(/);
assert.match(workspace, /setInterval\(publish, MOBILE_CONTINUITY_HEARTBEAT_MS\)/);
assert.match(workspace, /mobile continuity session projection failed/);
assert.match(workspace, /Array\.isArray\(session\.messages\)/);
assert.match(workspace, /typeof message\.text === "string"/);
assert.match(workspace, /session\.permissionMode !== "full"/);
const mobilePublishSource = workspace.slice(
  workspace.indexOf("function mobileContinuityPublishInput"),
  workspace.indexOf("interface MobileContinuityDispatchPayload"),
);
assert.doesNotMatch(mobilePublishSource, /attachments|rawEvents|intermediateDraft|activities|providerSessionId|tokenUsage/);
const controlHandlerSource = workspace.slice(workspace.indexOf("controlRequestHandlerRef.current"));
const directContinuationIndex = controlHandlerSource.indexOf("isMobileContinuityRequest");
const newSessionIndex = controlHandlerSource.indexOf("const session = makeSession");
assert.ok(directContinuationIndex >= 0 && newSessionIndex > directContinuationIndex, "mobile continuation must branch before new-session dispatch");
const continuationBranch = controlHandlerSource.slice(directContinuationIndex, newSessionIndex);
assert.doesNotMatch(continuationBranch, /makeSession\(/, "mobile continuation must never fall back to a new session");
assert.match(continuationBranch, /queuedTurns: \[\.\.\.\(current\.queuedTurns \|\| \[\]\), payload\]/);
assert.match(continuationBranch, /controlRequestId: request\.requestId/);
assert.match(continuationBranch, /await runAgentTurn\(session\.id, payload\)/);

assert.match(panel, /CONNECTION_MODES[^\n]*\["local", "lan", "tailscale"\]/);
assert.match(panel, /type="radio"/);
assert.match(panel, /name="mobile-connection-mode"/);
assert.match(panel, /checked=\{selected\}/);
assert.match(panel, /mobileControlNetworkCandidates/);
assert.match(panel, /mobileControlTailscaleStatus/);
assert.match(panel, /preferredPairingUrlForMode\(pairing\.pairingUrls, activeMode\)/);
assert.match(panel, /mobileControlServerStart\(\s*allowLan,\s*null,\s*allowLan \? selectedLanIp : null,\s*connectionMode,/);
assert.match(panel, /tailscaleStatus\?\.active/);
assert.match(panel, /tailscaleStatus\?\.blockedReason/);
assert.match(panel, /isAllowedTailscaleActivationUrl/);
assert.match(panel, /Open Serve activation/);
assert.match(panel, /상태 다시 확인/);
assert.match(panel, /Mac 또는 Windows 컴퓨터와 iPhone 또는 Android 휴대폰 모두에 Tailscale이 필요/);
assert.match(panel, /Tailscale is required on both the Mac or Windows computer and the iPhone or Android phone/);
assert.match(panel, /Remote access is tailnet-only/);
assert.match(panel, /import \{ QRCodeSVG \} from "qrcode\.react"/);
assert.match(panel, /<QRCodeSVG/);
assert.match(panel, /value=\{pairingUrl\}/);
assert.match(panel, /data-connection-mode=\{activeMode\}/);
assert.match(panel, /size=\{144\}/);
assert.match(panel, /marginSize=\{4\}/);
assert.match(panel, /bgColor="#ffffff"/);
assert.match(panel, /fgColor="#000000"/);
assert.match(panel, /sm:grid-cols-\[160px_minmax\(0,1fr\)\]/);
assert.match(panel, /QR에는 6자리 코드가 들어 있지 않습니다/);
assert.match(panel, /aria-live="polite"/);
assert.match(panel, /<div role="alert"/);
assert.match(panel, /두 기기의 Tailscale 연결을 유지한 채 QR을 스캔/);
assert.match(panel, /status\.connectionMode === "lan" && status\.certificateFingerprint/);
assert.match(panel, /Windows host:[\s\S]*allow Private networks only[\s\S]*Do not allow Public networks/);
assert.match(panel, /127\.0\.0\.1은 현재 컴퓨터에서만 열려 휴대폰에서 접속할 수 없습니다/);
assert.match(panel, /mobileControlDeviceRevoke/);
assert.match(panel, /mobileControlDeviceFollowupsSet/);
assert.match(panel, /task:followup/);
assert.match(panel, /command:propose/);
assert.match(panel, /const taskContinuationEnabled = device\.scopes\.includes\("task:followup"\)/);
assert.match(panel, /모바일 작업 이어가기 허용/);
assert.match(panel, /읽기 전용 · 모바일 작업 이어가기 불가/);
assert.match(panel, /role="status"/);
assert.match(panel, /deviceNotice/);
assert.doesNotMatch(panel, /Funnel/i);
assert.doesNotMatch(panel, /public (?:access|URL)/i);
assert.doesNotMatch(panel, /phonePairingUrl|enablePhoneConnection|setAllowLan/);
assert.doesNotMatch(panel, /api\.qrserver|quickchart|chart\.googleapis/);
assert.match(app, /settingsSection: "remote"/);
assert.match(appShell, /data-atelier-app-shell/);
assert.match(rendererBoot, /appRoot \|\|= ReactDOM\.createRoot\(root\)/);
assert.match(rendererBoot, /if \(!appHasCommitted\) renderBootError\(error\)/);
assert.match(rendererBoot, /querySelector<HTMLElement>\("\[data-atelier-app-shell\]"\)/);
assert.match(rendererBoot, /setInterval\(\(\) => this\.reportRendererStatus\(\), 15_000\)/);
assert.match(rendererBoot, /shell\.childElementCount > 0/);
assert.ok(mobileJsSource.length > 0, "embedded mobile JavaScript must be extractable");
assert.doesNotThrow(() => new Function(mobileJsSource), "embedded mobile JavaScript must parse");
assert.match(backend, /aria-pressed/);
assert.match(backend, /autocomplete="one-time-code"/);
assert.match(backend, /role="status" aria-live="polite"/);
assert.match(backend, /taskFollowupAllowed&&!allowed&&sendPanel\.contains\(document\.activeElement\)/);

console.log("mobile control smoke: passed");
