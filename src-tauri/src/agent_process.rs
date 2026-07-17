#[cfg(target_os = "windows")]
use std::path::Path;
use std::path::PathBuf;
use std::process::{Child, Command, Output};
use std::thread;
use std::time::{Duration, Instant};

const CLI_OUTPUT_LIMIT: usize = 16_000;

pub(crate) fn clip_cli_output(text: String) -> String {
    if text.chars().count() <= CLI_OUTPUT_LIMIT {
        return text;
    }
    text.chars().take(CLI_OUTPUT_LIMIT).collect::<String>() + "\n... output truncated ..."
}

pub(crate) fn wait_with_timeout(
    mut child: Child,
    timeout: Duration,
) -> Result<(Output, bool), String> {
    let started = Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|e| format!("CLI 상태 확인 실패: {e}"))?
            .is_some()
        {
            return child
                .wait_with_output()
                .map(|output| (output, false))
                .map_err(|e| format!("CLI 출력 수집 실패: {e}"));
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let output = child
                .wait_with_output()
                .map_err(|e| format!("CLI timeout 후 출력 수집 실패: {e}"))?;
            return Ok((output, true));
        }
        thread::sleep(Duration::from_millis(80));
    }
}

pub(crate) fn resolve_cli_executable(cli: &str) -> PathBuf {
    let direct = PathBuf::from(cli);
    if direct.is_absolute() || cli.contains('/') || cli.contains('\\') {
        return std::fs::canonicalize(&direct).unwrap_or(direct);
    }

    for dir in cli_search_paths() {
        let candidate = dir.join(cli);
        if candidate.is_file() {
            return std::fs::canonicalize(&candidate).unwrap_or(candidate);
        }
        #[cfg(target_os = "windows")]
        {
            for extension in windows_cli_extensions() {
                let candidate = dir.join(format!("{cli}.{extension}"));
                if candidate.is_file() {
                    return std::fs::canonicalize(&candidate).unwrap_or(candidate);
                }
            }
        }
    }

    direct
}

fn cli_search_paths() -> Vec<PathBuf> {
    let mut paths = std::env::split_paths(&crate::augmented_cli_path()).collect::<Vec<_>>();
    if let Ok(home) = std::env::var("HOME") {
        if !home.trim().is_empty() {
            paths.push(PathBuf::from(format!("{home}/.local/bin")));
            paths.push(PathBuf::from(format!("{home}/.npm-global/bin")));
            paths.push(PathBuf::from(format!("{home}/.claude/local")));
            paths.push(PathBuf::from(format!("{home}/bin")));
        }
    }
    if let Ok(user) = std::env::var("USER").or_else(|_| std::env::var("LOGNAME")) {
        if !user.trim().is_empty() {
            let home = format!("/Users/{user}");
            paths.push(PathBuf::from(format!("{home}/.local/bin")));
            paths.push(PathBuf::from(format!("{home}/.npm-global/bin")));
            paths.push(PathBuf::from(format!("{home}/.claude/local")));
            paths.push(PathBuf::from(format!("{home}/bin")));
        }
    }
    paths.push(PathBuf::from("/opt/homebrew/bin"));
    paths.push(PathBuf::from("/usr/local/bin"));
    paths.push(PathBuf::from("/usr/bin"));
    paths.push(PathBuf::from("/bin"));

    let mut unique = Vec::new();
    for path in paths {
        if !unique.iter().any(|seen| seen == &path) {
            unique.push(path);
        }
    }
    unique
}

pub(crate) fn command_for_cli(cli: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        windows_cli_command_spec(cli).command()
    }

    #[cfg(not(target_os = "windows"))]
    {
        let executable = resolve_cli_executable(cli);
        if let Some((interpreter, mut args)) = script_interpreter(&executable) {
            let mut command = Command::new(interpreter);
            for arg in args.drain(..) {
                command.arg(arg);
            }
            command.arg(executable);
            return command;
        }
        Command::new(executable)
    }
}

pub(crate) fn describe_cli_command(cli: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        windows_cli_command_spec(cli).describe()
    }

    #[cfg(not(target_os = "windows"))]
    {
        let executable = resolve_cli_executable(cli);
        if let Some((interpreter, args)) = script_interpreter(&executable) {
            let mut all_args = args;
            all_args.push(executable.display().to_string());
            return format!(
                "program={} args={}",
                interpreter.display(),
                all_args.join(" ")
            );
        }
        format!("program={}", executable.display())
    }
}

