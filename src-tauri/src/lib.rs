mod agent;
mod agent_changes;
mod agent_editor_diagnostics;
mod agent_git;
mod agent_lifecycle;
mod agent_models;
mod agent_plugins;
mod agent_preview;
mod agent_process;
mod agent_quick_open;
mod agent_registry;
mod agent_rich_preview;
mod agent_sandbox;
mod agent_worktree;
#[cfg(feature = "orca-atelier-cli")]
mod atelier_cli;
#[cfg(feature = "orca-automations")]
mod automations;
mod clipboard;
#[cfg(feature = "orca-computer-use")]
mod computer_use;
mod control_plane;
mod credentials;
#[cfg(feature = "orca-dev-services")]
mod dev_services;
#[cfg(feature = "orca-github-workflows")]
mod github_workflows;
#[cfg(feature = "orca-linear-workflows")]
mod linear_workflows;
#[cfg(feature = "orca-mobile-control")]
mod mobile_continuity;
#[cfg(feature = "orca-mobile-control")]
mod mobile_control;
#[cfg(feature = "orca-provider-usage")]
mod provider_usage;
mod pty;
mod pty_output;
mod pty_supervisor;
#[cfg(feature = "orca-remote-followup")]
mod remote_followup;
mod runtime_receipt;
#[cfg(feature = "orca-ssh-workspaces")]
mod ssh_workspaces;
mod stella;
mod subscription_usage;
mod updater_canary;
mod upstream_check;

use serde::Serialize;
use tauri::{Emitter, Manager};

pub fn run_pty_supervisor() -> Result<(), String> {
    pty_supervisor::run_from_env()
}

pub fn run_oauth_browser_probe(provider: &str) -> Result<(), String> {
    credentials::open_oauth_browser_probe(provider)
}

pub fn run_oauth_browser_url(url: &str) -> Result<(), String> {
    credentials::open_oauth_browser_helper_url(url)
}

pub fn run_renderer_ready_probe() -> Result<(), String> {
    runtime_receipt::run_renderer_ready_probe()
}

pub fn run_updater_canary(config_path: &str) -> Result<(), String> {
    updater_canary::run(config_path)
}

#[cfg(feature = "orca-atelier-cli")]
pub fn run_atelier_cli(args: &[String]) -> Option<Result<(), String>> {
    atelier_cli::try_run(args)
}

#[cfg(not(feature = "orca-atelier-cli"))]
pub fn run_atelier_cli(_args: &[String]) -> Option<Result<(), String>> {
    None
}

#[cfg(target_os = "windows")]
fn configure_background_command(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

fn reveal_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        log::debug!("revealing existing main window");
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    match tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
        .title("Atelier")
        .inner_size(1600.0, 900.0)
        .min_inner_size(560.0, 420.0)
        .resizable(true)
        .decorations(true)
        .build()
    {
        Ok(window) => {
            log::debug!("created missing main window");
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();
        }
        Err(err) => eprintln!("reveal main window: {err}"),
    }
}

/// 진단 파일들이 저장되는 비공개 앱 캐시 디렉토리. macOS는 ~/Library/Caches/com.atelier.app.
/// /tmp 대신 사용자 전용 디렉토리로 옮겨 world-readable 노출을 차단한다.
pub(crate) fn app_cache_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    #[cfg(target_os = "macos")]
    let dir = std::path::PathBuf::from(&home).join("Library/Caches/com.atelier.app");
    #[cfg(not(target_os = "macos"))]
    let dir = std::path::PathBuf::from(&home).join(".cache/atelier");
    let _ = std::fs::create_dir_all(&dir);
    // macOS 디렉토리 권한 0700 (소유자만 진입 가능)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&dir) {
            let mut p = meta.permissions();
            p.set_mode(0o700);
            let _ = std::fs::set_permissions(&dir, p);
        }
    }
    dir
}

/// 파일 권한 0600 (소유자만 read/write)로 강제 설정.
#[cfg(unix)]
pub(crate) fn chmod_600(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(path) {
        let mut p = meta.permissions();
        p.set_mode(0o600);
        let _ = std::fs::set_permissions(path, p);
    }
}
#[cfg(not(unix))]
pub(crate) fn chmod_600(_: &std::path::Path) {}

#[tauri::command]
async fn dump_debug(content: String) -> std::result::Result<(), String> {
    // /tmp는 world-readable. 사용자 전용 cache dir로 이동.
    let path = app_cache_dir().join("debug.json");
    std::fs::write(&path, content).map_err(|e| format!("dump_debug write: {e}"))?;
    chmod_600(&path);
    Ok(())
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[derive(Serialize)]
struct RuntimeInstallInfo {
    exe_path: String,
    windows_package_full_name: Option<String>,
    windows_store_like: bool,
    github_updater_available: bool,
    app_version: String,
    platform: String,
    architecture: String,
    smart_app_control_state: Option<String>,
    oauth_browser_handoff: String,
}

#[cfg(any(target_os = "windows", test))]
fn windows_store_like_install(exe_path: &str, package_full_name: Option<&str>) -> bool {
    if cfg!(feature = "store-build") {
        return true;
    }
    if package_full_name.is_some_and(|value| !value.trim().is_empty()) {
        return true;
    }
    let lower = exe_path.to_ascii_lowercase().replace('/', "\\");
    lower.contains("\\windowsapps\\")
}

#[cfg(target_os = "windows")]
fn windows_package_full_name() -> Option<String> {
    use windows_sys::Win32::Foundation::{
        APPMODEL_ERROR_NO_PACKAGE, ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS,
    };
    use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;

    let mut length = 0_u32;
    let status = unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) };
    if status == APPMODEL_ERROR_NO_PACKAGE || length == 0 {
        return None;
    }
    if status != ERROR_INSUFFICIENT_BUFFER {
        return None;
    }

    let mut buffer = vec![0_u16; length as usize];
    let status = unsafe { GetCurrentPackageFullName(&mut length, buffer.as_mut_ptr()) };
    if status != ERROR_SUCCESS {
        return None;
    }
    let end = buffer
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(buffer.len());
    String::from_utf16(&buffer[..end])
        .ok()
        .filter(|value| !value.is_empty())
}

