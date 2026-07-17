import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultBinary = path.join(
  root,
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32" ? "atelier.exe" : "atelier",
);
const binary = process.env.ATELIER_BINARY || defaultBinary;
if (!existsSync(binary)) {
  throw new Error(`Atelier binary not found: ${binary}. Run cargo build first.`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const requestedWrites = Number.parseInt(process.env.ATELIER_PTY_SMOKE_WRITES || "100", 10);
const latencyWriteCount = Number.isFinite(requestedWrites)
  ? Math.min(Math.max(requestedWrites, 20), 2_000)
  : 100;
const temp = await mkdtemp(path.join(os.tmpdir(), "atelier-pty-supervisor-"));
const descriptorPath = path.join(temp, "endpoint.json");
const token = randomBytes(32).toString("hex");
let descriptor;
let supervisor;

async function launchSupervisorAfterParentExit() {
  const launcherSource = String.raw`
const { spawn } = require("node:child_process");
const [binary, token, descriptorPath] = process.argv.slice(1);
const child = spawn(binary, ["--atelier-pty-supervisor"], {
  detached: true,
  env: {
    ...process.env,
    ATELIER_PTY_SUPERVISOR_TOKEN: token,
    ATELIER_PTY_SUPERVISOR_DESCRIPTOR: descriptorPath,
  },
  stdio: "ignore",
  windowsHide: true,
});
child.unref();
process.stdout.write(String(child.pid));
`;
  const launcher = spawn(
    process.execPath,
    ["-e", launcherSource, binary, token, descriptorPath],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  const stdout = [];
  const stderr = [];
  launcher.stdout.on("data", (chunk) => stdout.push(chunk));
  launcher.stderr.on("data", (chunk) => stderr.push(chunk));
  const code = await new Promise((resolve, reject) => {
    launcher.once("error", reject);
    launcher.once("exit", resolve);
  });
  if (code !== 0) {
    throw new Error(`PTY supervisor launcher failed: ${Buffer.concat(stderr).toString("utf8")}`);
  }
  const pid = Number.parseInt(Buffer.concat(stdout).toString("utf8"), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error("PTY supervisor launcher did not report a child pid");
  }
  return { pid, launcherExited: true };
}

async function waitForDescriptor() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const parsed = JSON.parse(await readFile(descriptorPath, "utf8"));
      if (parsed.port && parsed.token === token) return parsed;
    } catch {}
    await sleep(40);
  }
  throw new Error("PTY supervisor descriptor was not published within 5 seconds");
}

