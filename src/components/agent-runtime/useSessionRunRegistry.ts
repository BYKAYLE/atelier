import { useCallback, useRef, useState } from "react";
import {
  beginSessionRun,
  clearTurnTermination,
  finishSessionRun,
  markTurnTermination,
  type SessionRunRegistry,
  type TurnTerminationIntent,
  type TurnTerminationRegistry,
} from "./sessionRunRegistry";

export function useSessionRunRegistry() {
  const [busyTurnIdsBySession, setBusyTurnIdsBySession] = useState<SessionRunRegistry>({});
  const [stoppingTurnId, setStoppingTurnId] = useState<string | null>(null);
  const busyTurnIdsRef = useRef<SessionRunRegistry>({});
  const turnTerminationRef = useRef<TurnTerminationRegistry>({});

  const publishBusyRegistry = useCallback((next: SessionRunRegistry) => {
    busyTurnIdsRef.current = next;
    setBusyTurnIdsBySession(next);
  }, []);

  const beginRunForSession = useCallback((sessionId: string, turnId: string) => {
    const result = beginSessionRun(busyTurnIdsRef.current, sessionId, turnId);
    if (result.accepted) publishBusyRegistry(result.registry);
    return result.accepted;
  }, [publishBusyRegistry]);

  const finishRunForSession = useCallback((sessionId: string, turnId: string) => {
    const result = finishSessionRun(busyTurnIdsRef.current, sessionId, turnId);
    if (result.cleared) publishBusyRegistry(result.registry);
    setStoppingTurnId((current) => current === turnId ? null : current);
    return result.cleared;
  }, [publishBusyRegistry]);

  const markTurnIntent = useCallback((turnId: string, intent: TurnTerminationIntent) => {
    turnTerminationRef.current = markTurnTermination(turnTerminationRef.current, turnId, intent);
  }, []);

  const markTurnInterrupted = useCallback((turnId: string) => {
    markTurnIntent(turnId, "interrupted");
  }, [markTurnIntent]);

  const markTurnStopped = useCallback((turnId: string) => {
    markTurnIntent(turnId, "stopped");
  }, [markTurnIntent]);

  const markStoppingTurn = useCallback((turnId: string) => {
    markTurnStopped(turnId);
    setStoppingTurnId(turnId);
  }, [markTurnStopped]);

  const clearStoppingTurn = useCallback((turnId: string) => {
    setStoppingTurnId((current) => current === turnId ? null : current);
  }, []);

  const turnTerminationIntent = useCallback((turnId: string) =>
    turnTerminationRef.current[turnId] || null, []);

  const clearTurnIntent = useCallback((turnId: string) => {
    turnTerminationRef.current = clearTurnTermination(turnTerminationRef.current, turnId);
  }, []);

  return {
    busyTurnIdsBySession,
    busyTurnIdsRef,
    stoppingTurnId,
    beginRunForSession,
    finishRunForSession,
    markTurnInterrupted,
    markTurnStopped,
    markStoppingTurn,
    clearStoppingTurn,
    turnTerminationIntent,
    clearTurnIntent,
  };
}
