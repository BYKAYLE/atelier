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

const candidateFiles = findFiles(evidenceDir, "windows-release-candidate.json");
if (candidateFiles.length !== 1) {
  fail(`expected exactly one Windows candidate receipt, found ${candidateFiles.length}`);
}
const providerFiles = findFiles(evidenceDir, /^atelier-provider-smoke-.*\.json$/);
if (providerFiles.length !== 1) {
  fail(`expected exactly one Windows provider receipt, found ${providerFiles.length}`);
}
const packageFiles = findFiles(evidenceDir, "windows-package-smoke.json");
if (packageFiles.length !== 1) {
  fail(`expected exactly one Windows package receipt, found ${packageFiles.length}`);
}
const providerFile = { path: providerFiles[0], payload: readJson(providerFiles[0]) };
const candidatePath = candidateFiles[0];
const packagePath = packageFiles[0];
const candidate = readJson(candidatePath);
const packageProof = readJson(packagePath);
const provider = providerFile.payload;
const manifestPath = join(assetsDir, "release-manifest.json");
const manifest = readJson(manifestPath);

assertEqual(candidate.schemaVersion, 1, "candidate receipt schema");
assertEqual(candidate.releaseTag, releaseTag, "candidate release tag");
assertEqual(String(candidate.sourceSha || "").toLowerCase(), sourceSha, "candidate source SHA");
assertEqual(candidate.expectedVersion, expectedVersion, "candidate expected version");
assertEqual(String(candidate.githubRunId || ""), physicalGateRunId, "candidate GitHub run ID");
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
assertTrue(
  /^[0-9a-f]{64}$/i.test(String(candidate.installed?.sha256 || "")),
  "candidate installed executable hash is missing or malformed",
);
assertEqual(
  String(provider.installedApp?.sha256 || "").toLowerCase(),
  String(candidate.installed?.sha256 || "").toLowerCase(),
  "provider/candidate installed executable hash",
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
  validatedAt: new Date().toISOString(),
  initialSignedChannelWaiverAccepted:
    candidate.upgradePersistenceProved !== true && allowInitialSignedChannel,
  smartAppControlRequired: requireSmartAppControl,
  receipts: {
    candidate: receipt(candidatePath),
    provider: receipt(providerFile.path),
    packages: receipt(packagePath),
    manifest: receipt(manifestPath),
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
  const allowedModes = new Set([
    "new-or-recent-process",
    "existing-visible-default-browser",
  ]);
  assertTrue(
    allowedModes.has(evidence?.observationMode),
    `invalid browser observation mode: ${evidence?.observationMode || "missing"}`,
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

  if (evidence.observationMode === "existing-visible-default-browser") {
    const defaultBrowserNames = Array.isArray(evidence.defaultBrowserProcessNames)
      ? evidence.defaultBrowserProcessNames
          .filter((name) => typeof name === "string" && name.trim())
          .map((name) => name.trim().toLowerCase())
      : [];
    assertTrue(
      defaultBrowserNames.length > 0,
      "existing browser evidence is missing the default-browser process name",
    );
    assertTrue(
      visibleProcesses.some((process) =>
        defaultBrowserNames.includes(process.name.trim().toLowerCase()),
      ),
      "existing browser evidence does not match the configured default browser",
    );
  }
}

function fail(message) {
  console.error(`publish evidence rejected: ${message}`);
  process.exit(1);
}
