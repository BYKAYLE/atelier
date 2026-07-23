import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { resolveReleaseRepository } from "./release-contract.mjs";

const historyPath = resolve(requireEnv("RELEASE_HISTORY_PATH"));
const outputPath = resolve(
  process.env.SIGNED_CHANNEL_HISTORY_RECEIPT ||
    "artifacts/windows-signed-channel-history/signed-channel-history.json",
);
const releaseTag = requireEnv("RELEASE_TAG");
const sourceSha = requireEnv("RELEASE_SOURCE_SHA").toLowerCase();
const githubRunId = requireEnv("GITHUB_RUN_ID");
const githubRunAttempt = requireEnv("GITHUB_RUN_ATTEMPT");
const releaseRepository = resolveReleaseRepository();

if (!/^v\d+\.\d+\.\d+(?:[-+].+)?$/.test(releaseTag)) {
  fail(`invalid release tag: ${releaseTag}`);
}
if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
  fail("RELEASE_SOURCE_SHA must be a full 40-character Git commit SHA");
}
if (!/^[1-9][0-9]*$/.test(githubRunId) || !/^[1-9][0-9]*$/.test(githubRunAttempt)) {
  fail("GitHub run identity is missing or invalid");
}
if (!existsSync(historyPath)) {
  fail(`release history is missing: ${historyPath}`);
}

let history;
try {
  history = JSON.parse(readFileSync(historyPath, "utf8").replace(/^\uFEFF/, ""));
} catch (error) {
  fail(`release history is not valid JSON: ${error.message}`);
}

const releases = flattenReleasePages(history);
const currentPublicRelease = releases.find(
  (release) => release?.tag_name === releaseTag && release?.draft !== true,
);
if (currentPublicRelease) {
  fail(`release tag is already public: ${releaseTag}`);
}

const publicReleases = releases.filter(
  (release) =>
    release &&
    release.draft !== true &&
    release.prerelease !== true &&
    release.tag_name !== releaseTag,
);
const qualifyingBaselines = publicReleases
  .filter(hasSignedChannelContract)
  .sort((left, right) => publishedAt(right) - publishedAt(left));
const baseline = qualifyingBaselines[0] || null;

const receipt = {
  schemaVersion: 1,
  phase: "signed-channel-history",
  status: baseline ? "baseline-required" : "initial-channel-eligible",
  derivedFrom: "github-public-release-history",
  releaseRepository: releaseRepository.slug,
  releaseTag,
  sourceSha,
  githubRunId,
  githubRunAttempt,
  checkedReleaseCount: releases.length,
  checkedPublicReleaseCount: publicReleases.length,
  initialSignedChannelEligible: baseline == null,
  qualifyingBaseline: baseline
    ? {
        tag: baseline.tag_name,
        publishedAt: baseline.published_at,
        assetNames: assetNames(baseline),
      }
    : null,
  generatedAt: new Date().toISOString(),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(
  baseline
    ? `signed-channel baseline found: ${baseline.tag_name}`
    : "no prior signed-channel baseline found; one initial install is eligible",
);

function flattenReleasePages(value) {
  if (!Array.isArray(value)) fail("release history must be a JSON array");
  if (value.every(Array.isArray)) return value.flat();
  if (value.some(Array.isArray)) fail("release history page structure is inconsistent");
  return value;
}

function hasSignedChannelContract(release) {
  const names = new Set(assetNames(release).map((name) => name.toLowerCase()));
  const hasMsi = [...names].some((name) => name.endsWith(".msi"));
  const hasMsiSignature = [...names].some((name) => name.endsWith(".msi.sig"));
  return (
    names.has("release-manifest.json") &&
    names.has("latest.json") &&
    hasMsi &&
    hasMsiSignature
  );
}

function assetNames(release) {
  return Array.isArray(release?.assets)
    ? release.assets.map((asset) => String(asset?.name || "")).filter(Boolean).sort()
    : [];
}

function publishedAt(release) {
  const timestamp = Date.parse(release?.published_at || release?.created_at || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
