#![cfg_attr(not(target_os = "windows"), allow(dead_code, unused_imports))]

use std::{
    fs,
    net::{Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};

use axum::{
    body::Body,
    extract::State,
    http::{header, Response, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use axum_server::tls_rustls::RustlsConfig;
use bytes::Bytes;
use chrono::Utc;
use rcgen::{generate_simple_self_signed, CertifiedKey};
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{Manager, Url};
use tauri_plugin_updater::UpdaterExt;

const CANARY_SCHEMA_VERSION: u32 = 1;
const WINDOWS_UPDATER_TARGET: &str = "windows-x86_64-msi";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CanaryConfig {
    schema_version: u32,
    nonce: String,
    candidate_path: PathBuf,
    candidate_signature: String,
    candidate_sha256: String,
    candidate_bytes: u64,
    expected_version: String,
    release_tag: String,
    source_sha: String,
    github_run_id: String,
    github_run_attempt: u32,
    runner_name: String,
    mode: String,
    handoff_path: PathBuf,
    final_receipt_path: PathBuf,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CanaryHandoff {
    schema_version: u32,
    status: String,
    generated_at: String,
    nonce: String,
    release_tag: String,
    source_sha: String,
    expected_version: String,
    from_version: String,
    github_run_id: String,
    github_run_attempt: u32,
    runner_name: String,
    mode: String,
    candidate_sha256: String,
    candidate_bytes: u64,
    downloaded_bytes: u64,
    metadata_requests: u64,
    candidate_requests: u64,
    signature_verified_by_tauri_updater: bool,
    installer_launch_requested: bool,
}

#[derive(Clone)]
struct ServerState {
    metadata: Arc<Value>,
    candidate: Bytes,
    metadata_requests: Arc<AtomicU64>,
    candidate_requests: Arc<AtomicU64>,
}

fn sha256_bytes(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path)
        .map_err(|error| format!("read updater canary file {}: {error}", path.display()))?;
    Ok(sha256_bytes(&bytes))
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("receipt path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("create receipt directory {}: {error}", parent.display()))?;
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("serialize updater canary receipt: {error}"))?;
    fs::write(path, bytes)
        .map_err(|error| format!("write updater canary receipt {}: {error}", path.display()))
}

fn load_config(path: &Path) -> Result<CanaryConfig, String> {
    if !path.is_absolute() {
        return Err("updater canary config path must be absolute".to_string());
    }
    let bytes = fs::read(path)
        .map_err(|error| format!("read updater canary config {}: {error}", path.display()))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse updater canary config {}: {error}", path.display()))
}

fn validate_config(config: &CanaryConfig) -> Result<(), String> {
    if config.schema_version != CANARY_SCHEMA_VERSION {
        return Err(format!(
            "unsupported updater canary schema version {}",
            config.schema_version
        ));
    }
    if config.nonce.trim().len() < 16 {
        return Err("updater canary nonce must contain at least 16 characters".to_string());
    }
    let expected_version = Version::parse(&config.expected_version)
        .map_err(|error| format!("invalid expected updater version: {error}"))?;
    if config.release_tag != format!("v{expected_version}") {
        return Err("updater canary release tag does not match expected version".to_string());
    }
    if config.source_sha.len() != 40
        || !config
            .source_sha
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("updater canary source SHA must contain 40 hexadecimal characters".to_string());
    }
    if config.github_run_id.is_empty()
        || !config
            .github_run_id
            .chars()
            .all(|character| character.is_ascii_digit())
        || config.github_run_attempt == 0
        || config.runner_name.trim().is_empty()
    {
        return Err("updater canary GitHub run identity is incomplete".to_string());
    }
    if !matches!(config.mode.as_str(), "upgrade" | "self-reinstall") {
        return Err("updater canary mode must be upgrade or self-reinstall".to_string());
    }
    for (name, path) in [
        ("candidate", &config.candidate_path),
        ("handoff", &config.handoff_path),
        ("final receipt", &config.final_receipt_path),
    ] {
        if !path.is_absolute() {
            return Err(format!("updater canary {name} path must be absolute"));
        }
    }
    if config
        .candidate_path
        .extension()
        .and_then(|value| value.to_str())
        .map_or(true, |value| !value.eq_ignore_ascii_case("msi"))
    {
        return Err("updater canary candidate must be an MSI package".to_string());
    }
    if config.candidate_signature.trim().is_empty() {
        return Err("updater canary candidate signature is empty".to_string());
    }
    if config.candidate_sha256.len() != 64
        || !config
            .candidate_sha256
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(
            "updater canary candidate SHA-256 must contain 64 hexadecimal characters".to_string(),
        );
    }
    let metadata = fs::metadata(&config.candidate_path).map_err(|error| {
        format!(
            "read updater canary candidate metadata {}: {error}",
            config.candidate_path.display()
        )
    })?;
    if metadata.len() != config.candidate_bytes {
        return Err(format!(
            "updater canary candidate byte count mismatch: expected {}, found {}",
            config.candidate_bytes,
            metadata.len()
        ));
    }
    let actual_sha256 = sha256_file(&config.candidate_path)?;
    if actual_sha256 != config.candidate_sha256.to_ascii_lowercase() {
        return Err("updater canary candidate SHA-256 mismatch".to_string());
    }
    Ok(())
}

fn write_failure(config: &CanaryConfig, error: &str) {
    let _ = write_json(
        &config.final_receipt_path,
        &json!({
            "schemaVersion": CANARY_SCHEMA_VERSION,
            "status": "failed",
            "generatedAt": Utc::now().to_rfc3339(),
            "nonce": config.nonce,
            "releaseTag": config.release_tag,
            "sourceSha": config.source_sha,
            "expectedVersion": config.expected_version,
            "githubRunId": config.github_run_id,
            "githubRunAttempt": config.github_run_attempt,
            "runnerName": config.runner_name,
            "mode": config.mode,
            "error": error,
        }),
    );
}

fn finish_relaunch(config: &CanaryConfig, handoff: CanaryHandoff) -> Result<(), String> {
    if handoff.schema_version != CANARY_SCHEMA_VERSION
        || handoff.status != "installer-dispatch-started"
        || handoff.nonce != config.nonce
        || handoff.release_tag != config.release_tag
        || handoff.source_sha != config.source_sha
        || handoff.expected_version != config.expected_version
        || handoff.github_run_id != config.github_run_id
        || handoff.github_run_attempt != config.github_run_attempt
        || handoff.runner_name != config.runner_name
        || handoff.mode != config.mode
        || handoff.candidate_sha256 != config.candidate_sha256
        || handoff.candidate_bytes != config.candidate_bytes
    {
        return Err("updater canary handoff identity mismatch".to_string());
    }
    if !handoff.signature_verified_by_tauri_updater
        || !handoff.installer_launch_requested
        || handoff.downloaded_bytes != config.candidate_bytes
        || handoff.metadata_requests == 0
        || handoff.candidate_requests == 0
    {
        return Err("updater canary handoff is missing download or signature proof".to_string());
    }
    let installed_version = env!("CARGO_PKG_VERSION");
    if installed_version != config.expected_version {
        return Err(format!(
            "updater relaunch version mismatch: expected {}, found {installed_version}",
            config.expected_version
        ));
    }
    let executable = std::env::current_exe()
        .map_err(|error| format!("resolve updater relaunch executable: {error}"))?;
    let executable_sha256 = sha256_file(&executable)?;
    write_json(
        &config.final_receipt_path,
        &json!({
            "schemaVersion": CANARY_SCHEMA_VERSION,
            "status": "relaunch-verified",
            "generatedAt": Utc::now().to_rfc3339(),
            "nonce": config.nonce,
            "releaseTag": config.release_tag,
            "sourceSha": config.source_sha,
            "expectedVersion": config.expected_version,
            "githubRunId": config.github_run_id,
            "githubRunAttempt": config.github_run_attempt,
            "runnerName": config.runner_name,
            "mode": config.mode,
            "fromVersion": handoff.from_version,
            "installedVersion": installed_version,
            "candidate": {
                "sha256": config.candidate_sha256,
                "bytes": config.candidate_bytes,
            },
            "downloadedBytes": handoff.downloaded_bytes,
            "metadataRequests": handoff.metadata_requests,
            "candidateRequests": handoff.candidate_requests,
            "signatureVerifiedByTauriUpdater": true,
            "installerLaunchRequested": true,
            "updaterDrivenRelaunch": true,
            "installedExecutable": {
                "path": executable,
                "sha256": executable_sha256,
            },
        }),
    )
}

async fn metadata_handler(State(state): State<ServerState>) -> impl IntoResponse {
    state.metadata_requests.fetch_add(1, Ordering::SeqCst);
    Json((*state.metadata).clone())
}

async fn candidate_handler(State(state): State<ServerState>) -> Response<Body> {
    state.candidate_requests.fetch_add(1, Ordering::SeqCst);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_LENGTH, state.candidate.len().to_string())
        .body(Body::from(state.candidate.clone()))
        .expect("valid updater canary response")
}