#[cfg(any(target_os = "windows", test))]
fn smart_app_control_state_label(value: u32) -> String {
    match value {
        0 => "Off".to_string(),
        1 => "On".to_string(),
        2 => "Evaluation".to_string(),
        other => format!("Unknown({other})"),
    }
}

#[cfg(target_os = "windows")]
fn windows_smart_app_control_state() -> Option<String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD,
    };

    fn wide(value: &str) -> Vec<u16> {
        OsStr::new(value).encode_wide().chain(Some(0)).collect()
    }

    let subkey = wide(r"SYSTEM\CurrentControlSet\Control\CI\Policy");
    let value_name = wide("VerifiedAndReputablePolicyState");
    let mut value = 0_u32;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            subkey.as_ptr(),
            value_name.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            std::ptr::addr_of_mut!(value).cast(),
            &mut size,
        )
    };
    (status == 0).then(|| smart_app_control_state_label(value))
}

#[cfg(not(target_os = "windows"))]
fn windows_smart_app_control_state() -> Option<String> {
    None
}

fn oauth_browser_handoff_contract() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "COM STA / ShellExecuteExW"
    }
    #[cfg(target_os = "macos")]
    {
        "/usr/bin/open"
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        "xdg-open"
    }
}

#[tauri::command]
async fn runtime_install_info() -> std::result::Result<RuntimeInstallInfo, String> {
    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    let exe_path = exe.to_string_lossy().into_owned();

    #[cfg(target_os = "windows")]
    let windows_package_full_name = windows_package_full_name();

    #[cfg(target_os = "windows")]
    let windows_store_like =
        windows_store_like_install(&exe_path, windows_package_full_name.as_deref());

    #[cfg(not(target_os = "windows"))]
    let windows_store_like = cfg!(feature = "store-build");

    #[cfg(not(target_os = "windows"))]
    let windows_package_full_name = None;

    Ok(RuntimeInstallInfo {
        exe_path,
        windows_package_full_name,
        windows_store_like,
        github_updater_available: cfg!(not(feature = "store-build")),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        smart_app_control_state: windows_smart_app_control_state(),
        oauth_browser_handoff: oauth_browser_handoff_contract().to_string(),
    })
}

#[cfg(test)]
mod runtime_install_tests {
    use super::{smart_app_control_state_label, windows_store_like_install};

    #[test]
    fn maps_smart_app_control_registry_contract() {
        assert_eq!(smart_app_control_state_label(0), "Off");
        assert_eq!(smart_app_control_state_label(1), "On");
        assert_eq!(smart_app_control_state_label(2), "Evaluation");
        assert_eq!(smart_app_control_state_label(9), "Unknown(9)");
    }

    #[test]
    fn detects_windows_store_paths_and_package_identity() {
        assert!(windows_store_like_install(
            r"C:\\Program Files\\WindowsApps\\BYKAYLE.Atelier_1.0.0.0_x64__abc\\Atelier.exe",
            None,
        ));
        assert!(windows_store_like_install(
            r"C:\\Program Files\\Atelier\\Atelier.exe",
            Some("kansic.AtelierAgent_1.0.0.0_x64__publisher"),
        ));
    }

    #[cfg(not(feature = "store-build"))]
    #[test]
    fn normal_windows_install_is_not_store_like() {
        assert!(!windows_store_like_install(
            r"C:\\Program Files\\Atelier Agent\\Atelier.exe",
            None,
        ));
    }

    #[cfg(feature = "store-build")]
    #[test]
    fn store_feature_marks_every_install_store_like() {
        assert!(windows_store_like_install(
            r"C:\\Program Files\\Atelier\\Atelier.exe",
            None,
        ));
    }
}

fn canonical_home_path() -> std::result::Result<std::path::PathBuf, String> {
    let home = std::env::var_os("HOME")
        .filter(|value| !value.is_empty())
        .or_else(|| std::env::var_os("USERPROFILE").filter(|value| !value.is_empty()))
        .ok_or_else(|| "HOME/USERPROFILE not set".to_string())?;
    std::fs::canonicalize(&home).map_err(|e| format!("canonicalize home: {e}"))
}

/// 사용자 홈 디렉토리를 root로 간주하는 sandbox. 입력 경로가 홈 하위가 아니면 거부.
/// symlink는 canonicalize 결과로 평가되어 외부로 탈출 불가.
fn sandbox_path(input: &str) -> std::result::Result<std::path::PathBuf, String> {
    let home_c = canonical_home_path()?;
    let target = if input.is_empty() {
        home_c.clone()
    } else {
        std::path::PathBuf::from(input)
    };
    let target_c = std::fs::canonicalize(&target)
        .map_err(|e| format!("canonicalize {}: {e}", target.display()))?;
    if !target_c.starts_with(&home_c) {
        return Err(format!(
            "sandbox violation: {} is outside the user home",
            target.display()
        ));
    }
    Ok(target_c)
}

