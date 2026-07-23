import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "atelier-publish-evidence-"));
const assets = join(root, "assets");
const evidence = join(root, "evidence");
mkdirSync(assets);
mkdirSync(evidence);

const version = String(JSON.parse(readFileSync("package.json", "utf8")).version);
const tag = `v${version}`;
const sourceSha = "a".repeat(40);
const releaseRepository = "BYKAYLE/atelier";
const msiSha = "b".repeat(64);
const nsisSha = "c".repeat(64);
const installedSha = "d".repeat(64);
const runId = "123456789";
const runAttempt = "4";
const runnerName = "atelier-physical-windows-01";
const installedPath = "C:\\Program Files\\Atelier\\Atelier.exe";
const candidatePath = join(evidence, "windows-release-candidate.json");
const updaterPath = join(evidence, "windows-updater-canary.json");
const providerPath = join(evidence, "atelier-provider-smoke-20260722-120000.json");
const inAppLoginPath = join(evidence, "atelier-in-app-login-20260722-120000.json");
const packagePath = join(evidence, "windows-package-smoke.json");
const runnerPreflightPath = join(evidence, "windows-runner-preflight.json");
const signedChannelHistoryPath = join(evidence, "signed-channel-history.json");
const physicalSealPath = join(evidence, "physical-gate-receipt.json");
const manifestPath = join(assets, "release-manifest.json");

writeManifest();

