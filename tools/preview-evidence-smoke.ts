import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTaskPreviewEvidence,
  classifyAgentToolEvent,
  classifyRuntimeStdoutLine,
  createTurnPreviewImpact,
  isRuntimeStdoutEcho,
  laneEvidenceChannel,
  noteTurnPreviewImpactEvent,
  previewDiagnosticsMatchPreview,
  redactPreviewEvidenceText,
  sanitizePreviewEvidenceUrl,
  turnAffectedPreview,
  turnNeedsWorkspaceMutationProbe,
  workspaceMutationFromChangeSummary,
} from "../src/lib/previewEvidence.ts";

assert.equal(
  sanitizePreviewEvidenceUrl("http://user:pass@localhost:5173/admin?token=secret#panel"),
  "http://localhost:5173/admin",
);
assert.equal(
  previewDiagnosticsMatchPreview(
    { pageUrl: "http://127.0.0.1:5173/other?secret=value" },
    "http://localhost:5173/admin",
  ),
  false,
);
assert.equal(
  previewDiagnosticsMatchPreview(
    { pageUrl: "http://127.0.0.1:5173/admin/runtime?secret=value" },
    "http://localhost:5173/admin/",
  ),
  true,
);
assert.equal(
  previewDiagnosticsMatchPreview(
    { pageUrl: "http://127.0.0.1:5173/admin/runtime" },
    "http://localhost:5173/",
  ),
  true,
);
assert.equal(
  previewDiagnosticsMatchPreview(
    { pageUrl: "http://localhost:4173/" },
    "http://localhost:5173/admin",
  ),
  false,
);
assert.match(redactPreviewEvidenceText("Authorization: Bearer abcdefghijklmnop"), /\[redacted\]/);
assert.match(redactPreviewEvidenceText("api_key=sk-proj-1234567890abcdef"), /\[redacted\]/);
assert.match(redactPreviewEvidenceText('{"password":"private-value"}'), /\[redacted\]/);
assert.equal(
  redactPreviewEvidenceText("password authentication failed for user admin"),
  "password authentication failed for user admin",
  "ordinary diagnostics must remain readable when they do not contain an assignment",
);

const evidence = buildTaskPreviewEvidence({
  previewUrl: "http://localhost:5173/admin?api_key=private#debug",
  health: {
    url: "http://localhost:5173/admin?api_key=private#debug",
    ok: true,
    status: 200,
    title: "Admin",
    body_text: "ready token=private-token-value",
    checked_at: 1234,
  },
  service: {
    managed: true,
    running: true,
    pid: 42,
    restarts: 1,
    recent_output: [
      "listening on 5173",
      "Authorization: Bearer abcdefghijklmnop",
    ],
  },
  diagnostics: {
    pageUrl: "http://127.0.0.1:5173/admin",
    armedAt: 1200,
    consoleEntries: [
      { level: "warn", text: "deprecated API" },
      { level: "error", text: "request failed api_key=private-value" },
    ],
    runtimeErrors: ["Uncaught Error: password authentication failed"],
    networkEntries: [
      {
        url: "http://localhost:5173/api/health?access_token=private#response",
        initiatorType: "fetch",
        status: 500,
        durationMs: 10.4,
      },
    ],
    networkFailures: ["GET /api/private?token=value failed"],
  },
  screenshotCaptured: true,
});

assert.equal(evidence.url, "http://localhost:5173/admin");
assert.equal(evidence.ok, true);
assert.equal(evidence.networkMethod, "GET");
assert.equal(evidence.serviceRunning, true);
assert.equal(evidence.browserErrorCount, 2);
assert.equal(evidence.browserWarningCount, 1);
assert.equal(evidence.networkFailureCount, 2);
assert.equal(evidence.screenshotCaptured, true);
assert.ok(evidence.bodyText?.includes("[redacted]"));
assert.ok(evidence.serviceOutput?.every((line) => !line.includes("abcdefghijklmnop")));
assert.ok(evidence.consoleEvidence?.every((line) => !line.includes("private-value")));
assert.ok(evidence.networkEvidence?.every((line) => !line.includes("access_token")));
assert.ok(evidence.networkEvidence?.every((line) => !line.includes("token=value")));

