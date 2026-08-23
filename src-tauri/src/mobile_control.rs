use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_server::tls_rustls::RustlsConfig;
use rcgen::{
    CertificateParams, DistinguishedName, DnType, ExtendedKeyUsagePurpose, KeyPair, KeyUsagePurpose,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, VecDeque};
#[cfg(unix)]
use std::ffi::OsString;
use std::fs;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const SCHEMA_VERSION: u32 = 1;
const PAIRING_TTL_MS: u64 = 5 * 60 * 1_000;
const DEVICE_TTL_MS: u64 = 90 * 24 * 60 * 60 * 1_000;
const MAX_DEVICES: usize = 32;
const MAX_PAIRINGS: usize = 8;
const MAX_PAIRING_ATTEMPTS: u8 = 5;
const TLS_CERTIFICATE_PROFILE_VERSION: u32 = 2;
const TLS_CERTIFICATE_CLOCK_SKEW_SECS: u64 = 5 * 60;
const TLS_CERTIFICATE_VALIDITY_SECS: u64 = 365 * 24 * 60 * 60;
const TLS_CERTIFICATE_RENEW_BEFORE_SECS: i64 = 7 * 24 * 60 * 60;
const MOBILE_CSP: &str = "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const TAILSCALE_SERVE_PORT: u16 = 8443;
const TAILSCALE_SERVE_PATH: &str = "/atelier";
const SESSION_FOLLOWUP_RATE_LIMIT: usize = 10;
const SESSION_FOLLOWUP_RATE_WINDOW_MS: u64 = 60_000;
const MAX_SESSION_FOLLOWUP_RECEIPTS: usize = 256;

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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerPreference {
    schema_version: u32,
    restore_tailscale: bool,
}

impl Default for ServerPreference {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            restore_tailscale: false,
        }
    }
}

