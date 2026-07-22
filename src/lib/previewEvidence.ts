export interface TaskPreviewEvidence {
  url: string;
  ok: boolean;
  status?: number | null;
  title?: string | null;
  error?: string | null;
  checkedAt: number;
  serviceRunning?: boolean;
  servicePid?: number;
  serviceRestarts?: number;
  serviceError?: string;
  serviceOutput?: string[];
  bodyText?: string;
  networkMethod?: "GET";
  domNodes?: number;
  screenshotCaptured?: boolean;
  diagnosticsArmedAt?: number;
  browserErrorCount?: number;
  browserWarningCount?: number;
  consoleEvidence?: string[];
  networkRequestCount?: number;
  networkFailureCount?: number;
  networkEvidence?: string[];
}

interface PreviewHealthEvidence {
  url: string;
  ok: boolean;
  status?: number | null;
  title?: string | null;
  body_text?: string | null;
  error?: string | null;
  checked_at: number;
}

interface PreviewServiceEvidence {
  managed: boolean;
  running: boolean;
  pid?: number | null;
  restarts: number;
  last_error?: string | null;
  recent_output: string[];
}

interface PreviewConsoleEvidence {
  level: "warn" | "error";
  text: string;
}

interface PreviewNetworkEvidence {
  url: string;
  initiatorType: string;
  status?: number;
  durationMs: number;
  transferSize?: number;
}

interface PreviewBrowserDiagnostics {
  pageUrl: string;
  armedAt: number;
  consoleEntries: PreviewConsoleEvidence[];
  runtimeErrors: string[];
  networkEntries: PreviewNetworkEvidence[];
  networkFailures: string[];
}

export interface BuildTaskPreviewEvidenceInput {
  previewUrl: string;
  health?: PreviewHealthEvidence | null;
  healthError?: unknown;
  service?: PreviewServiceEvidence | null;
  serviceError?: unknown;
  diagnostics?: PreviewBrowserDiagnostics | null;
  domNodes?: number;
  screenshotCaptured?: boolean;
}

const REDACTED = "[redacted]";
const MAX_TEXT_LENGTH = 4_000;
const MAX_LINE_LENGTH = 900;
const MAX_EVIDENCE_LINES = 12;

const TOKEN_PATTERNS = [
  /\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}\b/g,
  /\b(?:xox[aboprs]-)[A-Za-z0-9-]{12,}\b/g,
  /\bAKIA[A-Z0-9]{12,}\b/g,
];

function clip(value: string, max = MAX_TEXT_LENGTH) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n...[truncated]`;
}

export function redactPreviewEvidenceText(value: unknown, max = MAX_TEXT_LENGTH) {
  let text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, REDACTED)
    .replace(/\b(Authorization\s*:\s*)(?:Bearer|Basic)\s+[^\s,;]+/gi, `$1${REDACTED}`)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_.=-]{12,}/gi, `$1 ${REDACTED}`)
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${REDACTED}@`)
    .replace(
      /(["']?(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|auth[_-]?token|password|passwd|secret|cookie|authorization)["']?\s*[:=]\s*)["']?[^\s,"';}]+["']?/gi,
      `$1${REDACTED}`,
    );
  for (const pattern of TOKEN_PATTERNS) text = text.replace(pattern, REDACTED);
  return clip(text.trim(), Math.max(0, max));
}

export function sanitizePreviewEvidenceUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return redactPreviewEvidenceText(raw, 500);
  }
}

function localPreviewOriginKey(value: unknown) {
  const sanitized = sanitizePreviewEvidenceUrl(value);
  if (!sanitized) return "";
  try {
    const url = new URL(sanitized);
    const host = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(url.hostname)
      ? "loopback"
      : url.hostname;
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return `${url.protocol}//${host}:${port}`;
  } catch {
    return "";
  }
}

