use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub(crate) struct AgentWorktreeInfo {
    source_cwd: String,
    worktree_cwd: String,
    branch: String,
    head: String,
    created: bool,
    source_dirty: bool,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct AgentWorktreeAdoptResult {
    source_cwd: String,
    worktree_cwd: String,
    branch: String,
    base_head: String,
    file_count: usize,
    additions: u64,
    deletions: u64,
    source_dirty_before: bool,
    receipt_path: String,
}

fn hash_value(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn safe_task_slug(value: &str) -> String {
    let mut slug = String::with_capacity(value.len().min(40));
    let mut previous_dash = false;
    for ch in value.chars() {
        let normalized = if ch.is_ascii_alphanumeric() {
            Some(ch.to_ascii_lowercase())
        } else if ch == '-' || ch == '_' || ch.is_whitespace() {
            Some('-')
        } else {
            None
        };
        let Some(ch) = normalized else { continue };
        if ch == '-' {
            if previous_dash || slug.is_empty() {
                continue;
            }
            previous_dash = true;
        } else {
            previous_dash = false;
        }
        slug.push(ch);
        if slug.len() >= 32 {
            break;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "task".to_string()
    } else {
        slug.to_string()
    }
}

fn worktree_store() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let root = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "Could not resolve the Windows user data directory.".to_string())?
        .join("Atelier")
        .join("worktrees");

    #[cfg(target_os = "macos")]
    let root = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Could not resolve HOME.".to_string())?
        .join("Library")
        .join("Application Support")
        .join("com.atelier.app")
        .join("worktrees");

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let root = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
        .ok_or_else(|| "Could not resolve the user data directory.".to_string())?
        .join("atelier")
        .join("worktrees");

    fs::create_dir_all(&root)
        .map_err(|err| format!("create worktree store {}: {err}", root.display()))?;
    Ok(root)
}

fn git_command(cwd: &Path) -> Command {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(cwd)
        .env("PATH", crate::augmented_cli_path());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn git_output(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = git_command(cwd)
        .args(args)
        .output()
        .map_err(|err| format!("git {}: {err}", args.join(" ")))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if error.is_empty() {
            format!("git {} exited with {}", args.join(" "), output.status)
        } else {
            error
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn git_output_with_index(cwd: &Path, index: &Path, args: &[&str]) -> Result<String, String> {
    let output = git_command(cwd)
        .env("GIT_INDEX_FILE", index)
        .args(args)
        .output()
        .map_err(|err| format!("git {}: {err}", args.join(" ")))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if error.is_empty() {
            format!("git {} exited with {}", args.join(" "), output.status)
        } else {
            error
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn git_apply(cwd: &Path, args: &[&str], patch: &str) -> Result<(), String> {
    let mut child = git_command(cwd)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("git {}: {err}", args.join(" ")))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "git apply stdin unavailable".to_string())?
        .write_all(patch.as_bytes())
        .map_err(|err| format!("git apply stdin: {err}"))?;
    let output = child
        .wait_with_output()
        .map_err(|err| format!("git apply wait: {err}"))?;
    if output.status.success() {
        return Ok(());
    }
    let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if error.is_empty() {
        format!("git {} exited with {}", args.join(" "), output.status)
    } else {
        error
    })
}

fn canonical_git_common_dir(cwd: &Path) -> Result<PathBuf, String> {
    let raw = git_output(cwd, &["rev-parse", "--git-common-dir"])?;
    let path = PathBuf::from(raw.trim());
    let path = if path.is_absolute() {
        path
    } else {
        cwd.join(path)
    };
    fs::canonicalize(&path)
        .map_err(|err| format!("resolve Git common directory {}: {err}", path.display()))
}

fn valid_git_oid(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.chars().all(|ch| ch.is_ascii_hexdigit())
}

static ADOPTION_INDEX_SEQUENCE: AtomicU64 = AtomicU64::new(1);

fn temporary_adoption_index() -> PathBuf {
    std::env::temp_dir().join(format!(
        "atelier-adopt-index-{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        ADOPTION_INDEX_SEQUENCE.fetch_add(1, Ordering::Relaxed),
    ))
}

fn adoption_receipt_dir() -> Result<PathBuf, String> {
    let root = worktree_store()?
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Could not resolve Atelier application data directory.".to_string())?
        .join("adoptions");
    fs::create_dir_all(&root).map_err(|err| {
        format!(
            "create adoption receipt directory {}: {err}",
            root.display()
        )
    })?;
    Ok(root)
}

fn save_adoption_receipt(receipt_dir: &Path, branch: &str, patch: &str) -> Result<PathBuf, String> {
    let name = format!(
        "{}-{}-{}.patch",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        safe_task_slug(branch),
        &hash_value(patch)[..8]
    );
    fs::create_dir_all(receipt_dir).map_err(|err| {
        format!(
            "create adoption receipt directory {}: {err}",
            receipt_dir.display()
        )
    })?;
    let path = receipt_dir.join(name);
    fs::write(&path, patch)
        .map_err(|err| format!("write adoption receipt {}: {err}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(path)
}

fn adoption_patch(worktree: &Path, base_head: &str) -> Result<(String, usize, u64, u64), String> {
    const MAX_ADOPTION_PATCH_BYTES: usize = 64 * 1024 * 1024;
    let index = temporary_adoption_index();
    let result = (|| {
        git_output_with_index(worktree, &index, &["read-tree", base_head])?;
        git_output_with_index(worktree, &index, &["add", "-A", "--", "."])?;
        let patch = git_output_with_index(
            worktree,
            &index,
            &[
                "diff",
                "--cached",
                "--binary",
                "--full-index",
                base_head,
                "--",
            ],
        )?;
        if patch.len() > MAX_ADOPTION_PATCH_BYTES {
            return Err("Candidate patch exceeds the 64 MiB safe adoption limit.".to_string());
        }
        let names = git_output_with_index(
            worktree,
            &index,
            &["diff", "--cached", "--name-only", base_head, "--"],
        )?;
        let numstat = git_output_with_index(
            worktree,
            &index,
            &["diff", "--cached", "--numstat", base_head, "--"],
        )?;
        let mut additions = 0_u64;
        let mut deletions = 0_u64;
        for line in numstat.lines() {
            let mut parts = line.splitn(3, '\t');
            additions =
                additions.saturating_add(parts.next().and_then(|v| v.parse().ok()).unwrap_or(0));
            deletions =
                deletions.saturating_add(parts.next().and_then(|v| v.parse().ok()).unwrap_or(0));
        }
        Ok((
            patch,
            names.lines().filter(|line| !line.trim().is_empty()).count(),
            additions,
            deletions,
        ))
    })();
    let _ = fs::remove_file(&index);
    let _ = fs::remove_file(format!("{}.lock", index.to_string_lossy()));
    result
}

fn adopt_worktree_changes(
    source_cwd: String,
    worktree_cwd: String,
    base_head: String,
    expected_branch: String,
) -> Result<AgentWorktreeAdoptResult, String> {
    adopt_worktree_changes_with_receipt_dir(
        source_cwd,
        worktree_cwd,
        base_head,
        expected_branch,
        None,
    )
}

fn adopt_worktree_changes_with_receipt_dir(
    source_cwd: String,
    worktree_cwd: String,
    base_head: String,
    expected_branch: String,
    receipt_dir: Option<&Path>,
) -> Result<AgentWorktreeAdoptResult, String> {
    if !valid_git_oid(base_head.trim()) {
        return Err("Candidate base commit is invalid.".to_string());
    }
    let source = fs::canonicalize(source_cwd.trim())
        .map_err(|err| format!("resolve source workspace: {err}"))?;
    let worktree = fs::canonicalize(worktree_cwd.trim())
        .map_err(|err| format!("resolve candidate worktree: {err}"))?;
    let source_root = fs::canonicalize(PathBuf::from(git_output(
        &source,
        &["rev-parse", "--show-toplevel"],
    )?))
    .map_err(|err| format!("resolve source Git root: {err}"))?;
    let candidate_root = fs::canonicalize(PathBuf::from(git_output(
        &worktree,
        &["rev-parse", "--show-toplevel"],
    )?))
    .map_err(|err| format!("resolve candidate Git root: {err}"))?;
    if canonical_git_common_dir(&source_root)? != canonical_git_common_dir(&candidate_root)? {
        return Err("Candidate worktree does not belong to the source repository.".to_string());
    }
    let branch = git_output(&candidate_root, &["branch", "--show-current"])?;
    if branch.trim() != expected_branch.trim() {
        return Err(format!(
            "Candidate branch changed from '{}' to '{}'. Review it before adopting.",
            expected_branch.trim(),
            branch.trim()
        ));
    }
    git_output(
        &candidate_root,
        &[
            "cat-file",
            "-e",
            &format!("{}^{{commit}}", base_head.trim()),
        ],
    )?;
    if !git_output(&source_root, &["diff", "--name-only", "--diff-filter=U"])?
        .trim()
        .is_empty()
    {
        return Err("Source workspace has unresolved merge conflicts.".to_string());
    }

    let source_dirty_before = !git_output(&source_root, &["status", "--porcelain=v1"])?
        .trim()
        .is_empty();
    let (patch, file_count, additions, deletions) =
        adoption_patch(&candidate_root, base_head.trim())?;
    if patch.trim().is_empty() || file_count == 0 {
        return Err("Candidate has no changes to adopt.".to_string());
    }

    git_apply(
        &source_root,
        &["apply", "--check", "--whitespace=nowarn", "-"],
        &patch,
    )
    .map_err(|err| format!("Candidate conflicts with the source workspace: {err}"))?;
    let receipt_dir = match receipt_dir {
        Some(path) => path.to_path_buf(),
        None => adoption_receipt_dir()?,
    };
    let receipt = save_adoption_receipt(&receipt_dir, branch.trim(), &patch)?;
    git_apply(&source_root, &["apply", "--whitespace=nowarn", "-"], &patch)?;

    Ok(AgentWorktreeAdoptResult {
        source_cwd: source_root.to_string_lossy().into_owned(),
        worktree_cwd: candidate_root.to_string_lossy().into_owned(),
        branch: branch.trim().to_string(),
        base_head: base_head.trim().to_string(),
        file_count,
        additions,
        deletions,
        source_dirty_before,
        receipt_path: receipt.to_string_lossy().into_owned(),
    })
}

fn worktree_info(
    source: &Path,
    worktree: &Path,
    branch: String,
    created: bool,
    source_dirty: bool,
) -> Result<AgentWorktreeInfo, String> {
    let head = git_output(worktree, &["rev-parse", "HEAD"])?;
    Ok(AgentWorktreeInfo {
        source_cwd: source.to_string_lossy().into_owned(),
        worktree_cwd: worktree.to_string_lossy().into_owned(),
        branch,
        head,
        created,
        source_dirty,
    })
}

fn prepare_in_store(
    root: &Path,
    task_id: &str,
    store: &Path,
    source_dirty: bool,
) -> Result<AgentWorktreeInfo, String> {
    let root_hash = hash_value(&root.to_string_lossy());
    let task_hash = hash_value(task_id);
    let slug = safe_task_slug(task_id);
    let branch = format!("atelier/{slug}-{}", &task_hash[..8]);
    let worktree = store
        .join(&root_hash[..12])
        .join(format!("{slug}-{}", &task_hash[..8]));

    if worktree.exists() {
        if git_output(&worktree, &["rev-parse", "--is-inside-work-tree"]).as_deref() == Ok("true") {
            return worktree_info(root, &worktree, branch, false, source_dirty);
        }
        return Err(format!(
            "The Atelier worktree path already exists but is not a Git worktree: {}",
            worktree.display()
        ));
    }
    if let Some(parent) = worktree.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("create worktree parent {}: {err}", parent.display()))?;
    }

    let branch_ref = format!("refs/heads/{branch}");
    let branch_exists = git_command(root)
        .args(["show-ref", "--verify", "--quiet", &branch_ref])
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    let mut command = git_command(root);
    command.arg("worktree").arg("add");
    if !branch_exists {
        command.arg("-b").arg(&branch);
    }
    command.arg(&worktree);
    if branch_exists {
        command.arg(&branch);
    } else {
        command.arg("HEAD");
    }
    let output = command
        .output()
        .map_err(|err| format!("create git worktree: {err}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    worktree_info(root, &worktree, branch, true, source_dirty)
}

fn prepare(cwd: String, task_id: String) -> Result<AgentWorktreeInfo, String> {
    let cwd =
        fs::canonicalize(cwd.trim()).map_err(|err| format!("resolve worktree source: {err}"))?;
    if !cwd.is_dir() {
        return Err("The worktree source is not a directory.".to_string());
    }
    let root = PathBuf::from(git_output(&cwd, &["rev-parse", "--show-toplevel"])?);
    let root = fs::canonicalize(&root)
        .map_err(|err| format!("resolve git root {}: {err}", root.display()))?;
    let source_dirty = !git_output(&root, &["status", "--porcelain=v1"])?.is_empty();
    prepare_in_store(&root, &task_id, &worktree_store()?, source_dirty)
}

#[tauri::command]
pub(crate) async fn agent_worktree_prepare(
    cwd: String,
    task_id: String,
) -> Result<AgentWorktreeInfo, String> {
    tauri::async_runtime::spawn_blocking(move || prepare(cwd, task_id))
        .await
        .map_err(|err| format!("worktree preparation thread join: {err}"))?
}

#[tauri::command]
pub(crate) async fn agent_worktree_adopt(
    source_cwd: String,
    worktree_cwd: String,
    base_head: String,
    expected_branch: String,
) -> Result<AgentWorktreeAdoptResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        adopt_worktree_changes(source_cwd, worktree_cwd, base_head, expected_branch)
    })
    .await
    .map_err(|err| format!("worktree adoption thread join: {err}"))?
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{adopt_worktree_changes_with_receipt_dir, prepare_in_store, safe_task_slug};

    #[test]
    fn worktree_slug_is_bounded_and_shell_independent() {
        assert_eq!(
            safe_task_slug("Release review #42; rm -rf /"),
            "release-review-42-rm-rf"
        );
        assert_eq!(safe_task_slug("한글 작업"), "task");
        assert!(safe_task_slug(&"a".repeat(100)).len() <= 32);
    }

    #[test]
    fn worktree_preserves_source_edits_and_reuses_task_branch() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("atelier-worktree-source-{nonce}"));
        let store = std::env::temp_dir().join(format!("atelier-worktree-store-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        let git = |args: &[&str]| {
            let status = Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(args)
                .status()
                .unwrap();
            assert!(status.success(), "git {args:?}");
        };
        git(&["init", "--quiet"]);
        git(&["config", "user.email", "atelier-test@example.invalid"]);
        git(&["config", "user.name", "Atelier Test"]);
        fs::write(root.join("proof.txt"), "committed\n").unwrap();
        git(&["add", "proof.txt"]);
        git(&["commit", "--quiet", "-m", "fixture"]);
        fs::write(root.join("proof.txt"), "source edit\n").unwrap();

        let first = prepare_in_store(&root, "task alpha", &store, true).unwrap();
        assert!(first.created);
        assert!(first.source_dirty);
        assert_eq!(
            fs::read_to_string(root.join("proof.txt")).unwrap(),
            "source edit\n"
        );
        assert_eq!(
            fs::read_to_string(Path::new(&first.worktree_cwd).join("proof.txt")).unwrap(),
            "committed\n"
        );
        let second = prepare_in_store(&root, "task alpha", &store, true).unwrap();
        assert!(!second.created);
        assert_eq!(first.worktree_cwd, second.worktree_cwd);
        assert_eq!(first.branch, second.branch);

        let independent = prepare_in_store(&root, "task beta", &store, true).unwrap();
        assert!(independent.created);
        assert_ne!(first.worktree_cwd, independent.worktree_cwd);
        assert_ne!(first.branch, independent.branch);

        let _ = Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["worktree", "remove", "--force", &first.worktree_cwd])
            .status();
        let _ = Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["worktree", "remove", "--force", &independent.worktree_cwd])
            .status();
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&store);
    }

    #[test]
    fn worktree_adoption_preserves_non_overlapping_source_edits() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("atelier-adopt-source-{nonce}"));
        let store = std::env::temp_dir().join(format!("atelier-adopt-store-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        Command::new("git").arg("init").arg(&root).output().unwrap();
        fs::write(root.join("tracked.txt"), "base\n").unwrap();
        Command::new("git")
            .args(["-C", root.to_str().unwrap(), "add", "."])
            .output()
            .unwrap();
        Command::new("git")
            .args([
                "-C",
                root.to_str().unwrap(),
                "-c",
                "user.name=Atelier Test",
                "-c",
                "user.email=atelier@example.invalid",
                "commit",
                "-m",
                "base",
            ])
            .output()
            .unwrap();

        let candidate = prepare_in_store(&root, "candidate", &store, false).unwrap();
        fs::write(
            Path::new(&candidate.worktree_cwd).join("tracked.txt"),
            "candidate\n",
        )
        .unwrap();
        fs::write(
            Path::new(&candidate.worktree_cwd).join("new.txt"),
            "new file\n",
        )
        .unwrap();
        fs::write(root.join("local-only.txt"), "preserve me\n").unwrap();
        let receipt_dir = store.join("receipts");

        let result = adopt_worktree_changes_with_receipt_dir(
            root.to_string_lossy().into_owned(),
            candidate.worktree_cwd.clone(),
            candidate.head.clone(),
            candidate.branch.clone(),
            Some(&receipt_dir),
        )
        .unwrap();
        assert_eq!(result.file_count, 2);
        assert!(result.source_dirty_before);
        let receipt_path = Path::new(&result.receipt_path);
        assert!(receipt_path.starts_with(&receipt_dir));
        assert!(receipt_path.is_file());
        assert_eq!(
            fs::read_to_string(root.join("tracked.txt")).unwrap(),
            "candidate\n"
        );
        assert_eq!(
            fs::read_to_string(root.join("new.txt")).unwrap(),
            "new file\n"
        );
        assert_eq!(
            fs::read_to_string(root.join("local-only.txt")).unwrap(),
            "preserve me\n"
        );

        Command::new("git")
            .args([
                "-C",
                root.to_str().unwrap(),
                "worktree",
                "remove",
                "--force",
                &candidate.worktree_cwd,
            ])
            .output()
            .unwrap();
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(store);
    }

    #[test]
    fn worktree_adoption_refuses_overlapping_source_edits() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("atelier-adopt-conflict-{nonce}"));
        let store = std::env::temp_dir().join(format!("atelier-adopt-conflict-store-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        Command::new("git").arg("init").arg(&root).output().unwrap();
        fs::write(root.join("tracked.txt"), "base\n").unwrap();
        Command::new("git")
            .args(["-C", root.to_str().unwrap(), "add", "."])
            .output()
            .unwrap();
        Command::new("git")
            .args([
                "-C",
                root.to_str().unwrap(),
                "-c",
                "user.name=Atelier Test",
                "-c",
                "user.email=atelier@example.invalid",
                "commit",
                "-m",
                "base",
            ])
            .output()
            .unwrap();

        let candidate = prepare_in_store(&root, "conflict", &store, false).unwrap();
        fs::write(
            Path::new(&candidate.worktree_cwd).join("tracked.txt"),
            "candidate\n",
        )
        .unwrap();
        fs::write(root.join("tracked.txt"), "source edit\n").unwrap();
        let receipt_dir = store.join("receipts");

        let error = adopt_worktree_changes_with_receipt_dir(
            root.to_string_lossy().into_owned(),
            candidate.worktree_cwd.clone(),
            candidate.head.clone(),
            candidate.branch.clone(),
            Some(&receipt_dir),
        )
        .unwrap_err();
        assert!(
            error.contains("conflicts with the source workspace"),
            "unexpected adoption error: {error}"
        );
        assert_eq!(
            fs::read_to_string(root.join("tracked.txt")).unwrap(),
            "source edit\n"
        );
        assert!(!receipt_dir.exists());

        Command::new("git")
            .args([
                "-C",
                root.to_str().unwrap(),
                "worktree",
                "remove",
                "--force",
                &candidate.worktree_cwd,
            ])
            .output()
            .unwrap();
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(store);
    }
}
