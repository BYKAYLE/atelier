use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::{Child, Command, Output, Stdio};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime};

use crate::credentials::{env_var_for, read_api_key, sync_codex_auth_to_hermes};

const RETURN_RAW_EVENT_LIMIT: usize = 120;
const RETURN_RAW_EVENT_CHAR_LIMIT: usize = 12_000;

fn clip_return_raw_event(raw: &str) -> String {
    if raw.chars().count() <= RETURN_RAW_EVENT_CHAR_LIMIT {
        return raw.to_string();
    }
    let clipped = raw
        .chars()
        .take(RETURN_RAW_EVENT_CHAR_LIMIT)
        .collect::<String>();
    format!("{clipped}\n... raw event truncated ...")
}

fn tail_return_raw_events(raw_events: &[String]) -> Vec<String> {
    let start = raw_events.len().saturating_sub(RETURN_RAW_EVENT_LIMIT);
    raw_events[start..]
        .iter()
        .map(|event| clip_return_raw_event(event))
        .collect()
}

/// CLI subprocess 호출 직전, 사용자가 Settings → Connections 에 저장한 API 키를
/// 해당 provider 의 환경변수로 주입한다. 키가 없으면 기존 환경(시스템 env, OAuth 캐시) 그대로 사용.
fn inject_credential_env(cmd: &mut Command, provider: &str) {
    if let (Some(var), Some(key)) = (env_var_for(provider), read_api_key(provider)) {
        cmd.env(var, key);
    }
}

fn resolve_cli_executable(cli: &str) -> PathBuf {
    let direct = PathBuf::from(cli);
    if direct.is_absolute() || cli.contains('/') || cli.contains('\\') {
        return std::fs::canonicalize(&direct).unwrap_or(direct);
    }

    for dir in cli_search_paths() {
        let candidate = dir.join(cli);
        if candidate.is_file() {
            return std::fs::canonicalize(&candidate).unwrap_or(candidate);
        }
        #[cfg(target_os = "windows")]
        {
            let candidate = dir.join(format!("{cli}.exe"));
            if candidate.is_file() {
                return std::fs::canonicalize(&candidate).unwrap_or(candidate);
            }
        }
    }

    direct
}

fn cli_search_paths() -> Vec<PathBuf> {
    let mut paths = std::env::split_paths(&crate::augmented_cli_path()).collect::<Vec<_>>();
    if let Ok(home) = std::env::var("HOME") {
        if !home.trim().is_empty() {
            paths.push(PathBuf::from(format!("{home}/.local/bin")));
            paths.push(PathBuf::from(format!("{home}/.npm-global/bin")));
            paths.push(PathBuf::from(format!("{home}/.claude/local")));
            paths.push(PathBuf::from(format!("{home}/bin")));
        }
    }
    if let Ok(user) = std::env::var("USER").or_else(|_| std::env::var("LOGNAME")) {
        if !user.trim().is_empty() {
            let home = format!("/Users/{user}");
            paths.push(PathBuf::from(format!("{home}/.local/bin")));
            paths.push(PathBuf::from(format!("{home}/.npm-global/bin")));
            paths.push(PathBuf::from(format!("{home}/.claude/local")));
            paths.push(PathBuf::from(format!("{home}/bin")));
        }
    }
    paths.push(PathBuf::from("/opt/homebrew/bin"));
    paths.push(PathBuf::from("/usr/local/bin"));
    paths.push(PathBuf::from("/usr/bin"));
    paths.push(PathBuf::from("/bin"));

    let mut unique = Vec::new();
    for path in paths {
        if !unique.iter().any(|seen| seen == &path) {
            unique.push(path);
        }
    }
    unique
}

fn normalize_agent_cwd(cwd: Option<String>) -> Result<Option<PathBuf>, String> {
    let Some(raw) = cwd.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };

    let expanded = if raw == "~" {
        std::env::var("HOME").unwrap_or(raw)
    } else if let Some(rest) = raw.strip_prefix("~/") {
        match std::env::var("HOME") {
            Ok(home) if !home.trim().is_empty() => format!("{home}/{rest}"),
            _ => raw,
        }
    } else {
        raw
    };

    let resolved = std::fs::canonicalize(&expanded)
        .map_err(|_| format!("작업 폴더를 찾을 수 없습니다: {expanded}"))?;
    if !resolved.is_dir() {
        return Err(format!("작업 폴더가 아닙니다: {}", resolved.display()));
    }
    Ok(Some(resolved))
}

fn command_for_cli(cli: &str) -> Command {
    let executable = resolve_cli_executable(cli);
    if let Some((interpreter, mut args)) = script_interpreter(&executable) {
        let mut command = Command::new(interpreter);
        for arg in args.drain(..) {
            command.arg(arg);
        }
        command.arg(executable);
        return command;
    }
    Command::new(executable)
}

fn command_for_hermes() -> Command {
    let executable = resolve_cli_executable("hermes");
    if let Some(parent) = executable.parent() {
        let activate = parent.join("activate");
        if activate.is_file() && PathBuf::from("/bin/zsh").is_file() {
            let mut command = Command::new("/bin/zsh");
            command
                .arg("-lc")
                .arg("source \"$HERMES_VENV_ACTIVATE\" && exec hermes \"$@\"")
                .arg("hermes")
                .env("HERMES_VENV_ACTIVATE", activate);
            return command;
        }
    }
    command_for_cli("hermes")
}

fn is_help_request(args: &[String]) -> bool {
    args.iter()
        .any(|arg| matches!(arg.as_str(), "-h" | "--help" | "help"))
}

fn allow_cli_subcommand(
    provider: &str,
    args: &[String],
    parent: &str,
    allowed: &[&str],
) -> Result<(), String> {
    if is_help_request(args) {
        return Ok(());
    }
    let Some(subcommand) = args.get(1).map(|arg| arg.as_str()) else {
        return Err(format!(
            "{provider} {parent} 명령은 하위 명령이 필요합니다. 사용 가능: {}",
            allowed.join(", ")
        ));
    };
    if allowed.contains(&subcommand) {
        return Ok(());
    }
    Err(format!(
        "{provider} {parent} {subcommand} 명령은 Atelier에서 바로 실행하지 않습니다. 사용 가능: {}",
        allowed.join(", ")
    ))
}

fn validate_agent_cli_command(provider: &str, args: &[String]) -> Result<(), String> {
    if args.is_empty() {
        return Err("실행할 CLI 명령이 비어 있습니다.".into());
    }
    if args.iter().any(|arg| arg.contains('\0')) {
        return Err("명령 인자에 허용되지 않는 문자가 있습니다.".into());
    }

    let lowered: Vec<String> = args.iter().map(|arg| arg.to_lowercase()).collect();
    let first = lowered[0].as_str();
    let blocked = [
        "remove",
        "rm",
        "uninstall",
        "delete",
        "purge",
        "prune",
        "autoremove",
        "clear",
        "reset",
        "reset-project-choices",
        "serve",
        "add",
        "add-json",
        "add-from-claude-desktop",
        "install",
        "update",
        "upgrade",
        "publish",
        "tag",
        "import",
        "backup",
        "dump",
        "logout",
    ];
    if lowered.iter().any(|arg| blocked.contains(&arg.as_str())) {
        return Err(
            "Atelier에서는 삭제/설치/초기화/서버 실행류 CLI 명령을 바로 실행하지 않습니다.".into(),
        );
    }
    if lowered
        .iter()
        .any(|arg| matches!(arg.as_str(), "-f" | "--follow" | "--fix" | "--ack"))
    {
        return Err(
            "오래 실행되거나 상태를 직접 변경하는 옵션은 작업 탭에서 실행하지 않습니다.".into(),
        );
    }

    match provider {
        "hermes" => match first {
            "status" | "version" | "doctor" => Ok(()),
            "plugins" => allow_cli_subcommand(
                provider,
                &lowered,
                "plugins",
                &["list", "ls", "enable", "disable"],
            ),
            "tools" => {
                allow_cli_subcommand(provider, &lowered, "tools", &["list", "enable", "disable"])
            }
            "skills" => allow_cli_subcommand(
                provider,
                &lowered,
                "skills",
                &[
                    "list", "browse", "search", "inspect", "check", "audit", "config",
                ],
            ),
            "mcp" => allow_cli_subcommand(
                provider,
                &lowered,
                "mcp",
                &["list", "ls", "test", "config", "configure"],
            ),
            "sessions" => {
                allow_cli_subcommand(provider, &lowered, "sessions", &["list", "stats", "browse"])
            }
            "logs" => Ok(()),
            _ => Err(format!(
                "Hermes 작업 탭에서 지원하지 않는 명령입니다: {first}"
            )),
        },
        "claude" => match first {
            "doctor" => Ok(()),
            "auth" => allow_cli_subcommand(provider, &lowered, "auth", &["status"]),
            "plugin" | "plugins" => allow_cli_subcommand(
                provider,
                &lowered,
                first,
                &[
                    "list",
                    "details",
                    "enable",
                    "disable",
                    "marketplace",
                    "validate",
                ],
            ),
            "mcp" => allow_cli_subcommand(provider, &lowered, "mcp", &["list", "get"]),
            "auto-mode" => Ok(()),
            _ => Err(format!(
                "Claude 작업 탭에서 지원하지 않는 명령입니다: {first}"
            )),
        },
        "codex" => match first {
            "mcp" => allow_cli_subcommand(provider, &lowered, "mcp", &["list", "get"]),
            "features" => allow_cli_subcommand(
                provider,
                &lowered,
                "features",
                &["list", "enable", "disable"],
            ),
            "login" => allow_cli_subcommand(provider, &lowered, "login", &["status"]),
            "plugin" => allow_cli_subcommand(provider, &lowered, "plugin", &["marketplace"]),
            "review" => Ok(()),
            _ => Err(format!(
                "Codex 작업 탭에서 지원하지 않는 명령입니다: {first}"
            )),
        },
        other => Err(format!("지원하지 않는 provider입니다: {other}")),
    }
}

