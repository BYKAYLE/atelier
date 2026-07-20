import type { ProviderCliInstallState, ProviderStatus } from "../../lib/tauri";

export type CliInstallOutcome = "idle" | "started" | "running" | "succeeded" | "failed";

export function isCliInstallActive(state?: ProviderCliInstallState | null): boolean {
  return state?.phase === "started" || state?.phase === "running";
}

export function cliInstallOutcome(status?: ProviderStatus | null): CliInstallOutcome {
  if (status?.cli_installed) return "succeeded";
  return status?.install_state?.phase ?? "idle";
}

export function cliInstallErrorMessage(state?: ProviderCliInstallState | null): string | null {
  if (state?.phase !== "failed") return null;
  const detail = state.detail?.trim();
  return detail && detail.length > 0 ? detail : "CLI installation failed.";
}
