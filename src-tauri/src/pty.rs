//! PTY 세션 관리 — portable-pty 기반.
//! 세션 로그 저장: 각 세션 stdout을 $APPCACHE/atelier/sessions/{id}.log에 append.
//! 탭을 닫았다 다시 열 때 이전 대화를 복원해 "처음부터" 시작 안 되도록.
//!
//! 프론트엔드(xterm.js) ↔ Tauri IPC ↔ shell 프로세스 연결:
//!   - `pty_spawn(profile, cols, rows)` → 세션 id 반환
//!   - `pty_write(id, data)`            → stdin 전송
//!   - `pty_resize(id, cols, rows)`     → 터미널 크기 변경
//!   - `pty_kill(id)`                   → 세션 종료
//!   - 이벤트 `pty://{id}/data`          → stdout 청크 방출
//!   - 이벤트 `pty://{id}/exit`          → 종료 코드

use std::ffi::OsString;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
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

/// 세션 로그 저장 디렉토리. macOS ~/Library/Caches/com.atelier.app/sessions.
/// 권한 0700 (소유자 전용). 앱 전용 캐시라 /tmp 대비 안전.
fn sessions_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    #[cfg(target_os = "macos")]
    let base = std::path::PathBuf::from(&home).join("Library/Caches/com.atelier.app");
    #[cfg(not(target_os = "macos"))]
    let base = std::path::PathBuf::from(&home).join(".cache/atelier");
    let dir = base.join("sessions");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn session_log_path(id: &str) -> std::path::PathBuf {
    // id는 UUID 형식이라 path traversal 위험 낮지만 방어적으로 sanitize.
    let safe: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    sessions_dir().join(format!("{safe}.log"))
}

const MAX_LOG_BYTES: u64 = 10 * 1024 * 1024; // 세션당 10MB 상한
const MAX_REPLAY_LOG_BYTES: usize = 512 * 1024; // 앱 시작 복원은 tail만 읽어 WebView freeze 방지

fn tail_bytes(bytes: &[u8], max_len: usize) -> &[u8] {
    if bytes.len() <= max_len {
        bytes
    } else {
        &bytes[bytes.len() - max_len..]
    }
}

/// 세션 로그 읽기. 복원 시 JS가 호출 → term.write(bytes)로 재생.
#[tauri::command]
pub async fn session_log_load(id: String) -> std::result::Result<String, String> {
    let p = session_log_path(&id);
    if !p.exists() {
        return Ok(String::new());
    }
    // base64 인코딩해 ANSI escape byte-exact 보존.
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    let bytes = std::fs::read(&p).map_err(|e| format!("session_log_load: {e}"))?;
    Ok(B64.encode(tail_bytes(&bytes, MAX_REPLAY_LOG_BYTES)))
}

/// 세션 로그 삭제.
#[tauri::command]
pub async fn session_log_clear(id: String) -> std::result::Result<(), String> {
    let p = session_log_path(&id);
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| format!("session_log_clear: {e}"))?;
    }
    Ok(())
}

/// 기존 "탭 id"를 새 탭에 연결하기 위한 hint — 새 탭이 이 id의 로그를 재생하도록.
/// 실제 구현은 JS 측에서 처리 (spawnTab 시 loaded hint).

fn state() -> Arc<PtyState> {
    STATE.get().expect("PtyState uninit").clone()
}

#[derive(Serialize, Clone)]
pub struct SpawnResult {
    pub id: String,
    pub profile: String,
    // 세션 로그 파일 id. 탭 persist/복원 시 같은 값을 재사용하면 누적 기록.
    pub log_id: String,
}

// PTY stdout 청크를 base64 문자열로 emit.
// Vec<u8>를 serde_json에 태우면 JSON 숫자 배열(`[72,101,...]`)로 직렬화되어
// 4096B 청크가 ~20KB JSON이 된다. claude CLI 같은 대량 출력 시 WebKit의
// JSON.parse + Array→Uint8Array 변환이 main thread를 수십~수백 ms 점유해
// UI 전체가 멈추는 현상이 보고됨. base64 문자열은 크기 1/4 + string parse가
// array parse 대비 수십 배 빠르다.
#[derive(Serialize, Clone)]
struct DataPayload {
    data: String,
}

#[derive(Serialize, Clone)]
struct ExitPayload {
    code: Option<i32>,
}

