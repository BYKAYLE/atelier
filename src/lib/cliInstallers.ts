import { AppLanguage, PLATFORM, Profile } from "./tokens";

type AutoInstallTarget = NonNullable<Profile["autoInstall"]>;

const INSTALLS: Record<
  AutoInstallTarget,
  { executable: string; npmPackage?: string; displayName: string }
> = {
  claude: {
    executable: "claude",
    npmPackage: "@anthropic-ai/claude-code",
    displayName: "Claude Code",
  },
  hermes: {
    executable: "hermes",
    displayName: "Hermes",
  },
  codex: {
    executable: "codex",
    npmPackage: "@openai/codex",
    displayName: "Codex CLI",
  },
};

const shQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const psQuote = (value: string) => `"${value.replace(/`/g, "``").replace(/"/g, '`"')}"`;

export function autoInstallExecutable(profile: Profile): string | null {
  return profile.autoInstall ? INSTALLS[profile.autoInstall].executable : null;
}

export function autoInstallCommand(
  profile: Profile,
  language: AppLanguage,
  runAfterInstall?: string,
): string | null {
  if (!profile.autoInstall) return null;
  const spec = INSTALLS[profile.autoInstall];
  const runCommand = (runAfterInstall?.trim() || spec.executable).replace(/\s+/g, " ");
  const installing =
    language === "en"
      ? `Atelier: ${spec.displayName} is not installed. Installing now...`
      : `Atelier: ${spec.displayName}이 설치되어 있지 않아 설치를 시작합니다...`;
  const starting =
    language === "en"
      ? `Atelier: installation finished. Starting ${spec.displayName}...`
      : `Atelier: 설치가 끝났습니다. ${spec.displayName}을 시작합니다...`;
  const missingNpm =
    language === "en"
      ? "Atelier: npm was not found. Install Node.js/npm first, then try again."
      : "Atelier: npm을 찾지 못했습니다. Node.js/npm 설치 후 다시 실행하세요.";

  if (spec.npmPackage) {
    if (PLATFORM === "windows") {
      const script = [
        "$ErrorActionPreference='Stop'",
        `Write-Host '${installing}'`,
        `if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Error '${missingNpm}' }`,
        `npm install -g ${spec.npmPackage}`,
        `Write-Host '${starting}'`,
        runCommand,
      ].join("; ");
      return `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ${psQuote(script)}`;
    }
    const script = [
      "set -e",
      `echo "${installing}"`,
      `if ! command -v npm >/dev/null 2>&1; then echo "${missingNpm}"; exit 127; fi`,
      `npm install -g ${spec.npmPackage}`,
      `echo "${starting}"`,
      `exec ${runCommand}`,
    ].join("; ");
    return `bash -lc ${shQuote(script)}`;
  }

  const hermesInstall = "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash";
  if (PLATFORM === "windows") {
    const missingWsl =
      language === "en"
        ? "Atelier: Hermes Agent uses the WSL2 workflow on Windows. Install WSL2 first, then try again."
        : "Atelier: Windows에서 Hermes Agent는 WSL2 흐름을 사용합니다. WSL2 설치 후 다시 실행하세요.";
    const wslScript = `${hermesInstall}; export PATH=$HOME/.local/bin:$HOME/bin:$PATH; hermes setup; exec ${runCommand}`;
    const script = [
      "$ErrorActionPreference='Stop'",
      `Write-Host '${installing}'`,
      `if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { Write-Error '${missingWsl}' }`,
      `wsl bash -lc '${wslScript}'`,
    ].join("; ");
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ${psQuote(script)}`;
  }

  const script = [
    "set -e",
    `echo "${installing}"`,
    `if ! command -v curl >/dev/null 2>&1; then echo "Atelier: curl not found."; exit 127; fi`,
    hermesInstall,
    "export PATH=$HOME/.local/bin:$HOME/bin:$PATH",
    `echo "${starting}"`,
    "hermes setup",
    `exec ${runCommand}`,
  ].join("; ");
  return `bash -lc ${shQuote(script)}`;
}