#[derive(Clone, Debug)]
struct PendingPairing {
    pairing_id: String,
    code_hash: String,
    expires_at_ms: u64,
    attempts_remaining: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum MobileAccessMode {
    Local,
    Lan,
    Tailscale,
}

#[derive(Clone, Debug)]
struct RequestPolicy {
    allowed_authority: String,
    allowed_origin: String,
}

impl RequestPolicy {
    fn new(allowed_authority: impl Into<String>, tls: bool) -> Self {
        let allowed_authority = allowed_authority.into();
        let scheme = if tls { "https" } else { "http" };
        Self {
            allowed_origin: format!("{scheme}://{allowed_authority}"),
            allowed_authority,
        }
    }
}

struct TailscaleServeRuntime {
    cli_path: PathBuf,
    hostname: String,
    proxy_target: String,
    child: Child,
    #[cfg(target_os = "windows")]
    _job: std::os::windows::io::OwnedHandle,
}

struct ServerRuntime {
    runtime_id: Uuid,
    port: u16,
    access_mode: MobileAccessMode,
    allow_lan: bool,
    lan_ip: Option<IpAddr>,
    tls: bool,
    certificate_fingerprint: Option<String>,
    started_at_ms: u64,
    handle: axum_server::Handle,
    tailscale_serve: Option<TailscaleServeRuntime>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TlsCertificateMetadata {
    schema_version: u32,
    #[serde(default)]
    profile_version: u32,
    sans: Vec<String>,
    fingerprint_sha256: String,
    #[serde(default)]
    not_before_unix_secs: i64,
    #[serde(default)]
    not_after_unix_secs: i64,
}

#[derive(Clone, Debug)]
struct TlsMaterial {
    certificate_pem: Vec<u8>,
    private_key_pem: Vec<u8>,
    fingerprint_sha256: String,
    not_before_unix_secs: i64,
    not_after_unix_secs: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MobileServerStatus {
    running: bool,
    port: Option<u16>,
    connection_mode: MobileAccessMode,
    allow_lan: bool,
    tls: bool,
    certificate_fingerprint: Option<String>,
    started_at_ms: Option<u64>,
    base_urls: Vec<String>,
    tailscale: Option<MobileTailscaleStatus>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MobileTailscaleStatus {
    installed: bool,
    running: bool,
    serve_enabled: bool,
    active: bool,
    dns_name: Option<String>,
    tailscale_ips: Vec<String>,
    serve_url: Option<String>,
    activation_url: Option<String>,
    blocked_reason: Option<String>,
    https_port: u16,
    path: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MobileNetworkCandidate {
    interface_name: String,
    address: String,
    recommended: bool,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionFollowupRequest {
    mobile_task_id: String,
    prompt: String,
    client_request_id: String,
    revision: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionFollowupResponse {
    request_id: String,
    mobile_task_id: String,
    status: &'static str,
    created_at_ms: u64,
    replayed: bool,
}

#[derive(Clone, Debug)]
struct SessionFollowupReceipt {
    response: SessionFollowupResponse,
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
    sessions: Vec<crate::mobile_continuity::MobileSessionProjection>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorCapabilities {
    followup_proposal: bool,
    task_followup: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    service: &'static str,
    version: &'static str,
    status: &'static str,
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
        add_security_headers(
            (
                self.status,
                [(header::CACHE_CONTROL, "no-store")],
                Json(ErrorBody {
                    error: self.message,
                }),
            )
                .into_response(),
        )
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

fn session_followup_receipts() -> &'static Mutex<HashMap<String, SessionFollowupReceipt>> {
    static RECEIPTS: OnceLock<Mutex<HashMap<String, SessionFollowupReceipt>>> = OnceLock::new();
    RECEIPTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn session_followup_rate_limits() -> &'static Mutex<HashMap<String, VecDeque<u64>>> {
    static RATE_LIMITS: OnceLock<Mutex<HashMap<String, VecDeque<u64>>>> = OnceLock::new();
    RATE_LIMITS.get_or_init(|| Mutex::new(HashMap::new()))
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

fn server_preference_path() -> Result<PathBuf, String> {
    Ok(root_dir()?.join("server-preference.json"))
}

fn read_server_preference_unlocked() -> Result<ServerPreference, String> {
    let path = server_preference_path()?;
    if !path.exists() {
        return Ok(ServerPreference::default());
    }
    let bytes = fs::read(&path)
        .map_err(|error| format!("read mobile server preference {}: {error}", path.display()))?;
    let preference: ServerPreference = serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse mobile server preference {}: {error}", path.display()))?;
    if preference.schema_version != SCHEMA_VERSION {
        return Err("Unsupported mobile server preference schema.".to_string());
    }
    Ok(preference)
}

fn write_server_preference_unlocked(preference: &ServerPreference) -> Result<(), String> {
    let path = server_preference_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "Mobile server preference has no parent directory.".to_string())?;
    private_dir(parent)?;
    let temporary = parent.join(format!(".server-preference.{}.tmp", Uuid::new_v4()));
    let bytes = serde_json::to_vec_pretty(preference)
        .map_err(|error| format!("serialize mobile server preference: {error}"))?;
    fs::write(&temporary, bytes).map_err(|error| {
        format!(
            "write mobile server preference {}: {error}",
            temporary.display()
        )
    })?;
    crate::chmod_600(&temporary);
    fs::rename(&temporary, &path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!(
            "publish mobile server preference {}: {error}",
            path.display()
        )
    })?;
    crate::chmod_600(&path);
    Ok(())
}

fn set_tailscale_restore_enabled(enabled: bool) -> Result<(), String> {
    let _guard = registry_lock()
        .lock()
        .map_err(|error| format!("mobile preference lock: {error}"))?;
    write_server_preference_unlocked(&ServerPreference {
        schema_version: SCHEMA_VERSION,
        restore_tailscale: enabled,
    })
}

fn tailscale_restore_enabled() -> Result<bool, String> {
    let _guard = registry_lock()
        .lock()
        .map_err(|error| format!("mobile preference lock: {error}"))?;
    Ok(read_server_preference_unlocked()?.restore_tailscale)
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

fn consume_pairing_attempt(
    pending: &mut HashMap<String, PendingPairing>,
    pairing_id: &str,
    code: &str,
    now: u64,
) -> bool {
    pending.retain(|_, item| item.expires_at_ms > now && item.attempts_remaining > 0);
    let code_hash = hash_secret(code);
    let Some(pairing) = pending.get_mut(pairing_id) else {
        return false;
    };
    let accepted = pairing.expires_at_ms > now
        && pairing.pairing_id == pairing_id
        && constant_time_equal(&pairing.code_hash, &code_hash);
    if accepted {
        pending.remove(pairing_id);
        return true;
    }

    pairing.attempts_remaining = pairing.attempts_remaining.saturating_sub(1);
    if pairing.attempts_remaining == 0 {
        pending.remove(pairing_id);
    }
    false
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

fn validated_private_lan_ip(ip: IpAddr) -> Option<IpAddr> {
    match ip {
        IpAddr::V4(ip) if ip.is_private() => Some(IpAddr::V4(ip)),
        _ => None,
    }
}

fn parse_access_mode(
    access_mode: Option<&str>,
    allow_lan: Option<bool>,
) -> Result<MobileAccessMode, String> {
    match access_mode.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) if value.eq_ignore_ascii_case("local") => Ok(MobileAccessMode::Local),
        Some(value) if value.eq_ignore_ascii_case("lan") => Ok(MobileAccessMode::Lan),
        Some(value) if value.eq_ignore_ascii_case("tailscale") => Ok(MobileAccessMode::Tailscale),
        Some(_) => Err("Unsupported mobile access mode.".to_string()),
        None => Ok(if allow_lan.unwrap_or(false) {
            MobileAccessMode::Lan
        } else {
            MobileAccessMode::Local
        }),
    }
}

fn default_route_lan_ip() -> Option<IpAddr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket.connect((Ipv4Addr::new(192, 0, 2, 1), 80)).ok()?;
    let ip = socket.local_addr().ok()?.ip();
    validated_private_lan_ip(ip)
}

fn build_network_candidates(
    interfaces: impl IntoIterator<Item = (String, IpAddr)>,
    recommended_ip: Option<IpAddr>,
) -> Vec<MobileNetworkCandidate> {
    let recommended_ip =
        recommended_ip
            .and_then(validated_private_lan_ip)
            .and_then(|ip| match ip {
                IpAddr::V4(ip) => Some(ip),
                IpAddr::V6(_) => None,
            });
    let mut interface_by_address = BTreeMap::<Ipv4Addr, String>::new();
    for (interface_name, ip) in interfaces {
        let Some(IpAddr::V4(address)) = validated_private_lan_ip(ip) else {
            continue;
        };
        if let Some(existing_name) = interface_by_address.get_mut(&address) {
            if interface_name < *existing_name {
                *existing_name = interface_name;
            }
        } else {
            interface_by_address.insert(address, interface_name);
        }
    }

    let mut candidates = interface_by_address
        .into_iter()
        .map(|(address, interface_name)| MobileNetworkCandidate {
            interface_name,
            address: address.to_string(),
            recommended: recommended_ip == Some(address),
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|candidate| !candidate.recommended);
    candidates
}

fn current_network_candidates() -> Result<Vec<MobileNetworkCandidate>, String> {
    let interfaces = if_addrs::get_if_addrs()
        .map_err(|error| format!("enumerate mobile network interfaces: {error}"))?;
    let addresses = interfaces.into_iter().filter_map(|interface| {
        if !interface.is_oper_up() {
            return None;
        }
        let ip = interface.ip();
        Some((interface.name, ip))
    });
    Ok(build_network_candidates(addresses, default_route_lan_ip()))
}

fn candidate_ip(candidate: &MobileNetworkCandidate) -> Option<IpAddr> {
    candidate
        .address
        .parse::<IpAddr>()
        .ok()
        .and_then(validated_private_lan_ip)
}

fn bind_ip_for_mode(
    access_mode: MobileAccessMode,
    requested_lan_ip: Option<&str>,
    candidates: &[MobileNetworkCandidate],
) -> Result<IpAddr, String> {
    if access_mode != MobileAccessMode::Lan {
        return Ok(IpAddr::V4(Ipv4Addr::LOCALHOST));
    }
    let requested_lan_ip = requested_lan_ip
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(requested_lan_ip) = requested_lan_ip {
        let requested_lan_ip = requested_lan_ip
            .parse::<IpAddr>()
            .ok()
            .and_then(validated_private_lan_ip)
            .ok_or_else(|| {
                "The selected LAN address must be an RFC1918 IPv4 address.".to_string()
            })?;
        return candidates
            .iter()
            .filter_map(candidate_ip)
            .find(|candidate| *candidate == requested_lan_ip)
            .ok_or_else(|| {
                "The selected LAN address is no longer available. Refresh network interfaces and try again."
                    .to_string()
            });
    }

    candidates
        .iter()
        .find(|candidate| candidate.recommended)
        .or_else(|| candidates.first())
        .and_then(candidate_ip)
        .ok_or_else(|| {
            "No active RFC1918 IPv4 network interface is available for LAN access.".to_string()
        })
}

fn tailscale_cli_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            candidates.push(dir.join("tailscale"));
            #[cfg(windows)]
            {
                candidates.push(dir.join("tailscale.exe"));
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from(
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
        ));
    }
    #[cfg(target_os = "windows")]
    {
        candidates.push(PathBuf::from(r"C:\Program Files\Tailscale\tailscale.exe"));
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        candidates.push(PathBuf::from("/usr/bin/tailscale"));
        candidates.push(PathBuf::from("/usr/local/bin/tailscale"));
    }
    candidates
}

fn resolve_tailscale_cli() -> Option<PathBuf> {
    tailscale_cli_candidates()
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn trim_tailscale_dns_name(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_end_matches('.');
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn tailscale_serve_host(hostname: &str) -> String {
    format!("{hostname}:{TAILSCALE_SERVE_PORT}")
}

fn tailscale_serve_url(hostname: &str) -> String {
    format!(
        "https://{}{}/",
        tailscale_serve_host(hostname),
        TAILSCALE_SERVE_PATH
    )
}

fn tailscale_activation_url(node_id: &str) -> Option<String> {
    let node_id = node_id.trim();
    (!node_id.is_empty()
        && node_id.len() <= 256
        && node_id.chars().all(|ch| ch.is_ascii_alphanumeric()))
    .then(|| format!("https://login.tailscale.com/f/serve?node={node_id}"))
}

#[derive(Default, Deserialize)]
struct TailscaleServeStatusJson {
    #[serde(rename = "AllowFunnel", default)]
    allow_funnel: HashMap<String, bool>,
    #[serde(rename = "Foreground", default)]
    foreground: HashMap<String, TailscaleServeInstance>,
    #[serde(rename = "Background", default)]
    background: HashMap<String, TailscaleServeInstance>,
}

#[derive(Default, Deserialize)]
struct TailscaleServeInstance {
    #[serde(rename = "AllowFunnel", default)]
    allow_funnel: HashMap<String, bool>,
    #[serde(rename = "Web", default)]
    web: HashMap<String, TailscaleServeWeb>,
}

#[derive(Default, Deserialize)]
struct TailscaleServeWeb {
    #[serde(rename = "Handlers", default)]
    handlers: HashMap<String, TailscaleServeHandler>,
}

#[derive(Clone, Default, Deserialize)]
struct TailscaleServeHandler {
    #[serde(rename = "Proxy")]
    proxy: Option<String>,
}

impl TailscaleServeStatusJson {
    fn handler(&self, host: &str, path: &str) -> Option<&TailscaleServeHandler> {
        self.foreground
            .values()
            .chain(self.background.values())
            .find_map(|instance| instance.web.get(host))
            .and_then(|web| web.handlers.get(path))
    }

    fn has_public_funnel(&self) -> bool {
        self.allow_funnel.values().any(|enabled| *enabled)
            || self
                .foreground
                .values()
                .chain(self.background.values())
                .any(|instance| instance.allow_funnel.values().any(|enabled| *enabled))
    }
}

#[derive(Deserialize)]
struct TailscaleSelfStatusJson {
    #[serde(rename = "ID")]
    id: Option<String>,
    #[serde(rename = "DNSName")]
    dns_name: Option<String>,
    #[serde(rename = "Online")]
    online: Option<bool>,
    #[serde(rename = "TailscaleIPs", default)]
    tailscale_ips: Vec<String>,
}

#[derive(Deserialize)]
struct TailscaleStatusJson {
    #[serde(rename = "BackendState")]
    backend_state: Option<String>,
    #[serde(rename = "Self")]
    self_node: Option<TailscaleSelfStatusJson>,
    #[serde(rename = "CertDomains", default)]
    cert_domains: Vec<String>,
}

fn tailscale_https_enabled(dns_name: &str, cert_domains: &[String]) -> bool {
    cert_domains.iter().any(|domain| {
        trim_tailscale_dns_name(domain).is_some_and(|domain| domain.eq_ignore_ascii_case(dns_name))
    })
}

fn tailscale_serve_status_json(cli_path: &Path) -> Result<TailscaleServeStatusJson, String> {
    let output = Command::new(cli_path)
        .env("PATH", crate::augmented_cli_path())
        .args(["serve", "status", "--json"])
        .output()
        .map_err(|error| format!("Read Tailscale Serve configuration: {error}"))?;
    if !output.status.success() {
        return Err(tailscale_error_message(&output));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Tailscale Serve returned invalid JSON: {error}"))
}

fn tailscale_error_message(output: &std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    [stdout, stderr]
        .into_iter()
        .find(|value| !value.is_empty())
        .unwrap_or_else(|| "Tailscale command failed.".to_string())
}

#[cfg(unix)]
const TAILSCALE_SERVE_GUARD_SCRIPT: &str = r#"
exec 3<&0
"$@" </dev/null &
serve_pid=$!
(
  while IFS= read -r _ <&3; do :; done
  kill -TERM "$serve_pid" 2>/dev/null || true
) &
watch_pid=$!
exec 3<&-
cleanup() {
  kill -TERM "$watch_pid" 2>/dev/null || true
  kill -TERM "$serve_pid" 2>/dev/null || true
  wait "$watch_pid" 2>/dev/null || true
  wait "$serve_pid" 2>/dev/null || true
}
trap 'cleanup; exit 143' HUP INT TERM
wait "$serve_pid"
serve_status=$?
kill -TERM "$watch_pid" 2>/dev/null || true
wait "$watch_pid" 2>/dev/null || true
trap - HUP INT TERM
exit "$serve_status"
"#;

#[cfg(unix)]
fn unix_parent_bound_command(program: &Path, args: &[OsString]) -> Command {
    use std::os::unix::process::CommandExt;

    let mut command = Command::new("/bin/sh");
    command
        .arg("-c")
        .arg(TAILSCALE_SERVE_GUARD_SCRIPT)
        .arg("atelier-tailscale-serve-guard")
        .arg(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    unsafe {
        command.pre_exec(|| {
            if libc::setpgid(0, 0) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    command
}

fn tailscale_serve_command(cli_path: &Path, proxy_target: &str) -> Command {
    #[cfg(unix)]
    {
        let args = vec![
            OsString::from("serve"),
            OsString::from("--yes"),
            OsString::from(format!("--https={TAILSCALE_SERVE_PORT}")),
            OsString::from(format!("--set-path={TAILSCALE_SERVE_PATH}")),
            OsString::from(proxy_target),
        ];
        let mut command = unix_parent_bound_command(cli_path, &args);
        command.env("PATH", crate::augmented_cli_path());
        command
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut command = Command::new(cli_path);
        command
            .env("PATH", crate::augmented_cli_path())
            .arg("serve")
            .arg("--yes")
            .arg(format!("--https={TAILSCALE_SERVE_PORT}"))
            .arg(format!("--set-path={TAILSCALE_SERVE_PATH}"))
            .arg(proxy_target)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
        command
    }
}

#[cfg(target_os = "windows")]
fn attach_child_kill_job(child: &Child) -> Result<std::os::windows::io::OwnedHandle, String> {
    use std::mem::size_of;
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if job.is_null() {
        return Err(format!(
            "Create Tailscale process lifetime guard: {}",
            std::io::Error::last_os_error()
        ));
    }
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let configured = unsafe {
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            (&raw const limits).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if configured == 0 {
        let error = std::io::Error::last_os_error();
        unsafe {
            CloseHandle(job);
        }
        return Err(format!(
            "Configure Tailscale process lifetime guard: {error}"
        ));
    }
    let assigned = unsafe { AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE) };
    if assigned == 0 {
        let error = std::io::Error::last_os_error();
        unsafe {
            CloseHandle(job);
        }
        return Err(format!("Attach Tailscale process lifetime guard: {error}"));
    }
    Ok(unsafe { OwnedHandle::from_raw_handle(job) })
}

#[cfg(unix)]
fn stop_parent_bound_child(child: &mut Child) -> Result<(), String> {
    drop(child.stdin.take());
    let graceful_deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if child
            .try_wait()
            .map_err(|error| format!("Check Tailscale Serve process during stop: {error}"))?
            .is_some()
        {
            return Ok(());
        }
        if Instant::now() >= graceful_deadline {
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }
    let process_group = -(child.id() as libc::pid_t);
    unsafe {
        libc::kill(process_group, libc::SIGTERM);
    }
    let forced_deadline = Instant::now() + Duration::from_secs(2);
    loop {
        if child
            .try_wait()
            .map_err(|error| format!("Check Tailscale Serve guard after SIGTERM: {error}"))?
            .is_some()
        {
            return Ok(());
        }
        if Instant::now() >= forced_deadline {
            unsafe {
                libc::kill(process_group, libc::SIGKILL);
            }
            child
                .wait()
                .map_err(|error| format!("Reap Tailscale Serve guard: {error}"))?;
            return Err("Tailscale Serve required forced process-group cleanup.".to_string());
        }
        thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(target_os = "windows")]
fn stop_parent_bound_child(child: &mut Child) -> Result<(), String> {
    child
        .kill()
        .map_err(|error| format!("Stop Tailscale Serve process: {error}"))?;
    child
        .wait()
        .map_err(|error| format!("Reap Tailscale Serve process: {error}"))?;
    Ok(())
}

fn tailscale_status_snapshot(owned_mapping: Option<(&str, &str)>) -> MobileTailscaleStatus {
    let default_status = || MobileTailscaleStatus {
        installed: false,
        running: false,
        serve_enabled: false,
        active: false,
        dns_name: None,
        tailscale_ips: Vec::new(),
        serve_url: None,
        activation_url: None,
        blocked_reason: None,
        https_port: TAILSCALE_SERVE_PORT,
        path: TAILSCALE_SERVE_PATH.to_string(),
    };

    let Some(cli_path) = resolve_tailscale_cli() else {
        let mut status = default_status();
        status.blocked_reason =
            Some("Tailscale CLI is not installed on this computer.".to_string());
        return status;
    };

    let status_output = Command::new(&cli_path)
        .env("PATH", crate::augmented_cli_path())
        .args(["status", "--json"])
        .output();
    let Ok(status_output) = status_output else {
        let mut status = default_status();
        status.installed = true;
        status.blocked_reason = Some("Tailscale status could not be read.".to_string());
        return status;
    };
    if !status_output.status.success() {
        let mut status = default_status();
        status.installed = true;
        status.blocked_reason = Some(tailscale_error_message(&status_output));
        return status;
    }

    let parsed_status: Result<TailscaleStatusJson, _> =
        serde_json::from_slice(&status_output.stdout);
    let Ok(parsed_status) = parsed_status else {
        let mut status = default_status();
        status.installed = true;
        status.blocked_reason = Some("Tailscale status returned invalid JSON.".to_string());
        return status;
    };

    let running = parsed_status.backend_state.as_deref() == Some("Running")
        && parsed_status
            .self_node
            .as_ref()
            .and_then(|node| node.online)
            .unwrap_or(false);
    let node_id = parsed_status
        .self_node
        .as_ref()
        .and_then(|node| node.id.as_deref())
        .map(str::to_string);
    let self_dns_name = parsed_status
        .self_node
        .as_ref()
        .and_then(|node| node.dns_name.as_deref())
        .and_then(trim_tailscale_dns_name);
    let dns_name = self_dns_name.clone().or_else(|| {
        parsed_status
            .cert_domains
            .iter()
            .find_map(|domain| trim_tailscale_dns_name(domain))
    });
    let serve_enabled = dns_name
        .as_deref()
        .is_some_and(|dns_name| tailscale_https_enabled(dns_name, &parsed_status.cert_domains));
    let tailscale_ips = parsed_status
        .self_node
        .as_ref()
        .map(|node| node.tailscale_ips.clone())
        .unwrap_or_default();

    let mut status = default_status();
    status.installed = true;
    status.running = running;
    status.dns_name = dns_name.clone();
    status.tailscale_ips = tailscale_ips;
    status.serve_url = dns_name.as_deref().map(tailscale_serve_url);
    status.serve_enabled = serve_enabled;

    if !running {
        status.blocked_reason = Some(
            "Tailscale is not connected on this computer. Open Tailscale and reconnect this device."
                .to_string(),
        );
        return status;
    }

    if dns_name.is_none() {
        status.blocked_reason =
            Some("Tailscale HTTPS certificate domain is unavailable on this device.".to_string());
        return status;
    }

    if !serve_enabled {
        status.activation_url = node_id.as_deref().and_then(tailscale_activation_url);
        status.blocked_reason = Some(
            "Tailscale HTTPS is not enabled for this device. Open Serve activation once and then check again."
                .to_string(),
        );
        return status;
    }

    let serve_host = tailscale_serve_host(dns_name.as_deref().unwrap_or_default());
    match tailscale_serve_status_json(&cli_path) {
        Ok(serve_status) if serve_status.has_public_funnel() => {
            status.blocked_reason = Some(
                "Public Tailscale Funnel is enabled. Atelier refuses public exposure; disable Funnel before starting remote access."
                    .to_string(),
            );
        }
        Ok(serve_status) => {
            let handler = serve_status.handler(&serve_host, TAILSCALE_SERVE_PATH);
            let owned_handler_matches = owned_mapping.is_some_and(|(owned_hostname, target)| {
                owned_hostname.eq_ignore_ascii_case(dns_name.as_deref().unwrap_or_default())
                    && handler.and_then(|handler| handler.proxy.as_deref()) == Some(target)
            });
            match (handler, owned_mapping) {
                (None, None) => status.active = true,
                (Some(_), Some(_)) if owned_handler_matches => status.active = true,
                (None, Some(_)) => {
                    status.blocked_reason = Some(
                        "Atelier's active Tailscale Serve mapping is missing. Stop and restart remote access."
                            .to_string(),
                    );
                }
                (Some(handler), _) => {
                    let detail = handler
                        .proxy
                        .as_deref()
                        .map(|proxy| format!("existing proxy target {proxy}"))
                        .unwrap_or_else(|| "an existing non-proxy handler".to_string());
                    status.blocked_reason = Some(format!(
                        "Tailscale Serve already uses {} for {detail}. Stop that mapping before starting Atelier.",
                        tailscale_serve_url(dns_name.as_deref().unwrap_or_default())
                    ));
                }
            }
        }
        Err(error) => status.blocked_reason = Some(error),
    }
    status
}

fn start_tailscale_serve(local_port: u16, hostname: &str) -> Result<TailscaleServeRuntime, String> {
    let cli_path = resolve_tailscale_cli()
        .ok_or_else(|| "Tailscale CLI is not installed on this computer.".to_string())?;
    let proxy_target = format!("http://127.0.0.1:{local_port}");
    let serve_host = tailscale_serve_host(hostname);
    let existing_status = tailscale_serve_status_json(&cli_path)?;
    if existing_status.has_public_funnel() {
        return Err(
            "Public Tailscale Funnel is enabled. Atelier will not modify or publish a public endpoint."
                .to_string(),
        );
    }
    if let Some(existing_handler) = existing_status.handler(&serve_host, TAILSCALE_SERVE_PATH) {
        let detail = existing_handler
            .proxy
            .as_deref()
            .map(|proxy| format!("existing proxy target {proxy}"))
            .unwrap_or_else(|| "an existing non-proxy handler".to_string());
        return Err(format!(
            "Tailscale Serve already uses {} for {detail}. Stop that mapping first.",
            tailscale_serve_url(hostname)
        ));
    }
    let mut command = tailscale_serve_command(&cli_path, &proxy_target);
    let mut child = command
        .spawn()
        .map_err(|error| format!("Start Tailscale Serve: {error}"))?;
    #[cfg(target_os = "windows")]
    let job = match attach_child_kill_job(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if child
            .try_wait()
            .map_err(|error| format!("Check Tailscale Serve process: {error}"))?
            .is_some()
        {
            let output = child
                .wait_with_output()
                .map_err(|error| format!("Read Tailscale Serve error output: {error}"))?;
            let _ = remove_owned_tailscale_mapping(&cli_path, hostname, &proxy_target);
            return Err(tailscale_error_message(&output));
        }

        match tailscale_serve_status_json(&cli_path) {
            Ok(status) if status.has_public_funnel() => {
                let _ = stop_parent_bound_child(&mut child);
                let _ = remove_owned_tailscale_mapping(&cli_path, hostname, &proxy_target);
                return Err(
                    "Public Tailscale Funnel became enabled while Atelier was starting. Remote access was stopped."
                        .to_string(),
                );
            }
            Ok(status) => match status
                .handler(&serve_host, TAILSCALE_SERVE_PATH)
                .and_then(|handler| handler.proxy.as_deref())
            {
                Some(proxy) if proxy == proxy_target => break,
                Some(proxy) => {
                    let detail = proxy.to_string();
                    let _ = stop_parent_bound_child(&mut child);
                    let _ = remove_owned_tailscale_mapping(&cli_path, hostname, &proxy_target);
                    return Err(format!(
                        "Tailscale Serve mapping changed during startup (current target: {detail}). Atelier left it untouched."
                    ));
                }
                None => {}
            },
            Err(error) if Instant::now() >= deadline => {
                let _ = stop_parent_bound_child(&mut child);
                let _ = remove_owned_tailscale_mapping(&cli_path, hostname, &proxy_target);
                return Err(error);
            }
            Err(_) => {}
        }

        if Instant::now() >= deadline {
            let _ = stop_parent_bound_child(&mut child);
            let _ = remove_owned_tailscale_mapping(&cli_path, hostname, &proxy_target);
            return Err(format!(
                "Tailscale Serve did not publish the Atelier endpoint on {} within five seconds.",
                tailscale_serve_url(hostname)
            ));
        }
        thread::sleep(Duration::from_millis(100));
    }

    Ok(TailscaleServeRuntime {
        cli_path,
        hostname: hostname.to_string(),
        proxy_target,
        child,
        #[cfg(target_os = "windows")]
        _job: job,
    })
}

fn remove_owned_tailscale_mapping(
    cli_path: &Path,
    hostname: &str,
    proxy_target: &str,
) -> Result<(), String> {
    let serve_host = tailscale_serve_host(hostname);
    let before = tailscale_serve_status_json(cli_path)?;
    let existing_proxy = before
        .handler(&serve_host, TAILSCALE_SERVE_PATH)
        .and_then(|handler| handler.proxy.as_deref());
    match existing_proxy {
        None => return Ok(()),
        Some(existing) if existing != proxy_target => return Ok(()),
        Some(_) => {}
    }

    let output = Command::new(cli_path)
        .env("PATH", crate::augmented_cli_path())
        .arg("serve")
        .arg("--yes")
        .arg(format!("--https={TAILSCALE_SERVE_PORT}"))
        .arg(format!("--set-path={TAILSCALE_SERVE_PATH}"))
        .arg("off")
        .output()
        .map_err(|error| format!("Remove Atelier Tailscale Serve mapping: {error}"))?;
    if !output.status.success() {
        return Err(tailscale_error_message(&output));
    }

    let after = tailscale_serve_status_json(cli_path)?;
    if after
        .handler(&serve_host, TAILSCALE_SERVE_PATH)
        .and_then(|handler| handler.proxy.as_deref())
        == Some(proxy_target)
    {
        return Err(
            "Atelier's Tailscale Serve mapping remained active after the stop command.".to_string(),
        );
    }
    Ok(())
}

fn stop_tailscale_serve(runtime: &mut TailscaleServeRuntime) -> Result<(), String> {
    stop_parent_bound_child(&mut runtime.child)?;
    remove_owned_tailscale_mapping(&runtime.cli_path, &runtime.hostname, &runtime.proxy_target)
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

fn system_time_unix_secs(value: SystemTime) -> Result<i64, String> {
    let seconds = value
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("mobile TLS clock is before the Unix epoch: {error}"))?
        .as_secs();
    i64::try_from(seconds).map_err(|_| "mobile TLS clock is out of range".to_string())
}

fn tls_certificate_params(sans: &[String], now: SystemTime) -> Result<CertificateParams, String> {
    let not_before = now
        .checked_sub(Duration::from_secs(TLS_CERTIFICATE_CLOCK_SKEW_SECS))
        .unwrap_or(now);
    let not_after = not_before
        .checked_add(Duration::from_secs(TLS_CERTIFICATE_VALIDITY_SECS))
        .ok_or_else(|| "mobile TLS certificate expiration is out of range".to_string())?;
    let mut params = CertificateParams::new(sans.to_vec())
        .map_err(|error| format!("configure mobile TLS certificate SANs: {error}"))?;
    params.not_before = not_before.into();
    params.not_after = not_after.into();

    let mut distinguished_name = DistinguishedName::new();
    distinguished_name.push(DnType::OrganizationName, "BYKAYLE");
    distinguished_name.push(DnType::OrganizationalUnitName, "Atelier");
    distinguished_name.push(DnType::CommonName, "Atelier Mobile Control");
    params.distinguished_name = distinguished_name;
    params.key_usages = vec![KeyUsagePurpose::DigitalSignature];
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    Ok(params)
}

fn create_tls_material_at(sans: &[String], now: SystemTime) -> Result<TlsMaterial, String> {
    let params = tls_certificate_params(sans, now)?;
    let not_before_unix_secs = params.not_before.unix_timestamp();
    let not_after_unix_secs = params.not_after.unix_timestamp();
    let key_pair =
        KeyPair::generate().map_err(|error| format!("generate mobile TLS private key: {error}"))?;
    let certificate = params
        .self_signed(&key_pair)
        .map_err(|error| format!("generate mobile TLS certificate: {error}"))?;
    Ok(TlsMaterial {
        fingerprint_sha256: format_fingerprint(certificate.der().as_ref()),
        certificate_pem: certificate.pem().into_bytes(),
        private_key_pem: key_pair.serialize_pem().into_bytes(),
        not_before_unix_secs,
        not_after_unix_secs,
    })
}

fn create_tls_material(sans: &[String]) -> Result<TlsMaterial, String> {
    create_tls_material_at(sans, SystemTime::now())
}

fn tls_metadata_is_current(
    metadata: &TlsCertificateMetadata,
    expected_sans: &[String],
    now: SystemTime,
) -> bool {
    let Ok(now_unix_secs) = system_time_unix_secs(now) else {
        return false;
    };
    let validity_secs = metadata
        .not_after_unix_secs
        .checked_sub(metadata.not_before_unix_secs);
    metadata.schema_version == SCHEMA_VERSION
        && metadata.profile_version == TLS_CERTIFICATE_PROFILE_VERSION
        && metadata.sans == expected_sans
        && metadata.not_before_unix_secs <= now_unix_secs
        && metadata.not_after_unix_secs
            > now_unix_secs.saturating_add(TLS_CERTIFICATE_RENEW_BEFORE_SECS)
        && validity_secs
            .is_some_and(|seconds| seconds > 0 && seconds <= TLS_CERTIFICATE_VALIDITY_SECS as i64)
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
        profile_version: TLS_CERTIFICATE_PROFILE_VERSION,
        sans: sans.to_vec(),
        fingerprint_sha256: material.fingerprint_sha256.clone(),
        not_before_unix_secs: material.not_before_unix_secs,
        not_after_unix_secs: material.not_after_unix_secs,
    };
    let metadata = serde_json::to_vec_pretty(&metadata)
        .map_err(|error| format!("serialize mobile TLS metadata: {error}"))?;
    write_private_file(&metadata_path, &metadata)?;
    Ok(material)
}

fn load_or_create_tls_material(lan_ip: IpAddr) -> Result<TlsMaterial, String> {
    let sans = certificate_sans(lan_ip);
    let (certificate_path, private_key_path, metadata_path) = tls_paths()?;
    let now = SystemTime::now();
    let existing = (|| {
        let metadata: TlsCertificateMetadata =
            serde_json::from_slice(&fs::read(&metadata_path).ok()?).ok()?;
        if !tls_metadata_is_current(&metadata, &sans, now) {
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
            not_before_unix_secs: metadata.not_before_unix_secs,
            not_after_unix_secs: metadata.not_after_unix_secs,
        })
    })();
    existing.map_or_else(|| create_and_store_tls_material(&sans), Ok)
}

fn base_urls(
    access_mode: MobileAccessMode,
    port: u16,
    tls: bool,
    lan_ip: Option<IpAddr>,
    tailscale_hostname: Option<&str>,
) -> Vec<String> {
    match access_mode {
        MobileAccessMode::Local => {
            let scheme = if tls { "https" } else { "http" };
            vec![format!("{scheme}://127.0.0.1:{port}")]
        }
        MobileAccessMode::Lan => match (tls, lan_ip.and_then(validated_private_lan_ip)) {
            (true, Some(ip)) => vec![format!("https://{ip}:{port}")],
            _ => Vec::new(),
        },
        MobileAccessMode::Tailscale => tailscale_hostname
            .filter(|value| !value.is_empty())
            .map(|hostname| vec![tailscale_serve_url(hostname)])
            .unwrap_or_default(),
    }
}

fn stopped_status() -> MobileServerStatus {
    MobileServerStatus {
        running: false,
        port: None,
        connection_mode: MobileAccessMode::Local,
        allow_lan: false,
        tls: false,
        certificate_fingerprint: None,
        started_at_ms: None,
        base_urls: Vec::new(),
        tailscale: None,
    }
}

fn current_status() -> MobileServerStatus {
    let Ok(mut runtime_guard) = server_runtime().lock() else {
        return stopped_status();
    };

    let serve_process_failed = runtime_guard
        .as_mut()
        .and_then(|runtime| runtime.tailscale_serve.as_mut())
        .is_some_and(|serve| !matches!(serve.child.try_wait(), Ok(None)));
    let mut finished_runtime = serve_process_failed.then(|| runtime_guard.take()).flatten();
    let snapshot = runtime_guard.as_ref().map(|runtime| {
        (
            runtime.port,
            runtime.access_mode,
            runtime.allow_lan,
            runtime.lan_ip,
            runtime.tls,
            runtime.certificate_fingerprint.clone(),
            runtime.started_at_ms,
            runtime
                .tailscale_serve
                .as_ref()
                .map(|serve| (serve.hostname.clone(), serve.proxy_target.clone())),
        )
    });
    drop(runtime_guard);

    if let Some(finished) = finished_runtime.as_mut() {
        if let Some(serve) = finished.tailscale_serve.as_mut() {
            if let Err(error) = stop_tailscale_serve(serve) {
                log::warn!("Failed to clean up stopped Atelier Tailscale Serve mapping: {error}");
            }
        }
        finished
            .handle
            .graceful_shutdown(Some(Duration::from_secs(2)));
        return stopped_status();
    }

    let Some((
        port,
        access_mode,
        allow_lan,
        lan_ip,
        backend_tls,
        certificate_fingerprint,
        started_at_ms,
        tailscale_mapping,
    )) = snapshot
    else {
        return stopped_status();
    };
    let tailscale_hostname = tailscale_mapping
        .as_ref()
        .map(|(hostname, _)| hostname.as_str());
    let owned_mapping = tailscale_mapping
        .as_ref()
        .map(|(hostname, proxy_target)| (hostname.as_str(), proxy_target.as_str()));
    let tailscale = (access_mode == MobileAccessMode::Tailscale)
        .then(|| tailscale_status_snapshot(owned_mapping));
    MobileServerStatus {
        running: true,
        port: Some(port),
        connection_mode: access_mode,
        allow_lan,
        tls: backend_tls || access_mode == MobileAccessMode::Tailscale,
        certificate_fingerprint,
        started_at_ms: Some(started_at_ms),
        base_urls: base_urls(access_mode, port, backend_tls, lan_ip, tailscale_hostname),
        tailscale,
    }
}

fn active_tailscale_mapping() -> Option<(String, String)> {
    server_runtime().lock().ok().and_then(|runtime| {
        runtime.as_ref().and_then(|runtime| {
            runtime
                .tailscale_serve
                .as_ref()
                .map(|serve| (serve.hostname.clone(), serve.proxy_target.clone()))
        })
    })
}

fn add_security_headers(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(MOBILE_CSP),
    );
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    response
}

async fn home() -> Response {
    add_security_headers(Html(MOBILE_HTML).into_response())
}

async fn app_js() -> Response {
    let mut response = MOBILE_JS.into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/javascript; charset=utf-8"),
    );
    add_security_headers(response)
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
    let accepted = {
        let mut pending = pairings().lock().map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Pairing state is unavailable.",
            )
        })?;
        consume_pairing_attempt(
            &mut pending,
            request.pairing_id.trim(),
            request.code.trim(),
            now,
        )
    };
    if !accepted {
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

fn pairing_urls(base_urls: &[String], pairing_id: &str) -> Vec<String> {
    base_urls
        .iter()
        .map(|url| format!("{}/?pairing={pairing_id}", url.trim_end_matches('/')))
        .collect()
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
    let task_followup = device.scopes.iter().any(|scope| scope == "task:followup");
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
            capabilities: MonitorCapabilities {
                followup_proposal,
                task_followup,
            },
            followups: crate::remote_followup::device_statuses(&device.device_id, 20),
            sessions: crate::mobile_continuity::sessions_projection(),
        })
        .into_response(),
    ))
}

fn validate_session_followup_prompt(prompt: &str) -> Result<String, ApiError> {
    let prompt = prompt.trim();
    if prompt.is_empty() || prompt.chars().count() > 4_000 || prompt.contains('\0') {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Follow-up prompt must contain 1 to 4000 characters.",
        ));
    }
    Ok(prompt.to_string())
}

fn session_followup_receipt_key(device_id: &str, client_request_id: &str) -> String {
    format!("{device_id}:{client_request_id}")
}

fn rate_limit_allows(device_id: &str, now: u64) -> Result<(), ApiError> {
    let mut limits = session_followup_rate_limits().lock().map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Mobile follow-up rate-limit state is unavailable.",
        )
    })?;
    let timestamps = limits.entry(device_id.to_string()).or_default();
    while timestamps
        .front()
        .is_some_and(|timestamp| now.saturating_sub(*timestamp) >= SESSION_FOLLOWUP_RATE_WINDOW_MS)
    {
        let _ = timestamps.pop_front();
    }
    if timestamps.len() >= SESSION_FOLLOWUP_RATE_LIMIT {
        return Err(ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "Mobile follow-up rate limit exceeded. Try again shortly.",
        ));
    }
    timestamps.push_back(now);
    Ok(())
}

