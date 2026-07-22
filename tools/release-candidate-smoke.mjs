import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "atelier-release-candidate-"));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const version = String(packageJson.version);
const tag = `v${version}`;
const sourceSha = "1".repeat(40);
const signature = Buffer.alloc(96, 7).toString("base64");
const assets = {
  macDmg: `Atelier_${version}_universal.dmg`,
  macUpdater: `Atelier_universal.app.tar.gz`,
  windowsMsi: `Atelier_${version}_x64_en-US.msi`,
  windowsNsis: `Atelier_${version}_x64-setup.exe`,
};

function run(script, env = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      RELEASE_ASSETS_DIR: root,
      RELEASE_TAG: tag,
      RELEASE_SOURCE_SHA: sourceSha,
      ...env,
    },
  });
}

try {
  for (const name of Object.values(assets)) {
    writeFileSync(join(root, name), `fixture:${name}\n`, "utf8");
  }
  for (const name of [assets.macUpdater, assets.windowsMsi, assets.windowsNsis]) {
    writeFileSync(join(root, `${name}.sig`), `${signature}\n`, "utf8");
  }
  const url = (name) => `https://github.com/BYKAYLE/atelier/releases/download/${tag}/${name}`;
  const latest = {
    version,
    notes: "fixture",
    pub_date: "2026-07-22T00:00:00.000Z",
    platforms: {},
  };
  for (const platform of [
    "darwin-aarch64",
    "darwin-aarch64-app",
    "darwin-x86_64",
    "darwin-x86_64-app",
  ]) {
    latest.platforms[platform] = { url: url(assets.macUpdater), signature };
  }
  latest.platforms["windows-x86_64"] = {
    url: url(assets.windowsMsi),
    signature,
  };
  latest.platforms["windows-x86_64-msi"] = {
    url: url(assets.windowsMsi),
    signature,
  };
  latest.platforms["windows-x86_64-nsis"] = {
    url: url(assets.windowsNsis),
    signature,
  };
  writeFileSync(join(root, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");

  const seal = run(".github/scripts/seal-release-candidate.mjs");
  if (seal.status !== 0) throw new Error(`fixture seal failed:\n${seal.stderr}${seal.stdout}`);
  const verify = run(".github/scripts/verify-release-candidate.mjs");
  if (verify.status !== 0) throw new Error(`fixture verify failed:\n${verify.stderr}${verify.stdout}`);

  writeFileSync(join(root, assets.windowsMsi), "tampered\n", "utf8");
  const tampered = run(".github/scripts/verify-release-candidate.mjs");
  if (tampered.status === 0) throw new Error("tampered candidate was accepted");

  rmSync(join(root, "release-manifest.json"));
  rmSync(join(root, `${assets.windowsNsis}.sig`));
  const missingSignature = run(".github/scripts/seal-release-candidate.mjs");
  if (missingSignature.status === 0) throw new Error("candidate without an updater signature was sealed");

  console.log("release candidate smoke: seal, verify, tamper rejection, and signature rejection passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
