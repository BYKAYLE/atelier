use std::ffi::{OsStr, OsString};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const MACOS_SANDBOX_EXEC: &str = "/usr/bin/sandbox-exec";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ManagedSandboxPermission {
    Basic,
    Auto,
}

impl ManagedSandboxPermission {
    pub(crate) fn parse(value: &str) -> Self {
        if value.eq_ignore_ascii_case("auto") {
            Self::Auto
        } else {
            Self::Basic
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::Basic => "basic",
            Self::Auto => "auto",
        }
    }
}

pub(crate) struct ManagedSandboxSpec<'a> {
    pub(crate) provider: &'a str,
    pub(crate) permission: ManagedSandboxPermission,
    pub(crate) workspace: &'a Path,
    pub(crate) provider_readonly_roots: &'a [PathBuf],
    pub(crate) provider_writable_roots: &'a [PathBuf],
    /// Readable provider content that must remain immutable even when it is
    /// nested below a broader writable provider home.
    pub(crate) provider_immutable_roots: &'a [PathBuf],
    pub(crate) provider_temp: &'a Path,
    pub(crate) expected_executable: Option<&'a Path>,
}

#[cfg(target_os = "macos")]
fn canonical_existing_path(path: &Path, label: &str) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|error| format!("resolve {label} {}: {error}", path.display()))
}

#[cfg(target_os = "macos")]
fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}

#[cfg(target_os = "macos")]
fn linked_git_read_roots(workspace: &Path) -> Vec<PathBuf> {
    let dot_git = workspace.join(".git");
    let Ok(metadata) = fs::metadata(&dot_git) else {
        return Vec::new();
    };
    if metadata.is_dir() {
        return fs::canonicalize(dot_git).into_iter().collect();
    }
    let Ok(text) = fs::read_to_string(&dot_git) else {
        return Vec::new();
    };
    let Some(raw_git_dir) = text
        .lines()
        .find_map(|line| line.trim().strip_prefix("gitdir:").map(str::trim))
        .filter(|value| !value.is_empty())
    else {
        return Vec::new();
    };
    let git_dir = {
        let path = PathBuf::from(raw_git_dir);
        if path.is_absolute() {
            path
        } else {
            workspace.join(path)
        }
    };
    let Ok(git_dir) = fs::canonicalize(git_dir) else {
        return Vec::new();
    };
    let mut roots = vec![git_dir.clone()];
    let common_dir_file = git_dir.join("commondir");
    if let Ok(raw_common_dir) = fs::read_to_string(common_dir_file) {
        let raw_common_dir = raw_common_dir.trim();
        if !raw_common_dir.is_empty() {
            let common_dir = {
                let path = PathBuf::from(raw_common_dir);
                if path.is_absolute() {
                    path
                } else {
                    git_dir.join(path)
                }
            };
            if let Ok(common_dir) = fs::canonicalize(common_dir) {
                push_unique_path(&mut roots, common_dir);
            }
        }
    }
    roots
}

#[cfg(target_os = "macos")]
fn sbpl_string(value: &OsStr) -> Result<String, String> {
    let value = value
        .to_str()
        .ok_or_else(|| "managed sandbox path is not valid UTF-8".to_string())?;
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            other => escaped.push(other),
        }
    }
    Ok(escaped)
}

#[cfg(target_os = "macos")]
fn subpath_filter(path: &Path) -> Result<String, String> {
    Ok(format!("(subpath \"{}\")", sbpl_string(path.as_os_str())?))
}

#[cfg(target_os = "macos")]
fn literal_filter(path: &Path) -> Result<String, String> {
    Ok(format!("(literal \"{}\")", sbpl_string(path.as_os_str())?))
}

#[cfg(target_os = "macos")]
const SYSTEM_RUNTIME_READ_ROOTS: &[&str] = &[
    "/System",
    "/usr",
    "/bin",
    "/sbin",
    "/Library/Apple",
    "/Library/Developer",
    "/Library/Frameworks",
    "/Library/Preferences",
    "/Library/Security",
    "/Applications/Xcode.app",
    "/opt/homebrew",
    "/opt/local",
    "/private/etc",
    "/private/var/db/dyld",
    "/private/var/db/receipts",
    "/private/var/db/timezone",
    "/private/var/run",
    "/private/var/select",
    "/private/tmp",
];