fn bounded_receipt_insert(
    receipts: &mut HashMap<String, SessionFollowupReceipt>,
    key: String,
    receipt: SessionFollowupReceipt,
) {
    if receipts.len() >= MAX_SESSION_FOLLOWUP_RECEIPTS {
        if let Some(oldest_key) = receipts
            .iter()
            .min_by_key(|(_, receipt)| receipt.response.created_at_ms)
            .map(|(key, _)| key.clone())
        {
            receipts.remove(&oldest_key);
        }
    }
    receipts.insert(key, receipt);
}

async fn session_followup(
    headers: HeaderMap,
    Json(request): Json<SessionFollowupRequest>,
) -> Result<Response, ApiError> {
    let device = authenticate(&headers)?;
    if !device.scopes.iter().any(|scope| scope == "task:followup") {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "This device cannot continue Atelier tasks. Enable task follow-up access on the desktop.",
        ));
    }
    let client_request_id = request.client_request_id.trim();
    if Uuid::parse_str(client_request_id).is_err() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Client request id must be a UUID.",
        ));
    }
    if Uuid::parse_str(request.mobile_task_id.trim()).is_err() {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "Mobile session is unavailable.",
        ));
    }
    let mobile_task_id = request.mobile_task_id.trim().to_string();
    let prompt = validate_session_followup_prompt(&request.prompt)?;
    let receipt_key = session_followup_receipt_key(&device.device_id, client_request_id);
    let now = now_ms();

    // Keep the idempotency lookup and enqueue together: concurrent retransmits
    // cannot both create a control-plane request for the same device request id.
    let mut receipts = session_followup_receipts().lock().map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Mobile follow-up receipt state is unavailable.",
        )
    })?;
    if let Some(receipt) = receipts.get(&receipt_key) {
        let mut replay = receipt.response.clone();
        replay.replayed = true;
        return Ok(add_security_headers(Json(replay).into_response()));
    }
    let target = crate::mobile_continuity::resolve_followup(&mobile_task_id, request.revision, now)
        .map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "Mobile session is unavailable."))?;
    rate_limit_allows(&device.device_id, now)?;
    let source = format!(
        "mobile-continuity:{}:{}",
        device.device_id, client_request_id
    );
    let payload = serde_json::json!({
        "mobileContinuity": true,
        "targetSessionId": target.session_id,
        "mobileTaskId": target.mobile_task_id,
        "revision": target.revision,
        "prompt": prompt,
        "expectedWorkspace": target.expected_workspace,
        "expectedProvider": target.provider,
        "expectedModel": target.model,
        "expectedPermissionMode": target.permission_mode,
        "clientRequestId": client_request_id,
    });
    let request = crate::control_plane::enqueue_request(
        "task.dispatch",
        Some(target.workspace),
        payload,
        &source,
    )
    .map_err(|error| {
        log::warn!(
            "Mobile continuity enqueue failed for device {}: {error}",
            device.device_id
        );
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not queue the selected Atelier task.",
        )
    })?;
    let response = SessionFollowupResponse {
        request_id: request.request_id,
        mobile_task_id,
        status: "queued",
        created_at_ms: request.created_at_unix_ms,
        replayed: false,
    };
    bounded_receipt_insert(
        &mut receipts,
        receipt_key,
        SessionFollowupReceipt {
            response: response.clone(),
        },
    );
    Ok(add_security_headers(
        (StatusCode::CREATED, Json(response)).into_response(),
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

fn mobile_routes() -> Router {
    Router::new()
        .route("/", get(home))
        .route("/app.js", get(app_js))
        .route("/health", get(health))
        .route("/api/v1/pair", post(pair))
        .route("/api/v1/monitor", get(monitor))
        .route("/api/v1/followups", post(followup))
        .route("/api/v1/session-followups", post(session_followup))
}

fn request_authority_matches(request: &Request, expected: &str) -> bool {
    let host = request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok());
    let uri_authority = request.uri().authority().map(|value| value.as_str());
    if host.is_none() && uri_authority.is_none() {
        return false;
    }
    host.map_or(true, |value| value == expected)
        && uri_authority.map_or(true, |value| value == expected)
}

fn requires_strict_origin(method: &Method, path: &str) -> bool {
    *method == Method::POST
        && matches!(
            path,
            "/api/v1/pair" | "/api/v1/followups" | "/api/v1/session-followups"
        )
}

async fn enforce_request_policy(
    State(policy): State<RequestPolicy>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    // HTTP/1.1 carries the authority in `Host`; HTTP/2 carries it in the
    // `:authority` pseudo-header, which Axum exposes through the request URI.
    // If both are present they must both match so neither protocol can bypass
    // the exact runtime address boundary.
    if !request_authority_matches(&request, &policy.allowed_authority) {
        return Err(ApiError::new(
            StatusCode::MISDIRECTED_REQUEST,
            "Request host is not allowed.",
        ));
    }

    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    let requires_origin = requires_strict_origin(request.method(), request.uri().path());
    if (requires_origin && origin != Some(policy.allowed_origin.as_str()))
        || origin.is_some_and(|value| value != policy.allowed_origin.as_str())
    {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "Request origin is not allowed.",
        ));
    }

    Ok(next.run(request).await)
}

