import type { FeatureModule } from "../../features/featureRegistry";
import { I } from "../Icons";
import AutomationBackground from "./AutomationBackground";
import AutomationsPage from "./AutomationsPage";

const feature: FeatureModule = {
  id: "automations",
  order: 5,
  settings: {
    title: { ko: "자동화", en: "Automations" },
    description: {
      ko: "예약된 에이전트 작업의 백그라운드 확인 주기를 설정합니다.",
      en: "Configure background checks for scheduled agent work.",
    },
    settings: [
      {
        key: "enabled",
        kind: "toggle",
        label: { ko: "자동화 실행", en: "Enable automations" },
        hint: {
          ko: "꺼도 자동화 정의와 실행 기록은 보존됩니다.",
          en: "Definitions and run history remain stored while disabled.",
        },
        defaultValue: true,
      },
      {
        key: "tickSeconds",
        kind: "number",
        label: { ko: "예약 확인 주기", en: "Schedule check interval" },
        hint: { ko: "실행 시각 도래 여부를 확인하는 간격(초)", en: "Seconds between due-run checks" },
        defaultValue: 15,
        min: 5,
        max: 300,
        step: 5,
      },
      {
        key: "safeDispatch",
        kind: "locked",
        label: { ko: "안전한 작업 큐 사용", en: "Use the safe task queue" },
        defaultValue: true,
        lockedReason: {
          ko: "예약 작업은 임의 셸이 아니라 Atelier 작업 큐로만 전달됩니다.",
          en: "Scheduled work is dispatched through Atelier's task queue, never an arbitrary shell.",
        },
      },
    ],
  },
  settingsPage: {
    id: "automations",
    order: 5,
    icon: I.zap,
    title: { ko: "자동화", en: "Automations" },
    hint: { ko: "예약 작업 · 실행 기록", en: "Schedules · Run history" },
    component: AutomationsPage,
  },
  background: AutomationBackground,
};

export default feature;
