import React, { useState } from "react";
import { cls } from "../lib/tokens";
import type { Tweaks } from "../lib/tokens";
import { academicResearchInstallClaudePlugin, atelierSkillInstallPublicBundle } from "../lib/tauri";
import { I } from "./Icons";

type InstallStatus = "idle" | "installing" | "installed" | "error";

type CatalogPlugin = {
  id: "academic-research-claude" | "atelier-skill-public";
  provider: string;
  short: string;
  color: string;
  titleKo: string;
  titleEn: string;
  detailKo: string;
  detailEn: string;
};

type BuiltInSkill = {
  id: string;
  titleKo: string;
  titleEn: string;
  detailKo: string;
  detailEn: string;
  icon: React.ReactNode;
};

const PLUGINS: CatalogPlugin[] = [
  {
    id: "atelier-skill-public",
    provider: "GitHub",
    short: "At",
    color: "#e26f4f",
    titleKo: "Atelier Skill",
    titleEn: "Atelier Skill",
    detailKo: "Stella, Stella Factory, Probe, 에이전트 오케스트레이터 공개 스킬 묶음",
    detailEn: "Public Stella, Stella Factory, Probe, and agent orchestration skill bundle",
  },
  {
    id: "academic-research-claude",
    provider: "Claude Code",
    short: "Cl",
    color: "#c96442",
    titleKo: "Academic Research Skills",
    titleEn: "Academic Research Skills",
    detailKo: "연구, 문헌조사, 논문 작성 워크플로",
    detailEn: "Research, literature review, and paper-writing workflow",
  },
];

const BUILT_IN_SKILLS: BuiltInSkill[] = [
  {
    id: "stella-factory",
    titleKo: "Stella Factory",
    titleEn: "Stella Factory",
    detailKo: "목표 변환, Probe 검증, SOT 기록",
    detailEn: "Goal packets, Probe checks, SOT evidence",
    icon: I.shieldCheck,
  },
  {
    id: "preview-probe",
    titleKo: "Preview Probe",
    titleEn: "Preview Probe",
    detailKo: "프리뷰 상태, 화면, DOM 검수",
    detailEn: "Preview status, screen, and DOM checks",
    icon: I.eye,
  },
  {
    id: "release-audit",
    titleKo: "Release Audit",
    titleEn: "Release Audit",
    detailKo: "업데이트, 릴리스, 배포 준비 점검",
    detailEn: "Updater, release, and packaging checks",
    icon: I.fastPreview,
  },
  {
    id: "design-workflow",
    titleKo: "Design Workflow",
    titleEn: "Design Workflow",
    detailKo: "기획, 시안, 디자인 산출물 흐름",
    detailEn: "Briefs, drafts, and design artifacts",
    icon: I.palette,
  },
];

