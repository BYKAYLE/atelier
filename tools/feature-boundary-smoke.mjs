import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const componentsRoot = resolve(root, "src", "components");
const features = readdirSync(componentsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((id) => existsSync(resolve(componentsRoot, id, "feature.tsx")))
  .sort()
  .map((id) => {
    const manifestPath = `src/components/${id}/feature.manifest.json`;
    expect(existsSync(resolve(root, manifestPath)), `${id} must own feature.manifest.json`);
    const manifest = JSON.parse(read(manifestPath));
    return { ...manifest, descriptorPath: `src/components/${id}/feature.tsx` };
  });

const registry = read("src/features/featureRegistry.tsx");
const viteConfig = read("vite.config.ts");
const cargo = read("src-tauri/Cargo.toml");
const rustRoot = read("src-tauri/src/lib.rs");

expect(
  registry.includes('from "virtual:atelier-feature-modules"'),
  "frontend feature registry must consume the generated feature manifest",
);
expect(registry.includes("settingsPage?: FeatureSettingsPageContribution"), "feature modules must own detachable settings pages");
expect(registry.includes("background?: React.ComponentType"), "feature modules must own detachable background services");
expect(
  viteConfig.includes('existsSync(join(componentsRoot, id, "feature.tsx"))'),
  "Vite must auto-discover feature.tsx modules",
);
expect(
  viteConfig.includes("Excluded Atelier features leaked into the frontend bundle"),
  "Vite must reject excluded feature code in the frontend bundle",
);

const featureById = new Map(features.map((feature) => [feature.id, feature]));
for (const feature of features) {
  const { id, descriptorPath, rustFeature: cargoFeature, rustModule } = feature;
  const descriptor = read(descriptorPath);
  expect(feature.schemaVersion === 1, `${id} must use feature manifest schema 1`);
  expect(descriptor.includes(`id: "${id}"`), `${descriptorPath} must register ${id}`);
  expect(cargo.includes(`${cargoFeature} =`), `Cargo feature ${cargoFeature} is missing`);
  expect(
    rustRoot.includes(`#[cfg(feature = "${cargoFeature}")]\nmod ${rustModule};`),
    `${rustModule} must be removable behind ${cargoFeature}`,
  );
  expect(feature.smokeScript?.startsWith("smoke:"), `${id} must declare a smoke script`);

  const declaredCargoDependencies = (cargo.match(
    new RegExp(`^${cargoFeature.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")} = \\[(.*?)\\]$`, "m"),
  )?.[1] ?? "")
    .split(",")
    .map((value) => value.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .sort();
  const expectedCargoDependencies = feature.dependencies
    .map((dependencyId) => {
      const dependency = featureById.get(dependencyId);
      expect(Boolean(dependency), `${id} declares unknown dependency ${dependencyId}`);
      return dependency?.rustFeature ?? "";
    })
    .filter(Boolean)
    .sort();
  expect(
    JSON.stringify(declaredCargoDependencies) === JSON.stringify(expectedCargoDependencies),
    `${id} Cargo dependencies must match its package manifest`,
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
