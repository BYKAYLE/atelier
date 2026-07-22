const URL_CANDIDATE_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+/g;
const AUTO_REVIEWABLE_PREVIEW_RE = /^http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#]|$)/i;

function trimUrlPunctuation(value: string) {
  return value.replace(/[.,;:]+$/, "");
}

export function findUrl(text?: string | null) {
  if (!text) return null;
  const matches = text.match(URL_CANDIDATE_RE);
  if (!matches?.length) return null;
  return trimUrlPunctuation(matches[matches.length - 1]);
}

export function isAutoReviewablePreviewUrl(value?: string | null) {
  return Boolean(value && AUTO_REVIEWABLE_PREVIEW_RE.test(value.trim()));
}

export function findAutoPreviewUrl(text?: string | null) {
  if (!text) return null;
  const matches = text.match(URL_CANDIDATE_RE);
  if (!matches?.length) return null;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = trimUrlPunctuation(matches[index]);
    if (isAutoReviewablePreviewUrl(candidate)) return candidate;
  }
  return null;
}

export function restoreAutoPreviewUrl(value: unknown) {
  return typeof value === "string" && isAutoReviewablePreviewUrl(value) ? value : undefined;
}