fn normalized_path_for_match(path: &std::path::Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn configured_hermes_roots(home: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut roots = vec![
        home.join(".hermes"),
        home.join("AppData").join("Local").join("hermes"),
    ];

    if let Some(configured) = std::env::var_os("HERMES_HOME").filter(|value| !value.is_empty()) {
        roots.push(std::path::PathBuf::from(configured));
    }
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA").filter(|value| !value.is_empty())
    {
        roots.push(std::path::PathBuf::from(local_app_data).join("hermes"));
    }

    for root in &mut roots {
        if root.is_relative() {
            *root = home.join(&*root);
        }
        if let Ok(canonical) = std::fs::canonicalize(&*root) {
            *root = canonical;
        }
    }
    roots.sort_by_key(|root| normalized_path_for_match(root));
    roots.dedup_by(|left, right| {
        normalized_path_for_match(left) == normalized_path_for_match(right)
    });
    roots
}

fn hermes_credential_relative_path(relative: &str) -> bool {
    let relative = relative.trim_matches('/');
    let basename = relative.rsplit('/').next().unwrap_or(relative);

    relative == "auth"
        || relative.starts_with("auth/")
        || relative == "mcp-tokens"
        || relative.starts_with("mcp-tokens/")
        || basename == "auth.json"
        || basename.starts_with("auth.json.")
        || matches!(
            basename,
            "auth.lock" | ".env" | ".anthropic_oauth.json" | "webhook_subscriptions.json"
        )
}

fn sensitive_home_path_with_hermes_roots(
    home: &std::path::Path,
    resolved: &std::path::Path,
    hermes_roots: &[std::path::PathBuf],
) -> Option<&'static str> {
    let relative = resolved.strip_prefix(home).ok()?;
    let normalized = relative
        .iter()
        .map(|part| part.to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
        .to_ascii_lowercase();

    const BLOCKED_DIRECTORIES: &[&str] = &[
        ".ssh",
        ".gnupg",
        ".aws",
        ".azure",
        ".config/gcloud",
        "library/keychains",
    ];
    for blocked in BLOCKED_DIRECTORIES {
        if normalized == *blocked || normalized.starts_with(&format!("{blocked}/")) {
            return Some(blocked);
        }
    }

    const BLOCKED_FILES: &[&str] = &[
        ".docker/config.json",
        ".kube/config",
        ".codex/auth.json",
        ".claude/.credentials.json",
        ".config/gh/hosts.yml",
        ".npmrc",
        ".pypirc",
        ".netrc",
        ".git-credentials",
    ];
    for blocked in BLOCKED_FILES {
        if normalized == *blocked {
            return Some(blocked);
        }
    }

    for blocked in [".codex/auth.json", ".claude/.credentials.json"] {
        if normalized.starts_with(&format!("{blocked}.")) {
            return Some("provider credential backup");
        }
    }

    let resolved_normalized = normalized_path_for_match(resolved);
    for root in hermes_roots {
        let root_normalized = normalized_path_for_match(root);
        let Some(relative) = resolved_normalized
            .strip_prefix(&format!("{root_normalized}/"))
            .or_else(|| (resolved_normalized == root_normalized).then_some(""))
        else {
            continue;
        };
        if hermes_credential_relative_path(relative) {
            return Some("Hermes provider credential");
        }
    }

    None
}

fn sensitive_home_path(home: &std::path::Path, resolved: &std::path::Path) -> Option<&'static str> {
    sensitive_home_path_with_hermes_roots(home, resolved, &configured_hermes_roots(home))
}

/// 디렉토리 내용을 JS에 전달. 숨김 파일 제외, 디렉토리가 이름순으로 상단.
/// HOME 외부 경로는 sandbox에서 거부.
#[tauri::command]
async fn list_dir(path: String) -> std::result::Result<Vec<DirEntry>, String> {
    let resolved = sandbox_path(&path)?;
    let rd = std::fs::read_dir(&resolved)
        .map_err(|e| format!("list_dir {}: {e}", resolved.display()))?;
    let mut out: Vec<DirEntry> = rd
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            }
            let meta = e.metadata().ok();
            Some(DirEntry {
                name,
                path: e.path().to_string_lossy().into_owned(),
                is_dir: meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
            })
        })
        .collect();
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}

/// 작업 폴더 안의 파일을 빠르게 찾는다. 대형 생성 디렉터리와 숨김 폴더는
/// 기본 제외하고 결과/방문 수를 제한해 renderer 입력이 시스템을 막지 않게 한다.
#[tauri::command]
async fn search_workspace_files(
    root: String,
    query: String,
    max_results: Option<usize>,
) -> std::result::Result<Vec<DirEntry>, String> {
    use std::collections::VecDeque;

    let resolved_root = sandbox_path(&root)?;
    if !resolved_root.is_dir() {
        return Err("search_workspace_files: root is not a directory".to_string());
    }
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }

    const SKIP_DIRECTORIES: &[&str] = &[
        ".git",
        ".next",
        ".turbo",
        "node_modules",
        "target",
        "dist",
        "build",
        "out",
        "vendor",
    ];
    const MAX_VISITED: usize = 20_000;
    let limit = max_results.unwrap_or(80).clamp(1, 200);
    let mut queue = VecDeque::from([resolved_root.clone()]);
    let mut visited = 0usize;
    let mut matches = Vec::new();

    while let Some(directory) = queue.pop_front() {
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            visited += 1;
            if visited > MAX_VISITED || matches.len() >= limit {
                break;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                if !SKIP_DIRECTORIES.contains(&name.as_str()) {
                    queue.push_back(entry.path());
                }
                continue;
            }
            if !file_type.is_file() {
                continue;
            }

            let entry_path = entry.path();
            let relative = entry_path
                .strip_prefix(&resolved_root)
                .unwrap_or(entry_path.as_path())
                .to_string_lossy()
                .to_lowercase();
            if !relative.contains(&needle) {
                continue;
            }
            let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
            matches.push(DirEntry {
                name,
                path: entry_path.to_string_lossy().into_owned(),
                is_dir: false,
                size,
            });
        }
        if visited > MAX_VISITED || matches.len() >= limit {
            break;
        }
    }

    matches.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
    });
    Ok(matches)
}

/// 텍스트 파일 읽기. 상한 2MB. HOME 외부 sandbox와 공급자 자격증명 경로를 거부.
#[tauri::command]
async fn read_text_file(path: String) -> std::result::Result<String, String> {
    let resolved = sandbox_path(&path)?;
    let home_c = canonical_home_path()?;
    if let Some(blocked) = sensitive_home_path(&home_c, &resolved) {
        return Err(format!("blocked sensitive path: {blocked}"));
    }
    let meta = std::fs::metadata(&resolved).map_err(|e| format!("stat: {e}"))?;
    if meta.len() > 2 * 1024 * 1024 {
        return Err(format!("file too large: {} bytes", meta.len()));
    }
    std::fs::read_to_string(&resolved).map_err(|e| format!("read_text_file: {e}"))
}

