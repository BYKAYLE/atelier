import type { FeatureModule } from "../../features/featureRegistry";
import { LinearWorkflowPanel } from ".";

const feature: FeatureModule = {
  id: "linear-workflows",
  order: 20,
  settings: {
    title: { ko: "Linear 워크플로", en: "Linear workflows" },
    description: { ko: "Linear 이슈와 상태 변경을 관리합니다.", en: "Manage Linear issues and workflow states." },
    settings: [
      { key: "enabled", kind: "toggle", label: { ko: "Linear 패널 사용", en: "Enable Linear panel" }, defaultValue: true },
      {
        key: "refreshIntervalSeconds", kind: "select", label: { ko: "자동 새로고침", en: "Automatic refresh" }, defaultValue: 0,
        options: [
          { value: 0, label: { ko: "수동", en: "Manual" } },
          { value: 30, label: { ko: "30초", en: "30 seconds" } },
          { value: 60, label: { ko: "1분", en: "1 minute" } },
          { value: 300, label: { ko: "5분", en: "5 minutes" } },
        ],
      },
      {
        key: "writeApproval", kind: "locked", label: { ko: "쓰기 전 최종 승인", en: "Final approval before writes" }, defaultValue: true,
        lockedReason: { ko: "외부 서비스 변경은 항상 1회 승인이 필요합니다.", en: "External writes always require one-time approval." },
      },
    ],
  },
  sourceControl: {
    id: "linear",
    order: 20,
    shortLabel: "LN",
    title: {
      ko: "Linear 이슈 및 워크플로 상태",
      en: "Linear issues and workflow states",
    },
    component: LinearWorkflowPanel,
  },
};

export default feature;