fn clip_cli_output(text: String) -> String {
    const MAX_CLI_OUTPUT_CHARS: usize = 16_000;
    if text.chars().count() <= MAX_CLI_OUTPUT_CHARS {
        return text;
    }
    let clipped = text.chars().take(MAX_CLI_OUTPUT_CHARS).collect::<String>();
    format!("{clipped}\n... output truncated ...")
}

fn wait_with_timeout(mut child: Child, timeout: Duration) -> Result<(Output, bool), String> {
    let started = Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|e| format!("CLI 상태 확인 실패: {e}"))?
            .is_some()
        {
            return child
                .wait_with_output()
                .map(|output| (output, false))
                .map_err(|e| format!("CLI 출력 수집 실패: {e}"));
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let output = child
                .wait_with_output()
                .map_err(|e| format!("CLI timeout 후 출력 수집 실패: {e}"))?;
            return Ok((output, true));
        }
        thread::sleep(Duration::from_millis(80));
    }
}

fn run_agent_cli_command(
    provider: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<AgentCliCommandResult, String> {
    let provider = provider.to_lowercase();
    validate_agent_cli_command(&provider, &args)?;

    let mut cmd = match provider.as_str() {
        "hermes" => command_for_hermes(),
        "claude" => command_for_cli("claude"),
        "codex" => command_for_cli("codex"),
        _ => return Err(format!("지원하지 않는 provider입니다: {provider}")),
    };
    if provider != "hermes" {
        inject_credential_env(&mut cmd, &provider);
    }
    if let Some(cwd) = normalize_agent_cwd(cwd)? {
        cmd.current_dir(cwd);
    }
    for arg in &args {
        cmd.arg(arg);
    }
    cmd.env("PATH", crate::augmented_cli_path())
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let child = cmd.spawn().map_err(|e| {
        format!(
            "{} 실행 실패: {} ({e})",
            provider,
            describe_cli_command(&provider)
        )
    })?;
    let (output, timed_out) = wait_with_timeout(child, Duration::from_secs(20))?;
    let stdout = clip_cli_output(String::from_utf8_lossy(&output.stdout).to_string());
    let stderr = clip_cli_output(String::from_utf8_lossy(&output.stderr).to_string());
    let success = output.status.success() && !timed_out;

    Ok(AgentCliCommandResult {
        provider,
        args,
        stdout,
        stderr,
        code: output.status.code(),
        success,
        timed_out,
    })
}

fn run_claude_plugin_command(args: &[&str], timeout: Duration) -> Result<(bool, String), String> {
    let mut cmd = command_for_cli("claude");
    for arg in args {
        cmd.arg(arg);
    }
    cmd.env("PATH", crate::augmented_cli_path())
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let child = cmd.spawn().map_err(|e| {
        format!(
            "claude plugin command spawn failed: {e} ({})",
            describe_cli_command("claude")
        )
    })?;
    let (output, timed_out) = wait_with_timeout(child, timeout)?;
    let mut text = String::new();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stdout.is_empty() {
        text.push_str(&stdout);
    }
    if !stderr.is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&stderr);
    }
    if timed_out {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str("timed out");
    }
    Ok((output.status.success() && !timed_out, clip_cli_output(text)))
}

fn academic_research_plugin_state(list_output: &str) -> (bool, bool) {
    let installed = list_output.contains("academic-research-skills");
    let enabled = installed
        && list_output
            .lines()
            .skip_while(|line| !line.contains("academic-research-skills"))
            .take(5)
            .any(|line| line.contains("Status:") && !line.contains("disabled"));
    (installed, enabled)
}

fn install_academic_research_claude_plugin_blocking(
) -> Result<AcademicResearchPluginInstallResult, String> {
    let mut log_lines = Vec::new();
    let initial_list = match run_claude_plugin_command(&["plugin", "list"], Duration::from_secs(20))
    {
        Ok((_, output)) => output,
        Err(err) => {
            return Ok(AcademicResearchPluginInstallResult {
                installed: false,
                enabled: false,
                message: format!(
                    "Claude Code CLI is not ready, so Academic Research Skills will be installed after Claude is installed. {err}"
                ),
                log: err,
            });
        }
    };

    let (initial_installed, initial_enabled) = academic_research_plugin_state(&initial_list);
    if initial_installed && initial_enabled {
        return Ok(AcademicResearchPluginInstallResult {
            installed: true,
            enabled: true,
            message: "Claude Academic Research Skills plugin is already installed and enabled."
                .to_string(),
            log: initial_list,
        });
    }

    let mut steps: Vec<(&str, Vec<&'static str>)> = Vec::new();
    if !initial_installed {
        steps.push((
            "marketplace add",
            vec![
                "plugin",
                "marketplace",
                "add",
                "Imbad0202/academic-research-skills",
            ],
        ));
        steps.push((
            "plugin install",
            vec!["plugin", "install", "academic-research-skills"],
        ));
    }
    if !initial_enabled {
        steps.push((
            "plugin enable",
            vec!["plugin", "enable", "academic-research-skills"],
        ));
    }

    for (label, args) in steps {
        match run_claude_plugin_command(&args, Duration::from_secs(90)) {
            Ok((ok, output)) => {
                let status = if ok { "ok" } else { "warn" };
                log_lines.push(format!("[{status}] {label}: {}", output.trim()));
            }
            Err(err) => log_lines.push(format!("[warn] {label}: {err}")),
        }
    }

    let (_, list_output) = run_claude_plugin_command(&["plugin", "list"], Duration::from_secs(20))?;
    let (installed, enabled) = academic_research_plugin_state(&list_output);
    log_lines.push(format!("[info] plugin list:\n{}", list_output.trim()));

    if !installed {
        return Err(format!(
            "Claude Academic Research Skills plugin was not installed.\n{}",
            log_lines.join("\n\n")
        ));
    }

    let message = if enabled {
        "Claude Academic Research Skills plugin installed and enabled.".to_string()
    } else {
        "Claude Academic Research Skills plugin installed. Enable it with `/plugin on academic-research-skills` if Claude reports it disabled.".to_string()
    };

    Ok(AcademicResearchPluginInstallResult {
        installed,
        enabled,
        message,
        log: log_lines.join("\n\n"),
    })
}

fn describe_cli_command(cli: &str) -> String {
    let executable = resolve_cli_executable(cli);
    if let Some((interpreter, args)) = script_interpreter(&executable) {
        let mut all_args = args;
        all_args.push(executable.display().to_string());
        return format!(
            "program={} args={}",
            interpreter.display(),
            all_args.join(" ")
        );
    }
    format!("program={}", executable.display())
}

fn describe_hermes_command() -> String {
    let executable = resolve_cli_executable("hermes");
    if let Some(parent) = executable.parent() {
        let activate = parent.join("activate");
        if activate.is_file() {
            return format!(
                "program=/bin/zsh args=-lc source_venv_then_exec_hermes activate={}",
                activate.display()
            );
        }
    }
    describe_cli_command("hermes")
}

fn script_interpreter(path: &PathBuf) -> Option<(PathBuf, Vec<String>)> {
    let text = std::fs::read_to_string(path).ok()?;
    let first = text.lines().next()?.trim();
    let rest = first.strip_prefix("#!")?.trim();
    if rest.is_empty() {
        return None;
    }
    let mut parts = rest
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return None;
    }
    let interpreter = PathBuf::from(parts.remove(0));
    if interpreter.ends_with("env") {
        if parts.is_empty() {
            return None;
        }
        return Some((interpreter, parts));
    }
    if interpreter.is_file() {
        return Some((interpreter, parts));
    }
    None
}

fn hermes_heredoc_marker_closed(marker: &str, line: &str) -> bool {
    let t = line.trim();
    if t == marker {
        return true;
    }
    let Some(rest) = t.strip_prefix(marker) else {
        return false;
    };
    let rest = rest.trim_start();
    rest.is_empty()
        || rest
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_digit() || c == '[')
}

fn hermes_auth_error_message(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let looks_like_auth_error = lower.contains("refresh token was already consumed")
        || lower.contains("run `hermes auth`")
        || lower.contains("run hermes auth")
        || lower.contains("hermes model` to re-authenticate")
        || lower.contains("invalid authentication credentials")
        || lower.contains("reauthenticate")
        || lower.contains("re-authenticate");
    if !looks_like_auth_error {
        return None;
    }

    let detail = text
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && (line.contains("refresh token")
                    || line.contains("Codex")
                    || line.contains("credentials")
                    || line.contains("credential")
                    || line.contains("hermes auth")
                    || line.contains("hermes model")
                    || line.contains("re-authenticate")
                    || line.contains("reauthenticate"))
        })
        .collect::<Vec<_>>()
        .join("\n");

    Some(if detail.is_empty() {
        "Hermes/Codex 인증이 만료되어 실행을 이어가지 못했습니다. 터미널에서 codex 인증을 갱신한 뒤 hermes auth 또는 hermes model 재인증이 필요합니다.".to_string()
    } else {
        format!(
            "Hermes/Codex 인증이 만료되어 실행을 이어가지 못했습니다.\n{}",
            detail
        )
    })
}

fn is_hermes_provider_diagnostic_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return false;
    }

    let lower = t.to_ascii_lowercase();
    lower.contains("no response from provider")
        || lower.contains("api call failed")
        || lower.contains("timeout")
            && (lower.contains("non-streaming")
                || lower.contains("provider")
                || lower.contains("endpoint")
                || lower.contains("threshold"))
        || lower.contains("aborting call")
        || lower.contains("retrying in")
        || lower.starts_with("provider:")
        || lower.starts_with("endpoint:")
        || lower.starts_with("error: non-streaming api call timed out")
        || lower.starts_with("elapsed:")
        || lower.starts_with("model:")
        || lower.starts_with("context:")
        || (t.starts_with('⚠')
            && (lower.contains("provider")
                || lower.contains("api call")
                || lower.contains("timeout")
                || lower.contains("aborting")))
        || ((t.starts_with('🔌')
            || t.starts_with('🌐')
            || t.starts_with('📝')
            || t.starts_with('⏱')
            || t.starts_with('⏳'))
            && (lower.contains("provider:")
                || lower.contains("endpoint:")
                || lower.contains("error:")
                || lower.contains("elapsed:")
                || lower.contains("retrying")))
}

