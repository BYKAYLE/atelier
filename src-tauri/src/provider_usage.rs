use serde::Serialize;
use serde_json::Value;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::subscription_usage::{
    fetch_claude_subscription_usage, fetch_codex_subscription_usage, ProviderSubscriptionUsage,
};

const PROVIDERS: [(&str, &str, Option<&str>); 5] = [
    ("claude", "Claude", Some("claude")),
    ("codex", "Codex", Some("codex")),
    ("openrouter", "OpenRouter", None),
    ("hermes", "Hermes", Some("hermes")),
    ("gajecode", "Gajae Code", Some("gjc")),
];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageEntry {
    pub provider: String,
    pub display_name: String,
    pub installed: bool,
    pub connected: bool,
    pub version: Option<String>,
    pub account_label: Option<String>,
    pub quota_used: Option<f64>,
    pub quota_limit: Option<f64>,
    pub quota_remaining: Option<f64>,
    pub reset_at: Option<String>,
    pub subscription_usage: Option<ProviderSubscriptionUsage>,
    pub source: String,
    pub note: String,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageSnapshot {
    pub captured_at_unix_ms: u64,
    pub entries: Vec<ProviderUsageEntry>,
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("system clock: {error}"))
}

#[cfg(target_os = "windows")]
fn configure_background(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_background(_: &mut Command) {}

fn cli_version(program: &str) -> Option<String> {
    let mut command = Command::new(program);
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_background(&mut command);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    normalize_version(&String::from_utf8_lossy(&output.stdout))
}

fn normalize_version(value: &str) -> Option<String> {
    let value = value
        .lines()
        .find(|line| !line.trim().is_empty())?
        .trim()
        .chars()
        .filter(|character| !character.is_control())
        .take(120)
        .collect::<String>();
    (!value.is_empty()).then_some(value)
}

fn value_number(value: &Value, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|field| {
            field
                .as_f64()
                .or_else(|| field.as_str()?.parse::<f64>().ok())
        })
    })
}

fn value_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(ToOwned::to_owned)
}

fn parse_openrouter_usage(value: &Value) -> Result<ProviderUsageEntry, String> {
    let data = value.get("data").unwrap_or(value);
    if !data.is_object() {
        return Err("OpenRouter usage response did not contain a data object.".to_string());
    }
    let used = value_number(data, &["usage", "usage_monthly"]);
    let limit = value_number(data, &["limit"]);
    let remaining = value_number(data, &["limit_remaining"])
        .or_else(|| limit.zip(used).map(|(limit, used)| (limit - used).max(0.0)));
    Ok(ProviderUsageEntry {
        provider: "openrouter".to_string(),
        display_name: "OpenRouter".to_string(),
        installed: true,
        connected: true,
        version: None,
        account_label: value_string(data, &["label"]),
        quota_used: used,
        quota_limit: limit,
        quota_remaining: remaining,
        reset_at: value_string(data, &["reset_at", "limit_reset"]),
        subscription_usage: None,
        source: "OpenRouter GET /api/v1/key".to_string(),
        note: "Usage is read from OpenRouter's documented key endpoint on explicit refresh."
            .to_string(),
        error: None,
    })
}

fn fetch_openrouter_usage(api_key: &str) -> Result<ProviderUsageEntry, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| format!("build OpenRouter usage client: {error}"))?;
    let response = client
        .get("https://openrouter.ai/api/v1/key")
        .bearer_auth(api_key)
        .header("User-Agent", "Atelier/0.2.9")
        .send()
        .map_err(|error| format!("read OpenRouter usage: {error}"))?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .map_err(|error| format!("parse OpenRouter usage: {error}"))?;
    if !status.is_success() {
        return Err(format!("OpenRouter usage endpoint returned HTTP {status}."));
    }
    parse_openrouter_usage(&value)
}

