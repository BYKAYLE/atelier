import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface PtySpawnResult {
  id: string;
  profile: string;
  log_id: string;
}

export interface PtyTransportSnapshot {
  bytes_read: number;
  bytes_emitted: number;
  queued_bytes: number;
  max_queued_bytes: number;
  batches_emitted: number;
  bridge_dropped_bytes: number;
  started_at_ms: number;
  last_activity_ms: number;
}

export interface PtyOutputJournalStatus {
  first_available_sequence: number;
  latest_sequence: number;
  acknowledged_sequence: number;
}

export interface PtySessionInfo {
  id: string;
  profile: string;
  log_id: string;
  transport: PtyTransportSnapshot;
  output: PtyOutputJournalStatus;
  running: boolean;
  exitCode?: number | null;
}

export interface PtyOutputFrame {
  sequence: number;
  data: string;
}

export interface PtyOutputSnapshot {
  first_available_sequence: number;
  latest_sequence: number;
  acknowledged_sequence: number;
  truncated: boolean;
  frames: PtyOutputFrame[];
}

export interface SessionLogSnapshot {
  log_id: string;
  data: string;
  total_bytes: number;
  replay_bytes: number;
  truncated: boolean;
}

export interface RuntimeInstallInfo {
  exe_path: string;
  windows_store_like: boolean;
  github_updater_available: boolean;
  app_version: string;
  platform: string;
  architecture: string;
  smart_app_control_state?: string | null;
  oauth_browser_handoff: string;
}

export async function runtimeInstallInfo(): Promise<RuntimeInstallInfo> {
  return invoke("runtime_install_info");
}

export interface RendererReadyReceipt {
  schemaVersion: number;
  appVersion: string;
  pid: number;
  readyAtUnixMs: number;
  executablePath: string;
  windowLabel: string;
  status: "ready" | "error";
}

export async function rendererReady(status: "ready" | "error"): Promise<RendererReadyReceipt> {
  return invoke("renderer_ready", { status });
}

export async function ptySpawn(
  profile: string,
  cols: number,
  rows: number,
  logId?: string,
): Promise<PtySpawnResult> {
  return invoke("pty_spawn", { profile, cols, rows, logId: logId ?? null });
}

export async function ptyWrite(id: string, data: string): Promise<void> {
  return invoke("pty_write", { id, data });
}

export async function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { id, cols, rows });
}

export async function ptyKill(id: string): Promise<void> {
  return invoke("pty_kill", { id });
}

export async function ptyList(): Promise<PtySessionInfo[]> {
  return invoke("pty_list");
}

export async function ptyOutputSnapshot(
  id: string,
  afterSequence = 0,
): Promise<PtyOutputSnapshot> {
  return invoke("pty_output_snapshot", { id, afterSequence });
}

export async function ptyAck(id: string, sequence: number): Promise<number> {
  return invoke("pty_ack", { id, sequence });
}

// Rust 측은 PTY 청크를 base64 문자열로 emit (pty.rs DataPayload 주석 참조).
// atob로 바이너리 문자열 복원 후 Uint8Array 생성 — JSON 숫자배열 경로 대비
// UI thread 점유 대폭 감소.
export async function onPtyData(
  id: string,
  handler: (bytes: Uint8Array, sequence: number) => void,
): Promise<UnlistenFn> {
  return listen<{ sequence: number; data: string }>(`pty://${id}/data`, (e) => {
    const bin = atob(e.payload.data);
    const n = bin.length;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    handler(out, e.payload.sequence);
  });
}

export async function onPtyExit(
  id: string,
  handler: (code: number | null) => void,
): Promise<UnlistenFn> {
  return listen<{ code: number | null }>(`pty://${id}/exit`, (e) => {
    handler(e.payload.code);
  });
}

export interface AgentStreamEvent {
  kind: "status" | "delta" | "tool" | "result" | "error" | "raw";
  text?: string | null;
  status?: string | null;
  raw?: string | null;
  provider_session_id?: string | null;
  is_error?: boolean | null;
}

export interface AgentTokenUsageEvent {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
  total_tokens: number;
  context_window?: number | null;
  remaining_tokens?: number | null;
  model?: string | null;
  source: "provider" | "cli" | "cli_estimate" | string;
  timestamp_ms: number;
}

export interface SubscriptionRateLimitWindow {
  id: string;
  label?: string | null;
  usedPercent: number;
  remainingPercent: number;
  windowMinutes?: number | null;
  resetsAtUnixSeconds?: number | null;
}

export interface ProviderSubscriptionUsage {
  provider: string;
  plan?: string | null;
  windows: SubscriptionRateLimitWindow[];
  source: string;
  capturedAtUnixMs: number;
}

export type AgentLifecyclePhase =
  | "started"
  | "output"
  | "tool_started"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentLifecycleEvent {
  turn_id: string;
  provider: AgentProvider;
  sequence: number;
  phase: AgentLifecyclePhase;
  status?: string | null;
  summary?: string | null;
  provider_session_id?: string | null;
  terminal: boolean;
  timestamp_ms: number;
}

export interface AgentRunResult {
  text: string;
  provider_session_id?: string | null;
  raw_events: string[];
  is_error: boolean;
  error?: string | null;
}

export interface AgentChangedFile {
  path: string;
  status: string;
  index_status: string;
  worktree_status: string;
  staged: boolean;
  unstaged: boolean;
  additions: number;
  deletions: number;
  binary: boolean;
  diff: string;
}

export interface AgentChangeSummary {
  cwd: string;
  is_git: boolean;
  scope?: "run" | "workspace" | string;
  files: AgentChangedFile[];
  additions: number;
  deletions: number;
  patch: string;
  undo_applied?: boolean;
  undo_error?: string | null;
}

export interface AgentChangeBaseline {
  id: string;
  cwd: string;
  is_git: boolean;
}

export interface AgentGitCommit {
  hash: string;
  short_hash: string;
  subject: string;
  author: string;
  timestamp: number;
}

export interface AgentGitState {
  root: string;
  branch: string;
  head: string;
  upstream?: string | null;
  ahead: number;
  behind: number;
  staged_count: number;
  unstaged_count: number;
  untracked_count: number;
  recent_commits: AgentGitCommit[];
}

export interface GithubIssueSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  author?: string | null;
  updatedAt?: string | null;
  labels: string[];
}

export interface GithubPullRequestSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  author?: string | null;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  reviewDecision?: string | null;
  updatedAt?: string | null;
  checksTotal: number;
  checksSuccess: number;
  checksFailure: number;
  reviewers: string[];
}

