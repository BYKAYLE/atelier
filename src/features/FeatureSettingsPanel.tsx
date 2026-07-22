import React, { useEffect, useState } from "react";
import { cls, type Tweaks } from "../lib/tokens";
import { registeredFeatureModules } from "./featureRegistry";
import {
  getFeatureSetting,
  resetFeatureSettings,
  setFeatureSetting,
  type FeatureSettingDefinition,
  type FeatureSettingValue,
  useFeatureSettingsRevision,
} from "./featureSettings";

interface Props {
  tw: Tweaks;
}

function labelFor(value: { ko: string; en: string }, language: "ko" | "en") {
  return value[language];
}

function normalizedNumber(definition: FeatureSettingDefinition, raw: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return definition.defaultValue;
  return Math.min(definition.max ?? parsed, Math.max(definition.min ?? parsed, parsed));
}

const FeatureSettingsPanel: React.FC<Props> = ({ tw }) => {
  useFeatureSettingsRevision();
  const language = tw.language;
  const dark = tw.dark;
  const modules = registeredFeatureModules().filter((module) => module.settings);
  const moduleIds = modules.map((module) => module.id).join("|");
  const [selectedModuleId, setSelectedModuleId] = useState(() => modules[0]?.id ?? "");

  useEffect(() => {
    if (modules.some((module) => module.id === selectedModuleId)) return;
    setSelectedModuleId(modules[0]?.id ?? "");
  }, [moduleIds, modules, selectedModuleId]);

  const selectedModule = modules.find((module) => module.id === selectedModuleId) ?? modules[0];
  const contribution = selectedModule?.settings;
  const enabledDefinition = contribution?.settings.find((setting) => setting.key === "enabled");
  const enabled = selectedModule && enabledDefinition
    ? getFeatureSetting(selectedModule.id, "enabled", enabledDefinition.defaultValue) !== false
    : true;

  return (
    <div data-testid="feature-settings-panel">
      <div className="mb-8">
        <h1 className={cls("font-display text-[32px] font-medium leading-tight", dark ? "text-dink" : "text-ink")}>
          {language === "ko" ? "기능 설정" : "Feature settings"}
        </h1>
        <p className={cls("mt-2 text-[14px]", dark ? "text-dsub" : "text-sub")}>
          {language === "ko"
            ? "독립 기능의 기본 동작을 조정합니다. 안전 정책은 변경할 수 없습니다."
            : "Configure independent features. Safety policies remain locked."}
        </p>
      </div>

      {selectedModule && contribution ? (
        <div className="space-y-3">
          <div
            data-testid="feature-module-picker"
            className={cls(
              "overflow-hidden rounded-lg border",
              dark ? "border-dline bg-dpanel" : "border-line bg-panel",
            )}
          >
            <div className={cls("flex min-h-11 flex-wrap items-center gap-2 border-b px-3 py-2", dark ? "border-dline" : "border-line")}>
              <span className="text-[12.5px] font-semibold">
                {language === "ko" ? "기능 선택" : "Choose a feature"}
              </span>
              <span className={cls("text-[11px]", dark ? "text-dsub" : "text-sub")}>
                {language === "ko" ? `${modules.length}개 기능` : `${modules.length} features`}
              </span>
              <span className="flex-1" />
              <span className={cls("inline-flex items-center gap-1.5 text-[11px]", dark ? "text-dsub" : "text-sub")}>
                <span className={cls("h-1.5 w-1.5 rounded-full", enabled ? "bg-emerald-500" : dark ? "bg-dsub" : "bg-sub")} />
                {enabled ? (language === "ko" ? "사용 중" : "Enabled") : (language === "ko" ? "중지됨" : "Disabled")}
              </span>
              <button
                type="button"
                onClick={() => resetFeatureSettings(selectedModule.id)}
                className={cls(
                  "h-8 shrink-0 rounded-md border px-3 text-[11.5px] transition-colors",
                  dark
                    ? "border-dline text-dsub hover:bg-dmuted hover:text-dink"
                    : "border-line text-sub hover:bg-surface hover:text-ink",
                )}
              >
                {language === "ko" ? "기본값" : "Reset"}
              </button>
            </div>

            <div
              data-testid="feature-module-options"
              className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 md:grid-cols-5"
            >
              {modules.map((module) => {
                const moduleEnabledDefinition = module.settings!.settings.find((setting) => setting.key === "enabled");
                const moduleEnabled = moduleEnabledDefinition
                  ? getFeatureSetting(module.id, "enabled", moduleEnabledDefinition.defaultValue) !== false
                  : true;
                const selected = module.id === selectedModule.id;
                return (
                  <button
                    key={module.id}
                    type="button"
                    data-feature-module-option={module.id}
                    aria-pressed={selected}
                    onClick={() => setSelectedModuleId(module.id)}
                    className={cls(
                      "flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : dark
                          ? "border-dline bg-dmuted/30 text-dink hover:border-[var(--accent-hover)] hover:bg-dmuted"
                          : "border-line bg-surface/40 text-ink hover:border-[var(--accent-hover)] hover:bg-surface",
                    )}
                  >
                    <span
                      className={cls(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        moduleEnabled ? "bg-emerald-500" : dark ? "bg-dsub" : "bg-sub",
                      )}
                    />
                    <span className="min-w-0 truncate text-[11.5px] font-medium">
                      {labelFor(module.settings!.title, language)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <section
            data-feature-module={selectedModule.id}
            data-testid="selected-feature-settings"
            className={cls("overflow-hidden rounded-lg border", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}
          >
            <header className={cls("border-b px-4 py-3", dark ? "border-dline" : "border-line")}>
              <h2 className="text-[14px] font-semibold">{labelFor(contribution.title, language)}</h2>
              <p className={cls("mt-1 text-[12px] leading-relaxed", dark ? "text-dsub" : "text-sub")}>
                {labelFor(contribution.description, language)}
              </p>
            </header>

            <div className="divide-y divide-[color:var(--feature-setting-divider)] [--feature-setting-divider:#dedbd2] dark:[--feature-setting-divider:#3a3a37]">
              {contribution.settings.map((definition) => {
                const value = getFeatureSetting(selectedModule.id, definition.key, definition.defaultValue);
                const locked = definition.kind === "locked";
                const disabled = locked || (definition.key !== "enabled" && !enabled);
                return (
                  <div key={definition.key} className="flex min-h-[60px] min-w-0 items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className={cls("text-[13px] font-medium", disabled && !locked && "opacity-50")}>
                        {labelFor(definition.label, language)}
                      </div>
                      {definition.hint && (
                        <p className={cls("mt-0.5 text-[11.5px] leading-relaxed", dark ? "text-dsub" : "text-sub", disabled && !locked && "opacity-50")}>
                          {labelFor(definition.hint, language)}
                        </p>
                      )}
                      {locked && definition.lockedReason && (
                        <p className="mt-1 text-[10.5px] text-amber-600">
                          {labelFor(definition.lockedReason, language)}
                        </p>
                      )}
                    </div>
                    <SettingControl
                      dark={dark}
                      language={language}
                      definition={definition}
                      value={value}
                      disabled={disabled}
                      onChange={(nextValue) => setFeatureSetting(selectedModule.id, definition.key, nextValue)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className={cls("rounded-lg border px-4 py-6 text-[12.5px]", dark ? "border-dline text-dsub" : "border-line text-sub")}>
          {language === "ko" ? "설정 가능한 기능이 없습니다." : "No configurable features are available."}
        </div>
      )}
    </div>
  );
};

const SettingControl: React.FC<{
  dark: boolean;
  language: "ko" | "en";
  definition: FeatureSettingDefinition;
  value: FeatureSettingValue;
  disabled: boolean;
  onChange: (value: FeatureSettingValue) => void;
}> = ({ dark, language, definition, value, disabled, onChange }) => {
  const controlClass = cls(
    "h-9 min-w-[150px] rounded-md border bg-transparent px-3 text-[12px] outline-none disabled:cursor-not-allowed disabled:opacity-50",
    dark ? "border-dline text-dink" : "border-line text-ink",
  );

  if (definition.kind === "toggle") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(value)}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cls(
          "relative h-6 w-11 shrink-0 overflow-hidden rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          value ? "border-[var(--accent)] bg-[var(--accent)]" : dark ? "border-dline bg-dmuted" : "border-line bg-muted",
        )}
      >
        <span
          aria-hidden="true"
          className={cls(
            "pointer-events-none absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-transform",
            value ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    );
  }

  if (definition.kind === "select") {
    return (
      <select
        className={controlClass}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => {
          const selected = definition.options?.find((option) => String(option.value) === event.target.value);
          if (selected) onChange(selected.value);
        }}
      >
        {(definition.options ?? []).map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {labelFor(option.label, language)}
          </option>
        ))}
      </select>
    );
  }

  if (definition.kind === "number") {
    return (
      <input
        type="number"
        className={cls(controlClass, "min-w-[110px] w-[110px]")}
        value={Number(value)}
        min={definition.min}
        max={definition.max}
        step={definition.step}
        disabled={disabled}
        onChange={(event) => onChange(normalizedNumber(definition, event.target.value))}
      />
    );
  }

  const option = definition.options?.find((candidate) => candidate.value === value);
  return (
    <span className={cls("rounded-md border px-3 py-2 text-[11.5px]", dark ? "border-dline text-dsub" : "border-line text-sub")}>
      {option ? labelFor(option.label, language) : value ? (language === "ko" ? "필수" : "Required") : (language === "ko" ? "꺼짐" : "Off")}
    </span>
  );
};

export default FeatureSettingsPanel;
