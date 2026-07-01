import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const latestJsonPath = process.env.LATEST_JSON_PATH ?? 'release-assets/latest.json';
const signedAssetsDir = process.env.SIGNED_ASSETS_DIR ?? 'release-assets/windows';
const releaseOwner = process.env.RELEASE_OWNER;
const releaseRepo = process.env.RELEASE_REPO;
const releaseTag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
const preferWindowsInstaller = (process.env.PREFER_WINDOWS_INSTALLER ?? 'msi').toLowerCase();
// Keep the generic Windows target for already-installed Atelier builds that
// still use Tauri's default `windows-x86_64` updater platform. Newer builds pass
// explicit MSI/NSIS targets, but older builds cannot update without this entry.
// Prefer MSI for the generic compatibility key because it upgrades the existing
// Windows product/shortcuts more reliably than launching a setup.exe side by side.
const includeGenericWindowsTarget = process.env.INCLUDE_WINDOWS_GENERIC_TARGET !== 'false';

if (!releaseOwner || !releaseRepo || !releaseTag) {
  throw new Error('RELEASE_OWNER, RELEASE_REPO and RELEASE_TAG/GITHUB_REF_NAME are required');
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const fallbackVersion = releaseTag.replace(/^v/, '');
const version = packageJson.version || fallbackVersion;

let latest = {
  version,
  notes: '',
  pub_date: new Date().toISOString(),
  platforms: {},
};

if (existsSync(latestJsonPath)) {
  const existing = JSON.parse(readFileSync(latestJsonPath, 'utf8'));
  latest = {
    ...latest,
    ...existing,
    version,
    pub_date: new Date().toISOString(),
    platforms: existing.platforms ?? {},
  };
}

const files = readdirSync(signedAssetsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => ['.exe', '.msi'].includes(extname(name).toLowerCase()))
  .sort();

if (files.length === 0) {
  throw new Error(`No signed Windows installer files found in ${signedAssetsDir}`);
}

function extractUpdaterSignature(raw, file) {
  const text = raw.trim();
  const publicSignature = text.match(/Public signature:\s*([A-Za-z0-9+/=]+)/i)?.[1]?.trim();
  const signature = publicSignature || text;
  if (!signature) {
    throw new Error(`Updater signature was empty for ${file}`);
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(signature)) {
    throw new Error(`Updater signature for ${file} contains non-base64 text`);
  }
  if (signature.length < 80) {
    throw new Error(`Updater signature for ${file} is unexpectedly short`);
  }
  return signature;
}

const entries = [];
for (const file of files) {
  const signaturePath = join(signedAssetsDir, `${file}.sig`);
  if (!existsSync(signaturePath)) {
    throw new Error(`Missing updater signature for ${file}`);
  }

  const bundle = extname(file).toLowerCase() === '.msi' ? 'msi' : 'nsis';
  const encodedTag = encodeURIComponent(releaseTag);
  const encodedFile = encodeURIComponent(basename(file));
  entries.push({
    bundle,
    signature: extractUpdaterSignature(readFileSync(signaturePath, 'utf8'), file),
    url: `https://github.com/${releaseOwner}/${releaseRepo}/releases/download/${encodedTag}/${encodedFile}`,
  });
}

for (const entry of entries) {
  latest.platforms[`windows-x86_64-${entry.bundle}`] = {
    signature: entry.signature,
    url: entry.url,
  };
}

delete latest.platforms['windows-x86_64'];

if (includeGenericWindowsTarget) {
  const preferred = entries.find((entry) => entry.bundle === preferWindowsInstaller) ?? entries[0];
  latest.platforms['windows-x86_64'] = {
    signature: preferred.signature,
    url: preferred.url,
  };
}

writeFileSync(latestJsonPath, `${JSON.stringify(latest, null, 2)}\n`);
