import { useCallback, useEffect, useState } from "react";

/**
 * Atelier Design Wizard 프로젝트 상태.
 * Phase 1은 stage 1(Brief) + stage 3(Wireframe)만 사용. 2/4/5/6은 stub.
 */
export type Stage = 1 | 2 | 3 | 4 | 5 | 6;

export type Philosophy = "pentagram" | "field-io" | "kenya-hara" | "linear";

export const PHILOSOPHIES: { id: Philosophy; label: string; sub: string }[] = [
  { id: "pentagram", label: "정보 건축", sub: "Pentagram" },
  { id: "field-io", label: "운동 시학", sub: "Field.io" },
  { id: "kenya-hara", label: "동방 미니멀", sub: "Kenya Hara" },
  { id: "linear", label: "기능 정밀", sub: "Linear" },
];

export interface WireframeArtifact {
  /** Tauri save_design_artifact가 반환한 절대 경로 (file://로 preview 로드 시 사용) */
  path: string;
  /** 생성 시각 (ms) */
  createdAt: number;
}

export interface HifiArtifact {
  /** Tauri save_design_artifact가 반환한 절대 경로 */
  path: string;
  /** 어떤 wireframe(학파)을 기반으로 생성했는지 */
  basePhilosophy: Philosophy;
  /** 생성 시각 (ms) */
  createdAt: number;
}

export interface SystemArtifact {
  /** Brief에서 추출한 디자인 토큰 markdown */
  content: string;
  /** Tauri 저장 경로 (project/system/tokens.md) */
  path: string;
  /** "## 1. 추천 학파" 섹션에서 파싱한 학파. 모호하거나 미식별 시 undefined */
  recommendedPhilosophy?: Philosophy;
  createdAt: number;
}

export interface MotionArtifact {
  /** Hi-fi에 모션을 입힌 결과 HTML 절대 경로 */
  path: string;
  /** 생성 시점에 어떤 hifi(학파) 기반이었는지 */
  basePhilosophy: Philosophy;
  createdAt: number;
}

export interface ReviewArtifact {
  /** 평가 보고서 markdown */
  content: string;
  /** Tauri 저장 경로 (project/review/report.md) */
  path: string;
  /** 0~100 종합 점수 (LLM이 보고서 끝에 명시한 값을 파싱) */
  score?: number;
  createdAt: number;
}

export interface DesignProject {
  projectId: string;
  createdAt: number;
  stage: Stage;
  /** 사용자 자연어 입력 */
  briefInput: string;
  /** Stage 1 산출물 — 마크다운 PRD */
  brief?: string;
  /** Stage 2 산출물 — 디자인 토큰 markdown */
  system?: SystemArtifact;
  /** Stage 3에서 생성한 학파별 wireframe HTML 절대 경로 */
  wireframes: Partial<Record<Philosophy, WireframeArtifact>>;
  /** 사용자가 선택한 wireframe */
  selectedWireframe?: Philosophy;
  /** Stage 4 산출물 — 정밀 hi-fi HTML */
  hifi?: HifiArtifact;
  /** Stage 5 산출물 — 모션 입힌 HTML */
  motion?: MotionArtifact;
  /** Stage 6 산출물 — 평가 보고서 */
  review?: ReviewArtifact;
}

const KEY = (projectId: string) => `atelier.design.${projectId}`;
const ACTIVE_KEY = "atelier.design.activeProjectId";

function newProjectId(): string {
  // YYYYMMDD-HHMMSS-rand 형식. 사람이 읽을 수 있고 안전.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${rand}`;
}

function loadProject(projectId: string): DesignProject | null {
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignProject;
    // 후방 호환: wireframes 누락 시 초기화
    if (!parsed.wireframes) parsed.wireframes = {};
    // hifi는 optional이므로 별도 정규화 불필요. 형 안 맞으면 어차피 새로 생성.
    return parsed;
  } catch {
    return null;
  }
}

function saveProject(project: DesignProject) {
  try {
    localStorage.setItem(KEY(project.projectId), JSON.stringify(project));
    localStorage.setItem(ACTIVE_KEY, project.projectId);
  } catch {
    // ignore — quota 초과 등
  }
}

export function useDesignProject() {
  const [project, setProject] = useState<DesignProject>(() => {
    const activeId = localStorage.getItem(ACTIVE_KEY);
    if (activeId) {
      const p = loadProject(activeId);
      if (p) return p;
    }
    const id = newProjectId();
    return {
      projectId: id,
      createdAt: Date.now(),
      stage: 1,
      briefInput: "",
      wireframes: {},
    };
  });

  // 변경 시 자동 persist
  useEffect(() => {
    saveProject(project);
  }, [project]);

  const update = useCallback((patch: Partial<DesignProject>) => {
    setProject((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    const id = newProjectId();
    setProject({
      projectId: id,
      createdAt: Date.now(),
      stage: 1,
      briefInput: "",
      wireframes: {},
    });
  }, []);

  const setStage = useCallback((stage: Stage) => {
    setProject((prev) => ({ ...prev, stage }));
  }, []);

  return { project, update, reset, setStage };
}
