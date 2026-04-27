mod pty;
mod clipboard;

use serde::Serialize;
use tauri::Manager;

/// 진단 파일들이 저장되는 비공개 앱 캐시 디렉토리. macOS는 ~/Library/Caches/com.atelier.app.
/// /tmp 대신 사용자 전용 디렉토리로 옮겨 world-readable 노출을 차단한다.
fn app_cache_dir() -> std::path::PathBuf {
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
fn chmod_600(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(path) {
        let mut p = meta.permissions();
        p.set_mode(0o600);
        let _ = std::fs::set_permissions(path, p);
    }
}
#[cfg(not(unix))]
fn chmod_600(_: &std::path::Path) {}

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

/// 사용자 HOME 디렉토리를 root로 간주하는 sandbox. 입력 경로가 HOME 하위가 아니면 거부.
/// symlink는 canonicalize 결과로 평가되어 외부로 탈출 불가.
fn sandbox_path(input: &str) -> std::result::Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let home_c = std::fs::canonicalize(&home).map_err(|e| format!("canonicalize HOME: {e}"))?;
    let target = if input.is_empty() { home.clone() } else { input.to_string() };
    let target_c = std::fs::canonicalize(&target)
        .map_err(|e| format!("canonicalize {target}: {e}"))?;
    if !target_c.starts_with(&home_c) {
        return Err(format!("sandbox violation: {target} is outside HOME"));
    }
    Ok(target_c)
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

/// 텍스트 파일 읽기. 상한 2MB. HOME 외부 sandbox 거부 + 민감 경로(.ssh/.gnupg/Keychain 등) 블랙리스트.
#[tauri::command]
async fn read_text_file(path: String) -> std::result::Result<String, String> {
    let resolved = sandbox_path(&path)?;
    // 민감 디렉토리/파일 블랙리스트. HOME 하위여도 이건 차단.
    let banned = [".ssh", ".gnupg", ".aws", ".docker/config.json", "Library/Keychains"];
    let s = resolved.to_string_lossy();
    for b in &banned {
        if s.contains(b) {
            return Err(format!("blocked sensitive path: {b}"));
        }
    }
    let meta = std::fs::metadata(&resolved).map_err(|e| format!("stat: {e}"))?;
    if meta.len() > 2 * 1024 * 1024 {
        return Err(format!("file too large: {} bytes", meta.len()));
    }
    std::fs::read_to_string(&resolved).map_err(|e| format!("read_text_file: {e}"))
}

#[tauri::command]
fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".into())
}

fn augmented_cli_path() -> String {
    #[cfg(target_os = "windows")]
    {
        let userprofile = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_default();
        let existing = std::env::var("PATH").unwrap_or_default();
        let extra = format!(
            "{up}\\AppData\\Roaming\\npm;{up}\\.claude\\local;{up}\\.local\\bin",
            up = userprofile
        );
        if existing.is_empty() {
            extra
        } else {
            format!("{extra};{existing}")
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let existing = std::env::var("PATH").unwrap_or_default();
        let base = if cfg!(target_os = "macos") {
            "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        } else {
            "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        };
        let extra = if home.is_empty() {
            base.to_string()
        } else {
            format!("{home}/.claude/local:{home}/.local/bin:{home}/.npm-global/bin:{home}/bin:{base}")
        };
        if existing.is_empty() {
            extra
        } else {
            format!("{extra}:{existing}")
        }
    }
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
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("cmd.exe")
        .arg("/C")
        .arg("where")
        .arg(&command)
        .env("PATH", augmented_cli_path())
        .status()
        .map_err(|e| format!("where {command}: {e}"))?;
    #[cfg(not(target_os = "windows"))]
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
    let candidate1 = resource_dir
        .join("resources/design-engine")
        .join(&relpath);
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
    let valid_id = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
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
    let valid_id = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
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
async fn export_design_project_zip(
    project_id: String,
) -> std::result::Result<String, String> {
    let valid_id = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
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
    let index_md = generate_project_index(&project_dir).unwrap_or_else(|e| {
        format!("# Atelier Design Project\n\n(INDEX 생성 실패: {e})\n")
    });
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
        let status = std::process::Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(&ps_cmd)
            .status()
            .map_err(|e| format!("powershell spawn: {e}"))?;
        if !status.success() {
            return Err(format!("Compress-Archive failed (exit {:?})", status.code()));
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
    use std::process::{Command, Stdio};
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

    let mut child = Command::new("claude")
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

    let output = child.wait_with_output().map_err(|e| format!("output 수집: {e}"))?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::try_init().ok();
    pty::init_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_list,
            pty::session_log_load,
            pty::session_log_clear,
            clipboard::clipboard_save_image,
            dump_debug,
            list_dir,
            read_text_file,
            home_dir,
            command_exists,
            load_profiles,
            save_profiles,
            read_design_resource,
            save_design_artifact,
            open_design_project_dir,
            export_design_project_zip,
            design_claude_call,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
