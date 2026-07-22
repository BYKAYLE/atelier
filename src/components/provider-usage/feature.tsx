import type { FeatureModule } from "../../features/featureRegistry";
import { ProviderUsagePanel } from ".";

const feature: FeatureModule = {
  id: "provider-usage",
  order: 20,
  settings: {
    title: { ko: "공급자 사용량", en: "Provider usage" },
    description: { ko: "연결된 CLI의 공개 사용량 정보를 조회합니다.", en: "Read documented usage information from connected CLIs." },
    settings: [
      { key: "enabled", kind: "toggle", label: { ko: "사용량 패널 사용", en: "Enable usage panel" }, defaultValue: true },
      {
        key: "autoRefreshMinutes", kind: "select", label: { ko: "자동 새로고침", en: "Automatic refresh" }, defaultValue: 0,
        options: [
          { value: 0, label: { ko: "수동", en: "Manual" } },
          { value: 1, label: { ko: "1분", en: "1 minute" } },
          { value: 5, label: { ko: "5분", en: "5 minutes" } },
          { value: 15, label: { ko: "15분", en: "15 minutes" } },
        ],
      },
      {
        key: "documentedSurfacesOnly", kind: "locked", label: { ko: "공개된 조회 경로만 사용", en: "Documented surfaces only" }, defaultValue: true,
        lockedReason: { ko: "자격증명과 비공개 API는 읽지 않습니다.", en: "Credentials and private APIs are never read." },
      },
    ],
  },
  panels: [{ slot: "connections", component: ProviderUsagePanel }],
};

export default feature;
