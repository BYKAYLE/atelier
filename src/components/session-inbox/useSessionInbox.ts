import { useCallback, useEffect, useMemo, useState } from "react";
import { safeLocalStorageGet, safeLocalStorageSet } from "../../lib/storage";
import {
  createInitialSessionInboxState,
  filterSessionInboxItems,
  isSessionInboxItemUnread,
  markSessionInboxItemRead,
  markSessionInboxItemUnread,
  normalizeSessionInboxState,
  pruneSessionInboxState,
  sessionInboxCounts,
} from "./sessionInboxState";
import type {
  SessionInboxFilter,
  SessionInboxItem,
  SessionInboxReadState,
} from "./sessionInboxState";

const SESSION_INBOX_STATE_KEY = "atelier.sessionInbox.state.v1";
const SESSION_INBOX_FILTER_KEY = "atelier.sessionInbox.filter.v1";

function loadState(items: SessionInboxItem[]): SessionInboxReadState {
  try {
    const raw = safeLocalStorageGet(SESSION_INBOX_STATE_KEY);
    const parsed = raw ? normalizeSessionInboxState(JSON.parse(raw)) : null;
    return parsed || createInitialSessionInboxState(items);
  } catch {
    return createInitialSessionInboxState(items);
  }
}

function loadFilter(): SessionInboxFilter {
  const value = safeLocalStorageGet(SESSION_INBOX_FILTER_KEY);
  return value === "running" || value === "attention" || value === "unread" ? value : "all";
}

export function useSessionInbox(items: SessionInboxItem[], activeId: string | null) {
  const [state, setState] = useState<SessionInboxReadState>(() => loadState(items));
  const [filter, setFilterState] = useState<SessionInboxFilter>(() => loadFilter());

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const activeUpdatedAt = activeId ? itemById.get(activeId)?.updatedAt : undefined;

  const markRead = useCallback((id: string) => {
    const item = itemById.get(id);
    if (!item) return;
    setState((current) => markSessionInboxItemRead(current, item));
  }, [itemById]);

  const markUnread = useCallback((id: string) => {
    if (!itemById.has(id)) return;
    setState((current) => markSessionInboxItemUnread(current, id));
  }, [itemById]);

  const toggleUnread = useCallback((id: string) => {
    const item = itemById.get(id);
    if (!item) return;
    setState((current) => isSessionInboxItemUnread(item, current)
      ? markSessionInboxItemRead(current, item)
      : markSessionInboxItemUnread(current, id));
  }, [itemById]);

  const setFilter = useCallback((next: SessionInboxFilter) => {
    setFilterState(next);
    safeLocalStorageSet(SESSION_INBOX_FILTER_KEY, next);
  }, []);

  useEffect(() => {
    setState((current) => pruneSessionInboxState(current, items));
  }, [items]);

  useEffect(() => {
    safeLocalStorageSet(SESSION_INBOX_STATE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!activeId || activeUpdatedAt === undefined) return;
    if (document.visibilityState !== "visible") return;
    setState((current) => {
      if (current.forcedUnreadById[activeId]) return current;
      const item = itemById.get(activeId);
      return item ? markSessionInboxItemRead(current, item) : current;
    });
  }, [activeId, activeUpdatedAt, itemById]);

  const counts = useMemo(() => sessionInboxCounts(items, state), [items, state]);
  const visibleIds = useMemo(
    () => new Set(filterSessionInboxItems(items, state, filter).map((item) => item.id)),
    [filter, items, state],
  );
  const unreadIds = useMemo(
    () => new Set(items.filter((item) => isSessionInboxItemUnread(item, state)).map((item) => item.id)),
    [items, state],
  );

  return {
    filter,
    setFilter,
    counts,
    visibleIds,
    unreadIds,
    markRead,
    markUnread,
    toggleUnread,
  };
}