export interface GithubWorkflowSnapshot {
  schemaVersion: number;
  available: boolean;
  authenticated: boolean;
  ghVersion?: string | null;
  login?: string | null;
  repository?: string | null;
  repositoryUrl?: string | null;
  defaultBranch?: string | null;
  issues: GithubIssueSummary[];
  pullRequests: GithubPullRequestSummary[];
  reason?: string | null;
  fetchedAtUnixMs: number;
}

export type GithubActionKind =
  | "issue.create"
  | "issue.comment"
  | "pr.create"
  | "pr.comment"
  | "pr.review"
  | "pr.reviewers";

export interface GithubActionInput {
  kind: GithubActionKind;
  number?: number | null;
  title?: string | null;
  body?: string | null;
  base?: string | null;
  reviewers?: string[];
  reviewDecision?: "comment" | "approve" | "request_changes" | null;
  draft?: boolean;
}

export interface GithubPreparedAction {
  schemaVersion: number;
  actionId: string;
  actionHash: string;
  repository: string;
  kind: GithubActionKind;
  preview: string;
  expiresAtUnixMs: number;
}

export interface GithubActionReceipt {
  schemaVersion: number;
  receiptId: string;
  actionId: string;
  actionHash: string;
  repository: string;
  kind: GithubActionKind;
  status: "succeeded" | "failed";
  summary: string;
  url?: string | null;
  error?: string | null;
  createdAtUnixMs: number;
  completedAtUnixMs: number;
}

export interface LinearViewerSummary {
  id: string;
  name: string;
  email?: string | null;
}

export interface LinearWorkflowStateSummary {
  id: string;
  name: string;
  type: string;
  color?: string | null;
  position?: number | null;
}

export interface LinearTeamSummary {
  id: string;
  key: string;
  name: string;
  states: LinearWorkflowStateSummary[];
}

export interface LinearIssueStateSummary {
  id: string;
  name: string;
  type: string;
  color?: string | null;
}

export interface LinearIssueTeamSummary {
  id: string;
  key: string;
  name: string;
}

export interface LinearIssueAssigneeSummary {
  id: string;
  name: string;
}

export interface LinearIssueSummary {
  id: string;
  identifier: string;
  title: string;
  url: string;
  updatedAt?: string | null;
  priority?: number | null;
  state?: LinearIssueStateSummary | null;
  team?: LinearIssueTeamSummary | null;
  assignee?: LinearIssueAssigneeSummary | null;
}

export interface LinearWorkflowSnapshot {
  schemaVersion: number;
  connected: boolean;
  viewer?: LinearViewerSummary | null;
  teams: LinearTeamSummary[];
  issues: LinearIssueSummary[];
  rateLimitRemaining?: number | null;
  rateLimitResetUnixMs?: number | null;
  reason?: string | null;
  fetchedAtUnixMs: number;
}

export type LinearActionKind = "issue.create" | "issue.comment" | "issue.status";

export interface LinearActionInput {
  kind: LinearActionKind;
  teamId?: string | null;
  issueId?: string | null;
  stateId?: string | null;
  title?: string | null;
  body?: string | null;
}

export interface LinearPreparedAction {
  schemaVersion: number;
  actionId: string;
  actionHash: string;
  accountName: string;
  kind: LinearActionKind;
  preview: string;
  expiresAtUnixMs: number;
}

export interface LinearActionReceipt {
  schemaVersion: number;
  receiptId: string;
  actionId: string;
  actionHash: string;
  accountId: string;
  kind: LinearActionKind;
  status: "succeeded" | "failed";
  summary: string;
  url?: string | null;
  error?: string | null;
  createdAtUnixMs: number;
  completedAtUnixMs: number;
}

export interface SshWorkspaceProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  remoteRoot: string;
  archived: boolean;
  createdAtUnixMs: number;
  updatedAtUnixMs: number;
}

export interface SshWorkspaceProfileInput {
  id?: string | null;
  name: string;
  host: string;
  port: number;
  user: string;
  remoteRoot: string;
}

export interface SshHostFingerprint {
  algorithm: string;
  fingerprint: string;
}

export interface SshHostProbe {
  profileId: string;
  host: string;
  port: number;
  fingerprints: SshHostFingerprint[];
  trusted: boolean;
}

export interface SshConnectionProbe {
  profileId: string;
  connected: boolean;
  latencyMs: number;
  remoteIdentity?: string | null;
  message: string;
}

export interface SshTunnelSummary {
  id: string;
  profileId: string;
  localPort: number;
  remotePort: number;
  startedAtUnixMs: number;
  state: "starting" | "connected" | "reconnecting" | "failed";
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  restartCount: number;
  lastCheckedAtUnixMs: number;
  nextRetryAtUnixMs?: number | null;
  lastError?: string | null;
}

export interface SshWorkspaceStatus {
  schemaVersion: number;
  sshInstalled: boolean;
  sshKeyscanInstalled: boolean;
  profiles: SshWorkspaceProfile[];
  tunnels: SshTunnelSummary[];
}

export interface SshRemoteWorktreeInput {
  profileId: string;
  repositoryPath: string;
  taskName: string;
  baseRef?: string | null;
}

export interface SshPreparedAction {
  actionId: string;
  approvalHash: string;
  expiresAtUnixMs: number;
  preview: string;
  input: SshRemoteWorktreeInput;
}

export interface SshRemoteWorktreeReceipt {
  actionId: string;
  profileId: string;
  branch: string;
  worktreePath: string;
  finishedAtUnixMs: number;
  summary: string;
}

export type SshRemoteEntryKind = "file" | "directory" | "symlink" | "other";

export interface SshRemoteEntry {
  path: string;
  name: string;
  kind: SshRemoteEntryKind;
  size: number;
}

export interface SshRemoteDirectory {
  profileId: string;
  path: string;
  parentPath?: string | null;
  entries: SshRemoteEntry[];
  truncated: boolean;
}

export interface SshRemoteFile {
  profileId: string;
  path: string;
  content: string;
  size: number;
  sha256: string;
}

export interface SshRemoteFileWriteInput {
  profileId: string;
  path: string;
  content: string;
  expectedSha256: string;
}

export interface SshPreparedFileWrite {
  actionId: string;
  approvalHash: string;
  expiresAtUnixMs: number;
  profileId: string;
  path: string;
  expectedSha256: string;
  contentSha256: string;
  byteLength: number;
  preview: string;
}

export interface SshRemoteFileWriteReceipt {
  actionId: string;
  profileId: string;
  path: string;
  sha256: string;
  bytesWritten: number;
  finishedAtUnixMs: number;
  summary: string;
}

