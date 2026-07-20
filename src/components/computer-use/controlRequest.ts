import type { AtelierControlRequest, ComputerUseAction, ComputerUseInput } from "../../lib/tauri";
import { computerUsePrepare } from "../../lib/tauri";
import type { FeatureControlRequestResult } from "../../features/featureRegistry";
import { getFeatureSetting } from "../../features/featureSettings";

const ACTIONS = new Set<ComputerUseAction>([
  "atelier.focus",
  "browser.open",
  "preview.open",
  "preview.screenshot",
  "preview.snapshot",
  "preview.click",
  "preview.type",
  "preview.key",
  "preview.resize",
]);

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalizeComputerUseRequest(request: AtelierControlRequest): ComputerUseInput {
  const action = optionalString(request.payload.action) as ComputerUseAction | null;
  if (!action || !ACTIONS.has(action)) {
    throw new Error("The Atelier UI request contains an unsupported action.");
  }
  return {
    action,
    target: optionalString(request.payload.target),
    value: optionalText(request.payload.value),
    host: optionalString(request.payload.host),
    port: optionalInteger(request.payload.port),
    windowLabel: optionalString(request.payload.windowLabel),
    width: optionalInteger(request.payload.width),
    height: optionalInteger(request.payload.height),
  };
}

export async function handleComputerUseControlRequest(
  request: AtelierControlRequest,
): Promise<FeatureControlRequestResult | null> {
  if (request.action !== "computer.use") return null;
  if (!getFeatureSetting("computer-use", "enabled", true)) {
    throw new Error("Computer Use is disabled in Feature settings.");
  }
  const input = normalizeComputerUseRequest(request);
  if (input.action === "browser.open" && !getFeatureSetting("computer-use", "allowExternalBrowser", false)) {
    throw new Error("External HTTPS URLs are disabled in Feature settings.");
  }
  const prepared = await computerUsePrepare(input);
  return {
    summary: `Computer Use action ${prepared.action} is waiting for approval in Atelier.`,
    detail: {
      action: prepared.action,
      actionId: prepared.actionId,
      expiresAtMs: prepared.expiresAtMs,
    },
  };
}
