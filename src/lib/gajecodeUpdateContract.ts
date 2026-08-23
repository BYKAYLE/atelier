import type {
  GajecodeUpdateStatus,
  ManagedAgentRuntimeReadiness,
} from "./tauri";

type UpdateReadiness = Pick<
  ManagedAgentRuntimeReadiness,
  "ready" | "runtimePin"
>;

type UpdateStatus = Pick<
  GajecodeUpdateStatus,
  "installed" | "current_version" | "latest_version" | "update_available"
>;

/**
 * An update is complete only when the verified managed-runtime receipt and an
 * independent CLI status read agree on the same Atelier support pin.
 */
export function gajecodeUpdateMatchesReadiness(
  readiness: UpdateReadiness,
  status: UpdateStatus,
): boolean {
  return Boolean(
    readiness.ready
      && status.installed
      && !status.update_available
      && status.current_version === readiness.runtimePin
      && status.latest_version === readiness.runtimePin,
  );
}
