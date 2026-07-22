use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const RECEIPT_SCHEMA_VERSION: u32 = 1;
const MAX_RECEIPT_AGE_MS: u64 = 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS: u64 = 5 * 60 * 1_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RendererReadyReceipt {
    schema_version: u32,
    app_version: String,
    pid: u32,
    ready_at_unix_ms: u64,
    executable_path: String,
    window_label: String,
    status: String,
}

fn receipt_path_for(executable: &Path) -> PathBuf {
    let digest = Sha256::digest(executable.to_string_lossy().as_bytes());
    let executable_id = digest[..12]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    crate::app_cache_dir().join(format!("renderer-ready-{executable_id}.json"))
}

fn now_unix_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("system clock is before Unix epoch: {error}"))
}

fn canonical_executable() -> Result<PathBuf, String> {
    let executable =
        std::env::current_exe().map_err(|error| format!("resolve current executable: {error}"))?;
    Ok(executable.canonicalize().unwrap_or(executable))
}

#[cfg(unix)]
fn process_is_alive(pid: u32) -> bool {
    let result = unsafe { libc::kill(pid as libc::pid_t, 0) };
    result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(windows)]
fn process_is_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return false;
    }
    let mut exit_code = 0u32;
    let queried = unsafe { GetExitCodeProcess(handle, &mut exit_code) } != 0;
    unsafe {
        CloseHandle(handle);
    }
    queried && exit_code == STILL_ACTIVE as u32
}

#[cfg(not(any(unix, windows)))]
fn process_is_alive(_pid: u32) -> bool {
    false
}

fn validate_receipt(
    receipt: &RendererReadyReceipt,
    expected_executable: &Path,
    now_ms: u64,
) -> Result<(), String> {
    if receipt.schema_version != RECEIPT_SCHEMA_VERSION {
        return Err(format!(
            "unsupported renderer receipt schema {}",
            receipt.schema_version
        ));
    }
    if receipt.app_version != env!("CARGO_PKG_VERSION") {
        return Err(format!(
            "renderer receipt version {} does not match {}",
            receipt.app_version,
            env!("CARGO_PKG_VERSION")
        ));
    }
    if receipt.window_label != "main" {
        return Err(format!(
            "renderer receipt came from unexpected window {}",
            receipt.window_label
        ));
    }
    if receipt.status != "ready" {
        return Err(format!(
            "renderer reported non-ready status {}",
            receipt.status
        ));
    }
    let recorded_executable = PathBuf::from(&receipt.executable_path);
    let recorded_executable = recorded_executable
        .canonicalize()
        .unwrap_or(recorded_executable);
    if recorded_executable != expected_executable {
        return Err("renderer receipt belongs to a different executable".to_string());
    }
    if receipt.ready_at_unix_ms > now_ms.saturating_add(MAX_FUTURE_SKEW_MS) {
        return Err("renderer receipt timestamp is in the future".to_string());
    }
    if now_ms.saturating_sub(receipt.ready_at_unix_ms) > MAX_RECEIPT_AGE_MS {
        return Err("renderer receipt is stale".to_string());
    }
    if !process_is_alive(receipt.pid) {
        return Err(format!(
            "renderer process {} is no longer running",
            receipt.pid
        ));
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn renderer_ready(
    window: tauri::WebviewWindow,
    status: String,
) -> Result<RendererReadyReceipt, String> {
    if status != "ready" && status != "error" {
        return Err("renderer status must be ready or error".to_string());
    }
    let executable = canonical_executable()?;
    let receipt = RendererReadyReceipt {
        schema_version: RECEIPT_SCHEMA_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        pid: std::process::id(),
        ready_at_unix_ms: now_unix_ms()?,
        executable_path: executable.to_string_lossy().into_owned(),
        window_label: window.label().to_string(),
        status,
    };
    let content = serde_json::to_vec_pretty(&receipt)
        .map_err(|error| format!("serialize renderer receipt: {error}"))?;
    let path = receipt_path_for(&executable);
    std::fs::write(&path, content)
        .map_err(|error| format!("write renderer receipt {}: {error}", path.display()))?;
    crate::chmod_600(&path);
    log::info!(
        "renderer status: version={} pid={} window={} status={}",
        receipt.app_version,
        receipt.pid,
        receipt.window_label,
        receipt.status
    );
    Ok(receipt)
}

pub(crate) fn run_renderer_ready_probe() -> Result<(), String> {
    let executable = canonical_executable()?;
    let path = receipt_path_for(&executable);
    let content = std::fs::read(&path)
        .map_err(|error| format!("read renderer receipt {}: {error}", path.display()))?;
    let receipt: RendererReadyReceipt = serde_json::from_slice(&content)
        .map_err(|error| format!("parse renderer receipt {}: {error}", path.display()))?;
    validate_receipt(&receipt, &executable, now_unix_ms()?)?;
    println!(
        "{}",
        serde_json::to_string(&receipt)
            .map_err(|error| format!("serialize renderer probe output: {error}"))?
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn current_receipt(now_ms: u64) -> RendererReadyReceipt {
        RendererReadyReceipt {
            schema_version: RECEIPT_SCHEMA_VERSION,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            pid: std::process::id(),
            ready_at_unix_ms: now_ms,
            executable_path: canonical_executable()
                .expect("current executable")
                .to_string_lossy()
                .into_owned(),
            window_label: "main".to_string(),
            status: "ready".to_string(),
        }
    }

    #[test]
    fn current_renderer_receipt_is_valid() {
        let now_ms = now_unix_ms().expect("current time");
        let executable = canonical_executable().expect("current executable");
        validate_receipt(&current_receipt(now_ms), &executable, now_ms)
            .expect("current receipt should validate");
    }

    #[test]
    fn stale_or_wrong_executable_receipt_is_rejected() {
        let now_ms = now_unix_ms().expect("current time");
        let executable = canonical_executable().expect("current executable");
        let mut stale = current_receipt(now_ms.saturating_sub(MAX_RECEIPT_AGE_MS + 1));
        assert!(validate_receipt(&stale, &executable, now_ms).is_err());
        stale.ready_at_unix_ms = now_ms;
        assert!(validate_receipt(&stale, Path::new("/different/atelier"), now_ms).is_err());
        stale.executable_path = executable.to_string_lossy().into_owned();
        stale.status = "error".to_string();
        assert!(validate_receipt(&stale, &executable, now_ms).is_err());
    }

    #[test]
    fn receipt_paths_are_isolated_by_executable() {
        let first = receipt_path_for(Path::new("/Applications/Atelier.app/atelier"));
        let second = receipt_path_for(Path::new("/tmp/Atelier.app/atelier"));
        assert_ne!(first, second);
        assert!(first
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.starts_with("renderer-ready-")));
    }
}
