//! Upstream "latest version" reference lookups for Atelier-managed agents.
//!
//! This module only answers "what does upstream currently publish?" so the
//! Connections cards can show it next to the Atelier support pin. It never
//! participates in `update_available`, install targets, or readiness: the
//! managed install/update path keeps using the exact pin selected by this build.
//!
//! Every lookup is failure-tolerant (network errors become a short reason
//! string), bounded by a 5 second timeout, and cached per provider in
//! `upstream-check.json` for six hours unless the caller forces a refresh.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub(crate) const UPSTREAM_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
pub(crate) const UPSTREAM_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
pub(crate) const UPSTREAM_CACHE_FILE: &str = "upstream-check.json";
const UPSTREAM_CACHE_SCHEMA: u32 = 1;
const UPSTREAM_CACHE_MAX_BYTES: u64 = 16 * 1024;
const UPSTREAM_OUTPUT_MAX_BYTES: usize = 256 * 1024;

pub(crate) const HERMES_UPSTREAM_REPOSITORY: &str =
    "https://github.com/NousResearch/hermes-agent.git";
pub(crate) const GROK_UPSTREAM_STABLE_URL: &str = "https://x.ai/cli/stable";
pub(crate) const GAJAE_UPSTREAM_PACKAGE: &str = "gajae-code";

/// Result of one upstream lookup. `latest_version` is `None` whenever the lookup
/// failed; `error` then carries a short, user-presentable reason.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpstreamReference {
    pub latest_version: Option<String>,
    pub latest_tag: Option<String>,
    pub checked_at: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct UpstreamCacheRecord {
    schema_version: u32,
    provider: String,
    checked_at_unix: i64,
    reference: UpstreamReference,
}

fn cache_path(provider_root: &Path) -> PathBuf {
    provider_root.join(UPSTREAM_CACHE_FILE)
}

fn read_cache(provider_root: &Path, provider: &str, now_unix: i64) -> Option<UpstreamReference> {
    let path = cache_path(provider_root);
    let metadata = std::fs::metadata(&path).ok()?;
    if metadata.len() == 0 || metadata.len() > UPSTREAM_CACHE_MAX_BYTES {
        return None;
    }
    let text = std::fs::read_to_string(&path).ok()?;
    let record: UpstreamCacheRecord = serde_json::from_str(&text).ok()?;
    if record.schema_version != UPSTREAM_CACHE_SCHEMA || record.provider != provider {
        return None;
    }
    // Only successful lookups are worth reusing; a failed lookup should be
    // retried on the next check instead of being shown for six hours.
    record.reference.latest_version.as_ref()?;
    let age = now_unix.saturating_sub(record.checked_at_unix);
    if age < 0 || age as u64 > UPSTREAM_CACHE_TTL.as_secs() {
        return None;
    }
    Some(record.reference)
}

fn write_cache(provider_root: &Path, provider: &str, now_unix: i64, reference: &UpstreamReference) {
    if reference.latest_version.is_none() {
        return;
    }
    let record = UpstreamCacheRecord {
        schema_version: UPSTREAM_CACHE_SCHEMA,
        provider: provider.to_string(),
        checked_at_unix: now_unix,
        reference: reference.clone(),
    };
    let Ok(body) = serde_json::to_string_pretty(&record) else {
        return;
    };
    if std::fs::create_dir_all(provider_root).is_err() {
        return;
    }
    let path = cache_path(provider_root);
    let temporary = path.with_extension(format!("json.tmp-{}", std::process::id()));
    if std::fs::write(&temporary, body).is_ok() && std::fs::rename(&temporary, &path).is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
}

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn configure_background(command: &mut Command) {
    #[cfg(target_os = "windows")]
    crate::agent_process::configure_windows_background_command(command);
    #[cfg(not(target_os = "windows"))]
    let _ = command;
}