try {
  resetValidUpgrade();
  run(true, "valid upgrade evidence");

  resetValidUpgrade();
  writePhysicalSeal();
  const manifest = readJson(manifestPath);
  manifest.sealTamperProbe = true;
  writeJson(manifestPath, manifest);
  run(false, "candidate manifest changed after the physical gate", false, false);

  resetValidUpgrade();
  writePhysicalSeal();
  const seal = readJson(physicalSealPath);
  seal.manifest.sha256 = "f".repeat(64);
  writeJson(physicalSealPath, seal);
  run(false, "physical gate seal contains the wrong manifest hash", false, false);

  resetValidUpgrade();
  writePhysicalSeal();
  const signedChannelHistory = readJson(signedChannelHistoryPath);
  signedChannelHistory.checkedReleaseCount += 1;
  writeJson(signedChannelHistoryPath, signedChannelHistory);
  run(false, "signed-channel history changed after the physical gate", false, false);

  let preflight = readJson(runnerPreflightPath);
  preflight.githubRunAttempt = "5";
  writeJson(runnerPreflightPath, preflight);
  run(false, "runner preflight from another run attempt");

  resetValidUpgrade();
  preflight = readJson(runnerPreflightPath);
  preflight.runner.name = "another-runner";
  writeJson(runnerPreflightPath, preflight);
  run(false, "runner preflight from another runner");

  resetValidUpgrade();
  let provider = readJson(providerPath);
  provider.browserProcessEvidence.visibleWindow = false;
  writeJson(providerPath, provider);
  run(false, "hidden browser window");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.browserProcessEvidence.observationMode = "none";
  writeJson(providerPath, provider);
  run(false, "invalid browser observation mode");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.browserProcessEvidence.processes = [];
  writeJson(providerPath, provider);
  run(false, "missing browser process records");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.browserProcessEvidence.observationMode = "existing-visible-default-browser";
  provider.browserProcessEvidence.corroboration = null;
  provider.browserProcessEvidence.defaultBrowserProcessNames = ["firefox"];
  writeJson(providerPath, provider);
  run(false, "existing browser without corroboration");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.browserProcessEvidence.observationMode = "existing-visible-default-browser";
  provider.browserProcessEvidence.defaultBrowserProcessNames = ["msedge"];
  provider.browserProcessEvidence.corroboration = {
    ok: true,
    observedAt: "2026-07-22T12:00:02.000Z",
    windowCountDelta: 1,
    foregroundWindowChanged: false,
  };
  writeJson(providerPath, provider);
  run(false, "existing browser with corroboration");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.loginResults.claudeAuthOk = false;
  writeJson(providerPath, provider);
  run(false, "missing Claude authentication");

  resetValidUpgrade();
  const inAppLogin = readJson(inAppLoginPath);
  inAppLogin.providers.find((entry) => entry.provider === "codex").loginButtonClicked = false;
  writeJson(inAppLoginPath, inAppLogin);
  writePhysicalSeal(false, "missing installed Codex login button proof");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.inAppLogin.providers.find(
    (entry) => entry.provider === "claude",
  ).authenticatedStateObserved = false;
  writeJson(providerPath, provider);
  writePhysicalSeal(false, "provider embeds a different in-app login receipt");

  resetValidUpgrade();
  const crossRunLogin = readJson(inAppLoginPath);
  crossRunLogin.githubRunId = "987654321";
  writeJson(inAppLoginPath, crossRunLogin);
  const crossRunProvider = readJson(providerPath);
  crossRunProvider.inAppLogin = crossRunLogin;
  writeJson(providerPath, crossRunProvider);
  writePhysicalSeal(false, "in-app login receipt from another run");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.githubRunId = "987654321";
  writeJson(providerPath, provider);
  writePhysicalSeal(false, "provider receipt from another run");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.githubRunAttempt = 5;
  writeJson(providerPath, provider);
  writePhysicalSeal(false, "provider receipt from another run attempt");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.runnerName = "another-runner";
  writeJson(providerPath, provider);
  writePhysicalSeal(false, "provider receipt from another runner");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.installedApp.sha256 = "f".repeat(64);
  writeJson(providerPath, provider);
  run(false, "provider receipt for a different installed executable");

  resetValidUpgrade();
  let updater = readJson(updaterPath);
  updater.githubRunId = "987654321";
  writeJson(updaterPath, updater);
  run(false, "updater receipt from another run");

  resetValidUpgrade();
  updater = readJson(updaterPath);
  updater.updater.signatureVerifiedByTauriUpdater = false;
  writeJson(updaterPath, updater);
  run(false, "updater without Tauri signature verification");

  resetValidUpgrade();
  updater = readJson(updaterPath);
  updater.updater.updaterDrivenRelaunch = false;
  writeJson(updaterPath, updater);
  run(false, "updater without updater-driven relaunch");

  resetValidUpgrade();
  updater = readJson(updaterPath);
  updater.candidate.sha256 = "f".repeat(64);
  writeJson(updaterPath, updater);
  run(false, "updater for a different candidate MSI");

  resetValidUpgrade();
  updater = readJson(updaterPath);
  updater.installed.sha256 = "f".repeat(64);
  writeJson(updaterPath, updater);
  run(false, "updater for a different installed executable");

  resetValidUpgrade();
  updater = readJson(updaterPath);
  updater.mode = "self-reinstall";
  updater.fromVersion = version;
  updater.initialSignedChannelWaiverUsed = true;
  updater.upgradePersistenceProved = false;
  writeJson(updaterPath, updater);
  run(false, "unapproved updater self-reinstall");

  resetValidUpgrade();
  let candidate = readJson(candidatePath);
  candidate.githubRunId = "987654321";
  writeJson(candidatePath, candidate);
  run(false, "candidate receipt from another run");

  resetValidUpgrade();
  candidate = readJson(candidatePath);
  candidate.githubRunId = runId;
  candidate.githubRunAttempt = 5;
  writeJson(candidatePath, candidate);
  run(false, "candidate receipt from another run attempt");

  resetValidUpgrade();
  candidate = readJson(candidatePath);
  candidate.githubRunAttempt = Number(runAttempt);
  candidate.runnerName = "another-runner";
  writeJson(candidatePath, candidate);
  run(false, "candidate receipt from another runner");

  resetValidUpgrade();
  const packages = packageFixture();
  packages.githubRunId = "987654321";
  writeJson(packagePath, packages);
  run(false, "package receipt from another run");

  resetValidUpgrade();
  packages.githubRunId = runId;
  packages.githubRunAttempt = 5;
  writeJson(packagePath, packages);
  run(false, "package receipt from another run attempt");

  resetValidUpgrade();
  packages.githubRunAttempt = Number(runAttempt);
  packages.runnerName = "another-runner";
  writeJson(packagePath, packages);
  run(false, "package receipt from another runner");

  resetWaiverCandidate();
  run(true, "approved first-channel waiver", true);
  run(false, "unapproved first-channel waiver", false);

  resetValidUpgrade();
  const contradictory = readJson(candidatePath);
  contradictory.initialSignedChannelWaiverUsed = true;
  writeJson(candidatePath, contradictory);
  run(false, "contradictory upgrade and waiver", true);

  resetValidUpgrade();
  preflight = readJson(runnerPreflightPath);
  preflight.desktop.unlocked = false;
  writeJson(runnerPreflightPath, preflight);
  run(false, "locked desktop preflight");

  resetValidUpgrade();
  preflight = readJson(runnerPreflightPath);
  preflight.tools.gh.ok = false;
  writeJson(runnerPreflightPath, preflight);
  run(false, "missing required gh tool");

  resetValidUpgrade();
  preflight = readJson(runnerPreflightPath);
  preflight.authenticodeProbe.timestamped = false;
  writeJson(runnerPreflightPath, preflight);
  run(true, "runner host trust probe does not require a timestamp");

  resetValidUpgrade();
  preflight = readJson(runnerPreflightPath);
  preflight.smartAppControl.available = false;
  preflight.smartAppControl.ok = false;
  writeJson(runnerPreflightPath, preflight);
  run(false, "required Smart App Control unavailable");
  run(false, "Smart App Control cannot be disabled by environment", false, true, {
    REQUIRE_SMART_APP_CONTROL_EVIDENCE: "false",
  });

  console.log("publish evidence smoke passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function resetValidUpgrade() {
  writeManifest();
  writeJson(runnerPreflightPath, runnerPreflightFixture());
  writeJson(signedChannelHistoryPath, signedChannelHistoryFixture(false));
  writeJson(updaterPath, updaterFixture());
  writeJson(candidatePath, candidateFixture(fileReceipt(updaterPath)));
  const inAppLogin = inAppLoginFixture();
  writeJson(inAppLoginPath, inAppLogin);
  writeJson(providerPath, providerFixture(inAppLogin));
  writeJson(packagePath, packageFixture());
}

function resetWaiverCandidate() {
  writeManifest();
  writeJson(runnerPreflightPath, runnerPreflightFixture());
  writeJson(signedChannelHistoryPath, signedChannelHistoryFixture(true));
  writeJson(updaterPath, updaterFixture(true));
  writeJson(candidatePath, candidateFixture(fileReceipt(updaterPath), true));
  const inAppLogin = inAppLoginFixture();
  writeJson(inAppLoginPath, inAppLogin);
  writeJson(providerPath, providerFixture(inAppLogin));
  writeJson(packagePath, packageFixture());
}

function candidateFixture(updaterReceipt, allowWaiver = false) {
  const signature = signatureFixture();
  return {
    schemaVersion: 1,
    releaseTag: tag,
    sourceSha,
    expectedVersion: version,
    githubRunId: runId,
    githubRunAttempt: Number(runAttempt),
    runnerName,
    interactiveDesktop: true,
    initialSignedChannelWaiverUsed: allowWaiver,
    installationPath: allowWaiver ? "direct-msi" : "in-app-updater",
    installer: { sha256: msiSha, signature },
    installed: {
      path: installedPath,
      sha256: installedSha,
      version,
      signature,
      resourcesPresent: true,
    },
    rendererReady: true,
    postRestartVersion: version,
    upgradePersistenceProved: !allowWaiver,
    updaterEvidence: allowWaiver
      ? null
      : {
          mode: "upgrade",
          sha256: updaterReceipt.sha256,
          signatureVerifiedByTauriUpdater: true,
          updaterDrivenRelaunch: true,
        },
  };
}

function updaterFixture(allowWaiver = false) {
  const signature = signatureFixture();
  return {
    schemaVersion: 1,
    status: "passed",
    generatedAt: "2026-07-22T11:59:50.000Z",
    releaseTag: tag,
    sourceSha,
    expectedVersion: version,
    githubRunId: runId,
    githubRunAttempt: Number(runAttempt),
    runnerName,
    mode: allowWaiver ? "self-reinstall" : "upgrade",
    interactiveDesktop: true,
    fromVersion: allowWaiver ? version : previousVersion(version),
    initialSignedChannelWaiverUsed: allowWaiver,
    candidate: {
      path: `C:\\release\\Atelier_${version}_x64_en-US.msi`,
      sha256: msiSha,
      bytes: 42,
      authenticode: signature,
      tauriSignaturePath: `C:\\release\\Atelier_${version}_x64_en-US.msi.sig`,
      tauriSignatureSha256: "e".repeat(64),
    },
    updater: {
      metadataRequests: 1,
      candidateRequests: 1,
      downloadedBytes: 42,
      signatureVerifiedByTauriUpdater: true,
      installerLaunchRequested: true,
      updaterDrivenRelaunch: true,
      handoffReceipt: {
        file: "updater-handoff.json",
        sha256: "1".repeat(64),
        bytes: 256,
      },
      runtimeReceipt: {
        file: "updater-runtime.json",
        sha256: "2".repeat(64),
        bytes: 384,
      },
    },
    installed: {
      path: installedPath,
      sha256: installedSha,
      version,
      signature,
      resourcesPresent: true,
    },
    rendererReady: true,
    postRestartVersion: version,
    upgradePersistenceProved: !allowWaiver,
  };
}

function packageFixture() {
  const signature = signatureFixture();
  const payload = {
    version,
    resourcesPresent: true,
    signatureStatus: "Valid",
    signature,
  };
  return {
    schemaVersion: 1,
    releaseTag: tag,
    sourceSha,
    expectedVersion: version,
    githubRunId: runId,
    githubRunAttempt: Number(runAttempt),
    runnerName,
    packages: {
      msi: { sha256: msiSha, signatureStatus: "Valid", signature, payload },
      nsis: { sha256: nsisSha, signatureStatus: "Valid", signature, payload },
      msix: null,
    },
  };
}

function runnerPreflightFixture() {
  return {
    schemaVersion: 1,
    phase: "windows-runner-preflight",
    generatedAt: "2026-07-22T11:59:30.000Z",
    releaseTag: tag,
    expectedVersion: version,
    sourceSha,
    githubRunId: runId,
    githubRunAttempt: runAttempt,
    status: "ready",
    overall: "ok",
    runner: {
      name: runnerName,
      os: "Windows",
      architecture: "x64",
    },
    desktop: {
      interactive: true,
      serviceSession: false,
      unlocked: true,
    },
    tools: Object.fromEntries(
      ["powershell", "node", "npm", "git", "bash", "gh", "msiexec", "7z"].map((name) => [
        name,
        {
          ok: true,
          path: `C:\\tools\\${name}.exe`,
        },
      ]),
    ),
    providerInstallation: {
      codexAndClaude: { ok: true, method: "npm" },
      hermes: { ok: true, method: "uv", path: "C:\\tools\\uv.exe" },
    },
    storage: {
      workspaceWritable: true,
      tempWritable: true,
      ok: true,
      freeBytes: 30 * 1024 * 1024 * 1024,
      requiredFreeBytes: 5 * 1024 * 1024 * 1024,
    },
    msiService: {
      ok: true,
      installed: true,
      status: "Running",
    },
    browser: {
      resolved: true,
      ok: true,
      defaultBrowserProcessNames: ["msedge"],
    },
    authenticodeProbe: {
      status: "Valid",
      trusted: true,
      timestamped: true,
      ok: true,
    },
    smartAppControl: {
      available: true,
      ok: true,
      state: "On",
    },
  };
}

function signedChannelHistoryFixture(initialSignedChannelEligible) {
  const baselineVersion = previousVersion(version);
  return {
    schemaVersion: 1,
    phase: "signed-channel-history",
    status: initialSignedChannelEligible
      ? "initial-channel-eligible"
      : "baseline-required",
    derivedFrom: "github-public-release-history",
    releaseRepository,
    releaseTag: tag,
    sourceSha,
    githubRunId: runId,
    githubRunAttempt: runAttempt,
    checkedReleaseCount: initialSignedChannelEligible ? 1 : 2,
    checkedPublicReleaseCount: initialSignedChannelEligible ? 1 : 2,
    initialSignedChannelEligible,
    qualifyingBaseline: initialSignedChannelEligible
      ? null
      : {
          tag: `v${baselineVersion}`,
          publishedAt: "2026-07-21T00:00:00.000Z",
          assetNames: [
            `Atelier_${baselineVersion}_x64_en-US.msi`,
            `Atelier_${baselineVersion}_x64_en-US.msi.sig`,
            "latest.json",
            "release-manifest.json",
          ],
        },
    generatedAt: "2026-07-22T11:59:20.000Z",
  };
}

function inAppLoginFixture() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-22T12:00:00.000Z",
    releaseTag: tag,
    expectedVersion: version,
    sourceSha,
    githubRunId: runId,
    githubRunAttempt: Number(runAttempt),
    runnerName,
    debugPort: 9223,
    target: {
      id: "atelier-webview2",
      title: "Atelier",
      url: "https://tauri.localhost/",
    },
    providers: ["codex", "claude"].map((provider) => ({
      provider,
      startedAt: "2026-07-22T12:00:00.000Z",
      completedAt: "2026-07-22T12:00:05.000Z",
      connectedBefore: false,
      loginButtonClicked: true,
      loginModalObserved: true,
      loginPendingStateObserved: true,
      authenticatedStateObserved: true,
      connectedStateObserved: true,
    })),
    ok: true,
    failure: null,
  };
}

