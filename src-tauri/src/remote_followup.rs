use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const SCHEMA_VERSION: u32 = 1;
const PROPOSAL_TTL_MS: u64 = 24 * 60 * 60 * 1_000;
const APPROVAL_TTL_MS: u64 = 5 * 60 * 1_000;
const MAX_PROPOSALS: usize = 1_000;
const MAX_PROMPT_CHARS: usize = 4_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteFollowupProposal {
    schema_version: u32,
    proposal_id: String,
    device_id: String,
    device_name: String,
    prompt: String,
    created_at_ms: u64,
    expires_at_ms: u64,
    status: String,
    resolved_at_ms: Option<u64>,
    control_request_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteFollowupStatus {
    proposal_id: String,
    status: String,
    created_at_ms: u64,
    expires_at_ms: u64,
    resolved_at_ms: Option<u64>,
}

impl From<&RemoteFollowupProposal> for RemoteFollowupStatus {
    fn from(value: &RemoteFollowupProposal) -> Self {
        Self {
            proposal_id: value.proposal_id.clone(),
            status: value.status.clone(),
            created_at_ms: value.created_at_ms,
            expires_at_ms: value.expires_at_ms,
            resolved_at_ms: value.resolved_at_ms,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProposalStore {
    schema_version: u32,
    proposals: Vec<RemoteFollowupProposal>,
}

impl Default for ProposalStore {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            proposals: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteFollowupApprovalInput {
    proposal_id: String,
    workspace: String,
    provider: String,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    effort: Option<String>,
    #[serde(default)]
    permission_mode: Option<String>,
    #[serde(default)]
    stella_mode: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteFollowupPreparedAction {
    schema_version: u32,
    action_id: String,
    action_hash: String,
    proposal_id: String,
    preview: String,
    expires_at_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteFollowupReceipt {
    schema_version: u32,
    receipt_id: String,
    action_id: String,
    action_hash: String,
    proposal_id: String,
    control_request_id: String,
    status: String,
    summary: String,
    created_at_ms: u64,
    completed_at_ms: u64,
}

#[derive(Clone, Debug)]
struct PreparedActionRecord {
    prepared: RemoteFollowupPreparedAction,
    input: RemoteFollowupApprovalInput,
    prompt: String,
    device_id: String,
    created_at_ms: u64,
}

fn store_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn prepared_actions() -> &'static Mutex<HashMap<String, PreparedActionRecord>> {
    static ACTIONS: OnceLock<Mutex<HashMap<String, PreparedActionRecord>>> = OnceLock::new();
    ACTIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("system clock is before Unix epoch: {error}"))
}

fn private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| {
        format!(
            "create remote follow-up directory {}: {error}",
            path.display()
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|error| {
            format!(
                "secure remote follow-up directory {}: {error}",
                path.display()
            )
        })?;
    }
    Ok(())
}

fn root_dir() -> Result<PathBuf, String> {
    let root = crate::control_plane::application_data_dir()?
        .join("remote-followup")
        .join(format!("v{SCHEMA_VERSION}"));
    private_dir(&root)?;
    private_dir(&root.join("receipts"))?;
    Ok(root)
}

fn store_path() -> Result<PathBuf, String> {
    Ok(root_dir()?.join("proposals.json"))
}

fn read_store_unlocked() -> Result<ProposalStore, String> {
    let path = store_path()?;
    if !path.exists() {
        return Ok(ProposalStore::default());
    }
    let bytes = fs::read(&path)
        .map_err(|error| format!("read remote follow-up store {}: {error}", path.display()))?;
    let store: ProposalStore = serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse remote follow-up store {}: {error}", path.display()))?;
    if store.schema_version != SCHEMA_VERSION {
        return Err("Unsupported remote follow-up store schema.".to_string());
    }
    Ok(store)
}

fn atomic_private_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("No parent directory for {}", path.display()))?;
    private_dir(parent)?;
    let temp = parent.join(format!(".followup.{}.tmp", Uuid::new_v4()));
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("serialize remote follow-up data: {error}"))?;
    fs::write(&temp, bytes)
        .map_err(|error| format!("write remote follow-up data {}: {error}", temp.display()))?;
    crate::chmod_600(&temp);
    fs::rename(&temp, path).map_err(|error| {
        let _ = fs::remove_file(&temp);
        format!("publish remote follow-up data {}: {error}", path.display())
    })?;
    crate::chmod_600(path);
    Ok(())
}

fn write_store_unlocked(store: &ProposalStore) -> Result<(), String> {
    atomic_private_json(&store_path()?, store)
}

fn with_store<T>(f: impl FnOnce(&mut ProposalStore) -> Result<T, String>) -> Result<T, String> {
    let _guard = store_lock()
        .lock()
        .map_err(|error| format!("remote follow-up store lock: {error}"))?;
    let mut store = read_store_unlocked()?;
    let result = f(&mut store)?;
    write_store_unlocked(&store)?;
    Ok(result)
}

fn validate_uuid(value: &str, label: &str) -> Result<String, String> {
    let value = value.trim();
    Uuid::parse_str(value).map_err(|_| format!("Invalid {label}."))?;
    Ok(value.to_string())
}

fn validate_prompt(value: &str) -> Result<String, String> {
    let value = value.trim();
    let length = value.chars().count();
    if length == 0 || length > MAX_PROMPT_CHARS {
        return Err(format!(
            "Follow-up prompt must be between 1 and {MAX_PROMPT_CHARS} characters."
        ));
    }
    if value
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err("Follow-up prompt contains unsupported control characters.".to_string());
    }
    Ok(value.to_string())
}

