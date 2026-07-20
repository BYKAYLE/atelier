// 사용자 구독·API 자격증명 관리.
// macOS: Keychain / Windows: Credential Manager (keyring crate가 OS 네이티브 보안 저장소 사용).
// 평문 디스크 저장 금지. profiles JSON에는 boolean 플래그만.

use keyring::Entry;
use once_cell::sync::Lazy;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::ffi::OsStr;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, ExitStatus, Output, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Url;

const SERVICE: &str = "com.atelier.app";
// OAuth authorize URLs can exceed several hundred characters. A normal
// 80/120-column PTY may hard-wrap the query string and truncate redirect_uri,
// state, or PKCE parameters before Atelier can open the URL.
const OAUTH_LOGIN_PTY_COLS: u16 = 2048;
const CODEX_DEVICE_AUTH_URL: &str = "https://auth.openai.com/codex/device";
#[cfg(not(target_os = "windows"))]
const HERMES_INSTALL_SH: &str =
    "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup";
const GAJAE_CODE_PACKAGE_NAME: &str = "gajae-code";

enum OAuthLoginInput {
    Process(ChildStdin),
    Pty(Box<dyn Write + Send>),
}

static OAUTH_LOGIN_STDIN: Lazy<Mutex<HashMap<String, OAuthLoginInput>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Default)]
struct OAuthLoginRuntimeState {
    active: bool,
    browser_opened: bool,
    login_url: Option<String>,
    output: String,
    error: Option<String>,
    updated_at_ms: i64,
}

static OAUTH_LOGIN_RUNTIME: Lazy<Mutex<HashMap<String, OAuthLoginRuntimeState>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static CLI_INSTALL_RUNTIME: Lazy<Mutex<HashMap<String, ProviderCliInstallState>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
#[cfg(target_os = "windows")]
const HERMES_INSTALL_PS1: &str =
    "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1))) -SkipSetup -NonInteractive";
#[cfg(target_os = "windows")]
const CLAUDE_INSTALL_PS1: &str =
    "& ([scriptblock]::Create((irm https://claude.ai/install.ps1))) stable";
#[cfg(target_os = "windows")]
const GAJAE_CODE_INSTALL_PS1: &str = r#"
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $env:BUN_INSTALL, $env:USERPROFILE, $env:GJC_HOME, $env:ATELIER_SKILLS_DIR | Out-Null
$env:Path = "$env:BUN_INSTALL\bin;$env:USERPROFILE\.bun\bin;$env:Path"
$bun = Join-Path $env:BUN_INSTALL 'bin\bun.exe'
if (!(Test-Path $bun)) {
  $installer = Invoke-RestMethod https://bun.sh/install.ps1
  Invoke-Expression $installer
}
if (!(Test-Path $bun)) {
  $fallback = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
  if (Test-Path $fallback) {
    $bun = $fallback
  }
}
if (!(Test-Path $bun)) {
  throw "Bun install completed but bun.exe was not found in the isolated Gajae Code runtime."
}
& $bun install -g gajae-code
"#;
#[cfg(not(target_os = "windows"))]
const GAJAE_CODE_INSTALL_SH: &str = r#"
set -eu
mkdir -p "$BUN_INSTALL" "$HOME" "$GJC_HOME" "$ATELIER_SKILLS_DIR"
export PATH="$BUN_INSTALL/bin:$HOME/.bun/bin:$PATH"
if [ ! -x "$BUN_INSTALL/bin/bun" ]; then
  command -v curl >/dev/null 2>&1 || { echo "curl not found. install curl first." >&2; exit 127; }
  command -v bash >/dev/null 2>&1 || { echo "bash not found. install bash first." >&2; exit 127; }
  curl -fsSL https://bun.sh/install | bash
fi
if [ ! -x "$BUN_INSTALL/bin/bun" ]; then
  echo "Bun install completed but bun was not found in the isolated Gajae Code runtime." >&2
  exit 127
fi
"$BUN_INSTALL/bin/bun" install -g gajae-code
"#;

#[cfg(target_os = "windows")]
fn configure_background_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_background_command(_: &mut Command) {}

fn cli_command(cli: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        crate::agent_process::command_for_cli(cli)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut command = Command::new(cli);
        configure_background_command(&mut command);
        command
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
struct CredentialState {
    oauth_logged_in: bool,
    api_key_present: bool,
    api_key_masked: String,
    updated_at: Option<String>,
}

#[derive(Default, Deserialize, Serialize)]
struct CredentialStateFile {
    providers: HashMap<String, CredentialState>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClaudeSubscriptionOauthCredential {
    pub access: String,
    pub refresh: Option<String>,
    pub expires: Option<i64>,
    pub scopes: Option<String>,
    pub subscription_type: Option<String>,
}

impl ClaudeSubscriptionOauthCredential {
    #[allow(dead_code)]
    pub fn access_is_fresh(&self) -> bool {
        let Some(expires) = self.expires else {
            return true;
        };
        expires > chrono::Utc::now().timestamp_millis() + 60_000
    }
}

/// Provider metadata. Claude/Codex support subscription OAuth and API keys;
/// Linear uses a personal API key and has no local CLI process.
fn provider_meta(provider: &str) -> Option<ProviderMeta> {
    match provider {
        "claude" => Some(ProviderMeta {
            cli: Some("claude"),
            login_cmd: Some("login"),
            env_var: Some("ANTHROPIC_API_KEY"),
            supports_oauth: true,
            supports_api: true,
        }),
        "codex" => Some(ProviderMeta {
            cli: Some("codex"),
            login_cmd: Some("login"),
            env_var: Some("OPENAI_API_KEY"),
            supports_oauth: true,
            supports_api: true,
        }),
        "openrouter" => Some(ProviderMeta {
            cli: None,
            login_cmd: None,
            env_var: Some("OPENROUTER_API_KEY"),
            supports_oauth: false,
            supports_api: true,
        }),
        "linear" => Some(ProviderMeta {
            cli: None,
            login_cmd: None,
            env_var: None,
            supports_oauth: false,
            supports_api: true,
        }),
        "hermes" => Some(ProviderMeta {
            cli: Some("hermes"),
            login_cmd: None,
            env_var: None,
            supports_oauth: false,
            supports_api: false,
        }),
        "gajecode" => Some(ProviderMeta {
            cli: Some(gajecode_cli_name()),
            login_cmd: None,
            env_var: None,
            supports_oauth: false,
            supports_api: false,
        }),
        _ => None,
    }
}

fn oauth_login_attempts(provider: &str, fallback_cmd: &'static str) -> Vec<Vec<&'static str>> {
    match provider {
        "claude" => claude_oauth_login_attempts(),
        // Device authorization is deterministic across packaged Windows apps:
        // the CLI prints a stable HTTPS URL and one-time code that Atelier can
        // surface even when the default browser handoff is restricted.
        "codex" => vec![vec!["login", "--device-auth"], vec![fallback_cmd]],
        _ => vec![vec![fallback_cmd]],
    }
}

fn claude_oauth_login_attempts() -> Vec<Vec<&'static str>> {
    // setup-token is Anthropic's documented automation bridge. It emits an
    // inference-only token without saving it into Claude Code's credential
    // store, so Atelier never needs to read or refresh another app's session.
    vec![vec!["setup-token"], vec!["auth", "login", "--claudeai"]]
}

fn oauth_login_uses_pty(provider: &str) -> bool {
    matches!(provider, "claude" | "codex")
}

fn oauth_login_url_hint(provider: &str, login_args: &[&str]) -> Option<&'static str> {
    (provider == "codex" && login_args.contains(&"--device-auth")).then_some(CODEX_DEVICE_AUTH_URL)
}

fn oauth_browser_probe_url(provider: &str) -> Option<&'static str> {
    match provider {
        "codex" => Some(CODEX_DEVICE_AUTH_URL),
        "claude" => Some("https://claude.ai"),
        _ => None,
    }
}

fn oauth_browser_handoff_contract() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "provider default browser + Atelier URL watcher -> WinRT Launcher -> COM STA / ShellExecuteExW -> explorer.exe -> FileProtocolHandler"
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

fn perform_oauth_browser_probe(provider: &str) -> Result<ProviderBrowserProbeResult, String> {
    let provider = provider.trim().to_ascii_lowercase();
    let url = oauth_browser_probe_url(&provider)
        .ok_or_else(|| format!("unsupported browser probe provider: {provider}"))?;
    if !is_provider_login_url(&provider, url) {
        return Err("browser probe URL failed the provider allowlist".into());
    }
    if !open_login_url_in_browser(url) {
        return Err("native browser handoff failed".into());
    }
    Ok(ProviderBrowserProbeResult {
        provider,
        url: url.to_string(),
        handoff: oauth_browser_handoff_contract().to_string(),
        accepted: true,
        checked_at_ms: oauth_runtime_now_ms(),
    })
}

pub(crate) fn open_oauth_browser_probe(provider: &str) -> Result<(), String> {
    perform_oauth_browser_probe(provider).map(|_| ())
}

#[tauri::command]
pub async fn provider_oauth_browser_probe(
    provider: String,
) -> Result<ProviderBrowserProbeResult, String> {
    tauri::async_runtime::spawn_blocking(move || perform_oauth_browser_probe(&provider))
        .await
        .map_err(|error| format!("browser probe thread join: {error}"))?
}