function providerFixture(inAppLogin = inAppLoginFixture()) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-22T12:00:00.000Z",
    releaseTag: tag,
    sourceSha,
    expectedVersion: version,
    githubRunId: runId,
    githubRunAttempt: Number(runAttempt),
    runnerName,
    inAppLoginRequested: true,
    inAppLogin,
    providers: [
      { command: "codex", exists: true, versionOk: true, authOk: true },
      { command: "claude", exists: true, versionOk: true, authOk: true },
    ],
    browserProbe: true,
    browserHelperProbe: true,
    browserProcessEvidence: {
      observed: true,
      visibleWindow: true,
      observationMode: "new-or-recent-process",
      defaultBrowserProcessNames: ["msedge"],
      timeoutSec: 20,
      corroboration: null,
      processes: [
        {
          name: "msedge",
          id: 4242,
          startedAt: "2026-07-22T12:00:01.000Z",
          visibleWindow: true,
        },
      ],
    },
    installedApp: {
      found: true,
      path: installedPath.toUpperCase(),
      sha256: installedSha,
      version,
      versionOk: true,
      signatureOk: true,
      signatureEvidence: signatureFixture(),
      restartOk: true,
      rendererReadyOk: true,
    },
    smartAppControl: { available: true, state: "On" },
    loginResults: {
      codexFlowExitOk: true,
      codexAuthOk: true,
      claudeFlowExitOk: true,
      claudeAuthOk: true,
    },
  };
}

