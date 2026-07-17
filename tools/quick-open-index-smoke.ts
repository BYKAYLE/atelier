import assert from "node:assert/strict";

import {
  buildQuickOpenResults,
  quickOpenMatchScore,
  sameQuickOpenPath,
} from "../src/components/quick-open-index/quickOpenIndex.ts";
import type { AgentQuickOpenIndexEntry, FsEntry } from "../src/lib/tauri.ts";

interface SessionFixture {
  id: string;
}

const files: FsEntry[] = [
  { name: "refreshIndex.ts", path: "/repo/src/refreshIndex.ts", is_dir: false, size: 120 },
];
const indexEntries: AgentQuickOpenIndexEntry[] = [
  {
    kind: "symbol",
    key: "symbol:src/index.ts:14:refreshIndex",
    label: "refreshIndex",
    detail: "function · src/index.ts:14",
    path: "/repo/src/index.ts",
    line: 14,
    branch: null,
    current: false,
  },
  {
    kind: "branch",
    key: "branch:refresh-index",
    label: "refresh-index",
    detail: "current branch",
    path: "/repo",
    line: null,
    branch: "refresh-index",
    current: true,
  },
];

const results = buildQuickOpenResults<SessionFixture>({
  query: "refreshIndex",
  commands: [{ command: "code", label: "Code", detail: "Open editor" }],
  files,
  indexedEntries: indexEntries,
  sessions: [{
    session: { id: "session-1" },
    key: "session:session-1",
    label: "Refresh workspace",
    detail: "/repo",
    trailing: "Codex",
    searchable: ["refresh-index"],
    updatedAt: 1,
  }],
});

assert.equal(results[0]?.kind, "index", "exact symbol match should rank above a file prefix match");
assert.equal(results[0]?.kind === "index" ? results[0].entry.line : null, 14);
assert.ok(results.some((item) => item.kind === "file"), "file results must remain available");

const emptyQueryResults = buildQuickOpenResults<SessionFixture>({
  query: "",
  commands: [{ command: "new-task", label: "New task", detail: "Start task" }],
  files: [],
  indexedEntries: [],
  sessions: [{
    session: { id: "session-1" },
    key: "session:session-1",
    label: "Recent task",
    detail: "/repo",
    trailing: "Codex",
    searchable: [],
    updatedAt: 1,
  }],
});
assert.equal(emptyQueryResults[0]?.kind, "command", "commands should remain first when the query is empty");

assert.ok((quickOpenMatchScore("index", ["index"]) || 0) > (quickOpenMatchScore("index", ["workspace index"]) || 0));
assert.equal(quickOpenMatchScore("missing", ["refreshIndex"]), null);
assert.equal(sameQuickOpenPath("C:\\repo\\task\\", "C:/repo/task"), true);
assert.equal(sameQuickOpenPath("/repo/a", "/repo/b"), false);

console.log("PASS quick-open result scoring and category merge");
console.log("PASS symbol target line preservation");
console.log("PASS cross-platform worktree path comparison");
