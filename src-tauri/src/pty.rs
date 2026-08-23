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

use std::collections::VecDeque;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc::sync_channel,
    Arc, Mutex,
};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use dashmap::DashMap;
use once_cell::sync::OnceCell;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use uuid::Uuid;

use crate::credentials::{
    gajecode_cache_dir, gajecode_config_dir, gajecode_data_dir, gajecode_executable_path,
    gajecode_home_dir, gajecode_runtime_path_env, gajecode_skills_dir, gajecode_workspace_dir,
    grok_executable_path, grok_home_dir, grok_provider_root, read_agent_api_key,
};
use crate::pty_output::{forward_output_batches, PTY_OUTPUT_QUEUE_DEPTH, PTY_READ_CHUNK_BYTES};

struct Session {
    writer: Arc<std::sync::Mutex<Box<dyn Write + Send>>>,
    master: Arc<std::sync::Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    child_killer: Arc<std::sync::Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
    profile: String,
    log_id: String,
    transport: Arc<PtyTransportMetrics>,
    output_journal: Arc<PtyOutputJournal>,
    running: Arc<AtomicBool>,
    exit_code: Arc<Mutex<Option<i32>>>,
}

const PTY_OUTPUT_REPLAY_MAX_BYTES: usize = 1024 * 1024;

#[derive(Clone)]
struct PtyOutputFrame {
    sequence: u64,
    data: Vec<u8>,
}

struct PtyOutputJournalInner {
    frames: VecDeque<PtyOutputFrame>,
    bytes: usize,
}

struct PtyOutputJournal {
    next_sequence: AtomicU64,
    acknowledged_sequence: AtomicU64,
    max_bytes: usize,
    inner: Mutex<PtyOutputJournalInner>,
}

impl PtyOutputJournal {
    fn new() -> Self {
        Self::with_max_bytes(PTY_OUTPUT_REPLAY_MAX_BYTES)
    }

    fn with_max_bytes(max_bytes: usize) -> Self {
        Self {
            next_sequence: AtomicU64::new(0),
            acknowledged_sequence: AtomicU64::new(0),
            max_bytes: max_bytes.max(1),
            inner: Mutex::new(PtyOutputJournalInner {
                frames: VecDeque::new(),
                bytes: 0,
            }),
        }
    }

    fn record(&self, data: &[u8]) -> u64 {
        let sequence = self.next_sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let Ok(mut inner) = self.inner.lock() else {
            return sequence;
        };
        inner.bytes = inner.bytes.saturating_add(data.len());
        inner.frames.push_back(PtyOutputFrame {
            sequence,
            data: data.to_vec(),
        });
        while inner.bytes > self.max_bytes && inner.frames.len() > 1 {
            if let Some(removed) = inner.frames.pop_front() {
                inner.bytes = inner.bytes.saturating_sub(removed.data.len());
            }
        }
        sequence
    }

    fn acknowledge(&self, sequence: u64) -> u64 {
        let latest = self.next_sequence.load(Ordering::Relaxed);
        let bounded = sequence.min(latest);
        self.acknowledged_sequence
            .fetch_max(bounded, Ordering::Relaxed);
        self.acknowledged_sequence.load(Ordering::Relaxed)
    }

    fn status(&self) -> PtyOutputJournalStatus {
        let latest_sequence = self.next_sequence.load(Ordering::Relaxed);
        let acknowledged_sequence = self.acknowledged_sequence.load(Ordering::Relaxed);
        let first_available_sequence = self
            .inner
            .lock()
            .ok()
            .and_then(|inner| inner.frames.front().map(|frame| frame.sequence))
            .unwrap_or_else(|| latest_sequence.saturating_add(1));
        PtyOutputJournalStatus {
            first_available_sequence,
            latest_sequence,
            acknowledged_sequence,
        }
    }

    fn snapshot(&self, after_sequence: u64) -> PtyOutputSnapshot {
        let latest_sequence = self.next_sequence.load(Ordering::Relaxed);
        let acknowledged_sequence = self.acknowledged_sequence.load(Ordering::Relaxed);
        let Ok(inner) = self.inner.lock() else {
            return PtyOutputSnapshot {
                first_available_sequence: latest_sequence.saturating_add(1),
                latest_sequence,
                acknowledged_sequence,
                truncated: false,
                frames: Vec::new(),
            };
        };
        let first_available_sequence = inner
            .frames
            .front()
            .map(|frame| frame.sequence)
            .unwrap_or_else(|| latest_sequence.saturating_add(1));
        let truncated = first_available_sequence > after_sequence.saturating_add(1);
        let frames = inner
            .frames
            .iter()
            .filter(|frame| frame.sequence > after_sequence)
            .map(|frame| PtyOutputFramePayload {
                sequence: frame.sequence,
                data: B64.encode(&frame.data),
            })
            .collect();
        PtyOutputSnapshot {
            first_available_sequence,
            latest_sequence,
            acknowledged_sequence,
            truncated,
            frames,
        }
    }
}

