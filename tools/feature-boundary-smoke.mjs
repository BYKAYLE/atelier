import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const features = [
  ["atelier-cli", "src/components/atelier-cli/feature.tsx", "orca-atelier-cli", "atelier_cli"],
  ["github-workflows", "src/components/github-workflows/feature.tsx", "orca-github-workflows", "github_workflows"],
  ["linear-workflows", "src/components/linear-workflows/feature.tsx", "orca-linear-workflows", "linear_workflows"],
  ["ssh-workspaces", "src/components/ssh-workspaces/feature.tsx", "orca-ssh-workspaces", "ssh_workspaces"],
  ["provider-usage", "src/components/provider-usage/feature.tsx", "orca-provider-usage", "provider_usage"],
  ["remote-followup", "src/components/remote-followup/feature.tsx", "orca-remote-followup", "remote_followup"],
  ["mobile-control", "src/components/mobile-control/feature.tsx", "orca-mobile-control", "mobile_control"],
  ["computer-use", "src/components/computer-use/feature.tsx", "orca-computer-use", "computer_use"],
];

const registry = read("src/features/featureRegistry.tsx");
const viteConfig = read("vite.config.ts");
const cargo = read("src-tauri/Cargo.toml");
const rustRoot = read("src-tauri/src/lib.rs");

expect(
  registry.includes('from "virtual:atelier-feature-modules"'),
  "frontend feature registry must consume the generated feature manifest",
);
expect(
  viteConfig.includes('existsSync(join(componentsRoot, id, "feature.tsx"))'),
  "Vite must auto-discover feature.tsx modules",
);
expect(
  viteConfig.includes("Excluded Atelier features leaked into the frontend bundle"),
  "Vite must reject excluded feature code in the frontend bundle",
);

for (const [id, descriptorPath, cargoFeature, rustModule] of features) {
  const descriptor = read(descriptorPath);
  expect(descriptor.includes(`id: "${id}"`), `${descriptorPath} must register ${id}`);
  expect(cargo.includes(`${cargoFeature} =`), `Cargo feature ${cargoFeature} is missing`);
  expect(
    rustRoot.includes(`#[cfg(feature = "${cargoFeature}")]\nmod ${rustModule};`),
    `${rustModule} must be removable behind ${cargoFeature}`,
  );
}

const forbiddenImports = [
  ["src/components/AgentWorkspace.tsx", 'from "./atelier-cli"'],
  ["src/components/ConnectionsPanel.tsx", 'from "./provider-usage"'],
  ["src/components/ConnectionsPanel.tsx", 'from "./ssh-workspaces"'],
  ["src/components/Settings.tsx", 'from "./mobile-control"'],
  ["src/components/mobile-control/RemoteAccessSection.tsx", 'from "../remote-followup"'],
  ["src/components/mobile-control/RemoteAccessSection.tsx", 'from "../computer-use"'],
  ["src/components/workbench/ChangesWorkbench.tsx", 'from "../github-workflows"'],
  ["src/components/workbench/ChangesWorkbench.tsx", 'from "../linear-workflows"'],
];

for (const [hostPath, importText] of forbiddenImports) {
  expect(!read(hostPath).includes(importText), `${hostPath} directly owns ${importText}`);
}

if (failures.length > 0) {
  console.error("Feature boundary smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Feature boundary smoke passed (${features.length} removable Orca modules).`);
