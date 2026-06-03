import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

function git(args, fallback = "") {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}

function escapeMarkdown(text) {
  return text.replace(/\r?\n/g, " ").trim();
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const releaseTag = process.env.GITHUB_REF_NAME || `v${packageJson.version}`;
const head = process.env.GITHUB_SHA || "HEAD";
const previousTag = git(["describe", "--tags", "--abbrev=0", `${head}^`]);
const range = previousTag ? `${previousTag}..${head}` : head;
let commitRows = git(["log", "--no-merges", "--pretty=format:%s%x09%h", range]);

if (!commitRows && previousTag) {
  commitRows = git(["log", "--pretty=format:%s%x09%h", range]);
}

const changeLines = commitRows
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [subject, hash] = line.split("\t");
    const safeSubject = escapeMarkdown(subject || "Version update");
    return hash ? `- ${safeSubject} (${hash})` : `- ${safeSubject}`;
  });

if (!changeLines.length) {
  changeLines.push(`- Atelier ${releaseTag} package and updater metadata refreshed.`);
}

const body = [
  "## 변경 사항",
  "",
  `릴리스: ${releaseTag}`,
  previousTag ? `기준: ${previousTag} 이후 변경` : "기준: 첫 릴리스 또는 이전 태그 없음",
  "",
  ...changeLines,
  "",
  "## Code signing policy",
  "Windows release signing is prepared for SignPath Foundation open-source code signing.",
  "",
  "Free code signing provided by SignPath.io, certificate by SignPath Foundation.",
  "",
  "Full policy: https://github.com/BYKAYLE/atelier/blob/main/docs/code-signing-policy.md",
  "",
].join("\n");

mkdirSync(".github/generated", { recursive: true });
writeFileSync(".github/generated/release-notes.md", body, "utf8");

if (process.env.GITHUB_OUTPUT) {
  const delimiter = `ATELIER_RELEASE_NOTES_${Date.now()}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `body<<${delimiter}\n${body}\n${delimiter}\n`, "utf8");
} else {
  console.log(body);
}
