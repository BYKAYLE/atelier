import type {
  GithubActionInput,
  GithubActionKind,
  GithubIssueSummary,
  GithubPullRequestSummary,
} from "../../lib/tauri";
import type { SourceControlWorkItem } from "../../features/featureRegistry";

export interface GithubActionDraft {
  kind: GithubActionKind;
  number: string;
  title: string;
  body: string;
  base: string;
  reviewers: string;
  reviewDecision: "comment" | "approve" | "request_changes";
  draft: boolean;
}

export function emptyGithubActionDraft(kind: GithubActionKind, number?: number): GithubActionDraft {
  return {
    kind,
    number: number ? String(number) : "",
    title: "",
    body: "",
    base: "",
    reviewers: "",
    reviewDecision: "comment",
    draft: false,
  };
}

export function githubActionInput(draft: GithubActionDraft): GithubActionInput {
  const number = Number.parseInt(draft.number, 10);
  return {
    kind: draft.kind,
    number: Number.isFinite(number) && number > 0 ? number : undefined,
    title: draft.title.trim() || undefined,
    body: draft.body.trim() || undefined,
    base: draft.base.trim() || undefined,
    reviewers: draft.reviewers
      .split(/[\s,]+/)
      .map((reviewer) => reviewer.trim().replace(/^@/, ""))
      .filter(Boolean),
    reviewDecision: draft.reviewDecision,
    draft: draft.draft,
  };
}

export function githubChecksLabel(pull: GithubPullRequestSummary, language: "ko" | "en") {
  if (!pull.checksTotal) return language === "ko" ? "체크 없음" : "No checks";
  if (pull.checksFailure) {
    return language === "ko"
      ? `체크 실패 ${pull.checksFailure}/${pull.checksTotal}`
      : `${pull.checksFailure}/${pull.checksTotal} checks failed`;
  }
  if (pull.checksSuccess === pull.checksTotal) {
    return language === "ko"
      ? `체크 통과 ${pull.checksSuccess}/${pull.checksTotal}`
      : `${pull.checksSuccess}/${pull.checksTotal} checks passed`;
  }
  return language === "ko"
    ? `체크 진행 ${pull.checksSuccess}/${pull.checksTotal}`
    : `${pull.checksSuccess}/${pull.checksTotal} checks passed`;
}

export function githubIssueSearchText(issue: GithubIssueSummary) {
  return `${issue.number} ${issue.title} ${issue.state} ${issue.author || ""} ${issue.labels.join(" ")}`.toLowerCase();
}

export function githubPullSearchText(pull: GithubPullRequestSummary) {
  return `${pull.number} ${pull.title} ${pull.state} ${pull.author || ""} ${pull.headRefName} ${pull.baseRefName}`.toLowerCase();
}

export function githubIssueWorkItem(
  issue: GithubIssueSummary,
  workspace: string,
  language: "ko" | "en",
): SourceControlWorkItem {
  return {
    source: "github",
    kind: "issue",
    externalId: `#${issue.number}`,
    title: issue.title,
    url: issue.url,
    workspace,
    prompt: language === "ko"
      ? `GitHub 이슈 #${issue.number} \"${issue.title}\"를 분석하고 격리된 worktree에서 구현, 테스트, 검증까지 완료하세요. 원문: ${issue.url}`
      : `Analyze GitHub issue #${issue.number} \"${issue.title}\" and complete the implementation, tests, and verification in an isolated worktree. Source: ${issue.url}`,
  };
}

export function githubPullWorkItem(
  pull: GithubPullRequestSummary,
  workspace: string,
  language: "ko" | "en",
): SourceControlWorkItem {
  return {
    source: "github",
    kind: "pull_request",
    externalId: `#${pull.number}`,
    title: pull.title,
    url: pull.url,
    workspace,
    prompt: language === "ko"
      ? `GitHub PR #${pull.number} \"${pull.title}\"를 격리된 worktree에서 검토하세요. 체크 실패와 코드 문제를 재현하고 필요한 수정, 테스트, 최종 검증까지 진행하세요. 원문: ${pull.url}`
      : `Review GitHub PR #${pull.number} \"${pull.title}\" in an isolated worktree. Reproduce check failures and code issues, then complete the required fixes, tests, and final verification. Source: ${pull.url}`,
  };
}
