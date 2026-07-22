use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct AgentGitCommit {
    hash: String,
    short_hash: String,
    subject: String,
    author: String,
    timestamp: u64,
}

#[derive(Serialize, Clone)]
pub struct AgentGitState {
    root: String,
    branch: String,
    head: String,
    upstream: Option<String>,
    ahead: u64,
    behind: u64,
    staged_count: usize,
    unstaged_count: usize,
    untracked_count: usize,
    recent_commits: Vec<AgentGitCommit>,
}

#[cfg(target_os = "windows")]
fn configure_windows_background_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

pub(crate) fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("git");
    #[cfg(target_os = "windows")]
    configure_windows_background_command(&mut command);
    let output = command
        .arg("-C")
        .arg(root)
        .args(args)
        .env("PATH", crate::augmented_cli_path())
        .output()
        .map_err(|e| format!("git {}: {e}", args.join(" ")))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_git_with_input(root: &str, args: &[&str], input: &str) -> Result<(), String> {
    let mut command = Command::new("git");
    #[cfg(target_os = "windows")]
    configure_windows_background_command(&mut command);
    let mut child = command
        .arg("-C")
        .arg(root)
        .args(args)
        .env("PATH", crate::augmented_cli_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("git {}: {e}", args.join(" ")))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input.as_bytes())
            .map_err(|e| format!("git apply stdin: {e}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("git wait: {e}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

pub(crate) fn git_root(cwd: Option<String>) -> Result<String, String> {
    let cwd = cwd
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| ".".to_string());
    run_git(&cwd, &["rev-parse", "--show-toplevel"]).map(|s| s.trim().to_string())
}

pub(crate) fn status_label(raw: &str) -> String {
    if raw == "??" {
        return "untracked".to_string();
    }
    if raw.contains('R') {
        return "renamed".to_string();
    }
    if raw.contains('D') {
        return "deleted".to_string();
    }
    if raw.contains('A') {
        return "added".to_string();
    }
    "modified".to_string()
}

pub(crate) fn status_facets(raw: &str) -> (String, String, bool, bool) {
    let mut chars = raw.chars();
    let index = chars.next().unwrap_or(' ');
    let worktree = chars.next().unwrap_or(' ');
    let untracked = index == '?' && worktree == '?';
    (
        if index == ' ' {
            String::new()
        } else {
            index.to_string()
        },
        if worktree == ' ' {
            String::new()
        } else {
            worktree.to_string()
        },
        !untracked && index != ' ',
        untracked || worktree != ' ',
    )
}

fn is_safe_git_relative_path(path: &str) -> bool {
    let parsed = Path::new(path);
    !path.trim().is_empty()
        && !parsed.is_absolute()
        && !parsed.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
}

fn validate_git_paths(root: &str, paths: Vec<String>) -> Result<Vec<String>, String> {
    const MAX_PATHS_PER_OPERATION: usize = 200;
    if paths.is_empty() {
        return Err("Select at least one changed file.".to_string());
    }
    if paths.len() > MAX_PATHS_PER_OPERATION {
        return Err(format!(
            "A single Git operation can include at most {MAX_PATHS_PER_OPERATION} files."
        ));
    }
    let current = status_map(root)?;
    let mut validated = Vec::with_capacity(paths.len());
    let mut seen = BTreeSet::new();
    for path in paths {
        let normalized = path.trim().replace('\\', "/");
        if !is_safe_git_relative_path(&normalized) {
            return Err(format!("Unsafe Git path: {path}"));
        }
        if !current.contains_key(&normalized) {
            return Err(format!("The file is no longer changed: {normalized}"));
        }
        if seen.insert(normalized.clone()) {
            validated.push(normalized);
        }
    }
    Ok(validated)
}

pub(crate) fn status_path(line: &str) -> Option<(String, String)> {
    if line.len() < 4 {
        return None;
    }
    let status = line.get(0..2)?.to_string();
    let path = line
        .get(3..)?
        .rsplit(" -> ")
        .next()?
        .trim_matches('"')
        .to_string();
    Some((status, path))
}

pub(crate) fn status_map(root: &str) -> Result<BTreeMap<String, String>, String> {
    let status = run_git(root, &["status", "--porcelain=v1", "--untracked-files=all"])?;
    let mut files = BTreeMap::new();
    for line in status.lines().filter(|line| !line.trim().is_empty()) {
        let Some((raw_status, path)) = status_path(line) else {
            continue;
        };
        files.insert(path, raw_status);
    }
    Ok(files)
}

fn build_git_state(cwd: String, limit: Option<usize>) -> Result<AgentGitState, String> {
    let root = git_root(Some(cwd))?;
    let statuses = status_map(&root)?;
    let branch = run_git(&root, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|_| "HEAD".to_string());
    let head = run_git(&root, &["rev-parse", "--short", "HEAD"])
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    let upstream = run_git(
        &root,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )
    .ok()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());
    let (ahead, behind) = if upstream.is_some() {
        run_git(
            &root,
            &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        )
        .ok()
        .and_then(|value| {
            let mut counts = value.split_whitespace();
            Some((counts.next()?.parse().ok()?, counts.next()?.parse().ok()?))
        })
        .unwrap_or((0, 0))
    } else {
        (0, 0)
    };
    let mut staged_count = 0;
    let mut unstaged_count = 0;
    let mut untracked_count = 0;
    for raw in statuses.values() {
        let (_, _, staged, unstaged) = status_facets(raw);
        staged_count += usize::from(staged);
        unstaged_count += usize::from(unstaged);
        untracked_count += usize::from(raw == "??");
    }

    let log_limit = limit.unwrap_or(12).clamp(1, 50).to_string();
    let recent_commits = if head.is_empty() {
        Vec::new()
    } else {
        run_git(
            &root,
            &[
                "log",
                "--date-order",
                "--pretty=format:%H%x1f%h%x1f%an%x1f%at%x1f%s%x1e",
                "-n",
                &log_limit,
            ],
        )
        .unwrap_or_default()
        .split('\u{1e}')
        .filter_map(|record| {
            let record = record.trim();
            if record.is_empty() {
                return None;
            }
            let mut fields = record.split('\u{1f}');
            Some(AgentGitCommit {
                hash: fields.next()?.to_string(),
                short_hash: fields.next()?.to_string(),
                author: fields.next()?.to_string(),
                timestamp: fields.next()?.parse().ok()?,
                subject: fields.next().unwrap_or_default().to_string(),
            })
        })
        .collect()
    };

    Ok(AgentGitState {
        root,
        branch,
        head,
        upstream,
        ahead,
        behind,
        staged_count,
        unstaged_count,
        untracked_count,
        recent_commits,
    })
}

