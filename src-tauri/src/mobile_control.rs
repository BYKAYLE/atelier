use axum::extract::Query;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_server::tls_rustls::RustlsConfig;
use rcgen::{generate_simple_self_signed, CertifiedKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const SCHEMA_VERSION: u32 = 1;
const PAIRING_TTL_MS: u64 = 5 * 60 * 1_000;
const DEVICE_TTL_MS: u64 = 90 * 24 * 60 * 60 * 1_000;
const MAX_DEVICES: usize = 32;
const MAX_PAIRINGS: usize = 8;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceRecord {
    device_id: String,
    name: String,
    token_hash: String,
    scopes: Vec<String>,
    created_at_ms: u64,
    last_seen_at_ms: Option<u64>,
    expires_at_ms: u64,
    revoked_at_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceRegistry {
    schema_version: u32,
    devices: Vec<DeviceRecord>,
}

impl Default for DeviceRegistry {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            devices: Vec::new(),
        }
    }
}

#[derive(Clone, Debug)]
struct PendingPairing {
    pairing_id: String,
    code_hash: String,
    expires_at_ms: u64,
}

#[derive(Debug)]
struct ServerRuntime {
    runtime_id: Uuid,
    port: u16,
    allow_lan: bool,
    lan_ip: Option<IpAddr>,
    tls: bool,
    certificate_fingerprint: Option<String>,
    started_at_ms: u64,
    handle: axum_server::Handle,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TlsCertificateMetadata {
    schema_version: u32,
    sans: Vec<String>,
    fingerprint_sha256: String,
}

#[derive(Clone, Debug)]
struct TlsMaterial {
    certificate_pem: Vec<u8>,
    private_key_pem: Vec<u8>,
    fingerprint_sha256: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MobileServerStatus {
    running: bool,
    port: Option<u16>,
    allow_lan: bool,
    tls: bool,
    certificate_fingerprint: Option<String>,
    started_at_ms: Option<u64>,
    base_urls: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MobilePairing {
    pairing_id: String,
    code: String,
    expires_at_ms: u64,
    pairing_urls: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MobileDevice {
    device_id: String,
    name: String,
    scopes: Vec<String>,
    created_at_ms: u64,
    last_seen_at_ms: Option<u64>,
    expires_at_ms: u64,
    revoked_at_ms: Option<u64>,
}

impl From<&DeviceRecord> for MobileDevice {
    fn from(value: &DeviceRecord) -> Self {
        Self {
            device_id: value.device_id.clone(),
            name: value.name.clone(),
            scopes: value.scopes.clone(),
            created_at_ms: value.created_at_ms,
            last_seen_at_ms: value.last_seen_at_ms,
            expires_at_ms: value.expires_at_ms,
            revoked_at_ms: value.revoked_at_ms,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairRequest {
    pairing_id: String,
    code: String,
    device_name: String,
}

#[derive(Debug, Deserialize)]
struct FollowupRequest {
    prompt: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PairResponse {
    device: MobileDevice,
    token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorControlStatus {
    schema_version: u32,
    pending_requests: usize,
    claimed_requests: usize,
    receipts: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorSnapshot {
    app: &'static str,
    version: &'static str,
    server_time_ms: u64,
    control: MonitorControlStatus,
    agents: Vec<crate::agent_lifecycle::AgentLifecycleSnapshot>,
    capabilities: MonitorCapabilities,
    followups: Vec<crate::remote_followup::RemoteFollowupStatus>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorCapabilities {
    followup_proposal: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    service: &'static str,
    version: &'static str,
    status: &'static str,
}

#[derive(Debug, Deserialize)]
struct HomeQuery {
    pairing: Option<String>,
    code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    error: String,
}

struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            [(header::CACHE_CONTROL, "no-store")],
            Json(ErrorBody {
                error: self.message,
            }),
        )
            .into_response()
    }
}

fn server_runtime() -> &'static Mutex<Option<ServerRuntime>> {
    static RUNTIME: OnceLock<Mutex<Option<ServerRuntime>>> = OnceLock::new();
    RUNTIME.get_or_init(|| Mutex::new(None))
}

fn pairings() -> &'static Mutex<HashMap<String, PendingPairing>> {
    static PAIRINGS: OnceLock<Mutex<HashMap<String, PendingPairing>>> = OnceLock::new();
    PAIRINGS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn registry_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| {
        format!(
            "create mobile control directory {}: {error}",
            path.display()
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|error| {
            format!(
                "secure mobile control directory {}: {error}",
                path.display()
            )
        })?;
    }
    Ok(())
}

fn root_dir() -> Result<PathBuf, String> {
    let root = crate::control_plane::application_data_dir()?
        .join("mobile-control")
        .join(format!("v{SCHEMA_VERSION}"));
    private_dir(&root)?;
    Ok(root)
}

fn registry_path() -> Result<PathBuf, String> {
    Ok(root_dir()?.join("devices.json"))
}

fn read_registry_unlocked() -> Result<DeviceRegistry, String> {
    let path = registry_path()?;
    if !path.exists() {
        return Ok(DeviceRegistry::default());
    }
    let bytes = fs::read(&path)
        .map_err(|error| format!("read mobile device registry {}: {error}", path.display()))?;
    let registry: DeviceRegistry = serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse mobile device registry {}: {error}", path.display()))?;
    if registry.schema_version != SCHEMA_VERSION {
        return Err("Unsupported mobile device registry schema.".to_string());
    }
    Ok(registry)
}

fn write_registry_unlocked(registry: &DeviceRegistry) -> Result<(), String> {
    let path = registry_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "Mobile device registry has no parent directory.".to_string())?;
    private_dir(parent)?;
    let temporary = parent.join(format!(".devices.{}.tmp", Uuid::new_v4()));
    let bytes = serde_json::to_vec_pretty(registry)
        .map_err(|error| format!("serialize mobile device registry: {error}"))?;
    fs::write(&temporary, bytes).map_err(|error| {
        format!(
            "write mobile device registry {}: {error}",
            temporary.display()
        )
    })?;
    crate::chmod_600(&temporary);
    fs::rename(&temporary, &path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("publish mobile device registry {}: {error}", path.display())
    })?;
    crate::chmod_600(&path);
    Ok(())
}

fn with_registry<T>(f: impl FnOnce(&mut DeviceRegistry) -> Result<T, String>) -> Result<T, String> {
    let _guard = registry_lock()
        .lock()
        .map_err(|error| format!("mobile registry lock: {error}"))?;
    let mut registry = read_registry_unlocked()?;
    let result = f(&mut registry)?;
    write_registry_unlocked(&registry)?;
    Ok(result)
}

fn hash_secret(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.as_bytes()
        .iter()
        .zip(right.as_bytes())
        .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn random_token() -> String {
    format!(
        "{}{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    )
}

fn random_pair_code() -> String {
    let uuid = Uuid::new_v4();
    let bytes = uuid.as_bytes();
    let value = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) % 1_000_000;
    format!("{value:06}")
}

fn validate_device_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 64 || value.chars().any(char::is_control) {
        return Err("Device name must be between 1 and 64 visible characters.".to_string());
    }
    Ok(value.to_string())
}

fn local_lan_ip() -> Option<IpAddr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket.connect((Ipv4Addr::new(192, 0, 2, 1), 80)).ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

fn tls_paths() -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let root = root_dir()?;
    Ok((
        root.join("tls-certificate.pem"),
        root.join("tls-private-key.pem"),
        root.join("tls-metadata.json"),
    ))
}

fn certificate_sans(lan_ip: IpAddr) -> Vec<String> {
    vec![
        "localhost".to_string(),
        Ipv4Addr::LOCALHOST.to_string(),
        lan_ip.to_string(),
    ]
}

fn format_fingerprint(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(":")
}

fn create_tls_material(sans: &[String]) -> Result<TlsMaterial, String> {
    let CertifiedKey { cert, key_pair } = generate_simple_self_signed(sans.to_vec())
        .map_err(|error| format!("generate mobile TLS certificate: {error}"))?;
    Ok(TlsMaterial {
        fingerprint_sha256: format_fingerprint(cert.der().as_ref()),
        certificate_pem: cert.pem().into_bytes(),
        private_key_pem: key_pair.serialize_pem().into_bytes(),
    })
}

async fn rustls_config(material: &TlsMaterial) -> Result<RustlsConfig, std::io::Error> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    }
    RustlsConfig::from_pem(
        material.certificate_pem.clone(),
        material.private_key_pem.clone(),
    )
    .await
}

fn write_private_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::write(path, bytes)
        .map_err(|error| format!("write private mobile TLS file {}: {error}", path.display()))?;
    crate::chmod_600(path);
    Ok(())
}