const bounded = buildTaskPreviewEvidence({
  previewUrl: "http://localhost:3000",
  health: {
    url: "http://localhost:3000",
    ok: false,
    body_text: "x".repeat(8_000),
    error: "y".repeat(3_000),
    checked_at: 99,
  },
  service: {
    managed: true,
    running: false,
    restarts: 0,
    recent_output: Array.from({ length: 30 }, (_, index) => `line ${index}`),
  },
});
assert.ok((bounded.bodyText?.length || 0) < 4_100);
assert.ok((bounded.error?.length || 0) < 1_300);
assert.equal(bounded.serviceOutput?.length, 12);

// ── 프리뷰 검증 카드 노출 게이트 ───────────────────────────────────────
// 회귀 기준: 프리뷰 URL이 잡힌 세션이라도 무영향 턴에는 카드가 붙으면 안 되고,
// 파일을 건드린 턴에는 반드시 붙어야 한다(과잉 억제도 결함).
assert.equal(classifyAgentToolEvent({ status: "tool_use", text: "Read" }), "read-only");
assert.equal(classifyAgentToolEvent({ status: "tool_use", text: "Grep" }), "read-only");
assert.equal(classifyAgentToolEvent({ status: "thinking", text: "thinking" }), "read-only");
assert.equal(classifyAgentToolEvent({ status: "item.completed", text: "reasoning" }), "read-only");
assert.equal(classifyAgentToolEvent({ status: "hermes.tool", text: "┊ 📚 skill stella ┊" }), "read-only");
assert.equal(classifyAgentToolEvent({ status: "tool_use", text: "Edit" }), "workspace");
assert.equal(classifyAgentToolEvent({ status: "tool_use", text: "Bash" }), "workspace");
assert.equal(classifyAgentToolEvent({ status: "item.completed", text: "file_change" }), "workspace");
assert.equal(
  classifyAgentToolEvent({ status: "item.completed", text: "command_execution" }),
  "workspace",
);
assert.equal(classifyAgentToolEvent({ status: "hermes.diff", text: "diff --git a/x b/x" }), "workspace");
assert.equal(
  classifyAgentToolEvent({ status: "hermes.replacement_block", text: "repls={" }),
  "workspace",
);
assert.equal(classifyAgentToolEvent({ status: "hermes.tool", text: "$ npm run build" }), "workspace");
assert.equal(classifyAgentToolEvent({ status: "tool_use", text: "mcp__pencil__batch_design" }), "workspace");
assert.equal(
  classifyAgentToolEvent({ status: "tool_use", text: "SomeBrandNewTool" }),
  "unknown",
  "모르는 도구는 분류 실패로 남겨 노출 쪽으로 기울여야 한다",
);

// ── 4레인 × 양방향 회귀 픽스처 ────────────────────────────────────────
// 왜 픽스처를 레인별로 따로 두는가: 1차 판정은 Claude 모양(kind:"tool")만 보고 통과했고,
// 가재코드·Hermes 는 그 이벤트를 구조적으로 한 번도 내지 않아 "절대 미노출"로 뒤집혔다.
// 아래 이벤트열은 src-tauri/src/agent.rs 를 직독해 각 레인이 실제로 emit 하는 형태를
// 그대로 옮긴 것이다. 레인 하나라도 형태가 바뀌면 여기서 깨져야 한다.
//
//  claude   parse_claude_line L2612/L2637/L2657/L2703
//  codex    parse_codex_line  L2923/L2937/L2956/L2970/L3009
//  gajecode run_gajecode      L3667(status) / L3719(delta, text=`{line}\n`, raw=line) / L3749
//  hermes   run_hermes        L3872(status) / L4625(result)  — 그 사이 tool·delta 는 0건
//                             (L4192 `if machine_readable_output { continue; }`)

interface LaneEvent {
  kind: string;
  status?: string;
  text?: string;
  raw?: string;
}

function impactOf(lane: string, events: LaneEvent[]) {
  const impact = createTurnPreviewImpact(lane);
  for (const event of events) noteTurnPreviewImpactEvent(impact, event);
  return impact;
}

