import type { AgentQuickOpenIndexEntry, FsEntry } from "../../lib/tauri";

export type QuickOpenCommandId =
  | "conversation"
  | "code"
  | "changes"
  | "preview"
  | "terminal"
  | "new-task";

export interface QuickOpenCommandDefinition {
  command: QuickOpenCommandId;
  label: string;
  detail: string;
}

export interface QuickOpenSessionCandidate<TSession> {
  session: TSession;
  key: string;
  label: string;
  detail: string;
  trailing: string;
  searchable: Array<string | null | undefined>;
  updatedAt: number;
}

export type QuickOpenItem<TSession> =
  | { kind: "command"; key: string; command: QuickOpenCommandId; label: string; detail: string }
  | { kind: "file"; key: string; file: FsEntry }
  | { kind: "session"; key: string; candidate: QuickOpenSessionCandidate<TSession> }
  | { kind: "index"; key: string; entry: AgentQuickOpenIndexEntry };

interface RankedQuickOpenItem<TSession> {
  item: QuickOpenItem<TSession>;
  score: number;
  categoryRank: number;
  label: string;
}

export interface BuildQuickOpenResultsArgs<TSession> {
  query: string;
  commands: QuickOpenCommandDefinition[];
  files: FsEntry[];
  sessions: QuickOpenSessionCandidate<TSession>[];
  indexedEntries: AgentQuickOpenIndexEntry[];
  maxResults?: number;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function hasBoundaryMatch(value: string, query: string): boolean {
  let index = value.indexOf(query);
  while (index >= 0) {
    if (index === 0 || !/[\p{L}\p{N}]/u.test(value[index - 1])) return true;
    index = value.indexOf(query, index + 1);
  }
  return false;
}

export function quickOpenMatchScore(query: string, values: Array<string | null | undefined>): number | null {
  const needle = normalize(query);
  if (!needle) return 0;
  let best: number | null = null;
  values.forEach((rawValue, valueIndex) => {
    if (!rawValue) return;
    const value = normalize(rawValue);
    let score: number | null = null;
    if (value === needle) score = 120;
    else if (value.startsWith(needle)) score = 100;
    else if (hasBoundaryMatch(value, needle)) score = 82;
    else if (value.includes(needle)) score = 66;
    if (score !== null) {
      const weighted = score - Math.min(valueIndex * 4, 20);
      best = best === null ? weighted : Math.max(best, weighted);
    }
  });
  return best;
}

function indexCategoryRank(entry: AgentQuickOpenIndexEntry): number {
  if (entry.kind === "symbol") return 42;
  if (entry.kind === "worktree") return 32;
  return 28;
}

export function buildQuickOpenResults<TSession>({
  query,
  commands,
  files,
  sessions,
  indexedEntries,
  maxResults = 40,
}: BuildQuickOpenResultsArgs<TSession>): Array<QuickOpenItem<TSession>> {
  const ranked: Array<RankedQuickOpenItem<TSession>> = [];
  commands.forEach((command) => {
    const score = quickOpenMatchScore(query, [command.label, command.detail]);
    if (score === null) return;
    ranked.push({
      item: {
        kind: "command",
        key: `command:${command.command}`,
        command: command.command,
        label: command.label,
        detail: command.detail,
      },
      score,
      categoryRank: 50,
      label: command.label,
    });
  });
  files.forEach((file) => {
    const score = quickOpenMatchScore(query, [file.name, file.path]);
    if (score === null) return;
    ranked.push({
      item: { kind: "file", key: `file:${file.path}`, file },
      score,
      categoryRank: 40,
      label: file.name,
    });
  });
  indexedEntries.forEach((entry) => {
    const score = quickOpenMatchScore(query, [entry.label, entry.detail, entry.path, entry.branch]);
    if (score === null) return;
    ranked.push({
      item: { kind: "index", key: entry.key, entry },
      score: score + (entry.current ? 4 : 0),
      categoryRank: indexCategoryRank(entry),
      label: entry.label,
    });
  });
  sessions.forEach((candidate) => {
    const score = quickOpenMatchScore(query, [candidate.label, candidate.detail, ...candidate.searchable]);
    if (score === null) return;
    ranked.push({
      item: { kind: "session", key: candidate.key, candidate },
      score,
      categoryRank: 30,
      label: candidate.label,
    });
  });

  const deduplicated = new Map<string, RankedQuickOpenItem<TSession>>();
  ranked.forEach((candidate) => {
    const existing = deduplicated.get(candidate.item.key);
    if (!existing || candidate.score > existing.score) deduplicated.set(candidate.item.key, candidate);
  });
  return [...deduplicated.values()]
    .sort((left, right) => (
      right.score - left.score
      || right.categoryRank - left.categoryRank
      || left.label.localeCompare(right.label)
    ))
    .slice(0, Math.max(1, Math.min(maxResults, 80)))
    .map((candidate) => candidate.item);
}

export function sameQuickOpenPath(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const normalizePath = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalizePath(left) === normalizePath(right);
}
