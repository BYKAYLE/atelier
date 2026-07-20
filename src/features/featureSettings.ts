import { useCallback, useEffect, useState } from "react";
import { safeLocalStorageGet, safeLocalStorageSet } from "../lib/storage";

export type FeatureSettingValue = boolean | number | string;
export type FeatureSettingKind = "toggle" | "select" | "number" | "locked";

export interface LocalizedFeatureText {
  ko: string;
  en: string;
}

export interface FeatureSettingOption {
  value: FeatureSettingValue;
  label: LocalizedFeatureText;
}

export interface FeatureSettingDefinition {
  key: string;
  kind: FeatureSettingKind;
  label: LocalizedFeatureText;
  hint?: LocalizedFeatureText;
  defaultValue: FeatureSettingValue;
  options?: FeatureSettingOption[];
  min?: number;
  max?: number;
  step?: number;
  lockedReason?: LocalizedFeatureText;
}

export interface FeatureSettingsContribution {
  title: LocalizedFeatureText;
  description: LocalizedFeatureText;
  settings: FeatureSettingDefinition[];
}

interface FeatureSettingsStore {
  version: 1;
  values: Record<string, Record<string, FeatureSettingValue>>;
}

const STORAGE_KEY = "atelier.featureSettings.v1";
const STORE_VERSION = 1 as const;
const listeners = new Set<() => void>();
let cachedStore: FeatureSettingsStore | null = null;

function isSettingValue(value: unknown): value is FeatureSettingValue {
  return typeof value === "boolean"
    || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

function sanitizeValues(value: unknown): FeatureSettingsStore["values"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const modules: FeatureSettingsStore["values"] = {};
  for (const [moduleId, moduleValue] of Object.entries(value)) {
    if (!moduleValue || typeof moduleValue !== "object" || Array.isArray(moduleValue)) continue;
    const settings: Record<string, FeatureSettingValue> = {};
    for (const [key, settingValue] of Object.entries(moduleValue)) {
      if (isSettingValue(settingValue)) settings[key] = settingValue;
    }
    if (Object.keys(settings).length > 0) modules[moduleId] = settings;
  }
  return modules;
}

function loadStore(): FeatureSettingsStore {
  if (cachedStore) return cachedStore;
  const raw = safeLocalStorageGet(STORAGE_KEY);
  if (!raw) {
    cachedStore = { version: STORE_VERSION, values: {} };
    return cachedStore;
  }

  try {
    const parsed = JSON.parse(raw) as { version?: unknown; values?: unknown } | null;
    const source = parsed && typeof parsed === "object" && "values" in parsed
      ? parsed.values
      : parsed;
    cachedStore = { version: STORE_VERSION, values: sanitizeValues(source) };
    if (parsed?.version !== STORE_VERSION) persistStore(cachedStore);
  } catch (error) {
    console.warn("Feature settings migration skipped invalid storage", error);
    cachedStore = { version: STORE_VERSION, values: {} };
  }
  return cachedStore;
}

function persistStore(store: FeatureSettingsStore) {
  cachedStore = store;
  safeLocalStorageSet(STORAGE_KEY, JSON.stringify(store));
}

function notifyListeners() {
  for (const listener of listeners) listener();
}

function sameValueType(value: FeatureSettingValue, fallback: FeatureSettingValue) {
  return typeof value === typeof fallback;
}

export function getFeatureSetting<T extends FeatureSettingValue>(
  moduleId: string,
  key: string,
  fallback: T,
): T {
  const value = loadStore().values[moduleId]?.[key];
  return value !== undefined && sameValueType(value, fallback) ? value as T : fallback;
}

export function setFeatureSetting(
  moduleId: string,
  key: string,
  value: FeatureSettingValue,
) {
  const current = loadStore();
  persistStore({
    version: STORE_VERSION,
    values: {
      ...current.values,
      [moduleId]: {
        ...(current.values[moduleId] ?? {}),
        [key]: value,
      },
    },
  });
  notifyListeners();
}

export function resetFeatureSettings(moduleId: string) {
  const current = loadStore();
  if (!(moduleId in current.values)) return;
  const values = { ...current.values };
  delete values[moduleId];
  persistStore({ version: STORE_VERSION, values });
  notifyListeners();
}

export function subscribeFeatureSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFeatureSettingsRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeFeatureSettings(() => setRevision((value) => value + 1)), []);
  return revision;
}

export function useFeatureSetting<T extends FeatureSettingValue>(
  moduleId: string,
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const revision = useFeatureSettingsRevision();
  const value = getFeatureSetting(moduleId, key, fallback);
  const update = useCallback((nextValue: T) => {
    setFeatureSetting(moduleId, key, nextValue);
  }, [key, moduleId]);
  void revision;
  return [value, update];
}
