// 사용자 구독·API 자격증명 관리.
// macOS: Keychain / Windows: Credential Manager (keyring crate가 OS 네이티브 보안 저장소 사용).
// 평문 디스크 저장 금지. profiles JSON에는 boolean 플래그만.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::Entry;
use once_cell::sync::Lazy;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Output, Stdio};
use std::sync::{Arc, Mutex, MutexGuard, TryLockError};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime, Url};

const SERVICE: &str = "com.atelier.app";
// OAuth authorize URLs can exceed several hundred characters. A normal
// 80/120-column PTY may hard-wrap the query string and truncate redirect_uri,
// state, or PKCE parameters before Atelier can open the URL.
const OAUTH_LOGIN_PTY_COLS: u16 = 2048;
const CODEX_DEVICE_AUTH_URL: &str = "https://auth.openai.com/codex/device";
const GAJAE_CODE_PACKAGE_NAME: &str = "gajae-code";
const CLAUDE_CODE_PACKAGE: &str = "@anthropic-ai/claude-code@2.1.217";
const CODEX_PACKAGE: &str = "@openai/codex@0.145.0";
#[cfg(not(target_os = "macos"))]
const BUN_PACKAGE: &str = "bun@1.3.14";
const GAJAE_CODE_PACKAGE: &str = "gajae-code@0.11.7";
const BUN_VERSION: &str = "1.3.14";
const GAJAE_CODE_VERSION: &str = "0.11.7";
const HERMES_GIT_SPEC: &str =
    "git+https://github.com/NousResearch/hermes-agent.git@3ef6bbd201263d354fd83ec55b3c306ded2eb72a";
const HERMES_COMMIT: &str = "3ef6bbd201263d354fd83ec55b3c306ded2eb72a";
const UV_BOOTSTRAP_VERSION: &str = "0.10.12";
const MANAGED_RUNTIME_RECEIPT_SCHEMA: u32 = 2;
const MANAGED_RUNTIME_POLICY_VERSION: &str = "atelier-managed-basic-auto-v1";
const MANAGED_SKILL_BOOTSTRAP_VERSION: &str = "atelier-default-skills-integrity-v2";
const MANAGED_RUNTIME_CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const MANAGED_RUNTIME_LOCK_WAIT: Duration = Duration::from_secs(21 * 60);
const MANAGED_RECEIPT_MAX_BYTES: u64 = 64 * 1024;
const CODEX_AUTH_MAX_BYTES: u64 = 64 * 1024;
const CODEX_ACCESS_TOKEN_MAX_BYTES: usize = 32 * 1024;
const CODEX_ACCESS_TOKEN_MIN_FRESHNESS_SECONDS: i64 = 60;
const HERMES_SKILL_MANIFEST_MAX_BYTES: u64 = 1024 * 1024;
const HERMES_SKILL_MANIFEST_MAX_ENTRIES: usize = 4096;
const MANAGED_SKILL_TREE_MAX_FILES: usize = 65_536;
const MANAGED_SKILL_TREE_MAX_BYTES: u64 = 256 * 1024 * 1024;
const MANAGED_SKILL_TREE_MAX_DEPTH: usize = 32;
const HERMES_BUNDLED_SOURCE_DIRECTORY: &str = "bundled";
const HERMES_BUNDLED_SOURCE_MANIFEST: &str = ".atelier-bundled-skills.sha256.json";
const HERMES_BUNDLED_SOURCE_SCHEMA: u32 = 1;
const HERMES_GIT_CACHE_SCAN_MAX_ENTRIES: usize = 4096;
const HERMES_GIT_CACHE_SCAN_MAX_DEPTH: usize = 6;
const HERMES_GIT_OUTPUT_MAX_BYTES: usize = 8 * 1024 * 1024;
const GAJAE_SKILL_INTEGRITY_MANIFEST: &str = ".atelier-default-skills.sha256.json";
const GAJAE_SKILL_INTEGRITY_SCHEMA: u32 = 1;
const GAJAE_DEFAULT_SKILLS: [&str; 4] = ["deep-interview", "ralplan", "team", "ultragoal"];
// Primary release provenance:
// https://releases.astral.sh/github/uv/releases/download/0.10.12/
// https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/SHASUMS256.txt
const UV_MACOS_AARCH64_SHA256: &str =
    "ae738b5661a900579ec621d3918c0ef17bdec0da2a8a6d8b161137cd15f25414";
const UV_MACOS_X86_64_SHA256: &str =
    "17443e293f2ae407bb2d8d34b875ebfe0ae01cf1296de5647e69e7b2e2b428f0";
const BUN_MACOS_AARCH64_SHA256: &str =
    "d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620";
const BUN_MACOS_X86_64_SHA256: &str =
    "4183df3374623e5bab315c547cfa0974533cd457d86b73b639f7a87974cd6633";
const CLI_INSTALL_TIMEOUT: Duration = Duration::from_secs(20 * 60);
const CLI_INSTALL_CAPTURE_LIMIT: usize = 64 * 1024;

