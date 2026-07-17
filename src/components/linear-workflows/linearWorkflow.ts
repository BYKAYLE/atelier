import type {
  LinearActionInput,
  LinearActionKind,
  LinearIssueSummary,
  LinearTeamSummary,
  LinearWorkflowSnapshot,
  LinearWorkflowStateSummary,
} from "../../lib/tauri";

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
