import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface PtySpawnResult {
  id: string;
  profile: string;
}

export async function ptySpawn(profile: string, cols: number, rows: number): Promise<PtySpawnResult> {
  return invoke("pty_spawn", { profile, cols, rows });
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

export async function onPtyData(
  id: string,
  handler: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  return listen<{ data: number[] }>(`pty://${id}/data`, (e) => {
    handler(new Uint8Array(e.payload.data));
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

/** 클립보드 PNG 바이트를 임시파일로 저장하고 경로 반환 */
export async function clipboardSaveImage(pngBytes: Uint8Array): Promise<string> {
  const b64 = btoa(String.fromCharCode(...pngBytes));
  return invoke("clipboard_save_image", { pngBase64: b64 });
}

/** Tauri 런타임에서만 동작 — 브라우저 미리보기에선 null */
export const isTauri = (): boolean => "__TAURI_INTERNALS__" in window;