fn redact_login_output(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            if line.contains("://") {
                "[login url redacted]".to_string()
            } else if lower.contains("sk-ant-oat")
                || lower.contains("access_token")
                || lower.contains("refresh_token")
                || lower.contains("id_token")
                || lower.contains("client_secret")
            {
                "[credential output redacted]".to_string()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn login_failure_detail_text(text: &str) -> String {
    let detail = redact_login_output(text);
    let replacement_count = detail.chars().filter(|c| *c == '\u{fffd}').count();
    if replacement_count >= 3 {
        return "The CLI returned unreadable non-UTF-8 error output. Update the Claude Code CLI, then try the subscription sign-in again.".to_string();
    }
    if detail.chars().count() <= 1200 {
        detail
    } else {
        format!(
            "{}\n... output truncated ...",
            detail.chars().take(1200).collect::<String>()
        )
    }
}

fn oauth_runtime_now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn cli_install_runtime_now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn cli_install_phase_is_active(phase: ProviderCliInstallPhase) -> bool {
    matches!(
        phase,
        ProviderCliInstallPhase::Started | ProviderCliInstallPhase::Running
    )
}

fn cli_install_runtime_snapshot(provider: &str) -> Option<ProviderCliInstallState> {
    CLI_INSTALL_RUNTIME
        .lock()
        .ok()
        .and_then(|map| map.get(provider).cloned())
}

fn begin_cli_install_runtime(
    provider: &str,
) -> Result<ProviderCliInstallState, ProviderCliInstallState> {
    let mut map = CLI_INSTALL_RUNTIME
        .lock()
        .expect("cli install runtime lock poisoned");
    if let Some(existing) = map.get(provider).cloned() {
        if cli_install_phase_is_active(existing.phase) {
            return Err(existing);
        }
    }
    let now = cli_install_runtime_now_ms();
    let state = ProviderCliInstallState {
        provider: provider.to_string(),
        phase: ProviderCliInstallPhase::Started,
        detail: None,
        exit_code: None,
        started_at_ms: now,
        updated_at_ms: now,
    };
    map.insert(provider.to_string(), state.clone());
    Ok(state)
}

fn update_cli_install_runtime(
    provider: &str,
    phase: ProviderCliInstallPhase,
    detail: Option<String>,
    exit_code: Option<i32>,
) -> ProviderCliInstallState {
    let mut map = CLI_INSTALL_RUNTIME
        .lock()
        .expect("cli install runtime lock poisoned");
    let now = cli_install_runtime_now_ms();
    let started_at_ms = map
        .get(provider)
        .map(|state| state.started_at_ms)
        .unwrap_or(now);
    let state = ProviderCliInstallState {
        provider: provider.to_string(),
        phase,
        detail,
        exit_code,
        started_at_ms,
        updated_at_ms: now,
    };
    map.insert(provider.to_string(), state.clone());
    state
}

fn cli_install_success_message(label: &str) -> String {
    format!("{label} CLI install completed and the CLI is now available.")
}

fn cli_install_spawn_error_message(label: &str, error: &str) -> String {
    format!("{label} installer could not start: {error}")
}

fn cli_install_wait_error_message(label: &str, error: &str) -> String {
    format!("{label} installer wait failed: {error}")
}

fn cli_install_exit_message(label: &str, exit_code: Option<i32>) -> String {
    match exit_code {
        Some(code) => format!("{label} installer exited with code {code}."),
        None => format!("{label} installer exited before reporting a code."),
    }
}

fn cli_install_missing_binary_message(label: &str) -> String {
    format!("{label} installer exited successfully but the CLI is still unavailable.")
}

fn cli_install_terminal_state_from_exit(
    label: &str,
    exited_successfully: bool,
    exit_code: Option<i32>,
    cli_available: bool,
) -> (ProviderCliInstallPhase, Option<String>, Option<i32>) {
    if exited_successfully && cli_available {
        (
            ProviderCliInstallPhase::Succeeded,
            Some(cli_install_success_message(label)),
            exit_code,
        )
    } else if exited_successfully {
        (
            ProviderCliInstallPhase::Failed,
            Some(cli_install_missing_binary_message(label)),
            exit_code,
        )
    } else {
        (
            ProviderCliInstallPhase::Failed,
            Some(cli_install_exit_message(label, exit_code)),
            exit_code,
        )
    }
}

fn cli_install_terminal_state_from_result(
    label: &str,
    wait_result: io::Result<ExitStatus>,
    cli_available: bool,
) -> (ProviderCliInstallPhase, Option<String>, Option<i32>) {
    match wait_result {
        Ok(status) => cli_install_terminal_state_from_exit(
            label,
            status.success(),
            status.code(),
            cli_available,
        ),
        Err(error) => (
            ProviderCliInstallPhase::Failed,
            Some(cli_install_wait_error_message(label, &error.to_string())),
            None,
        ),
    }
}

fn start_oauth_login_runtime(provider: &str) {
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        map.insert(
            provider.to_string(),
            OAuthLoginRuntimeState {
                active: true,
                updated_at_ms: oauth_runtime_now_ms(),
                ..Default::default()
            },
        );
    }
}

fn finish_oauth_login_runtime(provider: &str) {
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        entry.active = false;
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

fn fail_oauth_login_runtime(provider: &str, error: String) {
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        entry.active = false;
        entry.error = Some(error);
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

fn oauth_login_error(provider: &str, error: String) -> String {
    fail_oauth_login_runtime(provider, error.clone());
    error
}

fn remember_oauth_browser_opened(provider: &str, opened: bool) {
    if !opened {
        return;
    }
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        entry.browser_opened = true;
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

fn remember_oauth_login_url(provider: &str, url: &str) {
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        entry.login_url = Some(url.to_string());
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

fn refresh_oauth_login_runtime(provider: &str, captured: &Arc<Mutex<String>>) {
    let raw = captured_login_output(captured);
    let login_url = extract_provider_login_url(provider, &raw);
    let output = login_failure_detail_text(&raw).trim().to_string();
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        if let Some(url) = login_url {
            entry.login_url = Some(url);
        }
        entry.output = output;
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

fn spawn_oauth_login_runtime_watcher(provider: String, captured: Arc<Mutex<String>>) {
    thread::spawn(move || {
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(5 * 60) {
            refresh_oauth_login_runtime(&provider, &captured);
            let active = OAUTH_LOGIN_RUNTIME
                .lock()
                .ok()
                .and_then(|map| map.get(&provider).map(|state| state.active))
                .unwrap_or(false);
            if !active {
                break;
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
}

fn oauth_login_runtime_snapshot(provider: &str) -> OAuthLoginRuntimeState {
    OAUTH_LOGIN_RUNTIME
        .lock()
        .ok()
        .and_then(|map| map.get(provider).cloned())
        .unwrap_or_default()
}

fn oauth_login_result_extras(provider: &str) -> (Option<String>, Option<String>) {
    let snapshot = oauth_login_runtime_snapshot(provider);
    let diagnostic = (!snapshot.output.trim().is_empty()).then_some(snapshot.output);
    (snapshot.login_url, diagnostic)
}

fn strip_ansi_sequences(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            if !ch.is_control() || matches!(ch, '\n' | '\r' | '\t') {
                out.push(ch);
            }
            continue;
        }

        match chars.peek().copied() {
            Some('[') => {
                chars.next();
                for code in chars.by_ref() {
                    if ('@'..='~').contains(&code) {
                        break;
                    }
                }
            }
            Some(']') => {
                chars.next();
                let mut previous = '\0';
                for code in chars.by_ref() {
                    if code == '\u{7}' || (previous == '\u{1b}' && code == '\\') {
                        break;
                    }
                    previous = code;
                }
            }
            _ => {}
        }
    }

    out
}

fn login_url_start(text: &str) -> Option<usize> {
    match (text.find("https://"), text.find("http://")) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

fn login_url_delimiter(ch: char) -> bool {
    ch.is_whitespace()
        || ch.is_control()
        || matches!(
            ch,
            '"' | '\'' | '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';'
        )
}

fn trim_login_url_candidate(candidate: &str) -> &str {
    candidate.trim_matches(|c: char| {
        matches!(
            c,
            '"' | '\'' | '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';' | '.'
        )
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LoginUrlCandidate {
    url: String,
    terminated: bool,
}

fn extract_login_url_candidate_meta(text: &str) -> Option<LoginUrlCandidate> {
    let mut offset = 0;
    while offset < text.len() {
        let search = &text[offset..];
        let Some(start_rel) = login_url_start(search) else {
            break;
        };
        let start = offset + start_rel;
        let mut end = text.len();
        let mut terminated = false;
        for (rel, ch) in text[start..].char_indices().skip(1) {
            if login_url_delimiter(ch) {
                end = start + rel;
                terminated = true;
                break;
            }
        }

        let candidate = trim_login_url_candidate(&text[start..end]);
        if candidate.starts_with("https://") || candidate.starts_with("http://") {
            return Some(LoginUrlCandidate {
                url: candidate.to_string(),
                terminated,
            });
        }

        offset = end.saturating_add(1);
    }
    None
}

#[cfg(test)]
fn extract_login_url_candidate(text: &str) -> Option<String> {
    extract_login_url_candidate_meta(text).map(|candidate| candidate.url)
}

#[cfg(test)]
fn extract_login_url(text: &str) -> Option<String> {
    // Terminal CLIs often emit clickable OSC-8 hyperlinks. The ANSI stripper
    // discards OSC payloads, so first scan the raw stream and only then scan a
    // cleaned plain-text copy.
    extract_login_url_candidate(text).or_else(|| {
        let text = strip_ansi_sequences(text);
        extract_login_url_candidate(&text)
    })
}

fn is_provider_login_url(provider: &str, url: &str) -> bool {
    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    let Some(host) = parsed.host_str().map(str::to_ascii_lowercase) else {
        return false;
    };
    let allowed_roots: &[&str] = match provider {
        "claude" => &["claude.ai", "claude.com", "anthropic.com"],
        "codex" => &["openai.com", "chatgpt.com"],
        _ => return false,
    };
    allowed_roots
        .iter()
        .any(|root| host == *root || host.ends_with(&format!(".{root}")))
}

fn extract_provider_login_url_with_mode(
    provider: &str,
    text: &str,
    require_terminated: bool,
) -> Option<String> {
    let mut remaining = text;
    while let Some(candidate) = extract_login_url_candidate_meta(remaining) {
        if (!require_terminated || candidate.terminated)
            && is_provider_login_url(provider, &candidate.url)
        {
            return Some(candidate.url);
        }
        let Some(position) = remaining.find(&candidate.url) else {
            break;
        };
        remaining = &remaining[position + candidate.url.len()..];
    }

    let stripped = strip_ansi_sequences(text);
    let mut remaining = stripped.as_str();
    while let Some(candidate) = extract_login_url_candidate_meta(remaining) {
        if (!require_terminated || candidate.terminated)
            && is_provider_login_url(provider, &candidate.url)
        {
            return Some(candidate.url);
        }
        let Some(position) = remaining.find(&candidate.url) else {
            break;
        };
        remaining = &remaining[position + candidate.url.len()..];
    }
    None
}

fn extract_provider_login_url(provider: &str, text: &str) -> Option<String> {
    // PTY reads can split one long OAuth URL across chunks. Do not open a
    // candidate until a delimiter proves that the complete URL arrived.
    extract_provider_login_url_with_mode(provider, text, true)
}

fn extract_provider_login_url_relaxed(provider: &str, text: &str) -> Option<String> {
    extract_provider_login_url_with_mode(provider, text, false)
}

fn captured_login_output(captured: &Arc<Mutex<String>>) -> String {
    captured.lock().map(|text| text.clone()).unwrap_or_default()
}

fn store_oauth_login_stdin(provider: &str, stdin: ChildStdin) {
    if let Ok(mut map) = OAUTH_LOGIN_STDIN.lock() {
        map.insert(provider.to_string(), OAuthLoginInput::Process(stdin));
    }
}

fn store_oauth_login_pty_writer(provider: &str, writer: Box<dyn Write + Send>) {
    if let Ok(mut map) = OAUTH_LOGIN_STDIN.lock() {
        map.insert(provider.to_string(), OAuthLoginInput::Pty(writer));
    }
}

fn forget_oauth_login_stdin(provider: &str) {
    if let Ok(mut map) = OAUTH_LOGIN_STDIN.lock() {
        map.remove(provider);
    }
}

fn capture_login_pipe<R>(mut reader: R, captured: Arc<Mutex<String>>)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut buf = [0_u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    if let Ok(mut text) = captured.lock() {
                        text.push_str(&chunk);
                        if text.len() > 64 * 1024 {
                            let keep_from = text.len().saturating_sub(32 * 1024);
                            *text = text[keep_from..].to_string();
                        }
                    }
                }
            }
        }
    });
}

fn spawn_background_null(mut command: Command) -> bool {
    configure_background_command(&mut command);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .is_ok()
}

#[cfg(target_os = "windows")]
fn windows_runtime_launch_url(url: &str) -> bool {
    use windows::core::HSTRING;
    use windows::Foundation::Uri;
    use windows::System::Launcher;
    use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_SINGLETHREADED};

    let target_url = url.to_string();
    thread::Builder::new()
        .name("atelier-oauth-browser-winrt".into())
        .spawn(move || unsafe {
            // LaunchUriAsync is the Windows-supported URI activation path for
            // both unpackaged desktop and Store applications. Keep it on a
            // dedicated WinRT STA so Tauri's async worker apartment cannot
            // affect protocol activation.
            if RoInitialize(RO_INIT_SINGLETHREADED).is_err() {
                return false;
            }
            let launched = Uri::CreateUri(&HSTRING::from(target_url))
                .and_then(|uri| Launcher::LaunchUriAsync(&uri))
                .and_then(|operation| operation.get())
                .unwrap_or(false);
            RoUninitialize();
            launched
        })
        .ok()
        .and_then(|worker| worker.join().ok())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn windows_shell_execute_url(url: &str) -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
    };
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(value: &str) -> Vec<u16> {
        OsStr::new(value).encode_wide().chain(Some(0)).collect()
    }

    let target_url = url.to_string();
    let worker = thread::Builder::new()
        .name("atelier-oauth-browser-sta".into())
        .spawn(move || {
            let operation = wide("open");
            let target = wide(&target_url);
            let mut execute = SHELLEXECUTEINFOW {
                cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
                fMask: SEE_MASK_NOASYNC,
                lpVerb: operation.as_ptr(),
                lpFile: target.as_ptr(),
                nShow: SW_SHOWNORMAL,
                ..Default::default()
            };
            unsafe {
                // Tauri async commands can run on an MTA worker. Shell URL
                // activation is moved to a fresh STA so COM initialization
                // cannot silently inherit an incompatible apartment model.
                let com_result = CoInitializeEx(
                    std::ptr::null(),
                    (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32,
                );
                if com_result < 0 {
                    return false;
                }
                let opened = ShellExecuteExW(&mut execute) != 0;
                CoUninitialize();
                opened
            }
        });

    worker
        .ok()
        .and_then(|worker| worker.join().ok())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn oauth_browser_helper_path() -> Option<PathBuf> {
    let helper = PathBuf::from("/usr/bin/open");
    helper.is_file().then_some(helper)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn oauth_browser_helper_path() -> Option<PathBuf> {
    ["/usr/bin/xdg-open", "/bin/xdg-open"]
        .into_iter()
        .map(PathBuf::from)
        .find(|path| path.is_file())
}

fn configure_login_browser_env_for_command(command: &mut Command) {
    #[cfg(target_os = "windows")]
    command.env_remove("BROWSER");
    #[cfg(not(target_os = "windows"))]
    if let Some(helper) = oauth_browser_helper_path() {
        command.env("BROWSER", helper);
    }
    command.env("ATELIER_OAUTH_BROWSER", "1");
}

fn configure_login_browser_env_for_pty(cmd: &mut CommandBuilder) {
    #[cfg(target_os = "windows")]
    cmd.env_remove("BROWSER");
    #[cfg(not(target_os = "windows"))]
    if let Some(helper) = oauth_browser_helper_path() {
        cmd.env("BROWSER", helper.to_string_lossy().into_owned());
    }
    cmd.env("ATELIER_OAUTH_BROWSER", "1");
}

fn open_login_url_in_browser(url: &str) -> bool {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        if windows_runtime_launch_url(url) {
            return true;
        }
        if windows_shell_execute_url(url) {
            return true;
        }
        let mut explorer = Command::new("explorer.exe");
        explorer.arg(url);
        if spawn_background_null(explorer) {
            return true;
        }
        let mut rundll32 = Command::new("rundll32.exe");
        rundll32.args(["url.dll,FileProtocolHandler", url]);
        if spawn_background_null(rundll32) {
            return true;
        }
        false
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg(url);
        spawn_background_null(command)
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        return spawn_background_null(command);
    }
}

fn provider_for_oauth_login_url(url: &str) -> Option<&'static str> {
    ["claude", "codex"]
        .into_iter()
        .find(|provider| is_provider_login_url(provider, url))
}

pub(crate) fn open_oauth_browser_helper_url(url: &str) -> Result<(), String> {
    let provider = provider_for_oauth_login_url(url)
        .ok_or_else(|| "OAuth browser helper rejected a non-provider HTTPS URL".to_string())?;
    if open_login_url_in_browser(url) {
        remember_oauth_login_url(provider, url);
        remember_oauth_browser_opened(provider, true);
        Ok(())
    } else {
        Err("OAuth browser helper could not hand the URL to the default browser".into())
    }
}

fn watch_and_open_login_url(provider: String, captured: Arc<Mutex<String>>) {
    thread::spawn(move || {
        let started = Instant::now();
        let mut pending_url: Option<String> = None;
        let mut pending_since = Instant::now();
        let mut pending_output_len = 0;
        while started.elapsed() < Duration::from_secs(90) {
            let output = captured_login_output(&captured);
            if let Some(url) = extract_provider_login_url(&provider, &output) {
                remember_oauth_login_url(&provider, &url);
                let opened = open_login_url_in_browser(&url);
                remember_oauth_browser_opened(&provider, opened);
                break;
            }
            if let Some(url) = extract_provider_login_url_relaxed(&provider, &output) {
                let unchanged = pending_url.as_deref() == Some(url.as_str())
                    && pending_output_len == output.len();
                if unchanged && pending_since.elapsed() >= Duration::from_millis(500) {
                    remember_oauth_login_url(&provider, &url);
                    let opened = open_login_url_in_browser(&url);
                    remember_oauth_browser_opened(&provider, opened);
                    break;
                }
                if !unchanged {
                    pending_url = Some(url);
                    pending_output_len = output.len();
                    pending_since = Instant::now();
                }
            }
            thread::sleep(Duration::from_millis(250));
        }
    });
}

fn oauth_pty_login_command(cli: &str, login_args: &[&str]) -> CommandBuilder {
    #[cfg(target_os = "windows")]
    {
        // Use the same native-executable/npm-shim resolver as normal agent
        // execution. The old raw `cmd.exe /C <name>` path caused Win32 error
        // 193 and could stall before an OAuth URL was emitted.
        let (program, prefix_args) = crate::agent_process::windows_cli_command_parts(cli);
        let mut cmd = CommandBuilder::new(program);
        cmd.args(prefix_args);
        cmd.args(login_args);
        if let Some(git_bash) = crate::agent_process::windows_git_bash_path() {
            cmd.env(
                "CLAUDE_CODE_GIT_BASH_PATH",
                git_bash.to_string_lossy().into_owned(),
            );
        }
        configure_login_pty_env(&mut cmd);
        cmd
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = CommandBuilder::new(cli);
        cmd.args(login_args);
        configure_login_pty_env(&mut cmd);
        cmd
    }
}

fn configure_login_pty_env(cmd: &mut CommandBuilder) {
    cmd.env("PATH", crate::augmented_cli_path());
    cmd.env("TERM", "xterm");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_CTYPE", "en_US.UTF-8");
    configure_login_browser_env_for_pty(cmd);
}

fn extract_claude_oauth_token_from_text(text: &str) -> Option<String> {
    text.split_whitespace().find_map(|token| {
        let token = token.trim_matches(|c: char| {
            matches!(
                c,
                '"' | '\'' | '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';'
            )
        });
        token.contains("sk-ant-oat").then(|| token.to_string())
    })
}

fn cache_claude_oauth_token(token: &str) -> bool {
    let token = token.trim();
    if !token.contains("sk-ant-oat") {
        return false;
    }
    if let Ok(entry) = keychain_entry("claude", "oauth_token") {
        if entry.set_password(token).is_ok() {
            set_oauth_state("claude", true);
            return true;
        }
    }
    false
}

fn cache_claude_setup_token_from_output(text: &str) -> bool {
    extract_claude_oauth_token_from_text(text).is_some_and(|token| cache_claude_oauth_token(&token))
}

fn mark_oauth_login_success(provider: &str, captured: &Arc<Mutex<String>>) {
    set_oauth_state(provider, true);
    if provider == "claude" {
        // Only setup-token output crosses into Atelier's own credential store.
        // A normal Claude CLI login remains entirely provider-owned.
        let output = captured_login_output(captured);
        let _ = cache_claude_setup_token_from_output(&output);
    }
}

fn oauth_logout_args(provider: &str) -> Option<Vec<&'static str>> {
    match provider {
        "claude" => Some(vec!["auth", "logout"]),
        "codex" => Some(vec!["logout"]),
        _ => None,
    }
}

fn run_oauth_logout(provider: &str, cli: &str) -> Result<(), String> {
    let Some(args) = oauth_logout_args(provider) else {
        return Ok(());
    };
    let label = args.join(" ");
    let mut command = cli_command(cli);
    command.args(&args).env("PATH", crate::augmented_cli_path());
    match command_output_timeout(command, Duration::from_secs(8)) {
        Ok(Some(output)) if output.status.success() => Ok(()),
        Ok(Some(output)) => {
            let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
            if !combined.is_empty() {
                combined.push('\n');
            }
            combined.push_str(&String::from_utf8_lossy(&output.stderr));
            let detail = combined.trim();
            if detail.is_empty() {
                Err(format!("{cli} {label} exited with {}", output.status))
            } else {
                Err(format!(
                    "{cli} {label} exited with {}: {detail}",
                    output.status
                ))
            }
        }
        Ok(None) => Err(format!("{cli} {label} timed out")),
        Err(e) => Err(format!("{cli} {label}: {e}")),
    }
}

fn run_gajecode_oauth_logout() -> Result<(), String> {
    let mut command = gajecode_isolated_cli_command()?;
    command.arg("logout");
    match command_output_timeout(command, Duration::from_secs(8)) {
        Ok(Some(output)) if output.status.success() => Ok(()),
        Ok(Some(output)) => {
            let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
            if !combined.is_empty() {
                combined.push('\n');
            }
            combined.push_str(&String::from_utf8_lossy(&output.stderr));
            let detail = combined.trim();
            if detail.is_empty() {
                Err(format!(
                    "{} logout exited with {}",
                    gajecode_cli_name(),
                    output.status
                ))
            } else {
                Err(format!(
                    "{} logout exited with {}: {detail}",
                    gajecode_cli_name(),
                    output.status
                ))
            }
        }
        Ok(None) => Err(format!("{} logout timed out", gajecode_cli_name())),
        Err(e) => Err(format!("{} logout: {e}", gajecode_cli_name())),
    }
}

struct ProviderMeta {
    cli: Option<&'static str>,
    login_cmd: Option<&'static str>,
    env_var: Option<&'static str>,
    supports_oauth: bool,
    supports_api: bool,
}

#[derive(Serialize)]
pub struct ProviderStatus {
    pub provider: String,
    /// CLI binary 가 PATH 에 있나 (claude/codex/hermes)
    pub cli_installed: bool,
    /// 최근 자동 설치 런타임 상태. 설치를 시도하지 않았으면 None.
    pub install_state: Option<ProviderCliInstallState>,
    /// CLI 가 OAuth 로그인된 상태로 보이나 (가능한 경우만 검사)
    pub oauth_logged_in: bool,
    /// API 키가 keychain에 저장되어 있나 (값은 노출 X)
    pub api_key_present: bool,
    /// API 키 마스킹 표시 (`sk-…abcd`). 없으면 빈 문자열.
    pub api_key_masked: String,
    pub supports_oauth: bool,
    pub supports_api: bool,
}

#[derive(Serialize)]
pub struct ProviderLoginOauthResult {
    pub provider: String,
    pub command: String,
    pub started: bool,
    pub completed: bool,
    pub already_logged_in: bool,
    pub browser_opened: bool,
    pub login_url_detected: bool,
    pub login_url: Option<String>,
    pub diagnostic: Option<String>,
    pub message: String,
}

#[derive(Serialize)]
pub struct ProviderOauthLoginState {
    pub provider: String,
    pub active: bool,
    pub browser_opened: bool,
    pub login_url: Option<String>,
    pub output: String,
    pub error: Option<String>,
    pub updated_at_ms: i64,
}

#[derive(Serialize)]
pub struct ProviderBrowserProbeResult {
    pub provider: String,
    pub url: String,
    pub handoff: String,
    pub accepted: bool,
    pub checked_at_ms: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderCliInstallPhase {
    Started,
    Running,
    Succeeded,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ProviderCliInstallState {
    pub provider: String,
    pub phase: ProviderCliInstallPhase,
    pub detail: Option<String>,
    pub exit_code: Option<i32>,
    pub started_at_ms: i64,
    pub updated_at_ms: i64,
}

fn keychain_entry(provider: &str, slot: &str) -> Result<Entry, String> {
    let username = format!("{provider}.{slot}");
    Entry::new(SERVICE, &username).map_err(|e| format!("keychain entry: {e}"))
}

#[cfg(target_os = "macos")]
fn keychain_username(provider: &str, slot: &str) -> String {
    format!("{provider}.{slot}")
}

fn keychain_item_exists(provider: &str, slot: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        let username = keychain_username(provider, slot);
        Command::new("/usr/bin/security")
            .args(["find-generic-password", "-s", SERVICE, "-a", &username])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (provider, slot);
        false
    }
}

fn mask_key(key: &str) -> String {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let len = trimmed.chars().count();
    if len <= 8 {
        return "•".repeat(len);
    }
    let chars: Vec<char> = trimmed.chars().collect();
    let head: String = chars[..4].iter().collect();
    let tail: String = chars[len - 4..].iter().collect();
    format!("{head}…{tail}")
}

fn app_support_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("APPDATA")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(PathBuf::from)?;
        Some(base.join("com.atelier.app"))
    }

    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME").map(PathBuf::from)?;
        Some(home.join("Library/Application Support/com.atelier.app"))
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
        Some(base.join("com.atelier.app"))
    }
}

pub fn gajecode_cli_name() -> &'static str {
    "gjc"
}

pub fn gajecode_provider_root() -> Option<PathBuf> {
    Some(app_support_dir()?.join("providers").join("gajecode"))
}

pub fn gajecode_home_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("home"))
}

