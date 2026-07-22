use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::Stdio;
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};

use crate::agent_process::{command_for_cli, resolve_cli_executable};

const CODEX_CACHE_TTL_MS: u64 = 60_000;
const CLAUDE_CACHE_TTL_MS: u64 = 5 * 60_000;
const CLAUDE_USAGE_PTY_ROWS: u16 = 50;
const CLAUDE_USAGE_PTY_COLS: u16 = 140;
const CLAUDE_USAGE_CAPTURE_LIMIT: usize = 1024 * 1024;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionRateLimitWindow {
    pub id: String,
    pub label: Option<String>,
    pub used_percent: f64,
    pub remaining_percent: f64,
    pub window_minutes: Option<u64>,
    pub resets_at_unix_seconds: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSubscriptionUsage {
    pub provider: String,
    pub plan: Option<String>,
    pub windows: Vec<SubscriptionRateLimitWindow>,
    pub source: String,
    pub captured_at_unix_ms: u64,
}

static USAGE_CACHE: OnceLock<Mutex<HashMap<String, ProviderSubscriptionUsage>>> = OnceLock::new();

fn usage_cache() -> &'static Mutex<HashMap<String, ProviderSubscriptionUsage>> {
    USAGE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn clamp_percent(value: f64) -> f64 {
    value.clamp(0.0, 100.0)
}

pub(crate) fn remember_subscription_usage(usage: ProviderSubscriptionUsage) {
    if usage.windows.is_empty() {
        return;
    }
    if let Ok(mut cache) = usage_cache().lock() {
        cache.insert(usage.provider.clone(), usage);
    }
}

pub(crate) fn cached_subscription_usage(provider: &str) -> Option<ProviderSubscriptionUsage> {
    usage_cache().lock().ok()?.get(provider).cloned()
}

fn cached_subscription_usage_with_ttl(
    provider: &str,
    ttl_ms: u64,
) -> Option<ProviderSubscriptionUsage> {
    let usage = cached_subscription_usage(provider)?;
    (now_ms().saturating_sub(usage.captured_at_unix_ms) <= ttl_ms).then_some(usage)
}

fn value_number(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(|field| {
        field
            .as_f64()
            .or_else(|| field.as_str()?.parse::<f64>().ok())
    })
}

fn value_u64(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(|field| {
        field
            .as_u64()
            .or_else(|| field.as_i64().and_then(|number| u64::try_from(number).ok()))
            .or_else(|| field.as_str()?.parse::<u64>().ok())
    })
}

fn parse_codex_window(
    id: &str,
    label: Option<String>,
    value: &Value,
) -> Option<SubscriptionRateLimitWindow> {
    let used_percent = clamp_percent(value_number(value, "usedPercent")?);
    Some(SubscriptionRateLimitWindow {
        id: id.to_string(),
        label,
        used_percent,
        remaining_percent: clamp_percent(100.0 - used_percent),
        window_minutes: value_u64(value, "windowDurationMins"),
        resets_at_unix_seconds: value_u64(value, "resetsAt"),
    })
}

pub(crate) fn parse_codex_rate_limits_response(
    value: &Value,
) -> Result<ProviderSubscriptionUsage, String> {
    let rate_limits = value
        .get("result")
        .and_then(|result| result.get("rateLimits"))
        .ok_or_else(|| {
            "Codex rate-limit response did not contain result.rateLimits.".to_string()
        })?;
    let limit_name = rate_limits
        .get("limitName")
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut windows = Vec::with_capacity(2);
    if let Some(primary) = rate_limits.get("primary") {
        if let Some(window) = parse_codex_window("primary", limit_name.clone(), primary) {
            windows.push(window);
        }
    }
    if let Some(secondary) = rate_limits.get("secondary") {
        if let Some(window) = parse_codex_window("secondary", limit_name, secondary) {
            windows.push(window);
        }
    }
    if windows.is_empty() {
        return Err("Codex did not report an active subscription rate-limit window.".to_string());
    }
    Ok(ProviderSubscriptionUsage {
        provider: "codex".to_string(),
        plan: rate_limits
            .get("planType")
            .and_then(Value::as_str)
            .map(str::to_string),
        windows,
        source: "Codex app-server account/rateLimits/read".to_string(),
        captured_at_unix_ms: now_ms(),
    })
}

fn wait_for_response(
    receiver: &mpsc::Receiver<String>,
    id: u64,
    timeout: Duration,
) -> Result<Value, String> {
    let deadline = Instant::now() + timeout;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(format!("Codex app-server response {id} timed out."));
        }
        let line = receiver
            .recv_timeout(remaining)
            .map_err(|_| format!("Codex app-server response {id} timed out."))?;
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if value.get("id").and_then(Value::as_u64) == Some(id) {
            return Ok(value);
        }
    }
}

