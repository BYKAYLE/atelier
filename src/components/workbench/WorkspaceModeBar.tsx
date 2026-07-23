import React from "react";
import { cls } from "../../lib/tokens";
import { I } from "../Icons";
import {
  type SessionTokenUsage,
} from "./sessionTokenUsage";
import {
  subscriptionUsagePresentation,
} from "./subscriptionUsage";
import type { ProviderSubscriptionUsage } from "../../lib/tauri";

export type WorkspaceView = "conversation" | "code" | "changes";

interface Props {
  dark: boolean;
  language: "ko" | "en";
  view: WorkspaceView;
  previewActive: boolean;
  changeCount: number;
  modelLabel: string;
  tokenUsage?: SessionTokenUsage;
  subscriptionUsage?: ProviderSubscriptionUsage;
  running: boolean;
  onViewChange: (view: WorkspaceView) => void;
  onTogglePreview: () => void;
}

const WorkspaceModeBar: React.FC<Props> = ({
  dark,
  language,
  view,
  previewActive,
  changeCount,
  modelLabel,
  tokenUsage,
  subscriptionUsage,
  running,
  onViewChange,
  onTogglePreview,
}) => {
  const labels = language === "en"
    ? {
        conversation: "Conversation",
        code: "Code",
        changes: "Changes",
        preview: "Preview",
      }
    : {
        conversation: "대화",
        code: "코드",
        changes: "변경사항",
        preview: "프리뷰",
      };

  const base = cls(
    "atelier-workbench-mode-button",
    dark ? "text-dsub hover:text-dink" : "text-sub hover:text-ink",
  );
  const active = dark ? "atelier-workbench-mode-active-dark" : "atelier-workbench-mode-active-light";
  const usage = subscriptionUsagePresentation(subscriptionUsage, tokenUsage, language, running);
  const usageLabel = `${modelLabel} · ${usage.value}`;

  return (
    <nav
      className={cls("atelier-workbench-modebar border-b", dark ? "border-dline bg-dbg" : "border-line bg-cream")}
      aria-label={language === "en" ? "Workspace views" : "작업 화면"}
      data-testid="atelier-workbench-modebar"
    >
      <div className="atelier-workbench-mode-primary">
        <button
          type="button"
          className={cls(base, view === "conversation" && active)}
          onClick={() => onViewChange("conversation")}
          aria-pressed={view === "conversation"}
          aria-label={labels.conversation}
          title={labels.conversation}
        >
          {I.comment}
          <span>{labels.conversation}</span>
        </button>
        <button
          type="button"
          className={cls(base, view === "code" && active)}
          onClick={() => onViewChange("code")}
          aria-pressed={view === "code"}
          aria-label={labels.code}
          title={labels.code}
        >
          {I.code}
          <span>{labels.code}</span>
        </button>
        <button
          type="button"
          className={cls(base, view === "changes" && active)}
          onClick={() => onViewChange("changes")}
          aria-pressed={view === "changes"}
          aria-label={labels.changes}
          title={labels.changes}
        >
          {I.changes}
          <span>{labels.changes}</span>
          {changeCount > 0 && <span className="atelier-workbench-count">{changeCount}</span>}
        </button>
      </div>
      <div className="atelier-workbench-mode-secondary">
        <div
          className={cls(
            "atelier-session-token-usage",
            dark ? "text-dsub" : "text-sub",
            usage.reported && (dark ? "atelier-session-token-usage-reported-dark" : "atelier-session-token-usage-reported-light"),
          )}
          role="status"
          aria-label={usageLabel}
          title={usage.detail}
          data-testid="atelier-session-token-usage"
          data-reported={usage.reported ? "true" : "false"}
        >
          <span className="atelier-session-token-model">{modelLabel}</span>
          <span className="atelier-session-token-divider" aria-hidden="true">·</span>
          <span className="atelier-session-token-value">{usage.value}</span>
          {usage.consumedPercent !== null && (
            <span
              className="atelier-session-token-meter"
              role="progressbar"
              aria-label={subscriptionUsage
                ? (language === "en" ? "Subscription limit used" : "구독 한도 사용률")
                : (language === "en" ? "Context used" : "컨텍스트 사용률")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(usage.consumedPercent)}
            >
              <span style={{ width: `${usage.consumedPercent}%` }} />
            </span>
          )}
        </div>
        <button
          type="button"
          className={cls(base, previewActive && active)}
          onClick={onTogglePreview}
          aria-pressed={previewActive}
          aria-label={labels.preview}
          title={labels.preview}
        >
          {I.preview}
          <span>{labels.preview}</span>
        </button>
      </div>
    </nav>
  );
};

export default WorkspaceModeBar;