fn router(policy: RequestPolicy) -> Router {
    Router::new()
        .merge(mobile_routes())
        .layer(middleware::from_fn_with_state(
            policy,
            enforce_request_policy,
        ))
}

#[tauri::command]
pub(crate) fn mobile_control_server_status() -> MobileServerStatus {
    current_status()
}

#[tauri::command]
pub(crate) fn mobile_control_network_candidates() -> Result<Vec<MobileNetworkCandidate>, String> {
    current_network_candidates()
}

#[tauri::command]
pub(crate) fn mobile_control_tailscale_status() -> MobileTailscaleStatus {
    let owned_mapping = active_tailscale_mapping();
    tailscale_status_snapshot(
        owned_mapping
            .as_ref()
            .map(|(hostname, proxy_target)| (hostname.as_str(), proxy_target.as_str())),
    )
}

#[tauri::command]
pub(crate) async fn mobile_control_server_start(
    connection_mode: Option<String>,
    port: Option<u16>,
    lan_ip: Option<String>,
    allow_lan: Option<bool>,
) -> Result<MobileServerStatus, String> {
    if current_status().running {
        return Ok(current_status());
    }
    let access_mode = parse_access_mode(connection_mode.as_deref(), allow_lan)?;
    let candidates = if access_mode == MobileAccessMode::Lan {
        current_network_candidates()?
    } else {
        Vec::new()
    };
    let bind_ip = bind_ip_for_mode(access_mode, lan_ip.as_deref(), &candidates)?;
    let lan_ip = (access_mode == MobileAccessMode::Lan).then_some(bind_ip);
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
    let tailscale_status =
        (access_mode == MobileAccessMode::Tailscale).then(|| tailscale_status_snapshot(None));
    let request_policy = match access_mode {
        MobileAccessMode::Local | MobileAccessMode::Lan => RequestPolicy::new(
            SocketAddr::new(bind_ip, actual_port).to_string(),
            tls_config.is_some(),
        ),
        MobileAccessMode::Tailscale => RequestPolicy::new(
            tailscale_serve_host(
                tailscale_status
                    .as_ref()
                    .and_then(|status| status.dns_name.as_deref())
                    .ok_or_else(|| {
                        "Tailscale HTTPS domain is unavailable. Reconnect Tailscale and try again."
                            .to_string()
                    })?,
            ),
            true,
        ),
    };
    let mut tailscale_serve = if access_mode == MobileAccessMode::Tailscale {
        let tailscale_status =
            tailscale_status.ok_or_else(|| "Tailscale status is unavailable.".to_string())?;
        if !tailscale_status.active {
            return Err(tailscale_status.blocked_reason.unwrap_or_else(|| {
                "Tailscale external access is not ready on this computer.".to_string()
            }));
        }
        Some(start_tailscale_serve(
            actual_port,
            tailscale_status.dns_name.as_deref().unwrap_or_default(),
        )?)
    } else {
        None
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
            if let Some(serve) = tailscale_serve.as_mut() {
                stop_tailscale_serve(serve)?;
            }
            return Ok(current_status());
        }
        *runtime = Some(ServerRuntime {
            runtime_id,
            port: actual_port,
            access_mode,
            allow_lan: access_mode == MobileAccessMode::Lan,
            lan_ip,
            tls: tls_config.is_some(),
            certificate_fingerprint,
            started_at_ms: now_ms(),
            handle: handle.clone(),
            tailscale_serve,
        });
    }
    tauri::async_runtime::spawn(async move {
        let result = if let Some(config) = tls_config {
            axum_server::from_tcp_rustls(listener, config)
                .handle(handle)
                .serve(router(request_policy).into_make_service())
                .await
        } else {
            axum_server::from_tcp(listener)
                .handle(handle)
                .serve(router(request_policy).into_make_service())
                .await
        };
        if let Err(error) = result {
            log::warn!("Atelier mobile control server stopped: {error}");
        }
        let mut finished = server_runtime().lock().ok().and_then(|mut runtime| {
            runtime
                .as_ref()
                .is_some_and(|runtime| runtime.runtime_id == runtime_id)
                .then(|| runtime.take())
                .flatten()
        });
        if let Some(finished) = finished.as_mut() {
            if let Some(serve) = finished.tailscale_serve.as_mut() {
                if let Err(error) = stop_tailscale_serve(serve) {
                    log::warn!("Failed to clean up Atelier Tailscale Serve mapping: {error}");
                }
            }
        }
    });
    if let Err(error) = set_tailscale_restore_enabled(access_mode == MobileAccessMode::Tailscale) {
        log::warn!("Failed to persist Atelier mobile server preference: {error}");
    }
    Ok(current_status())
}

