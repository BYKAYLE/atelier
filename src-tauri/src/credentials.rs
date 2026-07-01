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
use std::process::{ChildStdin, Command, Output, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const SERVICE: &str = "com.atelier.app";
const HERMES_INSTALL_SH: &str =
    "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup";
const GAJAE_CODE_PACKAGE_NAME: &str = "gajae-code";

enum OAuthLoginInput {
    Process(ChildStdin),
    Pty(Box<dyn Write + Send>),
}

static OAUTH_LOGIN_STDIN: Lazy<Mutex<HashMap<String, OAuthLoginInput>>> =
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
        crate::agent::command_for_cli(cli)
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

/// 4종 provider — claude/codex 는 OAuth(구독) 또는 API 둘 다 가능.
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
        // Windows Claude Code builds repeatedly fail or produce mojibake stderr
        // from `auth login --claudeai`. Prefer the code-paste flow first.
        "claude" => vec![vec!["setup-token"], vec!["auth", "login", "--claudeai"]],
        _ => vec![vec![fallback_cmd]],
    }
}

fn oauth_login_uses_pty(provider: &str) -> bool {
    matches!(provider, "claude" | "codex")
}

fn redact_login_output(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            if line.contains("://") {
                "[login url redacted]".to_string()
            } else if lower.contains("access_token")
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

fn extract_login_url_candidate(text: &str) -> Option<String> {
    let mut offset = 0;
    while offset < text.len() {
        let search = &text[offset..];
        let Some(start_rel) = login_url_start(search) else {
            break;
        };
        let start = offset + start_rel;
        let mut end = text.len();
        for (rel, ch) in text[start..].char_indices().skip(1) {
            if login_url_delimiter(ch) {
                end = start + rel;
                break;
            }
        }

        let candidate = trim_login_url_candidate(&text[start..end]);
        if candidate.starts_with("https://") || candidate.starts_with("http://") {
            return Some(candidate.to_string());
        }

        offset = end.saturating_add(1);
    }
    None
}

fn extract_login_url(text: &str) -> Option<String> {
    // Terminal CLIs often emit clickable OSC-8 hyperlinks. The ANSI stripper
    // discards OSC payloads, so first scan the raw stream and only then scan a
    // cleaned plain-text copy.
    extract_login_url_candidate(text).or_else(|| {
        let text = strip_ansi_sequences(text);
        extract_login_url_candidate(&text)
    })
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

fn oauth_browser_helper_path() -> Option<PathBuf> {
    let dir = std::env::temp_dir().join("atelier-oauth-browser");
    std::fs::create_dir_all(&dir).ok()?;

    #[cfg(target_os = "windows")]
    {
        let path = dir.join("open-url.cmd");
        let script = r#"@echo off
setlocal
set "url=%~1"
if "%url%"=="" exit /b 0
start "" "%url%"
exit /b 0
"#;
        std::fs::write(&path, script).ok()?;
        Some(path)
    }

    #[cfg(target_os = "macos")]
    {
        let path = dir.join("open-url.sh");
        let script = r#"#!/bin/sh
url="$1"
[ -n "$url" ] || exit 0
/usr/bin/open "$url" >/dev/null 2>&1
exit 0
"#;
        std::fs::write(&path, script).ok()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&path).ok()?.permissions();
            perms.set_mode(0o700);
            let _ = std::fs::set_permissions(&path, perms);
        }
        Some(path)
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let path = dir.join("open-url.sh");
        let script = r#"#!/bin/sh
url="$1"
[ -n "$url" ] || exit 0
xdg-open "$url" >/dev/null 2>&1
exit 0
"#;
        std::fs::write(&path, script).ok()?;
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&path).ok()?.permissions();
        perms.set_mode(0o700);
        let _ = std::fs::set_permissions(&path, perms);
        Some(path)
    }
}

fn configure_login_browser_env_for_command(command: &mut Command) {
    if let Some(helper) = oauth_browser_helper_path() {
        command.env("BROWSER", helper);
    }
}

