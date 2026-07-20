import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const files = {
  editor: "src/components/workbench/CodeWorkbench.tsx",
  sourceControl: "src/components/workbench/ChangesWorkbench.tsx",
  modeBar: "src/components/workbench/WorkspaceModeBar.tsx",
  workspace: "src/components/AgentWorkspace.tsx",
  codexModelMenu: "src/components/agent-composer/CodexModelMenu.tsx",
  sessionInbox: "src/components/session-inbox/SessionInboxToolbar.tsx",
  sessionInboxState: "src/components/session-inbox/sessionInboxState.ts",
  desktopNotifications: "src/components/desktop-notifications/useDesktopNotifications.ts",
  desktopNotificationState: "src/components/desktop-notifications/desktopNotificationState.ts",
  quickOpenIndex: "src/components/quick-open-index/quickOpenIndex.ts",
  quickOpenBackend: "src-tauri/src/agent_quick_open.rs",
  richPreview: "src/components/rich-preview/RichPreviewPane.tsx",
  richPreviewRules: "src/components/rich-preview/richPreview.ts",
  richPreviewBackend: "src-tauri/src/agent_rich_preview.rs",
  reviewWorkflow: "src/components/review-workflow/reviewWorkflow.ts",
  reviewWorkflowView: "src/components/review-workflow/ReviewWorkflowStatus.tsx",
  agentFleet: "src/components/agent-fleet/agentFleet.ts",
  agentFleetPanel: "src/components/agent-fleet/AgentFleetPanel.tsx",
  agentFleetLauncher: "src/components/agent-fleet/AgentFleetLauncher.tsx",
  editorDiagnostics: "src/components/editor-diagnostics/editorDiagnostics.ts",
  editorDiagnosticsView: "src/components/editor-diagnostics/EditorDiagnosticsControls.tsx",
  editorDiagnosticsBackend: "src-tauri/src/agent_editor_diagnostics.rs",
  app: "src/components/App.tsx",
  icons: "src/components/Icons.tsx",
  terminal: "src/components/Main.tsx",
  tauri: "src/lib/tauri.ts",
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(resolve(root, path), "utf8"),
    ]),
  ),
);

const navigationDefinition = sources.app
  .slice(sources.app.indexOf("const NAV_GROUPS"), sources.app.indexOf("const App:"));
const navigationIcons = [...navigationDefinition.matchAll(/icon: I\.(\w+)/g)].map((match) => match[1]);

