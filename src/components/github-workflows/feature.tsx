import type { FeatureModule } from "../../features/featureRegistry";
import { GithubWorkflowPanel } from ".";

const feature: FeatureModule = {
  id: "github-workflows",
  order: 10,
  settings: {
    title: { ko: "GitHub 워크플로", en: "GitHub workflows" },
    description: { ko: "이슈, PR, 체크와 승인 작업을 관리합니다.", en: "Manage issues, pull requests, checks, and approved writes." },
    settings: [
      { key: "enabled", kind: "toggle", label: { ko: "GitHub 패널 사용", en: "Enable GitHub panel" }, defaultValue: true },
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
    id: "github",
    order: 10,
    shortLabel: "GH",
    title: {
      ko: "GitHub 이슈, PR, 체크 및 리뷰",
      en: "GitHub issues, pull requests, checks, and reviews",
    },
    component: GithubWorkflowPanel,
  },
};

export default feature;
