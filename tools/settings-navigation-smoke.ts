import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/components/App.tsx", "utf8");
const settings = readFileSync("src/components/Settings.tsx", "utf8");
const css = readFileSync("src/index.css", "utf8");

for (const contract of [
  'const settingsActive = screen === "settings"',
  'settingsActive && "atelier-shell-sidebar-settings"',
  "data-nav-group={group.id}",
  'className="atelier-shell-nav-items space-y-1"',
  'aria-label={language === "en" ? item.labelEn : item.labelKo}',
]) {
  assert.ok(app.includes(contract), `settings navigation is missing: ${contract}`);
}

for (const contract of [
  "atelier-settings-content",
  "atelier-settings-content-compact",
  "atelier-settings-section-header",
  "atelier-settings-row",
  'data-testid="remote-settings-grid"',
  "min-[900px]:grid-cols-3",
  'data-testid="patch-feedback-layout"',
  "lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]",
]) {
  assert.ok(settings.includes(contract), `settings layout is missing: ${contract}`);
}

for (const contract of [
  '.atelier-shell-nav-group[data-nav-group="workspace"] .atelier-shell-nav-items',
  "grid-template-columns: repeat(3, minmax(0, 1fr))",
  '.atelier-shell-nav-group[data-nav-group="system"] .atelier-shell-nav-copy > span:last-child',
  "@media (max-height: 760px)",
  ".atelier-settings-content.atelier-settings-content-compact",
  ".atelier-settings-content-compact .atelier-settings-section-header",
]) {
  assert.ok(css.includes(contract), `settings compact CSS is missing: ${contract}`);
}

const computerUse = readFileSync("src/components/computer-use/ComputerUsePanel.tsx", "utf8");
assert.ok(
  !computerUse.includes("lg:col-span-2"),
  "remote settings: Computer Use must remain in the desktop three-column row",
);

console.log("settings navigation smoke passed");
