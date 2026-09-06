import React from "react";
import { cls } from "../../lib/tokens";
import type { PatchButtonContract } from "../../lib/agentUpstreamContract";

export type ManagedAgentUpdateState = "idle" | "checking" | "available" | "ready";

interface Props {
  dark: boolean;
  provider: "hermes" | "gajecode" | "grok";
  visible: boolean;
  label: string;
  state: ManagedAgentUpdateState;
  statusText: string | null;
  versionText?: string | null;
  /** Upstream-latest reference line (patch target for Hermes/Gajae Code). */
  upstreamText?: string | null;
  message?: string | null;
  updateAvailable: boolean;
  updating: boolean;
  updateLabel: string;
  updatingLabel: string;
  checkLabel: string;
  updateDisabled?: boolean;
  checkDisabled?: boolean;
  /**
   * Stateful patch-button contract (Hermes/Gajae Code). When present the main
   * action is always rendered — "최신 상태" disabled, "패치 가능 (vX)" enabled,
   * "패치 중…" while running, and "패치 재시도" + reason after a rollback.
   * Grok omits it and keeps the legacy restore-only button.
   */
  patch?: PatchButtonContract | null;
  onUpdate: () => void;
  onCheck: () => void;
}

/**
 * Shared visual and interaction contract for Atelier-managed agent updates.
 * Provider cards may own different runtime/provider sections, but update state,
 * action order, spacing, and button placement must not drift independently.
 */
const ManagedAgentUpdatePanel: React.FC<Props> = ({
  dark,
  provider,
  visible,
  label,
  state,
  statusText,
  versionText,
  upstreamText,
  message,
  updateAvailable,
  updating,
  updateLabel,
  updatingLabel,
  checkLabel,
  updateDisabled = false,
  checkDisabled = false,
  patch = null,
  onUpdate,
  onCheck,
}) => {
  if (!visible) return null;

  const statusColor = state === "available"
    ? "#c2742b"
    : state === "ready"
      ? "#2f7d5b"
      : undefined;

  const highlighted = patch
    ? patch.state === "patch-available" || patch.state === "patch-failed"
    : state === "available";

  return (
    <section
      data-testid={`${provider}-update-panel`}
      data-update-state={state}
      data-patch-state={patch?.state}
      className={cls(
        "mt-2 rounded-md border px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap",
        highlighted
          ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
          : dark
            ? "border-dline bg-dbg"
            : "border-line bg-cream",
      )}
    >
      <div className="flex-1 min-w-[220px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cls("text-[11.5px] uppercase tracking-wider font-semibold", dark ? "text-dsub" : "text-sub")}>
            {label}
          </span>
          {statusText && (
            <span
              className={cls("text-[12px] font-medium", !statusColor && (dark ? "text-dsub" : "text-sub"))}
              style={statusColor ? { color: statusColor } : undefined}
            >
              {state === "ready" ? "✓ " : ""}{statusText}
            </span>
          )}
        </div>
        {versionText && (
          <div className={cls("text-[11px] gb-mono mt-0.5", dark ? "text-dsub" : "text-sub")}>
            {versionText}
          </div>
        )}
        {upstreamText && (
          <div
            data-testid={`${provider}-upstream-reference`}
            className={cls("text-[11px] gb-mono mt-0.5", dark ? "text-dsub" : "text-sub")}
          >
            {upstreamText}
          </div>
        )}
        {patch?.detail && (
          <div
            data-testid={`${provider}-patch-detail`}
            className="text-[11px] mt-1 text-red-500"
          >
            {patch.detail}
          </div>
        )}
        {message && (
          <div className={cls("text-[11px] mt-1", dark ? "text-dsub" : "text-sub")}>
            {message}
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1.5">
        {patch ? (
          <button
            type="button"
            data-testid={`${provider}-update`}
            onClick={onUpdate}
            disabled={!patch.enabled || updateDisabled}
            className={cls(
              "text-[12.5px] h-8 px-3 rounded-md border font-medium transition-colors",
              patch.state === "patch-available" || patch.state === "patch-failed"
                ? "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/40 hover:bg-[var(--accent)]/20"
                : dark
                  ? "border-dline text-dsub"
                  : "border-line text-sub",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {patch.label}
          </button>
        ) : (
          updateAvailable && (
            <button
              type="button"
              data-testid={`${provider}-update`}
              onClick={onUpdate}
              disabled={updateDisabled}
              className={cls(
                "text-[12.5px] h-8 px-3 rounded-md border font-medium transition-colors",
                "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/40 hover:bg-[var(--accent)]/20",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {updating ? updatingLabel : updateLabel}
            </button>
          )
        )}
        <button
          type="button"
          data-testid={`${provider}-update-check`}
          onClick={onCheck}
          disabled={checkDisabled}
          className={cls(
            "text-[12px] h-8 px-3 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
          )}
          title={checkLabel}
          aria-label={checkLabel}
        >
          ↻ {checkLabel}
        </button>
      </div>
    </section>
  );
};

export default ManagedAgentUpdatePanel;
