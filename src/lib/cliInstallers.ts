import { Profile } from "./tokens";

type AutoInstallTarget = NonNullable<Profile["autoInstall"]>;

const INSTALLS: Record<
  AutoInstallTarget,
  { executable: string }
> = {
  claude: {
    executable: "claude",
  },
  hermes: {
    executable: "hermes",
  },
  codex: {
    executable: "codex",
  },
  gajecode: {
    executable: "gjc",
  },
  grok: {
    executable: "grok",
  },
};

export function autoInstallExecutable(profile: Profile): string | null {
  return profile.autoInstall ? INSTALLS[profile.autoInstall].executable : null;
}
