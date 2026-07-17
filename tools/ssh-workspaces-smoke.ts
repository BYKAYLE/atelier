import assert from "node:assert/strict";

import { emptySshProfile, sshProfileDraft, sshTargetLabel } from "../src/components/ssh-workspaces/sshWorkspace.ts";

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

console.log("ssh workspaces smoke passed");
