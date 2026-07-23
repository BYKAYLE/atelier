import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { resolveReleaseRepository } from "./release-contract.mjs";

const evidenceDir = resolve(process.env.EVIDENCE_DIR || "physical-evidence");
const assetsDir = resolve(process.env.RELEASE_ASSETS_DIR || "candidate-assets");
const releaseTag = requireEnv("RELEASE_TAG");
const expectedVersion = requireEnv("EXPECTED_VERSION").replace(/^v/, "");
const sourceSha = requireEnv("RELEASE_SOURCE_SHA").toLowerCase();
const physicalGateRunId = requireEnv("PHYSICAL_GATE_RUN_ID");
const physicalGateRunAttempt = requireEnv("PHYSICAL_GATE_RUN_ATTEMPT");
const physicalGateRunnerName = requireEnv("PHYSICAL_GATE_RUNNER_NAME");
const allowInitialSignedChannel = parseBoolean(process.env.ALLOW_INITIAL_SIGNED_CHANNEL);
const requireSmartAppControl = parseBoolean(
  process.env.REQUIRE_SMART_APP_CONTROL_EVIDENCE,
  true,
);
const releaseRepository = resolveReleaseRepository();

if (!/^v\d+\.\d+\.\d+(?:[-+].+)?$/.test(releaseTag)) {
  fail(`invalid release tag: ${releaseTag}`);
}
if (releaseTag !== `v${expectedVersion}`) {
  fail(`release tag ${releaseTag} does not match expected version ${expectedVersion}`);
}
if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
  fail("RELEASE_SOURCE_SHA must be a full 40-character Git commit SHA");
}
if (!/^[1-9][0-9]*$/.test(physicalGateRunAttempt)) {
  fail("PHYSICAL_GATE_RUN_ATTEMPT must be a positive integer");
}
if (physicalGateRunnerName.length > 128 || /[\r\n]/.test(physicalGateRunnerName)) {
  fail("PHYSICAL_GATE_RUNNER_NAME is invalid");
}

const candidateFiles = findFiles(evidenceDir, "windows-release-candidate.json");
if (candidateFiles.length !== 1) {
  fail(`expected exactly one Windows candidate receipt, found ${candidateFiles.length}`);
}
const updaterFiles = findFiles(evidenceDir, "windows-updater-canary.json");
if (updaterFiles.length !== 1) {
  fail(`expected exactly one Windows updater canary receipt, found ${updaterFiles.length}`);
}
const providerFiles = findFiles(evidenceDir, /^atelier-provider-smoke-.*\.json$/);
if (providerFiles.length !== 1) {
  fail(`expected exactly one Windows provider receipt, found ${providerFiles.length}`);
}
const packageFiles = findFiles(evidenceDir, "windows-package-smoke.json");
if (packageFiles.length !== 1) {
  fail(`expected exactly one Windows package receipt, found ${packageFiles.length}`);
}
const runnerPreflightFiles = findFiles(evidenceDir, "windows-runner-preflight.json");
if (runnerPreflightFiles.length !== 1) {
  fail(`expected exactly one Windows runner preflight receipt, found ${runnerPreflightFiles.length}`);
}
const physicalSealFiles = findFiles(evidenceDir, "physical-gate-receipt.json");
if (physicalSealFiles.length !== 1) {
  fail(`expected exactly one physical gate seal, found ${physicalSealFiles.length}`);
}
const providerFile = { path: providerFiles[0], payload: readJson(providerFiles[0]) };
const candidatePath = candidateFiles[0];
const updaterPath = updaterFiles[0];
const packagePath = packageFiles[0];
const runnerPreflightPath = runnerPreflightFiles[0];
const physicalSealPath = physicalSealFiles[0];
const candidate = readJson(candidatePath);
const updater = readJson(updaterPath);
const packageProof = readJson(packagePath);
const provider = providerFile.payload;
const runnerPreflight = readJson(runnerPreflightPath);
const physicalSeal = readJson(physicalSealPath);
const manifestPath = join(assetsDir, "release-manifest.json");
const manifest = readJson(manifestPath);