/// 텍스트 파일 저장. HOME sandbox/자격증명 차단에 더해 활성 작업 루트
/// 밖으로 쓰지 못하게 하고 같은 디렉터리의 임시 파일로 원자 교체한다.
#[tauri::command]
async fn write_text_file(
    root: String,
    path: String,
    contents: String,
) -> std::result::Result<(), String> {
    const MAX_TEXT_BYTES: usize = 2 * 1024 * 1024;
    if contents.len() > MAX_TEXT_BYTES {
        return Err(format!("file too large: {} bytes", contents.len()));
    }

    let resolved_root = sandbox_path(&root)?;
    if !resolved_root.is_dir() {
        return Err("write_text_file: workspace root is not a directory".to_string());
    }
    let resolved = sandbox_path(&path)?;
    if !resolved.starts_with(&resolved_root) {
        return Err("write_text_file: target is outside the active workspace".to_string());
    }
    let home_c = canonical_home_path()?;
    if let Some(blocked) = sensitive_home_path(&home_c, &resolved) {
        return Err(format!("blocked sensitive path: {blocked}"));
    }
    let meta = std::fs::metadata(&resolved).map_err(|e| format!("stat: {e}"))?;
    if !meta.is_file() {
        return Err("write_text_file: target is not a regular file".to_string());
    }

    #[cfg(windows)]
    std::fs::write(&resolved, contents.as_bytes()).map_err(|e| format!("write_text_file: {e}"))?;

    #[cfg(not(windows))]
    {
        let parent = resolved
            .parent()
            .ok_or_else(|| "write_text_file: target has no parent directory".to_string())?;
        let file_name = resolved
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "write_text_file: invalid file name".to_string())?;
        let temp_path = parent.join(format!(".{file_name}.atelier-save-{}", std::process::id()));

        std::fs::write(&temp_path, contents.as_bytes())
            .map_err(|e| format!("write_text_file temp: {e}"))?;
        if let Err(error) = std::fs::set_permissions(&temp_path, meta.permissions()) {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("write_text_file permissions: {error}"));
        }
        if let Err(error) = std::fs::rename(&temp_path, &resolved) {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("write_text_file replace: {error}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod sensitive_path_tests {
    use super::{sensitive_home_path, sensitive_home_path_with_hermes_roots};
    use std::path::{Path, PathBuf};

    #[test]
    fn blocks_provider_and_shell_credential_paths() {
        let home = Path::new("/Users/example");
        for path in [
            "/Users/example/.hermes/auth.json",
            "/Users/example/.hermes/auth.json.corrupt",
            "/Users/example/.hermes/profiles/coder/auth.json",
            "/Users/example/.hermes/.env",
            "/Users/example/.hermes/auth/google_oauth.json",
            "/Users/example/.hermes/mcp-tokens/github.json",
            "/Users/example/AppData/Local/hermes/auth.json",
            "/Users/example/.codex/auth.json",
            "/Users/example/.codex/auth.json.backup",
            "/Users/example/.claude/.credentials.json",
            "/Users/example/.claude/.credentials.json.backup",
            "/Users/example/.ssh/id_ed25519",
            "/Users/example/.config/gh/hosts.yml",
            "/Users/example/.npmrc",
        ] {
            assert!(
                sensitive_home_path(home, Path::new(path)).is_some(),
                "{path}"
            );
        }
    }

    #[test]
    fn blocks_credentials_under_configured_hermes_root() {
        let home = Path::new("/Users/example");
        let roots = vec![PathBuf::from(
            "/Users/example/Library/Application Support/Atelier/Hermes",
        )];
        for path in [
            "/Users/example/Library/Application Support/Atelier/Hermes/auth.json",
            "/Users/example/Library/Application Support/Atelier/Hermes/auth.json.corrupt",
            "/Users/example/Library/Application Support/Atelier/Hermes/mcp-tokens/github.json",
        ] {
            assert!(
                sensitive_home_path_with_hermes_roots(home, Path::new(path), &roots).is_some(),
                "{path}"
            );
        }
    }

    #[test]
    fn allows_project_files_with_generic_auth_names() {
        let home = Path::new("/Users/example");
        for path in [
            "/Users/example/Service/app/auth.json",
            "/Users/example/Service/app/.env.example",
            "/Users/example/.hermes/skills/research/SKILL.md",
        ] {
            assert!(
                sensitive_home_path(home, Path::new(path)).is_none(),
                "{path}"
            );
        }
    }
}

#[tauri::command]
fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".into())
}

fn cli_path_extras() -> Vec<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let userprofile = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .map(std::path::PathBuf::from)
            .unwrap_or_default();
        let localappdata = std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from);
        let programfiles = std::env::var_os("ProgramFiles").map(std::path::PathBuf::from);
        let programfiles_x86 = std::env::var_os("ProgramFiles(x86)").map(std::path::PathBuf::from);
        let mut extras = Vec::new();
        if !userprofile.as_os_str().is_empty() {
            extras.extend([
                userprofile.join("AppData").join("Roaming").join("npm"),
                userprofile.join(".claude").join("local"),
                userprofile.join(".claude").join("local").join("bin"),
                userprofile.join(".local").join("bin"),
            ]);
        }
        if let Some(path) = localappdata {
            extras.extend([
                path.join("Programs").join("nodejs"),
                path.join("hermes").join("hermes-agent"),
                path.join("hermes")
                    .join("hermes-agent")
                    .join("venv")
                    .join("Scripts"),
                path.join("hermes").join("node"),
            ]);
        }
        if let Some(path) = programfiles {
            extras.extend([
                path.join("nodejs"),
                path.join("Git").join("bin"),
                path.join("Git").join("cmd"),
            ]);
        }
        if let Some(path) = programfiles_x86 {
            extras.extend([
                path.join("nodejs"),
                path.join("Git").join("bin"),
                path.join("Git").join("cmd"),
            ]);
        }
        extras
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut extras = Vec::new();
        if let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) {
            extras.extend([
                home.join(".claude").join("local"),
                home.join(".local").join("bin"),
                home.join(".npm-global").join("bin"),
                home.join("bin"),
            ]);
        }
        if cfg!(target_os = "macos") {
            extras.extend([
                std::path::PathBuf::from("/opt/homebrew/bin"),
                std::path::PathBuf::from("/opt/homebrew/sbin"),
            ]);
        }
        extras.extend([
            std::path::PathBuf::from("/usr/local/bin"),
            std::path::PathBuf::from("/usr/local/sbin"),
            std::path::PathBuf::from("/usr/bin"),
            std::path::PathBuf::from("/bin"),
            std::path::PathBuf::from("/usr/sbin"),
            std::path::PathBuf::from("/sbin"),
        ]);
        extras
    }
}

fn path_dedup_key(path: &std::path::Path) -> String {
    #[cfg(target_os = "windows")]
    {
        path.to_string_lossy().replace('/', "\\").to_lowercase()
    }
    #[cfg(not(target_os = "windows"))]
    {
        path.to_string_lossy().into_owned()
    }
}

