import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  presentAgentAnswer,
  selectTerminalAgentAnswer,
  unverifiedIntermediateNotice,
} from "../src/lib/agentAnswerContract.ts";

const sourcePath = "src/components/AgentWorkspace.tsx";
const source = readFileSync(sourcePath, "utf8");
const fixture = JSON.parse(
  readFileSync("tools/agent-stream-rendering-smoke.fixture.json", "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sourceFile = ts.createSourceFile(
  sourcePath,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function topLevelFunction(name) {
  const declaration = sourceFile.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement)
      && statement.name?.text === name,
  );
  assert(declaration, `${name} declaration is missing`);
  const printed = ts.createPrinter().printNode(
    ts.EmitHint.Unspecified,
    declaration,
    sourceFile,
  );
  const javascript = ts.transpileModule(printed, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  return { printed, javascript };
}

const cleanDeltaDeclaration = topLevelFunction("cleanAgentDelta");
const cleanAgentDelta = new Function(
  `${cleanDeltaDeclaration.javascript}\nreturn cleanAgentDelta;`,
)();
const normalizeDisplayDeclaration = topLevelFunction("normalizeAgentDisplayText");
const normalizeAgentDisplayText = new Function(
  "stripAnsi",
  `${normalizeDisplayDeclaration.javascript}\nreturn normalizeAgentDisplayText;`,
)((text) => text);
const orphanFinalizerDeclaration = topLevelFunction("finalizeOrphanedStreamingMessages");
const finalizeOrphanedStreamingMessages = new Function(
  `${orphanFinalizerDeclaration.javascript}\nreturn finalizeOrphanedStreamingMessages;`,
)();
const preserveDraftDeclaration = topLevelFunction("preserveIntermediateDraft");
const preserveIntermediateDraft = new Function(
  `${preserveDraftDeclaration.javascript}\nreturn preserveIntermediateDraft;`,
)();

const sequentialChunks = normalizeAgentDisplayText(
  ["A\n", "B\n"].map((chunk) => cleanAgentDelta(chunk)).join(""),
);
assert(
  sequentialChunks === "A\nB\n",
  `delta normalization must preserve LF chunk boundaries; received ${JSON.stringify(sequentialChunks)}`,
);
const splitCrLfChunks = normalizeAgentDisplayText(
  ["A\r", "\nB"].map((chunk) => cleanAgentDelta(chunk)).join(""),
);
assert(
  splitCrLfChunks === "A\nB",
  `delta normalization must preserve a split CRLF boundary; received ${JSON.stringify(splitCrLfChunks)}`,
);
assert(
  cleanDeltaDeclaration.printed.includes("return text")
    && !cleanDeltaDeclaration.printed.includes("collapseDumpyText")
    && !cleanDeltaDeclaration.printed.includes("stripAnsi")
    && !cleanDeltaDeclaration.printed.includes("replace(")
    && !cleanDeltaDeclaration.printed.includes(".trim(")
    && normalizeDisplayDeclaration.printed.includes("stripAnsi(text)")
    && normalizeDisplayDeclaration.printed.includes("replace(/\\r\\n?/g, \"\\n\")"),
  "fragments must stay raw until ANSI/CRLF normalization runs on accumulated display text",
);
assert(
  source.includes("if (event.text) pending.text += event.text;")
    && source.includes("const text = cleanAgentDelta(pending.text);")
    && source.includes("normalizeAgentDisplayText(displayText)"),
  "raw delta fragments must be accumulated before newline normalization",
);

assert(
  selectTerminalAgentAnswer({
    terminalResultPresent: true,
    terminalText: "검증된 최종 답변",
    streamedDraft: "**Planning leaked draft**",
    fallbackText: "fallback",
  }) === "검증된 최종 답변",
  "a terminal result must be authoritative over streamed draft text",
);
assert(
  selectTerminalAgentAnswer({
    terminalResultPresent: true,
    terminalText: "",
    terminalErrorText: "명시적 터미널 오류",
    streamedDraft: "**Planning leaked draft**",
    fallbackText: "fallback",
  }) === "명시적 터미널 오류",
  "an explicit terminal error must be authoritative over streamed draft text",
);
assert(
  selectTerminalAgentAnswer({
    terminalResultPresent: false,
    terminalErrorText: "catch 오류",
    streamedDraft: "**Planning leaked draft**",
    fallbackText: "fallback",
  }) === "catch 오류",
  "a caught error must never promote streamed draft text to the answer",
);
assert(
  selectTerminalAgentAnswer({
    terminalResultPresent: true,
    terminalText: "",
    streamedDraft: "**Planning leaked draft**",
    fallbackText: "검증된 답변 없음",
  }) === "검증된 답변 없음",
  "a terminal result without text must use the explicit fallback, not the draft",
);

const providers = ["claude", "hermes", "codex", "gajecode", "grok"];
const actualScaleSegments = Array.from(
  { length: fixture.actualScale.boundaryCount + 1 },
  (_, index) => {
    const label = fixture.actualScale.progressLabels[
      index % fixture.actualScale.progressLabels.length
    ];
    return `**${label} — checkpoint ${String(index + 1).padStart(3, "0")}: validating provider lifecycle evidence, renderer state, and workspace transition provenance**`;
  },
).join("");
const actualScaleTranscript = [
  actualScaleSegments,
  fixture.actualScale.terminalControlLine,
  fixture.actualScale.suffix,
].join("\n");
const actualScaleBoundaryCount = actualScaleTranscript.match(/\*{4}/g)?.length || 0;
assert(
  actualScaleBoundaryCount === fixture.actualScale.boundaryCount
    && actualScaleBoundaryCount === 119,
  `actual-scale fixture must reproduce exactly 119 literal **** boundaries; received ${actualScaleBoundaryCount}`,
);
assert(
  actualScaleTranscript.length >= 13_000,
  `actual-scale fixture must remain comparable to the persisted incident; received ${actualScaleTranscript.length} chars`,
);

for (const provider of providers) {
  for (const status of ["done", "error"]) {
    const presentation = presentAgentAnswer({
      provider,
      role: "assistant",
      status,
      text: actualScaleTranscript,
      language: "ko",
    });
    assert(
      presentation.changed
        && presentation.reason === "dense_progress"
        && presentation.recoveredSuffix,
      `${provider}/${status} must recover the answer suffix from actual-scale progress contamination`,
    );
    assert(
      presentation.text.includes(fixture.actualScale.suffix)
        && !presentation.text.includes("**Planning")
        && !presentation.text.includes("****"),
      `${provider}/${status} must retain the final answer and remove Planning/**** progress output`,
    );
  }
}

const compactDensePresentation = presentAgentAnswer({
  provider: "hermes",
  role: "assistant",
  status: "done",
  text: fixture.denseProgressWithSuffix,
  language: "ko",
});
assert(
  compactDensePresentation.changed
    && compactDensePresentation.recoveredSuffix
    && compactDensePresentation.text.includes("실제 최종 답변은 이 부분입니다.")
    && !compactDensePresentation.text.includes("**Planning"),
  "the compact persisted fixture must recover its valid answer suffix",
);

const noSuffixPresentation = presentAgentAnswer({
  provider: "codex",
  role: "assistant",
  status: "error",
  text: fixture.denseProgressWithoutSuffix,
  language: "ko",
});
assert(
  noSuffixPresentation.changed
    && !noSuffixPresentation.recoveredSuffix
    && !noSuffixPresentation.text.includes("Planning repository inspection"),
  "dense progress without a valid suffix must render a recovery notice only",
);

for (const provider of providers) {
  const normalPresentation = presentAgentAnswer({
    provider,
    role: "assistant",
    status: "done",
    text: fixture.normalLongAnswer,
    language: "en",
  });
  assert(
    !normalPresentation.changed
      && normalPresentation.text === fixture.normalLongAnswer,
    `${provider} normal long-form planning guidance must not be a false positive`,
  );
}
assert(
  !presentAgentAnswer({
    provider: "hermes",
    role: "user",
    status: "done",
    text: actualScaleTranscript,
    language: "ko",
  }).changed,
  "user messages must never be rewritten by the answer presentation contract",
);
assert(
  !presentAgentAnswer({
    provider: "hermes",
    role: "assistant",
    status: "streaming",
    text: actualScaleTranscript,
    language: "ko",
  }).changed,
  "currently streaming assistant messages must never be rewritten heuristically",
);

for (const provider of providers) {
  const contextPresentation = presentAgentAnswer({
    provider,
    role: "assistant",
    status: "done",
    text: fixture.contextLimitTranscript,
    language: "ko",
  });
  assert(
    contextPresentation.changed
      && contextPresentation.reason === "context_limit"
      && contextPresentation.text.includes("113,866")
      && contextPresentation.text.includes("원본 기록은 보존"),
    `${provider} must preserve the exact prior context-limit recovery behavior`,
  );
}

const restored = finalizeOrphanedStreamingMessages([{
  id: "restored-orphan",
  role: "assistant",
  text: actualScaleTranscript,
  createdAt: 1,
  status: "streaming",
}])[0];
assert(
  restored.status === "error"
    && restored.unverifiedIntermediate === true
    && restored.text === actualScaleTranscript,
  "a restored orphan must be marked unverified without mutating its full stored text",
);
const restoredVisibleText = restored.unverifiedIntermediate
  ? unverifiedIntermediateNotice("ko")
  : presentAgentAnswer({
      provider: "hermes",
      role: restored.role,
      status: restored.status,
      text: restored.text,
      language: "ko",
    }).text;
assert(
  restoredVisibleText.includes("아래 저장된 원문")
    && !restoredVisibleText.includes("**Planning"),
  "an unverified restored orphan must show a notice instead of intermediate output",
);
assert(
  preserveIntermediateDraft(
    {
      id: "terminal-error",
      role: "assistant",
      text: actualScaleTranscript,
      createdAt: 1,
      status: "streaming",
    },
    "Agent error",
  ) === actualScaleTranscript,
  "a differing streamed draft must be preserved in full for terminal error evidence",
);

assert(
  source.includes('const isStreamingAssistant = m.role === "assistant" && m.status === "streaming";')
    && source.includes("const useStreamingRenderer = isStreamingAssistant || isRevealing;"),
  "streaming assistant messages must select the plain streaming renderer by status",
);
assert(
  source.includes("const answerPresentation = m.unverifiedIntermediate")
    && source.includes("unverifiedIntermediateNotice(tw.language)")
    && source.includes("저장된 원문 보기")
    && source.includes("<details")
    && source.includes("{storedOriginalText}")
    && source.includes("max-h-80")
    && source.includes("showStoredOriginal"),
  "unverified/recovered answers must expose the full stored original through bounded details UI",
);
assert(
  source.includes("intermediateDraft: message.intermediateDraft")
    && source.includes("intermediateDraft: preserveIntermediateDraft")
    && source.includes("unverifiedIntermediate: true"),
  "intermediate draft preservation and orphan state must survive persistence and terminal paths",
);
assert(
  (source.match(/terminalResultPresent: true/g) || []).length >= 3
    && !source.includes("terminalResultPresent: false"),
  "result, invoke, and exception terminal paths must all reject streamed draft promotion",
);
assert(
  source.includes('status: event.is_error ? "error" as const : "done" as const')
    && source.includes('showLogs: "원본 로그 보기"'),
  "is_error results must remain errors and raw-log terminology must be explicit",
);
assert(
  !source.includes("legacyHermesStoredTranscriptNotice"),
  "provider-specific legacy transcript recovery must not remain in the renderer",
);

console.log(JSON.stringify({
  ok: true,
  providers,
  sequentialChunks,
  splitCrLfChunks,
  actualScaleChars: actualScaleTranscript.length,
  actualScaleBoundaryCount,
  suffixRecovered: true,
  normalLongAnswer: "unchanged",
  restoredOrphan: "unverified-and-lossless",
  terminalDraftPolicy: "evidence-only",
}));