pub fn gajecode_workspace_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("workspace"))
}

pub fn gajecode_skills_dir() -> Option<PathBuf> {
    Some(gajecode_home_dir()?.join(".gjc").join("skills"))
}

fn gajecode_agent_dir() -> Option<PathBuf> {
    Some(gajecode_home_dir()?.join(".gjc").join("agent"))
}

fn ensure_gajecode_models_config(agent_dir: &Path) -> Result<(), String> {
    let path = agent_dir.join("models.yml");
    let content = r#"# Atelier managed default for the isolated Gajae Code runtime.
# Claude subscription OAuth is passed only to the child process through
# ANTHROPIC_OAUTH_TOKEN. Atelier stores only the inference-only token generated
# by the official `claude setup-token` command and never stores a refresh token.
providers: {}
"#;
    if path.exists() {
        if let Ok(existing) = std::fs::read_to_string(&path) {
            let is_atelier_managed = existing.contains("Atelier managed default")
                && existing.contains("ANTHROPIC_OAUTH_TOKEN");
            if is_atelier_managed && existing != content {
                std::fs::write(&path, content)
                    .map_err(|e| format!("write {}: {e}", path.display()))?;
            }
        }
        return Ok(());
    }
    std::fs::create_dir_all(agent_dir)
        .map_err(|e| format!("create {}: {e}", agent_dir.display()))?;
    std::fs::write(&path, content).map_err(|e| format!("write {}: {e}", path.display()))
}

