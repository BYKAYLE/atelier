use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const SSH_SCHEMA_VERSION: u32 = 1;
const APPROVAL_TTL_MS: u64 = 5 * 60 * 1000;

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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelSummary {
    pub id: String,
    pub profile_id: String,
    pub local_port: u16,
    pub remote_port: u16,
    pub started_at_unix_ms: u64,
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

struct RunningTunnel {
    summary: SshTunnelSummary,
    child: Child,
}

static TUNNELS: Lazy<Mutex<HashMap<String, RunningTunnel>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static PREPARED_ACTIONS: Lazy<Mutex<HashMap<String, SshPreparedAction>>> =
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
    let value = value.trim();
    if !value.starts_with('/')
        || value.len() > 1024
        || value.contains('\0')
        || value.contains('\n')
        || value.contains('\r')
    {
        return Err("Remote paths must be absolute POSIX paths.".to_string());
    }
    Ok(value.to_string())
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

fn prune_tunnels() -> Result<Vec<SshTunnelSummary>, String> {
    let mut tunnels = TUNNELS
        .lock()
        .map_err(|_| "SSH tunnel registry is unavailable.".to_string())?;
    let finished = tunnels
        .iter_mut()
        .filter_map(|(id, tunnel)| match tunnel.child.try_wait() {
            Ok(Some(_)) | Err(_) => Some(id.clone()),
            Ok(None) => None,
        })
        .collect::<Vec<_>>();
    for id in finished {
        tunnels.remove(&id);
    }
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

#[tauri::command]
pub async fn ssh_workspace_status() -> Result<SshWorkspaceStatus, String> {
    let mut profiles = load_profiles()?;
    profiles.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(SshWorkspaceStatus {
        schema_version: SSH_SCHEMA_VERSION,
        ssh_installed: command_available("ssh"),
        ssh_keyscan_installed: command_available("ssh-keyscan"),
        profiles,
        tunnels: prune_tunnels()?,
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
pub async fn ssh_tunnel_start(
    profile_id: String,
    local_port: u16,
    remote_port: u16,
) -> Result<SshTunnelSummary, String> {
    if local_port == 0 || remote_port == 0 {
        return Err("Forwarded ports must be between 1 and 65535.".to_string());
    }
    let profile = profile(&profile_id)?;
    if !trusted_host(&profile)? {
        return Err("Trust the displayed SSH host key before forwarding a port.".to_string());
    }
    let id = Uuid::new_v4().to_string();
    let mut command = base_ssh_command(&profile)?;
    command
        .arg("-N")
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg("-L")
        .arg(format!("127.0.0.1:{local_port}:127.0.0.1:{remote_port}"))
        .arg(ssh_target(&profile))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("start SSH tunnel: {error}"))?;
    thread::sleep(Duration::from_millis(350));
    if let Some(status) = child
        .try_wait()
        .map_err(|error| format!("inspect SSH tunnel: {error}"))?
    {
        let mut detail = String::new();
        if let Some(mut stderr) = child.stderr.take() {
            use std::io::Read;
            let _ = stderr.read_to_string(&mut detail);
        }
        return Err(format!(
            "SSH tunnel exited with {status}: {}",
            detail.trim()
        ));
    }
    let summary = SshTunnelSummary {
        id: id.clone(),
        profile_id,
        local_port,
        remote_port,
        started_at_unix_ms: now_ms()?,
    };
    TUNNELS
        .lock()
        .map_err(|_| "SSH tunnel registry is unavailable.".to_string())?
        .insert(
            id,
            RunningTunnel {
                summary: summary.clone(),
                child,
            },
        );
    Ok(summary)
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
    let _ = tunnel.child.kill();
    let _ = tunnel.child.wait();
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
            let _ = tunnel.child.kill();
            let _ = tunnel.child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!(validate_ref("../../main").is_err());
        assert_eq!(validate_ref("origin/main").unwrap(), "origin/main");
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
}
