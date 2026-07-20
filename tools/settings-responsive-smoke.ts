import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function assertContains(source: string, token: string, context: string) {
  assert.ok(source.includes(token), context);
}

function extractClassTokens(source: string): Set<string> {
  const tokens = new Set<string>();

  const addClassFragment = (value: string) => {
    for (const part of value.split(/\s+/)) {
      if (part) tokens.add(part);
    }
  };

  for (const match of source.matchAll(/className\s*=\s*"([^"]+)"/g)) {
    addClassFragment(match[1]);
  }

  for (const match of source.matchAll(/className=\{cls\(([^)]*?)\)\}/g)) {
    for (const value of match[1].matchAll(/"([^"]+)"/g)) {
      addClassFragment(value[1]);
    }
  }

  return tokens;
}

const source = read("src/components/Settings.tsx");

// Source contract: responsive rows, fixed controls, and collapsing grids.
assertContains(source, "flex flex-col gap-2 md:flex-row md:items-start md:gap-6", "Row layout must stack on narrow widths");
assertContains(source, "w-full max-w-[160px]", "terminal font slider track width");
assertContains(source, "w-full max-w-[180px]", "profile name input width contract");
assertContains(source, "w-full max-w-[320px]", "headline input width contract");
assertContains(source, "grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]", "release patch rows must collapse");
assertContains(source, "grid grid-cols-1 gap-3 mb-3 md:grid-cols-[1fr_180px]", "bug submit grid must collapse");
assertContains(source, "w-full md:w-auto md:shrink-0 flex flex-wrap items-center gap-2", "control group must wrap on narrow widths");
assertContains(source, "flex flex-col gap-3 md:flex-row md:items-start md:justify-between", "patch header must stack on narrow widths");

// DOM-contract smoke: tokenized classes from rendered-ish className fragments.
const classTokens = extractClassTokens(source);

assertNotHasToken(classTokens, "w-[160px]", "No fixed 160px widths should remain in Settings input classes");
assertNotHasToken(classTokens, "w-[180px]", "No fixed 180px widths should remain in Settings input classes");
assertNotHasToken(classTokens, "w-[320px]", "No fixed 320px widths should remain in Settings input classes");
assertNotHasToken(classTokens, "grid-cols-[1fr_auto]", "1fr+auto grid must be responsive with explicit collapse");
assertNotHasToken(classTokens, "grid-cols-[1fr_180px]", "1fr+180px grid must be responsive with explicit collapse");

assertHasToken(classTokens, "flex-col", "DOM class tokens should include flex-col");
assertHasToken(classTokens, "md:flex-row", "DOM class tokens should include md:flex-row");
assertHasToken(classTokens, "grid-cols-1", "DOM class tokens should include 1-col fallback");
assertHasToken(classTokens, "md:grid-cols-[1fr_auto]", "DOM class tokens should include desktop patch-note grid");
assertHasToken(classTokens, "md:grid-cols-[1fr_180px]", "DOM class tokens should include desktop bug row grid");
assertHasToken(classTokens, "max-w-[160px]", "DOM class tokens should include terminal max width");
assertHasToken(classTokens, "max-w-[180px]", "DOM class tokens should include profile name max width");
assertHasToken(classTokens, "max-w-[320px]", "DOM class tokens should include headline max width");

function assertHasToken(tokens: Set<string>, token: string, context: string) {
  assert.ok(tokens.has(token), context);
}

function assertNotHasToken(tokens: Set<string>, token: string, context: string) {
  assert.ok(!tokens.has(token), context);
}

console.log("settings responsive smoke passed");