function signatureFixture() {
  return {
    status: "Valid",
    signerThumbprint: "A".repeat(40),
    signerNotBefore: "2026-01-01T00:00:00.000Z",
    signerNotAfter: "2027-01-01T00:00:00.000Z",
    timestamped: true,
    timestamperThumbprint: "B".repeat(40),
    timestamperNotBefore: "2026-01-01T00:00:00.000Z",
    timestamperNotAfter: "2030-01-01T00:00:00.000Z",
  };
}

function run(shouldPass, label, allowWaiver = false, reseal = true, envOverrides = {}) {
  if (reseal) {
    writeJson(signedChannelHistoryPath, signedChannelHistoryFixture(allowWaiver));
    writePhysicalSeal();
  }
  const result = spawnSync(process.execPath, [".github/scripts/validate-publish-evidence.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      EVIDENCE_DIR: evidence,
      RELEASE_ASSETS_DIR: assets,
      RELEASE_TAG: tag,
      EXPECTED_VERSION: version,
      RELEASE_SOURCE_SHA: sourceSha,
      RELEASE_REPOSITORY: releaseRepository,
      PHYSICAL_GATE_RUN_ID: runId,
      PHYSICAL_GATE_RUN_ATTEMPT: runAttempt,
      PHYSICAL_GATE_RUNNER_NAME: runnerName,
      REQUIRE_SMART_APP_CONTROL_EVIDENCE: "true",
      ...envOverrides,
    },
  });
  if ((result.status === 0) !== shouldPass) {
    throw new Error(`${label} produced unexpected status ${result.status}:\n${result.stdout}\n${result.stderr}`);
  }
}

