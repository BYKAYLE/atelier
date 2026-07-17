import { readFileSync } from "node:fs";

const source = readFileSync("src/components/AgentWorkspace.tsx", "utf8");
const css = readFileSync("src/index.css", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const composerClassIndex = source.indexOf("atelier-composer-textarea");
assert(composerClassIndex >= 0, "composer textarea is missing");
const composerStart = source.lastIndexOf("<textarea", composerClassIndex);
const composerEnd = source.indexOf("/>", composerClassIndex);
assert(composerStart >= 0 && composerEnd > composerStart, "composer textarea block is malformed");
const composerBlock = source.slice(composerStart, composerEnd);

assert(
  composerBlock.includes("defaultValue={inputDraftRef.current}"),
  "composer must remain ref-backed instead of controlled per keystroke",
);
assert(
  composerBlock.includes("inputDraftRef.current = e.target.value"),
  "composer must update the draft ref synchronously",
);
assert(
  !composerBlock.includes("setInput(e.target.value)"),
  "composer must not trigger a workspace render for every keystroke",
);
assert(
  !source.includes("const [nowTickMs") && !source.includes("setNowTickMs"),
  "elapsed-time updates must not rerender the entire workspace",
);
assert(
  source.includes("const AgentActivityView = React.memo") &&
    source.includes("window.setInterval(() => setNow(Date.now()), 1000)"),
  "elapsed-time updates must stay inside the memoized activity row",
);
assert(
  source.includes("atelier-transcript-message flex min-w-0 gap-3"),
  "transcript messages must use the offscreen rendering boundary",
);
assert(
  css.includes(".atelier-transcript-message") &&
    css.includes("content-visibility: auto") &&
    css.includes('data-streaming="true"'),
  "transcript CSS must defer offscreen messages while keeping streaming visible",
);

console.log(JSON.stringify({
  ok: true,
  composer: "ref-backed",
  elapsedTimer: "activity-row-only",
  transcript: "content-visibility",
}));
