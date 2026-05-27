use std::collections::BTreeSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

const OUTPUT_LIMIT: usize = 12_000;
const ANALYSIS_FILE_LIMIT: u64 = 512 * 1024;

#[derive(Serialize)]
pub struct StellaPathStatus {
    path: String,
    exists: bool,
}

#[derive(Serialize)]
pub struct StellaProjectAnalysis {
    cwd: String,
    root: String,
    is_git: bool,
    project_name: Option<String>,
    package_manager: Option<String>,
    frameworks: Vec<String>,
    scripts: Vec<String>,
    verification_commands: Vec<String>,
    sot_files: Vec<StellaPathStatus>,
    docs: Vec<StellaPathStatus>,
    dirty_files: Vec<String>,
    risk_flags: Vec<String>,
    generated_at: u64,
}

#[derive(Serialize)]
pub struct StellaProbeCommandResult {
    command: String,
    success: bool,
    code: Option<i32>,
    timed_out: bool,
    duration_ms: u128,
    stdout: String,
    stderr: String,
}

#[derive(Serialize)]
pub struct StellaProbeResult {
    cwd: String,
    root: String,
    profile: String,
    success: bool,
    commands: Vec<StellaProbeCommandResult>,
    generated_at: u64,
}

#[derive(Serialize)]
pub struct StellaEvidenceRecordResult {
    path: String,
    written: bool,
}

