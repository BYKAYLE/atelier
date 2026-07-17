use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use once_cell::sync::Lazy;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime};
use uuid::Uuid;

use crate::pty::{
    new_runtime, runtime_ack, runtime_has_running_sessions, runtime_info, runtime_kill,
    runtime_list, runtime_output_snapshot, runtime_resize, runtime_spawn, runtime_write,
    PtyOutputSnapshot, SessionInfo, SpawnResult,
};

const PROTOCOL_VERSION: u32 = 1;
const MAX_REQUEST_BYTES: u64 = 2 * 1024 * 1024;
const SUPERVISOR_IDLE_TIMEOUT: Duration = Duration::from_secs(300);
const START_TIMEOUT: Duration = Duration::from_secs(5);

static START_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static CLIENT_CACHE: Lazy<Mutex<Option<SupervisorClient>>> = Lazy::new(|| Mutex::new(None));
static REMOTE_SESSIONS: Lazy<DashMap<String, ()>> = Lazy::new(DashMap::new);
static REMOTE_RELAYS: Lazy<DashMap<String, ()>> = Lazy::new(DashMap::new);

#[derive(Clone, Serialize, Deserialize)]
struct SupervisorDescriptor {
    protocol: u32,
    pid: u32,
    port: u16,
    token: String,
    started_at_ms: u64,
}

#[derive(Serialize, Deserialize)]
struct RequestEnvelope {
    token: String,
    request: SupervisorRequest,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SupervisorRequest {
    Ping,
    Spawn {
        profile: String,
        cols: u16,
        rows: u16,
        log_id: Option<String>,
    },
    Write {
        id: String,
        data: String,
    },
    Resize {
        id: String,
        cols: u16,
        rows: u16,
    },
    Kill {
        id: String,
    },
    List,
    Info {
        id: String,
    },
    Snapshot {
        id: String,
        after_sequence: u64,
    },
    Ack {
        id: String,
        sequence: u64,
    },
}

#[derive(Serialize, Deserialize)]
struct SupervisorResponse {
    ok: bool,
    data: Value,
    error: Option<String>,
}

#[derive(Clone)]
struct SupervisorClient {
    descriptor: SupervisorDescriptor,
}

#[derive(Serialize, Clone)]
struct RelayDataPayload {
    sequence: u64,
    data: String,
}

#[derive(Serialize, Clone)]
struct RelayExitPayload {
    code: Option<i32>,
}

fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn supervisor_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Library/Caches/com.atelier.app");

    #[cfg(target_os = "windows")]
    let base = std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Atelier");

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let base = std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache")))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("atelier");

    let dir = base.join("pty-supervisor");
    let _ = fs::create_dir_all(&dir);
    restrict_dir(&dir);
    dir
}

fn descriptor_path() -> PathBuf {
    supervisor_dir().join("endpoint.json")
}

#[cfg(unix)]
fn restrict_dir(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = fs::metadata(path) {
        let mut permissions = meta.permissions();
        permissions.set_mode(0o700);
        let _ = fs::set_permissions(path, permissions);
    }
}

#[cfg(not(unix))]
fn restrict_dir(_: &Path) {}

#[cfg(unix)]
fn restrict_file(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = fs::metadata(path) {
        let mut permissions = meta.permissions();
        permissions.set_mode(0o600);
        let _ = fs::set_permissions(path, permissions);
    }
}

#[cfg(not(unix))]
fn restrict_file(_: &Path) {}

fn write_descriptor(path: &Path, descriptor: &SupervisorDescriptor) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "supervisor descriptor has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("create supervisor dir: {error}"))?;
    restrict_dir(parent);
    let temp = path.with_extension(format!("{}.tmp", std::process::id()));
    let bytes = serde_json::to_vec(descriptor)
        .map_err(|error| format!("encode supervisor descriptor: {error}"))?;
    fs::write(&temp, bytes).map_err(|error| format!("write supervisor descriptor: {error}"))?;
    restrict_file(&temp);
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("replace stale supervisor descriptor: {error}"))?;
    }
    fs::rename(&temp, path).map_err(|error| format!("publish supervisor descriptor: {error}"))?;
    restrict_file(path);
    Ok(())
}

