import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settingsSource = readFileSync("src/components/Settings.tsx", "utf8");
const workspaceSource = readFileSync("src/components/AgentWorkspace.tsx", "utf8");

const extractShortcutLabels = (source: string, sectionTitle: string): string[] => {
  const start = source.indexOf(`title: "${sectionTitle}"`);
  assert.ok(start >= 0, `shortcuts section title for ${sectionTitle} should be present`);

  const shortcutsStart = source.indexOf("shortcuts:", start);
  assert.ok(shortcutsStart >= 0, `shortcuts list for ${sectionTitle} should be present`);

  const open = source.indexOf("[", shortcutsStart);
  const close = source.indexOf("]", open + 1);
  assert.ok(open >= 0 && close > open, `shortcuts list bounds for ${sectionTitle} should be valid`);

  const raw = source.slice(open + 1, close);
  const entries = [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(entries.length > 0, `expected parsed shortcut labels for ${sectionTitle}`);
  return entries;
};

const extractQuickOpenKeyIndex = (source: string): number => {
  const mapMatch = source.match(/const shortcuts: Array<\[string, string\[\]\]> = \[([\s\S]*?)\s*\];/);
  assert.ok(mapMatch, "settings shortcut key map should be present");

  const rows = [...mapMatch[1].matchAll(/\[\s*copy\.shortcuts\[(\d+)\]\s*,\s*\[([^\]]+)\]\s*\]/g)];
  const row = rows.find((entry) => {
    const keys = entry[2];
    return keys.includes("MOD_KEY") && keys.includes('"P"') && !keys.includes('"Shift"');
  });

  assert.ok(row, "expected a Cmd/Ctrl+P binding in settings shortcuts");
  return Number(row[1]);
};

const workspaceQuickOpenLabels = [...workspaceSource.matchAll(/quickOpen:\s*"([^"]+)"/g)].map((m) => m[1]);
assert.ok(workspaceQuickOpenLabels.length >= 2, "expected English and Korean quickOpen labels in AgentWorkspace copy");

const settingsEn = extractShortcutLabels(settingsSource, "Shortcuts");
const settingsKo = extractShortcutLabels(settingsSource, "단축키");
const quickOpenIndex = extractQuickOpenKeyIndex(settingsSource);

const workspaceQuickOpenEn = workspaceQuickOpenLabels[0];
const workspaceQuickOpenKo = workspaceQuickOpenLabels[1];

assert.equal(
  settingsEn[quickOpenIndex],
  workspaceQuickOpenEn,
  `English shortcut label for Cmd/Ctrl+P should match AgentWorkspace quick open label (expected: ${workspaceQuickOpenEn}, actual: ${settingsEn[quickOpenIndex]})`,
);
assert.equal(
  settingsKo[quickOpenIndex],
  workspaceQuickOpenKo,
  `Korean shortcut label for Cmd/Ctrl+P should match AgentWorkspace quick open label (expected: ${workspaceQuickOpenKo}, actual: ${settingsKo[quickOpenIndex]})`,
);

console.log("PASS shortcut contract smoke: Settings Cmd/Ctrl+P labels match AgentWorkspace quick open labels in en/ko");
