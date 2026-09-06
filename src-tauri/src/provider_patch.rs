//! Upstream patch pipeline for Atelier-managed agent runtimes (Hermes and
//! Gajae Code).
//!
//! The Connections patch button, the `atelier provider patch` CLI, and the
//! repair path all run the same fail-closed pipeline:
//!
//!   backup → install upstream target → verify (version + readiness receipt +
//!   skill integrity) → publish receipt, and on any failure roll the managed
//!   runtime back to the pre-patch state before returning the reason.
//!
//! The support pin stays a *minimum verified baseline*: a successful patch
//! moves the receipt-recorded installed version ahead of the pin, and both
//! readiness and re-provisioning honor that receipt instead of restoring the
//! pin (credentials.rs repair paths reinstall the receipt version).

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Runtime};

use crate::credentials::{self, HermesEngineRecord, ManagedAgentRuntimeReadiness};

const PATCH_LOCK_FILE: &str = "patch.lock";
/// A crashed patch must not brick provisioning forever; a lock older than this
/// is treated as stale and replaced.
const PATCH_LOCK_STALE: Duration = Duration::from_secs(45 * 60);
const PATCH_BACKUP_DIR: &str = "patch-backup";
const PATCH_RECEIPT_FILE: &str = "patch-receipts.jsonl";
const PATCH_RECEIPT_MAX_BYTES: u64 = 1024 * 1024;

/// Result of one patch run. `to_version` equals `from_version` for a no-op
/// ("already latest") run; `rolled_back` is only true when an installation was
/// attempted, failed verification, and the pre-patch runtime was restored.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPatchOutcome {
    pub provider: String,
    pub from_version: Option<String>,
    pub to_version: String,
    pub target_tag: Option<String>,
    pub no_op: bool,
    pub rolled_back: bool,
    pub steps: Vec<String>,
    pub receipt_path: String,
}

pub(crate) type PatchProgress<'a> = &'a mut dyn FnMut(&str, &str);

// ---------------------------------------------------------------------------
// Cross-process patch lock
// ---------------------------------------------------------------------------

fn patch_lock_path(provider_root: &Path) -> PathBuf {
    provider_root.join(PATCH_LOCK_FILE)
}

struct PatchLockGuard {
    path: PathBuf,
}

impl Drop for PatchLockGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn lock_is_stale(path: &Path) -> bool {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .is_some_and(|age| age > PATCH_LOCK_STALE)
}

fn acquire_patch_lock(provider_root: &Path) -> Result<PatchLockGuard, String> {
    std::fs::create_dir_all(provider_root)
        .map_err(|error| format!("create {}: {error}", provider_root.display()))?;
    let path = patch_lock_path(provider_root);
    for _ in 0..2 {
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut file) => {
                use std::io::Write;
                let _ = writeln!(
                    file,
                    "{{\"pid\":{},\"startedAt\":\"{}\"}}",
                    std::process::id(),
                    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
                );
                return Ok(PatchLockGuard { path });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if lock_is_stale(&path) {
                    let _ = std::fs::remove_file(&path);
                    continue;
                }
                return Err(
                    "다른 패치 작업이 이미 진행 중입니다. 잠시 후 다시 시도하세요.".to_string(),
                );
            }
            Err(error) => return Err(format!("create {}: {error}", path.display())),
        }
    }
    Err("다른 패치 작업이 이미 진행 중입니다. 잠시 후 다시 시도하세요.".to_string())
}