struct AgentPowerAssertion {
    caffeinate: Option<Child>,
}

impl AgentPowerAssertion {
    fn hold_for_child(_label: &str, child_pid: u32) -> Self {
        #[cfg(target_os = "macos")]
        {
            let caffeinate = Command::new("/usr/bin/caffeinate")
                // Keep CPU/disk/system awake while the agent child is alive.
                // Do not use -d so the display can still turn off or lock normally.
                .arg("-ims")
                .arg("-w")
                .arg(child_pid.to_string())
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .ok();
            Self { caffeinate }
        }

        #[cfg(not(target_os = "macos"))]
        {
            Self { caffeinate: None }
        }
    }
}

impl Drop for AgentPowerAssertion {
    fn drop(&mut self) {
        if let Some(child) = self.caffeinate.as_mut() {
            if matches!(child.try_wait(), Ok(None)) {
                let _ = child.kill();
            }
            let _ = child.wait();
        }
    }
}

fn agent_children() -> &'static Mutex<HashMap<String, u32>> {
    static CHILDREN: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();
    CHILDREN.get_or_init(|| Mutex::new(HashMap::new()))
}

struct AgentChildRegistration {
    turn_id: String,
}

impl AgentChildRegistration {
    fn new(turn_id: &str, pid: u32) -> Self {
        if let Ok(mut children) = agent_children().lock() {
            children.insert(turn_id.to_string(), pid);
        }
        Self {
            turn_id: turn_id.to_string(),
        }
    }
}

impl Drop for AgentChildRegistration {
    fn drop(&mut self) {
        if let Ok(mut children) = agent_children().lock() {
            children.remove(&self.turn_id);
        }
    }
}

fn terminate_agent_pid(pid: u32) -> bool {
    #[cfg(unix)]
    {
        unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) == 0 }
    }

    #[cfg(windows)]
    {
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        false
    }
}

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

#[derive(Serialize)]
pub struct AgentCliCommandResult {
    provider: String,
    args: Vec<String>,
    stdout: String,
    stderr: String,
    code: Option<i32>,
    success: bool,
    timed_out: bool,
}

#[derive(Serialize)]
pub struct AcademicResearchPluginInstallResult {
    installed: bool,
    enabled: bool,
    message: String,
    log: String,
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
    scope: String,
    files: Vec<AgentChangedFile>,
    additions: u64,
    deletions: u64,
    patch: String,
}

#[derive(Serialize, Clone)]
pub struct AgentChangeBaseline {
    id: String,
    cwd: String,
    is_git: bool,
}

#[derive(Clone)]
struct BaselineFileState {
    exists: bool,
    bytes: Option<Vec<u8>>,
    hash: u64,
    binary: bool,
}

#[derive(Clone)]
struct ChangeBaselineSnapshot {
    root: String,
    files: BTreeMap<String, BaselineFileState>,
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

static CHANGE_BASELINES: OnceLock<Mutex<HashMap<String, ChangeBaselineSnapshot>>> = OnceLock::new();

fn change_baselines() -> &'static Mutex<HashMap<String, ChangeBaselineSnapshot>> {
    CHANGE_BASELINES.get_or_init(|| Mutex::new(HashMap::new()))
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

fn infer_preview_command(cwd: &str, url: &str) -> Result<String, String> {
    let port = preview_service_port(url)?;
    let package_json = PathBuf::from(cwd).join("package.json");
    if !package_json.exists() {
        return Err(
            "No package.json found in the working folder. Enter a preview start command.".into(),
        );
    }
    let text =
        std::fs::read_to_string(&package_json).map_err(|e| format!("read package.json: {e}"))?;
    let value: Value =
        serde_json::from_str(&text).map_err(|e| format!("parse package.json: {e}"))?;
    let scripts = value.get("scripts").and_then(Value::as_object);
    let script = if scripts
        .and_then(|s| s.get("dev"))
        .and_then(Value::as_str)
        .is_some()
    {
        "dev"
    } else if scripts
        .and_then(|s| s.get("start"))
        .and_then(Value::as_str)
        .is_some()
    {
        "start"
    } else if scripts
        .and_then(|s| s.get("preview"))
        .and_then(Value::as_str)
        .is_some()
    {
        "preview"
    } else {
        return Err("package.json has no dev, start, or preview script.".into());
    };
    Ok(format!(
        "npm run {script} -- --host 127.0.0.1 --port {port}"
    ))
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
    let path = line
        .get(3..)?
        .rsplit(" -> ")
        .next()?
        .trim_matches('"')
        .to_string();
    Some((status, path))
}

fn count_text_lines(root: &str, path: &str) -> u64 {
    let path = std::path::Path::new(root).join(path);
    let Ok(meta) = std::fs::metadata(&path) else {
        return 0;
    };
    if !meta.is_file() || meta.len() > 512 * 1024 {
        return 0;
    }
    let Ok(text) = std::fs::read_to_string(path) else {
        return 0;
    };
    text.lines().count() as u64
}

fn hash_bytes(bytes: &[u8]) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}

fn is_probably_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8192).any(|b| *b == 0)
}

fn capture_file_state(root: &str, path: &str) -> BaselineFileState {
    const MAX_BASELINE_BYTES: u64 = 2 * 1024 * 1024;
    let full_path = std::path::Path::new(root).join(path);
    let Ok(meta) = std::fs::metadata(&full_path) else {
        return BaselineFileState {
            exists: false,
            bytes: None,
            hash: 0,
            binary: false,
        };
    };
    if !meta.is_file() || meta.len() > MAX_BASELINE_BYTES {
        let marker = format!(
            "{}:{}",
            meta.len(),
            meta.modified()
                .ok()
                .and_then(|m| { m.duration_since(UNIX_EPOCH).ok().map(|d| d.as_nanos()) })
                .unwrap_or_default()
        );
        return BaselineFileState {
            exists: true,
            bytes: None,
            hash: hash_bytes(marker.as_bytes()),
            binary: true,
        };
    }
    let bytes = std::fs::read(&full_path).unwrap_or_default();
    let binary = is_probably_binary(&bytes);
    let hash = hash_bytes(&bytes);
    BaselineFileState {
        exists: true,
        bytes: Some(bytes),
        hash,
        binary,
    }
}

fn file_state_equal(a: &BaselineFileState, b: &BaselineFileState) -> bool {
    a.exists == b.exists && a.hash == b.hash
}

fn status_map(root: &str) -> Result<BTreeMap<String, String>, String> {
    let status = run_git(root, &["status", "--porcelain=v1", "--untracked-files=all"])?;
    let mut files = BTreeMap::new();
    for line in status.lines().filter(|line| !line.trim().is_empty()) {
        let Some((raw_status, path)) = status_path(line) else {
            continue;
        };
        files.insert(path, raw_status);
    }
    Ok(files)
}

