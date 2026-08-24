import type { AgentPermissionMode, AgentProvider, AtelierControlRequest } from "../../lib/tauri";
import {
  hasStageOverrides,
  parseStageModelAssignments,
  type StageModelAssignments,
} from "../../lib/stellaStageModels.ts";

export interface NormalizedControlTask {
  provider: AgentProvider;
  prompt: string;
  workspace: string;
  model?: string;
  effort?: string;
  permissionMode?: Exclude<AgentPermissionMode, "full">;
  stellaMode: boolean;
  /** Stella Mode 단계별 모델 배정 (CLI `--stage-models`). 오버라이드가 있을 때만 존재. */
  stageModels?: StageModelAssignments;
}

export function isAgentProvider(value: string): value is AgentProvider {
  return value === "claude" || value === "codex" || value === "hermes" || value === "gajecode";
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeRequestedPermission(value: unknown): Exclude<AgentPermissionMode, "full"> | undefined {
  const normalized = optionalString(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "basic" || normalized === "default") return "basic";
  if (normalized === "auto" || normalized === "autoreview" || normalized === "auto-review") return "auto";
  if (normalized === "full" || normalized === "bypass" || normalized === "danger") return "basic";
  throw new Error(`Unsupported permission mode: ${normalized}`);
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
  const stellaMode = request.payload.stellaMode === true;
  let stageModels: StageModelAssignments | undefined;
  if (request.payload.stageModels !== undefined && request.payload.stageModels !== null) {
    // fail-closed: 형식이 틀린 단계 배정은 조용히 버리지 않고 태스크 자체를 거부한다.
    const parsed = parseStageModelAssignments(request.payload.stageModels);
    if (parsed.errors.length > 0) {
      throw new Error(`Invalid stage-models payload: ${parsed.errors.join("; ")}`);
    }
    if (hasStageOverrides(parsed.assignments)) {
      if (!stellaMode) {
        throw new Error("stageModels requires a Stella Mode dispatch (--stella).");
      }
      stageModels = parsed.assignments;
    }
  }
  return {
    provider: providerValue,
    prompt,
    workspace,
    model: optionalString(request.payload.model),
    effort: optionalString(request.payload.effort),
    permissionMode: normalizeRequestedPermission(request.payload.permissionMode),
    stellaMode,
    ...(stageModels ? { stageModels } : {}),
  };
}
