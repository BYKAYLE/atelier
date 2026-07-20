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
assert(
  source.includes("isActive?: boolean") &&
    source.includes("if (!isActiveRef.current) return") &&
    source.includes("isActive ? 2200 : 10000") &&
    source.includes("isActive ? 750 : 4000"),
  "hidden workspace screens must release shortcuts and reduce polling without stopping background sessions",
);
assert(
  source.includes("if (model.trim()) return model") &&
    source.includes("`현재 선택: ${trimmed}`"),
  "runtime model refresh must not silently replace the model selected for a session",
);
assert(
  source.includes("function composerMinHeight()") &&
    source.includes("window.innerHeight <= 600") &&
    source.includes('composerHeight <= 230 ? "atelier-composer-compact"') &&
    css.includes("@media (max-width: 640px)") &&
    css.includes("min-height: 180px") &&
    css.includes("@media (max-height: 600px)") &&
    css.includes(".atelier-factory-status") &&
    css.includes("display: none !important") &&
    css.includes(".atelier-composer-compact .atelier-composer-hint") &&
    css.includes(".atelier-composer-control-label") &&
    css.includes("grid-template-columns: repeat(auto-fit, minmax(92px, 1fr))") &&
    css.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"),
  "composer controls must remain usable while secondary status detail compacts in short windows",
);
assert(
  css.includes("@media (max-width: 1080px)") &&
    css.includes(".atelier-preview-pane") &&
    css.includes("position: absolute"),
  "preview must overlay narrow workspaces instead of squeezing the composer",
);

console.log(JSON.stringify({
  ok: true,
  composer: "ref-backed",
  elapsedTimer: "activity-row-only",
  transcript: "content-visibility",
  hiddenWorkspace: "low-frequency-background",
  modelSelection: "preserved",
  narrowLayout: "bounded",
}));