pub(crate) fn fetch_codex_subscription_usage() -> Result<ProviderSubscriptionUsage, String> {
    if let Some(cached) = cached_subscription_usage_with_ttl("codex", CODEX_CACHE_TTL_MS) {
        return Ok(cached);
    }

    let mut command = command_for_cli("codex");
    command
        .arg("app-server")
        .arg("--stdio")
        .env("PATH", crate::augmented_cli_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("Codex app-server start failed: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex app-server stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex app-server stdout is unavailable.".to_string())?;
    let stderr = child.stderr.take();
    let (sender, receiver) = mpsc::channel::<String>();
    let stdout_thread = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if sender.send(line).is_err() {
                break;
            }
        }
    });
    let stderr_thread = stderr.map(|stderr| {
        thread::spawn(move || {
            BufReader::new(stderr)
                .lines()
                .map_while(Result::ok)
                .collect::<Vec<_>>()
                .join("\n")
        })
    });

    let result = (|| {
        writeln!(
            stdin,
            "{}",
            json!({
                "method": "initialize",
                "id": 1,
                "params": {
                    "clientInfo": {
                        "name": "atelier",
                        "title": "Atelier",
                        "version": env!("CARGO_PKG_VERSION")
                    },
                    "capabilities": {}
                }
            })
        )
        .and_then(|_| stdin.flush())
        .map_err(|error| format!("Codex app-server initialize write failed: {error}"))?;
        let initialized = wait_for_response(&receiver, 1, Duration::from_secs(5))?;
        if initialized.get("error").is_some() {
            return Err(format!("Codex app-server initialize failed: {initialized}"));
        }
        writeln!(
            stdin,
            "{}",
            json!({
                "method": "account/rateLimits/read",
                "id": 2,
                "params": {}
            })
        )
        .and_then(|_| stdin.flush())
        .map_err(|error| format!("Codex rate-limit request write failed: {error}"))?;
        let response = wait_for_response(&receiver, 2, Duration::from_secs(8))?;
        if let Some(error) = response.get("error") {
            return Err(format!("Codex rate-limit request failed: {error}"));
        }
        parse_codex_rate_limits_response(&response)
    })();

    drop(stdin);
    let _ = child.kill();
    let _ = child.wait();
    let _ = stdout_thread.join();
    let stderr_text = stderr_thread
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();

    match result {
        Ok(usage) => {
            remember_subscription_usage(usage.clone());
            Ok(usage)
        }
        Err(error) if !stderr_text.trim().is_empty() => {
            Err(format!("{error} {}", stderr_text.trim()))
        }
        Err(error) => Err(error),
    }
}

fn claude_usage_command() -> CommandBuilder {
    #[cfg(target_os = "windows")]
    {
        let (program, prefix_args) = crate::agent_process::windows_cli_command_parts("claude");
        let mut command = CommandBuilder::new(program);
        command.args(prefix_args);
        if let Some(git_bash) = crate::agent_process::windows_git_bash_path() {
            command.env(
                "CLAUDE_CODE_GIT_BASH_PATH",
                git_bash.to_string_lossy().into_owned(),
            );
        }
        configure_claude_usage_environment(&mut command);
        command
    }

    #[cfg(not(target_os = "windows"))]
    {
        let executable = resolve_cli_executable("claude");
        let mut command = CommandBuilder::new(executable.to_string_lossy().into_owned());
        configure_claude_usage_environment(&mut command);
        command
    }
}

