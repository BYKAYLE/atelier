use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub(crate) const CONTROL_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ControlRequest {
    pub(crate) schema_version: u32,
    pub(crate) request_id: String,
    pub(crate) action: String,
    pub(crate) source: String,
    pub(crate) created_at_unix_ms: u64,
    pub(crate) workspace: Option<String>,
    pub(crate) payload: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) claimed_at_unix_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) claimant_pid: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ControlReceipt {
    pub(crate) schema_version: u32,
    pub(crate) request_id: String,
    pub(crate) action: String,
    pub(crate) status: String,
    pub(crate) created_at_unix_ms: u64,
    pub(crate) finished_at_unix_ms: u64,
    pub(crate) summary: String,
    pub(crate) detail: Option<Value>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ControlPlaneStatus {
    pub(crate) schema_version: u32,
    pub(crate) root: String,
    pub(crate) pending_requests: usize,
    pub(crate) claimed_requests: usize,
    pub(crate) receipts: usize,
}

fn now_unix_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("system clock is before Unix epoch: {error}"))
}

pub(crate) fn application_data_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let root = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "Could not resolve the Windows user data directory.".to_string())?
        .join("Atelier");

    #[cfg(target_os = "macos")]
    let root = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Could not resolve HOME.".to_string())?
        .join("Library")
        .join("Application Support")
        .join("com.atelier.app");

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let root = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
        .ok_or_else(|| "Could not resolve the user data directory.".to_string())?
        .join("atelier");

    ensure_private_dir(&root)?;
    Ok(root)
}

fn ensure_private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("create private directory {}: {error}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("secure private directory {}: {error}", path.display()))?;
    }
    Ok(())
}

fn control_root() -> Result<PathBuf, String> {
    let root = application_data_dir()?
        .join("control")
        .join(format!("v{CONTROL_SCHEMA_VERSION}"));
    ensure_store(&root)?;
    Ok(root)
}

fn ensure_store(root: &Path) -> Result<(), String> {
    ensure_private_dir(root)?;
    for name in ["pending", "claimed", "receipts"] {
        ensure_private_dir(&root.join(name))?;
    }
    Ok(())
}

fn validate_request_id(request_id: &str) -> Result<(), String> {
    if request_id.len() > 64
        || request_id.is_empty()
        || !request_id
            .chars()
            .all(|character| character.is_ascii_hexdigit() || character == '-')
    {
        return Err("Invalid Atelier control request id.".to_string());
    }
    Ok(())
}

fn request_path(root: &Path, bucket: &str, request_id: &str) -> Result<PathBuf, String> {
    validate_request_id(request_id)?;
    Ok(root.join(bucket).join(format!("{request_id}.json")))
}

fn atomic_private_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("No parent directory for {}", path.display()))?;
    ensure_private_dir(parent)?;
    let temp = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("control"),
        Uuid::new_v4()
    ));
    let content = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("serialize control data: {error}"))?;
    fs::write(&temp, content)
        .map_err(|error| format!("write control data {}: {error}", temp.display()))?;
    crate::chmod_600(&temp);
    fs::rename(&temp, path).map_err(|error| {
        let _ = fs::remove_file(&temp);
        format!("publish control data {}: {error}", path.display())
    })?;
    crate::chmod_600(path);
    Ok(())
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let content =
        fs::read(path).map_err(|error| format!("read control data {}: {error}", path.display()))?;
    serde_json::from_slice(&content)
        .map_err(|error| format!("parse control data {}: {error}", path.display()))
}

fn canonical_workspace(workspace: Option<String>) -> Result<Option<String>, String> {
    let Some(workspace) = workspace else {
        return Ok(None);
    };
    if workspace.trim().is_empty() {
        return Ok(None);
    }
    let canonical = fs::canonicalize(workspace.trim())
        .map_err(|error| format!("resolve workspace '{}': {error}", workspace.trim()))?;
    if !canonical.is_dir() {
        return Err("The requested workspace is not a directory.".to_string());
    }
    Ok(Some(canonical.to_string_lossy().into_owned()))
}

pub(crate) fn enqueue_request(
    action: &str,
    workspace: Option<String>,
    payload: Value,
    source: &str,
) -> Result<ControlRequest, String> {
    if !matches!(action, "task.dispatch" | "worktree.create") {
        return Err(format!("Unsupported Atelier control action: {action}"));
    }
    let root = control_root()?;
    let request = ControlRequest {
        schema_version: CONTROL_SCHEMA_VERSION,
        request_id: Uuid::new_v4().to_string(),
        action: action.to_string(),
        source: source.to_string(),
        created_at_unix_ms: now_unix_ms()?,
        workspace: canonical_workspace(workspace)?,
        payload,
        claimed_at_unix_ms: None,
        claimant_pid: None,
    };
    atomic_private_json(
        &request_path(&root, "pending", &request.request_id)?,
        &request,
    )?;
    Ok(request)
}

