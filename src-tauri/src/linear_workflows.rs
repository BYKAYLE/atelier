use reqwest::blocking::{Client, Response};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const LINEAR_SCHEMA_VERSION: u32 = 1;
const LINEAR_GRAPHQL_ENDPOINT: &str = "https://api.linear.app/graphql";
const APPROVAL_TTL_MS: u64 = 5 * 60 * 1000;
const MAX_BODY_CHARS: usize = 60_000;
const MAX_TITLE_CHARS: usize = 500;
const MAX_ID_CHARS: usize = 200;

const SNAPSHOT_QUERY: &str = r#"
query AtelierLinearSnapshot($issueCount: Int!, $teamCount: Int!) {
  viewer { id name email }
  teams(first: $teamCount) {
    nodes {
      id
      key
      name
      states { nodes { id name type color position } }
    }
  }
  issues(first: $issueCount) {
    nodes {
      id
      identifier
      title
      url
      updatedAt
      priority
      state { id name type color }
      team { id key name }
      assignee { id name }
    }
  }
}
"#;

const VIEWER_QUERY: &str = r#"
query AtelierLinearViewer { viewer { id name email } }
"#;

const ISSUE_CREATE_MUTATION: &str = r#"
mutation AtelierLinearIssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier title url state { id name type color } }
  }
}
"#;

const COMMENT_CREATE_MUTATION: &str = r#"
mutation AtelierLinearCommentCreate($input: CommentCreateInput!) {
  commentCreate(input: $input) { success comment { id } }
}
"#;

