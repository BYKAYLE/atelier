import assert from "node:assert/strict";
import {
  formatDevScreenElementSelectionPrompt,
  normalizeDevScreenElementSelection,
} from "../src/lib/devScreen.ts";

const selection = normalizeDevScreenElementSelection({
  selector: '[data-testid="save-profile"]',
  tag: "BUTTON",
  role: "button",
  label: "Save password=secret-value",
  text: "Save profile",
  markup: '<button class="primary" data-testid="save-profile">Save profile</button>',
  rect: { x: 18.4, y: 32.8, width: 142.2, height: 41.6 },
  styles: {
    display: "inline-flex",
    backgroundColor: "rgb(226, 111, 72)",
    borderRadius: "7px",
    backgroundImage: "url(https://example.test/private-token)",
  },
  pageUrl: "http://localhost:5173/settings?token=secret#account",
  selectedAt: 1234,
});

assert.ok(selection);
assert.equal(selection.tag, "button");
assert.equal(selection.selector, '[data-testid="save-profile"]');
assert.equal(selection.label, "Save password=<redacted>");
assert.equal(selection.pageUrl, "http://localhost:5173/settings");
assert.deepEqual(selection.rect, { x: 18, y: 33, width: 142, height: 42 });
assert.equal(selection.styles.display, "inline-flex");
assert.equal(selection.styles.backgroundColor, "rgb(226, 111, 72)");
assert.equal(selection.styles.backgroundImage, undefined);
assert.match(formatDevScreenElementSelectionPrompt(selection, "ko"), /선택한 프리뷰 요소/);
assert.match(formatDevScreenElementSelectionPrompt(selection, "en"), /Selected preview element/);
assert.match(formatDevScreenElementSelectionPrompt(selection, "en"), /save-profile/);
assert.equal(normalizeDevScreenElementSelection({ tag: "div" }), null);
assert.equal(normalizeDevScreenElementSelection({
  selector: 'input[value="private-value"]',
  tag: "input",
}), null);
const tamperedMarkup = normalizeDevScreenElementSelection({
  selector: "#safe-field",
  tag: "input",
  markup: '<input id="safe-field" value="private-value" data-token="secret" oninput="steal()">',
  rect: {},
  styles: {},
});
assert.ok(tamperedMarkup);
assert.equal(tamperedMarkup.markup.includes("private-value"), false);
assert.equal(tamperedMarkup.markup.includes("data-token"), false);
assert.equal(tamperedMarkup.markup.includes("oninput"), false);

console.log(JSON.stringify({
  ok: true,
  selector: selection.selector,
  safeStyles: Object.keys(selection.styles).length,
  pageUrl: selection.pageUrl,
}));
