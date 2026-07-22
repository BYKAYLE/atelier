import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(process.cwd(), "dist", "atelier-feature-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const expectedEnabled = ["mobile-control", "remote-followup"];

function sameIds(actual, expected) {
  return Array.isArray(actual)
    && [...actual].sort().join("\n") === [...expected].sort().join("\n");
}

if (!sameIds(manifest.enabledFeatureIds, expectedEnabled)) {
  throw new Error(
    `Feature dependency expansion drifted: ${JSON.stringify(manifest.enabledFeatureIds)}`,
  );
}
if (!sameIds(manifest.compiledFeatureIds, expectedEnabled)) {
  throw new Error(
    `Feature dependency bundle drifted: ${JSON.stringify(manifest.compiledFeatureIds)}`,
  );
}

const mobile = manifest.featurePackages.find((feature) => feature.id === "mobile-control");
if (!mobile || !sameIds(mobile.dependencies, ["remote-followup"])) {
  throw new Error("Mobile control must declare remote-followup as its only package dependency");
}

console.log("Feature dependency bundle smoke passed (mobile-control auto-includes remote-followup). ");
