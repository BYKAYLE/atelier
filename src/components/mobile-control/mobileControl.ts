import type {
  MobileConnectionMode,
  MobileDevice,
  MobileNetworkCandidate,
} from "../../lib/tauri";

export type MobileDeviceState = "active" | "revoked" | "expired";

export function mobileDeviceState(device: MobileDevice, now = Date.now()): MobileDeviceState {
  if (device.revokedAtMs !== null) return "revoked";
  if (device.expiresAtMs <= now) return "expired";
  return "active";
}

export function pairingSecondsLeft(expiresAtMs: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
}

export function preferredMobileNetworkAddress(
  candidates: MobileNetworkCandidate[],
  currentAddress: string | null = null,
): string | null {
  if (currentAddress && candidates.some((candidate) => candidate.address === currentAddress)) {
    return currentAddress;
  }
  return candidates.find((candidate) => candidate.recommended)?.address
    ?? candidates[0]?.address
    ?? null;
}

const PAIRING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TAILSCALE_DNS_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2}ts\.net$/i;

function parsePairingUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password || parsed.hash) return null;
    const pairingIds = parsed.searchParams.getAll("pairing");
    if (pairingIds.length !== 1 || !PAIRING_ID_PATTERN.test(pairingIds[0])) return null;
    if ([...parsed.searchParams.keys()].some((key) => key !== "pairing")) return null;
    if (!["/", "/atelier", "/atelier/"].includes(parsed.pathname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function isLocalPairingUrl(value: string): boolean {
  const parsed = parsePairingUrl(value);
  return parsed?.protocol === "http:"
    && parsed.pathname === "/"
    && Boolean(parsed.port)
    && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
}

export function isLanPairingUrl(value: string): boolean {
  const parsed = parsePairingUrl(value);
  return parsed?.protocol === "https:"
    && parsed.pathname === "/"
    && Boolean(parsed.port)
    && isPrivateIpv4(parsed.hostname);
}

export function lanPairingUrl(urls: string[]): string | null {
  return urls.find(isLanPairingUrl) ?? null;
}

export function isTailscalePairingUrl(value: string): boolean {
  const parsed = parsePairingUrl(value);
  return parsed?.protocol === "https:"
    && parsed.pathname === "/atelier/"
    && parsed.port === "8443"
    && TAILSCALE_DNS_PATTERN.test(parsed.hostname);
}

export function tailscalePairingUrl(urls: string[]): string | null {
  return urls.find(isTailscalePairingUrl) ?? null;
}

export function preferredPairingUrlForMode(
  urls: string[],
  connectionMode: MobileConnectionMode,
): string | null {
  if (connectionMode === "lan") return lanPairingUrl(urls);
  if (connectionMode === "tailscale") return tailscalePairingUrl(urls);
  return urls.find(isLocalPairingUrl) ?? null;
}

export function isAllowedTailscaleActivationUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const nodeIds = parsed.searchParams.getAll("node");
    return parsed.protocol === "https:"
      && parsed.hostname === "login.tailscale.com"
      && parsed.port === ""
      && parsed.pathname === "/f/serve"
      && !parsed.username
      && !parsed.password
      && !parsed.hash
      && nodeIds.length === 1
      && nodeIds[0].length > 0
      && nodeIds[0].length <= 256
      && [...parsed.searchParams.keys()].every((key) => key === "node");
  } catch {
    return false;
  }
}

export function formatMobileTime(value: number | null, language: "ko" | "en"): string {
  if (value === null) return language === "ko" ? "접속 기록 없음" : "Never connected";
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