fn merged_cli_path(existing: Option<std::ffi::OsString>) -> std::ffi::OsString {
    let mut seen = std::collections::HashSet::new();
    let mut paths = Vec::new();
    for path in cli_path_extras().into_iter().chain(
        existing
            .as_deref()
            .into_iter()
            .flat_map(std::env::split_paths),
    ) {
        if path.as_os_str().is_empty() || !seen.insert(path_dedup_key(&path)) {
            continue;
        }
        paths.push(path);
    }
    std::env::join_paths(paths).unwrap_or_else(|error| {
        log::warn!("Could not construct augmented CLI PATH: {error}");
        existing.unwrap_or_default()
    })
}

pub(crate) fn augmented_cli_path() -> String {
    merged_cli_path(std::env::var_os("PATH"))
        .to_string_lossy()
        .into_owned()
}

#[cfg(target_os = "windows")]
pub(crate) fn command_exists_in_augmented_path(command: &str) -> bool {
    let command = command.trim();
    if command.is_empty() {
        return false;
    }

    let command_path = std::path::Path::new(command);
    let mut names = vec![command.to_string()];
    if command_path.extension().is_none() {
        let pathext =
            std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
        for ext in pathext
            .split(';')
            .map(str::trim)
            .filter(|ext| !ext.is_empty())
        {
            names.push(format!("{command}{ext}"));
        }
    }

    if command_path.is_absolute() || command.contains('/') || command.contains('\\') {
        return names
            .iter()
            .any(|name| std::path::Path::new(name).is_file());
    }

    std::env::split_paths(&augmented_cli_path())
        .any(|dir| names.iter().any(|name| dir.join(name).is_file()))
}

fn valid_command_name(command: &str) -> bool {
    !command.is_empty()
        && command.len() <= 80
        && command
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

#[tauri::command]
async fn command_exists(command: String) -> std::result::Result<bool, String> {
    let command = command.trim().to_string();
    if !valid_command_name(&command) {
        return Err("invalid command name".into());
    }
    if command == "grok" {
        return Ok(credentials::grok_executable_path().is_some());
    }
    if command == "gjc" {
        return Ok(credentials::gajecode_executable_path().is_some());
    }
    if command == "hermes" {
        return Ok(credentials::hermes_executable_path().is_some());
    }

    #[cfg(target_os = "windows")]
    {
        Ok(command_exists_in_augmented_path(&command))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = std::process::Command::new("sh")
            .arg("-lc")
            .arg("command -v \"$1\" >/dev/null 2>&1")
            .arg("sh")
            .arg(&command)
            .env("PATH", augmented_cli_path())
            .status()
            .map_err(|e| format!("command -v {command}: {e}"))?;
        Ok(status.success())
    }
}

/// design-engine 리소스 읽기 — atelier 빌트인 디자인 두뇌. 번들된
/// `resources/design-engine/` 하위만 접근 허용. path traversal 차단.
#[tauri::command]
async fn read_design_resource<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    relpath: String,
) -> std::result::Result<String, String> {
    if relpath.contains("..") || relpath.starts_with('/') {
        return Err(format!("invalid resource path: {relpath}"));
    }
    // 1) 번들 리소스 우선 (production)
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?;
    let candidate1 = resource_dir.join("resources/design-engine").join(&relpath);
    if candidate1.exists() {
        return std::fs::read_to_string(&candidate1)
            .map_err(|e| format!("read resource {}: {e}", candidate1.display()));
    }
    // 2) dev 모드 fallback — src-tauri/resources 직접 (vite dev에서 번들 미생성)
    let cwd = std::env::current_dir().map_err(|e| format!("cwd: {e}"))?;
    // cwd가 src-tauri 또는 그 부모 어디든 대응
    let candidates_dev = [
        cwd.join("resources/design-engine").join(&relpath),
        cwd.join("src-tauri/resources/design-engine").join(&relpath),
        cwd.parent()
            .map(|p| p.join("src-tauri/resources/design-engine").join(&relpath))
            .unwrap_or_default(),
    ];
    for c in &candidates_dev {
        if c.exists() {
            return std::fs::read_to_string(c)
                .map_err(|e| format!("read dev resource {}: {e}", c.display()));
        }
    }
    Err(format!(
        "design-engine resource not found: {relpath} (looked in bundle + dev paths)"
    ))
}

/// 디자인 산출물 저장. ~/Library/Application Support/com.atelier.app/projects/{projectId}/{relpath}.
/// projectId/relpath 모두 path traversal 차단.
#[tauri::command]
async fn save_design_artifact(
    project_id: String,
    relpath: String,
    content: String,
) -> std::result::Result<String, String> {
    let valid_id = |s: &str| {
        s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    };
    if !valid_id(&project_id) || project_id.is_empty() {
        return Err("invalid project_id".into());
    }
    if relpath.contains("..") || relpath.starts_with('/') {
        return Err(format!("invalid relpath: {relpath}"));
    }
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let base = std::path::PathBuf::from(&home)
        .join("Library/Application Support/com.atelier.app/projects")
        .join(&project_id);
    let target = base.join(&relpath);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    std::fs::write(&target, content).map_err(|e| format!("write artifact: {e}"))?;
    Ok(target.to_string_lossy().into_owned())
}

