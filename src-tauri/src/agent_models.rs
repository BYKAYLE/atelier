use std::collections::BTreeSet;
use std::path::PathBuf;
use std::process::Stdio;

use serde::Serialize;
use serde_json::Value;

use crate::agent_process::command_for_cli;

#[derive(Clone, Serialize)]
pub struct AgentModelOption {
    value: String,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    disabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    supported_reasoning_levels: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_reasoning_level: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    requires_multi_agent_v2: Option<bool>,
}

#[derive(Clone, Serialize)]
pub struct ClaudeModelOptionsResult {
    source: String,
    updated_at: Option<String>,
    models: Vec<AgentModelOption>,
}

#[derive(Clone, Serialize)]
pub struct CodexModelOptionsResult {
    source: String,
    updated_at: Option<String>,
    models: Vec<AgentModelOption>,
}

#[derive(Clone, Serialize)]
pub struct OpenRouterModelOptionsResult {
    source: String,
    updated_at: Option<String>,
    models: Vec<AgentModelOption>,
}

fn home_path(parts: &[&str]) -> Option<PathBuf> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()?;
    if home.trim().is_empty() {
        return None;
    }
    let mut path = PathBuf::from(home);
    for part in parts {
        path.push(part);
    }
    Some(path)
}

fn json_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn label_from_model_slug(slug: &str) -> String {
    let mut parts = Vec::new();
    for part in slug.split('-') {
        if part.eq_ignore_ascii_case("gpt") {
            parts.push("GPT".to_string());
        } else if part.chars().all(|ch| ch.is_ascii_digit() || ch == '.') {
            parts.push(part.to_string());
        } else {
            let mut chars = part.chars();
            if let Some(first) = chars.next() {
                parts.push(format!(
                    "{}{}",
                    first.to_uppercase().collect::<String>(),
                    chars.as_str()
                ));
            }
        }
    }
    parts.join("-").replace("-Mini", " Mini")
}

pub(crate) fn read_codex_config_model() -> Option<String> {
    let path = home_path(&[".codex", "config.toml"])?;
    let raw = std::fs::read_to_string(path).ok()?;
    for line in raw.lines() {
        let line = line.trim();
        if !line.starts_with("model") || line.starts_with("model_") {
            continue;
        }
        let (_, value) = line.split_once('=')?;
        let value = value.trim().trim_matches('"').trim_matches('\'').trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

fn codex_reasoning_levels(item: &Value) -> Vec<String> {
    item.get("supported_reasoning_levels")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            entry
                .as_str()
                .map(str::to_string)
                .or_else(|| json_string(entry, "effort"))
        })
        .map(|effort| effort.trim().to_ascii_lowercase())
        .filter(|effort| {
            matches!(
                effort.as_str(),
                "low" | "medium" | "high" | "xhigh" | "max" | "ultra"
            )
        })
        .collect()
}

fn read_codex_model_metadata(model: &str) -> Option<(Vec<String>, Option<String>)> {
    let path = home_path(&[".codex", "models_cache.json"])?;
    let raw = std::fs::read_to_string(path).ok()?;
    let value = serde_json::from_str::<Value>(&raw).ok()?;
    let item = value
        .get("models")
        .and_then(Value::as_array)?
        .iter()
        .find(|item| {
            json_string(item, "slug")
                .or_else(|| json_string(item, "id"))
                .or_else(|| json_string(item, "name"))
                .is_some_and(|value| value == model)
        })?;
    Some((
        codex_reasoning_levels(item),
        json_string(item, "default_reasoning_level"),
    ))
}

pub(crate) fn codex_model_requires_multi_agent_v2(model: &str) -> bool {
    read_codex_model_metadata(model)
        .is_some_and(|(levels, _)| codex_levels_require_multi_agent_v2(&levels))
}

fn codex_levels_require_multi_agent_v2(levels: &[String]) -> bool {
    levels.iter().any(|level| level == "ultra")
}

