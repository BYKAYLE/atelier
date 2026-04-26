import React, { useCallback, useEffect, useRef, useState } from "react";

// Atelier Design Wizard — lazy import. 디자인 탭 클릭 전엔 코드/리소스 미로드.
// 터미널 모드 무거움 회피 (PRD §5).
// DesignWizard는 DesignPage 안에서 lazy import. Main.tsx는 코드 모드 전용.
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { CanvasAddon } from "@xterm/addon-canvas";
import "@xterm/xterm/css/xterm.css";
import { cls, MOD_KEY, Tweaks } from "../lib/tokens";
import { I } from "./Icons";
import {
  clipboardSaveImage,
  isTauri,
  onPtyData,
  onPtyExit,
  ptyKill,
  ptyResize,
  ptySpawn,
  ptyWrite,
  readTextFile,
  sessionLogLoad,
  sessionLogClear,
} from "../lib/tauri";
import FileTree from "./FileTree";

interface Tab {
  id: string;
  profile: string;
  // 프로필 기본 이름. 사용자가 rename한 경우 customName 우선.
  name: string;
  customName?: string;
  // 재오픈 시 사용할 실행 명령 원본 (프로파일 cmd 스냅샷).
  cmd: string;
  dot: string;
  term: Terminal;
  fit: FitAddon;
  unlistenData?: () => void;
  unlistenExit?: () => void;
  // 탭별 전용 DOM 컨테이너 — 생성 시 1회만 term.open()에 부착하고 이후
  // 탭 전환은 display 토글로 처리해 버퍼/스크롤백을 영구 보존한다.
  // (이전 구현은 매 activeId 변경마다 host.innerHTML="" + term.open 재호출로
  // viewport가 리셋되며 "채팅 내역 사라짐" 증상 유발)
  hostEl: HTMLDivElement;
  // 영속 로그 id — 재시작/복원 시 같은 값 유지해 PTY 출력을 같은 파일에 누적.
  logId: string;
  pending?: Uint8Array[];
  state?: { ready: boolean };
  // 탭 닫을 때 호출할 리스너/타이머 해제 함수. initializeTabDom에서 할당.
  cleanup?: () => void;
  // 채팅방 느낌의 "마지막 활동 시각" — PTY data 수신 또는 사용자 입력마다 갱신.
  lastActiveAt: number;
  // 채팅 말풍선 카드에 보여줄 최근 출력 요약 (ANSI 제거 + 최근 ~200자).
  lastSnippet?: string;
  // 사용자가 이 세션에서 제일 처음 확정 입력한 메시지 (Enter 기준). 카드 제목용.
  firstPrompt?: string;
}

interface Props {
  tw: Tweaks;
}

// ANSI escape / 제어 문자 제거 — 채팅 말풍선에 평문 텍스트만 남기기 위함.
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "") // OSC 시퀀스
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")       // CSI 시퀀스
    .replace(/\x1b[>=]/g, "")
    .replace(/\x1b[()][A-B0-2]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, " ")    // 탭(\t, \x09), 개행(\n, \x0a) 외 제어문자 → 공백
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 채팅방 스타일 상대 시간 — "방금", "3분 전", "어제", "2일 전".
function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 30) return "방금";
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return "어제";
  if (d < 7) return `${d}일 전`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// PTY 출력에서 Preview에 자동으로 띄울 URL을 골라낸다.
// 라운드 #5 보안 감사 대응: **localhost/127.0.0.1/0.0.0.0/[::1] dev server만** 자동 로드.
// 외부 URL은 피싱/리다이렉트 체인 위험이 있어 사용자 명시적 선택(수동 URL 입력)에 맡긴다.
const URL_SCAN_RE = /(https?:\/\/[A-Za-z0-9.\-_:/?#\[\]@!$&'()*+,;=~%]+)/g;
const LOCAL_HOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):/i;
function detectServableUrl(text: string): string | null {
  const trimEnd = (u: string) => u.replace(/[.,;:!?)\]}'"`]+$/g, "");
  const hits = text.match(URL_SCAN_RE) ?? [];
  if (!hits.length) return null;
  const local = hits
    .map(trimEnd)
    .filter((u) => u.length > 10 && LOCAL_HOST_RE.test(u));
  if (!local.length) return null;
  return local[local.length - 1];
}

// Ring buffer — IME 진단 로그. pty-recv/pty-write-err는 노이즈라 차단.
const IME_LOG_MAX = 200;
function imeLogPush(entry: unknown) {
  const log = (window as unknown as { __imeLog?: unknown[] }).__imeLog;
  if (!log) return;
  const k = (entry as { kind?: string })?.kind || "";
  if (k === "pty-recv" || k === "pty-write-err") return;
  if (log.length >= IME_LOG_MAX) log.shift();
  log.push(entry);
}
// 진단 계측 전체 게이트: dev 빌드이거나 devtools에서 window.__diagOn = true 설정 시만 ON.
// 프로덕션 기본 OFF → document 리스너/interval 부하 제거.
// 진단 게이트: dev 빌드는 항상 ON, production은 devtools에서 `window.__diagOn = true` 후 새로고침 시만 ON.
// 진단 데이터는 ~/Library/Caches/com.atelier.app/debug.json (0600 권한)에 저장.
function diagOn() {
  if (import.meta.env.DEV) return true;
  return !!(window as unknown as { __diagOn?: boolean }).__diagOn;
}

