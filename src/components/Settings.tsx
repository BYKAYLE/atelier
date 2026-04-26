import React, { useState } from "react";
import { ACCENTS, cls, MOD_KEY, Profile, Tweaks } from "../lib/tokens";
import { I } from "./Icons";

interface Props {
  tw: Tweaks;
  setTw: (p: Partial<Tweaks>) => void;
}

const Settings: React.FC<Props> = ({ tw, setTw }) => {
  const dark = tw.dark;
  const [section, setSection] = useState<string>("terminal");

  const nav: Array<[string, string, React.ReactNode]> = [
    ["terminal", "터미널", I.terminal],
    ["appearance", "외관", I.palette],
    ["profiles", "프로필", I.zap],
    ["shortcuts", "단축키", I.keyboard],
    ["preview", "미리보기 패널", I.eye],
    ["updates", "업데이트", I.gear],
  ];

  return (
    <div
      className={cls(
        "h-full w-full flex fade-in",
        dark ? "bg-dbg" : "bg-cream",
      )}
    >
      <aside
        className={cls(
          "w-[240px] shrink-0 h-full border-r px-3 pt-6",
          dark ? "border-dline" : "border-line",
        )}
      >
        <div
          className={cls(
            "px-2 mb-4 font-display text-[20px] font-[500]",
            dark ? "text-dink" : "text-ink",
          )}
        >
          설정
        </div>
        <nav className="space-y-0.5">
          {nav.map(([k, label, icon]) => (
            <button
              key={k}
              onClick={() => setSection(k)}
              className={cls(
                "w-full h-9 px-2.5 rounded-[7px] text-left text-[13px] flex items-center gap-2.5 transition-colors",
                section === k
                  ? dark
                    ? "bg-dmuted text-dink"
                    : "bg-surface text-ink shadow-[0_0_0_1px_#e5e3db]"
                  : dark
                    ? "text-dsub hover:text-dink"
                    : "text-sub hover:text-ink",
              )}
            >
              <span className="[&>svg]:w-[14px] [&>svg]:h-[14px]">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-[720px] px-10 pt-10 pb-16">
          {section === "terminal" && <TerminalSection tw={tw} setTw={setTw} />}
          {section === "appearance" && <AppearanceSection tw={tw} setTw={setTw} />}
          {section === "profiles" && <ProfilesSection tw={tw} setTw={setTw} />}
          {section === "shortcuts" && <ShortcutsSection dark={dark} />}
          {section === "preview" && <PreviewSection dark={dark} />}
          {section === "updates" && <UpdatesSection dark={dark} />}
        </div>
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ dark: boolean; title: string; sub: string }> = ({
  dark,
  title,
  sub,
}) => (
  <div className="mb-8">
    <div
      className={cls(
        "font-display text-[32px] font-[500] tracking-[-0.02em] leading-[1.12] mb-2",
        dark ? "text-dink" : "text-ink",
      )}
    >
      {title}
    </div>
    <div className={cls("text-[14px]", dark ? "text-dsub" : "text-sub")}>{sub}</div>
  </div>
);

const Row: React.FC<{
  dark: boolean;
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ dark, label, hint, children }) => (
  <div
    className={cls(
      "py-5 border-b flex items-start gap-6",
      dark ? "border-dline" : "border-line",
    )}
  >
    <div className="flex-1 min-w-0 pt-1">
      <div className={cls("text-[13.5px] font-medium", dark ? "text-dink" : "text-ink")}>
        {label}
      </div>
      {hint && (
        <div
          className={cls(
            "mt-0.5 text-[12px] leading-[1.5] max-w-[360px]",
            dark ? "text-dsub" : "text-sub",
          )}
        >
          {hint}
        </div>
      )}
    </div>
    <div className="shrink-0 flex items-center gap-2">{children}</div>
  </div>
);

const SegControl: React.FC<{
  dark: boolean;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}> = ({ dark, value, onChange, options }) => (
  <div
    className={cls(
      "inline-flex p-0.5 rounded-[8px] border text-[12px] font-medium",
      dark ? "bg-dmuted border-dline" : "bg-muted border-line",
    )}
  >
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={cls(
          "h-7 px-3 rounded-[6px] transition-colors",
          value === o.value
            ? dark
              ? "bg-dsurf text-dink"
              : "bg-surface text-ink shadow-[0_0_0_1px_#e5e3db]"
            : dark
              ? "text-dsub hover:text-dink"
              : "text-sub hover:text-ink",
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const TerminalSection: React.FC<{ tw: Tweaks; setTw: (p: Partial<Tweaks>) => void }> = ({
  tw,
  setTw,
}) => {
  const dark = tw.dark;
  return (
    <>
      <SectionHeader dark={dark} title="터미널" sub="터미널의 읽힘과 느낌을 조정합니다." />
      <Row dark={dark} label="글꼴 크기" hint="줄 높이에 비례해 영향을 줍니다.">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={11}
            max={20}
            step={1}
            value={tw.terminalFontPx}
            onChange={(e) => setTw({ terminalFontPx: +e.target.value })}
            className="w-[160px]"
            style={{ accentColor: "var(--accent)" }}
          />
          <span
            className={cls(
              "font-mono text-[12px] w-[36px] text-right",
              dark ? "text-dink" : "text-ink",
            )}
          >
            {tw.terminalFontPx}px
          </span>
        </div>
      </Row>
      <Row dark={dark} label="커서 스타일">
        <SegControl
          dark={dark}
          value={tw.cursorStyle}
          onChange={(v) => setTw({ cursorStyle: v as Tweaks["cursorStyle"] })}
          options={[
            { value: "block", label: "블록" },
            { value: "bar", label: "바" },
            { value: "underline", label: "밑줄" },
          ]}
        />
      </Row>
    </>
  );
};

const AppearanceSection: React.FC<{ tw: Tweaks; setTw: (p: Partial<Tweaks>) => void }> = ({
  tw,
  setTw,
}) => {
  const dark = tw.dark;
  return (
    <>
      <SectionHeader dark={dark} title="외관" sub="테마와 액센트 색상을 설정합니다." />
      <Row dark={dark} label="테마" hint="기본은 라이트입니다. 다크는 순수 블랙보다 따뜻한 톤이에요.">
        <SegControl
          dark={dark}
          value={tw.dark ? "dark" : "light"}
          onChange={(v) => setTw({ dark: v === "dark" })}
          options={[
            { value: "light", label: "라이트" },
            { value: "dark", label: "다크" },
          ]}
        />
      </Row>
      <Row dark={dark} label="액센트 색상" hint="버튼, 프롬프트, 링크, 커서에 적용됩니다.">
        <div className="flex items-center gap-2">
          {Object.entries(ACCENTS).map(([key, a]) => (
            <button
              key={key}
              onClick={() => setTw({ accent: key })}
              className={cls(
                "h-7 w-7 rounded-full transition-all",
                tw.accent === key ? "ring-2 ring-offset-2" : "",
              )}
              style={{
                background: dark ? a.dark : a.light,
                ["--tw-ring-color" as any]: dark ? a.dark : a.light,
                ["--tw-ring-offset-color" as any]: dark ? "#1f1f1d" : "#faf9f5",
              }}
              title={key}
            />
          ))}
        </div>
      </Row>
      <Row dark={dark} label="홈 헤드라인" hint="홈 화면의 세리프 헤드라인을 편집합니다.">
        <input
          value={tw.welcomeHeadline}
          onChange={(e) => setTw({ welcomeHeadline: e.target.value })}
          className={cls(
            "h-8 px-2.5 rounded-[7px] border text-[13px] w-[320px] outline-none",
            dark
              ? "bg-dmuted border-dline text-dink"
              : "bg-surface border-line text-ink",
          )}
        />
      </Row>
    </>
  );
};

const DEFAULT_DOTS = ["#c96442", "#9aae63", "#4b7bd1", "#8b4a73", "#6b9a4a", "#b08a4a", "#3d8d87"];

const ProfilesSection: React.FC<{ tw: Tweaks; setTw: (p: Partial<Tweaks>) => void }> = ({
  tw,
  setTw,
}) => {
  const dark = tw.dark;
  const profiles = tw.profiles;

  const updateProfile = (idx: number, patch: Partial<Profile>) => {
    const next = profiles.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    setTw({ profiles: next });
  };
  const removeProfile = (idx: number) => {
    if (profiles.length <= 1) return;
    const target = profiles[idx];
    const label = target?.name?.trim() || "이 프로필";
    const ok = window.confirm(
      `"${label}" 프로필을 삭제하시겠습니까?\n이 프로필로 열려 있는 탭은 유지되지만, 재등록 전까지 새로 열 수 없습니다.`,
    );
    if (!ok) return;
    setTw({ profiles: profiles.filter((_, i) => i !== idx) });
  };
  const addProfile = () => {
    const dot = DEFAULT_DOTS[profiles.length % DEFAULT_DOTS.length];
    const id = `custom-${Date.now().toString(36)}`;
    setTw({ profiles: [...profiles, { id, name: "새 프로필", cmd: "", dot }] });
  };

  return (
    <>
      <SectionHeader
        dark={dark}
        title="프로필"
        sub="자주 쓰는 CLI를 등록하세요. + 버튼으로 추가, ✕ 버튼으로 삭제할 수 있습니다."
      />
      <div
        className={cls(
          "rounded-[10px] border overflow-hidden",
          dark ? "bg-[#252523] border-dline" : "bg-surface border-line",
        )}
      >
        {profiles.map((p, i) => (
          <div
            key={p.id}
            className={cls(
              "flex items-center gap-3 px-4 h-14",
              i > 0 ? (dark ? "border-t border-dline" : "border-t border-line") : "",
            )}
          >
            <input
              type="color"
              value={p.dot}
              onChange={(e) => updateProfile(i, { dot: e.target.value })}
              className="h-6 w-6 rounded-full shrink-0 cursor-pointer border-0 p-0 bg-transparent"
              title="색 도트"
              style={{ appearance: "none" }}
            />
            <input
              value={p.name}
              onChange={(e) => updateProfile(i, { name: e.target.value })}
              placeholder="이름"
              className={cls(
                "h-8 px-2.5 rounded-[6px] border text-[13px] w-[180px] outline-none",
                dark
                  ? "bg-dmuted border-dline text-dink"
                  : "bg-surface border-line text-ink",
              )}
            />
            <input
              value={p.cmd}
              onChange={(e) => updateProfile(i, { cmd: e.target.value })}
              placeholder="실행 명령 (예: claude, python3)"
              className={cls(
                "flex-1 min-w-0 h-8 px-2.5 rounded-[6px] border font-mono text-[12px] outline-none",
                dark
                  ? "bg-dmuted border-dline text-dink"
                  : "bg-surface border-line text-ink",
              )}
            />
            <button
              type="button"
              onClick={() => removeProfile(i)}
              disabled={profiles.length <= 1}
              className={cls(
                "shrink-0 h-7 w-7 rounded-[6px] text-[13px] transition-colors",
                profiles.length <= 1
                  ? "opacity-30 cursor-not-allowed"
                  : dark
                    ? "text-dsub hover:bg-[#3d3d3b] hover:text-dink"
                    : "text-sub hover:bg-line hover:text-ink",
              )}
              title={profiles.length <= 1 ? "최소 1개 필요" : "삭제"}
            >
              ✕
            </button>
          </div>
        ))}
        <div className={cls("px-4 h-12 flex items-center", dark ? "border-t border-dline" : "border-t border-line")}>
          <button
            type="button"
            onClick={addProfile}
            className={cls(
              "h-8 px-3 rounded-[6px] text-[12.5px] font-medium transition-colors",
              dark ? "text-dsub hover:bg-dmuted hover:text-dink" : "text-sub hover:bg-muted hover:text-ink",
            )}
          >
            + 프로필 추가
          </button>
        </div>
      </div>
    </>
  );
};

const ShortcutsSection: React.FC<{ dark: boolean }> = ({ dark }) => {
  const shortcuts: Array<[string, string[]]> = [
    ["새 탭", [MOD_KEY, "T"]],
    ["탭 닫기", [MOD_KEY, "W"]],
    ["다음 / 이전 탭", [MOD_KEY, "Tab"]],
    ["이미지 붙여넣기", [MOD_KEY, "V"]],
    ["미리보기 토글", [MOD_KEY, "P"]],
    ["화면 지우기", [MOD_KEY, "K"]],
    ["명령 팔레트", [MOD_KEY, "Shift", "P"]],
  ];
  return (
    <>
      <SectionHeader
        dark={dark}
        title="단축키"
        sub="행을 클릭해 재할당할 수 있어요. 충돌은 강조 표시됩니다."
      />
      <div
        className={cls(
          "rounded-[10px] border overflow-hidden",
          dark ? "bg-[#252523] border-dline" : "bg-surface border-line",
        )}
      >
        {shortcuts.map(([label, keys], i) => (
          <div
            key={label}
            className={cls(
              "flex items-center px-4 h-12 cursor-pointer transition-colors",
              i > 0 ? (dark ? "border-t border-dline" : "border-t border-line") : "",
              dark ? "hover:bg-dmuted" : "hover:bg-muted",
            )}
          >
            <div
              className={cls(
                "flex-1 text-[13.5px]",
                dark ? "text-dink" : "text-ink",
              )}
            >
              {label}
            </div>
            <div className="flex items-center gap-1">
              {keys.map((k, j) => (
                <kbd
                  key={j}
                  className={cls(
                    "px-1.5 min-w-[22px] h-[22px] inline-flex items-center justify-center rounded-[5px] border font-mono text-[11px]",
                    dark
                      ? "bg-dmuted border-dline text-dink"
                      : "bg-muted border-line text-ink",
                  )}
                >
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

const PreviewSection: React.FC<{ dark: boolean }> = ({ dark }) => (
  <>
    <SectionHeader
      dark={dark}
      title="미리보기 패널"
      sub="Atelier가 언제 라이브 결과물을 보여줄지 설정합니다."
    />
    <Row
      dark={dark}
      label="결과물 자동 감지"
      hint="세션이 HTML, 마크다운, 이미지 파일을 쓰면 미리보기를 자동으로 엽니다."
    >
      <div className={cls("text-[12px]", dark ? "text-dsub" : "text-sub")}>
        (예정 — v0.2)
      </div>
    </Row>
  </>
);

/**
 * UpdatesSection — Tauri auto-update plugin 기반.
 * GitHub Release latest.json을 폴링해 새 버전이 있으면 changelog와 함께 표시.
 * 사용자 동의 시 다운로드 → ED25519 서명 검증 → 자동 재시작.
 */
const UpdatesSection: React.FC<{ dark: boolean }> = ({ dark }) => {
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string>("");
  const [available, setAvailable] = React.useState<{
    version: string;
    notes?: string;
    date?: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [installing, setInstalling] = React.useState(false);

  async function checkForUpdate() {
    setBusy(true);
    setError(null);
    setStatus("최신 버전 확인 중…");
    setAvailable(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setAvailable({ version: update.version, notes: update.body, date: update.date });
        setStatus(`v${update.version} 사용 가능`);
      } else {
        setStatus("최신 버전입니다.");
      }
    } catch (e) {
      setError(`확인 실패: ${String(e)}`);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function installAndRestart() {
    setInstalling(true);
    setError(null);
    setStatus("다운로드·설치 중…");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        setError("다시 확인하니 새 버전이 없습니다.");
        return;
      }
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            const pct = Math.round((downloaded / total) * 100);
            setStatus(`다운로드 ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`);
          }
        } else if (event.event === "Finished") {
          setStatus("설치 완료. 재시작 중…");
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setError(`설치 실패: ${String(e)}`);
      setStatus("");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <>
      <SectionHeader
        dark={dark}
        title="업데이트"
        sub="Atelier 새 버전을 확인하고 설치합니다. 모든 업데이트는 ED25519 서명으로 검증됩니다."
      />
      <Row
        dark={dark}
        label="현재 버전"
        hint="앱 번들 메타데이터에 박힌 버전 (tauri.conf.json)."
      >
        <div className={cls("text-[12px] font-mono", dark ? "text-dink" : "text-ink")}>
          v0.1.0
        </div>
      </Row>
      <Row
        dark={dark}
        label="업데이트 확인"
        hint="GitHub Release의 latest.json을 폴링합니다. 첫 확인 시 인터넷 연결이 필요합니다."
      >
        <button
          type="button"
          onClick={checkForUpdate}
          disabled={busy || installing}
          className={cls(
            "h-9 px-3 rounded-[6px] text-[12px] font-medium border whitespace-nowrap disabled:opacity-40",
            dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted",
          )}
          data-testid="settings-check-update"
        >
          {busy ? "확인 중…" : "지금 확인"}
        </button>
      </Row>
      {status && !error && (
        <div
          className={cls(
            "mt-4 p-3 rounded-[6px] border text-[12px]",
            dark ? "bg-dmuted border-dline text-dink" : "bg-surface border-line text-ink",
          )}
        >
          {status}
        </div>
      )}
      {error && (
        <div className="mt-4 p-3 rounded-[6px] border border-red-300/40 bg-red-50/10 text-[12px] text-red-500">
          {error}
        </div>
      )}
      {available && (
        <div
          className={cls(
            "mt-4 p-4 rounded-[8px] border",
            dark ? "bg-dmuted border-dline" : "bg-surface border-line",
          )}
          data-testid="settings-update-available"
          style={{ boxShadow: "0 0 0 1px #c96442" }}
        >
          <div className={cls("text-[14px] font-medium mb-1", dark ? "text-dink" : "text-ink")}>
            v{available.version} 사용 가능
          </div>
          {available.date && (
            <div className={cls("text-[10px] mb-3", dark ? "text-dsub" : "text-sub")}>
              {available.date}
            </div>
          )}
          {available.notes && (
            <pre
              className={cls(
                "text-[12px] leading-[1.6] whitespace-pre-wrap font-sans mb-4",
                dark ? "text-dink" : "text-ink",
              )}
            >
              {available.notes}
            </pre>
          )}
          <button
            type="button"
            onClick={installAndRestart}
            disabled={installing}
            className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white whitespace-nowrap disabled:opacity-40"
            style={{ background: "#c96442" }}
            data-testid="settings-install-update"
          >
            {installing ? "설치 중…" : "지금 설치 + 재시작"}
          </button>
        </div>
      )}
    </>
  );
};

export default Settings;
