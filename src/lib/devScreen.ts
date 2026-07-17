export interface DevScreenOptions {
  host: string;
  port?: number | null;
  windowLabel?: string | null;
  timeoutMs?: number;
}

export interface DevScreenStatusResult {
  ok: boolean;
  host: string;
  port: number;
  windowLabel: string;
  backend: unknown;
  windows: unknown;
}

export interface DevScreenScreenshotResult {
  host: string;
  port: number;
  windowLabel: string;
  dataUrl: string;
  capturedAt: number;
}

export interface DevScreenSnapshotResult {
  host: string;
  port: number;
  windowLabel: string;
  data: unknown;
  text: string;
  capturedAt: number;
}

export interface DevScreenConsoleEntry {
  level: "warn" | "error";
  text: string;
  capturedAt: number;
}

export interface DevScreenNetworkEntry {
  url: string;
  initiatorType: string;
  status?: number;
  durationMs: number;
  transferSize?: number;
}

export interface DevScreenDiagnosticsResult {
  host: string;
  port: number;
  windowLabel: string;
  pageUrl: string;
  armedAt: number;
  capturedAt: number;
  consoleEntries: DevScreenConsoleEntry[];
  runtimeErrors: string[];
  networkEntries: DevScreenNetworkEntry[];
  networkFailures: string[];
}

type NormalizedDevScreenDiagnostics = Omit<
  DevScreenDiagnosticsResult,
  "host" | "port" | "windowLabel"
>;

export interface DevScreenActionResult {
  host: string;
  port: number;
  windowLabel: string;
  data: unknown;
}

export type DevScreenElementPickerStatus = "idle" | "armed" | "selected" | "cancelled" | "error";

export interface DevScreenElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DevScreenElementSelection {
  selector: string;
  tag: string;
  role: string;
  label: string;
  text: string;
  markup: string;
  rect: DevScreenElementRect;
  styles: Record<string, string>;
  pageUrl: string;
  selectedAt: number;
}

export interface DevScreenElementPickerResult {
  host: string;
  port: number;
  windowLabel: string;
  status: DevScreenElementPickerStatus;
  armedAt: number;
  selection: DevScreenElementSelection | null;
  error?: string;
}

export interface DevScreenCheckResult {
  status: DevScreenStatusResult;
  screenshot: DevScreenScreenshotResult;
  snapshot: DevScreenSnapshotResult;
  diagnostics: DevScreenDiagnosticsResult;
  checkedAt: number;
}

