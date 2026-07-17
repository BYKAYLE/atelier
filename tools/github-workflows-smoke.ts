import assert from "node:assert/strict";

import {
  emptyGithubActionDraft,
  githubActionInput,
  githubChecksLabel,
  githubIssueSearchText,
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

console.log("github workflows smoke passed");
