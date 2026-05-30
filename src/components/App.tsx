import React, { lazy, Suspense, useEffect, useState } from "react";
import { useTweaks } from "../lib/useTweaks";
import { ACCENTS, cls } from "../lib/tokens";
import Welcome from "./Welcome";
import Main from "./Main";
import Settings from "./Settings";
import AgentWorkspace from "./AgentWorkspace";
import { I } from "./Icons";
const DesignPage = lazy(() => import("./DesignPage"));

type AppScreen = "agent" | "main" | "settings" | "design" | "welcome";
type SettingsSection =
  | "terminal"
  | "appearance"
  | "profiles"
  | "shortcuts"
  | "preview"
  | "connections"
  | "updates";

type NavItem = {
  id: string;
  screen: AppScreen;
  settingsSection?: SettingsSection;
  icon: React.ReactNode;
  labelKo: string;
  labelEn: string;
  hintKo: string;
  hintEn: string;
};

type NavGroup = {
  id: string;
  labelKo: string;
  labelEn: string;
  items: NavItem[];
};

const isScreen = (value: string | null): value is AppScreen =>
  value === "agent" ||
  value === "main" ||
  value === "settings" ||
  value === "design" ||
  value === "welcome";

const NAV_GROUPS: NavGroup[] = [
  {
    id: "workspace",
    labelKo: "Workspace",
    labelEn: "Workspace",
    items: [
      {
        id: "agent",
        screen: "agent",
        icon: I.terminal,
        labelKo: "Chat",
        labelEn: "Chat",
        hintKo: "Claude · Hermes · Codex",
        hintEn: "Claude · Hermes · Codex",
      },
      {
        id: "sessions",
        screen: "agent",
        icon: I.preview,
        labelKo: "Sessions",
        labelEn: "Sessions",
        hintKo: "작업 기록",
        hintEn: "Work history",
      },
      {
        id: "main",
        screen: "main",
        icon: I.split,
        labelKo: "Workbench",
        labelEn: "Workbench",
        hintKo: "코드 · 프리뷰",
        hintEn: "Code · Preview",
      },
      {
        id: "design",
        screen: "design",
        icon: I.palette,
        labelKo: "Design",
        labelEn: "Design",
        hintKo: "기획 · 시안",
        hintEn: "Brief · Drafts",
      },
    ],
  },
  {
    id: "intelligence",
    labelKo: "Intelligence",
    labelEn: "Intelligence",
    items: [
      {
        id: "models",
        screen: "agent",
        icon: I.fastPreview,
        labelKo: "Models",
        labelEn: "Models",
        hintKo: "응답 모델 선택",
        hintEn: "Model routing",
      },
      {
        id: "skills",
        screen: "agent",
        icon: I.zap,
        labelKo: "Skills",
        labelEn: "Skills",
        hintKo: "플러그인 설치",
        hintEn: "Workspace plugins",
      },
    ],
  },
  {
    id: "system",
    labelKo: "System",
    labelEn: "System",
    items: [
      {
        id: "appearance",
        screen: "settings",
        settingsSection: "appearance",
        icon: I.palette,
        labelKo: "Appearance",
        labelEn: "Appearance",
        hintKo: "테마 · 언어",
        hintEn: "Theme · Language",
      },
      {
        id: "terminal",
        screen: "settings",
        settingsSection: "terminal",
        icon: I.terminal,
        labelKo: "Terminal",
        labelEn: "Terminal",
        hintKo: "글꼴 · 커서",
        hintEn: "Font · Cursor",
      },
      {
        id: "profiles",
        screen: "settings",
        settingsSection: "profiles",
        icon: I.zap,
        labelKo: "Profiles",
        labelEn: "Profiles",
        hintKo: "CLI 실행 프로필",
        hintEn: "CLI profiles",
      },
      {
        id: "providers",
        screen: "settings",
        settingsSection: "connections",
        icon: I.globe,
        labelKo: "Providers",
        labelEn: "Providers",
        hintKo: "구독 · API 연결",
        hintEn: "Auth · API links",
      },
      {
        id: "preview-settings",
        screen: "settings",
        settingsSection: "preview",
        icon: I.eye,
        labelKo: "Preview",
        labelEn: "Preview",
        hintKo: "미리보기 패널",
        hintEn: "Preview panel",
      },
      {
        id: "shortcuts",
        screen: "settings",
        settingsSection: "shortcuts",
        icon: I.keyboard,
        labelKo: "Shortcuts",
        labelEn: "Shortcuts",
        hintKo: "키보드 조작",
        hintEn: "Keyboard",
      },
      {
        id: "updates",
        screen: "settings",
        settingsSection: "updates",
        icon: I.fastPreview,
        labelKo: "Updates",
        labelEn: "Updates",
        hintKo: "GitHub 릴리스",
        hintEn: "GitHub releases",
      },
    ],
  },
];

