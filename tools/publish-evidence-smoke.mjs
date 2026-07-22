import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "atelier-publish-evidence-"));
const assets = join(root, "assets");
const evidence = join(root, "evidence");
mkdirSync(assets);
mkdirSync(evidence);

const tag = "v0.2.12";
const version = "0.2.12";
const sourceSha = "a".repeat(40);
const msiSha = "b".repeat(64);
const nsisSha = "c".repeat(64);
const runId = "123456789";
const installedPath = "C:\\Program Files\\Atelier\\Atelier.exe";
const candidatePath = join(evidence, "windows-release-candidate.json");
const providerPath = join(evidence, "atelier-provider-smoke-20260722-120000.json");
const packagePath = join(evidence, "windows-package-smoke.json");

writeJson(join(assets, "release-manifest.json"), {
  schemaVersion: 1,
  status: "signed-draft-candidate",
  releaseChannel: "github-draft",
  releaseTag: tag,
  version,
  sourceSha,
  primaryAssets: {
    windowsMsi: "Atelier_0.2.12_x64_en-US.msi",
    windowsNsis: "Atelier_0.2.12_x64-setup.exe",
  },
  assets: [
    { name: "Atelier_0.2.12_x64_en-US.msi", bytes: 42, sha256: msiSha },
    { name: "Atelier_0.2.12_x64-setup.exe", bytes: 43, sha256: nsisSha },
  ],
});

try {
  resetValidUpgrade();
  run(true, "valid upgrade evidence");

  let provider = readJson(providerPath);
  provider.browserProcessEvidence.visibleWindow = false;
  writeJson(providerPath, provider);
  run(false, "hidden browser window");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.loginResults.claudeAuthOk = false;
  writeJson(providerPath, provider);
  run(false, "missing Claude authentication");

  resetValidUpgrade();
  provider = readJson(providerPath);
  provider.githubRunId = "987654321";
  writeJson(providerPath, provider);
  run(false, "provider receipt from another run");

  resetValidUpgrade();
  const candidate = candidateFixture();
  candidate.githubRunId = "987654321";
  writeJson(candidatePath, candidate);
  run(false, "candidate receipt from another run");

  resetValidUpgrade();
  const packages = packageFixture();
  packages.githubRunId = "987654321";
  writeJson(packagePath, packages);
  run(false, "package receipt from another run");

  resetWaiverCandidate();
  run(true, "approved first-channel waiver", true);
  run(false, "unapproved first-channel waiver", false);

  const contradictory = candidateFixture();
  contradictory.initialSignedChannelWaiverUsed = true;
  writeJson(candidatePath, contradictory);
  run(false, "contradictory upgrade and waiver", true);
  console.log("publish evidence smoke passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function resetValidUpgrade() {
  writeJson(candidatePath, candidateFixture());
  writeJson(providerPath, providerFixture());
  writeJson(packagePath, packageFixture());
}

function resetWaiverCandidate() {
  resetValidUpgrade();
  const candidate = candidateFixture();
  candidate.initialSignedChannelWaiverUsed = true;
  candidate.upgradePersistenceProved = false;
  writeJson(candidatePath, candidate);
}

function candidateFixture() {
  return {
    schemaVersion: 1,
    releaseTag: tag,
    sourceSha,
    expectedVersion: version,
    githubRunId: runId,
    interactiveDesktop: true,
    initialSignedChannelWaiverUsed: false,
    installer: { sha256: msiSha, signature: { status: "Valid" } },
    installed: {
      path: installedPath,
      version,
      signature: { status: "Valid" },
      resourcesPresent: true,
    },
    rendererReady: true,
    postRestartVersion: version,
    upgradePersistenceProved: true,
  };
}

function packageFixture() {
  const payload = {
    version,
    resourcesPresent: true,
    signatureStatus: "Valid",
  };
  return {
    schemaVersion: 1,
    releaseTag: tag,
    sourceSha,
    expectedVersion: version,
    githubRunId: runId,
    packages: {
      msi: { sha256: msiSha, signatureStatus: "Valid", payload },
      nsis: { sha256: nsisSha, signatureStatus: "Valid", payload },
      msix: null,
    },
  };
}

function providerFixture() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-22T12:00:00.000Z",
    releaseTag: tag,
    sourceSha,
    expectedVersion: version,
    githubRunId: runId,
    providers: [
      { command: "codex", exists: true, versionOk: true, authOk: true },
      { command: "claude", exists: true, versionOk: true, authOk: true },
    ],
    browserProbe: true,
    browserHelperProbe: true,
    browserProcessEvidence: { observed: true, visibleWindow: true },
    installedApp: {
      found: true,
      path: installedPath.toUpperCase(),
      version,
      versionOk: true,
      signatureOk: true,
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

function run(shouldPass, label, allowWaiver = false) {
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
      PHYSICAL_GATE_RUN_ID: runId,
      ALLOW_INITIAL_SIGNED_CHANNEL: String(allowWaiver),
      REQUIRE_SMART_APP_CONTROL_EVIDENCE: "true",
    },
  });
  if ((result.status === 0) !== shouldPass) {
    throw new Error(`${label} produced unexpected status ${result.status}:\n${result.stdout}\n${result.stderr}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