fn load_descriptor() -> Result<SupervisorDescriptor, String> {
    let bytes = fs::read(descriptor_path())
        .map_err(|error| format!("read supervisor descriptor: {error}"))?;
    let descriptor: SupervisorDescriptor = serde_json::from_slice(&bytes)
        .map_err(|error| format!("decode supervisor descriptor: {error}"))?;
    if descriptor.protocol != PROTOCOL_VERSION || descriptor.token.len() < 32 {
        return Err("unsupported or invalid PTY supervisor descriptor".to_string());
    }
    Ok(descriptor)
}

impl SupervisorClient {
    fn connect(descriptor: SupervisorDescriptor) -> Result<Self, String> {
        let client = Self { descriptor };
        let pong: bool = client.request(SupervisorRequest::Ping)?;
        if !pong {
            return Err("PTY supervisor ping was rejected".to_string());
        }
        Ok(client)
    }

    fn request<T: DeserializeOwned>(&self, request: SupervisorRequest) -> Result<T, String> {
        let address = SocketAddr::from(([127, 0, 0, 1], self.descriptor.port));
        let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(800))
            .map_err(|error| format!("connect PTY supervisor: {error}"))?;
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .map_err(|error| format!("set PTY supervisor read timeout: {error}"))?;
        stream
            .set_write_timeout(Some(Duration::from_secs(3)))
            .map_err(|error| format!("set PTY supervisor write timeout: {error}"))?;
        let envelope = RequestEnvelope {
            token: self.descriptor.token.clone(),
            request,
        };
        serde_json::to_writer(&mut stream, &envelope)
            .map_err(|error| format!("encode PTY supervisor request: {error}"))?;
        stream
            .write_all(b"\n")
            .map_err(|error| format!("write PTY supervisor request: {error}"))?;
        let _ = stream.shutdown(Shutdown::Write);

        let response: SupervisorResponse = serde_json::from_reader(BufReader::new(stream))
            .map_err(|error| format!("decode PTY supervisor response: {error}"))?;
        if !response.ok {
            return Err(response
                .error
                .unwrap_or_else(|| "PTY supervisor request failed".to_string()));
        }
        serde_json::from_value(response.data)
            .map_err(|error| format!("decode PTY supervisor payload: {error}"))
    }
}

fn current_client() -> Result<SupervisorClient, String> {
    SupervisorClient::connect(load_descriptor()?)
}

fn cached_client() -> Option<SupervisorClient> {
    CLIENT_CACHE.lock().ok().and_then(|client| client.clone())
}

fn cache_client(client: &SupervisorClient) {
    if let Ok(mut slot) = CLIENT_CACHE.lock() {
        *slot = Some(client.clone());
    }
}

fn invalidate_client() {
    if let Ok(mut slot) = CLIENT_CACHE.lock() {
        *slot = None;
    }
}

fn ensure_client() -> Result<SupervisorClient, String> {
    if let Some(client) = cached_client() {
        return Ok(client);
    }
    if let Ok(client) = current_client() {
        cache_client(&client);
        return Ok(client);
    }
    let _guard = START_LOCK
        .lock()
        .map_err(|_| "PTY supervisor start lock is poisoned".to_string())?;
    thread::sleep(Duration::from_millis(40));
    if let Ok(client) = current_client() {
        cache_client(&client);
        return Ok(client);
    }

    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let path = descriptor_path();
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("remove stale PTY supervisor descriptor: {error}"))?;
    }
    let executable =
        std::env::current_exe().map_err(|error| format!("resolve Atelier executable: {error}"))?;
    let mut command = Command::new(executable);
    command
        .arg("--atelier-pty-supervisor")
        .env("ATELIER_PTY_SUPERVISOR_TOKEN", &token)
        .env("ATELIER_PTY_SUPERVISOR_DESCRIPTOR", &path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    detach_command(&mut command);
    command
        .spawn()
        .map_err(|error| format!("start PTY supervisor: {error}"))?;

    let started = Instant::now();
    while started.elapsed() < START_TIMEOUT {
        if let Ok(client) = current_client() {
            cache_client(&client);
            return Ok(client);
        }
        thread::sleep(Duration::from_millis(40));
    }
    Err("PTY supervisor did not become ready within 5 seconds".to_string())
}

