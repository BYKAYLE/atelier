use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;

const MAX_SOURCE_FILES: usize = 2_000;
const MAX_SOURCE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_SYMBOL_RECORDS: usize = 20_000;
const SYMBOL_CACHE_TTL: Duration = Duration::from_secs(15);
const SKIP_DIRECTORIES: &[&str] = &[
    ".git",
    ".next",
    ".turbo",
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "vendor",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AgentQuickOpenEntry {
    kind: String,
    key: String,
    label: String,
    detail: String,
    path: Option<String>,
    line: Option<usize>,
    branch: Option<String>,
    current: bool,
}

#[derive(Debug, Serialize)]
pub struct AgentQuickOpenIndexResult {
    root: String,
    entries: Vec<AgentQuickOpenEntry>,
    truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WorktreeRecord {
    path: String,
    branch: Option<String>,
    detached: bool,
}

#[derive(Debug, Clone)]
struct RankedEntry {
    score: i32,
    entry: AgentQuickOpenEntry,
}

#[derive(Debug, Clone)]
struct SymbolRecord {
    kind: String,
    name: String,
    relative_path: String,
    absolute_path: String,
    line: usize,
}

#[derive(Debug, Clone)]
struct CachedSymbolIndex {
    created_at: Instant,
    records: Vec<SymbolRecord>,
    truncated: bool,
}

static SYMBOL_INDEX_CACHE: OnceLock<Mutex<HashMap<String, CachedSymbolIndex>>> = OnceLock::new();

fn normalize_search(value: &str) -> String {
    value.trim().to_lowercase()
}

fn boundary_match(haystack: &str, needle: &str) -> bool {
    haystack.match_indices(needle).any(|(index, _)| {
        index == 0
            || match haystack[..index].chars().next_back() {
                Some(character) => !character.is_alphanumeric(),
                None => true,
            }
    })
}

fn match_score(query: &str, label: &str, detail: &str) -> Option<i32> {
    let query = normalize_search(query);
    if query.is_empty() {
        return Some(0);
    }
    let label = normalize_search(label);
    let detail = normalize_search(detail);
    if label == query {
        Some(120)
    } else if label.starts_with(&query) {
        Some(100)
    } else if boundary_match(&label, &query) {
        Some(85)
    } else if label.contains(&query) {
        Some(70)
    } else if boundary_match(&detail, &query) {
        Some(45)
    } else if detail.contains(&query) {
        Some(30)
    } else {
        None
    }
}

fn entry_kind_rank(kind: &str) -> i32 {
    match kind {
        "symbol" => 4,
        "worktree" => 3,
        "branch" => 2,
        _ => 1,
    }
}

fn parse_branch_records(raw: &str, root: &Path, query: &str) -> Vec<RankedEntry> {
    raw.lines()
        .filter_map(|line| {
            let (name, head) = line.split_once('\t').unwrap_or((line, ""));
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            let current = head.trim() == "*";
            let detail = if current {
                "current branch".to_string()
            } else {
                "local branch".to_string()
            };
            let score = match_score(query, name, &detail)? + if current { 8 } else { 0 };
            Some(RankedEntry {
                score,
                entry: AgentQuickOpenEntry {
                    kind: "branch".to_string(),
                    key: format!("branch:{name}"),
                    label: name.to_string(),
                    detail,
                    path: Some(root.to_string_lossy().into_owned()),
                    line: None,
                    branch: Some(name.to_string()),
                    current,
                },
            })
        })
        .collect()
}

fn parse_worktree_records(raw: &str) -> Vec<WorktreeRecord> {
    let mut records = Vec::new();
    let mut path: Option<String> = None;
    let mut branch: Option<String> = None;
    let mut detached = false;

    let flush = |records: &mut Vec<WorktreeRecord>,
                 path: &mut Option<String>,
                 branch: &mut Option<String>,
                 detached: &mut bool| {
        if let Some(path) = path.take() {
            records.push(WorktreeRecord {
                path,
                branch: branch.take(),
                detached: *detached,
            });
        }
        *detached = false;
    };

    for line in raw.lines() {
        if line.trim().is_empty() {
            flush(&mut records, &mut path, &mut branch, &mut detached);
        } else if let Some(value) = line.strip_prefix("worktree ") {
            if path.is_some() {
                flush(&mut records, &mut path, &mut branch, &mut detached);
            }
            path = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("branch ") {
            branch = Some(
                value
                    .trim()
                    .strip_prefix("refs/heads/")
                    .unwrap_or(value.trim())
                    .to_string(),
            );
        } else if line.trim() == "detached" {
            detached = true;
        }
    }
    flush(&mut records, &mut path, &mut branch, &mut detached);
    records
}

fn ranked_worktrees(raw: &str, root: &Path, query: &str) -> Vec<RankedEntry> {
    parse_worktree_records(raw)
        .into_iter()
        .filter_map(|record| {
            let path = PathBuf::from(&record.path);
            let label = record.branch.clone().unwrap_or_else(|| {
                path.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("detached worktree")
                    .to_string()
            });
            let relative = path
                .strip_prefix(root)
                .unwrap_or(path.as_path())
                .to_string_lossy()
                .into_owned();
            let detail = if record.detached {
                format!("detached worktree · {relative}")
            } else {
                format!("worktree · {relative}")
            };
            let current = path == root;
            let score = match_score(query, &label, &format!("{detail} {}", record.path))?
                + if current { 6 } else { 0 };
            Some(RankedEntry {
                score,
                entry: AgentQuickOpenEntry {
                    kind: "worktree".to_string(),
                    key: format!("worktree:{}", record.path),
                    label,
                    detail,
                    path: Some(record.path),
                    line: None,
                    branch: record.branch,
                    current,
                },
            })
        })
        .collect()
}

fn is_source_path(path: &Path) -> bool {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if file_name.starts_with(".env")
        || matches!(
            file_name.as_str(),
            "credentials" | "credentials.json" | "secrets.json"
        )
    {
        return false;
    }
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "rs" | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "mjs"
            | "cjs"
            | "py"
            | "go"
            | "java"
            | "kt"
            | "kts"
            | "swift"
            | "c"
            | "h"
            | "cc"
            | "cpp"
            | "cxx"
            | "hpp"
            | "cs"
            | "rb"
            | "php"
            | "vue"
            | "svelte"
            | "md"
    )
}

fn safe_relative_source_path(path: &Path) -> bool {
    !path.is_absolute()
        && !path.components().any(|component| {
            let value = component.as_os_str().to_string_lossy();
            value.starts_with('.') || SKIP_DIRECTORIES.contains(&value.as_ref())
        })
        && is_source_path(path)
}

fn git_source_files(root: &Path) -> Option<Vec<PathBuf>> {
    let root_text = root.to_string_lossy();
    let raw = crate::agent_git::run_git(&root_text, &["ls-files", "-z"]).ok()?;
    Some(
        raw.split('\0')
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .filter(|path| safe_relative_source_path(path))
            .take(MAX_SOURCE_FILES + 1)
            .collect(),
    )
}

fn fallback_source_files(root: &Path) -> Vec<PathBuf> {
    const MAX_VISITED: usize = 20_000;
    let mut queue = VecDeque::from([root.to_path_buf()]);
    let mut files = Vec::new();
    let mut visited = 0usize;
    while let Some(directory) = queue.pop_front() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            visited += 1;
            if visited > MAX_VISITED || files.len() > MAX_SOURCE_FILES {
                return files;
            }
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            if file_type.is_symlink() || name.starts_with('.') {
                continue;
            }
            if file_type.is_dir() {
                if !SKIP_DIRECTORIES.contains(&name.as_str()) {
                    queue.push_back(path);
                }
            } else if file_type.is_file() && is_source_path(&path) {
                files.push(
                    path.strip_prefix(root)
                        .unwrap_or(path.as_path())
                        .to_path_buf(),
                );
            }
        }
    }
    files
}

