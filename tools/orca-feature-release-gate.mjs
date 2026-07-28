import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
const manifest = "src-tauri/Cargo.toml";
const npmEntrypoint = process.env.npm_execpath;

const coreSmokeScripts = [
  "smoke:feature-boundaries",
  "smoke:feature-settings",
  "smoke:settings-navigation",
  "smoke:connections-layout",
  "smoke:stella-safety",
  "smoke:agent-permission-capability",
  "smoke:preview-capability",
  "smoke:preview-evidence",
  "smoke:session-runs",
  "harness:parallel-agent",
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
    const error = new Error(`failed to start ${label}: ${result.error.message}`);
    error.exitCode = 1;
    throw error;
  }
  if (result.status !== 0) {
    const error = new Error(`${label} exited with ${result.status ?? "no status"}`);
    error.exitCode = result.status || 1;
    throw error;
  }
}

function runNpm(args, options = {}) {
  if (npmEntrypoint) {
    run(process.execPath, [npmEntrypoint, ...args], options);
    return;
  }
  run("npm", args, options);
}

let gateError;
let restrictedBuildStarted = false;

try {
  for (const script of smokeScripts) {
    runNpm(["run", script]);
  }

  restrictedBuildStarted = true;
  runNpm(["run", "build"], {
    env: { VITE_ATELIER_FEATURES: "atelier-cli" },
  });
  runNpm(["run", "smoke:feature-bundle"]);

  runNpm(["run", "build"], {
    env: { VITE_ATELIER_FEATURES: "mobile-control" },
  });
  runNpm(["run", "smoke:feature-dependency-bundle"]);

  run(cargo, ["test", "--manifest-path", manifest, "--lib", "safety_guard_"]);
  run(cargo, ["test", "--manifest-path", manifest, "--lib", "gajecode_cli_"]);
  run(cargo, ["test", "--manifest-path", manifest, "--lib", "managed_agent_permission_support_"]);
  run(cargo, [
    "test",
    "--manifest-path",
    manifest,
    "--lib",
    "unsupported_managed_agent_send_fails_closed_before_spawn",
  ]);
  run(cargo, [
    "test",
    "--manifest-path",
    manifest,
    "--lib",
    "run_agent_cli_command_fails_closed_before_validation_or_spawn",
  ]);
  run(cargo, [
    "test",
    "--manifest-path",
    manifest,
    "--lib",
    "preview_capability_reports_shared_fail_closed_reason",
  ]);
  run(cargo, [
    "test",
    "--manifest-path",
    manifest,
    "--lib",
    "managed_preview_execution_fails_closed_before_spawn",
  ]);
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
} catch (error) {
  gateError = error;
} finally {
  if (restrictedBuildStarted) {
    try {
      console.log("\n[orca-feature-gate] Restore full production frontend bundle");
      runNpm(["run", "build"], {
        env: { VITE_ATELIER_FEATURES: "" },
      });
    } catch (restoreError) {
      if (gateError) {
        console.error(`[orca-feature-gate] production bundle restore also failed: ${restoreError.message}`);
      } else {
        gateError = restoreError;
      }
    }
  }
}

if (gateError) {
  console.error(`[orca-feature-gate] ${gateError.message}`);
  process.exitCode = gateError.exitCode || 1;
} else {
  console.log(`\nOrca feature release gate passed (${smokeScripts.length + 2} contract smokes, ${cargoFeatures.length} removable backend features).`);
}