fn optional_text(value: Option<String>, label: &str, max: usize) -> Result<Option<String>, String> {
    let value = value.unwrap_or_default().trim().to_string();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > max || value.chars().any(char::is_control) {
        return Err(format!("Invalid remote follow-up {label}."));
    }
    Ok(Some(value))
}

fn canonical_workspace(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("Remote follow-up workspace is required.".to_string());
    }
    let path = fs::canonicalize(value)
        .map_err(|error| format!("resolve remote follow-up workspace '{value}': {error}"))?;
    if !path.is_dir() {
        return Err("Remote follow-up workspace is not a directory.".to_string());
    }
    Ok(path.to_string_lossy().into_owned())
}

fn normalize_approval_input(
    mut input: RemoteFollowupApprovalInput,
) -> Result<RemoteFollowupApprovalInput, String> {
    input.proposal_id = validate_uuid(&input.proposal_id, "remote follow-up proposal id")?;
    input.workspace = canonical_workspace(&input.workspace)?;
    input.provider = input.provider.trim().to_ascii_lowercase();
    if !matches!(
        input.provider.as_str(),
        "claude" | "codex" | "hermes" | "gajecode"
    ) {
        return Err("Unsupported remote follow-up provider.".to_string());
    }
    input.model = optional_text(input.model, "model", 200)?;
    input.effort = optional_text(input.effort, "effort", 32)?;
    if input
        .effort
        .as_deref()
        .is_some_and(|value| !matches!(value, "low" | "medium" | "high" | "xhigh" | "ultra"))
    {
        return Err("Unsupported remote follow-up effort.".to_string());
    }
    input.permission_mode = optional_text(input.permission_mode, "permission mode", 32)?;
    if input
        .permission_mode
        .as_deref()
        .is_some_and(|value| !matches!(value, "basic" | "auto" | "full"))
    {
        return Err("Unsupported remote follow-up permission mode.".to_string());
    }
    Ok(input)
}

fn proposal_by_id(proposal_id: &str) -> Result<RemoteFollowupProposal, String> {
    let _guard = store_lock()
        .lock()
        .map_err(|error| format!("remote follow-up store lock: {error}"))?;
    read_store_unlocked()?
        .proposals
        .into_iter()
        .find(|proposal| proposal.proposal_id == proposal_id)
        .ok_or_else(|| "Remote follow-up proposal was not found.".to_string())
}

