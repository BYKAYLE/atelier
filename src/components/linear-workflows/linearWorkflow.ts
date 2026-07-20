import type {
  LinearActionInput,
  LinearActionKind,
  LinearIssueSummary,
  LinearTeamSummary,
  LinearWorkflowSnapshot,
  LinearWorkflowStateSummary,
} from "../../lib/tauri";
import type { SourceControlWorkItem } from "../../features/featureRegistry";

export interface LinearActionDraft {
  kind: LinearActionKind;
  teamId: string;
  issueId: string;
  stateId: string;
  title: string;
  body: string;
}

export function emptyLinearActionDraft(
  kind: LinearActionKind,
  issue?: LinearIssueSummary,
  team?: LinearTeamSummary,
): LinearActionDraft {
  return {
    kind,
    teamId: team?.id || issue?.team?.id || "",
    issueId: issue?.id || "",
    stateId: issue?.state?.id || "",
    title: "",
    body: "",
  };
}

export function linearActionInput(draft: LinearActionDraft): LinearActionInput {
  return {
    kind: draft.kind,
    teamId: draft.teamId.trim() || null,
    issueId: draft.issueId.trim() || null,
    stateId: draft.stateId.trim() || null,
    title: draft.title.trim() || null,
    body: draft.body.trim() || null,
  };
}

export function teamForDraft(
  snapshot: LinearWorkflowSnapshot,
  draft: LinearActionDraft,
): LinearTeamSummary | undefined {
  const issue = snapshot.issues.find((candidate) => candidate.id === draft.issueId);
  const teamId = draft.teamId || issue?.team?.id;
  return snapshot.teams.find((team) => team.id === teamId);
}

export function statesForDraft(
  snapshot: LinearWorkflowSnapshot,
  draft: LinearActionDraft,
): LinearWorkflowStateSummary[] {
  return [...(teamForDraft(snapshot, draft)?.states || [])]
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
}

export function searchLinearIssues(
  issues: LinearIssueSummary[],
  query: string,
): LinearIssueSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return issues;
  return issues.filter((issue) =>
    `${issue.identifier} ${issue.title} ${issue.state?.name || ""} ${issue.team?.name || ""}`
      .toLocaleLowerCase()
      .includes(needle),
  );
}

export function linearIssueWorkItem(
  issue: LinearIssueSummary,
  workspace: string,
  language: "ko" | "en",
): SourceControlWorkItem {
  return {
    source: "linear",
    kind: "issue",
    externalId: issue.identifier,
    title: issue.title,
    url: issue.url,
    workspace,
    prompt: language === "ko"
      ? `Linear 이슈 ${issue.identifier} \"${issue.title}\"를 분석하고 격리된 worktree에서 구현, 테스트, 검증까지 완료하세요. 원문: ${issue.url}`
      : `Analyze Linear issue ${issue.identifier} \"${issue.title}\" and complete the implementation, tests, and verification in an isolated worktree. Source: ${issue.url}`,
  };
}
