import assert from "node:assert/strict";

import {
  emptyGithubActionDraft,
  githubActionInput,
  githubChecksLabel,
  githubIssueWorkItem,
  githubIssueSearchText,
  githubPullWorkItem,
  githubPullSearchText,
} from "../src/components/github-workflows/githubWorkflow.ts";

const draft = emptyGithubActionDraft("pr.reviewers", 42);
draft.reviewers = "@alice, bob  @alice";
draft.body = "  review context  ";

assert.deepEqual(githubActionInput(draft), {
  kind: "pr.reviewers",
  number: 42,
  title: undefined,
  body: "review context",
  base: undefined,
  reviewers: ["alice", "bob", "alice"],
  reviewDecision: "comment",
  draft: false,
});

assert.equal(
  githubChecksLabel(
    {
      number: 7,
      title: "Release gate",
      state: "OPEN",
      url: "https://example.invalid/pull/7",
      author: "maintainer",
      headRefName: "feature/release",
      baseRefName: "main",
      isDraft: false,
      reviewDecision: "REVIEW_REQUIRED",
      reviewRequests: ["reviewer"],
      checksTotal: 3,
      checksSuccess: 2,
      checksFailure: 1,
    },
    "ko",
  ),
  "체크 실패 1/3",
);

assert.match(
  githubIssueSearchText({
    number: 11,
    title: "Windows OAuth",
    state: "OPEN",
    url: "https://example.invalid/issues/11",
    author: "owner",
    labels: ["bug", "windows"],
  }),
  /windows oauth.*bug windows/,
);

assert.match(
  githubPullSearchText({
    number: 12,
    title: "SSH workspace",
    state: "OPEN",
    url: "https://example.invalid/pull/12",
    author: "owner",
    headRefName: "feature/ssh",
    baseRefName: "main",
    isDraft: true,
    reviewDecision: null,
    reviewRequests: [],
    checksTotal: 0,
    checksSuccess: 0,
    checksFailure: 0,
  }),
  /feature\/ssh main/,
);

const issueWorkItem = githubIssueWorkItem({
  number: 31,
  title: "Create isolated task",
  state: "OPEN",
  url: "https://github.com/example/repo/issues/31",
  labels: ["enhancement"],
}, "/workspace/repo", "ko");
assert.equal(issueWorkItem.source, "github");
assert.equal(issueWorkItem.kind, "issue");
assert.equal(issueWorkItem.workspace, "/workspace/repo");
assert.match(issueWorkItem.prompt, /격리된 worktree/);

const pullWorkItem = githubPullWorkItem({
  number: 32,
  title: "Fix release gate",
  state: "OPEN",
  url: "https://github.com/example/repo/pull/32",
  headRefName: "fix/release",
  baseRefName: "main",
  isDraft: false,
  reviewers: [],
  checksTotal: 1,
  checksSuccess: 0,
  checksFailure: 1,
}, "/workspace/repo", "en");
assert.equal(pullWorkItem.kind, "pull_request");
assert.match(pullWorkItem.prompt, /check failures/);

console.log("github workflows smoke passed");