fn stop_server_inner() -> Result<(), String> {
    let mut running = server_runtime()
        .lock()
        .map_err(|error| format!("mobile server lock: {error}"))?
        .take();
    if let Some(running) = running.as_mut() {
        let cleanup_result = if let Some(serve) = running.tailscale_serve.as_mut() {
            stop_tailscale_serve(serve)
        } else {
            Ok(())
        };
        running
            .handle
            .graceful_shutdown(Some(Duration::from_secs(2)));
        cleanup_result?;
    }
    Ok(())
}

fn explicit_stop_with(
    disable_restore: impl FnOnce() -> Result<(), String>,
    stop_runtime: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let preference_result = disable_restore();
    let cleanup_result = stop_runtime();
    match (preference_result, cleanup_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Ok(()), Err(cleanup_error)) => Err(cleanup_error),
        (Err(preference_error), Ok(())) => Err(format!(
            "Mobile access stopped, but automatic restore could not be disabled: {preference_error}"
        )),
        (Err(preference_error), Err(cleanup_error)) => Err(format!(
            "{cleanup_error}; automatic restore could not be disabled: {preference_error}"
        )),
    }
}

pub(crate) fn stop_server() {
    if let Err(error) = stop_server_inner() {
        log::warn!("Failed to fully stop Atelier mobile control: {error}");
    }
}

#[tauri::command]
pub(crate) fn mobile_control_server_stop() -> Result<MobileServerStatus, String> {
    explicit_stop_with(|| set_tailscale_restore_enabled(false), stop_server_inner)?;
    let status = current_status();
    if status.running {
        return Err("Atelier mobile control remained active after the stop request.".to_string());
    }
    Ok(status)
}

pub(crate) async fn restore_server_after_restart() {
    match tailscale_restore_enabled() {
        Ok(true) => {}
        Ok(false) => return,
        Err(error) => {
            log::warn!("Failed to read Atelier mobile server preference: {error}");
            return;
        }
    }

    let mut last_error = None;
    for attempt in 0..6 {
        match mobile_control_server_start(Some("tailscale".to_string()), None, None, Some(false))
            .await
        {
            Ok(status) if status.running => return,
            Ok(_) => last_error = Some("server did not enter the running state".to_string()),
            Err(error) => last_error = Some(error),
        }
        if attempt < 5 {
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }
    log::warn!(
        "Atelier could not restore Tailscale mobile access after restart: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    );
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
        attempts_remaining: MAX_PAIRING_ATTEMPTS,
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
    let pairing_urls = pairing_urls(&status.base_urls, &pairing_id);
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
        // `command:propose` remains valid only for the legacy approval queue.
        // This setting now grants the explicit exact-session continuation scope.
        record.scopes.retain(|scope| scope != "task:followup");
        if enabled {
            record.scopes.push("task:followup".to_string());
        }
        Ok(MobileDevice::from(&*record))
    })
}

const _LEGACY_MOBILE_HTML: &str = r##"<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atelier Monitor</title><style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#171715;color:#f4f1ea}body{margin:0;padding:24px}.shell{max-width:720px;margin:auto}.brand{font-size:24px;font-weight:700;margin:8px 0 24px}.panel{border:1px solid #3b3a36;background:#22221f;border-radius:8px;padding:18px;margin:12px 0}.muted{color:#aaa79f;font-size:14px;line-height:1.5}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.metric{flex:1;min-width:120px}.metric strong{display:block;font-size:24px;margin-top:6px}input,textarea,button{font:inherit;border-radius:6px;border:1px solid #4a4944;background:#2b2a27;color:#f4f1ea;padding:12px;box-sizing:border-box}input{flex:1;min-width:180px}textarea{width:100%;min-height:108px;resize:vertical;margin:8px 0}button{background:#c96342;border-color:#da7653;font-weight:650;cursor:pointer}button:disabled{opacity:.5}.agent,.followup{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #3b3a36;padding:12px 0}.error{color:#ff9f91}.ok{color:#63d29e}.hidden{display:none}code{word-break:break-all}</style></head>
<body><main class="shell"><div class="brand">Atelier <span class="muted">Mobile Monitor</span></div>
<section id="pair-panel" class="panel"><h2>기기 연결</h2><p class="muted">데스크톱 Atelier에 표시된 6자리 코드를 직접 입력합니다. 최초 연결은 읽기 전용이며, 후속 지시는 데스크톱에서 별도로 허용해야 합니다.</p><div class="row"><input id="device-name" maxlength="64" value="Mobile browser" aria-label="기기 이름"><input id="pair-code" inputmode="numeric" maxlength="6" placeholder="000000" aria-label="페어링 코드"><button id="pair-button">연결</button></div><p id="pair-error" class="error"></p></section>
<section id="monitor-panel" class="hidden"><div class="panel row"><div class="metric"><span class="muted">대기</span><strong id="pending">0</strong></div><div class="metric"><span class="muted">실행</span><strong id="claimed">0</strong></div><div class="metric"><span class="muted">완료 영수증</span><strong id="receipts">0</strong></div></div><section class="panel"><h2>최근 작업</h2><div id="agents" class="muted">작업 상태를 불러오는 중입니다.</div></section><section id="followup-panel" class="panel hidden"><h2>후속 지시 제안</h2><p class="muted">이 내용은 바로 실행되지 않습니다. 데스크톱 Atelier에서 작업 폴더와 모델을 확인하고 명시적으로 승인해야 합니다.</p><textarea id="followup-prompt" maxlength="4000" placeholder="이어서 진행할 작업을 입력하세요" aria-label="후속 지시"></textarea><div class="row"><button id="followup-button">검토 요청</button><span id="followup-result" class="muted"></span></div><div id="followups" class="muted"></div></section><p id="monitor-error" class="error"></p></section>
</main><script src="./app.js" defer></script></body></html>"##;

const _LEGACY_MOBILE_JS: &str = r##""use strict";
const tokenKey="atelier.mobile.token.v1";
const pairingCandidate=new URLSearchParams(window.location.search).get("pairing")||"";
let pairingId=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pairingCandidate)?pairingCandidate:"";
const apiBase=new URL("./api/v1/",window.location.href);
const pairPanel=document.getElementById("pair-panel");
const monitorPanel=document.getElementById("monitor-panel");
const followupPanel=document.getElementById("followup-panel");
const pairButton=document.getElementById("pair-button");
const pairError=document.getElementById("pair-error");
const code=document.getElementById("pair-code");
let token=localStorage.getItem(tokenKey)||"";
if(!pairingId){pairButton.disabled=true;pairError.textContent="Atelier에서 만든 유효한 연결 주소를 다시 여세요."}
function showMonitor(){pairPanel.classList.add("hidden");monitorPanel.classList.remove("hidden")}
function resetPairing(){localStorage.removeItem(tokenKey);token="";monitorPanel.classList.add("hidden");pairPanel.classList.remove("hidden");if(!pairingId){pairButton.disabled=true;pairError.textContent="Atelier에서 만든 유효한 연결 주소를 다시 여세요."}}
async function pair(){if(!pairingId){pairError.textContent="유효한 연결 주소가 필요합니다.";return}const submittedCode=code.value.trim();if(!/^\d{6}$/.test(submittedCode)){pairError.textContent="6자리 코드를 입력하세요.";return}pairButton.disabled=true;pairError.textContent="";try{const response=await fetch(new URL("pair",apiBase),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pairingId,code:submittedCode,deviceName:document.getElementById("device-name").value})});const body=await response.json();if(!response.ok)throw new Error(body.error||"연결하지 못했습니다.");token=body.token;localStorage.setItem(tokenKey,token);window.history.replaceState(null,"",window.location.pathname);showMonitor();await refresh()}catch(error){pairError.textContent=String(error.message||error)}finally{pairButton.disabled=false}}
function renderAgents(items){const agents=document.getElementById("agents");agents.replaceChildren();if(!items.length){agents.textContent="최근 에이전트 작업이 없습니다.";return}for(const item of items){const row=document.createElement("div");row.className="agent";const left=document.createElement("span");left.textContent=`${item.provider} · ${item.phase}`;const right=document.createElement("span");right.className="muted";right.textContent=new Date(item.updatedAtMs).toLocaleTimeString();row.append(left,right);agents.append(row)}}
function renderFollowups(items){const target=document.getElementById("followups");target.replaceChildren();if(!items.length){target.textContent="제안한 후속 지시가 없습니다.";return}for(const item of items){const row=document.createElement("div");row.className="followup";const left=document.createElement("span");left.textContent=new Date(item.createdAtMs).toLocaleString();const right=document.createElement("span");right.textContent=item.status;right.className=item.status==="approved"?"ok":"muted";row.append(left,right);target.append(row)}}
async function submitFollowup(){const button=document.getElementById("followup-button");const result=document.getElementById("followup-result");const prompt=document.getElementById("followup-prompt").value.trim();if(!prompt){result.textContent="지시 내용을 입력하세요.";return}button.disabled=true;result.textContent="전송 중...";try{const response=await fetch(new URL("followups",apiBase),{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({prompt})});const body=await response.json();if(!response.ok)throw new Error(body.error||"후속 지시를 제안하지 못했습니다.");document.getElementById("followup-prompt").value="";result.textContent="데스크톱 검토 대기 중";await refresh()}catch(error){result.textContent=String(error.message||error)}finally{button.disabled=false}}
async function refresh(){if(!token)return;try{const response=await fetch(new URL("monitor",apiBase),{headers:{authorization:`Bearer ${token}`}});const body=await response.json();if(!response.ok)throw new Error(body.error||"상태를 읽지 못했습니다.");document.getElementById("pending").textContent=body.control.pendingRequests;document.getElementById("claimed").textContent=body.control.claimedRequests;document.getElementById("receipts").textContent=body.control.receipts;renderAgents(body.agents||[]);const canFollowup=Boolean(body.capabilities&&body.capabilities.followupProposal);followupPanel.classList.toggle("hidden",!canFollowup);if(canFollowup)renderFollowups(body.followups||[]);document.getElementById("monitor-error").textContent=""}catch(error){const message=String(error.message||error);document.getElementById("monitor-error").textContent=message;if(message.includes("token")||message.includes("revoked"))resetPairing()}}
pairButton.addEventListener("click",pair);
document.getElementById("followup-button").addEventListener("click",submitFollowup);
if(token){showMonitor();refresh()}
setInterval(refresh,3000);
"##;

