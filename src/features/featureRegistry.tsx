import React from "react";
import discoveredFeatureModules from "virtual:atelier-feature-modules";
import type { AgentProvider, AtelierControlRequest } from "../lib/tauri";
import type { StageModelAssignments } from "../lib/stellaStageModels";
import type { Tweaks } from "../lib/tokens";
import { getFeatureSetting, type FeatureSettingsContribution } from "./featureSettings";

export type FeaturePanelSlot = "connections" | "settings.remote";

export interface FeaturePackageManifest {
  schemaVersion: 1;
  id: string;
  rustFeature: string;
  rustModule: string;
  smokeScript: string;
  dependencies: string[];
}

export interface FeaturePanelProps {
  tw: Tweaks;
}

export interface FeaturePanelContribution {
  slot: FeaturePanelSlot;
  order?: number;
  component: React.ComponentType<FeaturePanelProps>;
}

export interface FeatureSettingsPageContribution {
  id: string;
  order?: number;
  icon: React.ReactNode;
  title: { ko: string; en: string };
  hint: { ko: string; en: string };
  component: React.ComponentType<FeaturePanelProps>;
}

export interface SourceControlFeatureProps {
  dark: boolean;
  language: "ko" | "en";
  rootPath: string;
  onStartWorkItem: (item: SourceControlWorkItem) => void | Promise<void>;
  onClose: () => void;
}

export interface SourceControlWorkItem {
  source: "github" | "linear";
  kind: "issue" | "pull_request";
  externalId: string;
  title: string;
  url: string;
  workspace: string;
  prompt: string;
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
  /** Stella Mode 단계별 모델 배정 (`--stage-models`) — 오버라이드가 있을 때만 존재. */
  stageModels?: StageModelAssignments;
}

export type ControlTaskNormalizer = (
  request: AtelierControlRequest,
  fallbackWorkspace: string,
) => NormalizedFeatureControlTask;

export interface FeatureControlRequestResult {
  summary: string;
  detail?: unknown;
}

export type FeatureControlRequestHandler = (
  request: AtelierControlRequest,
) => Promise<FeatureControlRequestResult | null>;

export interface FeatureModule {
  id: string;
  order?: number;
  settings?: FeatureSettingsContribution;
  settingsPage?: FeatureSettingsPageContribution;
  background?: React.ComponentType<FeaturePanelProps>;
  panels?: FeaturePanelContribution[];
  sourceControl?: SourceControlFeature;
  controlTaskNormalizer?: ControlTaskNormalizer;
  controlRequestHandler?: FeatureControlRequestHandler;
}

const featureModules = [...discoveredFeatureModules]
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

const registeredIds = new Set(featureModules.map((entry) => entry.module.id));
for (const entry of featureModules) {
  if (entry.module.id !== entry.manifest.id) {
    throw new Error(
      `Atelier feature descriptor ${entry.module.id} does not match manifest ${entry.manifest.id}`,
    );
  }
  const missingDependencies = entry.manifest.dependencies.filter((id) => !registeredIds.has(id));
  if (missingDependencies.length > 0) {
    throw new Error(
      `Atelier feature ${entry.module.id} is missing dependencies: ${missingDependencies.join(", ")}`,
    );
  }
}

const duplicateSettingsPageIds = featureModules
  .flatMap(({ module }) => module.settingsPage ? [module.settingsPage.id] : [])
  .filter((id, index, ids) => ids.indexOf(id) !== index);

if (duplicateSettingsPageIds.length > 0) {
  throw new Error(
    `Duplicate Atelier feature settings page id: ${[...new Set(duplicateSettingsPageIds)].join(", ")}`,
  );
}

export function registeredFeatureModules(): readonly FeatureModule[] {
  return featureModules.map((entry) => entry.module);
}

export function featureSettingsPages(): readonly FeatureSettingsPageContribution[] {
  return featureModules
    .flatMap(({ module }) => module.settingsPage ? [module.settingsPage] : [])
    .sort((left, right) => {
      const order = (left.order ?? 100) - (right.order ?? 100);
      return order || left.id.localeCompare(right.id);
    });
}

export function FeatureSettingsPage({ section, tw }: FeaturePanelProps & { section: string }) {
  const contribution = featureSettingsPages().find((page) => page.id === section);
  if (!contribution) return null;
  const Page = contribution.component;
  return <Page tw={tw} />;
}

export function FeatureBackgrounds({ tw }: FeaturePanelProps) {
  return (
    <>
      {featureModules.map(({ module }) => {
        if (!module.background) return null;
        const Background = module.background;
        return <Background key={`${module.id}:background`} tw={tw} />;
      })}
    </>
  );
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
    .flatMap(({ module }) => {
      if (!module.sourceControl) return [];
      const enabledSetting = module.settings?.settings.find((setting) => setting.key === "enabled");
      const enabled = enabledSetting
        ? getFeatureSetting(module.id, "enabled", enabledSetting.defaultValue) !== false
        : true;
      return enabled ? [module.sourceControl] : [];
    })
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

export async function handleFeatureControlRequest(
  request: AtelierControlRequest,
): Promise<FeatureControlRequestResult | null> {
  for (const handler of featureModules.flatMap(({ module }) =>
    module.controlRequestHandler ? [module.controlRequestHandler] : []
  )) {
    const result = await handler(request);
    if (result) return result;
  }
  return null;
}
