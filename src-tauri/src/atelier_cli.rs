use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSnapshot {
    workspace: String,
    exists: bool,
    is_git: bool,
    branch: Option<String>,
    head: Option<String>,
    changed_files: usize,
    package_manager: Option<String>,
    package_scripts: Vec<String>,
}

fn print_json(value: &impl Serialize) -> Result<(), String> {
    println!(
        "{}",
        serde_json::to_string_pretty(value)
            .map_err(|error| format!("serialize Atelier CLI output: {error}"))?
    );
    Ok(())
}

fn help() {
    println!(
        "Atelier CLI {}\n\n\
Usage:\n\
  atelier version [--json]\n\
  atelier status [--json]\n\
  atelier snapshot --workspace <path> [--json]\n\
  atelier verify --workspace <path> [--json]\n\
  atelier task dispatch --workspace <path> --provider <provider> --prompt <text> [options]\n\
  atelier task list [--json]\n\
  atelier task status <request-id> [--json]\n\
  atelier task cancel <request-id> [--reason <text>] [--json]\n\
  atelier worktree create --workspace <path> --task <name> [--json]\n\n\
Task options:\n\
  --model <model> --effort <level> --permission <mode> --stella\n\n\
The CLI never accepts arbitrary shell commands. Mutating requests are queued for\n\
the running Atelier app and use the same provider, permission, and audit paths.",
        env!("CARGO_PKG_VERSION")
    );
}

fn option(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|argument| argument == name)
        .and_then(|index| args.get(index + 1))
        .cloned()
}

fn flag(args: &[String], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}

fn required_option(args: &[String], name: &str) -> Result<String, String> {
    option(args, name).ok_or_else(|| format!("Missing required option {name}."))
}

fn canonical_workspace(args: &[String]) -> Result<PathBuf, String> {
    let raw = required_option(args, "--workspace")?;
    let path = std::fs::canonicalize(raw.trim())
        .map_err(|error| format!("resolve workspace '{}': {error}", raw.trim()))?;
    if !path.is_dir() {
        return Err("The workspace must be a directory.".to_string());
    }
    Ok(path)
}

