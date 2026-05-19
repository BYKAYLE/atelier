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

export interface DevScreenActionResult {
  host: string;
  port: number;
  windowLabel: string;
  data: unknown;
}

export interface DevScreenCheckResult {
  status: DevScreenStatusResult;
  screenshot: DevScreenScreenshotResult;
  snapshot: DevScreenSnapshotResult;
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

export async function devScreenCheck(options: DevScreenOptions): Promise<DevScreenCheckResult> {
  const status = await devScreenStatus(options);
  const screenshot = await devScreenScreenshot({ ...options, port: status.port });
  const snapshot = await devScreenSnapshot({ ...options, port: status.port });
  return { status, screenshot, snapshot, checkedAt: Date.now() };
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
