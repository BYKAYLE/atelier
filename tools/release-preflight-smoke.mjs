import assert from "node:assert/strict";

import {
  RELEASE_CREDENTIAL_NAMES,
  evaluateReleasePreflight,
  normalizeGitHubRepository,
  parseCargoPackageVersion,
  releaseCredentialPresenceFlag,
} from "./release-preflight.mjs";
import {
  REQUIRED_REPOSITORY_SECRET_NAMES,
  REQUIRED_REPOSITORY_VARIABLE_NAMES,
  evaluateGitHubReleaseReadiness,
  evaluateHostReleaseReadiness,
} from "./release-readiness-probes.mjs";
import { classifyUntrackedPaths } from "./repo-hygiene.mjs";

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
  RELEASE_CREDENTIAL_NAMES.map((name) => [releaseCredentialPresenceFlag(name), "true"]),
);
const rawCredentialEnv = Object.fromEntries(
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

const rawCredentialPassing = evaluateReleasePreflight({
  packageJson,
  cargoToml,
  tauriConfig,
  storeConfig,
  env: rawCredentialEnv,
  tag: `v${version}`,
  repository,
  trackedSourceClean: true,
});
assert.deepEqual(rawCredentialPassing.missingCredentials, []);
assert.ok(
  !JSON.stringify(rawCredentialPassing).includes(credentialSentinel),
  "local raw credentials must remain redacted",
);

const explicitMissingCredential = evaluateReleasePreflight({
  packageJson,
  cargoToml,
  tauriConfig,
  storeConfig,
  env: {
    ...rawCredentialEnv,
    [releaseCredentialPresenceFlag("APPLE_CERTIFICATE")]: "false",
  },
  tag: `v${version}`,
  repository,
  trackedSourceClean: true,
});
assert.deepEqual(explicitMissingCredential.missingCredentials, ["APPLE_CERTIFICATE"]);

const releaseHostSnapshot = {
  platform: "darwin",
  inspected: true,
  applicable: true,
  tools: {
    security: true,
    codesign: true,
    spctl: true,
    hdiutil: true,
    notarytool: true,
    stapler: true,
  },
  developerIdApplicationIdentities: ["Developer ID Application: Atelier (TEAM123456)"],
  configuredSigningIdentityPresent: true,
  configuredSigningIdentityAvailable: true,
  errors: [],
};
const githubReleaseSnapshot = {
  repository,
  inspected: true,
  secretNames: [...REQUIRED_REPOSITORY_SECRET_NAMES],
  variableNames: [...REQUIRED_REPOSITORY_VARIABLE_NAMES],
  environmentNames: ["production-release"],
  productionEnvironment: {
    name: "production-release",
    requiredReviewerCount: 1,
    branchPolicyProtected: true,
  },
  runners: [
    {
      name: "physical-windows-release",
      status: "online",
      busy: false,
      labels: ["self-hosted", "windows", "x64"],
    },
  ],
  errors: [],
};
assert.ok(evaluateHostReleaseReadiness(releaseHostSnapshot).every((entry) => entry.status !== "fail"));
assert.ok(
  evaluateGitHubReleaseReadiness(githubReleaseSnapshot).every((entry) => entry.status !== "fail"),
);

const infrastructurePassing = evaluateReleasePreflight({
  packageJson,
  cargoToml,
  tauriConfig,
  storeConfig,
  env: credentialEnv,
  tag: `v${version}`,
  repository,
  sourceCommit: "abc123",
  trackedSourceClean: true,
  hostReleaseSnapshot: releaseHostSnapshot,
  githubReleaseSnapshot,
  requireEnvironmentCredentials: false,
});
assert.equal(infrastructurePassing.verdict, "release-infrastructure-preflight-passed");
assert.equal(infrastructurePassing.phase, "release-infrastructure-preflight");
assert.deepEqual(infrastructurePassing.evaluatedScopes, [
  "source",
  "release-host",
  "github-infrastructure",
]);
assert.equal(infrastructurePassing.environmentCredentialsInspected, false);
assert.deepEqual(infrastructurePassing.missingCredentials, []);
assert.ok(!JSON.stringify(infrastructurePassing).includes(credentialSentinel));

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

// Repo-root hygiene: foreign untracked paths must block, allowed-layout
// untracked paths must not, and a missing inventory is only skipped.
const hygieneClassification = classifyUntrackedPaths([
  "src/components/New.tsx",
  "tools/new-smoke.mjs",
  "SOT/notes.md",
  "scripts/migrate_foreign_crons.py",
  "tmp_scrape_output.html",
  "reports/internal.md",
]);
assert.deepEqual(hygieneClassification.foreign, [
  "scripts/migrate_foreign_crons.py",
  "tmp_scrape_output.html",
  "reports/internal.md",
]);

const hygieneBlocked = evaluateReleasePreflight({
  packageJson,
  cargoToml,
  tauriConfig,
  storeConfig,
  env: credentialEnv,
  tag: `v${version}`,
  repository,
  sourceCommit: "abc123",
  trackedSourceClean: true,
  untrackedPaths: ["scripts/migrate_foreign_crons.py"],
});
assert.ok(
  hygieneBlocked.blockers.includes("repo-hygiene-untracked"),
  "foreign untracked paths must block the preflight",
);

const hygienePassing = evaluateReleasePreflight({
  packageJson,
  cargoToml,
  tauriConfig,
  storeConfig,
  env: credentialEnv,
  tag: `v${version}`,
  repository,
  sourceCommit: "abc123",
  trackedSourceClean: true,
  untrackedPaths: ["tools/new-smoke.mjs", "SOT/notes.md"],
});
assert.ok(
  !hygienePassing.blockers.includes("repo-hygiene-untracked"),
  "allowed-layout untracked paths must not block the preflight",
);
assert.deepEqual(hygienePassing.blockers, []);

const hygieneSkipped = evaluateReleasePreflight({
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
assert.ok(
  hygieneSkipped.checks.some(
    (entry) => entry.id === "repo-hygiene-untracked" && entry.status === "not-evaluated",
  ),
  "a missing untracked inventory must be reported as not evaluated",
);

const infrastructureBlocked = evaluateReleasePreflight({
  packageJson,
  cargoToml,
  tauriConfig,
  storeConfig,
  env: credentialEnv,
  trackedSourceClean: true,
  hostReleaseSnapshot: {
    platform: "darwin",
    inspected: true,
    applicable: true,
    tools: { security: true, codesign: true, spctl: true, hdiutil: true, notarytool: false, stapler: false },
    developerIdApplicationIdentities: [],
    configuredSigningIdentityPresent: true,
    configuredSigningIdentityAvailable: false,
    errors: [],
  },
  githubReleaseSnapshot: {
    repository,
    inspected: true,
    secretNames: [],
    variableNames: [],
    environmentNames: [],
    productionEnvironment: null,
    runners: [],
    errors: [],
  },
  requireEnvironmentCredentials: false,
});
for (const expected of [
  "macos-release-tools",
  "macos-developer-id-identity",
  "macos-configured-signing-identity",
  "github-release-secrets",
  "github-release-variables",
  "github-production-environment",
  "github-production-reviewer",
  "github-windows-runner-registration",
  "github-windows-runner-online",
]) {
  assert.ok(infrastructureBlocked.blockers.includes(expected), `missing infrastructure blocker ${expected}`);
}

console.log("release preflight smoke: pass");