#[cfg(target_os = "macos")]
const SYSTEM_RUNTIME_PARENT_PATHS: &[&str] = &[
    "/",
    "/Applications",
    "/Library",
    "/etc",
    "/opt",
    "/private",
    "/tmp",
    "/var",
];

#[cfg(target_os = "macos")]
fn managed_sandbox_profile(
    permission: ManagedSandboxPermission,
    workspace: &Path,
    provider_readonly_roots: &[PathBuf],
    provider_roots: &[PathBuf],
    provider_immutable_roots: &[PathBuf],
    provider_temp: &Path,
    executable: &Path,
) -> Result<String, String> {
    let mut profile = String::from(
        "(version 1)\n\
         (deny default)\n\
         (deny appleevent-send)\n\
         (deny mach-lookup)\n\
         (deny mach-register)\n\
         (allow process-fork)\n\
         (allow process-exec)\n\
         (allow network-outbound)\n\
         (allow sysctl-read)\n",
    );

    for path in SYSTEM_RUNTIME_PARENT_PATHS {
        profile.push_str(&format!(
            "(allow file-read* file-test-existence {})\n",
            literal_filter(Path::new(path))?
        ));
    }
    for root in SYSTEM_RUNTIME_READ_ROOTS {
        profile.push_str(&format!(
            "(allow file-read* file-test-existence {})\n",
            subpath_filter(Path::new(root))?
        ));
    }

    let mut readable_roots = vec![workspace.to_path_buf()];
    for root in provider_readonly_roots {
        push_unique_path(&mut readable_roots, root.clone());
    }
    for root in provider_roots {
        push_unique_path(&mut readable_roots, root.clone());
    }
    push_unique_path(&mut readable_roots, provider_temp.to_path_buf());
    for root in linked_git_read_roots(workspace) {
        push_unique_path(&mut readable_roots, root);
    }
    for root in readable_roots {
        profile.push_str(&format!(
            "(allow file-read* file-test-existence {})\n",
            subpath_filter(&root)?
        ));
    }
    for root in provider_readonly_roots {
        profile.push_str(&format!(
            "(allow file-read* file-test-existence file-map-executable {})\n",
            subpath_filter(root)?
        ));
    }
    profile.push_str(&format!(
        "(allow file-read* file-test-existence file-map-executable {})\n",
        literal_filter(executable)?
    ));

    let mut writable_roots = provider_roots.to_vec();
    push_unique_path(&mut writable_roots, provider_temp.to_path_buf());
    if permission == ManagedSandboxPermission::Auto {
        push_unique_path(&mut writable_roots, workspace.to_path_buf());
    }
    for root in writable_roots {
        profile.push_str(&format!("(allow file-write* {})\n", subpath_filter(&root)?));
    }
    profile.push_str(&format!(
        "(allow file-write* {})\n",
        subpath_filter(Path::new("/private/tmp"))?
    ));
    for root in provider_immutable_roots {
        profile.push_str(&format!("(deny file-write* {})\n", subpath_filter(root)?));
    }
    for device in ["/dev/null", "/dev/zero", "/dev/random", "/dev/urandom"] {
        profile.push_str(&format!(
            "(allow file-read* file-write* {})\n",
            literal_filter(Path::new(device))?
        ));
    }
    Ok(profile)
}

