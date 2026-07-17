import type { ReactNode } from "react";
import { cls } from "../../lib/tokens";
import {
  latestAgentFleetAdoption,
  summarizeAgentFleetCandidates,
  type AgentFleetAdoptionHistory,
  type AgentFleetCandidatePhase,
} from "./agentFleet";

export interface AgentFleetCandidateView {
  id: string;
  profileName: string;
  providerShort: string;
  dot: string;
  branch?: string;
  phase: AgentFleetCandidatePhase;
  changeCount?: number;
  additions?: number;
  deletions?: number;
  preview: string;
  adoption?: AgentFleetAdoptionHistory;
  canAdopt: boolean;
}

export interface AgentFleetPanelCopy {
  compare: string;
  progress: (completed: number, count: number) => string;
  running: string;
  done: string;
  failed: string;
  waiting: string;
  noChanges: string;
  open: string;
  adopt: string;
  adopted: string;
  adoptedFiles: (count: number) => string;
  adoptionVerifying: string;
  adoptionFailed: string;
  adoptionCancelled: string;
  adoptionEvidence: string;
  patchReceipt: string;
  stopAll: string;
  stoppingAll: string;
}

interface AgentFleetPanelProps {
  dark: boolean;
  icon: ReactNode;
  batchLabel?: string;
  activeCandidateId?: string;
  candidates: AgentFleetCandidateView[];
  copy: AgentFleetPanelCopy;
  stopping?: boolean;
  onOpenCandidate: (candidateId: string) => void;
  onAdoptCandidate: (candidateId: string) => void;
  onStopAll: () => void;
}

