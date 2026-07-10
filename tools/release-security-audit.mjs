import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifest = "src-tauri/Cargo.toml";
const lockfile = "src-tauri/Cargo.lock";
const excludedVersion = "quick-xml@0.39.2";
const releaseTargets = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-msvc",
];

const credentialSource = readFileSync("src-tauri/src/credentials.rs", "utf8");
const agentSource = readFileSync("src-tauri/src/agent.rs", "utf8");
const sourceInvariants = [
  {
    ok: !credentialSource.includes("sync_gajecode_claude_subscription_credential"),
    message: "Gajae OAuth refresh tokens must not be copied into agent.db",
  },
  {
    ok: !credentialSource.includes("sync_codex_auth_to_hermes"),
    message: "Codex refresh tokens must not be copied into Hermes auth.json",
  },
  {
    ok:
      agentSource.includes('cmd.env("ANTHROPIC_OAUTH_TOKEN", token)') &&
      credentialSource.includes("atelier-keychain-env-migration"),
    message: "Gajae must receive short-lived OAuth access through process environment only",
  },
  {
    ok:
      credentialSource.includes("atelier_codex_cli_access") &&
      credentialSource.includes("scrub_staged_codex_access_from_hermes"),
    message: "Hermes Codex access staging must be marked and scrubbed after execution",
  },
  {
    ok:
      !credentialSource.includes("macos_keychain_service_password") &&
      !credentialSource.includes('find-generic-password", "-s", "Claude Code-credentials'),
    message: "Atelier must not read Claude Code's external macOS Keychain item",
  },
  {
    ok: credentialSource.includes('vec!["login", "--device-auth"]'),
    message: "Codex subscription login must keep the cross-platform device authorization path",
  },
];
for (const invariant of sourceInvariants) {
  if (!invariant.ok) {
    console.error(`Release credential boundary failed: ${invariant.message}`);
    process.exit(1);
  }
}
console.log("release credential boundary check: no long-lived cross-provider token fan-out");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
}

for (const target of releaseTargets) {
  const result = run(
    "cargo",
    ["tree", "--manifest-path", manifest, "--target", target, "-i", excludedVersion],
    { capture: true },
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (/^quick-xml v0\.39\.2/m.test(output)) {
    console.error(`Blocked vulnerable dependency is present in ${target}:\n${output}`);
    process.exit(1);
  }
  console.log(`release dependency check: ${target} does not include ${excludedVersion}`);
}

// RustSec 2026-0194/0195 remain only in wayland-scanner's Linux build path.
// The target checks above must pass before those two lockfile-only findings are ignored.
const audit = run("cargo", [
  "audit",
  "--file",
  lockfile,
  "--ignore",
  "RUSTSEC-2026-0194",
  "--ignore",
  "RUSTSEC-2026-0195",
  "--json",
], { capture: true });
if (audit.status !== 0) {
  process.stderr.write(audit.stderr || audit.stdout || "cargo audit failed\n");
  process.exit(audit.status ?? 1);
}

const report = JSON.parse(audit.stdout);
const warningCounts = Object.fromEntries(
  Object.entries(report.warnings || {}).map(([name, entries]) => [name, entries.length]),
);
console.log(`RustSec release audit: 0 vulnerabilities (${JSON.stringify(warningCounts)} upstream warnings)`);
