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
    parse_local_preview_url(url).map(|parsed| parsed.port)
}

#[derive(Clone, Debug)]
struct PreviewCommandPlan {
    cwd: String,
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

fn preview_command_extra_args(value: &Value, script_command: &str, port: u16) -> String {
    if preview_script_uses(value, script_command, "next") {
        format!("--hostname 127.0.0.1 --port {port}")
    } else {
        format!("--host 127.0.0.1 --port {port}")
    }
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

fn build_preview_command(
    root: &Path,
    cwd: &Path,
    script: &str,
    script_command: &str,
    value: &Value,
    port: u16,
) -> String {
    let manager = detect_preview_package_manager(cwd, root);
    let extra = preview_command_extra_args(value, script_command, port);
    match manager {
        "bun" => format!("bun run {script} -- {extra}"),
        "pnpm" => format!("pnpm run {script} -- {extra}"),
        "yarn" => format!("yarn run {script} -- {extra}"),
        _ => format!("npm run {script} -- {extra}"),
    }
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

fn preview_candidate_dirs(root: &Path) -> Vec<(PathBuf, usize)> {
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
            let next_depth = depth + 1;
            push_preview_candidate_dir(&mut dirs, &mut seen, path.clone(), next_depth);
            queue.push_back((path, next_depth));
            if dirs.len() >= 80 {
                return dirs;
            }
        }
    }

    dirs
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
    let text = fs::read_to_string(&package_json).map_err(|e| {
        format!(
            "read package.json at {}: {e}",
            package_json.to_string_lossy()
        )
    })?;
    let value: Value = serde_json::from_str(&text).map_err(|e| {
        format!(
            "parse package.json at {}: {e}",
            package_json.to_string_lossy()
        )
    })?;
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
    let root = PathBuf::from(cwd);
    let mut candidates = Vec::new();
    let mut saw_package_json = false;
    for (candidate_dir, depth) in preview_candidate_dirs(&root) {
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

    let command = build_preview_command(
        &root,
        &candidate.cwd,
        &candidate.script,
        &candidate.script_command,
        &candidate.value,
        port,
    );
    Ok(PreviewCommandPlan {
        cwd: candidate.cwd.to_string_lossy().into_owned(),
        command,
    })
}

#[cfg(target_os = "windows")]
fn preview_shell_command(command: &str) -> Command {
    let mut cmd = Command::new("cmd.exe");
    cmd.args(["/D", "/Q", "/S", "/C", command]);
    configure_windows_background_command(&mut cmd);
    cmd
}

#[cfg(not(target_os = "windows"))]
fn preview_shell_command(command: &str) -> Command {
    let mut cmd = Command::new("sh");
    cmd.arg("-lc").arg(command);
    cmd
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

fn redact_preview_output_line(line: &str) -> String {
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
            let safe_line = redact_preview_output_line(&line);
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
    cwd: &str,
    command: &str,
) -> Result<(Arc<Mutex<Child>>, u32), String> {
    let mut cmd = preview_shell_command(command);
    cmd.current_dir(cwd)
        .env("PATH", crate::augmented_cli_path())
        .env("BROWSER", "none")
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
    let cwd = cwd.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| ".".into())
    });
    let provided_command = command
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let plan = if let Some(command) = provided_command {
        PreviewCommandPlan {
            cwd: cwd.clone(),
            command,
        }
    } else {
        infer_preview_command(&cwd, &parsed.url)?
    };
    let cwd = plan.cwd;
    let command = plan.command;
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

    let (child, pid) = spawn_preview_child(&app, &id, &parsed.url, &cwd, &command)?;
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
pub async fn preview_service_start<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    cwd: Option<String>,
    command: Option<String>,
    auto_restart: Option<bool>,
) -> Result<PreviewServiceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        start_preview_service(app, url, cwd, command, auto_restart.unwrap_or(true))
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
        let redacted = redact_preview_output_line(
            "API_KEY=sk-preview-secret-123456789 Authorization: Bearer access-token-123456789 PASSWORD='hunter2'",
        );
        assert!(!redacted.contains("preview-secret"));
        assert!(!redacted.contains("access-token"));
        assert!(!redacted.contains("hunter2"));
        assert!(redacted.matches("<redacted>").count() >= 3);
        assert_eq!(
            redact_preview_output_line("password authentication failed"),
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

        assert_eq!(PathBuf::from(&plan.cwd), dashboard);
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

        assert_eq!(PathBuf::from(&plan.cwd), dashboard);
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

        assert_eq!(PathBuf::from(&plan.cwd), dashboard);
        assert!(plan.command.starts_with("pnpm run dev"));
        assert!(plan.command.contains("--host 127.0.0.1"));
    }
}