function receiptFileName(path?: string) {
  if (!path) return "";
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

export default function AgentFleetPanel({
  dark,
  icon,
  batchLabel,
  activeCandidateId,
  candidates,
  copy,
  stopping,
  onOpenCandidate,
  onAdoptCandidate,
  onStopAll,
}: AgentFleetPanelProps) {
  if (candidates.length < 2) return null;
  const summary = summarizeAgentFleetCandidates(candidates);
  return (
    <section
      className={cls(
        "atelier-parallel-results w-full max-w-[920px] mx-auto mb-4 rounded-[8px] border",
        dark ? "border-dline bg-dsurf" : "border-line bg-surface",
      )}
      data-testid="agent-fleet-results"
    >
      <div className={cls("px-3 py-2.5 border-b flex flex-wrap items-center gap-2", dark ? "border-dline" : "border-line")}>
        <span className="text-[#e26f4f]">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium">{copy.compare}</div>
          <div className={cls("truncate text-[10.5px]", dark ? "text-dsub" : "text-sub")}>
            {batchLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cls("text-[10.5px] font-mono", dark ? "text-dsub" : "text-sub")}>
            {copy.progress(summary.completed, summary.total)}
          </span>
          {summary.running > 0 && (
            <button
              type="button"
              onClick={onStopAll}
              disabled={stopping}
              className={cls(
                "h-7 rounded-[7px] border px-2.5 text-[10.5px] font-medium disabled:opacity-50",
                dark
                  ? "border-[#7a4638] bg-[#2a211e] text-[#f28b68] hover:bg-[#342722]"
                  : "border-[#d7a08a] bg-[#fff4ef] text-[#b94f2f] hover:bg-[#ffe8df]",
              )}
            >
              {stopping ? copy.stoppingAll : copy.stopAll}
            </button>
          )}
        </div>
        <div className={cls("basis-full h-1 overflow-hidden rounded-full", dark ? "bg-[#343432]" : "bg-[#e7e3da]")}>
          <div
            className="h-full rounded-full bg-[#e26f4f] transition-[width] duration-300"
            style={{ width: `${summary.total > 0 ? (summary.completed / summary.total) * 100 : 0}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y divide-inherit sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-3">
        {candidates.map((candidate) => {
          const receipt = latestAgentFleetAdoption(candidate.adoption);
          const phaseLabel = candidate.phase === "running"
            ? copy.running
            : candidate.phase === "done"
              ? copy.done
              : candidate.phase === "failed"
                ? copy.failed
                : copy.waiting;
          const adoptionLabel = receipt?.status === "adopted"
            ? copy.adopted
            : receipt?.status === "verifying"
              ? copy.adoptionVerifying
              : receipt?.status === "failed"
                ? copy.adoptionFailed
                : receipt?.status === "cancelled"
                  ? copy.adoptionCancelled
                  : null;
          return (
            <div
              key={candidate.id}
              className={cls(
                "min-w-0 transition-colors",
                activeCandidateId === candidate.id
                  ? dark ? "bg-[#30302e]" : "bg-[#f1eee7]"
                  : dark ? "hover:bg-[#2b2b29]" : "hover:bg-muted",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenCandidate(candidate.id)}
                className="w-full px-3 py-2.5 text-left"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-5 w-5 shrink-0 rounded-[6px] grid place-items-center text-[8px] font-semibold"
                    style={{
                      background: `${candidate.dot}22`,
                      boxShadow: `inset 0 0 0 1px ${candidate.dot}66`,
                    }}
                  >
                    {candidate.providerShort}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">{candidate.profileName}</span>
                  <span className={cls(
                    "shrink-0 text-[10px] font-mono",
                    candidate.phase === "done"
                      ? "text-[#31b879]"
                      : candidate.phase === "failed"
                        ? "text-[#e06a5f]"
                        : dark ? "text-dsub" : "text-sub",
                  )}>
                    {phaseLabel}
                  </span>
                </div>
                <div className={cls("mt-1.5 flex min-w-0 items-center gap-2 text-[10px] font-mono", dark ? "text-dsub" : "text-sub")}>
                  <span className="min-w-0 flex-1 truncate">{candidate.branch || copy.waiting}</span>
                  {typeof candidate.changeCount === "number" ? (
                    <span className="shrink-0">
                      {candidate.changeCount} · <span className="text-[#31b879]">+{candidate.additions || 0}</span>{" "}
                      <span className="text-[#e06a5f]">-{candidate.deletions || 0}</span>
                    </span>
                  ) : (
                    <span className="shrink-0">{copy.noChanges}</span>
                  )}
                </div>
                <div className="mt-2 flex min-w-0 items-end gap-2">
                  <span className={cls("atelier-parallel-preview min-w-0 flex-1 text-[10.5px] leading-[1.45]", dark ? "text-dsub" : "text-sub")}>
                    {candidate.preview}
                  </span>
                  <span className={cls("shrink-0 text-[10.5px] font-medium", dark ? "text-dink" : "text-ink")}>
                    {copy.open} ›
                  </span>
                </div>
              </button>
              {adoptionLabel ? (
                <div className={cls("border-t px-3 py-2 text-[10.5px]", dark ? "border-dline" : "border-line")}>
                  <div className={cls(
                    "font-medium",
                    receipt?.status === "adopted"
                      ? dark ? "text-[#56c893]" : "text-[#168454]"
                      : receipt?.status === "failed"
                        ? "text-[#e06a5f]"
                        : dark ? "text-dsub" : "text-sub",
                  )}>
                    {adoptionLabel}
                    {receipt?.status === "adopted" && typeof receipt.fileCount === "number"
                      ? ` · ${copy.adoptedFiles(receipt.fileCount)} · +${receipt.additions || 0} -${receipt.deletions || 0}`
                      : ""}
                  </div>
                  {receipt && (receipt.patchReceiptPath || receipt.error) && (
                    <details className="mt-1">
                      <summary className="cursor-pointer select-none">{copy.adoptionEvidence}</summary>
                      <div className={cls("mt-1 break-words font-mono text-[9.5px] leading-[1.45]", dark ? "text-dsub" : "text-sub")}>
                        {receipt.error || `${copy.patchReceipt}: ${receiptFileName(receipt.patchReceiptPath)}`}
                      </div>
                    </details>
                  )}
                  {(receipt?.status === "failed" || receipt?.status === "cancelled") && candidate.canAdopt && (
                    <button
                      type="button"
                      onClick={() => onAdoptCandidate(candidate.id)}
                      className={cls("mt-2 h-7 rounded-[6px] border px-2.5 font-medium", dark ? "border-[#7a4638] text-[#f28b68]" : "border-[#d7a08a] text-[#b94f2f]")}
                    >
                      {copy.adopt}
                    </button>
                  )}
                </div>
              ) : candidate.canAdopt ? (
                <div className={cls("flex justify-end border-t px-3 py-2", dark ? "border-dline" : "border-line")}>
                  <button
                    type="button"
                    onClick={() => onAdoptCandidate(candidate.id)}
                    className={cls(
                      "h-7 rounded-[6px] border px-2.5 text-[10.5px] font-medium",
                      dark
                        ? "border-[#7a4638] bg-[#2a211e] text-[#f28b68] hover:bg-[#342722]"
                        : "border-[#d7a08a] bg-[#fff4ef] text-[#b94f2f] hover:bg-[#ffe8df]",
                    )}
                  >
                    {copy.adopt}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