pub(crate) fn submit_proposal(
    device_id: &str,
    device_name: &str,
    prompt: &str,
) -> Result<RemoteFollowupProposal, String> {
    let device_id = validate_uuid(device_id, "mobile device id")?;
    let prompt = validate_prompt(prompt)?;
    let now = now_ms()?;
    with_store(|store| {
        if store.proposals.len() >= MAX_PROPOSALS {
            return Err("Remote follow-up proposal limit reached.".to_string());
        }
        let proposal = RemoteFollowupProposal {
            schema_version: SCHEMA_VERSION,
            proposal_id: Uuid::new_v4().to_string(),
            device_id,
            device_name: device_name.to_string(),
            prompt,
            created_at_ms: now,
            expires_at_ms: now.saturating_add(PROPOSAL_TTL_MS),
            status: "pending".to_string(),
            resolved_at_ms: None,
            control_request_id: None,
        };
        store.proposals.push(proposal.clone());
        Ok(proposal)
    })
}

pub(crate) fn device_statuses(device_id: &str, limit: usize) -> Vec<RemoteFollowupStatus> {
    let Ok(_guard) = store_lock().lock() else {
        return Vec::new();
    };
    let Ok(store) = read_store_unlocked() else {
        return Vec::new();
    };
    let mut statuses = store
        .proposals
        .iter()
        .filter(|proposal| proposal.device_id == device_id)
        .map(RemoteFollowupStatus::from)
        .collect::<Vec<_>>();
    statuses.sort_by_key(|proposal| std::cmp::Reverse(proposal.created_at_ms));
    statuses.truncate(limit.clamp(1, 50));
    statuses
}

fn list_proposals(limit: Option<usize>) -> Result<Vec<RemoteFollowupProposal>, String> {
    let _guard = store_lock()
        .lock()
        .map_err(|error| format!("remote follow-up store lock: {error}"))?;
    let mut proposals = read_store_unlocked()?.proposals;
    proposals.sort_by_key(|proposal| std::cmp::Reverse(proposal.created_at_ms));
    proposals.truncate(limit.unwrap_or(100).clamp(1, 500));
    Ok(proposals)
}

fn action_preview(
    proposal: &RemoteFollowupProposal,
    input: &RemoteFollowupApprovalInput,
) -> String {
    format!(
        "Approve mobile follow-up\n\nDevice: {}\nWorkspace: {}\nProvider: {}\nModel: {}\nEffort: {}\nPermission: {}\nStella mode: {}\n\nPrompt:\n{}",
        proposal.device_name,
        input.workspace,
        input.provider,
        input.model.as_deref().unwrap_or("provider default"),
        input.effort.as_deref().unwrap_or("provider default"),
        input.permission_mode.as_deref().unwrap_or("auto"),
        if input.stella_mode { "on" } else { "off" },
        proposal.prompt,
    )
}

