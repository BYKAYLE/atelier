use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Url};
use tauri_plugin_shell::ShellExt;
use uuid::Uuid;

const SCHEMA_VERSION: u32 = 1;
const APPROVAL_TTL_MS: u64 = 5 * 60 * 1_000;
const MAX_RECEIPTS: usize = 500;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComputerUseInput {
    action: String,
    #[serde(default)]
    target: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComputerUsePreparedAction {
    schema_version: u32,
    action_id: String,
    action_hash: String,
    action: String,
    target: Option<String>,
    preview: String,
    expires_at_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComputerUseReceipt {
    schema_version: u32,
    receipt_id: String,
    action_id: String,
    action_hash: String,
    action: String,
    target: Option<String>,
    status: String,
    summary: String,
    created_at_ms: u64,
    completed_at_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComputerUseStatus {
    enabled: bool,
    prepared_actions: usize,
    receipts: usize,
    supported_actions: Vec<&'static str>,
}

#[derive(Clone, Debug)]
struct PreparedActionRecord {
    prepared: ComputerUsePreparedAction,
    created_at_ms: u64,
}

#[derive(Default)]
struct RuntimeState {
    enabled: bool,
    prepared: HashMap<String, PreparedActionRecord>,
}

fn runtime_state() -> &'static Mutex<RuntimeState> {
    static STATE: OnceLock<Mutex<RuntimeState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(RuntimeState::default()))
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("system clock is before Unix epoch: {error}"))
}

fn private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("create Computer Use directory {}: {error}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|error| {
            format!("secure Computer Use directory {}: {error}", path.display())
        })?;
    }
    Ok(())
}

fn root_dir() -> Result<PathBuf, String> {
    let root = crate::control_plane::application_data_dir()?
        .join("computer-use")
        .join(format!("v{SCHEMA_VERSION}"));
    private_dir(&root)?;
    private_dir(&root.join("receipts"))?;
    Ok(root)
}

fn atomic_private_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("No parent directory for {}", path.display()))?;
    private_dir(parent)?;
    let temp = parent.join(format!(".computer-use.{}.tmp", Uuid::new_v4()));
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("serialize Computer Use receipt: {error}"))?;
    fs::write(&temp, bytes)
        .map_err(|error| format!("write Computer Use receipt {}: {error}", temp.display()))?;
    crate::chmod_600(&temp);
    fs::rename(&temp, path).map_err(|error| {
        let _ = fs::remove_file(&temp);
        format!("publish Computer Use receipt {}: {error}", path.display())
    })?;
    crate::chmod_600(path);
    Ok(())
}

fn validate_url(value: &str, loopback_only: bool) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 2_048 || value.chars().any(char::is_control) {
        return Err("Computer Use URL is invalid.".to_string());
    }
    let parsed = Url::parse(value).map_err(|_| "Computer Use URL is invalid.".to_string())?;
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Computer Use URLs cannot contain credentials.".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Computer Use URL must have a host.".to_string())?;
    if loopback_only {
        if !matches!(parsed.scheme(), "http" | "https")
            || !matches!(host, "localhost" | "127.0.0.1" | "::1")
        {
            return Err("Preview actions can open only loopback HTTP addresses.".to_string());
        }
    } else if parsed.scheme() != "https" {
        return Err("Browser actions require an HTTPS address.".to_string());
    }
    Ok(parsed.to_string())
}

fn normalize_input(mut input: ComputerUseInput) -> Result<ComputerUseInput, String> {
    input.action = input.action.trim().to_ascii_lowercase();
    input.target = match input.action.as_str() {
        "atelier.focus" => None,
        "browser.open" => Some(validate_url(
            input.target.as_deref().unwrap_or_default(),
            false,
        )?),
        "preview.open" => Some(validate_url(
            input.target.as_deref().unwrap_or_default(),
            true,
        )?),
        _ => return Err("Unsupported Computer Use action.".to_string()),
    };
    Ok(input)
}

