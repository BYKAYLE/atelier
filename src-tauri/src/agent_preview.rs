use std::collections::{BTreeSet, HashMap, VecDeque};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime};

#[cfg(target_os = "windows")]
fn configure_windows_background_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[derive(Serialize, Clone)]
pub struct PreviewCheckResult {
    url: String,
    ok: bool,
    status: Option<u16>,
    title: Option<String>,
    body_text: Option<String>,
    error: Option<String>,
    checked_at: i64,
}

#[derive(Serialize, Clone)]
pub struct PreviewServiceStatus {
    id: String,
    url: String,
    cwd: String,
    command: String,
    managed: bool,
    running: bool,
    auto_restart: bool,
    pid: Option<u32>,
    started_at: Option<i64>,
    restarts: u32,
    last_error: Option<String>,
    recent_output: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct PreviewCapability {
    managed_start: bool,
    external_loopback_inspection: bool,
    managed_start_reason: Option<String>,
}

#[derive(Serialize, Clone)]
struct PreviewServiceEvent {
    id: String,
    url: String,
    kind: String,
    line: Option<String>,
}

struct ManagedPreviewService {
    id: String,
    url: String,
    cwd: String,
    command: String,
    child: Option<Arc<Mutex<Child>>>,
    pid: Option<u32>,
    started_at: Option<i64>,
    restarts: u32,
    auto_restart: bool,
    last_error: Option<String>,
    recent_output: VecDeque<String>,
}

#[derive(Debug)]
struct LocalPreviewUrl {
    url: String,
    host: String,
    connect_host: String,
    port: u16,
    path: String,
}

const MANAGED_PREVIEW_DISABLED_REASON: &str =
    "Managed package-script preview is disabled by Atelier's hardened security policy. Start only a separately trusted loopback service, then inspect its URL in the preview panel.";

fn checked_at_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

fn is_local_preview_host(host: &str) -> bool {
    let normalized = host
        .trim_matches(|c| c == '[' || c == ']')
        .to_ascii_lowercase();
    normalized == "localhost"
        || normalized == "127.0.0.1"
        || normalized == "0.0.0.0"
        || normalized == "::1"
}

fn parse_local_preview_url(input: &str) -> Result<LocalPreviewUrl, String> {
    let url = input.trim().to_string();
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("https://") {
        return Err("HTTPS localhost preview checks are not supported yet".into());
    }
    if !lower.starts_with("http://") {
        return Err("Only local http:// preview URLs can be checked".into());
    }

    let rest = &url["http://".len()..];
    let (authority, path) = match rest.find(['/', '?', '#']) {
        Some(idx) => (&rest[..idx], &rest[idx..]),
        None => (rest, "/"),
    };
    if authority.contains('@') {
        return Err("Preview URL must not contain credentials".into());
    }
    let (host, port) = if let Some(after_bracket) = authority.strip_prefix('[') {
        let end = after_bracket
            .find(']')
            .ok_or_else(|| "Invalid IPv6 preview host".to_string())?;
        let host = &after_bracket[..end];
        let tail = &after_bracket[end + 1..];
        let port = tail
            .strip_prefix(':')
            .filter(|s| !s.is_empty())
            .map(|s| {
                s.parse::<u16>()
                    .map_err(|_| "Invalid preview port".to_string())
            })
            .transpose()?
            .unwrap_or(80);
        (host.to_string(), port)
    } else {
        let mut parts = authority.rsplitn(2, ':');
        let maybe_port = parts.next().unwrap_or_default();
        let maybe_host = parts.next();
        if let Some(host) = maybe_host {
            let port = maybe_port
                .parse::<u16>()
                .map_err(|_| "Invalid preview port".to_string())?;
            (host.to_string(), port)
        } else {
            (authority.to_string(), 80)
        }
    };

    if !is_local_preview_host(&host) {
        return Err("Only localhost preview URLs are allowed".into());
    }
    let connect_host = match host.trim_matches(|c| c == '[' || c == ']') {
        "0.0.0.0" | "localhost" => "127.0.0.1".to_string(),
        "::1" => "[::1]".to_string(),
        other => other.to_string(),
    };
    let path = if path.is_empty() {
        "/".to_string()
    } else {
        path.to_string()
    };

    Ok(LocalPreviewUrl {
        url,
        host,
        connect_host,
        port,
        path,
    })
}

static PREVIEW_SERVICES: OnceLock<Mutex<HashMap<String, ManagedPreviewService>>> = OnceLock::new();

fn preview_services() -> &'static Mutex<HashMap<String, ManagedPreviewService>> {
    PREVIEW_SERVICES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn preview_service_id(url: &str) -> String {
    match parse_local_preview_url(url) {
        Ok(parsed) => format!("preview-{}", parsed.port),
        Err(_) => {
            let safe = url
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
                .collect::<String>();
            format!("preview-{}", safe.trim_matches('-'))
        }
    }
}

fn preview_service_status_from(service: &ManagedPreviewService) -> PreviewServiceStatus {
    PreviewServiceStatus {
        id: service.id.clone(),
        url: service.url.clone(),
        cwd: service.cwd.clone(),
        command: service.command.clone(),
        managed: true,
        running: service.child.is_some(),
        auto_restart: service.auto_restart,
        pid: service.pid,
        started_at: service.started_at,
        restarts: service.restarts,
        last_error: service.last_error.clone(),
        recent_output: service.recent_output.iter().cloned().collect(),
    }
}

fn preview_service_idle_status(url: String) -> PreviewServiceStatus {
    PreviewServiceStatus {
        id: preview_service_id(&url),
        url,
        cwd: String::new(),
        command: String::new(),
        managed: false,
        running: false,
        auto_restart: false,
        pid: None,
        started_at: None,
        restarts: 0,
        last_error: None,
        recent_output: Vec::new(),
    }
}

fn refresh_preview_service(service: &mut ManagedPreviewService) {
    let Some(child) = service.child.as_ref() else {
        return;
    };
    let status = child
        .lock()
        .ok()
        .and_then(|mut child| child.try_wait().ok())
        .flatten();
    if let Some(status) = status {
        service.child = None;
        service.pid = None;
        service.last_error = Some(match status.code() {
            Some(code) => format!("Preview service exited with code {code}"),
            None => "Preview service exited".to_string(),
        });
    }
}

fn preview_service_port(url: &str) -> Result<u16, String> {
    let port = parse_local_preview_url(url)?.port;
    validate_preview_service_port(port)?;
    Ok(port)
}

fn validate_preview_service_port(port: u16) -> Result<(), String> {
    if port < 1024 {
        return Err(
            "Managed preview services must use an unprivileged port (1024 or higher)".into(),
        );
    }
    Ok(())
}

#[derive(Clone, Debug)]
struct PreviewCommandPlan {
    cwd: String,
    program: String,
    args: Vec<String>,
    command: String,
}

#[derive(Clone, Debug)]
struct PreviewPackageCandidate {
    cwd: PathBuf,
    script: String,
    script_command: String,
    value: Value,
    score: i32,
}

fn preview_package_script(value: &Value) -> Option<(String, String)> {
    let scripts = value.get("scripts").and_then(Value::as_object);
    for script in ["dev", "start", "preview"] {
        if let Some(command) = scripts
            .and_then(|s| s.get(script))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return Some((script.to_string(), command.to_string()));
        }
    }
    None
}

fn package_dep_names(value: &Value) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for key in ["dependencies", "devDependencies"] {
        if let Some(deps) = value.get(key).and_then(Value::as_object) {
            names.extend(deps.keys().map(|name| name.to_ascii_lowercase()));
        }
    }
    names
}

fn preview_script_uses(value: &Value, script_command: &str, needle: &str) -> bool {
    let needle = needle.to_ascii_lowercase();
    script_command.to_ascii_lowercase().contains(&needle)
        || package_dep_names(value).contains(&needle)
}

fn preview_command_extra_args(value: &Value, script_command: &str, port: u16) -> Vec<String> {
    let host_flag = if preview_script_uses(value, script_command, "next") {
        "--hostname"
    } else {
        "--host"
    };
    vec![
        "--".to_string(),
        host_flag.to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
    ]
}