fn configure_login_browser_env_for_pty(cmd: &mut CommandBuilder) {
    if let Some(helper) = oauth_browser_helper_path() {
        cmd.env("BROWSER", helper.to_string_lossy().into_owned());
    }
}

fn open_login_url_in_browser(url: &str) -> bool {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("cmd.exe");
        command.arg("/D").arg("/C").arg("start").arg("").arg(url);
        if spawn_background_null(command) {
            return true;
        }

        let mut command = Command::new("explorer.exe");
        command.arg(url);
        if spawn_background_null(command) {
            return true;
        }

        let mut command = Command::new("powershell.exe");
        command.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "Start-Process -FilePath $args[0]",
            url,
        ]);
        if spawn_background_null(command) {
            return true;
        }

        let mut command = Command::new("rundll32.exe");
        command.args(["url.dll,FileProtocolHandler", url]);
        if spawn_background_null(command) {
            return true;
        }

        false
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg(url);
        return spawn_background_null(command);
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        return spawn_background_null(command);
    }
}

fn watch_and_open_login_url(captured: Arc<Mutex<String>>) {
    thread::spawn(move || {
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(90) {
            let output = captured_login_output(&captured);
            if let Some(url) = extract_login_url(&output) {
                let _ = open_login_url_in_browser(&url);
                break;
            }
            thread::sleep(Duration::from_millis(250));
        }
    });
}