fn action_hash(
    action_id: &str,
    proposal: &RemoteFollowupProposal,
    input: &RemoteFollowupApprovalInput,
) -> Result<String, String> {
    let bytes = serde_json::to_vec(&(action_id, proposal, input))
        .map_err(|error| format!("serialize remote follow-up approval: {error}"))?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.as_bytes()
        .iter()
        .zip(right.as_bytes())
        .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn cleanup_prepared(now: u64, actions: &mut HashMap<String, PreparedActionRecord>) {
    actions.retain(|_, record| record.prepared.expires_at_ms >= now);
}

fn prepare_action(
    input: RemoteFollowupApprovalInput,
) -> Result<RemoteFollowupPreparedAction, String> {
    let input = normalize_approval_input(input)?;
    let proposal = proposal_by_id(&input.proposal_id)?;
    let now = now_ms()?;
    if proposal.status != "pending" || proposal.expires_at_ms <= now {
        return Err("Remote follow-up proposal is not pending or has expired.".to_string());
    }
    let action_id = Uuid::new_v4().to_string();
    let prepared = RemoteFollowupPreparedAction {
        schema_version: SCHEMA_VERSION,
        action_id: action_id.clone(),
        action_hash: action_hash(&action_id, &proposal, &input)?,
        proposal_id: proposal.proposal_id.clone(),
        preview: action_preview(&proposal, &input),
        expires_at_ms: now.saturating_add(APPROVAL_TTL_MS),
    };
    let mut actions = prepared_actions()
        .lock()
        .map_err(|_| "Remote follow-up approval store is unavailable.".to_string())?;
    cleanup_prepared(now, &mut actions);
    actions.insert(
        action_id,
        PreparedActionRecord {
            prepared: prepared.clone(),
            input,
            prompt: proposal.prompt,
            device_id: proposal.device_id,
            created_at_ms: now,
        },
    );
    Ok(prepared)
}

fn mark_proposal(
    proposal_id: &str,
    expected_status: &str,
    status: &str,
    request_id: Option<String>,
) -> Result<RemoteFollowupProposal, String> {
    with_store(|store| {
        let proposal = store
            .proposals
            .iter_mut()
            .find(|proposal| proposal.proposal_id == proposal_id)
            .ok_or_else(|| "Remote follow-up proposal was not found.".to_string())?;
        if proposal.status != expected_status {
            return Err(format!(
                "Remote follow-up proposal is {}, not {expected_status}.",
                proposal.status
            ));
        }
        proposal.status = status.to_string();
        proposal.control_request_id = request_id;
        proposal.resolved_at_ms = (status != "pending" && status != "approving")
            .then(now_ms)
            .transpose()?;
        Ok(proposal.clone())
    })
}

fn write_receipt(receipt: &RemoteFollowupReceipt) -> Result<(), String> {
    let path = root_dir()?
        .join("receipts")
        .join(format!("{}.json", receipt.receipt_id));
    atomic_private_json(&path, receipt)
}

fn execute_action(
    action_id: String,
    expected_hash: String,
) -> Result<RemoteFollowupReceipt, String> {
    let now = now_ms()?;
    let record = {
        let mut actions = prepared_actions()
            .lock()
            .map_err(|_| "Remote follow-up approval store is unavailable.".to_string())?;
        cleanup_prepared(now, &mut actions);
        let record = actions.remove(&action_id).ok_or_else(|| {
            "Remote follow-up approval is missing, expired, or already used.".to_string()
        })?;
        if !constant_time_equal(&record.prepared.action_hash, expected_hash.trim()) {
            return Err("Remote follow-up approval hash does not match.".to_string());
        }
        record
    };

    mark_proposal(&record.prepared.proposal_id, "pending", "approving", None)?;
    let payload = json!({
        "provider": record.input.provider,
        "prompt": record.prompt,
        "model": record.input.model,
        "effort": record.input.effort,
        "permissionMode": record.input.permission_mode,
        "stellaMode": record.input.stella_mode,
    });
    let source = format!(
        "mobile-followup:{}:{}",
        record.device_id, record.prepared.proposal_id
    );
    let request = match crate::control_plane::enqueue_request(
        "task.dispatch",
        Some(record.input.workspace),
        payload,
        &source,
    ) {
        Ok(request) => request,
        Err(error) => {
            let _ = mark_proposal(&record.prepared.proposal_id, "approving", "pending", None);
            return Err(error);
        }
    };
    mark_proposal(
        &record.prepared.proposal_id,
        "approving",
        "approved",
        Some(request.request_id.clone()),
    )?;
    let receipt = RemoteFollowupReceipt {
        schema_version: SCHEMA_VERSION,
        receipt_id: Uuid::new_v4().to_string(),
        action_id: record.prepared.action_id,
        action_hash: record.prepared.action_hash,
        proposal_id: record.prepared.proposal_id,
        control_request_id: request.request_id,
        status: "queued".to_string(),
        summary: "Approved mobile follow-up and queued it for Atelier.".to_string(),
        created_at_ms: record.created_at_ms,
        completed_at_ms: now_ms()?,
    };
    write_receipt(&receipt)?;
    Ok(receipt)
}

fn reject_proposal(proposal_id: String) -> Result<RemoteFollowupProposal, String> {
    let proposal_id = validate_uuid(&proposal_id, "remote follow-up proposal id")?;
    mark_proposal(&proposal_id, "pending", "rejected", None)
}

#[tauri::command]
pub(crate) async fn remote_followup_proposals(
    limit: Option<usize>,
) -> Result<Vec<RemoteFollowupProposal>, String> {
    tauri::async_runtime::spawn_blocking(move || list_proposals(limit))
        .await
        .map_err(|error| format!("remote follow-up list thread join: {error}"))?
}

#[tauri::command]
pub(crate) async fn remote_followup_prepare(
    input: RemoteFollowupApprovalInput,
) -> Result<RemoteFollowupPreparedAction, String> {
    tauri::async_runtime::spawn_blocking(move || prepare_action(input))
        .await
        .map_err(|error| format!("remote follow-up prepare thread join: {error}"))?
}

#[tauri::command]
pub(crate) async fn remote_followup_execute(
    action_id: String,
    expected_hash: String,
) -> Result<RemoteFollowupReceipt, String> {
    tauri::async_runtime::spawn_blocking(move || execute_action(action_id, expected_hash))
        .await
        .map_err(|error| format!("remote follow-up execute thread join: {error}"))?
}

#[tauri::command]
pub(crate) fn remote_followup_discard(action_id: String) -> Result<(), String> {
    prepared_actions()
        .lock()
        .map_err(|_| "Remote follow-up approval store is unavailable.".to_string())?
        .remove(action_id.trim());
    Ok(())
}

#[tauri::command]
pub(crate) async fn remote_followup_reject(
    proposal_id: String,
) -> Result<RemoteFollowupProposal, String> {
    tauri::async_runtime::spawn_blocking(move || reject_proposal(proposal_id))
        .await
        .map_err(|error| format!("remote follow-up reject thread join: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_is_bounded_but_allows_multiline_text() {
        assert_eq!(
            validate_prompt("  first\nsecond  ").unwrap(),
            "first\nsecond"
        );
        assert!(validate_prompt("").is_err());
        assert!(validate_prompt(&"x".repeat(MAX_PROMPT_CHARS + 1)).is_err());
        assert!(validate_prompt("bad\u{0007}input").is_err());
    }

    #[test]
    fn approval_rejects_arbitrary_providers_and_permissions() {
        let root = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let input = RemoteFollowupApprovalInput {
            proposal_id: Uuid::new_v4().to_string(),
            workspace: root.clone(),
            provider: "shell".to_string(),
            model: None,
            effort: None,
            permission_mode: None,
            stella_mode: false,
        };
        assert!(normalize_approval_input(input).is_err());
        let input = RemoteFollowupApprovalInput {
            proposal_id: Uuid::new_v4().to_string(),
            workspace: root,
            provider: "codex".to_string(),
            model: None,
            effort: Some("unbounded".to_string()),
            permission_mode: Some("root".to_string()),
            stella_mode: false,
        };
        assert!(normalize_approval_input(input).is_err());
    }

    #[test]
    fn approval_hash_is_stable_and_exact() {
        let proposal = RemoteFollowupProposal {
            schema_version: SCHEMA_VERSION,
            proposal_id: Uuid::new_v4().to_string(),
            device_id: Uuid::new_v4().to_string(),
            device_name: "phone".to_string(),
            prompt: "run tests".to_string(),
            created_at_ms: 1,
            expires_at_ms: 2,
            status: "pending".to_string(),
            resolved_at_ms: None,
            control_request_id: None,
        };
        let input = RemoteFollowupApprovalInput {
            proposal_id: proposal.proposal_id.clone(),
            workspace: "/tmp".to_string(),
            provider: "codex".to_string(),
            model: None,
            effort: Some("high".to_string()),
            permission_mode: Some("auto".to_string()),
            stella_mode: false,
        };
        let hash = action_hash("action", &proposal, &input).unwrap();
        assert!(constant_time_equal(
            &hash,
            &action_hash("action", &proposal, &input).unwrap()
        ));
        assert!(!constant_time_equal(&hash, "different"));
    }
}
