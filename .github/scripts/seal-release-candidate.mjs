import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  assertExactReleaseAssetUrl,
  releaseAssetNameFromUrl,
  resolveReleaseRepository,
} from "./release-contract.mjs";

const assetsDir = process.env.RELEASE_ASSETS_DIR ?? "candidate-assets";
const releaseTag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
const sourceSha = process.env.RELEASE_SOURCE_SHA ?? process.env.GITHUB_SHA;
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const expectedVersion = String(packageJson.version);
const releaseRepository = resolveReleaseRepository();

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
const macosEvidenceName = requireOne(
  "macOS release evidence",
  (name) => name === "macos-release-evidence.json",
);

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
const requiredPlatformAssets = {
  "darwin-aarch64": macUpdater,
  "darwin-aarch64-app": macUpdater,
  "darwin-x86_64": macUpdater,
  "darwin-x86_64-app": macUpdater,
  "windows-x86_64": windowsMsi,
  "windows-x86_64-msi": windowsMsi,
  "windows-x86_64-nsis": windowsNsis,
};
if (
  !latest.platforms ||
  typeof latest.platforms !== "object" ||
  Array.isArray(latest.platforms)
) {
  throw new Error("latest.json platforms must be an object");
}

const platformAssets = {};
for (const [platform, entry] of Object.entries(latest.platforms)) {
  if (!/^[A-Za-z0-9_.-]+$/.test(platform)) {
    throw new Error(`latest.json contains an unsafe platform key: ${platform}`);
  }
  if (!entry?.url || !entry?.signature) {
    throw new Error(`latest.json contains an unsigned ${platform} entry`);
  }
  const assetName = releaseAssetNameFromUrl(entry.url);
  assertExactReleaseAssetUrl(entry.url, releaseRepository, releaseTag, assetName);
  if (!files.includes(assetName)) {
    throw new Error(`latest.json ${platform} URL references a missing asset: ${assetName}`);
  }
  const sealedSignature = updaterSignatures.get(assetName);
  if (!sealedSignature) {
    throw new Error(`latest.json ${platform} references a non-updater asset: ${assetName}`);
  }
  if (String(entry.signature).trim() !== sealedSignature) {
    throw new Error(`latest.json ${platform} signature does not match ${assetName}.sig`);
  }
  platformAssets[platform] = assetName;
}

for (const platform of requiredPlatforms) {
  const entry = latest.platforms?.[platform];
  if (!entry || !entry.url || !entry.signature) {
    throw new Error(`latest.json is missing a signed ${platform} entry`);
  }
  const expectedAsset = requiredPlatformAssets[platform];
  assertExactReleaseAssetUrl(entry.url, releaseRepository, releaseTag, expectedAsset);
  if (platformAssets[platform] !== expectedAsset) {
    throw new Error(`latest.json ${platform} does not reference ${expectedAsset}`);
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const macosEvidence = JSON.parse(
  readFileSync(join(assetsDir, macosEvidenceName), "utf8"),
);
if (
  macosEvidence.schemaVersion !== 1 ||
  macosEvidence.status !== "verified" ||
  macosEvidence.releaseRepository !== releaseRepository.slug ||
  macosEvidence.releaseTag !== releaseTag ||
  macosEvidence.version !== expectedVersion ||
  String(macosEvidence.sourceSha).toLowerCase() !== String(sourceSha).toLowerCase()
) {
  throw new Error("macOS evidence identity does not match this release candidate");
}
const appIdentity = String(macosEvidence.signing?.appIdentity ?? "").trim();
const dmgIdentity = String(macosEvidence.signing?.dmgIdentity ?? "").trim();
const teamIdentifier = String(macosEvidence.signing?.teamIdentifier ?? "").trim();
if (
  !appIdentity.startsWith("Developer ID Application:") ||
  !dmgIdentity.startsWith("Developer ID Application:") ||
  !/^[A-Z0-9]{10}$/.test(teamIdentifier) ||
  !appIdentity.includes(`(${teamIdentifier})`) ||
  !dmgIdentity.includes(`(${teamIdentifier})`)
) {
  throw new Error("macOS evidence does not bind one Developer ID Application team");
}
for (const [key, expectedAsset] of [["dmg", macDmg], ["updater", macUpdater]]) {
  const evidence = macosEvidence.artifacts?.[key];
  if (evidence?.name !== expectedAsset) {
    throw new Error(`macOS evidence ${key} asset mismatch`);
  }
  if (String(evidence.sha256).toLowerCase() !== sha256(join(assetsDir, expectedAsset))) {
    throw new Error(`macOS evidence ${key} hash mismatch`);
  }
}
const verifiedApps = [
  macosEvidence.artifacts?.builtApp,
  macosEvidence.artifacts?.dmg?.embeddedApp,
  macosEvidence.artifacts?.updater?.embeddedApp,
];
for (const app of verifiedApps) {
  if (
    app?.version !== expectedVersion ||
    app?.codesignVerified !== true ||
    app?.developerIdApplication !== true ||
    app?.gatekeeperAccepted !== true ||
    app?.notarizationStapled !== true ||
    !/^[0-9a-f]{64}$/i.test(String(app?.executableSha256))
  ) {
    throw new Error("macOS embedded application evidence is incomplete or invalid");
  }
}
const executableHashes = verifiedApps.map((app) =>
  String(app.executableSha256).toLowerCase()
);
if (new Set(executableHashes).size !== 1) {
  throw new Error("macOS application executable hashes differ across release packages");
}
if (
  macosEvidence.artifacts?.dmg?.codesignVerified !== true ||
  macosEvidence.artifacts?.dmg?.developerIdApplication !== true ||
  macosEvidence.artifacts?.dmg?.gatekeeperAccepted !== true ||
  macosEvidence.artifacts?.dmg?.notarizationStapled !== true ||
  macosEvidence.consistency?.versionsMatch !== true ||
  macosEvidence.consistency?.executableHashesMatch !== true
) {
  throw new Error("macOS DMG or cross-package consistency evidence is incomplete");
}

const manifest = {
  schemaVersion: 2,
  status: "signed-draft-candidate",
  releaseChannel: "github-draft",
  releaseRepository: releaseRepository.slug,
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
    macosEvidence: macosEvidenceName,
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
