// Repo-root hygiene guard (SOT/issues.md 2026-08-24 recommendation).
//
// Three separate incidents (2026-08-21 bk-wiki scrape output, 2026-08-25
// internal report swept into a public release commit, 2026-08-26 hermes cron
// migration script under scripts/) all share one class: foreign agent scratch
// output appearing as untracked files outside the known repository layout and
// surviving until a manual audit. This module closes the class mechanically:
// any untracked, non-ignored path outside the allowed layout fails the
// release preflight and the release security audit with the offending list.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Directories where untracked files are part of the normal development flow
// (new source, new tools, SOT/artifacts updates about to be committed).
export const ALLOWED_UNTRACKED_DIRS = Object.freeze([
  "src/",
  "src-tauri/",
  "tools/",
  "SOT/",
  "artifacts/",
  "docs/",
  "PRD/",
]);

// Individual repo-root files that may legitimately appear untracked before
// their first commit. Deliberately empty: extend it in a reviewed commit
// instead of loosening the gate ad hoc.
export const ALLOWED_UNTRACKED_ROOT_FILES = Object.freeze([]);

export function classifyUntrackedPaths(paths) {
  const allowed = [];
  const foreign = [];
  for (const path of paths) {
    const normalized = String(path).trim();
    if (normalized === "") continue;
    const inAllowedDir = ALLOWED_UNTRACKED_DIRS.some((dir) => normalized.startsWith(dir));
    const isAllowedRootFile = ALLOWED_UNTRACKED_ROOT_FILES.includes(normalized);
    if (inAllowedDir || isAllowedRootFile) {
      allowed.push(normalized);
    } else {
      foreign.push(normalized);
    }
  }
  return { allowed, foreign };
}

// Returns the untracked, non-ignored paths of the repository at cwd, or null
// when git state is unavailable (callers decide whether that is fatal).
export function collectUntrackedPaths(cwd) {
  const result = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  return result.stdout.split("\n").filter((line) => line.trim() !== "");
}

export function runRepoHygieneCheck(cwd) {
  const untracked = collectUntrackedPaths(cwd);
  if (untracked === null) {
    return { ok: false, evaluated: false, untracked: null, foreign: [] };
  }
  const { foreign } = classifyUntrackedPaths(untracked);
  return { ok: foreign.length === 0, evaluated: true, untracked, foreign };
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const report = runRepoHygieneCheck(process.cwd());
  if (!report.evaluated) {
    console.error("repo hygiene check failed: git untracked-path inventory is unavailable");
    process.exit(2);
  }
  if (!report.ok) {
    console.error(
      `repo hygiene check failed: ${report.foreign.length} untracked path(s) outside the known layout (allowed: ${ALLOWED_UNTRACKED_DIRS.join(" ")})`,
    );
    for (const path of report.foreign) {
      console.error(`  foreign untracked: ${path}`);
    }
    process.exit(1);
  }
  console.log(
    `repo hygiene check: ${report.untracked.length} untracked path(s), 0 outside the known layout`,
  );
}