fn normalize_codex_reasoning_effort_for_metadata(
    requested: String,
    supported: &[String],
    default: Option<String>,
) -> Option<String> {
    if supported.iter().any(|level| level == &requested) {
        return Some(requested);
    }
    if matches!(requested.as_str(), "max" | "ultra")
        && supported.iter().any(|level| level == "xhigh")
    {
        return Some("xhigh".to_string());
    }
    default
        .filter(|value| supported.iter().any(|level| level == value))
        .or_else(|| supported.first().cloned())
}

pub(crate) fn normalize_codex_reasoning_effort(
    model: &str,
    effort: Option<String>,
) -> Option<String> {
    let requested = effort
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| {
            matches!(
                value.as_str(),
                "low" | "medium" | "high" | "xhigh" | "max" | "ultra"
            )
        })?;
    let Some((supported, default)) = read_codex_model_metadata(model) else {
        return Some(if matches!(requested.as_str(), "max" | "ultra") {
            "xhigh".to_string()
        } else {
            requested
        });
    };
    normalize_codex_reasoning_effort_for_metadata(requested, &supported, default)
}

fn read_codex_model_options_sync() -> CodexModelOptionsResult {
    if let Some(path) = home_path(&[".codex", "models_cache.json"]) {
        if let Ok(raw) = std::fs::read_to_string(path) {
            if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                let updated_at = json_string(&value, "fetched_at")
                    .or_else(|| json_string(&value, "updated_at"))
                    .or_else(|| json_string(&value, "last_updated_at"));
                let mut models = Vec::new();
                let mut seen = BTreeSet::new();
                if let Some(items) = value.get("models").and_then(Value::as_array) {
                    for item in items {
                        let Some(slug) = json_string(item, "slug")
                            .or_else(|| json_string(item, "id"))
                            .or_else(|| json_string(item, "name"))
                        else {
                            continue;
                        };
                        if !slug.starts_with("gpt-") {
                            continue;
                        }
                        if item.get("available").and_then(Value::as_bool) == Some(false)
                            || item.get("enabled").and_then(Value::as_bool) == Some(false)
                        {
                            continue;
                        }
                        if !seen.insert(slug.clone()) {
                            continue;
                        }
                        let label = json_string(item, "display_name")
                            .or_else(|| json_string(item, "label"))
                            .unwrap_or_else(|| label_from_model_slug(&slug));
                        let supported_reasoning_levels = codex_reasoning_levels(item);
                        let requires_multi_agent_v2 =
                            codex_levels_require_multi_agent_v2(&supported_reasoning_levels);
                        models.push(AgentModelOption {
                            value: slug,
                            label,
                            disabled: None,
                            supported_reasoning_levels: if supported_reasoning_levels.is_empty() {
                                None
                            } else {
                                Some(supported_reasoning_levels)
                            },
                            default_reasoning_level: json_string(item, "default_reasoning_level"),
                            requires_multi_agent_v2: requires_multi_agent_v2.then_some(true),
                        });
                    }
                }
                if !models.is_empty() {
                    return CodexModelOptionsResult {
                        source: "codex_models_cache".to_string(),
                        updated_at,
                        models,
                    };
                }
            }
        }
    }

    let fallback = read_codex_config_model().unwrap_or_else(|| "gpt-5.5".to_string());
    CodexModelOptionsResult {
        source: "codex_config_fallback".to_string(),
        updated_at: None,
        models: vec![AgentModelOption {
            label: label_from_model_slug(&fallback),
            value: fallback,
            disabled: None,
            supported_reasoning_levels: None,
            default_reasoning_level: None,
            requires_multi_agent_v2: None,
        }],
    }
}

const CLAUDE_MODELS_DOCS_URL: &str =
    "https://docs.anthropic.com/en/docs/about-claude/models/overview";
const CLAUDE_FALLBACK_MODELS: &[(&str, &str, bool)] = &[
    ("claude-opus-4-8", "Opus 4.8", false),
    ("claude-fable-5", "Fable 5", false),
    ("claude-sonnet-4-6", "Sonnet 4.6", false),
    ("claude-haiku-4-5-20251001", "Haiku 4.5", false),
];

