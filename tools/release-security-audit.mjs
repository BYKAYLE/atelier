import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function validateReleaseWorkflowPublicationGate(workflowText) {
  if (!workflowText.includes("build-macos:") || !workflowText.includes("sign-windows:")) {
    return {
      ok: false,
      message: "Release workflow must retain both macOS artifact creation and Windows signing jobs",
    };
  }

  const macosUploadIndex = workflowText.indexOf("- name: Build and upload macOS bundle");
  if (macosUploadIndex < 0) {
    return {
      ok: false,
      message: "Release workflow must upload macOS assets before Windows publication gates run",
    };
  }

  const macosUploadBlock = workflowText.slice(
    macosUploadIndex,
    workflowText.indexOf("\n  build-windows-unsigned:", macosUploadIndex) >= 0
      ? workflowText.indexOf("\n  build-windows-unsigned:", macosUploadIndex)
      : workflowText.length,
  );
  if (!macosUploadBlock.includes("releaseDraft: true")) {
    return {
      ok: false,
      message: "Release workflow must create the GitHub release as a draft during macOS artifact upload",
    };
  }
  if (macosUploadBlock.includes("releaseDraft: false")) {
    return {
      ok: false,
      message: "Release workflow must not publish the GitHub release from the macOS artifact job",
    };
  }

  if (/gh\s+release\s+create\b/.test(workflowText)) {
    return {
      ok: false,
      message: "Release workflow must not create an additional GitHub release outside the draft macOS upload path",
    };
  }

  const signWindowsIndex = workflowText.indexOf("\n  sign-windows:");
  const signWindowsBlock = signWindowsIndex >= 0 ? workflowText.slice(signWindowsIndex) : "";
  const publishMatches = [...workflowText.matchAll(/gh\s+release\s+edit\b[\s\S]*?--draft=false/g)];
  if (publishMatches.length !== 1) {
    return {
      ok: false,
      message: "Release workflow must publish exactly one draft release after the Windows gates finish",
    };
  }

  const publishIndex = signWindowsBlock.search(/gh\s+release\s+edit\b[\s\S]*?--draft=false/);
  if (publishIndex < 0) {
    return {
      ok: false,
      message: "Release workflow must publish the draft release from the Windows signing job",
    };
  }

  const uploadAssetsIndex = signWindowsBlock.indexOf("gh release upload $env:GITHUB_REF_NAME");
  const mergeUpdaterIndex = signWindowsBlock.indexOf("node .github/scripts/update-tauri-latest-json.mjs");
  const validateUpdaterIndex = signWindowsBlock.indexOf("windows-x86_64 must point to MSI for legacy updater compatibility");
  if (uploadAssetsIndex < 0 || mergeUpdaterIndex < 0 || validateUpdaterIndex < 0) {
    return {
      ok: false,
      message: "Release workflow must merge and validate the Windows updater manifest before publishing",
    };
  }
  if (!(mergeUpdaterIndex < validateUpdaterIndex && validateUpdaterIndex < uploadAssetsIndex && uploadAssetsIndex < publishIndex)) {
    return {
      ok: false,
      message: "Release workflow must publish only after Windows manifest merge, MSI validation, and asset upload succeed",
    };
  }

  return { ok: true };
}

if (process.env.RELEASE_SECURITY_AUDIT_TEST_MODE === "publication-gate") {
  const fixturePath = process.env.RELEASE_SECURITY_AUDIT_WORKFLOW_FIXTURE;
  if (!fixturePath) {
    console.error("Missing RELEASE_SECURITY_AUDIT_WORKFLOW_FIXTURE for publication-gate test mode");
    process.exit(1);
  }
  const result = validateReleaseWorkflowPublicationGate(readFileSync(fixturePath, "utf8"));
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
  console.log("publication gate fixture passed");
  process.exit(0);
}

const manifest = "src-tauri/Cargo.toml";
const lockfile = "src-tauri/Cargo.lock";
const excludedVersion = "quick-xml@0.39.2";
const releaseTargets = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-msvc",
];

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
const storeBuildSource = readFileSync("tools/windows-store/build-msix.ps1", "utf8");
const windowsProviderSmokeSource = readFileSync("tools/windows-provider-smoke.ps1", "utf8");
const windowsProviderWorkflowSource = readFileSync(
  ".github/workflows/windows-provider-smoke.yml",
  "utf8",
);
const windowsPhysicalGateSource = readFileSync(
  ".github/workflows/windows-physical-release-gate.yml",
  "utf8",
);
const ptySupervisorSmokeSource = readFileSync("tools/pty-supervisor-smoke.mjs", "utf8");
const agentHarnessSource = readFileSync("tools/atelier-agent-harness.mjs", "utf8");
const connectionsSource = readFileSync("src/components/ConnectionsPanel.tsx", "utf8");
const settingsSource = readFileSync("src/components/Settings.tsx", "utf8");
const agentWorkspaceSource = readFileSync("src/components/AgentWorkspace.tsx", "utf8");
const indexCssSource = readFileSync("src/index.css", "utf8");
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
const orcaFeatureGateSource = readFileSync("tools/orca-feature-release-gate.mjs", "utf8");
const rendererReceiptSource = readFileSync("src-tauri/src/runtime_receipt.rs", "utf8");
const rendererSmokeSource = readFileSync("tools/renderer-ready-smoke.sh", "utf8");
const terminalWorkspaceSource = readFileSync("src/components/Main.tsx", "utf8");
const terminalLayoutSource = readFileSync("src/lib/terminalLayout.ts", "utf8");
const diffReviewSource = readFileSync("src/lib/diffReview.ts", "utf8");
const reviewWorkflowSource = readFileSync("src/components/review-workflow/reviewWorkflow.ts", "utf8");
const reviewWorkflowViewSource = readFileSync("src/components/review-workflow/ReviewWorkflowStatus.tsx", "utf8");
const devScreenSource = readFileSync("src/lib/devScreen.ts", "utf8");
const devScreenPickerSmokeSource = readFileSync("tools/devscreen-element-picker-smoke.ts", "utf8");
const releaseWorkflowSource = readFileSync(".github/workflows/release.yml", "utf8");
const workflowSource = [
  releaseWorkflowSource,
  readFileSync(".github/workflows/windows-store.yml", "utf8"),
  windowsProviderWorkflowSource,
].join("\n");
const releaseWorkflowPublicationGate = validateReleaseWorkflowPublicationGate(releaseWorkflowSource);
const openLoginBrowserSource = credentialSource
  .split("fn open_login_url_in_browser", 2)[1]
  ?.split("fn watch_and_open_login_url", 1)[0] || "";
