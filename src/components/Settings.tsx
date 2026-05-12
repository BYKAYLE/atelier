import React, { useState } from "react";
import {
  ACCENTS,
  AppLanguage,
  cls,
  LANGUAGE_LABELS,
  MOD_KEY,
  Profile,
  Tweaks,
  WELCOME_COPY,
} from "../lib/tokens";
import { I } from "./Icons";
import ConnectionsPanel from "./ConnectionsPanel";

interface Props {
  tw: Tweaks;
  setTw: (p: Partial<Tweaks>) => void;
}

const SETTINGS_COPY = {
  ko: {
    title: "설정",
    nav: {
      terminal: "터미널",
      appearance: "외관",
      profiles: "프로필",
      shortcuts: "단축키",
      preview: "미리보기 패널",
      connections: "연결",
      updates: "업데이트",
    },
  },
  en: {
    title: "Settings",
    nav: {
      terminal: "Terminal",
      appearance: "Appearance",
      profiles: "Profiles",
      shortcuts: "Shortcuts",
      preview: "Preview panel",
      connections: "Connections",
      updates: "Updates",
    },
  },
} as const;

const Settings: React.FC<Props> = ({ tw, setTw }) => {
  const dark = tw.dark;
  const [section, setSection] = useState<string>("appearance");
  const copy = SETTINGS_COPY[tw.language];

  const nav: Array<[string, string, React.ReactNode]> = [
    ["terminal", copy.nav.terminal, I.terminal],
    ["appearance", copy.nav.appearance, I.palette],
    ["profiles", copy.nav.profiles, I.zap],
    ["shortcuts", copy.nav.shortcuts, I.keyboard],
    ["preview", copy.nav.preview, I.eye],
    ["connections", copy.nav.connections, I.zap],
    ["updates", copy.nav.updates, I.gear],
  ];

  return (
    <div
      className={cls(
        "h-full w-full flex fade-in",
        dark ? "bg-dbg" : "bg-cream",
      )}
    >
      <aside
        className={cls(
          "w-[240px] shrink-0 h-full border-r px-3 pt-6",
          dark ? "border-dline" : "border-line",
        )}
      >
        <div
          className={cls(
            "px-2 mb-4 font-display text-[20px] font-[500]",
            dark ? "text-dink" : "text-ink",
          )}
        >
          {copy.title}
        </div>
        <nav className="space-y-0.5">
          {nav.map(([k, label, icon]) => (
            <button
              key={k}
              onClick={() => setSection(k)}
              className={cls(
                "w-full h-9 px-2.5 rounded-[7px] text-left text-[13px] flex items-center gap-2.5 transition-colors",
                section === k
                  ? dark
                    ? "bg-dmuted text-dink"
                    : "bg-surface text-ink shadow-[0_0_0_1px_#e5e3db]"
                  : dark
                    ? "text-dsub hover:text-dink"
                    : "text-sub hover:text-ink",
              )}
            >
              <span className="[&>svg]:w-[14px] [&>svg]:h-[14px]">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-[720px] px-10 pt-10 pb-16">
          {section === "terminal" && <TerminalSection tw={tw} setTw={setTw} />}
          {section === "appearance" && <AppearanceSection tw={tw} setTw={setTw} />}
          {section === "profiles" && <ProfilesSection tw={tw} setTw={setTw} />}
          {section === "shortcuts" && <ShortcutsSection dark={dark} language={tw.language} />}
          {section === "preview" && <PreviewSection dark={dark} language={tw.language} />}
          {section === "connections" && <ConnectionsPanel tw={tw} />}
          {section === "updates" && <UpdatesSection dark={dark} language={tw.language} />}
        </div>
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ dark: boolean; title: string; sub: string }> = ({
  dark,
  title,
  sub,
}) => (
  <div className="mb-8">
    <div
      className={cls(
        "font-display text-[32px] font-[500] tracking-[-0.02em] leading-[1.12] mb-2",
        dark ? "text-dink" : "text-ink",
      )}
    >
      {title}
    </div>
    <div className={cls("text-[14px]", dark ? "text-dsub" : "text-sub")}>{sub}</div>
  </div>
);

const Row: React.FC<{
  dark: boolean;
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ dark, label, hint, children }) => (
  <div
    className={cls(
      "py-5 border-b flex items-start gap-6",
      dark ? "border-dline" : "border-line",
    )}
  >
    <div className="flex-1 min-w-0 pt-1">
      <div className={cls("text-[13.5px] font-medium", dark ? "text-dink" : "text-ink")}>
        {label}
      </div>
      {hint && (
        <div
          className={cls(
            "mt-0.5 text-[12px] leading-[1.5] max-w-[360px]",
            dark ? "text-dsub" : "text-sub",
          )}
        >
          {hint}
        </div>
      )}
    </div>
    <div className="shrink-0 flex items-center gap-2">{children}</div>
  </div>
);

const SegControl: React.FC<{
  dark: boolean;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}> = ({ dark, value, onChange, options }) => (
  <div
    className={cls(
      "inline-flex p-0.5 rounded-[8px] border text-[12px] font-medium",
      dark ? "bg-dmuted border-dline" : "bg-muted border-line",
    )}
  >
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={cls(
          "h-7 px-3 rounded-[6px] transition-colors",
          value === o.value
            ? dark
              ? "bg-dsurf text-dink"
              : "bg-surface text-ink shadow-[0_0_0_1px_#e5e3db]"
            : dark
              ? "text-dsub hover:text-dink"
              : "text-sub hover:text-ink",
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const TerminalSection: React.FC<{ tw: Tweaks; setTw: (p: Partial<Tweaks>) => void }> = ({
  tw,
  setTw,
}) => {
  const dark = tw.dark;
  const copy = tw.language === "en"
    ? {
        title: "Terminal",
        sub: "Adjust how the terminal reads and feels.",
        fontSize: "Font size",
        fontHint: "Affects line height proportionally.",
        cursor: "Cursor style",
        cursorOptions: { block: "Block", bar: "Bar", underline: "Underline" },
      }
    : {
        title: "터미널",
        sub: "터미널의 읽힘과 느낌을 조정합니다.",
        fontSize: "글꼴 크기",
        fontHint: "줄 높이에 비례해 영향을 줍니다.",
        cursor: "커서 스타일",
        cursorOptions: { block: "블록", bar: "바", underline: "밑줄" },
      };
  return (
    <>
      <SectionHeader dark={dark} title={copy.title} sub={copy.sub} />
      <Row dark={dark} label={copy.fontSize} hint={copy.fontHint}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={11}
            max={20}
            step={1}
            value={tw.terminalFontPx}
            onChange={(e) => setTw({ terminalFontPx: +e.target.value })}
            className="w-[160px]"
            style={{ accentColor: "var(--accent)" }}
          />
          <span
            className={cls(
              "font-mono text-[12px] w-[36px] text-right",
              dark ? "text-dink" : "text-ink",
            )}
          >
            {tw.terminalFontPx}px
          </span>
        </div>
      </Row>
      <Row dark={dark} label={copy.cursor}>
        <SegControl
          dark={dark}
          value={tw.cursorStyle}
          onChange={(v) => setTw({ cursorStyle: v as Tweaks["cursorStyle"] })}
          options={[
            { value: "block", label: copy.cursorOptions.block },
            { value: "bar", label: copy.cursorOptions.bar },
            { value: "underline", label: copy.cursorOptions.underline },
          ]}
        />
      </Row>
    </>
  );
};

const AppearanceSection: React.FC<{ tw: Tweaks; setTw: (p: Partial<Tweaks>) => void }> = ({
  tw,
  setTw,
}) => {
  const dark = tw.dark;
  const copy = tw.language === "en"
    ? {
        title: "Appearance",
        sub: "Set the theme, accent color, and app language.",
        language: "App language",
        languageHint: "Changes the main interface language. Custom home copy is preserved.",
        theme: "Theme",
        themeHint: "Light is the default. Dark uses a warm tone instead of pure black.",
        light: "Light",
        dark: "Dark",
        accent: "Accent color",
        accentHint: "Applies to buttons, prompts, links, and the cursor.",
        headline: "Home headline",
        headlineHint: "Edit the serif headline on the home screen.",
      }
    : {
        title: "외관",
        sub: "테마, 액센트 색상, 사용 언어를 설정합니다.",
        language: "사용 언어",
        languageHint: "주요 화면 언어를 바꿉니다. 직접 편집한 홈 문구는 유지됩니다.",
        theme: "테마",
        themeHint: "기본은 라이트입니다. 다크는 순수 블랙보다 따뜻한 톤이에요.",
        light: "라이트",
        dark: "다크",
        accent: "액센트 색상",
        accentHint: "버튼, 프롬프트, 링크, 커서에 적용됩니다.",
        headline: "홈 헤드라인",
        headlineHint: "홈 화면의 세리프 헤드라인을 편집합니다.",
      };
  const updateLanguage = (language: AppLanguage) => {
    const defaultHeadlines = Object.values(WELCOME_COPY).map((v) => v.headline);
    const defaultSubs = Object.values(WELCOME_COPY).map((v) => v.sub);
    setTw({
      language,
      ...(defaultHeadlines.includes(tw.welcomeHeadline)
        ? { welcomeHeadline: WELCOME_COPY[language].headline }
        : {}),
      ...(defaultSubs.includes(tw.welcomeSub)
        ? { welcomeSub: WELCOME_COPY[language].sub }
        : {}),
    });
  };
  return (
    <>
      <SectionHeader dark={dark} title={copy.title} sub={copy.sub} />
      <Row dark={dark} label={copy.language} hint={copy.languageHint}>
        <SegControl
          dark={dark}
          value={tw.language}
          onChange={(v) => updateLanguage(v as AppLanguage)}
          options={[
            { value: "ko", label: LANGUAGE_LABELS.ko },
            { value: "en", label: LANGUAGE_LABELS.en },
          ]}
        />
      </Row>
      <Row dark={dark} label={copy.theme} hint={copy.themeHint}>
        <SegControl
          dark={dark}
          value={tw.dark ? "dark" : "light"}
          onChange={(v) => setTw({ dark: v === "dark" })}
          options={[
            { value: "light", label: copy.light },
            { value: "dark", label: copy.dark },
          ]}
        />
      </Row>
      <Row dark={dark} label={copy.accent} hint={copy.accentHint}>
        <div className="flex items-center gap-2">
          {Object.entries(ACCENTS).map(([key, a]) => (
            <button
              key={key}
              onClick={() => setTw({ accent: key })}
              className={cls(
                "h-7 w-7 rounded-full transition-all",
                tw.accent === key ? "ring-2 ring-offset-2" : "",
              )}
              style={{
                background: dark ? a.dark : a.light,
                ["--tw-ring-color" as any]: dark ? a.dark : a.light,
                ["--tw-ring-offset-color" as any]: dark ? "#1f1f1d" : "#faf9f5",
              }}
              title={key}
            />
          ))}
        </div>
      </Row>
      <Row dark={dark} label={copy.headline} hint={copy.headlineHint}>
        <input
          value={tw.welcomeHeadline}
          onChange={(e) => setTw({ welcomeHeadline: e.target.value })}
          className={cls(
            "h-8 px-2.5 rounded-[7px] border text-[13px] w-[320px] outline-none",
            dark
              ? "bg-dmuted border-dline text-dink"
              : "bg-surface border-line text-ink",
          )}
        />
      </Row>
    </>
  );
};

const DEFAULT_DOTS = ["#c96442", "#9aae63", "#4b7bd1", "#8b4a73", "#6b9a4a", "#b08a4a", "#3d8d87"];

const ProfilesSection: React.FC<{ tw: Tweaks; setTw: (p: Partial<Tweaks>) => void }> = ({
  tw,
  setTw,
}) => {
  const dark = tw.dark;
  const profiles = tw.profiles;
  const copy = tw.language === "en"
    ? {
        title: "Profiles",
        sub: "Register the CLIs you use often. Add with + and remove with x.",
        removeFallback: "this profile",
        removeConfirm: (label: string) =>
          `Delete "${label}" profile?\nTabs opened with this profile stay open, but you cannot create new ones until it is registered again.`,
        colorDot: "Color dot",
        name: "Name",
        command: "Command (e.g. claude, python3)",
        minOne: "At least one is required",
        remove: "Remove",
        add: "+ Add profile",
        newProfile: "New profile",
      }
    : {
        title: "프로필",
        sub: "자주 쓰는 CLI를 등록하세요. + 버튼으로 추가, ✕ 버튼으로 삭제할 수 있습니다.",
        removeFallback: "이 프로필",
        removeConfirm: (label: string) =>
          `"${label}" 프로필을 삭제하시겠습니까?\n이 프로필로 열려 있는 탭은 유지되지만, 재등록 전까지 새로 열 수 없습니다.`,
        colorDot: "색 도트",
        name: "이름",
        command: "실행 명령 (예: claude, python3)",
        minOne: "최소 1개 필요",
        remove: "삭제",
        add: "+ 프로필 추가",
        newProfile: "새 프로필",
      };

  const updateProfile = (idx: number, patch: Partial<Profile>) => {
    const next = profiles.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    setTw({ profiles: next });
  };
  const removeProfile = (idx: number) => {
    if (profiles.length <= 1) return;
    const target = profiles[idx];
    const label = target?.name?.trim() || copy.removeFallback;
    const ok = window.confirm(copy.removeConfirm(label));
    if (!ok) return;
    setTw({ profiles: profiles.filter((_, i) => i !== idx) });
  };
  const addProfile = () => {
    const dot = DEFAULT_DOTS[profiles.length % DEFAULT_DOTS.length];
    const id = `custom-${Date.now().toString(36)}`;
    setTw({ profiles: [...profiles, { id, name: copy.newProfile, cmd: "", dot }] });
  };

  return (
    <>
      <SectionHeader
        dark={dark}
        title={copy.title}
        sub={copy.sub}
      />
      <div
        className={cls(
          "rounded-[10px] border overflow-hidden",
          dark ? "bg-[#252523] border-dline" : "bg-surface border-line",
        )}
      >
        {profiles.map((p, i) => (
          <div
            key={p.id}
            className={cls(
              "flex items-center gap-3 px-4 h-14",
              i > 0 ? (dark ? "border-t border-dline" : "border-t border-line") : "",
            )}
          >
            <input
              type="color"
              value={p.dot}
              onChange={(e) => updateProfile(i, { dot: e.target.value })}
              className="h-6 w-6 rounded-full shrink-0 cursor-pointer border-0 p-0 bg-transparent"
              title={copy.colorDot}
              style={{ appearance: "none" }}
            />
            <input
              value={p.name}
              onChange={(e) => updateProfile(i, { name: e.target.value })}
              placeholder={copy.name}
              className={cls(
                "h-8 px-2.5 rounded-[6px] border text-[13px] w-[180px] outline-none",
                dark
                  ? "bg-dmuted border-dline text-dink"
                  : "bg-surface border-line text-ink",
              )}
            />
            <input
              value={p.cmd}
              onChange={(e) => updateProfile(i, { cmd: e.target.value })}
              placeholder={copy.command}
              className={cls(
                "flex-1 min-w-0 h-8 px-2.5 rounded-[6px] border font-mono text-[12px] outline-none",
                dark
                  ? "bg-dmuted border-dline text-dink"
                  : "bg-surface border-line text-ink",
              )}
            />
            <button
              type="button"
              onClick={() => removeProfile(i)}
              disabled={profiles.length <= 1}
              className={cls(
                "shrink-0 h-7 w-7 rounded-[6px] text-[13px] transition-colors",
                profiles.length <= 1
                  ? "opacity-30 cursor-not-allowed"
                  : dark
                    ? "text-dsub hover:bg-[#3d3d3b] hover:text-dink"
                    : "text-sub hover:bg-line hover:text-ink",
              )}
              title={profiles.length <= 1 ? copy.minOne : copy.remove}
            >
              ✕
            </button>
          </div>
        ))}
        <div className={cls("px-4 h-12 flex items-center", dark ? "border-t border-dline" : "border-t border-line")}>
          <button
            type="button"
            onClick={addProfile}
            className={cls(
              "h-8 px-3 rounded-[6px] text-[12.5px] font-medium transition-colors",
              dark ? "text-dsub hover:bg-dmuted hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
            )}
          >
            {copy.add}
          </button>
        </div>
      </div>
    </>
  );
};

const ShortcutsSection: React.FC<{ dark: boolean; language: AppLanguage }> = ({ dark, language }) => {
  const copy = language === "en"
    ? {
        title: "Shortcuts",
        sub: "Keyboard shortcuts available in the code screen.",
        shortcuts: [
          "New tab",
          "Close tab",
          "Next / previous tab",
          "Paste image",
          "Toggle preview",
          "Clear screen",
          "Profile picker",
        ],
      }
    : {
        title: "단축키",
        sub: "코드 화면에서 바로 사용할 수 있는 단축키입니다.",
        shortcuts: [
          "새 탭",
          "탭 닫기",
          "다음 / 이전 탭",
          "이미지 붙여넣기",
          "미리보기 토글",
          "화면 지우기",
          "프로필 선택",
        ],
      };
  const shortcuts: Array<[string, string[]]> = [
    [copy.shortcuts[0], [MOD_KEY, "T"]],
    [copy.shortcuts[1], [MOD_KEY, "W"]],
    [copy.shortcuts[2], ["Ctrl", "Tab"]],
    [copy.shortcuts[3], [MOD_KEY, "V"]],
    [copy.shortcuts[4], [MOD_KEY, "P"]],
    [copy.shortcuts[5], [MOD_KEY, "K"]],
    [copy.shortcuts[6], [MOD_KEY, "Shift", "P"]],
  ];
  return (
    <>
      <SectionHeader
        dark={dark}
        title={copy.title}
        sub={copy.sub}
      />
      <div
        className={cls(
          "rounded-[10px] border overflow-hidden",
          dark ? "bg-[#252523] border-dline" : "bg-surface border-line",
        )}
      >
        {shortcuts.map(([label, keys], i) => (
          <div
            key={label}
            className={cls(
              "flex items-center px-4 h-12 cursor-pointer transition-colors",
              i > 0 ? (dark ? "border-t border-dline" : "border-t border-line") : "",
              dark ? "hover:bg-dmuted" : "hover:bg-muted",
            )}
          >
            <div
              className={cls(
                "flex-1 text-[13.5px]",
                dark ? "text-dink" : "text-ink",
              )}
            >
              {label}
            </div>
            <div className="flex items-center gap-1">
              {keys.map((k, j) => (
                <kbd
                  key={j}
                  className={cls(
                    "px-1.5 min-w-[22px] h-[22px] inline-flex items-center justify-center rounded-[5px] border font-mono text-[11px]",
                    dark
                      ? "bg-dmuted border-dline text-dink"
                      : "bg-muted border-line text-ink",
                  )}
                >
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

const PreviewSection: React.FC<{ dark: boolean; language: AppLanguage }> = ({ dark, language }) => {
  const copy = language === "en"
    ? {
        title: "Preview panel",
        sub: "Choose when Atelier should show live output.",
        detect: "Auto-detect output",
        detectHint: "Automatically opens the preview when a session writes HTML, Markdown, or image files.",
        planned: "(planned — v0.2)",
      }
    : {
        title: "미리보기 패널",
        sub: "Atelier가 언제 라이브 결과물을 보여줄지 설정합니다.",
        detect: "결과물 자동 감지",
        detectHint: "세션이 HTML, 마크다운, 이미지 파일을 쓰면 미리보기를 자동으로 엽니다.",
        planned: "(예정 — v0.2)",
      };
  return (
    <>
      <SectionHeader dark={dark} title={copy.title} sub={copy.sub} />
      <Row dark={dark} label={copy.detect} hint={copy.detectHint}>
        <div className={cls("text-[12px]", dark ? "text-dsub" : "text-sub")}>
          {copy.planned}
        </div>
      </Row>
    </>
  );
};

/**
 * UpdatesSection — Tauri auto-update plugin 기반.
 * GitHub Release latest.json을 폴링해 새 버전이 있으면 changelog와 함께 표시.
 * 사용자 동의 시 다운로드 → ED25519 서명 검증 → 자동 재시작.
 */
const UpdatesSection: React.FC<{ dark: boolean; language: AppLanguage }> = ({
  dark,
  language,
}) => {
  const copy = language === "en"
    ? {
        title: "Updates",
        sub: "Check for and install new Atelier versions. Updates are verified with an ED25519 signature.",
        currentVersion: "Current version",
        currentVersionHint: "Version embedded in the app bundle metadata (tauri.conf.json).",
        check: "Check for updates",
        checkHint: "Polls latest.json from the public Atelier release channel. Internet access is required.",
        checking: "Checking...",
        checkNow: "Check now",
        checkingStatus: "Checking for the latest version...",
        availableStatus: (version: string) => `v${version} available`,
        upToDate: "You are up to date.",
        checkFailed: (message: string) => `Check failed: ${message}`,
        installingStatus: "Downloading and installing...",
        noUpdateOnRetry: "A fresh check found no new version.",
        downloadProgress: (pct: number, downloaded: number, total: number) =>
          `Download ${pct}% (${downloaded.toFixed(1)}MB / ${total.toFixed(1)}MB)`,
        installed: "Install complete. Restarting...",
        installFailed: (message: string) => `Install failed: ${message}`,
        availableTitle: (version: string) => `v${version} available`,
        installing: "Installing...",
        install: "Install + restart",
      }
    : {
        title: "업데이트",
        sub: "Atelier 새 버전을 확인하고 설치합니다. 모든 업데이트는 ED25519 서명으로 검증됩니다.",
        currentVersion: "현재 버전",
        currentVersionHint: "앱 번들 메타데이터에 박힌 버전 (tauri.conf.json).",
        check: "업데이트 확인",
        checkHint: "공개 Atelier 릴리스 채널의 latest.json을 폴링합니다. 인터넷 연결이 필요합니다.",
        checking: "확인 중…",
        checkNow: "지금 확인",
        checkingStatus: "최신 버전 확인 중…",
        availableStatus: (version: string) => `v${version} 사용 가능`,
        upToDate: "최신 버전입니다.",
        checkFailed: (message: string) => `확인 실패: ${message}`,
        installingStatus: "다운로드·설치 중…",
        noUpdateOnRetry: "다시 확인하니 새 버전이 없습니다.",
        downloadProgress: (pct: number, downloaded: number, total: number) =>
          `다운로드 ${pct}% (${downloaded.toFixed(1)}MB / ${total.toFixed(1)}MB)`,
        installed: "설치 완료. 재시작 중…",
        installFailed: (message: string) => `설치 실패: ${message}`,
        availableTitle: (version: string) => `v${version} 사용 가능`,
        installing: "설치 중…",
        install: "지금 설치 + 재시작",
      };
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string>("");
  const [available, setAvailable] = React.useState<{
    version: string;
    notes?: string;
    date?: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [installing, setInstalling] = React.useState(false);
  const [currentVersion, setCurrentVersion] = React.useState<string>("...");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        if (alive) setCurrentVersion(`v${version}`);
      } catch {
        if (alive) setCurrentVersion("dev");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function checkForUpdate() {
    setBusy(true);
    setError(null);
    setStatus(copy.checkingStatus);
    setAvailable(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setAvailable({ version: update.version, notes: update.body, date: update.date });
        setStatus(copy.availableStatus(update.version));
      } else {
        setStatus(copy.upToDate);
      }
    } catch (e) {
      setError(copy.checkFailed(String(e)));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function installAndRestart() {
    setInstalling(true);
    setError(null);
    setStatus(copy.installingStatus);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        setError(copy.noUpdateOnRetry);
        return;
      }
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            const pct = Math.round((downloaded / total) * 100);
            setStatus(copy.downloadProgress(pct, downloaded / 1024 / 1024, total / 1024 / 1024));
          }
        } else if (event.event === "Finished") {
          setStatus(copy.installed);
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setError(copy.installFailed(String(e)));
      setStatus("");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <>
      <SectionHeader
        dark={dark}
        title={copy.title}
        sub={copy.sub}
      />
      <Row
        dark={dark}
        label={copy.currentVersion}
        hint={copy.currentVersionHint}
      >
        <div className={cls("text-[12px] font-mono", dark ? "text-dink" : "text-ink")}>
          {currentVersion}
        </div>
      </Row>
      <Row
        dark={dark}
        label={copy.check}
        hint={copy.checkHint}
      >
        <button
          type="button"
          onClick={checkForUpdate}
          disabled={busy || installing}
          className={cls(
            "h-9 px-3 rounded-[6px] text-[12px] font-medium border whitespace-nowrap disabled:opacity-40",
            dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted",
          )}
          data-testid="settings-check-update"
        >
          {busy ? copy.checking : copy.checkNow}
        </button>
      </Row>
      {status && !error && (
        <div
          className={cls(
            "mt-4 p-3 rounded-[6px] border text-[12px]",
            dark ? "bg-dmuted border-dline text-dink" : "bg-surface border-line text-ink",
          )}
        >
          {status}
        </div>
      )}
      {error && (
        <div className="mt-4 p-3 rounded-[6px] border border-red-300/40 bg-red-50/10 text-[12px] text-red-500">
          {error}
        </div>
      )}
      {available && (
        <div
          className={cls(
            "mt-4 p-4 rounded-[8px] border",
            dark ? "bg-dmuted border-dline" : "bg-surface border-line",
          )}
          data-testid="settings-update-available"
          style={{ boxShadow: "0 0 0 1px #c96442" }}
        >
          <div className={cls("text-[14px] font-medium mb-1", dark ? "text-dink" : "text-ink")}>
            {copy.availableTitle(available.version)}
          </div>
          {available.date && (
            <div className={cls("text-[10px] mb-3", dark ? "text-dsub" : "text-sub")}>
              {available.date}
            </div>
          )}
          {available.notes && (
            <pre
              className={cls(
                "text-[12px] leading-[1.6] whitespace-pre-wrap font-sans mb-4",
                dark ? "text-dink" : "text-ink",
              )}
            >
              {available.notes}
            </pre>
          )}
          <button
            type="button"
            onClick={installAndRestart}
            disabled={installing}
            className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white whitespace-nowrap disabled:opacity-40"
            style={{ background: "#c96442" }}
            data-testid="settings-install-update"
          >
            {installing ? copy.installing : copy.install}
          </button>
        </div>
      )}
    </>
  );
};

export default Settings;
