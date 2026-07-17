use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const MAX_EDITOR_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEditorSnapshot {
    root: String,
    path: String,
    exists: bool,
    size_bytes: u64,
    modified_unix_ms: Option<u64>,
    content_sha256: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEditorWriteResult {
    written: bool,
    conflict: bool,
    snapshot: AgentEditorSnapshot,
}

#[tauri::command]
pub async fn agent_editor_snapshot(
    root: String,
    path: String,
) -> Result<AgentEditorSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || snapshot_sync(&root, &path))
        .await
        .map_err(|error| format!("agent_editor_snapshot join: {error}"))?
}

#[tauri::command]
pub async fn agent_editor_write(
    root: String,
    path: String,
    contents: String,
    expected_content_sha256: Option<String>,
) -> Result<AgentEditorWriteResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        write_sync(&root, &path, &contents, expected_content_sha256.as_deref())
    })
    .await
    .map_err(|error| format!("agent_editor_write join: {error}"))?
}

fn snapshot_sync(root: &str, path: &str) -> Result<AgentEditorSnapshot, String> {
    let resolved_root = super::sandbox_path(root)?;
    if !resolved_root.is_dir() {
        return Err("agent_editor_snapshot: workspace root is not a directory".to_string());
    }
    let (resolved, exists) = resolve_workspace_target(&resolved_root, path)?;
    let home = super::canonical_home_path()?;
    if let Some(blocked) = super::sensitive_home_path(&home, &resolved) {
        return Err(format!("blocked sensitive path: {blocked}"));
    }

    if !exists {
        return Ok(AgentEditorSnapshot {
            root: resolved_root.to_string_lossy().into_owned(),
            path: resolved.to_string_lossy().into_owned(),
            exists: false,
            size_bytes: 0,
            modified_unix_ms: None,
            content_sha256: None,
        });
    }

    let metadata = std::fs::metadata(&resolved).map_err(|error| format!("stat: {error}"))?;
    if !metadata.is_file() {
        return Err("agent_editor_snapshot: target is not a regular file".to_string());
    }
    if metadata.len() > MAX_EDITOR_BYTES {
        return Err(format!("file too large: {} bytes", metadata.len()));
    }
    let bytes = std::fs::read(&resolved).map_err(|error| format!("read: {error}"))?;

    Ok(AgentEditorSnapshot {
        root: resolved_root.to_string_lossy().into_owned(),
        path: resolved.to_string_lossy().into_owned(),
        exists: true,
        size_bytes: bytes.len() as u64,
        modified_unix_ms: modified_unix_ms(&metadata),
        content_sha256: Some(sha256_hex(&bytes)),
    })
}

fn write_sync(
    root: &str,
    path: &str,
    contents: &str,
    expected_content_sha256: Option<&str>,
) -> Result<AgentEditorWriteResult, String> {
    if contents.len() as u64 > MAX_EDITOR_BYTES {
        return Err(format!("file too large: {} bytes", contents.len()));
    }

    let current = snapshot_sync(root, path)?;
    let expected_matches = current.exists
        && expected_content_sha256
            .zip(current.content_sha256.as_deref())
            .is_some_and(|(expected, actual)| expected == actual);
    if !expected_matches {
        return Ok(AgentEditorWriteResult {
            written: false,
            conflict: true,
            snapshot: current,
        });
    }

    let resolved = PathBuf::from(&current.path);
    let metadata = std::fs::metadata(&resolved).map_err(|error| format!("stat: {error}"))?;

    #[cfg(windows)]
    std::fs::write(&resolved, contents.as_bytes())
        .map_err(|error| format!("agent_editor_write: {error}"))?;

    #[cfg(not(windows))]
    {
        let parent = resolved
            .parent()
            .ok_or_else(|| "agent_editor_write: target has no parent directory".to_string())?;
        let file_name = resolved
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "agent_editor_write: invalid file name".to_string())?;
        let temp_path = parent.join(format!(
            ".{file_name}.atelier-editor-save-{}",
            std::process::id()
        ));

        std::fs::write(&temp_path, contents.as_bytes())
            .map_err(|error| format!("agent_editor_write temp: {error}"))?;
        if let Err(error) = std::fs::set_permissions(&temp_path, metadata.permissions()) {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("agent_editor_write permissions: {error}"));
        }
        if let Err(error) = std::fs::rename(&temp_path, &resolved) {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("agent_editor_write replace: {error}"));
        }
    }

    Ok(AgentEditorWriteResult {
        written: true,
        conflict: false,
        snapshot: snapshot_sync(root, path)?,
    })
}

fn resolve_workspace_target(resolved_root: &Path, path: &str) -> Result<(PathBuf, bool), String> {
    let requested = PathBuf::from(path);
    match std::fs::canonicalize(&requested) {
        Ok(resolved) => {
            if !resolved.starts_with(resolved_root) {
                return Err(
                    "agent_editor_snapshot: target is outside the active workspace".to_string(),
                );
            }
            Ok((resolved, true))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let parent = requested.parent().ok_or_else(|| {
                "agent_editor_snapshot: target has no parent directory".to_string()
            })?;
            let file_name = requested
                .file_name()
                .ok_or_else(|| "agent_editor_snapshot: target has no file name".to_string())?;
            let resolved_parent = super::sandbox_path(&parent.to_string_lossy())?;
            if !resolved_parent.starts_with(resolved_root) {
                return Err(
                    "agent_editor_snapshot: target is outside the active workspace".to_string(),
                );
            }
            Ok((resolved_parent.join(file_name), false))
        }
        Err(error) => Err(format!("canonicalize {}: {error}", requested.display())),
    }
}

fn modified_unix_ms(metadata: &std::fs::Metadata) -> Option<u64> {
    let millis = metadata
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis();
    Some(millis.min(u64::MAX as u128) as u64)
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::sha256_hex;

    #[test]
    fn hashes_editor_contents_deterministically() {
        assert_eq!(
            sha256_hex(b"Atelier\n"),
            "7c7e1acba569b2e3f7296a2b4c122adeec8aa22615fe4898eb8d58c24172ecd6"
        );
    }
}