fn oauth_pty_login_command(cli: &str, login_args: &[&str]) -> CommandBuilder {
    #[cfg(target_os = "windows")]
    {
        // npm-installed CLIs are commonly .cmd shims on Windows. Running through
        // cmd.exe inside the PTY avoids Win32 executable errors while still
        // keeping the console hidden from the user.
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.args(["/D", "/C", cli]);
        cmd.args(login_args);
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

fn cache_claude_setup_token_if_available() {
    if !which("claude") {
        return;
    }
    let mut command = cli_command("claude");
    command
        .args(["setup-token"])
        .env("PATH", crate::augmented_cli_path())
        .stdin(Stdio::null());
    let Ok(Some(output)) = command_output_timeout(command, Duration::from_secs(20)) else {
        return;
    };
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push('\n');
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    let Some(token) = extract_claude_oauth_token_from_text(&combined) else {
        return;
    };
    cache_claude_oauth_token(&token);
}

fn cache_claude_oauth_token(token: &str) {
    let token = token.trim();
    if !token.contains("sk-ant-oat") {
        return;
    }
    if let Ok(entry) = keychain_entry("claude", "oauth_token") {
        if entry.set_password(token).is_ok() {
            set_oauth_state("claude", true);
        }
    }
}

#[cfg(target_os = "macos")]
fn macos_keychain_service_password(service: &str) -> Option<String> {
    let output = Command::new("/usr/bin/security")
        .args(["find-generic-password", "-s", service, "-w"])
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

fn sync_claude_code_oauth_keychain_to_app_cache() -> bool {
    #[cfg(target_os = "macos")]
    {
        let Some(secret) = macos_keychain_service_password("Claude Code-credentials") else {
            return false;
        };
        let Some(credential) = read_claude_oauth_credential_from_json_text(&secret) else {
            return false;
        };
        if credential.refresh.is_none() {
            return false;
        }
        if let Ok(entry) = keychain_entry("claude", "oauth_token") {
            if entry.set_password(secret.trim()).is_ok() {
                set_oauth_state("claude", true);
                return true;
            }
        }
        false
    }

    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

fn mark_oauth_login_success(provider: &str) {
    set_oauth_state(provider, true);
    if provider == "claude" {
        if sync_claude_code_oauth_keychain_to_app_cache() {
            let _ = sync_gajecode_claude_subscription_credential();
        } else {
            cache_claude_setup_token_if_available();
        }
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
    pub message: String,
}

fn keychain_entry(provider: &str, slot: &str) -> Result<Entry, String> {
    let username = format!("{provider}.{slot}");
    Entry::new(SERVICE, &username).map_err(|e| format!("keychain entry: {e}"))
}

fn keychain_username(provider: &str, slot: &str) -> String {
    format!("{provider}.{slot}")
}

fn keychain_item_exists(provider: &str, slot: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        let username = keychain_username(provider, slot);
        return Command::new("/usr/bin/security")
            .args(["find-generic-password", "-s", SERVICE, "-a", &username])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
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
# Claude subscription OAuth is synchronized into agent.db auth_credentials
# before each Gajae Code run. Keep models.yml free of apiKeyEnv so stored
# OAuth can refresh expired access tokens instead of being shadowed by config.
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

fn command_output_with_stdin_timeout(
    mut command: Command,
    input: &[u8],
    timeout: Duration,
) -> io::Result<Option<Output>> {
    configure_background_command(&mut command);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input)?;
        stdin.flush()?;
    }
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
    if provider == "codex" && which("codex") {
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
            if logged_in {
                let _ = sync_codex_auth_to_hermes();
            }
            return logged_in;
        }
    }

    if provider == "claude" && which("claude") {
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

fn home_file(parts: &[&str]) -> Option<PathBuf> {
    let mut path = PathBuf::from(std::env::var_os("HOME")?);
    for part in parts {
        path.push(part);
    }
    Some(path)
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

#[allow(dead_code)]
fn read_claude_oauth_token_from_json_text(text: &str) -> Option<String> {
    let value: Value = serde_json::from_str(text).ok()?;
    claude_oauth_token_from_value(&value)
}

fn read_claude_oauth_credential_from_json_text(
    text: &str,
) -> Option<ClaudeSubscriptionOauthCredential> {
    let value: Value = serde_json::from_str(text).ok()?;
    claude_oauth_credential_from_value(&value)
}

#[allow(dead_code)]
fn read_claude_oauth_token_from_credentials_file() -> Option<String> {
    let path = home_file(&[".claude", ".credentials.json"])?;
    let text = std::fs::read_to_string(path).ok()?;
    read_claude_oauth_token_from_json_text(&text)
}

fn read_claude_oauth_credential_from_credentials_file() -> Option<ClaudeSubscriptionOauthCredential>
{
    let path = home_file(&[".claude", ".credentials.json"])?;
    let text = std::fs::read_to_string(path).ok()?;
    read_claude_oauth_credential_from_json_text(&text)
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
        return macos_keychain_password(SERVICE, &username);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let entry = keychain_entry(provider, slot).ok()?;
        entry.get_password().ok()
    }
}

#[allow(dead_code)]
fn read_claude_oauth_token_from_atelier_keychain() -> Option<String> {
    let secret = read_app_keychain_password("claude", "oauth_token")?;
    let secret = secret.trim();
    if secret.contains("sk-ant-oat") && !secret.starts_with('{') {
        return Some(secret.to_string());
    }
    read_claude_oauth_token_from_json_text(secret)
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

    if let Some(token) = read_claude_oauth_token_from_credentials_file() {
        return Some(token);
    }

    // Normal command execution must not touch Claude Code's own Keychain item.
    // macOS will prompt for "Claude Code-credentials" every time Atelier reads
    // that external service. The app-owned cache is synchronized during the
    // explicit login/repair path and is the steady-state credential source.
    if let Some(token) = read_claude_oauth_token_from_atelier_keychain() {
        return Some(token);
    }

    None
}

pub fn read_claude_subscription_oauth_credential() -> Option<ClaudeSubscriptionOauthCredential> {
    let mut env_credential = None;
    for key in ["ANTHROPIC_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"] {
        if let Ok(token) = std::env::var(key) {
            let token = token.trim().to_string();
            if token.contains("sk-ant-oat") {
                let credential = ClaudeSubscriptionOauthCredential {
                    access: token,
                    refresh: std::env::var("CLAUDE_CODE_OAUTH_REFRESH_TOKEN")
                        .ok()
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty()),
                    expires: None,
                    scopes: std::env::var("CLAUDE_CODE_OAUTH_SCOPES")
                        .ok()
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty()),
                    subscription_type: None,
                };
                if credential.refresh.is_some() {
                    return Some(credential);
                }
                env_credential = Some(credential);
            }
        }
    }

    if let Some(credential) = read_claude_oauth_credential_from_credentials_file() {
        if credential.refresh.is_some() {
            return Some(credential);
        }
        env_credential.get_or_insert(credential);
    }

    if let Some(credential) = read_claude_oauth_credential_from_atelier_keychain() {
        if credential.refresh.is_some() {
            return Some(credential);
        }
        env_credential.get_or_insert(credential);
    }

    env_credential
}

fn sync_gajecode_claude_subscription_credential_value(
    credential: ClaudeSubscriptionOauthCredential,
) -> Result<bool, String> {
    let Some(refresh) = credential
        .refresh
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(false);
    };
    let Some(agent_dir) = gajecode_agent_dir() else {
        return Ok(false);
    };
    let Some(bun) = gajecode_bun_executable_path() else {
        return Ok(false);
    };

    std::fs::create_dir_all(&agent_dir)
        .map_err(|e| format!("create {}: {e}", agent_dir.display()))?;
    ensure_gajecode_models_config(&agent_dir)?;

    let agent_db = agent_dir.join("agent.db");
    let expires = credential
        .expires
        .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
    let payload = serde_json::json!({
        "agentDb": agent_db.to_string_lossy(),
        "access": credential.access,
        "refresh": refresh,
        "expires": expires,
        "scopes": credential.scopes,
        "subscriptionType": credential.subscription_type,
    })
    .to_string();
    let script = r#"
import { Database } from "bun:sqlite";

const chunks = [];
for await (const chunk of Bun.stdin.stream()) {
  chunks.push(Buffer.from(chunk));
}
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const db = new Database(input.agentDb);
db.exec(`
CREATE TABLE IF NOT EXISTS auth_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  data TEXT NOT NULL,
  disabled_cause TEXT,
  identity_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`);
const now = Math.floor(Date.now() / 1000);
const identityKey = "atelier-claude-subscription";
const data = JSON.stringify({
  access: input.access,
  refresh: input.refresh,
  expires: Number(input.expires) || Date.now(),
  ...(input.scopes ? { scopes: input.scopes } : {}),
  ...(input.subscriptionType ? { subscriptionType: input.subscriptionType } : {}),
});
const existing = db
  .query(`
    SELECT id
    FROM auth_credentials
    WHERE provider = 'anthropic'
      AND credential_type = 'oauth'
      AND (identity_key = ? OR identity_key IS NULL)
    ORDER BY CASE WHEN identity_key = ? THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `)
  .get(identityKey, identityKey);
if (existing?.id) {
  db.query(`
    UPDATE auth_credentials
    SET data = ?, identity_key = ?, disabled_cause = NULL, updated_at = ?
    WHERE id = ?
  `).run(data, identityKey, now, existing.id);
  console.log(JSON.stringify({ ok: true, action: "updated" }));
} else {
  db.query(`
    INSERT INTO auth_credentials
      (provider, credential_type, data, disabled_cause, identity_key, created_at, updated_at)
    VALUES ('anthropic', 'oauth', ?, NULL, ?, ?, ?)
  `).run(data, identityKey, now, now);
  console.log(JSON.stringify({ ok: true, action: "inserted" }));
}
db.close();
"#;

    let mut command = Command::new(bun);
    command.arg("--eval").arg(script);
    let output =
        command_output_with_stdin_timeout(command, payload.as_bytes(), Duration::from_secs(8))
            .map_err(|e| format!("가재코드 Claude 자격증명 동기화 실행 실패: {e}"))?;
    let Some(output) = output else {
        return Err("가재코드 Claude 자격증명 동기화 시간이 초과되었습니다.".to_string());
    };
    if !output.status.success() {
        return Err("가재코드 Claude 자격증명 동기화가 실패했습니다.".to_string());
    }
    Ok(true)
}

pub fn sync_gajecode_claude_subscription_credential() -> Result<bool, String> {
    let Some(credential) = read_claude_subscription_oauth_credential() else {
        return Ok(false);
    };
    sync_gajecode_claude_subscription_credential_value(credential)
}

pub fn repair_gajecode_claude_subscription_credential() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(secret) = macos_keychain_service_password("Claude Code-credentials") {
            if let Some(credential) = read_claude_oauth_credential_from_json_text(&secret) {
                if credential.refresh.is_some() {
                    if let Ok(entry) = keychain_entry("claude", "oauth_token") {
                        if entry.set_password(secret.trim()).is_ok() {
                            set_oauth_state("claude", true);
                        }
                    }
                    return sync_gajecode_claude_subscription_credential_value(credential);
                }
            }
        }
    }

    sync_gajecode_claude_subscription_credential()
}

