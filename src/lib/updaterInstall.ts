export interface UpdaterInstallIdentity {
  bundleType?: string | null;
  githubUpdaterAvailable: boolean;
  windowsStoreLike: boolean;
}

export type WindowsUpdaterTarget =
  | "windows-x86_64-msi"
  | "windows-x86_64-nsis"
  | undefined;

export function resolveWindowsUpdaterTarget(
  isWindows: boolean,
  identity: UpdaterInstallIdentity | null,
): WindowsUpdaterTarget {
  if (!isWindows) return undefined;
  const bundleType = identity?.bundleType?.trim().toLowerCase();
  if (bundleType === "msi") return "windows-x86_64-msi";
  if (bundleType === "nsis") return "windows-x86_64-nsis";
  // Never guess the installer family. An MSI update applied to an NSIS install
  // can create a second application identity and reopen an older installation.
  return undefined;
}

export function canUseInAppUpdaterForRuntime(
  isWindows: boolean,
  identity: UpdaterInstallIdentity | null,
): boolean {
  if (!isWindows) return identity?.githubUpdaterAvailable ?? true;
  const bundleType = identity?.bundleType?.trim().toLowerCase();
  return Boolean(
    identity &&
    identity.githubUpdaterAvailable &&
    !identity.windowsStoreLike &&
    (bundleType === "msi" || bundleType === "nsis")
  );
}
