//! 클립보드 이미지 → 임시 PNG → 파일 경로.
//!
//! Windows Win+Shift+S (스크린샷)은 디스크에 저장 없이 클립보드에만 들어감.
//! 프런트엔드가 `ClipboardItem`으로 PNG 바이트를 뽑아서 이 커맨드로 넘기면,
//! Atelier는 임시 폴더에 PNG를 저장하고 파일 경로를 반환함.
//! 이 경로를 PTY에 "drag-drop처럼" 주입하면 Claude Code가 첨부로 인식.

use std::fs;
use std::path::PathBuf;

use base64::Engine;

#[tauri::command]
pub async fn clipboard_save_image(png_base64: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|e| format!("base64 decode: {e}"))?;

    // 포맷 검증 — PNG 매직 시그니처
    if bytes.len() < 8 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("invalid png signature".into());
    }

    let dir = resolve_temp_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S-%3f");
    let path = dir.join(format!("paste-{stamp}.png"));
    fs::write(&path, &bytes).map_err(|e| format!("write: {e}"))?;

    Ok(path.to_string_lossy().into_owned())
}

fn resolve_temp_dir() -> Result<PathBuf, String> {
    let base = std::env::temp_dir().join("atelier").join("pastes");
    Ok(base)
}
