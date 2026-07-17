import type { MobileDevice } from "../../lib/tauri";

export type MobileDeviceState = "active" | "revoked" | "expired";

export function mobileDeviceState(device: MobileDevice, now = Date.now()): MobileDeviceState {
  if (device.revokedAtMs !== null) return "revoked";
  if (device.expiresAtMs <= now) return "expired";
  return "active";
}

export function pairingSecondsLeft(expiresAtMs: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
}

export function preferredPairingUrl(urls: string[], allowLan: boolean): string | null {
  if (urls.length === 0) return null;
  if (allowLan) {
    return urls.find((url) => !url.includes("127.0.0.1") && !url.includes("localhost")) ?? urls[0];
  }
  return urls[0];
}

export function formatMobileTime(value: number | null, language: "ko" | "en"): string {
  if (value === null) return language === "ko" ? "접속 기록 없음" : "Never connected";
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