fn capture_change_baseline(cwd: Option<String>) -> Result<AgentChangeBaseline, String> {
    const MAX_BASELINE_DIRTY_FILES: usize = 200;
    let root = match git_root(cwd) {
        Ok(root) => root,
        Err(_) => {
            return Ok(AgentChangeBaseline {
                id: String::new(),
                cwd: ".".to_string(),
                is_git: false,
            });
        }
    };
    let current_status = status_map(&root)?;
    if current_status.len() > MAX_BASELINE_DIRTY_FILES {
        return Ok(AgentChangeBaseline {
            id: String::new(),
            cwd: root,
            is_git: true,
        });
    }
    let mut files = BTreeMap::new();
    for path in current_status.keys() {
        files.insert(path.clone(), capture_file_state(&root, path));
    }
    let id = format!(
        "baseline-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let mut baselines = change_baselines()
        .lock()
        .map_err(|e| format!("change baseline lock: {e}"))?;
    baselines.insert(
        id.clone(),
        ChangeBaselineSnapshot {
            root: root.clone(),
            files,
        },
    );
    while baselines.len() > 64 {
        if let Some(first) = baselines.keys().next().cloned() {
            baselines.remove(&first);
        } else {
            break;
        }
    }
    Ok(AgentChangeBaseline {
        id,
        cwd: root,
        is_git: true,
    })
}

fn clip_diff(diff: String) -> String {
    const MAX_DIFF_CHARS: usize = 14000;
    if diff.chars().count() <= MAX_DIFF_CHARS {
        return diff;
    }
    let clipped = diff.chars().take(MAX_DIFF_CHARS).collect::<String>();
    format!("{clipped}\n... diff truncated ...")
}

fn run_unified_diff(
    label_old: &str,
    old: &[u8],
    label_new: &str,
    new: &[u8],
) -> (u64, u64, String) {
    if is_probably_binary(old) || is_probably_binary(new) {
        return (0, 0, "Binary file changed".to_string());
    }
    let temp_dir = std::env::temp_dir().join(format!(
        "atelier-diff-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    if std::fs::create_dir_all(&temp_dir).is_err() {
        return line_delta_summary(old, new);
    }
    let old_path = temp_dir.join("old");
    let new_path = temp_dir.join("new");
    let wrote = std::fs::write(&old_path, old).is_ok() && std::fs::write(&new_path, new).is_ok();
    let output = if wrote {
        Command::new("diff")
            .arg("-u")
            .arg("-L")
            .arg(label_old)
            .arg("-L")
            .arg(label_new)
            .arg(&old_path)
            .arg(&new_path)
            .output()
            .ok()
    } else {
        None
    };
    let _ = std::fs::remove_dir_all(&temp_dir);
    let Some(output) = output else {
        return line_delta_summary(old, new);
    };
    if !matches!(output.status.code(), Some(0) | Some(1)) {
        return line_delta_summary(old, new);
    }
    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    let mut additions = 0;
    let mut deletions = 0;
    for line in diff.lines() {
        if line.starts_with("+++") || line.starts_with("---") {
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
        } else if line.starts_with('-') {
            deletions += 1;
        }
    }
    (additions, deletions, clip_diff(diff))
}

fn line_delta_summary(old: &[u8], new: &[u8]) -> (u64, u64, String) {
    let old_text = String::from_utf8_lossy(old);
    let new_text = String::from_utf8_lossy(new);
    let old_lines = old_text.lines().count() as i64;
    let new_lines = new_text.lines().count() as i64;
    let additions = (new_lines - old_lines).max(0) as u64;
    let deletions = (old_lines - new_lines).max(0) as u64;
    (
        additions,
        deletions,
        "Diff omitted; file changed after the run baseline.".to_string(),
    )
}

fn changed_file_from_head(root: &str, path: String, raw_status: String) -> AgentChangedFile {
    let status = status_label(raw_status.trim());
    let mut file = AgentChangedFile {
        path: path.clone(),
        status: status.clone(),
        additions: 0,
        deletions: 0,
        binary: false,
        diff: String::new(),
    };
    if status == "untracked" {
        file.additions = count_text_lines(root, &path);
        return file;
    }
    let numstat = run_git(root, &["diff", "--numstat", "HEAD", "--", &path]).unwrap_or_default();
    for line in numstat.lines() {
        let mut parts = line.splitn(3, '\t');
        let add_raw = parts.next().unwrap_or_default();
        let del_raw = parts.next().unwrap_or_default();
        let binary = add_raw == "-" || del_raw == "-";
        file.additions = file
            .additions
            .saturating_add(add_raw.parse::<u64>().unwrap_or(0));
        file.deletions = file
            .deletions
            .saturating_add(del_raw.parse::<u64>().unwrap_or(0));
        file.binary = file.binary || binary;
    }
    file.diff = clip_diff(
        run_git(root, &["diff", "--color=never", "HEAD", "--", &path]).unwrap_or_default(),
    );
    file
}

fn build_change_summary_since_baseline(
    cwd: Option<String>,
    baseline: ChangeBaselineSnapshot,
) -> Result<AgentChangeSummary, String> {
    let root = match git_root(cwd) {
        Ok(root) => root,
        Err(_) => {
            return Ok(AgentChangeSummary {
                cwd: ".".to_string(),
                is_git: false,
                scope: "workspace".to_string(),
                files: Vec::new(),
                additions: 0,
                deletions: 0,
                patch: String::new(),
            });
        }
    };
    if root != baseline.root {
        return build_change_summary(Some(root));
    }

    let current_status = status_map(&root)?;
    let mut paths = current_status.keys().cloned().collect::<BTreeSet<_>>();
    for path in baseline.files.keys() {
        paths.insert(path.clone());
    }

    let mut files = Vec::new();
    let mut patch_parts = Vec::new();
    for path in paths {
        let current_state = capture_file_state(&root, &path);
        if let Some(base_state) = baseline.files.get(&path) {
            if file_state_equal(base_state, &current_state) {
                continue;
            }
            let status = if !current_state.exists {
                "deleted"
            } else if !base_state.exists {
                "added"
            } else {
                "modified"
            };
            let binary = base_state.binary || current_state.binary;
            let (additions, deletions, diff) =
                match (&base_state.bytes, &current_state.bytes, binary) {
                    (Some(old), Some(new), false) => {
                        run_unified_diff(&format!("a/{path}"), old, &format!("b/{path}"), new)
                    }
                    (Some(old), None, false) => {
                        run_unified_diff(&format!("a/{path}"), old, &format!("b/{path}"), b"")
                    }
                    (None, Some(new), false) => {
                        run_unified_diff(&format!("a/{path}"), b"", &format!("b/{path}"), new)
                    }
                    _ => (
                        0,
                        0,
                        "Binary or large file changed after the run baseline.".to_string(),
                    ),
                };
            if !binary && !diff.trim().is_empty() && !diff.contains("Binary file changed") {
                patch_parts.push(diff.clone());
            }
            files.push(AgentChangedFile {
                path: path.clone(),
                status: status.to_string(),
                additions,
                deletions,
                binary,
                diff,
            });
        } else if let Some(raw_status) = current_status.get(&path) {
            let file = changed_file_from_head(&root, path.clone(), raw_status.clone());
            if !file.diff.trim().is_empty() {
                patch_parts.push(file.diff.clone());
            }
            files.push(file);
        }
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));
    let additions = files.iter().map(|f| f.additions).sum();
    let deletions = files.iter().map(|f| f.deletions).sum();
    Ok(AgentChangeSummary {
        cwd: root,
        is_git: true,
        scope: "run".to_string(),
        files,
        additions,
        deletions,
        patch: patch_parts.join("\n"),
    })
}

fn build_change_summary(cwd: Option<String>) -> Result<AgentChangeSummary, String> {
    let root = match git_root(cwd) {
        Ok(root) => root,
        Err(_) => {
            return Ok(AgentChangeSummary {
                cwd: ".".to_string(),
                is_git: false,
                scope: "workspace".to_string(),
                files: Vec::new(),
                additions: 0,
                deletions: 0,
                patch: String::new(),
            });
        }
    };

    let status = run_git(
        &root,
        &["status", "--porcelain=v1", "--untracked-files=all"],
    )?;
    let mut files: BTreeMap<String, AgentChangedFile> = BTreeMap::new();
    for line in status.lines().filter(|line| !line.trim().is_empty()) {
        let Some((raw_status, path)) = status_path(line) else {
            continue;
        };
        files
            .entry(path.clone())
            .or_insert_with(|| AgentChangedFile {
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
        let entry = files
            .entry(path.to_string())
            .or_insert_with(|| AgentChangedFile {
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
            run_git(&root, &["diff", "--color=never", "HEAD", "--", &file.path])
                .unwrap_or_default(),
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
        scope: "workspace".to_string(),
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
        "opus"
        | "best"
        | "opusplan"
        | "opus[1m]"
        | "claude-opus-4-1"
        | "claude-opus-4-1-20250805"
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

fn normalize_agent_permission_mode(permission_mode: Option<String>) -> String {
    match permission_mode
        .as_deref()
        .map(str::trim)
        .map(str::to_ascii_lowercase)
        .as_deref()
        .unwrap_or("full")
    {
        "basic" | "default" => "basic".to_string(),
        "auto" | "autoreview" | "auto-review" => "auto".to_string(),
        "full" | "bypass" | "danger" => "full".to_string(),
        _ => "full".to_string(),
    }
}

fn claude_permission_mode(permission_mode: &str) -> &'static str {
    match permission_mode {
        "basic" => "default",
        "auto" => "auto",
        "full" => "bypassPermissions",
        _ => "bypassPermissions",
    }
}

fn push_codex_permission_args(cmd: &mut Command, permission_mode: &str, can_set_sandbox: bool) {
    match permission_mode {
        "basic" if can_set_sandbox => {
            cmd.arg("--sandbox").arg("workspace-write");
        }
        "auto" => {
            cmd.arg("--full-auto");
        }
        "full" => {
            cmd.arg("--dangerously-bypass-approvals-and-sandbox");
        }
        _ => {}
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
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
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
        emit_agent_event(
            app,
            turn_id,
            AgentStreamEvent {
                kind: "raw".into(),
                text: None,
                status: None,
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: None,
            },
        );
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
            emit_agent_event(
                app,
                turn_id,
                AgentStreamEvent {
                    kind: "status".into(),
                    text: None,
                    status: Some(status),
                    raw: Some(line.to_string()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
        }
        "stream_event" => {
            let event = v.get("event").unwrap_or(&Value::Null);
            let event_type = event
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if event_type == "content_block_delta" {
                if let Some(text) = event
                    .get("delta")
                    .and_then(|d| d.get("text"))
                    .and_then(Value::as_str)
                {
                    emit_agent_event(
                        app,
                        turn_id,
                        AgentStreamEvent {
                            kind: "delta".into(),
                            text: Some(text.to_string()),
                            status: None,
                            raw: Some(line.to_string()),
                            provider_session_id: provider_session_id.clone(),
                            is_error: None,
                        },
                    );
                }
            } else if event_type == "content_block_start" {
                if let Some(block_type) = event
                    .get("content_block")
                    .and_then(|b| b.get("type"))
                    .and_then(Value::as_str)
                {
                    if block_type != "text" {
                        emit_agent_event(
                            app,
                            turn_id,
                            AgentStreamEvent {
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
                            },
                        );
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
            emit_agent_event(
                app,
                turn_id,
                AgentStreamEvent {
                    kind: "result".into(),
                    text: Some(final_text.clone()),
                    status: v
                        .get("stop_reason")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    raw: Some(line.to_string()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: Some(*is_error),
                },
            );
        }
        "error" => {
            *is_error = true;
            let msg = v
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Claude stream error")
                .to_string();
            *error = Some(msg.clone());
            emit_agent_event(
                app,
                turn_id,
                AgentStreamEvent {
                    kind: "error".into(),
                    text: Some(msg),
                    status: Some("error".into()),
                    raw: Some(line.to_string()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: Some(true),
                },
            );
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
    permission_mode: Option<String>,
) -> Result<AgentRunResult, String> {
    let model = normalize_claude_model(model);
    let permission_mode = normalize_agent_permission_mode(permission_mode);
    let mut cmd = command_for_cli("claude");
    inject_credential_env(&mut cmd, "claude");
    cmd.arg("-p")
        .arg("--verbose")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--include-partial-messages")
        .arg("--model")
        .arg(model)
        .arg("--permission-mode")
        .arg(claude_permission_mode(&permission_mode))
        .env("PATH", crate::augmented_cli_path())
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(session_id) = resume_session_id.filter(|s| !s.trim().is_empty()) {
        cmd.arg("--resume").arg(session_id);
    }
    if let Some(cwd) = normalize_agent_cwd(cwd)? {
        cmd.current_dir(cwd);
    }

    emit_agent_event(
        &app,
        &turn_id,
        AgentStreamEvent {
            kind: "status".into(),
            text: None,
            status: Some("starting".into()),
            raw: None,
            provider_session_id: None,
            is_error: None,
        },
    );

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("claude spawn: {e} ({})", describe_cli_command("claude")))?;
    let _child_registration = AgentChildRegistration::new(&turn_id, child.id());
    let _power_assertion = AgentPowerAssertion::hold_for_child("claude", child.id());
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

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "claude stdout missing".to_string())?;
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
        emit_agent_event(
            &app,
            &turn_id,
            AgentStreamEvent {
                kind: "error".into(),
                text: error.clone(),
                status: Some("exit".into()),
                raw: None,
                provider_session_id: provider_session_id.clone(),
                is_error: Some(true),
            },
        );
    }

    Ok(AgentRunResult {
        text: final_text,
        provider_session_id,
        raw_events: tail_return_raw_events(&raw_events),
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
        emit_agent_event(
            app,
            turn_id,
            AgentStreamEvent {
                kind: "raw".into(),
                text: None,
                status: None,
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: None,
            },
        );
        return;
    };

    match v.get("type").and_then(Value::as_str).unwrap_or_default() {
        "thread.started" => {
            if let Some(id) = v.get("thread_id").and_then(Value::as_str) {
                *provider_session_id = Some(id.to_string());
            }
            emit_agent_event(
                app,
                turn_id,
                AgentStreamEvent {
                    kind: "status".into(),
                    text: None,
                    status: Some("thread.started".into()),
                    raw: Some(line.to_string()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
        }
        "turn.started" => {
            emit_agent_event(
                app,
                turn_id,
                AgentStreamEvent {
                    kind: "status".into(),
                    text: None,
                    status: Some("turn.started".into()),
                    raw: Some(line.to_string()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
        }
        "item.completed" => {
            let item = v.get("item").unwrap_or(&Value::Null);
            let item_type = item.get("type").and_then(Value::as_str).unwrap_or_default();
            if item_type == "agent_message" {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    *final_text = text.to_string();
                    emit_agent_event(
                        app,
                        turn_id,
                        AgentStreamEvent {
                            kind: "result".into(),
                            text: Some(text.to_string()),
                            status: Some("agent_message".into()),
                            raw: Some(line.to_string()),
                            provider_session_id: provider_session_id.clone(),
                            is_error: Some(false),
                        },
                    );
                }
            } else {
                emit_agent_event(
                    app,
                    turn_id,
                    AgentStreamEvent {
                        kind: "tool".into(),
                        text: Some(item_type.to_string()),
                        status: Some("item.completed".into()),
                        raw: Some(line.to_string()),
                        provider_session_id: provider_session_id.clone(),
                        is_error: None,
                    },
                );
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
            emit_agent_event(
                app,
                turn_id,
                AgentStreamEvent {
                    kind: "error".into(),
                    text: Some(msg),
                    status: Some("error".into()),
                    raw: Some(line.to_string()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: Some(true),
                },
            );
        }
        "turn.completed" => {
            emit_agent_event(
                app,
                turn_id,
                AgentStreamEvent {
                    kind: "status".into(),
                    text: None,
                    status: Some("turn.completed".into()),
                    raw: Some(line.to_string()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: Some(false),
                },
            );
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
    permission_mode: Option<String>,
) -> Result<AgentRunResult, String> {
    let permission_mode = normalize_agent_permission_mode(permission_mode);
    let mut cmd = command_for_cli("codex");
    inject_credential_env(&mut cmd, "codex");
    cmd.arg("exec");
    if let Some(cwd) = normalize_agent_cwd(cwd)? {
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
        cmd.arg("resume");
        push_codex_permission_args(&mut cmd, &permission_mode, false);
        cmd.arg("--json")
            .arg("--skip-git-repo-check")
            .arg(session_id)
            .arg(prompt);
    } else {
        push_codex_permission_args(&mut cmd, &permission_mode, true);
        cmd.arg("--json").arg("--skip-git-repo-check").arg(prompt);
    }

    emit_agent_event(
        &app,
        &turn_id,
        AgentStreamEvent {
            kind: "status".into(),
            text: None,
            status: Some("codex.starting".into()),
            raw: None,
            provider_session_id: None,
            is_error: None,
        },
    );

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("codex spawn: {e} ({})", describe_cli_command("codex")))?;
    let _child_registration = AgentChildRegistration::new(&turn_id, child.id());
    let _power_assertion = AgentPowerAssertion::hold_for_child("codex", child.id());
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

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "codex stdout missing".to_string())?;
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
    let stderr_text = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();
    if !status.success() {
        is_error = true;
        if error.is_none() {
            error = Some(if stderr_text.trim().is_empty() {
                format!("codex exited with {}", status.code().unwrap_or(-1))
            } else {
                stderr_text.trim().to_string()
            });
        }
        emit_agent_event(
            &app,
            &turn_id,
            AgentStreamEvent {
                kind: "error".into(),
                text: error.clone(),
                status: Some("exit".into()),
                raw: None,
                provider_session_id: provider_session_id.clone(),
                is_error: Some(true),
            },
        );
    }

    Ok(AgentRunResult {
        text: final_text,
        provider_session_id,
        raw_events: tail_return_raw_events(&raw_events),
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
    permission_mode: Option<String>,
) -> Result<AgentRunResult, String> {
    let hermes_provider = normalize_hermes_provider(hermes_provider);
    let permission_mode = normalize_agent_permission_mode(permission_mode);
    let mut cmd = command_for_hermes();
    // Hermes 의 sub-provider 별로 그에 맞는 사용자 키를 주입.
    let hermes_credential_provider = match hermes_provider.as_str() {
        "anthropic" => "claude",
        "openai-codex" => "codex",
        "openrouter" => "openrouter",
        _ => "openrouter",
    };
    if hermes_provider == "openai-codex" {
        let _ = sync_codex_auth_to_hermes();
    }
    inject_credential_env(&mut cmd, hermes_credential_provider);
    // -Q (quiet) 는 banner·spinner·도구 프리뷰를 차단해 stdout 무음이 됨 → 진행 표시 불가.
    // 진행 흐름 노출을 위해 quiet 끄고, 대신 --source tool 로 세션 리스트 노출만 차단.
    cmd.arg("chat")
        .arg("--source")
        .arg("tool")
        .arg("--max-turns")
        .arg("90")
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
    match permission_mode.as_str() {
        "auto" => {
            cmd.arg("--checkpoints");
        }
        "full" => {
            cmd.arg("--yolo");
        }
        _ => {}
    }
    if let Some(session_id) = resume_session_id.filter(|s| !s.trim().is_empty()) {
        cmd.arg("--resume").arg(session_id);
    }
    if let Some(cwd) = normalize_agent_cwd(cwd)? {
        cmd.current_dir(cwd);
    }

    emit_agent_event(
        &app,
        &turn_id,
        AgentStreamEvent {
            kind: "status".into(),
            text: None,
            status: Some("hermes.starting".into()),
            raw: None,
            provider_session_id: None,
            is_error: None,
        },
    );

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("hermes spawn: {e} ({})", describe_hermes_command()))?;
    let _child_registration = AgentChildRegistration::new(&turn_id, child.id());
    let _power_assertion = AgentPowerAssertion::hold_for_child("hermes", child.id());
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

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "hermes stdout missing".to_string())?;
    let reader = BufReader::new(stdout);
    let (stdout_tx, stdout_rx) = mpsc::channel::<Result<String, String>>();
    thread::spawn(move || {
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    if stdout_tx.send(Ok(line)).is_err() {
                        break;
                    }
                }
                Err(e) => {
                    let _ = stdout_tx.send(Err(format!("hermes stdout: {e}")));
                    break;
                }
            }
        }
    });
    let mut raw_events: Vec<String> = Vec::new();
    let mut final_text = String::new();
    let mut provider_session_id: Option<String> = None;
    let mut saw_completion_hint = false;
    let mut finalized_after_idle = false;
    let mut idle_timeout_status: Option<&'static str> = None;
    let mut observed_status: Option<std::process::ExitStatus> = None;
    let mut last_output_at = Instant::now();
    let mut tool_block_end: Option<String> = None;
    let mut diff_block_active = false;
    let mut replacement_block_active = false;

    // hermes stdout 라인을 codex 패턴으로 분류 emit (status / tool / delta).
    // 저장 전 raw 분류 = 본문 시작(첫 ━/─ 박스 구분선 또는 첫 메타 종료) 전까지의 모든 라인은
    // 본문에 누적하지 않는다. 본문 시작 이후엔 박스 라인/⚕ 라벨/trailing 메타도 status로 분류.
    let mut content_started = false;
    let is_box_line = |s: &str| -> bool {
        let t = s.trim();
        !t.is_empty()
            && (t.starts_with('━') || t.starts_with('─') || t.starts_with('═'))
            && t.chars()
                .filter(|c| !c.is_whitespace())
                .all(|c| matches!(c, '━' | '─' | '═' | '—' | '-'))
    };
    let contains_box_run = |s: &str| -> bool {
        // 한 라인 안에 8자 이상 연속 ━/─/═ → 박스 헤더 (예: "─  ⚕ Hermes  ─────...")
        let mut run = 0usize;
        for c in s.chars() {
            if matches!(c, '━' | '─' | '═') {
                run += 1;
                if run >= 8 {
                    return true;
                }
            } else {
                run = 0;
            }
        }
        false
    };
    let is_provider_label = |s: &str| -> bool {
        let t = s.trim();
        // "─  ⚕ Hermes  ───..." 또는 "⋮ Hermes" 같은 박스 헤더
        (t.contains("⚕")
            || t.contains("⋮")
            || t.contains("◆")
            || t.contains("◇")
            || t.contains("•")
            || t.contains("·"))
            && (t.contains("Hermes")
                || t.contains("Claude")
                || t.contains("Codex")
                || t.contains("GPT"))
    };
    let is_trailing_meta = |s: &str| -> bool {
        let t = s.trim();
        if t.is_empty() {
            return false;
        }
        t.starts_with("Resume this session with:")
            || t.starts_with("Resume with:")
            || t.starts_with("Session:")
            || t.starts_with("Duration:")
            || t.starts_with("Messages:")
            || t.starts_with("Tokens:")
            || t.starts_with("Title:")
            || t.starts_with("Continuing session")
            // "  hermes --resume ..." 들여쓰기된 명령 라인
            || s.trim_start().starts_with("hermes --")
            || s.trim_start().starts_with("hermes --resume")
            || s.trim_start().starts_with("hermes --tui")
    };
    let heredoc_end_marker = |s: &str| -> Option<String> {
        let rest = s.split_once("<<")?.1.trim_start();
        if rest.is_empty() {
            return None;
        }
        if let Some(stripped) = rest.strip_prefix('\'') {
            return stripped
                .split_once('\'')
                .map(|(marker, _)| marker.trim().to_string())
                .filter(|marker| !marker.is_empty());
        }
        if let Some(stripped) = rest.strip_prefix('"') {
            return stripped
                .split_once('"')
                .map(|(marker, _)| marker.trim().to_string())
                .filter(|marker| !marker.is_empty());
        }
        let marker = rest
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
            .collect::<String>();
        if marker.is_empty() {
            None
        } else {
            Some(marker)
        }
    };
    let is_activity_summary = |s: &str| -> bool {
        let t = s.trim();
        if t.is_empty() {
            return false;
        }
        if t.starts_with("⚠ Compression summary failed")
            || t.starts_with("⚠️ Compression summary failed")
            || t.contains("Inserted a fallback context marker")
            || t.starts_with("⟳ compacting context")
            || t.starts_with("⚠ Session compressed")
            || t.starts_with("⚠️ Session compressed")
            || t.starts_with("┊ review diff")
            || t.contains("(tip) That tool ran")
            || t.contains("Use /verbose to cycle tool-progress display modes")
            || t.starts_with("📝 코드 변경")
            || t.contains("omitted ") && t.contains(" diff line")
        {
            return true;
        }
        let has_activity_icon = t.contains('📚')
            || t.contains('🐍')
            || t.contains('💻')
            || t.contains('📖')
            || t.contains('🔎')
            || t.contains('📋')
            || t.contains('🧠')
            || t.contains('🔧')
            || t.contains('⚙')
            || t.contains('▶')
            || t.contains('✍')
            || t.contains('🌐')
            || t.contains('📸')
            || t.contains('⚡');
        (t.starts_with('┊') && has_activity_icon)
            || (has_activity_icon
                && (t.contains(" skill ")
                    || t.contains(" exec ")
                    || t.contains(" read ")
                    || t.contains(" write ")
                    || t.contains(" grep ")
                    || t.contains(" plan ")
                    || t.contains(" memory ")
                    || t.contains(" review diff")
                    || t.contains(" navigate ")
                    || t.contains(" snapshot ")
                    || t.contains(" browser")
                    || t.contains(" $ ")))
    };
    let has_elapsed_seconds_tail = |s: &str| -> bool {
        let mut t = s.trim();
        if let Some(stripped) = t.strip_suffix("[error]") {
            t = stripped.trim_end();
        }
        let Some(last) = t.split_whitespace().last() else {
            return false;
        };
        let Some(number) = last.strip_suffix('s') else {
            return false;
        };
        !number.is_empty() && number.parse::<f64>().is_ok()
    };
    let is_command_dump = |s: &str| -> bool {
        let t = s.trim();
        if t.is_empty() {
            return false;
        }
        if t.starts_with("from pathlib import Path")
            || t.contains("proc wait proc_")
            || t.contains("proc log proc_")
            || t.contains("proc poll proc_")
            || t.starts_with("repls={")
            || t.starts_with("repls = {")
            || t.contains("repls.items()")
            || t.contains("p.write_text(")
            || t.contains("text=text.replace(")
            || t.contains("text = text.replace(")
            || ((t.starts_with('\'') || t.starts_with('"'))
                && (t.contains(".tsx':")
                    || t.contains(".ts':")
                    || t.contains(".jsx':")
                    || t.contains(".js':")
                    || t.contains(".py':")
                    || t.contains(".css':")
                    || t.contains(".json':")
                    || t.contains(".tsx\":")
                    || t.contains(".ts\":")
                    || t.contains(".jsx\":")
                    || t.contains(".js\":")
                    || t.contains(".py\":")
                    || t.contains(".css\":")
                    || t.contains(".json\":")))
            || t.starts_with("write /tmp/")
            || t.starts_with("write /var/")
            || t.starts_with("write /Users/")
            || t.starts_with("edit /tmp/")
            || t.starts_with("edit /var/")
            || t.starts_with("edit /Users/")
            || t.starts_with("navigate 127.0.0.1")
            || t.starts_with("navigate localhost")
            || t.starts_with("navigate http://127.0.0.1")
            || t.starts_with("navigate http://localhost")
            || t.contains(" snapshot full ")
            || t.contains(" browser_c ")
            || t.contains(" browser-")
            || ((t.contains("write ")
                || t.contains("navigate ")
                || t.contains("snapshot ")
                || t.contains("browser_")
                || t.contains("browser-"))
                && has_elapsed_seconds_tail(t))
            || t.starts_with("for port in [")
            || t.contains("socket.socket()")
            || t.contains(".settimeout(")
            || (t.contains(".connect((") && t.contains("127.0.0.1") && t.contains("port"))
            || t.starts_with("finally: s.close()")
            || (t.starts_with("for url in http") && t.contains(" do"))
            || (t.starts_with("if lsof ") && t.contains("tcp:"))
            || t.contains("lsof -ti tcp:")
            || t.contains("kill $(lsof")
            || (t.contains("/dev/null") && (t.contains("lsof") || t.contains("kill")))
            || t.starts_with("code=$(curl")
            || t.starts_with("bytes=$(wc -c")
            || t.contains("curl -k")
            || (t.contains("curl ") && t.contains("--max-time"))
            || t.contains("/tmp/kn_check")
            || t.contains("/tmp/check")
            || (t.contains("wc -c") && t.contains("tr -d"))
            || (t.contains("echo ")
                && t.contains("$url")
                && t.contains("$code")
                && t.contains("$bytes"))
            || t.starts_with("p=Path(")
            || t.starts_with("path=Path(")
            || t.starts_with("env_path=Path(")
            || t.starts_with("vals={")
            || t.starts_with("if not line or line.strip()")
            || t.starts_with("k,v=")
            || t.starts_with("k, v=")
            || t.starts_with("for k in")
            || t.starts_with("v=vals.get(")
            || t.starts_with("if v is None or v==")
            || t.starts_with("elif k.endswith(")
            || t.starts_with("else: status=")
            || t == "PY"
            || t.contains("KANSICRICH_MODE")
            || t.contains("DASHBOARD_API_TOKEN")
            || t.contains("BINANCE_API_KEY")
            || t.contains("TELEGRAM_BOT_TOKEN")
            || t.contains("RUNNER_PORT")
            || t.contains("docker compose ps")
            || (t.starts_with("import os") && t.contains("roots=["))
            || (t.contains("import os") && t.contains("roots=["))
            || ((t.contains("files=[") || t.contains("roots=["))
                && (t.contains("rglob(") || t.contains("splitlines(") || t.contains("read_text(")))
            || (t.contains("def ") && t.contains("subprocess"))
            || t.contains("files=[p for p in")
            || (t.contains("for d in [") && t.contains("files="))
            || t.contains("lines=sum")
            || t.contains("len(files)")
            || t.contains("p.read_text(")
            || t.contains("list(root/d).rglob")
            || t.starts_with("files if")
            || t.starts_with("any(")
            || t.starts_with("in [")
            || t.starts_with("print(f")
            || t.starts_with("for p in files")
            || t.contains("hermes kanban --board")
            || t.contains("NEW_HYGIENE=")
            || t.contains("NEW_DASH=")
            || t.contains("--idempotency-key")
        {
            return true;
        }
        let looks_like_code = t.starts_with("from ")
            || t.starts_with("import ")
            || t.starts_with("root=")
            || t.starts_with("files=")
            || t.starts_with("cmd=")
            || t.starts_with("out=")
            || t.starts_with("try:")
            || t.starts_with("except ")
            || t.starts_with("for ")
            || t.starts_with("if ")
            || t.starts_with("print(")
            || t.starts_with("PY ")
            || (t.contains(" for ") && t.contains(" in ") && t.contains("print("));
        let has_tool_context = t.contains("/Users/")
            || t.contains("subprocess")
            || t.contains("Path(")
            || t.contains("Path ")
            || t.contains("rglob(")
            || t.contains("splitlines(")
            || t.contains(".read_text(")
            || t.ends_with("[error]");
        let looks_like_shell = (t.starts_with("hermes ")
            || t.starts_with("python ")
            || t.starts_with("python3 ")
            || t.starts_with("npm ")
            || t.starts_with("npx ")
            || t.starts_with("pnpm ")
            || t.starts_with("yarn ")
            || t.starts_with("bun ")
            || t.starts_with("cargo ")
            || t.starts_with("git ")
            || t.starts_with("node ")
            || t.starts_with("curl ")
            || t.starts_with("cd ")
            || t.starts_with("bash ")
            || t.starts_with("sh ")
            || t.starts_with("zsh ")
            || t.starts_with("/usr/local/bin/docker ")
            || t.starts_with("/usr/bin/")
            || t.starts_with("/bin/")
            || t.starts_with("/opt/")
            || t.starts_with("/Users/")
            || t.starts_with("/Volumes/")
            || t.starts_with("/volume1/")
            || t.starts_with("/tmp/")
            || t.starts_with("docker "))
            && t.contains(" ")
            && (has_elapsed_seconds_tail(t) || t.contains(" && ") || t.contains(" || "));
        (looks_like_code && has_tool_context) || looks_like_shell
    };
    let is_replacement_dump_line = |s: &str| -> bool {
        let t = s.trim();
        if t.is_empty() {
            return false;
        }
        t.starts_with("repls={")
            || t.starts_with("repls = {")
            || t == "}"
            || t == "},"
            || t.starts_with("},")
            || t.starts_with("for rel,")
            || t.starts_with("p=root/rel")
            || t.starts_with("p = root/rel")
            || t.starts_with("if not p.exists()")
            || t.starts_with("if text")
            || t.starts_with("text=text.replace(")
            || t.starts_with("text = text.replace(")
            || t.starts_with("p.write_text(")
            || t.contains("repls.items()")
            || t.contains("p.write_text(")
            || t.contains("text=text.replace(")
            || t.contains("text = text.replace(")
            || ((t.starts_with('\'') || t.starts_with('"'))
                && (t.contains("=>")
                    || t.contains("\\n")
                    || t.contains(".tsx")
                    || t.contains(".ts")
                    || t.contains(".jsx")
                    || t.contains(".js")
                    || t.contains(".py")
                    || t.contains(".css")
                    || t.contains(".json")))
    };
    let is_replacement_map_entry_line = |s: &str| -> bool {
        let t = s.trim();
        (t.starts_with('\'') || t.starts_with('"')) && (t.contains("':") || t.contains("\":"))
    };
    let is_diff_file_header = |s: &str| -> bool {
        let t = s.trim();
        t.starts_with("diff --git ")
            || t.starts_with("--- a/")
            || t.starts_with("+++ b/")
            || ((t.starts_with("a/") || t.starts_with("a//"))
                && t.contains(" → ")
                && (t.contains("b/") || t.contains("b//")))
            || t.starts_with("a///Users/")
            || t.starts_with("b///Users/")
            || t.starts_with("a//Users/")
            || t.starts_with("b//Users/")
    };
    let is_diff_hunk_header = |s: &str| -> bool {
        let t = s.trim();
        t.starts_with("@@ -") && t.contains(" +") && t.matches("@@").count() >= 2
    };
    let is_diff_continuation = |s: &str| -> bool {
        let t = s.trim();
        t.is_empty() || s.starts_with(' ') || s.starts_with('+') || s.starts_with('-')
    };
    loop {
        let line = match stdout_rx.recv_timeout(Duration::from_millis(750)) {
            Ok(Ok(line)) => {
                last_output_at = Instant::now();
                line
            }
            Ok(Err(e)) => return Err(e),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        observed_status = Some(status);
                        break;
                    }
                    Ok(None) => {}
                    Err(e) => return Err(format!("hermes wait: {e}")),
                }

                let idle_for = last_output_at.elapsed();
                let has_text = !final_text.trim().is_empty();
                let completed_and_idle = saw_completion_hint
                    && idle_for >= Duration::from_secs(if has_text { 3 } else { 12 });
                let answer_silent_too_long = has_text && idle_for >= Duration::from_secs(900);
                let activity_silent_too_long =
                    !has_text && !raw_events.is_empty() && idle_for >= Duration::from_secs(1800);
                if completed_and_idle || answer_silent_too_long || activity_silent_too_long {
                    finalized_after_idle = completed_and_idle;
                    if answer_silent_too_long {
                        idle_timeout_status = Some("hermes.answer_idle_timeout");
                    } else if activity_silent_too_long {
                        idle_timeout_status = Some("hermes.activity_idle_timeout");
                    }
                    let _ = child.kill();
                    observed_status = child.wait().ok();
                    emit_agent_event(
                        &app,
                        &turn_id,
                        AgentStreamEvent {
                            kind: "status".into(),
                            text: None,
                            status: Some(
                                idle_timeout_status
                                    .unwrap_or("hermes.finalized_after_idle")
                                    .into(),
                            ),
                            raw: None,
                            provider_session_id: provider_session_id.clone(),
                            is_error: None,
                        },
                    );
                    break;
                }
                continue;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        raw_events.push(line.clone());
        let trimmed = line.trim();

        if replacement_block_active {
            if trimmed.is_empty()
                || is_replacement_dump_line(&line)
                || is_replacement_map_entry_line(&line)
                || is_command_dump(&line)
            {
                emit_agent_event(
                    &app,
                    &turn_id,
                    AgentStreamEvent {
                        kind: "tool".into(),
                        text: Some(trimmed.to_string()),
                        status: Some("hermes.replacement_block".into()),
                        raw: Some(line.clone()),
                        provider_session_id: provider_session_id.clone(),
                        is_error: None,
                    },
                );
                continue;
            }
            replacement_block_active = false;
        }

        if is_replacement_dump_line(&line)
            && (trimmed.starts_with("repls={")
                || trimmed.starts_with("repls = {")
                || ((trimmed.starts_with('\'') || trimmed.starts_with('"'))
                    && (trimmed.contains(".tsx")
                        || trimmed.contains(".ts")
                        || trimmed.contains(".jsx")
                        || trimmed.contains(".js")
                        || trimmed.contains(".py")
                        || trimmed.contains(".css")
                        || trimmed.contains(".json"))))
        {
            replacement_block_active = true;
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "tool".into(),
                    text: Some(trimmed.to_string()),
                    status: Some("hermes.replacement_block".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
            continue;
        }

        if diff_block_active {
            if is_diff_file_header(&line)
                || is_diff_hunk_header(&line)
                || is_diff_continuation(&line)
            {
                emit_agent_event(
                    &app,
                    &turn_id,
                    AgentStreamEvent {
                        kind: "tool".into(),
                        text: Some(trimmed.to_string()),
                        status: Some("hermes.diff".into()),
                        raw: Some(line.clone()),
                        provider_session_id: provider_session_id.clone(),
                        is_error: None,
                    },
                );
                continue;
            }
            diff_block_active = false;
        }

        if is_diff_file_header(&line) || is_diff_hunk_header(&line) {
            diff_block_active = true;
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "tool".into(),
                    text: Some(trimmed.to_string()),
                    status: Some("hermes.diff".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
            continue;
        }

        if trimmed.is_empty() {
            if content_started {
                if !final_text.is_empty() {
                    final_text.push('\n');
                }
                emit_agent_event(
                    &app,
                    &turn_id,
                    AgentStreamEvent {
                        kind: "delta".into(),
                        text: Some("\n".into()),
                        status: None,
                        raw: Some(line.clone()),
                        provider_session_id: provider_session_id.clone(),
                        is_error: None,
                    },
                );
            }
            continue;
        }

        if is_hermes_provider_diagnostic_line(&line) {
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "status".into(),
                    text: Some(trimmed.to_string()),
                    status: Some("hermes.provider_diagnostic".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: Some(true),
                },
            );
            continue;
        }

        if let Some(end_marker) = tool_block_end.clone() {
            if hermes_heredoc_marker_closed(&end_marker, trimmed) {
                tool_block_end = None;
            }
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "tool".into(),
                    text: Some(trimmed.to_string()),
                    status: Some("hermes.tool_block".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("session_id:") {
            provider_session_id = Some(rest.trim().to_string());
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "status".into(),
                    text: None,
                    status: Some("hermes.session".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
            continue;
        }

        // 박스 구분선 / ⚕ 라벨 헤더 → status로 emit + content_started 전환
        if is_box_line(&line) || contains_box_run(&line) || is_provider_label(&line) {
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "status".into(),
                    text: Some(trimmed.to_string()),
                    status: Some("hermes.box".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
            // 박스 구분선이 처음 나오면 본문 시작 신호로 간주
            if !content_started {
                content_started = true;
            }
            continue;
        }

        // trailing 메타 (Resume / Session / Duration / Messages / Tokens / Title / hermes --) → status
        if is_trailing_meta(&line) {
            saw_completion_hint = true;
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "status".into(),
                    text: Some(trimmed.to_string()),
                    status: Some("hermes.trailing".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
            continue;
        }

        // Hermes/Codex style progress summaries are UI activity, not answer body.
        // Example: "┊ 📚 skill ... ┊ 🐍 exec ...". If these leak into final_text,
        // the chat looks like it starts answering and then freezes mid-sentence.
        if is_activity_summary(&line) || is_command_dump(&line) {
            if let Some(end_marker) = heredoc_end_marker(trimmed) {
                tool_block_end = Some(end_marker);
            }
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "tool".into(),
                    text: Some(trimmed.to_string()),
                    status: Some("hermes.tool".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
            continue;
        }

        // 본문 시작 전 — 어떤 라인이든 모두 drop (instruction echo, wrapped bullet body, query echo 등)
        if !content_started {
            continue;
        }

        // 2) hermes 메타 라인 → status
        if trimmed.starts_with("Initializing agent")
            || trimmed.starts_with("↺")
            || trimmed.starts_with("📦")
            || trimmed.starts_with("Loading session")
            || trimmed.starts_with("Continuing session")
            || trimmed.starts_with("Resumed session")
        {
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "status".into(),
                    text: Some(trimmed.to_string()),
                    status: Some("hermes.meta".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
            continue;
        }

        // 3) 사고 narration → status (thinking)
        let lower = trimmed.to_ascii_lowercase();
        let is_thinking = lower.starts_with("thinking")
            || lower.starts_with("tinkering")
            || lower.starts_with("considering")
            || lower.starts_with("planning")
            || lower.starts_with("analyzing")
            || lower.starts_with("reasoning")
            || lower.starts_with("reading ")
            || lower.starts_with("searching")
            || lower.starts_with("editing ")
            || lower.starts_with("writing ");
        if is_thinking {
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "status".into(),
                    text: Some(trimmed.to_string()),
                    status: Some("hermes.thinking".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
            continue;
        }

        // 4) 도구 호출 / 명령 라인 → tool
        if trimmed.starts_with("$ ")
            || trimmed.starts_with("Running:")
            || trimmed.starts_with("Tool:")
            || trimmed.starts_with("🔧")
            || trimmed.starts_with("▶")
        {
            if let Some(end_marker) = heredoc_end_marker(trimmed) {
                tool_block_end = Some(end_marker);
            }
            emit_agent_event(
                &app,
                &turn_id,
                AgentStreamEvent {
                    kind: "tool".into(),
                    text: Some(trimmed.to_string()),
                    status: Some("hermes.tool".into()),
                    raw: Some(line.clone()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                },
            );
            continue;
        }

        // 5) 답변 본문
        content_started = true;
        if !final_text.is_empty() {
            final_text.push('\n');
        }
        final_text.push_str(&line);

        emit_agent_event(
            &app,
            &turn_id,
            AgentStreamEvent {
                kind: "delta".into(),
                text: Some(format!("{line}\n")),
                status: None,
                raw: Some(line.clone()),
                provider_session_id: provider_session_id.clone(),
                is_error: None,
            },
        );
    }

    let status = if let Some(status) = observed_status {
        status
    } else {
        child.wait().map_err(|e| format!("hermes wait: {e}"))?
    };
    let stderr_text = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();
    let auth_error =
        hermes_auth_error_message(&format!("{}\n{}", raw_events.join("\n"), stderr_text));
    let mut text = final_text.trim().to_string();
    let mut best: Vec<String> = Vec::new();
    let mut current: Vec<String> = Vec::new();
    let mut in_answer_box = false;
    let mut extract_replacement_block = false;
    for line in &raw_events {
        let trimmed = line.trim();
        if is_provider_label(line) {
            current.clear();
            in_answer_box = true;
            extract_replacement_block = false;
            continue;
        }
        if !in_answer_box {
            continue;
        }
        if is_trailing_meta(line)
            || is_box_line(line)
            || contains_box_run(line)
            || trimmed.starts_with("Query:")
        {
            if current.iter().any(|l| !l.trim().is_empty()) {
                best = current.clone();
            }
            current.clear();
            in_answer_box = false;
            extract_replacement_block = false;
            continue;
        }
        if extract_replacement_block {
            if trimmed.is_empty()
                || is_replacement_dump_line(line)
                || is_replacement_map_entry_line(line)
                || is_command_dump(line)
            {
                continue;
            }
            extract_replacement_block = false;
        }
        if is_replacement_dump_line(line)
            && (trimmed.starts_with("repls={")
                || trimmed.starts_with("repls = {")
                || ((trimmed.starts_with('\'') || trimmed.starts_with('"'))
                    && (trimmed.contains(".tsx")
                        || trimmed.contains(".ts")
                        || trimmed.contains(".jsx")
                        || trimmed.contains(".js")
                        || trimmed.contains(".py")
                        || trimmed.contains(".css")
                        || trimmed.contains(".json"))))
        {
            extract_replacement_block = true;
            continue;
        }
        if is_activity_summary(line) || is_command_dump(line) || is_replacement_dump_line(line) {
            continue;
        }
        if is_hermes_provider_diagnostic_line(line) {
            continue;
        }
        current.push(trimmed.to_string());
    }
    if current.iter().any(|l| !l.trim().is_empty()) {
        best = current;
    }
    while best.first().is_some_and(|l| l.trim().is_empty()) {
        best.remove(0);
    }
    while best.last().is_some_and(|l| l.trim().is_empty()) {
        best.pop();
    }
    if !best.is_empty() {
        text = best.join("\n").trim().to_string();
    }
    if text.is_empty() && !stderr_text.trim().is_empty() {
        text = stderr_text
            .lines()
            .filter(|l| !l.trim_start().starts_with("session_id:"))
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();
    }
    let idle_timed_out = idle_timeout_status.is_some();
    let provider_timeout_without_answer = text.trim().is_empty()
        && raw_events
            .iter()
            .any(|line| is_hermes_provider_diagnostic_line(line));
    let is_error = auth_error.is_some()
        || (!status.success() && !finalized_after_idle)
        || idle_timed_out
        || provider_timeout_without_answer;
    let error = if is_error {
        Some(if let Some(auth_error) = auth_error {
            auth_error
        } else if let Some(idle_status) = idle_timeout_status {
            match idle_status {
                "hermes.answer_idle_timeout" => {
                    "Hermes가 답변 작성 중 15분 동안 새 출력을 내지 않아 중단했습니다.".to_string()
                }
                "hermes.activity_idle_timeout" => {
                    "Hermes가 도구 실행 후 30분 동안 새 출력을 내지 않아 중단했습니다.".to_string()
                }
                _ => "Hermes가 오래 응답하지 않아 중단했습니다.".to_string(),
            }
        } else if provider_timeout_without_answer {
            "Hermes 모델 호출이 시간 안에 응답하지 않아 중단됐습니다. Atelier가 다음 요청부터 긴 Hermes/Codex 세션 resume 대신 짧은 최근 대화 컨텍스트로 실행합니다.".to_string()
        } else if stderr_text.trim().is_empty() {
            format!("hermes exited with {}", status.code().unwrap_or(-1))
        } else {
            stderr_text.trim().to_string()
        })
    } else {
        None
    };

    emit_agent_event(
        &app,
        &turn_id,
        AgentStreamEvent {
            kind: if is_error {
                "error".into()
            } else {
                "result".into()
            },
            text: Some(if is_error {
                error.clone().unwrap_or_default()
            } else {
                text.clone()
            }),
            status: Some("hermes.completed".into()),
            raw: None,
            provider_session_id: provider_session_id.clone(),
            is_error: Some(is_error),
        },
    );

    Ok(AgentRunResult {
        text,
        provider_session_id,
        raw_events: tail_return_raw_events(&raw_events),
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
    permission_mode: Option<String>,
) -> std::result::Result<AgentRunResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_claude(
            app,
            turn_id,
            prompt,
            resume_session_id,
            cwd,
            model,
            permission_mode,
        )
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
    permission_mode: Option<String>,
) -> std::result::Result<AgentRunResult, String> {
    tauri::async_runtime::spawn_blocking(move || match provider.as_str() {
        "claude" => run_claude(
            app,
            turn_id,
            prompt,
            resume_session_id,
            cwd,
            model,
            permission_mode,
        ),
        "codex" => run_codex(
            app,
            turn_id,
            prompt,
            resume_session_id,
            cwd,
            model,
            effort,
            speed,
            permission_mode,
        ),
        "hermes" => run_hermes(
            app,
            turn_id,
            prompt,
            resume_session_id,
            cwd,
            model,
            hermes_provider,
            permission_mode,
        ),
        other => Err(format!("unsupported provider: {other}")),
    })
    .await
    .map_err(|e| format!("agent thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_cli_command(
    provider: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> std::result::Result<AgentCliCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_agent_cli_command(provider, args, cwd))
        .await
        .map_err(|e| format!("agent cli thread join: {e}"))?
}

#[tauri::command]
pub async fn academic_research_install_claude_plugin(
) -> std::result::Result<AcademicResearchPluginInstallResult, String> {
    tauri::async_runtime::spawn_blocking(install_academic_research_claude_plugin_blocking)
        .await
        .map_err(|e| format!("academic research plugin install thread join: {e}"))?
}

#[tauri::command]
pub fn agent_cancel(turn_id: String) -> std::result::Result<bool, String> {
    let pid = agent_children()
        .lock()
        .map_err(|e| format!("agent cancel registry lock: {e}"))?
        .get(&turn_id)
        .copied();
    Ok(pid.map(terminate_agent_pid).unwrap_or(false))
}

#[tauri::command]
pub async fn agent_change_baseline(
    cwd: Option<String>,
) -> std::result::Result<AgentChangeBaseline, String> {
    tauri::async_runtime::spawn_blocking(move || capture_change_baseline(cwd))
        .await
        .map_err(|e| format!("change baseline thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_change_summary(
    cwd: Option<String>,
    baseline_id: Option<String>,
) -> std::result::Result<AgentChangeSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let baseline = baseline_id
            .filter(|id| !id.trim().is_empty())
            .and_then(|id| change_baselines().lock().ok()?.remove(&id));
        if let Some(baseline) = baseline {
            build_change_summary_since_baseline(cwd, baseline)
        } else {
            build_change_summary(cwd)
        }
    })
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
    fn localhost_preview_checks_try_ipv4_and_ipv6() {
        let parsed = parse_local_preview_url("http://localhost:5173/admin/").unwrap();
        let candidates = preview_connect_candidates(&parsed);
        assert!(candidates.contains(&"127.0.0.1".to_string()));
        assert!(candidates.contains(&"[::1]".to_string()));
    }

    #[test]
    fn normalizes_agent_permission_modes() {
        assert_eq!(
            normalize_agent_permission_mode(Some("basic".into())),
            "basic"
        );
        assert_eq!(
            normalize_agent_permission_mode(Some("auto-review".into())),
            "auto"
        );
        assert_eq!(
            normalize_agent_permission_mode(Some("bypass".into())),
            "full"
        );
        assert_eq!(claude_permission_mode("full"), "bypassPermissions");
    }

    #[test]
    fn hermes_heredoc_marker_accepts_duration_suffix() {
        assert!(hermes_heredoc_marker_closed("PY", "PY"));
        assert!(hermes_heredoc_marker_closed("PY", "PY  13.3s"));
        assert!(hermes_heredoc_marker_closed("EOF", "EOF [error]"));
        assert!(!hermes_heredoc_marker_closed("PY", "PYEONGYANG"));
        assert!(!hermes_heredoc_marker_closed("PY", "print('PY 13.3s')"));
    }

    #[test]
    fn hermes_auth_error_is_promoted_from_stdout() {
        let message = hermes_auth_error_message(
            "Codex refresh token was already consumed by another client (e.g. Codex CLI or VS Code extension). Run `codex` in your terminal to generate fresh tokens, then run `hermes auth` to re-authenticate. Run `hermes model` to re-authenticate.",
        )
        .unwrap();
        assert!(message.contains("Hermes/Codex 인증"));
        assert!(message.contains("hermes auth"));
    }

    #[test]
    fn hermes_provider_timeout_lines_are_diagnostics() {
        assert!(is_hermes_provider_diagnostic_line(
            "⚠️ No response from provider for 300s (non-streaming, model: gpt-5.5). Aborting call."
        ));
        assert!(is_hermes_provider_diagnostic_line(
            "⚠️ API call failed (attempt 1/3): TimeoutError"
        ));
        assert!(is_hermes_provider_diagnostic_line(
            "🌐 Endpoint: https://chatgpt.com/backend-api/codex"
        ));
        assert!(is_hermes_provider_diagnostic_line(
            "⏳ Retrying in 2.5s (attempt 1/3)..."
        ));
        assert!(!is_hermes_provider_diagnostic_line(
            "PositionCard.tsx: Trash2 import 제거 + getApiToken 통합"
        ));
    }
}
