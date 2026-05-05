use std::collections::{BTreeMap, HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Serialize, Clone)]
struct AgentStreamEvent {
    kind: String,
    text: Option<String>,
    status: Option<String>,
    raw: Option<String>,
    provider_session_id: Option<String>,
    is_error: Option<bool>,
}

#[derive(Serialize)]
pub struct AgentRunResult {
    text: String,
    provider_session_id: Option<String>,
    raw_events: Vec<String>,
    is_error: bool,
    error: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct AgentChangedFile {
    path: String,
    status: String,
    additions: u64,
    deletions: u64,
    binary: bool,
    diff: String,
}

#[derive(Serialize, Clone)]
pub struct AgentChangeSummary {
    cwd: String,
    is_git: bool,
    files: Vec<AgentChangedFile>,
    additions: u64,
    deletions: u64,
    patch: String,
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
    let (authority, path) = match rest.find(|c| c == '/' || c == '?' || c == '#') {
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
    let Some(child) = service.child.as_ref() else { return };
    let status = child.lock().ok().and_then(|mut child| child.try_wait().ok()).flatten();
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

fn infer_preview_command(cwd: &str, url: &str) -> Result<String, String> {
    let port = preview_service_port(url)?;
    let package_json = PathBuf::from(cwd).join("package.json");
    if !package_json.exists() {
        return Err("No package.json found in the working folder. Enter a preview start command.".into());
    }
    let text = std::fs::read_to_string(&package_json)
        .map_err(|e| format!("read package.json: {e}"))?;
    let value: Value = serde_json::from_str(&text).map_err(|e| format!("parse package.json: {e}"))?;
    let scripts = value.get("scripts").and_then(Value::as_object);
    let script = if scripts.and_then(|s| s.get("dev")).and_then(Value::as_str).is_some() {
        "dev"
    } else if scripts.and_then(|s| s.get("start")).and_then(Value::as_str).is_some() {
        "start"
    } else if scripts.and_then(|s| s.get("preview")).and_then(Value::as_str).is_some() {
        "preview"
    } else {
        return Err("package.json has no dev, start, or preview script.".into());
    };
    Ok(format!("npm run {script} -- --host 127.0.0.1 --port {port}"))
}

#[cfg(target_os = "windows")]
fn preview_shell_command(command: &str) -> Command {
    let mut cmd = Command::new("cmd.exe");
    cmd.arg("/C").arg(command);
    cmd
}

#[cfg(not(target_os = "windows"))]
fn preview_shell_command(command: &str) -> Command {
    let mut cmd = Command::new("sh");
    cmd.arg("-lc").arg(command);
    cmd
}

fn push_preview_output(id: &str, line: String) {
    let Ok(mut services) = preview_services().lock() else { return };
    let Some(service) = services.get_mut(id) else { return };
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
        for line in reader.lines().flatten() {
            push_preview_output(&id, line.clone());
            let _ = app.emit(
                &format!("preview-service://{id}/event"),
                PreviewServiceEvent {
                    id: id.clone(),
                    url: url.clone(),
                    kind: kind.to_string(),
                    line: Some(line),
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
        spawn_preview_output_reader(app.clone(), id.to_string(), url.to_string(), "stdout", stdout);
    }
    if let Some(stderr) = stderr {
        spawn_preview_output_reader(app.clone(), id.to_string(), url.to_string(), "stderr", stderr);
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
    let cwd = cwd
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| ".".into()));
    let command = command
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(Ok)
        .unwrap_or_else(|| infer_preview_command(&cwd, &parsed.url))?;
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
    let restarts = services.get(&id).map(|s| s.restarts.saturating_add(1)).unwrap_or(0);
    let service = services.entry(id.clone()).or_insert_with(|| ManagedPreviewService {
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
        .replace('\n', " ")
        .replace('\r', " ")
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
        _ if entity.starts_with("#x") || entity.starts_with("#X") => u32::from_str_radix(&entity[2..], 16)
            .ok()
            .and_then(char::from_u32),
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
        let after_start = lower[start..].find('>').map(|idx| start + idx + 1).unwrap_or(start);
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
                if matches!(tag_name.as_str(), "script" | "style" | "svg") && !tag.trim_start().starts_with('/') {
                    skip_until = Some(match tag_name.as_str() {
                        "script" => "</script",
                        "style" => "</style",
                        _ => "</svg",
                    });
                }
                if matches!(tag_name.as_str(), "br" | "p" | "div" | "li" | "tr" | "h1" | "h2" | "h3" | "pre") {
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
        "localhost" => vec!["127.0.0.1".to_string(), "[::1]".to_string(), "localhost".to_string()],
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

fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("PATH", crate::augmented_cli_path())
        .output()
        .map_err(|e| format!("git {}: {e}", args.join(" ")))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_git_with_input(root: &str, args: &[&str], input: &str) -> Result<(), String> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("PATH", crate::augmented_cli_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("git {}: {e}", args.join(" ")))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input.as_bytes())
            .map_err(|e| format!("git apply stdin: {e}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("git wait: {e}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

fn git_root(cwd: Option<String>) -> Result<String, String> {
    let cwd = cwd
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| ".".to_string());
    run_git(&cwd, &["rev-parse", "--show-toplevel"]).map(|s| s.trim().to_string())
}

fn status_label(raw: &str) -> String {
    if raw == "??" {
        return "untracked".to_string();
    }
    if raw.contains('R') {
        return "renamed".to_string();
    }
    if raw.contains('D') {
        return "deleted".to_string();
    }
    if raw.contains('A') {
        return "added".to_string();
    }
    "modified".to_string()
}

fn status_path(line: &str) -> Option<(String, String)> {
    if line.len() < 4 {
        return None;
    }
    let status = line.get(0..2)?.to_string();
    let path = line.get(3..)?.rsplit(" -> ").next()?.trim_matches('"').to_string();
    Some((status, path))
}

fn count_text_lines(root: &str, path: &str) -> u64 {
    let path = std::path::Path::new(root).join(path);
    let Ok(meta) = std::fs::metadata(&path) else { return 0 };
    if !meta.is_file() || meta.len() > 512 * 1024 {
        return 0;
    }
    let Ok(text) = std::fs::read_to_string(path) else { return 0 };
    text.lines().count() as u64
}

fn clip_diff(diff: String) -> String {
    const MAX_DIFF_CHARS: usize = 14000;
    if diff.chars().count() <= MAX_DIFF_CHARS {
        return diff;
    }
    let clipped = diff.chars().take(MAX_DIFF_CHARS).collect::<String>();
    format!("{clipped}\n... diff truncated ...")
}

fn build_change_summary(cwd: Option<String>) -> Result<AgentChangeSummary, String> {
    let root = match git_root(cwd) {
        Ok(root) => root,
        Err(_) => {
            return Ok(AgentChangeSummary {
                cwd: ".".to_string(),
                is_git: false,
                files: Vec::new(),
                additions: 0,
                deletions: 0,
                patch: String::new(),
            });
        }
    };

    let status = run_git(&root, &["status", "--porcelain=v1", "--untracked-files=all"])?;
    let mut files: BTreeMap<String, AgentChangedFile> = BTreeMap::new();
    for line in status.lines().filter(|line| !line.trim().is_empty()) {
        let Some((raw_status, path)) = status_path(line) else { continue };
        files.entry(path.clone()).or_insert_with(|| AgentChangedFile {
            path,
            status: status_label(raw_status.trim()),
            additions: 0,
            deletions: 0,
            binary: false,
            diff: String::new(),
        });
    }

    let numstat = run_git(&root, &["diff", "--numstat", "HEAD", "--"]).unwrap_or_default();
    for line in numstat.lines() {
        let mut parts = line.splitn(3, '\t');
        let add_raw = parts.next().unwrap_or_default();
        let del_raw = parts.next().unwrap_or_default();
        let Some(path) = parts.next() else { continue };
        let binary = add_raw == "-" || del_raw == "-";
        let additions = add_raw.parse::<u64>().unwrap_or(0);
        let deletions = del_raw.parse::<u64>().unwrap_or(0);
        let entry = files.entry(path.to_string()).or_insert_with(|| AgentChangedFile {
            path: path.to_string(),
            status: "modified".to_string(),
            additions: 0,
            deletions: 0,
            binary,
            diff: String::new(),
        });
        entry.additions = entry.additions.saturating_add(additions);
        entry.deletions = entry.deletions.saturating_add(deletions);
        entry.binary = entry.binary || binary;
    }

    for file in files.values_mut() {
        if file.status == "untracked" {
            file.additions = count_text_lines(&root, &file.path);
            continue;
        }
        file.diff = clip_diff(
            run_git(&root, &["diff", "--color=never", "HEAD", "--", &file.path]).unwrap_or_default(),
        );
    }

    let mut files = files.into_values().collect::<Vec<_>>();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let additions = files.iter().map(|f| f.additions).sum();
    let deletions = files.iter().map(|f| f.deletions).sum();
    let patch = run_git(&root, &["diff", "--binary", "HEAD", "--"]).unwrap_or_default();

    Ok(AgentChangeSummary {
        cwd: root,
        is_git: true,
        files,
        additions,
        deletions,
        patch,
    })
}

fn emit_agent_event<R: Runtime>(app: &AppHandle<R>, turn_id: &str, event: AgentStreamEvent) {
    let _ = app.emit(&format!("agent://{turn_id}/event"), event);
}

fn normalize_claude_model(model: Option<String>) -> String {
    let value = model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("claude-sonnet-4-6");
    match value {
        "default" | "sonnet" | "sonnet[1m]" | "claude-sonnet-4" | "claude-sonnet-4-20250514" => {
            "claude-sonnet-4-6".to_string()
        }
        "opus" | "best" | "opusplan" | "opus[1m]" | "claude-opus-4-1" | "claude-opus-4-1-20250805"
        | "claude-opus-4-20250514" => "claude-opus-4-7".to_string(),
        "haiku" | "claude-haiku-4-5" | "claude-3-5-haiku-latest" | "claude-3-5-haiku-20241022" => {
            "claude-haiku-4-5-20251001".to_string()
        }
        other => other.to_string(),
    }
}

fn normalize_hermes_provider(provider: Option<String>) -> String {
    match provider
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("openai-codex")
    {
        "anthropic" => "anthropic".to_string(),
        "openrouter" => "openrouter".to_string(),
        "openai-codex" | "codex" => "openai-codex".to_string(),
        _ => "openai-codex".to_string(),
    }
}

fn text_from_assistant_message(v: &Value) -> Option<String> {
    let content = v.get("message")?.get("content")?.as_array()?;
    let mut out = String::new();
    for block in content {
        if block.get("type").and_then(Value::as_str) == Some("text") {
            if let Some(text) = block.get("text").and_then(Value::as_str) {
                out.push_str(text);
            }
        }
    }
    if out.is_empty() { None } else { Some(out) }
}

fn parse_claude_line<R: Runtime>(
    app: &AppHandle<R>,
    turn_id: &str,
    line: &str,
    final_text: &mut String,
    provider_session_id: &mut Option<String>,
    is_error: &mut bool,
    error: &mut Option<String>,
) {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        emit_agent_event(app, turn_id, AgentStreamEvent {
            kind: "raw".into(),
            text: None,
            status: None,
            raw: Some(line.to_string()),
            provider_session_id: provider_session_id.clone(),
            is_error: None,
        });
        return;
    };

    if provider_session_id.is_none() {
        if let Some(id) = v.get("session_id").and_then(Value::as_str) {
            *provider_session_id = Some(id.to_string());
        }
    }

    match v.get("type").and_then(Value::as_str).unwrap_or_default() {
        "system" => {
            if let Some(id) = v.get("session_id").and_then(Value::as_str) {
                *provider_session_id = Some(id.to_string());
            }
            let status = v
                .get("subtype")
                .and_then(Value::as_str)
                .or_else(|| v.get("status").and_then(Value::as_str))
                .unwrap_or("system")
                .to_string();
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "status".into(),
                text: None,
                status: Some(status),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: None,
            });
        }
        "stream_event" => {
            let event = v.get("event").unwrap_or(&Value::Null);
            let event_type = event.get("type").and_then(Value::as_str).unwrap_or_default();
            if event_type == "content_block_delta" {
                if let Some(text) = event
                    .get("delta")
                    .and_then(|d| d.get("text"))
                    .and_then(Value::as_str)
                {
                    emit_agent_event(app, turn_id, AgentStreamEvent {
                        kind: "delta".into(),
                        text: Some(text.to_string()),
                        status: None,
                        raw: Some(line.to_string()),
                        provider_session_id: provider_session_id.clone(),
                        is_error: None,
                    });
                }
            } else if event_type == "content_block_start" {
                if let Some(block_type) = event
                    .get("content_block")
                    .and_then(|b| b.get("type"))
                    .and_then(Value::as_str)
                {
                    if block_type != "text" {
                        emit_agent_event(app, turn_id, AgentStreamEvent {
                            kind: "tool".into(),
                            text: event
                                .get("content_block")
                                .and_then(|b| b.get("name"))
                                .and_then(Value::as_str)
                                .map(str::to_string)
                                .or_else(|| Some(block_type.to_string())),
                            status: Some(block_type.to_string()),
                            raw: Some(line.to_string()),
                            provider_session_id: provider_session_id.clone(),
                            is_error: None,
                        });
                    }
                }
            }
        }
        "assistant" => {
            if let Some(text) = text_from_assistant_message(&v) {
                *final_text = text;
            }
        }
        "result" => {
            if let Some(id) = v.get("session_id").and_then(Value::as_str) {
                *provider_session_id = Some(id.to_string());
            }
            *is_error = v.get("is_error").and_then(Value::as_bool).unwrap_or(false);
            if let Some(result) = v.get("result").and_then(Value::as_str) {
                *final_text = result.to_string();
            }
            if *is_error {
                *error = Some(
                    v.get("api_error_status")
                        .and_then(Value::as_str)
                        .unwrap_or("Claude returned an error")
                        .to_string(),
                );
            }
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "result".into(),
                text: Some(final_text.clone()),
                status: v.get("stop_reason").and_then(Value::as_str).map(str::to_string),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: Some(*is_error),
            });
        }
        "error" => {
            *is_error = true;
            let msg = v
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Claude stream error")
                .to_string();
            *error = Some(msg.clone());
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "error".into(),
                text: Some(msg),
                status: Some("error".into()),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: Some(true),
            });
        }
        _ => {}
    }
}

fn run_claude<R: Runtime>(
    app: AppHandle<R>,
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
) -> Result<AgentRunResult, String> {
    let model = normalize_claude_model(model);
    let mut cmd = Command::new("claude");
    cmd.arg("-p")
        .arg("--verbose")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--include-partial-messages")
        .arg("--model")
        .arg(model)
        .env("PATH", crate::augmented_cli_path())
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(session_id) = resume_session_id.filter(|s| !s.trim().is_empty()) {
        cmd.arg("--resume").arg(session_id);
    }
    if let Some(cwd) = cwd.filter(|s| !s.trim().is_empty()) {
        cmd.current_dir(cwd);
    }

    emit_agent_event(&app, &turn_id, AgentStreamEvent {
        kind: "status".into(),
        text: None,
        status: Some("starting".into()),
        raw: None,
        provider_session_id: None,
        is_error: None,
    });

    let mut child = cmd.spawn().map_err(|e| format!("claude spawn: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .map_err(|e| format!("claude stdin: {e}"))?;
    }

    let stderr = child.stderr.take();
    let stderr_handle = stderr.map(|stderr| {
        thread::spawn(move || {
            let mut out = String::new();
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(&line);
            }
            out
        })
    });

    let stdout = child.stdout.take().ok_or_else(|| "claude stdout missing".to_string())?;
    let reader = BufReader::new(stdout);
    let mut raw_events = Vec::new();
    let mut final_text = String::new();
    let mut provider_session_id = None;
    let mut is_error = false;
    let mut error = None;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("claude stdout: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        raw_events.push(line.clone());
        parse_claude_line(
            &app,
            &turn_id,
            &line,
            &mut final_text,
            &mut provider_session_id,
            &mut is_error,
            &mut error,
        );
    }

    let status = child.wait().map_err(|e| format!("claude wait: {e}"))?;
    let stderr_text = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();
    if !status.success() {
        is_error = true;
        if error.is_none() {
            error = Some(if stderr_text.trim().is_empty() {
                format!("claude exited with {}", status.code().unwrap_or(-1))
            } else {
                stderr_text.trim().to_string()
            });
        }
        emit_agent_event(&app, &turn_id, AgentStreamEvent {
            kind: "error".into(),
            text: error.clone(),
            status: Some("exit".into()),
            raw: None,
            provider_session_id: provider_session_id.clone(),
            is_error: Some(true),
        });
    }

    Ok(AgentRunResult {
        text: final_text,
        provider_session_id,
        raw_events,
        is_error,
        error,
    })
}

fn parse_codex_line<R: Runtime>(
    app: &AppHandle<R>,
    turn_id: &str,
    line: &str,
    final_text: &mut String,
    provider_session_id: &mut Option<String>,
    is_error: &mut bool,
    error: &mut Option<String>,
) {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        emit_agent_event(app, turn_id, AgentStreamEvent {
            kind: "raw".into(),
            text: None,
            status: None,
            raw: Some(line.to_string()),
            provider_session_id: provider_session_id.clone(),
            is_error: None,
        });
        return;
    };

