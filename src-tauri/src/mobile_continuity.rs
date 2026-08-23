use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::sync::{Mutex, OnceLock};
use uuid::Uuid;

const MAX_SESSIONS: usize = 30;
const MAX_MESSAGES_PER_SESSION: usize = 100;
const MAX_TEXT_CHARS: usize = 12_000;
const MAX_FIELD_CHARS: usize = 256;
const MAX_PAYLOAD_BYTES: usize = 1_000_000;
const STALE_AFTER_MS: u64 = 15_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishInput {
    pub(crate) active_session_id: Option<String>,
    pub(crate) sessions: Vec<PublishedSession>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishedSession {
    pub(crate) session_id: String,
    pub(crate) mobile_task_id: String,
    pub(crate) title: String,
    pub(crate) provider: String,
    pub(crate) model: String,
    pub(crate) workspace: String,
    pub(crate) permission_mode: String,
    pub(crate) status: String,
    pub(crate) updated_at_ms: u64,
    pub(crate) messages: Vec<PublishedMessage>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishedMessage {
    pub(crate) message_id: String,
    pub(crate) role: String,
    pub(crate) text: String,
    pub(crate) created_at_ms: u64,
    #[serde(default)]
    pub(crate) status: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishResult {
    pub(crate) published_at_ms: u64,
    pub(crate) sessions: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MobileSessionProjection {
    pub(crate) mobile_task_id: String,
    pub(crate) title: String,
    pub(crate) provider: String,
    pub(crate) model: String,
    pub(crate) workspace: String,
    pub(crate) status: String,
    pub(crate) active: bool,
    pub(crate) updated_at_ms: u64,
    pub(crate) revision: u64,
    pub(crate) messages: Vec<MobileMessageProjection>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MobileMessageProjection {
    pub(crate) message_id: String,
    pub(crate) role: String,
    pub(crate) text: String,
    pub(crate) created_at_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) status: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct FollowupTarget {
    pub(crate) session_id: String,
    pub(crate) mobile_task_id: String,
    pub(crate) revision: u64,
    pub(crate) workspace: String,
    pub(crate) expected_workspace: String,
    pub(crate) provider: String,
    pub(crate) model: String,
    pub(crate) permission_mode: String,
}

#[derive(Clone, Debug)]
struct TrustedSession {
    session_id: String,
    mobile_task_id: String,
    title: String,
    provider: String,
    model: String,
    workspace: String,
    expected_workspace: String,
    workspace_label: String,
    permission_mode: String,
    status: String,
    updated_at_ms: u64,
    messages: Vec<MobileMessageProjection>,
    revision: u64,
}

#[derive(Default)]
struct ContinuityRegistry {
    published_at_ms: u64,
    generation: u64,
    active_session_id: Option<String>,
    sessions: HashMap<String, TrustedSession>,
}

fn registry() -> &'static Mutex<ContinuityRegistry> {
    static REGISTRY: OnceLock<Mutex<ContinuityRegistry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(ContinuityRegistry::default()))
}

fn bounded_text(value: &str, field: &str, maximum: usize) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > maximum || value.chars().any(char::is_control) {
        return Err(format!("Mobile continuity {field} is invalid."));
    }
    Ok(value.to_string())
}

fn validate_provider(provider: &str) -> Result<String, String> {
    let provider = provider.trim().to_ascii_lowercase();
    if matches!(
        provider.as_str(),
        "claude" | "codex" | "hermes" | "gajecode" | "grok"
    ) {
        Ok(provider)
    } else {
        Err("Mobile continuity provider is not allowed.".to_string())
    }
}

fn validate_permission(permission_mode: &str) -> Result<String, String> {
    let permission_mode = permission_mode.trim().to_ascii_lowercase();
    if matches!(permission_mode.as_str(), "basic" | "auto") {
        Ok(permission_mode)
    } else {
        Err("Mobile continuity permission mode is not allowed.".to_string())
    }
}

fn canonical_workspace(workspace: &str) -> Result<(String, String, String), String> {
    let workspace = workspace.trim();
    if workspace.is_empty() || workspace.chars().any(char::is_control) {
        return Err("Mobile continuity workspace is required.".to_string());
    }
    let canonical = fs::canonicalize(workspace)
        .map_err(|error| format!("Resolve mobile continuity workspace: {error}"))?;
    if !canonical.is_dir() {
        return Err("Mobile continuity workspace is not a directory.".to_string());
    }
    let label = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Mobile continuity workspace label is unavailable.".to_string())?
        .to_string();
    Ok((
        canonical.to_string_lossy().into_owned(),
        label,
        workspace.to_string(),
    ))
}

fn validate_uuid(value: &str, field: &str) -> Result<String, String> {
    let value = value.trim();
    Uuid::parse_str(value).map_err(|_| format!("Mobile continuity {field} must be a UUID."))?;
    Ok(value.to_string())
}

fn redact_mobile_token(text: &mut String, prefix: &str, minimum: usize) {
    let mut search_from = 0usize;
    loop {
        let lower = text.to_ascii_lowercase();
        let Some(relative) = lower[search_from..].find(prefix) else {
            break;
        };
        let start = search_from + relative;
        let mut end = start + prefix.len();
        let bytes = text.as_bytes();
        while end < bytes.len()
            && (bytes[end].is_ascii_alphanumeric()
                || matches!(bytes[end], b'_' | b'-' | b'.' | b'/' | b'+' | b'='))
        {
            end += 1;
        }
        if end.saturating_sub(start) >= minimum {
            text.replace_range(start..end, "<redacted>");
            search_from = start + "<redacted>".len();
        } else {
            search_from = end.max(start + prefix.len());
        }
    }
}

fn unix_home_prefix(workspace: &str) -> Option<String> {
    let mut components = std::path::Path::new(workspace).components();
    if !matches!(components.next(), Some(std::path::Component::RootDir)) {
        return None;
    }
    let base = components.next()?.as_os_str().to_str()?;
    if !matches!(base, "Users" | "home") {
        return None;
    }
    let user = components.next()?.as_os_str().to_str()?;
    if user.is_empty() {
        return None;
    }
    Some(format!("/{base}/{user}"))
}

fn windows_home_prefix(workspace: &str) -> Option<String> {
    let lower = workspace.to_ascii_lowercase();
    for marker in [r":\users\", ":/users/"] {
        let marker_start = lower.find(marker)?;
        let user_start = marker_start + marker.len();
        let relative_end = workspace[user_start..]
            .find(['\\', '/'])
            .unwrap_or(workspace.len().saturating_sub(user_start));
        let end = user_start + relative_end;
        if end > user_start {
            return Some(workspace[..end].to_string());
        }
    }
    None
}

fn replace_ascii_case_insensitive(text: &mut String, needle: &str, replacement: &str) {
    if needle.is_empty() {
        return;
    }
    let mut search_from = 0usize;
    loop {
        let lower = text.to_ascii_lowercase();
        let needle_lower = needle.to_ascii_lowercase();
        let Some(relative) = lower[search_from..].find(&needle_lower) else {
            break;
        };
        let start = search_from + relative;
        let end = start + needle.len();
        text.replace_range(start..end, replacement);
        search_from = start + replacement.len();
    }
}

fn redact_windows_absolute_paths(text: &mut String) {
    let mut cursor = 0usize;
    loop {
        let bytes = text.as_bytes();
        let Some(start) = (cursor..bytes.len().saturating_sub(2)).find(|index| {
            bytes[*index].is_ascii_alphabetic()
                && bytes[*index + 1] == b':'
                && matches!(bytes[*index + 2], b'\\' | b'/')
                && (*index == 0
                    || matches!(
                        bytes[*index - 1],
                        b' ' | b'\t' | b'\r' | b'\n' | b'\'' | b'"' | b'(' | b'[' | b'<' | b'='
                    ))
        }) else {
            break;
        };
        let end = (start + 3..bytes.len())
            .find(|index| {
                matches!(
                    bytes[*index],
                    b' ' | b'\t'
                        | b'\r'
                        | b'\n'
                        | b'\''
                        | b'"'
                        | b'<'
                        | b'>'
                        | b')'
                        | b']'
                        | b','
                        | b';'
                )
            })
            .unwrap_or(bytes.len());
        text.replace_range(start..end, "[local path]");
        cursor = start + "[local path]".len();
    }
}

fn redact_file_urls(text: &mut String) {
    let mut cursor = 0usize;
    loop {
        let lower = text.to_ascii_lowercase();
        let Some(relative) = lower[cursor..].find("file://") else {
            break;
        };
        let start = cursor + relative;
        let bytes = text.as_bytes();
        let end = (start + "file://".len()..bytes.len())
            .find(|index| {
                matches!(
                    bytes[*index],
                    b' ' | b'\t'
                        | b'\r'
                        | b'\n'
                        | b'\''
                        | b'"'
                        | b'`'
                        | b'<'
                        | b'>'
                        | b')'
                        | b']'
                        | b','
                        | b';'
                )
            })
            .unwrap_or(bytes.len());
        text.replace_range(start..end, "[local path]");
        cursor = start + "[local path]".len();
    }
}

fn redact_unix_absolute_paths(text: &mut String) {
    let mut cursor = 0usize;
    loop {
        let bytes = text.as_bytes();
        let Some(start) = (cursor..bytes.len()).find(|index| {
            bytes[*index] == b'/'
                && (*index == 0
                    || matches!(
                        bytes[*index - 1],
                        b' ' | b'\t'
                            | b'\r'
                            | b'\n'
                            | b'\''
                            | b'"'
                            | b'`'
                            | b'('
                            | b'['
                            | b'<'
                            | b'='
                    ))
        }) else {
            break;
        };

        if start + 1 >= bytes.len()
            || matches!(
                bytes[start + 1],
                b' ' | b'\t' | b'\r' | b'\n' | b'\'' | b'"' | b'`' | b')' | b']' | b'>'
            )
        {
            cursor = start + 1;
            continue;
        }

        let end = (start + 1..bytes.len())
            .find(|index| {
                matches!(
                    bytes[*index],
                    b' ' | b'\t'
                        | b'\r'
                        | b'\n'
                        | b'\''
                        | b'"'
                        | b'`'
                        | b'<'
                        | b'>'
                        | b')'
                        | b']'
                        | b','
                        | b';'
                )
            })
            .unwrap_or(bytes.len());
        text.replace_range(start..end, "[local path]");
        cursor = start + "[local path]".len();
    }
}

fn redact_mobile_message_text(
    value: &str,
    workspace: &str,
    expected_workspace: &str,
) -> Result<String, String> {
    let mut safe = crate::agent_preview::redact_cli_output(&validate_message_text(value)?);

    // Keep the conversation useful while removing machine-specific path roots.
    // Replace the longest roots first so a HOME prefix cannot leave the
    // workspace suffix looking like an absolute path.
    let mut roots = vec![workspace, expected_workspace];
    roots.sort_by_key(|root| std::cmp::Reverse(root.len()));
    roots.dedup();
    for root in roots {
        if root.len() > 1 {
            replace_ascii_case_insensitive(&mut safe, root, "[workspace]");
        }
    }
    if let Some(home) = unix_home_prefix(workspace) {
        replace_ascii_case_insensitive(&mut safe, &home, "[home]");
    }
    if let Some(home) = windows_home_prefix(workspace) {
        replace_ascii_case_insensitive(&mut safe, &home, "[home]");
    }
    for prefix in ["/private/var/folders/", "/var/folders/", "/tmp/"] {
        while let Some(start) = safe.find(prefix) {
            let end = safe[start..]
                .find(|character: char| {
                    character.is_whitespace()
                        || matches!(character, '\'' | '"' | '<' | '>' | ')' | ']' | ',' | ';')
                })
                .map(|relative| start + relative)
                .unwrap_or(safe.len());
            safe.replace_range(start..end, "[local path]");
        }
    }
    for (prefix, minimum) in [
        ("github_pat_", 20usize),
        ("ghp_", 20),
        ("glpat-", 20),
        ("xoxb-", 20),
        ("xoxp-", 20),
        ("akia", 20),
        ("aiza", 24),
        ("eyj", 32),
    ] {
        redact_mobile_token(&mut safe, prefix, minimum);
    }
    redact_file_urls(&mut safe);
    redact_unix_absolute_paths(&mut safe);
    redact_windows_absolute_paths(&mut safe);
    Ok(safe)
}

fn validate_message(
    message: PublishedMessage,
    workspace: &str,
    expected_workspace: &str,
) -> Result<MobileMessageProjection, String> {
    let role = message.role.trim().to_ascii_lowercase();
    if !matches!(role.as_str(), "user" | "assistant") {
        return Err("Mobile continuity message role is not allowed.".to_string());
    }
    Ok(MobileMessageProjection {
        message_id: bounded_text(&message.message_id, "message id", MAX_FIELD_CHARS)?,
        role,
        text: redact_mobile_message_text(&message.text, workspace, expected_workspace)?,
        created_at_ms: message.created_at_ms,
        status: message
            .status
            .map(|value| bounded_text(&value, "message status", MAX_FIELD_CHARS))
            .transpose()?,
    })
}

fn validate_message_text(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.chars().count() > MAX_TEXT_CHARS
        || value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err("Mobile continuity message text is invalid.".to_string());
    }
    Ok(value.to_string())
}

fn validate_session(input: PublishedSession) -> Result<TrustedSession, String> {
    if input.messages.len() > MAX_MESSAGES_PER_SESSION {
        return Err("Mobile continuity has too many session messages.".to_string());
    }
    let (workspace, workspace_label, expected_workspace) = canonical_workspace(&input.workspace)?;
    let mut messages = Vec::with_capacity(input.messages.len());
    for message in input.messages {
        messages.push(validate_message(message, &workspace, &expected_workspace)?);
    }
    Ok(TrustedSession {
        session_id: bounded_text(&input.session_id, "session id", MAX_FIELD_CHARS)?,
        mobile_task_id: validate_uuid(&input.mobile_task_id, "task id")?,
        title: bounded_text(&input.title, "title", MAX_FIELD_CHARS)?,
        provider: validate_provider(&input.provider)?,
        model: bounded_text(&input.model, "model", MAX_FIELD_CHARS)?,
        workspace,
        expected_workspace,
        workspace_label,
        permission_mode: validate_permission(&input.permission_mode)?,
        status: bounded_text(&input.status, "status", MAX_FIELD_CHARS)?,
        updated_at_ms: input.updated_at_ms,
        messages,
        revision: 0,
    })
}

pub(crate) fn publish(input: PublishInput, now_ms: u64) -> Result<PublishResult, String> {
    if input.sessions.len() > MAX_SESSIONS {
        return Err("Mobile continuity has too many sessions.".to_string());
    }
    let serialized = serde_json::to_vec(&input)
        .map_err(|error| format!("Serialize mobile continuity input: {error}"))?;
    if serialized.len() > MAX_PAYLOAD_BYTES {
        return Err("Mobile continuity payload is too large.".to_string());
    }
    let active_session_id = input
        .active_session_id
        .map(|value| bounded_text(&value, "active session id", MAX_FIELD_CHARS))
        .transpose()?;
    let mut incoming = HashMap::with_capacity(input.sessions.len());
    let mut guard = registry()
        .lock()
        .map_err(|_| "Mobile continuity registry is unavailable.".to_string())?;
    for session in input.sessions {
        let mut session = validate_session(session)?;
        let unchanged_target =
            guard
                .sessions
                .get(&session.mobile_task_id)
                .is_some_and(|previous| {
                    previous.session_id == session.session_id
                        && previous.workspace == session.workspace
                        && previous.expected_workspace == session.expected_workspace
                        && previous.provider == session.provider
                        && previous.model == session.model
                        && previous.permission_mode == session.permission_mode
                });
        if unchanged_target {
            if let Some(previous) = guard.sessions.get(&session.mobile_task_id) {
                session.revision = previous.revision;
            }
        } else {
            guard.generation = guard.generation.saturating_add(1);
            session.revision = guard.generation;
        }
        if incoming
            .insert(session.mobile_task_id.clone(), session)
            .is_some()
        {
            return Err("Mobile continuity task ids must be unique.".to_string());
        }
    }
    if let Some(active_session_id) = active_session_id.as_ref() {
        if !incoming
            .values()
            .any(|session| &session.session_id == active_session_id)
        {
            return Err("Mobile continuity active session is not present.".to_string());
        }
    }
    guard.published_at_ms = now_ms;
    guard.active_session_id = active_session_id;
    guard.sessions = incoming;
    Ok(PublishResult {
        published_at_ms: now_ms,
        sessions: guard.sessions.len(),
    })
}

#[tauri::command]
pub(crate) fn mobile_control_sessions_publish(
    input: PublishInput,
) -> Result<PublishResult, String> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("Mobile continuity clock is before Unix epoch: {error}"))?
        .as_millis()
        .try_into()
        .map_err(|_| "Mobile continuity clock is out of range.".to_string())?;
    publish(input, now_ms)
}