fn create_and_store_tls_material(sans: &[String]) -> Result<TlsMaterial, String> {
    let material = create_tls_material(sans)?;
    let (certificate_path, private_key_path, metadata_path) = tls_paths()?;
    write_private_file(&certificate_path, &material.certificate_pem)?;
    write_private_file(&private_key_path, &material.private_key_pem)?;
    let metadata = TlsCertificateMetadata {
        schema_version: SCHEMA_VERSION,
        sans: sans.to_vec(),
        fingerprint_sha256: material.fingerprint_sha256.clone(),
    };
    let metadata = serde_json::to_vec_pretty(&metadata)
        .map_err(|error| format!("serialize mobile TLS metadata: {error}"))?;
    write_private_file(&metadata_path, &metadata)?;
    Ok(material)
}

fn load_or_create_tls_material(lan_ip: IpAddr) -> Result<TlsMaterial, String> {
    let sans = certificate_sans(lan_ip);
    let (certificate_path, private_key_path, metadata_path) = tls_paths()?;
    let existing = (|| {
        let metadata: TlsCertificateMetadata =
            serde_json::from_slice(&fs::read(&metadata_path).ok()?).ok()?;
        if metadata.schema_version != SCHEMA_VERSION || metadata.sans != sans {
            return None;
        }
        let certificate_pem = fs::read(&certificate_path).ok()?;
        let private_key_pem = fs::read(&private_key_path).ok()?;
        if !certificate_pem
            .windows("BEGIN CERTIFICATE".len())
            .any(|window| window == b"BEGIN CERTIFICATE")
            || !private_key_pem
                .windows("PRIVATE KEY".len())
                .any(|window| window == b"PRIVATE KEY")
        {
            return None;
        }
        Some(TlsMaterial {
            certificate_pem,
            private_key_pem,
            fingerprint_sha256: metadata.fingerprint_sha256,
        })
    })();
    existing.map_or_else(|| create_and_store_tls_material(&sans), Ok)
}

