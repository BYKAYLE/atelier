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

// 0.2.30: top-level provider 5종 전부 교차 오버라이드 허용 (명시적 모델 필수).
// hermes/gajecode 의 하위 backend 는 모델 값에서 유도된다 (계약 경계 주석 참조).
const managed = resolveStageExecution(
  "audit",
  { audit: { provider: "hermes", model: "gpt-5.5" } },
  session,
);
assert.equal(
  validateStageExecution(managed, session, ["gpt-5.5"], "en"),
  null,
  "hermes cross-provider override with an explicit catalog model must validate (0.2.30)",
);
const managedGajae = resolveStageExecution(
  "audit",
  { audit: { provider: "gajecode", model: "claude-sonnet-4-6" } },
  session,
);
assert.equal(
  validateStageExecution(managedGajae, session, ["claude-sonnet-4-6"], "ko"),
  null,
  "gajecode cross-provider override with an explicit catalog model must validate (0.2.30)",
);
const grokCross = resolveStageExecution(
  "execution",
  { execution: { provider: "grok", model: "grok-4.6" } },
  session,
);
assert.equal(
  validateStageExecution(grokCross, session, ["grok-4.6"], "ko"),
  null,
  "grok cross-provider override must validate",
);

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
    workspace.includes("validateStageExecution(stageValidationPlan, stageSessionDefaults, stageCatalog"),
    "stage execution must be validated against the catalog before spawn",
  );
  // 카탈로그 = 런타임 목록 ∪ 정적 정본 카탈로그 + 정본 별칭 해석 (260825 실턴 결함 수리 고정:
  // 런타임 목록이 dated ID 만 담아도 정본 short ID/별칭은 유효해야 한다).
  assert.ok(
    workspace.includes("CLAUDE_MODELS,\n            CODEX_MODELS,\n            OPENROUTER_MODELS,"),
    "the stage catalog must include the static canonical model catalog",
  );
  assert.ok(
    workspace.includes("stageCatalog.includes(aliasResolved)"),
    "canonical aliases must resolve against the catalog before rejecting a stage model",
  );
  // 인용 오탐 방지 (260825 실턴 결함 수리 고정): 보호문구를 인용한 handoff 는
  // 프롬프트 주입 전에 생략된다 — 다음 단계 스폰이 안전 게이트에 오탐 차단되지 않게.
  assert.ok(
    workspace.includes("containsProtectedActionIntent(handoff.summary)"),
    "handoff summaries quoting safety-gate vocabulary must be redacted from the next stage prompt",
  );
  // CLI 표면과 문서.
  assert.ok(cli.includes("--stage-models") && cli.includes("fn parse_stage_models"),
    "the CLI must expose and validate --stage-models");
  assert.ok(docs.includes("--stage-models") && docs.includes("stageReceipts"),
    "docs/atelier-cli.md must document the staged dispatch contract");

  // ── 0.2.30 회귀 게이트 (대표님 실사용 결함 3건) ─────────────────────────
  // ① 교차 provider: 단계 행에 provider 셀렉터가 있고, hermes 오버라이드의
  //    하위 backend 는 단계 모델 값에서 유도되며, 미인증 provider 는 실행
  //    전에 fail-closed 사유를 노출한다.
  assert.ok(
    workspace.includes("stage-provider-menu-") && workspace.includes("updateStageProviderAssignment"),
    "each stage row must expose a provider selector",
  );
  assert.ok(
    workspace.includes("inferHermesProviderFromModel(stagePlan.model)"),
    "a hermes stage override must derive its backend from the stage model",
  );
  assert.ok(
    workspace.includes("stageCapabilityReason") && workspace.includes("stage-model-warning-"),
    "an unauthenticated stage provider must fail closed with a visible reason",
  );
  // ② 초기화 결함 수리 고정 (생존 규칙): 행 모델 옵션은 배정 모델을 selected 로
  //    넘겨 카탈로그 밖 배정도 '현재 선택'으로 표시되고(표시 붕괴 금지),
  //    provider 변경은 그 행의 모델만 지우며, 전체 삭제는 명시적 초기화
  //    버튼(persistStageAssignments({}) 단일 호출부)뿐이다.
  assert.ok(
    /modelOptionsFor\(\s*rowProvider,\s*assignedModel \|\| null,/.test(workspace),
    "stage rows must render off-catalog assignments as '현재 선택' instead of collapsing to inherit",
  );
  assert.ok(
    workspace.includes("const updateStageProviderAssignment"),
    "provider updates must be row-scoped",
  );
  assert.equal(
    workspace.split("persistStageAssignments({})").length - 1,
    1,
    "only the explicit reset button may clear all stage assignments",
  );
  assert.ok(
    workspace.includes('data-testid="stage-model-reset"'),
    "the explicit reset button must exist",
  );
  // ③ OpenRouter 최신화: 만료-예정(미래) 모델을 숨기던 존재-여부 필터 금지.
  const agentModels = readFileSync("src-tauri/src/agent_models.rs", "utf8");
  assert.ok(
    agentModels.includes("fn openrouter_model_expired") && !agentModels.includes('item.get("expiration_date").is_some_and'),
    "OpenRouter models must only be hidden when their expiration date has passed",
  );

  // ── 0.2.31 공급 경로 도달성 (부류 게이트) ────────────────────────────────
  // 단계 provider 셀렉터는 컴포저의 실제 카탈로그(PROVIDERS/HERMES_PROVIDERS)
  // 에서 파생돼야 하며(별도 열거 금지), 단계 receipt 는 managed backend 를
  // 기록해야 한다.
  assert.ok(
    workspace.includes("providers: PROVIDERS.map((provider) => ({ id: provider.id, label: provider.label }))"),
    "stage supply entries must derive from the real composer PROVIDERS catalog",
  );
  assert.ok(
    workspace.includes("hermesBackends: HERMES_PROVIDERS.map((backend) => ({ value: backend.value, label: backend.label }))"),
    "stage supply entries must derive from the real composer HERMES_PROVIDERS catalog",
  );
  assert.ok(
    workspace.includes("...stageSupplyEntries.map((entry) => ({ value: entry.value, label: entry.label }))"),
    "the stage provider selector must render the derived supply entries",
  );
  assert.ok(
    workspace.includes('backend: runProvider === "hermes"'),
    "stage receipts must record the managed backend",
  );
}