export interface SshTerminalLaunch {
  profileId: string;
  label: string;
  command: string;
}

export interface ProviderUsageEntry {
  provider: string;
  displayName: string;
  installed: boolean;
  connected: boolean;
  version?: string | null;
  accountLabel?: string | null;
  quotaUsed?: number | null;
  quotaLimit?: number | null;
  quotaRemaining?: number | null;
  resetAt?: string | null;
  subscriptionUsage?: ProviderSubscriptionUsage | null;
  source: string;
  note: string;
  error?: string | null;
}

export interface ProviderUsageSnapshot {
  capturedAtUnixMs: number;
  entries: ProviderUsageEntry[];
}

export interface DevService {
  host: string;
  port: number;
  pid?: number | null;
  processName?: string | null;
  command?: string | null;
  cwd?: string | null;
  workspaceMatch: boolean;
  url: string;
}

export interface DevServicesSnapshot {
  platform: string;
  scannedAtMs: number;
  workspace?: string | null;
  services: DevService[];
  unavailableReason?: string | null;
}

export interface DevServicePreparedStop {
  actionId: string;
  approvalHash: string;
  pid: number;
  port: number;
  processName?: string | null;
  preview: string;
  expiresAtMs: number;
}

export interface DevServiceStopReceipt {
  receiptId: string;
  actionId: string;
  pid: number;
  port: number;
  status: string;
  summary: string;
  completedAtMs: number;
}

export interface AgentWorktreeInfo {
  source_cwd: string;
  worktree_cwd: string;
  branch: string;
  head: string;
  created: boolean;
  source_dirty: boolean;
}

export interface AgentWorktreeAdoptResult {
  source_cwd: string;
  worktree_cwd: string;
  branch: string;
  base_head: string;
  file_count: number;
  additions: number;
  deletions: number;
  source_dirty_before: boolean;
  receipt_path: string;
}

export interface AgentCliCommandResult {
  provider: AgentProvider;
  args: string[];
  stdout: string;
  stderr: string;
  code?: number | null;
  success: boolean;
  timed_out: boolean;
}

export interface AcademicResearchPluginInstallResult {
  installed: boolean;
  enabled: boolean;
  message: string;
  log: string;
}

export interface SkillBundleInstallResult {
  installed: boolean;
  skill_count: number;
  skipped_count: number;
  repository_path: string;
  installed_roots: string[];
  message: string;
  log: string;
}

export interface PluginSkillInstallStatusItem {
  id: string;
  installed: boolean;
  enabled?: boolean | null;
  message: string;
}

export interface PluginSkillInstallStatusResult {
  items: PluginSkillInstallStatusItem[];
}

export interface PreviewCheckResult {
  url: string;
  ok: boolean;
  status?: number | null;
  title?: string | null;
  body_text?: string | null;
  error?: string | null;
  checked_at: number;
}

export interface PreviewServiceStatus {
  id: string;
  url: string;
  cwd: string;
  command: string;
  managed: boolean;
  running: boolean;
  auto_restart: boolean;
  pid?: number | null;
  started_at?: number | null;
  restarts: number;
  last_error?: string | null;
  recent_output: string[];
}

export interface StellaPathStatus {
  path: string;
  exists: boolean;
}

export interface StellaProjectAnalysis {
  cwd: string;
  root: string;
  is_git: boolean;
  project_name?: string | null;
  package_manager?: string | null;
  frameworks: string[];
  scripts: string[];
  verification_commands: string[];
  sot_files: StellaPathStatus[];
  docs: StellaPathStatus[];
  dirty_files: string[];
  risk_flags: string[];
  generated_at: number;
}

export interface StellaProbeCommandResult {
  command: string;
  success: boolean;
  code?: number | null;
  timed_out: boolean;
  duration_ms: number;
  stdout: string;
  stderr: string;
}

export interface StellaProbeResult {
  cwd: string;
  root: string;
  profile: string;
  success: boolean;
  commands: StellaProbeCommandResult[];
  generated_at: number;
}

export interface StellaEvidenceRecordResult {
  path: string;
  written: boolean;
}

export interface StellaFactoryArtifactStatus {
  path: string;
  written: boolean;
  created: boolean;
}

export interface StellaFactoryBootstrapResult {
  cwd: string;
  root: string;
  state_path: string;
  artifact_dir: string;
  created_state: boolean;
  readiness: string;
  artifacts: StellaFactoryArtifactStatus[];
  next_actions: string[];
  generated_at: number;
}

export interface StellaFactoryAutopilotResult {
  cwd: string;
  root: string;
  state_path: string;
  bridge_path?: string | null;
  ran: boolean;
  success: boolean;
  code?: number | null;
  timed_out: boolean;
  duration_ms: number;
  stdout: string;
  stderr: string;
  summary?: unknown | null;
  next_actions: string[];
  generated_at: number;
}

export interface StellaFactoryStatusResult {
  cwd: string;
  root: string;
  state_path: string;
  exists: boolean;
  factory_id?: string | null;
  status?: string | null;
  readiness?: string | null;
  goal?: string | null;
  command_owner?: string | null;
  execution_controller?: string | null;
  updated_at?: string | null;
  next_step?: string | null;
  blocked_reason?: string | null;
  stage_counts: Record<string, number>;
  agent_blueprints: number;
  agent_instances: number;
  kanban_role?: string | null;
  reports: StellaPathStatus[];
  error?: string | null;
  generated_at: number;
}

export type AgentProvider = "claude" | "codex" | "hermes" | "gajecode";
export type AgentPermissionMode = "basic" | "auto" | "full";

export interface AgentModelOption {
  value: string;
  label: string;
  disabled?: boolean;
  supported_reasoning_levels?: string[];
  default_reasoning_level?: string | null;
  requires_multi_agent_v2?: boolean;
}

export interface ClaudeModelOptionsResult {
  source: string;
  updated_at?: string | null;
  models: AgentModelOption[];
}

export interface CodexModelOptionsResult {
  source: string;
  updated_at?: string | null;
  models: AgentModelOption[];
}

export interface OpenRouterModelOptionsResult {
  source: string;
  updated_at?: string | null;
  models: AgentModelOption[];
}

export interface AgentRuntimeCapability {
  id: AgentProvider;
  label: string;
  cli: string;
  auth_owner: string;
  supports_resume: boolean;
  supports_model_catalog: boolean;
  supports_permission_mode: boolean;
}

