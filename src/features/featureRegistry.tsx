import React from "react";
import type { AgentProvider, AtelierControlRequest } from "../lib/tauri";
import type { Tweaks } from "../lib/tokens";

export type FeaturePanelSlot = "connections" | "settings.remote";

export interface FeaturePanelProps {
  tw: Tweaks;
}

export interface FeaturePanelContribution {
  slot: FeaturePanelSlot;
  order?: number;
  component: React.ComponentType<FeaturePanelProps>;
}

export interface SourceControlFeatureProps {
  dark: boolean;
  language: "ko" | "en";
  rootPath: string;
  onClose: () => void;
}

export interface SourceControlFeature {
  id: string;
  order?: number;
  shortLabel: string;
  title: { ko: string; en: string };
  component: React.ComponentType<SourceControlFeatureProps>;
}

export interface NormalizedFeatureControlTask {
  provider: AgentProvider;
  prompt: string;
  workspace: string;
  model?: string;
  effort?: string;
  permissionMode?: string;
  stellaMode: boolean;
}

export type ControlTaskNormalizer = (
  request: AtelierControlRequest,
  fallbackWorkspace: string,
) => NormalizedFeatureControlTask;

export interface FeatureModule {
  id: string;
  order?: number;
  panels?: FeaturePanelContribution[];
  sourceControl?: SourceControlFeature;
  controlTaskNormalizer?: ControlTaskNormalizer;
}

type FeatureModuleExport = {
  default?: FeatureModule;
  feature?: FeatureModule;
};

const discovered = import.meta.glob<FeatureModuleExport>(
  "../components/**/feature.tsx",
  { eager: true },
);

const configuredFeatureIds = String(import.meta.env.VITE_ATELIER_FEATURES || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const enabledFeatureIds = configuredFeatureIds.length > 0
  ? new Set(configuredFeatureIds)
  : null;

const featureModules = Object.entries(discovered)
  .map(([path, exports]) => ({ path, module: exports.default ?? exports.feature }))
  .filter((entry): entry is { path: string; module: FeatureModule } => Boolean(entry.module))
  .filter(({ module }) => !enabledFeatureIds || enabledFeatureIds.has(module.id))
  .sort((left, right) => {
    const order = (left.module.order ?? 100) - (right.module.order ?? 100);
    return order || left.module.id.localeCompare(right.module.id);
  });

const duplicateIds = featureModules
  .map((entry) => entry.module.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);

if (duplicateIds.length > 0) {
  throw new Error(`Duplicate Atelier feature module id: ${[...new Set(duplicateIds)].join(", ")}`);
}

export function registeredFeatureModules(): readonly FeatureModule[] {
  return featureModules.map((entry) => entry.module);
}

export function FeaturePanels({ slot, tw }: FeaturePanelProps & { slot: FeaturePanelSlot }) {
  const panels = featureModules
    .flatMap(({ module }) => (module.panels ?? []).map((panel) => ({ module, panel })))
    .filter(({ panel }) => panel.slot === slot)
    .sort((left, right) => {
      const order = (left.panel.order ?? left.module.order ?? 100)
        - (right.panel.order ?? right.module.order ?? 100);
      return order || left.module.id.localeCompare(right.module.id);
    });

  return (
    <>
      {panels.map(({ module, panel }, index) => {
        const Panel = panel.component;
        return <Panel key={`${module.id}:${slot}:${index}`} tw={tw} />;
      })}
    </>
  );
}

export function sourceControlFeatures(): readonly SourceControlFeature[] {
  return featureModules
    .flatMap(({ module }) => module.sourceControl ? [module.sourceControl] : [])
    .sort((left, right) => {
      const order = (left.order ?? 100) - (right.order ?? 100);
      return order || left.id.localeCompare(right.id);
    });
}

export function normalizeFeatureControlTask(
  request: AtelierControlRequest,
  fallbackWorkspace: string,
): NormalizedFeatureControlTask {
  const normalizers = featureModules
    .flatMap(({ module }) => module.controlTaskNormalizer ? [module.controlTaskNormalizer] : []);
  if (normalizers.length === 0) {
    throw new Error("The Atelier CLI feature module is not installed.");
  }
  if (normalizers.length > 1) {
    throw new Error("More than one Atelier CLI control-task normalizer is registered.");
  }
  return normalizers[0](request, fallbackWorkspace);
}