// ── 공급 경로 도달성 diff=0 (컴포저 ↔ 단계 셀렉터 전수 대조) ──────────────
{
  const { deriveStageSupplyEntries, stageSupplyCoverageDiff, HERMES_BACKEND_TOP_LEVEL_EQUIVALENTS } =
    await import("../src/lib/stellaStageModels.ts");
  // 컴포저 카탈로그와 동형의 실제 목록 (AgentWorkspace 의 PROVIDERS /
  // HERMES_PROVIDERS 와의 일치는 위 소스 게이트가 고정한다).
  const providers = [
    { id: "claude", label: "Claude Code" },
    { id: "hermes", label: "Hermes" },
    { id: "codex", label: "Codex CLI" },
    { id: "gajecode", label: "가재코드" },
    { id: "grok", label: "Grok Build" },
  ] as const;
  const hermesBackends = [
    { value: "openai-codex", label: "Codex" },
    { value: "anthropic", label: "Claude" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "alibaba", label: "Alibaba Cloud" },
    { value: "grok", label: "Grok" },
  ];
  const entries = deriveStageSupplyEntries({ providers: [...providers], hermesBackends });
  const values = entries.map((entry) => entry.value);
  // 하위 backend 로만 존재하는 공급 경로는 전용 항목으로 노출된다.
  assert.ok(values.includes("hermes:openrouter"), "OpenRouter must be one selection away in the stage selector");
  assert.ok(values.includes("hermes:alibaba"), "Alibaba Cloud must be one selection away in the stage selector");
  // top-level 동급이 있는 backend 는 중복 항목을 만들지 않는다.
  for (const dup of ["hermes:openai-codex", "hermes:anthropic", "hermes:grok"]) {
    assert.ok(!values.includes(dup), `${dup} duplicates a top-level provider and must not appear`);
  }
  assert.deepEqual(Object.keys(HERMES_BACKEND_TOP_LEVEL_EQUIVALENTS).sort(), ["anthropic", "grok", "openai-codex"]);
  // 전수 대조 diff=0.
  assert.deepEqual(
    stageSupplyCoverageDiff({ providers: [...providers], hermesBackends }),
    [],
    "every composer supply path must be reachable from the stage selector (diff=0)",
  );
  // 부류 폐쇄 증명: 미래에 hermes backend 가 추가되면 자동으로 전용 항목이
  // 파생돼 coverage 가 유지된다.
  const futureBackends = [...hermesBackends, { value: "newvendor", label: "New Vendor" }];
  const futureEntries = deriveStageSupplyEntries({ providers: [...providers], hermesBackends: futureBackends });
  assert.ok(futureEntries.some((entry) => entry.value === "hermes:newvendor" && entry.hermesBackend === "newvendor"),
    "a future sub-backend must automatically surface as a stage supply entry");
  assert.deepEqual(stageSupplyCoverageDiff({ providers: [...providers], hermesBackends: futureBackends }), []);
}

