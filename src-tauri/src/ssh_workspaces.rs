use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const SSH_SCHEMA_VERSION: u32 = 1;
const APPROVAL_TTL_MS: u64 = 5 * 60 * 1000;
const TUNNEL_DEFAULT_MAX_RESTARTS: u32 = 5;
const TUNNEL_DIAGNOSTIC_LIMIT: usize = 16 * 1024;
const TUNNEL_RETRY_DELAYS_MS: [u64; 5] = [1_000, 2_000, 4_000, 8_000, 15_000];
const REMOTE_FILE_MAX_BYTES: usize = 1024 * 1024;
const REMOTE_DIRECTORY_MAX_ENTRIES: usize = 500;
const REMOTE_FILE_MAX_PREPARED_WRITES: usize = 32;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshWorkspaceProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub remote_root: String,
    #[serde(default)]
    pub archived: bool,
    pub created_at_unix_ms: u64,
    pub updated_at_unix_ms: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshWorkspaceProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub remote_root: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshHostFingerprint {
    pub algorithm: String,
    pub fingerprint: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshHostProbe {
    pub profile_id: String,
    pub host: String,
    pub port: u16,
    pub fingerprints: Vec<SshHostFingerprint>,
    pub trusted: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectionProbe {
    pub profile_id: String,
    pub connected: bool,
    pub latency_ms: u64,
    pub remote_identity: Option<String>,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SshTunnelState {
    Starting,
    Connected,
    Reconnecting,
    Failed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelSummary {
    pub id: String,
    pub profile_id: String,
    pub local_port: u16,
    pub remote_port: u16,
    pub started_at_unix_ms: u64,
    pub state: SshTunnelState,
    pub auto_reconnect: bool,
    pub max_reconnect_attempts: u32,
    pub restart_count: u32,
    pub last_checked_at_unix_ms: u64,
    pub next_retry_at_unix_ms: Option<u64>,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshWorkspaceStatus {
    pub schema_version: u32,
    pub ssh_installed: bool,
    pub ssh_keyscan_installed: bool,
    pub profiles: Vec<SshWorkspaceProfile>,
    pub tunnels: Vec<SshTunnelSummary>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshRemoteWorktreeInput {
    pub profile_id: String,
    pub repository_path: String,
    pub task_name: String,
    pub base_ref: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshPreparedAction {
    pub action_id: String,
    pub approval_hash: String,
    pub expires_at_unix_ms: u64,
    pub preview: String,
    pub input: SshRemoteWorktreeInput,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshRemoteWorktreeReceipt {
    pub action_id: String,
    pub profile_id: String,
    pub branch: String,
    pub worktree_path: String,
    pub finished_at_unix_ms: u64,
    pub summary: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SshRemoteEntryKind {
    File,
    Directory,
    Symlink,
    Other,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshRemoteEntry {
    pub path: String,
    pub name: String,
    pub kind: SshRemoteEntryKind,
    pub size: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshRemoteDirectory {
    pub profile_id: String,
    pub path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<SshRemoteEntry>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshRemoteFile {
    pub profile_id: String,
    pub path: String,
    pub content: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshRemoteFileWriteInput {
    pub profile_id: String,
    pub path: String,
    pub content: String,
    pub expected_sha256: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshPreparedFileWrite {
    pub action_id: String,
    pub approval_hash: String,
    pub expires_at_unix_ms: u64,
    pub profile_id: String,
    pub path: String,
    pub expected_sha256: String,
    pub content_sha256: String,
    pub byte_length: u64,
    pub preview: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshRemoteFileWriteReceipt {
    pub action_id: String,
    pub profile_id: String,
    pub path: String,
    pub sha256: String,
    pub bytes_written: u64,
    pub finished_at_unix_ms: u64,
    pub summary: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTerminalLaunch {
    pub profile_id: String,
    pub label: String,
    pub command: String,
}

struct PreparedFileWriteRecord {
    prepared: SshPreparedFileWrite,
    content: String,
}

struct RunningTunnel {
    summary: SshTunnelSummary,
    profile: SshWorkspaceProfile,
    child: Option<Child>,
    diagnostics: Arc<Mutex<Vec<u8>>>,
}

#[derive(Clone)]
struct TunnelRestartRequest {
    id: String,
    profile: SshWorkspaceProfile,
    local_port: u16,
    remote_port: u16,
}

type TunnelProcess = (Child, Arc<Mutex<Vec<u8>>>);

static TUNNELS: Lazy<Mutex<HashMap<String, RunningTunnel>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static PREPARED_ACTIONS: Lazy<Mutex<HashMap<String, SshPreparedAction>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static PREPARED_FILE_WRITES: Lazy<Mutex<HashMap<String, PreparedFileWriteRecord>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("system clock: {error}"))
}

fn ssh_root() -> Result<PathBuf, String> {
    let root = crate::control_plane::application_data_dir()?.join("ssh-workspaces");
    fs::create_dir_all(&root).map_err(|error| format!("create SSH workspace store: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("secure SSH workspace store: {error}"))?;
    }
    Ok(root)
}

fn profiles_path() -> Result<PathBuf, String> {
    Ok(ssh_root()?.join("profiles.json"))
}

fn known_hosts_path() -> Result<PathBuf, String> {
    let path = ssh_root()?.join("known_hosts");
    if !path.exists() {
        fs::write(&path, b"").map_err(|error| format!("create private known_hosts: {error}"))?;
        crate::chmod_600(&path);
    }
    Ok(path)
}

fn write_private_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    let bytes =
        serde_json::to_vec_pretty(value).map_err(|error| format!("serialize SSH data: {error}"))?;
    let temporary = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    fs::write(&temporary, bytes).map_err(|error| format!("write SSH data: {error}"))?;
    crate::chmod_600(&temporary);
    fs::rename(&temporary, path).map_err(|error| format!("publish SSH data: {error}"))?;
    crate::chmod_600(path);
    Ok(())
}

fn load_profiles() -> Result<Vec<SshWorkspaceProfile>, String> {
    let path = profiles_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(&path).map_err(|error| format!("read SSH profiles: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("parse SSH profiles: {error}"))
}

fn save_profiles(profiles: &[SshWorkspaceProfile]) -> Result<(), String> {
    write_private_json(&profiles_path()?, profiles)
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn validate_host(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 253
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | ':' | '[' | ']')
        })
    {
        return Err("SSH host contains unsupported characters.".to_string());
    }
    Ok(value.to_string())
}

fn validate_user(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 64
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err("SSH user contains unsupported characters.".to_string());
    }
    Ok(value.to_string())
}

fn validate_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 80 || value.chars().any(char::is_control) {
        return Err("SSH profile name must contain 1-80 printable characters.".to_string());
    }
    Ok(value.to_string())
}

fn validate_remote_path(value: &str) -> Result<String, String> {
    normalize_posix_absolute(value.trim())
}

fn normalize_posix_absolute(value: &str) -> Result<String, String> {
    if !value.starts_with('/')
        || value.len() > 1024
        || value.contains('\0')
        || value.contains('\n')
        || value.contains('\r')
    {
        return Err("Remote paths must be absolute POSIX paths.".to_string());
    }
    let mut components = Vec::new();
    for component in value.split('/') {
        match component {
            "" | "." => {}
            ".." => {
                if components.pop().is_none() {
                    return Err("Remote path escapes the filesystem root.".to_string());
                }
            }
            part if part.chars().any(char::is_control) => {
                return Err("Remote paths cannot contain control characters.".to_string());
            }
            part => components.push(part),
        }
    }
    Ok(if components.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", components.join("/"))
    })
}

fn remote_path_within(root: &str, path: &str) -> bool {
    root == "/" || path == root || path.starts_with(&format!("{root}/"))
}

fn resolve_remote_path(profile: &SshWorkspaceProfile, requested: &str) -> Result<String, String> {
    let root = validate_remote_path(&profile.remote_root)?;
    let requested = requested.trim();
    if requested.len() > 1024
        || requested.contains('\0')
        || requested.contains('\n')
        || requested.contains('\r')
    {
        return Err("Remote path contains unsupported characters.".to_string());
    }
    let joined = if requested.is_empty() {
        root.clone()
    } else if requested.starts_with('/') {
        requested.to_string()
    } else if root == "/" {
        format!("/{requested}")
    } else {
        format!("{root}/{requested}")
    };
    let path = normalize_posix_absolute(&joined)?;
    if !remote_path_within(&root, &path) {
        return Err(format!(
            "Remote path must stay inside the configured root {root}."
        ));
    }
    Ok(path)
}

fn remote_parent_path(root: &str, path: &str) -> Option<String> {
    if path == root {
        return None;
    }
    let parent = path
        .rfind('/')
        .map(|index| if index == 0 { "/" } else { &path[..index] })?;
    Some(if remote_path_within(root, parent) {
        parent.to_string()
    } else {
        root.to_string()
    })
}

fn validate_ref(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 200
        || value.contains("..")
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | '/')
        })
    {
        return Err("Git base ref contains unsupported characters.".to_string());
    }
    Ok(value.to_string())
}

fn task_slug(value: &str) -> Result<String, String> {
    let slug = value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .take(8)
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        return Err("Task name must include letters or numbers.".to_string());
    }
    Ok(slug.chars().take(48).collect())
}

fn profile(profile_id: &str) -> Result<SshWorkspaceProfile, String> {
    if !valid_id(profile_id) {
        return Err("Invalid SSH profile id.".to_string());
    }
    load_profiles()?
        .into_iter()
        .find(|profile| profile.id == profile_id && !profile.archived)
        .ok_or_else(|| "SSH profile was not found or is archived.".to_string())
}

fn command_available(program: &str) -> bool {
    let mut command = Command::new(program);
    command
        .arg("-V")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_background(&mut command);
    command.status().is_ok()
}

#[cfg(target_os = "windows")]
fn configure_background(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_background(_: &mut Command) {}

fn ssh_target(profile: &SshWorkspaceProfile) -> String {
    format!("{}@{}", profile.user, profile.host)
}

fn base_ssh_command(profile: &SshWorkspaceProfile) -> Result<Command, String> {
    let known_hosts = known_hosts_path()?;
    let mut command = Command::new("ssh");
    command
        .arg("-p")
        .arg(profile.port.to_string())
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("IdentitiesOnly=no")
        .arg("-o")
        .arg("StrictHostKeyChecking=yes")
        .arg("-o")
        .arg(format!("UserKnownHostsFile={}", known_hosts.display()))
        .arg("-o")
        .arg("ConnectTimeout=8");
    configure_background(&mut command);
    Ok(command)
}

fn run_output(mut command: Command) -> Result<Output, String> {
    command
        .output()
        .map_err(|error| format!("start command: {error}"))
}

fn scan_host(profile: &SshWorkspaceProfile) -> Result<Vec<String>, String> {
    let mut command = Command::new("ssh-keyscan");
    command
        .arg("-T")
        .arg("6")
        .arg("-p")
        .arg(profile.port.to_string())
        .arg(&profile.host);
    configure_background(&mut command);
    let output = run_output(command)?;
    if !output.status.success() && output.stdout.is_empty() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let lines = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return Err("The SSH host did not return a public host key.".to_string());
    }
    Ok(lines)
}

fn fingerprint_line(line: &str) -> Result<SshHostFingerprint, String> {
    let mut command = Command::new("ssh-keygen");
    command
        .arg("-lf")
        .arg("-")
        .arg("-E")
        .arg("sha256")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_background(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| format!("start ssh-keygen: {error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "ssh-keygen stdin unavailable".to_string())?
        .write_all(line.as_bytes())
        .map_err(|error| format!("write ssh-keygen input: {error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("wait for ssh-keygen: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let parts = text.split_whitespace().collect::<Vec<_>>();
    let fingerprint = parts
        .iter()
        .find(|part| part.starts_with("SHA256:"))
        .ok_or_else(|| "ssh-keygen did not return a SHA-256 fingerprint.".to_string())?;
    let algorithm = parts
        .last()
        .map(|part| part.trim_matches(['(', ')']).to_string())
        .unwrap_or_else(|| "SSH".to_string());
    Ok(SshHostFingerprint {
        algorithm,
        fingerprint: (*fingerprint).to_string(),
    })
}

fn trusted_host(profile: &SshWorkspaceProfile) -> Result<bool, String> {
    let path = known_hosts_path()?;
    let content = fs::read_to_string(path).unwrap_or_default();
    let plain = &profile.host;
    let bracketed = format!("[{}]:{}", profile.host, profile.port);
    Ok(content.lines().any(|line| {
        line.split_whitespace()
            .next()
            .is_some_and(|host| host == plain || host == bracketed)
    }))
}

fn append_tunnel_diagnostics(diagnostics: &Arc<Mutex<Vec<u8>>>, chunk: &[u8]) {
    if let Ok(mut bytes) = diagnostics.lock() {
        bytes.extend_from_slice(chunk);
        if bytes.len() > TUNNEL_DIAGNOSTIC_LIMIT {
            let overflow = bytes.len() - TUNNEL_DIAGNOSTIC_LIMIT;
            bytes.drain(..overflow);
        }
    }
}

fn tunnel_diagnostics(diagnostics: &Arc<Mutex<Vec<u8>>>) -> String {
    diagnostics
        .lock()
        .ok()
        .map(|bytes| String::from_utf8_lossy(&bytes).trim().to_string())
        .filter(|detail| !detail.is_empty())
        .unwrap_or_else(|| "The SSH forwarding process exited unexpectedly.".to_string())
}

fn drain_tunnel_stderr(mut stderr: impl Read + Send + 'static) -> Arc<Mutex<Vec<u8>>> {
    let diagnostics = Arc::new(Mutex::new(Vec::new()));
    let writer = Arc::clone(&diagnostics);
    thread::spawn(move || {
        let mut buffer = [0_u8; 2_048];
        loop {
            match stderr.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => append_tunnel_diagnostics(&writer, &buffer[..read]),
            }
        }
    });
    diagnostics
}

fn spawn_tunnel_process(
    profile: &SshWorkspaceProfile,
    local_port: u16,
    remote_port: u16,
) -> Result<TunnelProcess, String> {
    let mut command = base_ssh_command(profile)?;
    command
        .arg("-N")
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg("-o")
        .arg("ServerAliveInterval=15")
        .arg("-o")
        .arg("ServerAliveCountMax=3")
        .arg("-o")
        .arg("ConnectionAttempts=1")
        .arg("-o")
        .arg("TCPKeepAlive=yes")
        .arg("-L")
        .arg(format!("127.0.0.1:{local_port}:127.0.0.1:{remote_port}"))
        .arg(ssh_target(profile))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("start SSH tunnel: {error}"))?;
    thread::sleep(Duration::from_millis(350));
    match child.try_wait() {
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("inspect SSH tunnel: {error}"));
        }
        Ok(Some(status)) => {
            let mut bytes = Vec::new();
            if let Some(stderr) = child.stderr.take() {
                let _ = stderr
                    .take(TUNNEL_DIAGNOSTIC_LIMIT as u64)
                    .read_to_end(&mut bytes);
            }
            let detail = String::from_utf8_lossy(&bytes).trim().to_string();
            return Err(if detail.is_empty() {
                format!("SSH tunnel exited with {status}.")
            } else {
                format!("SSH tunnel exited with {status}: {detail}")
            });
        }
        Ok(None) => {}
    }
    let diagnostics = child
        .stderr
        .take()
        .map(drain_tunnel_stderr)
        .unwrap_or_else(|| Arc::new(Mutex::new(Vec::new())));
    Ok((child, diagnostics))
}

fn retry_delay_ms(restart_count: u32) -> u64 {
    let index = usize::try_from(restart_count)
        .unwrap_or(usize::MAX)
        .min(TUNNEL_RETRY_DELAYS_MS.len() - 1);
    TUNNEL_RETRY_DELAYS_MS[index]
}

fn schedule_tunnel_reconnect(tunnel: &mut RunningTunnel, reason: String, now: u64) {
    tunnel.summary.last_checked_at_unix_ms = now;
    tunnel.summary.last_error = Some(reason);
    if tunnel.summary.auto_reconnect
        && tunnel.summary.restart_count < tunnel.summary.max_reconnect_attempts
    {
        tunnel.summary.state = SshTunnelState::Reconnecting;
        tunnel.summary.next_retry_at_unix_ms =
            Some(now.saturating_add(retry_delay_ms(tunnel.summary.restart_count)));
    } else {
        tunnel.summary.state = SshTunnelState::Failed;
        tunnel.summary.next_retry_at_unix_ms = None;
    }
}

fn refresh_tunnels() -> Result<Vec<SshTunnelSummary>, String> {
    let now = now_ms()?;
    let mut restarts = Vec::new();
    {
        let mut tunnels = TUNNELS
            .lock()
            .map_err(|_| "SSH tunnel registry is unavailable.".to_string())?;
        for (id, tunnel) in tunnels.iter_mut() {
            tunnel.summary.last_checked_at_unix_ms = now;
            let process_result = tunnel.child.as_mut().map(Child::try_wait);
            match process_result {
                Some(Ok(Some(status))) => {
                    tunnel.child = None;
                    let detail = tunnel_diagnostics(&tunnel.diagnostics);
                    schedule_tunnel_reconnect(
                        tunnel,
                        format!("SSH tunnel exited with {status}: {detail}"),
                        now,
                    );
                }
                Some(Err(error)) => {
                    if let Some(mut child) = tunnel.child.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    schedule_tunnel_reconnect(
                        tunnel,
                        format!("Could not inspect the SSH tunnel: {error}"),
                        now,
                    );
                }
                Some(Ok(None)) | None => {}
            }
            let retry_ready = tunnel.summary.state == SshTunnelState::Reconnecting
                && tunnel
                    .summary
                    .next_retry_at_unix_ms
                    .is_some_and(|retry_at| retry_at <= now)
                && tunnel.summary.restart_count < tunnel.summary.max_reconnect_attempts;
            if retry_ready {
                tunnel.summary.state = SshTunnelState::Starting;
                tunnel.summary.restart_count = tunnel.summary.restart_count.saturating_add(1);
                tunnel.summary.next_retry_at_unix_ms = None;
                restarts.push(TunnelRestartRequest {
                    id: id.clone(),
                    profile: tunnel.profile.clone(),
                    local_port: tunnel.summary.local_port,
                    remote_port: tunnel.summary.remote_port,
                });
            }
        }
    }

    for request in restarts {
        let result =
            spawn_tunnel_process(&request.profile, request.local_port, request.remote_port);
        let checked_at = now_ms()?;
        let mut tunnels = TUNNELS
            .lock()
            .map_err(|_| "SSH tunnel registry is unavailable.".to_string())?;
        let Some(tunnel) = tunnels.get_mut(&request.id) else {
            if let Ok((mut child, _)) = result {
                let _ = child.kill();
                let _ = child.wait();
            }
            continue;
        };
        match result {
            Ok((child, diagnostics)) => {
                tunnel.child = Some(child);
                tunnel.diagnostics = diagnostics;
                tunnel.summary.state = SshTunnelState::Connected;
                tunnel.summary.last_checked_at_unix_ms = checked_at;
                tunnel.summary.next_retry_at_unix_ms = None;
                tunnel.summary.last_error = None;
            }
            Err(error) => schedule_tunnel_reconnect(tunnel, error, checked_at),
        }
    }

    let tunnels = TUNNELS
        .lock()
        .map_err(|_| "SSH tunnel registry is unavailable.".to_string())?;
    let mut summaries = tunnels
        .values()
        .map(|tunnel| tunnel.summary.clone())
        .collect::<Vec<_>>();
    summaries.sort_by_key(|summary| summary.started_at_unix_ms);
    Ok(summaries)
}

fn approval_hash(
    action_id: &str,
    input: &SshRemoteWorktreeInput,
    expires_at: u64,
) -> Result<String, String> {
    let payload = serde_json::to_vec(&(action_id, input, expires_at))
        .map_err(|error| format!("serialize SSH approval: {error}"))?;
    Ok(format!("{:x}", Sha256::digest(payload)))
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn remote_shell_command(
    profile: &SshWorkspaceProfile,
    script: &str,
    arguments: &[&str],
) -> Result<Command, String> {
    let mut remote = format!("sh -c {} atelier", shell_quote(script));
    for argument in arguments {
        remote.push(' ');
        remote.push_str(&shell_quote(argument));
    }
    let mut command = base_ssh_command(profile)?;
    command.arg(ssh_target(profile)).arg(remote);
    Ok(command)
}

fn remote_command_error(context: &str, output: &Output) -> String {
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if detail.is_empty() {
        format!("{context} failed with {}.", output.status)
    } else {
        format!("{context} failed: {detail}")
    }
}

fn validate_sha256(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.len() != 64 || !value.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("Expected SHA-256 must contain exactly 64 hexadecimal characters.".to_string());
    }
    Ok(value.to_ascii_lowercase())
}

fn read_remote_file_blocking(
    profile: &SshWorkspaceProfile,
    path: &str,
) -> Result<SshRemoteFile, String> {
    let root = validate_remote_path(&profile.remote_root)?;
    let script = r#"
set -eu
root=$1
target=$2
root_real=$(cd "$root" 2>/dev/null && pwd -P) || { printf 'Configured remote root does not exist.\n' >&2; exit 70; }
parent=$(dirname "$target")
name=$(basename "$target")
parent_real=$(cd "$parent" 2>/dev/null && pwd -P) || { printf 'Remote file parent does not exist.\n' >&2; exit 71; }
target_real=$parent_real/$name
case "$target_real" in "$root_real"|"$root_real"/*) ;; *) printf 'Remote file escapes the configured root.\n' >&2; exit 72;; esac
[ ! -L "$target_real" ] || { printf 'Symbolic-link files cannot be opened by Atelier.\n' >&2; exit 73; }
[ -f "$target_real" ] || { printf 'Remote path is not a regular file.\n' >&2; exit 74; }
size=$(wc -c < "$target_real" | tr -d '[:space:]')
case "$size" in ''|*[!0-9]*) printf 'Could not determine remote file size.\n' >&2; exit 75;; esac
[ "$size" -le 1048576 ] || { printf 'Remote file exceeds the 1 MiB editor limit.\n' >&2; exit 76; }
cat "$target_real"
"#;
    let command = remote_shell_command(profile, script, &[&root, path])?;
    let output = run_output(command)?;
    if !output.status.success() {
        return Err(remote_command_error("Remote file read", &output));
    }
    if output.stdout.len() > REMOTE_FILE_MAX_BYTES {
        return Err("Remote file exceeded the 1 MiB editor limit.".to_string());
    }
    let content = String::from_utf8(output.stdout)
        .map_err(|_| "Remote file is not valid UTF-8 text.".to_string())?;
    if content.contains('\0') {
        return Err("Binary remote files cannot be edited in Atelier.".to_string());
    }
    let size = content.len() as u64;
    let sha256 = format!("{:x}", Sha256::digest(content.as_bytes()));
    Ok(SshRemoteFile {
        profile_id: profile.id.clone(),
        path: path.to_string(),
        content,
        size,
        sha256,
    })
}

fn list_remote_directory_blocking(
    profile: &SshWorkspaceProfile,
    path: &str,
) -> Result<SshRemoteDirectory, String> {
    let root = validate_remote_path(&profile.remote_root)?;
    let script = r#"
set -eu
root=$1
target=$2
root_real=$(cd "$root" 2>/dev/null && pwd -P) || { printf 'Configured remote root does not exist.\n' >&2; exit 70; }
parent=$(dirname "$target")
name=$(basename "$target")
if [ "$target" = "$root" ]; then target_real=$root_real; else
  parent_real=$(cd "$parent" 2>/dev/null && pwd -P) || { printf 'Remote directory parent does not exist.\n' >&2; exit 71; }
  target_real=$parent_real/$name
fi
case "$target_real" in "$root_real"|"$root_real"/*) ;; *) printf 'Remote directory escapes the configured root.\n' >&2; exit 72;; esac
[ ! -L "$target_real" ] || { printf 'Symbolic-link directories cannot be opened by Atelier.\n' >&2; exit 73; }
[ -d "$target_real" ] || { printf 'Remote path is not a directory.\n' >&2; exit 74; }
count=0
for entry in "$target_real"/* "$target_real"/.[!.]* "$target_real"/..?*; do
  if [ ! -e "$entry" ] && [ ! -L "$entry" ]; then continue; fi
  entry_name=${entry##*/}
  kind=other
  size=0
  if [ -L "$entry" ]; then kind=symlink
  elif [ -d "$entry" ]; then kind=directory
  elif [ -f "$entry" ]; then
    kind=file
    size=$(wc -c < "$entry" | tr -d '[:space:]')
  fi
  logical=$target/$entry_name
  [ "$target" != "/" ] || logical=/$entry_name
  printf '%s\0%s\0%s\0%s\0' "$logical" "$entry_name" "$kind" "$size"
  count=$((count + 1))
  [ "$count" -lt 501 ] || break
done
"#;
    let command = remote_shell_command(profile, script, &[&root, path])?;
    let output = run_output(command)?;
    if !output.status.success() {
        return Err(remote_command_error("Remote directory listing", &output));
    }
    let fields = output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>();
    if fields.len() % 4 != 0 {
        return Err("Remote directory returned a malformed listing.".to_string());
    }
    let record_count = fields.len() / 4;
    let truncated = record_count > REMOTE_DIRECTORY_MAX_ENTRIES;
    let mut entries = fields
        .chunks_exact(4)
        .take(REMOTE_DIRECTORY_MAX_ENTRIES)
        .map(|record| {
            let text = |index: usize| {
                String::from_utf8(record[index].to_vec())
                    .map_err(|_| "Remote file name is not valid UTF-8.".to_string())
            };
            let kind = match text(2)?.as_str() {
                "file" => SshRemoteEntryKind::File,
                "directory" => SshRemoteEntryKind::Directory,
                "symlink" => SshRemoteEntryKind::Symlink,
                _ => SshRemoteEntryKind::Other,
            };
            Ok(SshRemoteEntry {
                path: text(0)?,
                name: text(1)?,
                kind,
                size: text(3)?.parse::<u64>().unwrap_or(0),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    entries.sort_by(|left, right| {
        let left_rank = u8::from(left.kind != SshRemoteEntryKind::Directory);
        let right_rank = u8::from(right.kind != SshRemoteEntryKind::Directory);
        left_rank
            .cmp(&right_rank)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(SshRemoteDirectory {
        profile_id: profile.id.clone(),
        path: path.to_string(),
        parent_path: remote_parent_path(&root, path),
        entries,
        truncated,
    })
}

fn file_write_approval_hash(prepared: &SshPreparedFileWrite) -> Result<String, String> {
    let payload = serde_json::to_vec(&(
        &prepared.action_id,
        &prepared.profile_id,
        &prepared.path,
        &prepared.expected_sha256,
        &prepared.content_sha256,
        prepared.byte_length,
        prepared.expires_at_unix_ms,
    ))
    .map_err(|error| format!("serialize remote file approval: {error}"))?;
    Ok(format!("{:x}", Sha256::digest(payload)))
}

fn store_prepared_file_write(
    writes: &mut HashMap<String, PreparedFileWriteRecord>,
    record: PreparedFileWriteRecord,
    prepared_at_unix_ms: u64,
) -> Result<(), String> {
    let action_id = record.prepared.action_id.clone();
    if record.prepared.expires_at_unix_ms <= prepared_at_unix_ms {
        return Err("Remote file approval must expire in the future.".to_string());
    }
    writes.retain(|_, existing| {
        existing.prepared.expires_at_unix_ms > prepared_at_unix_ms
            && !(existing.prepared.profile_id == record.prepared.profile_id
                && existing.prepared.path == record.prepared.path)
    });
    if writes.len() >= REMOTE_FILE_MAX_PREPARED_WRITES {
        return Err(
            "Too many remote file approvals are pending. Wait for an approval to expire and retry."
                .to_string(),
        );
    }
    writes.insert(action_id, record);
    Ok(())
}

fn write_remote_file_blocking(
    profile: &SshWorkspaceProfile,
    path: &str,
    expected_sha256: &str,
    content: &[u8],
) -> Result<(), String> {
    let root = validate_remote_path(&profile.remote_root)?;
    let script = r#"
set -eu
root=$1
target=$2
expected=$3
root_real=$(cd "$root" 2>/dev/null && pwd -P) || { printf 'Configured remote root does not exist.\n' >&2; exit 70; }
parent=$(dirname "$target")
name=$(basename "$target")
parent_real=$(cd "$parent" 2>/dev/null && pwd -P) || { printf 'Remote file parent does not exist.\n' >&2; exit 71; }
target_real=$parent_real/$name
case "$target_real" in "$root_real"|"$root_real"/*) ;; *) printf 'Remote file escapes the configured root.\n' >&2; exit 72;; esac
[ ! -L "$target_real" ] || { printf 'Symbolic-link files cannot be edited by Atelier.\n' >&2; exit 73; }
[ -f "$target_real" ] || { printf 'Remote path is not an existing regular file.\n' >&2; exit 74; }
if command -v sha256sum >/dev/null 2>&1; then current=$(sha256sum "$target_real" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then current=$(shasum -a 256 "$target_real" | awk '{print $1}')
else printf 'Remote host needs sha256sum or shasum for conflict-safe writes.\n' >&2; exit 75
fi
[ "$current" = "$expected" ] || { printf 'Remote file changed after it was opened. Reload before saving.\n' >&2; exit 76; }
tmp=$target_real.atelier-$$.tmp
trap 'rm -f "$tmp"' EXIT HUP INT TERM
umask 077
cp -p "$target_real" "$tmp"
cat > "$tmp"
mv "$tmp" "$target_real"
trap - EXIT HUP INT TERM
"#;
    let mut command = remote_shell_command(profile, script, &[&root, path, expected_sha256])?;
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("start remote file write: {error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "Remote file write stdin is unavailable.".to_string())?
        .write_all(content)
        .map_err(|error| format!("send remote file content: {error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("wait for remote file write: {error}"))?;
    if !output.status.success() {
        return Err(remote_command_error("Remote file write", &output));
    }
    Ok(())
}

fn command_line(arguments: &[String]) -> String {
    arguments
        .iter()
        .map(|argument| shell_quote(argument))
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub async fn ssh_workspace_status() -> Result<SshWorkspaceStatus, String> {
    let mut profiles = load_profiles()?;
    profiles.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(SshWorkspaceStatus {
        schema_version: SSH_SCHEMA_VERSION,
        ssh_installed: command_available("ssh"),
        ssh_keyscan_installed: command_available("ssh-keyscan"),
        profiles,
        tunnels: refresh_tunnels()?,
    })
}

#[tauri::command]
pub async fn ssh_profile_save(
    input: SshWorkspaceProfileInput,
) -> Result<SshWorkspaceProfile, String> {
    let now = now_ms()?;
    let name = validate_name(&input.name)?;
    let host = validate_host(&input.host)?;
    let user = validate_user(&input.user)?;
    let remote_root = validate_remote_path(&input.remote_root)?;
    if input.port == 0 {
        return Err("SSH port must be between 1 and 65535.".to_string());
    }
    let mut profiles = load_profiles()?;
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    if !valid_id(&id) {
        return Err("Invalid SSH profile id.".to_string());
    }
    let created_at = profiles
        .iter()
        .find(|profile| profile.id == id)
        .map(|profile| profile.created_at_unix_ms)
        .unwrap_or(now);
    let profile = SshWorkspaceProfile {
        id: id.clone(),
        name,
        host,
        port: input.port,
        user,
        remote_root,
        archived: false,
        created_at_unix_ms: created_at,
        updated_at_unix_ms: now,
    };
    if let Some(existing) = profiles.iter_mut().find(|existing| existing.id == id) {
        *existing = profile.clone();
    } else {
        profiles.push(profile.clone());
    }
    save_profiles(&profiles)?;
    Ok(profile)
}

#[tauri::command]
pub async fn ssh_profile_archive(profile_id: String) -> Result<(), String> {
    if !valid_id(&profile_id) {
        return Err("Invalid SSH profile id.".to_string());
    }
    let mut profiles = load_profiles()?;
    let target = profiles
        .iter_mut()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| "SSH profile was not found.".to_string())?;
    target.archived = true;
    target.updated_at_unix_ms = now_ms()?;
    save_profiles(&profiles)
}

#[tauri::command]
pub async fn ssh_host_probe(profile_id: String) -> Result<SshHostProbe, String> {
    let profile = profile(&profile_id)?;
    let lines = tokio::task::spawn_blocking({
        let profile = profile.clone();
        move || scan_host(&profile)
    })
    .await
    .map_err(|error| format!("SSH host probe worker: {error}"))??;
    let fingerprints = lines
        .iter()
        .map(|line| fingerprint_line(line))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SshHostProbe {
        profile_id,
        host: profile.host.clone(),
        port: profile.port,
        fingerprints,
        trusted: trusted_host(&profile)?,
    })
}

#[tauri::command]
pub async fn ssh_host_trust(
    profile_id: String,
    fingerprint: String,
) -> Result<SshHostProbe, String> {
    if !fingerprint.starts_with("SHA256:") || fingerprint.len() > 128 {
        return Err("Invalid SSH host fingerprint.".to_string());
    }
    let profile = profile(&profile_id)?;
    let lines = tokio::task::spawn_blocking({
        let profile = profile.clone();
        move || scan_host(&profile)
    })
    .await
    .map_err(|error| format!("SSH host trust worker: {error}"))??;
    let mut matched = false;
    for line in &lines {
        if fingerprint_line(line)?.fingerprint == fingerprint {
            matched = true;
        }
    }
    if !matched {
        return Err("The SSH host key changed before approval. Probe it again.".to_string());
    }
    let path = known_hosts_path()?;
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let mut output = existing;
    if !output.is_empty() && !output.ends_with('\n') {
        output.push('\n');
    }
    for line in &lines {
        if !output.lines().any(|existing| existing == line) {
            output.push_str(line);
            output.push('\n');
        }
    }
    fs::write(&path, output).map_err(|error| format!("write private known_hosts: {error}"))?;
    crate::chmod_600(&path);
    let fingerprints = lines
        .iter()
        .map(|line| fingerprint_line(line))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SshHostProbe {
        profile_id,
        host: profile.host.clone(),
        port: profile.port,
        fingerprints,
        trusted: true,
    })
}

#[tauri::command]
pub async fn ssh_connection_probe(profile_id: String) -> Result<SshConnectionProbe, String> {
    let profile = profile(&profile_id)?;
    if !trusted_host(&profile)? {
        return Err("Trust the displayed SSH host key before connecting.".to_string());
    }
    tokio::task::spawn_blocking(move || {
        let started = std::time::Instant::now();
        let mut command = base_ssh_command(&profile)?;
        command
            .arg(ssh_target(&profile))
            .arg("printf 'atelier-ssh-ok:%s@%s' \"$(id -un)\" \"$(hostname)\"");
        let output = run_output(command)?;
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(SshConnectionProbe {
            profile_id,
            connected: output.status.success() && text.starts_with("atelier-ssh-ok:"),
            latency_ms: started.elapsed().as_millis() as u64,
            remote_identity: text.strip_prefix("atelier-ssh-ok:").map(ToOwned::to_owned),
            message: if output.status.success() { text } else { error },
        })
    })
    .await
    .map_err(|error| format!("SSH connection worker: {error}"))?
}

#[tauri::command]
pub async fn ssh_remote_directory_list(
    profile_id: String,
    path: String,
) -> Result<SshRemoteDirectory, String> {
    let profile = profile(&profile_id)?;
    if !trusted_host(&profile)? {
        return Err("Trust the displayed SSH host key before browsing remote files.".to_string());
    }
    let path = resolve_remote_path(&profile, &path)?;
    tokio::task::spawn_blocking(move || list_remote_directory_blocking(&profile, &path))
        .await
        .map_err(|error| format!("remote directory worker: {error}"))?
}

#[tauri::command]
pub async fn ssh_remote_file_read(
    profile_id: String,
    path: String,
) -> Result<SshRemoteFile, String> {
    let profile = profile(&profile_id)?;
    if !trusted_host(&profile)? {
        return Err("Trust the displayed SSH host key before opening remote files.".to_string());
    }
    let path = resolve_remote_path(&profile, &path)?;
    tokio::task::spawn_blocking(move || read_remote_file_blocking(&profile, &path))
        .await
        .map_err(|error| format!("remote file worker: {error}"))?
}

#[tauri::command]
pub async fn ssh_remote_file_write_prepare(
    input: SshRemoteFileWriteInput,
) -> Result<SshPreparedFileWrite, String> {
    let profile = profile(&input.profile_id)?;
    if !trusted_host(&profile)? {
        return Err("Trust the displayed SSH host key before editing remote files.".to_string());
    }
    if input.content.len() > REMOTE_FILE_MAX_BYTES {
        return Err("Remote file content exceeds the 1 MiB editor limit.".to_string());
    }
    if input.content.contains('\0') {
        return Err("Binary content cannot be written by the Atelier text editor.".to_string());
    }
    let path = resolve_remote_path(&profile, &input.path)?;
    let expected_sha256 = validate_sha256(&input.expected_sha256)?;
    let current = tokio::task::spawn_blocking({
        let profile = profile.clone();
        let path = path.clone();
        move || read_remote_file_blocking(&profile, &path)
    })
    .await
    .map_err(|error| format!("remote file preflight worker: {error}"))??;
    if current.sha256 != expected_sha256 {
        return Err("Remote file changed after it was opened. Reload before saving.".to_string());
    }
    let action_id = Uuid::new_v4().to_string();
    let prepared_at_unix_ms = now_ms()?;
    let expires_at_unix_ms = prepared_at_unix_ms.saturating_add(APPROVAL_TTL_MS);
    let byte_length = input.content.len() as u64;
    let content_sha256 = format!("{:x}", Sha256::digest(input.content.as_bytes()));
    let mut prepared = SshPreparedFileWrite {
        action_id: action_id.clone(),
        approval_hash: String::new(),
        expires_at_unix_ms,
        profile_id: profile.id.clone(),
        path: path.clone(),
        expected_sha256,
        content_sha256,
        byte_length,
        preview: format!(
            "Replace the existing remote file {path} on {}@{} with {byte_length} UTF-8 bytes.",
            profile.user, profile.host
        ),
    };
    prepared.approval_hash = file_write_approval_hash(&prepared)?;
    let mut writes = PREPARED_FILE_WRITES
        .lock()
        .map_err(|_| "Remote file approval registry is unavailable.".to_string())?;
    store_prepared_file_write(
        &mut writes,
        PreparedFileWriteRecord {
            prepared: prepared.clone(),
            content: input.content,
        },
        prepared_at_unix_ms,
    )?;
    Ok(prepared)
}

#[tauri::command]
pub async fn ssh_remote_file_write_execute(
    action_id: String,
    approval_hash_value: String,
) -> Result<SshRemoteFileWriteReceipt, String> {
    let record = PREPARED_FILE_WRITES
        .lock()
        .map_err(|_| "Remote file approval registry is unavailable.".to_string())?
        .remove(&action_id)
        .ok_or_else(|| "Remote file approval was not found or was already consumed.".to_string())?;
    let prepared = record.prepared;
    if now_ms()? > prepared.expires_at_unix_ms {
        return Err("Remote file approval expired.".to_string());
    }
    if prepared.approval_hash != approval_hash_value
        || file_write_approval_hash(&prepared)? != approval_hash_value
    {
        return Err("Remote file approval does not match the reviewed change.".to_string());
    }
    let profile = profile(&prepared.profile_id)?;
    if !trusted_host(&profile)? {
        return Err("The SSH host is no longer trusted.".to_string());
    }
    let current = tokio::task::spawn_blocking({
        let profile = profile.clone();
        let path = prepared.path.clone();
        move || read_remote_file_blocking(&profile, &path)
    })
    .await
    .map_err(|error| format!("remote file conflict worker: {error}"))??;
    if current.sha256 != prepared.expected_sha256 {
        return Err("Remote file changed after approval. Reload before saving.".to_string());
    }
    tokio::task::spawn_blocking({
        let profile = profile.clone();
        let path = prepared.path.clone();
        let expected_sha256 = prepared.expected_sha256.clone();
        let content = record.content.into_bytes();
        move || write_remote_file_blocking(&profile, &path, &expected_sha256, &content)
    })
    .await
    .map_err(|error| format!("remote file write worker: {error}"))??;
    let verified = tokio::task::spawn_blocking({
        let profile = profile.clone();
        let path = prepared.path.clone();
        move || read_remote_file_blocking(&profile, &path)
    })
    .await
    .map_err(|error| format!("remote file verification worker: {error}"))??;
    if verified.sha256 != prepared.content_sha256 {
        return Err("Remote file write completed but verification did not match.".to_string());
    }
    Ok(SshRemoteFileWriteReceipt {
        action_id,
        profile_id: profile.id,
        path: prepared.path.clone(),
        sha256: verified.sha256,
        bytes_written: verified.size,
        finished_at_unix_ms: now_ms()?,
        summary: format!("Saved and verified remote file {}", prepared.path),
    })
}

#[tauri::command]
pub async fn ssh_terminal_launch(profile_id: String) -> Result<SshTerminalLaunch, String> {
    let profile = profile(&profile_id)?;
    if !trusted_host(&profile)? {
        return Err("Trust the displayed SSH host key before opening a terminal.".to_string());
    }
    let known_hosts = known_hosts_path()?.to_string_lossy().to_string();
    let root = validate_remote_path(&profile.remote_root)?;
    let remote_start = format!(
        "cd {} && exec \"${{SHELL:-/bin/sh}}\" -l",
        shell_quote(&root)
    );
    let arguments = vec![
        "ssh".to_string(),
        "-tt".to_string(),
        "-p".to_string(),
        profile.port.to_string(),
        "-o".to_string(),
        "BatchMode=yes".to_string(),
        "-o".to_string(),
        "IdentitiesOnly=no".to_string(),
        "-o".to_string(),
        "StrictHostKeyChecking=yes".to_string(),
        "-o".to_string(),
        format!("UserKnownHostsFile={known_hosts}"),
        "-o".to_string(),
        "ServerAliveInterval=15".to_string(),
        "-o".to_string(),
        "ServerAliveCountMax=3".to_string(),
        ssh_target(&profile),
        remote_start,
    ];
    Ok(SshTerminalLaunch {
        profile_id: profile.id,
        label: format!("{} · SSH", profile.name),
        command: command_line(&arguments),
    })
}

#[tauri::command]
pub async fn ssh_tunnel_start(
    profile_id: String,
    local_port: u16,
    remote_port: u16,
    auto_reconnect: Option<bool>,
    max_reconnect_attempts: Option<u32>,
) -> Result<SshTunnelSummary, String> {
    if local_port == 0 || remote_port == 0 {
        return Err("Forwarded ports must be between 1 and 65535.".to_string());
    }
    let profile = profile(&profile_id)?;
    if !trusted_host(&profile)? {
        return Err("Trust the displayed SSH host key before forwarding a port.".to_string());
    }
    refresh_tunnels()?;
    if TUNNELS
        .lock()
        .map_err(|_| "SSH tunnel registry is unavailable.".to_string())?
        .values()
        .any(|tunnel| {
            tunnel.summary.local_port == local_port
                && tunnel.summary.state != SshTunnelState::Failed
        })
    {
        return Err(format!(
            "Local port {local_port} is already managed by another Atelier SSH tunnel."
        ));
    }
    let id = Uuid::new_v4().to_string();
    let process_profile = profile.clone();
    let (child, diagnostics) = tokio::task::spawn_blocking(move || {
        spawn_tunnel_process(&process_profile, local_port, remote_port)
    })
    .await
    .map_err(|error| format!("SSH tunnel worker: {error}"))??;
    let started_at = now_ms()?;
    let summary = SshTunnelSummary {
        id: id.clone(),
        profile_id,
        local_port,
        remote_port,
        started_at_unix_ms: started_at,
        state: SshTunnelState::Connected,
        auto_reconnect: auto_reconnect.unwrap_or(true),
        max_reconnect_attempts: max_reconnect_attempts
            .unwrap_or(TUNNEL_DEFAULT_MAX_RESTARTS)
            .min(20),
        restart_count: 0,
        last_checked_at_unix_ms: started_at,
        next_retry_at_unix_ms: None,
        last_error: None,
    };
    TUNNELS
        .lock()
        .map_err(|_| "SSH tunnel registry is unavailable.".to_string())?
        .insert(
            id,
            RunningTunnel {
                summary: summary.clone(),
                profile,
                child: Some(child),
                diagnostics,
            },
        );
    Ok(summary)
}

#[tauri::command]
pub async fn ssh_tunnel_list() -> Result<Vec<SshTunnelSummary>, String> {
    tokio::task::spawn_blocking(refresh_tunnels)
        .await
        .map_err(|error| format!("SSH tunnel monitor: {error}"))?
}

#[tauri::command]
pub async fn ssh_tunnel_retry(tunnel_id: String) -> Result<SshTunnelSummary, String> {
    if !valid_id(&tunnel_id) {
        return Err("Invalid SSH tunnel id.".to_string());
    }
    refresh_tunnels()?;
    let request = {
        let mut tunnels = TUNNELS
            .lock()
            .map_err(|_| "SSH tunnel registry is unavailable.".to_string())?;
        let tunnel = tunnels
            .get_mut(&tunnel_id)
            .ok_or_else(|| "SSH tunnel was not found.".to_string())?;
        if tunnel.child.is_some() && tunnel.summary.state == SshTunnelState::Connected {
            return Ok(tunnel.summary.clone());
        }
        if matches!(
            tunnel.summary.state,
            SshTunnelState::Starting | SshTunnelState::Reconnecting
        ) {
            return Err("SSH tunnel is already reconnecting.".to_string());
        }
        tunnel.summary.state = SshTunnelState::Starting;
        tunnel.summary.restart_count = 0;
        tunnel.summary.next_retry_at_unix_ms = None;
        tunnel.summary.last_error = None;
        TunnelRestartRequest {
            id: tunnel_id.clone(),
            profile: tunnel.profile.clone(),
            local_port: tunnel.summary.local_port,
            remote_port: tunnel.summary.remote_port,
        }
    };
    let process_profile = request.profile.clone();
    let result = tokio::task::spawn_blocking(move || {
        spawn_tunnel_process(&process_profile, request.local_port, request.remote_port)
    })
    .await
    .map_err(|error| format!("SSH tunnel retry worker: {error}"))?;
    let checked_at = now_ms()?;
    let mut tunnels = TUNNELS
        .lock()
        .map_err(|_| "SSH tunnel registry is unavailable.".to_string())?;
    let Some(tunnel) = tunnels.get_mut(&tunnel_id) else {
        if let Ok((mut child, _)) = result {
            let _ = child.kill();
            let _ = child.wait();
        }
        return Err("SSH tunnel was stopped while reconnecting.".to_string());
    };
    match result {
        Ok((child, diagnostics)) => {
            tunnel.child = Some(child);
            tunnel.diagnostics = diagnostics;
            tunnel.summary.state = SshTunnelState::Connected;
            tunnel.summary.last_checked_at_unix_ms = checked_at;
            tunnel.summary.last_error = None;
        }
        Err(error) => schedule_tunnel_reconnect(tunnel, error, checked_at),
    }
    Ok(tunnel.summary.clone())
}

#[tauri::command]
pub async fn ssh_tunnel_stop(tunnel_id: String) -> Result<(), String> {
    if !valid_id(&tunnel_id) {
        return Err("Invalid SSH tunnel id.".to_string());
    }
    let mut tunnel = TUNNELS
        .lock()
        .map_err(|_| "SSH tunnel registry is unavailable.".to_string())?
        .remove(&tunnel_id)
        .ok_or_else(|| "SSH tunnel is no longer running.".to_string())?;
    if let Some(mut child) = tunnel.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_remote_worktree_prepare(
    input: SshRemoteWorktreeInput,
) -> Result<SshPreparedAction, String> {
    let profile = profile(&input.profile_id)?;
    if !trusted_host(&profile)? {
        return Err(
            "Trust the displayed SSH host key before preparing a remote worktree.".to_string(),
        );
    }
    let normalized = SshRemoteWorktreeInput {
        profile_id: profile.id.clone(),
        repository_path: validate_remote_path(&input.repository_path)?,
        task_name: task_slug(&input.task_name)?,
        base_ref: Some(validate_ref(input.base_ref.as_deref().unwrap_or("HEAD"))?),
    };
    let action_id = Uuid::new_v4().to_string();
    let expires_at = now_ms()?.saturating_add(APPROVAL_TTL_MS);
    let approval_hash = approval_hash(&action_id, &normalized, expires_at)?;
    let preview = format!(
        "Create a new isolated Git worktree on {}@{} from {} in {} for task '{}'.",
        profile.user,
        profile.host,
        normalized.base_ref.as_deref().unwrap_or("HEAD"),
        normalized.repository_path,
        normalized.task_name
    );
    let prepared = SshPreparedAction {
        action_id: action_id.clone(),
        approval_hash,
        expires_at_unix_ms: expires_at,
        preview,
        input: normalized,
    };
    PREPARED_ACTIONS
        .lock()
        .map_err(|_| "SSH approval registry is unavailable.".to_string())?
        .insert(action_id, prepared.clone());
    Ok(prepared)
}

#[tauri::command]
pub async fn ssh_remote_worktree_execute(
    action_id: String,
    approval_hash_value: String,
) -> Result<SshRemoteWorktreeReceipt, String> {
    let prepared = PREPARED_ACTIONS
        .lock()
        .map_err(|_| "SSH approval registry is unavailable.".to_string())?
        .remove(&action_id)
        .ok_or_else(|| "SSH action approval was not found or was already consumed.".to_string())?;
    if now_ms()? > prepared.expires_at_unix_ms {
        return Err("SSH action approval expired.".to_string());
    }
    if prepared.approval_hash != approval_hash_value {
        return Err("SSH action approval hash does not match the preview.".to_string());
    }
    let expected = approval_hash(&action_id, &prepared.input, prepared.expires_at_unix_ms)?;
    if expected != approval_hash_value {
        return Err("SSH action approval payload changed.".to_string());
    }
    let profile = profile(&prepared.input.profile_id)?;
    let suffix = &action_id[..8];
    let branch = format!("atelier/{}-{suffix}", prepared.input.task_name);
    let worktree_path = format!(
        "{}/.atelier-worktrees/{}-{suffix}",
        prepared.input.repository_path.trim_end_matches('/'),
        prepared.input.task_name
    );
    let base_ref = prepared.input.base_ref.as_deref().unwrap_or("HEAD");
    let script = format!(
        "set -eu; root={}; branch={}; target={}; base={}; git -C \"$root\" rev-parse --is-inside-work-tree >/dev/null; mkdir -p \"$(dirname \"$target\")\"; git -C \"$root\" worktree add -b \"$branch\" \"$target\" \"$base\"; printf 'atelier-worktree-ok:%s:%s' \"$branch\" \"$target\"",
        shell_quote(&prepared.input.repository_path),
        shell_quote(&branch),
        shell_quote(&worktree_path),
        shell_quote(base_ref),
    );
    let output = tokio::task::spawn_blocking({
        let profile = profile.clone();
        move || {
            let mut command = base_ssh_command(&profile)?;
            command.arg(ssh_target(&profile)).arg(script);
            run_output(command)
        }
    })
    .await
    .map_err(|error| format!("remote worktree worker: {error}"))??;
    if !output.status.success() {
        return Err(format!(
            "Remote worktree failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(SshRemoteWorktreeReceipt {
        action_id,
        profile_id: profile.id,
        branch: branch.clone(),
        worktree_path: worktree_path.clone(),
        finished_at_unix_ms: now_ms()?,
        summary: format!("Prepared remote worktree {branch} at {worktree_path}"),
    })
}

pub(crate) fn stop_all_tunnels() {
    if let Ok(mut tunnels) = TUNNELS.lock() {
        for (_, mut tunnel) in tunnels.drain() {
            if let Some(mut child) = tunnel.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_profile() -> SshWorkspaceProfile {
        SshWorkspaceProfile {
            id: "profile-1".to_string(),
            name: "Test".to_string(),
            host: "example.com".to_string(),
            port: 22,
            user: "atelier".to_string(),
            remote_root: "/srv/project".to_string(),
            archived: false,
            created_at_unix_ms: 100,
            updated_at_unix_ms: 100,
        }
    }

    #[test]
    fn rejects_shell_metacharacters_in_hosts_and_users() {
        assert!(validate_host("host;rm -rf /").is_err());
        assert!(validate_user("me@host").is_err());
        assert_eq!(validate_host("dev.example.com").unwrap(), "dev.example.com");
    }

    #[test]
    fn remote_paths_and_refs_are_bounded() {
        assert!(validate_remote_path("relative/repo").is_err());
        assert!(validate_remote_path("/srv/repo\nnext").is_err());
        assert_eq!(
            validate_remote_path("/srv//repo/./src/../README.md").unwrap(),
            "/srv/repo/README.md"
        );
        assert!(validate_remote_path("/../../etc/passwd").is_err());
        assert!(validate_ref("../../main").is_err());
        assert_eq!(validate_ref("origin/main").unwrap(), "origin/main");
    }

    #[test]
    fn remote_file_paths_cannot_escape_the_profile_root() {
        let profile = test_profile();
        assert_eq!(
            resolve_remote_path(&profile, "src/main.rs").unwrap(),
            "/srv/project/src/main.rs"
        );
        assert_eq!(
            resolve_remote_path(&profile, "/srv/project/README.md").unwrap(),
            "/srv/project/README.md"
        );
        assert!(resolve_remote_path(&profile, "../../etc/passwd").is_err());
        assert!(resolve_remote_path(&profile, "/srv/other/file").is_err());
    }

    #[test]
    fn remote_parent_navigation_stops_at_the_profile_root() {
        assert_eq!(
            remote_parent_path("/srv/project", "/srv/project/src/bin"),
            Some("/srv/project/src".to_string())
        );
        assert_eq!(remote_parent_path("/srv/project", "/srv/project"), None);
    }

    #[test]
    fn file_write_approval_binds_the_reviewed_content() {
        let mut prepared = SshPreparedFileWrite {
            action_id: "action-1".to_string(),
            approval_hash: String::new(),
            expires_at_unix_ms: 500,
            profile_id: "profile-1".to_string(),
            path: "/srv/project/README.md".to_string(),
            expected_sha256: "a".repeat(64),
            content_sha256: "b".repeat(64),
            byte_length: 12,
            preview: "review".to_string(),
        };
        let original = file_write_approval_hash(&prepared).unwrap();
        prepared.content_sha256 = "c".repeat(64);
        assert_ne!(original, file_write_approval_hash(&prepared).unwrap());
    }

    #[test]
    fn prepared_file_writes_expire_replace_and_remain_bounded() {
        let record =
            |action_id: &str, path: &str, expires_at_unix_ms: u64| PreparedFileWriteRecord {
                prepared: SshPreparedFileWrite {
                    action_id: action_id.to_string(),
                    approval_hash: "approval".to_string(),
                    expires_at_unix_ms,
                    profile_id: "profile-1".to_string(),
                    path: path.to_string(),
                    expected_sha256: "a".repeat(64),
                    content_sha256: "b".repeat(64),
                    byte_length: 1,
                    preview: "review".to_string(),
                },
                content: "x".to_string(),
            };
        let mut writes = HashMap::new();
        assert!(
            store_prepared_file_write(&mut writes, record("expired", "/expired", 100), 100,)
                .is_err()
        );
        assert!(writes.is_empty());

        store_prepared_file_write(&mut writes, record("first", "/same", 500), 100).unwrap();
        store_prepared_file_write(&mut writes, record("second", "/same", 500), 100).unwrap();
        assert_eq!(writes.len(), 1);
        assert!(writes.contains_key("second"));

        for index in 0..REMOTE_FILE_MAX_PREPARED_WRITES - 1 {
            store_prepared_file_write(
                &mut writes,
                record(&format!("action-{index}"), &format!("/file-{index}"), 500),
                100,
            )
            .unwrap();
        }
        assert_eq!(writes.len(), REMOTE_FILE_MAX_PREPARED_WRITES);
        assert!(
            store_prepared_file_write(&mut writes, record("overflow", "/overflow", 500), 100,)
                .is_err()
        );
    }

    #[test]
    fn task_names_become_safe_branch_slugs() {
        assert_eq!(task_slug("Fix Windows OAuth").unwrap(), "fix-windows-oauth");
        assert!(task_slug("***").is_err());
    }

    #[test]
    fn approval_hash_binds_payload() {
        let input = SshRemoteWorktreeInput {
            profile_id: "profile-1".to_string(),
            repository_path: "/srv/repo".to_string(),
            task_name: "release".to_string(),
            base_ref: Some("main".to_string()),
        };
        let one = approval_hash("action", &input, 10).unwrap();
        let mut changed = input.clone();
        changed.base_ref = Some("other".to_string());
        let two = approval_hash("action", &changed, 10).unwrap();
        assert_ne!(one, two);
    }

    #[test]
    fn tunnel_retry_delay_is_bounded() {
        assert_eq!(retry_delay_ms(0), 1_000);
        assert_eq!(retry_delay_ms(2), 4_000);
        assert_eq!(retry_delay_ms(TUNNEL_DEFAULT_MAX_RESTARTS), 15_000);
        assert_eq!(retry_delay_ms(u32::MAX), 15_000);
    }

    #[test]
    fn tunnel_failure_stops_after_the_retry_budget() {
        let now = 100;
        let summary = SshTunnelSummary {
            id: "tunnel-1".to_string(),
            profile_id: "profile-1".to_string(),
            local_port: 5173,
            remote_port: 5173,
            started_at_unix_ms: now,
            state: SshTunnelState::Connected,
            auto_reconnect: true,
            max_reconnect_attempts: TUNNEL_DEFAULT_MAX_RESTARTS,
            restart_count: TUNNEL_DEFAULT_MAX_RESTARTS,
            last_checked_at_unix_ms: now,
            next_retry_at_unix_ms: None,
            last_error: None,
        };
        let mut tunnel = RunningTunnel {
            summary,
            profile: SshWorkspaceProfile {
                id: "profile-1".to_string(),
                name: "Test".to_string(),
                host: "example.com".to_string(),
                port: 22,
                user: "atelier".to_string(),
                remote_root: "/srv".to_string(),
                archived: false,
                created_at_unix_ms: now,
                updated_at_unix_ms: now,
            },
            child: None,
            diagnostics: Arc::new(Mutex::new(Vec::new())),
        };
        schedule_tunnel_reconnect(&mut tunnel, "disconnected".to_string(), now);
        assert_eq!(tunnel.summary.state, SshTunnelState::Failed);
        assert_eq!(tunnel.summary.next_retry_at_unix_ms, None);
        assert_eq!(tunnel.summary.last_error.as_deref(), Some("disconnected"));
    }

    #[test]
    fn tunnel_failure_schedules_a_bounded_reconnect() {
        let now = 100;
        let summary = SshTunnelSummary {
            id: "tunnel-1".to_string(),
            profile_id: "profile-1".to_string(),
            local_port: 5173,
            remote_port: 5173,
            started_at_unix_ms: now,
            state: SshTunnelState::Connected,
            auto_reconnect: true,
            max_reconnect_attempts: TUNNEL_DEFAULT_MAX_RESTARTS,
            restart_count: 0,
            last_checked_at_unix_ms: now,
            next_retry_at_unix_ms: None,
            last_error: None,
        };
        let mut tunnel = RunningTunnel {
            summary,
            profile: SshWorkspaceProfile {
                id: "profile-1".to_string(),
                name: "Test".to_string(),
                host: "example.com".to_string(),
                port: 22,
                user: "atelier".to_string(),
                remote_root: "/srv".to_string(),
                archived: false,
                created_at_unix_ms: now,
                updated_at_unix_ms: now,
            },
            child: None,
            diagnostics: Arc::new(Mutex::new(Vec::new())),
        };
        schedule_tunnel_reconnect(&mut tunnel, "disconnected".to_string(), now);
        assert_eq!(tunnel.summary.state, SshTunnelState::Reconnecting);
        assert_eq!(tunnel.summary.next_retry_at_unix_ms, Some(1_100));
    }
}
