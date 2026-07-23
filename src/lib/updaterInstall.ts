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
  // Older Atelier builds do not always report their bundle type. Omitting an
  // explicit target lets Tauri use the signed `windows-x86_64` compatibility
  // entry, which the release pipeline intentionally maps to the MSI updater.
  return undefined;
}

export function canUseInAppUpdaterForRuntime(
  isWindows: boolean,
  identity: UpdaterInstallIdentity | null,
): boolean {
  if (!isWindows) return identity?.githubUpdaterAvailable ?? true;
  return Boolean(
    identity &&
    identity.githubUpdaterAvailable &&
    !identity.windowsStoreLike
  );
}
