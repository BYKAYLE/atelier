use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{mpsc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime};

use crate::agent_lifecycle::{self, AgentLifecycleEvent, AgentLifecyclePhase};
use crate::agent_models::{
    codex_model_requires_multi_agent_v2, normalize_codex_reasoning_effort, read_codex_config_model,
};
#[cfg(target_os = "windows")]
use crate::agent_process::configure_windows_background_command;
use crate::agent_process::{
    clip_cli_output, command_for_cli, describe_cli_command, resolve_cli_executable,
    wait_with_timeout,
};
use crate::agent_registry::{runtime_capabilities, AgentProviderKind, AgentRuntimeCapability};
use crate::credentials::{
    configure_gajecode_runtime_env, env_var_for, gajecode_cli_name, gajecode_executable_path,
    gajecode_workspace_dir, prepare_gajecode_claude_subscription_token, read_agent_api_key,
    read_api_key, read_claude_subscription_oauth_token, should_clear_inherited_agent_api_env,
};

const RETURN_RAW_EVENT_LIMIT: usize = 120;
const RETURN_RAW_EVENT_CHAR_LIMIT: usize = 12_000;
const FAST_AGENT_CLI_TIMEOUT: Duration = Duration::from_secs(20);
const STANDARD_AGENT_CLI_TIMEOUT: Duration = Duration::from_secs(120);
const LONG_RUNNING_AGENT_CLI_TIMEOUT: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AgentCliTimeoutPolicy {
    FastInspection,
    Standard,
    LongRunning,
}

impl AgentCliTimeoutPolicy {
    const fn timeout(self) -> Duration {
        match self {
            Self::FastInspection => FAST_AGENT_CLI_TIMEOUT,
            Self::Standard => STANDARD_AGENT_CLI_TIMEOUT,
            Self::LongRunning => LONG_RUNNING_AGENT_CLI_TIMEOUT,
        }
    }
}

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
/// 해당 provider 의 환경변수로 주입한다. Claude/Codex 구독 경로는 부모 프로세스의
/// stale API key env 를 제거해 CLI OAuth 캐시가 우선되게 한다.
fn inject_agent_cli_credential_env(cmd: &mut Command, provider: &str) {
    if provider == "claude" {
        cmd.env_remove("CLAUDE_CODE_OAUTH_TOKEN");
        if let Some(token) = read_claude_subscription_oauth_token() {
            cmd.env("CLAUDE_CODE_OAUTH_TOKEN", token);
        }
    }
    if let Some(var) = env_var_for(provider) {
        if should_clear_inherited_agent_api_env(provider) {
            cmd.env_remove(var);
        }
        if let Some(key) = read_agent_api_key(provider) {
            cmd.env(var, key);
        }
    }
}

fn inject_backend_credential_env(cmd: &mut Command, provider: &str) {
    if let (Some(var), Some(key)) = (env_var_for(provider), read_api_key(provider)) {
        cmd.env(var, key);
    }
}

fn isolate_claude_structured_run(cmd: &mut Command) {
    // Atelier renders Claude as a structured chat surface, not as the full Claude Code TUI.
    // User-level hooks can inject synthetic follow-up turns after the answer has already
    // completed (for example Stella Stop hook reminders), which looks like a repeated
    // failed response in the hidden-terminal UI. Keep project/local settings, but skip
    // global user hooks for this adapter.
    cmd.arg("--setting-sources").arg("local,project");
}