pub(crate) fn sessions_projection() -> Vec<MobileSessionProjection> {
    let Ok(guard) = registry().lock() else {
        return Vec::new();
    };
    let mut sessions = guard
        .sessions
        .values()
        .map(|session| MobileSessionProjection {
            mobile_task_id: session.mobile_task_id.clone(),
            title: session.title.clone(),
            provider: session.provider.clone(),
            model: session.model.clone(),
            workspace: session.workspace_label.clone(),
            status: session.status.clone(),
            active: guard.active_session_id.as_deref() == Some(session.session_id.as_str()),
            updated_at_ms: session.updated_at_ms,
            revision: session.revision,
            messages: session.messages.clone(),
        })
        .collect::<Vec<_>>();
    sessions.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));
    sessions
}

pub(crate) fn resolve_followup(
    mobile_task_id: &str,
    revision: u64,
    now_ms: u64,
) -> Result<FollowupTarget, String> {
    let guard = registry()
        .lock()
        .map_err(|_| "Mobile continuity registry is unavailable.".to_string())?;
    if guard.published_at_ms == 0 || now_ms.saturating_sub(guard.published_at_ms) > STALE_AFTER_MS {
        return Err("Mobile session is unavailable.".to_string());
    }
    let Some(session) = guard.sessions.get(mobile_task_id) else {
        return Err("Mobile session is unavailable.".to_string());
    };
    if session.revision != revision {
        return Err("Mobile session is unavailable.".to_string());
    }
    Ok(FollowupTarget {
        session_id: session.session_id.clone(),
        mobile_task_id: session.mobile_task_id.clone(),
        revision: session.revision,
        workspace: session.workspace.clone(),
        expected_workspace: session.expected_workspace.clone(),
        provider: session.provider.clone(),
        model: session.model.clone(),
        permission_mode: session.permission_mode.clone(),
    })
}