static HERMES_RUNTIME_INSTALL_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static GAJAE_RUNTIME_INSTALL_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedAgentRuntimeReadiness {
    pub provider: String,
    pub ready: bool,
    pub repaired: bool,
    pub executable: String,
    pub provider_root: String,
    pub home_dir: String,
    pub state_dir: String,
    pub cache_dir: String,
    pub temp_dir: String,
    pub skills_dir: String,
    pub workspace_dir: Option<String>,
    pub runtime_pin: String,
    pub dependency_pin: Option<String>,
    pub policy_version: String,
    pub skill_bootstrap_version: String,
    pub receipt_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedAgentRuntimeProgress {
    provider: String,
    state: String,
    message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ManagedRuntimeReceipt {
    schema_version: u32,
    provider: String,
    runtime_pin: String,
    dependency_pin: Option<String>,
    policy_version: String,
    skill_bootstrap_version: String,
    executable: String,
    skills_dir: String,
    verified_skill_count: usize,
}

#[derive(Clone, Debug)]
struct ManagedRuntimeLayout {
    provider: &'static str,
    root: PathBuf,
    home: PathBuf,
    state: PathBuf,
    cache: PathBuf,
    temp: PathBuf,
    skills: PathBuf,
    workspace: Option<PathBuf>,
    receipt: PathBuf,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ManagedSkillFileHash {
    path: String,
    sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ManagedSkillIntegrityManifest {
    schema_version: u32,
    provider: String,
    runtime_pin: String,
    files: Vec<ManagedSkillFileHash>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct HermesGitTreeEntry {
    path: String,
    object_id: String,
    size: u64,
}

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

#[derive(Debug, Deserialize)]
struct CodexAuthSession {
    auth_mode: String,
    tokens: CodexAccessTokens,
}

#[derive(Debug, Deserialize)]
struct CodexAccessTokens {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct CodexJwtHeader {
    alg: String,
}

#[derive(Debug, Deserialize)]
struct CodexJwtClaims {
    exp: i64,
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
        "alibaba" => Some(ProviderMeta {
            cli: None,
            login_cmd: None,
            env_var: Some("DASHSCOPE_API_KEY"),
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

fn managed_runtime_layout_at(
    app_support: &Path,
    provider: &str,
) -> Result<ManagedRuntimeLayout, String> {
    let (provider, root, home, state, cache, temp, skills, workspace) = match provider {
        "hermes" => {
            let root = app_support.join("providers").join("hermes");
            let home = root.join("home");
            (
                "hermes",
                root.clone(),
                home.clone(),
                root.join("state"),
                root.join("cache"),
                root.join("tmp"),
                home.join("skills"),
                None,
            )
        }
        "gajecode" => {
            let root = app_support.join("providers").join("gajecode");
            let home = root.join("home");
            let agent = home.join(".gjc").join("agent");
            (
                "gajecode",
                root.clone(),
                home,
                root.join("xdg-data"),
                root.join("xdg-cache"),
                root.join("tmp"),
                agent.join("skills"),
                Some(root.join("workspace")),
            )
        }
        _ => {
            return Err(format!(
                "Managed runtime preparation is not available for {provider}."
            ))
        }
    };
    Ok(ManagedRuntimeLayout {
        provider,
        receipt: root.join("readiness.json"),
        root,
        home,
        state,
        cache,
        temp,
        skills,
        workspace,
    })
}

fn ensure_runtime_layout(layout: &ManagedRuntimeLayout) -> Result<(), String> {
    for dir in [
        &layout.root,
        &layout.home,
        &layout.state,
        &layout.cache,
        &layout.temp,
        &layout.skills,
    ] {
        std::fs::create_dir_all(dir)
            .map_err(|error| format!("create {}: {error}", dir.display()))?;
    }
    if let Some(workspace) = &layout.workspace {
        std::fs::create_dir_all(workspace)
            .map_err(|error| format!("create {}: {error}", workspace.display()))?;
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct HermesInstallRecord {
    spec: String,
    executable: String,
}

fn hermes_provider_root_at(app_support: &Path) -> PathBuf {
    app_support.join("providers").join("hermes")
}

fn hermes_provider_root() -> Option<PathBuf> {
    Some(hermes_provider_root_at(&app_support_dir()?))
}

fn hermes_install_record_path_at(app_support: &Path) -> PathBuf {
    hermes_provider_root_at(app_support).join("install.json")
}

fn hermes_install_record_path() -> Option<PathBuf> {
    Some(hermes_install_record_path_at(&app_support_dir()?))
}

fn hermes_uv_tool_dir_at(app_support: &Path) -> PathBuf {
    hermes_provider_root_at(app_support).join("uv-tools")
}

fn hermes_uv_package_dir_at(app_support: &Path) -> PathBuf {
    hermes_uv_tool_dir_at(app_support).join("hermes-agent")
}

fn hermes_uv_bin_dir_at(app_support: &Path) -> PathBuf {
    hermes_uv_package_dir_at(app_support).join("bin")
}

fn hermes_uv_python_dir_at(app_support: &Path) -> PathBuf {
    hermes_provider_root_at(app_support).join("uv-python")
}

fn hermes_bundled_source_root_at(app_support: &Path) -> PathBuf {
    hermes_provider_root_at(app_support).join(HERMES_BUNDLED_SOURCE_DIRECTORY)
}

fn hermes_bundled_skills_dir_at(app_support: &Path) -> PathBuf {
    hermes_bundled_source_root_at(app_support).join("skills")
}

fn hermes_bundled_source_manifest_path_at(app_support: &Path) -> PathBuf {
    hermes_bundled_source_root_at(app_support).join(HERMES_BUNDLED_SOURCE_MANIFEST)
}

fn load_hermes_install_record() -> Option<HermesInstallRecord> {
    let text = std::fs::read_to_string(hermes_install_record_path()?).ok()?;
    serde_json::from_str(&text).ok()
}

fn save_hermes_install_record_at(app_support: &Path, executable: &Path) -> Result<(), String> {
    let path = hermes_install_record_path_at(app_support);
    let parent = path
        .parent()
        .ok_or_else(|| "Could not resolve the Atelier Hermes state directory.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create {}: {error}", parent.display()))?;
    let executable = std::fs::canonicalize(executable).unwrap_or_else(|_| executable.to_path_buf());
    let record = HermesInstallRecord {
        spec: HERMES_GIT_SPEC.to_string(),
        executable: executable.to_string_lossy().into_owned(),
    };
    let text = serde_json::to_string_pretty(&record)
        .map_err(|error| format!("serialize Hermes install record: {error}"))?;
    std::fs::write(&path, format!("{text}\n"))
        .map_err(|error| format!("write {}: {error}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn hermes_managed_executable_path_at(app_support: &Path) -> Option<PathBuf> {
    let bins = [
        hermes_uv_bin_dir_at(app_support),
        hermes_provider_root_at(app_support).join("bin"),
    ];
    let names: &[&str] = if cfg!(target_os = "windows") {
        &["hermes.exe", "hermes.cmd", "hermes.bat", "hermes"]
    } else {
        &["hermes"]
    };
    bins.into_iter().find_map(|bin| {
        names.iter().find_map(|name| {
            let candidate = bin.join(name);
            candidate
                .is_file()
                .then(|| std::fs::canonicalize(&candidate).unwrap_or(candidate))
        })
    })
}

pub fn hermes_managed_executable_path() -> Option<PathBuf> {
    hermes_managed_executable_path_at(&app_support_dir()?)
}

pub fn hermes_executable_path() -> Option<PathBuf> {
    if let Some(path) = hermes_managed_executable_path() {
        return Some(path);
    }
    if let Some(record) = load_hermes_install_record() {
        let path = PathBuf::from(record.executable);
        if path.is_file() {
            return Some(std::fs::canonicalize(&path).unwrap_or(path));
        }
    }
    let discovered = crate::agent_process::resolve_cli_executable("hermes");
    discovered
        .is_file()
        .then(|| std::fs::canonicalize(&discovered).unwrap_or(discovered))
}

fn hermes_install_record_is_current() -> bool {
    load_hermes_install_record().is_some_and(|record| {
        let executable = PathBuf::from(record.executable);
        record.spec == HERMES_GIT_SPEC
            && executable.is_file()
            && hermes_provider_root().is_some_and(|root| executable.starts_with(root))
    })
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
    Some(gajecode_agent_dir()?.join("skills"))
}

fn gajecode_agent_dir() -> Option<PathBuf> {
    Some(gajecode_home_dir()?.join(".gjc").join("agent"))
}

fn gajecode_models_config_content() -> &'static str {
    r#"# Atelier managed default for the isolated Gajae Code runtime.
# Provider credentials are injected only into the Gajae child process.
# This file never stores API keys, OAuth tokens, or subscription credentials.
providers:
  alibaba-token-plan:
    baseUrl: https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
    apiKeyEnv: DASHSCOPE_API_KEY
    api: openai-completions
    auth: apiKey
    compat:
      supportsDeveloperRole: false
    models:
      - id: qwen3.8-max-preview
        name: Qwen 3.8 Max Preview
        reasoning: true
        input: [text, image]
        contextWindow: 1000000
        maxTokens: 65536
        thinking:
          mode: effort
          minLevel: minimal
          maxLevel: high
        compat:
          supportsReasoningEffort: false
          thinkingFormat: qwen
      - id: glm-5.2
        name: GLM 5.2
        reasoning: true
        input: [text]
        contextWindow: 1000000
        maxTokens: 65536
        thinking:
          mode: effort
          minLevel: minimal
          maxLevel: max
        compat:
          supportsReasoningEffort: true
          thinkingFormat: openai
"#
}

fn ensure_gajecode_models_config(agent_dir: &Path) -> Result<(), String> {
    let path = agent_dir.join("models.yml");
    let content = gajecode_models_config_content();
    if path.exists() {
        if let Ok(existing) = std::fs::read_to_string(&path) {
            let is_atelier_managed =
                existing.contains("# Atelier managed default for the isolated Gajae Code runtime.");
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

fn gajecode_bun_executable_path_at(app_support: &Path) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") {
        "bun.exe"
    } else {
        "bun"
    };
    let direct = app_support
        .join("providers")
        .join("gajecode")
        .join("bun")
        .join("bin")
        .join(name);
    direct
        .is_file()
        .then(|| std::fs::canonicalize(&direct).unwrap_or(direct))
}

fn gajecode_bun_executable_path() -> Option<PathBuf> {
    gajecode_bun_executable_path_at(&app_support_dir()?)
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

fn gajecode_executable_path_at(app_support: &Path) -> Option<PathBuf> {
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
    let root = app_support.join("providers").join("gajecode");
    let home = root.join("home");
    for dir in [root.join("bun").join("bin"), home.join(".bun").join("bin")] {
        for name in &names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(std::fs::canonicalize(&candidate).unwrap_or(candidate));
            }
        }
    }
    None
}

pub fn gajecode_executable_path() -> Option<PathBuf> {
    gajecode_executable_path_at(&app_support_dir()?)
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

fn clear_bootstrap_credential_env(command: &mut Command) {
    for key in [
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_OAUTH_TOKEN",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "OPENAI_CODEX_OAUTH_TOKEN",
        "OPENAI_OAUTH_TOKEN",
        "CODEX_OAUTH_TOKEN",
        "CHATGPT_ACCESS_TOKEN",
        "OPENAI_ACCESS_TOKEN",
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "DASHSCOPE_API_KEY",
        "OPENROUTER_API_KEY",
        "GITHUB_TOKEN",
        "GH_TOKEN",
    ] {
        command.env_remove(key);
    }
}

fn configure_hermes_runtime_env_at(
    command: &mut Command,
    app_support: &Path,
) -> Result<(), String> {
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    ensure_runtime_layout(&layout)?;
    let config = layout.state.join("config");
    let data = layout.state.join("data");
    std::fs::create_dir_all(&config)
        .map_err(|error| format!("create {}: {error}", config.display()))?;
    std::fs::create_dir_all(&data)
        .map_err(|error| format!("create {}: {error}", data.display()))?;
    clear_bootstrap_credential_env(command);
    for key in [
        "HERMES_PROFILE",
        "HERMES_CONFIG",
        "HERMES_CONFIG_PATH",
        "HERMES_BUNDLED_SKILLS",
        "HERMES_EXTERNAL_SKILLS_DIRS",
        "PYTHONHOME",
        "PYTHONPATH",
    ] {
        command.env_remove(key);
    }
    command
        .env("HOME", &layout.home)
        .env("USERPROFILE", &layout.home)
        .env("HERMES_HOME", &layout.home)
        .env("XDG_CONFIG_HOME", &config)
        .env("XDG_DATA_HOME", &data)
        .env("XDG_CACHE_HOME", &layout.cache)
        .env(
            "UV_PYTHON_INSTALL_DIR",
            hermes_uv_python_dir_at(app_support),
        )
        .env("TMPDIR", &layout.temp)
        .env("ATELIER_PROVIDER_ID", "hermes")
        .env("ATELIER_SKILLS_DIR", &layout.skills);
    Ok(())
}

pub fn configure_hermes_runtime_env(command: &mut Command) -> Result<(), String> {
    let app_support = app_support_dir()
        .ok_or_else(|| "Could not resolve the Atelier Hermes directory.".to_string())?;
    configure_hermes_runtime_env_at(command, &app_support)
}

fn configure_gajecode_runtime_env_at(
    command: &mut Command,
    app_support: &Path,
) -> Result<(), String> {
    let layout = managed_runtime_layout_at(app_support, "gajecode")?;
    ensure_runtime_layout(&layout)?;
    let root = layout.root;
    let home = layout.home;
    let workspace = layout
        .workspace
        .ok_or_else(|| "Could not resolve the 가재코드 workspace directory.".to_string())?;
    let skills = layout.skills;
    let config = root.join("xdg-config");
    let data = root.join("xdg-data");
    let cache = root.join("xdg-cache");
    let temp = root.join("tmp");
    let agent_dir = home.join(".gjc").join("agent");
    let bun_install = root.join("bun");
    for dir in [
        &root,
        &home,
        &workspace,
        &skills,
        &config,
        &data,
        &cache,
        &temp,
        &agent_dir,
        &bun_install,
    ] {
        std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    }
    ensure_gajecode_models_config(&agent_dir)?;
    let gjc_home = home.join(".gjc");
    clear_bootstrap_credential_env(command);
    for key in [
        "CODEX_HOME",
        "CLAUDE_CONFIG_DIR",
        "HERMES_HOME",
        "GJC_CONFIG_DIR",
        "GJC_SKILLS_DIR",
    ] {
        command.env_remove(key);
    }
    let runtime_path = {
        let mut paths = vec![bun_install.join("bin"), home.join(".bun").join("bin")];
        paths.extend(std::env::split_paths(&crate::augmented_cli_path()));
        std::env::join_paths(paths)
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|_| crate::augmented_cli_path())
    };
    command
        .env("PATH", runtime_path)
        .env("HOME", &home)
        .env("USERPROFILE", &home)
        .env("XDG_CONFIG_HOME", &config)
        .env("XDG_DATA_HOME", &data)
        .env("XDG_CACHE_HOME", &cache)
        .env("TMPDIR", &temp)
        .env("BUN_INSTALL", &bun_install)
        .env("GJC_HOME", &gjc_home)
        .env("GAJAE_CODE_HOME", &gjc_home)
        .env("GJC_CONFIG_DIR", &gjc_home)
        .env("GJC_CODING_AGENT_DIR", &agent_dir)
        .env("ATELIER_PROVIDER_ID", "gajecode")
        .env("ATELIER_SKILLS_DIR", &skills);
    Ok(())
}

pub fn configure_gajecode_runtime_env(command: &mut Command) -> Result<(), String> {
    let app_support = app_support_dir()
        .ok_or_else(|| "Could not resolve the Atelier Gajaecode directory.".to_string())?;
    configure_gajecode_runtime_env_at(command, &app_support)
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
        "alibaba" => key.starts_with("sk-") && key.len() >= 20,
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
    if matches!(provider, "hermes" | "gajecode") {
        return app_support_dir()
            .is_some_and(|app_support| verify_managed_runtime_at(&app_support, provider).is_ok());
    }
    meta.cli
        .map(|cli| cli_runs_for_provider(provider, cli))
        .unwrap_or(false)
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

fn oauth_probe_result(cached: bool, detected: Option<bool>) -> bool {
    detected.unwrap_or(cached)
}

fn resolve_oauth_probe(provider: &str, detected: Option<bool>) -> bool {
    if let Some(logged_in) = detected {
        set_oauth_state(provider, logged_in);
        logged_in
    } else {
        // A timeout or spawn failure is not proof that a valid subscription
        // session was revoked. Keep the last verified state until the CLI
        // returns an authoritative logged-in/logged-out result.
        oauth_probe_result(credential_state(provider).oauth_logged_in, None)
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
        let detected = match status {
            Ok(Some(output)) => {
                let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
                combined.push('\n');
                combined.push_str(&String::from_utf8_lossy(&output.stderr));
                Some(output.status.success() && combined.to_ascii_lowercase().contains("logged in"))
            }
            Ok(None) | Err(_) => None,
        };
        return resolve_oauth_probe(provider, detected);
    }

    if provider == "claude" && cli_runs_for_provider(provider, "claude") {
        let mut command = cli_command("claude");
        command
            .args(["auth", "status"])
            .env("PATH", crate::augmented_cli_path());
        let status = command_output_timeout(command, Duration::from_secs(3));
        let detected = match status {
            Ok(Some(output)) => {
                let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
                combined.push('\n');
                combined.push_str(&String::from_utf8_lossy(&output.stderr));
                Some(
                    output.status.success()
                        && serde_json::from_str::<Value>(&combined)
                            .ok()
                            .and_then(|value| value.get("loggedIn").and_then(Value::as_bool))
                            .unwrap_or_else(|| {
                                combined.to_ascii_lowercase().contains("loggedin\": true")
                            }),
                )
            }
            Ok(None) | Err(_) => None,
        };
        return resolve_oauth_probe(provider, detected);
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

fn codex_home_from_process_env() -> Result<PathBuf, String> {
    let home = if let Some(value) = std::env::var_os("CODEX_HOME").filter(|value| !value.is_empty())
    {
        PathBuf::from(value)
    } else {
        let user_home = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Codex home directory is unavailable.".to_string())?;
        PathBuf::from(user_home).join(".codex")
    };
    if !home.is_absolute() {
        return Err("Codex home directory must be an absolute path.".to_string());
    }
    Ok(home)
}

fn validated_codex_auth_path_at(codex_home: &Path) -> Result<PathBuf, String> {
    if !codex_home.is_absolute() {
        return Err("Codex home directory must be an absolute path.".to_string());
    }
    let home_metadata = std::fs::symlink_metadata(codex_home)
        .map_err(|_| "Codex session directory is unavailable.".to_string())?;
    if home_metadata.file_type().is_symlink() || !home_metadata.is_dir() {
        return Err("Codex session directory is not a trusted regular directory.".to_string());
    }

    let auth_path = codex_home.join("auth.json");
    let auth_metadata = std::fs::symlink_metadata(&auth_path)
        .map_err(|_| "Codex subscription session file is unavailable.".to_string())?;
    if auth_metadata.file_type().is_symlink() || !auth_metadata.is_file() {
        return Err("Codex subscription session file is not a trusted regular file.".to_string());
    }
    if auth_metadata.len() == 0 || auth_metadata.len() > CODEX_AUTH_MAX_BYTES {
        return Err("Codex subscription session file has an invalid size.".to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if auth_metadata.permissions().mode() & 0o077 != 0 {
            return Err("Codex subscription session file permissions are too broad.".to_string());
        }
    }

    let canonical_home = std::fs::canonicalize(codex_home)
        .map_err(|_| "Codex session directory could not be verified.".to_string())?;
    let canonical_auth = std::fs::canonicalize(&auth_path)
        .map_err(|_| "Codex subscription session file could not be verified.".to_string())?;
    if canonical_auth.parent() != Some(canonical_home.as_path()) {
        return Err("Codex subscription session file escaped its expected directory.".to_string());
    }
    Ok(auth_path)
}

fn open_validated_codex_auth_file(codex_home: &Path) -> Result<File, String> {
    let auth_path = validated_codex_auth_path_at(codex_home)?;
    let before = std::fs::symlink_metadata(&auth_path)
        .map_err(|_| "Codex subscription session file is unavailable.".to_string())?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW);
    }
    let file = options
        .open(&auth_path)
        .map_err(|_| "Codex subscription session file could not be opened safely.".to_string())?;
    let opened = file
        .metadata()
        .map_err(|_| "Codex subscription session file metadata is unavailable.".to_string())?;
    if !opened.is_file() || opened.len() == 0 || opened.len() > CODEX_AUTH_MAX_BYTES {
        return Err("Codex subscription session file changed during validation.".to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if before.dev() != opened.dev() || before.ino() != opened.ino() {
            return Err("Codex subscription session file changed during validation.".to_string());
        }
    }
    Ok(file)
}

fn validate_codex_access_token(token: &str, now_unix_seconds: i64) -> Result<(), String> {
    let token = token.trim();
    if token.len() > CODEX_ACCESS_TOKEN_MAX_BYTES {
        return Err("Codex access token has an invalid size.".to_string());
    }
    let mut segments = token.split('.');
    let header_segment = segments
        .next()
        .filter(|segment| !segment.is_empty())
        .ok_or_else(|| "Codex access token is not a JWT.".to_string())?;
    let claims_segment = segments
        .next()
        .filter(|segment| !segment.is_empty())
        .ok_or_else(|| "Codex access token is not a JWT.".to_string())?;
    let signature_segment = segments
        .next()
        .filter(|segment| !segment.is_empty())
        .ok_or_else(|| "Codex access token is not a signed JWT.".to_string())?;
    if segments.next().is_some() || signature_segment.len() < 16 {
        return Err("Codex access token is not a signed JWT.".to_string());
    }

    let header_bytes = URL_SAFE_NO_PAD
        .decode(header_segment)
        .map_err(|_| "Codex access token header is invalid.".to_string())?;
    let header: CodexJwtHeader = serde_json::from_slice(&header_bytes)
        .map_err(|_| "Codex access token header schema is invalid.".to_string())?;
    if header.alg.trim().is_empty() || header.alg.eq_ignore_ascii_case("none") {
        return Err("Codex access token is not signed with an accepted algorithm.".to_string());
    }

    let claims_bytes = URL_SAFE_NO_PAD
        .decode(claims_segment)
        .map_err(|_| "Codex access token claims are invalid.".to_string())?;
    let claims: CodexJwtClaims = serde_json::from_slice(&claims_bytes)
        .map_err(|_| "Codex access token claims schema is invalid.".to_string())?;
    if claims.exp <= now_unix_seconds + CODEX_ACCESS_TOKEN_MIN_FRESHNESS_SECONDS {
        return Err("Codex access token is expired or too close to expiry.".to_string());
    }
    Ok(())
}

fn read_codex_subscription_access_token_at(
    codex_home: &Path,
    now_unix_seconds: i64,
) -> Result<String, String> {
    let file = open_validated_codex_auth_file(codex_home)?;
    let mut reader = file.take(CODEX_AUTH_MAX_BYTES + 1);
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .map_err(|_| "Codex subscription session file could not be read.".to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > CODEX_AUTH_MAX_BYTES {
        return Err("Codex subscription session file has an invalid size.".to_string());
    }
    let auth: CodexAuthSession = serde_json::from_slice(&bytes)
        .map_err(|_| "Codex subscription session schema is invalid.".to_string())?;
    if auth.auth_mode.trim() != "chatgpt" {
        return Err("Codex session is not a ChatGPT subscription login.".to_string());
    }
    let access_token = auth.tokens.access_token.trim().to_string();
    validate_codex_access_token(&access_token, now_unix_seconds)?;
    Ok(access_token)
}

fn verify_codex_cli_subscription_login() -> Result<(), String> {
    if !cli_runs_for_provider("codex", "codex") {
        return Err("Codex CLI is unavailable.".to_string());
    }
    let mut command = cli_command("codex");
    command
        .args(["login", "status"])
        .env("PATH", crate::augmented_cli_path());
    clear_bootstrap_credential_env(&mut command);
    let output = command_output_timeout(command, Duration::from_secs(3))
        .map_err(|_| "Codex login status could not be checked.".to_string())?
        .ok_or_else(|| "Codex login status timed out.".to_string())?;
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push('\n');
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    let normalized = combined.to_ascii_lowercase();
    if !output.status.success()
        || !normalized.contains("logged in")
        || !normalized.contains("chatgpt")
    {
        return Err("Codex CLI does not report an active ChatGPT login.".to_string());
    }
    Ok(())
}

/// Read only the fresh access token from the Codex CLI's canonical ChatGPT
/// session after an authoritative `codex login status` check. The refresh
/// token is ignored by the typed schema and is never copied, logged, or passed
/// to the isolated Gajae runtime.
pub fn prepare_gajecode_codex_subscription_token() -> Result<String, String> {
    verify_codex_cli_subscription_login()?;
    let codex_home = codex_home_from_process_env()?;
    read_codex_subscription_access_token_at(&codex_home, chrono::Utc::now().timestamp())
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
pub async fn provider_install_cli(provider: String) -> Result<(), String> {
    let provider_for_install = provider.clone();
    tauri::async_runtime::spawn_blocking(move || match provider_for_install.as_str() {
        "claude" => install_npm_cli("claude", CLAUDE_CODE_PACKAGE),
        "codex" => install_npm_cli("codex", CODEX_PACKAGE),
        "hermes" | "gajecode" => {
            let app_support = app_support_dir().ok_or_else(|| {
                "Could not resolve the Atelier Application Support directory.".to_string()
            })?;
            ensure_managed_agent_runtime_blocking_at(&app_support, &provider_for_install, |_, _| {})
                .map(|_| ())
        }
        _ => Err(format!(
            "automatic install not available for {provider_for_install}"
        )),
    })
    .await
    .map_err(|error| format!("{provider} installer task failed: {error}"))??;

    let meta = provider_meta(&provider)
        .ok_or_else(|| format!("automatic install not available for {provider}"))?;
    if !provider_cli_installed(&provider, &meta) {
        return Err(format!(
            "{provider} installer exited successfully, but the CLI could not be verified"
        ));
    }
    Ok(())
}

fn capture_installer_stream<R>(mut reader: R) -> thread::JoinHandle<Vec<u8>>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut captured = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            let read = match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(read) => read,
            };
            if read >= CLI_INSTALL_CAPTURE_LIMIT {
                captured.clear();
                captured.extend_from_slice(&chunk[read - CLI_INSTALL_CAPTURE_LIMIT..read]);
                continue;
            }
            let overflow = captured
                .len()
                .saturating_add(read)
                .saturating_sub(CLI_INSTALL_CAPTURE_LIMIT);
            if overflow > 0 {
                captured.drain(..overflow);
            }
            captured.extend_from_slice(&chunk[..read]);
        }
        captured
    })
}

fn installer_output(stdout: &[u8], stderr: &[u8]) -> String {
    let mut combined = String::from_utf8_lossy(stdout).into_owned();
    if !combined.is_empty() && !stderr.is_empty() {
        combined.push('\n');
    }
    combined.push_str(&String::from_utf8_lossy(stderr));
    crate::agent_process::clip_cli_output(redact_login_output(&combined))
}

fn run_cli_installer(mut command: Command, label: &'static str) -> Result<(), String> {
    configure_background_command(&mut command);
    let has_explicit_path = command
        .get_envs()
        .any(|(key, value)| value.is_some() && key == "PATH");
    if !has_explicit_path {
        command.env("PATH", crate::augmented_cli_path());
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("{label} installer could not start: {error}"))?;
    let stdout_reader = child.stdout.take().map(capture_installer_stream);
    let stderr_reader = child.stderr.take().map(capture_installer_stream);
    let started = Instant::now();
    let (status, timed_out) = loop {
        match child.try_wait() {
            Ok(Some(status)) => break (status, false),
            Ok(None) if started.elapsed() < CLI_INSTALL_TIMEOUT => {
                thread::sleep(Duration::from_millis(80));
            }
            Ok(None) => {
                let _ = child.kill();
                let status = child
                    .wait()
                    .map_err(|error| format!("{label} installer timeout cleanup: {error}"))?;
                break (status, true);
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{label} installer status check failed: {error}"));
            }
        }
    };
    let stdout = stdout_reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    let stderr = stderr_reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    let detail = installer_output(&stdout, &stderr);
    if timed_out {
        return Err(format!(
            "{label} installer timed out after {} seconds{}",
            CLI_INSTALL_TIMEOUT.as_secs(),
            if detail.trim().is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        ));
    }
    if status.success() {
        log::info!("{label} install completed");
        Ok(())
    } else {
        Err(format!(
            "{label} installer exited with {status}{}",
            if detail.trim().is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        ))
    }
}

fn run_runtime_probe(
    mut command: Command,
    label: &'static str,
    timeout: Duration,
) -> Result<String, String> {
    configure_background_command(&mut command);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = command
        .spawn()
        .map_err(|error| format!("{label} could not start: {error}"))?;
    let (output, timed_out) = crate::agent_process::wait_with_timeout(child, timeout)?;
    let detail = installer_output(&output.stdout, &output.stderr);
    if timed_out {
        return Err(format!(
            "{label} timed out after {} seconds",
            timeout.as_secs()
        ));
    }
    if !output.status.success() {
        return Err(format!(
            "{label} failed{}",
            if detail.trim().is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        ));
    }
    Ok(detail)
}

fn canonical_managed_file(path: &Path, root: &Path) -> Result<PathBuf, String> {
    let canonical_root = std::fs::canonicalize(root)
        .map_err(|error| format!("resolve {}: {error}", root.display()))?;
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("resolve {}: {error}", path.display()))?;
    if !canonical.starts_with(&canonical_root) || !canonical.is_file() {
        return Err(format!(
            "Managed executable is outside Atelier Application Support: {}",
            canonical.display()
        ));
    }
    Ok(canonical)
}

fn collect_bounded_regular_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let root_metadata = std::fs::symlink_metadata(root)
        .map_err(|error| format!("inspect managed skill root {}: {error}", root.display()))?;
    if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
        return Err(format!(
            "Managed skill root is not a real directory: {}",
            root.display()
        ));
    }

    let mut pending = vec![(root.to_path_buf(), 0usize)];
    let mut files = Vec::new();
    let mut total_bytes = 0u64;
    while let Some((dir, depth)) = pending.pop() {
        if depth > MANAGED_SKILL_TREE_MAX_DEPTH {
            return Err("Managed skill tree exceeds the maximum directory depth.".to_string());
        }
        let entries = std::fs::read_dir(&dir)
            .map_err(|error| format!("read managed skill directory {}: {error}", dir.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| {
                format!(
                    "read managed skill directory entry {}: {error}",
                    dir.display()
                )
            })?;
            let path = entry.path();
            let metadata = std::fs::symlink_metadata(&path).map_err(|error| {
                format!("inspect managed skill path {}: {error}", path.display())
            })?;
            if metadata.file_type().is_symlink() {
                return Err(format!(
                    "Managed skill tree contains a symbolic link: {}",
                    path.display()
                ));
            }
            if metadata.is_dir() {
                pending.push((path, depth + 1));
                continue;
            }
            if !metadata.is_file() {
                return Err(format!(
                    "Managed skill tree contains a non-regular file: {}",
                    path.display()
                ));
            }
            total_bytes = total_bytes
                .checked_add(metadata.len())
                .ok_or_else(|| "Managed skill tree byte count overflowed.".to_string())?;
            if total_bytes > MANAGED_SKILL_TREE_MAX_BYTES {
                return Err("Managed skill tree exceeds the maximum byte size.".to_string());
            }
            files.push(path);
            if files.len() > MANAGED_SKILL_TREE_MAX_FILES {
                return Err("Managed skill tree exceeds the maximum file count.".to_string());
            }
        }
    }
    files.sort_by(|left, right| {
        left.strip_prefix(root)
            .unwrap_or(left)
            .cmp(right.strip_prefix(root).unwrap_or(right))
    });
    Ok(files)
}

fn skill_frontmatter_name(skill_md: &Path, fallback: &str) -> Result<String, String> {
    let mut file = std::fs::File::open(skill_md).map_err(|error| {
        format!(
            "open managed skill metadata {}: {error}",
            skill_md.display()
        )
    })?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(4000)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            format!(
                "read managed skill metadata {}: {error}",
                skill_md.display()
            )
        })?;
    let content = String::from_utf8_lossy(&bytes);
    let mut in_frontmatter = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "---" {
            if in_frontmatter {
                break;
            }
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter {
            if let Some(value) = trimmed.strip_prefix("name:") {
                let value = value.trim().trim_matches(['"', '\'']);
                if !value.is_empty() {
                    return Ok(value.to_string());
                }
            }
        }
    }
    Ok(fallback.to_string())
}

// Hermes commit HERMES_COMMIT writes `_dir_hash` as MD5 of every regular file,
// ordered by relative path, with each `str(relative_path)` immediately followed
// by that file's bytes. Keep this implementation byte-for-byte compatible with
// tools/skills_sync.py while rejecting links and unreadable/oversized trees.
#[derive(Clone)]
struct HermesManifestMd5 {
    state: [u32; 4],
    total_len: u64,
    block: [u8; 64],
    block_len: usize,
}

impl HermesManifestMd5 {
    fn new() -> Self {
        Self {
            state: [0x6745_2301, 0xefcd_ab89, 0x98ba_dcfe, 0x1032_5476],
            total_len: 0,
            block: [0; 64],
            block_len: 0,
        }
    }

    fn update(&mut self, mut input: &[u8]) -> Result<(), String> {
        self.total_len = self
            .total_len
            .checked_add(input.len() as u64)
            .ok_or_else(|| "Hermes skill hash input length overflowed.".to_string())?;
        if self.block_len != 0 {
            let needed = 64 - self.block_len;
            let copied = needed.min(input.len());
            self.block[self.block_len..self.block_len + copied].copy_from_slice(&input[..copied]);
            self.block_len += copied;
            input = &input[copied..];
            if self.block_len == 64 {
                let block = self.block;
                self.compress(&block);
                self.block_len = 0;
            }
            if input.is_empty() {
                return Ok(());
            }
        }
        let mut chunks = input.chunks_exact(64);
        for chunk in &mut chunks {
            let block: &[u8; 64] = chunk
                .try_into()
                .map_err(|_| "Hermes skill hash block conversion failed.".to_string())?;
            self.compress(block);
        }
        let remainder = chunks.remainder();
        self.block[..remainder.len()].copy_from_slice(remainder);
        self.block_len = remainder.len();
        Ok(())
    }

    fn compress(&mut self, block: &[u8; 64]) {
        const SHIFT: [u32; 64] = [
            7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20,
            5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
            6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
        ];
        const TABLE: [u32; 64] = [
            0xd76a_a478,
            0xe8c7_b756,
            0x2420_70db,
            0xc1bd_ceee,
            0xf57c_0faf,
            0x4787_c62a,
            0xa830_4613,
            0xfd46_9501,
            0x6980_98d8,
            0x8b44_f7af,
            0xffff_5bb1,
            0x895c_d7be,
            0x6b90_1122,
            0xfd98_7193,
            0xa679_438e,
            0x49b4_0821,
            0xf61e_2562,
            0xc040_b340,
            0x265e_5a51,
            0xe9b6_c7aa,
            0xd62f_105d,
            0x0244_1453,
            0xd8a1_e681,
            0xe7d3_fbc8,
            0x21e1_cde6,
            0xc337_07d6,
            0xf4d5_0d87,
            0x455a_14ed,
            0xa9e3_e905,
            0xfcef_a3f8,
            0x676f_02d9,
            0x8d2a_4c8a,
            0xfffa_3942,
            0x8771_f681,
            0x6d9d_6122,
            0xfde5_380c,
            0xa4be_ea44,
            0x4bde_cfa9,
            0xf6bb_4b60,
            0xbebf_bc70,
            0x289b_7ec6,
            0xeaa1_27fa,
            0xd4ef_3085,
            0x0488_1d05,
            0xd9d4_d039,
            0xe6db_99e5,
            0x1fa2_7cf8,
            0xc4ac_5665,
            0xf429_2244,
            0x432a_ff97,
            0xab94_23a7,
            0xfc93_a039,
            0x655b_59c3,
            0x8f0c_cc92,
            0xffef_f47d,
            0x8584_5dd1,
            0x6fa8_7e4f,
            0xfe2c_e6e0,
            0xa301_4314,
            0x4e08_11a1,
            0xf753_7e82,
            0xbd3a_f235,
            0x2ad7_d2bb,
            0xeb86_d391,
        ];
        let mut words = [0u32; 16];
        for (index, chunk) in block.chunks_exact(4).enumerate() {
            words[index] = u32::from_le_bytes(chunk.try_into().expect("four-byte MD5 word"));
        }
        let [mut a, mut b, mut c, mut d] = self.state;
        for index in 0..64 {
            let (mixed, word_index) = match index {
                0..=15 => ((b & c) | ((!b) & d), index),
                16..=31 => ((d & b) | ((!d) & c), (5 * index + 1) % 16),
                32..=47 => (b ^ c ^ d, (3 * index + 5) % 16),
                _ => (c ^ (b | !d), (7 * index) % 16),
            };
            let next = b.wrapping_add(
                a.wrapping_add(mixed)
                    .wrapping_add(TABLE[index])
                    .wrapping_add(words[word_index])
                    .rotate_left(SHIFT[index]),
            );
            a = d;
            d = c;
            c = b;
            b = next;
        }
        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
    }

    fn finish(mut self) -> Result<String, String> {
        let bit_len = self
            .total_len
            .checked_mul(8)
            .ok_or_else(|| "Hermes skill hash bit length overflowed.".to_string())?;
        self.update(&[0x80])?;
        let zero_count = if self.block_len <= 56 {
            56 - self.block_len
        } else {
            64 + 56 - self.block_len
        };
        if zero_count != 0 {
            self.update(&vec![0u8; zero_count])?;
        }
        self.update(&bit_len.to_le_bytes())?;
        if self.block_len != 0 {
            return Err("Hermes skill hash finalization failed.".to_string());
        }
        let mut output = String::with_capacity(32);
        for word in self.state {
            for byte in word.to_le_bytes() {
                use std::fmt::Write as _;
                write!(&mut output, "{byte:02x}")
                    .map_err(|_| "Hermes skill hash formatting failed.".to_string())?;
            }
        }
        Ok(output)
    }
}

fn hermes_skill_dir_hash(skill_dir: &Path) -> Result<String, String> {
    let files = collect_bounded_regular_files(skill_dir)?;
    let mut hasher = HermesManifestMd5::new();
    let mut buffer = [0u8; 64 * 1024];
    for file_path in files {
        let relative = file_path
            .strip_prefix(skill_dir)
            .map_err(|_| "Hermes skill file escaped its skill directory.".to_string())?;
        let relative = relative.to_str().ok_or_else(|| {
            format!(
                "Hermes skill path is not valid Unicode: {}",
                relative.display()
            )
        })?;
        hasher.update(relative.as_bytes())?;
        let mut file = std::fs::File::open(&file_path)
            .map_err(|error| format!("open Hermes skill file {}: {error}", file_path.display()))?;
        loop {
            let read = file.read(&mut buffer).map_err(|error| {
                format!("read Hermes skill file {}: {error}", file_path.display())
            })?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read])?;
        }
    }
    hasher.finish()
}

fn hermes_skill_hashes(skills_dir: &Path) -> Result<HashMap<String, String>, String> {
    let all_files = collect_bounded_regular_files(skills_dir)?;
    let mut hashes = HashMap::new();
    for skill_md in all_files
        .iter()
        .filter(|path| path.file_name().is_some_and(|name| name == "SKILL.md"))
    {
        let skill_dir = skill_md
            .parent()
            .ok_or_else(|| "Hermes skill metadata has no parent directory.".to_string())?;
        let fallback = skill_dir
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Hermes skill directory has an invalid name.".to_string())?;
        let name = skill_frontmatter_name(skill_md, fallback)?;
        let hash = hermes_skill_dir_hash(skill_dir)?;
        if hashes.insert(name.clone(), hash).is_some() {
            return Err(format!(
                "Hermes bundled skills contain a duplicate selector '{name}'."
            ));
        }
        if hashes.len() > HERMES_SKILL_MANIFEST_MAX_ENTRIES {
            return Err("Hermes bundled-skill set exceeds the readiness bound.".into());
        }
    }
    if hashes.is_empty() {
        return Err("Hermes bundled skill source contains no discoverable skills.".into());
    }
    Ok(hashes)
}

fn verified_hermes_skill_manifest_entries(
    skills_dir: &Path,
) -> Result<HashMap<String, String>, String> {
    let manifest = skills_dir.join(".bundled_manifest");
    let metadata = std::fs::symlink_metadata(&manifest)
        .map_err(|_| "Hermes bundled-skill manifest is missing.".to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > HERMES_SKILL_MANIFEST_MAX_BYTES
    {
        return Err(
            "Hermes bundled-skill manifest is invalid or exceeds the readiness bound.".into(),
        );
    }
    let text = std::fs::read_to_string(&manifest)
        .map_err(|error| format!("read Hermes bundled-skill manifest: {error}"))?;
    let actual_hashes = hermes_skill_hashes(skills_dir)?;
    let mut manifest_hashes = HashMap::new();
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if manifest_hashes.len() >= HERMES_SKILL_MANIFEST_MAX_ENTRIES {
            return Err("Hermes bundled-skill manifest exceeds the readiness bound.".into());
        }
        let Some((name, hash)) = line.split_once(':') else {
            return Err("Hermes bundled-skill manifest has an invalid entry.".into());
        };
        let name = name.trim();
        let expected_hash = hash.trim().to_ascii_lowercase();
        if name.is_empty() || hash.len() != 32 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err("Hermes bundled-skill manifest has an invalid entry.".into());
        }
        if manifest_hashes
            .insert(name.to_string(), expected_hash.clone())
            .is_some()
        {
            return Err(format!(
                "Hermes bundled-skill manifest contains duplicate selector '{name}'."
            ));
        }
        let actual_hash = actual_hashes.get(name).ok_or_else(|| {
            format!("Hermes bundled skill '{name}' is missing from the isolated skill root.")
        })?;
        if actual_hash != &expected_hash {
            return Err(format!(
                "Hermes bundled skill '{name}' failed content integrity verification."
            ));
        }
    }
    if manifest_hashes.is_empty() {
        return Err("Hermes bundled skills were not materialized in the isolated home.".into());
    }
    Ok(manifest_hashes)
}

fn expected_hermes_bundled_source_manifest(
    skills_dir: &Path,
    expected_commit: &str,
) -> Result<ManagedSkillIntegrityManifest, String> {
    let mut files = Vec::new();
    for path in collect_bounded_regular_files(skills_dir)? {
        let relative = path
            .strip_prefix(skills_dir)
            .map_err(|_| "Hermes bundled source file escaped its managed root.".to_string())?;
        let relative = relative
            .to_str()
            .ok_or_else(|| "Hermes bundled source path is not valid Unicode.".to_string())?
            .replace('\\', "/");
        files.push(ManagedSkillFileHash {
            path: relative,
            sha256: sha256_file_hex(&path)?,
        });
    }
    if files.is_empty() {
        return Err("Hermes durable bundled source is empty.".to_string());
    }
    Ok(ManagedSkillIntegrityManifest {
        schema_version: HERMES_BUNDLED_SOURCE_SCHEMA,
        provider: "hermes".to_string(),
        runtime_pin: expected_commit.to_string(),
        files,
    })
}

fn write_hermes_bundled_source_manifest(
    bundle_root: &Path,
    expected_commit: &str,
) -> Result<(), String> {
    let skills_dir = bundle_root.join("skills");
    hermes_skill_hashes(&skills_dir)?;
    let manifest = expected_hermes_bundled_source_manifest(&skills_dir, expected_commit)?;
    let text = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("serialize Hermes bundled-source manifest: {error}"))?;
    if text.len() as u64 > HERMES_SKILL_MANIFEST_MAX_BYTES {
        return Err("Hermes bundled-source manifest exceeds the safety bound.".to_string());
    }
    let path = bundle_root.join(HERMES_BUNDLED_SOURCE_MANIFEST);
    let temporary = bundle_root.join(format!(
        "{HERMES_BUNDLED_SOURCE_MANIFEST}.tmp-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&temporary, format!("{text}\n"))
        .map_err(|error| format!("write {}: {error}", temporary.display()))?;
    std::fs::rename(&temporary, &path)
        .map_err(|error| format!("publish {}: {error}", path.display()))
}

fn canonical_real_directory_within(
    path: &Path,
    boundary: &Path,
    label: &str,
) -> Result<PathBuf, String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("inspect {label} {}: {error}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(format!(
            "{label} is not a real directory: {}",
            path.display()
        ));
    }
    let canonical_boundary = std::fs::canonicalize(boundary)
        .map_err(|error| format!("resolve managed boundary {}: {error}", boundary.display()))?;
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("resolve {label} {}: {error}", path.display()))?;
    if !canonical.starts_with(&canonical_boundary) {
        return Err(format!(
            "{label} escaped its Atelier-managed boundary: {}",
            canonical.display()
        ));
    }
    Ok(canonical)
}

