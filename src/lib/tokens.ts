export const ACCENTS: Record<string, { light: string; hover: string; dark: string }> = {
  terracotta: { light: "#c96442", hover: "#b5573a", dark: "#da7756" },
  ink: { light: "#2d2d2d", hover: "#000000", dark: "#faf9f5" },
  olive: { light: "#6b7a3f", hover: "#57652f", dark: "#9aae63" },
  indigo: { light: "#4b5fbd", hover: "#3d4fa0", dark: "#7d8fe0" },
  plum: { light: "#8b4a73", hover: "#723c5e", dark: "#b473a0" },
};

export type PlatformOS = "macos" | "windows" | "linux";

const detectPlatform = (): PlatformOS => {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  return "linux";
};

export const PLATFORM: PlatformOS = detectPlatform();
export const IS_MAC = PLATFORM === "macos";
// 플랫폼별 modifier 키 UI 라벨. paste 이벤트는 WebView가 OS 단축키를 자동 처리하므로 라벨만 바꾸면 됨.
export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

export interface Profile {
  id: string;
  name: string;
  cmd: string;
  dot: string;
}

interface ProfileDef extends Profile {
  platforms: PlatformOS[];
}

const ALL_PROFILES: ProfileDef[] = [
  { id: "claude", name: "Claude Code", cmd: "claude", dot: "#c96442", platforms: ["macos", "windows", "linux"] },
  { id: "zsh", name: "Zsh", cmd: "zsh", dot: "#9aae63", platforms: ["macos", "linux"] },
  { id: "bash", name: "Bash", cmd: "bash", dot: "#6b9a4a", platforms: ["macos", "linux", "windows"] },
  { id: "pwsh", name: "PowerShell", cmd: "pwsh", dot: "#4b7bd1", platforms: ["windows", "macos", "linux"] },
  { id: "cmd", name: "명령 프롬프트", cmd: "cmd.exe", dot: "#8a8a8a", platforms: ["windows"] },
  { id: "node", name: "Node REPL", cmd: "node", dot: "#7aa24a", platforms: ["macos", "windows", "linux"] },
  { id: "custom", name: "사용자 지정…", cmd: "", dot: "#b08a4a", platforms: ["macos", "windows", "linux"] },
];

export const PROFILES: Profile[] = ALL_PROFILES
  .filter((p) => p.platforms.includes(PLATFORM))
  .map(({ platforms: _platforms, ...rest }) => rest);

export interface Tweaks {
  dark: boolean;
  accent: string;
  terminalFontPx: number;
  welcomeHeadline: string;
  welcomeSub: string;
  density: "cozy" | "compact";
  cursorStyle: "block" | "bar" | "underline";
  // 사용자 커스터마이징 가능한 터미널 프로파일 리스트. 설정 > 프로필에서 CRUD.
  profiles: Profile[];
}

export const DEFAULT_TWEAKS: Tweaks = {
  dark: false,
  accent: "terracotta",
  terminalFontPx: 13,
  welcomeHeadline: "당신의 명령어, 당신의 작업실.",
  welcomeSub: "스크린샷을 붙여넣고, 결과를 미리 보고, 더 빠르게 작업하세요.",
  density: "cozy",
  cursorStyle: "block",
  profiles: PROFILES.filter((p) => p.id !== "custom"),
};

export const cls = (...a: Array<string | false | null | undefined>) =>
  a.filter(Boolean).join(" ");