const Main: React.FC<Props> = ({ tw }) => {
  const dark = tw.dark;
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  // Preview 기본 표시. 필요 시 Cmd+P로 토글해 터미널 전체 폭 사용 가능.
  const [showPreview, setShowPreview] = useState(true);
  const [previewWidth, setPreviewWidth] = useState(300);
  // 코드 모드 layout — single (1터미널 + 우측 프리뷰) vs grid (여러 터미널 정렬 + 프리뷰 없음)
  const CODE_LAYOUT_KEY = "atelier.codeLayout";
  type CodeLayout = "single" | "grid";
  const [codeLayout, setCodeLayout] = useState<CodeLayout>(() => {
    try {
      const v = localStorage.getItem(CODE_LAYOUT_KEY) as CodeLayout | null;
      return v === "single" || v === "grid" ? v : "single";
    } catch { return "single"; }
  });
  useEffect(() => {
    try { localStorage.setItem(CODE_LAYOUT_KEY, codeLayout); } catch {}
  }, [codeLayout]);
  const [isResizingPreview, setIsResizingPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // iframe 강제 재로드용 — 같은 URL이어도 ++하면 key 변경으로 iframe 재생성.
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  // Preview 해상도 — 반응형 확인용. localStorage persist.
  type PreviewViewport = "mobile" | "tablet" | "desktop";
  const PREVIEW_VP_KEY = "atelier.previewVP";
  const [previewVP, setPreviewVP] = useState<PreviewViewport>(() => {
    try {
      const v = localStorage.getItem(PREVIEW_VP_KEY) as PreviewViewport | null;
      return v === "mobile" || v === "tablet" || v === "desktop" ? v : "desktop";
    } catch { return "desktop"; }
  });
  useEffect(() => {
    try { localStorage.setItem(PREVIEW_VP_KEY, previewVP); } catch {}
  }, [previewVP]);
  // viewport 표준:
  //   mobile  390 × 844  — Chrome DevTools 표준 (iPhone 12 Pro / 13 / 14)
  //   tablet  834 × 1194 — iPad Pro 11"
  //   desktop 100%       — iframe full
  const PREVIEW_VP_SIZES: Record<PreviewViewport, { w: number | "100%"; h: number | "100%" }> = {
    mobile: { w: 390, h: 844 },
    tablet: { w: 834, h: 1194 },
    desktop: { w: "100%", h: "100%" },
  };
  // 수동 URL 입력 — 자동 감지 실패 시 사용자가 직접 붙여넣을 수 있게.
  const [previewInput, setPreviewInput] = useState("");
  // 좌측 패널 폭 (px). 세션/파일 탭이 공유하는 단일 컬럼. 드래그로 조정.
  const [leftPanelWidth, setLeftPanelWidth] = useState(260);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  // 좌측 패널 현재 탭. 엑셀 시트처럼 상단 탭으로 스위치.
  const [leftTab, setLeftTab] = useState<"sessions" | "files">("sessions");
  // 디자인/홈/설정 모드는 App.tsx의 TopChrome screen이 처리. Main은 코드 모드 전용.
  // 사이드바 숨기기 — Cmd+B 토글 (VSCode 표준). localStorage persist.
  const LEFT_HIDDEN_KEY = "atelier.leftHidden";
  const [leftHidden, setLeftHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(LEFT_HIDDEN_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(LEFT_HIDDEN_KEY, leftHidden ? "1" : "0"); } catch {}
  }, [leftHidden]);
  // Cmd+B / Ctrl+B 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setLeftHidden((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // 파일 클릭 시 Preview에 텍스트 표시용.
  const [fileViewer, setFileViewer] = useState<{ path: string; name: string; content: string } | null>(null);
  // 탭 이름 인라인 편집용 — 더블클릭 시 이 id 설정 → input 렌더.
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  // spawn 실패 시 사용자에게 보여주는 토스트. 4초 뒤 자동 소거.
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((curr) => (curr === msg ? null : curr)), 4000);
  }, []);
  // 닫힌 세션 리스트 — localStorage persist. 사이드바 "최근 세션"에 표시.
  interface ClosedSession {
    id: string;
    name: string;
    profile: string;
    cmd: string;
    dot: string;
    closedAt: number;
    firstPrompt?: string;
    lastSnippet?: string;
    // 이전 PTY 세션의 로그 파일 id — 복원 시 이 id로 session_log_load 호출해 term.write로 재생.
    logSourceId?: string;
  }
  const CLOSED_KEY = "atelier.closedSessions";
  const [closedSessions, setClosedSessions] = useState<ClosedSession[]>(() => {
    try {
      const raw = localStorage.getItem(CLOSED_KEY);
      return raw ? (JSON.parse(raw) as ClosedSession[]) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(CLOSED_KEY, JSON.stringify(closedSessions)); } catch {}
  }, [closedSessions]);

  // 열린 탭 메타 persist — 앱 종료 후 재실행 시 같은 탭 + 과거 로그 복원.
  // Tab 객체는 term/hostEl/listener 포함이라 직렬화 불가 → serializable 필드만 추출 저장.
  // 복원은 mount 시 한 번만 (아래 useEffect).
  interface OpenTabMeta {
    logId: string;          // 재시작 후 PTY 새로 띄울 때 같은 로그파일 재사용.
    profile: string;
    name: string;
    customName?: string;
    cmd: string;
    dot: string;
    firstPrompt?: string;
    lastSnippet?: string;
    lastActiveAt: number;
  }
  const OPEN_TABS_KEY = "atelier.openTabs";
  const openTabsInitRef = useRef(false);
  useEffect(() => {
    // 초기 mount(탭 0개) 상태로는 덮어쓰지 않는다 — 복원 effect가 실행되기 전
    // 빈 배열을 저장해 "복원 자체를 지우는" 경쟁조건 방어.
    if (!openTabsInitRef.current) return;
    try {
      const meta: OpenTabMeta[] = tabs.map((t) => ({
        logId: t.logId,
        profile: t.profile,
        name: t.name,
        customName: t.customName,
        cmd: t.cmd,
        dot: t.dot,
        firstPrompt: t.firstPrompt,
        lastSnippet: t.lastSnippet,
        lastActiveAt: t.lastActiveAt,
      }));
      localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(meta));
    } catch {}
  }, [tabs]);

  const termContainerRef = useRef<HTMLDivElement | null>(null);

  const applyPreviewInput = () => {
    const u = previewInput.trim();
    if (!u) return;
    // 스킴 없으면 https:// 추가. localhost/IP는 http://.
    let final = u;
    if (!/^https?:\/\//i.test(u)) {
      const local = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|\d+\.\d+)/i.test(u);
      final = (local ? "http://" : "https://") + u;
    }
    setPreviewUrl(final);
    setShowPreview(true);
    setPreviewInput("");
  };

  // 좌측 패널/Preview 리사이즈 — Pointer Capture 기반으로 일원화.
  // 이전 구현(window.mousemove + mouseup)은 마우스가 Atelier 창 밖으로 나가면
  // mouseup을 놓쳐 state가 잠긴 채 드래그가 계속되는 버그가 있었다.
  // pointer capture는 캡처된 element에 이벤트를 고정해 창 밖에서도 수신 + release 보장.
  type DragKind = "left" | "preview";
  const dragRef = useRef<{ kind: DragKind; startX: number; startW: number } | null>(null);
  const beginDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    kind: DragKind,
    startW: number,
  ) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { kind, startX: e.clientX, startW };
    if (kind === "left") setIsResizingLeft(true);
    else setIsResizingPreview(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "left") {
      const delta = e.clientX - d.startX;
      const cap = Math.floor(window.innerWidth * 0.4);
      setLeftPanelWidth(Math.max(200, Math.min(cap, d.startW + delta)));
    } else {
      const delta = d.startX - e.clientX;
      const cap = Math.floor(window.innerWidth * 0.6);
      setPreviewWidth(Math.max(200, Math.min(cap, d.startW + delta)));
    }
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    dragRef.current = null;
    setIsResizingLeft(false);
    setIsResizingPreview(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  // 파일 탐색기에서 파일 클릭 → 읽어서 Preview에 텍스트 뷰어로 띄움.
  async function openFileInPreview(path: string, name: string) {
    try {
      const content = await readTextFile(path);
      setFileViewer({ path, name, content });
      setShowPreview(true);
    } catch (err) {
      console.warn("openFile failed", err);
      // 읽기 실패 (바이너리 or 권한) — Preview에 간단 메시지.
      setFileViewer({ path, name, content: `(이 파일은 미리보기 불가: ${String(err)})` });
      setShowPreview(true);
    }
  }

  // Preview 드래그 리사이즈는 beginDrag/onDragMove/endDrag에서 일원화 처리 (pointer capture 기반).

  // Cmd+P 미리보기 토글 + 토글 시 fit 재계산
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setShowPreview((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // showPreview / previewWidth / leftPanelWidth 변경 시 활성 탭 fit 재호출.
  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeId);
    if (!tab) return;
    window.setTimeout(() => {
      try { tab.fit.fit(); } catch {}
      if (isTauri() && tab.term.cols > 0) {
        ptyResize(tab.id, tab.term.cols, tab.term.rows).catch(() => {});
      }
    }, 50);
  }, [showPreview, previewWidth, leftPanelWidth, activeId, tabs]);

  // document-level capture 로거 — IME 이벤트가 어느 element에 오는지 실측.
  // 진단 전용. 프로덕션 기본 OFF (diagOn() === false면 리스너 미등록 → 부하 0).
  // 필요 시 devtools Console에서 window.__diagOn = true 후 새로고침.
  useEffect(() => {
    (window as unknown as { __imeLog?: unknown[] }).__imeLog = [];
    if (!diagOn()) return;
    const tagOf = (n: EventTarget | null) => {
      const el = n as HTMLElement | null;
      if (!el || !el.tagName) return String(n);
      return `${el.tagName}.${(el.className || "").toString().substring(0, 30)}`;
    };
    const onDocInput = (ev: Event) => {
      const ie = ev as InputEvent;
      const path = (ev.composedPath?.() ?? [])
        .slice(0, 5)
        .map((n) => tagOf(n as EventTarget));
      imeLogPush({
        kind: `doc:${ev.type}`,
        inputType: ie.inputType,
        data: ie.data,
        isComposing: ie.isComposing,
        target: tagOf(ev.target),
        path,
        at: Date.now(),
      });
    };
    const onDocKey = (ev: Event) => {
      const ke = ev as KeyboardEvent;
      imeLogPush({
        kind: "doc:keydown",
        key: ke.key,
        code: ke.code,
        keyCode: ke.keyCode,
        isComposing: ke.isComposing,
        target: tagOf(ev.target),
        at: Date.now(),
      });
    };
    const types = [
      "beforeinput",
      "input",
      "textInput",
      "compositionstart",
      "compositionupdate",
      "compositionend",
    ];
    types.forEach((t) => document.addEventListener(t, onDocInput, true));
    document.addEventListener("keydown", onDocKey, true);
    return () => {
      types.forEach((t) => document.removeEventListener(t, onDocInput, true));
      document.removeEventListener("keydown", onDocKey, true);
    };
  }, []);

  // 탭 하나 추가
  async function spawnTab(
    profileId: string,
    opts?: { customName?: string; cmdOverride?: string; replayLogId?: string },
  ) {
    const tauri = isTauri();
    const pending: Uint8Array[] = [];
    // listener closure가 참조할 가변 state.
    const state = { ready: false };
    // Vite dev에서도 xterm을 mount해서 IME 동작을 probe로 검증할 수 있게 허용.
    // PTY는 mock, 이벤트 흐름은 window.__imeLog에 기록 (dev 빌드에서만 활성, 프로덕션은 분기 제거됨).
    const devBridge = !tauri && import.meta.env.DEV;
    if (!tauri && !devBridge) {
      console.warn("Tauri 환경 아님 — 프로토타입 모드");
      return;
    }
    const p = tw.profiles.find((x) => x.id === profileId) || tw.profiles[0];
    if (!p) {
      console.warn("no profile available");
      return;
    }
    const effectiveCmd = opts?.cmdOverride?.trim() || p.cmd.trim();
    if (!effectiveCmd) {
      console.warn("profile has empty cmd", p);
      return;
    }
    const term = new Terminal({
      allowProposedApi: true,  // unicode11 addon (xterm.unicode.activeVersion="11") 사용 필수
      // 영문 monospace는 Menlo, 한글은 "Nanum Gothic Coding"으로 fallback.
      // Menlo는 한글 글리프가 없어 시스템 한글 폰트(AppleGothic 등)로 fallback되는데
      // 이 폰트는 한글을 1 cell 폭에 그리는 반면 xterm은 한글을 2 cell로 계산 →
      // 한글 글자 사이에 빈 cell 생기는 "띄어 써지는" 증상.
      // Nanum Gothic Coding은 한글 글리프가 영문 2 cell 폭에 정확히 맞는 monospace.
      fontFamily: 'Menlo, "Nanum Gothic Coding", "SF Mono", "JetBrains Mono", monospace',
      fontSize: tw.terminalFontPx,
      cursorStyle: tw.cursorStyle,
      cursorBlink: false, // 가설 A: cursor blink render tick이 IME 방해? 일단 끄고 측정.
      // xterm 테마는 UI light/dark와 무관하게 항상 어두운 배경 기반.
      // 이유: Claude Code / Hermes Agent 등 TUI가 어두운 터미널 전제로 밝은 ANSI 색상
      // (yellow/orange/cyan)을 쓰는데, 라이트 배경에선 ASCII art/배너가 묻혀 읽기 어려움.
      // UI는 라이트/다크 따라가되 터미널 내부는 Warp/iTerm 스타일로 어두운 톤 고정.
      theme: {
        background: dark ? "#1a1a18" : "#1f1f1d",
        foreground: "#faf9f5",
        cursor: "#da7756",
        selectionBackground: "#3d3d3b",
        black: "#1f1f1d",
        red: "#da7756",
        green: "#9aae63",
        yellow: "#d4a94e",
        blue: "#7d8fe0",
        magenta: "#b473a0",
        cyan: "#6bb5b0",
        white: "#e8e5db",
        brightBlack: "#4a4a48",
        brightRed: "#e8957a",
        brightGreen: "#b4c37a",
        brightYellow: "#e8bd6a",
        brightBlue: "#9da8e8",
        brightMagenta: "#c890b5",
        brightCyan: "#8ec8c3",
        brightWhite: "#faf9f5",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Unicode v11 폭 처리 — 한글/이모지/CJK를 정확히 2cell로 계산.
    // 미적용 시 xterm 기본 v6는 일부 한글 음절을 1cell 처리해 폰트와 어긋날 수 있음.
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    // 라운드 #18: Canvas renderer — DOM renderer가 claude alternate buffer redraw 깨뜨림.
    // canvas는 viewport 전체를 한 번에 그려 ANSI cursor 이동/erase sequence 정확 처리.
    try { term.loadAddon(new CanvasAddon()); } catch (e) { console.warn("canvas addon", e); }
    (term as unknown as { unicode: { activeVersion: string } }).unicode.activeVersion = "11";
    // URL 클릭 시 기본 브라우저로 나가지 않고 Atelier Preview 패널의 iframe에 로드.
    // Claude Code가 artifact/서비스 URL을 프롬프트에 출력하고 "Preview에서 열어봐"
    // 맥락으로 쓸 수 있도록.
    term.loadAddon(new WebLinksAddon((_ev, uri) => {
      setPreviewUrl(uri);
      setShowPreview(true);
    }));

    // 일단 크기를 기본값으로 — mount 후 fit
    const cols = 80;
    const rows = 24;

    let id: string;
    let logId: string;
    let unlistenData: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    if (tauri) {
      // Rust pty.rs의 profile_command는 매칭 키를 "cmd"(실행명)으로 쓴다.
      // effectiveCmd는 profile 기본 cmd 또는 "이어가기" 등 override된 전체 명령.
      // replayLogId가 주어지면 같은 로그 파일에 이어서 append (재시작 시 누적).
      const spawn = await ptySpawn(effectiveCmd, cols, rows, opts?.replayLogId);
      id = spawn.id;
      logId = spawn.log_id;
      // Trust prompt 자동응답은 Rust reader thread에서 처리됨 (pty.rs).
      // JS listen 타이밍이 PTY 첫 청크를 놓쳐 자동응답 실패한 경험 때문.
      // URL 자동 감지용 누적 버퍼 (마지막 8KB만 유지).
      // dev server URL(Vite/Next/Rails/Django 등)이 stdout에 찍히는 순간 감지해
      // Preview에 바로 로드. iframe 내부에서 dev server의 HMR이 실시간 업데이트 수행.
      const urlAccum = { text: "" };
      const URL_LIMIT = 8192;
      // 채팅 말풍선 스니펫용 ANSI 제거 텍스트 누적 (최근 4KB).
      const snippetAccum = { text: "" };
      const SNIP_LIMIT = 4096;
      // PTY 수신 시 lastActiveAt / lastSnippet 갱신 — 너무 잦으면 setTabs 폭주하니 1초 스로틀.
      let lastActiveBump = 0;
      unlistenData = await onPtyData(id, (bytes) => {
        imeLogPush({ kind: "pty-recv", len: bytes.length, at: Date.now() });
        const now = Date.now();
        // snippetAccum는 ANSI 제거 실패 여부와 무관하게 계속 누적(1초 스로틀에서 최종 사용).
        try {
          const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
          snippetAccum.text = (snippetAccum.text + decoded).slice(-SNIP_LIMIT);
        } catch {}
        if (now - lastActiveBump > 1000) {
          lastActiveBump = now;
          // 마지막 의미 있는 줄들(최근 3줄)을 스니펫으로 추출.
          const plain = stripAnsi(snippetAccum.text);
          const lines = plain.split("\n").filter((l) => l.trim()).slice(-3);
          const snippet = lines.join("\n").slice(-240);
          setTabs((prev) =>
            prev.map((t) => (t.id === id ? { ...t, lastActiveAt: now, lastSnippet: snippet } : t)),
          );
        }
        if (state.ready) {
          try {
            term.write(bytes);  // xterm 6: 자동 redraw, refresh hack 불필요
          } catch (err) {
            imeLogPush({ kind: "pty-write-err", msg: String(err), at: Date.now() });
          }
        } else {
          pending.push(bytes);
        }

        // URL 자동 감지 — ANSI escape/제어 문자 제외.
        try {
          const chunk = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
          urlAccum.text = (urlAccum.text + chunk).slice(-URL_LIMIT);
          const url = detectServableUrl(urlAccum.text);
          if (url) {
            setPreviewUrl((prev) => {
              if (prev === url) return prev;
              imeLogPush({ kind: "preview-autoset", url, at: Date.now() });
              return url;
            });
            setShowPreview(true);
          }
        } catch (err) {
          imeLogPush({ kind: "preview-detect-err", msg: String(err), at: Date.now() });
        }
      });
      unlistenExit = await onPtyExit(id, (code) => {
        term.writeln(`\r\n\x1b[90m[exit ${code ?? "?"}]\x1b[0m`);
      });
    } else {
      // dev-only: PTY mock. probe/Playwright가 IME 흐름을 관찰할 수 있도록 window.__imeLog에 기록.
      // Math.random — StrictMode/restore mount이 같은 ms에 두 번 호출 시 React key 중복 방지.
      id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      logId = id;
      (window as unknown as { __imeLog?: unknown[] }).__imeLog = [];
      term.write("\x1b[32m[atelier dev mode · PTY mock · IME 검증용]\x1b[0m\r\n$ ");
    }

    // 가설 B: composition 중 키 이벤트가 xterm에서 처리되면 textarea 상태 깨짐 가능 → 차단.
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      if (ev.type === "keydown" && (ev.isComposing || ev.keyCode === 229)) {
        return false;
      }
      return true;
    });

    // 가설 E (language hint): helper-textarea에 lang="ko" inputmode="text" — IME target 명시.
    // 지연 부착: term.open 후 DOM에 helper-textarea 생성됨.
    // 아래 mount effect에서 이미 처리되지만 spawnTab 시점에 한 번 더 시도.

    // xterm 기본 경로에 맡김 — probe 결과 composition → onData 합쳐서 한 번에 방출 확인됨.
    // 디버그 관찰용 __imeLog만 유지 (dev 전용).
    // 사용자 첫 확정 입력 감지용 buffer. ANSI/CSI/OSC 시퀀스는 state machine으로
    // 스킵해 실제 평문 키만 누적 → Enter 시 1회 firstPrompt 저장.
    // xterm은 focus in/out, device attribute query 등 시스템 ANSI도 onData에 쏘기 때문에
    // 단순 printable 필터만으로는 "[I[?2026;0$y..." 같은 파라미터가 섞여 들어온다.
    let inputBuf = "";
    let firstPromptSaved = false;
    let ansiMode: "normal" | "esc" | "csi" | "osc" = "normal";
    term.onData((d) => {
      if (diagOn()) imeLogPush({ kind: "onData", d, at: Date.now() });
      // xterm CompositionHelper가 native compositionstart/end로 합성 음절만 한 번에 emit.
      // 추가 차단 시 native IME path 깨져 자모 분리 회귀 — xterm 기본 경로 신뢰.
      if (tauri) {
        ptyWrite(id, d).catch(console.error);
      } else {
        term.write(d);
      }
      if (firstPromptSaved) return;
      for (const ch of d) {
        const code = ch.charCodeAt(0);
        // ANSI state machine — ESC(0x1b) 만나면 이후 시퀀스 전부 스킵.
        if (ansiMode === "esc") {
          ansiMode = ch === "[" ? "csi" : ch === "]" ? "osc" : "normal";
          continue;
        }
        if (ansiMode === "csi") {
          // CSI: 파라미터/intermediate(0x20-0x3F) + final byte(0x40-0x7E)
          if (code >= 0x40 && code <= 0x7e) ansiMode = "normal";
          continue;
        }
        if (ansiMode === "osc") {
          // OSC 종료: BEL(0x07) 또는 ESC\ (ST). 단순화해 ESC 만나면 normal로.
          if (code === 0x07 || code === 0x1b) ansiMode = "normal";
          continue;
        }
        // normal 모드
        if (code === 0x1b) { ansiMode = "esc"; continue; }
        if (ch === "\r" || ch === "\n") {
          const trimmed = inputBuf.trim();
          if (trimmed.length >= 3) {
            firstPromptSaved = true;
            const preview = trimmed.slice(0, 60);
            setTabs((prev) =>
              prev.map((t) => (t.id === id ? { ...t, firstPrompt: preview } : t)),
            );
          }
          inputBuf = "";
          continue;
        }
        if (code === 0x7f || code === 0x08) { inputBuf = inputBuf.slice(0, -1); continue; }
        if (code >= 0x20 && code !== 0x7f) {
          inputBuf += ch;
          if (inputBuf.length > 400) inputBuf = inputBuf.slice(-400);
        }
        // 그 외 제어문자는 무시.
      }
    });
    term.onResize(({ cols, rows }) => {
      if (tauri) ptyResize(id, cols, rows).catch(console.error);
    });

    // 탭 전용 DOM 컨테이너 — 생성 시 1회만 term.open, 이후 display 토글.
    const hostEl = document.createElement("div");
    hostEl.className = "h-full w-full";
    hostEl.style.display = "none";
    // 그리드 모드 클릭 시 이 탭 활성화 + xterm focus. single 모드에서도 무해 (이미 활성).
    hostEl.addEventListener("mousedown", () => {
      setActiveId(id);
      // 활성 전환 직후 xterm 내부 helper-textarea에 focus가 가도록 다음 frame에 호출.
      window.setTimeout(() => {
        try { term.focus(); } catch {}
      }, 0);
    });
    const tab: Tab = {
      id,
      profile: p.id,
      name: p.name,
      customName: opts?.customName,
      cmd: effectiveCmd,
      dot: p.dot,
      term,
      fit,
      unlistenData,
      unlistenExit,
      hostEl,
      logId,
      pending,
      state,
      lastActiveAt: Date.now(),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveId(id);
    setShowPicker(false);

    // 이전 세션 로그 재생 — replayLogId가 있으면 Rust에서 base64 로그 읽어 pending 앞에 주입.
    // term.open 이후 pending flush 단계에서 자동으로 term.write로 재생 → 이전 대화가 그대로 보임.
    // (실제 PTY는 새 세션이므로 claude의 대화 맥락은 --continue 옵션이 별도 처리.)
    if (tauri && opts?.replayLogId) {
      void (async () => {
        try {
          const b64 = await sessionLogLoad(opts.replayLogId!);
          if (!b64) return;
          const bin = atob(b64);
          const n = bin.length;
          if (n === 0) return;
          // 한 번에 큰 청크로 넣지 않고 chunk 쪼개 term.write 부하 분산.
          // chunk 순서 보존이 핵심 — ANSI escape sequence는 byte 순서대로 읽혀야 한다.
          // 이전 코드는 매 iteration unshift로 chunk 역순 재생 → ESC[?1;2c 같은 응답이
          // raw 텍스트로 깨져 화면에 노출되는 회귀 발생.
          const CHUNK = 16384;
          const chunks: Uint8Array[] = [];
          for (let i = 0; i < n; i += CHUNK) {
            const sub = new Uint8Array(Math.min(CHUNK, n - i));
            for (let j = 0; j < sub.length; j++) sub[j] = bin.charCodeAt(i + j);
            chunks.push(sub);
          }
          // 세션 구분자 — 새 탭 신규 출력과 시각적으로 분리.
          const marker = new TextEncoder().encode(
            `\r\n\x1b[90m── 이전 대화 복원 완료 ──\x1b[0m\r\n`,
          );
          // 모든 chunk를 정순으로 pending 앞에 한 번에 삽입 (이미 큐에 있던 새 PTY
          // 출력보다 먼저 재생되도록). marker는 모든 복원 chunk 뒤에 위치.
          pending.unshift(...chunks, marker);
        } catch (err) {
          console.warn("replay log failed", err);
        }
      })();
    }
  }

  // 윈도우 focus 시 활성 탭 helper-textarea 자동 focus.
  // production Tauri WKWebView는 OS 활성화 후에도 webview 내부 element focus가
  // 자동으로 잡히지 않아 외부 키 주입(자동 IME 검증)이 PTY에 도달하지 않는 문제 우회.
  useEffect(() => {
    const onWinFocus = () => {
      const tab = tabs.find((t) => t.id === activeId);
      if (tab) {
        try { tab.term.focus(); } catch {}
      }
    };
    window.addEventListener("focus", onWinFocus);
    return () => window.removeEventListener("focus", onWinFocus);
  }, [activeId, tabs]);

  // 첫 mount: localStorage에 이전에 열려있던 탭 메타가 있으면 각각 재개 spawn (replayLogId로
  // 과거 로그 재생 + 같은 파일에 계속 append). 없으면 claude 퍼스트파티 기본 탭 1개.
  // 복원 effect가 먼저 실행되고 난 뒤에야 persist useEffect가 동작하도록 openTabsInitRef 사용.
  // StrictMode + 비동기 await 조합으로 effect가 cleanup 되기 전 두 번째 invoke 가능. ref로 한 번만.
  const mountInitRef = useRef(false);
  useEffect(() => {
    if (!isTauri() && !import.meta.env.DEV) return;
    if (mountInitRef.current) return;
    mountInitRef.current = true;
    let cancelled = false;
    (async () => {
      let restored: OpenTabMeta[] = [];
      try {
        const raw = localStorage.getItem(OPEN_TABS_KEY);
        if (raw) restored = JSON.parse(raw) as OpenTabMeta[];
      } catch {}
      if (!cancelled && Array.isArray(restored) && restored.length > 0) {
        // 같은 프로파일이라도 순서 유지. sequential spawn — 병렬 시 PTY/xterm init race 우려.
        for (const meta of restored) {
          if (cancelled) break;
          try {
            await spawnTab(meta.profile, {
              customName: meta.customName,
              cmdOverride: meta.cmd,
              replayLogId: meta.logId,
            });
          } catch (err) {
            console.warn("restore tab failed", meta, err);
          }
        }
      } else if (!cancelled && tabs.length === 0) {
        await spawnTab("claude").catch(console.error);
      }
      if (!cancelled) openTabsInitRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 탭 DOM은 한 번만 parent에 append + term.open. 이후 탭 전환은 display 토글로만 처리.
  // host.innerHTML="" + term.open 재호출 구조였던 이전 구현은 viewport 리셋 +
  // 스크롤백 소실("채팅 내역 사라짐")을 유발했다.
  useEffect(() => {
    const parent = termContainerRef.current;
    if (!parent) return;
    // 새 탭 감지 → hostEl을 parent에 append + term.open 1회만 + 초기 fit/리스너 부착.
    for (const tab of tabs) {
      if (parent.contains(tab.hostEl)) continue;
      parent.appendChild(tab.hostEl);
      initializeTabDom(tab);
    }
    // 닫힌 탭 DOM 제거.
    for (const node of Array.from(parent.children)) {
      if (!tabs.some((t) => t.hostEl === node)) parent.removeChild(node);
    }
    // layout=single: 활성 탭만 표시, 나머지 숨김 (기존 동작).
    // layout=grid: 모든 탭 동시 표시. parent에 grid layout, 각 hostEl은 cell 채움.
    if (codeLayout === "grid" && tabs.length > 0) {
      // parent CSS grid 설정 (동적). N개에 따라 자동 분할.
      const n = tabs.length;
      const cols = n <= 1 ? 1 : n === 2 ? 2 : n <= 4 ? 2 : 3;
      const rows = Math.ceil(n / cols);
      parent.style.display = "grid";
      parent.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      parent.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
      parent.style.gap = "6px";
      parent.style.background = dark ? "#0e0e0c" : "#d8d6cf";  // gap 색 = 경계선 효과
      const borderColor = dark ? "#3a3a37" : "#c8c5bd";
      const activeColor = dark ? "#5a8ae0" : "#4b5fbd";
      for (const tab of tabs) {
        tab.hostEl.style.display = "block";
        tab.hostEl.style.minWidth = "0";
        tab.hostEl.style.minHeight = "0";
        // 모든 cell에 명확한 경계선 + 활성 탭은 강조 색상으로
        tab.hostEl.style.border = tab.id === activeId
          ? `2px solid ${activeColor}`
          : `1px solid ${borderColor}`;
        tab.hostEl.style.borderRadius = "6px";
        tab.hostEl.style.boxSizing = "border-box";
        tab.hostEl.style.overflow = "hidden";
      }
    } else {
      // single layout — 기존 동작
      parent.style.display = "block";
      parent.style.gridTemplateColumns = "";
      parent.style.gridTemplateRows = "";
      parent.style.gap = "";
      parent.style.background = "";
      for (const tab of tabs) {
        tab.hostEl.style.display = tab.id === activeId ? "block" : "none";
        tab.hostEl.style.border = "";
        tab.hostEl.style.borderRadius = "";
        tab.hostEl.style.overflow = "";
        tab.hostEl.style.boxShadow = "";
      }
    }
    // 모든 탭 fit 재측정 (grid는 cell 크기 변동, single은 활성만)
    const targets = codeLayout === "grid" ? tabs : tabs.filter((t) => t.id === activeId);
    if (targets.length > 0) {
      window.setTimeout(() => {
        for (const t of targets) {
          try { t.fit.fit(); } catch {}
          if (isTauri() && t.term.cols > 0) {
            ptyResize(t.id, t.term.cols, t.term.rows).catch(() => {});
          }
        }
        const active = tabs.find((t) => t.id === activeId);
        if (active) try { active.term.focus(); } catch {}
      }, 30);
    }
  }, [activeId, tabs, codeLayout, dark]);

  // 그리드 모드 — 멈춰 있는 터미널(idle: 마지막 PTY 출력 후 N초 무활동) 노란 outline.
  // PTY 활동마다 lastActiveAt가 1초 스로틀로 갱신되니, interval 1초로 비교만 하면 됨.
  // 선택된 탭(파란)이 우선 — idle보다 active 색이 위.
  useEffect(() => {
    if (codeLayout !== "grid" || tabs.length === 0) return;
    const IDLE_THRESHOLD_MS = 5000; // 5초 무활동이면 멈춤으로 표시
    const activeColor = dark ? "#5a8ae0" : "#4b5fbd";
    const idleColor = dark ? "#d4a155" : "#c97e1e"; // 따뜻한 amber
    const borderColor = dark ? "#3a3a37" : "#c8c5bd";

    const refreshOutlines = () => {
      const now = Date.now();
      for (const tab of tabs) {
        if (tab.id === activeId) {
          tab.hostEl.style.border = `2px solid ${activeColor}`;
        } else if (now - tab.lastActiveAt > IDLE_THRESHOLD_MS) {
          tab.hostEl.style.border = `2px solid ${idleColor}`;
          tab.hostEl.style.boxShadow = `0 0 0 1px ${idleColor}33`; // 미세 글로우
        } else {
          tab.hostEl.style.border = `1px solid ${borderColor}`;
          tab.hostEl.style.boxShadow = "";
        }
      }
    };

    refreshOutlines(); // 즉시 1회
    const intervalId = window.setInterval(refreshOutlines, 1000);
    return () => window.clearInterval(intervalId);
  }, [codeLayout, activeId, tabs, dark]);

  // 탭 hostEl 최초 부착 시 1회 실행되는 초기화 — term.open + fit + pending flush +
  // IME beforeinput bridge + composition 리스너. 이전에는 매 activeId 변경마다
  // 이 전체 로직이 재실행되며 xterm state가 깨졌다. 지금은 탭당 한 번만.
  function initializeTabDom(tab: Tab) {
    const host = tab.hostEl;
    tab.term.open(host);
    imeLogPush({ kind: "term-open", tabId: tab.id, hostW: host.clientWidth, hostH: host.clientHeight, at: Date.now() });
    // fit addon이 macOS WKWebView에서 char width를 13.5px 정도로 과대 측정하는
    // 증상 확인됨 (실제 Menlo 13px는 약 7.8px). 1040px 영역이 cols 77로 잘려 claude
    // TUI가 옆줄로 wrap되는 증상.
    // 해결: fit 결과에 하한 강제. 이론 최대(width / fontPx*0.6)의 90% 이상 확보.
    const computeCols = () => {
      const approxCharW = Math.max(6, tw.terminalFontPx * 0.62);
      return Math.max(80, Math.floor(host.clientWidth / approxCharW) - 1);
    };
    const computeRows = () => {
      const approxCharH = Math.max(12, tw.terminalFontPx * 1.2);
      return Math.max(24, Math.floor(host.clientHeight / approxCharH) - 1);
    };
    const runFit = (label: string) => {
      try {
        tab.fit.fit();
        // fit 결과가 이상하게 좁으면 수동 계산 값으로 대체.
        const approxCols = computeCols();
        const approxRows = computeRows();
        if (tab.term.cols < approxCols * 0.85) {
          tab.term.resize(approxCols, approxRows);
          imeLogPush({ kind: `fit-${label}-override`, fitCols: tab.term.cols, approxCols, hostW: host.clientWidth, at: Date.now() });
        } else {
          imeLogPush({ kind: `fit-${label}`, rows: tab.term.rows, cols: tab.term.cols, hostW: host.clientWidth, at: Date.now() });
        }
      } catch {}
    };
    window.setTimeout(() => {
      runFit("first");
      tab.term.focus();
      if (tab.pending && tab.pending.length) {
        imeLogPush({ kind: "pending-flush", count: tab.pending.length, at: Date.now() });
        for (const c of tab.pending) {
          try { tab.term.write(c); } catch (err) {
            imeLogPush({ kind: "flush-err", msg: String(err), at: Date.now() });
          }
        }
        tab.pending.length = 0;
      }
      if (tab.state) tab.state.ready = true;
      // 폰트 늦게 로딩돼 cols 오산 가능 → 추가 fit + claude에 SIGWINCH 효과를 위한 resize 통보.
      window.setTimeout(() => {
        runFit("retry");
        if (isTauri() && tab.term.cols > 0) {
          ptyResize(tab.id, tab.term.cols, tab.term.rows).catch(() => {});
        }
      }, 500);
    }, 50);
    const onResize = () => {
      try {
        tab.fit.fit();
      } catch {}
    };
    window.addEventListener("resize", onResize);

    // helper-textarea IME hint 속성만 설정. xterm CompositionHelper의 native path 그대로 신뢰.
    // (capture handler/imeOverlay/focus redirect 등 보강은 native path 깨뜨려 모두 제거됨.)
    let helper: HTMLTextAreaElement | null = null;
    const imeTimer = window.setTimeout(() => {
      helper =
        (host.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null) ||
        ((tab.term as unknown as { textarea?: HTMLTextAreaElement }).textarea ?? null);
      if (helper) {
        helper.setAttribute("lang", "ko");
        helper.setAttribute("inputmode", "text");
        helper.setAttribute("autocapitalize", "none");
        helper.setAttribute("autocorrect", "off");
        helper.setAttribute("autocomplete", "off");
        helper.setAttribute("spellcheck", "false");
      }
    }, 0);

    tab.cleanup = () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(imeTimer);
      helper = null;
    };
  }

  // WKWebView IME 진단 — xterm buffer + __imeLog + IME 바 상태를 /tmp/atelier-debug.json에 덤프.
  // diagOn() === true일 때만 활성 (프로덕션 기본 OFF). 500ms → 1500ms로 완화.
  useEffect(() => {
    if (!isTauri()) return;
    if (!diagOn()) return;
    const invoke = async (cmd: string, args: unknown) => {
      const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
      return tauriInvoke(cmd, args as Record<string, unknown>);
    };
    const timer = window.setInterval(async () => {
      const tab = tabs.find((t) => t.id === activeId);
      if (!tab) return;
      const buf = tab.term.buffer.active;
      const norm = tab.term.buffer.normal;
      const alt = tab.term.buffer.alternate;
      const lines: string[] = [];
      const len = Math.min(buf.length, 40);
      for (let y = 0; y < len; y++) {
        const line = buf.getLine(y);
        if (line) lines.push(line.translateToString(true));
      }
      const meta = {
        activeType: buf === alt ? "alternate" : "normal",
        rows: tab.term.rows,
        cols: tab.term.cols,
        bufLen: buf.length,
        normLen: norm.length,
        altLen: alt.length,
        cursorX: buf.cursorX,
        cursorY: buf.cursorY,
        // 비어 보이는 첫 5줄의 length + 첫 3 cell
        firstLines: [] as unknown[],
      };
      for (let y = 0; y < Math.min(5, buf.length); y++) {
        const l = buf.getLine(y);
        if (l) {
          const c0 = l.getCell(0);
          const c1 = l.getCell(1);
          meta.firstLines.push({
            y,
            len: l.length,
            str: l.translateToString(false).substring(0, 30),
            strTrim: l.translateToString(true).substring(0, 30),
            c0: c0?.getChars() ?? null,
            c1: c1?.getChars() ?? null,
          });
        }
      }
      const ae = document.activeElement as HTMLElement | null;
      const aeTag = ae?.tagName ?? "";
      const aeCls = ae?.className?.toString?.() ?? "";
      const isHelperFocused = aeCls.includes("xterm-helper-textarea");
      const payload = JSON.stringify({
        ts: Date.now(),
        activeId,
        tabProfiles: tabs.map((t) => ({ id: t.id, profile: t.profile, name: t.name })),
        activeElement: `${aeTag}|${aeCls.substring(0, 80)}`,
        isHelperFocused,
        imeLog: (window as unknown as { __imeLog?: unknown[] }).__imeLog?.slice(-100) ?? [],
        meta,
        lines,
      });
      try {
        await invoke("dump_debug", { content: payload });
      } catch {}
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeId, tabs]);

  // 클립보드 이미지 paste — Ctrl+V 전역 처리
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          e.preventDefault();
          const blob = it.getAsFile();
          if (!blob) return;
          const buf = new Uint8Array(await blob.arrayBuffer());
          try {
            const path = await clipboardSaveImage(buf);
            const tab = tabs.find((t) => t.id === activeId);
            if (tab) {
              // 경로를 현재 세션 stdin에 주입 — Claude Code는 드랍된 파일을 첨부로 인식
              await ptyWrite(tab.id, path);
            }
          } catch (err) {
            console.error("clipboard image error", err);
          }
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [activeId, tabs]);

  // IME 바 제거됨 (라운드 #2) — xterm 6.0.0의 네이티브 composition 경로에 직접 맡김.

  // 탭 이름 저장 (더블클릭 편집 확정).
  function commitRename() {
    if (!editingTabId) return;
    const trimmed = editingName.trim();
    setTabs((prev) =>
      prev.map((t) =>
        t.id === editingTabId
          ? { ...t, customName: trimmed || undefined }
          : t,
      ),
    );
    setEditingTabId(null);
    setEditingName("");
  }

  // 최근 세션 항목 클릭 시 복원. 같은 profile로 새 탭 + 이름 복원.
  // `continueClaude=true`면 claude 프로파일에 한해 cmd를 `claude --continue`로 override해
  // Claude Code CLI의 최근 세션 이어가기를 트리거.
  async function restoreClosed(s: ClosedSession, continueClaude = false) {
    const override = continueClaude && s.profile === "claude" ? "claude --continue" : undefined;
    await spawnTab(s.profile, {
      customName: s.name,
      cmdOverride: override,
      replayLogId: s.logSourceId || s.id,
    });
    setClosedSessions((prev) => prev.filter((x) => x.id !== s.id));
  }

  // 탭 닫기
  async function closeTab(id: string) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    // "최근 세션"에 메타 저장 (가장 앞에 삽입, 상한 20개) + 마지막 대화 미리보기 같이.
    const meta: ClosedSession = {
      id: tab.id,
      name: tab.customName || tab.name,
      profile: tab.profile,
      cmd: tab.cmd,
      dot: tab.dot,
      closedAt: Date.now(),
      firstPrompt: tab.firstPrompt,
      lastSnippet: tab.lastSnippet,
      logSourceId: tab.logId || tab.id,
    };
    setClosedSessions((prev) => [meta, ...prev.filter((s) => s.id !== id)].slice(0, 20));
    tab.cleanup?.();
    tab.unlistenData?.();
    tab.unlistenExit?.();
    try {
      await ptyKill(id);
    } catch {}
    tab.term.dispose();
    tab.hostEl.remove();
    setTabs((prev) => prev.filter((t) => t.id !== id));
    setActiveId((curr) => {
      if (curr !== id) return curr;
      const rest = tabs.filter((t) => t.id !== id);
      return rest.length ? rest[rest.length - 1].id : null;
    });
  }

  return (
    <div
      className={cls(
        "h-full w-full flex fade-in",
        dark ? "bg-dbg text-dink" : "bg-cream text-ink",
      )}
    >
      {toast && (
        <div
          role="status"
          className={cls(
            "fixed bottom-4 right-4 z-50 max-w-[420px] px-3.5 py-2.5 rounded-[10px] border text-[12.5px] font-medium shadow-lg",
            dark ? "bg-dsurf border-dline text-dink" : "bg-surface border-line text-ink",
          )}
        >
          {toast}
        </div>
      )}
      {/* 사이드바 숨김 시 좌상단 floating 토글 버튼 */}
      {leftHidden && (
        <button
          type="button"
          onClick={() => setLeftHidden(false)}
          className={cls(
            "fixed top-3 left-3 z-40 h-8 w-8 inline-flex items-center justify-center rounded-[8px] border text-[14px]",
            dark ? "bg-dsurf border-dline text-dsub hover:text-dink" : "bg-surface border-line text-sub hover:text-ink",
          )}
          title="사이드바 열기 (⌘+B)"
        >
          ▸
        </button>
      )}
      {/* 좌측 패널 — 세션 / 파일 탭 스위처로 단일 컬럼 공유 */}
      {!leftHidden && (
      <aside
        style={{ width: `${leftPanelWidth}px` }}
        className={cls(
          "shrink-0 h-full flex flex-col",
          dark ? "" : "",
        )}
      >
        {/* 상단 탭 스위처 (엑셀 시트 느낌) */}
        <div
          className={cls(
            "h-10 px-1.5 flex items-center gap-1 border-b",
            dark ? "border-dline" : "border-line",
          )}
        >
          {([
            ["sessions", "세션"],
            ["files", "파일"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLeftTab(key)}
              className={cls(
                "h-7 px-3 rounded-[6px] text-[12px] font-medium transition-colors",
                leftTab === key
                  ? dark
                    ? "bg-dmuted text-dink"
                    : "bg-surface text-ink shadow-[0_0_0_1px_#e5e3db]"
                  : dark
                    ? "text-dsub hover:text-dink hover:bg-[#2a2a28]"
                    : "text-sub hover:text-ink hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLeftHidden(true)}
            className={cls(
              "ml-auto h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-[14px]",
              dark ? "text-dsub hover:text-dink hover:bg-[#2a2a28]" : "text-sub hover:text-ink hover:bg-muted",
            )}
            title="사이드바 숨기기 (⌘+B)"
          >
            ◂
          </button>
        </div>

        {/* 파일 탭 */}
        {leftTab === "files" && (
          <div className="flex-1 min-h-0">
            <FileTree dark={dark} onOpenFile={openFileInPreview} />
          </div>
        )}

        {/* 세션 탭 */}
        {leftTab === "sessions" && (
        <div className="flex-1 overflow-auto p-2 space-y-0.5">
          {tabs.length === 0 && (
            <div
              className={cls(
                "text-[12px] leading-[1.6] p-3 rounded-[8px]",
                dark ? "text-dsub" : "text-sub",
              )}
            >
              열린 세션이 없습니다. 아래 + 버튼으로 새 세션을 시작하세요.
            </div>
          )}
          {/* 라운드 #14: 위쪽 아바타 + 이름 리스트 제거 — 대화 내역 카드와 중복.
              대화 내역 카드(아래)에 hover 닫기 + 더블클릭 rename 통합. */}

          {closedSessions.length > 0 && (
            <>
              <div
                className={cls(
                  "mt-3 mb-1 px-2 text-[10px] font-mono uppercase tracking-wider flex items-center justify-between",
                  dark ? "text-dsub" : "text-sub",
                )}
              >
                <span>최근 세션</span>
                <button
                  type="button"
                  onClick={() => setClosedSessions([])}
                  className={cls(
                    "text-[10px] normal-case tracking-normal hover:underline",
                    dark ? "text-dsub hover:text-dink" : "text-sub hover:text-ink",
                  )}
                  title="전체 지우기"
                >
                  지우기
                </button>
              </div>
              {closedSessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => restoreClosed(s, false)}
                  className={cls(
                    "group w-full px-2.5 py-2 rounded-[6px] text-left flex items-start gap-2 cursor-pointer transition-colors",
                    dark ? "hover:bg-[#2a2a28]" : "hover:bg-muted",
                  )}
                  title="클릭해 새 탭으로 복원"
                >
                  <span
                    className="mt-[6px] h-1.5 w-1.5 rounded-full shrink-0 opacity-60"
                    style={{ background: s.dot }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={cls(
                        "truncate text-[12px] font-medium",
                        dark ? "text-dink" : "text-ink",
                      )}
                    >
                      {s.firstPrompt || s.name}
                    </div>
                    <div
                      className={cls(
                        "text-[9.5px] flex items-center gap-1 mt-0.5",
                        dark ? "text-dsub" : "text-sub",
                      )}
                    >
                      <span className="truncate">
                        {s.firstPrompt ? s.name : ""}
                      </span>
                      {s.firstPrompt && <span className="opacity-60">·</span>}
                      <span className="shrink-0">{relTime(s.closedAt)}</span>
                    </div>
                    {s.lastSnippet && (
                      <div
                        className={cls(
                          "text-[10px] leading-[1.45] whitespace-pre-line line-clamp-2 opacity-65 mt-1",
                          dark ? "text-dsub" : "text-sub",
                        )}
                      >
                        {s.lastSnippet}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {s.profile === "claude" && (
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          restoreClosed(s, true);
                        }}
                        className={cls(
                          "opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium",
                          dark ? "bg-dmuted hover:bg-[#3d3d3b] text-dink" : "bg-muted hover:bg-line text-ink",
                        )}
                        title="claude --continue로 이전 세션 이어가기"
                      >
                        이어가기
                      </span>
                    )}
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setClosedSessions((prev) => prev.filter((x) => x.id !== s.id));
                      }}
                      className={cls(
                        "opacity-0 group-hover:opacity-100 w-5 h-5 inline-flex items-center justify-center rounded-[4px] text-[12px] leading-none",
                        dark ? "hover:bg-[#3d3d3b] text-dsub hover:text-dink" : "hover:bg-line text-sub hover:text-ink",
                      )}
                      title="이 세션 기록 삭제"
                    >
                      ✕
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* 대화 내역 — 각 세션의 최근 터미널 출력을 채팅 말풍선 카드로. */}
          {tabs.length > 0 && (
            <>
              <div
                className={cls(
                  "mt-3 mb-1 px-2 text-[10px] font-mono uppercase tracking-wider",
                  dark ? "text-dsub" : "text-sub",
                )}
              >
                대화 내역
              </div>
              {tabs.map((t) => (
                <div
                  key={`msg-${t.id}`}
                  onClick={() => setActiveId(t.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingTabId(t.id);
                    setEditingName(t.customName || t.name);
                  }}
                  className={cls(
                    "group w-full px-2.5 py-2 rounded-[8px] cursor-pointer transition-colors mb-1",
                    activeId === t.id
                      ? dark
                        ? "bg-dmuted"
                        : "bg-surface shadow-[0_0_0_1px_#e5e3db]"
                      : dark
                        ? "hover:bg-[#2a2a28]"
                        : "hover:bg-muted",
                  )}
                  title="더블클릭으로 이름 바꾸기"
                >
                  <div className="flex items-start gap-1.5 mb-0.5">
                    <span
                      className="mt-[6px] h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: t.dot }}
                    />
                    <div className="flex-1 min-w-0">
                      {editingTabId === t.id ? (
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") {
                              setEditingTabId(null);
                              setEditingName("");
                            }
                          }}
                          className={cls(
                            "w-full h-6 px-1 rounded-[4px] border text-[12px] outline-none",
                            dark
                              ? "bg-dmuted border-dline text-dink"
                              : "bg-surface border-line text-ink",
                          )}
                        />
                      ) : (
                        <div
                          className={cls(
                            "text-[12px] font-medium truncate",
                            dark ? "text-dink" : "text-ink",
                          )}
                        >
                          {t.firstPrompt || t.customName || t.name}
                        </div>
                      )}
                      <div
                        className={cls(
                          "text-[9.5px] flex items-center gap-1 mt-0.5",
                          dark ? "text-dsub" : "text-sub",
                        )}
                      >
                        <span className="truncate">
                          {t.firstPrompt ? (t.customName || t.name) : ""}
                        </span>
                        {t.firstPrompt && <span className="opacity-60">·</span>}
                        <span className="shrink-0">{relTime(t.lastActiveAt)}</span>
                      </div>
                    </div>
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(t.id);
                      }}
                      className={cls(
                        "opacity-0 group-hover:opacity-100 shrink-0 h-5 w-5 grid place-items-center rounded-[4px]",
                        dark ? "hover:bg-[#3d3d3b] text-dsub" : "hover:bg-line text-sub",
                      )}
                      title="탭 닫기"
                    >
                      {I.x}
                    </span>
                  </div>
                  <div
                    className={cls(
                      "text-[10.5px] leading-[1.45] whitespace-pre-line line-clamp-2 opacity-75 pl-3",
                      dark ? "text-dsub" : "text-sub",
                    )}
                  >
                    {t.lastSnippet || "(아직 출력 없음)"}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        )}

        {leftTab === "sessions" && (
        <div className={cls("relative border-t p-2", dark ? "border-dline" : "border-line")}>
          <button
            onClick={() => setShowPicker((v) => !v)}
            className={cls(
              "w-full h-9 rounded-[7px] text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors",
              dark
                ? "text-dsub hover:text-dink hover:bg-dmuted"
                : "text-sub hover:text-ink hover:bg-muted",
            )}
          >
            {I.plus} 새 세션
          </button>
          {showPicker && (
            <div
              className={cls(
                "absolute bottom-12 left-2 right-2 rounded-[10px] border overflow-hidden z-10",
                dark ? "bg-dsurf border-dline" : "bg-surface border-line",
              )}
            >
              {tw.profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    spawnTab(p.id).catch((err) => {
                      showToast(`${p.name} 실행 실패: ${String(err)}`);
                    });
                  }}
                  className={cls(
                    "w-full h-9 px-3 text-left text-[13px] flex items-center gap-2.5 transition-colors",
                    dark ? "hover:bg-dmuted text-dink" : "hover:bg-muted text-ink",
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: p.dot }}
                  />
                  {p.name}
                  <span
                    className={cls(
                      "ml-auto font-mono text-[11px]",
                      dark ? "text-dsub" : "text-sub",
                    )}
                  >
                    {p.cmd}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}
      </aside>
      )}
      {/* 좌측 패널 리사이즈 handle (사이드바 보일 때만) */}
      {!leftHidden && (
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={(e) => beginDrag(e, "left", leftPanelWidth)}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cls(
          "w-1 shrink-0 cursor-col-resize transition-colors touch-none",
          isResizingLeft
            ? (dark ? "bg-[#5a8ae0]" : "bg-[#4b5fbd]")
            : (dark ? "bg-dline hover:bg-[#5a8ae0]" : "bg-line hover:bg-[#4b5fbd]"),
        )}
        title="드래그해 패널 폭 조정"
      />
      )}

      {/* Main split */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div
          className={cls(
            "h-10 px-4 flex items-center justify-between border-b gap-3",
            dark ? "border-dline" : "border-line",
          )}
        >
          <div
            className={cls(
              "text-[12px] font-mono shrink-0 truncate",
              dark ? "text-dsub" : "text-sub",
            )}
          >
            {activeId
              ? tabs.find((t) => t.id === activeId)?.name
              : "세션 없음"}
          </div>
          {/* 코드 layout toggle — single (1+프리뷰) vs grid (멀티 터미널 정렬) */}
          <div className={cls(
            "shrink-0 inline-flex items-center rounded-[6px] overflow-hidden border",
            dark ? "border-dline" : "border-line",
          )}>
            {([
              ["single", "▭", "싱글 (터미널 1 + 프리뷰)"],
              ["grid", "▦", "그리드 (멀티 터미널)"],
            ] as const).map(([k, icon, t]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCodeLayout(k)}
                title={t}
                className={cls(
                  "h-7 w-8 inline-flex items-center justify-center text-[13px]",
                  codeLayout === k
                    ? dark ? "bg-dline text-dink" : "bg-line text-ink"
                    : dark ? "text-dsub hover:text-dink hover:bg-[#2a2a28]" : "text-sub hover:text-ink hover:bg-muted",
                )}
              >
                {icon}
              </button>
            ))}
          </div>
          <div
            className={cls(
              "text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 shrink-0",
              dark ? "text-dsub" : "text-sub",
            )}
          >
            {I.paperclip} {MOD_KEY}+V
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* 터미널 영역 */}
          <div className="flex-1 min-w-0 relative">
            {!isTauri() && !import.meta.env.DEV && (
              <div
                className={cls(
                  "absolute inset-0 z-10 flex items-center justify-center p-8 text-center",
                  dark ? "text-dsub" : "text-sub",
                )}
              >
                <div>
                  <div
                    className={cls(
                      "text-[14px] mb-2",
                      dark ? "text-dink" : "text-ink",
                    )}
                  >
                    Tauri 런타임에서만 실제 터미널이 동작합니다.
                  </div>
                  <div className="text-[12px]">
                    <code className="font-mono">npm run tauri:dev</code> 로 실행하세요.
                  </div>
                </div>
              </div>
            )}
            <div
              ref={termContainerRef}
              className="h-full w-full"
              style={{ background: dark ? "#1a1a18" : "#1f1f1d" }}
            />
          </div>

          {/* Preview — grid 모드는 자동 숨김 (멀티 터미널 작업환경에 화면 공간 양보) */}
          {showPreview && codeLayout === "single" && (
          <>
            {/* 드래그 리사이즈 handle — 왼쪽 경계. 4px 폭 + hover/active 시각 표시. */}
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={(e) => beginDrag(e, "preview", previewWidth)}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className={cls(
                "w-1 shrink-0 cursor-col-resize transition-colors touch-none",
                isResizingPreview
                  ? (dark ? "bg-[#5a8ae0]" : "bg-[#4b5fbd]")
                  : (dark ? "bg-dline hover:bg-[#5a8ae0]" : "bg-line hover:bg-[#4b5fbd]"),
              )}
              title="드래그해 미리보기 폭 조절"
            />
          <div
            style={{ width: `${previewWidth}px` }}
            className={cls(
              "shrink-0 border-l flex flex-col",
              dark ? "border-dline bg-dsurf" : "border-line bg-surface",
            )}
          >
            <div
              className={cls(
                "h-10 px-3 flex items-center gap-2 border-b text-[11px] font-mono",
                dark ? "border-dline text-dsub" : "border-line text-sub",
              )}
            >
              <span className="uppercase tracking-wider flex items-center gap-1 shrink-0">
                {I.eye} 미리보기
              </span>
              {fileViewer && !previewUrl && (
                <>
                  <span
                    className={cls(
                      "flex-1 min-w-0 truncate text-[11px] font-mono",
                      dark ? "text-dink" : "text-ink",
                    )}
                    title={fileViewer.path}
                  >
                    {fileViewer.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFileViewer(null)}
                    className={cls(
                      "shrink-0 px-1.5 py-0.5 rounded-[4px] text-[10px]",
                      dark ? "hover:bg-[#3d3d3b]" : "hover:bg-line",
                    )}
                    title="닫기"
                  >
                    ✕
                  </button>
                </>
              )}
              {!previewUrl && !fileViewer && (
                <form
                  onSubmit={(e) => { e.preventDefault(); applyPreviewInput(); }}
                  className="flex-1 min-w-0 flex items-center gap-1"
                >
                  <input
                    value={previewInput}
                    onChange={(e) => setPreviewInput(e.target.value)}
                    placeholder="URL 직접 입력 (http://localhost:5173)"
                    className={cls(
                      "flex-1 min-w-0 h-6 px-2 rounded-[4px] border text-[11px] outline-none",
                      dark
                        ? "bg-dmuted border-dline text-dink placeholder:text-dsub"
                        : "bg-muted border-line text-ink placeholder:text-sub",
                    )}
                  />
                  <button
                    type="submit"
                    className={cls(
                      "shrink-0 h-6 px-2 rounded-[4px] text-[10px]",
                      dark ? "bg-dline hover:bg-[#3d3d3b] text-dink" : "bg-line hover:bg-muted text-ink",
                    )}
                  >
                    열기
                  </button>
                </form>
              )}
              {previewUrl && (
                <>
                  <span
                    className={cls(
                      "flex-1 min-w-0 truncate text-[11px]",
                      dark ? "text-dink" : "text-ink",
                    )}
                    title={previewUrl}
                  >
                    {previewUrl}
                  </span>
                  {/* 해상도 토글 — 반응형 확인용. 모바일/태블릿/데스크탑 */}
                  <div className={cls(
                    "shrink-0 inline-flex items-center rounded-[5px] overflow-hidden border",
                    dark ? "border-dline" : "border-line",
                  )}>
                    {([
                      ["mobile", "📱", "모바일 (390×844, DevTools 표준)"],
                      ["tablet", "▭", "태블릿 11\" (834×1194)"],
                      ["desktop", "🖥", "데스크탑 (100%)"],
                    ] as const).map(([vp, icon, t]) => (
                      <button
                        key={vp}
                        type="button"
                        onClick={() => setPreviewVP(vp)}
                        title={t}
                        className={cls(
                          "h-6 w-7 inline-flex items-center justify-center text-[11px] transition-colors",
                          previewVP === vp
                            ? dark ? "bg-dline text-dink" : "bg-line text-ink"
                            : dark ? "text-dsub hover:text-dink hover:bg-[#2a2a28]" : "text-sub hover:text-ink hover:bg-muted",
                        )}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewReloadKey((n) => n + 1)}
                    className={cls(
                      "shrink-0 px-1.5 py-0.5 rounded-[4px] text-[10px]",
                      dark ? "hover:bg-[#3d3d3b]" : "hover:bg-line",
                    )}
                    title="새로고침"
                  >
                    ↻
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!previewUrl) return;
                      try {
                        const { open } = await import("@tauri-apps/plugin-shell");
                        await open(previewUrl);
                      } catch (err) {
                        console.warn("external open failed", err);
                      }
                    }}
                    className={cls(
                      "shrink-0 px-1.5 py-0.5 rounded-[4px] text-[10px]",
                      dark ? "hover:bg-[#3d3d3b]" : "hover:bg-line",
                    )}
                    title="외부 브라우저에서 열기 (서버가 X-Frame-Options로 iframe 차단한 경우)"
                  >
                    ↗
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewUrl(null)}
                    className={cls(
                      "shrink-0 px-1.5 py-0.5 rounded-[4px] text-[10px]",
                      dark ? "hover:bg-[#3d3d3b]" : "hover:bg-line",
                    )}
                    title="닫기"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
            <div className="flex-1 overflow-auto relative">
              {previewUrl ? (
                <>
                  {/* viewport=desktop이면 iframe full, 아니면 wrapper로 width 고정 + 중앙 정렬 */}
                  {previewVP === "desktop" ? (
                    <iframe
                      key={`${previewUrl}#${previewReloadKey}#${previewVP}`}
                      src={previewUrl}
                      title="Atelier Preview"
                      className="absolute inset-0 w-full h-full border-0"
                      sandbox="allow-scripts allow-forms allow-popups"
                    />
                  ) : (
                    <div
                      className={cls(
                        "absolute inset-0 overflow-auto flex items-start justify-center p-6",
                        dark ? "bg-[#0e0e0c]" : "bg-[#e8e6df]",
                      )}
                    >
                      <div
                        className={cls(
                          "shrink-0 shadow-[0_4px_24px_rgba(0,0,0,0.18)] rounded-[12px] overflow-hidden border",
                          dark ? "border-dline bg-dsurf" : "border-line bg-surface",
                        )}
                        style={{
                          width: PREVIEW_VP_SIZES[previewVP].w,
                          height: PREVIEW_VP_SIZES[previewVP].h,
                          maxWidth: "100%",
                        }}
                      >
                        <iframe
                          key={`${previewUrl}#${previewReloadKey}#${previewVP}`}
                          src={previewUrl}
                          title="Atelier Preview"
                          className="w-full h-full border-0 block"
                          sandbox="allow-scripts allow-forms allow-popups"
                        />
                      </div>
                    </div>
                  )}
                  <div
                    className={cls(
                      "absolute left-0 right-0 bottom-0 px-3 py-1.5 text-[10.5px] border-t flex items-center gap-2",
                      dark ? "bg-dsurf/90 border-dline text-dsub" : "bg-surface/90 border-line text-sub",
                    )}
                    style={{ backdropFilter: "blur(6px)" }}
                  >
                    <span className="flex-1 truncate">
                      {previewVP === "desktop"
                        ? "비어 있다면 서버의 X-Frame-Options 차단입니다 — 우상단 ↗ 로 외부에서 여세요."
                        : `${previewVP === "mobile" ? "모바일 390×844 (DevTools 표준)" : "태블릿 834×1194 (iPad Pro 11\")"} · 화면이 작으면 스크롤로 확인`}
                    </span>
                  </div>
                </>
              ) : fileViewer ? (
                <pre
                  className={cls(
                    "absolute inset-0 m-0 p-3 overflow-auto font-mono text-[12px] leading-[1.55] whitespace-pre",
                    dark ? "text-dink bg-dbg" : "text-ink bg-cream",
                  )}
                >
                  {fileViewer.content}
                </pre>
              ) : (
                <div className="p-6">
                  <h2
                    className={cls(
                      "font-display text-[22px] font-[500] tracking-[-0.01em] leading-[1.18] mb-3",
                      dark ? "text-dink" : "text-ink",
                    )}
                  >
                    dev server가 뜨면 자동으로 표시됩니다.
                  </h2>
                  <p
                    className={cls(
                      "text-[13.5px] leading-[1.7]",
                      dark ? "text-dsub" : "text-sub",
                    )}
                  >
                    터미널 출력에서 http(s) URL을 감지하면 여기에 바로 로드됩니다.
                    <br />
                    dev server의 HMR이 iframe 안에서 동작해 실시간 업데이트됩니다.
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-[12px]">
                    {[
                      { k: `${MOD_KEY}+V`, v: "이미지 붙여넣기" },
                      { k: `${MOD_KEY}+T`, v: "새 탭" },
                      { k: `${MOD_KEY}+W`, v: "탭 닫기" },
                      { k: `${MOD_KEY}+P`, v: "미리보기 토글" },
                    ].map((r) => (
                      <div
                        key={r.k}
                        className={cls(
                          "flex items-center justify-between p-2 rounded-[6px] border",
                          dark ? "border-dline" : "border-line",
                        )}
                      >
                        <span className={cls("font-mono", dark ? "text-dsub" : "text-sub")}>
                          {r.k}
                        </span>
                        <span
                          className={cls(
                            "text-[11px]",
                            dark ? "text-dink" : "text-ink",
                          )}
                        >
                          {r.v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          </>
          )}
        </div>

      </div>
    </div>
  );
};

export default Main;
