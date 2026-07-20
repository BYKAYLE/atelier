import type { FeatureModule } from "../../features/featureRegistry";
import { RemoteAccessSection } from ".";

const feature: FeatureModule = {
  id: "mobile-control",
  order: 10,
  settings: {
    title: { ko: "모바일 제어", en: "Mobile control" },
    description: { ko: "모바일 모니터의 네트워크 기본값과 안전 정책을 설정합니다.", en: "Configure mobile monitor network defaults and safety policy." },
    settings: [
      { key: "enabled", kind: "toggle", label: { ko: "모바일 모니터 사용", en: "Enable mobile monitor" }, defaultValue: true },
      { key: "allowLanDefault", kind: "toggle", label: { ko: "같은 네트워크 공개 기본값", en: "Share on LAN by default" }, defaultValue: false },
      {
        key: "manualStart", kind: "locked", label: { ko: "사용자가 직접 시작", en: "Manual start required" }, defaultValue: true,
        lockedReason: { ko: "앱 실행만으로 외부 연결을 열지 않습니다.", en: "Launching Atelier never opens external access automatically." },
      },
      {
        key: "pairingTtlMinutes", kind: "locked", label: { ko: "페어링 코드 유효 시간", en: "Pairing code lifetime" }, defaultValue: 5,
        options: [{ value: 5, label: { ko: "5분", en: "5 minutes" } }],
        lockedReason: { ko: "짧은 만료 시간은 변경할 수 없습니다.", en: "The short expiry cannot be extended." },
      },
    ],
  },
  panels: [{ slot: "settings.remote", component: RemoteAccessSection }],
};

export default feature;