#[tauri::command]
pub async fn agent_git_state(
    cwd: String,
    limit: Option<usize>,
) -> std::result::Result<AgentGitState, String> {
    tauri::async_runtime::spawn_blocking(move || build_git_state(cwd, limit))
        .await
        .map_err(|e| format!("git state thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_git_stage(
    cwd: String,
    paths: Vec<String>,
) -> std::result::Result<AgentGitState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = git_root(Some(cwd))?;
        let paths = validate_git_paths(&root, paths)?;
        let mut args = vec!["add", "--"];
        args.extend(paths.iter().map(String::as_str));
        run_git(&root, &args)?;
        build_git_state(root, None)
    })
    .await
    .map_err(|e| format!("git stage thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_git_unstage(
    cwd: String,
    paths: Vec<String>,
) -> std::result::Result<AgentGitState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = git_root(Some(cwd))?;
        let paths = validate_git_paths(&root, paths)?;
        let has_head = run_git(&root, &["rev-parse", "--verify", "HEAD"]).is_ok();
        let mut args = if has_head {
            vec!["restore", "--staged", "--"]
        } else {
            vec!["rm", "--cached", "--ignore-unmatch", "--"]
        };
        args.extend(paths.iter().map(String::as_str));
        run_git(&root, &args)?;
        build_git_state(root, None)
    })
    .await
    .map_err(|e| format!("git unstage thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_git_commit(
    cwd: String,
    message: String,
) -> std::result::Result<AgentGitState, String> {
    let message = message.trim().to_string();
    if message.is_empty() {
        return Err("Enter a commit message.".to_string());
    }
    if message.chars().count() > 2_000 {
        return Err("The commit message is too long.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let root = git_root(Some(cwd))?;
        let state = build_git_state(root.clone(), None)?;
        if state.staged_count == 0 {
            return Err("Stage at least one file before committing.".to_string());
        }
        run_git(
            &root,
            &["-c", "commit.gpgSign=false", "commit", "-m", &message],
        )?;
        build_git_state(root, None)
    })
    .await
    .map_err(|e| format!("git commit thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_undo_changes(cwd: String, patch: String) -> Result<(), String> {
    if patch.trim().is_empty() {
        return Err("empty patch".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let root = git_root(Some(cwd))?;
        run_git_with_input(&root, &["apply", "-R", "--whitespace=nowarn", "-"], &patch)
    })
    .await
    .map_err(|e| format!("undo thread join: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn git_status_facets_distinguish_index_and_worktree() {
        assert_eq!(
            status_facets("M "),
            ("M".to_string(), String::new(), true, false)
        );
        assert_eq!(
            status_facets(" M"),
            (String::new(), "M".to_string(), false, true)
        );
        assert_eq!(
            status_facets("MM"),
            ("M".to_string(), "M".to_string(), true, true)
        );
        assert_eq!(
            status_facets("??"),
            ("?".to_string(), "?".to_string(), false, true)
        );
    }

    #[test]
    fn git_operation_paths_reject_traversal_and_absolute_paths() {
        assert!(is_safe_git_relative_path("src/components/App.tsx"));
        assert!(!is_safe_git_relative_path("../secrets.env"));
        assert!(!is_safe_git_relative_path("src/../../secrets.env"));
        assert!(!is_safe_git_relative_path("/etc/passwd"));
        assert!(!is_safe_git_relative_path(""));
    }

    #[test]
    fn git_state_reports_staged_unstaged_and_history() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("atelier-git-state-{}-{stamp}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let root_string = root.to_string_lossy().to_string();
        run_git(&root_string, &["init"]).unwrap();
        run_git(&root_string, &["config", "user.name", "Atelier Test"]).unwrap();
        run_git(
            &root_string,
            &["config", "user.email", "atelier-test@example.invalid"],
        )
        .unwrap();
        fs::write(root.join("tracked.txt"), "one\n").unwrap();
        run_git(&root_string, &["add", "--", "tracked.txt"]).unwrap();
        run_git(
            &root_string,
            &["-c", "commit.gpgSign=false", "commit", "-m", "initial"],
        )
        .unwrap();

        fs::write(root.join("tracked.txt"), "one\ntwo\n").unwrap();
        fs::write(root.join("new.txt"), "new\n").unwrap();
        let state = build_git_state(root_string.clone(), Some(5)).unwrap();
        assert_eq!(state.staged_count, 0);
        assert_eq!(state.unstaged_count, 2);
        assert_eq!(state.untracked_count, 1);
        assert_eq!(state.recent_commits.len(), 1);

        let paths = validate_git_paths(&root_string, vec!["tracked.txt".to_string()]).unwrap();
        let mut args = vec!["add", "--"];
        args.extend(paths.iter().map(String::as_str));
        run_git(&root_string, &args).unwrap();
        let state = build_git_state(root_string.clone(), Some(5)).unwrap();
        assert_eq!(state.staged_count, 1);
        assert_eq!(state.unstaged_count, 1);

        fs::remove_dir_all(root).unwrap();
    }
}
