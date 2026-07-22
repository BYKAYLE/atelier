import type { AgentProvider, AtelierControlRequest } from "../../lib/tauri";

export interface NormalizedControlTask {
  provider: AgentProvider;
  prompt: string;
  workspace: string;
  model?: string;
  effort?: string;
  permissionMode?: string;
  stellaMode: boolean;
}

export function isAgentProvider(value: string): value is AgentProvider {
  return value === "claude" || value === "codex" || value === "hermes" || value === "gajecode";
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export function normalizeControlTask(
  request: AtelierControlRequest,
  fallbackWorkspace: string,
): NormalizedControlTask {
  if (request.action !== "task.dispatch") {
    throw new Error(`Expected task.dispatch, received ${request.action}.`);
  }
  const providerValue = optionalString(request.payload.provider)?.toLowerCase() || "";
  if (!isAgentProvider(providerValue)) {
    throw new Error(`Unsupported agent provider: ${providerValue || "(missing)"}`);
  }
  const prompt = optionalString(request.payload.prompt);
  if (!prompt) throw new Error("The task request prompt is empty.");
  const workspace = optionalString(request.workspace) || fallbackWorkspace.trim();
  if (!workspace) throw new Error("The task request workspace is empty.");
  return {
    provider: providerValue,
    prompt,
    workspace,
    model: optionalString(request.payload.model),
    effort: optionalString(request.payload.effort),
    permissionMode: optionalString(request.payload.permissionMode),
    stellaMode: request.payload.stellaMode === true,
  };
}