pub fn gajecode_has_claude_subscription_credential() -> bool {
    let Some(agent_dir) = gajecode_agent_dir() else {
        return false;
    };
    let Some(bun) = gajecode_bun_executable_path() else {
        return false;
    };
    let agent_db = agent_dir.join("agent.db");
    if !agent_db.exists() {
        return false;
    }
    if std::fs::create_dir_all(&agent_dir).is_err() {
        return false;
    }
    if ensure_gajecode_models_config(&agent_dir).is_err() {
        return false;
    }

    let script = r#"
import { Database } from "bun:sqlite";

try {
  const db = new Database(process.env.ATELIER_GAJAECODE_AGENT_DB, { readonly: true });
  const row = db
    .query(`
      SELECT data, disabled_cause
      FROM auth_credentials
      WHERE provider = 'anthropic'
        AND credential_type = 'oauth'
      ORDER BY CASE WHEN disabled_cause IS NULL THEN 0 ELSE 1 END, updated_at DESC, id DESC
      LIMIT 1
    `)
    .get();
  db.close();
  if (!row || row.disabled_cause) {
    console.log("missing");
    process.exit(0);
  }
  const data = JSON.parse(row.data || "{}");
  const access = typeof data.access === "string" && data.access.trim();
  const refresh = typeof data.refresh === "string" && data.refresh.trim();
  console.log(access && refresh ? "ok" : "missing");
} catch {
  console.log("missing");
}
"#;

    let mut command = Command::new(bun);
    command
        .arg("--eval")
        .arg(script)
        .env("ATELIER_GAJAECODE_AGENT_DB", &agent_db);
    let Ok(Some(output)) = command_output_timeout(command, Duration::from_secs(4)) else {
        return false;
    };
    output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "ok"
}

