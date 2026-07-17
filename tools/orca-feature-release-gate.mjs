import { spawnSync } from "node:child_process";

const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
const manifest = "src-tauri/Cargo.toml";
const npmEntrypoint = process.env.npm_execpath;

const smokeScripts = [
  "smoke:feature-boundaries",
  "smoke:atelier-cli",
  "smoke:github-workflows",
  "smoke:linear-workflows",
  "smoke:ssh-workspaces",
  "smoke:provider-usage",
  "smoke:mobile-control",
  "smoke:remote-followup",
  "smoke:computer-use",
  "smoke:workbench",
];

const cargoFeatures = [
  "orca-atelier-cli",
  "orca-github-workflows",
  "orca-linear-workflows",
  "orca-ssh-workspaces",
  "orca-provider-usage",
  "orca-remote-followup",
  "orca-mobile-control",
  "orca-computer-use",
];

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
    console.error(`[orca-feature-gate] failed to start ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[orca-feature-gate] ${label} exited with ${result.status ?? "no status"}`);
    process.exit(result.status || 1);
  }
}

function runNpm(args, options = {}) {
  if (npmEntrypoint) {
    run(process.execPath, [npmEntrypoint, ...args], options);
    return;
  }
  run("npm", args, options);
}

for (const script of smokeScripts) {
  runNpm(["run", script]);
}

runNpm(["run", "build"], {
  env: { VITE_ATELIER_FEATURES: "atelier-cli" },
});
runNpm(["run", "smoke:feature-bundle"]);

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

console.log(`\nOrca feature release gate passed (${smokeScripts.length + 1} contract smokes, ${cargoFeatures.length} removable backend features).`);
