import type { ChangeReviewAnnotation } from "../../lib/diffReview";
import {
  summarizeReviewWorkflow,
  type ChangeReviewWorkflowState,
  type ReviewWorkflowPhase,
} from "./reviewWorkflow";

interface ReviewWorkflowStatusProps {
  annotations: ChangeReviewAnnotation[];
  state?: ChangeReviewWorkflowState;
  language: "ko" | "en";
  disabled?: boolean;
  onSend: () => void;
}

const STATUS_LABELS: Record<ReviewWorkflowPhase, { ko: string; en: string }> = {
  queued: { ko: "전달 대기", en: "Queued" },
  running: { ko: "반영 중", en: "Applying" },
  responded: { ko: "응답 도착", en: "Response received" },
  failed: { ko: "전달 실패", en: "Failed" },
  cancelled: { ko: "전달 취소", en: "Cancelled" },
};

export default function ReviewWorkflowStatus({
  annotations,
  state,
  language,
  disabled,
  onSend,
}: ReviewWorkflowStatusProps) {
  const summary = summarizeReviewWorkflow(annotations, state);
  if (!summary.open) return null;
  const isKorean = language === "ko";
  const latest = summary.latest;
  const statusLabel = latest ? STATUS_LABELS[latest.status][language] : null;
  const canSend = !disabled && summary.pending === 0;
  const sendLabel = latest
    ? (isKorean ? "리뷰 다시 전달" : "Send review again")
    : (isKorean ? "리뷰 전달" : "Send review");
  return (
    <div className="atelier-review-workflow" data-status={latest?.status || "draft"}>
      <div className="atelier-review-workflow-summary">
        <span>{isKorean ? `미해결 ${summary.open}개` : `${summary.open} unresolved`}</span>
        {summary.unsent > 0 && (
          <span>{isKorean ? `미전송 ${summary.unsent}개` : `${summary.unsent} unsent`}</span>
        )}
        {statusLabel && <span className="atelier-review-workflow-state">{statusLabel}</span>}
        {latest && latest.attempt > 1 && (
          <span>{isKorean ? `${latest.attempt}차 시도` : `Attempt ${latest.attempt}`}</span>
        )}
      </div>
      <button type="button" disabled={!canSend} onClick={onSend}>
        {summary.pending > 0 ? statusLabel : sendLabel} ↗
      </button>
      {latest && (latest.responseExcerpt || latest.error) && (
        <details className="atelier-review-workflow-evidence">
          <summary>{isKorean ? "응답 증거" : "Response evidence"}</summary>
          <pre>{latest.error || latest.responseExcerpt}</pre>
        </details>
      )}
    </div>
  );
}
