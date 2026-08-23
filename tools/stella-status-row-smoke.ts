import { readFileSync } from "node:fs";

const workspace = readFileSync("src/components/AgentWorkspace.tsx", "utf8");
const styles = readFileSync("src/index.css", "utf8");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  workspace.includes("onClick={applyFactoryLauncher}") &&
    workspace.includes("stellaFactoryBootstrap") &&
    workspace.includes("stellaFactoryAutopilot"),
  "Stella launcher and execution paths must remain available",
);
assert(
  !workspace.includes("atelier-factory-status") &&
    !workspace.includes("stellaFactoryStatus") &&
    !workspace.includes("Stella Mode status") &&
    !workspace.includes("스텔라 모드 상태 새로고침"),
  "the persistent Stella status row and its workspace polling must be removed",
);
assert(
  !styles.includes(".atelier-factory-status"),
  "removed Stella status row must not leave dead responsive CSS",
);

console.log("stella persistent status row smoke passed");