const MOBILE_HTML: &str = r##"<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atelier 작업 이어가기</title><style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#171715;color:#f4f1ea}body{margin:0;padding:18px;line-height:1.55;overflow-wrap:anywhere}.shell{max-width:760px;margin:auto}.brand{font-size:24px;font-weight:700;margin:8px 0 18px}.panel{border:1px solid #3b3a36;background:#22221f;border-radius:8px;padding:16px;margin:12px 0}.muted{color:#aaa79f;font-size:14px;line-height:1.55}.row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}.field{display:block;flex:1;min-width:150px}.field>span{display:block;font-size:13px;font-weight:600;margin-bottom:6px}input,textarea,button{font:inherit;border-radius:6px;border:1px solid #4a4944;background:#2b2a27;color:#f4f1ea;padding:11px;box-sizing:border-box;min-height:44px}input{width:100%}textarea{width:100%;min-height:90px;resize:vertical;margin:8px 0}button{background:#c96342;border-color:#da7653;font-weight:650;cursor:pointer}button:disabled,textarea:disabled{opacity:.55;cursor:not-allowed}:focus-visible{outline:3px solid #f0b15e;outline-offset:2px}.session{display:block;width:100%;text-align:left;background:transparent;border:0;border-top:1px solid #3b3a36}.session.active{background:#35312a}.session-title{display:block;font-weight:650}.message{border-top:1px solid #3b3a36;padding:10px 0;white-space:pre-wrap}.message .meta{display:block;font-size:12px;color:#aaa79f;margin-bottom:4px}.error{color:#ff9f91}.ok{color:#63d29e}.hidden{display:none}</style></head>
<body><main class="shell"><div class="brand">Atelier <span class="muted">작업 이어가기</span></div>
<section id="pair-panel" class="panel"><h2>기기 연결</h2><p class="muted">데스크톱 Atelier에 표시된 6자리 코드로 연결합니다. 처음에는 읽기 전용입니다.</p><div class="row"><label class="field" for="device-name"><span>기기 이름</span><input id="device-name" maxlength="64" value="모바일 브라우저" autocomplete="name"></label><label class="field" for="pair-code"><span>6자리 코드</span><input id="pair-code" inputmode="numeric" maxlength="6" pattern="[0-9]*" autocomplete="one-time-code" placeholder="000000"></label><button id="pair-button">연결</button></div><p id="pair-error" class="error" role="alert" aria-live="assertive" aria-atomic="true"></p></section>
<section id="monitor-panel" class="hidden"><section class="panel"><h2 id="tasks-heading" tabindex="-1">내 작업</h2><p id="access-note" class="muted" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p><nav id="sessions" class="muted" aria-label="Atelier 작업 목록">작업을 불러오는 중입니다.</nav></section><section class="panel"><h2 id="conversation-title">대화</h2><div id="messages" class="muted" aria-label="선택한 작업의 대화">작업을 선택하세요.</div></section><section id="send-panel" class="panel"><h2>선택한 작업에 지시</h2><p class="muted">지시는 이 기기에 표시된 작업 중 선택한 작업의 현재 workspace·provider·model·권한으로만 이어집니다.</p><p id="followup-permission" class="muted">현재 읽기 전용입니다.</p><textarea id="followup-prompt" maxlength="4000" placeholder="이어서 진행할 작업을 입력하세요" aria-label="후속 지시" disabled></textarea><div class="row"><button id="followup-button" disabled>작업 이어가기</button><span id="followup-result" class="muted" role="status" aria-live="polite" aria-atomic="true"></span></div></section><p id="monitor-error" class="error" role="alert" aria-live="assertive" aria-atomic="true"></p></section>
</main><script src="./app.js" defer></script></body></html>"##;