fn identifier_after<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    let rest = line.strip_prefix(prefix)?.trim_start();
    let end = rest
        .char_indices()
        .find_map(|(index, character)| {
            (!character.is_alphanumeric() && character != '_' && character != '$').then_some(index)
        })
        .unwrap_or(rest.len());
    (end > 0).then_some(&rest[..end])
}

fn strip_declaration_modifiers(mut line: &str) -> &str {
    loop {
        let before = line;
        for prefix in [
            "export default ",
            "export ",
            "pub(crate) ",
            "pub(super) ",
            "pub ",
            "public ",
            "private ",
            "protected ",
            "internal ",
            "static ",
            "final ",
            "abstract ",
            "open ",
            "async ",
            "unsafe ",
        ] {
            if let Some(rest) = line.strip_prefix(prefix) {
                line = rest.trim_start();
                break;
            }
        }
        if before == line {
            return line;
        }
    }
}

fn extract_symbol(line: &str, markdown: bool) -> Option<(&str, &str)> {
    let trimmed = line.trim_start();
    if markdown {
        let heading = trimmed.trim_start_matches('#');
        if heading.len() < trimmed.len() {
            let label = heading.trim();
            return (!label.is_empty()).then_some(("heading", label));
        }
    }

    let line = strip_declaration_modifiers(trimmed);
    for (prefix, kind) in [
        ("fn ", "function"),
        ("function ", "function"),
        ("def ", "function"),
        ("class ", "class"),
        ("interface ", "interface"),
        ("struct ", "struct"),
        ("enum ", "enum"),
        ("trait ", "trait"),
        ("protocol ", "protocol"),
        ("type ", "type"),
        ("namespace ", "namespace"),
        ("module ", "module"),
        ("const ", "constant"),
    ] {
        if let Some(identifier) = identifier_after(line, prefix) {
            return Some((kind, identifier));
        }
    }

    if let Some(rest) = line.strip_prefix("func ") {
        let rest = rest.trim_start();
        let candidate = if rest.starts_with('(') {
            rest.find(')')
                .and_then(|index| rest.get(index + 1..))
                .map(str::trim_start)
                .unwrap_or(rest)
        } else {
            rest
        };
        let end = candidate
            .char_indices()
            .find_map(|(index, character)| {
                (!character.is_alphanumeric() && character != '_').then_some(index)
            })
            .unwrap_or(candidate.len());
        if end > 0 {
            return Some(("function", &candidate[..end]));
        }
    }
    None
}