fn claude_fallback_model_options(source: &str) -> ClaudeModelOptionsResult {
    ClaudeModelOptionsResult {
        source: source.to_string(),
        updated_at: None,
        models: CLAUDE_FALLBACK_MODELS
            .iter()
            .map(|(value, label, disabled)| AgentModelOption {
                value: (*value).to_string(),
                label: (*label).to_string(),
                disabled: (*disabled).then_some(true),
                supported_reasoning_levels: None,
                default_reasoning_level: None,
                requires_multi_agent_v2: None,
            })
            .collect(),
    }
}

fn claude_fallback_model_for_family(family: &str) -> Option<(&'static str, &'static str, bool)> {
    CLAUDE_FALLBACK_MODELS
        .iter()
        .find(|(value, _, _)| claude_model_family(value) == Some(family))
        .copied()
}

fn fetch_claude_models_docs_html() -> Result<String, String> {
    let mut cmd = command_for_cli("curl");
    cmd.arg("-fsSL")
        .arg("--max-time")
        .arg("20")
        .arg(CLAUDE_MODELS_DOCS_URL)
        .env("PATH", crate::augmented_cli_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let output = cmd
        .output()
        .map_err(|e| format!("claude models docs fetch: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "claude models docs fetch exited with {}: {}",
            output.status,
            stderr.trim()
        ));
    }
    String::from_utf8(output.stdout).map_err(|e| format!("claude models docs utf8: {e}"))
}

fn extract_claude_model_ids(raw: &str) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    let mut offset = 0usize;
    while let Some(relative) = raw[offset..].find("claude-") {
        let start = offset + relative;
        let mut end = start;
        for ch in raw[start..].chars() {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                end += ch.len_utf8();
            } else {
                break;
            }
        }
        let candidate = &raw[start..end];
        if candidate.starts_with("claude-fable-")
            || candidate.starts_with("claude-opus-")
            || candidate.starts_with("claude-sonnet-")
            || candidate.starts_with("claude-haiku-")
        {
            let normalized = normalize_claude_model_id(candidate);
            if is_valid_claude_model_id(&normalized) {
                ids.insert(normalized);
            }
        }
        offset = end.max(start + "claude-".len());
    }
    ids
}

fn normalize_claude_model_id(id: &str) -> String {
    for family in ["fable", "opus", "sonnet", "haiku"] {
        let prefix = format!("claude-{family}-");
        let Some(rest) = id.strip_prefix(&prefix) else {
            continue;
        };
        if rest.len() == 2 && rest.chars().all(|ch| ch.is_ascii_digit()) {
            let mut chars = rest.chars();
            let major = chars.next().unwrap_or('4');
            let minor = chars.next().unwrap_or('0');
            return format!("{prefix}{major}-{minor}");
        }
    }
    id.to_string()
}

fn is_valid_claude_model_id(id: &str) -> bool {
    let Some(family) = claude_model_family(id) else {
        return false;
    };
    let rest = id
        .trim_start_matches("claude-")
        .trim_start_matches(family)
        .trim_start_matches('-');
    let parts = rest.split('-').collect::<Vec<_>>();
    !parts.is_empty()
        && parts.len() <= 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|ch| ch.is_ascii_digit()))
}

fn claude_model_family(id: &str) -> Option<&'static str> {
    if id.starts_with("claude-fable-") {
        Some("fable")
    } else if id.starts_with("claude-opus-") {
        Some("opus")
    } else if id.starts_with("claude-sonnet-") {
        Some("sonnet")
    } else if id.starts_with("claude-haiku-") {
        Some("haiku")
    } else {
        None
    }
}

fn claude_model_version_key(id: &str) -> Vec<u32> {
    let Some(family) = claude_model_family(id) else {
        return Vec::new();
    };
    id.trim_start_matches("claude-")
        .trim_start_matches(family)
        .trim_start_matches('-')
        .split('-')
        .enumerate()
        .map(|(index, part)| {
            if index == 1 && part.len() == 8 {
                "0"
            } else {
                part
            }
        })
        .filter_map(|part| part.parse::<u32>().ok())
        .collect()
}