struct PtyTransportMetrics {
    bytes_read: AtomicU64,
    bytes_emitted: AtomicU64,
    queued_bytes: AtomicU64,
    max_queued_bytes: AtomicU64,
    batches_emitted: AtomicU64,
    bridge_dropped_bytes: AtomicU64,
    started_at_ms: u64,
    last_activity_ms: AtomicU64,
}

impl PtyTransportMetrics {
    fn new() -> Self {
        let now = epoch_millis();
        Self {
            bytes_read: AtomicU64::new(0),
            bytes_emitted: AtomicU64::new(0),
            queued_bytes: AtomicU64::new(0),
            max_queued_bytes: AtomicU64::new(0),
            batches_emitted: AtomicU64::new(0),
            bridge_dropped_bytes: AtomicU64::new(0),
            started_at_ms: now,
            last_activity_ms: AtomicU64::new(now),
        }
    }

    fn mark_read(&self, bytes: usize) {
        let bytes = bytes as u64;
        self.bytes_read.fetch_add(bytes, Ordering::Relaxed);
        let queued = self.queued_bytes.fetch_add(bytes, Ordering::Relaxed) + bytes;
        self.max_queued_bytes.fetch_max(queued, Ordering::Relaxed);
        self.last_activity_ms
            .store(epoch_millis(), Ordering::Relaxed);
    }

    fn mark_emitted(&self, bytes: usize) {
        let bytes = bytes as u64;
        self.queued_bytes.fetch_sub(bytes, Ordering::Relaxed);
        self.bytes_emitted.fetch_add(bytes, Ordering::Relaxed);
        self.batches_emitted.fetch_add(1, Ordering::Relaxed);
        self.last_activity_ms
            .store(epoch_millis(), Ordering::Relaxed);
    }

    fn mark_bridge_drop(&self, bytes: usize) {
        let bytes = bytes as u64;
        self.queued_bytes.fetch_sub(bytes, Ordering::Relaxed);
        self.bridge_dropped_bytes
            .fetch_add(bytes, Ordering::Relaxed);
        self.last_activity_ms
            .store(epoch_millis(), Ordering::Relaxed);
    }

    fn snapshot(&self) -> PtyTransportSnapshot {
        PtyTransportSnapshot {
            bytes_read: self.bytes_read.load(Ordering::Relaxed),
            bytes_emitted: self.bytes_emitted.load(Ordering::Relaxed),
            queued_bytes: self.queued_bytes.load(Ordering::Relaxed),
            max_queued_bytes: self.max_queued_bytes.load(Ordering::Relaxed),
            batches_emitted: self.batches_emitted.load(Ordering::Relaxed),
            bridge_dropped_bytes: self.bridge_dropped_bytes.load(Ordering::Relaxed),
            started_at_ms: self.started_at_ms,
            last_activity_ms: self.last_activity_ms.load(Ordering::Relaxed),
        }
    }
}

fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

pub(crate) struct PtyState {
    sessions: DashMap<String, Session>,
    retain_completed: bool,
}

static STATE: OnceCell<Arc<PtyState>> = OnceCell::new();

pub fn init_state() {
    let _ = STATE.set(new_runtime(false));
}

pub(crate) fn new_runtime(retain_completed: bool) -> Arc<PtyState> {
    Arc::new(PtyState {
        sessions: DashMap::new(),
        retain_completed,
    })
}

/// 세션 로그 저장 디렉토리. macOS ~/Library/Caches/com.atelier.app/sessions.
/// 권한 0700 (소유자 전용). 앱 전용 캐시라 /tmp 대비 안전.
fn sessions_dir() -> std::path::PathBuf {
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Library/Caches/com.atelier.app");
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Atelier/Cache");
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let base = std::env::var_os("XDG_CACHE_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|home| std::path::PathBuf::from(home).join(".cache"))
        })
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("atelier");
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

