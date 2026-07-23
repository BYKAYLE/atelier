import { spawnSync } from "node:child_process";

export const REQUIRED_REPOSITORY_SECRET_NAMES = Object.freeze([
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "SIGNPATH_API_TOKEN",
]);

export const REQUIRED_REPOSITORY_VARIABLE_NAMES = Object.freeze([
  "SIGNPATH_ORGANIZATION_ID",
  "SIGNPATH_PROJECT_SLUG",
]);

export const REQUIRED_WINDOWS_RUNNER_LABELS = Object.freeze([
  "self-hosted",
  "windows",
  "x64",
]);

export const PRODUCTION_RELEASE_ENVIRONMENT = "production-release";

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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error?.message ?? null,
  };
}

function summarizeFailure(result) {
  const detail = result.error || result.stderr || `exit code ${result.status ?? "unknown"}`;
  return detail.replace(/[\r\n]+/g, " ").slice(0, 400);
}

export function collectHostReleaseSnapshot({
  platform = process.platform,
  env = process.env,
} = {}) {
  if (platform !== "darwin") {
    return {
      platform,
      inspected: true,
      applicable: false,
      tools: {},
      developerIdApplicationIdentities: [],
      configuredSigningIdentityPresent: Boolean(env.APPLE_SIGNING_IDENTITY?.trim()),
      errors: [],
    };
  }

  const toolCommands = {
    security: ["/usr/bin/which", ["security"]],
    codesign: ["/usr/bin/which", ["codesign"]],
    spctl: ["/usr/bin/which", ["spctl"]],
    hdiutil: ["/usr/bin/which", ["hdiutil"]],
    notarytool: ["xcrun", ["--find", "notarytool"]],
    stapler: ["xcrun", ["--find", "stapler"]],
  };
  const tools = {};
  const errors = [];
  for (const [name, [command, args]] of Object.entries(toolCommands)) {
    const result = run(command, args);
    tools[name] = result.ok;
    if (!result.ok) errors.push({ probe: name, error: summarizeFailure(result) });
  }

  const identitiesResult = run("security", ["find-identity", "-v", "-p", "codesigning"]);
  if (!identitiesResult.ok) {
    errors.push({ probe: "codesigning-identities", error: summarizeFailure(identitiesResult) });
  }
  const identities = [...identitiesResult.stdout.matchAll(/^\s*\d+\)\s+[A-Fa-f0-9]+\s+"([^"]+)"/gm)]
    .map((match) => match[1]);
  const developerIdApplicationIdentities = identities.filter((identity) =>
    identity.startsWith("Developer ID Application:"),
  );

  return {
    platform,
    inspected: true,
    applicable: true,
    tools,
    developerIdApplicationIdentities,
    configuredSigningIdentityPresent: Boolean(env.APPLE_SIGNING_IDENTITY?.trim()),
    configuredSigningIdentityAvailable:
      typeof env.APPLE_SIGNING_IDENTITY === "string" && env.APPLE_SIGNING_IDENTITY.trim() !== ""
        ? identities.includes(env.APPLE_SIGNING_IDENTITY.trim())
        : null,
    errors,
  };
}

export function evaluateHostReleaseReadiness(snapshot) {
  if (!snapshot?.inspected) {
    return [skipped("release-host-inspection", "Release host capabilities were not inspected")];
  }
  if (!snapshot.applicable) {
    return [
      skipped(
        "macos-release-host",
        `macOS release host checks do not apply to ${snapshot.platform ?? "this platform"}`,
      ),
    ];
  }

  const missingTools = Object.entries(snapshot.tools ?? {})
    .filter(([, available]) => !available)
    .map(([name]) => name);
  const checks = [
    check(
      "macos-release-tools",
      missingTools.length === 0,
      "macOS signing, Gatekeeper, packaging, notarization, and stapling tools must be available",
      { missing: missingTools },
    ),
    check(
      "macos-developer-id-identity",
      (snapshot.developerIdApplicationIdentities ?? []).length > 0,
      "the release keychain must contain a Developer ID Application identity",
      { identities: snapshot.developerIdApplicationIdentities ?? [] },
    ),
  ];
  if (snapshot.configuredSigningIdentityPresent) {
    checks.push(
      check(
        "macos-configured-signing-identity",
        snapshot.configuredSigningIdentityAvailable === true,
        "APPLE_SIGNING_IDENTITY must resolve to an identity in the release keychain",
      ),
    );
  } else {
    checks.push(
      skipped(
        "macos-configured-signing-identity",
        "APPLE_SIGNING_IDENTITY was not supplied to local host inspection; GitHub names are checked separately",
      ),
    );
  }
  return checks;
}