fn latest_claude_model_for_family(ids: &BTreeSet<String>, family: &str) -> Option<String> {
    ids.iter()
        .filter(|id| claude_model_family(id) == Some(family))
        .max_by(|left, right| claude_model_version_key(left).cmp(&claude_model_version_key(right)))
        .cloned()
}

fn claude_label_from_model_id(id: &str, disabled: bool) -> String {
    let family = claude_model_family(id).unwrap_or("model");
    let name = match family {
        "fable" => "Fable",
        "opus" => "Opus",
        "sonnet" => "Sonnet",
        "haiku" => "Haiku",
        _ => "Claude",
    };
    let version = claude_model_version_key(id)
        .into_iter()
        .take(2)
        .map(|part| part.to_string())
        .collect::<Vec<_>>()
        .join(".");
    let label = if version.is_empty() {
        name.to_string()
    } else {
        format!("{name} {version}")
    };
    if disabled {
        format!("{label} Currently unavailable")
    } else {
        label
    }
}

fn read_claude_model_options_sync() -> ClaudeModelOptionsResult {
    let Ok(raw) = fetch_claude_models_docs_html() else {
        return claude_fallback_model_options("claude_docs_fallback");
    };
    let ids = extract_claude_model_ids(&raw);
    let mut models = Vec::new();
    let mut seen = BTreeSet::new();
    for family in ["opus", "fable", "sonnet", "haiku"] {
        let (id, fallback_label, fallback_disabled) = if let Some(id) =
            latest_claude_model_for_family(&ids, family)
        {
            (id, None, None)
        } else if let Some((value, label, disabled)) = claude_fallback_model_for_family(family) {
            (value.to_string(), Some(label), Some(disabled))
        } else {
            continue;
        };
        if !seen.insert(id.clone()) {
            continue;
        }
        let disabled = fallback_disabled.unwrap_or(false);
        models.push(AgentModelOption {
            label: fallback_label
                .map(str::to_string)
                .unwrap_or_else(|| claude_label_from_model_id(&id, disabled)),
            value: id,
            disabled: disabled.then_some(true),
            supported_reasoning_levels: None,
            default_reasoning_level: None,
            requires_multi_agent_v2: None,
        });
    }
    if models.is_empty() {
        return claude_fallback_model_options("claude_docs_empty_fallback");
    }
    ClaudeModelOptionsResult {
        source: "claude_docs".to_string(),
        updated_at: Some(chrono::Utc::now().to_rfc3339()),
        models,
    }
}

fn openrouter_models_cache_path() -> Option<PathBuf> {
    home_path(&[".atelier", "openrouter_models_cache.json"])
}

fn write_openrouter_models_cache(raw: &str) {
    let Some(path) = openrouter_models_cache_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    let _ = std::fs::write(path, raw);
}

fn read_openrouter_models_cache() -> Option<String> {
    std::fs::read_to_string(openrouter_models_cache_path()?).ok()
}

fn openrouter_reasoning_metadata(item: &Value) -> (Option<Vec<String>>, Option<String>) {
    let Some(reasoning) = item.get("reasoning").filter(|value| value.is_object()) else {
        // OpenRouter can advertise the generic `reasoning` request parameter for
        // routers that do not expose a selectable effort. The model-level
        // `reasoning` object is the authoritative UI capability surface.
        return (Some(Vec::new()), None);
    };

    let mandatory = reasoning
        .get("mandatory")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let default_enabled = reasoning
        .get("default_enabled")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let supports_max_tokens = reasoning
        .get("supports_max_tokens")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let all_efforts = || {
        ["minimal", "low", "medium", "high", "xhigh", "max"]
            .into_iter()
            .map(str::to_string)
            .collect::<Vec<_>>()
    };
    let mut levels = match reasoning.get("supported_efforts") {
        Some(Value::Array(entries)) => entries
            .iter()
            .filter_map(Value::as_str)
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| {
                matches!(
                    value.as_str(),
                    "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
                )
            })
            .collect::<Vec<_>>(),
        Some(Value::Null) => all_efforts(),
        _ if supports_max_tokens => all_efforts(),
        _ => Vec::new(),
    };
    if !levels.is_empty() && !mandatory && !levels.iter().any(|level| level == "none") {
        levels.insert(0, "none".to_string());
    }
    if levels.is_empty() {
        return (Some(Vec::new()), None);
    }

    let requested_default = reasoning
        .get("default_effort")
        .and_then(Value::as_str)
        .or_else(|| {
            item.get("default_parameters").and_then(|parameters| {
                parameters
                    .get("reasoning")
                    .and_then(|reasoning| reasoning.get("effort"))
                    .and_then(Value::as_str)
                    .or_else(|| parameters.get("reasoning_effort").and_then(Value::as_str))
            })
        })
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| levels.iter().any(|level| level == value));
    let default_level = requested_default.or_else(|| {
        if !default_enabled && levels.iter().any(|level| level == "none") {
            return Some("none".to_string());
        }
        if levels.iter().any(|level| level == "medium") {
            return Some("medium".to_string());
        }
        levels
            .iter()
            .find(|level| level.as_str() != "none")
            .cloned()
            .or_else(|| levels.first().cloned())
    });

    (Some(levels), default_level)
}

