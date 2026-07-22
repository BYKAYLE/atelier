import type { FeatureModule } from "../../features/featureRegistry";
import { DevServicesPanel } from ".";

const feature: FeatureModule = {
  id: "dev-services",
  order: 25,
  settings: {
    title: { ko: "개발 서비스", en: "Development services" },
    description: { ko: "로컬 개발 서버 감지와 목록 표시 방식을 설정합니다.", en: "Configure local development-server discovery and display." },
    settings: [
      { key: "enabled", kind: "toggle", label: { ko: "개발 서비스 감지", en: "Enable service discovery" }, defaultValue: true },
      { key: "scanOnOpen", kind: "toggle", label: { ko: "화면을 열 때 자동 검색", en: "Scan when opened" }, defaultValue: true },
      { key: "showUnmatched", kind: "toggle", label: { ko: "다른 작업 폴더의 서비스 표시", en: "Show services from other workspaces" }, defaultValue: true },
      {
        key: "stopApproval", kind: "locked", label: { ko: "서비스 중지 전 승인", en: "Approval before stopping" }, defaultValue: true,
        lockedReason: { ko: "프로세스 종료는 항상 최종 확인이 필요합니다.", en: "Stopping a process always requires final confirmation." },
      },
    ],
  },
  panels: [{ slot: "connections", component: DevServicesPanel }],
};

export default feature;