/// 디자인 프로젝트 폴더를 Finder/탐색기에서 연다. project_id 검증 후 macOS=`open`, 기타=폴더 경로 반환만.
#[tauri::command]
async fn open_design_project_dir(project_id: String) -> std::result::Result<String, String> {
    let valid_id = |s: &str| {
        s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    };
    if !valid_id(&project_id) || project_id.is_empty() {
        return Err("invalid project_id".into());
    }
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let target = std::path::PathBuf::from(&home)
        .join("Library/Application Support/com.atelier.app/projects")
        .join(&project_id);
    if !target.exists() {
        std::fs::create_dir_all(&target).map_err(|e| format!("mkdir: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("open: {e}"))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("explorer: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        // xdg-open. 없으면 무시 (경로만 반환)
        let _ = std::process::Command::new("xdg-open").arg(&target).spawn();
    }
    Ok(target.to_string_lossy().into_owned())
}

/// 디자인 프로젝트 폴더를 zip으로 묶어 Downloads로 내보낸다.
/// 1) project 폴더 안에 INDEX.md 생성 (산출물 매니페스트)
/// 2) `~/Downloads/atelier-<project_id>-<unix_ts>.zip` 생성 (system zip 사용)
/// 3) macOS에서는 Finder에서 reveal (`open -R`)
/// 반환: zip 파일 절대 경로
#[tauri::command]
async fn export_design_project_zip(project_id: String) -> std::result::Result<String, String> {
    let valid_id = |s: &str| {
        s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    };
    if !valid_id(&project_id) || project_id.is_empty() {
        return Err("invalid project_id".into());
    }
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let projects_root = std::path::PathBuf::from(&home)
        .join("Library/Application Support/com.atelier.app/projects");
    let project_dir = projects_root.join(&project_id);
    if !project_dir.exists() {
        return Err(format!("project not found: {project_id}"));
    }

    // INDEX.md 생성
    let index_md = generate_project_index(&project_dir)
        .unwrap_or_else(|e| format!("# Atelier Design Project\n\n(INDEX 생성 실패: {e})\n"));
    let index_path = project_dir.join("INDEX.md");
    std::fs::write(&index_path, index_md).map_err(|e| format!("write INDEX.md: {e}"))?;

    // 출력 위치 — ~/Downloads/atelier-<id>-<ts>.zip
    let downloads = std::path::PathBuf::from(&home).join("Downloads");
    if !downloads.exists() {
        std::fs::create_dir_all(&downloads).map_err(|e| format!("mkdir Downloads: {e}"))?;
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let zip_name = format!("atelier-{}-{}.zip", project_id, ts);
    let zip_path = downloads.join(&zip_name);

    // 압축 — OS별 다른 도구. macOS/Linux는 `zip`, Windows는 PowerShell Compress-Archive
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let status = std::process::Command::new("zip")
            .current_dir(&projects_root)
            .arg("-r")
            .arg("-q")
            .arg(&zip_path)
            .arg(&project_id)
            .status()
            .map_err(|e| format!("zip spawn: {e}"))?;
        if !status.success() {
            return Err(format!("zip failed (exit {:?})", status.code()));
        }
    }
    #[cfg(target_os = "windows")]
    {
        // PowerShell Compress-Archive — Windows 기본 내장
        let src = project_dir.to_string_lossy().to_string();
        let dst = zip_path.to_string_lossy().to_string();
        let ps_cmd = format!(
            "Compress-Archive -Path '{}' -DestinationPath '{}' -Force",
            src, dst
        );
        let status = {
            let mut command = std::process::Command::new("powershell");
            configure_background_command(&mut command);
            command
                .arg("-NoProfile")
                .arg("-WindowStyle")
                .arg("Hidden")
                .arg("-Command")
                .arg(&ps_cmd)
                .status()
                .map_err(|e| format!("powershell spawn: {e}"))?
        };
        if !status.success() {
            return Err(format!(
                "Compress-Archive failed (exit {:?})",
                status.code()
            ));
        }
    }

    // 결과 zip을 OS 파일 탐색기에서 reveal
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&zip_path)
            .spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", zip_path.to_string_lossy()))
            .spawn();
    }

    Ok(zip_path.to_string_lossy().into_owned())
}

/// 프로젝트 폴더의 산출물을 스캔해 INDEX.md markdown을 생성.
/// brief/system/wireframe/hifi/motion/review 각 산출물의 존재 여부 + 상대 경로 + 크기 표시.
fn generate_project_index(project_dir: &std::path::Path) -> std::result::Result<String, String> {
    let mut out = String::new();
    out.push_str("# Atelier Design Project\n\n");
    out.push_str(&format!(
        "프로젝트 ID: `{}`\n\n",
        project_dir
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("(unknown)")
    ));
    out.push_str("## 산출물\n\n");
    let buckets: &[(&str, &str)] = &[
        ("system/tokens.md", "Stage 2 — 디자인 토큰"),
        ("wireframe/", "Stage 3 — Wireframe 3안"),
        ("hifi/", "Stage 4 — Hi-fi"),
        ("motion/", "Stage 5 — Motion"),
        ("review/report.md", "Stage 6 — Review"),
    ];
    for (rel, label) in buckets {
        let target = project_dir.join(rel);
        let exists = target.exists();
        out.push_str(&format!(
            "- {} **{}** — `{}`{}\n",
            if exists { "✓" } else { "—" },
            label,
            rel,
            if exists { "" } else { " (미생성)" }
        ));
        if exists && target.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&target) {
                for entry in entries.flatten() {
                    if let Some(name) = entry.file_name().to_str() {
                        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        out.push_str(&format!("  - `{}` ({} bytes)\n", name, size));
                    }
                }
            }
        }
    }
    out.push_str("\n## 사용법\n\n");
    out.push_str("HTML 산출물은 Finder에서 더블클릭하면 브라우저로 열립니다. ");
    out.push_str("markdown은 텍스트 에디터로 열거나 GitHub 등에 붙여넣어 렌더링하세요.\n");
    Ok(out)
}

/// 프로필 JSON 저장 경로.
/// macOS Sequoia+ App Data Isolation은 `~/Library/Application Support/<다른 이름>` 접근을
/// "다른 앱 데이터" 접근으로 보고 TCC 팝업을 띄울 수 있다. 그래서 실행 중에는 레거시
/// `Application Support/Atelier` 경로를 조회하지 않고 bundle id 전용 경로만 사용한다.
fn profiles_path() -> std::path::PathBuf {
    let base = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    #[cfg(target_os = "macos")]
    let dir = std::path::PathBuf::from(&base).join("Library/Application Support/com.atelier.app");
    #[cfg(not(target_os = "macos"))]
    let dir = std::path::PathBuf::from(&base).join(".atelier");
    dir.join("profiles.json")
}

/// 프로필 JSON 읽기. 없으면 빈 문자열 반환 (JS가 DEFAULT로 fallback).
#[tauri::command]
async fn load_profiles() -> std::result::Result<String, String> {
    let p = profiles_path();
    if !p.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&p).map_err(|e| format!("load_profiles: {e}"))
}