fn validate_existing_real_directory_within(
    path: &Path,
    boundary: &Path,
    label: &str,
) -> Result<(), String> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("inspect {label} {}: {error}", path.display())),
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(format!(
            "{label} is not a real directory: {}",
            path.display()
        ));
    }
    let canonical_boundary = std::fs::canonicalize(boundary)
        .map_err(|error| format!("resolve managed boundary {}: {error}", boundary.display()))?;
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("resolve {label} {}: {error}", path.display()))?;
    if !canonical.starts_with(&canonical_boundary) {
        return Err(format!(
            "{label} escaped its Atelier-managed boundary: {}",
            canonical.display()
        ));
    }
    Ok(())
}

fn validate_hermes_materialization_boundary(app_support: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(app_support)
        .map_err(|error| format!("inspect Atelier Application Support: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Atelier Application Support is not a real directory.".to_string());
    }
    let providers = app_support.join("providers");
    validate_existing_real_directory_within(&providers, app_support, "Atelier provider directory")?;
    let provider_root = hermes_provider_root_at(app_support);
    validate_existing_real_directory_within(&provider_root, app_support, "Hermes provider root")?;
    if provider_root.is_dir() {
        for (path, label) in [
            (
                hermes_provider_root_at(app_support).join("cache"),
                "Hermes managed cache",
            ),
            (
                hermes_provider_root_at(app_support).join("tmp"),
                "Hermes managed temporary directory",
            ),
        ] {
            validate_existing_real_directory_within(&path, &provider_root, label)?;
        }
    }
    Ok(())
}

