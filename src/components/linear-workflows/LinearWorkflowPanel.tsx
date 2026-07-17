import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  linearWorkflowDiscard,
  linearWorkflowExecute,
  linearWorkflowPrepare,
  linearWorkflowSnapshot,
  type LinearActionKind,
  type LinearActionReceipt,
  type LinearIssueSummary,
  type LinearPreparedAction,
  type LinearWorkflowSnapshot,
} from "../../lib/tauri";
import { cls } from "../../lib/tokens";
import { I } from "../Icons";
import {
  emptyLinearActionDraft,
  linearActionInput,
  searchLinearIssues,
  statesForDraft,
  type LinearActionDraft,
} from "./linearWorkflow";

interface Props {
  dark: boolean;
  language: "ko" | "en";
  onClose: () => void;
}

async function openLinearUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || (parsed.hostname !== "linear.app" && !parsed.hostname.endsWith(".linear.app"))) return;
  const { open } = await import("@tauri-apps/plugin-shell");
  await open(parsed.toString());
}

const LinearWorkflowPanel: React.FC<Props> = ({ dark, language, onClose }) => {
  const [snapshot, setSnapshot] = useState<LinearWorkflowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<LinearActionDraft | null>(null);
  const [prepared, setPrepared] = useState<LinearPreparedAction | null>(null);
  const [receipt, setReceipt] = useState<LinearActionReceipt | null>(null);
  const [operation, setOperation] = useState<"prepare" | "execute" | "discard" | null>(null);
  const isKorean = language === "ko";
  const copy = isKorean
    ? {
        title: "Linear",
        refresh: "Linear 새로 고침",
        close: "Linear 패널 닫기",
        loading: "Linear 상태 확인 중...",
        connect: "설정 > 연결에서 Linear 개인 API 키를 저장하세요.",
        empty: "표시할 Linear 이슈가 없습니다.",
        search: "이슈 검색",
        newIssue: "새 이슈",
        comment: "댓글",
        status: "상태 변경",
        team: "팀",
        issue: "이슈",
        state: "새 상태",
        titleLabel: "제목",
        body: "내용",
        prepare: "전송 내용 확인",
        preparing: "확인 준비 중...",
        approval: "Linear 전송 전 최종 확인",
        approvalExpires: "5분 내 승인해야 합니다.",
        confirm: "Linear에 최종 전송",
        executing: "전송 중...",
        discard: "취소",
        success: "Linear 작업 완료",
        failed: "Linear 작업 실패",
        open: "Linear에서 열기",
        remaining: "남은 요청",
      }
    : {
        title: "Linear",
        refresh: "Refresh Linear",
        close: "Close Linear panel",
        loading: "Checking Linear...",
        connect: "Save a Linear personal API key under Settings > Connections.",
        empty: "No Linear issues to show.",
        search: "Search issues",
        newIssue: "New issue",
        comment: "Comment",
        status: "Change status",
        team: "Team",
        issue: "Issue",
        state: "New status",
        titleLabel: "Title",
        body: "Body",
        prepare: "Review before sending",
        preparing: "Preparing...",
        approval: "Final confirmation before sending to Linear",
        approvalExpires: "Approve within 5 minutes.",
        confirm: "Confirm on Linear",
        executing: "Sending...",
        discard: "Cancel",
        success: "Linear action completed",
        failed: "Linear action failed",
        open: "Open in Linear",
        remaining: "requests remaining",
      };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await linearWorkflowSnapshot(50));
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDraft(null);
    setPrepared(null);
    setReceipt(null);
    load().catch(console.error);
  }, [load]);

  const filteredIssues = useMemo(
    () => searchLinearIssues(snapshot?.issues || [], query),
    [query, snapshot?.issues],
  );

  const startAction = useCallback((kind: LinearActionKind, issue?: LinearIssueSummary) => {
    const firstTeam = snapshot?.teams[0];
    setDraft(emptyLinearActionDraft(kind, issue, firstTeam));
    setPrepared(null);
    setReceipt(null);
    setError(null);
  }, [snapshot?.teams]);

  const updateDraft = <K extends keyof LinearActionDraft>(key: K, value: LinearActionDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setPrepared(null);
  };

  const prepareAction = useCallback(async () => {
    if (!draft || operation) return;
    setOperation("prepare");
    setError(null);
    setReceipt(null);
    try {
      setPrepared(await linearWorkflowPrepare(linearActionInput(draft)));
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setOperation(null);
    }
  }, [draft, operation]);

  const executeAction = useCallback(async () => {
    if (!prepared || operation) return;
    setOperation("execute");
    setError(null);
    try {
      const nextReceipt = await linearWorkflowExecute(prepared.actionId, prepared.actionHash);
      setReceipt(nextReceipt);
      setPrepared(null);
      setDraft(null);
      await load();
    } catch (nextError) {
      setError(String(nextError));
      setPrepared(null);
    } finally {
      setOperation(null);
    }
  }, [load, operation, prepared]);

  const discardPrepared = useCallback(async () => {
    if (operation) return;
    setOperation("discard");
    try {
      if (prepared) await linearWorkflowDiscard(prepared.actionId);
      setPrepared(null);
      setDraft(null);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setOperation(null);
    }
  }, [operation, prepared]);

  const actionTitle = useMemo(() => {
    if (!draft) return "";
    const labels: Record<LinearActionKind, string> = isKorean
      ? { "issue.create": "새 Linear 이슈", "issue.comment": "Linear 이슈 댓글", "issue.status": "Linear 상태 변경" }
      : { "issue.create": "New Linear issue", "issue.comment": "Linear issue comment", "issue.status": "Linear status change" };
    return labels[draft.kind];
  }, [draft, isKorean]);

  const states = snapshot && draft ? statesForDraft(snapshot, draft) : [];
  const canWrite = Boolean(snapshot?.connected && snapshot.viewer);

  return (
    <section className={cls("atelier-github-panel atelier-linear-panel border-b", dark ? "border-dline bg-dbg" : "border-line bg-cream")}>
      <header className="atelier-github-header">
        <div className="atelier-github-identity">
          <span className="atelier-github-mark atelier-linear-mark">LN</span>
          <strong>{copy.title}</strong>
          {snapshot?.viewer && <small>{snapshot.viewer.name}</small>}
          {snapshot?.rateLimitRemaining != null && <small>{snapshot.rateLimitRemaining} {copy.remaining}</small>}
        </div>
        <div className="atelier-github-header-actions">
          <button type="button" onClick={() => startAction("issue.create")} disabled={!canWrite}>{copy.newIssue}</button>
          <button type="button" className="atelier-code-icon-button" onClick={() => load().catch(console.error)} disabled={loading} title={copy.refresh} aria-label={copy.refresh}>
            <span className={loading ? "atelier-workbench-spin" : ""}>↻</span>
          </button>
          <button type="button" className="atelier-code-icon-button" onClick={onClose} title={copy.close} aria-label={copy.close}>{I.x}</button>
        </div>
      </header>

      {loading && !snapshot ? <div className="atelier-github-state">{copy.loading}</div> : null}
      {!loading && snapshot && !snapshot.connected ? <div className="atelier-github-state atelier-github-state-warning">{snapshot.reason || copy.connect}</div> : null}
      {error ? <div className="atelier-github-state atelier-github-state-error">{error}</div> : null}

      {snapshot?.connected && (
        <>
          <div className="atelier-linear-search-row">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} aria-label={copy.search} />
            <span>{filteredIssues.length}</span>
          </div>
          <div className="atelier-github-list">
            {filteredIssues.length ? filteredIssues.map((issue) => (
              <article key={issue.id} className="atelier-github-row">
                <button type="button" className="atelier-github-row-main" onClick={() => openLinearUrl(issue.url).catch(console.error)}>
                  <span>{issue.identifier}</span>
                  <strong>{issue.title}</strong>
                  <small>{issue.state?.name || "—"}{issue.assignee ? ` · ${issue.assignee.name}` : ""}</small>
                </button>
                <div className="atelier-github-row-actions">
                  <button type="button" onClick={() => startAction("issue.comment", issue)}>{copy.comment}</button>
                  <button type="button" onClick={() => startAction("issue.status", issue)}>{copy.status}</button>
                </div>
              </article>
            )) : <div className="atelier-github-empty">{copy.empty}</div>}
          </div>
        </>
      )}

      {draft && snapshot && !prepared && (
        <form className="atelier-github-form" onSubmit={(event) => { event.preventDefault(); prepareAction().catch(console.error); }}>
          <header><strong>{actionTitle}</strong><button type="button" onClick={() => setDraft(null)} aria-label={copy.discard}>{I.x}</button></header>
          {draft.kind === "issue.create" && (
            <>
              <label><span>{copy.team}</span><select value={draft.teamId} onChange={(event) => updateDraft("teamId", event.target.value)}>{snapshot.teams.map((team) => <option key={team.id} value={team.id}>{team.key} · {team.name}</option>)}</select></label>
              <label><span>{copy.titleLabel}</span><input maxLength={500} value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} /></label>
              <label><span>{copy.body}</span><textarea maxLength={60000} rows={4} value={draft.body} onChange={(event) => updateDraft("body", event.target.value)} /></label>
            </>
          )}
          {draft.kind === "issue.comment" && (
            <>
              <label><span>{copy.issue}</span><select value={draft.issueId} onChange={(event) => updateDraft("issueId", event.target.value)}>{snapshot.issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.identifier} · {issue.title}</option>)}</select></label>
              <label><span>{copy.body}</span><textarea maxLength={60000} rows={4} value={draft.body} onChange={(event) => updateDraft("body", event.target.value)} /></label>
            </>
          )}
          {draft.kind === "issue.status" && (
            <>
              <label><span>{copy.issue}</span><select value={draft.issueId} onChange={(event) => { const issue = snapshot.issues.find((candidate) => candidate.id === event.target.value); setDraft((current) => current ? { ...current, issueId: event.target.value, teamId: issue?.team?.id || "", stateId: issue?.state?.id || "" } : current); setPrepared(null); }}>{snapshot.issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.identifier} · {issue.title}</option>)}</select></label>
              <label><span>{copy.state}</span><select value={draft.stateId} onChange={(event) => updateDraft("stateId", event.target.value)}>{states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
            </>
          )}
          <div className="atelier-github-form-actions"><button type="button" onClick={() => setDraft(null)}>{copy.discard}</button><button type="submit" disabled={Boolean(operation)}>{operation === "prepare" ? copy.preparing : copy.prepare}</button></div>
        </form>
      )}

      {prepared && (
        <section className="atelier-github-approval">
          <header><strong>{copy.approval}</strong><small>{copy.approvalExpires}</small></header>
          <pre>{prepared.preview}</pre>
          {error && <div className="atelier-github-state atelier-github-state-error">{error}</div>}
          <div className="atelier-github-form-actions"><button type="button" onClick={() => discardPrepared().catch(console.error)} disabled={Boolean(operation)}>{copy.discard}</button><button type="button" className="danger" onClick={() => executeAction().catch(console.error)} disabled={Boolean(operation)}>{operation === "execute" ? copy.executing : copy.confirm}</button></div>
        </section>
      )}

      {receipt && (
        <div className={cls("atelier-github-receipt", receipt.status === "failed" && "failed")}>
          <strong>{receipt.status === "succeeded" ? copy.success : copy.failed}</strong>
          <span>{receipt.error || receipt.summary}</span>
          {receipt.url && <button type="button" onClick={() => openLinearUrl(receipt.url || "").catch(console.error)}>{copy.open} ↗</button>}
        </div>
      )}
    </section>
  );
};

export default LinearWorkflowPanel;
