export type GajaePrefixedInput =
  | { kind: "none" }
  | { kind: "empty" }
  | { kind: "cli"; args: string[] }
  | { kind: "prompt"; prompt: string };

const GAJAE_PREFIX = /^(?:\/)?(?:gjc|gajecode|gajae-code)(?=$|\s)/i;

const GAJAE_CLI_ROOTS = new Set([
  "codex-native-hook",
  "state",
  "setup",
  "skills",
  "session",
  "harness",
  "coordinator",
  "team",
  "ultragoal",
  "gc",
  "ralplan",
  "config",
  "notify",
  "daemon",
  "web-search",
  "q",
  "mcp-serve",
  "contribute-pr",
  "contribution-prep",
  "deep-interview",
  "migrate",
  "rlm",
  "update",
  "launch",
  "help",
]);

export function splitCliArgs(input: string) {
  const args: string[] = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    args.push(value.replace(/\\"/g, "\""));
  }
  return args;
}

export function classifyGajaePrefixedInput(input: string): GajaePrefixedInput {
  const trimmed = input.trim();
  const prefix = trimmed.match(GAJAE_PREFIX);
  if (!prefix) return { kind: "none" };

  const body = trimmed.slice(prefix[0].length).trim();
  if (!body) return { kind: "empty" };

  const args = splitCliArgs(body);
  const root = args[0]?.toLowerCase() || "";
  if (root.startsWith("-") || GAJAE_CLI_ROOTS.has(root)) {
    return { kind: "cli", args };
  }

  return { kind: "prompt", prompt: body };
}
