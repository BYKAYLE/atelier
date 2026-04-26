import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { readDesignResource, saveDesignArtifact } from "../../../lib/tauri";
import { askDesignClaude } from "../designClaude";
import type { DesignProject, Philosophy } from "../useDesignProject";
import { PHILOSOPHIES } from "../useDesignProject";
import { stripCodeFence } from "../utils";
import { useAutoTrigger, useAutoAdvance } from "../useAutoStage";

interface Props {
  project: DesignProject;
  onChange: (patch: Partial<DesignProject>) => void;
  onPrev: () => void;
  onNext: () => void;
  dark: boolean;
}

/**
 * Stage 2 — System (디자인 토큰).
 * Brief를 입력으로 학파 추천 + 색·타입·spacing·radius·motion·이미지·카피 토큰을 markdown으로 추출.
 * 결과는 사용자가 직접 수정 가능 (편집 모드). Stage 3 wireframe 생성 시 추가 입력으로 자동 주입.
 * "## 1. 추천 학파" 섹션은 파싱해서 Stage 3 카드에 "추천" 뱃지로 노출.
 */
export default function System({ project, onChange, onPrev, onNext, dark }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(project.system?.content ?? "");
  const [saving, setSaving] = useState(false);

  // Auto pipeline — useAutoStage hook으로 통합 (이전 useRef + useEffect 2개 패턴 대체)
  useAutoTrigger(
    !!project.autoMode && !!project.brief && !project.system && !busy,
    () => generate(),
  );
  useAutoAdvance(!!project.autoMode && !!project.system && !busy, onNext);

  async function generate() {
    if (!project.brief) {
      setError("Stage 1 Brief가 비어 있습니다. 먼저 Brief를 생성해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sysPrompt = await readDesignResource("prompts/02-system.md");
      const brand = await readDesignResource("brand/bykayle.md");
      const userInput = [
        "## BRIEF",
        project.brief,
        "",
        "## BRAND_PACK",
        brand,
        "",
        "위 입력으로 Stage 2 디자인 토큰 markdown을 출력하세요.",
      ].join("\n");
      const md = await askDesignClaude(sysPrompt, userInput);
      const cleaned = stripCodeFence(md);
      const savedPath = await saveDesignArtifact(project.projectId, "system/tokens.md", cleaned);
      const recommended = parseRecommendedPhilosophy(cleaned);
      onChange({
        system: {
          content: cleaned,
          path: savedPath,
          recommendedPhilosophy: recommended,
          createdAt: Date.now(),
        },
      });
      setDraft(cleaned);
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!project.system) return;
    setSaving(true);
    setError(null);
    try {
      const savedPath = await saveDesignArtifact(project.projectId, "system/tokens.md", draft);
      const recommended = parseRecommendedPhilosophy(draft);
      onChange({
        system: {
          content: draft,
          path: savedPath,
          recommendedPhilosophy: recommended,
          createdAt: Date.now(),
        },
      });
      setEditing(false);
    } catch (e) {
      setError(`저장 실패: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    setDraft(project.system?.content ?? "");
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(project.system?.content ?? "");
    setEditing(false);
  }

  async function copyTokens() {
    if (!project.system?.content) return;
    try {
      await navigator.clipboard.writeText(project.system.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError(`복사 실패: ${String(e)}`);
    }
  }

  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const surface = dark ? "bg-dmuted border-dline" : "bg-surface border-line";
  const accent = "#c96442";
  const recommended = project.system?.recommendedPhilosophy;
  const recommendedLabel = recommended
    ? PHILOSOPHIES.find((p) => p.id === recommended)?.label ?? recommended
    : null;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <div className={`text-[11px] uppercase tracking-wider ${subtle}`}>Stage 2</div>
        <div className={`text-[14px] font-medium ${ink}`}>System — 디자인 토큰</div>
        <div className={`text-[11px] mt-1 ${subtle}`}>
          Brief 톤·페르소나·도메인을 분석해 추천 학파 + 색·타입·spacing·motion·이미지·카피 토큰을 생성합니다.
          편집해서 직접 다듬을 수 있고, Stage 3 Wireframe에서 자동 입력으로 사용됩니다.
        </div>
      </div>

      {!project.brief && (
        <div className={`text-[11px] p-2 rounded-[4px] border ${surface} ${subtle}`}>
          Stage 1 Brief가 비어 있습니다. 먼저 Brief를 생성해주세요.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy || !project.brief || editing}
          className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white disabled:opacity-40 transition-opacity whitespace-nowrap"
          style={{ background: accent }}
          data-testid="design-system-generate"
        >
          {busy ? "토큰 추출 중…" : project.system ? "재추출" : "토큰 추출"}
        </button>
        <button
          type="button"
          onClick={onPrev}
          className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
        >
          ← Brief
        </button>
        {project.system && !busy && !editing && (
          <>
            <button
              type="button"
              onClick={onNext}
              className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border transition-colors whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
              data-testid="design-system-next"
            >
              Wireframe →
            </button>
            <button
              type="button"
              onClick={startEdit}
              className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
              data-testid="design-system-edit"
            >
              편집
            </button>
            <button
              type="button"
              onClick={copyTokens}
              title={copied ? "복사됨" : "디자인 토큰 markdown 복사"}
              aria-label="디자인 토큰 복사"
              className={`h-9 w-9 inline-flex items-center justify-center rounded-[6px] border transition-colors ${
                copied
                  ? "border-emerald-500/40 text-emerald-500"
                  : dark
                    ? "border-dline text-dsub hover:text-dink hover:bg-[#2a2a28]"
                    : "border-line text-sub hover:text-ink hover:bg-muted"
              }`}
              data-testid="design-system-copy"
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </>
        )}
        {editing && (
          <>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="h-9 px-4 rounded-[6px] text-[12px] font-medium text-white whitespace-nowrap disabled:opacity-40"
              style={{ background: accent }}
              data-testid="design-system-save"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className={`h-9 px-4 rounded-[6px] text-[12px] font-medium border whitespace-nowrap ${dark ? "border-dline text-dink hover:bg-[#2a2a28]" : "border-line text-ink hover:bg-muted"}`}
              data-testid="design-system-cancel"
            >
              취소
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-500 p-2 rounded-[4px] border border-red-300/40 bg-red-50/10">
          {error}
        </div>
      )}

      {recommendedLabel && !editing && (
        <div
          className={`p-2.5 rounded-[6px] border flex items-center gap-2 ${surface}`}
          data-testid="design-system-recommended"
          style={{ boxShadow: `0 0 0 1px ${accent}` }}
        >
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-[4px] uppercase tracking-wider"
            style={{ background: accent, color: "#fff" }}
          >
            추천 학파
          </span>
          <span className={`text-[12px] font-medium ${ink}`}>{recommendedLabel}</span>
          <span className={`text-[10px] ${subtle}`}>· Stage 3에서 자동 하이라이트됩니다</span>
        </div>
      )}

      {project.system && editing && (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`w-full text-[12px] p-3 rounded-[8px] border resize-y font-mono ${surface} ${ink} leading-[1.5]`}
          style={{ minHeight: "60vh" }}
          data-testid="design-system-editor"
          placeholder="디자인 토큰 markdown을 직접 편집하세요."
        />
      )}

      {project.system && !editing && (
        <div
          className={`mt-2 p-3 rounded-[8px] border overflow-auto ${surface} ${ink}`}
          style={{ maxHeight: "60vh", fontSize: 12, lineHeight: 1.55 }}
          data-testid="design-system-result"
        >
          <div className="atelier-markdown">
            <ReactMarkdown>{project.system.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "## 1. 추천 학파" 섹션 본문에서 학파 키워드 1개를 파싱.
 * 예: "## 1. 추천 학파\n정확히 1개 선택: pentagram"  → "pentagram"
 *      "## 1. 추천 학파\n**field-io** — 시뮬레이터..." → "field-io"
 * 모호하거나 미식별 시 undefined.
 */
function parseRecommendedPhilosophy(md: string): Philosophy | undefined {
  // 섹션 헤더 매칭은 "## 1. 추천 학파" 또는 "## 추천 학파" 모두 허용
  const idx = md.search(/##\s*(?:1\.\s*)?추천\s*학파/);
  if (idx < 0) return undefined;
  // 다음 ## 헤더 직전까지를 섹션 본문으로 자름
  const rest = md.slice(idx);
  const nextHeader = rest.search(/\n##\s+/);
  const body = nextHeader < 0 ? rest : rest.slice(0, nextHeader);
  // 학파 키워드 첫 등장 검출 (대소문자 무관)
  const order: Philosophy[] = ["pentagram", "field-io", "kenya-hara", "linear"];
  let earliestIdx = Infinity;
  let earliestPhi: Philosophy | undefined;
  for (const phi of order) {
    const re = new RegExp(`\\b${phi.replace("-", "[\\-_]?")}\\b`, "i");
    const m = body.match(re);
    if (m && m.index !== undefined && m.index < earliestIdx) {
      earliestIdx = m.index;
      earliestPhi = phi;
    }
  }
  return earliestPhi;
}
