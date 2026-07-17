use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;

const MAX_TEXT_FILE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_TEXT_PREVIEW_BYTES: u64 = 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_PDF_BYTES: u64 = 12 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PreviewKind {
    Markdown,
    Text,
    Image,
    Pdf,
    Unsupported,
}

impl PreviewKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Markdown => "markdown",
            Self::Text => "text",
            Self::Image => "image",
            Self::Pdf => "pdf",
            Self::Unsupported => "unsupported",
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AgentRichPreviewResult {
    root: String,
    path: String,
    relative_path: String,
    name: String,
    kind: String,
    mime: String,
    size_bytes: u64,
    modified_unix_ms: Option<u64>,
    text: Option<String>,
    data_base64: Option<String>,
    truncated: bool,
    reason: Option<String>,
}

fn preview_kind(path: &Path) -> (PreviewKind, &'static str) {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "md" | "markdown" | "mdx" => (PreviewKind::Markdown, "text/markdown"),
        "txt" | "log" | "rst" | "adoc" | "json" | "jsonc" | "yaml" | "yml" | "toml" | "xml"
        | "csv" | "tsv" | "ini" | "conf" => (PreviewKind::Text, "text/plain"),
        "png" => (PreviewKind::Image, "image/png"),
        "jpg" | "jpeg" => (PreviewKind::Image, "image/jpeg"),
        "gif" => (PreviewKind::Image, "image/gif"),
        "webp" => (PreviewKind::Image, "image/webp"),
        "bmp" => (PreviewKind::Image, "image/bmp"),
        "ico" => (PreviewKind::Image, "image/x-icon"),
        "pdf" => (PreviewKind::Pdf, "application/pdf"),
        _ => (PreviewKind::Unsupported, "application/octet-stream"),
    }
}

fn sensitive_repository_path(relative: &Path) -> bool {
    let components = relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_ascii_lowercase())
        .collect::<Vec<_>>();
    if components.iter().any(|component| component == ".git") {
        return true;
    }
    let Some(name) = components.last() else {
        return false;
    };
    if name == ".env" || name.starts_with(".env.") {
        return true;
    }
    if matches!(
        name.as_str(),
        ".npmrc"
            | ".pypirc"
            | ".netrc"
            | ".git-credentials"
            | "credentials"
            | "credentials.json"
            | "secrets.json"
            | "auth.json"
            | "id_rsa"
            | "id_ed25519"
    ) {
        return true;
    }
    matches!(
        Path::new(name)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default(),
        "pem" | "key" | "p12" | "pfx"
    )
}

fn resolve_preview_target(root: &str, path: &str) -> Result<(PathBuf, PathBuf), String> {
    let resolved_root = crate::sandbox_path(root)?;
    if !resolved_root.is_dir() {
        return Err("agent_rich_preview: root is not a directory".to_string());
    }
    let requested = PathBuf::from(path);
    let target = if requested.is_absolute() {
        requested
    } else {
        resolved_root.join(requested)
    };
    let resolved_target = fs::canonicalize(&target).map_err(|error| {
        format!(
            "agent_rich_preview canonicalize {}: {error}",
            target.display()
        )
    })?;
    if !resolved_target.starts_with(&resolved_root) {
        return Err("agent_rich_preview: file is outside the active workspace".to_string());
    }
    if !resolved_target.is_file() {
        return Err("agent_rich_preview: target is not a file".to_string());
    }
    let home = crate::canonical_home_path()?;
    if let Some(blocked) = crate::sensitive_home_path(&home, &resolved_target) {
        return Err(format!("blocked sensitive path: {blocked}"));
    }
    let relative = resolved_target
        .strip_prefix(&resolved_root)
        .map_err(|_| "agent_rich_preview: workspace path mismatch".to_string())?;
    if sensitive_repository_path(relative) {
        return Err("agent_rich_preview: credential-like files cannot be previewed".to_string());
    }
    Ok((resolved_root, resolved_target))
}

fn read_text_preview(path: &Path, size: u64) -> Result<(String, bool), String> {
    if size > MAX_TEXT_FILE_BYTES {
        return Err(format!(
            "agent_rich_preview: text file is too large ({size} bytes; maximum {MAX_TEXT_FILE_BYTES})"
        ));
    }
    let mut buffer = Vec::new();
    File::open(path)
        .map_err(|error| format!("agent_rich_preview open: {error}"))?
        .take(MAX_TEXT_PREVIEW_BYTES + 1)
        .read_to_end(&mut buffer)
        .map_err(|error| format!("agent_rich_preview read: {error}"))?;
    let truncated = buffer.len() as u64 > MAX_TEXT_PREVIEW_BYTES;
    if truncated {
        buffer.truncate(MAX_TEXT_PREVIEW_BYTES as usize);
    }
    Ok((String::from_utf8_lossy(&buffer).into_owned(), truncated))
}

fn read_binary_preview(path: &Path, size: u64, limit: u64) -> Result<String, String> {
    if size > limit {
        return Err(format!(
            "agent_rich_preview: binary file is too large ({size} bytes; maximum {limit})"
        ));
    }
    let bytes = fs::read(path).map_err(|error| format!("agent_rich_preview read: {error}"))?;
    Ok(STANDARD.encode(bytes))
}

