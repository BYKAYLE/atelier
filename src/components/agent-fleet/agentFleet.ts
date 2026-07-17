export type AgentFleetCandidatePhase = "waiting" | "running" | "done" | "failed";
export type AgentFleetPreset = "core" | "balanced" | "all";
export type AgentFleetAdoptionPhase = "verifying" | "adopted" | "failed" | "cancelled";

export interface AgentFleetProfileOption {
  id: string;
  provider: string;
}

export interface AgentFleetCandidateSnapshot {
  phase: AgentFleetCandidatePhase;
}

export interface AgentFleetSummary {
  waiting: number;
  running: number;
  done: number;
  failed: number;
  completed: number;
  total: number;
}

export interface AgentFleetAdoptionReceipt {
  id: string;
  batchId: string;
  candidateSessionId: string;
  sourceSessionId?: string;
  status: AgentFleetAdoptionPhase;
  createdAt: number;
  completedAt?: number;
  sourceCwd?: string;
  worktreeCwd?: string;
  branch?: string;
  baseHead?: string;
  fileCount?: number;
  additions?: number;
  deletions?: number;
  sourceDirtyBefore?: boolean;
  patchReceiptPath?: string;
  error?: string;
}

export interface AgentFleetAdoptionHistory {
  receipts: AgentFleetAdoptionReceipt[];
}

export interface AgentFleetAdoptionResult {
  source_cwd: string;
  worktree_cwd: string;
  branch: string;
  base_head: string;
  file_count: number;
  additions: number;
  deletions: number;
  source_dirty_before: boolean;
  receipt_path: string;
}

const RECEIPT_LIMIT = 12;
const ID_LIMIT = 160;
const PATH_LIMIT = 4096;
const ERROR_LIMIT = 4000;
const PROFILE_LIMIT = 16;
const VALID_ADOPTION_PHASES = new Set<AgentFleetAdoptionPhase>([
  "verifying",
  "adopted",
  "failed",
  "cancelled",
]);

function boundedText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function boundedTimestamp(value: unknown, fallback?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function boundedCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER));
}

export function normalizeAgentFleetAdoptionHistory(value: unknown): AgentFleetAdoptionHistory | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rawReceipts = (value as Partial<AgentFleetAdoptionHistory>).receipts;
  if (!Array.isArray(rawReceipts)) return undefined;
  const receipts = rawReceipts.flatMap((value): AgentFleetAdoptionReceipt[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<AgentFleetAdoptionReceipt>;
    const id = boundedText(item.id, ID_LIMIT);
    const batchId = boundedText(item.batchId, ID_LIMIT);
    const candidateSessionId = boundedText(item.candidateSessionId, ID_LIMIT);
    const status = VALID_ADOPTION_PHASES.has(item.status as AgentFleetAdoptionPhase)
      ? item.status as AgentFleetAdoptionPhase
      : undefined;
    const createdAt = boundedTimestamp(item.createdAt);
    if (!id || !batchId || !candidateSessionId || !status || !createdAt) return [];
    return [{
      id,
      batchId,
      candidateSessionId,
      sourceSessionId: boundedText(item.sourceSessionId, ID_LIMIT) || undefined,
      status,
      createdAt,
      completedAt: boundedTimestamp(item.completedAt),
      sourceCwd: boundedText(item.sourceCwd, PATH_LIMIT) || undefined,
      worktreeCwd: boundedText(item.worktreeCwd, PATH_LIMIT) || undefined,
      branch: boundedText(item.branch, PATH_LIMIT) || undefined,
      baseHead: boundedText(item.baseHead, ID_LIMIT) || undefined,
      fileCount: boundedCount(item.fileCount),
      additions: boundedCount(item.additions),
      deletions: boundedCount(item.deletions),
      sourceDirtyBefore: typeof item.sourceDirtyBefore === "boolean" ? item.sourceDirtyBefore : undefined,
      patchReceiptPath: boundedText(item.patchReceiptPath, PATH_LIMIT) || undefined,
      error: boundedText(item.error, ERROR_LIMIT) || undefined,
    }];
  }).slice(-RECEIPT_LIMIT);
  return receipts.length ? { receipts } : undefined;
}