fn action_preview(input: &ComputerUseInput) -> String {
    match input.action.as_str() {
        "atelier.focus" => "Focus the Atelier main window.".to_string(),
        "browser.open" => format!(
            "Open this HTTPS address in the system browser:\n{}",
            input.target.as_deref().unwrap_or_default()
        ),
        "preview.open" => format!(
            "Open this loopback preview in the system browser:\n{}",
            input.target.as_deref().unwrap_or_default()
        ),
        _ => "Unsupported action.".to_string(),
    }
}

fn action_hash(action_id: &str, input: &ComputerUseInput) -> Result<String, String> {
    let bytes = serde_json::to_vec(&(action_id, input))
        .map_err(|error| format!("serialize Computer Use approval: {error}"))?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
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

fn cleanup_prepared(now: u64, state: &mut RuntimeState) {
    state
        .prepared
        .retain(|_, record| record.prepared.expires_at_ms >= now);
}

fn receipt_count() -> usize {
    root_dir()
        .ok()
        .and_then(|root| fs::read_dir(root.join("receipts")).ok())
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
                .count()
        })
        .unwrap_or(0)
}

fn list_receipts(limit: Option<usize>) -> Result<Vec<ComputerUseReceipt>, String> {
    let mut receipts = fs::read_dir(root_dir()?.join("receipts"))
        .map_err(|error| format!("read Computer Use receipts: {error}"))?
        .flatten()
        .filter_map(|entry| fs::read(entry.path()).ok())
        .filter_map(|bytes| serde_json::from_slice::<ComputerUseReceipt>(&bytes).ok())
        .collect::<Vec<_>>();
    receipts.sort_by_key(|receipt| std::cmp::Reverse(receipt.completed_at_ms));
    receipts.truncate(limit.unwrap_or(50).clamp(1, MAX_RECEIPTS));
    Ok(receipts)
}

#[tauri::command]
pub(crate) fn computer_use_status() -> Result<ComputerUseStatus, String> {
    let now = now_ms()?;
    let mut state = runtime_state()
        .lock()
        .map_err(|_| "Computer Use state is unavailable.".to_string())?;
    cleanup_prepared(now, &mut state);
    Ok(ComputerUseStatus {
        enabled: state.enabled,
        prepared_actions: state.prepared.len(),
        receipts: receipt_count(),
        supported_actions: vec!["atelier.focus", "browser.open", "preview.open"],
    })
}

#[tauri::command]
pub(crate) fn computer_use_set_enabled(enabled: bool) -> Result<ComputerUseStatus, String> {
    {
        let mut state = runtime_state()
            .lock()
            .map_err(|_| "Computer Use state is unavailable.".to_string())?;
        state.enabled = enabled;
        if !enabled {
            state.prepared.clear();
        }
    }
    computer_use_status()
}

#[tauri::command]
pub(crate) fn computer_use_prepare(
    input: ComputerUseInput,
) -> Result<ComputerUsePreparedAction, String> {
    let input = normalize_input(input)?;
    let now = now_ms()?;
    let mut state = runtime_state()
        .lock()
        .map_err(|_| "Computer Use state is unavailable.".to_string())?;
    if !state.enabled {
        return Err("Computer Use is disabled by the global stop switch.".to_string());
    }
    cleanup_prepared(now, &mut state);
    let action_id = Uuid::new_v4().to_string();
    let preview = action_preview(&input);
    let prepared = ComputerUsePreparedAction {
        schema_version: SCHEMA_VERSION,
        action_id: action_id.clone(),
        action_hash: action_hash(&action_id, &input)?,
        action: input.action,
        target: input.target,
        preview,
        expires_at_ms: now.saturating_add(APPROVAL_TTL_MS),
    };
    state.prepared.insert(
        action_id,
        PreparedActionRecord {
            prepared: prepared.clone(),
            created_at_ms: now,
        },
    );
    Ok(prepared)
}