fn format_cli_exit(cli: &str, status: ExitStatus) -> String {
    let code = status.code().unwrap_or(-1);
    #[cfg(target_os = "windows")]
    if code == -1073741510 {
        return format!("{cli}가 Windows 종료 신호로 중단됐습니다. 외부 콘솔이 닫혔거나 프로세스가 강제로 종료된 상태입니다.");
    }
    format!("{cli} exited with {code}")
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

fn command_for_gajecode() -> Result<Command, String> {
    let executable = gajecode_executable_path().ok_or_else(|| {
        "가재코드 CLI가 설치되어 있지 않습니다. 설정 > 연결에서 자동 설치를 먼저 실행하세요."
            .to_string()
    })?;
    let mut command = command_for_cli(&executable.to_string_lossy());
    configure_gajecode_runtime_env(&mut command)?;
    Ok(command)
}

fn is_help_request(args: &[String]) -> bool {
    args.iter()
        .any(|arg| matches!(arg.as_str(), "-h" | "--help" | "help"))
}

fn cli_subcommand_is(args: &[String], parent: &str, allowed: &[&str]) -> bool {
    args.first().is_some_and(|arg| arg == parent)
        && args
            .get(1)
            .is_some_and(|subcommand| allowed.contains(&subcommand.as_str()))
}

fn is_fast_agent_cli_inspection(provider: AgentProviderKind, args: &[String]) -> bool {
    let Some(first) = args.first().map(String::as_str) else {
        return false;
    };
    if matches!(first, "help" | "-h" | "--help")
        || args
            .iter()
            .any(|arg| matches!(arg.as_str(), "-h" | "--help"))
    {
        return true;
    }

    match provider {
        AgentProviderKind::Hermes => {
            matches!(first, "status" | "version" | "doctor" | "logs")
                || cli_subcommand_is(args, "plugins", &["list", "ls"])
                || cli_subcommand_is(args, "tools", &["list"])
                || cli_subcommand_is(
                    args,
                    "skills",
                    &[
                        "list", "browse", "search", "inspect", "check", "audit", "config",
                    ],
                )
                || cli_subcommand_is(args, "mcp", &["list", "ls", "test", "config", "configure"])
                || cli_subcommand_is(args, "sessions", &["list", "stats", "browse"])
        }
        AgentProviderKind::Claude => {
            first == "doctor"
                || cli_subcommand_is(args, "auth", &["status"])
                || cli_subcommand_is(
                    args,
                    "plugin",
                    &["list", "details", "marketplace", "validate"],
                )
                || cli_subcommand_is(
                    args,
                    "plugins",
                    &["list", "details", "marketplace", "validate"],
                )
                || cli_subcommand_is(args, "mcp", &["list", "get"])
        }
        AgentProviderKind::Codex => {
            cli_subcommand_is(args, "mcp", &["list", "get"])
                || cli_subcommand_is(args, "features", &["list"])
                || cli_subcommand_is(args, "login", &["status"])
                || cli_subcommand_is(args, "plugin", &["marketplace"])
        }
        AgentProviderKind::GajaeCode => {
            matches!(first, "--version" | "-v" | "--smoke-test")
                || first.starts_with("--list-models")
                || cli_subcommand_is(args, "skills", &["list", "read", "browse", "search"])
                || cli_subcommand_is(args, "session", &["list", "status"])
                || (first == "setup"
                    && args
                        .iter()
                        .any(|arg| matches!(arg.as_str(), "--check" | "--smoke")))
                || cli_subcommand_is(args, "notify", &["status"])
                || (first == "mcp-serve" && args.iter().any(|arg| arg == "--check"))
        }
    }
}

fn is_long_running_agent_cli_command(provider: AgentProviderKind, args: &[String]) -> bool {
    let Some(first) = args.first().map(String::as_str) else {
        return false;
    };

    match provider {
        AgentProviderKind::Claude => first == "auto-mode",
        AgentProviderKind::Codex => first == "review",
        AgentProviderKind::Hermes => false,
        AgentProviderKind::GajaeCode => {
            matches!(
                first,
                "-p" | "--print"
                    | "--continue"
                    | "-c"
                    | "--resume"
                    | "-r"
                    | "--worktree"
                    | "rlm"
                    | "web-search"
                    | "q"
            ) || (!first.starts_with('-') && !is_known_gajecode_cli_command(first))
        }
    }
}

fn agent_cli_timeout_policy(provider: AgentProviderKind, args: &[String]) -> AgentCliTimeoutPolicy {
    let lowered = args
        .iter()
        .map(|arg| arg.to_ascii_lowercase())
        .collect::<Vec<_>>();
    if is_fast_agent_cli_inspection(provider, &lowered) {
        AgentCliTimeoutPolicy::FastInspection
    } else if is_long_running_agent_cli_command(provider, &lowered) {
        AgentCliTimeoutPolicy::LongRunning
    } else {
        AgentCliTimeoutPolicy::Standard
    }
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

fn is_known_gajecode_cli_command(command: &str) -> bool {
    matches!(
        command,
        "codex-native-hook"
            | "state"
            | "setup"
            | "skills"
            | "session"
            | "harness"
            | "coordinator"
            | "team"
            | "ultragoal"
            | "gc"
            | "ralplan"
            | "config"
            | "notify"
            | "daemon"
            | "web-search"
            | "q"
            | "mcp-serve"
            | "contribute-pr"
            | "contribution-prep"
            | "deep-interview"
            | "migrate"
            | "rlm"
            | "update"
            | "launch"
            | "--help"
            | "-h"
            | "help"
    )
}

fn validate_agent_cli_command(provider: &str, args: &[String]) -> Result<(), String> {
    if args.is_empty() {
        return Err("실행할 CLI 명령이 비어 있습니다.".into());
    }
    if args.iter().any(|arg| arg.contains('\0')) {
        return Err("명령 인자에 허용되지 않는 문자가 있습니다.".into());
    }

    let mut lowered: Vec<String> = args.iter().map(|arg| arg.to_lowercase()).collect();
    if provider == "gajecode" && lowered.first().is_some_and(|arg| arg == "gjc") {
        lowered.remove(0);
    }
    if lowered.is_empty() {
        return Err("실행할 CLI 명령이 비어 있습니다.".into());
    }
    let first = lowered[0].as_str();
    let help_requested = lowered
        .iter()
        .any(|arg| matches!(arg.as_str(), "--help" | "-h" | "help"));
    if provider == "gajecode" && help_requested && is_known_gajecode_cli_command(first) {
        return Ok(());
    }
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
        "gajecode" => match first {
            "help" | "--help" | "-h" | "--version" | "-v" | "--smoke-test" => Ok(()),
            value if value.starts_with("--list-models") => Ok(()),
            "-p" | "--print" | "--continue" | "-c" | "--resume" | "-r" | "--export"
            | "--worktree" => Ok(()),
            "skills" => allow_cli_subcommand(
                provider,
                &lowered,
                "skills",
                &["list", "read", "browse", "search"],
            ),
            "session" => allow_cli_subcommand(provider, &lowered, "session", &["list", "status"]),
            "setup" => {
                let component = lowered.get(1).map(String::as_str).unwrap_or("defaults");
                let check_only = lowered.iter().any(|arg| arg == "--check");
                let smoke_only =
                    component == "hermes" && lowered.iter().any(|arg| arg == "--smoke");
                if check_only
                    && matches!(
                        component,
                        "claude"
                            | "codex"
                            | "credentials"
                            | "defaults"
                            | "hermes"
                            | "hooks"
                            | "provider"
                            | "python"
                            | "stt"
                    )
                    || smoke_only
                {
                    Ok(())
                } else {
                    Err(format!(
                        "가재코드 작업 탭에서 지원하지 않는 명령입니다: {}",
                        lowered.join(" ")
                    ))
                }
            }
            "notify" => allow_cli_subcommand(provider, &lowered, "notify", &["status", "setup"]),
            "mcp-serve" => {
                if lowered.iter().any(|arg| arg == "--check") {
                    Ok(())
                } else {
                    Err("mcp-serve는 --check 점검 모드만 작업 탭에서 실행할 수 있습니다.".into())
                }
            }
            "web-search" | "q" => Ok(()),
            "rlm" => Ok(()),
            _ if first.starts_with('-') => Err(format!(
                "가재코드 작업 탭에서 지원하지 않는 옵션입니다: {first}"
            )),
            _ if is_known_gajecode_cli_command(first) => Err(format!(
                "가재코드 작업 탭에서 지원하지 않는 명령입니다: {first}"
            )),
            _ => Ok(()),
        },
        other => Err(format!("지원하지 않는 provider입니다: {other}")),
    }
}

fn run_agent_cli_command(
    provider: String,
    mut args: Vec<String>,
    cwd: Option<String>,
) -> Result<AgentCliCommandResult, String> {
    let provider_kind = AgentProviderKind::parse(&provider)?;
    let provider = provider_kind.id().to_string();
    if provider_kind == AgentProviderKind::GajaeCode
        && args
            .first()
            .is_some_and(|arg| arg.eq_ignore_ascii_case("gjc"))
    {
        args.remove(0);
    }
    validate_agent_cli_command(&provider, &args)?;

    let mut cmd = match provider_kind {
        AgentProviderKind::Hermes => command_for_hermes(),
        AgentProviderKind::Claude => command_for_cli("claude"),
        AgentProviderKind::Codex => command_for_cli("codex"),
        AgentProviderKind::GajaeCode => command_for_gajecode()?,
    };
    if !matches!(
        provider_kind,
        AgentProviderKind::Hermes | AgentProviderKind::GajaeCode
    ) {
        inject_agent_cli_credential_env(&mut cmd, &provider);
    }
    if let Some(cwd) = normalize_agent_cwd(cwd)? {
        cmd.current_dir(cwd);
    }
    for arg in &args {
        cmd.arg(arg);
    }
    if provider_kind != AgentProviderKind::GajaeCode {
        cmd.env("PATH", crate::augmented_cli_path());
    }
    cmd.env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let timeout_policy = agent_cli_timeout_policy(provider_kind, &args);
    let child = cmd.spawn().map_err(|e| {
        format!(
            "{} 실행 실패: {} ({e})",
            provider,
            describe_cli_command(&provider)
        )
    })?;
    let (output, timed_out) = wait_with_timeout(child, timeout_policy.timeout())?;
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

fn describe_gajecode_command() -> String {
    let executable =
        gajecode_executable_path().unwrap_or_else(|| PathBuf::from(gajecode_cli_name()));
    format!(
        "program={} isolated_home=true isolated_skills=true",
        executable.display()
    )
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

fn agent_line_has_elapsed_seconds_tail(s: &str) -> bool {
    let mut t = s.trim();
    if let Some(stripped) = t.strip_suffix("[error]") {
        t = stripped.trim_end();
    }
    if let Some(rest) = t.strip_suffix(']') {
        if let Some((before, marker)) = rest.rsplit_once('[') {
            let marker = marker.trim();
            if marker
                .strip_prefix("exit ")
                .and_then(|code| code.trim().parse::<i32>().ok())
                .is_some()
            {
                t = before.trim_end();
            }
        }
    }
    let Some(last) = t.split_whitespace().last() else {
        return false;
    };
    let Some(number) = last.strip_suffix('s') else {
        return false;
    };
    !number.is_empty() && number.parse::<f64>().is_ok()
}

fn agent_line_is_command_dump(s: &str) -> bool {
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
            && agent_line_has_elapsed_seconds_tail(t))
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
        || (t.starts_with("printf ")
            && t.contains("==")
            && (t.contains("find ")
                || t.contains("pgrep ")
                || t.contains("launchctl")
                || t.contains("PlistBuddy")
                || t.contains("Applications")
                || t.contains("LaunchAgents")))
        || ((t.contains("doneprintf")
            || t.contains("true/usr/libexec")
            || t.contains("LaunchAgents")
            || t.contains("LaunchDaemons"))
            && agent_line_has_elapsed_seconds_tail(t))
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
        || t.starts_with("printf ")
        || t.starts_with("echo ")
        || t.starts_with("find ")
        || t.starts_with("pgrep ")
        || t.starts_with("launchctl ")
        || t.starts_with("osascript ")
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
        && t.contains(' ')
        && (agent_line_has_elapsed_seconds_tail(t) || t.contains(" && ") || t.contains(" || "));
    (looks_like_code && has_tool_context) || looks_like_shell
}

fn hermes_auth_error_message(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let looks_like_auth_error = lower.contains("refresh token was already consumed")
        || lower.contains("access token could not be refreshed")
        || lower.contains("could not be refreshed because you have since logged out")
        || lower.contains("logged out or signed in to another account")
        || lower.contains("please sign in again")
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
                    || line.contains("access token")
                    || line.contains("Codex")
                    || line.contains("credentials")
                    || line.contains("credential")
                    || line.contains("logged out")
                    || line.contains("signed in")
                    || line.contains("sign in again")
                    || line.contains("hermes auth")
                    || line.contains("hermes model")
                    || line.contains("re-authenticate")
                    || line.contains("reauthenticate"))
        })
        .collect::<Vec<_>>()
        .join("\n");

    Some(if detail.is_empty() {
        "Codex 구독 인증 토큰이 만료되었거나 다른 계정 로그인으로 무효화되었습니다. 설정 > 연결에서 ChatGPT 구독 로그인을 다시 진행해 주세요.".to_string()
    } else {
        format!(
            "Codex 구독 인증이 만료되어 실행을 이어가지 못했습니다.\n\n설정 > 연결에서 ChatGPT 구독 로그인을 다시 진행해 주세요.\n\n원문:\n{}",
            detail
        )
    })
}

