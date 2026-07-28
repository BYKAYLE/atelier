// 설정 → 연결 패널.
// Microsoft Store 일반 사용자가 본인 구독(Claude Pro/Max, ChatGPT Plus/Pro) 또는 API 키를
// Atelier 안에서 한 번에 연결한다.
// 키 자체는 OS keychain (macOS Keychain / Windows Credential Manager) 에만 저장.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cls, Tweaks } from "../lib/tokens";
import {
  gajecodeCredentialReady,
  readGajaeModelProviderPreference,
  readHermesModelProviderPreference,
  writeGajaeModelProviderPreference,
  writeHermesModelProviderPreference,
} from "../lib/agentProviderPreferences";
import type {
  GajaeModelProvider,
  HermesModelProvider,
} from "../lib/agentProviderPreferences";
import { FeaturePanels } from "../features/featureRegistry";
import {
  hasOauthLoginSignalTimedOut,
  isAllowedOauthLoginUrl,
  LoginUrlAttempt,
  planOauthLoginUrlAttempt,
} from "../features/connections/oauthLoginFlow";
import {
  GajecodeUpdateStatus,
  HermesUpdateStatus,
  ManagedAgentRuntimeProgress,
  ManagedAgentRuntimeReadiness,
  ProviderBrowserProbeResult,
  ProviderLoginOauthResult,
  ProviderStatus,
  gajecodeCheckUpdate,
  gajecodeUpdate,
  hermesCheckUpdate,
  hermesUpdate,
  isTauri,
  onManagedAgentRuntimeProgress,
  providerClearCredentials,
  providerInstallCli,
  providerLoginOauth,
  providerOauthBrowserProbe,
  providerOpenOauthLoginUrl,
  providerPrepareManagedRuntime,
  providerOauthLoginState,
  providerSaveApiKey,
  providerStatus,
  providerSubmitOauthCode,
} from "../lib/tauri";

interface Props {
  tw: Tweaks;
}

type ProviderId = "claude" | "codex" | "openrouter" | "alibaba" | "linear" | "hermes" | "gajecode";

interface ProviderDef {
  id: ProviderId;
  name: string;
  desc: { ko: string; en: string };
  oauthCta: { ko: string; en: string };
  apiHelp: { ko: string; en: string };
  apiUrl?: string;
  installHelp?: { ko: string; en: string };
  installUrl?: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "claude",
    name: "Claude (Anthropic)",
    desc: {
      ko: "Claude Pro/Max 구독 또는 Anthropic API 키로 연결합니다. 구독 로그인은 Google/Apple 등 SNS 계정으로 진행됩니다.",
      en: "Connect with a Claude Pro/Max subscription or an Anthropic API key. Subscription sign-in uses your Google/Apple/etc. SNS account.",
    },
    oauthCta: { ko: "Claude 구독으로 로그인", en: "Sign in with Claude" },
    apiHelp: {
      ko: "Anthropic API 키 (sk-ant-...) — console.anthropic.com에서 발급",
      en: "Anthropic API key (sk-ant-...) — issued at console.anthropic.com",
    },
    apiUrl: "https://console.anthropic.com/settings/keys",
    installHelp: {
      ko: "Claude Code CLI가 설치되어 있어야 구독 로그인이 가능합니다.",
      en: "The Claude Code CLI must be installed to use subscription sign-in.",
    },
    installUrl: "https://docs.claude.com/en/docs/claude-code/quickstart",
  },
  {
    id: "codex",
    name: "Codex (OpenAI)",
    desc: {
      ko: "ChatGPT Plus/Pro 구독 또는 OpenAI API 키로 연결합니다. 구독 로그인은 Google/Apple/Microsoft 등 SNS 계정으로 진행됩니다.",
      en: "Connect with a ChatGPT Plus/Pro subscription or an OpenAI API key. Subscription sign-in uses your Google/Apple/Microsoft SNS account.",
    },
    oauthCta: { ko: "ChatGPT 구독으로 로그인", en: "Sign in with ChatGPT" },
    apiHelp: {
      ko: "OpenAI API 키 (sk-...) — platform.openai.com에서 발급",
      en: "OpenAI API key (sk-...) — issued at platform.openai.com",
    },
    apiUrl: "https://platform.openai.com/api-keys",
    installHelp: {
      ko: "Codex CLI가 설치되어 있어야 구독 로그인이 가능합니다.",
      en: "The Codex CLI must be installed to use subscription sign-in.",
    },
    installUrl: "https://github.com/openai/codex",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    desc: {
      ko: "OpenRouter API 키로 100여 종의 모델에 접근합니다.",
      en: "Reach 100+ models with an OpenRouter API key.",
    },
    oauthCta: { ko: "", en: "" },
    apiHelp: {
      ko: "OpenRouter API 키 (sk-or-v1-...) — openrouter.ai/keys에서 발급",
      en: "OpenRouter API key (sk-or-v1-...) — issued at openrouter.ai/keys",
    },
    apiUrl: "https://openrouter.ai/keys",
  },
  {
    id: "alibaba",
    name: "Alibaba Cloud Model Studio",
    desc: {
      ko: "Alibaba Cloud Model Studio Token Plan의 Qwen·GLM 모델을 Hermes와 가재코드에서 사용합니다.",
      en: "Use Qwen and GLM models from an Alibaba Cloud Model Studio Token Plan in Hermes and Gajae Code.",
    },
    oauthCta: { ko: "", en: "" },
    apiHelp: {
      ko: "싱가포르 리전 Token Plan API 키 (sk-...)를 입력하세요.",
      en: "Enter a Singapore-region Token Plan API key (sk-...).",
    },
    apiUrl: "https://modelstudio.console.alibabacloud.com/?tab=globalset#/efm/api_key",
  },
  {
    id: "linear",
    name: "Linear",
    desc: {
      ko: "Linear 이슈와 워크플로 상태를 조회하고, 승인 후 이슈 생성·댓글·상태 변경을 실행합니다.",
      en: "Inspect Linear issues and workflow states, then create issues, comment, or change status after approval.",
    },
    oauthCta: { ko: "", en: "" },
    apiHelp: {
      ko: "Linear 개인 API 키 — Linear 설정의 Security & access에서 발급",
      en: "Linear personal API key — create one under Linear Settings > Security & access",
    },
    apiUrl: "https://linear.app/settings/api",
  },
  {
    id: "gajecode",
    name: "가재코드 (Gajae Code)",
    desc: {
      ko: "Atelier가 첫 사용 시 고정 버전 gjc 런타임과 가재코드 전용 기본 스킬을 격리 공간에 자동 준비합니다.",
      en: "On first use, Atelier automatically prepares a pinned gjc runtime and Gajae Code default skills in its isolated space.",
    },
    oauthCta: { ko: "", en: "" },
    apiHelp: { ko: "", en: "" },
    installHelp: {
      ko: "Mac의 Claude/Codex/Hermes 스킬은 가져오지 않으며 별도 스킬 설치도 필요 없습니다.",
      en: "It does not import Mac Claude/Codex/Hermes skills, and no separate skill installation is required.",
    },
    installUrl: "https://github.com/Yeachan-Heo/gajae-code",
  },
];

const HERMES_BACKENDS: Array<{
  value: HermesModelProvider;
  label: string;
  credentialProvider: ProviderId;
  desc: { ko: string; en: string };
}> = [
  {
    value: "openai-codex",
    label: "Codex (OpenAI)",
    credentialProvider: "codex",
    desc: { ko: "위 Codex 자격증명 사용", en: "Uses the Codex credential above" },
  },
  {
    value: "anthropic",
    label: "Claude (Anthropic)",
    credentialProvider: "claude",
    desc: { ko: "위 Claude 구독 또는 API 자격증명 사용", en: "Uses the Claude subscription or API credential above" },
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    credentialProvider: "openrouter",
    desc: { ko: "위 OpenRouter API 키 사용", en: "Uses the OpenRouter key above" },
  },
  {
    value: "alibaba",
    label: "Alibaba Cloud",
    credentialProvider: "alibaba",
    desc: { ko: "위 Token Plan API 키 사용", en: "Uses the Token Plan key above" },
  },
];

const GAJECODE_BACKENDS: Array<{
  value: GajaeModelProvider;
  label: string;
  credentialProvider: ProviderId;
  desc: { ko: string; en: string };
}> = [
  {
    value: "claude",
    label: "Claude",
    credentialProvider: "claude",
    desc: { ko: "위 Claude 구독 또는 API 자격증명 사용", en: "Uses the Claude subscription or API credential above" },
  },
  {
    value: "codex",
    label: "Codex",
    credentialProvider: "codex",
    desc: { ko: "위 Codex ChatGPT 구독 로그인 사용", en: "Uses the Codex ChatGPT subscription login above" },
  },
  {
    value: "alibaba",
    label: "Alibaba Cloud",
    credentialProvider: "alibaba",
    desc: { ko: "위 Token Plan API 키 사용", en: "Uses the Token Plan key above" },
  },
];