assertRunnerPreflight(runnerPreflight);
assertPhysicalSeal(physicalSeal);
assertUpdaterCanary(updater);

assertEqual(candidate.schemaVersion, 1, "candidate receipt schema");
assertEqual(candidate.releaseTag, releaseTag, "candidate release tag");
assertEqual(String(candidate.sourceSha || "").toLowerCase(), sourceSha, "candidate source SHA");
assertEqual(candidate.expectedVersion, expectedVersion, "candidate expected version");
assertEqual(String(candidate.githubRunId || ""), physicalGateRunId, "candidate GitHub run ID");
assertEqual(
  String(candidate.githubRunAttempt || ""),
  physicalGateRunAttempt,
  "candidate GitHub run attempt",
);
assertEqual(candidate.runnerName, physicalGateRunnerName, "candidate runner name");
assertTrue(candidate.interactiveDesktop === true, "candidate was not tested in an interactive desktop session");
assertTimestampedSignature(candidate.installer?.signature, "candidate installer");
assertTimestampedSignature(candidate.installed?.signature, "installed executable");
assertEqual(candidate.installed?.version, expectedVersion, "installed candidate version");
assertTrue(candidate.installed?.resourcesPresent === true, "installed design-engine resources were not proved");
assertTrue(candidate.rendererReady === true, "candidate renderer-ready receipt is missing");
assertEqual(candidate.postRestartVersion, expectedVersion, "post-restart candidate version");

if (candidate.upgradePersistenceProved !== true) {
  assertTrue(
    allowInitialSignedChannel && candidate.initialSignedChannelWaiverUsed === true,
    "a real older-version upgrade was not proved and the first-channel waiver is not approved",
  );
} else if (candidate.initialSignedChannelWaiverUsed === true) {
  fail("candidate receipt cannot claim both a real upgrade proof and an initial-channel waiver");
}
if (allowInitialSignedChannel) {
  assertEqual(candidate.installationPath, "direct-msi", "first-channel candidate installation path");
  assertTrue(
    candidate.initialSignedChannelWaiverUsed === true,
    "first-channel candidate receipt did not record its direct-install waiver",
  );
} else {
  assertEqual(candidate.installationPath, "in-app-updater", "candidate installation path");
  assertEqual(candidate.updaterEvidence?.mode, "upgrade", "candidate updater evidence mode");
  assertTrue(
    candidate.updaterEvidence?.signatureVerifiedByTauriUpdater === true,
    "candidate receipt did not reference Tauri updater signature verification",
  );
  assertTrue(
    candidate.updaterEvidence?.updaterDrivenRelaunch === true,
    "candidate receipt did not reference the updater-driven relaunch",
  );
  assertEqual(
    String(candidate.updaterEvidence?.sha256 || "").toLowerCase(),
    receipt(updaterPath).sha256,
    "candidate updater receipt SHA-256",
  );
}

assertEqual(manifest.schemaVersion, 2, "release manifest schema");
assertEqual(manifest.status, "signed-draft-candidate", "release manifest status");
assertEqual(manifest.releaseChannel, "github-draft", "release manifest channel");
assertEqual(manifest.releaseRepository, releaseRepository.slug, "release manifest repository");
assertEqual(manifest.releaseTag, releaseTag, "manifest release tag");
assertEqual(String(manifest.sourceSha || "").toLowerCase(), sourceSha, "manifest source SHA");
assertEqual(manifest.version, expectedVersion, "manifest version");

assertEqual(packageProof.schemaVersion, 1, "package receipt schema");
assertEqual(packageProof.releaseTag, releaseTag, "package release tag");
assertEqual(String(packageProof.sourceSha || "").toLowerCase(), sourceSha, "package source SHA");
assertEqual(packageProof.expectedVersion, expectedVersion, "package expected version");
assertEqual(String(packageProof.githubRunId || ""), physicalGateRunId, "package GitHub run ID");
assertEqual(
  String(packageProof.githubRunAttempt || ""),
  physicalGateRunAttempt,
  "package GitHub run attempt",
);
assertEqual(packageProof.runnerName, physicalGateRunnerName, "package runner name");