/// OpenRouter `expiration_date` (RFC3339 또는 `YYYY-MM-DD`) 가 현재 시각보다
/// 과거인 모델만 만료로 판정한다. 값이 없거나 파싱 불가능하면 만료 아님
/// (목록 노출은 fail-open — 실제 실행 실패는 provider 가 알려준다).
fn openrouter_model_expired(item: &Value) -> bool {
    let Some(raw) = item.get("expiration_date").and_then(Value::as_str) else {
        return false;
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return false;
    }
    let now = chrono::Utc::now();
    if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(trimmed) {
        return parsed.with_timezone(&chrono::Utc) < now;
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
        return date < now.date_naive();
    }
    false
}

fn parse_openrouter_model_options(raw: &str, source: &str) -> Option<OpenRouterModelOptionsResult> {
    let value = serde_json::from_str::<Value>(raw).ok()?;
    let updated_at = json_string(&value, "fetched_at");
    let items = value.get("data").and_then(Value::as_array)?;
    let mut models = Vec::new();
    let mut seen = BTreeSet::new();
    for item in items {
        let Some(id) = json_string(item, "id") else {
            continue;
        };
        let output_is_text = item
            .get("architecture")
            .and_then(|architecture| architecture.get("output_modalities"))
            .and_then(Value::as_array)
            .map(|modalities| {
                modalities
                    .iter()
                    .filter_map(Value::as_str)
                    .any(|modality| modality.eq_ignore_ascii_case("text"))
            })
            .unwrap_or(true);
        // expiration_date 는 "예정된 만료일"이다. OpenRouter 는 신규 모델에도
        // 2098-12-31 같은 먼 미래 만료일을 붙이므로, 존재 여부가 아니라
        // "이미 지났는지"로만 제외한다 (260825 실측: 존재-여부 필터가 최신
        // 모델 9종 — glm-5.3, kimi-k2.5 등 — 을 통째로 숨기고 있었다).
        if !output_is_text || openrouter_model_expired(item) {
            continue;
        }
        if !seen.insert(id.clone()) {
            continue;
        }
        let (supported_reasoning_levels, default_reasoning_level) =
            openrouter_reasoning_metadata(item);
        models.push(AgentModelOption {
            label: json_string(item, "name").unwrap_or_else(|| id.clone()),
            value: id,
            disabled: None,
            supported_reasoning_levels,
            default_reasoning_level,
            requires_multi_agent_v2: None,
        });
    }
    if models.is_empty() {
        return None;
    }
    Some(OpenRouterModelOptionsResult {
        source: source.to_string(),
        updated_at,
        models,
    })
}

