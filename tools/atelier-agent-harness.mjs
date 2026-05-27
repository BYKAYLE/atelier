#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_PROMPT = "ok만 답해";
const DEFAULT_TIMEOUT_MS = 120_000;
const FIXTURE_NAMES = ["claude-success-exit-1", "claude-error-exit-0"];

function parseArgs(argv) {
  const out = {
    provider: "claude",
    prompt: DEFAULT_PROMPT,
    cwd: process.cwd(),
    model: "",
    hermesProvider: "openai-codex",
    permission: "full",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    fixture: "",
    json: false,
    outDir: path.join(process.cwd(), "src-tauri", "target", "atelier-harness"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[i];
    };
    switch (arg) {
      case "--provider":
        out.provider = next();
        break;
      case "--prompt":
        out.prompt = next();
        break;
      case "--cwd":
        out.cwd = path.resolve(next());
        break;
      case "--model":
        out.model = next();
        break;
      case "--hermes-provider":
        out.hermesProvider = next();
        break;
      case "--permission":
        out.permission = next();
        break;
      case "--timeout":
        out.timeoutMs = Number(next()) * 1000;
        break;
      case "--fixture":
        out.fixture = next();
        break;
      case "--out-dir":
        out.outDir = path.resolve(next());
        break;
      case "--json":
        out.json = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Atelier agent harness

Runs the same structured CLI adapter shape that Atelier uses for agent chat.

Usage:
  node tools/atelier-agent-harness.mjs --provider claude --prompt "ok만 답해"
  npm run harness:fixture

Options:
  --provider claude|codex|hermes|all   Provider to run. Default: claude
  --prompt TEXT                        Prompt to send. Default: ${DEFAULT_PROMPT}
  --cwd PATH                           Working directory. Default: current repo
  --model NAME                         Provider model override
  --hermes-provider NAME               Hermes backend. Default: openai-codex
  --permission basic|auto|full         Matches Atelier permission mode. Default: full
  --timeout SECONDS                    Per-provider timeout. Default: 120
  --fixture NAME|all                   Run parser fixture instead of a live CLI
  --json                               Print JSON only
  --out-dir PATH                       Artifact directory. Default: src-tauri/target/atelier-harness
`);
}

function augmentedPath() {
  const home = os.homedir();
  const existing = process.env.PATH || "";
  if (process.platform === "win32") {
    const userProfile = process.env.USERPROFILE || home || "";
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "";
    const extras = [
      path.join(userProfile, "AppData", "Roaming", "npm"),
      path.join(userProfile, ".claude", "local"),
      path.join(userProfile, ".claude", "local", "bin"),
      path.join(userProfile, ".local", "bin"),
      localAppData && path.join(localAppData, "Programs", "nodejs"),
      localAppData && path.join(localAppData, "hermes", "hermes-agent"),
      localAppData && path.join(localAppData, "hermes", "hermes-agent", "venv", "Scripts"),
      localAppData && path.join(localAppData, "hermes", "node"),
      programFiles && path.join(programFiles, "nodejs"),
      programFiles && path.join(programFiles, "Git", "bin"),
      programFiles && path.join(programFiles, "Git", "cmd"),
      programFilesX86 && path.join(programFilesX86, "nodejs"),
      programFilesX86 && path.join(programFilesX86, "Git", "bin"),
      programFilesX86 && path.join(programFilesX86, "Git", "cmd"),
    ].filter(Boolean);
    return [...extras, existing].filter(Boolean).join(";");
  }

  const base =
    process.platform === "darwin"
      ? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
      : "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  const extras = home
    ? `${home}/.claude/local:${home}/.local/bin:${home}/.npm-global/bin:${home}/bin:${base}`
    : base;
  return existing ? `${extras}:${existing}` : extras;
}

function normalizePermission(permission) {
  const p = String(permission || "full").trim().toLowerCase();
  if (p === "basic" || p === "default") return "basic";
  if (p === "auto" || p === "autoreview" || p === "auto-review") return "auto";
  return "full";
}

function claudePermission(permission) {
  switch (normalizePermission(permission)) {
    case "basic":
      return "default";
    case "auto":
      return "auto";
    default:
      return "bypassPermissions";
  }
}

function codexPermissionArgs(permission) {
  switch (normalizePermission(permission)) {
    case "basic":
      return ["--sandbox", "workspace-write"];
    case "auto":
      return ["--full-auto"];
    default:
      return ["--dangerously-bypass-approvals-and-sandbox"];
  }
}

function pathEntries() {
  return augmentedPath()
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function windowsExtensions(extensions = []) {
  if (extensions.length > 0) {
    return [...new Set(extensions.map((ext) => ext.replace(/^\./, "").toLowerCase()))];
  }
  const fromEnv = String(process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((ext) => ext.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
  const out = [...fromEnv];
  for (const ext of ["exe", "cmd", "bat", "com"]) out.push(ext);
  return [...new Set(out)];
}

function findOnPath(command, extensions = []) {
  for (const dir of pathEntries()) {
    const direct = path.join(dir, command);
    if (existsSync(direct)) return direct;
    if (process.platform === "win32") {
      for (const ext of windowsExtensions(extensions)) {
        const candidate = path.join(dir, `${command}.${ext}`);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return "";
}

function windowsNpmModuleRoots(shim = "") {
  const roots = [];
  if (shim) {
    const shimDir = path.dirname(shim);
    roots.push(path.join(shimDir, "node_modules"));
    roots.push(path.join(path.dirname(shimDir), "node_modules"));
  }
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  const appData = process.env.APPDATA || "";
  const localAppData = process.env.LOCALAPPDATA || "";
  if (home) {
    roots.push(path.join(home, "AppData", "Roaming", "npm", "node_modules"));
    roots.push(path.join(home, ".npm-global", "node_modules"));
  }
  if (appData) roots.push(path.join(appData, "npm", "node_modules"));
  if (localAppData) {
    roots.push(path.join(localAppData, "Programs", "nodejs", "node_modules"));
  }
  for (const envKey of ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"]) {
    const base = process.env[envKey];
    if (base) roots.push(path.join(base, "node_modules"));
  }
  return [...new Set(roots)];
}

function windowsNpmCliEntry(cli, shim = "") {
  const candidates = {
    codex: [["@openai", "codex", "bin", "codex.js"]],
    claude: [
      ["@anthropic-ai", "claude-code", "cli.js"],
      ["@anthropic-ai", "claude-code", "cli.mjs"],
      ["@anthropic-ai", "claude-code", "bin", "claude.js"],
      ["@anthropic-ai", "claude-code", "bin", "claude.mjs"],
      ["@anthropic-ai", "claude-code", "index.js"],
    ],
  }[cli] || [];
  for (const root of windowsNpmModuleRoots(shim)) {
    for (const relative of candidates) {
      const candidate = path.join(root, ...relative);
      if (existsSync(candidate)) return candidate;
    }
  }
  return "";
}

function windowsNativeClaude() {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  if (!home) return "";
  for (const candidate of [
    path.join(home, ".claude", "local", "claude.exe"),
    path.join(home, ".claude", "local", "bin", "claude.exe"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

function isWindowsShellScript(filePath) {
  const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
  return ext === "cmd" || ext === "bat";
}

function cliCommandSpec(cli) {
  if (process.platform !== "win32") {
    return { command: cli, args: [] };
  }

  if (cli === "claude") {
    const native = windowsNativeClaude();
    if (native) return { command: native, args: [] };
  }

  const direct = findOnPath(cli, ["exe", "com"]);
  if (direct) return { command: direct, args: [] };

  const npmEntry = windowsNpmCliEntry(cli);
  const node = findOnPath("node", ["exe", "com"]) || "node";
  if (npmEntry) return { command: node, args: [npmEntry] };

  const shim = findOnPath(cli, ["cmd", "bat"]);
  if (shim) {
    const shimEntry = windowsNpmCliEntry(cli, shim);
    if (shimEntry) return { command: node, args: [shimEntry] };
    if (isWindowsShellScript(shim)) {
      return { command: "cmd.exe", args: ["/D", "/Q", "/S", "/C", shim] };
    }
    return { command: shim, args: [] };
  }

  return { command: cli, args: [] };
}

function redact(text) {
  return String(text || "")
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret)["':=\s]+[^,"'\s]+/gi, "$1=<redacted>")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>");
}

function commandForProvider(options) {
  if (options.provider === "claude") {
    const cli = cliCommandSpec("claude");
    return {
      command: cli.command,
      args: [
        ...cli.args,
        "-p",
        "--verbose",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--model",
        options.model || "claude-sonnet-4-6",
        "--permission-mode",
        claudePermission(options.permission),
        "--setting-sources",
        "local,project",
      ],
      stdin: `${options.prompt}\n`,
    };
  }

  if (options.provider === "codex") {
    const cli = cliCommandSpec("codex");
    return {
      command: cli.command,
      args: [
        ...cli.args,
        "exec",
        "--cd",
        options.cwd,
        ...(options.model ? ["--model", options.model] : []),
        ...codexPermissionArgs(options.permission),
        "--json",
        "--skip-git-repo-check",
        options.prompt,
      ],
      stdin: "",
    };
  }

  if (options.provider === "hermes") {
    const cli = cliCommandSpec("hermes");
    return {
      command: cli.command,
      args: [
        ...cli.args,
        "chat",
        "--source",
        "tool",
        "--max-turns",
        "90",
        "--provider",
        options.hermesProvider,
        "-m",
        options.model || "gpt-5.5",
        "-q",
        options.prompt,
        ...(normalizePermission(options.permission) === "auto" ? ["--checkpoints"] : []),
        ...(normalizePermission(options.permission) === "full" ? ["--yolo"] : []),
      ],
      stdin: "",
    };
  }

  throw new Error(`Unsupported provider: ${options.provider}`);
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function textFromAssistantMessage(value) {
  const content = value?.message?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function analyzeClaudeLine(state, line) {
  const value = parseJsonLine(line);
  if (!value) {
    state.rawTextLines += 1;
    return;
  }
  state.jsonLines += 1;
  if (value.session_id) state.sessionId = value.session_id;
  if (String(line).toLowerCase().includes("hook")) state.hookMarkers += 1;

  if (value.type === "system" && value.subtype === "init") {
    state.model = value.model || state.model;
    state.apiKeySource = value.apiKeySource || "";
    state.plugins = Array.isArray(value.plugins) ? value.plugins : [];
    state.mcpServers = Array.isArray(value.mcp_servers) ? value.mcp_servers : [];
  }

  if (value.type === "stream_event") {
    const event = value.event || {};
    if (event.type === "content_block_delta") {
      const delta = event.delta || {};
      if (typeof delta.text === "string") {
        state.deltaText += delta.text;
      }
      if (typeof delta.thinking === "string") {
        state.thinkingDeltas += 1;
      }
    }
  }

  if (value.type === "assistant") {
    const text = textFromAssistantMessage(value);
    if (text) state.assistantText = text;
  }

  if (value.type === "result") {
    state.result = {
      subtype: value.subtype || "",
      isError: Boolean(value.is_error),
      terminalReason: value.terminal_reason || "",
      stopReason: value.stop_reason || "",
      result: value.result || "",
    };
    if (typeof value.result === "string") state.finalText = value.result;
  }

  if (value.type === "error") {
    state.errorEvents.push(value.message || line);
  }
}

function claudeStreamCompletedSuccessfully(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const value = parseJsonLine(lines[i]);
    if (!value || value.type !== "result") continue;
    if (value.is_error === true) return false;
    return value.subtype === "success" || value.terminal_reason === "completed";
  }
  return false;
}

function analyzePlainProviderLine(state, line) {
  const value = parseJsonLine(line);
  if (value) {
    state.jsonLines += 1;
    if (value.session_id || value.sessionId) state.sessionId = value.session_id || value.sessionId;
    if (typeof value.result === "string") state.finalText = value.result;
    if (typeof value.message === "string") state.finalText += value.message;
    if (value.type === "error" || value.is_error === true) state.errorEvents.push(value.message || line);
  } else {
    state.rawTextLines += 1;
    if (line.trim()) {
      state.finalText += `${state.finalText ? "\n" : ""}${line}`;
    }
  }
}

function emptyState(provider) {
  return {
    provider,
    model: "",
    sessionId: "",
    apiKeySource: "",
    plugins: [],
    mcpServers: [],
    jsonLines: 0,
    rawTextLines: 0,
    hookMarkers: 0,
    thinkingDeltas: 0,
    deltaText: "",
    assistantText: "",
    finalText: "",
    result: null,
    errorEvents: [],
  };
}

async function runProvider(options) {
  const spec = commandForProvider(options);
  const state = emptyState(options.provider);
  const stdoutLines = [];
  const stderrChunks = [];
  const env = {
    ...process.env,
    PATH: augmentedPath(),
    LANG: "ko_KR.UTF-8",
    LC_CTYPE: "ko_KR.UTF-8",
  };

  const startedAt = Date.now();
  const child = spawn(spec.command, spec.args, {
    cwd: options.cwd,
    env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutRemainder = "";
  let stderr = "";
  const done = new Promise((resolve) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref?.();
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutRemainder += chunk.toString("utf8");
      const parts = stdoutRemainder.split(/\r?\n/);
      stdoutRemainder = parts.pop() || "";
      for (const line of parts) {
        if (!line.trim()) continue;
        const redacted = redact(line);
        stdoutLines.push(redacted);
        if (options.provider === "claude") {
          analyzeClaudeLine(state, redacted);
        } else {
          analyzePlainProviderLine(state, redacted);
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      stderrChunks.push(redact(chunk.toString("utf8")));
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ spawnError: error.message, exitCode: null, signal: null, timedOut });
    });

    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (stdoutRemainder.trim()) {
        const redacted = redact(stdoutRemainder.trim());
        stdoutLines.push(redacted);
        if (options.provider === "claude") {
          analyzeClaudeLine(state, redacted);
        } else {
          analyzePlainProviderLine(state, redacted);
        }
      }
      resolve({ exitCode, signal, timedOut });
    });
  });

  if (spec.stdin) {
    child.stdin.write(spec.stdin);
  }
  child.stdin.end();

  const processResult = await done;
  const durationMs = Date.now() - startedAt;
  const streamSuccess =
    options.provider === "claude" ? claudeStreamCompletedSuccessfully(stdoutLines) : false;
  const adapterError =
    state.errorEvents.length > 0 ||
    (options.provider === "claude" && state.result?.isError === true);
  const providerExitOk =
    options.provider === "claude"
      ? streamSuccess
      : processResult.exitCode === 0;
  const ok =
    !processResult.spawnError &&
    !processResult.timedOut &&
    providerExitOk &&
    !adapterError;

  return {
    ok,
    adapterVerdict: ok ? "success" : "failure",
    lateNonZeroExitIgnored: Boolean(streamSuccess && processResult.exitCode !== 0),
    process: {
      command: spec.command,
      args: spec.args,
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      timedOut: Boolean(processResult.timedOut),
      spawnError: processResult.spawnError || "",
      durationMs,
    },
    state,
    stderr: redact(stderr || stderrChunks.join("")).trim(),
    stdoutTail: stdoutLines.slice(-20),
  };
}

function fixtureLines(name) {
  const base = {
    type: "system",
    subtype: "init",
    model: "claude-sonnet-4-6",
    apiKeySource: "none",
    plugins: [],
    session_id: `fixture-${name}`,
  };
  if (name === "claude-success-exit-1") {
    return {
      expectedOk: true,
      exitCode: 1,
      stderr: "fixture synthetic late exit 1",
      lines: [
        JSON.stringify(base),
        JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: "ok" }] },
          session_id: `fixture-${name}`,
        }),
        JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: false,
          terminal_reason: "completed",
          result: "ok",
          session_id: `fixture-${name}`,
        }),
      ],
    };
  }
  if (name === "claude-error-exit-0") {
    return {
      expectedOk: false,
      exitCode: 0,
      stderr: "",
      lines: [
        JSON.stringify(base),
        JSON.stringify({
          type: "result",
          subtype: "error",
          is_error: true,
          terminal_reason: "failed",
          result: "401 Invalid authentication credentials",
          session_id: `fixture-${name}`,
        }),
      ],
    };
  }
  throw new Error(`Unknown fixture: ${name}`);
}

function runFixture(name) {
  const fixture = fixtureLines(name);
  const state = emptyState("claude");
  for (const line of fixture.lines) analyzeClaudeLine(state, line);
  const streamSuccess = claudeStreamCompletedSuccessfully(fixture.lines);
  const adapterOk = streamSuccess && state.errorEvents.length === 0 && state.result?.isError !== true;
  const assertionOk = adapterOk === fixture.expectedOk;
  return {
    ok: adapterOk,
    adapterVerdict: adapterOk ? "success" : "failure",
    fixture: {
      name,
      expectedOk: fixture.expectedOk,
      assertionOk,
    },
    lateNonZeroExitIgnored: streamSuccess && fixture.exitCode !== 0,
    process: {
      command: "fixture:claude",
      args: [name],
      exitCode: fixture.exitCode,
      signal: null,
      timedOut: false,
      spawnError: "",
      durationMs: 0,
    },
    state,
    stderr: fixture.stderr,
    stdoutTail: fixture.lines,
  };
}

function writeArtifact(options, payload) {
  mkdirSync(options.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(options.outDir, `atelier-agent-harness-${stamp}.json`);
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  return target;
}

function printSummary(payload, artifactPath) {
  if (payload.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const results = payload.results || [];
  console.log(`Atelier agent harness: ${payload.ok ? "PASS" : "FAIL"}`);
  for (const result of results) {
    const args = result.process.args.join(" ");
    console.log(
      `- ${result.state.provider}: ${result.adapterVerdict} exit=${result.process.exitCode} lateExitIgnored=${result.lateNonZeroExitIgnored}`,
    );
    if (result.fixture) {
      console.log(
        `  fixture: ${result.fixture.name} expected=${result.fixture.expectedOk ? "success" : "failure"} assertion=${result.fixture.assertionOk ? "ok" : "failed"}`,
      );
    }
    console.log(`  command: ${result.process.command} ${args}`);
    if (result.state.model) console.log(`  model: ${result.state.model}`);
    if (result.state.apiKeySource) console.log(`  apiKeySource: ${result.state.apiKeySource}`);
    if (result.state.sessionId) console.log(`  session: ${result.state.sessionId}`);
    if (result.state.hookMarkers) console.log(`  hook markers: ${result.state.hookMarkers}`);
    const text = result.state.finalText || result.state.assistantText || result.state.deltaText;
    if (text) console.log(`  text: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
    if (result.stderr) console.log(`  stderr: ${result.stderr.slice(0, 240).replace(/\s+/g, " ")}`);
  }
  console.log(`artifact: ${artifactPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const providers = options.provider === "all" ? ["claude", "codex", "hermes"] : [options.provider];

  const results = [];
  if (options.fixture) {
    const fixtureNames = options.fixture === "all" ? FIXTURE_NAMES : [options.fixture];
    for (const fixtureName of fixtureNames) {
      results.push(runFixture(fixtureName));
    }
  } else {
    for (const provider of providers) {
      results.push(await runProvider({ ...options, provider }));
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    cwd: options.cwd,
    prompt: options.prompt,
    fixture: options.fixture || null,
    ok: options.fixture
      ? results.every((result) => result.fixture?.assertionOk)
      : results.every((result) => result.ok),
    results,
    json: options.json,
  };
  const artifactPath = writeArtifact(options, payload);
  printSummary(payload, artifactPath);
  process.exit(payload.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(`atelier-agent-harness failed: ${error.message}`);
  process.exit(1);
});