fn requests_in(root: &Path, bucket: &str) -> Result<Vec<ControlRequest>, String> {
    let directory = root.join(bucket);
    ensure_private_dir(&directory)?;
    let mut requests = Vec::new();
    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("list control requests {}: {error}", directory.display()))?
    {
        let entry = entry.map_err(|error| format!("read control request entry: {error}"))?;
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        if let Ok(request) = read_json::<ControlRequest>(&entry.path()) {
            if request.schema_version == CONTROL_SCHEMA_VERSION {
                requests.push(request);
            }
        }
    }
    requests.sort_by_key(|request| request.created_at_unix_ms);
    Ok(requests)
}

pub(crate) fn pending_requests() -> Result<Vec<ControlRequest>, String> {
    requests_in(&control_root()?, "pending")
}

pub(crate) fn claim_request(request_id: &str) -> Result<ControlRequest, String> {
    let root = control_root()?;
    let pending = request_path(&root, "pending", request_id)?;
    let claimed = request_path(&root, "claimed", request_id)?;
    fs::rename(&pending, &claimed).map_err(|error| {
        format!("claim Atelier request {request_id}; it may already be claimed: {error}")
    })?;
    let mut request: ControlRequest = read_json(&claimed)?;
    if request.schema_version != CONTROL_SCHEMA_VERSION || request.request_id != request_id {
        let _ = fs::rename(&claimed, &pending);
        return Err("The claimed Atelier request failed schema validation.".to_string());
    }
    request.claimed_at_unix_ms = Some(now_unix_ms()?);
    request.claimant_pid = Some(std::process::id());
    atomic_private_json(&claimed, &request)?;
    Ok(request)
}

fn complete_request_in(
    root: &Path,
    request_id: &str,
    status: &str,
    summary: String,
    detail: Option<Value>,
) -> Result<ControlReceipt, String> {
    if !matches!(status, "succeeded" | "failed" | "cancelled") {
        return Err("Control request status must be succeeded, failed, or cancelled.".to_string());
    }
    let claimed = request_path(root, "claimed", request_id)?;
    let request: ControlRequest = read_json(&claimed)?;
    let receipt = ControlReceipt {
        schema_version: CONTROL_SCHEMA_VERSION,
        request_id: request.request_id,
        action: request.action,
        status: status.to_string(),
        created_at_unix_ms: request.created_at_unix_ms,
        finished_at_unix_ms: now_unix_ms()?,
        summary,
        detail,
    };
    atomic_private_json(&request_path(root, "receipts", request_id)?, &receipt)?;
    fs::remove_file(&claimed)
        .map_err(|error| format!("remove completed request {}: {error}", claimed.display()))?;
    Ok(receipt)
}

pub(crate) fn complete_request(
    request_id: &str,
    status: &str,
    summary: String,
    detail: Option<Value>,
) -> Result<ControlReceipt, String> {
    complete_request_in(&control_root()?, request_id, status, summary, detail)
}

#[cfg(unix)]
fn process_is_alive(pid: u32) -> bool {
    if pid == 0 || pid > i32::MAX as u32 {
        return false;
    }
    let result = unsafe { libc::kill(pid as i32, 0) };
    result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(windows)]
fn process_is_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    if pid == 0 {
        return false;
    }
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut exit_code = 0;
        let ok = GetExitCodeProcess(handle, &mut exit_code) != 0;
        CloseHandle(handle);
        ok && exit_code == STILL_ACTIVE as u32
    }
}

#[cfg(not(any(unix, windows)))]
fn process_is_alive(_pid: u32) -> bool {
    false
}

fn recover_abandoned_claims_in(root: &Path) -> Result<Vec<ControlReceipt>, String> {
    let mut receipts = Vec::new();
    for request in requests_in(root, "claimed")? {
        if request.claimant_pid.is_some_and(process_is_alive) {
            continue;
        }
        receipts.push(complete_request_in(
            root,
            &request.request_id,
            "failed",
            "The previous Atelier process stopped before this request completed.".to_string(),
            Some(serde_json::json!({
                "recoveredAtStartup": true,
                "previousClaimantPid": request.claimant_pid,
                "claimedAtUnixMs": request.claimed_at_unix_ms,
            })),
        )?);
    }
    Ok(receipts)
}