fn gajecode_bun_install_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("bun"))
}

fn gajecode_bun_executable_path() -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") {
        "bun.exe"
    } else {
        "bun"
    };
    let direct = gajecode_bun_install_dir()?.join("bin").join(name);
    direct
        .is_file()
        .then(|| std::fs::canonicalize(&direct).unwrap_or(direct))
}

pub fn gajecode_config_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("xdg-config"))
}

pub fn gajecode_data_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("xdg-data"))
}

pub fn gajecode_cache_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("xdg-cache"))
}

fn gajecode_bin_dirs() -> Vec<PathBuf> {
    let Some(bun_install) = gajecode_bun_install_dir() else {
        return Vec::new();
    };
    let mut dirs = vec![bun_install.join("bin")];
    if let Some(home) = gajecode_home_dir() {
        dirs.push(home.join(".bun").join("bin"));
    }
    dirs
}

pub fn gajecode_executable_path() -> Option<PathBuf> {
    let cli_name = gajecode_cli_name();
    let names = {
        #[cfg(target_os = "windows")]
        {
            let mut names = vec![cli_name.to_string()];
            names.push(format!("{cli_name}.cmd"));
            names.push(format!("{cli_name}.ps1"));
            names.push(format!("{cli_name}.exe"));
            names.push("gajae-code.cmd".to_string());
            names.push("gajae-code.exe".to_string());
            names
        }
        #[cfg(not(target_os = "windows"))]
        {
            vec![cli_name.to_string()]
        }
    };
    for dir in gajecode_bin_dirs() {
        for name in &names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(std::fs::canonicalize(&candidate).unwrap_or(candidate));
            }
        }
    }
    None
}

fn gajecode_cli_installed() -> bool {
    gajecode_executable_path().is_some()
}

fn claude_cli_installed() -> bool {
    cli_runs_for_provider("claude", "claude")
}

fn codex_cli_installed() -> bool {
    cli_runs_for_provider("codex", "codex")
}

fn hermes_cli_installed() -> bool {
    cli_runs_for_provider("hermes", "hermes")
}

pub fn gajecode_runtime_path_env() -> String {
    let mut paths = gajecode_bin_dirs();
    paths.extend(std::env::split_paths(&crate::augmented_cli_path()));
    let mut unique = Vec::new();
    for path in paths {
        if !unique.iter().any(|seen| seen == &path) {
            unique.push(path);
        }
    }
    std::env::join_paths(unique)
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|_| crate::augmented_cli_path())
}

pub fn configure_gajecode_runtime_env(command: &mut Command) -> Result<(), String> {
    let root = gajecode_provider_root()
        .ok_or_else(|| "Could not resolve the 가재코드 provider directory.".to_string())?;
    let home = gajecode_home_dir()
        .ok_or_else(|| "Could not resolve the 가재코드 HOME directory.".to_string())?;
    let workspace = gajecode_workspace_dir()
        .ok_or_else(|| "Could not resolve the 가재코드 workspace directory.".to_string())?;
    let skills = gajecode_skills_dir()
        .ok_or_else(|| "Could not resolve the 가재코드 skills directory.".to_string())?;
    let config = gajecode_config_dir()
        .ok_or_else(|| "Could not resolve the 가재코드 config directory.".to_string())?;
    let data = gajecode_data_dir()
        .ok_or_else(|| "Could not resolve the 가재코드 data directory.".to_string())?;
    let cache = gajecode_cache_dir()
        .ok_or_else(|| "Could not resolve the 가재코드 cache directory.".to_string())?;
    let agent_dir = gajecode_agent_dir()
        .ok_or_else(|| "Could not resolve the 가재코드 agent directory.".to_string())?;
    let bun_install = gajecode_bun_install_dir()
        .ok_or_else(|| "Could not resolve the 가재코드 Bun install directory.".to_string())?;
    for dir in [
        &root,
        &home,
        &workspace,
        &skills,
        &config,
        &data,
        &cache,
        &agent_dir,
        &bun_install,
    ] {
        std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    }
    ensure_gajecode_models_config(&agent_dir)?;
    let gjc_home = home.join(".gjc");
    command
        .env("PATH", gajecode_runtime_path_env())
        .env("HOME", &home)
        .env("USERPROFILE", &home)
        .env("XDG_CONFIG_HOME", &config)
        .env("XDG_DATA_HOME", &data)
        .env("XDG_CACHE_HOME", &cache)
        .env("BUN_INSTALL", &bun_install)
        .env("GJC_HOME", &gjc_home)
        .env("GAJAE_CODE_HOME", &gjc_home)
        .env("GJC_CODING_AGENT_DIR", &agent_dir)
        .env("ATELIER_PROVIDER_ID", "gajecode")
        .env("ATELIER_SKILLS_DIR", &skills);
    Ok(())
}

fn gajecode_isolated_cli_command() -> Result<Command, String> {
    let executable = gajecode_executable_path().ok_or_else(|| {
        "가재코드 CLI가 설치되어 있지 않습니다. 자동 설치를 먼저 실행하세요.".to_string()
    })?;
    let mut command = cli_command(&executable.to_string_lossy());
    configure_gajecode_runtime_env(&mut command)?;
    Ok(command)
}

fn credential_state_path() -> Option<PathBuf> {
    Some(app_support_dir()?.join("credential-state.json"))
}

fn load_credential_state_file() -> CredentialStateFile {
    let Some(path) = credential_state_path() else {
        return CredentialStateFile::default();
    };
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<CredentialStateFile>(&text).ok())
        .unwrap_or_default()
}

fn save_credential_state_file(state: &CredentialStateFile) -> Result<(), String> {
    let Some(path) = credential_state_path() else {
        return Ok(());
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("credential state mkdir: {e}"))?;
    }
    let text =
        serde_json::to_string_pretty(state).map_err(|e| format!("credential state json: {e}"))?;
    std::fs::write(&path, text).map_err(|e| format!("credential state write: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(&path) {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o600);
            let _ = std::fs::set_permissions(&path, permissions);
        }
    }
    Ok(())
}

fn credential_state(provider: &str) -> CredentialState {
    load_credential_state_file()
        .providers
        .remove(provider)
        .unwrap_or_default()
}

fn update_credential_state<F>(provider: &str, update: F) -> Result<(), String>
where
    F: FnOnce(&mut CredentialState),
{
    let mut file = load_credential_state_file();
    let state = file.providers.entry(provider.to_string()).or_default();
    update(state);
    state.updated_at = Some(chrono::Utc::now().to_rfc3339());
    save_credential_state_file(&file)
}

fn set_oauth_state(provider: &str, logged_in: bool) {
    let _ = update_credential_state(provider, |state| {
        state.oauth_logged_in = logged_in;
    });
}

fn set_api_key_state(provider: &str, key: Option<&str>) {
    let _ = update_credential_state(provider, |state| {
        if let Some(key) = key {
            state.api_key_present = true;
            state.api_key_masked = mask_key(key);
        } else {
            state.api_key_present = false;
            state.api_key_masked.clear();
        }
    });
}

fn is_valid_api_key_for_provider(provider: &str, value: &str) -> bool {
    let key = value.trim();
    if key.is_empty() || key.contains('#') || key.chars().any(char::is_whitespace) {
        return false;
    }
    match provider {
        "claude" => {
            key.starts_with("sk-ant-api")
                || (key.starts_with("sk-ant-") && !key.starts_with("sk-ant-oat"))
        }
        "codex" => key.starts_with("sk-"),
        "openrouter" => key.starts_with("sk-or-v1-"),
        // Linear does not document a stable personal-key prefix. Keep the
        // validation structural and let the authenticated viewer query be the
        // authority, without ever exposing the key to the renderer again.
        "linear" => key.len() >= 20 && key.len() <= 512,
        _ => true,
    }
}

fn which(cli: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        crate::command_exists_in_augmented_path(cli)
    }

    #[cfg(not(target_os = "windows"))]
    {
        // 빠른 PATH 검사. Unix 는 command -v.
        let mut command = Command::new("sh");
        command.arg("-c").arg(format!("command -v {cli}"));
        configure_background_command(&mut command);
        let res = command.env("PATH", crate::augmented_cli_path()).output();
        matches!(res, Ok(o) if o.status.success())
    }
}

fn cli_runs_for_provider(provider: &str, cli: &str) -> bool {
    if !which(cli) {
        return false;
    }

    // `command -v` only proves that a shim exists. npm-installed agent CLIs can
    // still be broken when their native vendor binary is missing, which makes
    // OAuth look like a browser failure even though the CLI never starts.
    if !matches!(provider, "claude" | "codex") {
        return true;
    }

    let mut command = cli_command(cli);
    command
        .arg("--version")
        .env("PATH", crate::augmented_cli_path());
    matches!(
        command_output_timeout(command, Duration::from_secs(3)),
        Ok(Some(output)) if output.status.success()
    )
}

fn provider_cli_installed(provider: &str, meta: &ProviderMeta) -> bool {
    match provider {
        "claude" => claude_cli_installed(),
        "codex" => codex_cli_installed(),
        "hermes" => hermes_cli_installed(),
        "gajecode" => gajecode_cli_installed(),
        _ => meta
            .cli
            .map(|cli| cli_runs_for_provider(provider, cli))
            .unwrap_or(false),
    }
}

fn command_output_timeout(mut command: Command, timeout: Duration) -> io::Result<Option<Output>> {
    configure_background_command(&mut command);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn()?;
    let start = Instant::now();
    loop {
        if child.try_wait()?.is_some() {
            return child.wait_with_output().map(Some);
        }
        if start.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(None);
        }
        thread::sleep(Duration::from_millis(40));
    }
}

fn detect_oauth(provider: &str) -> bool {
    if provider == "claude" && keychain_item_exists("claude", "oauth_token") {
        set_oauth_state(provider, true);
        return true;
    }

    if provider == "codex" && cli_runs_for_provider(provider, "codex") {
        let mut command = cli_command("codex");
        command
            .args(["login", "status"])
            .env("PATH", crate::augmented_cli_path());
        let status = command_output_timeout(command, Duration::from_secs(3));
        if let Ok(output) = status {
            let Some(output) = output else {
                return credential_state(provider).oauth_logged_in;
            };
            let logged_in = {
                let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
                combined.push('\n');
                combined.push_str(&String::from_utf8_lossy(&output.stderr));
                output.status.success() && combined.to_ascii_lowercase().contains("logged in")
            };
            set_oauth_state(provider, logged_in);
            return logged_in;
        }
    }

    if provider == "claude" && cli_runs_for_provider(provider, "claude") {
        let mut command = cli_command("claude");
        command
            .args(["auth", "status"])
            .env("PATH", crate::augmented_cli_path());
        let status = command_output_timeout(command, Duration::from_secs(3));
        if let Ok(output) = status {
            let Some(output) = output else {
                return credential_state(provider).oauth_logged_in;
            };
            let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
            combined.push('\n');
            combined.push_str(&String::from_utf8_lossy(&output.stderr));
            let logged_in = output.status.success()
                && serde_json::from_str::<Value>(&combined)
                    .ok()
                    .and_then(|value| value.get("loggedIn").and_then(Value::as_bool))
                    .unwrap_or_else(|| combined.to_ascii_lowercase().contains("loggedin\": true"));
            set_oauth_state(provider, logged_in);
            return logged_in;
        }
    }

    // OAuth 상태는 CLI 별로 다르다. Codex는 위에서 실제 CLI 상태를 확인하고,
    // Claude도 가능한 경우 CLI 상태를 확인한다. 설정 화면은 Keychain을 읽지 않고
    // 앱의 비밀 없는 상태 파일만 사용해 macOS 암호 프롬프트를 피한다.
    credential_state(provider).oauth_logged_in || keychain_item_exists(provider, "oauth_marker")
}

fn value_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn value_i64(value: Option<&Value>) -> Option<i64> {
    value.and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
            .or_else(|| value.as_str()?.trim().parse::<i64>().ok())
    })
}

fn value_string_or_array(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        let text = text.trim();
        return (!text.is_empty()).then(|| text.to_string());
    }
    let array = value.as_array()?;
    let joined = array
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    (!joined.is_empty()).then_some(joined)
}

