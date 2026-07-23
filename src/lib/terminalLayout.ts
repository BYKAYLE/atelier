export type TerminalSplitDirection = "vertical" | "horizontal";

export type TerminalLayoutNode =
  | { type: "leaf"; logId: string }
  | {
      type: "split";
      id: string;
      direction: TerminalSplitDirection;
      ratio: number;
      first: TerminalLayoutNode;
      second: TerminalLayoutNode;
    };

export const MIN_TERMINAL_SPLIT_RATIO = 0.15;
export const MAX_TERMINAL_SPLIT_RATIO = 0.85;

export type TerminalSurfaceMetrics = {
  active: boolean;
  connected: boolean;
  display: string;
  visibility: string;
  width: number;
  height: number;
};

export type TerminalGridEstimate = {
  cols: number;
  rows: number;
};

export const MIN_STABLE_PTY_COLS = 80;
export const MIN_STABLE_PTY_ROWS = 12;

export function isTerminalSurfaceMeasurable(metrics: TerminalSurfaceMetrics): boolean {
  return (
    metrics.active &&
    metrics.connected &&
    metrics.display !== "none" &&
    metrics.visibility !== "hidden" &&
    metrics.width > 200 &&
    metrics.height > 100
  );
}

export function estimateTerminalGrid(
  width: number,
  height: number,
  fontSize: number,
): TerminalGridEstimate {
  const safeFontSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 14;
  const approxCharWidth = Math.max(6, safeFontSize * 0.62);
  const approxCharHeight = Math.max(12, safeFontSize * 1.2);
  return {
    cols: Math.max(2, Math.floor(Math.max(0, width) / approxCharWidth) - 1),
    rows: Math.max(1, Math.floor(Math.max(0, height) / approxCharHeight) - 1),
  };
}

export function isStablePtyGrid(grid: TerminalGridEstimate): boolean {
  return (
    Number.isFinite(grid.cols) &&
    Number.isFinite(grid.rows) &&
    grid.cols >= MIN_STABLE_PTY_COLS &&
    grid.rows >= MIN_STABLE_PTY_ROWS
  );
}

let fallbackSplitSequence = 0;

export function createTerminalSplitId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `split-${crypto.randomUUID()}`;
    }
  } catch {}
  fallbackSplitSequence += 1;
  return `split-${Date.now().toString(36)}-${fallbackSplitSequence.toString(36)}`;
}

