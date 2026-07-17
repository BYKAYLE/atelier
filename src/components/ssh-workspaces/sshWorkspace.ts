import type { SshWorkspaceProfile, SshWorkspaceProfileInput } from "../../lib/tauri";

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
