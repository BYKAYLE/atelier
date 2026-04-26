import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readDesignResource, saveDesignArtifact } from "../../../lib/tauri";
import { askDesignClaude, validateHtmlOutput } from "../designClaude";
import { PHILOSOPHIES, type DesignProject, type Philosophy } from "../useDesignProject";
import { phiToFile, stripHtmlFence } from "../utils";
import { useAutoTrigger, useAutoAdvance } from "../useAutoStage";

interface Props {
  project: DesignProject;
  onChange: (patch: Partial<DesignProject>) => void;
  onPrev: () => void;
  onNext: () => void;
  onPreview: (url: string) => void;
  dark: boolean;
}

/**
 * Stage 4 — App Screens (outputType === "app"일 때만 렌더).
 * Stage 3 flow markdown을 입력으로 device frame mockup 5~7개를 단일 HTML로 생성.
 */
export default function AppScreens({ project, onChange, onPrev, onNext, onPreview, dark }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const philLabel = (id: Philosophy) => PHILOSOPHIES.find((p) => p.id === id)?.label ?? id;
  const selected = project.selectedWireframe;

  useAutoTrigger(
    !!project.autoMode &&
      !!project.app?.flowMd &&
      !!selected &&
      !project.app?.screensPath &&
      !busy,
    () => generate(),
  );
  useAutoAdvance(
    !!project.autoMode && !!project.app?.screensPath && !busy,
    onNext,
  );

  async function generate() {
    if (!project.app?.flowMd) {
      setError("Stage 3 flow가 비어 있습니다.");
      return;
    }
    if (!selected) {
      setError("선택된 학파가 없습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sysPrompt = await readDesignResource("prompts/app/04-screens.md");
      const philosophyDoc = await readDesignResource(`philosophies/${phiToFile(selected)}.md`);
      const brand = await readDesignResource("brand/bykayle.md");
      const tailwindBase = await readDesignResource("component-library/00-tailwind-base.md");
      const componentButton = await readDesignResource("component-library/shadcn/01-button.md");
      const componentCard = await readDesignResource("component-library/shadcn/02-card.md");
      const componentInput = await readDesignResource("component-library/shadcn/03-input-form.md");
      const componentBadge = await readDesignResource("component-library/shadcn/04-badge-label.md");
      const componentNav = await readDesignResource("component-library/shadcn/05-navigation.md");
      const componentLibrary = [
        "### Tailwind Base",
        tailwindBase,
        "",
        "### Button",
        componentButton,
        "",
        "### Card",
        componentCard,
        "",
        "### Input + Form",
        componentInput,
        "",
        "### Badge + Label",
        componentBadge,
        "",
        "### Navigation",
        componentNav,
      ].join("\n");

      const userInput = [
        "## BRIEF",
        project.brief ?? "",
        "",
        "## PHILOSOPHY_NAME",
        selected,
        "",
        "## PHILOSOPHY_DOC",
        philosophyDoc,
        "",
        "## BRAND_PACK",
        brand,
        "",
        "## COMPONENT_LIBRARY",
        componentLibrary,
        "",
        "## APP_FLOW_MD",
        project.app.flowMd,
        "",
        "위 입력으로 App screens HTML 한 페이지를 출력하세요. device frame 안에 5~7개 화면을 정밀화합니다.",
      ].join("\n");

      const html = await askDesignClaude(sysPrompt, userInput);
      const cleaned = stripHtmlFence(html);
      validateHtmlOutput(cleaned);
      const savedPath = await saveDesignArtifact(
        project.projectId,
        `app/${selected}-screens.html`,
        cleaned,
      );
      onChange({
        app: {
          ...project.app,
          screensPath: savedPath,
          createdAt: Date.now(),
        },
      });
    } catch (e) {
      setError(`Screens 생성 실패: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function previewScreens() {
    if (!project.app?.screensPath) return;
    onPreview(convertFileSrc(project.app.screensPath));
  }

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442";
  const ready = !!project.app?.flowMd && !!selected;
  const generated = !!project.app?.screensPath;

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="design-app-screens">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Stage 4 · App</div>
        <div className={`text-[14px] font-medium ${ink}`}>Screens — device frame mockup</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          Stage 3 flow를 기반으로 5~7개 모바일 화면을 device frame 안에 단일 HTML로 정밀화합니다.
        </div>
      </div>

      <div className={`p-3 rounded-[8px] border ${surface}`}>
        <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-2`}>입력 flow</div>
        {project.app?.flowMd ? (
          <div className="flex flex-col gap-1">
            <div className={`text-[12px] font-medium ${ink}`}>
              {selected ? philLabel(selected) : "—"} · IA + 화면 정의 완료
            </div>
            <div className={`text-[10px] ${subtle}`}>{project.app.flowMd.length}자</div>
          </div>
        ) : (
          <div className={`text-[11px] ${subtle}`}>
            Stage 3에서 학파를 선택해 flow를 먼저 생성해주세요.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy || !ready}
          className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white disabled:opacity-40 whitespace-nowrap"
          style={{ background: accent }}
          data-testid="design-app-screens-generate"
        >
          {busy ? "Screens 생성 중…" : generated ? "재생성" : "Screens 생성"}
        </button>
        {generated && !busy && (
          <button
            type="button"
            onClick={previewScreens}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-app-screens-preview"
          >
            Preview ↗
          </button>
        )}
        <button
          type="button"
          onClick={onPrev}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
        >
          ← Flow
        </button>
        {generated && !busy && (
          <button
            type="button"
            onClick={onNext}
            className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
            data-testid="design-app-screens-next"
          >
            Review →
          </button>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-500 p-2 rounded-[4px] border border-red-300/40 bg-red-50/10">
          {error}
        </div>
      )}

      {generated && (
        <div className={`p-3 rounded-[8px] border ${surface}`} data-testid="design-app-screens-result">
          <div className={`text-[10px] uppercase tracking-wider ${subtle} mb-1`}>산출물</div>
          <div className={`text-[12px] ${ink} mb-1`}>App screens HTML 저장 완료</div>
          <div className={`text-[10px] font-mono truncate ${subtle}`} title={project.app?.screensPath ?? ""}>
            {(project.app?.screensPath ?? "").split("/").slice(-3).join("/")}
          </div>
        </div>
      )}
    </div>
  );
}

