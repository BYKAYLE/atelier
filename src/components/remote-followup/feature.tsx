import type { FeatureModule } from "../../features/featureRegistry";
import { RemoteFollowupPanel } from ".";

const feature: FeatureModule = {
  id: "remote-followup",
  order: 20,
  settings: {
    title: { ko: "원격 후속 지시", en: "Remote follow-up" },
    description: { ko: "모바일 제안 작업을 승인할 때 사용할 기본 실행값입니다.", en: "Defaults used when approving proposed mobile work." },
    settings: [
      { key: "enabled", kind: "toggle", label: { ko: "후속 지시 사용", en: "Enable follow-up proposals" }, defaultValue: true },
      {
        key: "defaultProvider", kind: "select", label: { ko: "기본 에이전트", en: "Default agent" }, defaultValue: "codex",
        options: [
          { value: "codex", label: { ko: "Codex", en: "Codex" } },
          { value: "claude", label: { ko: "Claude Code", en: "Claude Code" } },
          { value: "hermes", label: { ko: "Hermes", en: "Hermes" } },
          { value: "gajecode", label: { ko: "Gajae Code", en: "Gajae Code" } },
        ],
      },
      {
        key: "defaultEffort", kind: "select", label: { ko: "기본 작업량", en: "Default effort" }, defaultValue: "high",
        options: [
          { value: "low", label: { ko: "낮음", en: "Low" } },
          { value: "medium", label: { ko: "중간", en: "Medium" } },
          { value: "high", label: { ko: "높음", en: "High" } },
          { value: "xhigh", label: { ko: "매우 높음", en: "Extra high" } },
          { value: "ultra", label: { ko: "울트라 코드", en: "Ultra code" } },
        ],
      },
      {
        key: "defaultPermission", kind: "select", label: { ko: "기본 권한", en: "Default permissions" }, defaultValue: "auto",
        options: [
          { value: "basic", label: { ko: "기본 권한", en: "Basic" } },
          { value: "auto", label: { ko: "자동 검토", en: "Auto review" } },
          { value: "full", label: { ko: "전체 권한", en: "Full" } },
        ],
      },
      { key: "defaultStellaMode", kind: "toggle", label: { ko: "스텔라 모드 기본값", en: "Stella mode by default" }, defaultValue: false },
      {
        key: "approvalRequired", kind: "locked", label: { ko: "실행 전 승인", en: "Approval before execution" }, defaultValue: true,
        lockedReason: { ko: "휴대폰 지시는 제안으로만 접수됩니다.", en: "Phone instructions are accepted only as proposals." },
      },
    ],
  },
  panels: [{ slot: "settings.remote", component: RemoteFollowupPanel }],
};

export default feature;
