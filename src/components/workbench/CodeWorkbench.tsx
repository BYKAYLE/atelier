import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cls } from "../../lib/tokens";
import {
  AgentEditorSnapshot,
  agentEditorSnapshot,
  agentEditorWrite,
  FsEntry,
  isTauri,
  readTextFile,
  searchWorkspaceFiles,
} from "../../lib/tauri";
import FileTree from "../FileTree";
import { I } from "../Icons";
import {
  classifyExternalEditorChange,
  collectEditorDiagnostics,
  EDITOR_AUTOSAVE_DELAY_MS,
  EDITOR_SAVE_POLICY_STORAGE_KEY,
  EDITOR_SNAPSHOT_POLL_MS,
  EditorDiagnostic,
  EditorDiagnosticsButton,
  EditorDiagnosticsPanel,
  EditorExternalChangeBanner,
  EditorSavePolicy,
  EditorSavePolicyToggle,
  normalizeEditorSavePolicy,
  shouldScheduleEditorAutosave,
} from "../editor-diagnostics";
import {
  defaultsToRichPreview,
  requiresRichPreview,
  RichPreviewHint,
  RichPreviewPane,
  richPreviewHintForPath,
  supportsRichPreview,
} from "../rich-preview";

interface Props {
  dark: boolean;
  language: "ko" | "en";
  rootPath: string;
  initialPath?: string | null;
  initialLine?: number | null;
  onSaved?: () => void;
}

interface EditorTab {
  path: string;
  name: string;
  contents: string;
  savedContents: string;
  loading: boolean;
  previewHint: RichPreviewHint;
  previewOpen: boolean;
  diskSnapshot: AgentEditorSnapshot | null;
  externalConflict: AgentEditorSnapshot | null;
}