export function beginAgentFleetAdoption(
  history: AgentFleetAdoptionHistory | undefined,
  options: {
    id: string;
    batchId: string;
    candidateSessionId: string;
    sourceSessionId?: string;
    sourceCwd?: string;
    worktreeCwd?: string;
    branch?: string;
    baseHead?: string;
    now?: number;
  },
): AgentFleetAdoptionHistory {
  const now = options.now ?? Date.now();
  const current = normalizeAgentFleetAdoptionHistory(history)?.receipts || [];
  const receipt: AgentFleetAdoptionReceipt = {
    id: boundedText(options.id, ID_LIMIT),
    batchId: boundedText(options.batchId, ID_LIMIT),
    candidateSessionId: boundedText(options.candidateSessionId, ID_LIMIT),
    sourceSessionId: boundedText(options.sourceSessionId, ID_LIMIT) || undefined,
    status: "verifying",
    createdAt: now,
    sourceCwd: boundedText(options.sourceCwd, PATH_LIMIT) || undefined,
    worktreeCwd: boundedText(options.worktreeCwd, PATH_LIMIT) || undefined,
    branch: boundedText(options.branch, PATH_LIMIT) || undefined,
    baseHead: boundedText(options.baseHead, ID_LIMIT) || undefined,
  };
  if (!receipt.id || !receipt.batchId || !receipt.candidateSessionId) {
    return { receipts: current };
  }
  return { receipts: [...current, receipt].slice(-RECEIPT_LIMIT) };
}

function transitionAgentFleetAdoption(
  history: AgentFleetAdoptionHistory | undefined,
  receiptId: string,
  status: Exclude<AgentFleetAdoptionPhase, "verifying">,
  details: Partial<AgentFleetAdoptionReceipt>,
): AgentFleetAdoptionHistory | undefined {
  const normalized = normalizeAgentFleetAdoptionHistory(history);
  if (!normalized) return undefined;
  const now = boundedTimestamp(details.completedAt, Date.now());
  let matched = false;
  const receipts = normalized.receipts.map((receipt) => {
    if (receipt.id !== receiptId) return receipt;
    matched = true;
    return {
      ...receipt,
      ...details,
      id: receipt.id,
      batchId: receipt.batchId,
      candidateSessionId: receipt.candidateSessionId,
      status,
      completedAt: now,
      error: status === "failed" || status === "cancelled"
        ? boundedText(details.error, ERROR_LIMIT) || receipt.error
        : undefined,
    };
  });
  return matched ? { receipts } : normalized;
}

export function completeAgentFleetAdoption(
  history: AgentFleetAdoptionHistory | undefined,
  receiptId: string,
  result: AgentFleetAdoptionResult,
  now = Date.now(),
) {
  return transitionAgentFleetAdoption(history, receiptId, "adopted", {
    completedAt: now,
    sourceCwd: result.source_cwd,
    worktreeCwd: result.worktree_cwd,
    branch: result.branch,
    baseHead: result.base_head,
    fileCount: result.file_count,
    additions: result.additions,
    deletions: result.deletions,
    sourceDirtyBefore: result.source_dirty_before,
    patchReceiptPath: result.receipt_path,
  });
}

export function failAgentFleetAdoption(
  history: AgentFleetAdoptionHistory | undefined,
  receiptId: string,
  error: unknown,
  now = Date.now(),
) {
  return transitionAgentFleetAdoption(history, receiptId, "failed", {
    completedAt: now,
    error: boundedText(error instanceof Error ? error.message : String(error), ERROR_LIMIT),
  });
}