export function normalizeTerminalSplitRatio(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(MIN_TERMINAL_SPLIT_RATIO, Math.min(MAX_TERMINAL_SPLIT_RATIO, parsed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeTerminalLayoutNode(
  value: unknown,
  seenLeaves: Set<string>,
  seenSplits: Set<string>,
): TerminalLayoutNode | null {
  if (!isRecord(value)) return null;
  if (value.type === "leaf") {
    const logId = typeof value.logId === "string" ? value.logId.trim() : "";
    if (!logId || seenLeaves.has(logId)) return null;
    seenLeaves.add(logId);
    return { type: "leaf", logId };
  }
  if (value.type !== "split") return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const direction = value.direction;
  if (!id || seenSplits.has(id) || (direction !== "vertical" && direction !== "horizontal")) {
    return null;
  }
  seenSplits.add(id);
  const first = decodeTerminalLayoutNode(value.first, seenLeaves, seenSplits);
  const second = decodeTerminalLayoutNode(value.second, seenLeaves, seenSplits);
  if (!first || !second) return null;
  return {
    type: "split",
    id,
    direction,
    ratio: normalizeTerminalSplitRatio(value.ratio),
    first,
    second,
  };
}

export function parseTerminalLayout(raw: string | null | undefined): TerminalLayoutNode | null {
  if (!raw) return null;
  try {
    return decodeTerminalLayoutNode(JSON.parse(raw), new Set(), new Set());
  } catch {
    return null;
  }
}

export function collectTerminalLayoutLeaves(node: TerminalLayoutNode | null): string[] {
  if (!node) return [];
  if (node.type === "leaf") return [node.logId];
  return [
    ...collectTerminalLayoutLeaves(node.first),
    ...collectTerminalLayoutLeaves(node.second),
  ];
}

export function buildBalancedTerminalLayout(
  logIds: string[],
  depth = 0,
  idFactory: () => string = createTerminalSplitId,
): TerminalLayoutNode | null {
  const ids = [...new Set(logIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return null;
  if (ids.length === 1) return { type: "leaf", logId: ids[0] };
  const midpoint = Math.ceil(ids.length / 2);
  const first = buildBalancedTerminalLayout(ids.slice(0, midpoint), depth + 1, idFactory);
  const second = buildBalancedTerminalLayout(ids.slice(midpoint), depth + 1, idFactory);
  if (!first) return second;
  if (!second) return first;
  return {
    type: "split",
    id: idFactory(),
    direction: depth % 2 === 0 ? "vertical" : "horizontal",
    ratio: 0.5,
    first,
    second,
  };
}

function pruneTerminalLayout(
  node: TerminalLayoutNode,
  available: Set<string>,
  seen: Set<string>,
): TerminalLayoutNode | null {
  if (node.type === "leaf") {
    if (!available.has(node.logId) || seen.has(node.logId)) return null;
    seen.add(node.logId);
    return node;
  }
  const first = pruneTerminalLayout(node.first, available, seen);
  const second = pruneTerminalLayout(node.second, available, seen);
  if (!first) return second;
  if (!second) return first;
  return {
    ...node,
    ratio: normalizeTerminalSplitRatio(node.ratio),
    first,
    second,
  };
}

export function reconcileTerminalLayout(
  node: TerminalLayoutNode | null,
  availableLogIds: string[],
  idFactory: () => string = createTerminalSplitId,
): TerminalLayoutNode | null {
  const availableIds = [...new Set(availableLogIds.map((id) => id.trim()).filter(Boolean))];
  if (availableIds.length === 0) return null;
  if (!node) return buildBalancedTerminalLayout(availableIds, 0, idFactory);

  const seen = new Set<string>();
  let reconciled = pruneTerminalLayout(node, new Set(availableIds), seen);
  if (!reconciled) return buildBalancedTerminalLayout(availableIds, 0, idFactory);

  const missing = availableIds.filter((logId) => !seen.has(logId));
  for (const logId of missing) {
    const leafCount = collectTerminalLayoutLeaves(reconciled).length;
    reconciled = {
      type: "split",
      id: idFactory(),
      direction: leafCount % 2 === 1 ? "vertical" : "horizontal",
      ratio: 0.5,
      first: reconciled,
      second: { type: "leaf", logId },
    };
  }
  return reconciled;
}

export function splitTerminalLayout(
  node: TerminalLayoutNode | null,
  targetLogId: string | null,
  newLogId: string,
  direction: TerminalSplitDirection,
  splitId = createTerminalSplitId(),
): TerminalLayoutNode {
  const newLeaf: TerminalLayoutNode = { type: "leaf", logId: newLogId };
  if (!node) return newLeaf;
  if (collectTerminalLayoutLeaves(node).includes(newLogId)) return node;

  let replaced = false;
  const visit = (current: TerminalLayoutNode): TerminalLayoutNode => {
    if (current.type === "leaf") {
      if (!replaced && current.logId === targetLogId) {
        replaced = true;
        return {
          type: "split",
          id: splitId,
          direction,
          ratio: 0.5,
          first: current,
          second: newLeaf,
        };
      }
      return current;
    }
    return { ...current, first: visit(current.first), second: visit(current.second) };
  };
  const next = visit(node);
  if (replaced) return next;
  return {
    type: "split",
    id: splitId,
    direction,
    ratio: 0.5,
    first: next,
    second: newLeaf,
  };
}

export function updateTerminalSplitRatio(
  node: TerminalLayoutNode | null,
  splitId: string,
  ratio: number,
): TerminalLayoutNode | null {
  if (!node) return null;
  if (node.type === "leaf") return node;
  if (node.id === splitId) return { ...node, ratio: normalizeTerminalSplitRatio(ratio) };
  return {
    ...node,
    first: updateTerminalSplitRatio(node.first, splitId, ratio) || node.first,
    second: updateTerminalSplitRatio(node.second, splitId, ratio) || node.second,
  };
}
