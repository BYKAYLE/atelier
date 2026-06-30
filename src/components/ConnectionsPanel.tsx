// 설정 → 연결 패널.
// Microsoft Store 일반 사용자가 본인 구독(Claude Pro/Max, ChatGPT Plus/Pro) 또는 API 키를
// Atelier 안에서 한 번에 연결한다.
// 키 자체는 OS keychain (macOS Keychain / Windows Credential Manager) 에만 저장.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cls, Tweaks } from "../lib/tokens";
import { safeLocalStorageGet, safeLocalStorageSet } from "../lib/storage";
import {
  GajecodeUpdateStatus,
  HermesUpdateStatus,
  ProviderLoginOauthResult,
  ProviderStatus,
  gajecodeCheckUpdate,
  gajecodeUpdate,
  hermesCheckUpdate,
  hermesUpdate,
  providerClearCredentials,
  providerInstallCli,
  providerLoginOauth,
  providerSaveApiKey,
  providerStatus,
  providerSubmitOauthCode,
} from "../lib/tauri";

interface Props {
  tw: Tweaks;
}

type ProviderId = "claude" | "codex" | "openrouter" | "hermes" | "gajecode";

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
    id: "gajecode",
    name: "가재코드 (Gajae Code)",
    desc: {
      ko: "Yeachan-Heo/gajae-code 저장소의 gjc CLI를 Atelier 전용 격리 공간에 설치합니다.",
      en: "Install the gjc CLI from Yeachan-Heo/gajae-code into Atelier's isolated provider space.",
    },
    oauthCta: { ko: "", en: "" },
    apiHelp: { ko: "", en: "" },
    installHelp: {
      ko: "가재코드 CLI는 Bun 기반으로 설치되며, 기존 Claude/Codex/Hermes 스킬과 분리된 Atelier 전용 HOME에서 실행됩니다.",
      en: "Gajae Code CLI installs through Bun and runs under an Atelier-only HOME isolated from existing Claude/Codex/Hermes skills.",
    },
    installUrl: "https://github.com/Yeachan-Heo/gajae-code",
  },
];

type HermesBackend = "openai-codex" | "openrouter";

const HERMES_BACKENDS: Array<{
  value: HermesBackend;
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
    value: "openrouter",
    label: "OpenRouter",
    credentialProvider: "openrouter",
    desc: { ko: "위 OpenRouter API 키 사용", en: "Uses the OpenRouter key above" },
  },
];

const HERMES_PREF_KEY = "atelier.hermes.backend";

