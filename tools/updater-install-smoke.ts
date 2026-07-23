import assert from "node:assert/strict";
import {
  canUseInAppUpdaterForRuntime,
  resolveWindowsUpdaterTarget,
} from "../src/lib/updaterInstall.ts";

const githubMsi = {
  bundleType: "msi",
  githubUpdaterAvailable: true,
  windowsStoreLike: false,
};
const githubNsis = {
  bundleType: "NSIS",
  githubUpdaterAvailable: true,
  windowsStoreLike: false,
};
const legacyGithubInstall = {
  bundleType: null,
  githubUpdaterAvailable: true,
  windowsStoreLike: false,
};
const storeInstall = {
  bundleType: "msi",
  githubUpdaterAvailable: false,
  windowsStoreLike: true,
};

assert.equal(resolveWindowsUpdaterTarget(true, githubMsi), "windows-x86_64-msi");
assert.equal(resolveWindowsUpdaterTarget(true, githubNsis), "windows-x86_64-nsis");
assert.equal(resolveWindowsUpdaterTarget(true, legacyGithubInstall), undefined);
assert.equal(canUseInAppUpdaterForRuntime(true, legacyGithubInstall), false);
assert.equal(canUseInAppUpdaterForRuntime(true, githubMsi), true);
assert.equal(canUseInAppUpdaterForRuntime(true, githubNsis), true);
assert.equal(canUseInAppUpdaterForRuntime(true, storeInstall), false);
assert.equal(canUseInAppUpdaterForRuntime(true, null), false);
assert.equal(canUseInAppUpdaterForRuntime(false, null), true);

console.log(JSON.stringify({
  ok: true,
  explicitTargets: ["windows-x86_64-msi", "windows-x86_64-nsis"],
  unknownInstallerBlocked: true,
  storeInstallBlocked: true,
}));