async fn tls_config() -> Result<RustlsConfig, String> {
    let CertifiedKey { cert, key_pair } = generate_simple_self_signed(vec![
        "localhost".to_string(),
        Ipv4Addr::LOCALHOST.to_string(),
    ])
    .map_err(|error| format!("generate updater canary TLS certificate: {error}"))?;
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    }
    RustlsConfig::from_pem(
        cert.pem().into_bytes(),
        key_pair.serialize_pem().into_bytes(),
    )
    .await
    .map_err(|error| format!("configure updater canary TLS server: {error}"))
}

#[cfg(target_os = "windows")]
async fn execute_canary<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    config: CanaryConfig,
    from_version: String,
) -> Result<(), String> {
    let candidate = Bytes::from(fs::read(&config.candidate_path).map_err(|error| {
        format!(
            "read updater canary candidate {}: {error}",
            config.candidate_path.display()
        )
    })?);
    let listener = std::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))
        .map_err(|error| format!("bind updater canary HTTPS server: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("configure updater canary HTTPS server: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("read updater canary HTTPS port: {error}"))?
        .port();
    let metadata_requests = Arc::new(AtomicU64::new(0));
    let candidate_requests = Arc::new(AtomicU64::new(0));
    let downloaded_bytes = Arc::new(AtomicU64::new(0));
    let candidate_url = format!("https://127.0.0.1:{port}/candidate.msi");
    let metadata = json!({
        "version": config.expected_version,
        "notes": "Atelier Windows updater physical canary",
        "pub_date": Utc::now().to_rfc3339(),
        "platforms": {
            "windows-x86_64-msi": {
                "url": candidate_url,
                "signature": config.candidate_signature,
            }
        }
    });
    let state = ServerState {
        metadata: Arc::new(metadata),
        candidate,
        metadata_requests: Arc::clone(&metadata_requests),
        candidate_requests: Arc::clone(&candidate_requests),
    };
    let router = Router::new()
        .route("/metadata", get(metadata_handler))
        .route("/candidate.msi", get(candidate_handler))
        .with_state(state);
    let server_handle = axum_server::Handle::new();
    let server_task_handle = server_handle.clone();
    let server = tauri::async_runtime::spawn(async move {
        axum_server::from_tcp_rustls(listener, tls_config().await?)
            .handle(server_task_handle)
            .serve(router.into_make_service())
            .await
            .map_err(|error| format!("serve updater canary HTTPS endpoint: {error}"))
    });

    let endpoint = Url::parse(&format!("https://127.0.0.1:{port}/metadata"))
        .map_err(|error| format!("parse updater canary endpoint: {error}"))?;
    let expected_version = Version::parse(&config.expected_version)
        .map_err(|error| format!("parse expected updater version: {error}"))?;
    let handoff_config = config.clone();
    let handoff_metadata_requests = Arc::clone(&metadata_requests);
    let handoff_candidate_requests = Arc::clone(&candidate_requests);
    let handoff_downloaded_bytes = Arc::clone(&downloaded_bytes);
    let exit_app_handle = app_handle.clone();
    let exit_server_handle = server_handle.clone();
    let updater = app_handle
        .updater_builder()
        .target(WINDOWS_UPDATER_TARGET)
        .endpoints(vec![endpoint])
        .map_err(|error| format!("set updater canary endpoint: {error}"))?
        .no_proxy()
        .timeout(Duration::from_secs(120))
        .configure_client(|builder| builder.danger_accept_invalid_certs(true))
        .version_comparator(move |_current, release| release.version == expected_version)
        .on_before_exit(move || {
            let handoff = CanaryHandoff {
                schema_version: CANARY_SCHEMA_VERSION,
                status: "installer-dispatch-started".to_string(),
                generated_at: Utc::now().to_rfc3339(),
                nonce: handoff_config.nonce.clone(),
                release_tag: handoff_config.release_tag.clone(),
                source_sha: handoff_config.source_sha.clone(),
                expected_version: handoff_config.expected_version.clone(),
                from_version: from_version.clone(),
                github_run_id: handoff_config.github_run_id.clone(),
                github_run_attempt: handoff_config.github_run_attempt,
                runner_name: handoff_config.runner_name.clone(),
                mode: handoff_config.mode.clone(),
                candidate_sha256: handoff_config.candidate_sha256.clone(),
                candidate_bytes: handoff_config.candidate_bytes,
                downloaded_bytes: handoff_downloaded_bytes.load(Ordering::SeqCst),
                metadata_requests: handoff_metadata_requests.load(Ordering::SeqCst),
                candidate_requests: handoff_candidate_requests.load(Ordering::SeqCst),
                signature_verified_by_tauri_updater: true,
                installer_launch_requested: true,
            };
            if let Err(error) = write_json(&handoff_config.handoff_path, &handoff) {
                write_failure(&handoff_config, &error);
            }
            exit_server_handle.shutdown();
            exit_app_handle.cleanup_before_exit();
        })
        .build()
        .map_err(|error| format!("build updater canary client: {error}"))?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("check updater canary metadata: {error}"))?
        .ok_or_else(|| "updater canary metadata did not return the candidate".to_string())?;
    if update.version != config.expected_version
        || update.target != WINDOWS_UPDATER_TARGET
        || update.download_url.as_str() != candidate_url
        || update.signature != config.candidate_signature
    {
        return Err("updater canary response identity mismatch".to_string());
    }
    let chunk_counter = Arc::clone(&downloaded_bytes);
    update
        .download_and_install(
            move |chunk, _total| {
                chunk_counter.fetch_add(chunk as u64, Ordering::SeqCst);
            },
            || {},
        )
        .await
        .map_err(|error| format!("download or install updater canary candidate: {error}"))?;
    server_handle.shutdown();
    let _ = server.await;
    Err("Windows updater returned without exiting for installer handoff".to_string())
}

