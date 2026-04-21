import React, { useState } from "react";
import { ACCENTS, cls, PROFILES, Tweaks } from "../lib/tokens";
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
          {section === "profiles" && <ProfilesSection dark={dark} />}
          {section === "shortcuts" && <ShortcutsSection dark={dark} />}
          {section === "preview" && <PreviewSection dark={dark} />}
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

const ProfilesSection: React.FC<{ dark: boolean }> = ({ dark }) => (
  <>
    <SectionHeader
      dark={dark}
      title="프로필"
      sub="자주 쓰는 CLI를 등록하세요. 각각 고유 색 도트가 부여됩니다."
    />
    <div
      className={cls(
        "rounded-[10px] border overflow-hidden",
        dark ? "bg-[#252523] border-dline" : "bg-surface border-line",
      )}
    >
      {PROFILES.filter((p) => p.id !== "custom").map((p, i) => (
        <div
          key={p.id}
          className={cls(
            "flex items-center gap-3 px-4 h-14",
            i > 0 ? (dark ? "border-t border-dline" : "border-t border-line") : "",
          )}
        >
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ background: p.dot }}
          />
          <div className="flex-1 min-w-0">
            <div
              className={cls(
                "text-[13.5px] font-medium",
                dark ? "text-dink" : "text-ink",
              )}
            >
              {p.name}
            </div>
            <div
              className={cls(
                "font-mono text-[11px]",
                dark ? "text-dsub" : "text-sub",
              )}
            >
              {p.cmd}
            </div>
          </div>
        </div>
      ))}
    </div>
  </>
);

const ShortcutsSection: React.FC<{ dark: boolean }> = ({ dark }) => {
  const shortcuts: Array<[string, string[]]> = [
    ["새 탭", ["Ctrl", "T"]],
    ["탭 닫기", ["Ctrl", "W"]],
    ["다음 / 이전 탭", ["Ctrl", "Tab"]],
    ["이미지 붙여넣기", ["Ctrl", "V"]],
    ["미리보기 토글", ["Ctrl", "P"]],
    ["화면 지우기", ["Ctrl", "K"]],
    ["명령 팔레트", ["Ctrl", "Shift", "P"]],
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

export default Settings;
