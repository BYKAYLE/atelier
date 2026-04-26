/**
 * Atelier Design Wizard — claude --print 단발 호출 wrapper.
 *
 * 이전 PTY/TUI/마커 방식은 paste 감지/CR vs LF/init 타이밍 등 너무 많은 변수가 있어 회귀.
 * → Rust process spawn(claude --print) + stdin/stdout 단순 통신으로 전환.
 * 한 번 호출당 1회 응답. interactive TUI 미사용. 한글/긴 prompt 모두 안전.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../../lib/tauri";

export async function askDesignClaude(
  systemPrompt: string,
  userInput: string,
): Promise<string> {
  if (!isTauri()) throw new Error("Tauri runtime required");
  const out = await invoke<string>("design_claude_call", {
    systemPrompt,
    userInput,
  });
  return out;
}

/** 호환성 — 이전 진행 미리보기 함수가 호출되던 곳 대비 stub. */
export function getProgressBuffer(): string {
  return "";
}
