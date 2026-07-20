import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(process.cwd(), "dist", "atelier-feature-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const expectedEnabled = ["atelier-cli"];
const expectedExcluded = manifest.featurePackages
  .map((feature) => feature.id)
  .filter((id) => !expectedEnabled.includes(id));

function sameIds(actual, expected) {
  return Array.isArray(actual)
    && [...actual].sort().join("\n") === [...expected].sort().join("\n");
}

if (manifest.schemaVersion !== 1) {
  throw new Error(`Unexpected feature manifest schema: ${manifest.schemaVersion}`);
}
if (!Array.isArray(manifest.featurePackages) || manifest.featurePackages.length === 0) {
  throw new Error("Feature bundle manifest is missing package metadata");
}
if (!sameIds(manifest.enabledFeatureIds, expectedEnabled)) {
  throw new Error(`Restricted frontend enabled unexpected features: ${JSON.stringify(manifest.enabledFeatureIds)}`);
}
if (!sameIds(manifest.compiledFeatureIds, expectedEnabled)) {
  throw new Error(`Restricted frontend bundled unexpected features: ${JSON.stringify(manifest.compiledFeatureIds)}`);
}
if (!sameIds(manifest.excludedFeatureIds, expectedExcluded)) {
  throw new Error(`Restricted frontend excluded set drifted: ${JSON.stringify(manifest.excludedFeatureIds)}`);
}

console.log(`Frontend feature bundle smoke passed (1 included, ${expectedExcluded.length} physically excluded).`);