type BridgeMessage = {
  id?: string;
  success?: boolean;
  data?: unknown;
  error?: string;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_WINDOW = "main";
const DEFAULT_TIMEOUT_MS = 45000;
const CONNECT_TIMEOUT_MS = 650;

const SNAPSHOT_SCRIPT = String.raw`
const nodes = [];
const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK']);
const visible = (el) => {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && r.width > 0 && r.height > 0;
};
const label = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140);
const walk = (el, depth = 0) => {
  if (!el || skip.has(el.tagName) || nodes.length > 800) return;
  if (el !== document.body && !visible(el)) return;
  const interesting = el === document.body || el.matches('button,a,input,textarea,select,[role],[tabindex],summary') || label(el);
  if (interesting) {
    const r = el.getBoundingClientRect();
    nodes.push({
      depth,
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      class: String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 4).join('.'),
      label: label(el),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
    });
  }
  for (const child of el.children) walk(child, Math.min(depth + 1, 12));
};
walk(document.body);
return {
  title: document.title,
  url: location.href,
  viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
  nodes
};
`;

// The hook is installed inside the inspected local app, not Atelier itself.
// It keeps only bounded warnings/errors and resource metadata; no response
// bodies, request headers, cookies, or storage values are collected.
const DIAGNOSTICS_SCRIPT = String.raw`
const key = '__ATELIER_PREVIEW_DIAGNOSTICS_V1__';
const limit = (items, max) => items.length > max ? items.slice(items.length - max) : items;
const stringify = (value) => {
  try {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message || value.name || 'Error';
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch (_) {
    return String(value);
  }
};
const state = window[key] || {
  armedAt: Date.now(),
  consoleEntries: [],
  runtimeErrors: [],
  networkFailures: []
};
const pushConsole = (level, args) => {
  state.consoleEntries.push({
    level,
    text: args.map(stringify).join(' ').replace(/\s+/g, ' ').trim().slice(0, 2000),
    capturedAt: Date.now()
  });
  state.consoleEntries = limit(state.consoleEntries, 80);
};
const pushRuntimeError = (value) => {
  const text = stringify(value).replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (!text) return;
  state.runtimeErrors.push(text);
  state.runtimeErrors = limit(state.runtimeErrors, 80);
};
const pushNetworkFailure = (value) => {
  const text = stringify(value).replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!text) return;
  state.networkFailures.push(text);
  state.networkFailures = limit(state.networkFailures, 80);
};
if (!window[key]) {
  for (const level of ['warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      pushConsole(level, args);
      original(...args);
    };
  }
  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target && target !== window) {
      const source = target.currentSrc || target.src || target.href || target.tagName || 'resource';
      pushNetworkFailure('resource load failed: ' + source);
      return;
    }
    const where = event.filename ? ' (' + event.filename + ':' + (event.lineno || 0) + ')' : '';
    pushRuntimeError((event.message || 'window error') + where);
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    pushRuntimeError('unhandled rejection: ' + stringify(event.reason));
  });
  window[key] = state;
}
const resources = performance.getEntriesByType('resource').slice(-80).map((entry) => ({
  url: entry.name || '',
  initiatorType: entry.initiatorType || 'resource',
  status: Number(entry.responseStatus || 0),
  durationMs: Math.max(0, Math.round(Number(entry.duration || 0) * 10) / 10),
  transferSize: Math.max(0, Number(entry.transferSize || 0))
}));
return {
  pageUrl: location.href,
  armedAt: Number(state.armedAt || Date.now()),
  capturedAt: Date.now(),
  consoleEntries: limit(state.consoleEntries, 40),
  runtimeErrors: limit(state.runtimeErrors, 40),
  networkEntries: resources,
  networkFailures: limit(state.networkFailures, 40)
};
`;

// The picker runs only inside the localhost Tauri bridge target. It records a
// bounded selector, a shallow safe markup summary, geometry, and an explicit
// computed-style allowlist. Values, URLs, storage, cookies, and event handlers
// are intentionally excluded.
const ELEMENT_PICKER_START_SCRIPT = String.raw`
const key = '__ATELIER_ELEMENT_PICKER_V1__';
const previous = window[key];
if (previous && typeof previous.teardown === 'function') previous.teardown();

const compact = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const escapeCss = (value) => {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => '\\' + char.codePointAt(0).toString(16) + ' ');
};
const quoteAttr = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const selectorFor = (element) => {
  if (!(element instanceof Element)) return '';
  const testId = compact(element.getAttribute('data-testid'), 100);
  if (testId) return '[data-testid="' + quoteAttr(testId) + '"]';
  if (element.id) return '#' + escapeCss(compact(element.id, 100));
  const aria = compact(element.getAttribute('aria-label'), 100);
  if (aria) return element.tagName.toLowerCase() + '[aria-label="' + quoteAttr(aria) + '"]';
  const name = compact(element.getAttribute('name'), 100);
  if (name) return element.tagName.toLowerCase() + '[name="' + quoteAttr(name) + '"]';

  const parts = [];
  let current = element;
  for (let depth = 0; current && current !== document.documentElement && depth < 6; depth += 1) {
    let part = current.tagName.toLowerCase();
    const classes = Array.from(current.classList || [])
      .filter((item) => /^[a-zA-Z0-9_-]{1,80}$/.test(item))
      .slice(0, 2);
    if (classes.length) part += classes.map((item) => '.' + escapeCss(item)).join('');
    const parent = current.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      if (sameTag.length > 1) part += ':nth-of-type(' + (sameTag.indexOf(current) + 1) + ')';
    }
    parts.unshift(part);
    if (!parent || parent === document.body) break;
    current = parent;
  }
  return parts.join(' > ').slice(0, 360);
};
const styleNames = [
  'display', 'position', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap',
  'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink',
  'alignItems', 'alignSelf', 'justifyContent',
  'gridTemplateColumns', 'gridTemplateRows',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'color', 'backgroundColor', 'borderColor', 'borderStyle', 'borderWidth',
  'borderRadius', 'boxShadow', 'opacity', 'overflow', 'textAlign'
];
const safeMarkup = (element) => {
  const tag = element.tagName.toLowerCase();
  const attributes = ['id', 'class', 'role', 'aria-label', 'aria-labelledby', 'data-testid', 'name', 'type'];
  const rendered = attributes.flatMap((name) => {
    const value = compact(element.getAttribute(name), 120);
    return value ? [name + '="' + value.replace(/[&<>"']/g, '') + '"'] : [];
  });
  const text = compact(element.innerText || element.textContent, 180);
  return ('<' + tag + (rendered.length ? ' ' + rendered.join(' ') : '') + '>' + text + '</' + tag + '>').slice(0, 700);
};
const collect = (element) => {
  const rect = element.getBoundingClientRect();
  const computed = getComputedStyle(element);
  const styles = {};
  for (const name of styleNames) {
    const value = compact(computed[name], 160);
    if (value) styles[name] = value;
  }
  const url = new URL(location.href);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return {
    selector: selectorFor(element),
    tag: element.tagName.toLowerCase(),
    role: compact(element.getAttribute('role') || element.tagName.toLowerCase(), 80),
    label: compact(element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('placeholder'), 180),
    text: compact(element.innerText || element.textContent, 320),
    markup: safeMarkup(element),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    styles,
    pageUrl: url.toString(),
    selectedAt: Date.now()
  };
};

const overlay = document.createElement('div');
overlay.setAttribute('data-atelier-element-picker', 'overlay');
Object.assign(overlay.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  pointerEvents: 'none',
  zIndex: '2147483647',
  border: '2px solid #e26f48',
  background: 'rgba(226, 111, 72, 0.13)',
  boxShadow: '0 0 0 1px rgba(255,255,255,0.75)',
  display: 'none',
  boxSizing: 'border-box',
  transformOrigin: 'top left'
});
document.documentElement.appendChild(overlay);

const state = {
  status: 'armed',
  armedAt: Date.now(),
  selection: null,
  error: '',
  teardown: null
};
const teardown = () => {
  document.removeEventListener('pointermove', onPointerMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  overlay.remove();
};
const onPointerMove = (event) => {
  const target = event.target;
  if (!(target instanceof Element) || target === overlay) return;
  const rect = target.getBoundingClientRect();
  Object.assign(overlay.style, {
    display: 'block',
    transform: 'translate(' + Math.round(rect.x) + 'px,' + Math.round(rect.y) + 'px)',
    width: Math.max(0, Math.round(rect.width)) + 'px',
    height: Math.max(0, Math.round(rect.height)) + 'px'
  });
};
const onClick = (event) => {
  const target = event.target;
  if (!(target instanceof Element) || target === overlay) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  try {
    state.selection = collect(target);
    state.status = 'selected';
  } catch (error) {
    state.error = compact(error && error.message ? error.message : error, 300);
    state.status = 'error';
  }
  teardown();
};
const onKeyDown = (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  state.status = 'cancelled';
  teardown();
};
state.teardown = teardown;
window[key] = state;
document.addEventListener('pointermove', onPointerMove, true);
document.addEventListener('click', onClick, true);
document.addEventListener('keydown', onKeyDown, true);
return { status: state.status, armedAt: state.armedAt, selection: null };
`;

const ELEMENT_PICKER_POLL_SCRIPT = String.raw`
const state = window['__ATELIER_ELEMENT_PICKER_V1__'];
if (!state) return { status: 'idle', armedAt: 0, selection: null };
return {
  status: state.status || 'idle',
  armedAt: Number(state.armedAt || 0),
  selection: state.selection || null,
  error: String(state.error || '')
};
`;

const ELEMENT_PICKER_CANCEL_SCRIPT = String.raw`
const state = window['__ATELIER_ELEMENT_PICKER_V1__'];
if (!state) return { status: 'idle', armedAt: 0, selection: null };
if (typeof state.teardown === 'function') state.teardown();
state.status = 'cancelled';
return { status: state.status, armedAt: Number(state.armedAt || 0), selection: state.selection || null };
`;

function normalizeHost(host?: string | null) {
  const value = (host || DEFAULT_HOST).trim();
  if (value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]") {
    return value === "[::1]" ? "::1" : value;
  }
  throw new Error("Only localhost Tauri dev screens are allowed.");
}

