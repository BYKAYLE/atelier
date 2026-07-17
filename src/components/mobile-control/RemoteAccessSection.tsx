import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  mobileControlDeviceFollowupsSet,
  mobileControlDeviceRevoke,
  mobileControlDevices,
  mobileControlPairingCreate,
  mobileControlPairingDiscard,
  mobileControlServerStart,
  mobileControlServerStatus,
  mobileControlServerStop,
  type MobileDevice,
  type MobilePairing,
  type MobileServerStatus,
} from "../../lib/tauri";
import { cls, type Tweaks } from "../../lib/tokens";
import { I } from "../Icons";
import {
  formatMobileTime,
  mobileDeviceState,
  pairingSecondsLeft,
  preferredPairingUrl,
} from "./mobileControl";

interface Props {
  tw: Tweaks;
}

type Busy = "server" | "pair" | "device" | null;

const RemoteAccessSection: React.FC<Props> = ({ tw }) => {
  const dark = tw.dark;
  const ko = tw.language === "ko";
  const [status, setStatus] = useState<MobileServerStatus | null>(null);
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [pairing, setPairing] = useState<MobilePairing | null>(null);
  const [allowLan, setAllowLan] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "url" | null>(null);

  const load = useCallback(async () => {
    const [nextStatus, nextDevices] = await Promise.all([
      mobileControlServerStatus(),
      mobileControlDevices(),
    ]);
    setStatus(nextStatus);
    setAllowLan(nextStatus.allowLan);
    setDevices(nextDevices);
  }, []);

  useEffect(() => {
    void load().catch((nextError) => setError(String(nextError)));
  }, [load]);

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  const secondsLeft = pairing ? pairingSecondsLeft(pairing.expiresAtMs, now) : 0;
  const pairingUrl = useMemo(
    () => pairing && status ? preferredPairingUrl(pairing.pairingUrls, status.allowLan) : null,
    [pairing, status],
  );

  useEffect(() => {
    if (pairing && secondsLeft === 0) setPairing(null);
  }, [pairing, secondsLeft]);

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
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500);
  }

  const buttonClass = cls(
    "h-9 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    dark ? "border-dline text-dink hover:bg-dmuted" : "border-line text-ink hover:bg-muted",
  );

  return (
    <div data-testid="remote-access-section">
      <div className="mb-8">
        <div className={cls("font-display text-[32px] font-medium leading-tight", dark ? "text-dink" : "text-ink")}>
          {ko ? "원격 접근" : "Remote access"}
        </div>
        <p className={cls("mt-2 text-[14px]", dark ? "text-dsub" : "text-sub")}>
          {ko
            ? "휴대폰에서 Atelier 작업 상태만 안전하게 확인합니다. 대화 원문과 자격증명은 공유되지 않습니다."
            : "Monitor Atelier safely from a phone. Prompts and credentials are never shared."}
        </p>
      </div>

      <section className={cls("border-y py-5", dark ? "border-dline" : "border-line")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-medium">
              <span className="text-[var(--accent)]">{I.mobile}</span>
              {ko ? "모바일 모니터" : "Mobile monitor"}
              <span className={cls("h-2 w-2 rounded-full", status?.running ? "bg-emerald-500" : "bg-zinc-500")} />
            </div>
            <p className={cls("mt-1 text-[12.5px]", dark ? "text-dsub" : "text-sub")}>
              {status?.running
                ? `${ko ? "실행 중" : "Running"} · ${status.baseUrls.join(" · ")}`
                : ko ? "현재 외부 연결을 받지 않습니다." : "No external connections are accepted."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!status?.running && (
              <label className={cls("flex h-9 items-center gap-2 rounded-md border px-3 text-[12px]", dark ? "border-dline" : "border-line")}>
                <input
                  type="checkbox"
                  checked={allowLan}
                  onChange={(event) => setAllowLan(event.target.checked)}
                />
                {ko ? "같은 네트워크에 공개" : "Share on local network"}
              </label>
            )}
            <button
              type="button"
              className={buttonClass}
              disabled={busy !== null}
              onClick={() => void run("server", async () => {
                if (status?.running) {
                  if (pairing) await mobileControlPairingDiscard(pairing.pairingId);
                  setPairing(null);
                  setStatus(await mobileControlServerStop());
                } else {
                  setStatus(await mobileControlServerStart(allowLan));
                }
                await load();
              })}
            >
              {status?.running ? (ko ? "중지" : "Stop") : (ko ? "시작" : "Start")}
            </button>
          </div>
        </div>
        {allowLan && !status?.running && (
          <p className="mt-3 text-[11.5px] text-amber-600">
            {ko
              ? "같은 네트워크에 자체 서명 HTTPS로 공개됩니다. 공용 Wi-Fi에서는 켜지 마세요."
              : "This uses self-signed HTTPS on your local network. Do not enable it on public Wi-Fi."}
          </p>
        )}
        {status?.running && status.tls && status.certificateFingerprint && (
          <div className={cls("mt-3 rounded-md border px-3 py-2 text-[11.5px]", dark ? "border-dline text-dsub" : "border-line text-sub") }>
            <p>
              {ko
                ? "휴대폰에서 처음 열 때 인증서 경고가 표시될 수 있습니다. 아래 SHA-256 지문을 확인한 뒤 이 인증서만 허용하세요."
                : "Your phone may show a certificate warning on first open. Verify this SHA-256 fingerprint before allowing it."}
            </p>
            <code className="mt-1 block break-all text-[10.5px]">{status.certificateFingerprint}</code>
          </div>
        )}
      </section>

      <section className={cls("border-b py-5", dark ? "border-dline" : "border-line")}>
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
            disabled={!status?.running || busy !== null}
            onClick={() => void run("pair", async () => {
              if (pairing) await mobileControlPairingDiscard(pairing.pairingId);
              setNow(Date.now());
              setPairing(await mobileControlPairingCreate());
            })}
          >
            {ko ? "페어링 코드 만들기" : "Create pairing code"}
          </button>
        </div>
        {pairing && (
          <div className={cls("mt-4 rounded-md border p-4", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}>
            <div className="flex flex-wrap items-center gap-3">
              <code className="gb-mono text-[28px] font-semibold tracking-[0.12em]">{pairing.code}</code>
              <span className={cls("text-[12px]", secondsLeft <= 60 ? "text-amber-600" : dark ? "text-dsub" : "text-sub")}>
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
              </span>
              <button type="button" className={buttonClass} onClick={() => void copy(pairing.code, "code")}>
                {copied === "code" ? (ko ? "복사됨" : "Copied") : (ko ? "코드 복사" : "Copy code")}
              </button>
              {pairingUrl && (
                <button type="button" className={buttonClass} onClick={() => void copy(pairingUrl, "url")}>
                  {copied === "url" ? (ko ? "복사됨" : "Copied") : (ko ? "연결 주소 복사" : "Copy pairing URL")}
                </button>
              )}
              <button
                type="button"
                className={buttonClass}
                onClick={() => void run("pair", async () => {
                  await mobileControlPairingDiscard(pairing.pairingId);
                  setPairing(null);
                })}
              >
                {ko ? "취소" : "Cancel"}
              </button>
            </div>
            {pairingUrl && <code className={cls("mt-3 block break-all text-[11px]", dark ? "text-dsub" : "text-sub")}>{pairingUrl}</code>}
          </div>
        )}
      </section>

      <section className="py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[14px] font-medium">{ko ? "연결된 기기" : "Paired devices"}</div>
          <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void load()}>
            {ko ? "새로고침" : "Refresh"}
          </button>
        </div>
        <div className="mt-3 divide-y divide-current/10">
          {devices.length === 0 && (
            <p className={cls("py-4 text-[12.5px]", dark ? "text-dsub" : "text-sub")}>
              {ko ? "연결된 기기가 없습니다." : "No devices are paired."}
            </p>
          )}
          {devices.map((device) => {
            const state = mobileDeviceState(device, now);
            const followupsEnabled = device.scopes.includes("command:propose");
            return (
              <div key={device.deviceId} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    <span className={cls("h-2 w-2 rounded-full", state === "active" ? "bg-emerald-500" : "bg-zinc-500")} />
                    <span className="truncate">{device.name}</span>
                    <span className={cls("text-[11px] font-normal", dark ? "text-dsub" : "text-sub")}>
                      {state === "active"
                        ? followupsEnabled
                          ? (ko ? "모니터 · 후속 지시" : "Monitor · follow-up")
                          : (ko ? "읽기 전용" : "Read only")
                        : state === "revoked"
                          ? (ko ? "해제됨" : "Revoked")
                          : (ko ? "만료됨" : "Expired")}
                    </span>
                  </div>
                  <div className={cls("mt-1 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
                    {ko ? "마지막 접속" : "Last seen"}: {formatMobileTime(device.lastSeenAtMs, tw.language)}
                  </div>
                </div>
                {state === "active" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy !== null}
                      onClick={() => void run("device", async () => {
                        await mobileControlDeviceFollowupsSet(device.deviceId, !followupsEnabled);
                        await load();
                      })}
                    >
                      {followupsEnabled
                        ? (ko ? "후속 지시 해제" : "Disable follow-up")
                        : (ko ? "후속 지시 허용" : "Enable follow-up")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy !== null}
                      onClick={() => void run("device", async () => {
                        await mobileControlDeviceRevoke(device.deviceId);
                        await load();
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

      {error && <div className="mt-4 rounded-md border border-red-400/40 bg-red-500/5 p-3 text-[12px] text-red-500">{error}</div>}
    </div>
  );
};

export default RemoteAccessSection;
