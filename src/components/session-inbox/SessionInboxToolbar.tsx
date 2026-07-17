import React from "react";
import { cls } from "../../lib/tokens";
import { I } from "../Icons";
import type { SessionInboxCounts, SessionInboxFilter } from "./sessionInboxState";

interface SessionInboxToolbarProps {
  dark: boolean;
  language: "ko" | "en";
  filter: SessionInboxFilter;
  counts: SessionInboxCounts;
  onChange: (filter: SessionInboxFilter) => void;
  trailingControl?: React.ReactNode;
}

const FILTERS: Array<{
  id: SessionInboxFilter;
  ko: string;
  en: string;
  icon: React.ReactNode;
}> = [
  { id: "all", ko: "전체", en: "All", icon: I.sessions },
  { id: "running", ko: "실행", en: "Running", icon: <span className="atelier-session-inbox-running" /> },
  { id: "attention", ko: "확인", en: "Attention", icon: <span className="atelier-session-inbox-attention">!</span> },
  { id: "unread", ko: "안읽음", en: "Unread", icon: <span className="atelier-session-inbox-unread" /> },
];

const SessionInboxToolbar: React.FC<SessionInboxToolbarProps> = ({
  dark,
  language,
  filter,
  counts,
  onChange,
  trailingControl,
}) => (
  <div
    className={cls(
      "atelier-session-inbox-toolbar border-b",
      trailingControl ? "atelier-session-inbox-toolbar-with-control" : "",
      dark ? "border-dline bg-dbg" : "border-line bg-cream",
    )}
    role="toolbar"
    aria-label={language === "en" ? "Task inbox filters" : "작업 인박스 필터"}
  >
    {FILTERS.map((item) => {
      const selected = filter === item.id;
      const label = language === "en" ? item.en : item.ko;
      const count = counts[item.id];
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cls(
            "atelier-session-inbox-filter",
            selected
              ? dark ? "bg-dmuted text-dink" : "bg-surface text-ink shadow-[0_0_0_1px_#e5e3db]"
              : dark ? "text-dsub hover:bg-[#292927] hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
          )}
          aria-pressed={selected}
          title={`${label} · ${count}`}
        >
          <span className="atelier-session-inbox-filter-icon" aria-hidden="true">{item.icon}</span>
          <span className="atelier-session-inbox-filter-label">{label}</span>
          <span className="atelier-session-inbox-filter-count">{count}</span>
        </button>
      );
    })}
    {trailingControl}
  </div>
);

export default React.memo(SessionInboxToolbar);
