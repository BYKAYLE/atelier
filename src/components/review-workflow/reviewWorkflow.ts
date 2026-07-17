import type { ChangeReviewAnnotation } from "../../lib/diffReview";

export type ReviewWorkflowPhase = "queued" | "running" | "responded" | "failed" | "cancelled";

export interface ReviewDispatchContext {
  dispatchId: string;
  sessionId: string;
  sourceMessageId: string;
  annotationIds: string[];
  createdAt: number;
}

export interface ReviewWorkflowReceipt {
  id: string;
  annotationIds: string[];
  status: ReviewWorkflowPhase;
  attempt: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  responseMessageId?: string;
  responseExcerpt?: string;
  error?: string;
}

export interface ChangeReviewWorkflowState {
  receipts: ReviewWorkflowReceipt[];
}

export interface ReviewWorkflowSummary {
  open: number;
  unsent: number;
  pending: number;
  latest?: ReviewWorkflowReceipt;
}

const RECEIPT_LIMIT = 24;
const ANNOTATION_LIMIT = 40;
const EXCERPT_LIMIT = 4000;
const ID_LIMIT = 160;
const VALID_STATUSES = new Set<ReviewWorkflowPhase>([
  "queued",
  "running",
  "responded",
  "failed",
  "cancelled",
]);

function boundedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedTimestamp(value: unknown, fallback?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeAnnotationIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => boundedText(item, ID_LIMIT))
    .filter(Boolean))]
    .slice(0, ANNOTATION_LIMIT);
}

export function normalizeReviewDispatchContext(value: unknown): ReviewDispatchContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<ReviewDispatchContext>;
  const dispatchId = boundedText(item.dispatchId, ID_LIMIT);
  const sessionId = boundedText(item.sessionId, ID_LIMIT);
  const sourceMessageId = boundedText(item.sourceMessageId, ID_LIMIT);
  const annotationIds = normalizeAnnotationIds(item.annotationIds);
  const createdAt = boundedTimestamp(item.createdAt);
  if (!dispatchId || !sessionId || !sourceMessageId || !annotationIds.length || !createdAt) return undefined;
  return { dispatchId, sessionId, sourceMessageId, annotationIds, createdAt };
}

export function normalizeReviewWorkflowState(value: unknown): ChangeReviewWorkflowState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rawReceipts = (value as Partial<ChangeReviewWorkflowState>).receipts;
  if (!Array.isArray(rawReceipts)) return undefined;
  const receipts = rawReceipts.flatMap((value): ReviewWorkflowReceipt[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<ReviewWorkflowReceipt>;
    const id = boundedText(item.id, ID_LIMIT);
    const annotationIds = normalizeAnnotationIds(item.annotationIds);
    const status = VALID_STATUSES.has(item.status as ReviewWorkflowPhase)
      ? item.status as ReviewWorkflowPhase
      : undefined;
    const createdAt = boundedTimestamp(item.createdAt);
    if (!id || !annotationIds.length || !status || !createdAt) return [];
    const startedAt = boundedTimestamp(item.startedAt);
    const completedAt = boundedTimestamp(item.completedAt);
    const responseMessageId = boundedText(item.responseMessageId, ID_LIMIT) || undefined;
    const responseExcerpt = boundedText(item.responseExcerpt, EXCERPT_LIMIT) || undefined;
    const error = boundedText(item.error, EXCERPT_LIMIT) || undefined;
    return [{
      id,
      annotationIds,
      status,
      attempt: typeof item.attempt === "number" && Number.isFinite(item.attempt)
        ? Math.max(0, Math.min(Math.floor(item.attempt), 20))
        : 0,
      createdAt,
      startedAt,
      completedAt,
      responseMessageId,
      responseExcerpt,
      error,
    }];
  }).slice(-RECEIPT_LIMIT);
  return receipts.length ? { receipts } : undefined;
}

