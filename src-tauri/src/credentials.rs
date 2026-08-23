// 사용자 구독·API 자격증명 관리.
// macOS: Keychain / Windows: Credential Manager (keyring crate가 OS 네이티브 보안 저장소 사용).
// 평문 디스크 저장 금지. profiles JSON에는 boolean 플래그만.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::Entry;
use once_cell::sync::Lazy;
use portable_pty::{ChildKiller, CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Output, Stdio};
use std::sync::{Arc, Mutex, MutexGuard, TryLockError};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime, Url};

const SERVICE: &str = "com.atelier.app";
// OAuth authorize URLs can exceed several hundred characters. A normal
// 80/120-column PTY may hard-wrap the query string and truncate redirect_uri,
// state, or PKCE parameters before Atelier can open the URL.
const OAUTH_LOGIN_PTY_COLS: u16 = 2048;
const CODEX_DEVICE_AUTH_URL: &str = "https://auth.openai.com/codex/device";
const CLAUDE_CODE_PACKAGE: &str = "@anthropic-ai/claude-code@2.1.217";
const CODEX_PACKAGE: &str = "@openai/codex@0.145.0";
#[cfg(not(target_os = "macos"))]
const BUN_PACKAGE: &str = "bun@1.3.14";
const GAJAE_CODE_PACKAGE: &str = "gajae-code@0.14.0";
const BUN_VERSION: &str = "1.3.14";
const GAJAE_CODE_VERSION: &str = "0.14.0";
const GROK_VERSION: &str = "1.0.4";
// PEP 508 direct reference에 `[anthropic]` extra를 포함하는 이유:
// 관리형 런타임(uv tool env)은 재프로비저닝 때 receipt(uv-receipt.toml) 기준으로
// 환경을 재작성하므로, 밖에서 심은 패키지는 전부 되돌려진다(260803 실측).
// 따라서 anthropic 의존성은 설치 spec 자체에 들어가야 하고, 버전은 hermes 자신의
// pyproject extra 핀(anthropic==0.87.0)을 따른다 — 여기 별도 핀을 두면 N-copy 드리프트.
const HERMES_GIT_SPEC: &str =
    "hermes-agent[anthropic] @ git+https://github.com/NousResearch/hermes-agent.git@3ef6bbd201263d354fd83ec55b3c306ded2eb72a";
const HERMES_COMMIT: &str = "3ef6bbd201263d354fd83ec55b3c306ded2eb72a";
const UV_BOOTSTRAP_VERSION: &str = "0.10.12";
const MANAGED_RUNTIME_RECEIPT_SCHEMA: u32 = 2;
const MANAGED_RUNTIME_POLICY_VERSION: &str = "atelier-managed-basic-auto-v1";
const MANAGED_SKILL_BOOTSTRAP_VERSION: &str = "atelier-default-skills-integrity-v2";
const MANAGED_RUNTIME_CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const MANAGED_RUNTIME_LOCK_WAIT: Duration = Duration::from_secs(21 * 60);
const MANAGED_RECEIPT_MAX_BYTES: u64 = 64 * 1024;
const CODEX_AUTH_MAX_BYTES: u64 = 64 * 1024;
const CODEX_ACCESS_TOKEN_MAX_BYTES: usize = 32 * 1024;
const CODEX_ACCESS_TOKEN_MIN_FRESHNESS_SECONDS: i64 = 60;
const MANAGED_HERMES_CODEX_REFRESH_MARKER: &str = "atelier-access-only-no-refresh";
const MANAGED_HERMES_CODEX_AUTH_MODE: &str = "atelier_access_only";
const HERMES_SKILL_MANIFEST_MAX_BYTES: u64 = 1024 * 1024;
const HERMES_SKILL_MANIFEST_MAX_ENTRIES: usize = 4096;
const MANAGED_SKILL_TREE_MAX_FILES: usize = 65_536;
const MANAGED_SKILL_TREE_MAX_BYTES: u64 = 256 * 1024 * 1024;
const MANAGED_SKILL_TREE_MAX_DEPTH: usize = 32;
const HERMES_BUNDLED_SOURCE_DIRECTORY: &str = "bundled";
const HERMES_BUNDLED_SOURCE_MANIFEST: &str = ".atelier-bundled-skills.sha256.json";
const HERMES_BUNDLED_SOURCE_SCHEMA: u32 = 1;
const HERMES_GIT_CACHE_SCAN_MAX_ENTRIES: usize = 4096;
const HERMES_GIT_CACHE_SCAN_MAX_DEPTH: usize = 6;
const HERMES_GIT_OUTPUT_MAX_BYTES: usize = 8 * 1024 * 1024;
const GAJAE_SKILL_INTEGRITY_MANIFEST: &str = ".atelier-default-skills.sha256.json";
const GAJAE_SKILL_INTEGRITY_SCHEMA: u32 = 1;
const GAJAE_DEFAULT_SKILLS: [&str; 4] = ["deep-interview", "ralplan", "team", "ultragoal"];
// Primary release provenance:
// https://releases.astral.sh/github/uv/releases/download/0.10.12/
// https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/SHASUMS256.txt
const UV_MACOS_AARCH64_SHA256: &str =
    "ae738b5661a900579ec621d3918c0ef17bdec0da2a8a6d8b161137cd15f25414";
const UV_MACOS_X86_64_SHA256: &str =
    "17443e293f2ae407bb2d8d34b875ebfe0ae01cf1296de5647e69e7b2e2b428f0";
const BUN_MACOS_AARCH64_SHA256: &str =
    "d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620";
const BUN_MACOS_X86_64_SHA256: &str =
    "4183df3374623e5bab315c547cfa0974533cd457d86b73b639f7a87974cd6633";
// Official xAI stable binaries from https://x.ai/cli, verified on 2026-08-18.
const GROK_MACOS_AARCH64_SHA256: &str =
    "39366f7756a090b735cc1df8c93a8c0c3c7871555cf6cbb28f9351ca82936485";
const GROK_MACOS_X86_64_SHA256: &str =
    "990bc39a82de9bcfcbab77786c85794c61302f3b253994b58f65f418201a04b5";
const CLI_INSTALL_TIMEOUT: Duration = Duration::from_secs(20 * 60);
const CLI_INSTALL_CAPTURE_LIMIT: usize = 64 * 1024;

static HERMES_RUNTIME_INSTALL_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static GAJAE_RUNTIME_INSTALL_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static GROK_RUNTIME_INSTALL_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static MANAGED_HERMES_CODEX_STAGE_COUNTS: Lazy<Mutex<HashMap<PathBuf, usize>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedAgentRuntimeReadiness {
    pub provider: String,
    pub ready: bool,
    pub repaired: bool,
    pub executable: String,
    pub provider_root: String,
    pub home_dir: String,
    pub state_dir: String,
    pub cache_dir: String,
    pub temp_dir: String,
    pub skills_dir: String,
    pub workspace_dir: Option<String>,
    pub runtime_pin: String,
    pub dependency_pin: Option<String>,
    pub policy_version: String,
    pub skill_bootstrap_version: String,
    pub receipt_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedAgentRuntimeProgress {
    provider: String,
    state: String,
    message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ManagedRuntimeReceipt {
    schema_version: u32,
    provider: String,
    runtime_pin: String,
    dependency_pin: Option<String>,
    policy_version: String,
    skill_bootstrap_version: String,
    executable: String,
    skills_dir: String,
    verified_skill_count: usize,
}

#[derive(Clone, Debug)]
struct ManagedRuntimeLayout {
    provider: &'static str,
    root: PathBuf,
    home: PathBuf,
    state: PathBuf,
    cache: PathBuf,
    temp: PathBuf,
    skills: PathBuf,
    workspace: Option<PathBuf>,
    receipt: PathBuf,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ManagedSkillFileHash {
    path: String,
    sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ManagedSkillIntegrityManifest {
    schema_version: u32,
    provider: String,
    runtime_pin: String,
    files: Vec<ManagedSkillFileHash>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct HermesGitTreeEntry {
    path: String,
    object_id: String,
    size: u64,
}

enum OAuthLoginInput {
    Process(ChildStdin),
    Pty(Box<dyn Write + Send>),
}

impl OAuthLoginInput {
    fn writer(&mut self) -> &mut dyn Write {
        match self {
            OAuthLoginInput::Process(stdin) => stdin,
            OAuthLoginInput::Pty(writer) => writer.as_mut(),
        }
    }

    /// 파이프 stdin 은 canonical 입력이라 LF 가 곧 한 줄의 끝이다. 반면 PTY 로 붙은
    /// 로그인 TUI 는 raw 모드(-icanon)라 LF 에 대응하는 키가 없고, Enter 키가 실제로
    /// 보내는 바이트는 CR 하나다. 여기서 분기를 잃으면 코드 글자는 들어가는데 제출만
    /// 성립하지 않아, 쓰기는 성공했는데 CLI 는 영원히 대기하는 무증상 실패가 된다.
    fn submit_terminator(&self) -> &'static [u8] {
        match self {
            OAuthLoginInput::Process(_) => b"\n",
            OAuthLoginInput::Pty(_) => b"\r",
        }
    }

    /// raw TUI 입력기는 읽어 들인 청크 하나를 키 이벤트 하나로 해석한다. 코드와 CR 을
    /// 한 번에 쓰면 `"코드\r"` 이 통째로 문자 입력으로 잡혀 Enter 가 사라질 수 있다.
    /// CR 은 별도 write 로 보내 자기 청크를 갖게 한다.
    fn submit_needs_detached_enter(&self) -> bool {
        matches!(self, OAuthLoginInput::Pty(_))
    }
}

static OAUTH_LOGIN_STDIN: Lazy<Mutex<HashMap<String, OAuthLoginInput>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// 살아 있는 로그인 child 를 종료할 수 있는 손잡이. PTY 는 killer 를, 파이프 경로는
/// pid 를 들고 있다가 새 시도가 시작될 때 이전 시도를 먼저 끝내는 데 쓴다.
enum OAuthLoginTerminator {
    Pty(Box<dyn ChildKiller + Send + Sync>),
    Process(u32),
}

static OAUTH_LOGIN_CHILD: Lazy<Mutex<HashMap<String, OAuthLoginTerminator>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// 같은 프로바이더에 새 로그인이 시작되면 이전 시도의 백그라운드 감시·종료 처리는
/// 더 이상 화면의 진실이 아니다. 세대 번호가 어긋난 쓰기는 전부 버려서, 죽인 옛
/// 프로세스의 종료 코드가 방금 시작한 시도의 실패로 둔갑하지 않게 한다.
static OAUTH_LOGIN_EPOCH: Lazy<Mutex<HashMap<String, u64>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Default)]
struct OAuthLoginRuntimeState {
    active: bool,
    browser_opened: bool,
    login_url: Option<String>,
    output: String,
    error: Option<String>,
    /// 코드 전달 횟수. 감시 스레드가 자기가 지켜보던 그 제출인지 판별하는 데 쓴다.
    submit_seq: u64,
    submit_warning: Option<String>,
    updated_at_ms: i64,
}

static OAUTH_LOGIN_RUNTIME: Lazy<Mutex<HashMap<String, OAuthLoginRuntimeState>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// 이번 로그인에서 이미 브라우저로 넘어간 URL. 로그인 URL 을 감지하는 경로가 여럿이고
/// (선힌트 · 본 폴링 루프 · 90초 지연 감시자) 각자 독립적으로 열기 때문에, 같은 URL 을
/// 두 번 열면 곧바로 창 두 개가 된다. "누가 먼저 잡았는가"를 URL 단위로 기록해 자동
/// 오픈 경로 전체가 한 번만 열도록 한다. 사용자가 직접 누르는 버튼은 이 기록을 보지 않는다.
static OAUTH_AUTO_OPENED_LOGIN_URLS: Lazy<Mutex<HashMap<String, HashSet<String>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// 로그인 캡처 버퍼(`capture_login_pipe`)는 64KB 슬라이딩 윈도우다 — 넘치면 앞을 버린다.
/// 그래서 **스트림에 딱 한 번 지나가는 신호**를 "버퍼를 다시 훑어" 판정하면, 뒤이은 TUI
/// 프레임이 그 줄을 창밖으로 밀어내는 순간 판정이 true 에서 false 로 되돌아간다. 1회성
/// 신호는 절단되지 않는 지점 — 바이트가 흘러가는 그 순간 — 에서 관측해 여기 래치로 남긴다.
///
/// 판정 지점의 경계(이 파일 전체에 적용되는 규칙):
/// - **지속 상태 = 래치.** 한 번 성립하면 이후 화면이 무엇이든 참으로 남아야 하는 사건.
///   (CLI 자기-오픈 신호 · 로그인 URL · setup-token)
/// - **최신 화면 = 매번 재판정.** 지금 화면이 곧 답인 뷰. 절단은 오래된 부분만 버리므로
///   오히려 원하는 동작이다. (`login_failure_detail_text` 진단 출력 · 종료 직전 실패 사유)
#[derive(Default)]
struct OAuthLoginStreamLatch {
    /// CLI 가 "브라우저를 열었다"고 스스로 알린 신호. macOS 에선 그 창을 별도 프로세스
    /// (`$BROWSER=/usr/bin/open`)가 열기 때문에 URL 중복 기록으로는 원리적으로 관측할 수
    /// 없다. 이 래치가 폴백 URL 을 또 여는 두 창 증상을 막는 유일한 방어다.
    cli_opened_browser: bool,
    /// 로그인 URL 은 CLI 가 한 번만 찍는다. 폴링(80ms)보다 프레임이 빨리 밀리면 버퍼에서
    /// 사라질 수 있어 최초 관측값을 붙잡아 둔다.
    login_url: Option<String>,
    /// setup-token 도 한 번만 찍힌다. 값이라 소비 시점에 꺼내 간다 — 비밀을 전역에 오래
    /// 들고 있지 않기 위해서다.
    claude_setup_token: Option<String>,
}

static OAUTH_LOGIN_STREAM_LATCH: Lazy<Mutex<HashMap<String, OAuthLoginStreamLatch>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[cfg(target_os = "windows")]
fn configure_background_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_background_command(_: &mut Command) {}

fn cli_command(cli: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        crate::agent_process::command_for_cli(cli)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut command = Command::new(cli);
        configure_background_command(&mut command);
        command
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
struct CredentialState {
    oauth_logged_in: bool,
    api_key_present: bool,
    api_key_masked: String,
    updated_at: Option<String>,
}

#[derive(Default, Deserialize, Serialize)]
struct CredentialStateFile {
    providers: HashMap<String, CredentialState>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClaudeSubscriptionOauthCredential {
    pub access: String,
    pub refresh: Option<String>,
    pub expires: Option<i64>,
    pub scopes: Option<String>,
    pub subscription_type: Option<String>,
}

impl ClaudeSubscriptionOauthCredential {
    #[allow(dead_code)]
    pub fn access_is_fresh(&self) -> bool {
        let Some(expires) = self.expires else {
            return true;
        };
        expires > chrono::Utc::now().timestamp_millis() + 60_000
    }
}

#[derive(Debug, Deserialize)]
struct CodexAuthSession {
    auth_mode: String,
    tokens: CodexAccessTokens,
}

#[derive(Debug, Deserialize)]
struct CodexAccessTokens {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct CodexJwtHeader {
    alg: String,
}

#[derive(Debug, Deserialize)]
struct CodexJwtClaims {
    exp: i64,
}

/// Provider metadata. Claude/Codex support subscription OAuth and API keys;
/// Linear uses a personal API key and has no local CLI process.
/// 모델 구독으로 실제 턴을 돌릴 수 있는 자격증명들. linear(도구 연동)나
/// hermes/gajecode(하네스 자체 — 이 구독들을 소비하는 쪽)는 대상이 아니다.
const SUBSCRIPTION_PROVIDERS: [(&str, &str); 5] = [
    ("claude", "Claude"),
    ("codex", "Codex"),
    ("alibaba", "Alibaba Token Plan"),
    ("openrouter", "OpenRouter"),
    ("grok", "Grok"),
];

/// 지금 실제로 연결되어 있는 구독의 표시명 목록 (`exclude` 는 제외).
///
/// why: 한 구독이 소진됐을 때 "다른 걸로 갈아타세요"라고만 하면 대표님이 어디로
/// 갈아탈지 직접 찾아야 한다. 연결 안 된 구독을 제안하면 더 나쁘다 — 갈아탄
/// 다음에야 못 쓴다는 걸 알게 된다. 그래서 제안 목록은 항상 실측 연결 상태에서
/// 뽑는다. (260804)
pub fn connected_subscription_labels(exclude: &str) -> Vec<String> {
    SUBSCRIPTION_PROVIDERS
        .iter()
        .filter(|(id, _)| *id != exclude)
        .filter(|(id, _)| {
            let Some(meta) = provider_meta(id) else {
                return false;
            };
            (meta.supports_oauth && detect_oauth(id)) || read_api_key(id).is_some()
        })
        .map(|(_, label)| (*label).to_string())
        .collect()
}

fn provider_meta(provider: &str) -> Option<ProviderMeta> {
    match provider {
        "claude" => Some(ProviderMeta {
            cli: Some("claude"),
            login_cmd: Some("login"),
            env_var: Some("ANTHROPIC_API_KEY"),
            supports_oauth: true,
            supports_api: true,
        }),
        "codex" => Some(ProviderMeta {
            cli: Some("codex"),
            login_cmd: Some("login"),
            env_var: Some("OPENAI_API_KEY"),
            supports_oauth: true,
            supports_api: true,
        }),
        "openrouter" => Some(ProviderMeta {
            cli: None,
            login_cmd: None,
            env_var: Some("OPENROUTER_API_KEY"),
            supports_oauth: false,
            supports_api: true,
        }),
        "alibaba" => Some(ProviderMeta {
            cli: None,
            login_cmd: None,
            env_var: Some("DASHSCOPE_API_KEY"),
            supports_oauth: false,
            supports_api: true,
        }),
        "linear" => Some(ProviderMeta {
            cli: None,
            login_cmd: None,
            env_var: None,
            supports_oauth: false,
            supports_api: true,
        }),
        "hermes" => Some(ProviderMeta {
            cli: Some("hermes"),
            login_cmd: None,
            env_var: None,
            supports_oauth: false,
            supports_api: false,
        }),
        "gajecode" => Some(ProviderMeta {
            cli: Some(gajecode_cli_name()),
            login_cmd: None,
            env_var: None,
            supports_oauth: false,
            supports_api: false,
        }),
        "grok" => Some(ProviderMeta {
            cli: Some("grok"),
            login_cmd: Some("login"),
            env_var: Some("XAI_API_KEY"),
            supports_oauth: true,
            supports_api: true,
        }),
        _ => None,
    }
}

fn oauth_login_attempts(provider: &str, fallback_cmd: &'static str) -> Vec<Vec<&'static str>> {
    match provider {
        "claude" => claude_oauth_login_attempts(),
        // Device authorization is deterministic across packaged Windows apps:
        // the CLI prints a stable HTTPS URL and one-time code that Atelier can
        // surface even when the default browser handoff is restricted.
        "codex" => vec![vec!["login", "--device-auth"], vec![fallback_cmd]],
        "grok" => vec![
            vec!["login", "--device-auth"],
            vec!["login", "--oauth"],
            vec![fallback_cmd],
        ],
        _ => vec![vec![fallback_cmd]],
    }
}

fn claude_oauth_login_attempts() -> Vec<Vec<&'static str>> {
    // setup-token is Anthropic's documented automation bridge. It emits an
    // inference-only token without saving it into Claude Code's credential
    // store, so Atelier never needs to read or refresh another app's session.
    vec![vec!["setup-token"], vec!["auth", "login", "--claudeai"]]
}

fn oauth_login_uses_pty(provider: &str) -> bool {
    matches!(provider, "claude" | "codex")
}

fn oauth_login_url_hint(provider: &str, login_args: &[&str]) -> Option<&'static str> {
    (provider == "codex" && login_args.contains(&"--device-auth")).then_some(CODEX_DEVICE_AUTH_URL)
}

fn oauth_browser_probe_url(provider: &str) -> Option<&'static str> {
    match provider {
        "codex" => Some(CODEX_DEVICE_AUTH_URL),
        "claude" => Some("https://claude.ai"),
        _ => None,
    }
}

fn oauth_browser_handoff_contract() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "provider default browser + Atelier URL watcher -> WinRT Launcher -> COM STA / ShellExecuteExW -> explorer.exe -> FileProtocolHandler"
    }
    #[cfg(target_os = "macos")]
    {
        "/usr/bin/open"
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        "xdg-open"
    }
}

fn perform_oauth_browser_probe(provider: &str) -> Result<ProviderBrowserProbeResult, String> {
    let provider = provider.trim().to_ascii_lowercase();
    let url = oauth_browser_probe_url(&provider)
        .ok_or_else(|| format!("unsupported browser probe provider: {provider}"))?;
    if !is_provider_login_url(&provider, url) {
        return Err("browser probe URL failed the provider allowlist".into());
    }
    if !open_login_url_in_browser(url) {
        return Err("native browser handoff failed".into());
    }
    Ok(ProviderBrowserProbeResult {
        provider,
        url: url.to_string(),
        handoff: oauth_browser_handoff_contract().to_string(),
        accepted: true,
        checked_at_ms: oauth_runtime_now_ms(),
    })
}

pub(crate) fn open_oauth_browser_probe(provider: &str) -> Result<(), String> {
    perform_oauth_browser_probe(provider).map(|_| ())
}

#[tauri::command]
pub async fn provider_oauth_browser_probe(
    provider: String,
) -> Result<ProviderBrowserProbeResult, String> {
    tauri::async_runtime::spawn_blocking(move || perform_oauth_browser_probe(&provider))
        .await
        .map_err(|error| format!("browser probe thread join: {error}"))?
}

fn redact_login_output(text: &str) -> String {
    // 로그인 CLI 는 Ink TUI 라 커서 이동·색상·화면 지우기 제어문자를 끝없이 쏟는다.
    // 그대로 화면에 올리면 사람이 읽을 수 없는 문자 더미가 되어, 실패 사유가 도달은
    // 했는데 아무도 못 읽는 상태가 된다. TUI 는 CR 로 같은 줄을 덮어써서 프레임을
    // 그리므로 CR 도 줄바꿈으로 펴고, 바로 뒤따르는 같은 프레임은 접는다.
    let plain = strip_ansi_sequences(text).replace('\r', "\n");
    let mut lines: Vec<String> = Vec::new();
    for line in plain.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let lower = line.to_ascii_lowercase();
        let rendered = if line.contains("://") {
            "[login url redacted]".to_string()
        } else if lower.contains("sk-ant-oat")
            || lower.contains("access_token")
            || lower.contains("refresh_token")
            || lower.contains("id_token")
            || lower.contains("client_secret")
        {
            "[credential output redacted]".to_string()
        } else {
            line.to_string()
        };
        if lines.last().is_some_and(|previous| *previous == rendered) {
            continue;
        }
        lines.push(rendered);
    }
    lines.join("\n")
}

/// **최신 화면 판정** — 1회성 신호가 아니므로 래치하지 않는다. 진단 출력과 실패 사유는
/// "지금 화면에 무엇이 있는가"가 곧 답이고, 실패 문구는 종료 직전 꼬리에 찍혀 캡처 버퍼의
/// 절단(앞부분 폐기)에 오히려 안전하다. 호출부는 매번 버퍼를 다시 읽는 것이 맞다.
fn login_failure_detail_text(text: &str) -> String {
    let detail = redact_login_output(text);
    let replacement_count = detail.chars().filter(|c| *c == '\u{fffd}').count();
    if replacement_count >= 3 {
        return "The CLI returned unreadable non-UTF-8 error output. Update the Claude Code CLI, then try the subscription sign-in again.".to_string();
    }
    if detail.chars().count() <= 1200 {
        detail
    } else {
        format!(
            "{}\n... output truncated ...",
            detail.chars().take(1200).collect::<String>()
        )
    }
}

fn oauth_runtime_now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn start_oauth_login_runtime(provider: &str) {
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        map.insert(
            provider.to_string(),
            OAuthLoginRuntimeState {
                active: true,
                updated_at_ms: oauth_runtime_now_ms(),
                ..Default::default()
            },
        );
    }
}

fn finish_oauth_login_runtime(provider: &str) {
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        entry.active = false;
        // 로그인이 끝난 뒤에도 "코드가 전달되지 않은 것 같습니다"가 남으면 성공한
        // 화면 위에 거짓 경고가 겹친다.
        entry.submit_warning = None;
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

fn oauth_login_epoch_map() -> MutexGuard<'static, HashMap<String, u64>> {
    OAUTH_LOGIN_EPOCH
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn begin_oauth_login_epoch(provider: &str) -> u64 {
    let epoch = {
        let mut map = oauth_login_epoch_map();
        let epoch = map.entry(provider.to_string()).or_insert(0);
        *epoch = epoch.wrapping_add(1);
        *epoch
    };
    // 세대 전환이 곧 "새 로그인 시작"이다. 1회성 신호 래치가 꺼지는 유일한 지점 —
    // 지난 시도의 신호가 남으면 이번 URL 이 한 번도 안 열리거나 옛 토큰이 이번 결과로
    // 둔갑한다. 잠금은 반드시 epoch → latch 순서로만 잡는다(관측자와 같은 순서).
    reset_oauth_login_stream_latch(provider);
    epoch
}

fn oauth_login_stream_latches() -> MutexGuard<'static, HashMap<String, OAuthLoginStreamLatch>> {
    OAUTH_LOGIN_STREAM_LATCH
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn reset_oauth_login_stream_latch(provider: &str) {
    oauth_login_stream_latches().remove(provider);
}

fn latch_cli_opened_browser(provider: &str) {
    oauth_login_stream_latches()
        .entry(provider.to_string())
        .or_default()
        .cli_opened_browser = true;
}

/// 절단에 먹히지 않는 정본 판정. `cli_opened_browser_itself` 의 버퍼 재검사는 관측자가
/// 아직 붙지 않은 경로를 위한 보조일 뿐이다.
fn cli_self_opened_browser_latched(provider: &str) -> bool {
    oauth_login_stream_latches()
        .get(provider)
        .is_some_and(|latch| latch.cli_opened_browser)
}

fn latch_login_url(provider: &str, url: &str) {
    oauth_login_stream_latches()
        .entry(provider.to_string())
        .or_default()
        .login_url = Some(url.to_string());
}

fn latched_login_url(provider: &str) -> Option<String> {
    oauth_login_stream_latches()
        .get(provider)
        .and_then(|latch| latch.login_url.clone())
}

fn latch_claude_setup_token(provider: &str, token: &str) {
    oauth_login_stream_latches()
        .entry(provider.to_string())
        .or_default()
        .claude_setup_token = Some(token.to_string());
}

/// 토큰은 값이라 복사본을 남기지 않는다. 한 번 회수되면 래치에서 사라진다.
fn take_latched_claude_setup_token(provider: &str) -> Option<String> {
    oauth_login_stream_latches()
        .get_mut(provider)
        .and_then(|latch| latch.claude_setup_token.take())
}

/// 로그인 URL 도 스트림에 한 번 지나가는 신호다. 최신 버퍼를 먼저 보고(같은 시도 안에서
/// 더 완전한 형태가 뒤늦게 도착할 수 있다), 절단으로 사라졌으면 래치가 이어받는다.
fn detected_provider_login_url(provider: &str, output: &str) -> Option<String> {
    extract_provider_login_url(provider, output).or_else(|| latched_login_url(provider))
}

fn current_oauth_login_epoch(provider: &str) -> u64 {
    oauth_login_epoch_map().get(provider).copied().unwrap_or(0)
}

fn oauth_login_epoch_is_current(provider: &str, epoch: u64) -> bool {
    current_oauth_login_epoch(provider) == epoch
}

/// 지난 시도의 실패 사유를 남겨두면, 이번에 성공한 확인 결과 위로 옛 오류가 다시
/// 떠올라 "연결됐는데 실패로 보이는" 화면이 된다. 새 판정 전에 흔적을 지운다.
fn clear_oauth_login_runtime(provider: &str) {
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        map.remove(provider);
    }
}

fn fail_oauth_login_runtime(provider: &str, error: String) {
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        entry.active = false;
        entry.error = Some(error);
        // 확정된 실패 사유가 있으면 추정성 경고는 물러난다.
        entry.submit_warning = None;
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

/// 코드 전달 시각을 기록하고 이번 제출의 일련번호를 돌려준다. 이전 제출을 지켜보던
/// 감시 스레드는 번호가 바뀐 것을 보고 조용히 물러난다.
fn note_oauth_code_submitted(provider: &str) -> u64 {
    let mut map = match OAUTH_LOGIN_RUNTIME.lock() {
        Ok(map) => map,
        Err(poisoned) => poisoned.into_inner(),
    };
    let entry = map.entry(provider.to_string()).or_default();
    entry.submit_seq = entry.submit_seq.wrapping_add(1);
    entry.submit_warning = None;
    entry.updated_at_ms = oauth_runtime_now_ms();
    entry.submit_seq
}

fn warn_oauth_code_submit_stalled(provider: &str, submit_seq: u64) {
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        // 그 사이에 끝났거나, 실패 사유가 확정됐거나, 더 최근 제출이 있으면 침묵한다.
        if !entry.active || entry.error.is_some() || entry.submit_seq != submit_seq {
            return;
        }
        entry.submit_warning = Some(OAUTH_CODE_SUBMIT_STALLED.to_string());
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

/// 쓰기가 성공했다는 사실은 "제출됐다"는 뜻이 아니다. Enter 가 성립하지 않으면 CLI 는
/// 그대로 대기하고 화면에는 아무 변화도 없어서, 사용자는 멀쩡한 코드를 몇 번이고 다시
/// 붙여넣게 된다. 유예 시간 안에 로그인이 끝나지 않으면 그 가능성을 먼저 말해 준다.
const OAUTH_CODE_SUBMIT_GRACE: Duration = Duration::from_secs(10);

const OAUTH_CODE_SUBMIT_STALLED: &str =
    "인증 코드를 전달한 뒤 10초 동안 CLI 응답이 없습니다. 코드가 전달되지 않았을 수 있습니다. 브라우저에 표시된 코드를 다시 복사해 한 번 더 전달하거나, 구독 로그인을 다시 시작해 주세요.";

fn spawn_oauth_code_submit_watchdog(provider: String, epoch: u64, submit_seq: u64) {
    thread::spawn(move || {
        let started = Instant::now();
        while started.elapsed() < OAUTH_CODE_SUBMIT_GRACE {
            if !oauth_login_epoch_is_current(&provider, epoch) {
                return;
            }
            let snapshot = oauth_login_runtime_snapshot(&provider);
            if !snapshot.active || snapshot.error.is_some() || snapshot.submit_seq != submit_seq {
                return;
            }
            thread::sleep(Duration::from_millis(250));
        }
        if !oauth_login_epoch_is_current(&provider, epoch) {
            return;
        }
        warn_oauth_code_submit_stalled(&provider, submit_seq);
    });
}

fn oauth_login_error(provider: &str, error: String) -> String {
    fail_oauth_login_runtime(provider, error.clone());
    error
}

fn remember_oauth_browser_opened(provider: &str, opened: bool) {
    if !opened {
        return;
    }
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        entry.browser_opened = true;
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

fn remember_oauth_login_url(provider: &str, url: &str) {
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        entry.login_url = Some(url.to_string());
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

fn refresh_oauth_login_runtime(provider: &str, captured: &Arc<Mutex<String>>) {
    let raw = captured_login_output(captured);
    // URL 은 1회성 신호라 래치가 이어받는다. 반면 `output` 은 "지금 화면"이므로 매번
    // 재판정하는 것이 맞다 — 절단은 오래된 프레임만 버린다.
    let login_url = detected_provider_login_url(provider, &raw);
    let output = login_failure_detail_text(&raw).trim().to_string();
    if let Ok(mut map) = OAUTH_LOGIN_RUNTIME.lock() {
        let entry = map.entry(provider.to_string()).or_default();
        if let Some(url) = login_url {
            entry.login_url = Some(url);
        }
        entry.output = output;
        entry.updated_at_ms = oauth_runtime_now_ms();
    }
}

fn spawn_oauth_login_runtime_watcher(provider: String, captured: Arc<Mutex<String>>, epoch: u64) {
    thread::spawn(move || {
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(5 * 60) {
            // 새 시도가 시작되면 옛 시도의 캡처 버퍼를 계속 밀어 넣지 않는다.
            if !oauth_login_epoch_is_current(&provider, epoch) {
                break;
            }
            refresh_oauth_login_runtime(&provider, &captured);
            let active = OAUTH_LOGIN_RUNTIME
                .lock()
                .ok()
                .and_then(|map| map.get(&provider).map(|state| state.active))
                .unwrap_or(false);
            if !active {
                break;
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
}

fn oauth_login_runtime_snapshot(provider: &str) -> OAuthLoginRuntimeState {
    OAUTH_LOGIN_RUNTIME
        .lock()
        .ok()
        .and_then(|map| map.get(provider).cloned())
        .unwrap_or_default()
}

fn oauth_login_result_extras(provider: &str) -> (Option<String>, Option<String>) {
    let snapshot = oauth_login_runtime_snapshot(provider);
    let diagnostic = (!snapshot.output.trim().is_empty()).then_some(snapshot.output);
    (snapshot.login_url, diagnostic)
}

pub(crate) fn strip_ansi_sequences(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            if !ch.is_control() || matches!(ch, '\n' | '\r' | '\t') {
                out.push(ch);
            }
            continue;
        }

        match chars.peek().copied() {
            Some('[') => {
                chars.next();
                for code in chars.by_ref() {
                    if ('@'..='~').contains(&code) {
                        break;
                    }
                }
            }
            Some(']') => {
                chars.next();
                let mut previous = '\0';
                for code in chars.by_ref() {
                    if code == '\u{7}' || (previous == '\u{1b}' && code == '\\') {
                        break;
                    }
                    previous = code;
                }
            }
            _ => {}
        }
    }

    out
}

fn login_url_start(text: &str) -> Option<usize> {
    match (text.find("https://"), text.find("http://")) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

fn login_url_delimiter(ch: char) -> bool {
    ch.is_whitespace()
        || ch.is_control()
        || matches!(
            ch,
            '"' | '\'' | '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';'
        )
}

fn trim_login_url_candidate(candidate: &str) -> &str {
    candidate.trim_matches(|c: char| {
        matches!(
            c,
            '"' | '\'' | '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';' | '.'
        )
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LoginUrlCandidate {
    url: String,
    terminated: bool,
}

fn extract_login_url_candidate_meta(text: &str) -> Option<LoginUrlCandidate> {
    let mut offset = 0;
    while offset < text.len() {
        let search = &text[offset..];
        let Some(start_rel) = login_url_start(search) else {
            break;
        };
        let start = offset + start_rel;
        let mut end = text.len();
        let mut terminated = false;
        for (rel, ch) in text[start..].char_indices().skip(1) {
            if login_url_delimiter(ch) {
                end = start + rel;
                terminated = true;
                break;
            }
        }

        let candidate = trim_login_url_candidate(&text[start..end]);
        if candidate.starts_with("https://") || candidate.starts_with("http://") {
            return Some(LoginUrlCandidate {
                url: candidate.to_string(),
                terminated,
            });
        }

        offset = end.saturating_add(1);
    }
    None
}

#[cfg(test)]
fn extract_login_url_candidate(text: &str) -> Option<String> {
    extract_login_url_candidate_meta(text).map(|candidate| candidate.url)
}

#[cfg(test)]
fn extract_login_url(text: &str) -> Option<String> {
    // Terminal CLIs often emit clickable OSC-8 hyperlinks. The ANSI stripper
    // discards OSC payloads, so first scan the raw stream and only then scan a
    // cleaned plain-text copy.
    extract_login_url_candidate(text).or_else(|| {
        let text = strip_ansi_sequences(text);
        extract_login_url_candidate(&text)
    })
}

fn is_provider_login_url(provider: &str, url: &str) -> bool {
    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    let Some(host) = parsed.host_str().map(str::to_ascii_lowercase) else {
        return false;
    };
    let allowed_roots: &[&str] = match provider {
        "claude" => &["claude.ai", "claude.com", "anthropic.com"],
        "codex" => &["openai.com", "chatgpt.com"],
        "grok" => &["x.ai", "grok.com"],
        _ => return false,
    };
    allowed_roots
        .iter()
        .any(|root| host == *root || host.ends_with(&format!(".{root}")))
}

fn extract_provider_login_url_with_mode(
    provider: &str,
    text: &str,
    require_terminated: bool,
) -> Option<String> {
    let mut remaining = text;
    while let Some(candidate) = extract_login_url_candidate_meta(remaining) {
        if (!require_terminated || candidate.terminated)
            && is_provider_login_url(provider, &candidate.url)
        {
            return Some(candidate.url);
        }
        let Some(position) = remaining.find(&candidate.url) else {
            break;
        };
        remaining = &remaining[position + candidate.url.len()..];
    }

    let stripped = strip_ansi_sequences(text);
    let mut remaining = stripped.as_str();
    while let Some(candidate) = extract_login_url_candidate_meta(remaining) {
        if (!require_terminated || candidate.terminated)
            && is_provider_login_url(provider, &candidate.url)
        {
            return Some(candidate.url);
        }
        let Some(position) = remaining.find(&candidate.url) else {
            break;
        };
        remaining = &remaining[position + candidate.url.len()..];
    }
    None
}

fn extract_provider_login_url(provider: &str, text: &str) -> Option<String> {
    // PTY reads can split one long OAuth URL across chunks. Do not open a
    // candidate until a delimiter proves that the complete URL arrived.
    extract_provider_login_url_with_mode(provider, text, true)
}

fn extract_provider_login_url_relaxed(provider: &str, text: &str) -> Option<String> {
    extract_provider_login_url_with_mode(provider, text, false)
}

fn lock_captured(captured: &Arc<Mutex<String>>) -> std::sync::MutexGuard<'_, String> {
    // 캡처 스레드가 한 번이라도 패닉하면 이 Mutex 는 영구히 포이즌된다. 그때
    // lock() 을 Err 로 흘려보내면 이후 모든 로그인 출력이 조용히 빈 문자열이 되어
    // 토큰 추출도 실패 진단도 함께 사라진다. 버퍼를 되찾아 계속 쓴다.
    captured
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn captured_login_output(captured: &Arc<Mutex<String>>) -> String {
    lock_captured(captured).clone()
}

fn store_oauth_login_stdin(provider: &str, stdin: ChildStdin) {
    if let Ok(mut map) = OAUTH_LOGIN_STDIN.lock() {
        map.insert(provider.to_string(), OAuthLoginInput::Process(stdin));
    }
}

fn store_oauth_login_pty_writer(provider: &str, writer: Box<dyn Write + Send>) {
    if let Ok(mut map) = OAUTH_LOGIN_STDIN.lock() {
        map.insert(provider.to_string(), OAuthLoginInput::Pty(writer));
    }
}

fn store_oauth_login_terminator(provider: &str, terminator: OAuthLoginTerminator) {
    if let Ok(mut map) = OAUTH_LOGIN_CHILD.lock() {
        map.insert(provider.to_string(), terminator);
    }
}

fn forget_oauth_login_session(provider: &str) {
    if let Ok(mut map) = OAUTH_LOGIN_STDIN.lock() {
        map.remove(provider);
    }
    if let Ok(mut map) = OAUTH_LOGIN_CHILD.lock() {
        map.remove(provider);
    }
}

#[cfg(unix)]
fn terminate_oauth_login_pid(pid: u32) {
    let _ = unsafe { libc::kill(pid as i32, libc::SIGTERM) };
}

#[cfg(target_os = "windows")]
fn terminate_oauth_login_pid(pid: u32) {
    let mut command = Command::new("taskkill");
    command.args(["/PID", &pid.to_string(), "/T", "/F"]);
    configure_background_command(&mut command);
    let _ = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(any(unix, target_os = "windows")))]
fn terminate_oauth_login_pid(_: u32) {}

/// detach 이후의 종료 처리. 세대가 이미 넘어갔다면(=새 로그인이 시작됐다면) 이 시도의
/// 결과는 화면의 진실이 아니다. 특히 여기서 통로를 지우면 방금 시작한 시도의 코드 전달이
/// 끊기고, 옛 프로세스의 종료 코드가 새 시도의 실패로 둔갑한다.
fn settle_detached_oauth_login(
    provider: &str,
    epoch: u64,
    captured: &Arc<Mutex<String>>,
    failure: Option<String>,
) {
    if !oauth_login_epoch_is_current(provider, epoch) {
        return;
    }
    forget_oauth_login_session(provider);
    match failure {
        None => {
            mark_oauth_login_success(provider, captured);
            finish_oauth_login_runtime(provider);
        }
        Some(failure) => {
            log::warn!("{failure}");
            fail_oauth_login_runtime(provider, failure);
        }
    }
}

/// 이전 로그인 시도가 살아 있는 채로 새 시도를 시작하면, 코드 전달 통로는 프로바이더당
/// 하나뿐이라 뒤에 온 시도가 앞을 덮어쓴다. 그러면 브라우저에서 방금 받은 코드가 엉뚱한
/// 프로세스로 배달되고 둘 다 영원히 대기한다. 새로 시작하기 전에 앞의 것을 끝낸다.
fn terminate_stale_oauth_login(provider: &str) {
    // 죽인 프로세스의 종료 코드가 이번 시도의 실패로 보고되지 않도록 세대부터 넘긴다.
    begin_oauth_login_epoch(provider);
    // 이번 클릭은 새 URL 을 받는다. 지난 시도의 오픈 기록을 남겨두면 그 URL 이 한 번도
    // 안 열린 채로 남는다.
    forget_auto_opened_login_urls(provider);
    let terminator = OAUTH_LOGIN_CHILD
        .lock()
        .ok()
        .and_then(|mut map| map.remove(provider));
    match terminator {
        Some(OAuthLoginTerminator::Pty(mut killer)) => {
            if let Err(error) = killer.kill() {
                log::warn!("stale oauth login kill failed for {provider}: {error}");
            }
        }
        Some(OAuthLoginTerminator::Process(pid)) => terminate_oauth_login_pid(pid),
        None => {}
    }
    forget_oauth_login_session(provider);
}

/// 어느 로그인 시도의 스트림인지. 세대가 어긋나면(=새 시도가 시작됐으면) 이 스레드의
/// 관측은 더 이상 화면의 진실이 아니므로 래치에 손대지 않는다.
#[derive(Clone)]
struct LoginStreamWatch {
    provider: String,
    epoch: u64,
}

/// 신호가 청크 경계에서 쪼개져도 놓치지 않도록 직전 꼬리를 이어 붙여 본다. 로그인 URL
/// 한 줄(수백 바이트)과 ANSI 감싸기를 넉넉히 덮는 크기다.
const LOGIN_STREAM_CARRY_BYTES: usize = 8 * 1024;

/// 캡처 스레드가 바이트를 흘려보내며 1회성 신호를 관측하는 곳. 버퍼를 다시 훑지 않기
/// 때문에 뒤이은 TUI 홍수가 버퍼 앞부분을 버려도 판정이 살아남는다.
struct LoginStreamObserver {
    watch: LoginStreamWatch,
    carry: String,
    need_browser_marker: bool,
    need_login_url: bool,
    need_setup_token: bool,
    stale: bool,
}

impl LoginStreamObserver {
    fn new(watch: LoginStreamWatch) -> Self {
        Self {
            watch,
            carry: String::new(),
            need_browser_marker: true,
            need_login_url: true,
            // 토큰 판별은 `sk-ant-oat` 접두사로 걸러지므로 프로바이더를 특수하게 나누지
            // 않는다. claude 가 아니면 그냥 아무것도 걸리지 않는다.
            need_setup_token: true,
            stale: false,
        }
    }

    fn done(&self) -> bool {
        !self.need_browser_marker && !self.need_login_url && !self.need_setup_token
    }

    fn observe(&mut self, chunk: &str) {
        if self.stale || self.done() {
            return;
        }
        if !oauth_login_epoch_is_current(&self.watch.provider, self.watch.epoch) {
            // 죽은 시도의 캡처 스레드가 새 시도의 판정을 오염시키지 않게 여기서 멈춘다.
            self.stale = true;
            self.carry = String::new();
            return;
        }

        let mut window = std::mem::take(&mut self.carry);
        window.push_str(chunk);

        if self.need_browser_marker && cli_opened_browser_itself(&window) {
            latch_cli_opened_browser(&self.watch.provider);
            self.need_browser_marker = false;
        }
        if self.need_login_url {
            if let Some(url) = extract_provider_login_url(&self.watch.provider, &window) {
                latch_login_url(&self.watch.provider, &url);
                self.need_login_url = false;
            }
        }
        if self.need_setup_token {
            if let Some(token) = extract_claude_oauth_token_from_text(&window) {
                latch_claude_setup_token(&self.watch.provider, &token);
                self.need_setup_token = false;
            }
        }

        if self.done() {
            return;
        }
        let mut keep_from = window.len().saturating_sub(LOGIN_STREAM_CARRY_BYTES);
        while !window.is_char_boundary(keep_from) {
            keep_from += 1;
        }
        window.drain(..keep_from);
        self.carry = window;
    }
}

fn capture_login_pipe<R>(
    mut reader: R,
    captured: Arc<Mutex<String>>,
    watch: Option<LoginStreamWatch>,
) where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut observer = watch.map(LoginStreamObserver::new);
        let mut buf = [0_u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    // 버퍼에 넣기 **전에** 관측한다. 그래야 "URL 이 버퍼에 보이면 그보다
                    // 먼저 지나간 자기-오픈 마커는 이미 래치돼 있다"가 보장된다.
                    if let Some(observer) = observer.as_mut() {
                        observer.observe(&chunk);
                    }
                    let mut text = lock_captured(&captured);
                    text.push_str(&chunk);
                    if text.len() > 64 * 1024 {
                        // 로그인 TUI 는 스피너·박스문자 같은 멀티바이트를 쏟아낸다.
                        // 바이트 오프셋으로 그대로 자르면 문자 중간에서 패닉하고,
                        // 캡처 스레드가 죽는 순간 PTY 를 아무도 비우지 않아 CLI 가
                        // write 에서 멈춘다(=브라우저 승인 후 앱이 무반응).
                        let mut keep_from = text.len() - 32 * 1024;
                        while !text.is_char_boundary(keep_from) {
                            keep_from += 1;
                        }
                        text.drain(..keep_from);
                    }
                }
            }
        }
    });
}

fn spawn_background_null(mut command: Command) -> bool {
    configure_background_command(&mut command);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .is_ok()
}

#[cfg(target_os = "windows")]
fn windows_runtime_launch_url(url: &str) -> bool {
    use windows::core::HSTRING;
    use windows::Foundation::Uri;
    use windows::System::Launcher;
    use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_SINGLETHREADED};

    let target_url = url.to_string();
    thread::Builder::new()
        .name("atelier-oauth-browser-winrt".into())
        .spawn(move || unsafe {
            // LaunchUriAsync is the Windows-supported URI activation path for
            // both unpackaged desktop and Store applications. Keep it on a
            // dedicated WinRT STA so Tauri's async worker apartment cannot
            // affect protocol activation.
            if RoInitialize(RO_INIT_SINGLETHREADED).is_err() {
                return false;
            }
            let launched = Uri::CreateUri(&HSTRING::from(target_url))
                .and_then(|uri| Launcher::LaunchUriAsync(&uri))
                .and_then(|operation| operation.get())
                .unwrap_or(false);
            RoUninitialize();
            launched
        })
        .ok()
        .and_then(|worker| worker.join().ok())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn windows_shell_execute_url(url: &str) -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
    };
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(value: &str) -> Vec<u16> {
        OsStr::new(value).encode_wide().chain(Some(0)).collect()
    }

    let target_url = url.to_string();
    let worker = thread::Builder::new()
        .name("atelier-oauth-browser-sta".into())
        .spawn(move || {
            let operation = wide("open");
            let target = wide(&target_url);
            let mut execute = SHELLEXECUTEINFOW {
                cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
                fMask: SEE_MASK_NOASYNC,
                lpVerb: operation.as_ptr(),
                lpFile: target.as_ptr(),
                nShow: SW_SHOWNORMAL,
                ..Default::default()
            };
            unsafe {
                // Tauri async commands can run on an MTA worker. Shell URL
                // activation is moved to a fresh STA so COM initialization
                // cannot silently inherit an incompatible apartment model.
                let com_result = CoInitializeEx(
                    std::ptr::null(),
                    (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32,
                );
                if com_result < 0 {
                    return false;
                }
                let opened = ShellExecuteExW(&mut execute) != 0;
                CoUninitialize();
                opened
            }
        });

    worker
        .ok()
        .and_then(|worker| worker.join().ok())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn oauth_browser_helper_path() -> Option<PathBuf> {
    let helper = PathBuf::from("/usr/bin/open");
    helper.is_file().then_some(helper)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn oauth_browser_helper_path() -> Option<PathBuf> {
    ["/usr/bin/xdg-open", "/bin/xdg-open"]
        .into_iter()
        .map(PathBuf::from)
        .find(|path| path.is_file())
}

fn configure_login_browser_env_for_command(command: &mut Command) {
    #[cfg(target_os = "windows")]
    command.env_remove("BROWSER");
    #[cfg(not(target_os = "windows"))]
    if let Some(helper) = oauth_browser_helper_path() {
        command.env("BROWSER", helper);
    }
    command.env("ATELIER_OAUTH_BROWSER", "1");
}

fn configure_login_browser_env_for_pty(cmd: &mut CommandBuilder) {
    #[cfg(target_os = "windows")]
    cmd.env_remove("BROWSER");
    #[cfg(not(target_os = "windows"))]
    if let Some(helper) = oauth_browser_helper_path() {
        cmd.env("BROWSER", helper.to_string_lossy().into_owned());
    }
    cmd.env("ATELIER_OAUTH_BROWSER", "1");
}

fn open_login_url_in_browser(url: &str) -> bool {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        if windows_runtime_launch_url(url) {
            return true;
        }
        if windows_shell_execute_url(url) {
            return true;
        }
        let mut explorer = Command::new("explorer.exe");
        explorer.arg(url);
        if spawn_background_null(explorer) {
            return true;
        }
        let mut rundll32 = Command::new("rundll32.exe");
        rundll32.args(["url.dll,FileProtocolHandler", url]);
        if spawn_background_null(rundll32) {
            return true;
        }
        false
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg(url);
        spawn_background_null(command)
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        return spawn_background_null(command);
    }
}

/// CLI 가 "브라우저를 열었다"고 스스로 알린 문구들. 실측(claude CLI)에서는
/// `Opening browser to sign in...` 이 먼저 찍히고, 그 다음에 **브라우저가 안 열렸을 때를
/// 위한** 폴백 URL 이 찍힌다. 그 폴백 URL 을 확인 없이 여는 것이 창 두 개의 원인이었다.
const CLI_SELF_OPENED_BROWSER_MARKERS: &[&str] = &[
    "opening browser",
    "opening a browser",
    "opening the browser",
    "opening your browser",
    "opening default browser",
    "opening your default browser",
];

/// TUI 출력은 ANSI 제어문자로 덮여 있고 좁은 프레임에서 문구가 줄바꿈으로 쪼개진다.
/// 제어문자를 걷어내고 공백을 하나로 눌러 붙인 뒤에 판정해야 문구가 실제로 걸린다.
fn cli_opened_browser_itself(output: &str) -> bool {
    let plain = strip_ansi_sequences(output).to_ascii_lowercase();
    let normalized = plain.split_whitespace().collect::<Vec<_>>().join(" ");
    CLI_SELF_OPENED_BROWSER_MARKERS
        .iter()
        .any(|marker| normalized.contains(marker))
}

fn auto_opened_login_urls() -> MutexGuard<'static, HashMap<String, HashSet<String>>> {
    OAUTH_AUTO_OPENED_LOGIN_URLS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 이 URL 을 열 권한을 이번 호출이 가져가는지 판정한다. 검사와 기록이 같은 잠금 안에서
/// 일어나야 본 루프와 지연 감시자가 동시에 같은 URL 을 집었을 때도 하나만 연다.
fn claim_login_url_open(provider: &str, url: &str) -> bool {
    auto_opened_login_urls()
        .entry(provider.to_string())
        .or_default()
        .insert(url.to_string())
}

/// 열기에 실패했으면 권한을 돌려놓는다. 그러지 않으면 뒤이은 감시자가 "이미 열렸다"고
/// 믿고 물러나 브라우저가 한 번도 안 열린 채로 남는다.
fn release_login_url_claim(provider: &str, url: &str) {
    if let Some(urls) = auto_opened_login_urls().get_mut(provider) {
        urls.remove(url);
    }
}

/// 사용자가 직접 연 URL 도 기록해 둔다. 뒤늦게 깨어난 자동 오픈 경로가 같은 URL 을 또
/// 열지 않게 하려는 것이다(사용자 버튼 자체는 언제나 열린다).
fn mark_login_url_opened(provider: &str, url: &str) {
    claim_login_url_open(provider, url.trim());
}

/// 새 로그인 시도는 새 URL 을 받는다. 이전 시도의 기억이 남아 있으면 이번 URL 이 한 번도
/// 안 열릴 수 있다.
fn forget_auto_opened_login_urls(provider: &str) {
    auto_opened_login_urls().remove(provider);
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum LoginUrlOpenDecision {
    Open,
    SkipAlreadyOpen,
    SkipCliOpened,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum LoginUrlOpenOutcome {
    Opened,
    AlreadyOpen,
    CliOpened,
    Failed,
}

impl LoginUrlOpenOutcome {
    /// `browser_opened` 는 "atelier 가 열었는가"가 아니라 "이 URL 이 브라우저에 떠 있는가"다.
    /// CLI 가 열었거나 앞선 경로가 이미 열었으면 프론트가 또 열어선 안 되므로 참이다.
    fn browser_showing(self) -> bool {
        !matches!(self, LoginUrlOpenOutcome::Failed)
    }
}

fn decide_login_url_auto_open(
    provider: &str,
    url: &str,
    captured_output: Option<&str>,
) -> LoginUrlOpenDecision {
    // 정본은 스트림 래치다. 버퍼 재검사는 관측자가 붙기 전(선힌트 등) 경로를 위한 보조로
    // 남긴다 — 버퍼는 64KB 슬라이딩 윈도우라 마커가 밀려나면 혼자서는 false 가 된다.
    let cli_opened = cli_self_opened_browser_latched(provider)
        || captured_output.is_some_and(cli_opened_browser_itself);
    if !claim_login_url_open(provider, url) {
        return LoginUrlOpenDecision::SkipAlreadyOpen;
    }
    if cli_opened {
        return LoginUrlOpenDecision::SkipCliOpened;
    }
    LoginUrlOpenDecision::Open
}

/// 자동 오픈의 유일한 진입점. URL 을 감지하는 모든 경로는 이 함수를 거쳐야 한다.
fn open_login_url_once(
    provider: &str,
    url: &str,
    captured_output: Option<&str>,
) -> LoginUrlOpenOutcome {
    let url = url.trim();
    if url.is_empty() {
        return LoginUrlOpenOutcome::Failed;
    }
    match decide_login_url_auto_open(provider, url, captured_output) {
        LoginUrlOpenDecision::SkipAlreadyOpen => LoginUrlOpenOutcome::AlreadyOpen,
        LoginUrlOpenDecision::SkipCliOpened => LoginUrlOpenOutcome::CliOpened,
        LoginUrlOpenDecision::Open => {
            if open_login_url_in_browser(url) {
                LoginUrlOpenOutcome::Opened
            } else {
                release_login_url_claim(provider, url);
                LoginUrlOpenOutcome::Failed
            }
        }
    }
}

/// 자동 오픈 결과를 런타임 상태에 반영하고 `browser_opened` 로 쓸 값을 돌려준다.
fn auto_open_login_url(provider: &str, url: &str, captured_output: Option<&str>) -> bool {
    // 화면에 올리는 URL 과 중복 판정에 쓰는 URL 이 같은 문자열이어야 한다.
    let url = url.trim();
    remember_oauth_login_url(provider, url);
    let showing = open_login_url_once(provider, url, captured_output).browser_showing();
    remember_oauth_browser_opened(provider, showing);
    showing
}

fn provider_for_oauth_login_url(url: &str) -> Option<&'static str> {
    ["claude", "codex", "grok"]
        .into_iter()
        .find(|provider| is_provider_login_url(provider, url))
}

/// atelier 바이너리를 `--atelier-oauth-open-url <url>` 로 부를 때의 진입점(main.rs).
/// **현재 로그인 흐름은 여기로 오지 않는다** — `configure_login_browser_env_for_*` 가
/// `$BROWSER` 에 넣는 값은 atelier 가 아니라 `/usr/bin/open`(macOS) · `xdg-open`(그 외
/// unix)이고, Windows 에선 `BROWSER` 를 아예 지운다. 즉 CLI 가 여는 창은 앱이 관측할 수
/// 없는 별도 프로세스가 띄우며, 앱 쪽 중복은 CLI 자기-오픈 신호 래치가 막는다.
/// 이 함수는 그 배선을 되돌릴 때를 위해 남아 있는 수동/외부 호출 경로다. 중복 기록을
/// 검사하지 않는 이유도 그래서다 — 별도 프로세스라 앱의 기록이 보이지 않는다.
pub(crate) fn open_oauth_browser_helper_url(url: &str) -> Result<(), String> {
    let provider = provider_for_oauth_login_url(url)
        .ok_or_else(|| "OAuth browser helper rejected a non-provider HTTPS URL".to_string())?;
    if open_login_url_in_browser(url) {
        remember_oauth_login_url(provider, url);
        remember_oauth_browser_opened(provider, true);
        Ok(())
    } else {
        Err("OAuth browser helper could not hand the URL to the default browser".into())
    }
}

fn watch_and_open_login_url(provider: String, captured: Arc<Mutex<String>>) {
    thread::spawn(move || {
        let started = Instant::now();
        let mut pending_url: Option<String> = None;
        let mut pending_since = Instant::now();
        let mut pending_output_len = 0;
        while started.elapsed() < Duration::from_secs(90) {
            let output = captured_login_output(&captured);
            if let Some(url) = detected_provider_login_url(&provider, &output) {
                auto_open_login_url(&provider, &url, Some(&output));
                break;
            }
            // 완주 판정(위)이 래치를 이미 봤으므로 여기까지 왔다는 건 "완전한 URL 이
            // 아직 한 번도 도착하지 않았다"는 뜻이다. 이 아래는 지금 도착 중인 조각을
            // 보는 최신 화면 판정이라 매번 다시 읽는 것이 맞다.
            if let Some(url) = extract_provider_login_url_relaxed(&provider, &output) {
                let unchanged = pending_url.as_deref() == Some(url.as_str())
                    && pending_output_len == output.len();
                if unchanged && pending_since.elapsed() >= Duration::from_millis(500) {
                    auto_open_login_url(&provider, &url, Some(&output));
                    break;
                }
                if !unchanged {
                    pending_url = Some(url);
                    pending_output_len = output.len();
                    pending_since = Instant::now();
                }
            }
            thread::sleep(Duration::from_millis(250));
        }
    });
}

fn oauth_pty_login_command(cli: &str, login_args: &[&str]) -> CommandBuilder {
    #[cfg(target_os = "windows")]
    {
        // Use the same native-executable/npm-shim resolver as normal agent
        // execution. The old raw `cmd.exe /C <name>` path caused Win32 error
        // 193 and could stall before an OAuth URL was emitted.
        let (program, prefix_args) = crate::agent_process::windows_cli_command_parts(cli);
        let mut cmd = CommandBuilder::new(program);
        cmd.args(prefix_args);
        cmd.args(login_args);
        if let Some(git_bash) = crate::agent_process::windows_git_bash_path() {
            cmd.env(
                "CLAUDE_CODE_GIT_BASH_PATH",
                git_bash.to_string_lossy().into_owned(),
            );
        }
        configure_login_pty_env(&mut cmd);
        cmd
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = CommandBuilder::new(cli);
        cmd.args(login_args);
        configure_login_pty_env(&mut cmd);
        cmd
    }
}

fn configure_login_pty_env(cmd: &mut CommandBuilder) {
    cmd.env("PATH", crate::augmented_cli_path());
    cmd.env("TERM", "xterm");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_CTYPE", "en_US.UTF-8");
    configure_login_browser_env_for_pty(cmd);
}

/// 형태 검증이 어디서 걸렸는지. 사용자가 취해야 할 다음 행동이 사유마다 다르므로
/// 하나로 뭉개면 멀쩡한 값을 계속 다시 복사하게 만드는 막다른 안내가 된다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ClaudeTokenFormatError {
    Prefix,
    TooShort,
    TooLong,
    Whitespace,
    ControlCharacter,
}

/// 접두사(`sk-ant-oat`, 10자) 뒤에 발급 식별자와 시크릿이 붙는다. 이보다 짧으면
/// 복사가 잘린 것이지 정상 토큰일 수 없다.
const CLAUDE_SUBSCRIPTION_TOKEN_MIN_LEN: usize = 24;
/// 상한은 토큰 문법이 아니라 "터미널 출력을 통째로 붙여넣음" 사고만 걸러내기 위한
/// 안전망이라, 실물 토큰 길이보다 훨씬 넉넉하게 둔다.
const CLAUDE_SUBSCRIPTION_TOKEN_MAX_LEN: usize = 4096;

/// `claude setup-token` 이 발급하는 구독(OAuth) 토큰인지 형태로 판정한다.
///
/// 목적은 붙여넣기 사고 차단이지 토큰 문법 강제가 아니다. Anthropic 은 토큰
/// 문자셋을 공표하지 않으므로 허용 문자를 좁히면 실물 토큰을 거부해 "붙여넣어도
/// 안 됨" 이 그대로 재발한다. 잘못 저장될 위험보다 정상 토큰을 막을 위험이 크므로,
/// 실제로 관측된 사고 원인만 막는다: 접두사 오인, 잘린 값, 여러 값이 함께 붙은
/// 붙여넣기(공백·개행), 그리고 ANSI 이스케이프 오염(제어문자).
fn classify_claude_subscription_token(value: &str) -> Result<(), ClaudeTokenFormatError> {
    if !value.starts_with("sk-ant-oat") {
        return Err(ClaudeTokenFormatError::Prefix);
    }
    if value.chars().any(char::is_whitespace) {
        return Err(ClaudeTokenFormatError::Whitespace);
    }
    // 색상 이스케이프는 예외 없이 제어문자(ESC)를 포함한다. 이 한 줄이 "앱은
    // 연결됨으로 표시하는데 실제 호출은 전부 401" 상태를 막는 실질 방어선이다.
    if value.chars().any(char::is_control) {
        return Err(ClaudeTokenFormatError::ControlCharacter);
    }
    if value.len() < CLAUDE_SUBSCRIPTION_TOKEN_MIN_LEN {
        return Err(ClaudeTokenFormatError::TooShort);
    }
    if value.len() > CLAUDE_SUBSCRIPTION_TOKEN_MAX_LEN {
        return Err(ClaudeTokenFormatError::TooLong);
    }
    Ok(())
}

fn is_claude_subscription_token(value: &str) -> bool {
    classify_claude_subscription_token(value).is_ok()
}

/// 거부 사유는 어느 조건에 걸렸는지 드러내야 한다. 그래야 다시 복사할지, 다른
/// 방식으로 복사할지, 아예 다른 값을 넣을지 사용자가 스스로 판단할 수 있다.
fn claude_token_format_message(error: ClaudeTokenFormatError) -> String {
    match error {
        ClaudeTokenFormatError::Prefix => {
            "구독 토큰이 아닙니다: 값이 sk-ant-oat 로 시작하지 않습니다. `claude setup-token` 이 출력한 토큰을 붙여넣어 주세요."
        }
        ClaudeTokenFormatError::TooShort => {
            "토큰이 중간에 잘렸습니다: 길이가 너무 짧습니다. 터미널에서 여러 줄로 접혀 출력된 경우 뒷부분까지 모두 선택했는지 확인해 주세요."
        }
        ClaudeTokenFormatError::TooLong => {
            "붙여넣은 값이 토큰 하나보다 훨씬 깁니다. 터미널 출력 전체가 아니라 sk-ant-oat 로 시작하는 토큰 한 줄만 붙여넣어 주세요."
        }
        ClaudeTokenFormatError::Whitespace => {
            "토큰에 공백 또는 줄바꿈이 섞여 있습니다. 터미널이 접어 출력한 줄바꿈까지 함께 복사되었을 수 있으니 한 줄로 이어서 붙여넣어 주세요."
        }
        ClaudeTokenFormatError::ControlCharacter => {
            "토큰에 터미널 색상 제어문자가 섞여 있습니다. 화면을 드래그해 복사하면 색상 코드가 함께 딸려옵니다. 토큰 글자만 다시 선택해 복사해 주세요."
        }
    }
    .to_string()
}

fn extract_claude_oauth_token_from_text(text: &str) -> Option<String> {
    // CLI 는 토큰을 경고색(SGR)으로 감싸 출력한다. 로그인 URL 추출기와 같은 방식으로
    // 이스케이프를 먼저 벗겨야 오염되지 않은 토큰이 나온다.
    strip_ansi_sequences(text)
        .split_whitespace()
        .find_map(|token| {
            let token = token.trim_matches(|c: char| {
                matches!(
                    c,
                    '"' | '\'' | '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';'
                )
            });
            is_claude_subscription_token(token).then(|| token.to_string())
        })
}

/// 저장 실패 사유. "형태가 틀렸다"와 "키체인에 못 썼다"를 한 bool 로 뭉개면
/// 키체인 장애까지 "토큰 형식 오류"로 오진단되어, 멀쩡한 토큰을 든 사용자가
/// 끝없이 다시 복사하게 된다.
#[derive(Debug)]
enum ClaudeTokenStoreError {
    Format(ClaudeTokenFormatError),
    Keychain(String),
}

fn claude_token_store_message(error: &ClaudeTokenStoreError) -> String {
    match error {
        ClaudeTokenStoreError::Format(reason) => claude_token_format_message(*reason),
        // 값에는 문제가 없다는 사실을 먼저 못박아야 재복사 루프에 빠지지 않는다.
        ClaudeTokenStoreError::Keychain(detail) => format!(
            "토큰 형식은 정상입니다. 값을 다시 복사할 필요는 없습니다. macOS 키체인에 저장하지 못했습니다: {detail}. 키체인 접근을 허용한 뒤 다시 시도해 주세요."
        ),
    }
}

fn store_claude_oauth_token(token: &str) -> Result<(), ClaudeTokenStoreError> {
    let token = token.trim();
    classify_claude_subscription_token(token).map_err(ClaudeTokenStoreError::Format)?;
    let entry = keychain_entry("claude", "oauth_token").map_err(ClaudeTokenStoreError::Keychain)?;
    entry
        .set_password(token)
        .map_err(|error| ClaudeTokenStoreError::Keychain(error.to_string()))?;
    set_oauth_state("claude", true);
    Ok(())
}

fn cache_claude_oauth_token(token: &str) -> bool {
    match store_claude_oauth_token(token) {
        Ok(()) => true,
        Err(error) => {
            log::warn!("claude subscription token was not stored: {error:?}");
            false
        }
    }
}

/// 토큰은 CLI 종료 직전에 찍힌다. 리더 스레드가 마지막 프레임을 삼킬 시간을 주지
/// 않으면 정상 로그인이 "토큰 없음"으로 오판된다.
const CLAUDE_TOKEN_CAPTURE_ATTEMPTS: u32 = 4;
const CLAUDE_TOKEN_CAPTURE_DELAY: Duration = Duration::from_millis(100);

fn poll_captured_claude_token(
    provider: &str,
    captured: &Arc<Mutex<String>>,
    attempts: u32,
    delay: Duration,
) -> Option<String> {
    for attempt in 0..attempts.max(1) {
        if attempt > 0 {
            thread::sleep(delay);
        }
        // 토큰도 1회성 신호다. 종료 직전 TUI 해체 프레임이 64KB 를 넘기면 버퍼에서
        // 밀려날 수 있으므로 절단에 안전한 래치를 먼저 본다.
        if let Some(token) = take_latched_claude_setup_token(provider) {
            return Some(token);
        }
        if let Some(token) = extract_claude_oauth_token_from_text(&captured_login_output(captured))
        {
            return Some(token);
        }
    }
    None
}

/// 캡처 결과는 세 갈래다. "토큰이 안 나왔다"와 "토큰은 나왔는데 못 저장했다"를
/// 하나로 뭉개면 키체인 거부가 CLI 문제로 오진단되어 사용자가 로그인만 반복한다.
enum ClaudeTokenCapture {
    Stored,
    Missing,
    NotStored(ClaudeTokenStoreError),
}

fn capture_claude_setup_token(provider: &str, captured: &Arc<Mutex<String>>) -> ClaudeTokenCapture {
    let Some(token) = poll_captured_claude_token(
        provider,
        captured,
        CLAUDE_TOKEN_CAPTURE_ATTEMPTS,
        CLAUDE_TOKEN_CAPTURE_DELAY,
    ) else {
        return ClaudeTokenCapture::Missing;
    };
    // 값 자체는 이미 확보했다. 저장 실패를 재시도해도 같은 결과라 사유를 그대로 올린다.
    match store_claude_oauth_token(&token) {
        Ok(()) => ClaudeTokenCapture::Stored,
        Err(error) => ClaudeTokenCapture::NotStored(error),
    }
}

// 이 문구는 로그인 런타임 error 필드로 나가 모달에 그대로 표시된다.
// redact_login_output 이 `sk-ant-oat` 가 들어간 줄을 통째로 가리므로,
// 나중에 error 까지 마스킹 대상이 되어도 안내가 사라지지 않게 접두사는 쓰지 않는다.
// 안내는 실재하는 목적지 하나만 가리킨다 — 터미널 발급·붙여넣기 경로는 폐기됐다.
const CLAUDE_SUBSCRIPTION_TOKEN_MISSING: &str =
    "로그인은 끝났지만 Claude 구독 토큰을 받지 못했습니다. 설정 > 연결의 Claude 카드에서 구독 로그인 버튼을 한 번 더 눌러 주세요. 같은 결과가 반복되면 Claude Code CLI 를 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.";

fn mark_oauth_login_success(provider: &str, captured: &Arc<Mutex<String>>) -> bool {
    if provider == "grok" {
        let logged_in = grok_oauth_logged_in();
        set_oauth_state(provider, logged_in);
        if !logged_in {
            fail_oauth_login_runtime(
                provider,
                "Grok login finished without a usable Atelier-isolated credential.".to_string(),
            );
        }
        return logged_in;
    }
    if provider != "claude" {
        set_oauth_state(provider, true);
        return true;
    }

    // setup-token 출력만 Atelier 자체 저장소로 넘어온다.
    match capture_claude_setup_token(provider, captured) {
        ClaudeTokenCapture::Stored => return true,
        ClaudeTokenCapture::NotStored(error) => {
            // 키체인 거부는 CLI 문제가 아니다. 사유를 그대로 화면에 올려야 사용자가
            // 로그인 버튼만 반복해서 누르는 막다른 길에 갇히지 않는다.
            let message = claude_token_store_message(&error);
            log::warn!("claude subscription token capture failed: {message}");
            fail_oauth_login_runtime(provider, message);
            return false;
        }
        ClaudeTokenCapture::Missing => {}
    }

    // `auth login --claudeai` 폴백은 토큰을 출력하지 않고 CLI 자격증명 저장소에만
    // 세션을 남긴다. 그 경우엔 CLI 의 권위 있는 응답만이 근거가 된다.
    if detect_oauth("claude") {
        return true;
    }

    // 여기서 연결됨으로 찍어버리면 키체인은 비었는데 oauth_logged_in 이 true 라
    // API 키 주입까지 억제되어(should_inject_agent_api_key) 사용자가 어떤 수단으로도
    // 빠져나올 수 없는 상태가 된다. 성공을 선언하지 말고 실패를 그대로 노출한다.
    log::warn!("claude oauth login exited successfully without a usable subscription token");
    fail_oauth_login_runtime(provider, CLAUDE_SUBSCRIPTION_TOKEN_MISSING.to_string());
    false
}

fn oauth_logout_args(provider: &str) -> Option<Vec<&'static str>> {
    match provider {
        "claude" => Some(vec!["auth", "logout"]),
        "codex" => Some(vec!["logout"]),
        "grok" => Some(vec!["logout"]),
        _ => None,
    }
}

fn run_oauth_logout(provider: &str, cli: &str) -> Result<(), String> {
    let Some(args) = oauth_logout_args(provider) else {
        return Ok(());
    };
    let label = args.join(" ");
    let mut command = if provider == "grok" {
        grok_isolated_cli_command()?
    } else {
        let mut command = cli_command(cli);
        command.env("PATH", crate::augmented_cli_path());
        command
    };
    command.args(&args);
    match command_output_timeout(command, Duration::from_secs(8)) {
        Ok(Some(output)) if output.status.success() => Ok(()),
        Ok(Some(output)) => {
            let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
            if !combined.is_empty() {
                combined.push('\n');
            }
            combined.push_str(&String::from_utf8_lossy(&output.stderr));
            let detail = combined.trim();
            if detail.is_empty() {
                Err(format!("{cli} {label} exited with {}", output.status))
            } else {
                Err(format!(
                    "{cli} {label} exited with {}: {detail}",
                    output.status
                ))
            }
        }
        Ok(None) => Err(format!("{cli} {label} timed out")),
        Err(e) => Err(format!("{cli} {label}: {e}")),
    }
}

fn run_gajecode_oauth_logout() -> Result<(), String> {
    let mut command = gajecode_isolated_cli_command()?;
    command.arg("logout");
    match command_output_timeout(command, Duration::from_secs(8)) {
        Ok(Some(output)) if output.status.success() => Ok(()),
        Ok(Some(output)) => {
            let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
            if !combined.is_empty() {
                combined.push('\n');
            }
            combined.push_str(&String::from_utf8_lossy(&output.stderr));
            let detail = combined.trim();
            if detail.is_empty() {
                Err(format!(
                    "{} logout exited with {}",
                    gajecode_cli_name(),
                    output.status
                ))
            } else {
                Err(format!(
                    "{} logout exited with {}: {detail}",
                    gajecode_cli_name(),
                    output.status
                ))
            }
        }
        Ok(None) => Err(format!("{} logout timed out", gajecode_cli_name())),
        Err(e) => Err(format!("{} logout: {e}", gajecode_cli_name())),
    }
}

struct ProviderMeta {
    cli: Option<&'static str>,
    login_cmd: Option<&'static str>,
    env_var: Option<&'static str>,
    supports_oauth: bool,
    supports_api: bool,
}

#[derive(Serialize)]
pub struct ProviderStatus {
    pub provider: String,
    /// CLI binary 가 PATH 에 있나 (claude/codex/hermes)
    pub cli_installed: bool,
    /// CLI 가 OAuth 로그인된 상태로 보이나 (가능한 경우만 검사)
    pub oauth_logged_in: bool,
    /// API 키가 keychain에 저장되어 있나 (값은 노출 X)
    pub api_key_present: bool,
    /// API 키 마스킹 표시 (`sk-…abcd`). 없으면 빈 문자열.
    pub api_key_masked: String,
    pub supports_oauth: bool,
    pub supports_api: bool,
}

#[derive(Serialize)]
pub struct ProviderLoginOauthResult {
    pub provider: String,
    pub command: String,
    pub started: bool,
    pub completed: bool,
    pub already_logged_in: bool,
    pub browser_opened: bool,
    pub login_url_detected: bool,
    pub login_url: Option<String>,
    pub diagnostic: Option<String>,
    pub message: String,
}

#[derive(Serialize)]
pub struct ProviderOauthLoginState {
    pub provider: String,
    pub active: bool,
    pub browser_opened: bool,
    pub login_url: Option<String>,
    pub output: String,
    pub error: Option<String>,
    /// 확정 실패는 아니지만 사용자가 지금 알아야 하는 것 — 코드가 전달되지 않았을
    /// 가능성. error 로 올리면 진행 중인 로그인이 실패로 종결돼 버린다.
    pub submit_warning: Option<String>,
    pub updated_at_ms: i64,
}

#[derive(Serialize)]
pub struct ProviderBrowserProbeResult {
    pub provider: String,
    pub url: String,
    pub handoff: String,
    pub accepted: bool,
    pub checked_at_ms: i64,
}

fn keychain_entry(provider: &str, slot: &str) -> Result<Entry, String> {
    let username = format!("{provider}.{slot}");
    Entry::new(SERVICE, &username).map_err(|e| format!("keychain entry: {e}"))
}

#[cfg(target_os = "macos")]
fn keychain_username(provider: &str, slot: &str) -> String {
    format!("{provider}.{slot}")
}

fn keychain_item_exists(provider: &str, slot: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        let username = keychain_username(provider, slot);
        Command::new("/usr/bin/security")
            .args(["find-generic-password", "-s", SERVICE, "-a", &username])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (provider, slot);
        false
    }
}

fn mask_key(key: &str) -> String {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let len = trimmed.chars().count();
    if len <= 8 {
        return "•".repeat(len);
    }
    let chars: Vec<char> = trimmed.chars().collect();
    let head: String = chars[..4].iter().collect();
    let tail: String = chars[len - 4..].iter().collect();
    format!("{head}…{tail}")
}

fn app_support_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("APPDATA")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(PathBuf::from)?;
        Some(base.join("com.atelier.app"))
    }

    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME").map(PathBuf::from)?;
        Some(home.join("Library/Application Support/com.atelier.app"))
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
        Some(base.join("com.atelier.app"))
    }
}

fn managed_runtime_layout_at(
    app_support: &Path,
    provider: &str,
) -> Result<ManagedRuntimeLayout, String> {
    let (provider, root, home, state, cache, temp, skills, workspace) = match provider {
        "hermes" => {
            let root = app_support.join("providers").join("hermes");
            let home = root.join("home");
            (
                "hermes",
                root.clone(),
                home.clone(),
                root.join("state"),
                root.join("cache"),
                root.join("tmp"),
                home.join("skills"),
                None,
            )
        }
        "gajecode" => {
            let root = app_support.join("providers").join("gajecode");
            let home = root.join("home");
            let agent = home.join(".gjc").join("agent");
            (
                "gajecode",
                root.clone(),
                home,
                root.join("xdg-data"),
                root.join("xdg-cache"),
                root.join("tmp"),
                agent.join("skills"),
                Some(root.join("workspace")),
            )
        }
        "grok" => {
            let root = app_support.join("providers").join("grok");
            let home = root.join("home");
            (
                "grok",
                root.clone(),
                home.clone(),
                root.join("state"),
                root.join("cache"),
                root.join("tmp"),
                home.join(".grok").join("skills"),
                None,
            )
        }
        _ => {
            return Err(format!(
                "Managed runtime preparation is not available for {provider}."
            ))
        }
    };
    Ok(ManagedRuntimeLayout {
        provider,
        receipt: root.join("readiness.json"),
        root,
        home,
        state,
        cache,
        temp,
        skills,
        workspace,
    })
}

fn ensure_runtime_layout(layout: &ManagedRuntimeLayout) -> Result<(), String> {
    for dir in [
        &layout.root,
        &layout.home,
        &layout.state,
        &layout.cache,
        &layout.temp,
        &layout.skills,
    ] {
        std::fs::create_dir_all(dir)
            .map_err(|error| format!("create {}: {error}", dir.display()))?;
    }
    if let Some(workspace) = &layout.workspace {
        std::fs::create_dir_all(workspace)
            .map_err(|error| format!("create {}: {error}", workspace.display()))?;
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct HermesInstallRecord {
    spec: String,
    executable: String,
}

fn hermes_provider_root_at(app_support: &Path) -> PathBuf {
    app_support.join("providers").join("hermes")
}

fn hermes_provider_root() -> Option<PathBuf> {
    Some(hermes_provider_root_at(&app_support_dir()?))
}

fn hermes_install_record_path_at(app_support: &Path) -> PathBuf {
    hermes_provider_root_at(app_support).join("install.json")
}

fn hermes_install_record_path() -> Option<PathBuf> {
    Some(hermes_install_record_path_at(&app_support_dir()?))
}

fn hermes_uv_tool_dir_at(app_support: &Path) -> PathBuf {
    hermes_provider_root_at(app_support).join("uv-tools")
}

fn hermes_uv_package_dir_at(app_support: &Path) -> PathBuf {
    hermes_uv_tool_dir_at(app_support).join("hermes-agent")
}

fn hermes_uv_bin_dir_at(app_support: &Path) -> PathBuf {
    hermes_uv_package_dir_at(app_support).join("bin")
}

fn hermes_uv_python_dir_at(app_support: &Path) -> PathBuf {
    hermes_provider_root_at(app_support).join("uv-python")
}

fn hermes_bundled_source_root_at(app_support: &Path) -> PathBuf {
    hermes_provider_root_at(app_support).join(HERMES_BUNDLED_SOURCE_DIRECTORY)
}

fn hermes_bundled_skills_dir_at(app_support: &Path) -> PathBuf {
    hermes_bundled_source_root_at(app_support).join("skills")
}

fn hermes_bundled_source_manifest_path_at(app_support: &Path) -> PathBuf {
    hermes_bundled_source_root_at(app_support).join(HERMES_BUNDLED_SOURCE_MANIFEST)
}

fn load_hermes_install_record() -> Option<HermesInstallRecord> {
    let text = std::fs::read_to_string(hermes_install_record_path()?).ok()?;
    serde_json::from_str(&text).ok()
}

fn save_hermes_install_record_at(app_support: &Path, executable: &Path) -> Result<(), String> {
    let path = hermes_install_record_path_at(app_support);
    let parent = path
        .parent()
        .ok_or_else(|| "Could not resolve the Atelier Hermes state directory.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create {}: {error}", parent.display()))?;
    let executable = std::fs::canonicalize(executable).unwrap_or_else(|_| executable.to_path_buf());
    let record = HermesInstallRecord {
        spec: HERMES_GIT_SPEC.to_string(),
        executable: executable.to_string_lossy().into_owned(),
    };
    let text = serde_json::to_string_pretty(&record)
        .map_err(|error| format!("serialize Hermes install record: {error}"))?;
    std::fs::write(&path, format!("{text}\n"))
        .map_err(|error| format!("write {}: {error}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn hermes_managed_executable_path_at(app_support: &Path) -> Option<PathBuf> {
    let bins = [
        hermes_uv_bin_dir_at(app_support),
        hermes_provider_root_at(app_support).join("bin"),
    ];
    let names: &[&str] = if cfg!(target_os = "windows") {
        &["hermes.exe", "hermes.cmd", "hermes.bat", "hermes"]
    } else {
        &["hermes"]
    };
    bins.into_iter().find_map(|bin| {
        names.iter().find_map(|name| {
            let candidate = bin.join(name);
            candidate
                .is_file()
                .then(|| std::fs::canonicalize(&candidate).unwrap_or(candidate))
        })
    })
}

pub fn hermes_managed_executable_path() -> Option<PathBuf> {
    hermes_managed_executable_path_at(&app_support_dir()?)
}

pub fn hermes_executable_path() -> Option<PathBuf> {
    if let Some(path) = hermes_managed_executable_path() {
        return Some(path);
    }
    if let Some(record) = load_hermes_install_record() {
        let path = PathBuf::from(record.executable);
        if path.is_file() {
            return Some(std::fs::canonicalize(&path).unwrap_or(path));
        }
    }
    let discovered = crate::agent_process::resolve_cli_executable("hermes");
    discovered
        .is_file()
        .then(|| std::fs::canonicalize(&discovered).unwrap_or(discovered))
}

// 설치 시점 spec(install.json)이 현재 빌드의 핀과 같은지 검사한다.
// direct_url.json은 커밋만 증명하고 extras 구성은 기록하지 않으므로,
// spec에 extra가 추가/변경돼도 커밋이 같으면 provenance 검사만으로는 구분 불가 —
// 이 비교가 readiness 경로에서 구 spec 설치본을 실패시켜 자동 재설치를 유도한다.
fn hermes_install_record_matches_spec_at(app_support: &Path) -> bool {
    let path = hermes_install_record_path_at(app_support);
    let Ok(metadata) = std::fs::metadata(&path) else {
        return false;
    };
    if metadata.len() == 0 || metadata.len() > MANAGED_RECEIPT_MAX_BYTES {
        return false;
    }
    let Ok(text) = std::fs::read_to_string(&path) else {
        return false;
    };
    serde_json::from_str::<HermesInstallRecord>(&text)
        .is_ok_and(|record| record.spec == HERMES_GIT_SPEC)
}

fn hermes_install_record_is_current() -> bool {
    load_hermes_install_record().is_some_and(|record| {
        let executable = PathBuf::from(record.executable);
        record.spec == HERMES_GIT_SPEC
            && executable.is_file()
            && hermes_provider_root().is_some_and(|root| executable.starts_with(root))
    })
}

pub fn gajecode_cli_name() -> &'static str {
    "gjc"
}

pub fn gajecode_provider_root() -> Option<PathBuf> {
    Some(app_support_dir()?.join("providers").join("gajecode"))
}

pub fn gajecode_home_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("home"))
}

pub fn gajecode_workspace_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("workspace"))
}

pub fn gajecode_skills_dir() -> Option<PathBuf> {
    Some(gajecode_agent_dir()?.join("skills"))
}

fn gajecode_agent_dir() -> Option<PathBuf> {
    Some(gajecode_home_dir()?.join(".gjc").join("agent"))
}

fn gajecode_models_config_content() -> &'static str {
    r#"# Atelier managed default for the isolated Gajae Code runtime.
# Provider credentials are injected only into the Gajae child process.
# This file never stores API keys, OAuth tokens, or subscription credentials.
providers:
  alibaba-token-plan:
    baseUrl: https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
    apiKeyEnv: DASHSCOPE_API_KEY
    api: openai-completions
    auth: apiKey
    compat:
      supportsDeveloperRole: false
    models:
      - id: qwen3.8-max-preview
        name: Qwen 3.8 Max Preview
        reasoning: true
        input: [text, image]
        contextWindow: 1000000
        maxTokens: 65536
        thinking:
          mode: effort
          minLevel: minimal
          maxLevel: high
        compat:
          supportsReasoningEffort: false
          thinkingFormat: qwen
      - id: glm-5.2
        name: GLM 5.2
        reasoning: true
        input: [text]
        contextWindow: 1000000
        maxTokens: 65536
        thinking:
          mode: effort
          minLevel: minimal
          maxLevel: max
        compat:
          supportsReasoningEffort: true
          thinkingFormat: openai
"#
}

fn ensure_gajecode_models_config(agent_dir: &Path) -> Result<(), String> {
    let path = agent_dir.join("models.yml");
    let content = gajecode_models_config_content();
    if path.exists() {
        if let Ok(existing) = std::fs::read_to_string(&path) {
            let is_atelier_managed =
                existing.contains("# Atelier managed default for the isolated Gajae Code runtime.");
            if is_atelier_managed && existing != content {
                std::fs::write(&path, content)
                    .map_err(|e| format!("write {}: {e}", path.display()))?;
            }
        }
        return Ok(());
    }
    std::fs::create_dir_all(agent_dir)
        .map_err(|e| format!("create {}: {e}", agent_dir.display()))?;
    std::fs::write(&path, content).map_err(|e| format!("write {}: {e}", path.display()))
}

fn gajecode_bun_install_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("bun"))
}

fn gajecode_bun_executable_path_at(app_support: &Path) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") {
        "bun.exe"
    } else {
        "bun"
    };
    let direct = app_support
        .join("providers")
        .join("gajecode")
        .join("bun")
        .join("bin")
        .join(name);
    direct
        .is_file()
        .then(|| std::fs::canonicalize(&direct).unwrap_or(direct))
}

fn gajecode_bun_executable_path() -> Option<PathBuf> {
    gajecode_bun_executable_path_at(&app_support_dir()?)
}

pub fn gajecode_config_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("xdg-config"))
}

pub fn gajecode_data_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("xdg-data"))
}

pub fn gajecode_cache_dir() -> Option<PathBuf> {
    Some(gajecode_provider_root()?.join("xdg-cache"))
}

fn gajecode_bin_dirs() -> Vec<PathBuf> {
    let Some(bun_install) = gajecode_bun_install_dir() else {
        return Vec::new();
    };
    let mut dirs = vec![bun_install.join("bin")];
    if let Some(home) = gajecode_home_dir() {
        dirs.push(home.join(".bun").join("bin"));
    }
    dirs
}

fn gajecode_executable_path_at(app_support: &Path) -> Option<PathBuf> {
    let cli_name = gajecode_cli_name();
    let names = {
        #[cfg(target_os = "windows")]
        {
            let mut names = vec![cli_name.to_string()];
            names.push(format!("{cli_name}.cmd"));
            names.push(format!("{cli_name}.ps1"));
            names.push(format!("{cli_name}.exe"));
            names.push("gajae-code.cmd".to_string());
            names.push("gajae-code.exe".to_string());
            names
        }
        #[cfg(not(target_os = "windows"))]
        {
            vec![cli_name.to_string()]
        }
    };
    let root = app_support.join("providers").join("gajecode");
    let home = root.join("home");
    for dir in [root.join("bun").join("bin"), home.join(".bun").join("bin")] {
        for name in &names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(std::fs::canonicalize(&candidate).unwrap_or(candidate));
            }
        }
    }
    None
}

pub fn gajecode_executable_path() -> Option<PathBuf> {
    gajecode_executable_path_at(&app_support_dir()?)
}

fn gajecode_cli_installed() -> bool {
    gajecode_executable_path().is_some()
}

pub fn gajecode_runtime_path_env() -> String {
    let mut paths = gajecode_bin_dirs();
    paths.extend(std::env::split_paths(&crate::augmented_cli_path()));
    let mut unique = Vec::new();
    for path in paths {
        if !unique.iter().any(|seen| seen == &path) {
            unique.push(path);
        }
    }
    std::env::join_paths(unique)
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|_| crate::augmented_cli_path())
}

fn clear_bootstrap_credential_env(command: &mut Command) {
    for key in [
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_OAUTH_TOKEN",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "OPENAI_CODEX_OAUTH_TOKEN",
        "OPENAI_OAUTH_TOKEN",
        "CODEX_OAUTH_TOKEN",
        "CHATGPT_ACCESS_TOKEN",
        "OPENAI_ACCESS_TOKEN",
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "DASHSCOPE_API_KEY",
        "OPENROUTER_API_KEY",
        "XAI_API_KEY",
        "GITHUB_TOKEN",
        "GH_TOKEN",
    ] {
        command.env_remove(key);
    }
}

fn configure_hermes_runtime_env_at(
    command: &mut Command,
    app_support: &Path,
) -> Result<(), String> {
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    ensure_runtime_layout(&layout)?;
    let config = layout.state.join("config");
    let data = layout.state.join("data");
    std::fs::create_dir_all(&config)
        .map_err(|error| format!("create {}: {error}", config.display()))?;
    std::fs::create_dir_all(&data)
        .map_err(|error| format!("create {}: {error}", data.display()))?;
    clear_bootstrap_credential_env(command);
    for key in [
        "HERMES_PROFILE",
        "HERMES_CONFIG",
        "HERMES_CONFIG_PATH",
        "HERMES_BUNDLED_SKILLS",
        "HERMES_EXTERNAL_SKILLS_DIRS",
        "PYTHONHOME",
        "PYTHONPATH",
    ] {
        command.env_remove(key);
    }
    command
        .env("HOME", &layout.home)
        .env("USERPROFILE", &layout.home)
        .env("HERMES_HOME", &layout.home)
        .env("XDG_CONFIG_HOME", &config)
        .env("XDG_DATA_HOME", &data)
        .env("XDG_CACHE_HOME", &layout.cache)
        .env(
            "UV_PYTHON_INSTALL_DIR",
            hermes_uv_python_dir_at(app_support),
        )
        .env("TMPDIR", &layout.temp)
        .env("ATELIER_PROVIDER_ID", "hermes")
        .env("ATELIER_SKILLS_DIR", &layout.skills);
    Ok(())
}

pub fn configure_hermes_runtime_env(command: &mut Command) -> Result<(), String> {
    let app_support = app_support_dir()
        .ok_or_else(|| "Could not resolve the Atelier Hermes directory.".to_string())?;
    configure_hermes_runtime_env_at(command, &app_support)
}

fn configure_gajecode_runtime_env_at(
    command: &mut Command,
    app_support: &Path,
) -> Result<(), String> {
    let layout = managed_runtime_layout_at(app_support, "gajecode")?;
    ensure_runtime_layout(&layout)?;
    let root = layout.root;
    let home = layout.home;
    let workspace = layout
        .workspace
        .ok_or_else(|| "Could not resolve the 가재코드 workspace directory.".to_string())?;
    let skills = layout.skills;
    let config = root.join("xdg-config");
    let data = root.join("xdg-data");
    let cache = root.join("xdg-cache");
    let temp = root.join("tmp");
    let agent_dir = home.join(".gjc").join("agent");
    let bun_install = root.join("bun");
    for dir in [
        &root,
        &home,
        &workspace,
        &skills,
        &config,
        &data,
        &cache,
        &temp,
        &agent_dir,
        &bun_install,
    ] {
        std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    }
    ensure_gajecode_models_config(&agent_dir)?;
    let gjc_home = home.join(".gjc");
    clear_bootstrap_credential_env(command);
    for key in [
        "CODEX_HOME",
        "CLAUDE_CONFIG_DIR",
        "HERMES_HOME",
        "GJC_CONFIG_DIR",
        "GJC_SKILLS_DIR",
    ] {
        command.env_remove(key);
    }
    let runtime_path = {
        let mut paths = vec![bun_install.join("bin"), home.join(".bun").join("bin")];
        paths.extend(std::env::split_paths(&crate::augmented_cli_path()));
        std::env::join_paths(paths)
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|_| crate::augmented_cli_path())
    };
    command
        .env("PATH", runtime_path)
        .env("HOME", &home)
        .env("USERPROFILE", &home)
        .env("XDG_CONFIG_HOME", &config)
        .env("XDG_DATA_HOME", &data)
        .env("XDG_CACHE_HOME", &cache)
        .env("TMPDIR", &temp)
        .env("BUN_INSTALL", &bun_install)
        .env("GJC_HOME", &gjc_home)
        .env("GAJAE_CODE_HOME", &gjc_home)
        .env("GJC_CONFIG_DIR", &gjc_home)
        .env("GJC_CODING_AGENT_DIR", &agent_dir)
        .env("ATELIER_PROVIDER_ID", "gajecode")
        .env("ATELIER_SKILLS_DIR", &skills);
    Ok(())
}

pub fn configure_gajecode_runtime_env(command: &mut Command) -> Result<(), String> {
    let app_support = app_support_dir()
        .ok_or_else(|| "Could not resolve the Atelier Gajaecode directory.".to_string())?;
    configure_gajecode_runtime_env_at(command, &app_support)
}

fn gajecode_isolated_cli_command() -> Result<Command, String> {
    let executable = gajecode_executable_path().ok_or_else(|| {
        "가재코드 CLI가 설치되어 있지 않습니다. 자동 설치를 먼저 실행하세요.".to_string()
    })?;
    let mut command = cli_command(&executable.to_string_lossy());
    configure_gajecode_runtime_env(&mut command)?;
    Ok(command)
}

pub fn grok_provider_root() -> Option<PathBuf> {
    Some(app_support_dir()?.join("providers").join("grok"))
}

pub fn grok_home_dir() -> Option<PathBuf> {
    Some(grok_provider_root()?.join("home"))
}

fn grok_executable_path_at(app_support: &Path) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") {
        "grok.exe"
    } else {
        "grok"
    };
    let candidate = app_support
        .join("providers")
        .join("grok")
        .join("bin")
        .join(name);
    candidate
        .is_file()
        .then(|| std::fs::canonicalize(&candidate).unwrap_or(candidate))
}

pub fn grok_executable_path() -> Option<PathBuf> {
    grok_executable_path_at(&app_support_dir()?)
}

fn configure_grok_runtime_env_at(command: &mut Command, app_support: &Path) -> Result<(), String> {
    let layout = managed_runtime_layout_at(app_support, "grok")?;
    ensure_runtime_layout(&layout)?;
    let config = layout.state.join("config");
    let data = layout.state.join("data");
    std::fs::create_dir_all(&config)
        .map_err(|error| format!("create {}: {error}", config.display()))?;
    std::fs::create_dir_all(&data)
        .map_err(|error| format!("create {}: {error}", data.display()))?;
    clear_bootstrap_credential_env(command);
    command
        .env("HOME", &layout.home)
        .env("USERPROFILE", &layout.home)
        .env("XDG_CONFIG_HOME", &config)
        .env("XDG_DATA_HOME", &data)
        .env("XDG_CACHE_HOME", &layout.cache)
        .env("TMPDIR", &layout.temp)
        .env("ATELIER_PROVIDER_ID", "grok");
    Ok(())
}

pub fn configure_grok_runtime_env(command: &mut Command) -> Result<(), String> {
    let app_support = app_support_dir()
        .ok_or_else(|| "Could not resolve the Atelier Grok directory.".to_string())?;
    configure_grok_runtime_env_at(command, &app_support)
}

pub fn grok_isolated_cli_command() -> Result<Command, String> {
    let executable = grok_executable_path().ok_or_else(|| {
        "Grok CLI가 설치되어 있지 않습니다. 설정 > 연결에서 자동 설치를 먼저 실행하세요."
            .to_string()
    })?;
    let mut command = cli_command(&executable.to_string_lossy());
    configure_grok_runtime_env(&mut command)?;
    Ok(command)
}

fn grok_auth_file_at(app_support: &Path) -> PathBuf {
    app_support
        .join("providers")
        .join("grok")
        .join("home")
        .join(".grok")
        .join("auth.json")
}

fn grok_auth_value_has_token(value: &Value) -> bool {
    match value {
        Value::Object(map) => map.iter().any(|(key, value)| {
            ((key == "key" || key == "access_token")
                && value.as_str().is_some_and(|token| !token.trim().is_empty()))
                || grok_auth_value_has_token(value)
        }),
        Value::Array(values) => values.iter().any(grok_auth_value_has_token),
        _ => false,
    }
}

fn grok_oauth_logged_in_at(app_support: &Path) -> bool {
    let path = grok_auth_file_at(app_support);
    let Ok(metadata) = std::fs::symlink_metadata(&path) else {
        return false;
    };
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > CODEX_AUTH_MAX_BYTES
    {
        return false;
    }
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .is_some_and(|value| grok_auth_value_has_token(&value))
}

pub fn grok_oauth_logged_in() -> bool {
    app_support_dir().is_some_and(|app_support| grok_oauth_logged_in_at(&app_support))
}

fn credential_state_path() -> Option<PathBuf> {
    Some(app_support_dir()?.join("credential-state.json"))
}

fn load_credential_state_file() -> CredentialStateFile {
    let Some(path) = credential_state_path() else {
        return CredentialStateFile::default();
    };
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<CredentialStateFile>(&text).ok())
        .unwrap_or_default()
}

fn save_credential_state_file(state: &CredentialStateFile) -> Result<(), String> {
    let Some(path) = credential_state_path() else {
        return Ok(());
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("credential state mkdir: {e}"))?;
    }
    let text =
        serde_json::to_string_pretty(state).map_err(|e| format!("credential state json: {e}"))?;
    std::fs::write(&path, text).map_err(|e| format!("credential state write: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(&path) {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o600);
            let _ = std::fs::set_permissions(&path, permissions);
        }
    }
    Ok(())
}

fn credential_state(provider: &str) -> CredentialState {
    load_credential_state_file()
        .providers
        .remove(provider)
        .unwrap_or_default()
}

fn update_credential_state<F>(provider: &str, update: F) -> Result<(), String>
where
    F: FnOnce(&mut CredentialState),
{
    let mut file = load_credential_state_file();
    let state = file.providers.entry(provider.to_string()).or_default();
    update(state);
    state.updated_at = Some(chrono::Utc::now().to_rfc3339());
    save_credential_state_file(&file)
}

fn set_oauth_state(provider: &str, logged_in: bool) {
    let _ = update_credential_state(provider, |state| {
        state.oauth_logged_in = logged_in;
    });
}

fn set_api_key_state(provider: &str, key: Option<&str>) {
    let _ = update_credential_state(provider, |state| {
        if let Some(key) = key {
            state.api_key_present = true;
            state.api_key_masked = mask_key(key);
        } else {
            state.api_key_present = false;
            state.api_key_masked.clear();
        }
    });
}

fn is_valid_api_key_for_provider(provider: &str, value: &str) -> bool {
    let key = value.trim();
    if key.is_empty() || key.contains('#') || key.chars().any(char::is_whitespace) {
        return false;
    }
    match provider {
        "claude" => {
            key.starts_with("sk-ant-api")
                || (key.starts_with("sk-ant-") && !key.starts_with("sk-ant-oat"))
        }
        "codex" => key.starts_with("sk-"),
        "openrouter" => key.starts_with("sk-or-v1-"),
        "alibaba" => key.starts_with("sk-") && key.len() >= 20,
        "grok" => key.starts_with("xai-") && key.len() >= 20,
        // Linear does not document a stable personal-key prefix. Keep the
        // validation structural and let the authenticated viewer query be the
        // authority, without ever exposing the key to the renderer again.
        "linear" => key.len() >= 20 && key.len() <= 512,
        _ => true,
    }
}

/// 이 칸은 구독 토큰의 자리가 아니다. 안내는 실재하고 동작하는 목적지 하나 —
/// 설정 > 연결의 구독 로그인 버튼 — 만 가리켜야 한다.
const CLAUDE_SUBSCRIPTION_TOKEN_IN_API_SLOT: &str =
    "이 값은 구독 토큰이라 API 키 칸에 저장하지 않습니다. 터미널에서 토큰을 만드실 필요도 없습니다. 이 카드 위의 'Claude 구독으로 로그인' 버튼을 누르고 브라우저 승인만 마치면 연결됩니다.";

/// 거부 사유는 실제로 존재하는 다음 행동을 가리켜야 한다. API 키 칸이 받는 값은
/// console 발급 키 하나뿐이고, 구독은 로그인 버튼이 담당한다.
fn api_key_rejection_message(provider: &str) -> String {
    match provider {
        "claude" => "이 값은 Anthropic API 키 형식이 아닙니다. console.anthropic.com 의 API 키(sk-ant-api…)를 공백 없이 붙여넣어 주세요. Claude Pro/Max 구독으로 쓰시려면 이 칸이 아니라 위의 'Claude 구독으로 로그인' 버튼을 눌러 주세요."
            .to_string(),
        _ => format!("{provider} API 키 형식이 올바르지 않습니다. 공백·주석 없이 키 전체를 붙여넣어 주세요."),
    }
}

fn which(cli: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        crate::command_exists_in_augmented_path(cli)
    }

    #[cfg(not(target_os = "windows"))]
    {
        // 빠른 PATH 검사. Unix 는 command -v.
        let mut command = Command::new("sh");
        command.arg("-c").arg(format!("command -v {cli}"));
        configure_background_command(&mut command);
        let res = command.env("PATH", crate::augmented_cli_path()).output();
        matches!(res, Ok(o) if o.status.success())
    }
}

fn cli_runs_for_provider(provider: &str, cli: &str) -> bool {
    if !which(cli) {
        return false;
    }

    // `command -v` only proves that a shim exists. npm-installed agent CLIs can
    // still be broken when their native vendor binary is missing, which makes
    // OAuth look like a browser failure even though the CLI never starts.
    if !matches!(provider, "claude" | "codex") {
        return true;
    }

    let mut command = cli_command(cli);
    command
        .arg("--version")
        .env("PATH", crate::augmented_cli_path());
    matches!(
        command_output_timeout(command, Duration::from_secs(3)),
        Ok(Some(output)) if output.status.success()
    )
}

fn provider_cli_installed(provider: &str, meta: &ProviderMeta) -> bool {
    if matches!(provider, "hermes" | "gajecode" | "grok") {
        return app_support_dir()
            .is_some_and(|app_support| verify_managed_runtime_at(&app_support, provider).is_ok());
    }
    meta.cli
        .map(|cli| cli_runs_for_provider(provider, cli))
        .unwrap_or(false)
}

fn command_output_timeout(mut command: Command, timeout: Duration) -> io::Result<Option<Output>> {
    configure_background_command(&mut command);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn()?;
    let start = Instant::now();
    loop {
        if child.try_wait()?.is_some() {
            return child.wait_with_output().map(Some);
        }
        if start.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(None);
        }
        thread::sleep(Duration::from_millis(40));
    }
}

fn oauth_probe_result(cached: bool, detected: Option<bool>) -> bool {
    detected.unwrap_or(cached)
}

fn resolve_oauth_probe(provider: &str, detected: Option<bool>) -> bool {
    if let Some(logged_in) = detected {
        set_oauth_state(provider, logged_in);
        logged_in
    } else {
        // A timeout or spawn failure is not proof that a valid subscription
        // session was revoked. Keep the last verified state until the CLI
        // returns an authoritative logged-in/logged-out result.
        oauth_probe_result(credential_state(provider).oauth_logged_in, None)
    }
}

fn detect_oauth(provider: &str) -> bool {
    if provider == "claude" && keychain_item_exists("claude", "oauth_token") {
        set_oauth_state(provider, true);
        return true;
    }

    if provider == "grok" {
        let logged_in = grok_oauth_logged_in();
        set_oauth_state(provider, logged_in);
        return logged_in;
    }

    if provider == "codex" && cli_runs_for_provider(provider, "codex") {
        let mut command = cli_command("codex");
        command
            .args(["login", "status"])
            .env("PATH", crate::augmented_cli_path());
        let status = command_output_timeout(command, Duration::from_secs(3));
        let detected = match status {
            Ok(Some(output)) => {
                let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
                combined.push('\n');
                combined.push_str(&String::from_utf8_lossy(&output.stderr));
                Some(output.status.success() && combined.to_ascii_lowercase().contains("logged in"))
            }
            Ok(None) | Err(_) => None,
        };
        return resolve_oauth_probe(provider, detected);
    }

    if provider == "claude" && cli_runs_for_provider(provider, "claude") {
        let mut command = cli_command("claude");
        command
            .args(["auth", "status"])
            .env("PATH", crate::augmented_cli_path());
        let status = command_output_timeout(command, Duration::from_secs(3));
        let detected = match status {
            Ok(Some(output)) => {
                let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
                combined.push('\n');
                combined.push_str(&String::from_utf8_lossy(&output.stderr));
                Some(
                    output.status.success()
                        && serde_json::from_str::<Value>(&combined)
                            .ok()
                            .and_then(|value| value.get("loggedIn").and_then(Value::as_bool))
                            .unwrap_or_else(|| {
                                combined.to_ascii_lowercase().contains("loggedin\": true")
                            }),
                )
            }
            Ok(None) | Err(_) => None,
        };
        return resolve_oauth_probe(provider, detected);
    }

    // OAuth 상태는 CLI 별로 다르다. Codex는 위에서 실제 CLI 상태를 확인하고,
    // Claude도 가능한 경우 CLI 상태를 확인한다. 설정 화면은 Keychain을 읽지 않고
    // 앱의 비밀 없는 상태 파일만 사용해 macOS 암호 프롬프트를 피한다.
    credential_state(provider).oauth_logged_in || keychain_item_exists(provider, "oauth_marker")
}

fn value_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn value_i64(value: Option<&Value>) -> Option<i64> {
    value.and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
            .or_else(|| value.as_str()?.trim().parse::<i64>().ok())
    })
}

fn value_string_or_array(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        let text = text.trim();
        return (!text.is_empty()).then(|| text.to_string());
    }
    let array = value.as_array()?;
    let joined = array
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    (!joined.is_empty()).then_some(joined)
}

fn claude_oauth_credential_from_value(value: &Value) -> Option<ClaudeSubscriptionOauthCredential> {
    let oauth = value
        .get("claudeAiOauth")
        .or_else(|| value.get("oauth"))
        .or_else(|| value.get("tokens"))
        .unwrap_or(value);

    let access = value_string(
        oauth
            .get("accessToken")
            .or_else(|| oauth.get("access_token"))
            .or_else(|| oauth.get("access")),
    )
    .filter(|token| token.contains("sk-ant-oat"))?;
    let refresh = value_string(
        oauth
            .get("refreshToken")
            .or_else(|| oauth.get("refresh_token"))
            .or_else(|| oauth.get("refresh")),
    );
    let expires = value_i64(
        oauth
            .get("expiresAt")
            .or_else(|| oauth.get("expires_at"))
            .or_else(|| oauth.get("expires")),
    );
    let scopes = value_string_or_array(oauth.get("scopes").or_else(|| oauth.get("scope")));
    let subscription_type = value_string(
        oauth
            .get("subscriptionType")
            .or_else(|| oauth.get("subscription_type")),
    );

    Some(ClaudeSubscriptionOauthCredential {
        access,
        refresh,
        expires,
        scopes,
        subscription_type,
    })
}

#[allow(dead_code)]
fn claude_oauth_token_from_value(value: &Value) -> Option<String> {
    let credential = claude_oauth_credential_from_value(value)?;
    if !credential.access_is_fresh() {
        return None;
    }
    Some(credential.access)
}

fn read_claude_oauth_credential_from_json_text(
    text: &str,
) -> Option<ClaudeSubscriptionOauthCredential> {
    let value: Value = serde_json::from_str(text).ok()?;
    claude_oauth_credential_from_value(&value)
}

#[cfg(target_os = "macos")]
fn macos_keychain_password(service: &str, account: &str) -> Option<String> {
    let output = Command::new("/usr/bin/security")
        .args(["find-generic-password", "-s", service, "-a", account, "-w"])
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let secret = String::from_utf8_lossy(&output.stdout)
        .trim_end_matches(['\r', '\n'])
        .trim()
        .to_string();
    (!secret.is_empty()).then_some(secret)
}

fn read_app_keychain_password(provider: &str, slot: &str) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let username = keychain_username(provider, slot);
        macos_keychain_password(SERVICE, &username)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let entry = keychain_entry(provider, slot).ok()?;
        entry.get_password().ok()
    }
}

/// 저장된 항목의 상태. "없음"과 "있는데 못 쓴다"는 후속 조치가 달라서 Option
/// 하나로는 구분할 수 없다 — 후자는 지워줘야 사용자가 빠져나올 수 있다.
enum AtelierClaudeOauthEntry {
    Missing,
    Unusable,
    Usable(Box<ClaudeSubscriptionOauthCredential>),
}

/// 항목을 지우고 연결 표시도 함께 내린다. detect_oauth 는 항목의 "존재"만 보고
/// 로그인됨으로 판정하므로, 값만 버리고 항목을 남기면 API 키 주입이 계속 억제되어
/// 사용자가 어떤 수단으로도 빠져나올 수 없다.
fn purge_claude_oauth_credential() {
    if let Ok(entry) = keychain_entry("claude", "oauth_token") {
        let _ = entry.delete_credential();
    }
    set_oauth_state("claude", false);
}

fn read_claude_oauth_credential_from_atelier_keychain() -> AtelierClaudeOauthEntry {
    let Some(secret) = read_app_keychain_password("claude", "oauth_token") else {
        return AtelierClaudeOauthEntry::Missing;
    };
    let secret = secret.trim();
    // 읽기를 쓰기보다 느슨하게 두면(예: contains) 예전 빌드가 남긴 오염 토큰이
    // 그대로 주입되어 "연결됨인데 전부 401" 이 유지된다. 저장 경로와 같은 형태
    // 검증을 적용해 엄격도를 맞춘다.
    let credential = if is_claude_subscription_token(secret) {
        ClaudeSubscriptionOauthCredential {
            access: secret.to_string(),
            refresh: None,
            expires: None,
            scopes: None,
            subscription_type: None,
        }
    } else {
        match read_claude_oauth_credential_from_json_text(secret) {
            Some(mut credential) => {
                credential.access = credential.access.trim().to_string();
                credential
            }
            None => return AtelierClaudeOauthEntry::Unusable,
        }
    };
    if is_claude_subscription_token(&credential.access) {
        AtelierClaudeOauthEntry::Usable(Box::new(credential))
    } else {
        AtelierClaudeOauthEntry::Unusable
    }
}

#[allow(dead_code)]
pub fn read_claude_subscription_oauth_token() -> Option<String> {
    // Legacy Atelier builds cached a renewable Claude credential. Read only the
    // app-owned keychain item, immediately strip any refresh token, and keep a
    // fresh inference-only access token. External Claude credential stores are
    // never opened.
    match read_claude_oauth_credential_from_atelier_keychain() {
        AtelierClaudeOauthEntry::Missing => None,
        AtelierClaudeOauthEntry::Unusable => {
            log::warn!("stored claude subscription token failed format validation; purging it");
            purge_claude_oauth_credential();
            None
        }
        AtelierClaudeOauthEntry::Usable(credential) => {
            let token = credential
                .access_is_fresh()
                .then(|| credential.access.clone());
            if credential.refresh.is_some() {
                // refresh 토큰은 Atelier 가 보관하지 않는다. 깨끗한 access 만 남기고,
                // 남길 수 없으면 항목 자체를 지워 refresh 가 잔존하지 않게 한다.
                if !token.as_deref().is_some_and(cache_claude_oauth_token) {
                    purge_claude_oauth_credential();
                    return None;
                }
            }
            token
        }
    }
}

fn codex_home_from_process_env() -> Result<PathBuf, String> {
    let home = if let Some(value) = std::env::var_os("CODEX_HOME").filter(|value| !value.is_empty())
    {
        PathBuf::from(value)
    } else {
        let user_home = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Codex home directory is unavailable.".to_string())?;
        PathBuf::from(user_home).join(".codex")
    };
    if !home.is_absolute() {
        return Err("Codex home directory must be an absolute path.".to_string());
    }
    Ok(home)
}

fn validated_codex_auth_path_at(codex_home: &Path) -> Result<PathBuf, String> {
    if !codex_home.is_absolute() {
        return Err("Codex home directory must be an absolute path.".to_string());
    }
    let home_metadata = std::fs::symlink_metadata(codex_home)
        .map_err(|_| "Codex session directory is unavailable.".to_string())?;
    if home_metadata.file_type().is_symlink() || !home_metadata.is_dir() {
        return Err("Codex session directory is not a trusted regular directory.".to_string());
    }

    let auth_path = codex_home.join("auth.json");
    let auth_metadata = std::fs::symlink_metadata(&auth_path)
        .map_err(|_| "Codex subscription session file is unavailable.".to_string())?;
    if auth_metadata.file_type().is_symlink() || !auth_metadata.is_file() {
        return Err("Codex subscription session file is not a trusted regular file.".to_string());
    }
    if auth_metadata.len() == 0 || auth_metadata.len() > CODEX_AUTH_MAX_BYTES {
        return Err("Codex subscription session file has an invalid size.".to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if auth_metadata.permissions().mode() & 0o077 != 0 {
            return Err("Codex subscription session file permissions are too broad.".to_string());
        }
    }

    let canonical_home = std::fs::canonicalize(codex_home)
        .map_err(|_| "Codex session directory could not be verified.".to_string())?;
    let canonical_auth = std::fs::canonicalize(&auth_path)
        .map_err(|_| "Codex subscription session file could not be verified.".to_string())?;
    if canonical_auth.parent() != Some(canonical_home.as_path()) {
        return Err("Codex subscription session file escaped its expected directory.".to_string());
    }
    Ok(auth_path)
}

fn open_validated_codex_auth_file(codex_home: &Path) -> Result<File, String> {
    let auth_path = validated_codex_auth_path_at(codex_home)?;
    let before = std::fs::symlink_metadata(&auth_path)
        .map_err(|_| "Codex subscription session file is unavailable.".to_string())?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW);
    }
    let file = options
        .open(&auth_path)
        .map_err(|_| "Codex subscription session file could not be opened safely.".to_string())?;
    let opened = file
        .metadata()
        .map_err(|_| "Codex subscription session file metadata is unavailable.".to_string())?;
    if !opened.is_file() || opened.len() == 0 || opened.len() > CODEX_AUTH_MAX_BYTES {
        return Err("Codex subscription session file changed during validation.".to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if before.dev() != opened.dev() || before.ino() != opened.ino() {
            return Err("Codex subscription session file changed during validation.".to_string());
        }
    }
    Ok(file)
}

fn validate_codex_access_token(token: &str, now_unix_seconds: i64) -> Result<(), String> {
    let token = token.trim();
    if token.len() > CODEX_ACCESS_TOKEN_MAX_BYTES {
        return Err("Codex access token has an invalid size.".to_string());
    }
    let mut segments = token.split('.');
    let header_segment = segments
        .next()
        .filter(|segment| !segment.is_empty())
        .ok_or_else(|| "Codex access token is not a JWT.".to_string())?;
    let claims_segment = segments
        .next()
        .filter(|segment| !segment.is_empty())
        .ok_or_else(|| "Codex access token is not a JWT.".to_string())?;
    let signature_segment = segments
        .next()
        .filter(|segment| !segment.is_empty())
        .ok_or_else(|| "Codex access token is not a signed JWT.".to_string())?;
    if segments.next().is_some() || signature_segment.len() < 16 {
        return Err("Codex access token is not a signed JWT.".to_string());
    }

    let header_bytes = URL_SAFE_NO_PAD
        .decode(header_segment)
        .map_err(|_| "Codex access token header is invalid.".to_string())?;
    let header: CodexJwtHeader = serde_json::from_slice(&header_bytes)
        .map_err(|_| "Codex access token header schema is invalid.".to_string())?;
    if header.alg.trim().is_empty() || header.alg.eq_ignore_ascii_case("none") {
        return Err("Codex access token is not signed with an accepted algorithm.".to_string());
    }

    let claims_bytes = URL_SAFE_NO_PAD
        .decode(claims_segment)
        .map_err(|_| "Codex access token claims are invalid.".to_string())?;
    let claims: CodexJwtClaims = serde_json::from_slice(&claims_bytes)
        .map_err(|_| "Codex access token claims schema is invalid.".to_string())?;
    if claims.exp <= now_unix_seconds + CODEX_ACCESS_TOKEN_MIN_FRESHNESS_SECONDS {
        return Err("Codex access token is expired or too close to expiry.".to_string());
    }
    Ok(())
}

fn read_codex_subscription_access_token_at(
    codex_home: &Path,
    now_unix_seconds: i64,
) -> Result<String, String> {
    let file = open_validated_codex_auth_file(codex_home)?;
    let mut reader = file.take(CODEX_AUTH_MAX_BYTES + 1);
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .map_err(|_| "Codex subscription session file could not be read.".to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > CODEX_AUTH_MAX_BYTES {
        return Err("Codex subscription session file has an invalid size.".to_string());
    }
    let auth: CodexAuthSession = serde_json::from_slice(&bytes)
        .map_err(|_| "Codex subscription session schema is invalid.".to_string())?;
    if auth.auth_mode.trim() != "chatgpt" {
        return Err("Codex session is not a ChatGPT subscription login.".to_string());
    }
    let access_token = auth.tokens.access_token.trim().to_string();
    validate_codex_access_token(&access_token, now_unix_seconds)?;
    Ok(access_token)
}

fn verify_codex_cli_subscription_login() -> Result<(), String> {
    if !cli_runs_for_provider("codex", "codex") {
        return Err("Codex CLI is unavailable.".to_string());
    }
    let mut command = cli_command("codex");
    command
        .args(["login", "status"])
        .env("PATH", crate::augmented_cli_path());
    clear_bootstrap_credential_env(&mut command);
    let output = command_output_timeout(command, Duration::from_secs(3))
        .map_err(|_| "Codex login status could not be checked.".to_string())?
        .ok_or_else(|| "Codex login status timed out.".to_string())?;
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push('\n');
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    let normalized = combined.to_ascii_lowercase();
    if !output.status.success()
        || !normalized.contains("logged in")
        || !normalized.contains("chatgpt")
    {
        return Err("Codex CLI does not report an active ChatGPT login.".to_string());
    }
    Ok(())
}

/// Read only the fresh access token from the Codex CLI's canonical ChatGPT
/// session after an authoritative `codex login status` check. The refresh
/// token is ignored by the typed schema and is never copied, logged, or passed
/// to the isolated Gajae runtime.
pub fn prepare_gajecode_codex_subscription_token() -> Result<String, String> {
    verify_codex_cli_subscription_login()?;
    let codex_home = codex_home_from_process_env()?;
    read_codex_subscription_access_token_at(&codex_home, chrono::Utc::now().timestamp())
}

fn write_managed_hermes_auth(path: &Path, auth: &Value) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Managed Hermes auth directory is unavailable.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create {}: {error}", parent.display()))?;
    let parent_metadata = std::fs::symlink_metadata(parent)
        .map_err(|error| format!("inspect {}: {error}", parent.display()))?;
    if parent_metadata.file_type().is_symlink() || !parent_metadata.is_dir() {
        return Err("Managed Hermes auth directory is not trusted.".to_string());
    }
    if path.exists() {
        let metadata = std::fs::symlink_metadata(path)
            .map_err(|error| format!("inspect {}: {error}", path.display()))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("Managed Hermes auth file is not trusted.".to_string());
        }
    }

    let text = serde_json::to_string_pretty(auth)
        .map_err(|error| format!("serialize managed Hermes auth: {error}"))?;
    let temp = parent.join(format!(".auth.json.atelier-{}", std::process::id()));
    std::fs::write(&temp, format!("{text}\n"))
        .map_err(|error| format!("write {}: {error}", temp.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("chmod {}: {error}", temp.display()))?;
    }
    std::fs::rename(&temp, path).map_err(|error| format!("publish {}: {error}", path.display()))
}

fn load_managed_hermes_auth(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({ "version": 1 }));
    }
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("inspect {}: {error}", path.display()))?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > CODEX_AUTH_MAX_BYTES
    {
        return Err("Managed Hermes auth file is invalid or untrusted.".to_string());
    }
    let text = std::fs::read_to_string(path)
        .map_err(|error| format!("read {}: {error}", path.display()))?;
    let auth: Value = serde_json::from_str(&text)
        .map_err(|error| format!("parse managed Hermes auth: {error}"))?;
    if !auth.is_object() {
        return Err("Managed Hermes auth root is invalid.".to_string());
    }
    Ok(auth)
}

fn stage_codex_access_for_managed_hermes_at(
    hermes_home: &Path,
    access_token: &str,
) -> Result<bool, String> {
    if access_token.trim().is_empty() {
        return Err("Codex subscription access token is empty.".to_string());
    }
    let auth_path = hermes_home.join("auth.json");
    let mut auth = load_managed_hermes_auth(&auth_path)?;
    let root = auth
        .as_object_mut()
        .ok_or_else(|| "Managed Hermes auth root is invalid.".to_string())?;
    let current_active_provider = root.get("active_provider").cloned();

    if !root.get("providers").is_some_and(Value::is_object) {
        root.insert("providers".into(), serde_json::json!({}));
    }
    let providers = root
        .get_mut("providers")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Managed Hermes provider store is invalid.".to_string())?;
    if providers
        .get("openai-codex")
        .and_then(Value::as_object)
        .is_some_and(|provider| {
            !provider
                .get("atelier_managed")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
    {
        // A user-owned Hermes OAuth session always wins. Atelier must not
        // replace it with the short-lived Codex CLI access token.
        return Ok(false);
    }

    let previous_active_provider = providers
        .get("openai-codex")
        .and_then(Value::as_object)
        .and_then(|provider| provider.get("atelier_previous_active_provider"))
        .cloned()
        .or(current_active_provider);
    let staged_at = chrono::Utc::now().to_rfc3339();
    let mut provider = serde_json::json!({
        "auth_mode": MANAGED_HERMES_CODEX_AUTH_MODE,
        "atelier_managed": true,
        "last_refresh": staged_at,
        "tokens": {
            "access_token": access_token.trim(),
            // Hermes currently requires a refresh_token-shaped value before
            // it will use a Codex access token. This marker is deliberately
            // non-secret and cannot rotate the canonical Codex CLI session.
            "refresh_token": MANAGED_HERMES_CODEX_REFRESH_MARKER
        }
    });
    if let Some(previous) = previous_active_provider {
        provider
            .as_object_mut()
            .expect("provider fixture is an object")
            .insert("atelier_previous_active_provider".into(), previous);
    }
    providers.insert("openai-codex".into(), provider);

    if !root.get("credential_pool").is_some_and(Value::is_object) {
        root.insert("credential_pool".into(), serde_json::json!({}));
    }
    if let Some(pool) = root
        .get_mut("credential_pool")
        .and_then(Value::as_object_mut)
        .and_then(|pools| pools.get_mut("openai-codex"))
        .and_then(Value::as_array_mut)
    {
        pool.retain(|entry| {
            entry.get("refresh_token").and_then(Value::as_str)
                != Some(MANAGED_HERMES_CODEX_REFRESH_MARKER)
        });
    }
    root.insert(
        "active_provider".into(),
        Value::String("openai-codex".into()),
    );
    root.insert("updated_at".into(), Value::String(staged_at));
    write_managed_hermes_auth(&auth_path, &auth)?;
    Ok(true)
}

fn scrub_codex_access_from_managed_hermes_at(hermes_home: &Path) -> Result<(), String> {
    let auth_path = hermes_home.join("auth.json");
    if !auth_path.exists() {
        return Ok(());
    }
    let mut auth = load_managed_hermes_auth(&auth_path)?;
    let root = auth
        .as_object_mut()
        .ok_or_else(|| "Managed Hermes auth root is invalid.".to_string())?;
    let previous_active_provider = root
        .get("providers")
        .and_then(Value::as_object)
        .and_then(|providers| providers.get("openai-codex"))
        .and_then(Value::as_object)
        .filter(|provider| {
            provider
                .get("atelier_managed")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .and_then(|provider| provider.get("atelier_previous_active_provider"))
        .cloned();
    let remove_provider = root
        .get("providers")
        .and_then(Value::as_object)
        .and_then(|providers| providers.get("openai-codex"))
        .and_then(Value::as_object)
        .is_some_and(|provider| {
            provider
                .get("atelier_managed")
                .and_then(Value::as_bool)
                .unwrap_or(false)
                || provider
                    .get("tokens")
                    .and_then(Value::as_object)
                    .and_then(|tokens| tokens.get("refresh_token"))
                    .and_then(Value::as_str)
                    == Some(MANAGED_HERMES_CODEX_REFRESH_MARKER)
        });
    if remove_provider {
        if let Some(providers) = root.get_mut("providers").and_then(Value::as_object_mut) {
            providers.remove("openai-codex");
        }
    }
    if let Some(pool) = root
        .get_mut("credential_pool")
        .and_then(Value::as_object_mut)
        .and_then(|pools| pools.get_mut("openai-codex"))
        .and_then(Value::as_array_mut)
    {
        pool.retain(|entry| {
            entry.get("refresh_token").and_then(Value::as_str)
                != Some(MANAGED_HERMES_CODEX_REFRESH_MARKER)
        });
    }
    if root.get("active_provider").and_then(Value::as_str) == Some("openai-codex")
        && remove_provider
    {
        match previous_active_provider {
            Some(previous)
                if previous
                    .as_str()
                    .is_some_and(|value| !value.trim().is_empty()) =>
            {
                root.insert("active_provider".into(), previous);
            }
            _ => {
                root.remove("active_provider");
            }
        }
    }
    root.insert(
        "updated_at".into(),
        Value::String(chrono::Utc::now().to_rfc3339()),
    );
    write_managed_hermes_auth(&auth_path, &auth)
}

pub struct ManagedHermesCodexAccess {
    home: PathBuf,
    staged: bool,
}

impl Drop for ManagedHermesCodexAccess {
    fn drop(&mut self) {
        if !self.staged {
            return;
        }
        let should_scrub = MANAGED_HERMES_CODEX_STAGE_COUNTS
            .lock()
            .map(|mut counts| {
                let Some(count) = counts.get_mut(&self.home) else {
                    return false;
                };
                *count = count.saturating_sub(1);
                if *count == 0 {
                    counts.remove(&self.home);
                    true
                } else {
                    false
                }
            })
            .unwrap_or(false);
        if should_scrub {
            if let Err(error) = scrub_codex_access_from_managed_hermes_at(&self.home) {
                log::warn!("failed to scrub managed Hermes Codex access: {error}");
            }
        }
    }
}

pub fn stage_codex_access_for_managed_hermes(
    hermes_home: &Path,
) -> Result<ManagedHermesCodexAccess, String> {
    let mut counts = MANAGED_HERMES_CODEX_STAGE_COUNTS
        .lock()
        .map_err(|_| "Managed Hermes Codex staging lock is unavailable.".to_string())?;
    if let Some(count) = counts.get_mut(hermes_home) {
        *count += 1;
        return Ok(ManagedHermesCodexAccess {
            home: hermes_home.to_path_buf(),
            staged: true,
        });
    }
    let access_token = prepare_gajecode_codex_subscription_token()?;
    let staged = stage_codex_access_for_managed_hermes_at(hermes_home, &access_token)?;
    if staged {
        counts.insert(hermes_home.to_path_buf(), 1);
    }
    Ok(ManagedHermesCodexAccess {
        home: hermes_home.to_path_buf(),
        staged,
    })
}

fn scrub_gajecode_managed_claude_credential() -> Result<(), String> {
    let Some(agent_dir) = gajecode_agent_dir() else {
        return Ok(());
    };
    let Some(bun) = gajecode_bun_executable_path() else {
        return Ok(());
    };
    let agent_db = agent_dir.join("agent.db");
    if !agent_db.exists() {
        return Ok(());
    }
    let script = r#"
import { Database } from "bun:sqlite";
const db = new Database(process.env.ATELIER_GAJAECODE_AGENT_DB);
const rows = db.query(`
  SELECT id, data FROM auth_credentials
  WHERE identity_key = 'atelier-claude-subscription'
`).all();
for (const row of rows) {
  let data = {};
  try { data = JSON.parse(row.data || "{}"); } catch {}
  delete data.refresh;
  delete data.refreshToken;
  delete data.refresh_token;
  db.query(`
    UPDATE auth_credentials
    SET data = ?, disabled_cause = 'atelier-keychain-env-migration', updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(data), Math.floor(Date.now() / 1000), row.id);
}
db.close();
"#;
    let mut command = Command::new(bun);
    command
        .arg("--eval")
        .arg(script)
        .env("ATELIER_GAJAECODE_AGENT_DB", &agent_db);
    let output = command_output_timeout(command, Duration::from_secs(4))
        .map_err(|e| format!("scrub Gajae managed OAuth credential: {e}"))?;
    if output.is_some_and(|output| !output.status.success()) {
        return Err("Gajae managed OAuth credential migration failed.".to_string());
    }
    Ok(())
}

pub fn prepare_gajecode_claude_subscription_token() -> Result<Option<String>, String> {
    scrub_gajecode_managed_claude_credential()?;
    Ok(read_claude_subscription_oauth_token())
}

#[tauri::command]
pub async fn provider_status(provider: String) -> Result<ProviderStatus, String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    let cli_installed = provider_cli_installed(&provider, &meta);
    let oauth_logged_in = meta.supports_oauth && detect_oauth(&provider);
    let (api_key_present, api_key_masked) = if meta.supports_api {
        if let Some(key) = read_api_key(&provider) {
            let _ = update_credential_state(&provider, |state| {
                state.api_key_present = true;
                state.api_key_masked = mask_key(&key);
            });
            (true, mask_key(&key))
        } else {
            let _ = update_credential_state(&provider, |state| {
                state.api_key_present = false;
                state.api_key_masked.clear();
            });
            (false, String::new())
        }
    } else {
        (false, String::new())
    };

    Ok(ProviderStatus {
        provider,
        cli_installed,
        oauth_logged_in,
        api_key_present,
        api_key_masked,
        supports_oauth: meta.supports_oauth,
        supports_api: meta.supports_api,
    })
}

#[tauri::command]
pub async fn provider_save_api_key(provider: String, api_key: String) -> Result<(), String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    if !meta.supports_api {
        return Err(format!("{provider} does not support API key"));
    }
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("api_key is empty".into());
    }
    // 구독은 API 키 칸이 아니라 구독 로그인 버튼으로 연결한다. 우회 저장은 토큰을
    // 터미널에서 직접 발급해 붙여넣는 절차를 존속시키므로, 값의 정체를 짚어 실제로
    // 동작하는 버튼 하나만 가리킨다.
    if provider == "claude" && trimmed.starts_with("sk-ant-oat") {
        return Err(CLAUDE_SUBSCRIPTION_TOKEN_IN_API_SLOT.to_string());
    }
    if !is_valid_api_key_for_provider(&provider, trimmed) {
        return Err(api_key_rejection_message(&provider));
    }
    let entry = keychain_entry(&provider, "api_key")?;
    entry
        .set_password(trimmed)
        .map_err(|e| format!("save: {e}"))?;
    set_api_key_state(&provider, Some(trimmed));
    Ok(())
}

#[tauri::command]
pub async fn provider_clear_credentials(provider: String) -> Result<(), String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    for slot in ["api_key", "oauth_marker", "oauth_token"] {
        if let Ok(entry) = keychain_entry(&provider, slot) {
            let _ = entry.delete_credential();
        }
    }
    if meta.supports_oauth {
        if provider == "grok" {
            if grok_executable_path().is_some() {
                if let Err(e) = run_oauth_logout(&provider, "grok") {
                    log::warn!("oauth logout during credential clear failed for {provider}: {e}");
                }
            }
        } else if provider == "gajecode" {
            if gajecode_cli_installed() {
                if let Err(e) = run_gajecode_oauth_logout() {
                    log::warn!("oauth logout during credential clear failed for {provider}: {e}");
                }
            }
        } else if let Some(cli) = meta.cli {
            if which(cli) {
                if let Err(e) = run_oauth_logout(&provider, cli) {
                    log::warn!("oauth logout during credential clear failed for {provider}: {e}");
                }
            }
        }
    }
    let _ = update_credential_state(&provider, |state| {
        state.oauth_logged_in = false;
        state.api_key_present = false;
        state.api_key_masked.clear();
    });
    Ok(())
}

/// CLI subprocess 로 OAuth 로그인 시작. Claude/Codex/Grok 지원.
/// CLI 가 사용자 기본 브라우저를 열어 SNS(Google/Apple/GitHub 등) 로그인 페이지로 보낸다.
/// blocking 으로 기다리지 않고 즉시 반환 — 프론트가 status polling 으로 완료 감지.
#[tauri::command]
pub async fn provider_login_oauth(
    provider: String,
    force: Option<bool>,
) -> Result<ProviderLoginOauthResult, String> {
    let meta = provider_meta(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    if !meta.supports_oauth {
        return Err(format!("{provider} does not support OAuth"));
    }
    let cli = meta.cli.ok_or("cli not configured")?;
    let cmd = meta.login_cmd.ok_or("login_cmd not configured")?;
    let cli_installed = provider_cli_installed(&provider, &meta);
    if !cli_installed {
        return Err(format!(
            "CLI '{cli}' is not installed or cannot run. Use automatic install, then try subscription sign-in again."
        ));
    }
    let force_login = force.unwrap_or(false);
    if !force_login && detect_oauth(&provider) {
        set_oauth_state(&provider, true);
        // 이미 연결된 상태를 보고하면서 지난 실패를 남겨두면 프론트 폴링이 그 오류를
        // 집어 "연결됨"을 실패로 덮어쓴다.
        clear_oauth_login_runtime(&provider);
        return Ok(ProviderLoginOauthResult {
            provider,
            command: format!("{cli} {cmd}"),
            started: false,
            completed: true,
            already_logged_in: true,
            browser_opened: false,
            login_url_detected: false,
            login_url: None,
            diagnostic: None,
            message: "OAuth is already connected.".into(),
        });
    }
    // 코드 전달 통로가 프로바이더당 하나뿐이므로, 앞선 시도를 살려 둔 채 새로 시작하면
    // 사용자가 브라우저에서 본 코드가 다른 시도의 프로세스로 배달된다.
    terminate_stale_oauth_login(&provider);
    if force_login {
        if let Err(e) = run_oauth_logout(&provider, cli) {
            log::warn!("forced oauth logout before login failed for {provider}: {e}");
        }
        if provider == "claude" {
            if let Ok(entry) = keychain_entry("claude", "oauth_token") {
                let _ = entry.delete_credential();
            }
        }
        set_oauth_state(&provider, false);
    }

    let cli_owned = cli.to_string();
    let login_attempts = oauth_login_attempts(&provider, cmd);
    let attempt_count = login_attempts.len();
    let mut last_failure: Option<String> = None;

    for (attempt_index, login_args) in login_attempts.into_iter().enumerate() {
        let provider_clone = provider.clone();
        let cmd_owned = login_args.join(" ");
        let command_label = format!("{cli_owned} {cmd_owned}");
        let epoch = begin_oauth_login_epoch(&provider_clone);
        start_oauth_login_runtime(&provider_clone);
        let hinted_login_url = oauth_login_url_hint(&provider_clone, &login_args);
        let hinted_browser_opened =
            hinted_login_url.is_some_and(|url| auto_open_login_url(&provider_clone, url, None));
        if oauth_login_uses_pty(&provider) {
            let pty_system = NativePtySystem::default();
            let pair = pty_system
                .openpty(PtySize {
                    rows: 24,
                    cols: OAUTH_LOGIN_PTY_COLS,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| {
                    oauth_login_error(
                        &provider_clone,
                        format!("oauth openpty {cli_owned} {cmd_owned}: {e}"),
                    )
                })?;
            let cmd = oauth_pty_login_command(&cli_owned, &login_args);
            let mut child = pair.slave.spawn_command(cmd).map_err(|e| {
                oauth_login_error(
                    &provider_clone,
                    format!("oauth spawn {cli_owned} {cmd_owned}: {e}"),
                )
            })?;
            drop(pair.slave);

            let captured = Arc::new(Mutex::new(String::new()));
            let reader = pair.master.try_clone_reader().map_err(|e| {
                oauth_login_error(
                    &provider_clone,
                    format!("oauth clone reader {cli_owned} {cmd_owned}: {e}"),
                )
            })?;
            let writer = pair.master.take_writer().map_err(|e| {
                oauth_login_error(
                    &provider_clone,
                    format!("oauth take writer {cli_owned} {cmd_owned}: {e}"),
                )
            })?;
            store_oauth_login_pty_writer(&provider_clone, writer);
            store_oauth_login_terminator(
                &provider_clone,
                OAuthLoginTerminator::Pty(child.clone_killer()),
            );
            capture_login_pipe(
                reader,
                captured.clone(),
                Some(LoginStreamWatch {
                    provider: provider_clone.clone(),
                    epoch,
                }),
            );
            spawn_oauth_login_runtime_watcher(provider_clone.clone(), captured.clone(), epoch);

            let started = Instant::now();
            let mut browser_opened = hinted_browser_opened;
            let mut login_url_detected = hinted_login_url.is_some();
            loop {
                if !login_url_detected {
                    let output = captured_login_output(&captured);
                    if let Some(url) = detected_provider_login_url(&provider_clone, &output) {
                        login_url_detected = true;
                        browser_opened = auto_open_login_url(&provider_clone, &url, Some(&output));
                    }
                }

                match child.try_wait().map_err(|e| {
                    oauth_login_error(
                        &provider_clone,
                        format!("{cli_owned} {cmd_owned} poll: {e}"),
                    )
                })? {
                    Some(status) if status.success() => {
                        let _ = child.wait();
                        forget_oauth_login_session(&provider_clone);
                        // 자격증명이 실제로 저장됐을 때만 완료로 보고한다. 그래야
                        // 프론트가 모달을 닫지 않고 실패 사유를 그대로 보여준다.
                        let credential_stored =
                            mark_oauth_login_success(&provider_clone, &captured);
                        refresh_oauth_login_runtime(&provider_clone, &captured);
                        finish_oauth_login_runtime(&provider_clone);
                        let (login_url, diagnostic) = oauth_login_result_extras(&provider_clone);
                        return Ok(ProviderLoginOauthResult {
                            provider,
                            command: command_label,
                            started: true,
                            completed: credential_stored,
                            already_logged_in: false,
                            browser_opened,
                            login_url_detected,
                            login_url,
                            diagnostic,
                            message: if credential_stored {
                                "OAuth login command completed.".to_string()
                            } else {
                                CLAUDE_SUBSCRIPTION_TOKEN_MISSING.to_string()
                            },
                        });
                    }
                    Some(status) => {
                        let _ = child.wait();
                        forget_oauth_login_session(&provider_clone);
                        thread::sleep(Duration::from_millis(80));
                        let detail = login_failure_detail_text(&captured_login_output(&captured))
                            .trim()
                            .to_string();
                        let failure = match detail {
                            detail if !detail.is_empty() => {
                                format!("{cli_owned} {cmd_owned} exited with {status:?}: {detail}")
                            }
                            _ => format!("{cli_owned} {cmd_owned} exited with {status:?}"),
                        };
                        fail_oauth_login_runtime(&provider_clone, failure.clone());
                        if attempt_index + 1 < attempt_count {
                            log::warn!(
                                "oauth login attempt failed for {provider} ({cmd_owned}); trying fallback: {failure}"
                            );
                            last_failure = Some(failure);
                            break;
                        }
                        return Err(failure);
                    }
                    None if started.elapsed() >= Duration::from_millis(1500) => {
                        if !login_url_detected {
                            watch_and_open_login_url(provider_clone.clone(), captured.clone());
                        }
                        refresh_oauth_login_runtime(&provider_clone, &captured);
                        let (login_url, diagnostic) = oauth_login_result_extras(&provider_clone);

                        let master = pair.master;
                        std::thread::spawn(move || {
                            let _keep_master_alive = master;
                            let failure = match child.wait() {
                                Ok(status) if status.success() => None,
                                Ok(status) => {
                                    let detail = login_failure_detail_text(&captured_login_output(
                                        &captured,
                                    ));
                                    Some(if detail.trim().is_empty() {
                                        format!("{cli_owned} {cmd_owned} exited with {status:?}")
                                    } else {
                                        format!(
                                            "{cli_owned} {cmd_owned} exited with {status:?}: {detail}"
                                        )
                                    })
                                }
                                Err(e) => Some(format!("{cli_owned} wait: {e}")),
                            };
                            settle_detached_oauth_login(&provider_clone, epoch, &captured, failure);
                        });
                        return Ok(ProviderLoginOauthResult {
                            provider,
                            command: command_label,
                            started: true,
                            completed: false,
                            already_logged_in: false,
                            browser_opened,
                            login_url_detected,
                            login_url,
                            diagnostic,
                            message: if browser_opened {
                                "OAuth login started and the browser was opened.".into()
                            } else if login_url_detected {
                                "OAuth login started, but Atelier could not open the browser automatically.".into()
                            } else {
                                "OAuth login started. Atelier is waiting for the CLI browser code."
                                    .into()
                            },
                        });
                    }
                    None => thread::sleep(Duration::from_millis(80)),
                }
            }

            continue;
        }

        let mut command = if provider == "gajecode" {
            gajecode_isolated_cli_command()?
        } else if provider == "grok" {
            grok_isolated_cli_command()?
        } else {
            let mut command = cli_command(&cli_owned);
            command.env("PATH", crate::augmented_cli_path());
            command
        };
        command
            .args(&login_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(if provider == "claude" {
                Stdio::piped()
            } else {
                Stdio::null()
            });
        configure_login_browser_env_for_command(&mut command);
        configure_background_command(&mut command);
        let mut child = command.spawn().map_err(|e| {
            oauth_login_error(
                &provider_clone,
                format!("oauth spawn {cli_owned} {cmd_owned}: {e}"),
            )
        })?;
        let captured = Arc::new(Mutex::new(String::new()));
        store_oauth_login_terminator(&provider_clone, OAuthLoginTerminator::Process(child.id()));
        if provider == "claude" {
            if let Some(stdin) = child.stdin.take() {
                store_oauth_login_stdin(&provider_clone, stdin);
            }
        }
        let watch = LoginStreamWatch {
            provider: provider_clone.clone(),
            epoch,
        };
        if let Some(stdout) = child.stdout.take() {
            capture_login_pipe(stdout, captured.clone(), Some(watch.clone()));
        }
        if let Some(stderr) = child.stderr.take() {
            capture_login_pipe(stderr, captured.clone(), Some(watch));
        }
        spawn_oauth_login_runtime_watcher(provider_clone.clone(), captured.clone(), epoch);

        // Claude/Codex CLI가 Windows에서 즉시 실패하는 경우에는 "브라우저가 열렸습니다"
        // 모달을 띄우면 사용자가 무한 대기 상태로 보인다. 짧게만 관찰해서 즉시 실패는
        // 호출자에게 돌려주고, 실제 로그인 대기는 백그라운드에서 계속 처리한다.
        let started = Instant::now();
        let mut browser_opened = hinted_browser_opened;
        let mut login_url_detected = hinted_login_url.is_some();
        loop {
            if !login_url_detected {
                let output = captured_login_output(&captured);
                if let Some(url) = detected_provider_login_url(&provider_clone, &output) {
                    login_url_detected = true;
                    browser_opened = auto_open_login_url(&provider_clone, &url, Some(&output));
                }
            }
            match child.try_wait().map_err(|e| {
                oauth_login_error(
                    &provider_clone,
                    format!("{cli_owned} {cmd_owned} poll: {e}"),
                )
            })? {
                Some(status) if status.success() => {
                    let _ = child.wait();
                    forget_oauth_login_session(&provider_clone);
                    let credential_stored = mark_oauth_login_success(&provider_clone, &captured);
                    refresh_oauth_login_runtime(&provider_clone, &captured);
                    finish_oauth_login_runtime(&provider_clone);
                    let (login_url, diagnostic) = oauth_login_result_extras(&provider_clone);
                    return Ok(ProviderLoginOauthResult {
                        provider,
                        command: command_label,
                        started: true,
                        completed: credential_stored,
                        already_logged_in: false,
                        browser_opened,
                        login_url_detected,
                        login_url,
                        diagnostic,
                        message: if credential_stored {
                            "OAuth login command completed.".to_string()
                        } else {
                            CLAUDE_SUBSCRIPTION_TOKEN_MISSING.to_string()
                        },
                    });
                }
                Some(status) => {
                    let _ = child.wait();
                    forget_oauth_login_session(&provider_clone);
                    thread::sleep(Duration::from_millis(80));
                    let detail = login_failure_detail_text(&captured_login_output(&captured))
                        .trim()
                        .to_string();
                    let failure = match detail {
                        detail if !detail.is_empty() => {
                            format!("{cli_owned} {cmd_owned} exited with {status}: {detail}")
                        }
                        _ => format!("{cli_owned} {cmd_owned} exited with {status}"),
                    };
                    fail_oauth_login_runtime(&provider_clone, failure.clone());
                    if attempt_index + 1 < attempt_count {
                        log::warn!(
                            "oauth login attempt failed for {provider} ({cmd_owned}); trying fallback: {failure}"
                        );
                        last_failure = Some(failure);
                        break;
                    }
                    return Err(failure);
                }
                None if started.elapsed() >= Duration::from_millis(1500) => {
                    if !login_url_detected {
                        watch_and_open_login_url(provider_clone.clone(), captured.clone());
                    }
                    refresh_oauth_login_runtime(&provider_clone, &captured);
                    let (login_url, diagnostic) = oauth_login_result_extras(&provider_clone);

                    std::thread::spawn(move || {
                        let failure = match child.wait() {
                            Ok(status) if status.success() => None,
                            Ok(status) => {
                                let detail =
                                    login_failure_detail_text(&captured_login_output(&captured));
                                Some(if detail.trim().is_empty() {
                                    format!("{cli_owned} {cmd_owned} exited with {status}")
                                } else {
                                    format!(
                                        "{cli_owned} {cmd_owned} exited with {status}: {detail}"
                                    )
                                })
                            }
                            Err(e) => Some(format!("{cli_owned} wait: {e}")),
                        };
                        settle_detached_oauth_login(&provider_clone, epoch, &captured, failure);
                    });
                    return Ok(ProviderLoginOauthResult {
                        provider,
                        command: command_label,
                        started: true,
                        completed: false,
                        already_logged_in: false,
                        browser_opened,
                        login_url_detected,
                        login_url,
                        diagnostic,
                        message: if browser_opened {
                            "OAuth login started and the browser was opened.".into()
                        } else if login_url_detected {
                            "OAuth login started, but Atelier could not open the browser automatically.".into()
                        } else {
                            "OAuth login started. Atelier is waiting for the CLI browser code."
                                .into()
                        },
                    });
                }
                None => thread::sleep(Duration::from_millis(80)),
            }
        }
    }

    Err(last_failure.unwrap_or_else(|| format!("{cli_owned} {cmd} login failed")))
}

#[tauri::command]
pub async fn provider_oauth_login_state(
    provider: String,
) -> Result<ProviderOauthLoginState, String> {
    let snapshot = oauth_login_runtime_snapshot(&provider);
    Ok(ProviderOauthLoginState {
        provider,
        active: snapshot.active,
        browser_opened: snapshot.browser_opened,
        login_url: snapshot.login_url,
        output: snapshot.output,
        error: snapshot.error,
        submit_warning: snapshot.submit_warning,
        updated_at_ms: snapshot.updated_at_ms,
    })
}

#[tauri::command]
pub async fn provider_open_oauth_login_url(provider: String, url: String) -> Result<(), String> {
    let url = url.trim();
    if !is_provider_login_url(&provider, url) {
        return Err("The login URL is not an approved HTTPS endpoint for this provider.".into());
    }
    // 사용자가 직접 누른 경로다. "브라우저가 안 열렸으니 다시 열어줘"가 이 버튼의 존재
    // 이유이므로 중복 기록을 검사하지 않고 언제나 연다. 대신 연 사실은 기록해서 뒤늦게
    // 깨어난 자동 오픈 경로가 같은 URL 로 창을 하나 더 띄우지 않게 한다.
    if open_login_url_in_browser(url) {
        remember_oauth_login_url(&provider, url);
        remember_oauth_browser_opened(&provider, true);
        mark_login_url_opened(&provider, url);
        Ok(())
    } else {
        Err("Failed to open the login URL in the default browser.".into())
    }
}

/// 코드 본문과 Enter 를 로그인 입력 통로에 실제로 밀어 넣는다. PTY 는 raw 모드라 Enter
/// 가 CR 이고, CR 이 코드와 같은 청크에 실려 오면 TUI 가 통째로 문자 입력으로 읽어
/// 제출이 사라진다. 그래서 CR 만 따로, 짧은 간격을 두고 보낸다.
///
/// bracketed paste(`ESC[200~`…`ESC[201~`)로 감싸지 않는 이유: 실측에서 코드 문자열은
/// 이미 그대로 도착했고(빠진 것은 Enter 뿐이다), 프롬프트가 마커를 해석하지 않으면 그
/// 바이트가 코드에 섞여 들어가고, 해석하더라도 붙여넣기를 요약 표시로 접는 입력기에서는
/// 코드 대신 자리표시자가 남는다. 얻을 것은 없고 잃을 것만 있는 변경이다.
fn write_oauth_code_to_login_input(provider: &str, code: &str) -> Result<(), String> {
    let mut map = OAUTH_LOGIN_STDIN
        .lock()
        .map_err(|_| "login stdin lock poisoned".to_string())?;
    let input = map.get_mut(provider).ok_or_else(|| {
        "No active OAuth login is waiting for an authentication code.".to_string()
    })?;
    let terminator = input.submit_terminator();
    let detached_enter = input.submit_needs_detached_enter();

    if detached_enter {
        let writer = input.writer();
        writer
            .write_all(code.as_bytes())
            .map_err(|e| format!("write authentication code: {e}"))?;
        writer
            .flush()
            .map_err(|e| format!("flush authentication code: {e}"))?;
        thread::sleep(Duration::from_millis(120));
    }

    let writer = input.writer();
    if detached_enter {
        writer
            .write_all(terminator)
            .map_err(|e| format!("write authentication code: {e}"))?;
    } else {
        let mut line = Vec::with_capacity(code.len() + terminator.len());
        line.extend_from_slice(code.as_bytes());
        line.extend_from_slice(terminator);
        writer
            .write_all(&line)
            .map_err(|e| format!("write authentication code: {e}"))?;
    }
    writer
        .flush()
        .map_err(|e| format!("flush authentication code: {e}"))
}

#[tauri::command]
pub async fn provider_submit_oauth_code(provider: String, code: String) -> Result<(), String> {
    let code = code.trim().to_string();
    if code.is_empty() {
        return Err("authentication code is empty".into());
    }
    if code.len() > 4096 || code.chars().any(|c| c == '\n' || c == '\r') {
        return Err("authentication code format is invalid".into());
    }
    let provider_for_write = provider.clone();
    let code_for_write = code.clone();
    // Enter 를 따로 보내느라 잠깐 잠들기 때문에 async 실행자 스레드를 붙잡지 않는다.
    tauri::async_runtime::spawn_blocking(move || {
        write_oauth_code_to_login_input(&provider_for_write, &code_for_write)
    })
    .await
    .map_err(|error| format!("submit authentication code task failed: {error}"))??;

    let submit_seq = note_oauth_code_submitted(&provider);
    let epoch = current_oauth_login_epoch(&provider);
    spawn_oauth_code_submit_watchdog(provider, epoch, submit_seq);
    Ok(())
}

/// CLI 자동 설치 — npm 으로 claude-code / codex 를 글로벌 설치.
/// 새 사용자가 터미널 없이 한 클릭으로 셋업할 수 있도록.
#[tauri::command]
pub async fn provider_install_cli(provider: String) -> Result<(), String> {
    let provider_for_install = provider.clone();
    tauri::async_runtime::spawn_blocking(move || match provider_for_install.as_str() {
        "claude" => install_npm_cli("claude", CLAUDE_CODE_PACKAGE),
        "codex" => install_npm_cli("codex", CODEX_PACKAGE),
        "hermes" | "gajecode" | "grok" => {
            let app_support = app_support_dir().ok_or_else(|| {
                "Could not resolve the Atelier Application Support directory.".to_string()
            })?;
            ensure_managed_agent_runtime_blocking_at(&app_support, &provider_for_install, |_, _| {})
                .map(|_| ())
        }
        _ => Err(format!(
            "automatic install not available for {provider_for_install}"
        )),
    })
    .await
    .map_err(|error| format!("{provider} installer task failed: {error}"))??;

    let meta = provider_meta(&provider)
        .ok_or_else(|| format!("automatic install not available for {provider}"))?;
    if !provider_cli_installed(&provider, &meta) {
        return Err(format!(
            "{provider} installer exited successfully, but the CLI could not be verified"
        ));
    }
    Ok(())
}

fn capture_installer_stream<R>(mut reader: R) -> thread::JoinHandle<Vec<u8>>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut captured = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            let read = match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(read) => read,
            };
            if read >= CLI_INSTALL_CAPTURE_LIMIT {
                captured.clear();
                captured.extend_from_slice(&chunk[read - CLI_INSTALL_CAPTURE_LIMIT..read]);
                continue;
            }
            let overflow = captured
                .len()
                .saturating_add(read)
                .saturating_sub(CLI_INSTALL_CAPTURE_LIMIT);
            if overflow > 0 {
                captured.drain(..overflow);
            }
            captured.extend_from_slice(&chunk[..read]);
        }
        captured
    })
}

fn installer_output(stdout: &[u8], stderr: &[u8]) -> String {
    let mut combined = String::from_utf8_lossy(stdout).into_owned();
    if !combined.is_empty() && !stderr.is_empty() {
        combined.push('\n');
    }
    combined.push_str(&String::from_utf8_lossy(stderr));
    crate::agent_process::clip_cli_output(redact_login_output(&combined))
}

fn run_cli_installer(mut command: Command, label: &'static str) -> Result<(), String> {
    configure_background_command(&mut command);
    let has_explicit_path = command
        .get_envs()
        .any(|(key, value)| value.is_some() && key == "PATH");
    if !has_explicit_path {
        command.env("PATH", crate::augmented_cli_path());
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("{label} installer could not start: {error}"))?;
    let stdout_reader = child.stdout.take().map(capture_installer_stream);
    let stderr_reader = child.stderr.take().map(capture_installer_stream);
    let started = Instant::now();
    let (status, timed_out) = loop {
        match child.try_wait() {
            Ok(Some(status)) => break (status, false),
            Ok(None) if started.elapsed() < CLI_INSTALL_TIMEOUT => {
                thread::sleep(Duration::from_millis(80));
            }
            Ok(None) => {
                let _ = child.kill();
                let status = child
                    .wait()
                    .map_err(|error| format!("{label} installer timeout cleanup: {error}"))?;
                break (status, true);
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{label} installer status check failed: {error}"));
            }
        }
    };
    let stdout = stdout_reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    let stderr = stderr_reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    let detail = installer_output(&stdout, &stderr);
    if timed_out {
        return Err(format!(
            "{label} installer timed out after {} seconds{}",
            CLI_INSTALL_TIMEOUT.as_secs(),
            if detail.trim().is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        ));
    }
    if status.success() {
        log::info!("{label} install completed");
        Ok(())
    } else {
        Err(format!(
            "{label} installer exited with {status}{}",
            if detail.trim().is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        ))
    }
}

fn run_runtime_probe(
    mut command: Command,
    label: &'static str,
    timeout: Duration,
) -> Result<String, String> {
    configure_background_command(&mut command);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = command
        .spawn()
        .map_err(|error| format!("{label} could not start: {error}"))?;
    let (output, timed_out) = crate::agent_process::wait_with_timeout(child, timeout)?;
    let detail = installer_output(&output.stdout, &output.stderr);
    if timed_out {
        return Err(format!(
            "{label} timed out after {} seconds",
            timeout.as_secs()
        ));
    }
    if !output.status.success() {
        return Err(format!(
            "{label} failed{}",
            if detail.trim().is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        ));
    }
    Ok(detail)
}

fn canonical_managed_file(path: &Path, root: &Path) -> Result<PathBuf, String> {
    let canonical_root = std::fs::canonicalize(root)
        .map_err(|error| format!("resolve {}: {error}", root.display()))?;
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("resolve {}: {error}", path.display()))?;
    if !canonical.starts_with(&canonical_root) || !canonical.is_file() {
        return Err(format!(
            "Managed executable is outside Atelier Application Support: {}",
            canonical.display()
        ));
    }
    Ok(canonical)
}

fn collect_bounded_regular_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let root_metadata = std::fs::symlink_metadata(root)
        .map_err(|error| format!("inspect managed skill root {}: {error}", root.display()))?;
    if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
        return Err(format!(
            "Managed skill root is not a real directory: {}",
            root.display()
        ));
    }

    let mut pending = vec![(root.to_path_buf(), 0usize)];
    let mut files = Vec::new();
    let mut total_bytes = 0u64;
    while let Some((dir, depth)) = pending.pop() {
        if depth > MANAGED_SKILL_TREE_MAX_DEPTH {
            return Err("Managed skill tree exceeds the maximum directory depth.".to_string());
        }
        let entries = std::fs::read_dir(&dir)
            .map_err(|error| format!("read managed skill directory {}: {error}", dir.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| {
                format!(
                    "read managed skill directory entry {}: {error}",
                    dir.display()
                )
            })?;
            let path = entry.path();
            let metadata = std::fs::symlink_metadata(&path).map_err(|error| {
                format!("inspect managed skill path {}: {error}", path.display())
            })?;
            if metadata.file_type().is_symlink() {
                return Err(format!(
                    "Managed skill tree contains a symbolic link: {}",
                    path.display()
                ));
            }
            if metadata.is_dir() {
                pending.push((path, depth + 1));
                continue;
            }
            if !metadata.is_file() {
                return Err(format!(
                    "Managed skill tree contains a non-regular file: {}",
                    path.display()
                ));
            }
            total_bytes = total_bytes
                .checked_add(metadata.len())
                .ok_or_else(|| "Managed skill tree byte count overflowed.".to_string())?;
            if total_bytes > MANAGED_SKILL_TREE_MAX_BYTES {
                return Err("Managed skill tree exceeds the maximum byte size.".to_string());
            }
            files.push(path);
            if files.len() > MANAGED_SKILL_TREE_MAX_FILES {
                return Err("Managed skill tree exceeds the maximum file count.".to_string());
            }
        }
    }
    files.sort_by(|left, right| {
        left.strip_prefix(root)
            .unwrap_or(left)
            .cmp(right.strip_prefix(root).unwrap_or(right))
    });
    Ok(files)
}

fn skill_frontmatter_name(skill_md: &Path, fallback: &str) -> Result<String, String> {
    let mut file = std::fs::File::open(skill_md).map_err(|error| {
        format!(
            "open managed skill metadata {}: {error}",
            skill_md.display()
        )
    })?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(4000)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            format!(
                "read managed skill metadata {}: {error}",
                skill_md.display()
            )
        })?;
    let content = String::from_utf8_lossy(&bytes);
    let mut in_frontmatter = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "---" {
            if in_frontmatter {
                break;
            }
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter {
            if let Some(value) = trimmed.strip_prefix("name:") {
                let value = value.trim().trim_matches(['"', '\'']);
                if !value.is_empty() {
                    return Ok(value.to_string());
                }
            }
        }
    }
    Ok(fallback.to_string())
}

// Hermes commit HERMES_COMMIT writes `_dir_hash` as MD5 of every regular file,
// ordered by relative path, with each `str(relative_path)` immediately followed
// by that file's bytes. Keep this implementation byte-for-byte compatible with
// tools/skills_sync.py while rejecting links and unreadable/oversized trees.
#[derive(Clone)]
struct HermesManifestMd5 {
    state: [u32; 4],
    total_len: u64,
    block: [u8; 64],
    block_len: usize,
}

impl HermesManifestMd5 {
    fn new() -> Self {
        Self {
            state: [0x6745_2301, 0xefcd_ab89, 0x98ba_dcfe, 0x1032_5476],
            total_len: 0,
            block: [0; 64],
            block_len: 0,
        }
    }

    fn update(&mut self, mut input: &[u8]) -> Result<(), String> {
        self.total_len = self
            .total_len
            .checked_add(input.len() as u64)
            .ok_or_else(|| "Hermes skill hash input length overflowed.".to_string())?;
        if self.block_len != 0 {
            let needed = 64 - self.block_len;
            let copied = needed.min(input.len());
            self.block[self.block_len..self.block_len + copied].copy_from_slice(&input[..copied]);
            self.block_len += copied;
            input = &input[copied..];
            if self.block_len == 64 {
                let block = self.block;
                self.compress(&block);
                self.block_len = 0;
            }
            if input.is_empty() {
                return Ok(());
            }
        }
        let mut chunks = input.chunks_exact(64);
        for chunk in &mut chunks {
            let block: &[u8; 64] = chunk
                .try_into()
                .map_err(|_| "Hermes skill hash block conversion failed.".to_string())?;
            self.compress(block);
        }
        let remainder = chunks.remainder();
        self.block[..remainder.len()].copy_from_slice(remainder);
        self.block_len = remainder.len();
        Ok(())
    }

    fn compress(&mut self, block: &[u8; 64]) {
        const SHIFT: [u32; 64] = [
            7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20,
            5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
            6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
        ];
        const TABLE: [u32; 64] = [
            0xd76a_a478,
            0xe8c7_b756,
            0x2420_70db,
            0xc1bd_ceee,
            0xf57c_0faf,
            0x4787_c62a,
            0xa830_4613,
            0xfd46_9501,
            0x6980_98d8,
            0x8b44_f7af,
            0xffff_5bb1,
            0x895c_d7be,
            0x6b90_1122,
            0xfd98_7193,
            0xa679_438e,
            0x49b4_0821,
            0xf61e_2562,
            0xc040_b340,
            0x265e_5a51,
            0xe9b6_c7aa,
            0xd62f_105d,
            0x0244_1453,
            0xd8a1_e681,
            0xe7d3_fbc8,
            0x21e1_cde6,
            0xc337_07d6,
            0xf4d5_0d87,
            0x455a_14ed,
            0xa9e3_e905,
            0xfcef_a3f8,
            0x676f_02d9,
            0x8d2a_4c8a,
            0xfffa_3942,
            0x8771_f681,
            0x6d9d_6122,
            0xfde5_380c,
            0xa4be_ea44,
            0x4bde_cfa9,
            0xf6bb_4b60,
            0xbebf_bc70,
            0x289b_7ec6,
            0xeaa1_27fa,
            0xd4ef_3085,
            0x0488_1d05,
            0xd9d4_d039,
            0xe6db_99e5,
            0x1fa2_7cf8,
            0xc4ac_5665,
            0xf429_2244,
            0x432a_ff97,
            0xab94_23a7,
            0xfc93_a039,
            0x655b_59c3,
            0x8f0c_cc92,
            0xffef_f47d,
            0x8584_5dd1,
            0x6fa8_7e4f,
            0xfe2c_e6e0,
            0xa301_4314,
            0x4e08_11a1,
            0xf753_7e82,
            0xbd3a_f235,
            0x2ad7_d2bb,
            0xeb86_d391,
        ];
        let mut words = [0u32; 16];
        for (index, chunk) in block.chunks_exact(4).enumerate() {
            words[index] = u32::from_le_bytes(chunk.try_into().expect("four-byte MD5 word"));
        }
        let [mut a, mut b, mut c, mut d] = self.state;
        for index in 0..64 {
            let (mixed, word_index) = match index {
                0..=15 => ((b & c) | ((!b) & d), index),
                16..=31 => ((d & b) | ((!d) & c), (5 * index + 1) % 16),
                32..=47 => (b ^ c ^ d, (3 * index + 5) % 16),
                _ => (c ^ (b | !d), (7 * index) % 16),
            };
            let next = b.wrapping_add(
                a.wrapping_add(mixed)
                    .wrapping_add(TABLE[index])
                    .wrapping_add(words[word_index])
                    .rotate_left(SHIFT[index]),
            );
            a = d;
            d = c;
            c = b;
            b = next;
        }
        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
    }

    fn finish(mut self) -> Result<String, String> {
        let bit_len = self
            .total_len
            .checked_mul(8)
            .ok_or_else(|| "Hermes skill hash bit length overflowed.".to_string())?;
        self.update(&[0x80])?;
        let zero_count = if self.block_len <= 56 {
            56 - self.block_len
        } else {
            64 + 56 - self.block_len
        };
        if zero_count != 0 {
            self.update(&vec![0u8; zero_count])?;
        }
        self.update(&bit_len.to_le_bytes())?;
        if self.block_len != 0 {
            return Err("Hermes skill hash finalization failed.".to_string());
        }
        let mut output = String::with_capacity(32);
        for word in self.state {
            for byte in word.to_le_bytes() {
                use std::fmt::Write as _;
                write!(&mut output, "{byte:02x}")
                    .map_err(|_| "Hermes skill hash formatting failed.".to_string())?;
            }
        }
        Ok(output)
    }
}

fn hermes_skill_dir_hash(skill_dir: &Path) -> Result<String, String> {
    let files = collect_bounded_regular_files(skill_dir)?;
    let mut hasher = HermesManifestMd5::new();
    let mut buffer = [0u8; 64 * 1024];
    for file_path in files {
        let relative = file_path
            .strip_prefix(skill_dir)
            .map_err(|_| "Hermes skill file escaped its skill directory.".to_string())?;
        let relative = relative.to_str().ok_or_else(|| {
            format!(
                "Hermes skill path is not valid Unicode: {}",
                relative.display()
            )
        })?;
        hasher.update(relative.as_bytes())?;
        let mut file = std::fs::File::open(&file_path)
            .map_err(|error| format!("open Hermes skill file {}: {error}", file_path.display()))?;
        loop {
            let read = file.read(&mut buffer).map_err(|error| {
                format!("read Hermes skill file {}: {error}", file_path.display())
            })?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read])?;
        }
    }
    hasher.finish()
}

fn hermes_skill_hashes(skills_dir: &Path) -> Result<HashMap<String, String>, String> {
    let all_files = collect_bounded_regular_files(skills_dir)?;
    let mut hashes = HashMap::new();
    for skill_md in all_files
        .iter()
        .filter(|path| path.file_name().is_some_and(|name| name == "SKILL.md"))
    {
        let skill_dir = skill_md
            .parent()
            .ok_or_else(|| "Hermes skill metadata has no parent directory.".to_string())?;
        let fallback = skill_dir
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Hermes skill directory has an invalid name.".to_string())?;
        let name = skill_frontmatter_name(skill_md, fallback)?;
        let hash = hermes_skill_dir_hash(skill_dir)?;
        if hashes.insert(name.clone(), hash).is_some() {
            return Err(format!(
                "Hermes bundled skills contain a duplicate selector '{name}'."
            ));
        }
        if hashes.len() > HERMES_SKILL_MANIFEST_MAX_ENTRIES {
            return Err("Hermes bundled-skill set exceeds the readiness bound.".into());
        }
    }
    if hashes.is_empty() {
        return Err("Hermes bundled skill source contains no discoverable skills.".into());
    }
    Ok(hashes)
}

fn verified_hermes_skill_manifest_entries(
    skills_dir: &Path,
) -> Result<HashMap<String, String>, String> {
    let manifest = skills_dir.join(".bundled_manifest");
    let metadata = std::fs::symlink_metadata(&manifest)
        .map_err(|_| "Hermes bundled-skill manifest is missing.".to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > HERMES_SKILL_MANIFEST_MAX_BYTES
    {
        return Err(
            "Hermes bundled-skill manifest is invalid or exceeds the readiness bound.".into(),
        );
    }
    let text = std::fs::read_to_string(&manifest)
        .map_err(|error| format!("read Hermes bundled-skill manifest: {error}"))?;
    let actual_hashes = hermes_skill_hashes(skills_dir)?;
    let mut manifest_hashes = HashMap::new();
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if manifest_hashes.len() >= HERMES_SKILL_MANIFEST_MAX_ENTRIES {
            return Err("Hermes bundled-skill manifest exceeds the readiness bound.".into());
        }
        let Some((name, hash)) = line.split_once(':') else {
            return Err("Hermes bundled-skill manifest has an invalid entry.".into());
        };
        let name = name.trim();
        let expected_hash = hash.trim().to_ascii_lowercase();
        if name.is_empty() || hash.len() != 32 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err("Hermes bundled-skill manifest has an invalid entry.".into());
        }
        if manifest_hashes
            .insert(name.to_string(), expected_hash.clone())
            .is_some()
        {
            return Err(format!(
                "Hermes bundled-skill manifest contains duplicate selector '{name}'."
            ));
        }
        let actual_hash = actual_hashes.get(name).ok_or_else(|| {
            format!("Hermes bundled skill '{name}' is missing from the isolated skill root.")
        })?;
        if actual_hash != &expected_hash {
            return Err(format!(
                "Hermes bundled skill '{name}' failed content integrity verification."
            ));
        }
    }
    if manifest_hashes.is_empty() {
        return Err("Hermes bundled skills were not materialized in the isolated home.".into());
    }
    Ok(manifest_hashes)
}

fn expected_hermes_bundled_source_manifest(
    skills_dir: &Path,
    expected_commit: &str,
) -> Result<ManagedSkillIntegrityManifest, String> {
    let mut files = Vec::new();
    for path in collect_bounded_regular_files(skills_dir)? {
        let relative = path
            .strip_prefix(skills_dir)
            .map_err(|_| "Hermes bundled source file escaped its managed root.".to_string())?;
        let relative = relative
            .to_str()
            .ok_or_else(|| "Hermes bundled source path is not valid Unicode.".to_string())?
            .replace('\\', "/");
        files.push(ManagedSkillFileHash {
            path: relative,
            sha256: sha256_file_hex(&path)?,
        });
    }
    if files.is_empty() {
        return Err("Hermes durable bundled source is empty.".to_string());
    }
    Ok(ManagedSkillIntegrityManifest {
        schema_version: HERMES_BUNDLED_SOURCE_SCHEMA,
        provider: "hermes".to_string(),
        runtime_pin: expected_commit.to_string(),
        files,
    })
}

fn write_hermes_bundled_source_manifest(
    bundle_root: &Path,
    expected_commit: &str,
) -> Result<(), String> {
    let skills_dir = bundle_root.join("skills");
    hermes_skill_hashes(&skills_dir)?;
    let manifest = expected_hermes_bundled_source_manifest(&skills_dir, expected_commit)?;
    let text = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("serialize Hermes bundled-source manifest: {error}"))?;
    if text.len() as u64 > HERMES_SKILL_MANIFEST_MAX_BYTES {
        return Err("Hermes bundled-source manifest exceeds the safety bound.".to_string());
    }
    let path = bundle_root.join(HERMES_BUNDLED_SOURCE_MANIFEST);
    let temporary = bundle_root.join(format!(
        "{HERMES_BUNDLED_SOURCE_MANIFEST}.tmp-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&temporary, format!("{text}\n"))
        .map_err(|error| format!("write {}: {error}", temporary.display()))?;
    std::fs::rename(&temporary, &path)
        .map_err(|error| format!("publish {}: {error}", path.display()))
}

fn canonical_real_directory_within(
    path: &Path,
    boundary: &Path,
    label: &str,
) -> Result<PathBuf, String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("inspect {label} {}: {error}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(format!(
            "{label} is not a real directory: {}",
            path.display()
        ));
    }
    let canonical_boundary = std::fs::canonicalize(boundary)
        .map_err(|error| format!("resolve managed boundary {}: {error}", boundary.display()))?;
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("resolve {label} {}: {error}", path.display()))?;
    if !canonical.starts_with(&canonical_boundary) {
        return Err(format!(
            "{label} escaped its Atelier-managed boundary: {}",
            canonical.display()
        ));
    }
    Ok(canonical)
}

fn validate_existing_real_directory_within(
    path: &Path,
    boundary: &Path,
    label: &str,
) -> Result<(), String> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("inspect {label} {}: {error}", path.display())),
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(format!(
            "{label} is not a real directory: {}",
            path.display()
        ));
    }
    let canonical_boundary = std::fs::canonicalize(boundary)
        .map_err(|error| format!("resolve managed boundary {}: {error}", boundary.display()))?;
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("resolve {label} {}: {error}", path.display()))?;
    if !canonical.starts_with(&canonical_boundary) {
        return Err(format!(
            "{label} escaped its Atelier-managed boundary: {}",
            canonical.display()
        ));
    }
    Ok(())
}

fn validate_hermes_materialization_boundary(app_support: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(app_support)
        .map_err(|error| format!("inspect Atelier Application Support: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Atelier Application Support is not a real directory.".to_string());
    }
    let providers = app_support.join("providers");
    validate_existing_real_directory_within(&providers, app_support, "Atelier provider directory")?;
    let provider_root = hermes_provider_root_at(app_support);
    validate_existing_real_directory_within(&provider_root, app_support, "Hermes provider root")?;
    if provider_root.is_dir() {
        for (path, label) in [
            (
                hermes_provider_root_at(app_support).join("cache"),
                "Hermes managed cache",
            ),
            (
                hermes_provider_root_at(app_support).join("tmp"),
                "Hermes managed temporary directory",
            ),
        ] {
            validate_existing_real_directory_within(&path, &provider_root, label)?;
        }
    }
    Ok(())
}

fn verify_hermes_bundled_source_at(
    app_support: &Path,
    expected_commit: &str,
) -> Result<(PathBuf, HashMap<String, String>), String> {
    let provider_root = hermes_provider_root_at(app_support);
    let provider_root =
        canonical_real_directory_within(&provider_root, app_support, "Hermes provider root")?;
    let bundle_root = hermes_bundled_source_root_at(app_support);
    let bundle_root =
        canonical_real_directory_within(&bundle_root, &provider_root, "Hermes bundled source")?;
    let skills_dir = hermes_bundled_skills_dir_at(app_support);
    let skills_dir =
        canonical_real_directory_within(&skills_dir, &bundle_root, "Hermes bundled skills")?;
    let manifest_path = hermes_bundled_source_manifest_path_at(app_support);
    let metadata = std::fs::symlink_metadata(&manifest_path)
        .map_err(|_| "Hermes durable bundled-source manifest is missing.".to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > HERMES_SKILL_MANIFEST_MAX_BYTES
    {
        return Err(
            "Hermes durable bundled-source manifest is invalid or exceeds the safety bound."
                .to_string(),
        );
    }
    let canonical_manifest = std::fs::canonicalize(&manifest_path)
        .map_err(|error| format!("resolve {}: {error}", manifest_path.display()))?;
    if !canonical_manifest.starts_with(&bundle_root) {
        return Err("Hermes durable bundled-source manifest escaped its managed root.".to_string());
    }
    let text = std::fs::read_to_string(&manifest_path)
        .map_err(|error| format!("read Hermes bundled-source manifest: {error}"))?;
    let actual: ManagedSkillIntegrityManifest = serde_json::from_str(&text)
        .map_err(|error| format!("parse Hermes bundled-source manifest: {error}"))?;
    if actual.schema_version != HERMES_BUNDLED_SOURCE_SCHEMA
        || actual.provider != "hermes"
        || actual.runtime_pin != expected_commit
        || actual.files.is_empty()
        || actual.files.len() > MANAGED_SKILL_TREE_MAX_FILES
    {
        return Err("Hermes durable bundled-source manifest is stale or invalid.".to_string());
    }
    let expected = expected_hermes_bundled_source_manifest(&skills_dir, expected_commit)?;
    if actual != expected {
        return Err(
            "Hermes durable bundled source failed content integrity verification.".to_string(),
        );
    }
    let skill_hashes = hermes_skill_hashes(&skills_dir)?;
    Ok((skills_dir, skill_hashes))
}

fn verify_hermes_installed_skills_against_source_at(
    app_support: &Path,
    installed_skills: &Path,
    expected_commit: &str,
) -> Result<usize, String> {
    let (_, source_hashes) = verify_hermes_bundled_source_at(app_support, expected_commit)?;
    let installed_hashes = verified_hermes_skill_manifest_entries(installed_skills)?;
    if installed_hashes != source_hashes {
        return Err(format!(
            "Hermes installed bundled skills do not match the durable pinned source (source {}, installed {}).",
            source_hashes.len(),
            installed_hashes.len()
        ));
    }
    Ok(installed_hashes.len())
}

fn hermes_git_command(checkout: &Path) -> Command {
    let executable = if cfg!(target_os = "macos") && Path::new("/usr/bin/git").is_file() {
        PathBuf::from("/usr/bin/git")
    } else {
        crate::agent_process::resolve_cli_executable("git")
    };
    let mut command = Command::new(executable);
    command
        .current_dir(checkout)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(target_os = "windows") {
                "NUL"
            } else {
                "/dev/null"
            },
        );
    clear_bootstrap_credential_env(&mut command);
    command
}

fn run_hermes_git_output(mut command: Command, label: &str) -> Result<Output, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let output = command
        .output()
        .map_err(|error| format!("{label} could not start: {error}"))?;
    if output.stdout.len() > HERMES_GIT_OUTPUT_MAX_BYTES
        || output.stderr.len() > CLI_INSTALL_CAPTURE_LIMIT
    {
        return Err(format!("{label} exceeded the bounded output limit."));
    }
    if !output.status.success() {
        let detail = installer_output(&output.stdout, &output.stderr);
        return Err(format!(
            "{label} failed{}",
            if detail.trim().is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        ));
    }
    Ok(output)
}

fn hermes_git_stdout(checkout: &Path, args: &[&str], label: &str) -> Result<String, String> {
    let mut command = hermes_git_command(checkout);
    command.args(args);
    let output = run_hermes_git_output(command, label)?;
    String::from_utf8(output.stdout)
        .map(|value| value.trim().to_string())
        .map_err(|_| format!("{label} returned non-UTF-8 output."))
}

fn hermes_checkout_matches_commit(
    checkout: &Path,
    managed_cache: &Path,
    expected_commit: &str,
) -> Result<bool, String> {
    let head_ref = "HEAD^{commit}";
    let Ok(head) = hermes_git_stdout(
        checkout,
        &["rev-parse", "--verify", head_ref],
        "Hermes checkout HEAD verification",
    ) else {
        return Ok(false);
    };
    if head != expected_commit {
        return Ok(false);
    }
    let commit_ref = format!("{expected_commit}^{{commit}}");
    let commit = hermes_git_stdout(
        checkout,
        &["rev-parse", "--verify", &commit_ref],
        "Hermes pinned commit verification",
    )?;
    if commit != expected_commit {
        return Ok(false);
    }
    let git_dir = hermes_git_stdout(
        checkout,
        &["rev-parse", "--absolute-git-dir"],
        "Hermes git directory verification",
    )?;
    let git_dir = PathBuf::from(git_dir);
    let git_dir =
        canonical_real_directory_within(&git_dir, managed_cache, "Hermes managed git directory")?;
    Ok(git_dir.starts_with(
        std::fs::canonicalize(managed_cache)
            .map_err(|error| format!("resolve {}: {error}", managed_cache.display()))?,
    ))
}

fn locate_hermes_pinned_checkout_at(
    app_support: &Path,
    expected_commit: &str,
) -> Result<PathBuf, String> {
    if expected_commit.len() != 40 || !expected_commit.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Hermes pinned commit identifier is invalid.".to_string());
    }
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    let checkouts = layout.cache.join("git-v0").join("checkouts");
    let checkouts =
        canonical_real_directory_within(&checkouts, &layout.root, "Hermes uv git checkouts")?;
    let managed_cache =
        canonical_real_directory_within(&layout.cache, &layout.root, "Hermes managed cache")?;
    let mut pending = vec![(checkouts, 0usize)];
    let mut visited = 0usize;
    let mut matches = Vec::new();
    while let Some((directory, depth)) = pending.pop() {
        if depth > HERMES_GIT_CACHE_SCAN_MAX_DEPTH {
            return Err("Hermes uv git checkout tree exceeds the search depth bound.".to_string());
        }
        let dot_git = directory.join(".git");
        if dot_git.exists() {
            let metadata = std::fs::symlink_metadata(&dot_git)
                .map_err(|error| format!("inspect {}: {error}", dot_git.display()))?;
            if metadata.file_type().is_symlink() || (!metadata.is_dir() && !metadata.is_file()) {
                return Err(format!(
                    "Hermes uv checkout contains an unsafe git directory: {}",
                    dot_git.display()
                ));
            }
            if hermes_checkout_matches_commit(&directory, &managed_cache, expected_commit)? {
                matches.push(std::fs::canonicalize(&directory).map_err(|error| {
                    format!("resolve Hermes checkout {}: {error}", directory.display())
                })?);
            }
            continue;
        }
        let entries = std::fs::read_dir(&directory)
            .map_err(|error| format!("read {}: {error}", directory.display()))?;
        let mut child_directories = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|error| format!("read {}: {error}", directory.display()))?;
            visited += 1;
            if visited > HERMES_GIT_CACHE_SCAN_MAX_ENTRIES {
                return Err("Hermes uv git checkout tree exceeds the search bound.".to_string());
            }
            let path = entry.path();
            let metadata = std::fs::symlink_metadata(&path)
                .map_err(|error| format!("inspect {}: {error}", path.display()))?;
            if metadata.file_type().is_symlink() {
                return Err(format!(
                    "Hermes uv git checkout tree contains a symbolic link: {}",
                    path.display()
                ));
            }
            if metadata.is_dir() {
                child_directories.push(path);
            }
        }
        child_directories.sort();
        for child in child_directories.into_iter().rev() {
            pending.push((child, depth + 1));
        }
    }
    matches.sort();
    matches.dedup();
    match matches.len() {
        1 => Ok(matches.remove(0)),
        0 => Err(format!(
            "Hermes uv cache does not contain a checkout whose HEAD is pinned commit {expected_commit}."
        )),
        count => Err(format!(
            "Hermes uv cache exposed {count} checkouts for pinned commit {expected_commit}."
        )),
    }
}

fn hermes_git_tree_entries(
    checkout: &Path,
    expected_commit: &str,
) -> Result<Vec<HermesGitTreeEntry>, String> {
    let mut command = hermes_git_command(checkout);
    command.args([
        "ls-tree",
        "-rlz",
        "--full-tree",
        expected_commit,
        "--",
        "skills",
    ]);
    let output = run_hermes_git_output(command, "Hermes pinned skill tree inspection")?;
    let mut entries = Vec::new();
    let mut seen_paths = HashSet::new();
    let mut total_bytes = 0u64;
    let mut has_skill = false;
    for raw in output
        .stdout
        .split(|byte| *byte == b'\0')
        .filter(|entry| !entry.is_empty())
    {
        let entry = std::str::from_utf8(raw)
            .map_err(|_| "Hermes pinned git tree contains a non-UTF-8 path.".to_string())?;
        let (metadata, path) = entry
            .split_once('\t')
            .ok_or_else(|| "Hermes pinned git tree returned an invalid entry.".to_string())?;
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        if fields.len() != 4
            || !matches!(fields[0], "100644" | "100755")
            || fields[1] != "blob"
            || fields[2].len() != 40
            || !fields[2].bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(format!(
                "Hermes pinned skill tree contains an unsupported entry: {entry}"
            ));
        }
        let size = fields[3]
            .parse::<u64>()
            .map_err(|_| "Hermes pinned git tree returned an invalid file size.".to_string())?;
        if path.contains('\\') {
            return Err("Hermes pinned git tree contains an unsafe path separator.".to_string());
        }
        let relative = Path::new(path);
        let mut components = relative.components();
        if relative.is_absolute()
            || !matches!(
                components.next(),
                Some(std::path::Component::Normal(component)) if component == "skills"
            )
            || components.any(|component| !matches!(component, std::path::Component::Normal(_)))
        {
            return Err(format!(
                "Hermes pinned git tree contains an unsafe path: {path}"
            ));
        }
        if !seen_paths.insert(path.to_string()) {
            return Err(format!(
                "Hermes pinned git tree contains duplicate path: {path}"
            ));
        }
        total_bytes = total_bytes
            .checked_add(size)
            .ok_or_else(|| "Hermes pinned git tree byte count overflowed.".to_string())?;
        if total_bytes > MANAGED_SKILL_TREE_MAX_BYTES {
            return Err("Hermes pinned git tree exceeds the byte-size bound.".to_string());
        }
        entries.push(HermesGitTreeEntry {
            path: path.to_string(),
            object_id: fields[2].to_string(),
            size,
        });
        if relative
            .file_name()
            .is_some_and(|file_name| file_name == "SKILL.md")
        {
            has_skill = true;
        }
        if entries.len() > MANAGED_SKILL_TREE_MAX_FILES {
            return Err("Hermes pinned git tree exceeds the file-count bound.".to_string());
        }
    }
    if entries.is_empty() || !has_skill {
        return Err("Hermes pinned commit does not contain bundled skills.".to_string());
    }
    Ok(entries)
}

fn verify_hermes_archive_matches_git_tree(
    checkout: &Path,
    extracted_root: &Path,
    entries: &[HermesGitTreeEntry],
) -> Result<(), String> {
    let skills_dir = extracted_root.join("skills");
    let files = collect_bounded_regular_files(&skills_dir)?;
    if files.len() != entries.len() {
        return Err(format!(
            "Hermes pinned archive file count does not match the commit tree (archive {}, tree {}).",
            files.len(),
            entries.len()
        ));
    }
    let mut extracted = HashMap::new();
    for path in files {
        let relative = path
            .strip_prefix(extracted_root)
            .map_err(|_| "Hermes pinned archive escaped its extraction root.".to_string())?;
        let relative = relative
            .to_str()
            .ok_or_else(|| "Hermes pinned archive path is not valid Unicode.".to_string())?
            .replace('\\', "/");
        let size = std::fs::symlink_metadata(&path)
            .map_err(|error| format!("inspect {}: {error}", path.display()))?
            .len();
        extracted.insert(relative, (path, size));
    }
    for entry in entries {
        let Some((_, size)) = extracted.get(&entry.path) else {
            return Err(format!(
                "Hermes pinned archive omitted commit path {}.",
                entry.path
            ));
        };
        if *size != entry.size {
            return Err(format!(
                "Hermes pinned archive changed the size of commit path {}.",
                entry.path
            ));
        }
    }
    for chunk in entries.chunks(128) {
        let mut command = hermes_git_command(checkout);
        command.args(["hash-object", "--no-filters", "--"]);
        for entry in chunk {
            command.arg(extracted_root.join(&entry.path));
        }
        let output = run_hermes_git_output(command, "Hermes pinned archive object verification")?;
        let object_ids = String::from_utf8(output.stdout)
            .map_err(|_| "Hermes git hash-object returned non-UTF-8 output.".to_string())?
            .lines()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>();
        if object_ids.len() != chunk.len() {
            return Err("Hermes pinned archive object verification was incomplete.".to_string());
        }
        for (entry, actual_object_id) in chunk.iter().zip(object_ids) {
            if entry.object_id != actual_object_id {
                return Err(format!(
                    "Hermes pinned archive content does not match commit object {}.",
                    entry.path
                ));
            }
        }
    }
    Ok(())
}

fn quarantine_existing_hermes_bundle(
    layout: &ManagedRuntimeLayout,
    bundle_root: &Path,
) -> Result<Option<PathBuf>, String> {
    if !bundle_root.exists() {
        return Ok(None);
    }
    let metadata = std::fs::symlink_metadata(bundle_root)
        .map_err(|error| format!("inspect {}: {error}", bundle_root.display()))?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Hermes bundled source is a symbolic link and was rejected: {}",
            bundle_root.display()
        ));
    }
    let quarantine_root = layout.root.join("bundle-quarantine");
    std::fs::create_dir_all(&quarantine_root)
        .map_err(|error| format!("create {}: {error}", quarantine_root.display()))?;
    let destination = quarantine_root.join(format!(
        "bundled-{}-{}",
        chrono::Utc::now().timestamp_millis(),
        uuid::Uuid::new_v4()
    ));
    std::fs::rename(bundle_root, &destination).map_err(|error| {
        format!(
            "quarantine Hermes bundled source {} -> {}: {error}",
            bundle_root.display(),
            destination.display()
        )
    })?;
    Ok(Some(destination))
}

fn materialize_hermes_bundled_source_at(
    app_support: &Path,
    expected_commit: &str,
) -> Result<PathBuf, String> {
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    validate_hermes_materialization_boundary(app_support)?;
    ensure_runtime_layout(&layout)?;
    canonical_real_directory_within(&layout.root, app_support, "Hermes provider root")?;
    canonical_real_directory_within(
        &layout.temp,
        &layout.root,
        "Hermes managed temporary directory",
    )?;
    if let Ok((skills_dir, _)) = verify_hermes_bundled_source_at(app_support, expected_commit) {
        return Ok(skills_dir);
    }
    let checkout = locate_hermes_pinned_checkout_at(app_support, expected_commit)?;
    let entries = hermes_git_tree_entries(&checkout, expected_commit)?;
    let staging = layout
        .temp
        .join(format!("hermes-bundled-source-{}", uuid::Uuid::new_v4()));
    let publish = staging.join("publish");
    std::fs::create_dir_all(&publish)
        .map_err(|error| format!("create {}: {error}", publish.display()))?;
    let archive = staging.join("skills.tar");
    let mut archive_command = hermes_git_command(&checkout);
    archive_command
        .args(["archive", "--format=tar", "-o"])
        .arg(&archive)
        .arg(expected_commit)
        .args(["--", "skills"]);
    run_hermes_git_output(archive_command, "Hermes pinned skill archive")?;
    let archive_metadata = std::fs::symlink_metadata(&archive)
        .map_err(|error| format!("inspect {}: {error}", archive.display()))?;
    if archive_metadata.file_type().is_symlink()
        || !archive_metadata.is_file()
        || archive_metadata.len() > MANAGED_SKILL_TREE_MAX_BYTES * 2
    {
        return Err(
            "Hermes pinned skill archive is invalid or exceeds the safety bound.".to_string(),
        );
    }
    let tar_executable = if cfg!(target_os = "macos") && Path::new("/usr/bin/tar").is_file() {
        PathBuf::from("/usr/bin/tar")
    } else {
        crate::agent_process::resolve_cli_executable("tar")
    };
    let mut extract = Command::new(tar_executable);
    extract.args(["-xf"]).arg(&archive).arg("-C").arg(&publish);
    clear_bootstrap_credential_env(&mut extract);
    run_runtime_probe(
        extract,
        "Hermes pinned skill archive extraction",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?;
    verify_hermes_archive_matches_git_tree(&checkout, &publish, &entries)?;
    write_hermes_bundled_source_manifest(&publish, expected_commit)?;
    let staged_source = publish.join("skills");
    let source_hashes = hermes_skill_hashes(&staged_source)?;
    if source_hashes.is_empty() {
        return Err("Hermes pinned skill archive produced no discoverable skills.".to_string());
    }

    let bundle_root = hermes_bundled_source_root_at(app_support);
    let quarantined = quarantine_existing_hermes_bundle(&layout, &bundle_root)?;
    if let Err(error) = std::fs::rename(&publish, &bundle_root) {
        if let Some(previous) = quarantined.as_ref().filter(|_| !bundle_root.exists()) {
            let _ = std::fs::rename(previous, &bundle_root);
        }
        return Err(format!(
            "publish Hermes durable bundled source {} -> {}: {error}",
            publish.display(),
            bundle_root.display()
        ));
    }
    if let Some(path) = quarantined {
        log::warn!(
            "quarantined prior Hermes durable bundled source before pinned replacement: {}",
            path.display()
        );
    }
    let (skills_dir, _) = verify_hermes_bundled_source_at(app_support, expected_commit)?;
    let _ = std::fs::remove_file(&archive);
    let _ = std::fs::remove_dir(&staging);
    Ok(skills_dir)
}

// direct_url.json 수령증 하나가 핀을 증명하는지 판정한다 — 판정 기준(url 포함 +
// commit_id 정확 일치)은 표적 조회·폴백 크롤이 공유하는 단일 소스여야 하기에 분리했다.
fn hermes_direct_url_receipt_matches_pin(path: &Path) -> bool {
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return false;
    };
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > MANAGED_RECEIPT_MAX_BYTES
    {
        return false;
    }
    let Ok(text) = std::fs::read_to_string(path) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return false;
    };
    let url_matches = value
        .get("url")
        .and_then(Value::as_str)
        .is_some_and(|url| url.contains("NousResearch/hermes-agent"));
    let commit_matches = value
        .pointer("/vcs_info/commit_id")
        .and_then(Value::as_str)
        .is_some_and(|commit| commit == HERMES_COMMIT);
    url_matches && commit_matches
}

// 표적 조회 각 단계의 매칭 결과 상한 — 원시 항목 수가 아니라 매칭된 디렉터리 수에만
// 상한을 둔다. 원시 항목에 상한을 걸면 트리가 자라는 순간 조용한 false 가 되는
// 부류 결함(라운드9 무음사)이 그대로 재발하기 때문.
const HERMES_LOOKUP_MATCH_MAX: usize = 512;

fn hermes_lookup_subdirs(dir: &Path, matches: impl Fn(&str) -> bool) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        if out.len() >= HERMES_LOOKUP_MATCH_MAX {
            break;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() || !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if matches(name) {
            out.push(entry.path());
        }
    }
    out
}

// uv tool env 의 결정적 배치 규칙으로 direct_url.json 을 직접 찾아간다:
// tool_dir/<도구>/lib/python*/site-packages/<hermes_agent…>.dist-info/direct_url.json
// (Windows 는 <도구>/Lib/site-packages). 도구명·파이썬버전·패키지버전은 하드코딩하지
// 않고 해당 단계에서만 열거한다 — 방문 디렉터리가 수십 개 수준이라 전역 상한이 불필요하다.
fn hermes_direct_url_targeted_lookup(tool_dir: &Path) -> bool {
    for tool in hermes_lookup_subdirs(tool_dir, |_| true) {
        let mut site_packages_dirs: Vec<PathBuf> =
            hermes_lookup_subdirs(&tool.join("lib"), |name| name.starts_with("python"))
                .into_iter()
                .map(|python_dir| python_dir.join("site-packages"))
                .collect();
        site_packages_dirs.push(tool.join("Lib").join("site-packages"));
        for site_packages in site_packages_dirs {
            let dist_infos = hermes_lookup_subdirs(&site_packages, |name| {
                name.starts_with("hermes_agent") && name.ends_with(".dist-info")
            });
            for dist_info in dist_infos {
                if hermes_direct_url_receipt_matches_pin(&dist_info.join("direct_url.json")) {
                    return true;
                }
            }
        }
    }
    false
}

// 폴백 크롤 상한 — 실측 uv-tools 트리(6,124항목, 260803)를 10배 이상 여유 있게 넘긴다.
// 이전 상한 4,096은 트리 성장만으로 도달했고, 상한 도달 = 조용한 false = 정상 설치를
// '미설치'로 오판하는 무음사였다(부류 결함: 눈먼 크롤 + 빠듯한 상한).
const HERMES_CRAWL_MAX_VISITED: usize = 65_536;
const HERMES_CRAWL_MAX_DEPTH: usize = 8;

fn hermes_direct_url_crawl_fallback(tool_dir: &Path) -> bool {
    let mut pending = vec![(tool_dir.to_path_buf(), 0usize)];
    let mut visited = 0usize;
    while let Some((dir, depth)) = pending.pop() {
        if depth > HERMES_CRAWL_MAX_DEPTH || visited >= HERMES_CRAWL_MAX_VISITED {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            visited += 1;
            if visited >= HERMES_CRAWL_MAX_VISITED {
                break;
            }
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                pending.push((path, depth + 1));
                continue;
            }
            if entry.file_name() != "direct_url.json" {
                continue;
            }
            if hermes_direct_url_receipt_matches_pin(&path) {
                return true;
            }
        }
    }
    false
}

// 정본은 표적 조회 — 눈먼 전체 크롤은 파일 수가 상한을 넘는 순간 조용히 false 를
// 돌려주는 부류 결함이라 비정형 배치 폴백으로만 남긴다.
fn hermes_direct_url_has_pinned_commit(tool_dir: &Path) -> bool {
    if hermes_direct_url_targeted_lookup(tool_dir) {
        return true;
    }
    hermes_direct_url_crawl_fallback(tool_dir)
}

fn sha256_file_hex(path: &Path) -> Result<String, String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("inspect file for SHA-256 {}: {error}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "SHA-256 input is not a regular file: {}",
            path.display()
        ));
    }
    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("open file for SHA-256 {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("read file for SHA-256 {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn verify_file_sha256(path: &Path, expected: &str, label: &str) -> Result<(), String> {
    let actual = sha256_file_hex(path)?;
    if actual == expected {
        return Ok(());
    }
    Err(format!(
        "{label} failed SHA-256 verification (expected {expected}, got {actual})."
    ))
}

fn gajecode_default_skill_files(skills_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    for skill in GAJAE_DEFAULT_SKILLS {
        let skill_root = skills_dir.join(skill);
        if !skill_root.join("SKILL.md").is_file() {
            return Err(format!(
                "Gajaecode default skill '{skill}' is missing from the isolated skill root."
            ));
        }
        files.extend(collect_bounded_regular_files(&skill_root)?);
    }
    files.sort_by(|left, right| {
        left.strip_prefix(skills_dir)
            .unwrap_or(left)
            .cmp(right.strip_prefix(skills_dir).unwrap_or(right))
    });
    if files.is_empty() || files.len() > MANAGED_SKILL_TREE_MAX_FILES {
        return Err(
            "Gajaecode default skill file set is empty or exceeds the safety bound.".into(),
        );
    }
    Ok(files)
}

fn expected_gajecode_skill_integrity_manifest(
    skills_dir: &Path,
) -> Result<ManagedSkillIntegrityManifest, String> {
    let mut files = Vec::new();
    for path in gajecode_default_skill_files(skills_dir)? {
        let relative = path
            .strip_prefix(skills_dir)
            .map_err(|_| "Gajaecode default skill escaped its managed root.".to_string())?;
        let relative = relative
            .to_str()
            .ok_or_else(|| "Gajaecode default skill path is not valid Unicode.".to_string())?
            .replace('\\', "/");
        files.push(ManagedSkillFileHash {
            path: relative,
            sha256: sha256_file_hex(&path)?,
        });
    }
    Ok(ManagedSkillIntegrityManifest {
        schema_version: GAJAE_SKILL_INTEGRITY_SCHEMA,
        provider: "gajecode".to_string(),
        runtime_pin: GAJAE_CODE_VERSION.to_string(),
        files,
    })
}

fn verify_hermes_python_isolation(app_support: &Path) -> Result<(), String> {
    let python = hermes_uv_bin_dir_at(app_support).join(if cfg!(target_os = "windows") {
        "python.exe"
    } else {
        "python"
    });
    let resolved = std::fs::canonicalize(&python).map_err(|error| {
        format!(
            "resolve Hermes managed Python {}: {error}",
            python.display()
        )
    })?;
    let expected_root = canonical_real_directory_within(
        &hermes_provider_root_at(app_support),
        app_support,
        "Hermes provider root",
    )?;
    if !resolved.starts_with(&expected_root) {
        return Err(format!(
            "Hermes managed Python escaped the Atelier provider runtime root: {}",
            resolved.display()
        ));
    }
    Ok(())
}

fn write_gajecode_skill_integrity_manifest(skills_dir: &Path) -> Result<(), String> {
    let manifest = expected_gajecode_skill_integrity_manifest(skills_dir)?;
    let path = skills_dir.join(GAJAE_SKILL_INTEGRITY_MANIFEST);
    let text = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("serialize Gajaecode skill integrity manifest: {error}"))?;
    if text.len() as u64 > HERMES_SKILL_MANIFEST_MAX_BYTES {
        return Err("Gajaecode skill integrity manifest exceeds the safety bound.".to_string());
    }
    let temp = skills_dir.join(format!(
        "{GAJAE_SKILL_INTEGRITY_MANIFEST}.tmp-{}",
        std::process::id()
    ));
    std::fs::write(&temp, format!("{text}\n"))
        .map_err(|error| format!("write {}: {error}", temp.display()))?;
    std::fs::rename(&temp, &path).map_err(|error| format!("publish {}: {error}", path.display()))
}

fn verify_gajecode_skill_integrity_manifest(skills_dir: &Path) -> Result<usize, String> {
    let path = skills_dir.join(GAJAE_SKILL_INTEGRITY_MANIFEST);
    let metadata = std::fs::symlink_metadata(&path)
        .map_err(|_| "Gajaecode default-skill integrity manifest is missing.".to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > HERMES_SKILL_MANIFEST_MAX_BYTES
    {
        return Err(
            "Gajaecode default-skill integrity manifest is invalid or exceeds the safety bound."
                .to_string(),
        );
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("read Gajaecode skill integrity manifest: {error}"))?;
    let actual: ManagedSkillIntegrityManifest = serde_json::from_str(&text)
        .map_err(|error| format!("parse Gajaecode skill integrity manifest: {error}"))?;
    if actual.schema_version != GAJAE_SKILL_INTEGRITY_SCHEMA
        || actual.provider != "gajecode"
        || actual.runtime_pin != GAJAE_CODE_VERSION
        || actual.files.is_empty()
        || actual.files.len() > MANAGED_SKILL_TREE_MAX_FILES
    {
        return Err("Gajaecode default-skill integrity manifest is stale or invalid.".to_string());
    }
    let expected = expected_gajecode_skill_integrity_manifest(skills_dir)?;
    if actual != expected {
        return Err("Gajaecode default skills failed content integrity verification.".to_string());
    }
    Ok(GAJAE_DEFAULT_SKILLS.len())
}

fn gajecode_command_at(app_support: &Path) -> Result<Command, String> {
    let executable = gajecode_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Gajaecode executable is missing.".to_string())?;
    let mut command = cli_command(&executable.to_string_lossy());
    configure_gajecode_runtime_env_at(&mut command, app_support)?;
    Ok(command)
}

fn verify_gajecode_components_at(app_support: &Path) -> Result<(PathBuf, usize), String> {
    let layout = managed_runtime_layout_at(app_support, "gajecode")?;
    let bun = gajecode_bun_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Bun executable is missing.".to_string())?;
    let bun = canonical_managed_file(&bun, &layout.root)?;
    let mut bun_version = cli_command(&bun.to_string_lossy());
    configure_gajecode_runtime_env_at(&mut bun_version, app_support)?;
    bun_version.arg("--version");
    let detected_bun = first_semver_token(&run_runtime_probe(
        bun_version,
        "Bun version check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?)
    .ok_or_else(|| "Could not parse the Atelier-managed Bun version.".to_string())?;
    if detected_bun != BUN_VERSION {
        return Err(format!(
            "Atelier requires Bun {BUN_VERSION}, but the managed runtime reported {detected_bun}."
        ));
    }

    let executable = gajecode_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Gajaecode executable is missing.".to_string())?;
    let executable = canonical_managed_file(&executable, &layout.root)?;
    let mut version = gajecode_command_at(app_support)?;
    version.arg("--version");
    let detected = first_semver_token(&run_runtime_probe(
        version,
        "Gajaecode version check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?)
    .ok_or_else(|| "Could not parse the Atelier-managed Gajaecode version.".to_string())?;
    if detected != GAJAE_CODE_VERSION {
        return Err(format!(
            "Atelier requires Gajaecode {GAJAE_CODE_VERSION}, but the managed runtime reported {detected}."
        ));
    }

    let mut defaults_check = gajecode_command_at(app_support)?;
    defaults_check
        .args(["setup", "defaults", "--check"])
        .current_dir(
            layout
                .workspace
                .as_deref()
                .ok_or_else(|| "The Gajaecode workspace is unavailable.".to_string())?,
        );
    run_runtime_probe(
        defaults_check,
        "Gajaecode default skill check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?;
    let skill_count = verify_gajecode_skill_integrity_manifest(&layout.skills)?;
    Ok((executable, skill_count))
}

fn verify_hermes_components_at(app_support: &Path) -> Result<(PathBuf, usize), String> {
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    let executable = hermes_managed_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Hermes executable is missing.".to_string())?;
    let executable = canonical_managed_file(&executable, &layout.root)?;
    verify_hermes_python_isolation(app_support)?;
    if !hermes_direct_url_has_pinned_commit(&hermes_uv_tool_dir_at(app_support)) {
        return Err(format!(
            "The Atelier-managed Hermes provenance does not match commit {HERMES_COMMIT}."
        ));
    }
    // 커밋이 같아도 spec(extras 포함)이 달라졌으면 readiness를 실패시킨다 —
    // ensure_managed_agent_runtime가 다음 관리형 실행에서 install_hermes_cli_at로
    // 자동 재프로비저닝하고 새 spec으로 install.json을 다시 쓴다.
    if !hermes_install_record_matches_spec_at(app_support) {
        return Err(format!(
            "The Atelier-managed Hermes install record does not match the pinned spec {HERMES_GIT_SPEC}."
        ));
    }
    let skill_count = verify_hermes_installed_skills_against_source_at(
        app_support,
        &layout.skills,
        HERMES_COMMIT,
    )?;
    Ok((executable, skill_count))
}

fn grok_macos_binary_sha256(target: &str) -> Option<&'static str> {
    match target {
        "macos-aarch64" => Some(GROK_MACOS_AARCH64_SHA256),
        "macos-x86_64" => Some(GROK_MACOS_X86_64_SHA256),
        _ => None,
    }
}

fn grok_command_at(app_support: &Path) -> Result<Command, String> {
    let executable = grok_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Grok executable is missing.".to_string())?;
    let mut command = cli_command(&executable.to_string_lossy());
    configure_grok_runtime_env_at(&mut command, app_support)?;
    Ok(command)
}

fn verify_grok_components_at(app_support: &Path) -> Result<(PathBuf, usize), String> {
    let layout = managed_runtime_layout_at(app_support, "grok")?;
    let executable = grok_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Grok executable is missing.".to_string())?;
    let executable = canonical_managed_file(&executable, &layout.root)?;
    #[cfg(target_os = "macos")]
    {
        let target = match std::env::consts::ARCH {
            "aarch64" => "macos-aarch64",
            "x86_64" => "macos-x86_64",
            arch => return Err(format!("Grok does not support macOS {arch}.")),
        };
        let expected = grok_macos_binary_sha256(target)
            .ok_or_else(|| format!("No embedded Grok checksum is available for {target}."))?;
        verify_file_sha256(&executable, expected, "Grok")?;
    }
    let mut version = grok_command_at(app_support)?;
    version.arg("--version");
    let detected = first_semver_token(&run_runtime_probe(
        version,
        "Grok version check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?)
    .ok_or_else(|| "Could not parse the Atelier-managed Grok version.".to_string())?;
    if detected != GROK_VERSION {
        return Err(format!(
            "Atelier requires Grok {GROK_VERSION}, but the managed runtime reported {detected}."
        ));
    }
    Ok((executable, 0))
}

fn runtime_pins(provider: &str) -> Result<(&'static str, Option<&'static str>), String> {
    match provider {
        "hermes" => Ok((HERMES_COMMIT, None)),
        "gajecode" => Ok((GAJAE_CODE_VERSION, Some(BUN_VERSION))),
        "grok" => Ok((GROK_VERSION, None)),
        _ => Err(format!("Unsupported managed runtime provider: {provider}")),
    }
}

fn expected_runtime_receipt(
    layout: &ManagedRuntimeLayout,
    executable: &Path,
    skill_count: usize,
) -> Result<ManagedRuntimeReceipt, String> {
    let (runtime_pin, dependency_pin) = runtime_pins(layout.provider)?;
    Ok(ManagedRuntimeReceipt {
        schema_version: MANAGED_RUNTIME_RECEIPT_SCHEMA,
        provider: layout.provider.to_string(),
        runtime_pin: runtime_pin.to_string(),
        dependency_pin: dependency_pin.map(str::to_string),
        policy_version: MANAGED_RUNTIME_POLICY_VERSION.to_string(),
        skill_bootstrap_version: MANAGED_SKILL_BOOTSTRAP_VERSION.to_string(),
        executable: executable.to_string_lossy().into_owned(),
        skills_dir: layout.skills.to_string_lossy().into_owned(),
        verified_skill_count: skill_count,
    })
}

fn load_runtime_receipt(path: &Path) -> Option<ManagedRuntimeReceipt> {
    let metadata = std::fs::metadata(path).ok()?;
    if metadata.len() == 0 || metadata.len() > MANAGED_RECEIPT_MAX_BYTES {
        return None;
    }
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn write_runtime_receipt(path: &Path, receipt: &ManagedRuntimeReceipt) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Could not resolve the runtime receipt directory.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create {}: {error}", parent.display()))?;
    let text = serde_json::to_string_pretty(receipt)
        .map_err(|error| format!("serialize managed runtime receipt: {error}"))?;
    let temp = path.with_extension(format!("json.tmp-{}", std::process::id()));
    std::fs::write(&temp, format!("{text}\n"))
        .map_err(|error| format!("write {}: {error}", temp.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("chmod {}: {error}", temp.display()))?;
    }
    std::fs::rename(&temp, path).map_err(|error| format!("publish {}: {error}", path.display()))
}

fn verify_managed_runtime_at(
    app_support: &Path,
    provider: &str,
) -> Result<ManagedAgentRuntimeReadiness, String> {
    let layout = managed_runtime_layout_at(app_support, provider)?;
    let (executable, skill_count) = match provider {
        "hermes" => verify_hermes_components_at(app_support)?,
        "gajecode" => verify_gajecode_components_at(app_support)?,
        "grok" => verify_grok_components_at(app_support)?,
        _ => return Err(format!("Unsupported managed runtime provider: {provider}")),
    };
    let expected = expected_runtime_receipt(&layout, &executable, skill_count)?;
    if load_runtime_receipt(&layout.receipt).as_ref() != Some(&expected) {
        return Err(format!(
            "{provider} managed runtime readiness receipt is missing or stale."
        ));
    }
    readiness_from(layout, executable, false)
}

fn readiness_from(
    layout: ManagedRuntimeLayout,
    executable: PathBuf,
    repaired: bool,
) -> Result<ManagedAgentRuntimeReadiness, String> {
    let (runtime_pin, dependency_pin) = runtime_pins(layout.provider)?;
    Ok(ManagedAgentRuntimeReadiness {
        provider: layout.provider.to_string(),
        ready: true,
        repaired,
        executable: executable.to_string_lossy().into_owned(),
        provider_root: layout.root.to_string_lossy().into_owned(),
        home_dir: layout.home.to_string_lossy().into_owned(),
        state_dir: layout.state.to_string_lossy().into_owned(),
        cache_dir: layout.cache.to_string_lossy().into_owned(),
        temp_dir: layout.temp.to_string_lossy().into_owned(),
        skills_dir: layout.skills.to_string_lossy().into_owned(),
        workspace_dir: layout
            .workspace
            .map(|path| path.to_string_lossy().into_owned()),
        runtime_pin: runtime_pin.to_string(),
        dependency_pin: dependency_pin.map(str::to_string),
        policy_version: MANAGED_RUNTIME_POLICY_VERSION.to_string(),
        skill_bootstrap_version: MANAGED_SKILL_BOOTSTRAP_VERSION.to_string(),
        receipt_path: layout.receipt.to_string_lossy().into_owned(),
    })
}

fn acquire_runtime_install_lock(provider: &str) -> Result<MutexGuard<'static, ()>, String> {
    let lock = match provider {
        "hermes" => &*HERMES_RUNTIME_INSTALL_LOCK,
        "gajecode" => &*GAJAE_RUNTIME_INSTALL_LOCK,
        "grok" => &*GROK_RUNTIME_INSTALL_LOCK,
        _ => return Err(format!("Unsupported managed runtime provider: {provider}")),
    };
    let started = Instant::now();
    loop {
        match lock.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(TryLockError::Poisoned(error)) => return Ok(error.into_inner()),
            Err(TryLockError::WouldBlock) if started.elapsed() < MANAGED_RUNTIME_LOCK_WAIT => {
                thread::sleep(Duration::from_millis(100));
            }
            Err(TryLockError::WouldBlock) => {
                return Err(format!(
                    "{provider} runtime preparation remained busy for too long."
                ))
            }
        }
    }
}

fn install_npm_cli(label: &'static str, pkg: &'static str) -> Result<(), String> {
    if !which("npm") {
        return Err("npm not found. install Node.js first.".into());
    }
    #[cfg(target_os = "windows")]
    let command = {
        let mut command = Command::new("cmd.exe");
        command
            .arg("/D")
            .arg("/Q")
            .arg("/S")
            .arg("/C")
            .arg("npm")
            .arg("install")
            .arg("-g")
            .arg(pkg);
        configure_background_command(&mut command);
        command
    };
    #[cfg(not(target_os = "windows"))]
    let command = {
        let mut command = Command::new("npm");
        command.arg("install").arg("-g").arg(pkg);
        command
    };
    run_cli_installer(command, label)
}

fn atomic_install_executable(source: &Path, destination: &Path) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Could not resolve managed executable directory.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create {}: {error}", parent.display()))?;
    let temp = destination.with_extension(format!("new-{}", std::process::id()));
    std::fs::copy(source, &temp)
        .map_err(|error| format!("copy {} -> {}: {error}", source.display(), temp.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o755))
            .map_err(|error| format!("chmod {}: {error}", temp.display()))?;
    }
    std::fs::rename(&temp, destination)
        .map_err(|error| format!("publish {}: {error}", destination.display()))
}

fn uv_macos_archive_sha256(target: &str) -> Option<&'static str> {
    match target {
        "aarch64-apple-darwin" => Some(UV_MACOS_AARCH64_SHA256),
        "x86_64-apple-darwin" => Some(UV_MACOS_X86_64_SHA256),
        _ => None,
    }
}

fn bun_macos_archive_sha256(target: &str) -> Option<&'static str> {
    match target {
        "bun-darwin-aarch64" => Some(BUN_MACOS_AARCH64_SHA256),
        "bun-darwin-x64" => Some(BUN_MACOS_X86_64_SHA256),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn download_verified_archive(
    url: &str,
    archive: &Path,
    expected_sha256: &str,
    label: &str,
) -> Result<(), String> {
    let file_name = archive
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Could not resolve the {label} archive name."))?;
    let temporary = archive.with_file_name(format!(".{file_name}.download-{}", std::process::id()));
    let mut curl = Command::new("/usr/bin/curl");
    curl.args(["--proto", "=https", "--tlsv1.2", "-fsSL", url, "-o"])
        .arg(&temporary);
    clear_bootstrap_credential_env(&mut curl);
    run_cli_installer(curl, "managed runtime archive download")?;
    verify_file_sha256(&temporary, expected_sha256, label)?;
    std::fs::rename(&temporary, archive)
        .map_err(|error| format!("publish verified {label} archive: {error}"))
}

#[cfg(target_os = "macos")]
fn download_managed_uv_at(app_support: &Path) -> Result<PathBuf, String> {
    let root = hermes_provider_root_at(app_support).join("bootstrap");
    let target = match std::env::consts::ARCH {
        "aarch64" => "aarch64-apple-darwin",
        "x86_64" => "x86_64-apple-darwin",
        arch => {
            return Err(format!(
                "Hermes uv bootstrap does not support macOS {arch}."
            ))
        }
    };
    let downloads = root.join("downloads");
    let unpacked = root.join("unpacked");
    std::fs::create_dir_all(&downloads)
        .map_err(|error| format!("create {}: {error}", downloads.display()))?;
    std::fs::create_dir_all(&unpacked)
        .map_err(|error| format!("create {}: {error}", unpacked.display()))?;
    let archive = downloads.join(format!("uv-{UV_BOOTSTRAP_VERSION}-{target}.tar.gz"));
    let url = format!(
        "https://github.com/astral-sh/uv/releases/download/{UV_BOOTSTRAP_VERSION}/uv-{target}.tar.gz"
    );
    let expected_sha256 = uv_macos_archive_sha256(target)
        .ok_or_else(|| format!("No embedded uv checksum is available for {target}."))?;
    download_verified_archive(&url, &archive, expected_sha256, "uv")?;
    let mut tar = Command::new("/usr/bin/tar");
    tar.args(["-xzf"]).arg(&archive).arg("-C").arg(&unpacked);
    clear_bootstrap_credential_env(&mut tar);
    run_cli_installer(tar, "uv extract")?;
    let source = unpacked.join(format!("uv-{target}")).join("uv");
    let destination = root.join("bin").join("uv");
    atomic_install_executable(&source, &destination)?;
    Ok(destination)
}

#[cfg(not(target_os = "macos"))]
fn download_managed_uv_at(_: &Path) -> Result<PathBuf, String> {
    let resolved = crate::agent_process::resolve_cli_executable("uv");
    resolved
        .is_file()
        .then_some(resolved)
        .ok_or_else(|| "Automatic uv bootstrap is currently available on macOS only.".to_string())
}

fn ensure_uv_at(app_support: &Path) -> Result<PathBuf, String> {
    let managed = hermes_provider_root_at(app_support)
        .join("bootstrap")
        .join("bin")
        .join(if cfg!(target_os = "windows") {
            "uv.exe"
        } else {
            "uv"
        });
    let candidate = if managed.is_file() {
        managed
    } else {
        download_managed_uv_at(app_support)?
    };
    let mut version = cli_command(&candidate.to_string_lossy());
    version.arg("--version");
    let detected = run_runtime_probe(version, "uv version check", MANAGED_RUNTIME_CHECK_TIMEOUT)?;
    if !detected.contains(UV_BOOTSTRAP_VERSION) {
        return Err(format!(
            "Atelier requires uv {UV_BOOTSTRAP_VERSION} for Hermes bootstrap."
        ));
    }
    Ok(candidate)
}

fn quarantine_untrusted_hermes_skill_tree(
    layout: &ManagedRuntimeLayout,
) -> Result<Option<PathBuf>, String> {
    if !layout.skills.exists() {
        return Ok(None);
    }
    let has_entries = std::fs::read_dir(&layout.skills)
        .map_err(|error| format!("read {}: {error}", layout.skills.display()))?
        .next()
        .transpose()
        .map_err(|error| format!("read {}: {error}", layout.skills.display()))?
        .is_some();
    if !has_entries {
        return Ok(None);
    }
    let quarantine_root = layout.root.join("skill-quarantine");
    std::fs::create_dir_all(&quarantine_root)
        .map_err(|error| format!("create {}: {error}", quarantine_root.display()))?;
    let destination = quarantine_root.join(format!(
        "skills-{}-{}",
        chrono::Utc::now().timestamp_millis(),
        std::process::id()
    ));
    std::fs::rename(&layout.skills, &destination).map_err(|error| {
        format!(
            "quarantine untrusted Hermes skill tree {} -> {}: {error}",
            layout.skills.display(),
            destination.display()
        )
    })?;
    std::fs::create_dir_all(&layout.skills)
        .map_err(|error| format!("recreate {}: {error}", layout.skills.display()))?;
    Ok(Some(destination))
}

fn bootstrap_hermes_skills_at(app_support: &Path) -> Result<(), String> {
    bootstrap_hermes_skills_at_with_commit(app_support, HERMES_COMMIT)
}

fn bootstrap_hermes_skills_at_with_commit(
    app_support: &Path,
    expected_commit: &str,
) -> Result<(), String> {
    let executable = hermes_managed_executable_path_at(app_support)
        .ok_or_else(|| "The Atelier-managed Hermes executable is missing.".to_string())?;
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    let bundled_skills = materialize_hermes_bundled_source_at(app_support, expected_commit)?;
    let quarantined = quarantine_untrusted_hermes_skill_tree(&layout)?;
    if let Some(path) = quarantined {
        log::warn!(
            "quarantined untrusted Hermes managed skills before pinned bootstrap: {}",
            path.display()
        );
    }

    let mut sync = cli_command(&executable.to_string_lossy());
    configure_hermes_runtime_env_at(&mut sync, app_support)?;
    sync.env("HERMES_BUNDLED_SKILLS", &bundled_skills)
        .args(["skills", "opt-in", "--sync"])
        .current_dir(&layout.root);
    run_runtime_probe(
        sync,
        "Hermes durable bundled skill sync",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?;

    let mut list = cli_command(&executable.to_string_lossy());
    configure_hermes_runtime_env_at(&mut list, app_support)?;
    list.args(["skills", "list", "--source", "builtin", "--enabled-only"])
        .current_dir(&layout.root);
    run_runtime_probe(
        list,
        "Hermes bundled skill catalog check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?;
    verify_hermes_installed_skills_against_source_at(app_support, &layout.skills, expected_commit)
        .map(|_| ())
}

fn install_hermes_cli_at(app_support: &Path) -> Result<(), String> {
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    ensure_runtime_layout(&layout)?;
    let tool_dir = hermes_uv_tool_dir_at(app_support);
    let bin_dir = hermes_uv_bin_dir_at(app_support);
    std::fs::create_dir_all(&tool_dir)
        .map_err(|error| format!("create {}: {error}", tool_dir.display()))?;
    std::fs::create_dir_all(&bin_dir)
        .map_err(|error| format!("create {}: {error}", bin_dir.display()))?;
    let uv = ensure_uv_at(app_support)?;
    let python = ensure_hermes_managed_python_at(app_support, &uv)?;
    let mut command = cli_command(&uv.to_string_lossy());
    configure_hermes_runtime_env_at(&mut command, app_support)?;
    command
        .args(["tool", "install", "--force", "--python"])
        .arg(&python)
        .arg(HERMES_GIT_SPEC);
    command
        .current_dir(&layout.root)
        .env("UV_TOOL_DIR", &tool_dir)
        .env(
            "UV_PYTHON_INSTALL_DIR",
            hermes_uv_python_dir_at(app_support),
        )
        .env("UV_CACHE_DIR", &layout.cache)
        .env("UV_NO_CONFIG", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(target_os = "windows") {
                "NUL"
            } else {
                "/dev/null"
            },
        );
    run_cli_installer(command, "hermes")?;
    let executable = hermes_managed_executable_path_at(app_support).ok_or_else(|| {
        format!(
            "Hermes installer completed, but no executable was found in {}",
            bin_dir.display()
        )
    })?;
    if !hermes_direct_url_has_pinned_commit(&tool_dir) {
        return Err(format!(
            "Hermes installed, but provenance did not match commit {HERMES_COMMIT}."
        ));
    }
    save_hermes_install_record_at(app_support, &executable)?;
    bootstrap_hermes_skills_at(app_support)
}

fn ensure_hermes_managed_python_at(app_support: &Path, uv: &Path) -> Result<PathBuf, String> {
    let layout = managed_runtime_layout_at(app_support, "hermes")?;
    let python_dir = hermes_uv_python_dir_at(app_support);
    std::fs::create_dir_all(&python_dir)
        .map_err(|error| format!("create {}: {error}", python_dir.display()))?;
    let mut command = cli_command(&uv.to_string_lossy());
    configure_hermes_runtime_env_at(&mut command, app_support)?;
    command
        .args(["python", "install", "--install-dir"])
        .arg(&python_dir)
        .arg("3.11")
        .current_dir(&layout.root)
        .env("UV_PYTHON_INSTALL_DIR", &python_dir)
        .env("UV_CACHE_DIR", &layout.cache)
        .env("UV_NO_CONFIG", "1");
    run_cli_installer(command, "Hermes managed Python")?;

    let mut candidates = std::fs::read_dir(&python_dir)
        .map_err(|error| format!("read {}: {error}", python_dir.display()))?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("cpython-3.11"))
        })
        .map(|path| {
            path.join("bin").join(if cfg!(target_os = "windows") {
                "python.exe"
            } else {
                "python3.11"
            })
        })
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();
    candidates.sort();
    candidates.pop().ok_or_else(|| {
        format!(
            "Hermes managed Python install completed, but no local interpreter was found in {}",
            python_dir.display()
        )
    })
}

fn install_hermes_cli() -> Result<(), String> {
    let app_support = app_support_dir()
        .ok_or_else(|| "Could not resolve the Atelier Hermes directory.".to_string())?;
    install_hermes_cli_at(&app_support)
}

#[cfg(target_os = "macos")]
fn install_managed_bun_at(app_support: &Path) -> Result<PathBuf, String> {
    let layout = managed_runtime_layout_at(app_support, "gajecode")?;
    ensure_runtime_layout(&layout)?;
    let target = match std::env::consts::ARCH {
        "aarch64" => "bun-darwin-aarch64",
        "x86_64" => "bun-darwin-x64",
        arch => return Err(format!("Bun bootstrap does not support macOS {arch}.")),
    };
    let bun_root = layout.root.join("bun");
    let downloads = bun_root.join("downloads");
    let unpacked = bun_root.join("unpacked");
    std::fs::create_dir_all(&downloads)
        .map_err(|error| format!("create {}: {error}", downloads.display()))?;
    std::fs::create_dir_all(&unpacked)
        .map_err(|error| format!("create {}: {error}", unpacked.display()))?;
    let archive = downloads.join(format!("bun-v{BUN_VERSION}-{target}.zip"));
    let url =
        format!("https://github.com/oven-sh/bun/releases/download/bun-v{BUN_VERSION}/{target}.zip");
    let expected_sha256 = bun_macos_archive_sha256(target)
        .ok_or_else(|| format!("No embedded Bun checksum is available for {target}."))?;
    download_verified_archive(&url, &archive, expected_sha256, "Bun")?;
    let mut unzip = Command::new("/usr/bin/unzip");
    unzip.args(["-o"]).arg(&archive).arg("-d").arg(&unpacked);
    clear_bootstrap_credential_env(&mut unzip);
    run_cli_installer(unzip, "Bun extract")?;
    let source = unpacked.join(target).join("bun");
    let destination = bun_root.join("bin").join("bun");
    atomic_install_executable(&source, &destination)?;
    Ok(destination)
}

#[cfg(not(target_os = "macos"))]
fn install_managed_bun_at(app_support: &Path) -> Result<PathBuf, String> {
    let root = app_support.join("providers").join("gajecode").join("bun");
    let mut command = cli_command("npm");
    command
        .args(["install", "-g", "--prefix"])
        .arg(&root)
        .arg(BUN_PACKAGE);
    run_cli_installer(command, "Bun")?;
    gajecode_bun_executable_path_at(app_support)
        .ok_or_else(|| "The managed Bun executable was not installed.".to_string())
}

fn bootstrap_gajecode_skills_at(app_support: &Path) -> Result<(), String> {
    let layout = managed_runtime_layout_at(app_support, "gajecode")?;
    let workspace = layout
        .workspace
        .as_deref()
        .ok_or_else(|| "The Gajaecode workspace is unavailable.".to_string())?;
    let mut setup = gajecode_command_at(app_support)?;
    setup.args(["setup", "defaults"]).current_dir(workspace);
    run_runtime_probe(
        setup,
        "Gajaecode default skill bootstrap",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?;
    let mut check = gajecode_command_at(app_support)?;
    check
        .args(["setup", "defaults", "--check"])
        .current_dir(workspace);
    let check_succeeded = run_runtime_probe(
        check,
        "Gajaecode default skill check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )
    .is_ok();
    if !check_succeeded {
        let mut repair = gajecode_command_at(app_support)?;
        repair
            .args(["setup", "defaults", "--force"])
            .current_dir(workspace);
        run_runtime_probe(
            repair,
            "Gajaecode default skill repair",
            MANAGED_RUNTIME_CHECK_TIMEOUT,
        )?;
        let mut repaired_check = gajecode_command_at(app_support)?;
        repaired_check
            .args(["setup", "defaults", "--check"])
            .current_dir(workspace);
        run_runtime_probe(
            repaired_check,
            "Gajaecode repaired default skill check",
            MANAGED_RUNTIME_CHECK_TIMEOUT,
        )?;
    }
    write_gajecode_skill_integrity_manifest(&layout.skills)
}

fn install_gajecode_cli_at(app_support: &Path) -> Result<(), String> {
    let bun = install_managed_bun_at(app_support)?;
    let mut bun_version = cli_command(&bun.to_string_lossy());
    configure_gajecode_runtime_env_at(&mut bun_version, app_support)?;
    bun_version.arg("--version");
    let detected = first_semver_token(&run_runtime_probe(
        bun_version,
        "Bun version check",
        MANAGED_RUNTIME_CHECK_TIMEOUT,
    )?)
    .ok_or_else(|| "Could not parse the managed Bun version.".to_string())?;
    if detected != BUN_VERSION {
        return Err(format!(
            "Atelier requires Bun {BUN_VERSION}, but bootstrap installed {detected}."
        ));
    }
    let mut command = cli_command(&bun.to_string_lossy());
    configure_gajecode_runtime_env_at(&mut command, app_support)?;
    command.args(["install", "-g", GAJAE_CODE_PACKAGE]);
    run_cli_installer(command, "gajecode")?;
    bootstrap_gajecode_skills_at(app_support)
}

#[cfg(target_os = "macos")]
fn install_grok_cli_at(app_support: &Path) -> Result<(), String> {
    let layout = managed_runtime_layout_at(app_support, "grok")?;
    ensure_runtime_layout(&layout)?;
    let target = match std::env::consts::ARCH {
        "aarch64" => "macos-aarch64",
        "x86_64" => "macos-x86_64",
        arch => return Err(format!("Grok bootstrap does not support macOS {arch}.")),
    };
    let expected_sha256 = grok_macos_binary_sha256(target)
        .ok_or_else(|| format!("No embedded Grok checksum is available for {target}."))?;
    let downloads = layout.root.join("downloads");
    std::fs::create_dir_all(&downloads)
        .map_err(|error| format!("create {}: {error}", downloads.display()))?;
    let downloaded = downloads.join(format!("grok-{GROK_VERSION}-{target}"));
    let url = format!("https://x.ai/cli/grok-{GROK_VERSION}-{target}");
    download_verified_archive(&url, &downloaded, expected_sha256, "Grok")?;

    let mut signature = Command::new("/usr/bin/codesign");
    signature.args(["--verify", "--strict"]).arg(&downloaded);
    clear_bootstrap_credential_env(&mut signature);
    run_cli_installer(signature, "Grok Developer ID verification")?;

    let destination = layout.root.join("bin").join("grok");
    atomic_install_executable(&downloaded, &destination)?;
    let (verified, _) = verify_grok_components_at(app_support)?;
    if verified != std::fs::canonicalize(&destination).unwrap_or(destination) {
        return Err("Grok installer published an unexpected executable path.".to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn install_grok_cli_at(_: &Path) -> Result<(), String> {
    Err("Automatic pinned Grok installation is currently verified on macOS only.".to_string())
}

fn ensure_managed_agent_runtime_blocking_at<F>(
    app_support: &Path,
    provider: &str,
    mut progress: F,
) -> Result<ManagedAgentRuntimeReadiness, String>
where
    F: FnMut(&str, &str),
{
    let _guard = acquire_runtime_install_lock(provider)?;
    progress("checking", "Checking the Atelier-managed runtime.");
    if let Ok(ready) = verify_managed_runtime_at(app_support, provider) {
        progress("ready", "The Atelier-managed runtime is ready.");
        return Ok(ready);
    }

    progress(
        "installing",
        "Installing or repairing the pinned Atelier-managed runtime.",
    );
    match provider {
        "hermes" => install_hermes_cli_at(app_support)?,
        "gajecode" => install_gajecode_cli_at(app_support)?,
        "grok" => install_grok_cli_at(app_support)?,
        _ => return Err(format!("Unsupported managed runtime provider: {provider}")),
    }

    progress(
        "bootstrapping_skills",
        "Verifying the isolated default skill bundle.",
    );
    let layout = managed_runtime_layout_at(app_support, provider)?;
    let (executable, skill_count) = match provider {
        "hermes" => verify_hermes_components_at(app_support)?,
        "gajecode" => verify_gajecode_components_at(app_support)?,
        "grok" => verify_grok_components_at(app_support)?,
        _ => return Err(format!("Unsupported managed runtime provider: {provider}")),
    };
    let receipt = expected_runtime_receipt(&layout, &executable, skill_count)?;
    write_runtime_receipt(&layout.receipt, &receipt)?;

    progress(
        "verifying",
        "Validating the pinned runtime readiness receipt.",
    );
    let mut ready = verify_managed_runtime_at(app_support, provider)?;
    ready.repaired = true;
    progress("ready", "The Atelier-managed runtime is ready.");
    Ok(ready)
}

fn emit_managed_runtime_progress<R: Runtime>(
    app: &AppHandle<R>,
    provider: &str,
    state: &str,
    message: &str,
) {
    let _ = app.emit(
        "managed-agent-runtime-progress",
        ManagedAgentRuntimeProgress {
            provider: provider.to_string(),
            state: state.to_string(),
            message: message.to_string(),
        },
    );
}

/// Ensure an exact, Atelier-owned Hermes or Gajaecode runtime before a managed
/// send. This never reads provider credentials and never accepts a global CLI,
/// global HOME, or global skill directory as readiness evidence.
pub async fn ensure_managed_agent_runtime<R: Runtime>(
    app: &AppHandle<R>,
    provider: &str,
) -> Result<ManagedAgentRuntimeReadiness, String> {
    let provider = provider.trim().to_ascii_lowercase();
    let app_support = app_support_dir().ok_or_else(|| {
        "Could not resolve the Atelier Application Support directory.".to_string()
    })?;
    let progress_app = app.clone();
    let progress_provider = provider.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        ensure_managed_agent_runtime_blocking_at(
            &app_support,
            &progress_provider,
            |state, message| {
                emit_managed_runtime_progress(&progress_app, &progress_provider, state, message);
            },
        )
    })
    .await
    .map_err(|error| format!("{provider} runtime preparation task failed: {error}"))?;
    if result.is_err() {
        emit_managed_runtime_progress(
            app,
            &provider,
            "failed",
            "The Atelier-managed runtime could not be prepared.",
        );
    }
    result
}

#[tauri::command]
pub async fn provider_prepare_managed_runtime<R: Runtime>(
    app: AppHandle<R>,
    provider: String,
) -> Result<ManagedAgentRuntimeReadiness, String> {
    ensure_managed_agent_runtime(&app, &provider).await
}

#[derive(Debug, Serialize)]
pub struct GajecodeUpdateStatus {
    pub installed: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub message: Option<String>,
}

fn first_semver_token(text: &str) -> Option<String> {
    text.split(|c: char| !(c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_'))
        .map(str::trim)
        .find(|token| token.chars().next().is_some_and(|c| c.is_ascii_digit()))
        .map(|token| {
            token
                .trim_matches(|c: char| {
                    !(c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
                })
                .to_string()
        })
        .filter(|token| !token.is_empty())
}

fn semver_parts(version: &str) -> Vec<u64> {
    version
        .split(['.', '-', '_'])
        .filter_map(|part| part.parse::<u64>().ok())
        .collect()
}

fn compare_semver(left: &str, right: &str) -> std::cmp::Ordering {
    let left_parts = semver_parts(left);
    let right_parts = semver_parts(right);
    for index in 0..left_parts.len().max(right_parts.len()) {
        let left = *left_parts.get(index).unwrap_or(&0);
        let right = *right_parts.get(index).unwrap_or(&0);
        if left != right {
            return left.cmp(&right);
        }
    }
    std::cmp::Ordering::Equal
}

fn read_gajecode_current_version() -> Option<String> {
    let mut command = gajecode_isolated_cli_command().ok()?;
    command
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    configure_background_command(&mut command);
    let output = command.output().ok()?;
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push('\n');
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    first_semver_token(&combined)
}

fn gajecode_update_status(
    installed: bool,
    current_version: Option<String>,
) -> GajecodeUpdateStatus {
    let latest_version = Some(GAJAE_CODE_VERSION.to_string());
    if !installed {
        return GajecodeUpdateStatus {
            installed: false,
            current_version: None,
            latest_version,
            update_available: false,
            message: Some("가재코드 CLI가 설치되어 있지 않습니다.".to_string()),
        };
    }

    let Some(current) = current_version else {
        return GajecodeUpdateStatus {
            installed: true,
            current_version: None,
            latest_version,
            update_available: true,
            message: Some(
                "설치된 가재코드 버전을 확인하지 못했습니다. 업데이트로 Atelier 지원 버전을 복구할 수 있습니다."
                    .to_string(),
            ),
        };
    };

    let (update_available, message) = match compare_semver(&current, GAJAE_CODE_VERSION) {
        std::cmp::Ordering::Less => (true, None),
        std::cmp::Ordering::Equal => (false, None),
        std::cmp::Ordering::Greater => (
            false,
            Some(format!(
                "설치된 가재코드 {current}은 Atelier 지원 버전 {GAJAE_CODE_VERSION}보다 최신입니다. 설치·복구를 실행하면 지원 버전으로 복원됩니다."
            )),
        ),
    };
    GajecodeUpdateStatus {
        installed: true,
        current_version: Some(current),
        latest_version,
        update_available,
        message,
    }
}

#[tauri::command]
pub async fn gajecode_check_update() -> Result<GajecodeUpdateStatus, String> {
    let installed = gajecode_cli_installed();
    let current_version = installed.then(read_gajecode_current_version).flatten();
    Ok(gajecode_update_status(installed, current_version))
}

#[tauri::command]
pub async fn gajecode_update<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ManagedAgentRuntimeReadiness, String> {
    ensure_managed_agent_runtime(&app, "gajecode").await
}

#[derive(Debug, Serialize)]
pub struct GrokUpdateStatus {
    pub installed: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub message: Option<String>,
}

fn read_grok_current_version() -> Option<String> {
    let mut command = grok_isolated_cli_command().ok()?;
    command
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    configure_background_command(&mut command);
    let output = command.output().ok()?;
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push('\n');
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    first_semver_token(&combined)
}

#[tauri::command]
pub async fn grok_check_update() -> Result<GrokUpdateStatus, String> {
    let installed = grok_executable_path().is_some();
    let current_version = installed.then(read_grok_current_version).flatten();
    let ready = app_support_dir()
        .is_some_and(|app_support| verify_managed_runtime_at(&app_support, "grok").is_ok());
    let update_available =
        installed && (!ready || current_version.as_deref() != Some(GROK_VERSION));
    Ok(GrokUpdateStatus {
        installed,
        current_version,
        latest_version: Some(GROK_VERSION.to_string()),
        update_available,
        message: update_available
            .then(|| "Atelier가 검증한 Grok Build 실행환경으로 복구할 수 있습니다.".to_string()),
    })
}

#[tauri::command]
pub async fn grok_update<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ManagedAgentRuntimeReadiness, String> {
    ensure_managed_agent_runtime(&app, "grok").await
}

#[derive(Serialize)]
pub struct HermesUpdateStatus {
    pub installed: bool,
    pub current_version: Option<String>,
    pub update_available: bool,
    pub commits_behind: Option<u32>,
    pub message: Option<String>,
}

/// `hermes --version` 출력을 파싱해 현재 버전과 업데이트 여부를 보고한다.
/// hermes CLI 가 자체적으로 GitHub 원격 HEAD 와 비교해 "Update available: N commits behind" 를 출력한다.
#[tauri::command]
pub async fn hermes_check_update() -> Result<HermesUpdateStatus, String> {
    let empty = HermesUpdateStatus {
        installed: false,
        current_version: None,
        update_available: false,
        commits_behind: None,
        message: None,
    };
    let Some(executable) = hermes_executable_path() else {
        return Ok(empty);
    };
    let mut command = cli_command(&executable.to_string_lossy());
    command
        .arg("--version")
        .env("PATH", crate::augmented_cli_path());
    configure_background_command(&mut command);
    let output = match command.output() {
        Ok(o) => o,
        Err(_) => return Ok(empty),
    };
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push('\n');
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    let mut current_version: Option<String> = None;
    if !output.status.success() {
        return Ok(empty);
    }
    for line in combined.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("Hermes Agent ") {
            current_version = Some(rest.to_string());
        }
    }
    let update_available = !hermes_install_record_is_current();
    let message = update_available.then(|| {
        "Reinstall the Atelier-pinned Hermes build to restore a verified runtime.".to_string()
    });
    Ok(HermesUpdateStatus {
        installed: true,
        current_version,
        update_available,
        commits_behind: None,
        message,
    })
}

/// Mutable upstream updates can silently change the runtime after release. Reinstall the
/// immutable Hermes commit selected by this Atelier build and return only after verification.
#[tauri::command]
pub async fn hermes_update() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(install_hermes_cli)
        .await
        .map_err(|error| format!("Hermes reinstall task failed: {error}"))?
}

fn should_inject_agent_api_key(provider: &str, state: &CredentialState) -> bool {
    // Claude/Codex CLI can authenticate through their own subscription OAuth.
    // If Atelier also injects a stale API key, the CLI prefers that env var and
    // fails with confusing 401/exit 1 errors even though subscription login is valid.
    !(matches!(provider, "claude" | "codex") && state.oauth_logged_in)
}

pub fn should_clear_inherited_agent_api_env(provider: &str) -> bool {
    matches!(provider, "claude" | "codex")
}

/// agent.rs 가 spawn 직전에 호출. provider 별 keychain API 키를 반환.
/// 실제 키 노출이 필요한 유일한 경로. 호출처는 env 주입 후 즉시 폐기.
pub fn read_api_key(provider: &str) -> Option<String> {
    let meta = provider_meta(provider)?;
    if !meta.supports_api {
        return None;
    }
    let v = read_app_keychain_password(provider, "api_key")?;
    let v = v.trim().to_string();
    if v.is_empty() || !is_valid_api_key_for_provider(provider, &v) {
        None
    } else {
        Some(v)
    }
}

/// Claude/Codex 작업 CLI용 API 키. 구독 OAuth가 연결되어 있으면 API 키를
/// 일부러 주입하지 않는다. Hermes 같은 API backend 경로는 read_api_key를 직접 쓴다.
pub fn read_agent_api_key(provider: &str) -> Option<String> {
    let state = credential_state(provider);
    if matches!(provider, "claude" | "codex")
        && !state.oauth_logged_in
        && state.api_key_present
        && detect_oauth(provider)
    {
        return None;
    }
    if !should_inject_agent_api_key(provider, &state) {
        return None;
    }
    read_api_key(provider)
}

/// provider id → 환경변수명. agent.rs spawn 시 사용.
pub fn env_var_for(provider: &str) -> Option<&'static str> {
    provider_meta(provider).and_then(|m| m.env_var)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grok_auth_detection_requires_a_non_empty_token_field() {
        assert!(grok_auth_value_has_token(&serde_json::json!({
            "https://auth.x.ai": { "key": "fixture-token" }
        })));
        assert!(grok_auth_value_has_token(&serde_json::json!({
            "credential": { "access_token": "fixture-token" }
        })));
        assert!(!grok_auth_value_has_token(&serde_json::json!({
            "https://auth.x.ai": { "key": "" }
        })));
        assert!(!grok_auth_value_has_token(&serde_json::json!({
            "profile": { "email": "user@example.com" }
        })));
    }

    struct ManagedRuntimeTestRoot(PathBuf);

    impl ManagedRuntimeTestRoot {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "atelier-managed-runtime-{label}-{}",
                uuid::Uuid::new_v4()
            ));
            std::fs::create_dir_all(&path).expect("create managed runtime test root");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for ManagedRuntimeTestRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn codex_fixture_jwt(exp: i64) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"RS256","typ":"JWT"}"#);
        let claims =
            URL_SAFE_NO_PAD.encode(serde_json::json!({ "exp": exp }).to_string().as_bytes());
        format!("{header}.{claims}.fixture-signature")
    }

    fn write_codex_auth_fixture(
        codex_home: &Path,
        access_token: &str,
        refresh_token: &str,
    ) -> PathBuf {
        std::fs::create_dir_all(codex_home).expect("create Codex fixture home");
        let auth_path = codex_home.join("auth.json");
        let body = serde_json::json!({
            "auth_mode": "chatgpt",
            "OPENAI_API_KEY": null,
            "tokens": {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "id_token": "fixture-id-token",
                "account_id": "fixture-account"
            },
            "last_refresh": "2026-07-26T00:00:00Z"
        });
        std::fs::write(&auth_path, body.to_string()).expect("write Codex auth fixture");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&auth_path, std::fs::Permissions::from_mode(0o600))
                .expect("secure Codex auth fixture permissions");
        }
        auth_path
    }

    #[test]
    fn gajecode_update_status_compares_only_against_atelier_supported_pin() {
        let old = gajecode_update_status(true, Some("0.12.8".to_string()));
        assert!(old.installed);
        assert_eq!(old.current_version.as_deref(), Some("0.12.8"));
        assert_eq!(old.latest_version.as_deref(), Some(GAJAE_CODE_VERSION));
        assert!(old.update_available);
        assert!(old.message.is_none());

        let supported = gajecode_update_status(true, Some(GAJAE_CODE_VERSION.to_string()));
        assert!(supported.installed);
        assert_eq!(
            supported.current_version.as_deref(),
            Some(GAJAE_CODE_VERSION)
        );
        assert_eq!(
            supported.latest_version.as_deref(),
            Some(GAJAE_CODE_VERSION)
        );
        assert!(!supported.update_available);
        assert!(supported.message.is_none());

        let missing = gajecode_update_status(false, None);
        assert!(!missing.installed);
        assert!(missing.current_version.is_none());
        assert_eq!(missing.latest_version.as_deref(), Some(GAJAE_CODE_VERSION));
        assert!(!missing.update_available);
        assert!(missing
            .message
            .as_deref()
            .is_some_and(|message| message.contains("설치되어 있지 않습니다")));

        let newer = gajecode_update_status(true, Some("0.15.0".to_string()));
        assert!(newer.installed);
        assert_eq!(newer.current_version.as_deref(), Some("0.15.0"));
        assert!(!newer.update_available);
        assert!(newer
            .message
            .as_deref()
            .is_some_and(|message| message.contains("지원 버전으로 복원")));

        let unreadable = gajecode_update_status(true, None);
        assert!(unreadable.installed);
        assert!(unreadable.update_available);
        assert!(unreadable
            .message
            .as_deref()
            .is_some_and(|message| message.contains("버전을 확인하지 못했습니다")));
    }

    #[cfg(unix)]
    fn write_test_executable(path: &Path, script: &str) {
        use std::os::unix::fs::PermissionsExt;

        std::fs::create_dir_all(path.parent().expect("test executable parent"))
            .expect("create test executable parent");
        std::fs::write(path, script).expect("write test executable");
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
            .expect("chmod test executable");
    }

    #[cfg(unix)]
    fn run_test_git(checkout: &Path, args: &[&str]) -> String {
        let mut command = if cfg!(target_os = "macos") && Path::new("/usr/bin/git").is_file() {
            Command::new("/usr/bin/git")
        } else {
            Command::new("git")
        };
        let output = command
            .current_dir(checkout)
            .args(args)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .output()
            .expect("run test git");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout)
            .expect("test git UTF-8")
            .trim()
            .to_string()
    }

    #[cfg(unix)]
    fn create_hermes_checkout_fixture(
        app_support: &Path,
        include_symlink: bool,
    ) -> (PathBuf, String) {
        let layout =
            managed_runtime_layout_at(app_support, "hermes").expect("Hermes fixture layout");
        ensure_runtime_layout(&layout).expect("create Hermes fixture layout");
        let checkout = layout
            .cache
            .join("git-v0/checkouts/fixture-owner/fixture-checkout");
        std::fs::create_dir_all(&checkout).expect("create Hermes checkout fixture");
        run_test_git(&checkout, &["init", "-q"]);
        let skill_dir = checkout.join("skills/fixture-category/fixture-skill");
        std::fs::create_dir_all(&skill_dir).expect("create Hermes fixture skill");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: fixture-skill\n---\ncommitted source\n",
        )
        .expect("write Hermes fixture skill");
        std::fs::write(
            checkout.join("skills/fixture-category/DESCRIPTION.md"),
            "Fixture category\n",
        )
        .expect("write Hermes fixture description");
        if include_symlink {
            std::os::unix::fs::symlink("SKILL.md", skill_dir.join("linked-skill.md"))
                .expect("create Hermes fixture symlink");
        }
        run_test_git(&checkout, &["add", "skills"]);
        run_test_git(
            &checkout,
            &[
                "-c",
                "user.name=Atelier Test",
                "-c",
                "user.email=atelier-test@example.invalid",
                "commit",
                "-q",
                "-m",
                "fixture",
            ],
        );
        let commit = run_test_git(&checkout, &["rev-parse", "HEAD"]);
        (checkout, commit)
    }

    #[test]
    fn managed_layout_keeps_provider_homes_and_skills_inside_app_support() {
        let root = ManagedRuntimeTestRoot::new("layout");
        let hermes =
            managed_runtime_layout_at(root.path(), "hermes").expect("Hermes managed layout");
        let gajecode =
            managed_runtime_layout_at(root.path(), "gajecode").expect("Gajaecode managed layout");

        assert_eq!(hermes.home, root.path().join("providers/hermes/home"));
        assert_eq!(hermes.skills, hermes.home.join("skills"));
        assert_eq!(
            gajecode.skills,
            root.path()
                .join("providers/gajecode/home/.gjc/agent/skills")
        );
        assert_eq!(
            gajecode.workspace,
            Some(root.path().join("providers/gajecode/workspace"))
        );
        assert!(!gajecode.skills.to_string_lossy().contains("/.codex/skills"));
        assert!(!gajecode
            .skills
            .to_string_lossy()
            .contains("/.claude/skills"));
    }

    #[test]
    fn isolated_runtime_envs_use_only_the_temp_app_support_provider_homes() {
        let root = ManagedRuntimeTestRoot::new("env");
        let mut hermes = Command::new("/usr/bin/true");
        configure_hermes_runtime_env_at(&mut hermes, root.path())
            .expect("configure Hermes test env");
        let hermes_env = hermes
            .get_envs()
            .filter_map(|(key, value)| {
                value.map(|value| {
                    (
                        key.to_string_lossy().into_owned(),
                        value.to_string_lossy().into_owned(),
                    )
                })
            })
            .collect::<HashMap<_, _>>();
        assert_eq!(
            hermes_env.get("HERMES_HOME").map(String::as_str),
            Some(
                root.path()
                    .join("providers/hermes/home")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        assert_eq!(
            hermes_env.get("UV_PYTHON_INSTALL_DIR").map(String::as_str),
            Some(
                root.path()
                    .join("providers/hermes/uv-python")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        assert!(
            hermes
                .get_envs()
                .any(|(key, value)| { key == "HERMES_BUNDLED_SKILLS" && value.is_none() }),
            "normal Hermes runtime commands must clear inherited bundled-source overrides"
        );

        let mut gajecode = Command::new("/usr/bin/true");
        configure_gajecode_runtime_env_at(&mut gajecode, root.path())
            .expect("configure Gajaecode test env");
        let gajecode_env = gajecode
            .get_envs()
            .filter_map(|(key, value)| {
                value.map(|value| {
                    (
                        key.to_string_lossy().into_owned(),
                        value.to_string_lossy().into_owned(),
                    )
                })
            })
            .collect::<HashMap<_, _>>();
        assert_eq!(
            gajecode_env.get("GJC_CONFIG_DIR").map(String::as_str),
            Some(
                root.path()
                    .join("providers/gajecode/home/.gjc")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        assert_eq!(
            gajecode_env.get("GJC_CODING_AGENT_DIR").map(String::as_str),
            Some(
                root.path()
                    .join("providers/gajecode/home/.gjc/agent")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        assert_eq!(
            gajecode_env.get("ATELIER_SKILLS_DIR").map(String::as_str),
            Some(
                root.path()
                    .join("providers/gajecode/home/.gjc/agent/skills")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        for key in [
            "OPENAI_CODEX_OAUTH_TOKEN",
            "OPENAI_API_KEY",
            "CODEX_API_KEY",
            "OPENAI_OAUTH_TOKEN",
            "CODEX_OAUTH_TOKEN",
            "CHATGPT_ACCESS_TOKEN",
            "OPENAI_ACCESS_TOKEN",
        ] {
            assert!(
                gajecode
                    .get_envs()
                    .any(|(candidate, value)| candidate == key && value.is_none()),
                "isolated Gajae runtime must scrub inherited {key}"
            );
        }
    }

    #[test]
    fn codex_subscription_reader_returns_only_a_fresh_access_token() {
        let root = ManagedRuntimeTestRoot::new("codex-access");
        let codex_home = root.path().join("codex-home");
        let now = 1_900_000_000;
        let access_token = codex_fixture_jwt(now + 3_600);
        let refresh_token = "fixture-refresh-token-must-never-leave-auth-json";
        write_codex_auth_fixture(&codex_home, &access_token, refresh_token);

        let loaded = read_codex_subscription_access_token_at(&codex_home, now)
            .expect("read fresh Codex access token");
        assert_eq!(loaded, access_token);
        assert_ne!(loaded, refresh_token);
        assert!(!loaded.contains(refresh_token));
    }

    #[test]
    fn managed_hermes_codex_stage_uses_access_only_and_restores_prior_provider() {
        let root = ManagedRuntimeTestRoot::new("hermes-codex-stage");
        let hermes_home = root.path().join("hermes-home");
        std::fs::create_dir_all(&hermes_home).expect("create managed Hermes home");
        let auth_path = hermes_home.join("auth.json");
        let existing = serde_json::json!({
            "version": 1,
            "active_provider": "anthropic",
            "providers": {
                "anthropic": { "api_key": "fixture-user-owned-anthropic" }
            },
            "credential_pool": {
                "openai-codex": [{
                    "id": "fixture-user-owned-codex",
                    "source": "manual:api_key",
                    "access_token": "fixture-user-owned-codex-token"
                }]
            }
        });
        write_managed_hermes_auth(&auth_path, &existing).expect("write existing Hermes auth");

        let staged = stage_codex_access_for_managed_hermes_at(
            &hermes_home,
            "fixture-short-lived-codex-access",
        )
        .expect("stage managed Hermes Codex access");
        assert!(staged);
        let mut staged_auth = load_managed_hermes_auth(&auth_path).expect("read staged auth");
        assert_eq!(
            staged_auth.get("active_provider").and_then(Value::as_str),
            Some("openai-codex")
        );
        let provider = &staged_auth["providers"]["openai-codex"];
        assert_eq!(
            provider["tokens"]["access_token"].as_str(),
            Some("fixture-short-lived-codex-access")
        );
        assert_eq!(
            provider["tokens"]["refresh_token"].as_str(),
            Some(MANAGED_HERMES_CODEX_REFRESH_MARKER)
        );
        assert_eq!(
            provider["atelier_previous_active_provider"].as_str(),
            Some("anthropic")
        );
        assert!(!staged_auth.to_string().contains("fixture-refresh"));

        // Hermes mirrors the singleton into its pool during startup. The
        // post-run scrub must remove that derived entry without touching a
        // user-owned pool credential.
        staged_auth["credential_pool"]["openai-codex"]
            .as_array_mut()
            .expect("Codex pool")
            .push(serde_json::json!({
                "id": "device_code",
                "source": "device_code",
                "access_token": "fixture-short-lived-codex-access",
                "refresh_token": MANAGED_HERMES_CODEX_REFRESH_MARKER
            }));
        write_managed_hermes_auth(&auth_path, &staged_auth)
            .expect("write Hermes mirrored pool fixture");
        scrub_codex_access_from_managed_hermes_at(&hermes_home)
            .expect("scrub managed Hermes Codex access");

        let scrubbed = load_managed_hermes_auth(&auth_path).expect("read scrubbed auth");
        assert_eq!(
            scrubbed.get("active_provider").and_then(Value::as_str),
            Some("anthropic")
        );
        assert!(scrubbed["providers"].get("openai-codex").is_none());
        assert_eq!(
            scrubbed["providers"]["anthropic"]["api_key"].as_str(),
            Some("fixture-user-owned-anthropic")
        );
        let pool = scrubbed["credential_pool"]["openai-codex"]
            .as_array()
            .expect("remaining Codex pool");
        assert_eq!(pool.len(), 1);
        assert_eq!(
            pool[0].get("id").and_then(Value::as_str),
            Some("fixture-user-owned-codex")
        );
        assert!(!scrubbed
            .to_string()
            .contains("fixture-short-lived-codex-access"));
        assert!(!scrubbed
            .to_string()
            .contains(MANAGED_HERMES_CODEX_REFRESH_MARKER));
    }

    #[test]
    fn managed_hermes_codex_stage_never_overwrites_user_owned_codex_auth() {
        let root = ManagedRuntimeTestRoot::new("hermes-user-codex");
        let hermes_home = root.path().join("hermes-home");
        std::fs::create_dir_all(&hermes_home).expect("create managed Hermes home");
        let auth_path = hermes_home.join("auth.json");
        let existing = serde_json::json!({
            "version": 1,
            "active_provider": "openai-codex",
            "providers": {
                "openai-codex": {
                    "auth_mode": "chatgpt",
                    "tokens": {
                        "access_token": "fixture-user-access",
                        "refresh_token": "fixture-user-refresh"
                    }
                }
            }
        });
        write_managed_hermes_auth(&auth_path, &existing).expect("write user Hermes auth");

        let staged =
            stage_codex_access_for_managed_hermes_at(&hermes_home, "fixture-atelier-access")
                .expect("inspect user-owned Hermes auth");
        assert!(!staged);
        assert_eq!(
            load_managed_hermes_auth(&auth_path).expect("read preserved auth"),
            existing
        );
    }

    #[test]
    fn codex_subscription_reader_rejects_expiry_size_and_schema_failures() {
        let now = 1_900_000_000;

        let expired_root = ManagedRuntimeTestRoot::new("codex-expired");
        let expired_home = expired_root.path().join("codex-home");
        let expired = codex_fixture_jwt(now + CODEX_ACCESS_TOKEN_MIN_FRESHNESS_SECONDS);
        write_codex_auth_fixture(&expired_home, &expired, "fixture-refresh-expired");
        let expired_error = read_codex_subscription_access_token_at(&expired_home, now)
            .expect_err("expired Codex token must fail closed");
        assert!(expired_error.contains("expired"));
        assert!(!expired_error.contains("fixture-refresh-expired"));

        let schema_root = ManagedRuntimeTestRoot::new("codex-schema");
        let schema_home = schema_root.path().join("codex-home");
        std::fs::create_dir_all(&schema_home).expect("create schema fixture home");
        let schema_path = schema_home.join("auth.json");
        std::fs::write(
            &schema_path,
            r#"{"auth_mode":"chatgpt","tokens":{"refresh_token":"fixture-refresh-only"}}"#,
        )
        .expect("write malformed Codex auth fixture");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&schema_path, std::fs::Permissions::from_mode(0o600))
                .expect("secure malformed Codex auth fixture");
        }
        let schema_error = read_codex_subscription_access_token_at(&schema_home, now)
            .expect_err("missing access token must fail closed");
        assert!(schema_error.contains("schema"));
        assert!(!schema_error.contains("fixture-refresh-only"));

        let size_root = ManagedRuntimeTestRoot::new("codex-size");
        let size_home = size_root.path().join("codex-home");
        let valid = codex_fixture_jwt(now + 3_600);
        let size_path = write_codex_auth_fixture(&size_home, &valid, "fixture-refresh-size");
        std::fs::write(&size_path, vec![b'x'; CODEX_AUTH_MAX_BYTES as usize + 1])
            .expect("write oversized Codex auth fixture");
        let size_error = read_codex_subscription_access_token_at(&size_home, now)
            .expect_err("oversized Codex auth file must fail closed");
        assert!(size_error.contains("size"));
    }

    #[cfg(unix)]
    #[test]
    fn codex_subscription_reader_rejects_symlinked_paths_and_broad_permissions() {
        use std::os::unix::fs::{symlink, PermissionsExt};

        let now = 1_900_000_000;
        let access_token = codex_fixture_jwt(now + 3_600);

        let file_link_root = ManagedRuntimeTestRoot::new("codex-file-link");
        let file_link_home = file_link_root.path().join("codex-home");
        std::fs::create_dir_all(&file_link_home).expect("create linked-file Codex home");
        let target_home = file_link_root.path().join("target-home");
        let target_auth =
            write_codex_auth_fixture(&target_home, &access_token, "fixture-refresh-link");
        symlink(&target_auth, file_link_home.join("auth.json"))
            .expect("create Codex auth symlink fixture");
        let file_link_error = read_codex_subscription_access_token_at(&file_link_home, now)
            .expect_err("symlinked Codex auth file must fail closed");
        assert!(file_link_error.contains("trusted regular file"));

        let home_link_root = ManagedRuntimeTestRoot::new("codex-home-link");
        let real_home = home_link_root.path().join("real-home");
        write_codex_auth_fixture(&real_home, &access_token, "fixture-refresh-home-link");
        let linked_home = home_link_root.path().join("linked-home");
        symlink(&real_home, &linked_home).expect("create Codex home symlink fixture");
        let home_link_error = read_codex_subscription_access_token_at(&linked_home, now)
            .expect_err("symlinked Codex home must fail closed");
        assert!(home_link_error.contains("trusted regular directory"));

        let permission_root = ManagedRuntimeTestRoot::new("codex-permissions");
        let permission_home = permission_root.path().join("codex-home");
        let permission_path = write_codex_auth_fixture(
            &permission_home,
            &access_token,
            "fixture-refresh-permissions",
        );
        std::fs::set_permissions(&permission_path, std::fs::Permissions::from_mode(0o644))
            .expect("broaden Codex auth fixture permissions");
        let permission_error = read_codex_subscription_access_token_at(&permission_home, now)
            .expect_err("broad Codex auth permissions must fail closed");
        assert!(permission_error.contains("permissions"));
    }

    #[test]
    #[ignore = "reads the current user's Codex CLI session without making a provider request"]
    fn manual_real_gajecode_codex_access_bridge() {
        let access_token = prepare_gajecode_codex_subscription_token()
            .expect("current Codex ChatGPT session should provide a fresh access token");
        validate_codex_access_token(&access_token, chrono::Utc::now().timestamp())
            .expect("bridged Codex access token should remain fresh");
    }

    #[test]
    #[ignore = "mutates only the explicitly supplied real managed Gajaecode runtime root"]
    fn manual_real_managed_gajecode_update_proof() {
        let raw_root = std::env::var("ATELIER_MANAGED_GAJECODE_PROOF_ROOT").expect(
            "ATELIER_MANAGED_GAJECODE_PROOF_ROOT must explicitly name the existing providers/gajecode root",
        );
        let declared_provider_root = PathBuf::from(raw_root);
        assert!(
            declared_provider_root.is_absolute(),
            "ATELIER_MANAGED_GAJECODE_PROOF_ROOT must be an absolute path"
        );
        let provider_metadata = std::fs::symlink_metadata(&declared_provider_root)
            .expect("explicit providers/gajecode proof root must already exist");
        assert!(
            provider_metadata.is_dir() && !provider_metadata.file_type().is_symlink(),
            "explicit providers/gajecode proof root must be a trusted real directory"
        );
        assert_eq!(
            declared_provider_root
                .file_name()
                .and_then(|name| name.to_str()),
            Some("gajecode"),
            "explicit proof root must end with providers/gajecode"
        );
        let providers_root = declared_provider_root
            .parent()
            .expect("providers/gajecode proof root must have a parent");
        assert_eq!(
            providers_root.file_name().and_then(|name| name.to_str()),
            Some("providers"),
            "explicit proof root must end with providers/gajecode"
        );
        let app_support = providers_root
            .parent()
            .expect("providers/gajecode proof root must have an Application Support parent")
            .to_path_buf();
        let canonical_provider_root = std::fs::canonicalize(&declared_provider_root)
            .expect("canonicalize explicit providers/gajecode proof root");

        let readiness =
            ensure_managed_agent_runtime_blocking_at(&app_support, "gajecode", |state, message| {
                eprintln!("gajecode proof {state}: {message}")
            })
            .expect("production managed Gajaecode update must complete");
        assert!(readiness.ready);
        assert_eq!(readiness.runtime_pin, GAJAE_CODE_VERSION);
        assert_eq!(readiness.dependency_pin.as_deref(), Some(BUN_VERSION));
        assert_eq!(
            std::fs::canonicalize(&readiness.provider_root)
                .expect("canonicalize verified readiness provider root"),
            canonical_provider_root
        );
        let (_, skill_count) = verify_gajecode_components_at(&app_support)
            .expect("updated managed Gajaecode components must verify");
        assert_eq!(skill_count, GAJAE_DEFAULT_SKILLS.len());
        let mut version_probe = gajecode_command_at(&app_support)
            .expect("build the isolated post-update Gajaecode version probe");
        version_probe.arg("--version");
        let current_version = first_semver_token(
            &run_runtime_probe(
                version_probe,
                "post-update Gajaecode status proof",
                MANAGED_RUNTIME_CHECK_TIMEOUT,
            )
            .expect("read the post-update Gajaecode version"),
        )
        .expect("parse the post-update Gajaecode version");
        let update_status = gajecode_update_status(true, Some(current_version));
        assert!(!update_status.update_available);
        assert_eq!(
            update_status.current_version.as_deref(),
            Some(GAJAE_CODE_VERSION)
        );
        assert_eq!(
            update_status.latest_version.as_deref(),
            Some(GAJAE_CODE_VERSION)
        );
        eprintln!(
            "gajecode proof ready: runtime_pin={}, dependency_pin={}, skill_count={}, update_available={}, receipt={}",
            readiness.runtime_pin,
            readiness.dependency_pin.as_deref().unwrap_or("none"),
            skill_count,
            update_status.update_available,
            readiness.receipt_path
        );
    }

    #[test]
    #[ignore = "installs only into the explicitly supplied Atelier Application Support root"]
    fn manual_real_managed_grok_install_proof() {
        let raw_root = std::env::var("ATELIER_MANAGED_GROK_PROOF_APP_SUPPORT").expect(
            "ATELIER_MANAGED_GROK_PROOF_APP_SUPPORT must explicitly name the existing com.atelier.app root",
        );
        let app_support = PathBuf::from(raw_root);
        assert!(app_support.is_absolute());
        let metadata = std::fs::symlink_metadata(&app_support)
            .expect("explicit Atelier Application Support proof root must exist");
        assert!(metadata.is_dir() && !metadata.file_type().is_symlink());
        assert_eq!(
            app_support.file_name().and_then(|name| name.to_str()),
            Some("com.atelier.app")
        );

        let readiness =
            ensure_managed_agent_runtime_blocking_at(&app_support, "grok", |state, message| {
                eprintln!("grok proof {state}: {message}")
            })
            .expect("production managed Grok install must complete");
        assert!(readiness.ready);
        assert_eq!(readiness.runtime_pin, GROK_VERSION);
        assert!(readiness.dependency_pin.is_none());
        let (executable, skill_count) =
            verify_grok_components_at(&app_support).expect("verify managed Grok components");
        assert_eq!(skill_count, 0);
        assert_eq!(
            std::fs::canonicalize(&readiness.executable).expect("canonical readiness executable"),
            executable
        );
        let mut version = grok_command_at(&app_support).expect("build isolated Grok command");
        version.arg("--version");
        let output = run_runtime_probe(
            version,
            "post-install Grok version proof",
            MANAGED_RUNTIME_CHECK_TIMEOUT,
        )
        .expect("read installed Grok version");
        assert_eq!(first_semver_token(&output).as_deref(), Some(GROK_VERSION));
        eprintln!(
            "grok proof ready: runtime_pin={}, skill_count={}, receipt={}",
            readiness.runtime_pin, skill_count, readiness.receipt_path
        );
    }

    #[cfg(unix)]
    #[test]
    fn gajecode_readiness_requires_exact_pins_defaults_and_receipt() {
        let root = ManagedRuntimeTestRoot::new("gajecode");
        let layout = managed_runtime_layout_at(root.path(), "gajecode").expect("Gajaecode layout");
        ensure_runtime_layout(&layout).expect("create Gajaecode layout");
        let bun = layout.root.join("bun/bin/bun");
        let gjc = layout.root.join("bun/bin/gjc");
        write_test_executable(&bun, "#!/bin/sh\nprintf '1.3.14\\n'\n");
        write_test_executable(
            &gjc,
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then printf 'Gajae CLI 0.14.0\\n'; exit 0; fi\nif [ \"$1\" = \"setup\" ] && [ \"$2\" = \"defaults\" ]; then exit 0; fi\nexit 2\n",
        );
        for skill in GAJAE_DEFAULT_SKILLS {
            let skill_md = layout.skills.join(skill).join("SKILL.md");
            std::fs::create_dir_all(skill_md.parent().expect("skill parent"))
                .expect("create default skill");
            std::fs::write(skill_md, format!("---\nname: {skill}\n---\n"))
                .expect("write default skill");
        }
        write_gajecode_skill_integrity_manifest(&layout.skills)
            .expect("write Gajaecode skill integrity fixture");

        let (executable, count) =
            verify_gajecode_components_at(root.path()).expect("verify exact Gajaecode pins");
        let receipt =
            expected_runtime_receipt(&layout, &executable, count).expect("expected receipt");
        write_runtime_receipt(&layout.receipt, &receipt).expect("write readiness receipt");
        let ready = verify_managed_runtime_at(root.path(), "gajecode").expect("verified readiness");
        assert!(ready.ready);
        assert_eq!(ready.runtime_pin, GAJAE_CODE_VERSION);
        assert_eq!(ready.dependency_pin.as_deref(), Some(BUN_VERSION));

        write_test_executable(&bun, "#!/bin/sh\nprintf '1.3.13\\n'\n");
        let error = verify_managed_runtime_at(root.path(), "gajecode")
            .expect_err("wrong Bun pin must fail readiness");
        assert!(error.contains("requires Bun 1.3.14"));
    }

    #[test]
    fn managed_hash_implementations_match_known_vectors_and_release_pins() {
        let mut empty = HermesManifestMd5::new();
        empty.update(b"").expect("hash empty MD5 vector");
        assert_eq!(
            empty.finish().expect("finish empty MD5 vector"),
            "d41d8cd98f00b204e9800998ecf8427e"
        );
        let mut abc = HermesManifestMd5::new();
        abc.update(b"abc").expect("hash abc MD5 vector");
        assert_eq!(
            abc.finish().expect("finish abc MD5 vector"),
            "900150983cd24fb0d6963f7d28e17f72"
        );
        assert_eq!(
            uv_macos_archive_sha256("aarch64-apple-darwin"),
            Some(UV_MACOS_AARCH64_SHA256)
        );
        assert_eq!(
            uv_macos_archive_sha256("x86_64-apple-darwin"),
            Some(UV_MACOS_X86_64_SHA256)
        );
        assert_eq!(
            bun_macos_archive_sha256("bun-darwin-aarch64"),
            Some(BUN_MACOS_AARCH64_SHA256)
        );
        assert_eq!(
            bun_macos_archive_sha256("bun-darwin-x64"),
            Some(BUN_MACOS_X86_64_SHA256)
        );
    }

    #[test]
    fn downloaded_archive_checksum_fails_closed_after_tamper_without_network() {
        let root = ManagedRuntimeTestRoot::new("archive-checksum");
        let archive = root.path().join("fixture.archive");
        std::fs::write(&archive, b"verified archive bytes").expect("write archive fixture");
        let expected = sha256_file_hex(&archive).expect("hash archive fixture");
        verify_file_sha256(&archive, &expected, "fixture archive")
            .expect("matching archive checksum");

        std::fs::write(&archive, b"tampered archive bytes").expect("tamper archive fixture");
        let error = verify_file_sha256(&archive, &expected, "fixture archive")
            .expect_err("tampered archive must fail");
        assert!(error.contains("failed SHA-256 verification"));
    }

    #[cfg(unix)]
    #[test]
    fn gajecode_readiness_rejects_default_skill_tamper_in_temp_app_support() {
        let root = ManagedRuntimeTestRoot::new("gajecode-skill-tamper");
        let layout = managed_runtime_layout_at(root.path(), "gajecode").expect("Gajaecode layout");
        ensure_runtime_layout(&layout).expect("create Gajaecode layout");
        write_test_executable(
            &layout.root.join("bun/bin/bun"),
            "#!/bin/sh\nprintf '1.3.14\\n'\n",
        );
        write_test_executable(
            &layout.root.join("bun/bin/gjc"),
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then printf 'Gajae CLI 0.14.0\\n'; exit 0; fi\nif [ \"$1\" = \"setup\" ] && [ \"$2\" = \"defaults\" ]; then exit 0; fi\nexit 2\n",
        );
        for skill in GAJAE_DEFAULT_SKILLS {
            let skill_md = layout.skills.join(skill).join("SKILL.md");
            std::fs::create_dir_all(skill_md.parent().expect("skill parent"))
                .expect("create default skill");
            std::fs::write(&skill_md, format!("---\nname: {skill}\n---\n"))
                .expect("write default skill");
        }
        write_gajecode_skill_integrity_manifest(&layout.skills)
            .expect("write Gajaecode integrity manifest");
        verify_gajecode_components_at(root.path()).expect("initial Gajaecode integrity");

        std::fs::write(
            layout.skills.join("ralplan/SKILL.md"),
            "---\nname: ralplan\n---\nmalicious persistence\n",
        )
        .expect("tamper Gajaecode default skill");
        let error = verify_gajecode_components_at(root.path())
            .expect_err("tampered Gajaecode skill must fail readiness");
        assert!(error.contains("failed content integrity verification"));
    }

    #[cfg(unix)]
    #[test]
    fn hermes_missing_wheel_skills_repair_from_durable_pinned_archive() {
        let root = ManagedRuntimeTestRoot::new("hermes-missing-wheel-skills");
        let (checkout, commit) = create_hermes_checkout_fixture(root.path(), false);
        assert!(
            !hermes_uv_package_dir_at(root.path())
                .join("skills")
                .exists(),
            "fixture intentionally models a wheel with no bundled skills"
        );
        let source_skill = checkout.join("skills/fixture-category/fixture-skill");
        let skill_hash =
            hermes_skill_dir_hash(&source_skill).expect("hash committed Hermes fixture skill");
        let layout = managed_runtime_layout_at(root.path(), "hermes").expect("Hermes layout");
        let executable = layout.root.join("bin/hermes");
        let script = format!(
            "#!/bin/sh\n\
             if [ \"$1\" = \"skills\" ] && [ \"$2\" = \"opt-in\" ] && [ \"$3\" = \"--sync\" ]; then\n\
               test -d \"$HERMES_BUNDLED_SKILLS/fixture-category/fixture-skill\" || exit 21\n\
               mkdir -p \"$HERMES_HOME/skills/fixture-category\"\n\
               cp -R \"$HERMES_BUNDLED_SKILLS/fixture-category/fixture-skill\" \"$HERMES_HOME/skills/fixture-category/\"\n\
               printf 'fixture-skill:{skill_hash}\\n' > \"$HERMES_HOME/skills/.bundled_manifest\"\n\
               exit 0\n\
             fi\n\
             if [ \"$1\" = \"skills\" ] && [ \"$2\" = \"list\" ]; then\n\
               test -z \"$HERMES_BUNDLED_SKILLS\" || exit 22\n\
               exit 0\n\
             fi\n\
             exit 23\n"
        );
        write_test_executable(&executable, &script);
        assert!(!layout.skills.join(".bundled_manifest").exists());

        bootstrap_hermes_skills_at_with_commit(root.path(), &commit)
            .expect("repair missing wheel skills from durable source");

        let bundled_skills = hermes_bundled_skills_dir_at(root.path());
        assert_ne!(bundled_skills, layout.skills);
        assert!(bundled_skills
            .join("fixture-category/fixture-skill/SKILL.md")
            .is_file());
        assert!(layout.skills.join(".bundled_manifest").is_file());
        assert_eq!(
            verify_hermes_installed_skills_against_source_at(root.path(), &layout.skills, &commit)
                .expect("verify repaired Hermes skills"),
            1
        );
    }

    #[cfg(unix)]
    #[test]
    fn hermes_durable_bundle_uses_commit_object_and_quarantines_prior_source() {
        let root = ManagedRuntimeTestRoot::new("hermes-exact-archive");
        let (checkout, commit) = create_hermes_checkout_fixture(root.path(), false);
        let old_skill = hermes_bundled_skills_dir_at(root.path()).join("old/SKILL.md");
        std::fs::create_dir_all(old_skill.parent().expect("old bundled skill parent"))
            .expect("create prior invalid bundle");
        std::fs::write(&old_skill, "---\nname: old\n---\n").expect("write prior invalid bundle");

        std::fs::write(
            checkout.join("skills/fixture-category/fixture-skill/SKILL.md"),
            "---\nname: fixture-skill\n---\nmodified working tree\n",
        )
        .expect("modify checkout worktree after commit");
        let untracked = checkout.join("skills/untracked/SKILL.md");
        std::fs::create_dir_all(untracked.parent().expect("untracked skill parent"))
            .expect("create untracked skill");
        std::fs::write(&untracked, "---\nname: untracked\n---\n").expect("write untracked skill");

        let bundled_skills = materialize_hermes_bundled_source_at(root.path(), &commit)
            .expect("materialize exact Hermes commit archive");
        assert_eq!(
            std::fs::read_to_string(bundled_skills.join("fixture-category/fixture-skill/SKILL.md"))
                .expect("read durable committed skill"),
            "---\nname: fixture-skill\n---\ncommitted source\n"
        );
        assert!(!bundled_skills.join("untracked/SKILL.md").exists());
        assert_ne!(
            bundled_skills,
            managed_runtime_layout_at(root.path(), "hermes")
                .expect("Hermes layout")
                .skills
        );
        verify_hermes_bundled_source_at(root.path(), &commit)
            .expect("verify durable source receipt");

        let quarantine = hermes_provider_root_at(root.path()).join("bundle-quarantine");
        let preserved = std::fs::read_dir(&quarantine)
            .expect("read durable bundle quarantine")
            .filter_map(Result::ok)
            .any(|entry| entry.path().join("skills/old/SKILL.md").is_file());
        assert!(
            preserved,
            "prior nonempty bundle must be recoverably quarantined"
        );

        std::fs::write(
            bundled_skills.join("fixture-category/fixture-skill/SKILL.md"),
            "---\nname: fixture-skill\n---\ntampered durable source\n",
        )
        .expect("tamper durable source");
        let error = verify_hermes_bundled_source_at(root.path(), &commit)
            .expect_err("tampered durable source must fail closed");
        assert!(error.contains("failed content integrity verification"));
    }

    #[cfg(unix)]
    #[test]
    fn hermes_pinned_archive_rejects_symlink_entries() {
        let root = ManagedRuntimeTestRoot::new("hermes-archive-symlink");
        let (_, commit) = create_hermes_checkout_fixture(root.path(), true);
        let error = materialize_hermes_bundled_source_at(root.path(), &commit)
            .expect_err("Hermes git symlink must fail closed");
        assert!(error.contains("unsupported entry"));
        assert!(!hermes_bundled_source_root_at(root.path()).exists());
    }

    #[cfg(unix)]
    #[test]
    fn hermes_durable_bundle_rejects_provider_root_symlink() {
        let root = ManagedRuntimeTestRoot::new("hermes-provider-root-symlink");
        let providers = root.path().join("providers");
        let outside = root.path().join("outside-provider-root");
        std::fs::create_dir_all(&providers).expect("create provider parent");
        std::fs::create_dir_all(&outside).expect("create outside provider root");
        std::os::unix::fs::symlink(&outside, providers.join("hermes"))
            .expect("create provider root symlink");

        let error = materialize_hermes_bundled_source_at(root.path(), HERMES_COMMIT)
            .expect_err("provider root symlink must fail closed");
        assert!(error.contains("not a real directory"));
        assert!(
            std::fs::read_dir(&outside)
                .expect("read outside provider root")
                .next()
                .is_none(),
            "materialization must not write through a provider-root symlink"
        );
    }

    // 회귀 가드: hermes exit 1 근본원인(관리형 uv env에 anthropic 부재) 재발 방지.
    // spec은 반드시 [anthropic] extra를 포함한 PEP 508 direct reference여야 하고
    // (버전 핀은 hermes 자신의 pyproject extra를 따른다 — 여기 이중 핀 금지),
    // 커밋 핀은 HERMES_COMMIT과 단일 소스여야 한다. record 저장(save)·비교(match)·
    // uv install 인자 세 사용처는 전부 같은 HERMES_GIT_SPEC 상수를 쓴다 —
    // 저장→비교 라운드트립이 그 계약을 실행으로 고정한다.
    #[test]
    fn hermes_git_spec_pins_anthropic_extra_and_single_commit_source() {
        assert!(
            HERMES_GIT_SPEC.starts_with(
                "hermes-agent[anthropic] @ git+https://github.com/NousResearch/hermes-agent.git@"
            ),
            "HERMES_GIT_SPEC must keep the anthropic extra in PEP 508 direct-reference form"
        );
        assert!(
            HERMES_GIT_SPEC.ends_with(HERMES_COMMIT),
            "HERMES_GIT_SPEC commit pin must stay in sync with HERMES_COMMIT"
        );

        let root = ManagedRuntimeTestRoot::new("hermes-install-record-spec");
        let executable = hermes_uv_bin_dir_at(root.path()).join("hermes");
        std::fs::create_dir_all(executable.parent().expect("Hermes bin parent"))
            .expect("create Hermes bin");
        std::fs::write(&executable, b"fixture").expect("write Hermes executable");
        assert!(
            !hermes_install_record_matches_spec_at(root.path()),
            "missing install record must not match the pinned spec"
        );
        save_hermes_install_record_at(root.path(), &executable)
            .expect("write Hermes install record");
        assert!(
            hermes_install_record_matches_spec_at(root.path()),
            "record saved by this build must match the pinned spec"
        );
    }

    #[test]
    fn hermes_readiness_requires_pinned_commit_and_bundled_skill_manifest() {
        let root = ManagedRuntimeTestRoot::new("hermes");
        let layout = managed_runtime_layout_at(root.path(), "hermes").expect("Hermes layout");
        ensure_runtime_layout(&layout).expect("create Hermes layout");
        let executable = hermes_uv_bin_dir_at(root.path()).join("hermes");
        std::fs::create_dir_all(executable.parent().expect("Hermes bin parent"))
            .expect("create Hermes bin");
        std::fs::write(&executable, b"fixture").expect("write Hermes executable");
        // readiness는 install.json의 spec이 현재 핀과 같아야 통과한다.
        save_hermes_install_record_at(root.path(), &executable)
            .expect("write Hermes install record");
        let managed_python = hermes_uv_python_dir_at(root.path())
            .join("cpython-3.11.15-macos-aarch64-none/bin/python3.11");
        std::fs::create_dir_all(managed_python.parent().expect("managed Python parent"))
            .expect("create managed Python parent");
        std::fs::write(&managed_python, b"python fixture").expect("write managed Python fixture");
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            symlink(
                &managed_python,
                hermes_uv_bin_dir_at(root.path()).join("python"),
            )
            .expect("symlink isolated Hermes Python");
        }
        let direct_url = layout
            .root
            .join("uv-tools/hermes-agent/lib/python3.11/site-packages/hermes_agent.dist-info/direct_url.json");
        std::fs::create_dir_all(direct_url.parent().expect("direct_url parent"))
            .expect("create direct_url parent");
        std::fs::write(
            &direct_url,
            serde_json::json!({
                "url": "https://github.com/NousResearch/hermes-agent.git",
                "vcs_info": {"vcs": "git", "commit_id": HERMES_COMMIT}
            })
            .to_string(),
        )
        .expect("write direct_url");
        let bundled_source =
            hermes_bundled_skills_dir_at(root.path()).join("workspace-review/SKILL.md");
        std::fs::create_dir_all(
            bundled_source
                .parent()
                .expect("Hermes bundled source skill parent"),
        )
        .expect("create Hermes bundled source skill");
        std::fs::write(&bundled_source, "---\nname: workspace-review\n---\n")
            .expect("write Hermes bundled source skill");
        write_hermes_bundled_source_manifest(
            &hermes_bundled_source_root_at(root.path()),
            HERMES_COMMIT,
        )
        .expect("write Hermes durable bundled-source manifest");
        let skill = layout.skills.join("workspace-review/SKILL.md");
        std::fs::create_dir_all(skill.parent().expect("Hermes skill parent"))
            .expect("create Hermes skill");
        std::fs::write(&skill, "---\nname: workspace-review\n---\n").expect("write Hermes skill");
        let skill_hash =
            hermes_skill_dir_hash(skill.parent().expect("Hermes skill fixture directory"))
                .expect("hash Hermes skill fixture");
        std::fs::write(
            layout.skills.join(".bundled_manifest"),
            format!("workspace-review:{skill_hash}\n"),
        )
        .expect("write Hermes manifest");

        let (verified_executable, count) =
            verify_hermes_components_at(root.path()).expect("verify Hermes components");
        assert_eq!(count, 1);
        let receipt = expected_runtime_receipt(&layout, &verified_executable, count)
            .expect("expected Hermes receipt");
        write_runtime_receipt(&layout.receipt, &receipt).expect("write Hermes receipt");
        let ready =
            verify_managed_runtime_at(root.path(), "hermes").expect("Hermes should be ready");
        assert_eq!(ready.runtime_pin, HERMES_COMMIT);

        std::fs::write(
            &skill,
            "---\nname: workspace-review\n---\nmalicious persistence\n",
        )
        .expect("tamper Hermes skill");
        let error = verify_hermes_components_at(root.path())
            .expect_err("tampered Hermes skill must fail readiness");
        assert!(error.contains("failed content integrity verification"));
        let quarantined = quarantine_untrusted_hermes_skill_tree(&layout)
            .expect("quarantine tampered Hermes skill tree")
            .expect("tampered Hermes skill tree should be quarantined");
        assert!(quarantined.join("workspace-review/SKILL.md").is_file());
        assert!(!layout.skills.join(".bundled_manifest").exists());
        std::fs::create_dir_all(skill.parent().expect("restored Hermes skill parent"))
            .expect("recreate Hermes skill fixture");
        std::fs::write(&skill, "---\nname: workspace-review\n---\n")
            .expect("restore pinned Hermes fixture");
        std::fs::write(
            layout.skills.join(".bundled_manifest"),
            format!("workspace-review:{skill_hash}\n"),
        )
        .expect("restore pinned Hermes manifest");
        verify_hermes_components_at(root.path()).expect("restored Hermes pinned skill integrity");

        // 구 spec(extra 없는 bare git URL) 설치본은 커밋이 같아 direct_url 검사는
        // 통과하지만, install.json spec 불일치로 readiness가 실패해야 한다 —
        // 이 실패가 ensure_managed_agent_runtime의 자동 재프로비저닝 트리거다.
        let stale_record = serde_json::json!({
            "spec": format!("git+https://github.com/NousResearch/hermes-agent.git@{HERMES_COMMIT}"),
            "executable": executable.to_string_lossy(),
        });
        std::fs::write(
            hermes_install_record_path_at(root.path()),
            stale_record.to_string(),
        )
        .expect("write stale-spec Hermes install record");
        let error = verify_hermes_components_at(root.path())
            .expect_err("stale-spec install record must fail readiness");
        assert!(error.contains("install record does not match the pinned spec"));
        save_hermes_install_record_at(root.path(), &executable)
            .expect("restore pinned Hermes install record");
        verify_hermes_components_at(root.path()).expect("restored pinned Hermes install record");

        let mut stale = receipt;
        stale.policy_version = "stale-policy".to_string();
        write_runtime_receipt(&layout.receipt, &stale).expect("write stale receipt");
        assert!(verify_managed_runtime_at(root.path(), "hermes").is_err());
    }

    // 라운드9 회귀 가드 픽스처: uv tool env 표준 배치에 direct_url.json 을 놓고,
    // site-packages 한 층에 노이즈 파일을 원하는 만큼 깐다 — 구 크롤 상한(4,096)은
    // 이런 트리 성장만으로 도달해 조용한 false(정상 설치를 '미설치'로 오판)가 됐다.
    fn write_hermes_direct_url_fixture(tool_dir: &Path, commit: &str, noise_files: usize) {
        let site_packages = tool_dir.join("hermes-agent/lib/python3.11/site-packages");
        let dist_info = site_packages.join("hermes_agent-0.1.0.dist-info");
        std::fs::create_dir_all(&dist_info).expect("create dist-info fixture");
        for index in 0..noise_files {
            std::fs::write(
                site_packages.join(format!("noise-{index:05}.py")),
                b"# noise",
            )
            .expect("write noise fixture file");
        }
        std::fs::write(
            dist_info.join("direct_url.json"),
            serde_json::json!({
                "url": "https://github.com/NousResearch/hermes-agent.git",
                "vcs_info": {
                    "vcs": "git",
                    "commit_id": commit,
                    "requested_revision": commit
                }
            })
            .to_string(),
        )
        .expect("write direct_url fixture");
    }

    #[test]
    fn hermes_direct_url_check_survives_uv_tree_larger_than_old_crawl_cap() {
        let root = ManagedRuntimeTestRoot::new("hermes-direct-url-large-tree");
        let tool_dir = hermes_uv_tool_dir_at(root.path());
        // 구 상한 4,096을 확실히 넘는 5,000개 노이즈 — 실사고 트리(6,124항목)의 축소 재현.
        write_hermes_direct_url_fixture(&tool_dir, HERMES_COMMIT, 5_000);
        assert!(
            hermes_direct_url_has_pinned_commit(&tool_dir),
            "provenance check must find direct_url.json regardless of sibling file count"
        );
        assert!(
            hermes_direct_url_targeted_lookup(&tool_dir),
            "targeted lookup alone must succeed without the fallback crawl"
        );
    }

    #[test]
    fn hermes_direct_url_check_passes_small_tree_and_rejects_commit_mismatch() {
        let root = ManagedRuntimeTestRoot::new("hermes-direct-url-small-tree");
        let tool_dir = hermes_uv_tool_dir_at(root.path());
        write_hermes_direct_url_fixture(&tool_dir, HERMES_COMMIT, 0);
        assert!(
            hermes_direct_url_has_pinned_commit(&tool_dir),
            "normal small tree must keep passing"
        );

        let mismatch_root = ManagedRuntimeTestRoot::new("hermes-direct-url-commit-mismatch");
        let mismatch_tool_dir = hermes_uv_tool_dir_at(mismatch_root.path());
        write_hermes_direct_url_fixture(
            &mismatch_tool_dir,
            "0000000000000000000000000000000000000000",
            0,
        );
        assert!(
            !hermes_direct_url_has_pinned_commit(&mismatch_tool_dir),
            "commit mismatch must remain a genuine false"
        );
    }

    #[test]
    fn hermes_direct_url_fallback_crawl_covers_nonstandard_layout() {
        let root = ManagedRuntimeTestRoot::new("hermes-direct-url-fallback");
        let tool_dir = hermes_uv_tool_dir_at(root.path());
        // 표적 조회가 모르는 비정형 배치 — 폴백 크롤이 계속 커버해야 한다.
        let nonstandard = tool_dir.join("hermes-agent/nonstandard/nested");
        std::fs::create_dir_all(&nonstandard).expect("create nonstandard fixture");
        std::fs::write(
            nonstandard.join("direct_url.json"),
            serde_json::json!({
                "url": "https://github.com/NousResearch/hermes-agent.git",
                "vcs_info": {"vcs": "git", "commit_id": HERMES_COMMIT}
            })
            .to_string(),
        )
        .expect("write nonstandard direct_url fixture");
        assert!(
            !hermes_direct_url_targeted_lookup(&tool_dir),
            "targeted lookup should miss the nonstandard layout in this fixture"
        );
        assert!(
            hermes_direct_url_has_pinned_commit(&tool_dir),
            "fallback crawl must still find the nonstandard receipt"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "materializes the durable Hermes bundle from the current managed uv cache"]
    fn manual_real_hermes_durable_bundle_from_existing_cache() {
        let app_support = app_support_dir().expect("resolve Atelier app support directory");
        let layout =
            managed_runtime_layout_at(&app_support, "hermes").expect("resolve Hermes layout");
        let source = materialize_hermes_bundled_source_at(&app_support, HERMES_COMMIT)
            .expect("materialize real durable Hermes bundle");
        let (verified_source, skill_hashes) =
            verify_hermes_bundled_source_at(&app_support, HERMES_COMMIT)
                .expect("verify real durable Hermes bundle");
        assert_eq!(source, verified_source);
        assert_ne!(source, layout.skills);
        assert!(!skill_hashes.is_empty());
        let installed_count = verify_hermes_installed_skills_against_source_at(
            &app_support,
            &layout.skills,
            HERMES_COMMIT,
        )
        .expect("verify real installed Hermes skills against durable source");
        assert_eq!(installed_count, skill_hashes.len());
        eprintln!(
            "Hermes durable bundled source: {} ({} source skills, {} installed skills)",
            source.display(),
            skill_hashes.len(),
            installed_count
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "downloads the real managed runtimes into the current user's Atelier app support"]
    fn manual_real_managed_runtime_prepare_proof() {
        let app_support = app_support_dir().expect("resolve Atelier app support directory");
        for provider in ["gajecode", "hermes"] {
            eprintln!(
                "[{provider}] preparing managed runtime in {}",
                app_support.display()
            );
            let readiness = ensure_managed_agent_runtime_blocking_at(
                &app_support,
                provider,
                |state, message| {
                    eprintln!("[{provider}] {state}: {message}");
                },
            )
            .unwrap_or_else(|error| panic!("[{provider}] managed runtime prepare failed: {error}"));
            eprintln!(
                "[{provider}] readiness {}",
                serde_json::to_string_pretty(&readiness).expect("serialize readiness")
            );
            assert!(readiness.ready, "[{provider}] readiness flag must be true");
            assert!(
                Path::new(&readiness.executable).is_file(),
                "[{provider}] executable must exist at {}",
                readiness.executable
            );
            assert!(
                Path::new(&readiness.receipt_path).is_file(),
                "[{provider}] readiness receipt must exist at {}",
                readiness.receipt_path
            );
        }
    }

    #[test]
    fn subscription_oauth_wins_for_direct_agent_clis() {
        let oauth_state = CredentialState {
            oauth_logged_in: true,
            api_key_present: true,
            api_key_masked: "sk-…bad1".to_string(),
            updated_at: None,
        };
        let api_state = CredentialState {
            oauth_logged_in: false,
            api_key_present: true,
            api_key_masked: "sk-…good".to_string(),
            updated_at: None,
        };

        assert!(!should_inject_agent_api_key("claude", &oauth_state));
        assert!(!should_inject_agent_api_key("codex", &oauth_state));
        assert!(should_inject_agent_api_key("claude", &api_state));
        assert!(should_inject_agent_api_key("codex", &api_state));
        assert!(should_inject_agent_api_key("openrouter", &oauth_state));
    }

    #[test]
    fn inconclusive_oauth_probe_preserves_last_verified_state() {
        assert!(oauth_probe_result(true, None));
        assert!(!oauth_probe_result(false, None));
        assert!(!oauth_probe_result(true, Some(false)));
        assert!(oauth_probe_result(false, Some(true)));
    }

    #[test]
    fn subscription_logins_prefer_cross_platform_oauth_flows() {
        assert_eq!(
            oauth_login_attempts("claude", "login"),
            vec![vec!["setup-token"], vec!["auth", "login", "--claudeai"]]
        );
        assert_eq!(
            oauth_login_attempts("codex", "login"),
            vec![vec!["login", "--device-auth"], vec!["login"]]
        );
    }

    #[test]
    fn codex_device_auth_has_a_validated_browser_hint() {
        let args = ["login", "--device-auth"];
        assert_eq!(
            oauth_login_url_hint("codex", &args),
            Some(CODEX_DEVICE_AUTH_URL)
        );
        assert!(is_provider_login_url("codex", CODEX_DEVICE_AUTH_URL));
        assert_eq!(oauth_login_url_hint("codex", &["login"]), None);
        assert_eq!(oauth_login_url_hint("claude", &["setup-token"]), None);
        assert_eq!(
            oauth_browser_probe_url("codex"),
            Some(CODEX_DEVICE_AUTH_URL)
        );
        assert_eq!(oauth_browser_probe_url("claude"), Some("https://claude.ai"));
        assert_eq!(oauth_browser_probe_url("openrouter"), None);
    }

    #[test]
    fn direct_subscription_logins_use_headless_pty() {
        assert!(oauth_login_uses_pty("claude"));
        assert!(oauth_login_uses_pty("codex"));
        assert!(!oauth_login_uses_pty("gajecode"));
        assert!(!oauth_login_uses_pty("openrouter"));
    }

    #[test]
    fn direct_subscription_clis_clear_inherited_api_env() {
        assert!(should_clear_inherited_agent_api_env("claude"));
        assert!(should_clear_inherited_agent_api_env("codex"));
        assert!(!should_clear_inherited_agent_api_env("openrouter"));
        assert!(!should_clear_inherited_agent_api_env("hermes"));
    }

    #[test]
    fn alibaba_token_plan_keys_use_the_dashscope_secure_slot() {
        assert_eq!(env_var_for("alibaba"), Some("DASHSCOPE_API_KEY"));
        assert!(is_valid_api_key_for_provider(
            "alibaba",
            "sk-sp-fixture-token-plan-key"
        ));
        assert!(!is_valid_api_key_for_provider("alibaba", "fixture-key"));
    }

    #[test]
    fn gajecode_managed_models_config_registers_alibaba_without_secrets() {
        let config = gajecode_models_config_content();
        assert!(config.contains("alibaba-token-plan:"));
        assert!(config
            .contains("https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"));
        assert!(config.contains("apiKeyEnv: DASHSCOPE_API_KEY"));
        assert!(config.contains("supportsReasoningEffort: false"));
        assert!(config.contains("supportsReasoningEffort: true"));
        assert!(config.contains("thinkingFormat: qwen"));
        assert!(config.contains("thinkingFormat: openai"));
        assert!(config.contains("id: qwen3.8-max-preview"));
        assert!(config.contains("id: glm-5.2"));
        assert!(config.contains("maxLevel: max"));
        assert!(!config.contains("sk-"));
        assert!(!config.contains("access_token"));
        assert!(!config.contains("refresh_token"));
    }

    #[test]
    fn login_output_redacts_urls_and_tokens() {
        let fake_token = ["sk-ant-oat", "fixture", "redaction", "token"].join("-");
        let input = format!(
            "Opening browser\nhttps://claude.com/cai/oauth/authorize?code_challenge=secret\n{fake_token}\naccess_token=abc"
        );
        let detail = redact_login_output(&input);
        assert!(detail.contains("Opening browser"));
        assert!(detail.contains("[login url redacted]"));
        assert!(detail.contains("[credential output redacted]"));
        assert!(!detail.contains("code_challenge=secret"));
        assert!(!detail.contains(&fake_token));
        assert!(!detail.contains("access_token=abc"));
    }

    #[test]
    fn installer_stream_drains_all_output_and_keeps_only_the_bounded_tail() {
        let input = (0..(CLI_INSTALL_CAPTURE_LIMIT + 8192))
            .map(|index| (index % 251) as u8)
            .collect::<Vec<_>>();
        let expected = input[input.len() - CLI_INSTALL_CAPTURE_LIMIT..].to_vec();
        let captured = capture_installer_stream(std::io::Cursor::new(input))
            .join()
            .expect("installer output reader should finish");

        assert_eq!(captured.len(), CLI_INSTALL_CAPTURE_LIMIT);
        assert_eq!(captured, expected);
    }

    // 실물 토큰 문자셋은 공표된 적이 없다. fixture 는 대표적인 형태 하나일 뿐이고,
    // 검증기가 이 모양만 통과시켜서는 안 된다(아래 charset 관용 테스트 참고).
    fn fake_claude_subscription_token() -> String {
        ["sk-ant-oat01", "fixture", "setup", "token", "proof"].join("-")
    }

    #[test]
    fn claude_setup_token_is_extracted_from_cli_output() {
        let fake_token = fake_claude_subscription_token();
        let output = format!("Authentication complete\r\n  {fake_token}  \r\n");
        assert_eq!(
            extract_claude_oauth_token_from_text(&output).as_deref(),
            Some(fake_token.as_str())
        );
    }

    #[test]
    fn claude_setup_token_extraction_strips_cli_color_codes() {
        // CLI 는 토큰 줄을 경고색으로 감싸 출력한다. 벗기지 못하면 이스케이프가
        // 박힌 문자열이 키체인에 저장되어 모든 호출이 401 이 된다.
        let fake_token = fake_claude_subscription_token();
        let output = format!(
            "Your OAuth token (valid for 1 year):\r\n\u{1b}[38;5;220m{fake_token}\u{1b}[39m\r\n"
        );
        assert_eq!(
            extract_claude_oauth_token_from_text(&output).as_deref(),
            Some(fake_token.as_str())
        );
    }

    #[test]
    fn polluted_claude_tokens_never_reach_the_keychain() {
        let fake_token = fake_claude_subscription_token();
        assert!(is_claude_subscription_token(&fake_token));
        assert!(!is_claude_subscription_token(&format!(
            "\u{1b}[38;5;220m{fake_token}"
        )));
        assert!(!is_claude_subscription_token(&format!(
            "{fake_token}\u{1b}[39m"
        )));
        assert!(!is_claude_subscription_token("sk-ant-oat01"));
        assert!(!is_claude_subscription_token(&format!(
            "prefix{fake_token}"
        )));
        assert!(!is_claude_subscription_token(
            "sk-ant-api03-fixture-api-key"
        ));
    }

    #[test]
    fn claude_token_validation_does_not_constrain_the_character_set() {
        // 문자셋을 좁히면 실물 토큰을 거부해 "붙여넣어도 안 됨" 이 재발한다.
        // base64url 을 벗어나는 문자가 와도 형태 검증은 통과해야 한다.
        for token in [
            "sk-ant-oat01-AbCd+EfGh/IjKl=MnOp.QrSt~UvWx",
            "sk-ant-oat99_fixture.token:with|odd*chars!",
            "sk-ant-oatXX-0123456789abcdefghijklmnopqrstuvwxyz",
        ] {
            assert!(
                is_claude_subscription_token(token),
                "charset 제한이 정상 토큰을 거부하면 안 됨: {token}"
            );
        }
    }

    #[test]
    fn claude_token_rejection_names_the_condition_it_failed() {
        use ClaudeTokenFormatError::*;
        let token = fake_claude_subscription_token();
        let cases = [
            (format!("prefix{token}"), Prefix),
            ("sk-ant-oat01".to_string(), TooShort),
            (format!("{token} {token}"), Whitespace),
            (format!("{token}\u{1b}[39m"), ControlCharacter),
            (format!("sk-ant-oat01-{}", "x".repeat(5000)), TooLong),
        ];
        let mut messages = Vec::new();
        for (value, expected) in cases {
            assert_eq!(
                classify_claude_subscription_token(&value),
                Err(expected),
                "{value:?} 의 거부 사유가 다름"
            );
            messages.push(claude_token_format_message(expected));
        }
        // 사유별 문구가 같으면 어느 조건에 걸렸는지 사용자가 알 수 없다.
        for index in 1..messages.len() {
            assert!(
                !messages[..index].contains(&messages[index]),
                "거부 문구가 사유별로 구분되지 않음"
            );
        }
    }

    #[test]
    fn keychain_write_failure_is_not_reported_as_a_format_error() {
        // 두 실패를 같은 문구로 안내하면 멀쩡한 토큰을 계속 다시 복사하게 된다.
        let format_message = claude_token_store_message(&ClaudeTokenStoreError::Format(
            ClaudeTokenFormatError::Prefix,
        ));
        let keychain_message =
            claude_token_store_message(&ClaudeTokenStoreError::Keychain("access denied".into()));
        assert_ne!(format_message, keychain_message);
        assert!(keychain_message.contains("키체인"));
        assert!(keychain_message.contains("다시 복사할 필요는 없습니다"));
        assert!(!format_message.contains("키체인"));
    }

    #[test]
    fn stored_claude_tokens_are_read_back_as_strictly_as_they_are_written() {
        // 읽기가 느슨하면(contains) 예전 빌드가 남긴 오염 토큰이 그대로 주입된다.
        // JSON 파서는 여전히 값을 꺼내지만, 형태 검증이 그 값을 막아야 한다.
        let token = fake_claude_subscription_token();
        let credential = read_claude_oauth_credential_from_json_text(&format!(
            "{{\"claudeAiOauth\":{{\"accessToken\":\"\\u001b[38;5;220m{token}\\u001b[39m\"}}}}"
        ))
        .expect("legacy json should still parse");
        assert!(credential.access.contains("sk-ant-oat"));
        assert!(!is_claude_subscription_token(&credential.access));
        assert!(is_claude_subscription_token(&token));
    }

    #[test]
    fn claude_subscription_tokens_are_rejected_as_api_keys() {
        // oat 토큰이 api_key 슬롯에 들어가면 ANTHROPIC_API_KEY 로 주입되어 401 이 난다.
        assert!(!is_valid_api_key_for_provider(
            "claude",
            &fake_claude_subscription_token()
        ));
        assert!(is_valid_api_key_for_provider(
            "claude",
            "sk-ant-api03-fixture-console-key"
        ));
    }

    #[test]
    fn api_key_rejection_names_a_destination_that_exists() {
        let message = api_key_rejection_message("claude");
        assert!(message.contains("sk-ant-api"));
        // 이 칸을 구독 토큰의 목적지로 안내하면 터미널 발급 절차가 되살아난다.
        assert!(!message.contains("sk-ant-oat"));
        assert!(!message.contains("setup-token"));
        assert!(message.contains("구독으로 로그인"));
    }

    #[test]
    fn subscription_tokens_are_routed_to_the_login_button_not_the_api_slot() {
        // 우회 저장(라운드2)을 되살리면 안 된다. 거부는 하되, 안내는 실재하고
        // 동작하는 목적지 하나만 가리켜야 한다.
        let message = CLAUDE_SUBSCRIPTION_TOKEN_IN_API_SLOT;
        assert!(message.contains("구독으로 로그인"));
        assert!(!message.contains("setup-token"));
        assert!(!message.contains("터미널에서 토큰을 만드셔"));
        assert!(!message.contains("붙여넣"));
    }

    #[test]
    fn login_failure_guidance_never_points_back_at_the_api_key_field() {
        // 로그인 모달에 그대로 표시되는 문구다. 여기서 API 키 칸을 가리키면
        // 구독 사용자가 다시 터미널·붙여넣기 경로로 밀려난다.
        assert!(!CLAUDE_SUBSCRIPTION_TOKEN_MISSING.contains("setup-token"));
        assert!(!CLAUDE_SUBSCRIPTION_TOKEN_MISSING.contains("붙여넣"));
        assert!(!CLAUDE_SUBSCRIPTION_TOKEN_MISSING.contains("키 입력칸"));
        assert!(CLAUDE_SUBSCRIPTION_TOKEN_MISSING.contains("구독 로그인 버튼"));
        // redact_login_output 이 줄을 통째로 지우지 않아야 모달까지 도달한다.
        assert_eq!(
            redact_login_output(CLAUDE_SUBSCRIPTION_TOKEN_MISSING),
            CLAUDE_SUBSCRIPTION_TOKEN_MISSING
        );
    }

    #[test]
    fn keychain_refusal_during_button_login_is_not_reported_as_a_missing_token() {
        // 버튼 경로에서 키체인이 거부되면 사용자가 할 일은 로그인 재시도가 아니라
        // 키체인 허용이다. 두 사유가 같은 문구면 무한 재로그인으로 몰린다.
        let keychain =
            claude_token_store_message(&ClaudeTokenStoreError::Keychain("access denied".into()));
        assert_ne!(keychain, CLAUDE_SUBSCRIPTION_TOKEN_MISSING);
        assert!(keychain.contains("키체인"));
        assert!(!CLAUDE_SUBSCRIPTION_TOKEN_MISSING.contains("키체인"));
    }

    #[test]
    fn login_capture_survives_multibyte_output_past_the_truncation_limit() {
        // 브라이유 스피너·박스문자가 절단 지점에 걸리면 이전 구현은 패닉했고,
        // 캡처 스레드가 죽는 순간 PTY 드레인이 멈춰 로그인 자체가 완결 불가였다.
        let captured = Arc::new(Mutex::new(String::new()));
        let fake_token = fake_claude_subscription_token();
        let mut stream = "⠋⠙⠹─│┌┐└┘".repeat(12_000);
        stream.push_str(&format!("\r\n{fake_token}\r\n"));
        assert!(stream.len() > 64 * 1024);

        capture_login_pipe(
            std::io::Cursor::new(stream.into_bytes()),
            captured.clone(),
            None,
        );
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut output = String::new();
        while Instant::now() < deadline {
            output = captured_login_output(&captured);
            if output.contains(&fake_token) {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }

        assert!(!captured.is_poisoned());
        assert!(output.len() <= 64 * 1024);
        assert_eq!(
            extract_claude_oauth_token_from_text(&output).as_deref(),
            Some(fake_token.as_str())
        );
    }

    /// 실제 `claude` CLI 를 부르지 않고 구독 버튼 경로의 PTY 구간 전체를 태운다.
    /// 스크립트는 CLI 와 같은 순서로 행동한다: 색상 감싼 로그인 URL 출력 → 브라우저
    /// 승인에 해당하는 지연 → 색상 감싼 토큰 출력 → exit 0.
    #[cfg(unix)]
    #[test]
    fn pty_login_path_detaches_and_still_captures_a_late_token() {
        use std::os::unix::fs::PermissionsExt;

        let token = fake_claude_subscription_token();
        let url = "https://claude.ai/oauth/authorize?code=true&client_id=fixture&state=xyz";
        let root = std::env::temp_dir().join(format!("atelier-pty-login-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create pty fixture root");
        let script = root.join("fake-login.sh");
        std::fs::write(
            &script,
            format!(
                "#!/bin/sh\nprintf '\\033[36mOpen this URL: {url}\\033[0m\\r\\n'\nprintf '\\342\\240\\213 waiting for browser approval\\r\\n'\nsleep 2\nprintf '\\033[33m  {token}  \\033[39m\\r\\n'\nexit 0\n"
            ),
        )
        .expect("write pty fixture script");
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755))
            .expect("chmod pty fixture script");

        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: OAUTH_LOGIN_PTY_COLS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("openpty");
        let script_arg = script.to_string_lossy().into_owned();
        let command = oauth_pty_login_command("/bin/sh", &[script_arg.as_str()]);
        let mut child = pair
            .slave
            .spawn_command(command)
            .expect("spawn fixture cli");
        drop(pair.slave);

        // 전역 래치를 실제 프로바이더 키와 공유하지 않도록 고유 이름을 쓴다.
        let latch_provider = format!("fixture-pty-login-{}", uuid::Uuid::new_v4());
        let latch_epoch = begin_oauth_login_epoch(&latch_provider);
        let captured = Arc::new(Mutex::new(String::new()));
        let reader = pair.master.try_clone_reader().expect("clone pty reader");
        capture_login_pipe(
            reader,
            captured.clone(),
            Some(LoginStreamWatch {
                provider: latch_provider.clone(),
                epoch: latch_epoch,
            }),
        );

        // 프로덕션 전경 루프와 같은 구조: URL 을 먼저 잡고, 1.5초가 지나면 detach 한다.
        let started = Instant::now();
        let mut login_url_detected: Option<String> = None;
        let detached = loop {
            if login_url_detected.is_none() {
                login_url_detected =
                    extract_provider_login_url("claude", &captured_login_output(&captured));
            }
            match child.try_wait().expect("poll fixture cli") {
                Some(status) => break Err(status),
                None if started.elapsed() >= Duration::from_millis(1500) => break Ok(()),
                None => thread::sleep(Duration::from_millis(80)),
            }
        };

        // 승인이 1.5초보다 오래 걸리는 경우가 이 경로의 본체다. 전경에서 끝나버리면
        // detach 를 검증하지 못한 셈이라 테스트 의미가 사라진다.
        assert!(
            detached.is_ok(),
            "fixture cli exited before the detach window: {detached:?}"
        );
        assert_eq!(
            login_url_detected.as_deref(),
            Some(url),
            "login url must be recovered from the live PTY stream before detaching"
        );

        // detach 이후 구간: master 를 살려 둔 백그라운드 스레드가 종료를 기다리고,
        // 종료 직전에야 찍히는 토큰을 캡처 버퍼에서 회수한다.
        let master = pair.master;
        let background_captured = captured.clone();
        let background_provider = latch_provider.clone();
        let worker = std::thread::spawn(move || {
            let _keep_master_alive = master;
            let status = child.wait().expect("wait for fixture cli");
            let token = poll_captured_claude_token(
                &background_provider,
                &background_captured,
                50,
                Duration::from_millis(100),
            );
            (status.success(), token)
        });
        let (exited_cleanly, captured_token) = worker
            .join()
            .expect("background login watcher should finish");

        assert!(exited_cleanly, "fixture cli should exit 0");
        assert_eq!(captured_token.as_deref(), Some(token.as_str()));
        assert!(!captured.is_poisoned());

        reset_oauth_login_stream_latch(&latch_provider);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_new_login_verdict_never_inherits_the_previous_failure() {
        // 프론트는 !active && error 를 종결 실패로 읽는다. 지난 실패가 남아 있으면
        // 이번에 연결된 상태조차 실패로 표시되고 폴링이 거기서 멈춘다.
        let provider = format!("fixture-login-runtime-{}", uuid::Uuid::new_v4());
        fail_oauth_login_runtime(&provider, "previous attempt failed".into());
        assert!(oauth_login_runtime_snapshot(&provider).error.is_some());

        clear_oauth_login_runtime(&provider);
        assert!(oauth_login_runtime_snapshot(&provider).error.is_none());

        fail_oauth_login_runtime(&provider, "previous attempt failed".into());
        start_oauth_login_runtime(&provider);
        let restarted = oauth_login_runtime_snapshot(&provider);
        assert!(restarted.active);
        assert!(restarted.error.is_none());
        clear_oauth_login_runtime(&provider);
    }

    /// 쓰기 호출 하나하나를 그대로 보관한다. "무엇을 썼는가"만이 아니라 "몇 번에 나눠
    /// 썼는가"가 이 결함의 본체이기 때문이다.
    #[derive(Clone)]
    struct RecordingLoginWriter(Arc<Mutex<Vec<Vec<u8>>>>);

    impl Write for RecordingLoginWriter {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            lock_recorded(&self.0).push(buf.to_vec());
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    fn lock_recorded(sink: &Arc<Mutex<Vec<Vec<u8>>>>) -> MutexGuard<'_, Vec<Vec<u8>>> {
        sink.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[test]
    fn a_pty_login_submits_the_code_with_a_carriage_return_on_its_own_write() {
        // raw 모드 TUI 에서 Enter 는 CR 이고, 코드와 같은 청크에 실려 오면 통째로
        // 문자 입력으로 읽혀 제출이 사라진다. LF 를 보내면 아무 일도 일어나지 않는다.
        let provider = format!("fixture-submit-pty-{}", uuid::Uuid::new_v4());
        let sink = Arc::new(Mutex::new(Vec::<Vec<u8>>::new()));
        store_oauth_login_pty_writer(&provider, Box::new(RecordingLoginWriter(sink.clone())));

        write_oauth_code_to_login_input(&provider, "fixture-authentication-code")
            .expect("pty submit should reach the writer");

        let chunks = lock_recorded(&sink).clone();
        assert_eq!(
            chunks,
            vec![b"fixture-authentication-code".to_vec(), b"\r".to_vec()],
            "the code and the carriage return must arrive as separate reads"
        );
        forget_oauth_login_session(&provider);
    }

    /// PTY 뒤에 세우는 더미 입력기. `tty.setraw` 로 -icanon/-isig/-echo 를 걸어,
    /// 멈춰 있던 로그인에서 `stty -a` 로 실측한 터미널 모드를 그대로 재현한다.
    /// 실제 CLI 는 부르지 않고 키체인도 건드리지 않는다.
    ///
    /// 두 가지 판정기를 함께 둔다. `bytewise` 는 바이트를 하나씩 훑어 CR 이면 제출하는
    /// 가장 관대한 리더이고, `chunk` 는 읽기 한 번을 키 이벤트 하나로 보아 그 이벤트가
    /// CR 하나일 때만 제출하는 Ink `useInput` 규칙이다. 실제 로그인 TUI 가 둘 중
    /// 무엇이든 통과해야 수리가 성립한다.
    #[cfg(unix)]
    const RAW_ENTER_READER_SOURCE: &str = r##"import os
import signal
import sys
import tty

mode = sys.argv[1]
signal.alarm(int(sys.argv[2]))
fd = sys.stdin.fileno()
tty.setraw(fd)
os.write(1, b"READY\n")
buf = b""
while True:
    chunk = os.read(fd, 4096)
    if not chunk:
        os.write(1, b"EOF\n")
        sys.exit(3)
    if mode == "bytewise":
        for index in range(len(chunk)):
            byte = chunk[index : index + 1]
            if byte == b"\r":
                os.write(1, b"SUBMITTED:" + buf + b"\n")
                sys.exit(0)
            buf += byte
    else:
        if chunk == b"\r":
            os.write(1, b"SUBMITTED:" + buf + b"\n")
            sys.exit(0)
        buf += chunk
"##;

    #[cfg(unix)]
    const RAW_ENTER_FIXTURE_CODE: &str = "fixture-authentication-code";

    #[cfg(unix)]
    enum RawEnterSubmit {
        /// 프로덕션 제출 경로를 그대로 태운다.
        Production(&'static str),
        /// 수리 전 또는 대안 바이트열을 재현하는 변형. 대조군이 없으면 이 실험은
        /// "무엇을 해도 통과"가 되어 증거가 되지 못한다.
        Mutant(Vec<Vec<u8>>),
    }

    #[cfg(unix)]
    struct RawEnterOutcome {
        submitted: Option<String>,
        exited: bool,
    }

    #[cfg(unix)]
    fn raw_enter_reader_python() -> String {
        let probe = Command::new("/bin/sh")
            .args(["-c", "command -v python3"])
            .output()
            .expect("probe for python3");
        let path = String::from_utf8_lossy(&probe.stdout).trim().to_string();
        // 인터프리터가 없다고 조용히 건너뛰면 통과처럼 보이는 공허한 테스트가 된다.
        assert!(
            !path.is_empty(),
            "python3 is required to stand up the raw-mode reader for this proof"
        );
        path
    }

    /// 프로덕션과 같은 방식(NativePtySystem + oauth_pty_login_command)으로 더미를 띄우고,
    /// 지정한 바이트열을 PTY writer 로 밀어 넣은 뒤 제출이 성립했는지 관측한다.
    #[cfg(unix)]
    fn run_raw_enter_probe(mode: &str, submit: RawEnterSubmit) -> RawEnterOutcome {
        let root = std::env::temp_dir().join(format!("atelier-raw-enter-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create raw enter fixture root");
        let script = root.join("raw_enter_reader.py");
        std::fs::write(&script, RAW_ENTER_READER_SOURCE).expect("write raw enter fixture");
        let python = raw_enter_reader_python();

        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: OAUTH_LOGIN_PTY_COLS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("openpty");
        let script_arg = script.to_string_lossy().into_owned();
        let command = oauth_pty_login_command(&python, &[script_arg.as_str(), mode, "20"]);
        let mut child = pair
            .slave
            .spawn_command(command)
            .expect("spawn raw enter fixture");
        drop(pair.slave);

        let captured = Arc::new(Mutex::new(String::new()));
        let reader = pair.master.try_clone_reader().expect("clone pty reader");
        capture_login_pipe(reader, captured.clone(), None);
        let mut writer = pair.master.take_writer().expect("take pty writer");

        // raw 모드로 들어가기 전에 쓰면 라인 디시플린이 ICRNL 로 CR 을 LF 로 바꿔
        // 버려 실험 자체가 무의미해진다. 더미가 READY 를 찍은 뒤에만 보낸다.
        let ready_wait = Instant::now();
        loop {
            if captured_login_output(&captured).contains("READY") {
                break;
            }
            assert!(
                ready_wait.elapsed() < Duration::from_secs(10),
                "the raw reader never entered raw mode"
            );
            thread::sleep(Duration::from_millis(25));
        }

        let provider = format!("fixture-raw-enter-{}", uuid::Uuid::new_v4());
        match submit {
            RawEnterSubmit::Production(code) => {
                store_oauth_login_pty_writer(&provider, writer);
                write_oauth_code_to_login_input(&provider, code)
                    .expect("the production submit path must reach the pty");
            }
            RawEnterSubmit::Mutant(chunks) => {
                for (index, chunk) in chunks.iter().enumerate() {
                    if index > 0 {
                        thread::sleep(Duration::from_millis(120));
                    }
                    writer.write_all(chunk).expect("mutant write");
                    writer.flush().expect("mutant flush");
                }
            }
        }

        let started = Instant::now();
        let exited = loop {
            match child.try_wait().expect("poll raw enter fixture") {
                Some(_) => break true,
                None if started.elapsed() >= Duration::from_secs(3) => break false,
                None => thread::sleep(Duration::from_millis(25)),
            }
        };
        thread::sleep(Duration::from_millis(150));
        let output = captured_login_output(&captured);
        if !exited {
            let mut killer = child.clone_killer();
            let _ = killer.kill();
            let _ = child.wait();
        }
        forget_oauth_login_session(&provider);
        let _ = std::fs::remove_dir_all(&root);

        let submitted = output.split("SUBMITTED:").nth(1).map(|rest| {
            rest.split('\n')
                .next()
                .unwrap_or_default()
                .trim_end_matches('\r')
                .to_string()
        });
        RawEnterOutcome { submitted, exited }
    }

    #[cfg(unix)]
    #[test]
    fn a_live_raw_mode_reader_submits_only_when_the_app_sends_a_carriage_return() {
        // 수리 전 바이트열: LF 는 raw 모드에 대응하는 키가 없어 아무 일도 일어나지
        // 않는다. 쓰기는 성공하는데 프로세스는 영원히 대기 — 대표님이 겪으신 증상.
        let before = run_raw_enter_probe(
            "bytewise",
            RawEnterSubmit::Mutant(vec![format!("{RAW_ENTER_FIXTURE_CODE}\n").into_bytes()]),
        );
        assert_eq!(
            before.submitted, None,
            "a line feed must not submit in a raw-mode reader"
        );
        assert!(
            !before.exited,
            "the pre-repair byte stream leaves the reader waiting forever"
        );

        // 수리 후: 실제 provider_submit_oauth_code 가 쓰는 경로 그대로.
        let after = run_raw_enter_probe(
            "bytewise",
            RawEnterSubmit::Production(RAW_ENTER_FIXTURE_CODE),
        );
        assert_eq!(
            after.submitted.as_deref(),
            Some(RAW_ENTER_FIXTURE_CODE),
            "the shipped submit path must deliver the code and press Enter"
        );
        assert!(after.exited, "the reader must accept the submit and finish");
    }

    #[cfg(unix)]
    #[test]
    fn a_key_event_reader_needs_the_carriage_return_on_its_own_write() {
        // Ink 의 useInput 은 읽기 한 번을 키 이벤트 하나로 본다. 코드와 CR 을 한 번에
        // 쓰면 `"코드\r"` 이 통째로 문자 입력이라 Enter 가 사라진다.
        let coupled = run_raw_enter_probe(
            "chunk",
            RawEnterSubmit::Mutant(vec![format!("{RAW_ENTER_FIXTURE_CODE}\r").into_bytes()]),
        );
        assert_eq!(
            coupled.submitted, None,
            "a carriage return riding along with the code is read as text, not Enter"
        );
        assert!(!coupled.exited);

        let detached =
            run_raw_enter_probe("chunk", RawEnterSubmit::Production(RAW_ENTER_FIXTURE_CODE));
        assert_eq!(
            detached.submitted.as_deref(),
            Some(RAW_ENTER_FIXTURE_CODE),
            "only the detached carriage return registers as Enter"
        );
        assert!(detached.exited);
    }

    #[cfg(unix)]
    #[test]
    fn bracketed_paste_markers_would_corrupt_the_delivered_code() {
        // 프롬프트가 마커를 해석하지 않으면 그 바이트가 코드에 그대로 섞인다.
        // 감싸지 않기로 한 결정의 실측 근거.
        let wrapped = run_raw_enter_probe(
            "bytewise",
            RawEnterSubmit::Mutant(vec![
                format!("\u{1b}[200~{RAW_ENTER_FIXTURE_CODE}\u{1b}[201~").into_bytes(),
                b"\r".to_vec(),
            ]),
        );
        let delivered = wrapped
            .submitted
            .expect("the wrapped variant still submits, so only the value can tell them apart");
        assert_ne!(
            delivered, RAW_ENTER_FIXTURE_CODE,
            "bracketed paste markers change what the prompt receives"
        );
        assert!(
            delivered.contains("[200~") && delivered.contains("[201~"),
            "the markers land inside the authentication code: {delivered:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_piped_login_keeps_the_line_feed_terminator() {
        // 파이프 stdin 은 canonical 입력이라 LF 가 곧 줄의 끝이다. PTY 수리를 일괄
        // 치환으로 하면 이 경로가 함께 깨진다.
        let mut child = Command::new("cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn cat fixture");
        let stdin = child.stdin.take().expect("cat stdin");
        let input = OAuthLoginInput::Process(stdin);

        assert_eq!(input.submit_terminator(), b"\n");
        assert!(!input.submit_needs_detached_enter());

        drop(input);
        let _ = child.wait();
    }

    #[test]
    fn a_silent_code_submit_surfaces_a_warning_instead_of_looking_delivered() {
        // 쓰기 성공은 제출 성공이 아니다. 아무 반응이 없으면 사용자에게 그 사실을
        // 말해 줘야 멀쩡한 코드를 몇 번이고 다시 붙여넣는 헛수고를 멈출 수 있다.
        let provider = format!("fixture-submit-watch-{}", uuid::Uuid::new_v4());
        start_oauth_login_runtime(&provider);

        let first = note_oauth_code_submitted(&provider);
        warn_oauth_code_submit_stalled(&provider, first);
        assert_eq!(
            oauth_login_runtime_snapshot(&provider)
                .submit_warning
                .as_deref(),
            Some(OAUTH_CODE_SUBMIT_STALLED)
        );

        // 더 최근 제출이 있으면 옛 감시는 침묵한다.
        let second = note_oauth_code_submitted(&provider);
        assert!(oauth_login_runtime_snapshot(&provider)
            .submit_warning
            .is_none());
        warn_oauth_code_submit_stalled(&provider, first);
        assert!(oauth_login_runtime_snapshot(&provider)
            .submit_warning
            .is_none());

        // 로그인이 끝나면 경고는 성공 화면 위에 남지 않는다.
        warn_oauth_code_submit_stalled(&provider, second);
        assert!(oauth_login_runtime_snapshot(&provider)
            .submit_warning
            .is_some());
        finish_oauth_login_runtime(&provider);
        assert!(oauth_login_runtime_snapshot(&provider)
            .submit_warning
            .is_none());

        // 종료된 로그인에는 새 경고가 붙지 않는다.
        let third = note_oauth_code_submitted(&provider);
        warn_oauth_code_submit_stalled(&provider, third);
        assert!(oauth_login_runtime_snapshot(&provider)
            .submit_warning
            .is_none());
        clear_oauth_login_runtime(&provider);
    }

    #[test]
    fn a_superseded_attempt_cannot_steal_the_new_attempts_code_channel() {
        // 옛 시도를 종료시키면 그 대기 스레드가 뒤늦게 종료 코드를 들고 돌아온다.
        // 그 쓰기가 통과하면 방금 시작한 시도의 통로가 지워지고 실패로 둔갑한다.
        let provider = format!("fixture-login-epoch-{}", uuid::Uuid::new_v4());
        let stale_epoch = begin_oauth_login_epoch(&provider);
        start_oauth_login_runtime(&provider);

        terminate_stale_oauth_login(&provider);
        let fresh_epoch = begin_oauth_login_epoch(&provider);
        start_oauth_login_runtime(&provider);
        assert_ne!(stale_epoch, fresh_epoch);

        let sink = Arc::new(Mutex::new(Vec::<Vec<u8>>::new()));
        store_oauth_login_pty_writer(&provider, Box::new(RecordingLoginWriter(sink.clone())));

        settle_detached_oauth_login(
            &provider,
            stale_epoch,
            &Arc::new(Mutex::new(String::new())),
            Some("stale attempt exited".into()),
        );

        let snapshot = oauth_login_runtime_snapshot(&provider);
        assert!(snapshot.active, "the fresh attempt must stay active");
        assert!(snapshot.error.is_none());
        write_oauth_code_to_login_input(&provider, "fixture-code")
            .expect("the fresh attempt must keep its code channel");
        assert!(oauth_login_epoch_is_current(&provider, fresh_epoch));

        forget_oauth_login_session(&provider);
        clear_oauth_login_runtime(&provider);
    }

    const FIXTURE_CLAUDE_LOGIN_URL: &str =
        "https://claude.ai/oauth/authorize?code=true&client_id=fixture&state=fixture";

    #[test]
    fn one_login_click_auto_opens_the_browser_at_most_once() {
        // 증상: "Claude 구독으로 로그인" 한 번에 창이 2개 떴다. URL 을 감지하는 경로가
        // 셋(선힌트·본 폴링 루프·90초 지연 감시자)인데 각자 독립적으로 열었기 때문이다.
        let provider = format!("fixture-auto-open-{}", uuid::Uuid::new_v4());
        terminate_stale_oauth_login(&provider);

        assert_eq!(
            decide_login_url_auto_open(&provider, FIXTURE_CLAUDE_LOGIN_URL, None),
            LoginUrlOpenDecision::Open,
            "the first auto-open path must be allowed to open the browser",
        );
        assert_eq!(
            decide_login_url_auto_open(&provider, FIXTURE_CLAUDE_LOGIN_URL, None),
            LoginUrlOpenDecision::SkipAlreadyOpen,
            "the second auto-open path must not open a second window",
        );
        // 90초 감시자가 뒤늦게 같은 URL 을 잡아도 세 번째 창은 없어야 한다.
        assert_eq!(
            decide_login_url_auto_open(
                &provider,
                FIXTURE_CLAUDE_LOGIN_URL,
                Some("Browser didn't open? Use the url below to sign in (c to copy)"),
            ),
            LoginUrlOpenDecision::SkipAlreadyOpen,
        );

        // 새 로그인 클릭은 새 URL 을 받는다. 기억이 남아 있으면 한 번도 안 열린다.
        terminate_stale_oauth_login(&provider);
        assert_eq!(
            decide_login_url_auto_open(&provider, FIXTURE_CLAUDE_LOGIN_URL, None),
            LoginUrlOpenDecision::Open,
            "a fresh login click must be able to open the browser again",
        );
        forget_auto_opened_login_urls(&provider);
        clear_oauth_login_runtime(&provider);
    }

    #[test]
    fn a_failed_auto_open_does_not_block_the_next_path() {
        // 열기에 실패한 채로 권한만 잡아두면 뒤이은 감시자가 물러나 브라우저가 한 번도
        // 안 열린다.
        let provider = format!("fixture-auto-open-fail-{}", uuid::Uuid::new_v4());
        terminate_stale_oauth_login(&provider);

        assert_eq!(
            open_login_url_once(&provider, "ftp://example.invalid/not-http", None),
            LoginUrlOpenOutcome::Failed,
            "a non-HTTP URL cannot be handed to the browser",
        );
        assert_eq!(
            decide_login_url_auto_open(&provider, "ftp://example.invalid/not-http", None),
            LoginUrlOpenDecision::Open,
            "a failed open must release its claim",
        );

        forget_auto_opened_login_urls(&provider);
        clear_oauth_login_runtime(&provider);
    }

    #[test]
    fn a_cli_that_opened_the_browser_itself_suppresses_the_fallback_open() {
        // 실측 캡처: CLI 가 먼저 브라우저를 열고, 그 다음 "안 열렸으면 이 URL 을 쓰라"는
        // 폴백 URL 을 찍는다. 그 폴백을 확인 없이 열면 곧바로 창 두 개다.
        let captured = concat!(
            "\u{1b}[2mOpening browser to sign in...\u{1b}[0m\r\n",
            "\u{1b}[90mBrowser didn't open? Use the url below to sign in (c to copy)\u{1b}[0m\r\n",
            "https://claude.ai/oauth/authorize?code=true&client_id=fixture&state=fixture \r\n",
        );
        assert!(cli_opened_browser_itself(captured));
        // 좁은 TUI 프레임에서 문구가 줄바꿈으로 쪼개져도 판정은 유지돼야 한다.
        assert!(cli_opened_browser_itself(
            "Opening\r\n  browser to sign in..."
        ));
        // 폴백 안내만 있는 출력은 CLI 가 열었다는 신호가 아니다.
        assert!(!cli_opened_browser_itself(
            "Browser didn't open? Use the url below to sign in (c to copy)"
        ));

        let provider = format!("fixture-cli-open-{}", uuid::Uuid::new_v4());
        terminate_stale_oauth_login(&provider);
        assert_eq!(
            decide_login_url_auto_open(&provider, FIXTURE_CLAUDE_LOGIN_URL, Some(captured)),
            LoginUrlOpenDecision::SkipCliOpened,
            "Atelier must not open a URL the CLI already opened",
        );
        // 프론트가 또 열지 않도록 "브라우저에 떠 있음"으로 보고돼야 한다.
        assert!(LoginUrlOpenOutcome::CliOpened.browser_showing());
        assert!(LoginUrlOpenOutcome::AlreadyOpen.browser_showing());
        assert!(!LoginUrlOpenOutcome::Failed.browser_showing());

        forget_auto_opened_login_urls(&provider);
        clear_oauth_login_runtime(&provider);
    }

    /// 캡처 버퍼가 절단될 만큼 TUI 출력을 쏟아부어 실측 조건을 그대로 만든다.
    /// (라운드5 검증 실측: flood 64KB·112KB 에서 마커가 버퍼 밖으로 밀려났다.)
    fn flooded_login_stream(flood_bytes: usize, tail: &str) -> String {
        let mut stream = String::from("\u{1b}[2mOpening browser to sign in...\u{1b}[0m\r\n");
        // Ink TUI 는 프레임을 통째로 다시 그린다. 마커와 URL 사이는 쉽게 64KB 를 넘는다.
        while stream.len() < flood_bytes {
            stream.push_str("\u{1b}[2K⠋ waiting for the browser to finish sign-in\r\n");
        }
        stream.push_str(tail);
        stream
    }

    fn drain_login_stream_into_capture(
        stream: String,
        provider: &str,
        epoch: u64,
        needle: &str,
    ) -> String {
        let captured = Arc::new(Mutex::new(String::new()));
        capture_login_pipe(
            std::io::Cursor::new(stream.into_bytes()),
            captured.clone(),
            Some(LoginStreamWatch {
                provider: provider.to_string(),
                epoch,
            }),
        );
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let output = captured_login_output(&captured);
            if output.contains(needle) {
                return output;
            }
            assert!(
                Instant::now() < deadline,
                "the capture thread never delivered the tail of the stream"
            );
            thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn a_cli_open_marker_survives_a_capture_buffer_flood() {
        // 실측 재현: `Opening browser to sign in...` 는 맨 처음 딱 한 번만 찍힌다. 그 뒤로
        // TUI 출력이 64KB 를 넘으면 슬라이딩 윈도우가 마커를 버리고, 버퍼를 다시 훑는
        // 판정은 false 로 되돌아가 폴백 URL 을 또 연다(=창 두 개). macOS 에선 CLI 자신의
        // 창을 별도 프로세스($BROWSER=/usr/bin/open)가 열어 URL 중복 기록이 원리적으로
        // 관측 불가하므로, 이 마커가 유일한 방어다.
        let provider = "claude";
        for flood_bytes in [64 * 1024_usize, 112 * 1024] {
            terminate_stale_oauth_login(provider);
            let epoch = current_oauth_login_epoch(provider);
            let stream = flooded_login_stream(
                flood_bytes,
                &format!(
                    "Browser didn't open? Use the url below to sign in (c to copy)\r\n{FIXTURE_CLAUDE_LOGIN_URL} \r\n"
                ),
            );
            let output =
                drain_login_stream_into_capture(stream, provider, epoch, FIXTURE_CLAUDE_LOGIN_URL);

            // 전제 확인: 홍수가 실제로 마커를 버퍼 밖으로 밀어냈어야 결함 재현이다.
            assert!(
                output.len() <= 64 * 1024,
                "flood {flood_bytes}: the capture buffer must have been truncated"
            );
            assert!(
                !cli_opened_browser_itself(&output),
                "flood {flood_bytes}: the marker must be gone from the buffer (that is the defect)"
            );

            // 그럼에도 판정은 살아 있어야 한다 — 판정 지점이 버퍼가 아니라 스트림이므로.
            assert!(
                cli_self_opened_browser_latched(provider),
                "flood {flood_bytes}: the one-shot marker must stay latched"
            );
            // 실측 표의 "자동오픈 0". CliOpened 는 open_login_url_in_browser 를 아예
            // 부르지 않았다는 뜻이다.
            assert_eq!(
                open_login_url_once(provider, FIXTURE_CLAUDE_LOGIN_URL, Some(&output)),
                LoginUrlOpenOutcome::CliOpened,
                "flood {flood_bytes}: Atelier must not open a second window"
            );
            // URL 도 1회성 신호다. 버퍼에서 사라져도 래치가 이어받아야 한다.
            assert_eq!(
                latched_login_url(provider).as_deref(),
                Some(FIXTURE_CLAUDE_LOGIN_URL),
                "flood {flood_bytes}: the login url must stay latched"
            );
        }

        terminate_stale_oauth_login(provider);
        reset_oauth_login_stream_latch(provider);
        forget_auto_opened_login_urls(provider);
        clear_oauth_login_runtime(provider);
    }

    #[test]
    fn a_setup_token_survives_a_capture_buffer_flood() {
        // 토큰도 스트림에 한 번만 지나간다. 종료 직전 TUI 해체 프레임이 쏟아지면 같은
        // 방식으로 버퍼에서 밀려나고, 버퍼만 보는 회수는 "토큰 없음"으로 오판한다.
        let provider = format!("fixture-token-flood-{}", uuid::Uuid::new_v4());
        let epoch = begin_oauth_login_epoch(&provider);
        let fake_token = fake_claude_subscription_token();
        let mut stream = format!("\u{1b}[33m  {fake_token}  \u{1b}[39m\r\n");
        while stream.len() < 112 * 1024 {
            stream.push_str("\u{1b}[2K⠙ closing the sign-in session\r\n");
        }
        stream.push_str("DONE\r\n");
        let output = drain_login_stream_into_capture(stream, &provider, epoch, "DONE");

        assert!(
            extract_claude_oauth_token_from_text(&output).is_none(),
            "the token must be gone from the buffer (that is the defect)"
        );
        let captured = Arc::new(Mutex::new(String::new()));
        assert_eq!(
            poll_captured_claude_token(&provider, &captured, 1, Duration::from_millis(0))
                .as_deref(),
            Some(fake_token.as_str()),
            "the one-shot token must stay latched"
        );

        reset_oauth_login_stream_latch(&provider);
    }

    #[test]
    fn a_superseded_attempts_capture_thread_cannot_latch_into_the_new_attempt() {
        // 죽인 시도의 캡처 스레드가 늦게 깨어나 새 시도의 래치를 켜면, 이번 로그인은
        // "CLI 가 이미 열었다"고 오판해 브라우저가 한 번도 안 열린다.
        let provider = format!("fixture-stale-latch-{}", uuid::Uuid::new_v4());
        let stale_epoch = begin_oauth_login_epoch(&provider);
        begin_oauth_login_epoch(&provider);

        let output = drain_login_stream_into_capture(
            flooded_login_stream(8 * 1024, "TAIL\r\n"),
            &provider,
            stale_epoch,
            "TAIL",
        );
        assert!(
            cli_opened_browser_itself(&output),
            "the marker is still in this small buffer; only the epoch guard may reject it"
        );
        assert!(
            !cli_self_opened_browser_latched(&provider),
            "a superseded attempt must not write into the current attempt's latch"
        );

        reset_oauth_login_stream_latch(&provider);
    }

    #[test]
    fn a_login_url_erased_from_the_buffer_is_still_detected_via_the_latch() {
        // 기존 홍수 픽스처는 URL 을 스트림 꼬리에 찍어 절단이 URL 을 지우지 못했고,
        // 그래서 detected_provider_login_url 의 래치 폴백을 지워도 아무 테스트도
        // 깨지지 않았다(라운드6 생존 뮤턴트). 여기서는 URL 을 스트림 **앞**에 찍고
        // 그 뒤로 홍수를 부어 "버퍼에서 정말 사라진 뒤"의 판정을 못박는다.
        let provider = "codex";
        let login_url = "https://auth.openai.com/codex/device?user_code=FIXTURE-1234";
        let epoch = begin_oauth_login_epoch(provider);

        let mut stream = format!("Open this URL to sign in:\r\n{login_url} \r\n");
        // 사전 확인 1: 이 텍스트 형태에서 추출 자체는 성립한다 — 아래의 None 이
        // "원래 못 뽑는 텍스트"라서가 아니라 절단 때문임을 보장한다.
        assert_eq!(
            extract_provider_login_url(provider, &stream).as_deref(),
            Some(login_url),
            "the fixture url must be extractable before the flood"
        );
        while stream.len() < 112 * 1024 {
            stream.push_str("\u{1b}[2K⠋ waiting for the browser to finish sign-in\r\n");
        }
        stream.push_str("DONE\r\n");
        let output = drain_login_stream_into_capture(stream, provider, epoch, "DONE");

        // 사전 확인 2: 홍수가 URL 을 캡처 버퍼 밖으로 실제로 밀어냈다(그게 결함 조건).
        assert!(
            output.len() <= 64 * 1024,
            "the capture buffer must have been truncated"
        );
        assert_eq!(
            extract_provider_login_url(provider, &output),
            None,
            "the login url must be gone from the buffer (that is the defect)"
        );

        // 본 단언: 버퍼 재추출이 실패해도 래치 폴백이 이어받아 같은 URL 을 돌려줘야 한다.
        assert_eq!(
            detected_provider_login_url(provider, &output).as_deref(),
            Some(login_url),
            "detection must fall back to the latch once the buffer loses the url"
        );

        reset_oauth_login_stream_latch(provider);
    }

    /// 실제 PTY 처럼 read() 한 번이 CLI 의 write 한 번에 대응하는 리더.
    /// Cursor 주입은 4096B 연속 청크라 "마커가 read 경계에서 두 조각으로 도착"하는
    /// 실측 상황을 재현하지 못한다(라운드6 생존 뮤턴트: carry 를 0 으로 해도 통과).
    struct FragmentedReader {
        fragments: Vec<&'static [u8]>,
        next: usize,
    }

    impl Read for FragmentedReader {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let Some(fragment) = self.fragments.get(self.next) else {
                return Ok(0);
            };
            self.next += 1;
            if self.next > 1 {
                // 두 write 사이의 시간 간격 — 조각이 한 read 로 합쳐지지 않게 한다.
                thread::sleep(Duration::from_millis(5));
            }
            assert!(
                fragment.len() <= buf.len(),
                "fixture fragment exceeds read buffer"
            );
            buf[..fragment.len()].copy_from_slice(fragment);
            Ok(fragment.len())
        }
    }

    #[test]
    fn a_browser_marker_split_across_two_pty_writes_still_latches() {
        // 실측 PTY 에서 CLI 는 마커를 한 write 로 보장하지 않는다. 직전 꼬리(carry)를
        // 이어 붙이는 관측 창이 없으면 이 상황에서 마커를 영영 놓친다.
        let first = "\u{1b}[2mOpening bro";
        let second = "wser to sign in...\u{1b}[0m\r\n";
        // 사전 확인: 각 조각 단독으로는 마커 매칭이 실패한다 — carry 가 조각을
        // 이어붙여야만 래치가 켜질 수 있음을 보장한다(공허한 통과 방지).
        assert!(
            !cli_opened_browser_itself(first),
            "the first fragment alone must not match the marker"
        );
        assert!(
            !cli_opened_browser_itself(second),
            "the second fragment alone must not match the marker"
        );

        let provider = format!("fixture-split-marker-{}", uuid::Uuid::new_v4());
        let epoch = begin_oauth_login_epoch(&provider);
        let captured = Arc::new(Mutex::new(String::new()));
        capture_login_pipe(
            FragmentedReader {
                fragments: vec![first.as_bytes(), second.as_bytes(), b"DONE\r\n".as_slice()],
                next: 0,
            },
            captured.clone(),
            Some(LoginStreamWatch {
                provider: provider.clone(),
                epoch,
            }),
        );
        let deadline = Instant::now() + Duration::from_secs(10);
        while !captured_login_output(&captured).contains("DONE") {
            assert!(
                Instant::now() < deadline,
                "the capture thread never delivered the tail of the stream"
            );
            thread::sleep(Duration::from_millis(10));
        }

        // 본 단언: 관측 창(carry+청크)이 두 조각을 이어붙여 1회성 마커를 래치해야 한다.
        assert!(
            cli_self_opened_browser_latched(&provider),
            "a marker split across two reads must still latch"
        );

        reset_oauth_login_stream_latch(&provider);
    }

    #[test]
    fn the_manual_open_button_records_its_url_for_the_watchers() {
        // 사용자가 직접 누른 버튼은 언제나 열려야 한다(그게 존재 이유다). 다만 연 사실을
        // 남겨야 뒤늦게 깨어난 자동 오픈 경로가 같은 URL 로 창을 또 띄우지 않는다.
        let provider = format!("fixture-manual-open-{}", uuid::Uuid::new_v4());
        terminate_stale_oauth_login(&provider);

        mark_login_url_opened(&provider, FIXTURE_CLAUDE_LOGIN_URL);
        assert_eq!(
            decide_login_url_auto_open(&provider, FIXTURE_CLAUDE_LOGIN_URL, None),
            LoginUrlOpenDecision::SkipAlreadyOpen,
        );

        forget_auto_opened_login_urls(&provider);
        clear_oauth_login_runtime(&provider);
    }

    #[cfg(unix)]
    #[test]
    fn starting_a_login_terminates_the_previous_attempt_process() {
        // 실측에서 프로세스가 3개까지 쌓였다. 통로가 하나뿐이라 브라우저에서 받은
        // 코드가 어느 시도로 갈지 알 수 없게 된다.
        let provider = format!("fixture-login-kill-{}", uuid::Uuid::new_v4());
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: OAUTH_LOGIN_PTY_COLS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("openpty");
        let command = oauth_pty_login_command("/bin/sh", &["-c", "sleep 30"]);
        let mut child = pair.slave.spawn_command(command).expect("spawn sleeper");
        drop(pair.slave);
        store_oauth_login_terminator(&provider, OAuthLoginTerminator::Pty(child.clone_killer()));

        terminate_stale_oauth_login(&provider);

        let started = Instant::now();
        let exited = loop {
            match child.try_wait().expect("poll sleeper") {
                Some(_) => break true,
                None if started.elapsed() >= Duration::from_secs(5) => break false,
                None => thread::sleep(Duration::from_millis(50)),
            }
        };
        assert!(exited, "the previous login child must be terminated");
        clear_oauth_login_runtime(&provider);
    }

    #[test]
    fn login_diagnostics_stay_readable_after_tui_control_noise() {
        // 실패 문구가 화면에 도달해도 제어문자가 함께 쏟아지면 사람은 못 읽는다.
        let raw = "\u{1b}[2K\u{1b}[36mSubscription sign-in failed\u{1b}[0m\r\n\
             \u{1b}[2K⠋ waiting\r⠙ waiting\r⠹ waiting\r\n\
             \u{1b}[31mtry again\u{1b}[0m\n";
        let detail = login_failure_detail_text(raw);

        assert!(!detail.contains('\u{1b}'), "escape bytes must be gone");
        assert!(!detail.contains('\r'), "carriage returns must be unfolded");
        assert!(!detail.contains("[2K"), "csi payloads must be gone");
        assert!(detail.contains("Subscription sign-in failed"));
        assert!(detail.contains("try again"));
        assert_eq!(
            detail.matches("waiting").count(),
            3,
            "distinct spinner frames stay, but nothing is duplicated back to back"
        );
    }

    #[test]
    fn repeated_tui_frames_collapse_in_user_facing_output() {
        let detail = login_failure_detail_text("same frame\r\nsame frame\r\nsame frame\r\ndone\n");
        assert_eq!(detail, "same frame\ndone");
    }

    #[test]
    fn login_url_extraction_ignores_ansi_wrapping() {
        let url =
            extract_login_url("\u{1b}[36mhttps://claude.ai/oauth/authorize?state=abc\u{1b}[0m")
                .expect("url should be extracted");
        assert_eq!(url, "https://claude.ai/oauth/authorize?state=abc");
    }

    #[test]
    fn login_url_extraction_reads_osc8_hyperlinks() {
        let text = "\u{1b}]8;;https://chatgpt.com/backend-api/codex/auth?state=abc&code_challenge=def\u{1b}\\Open browser\u{1b}]8;;\u{1b}\\";
        let url = extract_login_url(text).expect("osc8 url should be extracted");
        assert_eq!(
            url,
            "https://chatgpt.com/backend-api/codex/auth?state=abc&code_challenge=def"
        );
    }

    #[test]
    fn login_url_extraction_preserves_claude_redirect_uri() {
        let text = "Open browser: https://claude.com/cai/oauth/authorize?code=true&client_id=abc&redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback&code_challenge=secret&state=xyz";
        let url = extract_login_url(text).expect("claude login url should be extracted");
        assert!(url.contains("redirect_uri="));
        assert!(url.contains("code_challenge=secret"));
        assert!(url.ends_with("state=xyz"));
    }

    #[test]
    fn provider_login_url_allowlist_rejects_insecure_and_unrelated_hosts() {
        assert!(is_provider_login_url(
            "claude",
            "https://claude.ai/oauth/authorize?state=abc"
        ));
        assert!(is_provider_login_url(
            "codex",
            "https://auth.openai.com/authorize?state=abc"
        ));
        assert!(is_provider_login_url(
            "grok",
            "https://auth.x.ai/oauth/authorize?state=abc"
        ));
        assert!(!is_provider_login_url(
            "claude",
            "http://claude.ai/oauth/authorize"
        ));
        assert!(!is_provider_login_url(
            "codex",
            "https://chatgpt.com.attacker.example/authorize"
        ));
        assert!(!is_provider_login_url(
            "claude",
            "https://example.com/claude-login"
        ));
        assert!(!is_provider_login_url(
            "grok",
            "https://x.ai.attacker.example/login"
        ));
    }

    #[test]
    fn provider_login_url_extraction_skips_unrelated_links() {
        let text = "Docs: https://example.com/help\nLogin: https://chatgpt.com/backend-api/codex/auth?state=abc\n";
        assert_eq!(
            extract_provider_login_url("codex", text).as_deref(),
            Some("https://chatgpt.com/backend-api/codex/auth?state=abc")
        );
    }

    #[test]
    fn provider_login_url_waits_for_a_complete_pty_chunk() {
        let partial = "Open browser: https://claude.com/cai/oauth/authorize?client_id=abc&redire";
        assert_eq!(extract_provider_login_url("claude", partial), None);
        assert_eq!(
            extract_provider_login_url_relaxed("claude", partial).as_deref(),
            Some("https://claude.com/cai/oauth/authorize?client_id=abc&redire")
        );

        let complete = "Open browser: https://claude.com/cai/oauth/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback&state=xyz\r\n";
        let url = extract_provider_login_url("claude", complete)
            .expect("terminated URL should be accepted");
        assert!(url.contains("redirect_uri="));
        assert!(url.ends_with("state=xyz"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_oauth_does_not_override_the_provider_browser() {
        let mut command = Command::new("claude");
        command.env("BROWSER", "recursive-atelier-launcher");
        configure_login_browser_env_for_command(&mut command);
        assert!(command
            .get_envs()
            .any(|(key, value)| key == "BROWSER" && value.is_none()));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_oauth_browser_helper_uses_trusted_system_binary() {
        assert_eq!(
            oauth_browser_helper_path().as_deref(),
            Some(Path::new("/usr/bin/open"))
        );
    }

    #[test]
    fn oauth_browser_helper_accepts_only_provider_https_urls() {
        assert_eq!(
            provider_for_oauth_login_url("https://claude.com/cai/oauth/authorize?state=abc"),
            Some("claude")
        );
        assert_eq!(
            provider_for_oauth_login_url("https://auth.openai.com/codex/device"),
            Some("codex")
        );
        assert_eq!(
            provider_for_oauth_login_url("https://auth.x.ai/oauth/authorize"),
            Some("grok")
        );
        assert_eq!(provider_for_oauth_login_url("http://claude.ai/oauth"), None);
        assert_eq!(
            provider_for_oauth_login_url("https://example.com/oauth"),
            None
        );
    }

    #[test]
    fn claude_oauth_token_parser_supports_legacy_and_keychain_shapes() {
        let legacy = serde_json::json!({
            "claudeAiOauth": {
                "accessToken": "sk-ant-oat-legacy",
                "expiresAt": chrono::Utc::now().timestamp_millis() + 120_000,
                "subscriptionType": "max"
            }
        });
        let keychain = serde_json::json!({
            "claudeAiOauth": {
                "accessToken": "sk-ant-oat-keychain",
                "refreshToken": "redacted",
                "expiresAt": (chrono::Utc::now().timestamp_millis() + 120_000).to_string(),
                "subscriptionType": "max"
            }
        });

        assert_eq!(
            claude_oauth_token_from_value(&legacy),
            Some("sk-ant-oat-legacy".into())
        );
        assert_eq!(
            claude_oauth_token_from_value(&keychain),
            Some("sk-ant-oat-keychain".into())
        );
    }

    #[test]
    fn expired_legacy_access_is_rejected_even_with_refresh_token() {
        let value = serde_json::json!({
            "claudeAiOauth": {
                "accessToken": "sk-ant-oat-expired",
                "refreshToken": "refresh-token",
                "expiresAt": chrono::Utc::now().timestamp_millis() - 1
            }
        });

        assert_eq!(claude_oauth_token_from_value(&value), None);
        let credential = claude_oauth_credential_from_value(&value).unwrap();
        assert_eq!(credential.access, "sk-ant-oat-expired");
        assert_eq!(credential.refresh.as_deref(), Some("refresh-token"));
        assert!(!credential.access_is_fresh());
    }

    #[test]
    fn claude_oauth_credential_parser_supports_access_refresh_aliases() {
        let value = serde_json::json!({
            "oauth": {
                "access": "sk-ant-oat-access",
                "refresh": "refresh-token",
                "expires": "1782709680730",
                "scopes": ["org:create_api_key", "user:profile"],
                "subscription_type": "max"
            }
        });

        let credential = claude_oauth_credential_from_value(&value).unwrap();
        assert_eq!(credential.access, "sk-ant-oat-access");
        assert_eq!(credential.refresh.as_deref(), Some("refresh-token"));
        assert_eq!(credential.expires, Some(1782709680730));
        assert_eq!(
            credential.scopes.as_deref(),
            Some("org:create_api_key user:profile")
        );
        assert_eq!(credential.subscription_type.as_deref(), Some("max"));
    }
}
