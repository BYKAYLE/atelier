import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFeatureSetting } from "../../features/featureSettings";
import {
  devServiceStopExecute,
  devServiceStopPrepare,
  devServicesScan,
  type DevService,
  type DevServicesSnapshot,
} from "../../lib/tauri";
import { safeLocalStorageGet } from "../../lib/storage";
import { cls, type Tweaks } from "../../lib/tokens";
import { I } from "../Icons";

interface Props {
  tw: Tweaks;
}

const WORKSPACE_KEY = "atelier.agent.cwd.v1";

async function openService(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP preview URLs can be opened.");
  }
  const { open } = await import("@tauri-apps/plugin-shell");
  await open(parsed.toString());
}

function serviceIdentity(service: DevService) {
  return `${service.pid ?? "unknown"}:${service.host}:${service.port}`;
}

const DevServicesPanel: React.FC<Props> = ({ tw }) => {
  const [featureEnabled] = useFeatureSetting<boolean>("dev-services", "enabled", true);
  const [scanOnOpen] = useFeatureSetting<boolean>("dev-services", "scanOnOpen", true);
  const [showUnmatched] = useFeatureSetting<boolean>("dev-services", "showUnmatched", true);
  const [workspace, setWorkspace] = useState(() => safeLocalStorageGet(WORKSPACE_KEY) || "");
  const [snapshot, setSnapshot] = useState<DevServicesSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const initialScanDoneRef = useRef(false);
  const [stopping, setStopping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ko = tw.language === "ko";
  const dark = tw.dark;

  const refresh = useCallback(async () => {
    if (!featureEnabled || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await devServicesScan(workspace));
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [featureEnabled, workspace]);

  useEffect(() => {
    if (!featureEnabled || !scanOnOpen) {
      initialScanDoneRef.current = false;
      return;
    }
    if (initialScanDoneRef.current) return;
    initialScanDoneRef.current = true;
    void refresh();
  }, [featureEnabled, refresh, scanOnOpen]);

  const services = useMemo(
    () => [...(snapshot?.services ?? [])]
      .filter((service) => showUnmatched || service.workspaceMatch)
      .sort((left, right) => {
      if (left.workspaceMatch !== right.workspaceMatch) return left.workspaceMatch ? -1 : 1;
      return left.port - right.port;
    }),
    [showUnmatched, snapshot],
  );

  async function stopService(service: DevService) {
    if (!service.pid || stopping) return;
    const identity = serviceIdentity(service);
    setStopping(identity);
    setError(null);
    try {
      const prepared = await devServiceStopPrepare(service.pid, service.port);
      const approved = window.confirm(prepared.preview);
      if (!approved) return;
      await devServiceStopExecute(prepared.actionId, prepared.approvalHash);
      await refresh();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setStopping(null);
    }
  }

  return (
    <section className={cls("rounded-lg border p-4", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[14px] font-medium">
            <span className="text-[var(--accent)]">{I.preview}</span>
            {ko ? "개발 서비스" : "Development services"}
          </div>
          <p className={cls("mt-1 text-[12.5px] leading-relaxed", dark ? "text-dsub" : "text-sub")}>
            {ko
              ? "현재 PC에서 수신 중인 개발 서버를 찾고 작업 폴더와 연결합니다."
              : "Finds local listening development servers and attributes them to the active workspace."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || !featureEnabled}
          className={cls(
            "h-8 shrink-0 rounded-md border px-3 text-[12px] font-medium disabled:opacity-50",
            dark ? "border-dline text-dsub hover:text-dink" : "border-line text-sub hover:text-ink",
          )}
        >
          {loading ? (ko ? "검색 중..." : "Scanning...") : ko ? "다시 검색" : "Scan again"}
        </button>
      </div>

      {!featureEnabled && (
        <div className={cls("mt-3 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
          {ko ? "기능 설정에서 개발 서비스를 켜세요." : "Enable development services in Feature settings."}
        </div>
      )}

      {featureEnabled && <label className={cls("mt-3 block text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
        <span>{ko ? "작업 폴더" : "Workspace"}</span>
        <input
          value={workspace}
          onChange={(event) => setWorkspace(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void refresh();
          }}
          placeholder={ko ? "작업 폴더 경로" : "Workspace path"}
          className={cls(
            "mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-[12px] outline-none focus:border-[var(--accent)]",
            dark ? "border-dline text-dink" : "border-line text-ink",
          )}
        />
      </label>}

      {featureEnabled && snapshot?.unavailableReason && (
        <div className="mt-3 text-[11.5px] text-amber-500">{snapshot.unavailableReason}</div>
      )}

      {featureEnabled && services.length > 0 ? (
        <div className={cls("mt-3 divide-y overflow-hidden rounded-md border", dark ? "divide-dline border-dline" : "divide-line border-line")}>
          {services.map((service) => {
            const identity = serviceIdentity(service);
            return (
              <div key={identity} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: service.workspaceMatch ? "#2f9d6a" : "#8b8b8b" }}
                  title={service.workspaceMatch ? (ko ? "현재 작업 폴더" : "Current workspace") : undefined}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2 text-[12.5px] font-medium">
                    <span className="truncate">{service.processName || (ko ? "개발 서버" : "Development server")}</span>
                    <span className={cls("shrink-0 gb-mono text-[11px]", dark ? "text-dsub" : "text-sub")}>
                      :{service.port}
                    </span>
                  </div>
                  <div className={cls("mt-0.5 truncate text-[10.5px] gb-mono", dark ? "text-dsub" : "text-sub")}>
                    {service.cwd || service.command || service.url}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void openService(service.url).catch((nextError) => setError(String(nextError)))}
                  className={cls(
                    "h-8 shrink-0 rounded-md border px-2.5 text-[11.5px]",
                    dark ? "border-dline hover:bg-dbg" : "border-line hover:bg-cream",
                  )}
                >
                  {ko ? "열기" : "Open"}
                </button>
                {service.pid && (
                  <button
                    type="button"
                    onClick={() => void stopService(service)}
                    disabled={Boolean(stopping)}
                    className={cls(
                      "h-8 shrink-0 rounded-md border px-2.5 text-[11.5px] disabled:opacity-50",
                      dark ? "border-dline text-dsub hover:text-red-400" : "border-line text-sub hover:text-red-600",
                    )}
                  >
                    {stopping === identity ? (ko ? "중지 중..." : "Stopping...") : ko ? "중지" : "Stop"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : featureEnabled && snapshot && !loading ? (
        <div className={cls("mt-3 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
          {ko ? "수신 중인 개발 서비스를 찾지 못했습니다." : "No listening development services were found."}
        </div>
      ) : null}

      {error && <div className="mt-3 text-[11.5px] text-red-500">{error}</div>}
    </section>
  );
};

export default DevServicesPanel;