const COPY = {
  ko: {
    title: "연결",
    sub: "사용하실 모델의 구독 또는 API 키를 연결하세요. 키는 OS 보안 저장소(Keychain / Credential Manager)에만 보관됩니다.",
    agentKind: "에이전트",
    modelProviderKind: "모델 공급자",
    serviceKind: "서비스",
    statusOk: "연결됨",
    statusCliReady: "CLI 설치됨",
    statusNoCli: "CLI 미설치",
    statusAutoPrepare: "첫 사용 자동 준비",
    statusNoKey: "키 미입력",
    runtimeChecking: "격리 실행환경 확인 중…",
    runtimeInstalling: "고정 버전 런타임 설치 중…",
    runtimeSkills: "전용 기본 스킬 준비 중…",
    runtimeVerifying: "런타임·스킬 검증 중…",
    runtimeReady: "런타임·기본 스킬 준비 완료",
    runtimeFailed: "자동 준비 실패 · 설치·복구를 다시 실행하세요.",
    runtimeEvidence: "준비 증거",
    runtimePin: "런타임 고정 버전",
    runtimeDependencyPin: "의존성 고정 버전",
    runtimePolicy: "실행 정책",
    runtimeSkillBundle: "기본 스킬 번들",
    runtimeReceipt: "준비 영수증",
    apiInputLabel: "API 키",
    apiInputPlaceholder: "키를 붙여넣고 저장",
    save: "저장",
    saved: "저장됨",
    saving: "저장 중…",
    clear: "삭제",
    issueLink: "키 발급 페이지 열기",
    installLink: "설치 가이드",
    installAuto: "자동 설치",
    installing: "설치 중…",
    installPrompt: "미설치 상태입니다. 자동 설치를 눌러 CLI를 설치하세요.",
    oauthReconnect: "구독 다시 로그인",
    installTimeout:
      "설치 완료를 아직 감지하지 못했습니다. Node.js/npm, Git Bash 또는 네트워크 상태를 확인한 뒤 다시 눌러주세요.",
    refresh: "상태 새로고침",
    browserProbeTitle: "브라우저 연결 진단",
    browserProbeClaude: "Claude 테스트",
    browserProbeCodex: "Codex 테스트",
    browserProbeRunning: "브라우저 전달 중…",
    browserProbeSuccess: (name: string, handoff: string) =>
      `${name} 로그인 주소를 OS에 전달했습니다 · ${handoff}. 실제 브라우저 창을 확인하세요.`,
    browserProbeFailed: (message: string) => `브라우저 전달 실패: ${message}`,
    loginStartFailed: (name: string, message: string) =>
      `${name} 로그인을 시작하지 못했습니다. ${message}`,
    loginAlreadyConnected: (name: string) => `${name} 구독 로그인이 이미 연결되어 있습니다.`,
    loginStartedBrowser: (name: string) =>
      `${name} 로그인 명령을 시작했고 브라우저를 열었습니다. SNS 로그인을 완료하면 자동으로 감지됩니다.`,
    loginStartedWatching: (name: string) =>
      `${name} 로그인 명령을 시작했습니다. 브라우저가 바로 열리지 않으면 Atelier가 CLI 출력의 로그인 URL을 계속 감지합니다.`,
    loginStartedNoBrowser: (name: string) =>
      `${name} 로그인 명령을 시작했지만 브라우저를 자동으로 열지 못했습니다. 잠시 뒤 상태를 새로고침하거나 자동 설치 상태를 확인하세요.`,
    loginModalTitle: "브라우저에서 로그인 진행",
    loginModalDesc:
      "SNS(Google/Apple 등) 로그인을 완료하면 Atelier가 자동으로 연결 상태를 감지합니다.",
    loginModalCheckingNow: "확인 중…",
    loginModalDetected: "로그인 감지! 곧 자동 닫힘.",
    loginModalCancel: "닫기",
    loginModalCodeLabel: "인증 코드",
    loginModalCodePlaceholder: "브라우저에 표시된 인증 코드를 붙여넣기",
    loginModalCodeSubmit: "코드 전달",
    loginModalCodeSubmitting: "전달 중…",
    loginModalCodeSubmitted: "전달됨",
    loginModalWaitingUrl: "브라우저가 열리지 않으면 로그인 URL을 감지하는 즉시 여기 표시합니다.",
    loginModalOpenUrl: "브라우저 열기",
    loginModalCopyUrl: "URL 복사",
    loginModalUrlCopied: "복사됨",
    loginModalOpenFailed: "자동 열기에 실패했습니다. URL을 복사해서 브라우저 주소창에 붙여넣어 주세요.",
    loginModalOpenRetryLimit:
      "브라우저 자동 열기를 3회 시도했지만 확인하지 못했습니다. 브라우저 열기를 다시 누르거나 URL을 복사해 주세요.",
    loginModalNoSignal:
      "20초 동안 브라우저 또는 로그인 URL을 확인하지 못했습니다. CLI 출력을 확인하고 URL이 나타나면 브라우저 열기 또는 URL 복사를 사용하세요.",
    loginModalCliOutput: "CLI 출력",
    loginModalFailed: "로그인 진행에 확인이 필요합니다.",
    loginModalTimeout: "5분 동안 연결을 확인하지 못했습니다. 창을 닫고 다시 로그인해 주세요.",
    hermesTitle: "Hermes",
    hermesDesc:
      "Hermes 에이전트는 Atelier가 첫 사용 시 고정 버전 격리 런타임과 어댑터 전용 기본 스킬을 자동 준비합니다. 별도 스킬 설치는 필요 없습니다.",
    hermesBackendLabel: "새 작업 기본 모델 공급자",
    modelProviderDefaultHelp:
      "여기서 바꾸면 다음에 만드는 작업부터 적용됩니다. 진행 중인 작업은 유지되며, 작업 입력창에서 공급자를 바꾸면 이 기본값도 함께 업데이트됩니다.",
    hermesCliLabel: "실행 · Hermes 격리 런타임",
    hermesCliReady: "Atelier 전용 Hermes 실행환경이 준비되어 있습니다.",
    hermesCliInstall: "지금 준비",
    hermesCliReinstall: "설치·복구",
    hermesNotInstalled: "첫 작업을 보낼 때 Atelier가 자동으로 준비합니다.",
    hermesNeedCred: (label: string) =>
      `선택된 백엔드(${label})의 자격증명이 없습니다. 위 카드에서 먼저 연결하세요.`,
    hermesUpdateLabel: "업데이트",
    hermesUpdateChecking: "확인 중…",
    hermesUpdateLatest: "최신 버전",
    hermesUpdateAvailable: (n: number) => `업데이트 가능 · ${n} 커밋 뒤`,
    hermesUpdateAvailableNoCount: "업데이트 가능",
    hermesUpdating: "업데이트 중…",
    hermesUpdateButton: "업데이트",
    hermesRecheck: "다시 확인",
    hermesVersionPrefix: "버전",
    gajecodeTitle: "가재코드",
    gajecodeDesc:
      "가재코드 에이전트는 Atelier 전용 HOME에서 실행됩니다. 첫 사용 시 고정 버전 런타임과 전용 기본 스킬을 자동 준비하므로 Atelier만 설치하면 됩니다.",
    gajecodeBackendLabel: "새 작업 기본 모델 공급자",
    gajecodeExecutionLabel: "실행 · GJC 격리 런타임",
    gajecodeSkillsLabel: "스킬 · 가재코드 전용",
    gajecodeSkillsReady: "어댑터가 소유한 기본 스킬을 자동 준비합니다. Mac의 공용 스킬을 가져오지 않으며 별도 설치가 필요 없습니다.",
    gajecodePrepare: "지금 준비",
    gajecodeRepair: "설치·복구",
    gajecodePreparing: "준비 중…",
    gajecodePrepared: "가재코드 실행환경과 기본 스킬 준비를 확인했습니다.",
    gajecodeUpdateLabel: "업데이트",
    gajecodeUpdateChecking: "확인 중…",
    gajecodeUpdateLatest: "최신 버전",
    gajecodeUpdateAvailable: "업데이트 가능",
    gajecodeUpdating: "업데이트 중…",
    gajecodeUpdateButton: "업데이트",
    gajecodeRecheck: "다시 확인",
    gajecodeVersionPrefix: "버전",
    gajecodeNotInstalled: "첫 작업을 보낼 때 Atelier가 자동으로 준비합니다.",
    gajecodeInstallIsolation: "Atelier 전용 .gjc와 고정 버전 실행환경을 사용합니다.",
    gajecodeNeedCred: (label: string) =>
      `선택된 모델 공급자(${label})의 자격증명이 없습니다. 위 카드에서 먼저 연결하세요.`,
  },
  en: {
    title: "Connections",
    sub: "Connect a subscription or API key for the providers you want to use. Keys are stored only in the OS secure store (Keychain / Credential Manager).",
    agentKind: "Agent",
    modelProviderKind: "Model provider",
    serviceKind: "Service",
    statusOk: "Connected",
    statusCliReady: "CLI installed",
    statusNoCli: "CLI not installed",
    statusAutoPrepare: "Auto on first use",
    statusNoKey: "No key",
    runtimeChecking: "Checking isolated runtime…",
    runtimeInstalling: "Installing pinned runtime…",
    runtimeSkills: "Preparing isolated default skills…",
    runtimeVerifying: "Verifying runtime and skills…",
    runtimeReady: "Runtime and default skills ready",
    runtimeFailed: "Automatic preparation failed · run Install/repair again.",
    runtimeEvidence: "Readiness evidence",
    runtimePin: "Runtime pin",
    runtimeDependencyPin: "Dependency pin",
    runtimePolicy: "Execution policy",
    runtimeSkillBundle: "Default skill bundle",
    runtimeReceipt: "Readiness receipt",
    apiInputLabel: "API key",
    apiInputPlaceholder: "Paste your key and save",
    save: "Save",
    saved: "Saved",
    saving: "Saving…",
    clear: "Remove",
    issueLink: "Open key issuance page",
    installLink: "Install guide",
    installAuto: "Install automatically",
    installing: "Installing…",
    installPrompt: "CLI is not installed. Click automatic install to set it up.",
    oauthReconnect: "Sign in again",
    installTimeout:
      "Atelier still cannot detect the CLI. Check Node.js/npm, Git Bash, or your network, then try again.",
    refresh: "Refresh status",
    browserProbeTitle: "Browser handoff diagnostics",
    browserProbeClaude: "Test Claude",
    browserProbeCodex: "Test Codex",
    browserProbeRunning: "Handing off to the browser…",
    browserProbeSuccess: (name: string, handoff: string) =>
      `${name} login URL was handed to the OS via ${handoff}. Confirm that the browser window appeared.`,
    browserProbeFailed: (message: string) => `Browser handoff failed: ${message}`,
    loginStartFailed: (name: string, message: string) =>
      `Could not start ${name} sign-in. ${message}`,
    loginAlreadyConnected: (name: string) => `${name} subscription sign-in is already connected.`,
    loginStartedBrowser: (name: string) =>
      `${name} sign-in command started and the browser was opened. Finish SNS sign-in and Atelier will detect it automatically.`,
    loginStartedWatching: (name: string) =>
      `${name} sign-in command started. If the browser does not open immediately, Atelier will keep watching the CLI output for a login URL.`,
    loginStartedNoBrowser: (name: string) =>
      `${name} sign-in command started, but Atelier could not open the browser automatically. Refresh the status shortly or check the automatic install state.`,
    loginModalTitle: "Complete sign-in in your browser",
    loginModalDesc:
      "Finish SNS (Google/Apple/etc.) sign-in and Atelier will detect the connection automatically.",
    loginModalCheckingNow: "Checking…",
    loginModalDetected: "Sign-in detected! Closing shortly.",
    loginModalCancel: "Close",
    loginModalCodeLabel: "Authentication code",
    loginModalCodePlaceholder: "Paste the code shown in your browser",
    loginModalCodeSubmit: "Submit code",
    loginModalCodeSubmitting: "Submitting…",
    loginModalCodeSubmitted: "Submitted",
    loginModalWaitingUrl: "If the browser does not open, Atelier will show the login URL here as soon as it is detected.",
    loginModalOpenUrl: "Open browser",
    loginModalCopyUrl: "Copy URL",
    loginModalUrlCopied: "Copied",
    loginModalOpenFailed: "Automatic open failed. Copy the URL and paste it into your browser address bar.",
    loginModalOpenRetryLimit:
      "Atelier tried to open the browser three times without confirmation. Use Open browser again or copy the URL.",
    loginModalNoSignal:
      "Atelier did not detect a browser or login URL within 20 seconds. Check the CLI output, then open or copy the URL when it appears.",
    loginModalCliOutput: "CLI output",
    loginModalFailed: "The sign-in flow needs your attention.",
    loginModalTimeout: "Atelier could not verify the connection within five minutes. Close this dialog and try again.",
    hermesTitle: "Hermes",
    hermesDesc:
      "On first use, Atelier automatically prepares a pinned isolated Hermes runtime and adapter-owned default skills. No separate skill install is required.",
    hermesBackendLabel: "Default model provider for new tasks",
    modelProviderDefaultHelp:
      "Changes apply to tasks created afterward. Current tasks stay unchanged, and changing the provider in the task composer also updates this default.",
    hermesCliLabel: "Execution · isolated Hermes runtime",
    hermesCliReady: "The Atelier-owned Hermes runtime is ready.",
    hermesCliInstall: "Prepare now",
    hermesCliReinstall: "Install/repair",
    hermesNotInstalled: "Atelier prepares it automatically when you send the first task.",
    hermesNeedCred: (label: string) =>
      `No credential for the selected backend (${label}). Connect it in the card above first.`,
    hermesUpdateLabel: "Update",
    hermesUpdateChecking: "Checking…",
    hermesUpdateLatest: "Up to date",
    hermesUpdateAvailable: (n: number) => `Update available · ${n} commits behind`,
    hermesUpdateAvailableNoCount: "Update available",
    hermesUpdating: "Updating…",
    hermesUpdateButton: "Update",
    hermesRecheck: "Re-check",
    hermesVersionPrefix: "Version",
    gajecodeTitle: "Gajae Code",
    gajecodeDesc:
      "The Gajae Code agent runs under Atelier's dedicated HOME. Its pinned runtime and isolated default skills are prepared automatically on first use, so installing Atelier is enough.",
    gajecodeBackendLabel: "Default model provider for new tasks",
    gajecodeExecutionLabel: "Execution · isolated GJC runtime",
    gajecodeSkillsLabel: "Skills · Gajae Code owned",
    gajecodeSkillsReady: "The adapter prepares its default skills automatically. Mac-wide skills are not imported, and no separate install is required.",
    gajecodePrepare: "Prepare now",
    gajecodeRepair: "Install/repair",
    gajecodePreparing: "Preparing…",
    gajecodePrepared: "Gajae Code runtime and default skill readiness verified.",
    gajecodeUpdateLabel: "Update",
    gajecodeUpdateChecking: "Checking…",
    gajecodeUpdateLatest: "Up to date",
    gajecodeUpdateAvailable: "Update available",
    gajecodeUpdating: "Updating…",
    gajecodeUpdateButton: "Update",
    gajecodeRecheck: "Re-check",
    gajecodeVersionPrefix: "Version",
    gajecodeNotInstalled: "Atelier prepares it automatically when you send the first task.",
    gajecodeInstallIsolation: "Uses Atelier's dedicated .gjc and pinned runtime.",
    gajecodeNeedCred: (label: string) =>
      `No credential for the selected model provider (${label}). Connect it in the card above first.`,
  },
} as const;

