import React, { useCallback, useEffect, useState } from "react";
import {
  computerUseDiscard,
  computerUseExecute,
  computerUsePrepare,
  computerUseReceipts,
  computerUseSetEnabled,
  computerUseStatus,
  type ComputerUseAction,
  type ComputerUsePreparedAction,
  type ComputerUseReceipt,
  type ComputerUseStatus,
} from "../../lib/tauri";
import { cls, type Tweaks } from "../../lib/tokens";

interface Props {
  tw: Tweaks;
}

const ComputerUsePanel: React.FC<Props> = ({ tw }) => {
  const dark = tw.dark;
  const ko = tw.language === "ko";
  const [status, setStatus] = useState<ComputerUseStatus | null>(null);
  const [receipts, setReceipts] = useState<ComputerUseReceipt[]>([]);
  const [action, setAction] = useState<ComputerUseAction>("atelier.focus");
  const [target, setTarget] = useState("");
  const [prepared, setPrepared] = useState<ComputerUsePreparedAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [nextStatus, nextReceipts] = await Promise.all([
      computerUseStatus(),
      computerUseReceipts(10),
    ]);
    setStatus(nextStatus);
    setReceipts(nextReceipts);
  }, []);

  useEffect(() => {
    void load().catch((nextError) => setError(String(nextError)));
  }, [load]);

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await task();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setBusy(false);
    }
  }

  const controlClass = cls(
    "h-9 rounded-md border bg-transparent px-3 text-[12px] outline-none",
    dark ? "border-dline text-dink focus:border-dsub" : "border-line text-ink focus:border-sub",
  );
  const buttonClass = cls(
    "h-9 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    dark ? "border-dline text-dink hover:bg-dmuted" : "border-line text-ink hover:bg-muted",
  );

  return (
    <section data-testid="computer-use-panel" className={cls("mt-6 border-t pt-5", dark ? "border-dline" : "border-line")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-medium">
            {ko ? "Computer Use" : "Computer Use"}
            <span className={cls("h-2 w-2 rounded-full", status?.enabled ? "bg-emerald-500" : "bg-zinc-500")} />
          </div>
          <p className={cls("mt-1 text-[12.5px]", dark ? "text-dsub" : "text-sub")}>
            {ko
              ? "허용된 동작만 미리보기와 일회 승인 후 실행합니다. 앱을 다시 열면 자동으로 꺼집니다."
              : "Only allowlisted actions run after an exact preview and one-time approval. It resets off on restart."}
          </p>
        </div>
        <button
          type="button"
          className={cls(buttonClass, status?.enabled && "border-red-500 text-red-500")}
          disabled={busy}
          onClick={() => void run(async () => {
            setPrepared(null);
            setStatus(await computerUseSetEnabled(!status?.enabled));
            setMessage(status?.enabled
              ? (ko ? "Computer Use를 즉시 중지했습니다." : "Computer Use stopped immediately.")
              : (ko ? "Computer Use를 이번 실행에서만 켰습니다." : "Computer Use enabled for this run."));
          })}
        >
          {status?.enabled ? (ko ? "전체 중지" : "Stop all") : (ko ? "이번 실행에서 켜기" : "Enable for this run")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          className={controlClass}
          value={action}
          disabled={!status?.enabled || busy || Boolean(prepared)}
          onChange={(event) => setAction(event.target.value as ComputerUseAction)}
        >
          <option value="atelier.focus">{ko ? "Atelier 창 포커스" : "Focus Atelier"}</option>
          <option value="browser.open">{ko ? "HTTPS 주소 열기" : "Open HTTPS address"}</option>
          <option value="preview.open">{ko ? "로컬 프리뷰 열기" : "Open local preview"}</option>
        </select>
        {action !== "atelier.focus" && (
          <input
            className={cls(controlClass, "min-w-[280px] flex-1")}
            value={target}
            disabled={!status?.enabled || busy || Boolean(prepared)}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={action === "preview.open" ? "http://127.0.0.1:5173" : "https://example.com"}
            aria-label={ko ? "Computer Use 대상 주소" : "Computer Use target URL"}
          />
        )}
        <button
          type="button"
          className={buttonClass}
          disabled={!status?.enabled || busy || Boolean(prepared)}
          onClick={() => void run(async () => {
            setPrepared(await computerUsePrepare({ action, target: action === "atelier.focus" ? null : target }));
          })}
        >
          {ko ? "실행 내용 검토" : "Review action"}
        </button>
      </div>

      {prepared && (
        <div className={cls("mt-4 rounded-md border p-4", dark ? "border-orange-400/45 bg-orange-500/5" : "border-orange-500/35 bg-orange-50")}>
          <div className="text-[13px] font-semibold">{ko ? "승인 대기" : "Waiting for approval"}</div>
          <pre className={cls("mt-3 whitespace-pre-wrap break-words rounded-md p-3 text-[11.5px] leading-5", dark ? "bg-dbase text-dink" : "bg-white text-ink")}>
            {prepared.preview}
          </pre>
          <code className={cls("mt-2 block break-all text-[10.5px]", dark ? "text-dsub" : "text-sub")}>{prepared.actionHash}</code>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={cls(buttonClass, "border-orange-500 text-orange-500")}
              disabled={busy}
              onClick={() => void run(async () => {
                const receipt = await computerUseExecute(prepared.actionId, prepared.actionHash);
                setPrepared(null);
                await load();
                if (receipt.status === "failed") throw new Error(receipt.summary);
                setMessage(receipt.summary);
              })}
            >
              {ko ? "이 동작만 승인" : "Approve this action"}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void run(async () => {
                await computerUseDiscard(prepared.actionId);
                setPrepared(null);
              })}
            >
              {ko ? "취소" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {receipts.length > 0 && (
        <div className="mt-4 divide-y divide-current/10">
          {receipts.slice(0, 5).map((receipt) => (
            <div key={receipt.receiptId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11.5px]">
              <span>{receipt.action}</span>
              <span className={receipt.status === "succeeded" ? "text-emerald-600" : "text-red-500"}>{receipt.status}</span>
              <span className={dark ? "text-dsub" : "text-sub"}>{new Date(receipt.completedAtMs).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {message && <p className="mt-3 text-[12px] text-emerald-600">{message}</p>}
      {error && <div className="mt-3 rounded-md border border-red-400/40 bg-red-500/5 p-3 text-[12px] text-red-500">{error}</div>}
    </section>
  );
};

export default ComputerUsePanel;
