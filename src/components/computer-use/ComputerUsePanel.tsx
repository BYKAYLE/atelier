import React, { useCallback, useEffect, useState } from "react";
import { useFeatureSetting } from "../../features/featureSettings";
import {
  computerUseAuthorize,
  computerUseComplete,
  computerUseDiscard,
  computerUseExecute,
  computerUsePrepare,
  computerUsePrepared,
  computerUseReceipts,
  computerUseSetEnabled,
  computerUseStatus,
  type ComputerUseAction,
  type ComputerUsePreparedAction,
  type ComputerUseReceipt,
  type ComputerUseStatus,
} from "../../lib/tauri";
import {
  devScreenClick,
  devScreenKey,
  devScreenResize,
  devScreenScreenshot,
  devScreenSnapshot,
  devScreenType,
  type DevScreenOptions,
} from "../../lib/devScreen";
import { cls, type Tweaks } from "../../lib/tokens";

interface Props {
  tw: Tweaks;
}

type ComputerUseResult = {
  kind: "screenshot" | "snapshot" | "action";
  text?: string;
  dataUrl?: string;
};

const BRIDGE_ACTIONS = new Set<ComputerUseAction>([
  "preview.screenshot",
  "preview.snapshot",
  "preview.click",
  "preview.type",
  "preview.key",
  "preview.resize",
]);

const TARGET_ACTIONS = new Set<ComputerUseAction>([
  "browser.open",
  "preview.open",
  "preview.click",
  "preview.type",
]);