fn claude_oauth_credential_from_value(value: &Value) -> Option<ClaudeSubscriptionOauthCredential> {
    let oauth = value
        .get("claudeAiOauth")
        .or_else(|| value.get("oauth"))
        .or_else(|| value.get("tokens"))
        .unwrap_or(value);

    let access = value_string(
        oauth
            .get("accessToken")
            .or_else(|| oauth.get("access_token"))
            .or_else(|| oauth.get("access")),
    )
    .filter(|token| token.contains("sk-ant-oat"))?;
    let refresh = value_string(
        oauth
            .get("refreshToken")
            .or_else(|| oauth.get("refresh_token"))
            .or_else(|| oauth.get("refresh")),
    );
    let expires = value_i64(
        oauth
            .get("expiresAt")
            .or_else(|| oauth.get("expires_at"))
            .or_else(|| oauth.get("expires")),
    );
    let scopes = value_string_or_array(oauth.get("scopes").or_else(|| oauth.get("scope")));
    let subscription_type = value_string(
        oauth
            .get("subscriptionType")
            .or_else(|| oauth.get("subscription_type")),
    );

    Some(ClaudeSubscriptionOauthCredential {
        access,
        refresh,
        expires,
        scopes,
        subscription_type,
    })
}

#[allow(dead_code)]
fn claude_oauth_token_from_value(value: &Value) -> Option<String> {
    let credential = claude_oauth_credential_from_value(value)?;
    if !credential.access_is_fresh() {
        return None;
    }
    Some(credential.access)
}

fn read_claude_oauth_credential_from_json_text(
    text: &str,
) -> Option<ClaudeSubscriptionOauthCredential> {
    let value: Value = serde_json::from_str(text).ok()?;
    claude_oauth_credential_from_value(&value)
}

#[cfg(target_os = "macos")]
fn macos_keychain_password(service: &str, account: &str) -> Option<String> {
    let output = Command::new("/usr/bin/security")
        .args(["find-generic-password", "-s", service, "-a", account, "-w"])
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let secret = String::from_utf8_lossy(&output.stdout)
        .trim_end_matches(['\r', '\n'])
        .trim()
        .to_string();
    (!secret.is_empty()).then_some(secret)
}

fn read_app_keychain_password(provider: &str, slot: &str) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let username = keychain_username(provider, slot);
        macos_keychain_password(SERVICE, &username)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let entry = keychain_entry(provider, slot).ok()?;
        entry.get_password().ok()
    }
}

fn read_claude_oauth_credential_from_atelier_keychain() -> Option<ClaudeSubscriptionOauthCredential>
{
    let secret = read_app_keychain_password("claude", "oauth_token")?;
    let secret = secret.trim();
    if secret.contains("sk-ant-oat") && !secret.starts_with('{') {
        return Some(ClaudeSubscriptionOauthCredential {
            access: secret.to_string(),
            refresh: None,
            expires: None,
            scopes: None,
            subscription_type: None,
        });
    }
    read_claude_oauth_credential_from_json_text(secret)
}

#[allow(dead_code)]
pub fn read_claude_subscription_oauth_token() -> Option<String> {
    for key in ["ANTHROPIC_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"] {
        if let Ok(token) = std::env::var(key) {
            let token = token.trim().to_string();
            if token.contains("sk-ant-oat") {
                return Some(token);
            }
        }
    }

    // Legacy Atelier builds cached a renewable Claude credential. Read only the
    // app-owned keychain item, immediately strip any refresh token, and keep a
    // fresh inference-only access token. External Claude credential stores are
    // never opened.
    if let Some(credential) = read_claude_oauth_credential_from_atelier_keychain() {
        let token = credential
            .access_is_fresh()
            .then(|| credential.access.clone());
        if credential.refresh.is_some() {
            if let Some(value) = token.as_deref() {
                let _ = cache_claude_oauth_token(value);
            } else if let Ok(entry) = keychain_entry("claude", "oauth_token") {
                let _ = entry.delete_credential();
                set_oauth_state("claude", false);
            }
        }
        return token;
    }

    None
}