// ── Claude 레인 ────────────────────────────────────────────────────────
const claudeIdleTurn: LaneEvent[] = [
  { kind: "status", status: "init", raw: '{"type":"system","subtype":"init"}' },
  { kind: "delta", text: "안녕", raw: '{"type":"stream_event","event":{"type":"content_block_delta"}}' },
  { kind: "delta", text: "하세요 대표님.", raw: '{"type":"stream_event","event":{"type":"content_block_delta"}}' },
  { kind: "result", status: "end_turn", text: "안녕하세요 대표님.", raw: '{"type":"result"}' },
];
const claudeEditTurn: LaneEvent[] = [
  { kind: "status", status: "init", raw: '{"type":"system","subtype":"init"}' },
  { kind: "tool", status: "tool_use", text: "Read", raw: '{"type":"stream_event"}' },
  { kind: "tool", status: "tool_use", text: "Edit", raw: '{"type":"stream_event"}' },
  { kind: "tool", status: "tool_use", text: "Bash", raw: '{"type":"stream_event"}' },
  { kind: "result", status: "end_turn", text: "App.tsx 를 고쳤습니다.", raw: '{"type":"result"}' },
];

// ── Codex 레인 (delta 를 아예 내지 않는다) ─────────────────────────────
const codexIdleTurn: LaneEvent[] = [
  { kind: "status", status: "thread.started", raw: '{"type":"thread.started"}' },
  { kind: "status", status: "turn.started", raw: '{"type":"turn.started"}' },
  { kind: "tool", status: "item.completed", text: "reasoning", raw: '{"type":"item.completed"}' },
  { kind: "result", status: "agent_message", text: "안녕하세요 대표님.", raw: '{"type":"item.completed"}' },
  { kind: "status", status: "turn.completed", raw: '{"type":"turn.completed"}' },
];
const codexEditTurn: LaneEvent[] = [
  { kind: "status", status: "thread.started", raw: '{"type":"thread.started"}' },
  { kind: "tool", status: "item.completed", text: "reasoning", raw: '{"type":"item.completed"}' },
  { kind: "tool", status: "item.completed", text: "file_change", raw: '{"type":"item.completed"}' },
  { kind: "tool", status: "item.completed", text: "command_execution", raw: '{"type":"item.completed"}' },
  { kind: "result", status: "agent_message", text: "고쳤습니다.", raw: '{"type":"item.completed"}' },
];

// ── 가재코드 레인 ──────────────────────────────────────────────────────
// gjc 는 `--print`(mode=text) 로 돌아 stdout 에 최종 답변만 실린다. atelier 는 그 라인을
// text=`{line}\n`, raw=line 으로 그대로 올린다(run_gajecode L3717-3730). kind:"tool" 은 0건.
function gajecodeStdout(lines: string[]): LaneEvent[] {
  return [
    { kind: "status", status: "gajecode.starting" },
    ...lines.map((line) => ({ kind: "delta", text: `${line}\n`, raw: line })),
    { kind: "result", status: "gajecode.completed", text: lines.join("\n") },
  ];
}
const gajecodeIdleTurn = gajecodeStdout(["안녕하세요 대표님.", "무엇을 도와드릴까요?"]);
const gajecodeEditTurn = gajecodeStdout([
  "요청하신 배경색을 바꿨습니다.",
  "diff --git a/src/App.tsx b/src/App.tsx",
  "@@ -12,7 +12,7 @@ export function App() {",
  "-  const bg = \"#fff\";",
  "+  const bg = \"#111\";",
]);

// ── Hermes 레인 ───────────────────────────────────────────────────────
// quiet 모드가 stdout 라인 처리를 통째로 막아(run_hermes L4192) tool·delta 가 0건이다.
// 남는 건 시작 status 와 state.db 에서 검증한 최종 답변뿐이다.
function hermesTurn(answer: string): LaneEvent[] {
  return [
    { kind: "status", status: "hermes.starting" },
    { kind: "result", status: "hermes.completed", text: answer },
  ];
}
const hermesIdleTurn = hermesTurn("안녕하세요 대표님.");
const hermesEditTurn = hermesTurn("App.tsx 의 배경색을 바꿨습니다.");

