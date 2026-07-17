use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const GITHUB_SCHEMA_VERSION: u32 = 1;
const APPROVAL_TTL_MS: u64 = 5 * 60 * 1000;
const MAX_BODY_CHARS: usize = 60_000;
const MAX_TITLE_CHARS: usize = 500;
const MAX_REVIEWERS: usize = 20;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubIssueSummary {
    number: u64,
    title: String,
    state: String,
    url: String,
    author: Option<String>,
    updated_at: Option<String>,
    labels: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubPullRequestSummary {
    number: u64,
    title: String,
    state: String,
    url: String,
    author: Option<String>,
    head_ref_name: String,
    base_ref_name: String,
    is_draft: bool,
    review_decision: Option<String>,
    updated_at: Option<String>,
    checks_total: usize,
    checks_success: usize,
    checks_failure: usize,
    reviewers: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubWorkflowSnapshot {
    schema_version: u32,
    available: bool,
    authenticated: bool,
    gh_version: Option<String>,
    login: Option<String>,
    repository: Option<String>,
    repository_url: Option<String>,
    default_branch: Option<String>,
    issues: Vec<GithubIssueSummary>,
    pull_requests: Vec<GithubPullRequestSummary>,
    reason: Option<String>,
    fetched_at_unix_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubActionInput {
    kind: String,
    #[serde(default)]
    number: Option<u64>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    base: Option<String>,
    #[serde(default)]
    reviewers: Vec<String>,
    #[serde(default)]
    review_decision: Option<String>,
    #[serde(default)]
    draft: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubPreparedAction {
    schema_version: u32,
    action_id: String,
    action_hash: String,
    repository: String,
    kind: String,
    preview: String,
    expires_at_unix_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubActionReceipt {
    schema_version: u32,
    receipt_id: String,
    action_id: String,
    action_hash: String,
    repository: String,
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
    root: String,
    prepared: GithubPreparedAction,
    action: GithubActionInput,
    created_at_unix_ms: u64,
}

#[derive(Debug)]
struct GhOutput {
    success: bool,
    stdout: String,
    stderr: String,
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

#[cfg(target_os = "windows")]
fn configure_background_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_background_command(_: &mut Command) {}

fn run_gh(root: &str, args: &[String]) -> Result<GhOutput, String> {
    let mut command = Command::new("gh");
    configure_background_command(&mut command);
    let output = command
        .current_dir(root)
        .args(args)
        .env("PATH", crate::augmented_cli_path())
        .output()
        .map_err(|error| format!("start GitHub CLI: {error}"))?;
    Ok(GhOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

fn canonical_git_root(cwd: &str) -> Result<String, String> {
    let canonical = fs::canonicalize(cwd.trim())
        .map_err(|error| format!("resolve workspace '{}': {error}", cwd.trim()))?;
    if !canonical.is_dir() {
        return Err("The GitHub workspace is not a directory.".to_string());
    }
    crate::agent_git::git_root(Some(canonical.to_string_lossy().into_owned()))
}

fn gh_version(root: &str) -> Result<String, String> {
    let output = run_gh(root, &["--version".to_string()])?;
    if !output.success {
        return Err(non_empty_error(&output, "GitHub CLI is unavailable."));
    }
    Ok(output.stdout.lines().next().unwrap_or_default().to_string())
}

fn authenticated_login(root: &str) -> Result<String, String> {
    let output = run_gh(
        root,
        &[
            "api".to_string(),
            "user".to_string(),
            "--jq".to_string(),
            ".login".to_string(),
        ],
    )?;
    if !output.success || output.stdout.is_empty() {
        return Err(non_empty_error(
            &output,
            "GitHub CLI is not authenticated. Run `gh auth login` first.",
        ));
    }
    Ok(output.stdout)
}

#[derive(Debug)]
struct RepositoryIdentity {
    name_with_owner: String,
    url: String,
    default_branch: Option<String>,
}

fn repository_identity(root: &str) -> Result<RepositoryIdentity, String> {
    let output = run_gh(
        root,
        &[
            "repo".to_string(),
            "view".to_string(),
            "--json".to_string(),
            "nameWithOwner,url,defaultBranchRef".to_string(),
        ],
    )?;
    if !output.success {
        return Err(non_empty_error(
            &output,
            "The workspace is not connected to a GitHub repository.",
        ));
    }
    let value: Value = serde_json::from_str(&output.stdout)
        .map_err(|error| format!("parse GitHub repository response: {error}"))?;
    let name_with_owner = json_string(&value, "nameWithOwner")
        .ok_or_else(|| "GitHub repository response did not include nameWithOwner.".to_string())?;
    Ok(RepositoryIdentity {
        name_with_owner,
        url: json_string(&value, "url").unwrap_or_default(),
        default_branch: value
            .get("defaultBranchRef")
            .and_then(|branch| branch.get("name"))
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

fn non_empty_error(output: &GhOutput, fallback: &str) -> String {
    if !output.stderr.is_empty() {
        output.stderr.clone()
    } else if !output.stdout.is_empty() {
        output.stdout.clone()
    } else {
        fallback.to_string()
    }
}

fn json_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

fn author_login(value: &Value) -> Option<String> {
    value
        .get("author")
        .and_then(|author| author.get("login"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn parse_issues(raw: &str) -> Result<Vec<GithubIssueSummary>, String> {
    let items: Vec<Value> = serde_json::from_str(raw)
        .map_err(|error| format!("parse GitHub issues response: {error}"))?;
    Ok(items
        .into_iter()
        .filter_map(|value| {
            Some(GithubIssueSummary {
                number: value.get("number")?.as_u64()?,
                title: json_string(&value, "title")?,
                state: json_string(&value, "state").unwrap_or_default(),
                url: json_string(&value, "url").unwrap_or_default(),
                author: author_login(&value),
                updated_at: json_string(&value, "updatedAt"),
                labels: value
                    .get("labels")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|label| json_string(label, "name"))
                    .collect(),
            })
        })
        .collect())
}

fn check_rollup_counts(value: &Value) -> (usize, usize, usize) {
    let checks = value
        .get("statusCheckRollup")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut success = 0;
    let mut failure = 0;
    for check in &checks {
        let state = check
            .get("conclusion")
            .or_else(|| check.get("state"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_ascii_uppercase();
        if matches!(state.as_str(), "SUCCESS" | "NEUTRAL" | "SKIPPED") {
            success += 1;
        } else if matches!(
            state.as_str(),
            "FAILURE" | "ERROR" | "CANCELLED" | "TIMED_OUT" | "ACTION_REQUIRED"
        ) {
            failure += 1;
        }
    }
    (checks.len(), success, failure)
}

fn parse_pull_requests(raw: &str) -> Result<Vec<GithubPullRequestSummary>, String> {
    let items: Vec<Value> = serde_json::from_str(raw)
        .map_err(|error| format!("parse GitHub pull requests response: {error}"))?;
    Ok(items
        .into_iter()
        .filter_map(|value| {
            let (checks_total, checks_success, checks_failure) = check_rollup_counts(&value);
            Some(GithubPullRequestSummary {
                number: value.get("number")?.as_u64()?,
                title: json_string(&value, "title")?,
                state: json_string(&value, "state").unwrap_or_default(),
                url: json_string(&value, "url").unwrap_or_default(),
                author: author_login(&value),
                head_ref_name: json_string(&value, "headRefName").unwrap_or_default(),
                base_ref_name: json_string(&value, "baseRefName").unwrap_or_default(),
                is_draft: value
                    .get("isDraft")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                review_decision: json_string(&value, "reviewDecision"),
                updated_at: json_string(&value, "updatedAt"),
                checks_total,
                checks_success,
                checks_failure,
                reviewers: value
                    .get("reviewRequests")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|reviewer| json_string(reviewer, "login"))
                    .collect(),
            })
        })
        .collect())
}

fn list_json(root: &str, args: Vec<String>) -> Result<String, String> {
    let output = run_gh(root, &args)?;
    if output.success {
        Ok(output.stdout)
    } else {
        Err(non_empty_error(&output, "GitHub request failed."))
    }
}

fn snapshot(cwd: String, limit: Option<usize>) -> GithubWorkflowSnapshot {
    let fetched_at_unix_ms = now_unix_ms().unwrap_or_default();
    let empty =
        |reason: String, available: bool, gh_version: Option<String>| GithubWorkflowSnapshot {
            schema_version: GITHUB_SCHEMA_VERSION,
            available,
            authenticated: false,
            gh_version,
            login: None,
            repository: None,
            repository_url: None,
            default_branch: None,
            issues: Vec::new(),
            pull_requests: Vec::new(),
            reason: Some(reason),
            fetched_at_unix_ms,
        };
    let root = match canonical_git_root(&cwd) {
        Ok(root) => root,
        Err(error) => return empty(error, false, None),
    };
    let version = match gh_version(&root) {
        Ok(version) => version,
        Err(error) => return empty(error, false, None),
    };
    let login = match authenticated_login(&root) {
        Ok(login) => login,
        Err(error) => return empty(error, true, Some(version)),
    };
    let repository = match repository_identity(&root) {
        Ok(repository) => repository,
        Err(error) => {
            let mut result = empty(error, true, Some(version));
            result.authenticated = true;
            result.login = Some(login);
            return result;
        }
    };
    let limit = limit.unwrap_or(20).clamp(1, 100).to_string();
    let issues = list_json(
        &root,
        vec![
            "issue".into(),
            "list".into(),
            "--state".into(),
            "all".into(),
            "--limit".into(),
            limit.clone(),
            "--json".into(),
            "number,title,state,url,author,updatedAt,labels".into(),
        ],
    )
    .and_then(|raw| parse_issues(&raw));
    let pull_requests = list_json(
        &root,
        vec![
            "pr".into(),
            "list".into(),
            "--state".into(),
            "all".into(),
            "--limit".into(),
            limit,
            "--json".into(),
            "number,title,state,url,author,headRefName,baseRefName,isDraft,updatedAt,reviewDecision,statusCheckRollup,reviewRequests".into(),
        ],
    )
    .and_then(|raw| parse_pull_requests(&raw));
    let reason = match (&issues, &pull_requests) {
        (Err(issue_error), Err(pr_error)) => Some(format!(
            "GitHub issue and pull request loading failed. Issues: {issue_error}; PRs: {pr_error}"
        )),
        (Err(error), _) => Some(format!("GitHub issue loading failed: {error}")),
        (_, Err(error)) => Some(format!("GitHub pull request loading failed: {error}")),
        _ => None,
    };
    GithubWorkflowSnapshot {
        schema_version: GITHUB_SCHEMA_VERSION,
        available: true,
        authenticated: true,
        gh_version: Some(version),
        login: Some(login),
        repository: Some(repository.name_with_owner),
        repository_url: Some(repository.url),
        default_branch: repository.default_branch,
        issues: issues.unwrap_or_default(),
        pull_requests: pull_requests.unwrap_or_default(),
        reason,
        fetched_at_unix_ms,
    }
}

fn bounded_required(value: Option<String>, label: &str, limit: usize) -> Result<String, String> {
    let value = value.unwrap_or_default().trim().to_string();
    if value.is_empty() {
        return Err(format!("{label} is required."));
    }
    if value.chars().count() > limit {
        return Err(format!("{label} is too long (maximum {limit} characters)."));
    }
    Ok(value)
}

fn valid_github_login(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 39
        && !value.starts_with('-')
        && !value.ends_with('-')
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn normalize_action(mut action: GithubActionInput) -> Result<GithubActionInput, String> {
    action.kind = action.kind.trim().to_ascii_lowercase();
    action.title = action.title.map(|value| value.trim().to_string());
    action.body = action.body.map(|value| value.trim().to_string());
    action.base = action.base.map(|value| value.trim().to_string());
    action.review_decision = action
        .review_decision
        .map(|value| value.trim().to_ascii_lowercase());
    action.reviewers = action
        .reviewers
        .into_iter()
        .map(|value| value.trim().trim_start_matches('@').to_string())
        .filter(|value| !value.is_empty())
        .collect();
    match action.kind.as_str() {
        "issue.create" | "pr.create" => {
            action.title = Some(bounded_required(action.title, "Title", MAX_TITLE_CHARS)?);
            action.body = Some(bounded_required(action.body, "Body", MAX_BODY_CHARS)?);
        }
        "issue.comment" | "pr.comment" => {
            if action.number.unwrap_or_default() == 0 {
                return Err("Issue or pull request number is required.".to_string());
            }
            action.body = Some(bounded_required(action.body, "Comment", MAX_BODY_CHARS)?);
        }
        "pr.review" => {
            if action.number.unwrap_or_default() == 0 {
                return Err("Pull request number is required.".to_string());
            }
            action.body = Some(bounded_required(
                action.body,
                "Review body",
                MAX_BODY_CHARS,
            )?);
            let decision = action.review_decision.as_deref().unwrap_or("comment");
            if !matches!(decision, "comment" | "approve" | "request_changes") {
                return Err(
                    "Review decision must be comment, approve, or request_changes.".to_string(),
                );
            }
            action.review_decision = Some(decision.to_string());
        }
        "pr.reviewers" => {
            if action.number.unwrap_or_default() == 0 {
                return Err("Pull request number is required.".to_string());
            }
            if action.reviewers.is_empty() || action.reviewers.len() > MAX_REVIEWERS {
                return Err(format!("Choose 1 to {MAX_REVIEWERS} reviewers."));
            }
            if action
                .reviewers
                .iter()
                .any(|login| !valid_github_login(login))
            {
                return Err("A reviewer login is invalid.".to_string());
            }
            action.reviewers.sort();
            action.reviewers.dedup();
        }
        _ => {
            return Err(format!(
                "Unsupported GitHub workflow action: {}",
                action.kind
            ))
        }
    }
    if let Some(base) = &action.base {
        if base.len() > 255
            || base.is_empty()
            || base.starts_with('-')
            || base.contains(char::is_whitespace)
        {
            return Err("The pull request base branch is invalid.".to_string());
        }
    }
    Ok(action)
}

fn action_preview(action: &GithubActionInput, repository: &str) -> String {
    match action.kind.as_str() {
        "issue.create" => format!(
            "Create issue in {repository}\n\nTitle: {}\n\n{}",
            action.title.as_deref().unwrap_or_default(),
            action.body.as_deref().unwrap_or_default()
        ),
        "issue.comment" => format!(
            "Comment on issue #{number} in {repository}\n\n{body}",
            number = action.number.unwrap_or_default(),
            body = action.body.as_deref().unwrap_or_default()
        ),
        "pr.create" => format!(
            "Create {draft}pull request in {repository}{base}\n\nTitle: {title}\n\n{body}",
            draft = if action.draft { "draft " } else { "" },
            base = action
                .base
                .as_ref()
                .map(|base| format!(" targeting {base}"))
                .unwrap_or_default(),
            title = action.title.as_deref().unwrap_or_default(),
            body = action.body.as_deref().unwrap_or_default(),
        ),
        "pr.comment" => format!(
            "Comment on pull request #{number} in {repository}\n\n{body}",
            number = action.number.unwrap_or_default(),
            body = action.body.as_deref().unwrap_or_default()
        ),
        "pr.review" => format!(
            "Submit {decision} review to pull request #{number} in {repository}\n\n{body}",
            decision = action.review_decision.as_deref().unwrap_or("comment"),
            number = action.number.unwrap_or_default(),
            body = action.body.as_deref().unwrap_or_default()
        ),
        "pr.reviewers" => format!(
            "Request review on pull request #{number} in {repository}\n\nReviewers: {reviewers}",
            number = action.number.unwrap_or_default(),
            reviewers = action.reviewers.join(", ")
        ),
        _ => action.kind.clone(),
    }
}

fn action_hash(
    root: &str,
    repository: &str,
    action_id: &str,
    action: &GithubActionInput,
) -> Result<String, String> {
    let serialized = serde_json::to_vec(&(root, repository, action_id, action))
        .map_err(|error| format!("serialize GitHub action approval: {error}"))?;
    let mut hasher = Sha256::new();
    hasher.update(serialized);
    Ok(format!("{:x}", hasher.finalize()))
}

fn cleanup_expired_actions(now: u64, actions: &mut HashMap<String, PreparedActionRecord>) {
    actions.retain(|_, record| record.prepared.expires_at_unix_ms >= now);
}

fn prepare_action(cwd: String, action: GithubActionInput) -> Result<GithubPreparedAction, String> {
    let root = canonical_git_root(&cwd)?;
    gh_version(&root)?;
    authenticated_login(&root)?;
    let repository = repository_identity(&root)?;
    let action = normalize_action(action)?;
    let now = now_unix_ms()?;
    let action_id = Uuid::new_v4().to_string();
    let action_hash = action_hash(&root, &repository.name_with_owner, &action_id, &action)?;
    let prepared = GithubPreparedAction {
        schema_version: GITHUB_SCHEMA_VERSION,
        action_id: action_id.clone(),
        action_hash,
        repository: repository.name_with_owner.clone(),
        kind: action.kind.clone(),
        preview: action_preview(&action, &repository.name_with_owner),
        expires_at_unix_ms: now + APPROVAL_TTL_MS,
    };
    let mut actions = prepared_actions()
        .lock()
        .map_err(|_| "GitHub approval store is unavailable.".to_string())?;
    cleanup_expired_actions(now, &mut actions);
    actions.insert(
        action_id,
        PreparedActionRecord {
            root,
            prepared: prepared.clone(),
            action,
            created_at_unix_ms: now,
        },
    );
    Ok(prepared)
}

fn command_for_action(repository: &str, action: &GithubActionInput) -> Vec<String> {
    let mut args = match action.kind.as_str() {
        "issue.create" => vec![
            "issue".into(),
            "create".into(),
            "--repo".into(),
            repository.into(),
            "--title".into(),
            action.title.clone().unwrap_or_default(),
            "--body".into(),
            action.body.clone().unwrap_or_default(),
        ],
        "issue.comment" => vec![
            "issue".into(),
            "comment".into(),
            action.number.unwrap_or_default().to_string(),
            "--repo".into(),
            repository.into(),
            "--body".into(),
            action.body.clone().unwrap_or_default(),
        ],
        "pr.create" => {
            let mut args = vec![
                "pr".into(),
                "create".into(),
                "--repo".into(),
                repository.into(),
                "--title".into(),
                action.title.clone().unwrap_or_default(),
                "--body".into(),
                action.body.clone().unwrap_or_default(),
            ];
            if let Some(base) = &action.base {
                args.extend(["--base".into(), base.clone()]);
            }
            if action.draft {
                args.push("--draft".into());
            }
            args
        }
        "pr.comment" => vec![
            "pr".into(),
            "comment".into(),
            action.number.unwrap_or_default().to_string(),
            "--repo".into(),
            repository.into(),
            "--body".into(),
            action.body.clone().unwrap_or_default(),
        ],
        "pr.review" => {
            let decision = match action.review_decision.as_deref() {
                Some("approve") => "--approve",
                Some("request_changes") => "--request-changes",
                _ => "--comment",
            };
            vec![
                "pr".into(),
                "review".into(),
                action.number.unwrap_or_default().to_string(),
                "--repo".into(),
                repository.into(),
                decision.into(),
                "--body".into(),
                action.body.clone().unwrap_or_default(),
            ]
        }
        "pr.reviewers" => vec![
            "pr".into(),
            "edit".into(),
            action.number.unwrap_or_default().to_string(),
            "--repo".into(),
            repository.into(),
        ],
        _ => Vec::new(),
    };
    if action.kind == "pr.reviewers" {
        for reviewer in &action.reviewers {
            args.extend(["--add-reviewer".into(), reviewer.clone()]);
        }
    }
    args
}

fn receipt_root() -> Result<PathBuf, String> {
    let root = crate::control_plane::application_data_dir()?
        .join("github-workflows")
        .join(format!("v{GITHUB_SCHEMA_VERSION}"))
        .join("receipts");
    fs::create_dir_all(&root)
        .map_err(|error| format!("create GitHub workflow receipt directory: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("secure GitHub workflow receipt directory: {error}"))?;
    }
    Ok(root)
}

fn write_receipt(receipt: &GithubActionReceipt) -> Result<(), String> {
    let path = receipt_root()?.join(format!("{}.json", receipt.receipt_id));
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let content = serde_json::to_vec_pretty(receipt)
        .map_err(|error| format!("serialize GitHub workflow receipt: {error}"))?;
    fs::write(&temp, content)
        .map_err(|error| format!("write GitHub workflow receipt {}: {error}", temp.display()))?;
    crate::chmod_600(&temp);
    fs::rename(&temp, &path).map_err(|error| {
        format!(
            "publish GitHub workflow receipt {}: {error}",
            path.display()
        )
    })?;
    crate::chmod_600(&path);
    Ok(())
}

fn execute_action(action_id: String, expected_hash: String) -> Result<GithubActionReceipt, String> {
    let now = now_unix_ms()?;
    let record = {
        let mut actions = prepared_actions()
            .lock()
            .map_err(|_| "GitHub approval store is unavailable.".to_string())?;
        cleanup_expired_actions(now, &mut actions);
        let record = actions
            .remove(&action_id)
            .ok_or_else(|| "GitHub approval is missing, expired, or already used.".to_string())?;
        if record.prepared.action_hash != expected_hash {
            return Err("GitHub approval hash does not match the prepared action.".to_string());
        }
        record
    };
    let current_repository = repository_identity(&record.root)?;
    if current_repository.name_with_owner != record.prepared.repository {
        return Err(
            "The GitHub repository changed after approval. Prepare the action again.".to_string(),
        );
    }
    let args = command_for_action(&record.prepared.repository, &record.action);
    if args.is_empty() {
        return Err("The prepared GitHub command is invalid.".to_string());
    }
    let output = run_gh(&record.root, &args)?;
    let completed_at_unix_ms = now_unix_ms()?;
    let success = output.success;
    let error = (!success).then(|| non_empty_error(&output, "GitHub action failed."));
    let url = output
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("https://"))
        .map(str::to_string);
    let summary = if success {
        output
            .stdout
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("GitHub action completed.")
            .trim()
            .chars()
            .take(2_000)
            .collect()
    } else {
        "GitHub action failed.".to_string()
    };
    let receipt = GithubActionReceipt {
        schema_version: GITHUB_SCHEMA_VERSION,
        receipt_id: Uuid::new_v4().to_string(),
        action_id: record.prepared.action_id,
        action_hash: record.prepared.action_hash,
        repository: record.prepared.repository,
        kind: record.prepared.kind,
        status: if success { "succeeded" } else { "failed" }.to_string(),
        summary,
        url,
        error,
        created_at_unix_ms: record.created_at_unix_ms,
        completed_at_unix_ms,
    };
    write_receipt(&receipt)?;
    Ok(receipt)
}

fn read_receipts(limit: Option<usize>) -> Result<Vec<GithubActionReceipt>, String> {
    let root = receipt_root()?;
    let mut receipts = Vec::new();
    for entry in
        fs::read_dir(&root).map_err(|error| format!("list GitHub workflow receipts: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("read GitHub workflow receipt entry: {error}"))?;
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let content = match fs::read(entry.path()) {
            Ok(content) => content,
            Err(_) => continue,
        };
        if let Ok(receipt) = serde_json::from_slice::<GithubActionReceipt>(&content) {
            receipts.push(receipt);
        }
    }
    receipts.sort_by_key(|receipt| std::cmp::Reverse(receipt.completed_at_unix_ms));
    receipts.truncate(limit.unwrap_or(20).clamp(1, 100));
    Ok(receipts)
}

#[tauri::command]
pub async fn github_workflow_snapshot(
    cwd: String,
    limit: Option<usize>,
) -> Result<GithubWorkflowSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || snapshot(cwd, limit))
        .await
        .map_err(|error| format!("GitHub workflow snapshot thread join: {error}"))
}

#[tauri::command]
pub async fn github_workflow_prepare(
    cwd: String,
    action: GithubActionInput,
) -> Result<GithubPreparedAction, String> {
    tauri::async_runtime::spawn_blocking(move || prepare_action(cwd, action))
        .await
        .map_err(|error| format!("GitHub workflow prepare thread join: {error}"))?
}

#[tauri::command]
pub async fn github_workflow_execute(
    action_id: String,
    expected_hash: String,
) -> Result<GithubActionReceipt, String> {
    tauri::async_runtime::spawn_blocking(move || execute_action(action_id, expected_hash))
        .await
        .map_err(|error| format!("GitHub workflow execute thread join: {error}"))?
}

#[tauri::command]
pub async fn github_workflow_discard(action_id: String) -> Result<(), String> {
    let mut actions = prepared_actions()
        .lock()
        .map_err(|_| "GitHub approval store is unavailable.".to_string())?;
    actions.remove(&action_id);
    Ok(())
}

#[tauri::command]
pub async fn github_workflow_receipts(
    limit: Option<usize>,
) -> Result<Vec<GithubActionReceipt>, String> {
    tauri::async_runtime::spawn_blocking(move || read_receipts(limit))
        .await
        .map_err(|error| format!("GitHub workflow receipts thread join: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_issues_without_trusting_unknown_fields() {
        let issues = parse_issues(
            r#"[{"number":12,"title":"Fix auth","state":"OPEN","url":"https://example/12","author":{"login":"octo"},"updatedAt":"2026-01-01","labels":[{"name":"bug"}]}]"#,
        )
        .expect("issues");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].number, 12);
        assert_eq!(issues[0].labels, vec!["bug"]);
    }

    #[test]
    fn parses_pull_request_check_rollup() {
        let pulls = parse_pull_requests(
            r#"[{"number":3,"title":"Ship","state":"OPEN","url":"https://example/3","author":{"login":"octo"},"headRefName":"feature","baseRefName":"main","isDraft":false,"updatedAt":"2026-01-01","reviewDecision":"REVIEW_REQUIRED","reviewRequests":[{"login":"reviewer"}],"statusCheckRollup":[{"conclusion":"SUCCESS"},{"conclusion":"FAILURE"},{"state":"PENDING"}]}]"#,
        )
        .expect("pulls");
        assert_eq!(pulls[0].checks_total, 3);
        assert_eq!(pulls[0].checks_success, 1);
        assert_eq!(pulls[0].checks_failure, 1);
        assert_eq!(pulls[0].reviewers, vec!["reviewer"]);
    }

    #[test]
    fn normalizes_only_allowlisted_mutations() {
        let issue = normalize_action(GithubActionInput {
            kind: " ISSUE.CREATE ".into(),
            number: None,
            title: Some(" Title ".into()),
            body: Some(" Body ".into()),
            base: None,
            reviewers: Vec::new(),
            review_decision: None,
            draft: false,
        })
        .expect("issue");
        assert_eq!(issue.kind, "issue.create");
        assert_eq!(issue.title.as_deref(), Some("Title"));
        assert!(normalize_action(GithubActionInput {
            kind: "shell.execute".into(),
            number: None,
            title: None,
            body: None,
            base: None,
            reviewers: Vec::new(),
            review_decision: None,
            draft: false,
        })
        .is_err());
    }

    #[test]
    fn reviewer_logins_are_constrained() {
        assert!(valid_github_login("octo-user"));
        assert!(!valid_github_login("-octo"));
        assert!(!valid_github_login("octo/user"));
    }

    #[test]
    fn prepared_hash_changes_with_payload() {
        let base = GithubActionInput {
            kind: "issue.comment".into(),
            number: Some(1),
            title: None,
            body: Some("one".into()),
            base: None,
            reviewers: Vec::new(),
            review_decision: None,
            draft: false,
        };
        let first = action_hash("/repo", "owner/repo", "id", &base).expect("hash");
        let mut changed = base;
        changed.body = Some("two".into());
        let second = action_hash("/repo", "owner/repo", "id", &changed).expect("hash");
        assert_ne!(first, second);
    }
}