fn scrub_gajecode_managed_claude_credential() -> Result<(), String> {
    let Some(agent_dir) = gajecode_agent_dir() else {
        return Ok(());
    };
    let Some(bun) = gajecode_bun_executable_path() else {
        return Ok(());
    };
    let agent_db = agent_dir.join("agent.db");
    if !agent_db.exists() {
        return Ok(());
    }
    let script = r#"
import { Database } from "bun:sqlite";
const db = new Database(process.env.ATELIER_GAJAECODE_AGENT_DB);
const rows = db.query(`
  SELECT id, data FROM auth_credentials
  WHERE identity_key = 'atelier-claude-subscription'
`).all();
for (const row of rows) {
  let data = {};
  try { data = JSON.parse(row.data || "{}"); } catch {}
  delete data.refresh;
  delete data.refreshToken;
  delete data.refresh_token;
  db.query(`
    UPDATE auth_credentials
    SET data = ?, disabled_cause = 'atelier-keychain-env-migration', updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(data), Math.floor(Date.now() / 1000), row.id);
}
db.close();
"#;
    let mut command = Command::new(bun);
    command
        .arg("--eval")
        .arg(script)
        .env("ATELIER_GAJAECODE_AGENT_DB", &agent_db);
    let output = command_output_timeout(command, Duration::from_secs(4))
        .map_err(|e| format!("scrub Gajae managed OAuth credential: {e}"))?;
    if output.is_some_and(|output| !output.status.success()) {
        return Err("Gajae managed OAuth credential migration failed.".to_string());
    }
    Ok(())
}

pub fn prepare_gajecode_claude_subscription_token() -> Result<Option<String>, String> {
    scrub_gajecode_managed_claude_credential()?;
    Ok(read_claude_subscription_oauth_token())
}

#[tauri::command]
pub async fn provider_status(provider: String) -> Result<ProviderStatus, String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    let cli_installed = provider_cli_installed(&provider, &meta);
    let install_state = cli_install_runtime_snapshot(&provider);
    let oauth_logged_in = meta.supports_oauth && detect_oauth(&provider);
    let (api_key_present, api_key_masked) = if meta.supports_api {
        if let Some(key) = read_api_key(&provider) {
            let _ = update_credential_state(&provider, |state| {
                state.api_key_present = true;
                state.api_key_masked = mask_key(&key);
            });
            (true, mask_key(&key))
        } else {
            let _ = update_credential_state(&provider, |state| {
                state.api_key_present = false;
                state.api_key_masked.clear();
            });
            (false, String::new())
        }
    } else {
        (false, String::new())
    };

    Ok(ProviderStatus {
        provider,
        cli_installed,
        install_state,
        oauth_logged_in,
        api_key_present,
        api_key_masked,
        supports_oauth: meta.supports_oauth,
        supports_api: meta.supports_api,
    })
}

#[tauri::command]
pub async fn provider_save_api_key(provider: String, api_key: String) -> Result<(), String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    if !meta.supports_api {
        return Err(format!("{provider} does not support API key"));
    }
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("api_key is empty".into());
    }
    if !is_valid_api_key_for_provider(&provider, trimmed) {
        return Err(format!(
            "{provider} API key format is invalid. Subscription browser auth codes must be pasted into the subscription login step, not saved as API keys."
        ));
    }
    let entry = keychain_entry(&provider, "api_key")?;
    entry
        .set_password(trimmed)
        .map_err(|e| format!("save: {e}"))?;
    set_api_key_state(&provider, Some(trimmed));
    Ok(())
}

#[tauri::command]
pub async fn provider_clear_credentials(provider: String) -> Result<(), String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    for slot in ["api_key", "oauth_marker", "oauth_token"] {
        if let Ok(entry) = keychain_entry(&provider, slot) {
            let _ = entry.delete_credential();
        }
    }
    if meta.supports_oauth {
        if provider == "gajecode" {
            if gajecode_cli_installed() {
                if let Err(e) = run_gajecode_oauth_logout() {
                    log::warn!("oauth logout during credential clear failed for {provider}: {e}");
                }
            }
        } else if let Some(cli) = meta.cli {
            if which(cli) {
                if let Err(e) = run_oauth_logout(&provider, cli) {
                    log::warn!("oauth logout during credential clear failed for {provider}: {e}");
                }
            }
        }
    }
    let _ = update_credential_state(&provider, |state| {
        state.oauth_logged_in = false;
        state.api_key_present = false;
        state.api_key_masked.clear();
    });
    Ok(())
}

/// CLI subprocess 로 OAuth 로그인 시작. claude/codex 만 지원.
/// CLI 가 사용자 기본 브라우저를 열어 SNS(Google/Apple/GitHub 등) 로그인 페이지로 보낸다.
/// blocking 으로 기다리지 않고 즉시 반환 — 프론트가 status polling 으로 완료 감지.
#[tauri::command]
pub async fn provider_login_oauth(
    provider: String,
    force: Option<bool>,
) -> Result<ProviderLoginOauthResult, String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    if !meta.supports_oauth {
        return Err(format!("{provider} does not support OAuth"));
    }
    let cli = meta.cli.ok_or("cli not configured")?;
    let cmd = meta.login_cmd.ok_or("login_cmd not configured")?;
    let cli_installed = provider_cli_installed(&provider, &meta);
    if !cli_installed {
        return Err(format!(
            "CLI '{cli}' is not installed or cannot run. Use automatic install, then try subscription sign-in again."
        ));
    }
    let force_login = force.unwrap_or(false);
    if !force_login && detect_oauth(&provider) {
        set_oauth_state(&provider, true);
        return Ok(ProviderLoginOauthResult {
            provider,
            command: format!("{cli} {cmd}"),
            started: false,
            completed: true,
            already_logged_in: true,
            browser_opened: false,
            login_url_detected: false,
            login_url: None,
            diagnostic: None,
            message: "OAuth is already connected.".into(),
        });
    }
    if force_login {
        if let Err(e) = run_oauth_logout(&provider, cli) {
            log::warn!("forced oauth logout before login failed for {provider}: {e}");
        }
        if provider == "claude" {
            if let Ok(entry) = keychain_entry("claude", "oauth_token") {
                let _ = entry.delete_credential();
            }
        }
        set_oauth_state(&provider, false);
    }

    let cli_owned = cli.to_string();
    let login_attempts = oauth_login_attempts(&provider, cmd);
    let attempt_count = login_attempts.len();
    let mut last_failure: Option<String> = None;

    for (attempt_index, login_args) in login_attempts.into_iter().enumerate() {
        let provider_clone = provider.clone();
        let cmd_owned = login_args.join(" ");
        let command_label = format!("{cli_owned} {cmd_owned}");
        start_oauth_login_runtime(&provider_clone);
        let hinted_login_url = oauth_login_url_hint(&provider_clone, &login_args);
        let hinted_browser_opened = hinted_login_url.is_some_and(|url| {
            remember_oauth_login_url(&provider_clone, url);
            let opened = open_login_url_in_browser(url);
            remember_oauth_browser_opened(&provider_clone, opened);
            opened
        });
        if oauth_login_uses_pty(&provider) {
            let pty_system = NativePtySystem::default();
            let pair = pty_system
                .openpty(PtySize {
                    rows: 24,
                    cols: OAUTH_LOGIN_PTY_COLS,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| {
                    oauth_login_error(
                        &provider_clone,
                        format!("oauth openpty {cli_owned} {cmd_owned}: {e}"),
                    )
                })?;
            let cmd = oauth_pty_login_command(&cli_owned, &login_args);
            let mut child = pair.slave.spawn_command(cmd).map_err(|e| {
                oauth_login_error(
                    &provider_clone,
                    format!("oauth spawn {cli_owned} {cmd_owned}: {e}"),
                )
            })?;
            drop(pair.slave);

            let captured = Arc::new(Mutex::new(String::new()));
            let reader = pair.master.try_clone_reader().map_err(|e| {
                oauth_login_error(
                    &provider_clone,
                    format!("oauth clone reader {cli_owned} {cmd_owned}: {e}"),
                )
            })?;
            let writer = pair.master.take_writer().map_err(|e| {
                oauth_login_error(
                    &provider_clone,
                    format!("oauth take writer {cli_owned} {cmd_owned}: {e}"),
                )
            })?;
            store_oauth_login_pty_writer(&provider_clone, writer);
            capture_login_pipe(reader, captured.clone());
            spawn_oauth_login_runtime_watcher(provider_clone.clone(), captured.clone());

            let started = Instant::now();
            let mut browser_opened = hinted_browser_opened;
            let mut login_url_detected = hinted_login_url.is_some();
            loop {
                if !login_url_detected {
                    let output = captured_login_output(&captured);
                    if let Some(url) = extract_provider_login_url(&provider_clone, &output) {
                        remember_oauth_login_url(&provider_clone, &url);
                        login_url_detected = true;
                        browser_opened = open_login_url_in_browser(&url);
                        remember_oauth_browser_opened(&provider_clone, browser_opened);
                    }
                }

                match child.try_wait().map_err(|e| {
                    oauth_login_error(
                        &provider_clone,
                        format!("{cli_owned} {cmd_owned} poll: {e}"),
                    )
                })? {
                    Some(status) if status.success() => {
                        let _ = child.wait();
                        forget_oauth_login_stdin(&provider_clone);
                        mark_oauth_login_success(&provider_clone, &captured);
                        refresh_oauth_login_runtime(&provider_clone, &captured);
                        finish_oauth_login_runtime(&provider_clone);
                        let (login_url, diagnostic) = oauth_login_result_extras(&provider_clone);
                        return Ok(ProviderLoginOauthResult {
                            provider,
                            command: command_label,
                            started: true,
                            completed: true,
                            already_logged_in: false,
                            browser_opened,
                            login_url_detected,
                            login_url,
                            diagnostic,
                            message: "OAuth login command completed.".into(),
                        });
                    }
                    Some(status) => {
                        let _ = child.wait();
                        forget_oauth_login_stdin(&provider_clone);
                        thread::sleep(Duration::from_millis(80));
                        let detail = login_failure_detail_text(&captured_login_output(&captured))
                            .trim()
                            .to_string();
                        let failure = match detail {
                            detail if !detail.is_empty() => {
                                format!("{cli_owned} {cmd_owned} exited with {status:?}: {detail}")
                            }
                            _ => format!("{cli_owned} {cmd_owned} exited with {status:?}"),
                        };
                        fail_oauth_login_runtime(&provider_clone, failure.clone());
                        if attempt_index + 1 < attempt_count {
                            log::warn!(
                                "oauth login attempt failed for {provider} ({cmd_owned}); trying fallback: {failure}"
                            );
                            last_failure = Some(failure);
                            break;
                        }
                        return Err(failure);
                    }
                    None if started.elapsed() >= Duration::from_millis(1500) => {
                        if !login_url_detected {
                            watch_and_open_login_url(provider_clone.clone(), captured.clone());
                        }
                        refresh_oauth_login_runtime(&provider_clone, &captured);
                        let (login_url, diagnostic) = oauth_login_result_extras(&provider_clone);

                        let master = pair.master;
                        std::thread::spawn(move || {
                            let _keep_master_alive = master;
                            match child.wait() {
                                Ok(status) if status.success() => {
                                    forget_oauth_login_stdin(&provider_clone);
                                    mark_oauth_login_success(&provider_clone, &captured);
                                    finish_oauth_login_runtime(&provider_clone);
                                }
                                Ok(status) => {
                                    forget_oauth_login_stdin(&provider_clone);
                                    let detail = login_failure_detail_text(&captured_login_output(
                                        &captured,
                                    ));
                                    let failure = if detail.trim().is_empty() {
                                        format!("{cli_owned} {cmd_owned} exited with {status:?}")
                                    } else {
                                        format!(
                                            "{cli_owned} {cmd_owned} exited with {status:?}: {detail}"
                                        )
                                    };
                                    log::warn!("{failure}");
                                    fail_oauth_login_runtime(&provider_clone, failure);
                                }
                                Err(e) => {
                                    forget_oauth_login_stdin(&provider_clone);
                                    let failure = format!("{cli_owned} wait: {e}");
                                    log::warn!("{failure}");
                                    fail_oauth_login_runtime(&provider_clone, failure);
                                }
                            }
                        });
                        return Ok(ProviderLoginOauthResult {
                            provider,
                            command: command_label,
                            started: true,
                            completed: false,
                            already_logged_in: false,
                            browser_opened,
                            login_url_detected,
                            login_url,
                            diagnostic,
                            message: if browser_opened {
                                "OAuth login started and the browser was opened.".into()
                            } else if login_url_detected {
                                "OAuth login started, but Atelier could not open the browser automatically.".into()
                            } else {
                                "OAuth login started. Atelier is waiting for the CLI browser code."
                                    .into()
                            },
                        });
                    }
                    None => thread::sleep(Duration::from_millis(80)),
                }
            }

            continue;
        }

        let mut command = if provider == "gajecode" {
            gajecode_isolated_cli_command()?
        } else {
            let mut command = cli_command(&cli_owned);
            command.env("PATH", crate::augmented_cli_path());
            command
        };
        command
            .args(&login_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(if provider == "claude" {
                Stdio::piped()
            } else {
                Stdio::null()
            });
        configure_login_browser_env_for_command(&mut command);
        configure_background_command(&mut command);
        let mut child = command.spawn().map_err(|e| {
            oauth_login_error(
                &provider_clone,
                format!("oauth spawn {cli_owned} {cmd_owned}: {e}"),
            )
        })?;
        let captured = Arc::new(Mutex::new(String::new()));
        if provider == "claude" {
            if let Some(stdin) = child.stdin.take() {
                store_oauth_login_stdin(&provider_clone, stdin);
            }
        }
        if let Some(stdout) = child.stdout.take() {
            capture_login_pipe(stdout, captured.clone());
        }
        if let Some(stderr) = child.stderr.take() {
            capture_login_pipe(stderr, captured.clone());
        }
        spawn_oauth_login_runtime_watcher(provider_clone.clone(), captured.clone());

        // Claude/Codex CLI가 Windows에서 즉시 실패하는 경우에는 "브라우저가 열렸습니다"
        // 모달을 띄우면 사용자가 무한 대기 상태로 보인다. 짧게만 관찰해서 즉시 실패는
        // 호출자에게 돌려주고, 실제 로그인 대기는 백그라운드에서 계속 처리한다.
        let started = Instant::now();
        let mut browser_opened = hinted_browser_opened;
        let mut login_url_detected = hinted_login_url.is_some();
        loop {
            if !login_url_detected {
                let output = captured_login_output(&captured);
                if let Some(url) = extract_provider_login_url(&provider_clone, &output) {
                    remember_oauth_login_url(&provider_clone, &url);
                    login_url_detected = true;
                    browser_opened = open_login_url_in_browser(&url);
                    remember_oauth_browser_opened(&provider_clone, browser_opened);
                }
            }
            match child.try_wait().map_err(|e| {
                oauth_login_error(
                    &provider_clone,
                    format!("{cli_owned} {cmd_owned} poll: {e}"),
                )
            })? {
                Some(status) if status.success() => {
                    let _ = child.wait();
                    forget_oauth_login_stdin(&provider_clone);
                    mark_oauth_login_success(&provider_clone, &captured);
                    refresh_oauth_login_runtime(&provider_clone, &captured);
                    finish_oauth_login_runtime(&provider_clone);
                    let (login_url, diagnostic) = oauth_login_result_extras(&provider_clone);
                    return Ok(ProviderLoginOauthResult {
                        provider,
                        command: command_label,
                        started: true,
                        completed: true,
                        already_logged_in: false,
                        browser_opened,
                        login_url_detected,
                        login_url,
                        diagnostic,
                        message: "OAuth login command completed.".into(),
                    });
                }
                Some(status) => {
                    let _ = child.wait();
                    forget_oauth_login_stdin(&provider_clone);
                    thread::sleep(Duration::from_millis(80));
                    let detail = login_failure_detail_text(&captured_login_output(&captured))
                        .trim()
                        .to_string();
                    let failure = match detail {
                        detail if !detail.is_empty() => {
                            format!("{cli_owned} {cmd_owned} exited with {status}: {detail}")
                        }
                        _ => format!("{cli_owned} {cmd_owned} exited with {status}"),
                    };
                    fail_oauth_login_runtime(&provider_clone, failure.clone());
                    if attempt_index + 1 < attempt_count {
                        log::warn!(
                            "oauth login attempt failed for {provider} ({cmd_owned}); trying fallback: {failure}"
                        );
                        last_failure = Some(failure);
                        break;
                    }
                    return Err(failure);
                }
                None if started.elapsed() >= Duration::from_millis(1500) => {
                    if !login_url_detected {
                        watch_and_open_login_url(provider_clone.clone(), captured.clone());
                    }
                    refresh_oauth_login_runtime(&provider_clone, &captured);
                    let (login_url, diagnostic) = oauth_login_result_extras(&provider_clone);

                    std::thread::spawn(move || match child.wait() {
                        Ok(status) if status.success() => {
                            forget_oauth_login_stdin(&provider_clone);
                            mark_oauth_login_success(&provider_clone, &captured);
                            finish_oauth_login_runtime(&provider_clone);
                        }
                        Ok(status) => {
                            forget_oauth_login_stdin(&provider_clone);
                            let detail =
                                login_failure_detail_text(&captured_login_output(&captured));
                            let failure = if detail.trim().is_empty() {
                                format!("{cli_owned} {cmd_owned} exited with {status}")
                            } else {
                                format!("{cli_owned} {cmd_owned} exited with {status}: {detail}")
                            };
                            log::warn!("{failure}");
                            fail_oauth_login_runtime(&provider_clone, failure);
                        }
                        Err(e) => {
                            forget_oauth_login_stdin(&provider_clone);
                            let failure = format!("{cli_owned} wait: {e}");
                            log::warn!("{failure}");
                            fail_oauth_login_runtime(&provider_clone, failure);
                        }
                    });
                    return Ok(ProviderLoginOauthResult {
                        provider,
                        command: command_label,
                        started: true,
                        completed: false,
                        already_logged_in: false,
                        browser_opened,
                        login_url_detected,
                        login_url,
                        diagnostic,
                        message: if browser_opened {
                            "OAuth login started and the browser was opened.".into()
                        } else if login_url_detected {
                            "OAuth login started, but Atelier could not open the browser automatically.".into()
                        } else {
                            "OAuth login started. Atelier is waiting for the CLI browser code."
                                .into()
                        },
                    });
                }
                None => thread::sleep(Duration::from_millis(80)),
            }
        }
    }

    Err(last_failure.unwrap_or_else(|| format!("{cli_owned} {cmd} login failed")))
}

#[tauri::command]
pub async fn provider_oauth_login_state(
    provider: String,
) -> Result<ProviderOauthLoginState, String> {
    let snapshot = oauth_login_runtime_snapshot(&provider);
    Ok(ProviderOauthLoginState {
        provider,
        active: snapshot.active,
        browser_opened: snapshot.browser_opened,
        login_url: snapshot.login_url,
        output: snapshot.output,
        error: snapshot.error,
        updated_at_ms: snapshot.updated_at_ms,
    })
}

#[tauri::command]
pub async fn provider_open_oauth_login_url(provider: String, url: String) -> Result<(), String> {
    let url = url.trim();
    if !is_provider_login_url(&provider, url) {
        return Err("The login URL is not an approved HTTPS endpoint for this provider.".into());
    }
    if open_login_url_in_browser(url) {
        remember_oauth_login_url(&provider, url);
        remember_oauth_browser_opened(&provider, true);
        Ok(())
    } else {
        Err("Failed to open the login URL in the default browser.".into())
    }
}

#[tauri::command]
pub async fn provider_submit_oauth_code(provider: String, code: String) -> Result<(), String> {
    let code = code.trim();
    if code.is_empty() {
        return Err("authentication code is empty".into());
    }
    if code.len() > 4096 || code.chars().any(|c| c == '\n' || c == '\r') {
        return Err("authentication code format is invalid".into());
    }
    let mut map = OAUTH_LOGIN_STDIN
        .lock()
        .map_err(|_| "login stdin lock poisoned".to_string())?;
    let stdin = map.get_mut(&provider).ok_or_else(|| {
        "No active OAuth login is waiting for an authentication code.".to_string()
    })?;
    let line = format!("{code}\n");
    match stdin {
        OAuthLoginInput::Process(stdin) => {
            stdin
                .write_all(line.as_bytes())
                .map_err(|e| format!("write authentication code: {e}"))?;
            stdin
                .flush()
                .map_err(|e| format!("flush authentication code: {e}"))
        }
        OAuthLoginInput::Pty(writer) => {
            writer
                .write_all(line.as_bytes())
                .map_err(|e| format!("write authentication code: {e}"))?;
            writer
                .flush()
                .map_err(|e| format!("flush authentication code: {e}"))
        }
    }
}

/// CLI 자동 설치 — npm 으로 claude-code / codex 를 글로벌 설치.
/// 새 사용자가 터미널 없이 한 클릭으로 셋업할 수 있도록.
#[tauri::command]
pub async fn provider_install_cli(provider: String) -> Result<ProviderCliInstallState, String> {
    match provider.as_str() {
        "claude" => install_claude_cli(),
        "codex" => install_npm_cli("codex", "@openai/codex"),
        "hermes" => install_hermes_cli(),
        "gajecode" => install_gajecode_cli(),
        _ => Err(format!("automatic install not available for {provider}")),
    }
}

fn spawn_cli_installer(
    mut command: Command,
    provider: &'static str,
    label: &'static str,
    verify_cli: fn() -> bool,
    after_success: Option<fn()>,
) -> Result<ProviderCliInstallState, String> {
    let started_state = match begin_cli_install_runtime(provider) {
        Ok(state) => state,
        Err(existing) => return Ok(existing),
    };
    configure_background_command(&mut command);
    let has_explicit_path = command
        .get_envs()
        .any(|(key, value)| value.is_some() && key == OsStr::new("PATH"));
    std::thread::spawn(move || {
        if !has_explicit_path {
            command.env("PATH", crate::augmented_cli_path());
        }
        match command
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .stdin(Stdio::null())
            .spawn()
        {
            Ok(mut child) => {
                update_cli_install_runtime(provider, ProviderCliInstallPhase::Running, None, None);
                let wait_result = child.wait();
                let cli_available = verify_cli();
                let (phase, detail, exit_code) =
                    cli_install_terminal_state_from_result(label, wait_result, cli_available);
                let state = update_cli_install_runtime(provider, phase, detail.clone(), exit_code);
                if state.phase == ProviderCliInstallPhase::Succeeded {
                    if let Some(callback) = after_success {
                        callback();
                    }
                    if let Some(detail) = detail {
                        log::info!("{detail}");
                    }
                } else if let Some(detail) = detail {
                    log::warn!("{detail}");
                }
            }
            Err(error) => {
                let detail = cli_install_spawn_error_message(label, &error.to_string());
                update_cli_install_runtime(
                    provider,
                    ProviderCliInstallPhase::Failed,
                    Some(detail.clone()),
                    None,
                );
                log::warn!("{detail}");
            }
        }
    });
    Ok(started_state)
}

fn install_npm_cli(
    label: &'static str,
    pkg: &'static str,
) -> Result<ProviderCliInstallState, String> {
    if !which("npm") {
        return Err("npm not found. install Node.js first.".into());
    }
    #[cfg(target_os = "windows")]
    let command = {
        let mut command = Command::new("cmd.exe");
        command
            .arg("/D")
            .arg("/Q")
            .arg("/S")
            .arg("/C")
            .arg("npm")
            .arg("install")
            .arg("-g")
            .arg(pkg);
        configure_background_command(&mut command);
        command
    };
    #[cfg(not(target_os = "windows"))]
    let command = {
        let mut command = Command::new("npm");
        command.arg("install").arg("-g").arg(pkg);
        command
    };
    let verify_cli = match label {
        "claude" => claude_cli_installed,
        "codex" => codex_cli_installed,
        _ => return Err(format!("no install verifier configured for {label}")),
    };
    spawn_cli_installer(command, label, label, verify_cli, None)
}

fn install_claude_cli() -> Result<ProviderCliInstallState, String> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("powershell.exe");
        command
            .arg("-NoProfile")
            .arg("-WindowStyle")
            .arg("Hidden")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-Command")
            .arg(CLAUDE_INSTALL_PS1);
        spawn_cli_installer(command, "claude", "claude", claude_cli_installed, None)
    }

    #[cfg(not(target_os = "windows"))]
    install_npm_cli("claude", "@anthropic-ai/claude-code")
}

fn install_hermes_cli() -> Result<ProviderCliInstallState, String> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("powershell.exe");
        command
            .arg("-NoProfile")
            .arg("-WindowStyle")
            .arg("Hidden")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-Command")
            .arg(HERMES_INSTALL_PS1);
        spawn_cli_installer(command, "hermes", "hermes", hermes_cli_installed, None)
    }

    #[cfg(not(target_os = "windows"))]
    {
        if !which("curl") {
            return Err("curl not found. install curl first.".into());
        }
        if !which("bash") {
            return Err("bash not found. install bash first.".into());
        }
        let mut command = Command::new("sh");
        command.arg("-c").arg(HERMES_INSTALL_SH);
        spawn_cli_installer(command, "hermes", "hermes", hermes_cli_installed, None)
    }
}

fn install_gajecode_cli() -> Result<ProviderCliInstallState, String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("powershell.exe");
        command
            .arg("-NoProfile")
            .arg("-WindowStyle")
            .arg("Hidden")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-Command")
            .arg(GAJAE_CODE_INSTALL_PS1);
        configure_background_command(&mut command);
        command
    };

    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut command = Command::new("sh");
        command.arg("-lc").arg(GAJAE_CODE_INSTALL_SH);
        command
    };

    configure_gajecode_runtime_env(&mut command)?;
    spawn_cli_installer(
        command,
        "gajecode",
        "gajecode",
        gajecode_cli_installed,
        None,
    )
}

#[derive(Serialize)]
pub struct GajecodeUpdateStatus {
    pub installed: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub message: Option<String>,
}

fn first_semver_token(text: &str) -> Option<String> {
    text.split(|c: char| !(c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_'))
        .map(str::trim)
        .find(|token| token.chars().next().is_some_and(|c| c.is_ascii_digit()))
        .map(|token| {
            token
                .trim_matches(|c: char| {
                    !(c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
                })
                .to_string()
        })
        .filter(|token| !token.is_empty())
}

fn semver_parts(version: &str) -> Vec<u64> {
    version
        .split(['.', '-', '_'])
        .filter_map(|part| part.parse::<u64>().ok())
        .collect()
}

fn version_is_newer(latest: &str, current: &str) -> bool {
    let latest_parts = semver_parts(latest);
    let current_parts = semver_parts(current);
    for index in 0..latest_parts.len().max(current_parts.len()) {
        let left = *latest_parts.get(index).unwrap_or(&0);
        let right = *current_parts.get(index).unwrap_or(&0);
        if left != right {
            return left > right;
        }
    }
    false
}

fn read_gajecode_current_version() -> Option<String> {
    let mut command = gajecode_isolated_cli_command().ok()?;
    command
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    configure_background_command(&mut command);
    let output = command.output().ok()?;
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push('\n');
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    first_semver_token(&combined)
}

fn read_gajecode_latest_version() -> Option<String> {
    if !which("npm") {
        return None;
    }
    let mut command = Command::new("npm");
    command
        .arg("view")
        .arg(GAJAE_CODE_PACKAGE_NAME)
        .arg("version")
        .arg("--json")
        .env("PATH", crate::augmented_cli_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    configure_background_command(&mut command);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&output.stdout);
    let trimmed = raw.trim().trim_matches('"').to_string();
    (!trimmed.is_empty()).then_some(trimmed)
}

#[tauri::command]
pub async fn gajecode_check_update() -> Result<GajecodeUpdateStatus, String> {
    let installed = gajecode_cli_installed();
    let current_version = installed.then(read_gajecode_current_version).flatten();
    let latest_version = read_gajecode_latest_version();
    let update_available = match (&latest_version, &current_version) {
        (Some(latest), Some(current)) => version_is_newer(latest, current),
        (Some(_), None) => installed,
        _ => false,
    };
    let message = if !installed {
        Some("가재코드 CLI가 설치되어 있지 않습니다.".to_string())
    } else if latest_version.is_none() {
        Some("npm에서 최신 버전을 확인하지 못했습니다.".to_string())
    } else {
        None
    };
    Ok(GajecodeUpdateStatus {
        installed,
        current_version,
        latest_version,
        update_available,
        message,
    })
}

#[tauri::command]
pub async fn gajecode_update() -> Result<(), String> {
    install_gajecode_cli().map(|_| ())
}

#[derive(Serialize)]
pub struct HermesUpdateStatus {
    pub installed: bool,
    pub current_version: Option<String>,
    pub update_available: bool,
    pub commits_behind: Option<u32>,
    pub message: Option<String>,
}

/// `hermes --version` 출력을 파싱해 현재 버전과 업데이트 여부를 보고한다.
/// hermes CLI 가 자체적으로 GitHub 원격 HEAD 와 비교해 "Update available: N commits behind" 를 출력한다.
#[tauri::command]
pub async fn hermes_check_update() -> Result<HermesUpdateStatus, String> {
    let empty = HermesUpdateStatus {
        installed: false,
        current_version: None,
        update_available: false,
        commits_behind: None,
        message: None,
    };
    if !which("hermes") {
        return Ok(empty);
    }
    let mut command = cli_command("hermes");
    command
        .arg("--version")
        .env("PATH", crate::augmented_cli_path());
    configure_background_command(&mut command);
    let output = match command.output() {
        Ok(o) => o,
        Err(_) => return Ok(empty),
    };
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push('\n');
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    let mut current_version: Option<String> = None;
    let mut update_available = false;
    let mut commits_behind: Option<u32> = None;
    let mut message: Option<String> = None;
    for line in combined.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("Hermes Agent ") {
            current_version = Some(rest.to_string());
        }
        if trimmed.starts_with("Update available")
            || trimmed.contains("commits behind")
            || trimmed.contains("commit behind")
        {
            update_available = true;
            message = Some(trimmed.to_string());
            for token in trimmed.split_whitespace() {
                if let Ok(n) = token.parse::<u32>() {
                    commits_behind = Some(n);
                    break;
                }
            }
        }
    }
    Ok(HermesUpdateStatus {
        installed: true,
        current_version,
        update_available,
        commits_behind,
        message,
    })
}

/// `hermes update --yes` 를 백그라운드 실행. `--yes` 가 모든 확인 프롬프트(설정 마이그레이션,
/// API 키 추가, 의존성 설치 등)를 자동 승인해 주므로 stdin 닫혀 있어도 막히지 않는다.
/// UI 는 즉시 반환되고 완료 후 다시 check 하면 반영된다.
#[tauri::command]
pub async fn hermes_update() -> Result<(), String> {
    if !which("hermes") {
        return Err("hermes not found".into());
    }
    std::thread::spawn(|| {
        let mut command = cli_command("hermes");
        command
            .arg("update")
            .arg("--yes")
            .env("PATH", crate::augmented_cli_path())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .stdin(Stdio::null());
        configure_background_command(&mut command);
        match command.spawn() {
            Ok(mut child) => match child.wait() {
                Ok(status) if status.success() => log::info!("hermes update completed"),
                Ok(status) => log::warn!("hermes update exited with {status}"),
                Err(e) => log::warn!("hermes update wait: {e}"),
            },
            Err(e) => log::warn!("hermes update spawn: {e}"),
        }
    });
    Ok(())
}

fn should_inject_agent_api_key(provider: &str, state: &CredentialState) -> bool {
    // Claude/Codex CLI can authenticate through their own subscription OAuth.
    // If Atelier also injects a stale API key, the CLI prefers that env var and
    // fails with confusing 401/exit 1 errors even though subscription login is valid.
    !(matches!(provider, "claude" | "codex") && state.oauth_logged_in)
}

pub fn should_clear_inherited_agent_api_env(provider: &str) -> bool {
    matches!(provider, "claude" | "codex")
}

/// agent.rs 가 spawn 직전에 호출. provider 별 keychain API 키를 반환.
/// 실제 키 노출이 필요한 유일한 경로. 호출처는 env 주입 후 즉시 폐기.
pub fn read_api_key(provider: &str) -> Option<String> {
    let meta = provider_meta(provider)?;
    if !meta.supports_api {
        return None;
    }
    let v = read_app_keychain_password(provider, "api_key")?;
    let v = v.trim().to_string();
    if v.is_empty() || !is_valid_api_key_for_provider(provider, &v) {
        None
    } else {
        Some(v)
    }
}

/// Claude/Codex 작업 CLI용 API 키. 구독 OAuth가 연결되어 있으면 API 키를
/// 일부러 주입하지 않는다. Hermes 같은 API backend 경로는 read_api_key를 직접 쓴다.
pub fn read_agent_api_key(provider: &str) -> Option<String> {
    let state = credential_state(provider);
    if matches!(provider, "claude" | "codex")
        && !state.oauth_logged_in
        && state.api_key_present
        && detect_oauth(provider)
    {
        return None;
    }
    if !should_inject_agent_api_key(provider, &state) {
        return None;
    }
    read_api_key(provider)
}

/// provider id → 환경변수명. agent.rs spawn 시 사용.
pub fn env_var_for(provider: &str) -> Option<&'static str> {
    provider_meta(provider).and_then(|m| m.env_var)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_install_terminal_state_reports_success_only_after_cli_is_detectable() {
        let (phase, detail, exit_code) =
            cli_install_terminal_state_from_exit("codex", true, Some(0), true);
        assert_eq!(phase, ProviderCliInstallPhase::Succeeded);
        assert_eq!(exit_code, Some(0));
        assert_eq!(
            detail.as_deref(),
            Some("codex CLI install completed and the CLI is now available.")
        );
    }

    #[test]
    fn cli_install_terminal_state_reports_nonzero_exit_with_sanitized_code() {
        let (phase, detail, exit_code) =
            cli_install_terminal_state_from_exit("claude", false, Some(23), false);
        assert_eq!(phase, ProviderCliInstallPhase::Failed);
        assert_eq!(exit_code, Some(23));
        assert_eq!(
            detail.as_deref(),
            Some("claude installer exited with code 23.")
        );
    }

    #[test]
    fn cli_install_terminal_state_rejects_zero_exit_without_visible_cli() {
        let (phase, detail, exit_code) =
            cli_install_terminal_state_from_exit("hermes", true, Some(0), false);
        assert_eq!(phase, ProviderCliInstallPhase::Failed);
        assert_eq!(exit_code, Some(0));
        assert_eq!(
            detail.as_deref(),
            Some("hermes installer exited successfully but the CLI is still unavailable.")
        );
    }

    #[test]
    fn cli_install_duplicate_guard_reuses_active_provider_state() {
        let provider = "fixture-duplicate-guard";
        let started = begin_cli_install_runtime(provider).expect("first install should start");
        let duplicate =
            begin_cli_install_runtime(provider).expect_err("active install must be reused");
        assert_eq!(started.phase, ProviderCliInstallPhase::Started);
        assert_eq!(duplicate.phase, ProviderCliInstallPhase::Started);
        update_cli_install_runtime(
            provider,
            ProviderCliInstallPhase::Failed,
            Some("fixture failure".to_string()),
            Some(1),
        );
        let restarted =
            begin_cli_install_runtime(provider).expect("failed install should allow retry");
        assert_eq!(restarted.phase, ProviderCliInstallPhase::Started);
    }

    #[test]
    fn subscription_oauth_wins_for_direct_agent_clis() {
        let oauth_state = CredentialState {
            oauth_logged_in: true,
            api_key_present: true,
            api_key_masked: "sk-…bad1".to_string(),
            updated_at: None,
        };
        let api_state = CredentialState {
            oauth_logged_in: false,
            api_key_present: true,
            api_key_masked: "sk-…good".to_string(),
            updated_at: None,
        };

        assert!(!should_inject_agent_api_key("claude", &oauth_state));
        assert!(!should_inject_agent_api_key("codex", &oauth_state));
        assert!(should_inject_agent_api_key("claude", &api_state));
        assert!(should_inject_agent_api_key("codex", &api_state));
        assert!(should_inject_agent_api_key("openrouter", &oauth_state));
    }

    #[test]
    fn subscription_logins_prefer_cross_platform_oauth_flows() {
        assert_eq!(
            oauth_login_attempts("claude", "login"),
            vec![vec!["setup-token"], vec!["auth", "login", "--claudeai"]]
        );
        assert_eq!(
            oauth_login_attempts("codex", "login"),
            vec![vec!["login", "--device-auth"], vec!["login"]]
        );
    }

    #[test]
    fn codex_device_auth_has_a_validated_browser_hint() {
        let args = ["login", "--device-auth"];
        assert_eq!(
            oauth_login_url_hint("codex", &args),
            Some(CODEX_DEVICE_AUTH_URL)
        );
        assert!(is_provider_login_url("codex", CODEX_DEVICE_AUTH_URL));
        assert_eq!(oauth_login_url_hint("codex", &["login"]), None);
        assert_eq!(oauth_login_url_hint("claude", &["setup-token"]), None);
        assert_eq!(
            oauth_browser_probe_url("codex"),
            Some(CODEX_DEVICE_AUTH_URL)
        );
        assert_eq!(oauth_browser_probe_url("claude"), Some("https://claude.ai"));
        assert_eq!(oauth_browser_probe_url("openrouter"), None);
    }

    #[test]
    fn direct_subscription_logins_use_headless_pty() {
        assert!(oauth_login_uses_pty("claude"));
        assert!(oauth_login_uses_pty("codex"));
        assert!(!oauth_login_uses_pty("gajecode"));
        assert!(!oauth_login_uses_pty("openrouter"));
    }

    #[test]
    fn direct_subscription_clis_clear_inherited_api_env() {
        assert!(should_clear_inherited_agent_api_env("claude"));
        assert!(should_clear_inherited_agent_api_env("codex"));
        assert!(!should_clear_inherited_agent_api_env("openrouter"));
        assert!(!should_clear_inherited_agent_api_env("hermes"));
    }

    #[test]
    fn login_output_redacts_urls_and_tokens() {
        let fake_token = ["sk-ant-oat", "fixture", "redaction", "token"].join("-");
        let input = format!(
            "Opening browser\nhttps://claude.com/cai/oauth/authorize?code_challenge=secret\n{fake_token}\naccess_token=abc"
        );
        let detail = redact_login_output(&input);
        assert!(detail.contains("Opening browser"));
        assert!(detail.contains("[login url redacted]"));
        assert!(detail.contains("[credential output redacted]"));
        assert!(!detail.contains("code_challenge=secret"));
        assert!(!detail.contains(&fake_token));
        assert!(!detail.contains("access_token=abc"));
    }

    #[test]
    fn claude_setup_token_is_extracted_from_cli_output() {
        let fake_token = ["sk-ant-oat", "fixture", "setup", "token#proof"].join("-");
        let output = format!("Authentication complete\r\n  {fake_token}  \r\n");
        assert_eq!(
            extract_claude_oauth_token_from_text(&output).as_deref(),
            Some(fake_token.as_str())
        );
    }

    #[test]
    fn login_url_extraction_ignores_ansi_wrapping() {
        let url =
            extract_login_url("\u{1b}[36mhttps://claude.ai/oauth/authorize?state=abc\u{1b}[0m")
                .expect("url should be extracted");
        assert_eq!(url, "https://claude.ai/oauth/authorize?state=abc");
    }

    #[test]
    fn login_url_extraction_reads_osc8_hyperlinks() {
        let text = "\u{1b}]8;;https://chatgpt.com/backend-api/codex/auth?state=abc&code_challenge=def\u{1b}\\Open browser\u{1b}]8;;\u{1b}\\";
        let url = extract_login_url(text).expect("osc8 url should be extracted");
        assert_eq!(
            url,
            "https://chatgpt.com/backend-api/codex/auth?state=abc&code_challenge=def"
        );
    }

    #[test]
    fn login_url_extraction_preserves_claude_redirect_uri() {
        let text = "Open browser: https://claude.com/cai/oauth/authorize?code=true&client_id=abc&redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback&code_challenge=secret&state=xyz";
        let url = extract_login_url(text).expect("claude login url should be extracted");
        assert!(url.contains("redirect_uri="));
        assert!(url.contains("code_challenge=secret"));
        assert!(url.ends_with("state=xyz"));
    }

    #[test]
    fn provider_login_url_allowlist_rejects_insecure_and_unrelated_hosts() {
        assert!(is_provider_login_url(
            "claude",
            "https://claude.ai/oauth/authorize?state=abc"
        ));
        assert!(is_provider_login_url(
            "codex",
            "https://auth.openai.com/authorize?state=abc"
        ));
        assert!(!is_provider_login_url(
            "claude",
            "http://claude.ai/oauth/authorize"
        ));
        assert!(!is_provider_login_url(
            "codex",
            "https://chatgpt.com.attacker.example/authorize"
        ));
        assert!(!is_provider_login_url(
            "claude",
            "https://example.com/claude-login"
        ));
    }

    #[test]
    fn provider_login_url_extraction_skips_unrelated_links() {
        let text = "Docs: https://example.com/help\nLogin: https://chatgpt.com/backend-api/codex/auth?state=abc\n";
        assert_eq!(
            extract_provider_login_url("codex", text).as_deref(),
            Some("https://chatgpt.com/backend-api/codex/auth?state=abc")
        );
    }

    #[test]
    fn provider_login_url_waits_for_a_complete_pty_chunk() {
        let partial = "Open browser: https://claude.com/cai/oauth/authorize?client_id=abc&redire";
        assert_eq!(extract_provider_login_url("claude", partial), None);
        assert_eq!(
            extract_provider_login_url_relaxed("claude", partial).as_deref(),
            Some("https://claude.com/cai/oauth/authorize?client_id=abc&redire")
        );

        let complete = "Open browser: https://claude.com/cai/oauth/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback&state=xyz\r\n";
        let url = extract_provider_login_url("claude", complete)
            .expect("terminated URL should be accepted");
        assert!(url.contains("redirect_uri="));
        assert!(url.ends_with("state=xyz"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_oauth_does_not_override_the_provider_browser() {
        let mut command = Command::new("claude");
        command.env("BROWSER", "recursive-atelier-launcher");
        configure_login_browser_env_for_command(&mut command);
        assert!(command
            .get_envs()
            .any(|(key, value)| key == "BROWSER" && value.is_none()));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_oauth_browser_helper_uses_trusted_system_binary() {
        assert_eq!(
            oauth_browser_helper_path().as_deref(),
            Some(Path::new("/usr/bin/open"))
        );
    }

    #[test]
    fn oauth_browser_helper_accepts_only_provider_https_urls() {
        assert_eq!(
            provider_for_oauth_login_url("https://claude.com/cai/oauth/authorize?state=abc"),
            Some("claude")
        );
        assert_eq!(
            provider_for_oauth_login_url("https://auth.openai.com/codex/device"),
            Some("codex")
        );
        assert_eq!(provider_for_oauth_login_url("http://claude.ai/oauth"), None);
        assert_eq!(
            provider_for_oauth_login_url("https://example.com/oauth"),
            None
        );
    }

    #[test]
    fn claude_oauth_token_parser_supports_legacy_and_keychain_shapes() {
        let legacy = serde_json::json!({
            "claudeAiOauth": {
                "accessToken": "sk-ant-oat-legacy",
                "expiresAt": chrono::Utc::now().timestamp_millis() + 120_000,
                "subscriptionType": "max"
            }
        });
        let keychain = serde_json::json!({
            "claudeAiOauth": {
                "accessToken": "sk-ant-oat-keychain",
                "refreshToken": "redacted",
                "expiresAt": (chrono::Utc::now().timestamp_millis() + 120_000).to_string(),
                "subscriptionType": "max"
            }
        });

        assert_eq!(
            claude_oauth_token_from_value(&legacy),
            Some("sk-ant-oat-legacy".into())
        );
        assert_eq!(
            claude_oauth_token_from_value(&keychain),
            Some("sk-ant-oat-keychain".into())
        );
    }

    #[test]
    fn expired_legacy_access_is_rejected_even_with_refresh_token() {
        let value = serde_json::json!({
            "claudeAiOauth": {
                "accessToken": "sk-ant-oat-expired",
                "refreshToken": "refresh-token",
                "expiresAt": chrono::Utc::now().timestamp_millis() - 1
            }
        });

        assert_eq!(claude_oauth_token_from_value(&value), None);
        let credential = claude_oauth_credential_from_value(&value).unwrap();
        assert_eq!(credential.access, "sk-ant-oat-expired");
        assert_eq!(credential.refresh.as_deref(), Some("refresh-token"));
        assert!(!credential.access_is_fresh());
    }

    #[test]
    fn claude_oauth_credential_parser_supports_access_refresh_aliases() {
        let value = serde_json::json!({
            "oauth": {
                "access": "sk-ant-oat-access",
                "refresh": "refresh-token",
                "expires": "1782709680730",
                "scopes": ["org:create_api_key", "user:profile"],
                "subscription_type": "max"
            }
        });

        let credential = claude_oauth_credential_from_value(&value).unwrap();
        assert_eq!(credential.access, "sk-ant-oat-access");
        assert_eq!(credential.refresh.as_deref(), Some("refresh-token"));
        assert_eq!(credential.expires, Some(1782709680730));
        assert_eq!(
            credential.scopes.as_deref(),
            Some("org:create_api_key user:profile")
        );
        assert_eq!(credential.subscription_type.as_deref(), Some("max"));
    }
}
