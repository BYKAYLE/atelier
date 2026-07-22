import React from "react";
import { cls } from "../../lib/tokens";
import { I } from "../Icons";
import type { DesktopNotificationPermission } from "./useDesktopNotifications";

interface DesktopNotificationToggleProps {
  dark: boolean;
  language: "ko" | "en";
  enabled: boolean;
  permission: DesktopNotificationPermission;
  busy: boolean;
  error: string;
  onToggle: () => void;
}

function labelForState(
  language: "ko" | "en",
  enabled: boolean,
  permission: DesktopNotificationPermission,
  error: string,
) {
  if (error) return language === "en" ? "Desktop notifications are unavailable" : "데스크톱 알림을 사용할 수 없습니다";
  if (permission === "unsupported") return language === "en" ? "Available in the installed app" : "설치 앱에서 사용할 수 있습니다";
  if (permission === "checking") return language === "en" ? "Checking notification permission" : "알림 권한 확인 중";
  if (permission === "denied") return language === "en" ? "Allow notifications in system settings" : "시스템 설정에서 알림을 허용하세요";
  if (enabled) return language === "en" ? "Turn off task notifications" : "작업 알림 끄기";
  return language === "en" ? "Turn on task notifications" : "작업 알림 켜기";
}

const DesktopNotificationToggle: React.FC<DesktopNotificationToggleProps> = ({
  dark,
  language,
  enabled,
  permission,
  busy,
  error,
  onToggle,
}) => {
  const label = labelForState(language, enabled, permission, error);
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy || permission === "unsupported"}
      className={cls(
        "atelier-desktop-notification-toggle",
        enabled
          ? dark ? "bg-dmuted text-[#e47b5a]" : "bg-surface text-accent shadow-[0_0_0_1px_#e5e3db]"
          : dark ? "text-dsub hover:bg-[#292927] hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
      )}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
    >
      <span aria-hidden="true">{busy ? <span className="atelier-agent-spinner" /> : enabled ? I.bell : I.bellOff}</span>
    </button>
  );
};

export default React.memo(DesktopNotificationToggle);