export function finalizeInterruptedAgentFleetAdoption(
  history: AgentFleetAdoptionHistory | undefined,
  now = Date.now(),
): AgentFleetAdoptionHistory | undefined {
  const normalized = normalizeAgentFleetAdoptionHistory(history);
  if (!normalized) return undefined;
  let changed = false;
  const receipts = normalized.receipts.map((receipt) => {
    if (receipt.status !== "verifying") return receipt;
    changed = true;
    return {
      ...receipt,
      status: "cancelled" as const,
      completedAt: now,
      error: "Atelier restarted before the adoption result was recorded.",
    };
  });
  return changed ? { receipts } : normalized;
}

export function latestAgentFleetAdoption(history?: AgentFleetAdoptionHistory) {
  return normalizeAgentFleetAdoptionHistory(history)?.receipts.at(-1);
}

export function legacyAgentFleetAdoptionHistory(options: {
  adoptedAt?: number;
  summary?: string;
  batchId?: string;
  candidateSessionId?: string;
  sourceSessionId?: string;
}): AgentFleetAdoptionHistory | undefined {
  if (!options.adoptedAt || !options.batchId || !options.candidateSessionId) return undefined;
  const counts = boundedText(options.summary, 240).match(/(\d+)\s+files?\s*·\s*\+(\d+)\s+-(\d+)/i);
  return {
    receipts: [{
      id: `legacy-${options.candidateSessionId}-${options.adoptedAt}`.slice(0, ID_LIMIT),
      batchId: boundedText(options.batchId, ID_LIMIT),
      candidateSessionId: boundedText(options.candidateSessionId, ID_LIMIT),
      sourceSessionId: boundedText(options.sourceSessionId, ID_LIMIT) || undefined,
      status: "adopted",
      createdAt: options.adoptedAt,
      completedAt: options.adoptedAt,
      fileCount: counts ? Number(counts[1]) : undefined,
      additions: counts ? Number(counts[2]) : undefined,
      deletions: counts ? Number(counts[3]) : undefined,
    }],
  };
}

export function summarizeAgentFleetCandidates(candidates: AgentFleetCandidateSnapshot[]): AgentFleetSummary {
  const summary: AgentFleetSummary = {
    waiting: 0,
    running: 0,
    done: 0,
    failed: 0,
    completed: 0,
    total: candidates.length,
  };
  for (const candidate of candidates) summary[candidate.phase] += 1;
  summary.completed = summary.done + summary.failed;
  return summary;
}

function uniqueProfiles(profiles: AgentFleetProfileOption[]) {
  const seen = new Set<string>();
  return profiles.filter((profile) => {
    if (!profile.id || seen.has(profile.id)) return false;
    seen.add(profile.id);
    return true;
  }).slice(0, PROFILE_LIMIT);
}

export function selectAgentFleetProfileIds(
  profiles: AgentFleetProfileOption[],
  preset: AgentFleetPreset,
) {
  const available = uniqueProfiles(profiles);
  if (preset === "all") return available.map((profile) => profile.id);
  const target = preset === "core" ? 2 : 3;
  const selected: AgentFleetProfileOption[] = [];
  const providers = new Set<string>();
  for (const profile of available) {
    if (selected.length >= target) break;
    if (providers.has(profile.provider)) continue;
    selected.push(profile);
    providers.add(profile.provider);
  }
  for (const profile of available) {
    if (selected.length >= target) break;
    if (selected.some((item) => item.id === profile.id)) continue;
    selected.push(profile);
  }
  return selected.map((profile) => profile.id);
}

export function detectAgentFleetPreset(
  profiles: AgentFleetProfileOption[],
  selectedIds: string[],
): AgentFleetPreset | undefined {
  const selected = [...new Set(selectedIds)].sort().join("\n");
  return (["core", "balanced", "all"] as const).find((preset) => (
    selectAgentFleetProfileIds(profiles, preset).sort().join("\n") === selected
  ));
}