/// Run a short-lived lookup command and return trimmed stdout. Fails on spawn
/// errors, the 5 second timeout, or a non-zero exit.
fn run_lookup(mut command: Command, label: &str) -> Result<String, String> {
    configure_background(&mut command);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = command
        .spawn()
        .map_err(|error| format!("{label}: {}", short_io_error(&error)))?;
    let (output, timed_out) =
        crate::agent_process::wait_with_timeout(child, UPSTREAM_CHECK_TIMEOUT)?;
    if timed_out {
        return Err(format!(
            "{label}: {}초 내 응답 없음",
            UPSTREAM_CHECK_TIMEOUT.as_secs()
        ));
    }
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let reason = stderr
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .unwrap_or("exit code != 0");
        return Err(format!("{label}: {}", clip(reason, 120)));
    }
    let stdout = &output.stdout[..output.stdout.len().min(UPSTREAM_OUTPUT_MAX_BYTES)];
    Ok(String::from_utf8_lossy(stdout).trim().to_string())
}

fn short_io_error(error: &std::io::Error) -> String {
    match error.kind() {
        std::io::ErrorKind::NotFound => "실행 파일 없음".to_string(),
        _ => clip(&error.to_string(), 120),
    }
}

fn clip(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    text.chars().take(max_chars).collect::<String>() + "…"
}

// ---------------------------------------------------------------------------
// Pure parsers (unit-tested, no I/O)
// ---------------------------------------------------------------------------

/// Extract the first token that looks like a semantic version (`1.0.5`, `0.15.0`).
pub(crate) fn parse_semver_line(text: &str) -> Option<String> {
    text.split(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == ',')
        .map(|token| token.trim_matches(|c: char| !(c.is_ascii_alphanumeric() || c == '.')))
        .find(|token| {
            let mut parts = token.split('.');
            let numeric = |part: Option<&str>| {
                part.is_some_and(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
            };
            numeric(parts.next()) && numeric(parts.next()) && numeric(parts.next())
        })
        .map(str::to_string)
}

fn tag_numeric_parts(tag: &str) -> Vec<u64> {
    tag.trim_start_matches('v')
        .split(['.', '-', '_'])
        .map_while(|part| part.parse::<u64>().ok())
        .collect()
}

/// Pick the highest `v*` tag from `git ls-remote --tags` output. Tags are
/// compared numerically part by part, so date-like tags such as `v2026.8.19`
/// sort after `v2026.7.20` and `v2026.8.9`; peeled `^{}` entries are ignored.
pub(crate) fn highest_version_tag(ls_remote: &str) -> Option<String> {
    ls_remote
        .lines()
        .filter_map(|line| line.split_whitespace().nth(1))
        .filter_map(|reference| reference.strip_prefix("refs/tags/"))
        .filter(|tag| !tag.ends_with("^{}"))
        .filter(|tag| {
            tag.starts_with('v') && tag[1..].chars().next().is_some_and(|c| c.is_ascii_digit())
        })
        .map(|tag| (tag_numeric_parts(tag), tag.to_string()))
        .filter(|(parts, _)| !parts.is_empty())
        .max_by(|(left, _), (right, _)| left.cmp(right))
        .map(|(_, tag)| tag)
}

/// Hermes tags look like `v2026.8.19`; the version they carry is `2026.8.19`.
pub(crate) fn version_from_tag(tag: &str) -> String {
    tag.trim_start_matches('v').to_string()
}

// ---------------------------------------------------------------------------
// Provider-specific lookups
// ---------------------------------------------------------------------------

fn lookup_gajecode(managed_bun: Option<&Path>, path_env: &str) -> Result<String, String> {
    let mut attempts: Vec<(String, Command)> = Vec::new();
    if let Some(bun) = managed_bun.filter(|bun| bun.is_file()) {
        let mut command = Command::new(bun);
        command.args(["pm", "view", GAJAE_UPSTREAM_PACKAGE, "version"]);
        attempts.push(("bun pm view".to_string(), command));
    }
    let mut npm = crate::agent_process::command_for_cli("npm");
    npm.args(["view", GAJAE_UPSTREAM_PACKAGE, "version"]);
    attempts.push(("npm view".to_string(), npm));

    let mut last_error = String::from("npm 조회 경로 없음");
    for (label, mut command) in attempts {
        command.env("PATH", path_env).env("NO_COLOR", "1");
        match run_lookup(command, &label).and_then(|stdout| {
            parse_semver_line(&stdout).ok_or_else(|| format!("{label}: 버전 파싱 실패"))
        }) {
            Ok(version) => return Ok(version),
            Err(error) => last_error = error,
        }
    }
    Err(last_error)
}

fn lookup_hermes(path_env: &str) -> Result<(String, String), String> {
    let mut command = crate::agent_process::command_for_cli("git");
    command
        .args(["ls-remote", "--tags", HERMES_UPSTREAM_REPOSITORY])
        .env("PATH", path_env)
        .env("GIT_TERMINAL_PROMPT", "0");
    let stdout = run_lookup(command, "git ls-remote")?;
    let tag =
        highest_version_tag(&stdout).ok_or_else(|| "git ls-remote: v* 태그 없음".to_string())?;
    Ok((version_from_tag(&tag), tag))
}

fn lookup_grok() -> Result<String, String> {
    let mut command = Command::new(if cfg!(target_os = "windows") {
        "curl"
    } else {
        "/usr/bin/curl"
    });
    command.args([
        "--proto",
        "=https",
        "--tlsv1.2",
        "-fsSL",
        "--max-time",
        "5",
        GROK_UPSTREAM_STABLE_URL,
    ]);
    let stdout = run_lookup(command, "x.ai/cli/stable")?;
    parse_semver_line(&stdout).ok_or_else(|| "x.ai/cli/stable: 버전 파싱 실패".to_string())
}

/// Inputs that the credential layer resolves for us so this module stays free
/// of Application Support lookups.
pub(crate) struct UpstreamLookupContext<'a> {
    pub provider: &'a str,
    pub provider_root: Option<&'a Path>,
    pub managed_bun: Option<&'a Path>,
    pub path_env: &'a str,
    pub force: bool,
}

