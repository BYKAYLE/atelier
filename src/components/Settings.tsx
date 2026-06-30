import React, { useEffect, useState } from "react";
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
import { runtimeInstallInfo, type RuntimeInstallInfo } from "../lib/tauri";
import ConnectionsPanel from "./ConnectionsPanel";

interface Props {
  tw: Tweaks;
  setTw: (p: Partial<Tweaks>) => void;
  initialSection?: string;
}

const Settings: React.FC<Props> = ({ tw, setTw, initialSection }) => {
  const dark = tw.dark;
  const [section, setSection] = useState<string>(initialSection || "appearance");

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  return (
    <div
      className={cls(
        "h-full w-full overflow-auto fade-in",
        dark ? "bg-dbg" : "bg-cream",
      )}
    >
      <div className="max-w-[780px] px-10 pt-10 pb-16">
        {section === "terminal" && <TerminalSection tw={tw} setTw={setTw} />}
        {section === "appearance" && <AppearanceSection tw={tw} setTw={setTw} />}
        {section === "profiles" && <ProfilesSection tw={tw} setTw={setTw} />}
        {section === "shortcuts" && <ShortcutsSection dark={dark} language={tw.language} />}
        {section === "preview" && <PreviewSection dark={dark} language={tw.language} />}
        {section === "connections" && <ConnectionsPanel tw={tw} />}
        {section === "updates" && <UpdatesSection dark={dark} language={tw.language} />}
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

const ProfilesSection: React.FC<{ tw: Tweaks; setTw: (p: Partial<Tweaks>) => void }> = ({
  tw,
  setTw,
}) => {
  const dark = tw.dark;
  const profiles = tw.profiles;
  const copy = tw.language === "en"
    ? {
        title: "Profiles",
        sub: "Atelier shows the four supported CLI profiles after GitHub updates.",
        colorDot: "Color dot",
        name: "Name",
        command: "Command (e.g. claude, python3)",
        source: "Source",
      }
    : {
        title: "프로필",
        sub: "GitHub 최신 패치 후에도 지원하는 CLI 프로필 4개만 표시합니다.",
        colorDot: "색 도트",
        name: "이름",
        command: "실행 명령 (예: claude, python3)",
        source: "원본",
      };

  const updateProfile = (idx: number, patch: Partial<Profile>) => {
    const next = profiles.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    setTw({ profiles: next });
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
              "flex items-center gap-3 px-4 py-2 min-h-14",
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
            <div className="flex-1 min-w-0">
              <input
                value={p.cmd}
                onChange={(e) => updateProfile(i, { cmd: e.target.value })}
                placeholder={copy.command}
                className={cls(
                  "w-full h-8 px-2.5 rounded-[6px] border font-mono text-[12px] outline-none",
                  dark
                    ? "bg-dmuted border-dline text-dink"
                    : "bg-surface border-line text-ink",
                )}
              />
              {p.sourceUrl && (
                <a
                  href={p.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cls(
                    "inline-flex mt-1 text-[11px] underline underline-offset-2",
                    dark ? "text-dsub hover:text-dink" : "text-sub hover:text-ink",
                  )}
                >
                  {copy.source}: {p.sourceUrl}
                </a>
              )}
            </div>
          </div>
        ))}
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

type PreviewPatchNote = {
  title: string;
  body: string;
  tag: string;
};

function stripPatchMarkdown(text: string): string {
  return text
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseReleasePatchNotes(notes: string | undefined | null, fallbackTag: string): PreviewPatchNote[] {
  if (!notes) return [];
  const ignored = /changelog\s*자동|자동 생성|직접 수정|code signing|signpath|full policy|certificate by|릴리스 본문을 수동/i;
  const items: PreviewPatchNote[] = [];
  for (const rawLine of notes.split(/\r?\n/)) {
    const match = rawLine.trim().match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
    if (!match) continue;
    const line = stripPatchMarkdown(match[1]);
    if (!line || ignored.test(line) || line.length < 4) continue;
    const tagMatch = line.match(/^\[([^\]]+)\]\s*(.+)$/);
    const withoutTag = tagMatch ? tagMatch[2] : line;
    const tag = tagMatch ? tagMatch[1] : fallbackTag;
    const parts = withoutTag.split(/\s+[—-]\s+|:\s+/);
    const title = stripPatchMarkdown(parts[0] || withoutTag).slice(0, 80);
    const body = stripPatchMarkdown(parts.slice(1).join(" — ") || withoutTag);
    items.push({ title, body, tag });
    if (items.length >= 8) break;
  }
  return items;
}

const PreviewSection: React.FC<{ dark: boolean; language: AppLanguage }> = ({ dark, language }) => {
  const [bugTitle, setBugTitle] = React.useState("");
  const [bugBody, setBugBody] = React.useState("");
  const [bugArea, setBugArea] = React.useState("preview");
  const [bugCopied, setBugCopied] = React.useState(false);
  const [currentVersion, setCurrentVersion] = React.useState("");
  const [patchLoading, setPatchLoading] = React.useState(false);
  const [patchSource, setPatchSource] = React.useState<"github" | "fallback">("fallback");
  const [patchVersion, setPatchVersion] = React.useState("");
  const [patchDate, setPatchDate] = React.useState("");
  const [patchUrl, setPatchUrl] = React.useState("");
  const [patchError, setPatchError] = React.useState("");
  const [patchNotes, setPatchNotes] = React.useState<PreviewPatchNote[]>([]);
  const [bugSending, setBugSending] = React.useState(false);
  const [bugSendStatus, setBugSendStatus] = React.useState("");
  const [bugSendError, setBugSendError] = React.useState("");
  const copy = React.useMemo(() => language === "en"
    ? {
        title: "Preview panel",
        sub: "Recent Atelier patches and issue reporting for the preview workspace.",
        patchTitle: "Patch notes",
        patchHint: "Patch notes follow the current app version. GitHub Release notes are used first.",
        patchLoading: "Loading release notes...",
        patchSourceGithub: "Source: GitHub Release",
        patchSourceFallback: "Source: embedded notes",
        patchRefresh: "Refresh",
        patchOpenRelease: "Open release",
        patchFallbackError: (message: string) => `Using embedded notes because release notes could not be loaded: ${message}`,
        bugTitle: "Report a bug",
        bugHint: "Attach what happened, what you expected, and any visible error text.",
        titleLabel: "Title",
        titlePlaceholder: "Short description of the issue",
        areaLabel: "Area",
        bodyLabel: "Details",
        bodyPlaceholder: "Steps, expected result, actual result, screenshot notes, console or preview errors...",
        copyReport: "Copy report",
        copied: "Copied",
        emailReport: "Email report",
        sendingReport: "Sending...",
        reportSent: "Report sent to indra850@gmail.com.",
        reportFailed: (message: string) => `Email report failed: ${message}`,
        openIssue: "Open GitHub issue",
        emptyTitle: "Untitled bug report",
        version: "Version",
        areas: [
          { value: "preview", label: "Preview" },
          { value: "chat", label: "Chat" },
          { value: "providers", label: "Providers" },
          { value: "updates", label: "Updates" },
          { value: "other", label: "Other" },
        ],
        fallbackPatches: [
          {
            title: "Faster chat input",
            body: "Typing now uses a local draft buffer and delayed state commits so long conversations do not re-render on every key.",
            tag: "Performance",
          },
          {
            title: "Memoized chat transcript",
            body: "Markdown, tables, logs, and change summaries are cached while the composer changes.",
            tag: "Chat",
          },
          {
            title: "Hermes backend cleanup",
            body: "Hermes now offers Codex and OpenRouter only; old Claude backend values are normalized to Codex.",
            tag: "Hermes",
          },
          {
            title: "Live model catalogs",
            body: "Codex and OpenRouter model options sync from their current catalogs instead of staying hard-coded.",
            tag: "Models",
          },
        ],
      }
    : {
        title: "미리보기 패널",
        sub: "Atelier 최근 패치 내용과 미리보기/작업공간 버그 제보를 한곳에서 관리합니다.",
        patchTitle: "패치 내용",
        patchHint: "패치 내용은 현재 앱 버전 기준으로 표시됩니다. GitHub Release 노트를 먼저 사용합니다.",
        patchLoading: "릴리스 노트 불러오는 중…",
        patchSourceGithub: "기준: GitHub Release",
        patchSourceFallback: "기준: 설치본 내장 노트",
        patchRefresh: "새로고침",
        patchOpenRelease: "릴리스 열기",
        patchFallbackError: (message: string) => `릴리스 노트를 불러오지 못해 설치본 내장 노트를 표시합니다: ${message}`,
        bugTitle: "버그 제보",
        bugHint: "발생한 상황, 기대한 동작, 실제 결과, 보이는 에러 문구를 남겨주세요.",
        titleLabel: "제목",
        titlePlaceholder: "문제를 짧게 적어주세요",
        areaLabel: "영역",
        bodyLabel: "상세 내용",
        bodyPlaceholder: "재현 순서, 기대 결과, 실제 결과, 스크린샷 설명, 콘솔/프리뷰 에러 문구...",
        copyReport: "제보 내용 복사",
        copied: "복사됨",
        emailReport: "메일로 제보",
        sendingReport: "전송 중…",
        reportSent: "indra850@gmail.com으로 제보를 보냈습니다.",
        reportFailed: (message: string) => `메일 제보 실패: ${message}`,
        openIssue: "GitHub 이슈 열기",
        emptyTitle: "제목 없는 버그 제보",
        version: "버전",
        areas: [
          { value: "preview", label: "미리보기" },
          { value: "chat", label: "채팅" },
          { value: "providers", label: "제공자 연결" },
          { value: "updates", label: "업데이트" },
          { value: "other", label: "기타" },
        ],
        fallbackPatches: [
          {
            title: "채팅 입력 속도 개선",
            body: "긴 대화에서도 입력창이 먼저 반응하도록 로컬 draft 버퍼와 지연 상태 반영을 적용했습니다.",
            tag: "성능",
          },
          {
            title: "채팅 본문 렌더링 캐시",
            body: "입력 중 마크다운, 표, 로그, 변경 파일 요약을 매번 다시 그리지 않도록 분리했습니다.",
            tag: "채팅",
          },
          {
            title: "Hermes 백엔드 정리",
            body: "Hermes 하위 provider에서 Claude를 제거하고 Codex/OpenRouter만 남겼습니다.",
            tag: "Hermes",
          },
          {
            title: "모델 목록 동기화",
            body: "Codex와 OpenRouter 모델 목록을 고정값이 아니라 현재 카탈로그 기준으로 불러오게 했습니다.",
            tag: "모델",
          },
        ],
      }, [language]);
  const fallbackPatchNotes = copy.fallbackPatches;

  const loadPatchNotes = React.useCallback(async (version: string) => {
    setPatchLoading(true);
    setPatchError("");
    try {
      const release = version && version !== "dev"
        ? await fetchGithubReleaseByVersion(version)
        : await fetchLatestGithubRelease();
      const parsed = parseReleasePatchNotes(release.notes, language === "en" ? "Release" : "릴리스");
      if (!parsed.length) {
        throw new Error(language === "en" ? "release has no usable changelog items" : "릴리스에 표시할 변경 항목이 없습니다");
      }
      setPatchSource("github");
      setPatchVersion(release.version);
      setPatchDate(release.date || "");
      setPatchUrl(release.url);
      setPatchNotes(parsed);
    } catch (err) {
      setPatchSource("fallback");
      setPatchVersion(version || "dev");
      setPatchDate("");
      setPatchUrl("");
      setPatchError(String(err instanceof Error ? err.message : err));
      setPatchNotes(fallbackPatchNotes);
    } finally {
      setPatchLoading(false);
    }
  }, [fallbackPatchNotes, language]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        if (alive) {
          setCurrentVersion(version);
          await loadPatchNotes(version);
        }
      } catch {
        if (alive) {
          setCurrentVersion("dev");
          await loadPatchNotes("dev");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadPatchNotes]);

  const selectedArea = copy.areas.find((area) => area.value === bugArea)?.label || bugArea;
  const reportTitle = bugTitle.trim() || copy.emptyTitle;
  const reportBody = [
    `## ${copy.titleLabel}`,
    reportTitle,
    "",
    `## ${copy.areaLabel}`,
    selectedArea,
    "",
    `## ${copy.version}`,
    currentVersion ? `Atelier v${currentVersion}` : "Atelier",
    "",
    `## ${copy.bodyLabel}`,
    bugBody.trim() || "-",
  ].join("\n");

  const copyBugReport = async () => {
    try {
      await navigator.clipboard.writeText(reportBody);
      setBugCopied(true);
      window.setTimeout(() => setBugCopied(false), 1400);
    } catch {
      setBugCopied(false);
    }
  };

  const openGithubIssue = async () => {
    const params = new URLSearchParams({
      title: `[Bug] ${reportTitle}`,
      body: reportBody,
    });
    const url = `https://github.com/${ATELIER_GITHUB_REPO}/issues/new?${params.toString()}`;
    await openExternalUrl(url);
  };

  const sendBugReportEmail = async () => {
    setBugSending(true);
    setBugSendStatus("");
    setBugSendError("");
    try {
      const res = await fetch(BUG_REPORT_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          _captcha: "false",
          _subject: `[Atelier Bug] ${reportTitle}`,
          _template: "box",
          app: "Atelier",
          version: currentVersion ? `v${currentVersion}` : "dev",
          area: selectedArea,
          title: reportTitle,
          details: bugBody.trim() || "-",
          report: reportBody,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text.slice(0, 180) || `HTTP ${res.status}`);
      }
      setBugSendStatus(copy.reportSent);
    } catch (err) {
      setBugSendError(copy.reportFailed(String(err instanceof Error ? err.message : err)));
    } finally {
      setBugSending(false);
    }
  };

  return (
    <>
      <SectionHeader dark={dark} title={copy.title} sub={copy.sub} />
      <section
        className={cls(
          "rounded-[9px] border overflow-hidden mb-5",
          dark ? "border-dline bg-dpanel" : "border-line bg-panel",
        )}
      >
        <div className={cls("px-4 py-3 border-b", dark ? "border-dline" : "border-line")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={cls("text-[14px] font-medium", dark ? "text-dink" : "text-ink")}>{copy.patchTitle}</div>
              <div className={cls("text-[12px] mt-0.5", dark ? "text-dsub" : "text-sub")}>{copy.patchHint}</div>
              <div className={cls("text-[11px] mt-2 font-mono", dark ? "text-dsub" : "text-sub")}>
                v{patchVersion || currentVersion || "dev"}
                {patchDate ? ` · ${new Date(patchDate).toLocaleDateString(language === "en" ? "en-US" : "ko-KR")}` : ""}
                {" · "}
                {patchSource === "github" ? copy.patchSourceGithub : copy.patchSourceFallback}
              </div>
              {patchError && (
                <div className={cls("text-[11.5px] mt-1", dark ? "text-[#ffb3b3]" : "text-[#9a342f]")}>
                  {copy.patchFallbackError(patchError)}
                </div>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadPatchNotes(currentVersion || "dev")}
                disabled={patchLoading}
                className={cls(
                  "h-8 px-3 rounded-[7px] border text-[12px]",
                  dark ? "border-dline text-dink hover:bg-dmuted disabled:text-dsub" : "border-line text-ink hover:bg-muted disabled:text-sub",
                )}
              >
                {patchLoading ? copy.patchLoading : copy.patchRefresh}
              </button>
              {patchUrl && (
                <button
                  type="button"
                  onClick={() => void openExternalUrl(patchUrl)}
                  className={cls(
                    "h-8 px-3 rounded-[7px] border text-[12px]",
                    dark ? "border-dline text-dink hover:bg-dmuted" : "border-line text-ink hover:bg-muted",
                  )}
                >
                  {copy.patchOpenRelease}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="divide-y divide-[rgba(128,128,128,0.18)]">
          {(patchNotes.length ? patchNotes : fallbackPatchNotes).map((patch) => (
            <div key={patch.title} className="px-4 py-3 grid grid-cols-[1fr_auto] gap-4">
              <div className="min-w-0">
                <div className={cls("text-[13.5px] font-medium", dark ? "text-dink" : "text-ink")}>{patch.title}</div>
                <div className={cls("text-[12px] leading-[1.55] mt-1", dark ? "text-dsub" : "text-sub")}>
                  {patch.body}
                </div>
              </div>
              <span
                className={cls(
                  "h-6 px-2 rounded-full border text-[11px] inline-flex items-center",
                  dark ? "border-dline text-dsub bg-dmuted" : "border-line text-sub bg-muted",
                )}
              >
                {patch.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section
        className={cls(
          "rounded-[9px] border p-4",
          dark ? "border-dline bg-dpanel" : "border-line bg-panel",
        )}
      >
        <div className="mb-4">
          <div className={cls("text-[14px] font-medium", dark ? "text-dink" : "text-ink")}>{copy.bugTitle}</div>
          <div className={cls("text-[12px] mt-0.5", dark ? "text-dsub" : "text-sub")}>{copy.bugHint}</div>
        </div>
        <div className="grid grid-cols-[1fr_180px] gap-3 mb-3">
          <label className="min-w-0">
            <span className={cls("block text-[11px] font-mono uppercase tracking-wider mb-1.5", dark ? "text-dsub" : "text-sub")}>
              {copy.titleLabel}
            </span>
            <input
              value={bugTitle}
              onChange={(e) => setBugTitle(e.target.value)}
              placeholder={copy.titlePlaceholder}
              className={cls(
                "h-9 w-full rounded-[7px] border px-3 text-[13px] outline-none",
                dark ? "bg-dbg border-dline text-dink placeholder:text-dsub" : "bg-cream border-line text-ink placeholder:text-sub",
              )}
            />
          </label>
          <label>
            <span className={cls("block text-[11px] font-mono uppercase tracking-wider mb-1.5", dark ? "text-dsub" : "text-sub")}>
              {copy.areaLabel}
            </span>
            <select
              value={bugArea}
              onChange={(e) => setBugArea(e.target.value)}
              className={cls(
                "h-9 w-full rounded-[7px] border px-2 text-[13px] outline-none",
                dark ? "bg-dbg border-dline text-dink" : "bg-cream border-line text-ink",
              )}
            >
              {copy.areas.map((area) => (
                <option key={area.value} value={area.value}>{area.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={cls("block text-[11px] font-mono uppercase tracking-wider mb-1.5", dark ? "text-dsub" : "text-sub")}>
            {copy.bodyLabel}
          </span>
          <textarea
            value={bugBody}
            onChange={(e) => setBugBody(e.target.value)}
            placeholder={copy.bodyPlaceholder}
            className={cls(
              "min-h-[132px] w-full rounded-[7px] border px-3 py-2 text-[13px] leading-[1.55] outline-none resize-y",
              dark ? "bg-dbg border-dline text-dink placeholder:text-dsub" : "bg-cream border-line text-ink placeholder:text-sub",
            )}
          />
        </label>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void copyBugReport()}
            className={cls(
              "h-9 px-3 rounded-[7px] border text-[12.5px]",
              dark ? "border-dline text-dink hover:bg-dmuted" : "border-line text-ink hover:bg-muted",
            )}
          >
            {bugCopied ? copy.copied : copy.copyReport}
          </button>
          <button
            type="button"
            onClick={() => void openGithubIssue()}
            className={cls(
              "h-9 px-3 rounded-[7px] border text-[12.5px]",
              dark ? "border-dline text-dink hover:bg-dmuted" : "border-line text-ink hover:bg-muted",
            )}
          >
            {copy.openIssue}
          </button>
          <button
            type="button"
            onClick={() => void sendBugReportEmail()}
            disabled={bugSending}
            className="h-9 px-3 rounded-[7px] border text-[12.5px] bg-[var(--accent)] text-white border-[var(--accent-hover)] hover:opacity-90 disabled:opacity-45"
          >
            {bugSending ? copy.sendingReport : copy.emailReport}
          </button>
        </div>
        {(bugSendStatus || bugSendError) && (
          <div
            className={cls(
              "mt-2 text-[12px] text-right",
              bugSendError
                ? dark ? "text-[#ffb3b3]" : "text-[#9a342f]"
                : dark ? "text-[#9fd0a9]" : "text-[#2c7a43]",
            )}
          >
            {bugSendError || bugSendStatus}
          </div>
        )}
      </section>
    </>
  );
};

const ATELIER_GITHUB_REPO = "BYKAYLE/atelier";
const ATELIER_GITHUB_API_BASE = `https://api.github.com/repos/${ATELIER_GITHUB_REPO}`;
const ATELIER_GITHUB_API = `${ATELIER_GITHUB_API_BASE}/releases/latest`;
const ATELIER_GITHUB_RELEASES = `https://github.com/${ATELIER_GITHUB_REPO}/releases/latest`;
const BUG_REPORT_EMAIL = "indra850@gmail.com";
const BUG_REPORT_ENDPOINT = `https://formsubmit.co/ajax/${BUG_REPORT_EMAIL}`;

type GithubReleaseInfo = {
  version: string;
  notes?: string;
  date?: string;
  url: string;
};

async function openExternalUrl(url: string) {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function githubReleaseHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function normalizeVersion(value: string | undefined | null): string {
  return (value ?? "").trim().replace(/^v/i, "").split("+")[0].split("-")[0];
}

function formatReleaseDate(value: string, language: AppLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(language === "en" ? "en-US" : "ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(b).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function githubReleaseFromJson(
  json: {
    tag_name?: string;
    body?: string;
    published_at?: string;
    html_url?: string;
  },
  fallbackUrl: string,
): GithubReleaseInfo {
  const version = normalizeVersion(json.tag_name);
  if (!version) {
    throw new Error("GitHub release has no version tag");
  }
  return {
    version,
    notes: json.body,
    date: json.published_at,
    url: json.html_url || fallbackUrl,
  };
}

async function fetchGithubReleaseByVersion(version: string): Promise<GithubReleaseInfo> {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    throw new Error("Missing app version");
  }
  const candidateTags = Array.from(new Set([`v${normalized}`, normalized]));
  let notFoundMessage = "";
  for (const tag of candidateTags) {
    const tagUrl = `https://github.com/${ATELIER_GITHUB_REPO}/releases/tag/${encodeURIComponent(tag)}`;
    const res = await fetch(`${ATELIER_GITHUB_API_BASE}/releases/tags/${encodeURIComponent(tag)}`, {
      headers: githubReleaseHeaders(),
    });
    if (res.status === 404) {
      notFoundMessage = `GitHub release ${tag} was not found`;
      continue;
    }
    if (!res.ok) {
      throw new Error(`GitHub release ${tag} check failed (${res.status})`);
    }
    const json = await res.json() as {
      tag_name?: string;
      body?: string;
      published_at?: string;
      html_url?: string;
    };
    return githubReleaseFromJson(json, tagUrl);
  }
  throw new Error(notFoundMessage || `GitHub release for v${normalized} was not found`);
}

async function fetchLatestGithubRelease(): Promise<GithubReleaseInfo> {
  const res = await fetch(ATELIER_GITHUB_API, {
    headers: githubReleaseHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GitHub release check failed (${res.status})`);
  }
  const json = await res.json() as {
    tag_name?: string;
    body?: string;
    published_at?: string;
    html_url?: string;
  };
  return githubReleaseFromJson(json, ATELIER_GITHUB_RELEASES);
}

interface UpdateInstallInfo extends RuntimeInstallInfo {
  bundleType?: string | null;
}

function isWindowsRuntime(): boolean {
  return /Windows/i.test(window.navigator.userAgent);
}

async function readUpdateInstallInfo(): Promise<UpdateInstallInfo> {
  const [runtime, bundleType] = await Promise.all([
    runtimeInstallInfo().catch(() => ({
      exe_path: "",
      windows_store_like: false,
    })),
    import("@tauri-apps/api/app")
      .then((m) => m.getBundleType())
      .catch(() => null),
  ]);
  return {
    ...runtime,
    bundleType: typeof bundleType === "string" ? bundleType : null,
  };
}

function windowsUpdaterTarget(info: UpdateInstallInfo | null): string | null | undefined {
  if (!isWindowsRuntime()) return undefined;
  const bundleType = info?.bundleType?.toLowerCase();
  if (bundleType === "msi") return "windows-x86_64-msi";
  if (bundleType === "nsis") return "windows-x86_64-nsis";
  return null;
}

function canUseInAppUpdater(info: UpdateInstallInfo | null): boolean {
  if (!isWindowsRuntime()) return true;
  if (!info) return false;
  if (info.windows_store_like) return false;
  return windowsUpdaterTarget(info) !== null;
}

/**
 * UpdatesSection — GitHub Releases 기준.
 * 업데이트 유무는 GitHub 최신 릴리스 태그로 판단하고,
 * 설치는 Tauri updater의 ED25519 서명 검증을 통과한 패키지만 진행한다.
 */
const UpdatesSection: React.FC<{ dark: boolean; language: AppLanguage }> = ({
  dark,
  language,
}) => {
  const copy = language === "en"
    ? {
        title: "Updates",
        sub: "Checks GitHub Releases for new Atelier versions. Install packages are verified with an ED25519 signature.",
        currentVersion: "Current version",
        patchedAt: "Patched",
        installChannel: "Install channel",
        detectingChannel: "Detecting...",
        unknownChannel: "Unknown Windows package",
        storeChannel: "Microsoft Store / WindowsApps",
        check: "Check for updates",
        checking: "Checking...",
        checkNow: "Check now",
        checkingStatus: "Checking GitHub Releases...",
        availableStatus: (version: string) => `v${version} available from GitHub`,
        upToDate: "You are up to date.",
        releaseBehind: (latest: string, current: string) =>
          `GitHub Releases are behind this app (GitHub v${latest}, app v${current}). Publish a newer release to make in-app updates available.`,
        checkFailed: (message: string) => `Check failed: ${message}`,
        installingStatus: "Downloading and installing...",
        noUpdateOnRetry: "A fresh check found no new version.",
        signedPackageMissing: (version: string) =>
          `GitHub has v${version}, but its signed updater package is not ready yet. Open the release page to download it manually.`,
        downloadProgress: (pct: number, downloaded: number, total: number) =>
          `Download ${pct}% (${downloaded.toFixed(1)}MB / ${total.toFixed(1)}MB)`,
        installed: "Install complete. Restarting...",
        installFailed: (message: string) => `Install failed: ${message}`,
        unsupportedInstall:
          "This install channel cannot be replaced safely by the GitHub updater. Open the GitHub release and install the matching package, or update from Microsoft Store if this is the Store build.",
        availableTitle: (version: string) => `v${version} available`,
        installing: "Installing...",
        install: "Install + restart",
        openRelease: "Open GitHub release",
        source: "Source: GitHub Releases",
      }
    : {
        title: "업데이트",
        sub: "GitHub Releases 기준으로 Atelier 새 버전을 확인합니다. 설치 패키지는 ED25519 서명으로 검증됩니다.",
        currentVersion: "현재 버전",
        patchedAt: "패치일",
        installChannel: "설치 채널",
        detectingChannel: "확인 중…",
        unknownChannel: "알 수 없는 Windows 패키지",
        storeChannel: "Microsoft Store / WindowsApps",
        check: "업데이트 확인",
        checking: "확인 중…",
        checkNow: "지금 확인",
        checkingStatus: "GitHub 릴리스 확인 중…",
        availableStatus: (version: string) => `GitHub에 v${version} 사용 가능`,
        upToDate: "최신 버전입니다.",
        releaseBehind: (latest: string, current: string) =>
          `GitHub 릴리스가 현재 앱보다 오래되었습니다. (GitHub v${latest}, 앱 v${current}) 더 높은 버전의 릴리스를 올려야 앱 안에서 업데이트가 검색됩니다.`,
        checkFailed: (message: string) => `확인 실패: ${message}`,
        installingStatus: "다운로드·설치 중…",
        noUpdateOnRetry: "다시 확인하니 새 버전이 없습니다.",
        signedPackageMissing: (version: string) =>
          `GitHub에는 v${version} 릴리스가 있지만 서명된 updater 패키지가 아직 준비되지 않았습니다. 릴리스 페이지에서 직접 받을 수 있습니다.`,
        downloadProgress: (pct: number, downloaded: number, total: number) =>
          `다운로드 ${pct}% (${downloaded.toFixed(1)}MB / ${total.toFixed(1)}MB)`,
        installed: "설치 완료. 재시작 중…",
        installFailed: (message: string) => `설치 실패: ${message}`,
        unsupportedInstall:
          "현재 설치 채널은 GitHub updater로 안전하게 덮어쓸 수 없습니다. GitHub 릴리스에서 현재 채널과 맞는 설치 파일을 직접 설치하거나, Store 설치본이면 Microsoft Store 업데이트를 사용해야 합니다.",
        availableTitle: (version: string) => `v${version} 사용 가능`,
        installing: "설치 중…",
        install: "지금 설치 + 재시작",
        openRelease: "GitHub 릴리스 열기",
        source: "기준: GitHub Releases",
      };
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string>("");
  const [available, setAvailable] = React.useState<{
    version: string;
    notes?: string;
    date?: string;
    releaseUrl?: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [installing, setInstalling] = React.useState(false);
  const [currentVersion, setCurrentVersion] = React.useState<string>("...");
  const [currentVersionRaw, setCurrentVersionRaw] = React.useState<string>("");
  const [currentPatchDate, setCurrentPatchDate] = React.useState<string>("");
  const [installInfo, setInstallInfo] = React.useState<UpdateInstallInfo | null>(null);
  const updateInstallUnsupported = isWindowsRuntime() && !!installInfo && !canUseInAppUpdater(installInfo);

  const installChannelLabel = React.useMemo(() => {
    if (!installInfo) return copy.detectingChannel;
    if (installInfo.windows_store_like) return copy.storeChannel;
    const bundleType = installInfo.bundleType?.toUpperCase();
    if (isWindowsRuntime()) return bundleType || copy.unknownChannel;
    return bundleType || "APP";
  }, [copy.detectingChannel, copy.storeChannel, copy.unknownChannel, installInfo]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        if (alive) {
          setCurrentVersion(`v${version}`);
          setCurrentVersionRaw(version);
        }
        try {
          const release = await fetchGithubReleaseByVersion(version);
          if (alive) setCurrentPatchDate(release.date || "");
        } catch {
          if (alive) setCurrentPatchDate("");
        }
      } catch {
        if (alive) setCurrentVersion("dev");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    readUpdateInstallInfo()
      .then((info) => {
        if (alive) setInstallInfo(info);
      })
      .catch(() => {
        if (alive) setInstallInfo(null);
      });
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
      const latest = await fetchLatestGithubRelease();
      if (currentVersionRaw && compareVersions(latest.version, currentVersionRaw) > 0) {
        setAvailable({
          version: latest.version,
          notes: latest.notes,
          date: latest.date,
          releaseUrl: latest.url,
        });
        setStatus(copy.availableStatus(latest.version));
      } else if (currentVersionRaw && compareVersions(latest.version, currentVersionRaw) < 0) {
        setStatus(copy.releaseBehind(latest.version, currentVersionRaw));
      } else {
        setStatus(copy.upToDate);
      }
    } catch (e) {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const target = windowsUpdaterTarget(installInfo);
        if (target === null || (installInfo?.windows_store_like ?? false)) {
          setError(copy.checkFailed(copy.unsupportedInstall));
          setStatus("");
          return;
        }
        const update = await check(target ? { target } : undefined);
        if (update) {
          setAvailable({
            version: update.version,
            notes: update.body,
            date: update.date,
            releaseUrl: ATELIER_GITHUB_RELEASES,
          });
          setStatus(copy.availableStatus(update.version));
        } else {
          setStatus(copy.upToDate);
        }
      } catch {
        setError(copy.checkFailed(String(e)));
        setStatus("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function installAndRestart() {
    setInstalling(true);
    setError(null);
    setStatus(copy.installingStatus);
    try {
      let activeInstallInfo = installInfo;
      if (isWindowsRuntime() && !activeInstallInfo) {
        activeInstallInfo = await readUpdateInstallInfo();
        setInstallInfo(activeInstallInfo);
      }
      const target = windowsUpdaterTarget(activeInstallInfo);
      if (target === null || (activeInstallInfo?.windows_store_like ?? false)) {
        setError(copy.installFailed(copy.unsupportedInstall));
        setStatus("");
        return;
      }
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check(target ? { target } : undefined);
      if (!update) {
        setError(available ? copy.signedPackageMissing(available.version) : copy.noUpdateOnRetry);
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
      if (!isWindowsRuntime()) {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }
    } catch (e) {
      setError(copy.installFailed(String(e)));
      setStatus("");
    } finally {
      setInstalling(false);
    }
  }

  async function openReleasePage() {
    const url = available?.releaseUrl || ATELIER_GITHUB_RELEASES;
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
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
      >
        <div className="text-right">
          <div className={cls("text-[12px] font-mono", dark ? "text-dink" : "text-ink")}>
            {currentVersion}
          </div>
          {currentPatchDate && (
            <div className={cls("mt-1 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
              {copy.patchedAt} {formatReleaseDate(currentPatchDate, language)}
            </div>
          )}
        </div>
      </Row>
      <Row
        dark={dark}
        label={copy.installChannel}
      >
        <div className={cls("text-right text-[12px] font-mono", dark ? "text-dink" : "text-ink")}>
          {installChannelLabel}
        </div>
      </Row>
      <Row
        dark={dark}
        label={copy.check}
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
              {copy.source} · {available.date}
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
          {updateInstallUnsupported && (
            <div className="mb-3 p-3 rounded-[6px] border border-red-300/40 bg-red-50/10 text-[12px] text-red-500">
              {copy.unsupportedInstall}
            </div>
          )}
          <button
            type="button"
            onClick={installAndRestart}
            disabled={installing || updateInstallUnsupported}
            className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white whitespace-nowrap disabled:opacity-40"
            style={{ background: "#c96442" }}
            data-testid="settings-install-update"
          >
            {installing ? copy.installing : copy.install}
          </button>
          <button
            type="button"
            onClick={openReleasePage}
            className={cls(
              "ml-2 h-9 px-4 rounded-[6px] border text-[12px] font-medium whitespace-nowrap",
              dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted",
            )}
          >
            {copy.openRelease}
          </button>
        </div>
      )}
    </>
  );
};

export default Settings;
