import assert from "node:assert/strict";

import {
  RELEASE_CREDENTIAL_NAMES,
  evaluateReleasePreflight,
  normalizeGitHubRepository,
  parseCargoPackageVersion,
} from "./release-preflight.mjs";

const repository = "BYKAYLE/atelier";
const version = "9.8.7";
const packageJson = {
  version,
  repository: { url: `https://github.com/${repository}.git` },
};
const cargoToml = `[package]\nname = "atelier"\nversion = "${version}"\n`;
const tauriConfig = {
  version,
  bundle: { createUpdaterArtifacts: true },
  plugins: {
    updater: {
      endpoints: [`https://github.com/${repository}/releases/latest/download/latest.json`],
      pubkey: "public-key",
    },
  },
};
const storeConfig = { bundle: { createUpdaterArtifacts: false } };
const credentialSentinel = "super-secret-value";
const credentialEnv = Object.fromEntries(
  RELEASE_CREDENTIAL_NAMES.map((name) => [name, credentialSentinel]),
);

assert.equal(parseCargoPackageVersion(cargoToml), version);
assert.equal(normalizeGitHubRepository("git@github.com:BYKAYLE/atelier.git"), repository);

const passing = evaluateReleasePreflight({
  packageJson,
  cargoToml,
  tauriConfig,
  storeConfig,
  env: credentialEnv,
  tag: `v${version}`,
  repository,
  sourceCommit: "abc123",
  trackedSourceClean: true,
});
assert.equal(passing.verdict, "source-preflight-passed");
assert.deepEqual(passing.blockers, []);
assert.deepEqual(passing.missingCredentials, []);
assert.ok(
  !JSON.stringify(passing).includes(credentialSentinel),
  "preflight report must not serialize credential values",
);

const blocked = evaluateReleasePreflight({
  packageJson: { ...packageJson, version: "9.8.6" },
  cargoToml,
  tauriConfig: {
    ...tauriConfig,
    plugins: { updater: { endpoints: ["https://example.com/latest.json"], pubkey: "" } },
  },
  storeConfig: { bundle: { createUpdaterArtifacts: true } },
  env: {},
  tag: `v${version}`,
  repository: "someone/else",
  trackedSourceClean: false,
});
for (const expected of [
  "version-alignment",
  "github-updater-endpoint",
  "store-updater-isolation",
  "updater-public-key",
  "release-tag",
  "workflow-repository-binding",
  "tracked-source-clean",
  "release-credentials",
]) {
  assert.ok(blocked.blockers.includes(expected), `missing expected blocker ${expected}`);
}
assert.deepEqual(blocked.missingCredentials, RELEASE_CREDENTIAL_NAMES);

console.log("release preflight smoke: pass");