/// PATH + LANG 보강 — Finder 실행 시 LANG 비어 있어 native binary(claude 등)가 한국어 locale
/// 인식 못 함 → multi-byte UTF-8 입력 처리 미흡 → 한글 자모 화면 잔여. macOS Terminal.app은
/// login shell이 LANG 자동 설정하지만 Finder는 빈 env. TERM은 안 건드림 (xterm parser 깨짐 회피).
fn apply_path_env(cmd: &mut CommandBuilder) {
    #[cfg(not(windows))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let existing = std::env::var("PATH").unwrap_or_default();
        let base = if cfg!(target_os = "macos") {
            "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        } else {
            "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        };
        let path = if home.is_empty() {
            format!("{base}:{existing}")
        } else {
            format!("{home}/.claude/local:{home}/.local/bin:{home}/bin:{base}:{existing}")
        };
        cmd.env("PATH", path);
        cmd.env("LANG", "ko_KR.UTF-8");
        cmd.env("LC_CTYPE", "ko_KR.UTF-8");
        cmd.env("LC_ALL", "ko_KR.UTF-8");
        // TERM=xterm (256color 아닌 plain) — alternate buffer/sync output 등 고급 ANSI sequence
        // 덜 공격적으로 emit. atelier xterm.js가 처리 못 하는 sequence 회피. claude는 simpler
        // mode로 동작해 input echo redraw가 안정.
        cmd.env("TERM", "xterm");
        cmd.env("COLORTERM", "truecolor");
    }
}

/// PTY 자식 프로세스 공통 env 보강.
/// Finder에서 실행된 Tauri 앱은 TERM/PATH가 비어 있어 CLI가 no-color 모드로 떨어진다.
fn apply_default_env(cmd: &mut CommandBuilder) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    apply_path_env(cmd);
}

#[cfg(test)]
mod tests {
    use super::{split_command_line, tail_bytes};

    #[test]
    fn split_command_line_keeps_program_and_args_separate() {
        assert_eq!(
            split_command_line("claude --continue"),
            vec!["claude", "--continue"]
        );
    }

    #[test]
    fn split_command_line_preserves_quoted_arguments() {
        assert_eq!(
            split_command_line("/bin/zsh -lc 'echo hello world'"),
            vec!["/bin/zsh", "-lc", "echo hello world"]
        );
    }

    #[test]
    fn tail_bytes_limits_large_replay_logs() {
        let bytes: Vec<u8> = (0..200).map(|n| n as u8).collect();
        let out = tail_bytes(&bytes, 32);
        assert_eq!(out.len(), 32);
        assert_eq!(out[0], 168);
        assert_eq!(out[31], 199);
    }
}