function writeManifest() {
  writeJson(manifestPath, {
    schemaVersion: 2,
    status: "signed-draft-candidate",
    releaseChannel: "github-draft",
    releaseRepository,
    releaseTag: tag,
    version,
    sourceSha,
    primaryAssets: {
      windowsMsi: `Atelier_${version}_x64_en-US.msi`,
      windowsNsis: `Atelier_${version}_x64-setup.exe`,
    },
    assets: [
      { name: `Atelier_${version}_x64_en-US.msi`, bytes: 42, sha256: msiSha },
      { name: `Atelier_${version}_x64-setup.exe`, bytes: 43, sha256: nsisSha },
    ],
  });
}

function writePhysicalSeal(shouldPass = true, label = "physical seal fixture") {
  const result = spawnSync(process.execPath, [".github/scripts/seal-physical-release-evidence.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      EVIDENCE_DIR: evidence,
      RELEASE_ASSETS_DIR: assets,
      PHYSICAL_GATE_SEAL: physicalSealPath,
      RELEASE_TAG: tag,
      EXPECTED_VERSION: version,
      RELEASE_SOURCE_SHA: sourceSha,
      GITHUB_RUN_ID: runId,
      GITHUB_RUN_ATTEMPT: runAttempt,
      RUNNER_NAME: runnerName,
    },
  });
  if ((result.status === 0) !== shouldPass) {
    throw new Error(`${label} produced unexpected status ${result.status}:\n${result.stdout}\n${result.stderr}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fileReceipt(path) {
  const data = readFileSync(path);
  return {
    file: path.split(/[\\/]/).pop(),
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

function previousVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error(`invalid fixture version: ${value}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (patch > 0) return `${major}.${minor}.${patch - 1}`;
  if (minor > 0) return `${major}.${minor - 1}.0`;
  if (major > 0) return `${major - 1}.0.0`;
  throw new Error("fixture version has no older semantic version");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
