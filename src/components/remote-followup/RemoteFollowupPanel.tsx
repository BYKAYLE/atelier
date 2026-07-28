import React, { useCallback, useEffect, useState } from "react";
import { useFeatureSetting } from "../../features/featureSettings";
import {
  homeDir,
  remoteFollowupDiscard,
  remoteFollowupExecute,
  remoteFollowupPrepare,
  remoteFollowupProposals,
  remoteFollowupReject,
  type RemoteFollowupApprovalInput,
  type RemoteFollowupPreparedAction,
  type RemoteFollowupProposal,
} from "../../lib/tauri";
import { cls, type Tweaks } from "../../lib/tokens";

interface Props {
  tw: Tweaks;
}

type Provider = RemoteFollowupApprovalInput["provider"];
type Permission = NonNullable<RemoteFollowupApprovalInput["permissionMode"]>;
type Effort = NonNullable<RemoteFollowupApprovalInput["effort"]>;

const PROVIDERS: Array<{ value: Provider; label: string }> = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude Code" },
  { value: "hermes", label: "Hermes" },
  { value: "gajecode", label: "Gajae Code" },
];

function normalizeRemotePermission(value: unknown): Permission {
  return value === "basic" ? "basic" : "auto";
}

const RemoteFollowupPanel: React.FC<Props> = ({ tw }) => {
  const [featureEnabled] = useFeatureSetting<boolean>("remote-followup", "enabled", true);
  const [defaultProvider] = useFeatureSetting<Provider>("remote-followup", "defaultProvider", "codex");
  const [defaultEffort] = useFeatureSetting<Effort>("remote-followup", "defaultEffort", "high");
  const [defaultPermission] = useFeatureSetting<Permission>("remote-followup", "defaultPermission", "basic");
  const [defaultStellaMode] = useFeatureSetting<boolean>("remote-followup", "defaultStellaMode", false);
  const dark = tw.dark;
  const ko = tw.language === "ko";
  const [proposals, setProposals] = useState<RemoteFollowupProposal[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [provider, setProvider] = useState<Provider>(defaultProvider);
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState<Effort>(defaultEffort);
  const [permission, setPermission] = useState<Permission>(() => normalizeRemotePermission(defaultPermission));
  const [stellaMode, setStellaMode] = useState(defaultStellaMode);
  const [prepared, setPrepared] = useState<RemoteFollowupPreparedAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!featureEnabled) return;
    setProposals(await remoteFollowupProposals());
  }, [featureEnabled]);

  useEffect(() => {
    if (!featureEnabled) return;
    void Promise.all([load(), homeDir()])
      .then(([, root]) => setWorkspace((current) => current || root))
      .catch((nextError) => setError(String(nextError)));
  }, [featureEnabled, load]);

  useEffect(() => {
    setProvider(defaultProvider);
    setEffort(defaultEffort);
    setPermission(normalizeRemotePermission(defaultPermission));
    setStellaMode(defaultStellaMode);
  }, [defaultEffort, defaultPermission, defaultProvider, defaultStellaMode]);

  async function run(action: () => Promise<void>) {
    if (!featureEnabled || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setBusy(false);
    }
  }

  const pending = proposals.filter(
    (proposal) => proposal.status === "pending" && proposal.expiresAtMs > Date.now(),
  );

  const controlClass = cls(
    "h-9 min-w-0 rounded-md border bg-transparent px-3 text-[12px] outline-none",
    dark ? "border-dline text-dink focus:border-dsub" : "border-line text-ink focus:border-sub",
  );
  const buttonClass = cls(
    "h-9 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    dark ? "border-dline text-dink hover:bg-dmuted" : "border-line text-ink hover:bg-muted",
  );

  return (
    <section data-testid="remote-followup-panel" className={cls("min-w-0 border-t pt-4", dark ? "border-dline" : "border-line")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-medium">{ko ? "후속 지시 승인" : "Follow-up approvals"}</div>
          <p className={cls("mt-1 text-[12.5px]", dark ? "text-dsub" : "text-sub")}>
            {ko
              ? "휴대폰은 지시만 제안합니다. 이 화면에서 실행 조건과 원문을 확인한 뒤 승인해야 작업이 시작됩니다."
              : "Phones can only propose work. Review the exact prompt and execution settings here before approving it."}
          </p>
        </div>
        <button type="button" className={buttonClass} disabled={!featureEnabled || busy} onClick={() => void load()}>
          {ko ? "새로고침" : "Refresh"}
        </button>
      </div>

      {!featureEnabled && (
        <div className={cls("mt-4 rounded-md border px-3 py-2 text-[12px]", dark ? "border-dline text-dsub" : "border-line text-sub")}>
          {ko ? "기능 설정에서 후속 지시 승인을 켜세요." : "Enable follow-up approvals in Feature settings."}
        </div>
      )}

      {featureEnabled && <div className="mt-3 grid gap-2 md:grid-cols-2">
        <input
          className={cls(controlClass, "md:col-span-2")}
          value={workspace}
          onChange={(event) => setWorkspace(event.target.value)}
          placeholder={ko ? "작업 폴더" : "Workspace"}
          aria-label={ko ? "후속 지시 작업 폴더" : "Follow-up workspace"}
        />
        <select className={controlClass} value={provider} onChange={(event) => setProvider(event.target.value as Provider)}>
          {PROVIDERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <input
          className={controlClass}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder={ko ? "모델: 제공자 기본값" : "Model: provider default"}
          aria-label={ko ? "후속 지시 모델" : "Follow-up model"}
        />
        <select className={controlClass} value={effort} onChange={(event) => setEffort(event.target.value as Effort)}>
          <option value="low">{ko ? "작업량 낮음" : "Low effort"}</option>
          <option value="medium">{ko ? "작업량 중간" : "Medium effort"}</option>
          <option value="high">{ko ? "작업량 높음" : "High effort"}</option>
          <option value="xhigh">{ko ? "작업량 매우 높음" : "Extra-high effort"}</option>
          <option value="ultra">{ko ? "울트라 코드" : "Ultra code"}</option>
        </select>
        <select className={controlClass} value={permission} onChange={(event) => setPermission(event.target.value as Permission)}>
          <option value="basic">{ko ? "기본 권한" : "Basic permissions"}</option>
          <option value="auto">{ko ? "자동 검토" : "Auto review"}</option>
        </select>
        <label className={cls("flex h-9 items-center gap-2 rounded-md border px-3 text-[12px]", dark ? "border-dline" : "border-line")}>
          <input type="checkbox" checked={stellaMode} onChange={(event) => setStellaMode(event.target.checked)} />
          {ko ? "스텔라 모드" : "Stella mode"}
        </label>
      </div>}

      {featureEnabled && <div className="mt-3 space-y-3">
        {pending.length === 0 && (
          <p className={cls("py-2 text-[12.5px]", dark ? "text-dsub" : "text-sub")}>
            {ko ? "승인을 기다리는 후속 지시가 없습니다." : "No follow-up instructions are waiting for approval."}
          </p>
        )}
        {pending.map((proposal) => (
          <article key={proposal.proposalId} className={cls("rounded-md border p-4", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-medium">{proposal.deviceName}</div>
                <div className={cls("mt-1 text-[11px]", dark ? "text-dsub" : "text-sub")}>
                  {new Date(proposal.createdAtMs).toLocaleString(tw.language === "ko" ? "ko-KR" : "en-US")}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || Boolean(prepared)}
                  onClick={() => void run(async () => {
                    setPrepared(await remoteFollowupPrepare({
                      proposalId: proposal.proposalId,
                      workspace,
                      provider,
                      model: model.trim() || null,
                      effort,
                      permissionMode: permission,
                      stellaMode,
                    }));
                  })}
                >
                  {ko ? "검토" : "Review"}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || Boolean(prepared)}
                  onClick={() => void run(async () => {
                    await remoteFollowupReject(proposal.proposalId);
                    await load();
                    setMessage(ko ? "후속 지시를 거부했습니다." : "Follow-up rejected.");
                  })}
                >
                  {ko ? "거부" : "Reject"}
                </button>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-6">{proposal.prompt}</p>
          </article>
        ))}
      </div>}

      {featureEnabled && prepared && (
        <div className={cls("mt-4 rounded-md border p-4", dark ? "border-orange-400/45 bg-orange-500/5" : "border-orange-500/35 bg-orange-50")}>
          <div className="text-[13px] font-semibold">{ko ? "정확한 실행 내용 확인" : "Confirm exact execution"}</div>
          <pre className={cls("mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md p-3 text-[11.5px] leading-5", dark ? "bg-dbase text-dink" : "bg-white text-ink")}>
            {prepared.preview}
          </pre>
          <code className={cls("mt-2 block break-all text-[10.5px]", dark ? "text-dsub" : "text-sub")}>{prepared.actionHash}</code>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={cls(buttonClass, "border-orange-500 text-orange-500")}
              disabled={busy}
              onClick={() => void run(async () => {
                const receipt = await remoteFollowupExecute(prepared.actionId, prepared.actionHash);
                setPrepared(null);
                await load();
                setMessage(ko ? `작업 큐에 등록했습니다: ${receipt.controlRequestId}` : `Queued: ${receipt.controlRequestId}`);
              })}
            >
              {ko ? "승인하고 작업 큐에 등록" : "Approve and queue"}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void run(async () => {
                await remoteFollowupDiscard(prepared.actionId);
                setPrepared(null);
              })}
            >
              {ko ? "취소" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-3 text-[12px] text-emerald-600">{message}</p>}
      {error && <div className="mt-3 rounded-md border border-red-400/40 bg-red-500/5 p-3 text-[12px] text-red-500">{error}</div>}
    </section>
  );
};

export default RemoteFollowupPanel;
