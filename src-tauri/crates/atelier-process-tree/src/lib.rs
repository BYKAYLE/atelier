use std::process::Command;

#[cfg(windows)]
use std::process::Stdio;

/// Starts an agent command in an isolated process group where the platform
/// supports it. The same function is used by Atelier and this crate's native
/// release harness so process-tree behavior is not hidden behind Tauri.
pub fn configure_process_tree(command: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = command;
    }
}

/// Terminates the process group rooted at `pid`, including tool subprocesses.
pub fn terminate_process_tree(pid: u32) -> bool {
    #[cfg(unix)]
    {
        let pid = pid as libc::pid_t;
        unsafe {
            // The group id matches the leader pid configured above. Keep a
            // direct-pid fallback for turns started by an older app process.
            libc::kill(-pid, libc::SIGTERM) == 0 || libc::kill(pid, libc::SIGTERM) == 0
        }
    }

    #[cfg(windows)]
    {
        let mut command = Command::new("taskkill.exe");
        configure_process_tree(&mut command);
        command
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        false
    }
}

#[cfg(test)]
mod tests {
    use super::{configure_process_tree, terminate_process_tree};
    use std::process::{Command, Stdio};
    use std::thread;
    use std::time::{Duration, Instant};

    #[cfg(unix)]
    #[test]
    fn terminates_native_process_tree() {
        let mut command = Command::new("/bin/sh");
        command
            .args(["-c", "sleep 30 & wait"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        configure_process_tree(&mut command);

        let mut child = command.spawn().expect("spawn isolated process group");
        assert!(terminate_process_tree(child.id()));

        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            match child.try_wait().expect("poll terminated process tree") {
                Some(_) => break,
                None if Instant::now() < deadline => thread::sleep(Duration::from_millis(25)),
                None => {
                    let _ = child.kill();
                    panic!("terminated process group did not exit");
                }
            }
        }
    }

    #[cfg(windows)]
    fn windows_process_exists(pid: u32) -> bool {
        let output = Command::new("tasklist.exe")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .expect("query Windows process list");
        String::from_utf8_lossy(&output.stdout).contains(&format!("\"{pid}\""))
    }

    #[cfg(windows)]
    #[test]
    fn terminates_native_process_tree() {
        use std::fs;
        use std::time::{SystemTime, UNIX_EPOCH};

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let pid_file = std::env::temp_dir().join(format!(
            "atelier-process-tree-{}-{nonce}.pid",
            std::process::id()
        ));
        let script = "$child = Start-Process -FilePath ping.exe -ArgumentList '-n','31','127.0.0.1' -WindowStyle Hidden -PassThru; Set-Content -LiteralPath $env:ATELIER_CHILD_PID_FILE -Value $child.Id; Wait-Process -Id $child.Id";
        let mut command = Command::new("powershell.exe");
        command
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("ATELIER_CHILD_PID_FILE", &pid_file)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        configure_process_tree(&mut command);
        let mut root = command
            .spawn()
            .expect("spawn isolated Windows process tree");

        let ready_deadline = Instant::now() + Duration::from_secs(8);
        while !pid_file.is_file() && Instant::now() < ready_deadline {
            thread::sleep(Duration::from_millis(25));
        }
        let child_pid = fs::read_to_string(&pid_file)
            .expect("read Windows child pid")
            .trim()
            .parse::<u32>()
            .expect("parse Windows child pid");
        assert!(windows_process_exists(child_pid));
        assert!(terminate_process_tree(root.id()));

        let exit_deadline = Instant::now() + Duration::from_secs(8);
        loop {
            let root_exited = root.try_wait().expect("poll Windows root").is_some();
            if root_exited && !windows_process_exists(child_pid) {
                break;
            }
            if Instant::now() >= exit_deadline {
                let _ = root.kill();
                panic!("Windows process tree retained root or child {child_pid}");
            }
            thread::sleep(Duration::from_millis(50));
        }
        let _ = fs::remove_file(pid_file);
    }
}