const msiName = manifest.primaryAssets?.windowsMsi;
const msiAsset = Array.isArray(manifest.assets)
  ? manifest.assets.find((asset) => asset?.name === msiName)
  : null;
assertTrue(Boolean(msiAsset), "manifest does not identify the signed Windows MSI");
assertEqual(
  String(candidate.installer?.sha256 || "").toLowerCase(),
  String(msiAsset.sha256 || "").toLowerCase(),
  "installed candidate MSI hash",
);
assertEqual(
  String(updater.candidate?.sha256 || "").toLowerCase(),
  String(msiAsset.sha256 || "").toLowerCase(),
  "updater candidate MSI hash",
);
assertEqual(updater.candidate?.bytes, msiAsset.bytes, "updater candidate MSI bytes");
const nsisName = manifest.primaryAssets?.windowsNsis;
const nsisAsset = Array.isArray(manifest.assets)
  ? manifest.assets.find((asset) => asset?.name === nsisName)
  : null;
assertTrue(Boolean(nsisAsset), "manifest does not identify the signed Windows NSIS installer");
for (const [kind, asset] of [["msi", msiAsset], ["nsis", nsisAsset]]) {
  const proof = packageProof.packages?.[kind];
  assertTrue(Boolean(proof), `package receipt is missing ${kind.toUpperCase()} proof`);
  assertEqual(String(proof.sha256 || "").toLowerCase(), String(asset.sha256 || "").toLowerCase(), `${kind} package hash`);
  assertEqual(proof.signatureStatus, "Valid", `${kind} package Authenticode status`);
  assertTimestampedSignature(proof.signature, `${kind} package`);
  assertTrue(proof.payload?.resourcesPresent === true, `${kind} payload resources were not proved`);
  assertTrue(
    String(proof.payload?.version || "").startsWith(expectedVersion),
    `${kind} payload version does not match ${expectedVersion}`,
  );
  assertEqual(proof.payload?.signatureStatus, "Valid", `${kind} payload Authenticode status`);
  assertTimestampedSignature(proof.payload?.signature, `${kind} payload`);
}

assertEqual(provider.schemaVersion, 1, "provider receipt schema");
assertEqual(provider.releaseTag, releaseTag, "provider release tag");
assertEqual(String(provider.sourceSha || "").toLowerCase(), sourceSha, "provider source SHA");
assertEqual(provider.expectedVersion, expectedVersion, "provider expected version");
assertEqual(String(provider.githubRunId || ""), physicalGateRunId, "provider GitHub run ID");
assertEqual(
  String(provider.githubRunAttempt || ""),
  physicalGateRunAttempt,
  "provider GitHub run attempt",
);
assertEqual(provider.runnerName, physicalGateRunnerName, "provider runner name");

assertTrue(provider.installedApp?.found === true, "provider gate did not find the installed candidate");
assertTrue(provider.installedApp?.versionOk === true, "provider gate did not prove the installed version");
assertEqual(provider.installedApp?.version, expectedVersion, "provider installed version");
assertTrue(provider.installedApp?.signatureOk === true, "provider gate did not prove Authenticode");
assertTimestampedSignature(provider.installedApp?.signatureEvidence, "provider installed executable");
assertTrue(provider.installedApp?.restartOk === true, "provider gate did not prove restart");
assertTrue(provider.installedApp?.rendererReadyOk === true, "provider gate did not prove renderer readiness");
assertEqual(
  normalizeWindowsPath(provider.installedApp?.path),
  normalizeWindowsPath(candidate.installed?.path),
  "provider/candidate installed executable path",
);
assertEqual(
  normalizeWindowsPath(updater.installed?.path),
  normalizeWindowsPath(candidate.installed?.path),
  "updater/candidate installed executable path",
);
assertTrue(
  /^[0-9a-f]{64}$/i.test(String(candidate.installed?.sha256 || "")),
  "candidate installed executable hash is missing or malformed",
);
assertEqual(
  String(provider.installedApp?.sha256 || "").toLowerCase(),
  String(candidate.installed?.sha256 || "").toLowerCase(),
  "provider/candidate installed executable hash",
);
assertEqual(
  String(updater.installed?.sha256 || "").toLowerCase(),
  String(candidate.installed?.sha256 || "").toLowerCase(),
  "updater/candidate installed executable hash",
);
assertTrue(provider.browserProbe === true, "native OAuth browser probe failed");
assertTrue(provider.browserHelperProbe === true, "signed OAuth browser helper probe failed");
assertBrowserProcessEvidence(provider.browserProcessEvidence);
for (const key of ["codexFlowExitOk", "codexAuthOk", "claudeFlowExitOk", "claudeAuthOk"]) {
  assertTrue(provider.loginResults?.[key] === true, `provider login evidence is false: ${key}`);
}
for (const command of ["codex", "claude"]) {
  const status = Array.isArray(provider.providers)
    ? provider.providers.find((entry) => entry?.command === command)
    : null;
  assertTrue(status?.exists === true && status?.versionOk === true, `${command} CLI was not proved`);
  assertTrue(status?.authOk === true, `${command} authenticated subscription was not proved`);
}
if (requireSmartAppControl) {
  assertTrue(provider.smartAppControl?.available === true, "Smart App Control evidence is unavailable");
}

