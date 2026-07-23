#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const result = {
    port: 0,
    providers: [],
    output: "",
    timeoutMs: 10 * 60 * 1000,
    releaseTag: "",
    expectedVersion: "",
    sourceSha: "",
    runId: "",
    runAttempt: "",
    runnerName: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--port") {
      result.port = Number(value);
      index += 1;
    } else if (token === "--providers") {
      result.providers = String(value || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      index += 1;
    } else if (token === "--output") {
      result.output = String(value || "");
      index += 1;
    } else if (token === "--timeout-ms") {
      result.timeoutMs = Number(value);
      index += 1;
    } else if (token === "--release-tag") {
      result.releaseTag = String(value || "");
      index += 1;
    } else if (token === "--expected-version") {
      result.expectedVersion = String(value || "").replace(/^v/, "");
      index += 1;
    } else if (token === "--source-sha") {
      result.sourceSha = String(value || "").toLowerCase();
      index += 1;
    } else if (token === "--run-id") {
      result.runId = String(value || "");
      index += 1;
    } else if (token === "--run-attempt") {
      result.runAttempt = String(value || "");
      index += 1;
    } else if (token === "--runner-name") {
      result.runnerName = String(value || "");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  if (!Number.isInteger(result.port) || result.port < 1 || result.port > 65535) {
    throw new Error("--port must be a valid TCP port");
  }
  if (!result.output) throw new Error("--output is required");
  if (!result.providers.length) throw new Error("--providers is required");
  if (result.providers.some((provider) => !["codex", "claude"].includes(provider))) {
    throw new Error("--providers may contain only codex and claude");
  }
  if (!Number.isFinite(result.timeoutMs) || result.timeoutMs < 10_000) {
    throw new Error("--timeout-ms must be at least 10000");
  }
  const releaseMetadata = [
    result.releaseTag,
    result.expectedVersion,
    result.sourceSha,
    result.runId,
    result.runAttempt,
    result.runnerName,
  ];
  if (releaseMetadata.some(Boolean) && releaseMetadata.some((value) => !value)) {
    throw new Error("release metadata arguments must be supplied together");
  }
  if (result.releaseTag) {
    if (result.releaseTag !== `v${result.expectedVersion}`) {
      throw new Error("--release-tag must match --expected-version");
    }
    if (!/^[0-9a-f]{40}$/.test(result.sourceSha)) {
      throw new Error("--source-sha must be a full Git commit SHA");
    }
    if (!/^[1-9][0-9]*$/.test(result.runId)) {
      throw new Error("--run-id must be a positive integer");
    }
    if (!/^[1-9][0-9]*$/.test(result.runAttempt)) {
      throw new Error("--run-attempt must be a positive integer");
    }
    if (result.runnerName.length > 128 || /[\r\n]/.test(result.runnerName)) {
      throw new Error("--runner-name is invalid");
    }
  }
  return result;
}

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function fetchJson(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const pages = targets.filter(
        (target) =>
          target.type === "page" &&
          typeof target.webSocketDebuggerUrl === "string" &&
          !String(target.url || "").startsWith("devtools://"),
      );
      const target =
        pages.find((candidate) => /tauri|atelier/i.test(`${candidate.url} ${candidate.title}`)) ||
        pages[0];
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Atelier WebView2 target was not available on port ${port}: ${lastError || "timeout"}`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolvePromise, rejectPromise) => {
      const onOpen = () => {
        cleanup();
        resolvePromise();
      };
      const onError = () => {
        cleanup();
        rejectPromise(new Error("Could not connect to the Atelier WebView2 debugger"));
      };
      const cleanup = () => {
        this.socket.removeEventListener("open", onOpen);
        this.socket.removeEventListener("error", onError);
      };
      this.socket.addEventListener("open", onOpen);
      this.socket.addEventListener("error", onError);
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || "CDP command failed"));
      else pending.resolve(message.result);
    });
    this.socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("Atelier WebView2 debugger disconnected"));
      }
      this.pending.clear();
    });
    await this.send("Runtime.enable");
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || "Atelier renderer evaluation failed");
    }
    return response.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitForValue(client, expression, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await client.evaluate(expression);
    if (predicate(lastValue)) return lastValue;
    await sleep(250);
  }
  throw new Error(`${label} timed out`);
}

const selectorExpression = (selector) =>
  `Boolean(document.querySelector(${JSON.stringify(selector)}))`;

async function clickSelector(client, selector, label) {
  const clicked = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement) || element.hasAttribute("disabled")) return false;
    element.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`${label} was unavailable or disabled`);
}

async function witnessProvider(client, provider, timeoutMs) {
  const startedAt = new Date().toISOString();
  await clickSelector(client, `button[data-connection-provider="${provider}"]`, `${provider} provider selector`);
  await waitForValue(
    client,
    selectorExpression(`[data-provider-card="${provider}"]`),
    Boolean,
    15_000,
    `${provider} provider card`,
  );

  const connectedBefore = await client.evaluate(
    `document.querySelector('[data-provider-card="${provider}"]')?.getAttribute('data-provider-connected') === 'true'`,
  );
  await waitForValue(
    client,
    selectorExpression(`[data-provider-oauth-action="${provider}"]`),
    Boolean,
    15_000,
    `${provider} subscription login button`,
  );
  await clickSelector(
    client,
    `[data-provider-oauth-action="${provider}"]`,
    `${provider} subscription login button`,
  );

  const firstOutcome = await waitForValue(
    client,
    `(() => {
      const modal = document.querySelector('[data-testid="provider-login-modal"][data-provider="${provider}"]');
      if (modal) {
        return {
          kind: 'modal',
          detected: modal.getAttribute('data-provider-login-detected') === 'true',
        };
      }
      if (document.querySelector('[data-testid="connection-panel-error"]')) return { kind: 'error' };
      return null;
    })()`,
    (value) => Boolean(value?.kind),
    60_000,
    `${provider} in-app login start`,
  );
  if (firstOutcome.kind === "error") {
    throw new Error(`${provider} in-app subscription login returned an error before opening its modal`);
  }
  if (firstOutcome.detected) {
    throw new Error(`${provider} in-app subscription login skipped the interactive pending state`);
  }

  const detected = await waitForValue(
    client,
    `(() => {
      const modal = document.querySelector('[data-testid="provider-login-modal"][data-provider="${provider}"]');
      if (modal?.getAttribute('data-provider-login-detected') === 'true') return { kind: 'detected' };
      if (document.querySelector('[data-testid="connection-panel-error"]')) return { kind: 'error' };
      return null;
    })()`,
    (value) => Boolean(value?.kind),
    timeoutMs,
    `${provider} in-app authentication`,
  );
  if (detected.kind !== "detected") {
    throw new Error(`${provider} in-app subscription login did not reach the authenticated state`);
  }

  await waitForValue(
    client,
    `document.querySelector('[data-provider-card="${provider}"]')?.getAttribute('data-provider-oauth-connected') === 'true'`,
    Boolean,
    15_000,
    `${provider} OAuth-connected provider state`,
  );
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="provider-login-modal"][data-provider="${provider}"]')`,
    Boolean,
    15_000,
    `${provider} login modal close`,
  );

  return {
    provider,
    startedAt,
    completedAt: new Date().toISOString(),
    connectedBefore: Boolean(connectedBefore),
    loginButtonClicked: true,
    loginModalObserved: true,
    loginPendingStateObserved: true,
    authenticatedStateObserved: true,
    connectedStateObserved: true,
  };
}