fn fetch_openrouter_models_json() -> Result<String, String> {
    let mut cmd = command_for_cli("curl");
    cmd.arg("-fsSL")
        .arg("--max-time")
        .arg("20")
        .arg("-H")
        .arg("Accept: application/json")
        .arg("https://openrouter.ai/api/v1/models?output_modalities=text")
        .env("PATH", crate::augmented_cli_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let output = cmd
        .output()
        .map_err(|e| format!("openrouter models fetch: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "openrouter models fetch exited with {}: {}",
            output.status,
            stderr.trim()
        ));
    }
    String::from_utf8(output.stdout).map_err(|e| format!("openrouter models utf8: {e}"))
}

const OPENROUTER_FALLBACK_MODELS: &[(&str, &str)] = &[
    ("openai/gpt-5.5", "OpenAI: GPT-5.5"),
    ("anthropic/claude-opus-4.8", "Anthropic: Claude Opus 4.8"),
    (
        "anthropic/claude-sonnet-4.6",
        "Anthropic: Claude Sonnet 4.6",
    ),
];

fn read_openrouter_model_options_sync() -> OpenRouterModelOptionsResult {
    match fetch_openrouter_models_json() {
        Ok(raw) => {
            let fetched_at = chrono::Utc::now().to_rfc3339();
            let with_timestamp = match serde_json::from_str::<Value>(&raw) {
                Ok(mut value) => {
                    if let Some(object) = value.as_object_mut() {
                        object.insert("fetched_at".to_string(), Value::String(fetched_at));
                    }
                    serde_json::to_string(&value).unwrap_or(raw)
                }
                Err(_) => raw,
            };
            if let Some(result) = parse_openrouter_model_options(&with_timestamp, "openrouter_api")
            {
                write_openrouter_models_cache(&with_timestamp);
                return result;
            }
        }
        Err(err) => log::warn!("{err}"),
    }

    if let Some(raw) = read_openrouter_models_cache() {
        if let Some(result) = parse_openrouter_model_options(&raw, "openrouter_cache") {
            return result;
        }
    }

    OpenRouterModelOptionsResult {
        source: "openrouter_fallback".to_string(),
        updated_at: None,
        models: OPENROUTER_FALLBACK_MODELS
            .iter()
            .map(|(value, label)| AgentModelOption {
                value: (*value).to_string(),
                label: (*label).to_string(),
                disabled: None,
                supported_reasoning_levels: None,
                default_reasoning_level: None,
                requires_multi_agent_v2: None,
            })
            .collect(),
    }
}

#[tauri::command]
pub async fn claude_model_options() -> Result<ClaudeModelOptionsResult, String> {
    tauri::async_runtime::spawn_blocking(read_claude_model_options_sync)
        .await
        .map_err(|e| format!("claude model catalog read: {e}"))
}

#[tauri::command]
pub async fn codex_model_options() -> Result<CodexModelOptionsResult, String> {
    tauri::async_runtime::spawn_blocking(read_codex_model_options_sync)
        .await
        .map_err(|e| format!("codex model cache read: {e}"))
}