function normalizeWindowLabel(windowLabel?: string | null) {
  const value = (windowLabel || DEFAULT_WINDOW).trim();
  if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(value)) {
    throw new Error("Invalid Tauri window label.");
  }
  return value;
}

function normalizePort(port?: number | null) {
  if (!port) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid Tauri bridge port.");
  }
  return port;
}

function wsUrl(host: string, port: number) {
  const displayHost = host === "::1" ? "[::1]" : host;
  return `ws://${displayHost}:${port}`;
}

function connectBridge(host: string, port: number, timeoutMs = CONNECT_TIMEOUT_MS): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(host, port));
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
      if (error) {
        try { ws.close(); } catch {}
        reject(error);
      } else {
        resolve(ws);
      }
    };
    const timer = window.setTimeout(() => finish(new Error(`Timed out connecting to ${wsUrl(host, port)}`)), timeoutMs);
    const onOpen = () => finish();
    const onError = () => finish(new Error(`No bridge at ${wsUrl(host, port)}`));
    ws.addEventListener("open", onOpen, { once: true });
    ws.addEventListener("error", onError, { once: true });
  });
}

async function openBridge(options: DevScreenOptions) {
  const host = normalizeHost(options.host);
  const requestedPort = normalizePort(options.port);
  const windowLabel = normalizeWindowLabel(options.windowLabel);
  if (requestedPort) {
    return { ws: await connectBridge(host, requestedPort), host, port: requestedPort, windowLabel };
  }

  const deadline = Date.now() + (options.timeoutMs || DEFAULT_TIMEOUT_MS);
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    for (let port = 9223; port <= 9322; port += 1) {
      try {
        return { ws: await connectBridge(host, port, 140), host, port, windowLabel };
      } catch (error) {
        lastError = error;
      }
      if (Date.now() >= deadline) break;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 450));
  }
  throw new Error(lastError instanceof Error ? lastError.message : "No tauri-plugin-mcp-bridge WebSocket found.");
}

