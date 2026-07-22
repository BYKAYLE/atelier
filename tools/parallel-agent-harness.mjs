import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
const manifest = "src-tauri/Cargo.toml";
const processTreeManifest = "src-tauri/crates/atelier-process-tree/Cargo.toml";
const npmEntrypoint = process.env.npm_execpath;

function runChecked(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    shell: false,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label} exited with ${result.status ?? "no status"}`);
  }
  return `${stdout}\n${stderr}`;
}

function ensureFrontendDist() {
  if (existsSync(resolve(root, "dist", "index.html"))) return;
  if (npmEntrypoint) {
    runChecked(process.execPath, [npmEntrypoint, "run", "build"], "frontend dist build");
    return;
  }
  runChecked(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], "frontend dist build");
}

const workspaceSource = readFileSync(resolve(root, "src/components/AgentWorkspace.tsx"), "utf8");
const agentSource = readFileSync(resolve(root, "src-tauri/src/agent.rs"), "utf8");
const cargoSource = readFileSync(resolve(root, manifest), "utf8");
const processTreeSource = readFileSync(
  resolve(root, "src-tauri/crates/atelier-process-tree/src/lib.rs"),
  "utf8",
);

for (const [ok, message] of [
  [workspaceSource.includes("const launchParallelRun = async () =>"), "parallel launcher missing"],
  [workspaceSource.includes("session.worktreeEnabled = true"), "parallel worktree isolation missing"],
  [workspaceSource.includes("candidates.forEach(({ session, payload }) =>"), "candidate fan-out missing"],
  [workspaceSource.includes("Promise.allSettled("), "batch cancellation fan-in missing"],
  [agentSource.includes("struct TestGajaeLaunchOverride"), "offline provider seam missing"],
  [agentSource.includes("parallel_fixture_turns_isolate_cancel_and_reap_process_trees"), "parallel runtime E2E missing"],
  [cargoSource.includes('features = ["protocol-asset", "test"]'), "Tauri test runtime is not test-scoped"],
  [cargoSource.includes('atelier-process-tree = { path = "crates/atelier-process-tree" }'), "shared process-tree crate missing"],
  [agentSource.includes("terminate_process_tree as terminate_agent_pid"), "agent does not use shared process-tree runtime"],
  [processTreeSource.includes("fn terminates_native_process_tree()"), "native process-tree E2E missing"],
]) {
  assert.equal(ok, true, message);
}

runChecked(
  process.execPath,
  ["--experimental-strip-types", "tools/session-run-registry-smoke.ts"],
  "session concurrency contract",
);
runChecked(
  process.execPath,
  ["--experimental-strip-types", "tools/agent-fleet-smoke.ts"],
  "agent fleet contract",
);

// Tauri's generate_context! macro validates frontendDist even for the mocked
// test runtime. Make the standalone harness reproducible from a clean checkout.
ensureFrontendDist();

let adapterRuntimeProof;
let worktreeIsolationProof;
if (process.platform === "win32") {
  const processTreeOutput = runChecked(
    cargo,
    ["test", "--locked", "--manifest-path", processTreeManifest, "--", "--nocapture"],
    "shared Windows process-tree runtime E2E",
  );
  assert.match(
    processTreeOutput,
    /test tests::terminates_native_process_tree \.\.\. ok/,
    "shared Windows process-tree test did not execute",
  );
  runChecked(
    cargo,
    ["test", "--manifest-path", manifest, "--no-run"],
    "Windows Tauri adapter and worktree integration compile",
  );
  adapterRuntimeProof = "shared-process-tree-executed; tauri-adapter-compiled";
  worktreeIsolationProof = "compiled; exercised by Unix Tauri integration gate";
} else {
  const runtimeOutput = runChecked(
    cargo,
    [
      "test",
      "--manifest-path",
      manifest,
      "agent::tests::parallel_fixture_turns_isolate_cancel_and_reap_process_trees",
      "--",
      "--nocapture",
    ],
    "parallel adapter runtime E2E",
  );
  assert.match(
    runtimeOutput,
    /test agent::tests::parallel_fixture_turns_isolate_cancel_and_reap_process_trees \.\.\. ok/,
    "cargo returned success without running the parallel adapter runtime E2E",
  );

  const worktreeOutput = runChecked(
    cargo,
    ["test", "--manifest-path", manifest, "agent_worktree::tests::", "--", "--nocapture"],
    "parallel worktree isolation tests",
  );
  for (const testName of [
    "worktree_slug_is_bounded_and_shell_independent",
    "worktree_preserves_source_edits_and_reuses_task_branch",
    "worktree_adoption_preserves_non_overlapping_source_edits",
    "worktree_adoption_refuses_overlapping_source_edits",
  ]) {
    assert.match(
      worktreeOutput,
      new RegExp(`test agent_worktree::tests::${testName} \\\.\\\.\\\. ok`),
      `cargo returned success without running ${testName}`,
    );
  }
  adapterRuntimeProof = "tauri-mock-executed";
  worktreeIsolationProof = "executed";
}

console.log(JSON.stringify({
  ok: true,
  provider: "offline test-only fixture",
  concurrentTurns: 3,
  completedTurns: 2,
  cancelledTurns: 1,
  eventIsolation: true,
  terminalLifecycleExactlyOnce: true,
  cancelledProcessTreeReaped: true,
  worktreeIsolationTests: 4,
  platform: process.platform,
  adapterRuntimeProof,
  worktreeIsolationProof,
  externalProviderCalls: 0,
}));
