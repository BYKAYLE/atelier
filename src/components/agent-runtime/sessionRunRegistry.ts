export type SessionRunRegistry = Record<string, string>;

export type TurnTerminationIntent = "interrupted" | "stopped";

export type TurnTerminationRegistry = Record<string, TurnTerminationIntent>;

export function beginSessionRun(
  registry: SessionRunRegistry,
  sessionId: string,
  turnId: string,
): { accepted: boolean; registry: SessionRunRegistry } {
  if (!sessionId || !turnId || registry[sessionId]) {
    return { accepted: false, registry };
  }
  return {
    accepted: true,
    registry: { ...registry, [sessionId]: turnId },
  };
}

export function finishSessionRun(
  registry: SessionRunRegistry,
  sessionId: string,
  turnId: string,
): { cleared: boolean; registry: SessionRunRegistry } {
  if (!sessionId || !turnId || registry[sessionId] !== turnId) {
    return { cleared: false, registry };
  }
  const next = { ...registry };
  delete next[sessionId];
  return { cleared: true, registry: next };
}

export function markTurnTermination(
  registry: TurnTerminationRegistry,
  turnId: string,
  intent: TurnTerminationIntent,
): TurnTerminationRegistry {
  if (!turnId) return registry;
  const current = registry[turnId];
  if (current === "stopped" || current === intent) return registry;
  return { ...registry, [turnId]: intent };
}

export function clearTurnTermination(
  registry: TurnTerminationRegistry,
  turnId: string,
): TurnTerminationRegistry {
  if (!turnId || !(turnId in registry)) return registry;
  const next = { ...registry };
  delete next[turnId];
  return next;
}