export async function agentClaudeSend(args: {
  turnId: string;
  prompt: string;
  resumeSessionId?: string | null;
  cwd?: string | null;
  model?: string | null;
  permissionMode?: AgentPermissionMode | null;
}): Promise<AgentRunResult> {
  return invoke("agent_claude_send", args);
}

export async function agentSend(args: {
  provider: AgentProvider;
  turnId: string;
  prompt: string;
  resumeSessionId?: string | null;
  cwd?: string | null;
  model?: string | null;
  hermesProvider?: string | null;
  effort?: string | null;
  speed?: string | null;
  permissionMode?: AgentPermissionMode | null;
}): Promise<AgentRunResult> {
  return invoke("agent_send", args);
}

export async function agentRuntimeCapabilities(): Promise<AgentRuntimeCapability[]> {
  return invoke("agent_runtime_capabilities");
}

export async function claudeModelOptions(): Promise<ClaudeModelOptionsResult> {
  return invoke("claude_model_options");
}

export async function codexModelOptions(): Promise<CodexModelOptionsResult> {
  return invoke("codex_model_options");
}

export async function openRouterModelOptions(): Promise<OpenRouterModelOptionsResult> {
  return invoke("openrouter_model_options");
}

export async function agentCancel(turnId: string): Promise<boolean> {
  return invoke("agent_cancel", { turnId });
}

export async function onAgentEvent(
  turnId: string,
  handler: (event: AgentStreamEvent) => void,
): Promise<UnlistenFn> {
  return listen<AgentStreamEvent>(`agent://${turnId}/event`, (e) => handler(e.payload));
}

export async function onAgentTokenUsage(
  turnId: string,
  handler: (event: AgentTokenUsageEvent) => void,
): Promise<UnlistenFn> {
  return listen<AgentTokenUsageEvent>(`agent://${turnId}/usage`, (e) => handler(e.payload));
}

export async function onAgentSubscriptionUsage(
  turnId: string,
  handler: (event: ProviderSubscriptionUsage) => void,
): Promise<UnlistenFn> {
  return listen<ProviderSubscriptionUsage>(`agent://${turnId}/subscription-usage`, (e) => handler(e.payload));
}

export async function onAgentLifecycle(
  turnId: string,
  handler: (event: AgentLifecycleEvent) => void,
): Promise<UnlistenFn> {
  return listen<AgentLifecycleEvent>(`agent://${turnId}/lifecycle`, (e) => handler(e.payload));
}

export async function onQuickOpenRequested(handler: () => void): Promise<UnlistenFn> {
  return listen("atelier://quick-open", () => handler());
}

export async function agentChangeBaseline(cwd?: string | null): Promise<AgentChangeBaseline> {
  return invoke("agent_change_baseline", { cwd: cwd || null });
}

export async function agentChangeSummary(cwd?: string | null, baselineId?: string | null): Promise<AgentChangeSummary> {
  return invoke("agent_change_summary", { cwd: cwd || null, baselineId: baselineId || null });
}

export async function agentGitState(cwd: string, limit = 12): Promise<AgentGitState> {
  return invoke("agent_git_state", { cwd, limit });
}

export async function agentGitStage(cwd: string, paths: string[]): Promise<AgentGitState> {
  return invoke("agent_git_stage", { cwd, paths });
}

export async function agentGitUnstage(cwd: string, paths: string[]): Promise<AgentGitState> {
  return invoke("agent_git_unstage", { cwd, paths });
}

export async function agentGitCommit(cwd: string, message: string): Promise<AgentGitState> {
  return invoke("agent_git_commit", { cwd, message });
}

export async function githubWorkflowSnapshot(cwd: string, limit = 20): Promise<GithubWorkflowSnapshot> {
  return invoke("github_workflow_snapshot", { cwd, limit });
}

export async function githubWorkflowPrepare(cwd: string, action: GithubActionInput): Promise<GithubPreparedAction> {
  return invoke("github_workflow_prepare", { cwd, action });
}

export async function githubWorkflowExecute(actionId: string, expectedHash: string): Promise<GithubActionReceipt> {
  return invoke("github_workflow_execute", { actionId, expectedHash });
}

export async function githubWorkflowDiscard(actionId: string): Promise<void> {
  return invoke("github_workflow_discard", { actionId });
}

export async function githubWorkflowReceipts(limit = 20): Promise<GithubActionReceipt[]> {
  return invoke("github_workflow_receipts", { limit });
}

export async function linearWorkflowSnapshot(limit = 25): Promise<LinearWorkflowSnapshot> {
  return invoke("linear_workflow_snapshot", { limit });
}

export async function linearWorkflowPrepare(action: LinearActionInput): Promise<LinearPreparedAction> {
  return invoke("linear_workflow_prepare", { action });
}

export async function linearWorkflowExecute(actionId: string, expectedHash: string): Promise<LinearActionReceipt> {
  return invoke("linear_workflow_execute", { actionId, expectedHash });
}

export async function linearWorkflowDiscard(actionId: string): Promise<void> {
  return invoke("linear_workflow_discard", { actionId });
}

export async function linearWorkflowReceipts(limit = 20): Promise<LinearActionReceipt[]> {
  return invoke("linear_workflow_receipts", { limit });
}

export async function sshWorkspaceStatus(): Promise<SshWorkspaceStatus> {
  return invoke("ssh_workspace_status");
}

export async function sshProfileSave(input: SshWorkspaceProfileInput): Promise<SshWorkspaceProfile> {
  return invoke("ssh_profile_save", { input });
}

export async function sshProfileArchive(profileId: string): Promise<void> {
  return invoke("ssh_profile_archive", { profileId });
}

export async function sshHostProbe(profileId: string): Promise<SshHostProbe> {
  return invoke("ssh_host_probe", { profileId });
}

export async function sshHostTrust(profileId: string, fingerprint: string): Promise<SshHostProbe> {
  return invoke("ssh_host_trust", { profileId, fingerprint });
}

export async function sshConnectionProbe(profileId: string): Promise<SshConnectionProbe> {
  return invoke("ssh_connection_probe", { profileId });
}

export async function sshRemoteDirectoryList(
  profileId: string,
  path: string,
): Promise<SshRemoteDirectory> {
  return invoke("ssh_remote_directory_list", { profileId, path });
}

export async function sshRemoteFileRead(profileId: string, path: string): Promise<SshRemoteFile> {
  return invoke("ssh_remote_file_read", { profileId, path });
}

export async function sshRemoteFileWritePrepare(
  input: SshRemoteFileWriteInput,
): Promise<SshPreparedFileWrite> {
  return invoke("ssh_remote_file_write_prepare", { input });
}

