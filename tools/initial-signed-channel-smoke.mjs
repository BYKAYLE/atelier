import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const root = mkdtempSync(join(tmpdir(), "atelier-signed-channel-"));
const historyPath = join(root, "history.json");
const receiptPath = join(root, "receipt.json");
const sourceSha = "a".repeat(40);
const releaseTag = "v9.9.9";

try {
  const empty = run([]);
  assert.equal(empty.initialSignedChannelEligible, true);
  assert.equal(empty.qualifyingBaseline, null);

  const legacyOnly = run([
    release("v0.1.66", ["Atelier_0.1.66_x64_en-US.msi", "latest.json"]),
  ]);
  assert.equal(legacyOnly.initialSignedChannelEligible, true);

  const signedBaseline = run([
    release("v0.2.11", [
      "Atelier_0.2.11_x64_en-US.msi",
      "Atelier_0.2.11_x64_en-US.msi.sig",
      "latest.json",
      "release-manifest.json",
    ]),
  ]);
  assert.equal(signedBaseline.initialSignedChannelEligible, false);
  assert.equal(signedBaseline.qualifyingBaseline.tag, "v0.2.11");

  const pages = run([
    [release("v0.2.10", ["notes.txt"])],
    [
      release("v0.2.11", [
        "Atelier_0.2.11_x64_en-US.msi",
        "Atelier_0.2.11_x64_en-US.msi.sig",
        "latest.json",
        "release-manifest.json",
      ]),
    ],
  ]);
  assert.equal(pages.initialSignedChannelEligible, false);

  const publicCurrent = execute([release(releaseTag, ["latest.json"])]);
  assert.notEqual(publicCurrent.status, 0);

  console.log("Initial signed-channel history smoke passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function run(history) {
  const result = execute(history);
  if (result.status !== 0) {
    throw new Error(`resolver failed:\n${result.stdout}\n${result.stderr}`);
  }
  return JSON.parse(readFileSync(receiptPath, "utf8"));
}

function execute(history) {
  writeFileSync(historyPath, `${JSON.stringify(history)}\n`, "utf8");
  return spawnSync(
    process.execPath,
    [".github/scripts/resolve-initial-signed-channel.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_HISTORY_PATH: historyPath,
        SIGNED_CHANNEL_HISTORY_RECEIPT: receiptPath,
        RELEASE_TAG: releaseTag,
        RELEASE_SOURCE_SHA: sourceSha,
        RELEASE_REPOSITORY: "BYKAYLE/atelier",
        GITHUB_RUN_ID: "123",
        GITHUB_RUN_ATTEMPT: "1",
      },
    },
  );
}

function release(tag, names) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: "2026-07-01T00:00:00Z",
    assets: names.map((name) => ({ name })),
  };
}