/// 프로필 JSON 쓰기. 디렉토리 자동 생성.
#[tauri::command]
async fn save_profiles(json: String) -> std::result::Result<(), String> {
    let p = profiles_path();
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    std::fs::write(&p, json).map_err(|e| format!("save_profiles: {e}"))
}

/// claude --print 모드 단발 호출. stdin으로 system+user prompt 전달, stdout 응답 한 번에 받기.
/// PTY/TUI 의존 없음. 한글/긴 prompt 모두 안전. timeout 10분.
#[tauri::command]
async fn design_claude_call(
    system_prompt: String,
    user_input: String,
) -> std::result::Result<String, String> {
    use std::io::Write;
    #[cfg(not(target_os = "windows"))]
    use std::process::Command;
    use std::process::Stdio;
    use std::time::Duration;

    let input = format!(
        "[ATELIER SYSTEM PROMPT]\n{}\n\n[USER INPUT]\n{}",
        system_prompt, user_input
    );

    // claude 실행 경로 — Finder/Explorer launch PATH 누락 회피해 명시 추가
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let path = {
        let home = std::env::var("HOME").unwrap_or_default();
        let extra = format!(
            "{home}/.claude/local:{home}/.local/bin:{home}/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        );
        format!("{}:{}", extra, std::env::var("PATH").unwrap_or_default())
    };
    #[cfg(target_os = "windows")]
    let path = {
        // Windows는 npm global이 PATH에 자동 등록 — 명시 추가는 safety
        let userprofile = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_default();
        let extra = format!(
            "{up}\\AppData\\Roaming\\npm;{up}\\.claude\\local",
            up = userprofile
        );
        format!("{};{}", extra, std::env::var("PATH").unwrap_or_default())
    };

    #[cfg(target_os = "windows")]
    let mut command = crate::agent_process::command_for_cli("claude");
    #[cfg(not(target_os = "windows"))]
    let mut command = Command::new("claude");

    let mut child = command
        .arg("--print")
        .arg("--output-format")
        .arg("text")
        .env("PATH", &path)
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("claude spawn 실패: {e}"))?;

    // stdin 쓰기 (별도 thread — child가 큰 input 다 받기 전에 deadlock 회피)
    if let Some(mut stdin) = child.stdin.take() {
        let input_bytes = input.into_bytes();
        std::thread::spawn(move || {
            let _ = stdin.write_all(&input_bytes);
        });
    }

    // 10분 timeout (큰 컨텍스트 + 50KB+ 출력 hi-fi/CI assets/Print final 대응)
    let timeout = Duration::from_secs(600);
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => break,
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    return Err("claude 응답 10분 초과".into());
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(format!("wait 실패: {e}")),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("output 수집: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!(
            "claude exit {} — stderr: {}",
            output.status.code().unwrap_or(-1),
            stderr.chars().take(500).collect::<String>()
        ));
    }

    Ok(stdout.trim().to_string())
}

/// Desktop GUI apps inherit an incomplete PATH on every supported platform.
/// Build it with the platform path API so Windows drive letters and separators
/// are never interpreted as Unix PATH syntax.
fn bootstrap_path() {
    std::env::set_var("PATH", merged_cli_path(std::env::var_os("PATH")));
}

#[cfg(test)]
mod cli_path_tests {
    use super::{merged_cli_path, path_dedup_key};
    use std::path::{Path, PathBuf};

    #[test]
    fn augmented_path_preserves_existing_entries_and_removes_duplicates() {
        let existing_entries = [
            PathBuf::from("/tmp/atelier-a"),
            PathBuf::from("/tmp/atelier-b"),
        ];
        let existing = std::env::join_paths(existing_entries.clone()).expect("test PATH");
        let merged = merged_cli_path(Some(existing));
        let paths = std::env::split_paths(&merged).collect::<Vec<_>>();

        for expected in existing_entries {
            assert!(paths.iter().any(|path| path == &expected));
        }
        let keys = paths
            .iter()
            .map(|path| path_dedup_key(path))
            .collect::<std::collections::HashSet<_>>();
        assert_eq!(keys.len(), paths.len());
    }