export async function sshRemoteFileWriteExecute(
  actionId: string,
  approvalHashValue: string,
): Promise<SshRemoteFileWriteReceipt> {
  return invoke("ssh_remote_file_write_execute", { actionId, approvalHashValue });
}

export async function sshTerminalLaunch(profileId: string): Promise<SshTerminalLaunch> {
  return invoke("ssh_terminal_launch", { profileId });
}

export async function sshTunnelStart(
  profileId: string,
  localPort: number,
  remotePort: number,
  autoReconnect = true,
  maxReconnectAttempts = 5,
): Promise<SshTunnelSummary> {
  return invoke("ssh_tunnel_start", {
    profileId,
    localPort,
    remotePort,
    autoReconnect,
    maxReconnectAttempts,
  });
}

export async function sshTunnelList(): Promise<SshTunnelSummary[]> {
  return invoke("ssh_tunnel_list");
}

export async function sshTunnelRetry(tunnelId: string): Promise<SshTunnelSummary> {
  return invoke("ssh_tunnel_retry", { tunnelId });
}

export async function sshTunnelStop(tunnelId: string): Promise<void> {
  return invoke("ssh_tunnel_stop", { tunnelId });
}

export async function sshRemoteWorktreePrepare(input: SshRemoteWorktreeInput): Promise<SshPreparedAction> {
  return invoke("ssh_remote_worktree_prepare", { input });
}

export async function sshRemoteWorktreeExecute(
  actionId: string,
  approvalHashValue: string,
): Promise<SshRemoteWorktreeReceipt> {
  return invoke("ssh_remote_worktree_execute", { actionId, approvalHashValue });
}

export async function providerUsageSnapshot(): Promise<ProviderUsageSnapshot> {
  return invoke("provider_usage_snapshot");
}

export async function providerSubscriptionUsage(
  provider: string,
): Promise<ProviderSubscriptionUsage | null> {
  return invoke("provider_subscription_usage", { provider });
}

export async function devServicesScan(workspace?: string | null): Promise<DevServicesSnapshot> {
  return invoke("dev_services_scan", { workspace: workspace?.trim() || null });
}

export async function devServiceStopPrepare(
  pid: number,
  port: number,
): Promise<DevServicePreparedStop> {
  return invoke("dev_service_stop_prepare", { input: { pid, port } });
}

export async function devServiceStopExecute(
  actionId: string,
  approvalHashValue: string,
): Promise<DevServiceStopReceipt> {
  return invoke("dev_service_stop_execute", { actionId, approvalHashValue });
}

export async function agentUndoChanges(cwd: string, patch: string): Promise<void> {
  return invoke("agent_undo_changes", { cwd, patch });
}

export async function agentWorktreePrepare(cwd: string, taskId: string): Promise<AgentWorktreeInfo> {
  return invoke("agent_worktree_prepare", { cwd, taskId });
}

export async function agentWorktreeAdopt(worktree: AgentWorktreeInfo): Promise<AgentWorktreeAdoptResult> {
  return invoke("agent_worktree_adopt", {
    sourceCwd: worktree.source_cwd,
    worktreeCwd: worktree.worktree_cwd,
    baseHead: worktree.head,
    expectedBranch: worktree.branch,
  });
}

export async function agentCliCommand(args: {
  provider: AgentProvider;
  args: string[];
  cwd?: string | null;
}): Promise<AgentCliCommandResult> {
  return invoke("agent_cli_command", {
    provider: args.provider,
    args: args.args,
    cwd: args.cwd || null,
  });
}

export async function academicResearchInstallClaudePlugin(): Promise<AcademicResearchPluginInstallResult> {
  return invoke("academic_research_install_claude_plugin");
}

export async function atelierSkillInstallPublicBundle(): Promise<SkillBundleInstallResult> {
  return invoke("atelier_skill_install_public_bundle");
}

export async function insaneSearchInstallGajecodeSkill(): Promise<SkillBundleInstallResult> {
  return invoke("insane_search_install_gajecode_skill");
}

export async function pluginSkillInstallStatus(): Promise<PluginSkillInstallStatusResult> {
  return invoke("plugin_skill_install_status");
}

export async function previewHealthCheck(url: string): Promise<PreviewCheckResult> {
  return invoke("preview_health_check", { url });
}

export async function previewServiceStart(args: {
  url: string;
  cwd?: string | null;
  command?: string | null;
  autoRestart?: boolean | null;
}): Promise<PreviewServiceStatus> {
  return invoke("preview_service_start", args);
}

export async function previewServiceStatus(url: string): Promise<PreviewServiceStatus> {
  return invoke("preview_service_status", { url });
}

export async function previewServiceStop(url: string): Promise<PreviewServiceStatus> {
  return invoke("preview_service_stop", { url });
}

export async function stellaProjectAnalysis(cwd?: string | null): Promise<StellaProjectAnalysis> {
  return invoke("stella_project_analysis", { cwd: cwd || null });
}

export async function stellaFactoryBootstrap(args: {
  cwd?: string | null;
  goal: string;
}): Promise<StellaFactoryBootstrapResult> {
  return invoke("stella_factory_bootstrap", {
    cwd: args.cwd || null,
    goal: args.goal,
  });
}

export async function stellaFactoryAutopilot(args: {
  cwd?: string | null;
  goal: string;
  maxCycles?: number | null;
}): Promise<StellaFactoryAutopilotResult> {
  return invoke("stella_factory_autopilot", {
    cwd: args.cwd || null,
    goal: args.goal,
    maxCycles: args.maxCycles || null,
  });
}

export async function stellaFactoryStatus(cwd?: string | null): Promise<StellaFactoryStatusResult> {
  return invoke("stella_factory_status", { cwd: cwd || null });
}

export async function stellaWorkspaceProbe(args: {
  cwd?: string | null;
  profile?: "fast" | "focused" | "full" | string | null;
}): Promise<StellaProbeResult> {
  return invoke("stella_workspace_probe", {
    cwd: args.cwd || null,
    profile: args.profile || null,
  });
}

export async function stellaRecordEvidence(args: {
  cwd?: string | null;
  title: string;
  body: string;
}): Promise<StellaEvidenceRecordResult> {
  return invoke("stella_record_evidence", {
    cwd: args.cwd || null,
    title: args.title,
    body: args.body,
  });
}

