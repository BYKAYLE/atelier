import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function flatten(source) {
  return source.replace(/\s+/g, " ").trim();
}

const workflowSource = read(".github/workflows/windows-package-verify.yml");
const workflow = flatten(workflowSource);
const installedSmokeSource = read("tools/windows-installed-package-smoke.ps1");
const installedSmoke = flatten(installedSmokeSource);
const verifyConfig = JSON.parse(read("src-tauri/tauri.windows-verify.conf.json"));
const storeConfig = JSON.parse(read("src-tauri/tauri.microsoftstore.conf.json"));
const storeWorkflow = flatten(read(".github/workflows/windows-store.yml"));
const packageSmoke = flatten(read("tools/windows-package-smoke.ps1"));

assert.deepEqual(
  [...verifyConfig.bundle.targets].sort(),
  ["msi", "nsis"],
  "Windows verification must build both MSI and NSIS bundles",
);
assert.equal(
  verifyConfig.bundle.createUpdaterArtifacts,
  false,
  "unsigned package verification must not create updater signatures",
);

assert.match(
  workflow,
  /node tools\/windows-installed-package-contract-smoke\.mjs/,
  "Windows CI must run the cross-platform static package contract",
);
assert.match(
  workflow,
  /windows-installed-package-smoke\.ps1 -SelfTest/,
  "Windows CI must exercise PowerShell package-selection and marker logic",
);

const installedRuns = [...workflow.matchAll(
  /windows-installed-package-smoke\.ps1 -BundleType (msi|nsis)(?: |$)/g,
)].map((match) => match[1]);
assert.deepEqual(
  installedRuns.sort(),
  ["msi", "nsis"],
  "Windows CI must run exactly one real installed-package smoke for MSI and NSIS",
);
assert.match(
  workflow,
  /windows-installed-package-smoke\.ps1 -BundleType msi -ProbeBrowserHandoff/,
  "the updater-primary MSI install must retain the installed browser-handoff proof",
);
assert.match(workflowSource, /bundle\/msi\/\*\.msi/);
assert.match(workflowSource, /bundle\/nsis\/\*\.exe/);

for (const contract of [
  /\[ValidateSet\("msi", "nsis"\)\]/,
  /function Find-BundleInstaller/,
  /function New-InstallerCommand/,
  /function Assert-AtelierExecutableIdentity/,
  /if \(\$InstalledIdentity\.Marker -ne \$ExpectedBundle\)/,
  /-ExpectedBundle \$BundleType/,
  /for \(\$cycle = 1; \$cycle -le 2; \$cycle\+\+\)/,
  /readyAtUnixMs -ge \$cycleStartedAtUnixMs/,
  /function Wait-AtelierUninstallCleanup/,
  /Wrong bundle marker was not rejected/,
]) {
  assert.match(installedSmoke, contract, `installed-package smoke is missing contract ${contract}`);
}
assert.doesNotMatch(
  installedSmoke,
  /\$InstalledIdentity\.Marker -ne "nsis"/,
  "installed identity must be selected by BundleType, not hard-coded to NSIS",
);

assert.deepEqual(
  storeConfig.bundle.targets,
  ["msi"],
  "the separate Tauri Store MSI candidate configuration must be preserved",
);
assert.equal(storeConfig.bundle.createUpdaterArtifacts, false);
assert.match(storeWorkflow, /npm run store:msix/);
assert.match(storeWorkflow, /tools\/windows-package-smoke\.ps1/);
assert.match(storeWorkflow, /output\/windows-store\/\*\.msix/);
assert.match(packageSmoke, /-Filter "\*\.msix"/);
assert.match(packageSmoke, /AppxManifest\.xml/);

console.log(JSON.stringify({
  ok: true,
  installedBundles: installedRuns.sort(),
  primaryUpdaterBundle: "msi",
  powerShellLogicSelfTest: true,
  restartCycles: 2,
  uninstallCleanupRequired: true,
  storePackagingPreserved: true,
}));