fn provider_cooldown_seconds(text: &str) -> Option<u64> {
    let lower = text.to_ascii_lowercase();
    let looks_like_provider_cooldown = lower.contains("temporarily limiting requests")
        || lower.contains("accounts exhausted")
        || lower.contains("server is temporarily limiting")
        || (lower.contains("retry in") && lower.contains("not your usage limit"));
    if !looks_like_provider_cooldown {
        return None;
    }

    if let Some(start) = lower.find("retry in") {
        let mut digits = String::new();
        for ch in lower[start + "retry in".len()..].chars() {
            if ch.is_ascii_digit() {
                digits.push(ch);
            } else if !digits.is_empty() {
                break;
            }
        }
        if let Ok(seconds) = digits.parse::<u64>() {
            if seconds > 0 {
                return Some(seconds);
            }
        }
    }

    Some(300)
}

fn provider_cooldown_message(provider: &str, text: &str) -> Option<String> {
    let seconds = provider_cooldown_seconds(text)?;
    let source = text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or(text.trim());
    Some(format!(
        "{provider} 공급자 계정 풀이 일시 제한에 걸렸습니다. 사용량 초과가 아니라 서버가 요청을 잠시 제한한 상태입니다. 약 {seconds}초 뒤 같은 작업을 다시 시도할 수 있습니다.\n\n원문: {source}"
    ))
}