/** 클립보드 PNG 바이트를 임시파일로 저장하고 경로 반환 */
export async function clipboardSaveImage(pngBytes: Uint8Array): Promise<string> {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < pngBytes.length; i += chunkSize) {
    binary += String.fromCharCode(...pngBytes.subarray(i, i + chunkSize));
  }
  const b64 = btoa(binary);
  return invoke("clipboard_save_image", { pngBase64: b64 });
}

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}
export async function listDir(path: string): Promise<FsEntry[]> {
  return invoke("list_dir", { path });
}
export async function searchWorkspaceFiles(
  root: string,
  query: string,
  maxResults = 80,
): Promise<FsEntry[]> {
  return invoke("search_workspace_files", { root, query, maxResults });
}
export type AgentQuickOpenIndexKind = "branch" | "worktree" | "symbol";
export interface AgentQuickOpenIndexEntry {
  kind: AgentQuickOpenIndexKind;
  key: string;
  label: string;
  detail: string;
  path: string | null;
  line: number | null;
  branch: string | null;
  current: boolean;
}
export interface AgentQuickOpenIndexResult {
  root: string;
  entries: AgentQuickOpenIndexEntry[];
  truncated: boolean;
}
export async function agentQuickOpenIndex(
  cwd: string,
  query: string,
  maxResults = 40,
): Promise<AgentQuickOpenIndexResult> {
  return invoke("agent_quick_open_index", { cwd, query, maxResults });
}
export type AgentRichPreviewKind = "markdown" | "text" | "image" | "pdf" | "unsupported";
export interface AgentRichPreviewResult {
  root: string;
  path: string;
  relative_path: string;
  name: string;
  kind: AgentRichPreviewKind;
  mime: string;
  size_bytes: number;
  modified_unix_ms: number | null;
  text: string | null;
  data_base64: string | null;
  truncated: boolean;
  reason: string | null;
}
export async function agentRichPreview(root: string, path: string): Promise<AgentRichPreviewResult> {
  return invoke("agent_rich_preview", { root, path });
}
export interface AgentEditorSnapshot {
  root: string;
  path: string;
  exists: boolean;
  sizeBytes: number;
  modifiedUnixMs: number | null;
  contentSha256: string | null;
}
export interface AgentEditorWriteResult {
  written: boolean;
  conflict: boolean;
  snapshot: AgentEditorSnapshot;
}
export async function agentEditorSnapshot(root: string, path: string): Promise<AgentEditorSnapshot> {
  return invoke("agent_editor_snapshot", { root, path });
}
export async function agentEditorWrite(
  root: string,
  path: string,
  contents: string,
  expectedContentSha256: string | null,
): Promise<AgentEditorWriteResult> {
  return invoke("agent_editor_write", { root, path, contents, expectedContentSha256 });
}
export async function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}
export async function writeTextFile(root: string, path: string, contents: string): Promise<void> {
  return invoke("write_text_file", { root, path, contents });
}
export async function homeDir(): Promise<string> {
  return invoke("home_dir");
}
export async function commandExists(command: string): Promise<boolean> {
  return invoke("command_exists", { command });
}

/** 세션 로그 읽기. base64 string 반환. 없으면 빈 문자열. */
export async function sessionLogLoad(id: string): Promise<string> {
  return invoke("session_log_load", { id });
}
export async function sessionLogSnapshot(id: string): Promise<SessionLogSnapshot> {
  return invoke("session_log_snapshot", { id });
}
export async function sessionLogClear(id: string): Promise<void> {
  return invoke("session_log_clear", { id });
}

/** ~/Library/Application Support/Atelier/profiles.json 에서 프로필 JSON 읽기. */
export async function loadProfilesFile(): Promise<string> {
  return invoke("load_profiles");
}
/** 프로필 JSON을 앱 데이터 디렉토리에 쓰기. */
export async function saveProfilesFile(json: string): Promise<void> {
  return invoke("save_profiles", { json });
}


/** Tauri 런타임에서만 동작 — 브라우저 미리보기에선 null */
export const isTauri = (): boolean => "__TAURI_INTERNALS__" in window;

/**
 * 빌트인 design-engine 리소스 읽기. relpath 예: "philosophies/01-pentagram.md".
 * 번들 모드에서는 Atelier.app/Contents/Resources/resources/design-engine/ 하위,
 * dev 모드에서는 src-tauri/resources/design-engine/ 하위에서 검색.
 */
export async function readDesignResource(relpath: string): Promise<string> {
  return invoke("read_design_resource", { relpath });
}

/**
 * 디자인 산출물(HTML/마크다운 등)을 사용자 데이터 디렉토리에 저장.
 * 반환값은 절대 경로 — Preview iframe에 file:// 로 로드할 때 사용.
 */
export async function saveDesignArtifact(
  projectId: string,
  relpath: string,
  content: string,
): Promise<string> {
  return invoke("save_design_artifact", { projectId, relpath, content });
}

/** 디자인 프로젝트 폴더를 Finder에서 연다. 경로 반환. */
export async function openDesignProjectDir(projectId: string): Promise<string> {
  return invoke("open_design_project_dir", { projectId });
}

/** 디자인 프로젝트 폴더를 zip으로 묶어 ~/Downloads/atelier-<id>-<ts>.zip 생성 + Finder reveal. zip 절대경로 반환. */
export async function exportDesignProjectZip(projectId: string): Promise<string> {
  return invoke("export_design_project_zip", { projectId });
}

// ─────────────────────────────────────────────────────────────────────────
// 자격증명 (구독·API 키) — credentials.rs
// 키 자체는 OS keychain에만 저장. 프론트는 상태(boolean + 마스킹 표시) 만 받음.

export interface ProviderStatus {
  provider: string;
  cli_installed: boolean;
  oauth_logged_in: boolean;
  api_key_present: boolean;
  api_key_masked: string;
  supports_oauth: boolean;
  supports_api: boolean;
}

export async function providerStatus(provider: string): Promise<ProviderStatus> {
  return invoke("provider_status", { provider });
}

export async function providerSaveApiKey(provider: string, apiKey: string): Promise<void> {
  return invoke("provider_save_api_key", { provider, apiKey });
}

export async function providerClearCredentials(provider: string): Promise<void> {
  return invoke("provider_clear_credentials", { provider });
}

export interface ProviderLoginOauthResult {
  provider: string;
  command: string;
  started: boolean;
  completed: boolean;
  already_logged_in: boolean;
  browser_opened: boolean;
  login_url_detected: boolean;
  login_url?: string | null;
  diagnostic?: string | null;
  message: string;
}

export interface ProviderOauthLoginState {
  provider: string;
  active: boolean;
  browser_opened: boolean;
  login_url?: string | null;
  output: string;
  error?: string | null;
  updated_at_ms: number;
}

