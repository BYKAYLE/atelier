import type {
  GajecodeUpdateStatus,
  ManagedAgentRuntimeReadiness,
  ProviderPatchOutcome,
} from "./tauri";

type UpdateReadiness = Pick<
  ManagedAgentRuntimeReadiness,
  "ready" | "runtimePin" | "installedVersion"
>;

type UpdateStatus = Pick<
  GajecodeUpdateStatus,
  "installed" | "current_version"
>;

/**
 * A patch is complete only when the verified managed-runtime receipt and an
 * independent CLI status read agree on the patched version. The support pin is
 * a minimum baseline, not the install target: after a successful upstream
 * patch `installedVersion` is expected to be ahead of `runtimePin`.
 */
export function gajecodePatchMatchesReadiness(
  outcome: Pick<ProviderPatchOutcome, "toVersion">,
  readiness: UpdateReadiness,
  status: UpdateStatus,
): boolean {
  return Boolean(
    readiness.ready
      && status.installed
      && readiness.installedVersion === outcome.toVersion
      && status.current_version === outcome.toVersion,
  );
}
