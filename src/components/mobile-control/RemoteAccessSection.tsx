import React, { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useFeatureSetting } from "../../features/featureSettings";
import {
  mobileControlDeviceFollowupsSet,
  mobileControlDeviceRevoke,
  mobileControlDevices,
  mobileControlNetworkCandidates,
  mobileControlPairingCreate,
  mobileControlPairingDiscard,
  mobileControlServerStart,
  mobileControlServerStatus,
  mobileControlServerStop,
  mobileControlTailscaleStatus,
  type MobileConnectionMode,
  type MobileDevice,
  type MobileNetworkCandidate,
  type MobilePairing,
  type MobileServerStatus,
  type MobileTailscaleStatus,
} from "../../lib/tauri";
import { cls, type Tweaks } from "../../lib/tokens";
import { I } from "../Icons";
import {
  formatMobileTime,
  isAllowedTailscaleActivationUrl,
  mobileDeviceState,
  pairingSecondsLeft,
  preferredMobileNetworkAddress,
  preferredPairingUrlForMode,
} from "./mobileControl";

interface Props {
  tw: Tweaks;
}

type Busy = "server" | "pair" | "device" | "tailscale" | null;
const CONNECTION_MODES: MobileConnectionMode[] = ["local", "lan", "tailscale"];

const RemoteAccessSection: React.FC<Props> = ({ tw }) => {
  const [featureEnabled] = useFeatureSetting<boolean>("mobile-control", "enabled", true);
  const [allowLanDefault] = useFeatureSetting<boolean>("mobile-control", "allowLanDefault", false);
  const dark = tw.dark;
  const ko = tw.language === "ko";
  const defaultMode: MobileConnectionMode = allowLanDefault ? "lan" : "local";

  const [status, setStatus] = useState<MobileServerStatus | null>(null);
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [pairing, setPairing] = useState<MobilePairing | null>(null);
  const [connectionMode, setConnectionMode] = useState<MobileConnectionMode>(defaultMode);
  const [networkCandidates, setNetworkCandidates] = useState<MobileNetworkCandidate[]>([]);
  const [selectedLanIp, setSelectedLanIp] = useState<string | null>(null);
  const [networkCandidatesLoading, setNetworkCandidatesLoading] = useState(false);
  const [networkCandidatesError, setNetworkCandidatesError] = useState<string | null>(null);
  const [tailscaleStatus, setTailscaleStatus] = useState<MobileTailscaleStatus | null>(null);
  const [tailscaleLoading, setTailscaleLoading] = useState(false);
  const [tailscaleError, setTailscaleError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "url" | null>(null);
  const [now, setNow] = useState(Date.now());

  const activeMode = status?.running ? status.connectionMode : connectionMode;
  const needsLanSelection = !status?.running && connectionMode === "lan";
  const showTailscaleDetails = activeMode === "tailscale";

  const load = useCallback(async () => {
    const [statusResult, devicesResult] = await Promise.allSettled([
      mobileControlServerStatus(),
      mobileControlDevices(),
    ]);
    if (statusResult.status === "fulfilled") {
      setStatus(statusResult.value);
      if (statusResult.value.running) setConnectionMode(statusResult.value.connectionMode);
      if (statusResult.value.tailscale) setTailscaleStatus(statusResult.value.tailscale);
    }
    if (devicesResult.status === "fulfilled") setDevices(devicesResult.value);
    const failures = [statusResult, devicesResult]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason));
    if (failures.length > 0) throw new Error(failures.join(" · "));
  }, []);

  const loadNetworkCandidates = useCallback(async () => {
    setNetworkCandidatesLoading(true);
    setNetworkCandidatesError(null);
    try {
      const nextCandidates = await mobileControlNetworkCandidates();
      setNetworkCandidates(nextCandidates);
      setSelectedLanIp((current) => preferredMobileNetworkAddress(nextCandidates, current));
    } catch (nextError) {
      setNetworkCandidates([]);
      setSelectedLanIp(null);
      setNetworkCandidatesError(String(nextError));
    } finally {
      setNetworkCandidatesLoading(false);
    }
  }, []);

  const loadTailscaleStatus = useCallback(async () => {
    setTailscaleLoading(true);
    setTailscaleError(null);
    try {
      setTailscaleStatus(await mobileControlTailscaleStatus());
    } catch (nextError) {
      setTailscaleStatus(null);
      setTailscaleError(String(nextError));
    } finally {
      setTailscaleLoading(false);
    }
  }, []);

  useEffect(() => {
    void load().catch((nextError) => setError(String(nextError)));
  }, [load]);

  useEffect(() => {
    if (status?.running) return;
    setConnectionMode(defaultMode);
  }, [defaultMode, status?.running]);

  useEffect(() => {
    if (activeMode !== "lan") return;
    void loadNetworkCandidates();
  }, [activeMode, loadNetworkCandidates]);

  useEffect(() => {
    if (activeMode !== "tailscale") return;
    void loadTailscaleStatus();
  }, [activeMode, loadTailscaleStatus]);

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  useEffect(() => {
    if (pairing && pairingSecondsLeft(pairing.expiresAtMs, now) === 0) {
      setPairing(null);
    }
  }, [pairing, now]);

  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string, kind: "code" | "url") {
    setError(null);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500);
    } catch (nextError) {
      setCopied(null);
      setError(ko
        ? `클립보드에 복사하지 못했습니다: ${String(nextError)}`
        : `Could not copy to the clipboard: ${String(nextError)}`);
    }
  }

  async function replacePairing() {
    if (pairing) await mobileControlPairingDiscard(pairing.pairingId);
    setPairing(null);
    setNow(Date.now());
    setPairing(await mobileControlPairingCreate());
  }

  function modeLabel(mode: MobileConnectionMode): string {
    if (mode === "lan") return ko ? "같은 네트워크" : "Same network";
    if (mode === "tailscale") return ko ? "Tailscale 외부접속" : "Tailscale remote";
    return ko ? "로컬 전용" : "Local only";
  }

  function modeDescription(mode: MobileConnectionMode): string {
    if (mode === "lan") return ko ? "같은 Wi‑Fi 또는 LAN" : "Same Wi‑Fi or LAN";
    if (mode === "tailscale") return ko ? "같은 tailnet에서 외부 접속" : "Remote access in the same tailnet";
    return ko ? "이 컴퓨터에서만" : "This computer only";
  }

  const pairingUrl = useMemo(
    () => pairing ? preferredPairingUrlForMode(pairing.pairingUrls, activeMode) : null,
    [activeMode, pairing],
  );

  const selectedNetworkCandidate = networkCandidates.find((candidate) => candidate.address === selectedLanIp) ?? null;
  const displayedTailscaleStatus = status?.running && status.connectionMode === "tailscale"
    ? status.tailscale ?? tailscaleStatus
    : tailscaleStatus;
  const secondsLeft = pairing ? pairingSecondsLeft(pairing.expiresAtMs, now) : 0;
  const canCreatePairing = Boolean(featureEnabled && status?.running && status.connectionMode !== "local" && busy === null);
  const canStartSelectedMode = Boolean(
    featureEnabled
    && busy === null
    && (
      connectionMode === "local"
      || (connectionMode === "lan" && !networkCandidatesLoading && selectedLanIp)
      || (connectionMode === "tailscale" && !tailscaleLoading && tailscaleStatus?.active)
    ),
  );

  function toggleServer() {
    void run("server", async () => {
      try {
        if (status?.running) {
          if (pairing) await mobileControlPairingDiscard(pairing.pairingId);
          setPairing(null);
          setStatus(await mobileControlServerStop());
          return;
        }

        if (!featureEnabled) return;
        if (connectionMode === "lan" && !selectedLanIp) {
          throw new Error(ko
            ? "모바일 연결에 사용할 네트워크 주소를 선택하세요."
            : "Select a network address for the mobile connection.");
        }
        if (connectionMode === "tailscale" && !tailscaleStatus?.active) {
          throw new Error(
            tailscaleStatus?.blockedReason
              ?? (ko ? "Tailscale 준비 상태를 다시 확인해 주세요." : "Check Tailscale readiness again."),
          );
        }

        const allowLan = connectionMode === "lan";
        const nextStatus = await mobileControlServerStart(
          allowLan,
          null,
          allowLan ? selectedLanIp : null,
          connectionMode,
        );
        setStatus(nextStatus);
        if (connectionMode !== "local") {
          setNow(Date.now());
          setPairing(await mobileControlPairingCreate());
        }
      } finally {
        await load();
      }
    });
  }

  function createNewPairing() {
    void run("pair", replacePairing);
  }

  function openTailscaleActivation() {
    void run("tailscale", async () => {
      const activationUrl = displayedTailscaleStatus?.activationUrl;
      if (!activationUrl || !isAllowedTailscaleActivationUrl(activationUrl)) {
        throw new Error(ko
          ? "안전한 Tailscale 활성화 주소를 확인할 수 없습니다."
          : "A safe Tailscale activation URL is not available.");
      }
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(activationUrl);
      } catch {
        const opened = window.open(activationUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
          throw new Error(ko
            ? "Tailscale 활성화 페이지를 열지 못했습니다."
            : "Could not open the Tailscale activation page.");
        }
      }
    });
  }

  const buttonClass = cls(
    "min-h-11 rounded-md border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
    dark ? "border-dline text-dink hover:bg-dmuted" : "border-line text-ink hover:bg-muted",
  );

  return (
    <div data-testid="remote-access-section" className="min-w-0">
      <section className={cls("border-y py-3", dark ? "border-dline" : "border-line")}>
        {!featureEnabled && (
          <div className="mb-4 rounded-md border border-amber-500/30 px-3 py-2 text-[12px] text-amber-500">
            {status?.running
              ? (ko ? "모바일 제어가 꺼져 있어도 현재 실행 중인 서버는 중지할 수 있습니다." : "Mobile control is disabled, but you can still stop the running server.")
              : (ko ? "기능 설정에서 모바일 제어를 켜세요." : "Enable mobile control in Feature settings.")}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <header className="min-w-0">
            <h3 className="flex items-center gap-2 text-[14px] font-medium">
              <span className="text-[var(--accent)]">{I.mobile}</span>
              {ko ? "모바일 모니터" : "Mobile monitor"}
              <span className={cls("h-2 w-2 rounded-full", status?.running ? "bg-emerald-500" : "bg-zinc-500")} />
            </h3>
            <p className={cls("mt-1 text-[12.5px]", dark ? "text-dsub" : "text-sub")}>
              {status?.running
                ? `${ko ? "실행 중" : "Running"} · ${status.baseUrls.join(" · ")}`
                : ko ? "현재 외부 연결을 받지 않습니다." : "No remote connection is being accepted right now."}
            </p>
          </header>

          <button
            type="button"
            className={buttonClass}
            disabled={status?.running ? busy !== null : !canStartSelectedMode}
            onClick={toggleServer}
          >
            {status?.running
              ? (ko ? "중지" : "Stop")
              : connectionMode === "local"
                ? (ko ? "로컬 전용 시작" : "Start locally")
                : connectionMode === "lan"
                  ? (ko ? "같은 네트워크 연결 시작" : "Start same-network access")
                  : (ko ? "Tailscale 외부접속 시작" : "Start Tailscale remote access")}
          </button>
        </div>

        <fieldset className="mt-4 flex flex-wrap gap-2">
          <legend className="sr-only">
            {ko ? "모바일 연결 방식" : "Mobile connection mode"}
          </legend>
          {CONNECTION_MODES.map((mode) => {
            const selected = (!status?.running && connectionMode === mode) || (status?.running && status.connectionMode === mode);
            const disabled = Boolean(status?.running || !featureEnabled || busy !== null);
            return (
              <label
                key={mode}
                className={cls(
                  "relative rounded-full border px-3 py-2 text-left text-[11.5px] transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent)] has-[:focus-visible]:ring-offset-2",
                  selected
                    ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]"
                    : dark ? "border-dline text-dsub hover:bg-dmuted" : "border-line text-sub hover:bg-muted",
                  disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
                )}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="mobile-connection-mode"
                  value={mode}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => setConnectionMode(mode)}
                />
                <span className="block font-medium">{modeLabel(mode)}</span>
                <span className="mt-0.5 block text-[10.5px] opacity-80">{modeDescription(mode)}</span>
              </label>
            );
          })}
        </fieldset>

        {needsLanSelection && networkCandidates.length >= 2 && (
          <label className="mt-4 block max-w-xl" htmlFor="mobile-network-address">
            <span className={cls("mb-1.5 block text-[11.5px] font-medium", dark ? "text-dsub" : "text-sub")}>
              {ko ? "연결할 네트워크 주소" : "Network address for mobile connection"}
            </span>
            <select
              id="mobile-network-address"
              className={cls(
                "min-h-11 w-full rounded-md border bg-transparent px-3 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45",
                dark ? "border-dline text-dink" : "border-line text-ink",
              )}
              value={selectedLanIp ?? ""}
              disabled={!featureEnabled || networkCandidatesLoading || busy !== null}
              onChange={(event) => setSelectedLanIp(event.target.value)}
            >
              {selectedLanIp === null && (
                <option value="" disabled>
                  {ko ? "네트워크 주소를 선택하세요" : "Select a network address"}
                </option>
              )}
              {networkCandidates.map((candidate) => (
                <option key={`${candidate.interfaceName}:${candidate.address}`} value={candidate.address}>
                  {candidate.interfaceName ? `${candidate.interfaceName} · ` : ""}
                  {candidate.address}
                  {candidate.recommended ? (ko ? " · 권장" : " · Recommended") : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {needsLanSelection && networkCandidates.length === 1 && selectedNetworkCandidate && (
          <p className={cls("mt-4 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
            {ko ? "연결 주소 자동 선택" : "Network address selected automatically"}
            {` · ${selectedNetworkCandidate.interfaceName ? `${selectedNetworkCandidate.interfaceName} · ` : ""}${selectedNetworkCandidate.address}`}
            {selectedNetworkCandidate.recommended ? (ko ? " · 권장" : " · Recommended") : ""}
          </p>
        )}

        {needsLanSelection && networkCandidatesLoading && networkCandidates.length === 0 && (
          <p className={cls("mt-4 text-[11.5px]", dark ? "text-dsub" : "text-sub")} role="status">
            {ko ? "연결 가능한 네트워크 주소를 불러오는 중입니다." : "Loading available network addresses."}
          </p>
        )}

        {needsLanSelection && networkCandidatesError && (
          <div
            role="alert"
            className={cls(
              "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-400/40 bg-red-500/5 px-3 py-3 text-[12px]",
              dark ? "text-red-300" : "text-red-700",
            )}
          >
            <span className="min-w-0 flex-1 break-words">
              {ko
                ? `네트워크 주소를 불러오지 못했습니다: ${networkCandidatesError} 로컬 전용 모드는 계속 사용할 수 있습니다.`
                : `Could not load network addresses: ${networkCandidatesError} Local-only mode is still available.`}
            </span>
            <button
              type="button"
              className={buttonClass}
              disabled={networkCandidatesLoading || busy !== null}
              onClick={() => void loadNetworkCandidates()}
            >
              {ko ? "다시 불러오기" : "Retry"}
            </button>
          </div>
        )}

        {needsLanSelection && !networkCandidatesLoading && !networkCandidatesError && networkCandidates.length === 0 && (
          <p className="mt-4 text-[11.5px] text-amber-600" role="status">
            {ko
              ? "연결 가능한 개인 네트워크 주소가 없습니다. 네트워크 연결을 확인하세요. 로컬 전용 모드는 계속 사용할 수 있습니다."
              : "No private network address is available. Check the network connection. Local-only mode is still available."}
          </p>
        )}

        {needsLanSelection && (
          <p className="mt-4 text-[11.5px] text-amber-600">
            {ko
              ? "같은 네트워크에 자체 서명 HTTPS로 공개됩니다. 공용 Wi‑Fi에서는 켜지 마세요."
              : "This uses self-signed HTTPS on your local network. Do not enable it on public Wi‑Fi."}
          </p>
        )}

        {showTailscaleDetails && (
          <div className={cls("mt-4 rounded-md border px-3 py-3 text-[12px]", dark ? "border-dline" : "border-line")}>
            <strong className="block text-[12.5px]">
              {ko ? "Tailscale 준비 상태" : "Tailscale readiness"}
            </strong>
            <p className={cls("mt-2 leading-5", dark ? "text-dsub" : "text-sub")}>
              {ko
                ? "Mac 또는 Windows 컴퓨터와 iPhone 또는 Android 휴대폰 모두에 Tailscale이 필요하며, 두 기기가 같은 tailnet에 로그인되어 있어야 합니다."
                : "Tailscale is required on both the Mac or Windows computer and the iPhone or Android phone. Sign both devices into the same tailnet."}
            </p>
            {tailscaleLoading && (
              <p className={cls("mt-2", dark ? "text-dsub" : "text-sub")}>
                {ko ? "Tailscale 상태를 확인하는 중입니다." : "Checking Tailscale status."}
              </p>
            )}
            {!tailscaleLoading && displayedTailscaleStatus && (
              <div className={cls("mt-2 space-y-1", dark ? "text-dsub" : "text-sub")}>
                <p>{ko ? "설치됨" : "Installed"} · {displayedTailscaleStatus.installed ? (ko ? "예" : "Yes") : (ko ? "아니오" : "No")}</p>
                <p>{ko ? "Tailscale 실행" : "Tailscale running"} · {displayedTailscaleStatus.running ? (ko ? "연결됨" : "Connected") : (ko ? "미연결" : "Disconnected")}</p>
                <p>{ko ? "Serve 사용 가능" : "Serve enabled"} · {displayedTailscaleStatus.serveEnabled ? (ko ? "예" : "Yes") : (ko ? "아니오" : "No")}</p>
                <p>{ko ? "외부접속 준비" : "Remote access ready"} · {displayedTailscaleStatus.active ? (ko ? "준비됨" : "Ready") : (ko ? "준비 필요" : "Needs attention")}</p>
                {displayedTailscaleStatus.dnsName && (
                  <p>{ko ? "Tailnet 주소" : "Tailnet address"} · {displayedTailscaleStatus.dnsName}</p>
                )}
                {displayedTailscaleStatus.serveUrl && (
                  <p className="break-all">{ko ? "접속 주소" : "Access address"} · {displayedTailscaleStatus.serveUrl}</p>
                )}
                {displayedTailscaleStatus.tailscaleIps.length > 0 && (
                  <p className="break-all">{ko ? "Tailscale IP" : "Tailscale IP"} · {displayedTailscaleStatus.tailscaleIps.join(" · ")}</p>
                )}
                {displayedTailscaleStatus.blockedReason && (
                  <p className={cls("rounded-md border border-amber-500/35 px-2.5 py-2", dark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-800")}>
                    {displayedTailscaleStatus.blockedReason}
                  </p>
                )}
              </div>
            )}
            {tailscaleError && (
              <p className="mt-2 text-red-500">{tailscaleError}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={tailscaleLoading || busy !== null}
                onClick={() => void loadTailscaleStatus()}
              >
                {ko ? "상태 다시 확인" : "Refresh status"}
              </button>
              {displayedTailscaleStatus?.activationUrl && isAllowedTailscaleActivationUrl(displayedTailscaleStatus.activationUrl) && (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy !== null}
                  onClick={openTailscaleActivation}
                >
                  {ko ? "Serve 활성화 열기" : "Open Serve activation"}
                </button>
              )}
            </div>
            <p className={cls("mt-3 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
              {ko
                ? "외부접속은 공개 인터넷이 아니라 같은 tailnet에 로그인된 iPhone·Android 브라우저에서만 열립니다."
                : "Remote access is tailnet-only. It opens only on iPhone or Android devices signed into the same tailnet."}
            </p>
          </div>
        )}

        {!status?.running && connectionMode === "local" && featureEnabled && (
          <p className={cls("mt-4 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
            {ko
              ? "로컬 전용 모드는 현재 컴퓨터에서만 열립니다. 휴대폰 연결이 필요하면 같은 네트워크 또는 Tailscale 외부접속을 선택하세요."
              : "Local-only mode opens on this computer only. Choose Same network or Tailscale remote access when you need phone access."}
          </p>
        )}

        {status?.running && status.connectionMode === "local" && (
          <div
            role="status"
            className={cls(
              "mt-4 rounded-md border border-amber-500/40 px-3 py-3 text-[12px]",
              dark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-800",
            )}
          >
            <strong className="block font-semibold">
              {ko
                ? "127.0.0.1은 현재 컴퓨터에서만 열려 휴대폰에서 접속할 수 없습니다."
                : "127.0.0.1 opens only on this computer and cannot be reached from a phone."}
            </strong>
            <span className="mt-1 block text-[11.5px]">
              {ko
                ? "같은 네트워크 또는 Tailscale 외부접속 모드로 다시 시작하면 모바일에서 접속할 수 있습니다."
                : "Restart in Same network or Tailscale remote mode to connect from mobile."}
            </span>
          </div>
        )}

        {status?.running && status.connectionMode === "lan" && status.certificateFingerprint && (
          <div className={cls("mt-4 rounded-md border px-3 py-2 text-[11.5px]", dark ? "border-dline text-dsub" : "border-line text-sub")}>
            <p>
              {ko
                ? "iPhone 또는 Android에서 처음 열 때 자체 서명 인증서 경고가 표시될 수 있습니다. 신뢰하는 같은 네트워크에서만 아래 안내에 따라 한 번 계속 진행하세요."
                : "iPhone or Android may show a self-signed certificate warning on first open. Continue once only when using the same trusted network."}
            </p>
            <span className="mt-2 block text-[10.5px] font-medium">
              {ko ? "SHA-256 인증서 지문" : "SHA-256 certificate fingerprint"}
            </span>
            <code className="mt-1 block break-all text-[10.5px]">{status.certificateFingerprint}</code>
          </div>
        )}
      </section>

      <section className={cls("border-b py-3", dark ? "border-dline" : "border-line")}>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {pairing
            ? (ko ? `새 페어링 코드 ${pairing.code}가 생성되었습니다.` : `New pairing code ${pairing.code} was created.`)
            : ""}
        </span>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {copied === "code"
            ? (ko ? "페어링 코드를 복사했습니다." : "Pairing code copied.")
            : copied === "url"
              ? (ko ? "연결 주소를 복사했습니다." : "Pairing address copied.")
              : ""}
        </span>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[14px] font-medium">{ko ? "새 기기 연결" : "Pair a device"}</div>
            <p className={cls("mt-1 text-[12.5px]", dark ? "text-dsub" : "text-sub")}>
              {ko ? "코드는 5분 뒤 만료되며 한 번만 사용할 수 있습니다." : "Codes expire after five minutes and work once."}
            </p>
          </div>
          <button
            type="button"
            className={buttonClass}
            disabled={!canCreatePairing}
            onClick={createNewPairing}
          >
            {ko ? "페어링 코드 만들기" : "Create pairing code"}
          </button>
        </div>

        {pairing && (
          <div className={cls("mt-4 rounded-md border p-4", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}>
            <div className="flex flex-wrap items-center gap-3">
              <code
                className="gb-mono text-[28px] font-semibold tracking-[0.12em]"
                aria-label={ko ? `페어링 코드 ${pairing.code}` : `Pairing code ${pairing.code}`}
              >
                {pairing.code}
              </code>
              <span
                className={cls("text-[12px]", secondsLeft <= 60 ? "text-amber-600" : dark ? "text-dsub" : "text-sub")}
                aria-label={ko ? `만료까지 ${secondsLeft}초` : `${secondsLeft} seconds until expiry`}
              >
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
              </span>
              <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void copy(pairing.code, "code")}>
                {copied === "code" ? (ko ? "복사됨" : "Copied") : (ko ? "코드 복사" : "Copy code")}
              </button>
              {pairingUrl && (
                <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void copy(pairingUrl, "url")}>
                  {copied === "url" ? (ko ? "복사됨" : "Copied") : (ko ? "연결 주소 복사" : "Copy pairing URL")}
                </button>
              )}
              <button
                type="button"
                className={buttonClass}
                disabled={busy !== null}
                onClick={() => void run("pair", async () => {
                  await mobileControlPairingDiscard(pairing.pairingId);
                  setPairing(null);
                })}
              >
                {ko ? "취소" : "Cancel"}
              </button>
            </div>

            {pairingUrl && activeMode !== "local" && (
              <div
                data-testid="phone-pairing-qr"
                data-connection-mode={activeMode}
                className="mt-5 grid items-start gap-4 sm:grid-cols-[160px_minmax(0,1fr)]"
              >
                <div className="w-fit rounded-md bg-white p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]">
                  <QRCodeSVG
                    value={pairingUrl}
                    size={144}
                    level="M"
                    marginSize={4}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    role="img"
                    title={ko ? "Atelier 휴대폰 페어링 QR 코드" : "Atelier phone pairing QR code"}
                    aria-label={ko ? "Atelier 휴대폰 페어링 QR 코드" : "Atelier phone pairing QR code"}
                  />
                </div>
                <div className="min-w-0 break-words text-[12px] leading-5 [word-break:keep-all] sm:pt-1">
                  <strong className="block text-[13px]">
                    {ko ? "iPhone · Android 연결 순서" : "Connect from iPhone or Android"}
                  </strong>
                  <ol className={cls("mt-2 list-decimal space-y-1 pl-5", dark ? "text-dsub" : "text-sub")}>
                    {activeMode === "lan" ? (
                      <>
                        <li>{ko ? "휴대폰과 현재 컴퓨터를 같은 신뢰 네트워크에 연결합니다." : "Connect the phone and this computer to the same trusted network."}</li>
                        <li>{ko ? "QR을 스캔해 연결 페이지를 엽니다." : "Scan the QR code to open the pairing page."}</li>
                        <li>{ko ? "인증서 경고가 뜨면 처음 한 번만 ‘세부사항’(또는 ‘고급’)을 열고 ‘계속 방문’을 선택합니다." : "If a certificate warning appears, open Details (or Advanced) and choose Continue once."}</li>
                        <li>{ko ? "페이지가 열리면 이 화면의 6자리 코드를 입력합니다." : "When the page opens, enter the six-digit code shown here."}</li>
                      </>
                    ) : (
                      <>
                        <li>{ko ? "Mac 또는 Windows 컴퓨터와 iPhone 또는 Android 휴대폰 모두에서 Tailscale을 열고 같은 tailnet에 로그인합니다." : "Open Tailscale on both the Mac or Windows computer and the iPhone or Android phone, then sign into the same tailnet."}</li>
                        <li>{ko ? "두 기기의 Tailscale 연결을 유지한 채 QR을 스캔해 Atelier 연결 페이지를 엽니다." : "Keep Tailscale connected on both devices and scan the QR code to open the Atelier pairing page."}</li>
                        <li>{ko ? "Tailscale 경유 HTTPS이므로 추가 인증서 경고 없이 바로 열려야 합니다." : "Because Tailscale serves HTTPS, the page should open without an extra certificate warning."}</li>
                        <li>{ko ? "페이지가 열리면 이 화면의 6자리 코드를 입력합니다." : "When the page opens, enter the six-digit code shown here."}</li>
                      </>
                    )}
                  </ol>
                  {activeMode === "lan" && (
                    <p
                      className={cls(
                        "mt-3 rounded-md border border-amber-500/35 px-2.5 py-2",
                        dark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-800",
                      )}
                    >
                      {ko
                        ? "Windows 호스트: 처음 실행할 때 방화벽 알림이 뜨면 ‘개인 네트워크’만 허용하세요. ‘공용 네트워크’는 허용하지 마세요."
                        : "Windows host: If a firewall prompt appears on first launch, allow Private networks only. Do not allow Public networks."}
                    </p>
                  )}
                  <p className={cls("mt-2", dark ? "text-dsub" : "text-sub")}>
                    {ko ? "QR에는 6자리 코드가 들어 있지 않습니다." : "The QR does not contain the six-digit code."}
                  </p>
                </div>
              </div>
            )}

            {status?.running && status.connectionMode === "local" && (
              <div className={cls("mt-4 rounded-md border border-amber-500/40 px-3 py-3 text-[12px]", dark ? "text-amber-300" : "text-amber-800")}>
                {ko
                  ? "이 페어링 주소는 현재 컴퓨터에서만 열립니다. 같은 네트워크 또는 Tailscale 외부접속 모드로 다시 시작해 주세요."
                  : "This pairing address opens only on this computer. Restart in Same network or Tailscale remote mode."}
              </div>
            )}

            {pairingUrl && (
              <div className="mt-3">
                <span className={cls("block text-[11px]", dark ? "text-dsub" : "text-sub")}>
                  {ko ? "수동 연결 주소" : "Manual pairing address"}
                </span>
                <code className={cls("mt-1 block break-all text-[11px]", dark ? "text-dsub" : "text-sub")}>{pairingUrl}</code>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[14px] font-medium">{ko ? "연결된 기기" : "Paired devices"}</div>
          <button type="button" className={buttonClass} disabled={!featureEnabled || busy !== null} onClick={() => void load()}>
            {ko ? "새로고침" : "Refresh"}
          </button>
        </div>

        {deviceNotice && (
          <p
            className={cls("mt-3 text-[11.5px]", dark ? "text-dsub" : "text-sub")}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {deviceNotice}
          </p>
        )}

        <div className="mt-3 divide-y divide-current/10">
          {devices.length === 0 && (
            <p className={cls("py-2 text-[12.5px]", dark ? "text-dsub" : "text-sub")}>
              {ko ? "연결된 기기가 없습니다." : "No devices are paired."}
            </p>
          )}

          {devices.map((device) => {
            const state = mobileDeviceState(device, now);
            const taskContinuationEnabled = device.scopes.includes("task:followup");
            const legacyProposalEnabled = device.scopes.includes("command:propose");
            return (
              <div key={device.deviceId} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    <span className={cls("h-2 w-2 rounded-full", state === "active" ? "bg-emerald-500" : "bg-zinc-500")} />
                    <span className="truncate">{device.name}</span>
                    <span className={cls("text-[11px] font-normal", dark ? "text-dsub" : "text-sub")}>
                      {state === "active"
                        ? taskContinuationEnabled
                          ? (ko ? "모니터 · 모바일 작업 이어가기 허용" : "Monitor · mobile task continuation allowed")
                          : legacyProposalEnabled
                            ? (ko ? "모니터 · 기존 후속 지시 제안만 가능" : "Monitor · legacy follow-up proposals only")
                          : (ko ? "읽기 전용 · 모바일 작업 이어가기 불가" : "Read only · mobile task continuation unavailable")
                        : state === "revoked"
                          ? (ko ? "해제됨" : "Revoked")
                          : (ko ? "만료됨" : "Expired")}
                    </span>
                  </div>
                  <div className={cls("mt-1 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
                    {ko ? "마지막 접속" : "Last seen"}: {formatMobileTime(device.lastSeenAtMs, tw.language)}
                  </div>
                  <div className={cls("mt-1 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
                    {taskContinuationEnabled
                      ? (ko
                        ? "이 기기에서 선택한 동일 작업에 자연어 후속 지시를 바로 큐에 추가할 수 있습니다."
                        : "This device can queue a natural-language follow-up only for the selected existing task.")
                      : legacyProposalEnabled
                        ? (ko
                          ? "기존 후속 지시 제안 권한은 유지되지만, 모바일 작업 이어가기는 별도로 허용해야 합니다."
                          : "Legacy follow-up proposals remain available, but mobile task continuation must be enabled separately.")
                      : (ko
                        ? "현재는 상태 읽기만 가능합니다. 모바일 작업 이어가기는 허용되지 않았습니다."
                        : "This device can only read status; mobile task continuation is not allowed.")}
                  </div>
                </div>

                {featureEnabled && state === "active" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy !== null}
                      onClick={() => void run("device", async () => {
                        const nextEnabled = !taskContinuationEnabled;
                        setDeviceNotice(null);
                        await mobileControlDeviceFollowupsSet(device.deviceId, nextEnabled);
                        await load();
                        setDeviceNotice(nextEnabled
                          ? (ko
                            ? `${device.name} 기기에서 모바일 작업 이어가기를 허용했습니다.`
                            : `Mobile task continuation was enabled for ${device.name}.`)
                          : (ko
                            ? `${device.name} 기기의 모바일 작업 이어가기를 해제했습니다.`
                            : `Mobile task continuation was disabled for ${device.name}.`));
                      })}
                    >
                      {taskContinuationEnabled
                        ? (ko ? "모바일 작업 이어가기 해제" : "Disable mobile task continuation")
                        : (ko ? "모바일 작업 이어가기 허용" : "Enable mobile task continuation")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy !== null}
                      onClick={() => void run("device", async () => {
                        setDeviceNotice(null);
                        await mobileControlDeviceRevoke(device.deviceId);
                        await load();
                        setDeviceNotice(ko
                          ? `${device.name} 기기의 연결을 해제했습니다.`
                          : `${device.name} was revoked.`);
                      })}
                    >
                      {ko ? "연결 해제" : "Revoke"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {error && (
        <div role="alert" className="mt-3 rounded-md border border-red-400/40 bg-red-500/5 px-3 py-3 text-[12px] text-red-500">
          {error}
        </div>
      )}
    </div>
  );
};

export default RemoteAccessSection;
