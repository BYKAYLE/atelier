import { basename } from "node:path";

const REPOSITORY_PART = /^[A-Za-z0-9_.-]+$/;

export function resolveReleaseRepository(env = process.env) {
  const explicit = String(env.RELEASE_REPOSITORY ?? "").trim();
  const combined = explicit || `${env.RELEASE_OWNER ?? ""}/${env.RELEASE_REPO ?? ""}`;
  const parts = combined.split("/");
  if (parts.length !== 2 || parts.some((part) => !REPOSITORY_PART.test(part))) {
    throw new Error(
      "RELEASE_REPOSITORY or RELEASE_OWNER/RELEASE_REPO must identify one owner/repository",
    );
  }
  const [owner, repo] = parts;
  if ([owner, repo].some((part) => part === "." || part === "..")) {
    throw new Error("Release repository contains an unsafe path component");
  }
  return { owner, repo, slug: `${owner}/${repo}` };
}

export function assertSafeReleaseAssetName(name) {
  const value = String(name ?? "");
  if (
    !value ||
    value === "." ||
    value === ".." ||
    basename(value) !== value ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Unsafe release asset name: ${value || "(empty)"}`);
  }
  return value;
}

export function buildReleaseAssetUrl(repository, releaseTag, assetName) {
  const name = assertSafeReleaseAssetName(assetName);
  const tag = String(releaseTag ?? "").trim();
  if (!tag || tag.includes("/") || tag.includes("\\")) {
    throw new Error(`Unsafe release tag: ${tag || "(empty)"}`);
  }
  return `https://github.com/${repository.owner}/${repository.repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
}

export function releaseAssetNameFromUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`Invalid release asset URL: ${value}`);
  }
  const encodedName = url.pathname.split("/").at(-1) ?? "";
  let name;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    throw new Error(`Release asset URL has an invalid encoded filename: ${value}`);
  }
  return assertSafeReleaseAssetName(name);
}

export function assertExactReleaseAssetUrl(value, repository, releaseTag, assetName) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`Invalid release asset URL: ${value}`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Release asset URL is not an exact GitHub HTTPS asset URL: ${value}`);
  }
  const expected = buildReleaseAssetUrl(repository, releaseTag, assetName);
  if (url.href !== expected) {
    throw new Error(`Release asset URL mismatch: expected ${expected}, found ${url.href}`);
  }
  return url.href;
}