const COPY = {
  ko: {
    title: "연결",
    sub: "사용하실 모델의 구독 또는 API 키를 연결하세요. 키는 OS 보안 저장소(Keychain / Credential Manager)에만 보관됩니다.",
    statusOk: "연결됨",
    statusCliReady: "CLI 설치됨",
    statusNoCli: "CLI 미설치",
    statusNoKey: "키 미입력",
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
    hermesTitle: "Hermes (로컬)",
    hermesDesc:
      "Hermes는 로컬 binary로 동작하고, AI 호출 시 아래 백엔드 중 선택한 자격증명을 그대로 사용합니다.",
    hermesBackendLabel: "기본 백엔드",
    hermesCliLabel: "Hermes Agent CLI",
    hermesCliReady: "Hermes Agent CLI가 설치되어 있습니다.",
    hermesCliInstall: "Hermes Agent CLI 설치",
    hermesCliReinstall: "다시 설치",
    hermesNotInstalled: "Hermes binary가 설치되어 있지 않습니다.",
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
    gajecodeTitle: "가재코드 격리",
    gajecodeDesc:
      "설치와 실행 모두 Atelier 전용 HOME에서 진행되어 기존 로컬 스킬을 자동으로 사용하지 않습니다.",
    gajecodeUpdateLabel: "업데이트",
    gajecodeUpdateChecking: "확인 중…",
    gajecodeUpdateLatest: "최신 버전",
    gajecodeUpdateAvailable: "업데이트 가능",
    gajecodeUpdating: "업데이트 중…",
    gajecodeUpdateButton: "업데이트",
    gajecodeRecheck: "다시 확인",
    gajecodeVersionPrefix: "버전",
    gajecodeNotInstalled: "가재코드 CLI가 설치되어 있지 않습니다.",
    gajecodeInstallIsolation: "설치 후에도 전용 .gjc 폴더만 사용합니다.",
  },
  en: {
    title: "Connections",
    sub: "Connect a subscription or API key for the providers you want to use. Keys are stored only in the OS secure store (Keychain / Credential Manager).",
    statusOk: "Connected",
    statusCliReady: "CLI installed",
    statusNoCli: "CLI not installed",
    statusNoKey: "No key",
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
    hermesTitle: "Hermes (local)",
    hermesDesc:
      "Hermes runs locally and uses one of the credentials below as the inference backend.",
    hermesBackendLabel: "Default backend",
    hermesCliLabel: "Hermes Agent CLI",
    hermesCliReady: "Hermes Agent CLI is installed.",
    hermesCliInstall: "Install Hermes Agent CLI",
    hermesCliReinstall: "Reinstall",
    hermesNotInstalled: "Hermes binary is not installed.",
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
    gajecodeTitle: "Gajae Code isolation",
    gajecodeDesc:
      "Install and execution run under Atelier's dedicated HOME, so existing local skills are not auto-used.",
    gajecodeUpdateLabel: "Update",
    gajecodeUpdateChecking: "Checking…",
    gajecodeUpdateLatest: "Up to date",
    gajecodeUpdateAvailable: "Update available",
    gajecodeUpdating: "Updating…",
    gajecodeUpdateButton: "Update",
    gajecodeRecheck: "Re-check",
    gajecodeVersionPrefix: "Version",
    gajecodeNotInstalled: "Gajae Code CLI is not installed.",
    gajecodeInstallIsolation: "After install, only the dedicated .gjc folder is used.",
  },
} as const;

type CopyT = typeof COPY[keyof typeof COPY];