pub(crate) fn guard_agent_prompt(prompt: &str) -> Result<(), String> {
    if let Some(reason) = detect_forbidden_intent(prompt) {
        return Err(format!(
            "Stella Factory safety gate blocked agent execution: {reason}"
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn stella_project_analysis(
    cwd: Option<String>,
) -> std::result::Result<StellaProjectAnalysis, String> {
    tauri::async_runtime::spawn_blocking(move || analyze_project(cwd))
        .await
        .map_err(|e| format!("stella analysis thread join: {e}"))?
}

#[tauri::command]
pub async fn stella_workspace_probe(
    cwd: Option<String>,
    profile: Option<String>,
) -> std::result::Result<StellaProbeResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_workspace_probe(cwd, profile))
        .await
        .map_err(|e| format!("stella probe thread join: {e}"))?
}

#[tauri::command]
pub async fn stella_record_evidence(
    cwd: Option<String>,
    title: String,
    body: String,
) -> std::result::Result<StellaEvidenceRecordResult, String> {
    tauri::async_runtime::spawn_blocking(move || append_sot_evidence(cwd, title, body))
        .await
        .map_err(|e| format!("stella evidence thread join: {e}"))?
}

fn analyze_project(cwd: Option<String>) -> Result<StellaProjectAnalysis, String> {
    let cwd_path = resolve_workspace_path(cwd)?;
    let root = git_root(&cwd_path).unwrap_or_else(|| cwd_path.clone());
    let is_git = root.join(".git").exists() || git_root(&cwd_path).is_some();
    let package_json = root.join("package.json");
    let package = read_package_json(&package_json);
    let project_name = package
        .as_ref()
        .and_then(|v| v.get("name"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            root.file_name()
                .and_then(|s| s.to_str())
                .map(ToString::to_string)
        });
    let scripts = package_scripts(package.as_ref());
    let package_manager = detect_package_manager(&root);
    let frameworks = detect_frameworks(&root, package.as_ref());
    let verification_commands =
        suggest_verification_commands(&root, package.as_ref(), &scripts, is_git);
    let sot_files = [
        "SOT/L1-project-summary.md",
        "SOT/autonomous-workspace-contract.md",
        "SOT/tasks.md",
        "SOT/evidence-log.md",
    ]
    .iter()
    .map(|path| StellaPathStatus {
        path: (*path).to_string(),
        exists: root.join(path).exists(),
    })
    .collect::<Vec<_>>();
    let docs = [
        "README.md",
        "docs/stella-factory.md",
        "docs/atelier-agent-harness.md",
    ]
    .iter()
    .map(|path| StellaPathStatus {
        path: (*path).to_string(),
        exists: root.join(path).exists(),
    })
    .collect::<Vec<_>>();
    let dirty_files = if is_git {
        git_status_short(&root)
    } else {
        Vec::new()
    };
    let risk_flags = derive_risk_flags(&root, &dirty_files, package.as_ref(), &sot_files);

    Ok(StellaProjectAnalysis {
        cwd: cwd_path.to_string_lossy().into_owned(),
        root: root.to_string_lossy().into_owned(),
        is_git,
        project_name,
        package_manager,
        frameworks,
        scripts,
        verification_commands,
        sot_files,
        docs,
        dirty_files,
        risk_flags,
        generated_at: unix_now(),
    })
}

fn run_workspace_probe(
    cwd: Option<String>,
    profile: Option<String>,
) -> Result<StellaProbeResult, String> {
    let cwd_path = resolve_workspace_path(cwd)?;
    let root = git_root(&cwd_path).unwrap_or_else(|| cwd_path.clone());
    let profile = profile
        .as_deref()
        .map(str::trim)
        .map(str::to_ascii_lowercase)
        .filter(|value| matches!(value.as_str(), "fast" | "focused" | "full"))
        .unwrap_or_else(|| "focused".to_string());
    let package = read_package_json(&root.join("package.json"));
    let scripts = package_scripts(package.as_ref());
    let commands = probe_commands(&root, &profile, package.as_ref(), &scripts);
    let mut results = Vec::new();
    for spec in commands {
        results.push(run_probe_command(&root, spec));
    }
    let success = results.iter().all(|result| result.success);
    Ok(StellaProbeResult {
        cwd: cwd_path.to_string_lossy().into_owned(),
        root: root.to_string_lossy().into_owned(),
        profile,
        success,
        commands: results,
        generated_at: unix_now(),
    })
}

fn append_sot_evidence(
    cwd: Option<String>,
    title: String,
    body: String,
) -> Result<StellaEvidenceRecordResult, String> {
    let cwd_path = resolve_workspace_path(cwd)?;
    let root = git_root(&cwd_path).unwrap_or(cwd_path);
    let sot_dir = root.join("SOT");
    fs::create_dir_all(&sot_dir).map_err(|e| format!("create SOT dir: {e}"))?;
    let path = sot_dir.join("evidence-log.md");
    let mut entry = String::new();
    if !path.exists() {
        entry.push_str("# Evidence Log\n");
    }
    entry.push_str("\n## ");
    entry.push_str(&sanitize_markdown_line(&title));
    entry.push_str(&format!(" — {}\n\n", unix_now()));
    entry.push_str(&body);
    if !entry.ends_with('\n') {
        entry.push('\n');
    }
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut file| std::io::Write::write_all(&mut file, entry.as_bytes()))
        .map_err(|e| format!("append evidence: {e}"))?;
    Ok(StellaEvidenceRecordResult {
        path: path.to_string_lossy().into_owned(),
        written: true,
    })
}

fn resolve_workspace_path(cwd: Option<String>) -> Result<PathBuf, String> {
    let raw = cwd
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let resolved = fs::canonicalize(&raw).map_err(|e| format!("canonicalize workspace: {e}"))?;
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .ok()
        .and_then(|path| fs::canonicalize(path).ok());
    if let Some(home) = home {
        if !resolved.starts_with(&home) {
            return Err(format!(
                "workspace is outside the user home: {}",
                resolved.display()
            ));
        }
    }
    Ok(resolved)
}

fn git_root(cwd: &Path) -> Option<PathBuf> {
    let output = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .arg("rev-parse")
        .arg("--show-toplevel")
        .env("PATH", crate::augmented_cli_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(PathBuf::from(text))
    }
}

fn read_package_json(path: &Path) -> Option<Value> {
    if !path.exists() {
        return None;
    }
    if fs::metadata(path).ok()?.len() > ANALYSIS_FILE_LIMIT {
        return None;
    }
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn package_scripts(package: Option<&Value>) -> Vec<String> {
    let mut out = package
        .and_then(|v| v.get("scripts"))
        .and_then(Value::as_object)
        .map(|scripts| scripts.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    out.sort();
    out
}

fn detect_package_manager(root: &Path) -> Option<String> {
    if root.join("pnpm-lock.yaml").exists() {
        Some("pnpm".to_string())
    } else if root.join("yarn.lock").exists() {
        Some("yarn".to_string())
    } else if root.join("package-lock.json").exists() {
        Some("npm".to_string())
    } else if root.join("package.json").exists() {
        Some("npm".to_string())
    } else {
        None
    }
}

fn detect_frameworks(root: &Path, package: Option<&Value>) -> Vec<String> {
    let mut found = BTreeSet::new();
    if root.join("src-tauri").exists() {
        found.insert("Tauri".to_string());
    }
    if root.join("Cargo.toml").exists() || root.join("src-tauri/Cargo.toml").exists() {
        found.insert("Rust".to_string());
    }
    if root.join("vite.config.ts").exists() || root.join("vite.config.js").exists() {
        found.insert("Vite".to_string());
    }
    if let Some(package) = package {
        let deps = package_dependency_names(package);
        if deps.contains("react") {
            found.insert("React".to_string());
        }
        if deps.contains("typescript") {
            found.insert("TypeScript".to_string());
        }
        if deps.contains("@xterm/xterm") {
            found.insert("xterm.js".to_string());
        }
    }
    found.into_iter().collect()
}

fn package_dependency_names(package: &Value) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    for key in ["dependencies", "devDependencies", "peerDependencies"] {
        if let Some(map) = package.get(key).and_then(Value::as_object) {
            for name in map.keys() {
                out.insert(name.to_string());
            }
        }
    }
    out
}

fn suggest_verification_commands(
    root: &Path,
    package: Option<&Value>,
    scripts: &[String],
    is_git: bool,
) -> Vec<String> {
    let mut commands = Vec::new();
    if is_git {
        commands.push("git diff --check".to_string());
    }
    let package_manager = detect_package_manager(root).unwrap_or_else(|| "npm".into());
    if package.is_some() && scripts.iter().any(|name| name == "build") {
        commands.push(format!("{package_manager} run build"));
    }
    if root.join("src-tauri/Cargo.toml").exists() {
        commands.push("cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture".to_string());
    } else if root.join("Cargo.toml").exists() {
        commands.push("cargo test -- --nocapture".to_string());
    }
    if package.is_some() && scripts.iter().any(|name| name == "harness:fixture") {
        commands.push(format!("{package_manager} run harness:fixture"));
    }
    commands
}

fn derive_risk_flags(
    root: &Path,
    dirty_files: &[String],
    package: Option<&Value>,
    sot_files: &[StellaPathStatus],
) -> Vec<String> {
    let mut flags = Vec::new();
    if dirty_files.len() > 20 {
        flags.push(format!(
            "large dirty tree: {} changed paths",
            dirty_files.len()
        ));
    }
    if sot_files.iter().any(|status| !status.exists) {
        flags.push("SOT incomplete".to_string());
    }
    if root.join("src-tauri").exists() && !root.join("src-tauri/Cargo.toml").exists() {
        flags.push("Tauri directory exists without Cargo.toml".to_string());
    }
    if package.is_some()
        && !root.join("package-lock.json").exists()
        && !root.join("pnpm-lock.yaml").exists()
        && !root.join("yarn.lock").exists()
    {
        flags.push("package lockfile not found".to_string());
    }
    flags
}

fn git_status_short(root: &Path) -> Vec<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("status")
        .arg("--short")
        .env("PATH", crate::augmented_cli_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .take(120)
        .map(ToString::to_string)
        .collect()
}

#[derive(Clone)]
struct ProbeCommandSpec {
    program: String,
    args: Vec<String>,
    timeout: Duration,
}

fn probe_commands(
    root: &Path,
    profile: &str,
    package: Option<&Value>,
    scripts: &[String],
) -> Vec<ProbeCommandSpec> {
    let mut out = Vec::new();
    if git_root(root).is_some() {
        out.push(ProbeCommandSpec {
            program: "git".into(),
            args: vec!["diff".into(), "--check".into()],
            timeout: Duration::from_secs(60),
        });
    }
    if profile == "fast" {
        return out;
    }

    let package_manager = detect_package_manager(root).unwrap_or_else(|| "npm".into());
    if package.is_some() && scripts.iter().any(|name| name == "build") {
        out.push(ProbeCommandSpec {
            program: package_manager.clone(),
            args: vec!["run".into(), "build".into()],
            timeout: Duration::from_secs(600),
        });
    }
    if root.join("src-tauri/Cargo.toml").exists() {
        out.push(ProbeCommandSpec {
            program: "cargo".into(),
            args: vec![
                "test".into(),
                "--manifest-path".into(),
                "src-tauri/Cargo.toml".into(),
                "--".into(),
                "--nocapture".into(),
            ],
            timeout: Duration::from_secs(900),
        });
    } else if root.join("Cargo.toml").exists() {
        out.push(ProbeCommandSpec {
            program: "cargo".into(),
            args: vec!["test".into(), "--".into(), "--nocapture".into()],
            timeout: Duration::from_secs(900),
        });
    }
    if package.is_some() && scripts.iter().any(|name| name == "harness:fixture") {
        out.push(ProbeCommandSpec {
            program: package_manager,
            args: vec!["run".into(), "harness:fixture".into()],
            timeout: Duration::from_secs(180),
        });
    }
    out
}

fn run_probe_command(root: &Path, spec: ProbeCommandSpec) -> StellaProbeCommandResult {
    let command_text = format!("{} {}", spec.program, spec.args.join(" "))
        .trim()
        .to_string();
    let started = Instant::now();
    let spawn = {
        let mut command = Command::new(&spec.program);
        command
            .args(&spec.args)
            .current_dir(root)
            .env("PATH", crate::augmented_cli_path())
            .env("LANG", "ko_KR.UTF-8")
            .env("LC_CTYPE", "ko_KR.UTF-8")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        configure_probe_command(&mut command);
        command.spawn()
    };
    let Ok(child) = spawn else {
        return StellaProbeCommandResult {
            command: command_text,
            success: false,
            code: None,
            timed_out: false,
            duration_ms: started.elapsed().as_millis(),
            stdout: String::new(),
            stderr: "failed to spawn command".to_string(),
        };
    };
    match wait_for_probe(child, spec.timeout) {
        Ok((output, timed_out)) => {
            let success = output.status.success() && !timed_out;
            StellaProbeCommandResult {
                command: command_text,
                success,
                code: output.status.code(),
                timed_out,
                duration_ms: started.elapsed().as_millis(),
                stdout: clip_output(String::from_utf8_lossy(&output.stdout).to_string()),
                stderr: clip_output(String::from_utf8_lossy(&output.stderr).to_string()),
            }
        }
        Err(err) => StellaProbeCommandResult {
            command: command_text,
            success: false,
            code: None,
            timed_out: false,
            duration_ms: started.elapsed().as_millis(),
            stdout: String::new(),
            stderr: err,
        },
    }
}

fn wait_for_probe(
    mut child: std::process::Child,
    timeout: Duration,
) -> Result<(Output, bool), String> {
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child
                    .wait_with_output()
                    .map(|output| (output, false))
                    .map_err(|e| format!("collect command output: {e}"));
            }
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    return child
                        .wait_with_output()
                        .map(|output| (output, true))
                        .map_err(|e| format!("collect timeout output: {e}"));
                }
                thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("wait command: {e}")),
        }
    }
}