fn build_symbol_index(root: &Path) -> CachedSymbolIndex {
    let mut relative_files = git_source_files(root).unwrap_or_else(|| fallback_source_files(root));
    let mut truncated = relative_files.len() > MAX_SOURCE_FILES;
    relative_files.truncate(MAX_SOURCE_FILES);
    let mut read_bytes = 0u64;
    let mut records = Vec::new();

    for relative in relative_files {
        let absolute = root.join(&relative);
        let metadata = match fs::metadata(&absolute) {
            Ok(metadata) if metadata.is_file() && metadata.len() <= MAX_FILE_BYTES => metadata,
            _ => continue,
        };
        if read_bytes.saturating_add(metadata.len()) > MAX_SOURCE_BYTES {
            truncated = true;
            break;
        }
        read_bytes += metadata.len();
        let contents = match fs::read_to_string(&absolute) {
            Ok(contents) => contents,
            Err(_) => continue,
        };
        let relative_text = relative.to_string_lossy().replace('\\', "/");
        let markdown = relative
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("md"));
        for (index, line) in contents.lines().enumerate() {
            let Some((symbol_kind, symbol_name)) = extract_symbol(line, markdown) else {
                continue;
            };
            records.push(SymbolRecord {
                kind: symbol_kind.to_string(),
                name: symbol_name.to_string(),
                relative_path: relative_text.clone(),
                absolute_path: absolute.to_string_lossy().into_owned(),
                line: index + 1,
            });
            if records.len() >= MAX_SYMBOL_RECORDS {
                truncated = true;
                return CachedSymbolIndex {
                    created_at: Instant::now(),
                    records,
                    truncated,
                };
            }
        }
    }
    CachedSymbolIndex {
        created_at: Instant::now(),
        records,
        truncated,
    }
}

fn cached_symbol_index(root: &Path) -> CachedSymbolIndex {
    let key = root.to_string_lossy().into_owned();
    let cache = SYMBOL_INDEX_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(cache) = cache.lock() {
        if let Some(existing) = cache.get(&key) {
            if existing.created_at.elapsed() <= SYMBOL_CACHE_TTL {
                return existing.clone();
            }
        }
    }

    let built = build_symbol_index(root);
    if let Ok(mut cache) = cache.lock() {
        cache.retain(|_, entry| entry.created_at.elapsed() <= Duration::from_secs(60));
        if cache.len() >= 8 {
            cache.clear();
        }
        cache.insert(key, built.clone());
    }
    built
}

fn ranked_symbols(root: &Path, query: &str) -> (Vec<RankedEntry>, bool) {
    if query.trim().chars().count() < 2 {
        return (Vec::new(), false);
    }
    let index = cached_symbol_index(root);
    let truncated = index.truncated;
    let matches = index
        .records
        .into_iter()
        .filter_map(|record| {
            let detail = format!("{} · {}:{}", record.kind, record.relative_path, record.line);
            let score = match_score(query, &record.name, &detail)?;
            Some(RankedEntry {
                score,
                entry: AgentQuickOpenEntry {
                    kind: "symbol".to_string(),
                    key: format!(
                        "symbol:{}:{}:{}",
                        record.relative_path, record.line, record.name
                    ),
                    label: record.name,
                    detail,
                    path: Some(record.absolute_path),
                    line: Some(record.line),
                    branch: None,
                    current: false,
                },
            })
        })
        .collect();
    (matches, truncated)
}