const report = {
  schemaVersion: 1,
  status: "publish-evidence-accepted",
  releaseTag,
  version: expectedVersion,
  sourceSha,
  physicalGateRunId,
  physicalGateRunAttempt,
  physicalGateRunnerName,
  validatedAt: new Date().toISOString(),
  initialSignedChannelWaiverAccepted:
    updater.upgradePersistenceProved !== true && allowInitialSignedChannel,
  smartAppControlRequired: requireSmartAppControl,
  receipts: {
    runnerPreflight: receipt(runnerPreflightPath),
    candidate: receipt(candidatePath),
    updater: receipt(updaterPath),
    provider: receipt(providerFile.path),
    packages: receipt(packagePath),
    manifest: receipt(manifestPath),
    physicalGateSeal: receipt(physicalSealPath),
  },
};
const outputPath = resolve(
  process.env.PUBLISH_EVIDENCE_REPORT || join(evidenceDir, "publish-evidence-report.json"),
);
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`publish evidence accepted for ${releaseTag} (${sourceSha})`);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes)$/i.test(value.trim());
}

function findFiles(root, matcher) {
  if (!existsSync(root)) return [];
  const matches = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) matches.push(...findFiles(path, matcher));
    else if (
      entry.isFile() &&
      (typeof matcher === "string" ? entry.name === matcher : matcher.test(entry.name))
    ) matches.push(path);
  }
  return matches;
}

function readJson(path) {
  if (!existsSync(path)) fail(`required JSON file is missing: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    fail(`invalid JSON in ${path}: ${error.message}`);
  }
}

function normalizeWindowsPath(value) {
  return String(value || "").replaceAll("/", "\\").replace(/\\+$/, "").toLowerCase();
}

function receipt(path) {
  const data = readFileSync(path);
  return {
    file: basename(path),
    bytes: statSync(path).size,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} mismatch: expected ${expected}, found ${actual}`);
}

function assertTrue(condition, message) {
  if (!condition) fail(message);
}

function assertTimestampedSignature(signature, label) {
  assertEqual(signature?.status, "Valid", `${label} Authenticode status`);
  assertTrue(Boolean(signature?.signerThumbprint), `${label} signer thumbprint is missing`);
  assertTrue(Boolean(signature?.signerNotBefore), `${label} signer validity start is missing`);
  assertTrue(Boolean(signature?.signerNotAfter), `${label} signer validity end is missing`);
  assertTrue(signature?.timestamped === true, `${label} is not timestamped`);
  assertTrue(Boolean(signature?.timestamperThumbprint), `${label} timestamper thumbprint is missing`);
  assertTrue(Boolean(signature?.timestamperNotBefore), `${label} timestamper validity start is missing`);
  assertTrue(Boolean(signature?.timestamperNotAfter), `${label} timestamper validity end is missing`);
}

