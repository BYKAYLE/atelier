import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const npmEntrypoint = process.env.npm_execpath;
const distRoot = resolve(process.cwd(), "dist");
const sentinelPath = resolve(distRoot, ".feature-bundle-smoke-sentinel");
const sentinelValue = "feature-bundle-dist-sentinel";

function run(command, args, options = {}) {
  const label = [command, ...args].join(" ");
  console.log(`[feature-bundle-smoke-regression] ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw new Error(`[feature-bundle-smoke-regression] failed to start ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[feature-bundle-smoke-regression] ${label} exited with ${result.status ?? "no status"}`);
  }
}

function runNpm(args, env = process.env) {
  if (npmEntrypoint) {
    run(process.execPath, [npmEntrypoint, ...args], { env });
    return;
  }
  run("npm", args, { env });
}

function runBundledSmoke(featureSet, smokeScript) {
  const outDir = mkdtempSync(join(tmpdir(), "atelier-feature-bundle-smoke-regression-"));
  let failure;
  try {
    const buildEnv = {
      ...process.env,
      VITE_ATELIER_FEATURES: featureSet,
      ATELIER_FEATURE_BUNDLE_OUT_DIR: outDir,
    };
    runNpm(["run", "build"], buildEnv);
    runNpm(["run", smokeScript], buildEnv);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch (cleanupError) {
      if (failure) {
        console.error(`[feature-bundle-smoke-regression] failed cleanup ${outDir}: ${cleanupError.message}`);
      } else {
        throw cleanupError;
      }
    }
  }
}

mkdirSync(distRoot, { recursive: true });
const sentinelPreexisted = existsSync(sentinelPath);
if (!sentinelPreexisted) {
  writeFileSync(sentinelPath, sentinelValue, "utf8");
}
const expectedSentinel = readFileSync(sentinelPath, "utf8");

try {
  runBundledSmoke("atelier-cli", "smoke:feature-bundle");

  if (readFileSync(sentinelPath, "utf8") !== expectedSentinel) {
    throw new Error("Existing default dist sentinel changed during feature bundle smoke run");
  }

  runBundledSmoke("mobile-control", "smoke:feature-dependency-bundle");

  if (readFileSync(sentinelPath, "utf8") !== expectedSentinel) {
    throw new Error("Existing default dist sentinel changed during feature dependency smoke run");
  }

  console.log("Feature bundle isolation regression passed (dist sentinel preserved, dependency smoke follows bundled smoke).");
} finally {
  if (!sentinelPreexisted) {
    rmSync(sentinelPath, { force: true });
  }
}