const ISSUE_UPDATE_MUTATION: &str = r#"
mutation AtelierLinearIssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue { id identifier title url state { id name type color } }
  }
}
"#;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearViewerSummary {
    id: String,
    name: String,
    email: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearWorkflowStateSummary {
    id: String,
    name: String,
    #[serde(rename = "type")]
    state_type: String,
    color: Option<String>,
    position: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearTeamSummary {
    id: String,
    key: String,
    name: String,
    states: Vec<LinearWorkflowStateSummary>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueStateSummary {
    id: String,
    name: String,
    #[serde(rename = "type")]
    state_type: String,
    color: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueTeamSummary {
    id: String,
    key: String,
    name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueAssigneeSummary {
    id: String,
    name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueSummary {
    id: String,
    identifier: String,
    title: String,
    url: String,
    updated_at: Option<String>,
    priority: Option<i64>,
    state: Option<LinearIssueStateSummary>,
    team: Option<LinearIssueTeamSummary>,
    assignee: Option<LinearIssueAssigneeSummary>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearWorkflowSnapshot {
    schema_version: u32,
    connected: bool,
    viewer: Option<LinearViewerSummary>,
    teams: Vec<LinearTeamSummary>,
    issues: Vec<LinearIssueSummary>,
    rate_limit_remaining: Option<u64>,
    rate_limit_reset_unix_ms: Option<u64>,
    reason: Option<String>,
    fetched_at_unix_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearActionInput {
    kind: String,
    #[serde(default)]
    team_id: Option<String>,
    #[serde(default)]
    issue_id: Option<String>,
    #[serde(default)]
    state_id: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    body: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearPreparedAction {
    schema_version: u32,
    action_id: String,
    action_hash: String,
    account_name: String,
    kind: String,
    preview: String,
    expires_at_unix_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearActionReceipt {
    schema_version: u32,
    receipt_id: String,
    action_id: String,
    action_hash: String,
    account_id: String,
    kind: String,
    status: String,
    summary: String,
    url: Option<String>,
    error: Option<String>,
    created_at_unix_ms: u64,
    completed_at_unix_ms: u64,
}

#[derive(Clone, Debug)]
struct PreparedActionRecord {
    prepared: LinearPreparedAction,
    account_id: String,
    action: LinearActionInput,
    created_at_unix_ms: u64,
}

#[derive(Debug, Deserialize)]
struct GraphQlEnvelope<T> {
    data: Option<T>,
    #[serde(default)]
    errors: Vec<GraphQlError>,
}

#[derive(Debug, Deserialize)]
struct GraphQlError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct SnapshotData {
    viewer: LinearViewerSummary,
    teams: NodeConnection<RawLinearTeam>,
    issues: NodeConnection<LinearIssueSummary>,
}

#[derive(Debug, Deserialize)]
struct ViewerData {
    viewer: LinearViewerSummary,
}

#[derive(Debug, Deserialize)]
struct NodeConnection<T> {
    nodes: Vec<T>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawLinearTeam {
    id: String,
    key: String,
    name: String,
    states: NodeConnection<LinearWorkflowStateSummary>,
}

struct GraphQlResult<T> {
    data: T,
    rate_limit_remaining: Option<u64>,
    rate_limit_reset_unix_ms: Option<u64>,
}

static PREPARED_ACTIONS: OnceLock<Mutex<HashMap<String, PreparedActionRecord>>> = OnceLock::new();

fn prepared_actions() -> &'static Mutex<HashMap<String, PreparedActionRecord>> {
    PREPARED_ACTIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_unix_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("system clock is before Unix epoch: {error}"))
}

fn api_key() -> Result<String, String> {
    crate::credentials::read_api_key("linear").ok_or_else(|| {
        "Linear API key is not connected. Open Settings > Connections and save a personal Linear API key first."
            .to_string()
    })
}

fn graphql_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent(format!("Atelier/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("create Linear API client: {error}"))
}

fn decode_graphql<T: DeserializeOwned>(response: Response) -> Result<GraphQlResult<T>, String> {
    let status = response.status();
    let rate_limit_remaining = response
        .headers()
        .get("x-ratelimit-requests-remaining")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok());
    let rate_limit_reset_unix_ms = response
        .headers()
        .get("x-ratelimit-requests-reset")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok());
    let envelope: GraphQlEnvelope<T> = response
        .json()
        .map_err(|error| format!("decode Linear API response: {error}"))?;
    if !status.is_success() || !envelope.errors.is_empty() {
        let detail = envelope
            .errors
            .iter()
            .map(|error| error.message.trim())
            .filter(|message| !message.is_empty())
            .take(3)
            .collect::<Vec<_>>()
            .join("; ");
        return Err(if detail.is_empty() {
            format!("Linear API request failed with HTTP {status}.")
        } else {
            format!("Linear API request failed: {detail}")
        });
    }
    let data = envelope
        .data
        .ok_or_else(|| "Linear API response did not include data.".to_string())?;
    Ok(GraphQlResult {
        data,
        rate_limit_remaining,
        rate_limit_reset_unix_ms,
    })
}

fn graphql<T: DeserializeOwned>(
    key: &str,
    query: &'static str,
    variables: Value,
) -> Result<GraphQlResult<T>, String> {
    let response = graphql_client()?
        .post(LINEAR_GRAPHQL_ENDPOINT)
        .header("Authorization", key)
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .map_err(|error| format!("request Linear API: {error}"))?;
    decode_graphql(response)
}

fn snapshot(limit: Option<usize>) -> Result<LinearWorkflowSnapshot, String> {
    let fetched_at_unix_ms = now_unix_ms()?;
    let key = match api_key() {
        Ok(key) => key,
        Err(reason) => {
            return Ok(LinearWorkflowSnapshot {
                schema_version: LINEAR_SCHEMA_VERSION,
                connected: false,
                viewer: None,
                teams: Vec::new(),
                issues: Vec::new(),
                rate_limit_remaining: None,
                rate_limit_reset_unix_ms: None,
                reason: Some(reason),
                fetched_at_unix_ms,
            });
        }
    };
    let result: GraphQlResult<SnapshotData> = graphql(
        &key,
        SNAPSHOT_QUERY,
        json!({
            "issueCount": limit.unwrap_or(25).clamp(1, 100),
            "teamCount": 50,
        }),
    )?;
    let teams = result
        .data
        .teams
        .nodes
        .into_iter()
        .map(|team| LinearTeamSummary {
            id: team.id,
            key: team.key,
            name: team.name,
            states: team.states.nodes,
        })
        .collect();
    Ok(LinearWorkflowSnapshot {
        schema_version: LINEAR_SCHEMA_VERSION,
        connected: true,
        viewer: Some(result.data.viewer),
        teams,
        issues: result.data.issues.nodes,
        rate_limit_remaining: result.rate_limit_remaining,
        rate_limit_reset_unix_ms: result.rate_limit_reset_unix_ms,
        reason: None,
        fetched_at_unix_ms,
    })
}

fn viewer_identity(key: &str) -> Result<LinearViewerSummary, String> {
    let result: GraphQlResult<ViewerData> = graphql(key, VIEWER_QUERY, json!({}))?;
    Ok(result.data.viewer)
}

fn bounded_text(
    value: Option<String>,
    field: &str,
    max: usize,
    required: bool,
) -> Result<Option<String>, String> {
    let value = value.unwrap_or_default().trim().to_string();
    if required && value.is_empty() {
        return Err(format!("Linear {field} is required."));
    }
    if value.chars().count() > max {
        return Err(format!("Linear {field} is longer than {max} characters."));
    }
    if value.chars().any(char::is_control) && field != "body" {
        return Err(format!("Linear {field} contains control characters."));
    }
    Ok((!value.is_empty()).then_some(value))
}

fn opaque_id(value: Option<String>, field: &str) -> Result<Option<String>, String> {
    bounded_text(value, field, MAX_ID_CHARS, true)
}

fn normalize_action(mut action: LinearActionInput) -> Result<LinearActionInput, String> {
    match action.kind.as_str() {
        "issue.create" => {
            action.team_id = opaque_id(action.team_id, "team ID")?;
            action.title = bounded_text(action.title, "title", MAX_TITLE_CHARS, true)?;
            action.body = bounded_text(action.body, "body", MAX_BODY_CHARS, false)?;
            action.issue_id = None;
            action.state_id = None;
        }
        "issue.comment" => {
            action.issue_id = opaque_id(action.issue_id, "issue ID")?;
            action.body = bounded_text(action.body, "body", MAX_BODY_CHARS, true)?;
            action.team_id = None;
            action.state_id = None;
            action.title = None;
        }
        "issue.status" => {
            action.issue_id = opaque_id(action.issue_id, "issue ID")?;
            action.state_id = opaque_id(action.state_id, "state ID")?;
            action.team_id = None;
            action.title = None;
            action.body = None;
        }
        _ => {
            return Err(
                "Unsupported Linear action. Only create, comment, and status changes are allowed."
                    .to_string(),
            )
        }
    }
    Ok(action)
}

fn action_preview(action: &LinearActionInput, account_name: &str) -> String {
    match action.kind.as_str() {
        "issue.create" => format!(
            "Create a Linear issue as {account_name}\n\nTeam: {team}\nTitle: {title}\n\n{body}",
            team = action.team_id.as_deref().unwrap_or_default(),
            title = action.title.as_deref().unwrap_or_default(),
            body = action.body.as_deref().unwrap_or("(no description)"),
        ),
        "issue.comment" => format!(
            "Comment on Linear issue {issue} as {account_name}\n\n{body}",
            issue = action.issue_id.as_deref().unwrap_or_default(),
            body = action.body.as_deref().unwrap_or_default(),
        ),
        "issue.status" => format!(
            "Change Linear issue {issue} to workflow state {state} as {account_name}",
            issue = action.issue_id.as_deref().unwrap_or_default(),
            state = action.state_id.as_deref().unwrap_or_default(),
        ),
        _ => action.kind.clone(),
    }
}

fn action_hash(
    account_id: &str,
    action_id: &str,
    action: &LinearActionInput,
) -> Result<String, String> {
    let serialized = serde_json::to_vec(&(account_id, action_id, action))
        .map_err(|error| format!("serialize Linear action approval: {error}"))?;
    let mut hasher = Sha256::new();
    hasher.update(serialized);
    Ok(format!("{:x}", hasher.finalize()))
}

fn cleanup_expired_actions(now: u64, actions: &mut HashMap<String, PreparedActionRecord>) {
    actions.retain(|_, record| record.prepared.expires_at_unix_ms >= now);
}

fn prepare_action(action: LinearActionInput) -> Result<LinearPreparedAction, String> {
    let key = api_key()?;
    let viewer = viewer_identity(&key)?;
    let action = normalize_action(action)?;
    let now = now_unix_ms()?;
    let action_id = Uuid::new_v4().to_string();
    let action_hash = action_hash(&viewer.id, &action_id, &action)?;
    let prepared = LinearPreparedAction {
        schema_version: LINEAR_SCHEMA_VERSION,
        action_id: action_id.clone(),
        action_hash,
        account_name: viewer.name.clone(),
        kind: action.kind.clone(),
        preview: action_preview(&action, &viewer.name),
        expires_at_unix_ms: now + APPROVAL_TTL_MS,
    };
    let mut actions = prepared_actions()
        .lock()
        .map_err(|_| "Linear approval store is unavailable.".to_string())?;
    cleanup_expired_actions(now, &mut actions);
    actions.insert(
        action_id,
        PreparedActionRecord {
            prepared: prepared.clone(),
            account_id: viewer.id,
            action,
            created_at_unix_ms: now,
        },
    );
    Ok(prepared)
}

fn mutation_request(action: &LinearActionInput) -> (&'static str, Value) {
    match action.kind.as_str() {
        "issue.create" => (
            ISSUE_CREATE_MUTATION,
            json!({ "input": {
                "teamId": action.team_id,
                "title": action.title,
                "description": action.body,
            }}),
        ),
        "issue.comment" => (
            COMMENT_CREATE_MUTATION,
            json!({ "input": {
                "issueId": action.issue_id,
                "body": action.body,
            }}),
        ),
        "issue.status" => (
            ISSUE_UPDATE_MUTATION,
            json!({
                "id": action.issue_id,
                "input": { "stateId": action.state_id },
            }),
        ),
        _ => ("", json!({})),
    }
}

fn mutation_summary(action: &LinearActionInput, data: &Value) -> (String, Option<String>) {
    let payload_key = match action.kind.as_str() {
        "issue.create" => "issueCreate",
        "issue.comment" => "commentCreate",
        "issue.status" => "issueUpdate",
        _ => "",
    };
    let payload = data.get(payload_key).unwrap_or(&Value::Null);
    let success = payload
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !success {
        return ("Linear action returned success=false.".to_string(), None);
    }
    let issue = payload.get("issue");
    let identifier = issue
        .and_then(|value| value.get("identifier"))
        .and_then(Value::as_str);
    let title = issue
        .and_then(|value| value.get("title"))
        .and_then(Value::as_str);
    let url = issue
        .and_then(|value| value.get("url"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let summary = match action.kind.as_str() {
        "issue.create" => format!(
            "Created Linear issue{}{}.",
            identifier
                .map(|value| format!(" {value}"))
                .unwrap_or_default(),
            title.map(|value| format!(" — {value}")).unwrap_or_default(),
        ),
        "issue.comment" => "Added a comment to the Linear issue.".to_string(),
        "issue.status" => format!(
            "Updated Linear issue{} status.",
            identifier
                .map(|value| format!(" {value}"))
                .unwrap_or_default(),
        ),
        _ => "Linear action completed.".to_string(),
    };
    (summary, url)
}

fn receipt_root() -> Result<PathBuf, String> {
    let root = crate::control_plane::application_data_dir()?
        .join("linear-workflows")
        .join(format!("v{LINEAR_SCHEMA_VERSION}"))
        .join("receipts");
    fs::create_dir_all(&root)
        .map_err(|error| format!("create Linear workflow receipt directory: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("secure Linear workflow receipt directory: {error}"))?;
    }
    Ok(root)
}

fn write_receipt(receipt: &LinearActionReceipt) -> Result<(), String> {
    let path = receipt_root()?.join(format!("{}.json", receipt.receipt_id));
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let content = serde_json::to_vec_pretty(receipt)
        .map_err(|error| format!("serialize Linear workflow receipt: {error}"))?;
    fs::write(&temp, content)
        .map_err(|error| format!("write Linear workflow receipt {}: {error}", temp.display()))?;
    crate::chmod_600(&temp);
    fs::rename(&temp, &path).map_err(|error| {
        format!(
            "publish Linear workflow receipt {}: {error}",
            path.display()
        )
    })?;
    crate::chmod_600(&path);
    Ok(())
}

fn execute_action(action_id: String, expected_hash: String) -> Result<LinearActionReceipt, String> {
    let now = now_unix_ms()?;
    let record = {
        let mut actions = prepared_actions()
            .lock()
            .map_err(|_| "Linear approval store is unavailable.".to_string())?;
        cleanup_expired_actions(now, &mut actions);
        let record = actions
            .remove(&action_id)
            .ok_or_else(|| "Linear approval is missing, expired, or already used.".to_string())?;
        if record.prepared.action_hash != expected_hash {
            return Err("Linear approval hash does not match the prepared action.".to_string());
        }
        record
    };
    let key = api_key()?;
    let viewer = viewer_identity(&key)?;
    if viewer.id != record.account_id {
        return Err(
            "The Linear account changed after approval. Prepare the action again.".to_string(),
        );
    }
    let (query, variables) = mutation_request(&record.action);
    if query.is_empty() {
        return Err("The prepared Linear mutation is invalid.".to_string());
    }
    let result: Result<GraphQlResult<Value>, String> = graphql(&key, query, variables);
    let completed_at_unix_ms = now_unix_ms()?;
    let (status, summary, url, error) = match result {
        Ok(result) => {
            let (summary, url) = mutation_summary(&record.action, &result.data);
            ("succeeded".to_string(), summary, url, None)
        }
        Err(error) => (
            "failed".to_string(),
            "Linear action failed.".to_string(),
            None,
            Some(error),
        ),
    };
    let receipt = LinearActionReceipt {
        schema_version: LINEAR_SCHEMA_VERSION,
        receipt_id: Uuid::new_v4().to_string(),
        action_id: record.prepared.action_id,
        action_hash: record.prepared.action_hash,
        account_id: record.account_id,
        kind: record.prepared.kind,
        status,
        summary,
        url,
        error,
        created_at_unix_ms: record.created_at_unix_ms,
        completed_at_unix_ms,
    };
    write_receipt(&receipt)?;
    Ok(receipt)
}

fn read_receipts(limit: Option<usize>) -> Result<Vec<LinearActionReceipt>, String> {
    let root = receipt_root()?;
    let mut receipts = Vec::new();
    for entry in
        fs::read_dir(&root).map_err(|error| format!("list Linear workflow receipts: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("read Linear workflow receipt entry: {error}"))?;
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let content = match fs::read(entry.path()) {
            Ok(content) => content,
            Err(_) => continue,
        };
        if let Ok(receipt) = serde_json::from_slice::<LinearActionReceipt>(&content) {
            receipts.push(receipt);
        }
    }
    receipts.sort_by_key(|receipt| std::cmp::Reverse(receipt.completed_at_unix_ms));
    receipts.truncate(limit.unwrap_or(20).clamp(1, 100));
    Ok(receipts)
}

#[tauri::command]
pub async fn linear_workflow_snapshot(
    limit: Option<usize>,
) -> Result<LinearWorkflowSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || snapshot(limit))
        .await
        .map_err(|error| format!("Linear workflow snapshot thread join: {error}"))?
}

#[tauri::command]
pub async fn linear_workflow_prepare(
    action: LinearActionInput,
) -> Result<LinearPreparedAction, String> {
    tauri::async_runtime::spawn_blocking(move || prepare_action(action))
        .await
        .map_err(|error| format!("Linear workflow prepare thread join: {error}"))?
}

#[tauri::command]
pub async fn linear_workflow_execute(
    action_id: String,
    expected_hash: String,
) -> Result<LinearActionReceipt, String> {
    tauri::async_runtime::spawn_blocking(move || execute_action(action_id, expected_hash))
        .await
        .map_err(|error| format!("Linear workflow execute thread join: {error}"))?
}

#[tauri::command]
pub async fn linear_workflow_discard(action_id: String) -> Result<(), String> {
    let mut actions = prepared_actions()
        .lock()
        .map_err(|_| "Linear approval store is unavailable.".to_string())?;
    actions.remove(&action_id);
    Ok(())
}

#[tauri::command]
pub async fn linear_workflow_receipts(
    limit: Option<usize>,
) -> Result<Vec<LinearActionReceipt>, String> {
    tauri::async_runtime::spawn_blocking(move || read_receipts(limit))
        .await
        .map_err(|error| format!("Linear workflow receipts thread join: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_snapshot_without_exposing_credentials() {
        let raw = r##"{
          "data": {
            "viewer": {"id":"user-1","name":"Ada","email":"ada@example.com"},
            "teams": {"nodes":[{"id":"team-1","key":"ENG","name":"Engineering","states":{"nodes":[{"id":"state-1","name":"In Progress","type":"started","color":"#fff","position":1.0}]}}]},
            "issues": {"nodes":[{"id":"issue-1","identifier":"ENG-1","title":"Ship","url":"https://linear.app/x/issue/ENG-1","updatedAt":"2026-07-17","priority":2,"state":null,"team":null,"assignee":null}]}
          }
        }"##;
        let envelope: GraphQlEnvelope<SnapshotData> = serde_json::from_str(raw).expect("snapshot");
        let data = envelope.data.expect("data");
        assert_eq!(data.viewer.name, "Ada");
        assert_eq!(data.teams.nodes[0].states.nodes[0].state_type, "started");
        assert_eq!(data.issues.nodes[0].identifier, "ENG-1");
    }

    #[test]
    fn normalizes_only_allowlisted_mutations() {
        let create = normalize_action(LinearActionInput {
            kind: "issue.create".to_string(),
            team_id: Some("team-1".to_string()),
            issue_id: Some("ignored".to_string()),
            state_id: None,
            title: Some("  Ship it  ".to_string()),
            body: Some(" Details ".to_string()),
        })
        .expect("create");
        assert_eq!(create.title.as_deref(), Some("Ship it"));
        assert!(create.issue_id.is_none());
        assert!(normalize_action(LinearActionInput {
            kind: "issue.delete".to_string(),
            team_id: None,
            issue_id: Some("issue-1".to_string()),
            state_id: None,
            title: None,
            body: None,
        })
        .is_err());
    }

    #[test]
    fn prepared_hash_changes_with_payload() {
        let action = LinearActionInput {
            kind: "issue.comment".to_string(),
            team_id: None,
            issue_id: Some("issue-1".to_string()),
            state_id: None,
            title: None,
            body: Some("first".to_string()),
        };
        let first = action_hash("account", "action", &action).expect("first hash");
        let mut changed = action;
        changed.body = Some("second".to_string());
        let second = action_hash("account", "action", &changed).expect("second hash");
        assert_ne!(first, second);
    }

    #[test]
    fn mutation_variables_hold_user_text_as_data() {
        let action = LinearActionInput {
            kind: "issue.create".to_string(),
            team_id: Some("team-1".to_string()),
            issue_id: None,
            state_id: None,
            title: Some("Title\nmutation Evil { issueDelete }".to_string()),
            body: Some("Body".to_string()),
        };
        let (query, variables) = mutation_request(&action);
        assert_eq!(query, ISSUE_CREATE_MUTATION);
        assert_eq!(variables["input"]["title"], action.title.unwrap());
        assert!(!query.contains("issueDelete"));
    }
}
