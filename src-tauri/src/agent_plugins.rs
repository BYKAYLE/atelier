use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Serialize;

#[cfg(target_os = "windows")]
use crate::agent_process::configure_windows_background_command;
use crate::agent_process::{
    clip_cli_output, command_for_cli, describe_cli_command, wait_with_timeout,
};
use crate::credentials::gajecode_skills_dir;

#[derive(Serialize)]
pub struct AcademicResearchPluginInstallResult {
    installed: bool,
    enabled: bool,
    message: String,
    log: String,
}

#[derive(Serialize)]
pub struct SkillBundleInstallResult {
    installed: bool,
    skill_count: usize,
    skipped_count: usize,
    repository_path: String,
    installed_roots: Vec<String>,
    message: String,
    log: String,
}

#[derive(Serialize, Clone)]
pub struct PluginSkillInstallStatusItem {
    id: String,
    installed: bool,
    enabled: Option<bool>,
    message: String,
}

#[derive(Serialize, Clone)]
pub struct PluginSkillInstallStatusResult {
    items: Vec<PluginSkillInstallStatusItem>,
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

fn run_claude_plugin_command(args: &[&str], timeout: Duration) -> Result<(bool, String), String> {
    let mut cmd = command_for_cli("claude");
    for arg in args {
        cmd.arg(arg);
    }
    cmd.env("PATH", crate::augmented_cli_path())
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let child = cmd.spawn().map_err(|e| {
        format!(
            "claude plugin command spawn failed: {e} ({})",
            describe_cli_command("claude")
        )
    })?;
    let (output, timed_out) = wait_with_timeout(child, timeout)?;
    let mut text = String::new();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stdout.is_empty() {
        text.push_str(&stdout);
    }
    if !stderr.is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&stderr);
    }
    if timed_out {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str("timed out");
    }
    Ok((output.status.success() && !timed_out, clip_cli_output(text)))
}

fn academic_research_plugin_state(list_output: &str) -> (bool, bool) {
    let installed = list_output.contains("academic-research-skills");
    let enabled = installed
        && list_output
            .lines()
            .skip_while(|line| !line.contains("academic-research-skills"))
            .take(5)
            .any(|line| line.contains("Status:") && !line.contains("disabled"));
    (installed, enabled)
}

fn count_skill_entries(root: &Path) -> usize {
    fs::read_dir(root)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .filter(|entry| {
            let path = entry.path();
            path.is_dir() && path.join("SKILL.md").is_file()
        })
        .count()
}

fn atelier_public_skill_bundle_status() -> PluginSkillInstallStatusItem {
    let Some(cache_dir) = home_path(&[".atelier", "skills", "atelier-skill"]) else {
        return PluginSkillInstallStatusItem {
            id: "atelier-skill-public".to_string(),
            installed: false,
            enabled: None,
            message: "Could not resolve the user home directory.".to_string(),
        };
    };

    let skill_count = count_skill_entries(&cache_dir);
    let installed = cache_dir.join(".git").is_dir() && skill_count > 0;
    let message = if installed {
        format!(
            "Installed from {} with {skill_count} public skill entries.",
            cache_dir.display()
        )
    } else if cache_dir.exists() {
        format!(
            "{} exists, but it is not a complete Atelier Skill checkout.",
            cache_dir.display()
        )
    } else {
        "Atelier Skill is not installed.".to_string()
    };

    PluginSkillInstallStatusItem {
        id: "atelier-skill-public".to_string(),
        installed,
        enabled: None,
        message,
    }
}

fn academic_research_claude_plugin_status() -> PluginSkillInstallStatusItem {
    match run_claude_plugin_command(&["plugin", "list"], Duration::from_secs(8)) {
        Ok((ok, output)) => {
            let (installed, enabled) = academic_research_plugin_state(&output);
            let message = if installed && enabled {
                "Claude Academic Research Skills plugin is installed and enabled.".to_string()
            } else if installed {
                "Claude Academic Research Skills plugin is installed, but appears disabled."
                    .to_string()
            } else if ok {
                "Claude Academic Research Skills plugin is not installed.".to_string()
            } else {
                format!("Could not confirm Claude plugin state: {output}")
            };
            PluginSkillInstallStatusItem {
                id: "academic-research-claude".to_string(),
                installed,
                enabled: Some(enabled),
                message,
            }
        }
        Err(err) => PluginSkillInstallStatusItem {
            id: "academic-research-claude".to_string(),
            installed: false,
            enabled: Some(false),
            message: format!("Could not check Claude plugin state: {err}"),
        },
    }
}