type CopyT = typeof COPY[keyof typeof COPY];

function connectionStatus(
  providerId: ProviderId,
  status: ProviderStatus | null,
  copy: CopyT,
): { tone: "ok" | "info" | "warn" | "neutral"; label: string } {
  const provider = PROVIDERS.find((candidate) => candidate.id === providerId);
  const connected = Boolean(status?.oauth_logged_in || status?.api_key_present);
  const cliInstalled = Boolean(status?.cli_installed);
  const requiresCli = providerId === "hermes" || Boolean(provider?.installHelp);

  if (connected) return { tone: "ok", label: copy.statusOk };
  if (cliInstalled) return { tone: "info", label: copy.statusCliReady };
  if (providerId === "hermes" || providerId === "gajecode") {
    return { tone: "info", label: copy.statusAutoPrepare };
  }
  if (requiresCli) return { tone: "warn", label: copy.statusNoCli };
  return { tone: "neutral", label: copy.statusNoKey };
}

function managedRuntimeProgressText(
  progress: ManagedAgentRuntimeProgress | null,
  copy: CopyT,
) {
  if (!progress) return null;
  const labels: Record<ManagedAgentRuntimeProgress["state"], string> = {
    checking: copy.runtimeChecking,
    installing: copy.runtimeInstalling,
    bootstrapping_skills: copy.runtimeSkills,
    verifying: copy.runtimeVerifying,
    ready: copy.runtimeReady,
    failed: copy.runtimeFailed,
  };
  return labels[progress.state] || progress.message;
}