fn supervisor_request<T: DeserializeOwned>(request: SupervisorRequest) -> Result<T, String> {
    let client = ensure_client()?;
    match client.request(request.clone()) {
        Ok(value) => Ok(value),
        Err(first_error) => {
            invalidate_client();
            let retry_client = ensure_client()?;
            retry_client.request(request).map_err(|retry_error| {
                format!("{retry_error} (initial supervisor error: {first_error})")
            })
        }
    }
}

#[cfg(unix)]
fn detach_command(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    unsafe {
        command.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
}

#[cfg(windows)]
fn detach_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x00000008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(not(any(unix, windows)))]
fn detach_command(_: &mut Command) {}

pub(crate) fn spawn<R: Runtime>(
    app: AppHandle<R>,
    profile: String,
    cols: u16,
    rows: u16,
    log_id: Option<String>,
) -> Result<SpawnResult, String> {
    let result: SpawnResult = supervisor_request(SupervisorRequest::Spawn {
        profile,
        cols,
        rows,
        log_id,
    })?;
    REMOTE_SESSIONS.insert(result.id.clone(), ());
    ensure_relay(app, result.id.clone());
    Ok(result)
}

pub(crate) fn write(id: &str, data: &str) -> Option<Result<(), String>> {
    if !REMOTE_SESSIONS.contains_key(id) {
        return None;
    }
    Some((|| {
        supervisor_request::<Value>(SupervisorRequest::Write {
            id: id.to_string(),
            data: data.to_string(),
        })?;
        Ok(())
    })())
}

pub(crate) fn resize(id: &str, cols: u16, rows: u16) -> Option<Result<(), String>> {
    if !REMOTE_SESSIONS.contains_key(id) {
        return None;
    }
    Some((|| {
        supervisor_request::<Value>(SupervisorRequest::Resize {
            id: id.to_string(),
            cols,
            rows,
        })?;
        Ok(())
    })())
}

pub(crate) fn kill(id: &str) -> Option<Result<(), String>> {
    if !REMOTE_SESSIONS.contains_key(id) {
        return None;
    }
    let result = (|| {
        supervisor_request::<Value>(SupervisorRequest::Kill { id: id.to_string() })?;
        Ok(())
    })();
    REMOTE_SESSIONS.remove(id);
    Some(result)
}

pub(crate) fn list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<SessionInfo>, String> {
    let client = cached_client().map(Ok).unwrap_or_else(current_client)?;
    cache_client(&client);
    let sessions: Vec<SessionInfo> = match client.request(SupervisorRequest::List) {
        Ok(sessions) => sessions,
        Err(_) => {
            invalidate_client();
            let replacement = current_client()?;
            cache_client(&replacement);
            replacement.request(SupervisorRequest::List)?
        }
    };
    let running: Vec<SessionInfo> = sessions
        .into_iter()
        .filter(|session| session.running)
        .collect();
    for session in &running {
        REMOTE_SESSIONS.insert(session.id.clone(), ());
        ensure_relay(app.clone(), session.id.clone());
    }
    Ok(running)
}

pub(crate) fn snapshot(id: &str, after_sequence: u64) -> Option<Result<PtyOutputSnapshot, String>> {
    if !REMOTE_SESSIONS.contains_key(id) {
        return None;
    }
    Some(supervisor_request(SupervisorRequest::Snapshot {
        id: id.to_string(),
        after_sequence,
    }))
}

pub(crate) fn acknowledge(id: &str, sequence: u64) -> Option<Result<u64, String>> {
    if !REMOTE_SESSIONS.contains_key(id) {
        return None;
    }
    Some(supervisor_request(SupervisorRequest::Ack {
        id: id.to_string(),
        sequence,
    }))
}

