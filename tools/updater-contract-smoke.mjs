import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const fixtureRoot = mkdtempSync(join(tmpdir(), "atelier-updater-contract-"));
const signedDir = join(fixtureRoot, "signed");
const latestPath = join(fixtureRoot, "latest.json");
const script = join(root, ".github", "scripts", "update-tauri-latest-json.mjs");
const signatureMsi = "A".repeat(96);
const signatureNsis = "B".repeat(96);

function runUpdater(signedAssetsDir, latestJsonPath) {
  return spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      LATEST_JSON_PATH: latestJsonPath,
      SIGNED_ASSETS_DIR: signedAssetsDir,
      RELEASE_OWNER: "BYKAYLE",
      RELEASE_REPO: "atelier",
      RELEASE_TAG: "v0.1.86",
      PREFER_WINDOWS_INSTALLER: "msi",
    },
  });
}

try {
  mkdirSync(signedDir, { recursive: true });
  writeFileSync(join(signedDir, "Atelier_0.1.86_x64_en-US.msi"), "fixture-msi");
  writeFileSync(join(signedDir, "Atelier_0.1.86_x64-setup.exe"), "fixture-nsis");
  writeFileSync(join(signedDir, "Atelier_0.1.86_x64_en-US.msi.sig"), signatureMsi);
  writeFileSync(join(signedDir, "Atelier_0.1.86_x64-setup.exe.sig"), signatureNsis);
  writeFileSync(
    latestPath,
    `${JSON.stringify({
      version: "0.1.85",
      platforms: {
        "darwin-aarch64": { signature: "C".repeat(96), url: "https://example.invalid/mac" },
      },
    })}\n`,
  );

  const success = runUpdater(signedDir, latestPath);
  if (success.status !== 0) {
    throw new Error(success.stderr || success.stdout || "updater contract generation failed");
  }

  const latest = JSON.parse(readFileSync(latestPath, "utf8"));
  const platforms = latest.platforms ?? {};
  for (const key of ["windows-x86_64", "windows-x86_64-msi", "windows-x86_64-nsis", "darwin-aarch64"]) {
    if (!platforms[key]) throw new Error(`missing updater platform: ${key}`);
  }
  if (!platforms["windows-x86_64"].url.endsWith(".msi")) {
    throw new Error("generic Windows updater key must prefer MSI for upgrade continuity");
  }
  if (platforms["windows-x86_64-msi"].signature !== signatureMsi) {
    throw new Error("MSI updater signature changed during metadata generation");
  }
  if (platforms["windows-x86_64-nsis"].signature !== signatureNsis) {
    throw new Error("NSIS updater signature changed during metadata generation");
  }

  const missingSigRoot = join(fixtureRoot, "missing-signature");
  mkdirSync(missingSigRoot, { recursive: true });
  writeFileSync(join(missingSigRoot, "Atelier_0.1.86_x64_en-US.msi"), "fixture-msi");
  const rejected = runUpdater(missingSigRoot, join(fixtureRoot, "rejected-latest.json"));
  if (rejected.status === 0 || !`${rejected.stderr}${rejected.stdout}`.includes("Missing updater signature")) {
    throw new Error("unsigned Windows updater fixture was not rejected");
  }

  console.log(JSON.stringify({
    ok: true,
    platforms: Object.keys(platforms).sort(),
    genericWindowsBundle: "msi",
    unsignedFixtureRejected: true,
  }));
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
