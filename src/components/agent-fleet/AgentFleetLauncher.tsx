import type { ReactNode } from "react";
import { cls } from "../../lib/tokens";
import {
  detectAgentFleetPreset,
  type AgentFleetPreset,
  type AgentFleetProfileOption,
} from "./agentFleet";

export interface AgentFleetLauncherProfile extends AgentFleetProfileOption {
  name: string;
  short: string;
  dot: string;
}

export interface AgentFleetLauncherCopy {
  title: string;
  description: string;
  presetCore: string;
  presetBalanced: string;
  presetAll: string;
  launch: string;
  launching: string;
}

interface AgentFleetLauncherProps {
  dark: boolean;
  icon: ReactNode;
  profiles: AgentFleetLauncherProfile[];
  selectedIds: string[];
  copy: AgentFleetLauncherCopy;
  launching?: boolean;
  error?: string | null;
  onPreset: (preset: AgentFleetPreset) => void;
  onToggle: (profileId: string) => void;
  onLaunch: () => void;
}

export default function AgentFleetLauncher({
  dark,
  icon,
  profiles,
  selectedIds,
  copy,
  launching,
  error,
  onPreset,
  onToggle,
  onLaunch,
}: AgentFleetLauncherProps) {
  const detectedPreset = detectAgentFleetPreset(profiles, selectedIds);
  const presets: Array<{ id: AgentFleetPreset; label: string }> = [
    { id: "core", label: copy.presetCore },
    { id: "balanced", label: copy.presetBalanced },
    { id: "all", label: copy.presetAll },
  ];
  return (
    <div
      className={cls("mb-2 border-b pb-2", dark ? "border-dline" : "border-line")}
      data-testid="agent-fleet-launcher"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 text-[#e26f4f]">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-medium">{copy.title}</div>
          <div className={cls("mt-0.5 text-[10.5px] leading-[1.45]", dark ? "text-dsub" : "text-sub")}>
            {copy.description}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <div className={cls("inline-flex h-7 overflow-hidden rounded-[7px] border", dark ? "border-dline" : "border-line")}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPreset(preset.id)}
              aria-pressed={detectedPreset === preset.id}
              className={cls(
                "border-r px-2 text-[10px] last:border-r-0",
                dark ? "border-dline" : "border-line",
                detectedPreset === preset.id
                  ? dark ? "bg-[#3a2a23] text-[#f28b68]" : "bg-[#fff1eb] text-[#b94f2f]"
                  : dark ? "bg-dsurf text-dsub hover:text-dink" : "bg-surface text-sub hover:text-ink",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {profiles.map((profile) => {
          const selected = selectedIds.includes(profile.id);
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => onToggle(profile.id)}
              aria-pressed={selected}
              className={cls(
                "h-7 rounded-[7px] border px-2.5 inline-flex items-center gap-1.5 text-[10.5px] transition-colors",
                selected
                  ? dark
                    ? "border-[#e26f4f] bg-[#3a2a23] text-dink"
                    : "border-[#e26f4f] bg-[#fff1eb] text-ink"
                  : dark
                    ? "border-dline bg-dsurf text-dsub hover:text-dink"
                    : "border-line bg-surface text-sub hover:text-ink",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: profile.dot }} />
              <span>{profile.name}</span>
              <span className="font-mono opacity-70">{profile.short}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onLaunch}
          disabled={launching || selectedIds.length < 2}
          className={cls(
            "h-7 rounded-[7px] border px-3 text-[10.5px] font-medium text-white disabled:opacity-45",
            dark
              ? "border-[#e26f4f] bg-[#d76648] hover:bg-[#ef7958]"
              : "border-[#b9573c] bg-[#c96442] hover:bg-[#b5573a]",
          )}
        >
          {launching ? copy.launching : copy.launch}
        </button>
      </div>
      {error && (
        <div className={cls("mt-1.5 text-[10.5px]", dark ? "text-[#ffaaa0]" : "text-[#b94f2f]")}>
          {error}
        </div>
      )}
    </div>
  );
}