function assertBrowserProcessEvidence(evidence) {
  assertTrue(evidence?.observed === true, "no browser process was observed");
  assertTrue(evidence?.visibleWindow === true, "no visible browser window was observed");
  assertEqual(
    evidence?.observationMode,
    "new-or-recent-process",
    "browser observation mode",
  );

  const processes = Array.isArray(evidence?.processes) ? evidence.processes : [];
  assertTrue(processes.length > 0, "browser process evidence has no process records");
  const visibleProcesses = processes.filter(
    (process) =>
      process &&
      typeof process.name === "string" &&
      process.name.trim() &&
      Number.isInteger(process.id) &&
      process.id > 0 &&
      process.visibleWindow === true &&
      !Number.isNaN(Date.parse(process.startedAt)),
  );
  assertTrue(
    visibleProcesses.length > 0,
    "browser process evidence has no complete visible process record",
  );
}

function assertRunnerPreflight(preflight) {
  assertEqual(preflight?.schemaVersion, 1, "runner preflight schema");
  assertEqual(preflight?.phase, "windows-runner-preflight", "runner preflight phase");
  assertEqual(preflight?.status, "ready", "runner preflight status");
  assertEqual(preflight?.overall, "ok", "runner preflight overall");
  assertEqual(preflight?.releaseTag, releaseTag, "runner preflight release tag");
  assertEqual(preflight?.expectedVersion, expectedVersion, "runner preflight expected version");
  assertEqual(String(preflight?.sourceSha || "").toLowerCase(), sourceSha, "runner preflight source SHA");
  assertEqual(String(preflight?.githubRunId || ""), physicalGateRunId, "runner preflight GitHub run ID");
  assertEqual(
    String(preflight?.githubRunAttempt || ""),
    physicalGateRunAttempt,
    "runner preflight GitHub run attempt",
  );
  assertTrue(
    !Number.isNaN(Date.parse(preflight?.generatedAt)),
    "runner preflight generatedAt timestamp is missing or invalid",
  );

  assertTrue(preflight?.desktop?.interactive === true, "runner preflight desktop is not interactive");
  assertTrue(preflight?.desktop?.serviceSession === false, "runner preflight ran in a service session");
  assertTrue(preflight?.desktop?.unlocked === true, "runner preflight desktop is locked");

  assertEqual(preflight?.runner?.architecture, "x64", "runner preflight architecture");
  assertEqual(preflight?.runner?.name, physicalGateRunnerName, "runner preflight runner name");
  assertEqual(String(preflight?.runner?.os || "").toLowerCase(), "windows", "runner preflight OS");

  for (const toolName of ["powershell", "node", "npm", "git", "bash", "gh", "msiexec", "7z"]) {
    const tool = preflight?.tools?.[toolName];
    assertTrue(tool?.ok === true, `runner preflight tool check failed: ${toolName}`);
    assertTrue(Boolean(tool?.path), `runner preflight tool path is missing: ${toolName}`);
  }
  assertTrue(
    preflight?.providerInstallation?.codexAndClaude?.ok === true,
    "runner preflight could not install Codex and Claude providers",
  );
  assertTrue(
    preflight?.providerInstallation?.hermes?.ok === true,
    "runner preflight could not install Hermes",
  );

  assertTrue(preflight?.storage?.workspaceWritable === true, "runner preflight workspace is not writable");
  assertTrue(preflight?.storage?.tempWritable === true, "runner preflight temp directory is not writable");
  assertTrue(preflight?.storage?.ok === true, "runner preflight storage verdict is not ok");
  assertTrue(
    Number.isInteger(preflight?.storage?.freeBytes) && preflight.storage.freeBytes > 0,
    "runner preflight freeBytes is missing or invalid",
  );
  assertTrue(
    Number.isInteger(preflight?.storage?.requiredFreeBytes) && preflight.storage.requiredFreeBytes > 0,
    "runner preflight requiredFreeBytes is missing or invalid",
  );
  assertTrue(
    preflight.storage.freeBytes >= preflight.storage.requiredFreeBytes,
    "runner preflight free space is below the required threshold",
  );

  assertTrue(preflight?.msiService?.ok === true, "runner preflight MSI service check failed");
  assertTrue(preflight?.msiService?.installed === true, "runner preflight MSI service is not installed");
  const msiStatus = String(preflight?.msiService?.status || "").replace(/\s+/g, "");
  assertTrue(
    ["Running", "Stopped", "StartPending"].includes(msiStatus),
    `runner preflight MSI service status is invalid: ${preflight?.msiService?.status || "missing"}`,
  );

  assertTrue(preflight?.browser?.resolved === true, "runner preflight did not resolve the default browser");
  assertTrue(preflight?.browser?.ok === true, "runner preflight browser verdict is not ok");
  const defaultBrowserNames = Array.isArray(preflight?.browser?.defaultBrowserProcessNames)
    ? preflight.browser.defaultBrowserProcessNames
        .filter((name) => typeof name === "string" && name.trim())
        .map((name) => name.trim().toLowerCase())
    : [];
  assertTrue(defaultBrowserNames.length > 0, "runner preflight default browser process names are missing");

  assertEqual(preflight?.authenticodeProbe?.status, "Valid", "runner preflight Authenticode probe status");
  assertTrue(preflight?.authenticodeProbe?.trusted === true, "runner preflight Authenticode probe is not trusted");
  assertTrue(preflight?.authenticodeProbe?.ok === true, "runner preflight Authenticode verdict is not ok");

  if (requireSmartAppControl) {
    assertTrue(preflight?.smartAppControl?.available === true, "runner preflight Smart App Control is unavailable");
    assertTrue(preflight?.smartAppControl?.ok === true, "runner preflight Smart App Control verdict is not ok");
  }
}