#[cfg(test)]
pub(crate) fn clear_for_tests() {
    if let Ok(mut guard) = registry().lock() {
        *guard = ContinuityRegistry::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::sync::{MutexGuard, OnceLock};

    fn serial_test_guard() -> MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .expect("lock mobile continuity test registry")
    }

    fn fixture(workspace: &Path) -> PublishInput {
        PublishInput {
            active_session_id: Some("internal-session".to_string()),
            sessions: vec![PublishedSession {
                session_id: "internal-session".to_string(),
                mobile_task_id: Uuid::new_v4().to_string(),
                title: "Continue safely".to_string(),
                provider: "codex".to_string(),
                model: "gpt-5".to_string(),
                workspace: workspace.to_string_lossy().into_owned(),
                permission_mode: "basic".to_string(),
                status: "running".to_string(),
                updated_at_ms: 100,
                messages: vec![PublishedMessage {
                    message_id: "m1".to_string(),
                    role: "assistant".to_string(),
                    text: "Visible answer".to_string(),
                    created_at_ms: 100,
                    status: None,
                }],
            }],
        }
    }

    #[test]
    fn projection_redacts_internal_execution_fields() {
        let _serial = serial_test_guard();
        clear_for_tests();
        let mut input = fixture(Path::new("."));
        let workspace = fs::canonicalize(".")
            .expect("canonical workspace")
            .to_string_lossy()
            .into_owned();
        input.sessions[0].messages[0].text = format!(
            "workspace {workspace}/src/main.rs\nAPI_KEY=secret-value\nAWS_SECRET_ACCESS_KEY=aws-secret-value\nPRIVATE_TOKEN=custom-secret-value\nghp_abcdefghijklmnopqrstuvwxyz123456\n/etc/hosts\n/Volumes/Secret/file\n/users/kansic/private.txt\nfile:///opt/company/project/file\nC:\\Users\\Example\\private.txt\ncwd=C:\\Users\\Alice\\repo\npath=C:/Users/Alice/repo\nhttps://example.com/docs"
        );
        publish(input, 1_000).expect("publish fixture");
        let serialized =
            serde_json::to_string(&sessions_projection()).expect("serialize projection");
        assert!(serialized.contains("mobileTaskId"));
        assert!(!serialized.contains("internal-session"));
        assert!(!serialized.contains("permissionMode"));
        assert!(!serialized.contains("workspace/"));
        assert!(!serialized.contains("providerSessionId"));
        assert!(!serialized.contains("reasoning"));
        assert!(!serialized.contains(&workspace));
        assert!(!serialized.contains("secret-value"));
        assert!(!serialized.contains("aws-secret-value"));
        assert!(!serialized.contains("custom-secret-value"));
        assert!(!serialized.contains("ghp_abcdefghijklmnopqrstuvwxyz123456"));
        assert!(!serialized.contains("/etc/hosts"));
        assert!(!serialized.contains("/Volumes/Secret/file"));
        assert!(!serialized.contains("/users/kansic/private.txt"));
        assert!(!serialized.contains("file:///opt/company/project/file"));
        assert!(!serialized.contains("C:\\\\Users"));
        assert!(!serialized.contains("C:/Users"));
        assert!(serialized.contains("https://example.com/docs"));
        assert!(serialized.contains("[workspace]"));
        assert!(serialized.contains("redacted"));
    }

    #[test]
    fn stale_or_revision_mismatch_is_indistinguishable() {
        let _serial = serial_test_guard();
        clear_for_tests();
        let input = fixture(Path::new("."));
        let task_id = input.sessions[0].mobile_task_id.clone();
        publish(input, 1_000).expect("publish fixture");
        assert_eq!(
            resolve_followup(&task_id, 99, 1_001)
                .expect_err("mismatch")
                .as_str(),
            "Mobile session is unavailable."
        );
        assert_eq!(
            resolve_followup(&task_id, 1, 16_001)
                .expect_err("stale")
                .as_str(),
            "Mobile session is unavailable."
        );
    }

    #[test]
    fn heartbeat_preserves_revision_but_target_change_rotates_it() {
        let _serial = serial_test_guard();
        clear_for_tests();
        let input = fixture(Path::new("."));
        let task_id = input.sessions[0].mobile_task_id.clone();
        publish(input, 1_000).expect("publish fixture");
        let initial_revision = sessions_projection()[0].revision;

        let mut heartbeat = fixture(Path::new("."));
        heartbeat.sessions[0].mobile_task_id = task_id.clone();
        heartbeat.sessions[0].messages[0].text = "line one\nline two\tcontinued".to_string();
        publish(heartbeat, 2_000).expect("publish heartbeat");
        assert_eq!(sessions_projection()[0].revision, initial_revision);

        let mut changed = fixture(Path::new("."));
        changed.sessions[0].mobile_task_id = task_id;
        changed.sessions[0].model = "gpt-5.1".to_string();
        publish(changed, 3_000).expect("publish changed target");
        assert_ne!(sessions_projection()[0].revision, initial_revision);
    }

    #[test]
    fn preserves_validated_renderer_workspace_for_exact_session_guard() {
        let _serial = serial_test_guard();
        clear_for_tests();
        let input = fixture(Path::new("."));
        let task_id = input.sessions[0].mobile_task_id.clone();
        publish(input, 1_000).expect("publish fixture");
        let target = resolve_followup(&task_id, 1, 1_001).expect("resolve target");
        assert_eq!(target.expected_workspace, ".");
        assert!(std::path::Path::new(&target.workspace).is_absolute());
    }

    #[test]
    fn rejects_untrusted_provider_permission_and_message_role() {
        let _serial = serial_test_guard();
        clear_for_tests();
        let mut input = fixture(Path::new("."));
        input.sessions[0].provider = "shell".to_string();
        assert!(publish(input, 1).is_err());
        let mut input = fixture(Path::new("."));
        input.sessions[0].permission_mode = "dangerous".to_string();
        assert!(publish(input, 1).is_err());
        let mut input = fixture(Path::new("."));
        input.sessions[0].messages[0].role = "tool".to_string();
        assert!(publish(input, 1).is_err());
    }
}