#[tauri::command]
pub async fn provider_usage_snapshot() -> Result<ProviderUsageSnapshot, String> {
    let mut entries = Vec::with_capacity(PROVIDERS.len());
    for (provider, display_name, cli) in PROVIDERS {
        let status = crate::credentials::provider_status(provider.to_string()).await?;
        let version = cli.and_then(cli_version);
        if provider == "openrouter" && status.api_key_present {
            let key = crate::credentials::read_api_key("openrouter");
            let entry = match key {
                Some(key) => tokio::task::spawn_blocking(move || fetch_openrouter_usage(&key))
                    .await
                    .map_err(|error| format!("OpenRouter usage worker: {error}"))?
                    .unwrap_or_else(|error| ProviderUsageEntry {
                        provider: provider.to_string(),
                        display_name: display_name.to_string(),
                        installed: true,
                        connected: true,
                        version: None,
                        account_label: None,
                        quota_used: None,
                        quota_limit: None,
                        quota_remaining: None,
                        reset_at: None,
                        subscription_usage: None,
                        source: "OpenRouter GET /api/v1/key".to_string(),
                        note: "Usage could not be refreshed; the stored key value was not exposed."
                            .to_string(),
                        error: Some(error),
                    }),
                None => ProviderUsageEntry {
                    provider: provider.to_string(),
                    display_name: display_name.to_string(),
                    installed: true,
                    connected: false,
                    version: None,
                    account_label: None,
                    quota_used: None,
                    quota_limit: None,
                    quota_remaining: None,
                    reset_at: None,
                    subscription_usage: None,
                    source: "Atelier secure credential state".to_string(),
                    note: "No OpenRouter key is available for the documented usage endpoint."
                        .to_string(),
                    error: None,
                },
            };
            entries.push(entry);
            continue;
        }

        let connected = status.oauth_logged_in || status.api_key_present;
        let (subscription_usage, subscription_error) = match provider {
            "codex" if status.cli_installed && connected => {
                match tokio::task::spawn_blocking(fetch_codex_subscription_usage).await {
                    Ok(Ok(usage)) => (Some(usage), None),
                    Ok(Err(error)) => (None, Some(error)),
                    Err(error) => (
                        None,
                        Some(format!("Codex subscription usage worker failed: {error}")),
                    ),
                }
            }
            "claude" if status.cli_installed && connected => {
                match tokio::task::spawn_blocking(fetch_claude_subscription_usage).await {
                    Ok(Ok(usage)) => (Some(usage), None),
                    Ok(Err(error)) => (None, Some(error)),
                    Err(error) => (
                        None,
                        Some(format!("Claude subscription usage worker failed: {error}")),
                    ),
                }
            }
            _ => (None, None),
        };
        let note = match provider {
            "claude" => "Claude subscription limits are read from Claude Code's official /usage view in a hidden PTY. OAuth secrets are never read.",
            "codex" => "Codex subscription limits are read from the official CLI app-server account/rateLimits/read method.",
            "hermes" => "Hermes usage belongs to its selected backend; inspect the Codex or OpenRouter entry.",
            "gajecode" => "Gajae Code usage belongs to its configured model provider and remains isolated from Atelier credentials.",
            "openrouter" => "Connect an OpenRouter API key to read documented usage and remaining credit.",
            _ => "No documented usage surface is available.",
        };
        entries.push(ProviderUsageEntry {
            provider: provider.to_string(),
            display_name: display_name.to_string(),
            installed: status.cli_installed || provider == "openrouter",
            connected,
            version,
            account_label: None,
            quota_used: None,
            quota_limit: None,
            quota_remaining: None,
            reset_at: None,
            subscription_usage,
            source: "Official CLI usage and Atelier connection status".to_string(),
            note: note.to_string(),
            error: subscription_error,
        });
    }
    Ok(ProviderUsageSnapshot {
        captured_at_unix_ms: now_ms()?,
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_documented_openrouter_usage_shape() {
        let entry = parse_openrouter_usage(&serde_json::json!({
            "data": {
                "label": "atelier-test",
                "usage": 12.5,
                "limit": 100.0,
                "limit_remaining": 87.5
            }
        }))
        .unwrap();
        assert_eq!(entry.account_label.as_deref(), Some("atelier-test"));
        assert_eq!(entry.quota_used, Some(12.5));
        assert_eq!(entry.quota_remaining, Some(87.5));
    }

    #[test]
    fn normalizes_only_first_printable_version_line() {
        assert_eq!(
            normalize_version("\nclaude 1.2.3\nsecret second line"),
            Some("claude 1.2.3".to_string())
        );
    }
}