function assertUpdaterCanary(canary) {
  assertEqual(canary?.schemaVersion, 1, "updater canary schema");
  assertEqual(canary?.status, "passed", "updater canary status");
  assertEqual(canary?.releaseTag, releaseTag, "updater canary release tag");
  assertEqual(canary?.expectedVersion, expectedVersion, "updater canary expected version");
  assertEqual(String(canary?.sourceSha || "").toLowerCase(), sourceSha, "updater canary source SHA");
  assertEqual(String(canary?.githubRunId || ""), physicalGateRunId, "updater canary GitHub run ID");
  assertEqual(
    String(canary?.githubRunAttempt || ""),
    physicalGateRunAttempt,
    "updater canary GitHub run attempt",
  );
  assertEqual(canary?.runnerName, physicalGateRunnerName, "updater canary runner name");
  assertTrue(canary?.interactiveDesktop === true, "updater canary was not run in an interactive desktop");
  assertTrue(
    !Number.isNaN(Date.parse(canary?.generatedAt)),
    "updater canary generatedAt timestamp is missing or invalid",
  );
  assertTimestampedSignature(canary?.candidate?.authenticode, "updater candidate MSI");
  assertTrue(
    /^[0-9a-f]{64}$/i.test(String(canary?.candidate?.tauriSignatureSha256 || "")),
    "updater candidate Tauri signature hash is missing or malformed",
  );
  assertTrue(
    Number.isInteger(canary?.candidate?.bytes) && canary.candidate.bytes > 0,
    "updater candidate byte count is missing or invalid",
  );
  assertEqual(
    canary?.updater?.downloadedBytes,
    canary?.candidate?.bytes,
    "updater downloaded byte count",
  );
  assertTrue(canary?.updater?.metadataRequests >= 1, "updater metadata request was not observed");
  assertTrue(canary?.updater?.candidateRequests >= 1, "updater candidate download was not observed");
  assertTrue(
    canary?.updater?.signatureVerifiedByTauriUpdater === true,
    "Tauri updater signature verification was not proved",
  );
  assertTrue(
    canary?.updater?.installerLaunchRequested === true,
    "Tauri updater installer launch was not proved",
  );
  assertTrue(
    canary?.updater?.updaterDrivenRelaunch === true,
    "Tauri updater-driven relaunch was not proved",
  );
  for (const [label, evidence] of [
    ["handoff", canary?.updater?.handoffReceipt],
    ["runtime", canary?.updater?.runtimeReceipt],
  ]) {
    assertTrue(Boolean(evidence?.file), `updater ${label} receipt filename is missing`);
    assertTrue(
      Number.isInteger(evidence?.bytes) && evidence.bytes > 0,
      `updater ${label} receipt byte count is missing or invalid`,
    );
    assertTrue(
      /^[0-9a-f]{64}$/i.test(String(evidence?.sha256 || "")),
      `updater ${label} receipt hash is missing or malformed`,
    );
  }
  assertTimestampedSignature(canary?.installed?.signature, "updater-installed executable");
  assertEqual(canary?.installed?.version, expectedVersion, "updater-installed version");
  assertTrue(canary?.installed?.resourcesPresent === true, "updater-installed resources were not proved");
  assertTrue(canary?.rendererReady === true, "updater-installed renderer readiness was not proved");
  assertEqual(canary?.postRestartVersion, expectedVersion, "updater post-restart version");
  assertTrue(
    /^[0-9a-f]{64}$/i.test(String(canary?.installed?.sha256 || "")),
    "updater-installed executable hash is missing or malformed",
  );

  if (allowInitialSignedChannel) {
    assertEqual(canary?.mode, "self-reinstall", "first-channel updater mode");
    assertTrue(
      canary?.initialSignedChannelWaiverUsed === true,
      "first-channel updater canary did not record its waiver",
    );
    assertEqual(canary?.fromVersion, expectedVersion, "first-channel updater baseline version");
    assertTrue(
      canary?.upgradePersistenceProved === false,
      "first-channel self-reinstall cannot claim an older-version upgrade",
    );
  } else {
    assertEqual(canary?.mode, "upgrade", "updater mode");
    assertTrue(
      canary?.initialSignedChannelWaiverUsed === false,
      "normal updater gate used the first-channel waiver",
    );
    assertTrue(
      isOlderVersion(canary?.fromVersion, expectedVersion),
      "updater canary did not start from an older version",
    );
    assertTrue(
      canary?.upgradePersistenceProved === true,
      "updater canary did not prove upgrade persistence",
    );
  }
}