    match v.get("type").and_then(Value::as_str).unwrap_or_default() {
        "thread.started" => {
            if let Some(id) = v.get("thread_id").and_then(Value::as_str) {
                *provider_session_id = Some(id.to_string());
            }
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "status".into(),
                text: None,
                status: Some("thread.started".into()),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: None,
            });
        }
        "turn.started" => {
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "status".into(),
                text: None,
                status: Some("turn.started".into()),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: None,
            });
        }
        "item.completed" => {
            let item = v.get("item").unwrap_or(&Value::Null);
            let item_type = item.get("type").and_then(Value::as_str).unwrap_or_default();
            if item_type == "agent_message" {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    *final_text = text.to_string();
                    emit_agent_event(app, turn_id, AgentStreamEvent {
                        kind: "result".into(),
                        text: Some(text.to_string()),
                        status: Some("agent_message".into()),
                        raw: Some(line.to_string()),
                        provider_session_id: provider_session_id.clone(),
                        is_error: Some(false),
                    });
                }
            } else {
                emit_agent_event(app, turn_id, AgentStreamEvent {
                    kind: "tool".into(),
                    text: Some(item_type.to_string()),
                    status: Some("item.completed".into()),
                    raw: Some(line.to_string()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                });
            }
        }
        "turn.failed" | "error" => {
            *is_error = true;
            let msg = v
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| v.get("error").and_then(Value::as_str))
                .unwrap_or("Codex returned an error")
                .to_string();
            *error = Some(msg.clone());
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "error".into(),
                text: Some(msg),
                status: Some("error".into()),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: Some(true),
            });
        }
        "turn.completed" => {
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "status".into(),
                text: None,
                status: Some("turn.completed".into()),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: Some(false),
            });
        }
        _ => {}
    }
}