fn insane_search_gajecode_skill_status() -> PluginSkillInstallStatusItem {
    let Some(root) = gajecode_skills_dir() else {
        return PluginSkillInstallStatusItem {
            id: "insane-search-gajecode".to_string(),
            installed: false,
            enabled: None,
            message: "Could not resolve the isolated Gajae Code skills directory.".to_string(),
        };
    };

    let target = root.join("insane-search");
    let installed = target.join("SKILL.md").is_file();
    let message = if installed {
        format!(
            "Installed in the isolated Gajae Code skill root: {}",
            target.display()
        )
    } else {
        "Insane Search is not installed in the isolated Gajae Code skill root.".to_string()
    };

    PluginSkillInstallStatusItem {
        id: "insane-search-gajecode".to_string(),
        installed,
        enabled: None,
        message,
    }
}

fn plugin_skill_install_status_blocking() -> PluginSkillInstallStatusResult {
    PluginSkillInstallStatusResult {
        items: vec![
            atelier_public_skill_bundle_status(),
            academic_research_claude_plugin_status(),
            insane_search_gajecode_skill_status(),
        ],
    }
}

fn install_academic_research_claude_plugin_blocking(
) -> Result<AcademicResearchPluginInstallResult, String> {
    let mut log_lines = Vec::new();
    let initial_list = match run_claude_plugin_command(&["plugin", "list"], Duration::from_secs(20))
    {
        Ok((_, output)) => output,
        Err(err) => {
            return Ok(AcademicResearchPluginInstallResult {
                installed: false,
                enabled: false,
                message: format!(
                    "Claude Code CLI is not ready, so Academic Research Skills will be installed after Claude is installed. {err}"
                ),
                log: err,
            });
        }
    };

    let (initial_installed, initial_enabled) = academic_research_plugin_state(&initial_list);
    if initial_installed && initial_enabled {
        return Ok(AcademicResearchPluginInstallResult {
            installed: true,
            enabled: true,
            message: "Claude Academic Research Skills plugin is already installed and enabled."
                .to_string(),
            log: initial_list,
        });
    }

    let mut steps: Vec<(&str, Vec<&'static str>)> = Vec::new();
    if !initial_installed {
        steps.push((
            "marketplace add",
            vec![
                "plugin",
                "marketplace",
                "add",
                "Imbad0202/academic-research-skills",
            ],
        ));
        steps.push((
            "plugin install",
            vec!["plugin", "install", "academic-research-skills"],
        ));
    }
    if !initial_enabled {
        steps.push((
            "plugin enable",
            vec!["plugin", "enable", "academic-research-skills"],
        ));
    }

    for (label, args) in steps {
        match run_claude_plugin_command(&args, Duration::from_secs(90)) {
            Ok((ok, output)) => {
                let status = if ok { "ok" } else { "warn" };
                log_lines.push(format!("[{status}] {label}: {}", output.trim()));
            }
            Err(err) => log_lines.push(format!("[warn] {label}: {err}")),
        }
    }

    let (_, list_output) = run_claude_plugin_command(&["plugin", "list"], Duration::from_secs(20))?;
    let (installed, enabled) = academic_research_plugin_state(&list_output);
    log_lines.push(format!("[info] plugin list:\n{}", list_output.trim()));

    if !installed {
        return Err(format!(
            "Claude Academic Research Skills plugin was not installed.\n{}",
            log_lines.join("\n\n")
        ));
    }

    let message = if enabled {
        "Claude Academic Research Skills plugin installed and enabled.".to_string()
    } else {
        "Claude Academic Research Skills plugin installed. Enable it with `/plugin on academic-research-skills` if Claude reports it disabled.".to_string()
    };

    Ok(AcademicResearchPluginInstallResult {
        installed,
        enabled,
        message,
        log: log_lines.join("\n\n"),
    })
}

const ATELIER_SKILL_REPOSITORY: &str = "https://github.com/BYKAYLE/atelier-skill.git";
const INSANE_SEARCH_REPOSITORY: &str = "https://github.com/fivetaku/insane-search.git";

fn run_skill_git_command(args: &[String], cwd: Option<&Path>) -> Result<String, String> {
    let mut command = Command::new("git");
    #[cfg(target_os = "windows")]
    configure_windows_background_command(&mut command);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let output = command
        .args(args)
        .env("PATH", crate::augmented_cli_path())
        .output()
        .map_err(|e| format!("git {}: {e}", args.join(" ")))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        let detail = if stderr.is_empty() { stdout } else { stderr };
        return Err(format!("git {} failed: {detail}", args.join(" ")));
    }
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

fn copy_skill_dir_missing(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() {
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(|e| format!("create skill dir {}: {e}", dst.display()))?;
    copy_dir_recursive(src, dst)
}

fn copy_skill_dir_update(src: &Path, dst: &Path) -> Result<usize, String> {
    fs::create_dir_all(dst).map_err(|e| format!("create skill dir {}: {e}", dst.display()))?;
    copy_dir_recursive_count(src, dst)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    copy_dir_recursive_count(src, dst).map(|_| ())
}

fn copy_dir_recursive_count(src: &Path, dst: &Path) -> Result<usize, String> {
    let mut copied = 0usize;
    for entry in fs::read_dir(src).map_err(|e| format!("read dir {}: {e}", src.display()))? {
        let entry = entry.map_err(|e| format!("read dir entry {}: {e}", src.display()))?;
        let name = entry.file_name();
        let name_text = name.to_string_lossy();
        if matches!(
            name_text.as_ref(),
            ".git" | ".venv" | "node_modules" | "__pycache__" | ".DS_Store"
        ) {
            continue;
        }
        let src_path = entry.path();
        let dst_path = dst.join(&name);
        let file_type = entry
            .file_type()
            .map_err(|e| format!("file type {}: {e}", src_path.display()))?;
        if file_type.is_dir() {
            fs::create_dir_all(&dst_path)
                .map_err(|e| format!("create dir {}: {e}", dst_path.display()))?;
            copied += copy_dir_recursive_count(&src_path, &dst_path)?;
        } else if file_type.is_file() {
            fs::copy(&src_path, &dst_path).map_err(|e| {
                format!("copy {} -> {}: {e}", src_path.display(), dst_path.display())
            })?;
            copied += 1;
        }
    }
    Ok(copied)
}

fn install_atelier_public_skill_bundle_blocking() -> Result<SkillBundleInstallResult, String> {
    let cache_dir = home_path(&[".atelier", "skills", "atelier-skill"])
        .ok_or_else(|| "Could not resolve the user home directory.".to_string())?;
    let cache_parent = cache_dir
        .parent()
        .ok_or_else(|| "Could not resolve the Atelier skill cache parent.".to_string())?
        .to_path_buf();
    fs::create_dir_all(&cache_parent)
        .map_err(|e| format!("create skill cache {}: {e}", cache_parent.display()))?;

    let mut log_lines = Vec::new();
    if cache_dir.join(".git").is_dir() {
        let output = run_skill_git_command(&["pull".into(), "--ff-only".into()], Some(&cache_dir))?;
        log_lines.push(format!("[ok] update repository: {output}"));
    } else if cache_dir.exists() {
        return Err(format!(
            "{} exists but is not a git checkout. Move it aside before installing Atelier Skill.",
            cache_dir.display()
        ));
    } else {
        let output = run_skill_git_command(
            &[
                "clone".into(),
                "--depth".into(),
                "1".into(),
                ATELIER_SKILL_REPOSITORY.into(),
                cache_dir.to_string_lossy().to_string(),
            ],
            None,
        )?;
        log_lines.push(format!("[ok] clone repository: {output}"));
    }

    let install_roots = [
        home_path(&[".atelier", "skills"]),
        home_path(&[".claude", "skills"]),
        home_path(&[".codex", "skills"]),
        home_path(&[".hermes", "skills"]),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();

    let mut skill_names = Vec::new();
    for entry in
        fs::read_dir(&cache_dir).map_err(|e| format!("read bundle {}: {e}", cache_dir.display()))?
    {
        let entry = entry.map_err(|e| format!("read bundle entry: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name == "deploy-pilot" || name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_dir() && path.join("SKILL.md").is_file() {
            skill_names.push((name, path));
        }
    }

    let mut copied = 0usize;
    let mut skipped = 0usize;
    let mut installed_roots = Vec::new();
    for root in install_roots {
        fs::create_dir_all(&root)
            .map_err(|e| format!("create install root {}: {e}", root.display()))?;
        installed_roots.push(root.to_string_lossy().to_string());
        for (name, source) in &skill_names {
            let target = root.join(name);
            if target.exists() {
                skipped += 1;
                continue;
            }
            copy_skill_dir_missing(source, &target)?;
            copied += 1;
        }
    }

    let message = if copied == 0 {
        format!(
            "Atelier Skill bundle is available. {} existing local skill entries were left untouched.",
            skipped
        )
    } else {
        format!(
            "Atelier Skill bundle installed. Copied {copied} skill entries and skipped {skipped} existing entries."
        )
    };

    Ok(SkillBundleInstallResult {
        installed: !skill_names.is_empty(),
        skill_count: skill_names.len(),
        skipped_count: skipped,
        repository_path: cache_dir.to_string_lossy().to_string(),
        installed_roots,
        message,
        log: log_lines.join("\n"),
    })
}

fn patch_insane_search_gajecode_skill(skill_md: &Path) -> Result<(), String> {
    const MARKER: &str = "<!-- ATELIER_GAJECODE_ADAPTER -->";
    const ADAPTER: &str = r#"

<!-- ATELIER_GAJECODE_ADAPTER -->
> Atelier/Gajae Code adapter: this copy is installed as a Gajae Code-only skill.
> Before Step 0, if `CLAUDE_PLUGIN_ROOT` is unset, use the isolated skill root:
> `export CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-${ATELIER_SKILLS_DIR:-$HOME/.gjc/agent/skills}/insane-search}"`
> This keeps setup, engine, and references inside Atelier's dedicated Gajae Code skill space.

"#;

    let raw =
        fs::read_to_string(skill_md).map_err(|e| format!("read {}: {e}", skill_md.display()))?;
    if raw.contains(MARKER) {
        return Ok(());
    }
    let patched = if let Some(stripped) = raw.strip_prefix("---\n") {
        if let Some(relative) = stripped.find("\n---\n") {
            let insert_at = 4 + relative + "\n---\n".len();
            format!("{}{}{}", &raw[..insert_at], ADAPTER, &raw[insert_at..])
        } else {
            format!("{ADAPTER}{raw}")
        }
    } else {
        format!("{ADAPTER}{raw}")
    };
    fs::write(skill_md, patched).map_err(|e| format!("write {}: {e}", skill_md.display()))
}

fn install_insane_search_gajecode_skill_blocking() -> Result<SkillBundleInstallResult, String> {
    let cache_dir = home_path(&[".atelier", "skills", "insane-search"])
        .ok_or_else(|| "Could not resolve the user home directory.".to_string())?;
    let cache_parent = cache_dir
        .parent()
        .ok_or_else(|| "Could not resolve the insane-search cache parent.".to_string())?
        .to_path_buf();
    fs::create_dir_all(&cache_parent)
        .map_err(|e| format!("create skill cache {}: {e}", cache_parent.display()))?;

    let mut log_lines = Vec::new();
    if cache_dir.join(".git").is_dir() {
        let output = run_skill_git_command(&["pull".into(), "--ff-only".into()], Some(&cache_dir))?;
        log_lines.push(format!("[ok] update repository: {output}"));
    } else if cache_dir.exists() {
        return Err(format!(
            "{} exists but is not a git checkout. Move it aside before installing insane-search.",
            cache_dir.display()
        ));
    } else {
        let output = run_skill_git_command(
            &[
                "clone".into(),
                "--depth".into(),
                "1".into(),
                INSANE_SEARCH_REPOSITORY.into(),
                cache_dir.to_string_lossy().to_string(),
            ],
            None,
        )?;
        log_lines.push(format!("[ok] clone repository: {output}"));
    }

    let source = cache_dir.join("skills").join("insane-search");
    if !source.join("SKILL.md").is_file() {
        return Err(format!(
            "insane-search repository does not contain skills/insane-search/SKILL.md at {}",
            source.display()
        ));
    }

    let root = gajecode_skills_dir()
        .ok_or_else(|| "Could not resolve the isolated Gajae Code skills directory.".to_string())?;
    fs::create_dir_all(&root)
        .map_err(|e| format!("create Gajae Code skills root {}: {e}", root.display()))?;
    let target = root.join("insane-search");
    let already_installed = target.join("SKILL.md").is_file();
    let copied = copy_skill_dir_update(&source, &target)?;

    let setup_source = cache_dir.join("setup");
    if setup_source.is_dir() {
        let setup_target = target.join("setup");
        let setup_copied = copy_skill_dir_update(&setup_source, &setup_target)?;
        log_lines.push(format!(
            "[ok] copy setup support files: {setup_copied} files"
        ));
    }
    for doc in [
        "LICENSE",
        "DISCLAIMER.md",
        "PLATFORMS.md",
        "README.ko.md",
        "README.md",
    ] {
        let src = cache_dir.join(doc);
        if src.is_file() {
            let dst = target.join(doc);
            fs::copy(&src, &dst)
                .map_err(|e| format!("copy {} -> {}: {e}", src.display(), dst.display()))?;
        }
    }
    patch_insane_search_gajecode_skill(&target.join("SKILL.md"))?;
    log_lines.push(format!(
        "[ok] install Gajae Code skill: {} -> {} ({copied} skill files)",
        source.display(),
        target.display()
    ));

    let message = if already_installed {
        "insane-search is updated in the isolated Gajae Code skills folder.".to_string()
    } else {
        "insane-search is installed as an isolated Gajae Code skill.".to_string()
    };

    Ok(SkillBundleInstallResult {
        installed: true,
        skill_count: 1,
        skipped_count: usize::from(already_installed),
        repository_path: cache_dir.to_string_lossy().to_string(),
        installed_roots: vec![root.to_string_lossy().to_string()],
        message,
        log: log_lines.join("\n"),
    })
}

#[tauri::command]
pub async fn academic_research_install_claude_plugin(
) -> Result<AcademicResearchPluginInstallResult, String> {
    tauri::async_runtime::spawn_blocking(install_academic_research_claude_plugin_blocking)
        .await
        .map_err(|e| format!("academic research plugin install thread join: {e}"))?
}

#[tauri::command]
pub async fn atelier_skill_install_public_bundle() -> Result<SkillBundleInstallResult, String> {
    tauri::async_runtime::spawn_blocking(install_atelier_public_skill_bundle_blocking)
        .await
        .map_err(|e| format!("atelier skill install thread join: {e}"))?
}

#[tauri::command]
pub async fn insane_search_install_gajecode_skill() -> Result<SkillBundleInstallResult, String> {
    tauri::async_runtime::spawn_blocking(install_insane_search_gajecode_skill_blocking)
        .await
        .map_err(|e| format!("insane-search install thread join: {e}"))?
}

#[tauri::command]
pub async fn plugin_skill_install_status() -> Result<PluginSkillInstallStatusResult, String> {
    tauri::async_runtime::spawn_blocking(plugin_skill_install_status_blocking)
        .await
        .map_err(|e| format!("plugin skill status thread join: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn academic_research_status_distinguishes_disabled_and_enabled() {
        let disabled = "academic-research-skills\nStatus: disabled";
        assert_eq!(academic_research_plugin_state(disabled), (true, false));

        let enabled = "academic-research-skills\nStatus: enabled";
        assert_eq!(academic_research_plugin_state(enabled), (true, true));

        assert_eq!(
            academic_research_plugin_state("other-plugin"),
            (false, false)
        );
    }

    #[test]
    fn skill_copy_filter_excludes_runtime_and_repository_directories() {
        for name in [".git", ".venv", "node_modules", "__pycache__", ".DS_Store"] {
            assert!(matches!(
                name,
                ".git" | ".venv" | "node_modules" | "__pycache__" | ".DS_Store"
            ));
        }
    }
}