#[tauri::command]
pub async fn openrouter_model_options() -> Result<OpenRouterModelOptionsResult, String> {
    tauri::async_runtime::spawn_blocking(read_openrouter_model_options_sync)
        .await
        .map_err(|e| format!("openrouter model catalog read: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_docs_parser_prefers_current_app_model_order() {
        let raw = r#"
            Claude Fable 5 (`claude-fable-5`)
            Claude Fable 5 and Claude Mythos 5 (`claude-fable-5-and-claude-mythos-5`)
            Claude Opus 47 (`claude-opus-47`)
            Claude Opus 4.7 (`claude-opus-4-7`)
            Claude Opus 4 (`claude-opus-4-20250514`)
            Claude Opus 4.8 (`claude-opus-4-8`)
            Claude Sonnet 4.6 (`claude-sonnet-4-6`)
            Claude Haiku 4.5 (`claude-haiku-4-5` / `claude-haiku-4-5-20251001`)
        "#;
        let ids = extract_claude_model_ids(raw);
        assert!(!ids.contains("claude-fable-5-and-claude-mythos-5"));
        let models = ["opus", "fable", "sonnet", "haiku"]
            .into_iter()
            .map(|family| {
                let id = latest_claude_model_for_family(&ids, family).unwrap();
                let label = claude_label_from_model_id(&id, false);
                (id, label)
            })
            .collect::<Vec<_>>();
        assert_eq!(models[0], ("claude-opus-4-8".into(), "Opus 4.8".into()));
        assert_eq!(models[1], ("claude-fable-5".into(), "Fable 5".into()));
        assert_eq!(models[2].1, "Sonnet 4.6");
        assert_eq!(
            models[3],
            ("claude-haiku-4-5-20251001".into(), "Haiku 4.5".into())
        );
    }

    #[test]
    fn claude_docs_parser_rejects_sentence_slugs_and_falls_back_for_missing_fable() {
        let raw = r#"
            Claude Fable 5 and Claude Mythos 5 (`claude-fable-5-and-claude-mythos-5`)
            Claude Opus 4.8 (`claude-opus-4-8`)
            Claude Sonnet 4.6 (`claude-sonnet-4-6`)
            Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
        "#;
        let ids = extract_claude_model_ids(raw);
        assert!(!ids.contains("claude-fable-5-and-claude-mythos-5"));
        assert!(latest_claude_model_for_family(&ids, "fable").is_none());
        assert_eq!(
            claude_fallback_model_for_family("fable"),
            Some(("claude-fable-5", "Fable 5", false))
        );
    }

    #[test]
    fn codex_model_metadata_drives_ultra_runtime_and_effort_fallback() {
        let item = serde_json::json!({
            "supported_reasoning_levels": [
                {"effort": "low"},
                {"effort": "xhigh"},
                {"effort": "ultra"}
            ]
        });
        let levels = codex_reasoning_levels(&item);
        assert_eq!(levels, vec!["low", "xhigh", "ultra"]);
        assert!(codex_levels_require_multi_agent_v2(&levels));
        assert_eq!(
            normalize_codex_reasoning_effort_for_metadata(
                "ultra".to_string(),
                &levels,
                Some("low".to_string()),
            ),
            Some("ultra".to_string())
        );

        let legacy_levels = vec!["low".to_string(), "xhigh".to_string()];
        assert!(!codex_levels_require_multi_agent_v2(&legacy_levels));
        assert_eq!(
            normalize_codex_reasoning_effort_for_metadata(
                "ultra".to_string(),
                &legacy_levels,
                Some("low".to_string()),
            ),
            Some("xhigh".to_string())
        );
    }

    #[test]
    fn openrouter_catalog_exposes_reasoning_controls_per_model() {
        let raw = serde_json::json!({
            "data": [
                {
                    "id": "meituan/longcat-2.0",
                    "name": "Meituan: LongCat 2.0",
                    "architecture": { "output_modalities": ["text"] },
                    "supported_parameters": ["reasoning", "tools"],
                    "default_parameters": {},
                    "reasoning": {
                        "mandatory": false,
                        "default_enabled": true,
                        "supports_max_tokens": true
                    },
                    "expiration_date": null
                },
                {
                    "id": "openai/gpt-4",
                    "name": "OpenAI: GPT-4",
                    "architecture": { "output_modalities": ["text"] },
                    "supported_parameters": ["temperature", "tools"],
                    "default_parameters": {},
                    "expiration_date": null
                }
            ]
        })
        .to_string();

        let result = parse_openrouter_model_options(&raw, "test").unwrap();
        assert_eq!(result.models.len(), 2);
        assert_eq!(
            result.models[0].supported_reasoning_levels,
            Some(vec![
                "none".to_string(),
                "minimal".to_string(),
                "low".to_string(),
                "medium".to_string(),
                "high".to_string(),
                "xhigh".to_string(),
                "max".to_string(),
            ])
        );
        assert_eq!(
            result.models[0].default_reasoning_level.as_deref(),
            Some("medium")
        );
        assert_eq!(
            result.models[1].supported_reasoning_levels,
            Some(Vec::new())
        );
        assert_eq!(result.models[1].default_reasoning_level, None);
    }

    #[test]
    fn openrouter_future_expiration_models_stay_listed_and_expired_ones_drop() {
        // 260825 결함 수리 고정: expiration_date "존재" 필터가 최신 모델
        // (먼 미래 만료일 부착)을 숨겼다. 과거 만료만 제외해야 한다.
        let raw = serde_json::json!({
            "data": [
                {
                    "id": "z-ai/glm-5.3",
                    "name": "Z.AI: GLM 5.3",
                    "architecture": { "output_modalities": ["text"] },
                    "expiration_date": "2098-12-31"
                },
                {
                    "id": "vendor/already-expired",
                    "name": "Vendor: Expired",
                    "architecture": { "output_modalities": ["text"] },
                    "expiration_date": "2020-01-01"
                },
                {
                    "id": "vendor/expired-rfc3339",
                    "name": "Vendor: Expired RFC3339",
                    "architecture": { "output_modalities": ["text"] },
                    "expiration_date": "2020-01-01T00:00:00Z"
                },
                {
                    "id": "vendor/no-expiration",
                    "name": "Vendor: No Expiration",
                    "architecture": { "output_modalities": ["text"] },
                    "expiration_date": null
                },
                {
                    "id": "vendor/unparseable-expiration",
                    "name": "Vendor: Unparseable",
                    "architecture": { "output_modalities": ["text"] },
                    "expiration_date": "someday"
                }
            ]
        })
        .to_string();

        let result = parse_openrouter_model_options(&raw, "test").unwrap();
        let ids: Vec<&str> = result
            .models
            .iter()
            .map(|model| model.value.as_str())
            .collect();
        assert_eq!(
            ids,
            [
                "z-ai/glm-5.3",
                "vendor/no-expiration",
                "vendor/unparseable-expiration"
            ]
        );
    }

    #[test]
    #[ignore = "live measurement against the real ~/.atelier OpenRouter cache; run explicitly with --ignored"]
    fn openrouter_real_cache_includes_future_expiring_latest_models() {
        let Some(raw) = read_openrouter_models_cache() else {
            panic!("no real OpenRouter cache on this machine");
        };
        let result =
            parse_openrouter_model_options(&raw, "live").expect("parse real OpenRouter cache");
        let raw_value: Value = serde_json::from_str(&raw).unwrap();
        let raw_count = raw_value["data"].as_array().unwrap().len();
        // 과거-만료 모델을 제외한 나머지는 전부 노출되어야 한다.
        assert!(
            result.models.len() > raw_count.saturating_sub(20),
            "parsed {} of {} raw models — future-expiring models are being hidden again",
            result.models.len(),
            raw_count
        );
    }

    #[test]
    fn openrouter_mandatory_reasoning_model_cannot_turn_reasoning_off() {
        let item = serde_json::json!({
            "supported_parameters": ["reasoning_effort"],
            "default_parameters": { "reasoning_effort": "high" },
            "reasoning": {
                "mandatory": true,
                "default_enabled": true,
                "supported_efforts": ["high", "low"]
            }
        });
        let (levels, default_level) = openrouter_reasoning_metadata(&item);
        let levels = levels.unwrap();
        assert!(!levels.contains(&"none".to_string()));
        assert_eq!(levels, vec!["high".to_string(), "low".to_string()]);
        assert_eq!(default_level.as_deref(), Some("high"));
    }

    #[test]
    fn openrouter_effort_selector_uses_catalog_levels_and_ignores_router_parameters() {
        let filtered = serde_json::json!({
            "supported_parameters": ["reasoning", "reasoning_effort"],
            "reasoning": {
                "mandatory": false,
                "default_enabled": true,
                "supported_efforts": ["max", "high", "low"],
                "default_effort": "max"
            }
        });
        let (levels, default_level) = openrouter_reasoning_metadata(&filtered);
        assert_eq!(
            levels,
            Some(vec![
                "none".to_string(),
                "max".to_string(),
                "high".to_string(),
                "low".to_string(),
            ])
        );
        assert_eq!(default_level.as_deref(), Some("max"));

        let router = serde_json::json!({
            "supported_parameters": ["reasoning", "reasoning_effort"]
        });
        assert_eq!(
            openrouter_reasoning_metadata(&router),
            (Some(Vec::new()), None)
        );
    }
}