fn configure_claude_usage_environment(command: &mut CommandBuilder) {
    command.env("PATH", crate::augmented_cli_path());
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("LANG", "en_US.UTF-8");
    command.env("LC_CTYPE", "en_US.UTF-8");

    // Subscription usage must come from Claude Code's own signed-in account.
    // Inherited API credentials would switch the CLI to API-billing mode.
    for key in [
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_BASE_URL",
        "CLAUDE_CODE_OAUTH_TOKEN",
    ] {
        command.env_remove(key);
    }
}

fn percent_used_after_label(screen: &str, label: &str) -> Option<f64> {
    let tail = screen.split_once(label)?.1;
    let marker_index = tail.find("% used")?;
    let prefix = tail.get(..marker_index)?.trim_end();
    let number = prefix
        .rsplit(|character: char| !(character.is_ascii_digit() || character == '.'))
        .find(|part| !part.is_empty())?
        .parse::<f64>()
        .ok()?;
    Some(clamp_percent(number))
}

pub(crate) fn parse_claude_usage_screen(screen: &str) -> Option<ProviderSubscriptionUsage> {
    let mut windows = Vec::with_capacity(2);
    for (id, label, minutes) in [
        ("five_hour", "Current session", 300),
        ("seven_day", "Current week (all models)", 10_080),
    ] {
        let Some(used_percent) = percent_used_after_label(screen, label) else {
            continue;
        };
        windows.push(SubscriptionRateLimitWindow {
            id: id.to_string(),
            label: Some(label.to_string()),
            used_percent,
            remaining_percent: clamp_percent(100.0 - used_percent),
            window_minutes: Some(minutes),
            resets_at_unix_seconds: None,
        });
    }

    (!windows.is_empty()).then(|| ProviderSubscriptionUsage {
        provider: "claude".to_string(),
        plan: None,
        windows,
        source: "Claude Code /usage".to_string(),
        captured_at_unix_ms: now_ms(),
    })
}

fn captured_screen(bytes: &[u8]) -> String {
    let mut parser = vt100::Parser::new(CLAUDE_USAGE_PTY_ROWS, CLAUDE_USAGE_PTY_COLS, 0);
    parser.process(bytes);
    parser.screen().contents()
}

pub(crate) fn fetch_claude_subscription_usage() -> Result<ProviderSubscriptionUsage, String> {
    if let Some(cached) = cached_subscription_usage_with_ttl("claude", CLAUDE_CACHE_TTL_MS) {
        return Ok(cached);
    }

    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows: CLAUDE_USAGE_PTY_ROWS,
            cols: CLAUDE_USAGE_PTY_COLS,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("Claude usage PTY could not start: {error}"))?;
    let mut child = pair
        .slave
        .spawn_command(claude_usage_command())
        .map_err(|error| format!("Claude Code could not start for /usage: {error}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("Claude usage PTY reader is unavailable: {error}"))?;
    let mut writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("Claude usage PTY writer is unavailable: {error}"))?;
    let captured = Arc::new(Mutex::new(Vec::<u8>::new()));
    let captured_reader = Arc::clone(&captured);
    let reader_thread = thread::spawn(move || {
        let mut buffer = [0_u8; 8 * 1024];
        loop {
            let Ok(read) = reader.read(&mut buffer) else {
                break;
            };
            if read == 0 {
                break;
            }
            let Ok(mut output) = captured_reader.lock() else {
                break;
            };
            output.extend_from_slice(&buffer[..read]);
            if output.len() > CLAUDE_USAGE_CAPTURE_LIMIT {
                let excess = output.len() - CLAUDE_USAGE_CAPTURE_LIMIT;
                output.drain(..excess);
            }
        }
    });

    thread::sleep(Duration::from_millis(900));
    writer
        .write_all(b"\x15/usage\r")
        .and_then(|_| writer.flush())
        .map_err(|error| format!("Claude /usage command could not be entered: {error}"))?;

    let started = Instant::now();
    let mut retried = false;
    let result = loop {
        let screen = captured.lock().ok().map(|output| captured_screen(&output));
        if let Some(usage) = screen.as_deref().and_then(parse_claude_usage_screen) {
            break Ok(usage);
        }

        if !retried && started.elapsed() >= Duration::from_secs(4) {
            let _ = writer.write_all(b"\x1b\x15/usage\r");
            let _ = writer.flush();
            retried = true;
        }
        if started.elapsed() >= Duration::from_secs(12) {
            let diagnostic = screen
                .unwrap_or_default()
                .lines()
                .filter(|line| !line.trim().is_empty())
                .take(8)
                .collect::<Vec<_>>()
                .join(" | ");
            break Err(if diagnostic.is_empty() {
                "Claude Code /usage did not return subscription usage within 12 seconds."
                    .to_string()
            } else {
                format!(
                    "Claude Code /usage did not expose subscription usage. Screen: {diagnostic}"
                )
            });
        }

        if child
            .try_wait()
            .map_err(|error| format!("Claude usage process check failed: {error}"))?
            .is_some()
        {
            break Err("Claude Code exited before /usage was available. Sign in to the Claude subscription in Settings > Connections.".to_string());
        }
        thread::sleep(Duration::from_millis(150));
    };

    let _ = child.kill();
    let _ = child.wait();
    drop(writer);
    drop(pair.master);
    let _ = reader_thread.join();

    match result {
        Ok(usage) => {
            remember_subscription_usage(usage.clone());
            Ok(usage)
        }
        Err(error) => {
            if let Some(cached) = cached_subscription_usage("claude") {
                Ok(cached)
            } else {
                Err(error)
            }
        }
    }
}

