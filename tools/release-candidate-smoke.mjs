import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "atelier-release-candidate-"));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const version = String(packageJson.version);
const tag = `v${version}`;
const sourceSha = "1".repeat(40);
const releaseRepository = "BYKAYLE/atelier";
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
      RELEASE_REPOSITORY: releaseRepository,
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
  const digest = (name) =>
    createHash("sha256").update(readFileSync(join(root, name))).digest("hex");
  const executableSha = "e".repeat(64);
  const verifiedApp = {
    version,
    executableSha256: executableSha,
    codesignVerified: true,
    developerIdApplication: true,
    gatekeeperAccepted: true,
    notarizationStapled: true,
  };
  const macosEvidence = {
      schemaVersion: 1,
      status: "verified",
      releaseRepository,
      releaseTag: tag,
      version,
      sourceSha,
      signing: {
        appIdentity: "Developer ID Application: Atelier Test (ABCDEFGHIJ)",
        dmgIdentity: "Developer ID Application: Atelier Test (ABCDEFGHIJ)",
        teamIdentifier: "ABCDEFGHIJ",
      },
      artifacts: {
        builtApp: verifiedApp,
        dmg: {
          name: assets.macDmg,
          sha256: digest(assets.macDmg),
          codesignVerified: true,
          developerIdApplication: true,
          gatekeeperAccepted: true,
          notarizationStapled: true,
          embeddedApp: verifiedApp,
        },
        updater: {
          name: assets.macUpdater,
          sha256: digest(assets.macUpdater),
          embeddedApp: verifiedApp,
        },
      },
      consistency: { versionsMatch: true, executableHashesMatch: true },
  };
  const writeMacosEvidence = () =>
    writeFileSync(
      join(root, "macos-release-evidence.json"),
      `${JSON.stringify(macosEvidence, null, 2)}\n`,
      "utf8",
    );
  writeMacosEvidence();
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

  rmSync(join(root, "release-manifest.json"));
  macosEvidence.artifacts.updater.embeddedApp = {
    ...verifiedApp,
    executableSha256: "f".repeat(64),
  };
  writeMacosEvidence();
  const mismatchedMacApp = run(".github/scripts/seal-release-candidate.mjs");
  if (mismatchedMacApp.status === 0) {
    throw new Error("candidate with mismatched macOS executable hashes was sealed");
  }
  macosEvidence.artifacts.updater.embeddedApp = verifiedApp;
  writeMacosEvidence();

  const originalUrl = latest.platforms["darwin-aarch64"].url;
  latest.platforms["darwin-aarch64"].url =
    `https://example.invalid/BYKAYLE/atelier/releases/download/${tag}/${assets.macUpdater}`;
  writeFileSync(join(root, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");
  const externalUrl = run(".github/scripts/seal-release-candidate.mjs");
  if (externalUrl.status === 0) throw new Error("external updater URL was sealed");
  latest.platforms["darwin-aarch64"].url = originalUrl;
  writeFileSync(join(root, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");

  latest.platforms["future-target"] = {
    url: `https://example.invalid/${assets.macUpdater}`,
    signature,
  };
  writeFileSync(join(root, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");
  const externalExtraPlatform = run(".github/scripts/seal-release-candidate.mjs");
  if (externalExtraPlatform.status === 0) {
    throw new Error("unsealed extra updater platform was accepted");
  }
  delete latest.platforms["future-target"];
  writeFileSync(join(root, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");

  const wrongRepository = run(".github/scripts/seal-release-candidate.mjs", {
    RELEASE_REPOSITORY: "BYKAYLE/not-atelier",
  });
  if (wrongRepository.status === 0) throw new Error("repository-mismatched evidence was sealed");

  const reseal = run(".github/scripts/seal-release-candidate.mjs");
  if (reseal.status !== 0) throw new Error(`fixture reseal failed:\n${reseal.stderr}${reseal.stdout}`);

  writeFileSync(join(root, assets.windowsMsi), "tampered\n", "utf8");
  const tampered = run(".github/scripts/verify-release-candidate.mjs");
  if (tampered.status === 0) throw new Error("tampered candidate was accepted");

  rmSync(join(root, "release-manifest.json"));
  rmSync(join(root, `${assets.windowsNsis}.sig`));
  const missingSignature = run(".github/scripts/seal-release-candidate.mjs");
  if (missingSignature.status === 0) throw new Error("candidate without an updater signature was sealed");

  console.log("release candidate smoke: identity, all-platform URL, seal, tamper, and signature gates passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