fn split_command_line(input: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut chars = input.chars().peekable();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    while let Some(ch) = chars.next() {
        if escaped {
            cur.push(ch);
            escaped = false;
            continue;
        }
        match ch {
            '\\' if quote != Some('\'') => escaped = true,
            '\'' | '"' if quote == Some(ch) => quote = None,
            '\'' | '"' if quote.is_none() => quote = Some(ch),
            c if c.is_whitespace() && quote.is_none() => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
                while matches!(chars.peek(), Some(c) if c.is_whitespace()) {
                    chars.next();
                }
            }
            _ => cur.push(ch),
        }
    }

    if escaped {
        cur.push('\\');
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

fn command_from_line(line: &str) -> CommandBuilder {
    let parts = split_command_line(line);
    if parts.is_empty() {
        CommandBuilder::new_default_prog()
    } else if parts.len() == 1 {
        CommandBuilder::new(&parts[0])
    } else {
        CommandBuilder::from_argv(parts.into_iter().map(OsString::from).collect())
    }
}

/// 프로파일 id → 실제 실행 커맨드.
/// 플랫폼별 기본값은 컴파일 타임 `#[cfg(target_os = ...)]`로 분기된다.
fn profile_command(profile: &str) -> CommandBuilder {
    match profile {
        "claude" => {
            // claude 직접 spawn. LANG/TERM은 apply_path_env에서 설정 (한국어 locale + plain xterm).
            #[cfg(windows)]
            {
                let mut cmd = CommandBuilder::new("cmd.exe");
                cmd.arg("/c");
                cmd.arg("claude");
                if let Ok(home) = std::env::var("USERPROFILE") {
                    cmd.cwd(home);
                }
                cmd
            }
            #[cfg(not(windows))]
            {
                let mut cmd = CommandBuilder::new("claude");
                // Disable Claude's Chrome integration when embedded in Atelier. Chrome/App discovery can
                // trigger macOS App Data Isolation prompts attributed to the parent app.
                cmd.arg("--no-chrome");
                if let Ok(home) = std::env::var("HOME") {
                    cmd.cwd(home);
                }
                cmd
            }
        }
        "pwsh" => CommandBuilder::new("pwsh"),
        "bash" => CommandBuilder::new("bash"),
        "zsh" => CommandBuilder::new("zsh"),
        #[cfg(windows)]
        "cmd" => CommandBuilder::new("cmd.exe"),
        "node" => CommandBuilder::new("node"),
        // fallback: 그 외 id는 custom command line으로 해석. "claude --continue" 같은 문자열을
        // 실행 파일명 하나로 넘기지 않고 argv로 분리해 lazy spawn 시 실패하지 않게 한다.
        other => command_from_line(other),
    }
}

#[tauri::command]
pub async fn pty_spawn<R: Runtime>(
    app: AppHandle<R>,
    profile: String,
    cols: u16,
    rows: u16,
    log_id: Option<String>,
) -> std::result::Result<SpawnResult, String> {
    spawn_impl(app, profile, cols, rows, log_id).map_err(|e| e.to_string())
}

fn spawn_impl<R: Runtime>(
    app: AppHandle<R>,
    profile: String,
    cols: u16,
    rows: u16,
    log_id: Option<String>,
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

    let mut cmd = profile_command(&profile);
    // claude는 apply_path_env (PATH + LANG=ko_KR.UTF-8 + TERM=xterm) — UTF-8 한국어 + plain
    // xterm으로 alternate buffer 등 고급 ANSI sequence 회피. xterm-256color는 xterm.js parser
    // error 유발이라 사용 안 함. 그 외 profile은 표준 apply_default_env.
    if profile == "claude" {
        apply_path_env(&mut cmd);
    } else {
        apply_default_env(&mut cmd);
    }
    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| anyhow!("spawn failed for '{profile}': {e}"))?;
    drop(pair.slave);

    let id = Uuid::new_v4().to_string();
    // log_id는 탭 persist/복원 시 같은 값을 재사용하면 파일 누적.
    // 전달되지 않으면 탭 id와 동일하게 사용.
    let resolved_log_id = log_id.unwrap_or_else(|| id.clone());
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

    let id_reader = id.clone();
    let log_id_reader = resolved_log_id.clone();
    let app_reader = app.clone();
    // 세션 로그 파일 — $APPCACHE/sessions/{log_id}.log에 append-only.
    // log_id는 탭 persist/복원 시 같은 값 재사용 → 파일 누적. /tmp가 아닌 $APPCACHE(0600).
    thread::spawn(move || {
        use std::fs::OpenOptions;
        use std::io::Write as _;
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        let ev = format!("pty://{}/data", id_reader);
        let log_path = session_log_path(&log_id_reader);
        let mut log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .ok();
        // 파일 권한 0600.
        #[cfg(unix)]
        if let Ok(meta) = std::fs::metadata(&log_path) {
            use std::os::unix::fs::PermissionsExt;
            let mut p = meta.permissions();
            p.set_mode(0o600);
            let _ = std::fs::set_permissions(&log_path, p);
        }
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = &buf[..n];
                    if let Some(f) = log_file.as_mut() {
                        // 파일 상한 검사. 넘으면 잘라내고 재생성.
                        if let Ok(meta) = f.metadata() {
                            if meta.len() > MAX_LOG_BYTES {
                                drop(log_file.take());
                                let _ = std::fs::remove_file(&log_path);
                                log_file = OpenOptions::new()
                                    .create(true)
                                    .append(true)
                                    .open(&log_path)
                                    .ok();
                            }
                        }
                        if let Some(f2) = log_file.as_mut() {
                            let _ = f2.write_all(chunk);
                            // flush는 성능상 하지 않음 — OS가 알아서. 파일 쓰기 보장은 close에서.
                        }
                    }
                    let encoded = B64.encode(chunk);
                    let _ = app_reader.emit(&ev, DataPayload { data: encoded });
                }
                Err(e) => {
                    log::warn!("pty read error: {e}");
                    break;
                }
            }
        }
        drop(log_file);
        drop(reader);
    });

    // 자식 대기 스레드 — 종료 코드 전송 + 세션 정리.
    // 자식 wait()가 반환되면 PTY slave도 닫혀 reader 루프가 EOF(Ok(0))로 자연 종료.
    let id_wait = id.clone();
    let app_wait = app.clone();
    thread::spawn(move || {
        let ev = format!("pty://{}/exit", id_wait);
        let code = child
            .wait()
            .ok()
            .and_then(|s| s.exit_code().try_into().ok());
        let _ = app_wait.emit(&ev, ExitPayload { code });
        state().sessions.remove(&id_wait);
        drop(child);
    });

    Ok(SpawnResult {
        id,
        profile,
        log_id: resolved_log_id,
    })
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
