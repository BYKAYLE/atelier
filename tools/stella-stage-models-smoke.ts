import assert from "node:assert/strict";

import {
  STELLA_STAGES,
  advanceStageRunState,
  buildStageHandoff,
  buildStageReceipt,
  buildStageTurnPrompt,
  createStageRunState,
  hasStageOverrides,
  isTerminalStage,
  normalizeStageRunState,
  parseStageModelAssignments,
  resolveStageExecution,
  serializeStageModelAssignments,
  validateStageExecution,
  type StageModelAssignments,
  type StageSessionDefaults,
} from "../src/lib/stellaStageModels.ts";

const session: StageSessionDefaults = {
  provider: "claude",
  model: "claude-fable-5",
  effort: "medium",
};

// 1) 오버라이드 0개 = 세션 파라미터와 정확히 동일 (기존 단일 실행 경로 동등성).
//    resolve 결과가 세션 값과 1바이트도 다르지 않아야 staged 경로와 무관하게
//    기존 agent_send 인자가 유지된다. 아울러 hasStageOverrides=false 이므로
//    호출부는 staged 경로 자체에 진입하지 않는다.
for (const emptyAssignments of [{}, { planning: {} }, parseStageModelAssignments(null).assignments] as StageModelAssignments[]) {
  assert.equal(hasStageOverrides(emptyAssignments), false, "no override must not trigger the staged path");
  for (const stage of STELLA_STAGES) {
    const plan = resolveStageExecution(stage, emptyAssignments, session);
    assert.deepEqual(
      { provider: plan.provider, model: plan.model, effort: plan.effort },
      { provider: session.provider, model: session.model, effort: session.effort },
      `stage ${stage} must inherit the session execution parameters byte-identically`,
    );
    assert.equal(plan.providerOverridden || plan.modelOverridden || plan.effortOverridden, false);
    assert.equal(
      validateStageExecution(plan, session, [session.model], "ko"),
      null,
      "inherited execution must always validate",
    );
  }
}

// 2) 단계별 오버라이드 해석.
const overrides: StageModelAssignments = {
  planning: { model: "claude-opus-4-8" },
  execution: { model: "claude-haiku-4-5-20251001", effort: "low" },
  verification: { provider: "codex", model: "gpt-5.5", effort: "high" },
};
assert.equal(hasStageOverrides(overrides), true);
const planning = resolveStageExecution("planning", overrides, session);
assert.equal(planning.model, "claude-opus-4-8");
assert.equal(planning.provider, "claude");
assert.equal(planning.effort, "medium");
assert.equal(planning.modelOverridden, true);
const verification = resolveStageExecution("verification", overrides, session);
assert.equal(verification.provider, "codex");
assert.equal(verification.providerOverridden, true);
const security = resolveStageExecution("security", overrides, session);
assert.equal(security.model, session.model, "unassigned stages keep inheriting the session model");

// 3) fail-closed 검증: 카탈로그에 없는 모델은 사유와 함께 거부된다.
const bogus = resolveStageExecution(
  "execution",
  { execution: { model: "claude-nonexistent-9" } },
  session,
);
const bogusError = validateStageExecution(bogus, session, ["claude-fable-5", "claude-opus-4-8"], "ko");
assert.ok(bogusError && bogusError.includes("claude-nonexistent-9"), "unknown model must be rejected with the model name");
assert.ok(bogusError && bogusError.includes("중단"), "rejection must state that the stage stops");

// provider 오버라이드에 모델 누락 → 거부.
const noModel = resolveStageExecution("audit", { audit: { provider: "codex" } }, session);
assert.ok(validateStageExecution(noModel, session, ["gpt-5.5"], "ko"), "provider override without model must be rejected");

// managed 교차 provider 오버라이드 → 거부.
const managed = resolveStageExecution(
  "audit",
  { audit: { provider: "hermes", model: "gpt-5.5" } },
  session,
);
assert.ok(validateStageExecution(managed, session, ["gpt-5.5"], "en"), "hermes cross-provider override must be rejected in v1");

// 잘못된 effort → 거부.
const badEffort = resolveStageExecution("planning", { planning: { effort: "hyper" } }, session);
assert.ok(validateStageExecution(badEffort, session, [session.model], "ko"), "unknown effort must be rejected");

// 4) 신뢰 불가 입력 파싱 (CLI/localStorage).
const parsedOk = parseStageModelAssignments(
  '{"planning":{"model":"claude-opus-4-8"},"execution":{"model":"claude-haiku-4-5-20251001","effort":"LOW"}}',
);
assert.deepEqual(parsedOk.errors, []);
assert.equal(parsedOk.assignments.execution?.effort, "low", "effort must be lowercased");
const parsedUnknownStage = parseStageModelAssignments('{"deploy":{"model":"x"}}');
assert.ok(parsedUnknownStage.errors.length === 1 && parsedUnknownStage.errors[0].includes("deploy"));
const parsedBadJson = parseStageModelAssignments("{nope");
assert.ok(parsedBadJson.errors.length === 1);
const parsedArray = parseStageModelAssignments("[1,2]");
assert.ok(parsedArray.errors.length === 1);
const parsedBadProvider = parseStageModelAssignments('{"planning":{"provider":"openai"}}');
assert.ok(parsedBadProvider.errors.length === 1, "unknown provider must be a parse error, not silently dropped");