fn ensure_relay<R: Runtime>(app: AppHandle<R>, id: String) {
    if REMOTE_RELAYS.insert(id.clone(), ()).is_some() {
        return;
    }
    thread::spawn(move || {
        let mut after_sequence = 0;
        let mut failures = 0u8;
        let mut last_info_check = Instant::now() - Duration::from_secs(1);
        loop {
            let snapshot: Result<PtyOutputSnapshot, String> =
                supervisor_request(SupervisorRequest::Snapshot {
                    id: id.clone(),
                    after_sequence,
                });
            let mut emitted = false;
            match snapshot {
                Ok(snapshot) => {
                    failures = 0;
                    for frame in snapshot.frames {
                        after_sequence = after_sequence.max(frame.sequence);
                        emitted = true;
                        let _ = app.emit(
                            &format!("pty://{id}/data"),
                            RelayDataPayload {
                                sequence: frame.sequence,
                                data: frame.data,
                            },
                        );
                    }
                }
                Err(_) => {
                    failures = failures.saturating_add(1);
                }
            }

            if last_info_check.elapsed() >= Duration::from_millis(400) || failures > 0 {
                last_info_check = Instant::now();
                let info: Result<Option<SessionInfo>, String> =
                    supervisor_request(SupervisorRequest::Info { id: id.clone() });
                match info {
                    Ok(Some(info)) if !info.running => {
                        let _ = app.emit(
                            &format!("pty://{id}/exit"),
                            RelayExitPayload {
                                code: info.exit_code,
                            },
                        );
                        break;
                    }
                    Ok(None) => break,
                    Ok(Some(_)) => {}
                    Err(_) => failures = failures.saturating_add(1),
                }
            }
            if failures >= 20 {
                let _ = app.emit(&format!("pty://{id}/exit"), RelayExitPayload { code: None });
                break;
            }
            thread::sleep(if emitted {
                Duration::from_millis(24)
            } else {
                Duration::from_millis(80)
            });
        }
        REMOTE_RELAYS.remove(&id);
        REMOTE_SESSIONS.remove(&id);
    });
}

pub fn run_from_env() -> Result<(), String> {
    let token = std::env::var("ATELIER_PTY_SUPERVISOR_TOKEN")
        .map_err(|_| "missing PTY supervisor token".to_string())?;
    let descriptor = std::env::var_os("ATELIER_PTY_SUPERVISOR_DESCRIPTOR")
        .map(PathBuf::from)
        .ok_or_else(|| "missing PTY supervisor descriptor path".to_string())?;
    std::env::remove_var("ATELIER_PTY_SUPERVISOR_TOKEN");
    std::env::remove_var("ATELIER_PTY_SUPERVISOR_DESCRIPTOR");
    if token.len() < 32 {
        return Err("invalid PTY supervisor token".to_string());
    }

    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("bind PTY supervisor: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("configure PTY supervisor listener: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("resolve PTY supervisor address: {error}"))?
        .port();
    let published = SupervisorDescriptor {
        protocol: PROTOCOL_VERSION,
        pid: std::process::id(),
        port,
        token: token.clone(),
        started_at_ms: epoch_millis(),
    };
    write_descriptor(&descriptor, &published)?;

    let runtime = new_runtime(true);
    let mut last_request = Instant::now();
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                last_request = Instant::now();
                let runtime = Arc::clone(&runtime);
                let token = token.clone();
                thread::spawn(move || handle_connection(stream, runtime, &token));
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if !runtime_has_running_sessions(&runtime)
                    && last_request.elapsed() >= SUPERVISOR_IDLE_TIMEOUT
                {
                    break;
                }
                thread::sleep(if runtime_has_running_sessions(&runtime) {
                    Duration::from_millis(1)
                } else {
                    Duration::from_millis(25)
                });
            }
            Err(error) => return Err(format!("accept PTY supervisor request: {error}")),
        }
    }

    if let Ok(current) = fs::read(&descriptor)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<SupervisorDescriptor>(&bytes).ok())
        .ok_or(())
    {
        if current.pid == std::process::id() {
            let _ = fs::remove_file(descriptor);
        }
    }
    Ok(())
}