const unpinnedWorkflowUses = [...workflowSource.matchAll(/\buses:\s*[^@\s]+@([^\s#]+)/g)]
  .map((match) => match[1])
  .filter((ref) => !/^[0-9a-f]{40}$/i.test(ref));
const sourceInvariants = [
  {
    ok: !credentialSource.includes("sync_gajecode_claude_subscription_credential"),
    message: "Gajae OAuth refresh tokens must not be copied into agent.db",
  },
  {
    ok:
      mainSource.includes('"--atelier-version-probe"') &&
      mainSource.includes('"--atelier-renderer-ready-probe"') &&
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
      windowsPhysicalGateSource.includes("self-hosted") &&
      windowsPhysicalGateSource.includes("windows") &&
      windowsPhysicalGateSource.includes("-RestartApplication") &&
      windowsPhysicalGateSource.includes("-RequireRendererReadyEvidence") &&
      windowsPhysicalGateSource.includes("-RequireBrowserProcessEvidence") &&
      windowsPhysicalGateSource.includes("-RequireVisibleBrowserWindowEvidence") &&
      windowsPhysicalGateSource.includes("-SelfTest"),
    message:
      "Physical Windows release gate must prove installed version, signature, restart, browser auth, and Smart App Control evidence",
  },
  {
    ok:
      agentPreviewSource.includes("redact_preview_output_line") &&
      agentPreviewSource.includes("preview_output_redacts_credentials_before_storage_and_events") &&
      agentWorkspaceSource.includes("redactPreviewEvidenceText") &&
      agentWorkspaceSource.includes("serviceOutput?: string[]") &&
      agentWorkspaceSource.includes('networkMethod: "GET"'),
    message:
      "Preview task evidence must retain bounded HTTP/server diagnostics without persisting provider credentials",
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
      agentWorkspaceSource.includes("browserErrorCount?: number") &&
      agentWorkspaceSource.includes("consoleEvidence?: string[]") &&
      agentWorkspaceSource.includes("networkEvidence?: string[]") &&
      agentWorkspaceSource.includes("formatDevScreenPromptContext") &&
      agentWorkspaceSource.includes("devScreenMatchesPreview") &&
      agentWorkspaceSource.includes("const automaticCheck = await devScreenCheck") &&
      agentWorkspaceSource.includes("Number(entry.status || 0) >= 400") &&
      agentWorkspaceSource.includes("if (!wasInterrupted && !wasStopped && completedPreviewUrl)") &&
      !agentWorkspaceSource.includes("if (!result.is_error && !wasInterrupted && !wasStopped && completedPreviewUrl)"),
    message:
      "Preview browser diagnostics must retain bounded redacted console/network metadata without reading bodies, headers, cookies, or storage",
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
      agentWorkspaceSource.includes("payload.elementSelection || null") &&
      agentWorkspaceSource.includes("formatDevScreenElementSelectionPrompt(payload.elementSelection, tw.language)") &&
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
      windowsProviderSmokeSource.includes("Wait-BrowserProcessEvidence") &&
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
        && handoff.includes('parsed.protocol === "https:"')
        && handoff.includes('host.endsWith(`.${root}`)')
        && handoff.includes('["claude.ai", "claude.com", "anthropic.com"]')
        && handoff.includes('["openai.com", "chatgpt.com"]');
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
      connectionsSource.includes("attempt.count >= 3") &&
      connectionsSource.includes("if (nextUrl && loginState.browser_opened)") &&
      connectionsSource.includes("if (result.browser_opened) openedLoginUrlsRef.current") &&
      connectionsSource.includes("else void openLoginUrlWithRetry"),
    message:
      "OAuth browser handoff must preserve native success, retry bounded failures, and prevent concurrent duplicate opens",
  },
  {
    ok: unpinnedWorkflowUses.length === 0,
    message: `Release workflow actions must be pinned to full commits (${unpinnedWorkflowUses.join(", ")})`,
  },
  {
    ok:
      !workflowSource.includes("npm install --legacy-peer-deps") &&
      (workflowSource.match(/npm ci --legacy-peer-deps/g) || []).length >= 4,
    message: "Release workflows must install the locked npm dependency graph with npm ci",
  },
  {
    ok:
      packageSource.includes('"smoke:updater-contract"') &&
      workflowSource.includes("npm run smoke:updater-contract"),
    message: "Release workflows must verify the signed Windows updater platform contract",
  },
  {
    ok: releaseWorkflowPublicationGate.ok,
    message:
      releaseWorkflowPublicationGate.message
      ?? "Release workflow must keep the GitHub release draft until Windows signing, asset merge, and MSI validation succeed",
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