const App: React.FC = () => {
  const [tw, setTw] = useTweaks();
  const accent = ACCENTS[tw.accent] || ACCENTS.terracotta;
  const [screen, setScreen] = useState<AppScreen>(() => {
    const migrated = localStorage.getItem("atelier.agentDefaultMigrated") === "1";
    const saved = localStorage.getItem("atelier.screen");
    if (!migrated) {
      localStorage.setItem("atelier.agentDefaultMigrated", "1");
      return "agent";
    }
    return isScreen(saved) ? saved : "agent";
  });
  const [activeNav, setActiveNav] = useState<string>(() => {
    const savedNav = localStorage.getItem("atelier.nav");
    if (savedNav === "settings") return "appearance";
    if (savedNav === "gateway") return "providers";
    if (savedNav) return savedNav;
    return screen === "settings" ? "appearance" : screen;
  });
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(() => {
    const saved = localStorage.getItem("atelier.settingsSection");
    return saved === "terminal" ||
      saved === "appearance" ||
      saved === "profiles" ||
      saved === "shortcuts" ||
      saved === "preview" ||
      saved === "connections" ||
      saved === "updates"
      ? saved
      : "appearance";
  });

  const language = tw.language;

  useEffect(() => {
    localStorage.setItem("atelier.screen", screen);
  }, [screen]);

  useEffect(() => {
    localStorage.setItem("atelier.nav", activeNav);
  }, [activeNav]);

  useEffect(() => {
    localStorage.setItem("atelier.settingsSection", settingsSection);
  }, [settingsSection]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", tw.dark ? accent.dark : accent.light);
    root.style.setProperty("--accent-hover", accent.hover);
    document.body.classList.toggle("dark", tw.dark);
  }, [tw.dark, accent]);

  const openNav = (item: NavItem) => {
    setActiveNav(item.id);
    if (item.settingsSection) setSettingsSection(item.settingsSection);
    setScreen(item.screen);
  };

  return (
    <div
      className={cls(
        "h-full w-full flex overflow-hidden",
        tw.dark ? "bg-dbg text-dink" : "bg-cream text-ink",
      )}
    >
      <aside
        className={cls(
          "w-[248px] shrink-0 h-full border-r flex flex-col",
          tw.dark ? "bg-[#191917] border-dline" : "bg-[#f1efe7] border-line",
        )}
      >
        <button
          type="button"
          onClick={() =>
            openNav({
              id: "agent",
              screen: "agent",
              icon: I.terminal,
              labelKo: "Chat",
              labelEn: "Chat",
              hintKo: "Claude · Hermes · Codex",
              hintEn: "Claude · Hermes · Codex",
            })
          }
          className="mx-4 mt-4 mb-3 flex items-center gap-3 rounded-[8px] p-2 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-[21px] font-semibold text-[#fff7ec] shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
            style={{
              background:
                "radial-gradient(circle at 42% 45%, #3c3328 0%, #24231f 54%, #171713 100%)",
            }}
          >
            &gt;
          </span>
          <span className="min-w-0">
            <span className={cls("block text-[15px] font-semibold", tw.dark ? "text-dink" : "text-ink")}>
              Atelier
            </span>
            <span className={cls("block truncate text-[11px]", tw.dark ? "text-dsub" : "text-sub")}>
              Local agent workspace
            </span>
          </span>
        </button>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="mb-5">
              <div
                className={cls(
                  "mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]",
                  tw.dark ? "text-[#777773]" : "text-[#8d8980]",
                )}
              >
                {language === "en" ? group.labelEn : group.labelKo}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = activeNav === item.id && screen === item.screen;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openNav(item)}
                      className={cls(
                        "group grid w-full grid-cols-[22px_1fr] items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors",
                        active
                          ? tw.dark
                            ? "bg-dmuted text-dink shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                            : "bg-surface text-ink shadow-[0_0_0_1px_#e5e3db]"
                          : tw.dark
                            ? "text-dsub hover:bg-white/5 hover:text-dink"
                            : "text-sub hover:bg-black/5 hover:text-ink",
                      )}
                    >
                      <span
                        className={cls(
                          "flex h-6 w-6 items-center justify-center rounded-[6px] [&>svg]:h-[15px] [&>svg]:w-[15px]",
                          active
                            ? "text-[var(--accent)]"
                            : tw.dark
                              ? "text-[#85857e] group-hover:text-dink"
                              : "text-[#77736a] group-hover:text-ink",
                        )}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {language === "en" ? item.labelEn : item.labelKo}
                        </span>
                        <span
                          className={cls(
                            "mt-0.5 block truncate text-[11px]",
                            active
                              ? tw.dark
                                ? "text-dsub"
                                : "text-sub"
                              : tw.dark
                                ? "text-[#777773]"
                                : "text-[#98948a]",
                          )}
                        >
                          {language === "en" ? item.hintEn : item.hintKo}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cls(
            "mx-3 mb-3 border-t pt-3",
            tw.dark ? "border-dline" : "border-line",
          )}
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTw({ dark: !tw.dark })}
              className={cls(
                "h-9 rounded-[8px] border text-[12px] font-medium transition-colors flex items-center justify-center gap-2",
                tw.dark
                  ? "border-dline bg-dsurf text-dink hover:bg-dmuted"
                  : "border-line bg-surface text-ink hover:bg-muted",
              )}
            >
              <span className="[&>svg]:h-[14px] [&>svg]:w-[14px]">
                {tw.dark ? I.sun : I.moon}
              </span>
              {tw.dark ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={() =>
                openNav({
                  id: "appearance",
                  screen: "settings",
                  settingsSection: "appearance",
                  icon: I.gear,
                  labelKo: "Settings",
                  labelEn: "Settings",
                  hintKo: "외관 · 단축키",
                  hintEn: "Appearance · Keys",
                })
              }
              className={cls(
                "h-9 rounded-[8px] border text-[12px] font-medium transition-colors flex items-center justify-center gap-2",
                tw.dark
                  ? "border-dline bg-dsurf text-dink hover:bg-dmuted"
                  : "border-line bg-surface text-ink hover:bg-muted",
              )}
            >
              <span className="[&>svg]:h-[14px] [&>svg]:w-[14px]">{I.gear}</span>
              설정
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-h-0 relative">
        {/* Main과 Settings는 mount 유지 + display 토글. 화면 전환 시 탭/xterm
            상태(채팅 내역, 실행 중 claude 세션 등)가 초기화되는 현상 방지. */}
        <div
          className="absolute inset-0"
          style={{ display: screen === "agent" ? "block" : "none" }}
        >
          <AgentWorkspace tw={tw} />
        </div>
        <div
          className="absolute inset-0"
          style={{ display: screen === "main" ? "block" : "none" }}
        >
          <Main tw={tw} isActive={screen === "main"} />
        </div>
        <div
          className="absolute inset-0"
          style={{ display: screen === "settings" ? "block" : "none" }}
        >
          <Settings tw={tw} setTw={setTw} initialSection={settingsSection} />
        </div>
        {/* 디자인 모드 — lazy import. 클릭 전엔 chunk 미로드. */}
        {screen === "design" && (
          <Suspense
            fallback={
              <div
                className={cls(
                  "absolute inset-0 flex items-center justify-center text-[13px]",
                  tw.dark ? "text-dsub" : "text-sub",
                )}
              >
                Design 모드 로딩 중…
              </div>
            }
          >
            <div className="absolute inset-0">
              <DesignPage tw={tw} />
            </div>
          </Suspense>
        )}
        {screen === "welcome" && (
          <Welcome tw={tw} setScreen={(next) => setScreen(isScreen(next) ? next : "agent")} />
        )}
      </div>
    </div>
  );
};

export default App;