fn json_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

pub fn sync_codex_auth_to_hermes() -> Result<bool, String> {
    let Some(codex_path) = home_file(&[".codex", "auth.json"]) else {
        return Ok(false);
    };
    let Some(hermes_path) = home_file(&[".hermes", "auth.json"]) else {
        return Ok(false);
    };

    let codex_text = match std::fs::read_to_string(&codex_path) {
        Ok(text) => text,
        Err(_) => return Ok(false),
    };
    let codex_auth: Value =
        serde_json::from_str(&codex_text).map_err(|e| format!("parse codex auth: {e}"))?;
    let Some(codex_tokens) = codex_auth.get("tokens") else {
        return Ok(false);
    };
    let access_token = json_string(codex_tokens, "access_token");
    let refresh_token = json_string(codex_tokens, "refresh_token");
    if access_token.is_empty() || refresh_token.is_empty() {
        return Ok(false);
    }

    let last_refresh = codex_auth
        .get("last_refresh")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let tokens_json = serde_json::json!({
        "id_token": json_string(codex_tokens, "id_token"),
        "access_token": access_token,
        "refresh_token": refresh_token,
        "account_id": json_string(codex_tokens, "account_id"),
    });

    let mut hermes_auth = match std::fs::read_to_string(&hermes_path) {
        Ok(text) => serde_json::from_str::<Value>(&text)
            .unwrap_or_else(|_| serde_json::json!({ "version": 1 })),
        Err(_) => serde_json::json!({ "version": 1 }),
    };
    if !hermes_auth.is_object() {
        hermes_auth = serde_json::json!({ "version": 1 });
    }
    let root = hermes_auth.as_object_mut().expect("object checked");

    if !root.get("providers").is_some_and(Value::is_object) {
        root.insert("providers".into(), serde_json::json!({}));
    }
    let providers = root
        .get_mut("providers")
        .and_then(Value::as_object_mut)
        .expect("providers object checked");
    let provider = providers
        .entry("openai-codex")
        .or_insert_with(|| serde_json::json!({}));
    if !provider.is_object() {
        *provider = serde_json::json!({});
    }
    if let Some(provider_obj) = provider.as_object_mut() {
        provider_obj.insert("tokens".into(), tokens_json.clone());
        provider_obj.insert("last_refresh".into(), Value::String(last_refresh.clone()));
        provider_obj.insert("auth_mode".into(), Value::String("device_code".into()));
    }

    if !root.get("credential_pool").is_some_and(Value::is_object) {
        root.insert("credential_pool".into(), serde_json::json!({}));
    }
    let pool_root = root
        .get_mut("credential_pool")
        .and_then(Value::as_object_mut)
        .expect("credential_pool object checked");
    let pool_value = pool_root
        .entry("openai-codex")
        .or_insert_with(|| serde_json::json!([]));
    if !pool_value.is_array() {
        *pool_value = serde_json::json!([]);
    }
    let pool = pool_value.as_array_mut().expect("pool array checked");
    if pool.is_empty() {
        pool.push(serde_json::json!({
            "id": "device_code",
            "label": "device_code",
            "auth_type": "oauth",
            "priority": 100,
            "source": "codex_cli"
        }));
    }
    for credential in pool.iter_mut() {
        if let Some(cred) = credential.as_object_mut() {
            cred.insert("access_token".into(), tokens_json["access_token"].clone());
            cred.insert("refresh_token".into(), tokens_json["refresh_token"].clone());
            cred.insert("last_refresh".into(), Value::String(last_refresh.clone()));
            cred.insert("last_status".into(), Value::Null);
            cred.insert("last_status_at".into(), Value::Null);
            cred.insert("last_error_code".into(), Value::Null);
            cred.insert("last_error_reason".into(), Value::Null);
            cred.insert("last_error_message".into(), Value::Null);
        }
    }

    root.insert(
        "active_provider".into(),
        Value::String("openai-codex".into()),
    );
    root.insert("updated_at".into(), Value::String(last_refresh));

    if let Some(parent) = hermes_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let serialized = serde_json::to_string_pretty(&hermes_auth)
        .map_err(|e| format!("serialize hermes auth: {e}"))?;
    std::fs::write(&hermes_path, serialized).map_err(|e| format!("write hermes auth: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(&hermes_path) {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o600);
            let _ = std::fs::set_permissions(&hermes_path, permissions);
        }
    }
    set_oauth_state("codex", true);
    Ok(true)
}

