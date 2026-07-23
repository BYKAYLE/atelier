import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectGitHubReleaseSnapshot,
  collectHostReleaseSnapshot,
  evaluateGitHubReleaseReadiness,
  evaluateHostReleaseReadiness,
} from "./release-readiness-probes.mjs";

export const RELEASE_CREDENTIAL_NAMES = Object.freeze([
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "SIGNPATH_API_TOKEN",
  "SIGNPATH_ORGANIZATION_ID",
  "SIGNPATH_PROJECT_SLUG",
]);

export function releaseCredentialPresenceFlag(name) {
  return `ATELIER_HAS_${name}`;
}

function releaseCredentialIsPresent(env, name) {
  const presence = env[releaseCredentialPresenceFlag(name)];
  if (presence !== undefined) {
    return ["1", "true", "yes"].includes(String(presence).trim().toLowerCase());
  }
  return typeof env[name] === "string" && env[name].trim() !== "";
}

function check(id, passed, message, actual = undefined) {
  return {
    id,
    status: passed ? "pass" : "fail",
    message,
    ...(actual === undefined ? {} : { actual }),
  };
}

function skipped(id, message) {
  return { id, status: "not-evaluated", message };
}

export function parseCargoPackageVersion(source) {
  const marker = source.match(/^\[package\]\s*$/m);
  if (!marker || marker.index === undefined) return null;
  const remainder = source.slice(marker.index + marker[0].length);
  const nextSection = remainder.search(/^\[/m);
  const packageBlock = nextSection >= 0 ? remainder.slice(0, nextSection) : remainder;
  return packageBlock.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

export function normalizeGitHubRepository(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const normalized = value.trim().replace(/^git\+/, "").replace(/\.git$/, "");
  const match = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

export function evaluateReleasePreflight({
  packageJson,
  cargoToml,
  tauriConfig,
  storeConfig,
  env = {},
  tag = null,
  repository = null,
  sourceCommit = null,
  trackedSourceClean = null,
  hostReleaseSnapshot = null,
  githubReleaseSnapshot = null,
  requireEnvironmentCredentials = true,
}) {
  const packageVersion = packageJson.version ?? null;
  const cargoVersion = parseCargoPackageVersion(cargoToml);
  const tauriVersion = tauriConfig.version ?? null;
  const releaseRepository = normalizeGitHubRepository(packageJson.repository?.url);
  const requestedRepository = normalizeGitHubRepository(
    repository?.includes("github.com") ? repository : `https://github.com/${repository ?? ""}`,
  );
  const expectedUpdaterEndpoint = releaseRepository
    ? `https://github.com/${releaseRepository}/releases/latest/download/latest.json`
    : null;
  const updaterEndpoints = tauriConfig.plugins?.updater?.endpoints ?? [];
  const missingCredentials = RELEASE_CREDENTIAL_NAMES.filter(
    (name) => !releaseCredentialIsPresent(env, name),
  );

  const deepInspection = hostReleaseSnapshot !== null || githubReleaseSnapshot !== null;
  const checks = [
    check(
      "version-alignment",
      Boolean(packageVersion) && packageVersion === cargoVersion && packageVersion === tauriVersion,
      "package.json, Cargo.toml, and tauri.conf.json versions must match",
      { packageJson: packageVersion, cargoToml: cargoVersion, tauriConfig: tauriVersion },
    ),
    check(
      "release-repository",
      Boolean(releaseRepository),
      "package repository must be a GitHub repository",
      releaseRepository,
    ),
    check(
      "github-updater-endpoint",
      Boolean(expectedUpdaterEndpoint) &&
        updaterEndpoints.length === 1 &&
        updaterEndpoints[0] === expectedUpdaterEndpoint,
      "updater endpoint must resolve only to this repository's latest.json",
      updaterEndpoints,
    ),
    check(
      "github-updater-artifacts",
      tauriConfig.bundle?.createUpdaterArtifacts === true,
      "direct-distribution builds must create signed updater artifacts",
      tauriConfig.bundle?.createUpdaterArtifacts,
    ),
    check(
      "store-updater-isolation",
      storeConfig.bundle?.createUpdaterArtifacts === false,
      "Microsoft Store builds must not create GitHub updater artifacts",
      storeConfig.bundle?.createUpdaterArtifacts,
    ),
    check(
      "updater-public-key",
      typeof tauriConfig.plugins?.updater?.pubkey === "string" &&
        tauriConfig.plugins.updater.pubkey.trim().length > 0,
      "updater public key must be configured",
    ),
    tag
      ? check(
          "release-tag",
          tag === `v${packageVersion}`,
          "release tag must match the application version",
          { expected: `v${packageVersion}`, received: tag },
        )
      : skipped("release-tag", "No release tag was supplied for this local inspection"),
    repository
      ? check(
          "workflow-repository-binding",
          Boolean(releaseRepository) &&
            requestedRepository?.toLowerCase() === releaseRepository.toLowerCase(),
          "workflow repository must match package.json",
          { expected: releaseRepository, received: requestedRepository },
        )
      : skipped(
          "workflow-repository-binding",
          "No workflow repository was supplied for this local inspection",
        ),
    trackedSourceClean === null
      ? skipped("tracked-source-clean", "Git source state was not available")
      : check(
          "tracked-source-clean",
          trackedSourceClean,
          "tracked source must be clean before a release tag is created",
        ),
    requireEnvironmentCredentials
      ? check(
          "release-credentials",
          missingCredentials.length === 0,
          "all macOS notarization, updater signing, and SignPath credentials must be present",
          {
            missing: missingCredentials,
            presentCount: RELEASE_CREDENTIAL_NAMES.length - missingCredentials.length,
          },
        )
      : skipped(
          "release-credentials",
          "Local credential values are not inspected; GitHub credential names are checked instead",
        ),
    ...evaluateHostReleaseReadiness(hostReleaseSnapshot),
    ...evaluateGitHubReleaseReadiness(githubReleaseSnapshot),
  ];

  const blockers = checks.filter((entry) => entry.status === "fail").map((entry) => entry.id);
  return {
    schemaVersion: 2,
    phase: deepInspection ? "release-infrastructure-preflight" : "source-preflight",
    generatedAt: new Date().toISOString(),
    version: packageVersion,
    releaseRepository,
    sourceCommit,
    tag,
    checks,
    missingCredentials: requireEnvironmentCredentials ? missingCredentials : [],
    environmentCredentialsInspected: requireEnvironmentCredentials,
    blockers,
    pendingDistributionGates: [
      "macos-developer-id-notarization",
      "windows-signpath-timestamped-signature",
      "physical-windows-oauth-and-updater-receipt",
    ],
    evaluatedScopes: [
      "source",
      ...(hostReleaseSnapshot !== null ? ["release-host"] : []),
      ...(githubReleaseSnapshot !== null ? ["github-infrastructure"] : []),
    ],
    verdict:
      blockers.length > 0
        ? "blocked"
        : deepInspection
          ? "release-infrastructure-preflight-passed"
          : "source-preflight-passed",
  };
}

function parseArgs(argv) {
  const options = {
    strict: false,
    inspectHost: false,
    inspectGitHub: false,
    tag: null,
    repository: null,
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--strict") {
      options.strict = true;
      continue;
    }
    if (argument === "--inspect-host") {
      options.inspectHost = true;
      continue;
    }
    if (argument === "--inspect-github") {
      options.inspectGitHub = true;
      continue;
    }
    if (["--tag", "--repository", "--output"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function runReleasePreflight({ cwd = process.cwd(), argv = process.argv.slice(2), env = process.env } = {}) {
  const options = parseArgs(argv);
  const packageJson = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
  const cargoToml = readFileSync(resolve(cwd, "src-tauri/Cargo.toml"), "utf8");
  const tauriConfig = JSON.parse(
    readFileSync(resolve(cwd, "src-tauri/tauri.conf.json"), "utf8"),
  );
  const storeConfig = JSON.parse(
    readFileSync(resolve(cwd, "src-tauri/tauri.microsoftstore.conf.json"), "utf8"),
  );
  const sourceCommit = runGit(cwd, ["rev-parse", "HEAD"]);
  const trackedStatus = runGit(cwd, ["status", "--porcelain", "--untracked-files=no"]);
  const releaseRepository = normalizeGitHubRepository(packageJson.repository?.url);
  if (options.inspectGitHub && !releaseRepository) {
    throw new Error("package.json does not identify a GitHub repository for inspection");
  }
  const report = evaluateReleasePreflight({
    packageJson,
    cargoToml,
    tauriConfig,
    storeConfig,
    env,
    tag: options.tag,
    repository: options.repository,
    sourceCommit,
    trackedSourceClean: trackedStatus === "",
    hostReleaseSnapshot: options.inspectHost
      ? collectHostReleaseSnapshot({ env })
      : null,
    githubReleaseSnapshot: options.inspectGitHub
      ? collectGitHubReleaseSnapshot({ repository: releaseRepository })
      : null,
    requireEnvironmentCredentials: !options.inspectGitHub,
  });

  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    const outputPath = resolve(cwd, options.output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, rendered, "utf8");
  }
  process.stdout.write(rendered);

  if (options.strict && report.blockers.length > 0) {
    process.stderr.write(`Release preflight blocked: ${report.blockers.join(", ")}\n`);
    return 1;
  }
  return 0;
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    process.exitCode = runReleasePreflight();
  } catch (error) {
    process.stderr.write(`Release preflight failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