fn fixed_command_output(program: &str, cwd: &Path, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    command.current_dir(cwd).args(args);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command.output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn workspace_snapshot(workspace: &Path) -> WorkspaceSnapshot {
    let git_root = fixed_command_output("git", workspace, &["rev-parse", "--show-toplevel"])
        .and_then(|root| std::fs::canonicalize(root).ok());
    let is_git = git_root.is_some();
    let git_cwd = git_root.as_deref().unwrap_or(workspace);
    let branch = is_git
        .then(|| fixed_command_output("git", git_cwd, &["branch", "--show-current"]))
        .flatten()
        .filter(|value| !value.is_empty());
    let head = is_git
        .then(|| fixed_command_output("git", git_cwd, &["rev-parse", "HEAD"]))
        .flatten()
        .filter(|value| !value.is_empty());
    let changed_files = if is_git {
        fixed_command_output("git", git_cwd, &["status", "--porcelain=v1"])
            .map(|output| {
                output
                    .lines()
                    .filter(|line| !line.trim().is_empty())
                    .count()
            })
            .unwrap_or(0)
    } else {
        0
    };
    let package_manager = if workspace.join("pnpm-lock.yaml").exists() {
        Some("pnpm".to_string())
    } else if workspace.join("yarn.lock").exists() {
        Some("yarn".to_string())
    } else if workspace.join("bun.lock").exists() || workspace.join("bun.lockb").exists() {
        Some("bun".to_string())
    } else if workspace.join("package-lock.json").exists()
        || workspace.join("package.json").exists()
    {
        Some("npm".to_string())
    } else {
        None
    };
    let package_scripts = std::fs::read(workspace.join("package.json"))
        .ok()
        .and_then(|content| serde_json::from_slice::<Value>(&content).ok())
        .and_then(|value| value.get("scripts").and_then(Value::as_object).cloned())
        .map(|scripts| {
            let mut names = scripts.keys().cloned().collect::<Vec<_>>();
            names.sort();
            names
        })
        .unwrap_or_default();
    WorkspaceSnapshot {
        workspace: workspace.to_string_lossy().into_owned(),
        exists: workspace.exists(),
        is_git,
        branch,
        head,
        changed_files,
        package_manager,
        package_scripts,
    }
}

fn run_version(json_output: bool) -> Result<(), String> {
    if json_output {
        print_json(&json!({
            "schemaVersion": 1,
            "appVersion": env!("CARGO_PKG_VERSION"),
            "controlSchemaVersion": crate::control_plane::CONTROL_SCHEMA_VERSION,
        }))
    } else {
        println!("Atelier {}", env!("CARGO_PKG_VERSION"));
        Ok(())
    }
}

fn run_status() -> Result<(), String> {
    let status = crate::control_plane::status()?;
    print_json(&json!({
        "schemaVersion": 1,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "executable": std::env::current_exe().ok().map(|path| path.to_string_lossy().into_owned()),
        "control": status,
    }))
}

fn run_snapshot(args: &[String], verify: bool) -> Result<(), String> {
    let workspace = canonical_workspace(args)?;
    let snapshot = workspace_snapshot(&workspace);
    if verify {
        print_json(&json!({
            "schemaVersion": 1,
            "ok": snapshot.exists,
            "checks": {
                "workspaceDirectory": snapshot.exists,
                "gitRepository": snapshot.is_git,
                "packageManagerDetected": snapshot.package_manager.is_some(),
            },
            "snapshot": snapshot,
        }))
    } else {
        print_json(&snapshot)
    }
}

fn run_task(args: &[String]) -> Result<(), String> {
    let subcommand = args.get(2).map(String::as_str).unwrap_or("list");
    match subcommand {
        "dispatch" => {
            let workspace = canonical_workspace(args)?;
            let provider = required_option(args, "--provider")?.to_ascii_lowercase();
            if !matches!(
                provider.as_str(),
                "claude" | "codex" | "hermes" | "gajecode"
            ) {
                return Err("Provider must be claude, codex, hermes, or gajecode.".to_string());
            }
            let prompt = required_option(args, "--prompt")?;
            if prompt.trim().is_empty() {
                return Err("The task prompt cannot be empty.".to_string());
            }
            let request = crate::control_plane::enqueue_request(
                "task.dispatch",
                Some(workspace.to_string_lossy().into_owned()),
                json!({
                    "provider": provider,
                    "prompt": prompt,
                    "model": option(args, "--model"),
                    "effort": option(args, "--effort"),
                    "permissionMode": option(args, "--permission"),
                    "stellaMode": flag(args, "--stella"),
                }),
                "atelier-cli",
            )?;
            print_json(&json!({
                "queued": true,
                "request": request,
                "next": format!("atelier task status {}", request.request_id),
            }))
        }
        "list" => print_json(&crate::control_plane::pending_requests()?),
        "status" => {
            let request_id = args
                .get(3)
                .ok_or_else(|| "Usage: atelier task status <request-id>".to_string())?;
            if let Some(receipt) = crate::control_plane::receipt(request_id)? {
                print_json(&json!({ "state": "completed", "receipt": receipt }))
            } else if crate::control_plane::pending_requests()?
                .iter()
                .any(|request| request.request_id == *request_id)
            {
                print_json(&json!({ "state": "pending", "requestId": request_id }))
            } else {
                print_json(&json!({ "state": "claimed-or-unknown", "requestId": request_id }))
            }
        }
        "cancel" => {
            let request_id = args
                .get(3)
                .ok_or_else(|| "Usage: atelier task cancel <request-id>".to_string())?;
            let reason = option(args, "--reason")
                .unwrap_or_else(|| "Cancelled from Atelier CLI before execution.".to_string());
            print_json(&crate::control_plane::cancel_pending_request(
                request_id, reason,
            )?)
        }
        other => Err(format!("Unknown Atelier task command: {other}")),
    }
}

fn run_worktree(args: &[String]) -> Result<(), String> {
    if args.get(2).map(String::as_str) != Some("create") {
        return Err("Usage: atelier worktree create --workspace <path> --task <name>".to_string());
    }
    let workspace = canonical_workspace(args)?;
    let task_id = required_option(args, "--task")?;
    let request = crate::control_plane::enqueue_request(
        "worktree.create",
        Some(workspace.to_string_lossy().into_owned()),
        json!({ "taskId": task_id }),
        "atelier-cli",
    )?;
    print_json(&json!({ "queued": true, "request": request }))
}

pub(crate) fn try_run(args: &[String]) -> Option<Result<(), String>> {
    let command = args.get(1).map(String::as_str)?;
    let handled = matches!(
        command,
        "help"
            | "--help"
            | "-h"
            | "version"
            | "--version"
            | "-V"
            | "status"
            | "snapshot"
            | "verify"
            | "task"
            | "worktree"
    );
    if !handled {
        return None;
    }
    let result = match command {
        "help" | "--help" | "-h" => {
            help();
            Ok(())
        }
        "version" | "--version" | "-V" => run_version(flag(args, "--json")),
        "status" => run_status(),
        "snapshot" => run_snapshot(args, false),
        "verify" => run_snapshot(args, true),
        "task" => run_task(args),
        "worktree" => run_worktree(args),
        _ => unreachable!(),
    };
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_explicit_cli_commands_take_over_gui_startup() {
        assert!(try_run(&["atelier".into(), "not-a-cli-command".into()]).is_none());
        assert!(try_run(&["atelier".into(), "version".into()]).is_some());
    }

    #[test]
    fn options_do_not_execute_shell_syntax() {
        let args = vec![
            "atelier".to_string(),
            "task".to_string(),
            "dispatch".to_string(),
            "--provider".to_string(),
            "codex".to_string(),
            "--prompt".to_string(),
            "hello; rm -rf /".to_string(),
        ];
        assert_eq!(
            option(&args, "--prompt").as_deref(),
            Some("hello; rm -rf /")
        );
    }
}