// 5) 단계 상태 전이 + handoff 조립.
let state = createStageRunState({ runId: "run-1", assignments: overrides, baseText: "목표: X" });
assert.equal(state.stage, "planning");
assert.equal(isTerminalStage(state), false);
const prompt1 = buildStageTurnPrompt({
  stage: state.stage,
  stageIndex: state.stageIndex,
  baseText: state.baseText,
  handoffs: state.handoffs,
  language: "ko",
});
assert.ok(prompt1.includes("1/5"), "stage position must be stated");
assert.ok(prompt1.includes("목표: X"), "base objective must be embedded");
assert.ok(prompt1.includes("STAGE HANDOFF"), "handoff request must be stated");
assert.ok(!prompt1.includes("handoff 1/"), "planning stage has no incoming handoff");

const handoff = buildStageHandoff({
  stage: "planning",
  provider: "claude",
  model: "claude-opus-4-8",
  resultText: "계획: A→B→C",
});
const receipt = buildStageReceipt({
  stage: "planning",
  provider: "claude",
  model: "claude-opus-4-8",
  effort: "medium",
  status: "done",
  durationMs: 1234,
  resultText: "계획: A→B→C",
});
const next = advanceStageRunState(state, { handoff, receipt });
assert.ok(next && next.stage === "execution" && next.stageIndex === 1);
assert.equal(next!.handoffs.length, 1);
assert.equal(next!.receipts[0].model, "claude-opus-4-8", "receipt must carry the stage model name");
const prompt2 = buildStageTurnPrompt({
  stage: next!.stage,
  stageIndex: next!.stageIndex,
  baseText: next!.baseText,
  handoffs: next!.handoffs,
  language: "ko",
});
assert.ok(prompt2.includes("model=claude-opus-4-8"), "handoff must state the producing model");
assert.ok(prompt2.includes("계획: A→B→C"), "handoff summary must be injected into the next stage prompt");

// 마지막 단계 이후에는 전진하지 않는다.
let terminal = state;
for (let index = 0; index < STELLA_STAGES.length - 1; index += 1) {
  const advanced = advanceStageRunState(terminal, { handoff, receipt });
  assert.ok(advanced, `stage ${index} must advance`);
  terminal = advanced!;
}
assert.equal(isTerminalStage(terminal), true);
assert.equal(advanceStageRunState(terminal, { handoff, receipt }), null);

// 6) 직렬화/복원 왕복.
const serialized = serializeStageModelAssignments(overrides);
const roundTrip = parseStageModelAssignments(serialized);
assert.deepEqual(roundTrip.errors, []);
assert.deepEqual(roundTrip.assignments, overrides);

const restored = normalizeStageRunState(JSON.parse(JSON.stringify(next)));
assert.ok(restored && restored.stage === "execution" && restored.handoffs.length === 1);
assert.equal(normalizeStageRunState({ runId: "x", stage: "execution", stageIndex: 0, baseText: "y" }), null,
  "stage/index mismatch must be rejected on restore");
assert.equal(normalizeStageRunState(null), null);

// 7) AgentWorkspace 배선 불변식 (소스 고정): 제로 회귀 경로와 fail-closed 배선.
{
  const { readFileSync } = await import("node:fs");
  const workspace = readFileSync("src/components/AgentWorkspace.tsx", "utf8");
  const cli = readFileSync("src-tauri/src/atelier_cli.rs", "utf8");
  const docs = readFileSync("docs/atelier-cli.md", "utf8");
  // 오버라이드 0개면 staged payload 자체가 만들어지지 않는다 (기존 단일 경로 그대로).
  assert.ok(
    workspace.includes("hasStageOverrides(stagedAssignmentsSnapshot)"),
    "the staged path must be gated on hasStageOverrides for composer runs",
  );
  assert.ok(
    workspace.includes("hasStageOverrides(controlTask.stageModels)"),
    "the staged path must be gated on hasStageOverrides for CLI control runs",
  );
  // 단계 턴은 provider 대화 승계 금지 — 컨텍스트는 handoff 로만.
  assert.ok(
    workspace.includes("const resumeSessionId = stageRun\n      ? null"),
    "stage turns must never resume a provider conversation",
  );
  // 단계 오버라이드가 세션 선택 모델을 덮어쓰면 안 된다.
  assert.ok(
    workspace.includes("model: stageRun ? s.model : runModel"),
    "stage overrides must not overwrite the session model",
  );
  // fail-closed: 검증 실패 시 coerce 폴백 없이 해당 단계에서 중단.
  assert.ok(
    workspace.includes("validateStageExecution(stagePlan, stageSessionDefaults, stageCatalog"),
    "stage execution must be validated against the live catalog before spawn",
  );
  // CLI 표면과 문서.
  assert.ok(cli.includes("--stage-models") && cli.includes("fn parse_stage_models"),
    "the CLI must expose and validate --stage-models");
  assert.ok(docs.includes("--stage-models") && docs.includes("stageReceipts"),
    "docs/atelier-cli.md must document the staged dispatch contract");
}

console.log("stella stage models smoke passed");
