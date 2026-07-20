import type { FeatureModule } from "../../features/featureRegistry";
import { ComputerUsePanel } from ".";
import { handleComputerUseControlRequest } from "./controlRequest";

const feature: FeatureModule = {
  id: "computer-use",
  order: 30,
  settings: {
    title: { ko: "Computer Use", en: "Computer Use" },
    description: { ko: "화면 제어 브리지의 제한값과 외부 브라우저 정책을 설정합니다.", en: "Configure bridge limits and external browser policy." },
    settings: [
      { key: "enabled", kind: "toggle", label: { ko: "Computer Use 기능 사용", en: "Enable Computer Use" }, defaultValue: true },
      { key: "bridgeTimeoutSeconds", kind: "number", label: { ko: "프리뷰 동작 제한 시간", en: "Preview action timeout" }, defaultValue: 45, min: 5, max: 120, step: 5 },
      { key: "receiptLimit", kind: "number", label: { ko: "표시할 실행 기록", en: "Visible receipts" }, defaultValue: 10, min: 1, max: 50, step: 1 },
      { key: "allowExternalBrowser", kind: "toggle", label: { ko: "외부 HTTPS 주소 열기", en: "Allow external HTTPS URLs" }, defaultValue: false },
      {
        key: "perActionApproval", kind: "locked", label: { ko: "동작별 1회 승인", en: "One-time approval per action" }, defaultValue: true,
        lockedReason: { ko: "화면 조작은 미리보기와 정확한 승인 없이는 실행되지 않습니다.", en: "UI actions never run without an exact preview and approval." },
      },
    ],
  },
  panels: [{ slot: "settings.remote", component: ComputerUsePanel }],
  controlRequestHandler: handleComputerUseControlRequest,
};

export default feature;