#[tauri::command]
pub async fn agent_quick_open_index(
    cwd: String,
    query: String,
    max_results: Option<usize>,
) -> Result<AgentQuickOpenIndexResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        build_agent_quick_open_index(cwd, query, max_results)
    })
    .await
    .map_err(|error| format!("agent_quick_open_index join: {error}"))?
}

fn build_agent_quick_open_index(
    cwd: String,
    query: String,
    max_results: Option<usize>,
) -> Result<AgentQuickOpenIndexResult, String> {
    let requested_root = crate::sandbox_path(&cwd)?;
    if !requested_root.is_dir() {
        return Err("agent_quick_open_index: cwd is not a directory".to_string());
    }
    let home = crate::canonical_home_path()?;
    if let Some(blocked) = crate::sensitive_home_path(&home, &requested_root) {
        return Err(format!("blocked sensitive workspace: {blocked}"));
    }
    let git_root = crate::agent_git::git_root(Some(requested_root.to_string_lossy().into_owned()))
        .ok()
        .and_then(|root| crate::sandbox_path(&root).ok());
    let root = git_root.as_deref().unwrap_or(requested_root.as_path());
    let root_text = root.to_string_lossy().into_owned();
    let query = query.trim();
    if query.is_empty() {
        return Ok(AgentQuickOpenIndexResult {
            root: root_text,
            entries: Vec::new(),
            truncated: false,
        });
    }

    let limit = max_results.unwrap_or(40).clamp(1, 80);
    let mut ranked = Vec::new();
    if git_root.is_some() {
        if let Ok(raw) = crate::agent_git::run_git(
            &root_text,
            &[
                "for-each-ref",
                "--format=%(refname:short)%09%(HEAD)",
                "refs/heads/",
            ],
        ) {
            ranked.extend(parse_branch_records(&raw, root, query));
        }
        if let Ok(raw) = crate::agent_git::run_git(&root_text, &["worktree", "list", "--porcelain"])
        {
            ranked.extend(ranked_worktrees(&raw, root, query));
        }
    }
    let (symbols, mut truncated) = ranked_symbols(root, query);
    ranked.extend(symbols);
    ranked.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| {
                entry_kind_rank(&right.entry.kind).cmp(&entry_kind_rank(&left.entry.kind))
            })
            .then_with(|| {
                left.entry
                    .label
                    .to_lowercase()
                    .cmp(&right.entry.label.to_lowercase())
            })
            .then_with(|| left.entry.detail.cmp(&right.entry.detail))
    });
    if ranked.len() > limit {
        truncated = true;
    }
    ranked.truncate(limit);

    Ok(AgentQuickOpenIndexResult {
        root: root_text,
        entries: ranked.into_iter().map(|ranked| ranked.entry).collect(),
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_worktree_porcelain_without_mutating_state() {
        let records = parse_worktree_records(
            "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo-task\nHEAD def\ndetached\n",
        );
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].branch.as_deref(), Some("main"));
        assert_eq!(records[1].path, "/repo-task");
        assert!(records[1].detached);
    }

    #[test]
    fn extracts_high_signal_symbols() {
        assert_eq!(
            extract_symbol("pub async fn refresh_index() {", false),
            Some(("function", "refresh_index"))
        );
        assert_eq!(
            extract_symbol("export interface SearchResult {", false),
            Some(("interface", "SearchResult"))
        );
        assert_eq!(
            extract_symbol("func (s *Server) Listen() {", false),
            Some(("function", "Listen"))
        );
        assert_eq!(
            extract_symbol("## Quick Open", true),
            Some(("heading", "Quick Open"))
        );
    }

    #[test]
    fn score_prefers_exact_and_prefix_matches() {
        assert!(
            match_score("index", "index", "").unwrap()
                > match_score("index", "indexWorkspace", "").unwrap()
        );
        assert!(
            match_score("index", "indexWorkspace", "").unwrap()
                > match_score("index", "workspaceIndex", "").unwrap()
        );
        assert!(match_score("missing", "index", "workspace").is_none());
    }

    #[test]
    fn source_filter_rejects_hidden_and_secret_paths() {
        assert!(safe_relative_source_path(Path::new("src/main.ts")));
        assert!(!safe_relative_source_path(Path::new(
            ".claude/credentials.ts"
        )));
        assert!(!safe_relative_source_path(Path::new("src/.env")));
        assert!(!safe_relative_source_path(Path::new("target/generated.rs")));
    }
}
