import type { SourceControlFeature } from "../../features/featureRegistry";

export function findSourceControlFeature(
  features: readonly SourceControlFeature[],
  panelId: string | null,
): SourceControlFeature | undefined {
  if (!panelId) return undefined;
  return features.find((feature) => feature.id === panelId);
}

export function resolveExternalPanel(
  features: readonly SourceControlFeature[],
  panelId: string | null,
): string | null {
  if (!panelId) return null;
  return findSourceControlFeature(features, panelId)?.id ?? null;
}