const options = parseArgs(process.argv.slice(2));
const outputPath = resolve(options.output);
const receipt = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  releaseTag: options.releaseTag || null,
  expectedVersion: options.expectedVersion || null,
  sourceSha: options.sourceSha || null,
  githubRunId: options.runId || null,
  githubRunAttempt: options.runAttempt ? Number(options.runAttempt) : null,
  runnerName: options.runnerName || null,
  debugPort: options.port,
  target: null,
  providers: [],
  ok: false,
  failure: null,
};

let client;
try {
  const target = await waitForTarget(options.port, 30_000);
  receipt.target = {
    id: target.id,
    title: String(target.title || ""),
    url: String(target.url || ""),
  };
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  await waitForValue(
    client,
    `document.readyState === 'complete' || document.readyState === 'interactive'`,
    Boolean,
    30_000,
    "Atelier renderer readiness",
  );
  await clickSelector(client, 'button[aria-label="Providers"]', "Providers navigation");
  await waitForValue(
    client,
    selectorExpression('[data-testid="connection-provider-picker"]'),
    Boolean,
    30_000,
    "Connections screen",
  );

  for (const provider of options.providers) {
    receipt.providers.push(await witnessProvider(client, provider, options.timeoutMs));
  }
  receipt.ok = true;
} catch (error) {
  receipt.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  client?.close();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(`Atelier in-app login witness: ${outputPath}`);
}
