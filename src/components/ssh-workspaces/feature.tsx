import type { FeatureModule } from "../../features/featureRegistry";
import { SshWorkspacesPanel } from ".";

const feature: FeatureModule = {
  id: "ssh-workspaces",
  order: 30,
  settings: {
    title: { ko: "SSH 작업공간", en: "SSH workspaces" },
    description: { ko: "원격 작업공간과 관리형 포트 전달의 기본값을 설정합니다.", en: "Configure remote workspaces and managed port forwarding defaults." },
    settings: [
      { key: "enabled", kind: "toggle", label: { ko: "SSH 작업공간 사용", en: "Enable SSH workspaces" }, defaultValue: true },
      { key: "autoReconnect", kind: "toggle", label: { ko: "포트 전달 자동 재연결", en: "Auto-reconnect forwarding" }, defaultValue: true },
      { key: "maxReconnectAttempts", kind: "number", label: { ko: "최대 재연결 횟수", en: "Maximum reconnect attempts" }, defaultValue: 5, min: 0, max: 20, step: 1 },
      { key: "defaultLocalPort", kind: "number", label: { ko: "기본 로컬 포트", en: "Default local port" }, defaultValue: 5173, min: 1, max: 65535, step: 1 },
      { key: "defaultRemotePort", kind: "number", label: { ko: "기본 원격 포트", en: "Default remote port" }, defaultValue: 5173, min: 1, max: 65535, step: 1 },
      {
        key: "strictHostKey", kind: "locked", label: { ko: "호스트 키 확인", en: "Host key verification" }, defaultValue: true,
        lockedReason: { ko: "신뢰하지 않은 호스트에는 연결하지 않습니다.", en: "Connections to untrusted hosts are blocked." },
      },
    ],
  },
  panels: [{ slot: "connections", component: SshWorkspacesPanel }],
};

export default feature;
