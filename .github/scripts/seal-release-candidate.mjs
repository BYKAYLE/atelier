import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

const assetsDir = process.env.RELEASE_ASSETS_DIR ?? "candidate-assets";
const releaseTag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
const sourceSha = process.env.RELEASE_SOURCE_SHA ?? process.env.GITHUB_SHA;
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const expectedVersion = String(packageJson.version);

if (!releaseTag || !sourceSha) {
  throw new Error("RELEASE_TAG and RELEASE_SOURCE_SHA are required");
}
if (releaseTag !== `v${expectedVersion}`) {
  throw new Error(`Release tag ${releaseTag} does not match package version ${expectedVersion}`);
}
if (!existsSync(assetsDir)) {
  throw new Error(`Release assets directory does not exist: ${assetsDir}`);
}

const files = readdirSync(assetsDir)
  .filter((name) => name !== "release-manifest.json")
  .filter((name) => statSync(join(assetsDir, name)).isFile())
  .sort();

function requireOne(label, predicate) {
  const matches = files.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label} must have exactly one asset; found ${matches.length}: ${matches.join(", ")}`);
  }
  return matches[0];
}

const macDmg = requireOne("macOS DMG", (name) => name.endsWith(".dmg"));
const macUpdater = requireOne("macOS updater archive", (name) => name.endsWith(".app.tar.gz"));
const windowsMsi = requireOne("Windows MSI", (name) => name.toLowerCase().endsWith(".msi"));
const windowsNsis = requireOne(
  "Windows NSIS installer",
  (name) => name.toLowerCase().endsWith(".exe"),
);
const latestName = requireOne("Tauri updater metadata", (name) => name === "latest.json");

function normalizedSignature(path) {
  const value = readFileSync(path, "utf8").trim();
  return value.match(/Public signature:\s*([A-Za-z0-9+/=]+)/i)?.[1] ?? value;
}

const updaterSignatures = new Map();
for (const installer of [macUpdater, windowsMsi, windowsNsis]) {
  const signature = `${installer}.sig`;
  if (!files.includes(signature)) {
    throw new Error(`Missing Tauri updater signature: ${signature}`);
  }
  const base64 = normalizedSignature(join(assetsDir, signature));
  if (!/^[A-Za-z0-9+/=]{80,}$/.test(base64.trim())) {
    throw new Error(`Updater signature is empty or malformed: ${signature}`);
  }
  updaterSignatures.set(installer, base64.trim());
}

const latest = JSON.parse(readFileSync(join(assetsDir, latestName), "utf8"));
if (latest.version !== expectedVersion) {
  throw new Error(`latest.json version mismatch: expected ${expectedVersion}, found ${latest.version}`);
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
const platformAssets = {
  "darwin-aarch64": macUpdater,
  "darwin-aarch64-app": macUpdater,
  "darwin-x86_64": macUpdater,
  "darwin-x86_64-app": macUpdater,
  "windows-x86_64": windowsMsi,
  "windows-x86_64-msi": windowsMsi,
  "windows-x86_64-nsis": windowsNsis,
};
for (const platform of requiredPlatforms) {
  const entry = latest.platforms?.[platform];
  if (!entry || !entry.url || !entry.signature) {
    throw new Error(`latest.json is missing a signed ${platform} entry`);
  }
  const assetName = decodeURIComponent(basename(new URL(entry.url).pathname));
  if (!files.includes(assetName)) {
    throw new Error(`latest.json ${platform} URL references a missing asset: ${assetName}`);
  }
  const expectedAsset = platformAssets[platform];
  if (assetName !== expectedAsset) {
    throw new Error(
      `latest.json ${platform} must reference ${expectedAsset}; found ${assetName}`,
    );
  }
  if (String(entry.signature).trim() !== updaterSignatures.get(expectedAsset)) {
    throw new Error(
      `latest.json ${platform} signature does not match ${expectedAsset}.sig`,
    );
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const manifest = {
  schemaVersion: 1,
  status: "signed-draft-candidate",
  releaseChannel: "github-draft",
  releaseTag,
  version: expectedVersion,
  sourceSha,
  generatedAt: new Date().toISOString(),
  publishRequirements: {
    explicitApproval: true,
    windowsPhysicalGate: true,
    macosDeveloperIdAndNotarization: true,
    windowsAuthenticode: true,
  },
  primaryAssets: {
    macDmg,
    macUpdater,
    windowsMsi,
    windowsNsis,
    updaterMetadata: latestName,
  },
  platformAssets,
  assets: files.map((name) => ({
    name,
    bytes: statSync(join(assetsDir, name)).size,
    sha256: sha256(join(assetsDir, name)),
  })),
};

writeFileSync(
  join(assetsDir, "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(`sealed ${releaseTag} with ${manifest.assets.length} signed candidate assets`);
