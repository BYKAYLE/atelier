export type DesktopNotificationTaskPhase = "idle" | "running" | "attention" | "done";

export interface DesktopNotificationTask {
  id: string;
  title: string;
  updatedAt: number;
  phase: DesktopNotificationTaskPhase;
}

export interface DesktopNotificationSnapshotItem {
  updatedAt: number;
  phase: DesktopNotificationTaskPhase;
}

export type DesktopNotificationSnapshot = Record<string, DesktopNotificationSnapshotItem>;

export interface DesktopNotificationEvent {
  id: string;
  title: string;
  kind: "attention" | "done";
}

export interface DesktopNotificationContext {
  activeId: string | null;
  workspaceForeground: boolean;
}

export function createDesktopNotificationSnapshot(
  tasks: DesktopNotificationTask[],
): DesktopNotificationSnapshot {
  return Object.fromEntries(tasks.map((task) => [task.id, {
    updatedAt: task.updatedAt,
    phase: task.phase,
  }]));
}

export function collectDesktopNotificationTransitions(
  previous: DesktopNotificationSnapshot,
  tasks: DesktopNotificationTask[],
  context: DesktopNotificationContext,
): { events: DesktopNotificationEvent[]; snapshot: DesktopNotificationSnapshot } {
  const snapshot = createDesktopNotificationSnapshot(tasks);
  const events: DesktopNotificationEvent[] = [];

  for (const task of tasks) {
    const before = previous[task.id];
    if (!before || before.phase === task.phase) continue;
    if (task.phase !== "done" && task.phase !== "attention") continue;
    if (context.workspaceForeground && context.activeId === task.id) continue;
    events.push({ id: task.id, title: task.title, kind: task.phase });
  }

  return { events, snapshot };
}
