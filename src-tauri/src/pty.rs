//! PTY 세션 관리 — portable-pty 기반.
//!
//! 프론트엔드(xterm.js) ↔ Tauri IPC ↔ shell 프로세스 연결:
//!   - `pty_spawn(profile, cols, rows)` → 세션 id 반환
//!   - `pty_write(id, data)`            → stdin 전송
//!   - `pty_resize(id, cols, rows)`     → 터미널 크기 변경
//!   - `pty_kill(id)`                   → 세션 종료
//!   - 이벤트 `pty://{id}/data`          → stdout 청크 방출
//!   - 이벤트 `pty://{id}/exit`          → 종료 코드

use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;

use anyhow::{anyhow, Result};
use dashmap::DashMap;
use once_cell::sync::OnceCell;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use uuid::Uuid;

struct Session {
    writer: Arc<std::sync::Mutex<Box<dyn Write + Send>>>,
    master: Arc<std::sync::Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    child_killer: Arc<std::sync::Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
    profile: String,
}

struct PtyState {
    sessions: DashMap<String, Session>,
}

static STATE: OnceCell<Arc<PtyState>> = OnceCell::new();

pub fn init_state() {
    let _ = STATE.set(Arc::new(PtyState {
        sessions: DashMap::new(),
    }));
}

fn state() -> Arc<PtyState> {
    STATE.get().expect("PtyState uninit").clone()
}

#[derive(Serialize, Clone)]
pub struct SpawnResult {
    pub id: String,
    pub profile: String,
}

#[derive(Serialize, Clone)]
struct DataPayload<'a> {
    data: &'a [u8],
}

#[derive(Serialize, Clone)]
struct ExitPayload {
    code: Option<i32>,
}

/// 프로파일 id → 실제 실행 커맨드.
fn profile_command(profile: &str) -> CommandBuilder {
    match profile {
        "claude" => {
            // npm 글로벌 `claude` 래퍼를 호출. Windows는 .cmd.
            #[cfg(windows)]
            {
                let mut cmd = CommandBuilder::new("cmd.exe");
                cmd.arg("/c");
                cmd.arg("claude");
                cmd
            }
            #[cfg(not(windows))]
            {
                CommandBuilder::new("claude")
            }
        }
        "pwsh" => CommandBuilder::new("pwsh"),
        "bash" => CommandBuilder::new("bash"),
        "cmd" => CommandBuilder::new("cmd.exe"),
        "node" => CommandBuilder::new("node"),
        other => CommandBuilder::new(other),
    }
}

#[tauri::command]
pub async fn pty_spawn<R: Runtime>(
    app: AppHandle<R>,
    profile: String,
    cols: u16,
    rows: u16,
) -> std::result::Result<SpawnResult, String> {
    spawn_impl(app, profile, cols, rows).map_err(|e| e.to_string())
}

fn spawn_impl<R: Runtime>(
    app: AppHandle<R>,
    profile: String,
    cols: u16,
    rows: u16,
) -> Result<SpawnResult> {
    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| anyhow!("openpty failed: {e}"))?;

    let cmd = profile_command(&profile);
    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| anyhow!("spawn failed for '{profile}': {e}"))?;
    drop(pair.slave);

    let id = Uuid::new_v4().to_string();
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| anyhow!("clone reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| anyhow!("take writer: {e}"))?;
    let killer = child.clone_killer();

    let session = Session {
        writer: Arc::new(std::sync::Mutex::new(writer)),
        master: Arc::new(std::sync::Mutex::new(pair.master)),
        child_killer: Arc::new(std::sync::Mutex::new(killer)),
        profile: profile.clone(),
    };
    state().sessions.insert(id.clone(), session);

    // 리더 스레드 — 청크를 IPC 이벤트로 방출
    let id_reader = id.clone();
    let app_reader = app.clone();
    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        let ev = format!("pty://{}/data", id_reader);
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let _ = app_reader.emit(
                        &ev,
                        DataPayload { data: &buf[..n] },
                    );
                }
                Err(e) => {
                    log::warn!("pty read error: {e}");
                    break;
                }
            }
        }
    });

    // 자식 대기 스레드 — 종료 코드 전송 + 세션 정리
    let id_wait = id.clone();
    let app_wait = app.clone();
    thread::spawn(move || {
        let ev = format!("pty://{}/exit", id_wait);
        let code = child.wait().ok().and_then(|s| s.exit_code().try_into().ok());
        let _ = app_wait.emit(&ev, ExitPayload { code });
        state().sessions.remove(&id_wait);
    });

    Ok(SpawnResult { id, profile })
}

#[tauri::command]
pub async fn pty_write(id: String, data: String) -> std::result::Result<(), String> {
    let s = state();
    let sess = s
        .sessions
        .get(&id)
        .ok_or_else(|| format!("session {id} not found"))?;
    let mut w = sess.writer.lock().map_err(|e| e.to_string())?;
    w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn pty_resize(id: String, cols: u16, rows: u16) -> std::result::Result<(), String> {
    let s = state();
    let sess = s
        .sessions
        .get(&id)
        .ok_or_else(|| format!("session {id} not found"))?;
    let m = sess.master.lock().map_err(|e| e.to_string())?;
    m.resize(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn pty_kill(id: String) -> std::result::Result<(), String> {
    let s = state();
    if let Some((_, sess)) = s.sessions.remove(&id) {
        let mut k = sess.child_killer.lock().map_err(|e| e.to_string())?;
        k.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub profile: String,
}

#[tauri::command]
pub async fn pty_list() -> Vec<SessionInfo> {
    state()
        .sessions
        .iter()
        .map(|r| SessionInfo {
            id: r.key().clone(),
            profile: r.value().profile.clone(),
        })
        .collect()
}
