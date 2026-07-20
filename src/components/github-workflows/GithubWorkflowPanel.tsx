import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  githubWorkflowDiscard,
  githubWorkflowExecute,
  githubWorkflowPrepare,
  githubWorkflowSnapshot,
  type GithubActionKind,
  type GithubActionReceipt,
  type GithubPreparedAction,
  type GithubWorkflowSnapshot,
} from "../../lib/tauri";
import { cls } from "../../lib/tokens";
import type {
  SourceControlFeatureProps,
  SourceControlWorkItem,
} from "../../features/featureRegistry";
import { useFeatureSetting } from "../../features/featureSettings";
import { I } from "../Icons";
import {
  emptyGithubActionDraft,
  githubActionInput,
  githubChecksLabel,
  githubIssueWorkItem,
  githubPullWorkItem,
  type GithubActionDraft,
} from "./githubWorkflow";

type GithubTab = "issues" | "pulls";

async function openExternalUrl(url: string) {
  if (!url.startsWith("https://")) return;
  const { open } = await import("@tauri-apps/plugin-shell");
  await open(url);
}

const GithubWorkflowPanel: React.FC<SourceControlFeatureProps> = ({
  dark,
  language,
  rootPath,
  onStartWorkItem,
  onClose,
}) => {
  const [featureEnabled] = useFeatureSetting<boolean>("github-workflows", "enabled", true);
  const [refreshIntervalSeconds] = useFeatureSetting<number>(
    "github-workflows",
    "refreshIntervalSeconds",
    0,
  );
  const [snapshot, setSnapshot] = useState<GithubWorkflowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<GithubTab>("pulls");
  const [draft, setDraft] = useState<GithubActionDraft | null>(null);
  const [prepared, setPrepared] = useState<GithubPreparedAction | null>(null);
  const [receipt, setReceipt] = useState<GithubActionReceipt | null>(null);
  const [operation, setOperation] = useState<"prepare" | "execute" | "discard" | null>(null);
  const isKorean = language === "ko";
  const copy = isKorean
    ? {
        title: "GitHub",
        issues: "이슈",
        pulls: "PR",
        refresh: "GitHub 새로 고침",
        close: "GitHub 패널 닫기",
        unavailable: "GitHub CLI를 찾지 못했습니다.",
        signIn: "GitHub CLI 로그인이 필요합니다.",
        emptyIssues: "표시할 이슈가 없습니다.",
        emptyPulls: "표시할 PR이 없습니다.",
        newIssue: "새 이슈",
        newPull: "새 PR",
        comment: "댓글",
        review: "리뷰",
        reviewers: "검토자",
        titleLabel: "제목",
        bodyLabel: "내용",
        numberLabel: "번호",
        baseLabel: "기준 브랜치",
        reviewerLabel: "검토자 계정",
        decisionLabel: "리뷰 결과",
        draftPull: "초안 PR",
        prepare: "전송 내용 확인",
        preparing: "확인 준비 중...",
        confirm: "GitHub에 최종 전송",
        executing: "전송 중...",
        discard: "취소",
        approval: "전송 전 최종 확인",
        approvalExpires: "5분 내 승인해야 합니다.",
        success: "GitHub 작업 완료",
        failed: "GitHub 작업 실패",
        open: "GitHub에서 열기",
        checks: "체크",
        reviewRequired: "리뷰 필요",
        startWork: "작업 시작",
        loading: "GitHub 상태 확인 중...",
      }
    : {
        title: "GitHub",
        issues: "Issues",
        pulls: "Pull requests",
        refresh: "Refresh GitHub",
        close: "Close GitHub panel",
        unavailable: "GitHub CLI was not found.",
        signIn: "GitHub CLI sign-in is required.",
        emptyIssues: "No issues to show.",
        emptyPulls: "No pull requests to show.",
        newIssue: "New issue",
        newPull: "New PR",
        comment: "Comment",
        review: "Review",
        reviewers: "Reviewers",
        titleLabel: "Title",
        bodyLabel: "Body",
        numberLabel: "Number",
        baseLabel: "Base branch",
        reviewerLabel: "Reviewer logins",
        decisionLabel: "Review decision",
        draftPull: "Draft PR",
        prepare: "Review before sending",
        preparing: "Preparing...",
        confirm: "Confirm on GitHub",
        executing: "Sending...",
        discard: "Cancel",
        approval: "Final confirmation",
        approvalExpires: "Approve within 5 minutes.",
        success: "GitHub action completed",
        failed: "GitHub action failed",
        open: "Open on GitHub",
        checks: "Checks",
        reviewRequired: "Review required",
        startWork: "Start task",
        loading: "Checking GitHub...",
      };

  const load = useCallback(async () => {
    if (!featureEnabled || !rootPath) return;
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await githubWorkflowSnapshot(rootPath, 30));
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoading(false);
    }
  }, [featureEnabled, rootPath]);

  useEffect(() => {
    setSnapshot(null);
    setDraft(null);
    setPrepared(null);
    setReceipt(null);
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    if (!featureEnabled || refreshIntervalSeconds <= 0) return;
    const timer = window.setInterval(() => {
      load().catch(console.error);
    }, refreshIntervalSeconds * 1_000);
    return () => window.clearInterval(timer);
  }, [featureEnabled, load, refreshIntervalSeconds]);

  const startAction = useCallback((kind: GithubActionKind, number?: number) => {
    setDraft(emptyGithubActionDraft(kind, number));
    setPrepared(null);
    setReceipt(null);
    setError(null);
  }, []);

  const prepareAction = useCallback(async () => {
    if (!draft || operation) return;
    setOperation("prepare");
    setError(null);
    setReceipt(null);
    try {
      setPrepared(await githubWorkflowPrepare(rootPath, githubActionInput(draft)));
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setOperation(null);
    }
  }, [draft, operation, rootPath]);

  const executeAction = useCallback(async () => {
    if (!prepared || operation) return;
    setOperation("execute");
    setError(null);
    try {
      const nextReceipt = await githubWorkflowExecute(prepared.actionId, prepared.actionHash);
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
      if (prepared) await githubWorkflowDiscard(prepared.actionId);
      setPrepared(null);
      setDraft(null);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setOperation(null);
    }
  }, [operation, prepared]);

  const stateReason = snapshot?.reason || error;
  const actionTitle = useMemo(() => {
    if (!draft) return "";
    const labels: Record<GithubActionKind, string> = isKorean
      ? {
          "issue.create": "새 이슈",
          "issue.comment": "이슈 댓글",
          "pr.create": "새 PR",
          "pr.comment": "PR 댓글",
          "pr.review": "PR 리뷰",
          "pr.reviewers": "PR 검토자 요청",
        }
      : {
          "issue.create": "New issue",
          "issue.comment": "Issue comment",
          "pr.create": "New pull request",
          "pr.comment": "Pull request comment",
          "pr.review": "Pull request review",
          "pr.reviewers": "Request reviewers",
        };
    return labels[draft.kind];
  }, [draft, isKorean]);

  const updateDraft = <K extends keyof GithubActionDraft>(key: K, value: GithubActionDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setPrepared(null);
  };

  const startWorkItem = useCallback((item: SourceControlWorkItem) => {
    setError(null);
    return Promise.resolve(onStartWorkItem(item)).catch((nextError) => {
      setError(String(nextError));
    });
  }, [onStartWorkItem]);

  if (!featureEnabled) {
    return (
      <section className={cls("atelier-github-panel border-b", dark ? "border-dline bg-dbg" : "border-line bg-cream")}>
        <header className="atelier-github-header">
          <div className="atelier-github-identity"><span className="atelier-github-mark">GH</span><strong>{copy.title}</strong></div>
          <button type="button" className="atelier-code-icon-button" onClick={onClose} title={copy.close} aria-label={copy.close}>{I.x}</button>
        </header>
        <div className="atelier-github-state">{isKorean ? "설정에서 GitHub 워크플로를 켜세요." : "Enable GitHub workflows in Settings."}</div>
      </section>
    );
  }

  return (
    <section className={cls("atelier-github-panel border-b", dark ? "border-dline bg-dbg" : "border-line bg-cream")}>
      <header className="atelier-github-header">
        <div className="atelier-github-identity">
          <span className="atelier-github-mark">GH</span>
          <strong>{snapshot?.repository || copy.title}</strong>
          {snapshot?.login && <small>@{snapshot.login}</small>}
        </div>
        <div className="atelier-github-header-actions">
          <button type="button" onClick={() => startAction("issue.create")} disabled={!snapshot?.authenticated}>{copy.newIssue}</button>
          <button type="button" onClick={() => startAction("pr.create")} disabled={!snapshot?.authenticated}>{copy.newPull}</button>
          <button type="button" className="atelier-code-icon-button" onClick={() => load().catch(console.error)} disabled={loading} title={copy.refresh} aria-label={copy.refresh}>
            <span className={loading ? "atelier-workbench-spin" : ""}>↻</span>
          </button>
          <button type="button" className="atelier-code-icon-button" onClick={onClose} title={copy.close} aria-label={copy.close}>{I.x}</button>
        </div>
      </header>

      {loading && !snapshot ? <div className="atelier-github-state">{copy.loading}</div> : null}
      {!loading && snapshot && !snapshot.available ? <div className="atelier-github-state atelier-github-state-error">{stateReason || copy.unavailable}</div> : null}
      {!loading && snapshot?.available && !snapshot.authenticated ? <div className="atelier-github-state atelier-github-state-error">{stateReason || copy.signIn}</div> : null}
      {stateReason && snapshot?.authenticated ? <div className="atelier-github-state atelier-github-state-warning">{stateReason}</div> : null}
      {error && !snapshot ? <div className="atelier-github-state atelier-github-state-error">{error}</div> : null}

      {snapshot?.authenticated && (
        <>
          <nav className="atelier-github-tabs" aria-label={copy.title}>
            <button type="button" className={tab === "pulls" ? "active" : ""} onClick={() => setTab("pulls")}>{copy.pulls} <span>{snapshot.pullRequests.length}</span></button>
            <button type="button" className={tab === "issues" ? "active" : ""} onClick={() => setTab("issues")}>{copy.issues} <span>{snapshot.issues.length}</span></button>
          </nav>

          <div className="atelier-github-list">
            {tab === "issues" && (snapshot.issues.length ? snapshot.issues.map((issue) => (
              <article key={`issue-${issue.number}`} className="atelier-github-row">
                <button type="button" className="atelier-github-row-main" onClick={() => openExternalUrl(issue.url).catch(console.error)}>
                  <span>#{issue.number}</span>
                  <strong>{issue.title}</strong>
                  <small>{issue.state}{issue.author ? ` · @${issue.author}` : ""}</small>
                </button>
                <div className="atelier-github-row-actions">
                  <button type="button" onClick={() => startWorkItem(githubIssueWorkItem(issue, rootPath, language))}>{copy.startWork}</button>
                  <button type="button" onClick={() => startAction("issue.comment", issue.number)}>{copy.comment}</button>
                </div>
              </article>
            )) : <div className="atelier-github-empty">{copy.emptyIssues}</div>)}

            {tab === "pulls" && (snapshot.pullRequests.length ? snapshot.pullRequests.map((pull) => (
              <article key={`pull-${pull.number}`} className="atelier-github-row atelier-github-pr-row">
                <button type="button" className="atelier-github-row-main" onClick={() => openExternalUrl(pull.url).catch(console.error)}>
                  <span>#{pull.number}</span>
                  <strong>{pull.title}</strong>
                  <small>{pull.headRefName} → {pull.baseRefName} · {githubChecksLabel(pull, language)}</small>
                </button>
                <div className="atelier-github-row-actions">
                  <button type="button" onClick={() => startWorkItem(githubPullWorkItem(pull, rootPath, language))}>{copy.startWork}</button>
                  <button type="button" onClick={() => startAction("pr.comment", pull.number)}>{copy.comment}</button>
                  <button type="button" onClick={() => startAction("pr.review", pull.number)}>{copy.review}</button>
                  <button type="button" onClick={() => startAction("pr.reviewers", pull.number)}>{copy.reviewers}</button>
                </div>
              </article>
            )) : <div className="atelier-github-empty">{copy.emptyPulls}</div>)}
          </div>
        </>
      )}

      {draft && !prepared && (
        <form className="atelier-github-form" onSubmit={(event) => { event.preventDefault(); prepareAction().catch(console.error); }}>
          <header><strong>{actionTitle}</strong><button type="button" onClick={() => setDraft(null)} aria-label={copy.discard}>{I.x}</button></header>
          {(draft.kind.endsWith(".comment") || draft.kind === "pr.review" || draft.kind === "pr.reviewers") && (
            <label><span>{copy.numberLabel}</span><input inputMode="numeric" value={draft.number} onChange={(event) => updateDraft("number", event.target.value)} /></label>
          )}
          {(draft.kind === "issue.create" || draft.kind === "pr.create") && (
            <label><span>{copy.titleLabel}</span><input maxLength={500} value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} /></label>
          )}
          {draft.kind === "pr.create" && (
            <div className="atelier-github-form-row">
              <label><span>{copy.baseLabel}</span><input value={draft.base} placeholder={snapshot.defaultBranch || "main"} onChange={(event) => updateDraft("base", event.target.value)} /></label>
              <label className="atelier-github-checkbox"><input type="checkbox" checked={draft.draft} onChange={(event) => updateDraft("draft", event.target.checked)} /><span>{copy.draftPull}</span></label>
            </div>
          )}
          {draft.kind === "pr.review" && (
            <label><span>{copy.decisionLabel}</span><select value={draft.reviewDecision} onChange={(event) => updateDraft("reviewDecision", event.target.value as GithubActionDraft["reviewDecision"])}><option value="comment">Comment</option><option value="approve">Approve</option><option value="request_changes">Request changes</option></select></label>
          )}
          {draft.kind === "pr.reviewers" ? (
            <label><span>{copy.reviewerLabel}</span><input value={draft.reviewers} placeholder="octocat, reviewer" onChange={(event) => updateDraft("reviewers", event.target.value)} /></label>
          ) : (
            <label><span>{copy.bodyLabel}</span><textarea maxLength={60000} rows={4} value={draft.body} onChange={(event) => updateDraft("body", event.target.value)} /></label>
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
          {receipt.url && <button type="button" onClick={() => openExternalUrl(receipt.url || "").catch(console.error)}>{copy.open} ↗</button>}
        </div>
      )}
    </section>
  );
};

export default GithubWorkflowPanel;