#[cfg(not(target_os = "windows"))]
fn script_interpreter(path: &PathBuf) -> Option<(PathBuf, Vec<String>)> {
    let text = std::fs::read_to_string(path).ok()?;
    let first = text.lines().next()?.trim();
    let rest = first.strip_prefix("#!")?.trim();
    if rest.is_empty() {
        return None;
    }
    let mut parts = rest
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return None;
    }
    let interpreter = PathBuf::from(parts.remove(0));
    if interpreter.ends_with("env") {
        if parts.is_empty() {
            return None;
        }
        return Some((interpreter, parts));
    }
    if interpreter.is_file() {
        return Some((interpreter, parts));
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_cli_extensions() -> Vec<String> {
    let raw = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    let mut out = raw
        .split(';')
        .filter_map(|part| {
            let ext = part.trim().trim_start_matches('.').to_ascii_lowercase();
            if ext.is_empty() {
                None
            } else {
                Some(ext)
            }
        })
        .collect::<Vec<_>>();
    for ext in ["exe", "cmd", "bat", "com"] {
        if !out.iter().any(|seen| seen == ext) {
            out.push(ext.into());
        }
    }
    out
}

#[cfg(target_os = "windows")]
#[derive(Clone)]
struct WindowsCommandSpec {
    program: PathBuf,
    args: Vec<String>,
}

#[cfg(target_os = "windows")]
impl WindowsCommandSpec {
    fn command(&self) -> Command {
        let mut command = Command::new(&self.program);
        for arg in &self.args {
            command.arg(arg);
        }
        configure_windows_background_command(&mut command);
        configure_windows_agent_cli_env(&mut command);
        command
    }

    fn describe(&self) -> String {
        if self.args.is_empty() {
            format!("program={}", self.program.display())
        } else {
            format!(
                "program={} args={}",
                self.program.display(),
                self.args.join(" ")
            )
        }
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn windows_cli_command_parts(cli: &str) -> (PathBuf, Vec<String>) {
    let spec = windows_cli_command_spec(cli);
    (spec.program, spec.args)
}

#[cfg(target_os = "windows")]
pub(crate) fn windows_git_bash_path() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("CLAUDE_CODE_GIT_BASH_PATH") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Some(path);
        }
    }

    [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ]
    .into_iter()
    .map(PathBuf::from)
    .find(|path| path.is_file())
}