    #[test]
    fn path_keys_are_stable_for_platform_paths() {
        assert!(!path_dedup_key(Path::new("/tmp/atelier")).is_empty());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::try_init().ok();
    bootstrap_path();
    if let Err(error) = control_plane::recover_abandoned_claims() {
        log::warn!("Could not recover abandoned Atelier control requests: {error}");
    }
    pty::init_state();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init());
    #[cfg(not(feature = "store-build"))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    let app = builder
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "atelier-quick-open" {
                let _ = app.emit("atelier://quick-open", ());
            }
        })
        .setup(|app| {
            if let Some(menu) = app.menu() {
                let quick_open =
                    tauri::menu::MenuItemBuilder::with_id("atelier-quick-open", "Quick Open...")
                        .accelerator("CmdOrCtrl+P")
                        .build(app)?;
                let navigate =
                    tauri::menu::SubmenuBuilder::with_id(app, "atelier-navigate", "Navigate")
                        .item(&quick_open)
                        .build()?;
                menu.append(&navigate)?;
            }
            let app_handle = app.handle().clone();
            reveal_main_window(&app_handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_list,
            pty::pty_output_snapshot,
            pty::pty_ack,
            pty::session_log_load,
            pty::session_log_snapshot,
            pty::session_log_clear,
            clipboard::clipboard_save_image,
            dump_debug,
            runtime_install_info,
            runtime_receipt::renderer_ready,
            control_plane::control_requests_pending,
            control_plane::control_request_claim,
            control_plane::control_request_complete,
            #[cfg(feature = "orca-automations")]
            automations::automations_snapshot,
            #[cfg(feature = "orca-automations")]
            automations::automation_upsert,
            #[cfg(feature = "orca-automations")]
            automations::automation_set_enabled,
            #[cfg(feature = "orca-automations")]
            automations::automation_run_now,
            #[cfg(feature = "orca-automations")]
            automations::automations_tick,
            #[cfg(feature = "orca-computer-use")]
            computer_use::computer_use_status,
            #[cfg(feature = "orca-computer-use")]
            computer_use::computer_use_prepared,
            #[cfg(feature = "orca-computer-use")]
            computer_use::computer_use_set_enabled,
            #[cfg(feature = "orca-computer-use")]
            computer_use::computer_use_prepare,
            #[cfg(feature = "orca-computer-use")]
            computer_use::computer_use_authorize,
            #[cfg(feature = "orca-computer-use")]
            computer_use::computer_use_complete,
            #[cfg(feature = "orca-computer-use")]
            computer_use::computer_use_execute,
            #[cfg(feature = "orca-computer-use")]
            computer_use::computer_use_discard,
            #[cfg(feature = "orca-computer-use")]
            computer_use::computer_use_receipts,
            #[cfg(feature = "orca-dev-services")]
            dev_services::dev_services_scan,
            #[cfg(feature = "orca-dev-services")]
            dev_services::dev_service_stop_prepare,
            #[cfg(feature = "orca-dev-services")]
            dev_services::dev_service_stop_execute,
            list_dir,
            search_workspace_files,
            read_text_file,
            write_text_file,
            home_dir,
            command_exists,
            load_profiles,
            save_profiles,
            read_design_resource,
            save_design_artifact,
            open_design_project_dir,
            export_design_project_zip,
            design_claude_call,
            agent::agent_claude_send,
            agent::agent_send,
            agent::agent_runtime_capabilities,
            agent_models::claude_model_options,
            agent_models::codex_model_options,
            agent_models::openrouter_model_options,
            agent::agent_cli_command,
            agent_plugins::academic_research_install_claude_plugin,
            agent_plugins::atelier_skill_install_public_bundle,
            agent_plugins::insane_search_install_gajecode_skill,
            agent_plugins::plugin_skill_install_status,
            agent::agent_cancel,
            agent_changes::agent_change_baseline,
            agent_changes::agent_change_summary,
            agent_editor_diagnostics::agent_editor_snapshot,
            agent_editor_diagnostics::agent_editor_write,
            agent_git::agent_git_state,
            agent_git::agent_git_stage,
            agent_git::agent_git_unstage,
            agent_git::agent_git_commit,
            agent_git::agent_undo_changes,
            #[cfg(feature = "orca-github-workflows")]
            github_workflows::github_workflow_snapshot,
            #[cfg(feature = "orca-github-workflows")]
            github_workflows::github_workflow_prepare,
            #[cfg(feature = "orca-github-workflows")]
            github_workflows::github_workflow_execute,
            #[cfg(feature = "orca-github-workflows")]
            github_workflows::github_workflow_discard,
            #[cfg(feature = "orca-github-workflows")]
            github_workflows::github_workflow_receipts,
            #[cfg(feature = "orca-linear-workflows")]
            linear_workflows::linear_workflow_snapshot,
            #[cfg(feature = "orca-linear-workflows")]
            linear_workflows::linear_workflow_prepare,
            #[cfg(feature = "orca-linear-workflows")]
            linear_workflows::linear_workflow_execute,
            #[cfg(feature = "orca-linear-workflows")]
            linear_workflows::linear_workflow_discard,
            #[cfg(feature = "orca-linear-workflows")]
            linear_workflows::linear_workflow_receipts,
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::mobile_control_server_status,
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::mobile_control_network_candidates,
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::mobile_control_tailscale_status,
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::mobile_control_server_start,
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::mobile_control_server_stop,
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::mobile_control_pairing_create,
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::mobile_control_pairing_discard,
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::mobile_control_devices,
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::mobile_control_device_revoke,
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::mobile_control_device_followups_set,
            #[cfg(feature = "orca-mobile-control")]
            mobile_continuity::mobile_control_sessions_publish,
            #[cfg(feature = "orca-remote-followup")]
            remote_followup::remote_followup_proposals,
            #[cfg(feature = "orca-remote-followup")]
            remote_followup::remote_followup_prepare,
            #[cfg(feature = "orca-remote-followup")]
            remote_followup::remote_followup_execute,
            #[cfg(feature = "orca-remote-followup")]
            remote_followup::remote_followup_discard,
            #[cfg(feature = "orca-remote-followup")]
            remote_followup::remote_followup_reject,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_workspace_status,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_profile_save,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_profile_archive,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_host_probe,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_host_trust,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_connection_probe,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_remote_directory_list,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_remote_file_read,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_remote_file_write_prepare,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_remote_file_write_execute,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_terminal_launch,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_tunnel_start,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_tunnel_list,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_tunnel_retry,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_tunnel_stop,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_remote_worktree_prepare,
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::ssh_remote_worktree_execute,
            #[cfg(feature = "orca-provider-usage")]
            provider_usage::provider_usage_snapshot,
            subscription_usage::provider_subscription_usage,
            agent_worktree::agent_worktree_prepare,
            agent_worktree::agent_worktree_adopt,
            agent_preview::preview_health_check,
            agent_preview::preview_capability,
            agent_preview::preview_service_start,
            agent_preview::preview_service_status,
            agent_preview::preview_service_stop,
            agent_quick_open::agent_quick_open_index,
            agent_rich_preview::agent_rich_preview,
            stella::stella_factory_bootstrap,
            stella::stella_factory_autopilot,
            stella::stella_factory_status,
            stella::stella_project_analysis,
            stella::stella_workspace_probe,
            stella::stella_record_evidence,
            credentials::provider_status,
            credentials::provider_save_api_key,
            credentials::provider_clear_credentials,
            credentials::provider_login_oauth,
            credentials::provider_oauth_login_state,
            credentials::provider_oauth_browser_probe,
            credentials::provider_open_oauth_login_url,
            credentials::provider_submit_oauth_code,
            credentials::provider_install_cli,
            credentials::provider_prepare_managed_runtime,
            credentials::hermes_check_update,
            credentials::hermes_update,
            credentials::gajecode_check_update,
            credentials::gajecode_update,
            credentials::grok_check_update,
            credentials::grok_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::Ready => {
            reveal_main_window(app_handle);
            #[cfg(feature = "orca-mobile-control")]
            tauri::async_runtime::spawn(mobile_control::restore_server_after_restart());
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            if !has_visible_windows {
                reveal_main_window(app_handle);
            }
        }
        tauri::RunEvent::Exit => {
            #[cfg(feature = "orca-mobile-control")]
            mobile_control::stop_server();
            #[cfg(feature = "orca-ssh-workspaces")]
            ssh_workspaces::stop_all_tunnels();
        }
        _ => {}
    });
}