fn run_codex<R: Runtime>(
    app: AppHandle<R>,
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    effort: Option<String>,
    speed: Option<String>,
) -> Result<AgentRunResult, String> {
    let mut cmd = Command::new("codex");
    cmd.arg("exec");
    if let Some(cwd) = cwd.filter(|s| !s.trim().is_empty()) {
        cmd.arg("--cd").arg(cwd);
    }
    if let Some(model) = model.filter(|s| !s.trim().is_empty()) {
        cmd.arg("--model").arg(model);
    }
    if let Some(effort) = effort
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| matches!(s.as_str(), "low" | "medium" | "high" | "xhigh"))
    {
        cmd.arg("-c")
            .arg(format!("model_reasoning_effort=\"{effort}\""));
    }
    if speed
        .map(|s| s.trim().eq_ignore_ascii_case("fast"))
        .unwrap_or(false)
    {
        cmd.arg("-c").arg("service_tier=\"fast\"");
    }
    cmd.env("PATH", crate::augmented_cli_path())
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(session_id) = resume_session_id.filter(|s| !s.trim().is_empty()) {
        cmd.arg("resume")
            .arg("--json")
            .arg("--skip-git-repo-check")
            .arg(session_id)
            .arg(prompt);
    } else {
        cmd.arg("--json")
            .arg("--sandbox")
            .arg("workspace-write")
            .arg("--skip-git-repo-check")
            .arg(prompt);
    }

    emit_agent_event(&app, &turn_id, AgentStreamEvent {
        kind: "status".into(),
        text: None,
        status: Some("codex.starting".into()),
        raw: None,
        provider_session_id: None,
        is_error: None,
    });

    let mut child = cmd.spawn().map_err(|e| format!("codex spawn: {e}"))?;
    let stderr = child.stderr.take();
    let stderr_handle = stderr.map(|stderr| {
        thread::spawn(move || {
            let mut out = String::new();
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(&line);
            }
            out
        })
    });

    let stdout = child.stdout.take().ok_or_else(|| "codex stdout missing".to_string())?;
    let reader = BufReader::new(stdout);
    let mut raw_events = Vec::new();
    let mut final_text = String::new();
    let mut provider_session_id = None;
    let mut is_error = false;
    let mut error = None;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("codex stdout: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        raw_events.push(line.clone());
        parse_codex_line(
            &app,
            &turn_id,
            &line,
            &mut final_text,
            &mut provider_session_id,
            &mut is_error,
            &mut error,
        );
    }

    let status = child.wait().map_err(|e| format!("codex wait: {e}"))?;
    let stderr_text = stderr_handle.and_then(|h| h.join().ok()).unwrap_or_default();
    if !status.success() {
        is_error = true;
        if error.is_none() {
            error = Some(if stderr_text.trim().is_empty() {
                format!("codex exited with {}", status.code().unwrap_or(-1))
            } else {
                stderr_text.trim().to_string()
            });
        }
        emit_agent_event(&app, &turn_id, AgentStreamEvent {
            kind: "error".into(),
            text: error.clone(),
            status: Some("exit".into()),
            raw: None,
            provider_session_id: provider_session_id.clone(),
            is_error: Some(true),
        });
    }

    Ok(AgentRunResult {
        text: final_text,
        provider_session_id,
        raw_events,
        is_error,
        error,
    })
}