function sendBridge(ws: WebSocket, command: string, args: Record<string, unknown> = {}) {
  const id = `atelier-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise<BridgeMessage>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      reject(new Error(`Timed out waiting for ${command}`));
    }, 15000);

    function onMessage(event: MessageEvent) {
      let msg: BridgeMessage;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.id !== id) return;
      window.clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      if (msg.success === false) {
        reject(new Error(msg.error || `${command} failed`));
        return;
      }
      resolve(msg);
    }

    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id, command, args }));
  });
}

async function withBridge<T>(
  options: DevScreenOptions,
  run: (bridge: { ws: WebSocket; host: string; port: number; windowLabel: string }) => Promise<T>,
) {
  const bridge = await openBridge(options);
  try {
    return await run(bridge);
  } finally {
    try { bridge.ws.close(); } catch {}
  }
}

async function executeJs(bridge: { ws: WebSocket; windowLabel: string }, script: string) {
  const result = await sendBridge(bridge.ws, "execute_js", {
    windowLabel: bridge.windowLabel,
    script,
  });
  return result.data;
}

function formatSnapshot(data: unknown) {
  const record = (data || {}) as {
    title?: string;
    url?: string;
    viewport?: { width?: number; height?: number; devicePixelRatio?: number };
    nodes?: Array<{ depth?: number; role?: string; tag?: string; id?: string; class?: string; label?: string; rect?: number[] }>;
  };
  const lines = [
    `title: ${record.title || ""}`,
    `url: ${record.url || ""}`,
    `viewport: ${record.viewport?.width || "?"}x${record.viewport?.height || "?"} @${record.viewport?.devicePixelRatio || "?"}`,
    `nodes: ${record.nodes?.length || 0}`,
    "",
  ];
  for (const node of record.nodes || []) {
    const indent = " ".repeat(Math.min(Number(node.depth || 0), 10));
    const bits = [node.role || node.tag || "node"];
    if (node.id) bits.push(`#${node.id}`);
    if (node.class) bits.push(`.${node.class}`);
    if (node.label) bits.push(`"${node.label}"`);
    bits.push(`[${(node.rect || []).join(",")}]`);
    lines.push(`${indent}- ${bits.join(" ")}`);
  }
  return lines.join("\n");
}

function jsString(value: string) {
  return JSON.stringify(value);
}

