import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const assetsDir = process.env.RELEASE_ASSETS_DIR ?? "candidate-assets";
const expectedTag = process.env.RELEASE_TAG ?? "";
const expectedSourceSha = process.env.RELEASE_SOURCE_SHA ?? "";
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const expectedVersion = String(packageJson.version);
const manifestPath = join(assetsDir, "release-manifest.json");

if (!existsSync(manifestPath)) {
  throw new Error(`Candidate manifest does not exist: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1 || manifest.status !== "signed-draft-candidate") {
  throw new Error("Candidate manifest schema or status is not publishable");
}
if (manifest.releaseChannel !== "github-draft") {
  throw new Error("Candidate must be sealed from the private GitHub draft channel");
}
if (manifest.version !== expectedVersion || manifest.releaseTag !== `v${expectedVersion}`) {
  throw new Error(
    `Candidate version mismatch: expected v${expectedVersion}, found ${manifest.releaseTag}`,
  );
}
if (expectedTag && manifest.releaseTag !== expectedTag) {
  throw new Error(`Candidate tag mismatch: expected ${expectedTag}, found ${manifest.releaseTag}`);
}
if (expectedSourceSha && manifest.sourceSha !== expectedSourceSha) {
  throw new Error(
    `Candidate source mismatch: expected ${expectedSourceSha}, found ${manifest.sourceSha}`,
  );
}
if (!/^[0-9a-f]{40}$/i.test(String(manifest.sourceSha))) {
  throw new Error("Candidate source SHA must be a full 40-character Git commit SHA");
}

const actualFiles = readdirSync(assetsDir)
  .filter((name) => name !== "release-manifest.json")
  .filter((name) => statSync(join(assetsDir, name)).isFile())
  .sort();
const manifestFiles = (manifest.assets ?? []).map((entry) => entry.name).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(manifestFiles)) {
  throw new Error(
    `Candidate asset set changed after sealing. actual=${actualFiles.join(",")} manifest=${manifestFiles.join(",")}`,
  );
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

for (const entry of manifest.assets) {
  const path = join(assetsDir, entry.name);
  const bytes = statSync(path).size;
  const digest = sha256(path);
  if (entry.bytes !== bytes || entry.sha256 !== digest) {
    throw new Error(`Candidate asset changed after sealing: ${entry.name}`);
  }
}

const requiredPrimaryAssets = [
  "macDmg",
  "macUpdater",
  "windowsMsi",
  "windowsNsis",
  "updaterMetadata",
];
for (const key of requiredPrimaryAssets) {
  const name = manifest.primaryAssets?.[key];
  if (!name || !actualFiles.includes(name)) {
    throw new Error(`Candidate manifest is missing primary asset ${key}`);
  }
}

const latestPath = join(assetsDir, manifest.primaryAssets.updaterMetadata);
const latest = JSON.parse(readFileSync(latestPath, "utf8"));
if (latest.version !== manifest.version) {
  throw new Error("Updater metadata version differs from the sealed candidate version");
}
const requiredPlatforms = [
  "darwin-aarch64",
  "darwin-aarch64-app",
  "darwin-x86_64",
  "darwin-x86_64-app",
  "windows-x86_64",
  "windows-x86_64-msi",
  "windows-x86_64-nsis",
];
for (const platform of requiredPlatforms) {
  const entry = latest.platforms?.[platform];
  const expectedAsset = manifest.platformAssets?.[platform];
  if (!entry?.url || !entry.signature || !expectedAsset) {
    throw new Error(`Updater metadata is missing sealed platform ${platform}`);
  }
  const actualAsset = decodeURIComponent(basename(new URL(entry.url).pathname));
  if (actualAsset !== expectedAsset || !actualFiles.includes(actualAsset)) {
    throw new Error(`Updater platform ${platform} no longer matches the sealed asset`);
  }
  const signatureFile = `${actualAsset}.sig`;
  const signatureText = readFileSync(join(assetsDir, signatureFile), "utf8").trim();
  const signature =
    signatureText.match(/Public signature:\s*([A-Za-z0-9+/=]+)/i)?.[1] ?? signatureText;
  if (String(entry.signature).trim() !== signature.trim()) {
    throw new Error(`Updater platform ${platform} signature changed after sealing`);
  }
}

console.log(
  `verified ${manifest.releaseTag} candidate from ${manifest.sourceSha} with ${manifest.assets.length} assets`,
);
