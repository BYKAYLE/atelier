// 사용자 구독·API 자격증명 관리.
// macOS: Keychain / Windows: Credential Manager (keyring crate가 OS 네이티브 보안 저장소 사용).
// 평문 디스크 저장 금지. profiles JSON에는 boolean 플래그만.

use keyring::Entry;
use serde::Serialize;
use std::process::{Command, Stdio};

const SERVICE: &str = "com.atelier.app";

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

fn which(cli: &str) -> bool {
    // 빠른 PATH 검사. Windows 는 where, Unix 는 command -v.
    #[cfg(target_os = "windows")]
    let res = Command::new("where").arg(cli).output();
    #[cfg(not(target_os = "windows"))]
    let res = Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {cli}"))
        .output();
    matches!(res, Ok(o) if o.status.success())
}

fn detect_oauth(provider: &str) -> bool {
    // OAuth 상태는 CLI 별로 다르다. 안전하게 short timeout 으로 호출.
    // claude/codex 둘 다 `<cli> --version` 은 항상 0. 로그인 상태는 별도 명령 필요.
    // 보수적으로 keychain에 OAuth marker 두면 true. 실제 로그인 검증은 사용 시점에 CLI가 자체 처리.
    match keychain_entry(provider, "oauth_marker") {
        Ok(e) => matches!(e.get_password(), Ok(v) if !v.is_empty()),
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn provider_status(provider: String) -> Result<ProviderStatus, String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    let cli_installed = meta.cli.map(which).unwrap_or(false);
    let oauth_logged_in = meta.supports_oauth && detect_oauth(&provider);

    let (api_key_present, api_key_masked) = if meta.supports_api {
        match keychain_entry(&provider, "api_key").and_then(|e| {
            e.get_password().map_err(|e| format!("get_password: {e}"))
        }) {
            Ok(value) if !value.is_empty() => (true, mask_key(&value)),
            _ => (false, String::new()),
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
    Ok(())
}

#[tauri::command]
pub async fn provider_clear_credentials(provider: String) -> Result<(), String> {
    let _ = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    for slot in ["api_key", "oauth_marker"] {
        if let Ok(entry) = keychain_entry(&provider, slot) {
            let _ = entry.delete_credential();
        }
    }
    Ok(())
}

/// CLI subprocess 로 OAuth 로그인 시작. claude/codex 만 지원.
/// CLI 가 사용자 기본 브라우저를 열어 SNS(Google/Apple/GitHub 등) 로그인 페이지로 보낸다.
/// blocking 으로 기다리지 않고 즉시 반환 — 프론트가 status polling 으로 완료 감지.
#[tauri::command]
pub async fn provider_login_oauth(provider: String) -> Result<(), String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    if !meta.supports_oauth {
        return Err(format!("{provider} does not support OAuth"));
    }
    let cli = meta.cli.ok_or("cli not configured")?;
    let cmd = meta.login_cmd.ok_or("login_cmd not configured")?;
    if !which(cli) {
        return Err(format!("CLI '{cli}' is not installed"));
    }

    // 비동기 background spawn — child를 detach 하고 종료 감지 thread 로만 keychain 마커 기록.
    // UI 는 즉시 모달을 띄우고 polling 으로 status 재확인.
    let provider_clone = provider.clone();
    let cli_owned = cli.to_string();
    let cmd_owned = cmd.to_string();
    std::thread::spawn(move || {
        let mut child = match Command::new(&cli_owned)
            .arg(&cmd_owned)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .stdin(Stdio::null())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                log::warn!("oauth spawn {cli_owned} {cmd_owned}: {e}");
                return;
            }
        };
        match child.wait() {
            Ok(status) if status.success() => {
                if let Ok(entry) = keychain_entry(&provider_clone, "oauth_marker") {
                    let _ = entry.set_password("ok");
                }
            }
            Ok(status) => {
                log::warn!("{cli_owned} {cmd_owned} exited with {status}");
            }
            Err(e) => log::warn!("{cli_owned} wait: {e}"),
        }
    });
    Ok(())
}

/// CLI 자동 설치 — npm 으로 claude-code / codex 를 글로벌 설치.
/// 새 사용자가 터미널 없이 한 클릭으로 셋업할 수 있도록.
#[tauri::command]
pub async fn provider_install_cli(provider: String) -> Result<(), String> {
    let pkg = match provider.as_str() {
        "claude" => "@anthropic-ai/claude-code",
        "codex" => "@openai/codex",
        _ => return Err(format!("automatic install not available for {provider}")),
    };
    if !which("npm") {
        return Err("npm not found. install Node.js first.".into());
    }
    let provider_clone = provider.clone();
    let pkg_owned = pkg.to_string();
    std::thread::spawn(move || {
        match Command::new("npm")
            .arg("install")
            .arg("-g")
            .arg(&pkg_owned)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .stdin(Stdio::null())
            .spawn()
        {
            Ok(mut child) => match child.wait() {
                Ok(status) if status.success() => {
                    log::info!("installed {pkg_owned} for {provider_clone}");
                }
                Ok(status) => log::warn!("npm install {pkg_owned} exited with {status}"),
                Err(e) => log::warn!("npm install wait: {e}"),
            },
            Err(e) => log::warn!("npm install spawn: {e}"),
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