// 1) 레인이 실제로 어떤 채널을 갖는지부터 고정한다.
assert.equal(laneEvidenceChannel("claude"), "tool-events");
assert.equal(laneEvidenceChannel("codex"), "tool-events");
assert.equal(
  laneEvidenceChannel("gajecode"),
  "blind",
  "가재코드는 kind:\"tool\" 을 한 번도 내지 않는다 — 침묵을 무영향으로 읽으면 안 된다",
);
assert.equal(
  laneEvidenceChannel("hermes"),
  "blind",
  "Hermes 는 quiet 게이트로 tool/delta emit 이 전부 도달 불가다",
);
assert.equal(laneEvidenceChannel("brand-new-provider"), "blind", "미등록 레인도 노출 쪽");
assert.equal(laneEvidenceChannel(null), "blind");

// 2) 레인별 이벤트 형태 자체를 고정한다 (형태가 바뀌면 판정 근거가 무너진다).
assert.equal(
  gajecodeIdleTurn.filter((event) => event.kind === "tool").length,
  0,
  "가재코드 픽스처에 tool 이벤트가 생기면 실제 스트림과 어긋난 것이다",
);
assert.equal(
  hermesEditTurn.filter((event) => event.kind === "tool" || event.kind === "delta").length,
  0,
  "Hermes 픽스처에 tool/delta 가 생기면 실제 스트림과 어긋난 것이다",
);
assert.equal(
  codexIdleTurn.filter((event) => event.kind === "delta").length,
  0,
  "Codex 는 delta 를 내지 않는다",
);

// 3) delta 레인 판정: 런타임 stdout 에코만 스캔한다.
assert.equal(isRuntimeStdoutEcho({ text: "diff --git a/x b/x\n", raw: "diff --git a/x b/x" }), true);
assert.equal(
  isRuntimeStdoutEcho({
    text: "diff --git",
    raw: '{"type":"stream_event","event":{"type":"content_block_delta"}}',
  }),
  false,
  "Claude 의 프로즈 delta 는 raw 가 JSON 프레임이라 에코가 아니다",
);
assert.equal(isRuntimeStdoutEcho({ text: "두 줄\n짜리\n", raw: "두 줄\n짜리" }), false);
assert.equal(
  isRuntimeStdoutEcho({ text: "diff --git a/x b/x" }),
  false,
  "raw 가 없으면 런타임이 그 줄을 원문 그대로 올렸다는 근거가 없다 — 스캔하면 안 된다",
);
assert.equal(isRuntimeStdoutEcho({ text: "$ npm run build\n", raw: "" }), false);
assert.equal(classifyRuntimeStdoutLine("diff --git a/src/App.tsx b/src/App.tsx"), "workspace");
assert.equal(classifyRuntimeStdoutLine("@@ -12,7 +12,7 @@ export function App() {"), "workspace");
assert.equal(classifyRuntimeStdoutLine("$ npm run build"), "workspace");
assert.equal(classifyRuntimeStdoutLine("Running: cargo test"), "workspace");

// ★과잉 노출 회귀 방지: 실행이 아니라 "설명"인 줄은 절대 걸리면 안 된다.
for (const narration of [
  "diff 를 보여드리면 아래와 같습니다.",
  "변경 사항은 diff --git 형식으로 확인하실 수 있습니다.",
  "빌드를 돌리려면 npm run build 를 실행하시면 됩니다.",
  "$ 기호로 시작하는 줄이 명령입니다.",
  "커밋 전에 git diff 를 한 번 보시는 게 좋습니다.",
  "@@ 표기는 diff 의 헝크 헤더입니다.",
  "이번 턴에는 파일을 고치지 않았습니다.",
]) {
  assert.equal(
    classifyRuntimeStdoutLine(narration),
    "narrative",
    `서술 문장이 실행 증거로 잡히면 과잉 노출로 되돌아간다: ${narration}`,
  );
}