export function createReviewDispatch(options: {
  dispatchId: string;
  sessionId: string;
  sourceMessageId: string;
  annotations: ChangeReviewAnnotation[];
  state?: ChangeReviewWorkflowState;
  now?: number;
}) {
  const now = options.now ?? Date.now();
  const annotationIds = options.annotations
    .filter((annotation) => !annotation.resolved)
    .map((annotation) => annotation.id)
    .slice(0, ANNOTATION_LIMIT);
  if (!annotationIds.length) return null;
  const context: ReviewDispatchContext = {
    dispatchId: boundedText(options.dispatchId, ID_LIMIT),
    sessionId: boundedText(options.sessionId, ID_LIMIT),
    sourceMessageId: boundedText(options.sourceMessageId, ID_LIMIT),
    annotationIds: normalizeAnnotationIds(annotationIds),
    createdAt: now,
  };
  if (!normalizeReviewDispatchContext(context)) return null;
  const current = normalizeReviewWorkflowState(options.state)?.receipts || [];
  const receipt: ReviewWorkflowReceipt = {
    id: context.dispatchId,
    annotationIds: context.annotationIds,
    status: "queued",
    attempt: 0,
    createdAt: now,
  };
  return {
    context,
    state: { receipts: [...current, receipt].slice(-RECEIPT_LIMIT) } satisfies ChangeReviewWorkflowState,
  };
}

export function transitionReviewWorkflow(
  state: ChangeReviewWorkflowState | undefined,
  context: ReviewDispatchContext,
  status: ReviewWorkflowPhase,
  details: {
    now?: number;
    responseMessageId?: string;
    responseExcerpt?: string;
    error?: string;
  } = {},
): ChangeReviewWorkflowState {
  const now = details.now ?? Date.now();
  const receipts = normalizeReviewWorkflowState(state)?.receipts || [];
  let matched = false;
  const next = receipts.map((receipt) => {
    if (receipt.id !== context.dispatchId) return receipt;
    matched = true;
    const running = status === "running";
    const completed = status === "responded" || status === "failed" || status === "cancelled";
    return {
      ...receipt,
      status,
      attempt: running ? receipt.attempt + 1 : receipt.attempt,
      startedAt: running ? now : receipt.startedAt,
      completedAt: completed ? now : undefined,
      responseMessageId: boundedText(details.responseMessageId, ID_LIMIT) || receipt.responseMessageId,
      responseExcerpt: boundedText(details.responseExcerpt, EXCERPT_LIMIT) || receipt.responseExcerpt,
      error: status === "failed" ? boundedText(details.error, EXCERPT_LIMIT) || receipt.error : undefined,
    };
  });
  if (!matched) {
    next.push({
      id: context.dispatchId,
      annotationIds: context.annotationIds,
      status,
      attempt: status === "running" ? 1 : 0,
      createdAt: context.createdAt,
      startedAt: status === "running" ? now : undefined,
      completedAt: status === "responded" || status === "failed" || status === "cancelled" ? now : undefined,
      responseMessageId: boundedText(details.responseMessageId, ID_LIMIT) || undefined,
      responseExcerpt: boundedText(details.responseExcerpt, EXCERPT_LIMIT) || undefined,
      error: status === "failed" ? boundedText(details.error, EXCERPT_LIMIT) || undefined : undefined,
    });
  }
  return { receipts: next.slice(-RECEIPT_LIMIT) };
}

export function summarizeReviewWorkflow(
  annotations: ChangeReviewAnnotation[],
  state?: ChangeReviewWorkflowState,
): ReviewWorkflowSummary {
  const openIds = new Set(annotations.filter((annotation) => !annotation.resolved).map((annotation) => annotation.id));
  const receipts = normalizeReviewWorkflowState(state)?.receipts || [];
  const dispatched = new Set(receipts.flatMap((receipt) => receipt.annotationIds));
  const latest = receipts.at(-1);
  return {
    open: openIds.size,
    unsent: [...openIds].filter((id) => !dispatched.has(id)).length,
    pending: receipts.filter((receipt) => receipt.status === "queued" || receipt.status === "running").length,
    latest,
  };
}

export function finalizeInterruptedReviewWorkflow(
  state: ChangeReviewWorkflowState | undefined,
  now = Date.now(),
): ChangeReviewWorkflowState | undefined {
  const normalized = normalizeReviewWorkflowState(state);
  if (!normalized) return undefined;
  let changed = false;
  const receipts = normalized.receipts.map((receipt) => {
    if (receipt.status !== "running") return receipt;
    changed = true;
    return { ...receipt, status: "cancelled" as const, completedAt: now };
  });
  return changed ? { receipts } : normalized;
}
