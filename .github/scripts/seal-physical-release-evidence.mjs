import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const evidenceDir = resolve(process.env.EVIDENCE_DIR || "artifacts");
const assetsDir = resolve(process.env.RELEASE_ASSETS_DIR || "candidate-assets");
const outputPath = resolve(
  process.env.PHYSICAL_GATE_SEAL ||
    join(evidenceDir, "windows-release-seal", "physical-gate-receipt.json"),
);

const releaseTag = requireEnv("RELEASE_TAG");
const expectedVersion = requireEnv("EXPECTED_VERSION").replace(/^v/, "");
const sourceSha = requireEnv("RELEASE_SOURCE_SHA").toLowerCase();
const githubRunId = requireEnv("GITHUB_RUN_ID");
const githubRunAttempt = requireEnv("GITHUB_RUN_ATTEMPT");
const runnerName = requireEnv("RUNNER_NAME");

if (releaseTag !== `v${expectedVersion}`) {
  fail(`release tag ${releaseTag} does not match expected version ${expectedVersion}`);
}
if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
  fail("RELEASE_SOURCE_SHA must be a full 40-character Git commit SHA");
}
if (!/^[1-9][0-9]*$/.test(githubRunId)) {
  fail("GITHUB_RUN_ID must be a positive integer");
}
if (!/^[1-9][0-9]*$/.test(githubRunAttempt)) {
  fail("GITHUB_RUN_ATTEMPT must be a positive integer");
}
if (runnerName.length > 128 || /[\r\n]/.test(runnerName)) {
  fail("RUNNER_NAME is invalid");
}

const manifestPath = join(assetsDir, "release-manifest.json");
const candidatePath = findExactlyOne("windows-release-candidate.json");
const updaterPath = findExactlyOne("windows-updater-canary.json");
const providerPath = findExactlyOne(/^atelier-provider-smoke-.*\.json$/);
const inAppLoginPath = findExactlyOne(/^atelier-in-app-login-.*\.json$/);
const packagePath = findExactlyOne("windows-package-smoke.json");
const runnerPreflightPath = findExactlyOne("windows-runner-preflight.json");
const signedChannelHistoryPath = findExactlyOne("signed-channel-history.json");
const provider = readJson(providerPath);
const inAppLogin = readJson(inAppLoginPath);

assertReleaseMetadata(provider, "provider");
assertReleaseMetadata(inAppLogin, "in-app login");
assertInAppLoginReceipt(inAppLogin);
if (canonicalJson(provider.inAppLogin) !== canonicalJson(inAppLogin)) {
  fail("provider receipt does not embed the exact in-app login receipt");
}

const seal = {
  schemaVersion: 2,
  status: "physical-release-gate-passed",
  releaseTag,
  expectedVersion,
  sourceSha,
  githubRunId,
  githubRunAttempt: Number(githubRunAttempt),
  runnerName,
  generatedAt: new Date().toISOString(),
  manifest: receipt(manifestPath),
  evidence: {
    runnerPreflight: receipt(runnerPreflightPath),
    signedChannelHistory: receipt(signedChannelHistoryPath),
    candidate: receipt(candidatePath),
    updater: receipt(updaterPath),
    provider: receipt(providerPath),
    inAppLogin: receipt(inAppLoginPath),
    packages: receipt(packagePath),
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(seal, null, 2)}\n`, "utf8");
console.log(`physical release evidence sealed at ${outputPath}`);

function findExactlyOne(matcher) {
  const files = findFiles(evidenceDir, matcher);
  if (files.length !== 1) {
    fail(`expected exactly one ${String(matcher)} evidence file, found ${files.length}`);
  }
  return files[0];
}

function findFiles(root, matcher) {
  if (!existsSync(root)) return [];
  const matches = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findFiles(path, matcher));
    } else if (
      entry.isFile() &&
      (typeof matcher === "string" ? entry.name === matcher : matcher.test(entry.name))
    ) {
      matches.push(path);
    }
  }
  return matches;
}

function receipt(path) {
  if (!existsSync(path)) fail(`required evidence file is missing: ${path}`);
  const data = readFileSync(path);
  return {
    file: basename(path),
    bytes: statSync(path).size,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    fail(`invalid JSON in ${path}: ${error.message}`);
  }
}

function canonicalJson(value) {
  return JSON.stringify(value, (_key, current) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    return Object.fromEntries(
      Object.entries(current).sort(([left], [right]) => left.localeCompare(right)),
    );
  });
}

function assertReleaseMetadata(payload, label) {
  if (payload?.releaseTag !== releaseTag) fail(`${label} release tag mismatch`);
  if (payload?.expectedVersion !== expectedVersion) fail(`${label} expected version mismatch`);
  if (String(payload?.sourceSha || "").toLowerCase() !== sourceSha) {
    fail(`${label} source SHA mismatch`);
  }
  if (String(payload?.githubRunId || "") !== githubRunId) {
    fail(`${label} GitHub run ID mismatch`);
  }
  if (String(payload?.githubRunAttempt || "") !== githubRunAttempt) {
    fail(`${label} GitHub run attempt mismatch`);
  }
  if (payload?.runnerName !== runnerName) fail(`${label} runner name mismatch`);
}

function assertInAppLoginReceipt(payload) {
  if (payload?.schemaVersion !== 1) fail("in-app login receipt schema mismatch");
  if (payload?.ok !== true) fail("in-app login receipt did not pass");
  if (payload?.failure != null) fail("in-app login receipt contains a failure");
  const providers = Array.isArray(payload?.providers) ? payload.providers : [];
  if (providers.length !== 2) fail("in-app login receipt must contain exactly two providers");
  for (const providerName of ["codex", "claude"]) {
    const witness = providers.find((entry) => entry?.provider === providerName);
    if (
      !witness ||
      witness.loginButtonClicked !== true ||
      witness.loginModalObserved !== true ||
      witness.loginPendingStateObserved !== true ||
      witness.authenticatedStateObserved !== true ||
      witness.connectedStateObserved !== true
    ) {
      fail(`in-app login receipt is incomplete for ${providerName}`);
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function fail(message) {
  console.error(`physical evidence seal failed: ${message}`);
  process.exit(1);
}