export interface ProviderBrowserProbeResult {
  provider: string;
  url: string;
  handoff: string;
  accepted: boolean;
  checked_at_ms: number;
}

/**
 * CLI 가 사용자 기본 브라우저로 OAuth(Google/Apple/GitHub 등 SNS) 진입.
 * 즉시 반환 — 사용자가 브라우저에서 로그인 완료할 때까지 폴링으로 status 재확인.
 */
export async function providerLoginOauth(provider: string, force = false): Promise<ProviderLoginOauthResult> {
  return invoke("provider_login_oauth", { provider, force });
}

export async function providerOauthLoginState(provider: string): Promise<ProviderOauthLoginState> {
  return invoke("provider_oauth_login_state", { provider });
}

export async function providerOauthBrowserProbe(provider: string): Promise<ProviderBrowserProbeResult> {
  return invoke("provider_oauth_browser_probe", { provider });
}

export async function providerOpenOauthLoginUrl(provider: string, url: string): Promise<void> {
  return invoke("provider_open_oauth_login_url", { provider, url });
}

export async function providerSubmitOauthCode(provider: string, code: string): Promise<void> {
  return invoke("provider_submit_oauth_code", { provider, code });
}

/** Claude/Codex/Hermes CLI 자동 설치. 백그라운드 실행, 즉시 반환. */
export async function providerInstallCli(provider: string): Promise<void> {
  return invoke("provider_install_cli", { provider });
}

export interface HermesUpdateStatus {
  installed: boolean;
  current_version: string | null;
  update_available: boolean;
  commits_behind: number | null;
  message: string | null;
}

export interface GajecodeUpdateStatus {
  installed: boolean;
  current_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  message: string | null;
}

/** Hermes CLI 의 GitHub 기반 업데이트 체크. `hermes --version` 출력의 "Update available" 라인을 파싱. */
export async function hermesCheckUpdate(): Promise<HermesUpdateStatus> {
  return invoke("hermes_check_update");
}

/** `hermes update` 백그라운드 실행. 즉시 반환. */
export async function hermesUpdate(): Promise<void> {
  return invoke("hermes_update");
}

export async function gajecodeCheckUpdate(): Promise<GajecodeUpdateStatus> {
  return invoke("gajecode_check_update");
}

export async function gajecodeUpdate(): Promise<void> {
  return invoke("gajecode_update");
}

// ─────────────────────────────────────────────────────────────────────────
// 버전된 로컬 제어 계약 — control_plane.rs

export interface AtelierControlRequest {
  schemaVersion: number;
  requestId: string;
  action: "task.dispatch" | "worktree.create" | "computer.use";
  source: string;
  createdAtUnixMs: number;
  workspace?: string | null;
  payload: Record<string, unknown>;
}

export interface AtelierControlReceipt {
  schemaVersion: number;
  requestId: string;
  action: string;
  status: "succeeded" | "failed" | "cancelled";
  createdAtUnixMs: number;
  finishedAtUnixMs: number;
  summary: string;
  detail?: unknown;
}

export async function controlRequestsPending(): Promise<AtelierControlRequest[]> {
  return invoke("control_requests_pending");
}

export async function controlRequestClaim(requestId: string): Promise<AtelierControlRequest> {
  return invoke("control_request_claim", { requestId });
}

