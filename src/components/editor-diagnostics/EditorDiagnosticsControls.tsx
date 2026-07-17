import React from "react";
import type { AgentEditorSnapshot } from "../../lib/tauri";
import { cls } from "../../lib/tokens";
import { I } from "../Icons";
import type { EditorDiagnostic, EditorSavePolicy } from "./editorDiagnostics";

interface SavePolicyProps {
  dark: boolean;
  language: "ko" | "en";
  policy: EditorSavePolicy;
  onChange: (policy: EditorSavePolicy) => void;
}

export const EditorSavePolicyToggle: React.FC<SavePolicyProps> = ({ dark, language, policy, onChange }) => {
  const automatic = policy === "after-delay";
  const label = language === "en"
    ? automatic ? "Auto save on" : "Manual save"
    : automatic ? "자동 저장 켜짐" : "수동 저장";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={automatic}
      className={cls(
        "atelier-editor-save-policy",
        automatic && "atelier-editor-save-policy-active",
        dark ? "text-dsub hover:text-dink" : "text-sub hover:text-ink",
      )}
      onClick={() => onChange(automatic ? "manual" : "after-delay")}
      title={label}
      aria-label={label}
    >
      <span className="atelier-editor-save-policy-dot" />
      <span>{automatic ? (language === "en" ? "Auto" : "자동") : (language === "en" ? "Manual" : "수동")}</span>
    </button>
  );
};

interface DiagnosticsButtonProps {
  dark: boolean;
  language: "ko" | "en";
  count: number;
  open: boolean;
  onClick: () => void;
}

export const EditorDiagnosticsButton: React.FC<DiagnosticsButtonProps> = ({
  dark,
  language,
  count,
  open,
  onClick,
}) => {
  const label = language === "en"
    ? count > 0 ? `${count} editor issues` : "No editor issues"
    : count > 0 ? `편집기 문제 ${count}개` : "편집기 문제 없음";
  return (
    <button
      type="button"
      className={cls(
        "atelier-code-icon-button atelier-editor-diagnostics-button",
        open && "atelier-code-icon-button-active",
        count > 0 && "atelier-editor-diagnostics-button-alert",
        dark ? "text-dsub hover:text-dink" : "text-sub hover:text-ink",
      )}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={open}
    >
      {count > 0 ? I.shieldAlert : I.shieldCheck}
      {count > 0 && <span>{Math.min(count, 99)}</span>}
    </button>
  );
};

interface DiagnosticsPanelProps {
  dark: boolean;
  language: "ko" | "en";
  diagnostics: EditorDiagnostic[];
  onSelect: (diagnostic: EditorDiagnostic) => void;
}

export const EditorDiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  dark,
  language,
  diagnostics,
  onSelect,
}) => (
  <div className={cls(
    "atelier-editor-diagnostics-panel border-b",
    dark ? "border-dline bg-[#252523]" : "border-line bg-[#f3f0e8]",
  )}>
    {diagnostics.length === 0 ? (
      <span className={dark ? "text-dsub" : "text-sub"}>
        {language === "en" ? "No local diagnostics." : "로컬 진단 문제가 없습니다."}
      </span>
    ) : diagnostics.map((diagnostic) => (
      <button
        type="button"
        key={diagnostic.id}
        className={cls("atelier-editor-diagnostic-row", dark ? "hover:bg-[#302f2d]" : "hover:bg-[#e8e3d8]")}
        onClick={() => onSelect(diagnostic)}
        title={diagnostic.message}
      >
        <span className="atelier-editor-diagnostic-severity">{I.shieldAlert}</span>
        <span className="atelier-editor-diagnostic-message">{diagnostic.message}</span>
        <span className={dark ? "text-dsub" : "text-sub"}>{diagnostic.line}:{diagnostic.column}</span>
      </button>
    ))}
  </div>
);

interface ExternalChangeProps {
  dark: boolean;
  language: "ko" | "en";
  snapshot: AgentEditorSnapshot;
  dirty: boolean;
  onReload: () => void;
  onKeep: () => void;
}

export const EditorExternalChangeBanner: React.FC<ExternalChangeProps> = ({
  dark,
  language,
  snapshot,
  dirty,
  onReload,
  onKeep,
}) => {
  const deleted = !snapshot.exists;
  const message = language === "en"
    ? deleted
      ? "This file was removed or moved on disk. Your editor draft is preserved."
      : dirty
        ? "This file changed on disk while you have unsaved edits. Auto save is paused."
        : "This file changed on disk."
    : deleted
      ? "파일이 디스크에서 삭제되거나 이동되었습니다. 편집 중인 초안은 보존됩니다."
      : dirty
        ? "저장하지 않은 편집 중에 디스크 파일이 변경되었습니다. 자동 저장을 중지했습니다."
        : "디스크 파일이 변경되었습니다.";
  return (
    <div className={cls(
      "atelier-editor-external-banner border-b",
      dark ? "border-dline bg-[#352b24]" : "border-line bg-[#fff1df]",
    )} role="alert">
      <span className="atelier-editor-external-icon">{I.shieldAlert}</span>
      <span className="atelier-editor-external-message">{message}</span>
      {!deleted && (
        <button type="button" onClick={onReload}>
          {language === "en" ? "Reload disk" : "디스크 다시 불러오기"}
        </button>
      )}
      {!deleted && dirty && (
        <button type="button" onClick={onKeep}>
          {language === "en" ? "Keep my edits" : "내 편집 유지"}
        </button>
      )}
    </div>
  );
};
