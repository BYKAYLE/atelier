/**
 * Upstream-reference and patch-button contract for Atelier-managed agents.
 *
 * The Connections cards show the installed runtime version, the Atelier
 * baseline (minimum verified support floor), and the version upstream
 * currently publishes. This module derives (1) the upstream reference line and
 * (2) the single stateful patch-button contract:
 *
 *   최신 상태(비활성) → 패치 가능 (vX)(활성) → 패치 중…(비활성)
 *   → 실패 시 "패치 실패 — 롤백됨" + 사유(재시도 가능)
 *
 * The Rust layer owns the actual decision to patch (fail-closed pipeline with
 * backup and rollback); this module only renders its states. Readiness stays
 * receipt-based and is never derived here.
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
  /**
   * Version the upstream reference is compared against: the installed runtime
   * version for patchable agents (Hermes/Gajae Code), the support pin for
   * restore-only agents (Grok).
   */
  pin: string | null | undefined;
  /** Upstream reference fields from the check-update status. */
  status: UpstreamReferenceFields | null | undefined;
  /** Display label for upstream (e.g. the tag for Hermes) when it differs from the version. */
  upstreamLabel?: string | null;
  language: "ko" | "en";
  /** When the pin is not a semver (Hermes commit), pass the pin's own version label. */
  pinVersionLabel?: string | null;
  /** True for agents whose card offers the real patch button. */
  patchable?: boolean;
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
      ? `업스트림 최신 ${shown} · 설치된 버전이 더 최신`
      : `Upstream latest ${shown} · installed version is newer`;
  }
  if (input.patchable) {
    return ko
      ? `업스트림 최신 ${shown} 출시 · 패치로 설치할 수 있습니다`
      : `Upstream latest ${shown} released · installable via patch`;
  }
  return ko
    ? `업스트림 최신 ${shown} 출시 · Atelier 호환성 미검증`
    : `Upstream latest ${shown} released · not yet validated by Atelier`;
}

// ---------------------------------------------------------------------------
// Patch-button state contract (Hermes / Gajae Code)
// ---------------------------------------------------------------------------

export type PatchButtonState =
  | "up-to-date"
  | "patch-available"
  | "patching"
  | "patch-failed";

export interface PatchButtonInput {
  /** Managed runtime present (button hidden entirely when not installed). */
  installed: boolean;
  /** Backend verdict: upstream published something newer than installed. */
  updateAvailable: boolean;
  /** Display label of the patch target (e.g. `v2026.8.31`, `0.16.4`). */
  targetLabel: string | null | undefined;
  /** A patch invocation is currently running. */
  patching: boolean;
  /** Last patch failure reason ("패치 실패 — 롤백됨: …"), cleared on refresh. */
  lastError: string | null | undefined;
  language: "ko" | "en";
}

export interface PatchButtonContract {
  state: PatchButtonState;
  /** Button caption. */
  label: string;
  /** Whether clicking the button may start a patch (retry allowed after failure). */
  enabled: boolean;
  /** Secondary line under the button row (failure reason), if any. */
  detail: string | null;
}

/**
 * The single stateful patch button: ① up to date (disabled) ② patch available
 * with the target version (enabled) ③ patching (disabled, prevents double
 * clicks) ④ failed — rolled back, with the reason surfaced and retry enabled.
 */
export function patchButtonContract(input: PatchButtonInput): PatchButtonContract {
  const ko = input.language === "ko";
  if (input.patching) {
    return {
      state: "patching",
      label: ko ? "패치 중…" : "Patching…",
      enabled: false,
      detail: null,
    };
  }
  if (input.lastError) {
    return {
      state: "patch-failed",
      label: ko ? "패치 재시도" : "Retry patch",
      enabled: input.installed && input.updateAvailable,
      detail: input.lastError,
    };
  }
  if (input.installed && input.updateAvailable) {
    const target = input.targetLabel?.trim();
    return {
      state: "patch-available",
      label: target
        ? ko
          ? `패치 가능 (${target})`
          : `Patch available (${target})`
        : ko
          ? "패치 가능"
          : "Patch available",
      enabled: true,
      detail: null,
    };
  }
  return {
    state: "up-to-date",
    label: ko ? "최신 상태" : "Up to date",
    enabled: false,
    detail: null,
  };
}
