import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  agentGitCommit,
  agentGitStage,
  agentGitState,
  agentGitUnstage,
  isTauri,
  type AgentChangeSummary,
  type AgentChangedFile,
  type AgentGitState,
} from "../../lib/tauri";
import { cls } from "../../lib/tokens";
import {
  sourceControlFeatures,
  type SourceControlWorkItem,
} from "../../features/featureRegistry";
import { I } from "../Icons";

const SOURCE_CONTROL_FEATURES = sourceControlFeatures();

interface Props {
  dark: boolean;
  language: "ko" | "en";
  rootPath: string;
  summary: AgentChangeSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
  onOpenFile: (path: string) => void;
  onStartWorkItem: (item: SourceControlWorkItem) => void | Promise<void>;
}

const ChangesWorkbench: React.FC<Props> = ({
  dark,
  language,
  rootPath,
  summary,
  loading,
  error,
  onRefresh,
  onOpenFile,
  onStartWorkItem,
}) => {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [gitState, setGitState] = useState<AgentGitState | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [operation, setOperation] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [externalPanel, setExternalPanel] = useState<string | null>(null);
  const files = summary?.files || [];
  const selectedFile = files.find((file) => file.path === selectedPath) || files[0] || null;
  const stagedPaths = files.filter((file) => file.staged).map((file) => file.path);
  const unstagedPaths = files.filter((file) => file.unstaged).map((file) => file.path);
  const copy = language === "en"
    ? {
        title: "Source control",
        refresh: "Refresh source control",
        open: "Open in editor",
        empty: "No workspace changes were found.",
        binary: "Binary file changed. A text diff is not available.",
        noDiff: "No text diff is available for this file yet.",
        truncated: "Large diff truncated in the viewer.",
        files: "files",
        staged: "Staged",
        unstaged: "Changes",
        untracked: "Untracked",
        stage: "Stage",
        unstage: "Unstage",
        stageAll: "Stage all",
        unstageAll: "Unstage all",
        commitPlaceholder: "Commit message",
        commit: "Commit staged files",
        committing: "Committing...",
        history: "Recent history",
        noHistory: "No commits yet",
        noBranch: "No Git repository",
        github: "GitHub issues, pull requests, checks, and reviews",
        linear: "Linear issues and workflow states",
      }
    : {
        title: "소스 제어",
        refresh: "소스 제어 새로 고침",
        open: "편집기에서 열기",
        empty: "현재 작업 폴더에 변경사항이 없습니다.",
        binary: "바이너리 파일 변경이라 텍스트 차이를 표시할 수 없습니다.",
        noDiff: "이 파일에서 표시할 텍스트 차이가 아직 없습니다.",
        truncated: "큰 변경 내용은 화면 성능을 위해 일부만 표시합니다.",
        files: "개 파일",
        staged: "스테이지됨",
        unstaged: "변경됨",
        untracked: "미추적",
        stage: "스테이지",
        unstage: "스테이지 해제",
        stageAll: "모두 스테이지",
        unstageAll: "모두 해제",
        commitPlaceholder: "커밋 메시지",
        commit: "스테이지된 파일 커밋",
        committing: "커밋 중...",
        history: "최근 기록",
        noHistory: "아직 커밋이 없습니다.",
        noBranch: "Git 저장소 아님",
        github: "GitHub 이슈, PR, 체크 및 리뷰",
        linear: "Linear 이슈 및 워크플로 상태",
      };

  const loadGitState = useCallback(async () => {
    if (!rootPath || !isTauri()) return;
    setGitLoading(true);
    setGitError(null);
    try {
      setGitState(await agentGitState(rootPath, 12));
    } catch (nextError) {
      setGitState(null);
      setGitError(String(nextError));
    } finally {
      setGitLoading(false);
    }
  }, [rootPath]);

  const refreshAll = useCallback(async () => {
    await Promise.all([Promise.resolve(onRefresh()), loadGitState()]);
  }, [loadGitState, onRefresh]);

  const runOperation = useCallback(async (
    name: string,
    task: () => Promise<AgentGitState>,
  ) => {
    if (operation) return;
    setOperation(name);
    setGitError(null);
    try {
      setGitState(await task());
      await Promise.resolve(onRefresh());
    } catch (nextError) {
      setGitError(String(nextError));
    } finally {
      setOperation(null);
    }
  }, [onRefresh, operation]);

  useEffect(() => {
    loadGitState().catch(console.error);
  }, [loadGitState]);

  useEffect(() => {
    if (selectedPath && files.some((file) => file.path === selectedPath)) return;
    setSelectedPath(files[0]?.path || null);
  }, [files, selectedPath]);

  const diffLines = useMemo(() => {
    if (!selectedFile?.diff) return [];
    return selectedFile.diff.split("\n").slice(0, 5000);
  }, [selectedFile]);
  const diffTruncated = Boolean(selectedFile?.diff && selectedFile.diff.split("\n").length > diffLines.length);
  const busy = loading || gitLoading || Boolean(operation);
  const activeSourceControl = SOURCE_CONTROL_FEATURES.find((feature) => feature.id === externalPanel);
  const ActiveSourceControlPanel = activeSourceControl?.component;

  return (
    <section className={cls("atelier-changes-workbench", dark ? "bg-dbg" : "bg-cream")} data-testid="changes-workbench">
      <header className={cls("atelier-changes-toolbar border-b", dark ? "border-dline" : "border-line")}>
        <div className="atelier-changes-heading">
          <span>{I.shieldCheck}</span>
          <strong>{copy.title}</strong>
          {gitState ? (
            <span className="atelier-git-branch" title={gitState.root}>
              {gitState.branch}{gitState.head ? ` · ${gitState.head}` : ""}
              {gitState.ahead > 0 ? ` ↑${gitState.ahead}` : ""}
              {gitState.behind > 0 ? ` ↓${gitState.behind}` : ""}
            </span>
          ) : (
            <span className={dark ? "text-dsub" : "text-sub"}>{copy.noBranch}</span>
          )}
          {summary && (
            <span className={dark ? "text-dsub" : "text-sub"}>
              {files.length}{copy.files} · <b className="atelier-diff-add">+{summary.additions}</b> <b className="atelier-diff-delete">-{summary.deletions}</b>
            </span>
          )}
        </div>
        <div className="atelier-changes-toolbar-actions">
          {SOURCE_CONTROL_FEATURES.map((feature) => (
            <button
              key={feature.id}
              type="button"
              className={cls("atelier-github-toolbar-button", externalPanel === feature.id && "active")}
              onClick={() => setExternalPanel((panel) => panel === feature.id ? null : feature.id)}
              aria-pressed={externalPanel === feature.id}
              title={feature.title[language]}
            >
              {feature.shortLabel}
            </button>
          ))}
          <button
            type="button"
            className={cls("atelier-code-icon-button", dark ? "text-dsub hover:text-dink" : "text-sub hover:text-ink")}
            onClick={() => refreshAll().catch(console.error)}
            disabled={busy}
            title={copy.refresh}
            aria-label={copy.refresh}
          >
            <span className={busy ? "atelier-workbench-spin" : ""}>↻</span>
          </button>
        </div>
      </header>

      {(error || gitError) && <div className="atelier-workbench-error">{error || gitError}</div>}

      {ActiveSourceControlPanel && (
        <ActiveSourceControlPanel
          dark={dark}
          language={language}
          rootPath={rootPath}
          onStartWorkItem={onStartWorkItem}
          onClose={() => setExternalPanel(null)}
        />
      )}

      <div className="atelier-changes-body">
        <aside className={cls("atelier-changes-file-list border-r", dark ? "border-dline" : "border-line")}>
          <div className={cls("atelier-git-summary border-b", dark ? "border-dline" : "border-line")}>
            <span><b>{gitState?.staged_count || 0}</b> {copy.staged}</span>
            <span><b>{gitState?.unstaged_count || 0}</b> {copy.unstaged}</span>
            <span><b>{gitState?.untracked_count || 0}</b> {copy.untracked}</span>
          </div>

          <div className="atelier-git-bulk-actions">
            <button
              type="button"
              disabled={busy || unstagedPaths.length === 0}
              onClick={() => runOperation("stage-all", () => agentGitStage(rootPath, unstagedPaths))}
            >
              {copy.stageAll}
            </button>
            <button
              type="button"
              disabled={busy || stagedPaths.length === 0}
              onClick={() => runOperation("unstage-all", () => agentGitUnstage(rootPath, stagedPaths))}
            >
              {copy.unstageAll}
            </button>
          </div>

          <div className="atelier-git-file-scroll">
            {files.length === 0 ? (
              <div className={cls("atelier-git-empty", dark ? "text-dsub" : "text-sub")}>
                {loading ? "..." : copy.empty}
              </div>
            ) : files.map((file) => (
              <ChangeFileButton
                key={file.path}
                file={file}
                dark={dark}
                active={file.path === selectedFile?.path}
                stagedLabel={copy.staged}
                unstagedLabel={copy.unstaged}
                onClick={() => setSelectedPath(file.path)}
              />
            ))}
          </div>

          <div className={cls("atelier-git-commit border-t", dark ? "border-dline" : "border-line")}>
            <textarea
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder={copy.commitPlaceholder}
              rows={2}
              maxLength={2000}
            />
            <button
              type="button"
              disabled={busy || !commitMessage.trim() || (gitState?.staged_count || 0) === 0}
              onClick={() => runOperation("commit", async () => {
                const next = await agentGitCommit(rootPath, commitMessage);
                setCommitMessage("");
                return next;
              })}
            >
              {operation === "commit" ? copy.committing : copy.commit}
            </button>
          </div>

          <details className={cls("atelier-git-history border-t", dark ? "border-dline" : "border-line")}>
            <summary>{copy.history}</summary>
            <div>
              {gitState?.recent_commits.length ? gitState.recent_commits.map((commit) => (
                <div key={commit.hash} className="atelier-git-history-row" title={commit.hash}>
                  <code>{commit.short_hash}</code>
                  <span>{commit.subject}</span>
                  <small>{commit.author}</small>
                </div>
              )) : <span className={dark ? "text-dsub" : "text-sub"}>{copy.noHistory}</span>}
            </div>
          </details>
        </aside>

        <div className="atelier-changes-diff-shell">
          {selectedFile ? (
            <>
              <header className={cls("atelier-changes-file-header border-b", dark ? "border-dline" : "border-line")}>
                <div className="min-w-0">
                  <strong>{selectedFile.path}</strong>
                  <span>{selectedFile.status} · <b className="atelier-diff-add">+{selectedFile.additions}</b> <b className="atelier-diff-delete">-{selectedFile.deletions}</b></span>
                </div>
                <div className="atelier-git-file-actions">
                  {selectedFile.unstaged && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runOperation("stage-one", () => agentGitStage(rootPath, [selectedFile.path]))}
                    >
                      {copy.stage}
                    </button>
                  )}
                  {selectedFile.staged && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runOperation("unstage-one", () => agentGitUnstage(rootPath, [selectedFile.path]))}
                    >
                      {copy.unstage}
                    </button>
                  )}
                  <button type="button" onClick={() => onOpenFile(selectedFile.path)}>
                    {copy.open}<span>↗</span>
                  </button>
                </div>
              </header>
              {selectedFile.binary ? (
                <div className="atelier-workbench-empty">{copy.binary}</div>
              ) : diffLines.length > 0 ? (
                <div className="atelier-changes-diff" role="region" aria-label={selectedFile.path}>
                  {diffLines.map((line, index) => (
                    <div key={`${index}-${line.slice(0, 24)}`} className={diffLineClass(line)}>
                      <span>{index + 1}</span>
                      <code>{line || " "}</code>
                    </div>
                  ))}
                  {diffTruncated && <div className="atelier-changes-truncated">{copy.truncated}</div>}
                </div>
              ) : (
                <div className="atelier-workbench-empty">{copy.noDiff}</div>
              )}
            </>
          ) : (
            <div className={cls("atelier-workbench-empty", dark ? "text-dsub" : "text-sub")}>
              <span className="atelier-workbench-empty-icon">{I.check}</span>
              <p>{copy.empty}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const ChangeFileButton: React.FC<{
  file: AgentChangedFile;
  dark: boolean;
  active: boolean;
  stagedLabel: string;
  unstagedLabel: string;
  onClick: () => void;
}> = ({ file, dark, active, stagedLabel, unstagedLabel, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cls(
      "atelier-changes-file-button",
      active
        ? dark ? "bg-[#343432] text-dink" : "bg-line text-ink"
        : dark ? "text-dink hover:bg-[#2a2a28]" : "text-ink hover:bg-muted",
    )}
    title={file.path}
  >
    <span className="atelier-change-status">{file.status.slice(0, 2)}</span>
    <span className="atelier-change-path">
      {file.path}
      <small>
        {file.staged && <em>{stagedLabel}</em>}
        {file.unstaged && <em>{unstagedLabel}</em>}
      </small>
    </span>
    <span className="atelier-change-counts">
      <b className="atelier-diff-add">+{file.additions}</b>
      <b className="atelier-diff-delete">-{file.deletions}</b>
    </span>
  </button>
);

function diffLineClass(line: string): string {
  if (line.startsWith("+++ ") || line.startsWith("--- ")) return "atelier-diff-line atelier-diff-meta";
  if (line.startsWith("@@")) return "atelier-diff-line atelier-diff-hunk";
  if (line.startsWith("+")) return "atelier-diff-line atelier-diff-line-add";
  if (line.startsWith("-")) return "atelier-diff-line atelier-diff-line-delete";
  return "atelier-diff-line";
}

export default ChangesWorkbench;