#[tauri::command]
pub async fn provider_status(provider: String) -> Result<ProviderStatus, String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    let cli_installed = if provider == "gajecode" {
        gajecode_cli_installed()
    } else {
        meta.cli.map(which).unwrap_or(false)
    };
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
    let cli_installed = if provider == "gajecode" {
        gajecode_cli_installed()
    } else {
        which(cli)
    };
    if !cli_installed {
        return Err(format!("CLI '{cli}' is not installed"));
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
            message: "OAuth is already connected.".into(),
        });
    }
    if force_login {
        if let Err(e) = run_oauth_logout(&provider, cli) {
            log::warn!("forced oauth logout before login failed for {provider}: {e}");
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
        if oauth_login_uses_pty(&provider) {
            let pty_system = NativePtySystem::default();
            let pair = pty_system
                .openpty(PtySize {
                    rows: 24,
                    cols: 120,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("oauth openpty {cli_owned} {cmd_owned}: {e}"))?;
            let cmd = oauth_pty_login_command(&cli_owned, &login_args);
            let mut child = pair
                .slave
                .spawn_command(cmd)
                .map_err(|e| format!("oauth spawn {cli_owned} {cmd_owned}: {e}"))?;
            drop(pair.slave);

            let captured = Arc::new(Mutex::new(String::new()));
            let reader = pair
                .master
                .try_clone_reader()
                .map_err(|e| format!("oauth clone reader {cli_owned} {cmd_owned}: {e}"))?;
            let writer = pair
                .master
                .take_writer()
                .map_err(|e| format!("oauth take writer {cli_owned} {cmd_owned}: {e}"))?;
            store_oauth_login_pty_writer(&provider_clone, writer);
            capture_login_pipe(reader, captured.clone());

            let started = Instant::now();
            let mut browser_opened = false;
            let mut login_url_detected = false;
            loop {
                if !login_url_detected {
                    let output = captured_login_output(&captured);
                    if let Some(url) = extract_login_url(&output) {
                        login_url_detected = true;
                        browser_opened = open_login_url_in_browser(&url);
                    }
                }

                match child
                    .try_wait()
                    .map_err(|e| format!("{cli_owned} {cmd_owned} poll: {e}"))?
                {
                    Some(status) if status.success() => {
                        let _ = child.wait();
                        forget_oauth_login_stdin(&provider_clone);
                        mark_oauth_login_success(&provider_clone);
                        return Ok(ProviderLoginOauthResult {
                            provider,
                            command: command_label,
                            started: true,
                            completed: true,
                            already_logged_in: false,
                            browser_opened,
                            login_url_detected,
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
                            watch_and_open_login_url(captured.clone());
                        }

                        let master = pair.master;
                        std::thread::spawn(move || {
                            let _keep_master_alive = master;
                            match child.wait() {
                                Ok(status) if status.success() => {
                                    forget_oauth_login_stdin(&provider_clone);
                                    mark_oauth_login_success(&provider_clone);
                                }
                                Ok(status) => {
                                    forget_oauth_login_stdin(&provider_clone);
                                    let detail = login_failure_detail_text(&captured_login_output(
                                        &captured,
                                    ));
                                    if detail.trim().is_empty() {
                                        log::warn!(
                                            "{cli_owned} {cmd_owned} exited with {status:?}"
                                        );
                                    } else {
                                        log::warn!(
                                            "{cli_owned} {cmd_owned} exited with {status:?}: {detail}"
                                        );
                                    }
                                }
                                Err(e) => {
                                    forget_oauth_login_stdin(&provider_clone);
                                    log::warn!("{cli_owned} wait: {e}");
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
        let mut child = command
            .spawn()
            .map_err(|e| format!("oauth spawn {cli_owned} {cmd_owned}: {e}"))?;
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

        // Claude/Codex CLI가 Windows에서 즉시 실패하는 경우에는 "브라우저가 열렸습니다"
        // 모달을 띄우면 사용자가 무한 대기 상태로 보인다. 짧게만 관찰해서 즉시 실패는
        // 호출자에게 돌려주고, 실제 로그인 대기는 백그라운드에서 계속 처리한다.
        let started = Instant::now();
        let mut browser_opened = false;
        let mut login_url_detected = false;
        loop {
            if !login_url_detected {
                let output = captured_login_output(&captured);
                if let Some(url) = extract_login_url(&output) {
                    login_url_detected = true;
                    browser_opened = open_login_url_in_browser(&url);
                }
            }
            match child
                .try_wait()
                .map_err(|e| format!("{cli_owned} {cmd_owned} poll: {e}"))?
            {
                Some(status) if status.success() => {
                    let _ = child.wait();
                    forget_oauth_login_stdin(&provider_clone);
                    mark_oauth_login_success(&provider_clone);
                    return Ok(ProviderLoginOauthResult {
                        provider,
                        command: command_label,
                        started: true,
                        completed: true,
                        already_logged_in: false,
                        browser_opened,
                        login_url_detected,
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
                        watch_and_open_login_url(captured.clone());
                    }

                    std::thread::spawn(move || match child.wait() {
                        Ok(status) if status.success() => {
                            forget_oauth_login_stdin(&provider_clone);
                            mark_oauth_login_success(&provider_clone);
                        }
                        Ok(status) => {
                            forget_oauth_login_stdin(&provider_clone);
                            let detail =
                                login_failure_detail_text(&captured_login_output(&captured));
                            if detail.trim().is_empty() {
                                log::warn!("{cli_owned} {cmd_owned} exited with {status}");
                            } else {
                                log::warn!(
                                    "{cli_owned} {cmd_owned} exited with {status}: {detail}"
                                );
                            }
                        }
                        Err(e) => {
                            forget_oauth_login_stdin(&provider_clone);
                            log::warn!("{cli_owned} wait: {e}");
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
pub async fn provider_install_cli(provider: String) -> Result<(), String> {
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
    label: &'static str,
    after_success: Option<fn()>,
) -> Result<(), String> {
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
            Ok(mut child) => match child.wait() {
                Ok(status) if status.success() => {
                    log::info!("{label} install completed");
                    if let Some(callback) = after_success {
                        callback();
                    }
                }
                Ok(status) => log::warn!("{label} install exited with {status}"),
                Err(e) => log::warn!("{label} install wait: {e}"),
            },
            Err(e) => log::warn!("{label} install spawn: {e}"),
        }
    });
    Ok(())
}

fn install_npm_cli(label: &'static str, pkg: &'static str) -> Result<(), String> {
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
    spawn_cli_installer(command, label, None)
}

fn install_claude_cli() -> Result<(), String> {
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
        return spawn_cli_installer(command, "claude", None);
    }

    #[cfg(not(target_os = "windows"))]
    install_npm_cli("claude", "@anthropic-ai/claude-code")
}

fn install_hermes_cli() -> Result<(), String> {
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
        return spawn_cli_installer(command, "hermes", None);
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
        spawn_cli_installer(command, "hermes", None)
    }
}

fn install_gajecode_cli() -> Result<(), String> {
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
    spawn_cli_installer(command, "gajecode", None)
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
        .split(|c: char| c == '.' || c == '-' || c == '_')
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
    install_gajecode_cli()
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
    if matches!(provider, "claude" | "codex") && !state.oauth_logged_in && state.api_key_present {
        if detect_oauth(provider) {
            return None;
        }
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
    fn claude_subscription_login_falls_back_to_setup_token() {
        assert_eq!(
            oauth_login_attempts("claude", "login"),
            vec![vec!["setup-token"], vec!["auth", "login", "--claudeai"]]
        );
        assert_eq!(oauth_login_attempts("codex", "login"), vec![vec!["login"]]);
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
        let detail = redact_login_output(
            "Opening browser\nhttps://claude.com/cai/oauth/authorize?code_challenge=secret\naccess_token=abc",
        );
        assert!(detail.contains("Opening browser"));
        assert!(detail.contains("[login url redacted]"));
        assert!(detail.contains("[credential output redacted]"));
        assert!(!detail.contains("code_challenge=secret"));
        assert!(!detail.contains("access_token=abc"));
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
    fn claude_oauth_token_parser_rejects_expired_tokens() {
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