function useManagedRuntimeProgress(provider: "hermes" | "gajecode") {
  const [progress, setProgress] = useState<ManagedAgentRuntimeProgress | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    onManagedAgentRuntimeProgress((event) => {
      if (!cancelled && event.provider === provider) setProgress(event);
    })
      .then((dispose) => {
        if (cancelled) dispose();
        else unlisten = dispose;
      })
      .catch((error) => console.warn("managed runtime progress listener failed", error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [provider]);
  return progress;
}

const RuntimeReadinessEvidence: React.FC<{
  readiness: ManagedAgentRuntimeReadiness | null;
  copy: CopyT;
  dark: boolean;
}> = ({ readiness, copy, dark }) => {
  if (!readiness?.ready) return null;
  return (
    <details
      data-testid="managed-runtime-readiness-receipt"
      data-runtime-provider={readiness.provider}
      className={cls("mt-2 rounded-md border px-3 py-2", dark ? "border-dline bg-dbg" : "border-line bg-cream")}
    >
      <summary className="cursor-pointer text-[11.5px] font-semibold">
        {copy.runtimeEvidence} · {copy.runtimeReady}
      </summary>
      <dl className={cls("mt-2 grid gap-1 text-[10.5px]", dark ? "text-dsub" : "text-sub")}>
        <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-2">
          <dt>{copy.runtimePin}</dt>
          <dd className="break-all font-mono">{readiness.runtimePin}</dd>
        </div>
        {readiness.dependencyPin && (
          <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-2">
            <dt>{copy.runtimeDependencyPin}</dt>
            <dd className="break-all font-mono">{readiness.dependencyPin}</dd>
          </div>
        )}
        <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-2">
          <dt>{copy.runtimePolicy}</dt>
          <dd className="break-all font-mono">{readiness.policyVersion}</dd>
        </div>
        <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-2">
          <dt>{copy.runtimeSkillBundle}</dt>
          <dd className="break-all font-mono">{readiness.skillBootstrapVersion}</dd>
        </div>
        <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-2">
          <dt>{copy.runtimeReceipt}</dt>
          <dd className="break-all font-mono">{readiness.receiptPath}</dd>
        </div>
      </dl>
    </details>
  );
};

async function openExternalUrl(provider: ProviderId, url: string): Promise<boolean> {
  if (!isAllowedOauthLoginUrl(provider, url)) return false;

  // Keep one authoritative desktop path. The Rust command validates the
  // provider host and uses native ShellExecuteExW/open instead of treating a
  // successful plugin invocation as proof that Windows displayed a browser.
  try {
    await providerOpenOauthLoginUrl(provider, url);
    return true;
  } catch {
    if (isTauri()) {
      try {
        // Independent OS-open fallback for packaged hosts where the direct
        // Windows shell call is rejected by the local runtime or policy.
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
        return true;
      } catch {
        return false;
      }
    }
  }
  return !isTauri() && window.open(url, "_blank", "noopener,noreferrer") !== null;
}

export const ConnectionsPanel: React.FC<Props> = ({ tw }) => {
  const dark = tw.dark;
  const lang = tw.language;
  const copy = COPY[lang];
  const [statuses, setStatuses] = useState<Record<ProviderId, ProviderStatus | null>>({
    claude: null,
    codex: null,
    openrouter: null,
    alibaba: null,
    linear: null,
    hermes: null,
    gajecode: null,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loginModal, setLoginModal] = useState<{
    provider: ProviderId;
    name: string;
    detected: boolean;
    message: string;
    loginUrl?: string | null;
    diagnostic?: string | null;
    failed?: string | null;
  } | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const [browserProbeBusy, setBrowserProbeBusy] = useState<"claude" | "codex" | null>(null);
  const [browserProbeResult, setBrowserProbeResult] = useState<ProviderBrowserProbeResult | null>(null);
  const [browserProbeError, setBrowserProbeError] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>("claude");

  const refresh = useCallback(async (only?: ProviderId) => {
    const targets = only ? [only] : (["claude", "codex", "openrouter", "alibaba", "linear", "hermes", "gajecode"] as ProviderId[]);
    const results = await Promise.all(
      targets.map(async (pid) => {
        const status = await providerStatus(pid).catch(() => null);
        return [pid, status] as const;
      }),
    );
    setStatuses((prev) => {
      const next = { ...prev };
      for (const [pid, status] of results) next[pid] = status;
      return next;
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pollRef = useRef<number | null>(null);
  const openedLoginUrlsRef = useRef<Record<string, string | null>>({});
  const openingLoginUrlsRef = useRef<Record<string, string | null>>({});
  const loginUrlAttemptsRef = useRef<Record<string, LoginUrlAttempt>>({});
  type LoginUrlOpenResult =
    | "opened"
    | "already-opened"
    | "opening"
    | "cooldown"
    | "limit"
    | "failed";
  const openLoginUrlWithRetry = useCallback(async (
    provider: ProviderId,
    url: string,
    force = false,
  ): Promise<LoginUrlOpenResult> => {
    if (openedLoginUrlsRef.current[provider] === url) return "already-opened";
    if (openingLoginUrlsRef.current[provider] === url) return "opening";

    const plan = planOauthLoginUrlAttempt(
      loginUrlAttemptsRef.current[provider],
      url,
      Date.now(),
      force,
    );
    loginUrlAttemptsRef.current[provider] = plan.next;
    if (!plan.shouldOpen) return plan.reason === "limit" ? "limit" : "cooldown";
    openingLoginUrlsRef.current[provider] = url;
    try {
      const opened = await openExternalUrl(provider, url);
      if (opened) openedLoginUrlsRef.current[provider] = url;
      return opened ? "opened" : "failed";
    } finally {
      if (openingLoginUrlsRef.current[provider] === url) {
        openingLoginUrlsRef.current[provider] = null;
      }
    }
  }, []);
  const loginProvider = loginModal?.provider ?? null;
  useEffect(() => {
    if (!loginProvider) return;
    let cancelled = false;
    const start = Date.now();
    const stopPolling = () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const poll = async () => {
      const loginState = await providerOauthLoginState(loginProvider).catch(() => null);
      if (cancelled) return;
      if (loginState) {
        const nextUrl = loginState.login_url || null;
        let openResult: LoginUrlOpenResult | null = null;
        if (nextUrl && loginState.browser_opened) {
          openedLoginUrlsRef.current[loginProvider] = nextUrl;
        } else if (nextUrl && openedLoginUrlsRef.current[loginProvider] !== nextUrl) {
          openResult = await openLoginUrlWithRetry(loginProvider, nextUrl);
          if (cancelled) return;
        }
        const browserReady =
          loginState.browser_opened
          || Boolean(nextUrl && openedLoginUrlsRef.current[loginProvider] === nextUrl);
        const signalTimedOut = hasOauthLoginSignalTimedOut(
          start,
          Date.now(),
          loginState.active,
          browserReady,
          nextUrl,
        );
        setLoginModal((m) =>
          m?.provider === loginProvider
            ? {
                ...m,
                loginUrl: nextUrl || m.loginUrl || null,
                diagnostic: loginState.output || m.diagnostic || null,
                failed: loginState.error
                  || (openResult === "limit" ? copy.loginModalOpenRetryLimit : null)
                  || (openResult === "failed" ? copy.loginModalOpenFailed : null)
                  || (signalTimedOut ? copy.loginModalNoSignal : null)
                  || (browserReady || (nextUrl && m.failed === copy.loginModalNoSignal)
                    ? null
                    : m.failed),
              }
            : m,
        );
        if (!loginState.active && loginState.error) {
          stopPolling();
          return;
        }
      }
      if (
        !loginState
        && hasOauthLoginSignalTimedOut(start, Date.now(), true, false, null)
      ) {
        setLoginModal((m) =>
          m?.provider === loginProvider && !m.loginUrl
            ? { ...m, failed: copy.loginModalNoSignal }
            : m,
        );
      }
      const s = await providerStatus(loginProvider).catch(() => null);
      if (cancelled) return;
      if (s) {
        setStatuses((prev) => ({ ...prev, [loginProvider]: s }));
        if (s.oauth_logged_in) {
          setLoginModal((m) => (m?.provider === loginProvider ? { ...m, detected: true, failed: null } : m));
          setTimeout(() => setLoginModal(null), 1400);
          stopPolling();
          return;
        }
      }
      if (Date.now() - start > 5 * 60 * 1000) {
        setLoginModal((m) =>
          m?.provider === loginProvider ? { ...m, failed: copy.loginModalTimeout } : m,
        );
        stopPolling();
      }
    };
    void poll();
    pollRef.current = window.setInterval(() => void poll(), 1500);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [
    copy.loginModalNoSignal,
    copy.loginModalOpenFailed,
    copy.loginModalOpenRetryLimit,
    copy.loginModalTimeout,
    loginProvider,
    openLoginUrlWithRetry,
  ]);

  function loginNoticeForResult(p: ProviderDef, result: ProviderLoginOauthResult) {
    if (result.already_logged_in) return copy.loginAlreadyConnected(p.name);
    if (p.id === "codex") {
      return tw.language === "en"
        ? "OpenAI device sign-in started. Enter the one-time code shown below in the browser page."
        : "OpenAI 기기 로그인을 시작했습니다. 브라우저 페이지에 아래 일회용 코드를 입력하세요.";
    }
    if (result.browser_opened) return copy.loginStartedBrowser(p.name);
    if (p.id === "claude") {
      return tw.language === "en"
        ? "Claude sign-in started. Paste the browser authentication code into the field below."
        : "Claude 로그인 명령을 시작했습니다. 브라우저에 표시된 인증 코드를 아래 입력칸에 붙여넣으세요.";
    }
    if (result.login_url_detected) return copy.loginStartedNoBrowser(p.name);
    return copy.loginStartedWatching(p.name);
  }

  async function startLogin(p: ProviderDef, force = false) {
    setBusyId(p.id);
    setPanelError(null);
    setPanelNotice(null);
    openedLoginUrlsRef.current[p.id] = null;
    openingLoginUrlsRef.current[p.id] = null;
    delete loginUrlAttemptsRef.current[p.id];
    try {
      const result = await providerLoginOauth(p.id, force);
      const notice = loginNoticeForResult(p, result);
      setPanelNotice(notice);
      setLoginModal({
        provider: p.id,
        name: p.name,
        detected: result.completed || result.already_logged_in,
        message: notice,
        loginUrl: result.login_url || null,
        diagnostic: result.diagnostic || null,
        failed: null,
      });
      if (result.login_url) {
        if (result.browser_opened) openedLoginUrlsRef.current[p.id] = result.login_url;
        else {
          const openResult = await openLoginUrlWithRetry(p.id, result.login_url);
          if (openResult === "failed" || openResult === "limit") {
            setLoginModal((m) =>
              m?.provider === p.id
                ? {
                    ...m,
                    failed: openResult === "limit"
                      ? copy.loginModalOpenRetryLimit
                      : copy.loginModalOpenFailed,
                  }
                : m,
            );
          }
        }
      }
      void refresh(p.id);
      if (result.completed || result.already_logged_in) {
        setTimeout(() => setLoginModal(null), 1400);
      }
    } catch (e) {
      setPanelError(copy.loginStartFailed(p.name, String(e)));
      void refresh(p.id);
    } finally {
      setTimeout(() => setBusyId(null), 800);
    }
  }

  async function runBrowserProbe(provider: "claude" | "codex") {
    setBrowserProbeBusy(provider);
    setBrowserProbeResult(null);
    setBrowserProbeError(null);
    try {
      setBrowserProbeResult(await providerOauthBrowserProbe(provider));
    } catch (error) {
      setBrowserProbeError(copy.browserProbeFailed(String(error)));
    } finally {
      setBrowserProbeBusy(null);
    }
  }

  const providerChoices: Array<{ id: ProviderId; name: string; kind: string }> = [
    ...PROVIDERS.filter((provider) => provider.id !== "gajecode").map((provider) => ({
      id: provider.id,
      name: provider.name,
      kind: provider.id === "linear" ? copy.serviceKind : copy.modelProviderKind,
    })),
    { id: "hermes", name: copy.hermesTitle, kind: copy.agentKind },
    { id: "gajecode", name: copy.gajecodeTitle, kind: copy.agentKind },
  ];
  const selectedProvider = selectedProviderId === "gajecode"
    ? null
    : PROVIDERS.find((provider) => provider.id === selectedProviderId) ?? null;

  return (
    <div className={cls("space-y-4", dark ? "text-dink" : "text-ink")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 className="font-display text-[20px] font-[500]">{copy.title}</h2>
          <p className={cls("text-[13px] leading-relaxed max-w-[720px]", dark ? "text-dsub" : "text-sub")}>
            {copy.sub}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className={cls(
            "h-8 shrink-0 rounded-md border px-3 text-[12px] transition-colors",
            dark
              ? "border-dline text-dsub hover:bg-dpanel hover:text-dink"
              : "border-line text-sub hover:bg-panel hover:text-ink",
          )}
        >
          ↻ {copy.refresh}
        </button>
      </header>

      <div
        data-testid="connection-provider-picker"
        className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7"
      >
        {providerChoices.map((provider) => {
          const status = connectionStatus(provider.id, statuses[provider.id], copy);
          const selected = provider.id === selectedProviderId;
          return (
            <button
              key={provider.id}
              type="button"
              data-connection-provider={provider.id}
              aria-pressed={selected}
              onClick={() => setSelectedProviderId(provider.id)}
              className={cls(
                "min-w-0 rounded-md border px-3 py-2 text-left transition-colors",
                selected
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : dark
                  ? "border-dline bg-dpanel hover:border-[var(--accent-hover)]"
                  : "border-line bg-panel hover:border-[var(--accent-hover)]",
              )}
            >
              <span className={cls("block truncate text-[9px] uppercase tracking-wider", dark ? "text-dsub" : "text-sub")}>
                {provider.kind}
              </span>
              <span className="block truncate text-[12px] font-medium">{provider.name}</span>
              <span className="mt-1 block">
                <StatusDot tone={status.tone} label={status.label} dark={dark} />
              </span>
            </button>
          );
        })}
      </div>

      <div data-testid="selected-connection-provider" className="space-y-3">
        {selectedProvider && (
          <ProviderCard
            key={selectedProvider.id}
            def={selectedProvider}
            tw={tw}
            status={statuses[selectedProvider.id]}
            busy={busyId === selectedProvider.id}
            onStartLogin={(force) => void startLogin(selectedProvider, force)}
            onSaved={() => void refresh(selectedProvider.id)}
            onCleared={() => void refresh(selectedProvider.id)}
            onInstalled={() => {
              setBusyId(selectedProvider.id);
              setTimeout(() => {
                setBusyId(null);
                void refresh(selectedProvider.id);
              }, 4000);
            }}
          />
        )}

        {selectedProviderId === "hermes" && (
          <HermesCard
            tw={tw}
            statuses={statuses}
            onInstalled={() => {
              setTimeout(() => void refresh("hermes"), 1000);
            }}
          />
        )}

        {selectedProviderId === "gajecode" && (
          <GajecodeCard
            tw={tw}
            statuses={statuses}
            status={statuses.gajecode}
            onUpdated={() => {
              setTimeout(() => void refresh("gajecode"), 1000);
            }}
          />
        )}
      </div>

      <details
        data-testid="browser-handoff-diagnostics"
        className={cls("border-y", dark ? "border-dline" : "border-line")}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-[12.5px] font-medium">
          <span>{copy.browserProbeTitle}</span>
          <span className={cls("text-[11px]", dark ? "text-dsub" : "text-sub")}>
            {lang === "ko" ? "필요할 때 열기" : "Open when needed"}
          </span>
        </summary>
        <div className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runBrowserProbe("claude")}
              disabled={browserProbeBusy !== null}
              className={cls(
                "h-8 rounded-md border px-3 text-[12px] disabled:opacity-50",
                dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
              )}
            >
              {browserProbeBusy === "claude" ? copy.browserProbeRunning : copy.browserProbeClaude}
            </button>
            <button
              type="button"
              onClick={() => void runBrowserProbe("codex")}
              disabled={browserProbeBusy !== null}
              className={cls(
                "h-8 rounded-md border px-3 text-[12px] disabled:opacity-50",
                dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
              )}
            >
              {browserProbeBusy === "codex" ? copy.browserProbeRunning : copy.browserProbeCodex}
            </button>
          </div>
          {browserProbeResult && (
            <div className={cls("mt-2 text-[11.5px] leading-relaxed", dark ? "text-dsub" : "text-sub")}>
              {copy.browserProbeSuccess(
                browserProbeResult.provider === "claude" ? "Claude" : "Codex",
                browserProbeResult.handoff,
              )}
            </div>
          )}
          {browserProbeError && (
            <div className={cls("mt-2 text-[11.5px]", dark ? "text-red-300" : "text-red-700")}>
              {browserProbeError}
            </div>
          )}
        </div>
      </details>

      <details
        data-testid="connection-tools"
        className={cls("rounded-lg border", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12.5px] font-medium">
          <span>{lang === "ko" ? "연결 도구" : "Connection tools"}</span>
          <span className={cls("text-[11px] font-normal", dark ? "text-dsub" : "text-sub")}>
            {lang === "ko" ? "SSH · 개발 서비스 · 사용량" : "SSH · dev services · usage"}
          </span>
        </summary>
        <div className={cls("space-y-3 border-t p-3", dark ? "border-dline" : "border-line")}>
          <FeaturePanels slot="connections" tw={tw} />
        </div>
      </details>

      {panelError && (
        <div
          data-testid="connection-panel-error"
          className={cls(
            "text-[12px] px-3 py-2 rounded-md border",
            dark ? "border-red-700/40 bg-red-900/20 text-red-300" : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {panelError}
        </div>
      )}
      {panelNotice && (
        <div
          data-testid="connection-panel-notice"
          className={cls(
            "text-[12px] px-3 py-2 rounded-md border",
            dark ? "border-dline bg-dbg text-dsub" : "border-line bg-cream text-sub",
          )}
        >
          {panelNotice}
        </div>
      )}

      {loginModal && (
        <LoginModal
          provider={loginModal.provider}
          name={loginModal.name}
          detected={loginModal.detected}
          message={loginModal.message}
          loginUrl={loginModal.loginUrl}
          diagnostic={loginModal.diagnostic}
          failed={loginModal.failed}
          dark={dark}
          copy={copy}
          onSubmitCode={(code) => providerSubmitOauthCode(loginModal.provider, code)}
          onClose={() => setLoginModal(null)}
        />
      )}
    </div>
  );
};

interface CardProps {
  def: ProviderDef;
  tw: Tweaks;
  status: ProviderStatus | null;
  busy: boolean;
  onStartLogin: (force?: boolean) => void;
  onSaved: () => void;
  onCleared: () => void;
  onInstalled: () => void;
}

const ProviderCard: React.FC<CardProps> = ({
  def,
  tw,
  status,
  busy,
  onStartLogin,
  onSaved,
  onCleared,
  onInstalled,
}) => {
  const dark = tw.dark;
  const lang = tw.language;
  const copy = COPY[lang];
  const [keyInput, setKeyInput] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [installing, setInstalling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supportsOauth = status?.supports_oauth ?? !!def.oauthCta[lang];
  const supportsApi = status?.supports_api ?? !!def.apiHelp[lang];
  const supportsInstall = !!def.installHelp;
  const cliInstalled = status?.cli_installed ?? false;
  const oauthLoggedIn = status?.oauth_logged_in ?? false;
  const apiKeyPresent = status?.api_key_present ?? false;
  const connected = oauthLoggedIn || apiKeyPresent;
  const shouldForceOauthLogin = (def.id === "claude" || def.id === "codex") && oauthLoggedIn;
  const oauthButtonLabel = shouldForceOauthLogin ? copy.oauthReconnect : def.oauthCta[lang];

  const statusLabel = connected
    ? copy.statusOk
    : supportsInstall && !cliInstalled
    ? copy.statusNoCli
    : supportsInstall && cliInstalled
    ? copy.statusCliReady
    : copy.statusNoKey;
  const statusTone: "ok" | "info" | "warn" | "neutral" = connected
    ? "ok"
    : supportsInstall && !cliInstalled
    ? "warn"
    : supportsInstall && cliInstalled
    ? "info"
    : "neutral";

  async function handleSave() {
    if (!keyInput.trim()) return;
    setSaveState("saving");
    setErrorMsg(null);
    try {
      await providerSaveApiKey(def.id, keyInput.trim());
      setKeyInput("");
      setSaveState("saved");
      await new Promise((r) => setTimeout(r, 1200));
      setSaveState("idle");
      onSaved();
    } catch (e) {
      setSaveState("error");
      setErrorMsg(String(e));
    }
  }

  async function handleClear() {
    try {
      await providerClearCredentials(def.id);
      setKeyInput("");
      setSaveState("idle");
      onCleared();
    } catch (e) {
      setErrorMsg(String(e));
    }
  }

  async function handleAutoInstall() {
    if (cliInstalled) return;
    setInstalling(true);
    setErrorMsg(null);
    try {
      await providerInstallCli(def.id);
      const started = Date.now();
      while (Date.now() - started < 5 * 60 * 1000) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const next = await providerStatus(def.id).catch(() => null);
        if (next?.cli_installed) {
          onInstalled();
          setInstalling(false);
          return;
        }
      }
      setErrorMsg(copy.installTimeout);
      setInstalling(false);
    } catch (e) {
      setErrorMsg(String(e));
      setInstalling(false);
    }
  }

  return (
    <div
      data-provider-card={def.id}
      data-provider-connected={connected ? "true" : "false"}
      data-provider-oauth-connected={oauthLoggedIn ? "true" : "false"}
      className={cls(
        "rounded-lg border p-4 transition-colors",
        dark ? "border-dline bg-dpanel" : "border-line bg-panel",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[14px]">{def.name}</span>
            <StatusDot tone={statusTone} label={statusLabel} dark={dark} />
          </div>
          <p className={cls("text-[12.5px] leading-relaxed mt-1", dark ? "text-dsub" : "text-sub")}>
            {def.desc[lang]}
          </p>
        </div>
      </div>

      {(supportsOauth || supportsInstall) && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            {supportsOauth && (
              <button
                data-provider-oauth-action={def.id}
                onClick={() => {
                  if (!cliInstalled) {
                    setErrorMsg(`${copy.installPrompt} ${def.installHelp?.[lang] ?? ""}`.trim());
                    return;
                  }
                  onStartLogin(shouldForceOauthLogin);
                }}
                disabled={busy}
                className={cls(
                  "text-[12.5px] h-8 px-3 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  cliInstalled
                    ? "bg-[var(--accent)] text-white border-[var(--accent-hover)] hover:opacity-90"
                    : dark
                    ? "border-dline bg-dbg text-dsub hover:text-dink"
                    : "border-line bg-cream text-sub hover:text-ink",
                )}
              >
                {oauthButtonLabel}
              </button>
            )}
            <button
              onClick={() => void handleAutoInstall()}
              disabled={installing || cliInstalled}
              className={cls(
                "text-[12.5px] h-8 px-3 rounded-md border font-medium transition-colors",
                cliInstalled
                  ? dark
                    ? "border-dline bg-dbg text-dsub"
                    : "border-line bg-cream text-sub"
                  : "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/40 hover:bg-[var(--accent)]/20",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            >
              {cliInstalled ? copy.statusCliReady : installing ? copy.installing : `+ ${copy.installAuto}`}
            </button>
            {connected && (
              <button
                onClick={() => void handleClear()}
                className={cls(
                  "text-[12px] h-8 px-3 rounded-md border",
                  dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
                )}
              >
                {copy.clear}
              </button>
            )}
          </div>
          {!cliInstalled && def.installHelp ? (
            <div className={cls("text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
              {copy.installPrompt} {def.installHelp[lang]}{" "}
              {def.installUrl ? (
                <a href={def.installUrl} target="_blank" rel="noreferrer" className="underline text-[var(--accent)]">
                  {copy.installLink} ↗
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {supportsApi && (
        <div className="mt-3">
          <label className={cls("block text-[11.5px] uppercase tracking-wider font-semibold mb-1.5", dark ? "text-dsub" : "text-sub")}>
            {copy.apiInputLabel}
          </label>
          {apiKeyPresent ? (
            <div className="flex items-center gap-2">
              <code
                className={cls(
                  "flex-1 px-3 h-9 inline-flex items-center rounded-md border text-[12.5px] gb-mono",
                  dark ? "border-dline bg-dbg text-dink" : "border-line bg-cream text-ink",
                )}
              >
                {status?.api_key_masked || "••••"}
              </code>
              <button
                onClick={() => void handleClear()}
                className={cls(
                  "text-[12px] h-9 px-3 rounded-md border",
                  dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
                )}
              >
                {copy.clear}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={copy.apiInputPlaceholder}
                aria-label={`${def.name} ${copy.apiInputLabel}`}
                className={cls(
                  "flex-1 px-3 h-9 rounded-md border text-[13px] outline-none",
                  dark
                    ? "border-dline bg-dbg text-dink placeholder:text-dsub focus:border-[var(--accent)]"
                    : "border-line bg-cream text-ink placeholder:text-sub focus:border-[var(--accent)]",
                )}
              />
              <button
                onClick={() => void handleSave()}
                disabled={!keyInput.trim() || saveState === "saving"}
                className={cls(
                  "text-[12.5px] h-9 px-3 rounded-md border",
                  "bg-[var(--accent)] text-white border-[var(--accent-hover)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {saveState === "saving" ? copy.saving : saveState === "saved" ? copy.saved : copy.save}
              </button>
            </div>
          )}
          <div className={cls("text-[11.5px] mt-1.5 flex items-center gap-1.5", dark ? "text-dsub" : "text-sub")}>
            <span>{def.apiHelp[lang]}</span>
            {def.apiUrl ? (
              <a href={def.apiUrl} target="_blank" rel="noreferrer" className="underline text-[var(--accent)]">
                {copy.issueLink} ↗
              </a>
            ) : null}
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          className={cls(
            "mt-3 text-[12px] px-3 py-2 rounded-md border",
            dark ? "border-red-700/40 bg-red-900/20 text-red-300" : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
};

const HermesCard: React.FC<{
  tw: Tweaks;
  statuses: Record<ProviderId, ProviderStatus | null>;
  onInstalled: () => void;
}> = ({ tw, statuses, onInstalled }) => {
  const dark = tw.dark;
  const lang = tw.language;
  const copy = COPY[lang];
  const hermes = statuses.hermes;
  const installed = hermes?.cli_installed ?? false;

  const [backend, setBackend] = useState<HermesModelProvider>(
    readHermesModelProviderPreference,
  );

  function setAndSave(v: HermesModelProvider) {
    setBackend(v);
    writeHermesModelProviderPreference(v);
  }

  const [updateStatus, setUpdateStatus] = useState<HermesUpdateStatus | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [runtimeReadiness, setRuntimeReadiness] = useState<ManagedAgentRuntimeReadiness | null>(null);
  const runtimeProgress = useManagedRuntimeProgress("hermes");
  const runtimeProgressText = managedRuntimeProgressText(runtimeProgress, copy);

  const refreshUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const s = await hermesCheckUpdate();
      setUpdateStatus(s);
    } catch {
      setUpdateStatus(null);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    if (installed) void refreshUpdate();
    else setUpdateStatus(null);
  }, [installed, refreshUpdate]);

  async function runUpdate() {
    setUpdating(true);
    setInstallError(null);
    try {
      await hermesUpdate();
      setRuntimeReadiness(await providerPrepareManagedRuntime("hermes"));
      const next = await hermesCheckUpdate();
      setUpdateStatus(next);
      onInstalled();
    } catch (error) {
      setInstallError(String(error));
    } finally {
      setUpdating(false);
    }
  }

  async function runInstall() {
    setInstalling(true);
    setInstallError(null);
    try {
      const readiness = await providerPrepareManagedRuntime("hermes");
      if (!readiness.ready) {
        throw new Error("Atelier could not verify the isolated Hermes runtime.");
      }
      setRuntimeReadiness(readiness);
      onInstalled();
      await refreshUpdate();
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(false);
    }
  }

  const selected = HERMES_BACKENDS.find((b) => b.value === backend) || HERMES_BACKENDS[0];
  const credStatus = statuses[selected.credentialProvider];
  const credConnected = !!credStatus && (credStatus.oauth_logged_in || credStatus.api_key_present);

  return (
    <div
      className={cls(
        "rounded-lg border p-4",
        dark ? "border-dline bg-dpanel" : "border-line bg-panel",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[14px]">{copy.hermesTitle}</span>
            <StatusDot
              tone={installed ? "ok" : "info"}
              label={installed ? copy.statusCliReady : copy.statusAutoPrepare}
              dark={dark}
            />
          </div>
          <p className={cls("text-[12.5px] leading-relaxed mt-1", dark ? "text-dsub" : "text-sub")}>
            {copy.hermesDesc}
          </p>
        </div>
      </div>

      <div
        className={cls(
          "mt-3 rounded-md border px-3 py-2.5 flex items-center gap-2 flex-wrap",
          dark ? "border-dline bg-dbg" : "border-line bg-cream",
        )}
      >
        <div className="flex-1 min-w-[220px]">
          <div className={cls("text-[11.5px] uppercase tracking-wider font-semibold", dark ? "text-dsub" : "text-sub")}>
            {copy.hermesCliLabel}
          </div>
          <div className={cls("text-[11.5px] mt-0.5", dark ? "text-dsub" : "text-sub")}>
            {installed ? copy.hermesCliReady : `${copy.hermesNotInstalled} ${copy.installPrompt}`}
          </div>
          {runtimeProgressText && (
            <div
              data-testid="hermes-runtime-progress"
              data-runtime-state={runtimeProgress?.state}
              className={cls(
                "text-[11.5px] mt-1 font-medium",
                runtimeProgress?.state === "failed" ? "text-red-500" : dark ? "text-dink" : "text-ink",
              )}
            >
              {runtimeProgressText}
            </div>
          )}
        </div>
        <button
          onClick={() => void runInstall()}
          disabled={installing}
          className={cls(
            "text-[12.5px] h-8 px-3 rounded-md border font-medium transition-colors",
            "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/40 hover:bg-[var(--accent)]/20",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          {installing ? copy.installing : installed ? copy.hermesCliReinstall : `+ ${copy.hermesCliInstall}`}
        </button>
      </div>

      <RuntimeReadinessEvidence readiness={runtimeReadiness} copy={copy} dark={dark} />

      {installError && (
        <div
          className={cls(
            "mt-3 text-[12px] px-3 py-2 rounded-md border",
            dark ? "border-red-700/40 bg-red-900/20 text-red-300" : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {installError}
        </div>
      )}

      {installed && (
        <div
          className={cls(
            "mt-3 rounded-md border px-3 py-2.5 flex items-center gap-2 flex-wrap",
            updateStatus?.update_available
              ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
              : dark
              ? "border-dline bg-dbg"
              : "border-line bg-cream",
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cls("text-[11.5px] uppercase tracking-wider font-semibold", dark ? "text-dsub" : "text-sub")}>
                {copy.hermesUpdateLabel}
              </span>
              {checkingUpdate ? (
                <span className={cls("text-[12px]", dark ? "text-dsub" : "text-sub")}>
                  {copy.hermesUpdateChecking}
                </span>
              ) : updateStatus?.update_available ? (
                <span className="text-[12px] font-medium" style={{ color: "#c2742b" }}>
                  {typeof updateStatus.commits_behind === "number"
                    ? copy.hermesUpdateAvailable(updateStatus.commits_behind)
                    : copy.hermesUpdateAvailableNoCount}
                </span>
              ) : updateStatus ? (
                <span className="text-[12px] font-medium" style={{ color: "#2f7d5b" }}>
                  ✓ {copy.hermesUpdateLatest}
                </span>
              ) : null}
            </div>
            {updateStatus?.current_version && (
              <div className={cls("text-[11px] gb-mono mt-0.5", dark ? "text-dsub" : "text-sub")}>
                {copy.hermesVersionPrefix}: {updateStatus.current_version}
              </div>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            {updateStatus?.update_available && (
              <button
                onClick={() => void runUpdate()}
                disabled={updating || checkingUpdate}
                className={cls(
                  "text-[12.5px] h-8 px-3 rounded-md border font-medium transition-colors",
                  "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/40 hover:bg-[var(--accent)]/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {updating ? copy.hermesUpdating : copy.hermesUpdateButton}
              </button>
            )}
            <button
              onClick={() => void refreshUpdate()}
              disabled={checkingUpdate || updating}
              className={cls(
                "text-[12px] h-8 px-2.5 rounded-md border transition-colors disabled:opacity-50",
                dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
              )}
              title={copy.hermesRecheck}
              aria-label={copy.hermesRecheck}
            >
              ↻
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className={cls("text-[11.5px] uppercase tracking-wider font-semibold mb-2", dark ? "text-dsub" : "text-sub")}>
          {copy.hermesBackendLabel}
        </div>
        <div className={cls("text-[11.5px] -mt-1 mb-2", dark ? "text-dsub" : "text-sub")}>
          {copy.modelProviderDefaultHelp}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {HERMES_BACKENDS.map((b) => {
            const s = statuses[b.credentialProvider];
            const ok = !!s && (s.oauth_logged_in || s.api_key_present);
            const active = b.value === backend;
            return (
              <button
                key={b.value}
                onClick={() => setAndSave(b.value)}
                data-testid="hermes-default-model-provider"
                data-model-provider={b.value}
                data-selected={active ? "true" : "false"}
                aria-pressed={active}
                className={cls(
                  "text-left px-3 py-2 rounded-md border transition-colors",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : dark
                    ? "border-dline hover:border-[var(--accent-hover)] bg-dbg"
                    : "border-line hover:border-[var(--accent-hover)] bg-cream",
                )}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[12.5px] font-medium">{b.label}</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: ok ? "#2f7d5b" : "#94a3b8" }}
                    aria-label={ok ? copy.statusOk : copy.statusNoKey}
                  />
                </div>
                <div className={cls("text-[10.5px]", dark ? "text-dsub" : "text-sub")}>{b.desc[lang]}</div>
              </button>
            );
          })}
        </div>
        {!credConnected && (
          <div className={cls("text-[11.5px] mt-2", dark ? "text-dsub" : "text-sub")}>
            {copy.hermesNeedCred(selected.label)}
          </div>
        )}
      </div>
    </div>
  );
};

const GajecodeCard: React.FC<{
  tw: Tweaks;
  statuses: Record<ProviderId, ProviderStatus | null>;
  status: ProviderStatus | null;
  onUpdated: () => void;
}> = ({ tw, statuses, status, onUpdated }) => {
  const dark = tw.dark;
  const lang = tw.language;
  const copy = COPY[tw.language];
  const installed = status?.cli_installed ?? false;
  const [backend, setBackend] = useState<GajaeModelProvider>(
    readGajaeModelProviderPreference,
  );
  const selectedBackend = GAJECODE_BACKENDS.find((candidate) => candidate.value === backend) ?? GAJECODE_BACKENDS[0];
  const selectedCredentialStatus = statuses[selectedBackend.credentialProvider];
  const credConnected = gajecodeCredentialReady(selectedBackend.value, selectedCredentialStatus);

  function setAndSave(v: GajaeModelProvider) {
    setBackend(v);
    writeGajaeModelProviderPreference(v);
  }
  const [updateStatus, setUpdateStatus] = useState<GajecodeUpdateStatus | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const [preparationNotice, setPreparationNotice] = useState<string | null>(null);
  const [runtimeReadiness, setRuntimeReadiness] = useState<ManagedAgentRuntimeReadiness | null>(null);
  const runtimeProgress = useManagedRuntimeProgress("gajecode");
  const runtimeProgressText = managedRuntimeProgressText(runtimeProgress, copy);

  const refreshUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const next = await gajecodeCheckUpdate();
      setUpdateStatus(next);
    } catch {
      setUpdateStatus(null);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    if (installed) void refreshUpdate();
    else setUpdateStatus(null);
  }, [installed, refreshUpdate]);

  async function runUpdate() {
    setUpdating(true);
    setPreparationError(null);
    try {
      await gajecodeUpdate();
      setRuntimeReadiness(await providerPrepareManagedRuntime("gajecode"));
      onUpdated();
      const started = Date.now();
      while (Date.now() - started < 5 * 60 * 1000) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const next = await gajecodeCheckUpdate().catch(() => null);
        if (next) {
          setUpdateStatus(next);
          if (!next.update_available) break;
        }
      }
    } catch (error) {
      setPreparationError(String(error));
    } finally {
      setUpdating(false);
    }
  }

  async function runPrepareOrRepair() {
    setPreparing(true);
    setPreparationError(null);
    setPreparationNotice(null);
    try {
      const readiness = await providerPrepareManagedRuntime("gajecode");
      if (!readiness.ready) {
        throw new Error("Atelier completed preparation but could not verify the isolated gjc runtime.");
      }
      setRuntimeReadiness(readiness);
      setPreparationNotice(copy.gajecodePrepared);
      onUpdated();
      await refreshUpdate();
    } catch (error) {
      setPreparationError(String(error));
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div
      className={cls(
        "rounded-lg border p-4",
        dark ? "border-dline bg-dpanel" : "border-line bg-panel",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[14px]">{copy.gajecodeTitle}</span>
            <StatusDot
              tone={installed ? "ok" : "info"}
              label={installed ? copy.statusCliReady : copy.statusAutoPrepare}
              dark={dark}
            />
          </div>
          <p className={cls("text-[12.5px] leading-relaxed mt-1", dark ? "text-dsub" : "text-sub")}>
            {copy.gajecodeDesc}
          </p>
        </div>
      </div>

      <div
        className={cls(
          "mt-3 rounded-md border px-3 py-2.5 flex items-center gap-2 flex-wrap",
          dark ? "border-dline bg-dbg" : "border-line bg-cream",
        )}
      >
        <div className="flex-1 min-w-[220px]">
          <div className={cls("text-[11.5px] uppercase tracking-wider font-semibold", dark ? "text-dsub" : "text-sub")}>
            {copy.gajecodeExecutionLabel}
          </div>
          <div className={cls("text-[11.5px] mt-0.5", dark ? "text-dsub" : "text-sub")}>
            {installed ? copy.gajecodeInstallIsolation : copy.gajecodeNotInstalled}
          </div>
          {runtimeProgressText && (
            <div
              data-testid="gajecode-runtime-progress"
              data-runtime-state={runtimeProgress?.state}
              className={cls(
                "text-[11.5px] mt-1 font-medium",
                runtimeProgress?.state === "failed" ? "text-red-500" : dark ? "text-dink" : "text-ink",
              )}
            >
              {runtimeProgressText}
            </div>
          )}
          {updateStatus?.current_version && (
            <div className={cls("text-[11px] gb-mono mt-1", dark ? "text-dsub" : "text-sub")}>
              {copy.gajecodeVersionPrefix}: {updateStatus.current_version}
              {updateStatus.latest_version ? ` → ${updateStatus.latest_version}` : ""}
            </div>
          )}
          {updateStatus?.message && (
            <div className={cls("text-[11px] mt-1", dark ? "text-dsub" : "text-sub")}>
              {updateStatus.message}
            </div>
          )}
        </div>
        <button
          type="button"
          data-testid="gajecode-install-repair"
          onClick={() => void runPrepareOrRepair()}
          disabled={preparing || updating}
          className={cls(
            "shrink-0 text-[12.5px] h-8 px-3 rounded-md border font-medium transition-colors",
            "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/40 hover:bg-[var(--accent)]/20",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {preparing ? copy.gajecodePreparing : installed ? copy.gajecodeRepair : `+ ${copy.gajecodePrepare}`}
        </button>
      </div>

      <div
        data-testid="gajecode-isolated-skills"
        className={cls(
          "mt-2 rounded-md border px-3 py-2.5",
          dark ? "border-dline bg-dbg" : "border-line bg-cream",
        )}
      >
        <div className={cls("text-[11.5px] uppercase tracking-wider font-semibold", dark ? "text-dsub" : "text-sub")}>
          {copy.gajecodeSkillsLabel}
        </div>
        <div className={cls("text-[11.5px] mt-0.5", dark ? "text-dsub" : "text-sub")}>
          {copy.gajecodeSkillsReady}
        </div>
      </div>

      <div className="mt-3">
        <div className={cls("text-[11.5px] uppercase tracking-wider font-semibold mb-2", dark ? "text-dsub" : "text-sub")}>
          {copy.gajecodeBackendLabel}
        </div>
        <div className={cls("text-[11.5px] -mt-1 mb-2", dark ? "text-dsub" : "text-sub")}>
          {copy.modelProviderDefaultHelp}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {GAJECODE_BACKENDS.map((b) => {
            const s = statuses[b.credentialProvider];
            const ok = gajecodeCredentialReady(b.value, s);
            const active = b.value === backend;
            return (
              <button
                key={b.value}
                onClick={() => setAndSave(b.value)}
                data-testid="gajecode-default-model-provider"
                data-model-provider={b.value}
                data-selected={active ? "true" : "false"}
                aria-pressed={active}
                className={cls(
                  "text-left px-3 py-2 rounded-md border transition-colors",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : dark
                    ? "border-dline hover:border-[var(--accent-hover)] bg-dbg"
                    : "border-line hover:border-[var(--accent-hover)] bg-cream",
                )}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[12.5px] font-medium">{b.label}</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: ok ? "#2f7d5b" : "#94a3b8" }}
                    aria-label={ok ? copy.statusOk : copy.statusNoKey}
                  />
                </div>
                <div className={cls("text-[10.5px]", dark ? "text-dsub" : "text-sub")}>{b.desc[lang]}</div>
              </button>
            );
          })}
        </div>
        {!credConnected && (
          <div className={cls("text-[11.5px] mt-2", dark ? "text-dsub" : "text-sub")}>
            {copy.gajecodeNeedCred(selectedBackend.label)}
          </div>
        )}
      </div>

      <RuntimeReadinessEvidence readiness={runtimeReadiness} copy={copy} dark={dark} />

      {preparationNotice && (
        <div className={cls("mt-2 text-[12px] px-3 py-2 rounded-md border", dark ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
          {preparationNotice}
        </div>
      )}

      {preparationError && (
        <div className={cls("mt-2 text-[12px] px-3 py-2 rounded-md border", dark ? "border-red-700/40 bg-red-900/20 text-red-300" : "border-red-200 bg-red-50 text-red-700")}>
          {preparationError}
        </div>
      )}

      {installed && (
        <div className="mt-2 flex items-center justify-end gap-1.5">
          {checkingUpdate ? (
            <span className={cls("text-[12px]", dark ? "text-dsub" : "text-sub")}>
              {copy.gajecodeUpdateChecking}
            </span>
          ) : updateStatus?.update_available ? (
            <button
              onClick={() => void runUpdate()}
              disabled={updating || checkingUpdate || preparing}
              className="text-[12.5px] h-8 px-3 rounded-md border font-medium transition-colors bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/40 hover:bg-[var(--accent)]/20 disabled:opacity-50"
            >
              {updating ? copy.gajecodeUpdating : copy.gajecodeUpdateButton}
            </button>
          ) : updateStatus ? (
            <span className="text-[12px] font-medium" style={{ color: "#2f7d5b" }}>
              ✓ {copy.gajecodeUpdateLatest}
            </span>
          ) : null}
          <button
            onClick={() => void refreshUpdate()}
            disabled={checkingUpdate || updating || preparing}
            className={cls(
              "text-[12px] h-8 px-2.5 rounded-md border transition-colors disabled:opacity-50",
              dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
            )}
            title={copy.gajecodeRecheck}
            aria-label={copy.gajecodeRecheck}
          >
            ↻
          </button>
        </div>
      )}
    </div>
  );
};

const LoginModal: React.FC<{
  provider: ProviderId;
  name: string;
  detected: boolean;
  message: string;
  loginUrl?: string | null;
  diagnostic?: string | null;
  failed?: string | null;
  dark: boolean;
  copy: CopyT;
  onSubmitCode: (code: string) => Promise<void>;
  onClose: () => void;
}> = ({ provider, name, detected, message, loginUrl, diagnostic, failed, dark, copy, onSubmitCode, onClose }) => {
  const [code, setCode] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "submitted">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "url" | "code">("idle");
  const [openError, setOpenError] = useState<string | null>(null);
  const showCodeInput = provider === "claude" && !detected;
  const codexDeviceCode = provider === "codex"
    ? diagnostic?.match(/\b[A-Z0-9]{4,5}-[A-Z0-9]{4,5}\b/)?.[0] || null
    : null;

  async function handleSubmitCode() {
    if (!code.trim() || submitState === "submitting") return;
    setSubmitState("submitting");
    setSubmitError(null);
    try {
      await onSubmitCode(code.trim());
      setSubmitState("submitted");
    } catch (e) {
      setSubmitState("idle");
      setSubmitError(String(e));
    }
  }

  async function handleCopyUrl() {
    if (!loginUrl) return;
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopyState("url");
      window.setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("idle");
    }
  }

  async function handleCopyDeviceCode() {
    if (!codexDeviceCode) return;
    try {
      await navigator.clipboard.writeText(codexDeviceCode);
      setCopyState("code");
      window.setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("idle");
    }
  }

  async function handleOpenUrl() {
    if (!loginUrl) return;
    setOpenError(null);
    const opened = await openExternalUrl(provider, loginUrl);
    if (!opened) setOpenError(copy.loginModalOpenFailed);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="provider-login-modal"
      data-provider={provider}
      data-provider-login-detected={detected ? "true" : "false"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cls(
          "max-w-md w-full rounded-lg border p-6",
          dark ? "bg-dpanel border-dline text-dink" : "bg-cream border-line text-ink",
        )}
      >
        <div className="text-[16px] font-semibold mb-2">{copy.loginModalTitle}</div>
        <div className={cls("text-[13px] mb-4", dark ? "text-dsub" : "text-sub")}>
          {message || copy.loginModalDesc}
        </div>
        {!detected && (
          <div
            className={cls(
              "mb-4 rounded-md border p-3 text-[12px]",
              dark ? "border-dline bg-dbg text-dsub" : "border-line bg-panel text-sub",
            )}
          >
            {loginUrl ? (
              <div className="space-y-2">
                <code
                  className={cls(
                    "block max-h-16 overflow-auto break-all rounded border p-2 gb-mono text-[11.5px]",
                    dark ? "border-dline bg-dpanel text-dink" : "border-line bg-cream text-ink",
                  )}
                >
                  {loginUrl}
                </code>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => void handleOpenUrl()}
                    className="h-8 px-3 rounded-md border bg-[var(--accent)] text-white border-[var(--accent-hover)] text-[12px] font-medium"
                  >
                    {copy.loginModalOpenUrl}
                  </button>
                  <button
                    onClick={() => void handleCopyUrl()}
                    className={cls(
                      "h-8 px-3 rounded-md border text-[12px]",
                      dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
                    )}
                  >
                    {copyState === "url" ? copy.loginModalUrlCopied : copy.loginModalCopyUrl}
                  </button>
                </div>
                {openError && (
                  <div className={cls("text-[11.5px]", dark ? "text-red-300" : "text-red-700")}>
                    {openError}
                  </div>
                )}
              </div>
            ) : (
              <div>{copy.loginModalWaitingUrl}</div>
            )}
          </div>
        )}
        {!detected && codexDeviceCode && (
          <div
            className={cls(
              "mb-4 rounded-md border p-3",
              dark ? "border-dline bg-dbg" : "border-line bg-panel",
            )}
          >
            <div className={cls("mb-2 text-[11.5px] font-semibold", dark ? "text-dsub" : "text-sub") }>
              {copy.loginModalCodeLabel}
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 rounded border border-current/15 px-3 py-2 text-center text-[18px] font-semibold tracking-[0.12em]">
                {codexDeviceCode}
              </code>
              <button
                type="button"
                onClick={() => void handleCopyDeviceCode()}
                className={cls(
                  "h-10 shrink-0 rounded-md border px-3 text-[12px]",
                  dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
                )}
              >
                {copyState === "code" ? copy.loginModalUrlCopied : copy.loginModalCopyUrl}
              </button>
            </div>
          </div>
        )}
        {showCodeInput && (
          <div className="mb-4 space-y-1.5">
            <label className={cls("block text-[11.5px] uppercase tracking-wider font-semibold", dark ? "text-dsub" : "text-sub")}>
              {copy.loginModalCodeLabel}
            </label>
            <div className="flex items-center gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={copy.loginModalCodePlaceholder}
                className={cls(
                  "flex-1 h-9 px-3 rounded-md border text-[12.5px] outline-none gb-mono",
                  dark
                    ? "border-dline bg-dbg text-dink placeholder:text-dsub focus:border-[var(--accent)]"
                    : "border-line bg-panel text-ink placeholder:text-sub focus:border-[var(--accent)]",
                )}
              />
              <button
                onClick={() => void handleSubmitCode()}
                disabled={!code.trim() || submitState === "submitting"}
                className={cls(
                  "h-9 px-3 rounded-md border text-[12.5px] font-medium",
                  "bg-[var(--accent)] text-white border-[var(--accent-hover)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {submitState === "submitting"
                  ? copy.loginModalCodeSubmitting
                  : submitState === "submitted"
                  ? copy.loginModalCodeSubmitted
                  : copy.loginModalCodeSubmit}
              </button>
            </div>
            {submitError && (
              <div className={cls("text-[11.5px]", dark ? "text-red-300" : "text-red-700")}>
                {submitError}
              </div>
            )}
          </div>
        )}
        {!detected && diagnostic && (
          <details className="mb-4">
            <summary className={cls("cursor-pointer text-[12px]", dark ? "text-dsub" : "text-sub")}>
              {copy.loginModalCliOutput}
            </summary>
            <pre
              className={cls(
                "mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-md border p-2 text-[11px] gb-mono",
                dark ? "border-dline bg-dbg text-dsub" : "border-line bg-panel text-sub",
              )}
            >
              {diagnostic}
            </pre>
          </details>
        )}
        <div className="flex items-center gap-3">
          {detected ? (
            <span className="inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: "#2f7d5b" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: "#2f7d5b" }} />
              {copy.loginModalDetected}
            </span>
          ) : failed ? (
            <span className={cls("inline-flex items-center gap-2 text-[13px]", dark ? "text-red-300" : "text-red-700")}>
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {copy.loginModalFailed}
            </span>
          ) : (
            <span className={cls("inline-flex items-center gap-2 text-[13px]", dark ? "text-dsub" : "text-sub")}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
              {name} · {copy.loginModalCheckingNow}
            </span>
          )}
          <button
            onClick={onClose}
            className={cls(
              "ml-auto text-[12px] h-8 px-3 rounded-md border",
              dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
            )}
          >
            {copy.loginModalCancel}
          </button>
        </div>
        {!detected && failed && (
          <div className={cls("mt-3 text-[11.5px] break-words", dark ? "text-red-300" : "text-red-700")}>
            {failed}
          </div>
        )}
      </div>
    </div>
  );
};

const StatusDot: React.FC<{ tone: "ok" | "info" | "warn" | "neutral"; label: string; dark: boolean }> = ({
  tone,
  label,
  dark,
}) => {
  const color =
    tone === "ok"
      ? "#2f7d5b"
      : tone === "info"
      ? "#3f6ea8"
      : tone === "warn"
      ? "#c2742b"
      : "#94a3b8";
  return (
    <span
      className={cls(
        "inline-flex items-center gap-1.5 px-2 h-5 rounded-full text-[11px] font-medium",
        dark ? "bg-dbg" : "bg-cream",
      )}
      style={{ color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
};

export default ConnectionsPanel;