fn base_urls(port: u16, allow_lan: bool, tls: bool, lan_ip: Option<IpAddr>) -> Vec<String> {
    let scheme = if tls { "https" } else { "http" };
    let mut urls = vec![format!("{scheme}://127.0.0.1:{port}")];
    if allow_lan {
        if let Some(ip) = lan_ip {
            urls.push(format!("{scheme}://{ip}:{port}"));
        }
    }
    urls
}

fn current_status() -> MobileServerStatus {
    let Ok(runtime) = server_runtime().lock() else {
        return MobileServerStatus {
            running: false,
            port: None,
            allow_lan: false,
            tls: false,
            certificate_fingerprint: None,
            started_at_ms: None,
            base_urls: Vec::new(),
        };
    };
    if let Some(runtime) = runtime.as_ref() {
        MobileServerStatus {
            running: true,
            port: Some(runtime.port),
            allow_lan: runtime.allow_lan,
            tls: runtime.tls,
            certificate_fingerprint: runtime.certificate_fingerprint.clone(),
            started_at_ms: Some(runtime.started_at_ms),
            base_urls: base_urls(runtime.port, runtime.allow_lan, runtime.tls, runtime.lan_ip),
        }
    } else {
        MobileServerStatus {
            running: false,
            port: None,
            allow_lan: false,
            tls: false,
            certificate_fingerprint: None,
            started_at_ms: None,
            base_urls: Vec::new(),
        }
    }
}

fn add_security_headers(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    response
}

async fn home(Query(query): Query<HomeQuery>) -> Response {
    let pairing = query.pairing.unwrap_or_default();
    let code = query.code.unwrap_or_default();
    let bootstrap = serde_json::json!({ "pairing": pairing, "code": code }).to_string();
    let html = MOBILE_HTML.replace("__ATELIER_BOOTSTRAP__", &bootstrap);
    add_security_headers(Html(html).into_response())
}

async fn health() -> Response {
    add_security_headers(
        Json(HealthResponse {
            service: "atelier-mobile-control",
            version: env!("CARGO_PKG_VERSION"),
            status: "ok",
        })
        .into_response(),
    )
}

