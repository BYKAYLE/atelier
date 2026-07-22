import type { SshTunnelSummary, SshWorkspaceProfile, SshWorkspaceProfileInput } from "../../lib/tauri";

export function emptySshProfile(): SshWorkspaceProfileInput {
  return { name: "", host: "", port: 22, user: "", remoteRoot: "/srv" };
}

export function sshProfileDraft(profile: SshWorkspaceProfile): SshWorkspaceProfileInput {
  return {
    id: profile.id,
    name: profile.name,
    host: profile.host,
    port: profile.port,
    user: profile.user,
    remoteRoot: profile.remoteRoot,
  };
}

export function sshTargetLabel(profile: Pick<SshWorkspaceProfile, "user" | "host" | "port">): string {
  return `${profile.user}@${profile.host}:${profile.port}`;
}

export function sshTunnelStateLabel(state: SshTunnelSummary["state"], ko: boolean): string {
  const labels: Record<SshTunnelSummary["state"], [string, string]> = {
    starting: ["시작 중", "Starting"],
    connected: ["연결됨", "Connected"],
    reconnecting: ["재연결 중", "Reconnecting"],
    failed: ["연결 실패", "Failed"],
  };
  return labels[state][ko ? 0 : 1];
}

export function sshTunnelStateTone(state: SshTunnelSummary["state"]): string {
  if (state === "connected") return "text-emerald-600";
  if (state === "failed") return "text-red-500";
  return "text-amber-600";
}