fn detect_preview_package_manager(cwd: &Path, root: &Path) -> &'static str {
    let mut current = Some(cwd);
    while let Some(dir) = current {
        if dir.join("bun.lockb").exists() || dir.join("bun.lock").exists() {
            return "bun";
        }
        if dir.join("pnpm-lock.yaml").exists() {
            return "pnpm";
        }
        if dir.join("yarn.lock").exists() {
            return "yarn";
        }
        if dir == root {
            break;
        }
        current = dir.parent();
    }
    "npm"
}

fn build_preview_command_plan(
    cwd: &Path,
    manager: &str,
    script: &str,
    script_command: &str,
    value: &Value,
    port: u16,
) -> PreviewCommandPlan {
    let mut args = vec!["run".to_string(), script.to_string()];
    if manager == "npm" {
        // npm 11 keeps the explicitly requested script runnable while this
        // flag suppresses implicit pre<script>/post<script> lifecycle hooks.
        args.push("--ignore-scripts".to_string());
    }
    args.extend(preview_command_extra_args(value, script_command, port));
    let command = std::iter::once(manager)
        .chain(args.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ");
    PreviewCommandPlan {
        cwd: cwd.to_string_lossy().into_owned(),
        program: manager.to_string(),
        args,
        command,
    }
}

fn canonical_preview_directory(path: &Path, label: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path).map_err(|e| format!("resolve {label}: {e}"))?;
    if !canonical.is_dir() {
        return Err(format!("{label} is not a directory"));
    }
    Ok(canonical)
}

fn canonical_preview_path_within(root: &Path, path: &Path, label: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path).map_err(|e| format!("resolve {label}: {e}"))?;
    if !canonical.starts_with(root) {
        return Err(format!(
            "{label} resolves outside the selected preview folder"
        ));
    }
    Ok(canonical)
}

fn read_preview_package_json(root: &Path, cwd: &Path) -> Result<Value, String> {
    let package_json = cwd.join("package.json");
    let canonical_package = canonical_preview_path_within(root, &package_json, "package.json")?;
    let text = fs::read_to_string(&canonical_package).map_err(|e| {
        format!(
            "read package.json at {}: {e}",
            canonical_package.to_string_lossy()
        )
    })?;
    serde_json::from_str(&text).map_err(|e| {
        format!(
            "parse package.json at {}: {e}",
            canonical_package.to_string_lossy()
        )
    })
}

fn preview_package_script_command<'a>(value: &'a Value, script: &str) -> Option<&'a str> {
    if !matches!(script, "dev" | "start" | "preview") {
        return None;
    }
    value
        .get("scripts")
        .and_then(Value::as_object)
        .and_then(|scripts| scripts.get(script))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|command| !command.is_empty())
}

fn provided_preview_command_tokens(command: &str) -> Result<Vec<&str>, String> {
    if command.trim().is_empty() {
        return Err("Preview command is empty".into());
    }
    if command.chars().any(|character| {
        !(character.is_ascii_alphanumeric()
            || character == ' '
            || matches!(character, '-' | '_' | '.'))
    }) {
        return Err(
            "Preview command contains shell syntax, quoting, expansion, or unsupported characters"
                .into(),
        );
    }
    Ok(command.split_ascii_whitespace().collect())
}

fn validate_provided_preview_command(
    cwd: &str,
    command: &str,
    port: u16,
) -> Result<PreviewCommandPlan, String> {
    validate_preview_service_port(port)?;
    let cwd = canonical_preview_directory(Path::new(cwd), "preview folder")?;

    let tokens = provided_preview_command_tokens(command)?;
    if tokens.len() < 3 {
        return Err("Preview command must be '<npm|pnpm|yarn|bun> run <script>'".into());
    }
    let manager = tokens[0];
    if !matches!(manager, "npm" | "pnpm" | "yarn" | "bun") || tokens[1] != "run" {
        return Err("Only npm, pnpm, yarn, or bun package scripts are allowed".into());
    }
    let script = tokens[2];
    if !matches!(script, "dev" | "start" | "preview") {
        return Err("Only dev, start, or preview package scripts are allowed".into());
    }

    let value = read_preview_package_json(&cwd, &cwd)?;
    let script_command = preview_package_script_command(&value, script).ok_or_else(|| {
        format!("package.json does not define the requested '{script}' preview script")
    })?;
    let expected_manager = detect_preview_package_manager(&cwd, &cwd);
    if manager != expected_manager {
        return Err(format!(
            "Preview command package manager must match the project lockfile ({expected_manager})"
        ));
    }
    let plan = build_preview_command_plan(&cwd, manager, script, script_command, &value, port);

    let canonical_tokens = std::iter::once(plan.program.as_str())
        .chain(plan.args.iter().map(String::as_str))
        .collect::<Vec<_>>();
    if tokens.len() != 3 && tokens != canonical_tokens {
        return Err(
            "Preview command arguments must be omitted or match Atelier's canonical loopback command"
                .into(),
        );
    }
    Ok(plan)
}

fn push_preview_candidate_dir(
    dirs: &mut Vec<(PathBuf, usize)>,
    seen: &mut BTreeSet<PathBuf>,
    cwd: PathBuf,
    depth: usize,
) {
    if seen.insert(cwd.clone()) {
        dirs.push((cwd, depth));
    }
}

fn preview_candidate_dirs(root: &Path) -> Result<Vec<(PathBuf, usize)>, String> {
    let mut dirs = Vec::new();
    let mut seen = BTreeSet::new();
    push_preview_candidate_dir(&mut dirs, &mut seen, root.to_path_buf(), 0);

    for rel in [
        "dashboard",
        "web",
        "app",
        "frontend",
        "client",
        "ui",
        "apps/web",
        "apps/app",
        "packages/web",
        "packages/app",
    ] {
        let candidate = root.join(rel);
        if candidate.is_dir() {
            let candidate = canonical_preview_path_within(root, &candidate, "preview candidate")?;
            let depth = rel.matches('/').count() + 1;
            push_preview_candidate_dir(&mut dirs, &mut seen, candidate, depth);
        }
    }

    let mut queue = VecDeque::from([(root.to_path_buf(), 0usize)]);
    while let Some((current, depth)) = queue.pop_front() {
        if depth >= 3 {
            continue;
        }
        let Ok(entries) = fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if matches!(
                name.as_str(),
                ".git"
                    | ".next"
                    | ".nuxt"
                    | ".svelte-kit"
                    | "build"
                    | "dist"
                    | "node_modules"
                    | "out"
                    | "target"
            ) {
                continue;
            }
            let file_type = entry
                .file_type()
                .map_err(|e| format!("inspect preview candidate {}: {e}", path.display()))?;
            if !file_type.is_dir() && !file_type.is_symlink() {
                continue;
            }
            let canonical = fs::canonicalize(&path)
                .map_err(|e| format!("resolve preview candidate {}: {e}", path.display()))?;
            if !canonical.is_dir() {
                continue;
            }
            if !canonical.starts_with(root) {
                return Err(format!(
                    "preview candidate {} resolves outside the selected preview folder",
                    path.display()
                ));
            }
            let next_depth = depth + 1;
            push_preview_candidate_dir(&mut dirs, &mut seen, canonical.clone(), next_depth);
            queue.push_back((canonical, next_depth));
            if dirs.len() >= 80 {
                return Ok(dirs);
            }
        }
    }

    Ok(dirs)
}