async fn pair(Json(request): Json<PairRequest>) -> Result<Response, ApiError> {
    let name = validate_device_name(&request.device_name)
        .map_err(|error| ApiError::new(StatusCode::BAD_REQUEST, error))?;
    let now = now_ms();
    let pairing = {
        let mut pending = pairings().lock().map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Pairing state is unavailable.",
            )
        })?;
        pending.retain(|_, item| item.expires_at_ms > now);
        let Some(item) = pending.remove(request.pairing_id.trim()) else {
            return Err(ApiError::new(
                StatusCode::UNAUTHORIZED,
                "Pairing code is invalid or expired.",
            ));
        };
        item
    };
    if pairing.expires_at_ms <= now
        || pairing.pairing_id != request.pairing_id.trim()
        || !constant_time_equal(&pairing.code_hash, &hash_secret(request.code.trim()))
    {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "Pairing code is invalid or expired.",
        ));
    }

    let token = random_token();
    let token_hash = hash_secret(&token);
    let record = with_registry(|registry| {
        let active = registry
            .devices
            .iter()
            .filter(|item| item.revoked_at_ms.is_none())
            .count();
        if active >= MAX_DEVICES {
            return Err(
                "The paired-device limit has been reached. Revoke a device first.".to_string(),
            );
        }
        let record = DeviceRecord {
            device_id: Uuid::new_v4().to_string(),
            name,
            token_hash,
            scopes: vec!["monitor:read".to_string()],
            created_at_ms: now,
            last_seen_at_ms: Some(now),
            expires_at_ms: now.saturating_add(DEVICE_TTL_MS),
            revoked_at_ms: None,
        };
        registry.devices.push(record.clone());
        Ok(record)
    })
    .map_err(|error| ApiError::new(StatusCode::CONFLICT, error))?;

    Ok(add_security_headers(
        Json(PairResponse {
            device: MobileDevice::from(&record),
            token,
        })
        .into_response(),
    ))
}

fn bearer_token(headers: &HeaderMap) -> Result<&str, ApiError> {
    let value = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| ApiError::new(StatusCode::UNAUTHORIZED, "Missing device token."))?;
    value
        .strip_prefix("Bearer ")
        .filter(|token| !token.is_empty() && token.len() <= 256)
        .ok_or_else(|| ApiError::new(StatusCode::UNAUTHORIZED, "Invalid device token."))
}

fn authenticate(headers: &HeaderMap) -> Result<MobileDevice, ApiError> {
    let token_hash = hash_secret(bearer_token(headers)?);
    let now = now_ms();
    with_registry(|registry| {
        let Some(record) = registry.devices.iter_mut().find(|record| {
            constant_time_equal(&record.token_hash, &token_hash)
                && record.revoked_at_ms.is_none()
                && record.expires_at_ms > now
        }) else {
            return Err("Device token is invalid, expired, or revoked.".to_string());
        };
        if record
            .last_seen_at_ms
            .map_or(true, |last_seen| now.saturating_sub(last_seen) >= 60_000)
        {
            record.last_seen_at_ms = Some(now);
        }
        Ok(MobileDevice::from(&*record))
    })
    .map_err(|error| ApiError::new(StatusCode::UNAUTHORIZED, error))
}

async fn monitor(headers: HeaderMap) -> Result<Response, ApiError> {
    let device = authenticate(&headers)?;
    if !device.scopes.iter().any(|scope| scope == "monitor:read") {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "This device cannot read monitoring data.",
        ));
    }
    let control = crate::control_plane::status()
        .map_err(|error| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let followup_proposal = device.scopes.iter().any(|scope| scope == "command:propose");
    Ok(add_security_headers(
        Json(MonitorSnapshot {
            app: "Atelier",
            version: env!("CARGO_PKG_VERSION"),
            server_time_ms: now_ms(),
            control: MonitorControlStatus {
                schema_version: control.schema_version,
                pending_requests: control.pending_requests,
                claimed_requests: control.claimed_requests,
                receipts: control.receipts,
            },
            agents: crate::agent_lifecycle::snapshot(30),
            capabilities: MonitorCapabilities { followup_proposal },
            followups: crate::remote_followup::device_statuses(&device.device_id, 20),
        })
        .into_response(),
    ))
}

async fn followup(
    headers: HeaderMap,
    Json(request): Json<FollowupRequest>,
) -> Result<Response, ApiError> {
    let device = authenticate(&headers)?;
    if !device.scopes.iter().any(|scope| scope == "command:propose") {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "This device cannot propose follow-up instructions.",
        ));
    }
    let proposal =
        crate::remote_followup::submit_proposal(&device.device_id, &device.name, &request.prompt)
            .map_err(|error| ApiError::new(StatusCode::BAD_REQUEST, error))?;
    Ok(add_security_headers(
        (StatusCode::CREATED, Json(proposal)).into_response(),
    ))
}