const MOBILE_JS: &str = r##""use strict";
const tokenKey="atelier.mobile.token.v1";
const pairingCandidate=new URLSearchParams(window.location.search).get("pairing")||"";
const pairingId=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pairingCandidate)?pairingCandidate:"";
const apiBase=new URL("./api/v1/",window.location.href);
const pairPanel=document.getElementById("pair-panel"),monitorPanel=document.getElementById("monitor-panel"),pairButton=document.getElementById("pair-button"),pairError=document.getElementById("pair-error"),code=document.getElementById("pair-code"),tasksHeading=document.getElementById("tasks-heading"),accessNote=document.getElementById("access-note"),sendPanel=document.getElementById("send-panel"),followupPrompt=document.getElementById("followup-prompt"),followupButton=document.getElementById("followup-button"),followupPermission=document.getElementById("followup-permission");
let token=localStorage.getItem(tokenKey)||"",selectedTaskId="",snapshot=[],lastRenderSignature="",taskFollowupAllowed=false,sending=false;
if(!pairingId){pairButton.disabled=true;pairError.textContent="Atelier에서 만든 유효한 연결 주소를 다시 여세요."}
function showMonitor(moveFocus=false){pairPanel.classList.add("hidden");monitorPanel.classList.remove("hidden");if(moveFocus)requestAnimationFrame(()=>tasksHeading.focus())}
function resetPairing(){localStorage.removeItem(tokenKey);token="";selectedTaskId="";monitorPanel.classList.add("hidden");pairPanel.classList.remove("hidden");if(!pairingId){pairButton.disabled=true;pairError.textContent="Atelier에서 새 페어링 주소를 만든 뒤 다시 여세요."}requestAnimationFrame(()=>code.focus())}
async function pair(){if(!pairingId)return;const submittedCode=code.value.trim();if(!/^\d{6}$/.test(submittedCode)){pairError.textContent="6자리 코드를 입력하세요.";code.focus();return}pairButton.disabled=true;pairError.textContent="";try{const response=await fetch(new URL("pair",apiBase),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pairingId,code:submittedCode,deviceName:document.getElementById("device-name").value})});const body=await response.json();if(!response.ok)throw new Error(body.error||"연결하지 못했습니다.");token=body.token;pairingId="";localStorage.setItem(tokenKey,token);window.history.replaceState(null,"",window.location.pathname);showMonitor(true);await refresh()}catch(error){pairError.textContent=String(error.message||error)}finally{pairButton.disabled=false}}
function selected(){return snapshot.find(item=>item.mobileTaskId===selectedTaskId)||null}
function renderSessions(){const target=document.getElementById("sessions"),focused=target.contains(document.activeElement)?document.activeElement.dataset.mobileTaskId||"":"";target.replaceChildren();if(!snapshot.length){target.textContent="현재 모바일로 이어갈 수 있는 작업이 없습니다.";return}for(const item of snapshot){const button=document.createElement("button"),title=document.createElement("span"),meta=document.createElement("span"),isSelected=item.mobileTaskId===selectedTaskId;button.type="button";button.dataset.mobileTaskId=item.mobileTaskId;button.className="session"+(isSelected?" active":"");button.setAttribute("aria-pressed",String(isSelected));title.className="session-title";title.textContent=item.title;meta.className="muted";meta.textContent=`${isSelected?"선택됨 · ":""}${item.provider} · ${item.model} · ${item.workspace} · ${item.status}`;button.append(title,meta);button.addEventListener("click",()=>{selectedTaskId=item.mobileTaskId;renderSessions();renderMessages()});target.append(button)}if(focused)requestAnimationFrame(()=>{const targetButton=Array.from(target.querySelectorAll("button")).find(button=>button.dataset.mobileTaskId===focused);if(targetButton)targetButton.focus({preventScroll:true})})}
function renderMessages(){const target=document.getElementById("messages"),title=document.getElementById("conversation-title"),item=selected();target.replaceChildren();if(!item){title.textContent="대화";target.textContent="작업을 선택하세요.";return}title.textContent=item.title;for(const message of item.messages||[]){const row=document.createElement("div"),meta=document.createElement("span"),text=document.createElement("div");row.className="message";meta.className="meta";meta.textContent=`${message.role} · ${new Date(message.createdAtMs).toLocaleString()}${message.status?` · ${message.status}`:""}`;text.textContent=message.text;row.append(meta,text);target.append(row)}if(!(item.messages||[]).length)target.textContent="표시할 사용자/assistant 대화가 없습니다."}
async function submitFollowup(){const item=selected(),result=document.getElementById("followup-result"),prompt=followupPrompt.value.trim();if(!taskFollowupAllowed){result.textContent="데스크톱 Atelier에서 이 기기의 작업 이어가기 권한을 먼저 허용하세요.";return}if(!item){result.textContent="이어갈 작업을 선택하세요.";return}if(!prompt){result.textContent="지시 내용을 입력하세요.";followupPrompt.focus();return}if(!crypto.randomUUID){result.textContent="이 브라우저는 안전한 요청 식별자를 지원하지 않습니다.";return}sending=true;followupButton.disabled=true;result.textContent="전송 중...";try{const response=await fetch(new URL("session-followups",apiBase),{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({mobileTaskId:item.mobileTaskId,prompt,clientRequestId:crypto.randomUUID(),revision:item.revision})});const body=await response.json();if(!response.ok)throw new Error(body.error||"작업을 이어가지 못했습니다.");followupPrompt.value="";result.textContent=body.replayed?"이미 접수된 요청입니다.":"선택한 작업에 전달했습니다."}catch(error){result.textContent=String(error.message||error)}finally{sending=false;followupButton.disabled=!taskFollowupAllowed}}
async function refresh(){if(!token)return;try{const response=await fetch(new URL("monitor",apiBase),{headers:{authorization:`Bearer ${token}`}});const body=await response.json();if(!response.ok)throw new Error(body.error||"상태를 읽지 못했습니다.");snapshot=Array.isArray(body.sessions)?body.sessions:[];const nextSelected=(snapshot.find(item=>item.mobileTaskId===selectedTaskId)?selectedTaskId:(snapshot.find(item=>item.active)||snapshot[0]||{}).mobileTaskId)||"";const selectedChanged=nextSelected!==selectedTaskId;selectedTaskId=nextSelected;const renderSignature=JSON.stringify(snapshot),allowed=Boolean(body.capabilities&&body.capabilities.taskFollowup);if(taskFollowupAllowed&&!allowed&&sendPanel.contains(document.activeElement)){accessNote.focus({preventScroll:true})}taskFollowupAllowed=allowed;followupPrompt.disabled=!allowed;followupButton.disabled=!allowed||sending;followupPermission.textContent=allowed?"이 기기는 표시된 작업에 직접 지시할 수 있습니다.":"현재 읽기 전용입니다. 데스크톱에서 이 기기의 모바일 작업 이어가기를 허용하면 입력할 수 있습니다.";accessNote.textContent=allowed?"새 메시지와 상태는 자동으로 갱신됩니다.":"읽기 전용입니다. 데스크톱 Atelier에서 작업 이어가기 권한을 허용하면 이 작업에 지시를 보낼 수 있습니다.";if(selectedChanged||renderSignature!==lastRenderSignature){lastRenderSignature=renderSignature;renderSessions();renderMessages()}document.getElementById("monitor-error").textContent=""}catch(error){const message=String(error.message||error);document.getElementById("monitor-error").textContent=message;if(message.includes("token")||message.includes("revoked"))resetPairing()}}
pairButton.addEventListener("click",pair);document.getElementById("followup-button").addEventListener("click",submitFollowup);if(token){showMonitor();refresh()}setInterval(refresh,3000);
"##;

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn unix_parent_bound_child_stops_when_the_owner_pipe_closes() {
        let args = [OsString::from("30")];
        let mut child = unix_parent_bound_command(Path::new("/bin/sleep"), &args)
            .spawn()
            .expect("spawn parent-bound fixture");
        assert!(child.stdin.is_some());
        thread::sleep(Duration::from_millis(150));
        assert!(child.try_wait().expect("read running fixture").is_none());

        let started = Instant::now();
        stop_parent_bound_child(&mut child).expect("stop parent-bound fixture");
        assert!(started.elapsed() < Duration::from_secs(3));
        assert!(child.try_wait().expect("read fixture status").is_some());
    }

    fn pending_pairing(pairing_id: &str, code: &str, expires_at_ms: u64) -> PendingPairing {
        PendingPairing {
            pairing_id: pairing_id.to_string(),
            code_hash: hash_secret(code),
            expires_at_ms,
            attempts_remaining: MAX_PAIRING_ATTEMPTS,
        }
    }

    async fn spawn_http_fixture() -> (
        u16,
        RequestPolicy,
        axum_server::Handle,
        tokio::task::JoinHandle<std::io::Result<()>>,
    ) {
        let listener = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let policy = RequestPolicy::new(format!("127.0.0.1:{port}"), false);
        let server_policy = policy.clone();
        let handle = axum_server::Handle::new();
        let task_handle = handle.clone();
        let server = tokio::spawn(async move {
            axum_server::from_tcp(listener)
                .handle(task_handle)
                .serve(router(server_policy).into_make_service())
                .await
        });
        (port, policy, handle, server)
    }

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
    fn pairing_attempts_are_bounded_and_success_is_one_use() {
        let now = 10_000;
        let pairing_id = Uuid::new_v4().to_string();
        let mut pending = HashMap::from([(
            pairing_id.clone(),
            pending_pairing(&pairing_id, "123456", now + 1_000),
        )]);

        for attempt in 1..MAX_PAIRING_ATTEMPTS {
            assert!(!consume_pairing_attempt(
                &mut pending,
                &pairing_id,
                "654321",
                now
            ));
            assert_eq!(
                pending.get(&pairing_id).unwrap().attempts_remaining,
                MAX_PAIRING_ATTEMPTS - attempt
            );
        }
        assert!(!consume_pairing_attempt(
            &mut pending,
            &pairing_id,
            "654321",
            now
        ));
        assert!(!pending.contains_key(&pairing_id));

        pending.insert(
            pairing_id.clone(),
            pending_pairing(&pairing_id, "123456", now + 1_000),
        );
        assert!(consume_pairing_attempt(
            &mut pending,
            &pairing_id,
            "123456",
            now
        ));
        assert!(!pending.contains_key(&pairing_id));
        assert!(!consume_pairing_attempt(
            &mut pending,
            &pairing_id,
            "123456",
            now
        ));
    }

    #[test]
    fn expired_pairing_is_removed_without_acceptance() {
        let pairing_id = Uuid::new_v4().to_string();
        let mut pending = HashMap::from([(
            pairing_id.clone(),
            pending_pairing(&pairing_id, "123456", 10_000),
        )]);
        assert!(!consume_pairing_attempt(
            &mut pending,
            &pairing_id,
            "123456",
            10_000
        ));
        assert!(!pending.contains_key(&pairing_id));
    }

    #[test]
    fn loopback_is_the_default_surface() {
        let urls = base_urls(MobileAccessMode::Local, 44000, false, None, None);
        assert_eq!(urls, vec!["http://127.0.0.1:44000"]);
        assert_eq!(
            bind_ip_for_mode(MobileAccessMode::Local, Some("192.168.1.22"), &[]).unwrap(),
            Ipv4Addr::LOCALHOST
        );
    }

    #[test]
    fn lan_surface_has_one_exact_private_https_bind_and_url() {
        let lan_ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 22));
        let candidates = build_network_candidates(
            [("en0".to_string(), lan_ip)],
            Some(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 22))),
        );
        let urls = base_urls(MobileAccessMode::Lan, 44000, true, Some(lan_ip), None);
        assert_eq!(urls, vec!["https://192.168.1.22:44000"]);
        assert!(urls.iter().all(|url| url.starts_with("https://")));
        assert_eq!(
            bind_ip_for_mode(MobileAccessMode::Lan, Some("192.168.1.22"), &candidates).unwrap(),
            lan_ip
        );
        assert!(
            bind_ip_for_mode(MobileAccessMode::Lan, Some("100.83.182.116"), &candidates).is_err()
        );
        assert!(
            bind_ip_for_mode(MobileAccessMode::Lan, Some("192.168.1.23"), &candidates).is_err()
        );
        assert!(base_urls(
            MobileAccessMode::Lan,
            44000,
            true,
            Some(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))),
            None,
        )
        .is_empty());
    }

    #[test]
    fn lan_address_validation_is_rfc1918_ipv4_only() {
        for ip in [
            Ipv4Addr::new(10, 0, 0, 1),
            Ipv4Addr::new(172, 16, 0, 1),
            Ipv4Addr::new(192, 168, 0, 1),
        ] {
            assert_eq!(validated_private_lan_ip(IpAddr::V4(ip)), Some(ip.into()));
        }
        for ip in [
            Ipv4Addr::LOCALHOST,
            Ipv4Addr::new(100, 64, 0, 1),
            Ipv4Addr::new(169, 254, 1, 1),
            Ipv4Addr::new(203, 0, 113, 1),
        ] {
            assert_eq!(validated_private_lan_ip(IpAddr::V4(ip)), None);
        }
        assert_eq!(
            validated_private_lan_ip("fd00::1".parse::<IpAddr>().unwrap()),
            None
        );
    }

    #[test]
    fn network_candidates_are_private_deduplicated_and_default_route_first() {
        let recommended_ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 22));
        let candidates = build_network_candidates(
            [
                ("en1".to_string(), recommended_ip),
                ("en0".to_string(), recommended_ip),
                (
                    "ethernet".to_string(),
                    IpAddr::V4(Ipv4Addr::new(10, 0, 0, 8)),
                ),
                ("loopback".to_string(), IpAddr::V4(Ipv4Addr::LOCALHOST)),
                (
                    "tailscale".to_string(),
                    IpAddr::V4(Ipv4Addr::new(100, 83, 182, 116)),
                ),
                ("public".to_string(), IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))),
                ("ipv6".to_string(), "fd00::1".parse::<IpAddr>().unwrap()),
            ],
            Some(recommended_ip),
        );

        assert_eq!(
            candidates,
            vec![
                MobileNetworkCandidate {
                    interface_name: "en0".to_string(),
                    address: "192.168.1.22".to_string(),
                    recommended: true,
                },
                MobileNetworkCandidate {
                    interface_name: "ethernet".to_string(),
                    address: "10.0.0.8".to_string(),
                    recommended: false,
                },
            ]
        );
        assert_eq!(
            serde_json::to_value(&candidates[0]).unwrap(),
            serde_json::json!({
                "interfaceName": "en0",
                "address": "192.168.1.22",
                "recommended": true,
            })
        );
    }

    #[test]
    fn lan_bind_selection_requires_a_current_candidate() {
        let recommended_ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 22));
        let candidates = build_network_candidates(
            [
                (
                    "ethernet".to_string(),
                    IpAddr::V4(Ipv4Addr::new(10, 0, 0, 8)),
                ),
                ("wifi".to_string(), recommended_ip),
            ],
            Some(recommended_ip),
        );
        assert_eq!(
            bind_ip_for_mode(MobileAccessMode::Lan, None, &candidates).unwrap(),
            recommended_ip
        );
        assert_eq!(
            bind_ip_for_mode(MobileAccessMode::Lan, Some(" 10.0.0.8 "), &candidates).unwrap(),
            IpAddr::V4(Ipv4Addr::new(10, 0, 0, 8))
        );
        assert!(
            bind_ip_for_mode(MobileAccessMode::Lan, Some("192.168.1.99"), &candidates).is_err()
        );
        assert!(bind_ip_for_mode(MobileAccessMode::Lan, Some("not-an-ip"), &candidates).is_err());
        assert!(bind_ip_for_mode(MobileAccessMode::Lan, Some("fd00::1"), &candidates).is_err());
        assert!(bind_ip_for_mode(MobileAccessMode::Lan, None, &[]).is_err());

        let without_recommendation = build_network_candidates(
            [
                (
                    "wifi".to_string(),
                    IpAddr::V4(Ipv4Addr::new(192, 168, 1, 22)),
                ),
                (
                    "ethernet".to_string(),
                    IpAddr::V4(Ipv4Addr::new(10, 0, 0, 8)),
                ),
            ],
            None,
        );
        assert_eq!(
            bind_ip_for_mode(MobileAccessMode::Lan, Some(""), &without_recommendation).unwrap(),
            IpAddr::V4(Ipv4Addr::new(10, 0, 0, 8))
        );
    }

    #[test]
    fn connection_modes_are_explicit_and_tailscale_stays_loopback_only() {
        assert_eq!(
            parse_access_mode(Some("local"), Some(true)).unwrap(),
            MobileAccessMode::Local
        );
        assert_eq!(
            parse_access_mode(Some("lan"), Some(false)).unwrap(),
            MobileAccessMode::Lan
        );
        assert_eq!(
            parse_access_mode(Some("tailscale"), Some(true)).unwrap(),
            MobileAccessMode::Tailscale
        );
        assert!(parse_access_mode(Some("public"), None).is_err());
        assert_eq!(
            bind_ip_for_mode(MobileAccessMode::Tailscale, Some("192.168.1.22"), &[]).unwrap(),
            IpAddr::V4(Ipv4Addr::LOCALHOST)
        );
        assert_eq!(
            base_urls(
                MobileAccessMode::Tailscale,
                49152,
                false,
                None,
                Some("atelier-mac.example.ts.net"),
            ),
            vec!["https://atelier-mac.example.ts.net:8443/atelier/"]
        );
    }

    #[test]
    fn server_preference_restores_only_an_explicit_tailscale_choice() {
        let default = ServerPreference::default();
        assert_eq!(default.schema_version, SCHEMA_VERSION);
        assert!(!default.restore_tailscale);

        let enabled = ServerPreference {
            schema_version: SCHEMA_VERSION,
            restore_tailscale: true,
        };
        let serialized = serde_json::to_string(&enabled).expect("serialize server preference");
        assert!(serialized.contains("\"restoreTailscale\":true"));
        let decoded: ServerPreference =
            serde_json::from_str(&serialized).expect("deserialize server preference");
        assert!(decoded.restore_tailscale);
    }

    #[test]
    fn explicit_stop_disables_restore_before_runtime_cleanup_even_when_cleanup_fails() {
        use std::cell::RefCell;
        use std::rc::Rc;

        let order = Rc::new(RefCell::new(Vec::new()));
        let disable_order = Rc::clone(&order);
        let cleanup_order = Rc::clone(&order);
        let result = explicit_stop_with(
            move || {
                disable_order.borrow_mut().push("disable");
                Ok(())
            },
            move || {
                cleanup_order.borrow_mut().push("cleanup");
                Err("Serve cleanup failed".to_string())
            },
        );

        assert_eq!(order.borrow().as_slice(), ["disable", "cleanup"]);
        assert_eq!(result.expect_err("cleanup failure"), "Serve cleanup failed");
    }

    #[test]
    fn tailscale_https_requires_the_exact_self_certificate_domain() {
        let domains = vec![
            "other.tail1234.ts.net".to_string(),
            "Atelier-Mac.tail1234.ts.net.".to_string(),
        ];
        assert!(tailscale_https_enabled(
            "atelier-mac.tail1234.ts.net",
            &domains
        ));
        assert!(!tailscale_https_enabled(
            "atelier-mac.tail9999.ts.net",
            &domains
        ));
        assert_eq!(
            tailscale_activation_url("nMhCjwiw2W11CNTRL"),
            Some("https://login.tailscale.com/f/serve?node=nMhCjwiw2W11CNTRL".to_string())
        );
        assert_eq!(tailscale_activation_url("node&id=attacker"), None);
    }

    #[test]
    fn tailscale_serve_config_detects_exact_handler_and_any_public_funnel() {
        let private_config: TailscaleServeStatusJson = serde_json::from_value(serde_json::json!({
            "Foreground": {
                "owned-process": {
                    "Web": {
                        "atelier-mac.tail1234.ts.net:8443": {
                            "Handlers": {
                                "/other": { "Proxy": "http://127.0.0.1:41000" },
                                "/atelier": { "Proxy": "http://127.0.0.1:42000" }
                            }
                        }
                    }
                }
            }
        }))
        .unwrap();
        assert!(!private_config.has_public_funnel());
        assert_eq!(
            private_config
                .handler("atelier-mac.tail1234.ts.net:8443", "/atelier")
                .and_then(|handler| handler.proxy.as_deref()),
            Some("http://127.0.0.1:42000")
        );
        assert!(private_config
            .handler("atelier-mac.tail1234.ts.net:8443", "/missing")
            .is_none());

        for value in [
            serde_json::json!({ "AllowFunnel": { "atelier-mac.tail1234.ts.net:443": true } }),
            serde_json::json!({
                "Background": {
                    "public-process": {
                        "AllowFunnel": { "atelier-mac.tail1234.ts.net:443": true }
                    }
                }
            }),
        ] {
            let public_config: TailscaleServeStatusJson = serde_json::from_value(value).unwrap();
            assert!(public_config.has_public_funnel());
        }
    }

    #[test]
    fn pairing_urls_contain_only_the_pairing_identifier() {
        let pairing_id = Uuid::new_v4().to_string();
        let urls = pairing_urls(
            &[
                "https://192.168.1.22:44000".to_string(),
                "https://atelier-mac.tail1234.ts.net:8443/atelier/".to_string(),
            ],
            &pairing_id,
        );
        assert_eq!(
            urls,
            vec![
                format!("https://192.168.1.22:44000/?pairing={pairing_id}"),
                format!("https://atelier-mac.tail1234.ts.net:8443/atelier/?pairing={pairing_id}"),
            ]
        );
        assert!(urls.iter().all(|url| !url.contains("code=")));
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
        assert_eq!(
            material.not_after_unix_secs - material.not_before_unix_secs,
            TLS_CERTIFICATE_VALIDITY_SECS as i64
        );
    }

    #[test]
    fn tls_certificate_profile_is_current_bounded_and_server_only() {
        let now_unix_secs = 2_000_000_000;
        let now = UNIX_EPOCH + Duration::from_secs(now_unix_secs as u64);
        let lan_ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 22));
        let sans = certificate_sans(lan_ip);
        let params = tls_certificate_params(&sans, now).unwrap();

        assert_eq!(
            params.not_before.unix_timestamp(),
            now_unix_secs - TLS_CERTIFICATE_CLOCK_SKEW_SECS as i64
        );
        assert_eq!(
            params.not_after.unix_timestamp() - params.not_before.unix_timestamp(),
            TLS_CERTIFICATE_VALIDITY_SECS as i64
        );
        assert_eq!(
            params.distinguished_name.get(&DnType::OrganizationName),
            Some(&rcgen::DnValue::Utf8String("BYKAYLE".to_string()))
        );
        assert_eq!(
            params
                .distinguished_name
                .get(&DnType::OrganizationalUnitName),
            Some(&rcgen::DnValue::Utf8String("Atelier".to_string()))
        );
        assert_eq!(
            params.distinguished_name.get(&DnType::CommonName),
            Some(&rcgen::DnValue::Utf8String(
                "Atelier Mobile Control".to_string()
            ))
        );
        assert_eq!(params.key_usages, vec![KeyUsagePurpose::DigitalSignature]);
        assert_eq!(
            params.extended_key_usages,
            vec![ExtendedKeyUsagePurpose::ServerAuth]
        );
        assert!(params
            .subject_alt_names
            .contains(&rcgen::SanType::DnsName("localhost".try_into().unwrap())));
        assert!(params
            .subject_alt_names
            .contains(&rcgen::SanType::IpAddress(Ipv4Addr::LOCALHOST.into())));
        assert!(params
            .subject_alt_names
            .contains(&rcgen::SanType::IpAddress(lan_ip)));
    }

    #[test]
    fn tls_profile_version_and_validity_control_regeneration() {
        let now_unix_secs = 2_000_000_000;
        let now = UNIX_EPOCH + Duration::from_secs(now_unix_secs as u64);
        let sans = certificate_sans(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 22)));
        let current = TlsCertificateMetadata {
            schema_version: SCHEMA_VERSION,
            profile_version: TLS_CERTIFICATE_PROFILE_VERSION,
            sans: sans.clone(),
            fingerprint_sha256: "AA:BB".to_string(),
            not_before_unix_secs: now_unix_secs - TLS_CERTIFICATE_CLOCK_SKEW_SECS as i64,
            not_after_unix_secs: now_unix_secs - TLS_CERTIFICATE_CLOCK_SKEW_SECS as i64
                + TLS_CERTIFICATE_VALIDITY_SECS as i64,
        };
        assert!(tls_metadata_is_current(&current, &sans, now));

        let legacy_json = serde_json::json!({
            "schemaVersion": SCHEMA_VERSION,
            "sans": sans,
            "fingerprintSha256": "AA:BB"
        });
        let legacy: TlsCertificateMetadata = serde_json::from_value(legacy_json).unwrap();
        assert_eq!(legacy.profile_version, 0);
        assert!(!tls_metadata_is_current(&legacy, &current.sans, now));

        let mut old_profile = current.clone();
        old_profile.profile_version = TLS_CERTIFICATE_PROFILE_VERSION - 1;
        assert!(!tls_metadata_is_current(&old_profile, &current.sans, now));

        let mut near_expiry = current.clone();
        near_expiry.not_after_unix_secs = now_unix_secs + TLS_CERTIFICATE_RENEW_BEFORE_SECS;
        assert!(!tls_metadata_is_current(&near_expiry, &current.sans, now));

        let mut excessive_validity = current.clone();
        excessive_validity.not_after_unix_secs =
            excessive_validity.not_before_unix_secs + TLS_CERTIFICATE_VALIDITY_SECS as i64 + 1;
        assert!(!tls_metadata_is_current(
            &excessive_validity,
            &current.sans,
            now
        ));

        let changed_sans = certificate_sans(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 23)));
        assert!(!tls_metadata_is_current(&current, &changed_sans, now));
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
        let policy = RequestPolicy::new(format!("127.0.0.1:{port}"), true);
        let handle = axum_server::Handle::new();
        let task_handle = handle.clone();
        let server = tokio::spawn(async move {
            axum_server::from_tcp_rustls(listener, config)
                .handle(task_handle)
                .serve(router(policy).into_make_service())
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

    #[tokio::test]
    async fn static_home_external_js_and_request_policy_are_enforced() {
        let (port, policy, handle, server) = spawn_http_fixture().await;
        let base_url = format!("http://127.0.0.1:{port}");
        let client = reqwest::Client::new();

        let home_response = client
            .get(format!(
                "{base_url}/?pairing=%3C%2Fscript%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E&code=%3C%2Fscript%3Ecode-secret"
            ))
            .send()
            .await
            .unwrap();
        assert_eq!(home_response.status(), reqwest::StatusCode::OK);
        assert_eq!(
            home_response.headers().get(reqwest::header::CONTENT_TYPE),
            Some(&HeaderValue::from_static("text/html; charset=utf-8"))
        );
        assert_eq!(
            home_response
                .headers()
                .get(reqwest::header::CONTENT_SECURITY_POLICY),
            Some(&HeaderValue::from_static(MOBILE_CSP))
        );
        let html = home_response.text().await.unwrap();
        assert_eq!(html, MOBILE_HTML);
        assert!(!html.contains("alert(1)"));
        assert!(!html.contains("code-secret"));

        let script_response = client
            .get(format!("{base_url}/app.js"))
            .send()
            .await
            .unwrap();
        assert_eq!(script_response.status(), reqwest::StatusCode::OK);
        assert_eq!(
            script_response.headers().get(reqwest::header::CONTENT_TYPE),
            Some(&HeaderValue::from_static(
                "application/javascript; charset=utf-8"
            ))
        );
        assert_eq!(script_response.text().await.unwrap(), MOBILE_JS);

        let wrong_host = client
            .get(format!("{base_url}/health"))
            .header(reqwest::header::HOST, "attacker.example")
            .send()
            .await
            .unwrap();
        assert_eq!(
            wrong_host.status(),
            reqwest::StatusCode::MISDIRECTED_REQUEST
        );

        let wrong_get_origin = client
            .get(format!("{base_url}/health"))
            .header(reqwest::header::ORIGIN, "https://attacker.example")
            .send()
            .await
            .unwrap();
        assert_eq!(wrong_get_origin.status(), reqwest::StatusCode::FORBIDDEN);

        let pair_body = serde_json::json!({
            "pairingId": Uuid::new_v4().to_string(),
            "code": "123456",
            "deviceName": "Test phone",
        });
        let missing_origin = client
            .post(format!("{base_url}/api/v1/pair"))
            .json(&pair_body)
            .send()
            .await
            .unwrap();
        assert_eq!(missing_origin.status(), reqwest::StatusCode::FORBIDDEN);

        let wrong_origin = client
            .post(format!("{base_url}/api/v1/pair"))
            .header(reqwest::header::ORIGIN, "https://attacker.example")
            .json(&pair_body)
            .send()
            .await
            .unwrap();
        assert_eq!(wrong_origin.status(), reqwest::StatusCode::FORBIDDEN);

        let session_missing_origin = client
            .post(format!("{base_url}/api/v1/session-followups"))
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(
            session_missing_origin.status(),
            reqwest::StatusCode::FORBIDDEN
        );

        let session_wrong_origin = client
            .post(format!("{base_url}/api/v1/session-followups"))
            .header(reqwest::header::ORIGIN, "https://attacker.example")
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(
            session_wrong_origin.status(),
            reqwest::StatusCode::FORBIDDEN
        );

        let accepted_origin = client
            .post(format!("{base_url}/api/v1/pair"))
            .header(reqwest::header::ORIGIN, &policy.allowed_origin)
            .json(&pair_body)
            .send()
            .await
            .unwrap();
        assert_eq!(accepted_origin.status(), reqwest::StatusCode::UNAUTHORIZED);

        handle.graceful_shutdown(Some(Duration::from_secs(1)));
        server.await.unwrap().unwrap();
    }

    #[test]
    fn request_authority_accepts_http1_host_and_http2_uri_authority() {
        let expected = "192.168.1.22:44000";
        let http1 = Request::builder()
            .uri("/health")
            .header(header::HOST, expected)
            .body(axum::body::Body::empty())
            .unwrap();
        assert!(request_authority_matches(&http1, expected));

        let http2 = Request::builder()
            .uri(format!("https://{expected}/health"))
            .body(axum::body::Body::empty())
            .unwrap();
        assert!(request_authority_matches(&http2, expected));

        let conflicting = Request::builder()
            .uri(format!("https://{expected}/health"))
            .header(header::HOST, "attacker.example")
            .body(axum::body::Body::empty())
            .unwrap();
        assert!(!request_authority_matches(&conflicting, expected));

        let missing = Request::builder()
            .uri("/health")
            .body(axum::body::Body::empty())
            .unwrap();
        assert!(!request_authority_matches(&missing, expected));
    }

    #[test]
    fn mobile_assets_have_no_inline_or_query_bootstrap() {
        assert!(MOBILE_HTML.contains("<script src=\"./app.js\" defer></script>"));
        assert!(!MOBILE_HTML.contains("<script>"));
        assert!(!MOBILE_HTML.contains("__ATELIER_BOOTSTRAP__"));
        assert!(!MOBILE_HTML.contains("http://") && !MOBILE_HTML.contains("https://"));
        assert!(MOBILE_CSP.contains("script-src 'self'"));
        assert!(!MOBILE_CSP.contains("script-src 'unsafe-inline'"));
        assert!(MOBILE_JS.contains("URLSearchParams"));
        assert!(MOBILE_JS.contains("history.replaceState"));
        assert!(!MOBILE_JS.contains("innerHTML"));
        assert!(!MOBILE_JS.contains("document.write"));
    }

    #[test]
    fn session_followup_rate_limit_is_bounded_per_device() {
        let device_id = Uuid::new_v4().to_string();
        for offset in 0..SESSION_FOLLOWUP_RATE_LIMIT {
            assert!(rate_limit_allows(&device_id, 1_000 + offset as u64).is_ok());
        }
        assert!(rate_limit_allows(&device_id, 2_000).is_err());
        assert!(rate_limit_allows(&device_id, 1_000 + SESSION_FOLLOWUP_RATE_WINDOW_MS).is_ok());
    }
}