fn extract_claude_error_from_raw_events(raw_events: &[String]) -> Option<String> {
    for line in raw_events.iter().rev() {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let event_type = value
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if event_type == "result" && value.get("is_error").and_then(Value::as_bool) == Some(true) {
            if let Some(status) = value.get("api_error_status").and_then(Value::as_str) {
                let message = format!("Claude API error: {status}");
                return provider_cooldown_message("Claude/TeamClaude", &message).or(Some(message));
            }
            if let Some(result) = value.get("result").and_then(Value::as_str) {
                if !result.trim().is_empty() {
                    let message = result.trim().to_string();
                    return provider_cooldown_message("Claude/TeamClaude", &message)
                        .or(Some(message));
                }
            }
        }
        if event_type == "error" {
            if let Some(message) = value.get("message").and_then(Value::as_str) {
                if !message.trim().is_empty() {
                    let message = message.trim().to_string();
                    return provider_cooldown_message("Claude/TeamClaude", &message)
                        .or(Some(message));
                }
            }
        }
        if event_type == "system"
            && value.get("subtype").and_then(Value::as_str) == Some("api_retry")
        {
            let status = value
                .get("error_status")
                .and_then(Value::as_i64)
                .map(|n| n.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let code = value
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("api_error");
            if status == "401" || code == "authentication_failed" {
                return Some(format!(
                    "Claude 인증 실패: 구독 로그인 대신 API 키 인증 경로가 사용됐거나 저장된 자격증명이 만료되었습니다. status={status}, error={code}"
                ));
            }
            return Some(format!(
                "Claude API retry failed: status={status}, error={code}"
            ));
        }
    }
    None
}

fn claude_stream_completed_successfully(raw_events: &[String]) -> bool {
    for line in raw_events.iter().rev() {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if value.get("type").and_then(Value::as_str) != Some("result") {
            continue;
        }
        if value.get("is_error").and_then(Value::as_bool) == Some(true) {
            return false;
        }
        let subtype = value.get("subtype").and_then(Value::as_str);
        let terminal_reason = value.get("terminal_reason").and_then(Value::as_str);
        return subtype == Some("success") || terminal_reason == Some("completed");
    }
    false
}

fn is_hermes_provider_diagnostic_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return false;
    }

    let lower = t.to_ascii_lowercase();
    lower.contains("no response from provider")
        || lower.contains("api call failed")
        || lower.contains("temporarily limiting requests")
        || lower.contains("accounts exhausted")
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
    fn hold_for_child(_label: &str, _child_pid: u32) -> Self {
        #[cfg(target_os = "macos")]
        {
            let caffeinate = Command::new("/usr/bin/caffeinate")
                // Keep CPU/disk/system awake while the agent child is alive.
                // Do not use -d so the display can still turn off or lock normally.
                .arg("-ims")
                .arg("-w")
                .arg(_child_pid.to_string())
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

fn configure_agent_process_tree(command: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;

        // Give every agent turn its own process group so cancelling the turn also
        // stops shell commands and tool subprocesses spawned by the CLI.
        command.process_group(0);
    }

    #[cfg(not(unix))]
    {
        let _ = command;
    }
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
        let pid = pid as libc::pid_t;
        unsafe {
            // The group id matches the leader pid configured above. Keep a
            // direct-pid fallback for turns started by an older app process.
            libc::kill(-pid, libc::SIGTERM) == 0 || libc::kill(pid, libc::SIGTERM) == 0
        }
    }

    #[cfg(windows)]
    {
        let mut command = Command::new("taskkill");
        configure_windows_background_command(&mut command);
        command
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

fn emit_agent_event<R: Runtime>(app: &AppHandle<R>, turn_id: &str, event: AgentStreamEvent) {
    if let Some(lifecycle) = agent_lifecycle::observe(
        turn_id,
        &event.kind,
        event.status.as_deref(),
        event.text.as_deref(),
        event.provider_session_id.as_deref(),
        event.is_error,
    ) {
        emit_agent_lifecycle(app, turn_id, lifecycle);
    }
    let _ = app.emit(&format!("agent://{turn_id}/event"), event);
}

fn emit_agent_lifecycle<R: Runtime>(app: &AppHandle<R>, turn_id: &str, event: AgentLifecycleEvent) {
    let _ = app.emit(&format!("agent://{turn_id}/lifecycle"), event);
}

fn begin_agent_lifecycle<R: Runtime>(
    app: &AppHandle<R>,
    turn_id: &str,
    provider: AgentProviderKind,
) -> Result<(), String> {
    let event = agent_lifecycle::begin(turn_id, provider)?;
    emit_agent_lifecycle(app, turn_id, event);
    Ok(())
}

fn finish_agent_lifecycle<R: Runtime>(
    app: &AppHandle<R>,
    turn_id: &str,
    phase: AgentLifecyclePhase,
    summary: Option<&str>,
) {
    if let Some(event) = agent_lifecycle::finish(turn_id, phase, summary) {
        emit_agent_lifecycle(app, turn_id, event);
    }
}

fn normalize_claude_model(model: Option<String>) -> String {
    let value = model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("claude-opus-4-8");
    let lower = value.to_ascii_lowercase().replace('_', "-");
    match lower.as_str() {
        "default"
        | "opus"
        | "best"
        | "opusplan"
        | "opus[1m]"
        | "opus 48"
        | "opus 4.8"
        | "opus 47"
        | "opus 4.7"
        | "claude-opus-48"
        | "claude-opus-4.8"
        | "claude-opus-4-8"
        | "claude-opus-47"
        | "claude-opus-4.7"
        | "claude-opus-4-7"
        | "claude-opus-4-1"
        | "claude-opus-4-1-20250805"
        | "claude-opus-4-20250514" => "claude-opus-4-8".to_string(),
        "fable" | "fable 55" | "fable 5" | "fable 5.5" | "claude-fable-55" | "claude-fable-5"
        | "claude-fable-5.5" | "claude-fable-5-5" => "claude-fable-5".to_string(),
        "sonnet"
        | "sonnet[1m]"
        | "sonnet 46"
        | "sonnet 4.6"
        | "claude-sonnet-46"
        | "claude-sonnet-4.6"
        | "claude-sonnet-4-6"
        | "claude-sonnet-4"
        | "claude-sonnet-4-20250514" => "claude-sonnet-4-6".to_string(),
        "haiku"
        | "haiku 45"
        | "haiku 4.5"
        | "claude-haiku-45"
        | "claude-haiku-4.5"
        | "claude-haiku-4-5"
        | "claude-3-5-haiku-latest"
        | "claude-3-5-haiku-20241022" => "claude-haiku-4-5-20251001".to_string(),
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
        "openrouter" => "openrouter".to_string(),
        "openai-codex" | "codex" => "openai-codex".to_string(),
        "anthropic" | "claude" => "openai-codex".to_string(),
        _ => "openai-codex".to_string(),
    }
}

fn normalize_agent_permission_mode(permission_mode: Option<String>) -> String {
    match permission_mode
        .as_deref()
        .map(str::trim)
        .map(str::to_ascii_lowercase)
        .as_deref()
        .unwrap_or("auto")
    {
        "basic" | "default" => "basic".to_string(),
        "auto" | "autoreview" | "auto-review" => "auto".to_string(),
        "full" | "bypass" | "danger" => "full".to_string(),
        _ => "auto".to_string(),
    }
}

fn claude_permission_mode(permission_mode: &str) -> &'static str {
    match permission_mode {
        "basic" => "default",
        "auto" => "auto",
        "full" => "bypassPermissions",
        _ => "auto",
    }
}

fn push_codex_permission_args(cmd: &mut Command, permission_mode: &str) {
    match permission_mode {
        "basic" => {
            cmd.arg("--sandbox")
                .arg("workspace-write")
                .arg("--ask-for-approval")
                .arg("on-request");
        }
        "auto" => {
            cmd.arg("--sandbox")
                .arg("workspace-write")
                .arg("--ask-for-approval")
                .arg("never");
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
                let raw_error = v
                    .get("result")
                    .and_then(Value::as_str)
                    .or_else(|| v.get("api_error_status").and_then(Value::as_str))
                    .unwrap_or("Claude returned an error")
                    .to_string();
                let message =
                    provider_cooldown_message("Claude/TeamClaude", &raw_error).unwrap_or(raw_error);
                *final_text = message.clone();
                *error = Some(message);
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
            let raw_msg = v
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Claude stream error")
                .to_string();
            let msg = provider_cooldown_message("Claude/TeamClaude", &raw_msg).unwrap_or(raw_msg);
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
    inject_agent_cli_credential_env(&mut cmd, "claude");
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
    isolate_claude_structured_run(&mut cmd);

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

    configure_agent_process_tree(&mut cmd);
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
            for line in reader.lines().map_while(Result::ok) {
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
    let stream_completed_successfully = claude_stream_completed_successfully(&raw_events);
    if !status.success() && !stream_completed_successfully {
        is_error = true;
        if error.is_none() {
            error = Some(if stderr_text.trim().is_empty() {
                extract_claude_error_from_raw_events(&raw_events)
                    .unwrap_or_else(|| format_cli_exit("claude", status))
            } else {
                stderr_text.trim().to_string()
            });
        }
        if let Some(current) = error.clone() {
            if let Some(message) = provider_cooldown_message("Claude/TeamClaude", &current) {
                final_text = message.clone();
                error = Some(message);
            }
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

#[allow(clippy::too_many_arguments)]
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
    let model = model
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(read_codex_config_model)
        .unwrap_or_else(|| "gpt-5.5".to_string());
    let effort = normalize_codex_reasoning_effort(&model, effort);
    let mut cmd = command_for_cli("codex");
    inject_agent_cli_credential_env(&mut cmd, "codex");
    push_codex_permission_args(&mut cmd, &permission_mode);
    if codex_model_requires_multi_agent_v2(&model) {
        cmd.arg("--enable").arg("multi_agent_v2");
    }
    cmd.arg("exec");
    if let Some(cwd) = normalize_agent_cwd(cwd)? {
        cmd.arg("--cd").arg(cwd);
    }
    cmd.arg("--model").arg(&model);
    if let Some(effort) = effort {
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
        cmd.arg("--json")
            .arg("--skip-git-repo-check")
            .arg(session_id)
            .arg(prompt);
    } else {
        cmd.arg("--json").arg("--skip-git-repo-check").arg(prompt);
    }

    emit_agent_event(
        &app,
        &turn_id,
        AgentStreamEvent {
            kind: "status".into(),
            text: None,
            status: Some("codex.starting".into()),
            raw: Some(format!("provider=codex model={model}")),
            provider_session_id: None,
            is_error: None,
        },
    );

    configure_agent_process_tree(&mut cmd);
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
            for line in reader.lines().map_while(Result::ok) {
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
    let auth_error =
        hermes_auth_error_message(&format!("{}\n{}", raw_events.join("\n"), stderr_text));
    if let Some(auth_error) = auth_error {
        is_error = true;
        final_text = auth_error.clone();
        error = Some(auth_error.clone());
        emit_agent_event(
            &app,
            &turn_id,
            AgentStreamEvent {
                kind: "error".into(),
                text: Some(auth_error),
                status: Some("codex.auth".into()),
                raw: None,
                provider_session_id: provider_session_id.clone(),
                is_error: Some(true),
            },
        );
    }
    if !status.success() {
        is_error = true;
        if error.is_none() {
            error = Some(if stderr_text.trim().is_empty() {
                format_cli_exit("codex", status)
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

fn extract_gajecode_session_id(text: &str) -> Option<String> {
    let mut previous_was_session = false;
    for raw in text.split_whitespace() {
        let token = raw.trim_matches(|c: char| {
            matches!(
                c,
                '"' | '\'' | '`' | ':' | ',' | ';' | '(' | ')' | '[' | ']' | '{' | '}'
            )
        });
        let lower = token.to_ascii_lowercase();
        if previous_was_session && token.len() >= 16 {
            return Some(token.to_string());
        }
        if let Some((key, value)) = token.split_once('=') {
            if key.eq_ignore_ascii_case("session") && value.len() >= 16 {
                return Some(value.to_string());
            }
        }
        if lower == "session" || lower == "session:" {
            previous_was_session = true;
            continue;
        }
        previous_was_session = false;
    }
    None
}

fn gajecode_prompt_with_workspace(prompt: String, project_cwd: Option<&Path>) -> String {
    let Some(project_cwd) = project_cwd else {
        return prompt;
    };
    format!(
        "Atelier is running Gajae-Code (gjc) from an isolated provider workspace so existing Claude/Codex/Hermes/project skills are not auto-loaded. Treat this path as the only codebase target for the user's request: {}\n\nUser request:\n{}",
        project_cwd.display(),
        prompt
    )
}

fn codex_model_label_for_prompt(model: &str) -> String {
    model
        .split('-')
        .map(|segment| match segment.to_ascii_lowercase().as_str() {
            "gpt" => "GPT".to_string(),
            "codex" => "Codex".to_string(),
            "mini" => "Mini".to_string(),
            "spark" => "Spark".to_string(),
            "sol" => "Sol".to_string(),
            "terra" => "Terra".to_string(),
            "luna" => "Luna".to_string(),
            _ => segment.to_string(),
        })
        .collect::<Vec<_>>()
        .join("-")
}

fn gajecode_model_label_for_prompt(model: &str) -> String {
    if let Some(model) = gajecode_codex_model(model) {
        return codex_model_label_for_prompt(&model);
    }

    match model {
        "anthropic/claude-opus-4-8" | "claude-opus-4-8" => "Opus 4.8",
        "anthropic/claude-fable-5"
        | "claude-fable-5"
        | "anthropic/claude-fable-5-5"
        | "claude-fable-5-5" => "Fable 5",
        "anthropic/claude-sonnet-4-6" | "claude-sonnet-4-6" => "Sonnet 4.6",
        "anthropic/claude-haiku-4-5-20251001" | "claude-haiku-4-5-20251001" => "Haiku 4.5",
        _ => "selected model",
    }
    .to_string()
}

fn gajecode_model_system_prompt(model: &str) -> String {
    let label = gajecode_model_label_for_prompt(model);
    format!(
        "Atelier selected model: {label} (`{model}`). This is authoritative runtime metadata supplied by Atelier. If the user asks which model is selected or running, clearly state that the selected model is {label}. Do not infer a different model, say that the minor version is unavailable, or claim that the current session does not expose it.\n\
\n\
Atelier response contract:\n\
- You are answering inside Atelier, a structured local agent workspace. Treat the user as the owner of the workspace and answer professionally.\n\
- If the user writes in Korean, always use polite Korean 존댓말. Never use 반말, casual imperative phrases, slang, or brusque phrases such as \"달라\", \"골라줘\", \"손볼게\", \"맞는 거 골라줘\".\n\
- Do not blame ambiguity in a short request. Infer the most likely intent from the active workspace and existing context, inspect what you can, and then answer with the concrete result. Ask one concise clarifying question only when the task is genuinely impossible to disambiguate.\n\
- Do not expose raw CLI chatter, internal prompts, diffs, or tool logs unless the user explicitly asks for logs. Summarize evidence and next action in natural language.\n\
- For diagnostics, state: observed symptom, likely cause, what you checked, and what should be fixed next. Avoid ending with \"which one do you mean?\" when you can investigate.\n\
- Be helpful and complete enough for the user's request. Do not become terse because of model metadata or command-mode metadata."
    )
}

fn normalize_gajecode_model_for_cli(model: Option<String>) -> String {
    let trimmed = model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("claude-opus-4-8");
    let lower = trimmed.to_ascii_lowercase().replace('_', "-");
    match lower.as_str() {
        "default"
        | "opus"
        | "best"
        | "opus 48"
        | "opus 4.8"
        | "opus 47"
        | "opus 4.7"
        | "claude-opus-4-8"
        | "claude-opus-48"
        | "claude-opus-4.8"
        | "claude-opus-47"
        | "claude-opus-4.7"
        | "claude-opus-4-7"
        | "claude-opus-4-1"
        | "claude-opus-4-1-20250805"
        | "claude-opus-4-20250514"
        | "anthropic/claude-opus-4-8"
        | "anthropic/claude-opus-4.8"
        | "deepseek/deepseek-v4-flash"
        | "deepseek/deepseek-v4-pro"
        | "gpt-5.5" => "anthropic/claude-opus-4-8".to_string(),
        "fable"
        | "fable 55"
        | "fable 5"
        | "fable 5.5"
        | "claude-fable-55"
        | "claude-fable-5"
        | "claude-fable-5.5"
        | "claude-fable-5-5"
        | "anthropic/claude-fable-5"
        | "anthropic/claude-fable-5.5"
        | "anthropic/claude-fable-5-5" => "anthropic/claude-fable-5".to_string(),
        "sonnet"
        | "sonnet 46"
        | "sonnet 4.6"
        | "claude-sonnet-4-6"
        | "claude-sonnet-46"
        | "claude-sonnet-4.6"
        | "claude-sonnet-4"
        | "claude-sonnet-4-20250514"
        | "anthropic/claude-sonnet-4-6"
        | "anthropic/claude-sonnet-4.6" => "anthropic/claude-sonnet-4-6".to_string(),
        "haiku"
        | "haiku 45"
        | "haiku 4.5"
        | "claude-haiku-4-5-20251001"
        | "claude-haiku-45"
        | "claude-haiku-4.5"
        | "claude-haiku-4-5"
        | "claude-3-5-haiku-latest"
        | "claude-3-5-haiku-20241022"
        | "anthropic/claude-haiku-4-5-20251001"
        | "anthropic/claude-haiku-4.5" => "anthropic/claude-haiku-4-5-20251001".to_string(),
        _ => trimmed.to_string(),
    }
}

/// A Gajae workspace can use the user's Codex subscription without requiring
/// an OpenAI API key inside the isolated GJC runtime.  The `codex/` marker is
/// UI-only routing metadata and is stripped before calling the native CLI.
fn gajecode_codex_model(model: &str) -> Option<String> {
    let model = model.trim();
    let selected = model.strip_prefix("codex/")?.trim();
    (!selected.is_empty()).then(|| selected.to_string())
}

fn gajecode_codex_prompt(model: &str, prompt: String) -> String {
    let routed_model = format!("codex/{model}");
    format!(
        "{}\n\nUser request:\n{}",
        gajecode_model_system_prompt(&routed_model),
        prompt
    )
}

fn parse_teamclaude_export_value(line: &str, key: &str) -> Option<String> {
    let prefix = format!("export {key}=");
    let raw = line.trim().strip_prefix(&prefix)?.trim();
    let unquoted = raw
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .or_else(|| {
            raw.strip_prefix('\'')
                .and_then(|value| value.strip_suffix('\''))
        })
        .unwrap_or(raw)
        .trim();
    (!unquoted.is_empty()).then(|| unquoted.to_string())
}

fn parse_teamclaude_env_output(text: &str) -> Option<(String, String)> {
    let mut base_url = None;
    let mut api_key = None;
    for line in text.lines() {
        if base_url.is_none() {
            base_url = parse_teamclaude_export_value(line, "ANTHROPIC_BASE_URL");
        }
        if api_key.is_none() {
            api_key = parse_teamclaude_export_value(line, "ANTHROPIC_API_KEY");
        }
    }
    let base_url = base_url?;
    let api_key = api_key?;
    if !base_url.starts_with("http://127.0.0.1")
        && !base_url.starts_with("http://localhost")
        && !base_url.starts_with("https://127.0.0.1")
        && !base_url.starts_with("https://localhost")
    {
        return None;
    }
    Some((base_url, api_key))
}

fn teamclaude_proxy_is_running() -> bool {
    let mut status = command_for_cli("teamclaude");
    status
        .arg("status")
        .env("PATH", crate::augmented_cli_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let Ok(output) = status.output() else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    let lower = text.to_ascii_lowercase();
    lower.contains("server:") && lower.contains("running") && lower.contains("port")
}

fn teamclaude_env_for_gajecode() -> Option<(String, String)> {
    if !teamclaude_proxy_is_running() {
        return None;
    }
    let mut env_cmd = command_for_cli("teamclaude");
    env_cmd
        .arg("env")
        .env("PATH", crate::augmented_cli_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let Ok(output) = env_cmd.output() else {
        return None;
    };
    if !output.status.success() {
        return None;
    }
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    parse_teamclaude_env_output(&text)
}

fn inject_gajecode_claude_subscription_env(cmd: &mut Command, model: &str) -> bool {
    let lower = model.to_ascii_lowercase();
    let uses_claude = lower.contains("claude") || lower.contains("anthropic") || lower == "opus";
    if !uses_claude {
        return true;
    }

    cmd.env_remove("ANTHROPIC_BASE_URL");
    cmd.env_remove("ANTHROPIC_API_KEY");
    cmd.env_remove("ANTHROPIC_OAUTH_TOKEN");
    cmd.env_remove("CLAUDE_CODE_OAUTH_TOKEN");
    if let Some((base_url, api_key)) = teamclaude_env_for_gajecode() {
        cmd.env("ANTHROPIC_BASE_URL", base_url);
        cmd.env("ANTHROPIC_API_KEY", api_key);
        return true;
    }

    // Gajae consumes the inference-only setup token through its documented
    // child-process environment. No token is copied into agent.db and Atelier
    // never imports or refreshes Claude Code's own session credentials.
    match prepare_gajecode_claude_subscription_token() {
        Ok(Some(token)) => {
            cmd.env("ANTHROPIC_OAUTH_TOKEN", token);
            true
        }
        Ok(None) => false,
        Err(err) => {
            log::warn!("gajecode claude oauth preparation failed: {err}");
            false
        }
    }
}

fn run_gajecode<R: Runtime>(
    app: AppHandle<R>,
    request: AgentAdapterRequest,
) -> Result<AgentRunResult, String> {
    let AgentAdapterRequest {
        turn_id,
        prompt,
        resume_session_id,
        cwd,
        model,
        hermes_provider: _,
        effort,
        speed,
        permission_mode,
    } = request;
    let permission_mode = normalize_agent_permission_mode(permission_mode);
    if let Some(codex_model) = model.as_deref().and_then(gajecode_codex_model) {
        // Keep the Gajae workspace/session surface while delegating inference
        // to the already authenticated native Codex CLI.  This is intentional:
        // GJC's OpenAI adapter requires an API key and cannot consume a ChatGPT
        // subscription token directly.
        let prompt = gajecode_codex_prompt(&codex_model, prompt);
        return run_codex(
            app,
            turn_id,
            prompt,
            resume_session_id,
            cwd,
            Some(codex_model),
            effort,
            speed,
            Some(permission_mode),
        );
    }
    let requested_model = normalize_gajecode_model_for_cli(model);
    let _resume_session_id = resume_session_id;
    let project_cwd = normalize_agent_cwd(cwd)?;
    let run_dir = gajecode_workspace_dir()
        .ok_or_else(|| "Could not resolve the isolated 가재코드 workspace.".to_string())?;
    fs::create_dir_all(&run_dir).map_err(|e| format!("create {}: {e}", run_dir.display()))?;

    let mut cmd = command_for_gajecode()?;
    if !inject_gajecode_claude_subscription_env(&mut cmd, &requested_model) {
        return Err(
            "Claude 구독/API 자격증명이 연결되어 있지 않습니다. 설정 > 연결에서 Claude 구독 로그인을 시작해 공식 setup-token 인증을 완료한 뒤 다시 실행해 주세요."
                .to_string(),
        );
    }
    let prompt = if !permission_mode.is_empty() {
        format!(
            "Requested permission mode: {}\n\n{}",
            permission_mode, prompt
        )
    } else {
        prompt
    };
    cmd.current_dir(&run_dir)
        .arg("--print")
        .arg("--no-title")
        .arg("--no-session")
        .arg("--append-system-prompt")
        .arg(gajecode_model_system_prompt(&requested_model))
        .arg("--model")
        .arg(&requested_model)
        .arg(gajecode_prompt_with_workspace(
            prompt,
            project_cwd.as_deref(),
        ))
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    emit_agent_event(
        &app,
        &turn_id,
        AgentStreamEvent {
            kind: "status".into(),
            text: None,
            status: Some("gajecode.starting".into()),
            raw: None,
            provider_session_id: None,
            is_error: None,
        },
    );

    configure_agent_process_tree(&mut cmd);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("gajecode spawn: {e} ({})", describe_gajecode_command()))?;
    let _child_registration = AgentChildRegistration::new(&turn_id, child.id());
    let _power_assertion = AgentPowerAssertion::hold_for_child("gajecode", child.id());
    let stderr = child.stderr.take();
    let stderr_handle = stderr.map(|stderr| {
        thread::spawn(move || {
            let mut out = String::new();
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
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
        .ok_or_else(|| "gajecode stdout missing".to_string())?;
    let reader = BufReader::new(stdout);
    let mut raw_events = Vec::new();
    let mut final_text = String::new();
    for line in reader.lines() {
        let line = line.map_err(|e| format!("gajecode stdout: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        raw_events.push(line.clone());
        let delta = format!("{line}\n");
        final_text.push_str(&delta);
        emit_agent_event(
            &app,
            &turn_id,
            AgentStreamEvent {
                kind: "delta".into(),
                text: Some(delta),
                status: None,
                raw: Some(line),
                provider_session_id: None,
                is_error: None,
            },
        );
    }

    let status = child.wait().map_err(|e| format!("gajecode wait: {e}"))?;
    let stderr_text = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();
    let provider_session_id = extract_gajecode_session_id(&stderr_text);
    let is_error = !status.success();
    let error = if is_error {
        Some(if stderr_text.trim().is_empty() {
            format_cli_exit("gajecode", status)
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
                final_text.trim().to_string()
            }),
            status: Some("gajecode.completed".into()),
            raw: None,
            provider_session_id: provider_session_id.clone(),
            is_error: Some(is_error),
        },
    );

    if !stderr_text.trim().is_empty() {
        raw_events.push(stderr_text);
    }
    Ok(AgentRunResult {
        text: final_text.trim().to_string(),
        provider_session_id,
        raw_events: tail_return_raw_events(&raw_events),
        is_error,
        error,
    })
}

#[allow(clippy::too_many_arguments)]
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
        "openai-codex" => "codex",
        "openrouter" => "openrouter",
        _ => "openrouter",
    };
    // Hermes owns its provider authentication and can import the canonical
    // Codex CLI credential itself. Atelier must not copy provider credentials
    // into Hermes state, even temporarily.
    inject_backend_credential_env(&mut cmd, hermes_credential_provider);
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

    configure_agent_process_tree(&mut cmd);
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
            for line in reader.lines().map_while(Result::ok) {
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
    let is_command_dump = |s: &str| -> bool { agent_line_is_command_dump(s) };
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
            format_cli_exit("hermes", status)
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

struct AgentAdapterRequest {
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    hermes_provider: Option<String>,
    effort: Option<String>,
    speed: Option<String>,
    permission_mode: Option<String>,
}

fn run_registered_adapter<R: Runtime>(
    app: AppHandle<R>,
    provider: AgentProviderKind,
    request: AgentAdapterRequest,
) -> Result<AgentRunResult, String> {
    match provider {
        AgentProviderKind::Claude => run_claude(
            app,
            request.turn_id,
            request.prompt,
            request.resume_session_id,
            request.cwd,
            request.model,
            request.permission_mode,
        ),
        AgentProviderKind::Codex => run_codex(
            app,
            request.turn_id,
            request.prompt,
            request.resume_session_id,
            request.cwd,
            request.model,
            request.effort,
            request.speed,
            request.permission_mode,
        ),
        AgentProviderKind::GajaeCode => run_gajecode(app, request),
        AgentProviderKind::Hermes => run_hermes(
            app,
            request.turn_id,
            request.prompt,
            request.resume_session_id,
            request.cwd,
            request.model,
            request.hermes_provider,
            request.permission_mode,
        ),
    }
}

async fn run_adapter_turn<R: Runtime>(
    app: AppHandle<R>,
    provider: AgentProviderKind,
    request: AgentAdapterRequest,
) -> Result<AgentRunResult, String> {
    let turn_id = request.turn_id.clone();
    begin_agent_lifecycle(&app, &turn_id, provider)?;
    let run_app = app.clone();
    let result = match tauri::async_runtime::spawn_blocking(move || {
        run_registered_adapter(run_app, provider, request)
    })
    .await
    {
        Ok(result) => result,
        Err(err) => Err(format!("agent thread join: {err}")),
    };
    match &result {
        Ok(run) => finish_agent_lifecycle(
            &app,
            &turn_id,
            if run.is_error {
                AgentLifecyclePhase::Failed
            } else {
                AgentLifecyclePhase::Completed
            },
            run.error.as_deref().or(Some(run.text.as_str())),
        ),
        Err(err) => finish_agent_lifecycle(&app, &turn_id, AgentLifecyclePhase::Failed, Some(err)),
    }
    result
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
    crate::stella::guard_agent_prompt(&prompt)?;
    run_adapter_turn(
        app,
        AgentProviderKind::Claude,
        AgentAdapterRequest {
            turn_id,
            prompt,
            resume_session_id,
            cwd,
            model,
            hermes_provider: None,
            effort: None,
            speed: None,
            permission_mode,
        },
    )
    .await
}

#[allow(clippy::too_many_arguments)]
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
    crate::stella::guard_agent_prompt(&prompt)?;
    let provider_kind = AgentProviderKind::parse(&provider)?;
    run_adapter_turn(
        app,
        provider_kind,
        AgentAdapterRequest {
            turn_id,
            prompt,
            resume_session_id,
            cwd,
            model,
            hermes_provider,
            effort,
            speed,
            permission_mode,
        },
    )
    .await
}

#[tauri::command]
pub fn agent_runtime_capabilities() -> Vec<AgentRuntimeCapability> {
    runtime_capabilities()
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
pub fn agent_cancel<R: Runtime>(
    app: AppHandle<R>,
    turn_id: String,
) -> std::result::Result<bool, String> {
    let pid = agent_children()
        .lock()
        .map_err(|e| format!("agent cancel registry lock: {e}"))?
        .get(&turn_id)
        .copied();
    let stopped = pid.map(terminate_agent_pid).unwrap_or(false);
    if stopped {
        finish_agent_lifecycle(
            &app,
            &turn_id,
            AgentLifecyclePhase::Cancelled,
            Some("cancelled by user"),
        );
    }
    Ok(stopped)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn terminate_agent_pid_stops_agent_process_group() {
        let mut command = Command::new("/bin/sh");
        command
            .args(["-c", "sleep 30 & wait"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        configure_agent_process_tree(&mut command);

        let mut child = command.spawn().expect("spawn isolated agent process group");
        assert!(terminate_agent_pid(child.id()));

        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            match child.try_wait().expect("poll cancelled agent") {
                Some(_) => break,
                None if Instant::now() < deadline => thread::sleep(Duration::from_millis(25)),
                None => {
                    let _ = child.kill();
                    panic!("cancelled agent process group did not exit");
                }
            }
        }
    }

    #[test]
    fn gajecode_legacy_models_route_to_claude_subscription_defaults() {
        assert_eq!(
            normalize_gajecode_model_for_cli(Some("deepseek/deepseek-v4-flash".into())),
            "anthropic/claude-opus-4-8"
        );
        assert_eq!(
            normalize_gajecode_model_for_cli(Some("gpt-5.5".into())),
            "anthropic/claude-opus-4-8"
        );
        assert_eq!(
            normalize_gajecode_model_for_cli(Some("sonnet".into())),
            "anthropic/claude-sonnet-4-6"
        );
        assert_eq!(
            normalize_gajecode_model_for_cli(Some("claude-haiku-4-5".into())),
            "anthropic/claude-haiku-4-5-20251001"
        );
        assert_eq!(
            normalize_gajecode_model_for_cli(Some("Opus 47".into())),
            "anthropic/claude-opus-4-8"
        );
        assert_eq!(
            normalize_gajecode_model_for_cli(Some("claude-opus-4-8".into())),
            "anthropic/claude-opus-4-8"
        );
        assert_eq!(
            normalize_gajecode_model_for_cli(Some("claude-sonnet-4-6".into())),
            "anthropic/claude-sonnet-4-6"
        );
        assert_eq!(
            normalize_gajecode_model_for_cli(Some("Fable 5.5".into())),
            "anthropic/claude-fable-5"
        );
        assert_eq!(
            normalize_gajecode_model_for_cli(Some("claude-fable-5".into())),
            "anthropic/claude-fable-5"
        );
    }

    #[test]
    fn gajecode_codex_model_routes_to_native_codex() {
        assert_eq!(
            gajecode_codex_model("codex/gpt-5.5"),
            Some("gpt-5.5".to_string())
        );
        assert_eq!(gajecode_codex_model("claude-opus-4-8"), None);
        assert_eq!(gajecode_codex_model("codex/"), None);
        assert_eq!(
            gajecode_codex_model("codex/gpt-5.6-sol"),
            Some("gpt-5.6-sol".to_string())
        );
    }

    #[test]
    fn gajecode_codex_prompt_exposes_exact_runtime_model() {
        let prompt = gajecode_codex_prompt("gpt-5.6-sol", "지금 선택한 모델이 뭐야?".to_string());
        assert!(prompt.contains("GPT-5.6-Sol"));
        assert!(prompt.contains("`codex/gpt-5.6-sol`"));
        assert!(prompt.contains("authoritative runtime metadata"));
        assert!(prompt.contains("current session does not expose it"));
        assert!(prompt.ends_with("지금 선택한 모델이 뭐야?"));
    }

    #[test]
    fn gajecode_model_prompt_names_opus_48() {
        let prompt = gajecode_model_system_prompt("anthropic/claude-opus-4-8");
        assert!(prompt.contains("Opus 4.8"));
        assert!(prompt.contains("anthropic/claude-opus-4-8"));
        assert!(prompt.contains("minor version is unavailable"));
        assert!(prompt.contains("complete enough for the user's request"));
        assert!(prompt.contains("존댓말"));
        assert!(prompt.contains("Never use 반말"));
        assert!(prompt.contains("Do not blame ambiguity"));
    }

    #[test]
    fn gajecode_model_prompt_names_fable_5() {
        let prompt = gajecode_model_system_prompt("anthropic/claude-fable-5");
        assert!(prompt.contains("Fable 5"));
        assert!(prompt.contains("anthropic/claude-fable-5"));
    }

    #[test]
    fn teamclaude_env_parser_accepts_export_lines_only() {
        let parsed = parse_teamclaude_env_output(
            r#"
Created temporary API key for proxy use.
export ANTHROPIC_BASE_URL=http://localhost:3456
export ANTHROPIC_API_KEY="tc-example"
"#,
        );
        assert_eq!(
            parsed,
            Some((
                "http://localhost:3456".to_string(),
                "tc-example".to_string()
            ))
        );
    }

    #[test]
    fn teamclaude_env_parser_rejects_remote_base_url() {
        assert_eq!(
            parse_teamclaude_env_output(
                "export ANTHROPIC_BASE_URL=https://api.anthropic.com\nexport ANTHROPIC_API_KEY=tc-example"
            ),
            None
        );
    }

    #[test]
    fn agent_cli_timeout_policy_keeps_inspection_commands_fast() {
        let cases = vec![
            (AgentProviderKind::Hermes, vec!["status"]),
            (AgentProviderKind::Hermes, vec!["skills", "check"]),
            (AgentProviderKind::Claude, vec!["auth", "status"]),
            (AgentProviderKind::Codex, vec!["features", "list"]),
            (AgentProviderKind::GajaeCode, vec!["--version"]),
            (AgentProviderKind::GajaeCode, vec!["session", "list"]),
            (
                AgentProviderKind::GajaeCode,
                vec!["setup", "defaults", "--check"],
            ),
            (AgentProviderKind::GajaeCode, vec!["team", "--help"]),
        ];

        for (provider, args) in cases {
            let args = args.into_iter().map(String::from).collect::<Vec<_>>();
            let policy = agent_cli_timeout_policy(provider, &args);
            assert_eq!(
                policy,
                AgentCliTimeoutPolicy::FastInspection,
                "{provider:?} {args:?} should use the fast inspection timeout"
            );
            assert_eq!(policy.timeout(), Duration::from_secs(20));
        }
    }

    #[test]
    fn agent_cli_timeout_policy_extends_allowlisted_execution_commands() {
        let cases = vec![
            (AgentProviderKind::Claude, vec!["auto-mode"]),
            (AgentProviderKind::Codex, vec!["review", "--uncommitted"]),
            (
                AgentProviderKind::GajaeCode,
                vec!["rlm", "summarize", "this", "dataset"],
            ),
            (AgentProviderKind::GajaeCode, vec!["-p", "implement", "it"]),
            (
                AgentProviderKind::GajaeCode,
                vec!["review", "this", "project"],
            ),
        ];

        for (provider, args) in cases {
            let args = args.into_iter().map(String::from).collect::<Vec<_>>();
            let policy = agent_cli_timeout_policy(provider, &args);
            assert_eq!(
                policy,
                AgentCliTimeoutPolicy::LongRunning,
                "{provider:?} {args:?} should use the long-running timeout"
            );
            assert_eq!(policy.timeout(), Duration::from_secs(30 * 60));
        }
    }

    #[test]
    fn agent_cli_timeout_policy_keeps_other_commands_on_a_bounded_default() {
        for (provider, args) in [
            (AgentProviderKind::Hermes, vec!["plugins", "enable"]),
            (
                AgentProviderKind::GajaeCode,
                vec!["--export", "session.jsonl"],
            ),
            (AgentProviderKind::GajaeCode, vec!["notify", "setup"]),
        ] {
            let args = args.into_iter().map(String::from).collect::<Vec<_>>();
            let policy = agent_cli_timeout_policy(provider, &args);
            assert_eq!(policy, AgentCliTimeoutPolicy::Standard);
            assert_eq!(policy.timeout(), Duration::from_secs(120));
        }
    }

    #[test]
    fn gajecode_cli_validation_matches_exposed_safe_commands() {
        for args in [
            vec!["--help"],
            vec!["--list-models"],
            vec!["skills", "list"],
            vec!["session", "list"],
            vec!["setup", "defaults", "--check"],
            vec!["setup", "hermes", "--smoke"],
            vec!["notify", "status"],
            vec!["mcp-serve", "coordinator", "--check", "--json"],
            vec!["web-search", "gajae code"],
            vec!["q", "gajae code"],
            vec!["rlm", "summarize this dataset"],
            vec!["update", "--help"],
            vec!["gjc", "review", "this", "project"],
            vec!["review", "this", "project"],
        ] {
            let args = args.into_iter().map(String::from).collect::<Vec<_>>();
            assert!(
                validate_agent_cli_command("gajecode", &args).is_ok(),
                "{args:?} should be allowed"
            );
        }
        for args in [
            vec!["session", "remove", "old"],
            vec!["update"],
            vec!["mcp-serve", "coordinator"],
            vec!["setup", "hermes", "--install"],
            vec!["team", "3:executor", "finish the task"],
            vec!["ultragoal", "ship the release"],
            vec!["contribute-pr", "prepare the change"],
            vec!["daemon"],
            vec!["harness", "run"],
            vec!["contribution-prep", "prepare"],
            vec!["--unknown"],
        ] {
            let args = args.into_iter().map(String::from).collect::<Vec<_>>();
            assert!(
                validate_agent_cli_command("gajecode", &args).is_err(),
                "{args:?} should be blocked"
            );
        }
    }

    #[test]
    fn claude_legacy_and_compact_opus_models_route_to_current_default() {
        assert_eq!(normalize_claude_model(None), "claude-opus-4-8");
        assert_eq!(
            normalize_claude_model(Some("claude-opus-47".into())),
            "claude-opus-4-8"
        );
        assert_eq!(
            normalize_claude_model(Some("Opus 4.7".into())),
            "claude-opus-4-8"
        );
        assert_eq!(
            normalize_claude_model(Some("Fable 5.5".into())),
            "claude-fable-5"
        );
    }

    #[test]
    fn command_dump_detects_launchctl_exit_tail() {
        let line = r#"printf '= apps =\n'for d in /Applications "$HOME/Applications"; do [ -d "$d" ] && /usr/bin/find "$d" -maxdepth 2 -iname 'hermes' -print; doneprintf '= launchctl =\n'launchctl list | grep -i 'hermes|atelier' || true 0.2s [exit 1]"#;
        assert!(agent_line_is_command_dump(line));
    }

    #[test]
    fn command_dump_does_not_hide_plain_korean_answer() {
        let line = "프리뷰 실행 위치가 프로젝트 루트가 아니라 dashboard 폴더여야 합니다.";
        assert!(!agent_line_is_command_dump(line));
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
        assert_eq!(normalize_agent_permission_mode(None), "auto");
        assert_eq!(
            normalize_agent_permission_mode(Some("unexpected".into())),
            "auto"
        );
        assert_eq!(claude_permission_mode("full"), "bypassPermissions");
        assert_eq!(claude_permission_mode("unexpected"), "auto");
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
        assert!(message.contains("Codex 구독 인증"));
        assert!(message.contains("hermes auth"));
    }

    #[test]
    fn codex_refresh_token_toast_is_promoted_to_relogin_message() {
        let message = hermes_auth_error_message(
            "Your access token could not be refreshed because you have since logged out or signed in to another account. Please sign in again.",
        )
        .unwrap();
        assert!(message.contains("ChatGPT 구독 로그인"));
        assert!(message.contains("다시 진행"));
    }

    #[test]
    fn claude_auth_retry_is_promoted_from_raw_events() {
        let raw = vec![
            r#"{"type":"system","subtype":"api_retry","attempt":1,"error_status":401,"error":"authentication_failed"}"#.to_string(),
        ];
        let message = extract_claude_error_from_raw_events(&raw).unwrap();
        assert!(message.contains("Claude 인증 실패"));
        assert!(message.contains("401"));
        assert!(message.contains("authentication_failed"));
    }

    #[test]
    fn provider_cooldown_retry_seconds_are_detected() {
        let message = "API Error: Server is temporarily limiting requests (not your usage limit) · All 2 accounts exhausted. Retry in 300s.";
        assert_eq!(provider_cooldown_seconds(message), Some(300));
        let friendly = provider_cooldown_message("Claude/TeamClaude", message).unwrap();
        assert!(friendly.contains("일시 제한"));
        assert!(friendly.contains("300초"));
    }

    #[test]
    fn claude_provider_cooldown_is_promoted_from_raw_events() {
        let raw = vec![
            r#"{"type":"error","message":"API Error: Server is temporarily limiting requests (not your usage limit) · All 2 accounts exhausted. Retry in 300s."}"#.to_string(),
        ];
        let message = extract_claude_error_from_raw_events(&raw).unwrap();
        assert!(message.contains("Claude/TeamClaude"));
        assert!(message.contains("일시 제한"));
        assert!(message.contains("300초"));
    }

    #[test]
    fn claude_success_result_survives_late_nonzero_exit() {
        let raw = vec![
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"ok"}]}}"#.to_string(),
            r#"{"type":"result","subtype":"success","is_error":false,"terminal_reason":"completed","result":"ok"}"#.to_string(),
        ];
        assert!(claude_stream_completed_successfully(&raw));
    }

    #[test]
    fn claude_error_result_is_not_successful_completion() {
        let raw = vec![
            r#"{"type":"result","subtype":"error","is_error":true,"api_error_status":"401","terminal_reason":"failed"}"#.to_string(),
        ];
        assert!(!claude_stream_completed_successfully(&raw));
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
