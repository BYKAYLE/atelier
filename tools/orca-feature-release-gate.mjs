import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
const manifest = "src-tauri/Cargo.toml";
const npmEntrypoint = process.env.npm_execpath;

const coreSmokeScripts = [
  "smoke:feature-boundaries",
  "smoke:feature-settings",
  "smoke:session-runs",
  "smoke:workbench",
];

const componentsRoot = resolve(process.cwd(), "src", "components");
const featurePackages = readdirSync(componentsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((id) => existsSync(resolve(componentsRoot, id, "feature.tsx")))
  .sort()
  .map((id) => JSON.parse(readFileSync(resolve(componentsRoot, id, "feature.manifest.json"), "utf8")));
const smokeScripts = [
  ...coreSmokeScripts.slice(0, 2),
  ...featurePackages.map((feature) => feature.smokeScript),
  ...coreSmokeScripts.slice(2),
];
const cargoFeatures = featurePackages.map((feature) => feature.rustFeature);

function run(command, args, options = {}) {
  const label = [command, ...args].join(" ");
  console.log(`\n[orca-feature-gate] ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw new Error(`[orca-feature-gate] failed to start ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[orca-feature-gate] ${label} exited with ${result.status ?? "no status"}`);
  }
}

function runNpm(args, options = {}) {
  if (npmEntrypoint) {
    run(process.execPath, [npmEntrypoint, ...args], options);
    return;
  }
  run("npm", args, options);
}

function withFeatureBundleSmoke(enabledFeatures, smokeScript) {
  const outDir = mkdtempSync(join(tmpdir(), "atelier-feature-bundle-smoke-"));
  let failure;
  try {
    const buildEnv = {
      ...process.env,
      VITE_ATELIER_FEATURES: enabledFeatures,
      ATELIER_FEATURE_BUNDLE_OUT_DIR: outDir,
    };
    runNpm(["run", "build"], { env: buildEnv });
    runNpm(["run", smokeScript], { env: buildEnv });
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch (cleanupError) {
      if (failure) {
        console.error(`[orca-feature-gate] failed to cleanup ${outDir}: ${cleanupError.message}`);
      } else {
        throw cleanupError;
      }
    }
  }
}

try {
  for (const script of smokeScripts) {
    runNpm(["run", script]);
  }

  withFeatureBundleSmoke("atelier-cli", "smoke:feature-bundle");
  withFeatureBundleSmoke("mobile-control", "smoke:feature-dependency-bundle");

  run(cargo, ["check", "--manifest-path", manifest, "--no-default-features"]);
  for (const feature of cargoFeatures) {
    run(cargo, [
      "check",
      "--manifest-path",
      manifest,
      "--no-default-features",
      "--features",
      feature,
    ]);
  }

  console.log(`\nOrca feature release gate passed (${smokeScripts.length + 2} contract smokes, ${cargoFeatures.length} removable backend features).`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
