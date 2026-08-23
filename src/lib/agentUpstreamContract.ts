/**
 * Upstream-reference display contract for Atelier-managed agents.
 *
 * The Connections cards show two numbers per agent: the Atelier support pin
 * (what the managed install/update button actually installs) and the version
 * upstream currently publishes. This module only derives the display line for
 * the second number. It must never influence `update_available`, readiness, or
 * the install target — those stay pin-based in the Rust layer.
 */

export interface UpstreamReferenceFields {
  upstream_latest_version: string | null;
  upstream_latest_tag?: string | null;
  upstream_checked_at: string | null;
  upstream_error: string | null;
}

export type UpstreamRelation =
  | "unknown"
  | "same"
  | "ahead"
  | "behind";

/** Leading all-digit parts only; a commit hash such as `3ef6bbd` yields nothing. */
function numericParts(version: string): number[] {
  const parts: number[] = [];
  for (const part of version.replace(/^v/, "").split(/[.\-_]/)) {
    if (!/^\d+$/.test(part)) break;
    parts.push(Number.parseInt(part, 10));
  }
  return parts;
}

/** Compare upstream against the Atelier pin. `ahead` means upstream is newer. */
export function compareUpstreamToPin(
  upstream: string | null | undefined,
  pin: string | null | undefined,
): UpstreamRelation {
  if (!upstream || !pin) return "unknown";
  const left = numericParts(upstream);
  const right = numericParts(pin);
  if (left.length === 0 || right.length === 0) return "unknown";
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a > b) return "ahead";
    if (a < b) return "behind";
  }
  return "same";
}

export interface UpstreamLineInput {
  /** Atelier support pin shown on the card (semver, or a short commit for Hermes). */
  pin: string | null | undefined;
  /** Upstream reference fields from the check-update status. */
  status: UpstreamReferenceFields | null | undefined;
  /** Display label for upstream (e.g. the tag for Hermes) when it differs from the version. */
  upstreamLabel?: string | null;
  language: "ko" | "en";
  /** When the pin is not a semver (Hermes commit), pass the pin's own version label. */
  pinVersionLabel?: string | null;
}

/**
 * One explanatory line under the version row. Returns `null` while no check
 * has been attempted yet (status absent) so the card layout stays unchanged.
 */
export function upstreamReferenceLine(input: UpstreamLineInput): string | null {
  const { status, language } = input;
  if (!status) return null;
  const ko = language === "ko";
  const upstream = status.upstream_latest_version;
  if (!upstream) {
    const reason = status.upstream_error?.trim();
    if (!reason) {
      return ko ? "업스트림 확인 불가" : "Upstream unavailable";
    }
    return ko ? `업스트림 확인 불가: ${reason}` : `Upstream unavailable: ${reason}`;
  }
  const shown = input.upstreamLabel?.trim() || upstream;
  const relation = compareUpstreamToPin(upstream, input.pinVersionLabel ?? input.pin);
  if (relation === "same") {
    return ko ? `업스트림 최신 ${shown} · 업스트림과 동일` : `Upstream latest ${shown} · same as upstream`;
  }
  if (relation === "behind") {
    return ko
      ? `업스트림 최신 ${shown} · Atelier 지원 버전이 더 최신`
      : `Upstream latest ${shown} · Atelier pin is newer`;
  }
  return ko
    ? `업스트림 최신 ${shown} 출시 · Atelier 검증 대기`
    : `Upstream latest ${shown} released · awaiting Atelier verification`;
}