/// Managed provisioning must not run concurrently with a live patch in another
/// process (the runtime directories are mid-swap). Fail fast with the reason.
pub(crate) fn ensure_no_active_patch(app_support: &Path, provider: &str) -> Result<(), String> {
    let path = patch_lock_path(&app_support.join("providers").join(provider));
    if path.is_file() && !lock_is_stale(&path) {
        return Err(format!(
            "{provider} 런타임 패치가 진행 중입니다. 완료 후 다시 시도하세요."
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Backup helpers
// ---------------------------------------------------------------------------

fn backup_root(provider_root: &Path) -> PathBuf {
    provider_root.join(PATCH_BACKUP_DIR)
}

fn new_backup_dir(provider_root: &Path) -> Result<PathBuf, String> {
    let root = backup_root(provider_root);
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("create {}: {error}", root.display()))?;
    let dir = root.join(format!(
        "backup-{}-{}",
        chrono::Utc::now().format("%Y%m%dT%H%M%SZ"),
        std::process::id()
    ));
    std::fs::create_dir_all(&dir).map_err(|error| format!("create {}: {error}", dir.display()))?;
    Ok(dir)
}

/// Keep only the newest backup directory (the one just written).
fn prune_old_backups(provider_root: &Path, keep: &Path) {
    let root = backup_root(provider_root);
    let Ok(entries) = std::fs::read_dir(&root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path != keep && path.is_dir() {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
}

#[cfg(target_os = "macos")]
fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Could not resolve the backup destination.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create {}: {error}", parent.display()))?;
    // `cp -a` preserves symlinks (bun bin links) and permissions.
    let mut command = std::process::Command::new("/bin/cp");
    command.arg("-a").arg(source).arg(destination);
    credentials::run_cli_installer(command, "managed runtime backup copy")
}

#[cfg(not(target_os = "macos"))]
fn copy_tree(_source: &Path, _destination: &Path) -> Result<(), String> {
    Err("관리형 런타임 패치는 현재 macOS에서만 지원됩니다.".to_string())
}

fn restore_file(backup: &Path, live: &Path) {
    if backup.is_file() {
        let _ = std::fs::copy(backup, live);
    } else {
        let _ = std::fs::remove_file(live);
    }
}

fn snapshot_file(source: &Path, backup: &Path) -> Result<(), String> {
    if source.is_file() {
        std::fs::copy(source, backup)
            .map(|_| ())
            .map_err(|error| format!("backup {}: {error}", source.display()))
    } else {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Patch receipts (append-only evidence log)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchReceipt<'a> {
    schema_version: u32,
    provider: &'a str,
    recorded_at: String,
    from_version: Option<&'a str>,
    to_version: &'a str,
    target_tag: Option<&'a str>,
    result: &'a str,
    steps: &'a [String],
    error: Option<&'a str>,
}

fn append_patch_receipt(provider_root: &Path, receipt: &PatchReceipt<'_>) -> String {
    let path = provider_root.join(PATCH_RECEIPT_FILE);
    let line = match serde_json::to_string(receipt) {
        Ok(line) => line,
        Err(_) => return path.to_string_lossy().into_owned(),
    };
    // Bounded append: rotate away an oversized log instead of growing forever.
    if std::fs::metadata(&path).is_ok_and(|metadata| metadata.len() > PATCH_RECEIPT_MAX_BYTES) {
        let _ = std::fs::rename(&path, path.with_extension("jsonl.old"));
    }
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(file, "{line}");
    }
    path.to_string_lossy().into_owned()
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/// Run the full patch pipeline for one provider. Blocking; call from
/// `spawn_blocking` (app) or directly (CLI).
pub(crate) fn patch_provider_blocking(
    app_support: &Path,
    provider: &str,
    progress: PatchProgress<'_>,
) -> Result<ProviderPatchOutcome, String> {
    if !cfg!(target_os = "macos") {
        return Err("관리형 런타임 패치는 현재 macOS에서만 지원됩니다.".to_string());
    }
    match provider {
        "gajecode" => patch_gajecode(app_support, progress),
        "hermes" => patch_hermes(app_support, progress),
        other => Err(format!(
            "Upstream patching is not available for provider {other}."
        )),
    }
}

/// Tauri command used by the Connections patch button. Streams progress over
/// the shared managed-runtime progress event channel.
#[tauri::command]
pub async fn provider_patch_upstream<R: Runtime>(
    app: AppHandle<R>,
    provider: String,
) -> Result<ProviderPatchOutcome, String> {
    let provider = provider.trim().to_ascii_lowercase();
    let app_support = credentials::app_support_dir().ok_or_else(|| {
        "Could not resolve the Atelier Application Support directory.".to_string()
    })?;
    let progress_app = app.clone();
    let progress_provider = provider.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        patch_provider_blocking(&app_support, &progress_provider, &mut |state, message| {
            let _ = progress_app.emit(
                "managed-agent-runtime-progress",
                serde_json::json!({
                    "provider": progress_provider,
                    "state": state,
                    "message": message,
                }),
            );
        })
    })
    .await
    .map_err(|error| format!("{provider} patch task failed: {error}"))?;
    if let Err(reason) = &result {
        let _ = app.emit(
            "managed-agent-runtime-progress",
            serde_json::json!({
                "provider": provider,
                "state": "patch_failed",
                "message": reason,
            }),
        );
    }
    result
}

// ---------------------------------------------------------------------------
// Gajae Code
// ---------------------------------------------------------------------------

fn patch_gajecode(
    app_support: &Path,
    progress: PatchProgress<'_>,
) -> Result<ProviderPatchOutcome, String> {
    let _install_guard = credentials::acquire_runtime_install_lock("gajecode")?;
    let provider_root = app_support.join("providers").join("gajecode");
    let _patch_lock = acquire_patch_lock(&provider_root)?;
    let mut steps: Vec<String> = Vec::new();
    let step = |steps: &mut Vec<String>,
                progress: &mut dyn FnMut(&str, &str),
                state: &str,
                message: &str| {
        log::info!("gajecode patch: {state}: {message}");
        steps.push(format!("{state}: {message}"));
        progress(state, message);
    };

    step(
        &mut steps,
        progress,
        "patch_check",
        "업스트림 최신 버전을 확인합니다.",
    );
    let upstream = credentials::upstream_reference_for("gajecode", true);
    let target = upstream.latest_version.clone().ok_or_else(|| {
        format!(
            "업스트림 버전을 확인할 수 없습니다: {}",
            upstream.error.as_deref().unwrap_or("원인 미상")
        )
    })?;

    let ready_before = credentials::verify_managed_runtime_at(app_support, "gajecode")
        .map_err(|error| format!("패치 전 런타임 검증에 실패했습니다: {error}"))?;
    let current = ready_before.installed_version.clone();
    if credentials::compare_semver(&target, &current) != std::cmp::Ordering::Greater {
        step(&mut steps, progress, "patch_done", "이미 최신 상태입니다.");
        let receipt_path = append_patch_receipt(
            &provider_root,
            &PatchReceipt {
                schema_version: 1,
                provider: "gajecode",
                recorded_at: now_rfc3339(),
                from_version: Some(&current),
                to_version: &current,
                target_tag: None,
                result: "no-op",
                steps: &steps,
                error: None,
            },
        );
        return Ok(ProviderPatchOutcome {
            provider: "gajecode".to_string(),
            from_version: Some(current.clone()),
            to_version: current,
            target_tag: None,
            no_op: true,
            rolled_back: false,
            steps,
            receipt_path,
        });
    }

    step(
        &mut steps,
        progress,
        "patch_backup",
        &format!("현재 런타임({current})을 백업합니다."),
    );
    let backup = new_backup_dir(&provider_root)?;
    let global_dir = provider_root.join("bun").join("install").join("global");
    let readiness = provider_root.join("readiness.json");
    // The skill bootstrap of the new version rewrites the managed default
    // skills, so the skills tree is part of the rollback surface too.
    let skills_dir = credentials::managed_runtime_layout_at(app_support, "gajecode")?.skills;
    if global_dir.is_dir() {
        copy_tree(&global_dir, &backup.join("global"))?;
    }
    if skills_dir.is_dir() {
        copy_tree(&skills_dir, &backup.join("skills"))?;
    }
    snapshot_file(&readiness, &backup.join("readiness.json"))?;

    step(
        &mut steps,
        progress,
        "patch_install",
        &format!("gajae-code {target} 설치를 시작합니다."),
    );
    let install_and_verify = || -> Result<ManagedAgentRuntimeReadiness, String> {
        credentials::install_gajecode_cli_at(
            app_support,
            &format!("{}@{target}", crate::upstream_check::GAJAE_UPSTREAM_PACKAGE),
        )?;
        let ready = credentials::finalize_managed_runtime_receipt_at(app_support, "gajecode")?;
        if ready.installed_version != target {
            return Err(format!(
                "설치 후 런타임 버전이 목표와 다릅니다 (목표 {target}, 실측 {}).",
                ready.installed_version
            ));
        }
        Ok(ready)
    };
    match install_and_verify() {
        Ok(_ready) => {
            step(
                &mut steps,
                progress,
                "patch_done",
                &format!("패치 완료: {current} → {target}"),
            );
            prune_old_backups(&provider_root, &backup);
            let receipt_path = append_patch_receipt(
                &provider_root,
                &PatchReceipt {
                    schema_version: 1,
                    provider: "gajecode",
                    recorded_at: now_rfc3339(),
                    from_version: Some(&current),
                    to_version: &target,
                    target_tag: None,
                    result: "success",
                    steps: &steps,
                    error: None,
                },
            );
            Ok(ProviderPatchOutcome {
                provider: "gajecode".to_string(),
                from_version: Some(current),
                to_version: target,
                target_tag: None,
                no_op: false,
                rolled_back: false,
                steps,
                receipt_path,
            })
        }
        Err(reason) => {
            step(
                &mut steps,
                progress,
                "patch_rollback",
                &format!("패치 실패, 이전 런타임({current})으로 롤백합니다: {reason}"),
            );
            let _ = std::fs::remove_dir_all(&global_dir);
            if backup.join("global").is_dir() {
                copy_tree(&backup.join("global"), &global_dir)?;
            }
            if backup.join("skills").is_dir() {
                let _ = std::fs::remove_dir_all(&skills_dir);
                copy_tree(&backup.join("skills"), &skills_dir)?;
            }
            restore_file(&backup.join("readiness.json"), &readiness);
            let restored = credentials::verify_managed_runtime_at(app_support, "gajecode")
                .map(|ready| ready.installed_version);
            let rollback_note = match &restored {
                Ok(version) => format!("롤백 검증 완료 (버전 {version})."),
                Err(error) => format!("롤백 후 검증 실패: {error}"),
            };
            step(&mut steps, progress, "patch_failed", &rollback_note);
            append_patch_receipt(
                &provider_root,
                &PatchReceipt {
                    schema_version: 1,
                    provider: "gajecode",
                    recorded_at: now_rfc3339(),
                    from_version: Some(&current),
                    to_version: &target,
                    target_tag: None,
                    result: "rolled-back",
                    steps: &steps,
                    error: Some(&reason),
                },
            );
            Err(format!("패치 실패 — 롤백됨: {reason}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Hermes (engine layout: shallow git checkout at the release tag + editable
// `uv sync --frozen` venv, matching the official shell-installer layout)
// ---------------------------------------------------------------------------

fn patch_hermes(
    app_support: &Path,
    progress: PatchProgress<'_>,
) -> Result<ProviderPatchOutcome, String> {
    let _install_guard = credentials::acquire_runtime_install_lock("hermes")?;
    let provider_root = app_support.join("providers").join("hermes");
    let _patch_lock = acquire_patch_lock(&provider_root)?;
    let mut steps: Vec<String> = Vec::new();
    let step = |steps: &mut Vec<String>,
                progress: &mut dyn FnMut(&str, &str),
                state: &str,
                message: &str| {
        log::info!("hermes patch: {state}: {message}");
        steps.push(format!("{state}: {message}"));
        progress(state, message);
    };

    step(
        &mut steps,
        progress,
        "patch_check",
        "업스트림 최신 릴리스 태그를 확인합니다.",
    );
    let upstream = credentials::upstream_reference_for("hermes", true);
    let target_version = upstream.latest_version.clone().ok_or_else(|| {
        format!(
            "업스트림 버전을 확인할 수 없습니다: {}",
            upstream.error.as_deref().unwrap_or("원인 미상")
        )
    })?;
    let target_tag = upstream
        .latest_tag
        .clone()
        .ok_or_else(|| "업스트림 릴리스 태그를 확인할 수 없습니다.".to_string())?;
    let target_commit = upstream
        .latest_commit
        .clone()
        .ok_or_else(|| "업스트림 릴리스 커밋을 확인할 수 없습니다.".to_string())?;

    let ready_before = credentials::verify_managed_runtime_at(app_support, "hermes")
        .map_err(|error| format!("패치 전 런타임 검증에 실패했습니다: {error}"))?;
    let current_commit = ready_before.installed_version.clone();
    let installed_tag = Some(credentials::hermes_installed_tag_at(app_support));
    let installed_tag_version =
        crate::upstream_check::version_from_tag(installed_tag.as_deref().unwrap_or(""));
    if credentials::semver_parts(&target_version)
        <= credentials::semver_parts(&installed_tag_version)
    {
        step(&mut steps, progress, "patch_done", "이미 최신 상태입니다.");
        let receipt_path = append_patch_receipt(
            &provider_root,
            &PatchReceipt {
                schema_version: 1,
                provider: "hermes",
                recorded_at: now_rfc3339(),
                from_version: Some(&current_commit),
                to_version: &current_commit,
                target_tag: installed_tag.as_deref(),
                result: "no-op",
                steps: &steps,
                error: None,
            },
        );
        return Ok(ProviderPatchOutcome {
            provider: "hermes".to_string(),
            from_version: Some(current_commit.clone()),
            to_version: current_commit,
            target_tag: installed_tag,
            no_op: true,
            rolled_back: false,
            steps,
            receipt_path,
        });
    }

    step(
        &mut steps,
        progress,
        "patch_backup",
        &format!(
            "현재 런타임({})을 백업합니다.",
            installed_tag.as_deref().unwrap_or(&current_commit)
        ),
    );
    let backup = new_backup_dir(&provider_root)?;
    let install_record = provider_root.join("install.json");
    let readiness = provider_root.join("readiness.json");
    snapshot_file(&install_record, &backup.join("install.json"))?;
    snapshot_file(&readiness, &backup.join("readiness.json"))?;
    // The bundled-skill bootstrap of the new release rewrites both the durable
    // bundled source and the installed skills tree, so both belong to the
    // rollback surface alongside the engine checkout.
    let skills_dir = credentials::managed_runtime_layout_at(app_support, "hermes")?.skills;
    let bundled_dir = provider_root.join("bundled");
    if skills_dir.is_dir() {
        copy_tree(&skills_dir, &backup.join("skills"))?;
    }
    if bundled_dir.is_dir() {
        copy_tree(&bundled_dir, &backup.join("bundled"))?;
    }
    let engine_dir = credentials::hermes_engine_dir_at(app_support);
    let parked_engine = backup.join("engine");
    if engine_dir.is_dir() {
        std::fs::rename(&engine_dir, &parked_engine).map_err(|error| {
            format!(
                "park {} -> {}: {error}",
                engine_dir.display(),
                parked_engine.display()
            )
        })?;
    }

    step(
        &mut steps,
        progress,
        "patch_install",
        &format!("Hermes {target_tag} 엔진 설치를 시작합니다 (shallow clone + uv sync)."),
    );
    let mut install_and_verify = || -> Result<ManagedAgentRuntimeReadiness, String> {
        install_hermes_engine_at(
            app_support,
            &target_tag,
            &target_commit,
            &mut |state, message| progress(state, message),
        )?;
        let ready = credentials::finalize_managed_runtime_receipt_at(app_support, "hermes")?;
        if ready.installed_version != target_commit {
            return Err(format!(
                "설치 후 런타임 커밋이 목표와 다릅니다 (목표 {target_commit}, 실측 {}).",
                ready.installed_version
            ));
        }
        Ok(ready)
    };
    match install_and_verify() {
        Ok(_ready) => {
            step(
                &mut steps,
                progress,
                "patch_done",
                &format!(
                    "패치 완료: {} → {target_tag}",
                    installed_tag.as_deref().unwrap_or(&current_commit)
                ),
            );
            prune_old_backups(&provider_root, &backup);
            let receipt_path = append_patch_receipt(
                &provider_root,
                &PatchReceipt {
                    schema_version: 1,
                    provider: "hermes",
                    recorded_at: now_rfc3339(),
                    from_version: Some(&current_commit),
                    to_version: &target_commit,
                    target_tag: Some(&target_tag),
                    result: "success",
                    steps: &steps,
                    error: None,
                },
            );
            Ok(ProviderPatchOutcome {
                provider: "hermes".to_string(),
                from_version: Some(current_commit),
                to_version: target_commit,
                target_tag: Some(target_tag),
                no_op: false,
                rolled_back: false,
                steps,
                receipt_path,
            })
        }
        Err(reason) => {
            step(
                &mut steps,
                progress,
                "patch_rollback",
                &format!("패치 실패, 이전 런타임으로 롤백합니다: {reason}"),
            );
            let _ = std::fs::remove_dir_all(&engine_dir);
            if parked_engine.is_dir() {
                let _ = std::fs::rename(&parked_engine, &engine_dir);
            }
            if backup.join("skills").is_dir() {
                let _ = std::fs::remove_dir_all(&skills_dir);
                copy_tree(&backup.join("skills"), &skills_dir)?;
            }
            if backup.join("bundled").is_dir() {
                let _ = std::fs::remove_dir_all(&bundled_dir);
                copy_tree(&backup.join("bundled"), &bundled_dir)?;
            }
            restore_file(&backup.join("install.json"), &install_record);
            restore_file(&backup.join("readiness.json"), &readiness);
            let restored = credentials::verify_managed_runtime_at(app_support, "hermes")
                .map(|ready| ready.installed_version);
            let rollback_note = match &restored {
                Ok(version) => format!("롤백 검증 완료 (커밋 {version})."),
                Err(error) => format!("롤백 후 검증 실패: {error}"),
            };
            step(&mut steps, progress, "patch_failed", &rollback_note);
            append_patch_receipt(
                &provider_root,
                &PatchReceipt {
                    schema_version: 1,
                    provider: "hermes",
                    recorded_at: now_rfc3339(),
                    from_version: Some(&current_commit),
                    to_version: &target_commit,
                    target_tag: Some(&target_tag),
                    result: "rolled-back",
                    steps: &steps,
                    error: Some(&reason),
                },
            );
            Err(format!("패치 실패 — 롤백됨: {reason}"))
        }
    }
}

/// Install the Hermes engine layout at `tag`/`commit` into the managed
/// provider root: shallow clone, provenance check, relocatable venv,
/// `uv sync --frozen --extra anthropic`, version probe, install record, and
/// bundled-skill bootstrap. Also used by the repair path so a patched runtime
/// survives re-provisioning.
///
/// The build happens **in place** at the final engine path (any previous
/// engine is parked first and restored on failure). An editable install
/// records absolute source paths in the venv (`__editable__*.pth`), so a
/// build-then-move staging flow breaks imports after the move — measured on
/// 2026-09-07 as `ModuleNotFoundError: No module named 'hermes_cli'`.
pub(crate) fn install_hermes_engine_at(
    app_support: &Path,
    tag: &str,
    commit: &str,
    progress: PatchProgress<'_>,
) -> Result<PathBuf, String> {
    if commit.len() != 40 || !commit.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Hermes 대상 커밋 식별자가 유효하지 않습니다.".to_string());
    }
    if !tag.starts_with('v')
        || !tag[1..]
            .chars()
            .all(|c| c.is_ascii_digit() || c == '.' || c == '-' || c == '_')
    {
        return Err(format!("Hermes 대상 태그가 유효하지 않습니다: {tag}"));
    }
    let layout = credentials::managed_runtime_layout_at(app_support, "hermes")?;
    let layout_temp = layout.temp.clone();
    let managed_cache = layout.cache.clone();
    std::fs::create_dir_all(&layout_temp)
        .map_err(|error| format!("create {}: {error}", layout_temp.display()))?;
    let uv = credentials::ensure_uv_at(app_support)?;
    let python = credentials::ensure_hermes_managed_python_at(app_support, &uv)?;

    // Park any existing engine so the final path is free for the in-place
    // build; restore it whenever the build fails.
    let engine_dir = credentials::hermes_engine_dir_at(app_support);
    let parked = layout_temp.join(format!(
        "engine-old-{}-{}",
        chrono::Utc::now().timestamp_millis(),
        std::process::id()
    ));
    let had_engine = engine_dir.is_dir();
    if had_engine {
        std::fs::rename(&engine_dir, &parked).map_err(|error| {
            format!(
                "park {} -> {}: {error}",
                engine_dir.display(),
                parked.display()
            )
        })?;
    }
    let fail = |reason: String| -> String {
        rollback_engine_swap(&engine_dir, &parked, had_engine);
        reason
    };

    let mut build = || -> Result<String, String> {
        progress(
            "patch_install",
            &format!("{tag} 소스를 내려받습니다 (shallow clone)."),
        );
        let provider_root = credentials::hermes_provider_root_at(app_support);
        let mut clone = credentials::hermes_git_command(&provider_root);
        clone
            .args(["clone", "--depth", "1", "--branch", tag])
            .arg(crate::upstream_check::HERMES_UPSTREAM_REPOSITORY)
            .arg(&engine_dir);
        credentials::run_cli_installer(clone, "Hermes engine clone")?;

        let head = credentials::hermes_git_stdout(
            &engine_dir,
            &["rev-parse", "--verify", "HEAD^{commit}"],
            "Hermes engine HEAD verification",
        )?;
        if head != commit {
            return Err(format!(
                "클론된 체크아웃 HEAD({head})가 업스트림 태그 커밋({commit})과 다릅니다."
            ));
        }

        progress("patch_install", "격리 가상환경을 생성합니다.");
        let mut venv = credentials::cli_command(&uv.to_string_lossy());
        credentials::configure_hermes_runtime_env(&mut venv)?;
        venv.args(["venv", "--relocatable", "--python"])
            .arg(&python)
            .arg(engine_dir.join(".venv"))
            .current_dir(&engine_dir)
            .env("UV_CACHE_DIR", &managed_cache)
            .env("UV_NO_CONFIG", "1");
        credentials::run_cli_installer(venv, "Hermes engine venv")?;

        progress(
            "patch_install",
            "잠금파일 그대로 의존성을 설치합니다 (uv sync --frozen --extra anthropic).",
        );
        let mut sync = credentials::cli_command(&uv.to_string_lossy());
        credentials::configure_hermes_runtime_env(&mut sync)?;
        sync.args(["sync", "--frozen", "--extra", "anthropic", "--no-dev"])
            .current_dir(&engine_dir)
            .env("UV_CACHE_DIR", &managed_cache)
            .env("UV_NO_CONFIG", "1")
            .env("UV_PROJECT_ENVIRONMENT", engine_dir.join(".venv"))
            .env("GIT_TERMINAL_PROMPT", "0");
        credentials::run_cli_installer(sync, "Hermes engine dependency sync")?;

        let executable = engine_dir.join(".venv").join("bin").join("hermes");
        let version_line = probe_hermes_version(&executable, app_support)?;
        let expected_version = crate::upstream_check::version_from_tag(tag);
        if !version_line.contains(&expected_version) {
            return Err(format!(
                "설치된 Hermes 버전 출력({version_line})에 대상 릴리스({expected_version})가 없습니다."
            ));
        }
        Ok(version_line)
    };
    let final_version = build().map_err(fail)?;

    let executable = engine_dir.join(".venv").join("bin").join("hermes");
    credentials::save_hermes_engine_install_record_at(
        app_support,
        &executable,
        &HermesEngineRecord {
            tag: tag.to_string(),
            commit: commit.to_string(),
            version: final_version,
        },
    )?;
    progress("patch_install", "기본 스킬 번들을 검증·동기화합니다.");
    credentials::bootstrap_hermes_skills_at_with_commit(app_support, commit)?;
    if had_engine {
        let _ = std::fs::remove_dir_all(&parked);
    }
    Ok(executable)
}

fn rollback_engine_swap(engine_dir: &Path, parked: &Path, had_engine: bool) {
    let _ = std::fs::remove_dir_all(engine_dir);
    if had_engine {
        let _ = std::fs::rename(parked, engine_dir);
    }
}

fn probe_hermes_version(executable: &Path, app_support: &Path) -> Result<String, String> {
    if !executable.is_file() {
        return Err(format!(
            "Hermes 실행 파일이 없습니다: {}",
            executable.display()
        ));
    }
    let mut command = credentials::cli_command(&executable.to_string_lossy());
    credentials::configure_hermes_runtime_env_at(&mut command, app_support)?;
    command.arg("--version");
    credentials::run_runtime_probe(
        command,
        "Hermes engine version probe",
        credentials::MANAGED_RUNTIME_CHECK_TIMEOUT,
    )
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("atelier-patch-lock-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp root");
        dir
    }

    #[test]
    fn patch_lock_is_exclusive_and_released_on_drop() {
        let root = temp_root("exclusive");
        let guard = acquire_patch_lock(&root).expect("first lock");
        assert!(
            acquire_patch_lock(&root).is_err(),
            "a second concurrent patch must be refused"
        );
        drop(guard);
        let again = acquire_patch_lock(&root).expect("lock must be reacquirable after drop");
        drop(again);
        assert!(
            !patch_lock_path(&root).exists(),
            "drop must remove the lock"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn provisioning_gate_blocks_only_fresh_locks() {
        let app_support = temp_root("gate");
        let provider_root = app_support.join("providers").join("gajecode");
        std::fs::create_dir_all(&provider_root).expect("provider root");
        assert!(ensure_no_active_patch(&app_support, "gajecode").is_ok());
        let _guard = acquire_patch_lock(&provider_root).expect("lock");
        let error = ensure_no_active_patch(&app_support, "gajecode")
            .expect_err("a live patch must block provisioning");
        assert!(error.contains("패치가 진행 중"), "{error}");
        let _ = std::fs::remove_dir_all(&app_support);
    }

    #[test]
    fn patch_receipts_append_json_lines() {
        let root = temp_root("receipts");
        let steps = vec!["patch_check: ok".to_string()];
        let path = append_patch_receipt(
            &root,
            &PatchReceipt {
                schema_version: 1,
                provider: "gajecode",
                recorded_at: now_rfc3339(),
                from_version: Some("0.15.2"),
                to_version: "0.16.4",
                target_tag: None,
                result: "success",
                steps: &steps,
                error: None,
            },
        );
        let text = std::fs::read_to_string(&path).expect("receipt file");
        let line: serde_json::Value =
            serde_json::from_str(text.lines().last().expect("one line")).expect("json line");
        assert_eq!(line["provider"], "gajecode");
        assert_eq!(line["toVersion"], "0.16.4");
        assert_eq!(line["result"], "success");
        let _ = std::fs::remove_dir_all(&root);
    }
}