const checks = [
  ["multi-tab editor state", sources.editor.includes("EditorTab[]")],
  ["dirty tab close guard", sources.editor.includes("window.confirm(copy.closeDirty)")],
  ["task-rooted conflict-aware write", sources.editor.includes("agentEditorWrite(") && sources.editorDiagnosticsBackend.includes("expected_content_sha256")],
  ["editor diagnostics are independently owned", sources.editor.includes('from "../editor-diagnostics"') && sources.editorDiagnostics.includes("collectEditorDiagnostics")],
  ["editor external changes preserve dirty drafts", sources.editorDiagnostics.includes('dirty) return "conflict"') && sources.editorDiagnosticsView.includes("Keep my edits")],
  ["editor autosave is explicit and conflict blocked", sources.editorDiagnostics.includes('policy === "after-delay"') && sources.editorDiagnostics.includes("!input.hasConflict")],
  ["editor safe write is bounded and credential aware", sources.editorDiagnosticsBackend.includes("MAX_EDITOR_BYTES") && sources.editorDiagnosticsBackend.includes("sensitive_home_path")],
  ["Git stage action", sources.sourceControl.includes("agentGitStage")],
  ["Git unstage action", sources.sourceControl.includes("agentGitUnstage")],
  ["manual Git commit action", sources.sourceControl.includes("agentGitCommit")],
  ["source-control features recompute from feature settings revision", sources.sourceControl.includes("useFeatureSettingsRevision") && sources.sourceControl.includes("availableSourceControlFeatures") && sources.sourceControl.includes("[featureSettingsRevision]")],
  ["disabled external source-control panels close deterministically", sources.sourceControl.includes("resolveExternalPanel(availableSourceControlFeatures, current)") && sources.sourceControl.includes("findSourceControlFeature(availableSourceControlFeatures, externalPanel)")],
  ["quick-open result merge is independently owned", sources.workspace.includes('from "./quick-open-index"') && sources.quickOpenIndex.includes("buildQuickOpenResults")],
  ["quick-open workspace file search", sources.workspace.includes("searchWorkspaceFiles(activeExecutionCwd")],
  ["quick-open symbol and Git index is bounded", sources.quickOpenBackend.includes("MAX_SOURCE_BYTES") && sources.quickOpenBackend.includes("MAX_SOURCE_FILES")],
  ["quick-open Git index is read only", sources.quickOpenBackend.includes('"for-each-ref"') && sources.quickOpenBackend.includes('"worktree", "list"') && !sources.quickOpenBackend.includes('"checkout"')],
  ["quick-open symbol navigation preserves line", sources.editor.includes("initialLine") && sources.editor.includes("setSelectionRange")],
  ["rich preview is independently owned", sources.editor.includes('from "../rich-preview"') && sources.richPreview.includes("RichPreviewPane")],
  ["binary files bypass UTF-8 editor loading", sources.editor.includes("if (binaryPreview)") && sources.editor.indexOf("if (binaryPreview)") < sources.editor.indexOf("readTextFile(path)")],
  ["rich preview enforces workspace and size boundaries", sources.richPreviewBackend.includes("starts_with(&resolved_root)") && sources.richPreviewBackend.includes("MAX_IMAGE_BYTES") && sources.richPreviewBackend.includes("MAX_PDF_BYTES")],
  ["rich preview blocks credential-like files", sources.richPreviewBackend.includes("sensitive_repository_path") && sources.richPreviewBackend.includes("sensitive_home_path")],
  ["rich preview does not own localhost services", !sources.richPreview.includes("localhost") && !sources.richPreviewBackend.includes("preview_service_start")],
  ["rich preview extension rules are independently testable", sources.richPreviewRules.includes("richPreviewHintForPath") && sources.richPreviewRules.includes("requiresRichPreview")],
  ["review workflow is independently owned", sources.workspace.includes('from "./review-workflow"') && sources.reviewWorkflow.includes("transitionReviewWorkflow")],
  ["review workflow preserves durable response evidence", sources.reviewWorkflow.includes("responseMessageId") && sources.reviewWorkflow.includes("responseExcerpt") && sources.reviewWorkflowView.includes("Response evidence")],
  ["review workflow prevents duplicate pending dispatches", sources.reviewWorkflowView.includes("summary.pending === 0")],
  ["agent fleet is independently owned", sources.workspace.includes('from "./agent-fleet"') && sources.agentFleet.includes("AgentFleetAdoptionReceipt")],
  ["agent fleet adoption has durable evidence", sources.agentFleet.includes("patchReceiptPath") && sources.agentFleetPanel.includes("adoptionEvidence")],
  ["agent fleet interrupted adoption fails closed", sources.agentFleet.includes("finalizeInterruptedAgentFleetAdoption") && sources.agentFleet.includes('status: "cancelled"')],
  ["agent fleet supports bounded fan-out presets", sources.agentFleet.includes("selectAgentFleetProfileIds") && sources.agentFleetLauncher.includes("presetBalanced")],
  ["agent fleet never auto-adopts a candidate", !sources.agentFleet.includes("agentWorktreeAdopt") && sources.workspace.includes("adoptParallelCandidate")],
  ["quick-open source-control command", sources.workspace.includes('changes: ["Source control"')],
  ["single global terminal surface", !sources.modeBar.includes("onOpenTerminal") && !sources.modeBar.includes("I.terminal")],
  ["workspace header omits duplicate cwd field", !sources.workspace.includes("atelier-cwd-input")],
  ["code workbench retains rooted breadcrumb", sources.editor.includes("<FileTree") && sources.editor.includes("relativePath(rootPath, selectedPath)")],
  ["sessions and profiles have distinct navigation icons", sources.app.includes("icon: I.sessions") && sources.app.includes("icon: I.profile")],
  ["global navigation icons are unique", navigationIcons.length > 0 && new Set(navigationIcons).size === navigationIcons.length],
  ["patch feedback is distinct from live preview", sources.app.includes('labelKo: "패치 & 제보"') && sources.app.includes("icon: I.report")],
  ["code and changes use purpose-specific icons", sources.modeBar.includes("I.code") && sources.modeBar.includes("I.changes")],
  ["distinct navigation icon definitions", ["sessions", "profile", "report", "plugin", "code", "changes", "worktree"].every((name) => sources.icons.includes(`${name}: (`))],
  ["isolated worktree avoids file-pane split icon", sources.workspace.includes("{I.worktree}")],
  ["hidden terminal initialization deferred", sources.terminal.includes("if (!isTerminalHostMeasurable(host)) return false")],
  ["terminal resize observer", sources.terminal.includes("new ResizeObserver")],
  ["backend workspace search wrapper", sources.tauri.includes("export async function searchWorkspaceFiles")],
  ["Codex model menu is an independent composer module", sources.workspace.includes('import CodexModelMenu from "./agent-composer/CodexModelMenu"')],
  ["workspace no longer owns Codex menu popover state", !sources.workspace.includes("showModelMenu") && !sources.workspace.includes("codexMenuPanel")],
  ["Codex menu resets state across session contexts", sources.codexModelMenu.includes("[contextKey]")],
  ["Codex menu constrains popover to available viewport", sources.codexModelMenu.includes("Math.min(480, Math.max(96, available))")],
  ["hidden code workbench releases global shortcuts", sources.editor.includes("isActive?: boolean") && sources.editor.includes("if (!isActive) return")],
  ["session inbox is an independent UI module", sources.workspace.includes('from "./session-inbox"') && sources.sessionInbox.includes("SessionInboxToolbar")],
  ["session inbox owns durable read state", sources.sessionInboxState.includes("SessionInboxReadState") && sources.sessionInboxState.includes("markSessionInboxItemUnread")],
  ["desktop notifications are independently owned", sources.workspace.includes('from "./desktop-notifications"') && sources.desktopNotifications.includes("useDesktopNotifications")],
  ["desktop notification permission is user initiated", sources.desktopNotifications.includes("requestPermission()") && sources.desktopNotifications.includes("const toggle = useCallback")],
  ["desktop notifications consume normalized transitions", sources.desktopNotificationState.includes("collectDesktopNotificationTransitions") && sources.desktopNotificationState.includes('task.phase !== "done"')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