// 4) ★완료 판정: 4레인 × 양방향 = 8케이스.
//    무영향 턴 = 미노출, 영향 턴 = 노출.
const laneMatrix: {
  lane: string;
  idle: LaneEvent[];
  active: LaneEvent[];
  idleProbe: "changed" | "unchanged" | "unknown";
  activeProbe: "changed" | "unchanged" | "unknown";
}[] = [
  // claude/codex 는 도구 이벤트로 관측되므로 실측 없이(unknown) 판정한다.
  { lane: "claude", idle: claudeIdleTurn, active: claudeEditTurn, idleProbe: "unknown", activeProbe: "unknown" },
  { lane: "codex", idle: codexIdleTurn, active: codexEditTurn, idleProbe: "unknown", activeProbe: "unknown" },
  // 관측 불가 레인은 턴 전용 baseline 실측이 판정을 만든다.
  { lane: "gajecode", idle: gajecodeIdleTurn, active: gajecodeEditTurn, idleProbe: "unchanged", activeProbe: "changed" },
  { lane: "hermes", idle: hermesIdleTurn, active: hermesEditTurn, idleProbe: "unchanged", activeProbe: "changed" },
];

for (const row of laneMatrix) {
  const idle = impactOf(row.lane, row.idle);
  idle.workspaceMutation = row.idleProbe;
  assert.equal(
    turnAffectedPreview(idle),
    false,
    `[${row.lane}] 무영향 턴에는 프리뷰 검증 카드가 붙으면 안 된다`,
  );

  const active = impactOf(row.lane, row.active);
  active.workspaceMutation = row.activeProbe;
  assert.equal(
    turnAffectedPreview(active),
    true,
    `[${row.lane}] 워크스페이스를 건드린 턴에는 카드가 반드시 나와야 한다`,
  );
}

// 5) 관측 불가 레인은 실측이 없으면(unknown) 침묵해도 노출 쪽으로 기운다.
//    ← 1차 사고("가재코드 탭 절대 미노출")를 직접 막는 단정이다.
for (const lane of ["gajecode", "hermes"]) {
  const events = lane === "gajecode" ? gajecodeIdleTurn : hermesIdleTurn;
  assert.equal(
    turnAffectedPreview(impactOf(lane, events)),
    true,
    `[${lane}] 실측이 없으면 판정 불가 — 억제하지 말고 노출해야 한다`,
  );
}
// 반대로 관측 가능한 레인은 실측 없이도 무영향 턴을 억제한다.
assert.equal(turnAffectedPreview(impactOf("claude", claudeIdleTurn)), false);
assert.equal(turnAffectedPreview(impactOf("codex", codexIdleTurn)), false);

// 6) 가재코드가 실제로 diff 라인을 흘렸으면 실측이 없어도 스트림만으로 잡는다.
const gajecodeStreamOnly = impactOf("gajecode", gajecodeEditTurn);
assert.ok(
  gajecodeStreamOnly.workspaceStdoutLines > 0,
  "가재코드 stdout 의 diff 라인은 delta 레인 판정에서 잡혀야 한다",
);
assert.equal(
  impactOf("gajecode", gajecodeIdleTurn).workspaceStdoutLines,
  0,
  "인사만 한 가재코드 턴은 실행 증거 라인이 0이어야 한다",
);
// ★스트림이 실측을 구제하는 경로. git 루트 밖 편집이나 dev 서버 재기동처럼 baseline 이
// "바뀐 파일 0"으로 읽히는 경우에도, stdout 에 실행 흔적이 있으면 노출해야 한다.
const gajecodeStdoutOverridesProbe = impactOf("gajecode", gajecodeEditTurn);
gajecodeStdoutOverridesProbe.workspaceMutation = "unchanged";
assert.equal(
  turnAffectedPreview(gajecodeStdoutOverridesProbe),
  true,
  "실측이 unchanged 여도 stdout 실행 라인이 있으면 노출해야 한다",
);
const gajecodeStdoutOverridesUnknown = impactOf("gajecode", gajecodeEditTurn);
assert.equal(turnAffectedPreview(gajecodeStdoutOverridesUnknown), true);
assert.ok(impactOf("gajecode", gajecodeIdleTurn).runtimeStdoutLines > 0, "stdout 라인 자체는 관측된다");
// Claude 의 프로즈 delta 는 stdout 라인으로 세지 않는다(과잉 노출 차단).
assert.equal(impactOf("claude", claudeIdleTurn).runtimeStdoutLines, 0);