function isOlderVersion(actual, expected) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(value || ""));
    return match ? match.slice(1, 4).map(Number) : null;
  };
  const left = parse(actual);
  const right = parse(expected);
  if (!left || !right) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
}

function assertPhysicalSeal(seal) {
  assertEqual(seal?.schemaVersion, 1, "physical gate seal schema");
  assertEqual(seal?.status, "physical-release-gate-passed", "physical gate seal status");
  assertEqual(seal?.releaseTag, releaseTag, "physical gate seal release tag");
  assertEqual(seal?.expectedVersion, expectedVersion, "physical gate seal expected version");
  assertEqual(String(seal?.sourceSha || "").toLowerCase(), sourceSha, "physical gate seal source SHA");
  assertEqual(String(seal?.githubRunId || ""), physicalGateRunId, "physical gate seal GitHub run ID");
  assertEqual(
    String(seal?.githubRunAttempt || ""),
    physicalGateRunAttempt,
    "physical gate seal GitHub run attempt",
  );
  assertEqual(seal?.runnerName, physicalGateRunnerName, "physical gate seal runner name");
  assertTrue(
    !Number.isNaN(Date.parse(seal?.generatedAt)),
    "physical gate seal generatedAt timestamp is missing or invalid",
  );

  assertReceiptEqual(seal?.manifest, receipt(manifestPath), "physical gate manifest");
  assertReceiptEqual(
    seal?.evidence?.runnerPreflight,
    receipt(runnerPreflightPath),
    "sealed runner preflight",
  );
  assertReceiptEqual(seal?.evidence?.candidate, receipt(candidatePath), "sealed candidate");
  assertReceiptEqual(seal?.evidence?.updater, receipt(updaterPath), "sealed updater canary");
  assertReceiptEqual(seal?.evidence?.provider, receipt(providerFile.path), "sealed provider");
  assertReceiptEqual(seal?.evidence?.packages, receipt(packagePath), "sealed package proof");
}

function assertReceiptEqual(actual, expected, label) {
  assertEqual(actual?.file, expected.file, `${label} filename`);
  assertEqual(actual?.bytes, expected.bytes, `${label} byte size`);
  assertEqual(String(actual?.sha256 || "").toLowerCase(), expected.sha256, `${label} SHA-256`);
}

function fail(message) {
  console.error(`publish evidence rejected: ${message}`);
  process.exit(1);
}
