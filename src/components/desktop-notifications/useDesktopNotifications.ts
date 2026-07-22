import { useCallback, useEffect, useRef, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { safeLocalStorageGet, safeLocalStorageSet } from "../../lib/storage";
import { isTauri } from "../../lib/tauri";
import {
  collectDesktopNotificationTransitions,
  createDesktopNotificationSnapshot,
} from "./desktopNotificationState";
import type {
  DesktopNotificationSnapshot,
  DesktopNotificationTask,
} from "./desktopNotificationState";

const DESKTOP_NOTIFICATION_ENABLED_KEY = "atelier.desktopNotifications.enabled.v1";

export type DesktopNotificationPermission = "unknown" | "checking" | "granted" | "denied" | "unsupported";

function persistEnabled(enabled: boolean) {
  safeLocalStorageSet(DESKTOP_NOTIFICATION_ENABLED_KEY, enabled ? "1" : "0");
}

export function useDesktopNotifications(
  tasks: DesktopNotificationTask[],
  activeId: string | null,
  language: "ko" | "en",
) {
  const [enabled, setEnabled] = useState(
    () => safeLocalStorageGet(DESKTOP_NOTIFICATION_ENABLED_KEY) === "1",
  );
  const [permission, setPermission] = useState<DesktopNotificationPermission>(
    () => isTauri() ? "unknown" : "unsupported",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const snapshotRef = useRef<DesktopNotificationSnapshot | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      setPermission("unsupported");
      return;
    }
    if (!enabled) return;

    let cancelled = false;
    setPermission("checking");
    isPermissionGranted()
      .then((granted) => {
        if (cancelled) return;
        if (granted) {
          setPermission("granted");
          return;
        }
        setEnabled(false);
        persistEnabled(false);
        setPermission("denied");
      })
      .catch((cause) => {
        if (cancelled) return;
        setEnabled(false);
        persistEnabled(false);
        setPermission("denied");
        setError(String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (snapshotRef.current === null) {
      snapshotRef.current = createDesktopNotificationSnapshot(tasks);
      return;
    }

    const result = collectDesktopNotificationTransitions(snapshotRef.current, tasks, {
      activeId,
      workspaceForeground: document.visibilityState === "visible" && document.hasFocus(),
    });
    snapshotRef.current = result.snapshot;
    if (!enabled || permission !== "granted" || !isTauri()) return;

    for (const event of result.events) {
      const body = event.kind === "done"
        ? language === "en" ? "Task completed" : "작업이 완료되었습니다"
        : language === "en" ? "This task needs your attention" : "확인이 필요한 작업입니다";
      try {
        sendNotification({
          title: `Atelier · ${event.title}`,
          body,
          group: "atelier-tasks",
        });
      } catch (cause) {
        setError(String(cause));
      }
    }
  }, [activeId, enabled, language, permission, tasks]);

  const toggle = useCallback(async () => {
    if (busy || !isTauri()) return;
    setError("");
    if (enabled) {
      setEnabled(false);
      persistEnabled(false);
      return;
    }

    setBusy(true);
    setPermission("checking");
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === "granted";
      }
      setPermission(granted ? "granted" : "denied");
      setEnabled(granted);
      persistEnabled(granted);
    } catch (cause) {
      setPermission("denied");
      setEnabled(false);
      persistEnabled(false);
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, enabled]);

  return { enabled, permission, busy, error, toggle };
}
