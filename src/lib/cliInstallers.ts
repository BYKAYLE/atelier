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
    executable: "",
  },
};

export function autoInstallExecutable(profile: Profile): string | null {
  if (profile.autoInstall === "gajecode") return null;
  return profile.autoInstall ? INSTALLS[profile.autoInstall].executable : null;
}