fn read_preview_package_candidate(
    root: &Path,
    cwd: &Path,
    depth: usize,
) -> Result<Option<PreviewPackageCandidate>, String> {
    let package_json = cwd.join("package.json");
    if !package_json.exists() {
        return Ok(None);
    }
    let value = read_preview_package_json(root, cwd)?;
    let Some((script, script_command)) = preview_package_script(&value) else {
        return Ok(None);
    };

    let mut score = 100 - (depth as i32 * 10);
    if cwd == root {
        score += 30;
        if script_command.contains("--filter")
            || script_command.contains("workspace")
            || script_command
                .split_whitespace()
                .any(|part| part == "-w" || part == "--workspace-root")
        {
            score += 90;
        }
    }
    if script == "dev" {
        score += 30;
    } else if script == "start" {
        score += 10;
    }

    let name = cwd
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    score += match name.as_str() {
        "dashboard" => 60,
        "web" | "app" | "frontend" | "client" | "ui" => 40,
        _ => 0,
    };
    if preview_script_uses(&value, &script_command, "next")
        || preview_script_uses(&value, &script_command, "vite")
        || preview_script_uses(&value, &script_command, "astro")
    {
        score += 20;
    }

    Ok(Some(PreviewPackageCandidate {
        cwd: cwd.to_path_buf(),
        script,
        script_command,
        value,
        score,
    }))
}

fn infer_preview_command(cwd: &str, url: &str) -> Result<PreviewCommandPlan, String> {
    let port = preview_service_port(url)?;
    let root = canonical_preview_directory(Path::new(cwd), "preview root")?;
    let mut candidates = Vec::new();
    let mut saw_package_json = false;
    for (candidate_dir, depth) in preview_candidate_dirs(&root)? {
        if candidate_dir.join("package.json").exists() {
            saw_package_json = true;
        }
        if let Some(candidate) = read_preview_package_candidate(&root, &candidate_dir, depth)? {
            candidates.push(candidate);
        }
    }

    let Some(candidate) = candidates
        .into_iter()
        .max_by_key(|candidate| candidate.score)
    else {
        if saw_package_json {
            return Err(
                "package.json was found, but no dev, start, or preview script is available.".into(),
            );
        }
        return Err(
            "No package.json found in the working folder or common app subfolders. Enter a preview start command.".into(),
        );
    };

    let manager = detect_preview_package_manager(&candidate.cwd, &root);
    Ok(build_preview_command_plan(
        &candidate.cwd,
        manager,
        &candidate.script,
        &candidate.script_command,
        &candidate.value,
        port,
    ))
}

