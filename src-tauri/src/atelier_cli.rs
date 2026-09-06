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
  atelier worktree create --workspace <path> --task <name> [--json]\n\
  atelier provider patch --provider <hermes|gajecode> [--json]\n\
  atelier provider prepare --provider <hermes|gajecode> [--json]\n\n\
  atelier ui focus\n\
  atelier ui browser --url <https-url>\n\
  atelier ui open --url <loopback-url>\n\
  atelier ui screenshot|snapshot [bridge options]\n\
  atelier ui click --selector <css> [bridge options]\n\
  atelier ui fill --selector <css> --text <text> [bridge options]\n\
  atelier ui key --key <key> [bridge options]\n\
  atelier ui resize --width <px> --height <px> [bridge options]\n\n\
Task options:\n\
  --model <model> --effort <level> --permission <mode> --stella\n\
  --stage-models <json>   Stella Mode per-stage model map, e.g.\n\
                          '{{\"planning\":{{\"model\":\"claude-opus-4-8\"}},\"execution\":{{\"model\":\"claude-sonnet-4-6\"}}}}'\n\
                          Stages: planning, execution, verification, security, audit.\n\
                          Requires --stella. Unassigned stages inherit the session model.\n\n\
Bridge options:\n\
  --host <localhost> --port <port> --window <label>\n\n\
The CLI never accepts arbitrary shell commands. Mutating requests are queued for\n\
the running Atelier app and use the same provider, permission, approval, and audit paths.",
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

fn positive_u16_option(args: &[String], name: &str) -> Result<Option<u16>, String> {
    option(args, name)
        .map(|value| {
            value
                .parse::<u16>()
                .ok()
                .filter(|parsed| *parsed > 0)
                .ok_or_else(|| format!("{name} must be between 1 and 65535."))
        })
        .transpose()
}

