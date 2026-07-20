export type SessionInboxFilter = "all" | "running" | "attention" | "unread";

export type SessionInboxPhase = "idle" | "running" | "attention" | "done";

export interface SessionFreshnessTimestamps {
  updatedAt: number;
  lastContentAt?: number;
  lastAttentionAt?: number;
}

export interface SessionInboxItem {
  id: string;
  freshnessAt: number;
  phase: SessionInboxPhase;
}

export interface SessionInboxReadState {
  readAtById: Record<string, number>;
  forcedUnreadById: Record<string, boolean>;
}

export interface SessionInboxCounts {
  all: number;
  running: number;
  attention: number;
  unread: number;
}

export const EMPTY_SESSION_INBOX_STATE: SessionInboxReadState = {
  readAtById: {},
  forcedUnreadById: {},
};

function normalizedTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function sessionFreshnessAt(value: SessionFreshnessTimestamps): number {
  const contentAt = normalizedTimestamp(value.lastContentAt) ?? normalizedTimestamp(value.updatedAt) ?? 0;
  const attentionAt = normalizedTimestamp(value.lastAttentionAt) ?? 0;
  return Math.max(contentAt, attentionAt);
}

export function createInitialSessionInboxState(items: SessionInboxItem[]): SessionInboxReadState {
  return {
    readAtById: Object.fromEntries(items.map((item) => [item.id, item.freshnessAt])),
    forcedUnreadById: {},
  };
}

export function normalizeSessionInboxState(value: unknown): SessionInboxReadState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SessionInboxReadState>;
  const readAtById = candidate.readAtById && typeof candidate.readAtById === "object"
    ? Object.fromEntries(
        Object.entries(candidate.readAtById)
          .filter(([id, timestamp]) => id.length > 0 && Number.isFinite(timestamp))
          .map(([id, timestamp]) => [id, Number(timestamp)]),
      )
    : {};
  const forcedUnreadById = candidate.forcedUnreadById && typeof candidate.forcedUnreadById === "object"
    ? Object.fromEntries(
        Object.entries(candidate.forcedUnreadById)
          .filter(([id, forced]) => id.length > 0 && forced === true),
      )
    : {};
  return { readAtById, forcedUnreadById };
}

export function isSessionInboxItemUnread(
  item: SessionInboxItem,
  state: SessionInboxReadState,
): boolean {
  if (state.forcedUnreadById[item.id]) return true;
  return item.freshnessAt > (state.readAtById[item.id] || 0);
}

export function markSessionInboxItemRead(
  state: SessionInboxReadState,
  item: SessionInboxItem,
): SessionInboxReadState {
  const alreadyRead = !state.forcedUnreadById[item.id]
    && (state.readAtById[item.id] || 0) >= item.freshnessAt;
  if (alreadyRead) return state;
  const forcedUnreadById = { ...state.forcedUnreadById };
  delete forcedUnreadById[item.id];
  return {
    readAtById: { ...state.readAtById, [item.id]: item.freshnessAt },
    forcedUnreadById,
  };
}

export function markSessionInboxItemUnread(
  state: SessionInboxReadState,
  itemId: string,
): SessionInboxReadState {
  if (state.forcedUnreadById[itemId]) return state;
  return {
    readAtById: state.readAtById,
    forcedUnreadById: { ...state.forcedUnreadById, [itemId]: true },
  };
}

export function pruneSessionInboxState(
  state: SessionInboxReadState,
  items: SessionInboxItem[],
): SessionInboxReadState {
  const ids = new Set(items.map((item) => item.id));
  const readAtById = Object.fromEntries(
    Object.entries(state.readAtById).filter(([id]) => ids.has(id)),
  );
  const forcedUnreadById = Object.fromEntries(
    Object.entries(state.forcedUnreadById).filter(([id]) => ids.has(id)),
  );
  if (
    Object.keys(readAtById).length === Object.keys(state.readAtById).length
    && Object.keys(forcedUnreadById).length === Object.keys(state.forcedUnreadById).length
  ) {
    return state;
  }
  return { readAtById, forcedUnreadById };
}

export function sessionInboxCounts(
  items: SessionInboxItem[],
  state: SessionInboxReadState,
): SessionInboxCounts {
  return items.reduce<SessionInboxCounts>(
    (counts, item) => {
      counts.all += 1;
      if (item.phase === "running") counts.running += 1;
      if (item.phase === "attention") counts.attention += 1;
      if (isSessionInboxItemUnread(item, state)) counts.unread += 1;
      return counts;
    },
    { all: 0, running: 0, attention: 0, unread: 0 },
  );
}

export function filterSessionInboxItems(
  items: SessionInboxItem[],
  state: SessionInboxReadState,
  filter: SessionInboxFilter,
): SessionInboxItem[] {
  if (filter === "all") return items;
  if (filter === "unread") {
    return items.filter((item) => isSessionInboxItemUnread(item, state));
  }
  return items.filter((item) => item.phase === filter);
}
