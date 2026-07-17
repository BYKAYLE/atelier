import type {
  GithubActionInput,
  GithubActionKind,
  GithubIssueSummary,
  GithubPullRequestSummary,
} from "../../lib/tauri";

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
