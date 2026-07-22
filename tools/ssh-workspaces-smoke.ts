import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  emptySshProfile,
  sshProfileDraft,
  sshTargetLabel,
  sshTunnelStateLabel,
  sshTunnelStateTone,
} from "../src/components/ssh-workspaces/sshWorkspace.ts";

assert.deepEqual(emptySshProfile(), {
  name: "",
  host: "",
  port: 22,
  user: "",
  remoteRoot: "/srv",
});

const profile = {
  id: "profile-1",
  name: "Build host",
  host: "build.example.com",
  port: 2222,
  user: "atelier",
  remoteRoot: "/srv/atelier",
  archived: false,
  createdAtUnixMs: 1,
  updatedAtUnixMs: 2,
};

assert.equal(sshTargetLabel(profile), "atelier@build.example.com:2222");
assert.deepEqual(sshProfileDraft(profile), {
  id: "profile-1",
  name: "Build host",
  host: "build.example.com",
  port: 2222,
  user: "atelier",
  remoteRoot: "/srv/atelier",
});

assert.equal(sshTunnelStateLabel("reconnecting", true), "재연결 중");
assert.equal(sshTunnelStateLabel("connected", false), "Connected");
assert.equal(sshTunnelStateTone("failed"), "text-red-500");

const backend = readFileSync("src-tauri/src/ssh_workspaces.rs", "utf8");
const frontend = readFileSync("src/components/ssh-workspaces/RemoteFilesPanel.tsx", "utf8");
const bridge = readFileSync("src/lib/terminalLaunch.ts", "utf8");

for (const command of [
  "ssh_remote_directory_list",
  "ssh_remote_file_read",
  "ssh_remote_file_write_prepare",
  "ssh_remote_file_write_execute",
  "ssh_terminal_launch",
]) {
  assert.match(backend, new RegExp(`pub async fn ${command}\\b`));
}
assert.match(backend, /REMOTE_FILE_MAX_BYTES: usize = 1024 \* 1024/);
assert.match(backend, /Remote file changed after approval/);
assert.match(frontend, /Approve and save/);
assert.match(frontend, /dispatchTerminalLaunch/);
assert.match(bridge, /atelier:terminal-launch/);

console.log("ssh workspaces smoke passed");
