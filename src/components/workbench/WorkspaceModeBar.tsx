import React from "react";
import { cls } from "../../lib/tokens";
import { I } from "../Icons";

export type WorkspaceView = "conversation" | "code" | "changes";

interface Props {
  dark: boolean;
  language: "ko" | "en";
  view: WorkspaceView;
  previewActive: boolean;
  changeCount: number;
  onViewChange: (view: WorkspaceView) => void;
  onTogglePreview: () => void;
}

const WorkspaceModeBar: React.FC<Props> = ({
  dark,
  language,
  view,
  previewActive,
  changeCount,
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
        >
          {I.comment}
          <span>{labels.conversation}</span>
        </button>
        <button
          type="button"
          className={cls(base, view === "code" && active)}
          onClick={() => onViewChange("code")}
          aria-pressed={view === "code"}
        >
          {I.code}
          <span>{labels.code}</span>
        </button>
        <button
          type="button"
          className={cls(base, view === "changes" && active)}
          onClick={() => onViewChange("changes")}
          aria-pressed={view === "changes"}
        >
          {I.changes}
          <span>{labels.changes}</span>
          {changeCount > 0 && <span className="atelier-workbench-count">{changeCount}</span>}
        </button>
      </div>
      <div className="atelier-workbench-mode-secondary">
        <button
          type="button"
          className={cls(base, previewActive && active)}
          onClick={onTogglePreview}
          aria-pressed={previewActive}
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