fn perform(app: &AppHandle, prepared: &ComputerUsePreparedAction) -> Result<String, String> {
    match prepared.action.as_str() {
        "atelier.focus" => {
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "Atelier main window is unavailable.".to_string())?;
            window
                .unminimize()
                .map_err(|error| format!("unminimize Atelier: {error}"))?;
            window
                .show()
                .map_err(|error| format!("show Atelier: {error}"))?;
            window
                .set_focus()
                .map_err(|error| format!("focus Atelier: {error}"))?;
            Ok("Focused the Atelier main window.".to_string())
        }
        "browser.open" | "preview.open" => {
            let target = prepared
                .target
                .as_deref()
                .ok_or_else(|| "Computer Use URL is missing.".to_string())?;
            #[allow(deprecated)]
            app.shell()
                .open(target, None)
                .map_err(|error| format!("open approved URL: {error}"))?;
            Ok("Opened the approved URL in the system browser.".to_string())
        }
        _ => Err("Unsupported Computer Use action.".to_string()),
    }
}

#[tauri::command]
pub(crate) fn computer_use_execute(
    app: AppHandle,
    action_id: String,
    expected_hash: String,
) -> Result<ComputerUseReceipt, String> {
    let now = now_ms()?;
    let record = {
        let mut state = runtime_state()
            .lock()
            .map_err(|_| "Computer Use state is unavailable.".to_string())?;
        if !state.enabled {
            return Err("Computer Use is disabled by the global stop switch.".to_string());
        }
        cleanup_prepared(now, &mut state);
        let record = state.prepared.remove(action_id.trim()).ok_or_else(|| {
            "Computer Use approval is missing, expired, or already used.".to_string()
        })?;
        if !constant_time_equal(&record.prepared.action_hash, expected_hash.trim()) {
            return Err("Computer Use approval hash does not match.".to_string());
        }
        record
    };
    let execution = perform(&app, &record.prepared);
    let receipt = ComputerUseReceipt {
        schema_version: SCHEMA_VERSION,
        receipt_id: Uuid::new_v4().to_string(),
        action_id: record.prepared.action_id.clone(),
        action_hash: record.prepared.action_hash.clone(),
        action: record.prepared.action.clone(),
        target: record.prepared.target.clone(),
        status: if execution.is_ok() {
            "succeeded"
        } else {
            "failed"
        }
        .to_string(),
        summary: execution.unwrap_or_else(|error| error),
        created_at_ms: record.created_at_ms,
        completed_at_ms: now_ms()?,
    };
    let path = root_dir()?
        .join("receipts")
        .join(format!("{}.json", receipt.receipt_id));
    atomic_private_json(&path, &receipt)?;
    Ok(receipt)
}

#[tauri::command]
pub(crate) fn computer_use_discard(action_id: String) -> Result<(), String> {
    runtime_state()
        .lock()
        .map_err(|_| "Computer Use state is unavailable.".to_string())?
        .prepared
        .remove(action_id.trim());
    Ok(())
}

#[tauri::command]
pub(crate) fn computer_use_receipts(
    limit: Option<usize>,
) -> Result<Vec<ComputerUseReceipt>, String> {
    list_receipts(limit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn action_allowlist_rejects_arbitrary_automation() {
        assert!(normalize_input(ComputerUseInput {
            action: "shell.run".to_string(),
            target: Some("rm -rf /".to_string()),
        })
        .is_err());
    }

    #[test]
    fn browser_and_preview_urls_are_strictly_scoped() {
        assert!(validate_url("https://example.com/path", false).is_ok());
        assert!(validate_url("http://example.com/path", false).is_err());
        assert!(validate_url("http://127.0.0.1:5173", true).is_ok());
        assert!(validate_url("https://localhost:4173", true).is_ok());
        assert!(validate_url("https://example.com", true).is_err());
        assert!(validate_url("https://user:secret@example.com", false).is_err());
    }

    #[test]
    fn approval_hash_is_bound_to_exact_action() {
        let input = normalize_input(ComputerUseInput {
            action: "atelier.focus".to_string(),
            target: None,
        })
        .unwrap();
        let hash = action_hash("action", &input).unwrap();
        assert!(constant_time_equal(
            &hash,
            &action_hash("action", &input).unwrap()
        ));
        assert!(!constant_time_equal(&hash, "different"));
    }
}