fn verify_hermes_bundled_source_at(
    app_support: &Path,
    expected_commit: &str,
) -> Result<(PathBuf, HashMap<String, String>), String> {
    let provider_root = hermes_provider_root_at(app_support);
    let provider_root =
        canonical_real_directory_within(&provider_root, app_support, "Hermes provider root")?;
    let bundle_root = hermes_bundled_source_root_at(app_support);
    let bundle_root =
        canonical_real_directory_within(&bundle_root, &provider_root, "Hermes bundled source")?;
    let skills_dir = hermes_bundled_skills_dir_at(app_support);
    let skills_dir =
        canonical_real_directory_within(&skills_dir, &bundle_root, "Hermes bundled skills")?;
    let manifest_path = hermes_bundled_source_manifest_path_at(app_support);
    let metadata = std::fs::symlink_metadata(&manifest_path)
        .map_err(|_| "Hermes durable bundled-source manifest is missing.".to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > HERMES_SKILL_MANIFEST_MAX_BYTES
    {
        return Err(
            "Hermes durable bundled-source manifest is invalid or exceeds the safety bound."
                .to_string(),
        );
    }
    let canonical_manifest = std::fs::canonicalize(&manifest_path)
        .map_err(|error| format!("resolve {}: {error}", manifest_path.display()))?;
    if !canonical_manifest.starts_with(&bundle_root) {
        return Err("Hermes durable bundled-source manifest escaped its managed root.".to_string());
    }
    let text = std::fs::read_to_string(&manifest_path)
        .map_err(|error| format!("read Hermes bundled-source manifest: {error}"))?;
    let actual: ManagedSkillIntegrityManifest = serde_json::from_str(&text)
        .map_err(|error| format!("parse Hermes bundled-source manifest: {error}"))?;
    if actual.schema_version != HERMES_BUNDLED_SOURCE_SCHEMA
        || actual.provider != "hermes"
        || actual.runtime_pin != expected_commit
        || actual.files.is_empty()
        || actual.files.len() > MANAGED_SKILL_TREE_MAX_FILES
    {
        return Err("Hermes durable bundled-source manifest is stale or invalid.".to_string());
    }
    let expected = expected_hermes_bundled_source_manifest(&skills_dir, expected_commit)?;
    if actual != expected {
        return Err(
            "Hermes durable bundled source failed content integrity verification.".to_string(),
        );
    }
    let skill_hashes = hermes_skill_hashes(&skills_dir)?;
    Ok((skills_dir, skill_hashes))
}

fn verify_hermes_installed_skills_against_source_at(
    app_support: &Path,
    installed_skills: &Path,
    expected_commit: &str,
) -> Result<usize, String> {
    let (_, source_hashes) = verify_hermes_bundled_source_at(app_support, expected_commit)?;
    let installed_hashes = verified_hermes_skill_manifest_entries(installed_skills)?;
    if installed_hashes != source_hashes {
        return Err(format!(
            "Hermes installed bundled skills do not match the durable pinned source (source {}, installed {}).",
            source_hashes.len(),
            installed_hashes.len()
        ));
    }
    Ok(installed_hashes.len())
}

fn hermes_git_command(checkout: &Path) -> Command {
    let executable = if cfg!(target_os = "macos") && Path::new("/usr/bin/git").is_file() {
        PathBuf::from("/usr/bin/git")
    } else {
        crate::agent_process::resolve_cli_executable("git")
    };
    let mut command = Command::new(executable);
    command
        .current_dir(checkout)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(target_os = "windows") {
                "NUL"
            } else {
                "/dev/null"
            },
        );
    clear_bootstrap_credential_env(&mut command);
    command
}

fn run_hermes_git_output(mut command: Command, label: &str) -> Result<Output, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let output = command
        .output()
        .map_err(|error| format!("{label} could not start: {error}"))?;
    if output.stdout.len() > HERMES_GIT_OUTPUT_MAX_BYTES
        || output.stderr.len() > CLI_INSTALL_CAPTURE_LIMIT
    {
        return Err(format!("{label} exceeded the bounded output limit."));
    }
    if !output.status.success() {
        let detail = installer_output(&output.stdout, &output.stderr);
        return Err(format!(
            "{label} failed{}",
            if detail.trim().is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        ));
    }
    Ok(output)
}

fn hermes_git_stdout(checkout: &Path, args: &[&str], label: &str) -> Result<String, String> {
    let mut command = hermes_git_command(checkout);
    command.args(args);
    let output = run_hermes_git_output(command, label)?;
    String::from_utf8(output.stdout)
        .map(|value| value.trim().to_string())
        .map_err(|_| format!("{label} returned non-UTF-8 output."))
}

fn hermes_checkout_matches_commit(
    checkout: &Path,
    managed_cache: &Path,
    expected_commit: &str,
) -> Result<bool, String> {
    let head_ref = "HEAD^{commit}";
    let Ok(head) = hermes_git_stdout(
        checkout,
        &["rev-parse", "--verify", head_ref],
        "Hermes checkout HEAD verification",
    ) else {
        return Ok(false);
    };
    if head != expected_commit {
        return Ok(false);
    }
    let commit_ref = format!("{expected_commit}^{{commit}}");
    let commit = hermes_git_stdout(
        checkout,
        &["rev-parse", "--verify", &commit_ref],
        "Hermes pinned commit verification",
    )?;
    if commit != expected_commit {
        return Ok(false);
    }
    let git_dir = hermes_git_stdout(
        checkout,
        &["rev-parse", "--absolute-git-dir"],
        "Hermes git directory verification",
    )?;
    let git_dir = PathBuf::from(git_dir);
    let git_dir =
        canonical_real_directory_within(&git_dir, managed_cache, "Hermes managed git directory")?;
    Ok(git_dir.starts_with(
        std::fs::canonicalize(managed_cache)
            .map_err(|error| format!("resolve {}: {error}", managed_cache.display()))?,
    ))
}

fn locate_hermes_pinned_checkout_at(
    app_support: &Path,
    expected_commit: &str,
) -> Result<PathBuf, String> {
    if expected_commit.len() != 40 || !expected_commit.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Hermes pinned commit identifier is invalid.".to_string());
    }
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    let checkouts = layout.cache.join("git-v0").join("checkouts");
    let checkouts =
        canonical_real_directory_within(&checkouts, &layout.root, "Hermes uv git checkouts")?;
    let managed_cache =
        canonical_real_directory_within(&layout.cache, &layout.root, "Hermes managed cache")?;
    let mut pending = vec![(checkouts, 0usize)];
    let mut visited = 0usize;
    let mut matches = Vec::new();
    while let Some((directory, depth)) = pending.pop() {
        if depth > HERMES_GIT_CACHE_SCAN_MAX_DEPTH {
            return Err("Hermes uv git checkout tree exceeds the search depth bound.".to_string());
        }
        let dot_git = directory.join(".git");
        if dot_git.exists() {
            let metadata = std::fs::symlink_metadata(&dot_git)
                .map_err(|error| format!("inspect {}: {error}", dot_git.display()))?;
            if metadata.file_type().is_symlink() || (!metadata.is_dir() && !metadata.is_file()) {
                return Err(format!(
                    "Hermes uv checkout contains an unsafe git directory: {}",
                    dot_git.display()
                ));
            }
            if hermes_checkout_matches_commit(&directory, &managed_cache, expected_commit)? {
                matches.push(std::fs::canonicalize(&directory).map_err(|error| {
                    format!("resolve Hermes checkout {}: {error}", directory.display())
                })?);
            }
            continue;
        }
        let entries = std::fs::read_dir(&directory)
            .map_err(|error| format!("read {}: {error}", directory.display()))?;
        let mut child_directories = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|error| format!("read {}: {error}", directory.display()))?;
            visited += 1;
            if visited > HERMES_GIT_CACHE_SCAN_MAX_ENTRIES {
                return Err("Hermes uv git checkout tree exceeds the search bound.".to_string());
            }
            let path = entry.path();
            let metadata = std::fs::symlink_metadata(&path)
                .map_err(|error| format!("inspect {}: {error}", path.display()))?;
            if metadata.file_type().is_symlink() {
                return Err(format!(
                    "Hermes uv git checkout tree contains a symbolic link: {}",
                    path.display()
                ));
            }
            if metadata.is_dir() {
                child_directories.push(path);
            }
        }
        child_directories.sort();
        for child in child_directories.into_iter().rev() {
            pending.push((child, depth + 1));
        }
    }
    matches.sort();
    matches.dedup();
    match matches.len() {
        1 => Ok(matches.remove(0)),
        0 => Err(format!(
            "Hermes uv cache does not contain a checkout whose HEAD is pinned commit {expected_commit}."
        )),
        count => Err(format!(
            "Hermes uv cache exposed {count} checkouts for pinned commit {expected_commit}."
        )),
    }
}

fn hermes_git_tree_entries(
    checkout: &Path,
    expected_commit: &str,
) -> Result<Vec<HermesGitTreeEntry>, String> {
    let mut command = hermes_git_command(checkout);
    command.args([
        "ls-tree",
        "-rlz",
        "--full-tree",
        expected_commit,
        "--",
        "skills",
    ]);
    let output = run_hermes_git_output(command, "Hermes pinned skill tree inspection")?;
    let mut entries = Vec::new();
    let mut seen_paths = HashSet::new();
    let mut total_bytes = 0u64;
    let mut has_skill = false;
    for raw in output
        .stdout
        .split(|byte| *byte == b'\0')
        .filter(|entry| !entry.is_empty())
    {
        let entry = std::str::from_utf8(raw)
            .map_err(|_| "Hermes pinned git tree contains a non-UTF-8 path.".to_string())?;
        let (metadata, path) = entry
            .split_once('\t')
            .ok_or_else(|| "Hermes pinned git tree returned an invalid entry.".to_string())?;
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        if fields.len() != 4
            || !matches!(fields[0], "100644" | "100755")
            || fields[1] != "blob"
            || fields[2].len() != 40
            || !fields[2].bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(format!(
                "Hermes pinned skill tree contains an unsupported entry: {entry}"
            ));
        }
        let size = fields[3]
            .parse::<u64>()
            .map_err(|_| "Hermes pinned git tree returned an invalid file size.".to_string())?;
        if path.contains('\\') {
            return Err("Hermes pinned git tree contains an unsafe path separator.".to_string());
        }
        let relative = Path::new(path);
        let mut components = relative.components();
        if relative.is_absolute()
            || !matches!(
                components.next(),
                Some(std::path::Component::Normal(component)) if component == "skills"
            )
            || components.any(|component| !matches!(component, std::path::Component::Normal(_)))
        {
            return Err(format!(
                "Hermes pinned git tree contains an unsafe path: {path}"
            ));
        }
        if !seen_paths.insert(path.to_string()) {
            return Err(format!(
                "Hermes pinned git tree contains duplicate path: {path}"
            ));
        }
        total_bytes = total_bytes
            .checked_add(size)
            .ok_or_else(|| "Hermes pinned git tree byte count overflowed.".to_string())?;
        if total_bytes > MANAGED_SKILL_TREE_MAX_BYTES {
            return Err("Hermes pinned git tree exceeds the byte-size bound.".to_string());
        }
        entries.push(HermesGitTreeEntry {
            path: path.to_string(),
            object_id: fields[2].to_string(),
            size,
        });
        if relative
            .file_name()
            .is_some_and(|file_name| file_name == "SKILL.md")
        {
            has_skill = true;
        }
        if entries.len() > MANAGED_SKILL_TREE_MAX_FILES {
            return Err("Hermes pinned git tree exceeds the file-count bound.".to_string());
        }
    }
    if entries.is_empty() || !has_skill {
        return Err("Hermes pinned commit does not contain bundled skills.".to_string());
    }
    Ok(entries)
}

fn verify_hermes_archive_matches_git_tree(
    checkout: &Path,
    extracted_root: &Path,
    entries: &[HermesGitTreeEntry],
) -> Result<(), String> {
    let skills_dir = extracted_root.join("skills");
    let files = collect_bounded_regular_files(&skills_dir)?;
    if files.len() != entries.len() {
        return Err(format!(
            "Hermes pinned archive file count does not match the commit tree (archive {}, tree {}).",
            files.len(),
            entries.len()
        ));
    }
    let mut extracted = HashMap::new();
    for path in files {
        let relative = path
            .strip_prefix(extracted_root)
            .map_err(|_| "Hermes pinned archive escaped its extraction root.".to_string())?;
        let relative = relative
            .to_str()
            .ok_or_else(|| "Hermes pinned archive path is not valid Unicode.".to_string())?
            .replace('\\', "/");
        let size = std::fs::symlink_metadata(&path)
            .map_err(|error| format!("inspect {}: {error}", path.display()))?
            .len();
        extracted.insert(relative, (path, size));
    }
    for entry in entries {
        let Some((_, size)) = extracted.get(&entry.path) else {
            return Err(format!(
                "Hermes pinned archive omitted commit path {}.",
                entry.path
            ));
        };
        if *size != entry.size {
            return Err(format!(
                "Hermes pinned archive changed the size of commit path {}.",
                entry.path
            ));
        }
    }
    for chunk in entries.chunks(128) {
        let mut command = hermes_git_command(checkout);
        command.args(["hash-object", "--no-filters", "--"]);
        for entry in chunk {
            command.arg(extracted_root.join(&entry.path));
        }
        let output = run_hermes_git_output(command, "Hermes pinned archive object verification")?;
        let object_ids = String::from_utf8(output.stdout)
            .map_err(|_| "Hermes git hash-object returned non-UTF-8 output.".to_string())?
            .lines()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>();
        if object_ids.len() != chunk.len() {
            return Err("Hermes pinned archive object verification was incomplete.".to_string());
        }
        for (entry, actual_object_id) in chunk.iter().zip(object_ids) {
            if entry.object_id != actual_object_id {
                return Err(format!(
                    "Hermes pinned archive content does not match commit object {}.",
                    entry.path
                ));
            }
        }
    }
    Ok(())
}

fn quarantine_existing_hermes_bundle(
    layout: &ManagedRuntimeLayout,
    bundle_root: &Path,
) -> Result<Option<PathBuf>, String> {
    if !bundle_root.exists() {
        return Ok(None);
    }
    let metadata = std::fs::symlink_metadata(bundle_root)
        .map_err(|error| format!("inspect {}: {error}", bundle_root.display()))?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Hermes bundled source is a symbolic link and was rejected: {}",
            bundle_root.display()
        ));
    }
    let quarantine_root = layout.root.join("bundle-quarantine");
    std::fs::create_dir_all(&quarantine_root)
        .map_err(|error| format!("create {}: {error}", quarantine_root.display()))?;
    let destination = quarantine_root.join(format!(
        "bundled-{}-{}",
        chrono::Utc::now().timestamp_millis(),
        uuid::Uuid::new_v4()
    ));
    std::fs::rename(bundle_root, &destination).map_err(|error| {
        format!(
            "quarantine Hermes bundled source {} -> {}: {error}",
            bundle_root.display(),
            destination.display()
        )
    })?;
    Ok(Some(destination))
}