fn required_u32_option(args: &[String], name: &str) -> Result<u32, String> {
    required_option(args, name)?
        .parse::<u32>()
        .map_err(|_| format!("{name} must be a positive integer."))
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

/// Stella Mode 단계 이름 정본. 프런트엔드 계약(src/lib/stellaStageModels.ts)의
/// STELLA_STAGES 와 반드시 일치해야 한다.
const STELLA_STAGE_NAMES: [&str; 5] =
    ["planning", "execution", "verification", "security", "audit"];

/// `--stage-models` JSON 검증 (fail-closed): 형식이 틀리면 큐에 넣지 않고
/// 즉시 오류를 돌려준다. 깊은 검증(모델 카탈로그 대조)은 앱 쪽 계약 모듈이
/// 실행 직전에 다시 수행한다.
fn parse_stage_models(raw: &str) -> Result<Value, String> {
    let value: Value = serde_json::from_str(raw.trim())
        .map_err(|error| format!("--stage-models must be valid JSON: {error}"))?;
    let object = value.as_object().ok_or_else(|| {
        format!(
            "--stage-models must be a JSON object keyed by stage name ({}).",
            STELLA_STAGE_NAMES.join(", ")
        )
    })?;
    for (stage, entry) in object {
        if !STELLA_STAGE_NAMES.contains(&stage.as_str()) {
            return Err(format!(
                "Unknown stage \"{stage}\" in --stage-models; expected one of {}.",
                STELLA_STAGE_NAMES.join(", ")
            ));
        }
        let assignment = entry.as_object().ok_or_else(|| {
            format!("Stage \"{stage}\" must map to an object with provider/model/effort strings.")
        })?;
        for (key, field) in assignment {
            if !matches!(key.as_str(), "provider" | "backend" | "model" | "effort") {
                return Err(format!(
                    "Stage \"{stage}\" has unsupported field \"{key}\"; allowed fields are provider, backend, model, effort."
                ));
            }
            if !field.is_string() {
                return Err(format!(
                    "Stage \"{stage}\" field \"{key}\" must be a string."
                ));
            }
        }
    }
    Ok(value)
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
                "claude" | "codex" | "hermes" | "gajecode" | "grok"
            ) {
                return Err(
                    "Provider must be claude, codex, hermes, gajecode, or grok.".to_string()
                );
            }
            let prompt = required_option(args, "--prompt")?;
            if prompt.trim().is_empty() {
                return Err("The task prompt cannot be empty.".to_string());
            }
            let stella_mode = flag(args, "--stella");
            let stage_models = option(args, "--stage-models")
                .map(|raw| parse_stage_models(&raw))
                .transpose()?;
            if stage_models.is_some() && !stella_mode {
                return Err(
                    "--stage-models applies to Stella Mode staged runs; add --stella.".to_string(),
                );
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
                    "stellaMode": stella_mode,
                    "stageModels": stage_models,
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

/// `atelier provider patch` — headless twin of the Connections patch button.
/// Runs the exact same backup → install → verify → rollback pipeline in this
/// process (guarded by the cross-process patch lock) and prints the outcome.
fn run_provider(args: &[String]) -> Result<(), String> {
    let action = args.get(2).map(String::as_str);
    if !matches!(action, Some("patch") | Some("prepare")) {
        return Err(
            "Usage: atelier provider <patch|prepare> --provider <hermes|gajecode> [--json]"
                .to_string(),
        );
    }
    let provider = required_option(args, "--provider")?.to_ascii_lowercase();
    if !matches!(provider.as_str(), "hermes" | "gajecode") {
        return Err("Provider must be hermes or gajecode.".to_string());
    }
    let json_output = flag(args, "--json");
    let app_support = crate::credentials::app_support_dir().ok_or_else(|| {
        "Could not resolve the Atelier Application Support directory.".to_string()
    })?;
    let mut progress = |state: &str, message: &str| {
        if !json_output {
            println!("[{state}] {message}");
        }
    };
    if action == Some("prepare") {
        let readiness = crate::credentials::prepare_managed_runtime_blocking(
            &app_support,
            &provider,
            &mut progress,
        )?;
        return if json_output {
            print_json(&readiness)
        } else {
            println!(
                "{}: ready (installed {})",
                readiness.provider, readiness.installed_version
            );
            Ok(())
        };
    }
    let outcome =
        crate::provider_patch::patch_provider_blocking(&app_support, &provider, &mut progress)?;
    if json_output {
        print_json(&outcome)
    } else {
        println!(
            "{}: {} -> {}{}",
            outcome.provider,
            outcome.from_version.as_deref().unwrap_or("-"),
            outcome.to_version,
            if outcome.no_op {
                " (already latest)"
            } else {
                ""
            },
        );
        Ok(())
    }
}

fn run_ui(args: &[String]) -> Result<(), String> {
    let subcommand = args.get(2).map(String::as_str).unwrap_or("");
    let (action, target, value, width, height) = match subcommand {
        "focus" => ("atelier.focus", None, None, None, None),
        "browser" => (
            "browser.open",
            Some(required_option(args, "--url")?),
            None,
            None,
            None,
        ),
        "open" => (
            "preview.open",
            Some(required_option(args, "--url")?),
            None,
            None,
            None,
        ),
        "screenshot" => ("preview.screenshot", None, None, None, None),
        "snapshot" => ("preview.snapshot", None, None, None, None),
        "click" => (
            "preview.click",
            Some(required_option(args, "--selector")?),
            None,
            None,
            None,
        ),
        "fill" => (
            "preview.type",
            Some(required_option(args, "--selector")?),
            Some(required_option(args, "--text")?),
            None,
            None,
        ),
        "key" => (
            "preview.key",
            None,
            Some(required_option(args, "--key")?),
            None,
            None,
        ),
        "resize" => (
            "preview.resize",
            None,
            None,
            Some(required_u32_option(args, "--width")?),
            Some(required_u32_option(args, "--height")?),
        ),
        _ => {
            return Err(
                "Usage: atelier ui <focus|browser|open|screenshot|snapshot|click|fill|key|resize> [options]"
                    .to_string(),
            )
        }
    };
    let request = crate::control_plane::enqueue_request(
        "computer.use",
        None,
        json!({
            "action": action,
            "target": target,
            "value": value,
            "host": option(args, "--host"),
            "port": positive_u16_option(args, "--port")?,
            "windowLabel": option(args, "--window"),
            "width": width,
            "height": height,
        }),
        "atelier-cli",
    )?;
    print_json(&json!({
        "queued": true,
        "approvalRequired": true,
        "request": request,
        "next": format!("atelier task status {}", request.request_id),
    }))
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
            | "provider"
            | "ui"
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
        "provider" => run_provider(args),
        "ui" => run_ui(args),
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
    fn stage_models_json_is_validated_fail_closed() {
        // 유효 입력: 단계별 모델이 그대로 페이로드에 실린다.
        let parsed = parse_stage_models(
            r#"{"planning":{"model":"claude-opus-4-8"},"execution":{"model":"claude-sonnet-4-6","effort":"low"}}"#,
        )
        .expect("valid stage models");
        assert_eq!(
            parsed["planning"]["model"].as_str(),
            Some("claude-opus-4-8")
        );
        assert_eq!(
            parsed["execution"]["model"].as_str(),
            Some("claude-sonnet-4-6")
        );

        // fail-closed: 잘못된 JSON / 알 수 없는 단계 / 잘못된 필드는 큐 진입 전에 거부.
        assert!(parse_stage_models("{nope").is_err());
        assert!(parse_stage_models(r#"["planning"]"#).is_err());
        assert!(parse_stage_models(r#"{"deploy":{"model":"x"}}"#).is_err());
        assert!(parse_stage_models(r#"{"planning":"claude"}"#).is_err());
        assert!(parse_stage_models(r#"{"planning":{"speed":"fast"}}"#).is_err());
        // hermes 하위 backend 명시 (OpenRouter 의 anthropic/claude-* 같은
        // 모호한 모델 값 확정용) 는 유효 필드다.
        assert!(parse_stage_models(
            r#"{"planning":{"provider":"hermes","backend":"openrouter","model":"anthropic/claude-haiku-4.5"}}"#
        )
        .is_ok());
        assert!(parse_stage_models(r#"{"planning":{"model":1}}"#).is_err());
    }

    #[test]
    fn stage_models_option_requires_stella_mode() {
        let args = vec![
            "atelier".to_string(),
            "task".to_string(),
            "dispatch".to_string(),
            "--workspace".to_string(),
            std::env::temp_dir().to_string_lossy().into_owned(),
            "--provider".to_string(),
            "claude".to_string(),
            "--prompt".to_string(),
            "hello".to_string(),
            "--stage-models".to_string(),
            r#"{"planning":{"model":"claude-opus-4-8"}}"#.to_string(),
        ];
        let result = run_task(&args);
        assert!(result
            .unwrap_err()
            .contains("--stage-models applies to Stella Mode staged runs"));
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
