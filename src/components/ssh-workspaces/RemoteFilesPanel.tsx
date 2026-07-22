import React, { useEffect, useMemo, useState } from "react";
import {
  sshRemoteDirectoryList,
  sshRemoteFileRead,
  sshRemoteFileWriteExecute,
  sshRemoteFileWritePrepare,
  sshTerminalLaunch,
  type SshPreparedFileWrite,
  type SshRemoteDirectory,
  type SshRemoteFile,
  type SshRemoteFileWriteReceipt,
  type SshWorkspaceProfile,
} from "../../lib/tauri";
import { dispatchTerminalLaunch } from "../../lib/terminalLaunch";
import { cls, type Tweaks } from "../../lib/tokens";
import { I } from "../Icons";

interface Props {
  profile: SshWorkspaceProfile;
  tw: Tweaks;
}

type Busy = "directory" | "file" | "prepare" | "write" | "terminal" | null;

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

const RemoteFilesPanel: React.FC<Props> = ({ profile, tw }) => {
  const dark = tw.dark;
  const ko = tw.language === "ko";
  const [path, setPath] = useState(profile.remoteRoot);
  const [directory, setDirectory] = useState<SshRemoteDirectory | null>(null);
  const [file, setFile] = useState<SshRemoteFile | null>(null);
  const [draft, setDraft] = useState("");
  const [prepared, setPrepared] = useState<SshPreparedFileWrite | null>(null);
  const [receipt, setReceipt] = useState<SshRemoteFileWriteReceipt | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPath(profile.remoteRoot);
    setDirectory(null);
    setFile(null);
    setDraft("");
    setPrepared(null);
    setReceipt(null);
    setError(null);
  }, [profile.id, profile.remoteRoot]);

  const dirty = Boolean(file && draft !== file.content);

  const fieldClass = cls(
    "h-9 min-w-0 rounded-md border px-3 text-[12px] outline-none gb-mono",
    dark
      ? "border-dline bg-dpanel text-dink focus:border-[var(--accent)]"
      : "border-line bg-panel text-ink focus:border-[var(--accent)]",
  );
  const buttonClass = cls(
    "h-8 rounded-md border px-3 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50",
    dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
  );

  async function run(operation: Exclude<Busy, null>, action: () => Promise<void>) {
    if (busy) return;
    setBusy(operation);
    setError(null);
    try {
      await action();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setBusy(null);
    }
  }

  async function openDirectory(nextPath: string) {
    if (dirty && !window.confirm(ko ? "저장하지 않은 편집 내용을 버릴까요?" : "Discard unsaved edits?")) return;
    await run("directory", async () => {
      const next = await sshRemoteDirectoryList(profile.id, nextPath);
      setDirectory(next);
      setPath(next.path);
      setFile(null);
      setDraft("");
      setPrepared(null);
      setReceipt(null);
    });
  }

  async function openFile(nextPath: string) {
    if (dirty && !window.confirm(ko ? "저장하지 않은 편집 내용을 버릴까요?" : "Discard unsaved edits?")) return;
    await run("file", async () => {
      const next = await sshRemoteFileRead(profile.id, nextPath);
      setFile(next);
      setDraft(next.content);
      setPrepared(null);
      setReceipt(null);
    });
  }

  const selectedName = useMemo(() => file?.path.split("/").pop() || "", [file?.path]);

  return (
    <div className={cls("mt-3 border-t pt-3", dark ? "border-dline" : "border-line")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[12px] font-medium">{ko ? "원격 파일" : "Remote files"}</div>
        <span className={cls("text-[10.5px]", dark ? "text-dsub" : "text-sub")}>
          {ko ? "UTF-8 · 최대 1 MiB · 기존 파일만 승인 저장" : "UTF-8 · 1 MiB max · approved writes to existing files"}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className={buttonClass}
          disabled={busy !== null}
          onClick={() => void run("terminal", async () => {
            const launch = await sshTerminalLaunch(profile.id);
            dispatchTerminalLaunch({ command: launch.command, label: launch.label });
          })}
        >
          <span className="mr-1 inline-flex align-middle">{I.terminal}</span>
          {ko ? "SSH 터미널" : "SSH terminal"}
        </button>
      </div>

      <div className="mt-2 flex min-w-0 gap-2">
        <input
          className={cls(fieldClass, "flex-1")}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void openDirectory(path);
          }}
          aria-label={ko ? "원격 경로" : "Remote path"}
        />
        <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void openDirectory(path)}>
          {busy === "directory" ? (ko ? "읽는 중..." : "Loading...") : ko ? "열기" : "Open"}
        </button>
      </div>

      {directory && (
        <div className={cls("mt-2 max-h-52 overflow-y-auto rounded-md border", dark ? "border-dline" : "border-line")}>
          {directory.parentPath && (
            <button
              type="button"
              className={cls("flex h-9 w-full items-center gap-2 border-b px-3 text-left text-[12px]", dark ? "border-dline hover:bg-white/5" : "border-line hover:bg-black/[0.03]")}
              onClick={() => void openDirectory(directory.parentPath!)}
            >
              <span aria-hidden="true">↑</span>
              <span>..</span>
            </button>
          )}
          {directory.entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              disabled={entry.kind === "symlink" || entry.kind === "other"}
              className={cls(
                "flex min-h-9 w-full min-w-0 items-center gap-2 border-b px-3 text-left text-[12px] last:border-b-0 disabled:cursor-not-allowed disabled:opacity-45",
                dark ? "border-dline hover:bg-white/5" : "border-line hover:bg-black/[0.03]",
              )}
              onClick={() => void (entry.kind === "directory" ? openDirectory(entry.path) : openFile(entry.path))}
            >
              <span className="w-4 shrink-0 text-center" aria-hidden="true">
                {entry.kind === "directory" ? "▸" : entry.kind === "file" ? "·" : "↗"}
              </span>
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              {entry.kind === "file" && <span className={cls("shrink-0 text-[10.5px]", dark ? "text-dsub" : "text-sub")}>{bytesLabel(entry.size)}</span>}
            </button>
          ))}
          {!directory.entries.length && (
            <div className={cls("px-3 py-4 text-center text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
              {ko ? "빈 디렉터리" : "Empty directory"}
            </div>
          )}
          {directory.truncated && (
            <div className="border-t border-amber-500/30 px-3 py-2 text-[10.5px] text-amber-600">
              {ko ? "처음 500개 항목만 표시합니다." : "Showing the first 500 entries."}
            </div>
          )}
        </div>
      )}

      {file && (
        <div className="mt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-[11.5px] gb-mono" title={file.path}>{selectedName}</code>
            <span className={cls("text-[10.5px]", dirty ? "text-amber-600" : dark ? "text-dsub" : "text-sub")}>
              {dirty ? (ko ? "수정됨" : "Modified") : bytesLabel(file.size)}
            </span>
            <button type="button" className={buttonClass} disabled={busy !== null || !dirty} onClick={() => void run("prepare", async () => {
              setReceipt(null);
              setPrepared(await sshRemoteFileWritePrepare({
                profileId: profile.id,
                path: file.path,
                content: draft,
                expectedSha256: file.sha256,
              }));
            })}>
              {ko ? "저장 검토" : "Review save"}
            </button>
            <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void openFile(file.path)}>
              {ko ? "다시 읽기" : "Reload"}
            </button>
          </div>
          <textarea
            className={cls(
              "mt-2 h-64 w-full resize-y rounded-md border p-3 text-[12px] leading-relaxed outline-none gb-mono",
              dark ? "border-dline bg-dpanel text-dink focus:border-[var(--accent)]" : "border-line bg-panel text-ink focus:border-[var(--accent)]",
            )}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setPrepared(null);
              setReceipt(null);
            }}
            spellCheck={false}
          />
        </div>
      )}

      {prepared && (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="text-[12px] font-medium">{ko ? "원격 파일 교체 승인" : "Approve remote file replacement"}</div>
          <p className={cls("mt-1 break-words text-[11.5px]", dark ? "text-dsub" : "text-sub")}>{prepared.preview}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="h-8 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-3 text-[12px] font-medium text-[var(--accent)] disabled:opacity-50" disabled={busy !== null} onClick={() => void run("write", async () => {
              const next = await sshRemoteFileWriteExecute(prepared.actionId, prepared.approvalHash);
              const refreshed = await sshRemoteFileRead(profile.id, next.path);
              setReceipt(next);
              setPrepared(null);
              setFile(refreshed);
              setDraft(refreshed.content);
            })}>
              {busy === "write" ? (ko ? "검증 저장 중..." : "Saving and verifying...") : ko ? "승인하고 저장" : "Approve and save"}
            </button>
            <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => setPrepared(null)}>{ko ? "취소" : "Cancel"}</button>
          </div>
        </div>
      )}

      {receipt && <div className="mt-2 text-[11.5px] text-emerald-600">{receipt.summary} · {bytesLabel(receipt.bytesWritten)}</div>}
      {error && <div className="mt-2 break-words text-[11.5px] text-red-500">{error}</div>}
    </div>
  );
};

export default RemoteFilesPanel;