fn create_preview_sandbox_home() -> Result<PathBuf, String> {
    let root = std::env::temp_dir().join("atelier-preview-sandbox");
    fs::create_dir_all(&root).map_err(|e| format!("create preview sandbox root: {e}"))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let sandbox_home = root.join(format!("{}-{}", std::process::id(), nonce));
    fs::create_dir(&sandbox_home).map_err(|e| format!("create preview sandbox home: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&sandbox_home, fs::Permissions::from_mode(0o700))
            .map_err(|e| format!("secure preview sandbox home: {e}"))?;
    }
    canonical_preview_directory(&sandbox_home, "preview sandbox home")
}

fn configure_preview_process_environment(command: &mut Command, sandbox_home: &Path) {
    command
        .env_clear()
        .env("PATH", crate::augmented_cli_path())
        .env("HOME", sandbox_home)
        .env("TMPDIR", sandbox_home)
        .env("BROWSER", "none")
        .env("NO_PROXY", "localhost,127.0.0.1,::1");
}

#[cfg(target_os = "macos")]
fn sbpl_string_literal(value: &str) -> Result<String, String> {
    if value.chars().any(char::is_control) {
        return Err("Sandbox paths must not contain control characters".into());
    }
    Ok(format!(
        "\"{}\"",
        value.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}

#[cfg(target_os = "macos")]
fn sbpl_path_literal(path: &Path) -> Result<String, String> {
    let value = path
        .to_str()
        .ok_or_else(|| "Sandbox path must be valid UTF-8".to_string())?;
    sbpl_string_literal(value)
}

#[cfg(target_os = "macos")]
fn resolve_preview_program(program: &str) -> Result<PathBuf, String> {
    let path = Path::new(program);
    if path.is_absolute() {
        return fs::canonicalize(path).map_err(|e| format!("resolve preview executable: {e}"));
    }
    if path.components().count() != 1 {
        return Err("Preview executable must be an allowlisted program name".into());
    }
    for directory in std::env::split_paths(&crate::augmented_cli_path()) {
        let candidate = directory.join(program);
        if candidate.is_file() {
            return fs::canonicalize(&candidate)
                .map_err(|e| format!("resolve preview executable: {e}"));
        }
    }
    Err(format!("Preview executable '{program}' was not found"))
}

#[cfg(target_os = "macos")]
fn preview_node_module_root(path: &Path) -> Option<PathBuf> {
    path.ancestors().find_map(|ancestor| {
        (ancestor
            .parent()
            .and_then(Path::file_name)
            .is_some_and(|name| name == "node_modules"))
        .then(|| ancestor.to_path_buf())
    })
}

#[cfg(target_os = "macos")]
fn preview_runtime_root(path: &Path) -> PathBuf {
    path.parent()
        .and_then(Path::parent)
        .filter(|_| {
            path.parent()
                .and_then(Path::file_name)
                .is_some_and(|name| name == "bin")
        })
        .unwrap_or_else(|| path.parent().unwrap_or(path))
        .to_path_buf()
}

#[cfg(target_os = "macos")]
fn build_macos_preview_sandbox_profile(
    cwd: &Path,
    sandbox_home: &Path,
    program: &Path,
) -> Result<String, String> {
    let actual_home = std::env::var_os("HOME")
        .ok_or_else(|| "HOME is required to build the preview sandbox".to_string())?;
    let actual_home = canonical_preview_directory(Path::new(&actual_home), "user home")?;
    let protected_roots = [
        actual_home,
        PathBuf::from("/Users"),
        PathBuf::from("/Volumes"),
        PathBuf::from("/private/tmp"),
        PathBuf::from("/private/var/folders"),
        PathBuf::from("/var/tmp"),
    ];
    if protected_roots.iter().any(|root| root.starts_with(cwd)) {
        return Err("Preview folder is too broad to isolate from user data".into());
    }

    let mut read_exceptions = BTreeSet::from([cwd.to_path_buf(), sandbox_home.to_path_buf()]);
    let canonical_program = fs::canonicalize(program)
        .map_err(|e| format!("resolve sandboxed preview executable: {e}"))?;
    read_exceptions.insert(
        preview_node_module_root(&canonical_program).unwrap_or_else(|| {
            canonical_program
                .parent()
                .unwrap_or(&canonical_program)
                .to_path_buf()
        }),
    );
    if let Ok(node) = resolve_preview_program("node") {
        read_exceptions.insert(preview_runtime_root(&node));
    }

    let denied_reads = protected_roots
        .iter()
        .filter(|root| root.exists())
        .map(|root| Ok(format!("(subpath {})", sbpl_path_literal(root)?)))
        .collect::<Result<Vec<_>, String>>()?
        .join(" ");
    let allowed_reads = read_exceptions
        .iter()
        .map(|root| Ok(format!("(subpath {})", sbpl_path_literal(root)?)))
        .collect::<Result<Vec<_>, String>>()?
        .join(" ");
    let allowed_writes = [sandbox_home]
        .iter()
        .map(|root| Ok(format!("(subpath {})", sbpl_path_literal(root)?)))
        .collect::<Result<Vec<_>, String>>()?
        .join(" ");

    Ok(format!(
        "(version 1) (allow default) (deny mach-lookup) \
         (deny network-inbound) (deny network-bind) (deny network-outbound) \
         (deny file-read* {denied_reads}) (deny file-write*) \
         (allow file-read-metadata) \
         (allow file-read* {allowed_reads}) (allow file-write* {allowed_writes})"
    ))
}

fn ensure_managed_preview_execution_enabled() -> Result<(), String> {
    Err(MANAGED_PREVIEW_DISABLED_REASON.into())
}

fn preview_capability_snapshot() -> PreviewCapability {
    PreviewCapability {
        managed_start: false,
        external_loopback_inspection: true,
        managed_start_reason: Some(MANAGED_PREVIEW_DISABLED_REASON.to_string()),
    }
}

fn preview_process_command(plan: &PreviewCommandPlan) -> Result<Command, String> {
    let sandbox_home = create_preview_sandbox_home()?;

    #[cfg(target_os = "macos")]
    let mut command = {
        let sandbox_exec = Path::new("/usr/bin/sandbox-exec");
        if !sandbox_exec.is_file() {
            return Err("macOS sandbox-exec is unavailable; preview start was blocked".into());
        }
        let cwd = canonical_preview_directory(Path::new(&plan.cwd), "preview folder")?;
        let program = resolve_preview_program(&plan.program)?;
        let profile = build_macos_preview_sandbox_profile(&cwd, &sandbox_home, &program)?;
        let mut command = Command::new(sandbox_exec);
        command.arg("-p").arg(profile).arg(program).args(&plan.args);
        command
    };

    #[cfg(not(target_os = "macos"))]
    let mut command = {
        let mut command = Command::new(&plan.program);
        command.args(&plan.args);
        command
    };

    configure_preview_process_environment(&mut command, &sandbox_home);
    #[cfg(target_os = "windows")]
    configure_windows_background_command(&mut command);
    Ok(command)
}

fn redact_preview_assignment_value(text: &mut String, key: &str) {
    let mut search_from = 0usize;
    loop {
        let lower = text.to_ascii_lowercase();
        let Some(relative) = lower[search_from..].find(key) else {
            break;
        };
        let key_start = search_from + relative;
        let mut cursor = key_start + key.len();
        let bytes = text.as_bytes();
        while cursor < bytes.len()
            && matches!(bytes[cursor], b' ' | b'\t' | b'\r' | b'\n' | b'\'' | b'"')
        {
            cursor += 1;
        }
        if cursor >= bytes.len() || !matches!(bytes[cursor], b':' | b'=') {
            search_from = key_start + key.len();
            continue;
        }
        cursor += 1;
        while cursor < bytes.len()
            && matches!(bytes[cursor], b' ' | b'\t' | b'\r' | b'\n' | b'\'' | b'"')
        {
            cursor += 1;
        }
        let value_start = cursor;
        while cursor < bytes.len()
            && !matches!(
                bytes[cursor],
                b' ' | b'\t' | b'\r' | b'\n' | b'\'' | b'"' | b',' | b';' | b'}' | b']'
            )
        {
            cursor += 1;
        }
        if cursor > value_start {
            text.replace_range(value_start..cursor, "<redacted>");
            search_from = value_start + "<redacted>".len();
        } else {
            search_from = key_start + key.len();
        }
    }
}

fn redact_preview_prefixed_token(text: &mut String, prefix: &str, min_length: usize) {
    let mut search_from = 0usize;
    loop {
        let lower = text.to_ascii_lowercase();
        let Some(relative) = lower[search_from..].find(prefix) else {
            break;
        };
        let start = search_from + relative;
        let mut end = start + prefix.len();
        let bytes = text.as_bytes();
        while end < bytes.len()
            && (bytes[end].is_ascii_alphanumeric() || matches!(bytes[end], b'_' | b'-' | b'.'))
        {
            end += 1;
        }
        if end - start >= min_length {
            text.replace_range(start..end, "<redacted>");
            search_from = start + "<redacted>".len();
        } else {
            search_from = end;
        }
    }
}

pub(crate) fn redact_cli_output(line: &str) -> String {
    let mut safe = line.to_string();
    redact_preview_prefixed_token(&mut safe, "bearer ", 14);
    redact_preview_prefixed_token(&mut safe, "basic ", 14);
    redact_preview_prefixed_token(&mut safe, "sk-", 15);
    for key in [
        "api_key",
        "api-key",
        "apikey",
        "access_token",
        "access-token",
        "refresh_token",
        "refresh-token",
        "id_token",
        "id-token",
        "client_secret",
        "client-secret",
        "aws_secret_access_key",
        "aws_session_token",
        "telegram_bot_token",
        "bot_token",
        "private_key",
        "secret_key",
        "token",
        "secret",
        "passwd",
        "passphrase",
        "authorization",
        "password",
    ] {
        redact_preview_assignment_value(&mut safe, key);
    }
    safe
}

fn push_preview_output(id: &str, line: String) {
    let Ok(mut services) = preview_services().lock() else {
        return;
    };
    let Some(service) = services.get_mut(id) else {
        return;
    };
    let clipped = if line.chars().count() > 260 {
        format!("{}…", line.chars().take(259).collect::<String>())
    } else {
        line
    };
    service.recent_output.push_back(clipped);
    while service.recent_output.len() > 8 {
        service.recent_output.pop_front();
    }
}

fn spawn_preview_output_reader<R, T>(
    app: AppHandle<R>,
    id: String,
    url: String,
    kind: &'static str,
    stream: T,
) where
    R: Runtime,
    T: Read + Send + 'static,
{
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().map_while(Result::ok) {
            let safe_line = redact_cli_output(&line);
            push_preview_output(&id, safe_line.clone());
            let _ = app.emit(
                &format!("preview-service://{id}/event"),
                PreviewServiceEvent {
                    id: id.clone(),
                    url: url.clone(),
                    kind: kind.to_string(),
                    line: Some(safe_line),
                },
            );
        }
    });
}

fn spawn_preview_child<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    url: &str,
    plan: &PreviewCommandPlan,
) -> Result<(Arc<Mutex<Child>>, u32), String> {
    let mut cmd = preview_process_command(plan)?;
    cmd.current_dir(&plan.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("preview service spawn: {e}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let pid = child.id();
    let child = Arc::new(Mutex::new(child));
    if let Some(stdout) = stdout {
        spawn_preview_output_reader(
            app.clone(),
            id.to_string(),
            url.to_string(),
            "stdout",
            stdout,
        );
    }
    if let Some(stderr) = stderr {
        spawn_preview_output_reader(
            app.clone(),
            id.to_string(),
            url.to_string(),
            "stderr",
            stderr,
        );
    }
    Ok((child, pid))
}

fn start_preview_service<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    cwd: Option<String>,
    command: Option<String>,
    auto_restart: bool,
) -> Result<PreviewServiceStatus, String> {
    let parsed = parse_local_preview_url(&url)?;
    validate_preview_service_port(parsed.port)?;
    // A workspace-controlled package script cannot be constrained to a
    // loopback-only listener by macOS SBPL: its `localhost` filter also admits
    // wildcard and other local-interface binds. Fail closed before parsing or
    // spawning any workspace command until Atelier owns the listener/socket.
    ensure_managed_preview_execution_enabled()?;
    let cwd = cwd.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| ".".into())
    });
    let provided_command = command.filter(|value| !value.trim().is_empty());
    let plan = if let Some(command) = provided_command {
        validate_provided_preview_command(&cwd, &command, parsed.port)?
    } else {
        infer_preview_command(&cwd, &parsed.url)?
    };
    let cwd = plan.cwd.clone();
    let command = plan.command.clone();
    let id = preview_service_id(&parsed.url);

    {
        let mut services = preview_services().lock().map_err(|e| e.to_string())?;
        if let Some(service) = services.get_mut(&id) {
            refresh_preview_service(service);
            if service.child.is_some() {
                return Ok(preview_service_status_from(service));
            }
        }
    }

    let (child, pid) = spawn_preview_child(&app, &id, &parsed.url, &plan)?;
    let mut services = preview_services().lock().map_err(|e| e.to_string())?;
    let restarts = services
        .get(&id)
        .map(|s| s.restarts.saturating_add(1))
        .unwrap_or(0);
    let service = services
        .entry(id.clone())
        .or_insert_with(|| ManagedPreviewService {
            id: id.clone(),
            url: parsed.url.clone(),
            cwd: cwd.clone(),
            command: command.clone(),
            child: None,
            pid: None,
            started_at: None,
            restarts,
            auto_restart,
            last_error: None,
            recent_output: VecDeque::new(),
        });
    service.url = parsed.url;
    service.cwd = cwd;
    service.command = command;
    service.child = Some(child);
    service.pid = Some(pid);
    service.started_at = Some(checked_at_ms());
    service.auto_restart = auto_restart;
    service.last_error = None;
    service.restarts = restarts;
    Ok(preview_service_status_from(service))
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let after_start = lower[start..].find('>')? + start + 1;
    let end = lower[after_start..].find("</title>")? + after_start;
    let title = html[after_start..end]
        .replace(['\n', '\r'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if title.is_empty() {
        None
    } else {
        Some(title)
    }
}

fn html_entity(entity: &str) -> Option<char> {
    match entity {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" | "#39" => Some('\''),
        "nbsp" => Some(' '),
        _ if entity.starts_with("#x") || entity.starts_with("#X") => {
            u32::from_str_radix(&entity[2..], 16)
                .ok()
                .and_then(char::from_u32)
        }
        _ if entity.starts_with('#') => entity[1..].parse::<u32>().ok().and_then(char::from_u32),
        _ => None,
    }
}

fn decode_html_entities(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '&' {
            let mut j = i + 1;
            while j < chars.len() && j - i <= 12 && chars[j] != ';' {
                j += 1;
            }
            if j < chars.len() && chars[j] == ';' {
                let entity = chars[i + 1..j].iter().collect::<String>();
                if let Some(decoded) = html_entity(&entity) {
                    out.push(decoded);
                    i = j + 1;
                    continue;
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn extract_body_text(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let body = if let Some(start) = lower.find("<body") {
        let after_start = lower[start..]
            .find('>')
            .map(|idx| start + idx + 1)
            .unwrap_or(start);
        let end = lower[after_start..]
            .find("</body>")
            .map(|idx| after_start + idx)
            .unwrap_or(html.len());
        &html[after_start..end]
    } else {
        html
    };

    let mut text = String::with_capacity(body.len());
    let mut in_tag = false;
    let mut tag = String::new();
    let mut skip_until: Option<&'static str> = None;
    let mut chars = body.chars().peekable();
    while let Some(ch) = chars.next() {
        if let Some(end_tag) = skip_until {
            if ch == '<' {
                let mut possible = String::from("<");
                while let Some(next) = chars.peek().copied() {
                    possible.push(next);
                    chars.next();
                    if next == '>' || possible.len() > end_tag.len() + 4 {
                        break;
                    }
                }
                if possible.to_ascii_lowercase().starts_with(end_tag) {
                    skip_until = None;
                }
            }
            continue;
        }

        if in_tag {
            if ch == '>' {
                let tag_name = tag
                    .trim()
                    .trim_start_matches('/')
                    .split_whitespace()
                    .next()
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if matches!(tag_name.as_str(), "script" | "style" | "svg")
                    && !tag.trim_start().starts_with('/')
                {
                    skip_until = Some(match tag_name.as_str() {
                        "script" => "</script",
                        "style" => "</style",
                        _ => "</svg",
                    });
                }
                if matches!(
                    tag_name.as_str(),
                    "br" | "p" | "div" | "li" | "tr" | "h1" | "h2" | "h3" | "pre"
                ) {
                    text.push(' ');
                }
                tag.clear();
                in_tag = false;
            } else {
                tag.push(ch);
            }
            continue;
        }

        if ch == '<' {
            in_tag = true;
            tag.clear();
        } else {
            text.push(ch);
        }
    }

    let decoded = decode_html_entities(&text)
        .replace('\u{00a0}', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if decoded.is_empty() {
        None
    } else {
        Some(decoded.chars().take(420).collect())
    }
}

fn preview_connect_candidates(parsed: &LocalPreviewUrl) -> Vec<String> {
    let mut candidates = Vec::new();
    let host = parsed.host.trim_matches(|c| c == '[' || c == ']');
    let raw = match host {
        "localhost" => vec![
            "127.0.0.1".to_string(),
            "[::1]".to_string(),
            "localhost".to_string(),
        ],
        "0.0.0.0" => vec!["127.0.0.1".to_string(), "localhost".to_string()],
        "::1" => vec!["[::1]".to_string(), "localhost".to_string()],
        other => vec![parsed.connect_host.clone(), other.to_string()],
    };
    for candidate in raw {
        if !candidates.contains(&candidate) {
            candidates.push(candidate);
        }
    }
    candidates
}

fn preview_host_header(parsed: &LocalPreviewUrl) -> String {
    let host = if parsed.host.contains(':') && !parsed.host.starts_with('[') {
        format!("[{}]", parsed.host)
    } else {
        parsed.host.clone()
    };
    if parsed.port == 80 {
        host
    } else {
        format!("{host}:{}", parsed.port)
    }
}

fn run_preview_health_check(url: String) -> PreviewCheckResult {
    let checked_at = checked_at_ms();
    let parsed = match parse_local_preview_url(&url) {
        Ok(parsed) => parsed,
        Err(error) => {
            return PreviewCheckResult {
                url,
                ok: false,
                status: None,
                title: None,
                body_text: None,
                error: Some(error),
                checked_at,
            };
        }
    };

    let timeout = Duration::from_secs(3);
    let candidates = preview_connect_candidates(&parsed);
    let mut stream = None;
    for candidate in &candidates {
        let address = format!("{candidate}:{}", parsed.port);
        if let Some(open) = address
            .to_socket_addrs()
            .ok()
            .and_then(|mut addrs| addrs.next())
            .and_then(|addr| TcpStream::connect_timeout(&addr, timeout).ok())
        {
            stream = Some(open);
            break;
        }
    }
    let Some(mut stream) = stream else {
        return PreviewCheckResult {
            url: parsed.url,
            ok: false,
            status: None,
            title: None,
            body_text: None,
            error: Some(format!(
                "Cannot connect to local preview at {}",
                candidates
                    .iter()
                    .map(|candidate| format!("{candidate}:{}", parsed.port))
                    .collect::<Vec<_>>()
                    .join(", ")
            )),
            checked_at,
        };
    };
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));

    let request = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: AtelierPreviewCheck/1.0\r\nAccept: text/html,*/*;q=0.8\r\nConnection: close\r\n\r\n",
        parsed.path,
        preview_host_header(&parsed)
    );
    if let Err(e) = stream.write_all(request.as_bytes()) {
        return PreviewCheckResult {
            url: parsed.url,
            ok: false,
            status: None,
            title: None,
            body_text: None,
            error: Some(format!("Preview request failed: {e}")),
            checked_at,
        };
    }

    let mut bytes = Vec::new();
    if let Err(e) = stream.read_to_end(&mut bytes) {
        return PreviewCheckResult {
            url: parsed.url,
            ok: false,
            status: None,
            title: None,
            body_text: None,
            error: Some(format!("Preview response failed: {e}")),
            checked_at,
        };
    }
    let response = String::from_utf8_lossy(&bytes);
    let status = response
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok());
    let body = response
        .split("\r\n\r\n")
        .nth(1)
        .or_else(|| response.split("\n\n").nth(1))
        .unwrap_or_default();
    let ok = status.map(|s| (200..400).contains(&s)).unwrap_or(false);
    PreviewCheckResult {
        url: parsed.url,
        ok,
        status,
        title: extract_title(body),
        body_text: extract_body_text(body),
        error: if ok {
            None
        } else {
            Some(match status {
                Some(s) => format!("Preview returned HTTP {s}"),
                None => "Preview returned an invalid HTTP response".to_string(),
            })
        },
        checked_at,
    }
}

#[tauri::command]
pub async fn preview_health_check(url: String) -> Result<PreviewCheckResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_preview_health_check(url))
        .await
        .map_err(|e| format!("preview health check join: {e}"))
}

#[tauri::command]
pub fn preview_capability() -> PreviewCapability {
    preview_capability_snapshot()
}

#[tauri::command]
pub async fn preview_service_start<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    cwd: Option<String>,
    command: Option<String>,
    auto_restart: Option<bool>,
) -> Result<PreviewServiceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = auto_restart;
        start_preview_service(app, url, cwd, command, false)
    })
    .await
    .map_err(|e| format!("preview service start join: {e}"))?
}

#[tauri::command]
pub async fn preview_service_status(url: String) -> Result<PreviewServiceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let id = preview_service_id(&url);
        let mut services = preview_services().lock().map_err(|e| e.to_string())?;
        let Some(service) = services.get_mut(&id) else {
            return Ok(preview_service_idle_status(url));
        };
        refresh_preview_service(service);
        Ok(preview_service_status_from(service))
    })
    .await
    .map_err(|e| format!("preview service status join: {e}"))?
}

#[tauri::command]
pub async fn preview_service_stop(url: String) -> Result<PreviewServiceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let id = preview_service_id(&url);
        let mut services = preview_services().lock().map_err(|e| e.to_string())?;
        let Some(service) = services.get_mut(&id) else {
            return Ok(preview_service_idle_status(url));
        };
        service.auto_restart = false;
        if let Some(child) = service.child.take() {
            if let Ok(mut child) = child.lock() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        service.pid = None;
        service.last_error = Some("Preview service stopped by Atelier".into());
        Ok(preview_service_status_from(service))
    })
    .await
    .map_err(|e| format!("preview service stop join: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_local_preview_url_with_query() {
        let parsed = parse_local_preview_url("http://localhost:5173?view=mobile").unwrap();
        assert_eq!(parsed.connect_host, "127.0.0.1");
        assert_eq!(parsed.port, 5173);
        assert_eq!(parsed.path, "?view=mobile");
    }

    #[test]
    fn rejects_remote_preview_url() {
        let err = parse_local_preview_url("http://example.com:5173").unwrap_err();
        assert!(err.contains("localhost"));
    }

    #[test]
    fn builds_stable_preview_service_id_from_port() {
        assert_eq!(
            preview_service_id("http://127.0.0.1:5173/admin/"),
            "preview-5173"
        );
    }

    #[test]
    fn extracts_preview_body_text_from_server_error_html() {
        let text = extract_body_text(
            r#"<html><body><script>ignored()</script><h1>The server is configured with a public base URL of /admin/</h1><p>did you mean to visit <a href="/admin/portal/">/admin/portal/</a> instead?</p></body></html>"#,
        )
        .unwrap();
        assert!(text.contains("public base URL of /admin/"));
        assert!(text.contains("/admin/portal/"));
        assert!(!text.contains("ignored"));
    }

    #[test]
    fn preview_output_redacts_credentials_before_storage_and_events() {
        let redacted = redact_cli_output(
            "API_KEY=sk-preview-secret-123456789 Authorization: Bearer access-token-123456789 PASSWORD='hunter2' PRIVATE_TOKEN=custom-token-value PASSPHRASE=custom-passphrase",
        );
        assert!(!redacted.contains("preview-secret"));
        assert!(!redacted.contains("access-token"));
        assert!(!redacted.contains("hunter2"));
        assert!(!redacted.contains("custom-token-value"));
        assert!(!redacted.contains("custom-passphrase"));
        assert!(redacted.matches("<redacted>").count() >= 5);
        assert_eq!(
            redact_cli_output("password authentication failed"),
            "password authentication failed"
        );
    }

    #[test]
    fn localhost_preview_checks_try_ipv4_and_ipv6() {
        let parsed = parse_local_preview_url("http://localhost:5173/admin/").unwrap();
        let candidates = preview_connect_candidates(&parsed);
        assert!(candidates.contains(&"127.0.0.1".to_string()));
        assert!(candidates.contains(&"[::1]".to_string()));
    }

    #[test]
    fn preview_health_check_collects_real_loopback_http_evidence() {
        let listener =
            std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind loopback preview fixture");
        let port = listener
            .local_addr()
            .expect("preview fixture address")
            .port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept preview check");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read preview request");
            let request = String::from_utf8_lossy(&request[..read]);
            assert!(request.starts_with("GET /admin?mode=test HTTP/1.1\r\n"));
            assert!(request.contains("User-Agent: AtelierPreviewCheck/1.0"));

            let body = "<html><head><title>Atelier Fixture</title></head><body><main>Preview ready</main></body></html>";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body,
            );
            stream
                .write_all(response.as_bytes())
                .expect("write preview response");
        });

        let result = run_preview_health_check(format!("http://localhost:{port}/admin?mode=test"));
        server.join().expect("join preview fixture");

        assert!(result.ok, "{:?}", result.error);
        assert_eq!(result.status, Some(200));
        assert_eq!(result.title.as_deref(), Some("Atelier Fixture"));
        assert!(result
            .body_text
            .as_deref()
            .is_some_and(|body| body.contains("Preview ready")));
        assert!(result.error.is_none());
    }

    fn preview_test_root(name: &str) -> PathBuf {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("atelier-preview-{name}-{id}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn preview_command_detects_dashboard_app_root() {
        let root = preview_test_root("dashboard-app");
        let dashboard = root.join("dashboard");
        fs::create_dir_all(&dashboard).unwrap();
        fs::write(
            dashboard.join("package.json"),
            r#"{"scripts":{"dev":"next dev"},"dependencies":{"next":"15.0.0"}}"#,
        )
        .unwrap();

        let plan =
            infer_preview_command(root.to_str().unwrap(), "http://127.0.0.1:8787/admin/").unwrap();

        assert_eq!(
            PathBuf::from(&plan.cwd),
            fs::canonicalize(&dashboard).unwrap()
        );
        assert_eq!(plan.program, "npm");
        assert_eq!(
            plan.args,
            [
                "run",
                "dev",
                "--ignore-scripts",
                "--",
                "--hostname",
                "127.0.0.1",
                "--port",
                "8787"
            ]
        );
        assert!(plan.command.contains("npm run dev"));
        assert!(plan.command.contains("--hostname 127.0.0.1"));
        assert!(plan.command.contains("--port 8787"));
    }

    #[test]
    fn preview_command_prefers_dashboard_over_generic_root_script() {
        let root = preview_test_root("root-app");
        fs::write(
            root.join("package.json"),
            r#"{"scripts":{"dev":"vite --host 0.0.0.0"}}"#,
        )
        .unwrap();
        let dashboard = root.join("dashboard");
        fs::create_dir_all(&dashboard).unwrap();
        fs::write(
            dashboard.join("package.json"),
            r#"{"scripts":{"dev":"next dev"},"dependencies":{"next":"15.0.0"}}"#,
        )
        .unwrap();

        let plan = infer_preview_command(root.to_str().unwrap(), "http://localhost:5173/").unwrap();

        assert_eq!(
            PathBuf::from(&plan.cwd),
            fs::canonicalize(&dashboard).unwrap()
        );
        assert!(plan.command.contains("npm run dev"));
        assert!(plan.command.contains("--hostname 127.0.0.1"));
        assert!(plan.command.contains("--port 5173"));
    }

    #[test]
    fn preview_command_uses_workspace_lockfile_for_child_app() {
        let root = preview_test_root("workspace-pnpm");
        fs::write(root.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'\n").unwrap();
        let dashboard = root.join("dashboard");
        fs::create_dir_all(&dashboard).unwrap();
        fs::write(
            dashboard.join("package.json"),
            r#"{"scripts":{"dev":"vite --host 0.0.0.0"},"devDependencies":{"vite":"^5.0.0"}}"#,
        )
        .unwrap();

        let plan = infer_preview_command(root.to_str().unwrap(), "http://localhost:5173/").unwrap();

        assert_eq!(
            PathBuf::from(&plan.cwd),
            fs::canonicalize(&dashboard).unwrap()
        );
        assert_eq!(plan.program, "pnpm");
        assert!(plan.command.starts_with("pnpm run dev"));
        assert!(plan.command.contains("--host 127.0.0.1"));
    }

    #[test]
    fn provided_preview_command_is_rebuilt_as_direct_process_arguments() {
        let root = preview_test_root("provided-npm");
        fs::write(
            root.join("package.json"),
            r#"{"scripts":{"dev":"vite --host 0.0.0.0"},"devDependencies":{"vite":"^5.0.0"}}"#,
        )
        .unwrap();

        let plan =
            validate_provided_preview_command(root.to_str().unwrap(), "npm run dev", 5173).unwrap();
        assert_eq!(plan.program, "npm");
        assert_eq!(
            plan.args,
            [
                "run",
                "dev",
                "--ignore-scripts",
                "--",
                "--host",
                "127.0.0.1",
                "--port",
                "5173"
            ]
        );
        assert_eq!(
            plan.command,
            "npm run dev --ignore-scripts -- --host 127.0.0.1 --port 5173"
        );

        let process = preview_process_command(&plan).unwrap();
        let process_args = process
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        #[cfg(target_os = "macos")]
        {
            assert_eq!(process.get_program(), "/usr/bin/sandbox-exec");
            assert!(process_args.ends_with(&plan.args));
        }
        #[cfg(not(target_os = "macos"))]
        {
            assert_eq!(process.get_program(), "npm");
            assert_eq!(process_args, plan.args);
        }
    }

    #[test]
    fn provided_preview_command_accepts_allowlisted_pnpm_script() {
        let root = preview_test_root("provided-pnpm");
        fs::write(root.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'\n").unwrap();
        fs::write(
            root.join("package.json"),
            r#"{"scripts":{"preview":"vite preview"},"devDependencies":{"vite":"^5.0.0"}}"#,
        )
        .unwrap();

        let plan =
            validate_provided_preview_command(root.to_str().unwrap(), "pnpm run preview", 4173)
                .unwrap();
        assert_eq!(plan.program, "pnpm");
        assert_eq!(
            plan.command,
            "pnpm run preview -- --host 127.0.0.1 --port 4173"
        );
    }

    #[test]
    fn provided_preview_command_rejects_shell_syntax_and_extra_executables() {
        let root = preview_test_root("command-injection");
        fs::write(
            root.join("package.json"),
            r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}"#,
        )
        .unwrap();
        let marker = root.join("preview-command-injection-marker");
        let attacks = [
            "npm run dev; touch preview-command-injection-marker",
            "npm run dev && touch preview-command-injection-marker",
            "npm run dev | touch preview-command-injection-marker",
            "npm run dev > preview-command-injection-marker",
            "npm run dev `touch preview-command-injection-marker`",
            "npm run dev $(touch preview-command-injection-marker)",
            "npm run dev\ntouch preview-command-injection-marker",
            "npm run dev\n",
            "npm run dev touch preview-command-injection-marker",
            "npm run dev 'touch preview-command-injection-marker'",
            "npm run dev \"touch preview-command-injection-marker\"",
        ];

        for attack in attacks {
            let error = validate_provided_preview_command(root.to_str().unwrap(), attack, 5173)
                .expect_err(attack);
            assert!(!error.is_empty());
            assert!(!marker.exists(), "marker was created for payload: {attack}");
        }
    }

    #[test]
    fn provided_preview_command_rejects_script_and_manager_mismatch() {
        let root = preview_test_root("command-mismatch");
        fs::write(root.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'\n").unwrap();
        fs::write(
            root.join("package.json"),
            r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}"#,
        )
        .unwrap();

        let script_error =
            validate_provided_preview_command(root.to_str().unwrap(), "pnpm run preview", 5173)
                .unwrap_err();
        assert!(script_error.contains("does not define"));

        let manager_error =
            validate_provided_preview_command(root.to_str().unwrap(), "npm run dev", 5173)
                .unwrap_err();
        assert!(manager_error.contains("lockfile"));
    }

    #[test]
    fn provided_preview_command_rejects_noncanonical_arguments() {
        let root = preview_test_root("command-arguments");
        fs::write(
            root.join("package.json"),
            r#"{"scripts":{"dev":"next dev"},"dependencies":{"next":"15.0.0"}}"#,
        )
        .unwrap();

        for command in [
            "npm run dev -- --hostname 0.0.0.0 --port 5173",
            "npm run dev -- --hostname 127.0.0.1 --port 9999",
            "npm run dev -- --host 127.0.0.1 --port 5173",
            "npm run dev -- --hostname 127.0.0.1 --port 5173 extra",
        ] {
            assert!(
                validate_provided_preview_command(root.to_str().unwrap(), command, 5173).is_err()
            );
        }

        let canonical = validate_provided_preview_command(
            root.to_str().unwrap(),
            "npm run dev --ignore-scripts -- --hostname 127.0.0.1 --port 5173",
            5173,
        )
        .unwrap();
        assert_eq!(
            canonical.command,
            "npm run dev --ignore-scripts -- --hostname 127.0.0.1 --port 5173"
        );
    }

    #[test]
    fn managed_preview_rejects_privileged_ports() {
        let error = preview_service_port("http://127.0.0.1:1023/").unwrap_err();
        assert!(error.contains("1024"));
        assert_eq!(
            preview_service_port("http://127.0.0.1:1024/").unwrap(),
            1024
        );
    }

    #[cfg(unix)]
    #[test]
    fn preview_candidate_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let root = preview_test_root("symlink-root");
        let outside = preview_test_root("symlink-outside");
        fs::write(
            outside.join("package.json"),
            r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}"#,
        )
        .unwrap();
        symlink(&outside, root.join("web")).unwrap();

        let error =
            infer_preview_command(root.to_str().unwrap(), "http://127.0.0.1:5173/").unwrap_err();
        assert!(error.contains("outside"));
    }

    #[cfg(unix)]
    #[test]
    fn preview_package_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let root = preview_test_root("package-symlink-root");
        let outside = preview_test_root("package-symlink-outside");
        let outside_package = outside.join("package.json");
        fs::write(
            &outside_package,
            r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}"#,
        )
        .unwrap();
        symlink(&outside_package, root.join("package.json")).unwrap();

        let error =
            infer_preview_command(root.to_str().unwrap(), "http://127.0.0.1:5173/").unwrap_err();
        assert!(error.contains("outside"));
    }

    #[cfg(unix)]
    #[test]
    fn preview_process_receives_only_allowlisted_environment() {
        let root = preview_test_root("process-environment");
        let plan = PreviewCommandPlan {
            cwd: root.to_string_lossy().into_owned(),
            program: "/usr/bin/env".to_string(),
            args: Vec::new(),
            command: "/usr/bin/env".to_string(),
        };
        let output = preview_process_command(&plan).unwrap().output().unwrap();
        assert!(output.status.success());
        let environment = String::from_utf8(output.stdout).unwrap();
        let keys = environment
            .lines()
            .filter_map(|line| line.split_once('=').map(|(key, _)| key))
            .collect::<BTreeSet<_>>();
        assert_eq!(
            keys,
            BTreeSet::from(["BROWSER", "HOME", "NO_PROXY", "PATH", "TMPDIR"])
        );
        for sensitive in [
            "SSH_AUTH_SOCK",
            "ANTHROPIC_API_KEY",
            "OPENAI_API_KEY",
            "GITHUB_TOKEN",
            "AWS_SECRET_ACCESS_KEY",
        ] {
            assert!(!environment.contains(&format!("{sensitive}=")));
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_preview_sandbox_escapes_sbpl_paths() {
        assert_eq!(
            sbpl_string_literal(r#"/tmp/preview-"quoted"-back\slash"#).unwrap(),
            r#""/tmp/preview-\"quoted\"-back\\slash""#
        );
        assert!(sbpl_string_literal("/tmp/preview\npath").is_err());

        let root = preview_test_root("sbpl-path");
        let quoted = root.join("quoted-\"-back\\slash");
        fs::create_dir_all(&quoted).unwrap();
        let script = quoted.join("path-probe.js");
        fs::write(
            &script,
            r#"const fs = require("node:fs");
fs.readFileSync(__filename);
console.log("quoted-path-read-allowed");"#,
        )
        .unwrap();
        let node = resolve_preview_program("node").unwrap();
        let plan = PreviewCommandPlan {
            cwd: fs::canonicalize(&quoted)
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            program: node.to_string_lossy().into_owned(),
            args: vec![script.to_string_lossy().into_owned()],
            command: "path probe".to_string(),
        };
        let mut command = preview_process_command(&plan).unwrap();
        command.current_dir(&plan.cwd);
        let output = command.output().unwrap();
        assert!(output.status.success());
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).trim(),
            "quoted-path-read-allowed"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_preview_sandbox_makes_workspace_read_only_and_blocks_all_network() {
        let root = preview_test_root("macos-sandbox-probe");
        fs::create_dir_all(root.join(".git/hooks")).unwrap();
        let original_package = r#"{"name":"sandbox-probe","private":true}"#;
        fs::write(root.join("package.json"), original_package).unwrap();
        fs::write(root.join("source.ts"), "original source").unwrap();
        let script = root.join("sandbox-probe.js");
        fs::write(
            &script,
            r#"const fs = require("node:fs");
const net = require("node:net");
const [readTarget, ...writeTargets] = process.argv.slice(2);
function writeCode(path) {
  try { fs.writeFileSync(path, "blocked"); return "ALLOWED"; }
  catch (error) { return error && error.code; }
}
function listenCode(host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error && error.code));
    server.listen(0, host, () => server.close(() => resolve("ALLOWED")));
  });
}
function connectCode() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "203.0.113.1", port: 9 });
    socket.once("connect", () => { socket.destroy(); resolve("ALLOWED"); });
    socket.once("error", (error) => resolve(error && error.code));
    setTimeout(() => { socket.destroy(); resolve("TIMEOUT"); }, 1200);
  });
}
(async () => {
  const result = {
    homeReadCode: (() => { try { fs.readFileSync(readTarget); return "ALLOWED"; } catch (error) { return error && error.code; } })(),
    workspaceRead: (() => { try { fs.readFileSync(__filename); return true; } catch { return false; } })(),
    writeCodes: writeTargets.map(writeCode),
    sandboxWriteCode: writeCode(process.env.HOME + "/sandbox-marker"),
    loopbackBindCode: await listenCode("127.0.0.1"),
    wildcardV4BindCode: await listenCode("0.0.0.0"),
    wildcardV6BindCode: await listenCode("::"),
    outboundCode: await connectCode(),
    sandboxHome: process.env.HOME,
  };
  console.log(JSON.stringify(result));
  const blocked = [result.homeReadCode, ...result.writeCodes,
    result.loopbackBindCode, result.wildcardV4BindCode,
    result.wildcardV6BindCode, result.outboundCode].every((code) => code === "EPERM");
  process.exit(blocked && result.workspaceRead && result.sandboxWriteCode === "ALLOWED" ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });
"#,
        )
        .unwrap();

        let actual_home = fs::canonicalize(std::env::var_os("HOME").unwrap()).unwrap();
        let outside_read = fs::canonicalize(std::env::current_exe().unwrap()).unwrap();
        assert!(outside_read.starts_with(&actual_home));
        assert!(!outside_read.starts_with(fs::canonicalize(&root).unwrap()));
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let mut outside_writes = vec![
            root.join(".git/hooks/blocked-hook"),
            root.join("package.json"),
            root.join("source.ts"),
            actual_home.join(format!(".atelier-preview-denied-{nonce}")),
        ];
        for directory in [Path::new("/opt/homebrew"), Path::new("/Applications")] {
            if directory.is_dir()
                && Command::new("/usr/bin/test")
                    .arg("-w")
                    .arg(directory)
                    .status()
                    .is_ok_and(|status| status.success())
            {
                outside_writes.push(directory.join(format!(".atelier-preview-denied-{nonce}")));
            }
        }
        assert!(outside_writes.len() >= 4);
        for path in &outside_writes {
            if path.ends_with("package.json") || path.ends_with("source.ts") {
                continue;
            }
            assert!(!path.exists(), "{}", path.display());
        }

        let node = resolve_preview_program("node").unwrap();
        let plan = PreviewCommandPlan {
            cwd: fs::canonicalize(&root)
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            program: node.to_string_lossy().into_owned(),
            args: std::iter::once(script.to_string_lossy().into_owned())
                .chain(std::iter::once(outside_read.to_string_lossy().into_owned()))
                .chain(
                    outside_writes
                        .iter()
                        .map(|path| path.to_string_lossy().into_owned()),
                )
                .collect(),
            command: "sandbox probe".to_string(),
        };
        let mut command = preview_process_command(&plan).unwrap();
        command.current_dir(&plan.cwd);
        let output = command.output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let result: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(
            result.get("homeReadCode").and_then(Value::as_str),
            Some("EPERM")
        );
        assert_eq!(
            result.get("workspaceRead").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            result.get("sandboxWriteCode").and_then(Value::as_str),
            Some("ALLOWED")
        );
        for key in [
            "loopbackBindCode",
            "wildcardV4BindCode",
            "wildcardV6BindCode",
            "outboundCode",
        ] {
            assert_eq!(
                result.get(key).and_then(Value::as_str),
                Some("EPERM"),
                "{key}"
            );
        }
        let write_codes = result.get("writeCodes").and_then(Value::as_array).unwrap();
        assert_eq!(write_codes.len(), outside_writes.len());
        assert!(write_codes
            .iter()
            .all(|code| code.as_str() == Some("EPERM")));
        assert_eq!(
            fs::read_to_string(root.join("package.json")).unwrap(),
            original_package
        );
        assert_eq!(
            fs::read_to_string(root.join("source.ts")).unwrap(),
            "original source"
        );
        for path in &outside_writes {
            if path.ends_with("package.json") || path.ends_with("source.ts") {
                continue;
            }
            assert!(!path.exists(), "{}", path.display());
        }
        let sandbox_home =
            PathBuf::from(result.get("sandboxHome").and_then(Value::as_str).unwrap());
        assert!(sandbox_home.join("sandbox-marker").is_file());
    }

    #[test]
    fn managed_preview_execution_fails_closed_before_spawn() {
        let error = ensure_managed_preview_execution_enabled().unwrap_err();
        assert!(error.contains("disabled"));
        assert!(error.contains("trusted loopback service"));
    }

    #[test]
    fn preview_capability_reports_shared_fail_closed_reason() {
        let capability = preview_capability_snapshot();
        assert!(!capability.managed_start);
        assert!(capability.external_loopback_inspection);
        assert_eq!(
            capability.managed_start_reason.as_deref(),
            Some(MANAGED_PREVIEW_DISABLED_REASON)
        );
        assert_eq!(
            ensure_managed_preview_execution_enabled().unwrap_err(),
            MANAGED_PREVIEW_DISABLED_REASON
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_npm_preview_runs_target_without_pre_or_post_hooks() {
        let root = preview_test_root("npm-lifecycle-sandbox");
        fs::write(
            root.join("package.json"),
            r#"{
  "name": "atelier-preview-lifecycle-test",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "predev": "node -e \"require('fs').writeFileSync(process.env.HOME + '/pre-marker', 'pre')\"",
    "dev": "node server.js",
    "postdev": "node -e \"require('fs').writeFileSync(process.env.HOME + '/post-marker', 'post')\""
  }
}"#,
        )
        .unwrap();
        fs::write(
            root.join("server.js"),
            r#"require("node:fs").writeFileSync(process.env.HOME + "/dev-marker", "dev");
console.log("SANDBOX_HOME=" + process.env.HOME);"#,
        )
        .unwrap();

        let plan =
            validate_provided_preview_command(root.to_str().unwrap(), "npm run dev", 5173).unwrap();
        assert!(plan.args.iter().any(|arg| arg == "--ignore-scripts"));
        let mut command = preview_process_command(&plan).unwrap();
        command.current_dir(&plan.cwd);
        let output = command.output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let stdout = String::from_utf8_lossy(&output.stdout);
        let isolated_home = stdout
            .lines()
            .find_map(|line| line.strip_prefix("SANDBOX_HOME="))
            .unwrap();
        assert!(isolated_home.contains("atelier-preview-sandbox"));
        assert_ne!(isolated_home, std::env::var("HOME").unwrap());
        let isolated_home = Path::new(isolated_home);
        assert!(isolated_home.join("dev-marker").exists());
        assert!(!isolated_home.join("pre-marker").exists());
        assert!(!isolated_home.join("post-marker").exists());
        assert!(!root.join("dev-marker").exists());
    }
}
