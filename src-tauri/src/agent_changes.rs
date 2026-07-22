use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::hash::{Hash, Hasher};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::agent_git::{git_root, run_git, status_facets, status_label, status_map, status_path};

#[derive(Serialize, Clone)]
pub struct AgentChangedFile {
    path: String,
    status: String,
    index_status: String,
    worktree_status: String,
    staged: bool,
    unstaged: bool,
    additions: u64,
    deletions: u64,
    binary: bool,
    diff: String,
}

#[derive(Serialize, Clone)]
pub struct AgentChangeSummary {
    cwd: String,
    is_git: bool,
    scope: String,
    files: Vec<AgentChangedFile>,
    additions: u64,
    deletions: u64,
    patch: String,
}

#[derive(Serialize, Clone)]
pub struct AgentChangeBaseline {
    id: String,
    cwd: String,
    is_git: bool,
}

#[derive(Clone)]
struct BaselineFileState {
    exists: bool,
    bytes: Option<Vec<u8>>,
    hash: u64,
    binary: bool,
}

#[derive(Clone)]
struct ChangeBaselineSnapshot {
    root: String,
    files: BTreeMap<String, BaselineFileState>,
}

static CHANGE_BASELINES: OnceLock<Mutex<HashMap<String, ChangeBaselineSnapshot>>> = OnceLock::new();

fn change_baselines() -> &'static Mutex<HashMap<String, ChangeBaselineSnapshot>> {
    CHANGE_BASELINES.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(target_os = "windows")]
fn configure_windows_background_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

fn count_text_lines(root: &str, path: &str) -> u64 {
    let path = std::path::Path::new(root).join(path);
    let Ok(meta) = std::fs::metadata(&path) else {
        return 0;
    };
    if !meta.is_file() || meta.len() > 512 * 1024 {
        return 0;
    }
    let Ok(text) = std::fs::read_to_string(path) else {
        return 0;
    };
    text.lines().count() as u64
}

fn hash_bytes(bytes: &[u8]) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}

fn is_probably_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8192).any(|b| *b == 0)
}

fn capture_file_state(root: &str, path: &str) -> BaselineFileState {
    const MAX_BASELINE_BYTES: u64 = 2 * 1024 * 1024;
    let full_path = std::path::Path::new(root).join(path);
    let Ok(meta) = std::fs::metadata(&full_path) else {
        return BaselineFileState {
            exists: false,
            bytes: None,
            hash: 0,
            binary: false,
        };
    };
    if !meta.is_file() || meta.len() > MAX_BASELINE_BYTES {
        let marker = format!(
            "{}:{}",
            meta.len(),
            meta.modified()
                .ok()
                .and_then(|modified| {
                    modified
                        .duration_since(UNIX_EPOCH)
                        .ok()
                        .map(|duration| duration.as_nanos())
                })
                .unwrap_or_default()
        );
        return BaselineFileState {
            exists: true,
            bytes: None,
            hash: hash_bytes(marker.as_bytes()),
            binary: true,
        };
    }
    let bytes = std::fs::read(&full_path).unwrap_or_default();
    let binary = is_probably_binary(&bytes);
    let hash = hash_bytes(&bytes);
    BaselineFileState {
        exists: true,
        bytes: Some(bytes),
        hash,
        binary,
    }
}

fn file_state_equal(a: &BaselineFileState, b: &BaselineFileState) -> bool {
    a.exists == b.exists && a.hash == b.hash
}

