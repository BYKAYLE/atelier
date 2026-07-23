import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const manifest = "src-tauri/Cargo.toml";
const lockfile = "src-tauri/Cargo.lock";
const excludedVersion = "quick-xml@0.39.2";
const windowsPhysicalRunnerPreflightPath = "tools/windows-physical-runner-preflight.ps1";
const releaseTargets = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-msvc",
];

function readTextIfExists(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const credentialSource = readFileSync("src-tauri/src/credentials.rs", "utf8");
const agentSource = readFileSync("src-tauri/src/agent.rs", "utf8");
const agentModelsSource = readFileSync("src-tauri/src/agent_models.rs", "utf8");
const agentPreviewSource = readFileSync("src-tauri/src/agent_preview.rs", "utf8");
const lifecycleSource = readFileSync("src-tauri/src/agent_lifecycle.rs", "utf8");
const supervisorSource = readFileSync("src-tauri/src/pty_supervisor.rs", "utf8");
const worktreeSource = readFileSync("src-tauri/src/agent_worktree.rs", "utf8").split("#[cfg(test)]")[0];
const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");
const mainSource = readFileSync("src-tauri/src/main.rs", "utf8");
const cargoSource = readFileSync(manifest, "utf8");
const packageSource = readFileSync("package.json", "utf8");
const tauriConfigSource = readFileSync("src-tauri/tauri.conf.json", "utf8");
const readmeSource = readFileSync("README.md", "utf8");
const securityPolicySource = readFileSync("SECURITY.md", "utf8");
const supportSource = readFileSync("SUPPORT.md", "utf8");
const contributingSource = readFileSync("CONTRIBUTING.md", "utf8");
const bugReportTemplateSource = readFileSync(
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  "utf8",
);
const issueTemplateConfigSource = readFileSync(
  ".github/ISSUE_TEMPLATE/config.yml",
  "utf8",
);
const pullRequestTemplateSource = readFileSync(
  ".github/PULL_REQUEST_TEMPLATE.md",
  "utf8",
);
const releasePreflightSource = readFileSync("tools/release-preflight.mjs", "utf8");
const releasePreflightSmokeSource = readFileSync("tools/release-preflight-smoke.mjs", "utf8");
const releaseReadinessProbeSource = readFileSync("tools/release-readiness-probes.mjs", "utf8");
const storeBuildSource = readFileSync("tools/windows-store/build-msix.ps1", "utf8");
const windowsProviderSmokeSource = readFileSync("tools/windows-provider-smoke.ps1", "utf8");
const windowsConnectionsUiWitnessSource = readFileSync(
  "tools/windows-connections-ui-witness.mjs",
  "utf8",
);
const windowsPackageSmokeSource = readFileSync("tools/windows-package-smoke.ps1", "utf8");
const windowsPhysicalRunnerPreflightSource = readTextIfExists(
  windowsPhysicalRunnerPreflightPath,
);
const windowsProviderWorkflowSource = readFileSync(
  ".github/workflows/windows-provider-smoke.yml",
  "utf8",
);
const releaseWorkflowSource = readFileSync(".github/workflows/release.yml", "utf8");
const windowsPhysicalGateSource = readFileSync(
  ".github/workflows/windows-physical-release-gate.yml",
  "utf8",
);
const windowsRunnerDoctorWorkflowSource = readFileSync(
  ".github/workflows/windows-release-runner-doctor.yml",
  "utf8",
);
const publishReleaseWorkflowSource = readFileSync(
  ".github/workflows/publish-release.yml",
  "utf8",
);
const releaseCandidateGateSource = readFileSync(
  "tools/windows-release-candidate-gate.ps1",
  "utf8",
);
const windowsUpdaterCanarySource = readFileSync(
  "tools/windows-updater-canary.ps1",
  "utf8",
);
const physicalEvidenceSealSource = readFileSync(
  ".github/scripts/seal-physical-release-evidence.mjs",
  "utf8",
);
const releaseCandidateSealSource = readFileSync(
  ".github/scripts/seal-release-candidate.mjs",
  "utf8",
);
const releaseContractSource = readFileSync(
  ".github/scripts/release-contract.mjs",
  "utf8",
);
const releaseCandidateVerifySource = readFileSync(
  ".github/scripts/verify-release-candidate.mjs",
  "utf8",
);
const publishEvidenceSource = readFileSync(
  ".github/scripts/validate-publish-evidence.mjs",
  "utf8",
);
const windowsRunnerDoctorSmokeSource = readFileSync(
  "tools/windows-runner-doctor-smoke.mjs",
  "utf8",
);
const ptySupervisorSmokeSource = readFileSync("tools/pty-supervisor-smoke.mjs", "utf8");
const agentHarnessSource = readFileSync("tools/atelier-agent-harness.mjs", "utf8");
const connectionsSource = readFileSync("src/components/ConnectionsPanel.tsx", "utf8");
const oauthLoginFlowSource = readFileSync(
  "src/features/connections/oauthLoginFlow.ts",
  "utf8",
);
const oauthLoginFlowSmokeSource = readFileSync(
  "tools/oauth-login-flow-smoke.ts",
  "utf8",
);
const settingsSource = readFileSync("src/components/Settings.tsx", "utf8");
const agentWorkspaceSource = readFileSync("src/components/AgentWorkspace.tsx", "utf8");
const indexCssSource = readFileSync("src/index.css", "utf8");
const cliInstallersSource = readFileSync("src/lib/cliInstallers.ts", "utf8");
const agentPerformanceSmokeSource = readFileSync("tools/agent-workspace-performance-smoke.mjs", "utf8");
const sessionRunRegistrySource = readFileSync(
  "src/components/agent-runtime/sessionRunRegistry.ts",
  "utf8",
);
const sessionRunHookSource = readFileSync(
  "src/components/agent-runtime/useSessionRunRegistry.ts",
  "utf8",
);
const sessionRunSmokeSource = readFileSync("tools/session-run-registry-smoke.ts", "utf8");
const parallelAgentHarnessSource = readFileSync("tools/parallel-agent-harness.mjs", "utf8");
const processTreeSource = readFileSync(
  "src-tauri/crates/atelier-process-tree/src/lib.rs",
  "utf8",
);
const orcaFeatureGateSource = readFileSync("tools/orca-feature-release-gate.mjs", "utf8");
const rendererReceiptSource = readFileSync("src-tauri/src/runtime_receipt.rs", "utf8");
const rendererSmokeSource = readFileSync("tools/renderer-ready-smoke.sh", "utf8");
const macosReleaseEvidenceSource = readFileSync("tools/macos-release-evidence.sh", "utf8");
const terminalWorkspaceSource = readFileSync("src/components/Main.tsx", "utf8");
const terminalLayoutSource = readFileSync("src/lib/terminalLayout.ts", "utf8");
const diffReviewSource = readFileSync("src/lib/diffReview.ts", "utf8");
const reviewWorkflowSource = readFileSync("src/components/review-workflow/reviewWorkflow.ts", "utf8");
const reviewWorkflowViewSource = readFileSync("src/components/review-workflow/ReviewWorkflowStatus.tsx", "utf8");
const devScreenSource = readFileSync("src/lib/devScreen.ts", "utf8");
const devScreenPickerSmokeSource = readFileSync("tools/devscreen-element-picker-smoke.ts", "utf8");
const previewEvidenceSource = readFileSync("src/lib/previewEvidence.ts", "utf8");
const previewEvidenceSmokeSource = readFileSync("tools/preview-evidence-smoke.ts", "utf8");
const workflowSource = [
  releaseWorkflowSource,
  readFileSync(".github/workflows/windows-store.yml", "utf8"),
  windowsProviderWorkflowSource,
  windowsPhysicalGateSource,
  windowsRunnerDoctorWorkflowSource,
  publishReleaseWorkflowSource,
].join("\n");

function workflowJobSource(source, jobName) {
  const marker = `\n  ${jobName}:\n`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const bodyStart = start + marker.length;
  const remainder = source.slice(bodyStart);
  const nextJob = remainder.search(/\n  [A-Za-z0-9_-]+:\n/);
  return nextJob < 0 ? remainder : remainder.slice(0, nextJob);
}

const credentialBearingReleaseJobs = [
  "release-preflight",
  "build-macos",
  "build-windows-unsigned",
  "sign-windows",
  "seal-release-candidate",
];
const credentialBearingReleaseJobsAreProtected = credentialBearingReleaseJobs.every(
  (jobName) =>
    workflowJobSource(releaseWorkflowSource, jobName).includes(
      "environment: production-release",
    ),
);
const openLoginBrowserSource = credentialSource
  .split("fn open_login_url_in_browser", 2)[1]
  ?.split("fn watch_and_open_login_url", 1)[0] || "";
const unpinnedWorkflowUses = [...workflowSource.matchAll(/\buses:\s*[^@\s]+@([^\s#]+)/g)]
  .map((match) => match[1])
  .filter((ref) => !/^[0-9a-f]{40}$/i.test(ref));
const sourceInvariants = [
  {
    ok:
      !credentialSource.includes("curl -fsSL") &&
      !credentialSource.includes("Invoke-Expression") &&
      !credentialSource.includes("[scriptblock]::Create") &&
      !cliInstallersSource.includes("curl -fsSL") &&
      !windowsProviderSmokeSource.includes("Invoke-Expression") &&
      !windowsProviderSmokeSource.includes("[scriptblock]::Create") &&
      credentialSource.includes("@anthropic-ai/claude-code@2.1.217") &&
      credentialSource.includes("@openai/codex@0.145.0") &&
      credentialSource.includes("bun@1.3.14") &&
      credentialSource.includes("gajae-code@0.11.7") &&
      credentialSource.includes("3ef6bbd201263d354fd83ec55b3c306ded2eb72a") &&
      windowsProviderSmokeSource.includes("@anthropic-ai/claude-code@2.1.217") &&
      windowsProviderSmokeSource.includes("@openai/codex@0.145.0") &&
      credentialSource.includes("spawn_blocking") &&
      credentialSource.includes("capture_installer_stream") &&
      credentialSource.includes("CLI_INSTALL_CAPTURE_LIMIT") &&
      credentialSource.includes("installer exited successfully, but the CLI could not be verified"),
    message:
      "CLI installers must use pinned package-manager or immutable Git sources, drain bounded output, and wait for verified completion",
  },
  {
    ok: !credentialSource.includes("sync_gajecode_claude_subscription_credential"),
    message: "Gajae OAuth refresh tokens must not be copied into agent.db",
  },
  {
    ok:
      mainSource.includes('"--atelier-version-probe"') &&
      mainSource.includes('"--atelier-renderer-ready-probe"') &&
      mainSource.includes('"--atelier-updater-canary"') &&
      rendererReceiptSource.includes("process_is_alive") &&
      rendererReceiptSource.includes("receipt_path_for") &&
      rendererReceiptSource.includes("Sha256::digest") &&
      rendererReceiptSource.includes("renderer receipt belongs to a different executable") &&
      rendererSmokeSource.includes('receipt["pid"] == expected_pid') &&
      windowsProviderSmokeSource.includes("Test-AtelierInstalledRuntime") &&
      windowsProviderSmokeSource.includes("RequireAuthenticode") &&
      windowsProviderSmokeSource.includes("RequireSmartAppControlEvidence") &&
      windowsProviderSmokeSource.includes("Convert-SmartAppControlRegistryValue") &&
      windowsProviderSmokeSource.includes('1 { return "On" }') &&
      windowsProviderSmokeSource.includes('2 { return "Evaluation" }') &&
      windowsProviderSmokeSource.includes("SelfTest") &&
      windowsProviderSmokeSource.includes("InAppLogin") &&
      windowsProviderSmokeSource.includes("windows-connections-ui-witness.mjs") &&
      windowsProviderSmokeSource.includes("--remote-debugging-address=127.0.0.1") &&
      windowsConnectionsUiWitnessSource.includes('button[aria-label="Providers"]') &&
      windowsConnectionsUiWitnessSource.includes("data-provider-oauth-action") &&
      windowsConnectionsUiWitnessSource.includes("data-provider-oauth-connected") &&
      windowsConnectionsUiWitnessSource.includes("provider-login-modal") &&
      windowsConnectionsUiWitnessSource.includes("loginPendingStateObserved") &&
      windowsConnectionsUiWitnessSource.includes("authenticatedStateObserved") &&
      windowsPhysicalGateSource.includes("self-hosted") &&
      windowsPhysicalGateSource.includes("windows") &&
      windowsPhysicalGateSource.includes("-RestartApplication") &&
      windowsPhysicalGateSource.includes("-RequireRendererReadyEvidence") &&
      windowsPhysicalGateSource.includes("-RequireBrowserProcessEvidence") &&
      windowsPhysicalGateSource.includes("-RequireVisibleBrowserWindowEvidence") &&
      (windowsPhysicalGateSource.match(/-RequireSmartAppControlEvidence/g) || []).length >= 2 &&
      !windowsPhysicalGateSource.includes("require_smart_app_control_evidence:") &&
      windowsPhysicalGateSource.includes("-InAppLogin") &&
      windowsPhysicalGateSource.includes("node --check tools/windows-connections-ui-witness.mjs") &&
      windowsPhysicalGateSource.includes("-SelfTest") &&
      windowsPhysicalGateSource.includes("verify-release-candidate.mjs") &&
      windowsPhysicalGateSource.includes("windows-release-candidate-gate.ps1") &&
      windowsPhysicalGateSource.includes("windows-updater-canary.ps1") &&
      windowsPhysicalGateSource.includes("-VerifyInstalledOnly") &&
      windowsPhysicalGateSource.includes("-UpdaterEvidencePath") &&
      windowsPhysicalGateSource.indexOf("windows-updater-canary.ps1") <
        windowsPhysicalGateSource.indexOf("seal-physical-release-evidence.mjs") &&
      windowsPhysicalGateSource.includes("gh release download") &&
      releaseCandidateGateSource.includes("[Environment]::UserInteractive") &&
      releaseCandidateGateSource.includes("Get-AuthenticodeSignature") &&
      releaseCandidateGateSource.includes("--atelier-renderer-ready-probe") &&
      releaseCandidateGateSource.includes("upgradePersistenceProved") &&
      windowsUpdaterCanarySource.includes("--atelier-updater-canary") &&
      windowsUpdaterCanarySource.includes("signatureVerifiedByTauriUpdater") &&
      windowsUpdaterCanarySource.includes("updaterDrivenRelaunch") &&
      windowsUpdaterCanarySource.includes("upgradePersistenceProved"),
    message:
      "Physical Windows release gate must prove installed version, signature, restart, browser auth, and Smart App Control evidence",
  },
  {
    ok:
      windowsPhysicalRunnerPreflightSource.includes("schemaVersion = 1") &&
      windowsPhysicalRunnerPreflightSource.includes("githubRunId = $RunId") &&
      windowsPhysicalRunnerPreflightSource.includes("githubRunAttempt = $safeRunAttempt") &&
      windowsPhysicalRunnerPreflightSource.includes("name = $reportedRunnerName") &&
      windowsPhysicalRunnerPreflightSource.includes("os = $reportedRunnerOs") &&
      windowsPhysicalRunnerPreflightSource.includes("[Environment]::UserInteractive") &&
      windowsPhysicalRunnerPreflightSource.includes("$sessionId -eq 0") &&
      windowsPhysicalRunnerPreflightSource.includes("Get-Process -Name explorer") &&
      windowsPhysicalRunnerPreflightSource.includes("Get-Command $Name") &&
      windowsPhysicalRunnerPreflightSource.includes('@{ key = "gh"') &&
      windowsPhysicalRunnerPreflightSource.includes("7z.exe") &&
      windowsPhysicalRunnerPreflightSource.includes('@{ key = "bash"') &&
      windowsPhysicalRunnerPreflightSource.includes("pendingReboot") &&
      windowsPhysicalRunnerPreflightSource.includes("msiexec.exe") &&
      windowsPhysicalRunnerPreflightSource.includes("defaultBrowserProcessNames") &&
      windowsPhysicalRunnerPreflightSource.includes("providerInstallation") &&
      windowsPhysicalRunnerPreflightSource.includes("RUNNER_NAME is required") &&
      windowsPhysicalRunnerPreflightSource.includes("RUNNER_OS must be Windows") &&
      windowsPhysicalRunnerPreflightSource.includes("overall") &&
      windowsPhysicalRunnerPreflightSource.includes("blockers"),
    message:
      "Windows physical runner preflight must fail closed on desktop, tooling, installer, browser, and receipt identity prerequisites",
  },
  {
    ok:
      packageSource.includes('"smoke:windows-runner-doctor"') &&
      releaseWorkflowSource.includes("npm run smoke:windows-runner-doctor") &&
      windowsRunnerDoctorWorkflowSource.includes("workflow_dispatch:") &&
      windowsRunnerDoctorWorkflowSource.includes("runs-on: [self-hosted, windows, x64]") &&
      windowsRunnerDoctorWorkflowSource.includes('"-Doctor"') &&
      windowsRunnerDoctorWorkflowSource.includes('"-RequireGitHubRunner"') &&
      windowsRunnerDoctorWorkflowSource.includes('"-Strict"') &&
      windowsRunnerDoctorWorkflowSource.includes("if: always()") &&
      windowsRunnerDoctorWorkflowSource.includes("windows-runner-doctor.json") &&
      !windowsRunnerDoctorWorkflowSource.includes("gh release download") &&
      !windowsRunnerDoctorWorkflowSource.includes("--draft=false") &&
      windowsPhysicalRunnerPreflightSource.includes(
        'phase = if ($isDoctor) { "windows-runner-doctor" } else { "windows-runner-preflight" }',
      ) &&
      windowsPhysicalRunnerPreflightSource.includes("if (-not $isDoctor -or $RequireGitHubRunner)") &&
      windowsRunnerDoctorSmokeSource.includes("runner doctor must not download or publish release assets"),
    message:
      "Windows runner doctor must verify the interactive host before tagging while remaining distinct from candidate and publication evidence",
  },
  {
    ok:
      agentPreviewSource.includes("redact_preview_output_line") &&
      agentPreviewSource.includes("preview_output_redacts_credentials_before_storage_and_events") &&
      previewEvidenceSource.includes("redactPreviewEvidenceText") &&
      previewEvidenceSource.includes("sanitizePreviewEvidenceUrl") &&
      previewEvidenceSource.includes("serviceOutput?: string[]") &&
      previewEvidenceSource.includes('networkMethod?: "GET"') &&
      previewEvidenceSource.includes("MAX_EVIDENCE_LINES") &&
      previewEvidenceSmokeSource.includes("ordinary diagnostics must remain readable") &&
      previewEvidenceSmokeSource.includes("Authorization: Bearer") &&
      agentWorkspaceSource.includes("captureMessagePreviewEvidence") &&
      agentWorkspaceSource.includes("previewEvidence: evidence") &&
      agentWorkspaceSource.includes("Local preview evidence capture failed"),
    message:
      "Preview task evidence must remain local-only, bounded, URL-sanitized, and credential-redacted",
  },
  {
    ok:
      devScreenSource.includes("__ATELIER_PREVIEW_DIAGNOSTICS_V1__") &&
      devScreenSource.includes("performance.getEntriesByType('resource')") &&
      devScreenSource.includes('url.search = ""') &&
      devScreenSource.includes('url.hash = ""') &&
      devScreenSource.includes("redactDiagnosticText") &&
      !devScreenSource.includes("document.cookie") &&
      !devScreenSource.includes("localStorage") &&
      !devScreenSource.includes("sessionStorage") &&
      !devScreenSource.includes("response.text()") &&
      previewEvidenceSource.includes("browserErrorCount?: number") &&
      previewEvidenceSource.includes("consoleEvidence?: string[]") &&
      previewEvidenceSource.includes("networkEvidence?: string[]") &&
      agentWorkspaceSource.includes("devScreenMatchesPreview") &&
      agentWorkspaceSource.includes("Number(entry.status || 0) >= 400") &&
      agentWorkspaceSource.includes('completionIntent !== "interrupted" && completionIntent !== "stopped"') &&
      agentWorkspaceSource.includes("Preview URL, health/body, service stdout, DOM snapshots, and browser") &&
      agentWorkspaceSource.includes("const visualContext = [explicitlySelectedElementContext, compactContext]") &&
      !agentWorkspaceSource.includes("formatPreviewPromptContext") &&
      !agentWorkspaceSource.includes("formatDevScreenPromptContext") &&
      !agentWorkspaceSource.includes("const automaticCheck = await devScreenCheck"),
    message:
      "Preview browser diagnostics must be locally captured after completion and excluded from provider prompts",
  },
  {
    ok:
      packageSource.includes('"smoke:devscreen-picker"') &&
      (workflowSource.match(/npm run smoke:devscreen-picker/g) || []).length >= 3 &&
      devScreenSource.includes("__ATELIER_ELEMENT_PICKER_V1__") &&
      devScreenSource.includes("ELEMENT_PICKER_START_SCRIPT") &&
      devScreenSource.includes("ELEMENT_PICKER_POLL_SCRIPT") &&
      devScreenSource.includes("ELEMENT_PICKER_CANCEL_SCRIPT") &&
      devScreenSource.includes("DEV_SCREEN_STYLE_ALLOWLIST") &&
      devScreenSource.includes("normalizeDevScreenElementSelection") &&
      devScreenSource.includes("formatDevScreenElementSelectionPrompt") &&
      !devScreenSource.includes("element.value") &&
      !devScreenSource.includes(".outerHTML") &&
      agentWorkspaceSource.includes("runDevScreenElementPickerStart") &&
      agentWorkspaceSource.includes("cancelDevScreenElementPicker") &&
      agentWorkspaceSource.includes("devScreenSelectionAttached") &&
      agentWorkspaceSource.includes("devScreenElementSelection") &&
      agentWorkspaceSource.includes("elementSelection?: DevScreenElementSelection") &&
      agentWorkspaceSource.includes("elementSelection: normalizeDevScreenElementSelection(turn.elementSelection) || undefined") &&
      agentWorkspaceSource.includes("formatDevScreenElementSelectionPrompt") &&
      agentWorkspaceSource.includes("payload.elementSelection") &&
      devScreenPickerSmokeSource.includes("backgroundImage") &&
      devScreenPickerSmokeSource.includes("http://localhost:5173/settings"),
    message:
      "Preview element selection must stay localhost-only, bounded, user-controlled, credential-redacted, and release-tested",
  },
  {
    ok: !credentialSource.includes("sync_codex_auth_to_hermes"),
    message: "Codex refresh tokens must not be copied into Hermes auth.json",
  },
  {
    ok:
      agentSource.includes('cmd.env("ANTHROPIC_OAUTH_TOKEN", token)') &&
      agentSource.includes('cmd.env("CLAUDE_CODE_OAUTH_TOKEN", token)') &&
      credentialSource.includes("atelier-keychain-env-migration") &&
      credentialSource.includes('vec![vec!["setup-token"], vec!["auth", "login", "--claudeai"]]') &&
      credentialSource.includes("cache_claude_setup_token_from_output") &&
      !credentialSource.includes("sync_claude_credentials_file_to_app_cache") &&
      !credentialSource.includes("read_claude_oauth_credential_from_credentials_file") &&
      !credentialSource.includes("refresh_claude_subscription_oauth_credential") &&
      !credentialSource.includes("cache_claude_subscription_oauth_credential") &&
      !credentialSource.includes("https://api.anthropic.com/v1/oauth/token"),
    message: "Claude automation must use only the official setup-token bridge without refresh-token fan-in",
  },
  {
    ok:
      !credentialSource.includes("stage_codex_access_for_hermes") &&
      !credentialSource.includes("scrub_staged_codex_access_from_hermes") &&
      !credentialSource.includes('home_file(&[".hermes", "auth.json"])') &&
      !libSource.includes("scrub_staged_codex_access_from_hermes") &&
      !windowsProviderSmokeSource.includes("auth.json") &&
      windowsProviderSmokeSource.includes('"auth", "status", "openai-codex"'),
    message: "Atelier must not read, write, or delete Hermes provider authentication state",
  },
  {
    ok:
      libSource.includes("sensitive_home_path") &&
      libSource.includes("configured_hermes_roots") &&
      libSource.includes('std::env::var_os("HERMES_HOME")') &&
      libSource.includes('std::env::var_os("LOCALAPPDATA")') &&
      libSource.includes('basename.starts_with("auth.json.")') &&
      libSource.includes('relative.starts_with("mcp-tokens/")') &&
      libSource.includes('".codex/auth.json"') &&
      libSource.includes('".claude/.credentials.json"') &&
      libSource.includes('return Some("Hermes provider credential")'),
    message: "Generic file preview must block provider credential stores after canonicalization",
  },
  {
    ok:
      !credentialSource.includes("macos_keychain_service_password") &&
      !credentialSource.includes('find-generic-password", "-s", "Claude Code-credentials'),
    message: "Atelier must not read Claude Code's external macOS Keychain item",
  },
  {
    ok:
      credentialSource.includes('vec!["login", "--device-auth"]') &&
      credentialSource.includes(
        'const CODEX_DEVICE_AUTH_URL: &str = "https://auth.openai.com/codex/device"',
      ) &&
      credentialSource.includes("oauth_login_url_hint") &&
      credentialSource.includes("hinted_browser_opened"),
    message: "Codex subscription login must pre-open the validated cross-platform device authorization path",
  },
  {
    ok:
      windowsProviderSmokeSource.includes('"login", "--device-auth"') &&
      windowsProviderSmokeSource.includes('"setup-token"') &&
      windowsProviderSmokeSource.includes('ProcessStartInfo]::new()') &&
      windowsProviderSmokeSource.includes('Properties.Name -contains "ArgumentList"') &&
      windowsProviderSmokeSource.includes("EnvironmentVariables") &&
      windowsProviderSmokeSource.includes("Stop-CapturedProcessTree") &&
      windowsProviderSmokeSource.includes('System32\\taskkill.exe') &&
      windowsProviderSmokeSource.includes("Resolve-CapturedTextTask") &&
      windowsProviderSmokeSource.includes("Get-Command $Command -All") &&
      windowsProviderSmokeSource.includes('if ($extension -eq ".ps1")') &&
      windowsProviderSmokeSource.includes("Process-tree timeout self-test") &&
      windowsProviderSmokeSource.includes('Remove-Item Env:BROWSER') &&
      windowsProviderSmokeSource.includes("authenticated after device login") &&
      windowsProviderSmokeSource.includes("authenticated after setup-token login") &&
      windowsProviderSmokeSource.includes("did not prove Atelier's native browser handoff and URL fallback") &&
      windowsProviderSmokeSource.includes("Get-BrowserProcessRecords") &&
      windowsProviderSmokeSource.includes("Get-DefaultBrowserProcessNames") &&
      windowsProviderSmokeSource.includes("Wait-BrowserProcessEvidence") &&
      windowsProviderSmokeSource.includes("new-or-recent-process") &&
      windowsProviderSmokeSource.includes("-AllowExistingVisibleProcess:$false") &&
      windowsProviderSmokeSource.includes("defaultBrowserProcessNames") &&
      windowsProviderSmokeSource.includes("Browser observation mode") &&
      windowsProviderSmokeSource.includes("RequireBrowserProcessEvidence") &&
      windowsProviderSmokeSource.includes("RequireVisibleBrowserWindowEvidence") &&
      workflowSource.includes("-ProbeBrowserHandoff") &&
      workflowSource.includes("-RequireBrowserProcessEvidence") &&
      windowsProviderWorkflowSource.includes("timeout-minutes: 45") &&
      windowsProviderWorkflowSource.includes('$scriptArgs = @("-File", "tools/windows-provider-smoke.ps1", "-Strict")') &&
      windowsProviderSmokeSource.includes("authentication failed after login") &&
      windowsProviderSmokeSource.includes("Get-AppxPackage") &&
      windowsProviderSmokeSource.includes('Programs\\Atelier Agent\\Atelier.exe') &&
      !windowsProviderSmokeSource.includes('@("/C", "codex", "login")') &&
      !windowsProviderSmokeSource.includes('@("/C", "claude", "auth", "login"'),
    message: "Windows provider smoke must mirror device-auth/setup-token, support PowerShell 5.1, and strictly verify final auth",
  },
  {
    ok:
      credentialSource.includes("open_oauth_browser_probe") &&
      credentialSource.includes("provider_oauth_browser_probe") &&
      libSource.includes("run_oauth_browser_probe") &&
      mainSource.includes('"--atelier-oauth-browser-probe"') &&
      mainSource.includes('"--atelier-oauth-open-url"') &&
      mainSource.includes("run_oauth_browser_url") &&
      libSource.includes("run_oauth_browser_url") &&
      credentialSource.includes("open_oauth_browser_helper_url") &&
      connectionsSource.includes("providerOauthBrowserProbe") &&
      windowsProviderSmokeSource.includes('"Atelier native browser probe"') &&
      windowsProviderSmokeSource.includes('"--atelier-oauth-browser-probe", "codex"') &&
      windowsProviderSmokeSource.includes('"Atelier signed browser helper probe"') &&
      windowsProviderSmokeSource.includes('"--atelier-oauth-open-url", "https://auth.openai.com/codex/device"'),
    message: "Physical and in-app diagnostics must exercise Atelier's native browser handoff path",
  },
  {
    ok:
      libSource.includes("windows_smart_app_control_state") &&
      libSource.includes("VerifiedAndReputablePolicyState") &&
      libSource.includes("smart_app_control_state") &&
      settingsSource.includes("installInfo.smart_app_control_state") &&
      settingsSource.includes("installInfo.oauth_browser_handoff"),
    message: "Installed runtime diagnostics must expose read-only Smart App Control and OAuth handoff state",
  },
  {
    ok:
      lifecycleSource.includes("AgentLifecyclePhase::Cancelled") &&
      lifecycleSource.includes("if state.phase.is_terminal()"),
    message: "Agent lifecycle must preserve explicit cancellation and exactly-once terminal state",
  },
  {
    ok:
      packageSource.includes('"smoke:session-runs"') &&
      orcaFeatureGateSource.includes('"smoke:session-runs"') &&
      sessionRunRegistrySource.includes("registry[sessionId] !== turnId") &&
      sessionRunRegistrySource.includes('current === "stopped"') &&
      sessionRunHookSource.includes("busyTurnIdsRef.current = next") &&
      sessionRunSmokeSource.includes("independent sessions must run concurrently") &&
      sessionRunSmokeSource.includes("a stale finalizer must not clear the live turn") &&
      agentWorkspaceSource.includes("beginRunForSession(sessionId, turnId)") &&
      agentWorkspaceSource.includes("finishRunForSession(sessionId, turnId)") &&
      !agentWorkspaceSource.includes("interruptedTurnIdsRef") &&
      !agentWorkspaceSource.includes("stoppedTurnIdsRef"),
    message:
      "Session runs must remain concurrent across sessions, exact-turn finalized, cancellation-prioritized, and release-gated",
  },
  {
    ok:
      packageSource.includes('"harness:parallel-agent"') &&
      orcaFeatureGateSource.includes('"harness:parallel-agent"') &&
      cargoSource.includes('features = ["protocol-asset", "test"]') &&
      agentSource.includes("struct TestGajaeLaunchOverride") &&
      agentSource.includes("parallel_fixture_turns_isolate_cancel_and_reap_process_trees") &&
      cargoSource.includes('atelier-process-tree = { path = "crates/atelier-process-tree" }') &&
      agentSource.includes("terminate_process_tree as terminate_agent_pid") &&
      processTreeSource.includes("fn terminates_native_process_tree()") &&
      agentSource.includes('env("ATELIER_TEST_AGENT_REQUEST", provider_prompt)') &&
      parallelAgentHarnessSource.includes("session-run-registry-smoke.ts") &&
      parallelAgentHarnessSource.includes("agent-fleet-smoke.ts") &&
      parallelAgentHarnessSource.includes("agent_worktree::tests::") &&
      parallelAgentHarnessSource.includes("shared Windows process-tree runtime E2E") &&
      parallelAgentHarnessSource.includes("Windows Tauri adapter and worktree integration compile") &&
      parallelAgentHarnessSource.includes("externalProviderCalls: 0"),
    message:
      "Parallel agent releases must run the offline three-turn adapter, cancellation, event-isolation, process-tree, and worktree harness",
  },
  {
    ok:
      packageSource.includes('"smoke:terminal-layout"') &&
      (workflowSource.match(/npm run smoke:terminal-layout/g) || []).length >= 3 &&
      terminalWorkspaceSource.includes("async function splitActiveTerminal(direction: TerminalSplitDirection)") &&
      terminalWorkspaceSource.includes('setCodeLayout("grid")') &&
      terminalWorkspaceSource.includes('e.code === "Backslash"') &&
      terminalWorkspaceSource.includes('splitActiveTerminal("vertical")') &&
      terminalWorkspaceSource.includes('splitActiveTerminal("horizontal")') &&
      terminalWorkspaceSource.includes("updateTerminalSplitRatio") &&
      terminalWorkspaceSource.includes("terminalSplitDivider") &&
      terminalLayoutSource.includes("MIN_TERMINAL_SPLIT_RATIO") &&
      terminalLayoutSource.includes("MAX_TERMINAL_SPLIT_RATIO") &&
      terminalLayoutSource.includes("reconcileTerminalLayout") &&
      terminalLayoutSource.includes("parseTerminalLayout"),
    message: "Terminal workspace must preserve, restore, split, resize, and release-test its pane tree",
  },
  {
    ok:
      packageSource.includes('"smoke:agent-performance"') &&
      (workflowSource.match(/npm run smoke:agent-performance/g) || []).length >= 3 &&
      agentPerformanceSmokeSource.includes("elapsed-time updates must not rerender the entire workspace") &&
      agentWorkspaceSource.includes("const AgentActivityView = React.memo") &&
      !agentWorkspaceSource.includes("const [nowTickMs") &&
      agentWorkspaceSource.includes("atelier-transcript-message flex min-w-0 gap-3") &&
      indexCssSource.includes("content-visibility: auto"),
    message:
      "Agent workspace must keep keystrokes ref-backed, isolate elapsed-time ticks, and defer offscreen transcript rendering",
  },
  {
    ok:
      packageSource.includes('"smoke:diff-review"') &&
      (workflowSource.match(/npm run smoke:diff-review/g) || []).length >= 3 &&
      diffReviewSource.includes("parseUnifiedDiff") &&
      diffReviewSource.includes("normalizeReviewAnnotations") &&
      diffReviewSource.includes("reviewAnnotationMatchesLine") &&
      diffReviewSource.includes("formatReviewAnnotationsPrompt") &&
      agentWorkspaceSource.includes("reviewAnnotations?: ChangeReviewAnnotation[]") &&
      agentWorkspaceSource.includes("saveLineReview") &&
      agentWorkspaceSource.includes("sendLineReviews") &&
      agentWorkspaceSource.includes("atelier-diff-line"),
    message: "Change review must parse line numbers, persist bounded annotations, and release-test agent feedback",
  },
  {
    ok:
      packageSource.includes('"smoke:review-workflow"') &&
      (workflowSource.match(/npm run smoke:review-workflow/g) || []).length >= 3 &&
      reviewWorkflowSource.includes("RECEIPT_LIMIT") &&
      reviewWorkflowSource.includes("normalizeReviewDispatchContext") &&
      reviewWorkflowSource.includes("transitionReviewWorkflow") &&
      reviewWorkflowSource.includes("finalizeInterruptedReviewWorkflow") &&
      reviewWorkflowViewSource.includes("summary.pending === 0") &&
      agentWorkspaceSource.includes("reviewRequest?: ReviewDispatchContext") &&
      agentWorkspaceSource.includes("updateReviewWorkflowStatus"),
    message: "Line review dispatches must be bounded, restart-safe, lifecycle-linked, and release-tested",
  },
  {
    ok:
      libSource.includes('"atelier-quick-open"') &&
      libSource.includes('.accelerator("CmdOrCtrl+P")') &&
      libSource.includes('app.emit("atelier://quick-open", ())') &&
      /onQuickOpenRequested\((?:openQuickOpen|requestQuickOpen)\)/.test(agentWorkspaceSource),
    message:
      "Quick Open must retain both the native desktop accelerator path and the workspace event listener",
  },
  {
    ok:
      agentModelsSource.includes("codex_reasoning_levels") &&
      agentModelsSource.includes("codex_model_requires_multi_agent_v2") &&
      agentSource.includes('cmd.arg("--enable").arg("multi_agent_v2")') &&
      agentModelsSource.includes('"low" | "medium" | "high" | "xhigh" | "max" | "ultra"') &&
      agentHarnessSource.includes("requiresMultiAgentV2") &&
      agentHarnessSource.includes('"multi_agent_v2"'),
    message: "Codex adapters must map live model capabilities to native effort and collaboration runtime flags",
  },
  {
    ok:
      ptySupervisorSmokeSource.includes("parallelSessionCount = 3") &&
      ptySupervisorSmokeSource.includes("parallelReconnect: true") &&
      ptySupervisorSmokeSource.includes("did not survive reconnect"),
    message: "Release PTY smoke must prove multiple hidden sessions survive fresh-client reconnects",
  },
  {
    ok:
      supervisorSource.includes('TcpListener::bind(("127.0.0.1", 0))') &&
      supervisorSource.includes("token"),
    message: "Detached PTY supervisor must stay loopback-only and token authenticated",
  },
  {
    ok:
      !worktreeSource.includes("reset --hard") &&
      !worktreeSource.includes('arg("remove")') &&
      !worktreeSource.includes("rm -rf"),
    message: "Production worktree isolation must not delete, reset, or auto-remove user work",
  },
  {
    ok:
      worktreeSource.includes('env("GIT_INDEX_FILE", index)') &&
      worktreeSource.includes('canonical_git_common_dir(&source_root)? != canonical_git_common_dir(&candidate_root)?') &&
      worktreeSource.includes('&["apply", "--check", "--whitespace=nowarn", "-"]') &&
      worktreeSource.includes("save_adoption_receipt") &&
      !worktreeSource.includes('arg("merge")') &&
      !worktreeSource.includes('arg("commit")'),
    message:
      "Candidate adoption must use an isolated index, verify repository identity and conflicts, retain a receipt, and never auto-merge or commit",
  },
  {
    ok:
      !openLoginBrowserSource.includes('Command::new("cmd.exe")') &&
      credentialSource.includes("Launcher::LaunchUriAsync") &&
      credentialSource.includes("RoInitialize") &&
      credentialSource.includes("RO_INIT_SINGLETHREADED") &&
      credentialSource.includes('name("atelier-oauth-browser-winrt".into())') &&
      credentialSource.includes("ShellExecuteExW") &&
      credentialSource.includes("CoInitializeEx") &&
      credentialSource.includes("SEE_MASK_NOASYNC") &&
      credentialSource.includes('name("atelier-oauth-browser-sta".into())') &&
      credentialSource.includes("COINIT_APARTMENTTHREADED") &&
      credentialSource.indexOf("windows_runtime_launch_url(url)") <
        credentialSource.indexOf("windows_shell_execute_url(url)"),
    message: "Windows OAuth browser handoff must prefer WinRT Launcher, retain the COM STA ShellExecute fallback, and avoid cmd.exe URL interpretation",
  },
  {
    ok:
      credentialSource.includes('command.env_remove("BROWSER")') &&
      credentialSource.includes('cmd.env_remove("BROWSER")') &&
      credentialSource.includes('PathBuf::from("/usr/bin/open")') &&
      !credentialSource.includes('join("atelier-oauth-browser")') &&
      !credentialSource.includes('join("open-url.sh")'),
    message: "Windows OAuth must leave the provider browser unmodified while Unix uses trusted system launchers",
  },
  {
    ok: (() => {
      const handoff = connectionsSource
        .split("async function openExternalUrl", 2)[1]
        ?.split("export const ConnectionsPanel", 1)[0] || "";
      const nativeIndex = handoff.indexOf("await providerOpenOauthLoginUrl(provider, url)");
      const fallbackIndex = handoff.indexOf('@tauri-apps/plugin-shell');
      return nativeIndex >= 0
        && fallbackIndex > nativeIndex
        && handoff.includes("isAllowedOauthLoginUrl(provider, url)")
        && oauthLoginFlowSource.includes('parsed.protocol !== "https:"')
        && oauthLoginFlowSource.includes("parsed.username || parsed.password")
        && oauthLoginFlowSource.includes('host.endsWith(`.${root}`)')
        && oauthLoginFlowSource.includes('["claude.ai", "claude.com", "anthropic.com"]')
        && oauthLoginFlowSource.includes('["openai.com", "chatgpt.com"]')
        && oauthLoginFlowSmokeSource.includes('"http://auth.openai.com/codex/device"')
        && oauthLoginFlowSmokeSource.includes('"https://claude.ai.evil.example/login"')
        && oauthLoginFlowSmokeSource.includes('"https://user@example.com@openai.com/login"');
    })(),
    message: "Packaged OAuth browser handoff must validate provider HTTPS hosts, try native open first, then use only the trusted Tauri fallback",
  },
  {
    ok:
      cargoSource.includes("store-build = []") &&
      libSource.includes('#[cfg(not(feature = "store-build"))]') &&
      libSource.includes('github_updater_available: cfg!(not(feature = "store-build"))') &&
      storeBuildSource.includes("--features store-build") &&
      packageSource.includes("--features store-build --bundles msi"),
    message: "Microsoft Store builds must compile without the GitHub updater plugin",
  },
  {
    ok:
      connectionsSource.includes("openLoginUrlWithRetry") &&
      connectionsSource.includes("openingLoginUrlsRef") &&
      connectionsSource.includes("planOauthLoginUrlAttempt(") &&
      connectionsSource.includes("if (nextUrl && loginState.browser_opened)") &&
      connectionsSource.includes("if (result.browser_opened) openedLoginUrlsRef.current") &&
      connectionsSource.includes("else void openLoginUrlWithRetry") &&
      oauthLoginFlowSource.includes("OAUTH_LOGIN_RETRY_LIMIT = 3") &&
      oauthLoginFlowSource.includes("OAUTH_LOGIN_RETRY_COOLDOWN_MS = 2_000") &&
      oauthLoginFlowSource.includes("previous?.url === url") &&
      oauthLoginFlowSource.includes("if (!force && current.count >= OAUTH_LOGIN_RETRY_LIMIT)") &&
      oauthLoginFlowSmokeSource.includes('plan.reason, "cooldown"') &&
      oauthLoginFlowSmokeSource.includes(').reason,\n  "limit"') &&
      oauthLoginFlowSmokeSource.includes("const forced = planOauthLoginUrlAttempt") &&
      oauthLoginFlowSmokeSource.includes("const changed = planOauthLoginUrlAttempt"),
    message:
      "OAuth browser handoff must preserve native success, retry bounded failures, and prevent concurrent duplicate opens",
  },
  {
    ok: unpinnedWorkflowUses.length === 0,
    message: `Release workflow actions must be pinned to full commits (${unpinnedWorkflowUses.join(", ")})`,
  },
  {
    ok:
      !workflowSource.includes("legacy-peer-deps") &&
      (workflowSource.match(/\bnpm ci\b/g) || []).length >= 5,
    message: "Release workflows must install the locked npm dependency graph with npm ci",
  },
  {
    ok:
      packageSource.includes('"@microsoft/winappcli": "0.3.1"') &&
      storeBuildSource.includes('node_modules\\@microsoft\\winappcli\\dist\\cli.js') &&
      !storeBuildSource.includes("Get-Command winapp") &&
      !storeBuildSource.includes("npm install -g"),
    message:
      "Microsoft Store packaging must execute the exact repository-pinned winapp CLI instead of a mutable global installation",
  },
  {
    ok:
      (releaseWorkflowSource.match(/npm run gate:orca-features\n\s+npm run build/g) || [])
        .length === 2,
    message:
      "macOS and Windows release jobs must restore the full production bundle after restricted feature builds",
  },
  {
    ok:
      orcaFeatureGateSource.includes("finally {") &&
      orcaFeatureGateSource.includes("Restore full production frontend bundle") &&
      orcaFeatureGateSource.includes('VITE_ATELIER_FEATURES: ""'),
    message:
      "Orca feature gate must restore the full production frontend bundle after success or failure",
  },
  {
    ok:
      packageSource.includes('"smoke:updater-contract"') &&
      workflowSource.includes("npm run smoke:updater-contract"),
    message: "Release workflows must verify the signed Windows updater platform contract",
  },
  {
    ok:
      packageSource.includes('"release:preflight"') &&
      packageSource.includes('"release:readiness"') &&
      packageSource.includes('"release:readiness:strict"') &&
      packageSource.includes('"smoke:release-preflight"') &&
      releaseWorkflowSource.includes("npm run smoke:release-preflight") &&
      releaseWorkflowSource.includes("node tools/release-preflight.mjs") &&
      releaseWorkflowSource.includes('--tag "$GITHUB_REF_NAME"') &&
      releaseWorkflowSource.includes('--repository "$GITHUB_REPOSITORY"') &&
      releaseWorkflowSource.includes("--output release-preflight.json") &&
      releaseWorkflowSource.includes("name: release-source-preflight") &&
      releasePreflightSource.includes('"source-preflight"') &&
      releasePreflightSource.includes('"release-infrastructure-preflight"') &&
      releasePreflightSource.includes("RELEASE_CREDENTIAL_NAMES") &&
      releasePreflightSource.includes("store-updater-isolation") &&
      releasePreflightSource.includes("tracked-source-clean") &&
      releasePreflightSource.includes("--inspect-host") &&
      releasePreflightSource.includes("--inspect-github") &&
      releasePreflightSmokeSource.includes("source-preflight-passed") &&
      releasePreflightSmokeSource.includes("release-infrastructure-preflight-passed") &&
      releaseReadinessProbeSource.includes("REQUIRED_REPOSITORY_SECRET_NAMES") &&
      releaseReadinessProbeSource.includes("macos-developer-id-identity") &&
      releaseReadinessProbeSource.includes("github-production-reviewer") &&
      releaseReadinessProbeSource.includes("github-windows-runner-online") &&
      !releaseReadinessProbeSource.includes("secret.value"),
    message:
      "Local and CI release preflight must share one redacted evaluator and inspect external release infrastructure",
  },
  {
    ok:
      !releaseWorkflowSource.includes("workflow_dispatch:") &&
      releaseWorkflowSource.includes('tags:\n      - "v*"') &&
      releaseWorkflowSource.includes("group: release-${{ github.ref_name }}") &&
      releaseWorkflowSource.includes("release-preflight:") &&
      credentialBearingReleaseJobsAreProtected &&
      releaseWorkflowSource.includes("git merge-base --is-ancestor") &&
      releaseWorkflowSource.includes('test "$RELEASE_OWNER/$RELEASE_REPO" = "$GITHUB_REPOSITORY"') &&
      (releaseWorkflowSource.match(/needs: release-preflight/g) || []).length === 2 &&
      releaseWorkflowSource.includes("releaseDraft: true") &&
      !releaseWorkflowSource.includes("releaseDraft: false") &&
      releaseWorkflowSource.includes("seal-release-candidate.mjs") &&
      releaseWorkflowSource.includes("release-manifest.json") &&
      releaseContractSource.includes("assertExactReleaseAssetUrl") &&
      releaseContractSource.includes('url.hostname !== "github.com"') &&
      releaseContractSource.includes("Release asset URL mismatch") &&
      releaseCandidateSealSource.includes("schemaVersion: 2") &&
      releaseCandidateSealSource.includes("releaseRepository") &&
      releaseCandidateSealSource.includes("macosEvidence") &&
      releaseCandidateSealSource.includes("Object.entries(latest.platforms)") &&
      releaseCandidateSealSource.includes("releaseAssetNameFromUrl(entry.url)") &&
      releaseCandidateSealSource.includes("platformAssets[platform] = assetName") &&
      releaseCandidateSealSource.includes('status: "signed-draft-candidate"') &&
      releaseCandidateSealSource.includes('releaseChannel: "github-draft"') &&
      releaseCandidateVerifySource.includes("manifest.schemaVersion !== 2") &&
      releaseCandidateVerifySource.includes("manifest.releaseRepository !== releaseRepository") &&
      releaseCandidateVerifySource.includes("const metadataPlatforms = Object.keys(latest.platforms).sort()") &&
      releaseCandidateVerifySource.includes("const sealedPlatforms = Object.keys(manifest.platformAssets ?? {}).sort()") &&
      releaseCandidateVerifySource.includes("for (const platform of metadataPlatforms)") &&
      releaseCandidateVerifySource.includes("releaseAssetNameFromUrl(entry.url)") &&
      releaseCandidateVerifySource.includes('manifest.status !== "signed-draft-candidate"') &&
      releaseCandidateVerifySource.includes("signature changed after sealing"),
    message:
      "Credential-bearing tag jobs must require protected approval and remain private drafts until the complete signed candidate manifest is sealed",
  },
  {
    ok:
      publishReleaseWorkflowSource.includes("workflow_dispatch:") &&
      publishReleaseWorkflowSource.includes("environment: production-release") &&
      publishReleaseWorkflowSource.includes('test "$APPROVAL" = "PUBLISH $RELEASE_TAG"') &&
      publishReleaseWorkflowSource.includes("validate-publish-evidence.mjs") &&
      publishReleaseWorkflowSource.includes("physical_gate_run_id") &&
      publishReleaseWorkflowSource.includes("windows-physical-release-gate.yml") &&
      publishReleaseWorkflowSource.includes("run.head_sha") &&
      publishReleaseWorkflowSource.includes("run.run_attempt") &&
      publishReleaseWorkflowSource.includes("/jobs?per_page=100") &&
      publishReleaseWorkflowSource.includes("job.runner_name") &&
      publishReleaseWorkflowSource.includes("job.labels") &&
      publishReleaseWorkflowSource.includes("PHYSICAL_GATE_RUNNER_NAME") &&
      !publishReleaseWorkflowSource.includes("require_smart_app_control_evidence:") &&
      publishReleaseWorkflowSource.includes("final-candidate-assets") &&
      publishReleaseWorkflowSource.includes("CANDIDATE_MANIFEST_SHA") &&
      publishReleaseWorkflowSource.includes('--repo "$RELEASE_OWNER/$RELEASE_REPO"') &&
      publishReleaseWorkflowSource.includes("--draft=false") &&
      (workflowSource.match(/--draft=false/g) || []).length === 1 &&
      publishEvidenceSource.includes("upgradePersistenceProved") &&
      publishEvidenceSource.includes("visibleWindow") &&
      publishEvidenceSource.includes("claudeAuthOk") &&
      publishEvidenceSource.includes("codexAuthOk") &&
      publishEvidenceSource.includes("PHYSICAL_GATE_RUN_ID") &&
      publishEvidenceSource.includes("PHYSICAL_GATE_RUN_ATTEMPT") &&
      publishEvidenceSource.includes("PHYSICAL_GATE_RUNNER_NAME") &&
      publishEvidenceSource.includes("githubRunAttempt") &&
      publishEvidenceSource.includes("candidate runner name") &&
      publishEvidenceSource.includes("package runner name") &&
      publishEvidenceSource.includes("provider runner name") &&
      publishEvidenceSource.includes("windows-runner-preflight.json") &&
      publishEvidenceSource.includes("expected exactly one Windows runner preflight receipt") &&
      publishEvidenceSource.includes("expected exactly one Windows provider receipt") &&
      publishEvidenceSource.includes("expected exactly one Windows in-app login receipt") &&
      publishEvidenceSource.includes("provider embedded in-app login receipt") &&
      publishEvidenceSource.includes("loginPendingStateObserved") &&
      publishEvidenceSource.includes("authenticatedStateObserved") &&
      publishEvidenceSource.includes("package GitHub run ID") &&
      publishEvidenceSource.includes('["nsis", nsisAsset]') &&
      publishEvidenceSource.includes("${kind} package hash") &&
      publishEvidenceSource.includes("provider/candidate installed executable path") &&
      publishEvidenceSource.includes("provider/candidate installed executable hash") &&
      publishEvidenceSource.includes("expected exactly one Windows updater canary receipt") &&
      publishEvidenceSource.includes("Tauri updater signature verification was not proved") &&
      publishEvidenceSource.includes("updater-driven relaunch was not proved") &&
      publishEvidenceSource.includes("updater/candidate installed executable path") &&
      publishEvidenceSource.includes("updater/candidate installed executable hash") &&
      publishEvidenceSource.includes("const requireSmartAppControl = true") &&
      physicalEvidenceSealSource.includes("windows-updater-canary.json") &&
      physicalEvidenceSealSource.includes("updater: receipt(updaterPath)") &&
      physicalEvidenceSealSource.includes("atelier-in-app-login-") &&
      physicalEvidenceSealSource.includes("inAppLogin: receipt(inAppLoginPath)") &&
      physicalEvidenceSealSource.includes("provider receipt does not embed the exact in-app login receipt") &&
      publishEvidenceSource.includes(
        'assertEqual(manifest.releaseRepository, releaseRepository.slug, "release manifest repository")',
      ),
    message:
      "Only the approval-gated publisher may make a release public after exact physical evidence validation",
  },
  {
    ok:
      releaseWorkflowSource.includes("TAURI_SIGNING_PRIVATE_KEY") &&
      releaseWorkflowSource.includes("TAURI_SIGNING_PRIVATE_KEY_PASSWORD") &&
      releaseWorkflowSource.includes("tools/macos-release-evidence.sh") &&
      releaseWorkflowSource.includes("macos-release-evidence.json") &&
      macosReleaseEvidenceSource.includes("codesign --verify --deep --strict") &&
      macosReleaseEvidenceSource.includes("Authority=Developer ID Application:") &&
      macosReleaseEvidenceSource.includes("spctl --assess --type execute") &&
      macosReleaseEvidenceSource.includes("spctl --assess --type open") &&
      macosReleaseEvidenceSource.includes("hdiutil attach") &&
      macosReleaseEvidenceSource.includes("tar -xzf") &&
      macosReleaseEvidenceSource.includes('tools/renderer-ready-smoke.sh" "$BUILT_APP"') &&
      (macosReleaseEvidenceSource.match(/xcrun stapler validate/g) || []).length >= 2 &&
      releaseCandidateSealSource.includes("macosEvidence.artifacts?.updater?.embeddedApp") &&
      releaseCandidateSealSource.includes("macosEvidence.consistency?.executableHashesMatch") &&
      releaseCandidateSealSource.includes("new Set(executableHashes).size !== 1") &&
      releaseCandidateSealSource.includes("macOS evidence does not bind one Developer ID Application team") &&
      releaseCandidateSealSource.includes("app?.gatekeeperAccepted !== true") &&
      releaseCandidateSealSource.includes("app?.notarizationStapled !== true"),
    message:
      "macOS candidates must prove updater signing, Developer ID, Gatekeeper, and stapled notarization receipts",
  },
  {
    ok:
      windowsPhysicalGateSource.includes('RELEASE_OWNER: ${{ vars.RELEASE_OWNER') &&
      windowsPhysicalGateSource.includes('"-RunId", $env:GITHUB_RUN_ID') &&
      windowsPhysicalGateSource.includes('GITHUB_RUN_ATTEMPT') &&
      windowsPhysicalGateSource.includes("windows-physical-runner-preflight.ps1") &&
      windowsPhysicalGateSource.indexOf("windows-physical-runner-preflight.ps1") <
        windowsPhysicalGateSource.indexOf("gh release download") &&
      windowsPhysicalGateSource.indexOf("windows-updater-canary.ps1") <
        windowsPhysicalGateSource.indexOf("windows-provider-smoke.ps1") &&
      windowsPhysicalGateSource.includes("artifacts/windows-runner-preflight") &&
      windowsPhysicalGateSource.includes("artifacts/windows-updater-canary/*") &&
      windowsPhysicalGateSource.includes("Upload physical gate evidence") &&
      windowsPhysicalGateSource.includes('"-Install",') &&
      windowsPhysicalGateSource.includes('"-InAppLogin",') &&
      windowsPhysicalGateSource.includes('"-LogDir", "artifacts/windows-provider-current"') &&
      windowsPhysicalGateSource.includes("windows-package-smoke.json") &&
      !windowsPhysicalGateSource.includes("collect-windows-provider-evidence.ps1") &&
      releaseCandidateGateSource.includes("githubRunId = $RunId") &&
      releaseCandidateGateSource.includes("githubRunAttempt = [int]$RunAttempt") &&
      releaseCandidateGateSource.includes("runnerName = [string]$env:RUNNER_NAME") &&
      releaseCandidateGateSource.includes('installationPath = if ($VerifyInstalledOnly) { "in-app-updater" } else { "direct-msi" }') &&
      releaseCandidateGateSource.includes("signatureVerifiedByTauriUpdater") &&
      releaseCandidateGateSource.includes("updaterDrivenRelaunch") &&
      windowsProviderSmokeSource.includes("githubRunId = $RunId") &&
      windowsProviderSmokeSource.includes("githubRunAttempt = if") &&
      windowsProviderSmokeSource.includes("runnerName = if") &&
      windowsPackageSmokeSource.includes("githubRunAttempt = [int]$RunAttempt") &&
      windowsPackageSmokeSource.includes("runnerName = [string]$env:RUNNER_NAME") &&
      windowsPackageSmokeSource.includes("Find-7Zip") &&
      windowsPackageSmokeSource.includes('Assert-AtelierPayload -Root $extractRoot -Kind "NSIS"'),
    message:
      "Windows publication evidence must preflight the runner before candidate download, upload the receipt, bind GitHub run ID and attempt, and inspect signed MSI and NSIS payloads",
  },
  {
    ok:
      packageSource.includes('"smoke:release-candidate"') &&
      packageSource.includes('"smoke:publish-evidence"') &&
      (releaseWorkflowSource.match(/npm run smoke:release-candidate/g) || []).length >= 2 &&
      (releaseWorkflowSource.match(/npm run smoke:publish-evidence/g) || []).length >= 2,
    message: "macOS and Windows release gates must test candidate sealing and publication evidence",
  },
  {
    ok:
      readmeSource.includes("[SECURITY.md](SECURITY.md)") &&
      readmeSource.includes("[SUPPORT.md](SUPPORT.md)") &&
      readmeSource.includes("[CONTRIBUTING.md](CONTRIBUTING.md)") &&
      securityPolicySource.includes("latest non-draft release") &&
      securityPolicySource.includes("indra850@gmail.com") &&
      securityPolicySource.includes("Do not disclose credentials") &&
      supportSource.includes("GitHub Releases page") &&
      supportSource.includes("remove API keys, tokens") &&
      supportSource.includes("does not transmit the report automatically") &&
      settingsSource.includes("template: \"bug_report.yml\"") &&
      !settingsSource.includes("formsubmit.co") &&
      !settingsSource.includes("BUG_REPORT_ENDPOINT") &&
      !tauriConfigSource.includes("formsubmit.co") &&
      contributingSource.includes("A successful source build is not proof") &&
      contributingSource.includes("Do not delete databases or user data") &&
      bugReportTemplateSource.includes("id: install-channel") &&
      bugReportTemplateSource.includes("id: operating-system") &&
      bugReportTemplateSource.includes("id: reproduction") &&
      bugReportTemplateSource.includes("I removed credentials") &&
      issueTemplateConfigSource.includes("blank_issues_enabled: false") &&
      issueTemplateConfigSource.includes("mailto:indra850@gmail.com") &&
      pullRequestTemplateSource.includes("## Truth Surfaces") &&
      pullRequestTemplateSource.includes("No database or user-data deletion"),
    message:
      "Public GitHub releases must expose security, support, contribution, issue, and pull-request safety contracts",
  },
];
for (const invariant of sourceInvariants) {
  if (!invariant.ok) {
    console.error(`Release credential boundary failed: ${invariant.message}`);
    process.exit(1);
  }
}
console.log("release credential boundary check: provider-owned auth with setup-token-only automation bridge");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
}

for (const target of releaseTargets) {
  const result = run(
    "cargo",
    ["tree", "--manifest-path", manifest, "--target", target, "-i", excludedVersion],
    { capture: true },
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (/^quick-xml v0\.39\.2/m.test(output)) {
    console.error(`Blocked vulnerable dependency is present in ${target}:\n${output}`);
    process.exit(1);
  }
  console.log(`release dependency check: ${target} does not include ${excludedVersion}`);
}

// RustSec 2026-0194/0195 remain only in wayland-scanner's Linux build path.
// The target checks above must pass before those two lockfile-only findings are ignored.
const audit = run("cargo", [
  "audit",
  "--file",
  lockfile,
  "--ignore",
  "RUSTSEC-2026-0194",
  "--ignore",
  "RUSTSEC-2026-0195",
  "--json",
], { capture: true });
if (audit.status !== 0) {
  process.stderr.write(audit.stderr || audit.stdout || "cargo audit failed\n");
  process.exit(audit.status ?? 1);
}

const report = JSON.parse(audit.stdout);
const warningCounts = Object.fromEntries(
  Object.entries(report.warnings || {}).map(([name, entries]) => [name, entries.length]),
);
console.log(`RustSec release audit: 0 vulnerabilities (${JSON.stringify(warningCounts)} upstream warnings)`);