function parseGitHubResponse(repository, label, endpoint) {
  const result = run("gh", ["api", `repos/${repository}/${endpoint}`]);
  if (!result.ok) {
    return { value: null, error: { probe: label, error: summarizeFailure(result) } };
  }
  try {
    return { value: JSON.parse(result.stdout), error: null };
  } catch (error) {
    return {
      value: null,
      error: {
        probe: label,
        error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

export function collectGitHubReleaseSnapshot({ repository }) {
  const errors = [];
  const read = (label, endpoint) => {
    const response = parseGitHubResponse(repository, label, endpoint);
    if (response.error) errors.push(response.error);
    return response.value;
  };

  const secrets = read("repository-secrets", "actions/secrets?per_page=100");
  const variables = read("repository-variables", "actions/variables?per_page=100");
  const runners = read("self-hosted-runners", "actions/runners?per_page=100");
  const environments = read("environments", "environments?per_page=100");
  const environmentNames = Array.isArray(environments?.environments)
    ? environments.environments.map((entry) => entry.name).filter(Boolean).sort()
    : [];
  const productionEnvironment = environmentNames.includes(PRODUCTION_RELEASE_ENVIRONMENT)
    ? read(
        "production-release-environment",
        `environments/${PRODUCTION_RELEASE_ENVIRONMENT}`,
      )
    : null;

  return {
    repository,
    inspected: true,
    secretNames: Array.isArray(secrets?.secrets)
      ? secrets.secrets.map((entry) => entry.name).filter(Boolean).sort()
      : [],
    variableNames: Array.isArray(variables?.variables)
      ? variables.variables.map((entry) => entry.name).filter(Boolean).sort()
      : [],
    environmentNames,
    productionEnvironment: productionEnvironment
      ? {
          name: productionEnvironment.name ?? null,
          requiredReviewerCount: Array.isArray(productionEnvironment.protection_rules)
            ? productionEnvironment.protection_rules
                .filter((rule) => rule.type === "required_reviewers")
                .reduce((count, rule) => count + (rule.reviewers?.length ?? 0), 0)
            : 0,
          branchPolicyProtected:
            Array.isArray(productionEnvironment.protection_rules) &&
            productionEnvironment.protection_rules.some((rule) => rule.type === "branch_policy"),
        }
      : null,
    runners: Array.isArray(runners?.runners)
      ? runners.runners.map((runner) => ({
          name: runner.name ?? null,
          status: runner.status ?? null,
          busy: runner.busy === true,
          labels: Array.isArray(runner.labels)
            ? runner.labels.map((label) => String(label.name).toLowerCase()).sort()
            : [],
        }))
      : [],
    errors,
  };
}

export function evaluateGitHubReleaseReadiness(snapshot) {
  if (!snapshot?.inspected) {
    return [
      skipped("github-release-infrastructure", "GitHub release infrastructure was not inspected"),
    ];
  }

  const apiReady = (snapshot.errors ?? []).length === 0;
  if (!apiReady) {
    return [
      check(
        "github-release-api",
        false,
        "GitHub release infrastructure must be readable before release",
        { errors: snapshot.errors },
      ),
      skipped("github-release-secrets", "Repository secrets could not be inspected"),
      skipped("github-release-variables", "Repository variables could not be inspected"),
      skipped("github-production-environment", "Production environment could not be inspected"),
      skipped("github-production-reviewer", "Production reviewers could not be inspected"),
      skipped("github-windows-runner-registration", "Windows runners could not be inspected"),
      skipped("github-windows-runner-online", "Windows runners could not be inspected"),
    ];
  }

  const secretNames = new Set(snapshot.secretNames ?? []);
  const variableNames = new Set(snapshot.variableNames ?? []);
  const missingSecrets = REQUIRED_REPOSITORY_SECRET_NAMES.filter((name) => !secretNames.has(name));
  const missingVariables = REQUIRED_REPOSITORY_VARIABLE_NAMES.filter(
    (name) => !variableNames.has(name),
  );
  const matchingRunners = (snapshot.runners ?? []).filter((runner) => {
    const labels = new Set(runner.labels ?? []);
    return REQUIRED_WINDOWS_RUNNER_LABELS.every((label) => labels.has(label));
  });
  const onlineRunners = matchingRunners.filter((runner) => runner.status === "online");
  const environmentPresent =
    snapshot.environmentNames?.includes(PRODUCTION_RELEASE_ENVIRONMENT) &&
    snapshot.productionEnvironment?.name === PRODUCTION_RELEASE_ENVIRONMENT;

  return [
    check("github-release-api", true, "GitHub release infrastructure is readable"),
    check(
      "github-release-secrets",
      missingSecrets.length === 0,
      "repository release secrets required by release.yml must exist",
      {
        missing: missingSecrets,
        presentCount: REQUIRED_REPOSITORY_SECRET_NAMES.length - missingSecrets.length,
      },
    ),
    check(
      "github-release-variables",
      missingVariables.length === 0,
      "repository release variables required by release.yml must exist",
      {
        missing: missingVariables,
        presentCount: REQUIRED_REPOSITORY_VARIABLE_NAMES.length - missingVariables.length,
      },
    ),
    check(
      "github-production-environment",
      environmentPresent && snapshot.productionEnvironment?.branchPolicyProtected === true,
      "production-release must exist and enforce a deployment branch policy",
      snapshot.productionEnvironment,
    ),
    check(
      "github-production-reviewer",
      environmentPresent && (snapshot.productionEnvironment?.requiredReviewerCount ?? 0) > 0,
      "production-release must require at least one reviewer",
      { requiredReviewerCount: snapshot.productionEnvironment?.requiredReviewerCount ?? 0 },
    ),
    check(
      "github-windows-runner-registration",
      matchingRunners.length > 0,
      "an interactive self-hosted Windows x64 release runner must be registered",
      {
        requiredLabels: REQUIRED_WINDOWS_RUNNER_LABELS,
        matchingRunnerNames: matchingRunners.map((runner) => runner.name),
      },
    ),
    check(
      "github-windows-runner-online",
      onlineRunners.length > 0,
      "a matching Windows x64 release runner must be online before release",
      { onlineRunnerNames: onlineRunners.map((runner) => runner.name) },
    ),
  ];
}