#[tauri::command]
pub async fn provider_subscription_usage(
    provider: String,
) -> Result<Option<ProviderSubscriptionUsage>, String> {
    let provider = provider.trim().to_ascii_lowercase();
    match provider.as_str() {
        "codex" | "openai-codex" => tokio::task::spawn_blocking(fetch_codex_subscription_usage)
            .await
            .map_err(|error| format!("Codex subscription usage worker failed: {error}"))?
            .map(Some),
        "claude" | "anthropic" => tokio::task::spawn_blocking(fetch_claude_subscription_usage)
            .await
            .map_err(|error| format!("Claude subscription usage worker failed: {error}"))?
            .map(Some),
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_codex_subscription_window() {
        let usage = parse_codex_rate_limits_response(&json!({
            "id": 2,
            "result": {
                "rateLimits": {
                    "limitId": "codex",
                    "limitName": null,
                    "primary": {
                        "usedPercent": 19,
                        "windowDurationMins": 10080,
                        "resetsAt": 1785217180
                    },
                    "secondary": null,
                    "planType": "pro"
                }
            }
        }))
        .unwrap();
        assert_eq!(usage.provider, "codex");
        assert_eq!(usage.plan.as_deref(), Some("pro"));
        assert_eq!(usage.windows[0].used_percent, 19.0);
        assert_eq!(usage.windows[0].remaining_percent, 81.0);
        assert_eq!(usage.windows[0].window_minutes, Some(10_080));
    }

    #[test]
    fn parses_claude_official_usage_screen_as_used_percent() {
        let usage = parse_claude_usage_screen(
            "Claude Code\n\nCurrent session\n████ 28.5% used\nResets 3pm\n\nCurrent week (all models)\n██████ 42% used\nResets Monday\n",
        )
        .expect("Claude usage should parse");
        assert_eq!(usage.provider, "claude");
        assert_eq!(usage.windows.len(), 2);
        assert_eq!(usage.windows[0].used_percent, 28.5);
        assert_eq!(usage.windows[0].remaining_percent, 71.5);
        assert_eq!(usage.windows[1].used_percent, 42.0);
        assert_eq!(usage.windows[1].window_minutes, Some(10_080));
    }

    #[test]
    #[ignore = "requires a signed-in Claude Code subscription"]
    fn reads_live_claude_subscription_usage() {
        let usage = fetch_claude_subscription_usage().expect("live Claude usage");
        eprintln!("{usage:#?}");
        assert!(!usage.windows.is_empty());
    }
}