fn build_preview(root: &str, path: &str) -> Result<AgentRichPreviewResult, String> {
    let (resolved_root, resolved_target) = resolve_preview_target(root, path)?;
    let metadata = fs::metadata(&resolved_target)
        .map_err(|error| format!("agent_rich_preview stat: {error}"))?;
    let relative = resolved_target
        .strip_prefix(&resolved_root)
        .map_err(|_| "agent_rich_preview: workspace path mismatch".to_string())?;
    let (kind, mime) = preview_kind(&resolved_target);
    let (text, data_base64, truncated, reason) = match kind {
        PreviewKind::Markdown | PreviewKind::Text => {
            let (text, truncated) = read_text_preview(&resolved_target, metadata.len())?;
            (Some(text), None, truncated, None)
        }
        PreviewKind::Image => (
            None,
            Some(read_binary_preview(
                &resolved_target,
                metadata.len(),
                MAX_IMAGE_BYTES,
            )?),
            false,
            None,
        ),
        PreviewKind::Pdf => (
            None,
            Some(read_binary_preview(
                &resolved_target,
                metadata.len(),
                MAX_PDF_BYTES,
            )?),
            false,
            None,
        ),
        PreviewKind::Unsupported => (
            None,
            None,
            false,
            Some("This file type does not have a rich preview.".to_string()),
        ),
    };
    let modified_unix_ms = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .and_then(|value| u64::try_from(value.as_millis()).ok());
    Ok(AgentRichPreviewResult {
        root: resolved_root.to_string_lossy().into_owned(),
        path: resolved_target.to_string_lossy().into_owned(),
        relative_path: relative.to_string_lossy().replace('\\', "/"),
        name: resolved_target
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("preview")
            .to_string(),
        kind: kind.as_str().to_string(),
        mime: mime.to_string(),
        size_bytes: metadata.len(),
        modified_unix_ms,
        text,
        data_base64,
        truncated,
        reason,
    })
}

#[tauri::command]
pub async fn agent_rich_preview(
    root: String,
    path: String,
) -> Result<AgentRichPreviewResult, String> {
    tauri::async_runtime::spawn_blocking(move || build_preview(&root, &path))
        .await
        .map_err(|error| format!("agent_rich_preview join: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_root() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("atelier-rich-preview-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("fixture root");
        root
    }

    fn home_fixture_root() -> PathBuf {
        let home = crate::canonical_home_path().expect("home");
        let root = home.join(format!(
            ".atelier-rich-preview-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("home fixture root");
        root
    }

    #[test]
    fn classifies_supported_preview_types() {
        assert_eq!(
            preview_kind(Path::new("README.md")).0,
            PreviewKind::Markdown
        );
        assert_eq!(preview_kind(Path::new("report.pdf")).0, PreviewKind::Pdf);
        assert_eq!(preview_kind(Path::new("screen.webp")).0, PreviewKind::Image);
        assert_eq!(preview_kind(Path::new("notes.txt")).0, PreviewKind::Text);
        assert_eq!(
            preview_kind(Path::new("archive.zip")).0,
            PreviewKind::Unsupported
        );
    }

    #[test]
    fn rejects_credential_like_repository_files() {
        assert!(sensitive_repository_path(Path::new(".env.production")));
        assert!(sensitive_repository_path(Path::new("keys/release.p12")));
        assert!(sensitive_repository_path(Path::new(".git/config")));
        assert!(!sensitive_repository_path(Path::new("docs/security.md")));
    }

    #[test]
    fn text_preview_is_bounded_and_lossy_utf8_safe() {
        let root = fixture_root();
        let path = root.join("notes.txt");
        fs::write(&path, [b'a', b'b', 0xff]).expect("write fixture");
        let (text, truncated) = read_text_preview(&path, 3).expect("text preview");
        assert!(text.starts_with("ab"));
        assert!(!truncated);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn binary_preview_uses_bounded_base64() {
        let root = fixture_root();
        let path = root.join("pixel.png");
        fs::write(&path, [0x89, b'P', b'N', b'G']).expect("write fixture");
        assert_eq!(
            read_binary_preview(&path, 4, 4).expect("binary preview"),
            "iVBORw=="
        );
        assert!(read_binary_preview(&path, 4, 3).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workspace_boundary_rejects_sibling_files() {
        let fixture = home_fixture_root();
        let workspace = fixture.join("workspace");
        fs::create_dir_all(&workspace).expect("workspace");
        let outside = fixture.join("outside.md");
        fs::write(&outside, "outside").expect("outside fixture");
        let result =
            resolve_preview_target(&workspace.to_string_lossy(), &outside.to_string_lossy());
        assert!(result.is_err());
        let _ = fs::remove_dir_all(fixture);
    }

    #[test]
    fn markdown_preview_returns_repository_metadata() {
        let fixture = home_fixture_root();
        let workspace = fixture.join("workspace");
        fs::create_dir_all(&workspace).expect("workspace");
        let document = workspace.join("README.md");
        fs::write(&document, "# Atelier\n\nPreview").expect("markdown fixture");
        let result = build_preview(&workspace.to_string_lossy(), &document.to_string_lossy())
            .expect("rich preview");
        assert_eq!(result.kind, "markdown");
        assert_eq!(result.relative_path, "README.md");
        assert_eq!(result.text.as_deref(), Some("# Atelier\n\nPreview"));
        let _ = fs::remove_dir_all(fixture);
    }
}