#[cfg(target_os = "windows")]
fn run_windows(config_path: &str) -> Result<(), String> {
    let config_path = PathBuf::from(config_path);
    let config = load_config(&config_path)?;
    validate_config(&config)?;
    if config.handoff_path.exists() {
        let bytes = fs::read(&config.handoff_path).map_err(|error| {
            format!(
                "read updater canary handoff {}: {error}",
                config.handoff_path.display()
            )
        })?;
        let handoff = serde_json::from_slice::<CanaryHandoff>(&bytes).map_err(|error| {
            format!(
                "parse updater canary handoff {}: {error}",
                config.handoff_path.display()
            )
        })?;
        return finish_relaunch(&config, handoff);
    }

    let current_version = Version::parse(env!("CARGO_PKG_VERSION"))
        .map_err(|error| format!("parse current Atelier version: {error}"))?;
    let expected_version = Version::parse(&config.expected_version)
        .map_err(|error| format!("parse expected Atelier version: {error}"))?;
    match config.mode.as_str() {
        "upgrade" if current_version >= expected_version => {
            return Err(format!(
                "upgrade canary requires an older installed version, found {current_version}"
            ));
        }
        "self-reinstall" if current_version != expected_version => {
            return Err(format!(
                "self-reinstall canary requires version {expected_version}, found {current_version}"
            ));
        }
        _ => {}
    }

    let task_config = config.clone();
    let from_version = current_version.to_string();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            for window in app.webview_windows().values() {
                let _ = window.hide();
            }
            let app_handle = app.handle().clone();
            let config = task_config.clone();
            let from_version = from_version.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    execute_canary(app_handle.clone(), config.clone(), from_version).await
                {
                    write_failure(&config, &error);
                    app_handle.cleanup_before_exit();
                    std::process::exit(1);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .map_err(|error| format!("build updater canary application: {error}"))?;
    app.run(|_, _| {});
    Ok(())
}

pub fn run(config_path: &str) -> Result<(), String> {
    if config_path.trim().is_empty() {
        return Err("updater canary config path is required".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        run_windows(config_path)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = config_path;
        Err("the updater canary is supported only on Windows".to_string())
    }
}