export const ConnectionsPanel: React.FC<Props> = ({ tw }) => {
  const dark = tw.dark;
  const lang = tw.language;
  const copy = COPY[lang];
  const [statuses, setStatuses] = useState<Record<ProviderId, ProviderStatus | null>>({
    claude: null,
    codex: null,
    openrouter: null,
    hermes: null,
    gajecode: null,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loginModal, setLoginModal] = useState<{
    provider: ProviderId;
    name: string;
    detected: boolean;
    message: string;
  } | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelNotice, setPanelNotice] = useState<string | null>(null);

  const refresh = useCallback(async (only?: ProviderId) => {
    const targets = only ? [only] : (["claude", "codex", "openrouter", "hermes", "gajecode"] as ProviderId[]);
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
  useEffect(() => {
    if (!loginModal) return;
    const start = Date.now();
    pollRef.current = window.setInterval(async () => {
      const s = await providerStatus(loginModal.provider).catch(() => null);
      if (s) {
        setStatuses((prev) => ({ ...prev, [loginModal.provider]: s }));
        if (s.oauth_logged_in || s.api_key_present) {
          setLoginModal((m) => (m ? { ...m, detected: true } : null));
          setTimeout(() => setLoginModal(null), 1400);
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      }
      if (Date.now() - start > 5 * 60 * 1000) {
        if (pollRef.current) window.clearInterval(pollRef.current);
      }
    }, 1500);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [loginModal]);

  function loginNoticeForResult(p: ProviderDef, result: ProviderLoginOauthResult) {
    if (result.already_logged_in) return copy.loginAlreadyConnected(p.name);
    if (result.browser_opened) return copy.loginStartedBrowser(p.name);
    if (result.login_url_detected) return copy.loginStartedNoBrowser(p.name);
    return copy.loginStartedWatching(p.name);
  }

  async function startLogin(p: ProviderDef, force = false) {
    setBusyId(p.id);
    setPanelError(null);
    setPanelNotice(null);
    try {
      const result = await providerLoginOauth(p.id, force);
      const notice = loginNoticeForResult(p, result);
      setPanelNotice(notice);
      setLoginModal({
        provider: p.id,
        name: p.name,
        detected: result.completed || result.already_logged_in,
        message: notice,
      });
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

  return (
    <div className={cls("space-y-4", dark ? "text-dink" : "text-ink")}>
      <header className="space-y-1.5">
        <h2 className="font-display text-[20px] font-[500]">{copy.title}</h2>
        <p className={cls("text-[13px] leading-relaxed max-w-[640px]", dark ? "text-dsub" : "text-sub")}>
          {copy.sub}
        </p>
      </header>

      <div className="space-y-3">
        {PROVIDERS.map((p) => (
          <ProviderCard
            key={p.id}
            def={p}
            tw={tw}
            status={statuses[p.id]}
            busy={busyId === p.id}
            onStartLogin={(force) => void startLogin(p, force)}
            onSaved={() => void refresh(p.id)}
            onCleared={() => void refresh(p.id)}
            onInstalled={() => {
              setBusyId(p.id);
              setTimeout(() => {
                setBusyId(null);
                void refresh(p.id);
              }, 4000);
            }}
          />
        ))}

        <HermesCard
          tw={tw}
          statuses={statuses}
          onInstalled={() => {
            setTimeout(() => void refresh("hermes"), 1000);
          }}
        />

        <GajecodeCard
          tw={tw}
          status={statuses.gajecode}
          onUpdated={() => {
            setTimeout(() => void refresh("gajecode"), 1000);
          }}
        />
      </div>

      {panelError && (
        <div
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
          className={cls(
            "text-[12px] px-3 py-2 rounded-md border",
            dark ? "border-dline bg-dbg text-dsub" : "border-line bg-cream text-sub",
          )}
        >
          {panelNotice}
        </div>
      )}

      <div className="pt-2">
        <button
          onClick={() => void refresh()}
          className={cls(
            "text-[12px] px-3 h-8 rounded-md border transition-colors",
            dark
              ? "border-dline text-dsub hover:text-dink hover:bg-dpanel"
              : "border-line text-sub hover:text-ink hover:bg-panel",
          )}
        >
          ↻ {copy.refresh}
        </button>
      </div>

      {loginModal && (
        <LoginModal
          provider={loginModal.provider}
          name={loginModal.name}
          detected={loginModal.detected}
          message={loginModal.message}
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
  const shouldForceOauthLogin = def.id === "claude" && oauthLoggedIn;
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
      onInstalled();
      setErrorMsg(copy.installTimeout);
      setInstalling(false);
    } catch (e) {
      setErrorMsg(String(e));
      setInstalling(false);
    }
  }

  return (
    <div
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

  const [backend, setBackend] = useState<HermesBackend>(() => {
    const saved = safeLocalStorageGet(HERMES_PREF_KEY);
    if (saved && HERMES_BACKENDS.some((b) => b.value === saved)) return saved as HermesBackend;
    if (saved) safeLocalStorageSet(HERMES_PREF_KEY, "openai-codex");
    return "openai-codex";
  });

  function setAndSave(v: HermesBackend) {
    setBackend(v);
    safeLocalStorageSet(HERMES_PREF_KEY, v);
  }

  const [updateStatus, setUpdateStatus] = useState<HermesUpdateStatus | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

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
    const versionBefore = updateStatus?.current_version ?? null;
    try {
      await hermesUpdate();
      // hermes update --yes 는 백그라운드(git pull + pip install + 노드 의존성)로
      // 보통 30초~3분. 5초마다 폴링해서 (a) 버전이 바뀌거나 (b) update_available 가
      // false 가 되면 완료로 간주. 5분이 지나도 변화 없으면 타임아웃.
      const start = Date.now();
      const timer = window.setInterval(async () => {
        try {
          const s = await hermesCheckUpdate();
          setUpdateStatus(s);
          const versionChanged = versionBefore && s.current_version && s.current_version !== versionBefore;
          if (!s.update_available || versionChanged) {
            window.clearInterval(timer);
            setUpdating(false);
          }
        } catch {
          // 일시적 실패는 무시 — 다음 tick 에서 재시도
        }
        if (Date.now() - start > 5 * 60 * 1000) {
          window.clearInterval(timer);
          setUpdating(false);
        }
      }, 5000);
    } catch {
      setUpdating(false);
    }
  }

  async function runInstall() {
    if (installed) return;
    setInstalling(true);
    setInstallError(null);
    try {
      await providerInstallCli("hermes");
      const started = Date.now();
      while (Date.now() - started < 5 * 60 * 1000) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const next = await providerStatus("hermes").catch(() => null);
        if (next?.cli_installed) {
          onInstalled();
          setInstalling(false);
          return;
        }
      }
      onInstalled();
      setInstallError(copy.installTimeout);
      setInstalling(false);
    } catch (e) {
      setInstallError(String(e));
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
              tone={installed ? "ok" : "warn"}
              label={installed ? copy.statusCliReady : copy.statusNoCli}
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
        </div>
        <button
          onClick={() => void runInstall()}
          disabled={installing || installed}
          className={cls(
            "text-[12.5px] h-8 px-3 rounded-md border font-medium transition-colors",
            installed
              ? dark
                ? "border-dline bg-dpanel text-dsub"
                : "border-line bg-panel text-sub"
              : "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/40 hover:bg-[var(--accent)]/20",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          {installed ? copy.statusCliReady : installing ? copy.installing : `+ ${copy.hermesCliInstall}`}
        </button>
      </div>

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
        <div className="grid grid-cols-2 gap-2">
          {HERMES_BACKENDS.map((b) => {
            const s = statuses[b.credentialProvider];
            const ok = !!s && (s.oauth_logged_in || s.api_key_present);
            const active = b.value === backend;
            return (
              <button
                key={b.value}
                onClick={() => setAndSave(b.value)}
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
  status: ProviderStatus | null;
  onUpdated: () => void;
}> = ({ tw, status, onUpdated }) => {
  const dark = tw.dark;
  const copy = COPY[tw.language];
  const installed = status?.cli_installed ?? false;
  const [updateStatus, setUpdateStatus] = useState<GajecodeUpdateStatus | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);

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
    try {
      await gajecodeUpdate();
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
    } finally {
      setUpdating(false);
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
              tone={installed ? "ok" : "warn"}
              label={installed ? copy.statusCliReady : copy.statusNoCli}
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
            {copy.gajecodeUpdateLabel}
          </div>
          <div className={cls("text-[11.5px] mt-0.5", dark ? "text-dsub" : "text-sub")}>
            {installed ? copy.gajecodeInstallIsolation : `${copy.gajecodeNotInstalled} ${copy.installPrompt}`}
          </div>
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

        {installed && (
          <div className="shrink-0 flex items-center gap-1.5">
            {checkingUpdate ? (
              <span className={cls("text-[12px]", dark ? "text-dsub" : "text-sub")}>
                {copy.gajecodeUpdateChecking}
              </span>
            ) : updateStatus?.update_available ? (
              <button
                onClick={() => void runUpdate()}
                disabled={updating || checkingUpdate}
                className={cls(
                  "text-[12.5px] h-8 px-3 rounded-md border font-medium transition-colors",
                  "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/40 hover:bg-[var(--accent)]/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
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
              disabled={checkingUpdate || updating}
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
    </div>
  );
};

const LoginModal: React.FC<{
  provider: ProviderId;
  name: string;
  detected: boolean;
  message: string;
  dark: boolean;
  copy: CopyT;
  onSubmitCode: (code: string) => Promise<void>;
  onClose: () => void;
}> = ({ provider, name, detected, message, dark, copy, onSubmitCode, onClose }) => {
  const [code, setCode] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "submitted">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const showCodeInput = provider === "claude" && !detected;

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

  return (
    <div
      role="dialog"
      aria-modal="true"
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
        <div className="flex items-center gap-3">
          {detected ? (
            <span className="inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: "#2f7d5b" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: "#2f7d5b" }} />
              {copy.loginModalDetected}
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