const CodeWorkbench: React.FC<Props> = ({ dark, language, rootPath, initialPath, initialLine, onSaved }) => {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FsEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [treeVisible, setTreeVisible] = useState(true);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [savePolicy, setSavePolicy] = useState<EditorSavePolicy>(loadStoredSavePolicy);
  const tabsRef = useRef<EditorTab[]>([]);
  const openingRef = useRef(new Set<string>());
  const lastInitialTargetRef = useRef<string | null>(null);
  const pendingInitialLocationRef = useRef<{ path: string; line: number } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const copy = language === "en"
    ? {
        search: "Quick open files",
        files: "Files",
        hideFiles: "Hide files",
        showFiles: "Show files",
        empty: "Choose a file from the project to inspect or edit it.",
        unavailable: "File editing is available in the installed Atelier app.",
        save: "Save",
        saving: "Saving...",
        saved: "Saved",
        autosaved: "Auto saved",
        saveConflict: "Save paused because the file changed on disk.",
        reloaded: "Reloaded the latest disk version",
        keeping: "Keeping your edits against the latest disk version",
        dirty: "Unsaved draft",
        lines: "lines",
        noResults: "No matching files",
        closeDirty: "This tab has unsaved changes. Close it anyway?",
        preview: "Preview file",
        edit: "Edit source",
      }
    : {
        search: "파일 빠르게 열기",
        files: "파일",
        hideFiles: "파일 목록 숨기기",
        showFiles: "파일 목록 보이기",
        empty: "프로젝트 파일을 선택하면 여기서 확인하고 편집할 수 있습니다.",
        unavailable: "파일 편집은 설치된 Atelier 앱에서 사용할 수 있습니다.",
        save: "저장",
        saving: "저장 중...",
        saved: "저장됨",
        autosaved: "자동 저장됨",
        saveConflict: "디스크 파일이 변경되어 저장을 중지했습니다.",
        reloaded: "최신 디스크 버전을 불러왔습니다",
        keeping: "최신 디스크 버전을 기준으로 내 편집을 유지합니다",
        dirty: "저장하지 않은 초안",
        lines: "줄",
        noResults: "일치하는 파일 없음",
        closeDirty: "저장하지 않은 변경사항이 있습니다. 이 탭을 닫을까요?",
        preview: "파일 미리보기",
        edit: "소스 편집",
      };

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.path === activePath) || null,
    [activePath, tabs],
  );
  const selectedPath = activeTab?.path || null;
  const selectedName = activeTab?.name || "";
  const contents = activeTab?.contents || "";
  const dirty = Boolean(activeTab && activeTab.contents !== activeTab.savedContents);
  const previewRequired = Boolean(activeTab && requiresRichPreview(activeTab.path));
  const lineCount = useMemo(() => (contents.length === 0 ? 1 : contents.split("\n").length), [contents]);
  const languageLabel = useMemo(() => fileLanguage(selectedName), [selectedName]);
  const diagnostics = useMemo(
    () => selectedPath ? collectEditorDiagnostics(selectedPath, contents) : [],
    [contents, selectedPath],
  );

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const openFile = useCallback(async (path: string, name: string) => {
    if (!isTauri()) {
      setError(copy.unavailable);
      return;
    }
    if (tabsRef.current.some((tab) => tab.path === path)) {
      setActivePath(path);
      setError(null);
      setNotice(null);
      window.requestAnimationFrame(() => editorRef.current?.focus());
      return;
    }
    if (openingRef.current.has(path)) return;
    openingRef.current.add(path);
    const previewHint = richPreviewHintForPath(path);
    const binaryPreview = requiresRichPreview(path);
    const pending: EditorTab = {
      path,
      name,
      contents: "",
      savedContents: "",
      loading: !binaryPreview,
      previewHint,
      previewOpen: defaultsToRichPreview(path),
      diskSnapshot: null,
      externalConflict: null,
    };
    tabsRef.current = [...tabsRef.current, pending];
    setTabs(tabsRef.current);
    setActivePath(path);
    setError(null);
    setNotice(null);
    if (binaryPreview) {
      openingRef.current.delete(path);
      return;
    }
    try {
      const [diskContents, diskSnapshot] = await Promise.all([
        readTextFile(path),
        agentEditorSnapshot(rootPath, path),
      ]);
      setTabs((current) => current.map((tab) => (
        tab.path === path
          ? {
              ...tab,
              contents: diskContents,
              savedContents: diskContents,
              loading: false,
              diskSnapshot,
              externalConflict: null,
            }
          : tab
      )));
      window.requestAnimationFrame(() => editorRef.current?.focus());
    } catch (nextError) {
      setTabs((current) => current.filter((tab) => tab.path !== path));
      setActivePath((current) => (current === path ? null : current));
      setError(String(nextError));
    } finally {
      openingRef.current.delete(path);
    }
  }, [copy.unavailable, rootPath]);

  const saveFile = useCallback(async (automatic = false) => {
    if (!activeTab || previewRequired || !dirty || saving || activeTab.externalConflict) return;
    const contentsToSave = activeTab.contents;
    const expectedContentSha256 = activeTab.diskSnapshot?.contentSha256 || null;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await agentEditorWrite(
        rootPath,
        activeTab.path,
        contentsToSave,
        expectedContentSha256,
      );
      if (result.conflict || !result.written) {
        setTabs((current) => current.map((tab) => (
          tab.path === activeTab.path
            ? { ...tab, externalConflict: result.snapshot }
            : tab
        )));
        setError(null);
        setNotice(copy.saveConflict);
        return;
      }
      setTabs((current) => current.map((tab) => (
        tab.path === activeTab.path
          ? {
              ...tab,
              savedContents: contentsToSave,
              diskSnapshot: result.snapshot,
              externalConflict: null,
            }
          : tab
      )));
      setNotice(automatic ? copy.autosaved : copy.saved);
      onSaved?.();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setSaving(false);
    }
  }, [
    activeTab,
    copy.autosaved,
    copy.saveConflict,
    copy.saved,
    dirty,
    onSaved,
    previewRequired,
    rootPath,
    saving,
  ]);

  const reloadActiveFile = useCallback(async () => {
    if (!activeTab || !activeTab.externalConflict?.exists) return;
    setError(null);
    try {
      const [diskContents, diskSnapshot] = await Promise.all([
        readTextFile(activeTab.path),
        agentEditorSnapshot(rootPath, activeTab.path),
      ]);
      setTabs((current) => current.map((tab) => (
        tab.path === activeTab.path
          ? {
              ...tab,
              contents: diskContents,
              savedContents: diskContents,
              diskSnapshot,
              externalConflict: null,
            }
          : tab
      )));
      setNotice(copy.reloaded);
    } catch (nextError) {
      setError(String(nextError));
    }
  }, [activeTab, copy.reloaded, rootPath]);

  const keepActiveEdits = useCallback(() => {
    if (!activeTab?.externalConflict?.exists) return;
    setTabs((current) => current.map((tab) => (
      tab.path === activeTab.path
        ? {
            ...tab,
            diskSnapshot: tab.externalConflict,
            externalConflict: null,
          }
        : tab
    )));
    setError(null);
    setNotice(copy.keeping);
  }, [activeTab, copy.keeping]);

  const selectDiagnostic = useCallback((diagnostic: EditorDiagnostic) => {
    if (!activeTab || activeTab.previewOpen) return;
    const lines = activeTab.contents.split("\n");
    const targetLine = Math.min(diagnostic.line, Math.max(1, lines.length));
    let offset = 0;
    for (let index = 0; index < targetLine - 1; index += 1) offset += lines[index].length + 1;
    offset += Math.max(0, diagnostic.column - 1);
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(offset, offset);
      const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 20;
      editor.scrollTop = Math.max(0, (targetLine - 1) * lineHeight - editor.clientHeight / 3);
      if (gutterRef.current) gutterRef.current.scrollTop = editor.scrollTop;
    });
  }, [activeTab]);

  useEffect(() => {
    try {
      window.localStorage.setItem(EDITOR_SAVE_POLICY_STORAGE_KEY, savePolicy);
    } catch {
      // Storage may be unavailable in a hardened webview; the in-memory policy still works.
    }
  }, [savePolicy]);

  useEffect(() => {
    if (!shouldScheduleEditorAutosave({
      policy: savePolicy,
      dirty,
      saving,
      previewOpen: Boolean(activeTab?.previewOpen),
      hasConflict: Boolean(activeTab?.externalConflict),
    })) return;
    const timer = window.setTimeout(() => {
      saveFile(true).catch(console.error);
    }, EDITOR_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeTab?.externalConflict, activeTab?.previewOpen, dirty, saveFile, savePolicy, saving]);

  useEffect(() => {
    if (!activeTab || activeTab.loading || previewRequired || !isTauri()) return;
    let cancelled = false;
    let checking = false;

    const checkDisk = async () => {
      if (checking || cancelled) return;
      checking = true;
      try {
        const snapshot = await agentEditorSnapshot(rootPath, activeTab.path);
        if (cancelled) return;
        const currentTab = tabsRef.current.find((tab) => tab.path === activeTab.path);
        if (!currentTab) return;
        const currentDirty = currentTab.contents !== currentTab.savedContents;
        const decision = classifyExternalEditorChange(currentTab.diskSnapshot, snapshot, currentDirty);
        if (decision === "establish") {
          setTabs((current) => current.map((tab) => (
            tab.path === activeTab.path ? { ...tab, diskSnapshot: snapshot } : tab
          )));
        } else if (decision === "conflict") {
          setTabs((current) => current.map((tab) => (
            tab.path === activeTab.path ? { ...tab, externalConflict: snapshot } : tab
          )));
        } else if (decision === "reload") {
          const diskContents = await readTextFile(activeTab.path);
          const confirmedSnapshot = await agentEditorSnapshot(rootPath, activeTab.path);
          if (cancelled || classifyExternalEditorChange(snapshot, confirmedSnapshot, false) !== "unchanged") return;
          setTabs((current) => current.map((tab) => (
            tab.path === activeTab.path && tab.contents === tab.savedContents
              ? {
                  ...tab,
                  contents: diskContents,
                  savedContents: diskContents,
                  diskSnapshot: confirmedSnapshot,
                  externalConflict: null,
                }
              : tab
          )));
          setNotice(copy.reloaded);
        }
      } catch (nextError) {
        if (!cancelled) console.warn("editor snapshot check failed", nextError);
      } finally {
        checking = false;
      }
    };

    const timer = window.setInterval(() => {
      checkDisk().catch(console.error);
    }, EDITOR_SNAPSHOT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTab?.loading, activeTab?.path, copy.reloaded, previewRequired, rootPath]);

  const closeTab = useCallback((path: string) => {
    const currentTabs = tabsRef.current;
    const index = currentTabs.findIndex((tab) => tab.path === path);
    if (index < 0) return;
    const target = currentTabs[index];
    if (target.contents !== target.savedContents && !window.confirm(copy.closeDirty)) return;
    const nextTabs = currentTabs.filter((tab) => tab.path !== path);
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    if (activePath === path) {
      setActivePath(nextTabs[Math.min(index, Math.max(0, nextTabs.length - 1))]?.path || null);
    }
  }, [activePath, copy.closeDirty]);

  useEffect(() => {
    if (!initialPath) return;
    const line = Math.max(1, Math.floor(initialLine || 1));
    const target = `${initialPath}:${line}`;
    if (target === lastInitialTargetRef.current) return;
    lastInitialTargetRef.current = target;
    pendingInitialLocationRef.current = { path: initialPath, line };
    const name = initialPath.replace(/\\/g, "/").split("/").pop() || initialPath;
    openFile(initialPath, name).catch(console.error);
  }, [initialLine, initialPath, openFile]);

  useEffect(() => {
    const pending = pendingInitialLocationRef.current;
    if (!pending || pending.path !== activePath || activeTab?.loading) return;
    if (activeTab && requiresRichPreview(activeTab.path)) {
      pendingInitialLocationRef.current = null;
      return;
    }
    if (activeTab?.previewOpen && !requiresRichPreview(activeTab.path)) {
      setTabs((current) => current.map((tab) => (
        tab.path === activeTab.path ? { ...tab, previewOpen: false } : tab
      )));
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    const lines = contents.split("\n");
    const targetLine = Math.min(pending.line, Math.max(1, lines.length));
    let offset = 0;
    for (let index = 0; index < targetLine - 1; index += 1) offset += lines[index].length + 1;
    pendingInitialLocationRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(offset, offset);
      const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 20;
      editor.scrollTop = Math.max(0, (targetLine - 1) * lineHeight - editor.clientHeight / 3);
      if (gutterRef.current) gutterRef.current.scrollTop = editor.scrollTop;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePath, activeTab?.loading, activeTab?.path, activeTab?.previewOpen, contents]);

  useEffect(() => {
    if (!rootPath) return;
    const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
    const inRoot = (path: string) => {
      const normalizedFile = path.replace(/\\/g, "/");
      return normalizedFile.startsWith(`${normalizedRoot}/`) || normalizedFile === normalizedRoot;
    };
    const nextTabs = tabsRef.current.filter((tab) => inRoot(tab.path));
    if (nextTabs.length !== tabsRef.current.length) {
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      setActivePath((current) => current && inRoot(current) ? current : nextTabs[0]?.path || null);
    }
    lastInitialTargetRef.current = null;
    pendingInitialLocationRef.current = null;
  }, [rootPath]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || !rootPath || !isTauri()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchWorkspaceFiles(rootPath, query, 80)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch((nextError) => {
          if (!cancelled) setError(String(nextError));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rootPath, searchQuery]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveFile().catch(console.error);
      }
    };
    const onQuickOpen = () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("atelier:code-quick-open", onQuickOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("atelier:code-quick-open", onQuickOpen);
    };
  }, [saveFile]);

  return (
    <section className={cls("atelier-code-workbench", dark ? "bg-dbg" : "bg-cream")} data-testid="code-workbench">
      <header className={cls("atelier-code-toolbar border-b", dark ? "border-dline" : "border-line")}>
        <button
          type="button"
          className={cls("atelier-code-icon-button", dark ? "text-dsub hover:text-dink" : "text-sub hover:text-ink")}
          onClick={() => setTreeVisible((visible) => !visible)}
          title={treeVisible ? copy.hideFiles : copy.showFiles}
          aria-label={treeVisible ? copy.hideFiles : copy.showFiles}
        >
          {I.split}
        </button>
        <label className={cls("atelier-code-search", dark ? "bg-dmuted text-dink" : "bg-surface text-ink")}>
          {I.search}
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={copy.search}
            spellCheck={false}
          />
          <kbd>⌘P</kbd>
        </label>
        <div className="atelier-code-file-meta">
          {selectedName && <span className="atelier-code-file-name">{selectedName}</span>}
          {selectedName && <span className={dark ? "text-dsub" : "text-sub"}>{languageLabel}</span>}
          {dirty && <span className="atelier-code-dirty" title={copy.dirty} />}
        </div>
        {activeTab && !previewRequired && (
          <EditorSavePolicyToggle
            dark={dark}
            language={language}
            policy={savePolicy}
            onChange={setSavePolicy}
          />
        )}
        {activeTab && !previewRequired && (
          <EditorDiagnosticsButton
            dark={dark}
            language={language}
            count={diagnostics.length}
            open={diagnosticsOpen}
            onClick={() => setDiagnosticsOpen((open) => !open)}
          />
        )}
        {activeTab && supportsRichPreview(activeTab.path) && (
          <button
            type="button"
            className={cls(
              "atelier-code-icon-button",
              activeTab.previewOpen && "atelier-code-icon-button-active",
              dark ? "text-dsub hover:text-dink" : "text-sub hover:text-ink",
            )}
            onClick={() => {
              if (previewRequired) return;
              setTabs((current) => current.map((tab) => (
                tab.path === activeTab.path ? { ...tab, previewOpen: !tab.previewOpen } : tab
              )));
            }}
            title={activeTab.previewOpen ? copy.edit : copy.preview}
            aria-label={activeTab.previewOpen ? copy.edit : copy.preview}
            aria-pressed={activeTab.previewOpen}
          >
            {activeTab.previewOpen ? I.eyeOff : I.eye}
          </button>
        )}
        <button
          type="button"
          onClick={() => saveFile().catch(console.error)}
          disabled={previewRequired || !dirty || saving}
          className={cls(
            "atelier-code-save-button",
            dark ? "border-dline text-dink disabled:text-dsub" : "border-line text-ink disabled:text-sub",
          )}
        >
          {saving ? copy.saving : copy.save}
        </button>
      </header>

      {tabs.length > 0 && (
        <div className={cls("atelier-code-tabs border-b", dark ? "border-dline" : "border-line")}>
          {tabs.map((tab) => {
            const tabDirty = tab.contents !== tab.savedContents;
            const active = tab.path === activePath;
            return (
              <div
                key={tab.path}
                className={cls(
                  "atelier-code-tab",
                  active
                    ? dark ? "atelier-code-tab-active-dark" : "atelier-code-tab-active-light"
                    : dark ? "text-dsub hover:text-dink" : "text-sub hover:text-ink",
                )}
                title={tab.path}
              >
                <button
                  type="button"
                  className="atelier-code-tab-select"
                  onClick={() => {
                    setActivePath(tab.path);
                    setError(null);
                    setNotice(null);
                    if (!tab.previewOpen) window.requestAnimationFrame(() => editorRef.current?.focus());
                  }}
                >
                  <span>{tab.name}</span>
                </button>
                {tabDirty && <span className="atelier-code-tab-dirty" aria-label={copy.dirty} />}
                <button
                  type="button"
                  className="atelier-code-tab-close"
                  onClick={() => closeTab(tab.path)}
                  aria-label={`${tab.name} close`}
                >
                  {I.x}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="atelier-code-body">
        {treeVisible && (
          <aside className={cls("atelier-code-sidebar border-r", dark ? "border-dline" : "border-line")}>
            {searchQuery.trim() ? (
              <div className="atelier-code-search-results">
                {searching && <div className="atelier-code-sidebar-state">...</div>}
                {!searching && searchResults.length === 0 && (
                  <div className="atelier-code-sidebar-state">{copy.noResults}</div>
                )}
                {searchResults.map((entry) => (
                  <button
                    type="button"
                    key={entry.path}
                    className={cls(
                      "atelier-code-search-result",
                      selectedPath === entry.path
                        ? dark ? "bg-[#343432] text-dink" : "bg-line text-ink"
                        : dark ? "text-dink hover:bg-[#2a2a28]" : "text-ink hover:bg-muted",
                    )}
                    onClick={() => openFile(entry.path, entry.name).catch(console.error)}
                    title={entry.path}
                  >
                    <span>{entry.name}</span>
                    <small>{relativePath(rootPath, entry.path)}</small>
                  </button>
                ))}
              </div>
            ) : (
              <FileTree
                dark={dark}
                rootPath={rootPath}
                selectedPath={selectedPath}
                onOpenFile={(path, name) => openFile(path, name).catch(console.error)}
              />
            )}
          </aside>
        )}

        <div className="atelier-code-editor-shell">
          {error && <div className="atelier-editor-error-banner">{error}</div>}
          {activeTab?.externalConflict && (
            <EditorExternalChangeBanner
              dark={dark}
              language={language}
              snapshot={activeTab.externalConflict}
              dirty={dirty}
              onReload={() => reloadActiveFile().catch(console.error)}
              onKeep={keepActiveEdits}
            />
          )}
          {selectedPath && diagnosticsOpen && !activeTab?.previewOpen && (
            <EditorDiagnosticsPanel
              dark={dark}
              language={language}
              diagnostics={diagnostics}
              onSelect={selectDiagnostic}
            />
          )}
          {!selectedPath ? (
            <div className={cls("atelier-workbench-empty", dark ? "text-dsub" : "text-sub")}>
              <span className="atelier-workbench-empty-icon">{I.split}</span>
              <p>{copy.empty}</p>
            </div>
          ) : activeTab?.loading ? (
            <div className="atelier-workbench-empty">...</div>
          ) : activeTab?.previewOpen ? (
            <RichPreviewPane
              dark={dark}
              language={language}
              rootPath={rootPath}
              path={activeTab.path}
              textOverride={activeTab.previewHint === "markdown" || activeTab.previewHint === "text" ? contents : undefined}
              onClose={previewRequired ? undefined : () => {
                setTabs((current) => current.map((tab) => (
                  tab.path === activeTab.path ? { ...tab, previewOpen: false } : tab
                )));
                window.requestAnimationFrame(() => editorRef.current?.focus());
              }}
            />
          ) : (
            <>
              <div className="atelier-code-editor">
                {lineCount <= 5000 && (
                  <pre ref={gutterRef} aria-hidden="true" className="atelier-code-gutter">
                    {Array.from({ length: lineCount }, (_, index) => index + 1).join("\n")}
                  </pre>
                )}
                <textarea
                  ref={editorRef}
                  value={contents}
                  onChange={(event) => {
                    const nextContents = event.target.value;
                    setTabs((current) => current.map((tab) => (
                      tab.path === activePath ? { ...tab, contents: nextContents } : tab
                    )));
                    setNotice(null);
                  }}
                  onScroll={(event) => {
                    if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
                  }}
                  className={cls("atelier-code-textarea", lineCount > 5000 && "atelier-code-textarea-no-gutter")}
                  wrap="off"
                  spellCheck={false}
                  aria-label={selectedName}
                />
              </div>
              <footer className={cls("atelier-code-status border-t", dark ? "border-dline text-dsub" : "border-line text-sub")}>
                <span>{relativePath(rootPath, selectedPath)}</span>
                <span>{lineCount.toLocaleString()} {copy.lines}</span>
                <span>{notice || (dirty ? copy.dirty : copy.saved)}</span>
              </footer>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

function relativePath(root: string, path: string): string {
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedPath = path.replace(/\\/g, "/");
  return normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : normalizedPath;
}

function fileLanguage(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() || "text";
  const labels: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript React",
    js: "JavaScript",
    jsx: "JavaScript React",
    rs: "Rust",
    py: "Python",
    json: "JSON",
    md: "Markdown",
    css: "CSS",
    html: "HTML",
    yaml: "YAML",
    yml: "YAML",
    toml: "TOML",
    sh: "Shell",
  };
  return labels[extension] || extension.toUpperCase();
}

function loadStoredSavePolicy(): EditorSavePolicy {
  try {
    return normalizeEditorSavePolicy(window.localStorage.getItem(EDITOR_SAVE_POLICY_STORAGE_KEY));
  } catch {
    return "manual";
  }
}

export default CodeWorkbench;