fn run_hermes<R: Runtime>(
    app: AppHandle<R>,
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    hermes_provider: Option<String>,
) -> Result<AgentRunResult, String> {
    let hermes_provider = normalize_hermes_provider(hermes_provider);
    let mut cmd = Command::new("hermes");
    cmd.arg("chat")
        .arg("-Q")
        .arg("--max-turns")
        .arg("25")
        .arg("--provider")
        .arg(hermes_provider)
        .arg("-m")
        .arg(model.unwrap_or_else(|| "gpt-5.5".to_string()))
        .arg("-q")
        .arg(prompt)
        .env("PATH", crate::augmented_cli_path())
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(session_id) = resume_session_id.filter(|s| !s.trim().is_empty()) {
        cmd.arg("--resume").arg(session_id);
    }
    if let Some(cwd) = cwd.filter(|s| !s.trim().is_empty()) {
        cmd.current_dir(cwd);
    }

    emit_agent_event(&app, &turn_id, AgentStreamEvent {
        kind: "status".into(),
        text: None,
        status: Some("hermes.starting".into()),
        raw: None,
        provider_session_id: None,
        is_error: None,
    });

    let output = cmd.output().map_err(|e| format!("hermes spawn: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let mut provider_session_id = None;
    for line in stderr.lines().chain(stdout.lines()) {
        if let Some(rest) = line.strip_prefix("session_id:") {
            provider_session_id = Some(rest.trim().to_string());
        }
    }
    let raw_events = stdout
        .lines()
        .chain(stderr.lines())
        .filter(|l| !l.trim().is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    let mut text = stdout
        .lines()
        .filter(|l| !l.trim_start().starts_with("session_id:"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    if text.is_empty() && !stderr.is_empty() {
        text = stderr
            .lines()
            .filter(|l| !l.trim_start().starts_with("session_id:"))
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();
    }
    let is_error = !output.status.success();
    let error = if is_error {
        Some(if stderr.is_empty() {
            format!("hermes exited with {}", output.status.code().unwrap_or(-1))
        } else {
            stderr.clone()
        })
    } else {
        None
    };

    emit_agent_event(&app, &turn_id, AgentStreamEvent {
        kind: if is_error { "error".into() } else { "result".into() },
        text: Some(if is_error { error.clone().unwrap_or_default() } else { text.clone() }),
        status: Some("hermes.completed".into()),
        raw: Some(raw_events.join("\n")),
        provider_session_id: provider_session_id.clone(),
        is_error: Some(is_error),
    });

    Ok(AgentRunResult {
        text,
        provider_session_id,
        raw_events,
        is_error,
        error,
    })
}

#[tauri::command]
pub async fn agent_claude_send<R: Runtime>(
    app: AppHandle<R>,
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
) -> std::result::Result<AgentRunResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_claude(app, turn_id, prompt, resume_session_id, cwd, model)
    })
    .await
    .map_err(|e| format!("agent thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_send<R: Runtime>(
    app: AppHandle<R>,
    provider: String,
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    hermes_provider: Option<String>,
    effort: Option<String>,
    speed: Option<String>,
) -> std::result::Result<AgentRunResult, String> {
    tauri::async_runtime::spawn_blocking(move || match provider.as_str() {
        "claude" => run_claude(app, turn_id, prompt, resume_session_id, cwd, model),
        "codex" => run_codex(app, turn_id, prompt, resume_session_id, cwd, model, effort, speed),
        "hermes" => run_hermes(app, turn_id, prompt, resume_session_id, cwd, model, hermes_provider),
        other => Err(format!("unsupported provider: {other}")),
    })
    .await
    .map_err(|e| format!("agent thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_change_summary(cwd: Option<String>) -> std::result::Result<AgentChangeSummary, String> {
    tauri::async_runtime::spawn_blocking(move || build_change_summary(cwd))
        .await
        .map_err(|e| format!("change summary thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_undo_changes(cwd: String, patch: String) -> std::result::Result<(), String> {
    if patch.trim().is_empty() {
        return Err("empty patch".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let root = git_root(Some(cwd))?;
        run_git_with_input(&root, &["apply", "-R", "--whitespace=nowarn", "-"], &patch)
    })
    .await
    .map_err(|e| format!("undo thread join: {e}"))?
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
        assert_eq!(preview_service_id("http://127.0.0.1:5173/admin/"), "preview-5173");
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
    fn localhost_preview_checks_try_ipv4_and_ipv6() {
        let parsed = parse_local_preview_url("http://localhost:5173/admin/").unwrap();
        let candidates = preview_connect_candidates(&parsed);
        assert!(candidates.contains(&"127.0.0.1".to_string()));
        assert!(candidates.contains(&"[::1]".to_string()));
    }
}