const PluginSkillsPage: React.FC<{ tw: Tweaks }> = ({ tw }) => {
  const dark = tw.dark;
  const ko = tw.language !== "en";
  const [installState, setInstallState] = useState<Partial<Record<CatalogPlugin["id"], { status: InstallStatus; message?: string }>>>({});

  const copy = ko
    ? {
        title: "플러그인&스킬",
        subtitle: "필요한 플러그인만 직접 설치하고, 내장 스킬은 작업 화면에서 바로 사용합니다.",
        plugins: "플러그인",
        skills: "스킬",
        install: "설치",
        installing: "설치 중",
        installed: "설치됨",
        failed: "실패",
        builtIn: "내장",
      }
    : {
        title: "Plugins & Skills",
        subtitle: "Install only the plugins you choose. Built-in skills stay available from the workspace.",
        plugins: "Plugins",
        skills: "Skills",
        install: "Install",
        installing: "Installing",
        installed: "Installed",
        failed: "Failed",
        builtIn: "Built in",
      };

  const installPlugin = async (plugin: CatalogPlugin) => {
    if (installState[plugin.id]?.status === "installing") return;
    setInstallState((prev) => ({ ...prev, [plugin.id]: { status: "installing" } }));
    try {
      const result =
        plugin.id === "atelier-skill-public"
          ? await atelierSkillInstallPublicBundle()
          : await academicResearchInstallClaudePlugin();
      setInstallState((prev) => ({
        ...prev,
        [plugin.id]: {
          status: result.installed ? "installed" : "error",
          message: result.message,
        },
      }));
    } catch (err) {
      setInstallState((prev) => ({
        ...prev,
        [plugin.id]: {
          status: "error",
          message: String(err),
        },
      }));
    }
  };

  return (
    <div className={cls("h-full w-full overflow-auto", dark ? "bg-dbg text-dink" : "bg-cream text-ink")}>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-8 py-7">
        <header>
          <h1 className="font-display text-[28px] font-medium leading-tight tracking-normal">{copy.title}</h1>
          <p className={cls("mt-1 text-[13px] leading-[1.5]", dark ? "text-dsub" : "text-sub")}>{copy.subtitle}</p>
        </header>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[#e26f4f]">{I.zap}</span>
            <h2 className="text-[15px] font-semibold">{copy.plugins}</h2>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {PLUGINS.map((plugin) => {
              const state = installState[plugin.id]?.status || "idle";
              const message = installState[plugin.id]?.message;
              const label =
                state === "installed"
                  ? copy.installed
                  : state === "error"
                    ? copy.failed
                    : state === "installing"
                      ? copy.installing
                      : copy.install;
              return (
                <article
                  key={plugin.id}
                  className={cls(
                    "rounded-[8px] border p-4",
                    dark ? "border-dline bg-[#20201e]" : "border-line bg-surface",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-[12px] font-semibold"
                      style={{
                        color: plugin.color,
                        background: `${plugin.color}1f`,
                        boxShadow: `inset 0 0 0 1px ${plugin.color}66`,
                      }}
                    >
                      {plugin.short}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[14px] font-semibold">{ko ? plugin.titleKo : plugin.titleEn}</h3>
                        <span className={cls("shrink-0 text-[11px]", dark ? "text-dsub" : "text-sub")}>{plugin.provider}</span>
                      </div>
                      <p className={cls("mt-1 text-[12px] leading-[1.45]", dark ? "text-dsub" : "text-sub")}>
                        {ko ? plugin.detailKo : plugin.detailEn}
                      </p>
                    </div>
                  </div>
                  {message && (
                    <p className={cls("mt-3 text-[11px] leading-[1.45]", state === "error" ? "text-red-400" : dark ? "text-dsub" : "text-sub")}>
                      {message}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => installPlugin(plugin)}
                    disabled={state === "installing" || state === "installed"}
                    className={cls(
                      "mt-4 h-9 rounded-[7px] px-4 text-[12px] font-medium transition-colors disabled:opacity-65",
                      state === "installed"
                        ? dark ? "bg-[#173427] text-[#86efac]" : "bg-[#e8f7ee] text-[#166534]"
                        : dark ? "bg-dmuted text-dink hover:bg-[#393936]" : "bg-muted text-ink hover:bg-line",
                    )}
                  >
                    {label}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[#e26f4f]">{I.shieldCheck}</span>
            <h2 className="text-[15px] font-semibold">{copy.skills}</h2>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {BUILT_IN_SKILLS.map((skill) => (
              <article
                key={skill.id}
                className={cls(
                  "rounded-[8px] border p-4",
                  dark ? "border-dline bg-[#20201e]" : "border-line bg-surface",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cls(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-[8px]",
                      dark ? "bg-dmuted text-dink" : "bg-muted text-ink",
                    )}
                  >
                    {skill.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[14px] font-semibold">{ko ? skill.titleKo : skill.titleEn}</h3>
                      <span
                        className={cls(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10.5px]",
                          dark ? "border-dline text-dsub" : "border-line text-sub",
                        )}
                      >
                        {copy.builtIn}
                      </span>
                    </div>
                    <p className={cls("mt-1 text-[12px] leading-[1.45]", dark ? "text-dsub" : "text-sub")}>
                      {ko ? skill.detailKo : skill.detailEn}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default PluginSkillsPage;
