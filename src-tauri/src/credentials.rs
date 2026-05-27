// 사용자 구독·API 자격증명 관리.
// macOS: Keychain / Windows: Credential Manager (keyring crate가 OS 네이티브 보안 저장소 사용).
// 평문 디스크 저장 금지. profiles JSON에는 boolean 플래그만.

use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const SERVICE: &str = "com.atelier.app";
const HERMES_INSTALL_SH: &str =
    "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup";
#[cfg(target_os = "windows")]
const HERMES_INSTALL_PS1: &str =
    "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1))) -SkipSetup -NonInteractive";
#[cfg(target_os = "windows")]
const CLAUDE_INSTALL_PS1: &str =
    "& ([scriptblock]::Create((irm https://claude.ai/install.ps1))) stable";

#[cfg(target_os = "windows")]
fn configure_background_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_background_command(_: &mut Command) {}

fn cli_command(cli: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("cmd.exe");
        command.arg("/C").arg(cli);
        configure_background_command(&mut command);
        configure_claude_windows_env(&mut command);
        command
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut command = Command::new(cli);
        configure_background_command(&mut command);
        command
    }
}

#[cfg(target_os = "windows")]
fn configure_claude_windows_env(command: &mut Command) {
    if std::env::var_os("CLAUDE_CODE_GIT_BASH_PATH").is_some() {
        return;
    }
    for candidate in [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ] {
        if PathBuf::from(candidate).is_file() {
            command.env("CLAUDE_CODE_GIT_BASH_PATH", candidate);
            break;
        }
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
        _ => None,
    }
}

fn oauth_login_args(provider: &str, fallback_cmd: &'static str) -> Vec<&'static str> {
    match provider {
        "claude" => vec!["auth", "login", "--claudeai"],
        _ => vec![fallback_cmd],
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

fn keychain_entry(provider: &str, slot: &str) -> Result<Entry, String> {
    let username = format!("{provider}.{slot}");
    Entry::new(SERVICE, &username).map_err(|e| format!("keychain entry: {e}"))
}

fn keychain_item_exists(provider: &str, slot: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        let username = format!("{provider}.{slot}");
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

fn which(cli: &str) -> bool {
    // 빠른 PATH 검사. Windows 는 where, Unix 는 command -v.
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("where");
        command.arg(cli);
        command
    };
    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut command = Command::new("sh");
        command.arg("-c").arg(format!("command -v {cli}"));
        command
    };
    configure_background_command(&mut command);
    let res = command.env("PATH", crate::augmented_cli_path()).output();
    matches!(res, Ok(o) if o.status.success())
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
    let cli_installed = meta.cli.map(which).unwrap_or(false);
    let oauth_logged_in = meta.supports_oauth && detect_oauth(&provider);
    let saved_state = credential_state(&provider);

    let (api_key_present, api_key_masked) = if meta.supports_api {
        if saved_state.api_key_present {
            (true, saved_state.api_key_masked)
        } else if keychain_item_exists(&provider, "api_key") {
            let _ = update_credential_state(&provider, |state| {
                state.api_key_present = true;
                state.api_key_masked = "••••".to_string();
            });
            (true, "••••".to_string())
        } else {
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
    for slot in ["api_key", "oauth_marker"] {
        if let Ok(entry) = keychain_entry(&provider, slot) {
            let _ = entry.delete_credential();
        }
    }
    if meta.supports_oauth {
        if let Some(cli) = meta.cli {
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
pub async fn provider_login_oauth(provider: String, force: Option<bool>) -> Result<(), String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    if !meta.supports_oauth {
        return Err(format!("{provider} does not support OAuth"));
    }
    let cli = meta.cli.ok_or("cli not configured")?;
    let cmd = meta.login_cmd.ok_or("login_cmd not configured")?;
    if !which(cli) {
        return Err(format!("CLI '{cli}' is not installed"));
    }
    if force.unwrap_or(false) {
        if let Err(e) = run_oauth_logout(&provider, cli) {
            log::warn!("forced oauth logout before login failed for {provider}: {e}");
        }
        set_oauth_state(&provider, false);
    }

    let provider_clone = provider.clone();
    let cli_owned = cli.to_string();
    let login_args = oauth_login_args(&provider, cmd);
    let cmd_owned = login_args.join(" ");
    let mut command = cli_command(&cli_owned);
    command
        .args(&login_args)
        .env("PATH", crate::augmented_cli_path())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());
    configure_background_command(&mut command);
    let mut child = command
        .spawn()
        .map_err(|e| format!("oauth spawn {cli_owned} {cmd_owned}: {e}"))?;

    // Claude/Codex CLI가 Windows에서 즉시 실패하는 경우에는 "브라우저가 열렸습니다"
    // 모달을 띄우면 사용자가 무한 대기 상태로 보인다. 짧게만 관찰해서 즉시 실패는
    // 호출자에게 돌려주고, 실제 로그인 대기는 백그라운드에서 계속 처리한다.
    let started = Instant::now();
    loop {
        match child
            .try_wait()
            .map_err(|e| format!("{cli_owned} {cmd_owned} poll: {e}"))?
        {
            Some(status) if status.success() => {
                set_oauth_state(&provider_clone, true);
                return Ok(());
            }
            Some(status) => return Err(format!("{cli_owned} {cmd_owned} exited with {status}")),
            None if started.elapsed() >= Duration::from_millis(1200) => break,
            None => thread::sleep(Duration::from_millis(80)),
        }
    }

    std::thread::spawn(move || match child.wait() {
        Ok(status) if status.success() => {
            set_oauth_state(&provider_clone, true);
        }
        Ok(status) => {
            log::warn!("{cli_owned} {cmd_owned} exited with {status}");
        }
        Err(e) => log::warn!("{cli_owned} wait: {e}"),
    });
    Ok(())
}

/// CLI 자동 설치 — npm 으로 claude-code / codex 를 글로벌 설치.
/// 새 사용자가 터미널 없이 한 클릭으로 셋업할 수 있도록.
#[tauri::command]
pub async fn provider_install_cli(provider: String) -> Result<(), String> {
    match provider.as_str() {
        "claude" => install_claude_cli(),
        "codex" => install_npm_cli("codex", "@openai/codex"),
        "hermes" => install_hermes_cli(),
        _ => Err(format!("automatic install not available for {provider}")),
    }
}

fn spawn_cli_installer(
    mut command: Command,
    label: &'static str,
    after_success: Option<fn()>,
) -> Result<(), String> {
    configure_background_command(&mut command);
    std::thread::spawn(move || {
        match command
            .env("PATH", crate::augmented_cli_path())
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

/// agent.rs 가 spawn 직전에 호출. provider 별 keychain API 키를 반환.
/// 실제 키 노출이 필요한 유일한 경로. 호출처는 env 주입 후 즉시 폐기.
pub fn read_api_key(provider: &str) -> Option<String> {
    let meta = provider_meta(provider)?;
    if !meta.supports_api {
        return None;
    }
    let entry = keychain_entry(provider, "api_key").ok()?;
    let v = entry.get_password().ok()?;
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

/// provider id → 환경변수명. agent.rs spawn 시 사용.
pub fn env_var_for(provider: &str) -> Option<&'static str> {
    provider_meta(provider).and_then(|m| m.env_var)
}