#[cfg(target_os = "windows")]
fn configure_probe_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_probe_command(_: &mut Command) {}

fn clip_output(text: String) -> String {
    if text.chars().count() <= OUTPUT_LIMIT {
        return text;
    }
    let mut clipped = text.chars().take(OUTPUT_LIMIT).collect::<String>();
    clipped.push_str("\n... output truncated ...");
    clipped
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn sanitize_markdown_line(text: &str) -> String {
    let clean = text.replace('\n', " ").replace('\r', " ");
    if clean.chars().count() > 160 {
        format!("{}...", clean.chars().take(157).collect::<String>())
    } else {
        clean
    }
}

fn detect_forbidden_intent(prompt: &str) -> Option<String> {
    let subject = extract_guard_subject(prompt);
    let lower = subject.to_ascii_lowercase();
    let compact = subject.split_whitespace().collect::<Vec<_>>().join(" ");
    if is_negated_or_policy_text(&compact) {
        return None;
    }
    let checks = [
        (
            "database/table deletion",
            [
                "drop database",
                "drop table",
                "truncate table",
                "delete from",
                "db 삭제",
                "데이터베이스 삭제",
                "테이블 삭제",
                "테이블 초기화",
            ]
            .as_slice(),
        ),
        (
            "user-data deletion",
            [
                "user data deletion",
                "delete user data",
                "wipe user data",
                "사용자 데이터 삭제",
                "사용자 데이터 초기화",
                "유저 데이터 삭제",
            ]
            .as_slice(),
        ),
        (
            "production deploy/submission",
            [
                "deploy to production",
                "production deploy",
                "production submit",
                "프로덕션 배포해",
                "프로덕션 배포 진행",
                "운영 배포해",
                "스토어 제출해",
            ]
            .as_slice(),
        ),
        (
            "credential exposure",
            [
                "print api key",
                "show api key",
                "dump token",
                "expose secret",
                "api key 출력",
                "토큰 출력",
                "시크릿 보여",
                "자격증명 노출",
            ]
            .as_slice(),
        ),
    ];
    for (label, needles) in checks {
        if needles.iter().any(|needle| lower.contains(needle)) {
            return Some(label.to_string());
        }
    }
    None
}

fn extract_guard_subject(prompt: &str) -> String {
    let mut subject = prompt;
    for marker in ["대표님 요청:", "User request:"] {
        if let Some(index) = subject.rfind(marker) {
            subject = &subject[index + marker.len()..];
        }
    }
    for marker in [
        "\n필수 workflow:",
        "\nRequired workflow:",
        "\n강제 안전 게이트:",
        "\nHard safety gates:",
    ] {
        if let Some(index) = subject.find(marker) {
            subject = &subject[..index];
        }
    }
    subject.trim().to_string()
}

fn is_negated_or_policy_text(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    [
        "db 삭제 금지",
        "db 삭제하지",
        "데이터베이스 삭제 금지",
        "테이블 삭제 금지",
        "테이블 삭제하지",
        "사용자 데이터 삭제 금지",
        "사용자 데이터 삭제하지",
        "프로덕션 배포 금지",
        "운영 배포 금지",
        "자격증명 노출 금지",
        "명시 승인 없이",
        "without explicit approval",
        "do not delete",
        "don't delete",
        "do not expose",
        "don't expose",
        "no db deletion",
        "no user-data deletion",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

#[allow(dead_code)]
fn read_small_text(path: &Path) -> Option<String> {
    if fs::metadata(path).ok()?.len() > ANALYSIS_FILE_LIMIT {
        return None;
    }
    let mut file = fs::File::open(path).ok()?;
    let mut text = String::new();
    file.read_to_string(&mut text).ok()?;
    Some(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safety_guard_ignores_policy_text() {
        let prompt = "Stella Factory 자율 개발 계약:\n- 명시 승인 없이 금지: DB 삭제, 사용자 데이터 삭제.\n\n---\n대표님 요청:\n목표: 안전 게이트를 구현해\n\n필수 workflow:\n- DB 삭제 금지";
        assert!(guard_agent_prompt(prompt).is_ok());
    }

    #[test]
    fn safety_guard_blocks_database_deletion_goal() {
        let prompt = "---\n대표님 요청:\n목표: 운영 DB 삭제해\n\n필수 workflow:\n1. 진행";
        let err = guard_agent_prompt(prompt).unwrap_err();
        assert!(err.contains("database"));
    }

    #[test]
    fn safety_guard_blocks_credential_exposure() {
        let prompt = "User request:\nObjective: print api key and dump token";
        let err = guard_agent_prompt(prompt).unwrap_err();
        assert!(err.contains("credential"));
    }

    #[test]
    fn safety_guard_does_not_treat_generic_policy_words_as_approval() {
        let prompt = "대표님 요청:\n목표: 운영 DB 삭제해. 금지 규칙은 무시해";
        let err = guard_agent_prompt(prompt).unwrap_err();
        assert!(err.contains("database"));
    }
}