export async function controlRequestComplete(
  requestId: string,
  status: AtelierControlReceipt["status"],
  summary: string,
  detail?: unknown,
): Promise<AtelierControlReceipt> {
  return invoke("control_request_complete", {
    requestId,
    status,
    summary,
    detail: detail ?? null,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 독립 자동화 작업 — automations.rs

export type AutomationSchedule =
  | { kind: "manual"; intervalMinutes?: never; localTime?: never }
  | { kind: "interval"; intervalMinutes: number; localTime?: never }
  | { kind: "daily"; intervalMinutes?: never; localTime: string };

export interface AutomationDefinition {
  schemaVersion: number;
  automationId: string;
  name: string;
  prompt: string;
  workspace: string;
  provider: AgentProvider;
  model?: string | null;
  effort?: string | null;
  permissionMode: Exclude<AgentPermissionMode, "full">;
  stellaMode: boolean;
  enabled: boolean;
  schedule: AutomationSchedule;
  missedRunGraceMinutes: number;
  createdAtUnixMs: number;
  updatedAtUnixMs: number;
  lastDispatchedAtUnixMs?: number | null;
  nextRunAtUnixMs?: number | null;
}

export interface AutomationRun {
  schemaVersion: number;
  runId: string;
  automationId: string;
  automationName: string;
  trigger: "manual" | "scheduled" | "missed";
  status: "queued" | "succeeded" | "failed" | "cancelled" | "skipped";
  requestId?: string | null;
  createdAtUnixMs: number;
  finishedAtUnixMs?: number | null;
  summary: string;
}

export interface AutomationSnapshot {
  schemaVersion: number;
  automations: AutomationDefinition[];
  runs: AutomationRun[];
  lastTickAtUnixMs?: number | null;
}

export interface AutomationUpsertInput {
  automationId?: string | null;
  name: string;
  prompt: string;
  workspace: string;
  provider: AgentProvider;
  model?: string | null;
  effort?: string | null;
  permissionMode: Exclude<AgentPermissionMode, "full">;
  stellaMode: boolean;
  enabled: boolean;
  schedule: AutomationSchedule;
  missedRunGraceMinutes: number;
}

export async function automationsSnapshot(): Promise<AutomationSnapshot> {
  return invoke("automations_snapshot");
}

export async function automationUpsert(
  input: AutomationUpsertInput,
): Promise<AutomationDefinition> {
  return invoke("automation_upsert", { input });
}

export async function automationSetEnabled(
  automationId: string,
  enabled: boolean,
): Promise<AutomationDefinition> {
  return invoke("automation_set_enabled", { automationId, enabled });
}

export async function automationRunNow(automationId: string): Promise<AutomationRun> {
  return invoke("automation_run_now", { automationId });
}

export async function automationsTick(): Promise<AutomationSnapshot> {
  return invoke("automations_tick");
}

// ─────────────────────────────────────────────────────────────────────────
// 모바일 원격 접근 — mobile_control.rs

export interface MobileServerStatus {
  running: boolean;
  port: number | null;
  allowLan: boolean;
  tls: boolean;
  certificateFingerprint: string | null;
  startedAtMs: number | null;
  baseUrls: string[];
}

export interface MobilePairing {
  pairingId: string;
  code: string;
  expiresAtMs: number;
  pairingUrls: string[];
}

export interface MobileDevice {
  deviceId: string;
  name: string;
  scopes: string[];
  createdAtMs: number;
  lastSeenAtMs: number | null;
  expiresAtMs: number;
  revokedAtMs: number | null;
}

export async function mobileControlServerStatus(): Promise<MobileServerStatus> {
  return invoke("mobile_control_server_status");
}

export async function mobileControlServerStart(
  allowLan: boolean,
  port: number | null = null,
): Promise<MobileServerStatus> {
  return invoke("mobile_control_server_start", { allowLan, port });
}

export async function mobileControlServerStop(): Promise<MobileServerStatus> {
  return invoke("mobile_control_server_stop");
}

export async function mobileControlPairingCreate(): Promise<MobilePairing> {
  return invoke("mobile_control_pairing_create");
}

export async function mobileControlPairingDiscard(pairingId: string): Promise<void> {
  return invoke("mobile_control_pairing_discard", { pairingId });
}

export async function mobileControlDevices(): Promise<MobileDevice[]> {
  return invoke("mobile_control_devices");
}

export async function mobileControlDeviceRevoke(deviceId: string): Promise<MobileDevice> {
  return invoke("mobile_control_device_revoke", { deviceId });
}

export async function mobileControlDeviceFollowupsSet(
  deviceId: string,
  enabled: boolean,
): Promise<MobileDevice> {
  return invoke("mobile_control_device_followups_set", { deviceId, enabled });
}

// ─────────────────────────────────────────────────────────────────────────
// 모바일 후속 지시 승인 — remote_followup.rs

export type RemoteFollowupStatus = "pending" | "approving" | "approved" | "rejected";

export interface RemoteFollowupProposal {
  schemaVersion: number;
  proposalId: string;
  deviceId: string;
  deviceName: string;
  prompt: string;
  createdAtMs: number;
  expiresAtMs: number;
  status: RemoteFollowupStatus;
  resolvedAtMs: number | null;
  controlRequestId: string | null;
}

export interface RemoteFollowupApprovalInput {
  proposalId: string;
  workspace: string;
  provider: "claude" | "codex" | "hermes" | "gajecode";
  model?: string | null;
  effort?: "low" | "medium" | "high" | "xhigh" | "ultra" | null;
  permissionMode?: "basic" | "auto" | "full" | null;
  stellaMode: boolean;
}

export interface RemoteFollowupPreparedAction {
  schemaVersion: number;
  actionId: string;
  actionHash: string;
  proposalId: string;
  preview: string;
  expiresAtMs: number;
}

export interface RemoteFollowupReceipt {
  schemaVersion: number;
  receiptId: string;
  actionId: string;
  actionHash: string;
  proposalId: string;
  controlRequestId: string;
  status: string;
  summary: string;
  createdAtMs: number;
  completedAtMs: number;
}

export async function remoteFollowupProposals(
  limit: number | null = 100,
): Promise<RemoteFollowupProposal[]> {
  return invoke("remote_followup_proposals", { limit });
}

export async function remoteFollowupPrepare(
  input: RemoteFollowupApprovalInput,
): Promise<RemoteFollowupPreparedAction> {
  return invoke("remote_followup_prepare", { input });
}

export async function remoteFollowupExecute(
  actionId: string,
  expectedHash: string,
): Promise<RemoteFollowupReceipt> {
  return invoke("remote_followup_execute", { actionId, expectedHash });
}

export async function remoteFollowupDiscard(actionId: string): Promise<void> {
  return invoke("remote_followup_discard", { actionId });
}

export async function remoteFollowupReject(
  proposalId: string,
): Promise<RemoteFollowupProposal> {
  return invoke("remote_followup_reject", { proposalId });
}

// ─────────────────────────────────────────────────────────────────────────
// 승인 기반 Computer Use — computer_use.rs

export type ComputerUseAction =
  | "atelier.focus"
  | "browser.open"
  | "preview.open"
  | "preview.screenshot"
  | "preview.snapshot"
  | "preview.click"
  | "preview.type"
  | "preview.key"
  | "preview.resize";

export interface ComputerUseStatus {
  enabled: boolean;
  preparedActions: number;
  receipts: number;
  supportedActions: ComputerUseAction[];
}

export interface ComputerUseInput {
  action: ComputerUseAction;
  target?: string | null;
  value?: string | null;
  host?: string | null;
  port?: number | null;
  windowLabel?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ComputerUsePreparedAction {
  schemaVersion: number;
  actionId: string;
  actionHash: string;
  action: ComputerUseAction;
  target: string | null;
  value: string | null;
  host: string | null;
  port: number | null;
  windowLabel: string | null;
  width: number | null;
  height: number | null;
  preview: string;
  expiresAtMs: number;
}

export interface ComputerUseReceipt {
  schemaVersion: number;
  receiptId: string;
  actionId: string;
  actionHash: string;
  action: ComputerUseAction;
  target: string | null;
  status: "succeeded" | "failed";
  summary: string;
  createdAtMs: number;
  completedAtMs: number;
}

export async function computerUseStatus(): Promise<ComputerUseStatus> {
  return invoke("computer_use_status");
}

export async function computerUsePrepared(): Promise<ComputerUsePreparedAction[]> {
  return invoke("computer_use_prepared");
}

export async function computerUseSetEnabled(enabled: boolean): Promise<ComputerUseStatus> {
  return invoke("computer_use_set_enabled", { enabled });
}

export async function computerUsePrepare(
  input: ComputerUseInput,
): Promise<ComputerUsePreparedAction> {
  return invoke("computer_use_prepare", { input });
}

export async function computerUseExecute(
  actionId: string,
  expectedHash: string,
): Promise<ComputerUseReceipt> {
  return invoke("computer_use_execute", { actionId, expectedHash });
}

export async function computerUseAuthorize(
  actionId: string,
  expectedHash: string,
): Promise<ComputerUsePreparedAction> {
  return invoke("computer_use_authorize", { actionId, expectedHash });
}

export async function computerUseComplete(
  actionId: string,
  expectedHash: string,
  succeeded: boolean,
  summary: string,
): Promise<ComputerUseReceipt> {
  return invoke("computer_use_complete", { actionId, expectedHash, succeeded, summary });
}

export async function computerUseDiscard(actionId: string): Promise<void> {
  return invoke("computer_use_discard", { actionId });
}

export async function computerUseReceipts(limit: number | null = 20): Promise<ComputerUseReceipt[]> {
  return invoke("computer_use_receipts", { limit });
}