fn router() -> Router {
    Router::new()
        .route("/", get(home))
        .route("/health", get(health))
        .route("/api/v1/pair", post(pair))
        .route("/api/v1/monitor", get(monitor))
        .route("/api/v1/followups", post(followup))
}

#[tauri::command]
pub(crate) fn mobile_control_server_status() -> MobileServerStatus {
    current_status()
}

#[tauri::command]
pub(crate) async fn mobile_control_server_start(
    allow_lan: bool,
    port: Option<u16>,
) -> Result<MobileServerStatus, String> {
    if current_status().running {
        return Ok(current_status());
    }
    let bind_ip = if allow_lan {
        IpAddr::V4(Ipv4Addr::UNSPECIFIED)
    } else {
        IpAddr::V4(Ipv4Addr::LOCALHOST)
    };
    let lan_ip = if allow_lan {
        Some(local_lan_ip().ok_or_else(|| {
            "A private local-network address could not be detected. Connect to a trusted network and try again."
                .to_string()
        })?)
    } else {
        None
    };
    let listener = std::net::TcpListener::bind(SocketAddr::new(bind_ip, port.unwrap_or(0)))
        .map_err(|error| format!("start mobile control server: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("configure mobile control server: {error}"))?;
    let actual_port = listener
        .local_addr()
        .map_err(|error| format!("read mobile control server address: {error}"))?
        .port();
    let (tls_config, certificate_fingerprint) = if let Some(lan_ip) = lan_ip {
        let mut material = load_or_create_tls_material(lan_ip)?;
        let config = match rustls_config(&material).await {
            Ok(config) => config,
            Err(first_error) => {
                let sans = certificate_sans(lan_ip);
                material = create_and_store_tls_material(&sans)?;
                rustls_config(&material).await.map_err(|error| {
                    format!(
                        "load mobile TLS certificate after regeneration: {error} (initial error: {first_error})"
                    )
                })?
            }
        };
        (Some(config), Some(material.fingerprint_sha256))
    } else {
        (None, None)
    };
    let handle = axum_server::Handle::new();
    let runtime_id = Uuid::new_v4();
    {
        let mut runtime = server_runtime()
            .lock()
            .map_err(|error| format!("mobile server lock: {error}"))?;
        if runtime.is_some() {
            drop(runtime);
            handle.shutdown();
            return Ok(current_status());
        }
        *runtime = Some(ServerRuntime {
            runtime_id,
            port: actual_port,
            allow_lan,
            lan_ip,
            tls: tls_config.is_some(),
            certificate_fingerprint,
            started_at_ms: now_ms(),
            handle: handle.clone(),
        });
    }
    tauri::async_runtime::spawn(async move {
        let result = if let Some(config) = tls_config {
            axum_server::from_tcp_rustls(listener, config)
                .handle(handle)
                .serve(router().into_make_service())
                .await
        } else {
            axum_server::from_tcp(listener)
                .handle(handle)
                .serve(router().into_make_service())
                .await
        };
        if let Err(error) = result {
            log::warn!("Atelier mobile control server stopped: {error}");
        }
        if let Ok(mut runtime) = server_runtime().lock() {
            if runtime
                .as_ref()
                .is_some_and(|runtime| runtime.runtime_id == runtime_id)
            {
                *runtime = None;
            }
        }
    });
    Ok(current_status())
}

pub(crate) fn stop_server() {
    if let Ok(mut runtime) = server_runtime().lock() {
        if let Some(running) = runtime.take() {
            running
                .handle
                .graceful_shutdown(Some(Duration::from_secs(2)));
        }
    }
}

#[tauri::command]
pub(crate) fn mobile_control_server_stop() -> MobileServerStatus {
    stop_server();
    current_status()
}

#[tauri::command]
pub(crate) fn mobile_control_pairing_create() -> Result<MobilePairing, String> {
    let status = current_status();
    if !status.running {
        return Err("Start the mobile control server before creating a pairing code.".to_string());
    }
    let now = now_ms();
    let pairing_id = Uuid::new_v4().to_string();
    let code = random_pair_code();
    let pairing = PendingPairing {
        pairing_id: pairing_id.clone(),
        code_hash: hash_secret(&code),
        expires_at_ms: now.saturating_add(PAIRING_TTL_MS),
    };
    {
        let mut pending = pairings()
            .lock()
            .map_err(|error| format!("mobile pairing lock: {error}"))?;
        pending.retain(|_, item| item.expires_at_ms > now);
        if pending.len() >= MAX_PAIRINGS {
            return Err(
                "Too many pairing codes are active. Wait for one to expire or cancel it."
                    .to_string(),
            );
        }
        pending.insert(pairing_id.clone(), pairing.clone());
    }
    let pairing_urls = status
        .base_urls
        .iter()
        .map(|url| format!("{url}/?pairing={pairing_id}&code={code}"))
        .collect();
    Ok(MobilePairing {
        pairing_id,
        code,
        expires_at_ms: pairing.expires_at_ms,
        pairing_urls,
    })
}

#[tauri::command]
pub(crate) fn mobile_control_pairing_discard(pairing_id: String) -> Result<(), String> {
    let mut pending = pairings()
        .lock()
        .map_err(|error| format!("mobile pairing lock: {error}"))?;
    pending.remove(pairing_id.trim());
    Ok(())
}

#[tauri::command]
pub(crate) fn mobile_control_devices() -> Result<Vec<MobileDevice>, String> {
    let _guard = registry_lock()
        .lock()
        .map_err(|error| format!("mobile registry lock: {error}"))?;
    let registry = read_registry_unlocked()?;
    let mut devices = registry
        .devices
        .iter()
        .map(MobileDevice::from)
        .collect::<Vec<_>>();
    devices.sort_by(|left, right| right.created_at_ms.cmp(&left.created_at_ms));
    Ok(devices)
}

#[tauri::command]
pub(crate) fn mobile_control_device_revoke(device_id: String) -> Result<MobileDevice, String> {
    let device_id = device_id.trim();
    if Uuid::parse_str(device_id).is_err() {
        return Err("Invalid mobile device id.".to_string());
    }
    with_registry(|registry| {
        let record = registry
            .devices
            .iter_mut()
            .find(|record| record.device_id == device_id)
            .ok_or_else(|| "Mobile device was not found.".to_string())?;
        if record.revoked_at_ms.is_none() {
            record.revoked_at_ms = Some(now_ms());
        }
        Ok(MobileDevice::from(&*record))
    })
}

#[tauri::command]
pub(crate) fn mobile_control_device_followups_set(
    device_id: String,
    enabled: bool,
) -> Result<MobileDevice, String> {
    let device_id = device_id.trim();
    if Uuid::parse_str(device_id).is_err() {
        return Err("Invalid mobile device id.".to_string());
    }
    let now = now_ms();
    with_registry(|registry| {
        let record = registry
            .devices
            .iter_mut()
            .find(|record| record.device_id == device_id)
            .ok_or_else(|| "Mobile device was not found.".to_string())?;
        if record.revoked_at_ms.is_some() || record.expires_at_ms <= now {
            return Err("Only an active mobile device can change follow-up access.".to_string());
        }
        record.scopes.retain(|scope| scope != "command:propose");
        if enabled {
            record.scopes.push("command:propose".to_string());
        }
        Ok(MobileDevice::from(&*record))
    })
}

const MOBILE_HTML: &str = r##"<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'">
<title>Atelier Monitor</title><style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#171715;color:#f4f1ea}body{margin:0;padding:24px}.shell{max-width:720px;margin:auto}.brand{font-size:24px;font-weight:700;margin:8px 0 24px}.panel{border:1px solid #3b3a36;background:#22221f;border-radius:8px;padding:18px;margin:12px 0}.muted{color:#aaa79f;font-size:14px;line-height:1.5}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.metric{flex:1;min-width:120px}.metric strong{display:block;font-size:24px;margin-top:6px}input,textarea,button{font:inherit;border-radius:6px;border:1px solid #4a4944;background:#2b2a27;color:#f4f1ea;padding:12px;box-sizing:border-box}input{flex:1;min-width:180px}textarea{width:100%;min-height:108px;resize:vertical;margin:8px 0}button{background:#c96342;border-color:#da7653;font-weight:650;cursor:pointer}button:disabled{opacity:.5}.agent,.followup{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #3b3a36;padding:12px 0}.error{color:#ff9f91}.ok{color:#63d29e}.hidden{display:none}code{word-break:break-all}</style></head>
<body><main class="shell"><div class="brand">Atelier <span class="muted">Mobile Monitor</span></div>
<section id="pair-panel" class="panel"><h2>기기 연결</h2><p class="muted">데스크톱 Atelier에 표시된 6자리 코드를 사용합니다. 최초 연결은 읽기 전용이며, 후속 지시는 데스크톱에서 별도로 허용해야 합니다.</p><div class="row"><input id="device-name" maxlength="64" value="Mobile browser" aria-label="기기 이름"><input id="pair-code" inputmode="numeric" maxlength="6" placeholder="000000" aria-label="페어링 코드"><button id="pair-button">연결</button></div><p id="pair-error" class="error"></p></section>
<section id="monitor-panel" class="hidden"><div class="panel row"><div class="metric"><span class="muted">대기</span><strong id="pending">0</strong></div><div class="metric"><span class="muted">실행</span><strong id="claimed">0</strong></div><div class="metric"><span class="muted">완료 영수증</span><strong id="receipts">0</strong></div></div><section class="panel"><h2>최근 작업</h2><div id="agents" class="muted">작업 상태를 불러오는 중입니다.</div></section><section id="followup-panel" class="panel hidden"><h2>후속 지시 제안</h2><p class="muted">이 내용은 바로 실행되지 않습니다. 데스크톱 Atelier에서 작업 폴더와 모델을 확인하고 명시적으로 승인해야 합니다.</p><textarea id="followup-prompt" maxlength="4000" placeholder="이어서 진행할 작업을 입력하세요" aria-label="후속 지시"></textarea><div class="row"><button id="followup-button">검토 요청</button><span id="followup-result" class="muted"></span></div><div id="followups" class="muted"></div></section><p id="monitor-error" class="error"></p></section>
</main><script>
const bootstrap=__ATELIER_BOOTSTRAP__;
const tokenKey="atelier.mobile.token.v1";
const pairPanel=document.getElementById("pair-panel");
const monitorPanel=document.getElementById("monitor-panel");
const followupPanel=document.getElementById("followup-panel");
const code=document.getElementById("pair-code");
if(bootstrap.code)code.value=bootstrap.code;
let token=localStorage.getItem(tokenKey)||"";
function showMonitor(){pairPanel.classList.add("hidden");monitorPanel.classList.remove("hidden")}
function resetPairing(){localStorage.removeItem(tokenKey);token="";monitorPanel.classList.add("hidden");pairPanel.classList.remove("hidden")}
async function pair(){const button=document.getElementById("pair-button");button.disabled=true;document.getElementById("pair-error").textContent="";try{const response=await fetch("/api/v1/pair",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pairingId:bootstrap.pairing,code:code.value,deviceName:document.getElementById("device-name").value})});const body=await response.json();if(!response.ok)throw new Error(body.error||"연결하지 못했습니다.");token=body.token;localStorage.setItem(tokenKey,token);showMonitor();await refresh()}catch(error){document.getElementById("pair-error").textContent=String(error.message||error)}finally{button.disabled=false}}
function renderAgents(items){const agents=document.getElementById("agents");agents.replaceChildren();if(!items.length){agents.textContent="최근 에이전트 작업이 없습니다.";return}for(const item of items){const row=document.createElement("div");row.className="agent";const left=document.createElement("span");left.textContent=`${item.provider} · ${item.phase}`;const right=document.createElement("span");right.className="muted";right.textContent=new Date(item.updatedAtMs).toLocaleTimeString();row.append(left,right);agents.append(row)}}
function renderFollowups(items){const target=document.getElementById("followups");target.replaceChildren();if(!items.length){target.textContent="제안한 후속 지시가 없습니다.";return}for(const item of items){const row=document.createElement("div");row.className="followup";const left=document.createElement("span");left.textContent=new Date(item.createdAtMs).toLocaleString();const right=document.createElement("span");right.textContent=item.status;right.className=item.status==="approved"?"ok":"muted";row.append(left,right);target.append(row)}}
async function submitFollowup(){const button=document.getElementById("followup-button");const result=document.getElementById("followup-result");const prompt=document.getElementById("followup-prompt").value.trim();if(!prompt){result.textContent="지시 내용을 입력하세요.";return}button.disabled=true;result.textContent="전송 중...";try{const response=await fetch("/api/v1/followups",{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({prompt})});const body=await response.json();if(!response.ok)throw new Error(body.error||"후속 지시를 제안하지 못했습니다.");document.getElementById("followup-prompt").value="";result.textContent="데스크톱 검토 대기 중";await refresh()}catch(error){result.textContent=String(error.message||error)}finally{button.disabled=false}}
async function refresh(){if(!token)return;try{const response=await fetch("/api/v1/monitor",{headers:{authorization:`Bearer ${token}`}});const body=await response.json();if(!response.ok)throw new Error(body.error||"상태를 읽지 못했습니다.");document.getElementById("pending").textContent=body.control.pendingRequests;document.getElementById("claimed").textContent=body.control.claimedRequests;document.getElementById("receipts").textContent=body.control.receipts;renderAgents(body.agents||[]);const canFollowup=Boolean(body.capabilities&&body.capabilities.followupProposal);followupPanel.classList.toggle("hidden",!canFollowup);if(canFollowup)renderFollowups(body.followups||[]);document.getElementById("monitor-error").textContent=""}catch(error){const message=String(error.message||error);document.getElementById("monitor-error").textContent=message;if(message.includes("token")||message.includes("revoked"))resetPairing()}}
document.getElementById("pair-button").addEventListener("click",pair);
document.getElementById("followup-button").addEventListener("click",submitFollowup);
if(token){showMonitor();refresh()}
setInterval(refresh,3000);
</script></body></html>"##;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_names_are_bounded_and_visible() {
        assert_eq!(validate_device_name("  My phone  ").unwrap(), "My phone");
        assert!(validate_device_name("").is_err());
        assert!(validate_device_name("line\nbreak").is_err());
        assert!(validate_device_name(&"x".repeat(65)).is_err());
    }

    #[test]
    fn secret_hash_comparison_is_exact() {
        let hash = hash_secret("123456");
        assert!(constant_time_equal(&hash, &hash_secret("123456")));
        assert!(!constant_time_equal(&hash, &hash_secret("123457")));
    }

    #[test]
    fn pairing_codes_are_six_digits() {
        for _ in 0..20 {
            let code = random_pair_code();
            assert_eq!(code.len(), 6);
            assert!(code.chars().all(|character| character.is_ascii_digit()));
        }
    }

    #[test]
    fn loopback_is_the_default_surface() {
        let urls = base_urls(44000, false, false, None);
        assert_eq!(urls, vec!["http://127.0.0.1:44000"]);
    }

    #[test]
    fn lan_surface_is_https_only() {
        let lan_ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 22));
        let urls = base_urls(44000, true, true, Some(lan_ip));
        assert_eq!(
            urls,
            vec!["https://127.0.0.1:44000", "https://192.168.1.22:44000"]
        );
        assert!(urls.iter().all(|url| url.starts_with("https://")));
    }

    #[test]
    fn generated_tls_material_has_stable_fingerprint_shape() {
        let sans = certificate_sans(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 22)));
        let material = create_tls_material(&sans).unwrap();
        assert!(material
            .certificate_pem
            .starts_with(b"-----BEGIN CERTIFICATE-----"));
        assert!(material
            .private_key_pem
            .starts_with(b"-----BEGIN PRIVATE KEY-----"));
        assert_eq!(material.fingerprint_sha256.split(':').count(), 32);
    }

    #[tokio::test]
    async fn tls_server_serves_health_over_https() {
        let material =
            create_tls_material(&["localhost".to_string(), Ipv4Addr::LOCALHOST.to_string()])
                .unwrap();
        let config = rustls_config(&material).await.unwrap();
        let listener = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = axum_server::Handle::new();
        let task_handle = handle.clone();
        let server = tokio::spawn(async move {
            axum_server::from_tcp_rustls(listener, config)
                .handle(task_handle)
                .serve(router().into_make_service())
                .await
        });
        let client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap();
        let response = client
            .get(format!("https://127.0.0.1:{port}/health"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::OK);
        let body = response.text().await.unwrap();
        assert!(body.contains("atelier-mobile-control"));
        handle.graceful_shutdown(Some(Duration::from_secs(1)));
        server.await.unwrap().unwrap();
    }

    #[test]
    fn mobile_html_has_a_strict_local_policy() {
        assert!(MOBILE_HTML.contains("default-src 'none'"));
        assert!(MOBILE_HTML.contains("connect-src 'self'"));
        assert!(!MOBILE_HTML.contains("http://") && !MOBILE_HTML.contains("https://"));
    }
}