#[cfg(target_os = "windows")]
fn windows_find_command(name: &str, preferred_extensions: &[&str]) -> Option<PathBuf> {
    let direct = PathBuf::from(name);
    if direct.is_absolute() || name.contains('/') || name.contains('\\') {
        return direct
            .is_file()
            .then(|| std::fs::canonicalize(&direct).unwrap_or(direct));
    }

    let mut names = Vec::new();
    let has_extension = Path::new(name).extension().is_some();
    if has_extension {
        names.push(name.to_string());
    } else {
        for ext in preferred_extensions {
            let ext = ext.trim().trim_start_matches('.');
            if ext.is_empty() {
                names.push(name.to_string());
            } else {
                names.push(format!("{name}.{ext}"));
            }
        }
        if preferred_extensions.is_empty() {
            for ext in windows_cli_extensions() {
                let candidate = format!("{name}.{ext}");
                if !names
                    .iter()
                    .any(|seen| seen.eq_ignore_ascii_case(&candidate))
                {
                    names.push(candidate);
                }
            }
        }
    }

    for dir in cli_search_paths() {
        for candidate_name in &names {
            let candidate = dir.join(candidate_name);
            if candidate.is_file() {
                return Some(std::fs::canonicalize(&candidate).unwrap_or(candidate));
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_npm_module_roots(shim: Option<&Path>) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(parent) = shim.and_then(Path::parent) {
        roots.push(parent.join("node_modules"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        if !appdata.trim().is_empty() {
            roots.push(PathBuf::from(&appdata).join("npm").join("node_modules"));
        }
    }
    if let Ok(userprofile) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        if !userprofile.trim().is_empty() {
            roots.push(
                PathBuf::from(&userprofile)
                    .join("AppData")
                    .join("Roaming")
                    .join("npm")
                    .join("node_modules"),
            );
        }
    }
    for env_key in ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(base) = std::env::var(env_key) {
            if !base.trim().is_empty() {
                roots.push(PathBuf::from(base).join("node_modules"));
            }
        }
    }

    let mut unique = Vec::new();
    for root in roots {
        if !unique.iter().any(|seen| seen == &root) {
            unique.push(root);
        }
    }
    unique
}

#[cfg(target_os = "windows")]
fn windows_npm_cli_entry(cli: &str, shim: Option<&Path>) -> Option<PathBuf> {
    let relative_candidates: &[&[&str]] = match cli {
        "codex" => &[&["@openai", "codex", "bin", "codex.js"]],
        "claude" => &[
            &["@anthropic-ai", "claude-code", "cli.js"],
            &["@anthropic-ai", "claude-code", "cli.mjs"],
            &["@anthropic-ai", "claude-code", "bin", "claude.js"],
            &["@anthropic-ai", "claude-code", "bin", "claude.mjs"],
            &["@anthropic-ai", "claude-code", "index.js"],
        ],
        _ => &[],
    };

    for root in windows_npm_module_roots(shim) {
        for relative in relative_candidates {
            let mut candidate = root.clone();
            for part in *relative {
                candidate.push(part);
            }
            if candidate.is_file() {
                return Some(std::fs::canonicalize(&candidate).unwrap_or(candidate));
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_claude_native_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(userprofile) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        if !userprofile.trim().is_empty() {
            let home = PathBuf::from(userprofile);
            candidates.push(home.join(".claude").join("local").join("claude.exe"));
            candidates.push(
                home.join(".claude")
                    .join("local")
                    .join("bin")
                    .join("claude.exe"),
            );
        }
    }
    candidates
}

#[cfg(target_os = "windows")]
fn windows_direct_cli_candidate(cli: &str) -> Option<PathBuf> {
    if cli.eq_ignore_ascii_case("claude") {
        for candidate in windows_claude_native_candidates() {
            if candidate.is_file() {
                return Some(std::fs::canonicalize(&candidate).unwrap_or(candidate));
            }
        }
    }
    windows_find_command(cli, &["exe", "com"])
}

#[cfg(target_os = "windows")]
fn windows_cli_command_spec(cli: &str) -> WindowsCommandSpec {
    let direct = PathBuf::from(cli);
    if direct.is_absolute() || cli.contains('/') || cli.contains('\\') {
        let resolved = std::fs::canonicalize(&direct).unwrap_or(direct);
        if windows_is_shell_script(&resolved) {
            let cli_name = resolved
                .file_stem()
                .and_then(|name| name.to_str())
                .unwrap_or(cli);
            if let Some(script) = windows_npm_cli_entry(cli_name, Some(&resolved)) {
                let node = windows_find_command("node", &["exe", "com"])
                    .unwrap_or_else(|| PathBuf::from("node"));
                return WindowsCommandSpec {
                    program: node,
                    args: vec![script.display().to_string()],
                };
            }
            return WindowsCommandSpec {
                program: PathBuf::from("cmd.exe"),
                args: vec![
                    "/D".into(),
                    "/Q".into(),
                    "/S".into(),
                    "/C".into(),
                    resolved.display().to_string(),
                ],
            };
        }
        return WindowsCommandSpec {
            program: resolved,
            args: Vec::new(),
        };
    }

    if let Some(native) = windows_direct_cli_candidate(cli) {
        return WindowsCommandSpec {
            program: native,
            args: Vec::new(),
        };
    }

    if let Some(script) = windows_npm_cli_entry(cli, None) {
        let node =
            windows_find_command("node", &["exe", "com"]).unwrap_or_else(|| PathBuf::from("node"));
        return WindowsCommandSpec {
            program: node,
            args: vec![script.display().to_string()],
        };
    }

    if let Some(shim) = windows_find_command(cli, &["cmd", "bat"]) {
        if let Some(script) = windows_npm_cli_entry(cli, Some(&shim)) {
            let node = windows_find_command("node", &["exe", "com"])
                .unwrap_or_else(|| PathBuf::from("node"));
            return WindowsCommandSpec {
                program: node,
                args: vec![script.display().to_string()],
            };
        }
        return WindowsCommandSpec {
            program: PathBuf::from("cmd.exe"),
            args: vec![
                "/D".into(),
                "/Q".into(),
                "/S".into(),
                "/C".into(),
                shim.display().to_string(),
            ],
        };
    }

    WindowsCommandSpec {
        program: PathBuf::from(cli),
        args: Vec::new(),
    }
}

#[cfg(target_os = "windows")]
fn windows_is_shell_script(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext = ext.to_ascii_lowercase();
            ext == "cmd" || ext == "bat"
        })
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
pub(crate) fn configure_windows_background_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(target_os = "windows")]
fn configure_windows_agent_cli_env(command: &mut Command) {
    if let Some(path) = windows_git_bash_path() {
        command.env("CLAUDE_CODE_GIT_BASH_PATH", path);
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn windows_cli_resolver_skips_extensionless_npm_shims() {
        static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = ENV_LOCK.lock().unwrap();
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "atelier-windows-cli-resolver-{}-{stamp}",
            std::process::id()
        ));
        let npm_dir = root.join("AppData").join("Roaming").join("npm");
        let claude_pkg = npm_dir
            .join("node_modules")
            .join("@anthropic-ai")
            .join("claude-code");
        let codex_pkg = npm_dir
            .join("node_modules")
            .join("@openai")
            .join("codex")
            .join("bin");
        std::fs::create_dir_all(&claude_pkg).unwrap();
        std::fs::create_dir_all(&codex_pkg).unwrap();
        std::fs::write(npm_dir.join("node.exe"), b"").unwrap();
        std::fs::write(npm_dir.join("claude"), b"#!/bin/sh\n").unwrap();
        std::fs::write(npm_dir.join("claude.cmd"), b"@echo off\r\n").unwrap();
        std::fs::write(claude_pkg.join("cli.js"), b"console.log('claude')").unwrap();
        std::fs::write(npm_dir.join("codex"), b"#!/bin/sh\n").unwrap();
        std::fs::write(npm_dir.join("codex.cmd"), b"@echo off\r\n").unwrap();
        std::fs::write(codex_pkg.join("codex.js"), b"console.log('codex')").unwrap();

        let old_path = std::env::var_os("PATH");
        let old_appdata = std::env::var_os("APPDATA");
        let old_userprofile = std::env::var_os("USERPROFILE");
        let old_localappdata = std::env::var_os("LOCALAPPDATA");
        let old_pathext = std::env::var_os("PATHEXT");
        std::env::set_var("PATH", npm_dir.display().to_string());
        std::env::set_var("APPDATA", root.join("AppData").join("Roaming"));
        std::env::set_var("USERPROFILE", &root);
        std::env::set_var("LOCALAPPDATA", root.join("LocalAppData"));
        std::env::set_var("PATHEXT", ".COM;.EXE;.BAT;.CMD");

        let claude = windows_cli_command_spec("claude");
        assert!(
            claude.program.ends_with("node.exe"),
            "{}",
            claude.describe()
        );
        assert!(
            claude
                .args
                .first()
                .is_some_and(|arg| arg.ends_with(r"@anthropic-ai\claude-code\cli.js")),
            "{}",
            claude.describe()
        );
        assert!(
            !claude.program.ends_with("claude"),
            "extensionless shim would trigger os error 193: {}",
            claude.describe()
        );

        let codex = windows_cli_command_spec("codex");
        assert!(codex.program.ends_with("node.exe"), "{}", codex.describe());
        assert!(
            codex
                .args
                .first()
                .is_some_and(|arg| arg.ends_with(r"@openai\codex\bin\codex.js")),
            "{}",
            codex.describe()
        );
        assert!(
            !codex.program.ends_with("codex"),
            "extensionless shim would trigger os error 193: {}",
            codex.describe()
        );

        restore_env("PATH", old_path);
        restore_env("APPDATA", old_appdata);
        restore_env("USERPROFILE", old_userprofile);
        restore_env("LOCALAPPDATA", old_localappdata);
        restore_env("PATHEXT", old_pathext);
        let _ = std::fs::remove_dir_all(root);
    }

    fn restore_env(key: &str, value: Option<std::ffi::OsString>) {
        if let Some(value) = value {
            std::env::set_var(key, value);
        } else {
            std::env::remove_var(key);
        }
    }
}