// ── backend 영속 필드 (0.2.31 실턴 결함 수리 고정) ─────────────────────────
// OpenRouter 카탈로그의 anthropic/claude-* 모델은 모델 값 유도가 anthropic
// backend 로 오판된다 (receipt 9446a48c 실측). backend 는 배정에 영속되어
// 유도보다 우선해야 한다.
{
  const parsed = parseStageModelAssignments(
    '{"planning":{"provider":"hermes","backend":"openrouter","model":"anthropic/claude-haiku-4.5"}}',
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.assignments.planning?.backend, "openrouter");
  const plan = resolveStageExecution("planning", parsed.assignments, session);
  assert.equal(plan.backend, "openrouter", "the persisted backend must survive resolution");
  assert.equal(
    validateStageExecution(plan, session, ["anthropic/claude-haiku-4.5"], "ko"),
    null,
    "an OpenRouter-catalog anthropic/* model with an explicit backend must validate",
  );
  // backend 는 hermes 단계에만 유효하다.
  const wrongProvider = resolveStageExecution(
    "planning",
    { planning: { provider: "claude", backend: "openrouter", model: "claude-fable-5" } },
    session,
  );
  assert.ok(
    validateStageExecution(wrongProvider, session, ["claude-fable-5"], "ko"),
    "a backend on a non-hermes stage must be rejected",
  );
  // 알 수 없는 backend 는 파싱에서 거부된다.
  const badBackend = parseStageModelAssignments('{"planning":{"provider":"hermes","backend":"acme","model":"x"}}');
  assert.ok(badBackend.errors.length === 1, "an unknown backend must be a parse error");
  // 직렬화 왕복에 backend 가 보존된다.
  const reparsed = parseStageModelAssignments(serializeStageModelAssignments(parsed.assignments));
  assert.equal(reparsed.assignments.planning?.backend, "openrouter");
  // 배선: 셀렉터의 backend 파생 항목 선택이 배정에 backend 를 영속하고,
  // 실행은 영속 backend 를 모델 유도보다 우선한다.
  const { readFileSync } = await import("node:fs");
  const workspace = readFileSync("src/components/AgentWorkspace.tsx", "utf8");
  assert.ok(
    workspace.includes('updateStageProviderAssignment(stage, entry ? entry.provider : "", entry?.hermesBackend)'),
    "picking a backend-derived supply entry must persist the backend into the assignment",
  );
  assert.ok(
    workspace.includes("stagePlan?.backend\n            ? stagePlan.backend"),
    "the run must prefer the persisted stage backend over model inference",
  );
}

console.log("stella stage models smoke passed");
