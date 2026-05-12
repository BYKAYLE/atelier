// 설정 → 연결 패널.
// Microsoft Store 일반 사용자가 본인 구독(Claude Pro/Max, ChatGPT Plus/Pro) 또는 API 키를
// Atelier 안에서 한 번에 연결한다.
// 키 자체는 OS keychain (macOS Keychain / Windows Credential Manager) 에만 저장.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cls, Tweaks } from "../lib/tokens";
import {
  ProviderStatus,
  providerClearCredentials,
  providerInstallCli,
  providerLoginOauth,
  providerSaveApiKey,
  providerStatus,
} from "../lib/tauri";

interface Props {
  tw: Tweaks;
}

type ProviderId = "claude" | "codex" | "openrouter" | "hermes";

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
];

type HermesBackend = "openai-codex" | "openrouter" | "anthropic";

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
  {
    value: "anthropic",
    label: "Claude API",
    credentialProvider: "claude",
    desc: { ko: "위 Claude API 키 사용", en: "Uses the Claude API key above" },
  },
];

const HERMES_PREF_KEY = "atelier.hermes.backend";

const COPY = {
  ko: {
    title: "연결",
    sub: "사용하실 모델의 구독 또는 API 키를 연결하세요. 키는 OS 보안 저장소(Keychain / Credential Manager)에만 보관됩니다.",
    statusOk: "연결됨",
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
    refresh: "상태 새로고침",
    loginModalTitle: "브라우저에서 로그인 진행",
    loginModalDesc:
      "기본 브라우저가 열려 있습니다. SNS(Google/Apple 등) 로그인을 완료하면 자동으로 감지됩니다.",
    loginModalCheckingNow: "확인 중…",
    loginModalDetected: "로그인 감지! 곧 자동 닫힘.",
    loginModalCancel: "닫기",
    hermesTitle: "Hermes (로컬)",
    hermesDesc:
      "Hermes는 로컬 binary로 동작하고, AI 호출 시 아래 백엔드 중 선택한 자격증명을 그대로 사용합니다.",
    hermesBackendLabel: "기본 백엔드",
    hermesNotInstalled: "Hermes binary가 설치되어 있지 않습니다.",
    hermesNeedCred: (label: string) =>
      `선택된 백엔드(${label})의 자격증명이 없습니다. 위 카드에서 먼저 연결하세요.`,
  },
  en: {
    title: "Connections",
    sub: "Connect a subscription or API key for the providers you want to use. Keys are stored only in the OS secure store (Keychain / Credential Manager).",
    statusOk: "Connected",
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
    refresh: "Refresh status",
    loginModalTitle: "Complete sign-in in your browser",
    loginModalDesc:
      "Your default browser is open. Finish SNS (Google/Apple/etc.) sign-in and Atelier will detect it automatically.",
    loginModalCheckingNow: "Checking…",
    loginModalDetected: "Sign-in detected! Closing shortly.",
    loginModalCancel: "Close",
    hermesTitle: "Hermes (local)",
    hermesDesc:
      "Hermes runs locally and uses one of the credentials below as the inference backend.",
    hermesBackendLabel: "Default backend",
    hermesNotInstalled: "Hermes binary is not installed.",
    hermesNeedCred: (label: string) =>
      `No credential for the selected backend (${label}). Connect it in the card above first.`,
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
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loginModal, setLoginModal] = useState<{
    provider: ProviderId;
    name: string;
    detected: boolean;
  } | null>(null);

  const refresh = useCallback(async (only?: ProviderId) => {
    const targets = only ? [only] : (["claude", "codex", "openrouter", "hermes"] as ProviderId[]);
    for (const pid of targets) {
      try {
        const s = await providerStatus(pid);
        setStatuses((prev) => ({ ...prev, [pid]: s }));
      } catch {
        setStatuses((prev) => ({ ...prev, [pid]: null }));
      }
    }
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

  function startLogin(p: ProviderDef) {
    setBusyId(p.id);
    providerLoginOauth(p.id).catch(() => {});
    setLoginModal({ provider: p.id, name: p.name, detected: false });
    setTimeout(() => setBusyId(null), 800);
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
            onStartLogin={() => startLogin(p)}
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

        <HermesCard tw={tw} statuses={statuses} />
      </div>

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
          name={loginModal.name}
          detected={loginModal.detected}
          dark={dark}
          copy={copy}
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
  onStartLogin: () => void;
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
  const cliInstalled = status?.cli_installed ?? false;
  const oauthLoggedIn = status?.oauth_logged_in ?? false;
  const apiKeyPresent = status?.api_key_present ?? false;
  const connected = oauthLoggedIn || apiKeyPresent;

  const statusLabel = connected
    ? copy.statusOk
    : supportsOauth && !cliInstalled
    ? copy.statusNoCli
    : copy.statusNoKey;
  const statusTone: "ok" | "warn" | "neutral" = connected
    ? "ok"
    : supportsOauth && !cliInstalled
    ? "warn"
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
    setInstalling(true);
    setErrorMsg(null);
    try {
      await providerInstallCli(def.id);
      onInstalled();
      setTimeout(() => setInstalling(false), 4000);
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

      {supportsOauth && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onStartLogin}
              disabled={busy || !cliInstalled}
              className={cls(
                "text-[12.5px] h-8 px-3 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                "bg-[var(--accent)] text-white border-[var(--accent-hover)] hover:opacity-90",
              )}
            >
              {def.oauthCta[lang]}
            </button>
            {!cliInstalled && (
              <button
                onClick={() => void handleAutoInstall()}
                disabled={installing}
                className={cls(
                  "text-[12px] h-8 px-3 rounded-md border",
                  dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
                )}
              >
                {installing ? copy.installing : `+ ${copy.installAuto}`}
              </button>
            )}
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
              {def.installHelp[lang]}{" "}
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
}> = ({ tw, statuses }) => {
  const dark = tw.dark;
  const lang = tw.language;
  const copy = COPY[lang];
  const hermes = statuses.hermes;
  const installed = hermes?.cli_installed ?? false;

  const [backend, setBackend] = useState<HermesBackend>(() => {
    const saved = localStorage.getItem(HERMES_PREF_KEY);
    if (saved && HERMES_BACKENDS.some((b) => b.value === saved)) return saved as HermesBackend;
    return "openai-codex";
  });

  function setAndSave(v: HermesBackend) {
    setBackend(v);
    localStorage.setItem(HERMES_PREF_KEY, v);
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
              label={installed ? copy.statusOk : copy.statusNoCli}
              dark={dark}
            />
          </div>
          <p className={cls("text-[12.5px] leading-relaxed mt-1", dark ? "text-dsub" : "text-sub")}>
            {copy.hermesDesc}
          </p>
        </div>
      </div>

      {!installed && (
        <div className={cls("text-[11.5px] mb-2", dark ? "text-dsub" : "text-sub")}>
          {copy.hermesNotInstalled}
        </div>
      )}

      <div className="mt-3">
        <div className={cls("text-[11.5px] uppercase tracking-wider font-semibold mb-2", dark ? "text-dsub" : "text-sub")}>
          {copy.hermesBackendLabel}
        </div>
        <div className="grid grid-cols-3 gap-2">
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

const LoginModal: React.FC<{
  name: string;
  detected: boolean;
  dark: boolean;
  copy: CopyT;
  onClose: () => void;
}> = ({ name, detected, dark, copy, onClose }) => {
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
          {copy.loginModalDesc}
        </div>
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

const StatusDot: React.FC<{ tone: "ok" | "warn" | "neutral"; label: string; dark: boolean }> = ({
  tone,
  label,
  dark,
}) => {
  const color = tone === "ok" ? "#2f7d5b" : tone === "warn" ? "#c2742b" : "#94a3b8";
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