/// Resolve the upstream reference for one provider, honoring the cache unless
/// `force` is set. Never returns `Err`: failures are folded into the reference.
pub(crate) fn resolve_upstream_reference(context: UpstreamLookupContext<'_>) -> UpstreamReference {
    let now = now_unix();
    if !context.force {
        if let Some(cached) = context
            .provider_root
            .and_then(|root| read_cache(root, context.provider, now))
        {
            return cached;
        }
    }
    let started = Instant::now();
    let result: Result<(String, Option<String>), String> = match context.provider {
        "gajecode" => lookup_gajecode(context.managed_bun, context.path_env).map(|v| (v, None)),
        "hermes" => lookup_hermes(context.path_env).map(|(v, tag)| (v, Some(tag))),
        "grok" => lookup_grok().map(|v| (v, None)),
        other => Err(format!("unknown provider {other}")),
    };
    let elapsed_ms = started.elapsed().as_millis();
    let reference = match result {
        Ok((version, tag)) => {
            log::info!(
                "upstream check {}: latest={} tag={} ({elapsed_ms}ms)",
                context.provider,
                version,
                tag.as_deref().unwrap_or("-")
            );
            UpstreamReference {
                latest_version: Some(version),
                latest_tag: tag,
                checked_at: Some(now_rfc3339()),
                error: None,
            }
        }
        Err(error) => {
            log::info!(
                "upstream check {}: failed ({elapsed_ms}ms): {error}",
                context.provider
            );
            UpstreamReference {
                latest_version: None,
                latest_tag: None,
                checked_at: Some(now_rfc3339()),
                error: Some(error),
            }
        }
    };
    if let Some(root) = context.provider_root {
        write_cache(root, context.provider, now, &reference);
    }
    reference
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_line_parser_accepts_plain_and_quoted_versions() {
        assert_eq!(parse_semver_line("1.0.5").as_deref(), Some("1.0.5"));
        assert_eq!(parse_semver_line("1.0.5\n").as_deref(), Some("1.0.5"));
        assert_eq!(parse_semver_line("\"0.15.0\"\n").as_deref(), Some("0.15.0"));
        assert_eq!(
            parse_semver_line("gajae-code@0.15.0 | MIT\n0.15.0").as_deref(),
            Some("0.15.0")
        );
        assert_eq!(parse_semver_line("<html>not found</html>"), None);
        assert_eq!(parse_semver_line("1.0"), None);
    }

    #[test]
    fn highest_tag_orders_date_like_tags_numerically() {
        let ls_remote = "\
aaa\trefs/tags/v2026.7.20
bbb\trefs/tags/v2026.7.20^{}
ccc\trefs/tags/v2026.8.9
ddd\trefs/tags/v2026.8.19
eee\trefs/tags/v2026.8.19^{}
fff\trefs/tags/legacy-2027
ggg\trefs/tags/v2025.12.31
";
        assert_eq!(
            highest_version_tag(ls_remote).as_deref(),
            Some("v2026.8.19")
        );
        assert_eq!(version_from_tag("v2026.8.19"), "2026.8.19");
        assert_eq!(highest_version_tag("abc\trefs/heads/main\n"), None);
    }

    #[test]
    fn cache_round_trips_and_honors_ttl_and_provider() {
        let dir =
            std::env::temp_dir().join(format!("atelier-upstream-cache-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let fresh = UpstreamReference {
            latest_version: Some("0.15.0".to_string()),
            latest_tag: None,
            checked_at: Some("2026-08-24T00:00:00Z".to_string()),
            error: None,
        };
        let now = 1_000_000;
        write_cache(&dir, "gajecode", now, &fresh);
        assert_eq!(read_cache(&dir, "gajecode", now + 60), Some(fresh.clone()));
        assert_eq!(
            read_cache(&dir, "hermes", now + 60),
            None,
            "provider mismatch"
        );
        assert_eq!(
            read_cache(
                &dir,
                "gajecode",
                now + UPSTREAM_CACHE_TTL.as_secs() as i64 + 1
            ),
            None,
            "expired cache must not be served"
        );

        let failed = UpstreamReference {
            latest_version: None,
            latest_tag: None,
            checked_at: Some("2026-08-24T00:00:00Z".to_string()),
            error: Some("offline".to_string()),
        };
        write_cache(&dir, "gajecode", now + 120, &failed);
        assert_eq!(
            read_cache(&dir, "gajecode", now + 180),
            Some(fresh),
            "a failed lookup must not overwrite the last successful reference"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unknown_provider_folds_into_error_without_panicking() {
        let reference = resolve_upstream_reference(UpstreamLookupContext {
            provider: "unknown",
            provider_root: None,
            managed_bun: None,
            path_env: "",
            force: true,
        });
        assert!(reference.latest_version.is_none());
        assert!(reference
            .error
            .as_deref()
            .is_some_and(|e| e.contains("unknown provider")));
    }
}

#[cfg(test)]
mod real_network_tests {
    use super::*;

    /// Real-network proof, opt-in via `ATELIER_REAL_UPSTREAM_CHECK=1` so the
    /// default suite stays offline. Prints the resolved upstream values and
    /// checks each is a well-formed version newer-or-equal to a known floor.
    #[test]
    fn real_upstream_lookups_resolve_current_versions() {
        if std::env::var("ATELIER_REAL_UPSTREAM_CHECK").as_deref() != Ok("1") {
            eprintln!("skipping real upstream lookup (set ATELIER_REAL_UPSTREAM_CHECK=1)");
            return;
        }
        let root =
            std::env::temp_dir().join(format!("atelier-upstream-real-{}", std::process::id()));
        let path_env = std::env::var("PATH").unwrap_or_default();
        for (provider, floor) in [
            ("gajecode", "0.15.0"),
            ("hermes", "2026.8.19"),
            ("grok", "1.0.5"),
        ] {
            let reference = resolve_upstream_reference(UpstreamLookupContext {
                provider,
                provider_root: Some(&root.join(provider)),
                managed_bun: None,
                path_env: &path_env,
                force: true,
            });
            eprintln!("real upstream {provider}: {reference:?}");
            let version = reference.latest_version.as_deref().unwrap_or_else(|| {
                panic!("{provider} upstream lookup failed: {:?}", reference.error)
            });
            assert!(
                tag_numeric_parts(version) >= tag_numeric_parts(floor),
                "{provider}: {version} < {floor}"
            );
            assert!(reference.checked_at.is_some() && reference.error.is_none());
            // A second, non-forced call must be served from the cache file.
            let cached = resolve_upstream_reference(UpstreamLookupContext {
                provider,
                provider_root: Some(&root.join(provider)),
                managed_bun: None,
                path_env: &path_env,
                force: false,
            });
            assert_eq!(
                cached, reference,
                "{provider}: cache must replay the fresh lookup"
            );
            assert!(root.join(provider).join(UPSTREAM_CACHE_FILE).is_file());
        }
        let _ = std::fs::remove_dir_all(&root);
    }
}