#[derive(Serialize, Clone)]
pub struct SessionLogSnapshot {
    log_id: String,
    data: String,
    total_bytes: u64,
    replay_bytes: usize,
    truncated: bool,
}

fn read_session_log_snapshot(id: &str) -> std::result::Result<SessionLogSnapshot, String> {
    let p = session_log_path(id);
    if !p.exists() {
        return Ok(SessionLogSnapshot {
            log_id: id.to_string(),
            data: String::new(),
            total_bytes: 0,
            replay_bytes: 0,
            truncated: false,
        });
    }
    // base64 인코딩해 ANSI escape byte-exact 보존.
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    let bytes = std::fs::read(&p).map_err(|e| format!("session_log_load: {e}"))?;
    let replay = tail_bytes(&bytes, MAX_REPLAY_LOG_BYTES);
    Ok(SessionLogSnapshot {
        log_id: id.to_string(),
        data: B64.encode(replay),
        total_bytes: bytes.len() as u64,
        replay_bytes: replay.len(),
        truncated: bytes.len() > replay.len(),
    })
}

/// 세션 로그 읽기. 복원 시 JS가 호출 → term.write(bytes)로 재생.
#[tauri::command]
pub async fn session_log_load(id: String) -> std::result::Result<String, String> {
    read_session_log_snapshot(&id).map(|snapshot| snapshot.data)
}

