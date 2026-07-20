import assert from "node:assert/strict";
import { findSourceControlFeature, resolveExternalPanel } from "../src/components/workbench/sourceControlPanels.ts";

const github = { id: "github" } as const;
const linear = { id: "linear" } as const;
const allFeatures = [github, linear];

assert.equal(resolveExternalPanel(allFeatures, null), null);
assert.equal(resolveExternalPanel(allFeatures, "github"), "github");
assert.equal(resolveExternalPanel([linear], "github"), null);
assert.equal(resolveExternalPanel([github], "github"), "github");

assert.equal(findSourceControlFeature(allFeatures, "linear")?.id, "linear");
assert.equal(findSourceControlFeature([github], "linear"), undefined);

console.log("changes workbench toggle smoke passed");
