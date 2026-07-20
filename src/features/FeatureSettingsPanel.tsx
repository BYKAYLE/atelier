import React from "react";
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

      <div className="space-y-4">
        {modules.map((module) => {
          const contribution = module.settings!;
          const enabledDefinition = contribution.settings.find((setting) => setting.key === "enabled");
          const enabled = enabledDefinition
            ? getFeatureSetting(module.id, "enabled", enabledDefinition.defaultValue) !== false
            : true;
          return (
            <section
              key={module.id}
              data-feature-module={module.id}
              className={cls("overflow-hidden rounded-lg border", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}
            >
              <header className={cls("flex items-start justify-between gap-4 border-b px-4 py-3.5", dark ? "border-dline" : "border-line")}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[14px] font-semibold">{labelFor(contribution.title, language)}</h2>
                    <span className={cls("rounded-full border px-2 py-0.5 text-[10px]", dark ? "border-dline text-dsub" : "border-line text-sub")}>
                      {enabled ? (language === "ko" ? "사용" : "Enabled") : (language === "ko" ? "중지" : "Disabled")}
                    </span>
                  </div>
                  <p className={cls("mt-1 text-[12px] leading-relaxed", dark ? "text-dsub" : "text-sub")}>
                    {labelFor(contribution.description, language)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => resetFeatureSettings(module.id)}
                  className={cls("h-8 shrink-0 rounded-md border px-3 text-[11.5px]", dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink")}
                >
                  {language === "ko" ? "기본값" : "Reset"}
                </button>
              </header>

              <div className="divide-y divide-[color:var(--feature-setting-divider)] [--feature-setting-divider:#dedbd2] dark:[--feature-setting-divider:#3a3a37]">
                {contribution.settings.map((definition) => {
                  const value = getFeatureSetting(module.id, definition.key, definition.defaultValue);
                  const locked = definition.kind === "locked";
                  const disabled = locked || (definition.key !== "enabled" && !enabled);
                  return (
                    <div key={definition.key} className="flex min-h-[72px] min-w-0 items-center gap-6 px-4 py-3.5">
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
                        onChange={(nextValue) => setFeatureSetting(module.id, definition.key, nextValue)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
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