// 7) 실측 결과 환산 — baseline 이 해소되지 않은 응답은 판정 근거로 쓰지 않는다.
assert.equal(
  workspaceMutationFromChangeSummary({ is_git: true, scope: "run", files: [] }),
  "unchanged",
);
assert.equal(
  workspaceMutationFromChangeSummary({ is_git: true, scope: "run", files: [{ path: "a" }] }),
  "changed",
);
assert.equal(
  workspaceMutationFromChangeSummary({ is_git: true, scope: "workspace", files: [{ path: "a" }] }),
  "unknown",
  "baseline 이 해소되지 않으면 워크스페이스 전체를 받은 것이라 상시 dirty 리포에서 항상 changed 다",
);
assert.equal(workspaceMutationFromChangeSummary({ is_git: false, scope: "run", files: [] }), "unknown");
assert.equal(workspaceMutationFromChangeSummary(null), "unknown");

// 8) 실측 비용은 카드가 붙을 수 있는 상황에서, 관측 불가 레인에만 쓴다.
assert.equal(turnNeedsWorkspaceMutationProbe("gajecode", true), true);
assert.equal(turnNeedsWorkspaceMutationProbe("hermes", true), true);
assert.equal(turnNeedsWorkspaceMutationProbe("claude", true), false);
assert.equal(turnNeedsWorkspaceMutationProbe("codex", true), false);
assert.equal(
  turnNeedsWorkspaceMutationProbe("gajecode", false),
  false,
  "프리뷰 URL 이 없으면 카드가 붙을 일이 없으니 git 비용을 쓰지 않는다",
);

// 9) 나머지 안전 기본값.
const previewStartedTurn = impactOf("claude", [{ kind: "delta", text: "hi", raw: '{"type":"x"}' }]);
previewStartedTurn.previewUrlChanged = true;
assert.equal(turnAffectedPreview(previewStartedTurn), true);
assert.equal(turnAffectedPreview(createTurnPreviewImpact("claude")), true, "이벤트 0건은 관측 실패다");
assert.equal(turnAffectedPreview(null), true);
assert.equal(
  turnAffectedPreview(impactOf("claude", [{ kind: "tool", status: "tool_use", text: "SomeBrandNewTool" }])),
  true,
  "모르는 도구 하나만 써도 노출 쪽으로 기운다",
);
// 실측이 changed 면 스트림이 조용해도 노출한다.
const silentButChanged = impactOf("claude", claudeIdleTurn);
silentButChanged.workspaceMutation = "changed";
assert.equal(turnAffectedPreview(silentButChanged), true);

// ── 호출부 배선 (게이트를 지우면 이 단정이 깨진다) ─────────────────────
const workspaceSource = readFileSync("src/components/AgentWorkspace.tsx", "utf8");
assert.match(
  workspaceSource,
  /noteTurnPreviewImpact\(assistantId, event\);/,
  "AgentWorkspace must record per-turn preview impact from the agent stream",
);
assert.match(
  workspaceSource,
  /startTurnPreviewImpact\(assistantId, runProvider\);/,
  "턴 시작 시 레인을 심어야 관측 가능 여부를 판정할 수 있다 (단계 분할 턴은 실제 실행 provider 기준)",
);
assert.match(
  workspaceSource,
  /turnNeedsWorkspaceMutationProbe\(runProvider, Boolean\(previewUrlAtTurnStart\)\)/,
  "관측 불가 레인은 턴 전용 baseline 을 잡아야 한다 (단계 분할 턴은 실제 실행 provider 기준)",
);
assert.match(
  workspaceSource,
  /const mutation = workspaceMutationFromChangeSummary\(summary\);/,
  "턴 전용 baseline 응답을 실측값으로 환산해야 한다",
);
assert.match(
  workspaceSource,
  /impact = \{ \.\.\.impact, workspaceMutation: mutation \}/,
  "환산한 실측값이 판정 입력에 반영돼야 한다",
);
assert.match(
  workspaceSource,
  /if \(!turnAffectedPreview\(impact\)\) return;\s*\n\s*await captureMessagePreviewEvidence\(/,
  "preview evidence capture must stay gated behind the per-turn impact signal",
);
assert.ok(
  !/agentChangeSummary\(\s*input\.cwd,\s*changeBaseline/.test(workspaceSource),
  "실측 baseline 은 '변경 검토' baseline 과 절대 공유하면 안 된다",
);

console.log("preview evidence smoke: passed");
