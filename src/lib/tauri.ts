import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface PtySpawnResult {
  id: string;
  profile: string;
  log_id: string;
}

export async function ptySpawn(
  profile: string,
  cols: number,
  rows: number,
  logId?: string,
): Promise<PtySpawnResult> {
  return invoke("pty_spawn", { profile, cols, rows, logId: logId ?? null });
}

export async function ptyWrite(id: string, data: string): Promise<void> {
  return invoke("pty_write", { id, data });
}

export async function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { id, cols, rows });
}

export async function ptyKill(id: string): Promise<void> {
  return invoke("pty_kill", { id });
}

// Rust 측은 PTY 청크를 base64 문자열로 emit (pty.rs DataPayload 주석 참조).
// atob로 바이너리 문자열 복원 후 Uint8Array 생성 — JSON 숫자배열 경로 대비
// UI thread 점유 대폭 감소.
export async function onPtyData(
  id: string,
  handler: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  return listen<{ data: string }>(`pty://${id}/data`, (e) => {
    const bin = atob(e.payload.data);
    const n = bin.length;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    handler(out);
  });
}

export async function onPtyExit(
  id: string,
  handler: (code: number | null) => void,
): Promise<UnlistenFn> {
  return listen<{ code: number | null }>(`pty://${id}/exit`, (e) => {
    handler(e.payload.code);
  });
}

export interface AgentStreamEvent {
  kind: "status" | "delta" | "tool" | "result" | "error" | "raw";
  text?: string | null;
  status?: string | null;
  raw?: string | null;
  provider_session_id?: string | null;
  is_error?: boolean | null;
}

export interface AgentRunResult {
  text: string;
  provider_session_id?: string | null;
  raw_events: string[];
  is_error: boolean;
  error?: string | null;
}

export type AgentProvider = "claude" | "codex" | "hermes";

export async function agentClaudeSend(args: {
  turnId: string;
  prompt: string;
  resumeSessionId?: string | null;
  cwd?: string | null;
  model?: string | null;
}): Promise<AgentRunResult> {
  return invoke("agent_claude_send", args);
}

export async function agentSend(args: {
  provider: AgentProvider;
  turnId: string;
  prompt: string;
  resumeSessionId?: string | null;
  cwd?: string | null;
  model?: string | null;
}): Promise<AgentRunResult> {
  return invoke("agent_send", args);
}

export async function onAgentEvent(
  turnId: string,
  handler: (event: AgentStreamEvent) => void,
): Promise<UnlistenFn> {
  return listen<AgentStreamEvent>(`agent://${turnId}/event`, (e) => handler(e.payload));
}

/** 클립보드 PNG 바이트를 임시파일로 저장하고 경로 반환 */
export async function clipboardSaveImage(pngBytes: Uint8Array): Promise<string> {
  const b64 = btoa(String.fromCharCode(...pngBytes));
  return invoke("clipboard_save_image", { pngBase64: b64 });
}

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}
export async function listDir(path: string): Promise<FsEntry[]> {
  return invoke("list_dir", { path });
}
export async function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}
export async function homeDir(): Promise<string> {
  return invoke("home_dir");
}
export async function commandExists(command: string): Promise<boolean> {
  return invoke("command_exists", { command });
}

/** 세션 로그 읽기. base64 string 반환. 없으면 빈 문자열. */
export async function sessionLogLoad(id: string): Promise<string> {
  return invoke("session_log_load", { id });
}
export async function sessionLogClear(id: string): Promise<void> {
  return invoke("session_log_clear", { id });
}

/** ~/Library/Application Support/Atelier/profiles.json 에서 프로필 JSON 읽기. */
export async function loadProfilesFile(): Promise<string> {
  return invoke("load_profiles");
}
/** 프로필 JSON을 앱 데이터 디렉토리에 쓰기. */
export async function saveProfilesFile(json: string): Promise<void> {
  return invoke("save_profiles", { json });
}


/** Tauri 런타임에서만 동작 — 브라우저 미리보기에선 null */
export const isTauri = (): boolean => "__TAURI_INTERNALS__" in window;

/**
 * 빌트인 design-engine 리소스 읽기. relpath 예: "philosophies/01-pentagram.md".
 * 번들 모드에서는 Atelier.app/Contents/Resources/resources/design-engine/ 하위,
 * dev 모드에서는 src-tauri/resources/design-engine/ 하위에서 검색.
 */
export async function readDesignResource(relpath: string): Promise<string> {
  return invoke("read_design_resource", { relpath });
}

/**
 * 디자인 산출물(HTML/마크다운 등)을 사용자 데이터 디렉토리에 저장.
 * 반환값은 절대 경로 — Preview iframe에 file:// 로 로드할 때 사용.
 */
export async function saveDesignArtifact(
  projectId: string,
  relpath: string,
  content: string,
): Promise<string> {
  return invoke("save_design_artifact", { projectId, relpath, content });
}

/** 디자인 프로젝트 폴더를 Finder에서 연다. 경로 반환. */
export async function openDesignProjectDir(projectId: string): Promise<string> {
  return invoke("open_design_project_dir", { projectId });
}

/** 디자인 프로젝트 폴더를 zip으로 묶어 ~/Downloads/atelier-<id>-<ts>.zip 생성 + Finder reveal. zip 절대경로 반환. */
export async function exportDesignProjectZip(projectId: string): Promise<string> {
  return invoke("export_design_project_zip", { projectId });
}
