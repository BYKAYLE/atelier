import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const auditScript = resolve(root, "tools", "release-security-audit.mjs");
const fixtureDir = resolve(root, "tools", "__fixtures__", "release-security-audit");

function runFixture(name) {
  return spawnSync(process.execPath, [auditScript], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      RELEASE_SECURITY_AUDIT_TEST_MODE: "publication-gate",
      RELEASE_SECURITY_AUDIT_WORKFLOW_FIXTURE: resolve(fixtureDir, name),
    },
  });
}

test("accepts draft-first publication flow", () => {
  const result = runFixture("draft-release-after-windows.yml");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /publication gate fixture passed/);
});

test("rejects public release from macOS job", () => {
  const result = runFixture("public-release-from-macos.yml");
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stderr}${result.stdout}`,
    /draft during macOS artifact upload|must not publish the GitHub release from the macOS artifact job/,
  );
});

test("rejects publish before Windows asset upload and MSI validation", () => {
  const result = runFixture("publish-before-windows-validation.yml");
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stderr}${result.stdout}`,
    /must publish only after Windows manifest merge, MSI validation, and asset upload succeed/,
  );
});
