use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const APPROVAL_TTL_MS: u64 = 5 * 60 * 1_000;
const MAX_SERVICES: usize = 200;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DevService {
    host: String,
    port: u16,
    pid: Option<u32>,
    process_name: Option<String>,
    command: Option<String>,
    cwd: Option<String>,
    workspace_match: bool,
    url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DevServicesSnapshot {
    platform: String,
    scanned_at_ms: u64,
    workspace: Option<String>,
    services: Vec<DevService>,
    unavailable_reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DevServiceStopInput {
    pid: u32,
    port: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DevServicePreparedStop {
    action_id: String,
    approval_hash: String,
    pid: u32,
    port: u16,
    process_name: Option<String>,
    preview: String,
    expires_at_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DevServiceStopReceipt {
    receipt_id: String,
    action_id: String,
    pid: u32,
    port: u16,
    status: String,
    summary: String,
    completed_at_ms: u64,
}

#[derive(Clone, Debug)]
struct PreparedStopRecord {
    prepared: DevServicePreparedStop,
}

fn prepared_stops() -> &'static Mutex<HashMap<String, PreparedStopRecord>> {
    static PREPARED: OnceLock<Mutex<HashMap<String, PreparedStopRecord>>> = OnceLock::new();
    PREPARED.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("system clock is before Unix epoch: {error}"))
}

#[cfg(target_os = "windows")]
fn configure_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_command(_command: &mut Command) {}

fn fixed_output(program: &str, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new(program);
    command.args(args);
    configure_command(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("run {program}: {error}"))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if error.is_empty() {
            format!("{program} exited with {}", output.status)
        } else {
            format!("{program}: {error}")
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn parse_address(value: &str) -> Option<(String, u16)> {
    let value = value.trim().trim_start_matches("TCP").trim();
    let (host, port_text) = value.rsplit_once(':')?;
    let port = port_text.trim_end_matches('*').parse::<u16>().ok()?;
    let host = host
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_string();
    Some((host, port))
}

fn loopback_url(host: &str, port: u16) -> String {
    let host = match host {
        "" | "*" | "0.0.0.0" | "::" => "127.0.0.1",
        "::1" => "[::1]",
        other => other,
    };
    let scheme = if matches!(port, 443 | 8443) {
        "https"
    } else {
        "http"
    };
    format!("{scheme}://{host}:{port}")
}

#[cfg(any(target_os = "macos", test))]
fn parse_lsof(output: &str) -> Vec<DevService> {
    let mut services = Vec::new();
    let mut pid = None;
    let mut process_name = None;
    for line in output.lines().filter(|line| !line.is_empty()) {
        match line.as_bytes().first().copied() {
            Some(b'p') => pid = line[1..].parse::<u32>().ok(),
            Some(b'c') => process_name = Some(line[1..].to_string()),
            Some(b'n') => {
                if let Some((host, port)) = parse_address(&line[1..]) {
                    services.push(DevService {
                        url: loopback_url(&host, port),
                        host,
                        port,
                        pid,
                        process_name: process_name.clone(),
                        command: None,
                        cwd: None,
                        workspace_match: false,
                    });
                }
            }
            _ => {}
        }
    }
    services
}

#[cfg(any(target_os = "windows", test))]
fn parse_windows_netstat(output: &str) -> Vec<DevService> {
    output
        .lines()
        .filter_map(|line| {
            let fields = line.split_whitespace().collect::<Vec<_>>();
            if fields.len() < 5
                || !fields[0].eq_ignore_ascii_case("tcp")
                || !fields[3].eq_ignore_ascii_case("listening")
            {
                return None;
            }
            let (host, port) = parse_address(fields[1])?;
            let pid = fields[4].parse::<u32>().ok();
            Some(DevService {
                url: loopback_url(&host, port),
                host,
                port,
                pid,
                process_name: pid.map(|pid| format!("PID {pid}")),
                command: None,
                cwd: None,
                workspace_match: false,
            })
        })
        .collect()
}

#[cfg(any(target_os = "linux", test))]
fn parse_ss(output: &str) -> Vec<DevService> {
    output
        .lines()
        .filter_map(|line| {
            let fields = line.split_whitespace().collect::<Vec<_>>();
            if fields.len() < 4 || !fields[0].eq_ignore_ascii_case("listen") {
                return None;
            }
            let (host, port) = parse_address(fields[3])?;
            let pid = line
                .split("pid=")
                .nth(1)
                .and_then(|rest| {
                    rest.split(|character: char| !character.is_ascii_digit())
                        .next()
                })
                .and_then(|value| value.parse::<u32>().ok());
            let process_name = line
                .split("users:((\"")
                .nth(1)
                .and_then(|rest| rest.split('"').next())
                .map(str::to_string);
            Some(DevService {
                url: loopback_url(&host, port),
                host,
                port,
                pid,
                process_name,
                command: None,
                cwd: None,
                workspace_match: false,
            })
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn process_metadata(pid: u32) -> (Option<String>, Option<String>) {
    let cwd = std::fs::read_link(format!("/proc/{pid}/cwd"))
        .ok()
        .map(|path| path.to_string_lossy().into_owned());
    let command = std::fs::read(format!("/proc/{pid}/cmdline"))
        .ok()
        .map(|bytes| {
            String::from_utf8_lossy(&bytes)
                .replace('\0', " ")
                .trim()
                .to_string()
        })
        .filter(|value| !value.is_empty());
    (cwd, command)
}

#[cfg(target_os = "macos")]
fn process_metadata(pid: u32) -> (Option<String>, Option<String>) {
    let pid_text = pid.to_string();
    let cwd = fixed_output("lsof", &["-a", "-p", &pid_text, "-d", "cwd", "-Fn"])
        .ok()
        .and_then(|output| {
            output
                .lines()
                .find_map(|line| line.strip_prefix('n').map(str::to_string))
        });
    let command = fixed_output("ps", &["-p", &pid_text, "-o", "command="])
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    (cwd, command)
}

#[cfg(target_os = "windows")]
fn process_metadata(_pid: u32) -> (Option<String>, Option<String>) {
    // Windows does not expose another process's working directory through a stable,
    // non-privileged API. Keep the port visible without fabricating ownership.
    (None, None)
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn process_metadata(_pid: u32) -> (Option<String>, Option<String>) {
    (None, None)
}

fn canonical_workspace(workspace: Option<String>) -> Result<Option<PathBuf>, String> {
    let Some(workspace) = workspace
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    let path = std::fs::canonicalize(&workspace)
        .map_err(|error| format!("resolve workspace {workspace}: {error}"))?;
    if !path.is_dir() {
        return Err("The workspace must be a directory.".to_string());
    }
    Ok(Some(path))
}

fn belongs_to_workspace(cwd: Option<&str>, command: Option<&str>, workspace: &Path) -> bool {
    if cwd
        .and_then(|value| std::fs::canonicalize(value).ok())
        .is_some_and(|cwd| cwd == workspace || cwd.starts_with(workspace))
    {
        return true;
    }
    command.is_some_and(|command| command.contains(&workspace.to_string_lossy().to_string()))
}

fn scan_services(workspace: Option<&Path>) -> Result<Vec<DevService>, String> {
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    return Err("Development service discovery is not supported on this platform.".to_string());

    #[cfg(target_os = "macos")]
    let mut services = parse_lsof(&fixed_output(
        "lsof",
        &["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"],
    )?);
    #[cfg(target_os = "windows")]
    let mut services = parse_windows_netstat(&fixed_output("netstat", &["-ano", "-p", "tcp"])?);
    #[cfg(target_os = "linux")]
    let mut services = parse_ss(&fixed_output("ss", &["-ltnpH"])?);
    let mut metadata = HashMap::<u32, (Option<String>, Option<String>)>::new();
    for service in &mut services {
        if let Some(pid) = service.pid {
            let (cwd, command) = metadata.entry(pid).or_insert_with(|| process_metadata(pid));
            service.cwd = cwd.clone();
            service.command = command.clone();
        }
        service.workspace_match = workspace.is_some_and(|workspace| {
            belongs_to_workspace(
                service.cwd.as_deref(),
                service.command.as_deref(),
                workspace,
            )
        });
    }
    services.sort_by_key(|service| (!service.workspace_match, service.port, service.pid));
    services.dedup_by_key(|service| (service.host.clone(), service.port, service.pid));
    services.truncate(MAX_SERVICES);
    Ok(services)
}

fn approval_hash(action_id: &str, pid: u32, port: u16) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{action_id}:{pid}:{port}"));
    format!("{:x}", hasher.finalize())
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.as_bytes()
        .iter()
        .zip(right.as_bytes())
        .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn service_for_pid_port(pid: u32, port: u16) -> Result<DevService, String> {
    scan_services(None)?
        .into_iter()
        .find(|service| service.pid == Some(pid) && service.port == port)
        .ok_or_else(|| "The selected process no longer owns this listening port.".to_string())
}

fn terminate_process(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        let result = unsafe { libc::kill(pid as i32, libc::SIGTERM) };
        if result != 0 {
            return Err(format!(
                "stop process {pid}: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        fixed_output("taskkill", &["/PID", &pid.to_string()]).map(|_| ())
    }
    #[cfg(not(any(unix, target_os = "windows")))]
    {
        Err("Stopping development services is not supported on this platform.".to_string())
    }
}

#[tauri::command]
pub(crate) async fn dev_services_scan(
    workspace: Option<String>,
) -> Result<DevServicesSnapshot, String> {
    let workspace = canonical_workspace(workspace)?;
    let workspace_for_worker = workspace.clone();
    let services =
        tokio::task::spawn_blocking(move || scan_services(workspace_for_worker.as_deref()))
            .await
            .map_err(|error| format!("development service scanner: {error}"))??;
    Ok(DevServicesSnapshot {
        platform: std::env::consts::OS.to_string(),
        scanned_at_ms: now_ms()?,
        workspace: workspace.map(|path| path.to_string_lossy().into_owned()),
        services,
        unavailable_reason: None,
    })
}

#[tauri::command]
pub(crate) async fn dev_service_stop_prepare(
    input: DevServiceStopInput,
) -> Result<DevServicePreparedStop, String> {
    if input.pid == 0 || input.port == 0 {
        return Err("A valid process and port are required.".to_string());
    }
    let service = tokio::task::spawn_blocking(move || service_for_pid_port(input.pid, input.port))
        .await
        .map_err(|error| format!("development service validation: {error}"))??;
    let now = now_ms()?;
    let action_id = Uuid::new_v4().to_string();
    let prepared = DevServicePreparedStop {
        approval_hash: approval_hash(&action_id, input.pid, input.port),
        action_id: action_id.clone(),
        pid: input.pid,
        port: input.port,
        process_name: service.process_name.clone(),
        preview: format!(
            "Stop {} (PID {}) currently listening on port {}.",
            service.process_name.as_deref().unwrap_or("local process"),
            input.pid,
            input.port
        ),
        expires_at_ms: now + APPROVAL_TTL_MS,
    };
    prepared_stops()
        .lock()
        .map_err(|_| "Development service approval state is unavailable.".to_string())?
        .insert(
            action_id,
            PreparedStopRecord {
                prepared: prepared.clone(),
            },
        );
    Ok(prepared)
}

#[tauri::command]
pub(crate) async fn dev_service_stop_execute(
    action_id: String,
    approval_hash_value: String,
) -> Result<DevServiceStopReceipt, String> {
    let now = now_ms()?;
    let record = prepared_stops()
        .lock()
        .map_err(|_| "Development service approval state is unavailable.".to_string())?
        .remove(action_id.trim())
        .ok_or_else(|| "The stop approval is missing or already used.".to_string())?;
    if record.prepared.expires_at_ms < now {
        return Err("The stop approval expired. Review the process again.".to_string());
    }
    if !constant_time_equal(&record.prepared.approval_hash, approval_hash_value.trim()) {
        return Err("The stop approval does not match the reviewed process.".to_string());
    }
    let pid = record.prepared.pid;
    let port = record.prepared.port;
    tokio::task::spawn_blocking(move || {
        service_for_pid_port(pid, port)?;
        terminate_process(pid)
    })
    .await
    .map_err(|error| format!("development service stop worker: {error}"))??;
    Ok(DevServiceStopReceipt {
        receipt_id: Uuid::new_v4().to_string(),
        action_id: record.prepared.action_id,
        pid,
        port,
        status: "stopped".to_string(),
        summary: format!("Requested a graceful stop for PID {pid} on port {port}."),
        completed_at_ms: now_ms()?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_macos_lsof_records() {
        let services = parse_lsof("p42\ncnode\nn127.0.0.1:5173\nn*:8000\n");
        assert_eq!(services.len(), 2);
        assert_eq!(services[0].pid, Some(42));
        assert_eq!(services[0].process_name.as_deref(), Some("node"));
        assert_eq!(services[0].url, "http://127.0.0.1:5173");
    }

    #[test]
    fn parses_windows_netstat_without_shell_interpolation() {
        let services =
            parse_windows_netstat("  TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    991\r\n");
        assert_eq!(services.len(), 1);
        assert_eq!(services[0].pid, Some(991));
        assert_eq!(services[0].url, "http://127.0.0.1:3000");
    }

    #[test]
    fn parses_linux_ss_records() {
        let services =
            parse_ss("LISTEN 0 511 127.0.0.1:4173 0.0.0.0:* users:((\"node\",pid=7331,fd=21))\n");
        assert_eq!(services.len(), 1);
        assert_eq!(services[0].pid, Some(7331));
        assert_eq!(services[0].process_name.as_deref(), Some("node"));
        assert_eq!(services[0].url, "http://127.0.0.1:4173");
    }

    #[test]
    fn approval_is_bound_to_pid_and_port() {
        let action_id = "action";
        assert_ne!(
            approval_hash(action_id, 42, 3000),
            approval_hash(action_id, 42, 3001)
        );
    }
}