fn materialize_hermes_bundled_source_at(
    app_support: &Path,
    expected_commit: &str,
) -> Result<PathBuf, String> {
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    validate_hermes_materialization_boundary(app_support)?;
    ensure_runtime_layout(&layout)?;
    canonical_real_directory_within(&layout.root, app_support, "Hermes provider root")?;
    canonical_real_directory_within(
        &layout.temp,
        &layout.root,
        "Hermes managed temporary directory",
    )?;
    if let Ok((skills_dir, _)) = verify_hermes_bundled_source_at(app_support, expected_commit) {
        return Ok(skills_dir);
    }
    let checkout = locate_hermes_pinned_checkout_at(app_support, expected_commit)?;
    let entries = hermes_git_tree_entries(&checkout, expected_commit)?;
    let staging = layout
        .temp
        .join(format!("hermes-bundled-source-{}", uuid::Uuid::new_v4()));
    let publish = staging.join("publish");
    std::fs::create_dir_all(&publish)
        .map_err(|error| format!("create {}: {error}", publish.display()))?;
    let archive = staging.join("skills.tar");
    let mut archive_command = hermes_git_command(&checkout);
    archive_command
        .args(["archive", "--format=tar", "-o"])
        .arg(&archive)
        .arg(expected_commit)
        .args(["--", "skills"]);
    run_hermes_git_output(archive_command, "Hermes pinned skill archive")?;
    let archive_metadata = std::fs::symlink_metadata(&archive)
        .map_err(|error| format!("inspect {}: {error}", archive.display()))?;
    if archive_metadata.file_type().is_symlink()
        || !archive_metadata.is_file()
        || archive_metadata.len() > MANAGED_SKILL_TREE_MAX_BYTES * 2
    {
        return Err(
            "Hermes pinned skill archive is invalid or exceeds the safety bound.".to_string(),
        );
    }
    let tar_executable = if cfg!(target_os = "macos") && Path::new("/usr/bin/tar").is_file() {
        PathBuf::from("/usr/bin/tar")
    } else {
        crate::agent_process::resolve_cli_executable("tar")
    };
    let mut extract = Command::new(tar_executable);
    extract.args(["-xf"]).arg(&archive).arg("-C").arg(&publish);
    clear_bootstrap_credential_env(&mut extract);
    run_runtime_probe(
        extract,
        "Hermes pinned skill archive extraction",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?;
    verify_hermes_archive_matches_git_tree(&checkout, &publish, &entries)?;
    write_hermes_bundled_source_manifest(&publish, expected_commit)?;
    let staged_source = publish.join("skills");
    let source_hashes = hermes_skill_hashes(&staged_source)?;
    if source_hashes.is_empty() {
        return Err("Hermes pinned skill archive produced no discoverable skills.".to_string());
    }

    let bundle_root = hermes_bundled_source_root_at(app_support);
    let quarantined = quarantine_existing_hermes_bundle(&layout, &bundle_root)?;
    if let Err(error) = std::fs::rename(&publish, &bundle_root) {
        if let Some(previous) = quarantined.as_ref().filter(|_| !bundle_root.exists()) {
            let _ = std::fs::rename(previous, &bundle_root);
        }
        return Err(format!(
            "publish Hermes durable bundled source {} -> {}: {error}",
            publish.display(),
            bundle_root.display()
        ));
    }
    if let Some(path) = quarantined {
        log::warn!(
            "quarantined prior Hermes durable bundled source before pinned replacement: {}",
            path.display()
        );
    }
    let (skills_dir, _) = verify_hermes_bundled_source_at(app_support, expected_commit)?;
    let _ = std::fs::remove_file(&archive);
    let _ = std::fs::remove_dir(&staging);
    Ok(skills_dir)
}

fn hermes_direct_url_has_pinned_commit(tool_dir: &Path) -> bool {
    let mut pending = vec![(tool_dir.to_path_buf(), 0usize)];
    let mut visited = 0usize;
    while let Some((dir, depth)) = pending.pop() {
        if depth > 8 || visited >= 4096 {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            visited += 1;
            if visited >= 4096 {
                break;
            }
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                pending.push((path, depth + 1));
                continue;
            }
            if entry.file_name() != "direct_url.json" {
                continue;
            }
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.len() > MANAGED_RECEIPT_MAX_BYTES {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(path) else {
                continue;
            };
            let Ok(value) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            let url_matches = value
                .get("url")
                .and_then(Value::as_str)
                .is_some_and(|url| url.contains("NousResearch/hermes-agent"));
            let commit_matches = value
                .pointer("/vcs_info/commit_id")
                .and_then(Value::as_str)
                .is_some_and(|commit| commit == HERMES_COMMIT);
            if url_matches && commit_matches {
                return true;
            }
        }
    }
    false
}

fn sha256_file_hex(path: &Path) -> Result<String, String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("inspect file for SHA-256 {}: {error}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "SHA-256 input is not a regular file: {}",
            path.display()
        ));
    }
    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("open file for SHA-256 {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("read file for SHA-256 {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn verify_file_sha256(path: &Path, expected: &str, label: &str) -> Result<(), String> {
    let actual = sha256_file_hex(path)?;
    if actual == expected {
        return Ok(());
    }
    Err(format!(
        "{label} failed SHA-256 verification (expected {expected}, got {actual})."
    ))
}

fn gajecode_default_skill_files(skills_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    for skill in GAJAE_DEFAULT_SKILLS {
        let skill_root = skills_dir.join(skill);
        if !skill_root.join("SKILL.md").is_file() {
            return Err(format!(
                "Gajaecode default skill '{skill}' is missing from the isolated skill root."
            ));
        }
        files.extend(collect_bounded_regular_files(&skill_root)?);
    }
    files.sort_by(|left, right| {
        left.strip_prefix(skills_dir)
            .unwrap_or(left)
            .cmp(right.strip_prefix(skills_dir).unwrap_or(right))
    });
    if files.is_empty() || files.len() > MANAGED_SKILL_TREE_MAX_FILES {
        return Err(
            "Gajaecode default skill file set is empty or exceeds the safety bound.".into(),
        );
    }
    Ok(files)
}

fn expected_gajecode_skill_integrity_manifest(
    skills_dir: &Path,
) -> Result<ManagedSkillIntegrityManifest, String> {
    let mut files = Vec::new();
    for path in gajecode_default_skill_files(skills_dir)? {
        let relative = path
            .strip_prefix(skills_dir)
            .map_err(|_| "Gajaecode default skill escaped its managed root.".to_string())?;
        let relative = relative
            .to_str()
            .ok_or_else(|| "Gajaecode default skill path is not valid Unicode.".to_string())?
            .replace('\\', "/");
        files.push(ManagedSkillFileHash {
            path: relative,
            sha256: sha256_file_hex(&path)?,
        });
    }
    Ok(ManagedSkillIntegrityManifest {
        schema_version: GAJAE_SKILL_INTEGRITY_SCHEMA,
        provider: "gajecode".to_string(),
        runtime_pin: GAJAE_CODE_VERSION.to_string(),
        files,
    })
}

fn verify_hermes_python_isolation(app_support: &Path) -> Result<(), String> {
    let python = hermes_uv_bin_dir_at(app_support).join(if cfg!(target_os = "windows") {
        "python.exe"
    } else {
        "python"
    });
    let resolved = std::fs::canonicalize(&python).map_err(|error| {
        format!(
            "resolve Hermes managed Python {}: {error}",
            python.display()
        )
    })?;
    let expected_root = canonical_real_directory_within(
        &hermes_provider_root_at(app_support),
        app_support,
        "Hermes provider root",
    )?;
    if !resolved.starts_with(&expected_root) {
        return Err(format!(
            "Hermes managed Python escaped the Atelier provider runtime root: {}",
            resolved.display()
        ));
    }
    Ok(())
}

fn write_gajecode_skill_integrity_manifest(skills_dir: &Path) -> Result<(), String> {
    let manifest = expected_gajecode_skill_integrity_manifest(skills_dir)?;
    let path = skills_dir.join(GAJAE_SKILL_INTEGRITY_MANIFEST);
    let text = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("serialize Gajaecode skill integrity manifest: {error}"))?;
    if text.len() as u64 > HERMES_SKILL_MANIFEST_MAX_BYTES {
        return Err("Gajaecode skill integrity manifest exceeds the safety bound.".to_string());
    }
    let temp = skills_dir.join(format!(
        "{GAJAE_SKILL_INTEGRITY_MANIFEST}.tmp-{}",
        std::process::id()
    ));
    std::fs::write(&temp, format!("{text}\n"))
        .map_err(|error| format!("write {}: {error}", temp.display()))?;
    std::fs::rename(&temp, &path).map_err(|error| format!("publish {}: {error}", path.display()))
}

fn verify_gajecode_skill_integrity_manifest(skills_dir: &Path) -> Result<usize, String> {
    let path = skills_dir.join(GAJAE_SKILL_INTEGRITY_MANIFEST);
    let metadata = std::fs::symlink_metadata(&path)
        .map_err(|_| "Gajaecode default-skill integrity manifest is missing.".to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > HERMES_SKILL_MANIFEST_MAX_BYTES
    {
        return Err(
            "Gajaecode default-skill integrity manifest is invalid or exceeds the safety bound."
                .to_string(),
        );
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("read Gajaecode skill integrity manifest: {error}"))?;
    let actual: ManagedSkillIntegrityManifest = serde_json::from_str(&text)
        .map_err(|error| format!("parse Gajaecode skill integrity manifest: {error}"))?;
    if actual.schema_version != GAJAE_SKILL_INTEGRITY_SCHEMA
        || actual.provider != "gajecode"
        || actual.runtime_pin != GAJAE_CODE_VERSION
        || actual.files.is_empty()
        || actual.files.len() > MANAGED_SKILL_TREE_MAX_FILES
    {
        return Err("Gajaecode default-skill integrity manifest is stale or invalid.".to_string());
    }
    let expected = expected_gajecode_skill_integrity_manifest(skills_dir)?;
    if actual != expected {
        return Err("Gajaecode default skills failed content integrity verification.".to_string());
    }
    Ok(GAJAE_DEFAULT_SKILLS.len())
}

fn gajecode_command_at(app_support: &Path) -> Result<Command, String> {
    let executable = gajecode_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Gajaecode executable is missing.".to_string())?;
    let mut command = cli_command(&executable.to_string_lossy());
    configure_gajecode_runtime_env_at(&mut command, app_support)?;
    Ok(command)
}

fn verify_gajecode_components_at(app_support: &Path) -> Result<(PathBuf, usize), String> {
    let layout = managed_runtime_layout_at(app_support, "gajecode")?;
    let bun = gajecode_bun_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Bun executable is missing.".to_string())?;
    let bun = canonical_managed_file(&bun, &layout.root)?;
    let mut bun_version = cli_command(&bun.to_string_lossy());
    configure_gajecode_runtime_env_at(&mut bun_version, app_support)?;
    bun_version.arg("--version");
    let detected_bun = first_semver_token(&run_runtime_probe(
        bun_version,
        "Bun version check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?)
    .ok_or_else(|| "Could not parse the Atelier-managed Bun version.".to_string())?;
    if detected_bun != BUN_VERSION {
        return Err(format!(
            "Atelier requires Bun {BUN_VERSION}, but the managed runtime reported {detected_bun}."
        ));
    }

    let executable = gajecode_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Gajaecode executable is missing.".to_string())?;
    let executable = canonical_managed_file(&executable, &layout.root)?;
    let mut version = gajecode_command_at(app_support)?;
    version.arg("--version");
    let detected = first_semver_token(&run_runtime_probe(
        version,
        "Gajaecode version check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?)
    .ok_or_else(|| "Could not parse the Atelier-managed Gajaecode version.".to_string())?;
    if detected != GAJAE_CODE_VERSION {
        return Err(format!(
            "Atelier requires Gajaecode {GAJAE_CODE_VERSION}, but the managed runtime reported {detected}."
        ));
    }

    let mut defaults_check = gajecode_command_at(app_support)?;
    defaults_check
        .args(["setup", "defaults", "--check"])
        .current_dir(
            layout
                .workspace
                .as_deref()
                .ok_or_else(|| "The Gajaecode workspace is unavailable.".to_string())?,
        );
    run_runtime_probe(
        defaults_check,
        "Gajaecode default skill check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?;
    let skill_count = verify_gajecode_skill_integrity_manifest(&layout.skills)?;
    Ok((executable, skill_count))
}

fn verify_hermes_components_at(app_support: &Path) -> Result<(PathBuf, usize), String> {
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    let executable = hermes_managed_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Hermes executable is missing.".to_string())?;
    let executable = canonical_managed_file(&executable, &layout.root)?;
    verify_hermes_python_isolation(app_support)?;
    if !hermes_direct_url_has_pinned_commit(&hermes_uv_tool_dir_at(app_support)) {
        return Err(format!(
            "The Atelier-managed Hermes provenance does not match commit {HERMES_COMMIT}."
        ));
    }
    let skill_count = verify_hermes_installed_skills_against_source_at(
        app_support,
        &layout.skills,
        HERMES_COMMIT,
    )?;
    Ok((executable, skill_count))
}

fn runtime_pins(provider: &str) -> Result<(&'static str, Option<&'static str>), String> {
    match provider {
        "hermes" => Ok((HERMES_COMMIT, None)),
        "gajecode" => Ok((GAJAE_CODE_VERSION, Some(BUN_VERSION))),
        _ => Err(format!("Unsupported managed runtime provider: {provider}")),
    }
}

fn expected_runtime_receipt(
    layout: &ManagedRuntimeLayout,
    executable: &Path,
    skill_count: usize,
) -> Result<ManagedRuntimeReceipt, String> {
    let (runtime_pin, dependency_pin) = runtime_pins(layout.provider)?;
    Ok(ManagedRuntimeReceipt {
        schema_version: MANAGED_RUNTIME_RECEIPT_SCHEMA,
        provider: layout.provider.to_string(),
        runtime_pin: runtime_pin.to_string(),
        dependency_pin: dependency_pin.map(str::to_string),
        policy_version: MANAGED_RUNTIME_POLICY_VERSION.to_string(),
        skill_bootstrap_version: MANAGED_SKILL_BOOTSTRAP_VERSION.to_string(),
        executable: executable.to_string_lossy().into_owned(),
        skills_dir: layout.skills.to_string_lossy().into_owned(),
        verified_skill_count: skill_count,
    })
}

fn load_runtime_receipt(path: &Path) -> Option<ManagedRuntimeReceipt> {
    let metadata = std::fs::metadata(path).ok()?;
    if metadata.len() == 0 || metadata.len() > MANAGED_RECEIPT_MAX_BYTES {
        return None;
    }
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn write_runtime_receipt(path: &Path, receipt: &ManagedRuntimeReceipt) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Could not resolve the runtime receipt directory.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create {}: {error}", parent.display()))?;
    let text = serde_json::to_string_pretty(receipt)
        .map_err(|error| format!("serialize managed runtime receipt: {error}"))?;
    let temp = path.with_extension(format!("json.tmp-{}", std::process::id()));
    std::fs::write(&temp, format!("{text}\n"))
        .map_err(|error| format!("write {}: {error}", temp.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("chmod {}: {error}", temp.display()))?;
    }
    std::fs::rename(&temp, path).map_err(|error| format!("publish {}: {error}", path.display()))
}

fn verify_managed_runtime_at(
    app_support: &Path,
    provider: &str,
) -> Result<ManagedAgentRuntimeReadiness, String> {
    let layout = managed_runtime_layout_at(app_support, provider)?;
    let (executable, skill_count) = match provider {
        "hermes" => verify_hermes_components_at(app_support)?,
        "gajecode" => verify_gajecode_components_at(app_support)?,
        _ => return Err(format!("Unsupported managed runtime provider: {provider}")),
    };
    let expected = expected_runtime_receipt(&layout, &executable, skill_count)?;
    if load_runtime_receipt(&layout.receipt).as_ref() != Some(&expected) {
        return Err(format!(
            "{provider} managed runtime readiness receipt is missing or stale."
        ));
    }
    readiness_from(layout, executable, false)
}

fn readiness_from(
    layout: ManagedRuntimeLayout,
    executable: PathBuf,
    repaired: bool,
) -> Result<ManagedAgentRuntimeReadiness, String> {
    let (runtime_pin, dependency_pin) = runtime_pins(layout.provider)?;
    Ok(ManagedAgentRuntimeReadiness {
        provider: layout.provider.to_string(),
        ready: true,
        repaired,
        executable: executable.to_string_lossy().into_owned(),
        provider_root: layout.root.to_string_lossy().into_owned(),
        home_dir: layout.home.to_string_lossy().into_owned(),
        state_dir: layout.state.to_string_lossy().into_owned(),
        cache_dir: layout.cache.to_string_lossy().into_owned(),
        temp_dir: layout.temp.to_string_lossy().into_owned(),
        skills_dir: layout.skills.to_string_lossy().into_owned(),
        workspace_dir: layout
            .workspace
            .map(|path| path.to_string_lossy().into_owned()),
        runtime_pin: runtime_pin.to_string(),
        dependency_pin: dependency_pin.map(str::to_string),
        policy_version: MANAGED_RUNTIME_POLICY_VERSION.to_string(),
        skill_bootstrap_version: MANAGED_SKILL_BOOTSTRAP_VERSION.to_string(),
        receipt_path: layout.receipt.to_string_lossy().into_owned(),
    })
}

fn acquire_runtime_install_lock(provider: &str) -> Result<MutexGuard<'static, ()>, String> {
    let lock = match provider {
        "hermes" => &*HERMES_RUNTIME_INSTALL_LOCK,
        "gajecode" => &*GAJAE_RUNTIME_INSTALL_LOCK,
        _ => return Err(format!("Unsupported managed runtime provider: {provider}")),
    };
    let started = Instant::now();
    loop {
        match lock.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(TryLockError::Poisoned(error)) => return Ok(error.into_inner()),
            Err(TryLockError::WouldBlock) if started.elapsed() < MANAGED_RUNTIME_LOCK_WAIT => {
                thread::sleep(Duration::from_millis(100));
            }
            Err(TryLockError::WouldBlock) => {
                return Err(format!(
                    "{provider} runtime preparation remained busy for too long."
                ))
            }
        }
    }
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
    run_cli_installer(command, label)
}

fn atomic_install_executable(source: &Path, destination: &Path) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Could not resolve managed executable directory.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create {}: {error}", parent.display()))?;
    let temp = destination.with_extension(format!("new-{}", std::process::id()));
    std::fs::copy(source, &temp)
        .map_err(|error| format!("copy {} -> {}: {error}", source.display(), temp.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o755))
            .map_err(|error| format!("chmod {}: {error}", temp.display()))?;
    }
    std::fs::rename(&temp, destination)
        .map_err(|error| format!("publish {}: {error}", destination.display()))
}

fn uv_macos_archive_sha256(target: &str) -> Option<&'static str> {
    match target {
        "aarch64-apple-darwin" => Some(UV_MACOS_AARCH64_SHA256),
        "x86_64-apple-darwin" => Some(UV_MACOS_X86_64_SHA256),
        _ => None,
    }
}

fn bun_macos_archive_sha256(target: &str) -> Option<&'static str> {
    match target {
        "bun-darwin-aarch64" => Some(BUN_MACOS_AARCH64_SHA256),
        "bun-darwin-x64" => Some(BUN_MACOS_X86_64_SHA256),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn download_verified_archive(
    url: &str,
    archive: &Path,
    expected_sha256: &str,
    label: &str,
) -> Result<(), String> {
    let file_name = archive
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Could not resolve the {label} archive name."))?;
    let temporary = archive.with_file_name(format!(".{file_name}.download-{}", std::process::id()));
    let mut curl = Command::new("/usr/bin/curl");
    curl.args(["--proto", "=https", "--tlsv1.2", "-fsSL", url, "-o"])
        .arg(&temporary);
    clear_bootstrap_credential_env(&mut curl);
    run_cli_installer(curl, "managed runtime archive download")?;
    verify_file_sha256(&temporary, expected_sha256, label)?;
    std::fs::rename(&temporary, archive)
        .map_err(|error| format!("publish verified {label} archive: {error}"))
}

#[cfg(target_os = "macos")]
fn download_managed_uv_at(app_support: &Path) -> Result<PathBuf, String> {
    let root = hermes_provider_root_at(app_support).join("bootstrap");
    let target = match std::env::consts::ARCH {
        "aarch64" => "aarch64-apple-darwin",
        "x86_64" => "x86_64-apple-darwin",
        arch => {
            return Err(format!(
                "Hermes uv bootstrap does not support macOS {arch}."
            ))
        }
    };
    let downloads = root.join("downloads");
    let unpacked = root.join("unpacked");
    std::fs::create_dir_all(&downloads)
        .map_err(|error| format!("create {}: {error}", downloads.display()))?;
    std::fs::create_dir_all(&unpacked)
        .map_err(|error| format!("create {}: {error}", unpacked.display()))?;
    let archive = downloads.join(format!("uv-{UV_BOOTSTRAP_VERSION}-{target}.tar.gz"));
    let url = format!(
        "https://github.com/astral-sh/uv/releases/download/{UV_BOOTSTRAP_VERSION}/uv-{target}.tar.gz"
    );
    let expected_sha256 = uv_macos_archive_sha256(target)
        .ok_or_else(|| format!("No embedded uv checksum is available for {target}."))?;
    download_verified_archive(&url, &archive, expected_sha256, "uv")?;
    let mut tar = Command::new("/usr/bin/tar");
    tar.args(["-xzf"]).arg(&archive).arg("-C").arg(&unpacked);
    clear_bootstrap_credential_env(&mut tar);
    run_cli_installer(tar, "uv extract")?;
    let source = unpacked.join(format!("uv-{target}")).join("uv");
    let destination = root.join("bin").join("uv");
    atomic_install_executable(&source, &destination)?;
    Ok(destination)
}

#[cfg(not(target_os = "macos"))]
fn download_managed_uv_at(_: &Path) -> Result<PathBuf, String> {
    let resolved = crate::agent_process::resolve_cli_executable("uv");
    resolved
        .is_file()
        .then_some(resolved)
        .ok_or_else(|| "Automatic uv bootstrap is currently available on macOS only.".to_string())
}

fn ensure_uv_at(app_support: &Path) -> Result<PathBuf, String> {
    let managed = hermes_provider_root_at(app_support)
        .join("bootstrap")
        .join("bin")
        .join(if cfg!(target_os = "windows") {
            "uv.exe"
        } else {
            "uv"
        });
    let candidate = if managed.is_file() {
        managed
    } else {
        download_managed_uv_at(app_support)?
    };
    let mut version = cli_command(&candidate.to_string_lossy());
    version.arg("--version");
    let detected = run_runtime_probe(version, "uv version check", MANAGED_RUNTIME_CHECK_TIMEOUT)?;
    if !detected.contains(UV_BOOTSTRAP_VERSION) {
        return Err(format!(
            "Atelier requires uv {UV_BOOTSTRAP_VERSION} for Hermes bootstrap."
        ));
    }
    Ok(candidate)
}

fn quarantine_untrusted_hermes_skill_tree(
    layout: &ManagedRuntimeLayout,
) -> Result<Option<PathBuf>, String> {
    if !layout.skills.exists() {
        return Ok(None);
    }
    let has_entries = std::fs::read_dir(&layout.skills)
        .map_err(|error| format!("read {}: {error}", layout.skills.display()))?
        .next()
        .transpose()
        .map_err(|error| format!("read {}: {error}", layout.skills.display()))?
        .is_some();
    if !has_entries {
        return Ok(None);
    }
    let quarantine_root = layout.root.join("skill-quarantine");
    std::fs::create_dir_all(&quarantine_root)
        .map_err(|error| format!("create {}: {error}", quarantine_root.display()))?;
    let destination = quarantine_root.join(format!(
        "skills-{}-{}",
        chrono::Utc::now().timestamp_millis(),
        std::process::id()
    ));
    std::fs::rename(&layout.skills, &destination).map_err(|error| {
        format!(
            "quarantine untrusted Hermes skill tree {} -> {}: {error}",
            layout.skills.display(),
            destination.display()
        )
    })?;
    std::fs::create_dir_all(&layout.skills)
        .map_err(|error| format!("recreate {}: {error}", layout.skills.display()))?;
    Ok(Some(destination))
}

fn bootstrap_hermes_skills_at(app_support: &Path) -> Result<(), String> {
    bootstrap_hermes_skills_at_with_commit(app_support, HERMES_COMMIT)
}

fn bootstrap_hermes_skills_at_with_commit(
    app_support: &Path,
    expected_commit: &str,
) -> Result<(), String> {
    let executable = hermes_managed_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Hermes executable is missing.".to_string())?;
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    let bundled_skills = materialize_hermes_bundled_source_at(app_support, expected_commit)?;
    let quarantined = quarantine_untrusted_hermes_skill_tree(&layout)?;
    if let Some(path) = quarantined {
        log::warn!(
            "quarantined untrusted Hermes managed skills before pinned bootstrap: {}",
            path.display()
        );
    }

    let mut sync = cli_command(&executable.to_string_lossy());
    configure_hermes_runtime_env_at(&mut sync, app_support)?;
    sync.env("HERMES_BUNDLED_SKILLS", &bundled_skills)
        .args(["skills", "opt-in", "--sync"])
        .current_dir(&layout.root);
    run_runtime_probe(
        sync,
        "Hermes durable bundled skill sync",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?;

    let mut list = cli_command(&executable.to_string_lossy());
    configure_hermes_runtime_env_at(&mut list, app_support)?;
    list.args(["skills", "list", "--source", "builtin", "--enabled-only"])
        .current_dir(&layout.root);
    run_runtime_probe(
        list,
        "Hermes bundled skill catalog check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?;
    verify_hermes_installed_skills_against_source_at(app_support, &layout.skills, expected_commit)
        .map(|_| ())
}

fn install_hermes_cli_at(app_support: &Path) -> Result<(), String> {
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    ensure_runtime_layout(&layout)?;
    let tool_dir = hermes_uv_tool_dir_at(app_support);
    let bin_dir = hermes_uv_bin_dir_at(app_support);
    std::fs::create_dir_all(&tool_dir)
        .map_err(|error| format!("create {}: {error}", tool_dir.display()))?;
    std::fs::create_dir_all(&bin_dir)
        .map_err(|error| format!("create {}: {error}", bin_dir.display()))?;
    let uv = ensure_uv_at(app_support)?;
    let python = ensure_hermes_managed_python_at(app_support, &uv)?;
    let mut command = cli_command(&uv.to_string_lossy());
    configure_hermes_runtime_env_at(&mut command, app_support)?;
    command
        .args(["tool", "install", "--force", "--python"])
        .arg(&python)
        .arg(HERMES_GIT_SPEC);
    command
        .current_dir(&layout.root)
        .env("UV_TOOL_DIR", &tool_dir)
        .env(
            "UV_PYTHON_INSTALL_DIR",
            hermes_uv_python_dir_at(app_support),
        )
        .env("UV_CACHE_DIR", &layout.cache)
        .env("UV_NO_CONFIG", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(target_os = "windows") {
                "NUL"
            } else {
                "/dev/null"
            },
        );
    run_cli_installer(command, "hermes")?;
    let executable = hermes_managed_executable_path_at(app_support).ok_or_else(|| {
        format!(
            "Hermes installer completed, but no executable was found in {}",
            bin_dir.display()
        )
    })?;
    if !hermes_direct_url_has_pinned_commit(&tool_dir) {
        return Err(format!(
            "Hermes installed, but provenance did not match commit {HERMES_COMMIT}."
        ));
    }
    save_hermes_install_record_at(app_support, &executable)?;
    bootstrap_hermes_skills_at(app_support)
}

fn ensure_hermes_managed_python_at(app_support: &Path, uv: &Path) -> Result<PathBuf, String> {
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    let python_dir = hermes_uv_python_dir_at(app_support);
    std::fs::create_dir_all(&python_dir)
        .map_err(|error| format!("create {}: {error}", python_dir.display()))?;
    let mut command = cli_command(&uv.to_string_lossy());
    configure_hermes_runtime_env_at(&mut command, app_support)?;
    command
        .args(["python", "install", "--install-dir"])
        .arg(&python_dir)
        .arg("3.11")
        .current_dir(&layout.root)
        .env("UV_PYTHON_INSTALL_DIR", &python_dir)
        .env("UV_CACHE_DIR", &layout.cache)
        .env("UV_NO_CONFIG", "1");
    run_cli_installer(command, "Hermes managed Python")?;

    let mut candidates = std::fs::read_dir(&python_dir)
        .map_err(|error| format!("read {}: {error}", python_dir.display()))?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("cpython-3.11"))
        })
        .map(|path| {
            path.join("bin").join(if cfg!(target_os = "windows") {
                "python.exe"
            } else {
                "python3.11"
            })
        })
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();
    candidates.sort();
    candidates.pop().ok_or_else(|| {
        format!(
            "Hermes managed Python install completed, but no local interpreter was found in {}",
            python_dir.display()
        )
    })
}

fn install_hermes_cli() -> Result<(), String> {
    let app_support = app_support_dir()
        .ok_or_else(|| "Could not resolve the Atelier Hermes directory.".to_string())?;
    install_hermes_cli_at(&app_support)
}

#[cfg(target_os = "macos")]
fn install_managed_bun_at(app_support: &Path) -> Result<PathBuf, String> {
    let layout = managed_runtime_layout_at(app_support, "gajecode")?;
    ensure_runtime_layout(&layout)?;
    let target = match std::env::consts::ARCH {
        "aarch64" => "bun-darwin-aarch64",
        "x86_64" => "bun-darwin-x64",
        arch => return Err(format!("Bun bootstrap does not support macOS {arch}.")),
    };
    let bun_root = layout.root.join("bun");
    let downloads = bun_root.join("downloads");
    let unpacked = bun_root.join("unpacked");
    std::fs::create_dir_all(&downloads)
        .map_err(|error| format!("create {}: {error}", downloads.display()))?;
    std::fs::create_dir_all(&unpacked)
        .map_err(|error| format!("create {}: {error}", unpacked.display()))?;
    let archive = downloads.join(format!("bun-v{BUN_VERSION}-{target}.zip"));
    let url =
        format!("https://github.com/oven-sh/bun/releases/download/bun-v{BUN_VERSION}/{target}.zip");
    let expected_sha256 = bun_macos_archive_sha256(target)
        .ok_or_else(|| format!("No embedded Bun checksum is available for {target}."))?;
    download_verified_archive(&url, &archive, expected_sha256, "Bun")?;
    let mut unzip = Command::new("/usr/bin/unzip");
    unzip.args(["-o"]).arg(&archive).arg("-d").arg(&unpacked);
    clear_bootstrap_credential_env(&mut unzip);
    run_cli_installer(unzip, "Bun extract")?;
    let source = unpacked.join(target).join("bun");
    let destination = bun_root.join("bin").join("bun");
    atomic_install_executable(&source, &destination)?;
    Ok(destination)
}

#[cfg(not(target_os = "macos"))]
fn install_managed_bun_at(app_support: &Path) -> Result<PathBuf, String> {
    let root = app_support.join("providers").join("gajecode").join("bun");
    let mut command = cli_command("npm");
    command
        .args(["install", "-g", "--prefix"])
        .arg(&root)
        .arg(BUN_PACKAGE);
    run_cli_installer(command, "Bun")?;
    gajecode_bun_executable_path_at(app_support)
        .ok_or_else(|| "The managed Bun executable was not installed.".to_string())
}

fn bootstrap_gajecode_skills_at(app_support: &Path) -> Result<(), String> {
    let layout = managed_runtime_layout_at(app_support, "gajecode")?;
    let workspace = layout
        .workspace
        .as_deref()
        .ok_or_else(|| "The Gajaecode workspace is unavailable.".to_string())?;
    let mut setup = gajecode_command_at(app_support)?;
    setup.args(["setup", "defaults"]).current_dir(workspace);
    run_runtime_probe(
        setup,
        "Gajaecode default skill bootstrap",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?;
    let mut check = gajecode_command_at(app_support)?;
    check
        .args(["setup", "defaults", "--check"])
        .current_dir(workspace);
    let check_succeeded = run_runtime_probe(
        check,
        "Gajaecode default skill check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )
    .is_ok();
    if !check_succeeded {
        let mut repair = gajecode_command_at(app_support)?;
        repair
            .args(["setup", "defaults", "--force"])
            .current_dir(workspace);
        run_runtime_probe(
            repair,
            "Gajaecode default skill repair",
            MANAGED_RUNTIME_CHECK_TIMEOUT,
        )?;
        let mut repaired_check = gajecode_command_at(app_support)?;
        repaired_check
            .args(["setup", "defaults", "--check"])
            .current_dir(workspace);
        run_runtime_probe(
            repaired_check,
            "Gajaecode repaired default skill check",
            MANAGED_RUNTIME_CHECK_TIMEOUT,
        )?;
    }
    write_gajecode_skill_integrity_manifest(&layout.skills)
}

fn install_gajecode_cli_at(app_support: &Path) -> Result<(), String> {
    let bun = install_managed_bun_at(app_support)?;
    let mut bun_version = cli_command(&bun.to_string_lossy());
    configure_gajecode_runtime_env_at(&mut bun_version, app_support)?;
    bun_version.arg("--version");
    let detected = first_semver_token(&run_runtime_probe(
        bun_version,
        "Bun version check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?)
    .ok_or_else(|| "Could not parse the managed Bun version.".to_string())?;
    if detected != BUN_VERSION {
        return Err(format!(
            "Atelier requires Bun {BUN_VERSION}, but bootstrap installed {detected}."
        ));
    }
    let mut command = cli_command(&bun.to_string_lossy());
    configure_gajecode_runtime_env_at(&mut command, app_support)?;
    command.args(["install", "-g", GAJAE_CODE_PACKAGE]);
    run_cli_installer(command, "gajecode")?;
    bootstrap_gajecode_skills_at(app_support)
}

fn ensure_managed_agent_runtime_blocking_at<F>(
    app_support: &Path,
    provider: &str,
    mut progress: F,
) -> Result<ManagedAgentRuntimeReadiness, String>
where
    F: FnMut(&str, &str),
{
    let _guard = acquire_runtime_install_lock(provider)?;
    progress("checking", "Checking the Atelier-managed runtime.");
    if let Ok(ready) = verify_managed_runtime_at(app_support, provider) {
        progress("ready", "The Atelier-managed runtime is ready.");
        return Ok(ready);
    }

    progress(
        "installing",
        "Installing or repairing the pinned Atelier-managed runtime.",
    );
    match provider {
        "hermes" => install_hermes_cli_at(app_support)?,
        "gajecode" => install_gajecode_cli_at(app_support)?,
        _ => return Err(format!("Unsupported managed runtime provider: {provider}")),
    }

    progress(
        "bootstrapping_skills",
        "Verifying the isolated default skill bundle.",
    );
    let layout = managed_runtime_layout_at(app_support, provider)?;
    let (executable, skill_count) = match provider {
        "hermes" => verify_hermes_components_at(app_support)?,
        "gajecode" => verify_gajecode_components_at(app_support)?,
        _ => return Err(format!("Unsupported managed runtime provider: {provider}")),
    };
    let receipt = expected_runtime_receipt(&layout, &executable, skill_count)?;
    write_runtime_receipt(&layout.receipt, &receipt)?;

    progress(
        "verifying",
        "Validating the pinned runtime readiness receipt.",
    );
    let mut ready = verify_managed_runtime_at(app_support, provider)?;
    ready.repaired = true;
    progress("ready", "The Atelier-managed runtime is ready.");
    Ok(ready)
}

fn emit_managed_runtime_progress<R: Runtime>(
    app: &AppHandle<R>,
    provider: &str,
    state: &str,
    message: &str,
) {
    let _ = app.emit(
        "managed-agent-runtime-progress",
        ManagedAgentRuntimeProgress {
            provider: provider.to_string(),
            state: state.to_string(),
            message: message.to_string(),
        },
    );
}

/// Ensure an exact, Atelier-owned Hermes or Gajaecode runtime before a managed
/// send. This never reads provider credentials and never accepts a global CLI,
/// global HOME, or global skill directory as readiness evidence.
pub async fn ensure_managed_agent_runtime<R: Runtime>(
    app: &AppHandle<R>,
    provider: &str,
) -> Result<ManagedAgentRuntimeReadiness, String> {
    let provider = provider.trim().to_ascii_lowercase();
    let app_support = app_support_dir().ok_or_else(|| {
        "Could not resolve the Atelier Application Support directory.".to_string()
    })?;
    let progress_app = app.clone();
    let progress_provider = provider.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        ensure_managed_agent_runtime_blocking_at(
            &app_support,
            &progress_provider,
            |state, message| {
                emit_managed_runtime_progress(&progress_app, &progress_provider, state, message);
            },
        )
    })
    .await
    .map_err(|error| format!("{provider} runtime preparation task failed: {error}"))?;
    if result.is_err() {
        emit_managed_runtime_progress(
            app,
            &provider,
            "failed",
            "The Atelier-managed runtime could not be prepared.",
        );
    }
    result
}

#[tauri::command]
pub async fn provider_prepare_managed_runtime<R: Runtime>(
    app: AppHandle<R>,
    provider: String,
) -> Result<ManagedAgentRuntimeReadiness, String> {
    ensure_managed_agent_runtime(&app, &provider).await
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
    provider_install_cli("gajecode".to_string()).await
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
    let Some(executable) = hermes_executable_path() else {
        return Ok(empty);
    };
    let mut command = cli_command(&executable.to_string_lossy());
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
    if !output.status.success() {
        return Ok(empty);
    }
    for line in combined.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("Hermes Agent ") {
            current_version = Some(rest.to_string());
        }
    }
    let update_available = !hermes_install_record_is_current();
    let message = update_available.then(|| {
        "Reinstall the Atelier-pinned Hermes build to restore a verified runtime.".to_string()
    });
    Ok(HermesUpdateStatus {
        installed: true,
        current_version,
        update_available,
        commits_behind: None,
        message,
    })
}

/// Mutable upstream updates can silently change the runtime after release. Reinstall the
/// immutable Hermes commit selected by this Atelier build and return only after verification.
#[tauri::command]
pub async fn hermes_update() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(install_hermes_cli)
        .await
        .map_err(|error| format!("Hermes reinstall task failed: {error}"))?
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

    struct ManagedRuntimeTestRoot(PathBuf);

    impl ManagedRuntimeTestRoot {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "atelier-managed-runtime-{label}-{}",
                uuid::Uuid::new_v4()
            ));
            std::fs::create_dir_all(&path).expect("create managed runtime test root");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for ManagedRuntimeTestRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn codex_fixture_jwt(exp: i64) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"RS256","typ":"JWT"}"#);
        let claims =
            URL_SAFE_NO_PAD.encode(serde_json::json!({ "exp": exp }).to_string().as_bytes());
        format!("{header}.{claims}.fixture-signature")
    }

    fn write_codex_auth_fixture(
        codex_home: &Path,
        access_token: &str,
        refresh_token: &str,
    ) -> PathBuf {
        std::fs::create_dir_all(codex_home).expect("create Codex fixture home");
        let auth_path = codex_home.join("auth.json");
        let body = serde_json::json!({
            "auth_mode": "chatgpt",
            "OPENAI_API_KEY": null,
            "tokens": {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "id_token": "fixture-id-token",
                "account_id": "fixture-account"
            },
            "last_refresh": "2026-07-26T00:00:00Z"
        });
        std::fs::write(&auth_path, body.to_string()).expect("write Codex auth fixture");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&auth_path, std::fs::Permissions::from_mode(0o600))
                .expect("secure Codex auth fixture permissions");
        }
        auth_path
    }

    #[cfg(unix)]
    fn write_test_executable(path: &Path, script: &str) {
        use std::os::unix::fs::PermissionsExt;

        std::fs::create_dir_all(path.parent().expect("test executable parent"))
            .expect("create test executable parent");
        std::fs::write(path, script).expect("write test executable");
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
            .expect("chmod test executable");
    }

    #[cfg(unix)]
    fn run_test_git(checkout: &Path, args: &[&str]) -> String {
        let mut command = if cfg!(target_os = "macos") && Path::new("/usr/bin/git").is_file() {
            Command::new("/usr/bin/git")
        } else {
            Command::new("git")
        };
        let output = command
            .current_dir(checkout)
            .args(args)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .output()
            .expect("run test git");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout)
            .expect("test git UTF-8")
            .trim()
            .to_string()
    }

    #[cfg(unix)]
    fn create_hermes_checkout_fixture(
        app_support: &Path,
        include_symlink: bool,
    ) -> (PathBuf, String) {
        let layout =
            managed_runtime_layout_at(app_support, "hermes").expect("Hermes fixture layout");
        ensure_runtime_layout(&layout).expect("create Hermes fixture layout");
        let checkout = layout
            .cache
            .join("git-v0/checkouts/fixture-owner/fixture-checkout");
        std::fs::create_dir_all(&checkout).expect("create Hermes checkout fixture");
        run_test_git(&checkout, &["init", "-q"]);
        let skill_dir = checkout.join("skills/fixture-category/fixture-skill");
        std::fs::create_dir_all(&skill_dir).expect("create Hermes fixture skill");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: fixture-skill\n---\ncommitted source\n",
        )
        .expect("write Hermes fixture skill");
        std::fs::write(
            checkout.join("skills/fixture-category/DESCRIPTION.md"),
            "Fixture category\n",
        )
        .expect("write Hermes fixture description");
        if include_symlink {
            std::os::unix::fs::symlink("SKILL.md", skill_dir.join("linked-skill.md"))
                .expect("create Hermes fixture symlink");
        }
        run_test_git(&checkout, &["add", "skills"]);
        run_test_git(
            &checkout,
            &[
                "-c",
                "user.name=Atelier Test",
                "-c",
                "user.email=atelier-test@example.invalid",
                "commit",
                "-q",
                "-m",
                "fixture",
            ],
        );
        let commit = run_test_git(&checkout, &["rev-parse", "HEAD"]);
        (checkout, commit)
    }

    #[test]
    fn managed_layout_keeps_provider_homes_and_skills_inside_app_support() {
        let root = ManagedRuntimeTestRoot::new("layout");
        let hermes =
            managed_runtime_layout_at(root.path(), "hermes").expect("Hermes managed layout");
        let gajecode =
            managed_runtime_layout_at(root.path(), "gajecode").expect("Gajaecode managed layout");

        assert_eq!(hermes.home, root.path().join("providers/hermes/home"));
        assert_eq!(hermes.skills, hermes.home.join("skills"));
        assert_eq!(
            gajecode.skills,
            root.path()
                .join("providers/gajecode/home/.gjc/agent/skills")
        );
        assert_eq!(
            gajecode.workspace,
            Some(root.path().join("providers/gajecode/workspace"))
        );
        assert!(!gajecode.skills.to_string_lossy().contains("/.codex/skills"));
        assert!(!gajecode
            .skills
            .to_string_lossy()
            .contains("/.claude/skills"));
    }

    #[test]
    fn isolated_runtime_envs_use_only_the_temp_app_support_provider_homes() {
        let root = ManagedRuntimeTestRoot::new("env");
        let mut hermes = Command::new("/usr/bin/true");
        configure_hermes_runtime_env_at(&mut hermes, root.path())
            .expect("configure Hermes test env");
        let hermes_env = hermes
            .get_envs()
            .filter_map(|(key, value)| {
                value.map(|value| {
                    (
                        key.to_string_lossy().into_owned(),
                        value.to_string_lossy().into_owned(),
                    )
                })
            })
            .collect::<HashMap<_, _>>();
        assert_eq!(
            hermes_env.get("HERMES_HOME").map(String::as_str),
            Some(
                root.path()
                    .join("providers/hermes/home")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        assert_eq!(
            hermes_env.get("UV_PYTHON_INSTALL_DIR").map(String::as_str),
            Some(
                root.path()
                    .join("providers/hermes/uv-python")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        assert!(
            hermes
                .get_envs()
                .any(|(key, value)| { key == "HERMES_BUNDLED_SKILLS" && value.is_none() }),
            "normal Hermes runtime commands must clear inherited bundled-source overrides"
        );

        let mut gajecode = Command::new("/usr/bin/true");
        configure_gajecode_runtime_env_at(&mut gajecode, root.path())
            .expect("configure Gajaecode test env");
        let gajecode_env = gajecode
            .get_envs()
            .filter_map(|(key, value)| {
                value.map(|value| {
                    (
                        key.to_string_lossy().into_owned(),
                        value.to_string_lossy().into_owned(),
                    )
                })
            })
            .collect::<HashMap<_, _>>();
        assert_eq!(
            gajecode_env.get("GJC_CONFIG_DIR").map(String::as_str),
            Some(
                root.path()
                    .join("providers/gajecode/home/.gjc")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        assert_eq!(
            gajecode_env.get("GJC_CODING_AGENT_DIR").map(String::as_str),
            Some(
                root.path()
                    .join("providers/gajecode/home/.gjc/agent")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        assert_eq!(
            gajecode_env.get("ATELIER_SKILLS_DIR").map(String::as_str),
            Some(
                root.path()
                    .join("providers/gajecode/home/.gjc/agent/skills")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        for key in [
            "OPENAI_CODEX_OAUTH_TOKEN",
            "OPENAI_API_KEY",
            "CODEX_API_KEY",
            "OPENAI_OAUTH_TOKEN",
            "CODEX_OAUTH_TOKEN",
            "CHATGPT_ACCESS_TOKEN",
            "OPENAI_ACCESS_TOKEN",
        ] {
            assert!(
                gajecode
                    .get_envs()
                    .any(|(candidate, value)| candidate == key && value.is_none()),
                "isolated Gajae runtime must scrub inherited {key}"
            );
        }
    }

    #[test]
    fn codex_subscription_reader_returns_only_a_fresh_access_token() {
        let root = ManagedRuntimeTestRoot::new("codex-access");
        let codex_home = root.path().join("codex-home");
        let now = 1_900_000_000;
        let access_token = codex_fixture_jwt(now + 3_600);
        let refresh_token = "fixture-refresh-token-must-never-leave-auth-json";
        write_codex_auth_fixture(&codex_home, &access_token, refresh_token);

        let loaded = read_codex_subscription_access_token_at(&codex_home, now)
            .expect("read fresh Codex access token");
        assert_eq!(loaded, access_token);
        assert_ne!(loaded, refresh_token);
        assert!(!loaded.contains(refresh_token));
    }

    #[test]
    fn codex_subscription_reader_rejects_expiry_size_and_schema_failures() {
        let now = 1_900_000_000;

        let expired_root = ManagedRuntimeTestRoot::new("codex-expired");
        let expired_home = expired_root.path().join("codex-home");
        let expired = codex_fixture_jwt(now + CODEX_ACCESS_TOKEN_MIN_FRESHNESS_SECONDS);
        write_codex_auth_fixture(&expired_home, &expired, "fixture-refresh-expired");
        let expired_error = read_codex_subscription_access_token_at(&expired_home, now)
            .expect_err("expired Codex token must fail closed");
        assert!(expired_error.contains("expired"));
        assert!(!expired_error.contains("fixture-refresh-expired"));

        let schema_root = ManagedRuntimeTestRoot::new("codex-schema");
        let schema_home = schema_root.path().join("codex-home");
        std::fs::create_dir_all(&schema_home).expect("create schema fixture home");
        let schema_path = schema_home.join("auth.json");
        std::fs::write(
            &schema_path,
            r#"{"auth_mode":"chatgpt","tokens":{"refresh_token":"fixture-refresh-only"}}"#,
        )
        .expect("write malformed Codex auth fixture");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&schema_path, std::fs::Permissions::from_mode(0o600))
                .expect("secure malformed Codex auth fixture");
        }
        let schema_error = read_codex_subscription_access_token_at(&schema_home, now)
            .expect_err("missing access token must fail closed");
        assert!(schema_error.contains("schema"));
        assert!(!schema_error.contains("fixture-refresh-only"));

        let size_root = ManagedRuntimeTestRoot::new("codex-size");
        let size_home = size_root.path().join("codex-home");
        let valid = codex_fixture_jwt(now + 3_600);
        let size_path = write_codex_auth_fixture(&size_home, &valid, "fixture-refresh-size");
        std::fs::write(&size_path, vec![b'x'; CODEX_AUTH_MAX_BYTES as usize + 1])
            .expect("write oversized Codex auth fixture");
        let size_error = read_codex_subscription_access_token_at(&size_home, now)
            .expect_err("oversized Codex auth file must fail closed");
        assert!(size_error.contains("size"));
    }

    #[cfg(unix)]
    #[test]
    fn codex_subscription_reader_rejects_symlinked_paths_and_broad_permissions() {
        use std::os::unix::fs::{symlink, PermissionsExt};

        let now = 1_900_000_000;
        let access_token = codex_fixture_jwt(now + 3_600);

        let file_link_root = ManagedRuntimeTestRoot::new("codex-file-link");
        let file_link_home = file_link_root.path().join("codex-home");
        std::fs::create_dir_all(&file_link_home).expect("create linked-file Codex home");
        let target_home = file_link_root.path().join("target-home");
        let target_auth =
            write_codex_auth_fixture(&target_home, &access_token, "fixture-refresh-link");
        symlink(&target_auth, file_link_home.join("auth.json"))
            .expect("create Codex auth symlink fixture");
        let file_link_error = read_codex_subscription_access_token_at(&file_link_home, now)
            .expect_err("symlinked Codex auth file must fail closed");
        assert!(file_link_error.contains("trusted regular file"));

        let home_link_root = ManagedRuntimeTestRoot::new("codex-home-link");
        let real_home = home_link_root.path().join("real-home");
        write_codex_auth_fixture(&real_home, &access_token, "fixture-refresh-home-link");
        let linked_home = home_link_root.path().join("linked-home");
        symlink(&real_home, &linked_home).expect("create Codex home symlink fixture");
        let home_link_error = read_codex_subscription_access_token_at(&linked_home, now)
            .expect_err("symlinked Codex home must fail closed");
        assert!(home_link_error.contains("trusted regular directory"));

        let permission_root = ManagedRuntimeTestRoot::new("codex-permissions");
        let permission_home = permission_root.path().join("codex-home");
        let permission_path = write_codex_auth_fixture(
            &permission_home,
            &access_token,
            "fixture-refresh-permissions",
        );
        std::fs::set_permissions(&permission_path, std::fs::Permissions::from_mode(0o644))
            .expect("broaden Codex auth fixture permissions");
        let permission_error = read_codex_subscription_access_token_at(&permission_home, now)
            .expect_err("broad Codex auth permissions must fail closed");
        assert!(permission_error.contains("permissions"));
    }

    #[test]
    #[ignore = "reads the current user's Codex CLI session without making a provider request"]
    fn manual_real_gajecode_codex_access_bridge() {
        let access_token = prepare_gajecode_codex_subscription_token()
            .expect("current Codex ChatGPT session should provide a fresh access token");
        validate_codex_access_token(&access_token, chrono::Utc::now().timestamp())
            .expect("bridged Codex access token should remain fresh");
    }

    #[cfg(unix)]
    #[test]
    fn gajecode_readiness_requires_exact_pins_defaults_and_receipt() {
        let root = ManagedRuntimeTestRoot::new("gajecode");
        let layout = managed_runtime_layout_at(root.path(), "gajecode").expect("Gajaecode layout");
        ensure_runtime_layout(&layout).expect("create Gajaecode layout");
        let bun = layout.root.join("bun/bin/bun");
        let gjc = layout.root.join("bun/bin/gjc");
        write_test_executable(&bun, "#!/bin/sh\nprintf '1.3.14\\n'\n");
        write_test_executable(
            &gjc,
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then printf 'Gajae CLI 0.11.7\\n'; exit 0; fi\nif [ \"$1\" = \"setup\" ] && [ \"$2\" = \"defaults\" ]; then exit 0; fi\nexit 2\n",
        );
        for skill in GAJAE_DEFAULT_SKILLS {
            let skill_md = layout.skills.join(skill).join("SKILL.md");
            std::fs::create_dir_all(skill_md.parent().expect("skill parent"))
                .expect("create default skill");
            std::fs::write(skill_md, format!("---\nname: {skill}\n---\n"))
                .expect("write default skill");
        }
        write_gajecode_skill_integrity_manifest(&layout.skills)
            .expect("write Gajaecode skill integrity fixture");

        let (executable, count) =
            verify_gajecode_components_at(root.path()).expect("verify exact Gajaecode pins");
        let receipt =
            expected_runtime_receipt(&layout, &executable, count).expect("expected receipt");
        write_runtime_receipt(&layout.receipt, &receipt).expect("write readiness receipt");
        let ready = verify_managed_runtime_at(root.path(), "gajecode").expect("verified readiness");
        assert!(ready.ready);
        assert_eq!(ready.runtime_pin, GAJAE_CODE_VERSION);
        assert_eq!(ready.dependency_pin.as_deref(), Some(BUN_VERSION));

        write_test_executable(&bun, "#!/bin/sh\nprintf '1.3.13\\n'\n");
        let error = verify_managed_runtime_at(root.path(), "gajecode")
            .expect_err("wrong Bun pin must fail readiness");
        assert!(error.contains("requires Bun 1.3.14"));
    }

    #[test]
    fn managed_hash_implementations_match_known_vectors_and_release_pins() {
        let mut empty = HermesManifestMd5::new();
        empty.update(b"").expect("hash empty MD5 vector");
        assert_eq!(
            empty.finish().expect("finish empty MD5 vector"),
            "d41d8cd98f00b204e9800998ecf8427e"
        );
        let mut abc = HermesManifestMd5::new();
        abc.update(b"abc").expect("hash abc MD5 vector");
        assert_eq!(
            abc.finish().expect("finish abc MD5 vector"),
            "900150983cd24fb0d6963f7d28e17f72"
        );
        assert_eq!(
            uv_macos_archive_sha256("aarch64-apple-darwin"),
            Some(UV_MACOS_AARCH64_SHA256)
        );
        assert_eq!(
            uv_macos_archive_sha256("x86_64-apple-darwin"),
            Some(UV_MACOS_X86_64_SHA256)
        );
        assert_eq!(
            bun_macos_archive_sha256("bun-darwin-aarch64"),
            Some(BUN_MACOS_AARCH64_SHA256)
        );
        assert_eq!(
            bun_macos_archive_sha256("bun-darwin-x64"),
            Some(BUN_MACOS_X86_64_SHA256)
        );
    }

    #[test]
    fn downloaded_archive_checksum_fails_closed_after_tamper_without_network() {
        let root = ManagedRuntimeTestRoot::new("archive-checksum");
        let archive = root.path().join("fixture.archive");
        std::fs::write(&archive, b"verified archive bytes").expect("write archive fixture");
        let expected = sha256_file_hex(&archive).expect("hash archive fixture");
        verify_file_sha256(&archive, &expected, "fixture archive")
            .expect("matching archive checksum");

        std::fs::write(&archive, b"tampered archive bytes").expect("tamper archive fixture");
        let error = verify_file_sha256(&archive, &expected, "fixture archive")
            .expect_err("tampered archive must fail");
        assert!(error.contains("failed SHA-256 verification"));
    }

    #[cfg(unix)]
    #[test]
    fn gajecode_readiness_rejects_default_skill_tamper_in_temp_app_support() {
        let root = ManagedRuntimeTestRoot::new("gajecode-skill-tamper");
        let layout = managed_runtime_layout_at(root.path(), "gajecode").expect("Gajaecode layout");
        ensure_runtime_layout(&layout).expect("create Gajaecode layout");
        write_test_executable(
            &layout.root.join("bun/bin/bun"),
            "#!/bin/sh\nprintf '1.3.14\\n'\n",
        );
        write_test_executable(
            &layout.root.join("bun/bin/gjc"),
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then printf 'Gajae CLI 0.11.7\\n'; exit 0; fi\nif [ \"$1\" = \"setup\" ] && [ \"$2\" = \"defaults\" ]; then exit 0; fi\nexit 2\n",
        );
        for skill in GAJAE_DEFAULT_SKILLS {
            let skill_md = layout.skills.join(skill).join("SKILL.md");
            std::fs::create_dir_all(skill_md.parent().expect("skill parent"))
                .expect("create default skill");
            std::fs::write(&skill_md, format!("---\nname: {skill}\n---\n"))
                .expect("write default skill");
        }
        write_gajecode_skill_integrity_manifest(&layout.skills)
            .expect("write Gajaecode integrity manifest");
        verify_gajecode_components_at(root.path()).expect("initial Gajaecode integrity");

        std::fs::write(
            layout.skills.join("ralplan/SKILL.md"),
            "---\nname: ralplan\n---\nmalicious persistence\n",
        )
        .expect("tamper Gajaecode default skill");
        let error = verify_gajecode_components_at(root.path())
            .expect_err("tampered Gajaecode skill must fail readiness");
        assert!(error.contains("failed content integrity verification"));
    }

    #[cfg(unix)]
    #[test]
    fn hermes_missing_wheel_skills_repair_from_durable_pinned_archive() {
        let root = ManagedRuntimeTestRoot::new("hermes-missing-wheel-skills");
        let (checkout, commit) = create_hermes_checkout_fixture(root.path(), false);
        assert!(
            !hermes_uv_package_dir_at(root.path())
                .join("skills")
                .exists(),
            "fixture intentionally models a wheel with no bundled skills"
        );
        let source_skill = checkout.join("skills/fixture-category/fixture-skill");
        let skill_hash =
            hermes_skill_dir_hash(&source_skill).expect("hash committed Hermes fixture skill");
        let layout = managed_runtime_layout_at(root.path(), "hermes").expect("Hermes layout");
        let executable = layout.root.join("bin/hermes");
        let script = format!(
            "#!/bin/sh\n\
             if [ \"$1\" = \"skills\" ] && [ \"$2\" = \"opt-in\" ] && [ \"$3\" = \"--sync\" ]; then\n\
               test -d \"$HERMES_BUNDLED_SKILLS/fixture-category/fixture-skill\" || exit 21\n\
               mkdir -p \"$HERMES_HOME/skills/fixture-category\"\n\
               cp -R \"$HERMES_BUNDLED_SKILLS/fixture-category/fixture-skill\" \"$HERMES_HOME/skills/fixture-category/\"\n\
               printf 'fixture-skill:{skill_hash}\\n' > \"$HERMES_HOME/skills/.bundled_manifest\"\n\
               exit 0\n\
             fi\n\
             if [ \"$1\" = \"skills\" ] && [ \"$2\" = \"list\" ]; then\n\
               test -z \"$HERMES_BUNDLED_SKILLS\" || exit 22\n\
               exit 0\n\
             fi\n\
             exit 23\n"
        );
        write_test_executable(&executable, &script);
        assert!(!layout.skills.join(".bundled_manifest").exists());

        bootstrap_hermes_skills_at_with_commit(root.path(), &commit)
            .expect("repair missing wheel skills from durable source");

        let bundled_skills = hermes_bundled_skills_dir_at(root.path());
        assert_ne!(bundled_skills, layout.skills);
        assert!(bundled_skills
            .join("fixture-category/fixture-skill/SKILL.md")
            .is_file());
        assert!(layout.skills.join(".bundled_manifest").is_file());
        assert_eq!(
            verify_hermes_installed_skills_against_source_at(root.path(), &layout.skills, &commit)
                .expect("verify repaired Hermes skills"),
            1
        );
    }

    #[cfg(unix)]
    #[test]
    fn hermes_durable_bundle_uses_commit_object_and_quarantines_prior_source() {
        let root = ManagedRuntimeTestRoot::new("hermes-exact-archive");
        let (checkout, commit) = create_hermes_checkout_fixture(root.path(), false);
        let old_skill = hermes_bundled_skills_dir_at(root.path()).join("old/SKILL.md");
        std::fs::create_dir_all(old_skill.parent().expect("old bundled skill parent"))
            .expect("create prior invalid bundle");
        std::fs::write(&old_skill, "---\nname: old\n---\n").expect("write prior invalid bundle");

        std::fs::write(
            checkout.join("skills/fixture-category/fixture-skill/SKILL.md"),
            "---\nname: fixture-skill\n---\nmodified working tree\n",
        )
        .expect("modify checkout worktree after commit");
        let untracked = checkout.join("skills/untracked/SKILL.md");
        std::fs::create_dir_all(untracked.parent().expect("untracked skill parent"))
            .expect("create untracked skill");
        std::fs::write(&untracked, "---\nname: untracked\n---\n").expect("write untracked skill");

        let bundled_skills = materialize_hermes_bundled_source_at(root.path(), &commit)
            .expect("materialize exact Hermes commit archive");
        assert_eq!(
            std::fs::read_to_string(bundled_skills.join("fixture-category/fixture-skill/SKILL.md"))
                .expect("read durable committed skill"),
            "---\nname: fixture-skill\n---\ncommitted source\n"
        );
        assert!(!bundled_skills.join("untracked/SKILL.md").exists());
        assert_ne!(
            bundled_skills,
            managed_runtime_layout_at(root.path(), "hermes")
                .expect("Hermes layout")
                .skills
        );
        verify_hermes_bundled_source_at(root.path(), &commit)
            .expect("verify durable source receipt");

        let quarantine = hermes_provider_root_at(root.path()).join("bundle-quarantine");
        let preserved = std::fs::read_dir(&quarantine)
            .expect("read durable bundle quarantine")
            .filter_map(Result::ok)
            .any(|entry| entry.path().join("skills/old/SKILL.md").is_file());
        assert!(
            preserved,
            "prior nonempty bundle must be recoverably quarantined"
        );

        std::fs::write(
            bundled_skills.join("fixture-category/fixture-skill/SKILL.md"),
            "---\nname: fixture-skill\n---\ntampered durable source\n",
        )
        .expect("tamper durable source");
        let error = verify_hermes_bundled_source_at(root.path(), &commit)
            .expect_err("tampered durable source must fail closed");
        assert!(error.contains("failed content integrity verification"));
    }

    #[cfg(unix)]
    #[test]
    fn hermes_pinned_archive_rejects_symlink_entries() {
        let root = ManagedRuntimeTestRoot::new("hermes-archive-symlink");
        let (_, commit) = create_hermes_checkout_fixture(root.path(), true);
        let error = materialize_hermes_bundled_source_at(root.path(), &commit)
            .expect_err("Hermes git symlink must fail closed");
        assert!(error.contains("unsupported entry"));
        assert!(!hermes_bundled_source_root_at(root.path()).exists());
    }

    #[cfg(unix)]
    #[test]
    fn hermes_durable_bundle_rejects_provider_root_symlink() {
        let root = ManagedRuntimeTestRoot::new("hermes-provider-root-symlink");
        let providers = root.path().join("providers");
        let outside = root.path().join("outside-provider-root");
        std::fs::create_dir_all(&providers).expect("create provider parent");
        std::fs::create_dir_all(&outside).expect("create outside provider root");
        std::os::unix::fs::symlink(&outside, providers.join("hermes"))
            .expect("create provider root symlink");

        let error = materialize_hermes_bundled_source_at(root.path(), HERMES_COMMIT)
            .expect_err("provider root symlink must fail closed");
        assert!(error.contains("not a real directory"));
        assert!(
            std::fs::read_dir(&outside)
                .expect("read outside provider root")
                .next()
                .is_none(),
            "materialization must not write through a provider-root symlink"
        );
    }

    #[test]
    fn hermes_readiness_requires_pinned_commit_and_bundled_skill_manifest() {
        let root = ManagedRuntimeTestRoot::new("hermes");
        let layout = managed_runtime_layout_at(root.path(), "hermes").expect("Hermes layout");
        ensure_runtime_layout(&layout).expect("create Hermes layout");
        let executable = hermes_uv_bin_dir_at(root.path()).join("hermes");
        std::fs::create_dir_all(executable.parent().expect("Hermes bin parent"))
            .expect("create Hermes bin");
        std::fs::write(&executable, b"fixture").expect("write Hermes executable");
        let managed_python = hermes_uv_python_dir_at(root.path())
            .join("cpython-3.11.15-macos-aarch64-none/bin/python3.11");
        std::fs::create_dir_all(managed_python.parent().expect("managed Python parent"))
            .expect("create managed Python parent");
        std::fs::write(&managed_python, b"python fixture").expect("write managed Python fixture");
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            symlink(
                &managed_python,
                hermes_uv_bin_dir_at(root.path()).join("python"),
            )
            .expect("symlink isolated Hermes Python");
        }
        let direct_url = layout
            .root
            .join("uv-tools/hermes-agent/lib/python3.11/site-packages/hermes_agent.dist-info/direct_url.json");
        std::fs::create_dir_all(direct_url.parent().expect("direct_url parent"))
            .expect("create direct_url parent");
        std::fs::write(
            &direct_url,
            serde_json::json!({
                "url": "https://github.com/NousResearch/hermes-agent.git",
                "vcs_info": {"vcs": "git", "commit_id": HERMES_COMMIT}
            })
            .to_string(),
        )
        .expect("write direct_url");
        let bundled_source =
            hermes_bundled_skills_dir_at(root.path()).join("workspace-review/SKILL.md");
        std::fs::create_dir_all(
            bundled_source
                .parent()
                .expect("Hermes bundled source skill parent"),
        )
        .expect("create Hermes bundled source skill");
        std::fs::write(&bundled_source, "---\nname: workspace-review\n---\n")
            .expect("write Hermes bundled source skill");
        write_hermes_bundled_source_manifest(
            &hermes_bundled_source_root_at(root.path()),
            HERMES_COMMIT,
        )
        .expect("write Hermes durable bundled-source manifest");
        let skill = layout.skills.join("workspace-review/SKILL.md");
        std::fs::create_dir_all(skill.parent().expect("Hermes skill parent"))
            .expect("create Hermes skill");
        std::fs::write(&skill, "---\nname: workspace-review\n---\n").expect("write Hermes skill");
        let skill_hash =
            hermes_skill_dir_hash(skill.parent().expect("Hermes skill fixture directory"))
                .expect("hash Hermes skill fixture");
        std::fs::write(
            layout.skills.join(".bundled_manifest"),
            format!("workspace-review:{skill_hash}\n"),
        )
        .expect("write Hermes manifest");

        let (verified_executable, count) =
            verify_hermes_components_at(root.path()).expect("verify Hermes components");
        assert_eq!(count, 1);
        let receipt = expected_runtime_receipt(&layout, &verified_executable, count)
            .expect("expected Hermes receipt");
        write_runtime_receipt(&layout.receipt, &receipt).expect("write Hermes receipt");
        let ready =
            verify_managed_runtime_at(root.path(), "hermes").expect("Hermes should be ready");
        assert_eq!(ready.runtime_pin, HERMES_COMMIT);

        std::fs::write(
            &skill,
            "---\nname: workspace-review\n---\nmalicious persistence\n",
        )
        .expect("tamper Hermes skill");
        let error = verify_hermes_components_at(root.path())
            .expect_err("tampered Hermes skill must fail readiness");
        assert!(error.contains("failed content integrity verification"));
        let quarantined = quarantine_untrusted_hermes_skill_tree(&layout)
            .expect("quarantine tampered Hermes skill tree")
            .expect("tampered Hermes skill tree should be quarantined");
        assert!(quarantined.join("workspace-review/SKILL.md").is_file());
        assert!(!layout.skills.join(".bundled_manifest").exists());
        std::fs::create_dir_all(skill.parent().expect("restored Hermes skill parent"))
            .expect("recreate Hermes skill fixture");
        std::fs::write(&skill, "---\nname: workspace-review\n---\n")
            .expect("restore pinned Hermes fixture");
        std::fs::write(
            layout.skills.join(".bundled_manifest"),
            format!("workspace-review:{skill_hash}\n"),
        )
        .expect("restore pinned Hermes manifest");
        verify_hermes_components_at(root.path()).expect("restored Hermes pinned skill integrity");

        let mut stale = receipt;
        stale.policy_version = "stale-policy".to_string();
        write_runtime_receipt(&layout.receipt, &stale).expect("write stale receipt");
        assert!(verify_managed_runtime_at(root.path(), "hermes").is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "materializes the durable Hermes bundle from the current managed uv cache"]
    fn manual_real_hermes_durable_bundle_from_existing_cache() {
        let app_support = app_support_dir().expect("resolve Atelier app support directory");
        let layout =
            managed_runtime_layout_at(&app_support, "hermes").expect("resolve Hermes layout");
        let source = materialize_hermes_bundled_source_at(&app_support, HERMES_COMMIT)
            .expect("materialize real durable Hermes bundle");
        let (verified_source, skill_hashes) =
            verify_hermes_bundled_source_at(&app_support, HERMES_COMMIT)
                .expect("verify real durable Hermes bundle");
        assert_eq!(source, verified_source);
        assert_ne!(source, layout.skills);
        assert!(!skill_hashes.is_empty());
        let installed_count = verify_hermes_installed_skills_against_source_at(
            &app_support,
            &layout.skills,
            HERMES_COMMIT,
        )
        .expect("verify real installed Hermes skills against durable source");
        assert_eq!(installed_count, skill_hashes.len());
        eprintln!(
            "Hermes durable bundled source: {} ({} source skills, {} installed skills)",
            source.display(),
            skill_hashes.len(),
            installed_count
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "downloads the real managed runtimes into the current user's Atelier app support"]
    fn manual_real_managed_runtime_prepare_proof() {
        let app_support = app_support_dir().expect("resolve Atelier app support directory");
        for provider in ["gajecode", "hermes"] {
            eprintln!(
                "[{provider}] preparing managed runtime in {}",
                app_support.display()
            );
            let readiness = ensure_managed_agent_runtime_blocking_at(
                &app_support,
                provider,
                |state, message| {
                    eprintln!("[{provider}] {state}: {message}");
                },
            )
            .unwrap_or_else(|error| panic!("[{provider}] managed runtime prepare failed: {error}"));
            eprintln!(
                "[{provider}] readiness {}",
                serde_json::to_string_pretty(&readiness).expect("serialize readiness")
            );
            assert!(readiness.ready, "[{provider}] readiness flag must be true");
            assert!(
                Path::new(&readiness.executable).is_file(),
                "[{provider}] executable must exist at {}",
                readiness.executable
            );
            assert!(
                Path::new(&readiness.receipt_path).is_file(),
                "[{provider}] readiness receipt must exist at {}",
                readiness.receipt_path
            );
        }
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
    fn inconclusive_oauth_probe_preserves_last_verified_state() {
        assert!(oauth_probe_result(true, None));
        assert!(!oauth_probe_result(false, None));
        assert!(!oauth_probe_result(true, Some(false)));
        assert!(oauth_probe_result(false, Some(true)));
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
    fn alibaba_token_plan_keys_use_the_dashscope_secure_slot() {
        assert_eq!(env_var_for("alibaba"), Some("DASHSCOPE_API_KEY"));
        assert!(is_valid_api_key_for_provider(
            "alibaba",
            "sk-sp-fixture-token-plan-key"
        ));
        assert!(!is_valid_api_key_for_provider("alibaba", "fixture-key"));
    }

    #[test]
    fn gajecode_managed_models_config_registers_alibaba_without_secrets() {
        let config = gajecode_models_config_content();
        assert!(config.contains("alibaba-token-plan:"));
        assert!(config
            .contains("https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"));
        assert!(config.contains("apiKeyEnv: DASHSCOPE_API_KEY"));
        assert!(config.contains("supportsReasoningEffort: false"));
        assert!(config.contains("supportsReasoningEffort: true"));
        assert!(config.contains("thinkingFormat: qwen"));
        assert!(config.contains("thinkingFormat: openai"));
        assert!(config.contains("id: qwen3.8-max-preview"));
        assert!(config.contains("id: glm-5.2"));
        assert!(config.contains("maxLevel: max"));
        assert!(!config.contains("sk-"));
        assert!(!config.contains("access_token"));
        assert!(!config.contains("refresh_token"));
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
    fn installer_stream_drains_all_output_and_keeps_only_the_bounded_tail() {
        let input = (0..(CLI_INSTALL_CAPTURE_LIMIT + 8192))
            .map(|index| (index % 251) as u8)
            .collect::<Vec<_>>();
        let expected = input[input.len() - CLI_INSTALL_CAPTURE_LIMIT..].to_vec();
        let captured = capture_installer_stream(std::io::Cursor::new(input))
            .join()
            .expect("installer output reader should finish");

        assert_eq!(captured.len(), CLI_INSTALL_CAPTURE_LIMIT);
        assert_eq!(captured, expected);
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
