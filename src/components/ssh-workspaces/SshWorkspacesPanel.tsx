import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFeatureSetting } from "../../features/featureSettings";
import {
  sshConnectionProbe,
  sshHostProbe,
  sshHostTrust,
  sshProfileArchive,
  sshProfileSave,
  sshRemoteWorktreeExecute,
  sshRemoteWorktreePrepare,
  sshTunnelList,
  sshTunnelRetry,
  sshTunnelStart,
  sshTunnelStop,
  sshWorkspaceStatus,
  type SshConnectionProbe,
  type SshHostProbe,
  type SshPreparedAction,
  type SshRemoteWorktreeReceipt,
  type SshWorkspaceProfileInput,
  type SshWorkspaceStatus,
} from "../../lib/tauri";
import { cls, type Tweaks } from "../../lib/tokens";
import { I } from "../Icons";
import {
  emptySshProfile,
  sshProfileDraft,
  sshTargetLabel,
  sshTunnelStateLabel,
  sshTunnelStateTone,
} from "./sshWorkspace";
import RemoteFilesPanel from "./RemoteFilesPanel";

interface Props {
  tw: Tweaks;
}

type Busy = "save" | "archive" | "probe" | "trust" | "connect" | "tunnel" | "worktree" | null;

const SshWorkspacesPanel: React.FC<Props> = ({ tw }) => {
  const [featureEnabled] = useFeatureSetting<boolean>("ssh-workspaces", "enabled", true);
  const [defaultAutoReconnect] = useFeatureSetting<boolean>("ssh-workspaces", "autoReconnect", true);
  const [maxReconnectAttempts] = useFeatureSetting<number>("ssh-workspaces", "maxReconnectAttempts", 5);
  const [defaultLocalPort] = useFeatureSetting<number>("ssh-workspaces", "defaultLocalPort", 5173);
  const [defaultRemotePort] = useFeatureSetting<number>("ssh-workspaces", "defaultRemotePort", 5173);
  const dark = tw.dark;
  const ko = tw.language === "ko";
  const [status, setStatus] = useState<SshWorkspaceStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SshWorkspaceProfileInput>(emptySshProfile());
  const [hostProbe, setHostProbe] = useState<SshHostProbe | null>(null);
  const [connection, setConnection] = useState<SshConnectionProbe | null>(null);
  const [ports, setPorts] = useState({ local: defaultLocalPort, remote: defaultRemotePort });
  const [autoReconnect, setAutoReconnect] = useState(defaultAutoReconnect);
  const [worktree, setWorktree] = useState({ repositoryPath: "/srv/project", taskName: "", baseRef: "HEAD" });
  const [prepared, setPrepared] = useState<SshPreparedAction | null>(null);
  const [receipt, setReceipt] = useState<SshRemoteWorktreeReceipt | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await sshWorkspaceStatus();
    setStatus(next);
    setSelectedId((current) => {
      if (current && next.profiles.some((profile) => profile.id === current && !profile.archived)) return current;
      return next.profiles.find((profile) => !profile.archived)?.id ?? null;
    });
  }, []);

  useEffect(() => {
    load().catch((nextError) => setError(String(nextError)));
  }, [load]);

  useEffect(() => {
    setPorts({ local: defaultLocalPort, remote: defaultRemotePort });
    setAutoReconnect(defaultAutoReconnect);
  }, [defaultAutoReconnect, defaultLocalPort, defaultRemotePort]);

  const hasManagedTunnels = Boolean(status?.tunnels.length);

  useEffect(() => {
    if (!hasManagedTunnels) return;
    let active = true;
    const refreshTunnels = () => {
      sshTunnelList()
        .then((tunnels) => {
          if (!active) return;
          setStatus((current) => current ? { ...current, tunnels } : current);
        })
        .catch((nextError) => {
          if (active) setError(String(nextError));
        });
    };
    const timer = window.setInterval(refreshTunnels, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [hasManagedTunnels]);

  const profiles = useMemo(() => status?.profiles.filter((profile) => !profile.archived) ?? [], [status]);
  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;

  useEffect(() => {
    setDraft(selected ? sshProfileDraft(selected) : emptySshProfile());
    setHostProbe(null);
    setConnection(null);
    setPrepared(null);
    setReceipt(null);
  }, [selectedId]);

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

  const fieldClass = cls(
    "h-9 min-w-0 rounded-md border px-3 text-[12px] outline-none gb-mono",
    dark ? "border-dline bg-dbg text-dink focus:border-[var(--accent)]" : "border-line bg-cream text-ink focus:border-[var(--accent)]",
  );
  const buttonClass = cls(
    "h-8 rounded-md border px-3 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50",
    dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
  );

  return (
    <section className={cls("rounded-lg border p-4", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[14px] font-medium">
            <span className="text-[var(--accent)]">{I.worktree}</span>
            {ko ? "SSH 작업공간" : "SSH workspaces"}
          </div>
          <p className={cls("mt-1 text-[12.5px] leading-relaxed", dark ? "text-dsub" : "text-sub")}>
            {ko
              ? "호스트 키를 직접 확인한 뒤 연결하며, 원격 worktree 생성은 최종 승인 후 한 번만 실행됩니다."
              : "Verify host keys before connecting. Remote worktrees run once after final approval."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cls("text-[11px]", status?.sshInstalled ? "text-emerald-600" : "text-amber-600")}>
            SSH {status?.sshInstalled ? (ko ? "준비됨" : "ready") : (ko ? "없음" : "missing")}
          </span>
          <button type="button" onClick={() => void load()} className={buttonClass} aria-label={ko ? "새로고침" : "Refresh"}>↻</button>
        </div>
      </div>

      {!featureEnabled && (
        <div className="mt-3 rounded-md border border-amber-500/30 px-3 py-2 text-[12px] text-amber-500">
          {ko
            ? "SSH 작업공간이 설정에서 꺼져 있습니다. 실행 중인 포트 전달은 아래에서 중지할 수 있습니다."
            : "SSH workspaces are disabled in settings. Existing tunnels can still be stopped below."}
        </div>
      )}

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => setSelectedId(profile.id)}
            className={cls(
              "h-8 shrink-0 rounded-md border px-3 text-[12px]",
              profile.id === selectedId
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : dark ? "border-dline text-dsub" : "border-line text-sub",
            )}
          >
            {profile.name}
          </button>
        ))}
        <button type="button" disabled={!featureEnabled} onClick={() => setSelectedId(null)} className={buttonClass} aria-label={ko ? "새 프로필" : "New profile"}>
          {I.plus}
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input disabled={!featureEnabled} className="sm:col-span-2 lg:col-span-2 h-9 min-w-0 rounded-md border px-3 text-[12px] outline-none disabled:opacity-50" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={ko ? "프로필 이름" : "Profile name"} />
        <input disabled={!featureEnabled} className={cls(fieldClass, "sm:col-span-2 lg:col-span-2 disabled:opacity-50")} value={draft.host} onChange={(event) => setDraft({ ...draft, host: event.target.value })} placeholder="host.example.com" />
        <input disabled={!featureEnabled} className={fieldClass} type="number" min={1} max={65535} value={draft.port} onChange={(event) => setDraft({ ...draft, port: Number(event.target.value) })} aria-label="SSH port" />
        <input disabled={!featureEnabled} className={fieldClass} value={draft.user} onChange={(event) => setDraft({ ...draft, user: event.target.value })} placeholder={ko ? "사용자" : "User"} />
        <input disabled={!featureEnabled} className={cls(fieldClass, "sm:col-span-2 lg:col-span-5")} value={draft.remoteRoot} onChange={(event) => setDraft({ ...draft, remoteRoot: event.target.value })} placeholder="/srv/project" />
        <button
          type="button"
          disabled={!featureEnabled || busy !== null}
          onClick={() => void run("save", async () => {
            const saved = await sshProfileSave(draft);
            setSelectedId(saved.id);
            await load();
          })}
          className="h-9 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-3 text-[12px] font-medium text-[var(--accent)] disabled:opacity-50"
        >
          {busy === "save" ? (ko ? "저장 중..." : "Saving...") : ko ? "저장" : "Save"}
        </button>
      </div>

      {selected && (
        <div className={cls("mt-3 rounded-md border p-3", dark ? "border-dline bg-dbg" : "border-line bg-cream")}>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-[12px] gb-mono">{sshTargetLabel(selected)}</code>
            <button type="button" className={buttonClass} disabled={!featureEnabled || busy !== null} onClick={() => void run("probe", async () => setHostProbe(await sshHostProbe(selected.id)))}>
              {ko ? "호스트 키 확인" : "Probe host key"}
            </button>
            <button type="button" className={buttonClass} disabled={!featureEnabled || busy !== null || !hostProbe?.trusted} onClick={() => void run("connect", async () => setConnection(await sshConnectionProbe(selected.id)))}>
              {ko ? "연결 확인" : "Test connection"}
            </button>
            <button type="button" className={buttonClass} disabled={!featureEnabled || busy !== null} onClick={() => void run("archive", async () => { await sshProfileArchive(selected.id); setSelectedId(null); await load(); })}>
              {ko ? "보관" : "Archive"}
            </button>
          </div>

          {hostProbe && (
            <div className="mt-3 space-y-2">
              {hostProbe.fingerprints.map((item) => (
                <div key={`${item.algorithm}-${item.fingerprint}`} className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className={cls("text-[11px]", dark ? "text-dsub" : "text-sub")}>{item.algorithm}</span>
                  <code className="min-w-0 break-all text-[11px] gb-mono">{item.fingerprint}</code>
                  {!hostProbe.trusted && (
                    <button type="button" className={buttonClass} disabled={!featureEnabled || busy !== null} onClick={() => void run("trust", async () => setHostProbe(await sshHostTrust(selected.id, item.fingerprint)))}>
                      {ko ? "이 지문 승인" : "Trust fingerprint"}
                    </button>
                  )}
                </div>
              ))}
              {hostProbe.trusted && <div className="text-[11px] text-emerald-600">{ko ? "호스트 키 승인됨" : "Host key trusted"}</div>}
            </div>
          )}
          {connection && (
            <div className={cls("mt-2 text-[11.5px]", connection.connected ? "text-emerald-600" : "text-red-500")}>
              {connection.message} · {connection.latencyMs} ms
            </div>
          )}

          {featureEnabled && <RemoteFilesPanel profile={selected} tw={tw} />}

          <div className={cls("mt-3 border-t pt-3", dark ? "border-dline" : "border-line")}>
            <div className="flex flex-wrap items-end gap-2">
              <label className={cls("text-[11px]", dark ? "text-dsub" : "text-sub")}>
                {ko ? "로컬 포트" : "Local port"}
                <input className={cls(fieldClass, "mt-1 block w-28")} type="number" min={1} max={65535} value={ports.local} onChange={(event) => setPorts({ ...ports, local: Number(event.target.value) })} />
              </label>
              <label className={cls("text-[11px]", dark ? "text-dsub" : "text-sub")}>
                {ko ? "원격 포트" : "Remote port"}
                <input className={cls(fieldClass, "mt-1 block w-28")} type="number" min={1} max={65535} value={ports.remote} onChange={(event) => setPorts({ ...ports, remote: Number(event.target.value) })} />
              </label>
              <button type="button" className={buttonClass} disabled={!featureEnabled || busy !== null || !hostProbe?.trusted} onClick={() => void run("tunnel", async () => { await sshTunnelStart(selected.id, ports.local, ports.remote, autoReconnect, maxReconnectAttempts); await load(); })}>
                {ko ? "포트 전달 시작" : "Start forwarding"}
              </button>
              <label className={cls("flex h-8 items-center gap-2 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
                <input
                  type="checkbox"
                  checked={autoReconnect}
                  disabled={!featureEnabled}
                  onChange={(event) => setAutoReconnect(event.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {ko ? "자동 재연결" : "Auto reconnect"}
              </label>
            </div>
            <div className="mt-2 grid gap-2">
              {(status?.tunnels.filter((tunnel) => tunnel.profileId === selected.id) ?? []).map((tunnel) => (
                <div key={tunnel.id} className={cls("rounded-md border p-2.5", dark ? "border-dline" : "border-line")}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={cls("text-[11.5px] font-medium", sshTunnelStateTone(tunnel.state))}>
                      ● {sshTunnelStateLabel(tunnel.state, ko)}
                    </span>
                    <code className="text-[11.5px] gb-mono">127.0.0.1:{tunnel.localPort} → 127.0.0.1:{tunnel.remotePort}</code>
                    {tunnel.autoReconnect && (
                      <span className={cls("text-[10.5px]", dark ? "text-dsub" : "text-sub")}>
                        {ko
                          ? `자동 복구 · ${tunnel.restartCount}/${tunnel.maxReconnectAttempts ?? maxReconnectAttempts}`
                          : `Auto recovery · ${tunnel.restartCount}/${tunnel.maxReconnectAttempts ?? maxReconnectAttempts}`}
                      </span>
                    )}
                    <span className="flex-1" />
                    {tunnel.state === "failed" && (
                      <button type="button" className={buttonClass} disabled={!featureEnabled || busy !== null} onClick={() => void run("tunnel", async () => { await sshTunnelRetry(tunnel.id); await load(); })}>
                        {ko ? "다시 연결" : "Reconnect"}
                      </button>
                    )}
                    <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void run("tunnel", async () => { await sshTunnelStop(tunnel.id); await load(); })}>
                      {ko ? "중지" : "Stop"}
                    </button>
                  </div>
                  {tunnel.lastError && (
                    <p className="mt-1 break-words text-[10.5px] leading-relaxed text-red-500">{tunnel.lastError}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className={cls("mt-3 border-t pt-3", dark ? "border-dline" : "border-line")}>
            <div className="grid gap-2 sm:grid-cols-3">
              <input className={fieldClass} value={worktree.repositoryPath} onChange={(event) => setWorktree({ ...worktree, repositoryPath: event.target.value })} placeholder={ko ? "원격 저장소 절대 경로" : "Remote repository path"} />
              <input className={fieldClass} value={worktree.taskName} onChange={(event) => setWorktree({ ...worktree, taskName: event.target.value })} placeholder={ko ? "작업 이름" : "Task name"} />
              <input className={fieldClass} value={worktree.baseRef} onChange={(event) => setWorktree({ ...worktree, baseRef: event.target.value })} placeholder="HEAD" />
            </div>
            <button type="button" className={cls(buttonClass, "mt-2")} disabled={!featureEnabled || busy !== null || !hostProbe?.trusted} onClick={() => void run("worktree", async () => {
              setReceipt(null);
              setPrepared(await sshRemoteWorktreePrepare({ profileId: selected.id, repositoryPath: worktree.repositoryPath, taskName: worktree.taskName, baseRef: worktree.baseRef }));
            })}>
              {ko ? "원격 worktree 검토" : "Review remote worktree"}
            </button>
            {prepared && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="text-[12px] font-medium">{ko ? "최종 승인 필요" : "Final approval required"}</div>
                <p className={cls("mt-1 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>{prepared.preview}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="h-8 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-3 text-[12px] font-medium text-[var(--accent)]" onClick={() => void run("worktree", async () => { const next = await sshRemoteWorktreeExecute(prepared.actionId, prepared.approvalHash); setReceipt(next); setPrepared(null); })}>
                    {ko ? "승인하고 한 번 실행" : "Approve and run once"}
                  </button>
                  <button type="button" className={buttonClass} onClick={() => setPrepared(null)}>{ko ? "취소" : "Cancel"}</button>
                </div>
              </div>
            )}
            {receipt && <div className="mt-2 text-[11.5px] text-emerald-600">{receipt.summary} · {receipt.worktreePath}</div>}
          </div>
        </div>
      )}

      {error && <div className="mt-3 text-[11.5px] text-red-500">{error}</div>}
    </section>
  );
};

export default SshWorkspacesPanel;