#[cfg(target_os = "macos")]
fn copy_command_environment(source: &Command, destination: &mut Command) {
    for (key, value) in source.get_envs() {
        if let Some(value) = value {
            destination.env(key, value);
        } else {
            destination.env_remove(key);
        }
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn wrap_managed_provider_command(
    command: Command,
    spec: ManagedSandboxSpec<'_>,
) -> Result<Command, String> {
    let sandbox_exec = Path::new(MACOS_SANDBOX_EXEC);
    if !sandbox_exec.is_file() {
        return Err(format!(
            "{} managed {} execution requires Atelier's {} child-process boundary, but it is unavailable; execution was not started.",
            spec.provider,
            spec.permission.id(),
            MACOS_SANDBOX_EXEC
        ));
    }

    let workspace = canonical_existing_path(spec.workspace, "managed workspace")?;
    if !workspace.is_dir() {
        return Err(format!(
            "managed workspace is not a directory: {}",
            workspace.display()
        ));
    }
    let mut provider_readonly_roots = Vec::with_capacity(spec.provider_readonly_roots.len());
    for path in spec.provider_readonly_roots {
        push_unique_path(
            &mut provider_readonly_roots,
            canonical_existing_path(path, "managed provider runtime")?,
        );
    }
    let provider_temp = canonical_existing_path(spec.provider_temp, "managed provider temp")?;
    let mut provider_roots = Vec::with_capacity(spec.provider_writable_roots.len() + 1);
    for path in spec.provider_writable_roots {
        push_unique_path(
            &mut provider_roots,
            canonical_existing_path(path, "managed provider state")?,
        );
    }
    push_unique_path(&mut provider_roots, provider_temp.clone());
    let mut provider_immutable_roots = Vec::with_capacity(spec.provider_immutable_roots.len());
    for path in spec.provider_immutable_roots {
        push_unique_path(
            &mut provider_immutable_roots,
            canonical_existing_path(path, "managed provider immutable content")?,
        );
    }
    if !provider_readonly_roots.is_empty() {
        for writable in &provider_roots {
            if !provider_readonly_roots
                .iter()
                .any(|runtime_root| writable.starts_with(runtime_root))
            {
                return Err(format!(
                    "{} managed provider state escaped its Atelier runtime root: {}.",
                    spec.provider,
                    writable.display()
                ));
            }
        }
        for immutable in &provider_immutable_roots {
            if !provider_readonly_roots
                .iter()
                .any(|runtime_root| immutable.starts_with(runtime_root))
            {
                return Err(format!(
                    "{} managed provider immutable content escaped its Atelier runtime root: {}.",
                    spec.provider,
                    immutable.display()
                ));
            }
        }
    }

    let program = canonical_existing_path(Path::new(command.get_program()), "managed executable")?;
    let args = command.get_args().map(OsString::from).collect::<Vec<_>>();
    if let Some(expected) = spec.expected_executable {
        let expected = canonical_existing_path(expected, "expected managed executable")?;
        if !provider_readonly_roots
            .iter()
            .any(|runtime_root| expected.starts_with(runtime_root))
        {
            return Err(format!(
                "{} managed executable is outside its Atelier runtime root: {}.",
                spec.provider,
                expected.display()
            ));
        }
        let expected_is_program_or_script = program == expected
            || args.iter().any(|arg| {
                let path = Path::new(arg);
                path.is_absolute()
                    && fs::canonicalize(path)
                        .map(|resolved| resolved == expected)
                        .unwrap_or(false)
            });
        if !expected_is_program_or_script {
            return Err(format!(
                "{} managed execution refused an executable outside Atelier's pinned runtime: resolved {}, expected {}.",
                spec.provider,
                program.display(),
                expected.display()
            ));
        }
    }
    let current_dir = command.get_current_dir().map(PathBuf::from);
    let profile = managed_sandbox_profile(
        spec.permission,
        &workspace,
        &provider_readonly_roots,
        &provider_roots,
        &provider_immutable_roots,
        &provider_temp,
        &program,
    )?;

    let mut sandboxed = Command::new(sandbox_exec);
    sandboxed
        .arg("-p")
        .arg(profile)
        .arg("--")
        .arg(&program)
        .args(args)
        .env("TMPDIR", &provider_temp)
        .env("TMP", &provider_temp)
        .env("TEMP", &provider_temp)
        .env("ATELIER_MANAGED_SANDBOX", "macos-sandbox-exec")
        .env("ATELIER_MANAGED_PERMISSION_MODE", spec.permission.id());
    copy_command_environment(&command, &mut sandboxed);
    sandboxed.current_dir(current_dir.unwrap_or_else(|| workspace.clone()));
    Ok(sandboxed)
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn wrap_managed_provider_command(
    _command: Command,
    spec: ManagedSandboxSpec<'_>,
) -> Result<Command, String> {
    Err(format!(
        "{} managed {} execution requires Atelier's macOS {} child-process boundary; this platform is unsupported and execution was not started.",
        spec.provider,
        spec.permission.id(),
        MACOS_SANDBOX_EXEC
    ))
}

#[cfg(test)]
mod tests {
    use super::{ManagedSandboxPermission, ManagedSandboxSpec};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn legacy_or_unknown_permission_never_becomes_auto() {
        assert_eq!(
            ManagedSandboxPermission::parse("basic"),
            ManagedSandboxPermission::Basic
        );
        assert_eq!(
            ManagedSandboxPermission::parse("auto"),
            ManagedSandboxPermission::Auto
        );
        for legacy in ["full", "bypass", "danger", "yolo", "unexpected", ""] {
            assert_eq!(
                ManagedSandboxPermission::parse(legacy),
                ManagedSandboxPermission::Basic
            );
        }
    }

    #[cfg(target_os = "macos")]
    struct ContainmentFixture {
        root: PathBuf,
        workspace: PathBuf,
        state: PathBuf,
        immutable: PathBuf,
        temp: PathBuf,
        unrelated: PathBuf,
    }

    #[cfg(target_os = "macos")]
    impl ContainmentFixture {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock after unix epoch")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "atelier-managed-sandbox-{label}-{}-{nonce}",
                std::process::id()
            ));
            let workspace = root.join("workspace");
            let state = root.join("provider-state");
            let immutable = state.join("skills");
            let temp = root.join("provider-temp");
            let unrelated = root.join("unrelated");
            for directory in [&workspace, &state, &immutable, &temp, &unrelated] {
                fs::create_dir_all(directory).expect("create containment fixture directory");
            }
            fs::write(workspace.join("readable.txt"), "workspace sentinel")
                .expect("write workspace sentinel");
            fs::write(immutable.join("SKILL.md"), "immutable skill sentinel")
                .expect("write immutable skill sentinel");
            fs::write(unrelated.join("private.txt"), "unrelated sentinel")
                .expect("write unrelated sentinel");
            Self {
                root,
                workspace,
                state,
                immutable,
                temp,
                unrelated,
            }
        }

        fn run(
            &self,
            permission: ManagedSandboxPermission,
            program: &str,
            args: &[&str],
        ) -> std::process::ExitStatus {
            let mut command = Command::new(program);
            command.args(args);
            let provider_roots = vec![self.state.clone()];
            let provider_immutable_roots = vec![self.immutable.clone()];
            let mut command = super::wrap_managed_provider_command(
                command,
                ManagedSandboxSpec {
                    provider: "fixture",
                    permission,
                    workspace: &self.workspace,
                    provider_readonly_roots: &[],
                    provider_writable_roots: &provider_roots,
                    provider_immutable_roots: &provider_immutable_roots,
                    provider_temp: &self.temp,
                    expected_executable: None,
                },
            )
            .expect("construct managed sandbox command");
            command
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .expect("run managed sandbox fixture")
        }
    }

    #[cfg(target_os = "macos")]
    impl Drop for ContainmentFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[cfg(target_os = "macos")]
    fn touch_status(
        fixture: &ContainmentFixture,
        permission: ManagedSandboxPermission,
        path: &Path,
    ) -> std::process::ExitStatus {
        fixture.run(
            permission,
            "/usr/bin/touch",
            &[path.to_str().expect("fixture path is UTF-8")],
        )
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_basic_allows_workspace_read_but_denies_workspace_and_unrelated_writes() {
        let fixture = ContainmentFixture::new("basic");
        let readable = fixture.workspace.join("readable.txt");
        assert!(fixture
            .run(
                ManagedSandboxPermission::Basic,
                "/bin/cat",
                &[readable.to_str().expect("fixture path is UTF-8")],
            )
            .success());
        assert!(!touch_status(
            &fixture,
            ManagedSandboxPermission::Basic,
            &fixture.workspace.join("blocked.txt"),
        )
        .success());
        assert!(touch_status(
            &fixture,
            ManagedSandboxPermission::Basic,
            &fixture.state.join("session.json"),
        )
        .success());
        assert!(!touch_status(
            &fixture,
            ManagedSandboxPermission::Basic,
            &fixture.unrelated.join("blocked.txt"),
        )
        .success());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_auto_writes_only_workspace_and_provider_state_or_temp() {
        let fixture = ContainmentFixture::new("auto");
        for allowed in [
            fixture.workspace.join("allowed.txt"),
            fixture.state.join("session.json"),
            fixture.temp.join("tool.tmp"),
        ] {
            assert!(
                touch_status(&fixture, ManagedSandboxPermission::Auto, &allowed).success(),
                "expected Auto write inside {}",
                allowed.display()
            );
        }
        assert!(!touch_status(
            &fixture,
            ManagedSandboxPermission::Auto,
            &fixture.unrelated.join("blocked.txt"),
        )
        .success());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_immutable_provider_content_overrides_writable_provider_home() {
        let fixture = ContainmentFixture::new("immutable");
        assert!(
            fixture
                .run(
                    ManagedSandboxPermission::Auto,
                    "/bin/cat",
                    &[fixture
                        .immutable
                        .join("SKILL.md")
                        .to_str()
                        .expect("fixture path is UTF-8")],
                )
                .success(),
            "immutable managed skills must remain readable"
        );
        assert!(
            !touch_status(
                &fixture,
                ManagedSandboxPermission::Auto,
                &fixture.immutable.join("tampered.md"),
            )
            .success(),
            "nested immutable skills must override the writable provider state root"
        );
        assert!(
            touch_status(
                &fixture,
                ManagedSandboxPermission::Auto,
                &fixture.state.join("session.json"),
            )
            .success(),
            "sibling provider state must remain writable"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_profile_denies_unrelated_personal_reads_and_preserves_process_execution() {
        let fixture = ContainmentFixture::new("personal-read");
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        assert!(
            !fixture
                .run(
                    ManagedSandboxPermission::Auto,
                    "/bin/cat",
                    &[manifest.to_str().expect("manifest path is UTF-8")],
                )
                .success(),
            "managed provider must not read unrelated repository files"
        );
        assert!(
            fixture
                .run(
                    ManagedSandboxPermission::Auto,
                    "/bin/sh",
                    &["-c", "/usr/bin/true"],
                )
                .success(),
            "managed provider must retain subprocess execution"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_profile_preserves_provider_network_access() {
        let fixture = ContainmentFixture::new("network");
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
            .expect("bind local containment network fixture");
        let port = listener
            .local_addr()
            .expect("read local containment address")
            .port()
            .to_string();
        assert!(
            fixture
                .run(
                    ManagedSandboxPermission::Basic,
                    "/usr/bin/nc",
                    &["-z", "-w", "1", "127.0.0.1", &port],
                )
                .success(),
            "managed provider must retain outbound network access"
        );
        let _ = listener
            .accept()
            .expect("accept local containment network probe");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_profile_denies_apple_events_and_launchservices_delegation() {
        let fixture = ContainmentFixture::new("ipc");
        assert!(
            !fixture
                .run(
                    ManagedSandboxPermission::Auto,
                    "/usr/bin/osascript",
                    &["-e", "tell application \"Finder\" to count windows"],
                )
                .success(),
            "sandboxed osascript must not send an Apple event to Finder"
        );
        assert!(
            !fixture
                .run(
                    ManagedSandboxPermission::Auto,
                    "/usr/bin/open",
                    &["-Ra", "TextEdit"],
                )
                .success(),
            "sandboxed open must not delegate application resolution to LaunchServices"
        );
    }

    #[cfg(target_os = "macos")]
    fn assert_managed_version_if_present(provider: &str, root: PathBuf, executable: PathBuf) {
        if !executable.is_file() {
            return;
        }
        let fixture = ContainmentFixture::new(&format!("{provider}-version"));
        let readonly_roots = vec![root, fixture.root.clone()];
        let writable_roots = vec![fixture.state.clone()];
        let immutable_roots = vec![fixture.immutable.clone()];
        let mut command = Command::new(&executable);
        command
            .arg("--version")
            .env("HOME", &fixture.state)
            .env("USERPROFILE", &fixture.state);
        let mut command = super::wrap_managed_provider_command(
            command,
            ManagedSandboxSpec {
                provider,
                permission: ManagedSandboxPermission::Basic,
                workspace: &fixture.workspace,
                provider_readonly_roots: &readonly_roots,
                provider_writable_roots: &writable_roots,
                provider_immutable_roots: &immutable_roots,
                provider_temp: &fixture.temp,
                expected_executable: Some(&executable),
            },
        )
        .expect("construct installed managed runtime version command");
        let output = command
            .stdin(Stdio::null())
            .output()
            .expect("run installed managed runtime version command");
        assert!(
            output.status.success(),
            "{provider} managed --version failed inside the sandbox: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            !output.stdout.is_empty() || !output.stderr.is_empty(),
            "{provider} managed --version returned no version output"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_installed_managed_bun_and_hermes_versions_run_without_provider_calls() {
        let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
            return;
        };
        let providers = home.join("Library/Application Support/com.atelier.app/providers");
        let gajecode = providers.join("gajecode");
        assert_managed_version_if_present(
            "gajecode-bun",
            gajecode.clone(),
            gajecode.join("bun/bin/bun"),
        );
        let hermes = providers.join("hermes");
        assert_managed_version_if_present("hermes", hermes.clone(), hermes.join("bin/hermes"));
    }
}