function redactDiagnosticText(value: unknown, max: number) {
  const text = String(value ?? "")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]{8,}/gi, "<redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "<redacted>")
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|authorization|password)\s*[:=]\s*["']?[^\s,"';}\]]+/gi,
      "$1=<redacted>",
    )
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sanitizeDiagnosticUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return redactDiagnosticText(url.toString(), 360);
  } catch {
    return redactDiagnosticText(raw.split(/[?#]/, 1)[0] || "", 360);
  }
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const DEV_SCREEN_STYLE_ALLOWLIST = new Set([
  "display", "position", "top", "right", "bottom", "left",
  "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
  "marginTop", "marginRight", "marginBottom", "marginLeft",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "gap",
  "flexDirection", "flexWrap", "flexGrow", "flexShrink",
  "alignItems", "alignSelf", "justifyContent",
  "gridTemplateColumns", "gridTemplateRows",
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "color", "backgroundColor", "borderColor", "borderStyle", "borderWidth",
  "borderRadius", "boxShadow", "opacity", "overflow", "textAlign",
]);

function normalizePickerStatus(value: unknown): DevScreenElementPickerStatus {
  return value === "armed" || value === "selected" || value === "cancelled" || value === "error"
    ? value
    : "idle";
}

function sanitizeElementMarkup(value: unknown) {
  return redactDiagnosticText(value, 700)
    .replace(
      /\s(?:value|src|href|action|formaction|style|on[a-z]+|data-(?!testid\b)[a-z0-9_-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      "",
    )
    .slice(0, 700);
}

export function normalizeDevScreenElementSelection(data: unknown): DevScreenElementSelection | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const selector = redactDiagnosticText(record.selector, 360);
  const tag = redactDiagnosticText(record.tag, 40).toLowerCase();
  if (
    !selector
    || !/^[a-z][a-z0-9-]*$/i.test(tag)
    || /\[(?:value|src|href|action|formaction|style|on[a-z]+|data-(?!testid\b)[a-z0-9_-]+)\s*=/i.test(selector)
  ) return null;

  const rectRecord = record.rect && typeof record.rect === "object" && !Array.isArray(record.rect)
    ? record.rect as Record<string, unknown>
    : {};
  const stylesRecord = record.styles && typeof record.styles === "object" && !Array.isArray(record.styles)
    ? record.styles as Record<string, unknown>
    : {};
  const styles: Record<string, string> = {};
  for (const [name, value] of Object.entries(stylesRecord)) {
    if (!DEV_SCREEN_STYLE_ALLOWLIST.has(name) || Object.keys(styles).length >= 48) continue;
    const normalized = redactDiagnosticText(value, 160);
    if (normalized) styles[name] = normalized;
  }

  return {
    selector,
    tag,
    role: redactDiagnosticText(record.role || tag, 80) || tag,
    label: redactDiagnosticText(record.label, 180),
    text: redactDiagnosticText(record.text, 320),
    markup: sanitizeElementMarkup(record.markup),
    rect: {
      x: Math.round(finiteNumber(rectRecord.x)),
      y: Math.round(finiteNumber(rectRecord.y)),
      width: Math.max(0, Math.round(finiteNumber(rectRecord.width))),
      height: Math.max(0, Math.round(finiteNumber(rectRecord.height))),
    },
    styles,
    pageUrl: sanitizeDiagnosticUrl(record.pageUrl),
    selectedAt: finiteNumber(record.selectedAt, Date.now()),
  };
}

function normalizeElementPickerPayload(data: unknown) {
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const status = normalizePickerStatus(record.status);
  const selection = normalizeDevScreenElementSelection(record.selection);
  return {
    status: selection ? "selected" as const : status,
    armedAt: finiteNumber(record.armedAt),
    selection,
    error: redactDiagnosticText(record.error, 300) || undefined,
  };
}

export function formatDevScreenElementSelectionPrompt(
  selection: DevScreenElementSelection | null | undefined,
  language: "ko" | "en",
) {
  if (!selection) return "";
  const labels = language === "en"
    ? {
        section: "Selected preview element",
        page: "Page",
        selector: "Selector",
        element: "Element",
        label: "Visible label",
        markup: "Safe markup",
        rect: "Viewport rect",
        styles: "Computed CSS allowlist",
        instruction: "Use this bounded DOM/CSS evidence as the exact visual edit target. Re-check the preview after editing.",
      }
    : {
        section: "선택한 프리뷰 요소",
        page: "페이지",
        selector: "선택자",
        element: "요소",
        label: "화면 문구",
        markup: "안전한 마크업",
        rect: "화면 위치",
        styles: "허용된 계산 CSS",
        instruction: "이 제한된 DOM/CSS 증거를 정확한 화면 수정 대상으로 사용하고, 수정 후 프리뷰를 다시 검증하세요.",
      };
  const visibleLabel = selection.label || selection.text;
  const styleText = Object.entries(selection.styles)
    .slice(0, 48)
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");
  return [
    `${labels.section}:`,
    selection.pageUrl ? `${labels.page}: ${selection.pageUrl}` : "",
    `${labels.selector}: ${selection.selector}`,
    `${labels.element}: ${selection.tag}${selection.role && selection.role !== selection.tag ? ` (${selection.role})` : ""}`,
    visibleLabel ? `${labels.label}: ${visibleLabel}` : "",
    selection.markup ? `${labels.markup}: ${selection.markup}` : "",
    `${labels.rect}: x=${selection.rect.x}, y=${selection.rect.y}, width=${selection.rect.width}, height=${selection.rect.height}`,
    styleText ? `${labels.styles}: ${styleText}` : "",
    labels.instruction,
  ].filter(Boolean).join("\n");
}

function normalizeDiagnostics(data: unknown): NormalizedDevScreenDiagnostics {
  const record = (data || {}) as {
    pageUrl?: unknown;
    armedAt?: unknown;
    capturedAt?: unknown;
    consoleEntries?: Array<{ level?: unknown; text?: unknown; capturedAt?: unknown }>;
    runtimeErrors?: unknown[];
    networkEntries?: Array<{
      url?: unknown;
      initiatorType?: unknown;
      status?: unknown;
      durationMs?: unknown;
      transferSize?: unknown;
    }>;
    networkFailures?: unknown[];
  };
  return {
    pageUrl: sanitizeDiagnosticUrl(record.pageUrl),
    armedAt: finiteNumber(record.armedAt, Date.now()),
    capturedAt: finiteNumber(record.capturedAt, Date.now()),
    consoleEntries: (record.consoleEntries || []).slice(-24).map((entry) => {
      const level: DevScreenConsoleEntry["level"] = entry.level === "warn" ? "warn" : "error";
      return {
        level,
        text: redactDiagnosticText(entry.text, 600),
        capturedAt: finiteNumber(entry.capturedAt, Date.now()),
      };
    }).filter((entry) => entry.text),
    runtimeErrors: (record.runtimeErrors || [])
      .slice(-24)
      .map((entry) => redactDiagnosticText(entry, 600))
      .filter(Boolean),
    networkEntries: (record.networkEntries || []).slice(-40).map((entry) => {
      const status = finiteNumber(entry.status);
      const transferSize = finiteNumber(entry.transferSize);
      return {
        url: sanitizeDiagnosticUrl(entry.url),
        initiatorType: redactDiagnosticText(entry.initiatorType || "resource", 40) || "resource",
        status: status > 0 ? Math.round(status) : undefined,
        durationMs: Math.max(0, Math.round(finiteNumber(entry.durationMs) * 10) / 10),
        transferSize: transferSize > 0 ? Math.round(transferSize) : undefined,
      };
    }).filter((entry) => entry.url),
    networkFailures: (record.networkFailures || [])
      .slice(-24)
      .map((entry) => redactDiagnosticText(entry, 600))
      .filter(Boolean),
  };
}

export async function devScreenStatus(options: DevScreenOptions): Promise<DevScreenStatusResult> {
  return withBridge(options, async (bridge) => {
    const backend = await sendBridge(bridge.ws, "invoke_tauri", {
      command: "plugin:mcp-bridge|get_backend_state",
      args: { windowLabel: bridge.windowLabel },
    });
    const windows = await sendBridge(bridge.ws, "list_windows");
    return {
      ok: true,
      host: bridge.host,
      port: bridge.port,
      windowLabel: bridge.windowLabel,
      backend,
      windows,
    };
  });
}

export async function devScreenScreenshot(options: DevScreenOptions): Promise<DevScreenScreenshotResult> {
  return withBridge(options, async (bridge) => {
    const shot = await sendBridge(bridge.ws, "capture_native_screenshot", {
      windowLabel: bridge.windowLabel,
      format: "png",
    });
    return {
      host: bridge.host,
      port: bridge.port,
      windowLabel: bridge.windowLabel,
      dataUrl: String(shot.data || ""),
      capturedAt: Date.now(),
    };
  });
}

export async function devScreenSnapshot(options: DevScreenOptions): Promise<DevScreenSnapshotResult> {
  return withBridge(options, async (bridge) => {
    const data = await executeJs(bridge, SNAPSHOT_SCRIPT);
    return {
      host: bridge.host,
      port: bridge.port,
      windowLabel: bridge.windowLabel,
      data,
      text: formatSnapshot(data),
      capturedAt: Date.now(),
    };
  });
}

export async function devScreenDiagnostics(options: DevScreenOptions): Promise<DevScreenDiagnosticsResult> {
  return withBridge(options, async (bridge) => ({
    host: bridge.host,
    port: bridge.port,
    windowLabel: bridge.windowLabel,
    ...normalizeDiagnostics(await executeJs(bridge, DIAGNOSTICS_SCRIPT)),
  }));
}

async function runElementPickerScript(
  options: DevScreenOptions,
  script: string,
): Promise<DevScreenElementPickerResult> {
  return withBridge(options, async (bridge) => ({
    host: bridge.host,
    port: bridge.port,
    windowLabel: bridge.windowLabel,
    ...normalizeElementPickerPayload(await executeJs(bridge, script)),
  }));
}

export function devScreenElementPickerStart(options: DevScreenOptions) {
  return runElementPickerScript(options, ELEMENT_PICKER_START_SCRIPT);
}

export function devScreenElementPickerPoll(options: DevScreenOptions) {
  return runElementPickerScript(options, ELEMENT_PICKER_POLL_SCRIPT);
}

export function devScreenElementPickerCancel(options: DevScreenOptions) {
  return runElementPickerScript(options, ELEMENT_PICKER_CANCEL_SCRIPT);
}

export async function devScreenCheck(options: DevScreenOptions): Promise<DevScreenCheckResult> {
  const status = await devScreenStatus(options);
  const pinned = { ...options, port: status.port };
  const diagnostics = await devScreenDiagnostics(pinned);
  const [screenshot, snapshot] = await Promise.all([
    devScreenScreenshot(pinned),
    devScreenSnapshot(pinned),
  ]);
  return { status, screenshot, snapshot, diagnostics, checkedAt: Date.now() };
}

export async function devScreenJs(options: DevScreenOptions, code: string): Promise<DevScreenActionResult> {
  return withBridge(options, async (bridge) => ({
    host: bridge.host,
    port: bridge.port,
    windowLabel: bridge.windowLabel,
    data: await executeJs(bridge, code),
  }));
}

export async function devScreenClick(options: DevScreenOptions, selector: string): Promise<DevScreenActionResult> {
  return devScreenJs(options, `
const el = document.querySelector(${jsString(selector)});
if (!el) throw new Error('selector not found');
el.scrollIntoView({ block: 'center', inline: 'center' });
el.click();
return { clicked: true, selector: ${jsString(selector)} };
`);
}

export async function devScreenType(options: DevScreenOptions, selector: string, text: string): Promise<DevScreenActionResult> {
  return devScreenJs(options, `
const el = document.querySelector(${jsString(selector)});
if (!el) throw new Error('selector not found');
el.focus();
const value = ${jsString(text)};
if ('value' in el) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
} else {
  el.textContent = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
}
return { typed: true, selector: ${jsString(selector)}, length: value.length };
`);
}

export async function devScreenKey(options: DevScreenOptions, key: string): Promise<DevScreenActionResult> {
  return devScreenJs(options, `
const target = document.activeElement || document.body;
for (const type of ['keydown', 'keyup']) {
  target.dispatchEvent(new KeyboardEvent(type, { key: ${jsString(key)}, bubbles: true }));
}
return { key: ${jsString(key)}, target: target.tagName };
`);
}

export async function devScreenResize(options: DevScreenOptions, width: number, height: number): Promise<DevScreenActionResult> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 320 || height < 240 || width > 5120 || height > 3200) {
    throw new Error("Invalid Tauri window size.");
  }
  return withBridge(options, async (bridge) => {
    const result = await sendBridge(bridge.ws, "resize_window", {
      windowId: bridge.windowLabel,
      width: Math.round(width),
      height: Math.round(height),
      logical: true,
    });
    return {
      host: bridge.host,
      port: bridge.port,
      windowLabel: bridge.windowLabel,
      data: result.data,
    };
  });
}