fn capture_change_baseline(cwd: Option<String>) -> Result<AgentChangeBaseline, String> {
    const MAX_BASELINE_DIRTY_FILES: usize = 200;
    let root = match git_root(cwd) {
        Ok(root) => root,
        Err(_) => {
            return Ok(AgentChangeBaseline {
                id: String::new(),
                cwd: ".".to_string(),
                is_git: false,
            });
        }
    };
    let current_status = status_map(&root)?;
    if current_status.len() > MAX_BASELINE_DIRTY_FILES {
        return Ok(AgentChangeBaseline {
            id: String::new(),
            cwd: root,
            is_git: true,
        });
    }
    let mut files = BTreeMap::new();
    for path in current_status.keys() {
        files.insert(path.clone(), capture_file_state(&root, path));
    }
    let id = format!(
        "baseline-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let mut baselines = change_baselines()
        .lock()
        .map_err(|e| format!("change baseline lock: {e}"))?;
    baselines.insert(
        id.clone(),
        ChangeBaselineSnapshot {
            root: root.clone(),
            files,
        },
    );
    while baselines.len() > 64 {
        if let Some(first) = baselines.keys().next().cloned() {
            baselines.remove(&first);
        } else {
            break;
        }
    }
    Ok(AgentChangeBaseline {
        id,
        cwd: root,
        is_git: true,
    })
}

fn clip_diff(diff: String) -> String {
    const MAX_DIFF_CHARS: usize = 14_000;
    if diff.chars().count() <= MAX_DIFF_CHARS {
        return diff;
    }
    let clipped = diff.chars().take(MAX_DIFF_CHARS).collect::<String>();
    format!("{clipped}\n... diff truncated ...")
}

fn run_unified_diff(
    label_old: &str,
    old: &[u8],
    label_new: &str,
    new: &[u8],
) -> (u64, u64, String) {
    if is_probably_binary(old) || is_probably_binary(new) {
        return (0, 0, "Binary file changed".to_string());
    }
    let temp_dir = std::env::temp_dir().join(format!(
        "atelier-diff-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    if std::fs::create_dir_all(&temp_dir).is_err() {
        return line_delta_summary(old, new);
    }
    let old_path = temp_dir.join("old");
    let new_path = temp_dir.join("new");
    let wrote = std::fs::write(&old_path, old).is_ok() && std::fs::write(&new_path, new).is_ok();
    let output = if wrote {
        let mut command = Command::new("diff");
        #[cfg(target_os = "windows")]
        configure_windows_background_command(&mut command);
        command
            .arg("-u")
            .arg("-L")
            .arg(label_old)
            .arg("-L")
            .arg(label_new)
            .arg(&old_path)
            .arg(&new_path)
            .output()
            .ok()
    } else {
        None
    };
    let _ = std::fs::remove_dir_all(&temp_dir);
    let Some(output) = output else {
        return line_delta_summary(old, new);
    };
    if !matches!(output.status.code(), Some(0) | Some(1)) {
        return line_delta_summary(old, new);
    }
    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    let mut additions = 0;
    let mut deletions = 0;
    for line in diff.lines() {
        if line.starts_with("+++") || line.starts_with("---") {
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
        } else if line.starts_with('-') {
            deletions += 1;
        }
    }
    (additions, deletions, clip_diff(diff))
}

fn line_delta_summary(old: &[u8], new: &[u8]) -> (u64, u64, String) {
    let old_text = String::from_utf8_lossy(old);
    let new_text = String::from_utf8_lossy(new);
    let old_lines = old_text.lines().count() as i64;
    let new_lines = new_text.lines().count() as i64;
    let additions = (new_lines - old_lines).max(0) as u64;
    let deletions = (old_lines - new_lines).max(0) as u64;
    (
        additions,
        deletions,
        "Diff omitted; file changed after the run baseline.".to_string(),
    )
}

fn changed_file_from_head(root: &str, path: String, raw_status: String) -> AgentChangedFile {
    let status = status_label(raw_status.trim());
    let (index_status, worktree_status, staged, unstaged) = status_facets(&raw_status);
    let mut file = AgentChangedFile {
        path: path.clone(),
        status: status.clone(),
        index_status,
        worktree_status,
        staged,
        unstaged,
        additions: 0,
        deletions: 0,
        binary: false,
        diff: String::new(),
    };
    if status == "untracked" {
        file.additions = count_text_lines(root, &path);
        return file;
    }
    let numstat = run_git(root, &["diff", "--numstat", "HEAD", "--", &path]).unwrap_or_default();
    for line in numstat.lines() {
        let mut parts = line.splitn(3, '\t');
        let add_raw = parts.next().unwrap_or_default();
        let del_raw = parts.next().unwrap_or_default();
        let binary = add_raw == "-" || del_raw == "-";
        file.additions = file
            .additions
            .saturating_add(add_raw.parse::<u64>().unwrap_or(0));
        file.deletions = file
            .deletions
            .saturating_add(del_raw.parse::<u64>().unwrap_or(0));
        file.binary = file.binary || binary;
    }
    file.diff = clip_diff(
        run_git(root, &["diff", "--color=never", "HEAD", "--", &path]).unwrap_or_default(),
    );
    file
}

fn build_change_summary_since_baseline(
    cwd: Option<String>,
    baseline: ChangeBaselineSnapshot,
) -> Result<AgentChangeSummary, String> {
    let root = match git_root(cwd) {
        Ok(root) => root,
        Err(_) => return Ok(non_git_summary()),
    };
    if root != baseline.root {
        return build_change_summary(Some(root));
    }

    let current_status = status_map(&root)?;
    let mut paths = current_status.keys().cloned().collect::<BTreeSet<_>>();
    for path in baseline.files.keys() {
        paths.insert(path.clone());
    }

    let mut files = Vec::new();
    let mut patch_parts = Vec::new();
    for path in paths {
        let current_state = capture_file_state(&root, &path);
        if let Some(base_state) = baseline.files.get(&path) {
            if file_state_equal(base_state, &current_state) {
                continue;
            }
            let status = if !current_state.exists {
                "deleted"
            } else if !base_state.exists {
                "added"
            } else {
                "modified"
            };
            let binary = base_state.binary || current_state.binary;
            let (additions, deletions, diff) =
                match (&base_state.bytes, &current_state.bytes, binary) {
                    (Some(old), Some(new), false) => {
                        run_unified_diff(&format!("a/{path}"), old, &format!("b/{path}"), new)
                    }
                    (Some(old), None, false) => {
                        run_unified_diff(&format!("a/{path}"), old, &format!("b/{path}"), b"")
                    }
                    (None, Some(new), false) => {
                        run_unified_diff(&format!("a/{path}"), b"", &format!("b/{path}"), new)
                    }
                    _ => (
                        0,
                        0,
                        "Binary or large file changed after the run baseline.".to_string(),
                    ),
                };
            if !binary && !diff.trim().is_empty() && !diff.contains("Binary file changed") {
                patch_parts.push(diff.clone());
            }
            let (index_status, worktree_status, staged, unstaged) = current_status
                .get(&path)
                .map(|raw| status_facets(raw))
                .unwrap_or_else(|| (String::new(), "M".to_string(), false, true));
            files.push(AgentChangedFile {
                path: path.clone(),
                status: status.to_string(),
                index_status,
                worktree_status,
                staged,
                unstaged,
                additions,
                deletions,
                binary,
                diff,
            });
        } else if let Some(raw_status) = current_status.get(&path) {
            let file = changed_file_from_head(&root, path.clone(), raw_status.clone());
            if !file.diff.trim().is_empty() {
                patch_parts.push(file.diff.clone());
            }
            files.push(file);
        }
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));
    let additions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();
    Ok(AgentChangeSummary {
        cwd: root,
        is_git: true,
        scope: "run".to_string(),
        files,
        additions,
        deletions,
        patch: patch_parts.join("\n"),
    })
}

fn non_git_summary() -> AgentChangeSummary {
    AgentChangeSummary {
        cwd: ".".to_string(),
        is_git: false,
        scope: "workspace".to_string(),
        files: Vec::new(),
        additions: 0,
        deletions: 0,
        patch: String::new(),
    }
}

fn build_change_summary(cwd: Option<String>) -> Result<AgentChangeSummary, String> {
    let root = match git_root(cwd) {
        Ok(root) => root,
        Err(_) => return Ok(non_git_summary()),
    };

    let status = run_git(
        &root,
        &["status", "--porcelain=v1", "--untracked-files=all"],
    )?;
    let mut files: BTreeMap<String, AgentChangedFile> = BTreeMap::new();
    for line in status.lines().filter(|line| !line.trim().is_empty()) {
        let Some((raw_status, path)) = status_path(line) else {
            continue;
        };
        files.entry(path.clone()).or_insert_with(|| {
            let (index_status, worktree_status, staged, unstaged) = status_facets(&raw_status);
            AgentChangedFile {
                path,
                status: status_label(raw_status.trim()),
                index_status,
                worktree_status,
                staged,
                unstaged,
                additions: 0,
                deletions: 0,
                binary: false,
                diff: String::new(),
            }
        });
    }

    let numstat = run_git(&root, &["diff", "--numstat", "HEAD", "--"]).unwrap_or_default();
    for line in numstat.lines() {
        let mut parts = line.splitn(3, '\t');
        let add_raw = parts.next().unwrap_or_default();
        let del_raw = parts.next().unwrap_or_default();
        let Some(path) = parts.next() else { continue };
        let binary = add_raw == "-" || del_raw == "-";
        let additions = add_raw.parse::<u64>().unwrap_or(0);
        let deletions = del_raw.parse::<u64>().unwrap_or(0);
        let entry = files
            .entry(path.to_string())
            .or_insert_with(|| AgentChangedFile {
                path: path.to_string(),
                status: "modified".to_string(),
                index_status: String::new(),
                worktree_status: "M".to_string(),
                staged: false,
                unstaged: true,
                additions: 0,
                deletions: 0,
                binary,
                diff: String::new(),
            });
        entry.additions = entry.additions.saturating_add(additions);
        entry.deletions = entry.deletions.saturating_add(deletions);
        entry.binary = entry.binary || binary;
    }

    for file in files.values_mut() {
        if file.status == "untracked" {
            file.additions = count_text_lines(&root, &file.path);
            continue;
        }
        file.diff = clip_diff(
            run_git(&root, &["diff", "--color=never", "HEAD", "--", &file.path])
                .unwrap_or_default(),
        );
    }

    let mut files = files.into_values().collect::<Vec<_>>();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let additions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();
    let patch = run_git(&root, &["diff", "--binary", "HEAD", "--"]).unwrap_or_default();

    Ok(AgentChangeSummary {
        cwd: root,
        is_git: true,
        scope: "workspace".to_string(),
        files,
        additions,
        deletions,
        patch,
    })
}

#[tauri::command]
pub async fn agent_change_baseline(cwd: Option<String>) -> Result<AgentChangeBaseline, String> {
    tauri::async_runtime::spawn_blocking(move || capture_change_baseline(cwd))
        .await
        .map_err(|e| format!("change baseline thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_change_summary(
    cwd: Option<String>,
    baseline_id: Option<String>,
) -> Result<AgentChangeSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let baseline = baseline_id
            .filter(|id| !id.trim().is_empty())
            .and_then(|id| change_baselines().lock().ok()?.remove(&id));
        if let Some(baseline) = baseline {
            build_change_summary_since_baseline(cwd, baseline)
        } else {
            build_change_summary(cwd)
        }
    })
    .await
    .map_err(|e| format!("change summary thread join: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_repo(name: &str) -> (std::path::PathBuf, String) {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("atelier-{name}-{}-{stamp}", std::process::id()));
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
        (root, root_string)
    }

    #[test]
    fn workspace_summary_reports_tracked_and_untracked_changes() {
        let (root, root_string) = test_repo("change-summary");
        fs::write(root.join("tracked.txt"), "one\ntwo\n").unwrap();
        fs::write(root.join("new.txt"), "new\n").unwrap();

        let summary = build_change_summary(Some(root_string)).unwrap();
        assert!(summary.is_git);
        assert_eq!(summary.scope, "workspace");
        assert_eq!(summary.files.len(), 2);
        assert!(summary.files.iter().any(|file| file.path == "tracked.txt"));
        assert!(summary.files.iter().any(|file| file.path == "new.txt"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn run_baseline_reports_only_changes_made_after_capture() {
        let (root, root_string) = test_repo("change-baseline");
        fs::write(root.join("existing-dirty.txt"), "before\n").unwrap();
        let baseline = capture_change_baseline(Some(root_string.clone())).unwrap();
        let snapshot = change_baselines()
            .lock()
            .unwrap()
            .remove(&baseline.id)
            .unwrap();

        fs::write(root.join("tracked.txt"), "one\nafter\n").unwrap();
        let summary = build_change_summary_since_baseline(Some(root_string), snapshot).unwrap();
        assert_eq!(summary.scope, "run");
        assert_eq!(summary.files.len(), 1);
        assert_eq!(summary.files[0].path, "tracked.txt");

        fs::remove_dir_all(root).unwrap();
    }
}