function normalizedPreviewPath(value: unknown) {
  const sanitized = sanitizePreviewEvidenceUrl(value);
  if (!sanitized) return "";
  try {
    const pathname = new URL(sanitized).pathname.replace(/\/{2,}/g, "/") || "/";
    return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function previewDiagnosticsMatchPreview(
  diagnostics: { pageUrl?: string | null } | null | undefined,
  previewUrl: string,
) {
  const previewOrigin = localPreviewOriginKey(previewUrl);
  const diagnosticsOrigin = localPreviewOriginKey(diagnostics?.pageUrl);
  if (!previewOrigin || !diagnosticsOrigin || previewOrigin !== diagnosticsOrigin) return false;
  const previewPath = normalizedPreviewPath(previewUrl);
  const diagnosticsPath = normalizedPreviewPath(diagnostics?.pageUrl);
  if (!previewPath || !diagnosticsPath) return false;
  return previewPath === "/"
    || diagnosticsPath === previewPath
    || diagnosticsPath.startsWith(`${previewPath}/`);
}

function evidenceLines(values: unknown[]) {
  return values
    .map((value) => redactPreviewEvidenceText(value, MAX_LINE_LENGTH))
    .filter(Boolean)
    .slice(-MAX_EVIDENCE_LINES);
}

function networkEvidenceLine(entry: PreviewNetworkEvidence) {
  const status = Number(entry.status || 0);
  const parts = [
    entry.initiatorType || "request",
    sanitizePreviewEvidenceUrl(entry.url),
    status > 0 ? `HTTP ${status}` : "",
    Number.isFinite(entry.durationMs) ? `${Math.max(0, Math.round(entry.durationMs))}ms` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function buildTaskPreviewEvidence(input: BuildTaskPreviewEvidenceInput): TaskPreviewEvidence {
  const { health, service, diagnostics } = input;
  const consoleEvidence = diagnostics
    ? evidenceLines([
        ...diagnostics.runtimeErrors.map((text) => `error: ${text}`),
        ...diagnostics.consoleEntries.map((entry) => `${entry.level}: ${entry.text}`),
      ])
    : [];
  const networkEvidence = diagnostics
    ? evidenceLines([
        ...diagnostics.networkFailures.map((text) => `failed: ${text}`),
        ...diagnostics.networkEntries.map(networkEvidenceLine),
      ])
    : [];
  const networkFailureCount = diagnostics
    ? diagnostics.networkFailures.length
      + diagnostics.networkEntries.filter((entry) => Number(entry.status || 0) >= 400).length
    : undefined;
  const managedService = Boolean(service?.managed);
  const healthError = redactPreviewEvidenceText(health?.error || input.healthError, 1_200);
  const serviceError = redactPreviewEvidenceText(service?.last_error || input.serviceError, 1_200);
  const serviceOutput = evidenceLines(service?.recent_output || []);

  return {
    url: sanitizePreviewEvidenceUrl(health?.url || input.previewUrl),
    ok: Boolean(health?.ok) && (!managedService || Boolean(service?.running)),
    status: health?.status,
    title: redactPreviewEvidenceText(health?.title, 300) || undefined,
    error: healthError || undefined,
    checkedAt: Number(health?.checked_at || Date.now()),
    serviceRunning: managedService ? Boolean(service?.running) : undefined,
    servicePid: managedService && service?.pid ? Number(service.pid) : undefined,
    serviceRestarts: managedService && service?.restarts ? Number(service.restarts) : undefined,
    serviceError: serviceError || undefined,
    serviceOutput: serviceOutput.length ? serviceOutput : undefined,
    bodyText: redactPreviewEvidenceText(health?.body_text, MAX_TEXT_LENGTH) || undefined,
    networkMethod: "GET",
    domNodes: typeof input.domNodes === "number" && Number.isFinite(input.domNodes)
      ? Math.max(0, Math.round(input.domNodes))
      : undefined,
    screenshotCaptured: input.screenshotCaptured || undefined,
    diagnosticsArmedAt: diagnostics?.armedAt,
    browserErrorCount: diagnostics
      ? diagnostics.runtimeErrors.length
        + diagnostics.consoleEntries.filter((entry) => entry.level === "error").length
      : undefined,
    browserWarningCount: diagnostics
      ? diagnostics.consoleEntries.filter((entry) => entry.level === "warn").length
      : undefined,
    consoleEvidence: consoleEvidence.length ? consoleEvidence : undefined,
    networkRequestCount: diagnostics?.networkEntries.length,
    networkFailureCount,
    networkEvidence: networkEvidence.length ? networkEvidence : undefined,
  };
}