/// 세션 재연결 진단용 snapshot. 기존 replay payload와 전체 로그 상태를 함께 반환한다.
#[tauri::command]
pub async fn session_log_snapshot(id: String) -> std::result::Result<SessionLogSnapshot, String> {
    read_session_log_snapshot(&id)
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

#[derive(Serialize, Deserialize, Clone)]
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
    sequence: u64,
    data: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PtyOutputFramePayload {
    pub sequence: u64,
    pub data: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub struct PtyOutputJournalStatus {
    pub first_available_sequence: u64,
    pub latest_sequence: u64,
    pub acknowledged_sequence: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PtyOutputSnapshot {
    pub first_available_sequence: u64,
    pub latest_sequence: u64,
    pub acknowledged_sequence: u64,
    pub truncated: bool,
    pub frames: Vec<PtyOutputFramePayload>,
}

#[derive(Serialize, Clone)]
struct ExitPayload {
    code: Option<i32>,
}

pub(crate) type PtyOutputSink = Arc<dyn Fn(&str, u64, &[u8]) -> bool + Send + Sync>;
pub(crate) type PtyExitSink = Arc<dyn Fn(&str, Option<i32>) + Send + Sync>;

/// PATH + LANG 보강 — Finder 실행 시 LANG 비어 있어 native binary(claude 등)가 한국어 locale
/// 인식 못 함 → multi-byte UTF-8 입력 처리 미흡 → 한글 자모 화면 잔여. macOS Terminal.app은
/// login shell이 LANG 자동 설정하지만 Finder는 빈 env. TERM은 안 건드림 (xterm parser 깨짐 회피).
fn apply_path_env(cmd: &mut CommandBuilder) {
    #[cfg(windows)]
    let _ = cmd;

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
    use super::{
        is_gajecode_profile, split_command_line, tail_bytes, PtyOutputJournal, PtyTransportMetrics,
    };
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

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
    fn gajecode_terminal_profile_accepts_ui_command_aliases() {
        assert!(is_gajecode_profile("gajecode"));
        assert!(is_gajecode_profile("gjc"));
        assert!(is_gajecode_profile(" Gajae-Code "));
        assert!(!is_gajecode_profile("gjc --help"));
        assert!(!is_gajecode_profile("claude"));
    }

    #[test]
    fn tail_bytes_limits_large_replay_logs() {
        let bytes: Vec<u8> = (0..200).map(|n| n as u8).collect();
        let out = tail_bytes(&bytes, 32);
        assert_eq!(out.len(), 32);
        assert_eq!(out[0], 168);
        assert_eq!(out[31], 199);
    }

    #[test]
    fn transport_metrics_reconcile_emitted_and_dropped_bytes() {
        let metrics = PtyTransportMetrics::new();
        metrics.mark_read(12);
        metrics.mark_read(8);
        metrics.mark_emitted(16);
        metrics.mark_bridge_drop(4);

        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.bytes_read, 20);
        assert_eq!(snapshot.bytes_emitted, 16);
        assert_eq!(snapshot.queued_bytes, 0);
        assert_eq!(snapshot.max_queued_bytes, 20);
        assert_eq!(snapshot.batches_emitted, 1);
        assert_eq!(snapshot.bridge_dropped_bytes, 4);
        assert!(snapshot.last_activity_ms >= snapshot.started_at_ms);
    }

    #[test]
    fn output_journal_sequences_snapshots_and_acknowledges_monotonically() {
        let journal = PtyOutputJournal::with_max_bytes(64);
        assert_eq!(journal.record(b"first"), 1);
        assert_eq!(journal.record(b"second"), 2);

        let snapshot = journal.snapshot(1);
        assert!(!snapshot.truncated);
        assert_eq!(snapshot.first_available_sequence, 1);
        assert_eq!(snapshot.latest_sequence, 2);
        assert_eq!(snapshot.frames.len(), 1);
        assert_eq!(snapshot.frames[0].sequence, 2);
        assert_eq!(B64.decode(&snapshot.frames[0].data).unwrap(), b"second");

        assert_eq!(journal.acknowledge(1), 1);
        assert_eq!(journal.acknowledge(0), 1);
        assert_eq!(journal.acknowledge(99), 2);
        assert_eq!(journal.status().acknowledged_sequence, 2);
    }

    #[test]
    fn output_journal_reports_when_requested_history_was_evicted() {
        let journal = PtyOutputJournal::with_max_bytes(5);
        journal.record(b"aaaa");
        journal.record(b"bbbb");

        let snapshot = journal.snapshot(0);
        assert!(snapshot.truncated);
        assert_eq!(snapshot.first_available_sequence, 2);
        assert_eq!(snapshot.latest_sequence, 2);
        assert_eq!(snapshot.frames.len(), 1);
        assert_eq!(B64.decode(&snapshot.frames[0].data).unwrap(), b"bbbb");
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

fn path_string(path: &std::path::Path) -> String {
    path.to_string_lossy().to_string()
}

fn is_gajecode_profile(profile: &str) -> bool {
    matches!(
        profile.trim().to_ascii_lowercase().as_str(),
        "gajecode" | "gjc" | "gajae-code"
    )
}

fn gajecode_pty_command() -> Result<CommandBuilder> {
    let executable = gajecode_executable_path().ok_or_else(|| {
        anyhow!(
            "가재코드 CLI가 설치되어 있지 않습니다. 설정 > 연결에서 자동 설치를 먼저 실행하세요."
        )
    })?;
    let home = gajecode_home_dir().ok_or_else(|| anyhow!("resolve gajecode HOME"))?;
    let workspace =
        gajecode_workspace_dir().ok_or_else(|| anyhow!("resolve gajecode workspace"))?;
    let skills = gajecode_skills_dir().ok_or_else(|| anyhow!("resolve gajecode skills"))?;
    let config = gajecode_config_dir().ok_or_else(|| anyhow!("resolve gajecode config"))?;
    let data = gajecode_data_dir().ok_or_else(|| anyhow!("resolve gajecode data"))?;
    let cache = gajecode_cache_dir().ok_or_else(|| anyhow!("resolve gajecode cache"))?;
    let bun_install = crate::credentials::gajecode_provider_root()
        .ok_or_else(|| anyhow!("resolve gajecode root"))?
        .join("bun");
    for dir in [&home, &workspace, &skills, &config, &data, &cache] {
        std::fs::create_dir_all(dir).map_err(|e| anyhow!("create {}: {e}", dir.display()))?;
    }
    std::fs::create_dir_all(&bun_install)
        .map_err(|e| anyhow!("create {}: {e}", bun_install.display()))?;

    #[cfg(windows)]
    let mut cmd = {
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.arg("/D");
        cmd.arg("/Q");
        cmd.arg("/C");
        cmd.arg(path_string(&executable));
        cmd
    };

    #[cfg(not(windows))]
    let mut cmd = CommandBuilder::new(path_string(&executable));

    cmd.cwd(path_string(&workspace));
    cmd.env("PATH", gajecode_runtime_path_env());
    cmd.env("HOME", path_string(&home));
    cmd.env("USERPROFILE", path_string(&home));
    cmd.env("XDG_CONFIG_HOME", path_string(&config));
    cmd.env("XDG_DATA_HOME", path_string(&data));
    cmd.env("XDG_CACHE_HOME", path_string(&cache));
    cmd.env("BUN_INSTALL", path_string(&bun_install));
    cmd.env("GJC_HOME", path_string(&home.join(".gjc")));
    cmd.env("GAJAE_CODE_HOME", path_string(&home.join(".gjc")));
    cmd.env(
        "GJC_CODING_AGENT_DIR",
        path_string(&home.join(".gjc").join("agent")),
    );
    cmd.env("ATELIER_PROVIDER_ID", "gajecode");
    cmd.env("ATELIER_SKILLS_DIR", path_string(&skills));
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "ko_KR.UTF-8");
    cmd.env("LC_CTYPE", "ko_KR.UTF-8");
    Ok(cmd)
}

fn is_grok_profile(profile: &str) -> bool {
    matches!(
        profile.trim().to_ascii_lowercase().as_str(),
        "grok" | "grok-build" | "xai"
    )
}

fn grok_pty_command() -> Result<CommandBuilder> {
    let executable = grok_executable_path().ok_or_else(|| {
        anyhow!("Grok CLI가 설치되어 있지 않습니다. 설정 > 연결에서 자동 설치를 먼저 실행하세요.")
    })?;
    let root = grok_provider_root().ok_or_else(|| anyhow!("resolve Grok root"))?;
    let home = grok_home_dir().ok_or_else(|| anyhow!("resolve Grok HOME"))?;
    let config = root.join("state/config");
    let data = root.join("state/data");
    let cache = root.join("cache");
    let temp = root.join("tmp");
    for dir in [&home, &config, &data, &cache, &temp] {
        std::fs::create_dir_all(dir)
            .map_err(|error| anyhow!("create {}: {error}", dir.display()))?;
    }
    let mut cmd = CommandBuilder::new(path_string(&executable));
    cmd.cwd(path_string(&home));
    cmd.env("PATH", crate::augmented_cli_path());
    cmd.env("HOME", path_string(&home));
    cmd.env("USERPROFILE", path_string(&home));
    cmd.env("XDG_CONFIG_HOME", path_string(&config));
    cmd.env("XDG_DATA_HOME", path_string(&data));
    cmd.env("XDG_CACHE_HOME", path_string(&cache));
    cmd.env("TMPDIR", path_string(&temp));
    cmd.env("ATELIER_PROVIDER_ID", "grok");
    if let Some(api_key) = read_agent_api_key("grok") {
        cmd.env("XAI_API_KEY", api_key);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "ko_KR.UTF-8");
    cmd.env("LC_CTYPE", "ko_KR.UTF-8");
    Ok(cmd)
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
    match crate::pty_supervisor::spawn(app.clone(), profile.clone(), cols, rows, log_id.clone()) {
        Ok(result) => Ok(result),
        Err(error) => {
            log::warn!("detached PTY supervisor unavailable, using in-process fallback: {error}");
            spawn_impl(app, profile, cols, rows, log_id).map_err(|e| e.to_string())
        }
    }
}

fn spawn_impl<R: Runtime>(
    app: AppHandle<R>,
    profile: String,
    cols: u16,
    rows: u16,
    log_id: Option<String>,
) -> Result<SpawnResult> {
    let data_app = app.clone();
    let output_sink: PtyOutputSink = Arc::new(move |id, sequence, bytes| {
        data_app
            .emit(
                &format!("pty://{id}/data"),
                DataPayload {
                    sequence,
                    data: B64.encode(bytes),
                },
            )
            .is_ok()
    });
    let exit_app = app;
    let exit_sink: PtyExitSink = Arc::new(move |id, code| {
        let _ = exit_app.emit(&format!("pty://{id}/exit"), ExitPayload { code });
    });
    runtime_spawn(
        state(),
        profile,
        cols,
        rows,
        log_id,
        Some(output_sink),
        Some(exit_sink),
    )
}

pub(crate) fn runtime_spawn(
    runtime: Arc<PtyState>,
    profile: String,
    cols: u16,
    rows: u16,
    log_id: Option<String>,
    output_sink: Option<PtyOutputSink>,
    exit_sink: Option<PtyExitSink>,
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

    let is_gajecode = is_gajecode_profile(&profile);
    let is_grok = is_grok_profile(&profile);
    let mut cmd = if is_gajecode {
        gajecode_pty_command()?
    } else if is_grok {
        grok_pty_command()?
    } else {
        profile_command(&profile)
    };
    // claude는 apply_path_env (PATH + LANG=ko_KR.UTF-8 + TERM=xterm) — UTF-8 한국어 + plain
    // xterm으로 alternate buffer 등 고급 ANSI sequence 회피. xterm-256color는 xterm.js parser
    // error 유발이라 사용 안 함. 그 외 profile은 표준 apply_default_env.
    if is_gajecode || is_grok {
        // Already configured with an isolated HOME/workspace/skills directory.
    } else if profile == "claude" {
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
    let transport = Arc::new(PtyTransportMetrics::new());
    let output_journal = Arc::new(PtyOutputJournal::new());

    let running = Arc::new(AtomicBool::new(true));
    let exit_code = Arc::new(Mutex::new(None));
    let session = Session {
        writer: Arc::new(std::sync::Mutex::new(writer)),
        master: Arc::new(std::sync::Mutex::new(pair.master)),
        child_killer: Arc::new(std::sync::Mutex::new(killer)),
        profile: profile.clone(),
        log_id: resolved_log_id.clone(),
        transport: Arc::clone(&transport),
        output_journal: Arc::clone(&output_journal),
        running: Arc::clone(&running),
        exit_code: Arc::clone(&exit_code),
    };
    runtime.sessions.insert(id.clone(), session);

    let id_reader = id.clone();
    let log_id_reader = resolved_log_id.clone();
    let transport_emitter = Arc::clone(&transport);
    let output_journal_emitter = Arc::clone(&output_journal);
    let output_sink_emitter = output_sink;
    let (output_sender, output_receiver) = sync_channel::<Vec<u8>>(PTY_OUTPUT_QUEUE_DEPTH);

    thread::spawn(move || {
        forward_output_batches(output_receiver, |batch| {
            let batch_len = batch.len();
            let sequence = output_journal_emitter.record(&batch);
            let emitted = output_sink_emitter
                .as_ref()
                .map(|sink| sink(&id_reader, sequence, &batch))
                .unwrap_or(true);
            if emitted {
                transport_emitter.mark_emitted(batch_len);
            } else {
                transport_emitter.mark_bridge_drop(batch_len);
            }
        });
    });

    // 세션 로그 파일 — $APPCACHE/sessions/{log_id}.log에 append-only.
    // log_id는 탭 persist/복원 시 같은 값 재사용 → 파일 누적. /tmp가 아닌 $APPCACHE(0600).
    thread::spawn(move || {
        use std::fs::OpenOptions;
        use std::io::Write as _;
        let mut reader = reader;
        let mut buf = [0u8; PTY_READ_CHUNK_BYTES];
        let mut output_sender = Some(output_sender);
        let transport_reader = Arc::clone(&transport);
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
                    transport_reader.mark_read(n);
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
                    match output_sender.as_ref() {
                        Some(sender) if sender.send(chunk.to_vec()).is_err() => {
                            // Keep draining the PTY and writing its local log even
                            // when the renderer/event bridge has gone away.
                            output_sender = None;
                            transport_reader.mark_bridge_drop(n);
                        }
                        Some(_) => {}
                        None => transport_reader.mark_bridge_drop(n),
                    }
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
    let runtime_wait = Arc::clone(&runtime);
    let running_wait = Arc::clone(&running);
    let exit_code_wait = Arc::clone(&exit_code);
    thread::spawn(move || {
        let code = child
            .wait()
            .ok()
            .and_then(|s| s.exit_code().try_into().ok());
        running_wait.store(false, Ordering::Relaxed);
        if let Ok(mut slot) = exit_code_wait.lock() {
            *slot = code;
        }
        if let Some(sink) = exit_sink {
            sink(&id_wait, code);
        }
        if !runtime_wait.retain_completed {
            runtime_wait.sessions.remove(&id_wait);
        }
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
    if let Some(result) = crate::pty_supervisor::write(&id, &data) {
        return result;
    }
    runtime_write(&state(), &id, &data)
}

pub(crate) fn runtime_write(
    runtime: &Arc<PtyState>,
    id: &str,
    data: &str,
) -> std::result::Result<(), String> {
    let sess = runtime
        .sessions
        .get(id)
        .ok_or_else(|| format!("session {id} not found"))?;
    let mut w = sess.writer.lock().map_err(|e| e.to_string())?;
    w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn pty_resize(id: String, cols: u16, rows: u16) -> std::result::Result<(), String> {
    if let Some(result) = crate::pty_supervisor::resize(&id, cols, rows) {
        return result;
    }
    runtime_resize(&state(), &id, cols, rows)
}

pub(crate) fn runtime_resize(
    runtime: &Arc<PtyState>,
    id: &str,
    cols: u16,
    rows: u16,
) -> std::result::Result<(), String> {
    let sess = runtime
        .sessions
        .get(id)
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
    if let Some(result) = crate::pty_supervisor::kill(&id) {
        return result;
    }
    runtime_kill(&state(), &id)
}

pub(crate) fn runtime_kill(runtime: &Arc<PtyState>, id: &str) -> std::result::Result<(), String> {
    if let Some((_, sess)) = runtime.sessions.remove(id) {
        if sess.running.load(Ordering::Relaxed) {
            let mut k = sess.child_killer.lock().map_err(|e| e.to_string())?;
            k.kill().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SessionInfo {
    pub id: String,
    pub profile: String,
    pub log_id: String,
    pub transport: PtyTransportSnapshot,
    pub output: PtyOutputJournalStatus,
    pub running: bool,
    pub exit_code: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub struct PtyTransportSnapshot {
    pub bytes_read: u64,
    pub bytes_emitted: u64,
    pub queued_bytes: u64,
    pub max_queued_bytes: u64,
    pub batches_emitted: u64,
    pub bridge_dropped_bytes: u64,
    pub started_at_ms: u64,
    pub last_activity_ms: u64,
}

#[tauri::command]
pub async fn pty_list<R: Runtime>(app: AppHandle<R>) -> Vec<SessionInfo> {
    let mut sessions = crate::pty_supervisor::list(app).unwrap_or_default();
    sessions.extend(runtime_list(&state()));
    sessions
}

pub(crate) fn runtime_list(runtime: &Arc<PtyState>) -> Vec<SessionInfo> {
    runtime
        .sessions
        .iter()
        .map(|r| SessionInfo {
            id: r.key().clone(),
            profile: r.value().profile.clone(),
            log_id: r.value().log_id.clone(),
            transport: r.value().transport.snapshot(),
            output: r.value().output_journal.status(),
            running: r.value().running.load(Ordering::Relaxed),
            exit_code: r.value().exit_code.lock().ok().and_then(|code| *code),
        })
        .collect()
}

pub(crate) fn runtime_info(runtime: &Arc<PtyState>, id: &str) -> Option<SessionInfo> {
    runtime.sessions.get(id).map(|session| SessionInfo {
        id: id.to_string(),
        profile: session.profile.clone(),
        log_id: session.log_id.clone(),
        transport: session.transport.snapshot(),
        output: session.output_journal.status(),
        running: session.running.load(Ordering::Relaxed),
        exit_code: session.exit_code.lock().ok().and_then(|code| *code),
    })
}

pub(crate) fn runtime_has_running_sessions(runtime: &Arc<PtyState>) -> bool {
    runtime
        .sessions
        .iter()
        .any(|session| session.running.load(Ordering::Relaxed))
}

#[tauri::command]
pub async fn pty_output_snapshot(
    id: String,
    after_sequence: Option<u64>,
) -> std::result::Result<PtyOutputSnapshot, String> {
    if let Some(result) = crate::pty_supervisor::snapshot(&id, after_sequence.unwrap_or_default()) {
        return result;
    }
    runtime_output_snapshot(&state(), &id, after_sequence.unwrap_or_default())
}

pub(crate) fn runtime_output_snapshot(
    runtime: &Arc<PtyState>,
    id: &str,
    after_sequence: u64,
) -> std::result::Result<PtyOutputSnapshot, String> {
    let session = runtime
        .sessions
        .get(id)
        .ok_or_else(|| format!("session {id} not found"))?;
    Ok(session.output_journal.snapshot(after_sequence))
}

#[tauri::command]
pub async fn pty_ack(id: String, sequence: u64) -> std::result::Result<u64, String> {
    if let Some(result) = crate::pty_supervisor::acknowledge(&id, sequence) {
        return result;
    }
    runtime_ack(&state(), &id, sequence)
}

pub(crate) fn runtime_ack(
    runtime: &Arc<PtyState>,
    id: &str,
    sequence: u64,
) -> std::result::Result<u64, String> {
    let session = runtime
        .sessions
        .get(id)
        .ok_or_else(|| format!("session {id} not found"))?;
    Ok(session.output_journal.acknowledge(sequence))
}
