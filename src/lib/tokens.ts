export const ACCENTS: Record<string, { light: string; hover: string; dark: string }> = {
  terracotta: { light: "#c96442", hover: "#b5573a", dark: "#da7756" },
  ink: { light: "#2d2d2d", hover: "#000000", dark: "#faf9f5" },
  olive: { light: "#6b7a3f", hover: "#57652f", dark: "#9aae63" },
  indigo: { light: "#4b5fbd", hover: "#3d4fa0", dark: "#7d8fe0" },
  plum: { light: "#8b4a73", hover: "#723c5e", dark: "#b473a0" },
};

export interface Profile {
  id: string;
  name: string;
  cmd: string;
  dot: string;
}

export const PROFILES: Profile[] = [
  { id: "claude", name: "Claude Code", cmd: "claude", dot: "#c96442" },
  { id: "pwsh", name: "PowerShell", cmd: "pwsh", dot: "#4b7bd1" },
  { id: "bash", name: "Bash", cmd: "bash", dot: "#6b9a4a" },
  { id: "cmd", name: "명령 프롬프트", cmd: "cmd.exe", dot: "#8a8a8a" },
  { id: "node", name: "Node REPL", cmd: "node", dot: "#7aa24a" },
  { id: "custom", name: "사용자 지정…", cmd: "", dot: "#b08a4a" },
];

export interface Tweaks {
  dark: boolean;
  accent: string;
  terminalFontPx: number;
  welcomeHeadline: string;
  welcomeSub: string;
  density: "cozy" | "compact";
  cursorStyle: "block" | "bar" | "underline";
}

export const DEFAULT_TWEAKS: Tweaks = {
  dark: false,
  accent: "terracotta",
  terminalFontPx: 13,
  welcomeHeadline: "당신의 명령어, 당신의 작업실.",
  welcomeSub: "스크린샷을 붙여넣고, 결과를 미리 보고, 더 빠르게 작업하세요.",
  density: "cozy",
  cursorStyle: "block",
};

export const cls = (...a: Array<string | false | null | undefined>) =>
  a.filter(Boolean).join(" ");