function request(payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: descriptor.port });
    const chunks = [];
    socket.setTimeout(3_000);
    socket.on("connect", () => {
      socket.end(`${JSON.stringify({ token: descriptor.token, request: payload })}\n`);
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("timeout", () => socket.destroy(new Error("PTY supervisor request timed out")));
    socket.on("error", reject);
    socket.on("close", () => {
      try {
        const response = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!response.ok) throw new Error(response.error || "PTY supervisor request failed");
        resolve(response.data);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function waitForExit(id) {
  const deadline = Date.now() + 7_000;
  while (Date.now() < deadline) {
    const info = await request({ type: "info", id });
    if (info && !info.running) return info;
    await sleep(50);
  }
  throw new Error(`PTY session ${id} did not exit within 7 seconds`);
}

async function waitForProcessExit(pid) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await sleep(40);
  }
  throw new Error(`PTY supervisor process ${pid} did not exit within 3 seconds`);
}

try {
  supervisor = await launchSupervisorAfterParentExit();
  descriptor = await waitForDescriptor();
  if ((await request({ type: "ping" })) !== true) throw new Error("PTY supervisor ping failed");

  const session = await request({
    type: "spawn",
    profile: process.platform === "win32" ? "cmd" : "zsh",
    cols: 80,
    rows: 24,
    log_id: "supervisor-release-smoke",
  });
  const command = process.platform === "win32"
    ? "echo supervisor-ready & ping -n 2 127.0.0.1 >nul & echo supervisor-done & exit\r\n"
    : "printf supervisor-ready; sleep 1; printf supervisor-done; exit\n";
  await request({ type: "write", id: session.id, data: command });

  // Every request uses a fresh socket. Reaching the completed session here
  // proves the journal survives client/renderer disconnection.
  const completed = await waitForExit(session.id);
  const snapshot = await request({ type: "snapshot", id: session.id, after_sequence: 0 });
  const output = Buffer.concat(
    snapshot.frames.map((frame) => Buffer.from(frame.data, "base64")),
  ).toString("utf8");
  if (!output.includes("supervisor-ready") || !output.includes("supervisor-done")) {
    throw new Error(`reconnected PTY output is incomplete: ${JSON.stringify(output)}`);
  }
  await request({ type: "kill", id: session.id });

  // Keep several sessions alive without a renderer connection. Every command,
  // status poll, and snapshot uses a fresh socket, matching hidden task tabs
  // and an application shell that reconnects after a restart.
  const parallelSessionCount = 3;
  const parallelSessions = await Promise.all(
    Array.from({ length: parallelSessionCount }, (_, index) => request({
      type: "spawn",
      profile: process.platform === "win32" ? "cmd" : "zsh",
      cols: 80,
      rows: 24,
      log_id: `supervisor-parallel-${index}`,
    })),
  );
  await Promise.all(parallelSessions.map((parallelSession, index) => {
    const marker = `parallel-${index}`;
    const parallelCommand = process.platform === "win32"
      ? `echo ${marker}-ready & ping -n 2 127.0.0.1 >nul & echo ${marker}-done & exit\r\n`
      : `printf ${marker}-ready; sleep 1; printf ${marker}-done; exit\n`;
    return request({ type: "write", id: parallelSession.id, data: parallelCommand });
  }));
  const parallelCompleted = await Promise.all(
    parallelSessions.map((parallelSession) => waitForExit(parallelSession.id)),
  );
  const parallelSnapshots = await Promise.all(
    parallelSessions.map((parallelSession) => request({
      type: "snapshot",
      id: parallelSession.id,
      after_sequence: 0,
    })),
  );
  for (let index = 0; index < parallelSessions.length; index += 1) {
    const marker = `parallel-${index}`;
    const parallelOutput = Buffer.concat(
      parallelSnapshots[index].frames.map((frame) => Buffer.from(frame.data, "base64")),
    ).toString("utf8");
    if (parallelCompleted[index].exit_code !== 0
      || !parallelOutput.includes(`${marker}-ready`)
      || !parallelOutput.includes(`${marker}-done`)) {
      throw new Error(`parallel PTY ${index} did not survive reconnect: ${JSON.stringify(parallelOutput)}`);
    }
  }
  await Promise.all(
    parallelSessions.map((parallelSession) => request({ type: "kill", id: parallelSession.id })),
  );

  const latencySession = await request({
    type: "spawn",
    profile: process.platform === "win32" ? "cmd" : "zsh",
    cols: 80,
    rows: 24,
    log_id: "supervisor-latency-smoke",
  });
  await sleep(100);
  const timings = [];
  for (let index = 0; index < latencyWriteCount; index += 1) {
    const started = performance.now();
    await request({ type: "write", id: latencySession.id, data: "x" });
    timings.push(performance.now() - started);
  }
  await request({ type: "kill", id: latencySession.id });
  timings.sort((left, right) => left - right);
  const medianMs = timings[Math.floor(timings.length / 2)];
  const p95Ms = timings[Math.floor(timings.length * 0.95) - 1];
  if (p95Ms > 20) throw new Error(`PTY IPC p95 latency is too high: ${p95Ms.toFixed(2)}ms`);

  console.log(JSON.stringify({
    ok: true,
    protocol: descriptor.protocol,
    launcherExited: supervisor.launcherExited,
    reconnected: true,
    parallelSessions: parallelSessionCount,
    parallelReconnect: true,
    exitCode: completed.exit_code,
    latestSequence: snapshot.latest_sequence,
    inputLatencyMedianMs: Number(medianMs.toFixed(3)),
    inputLatencyP95Ms: Number(p95Ms.toFixed(3)),
    latencyWriteCount,
  }));
} finally {
  const supervisorPid = descriptor?.pid || supervisor?.pid;
  if (descriptor?.pid) {
    try { process.kill(descriptor.pid); } catch {}
  } else if (supervisor?.pid) {
    try { process.kill(supervisor.pid); } catch {}
  }
  if (supervisorPid) {
    try { await waitForProcessExit(supervisorPid); } catch (error) { console.warn(String(error)); }
  }
  await rm(temp, { recursive: true, force: true });
}