function positiveInteger(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function bridgeOptions(prepared: ComputerUsePreparedAction, timeoutSeconds: number): DevScreenOptions {
  return {
    host: prepared.host || "127.0.0.1",
    port: prepared.port,
    windowLabel: prepared.windowLabel || "main",
    timeoutMs: Math.max(5, Math.min(120, timeoutSeconds)) * 1_000,
  };
}

function savedText(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function savedPort() {
  const value = Number.parseInt(savedText("atelier.agent.devscreen.port.v1", ""), 10);
  return Number.isFinite(value) && value > 0 ? String(value) : "";
}

const ComputerUsePanel: React.FC<Props> = ({ tw }) => {
  const [featureEnabled] = useFeatureSetting<boolean>("computer-use", "enabled", true);
  const [bridgeTimeoutSeconds] = useFeatureSetting<number>("computer-use", "bridgeTimeoutSeconds", 45);
  const [receiptLimit] = useFeatureSetting<number>("computer-use", "receiptLimit", 10);
  const [allowExternalBrowser] = useFeatureSetting<boolean>("computer-use", "allowExternalBrowser", false);
  const dark = tw.dark;
  const ko = tw.language === "ko";
  const [status, setStatus] = useState<ComputerUseStatus | null>(null);
  const [receipts, setReceipts] = useState<ComputerUseReceipt[]>([]);
  const [action, setAction] = useState<ComputerUseAction>("atelier.focus");
  const [target, setTarget] = useState("");
  const [value, setValue] = useState("");
  const [host, setHost] = useState(() => savedText("atelier.agent.devscreen.host.v1", "127.0.0.1"));
  const [port, setPort] = useState(savedPort);
  const [windowLabel, setWindowLabel] = useState(() => savedText("atelier.agent.devscreen.window.v1", "main"));
  const [width, setWidth] = useState("1280");
  const [height, setHeight] = useState("800");
  const [result, setResult] = useState<ComputerUseResult | null>(null);
  const [prepared, setPrepared] = useState<ComputerUsePreparedAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [nextStatus, nextReceipts, nextPrepared] = await Promise.all([
      computerUseStatus(),
      computerUseReceipts(Math.max(1, Math.min(50, receiptLimit))),
      computerUsePrepared(),
    ]);
    setStatus(nextStatus);
    setReceipts(nextReceipts);
    setPrepared((current) => {
      if (current && nextPrepared.some((item) => item.actionId === current.actionId)) return current;
      return nextPrepared[0] || null;
    });
  }, [receiptLimit]);

  useEffect(() => {
    void load().catch((nextError) => setError(String(nextError)));
    const timer = window.setInterval(() => {
      void load().catch((nextError) => setError(String(nextError)));
    }, 1_250);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!allowExternalBrowser && action === "browser.open") setAction("atelier.focus");
  }, [action, allowExternalBrowser]);

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

  async function executeBridgeAction(authorized: ComputerUsePreparedAction) {
    const options = bridgeOptions(authorized, bridgeTimeoutSeconds);
    switch (authorized.action) {
      case "preview.screenshot": {
        const screenshot = await devScreenScreenshot(options);
        setResult({ kind: "screenshot", dataUrl: screenshot.dataUrl });
        return ko ? "로컬 프리뷰 스크린샷을 캡처했습니다." : "Captured the local preview screenshot.";
      }
      case "preview.snapshot": {
        const snapshot = await devScreenSnapshot(options);
        setResult({ kind: "snapshot", text: snapshot.text });
        return ko ? "로컬 프리뷰 DOM 스냅샷을 읽었습니다." : "Read the local preview DOM snapshot.";
      }
      case "preview.click": {
        const response = await devScreenClick(options, authorized.target || "");
        setResult({ kind: "action", text: JSON.stringify(response.data, null, 2) });
        return ko ? "승인한 요소를 클릭했습니다." : "Clicked the approved element.";
      }
      case "preview.type": {
        const response = await devScreenType(options, authorized.target || "", authorized.value || "");
        setResult({ kind: "action", text: JSON.stringify(response.data, null, 2) });
        return ko ? "승인한 요소에 텍스트를 입력했습니다." : "Typed into the approved element.";
      }
      case "preview.key": {
        const response = await devScreenKey(options, authorized.value || "");
        setResult({ kind: "action", text: JSON.stringify(response.data, null, 2) });
        return ko ? "승인한 키를 프리뷰에 전송했습니다." : "Sent the approved key to the preview.";
      }
      case "preview.resize": {
        const response = await devScreenResize(options, authorized.width || 0, authorized.height || 0);
        setResult({ kind: "action", text: JSON.stringify(response.data, null, 2) });
        return ko ? "로컬 프리뷰 크기를 변경했습니다." : "Resized the local preview.";
      }
      default:
        throw new Error("Unsupported preview bridge action.");
    }
  }

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
          disabled={busy || (!featureEnabled && !status?.enabled)}
          onClick={() => void run(async () => {
            if (!featureEnabled && !status?.enabled) return;
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

      {!featureEnabled && (
        <div className="mt-4 rounded-md border border-amber-500/30 px-3 py-2 text-[12px] text-amber-500">
          {status?.enabled
            ? (ko ? "Computer Use가 설정에서 꺼져 있습니다. 현재 실행은 전체 중지할 수 있습니다." : "Computer Use is disabled in settings. You can still stop the active run.")
            : (ko ? "기능 설정에서 Computer Use를 켜세요." : "Enable Computer Use in Feature settings.")}
        </div>
      )}

      {featureEnabled && <div className="mt-4 flex flex-wrap gap-2">
        <select
          className={controlClass}
          value={action}
          disabled={!status?.enabled || busy || Boolean(prepared)}
          onChange={(event) => {
            setAction(event.target.value as ComputerUseAction);
            setTarget("");
            setValue("");
            setResult(null);
          }}
        >
          <option value="atelier.focus">{ko ? "Atelier 창 포커스" : "Focus Atelier"}</option>
          {allowExternalBrowser && <option value="browser.open">{ko ? "HTTPS 주소 열기" : "Open HTTPS address"}</option>}
          <option value="preview.open">{ko ? "로컬 프리뷰 열기" : "Open local preview"}</option>
          <option value="preview.screenshot">{ko ? "프리뷰 스크린샷" : "Preview screenshot"}</option>
          <option value="preview.snapshot">{ko ? "프리뷰 DOM 스냅샷" : "Preview DOM snapshot"}</option>
          <option value="preview.click">{ko ? "프리뷰 요소 클릭" : "Click preview element"}</option>
          <option value="preview.type">{ko ? "프리뷰 요소 입력" : "Type into preview element"}</option>
          <option value="preview.key">{ko ? "프리뷰 키 전송" : "Send preview key"}</option>
          <option value="preview.resize">{ko ? "프리뷰 크기 변경" : "Resize preview"}</option>
        </select>
        {TARGET_ACTIONS.has(action) && (
          <input
            className={cls(controlClass, "min-w-[280px] flex-1")}
            value={target}
            disabled={!status?.enabled || busy || Boolean(prepared)}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={action === "preview.open"
              ? "http://127.0.0.1:5173"
              : action === "browser.open"
                ? "https://example.com"
                : "button[data-testid='save']"}
            aria-label={action === "preview.click" || action === "preview.type"
              ? (ko ? "프리뷰 대상 선택자" : "Preview target selector")
              : (ko ? "Computer Use 대상 주소" : "Computer Use target URL")}
          />
        )}
        {action === "preview.type" && (
          <input
            className={cls(controlClass, "min-w-[240px] flex-1")}
            value={value}
            disabled={!status?.enabled || busy || Boolean(prepared)}
            onChange={(event) => setValue(event.target.value)}
            placeholder={ko ? "입력할 텍스트" : "Text to enter"}
            aria-label={ko ? "프리뷰 입력 텍스트" : "Preview input text"}
          />
        )}
        {action === "preview.key" && (
          <input
            className={cls(controlClass, "w-[150px]")}
            value={value}
            disabled={!status?.enabled || busy || Boolean(prepared)}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Enter"
            aria-label={ko ? "프리뷰 키" : "Preview key"}
          />
        )}
        {action === "preview.resize" && (
          <>
            <input
              className={cls(controlClass, "w-[110px]")}
              type="number"
              min={320}
              max={5120}
              value={width}
              disabled={!status?.enabled || busy || Boolean(prepared)}
              onChange={(event) => setWidth(event.target.value)}
              aria-label={ko ? "프리뷰 너비" : "Preview width"}
            />
            <input
              className={cls(controlClass, "w-[110px]")}
              type="number"
              min={240}
              max={3200}
              value={height}
              disabled={!status?.enabled || busy || Boolean(prepared)}
              onChange={(event) => setHeight(event.target.value)}
              aria-label={ko ? "프리뷰 높이" : "Preview height"}
            />
          </>
        )}
        {BRIDGE_ACTIONS.has(action) && (
          <>
            <input
              className={cls(controlClass, "w-[150px]")}
              value={host}
              disabled={!status?.enabled || busy || Boolean(prepared)}
              onChange={(event) => setHost(event.target.value)}
              aria-label={ko ? "프리뷰 브리지 호스트" : "Preview bridge host"}
            />
            <input
              className={cls(controlClass, "w-[100px]")}
              type="number"
              min={1}
              max={65535}
              value={port}
              disabled={!status?.enabled || busy || Boolean(prepared)}
              onChange={(event) => setPort(event.target.value)}
              placeholder={ko ? "자동 포트" : "Auto port"}
              aria-label={ko ? "프리뷰 브리지 포트" : "Preview bridge port"}
            />
            <input
              className={cls(controlClass, "w-[120px]")}
              value={windowLabel}
              disabled={!status?.enabled || busy || Boolean(prepared)}
              onChange={(event) => setWindowLabel(event.target.value)}
              aria-label={ko ? "프리뷰 창 이름" : "Preview window label"}
            />
          </>
        )}
        <button
          type="button"
          className={buttonClass}
          disabled={!status?.enabled || busy || Boolean(prepared)}
          onClick={() => void run(async () => {
            if (action === "browser.open" && !allowExternalBrowser) {
              throw new Error(ko ? "외부 HTTPS 주소 열기가 기능 설정에서 꺼져 있습니다." : "External HTTPS URLs are disabled in Feature settings.");
            }
            setResult(null);
            setPrepared(await computerUsePrepare({
              action,
              target: TARGET_ACTIONS.has(action) ? target : null,
              value: action === "preview.type" || action === "preview.key" ? value : null,
              host: BRIDGE_ACTIONS.has(action) ? host : null,
              port: BRIDGE_ACTIONS.has(action) ? positiveInteger(port) : null,
              windowLabel: BRIDGE_ACTIONS.has(action) ? windowLabel : null,
              width: action === "preview.resize" ? positiveInteger(width) : null,
              height: action === "preview.resize" ? positiveInteger(height) : null,
            }));
          })}
        >
          {ko ? "실행 내용 검토" : "Review action"}
        </button>
      </div>}

      {featureEnabled && prepared && (
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
                if (!BRIDGE_ACTIONS.has(prepared.action)) {
                  const receipt = await computerUseExecute(prepared.actionId, prepared.actionHash);
                  setPrepared(null);
                  await load();
                  if (receipt.status === "failed") throw new Error(receipt.summary);
                  setMessage(receipt.summary);
                  return;
                }

                const authorized = await computerUseAuthorize(prepared.actionId, prepared.actionHash);
                try {
                  const summary = await executeBridgeAction(authorized);
                  const receipt = await computerUseComplete(
                    authorized.actionId,
                    authorized.actionHash,
                    true,
                    summary,
                  );
                  setPrepared(null);
                  await load();
                  setMessage(receipt.summary);
                } catch (nextError) {
                  const summary = String(nextError);
                  try {
                    await computerUseComplete(
                      authorized.actionId,
                      authorized.actionHash,
                      false,
                      summary,
                    );
                  } finally {
                    setPrepared(null);
                    await load();
                  }
                  throw nextError;
                }
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

      {featureEnabled && result && (
        <div className={cls("mt-4 rounded-md border p-3", dark ? "border-dline bg-dbase" : "border-line bg-white")}>
          {result.kind === "screenshot" && result.dataUrl ? (
            <img
              src={result.dataUrl}
              alt={ko ? "승인한 로컬 프리뷰 스크린샷" : "Approved local preview screenshot"}
              className="max-h-[420px] w-full object-contain"
            />
          ) : (
            <pre className={cls("max-h-[320px] overflow-auto whitespace-pre-wrap break-words text-[11.5px] leading-5", dark ? "text-dink" : "text-ink")}>
              {result.text}
            </pre>
          )}
        </div>
      )}

      {receipts.length > 0 && (
        <div className="mt-4 divide-y divide-current/10">
          {receipts.slice(0, Math.max(1, Math.min(50, receiptLimit))).map((receipt) => (
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