fn handle_connection(mut stream: TcpStream, runtime: Arc<crate::pty::PtyState>, token: &str) {
    let response = (|| -> Result<Value, String> {
        // A nonblocking listener may yield a nonblocking accepted socket on
        // some platforms. Requests are handled on dedicated short-lived
        // threads, so make the connection blocking before reading its single
        // JSON line instead of treating a transient WouldBlock as failure.
        stream
            .set_nonblocking(false)
            .map_err(|error| format!("configure PTY supervisor request stream: {error}"))?;
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .map_err(|error| format!("set PTY supervisor request read timeout: {error}"))?;
        stream
            .set_write_timeout(Some(Duration::from_secs(3)))
            .map_err(|error| format!("set PTY supervisor response write timeout: {error}"))?;
        let clone = stream
            .try_clone()
            .map_err(|error| format!("clone PTY supervisor stream: {error}"))?;
        let mut line = String::new();
        BufReader::new(clone)
            .take(MAX_REQUEST_BYTES)
            .read_line(&mut line)
            .map_err(|error| format!("read PTY supervisor request: {error}"))?;
        let envelope: RequestEnvelope = serde_json::from_str(&line)
            .map_err(|error| format!("decode PTY supervisor request: {error}"))?;
        if envelope.token != token {
            return Err("PTY supervisor authentication failed".to_string());
        }
        dispatch_request(runtime, envelope.request)
    })();

    let response = match response {
        Ok(data) => SupervisorResponse {
            ok: true,
            data,
            error: None,
        },
        Err(error) => SupervisorResponse {
            ok: false,
            data: Value::Null,
            error: Some(error),
        },
    };
    let _ = serde_json::to_writer(&mut stream, &response);
    let _ = stream.flush();
    let _ = stream.shutdown(Shutdown::Both);
}

fn dispatch_request(
    runtime: Arc<crate::pty::PtyState>,
    request: SupervisorRequest,
) -> Result<Value, String> {
    match request {
        SupervisorRequest::Ping => serde_json::to_value(true),
        SupervisorRequest::Spawn {
            profile,
            cols,
            rows,
            log_id,
        } => serde_json::to_value(
            runtime_spawn(runtime, profile, cols, rows, log_id, None, None)
                .map_err(|error| error.to_string())?,
        ),
        SupervisorRequest::Write { id, data } => {
            runtime_write(&runtime, &id, &data)?;
            Ok(Value::Null)
        }
        SupervisorRequest::Resize { id, cols, rows } => {
            runtime_resize(&runtime, &id, cols, rows)?;
            Ok(Value::Null)
        }
        SupervisorRequest::Kill { id } => {
            runtime_kill(&runtime, &id)?;
            Ok(Value::Null)
        }
        SupervisorRequest::List => serde_json::to_value(runtime_list(&runtime)),
        SupervisorRequest::Info { id } => serde_json::to_value(runtime_info(&runtime, &id)),
        SupervisorRequest::Snapshot { id, after_sequence } => {
            serde_json::to_value(runtime_output_snapshot(&runtime, &id, after_sequence)?)
        }
        SupervisorRequest::Ack { id, sequence } => {
            serde_json::to_value(runtime_ack(&runtime, &id, sequence)?)
        }
    }
    .map_err(|error| format!("encode PTY supervisor response: {error}"))
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use super::detach_command;
    use super::{dispatch_request, SupervisorRequest};
    use crate::pty::new_runtime;
    #[cfg(unix)]
    use std::process::Command;
    #[cfg(unix)]
    use std::thread;
    #[cfg(unix)]
    use std::time::Duration;

    #[test]
    fn supervisor_ping_protocol_is_serializable() {
        let value = dispatch_request(new_runtime(true), SupervisorRequest::Ping).unwrap();
        assert_eq!(value, serde_json::json!(true));
    }

    #[cfg(unix)]
    #[test]
    fn detached_supervisor_command_owns_a_new_process_session() {
        let mut command = Command::new("sh");
        command.args(["-c", "sleep 5"]);
        detach_command(&mut command);
        let mut child = command.spawn().unwrap();
        thread::sleep(Duration::from_millis(50));
        let child_pid = child.id() as libc::pid_t;
        let session_pid = unsafe { libc::getsid(child_pid) };
        assert_eq!(session_pid, child_pid);
        let _ = child.kill();
        let _ = child.wait();
    }
}
