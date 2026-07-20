export const TERMINAL_LAUNCH_EVENT = "atelier:terminal-launch";

export interface TerminalLaunchRequest {
  command: string;
  label: string;
}

export function dispatchTerminalLaunch(request: TerminalLaunchRequest): void {
  window.dispatchEvent(new CustomEvent<TerminalLaunchRequest>(TERMINAL_LAUNCH_EVENT, {
    detail: request,
  }));
}

export function terminalLaunchRequest(event: Event): TerminalLaunchRequest | null {
  const detail = (event as CustomEvent<Partial<TerminalLaunchRequest>>).detail;
  const command = detail?.command?.trim();
  const label = detail?.label?.trim();
  if (!command || !label) return null;
  return { command, label };
}