pub(crate) fn recover_abandoned_claims() -> Result<Vec<ControlReceipt>, String> {
    recover_abandoned_claims_in(&control_root()?)
}

pub(crate) fn cancel_pending_request(
    request_id: &str,
    reason: String,
) -> Result<ControlReceipt, String> {
    let request = claim_request(request_id)?;
    complete_request(
        &request.request_id,
        "cancelled",
        reason,
        Some(serde_json::json!({ "cancelledBeforeExecution": true })),
    )
}

pub(crate) fn receipt(request_id: &str) -> Result<Option<ControlReceipt>, String> {
    let root = control_root()?;
    let path = request_path(&root, "receipts", request_id)?;
    if !path.exists() {
        return Ok(None);
    }
    read_json(&path).map(Some)
}

fn count_json_files(path: &Path) -> Result<usize, String> {
    Ok(fs::read_dir(path)
        .map_err(|error| format!("list control directory {}: {error}", path.display()))?
        .flatten()
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("json"))
        .count())
}

pub(crate) fn status() -> Result<ControlPlaneStatus, String> {
    let root = control_root()?;
    Ok(ControlPlaneStatus {
        schema_version: CONTROL_SCHEMA_VERSION,
        root: root.to_string_lossy().into_owned(),
        pending_requests: count_json_files(&root.join("pending"))?,
        claimed_requests: count_json_files(&root.join("claimed"))?,
        receipts: count_json_files(&root.join("receipts"))?,
    })
}

#[tauri::command]
pub(crate) fn control_requests_pending() -> Result<Vec<ControlRequest>, String> {
    pending_requests()
}

#[tauri::command]
pub(crate) fn control_request_claim(request_id: String) -> Result<ControlRequest, String> {
    claim_request(&request_id)
}

#[tauri::command]
pub(crate) fn control_request_complete(
    request_id: String,
    status: String,
    summary: String,
    detail: Option<Value>,
) -> Result<ControlReceipt, String> {
    complete_request(&request_id, &status, summary, detail)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("atelier-control-{name}-{}", Uuid::new_v4()));
        ensure_store(&path).expect("temporary control store");
        path
    }

    #[test]
    fn request_ids_cannot_escape_the_control_store() {
        assert!(validate_request_id("../../secret").is_err());
        assert!(validate_request_id("123e4567-e89b-12d3-a456-426614174000").is_ok());
    }

    #[test]
    fn request_claim_and_receipt_are_atomic_state_transitions() {
        let root = temp_store("lifecycle");
        let request = ControlRequest {
            schema_version: CONTROL_SCHEMA_VERSION,
            request_id: Uuid::new_v4().to_string(),
            action: "task.dispatch".to_string(),
            source: "test".to_string(),
            created_at_unix_ms: now_unix_ms().unwrap(),
            workspace: None,
            payload: serde_json::json!({ "prompt": "test" }),
            claimed_at_unix_ms: None,
            claimant_pid: None,
        };
        let pending = request_path(&root, "pending", &request.request_id).unwrap();
        atomic_private_json(&pending, &request).unwrap();
        let claimed = request_path(&root, "claimed", &request.request_id).unwrap();
        fs::rename(&pending, &claimed).unwrap();
        let loaded: ControlRequest = read_json(&claimed).unwrap();
        assert_eq!(loaded.request_id, request.request_id);
        assert!(!pending.exists());
        assert!(claimed.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn abandoned_claims_become_terminal_failed_receipts() {
        let root = temp_store("recovery");
        let request = ControlRequest {
            schema_version: CONTROL_SCHEMA_VERSION,
            request_id: Uuid::new_v4().to_string(),
            action: "task.dispatch".to_string(),
            source: "test".to_string(),
            created_at_unix_ms: now_unix_ms().unwrap(),
            workspace: None,
            payload: serde_json::json!({ "prompt": "test" }),
            claimed_at_unix_ms: Some(now_unix_ms().unwrap()),
            claimant_pid: None,
        };
        let claimed = request_path(&root, "claimed", &request.request_id).unwrap();
        atomic_private_json(&claimed, &request).unwrap();

        let recovered = recover_abandoned_claims_in(&root).unwrap();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].status, "failed");
        assert!(!claimed.exists());
        assert!(request_path(&root, "receipts", &request.request_id)
            .unwrap()
            .exists());
        let _ = fs::remove_dir_all(root);
    }
}
