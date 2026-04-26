import { useCallback, useEffect, useState } from "react";

/**
 * Atelier Design Wizard 프로젝트 상태.
 * Phase 1은 stage 1(Brief) + stage 3(Wireframe)만 사용. 2/4/5/6은 stub.
 */
export type Stage = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * 산출물 종류. Stage 3·4·5의 출력 형태가 종류에 따라 분기된다.
 * - web: 단일 HTML 페이지 (현재 기본)
 * - ci: 로고 SVG + 컬러·타이포 markdown + 응용 예시 (브랜드 아이덴티티)
 * - app/print: 후속 확장 슬롯
 */
export type OutputType = "web" | "ci" | "app" | "print";

export const OUTPUT_TYPES: { id: OutputType; label: string; sub: string; active: boolean; beta?: boolean }[] = [
  { id: "web", label: "웹 랜딩", sub: "단일 HTML 페이지", active: true },
  { id: "app", label: "앱 화면", sub: "모바일/웹앱 mockup", active: true },
  { id: "print", label: "인쇄물", sub: "포스터·명함·카탈로그", active: true },
  { id: "ci", label: "CI / 브랜드", sub: "로고·컬러·타이포 시스템", active: true, beta: true },
];

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

/**
 * CI(브랜드 아이덴티티) 산출물.
 * Stage 3 = 시스템(컬러/타이포/로고 컨셉) markdown
 * Stage 4 = 정밀화된 자산 묶음 (logo SVG + 응용 예시)
 */
export interface CIArtifact {
  /** 시스템 markdown (컬러/타이포/로고 가이드) */
  systemMd: string;
  /** logo primary SVG (인라인 문자열) */
  logoSvg?: string;
  /** 응용 예시 markdown (명함·SNS·레터헤드 mockup HTML 묶음) */
  applicationsMd?: string;
  /** Tauri 저장 베이스 경로 (project/ci/) */
  basePath: string;
  createdAt: number;
}

export interface AppArtifact {
  /** Stage 3 flow markdown (IA + 화면 정의 + 컴포넌트 인벤토리) */
  flowMd: string;
  /** Stage 4 screens HTML 절대 경로 (device frame mockup) */
  screensPath?: string;
  basePath: string;
  createdAt: number;
}

export interface PrintArtifact {
  /** Stage 3 layout markdown (사이즈·grid·구조 정의) */
  layoutMd: string;
  /** Stage 4 final HTML 절대 경로 (인쇄용 SVG/HTML) */
  finalPath?: string;
  basePath: string;
  createdAt: number;
}

/** 명확화 질문 옵션 */
export interface QuestionOption {
  value: string;
  label: string;
  hint?: string;
}

/** 1A 단계 — LLM이 brief를 분석해 생성한 명확화 질문 1개 */
export interface BriefQuestion {
  id: string;
  title: string;
  subtitle?: string;
  type: "single-choice" | "multi-choice" | "free-text";
  options?: QuestionOption[];
  placeholder?: string;
  axis?: string;
}

/** 사용자 답변 — id별로 string(single/free) 또는 string[](multi) */
export type BriefAnswers = Record<string, string | string[]>;

export interface DesignProject {
  projectId: string;
  createdAt: number;
  stage: Stage;
  /** 산출물 종류 — Stage 3·4 분기. 기본 "web" (기존 동작 호환) */
  outputType: OutputType;
  /** 자동 파이프라인 모드 — true면 Stage 2~6이 사용자 클릭 없이 순차 자동 실행. Stage 3 학파 선택만 사용자 입력. */
  autoMode?: boolean;
  /** 사용자 자연어 입력 */
  briefInput: string;
  /** Stage 1A — LLM이 생성한 명확화 질문지 */
  briefQuestions?: BriefQuestion[];
  /** Stage 1A — 사용자 답변 */
  briefAnswers?: BriefAnswers;
  /** Stage 1 산출물 — 마크다운 PRD (1A 답변 + briefInput 합쳐 1B에서 생성) */
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
  /** CI 모드 산출물 (outputType === "ci"일 때만 사용). web 모드와 wireframes/hifi 슬롯 분리. */
  ci?: CIArtifact;
  /** App 모드 산출물 */
  app?: AppArtifact;
  /** Print 모드 산출물 */
  print?: PrintArtifact;
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
    // 후방 호환: wireframes/outputType 누락 시 초기화
    if (!parsed.wireframes) parsed.wireframes = {};
    if (!parsed.outputType) parsed.outputType = "web";
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
      outputType: "web",
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
      outputType: "web",
      briefInput: "",
      wireframes: {},
    });
  }, []);

  const setStage = useCallback((stage: Stage) => {
    setProject((prev) => ({ ...prev, stage }));
  }, []);

  return { project, update, reset, setStage };
}
