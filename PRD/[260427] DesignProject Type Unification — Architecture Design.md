# DesignProject 타입 통합 — Architecture Design Document

**작성일**: 2026-04-27
**대상**: 디자인 모드 활성화 재개 시 즉시 실행 가능한 설계도
**현재 상태**: 보류 — 코드 변경 0, 설계만
**목적**: 출력 종류(web/ci/app/print) 추가 시 슬롯 폭증을 막고 단일 통합 구조로 확장 가능하게 설계

---

## 1. 현재 구조 (As-Is)

`useDesignProject.ts`의 `DesignProject` 인터페이스는 **출력 종류별로 분리된 슬롯 6개**가 평면적으로 누적:

```typescript
interface DesignProject {
  projectId: string;
  outputType: OutputType;
  briefInput: string;
  briefQuestions?: BriefQuestion[];
  briefAnswers?: BriefAnswers;
  brief?: string;
  system?: SystemArtifact;
  // ↓ web 모드 슬롯
  wireframes: Partial<Record<Philosophy, WireframeArtifact>>;
  selectedWireframe?: Philosophy;
  hifi?: HifiArtifact;
  motion?: MotionArtifact;
  // ↓ outputType별 슬롯 (병렬 누적)
  ci?: CIArtifact;
  app?: AppArtifact;
  print?: PrintArtifact;
  // ↓ 공통
  review?: ReviewArtifact;
}
```

**문제점**:
1. **슬롯 폭증**: 출력 종류 1개 추가 시 새 슬롯 + 새 ArtifactType 인터페이스 + 컴포넌트별 분기 추가
2. **공존 X 데이터**: 한 프로젝트는 outputType 1개만 사용. 5개 슬롯 중 1개만 채워짐 → 나머지 4개는 항상 undefined (storage 낭비, 타입 분기 부담)
3. **컴포넌트 분기 부담**: Stage 3·4·6에서 `if outputType === "ci" else if "app" else if "print" else web` 4-way 분기. 새 모드 추가 시 모든 곳 수정
4. **localStorage 직렬화 비대화**: 프로젝트 1개당 6개 슬롯 직렬화 (대부분 빈 값)
5. **명명 비일관**: `wireframes`(복수)는 web만, `ci`/`app`/`print`(단수)는 다른 모드. 학파 비교(3안)는 web 전용 개념

---

## 2. 목표 구조 (To-Be)

**핵심 아이디어**: 출력 종류별 슬롯을 통합 컬렉션으로. Stage 단위 키 + outputType 단위 데이터 분리.

### 2.1 새 타입 구조

```typescript
/** Stage 3·4 산출물 — 모든 outputType 공통 인터페이스 */
interface StageArtifact {
  /** Tauri 저장 경로 또는 인라인 콘텐츠 */
  path?: string;       // HTML 산출물은 path
  content?: string;    // markdown 산출물은 content
  /** 어떤 학파 기반인지 */
  philosophy?: Philosophy;
  /** 생성 시각 */
  createdAt: number;
  /** outputType별 메타 (자유 형식) */
  meta?: Record<string, unknown>;
}

/** Stage 3 전용 — web은 학파별 3안 비교, 나머지는 단일 */
interface Stage3Artifacts {
  /** web: 학파별 wireframe / ci/app/print: { selected: 단일 } */
  variants: Partial<Record<Philosophy, StageArtifact>>;
  /** 사용자가 선택한 학파 (web 3안 비교 후 / ci·app·print는 단일이라 즉시 셋) */
  selected?: Philosophy;
}

/** 공통 단일 산출물 stage (4·5·6) */
type Stage4Artifact = StageArtifact;
type Stage5Artifact = StageArtifact;
type Stage6Artifact = StageArtifact & { score?: number };

interface DesignProject {
  projectId: string;
  createdAt: number;
  stage: Stage;
  outputType: OutputType;
  autoMode?: boolean;

  // Stage 1
  briefInput: string;
  briefQuestions?: BriefQuestion[];
  briefAnswers?: BriefAnswers;
  brief?: string;

  // Stage 2 — outputType과 무관
  system?: SystemArtifact;

  // Stage 3·4·5·6 — 통합 슬롯 (outputType이 분기 결정)
  stage3?: Stage3Artifacts;
  stage4?: Stage4Artifact;
  stage5?: Stage5Artifact;  // outputType !== "web"이면 항상 undefined
  stage6?: Stage6Artifact;
}
```

### 2.2 outputType별 사용 패턴

| stage | web | ci | app | print |
|-------|-----|-----|-----|-------|
| 3 | `variants[phi]` 학파 3안 + `selected` | `variants[phi]` 1개 + `selected` | `variants[phi]` 1개 + `selected` | `variants[phi]` 1개 + `selected` |
| 4 | path = hifi HTML | path = assets HTML | path = screens HTML | path = final HTML |
| 5 | path = motion HTML | (skip) | (skip) | (skip) |
| 6 | path + content + score | 동일 | 동일 | 동일 |

**핵심 변화**:
- Stage 3 = 항상 `variants` Map (outputType 무관) — web만 3개, 나머지는 1개
- Stage 4·5·6 = 항상 단일 artifact (path 또는 content)
- 컴포넌트는 `project.stage4?.path` 한 줄로 접근, outputType 분기 X

### 2.3 Helper 함수 (utils.ts 확장)

```typescript
/** outputType + stage → 어느 prompt 파일을 쓸지 결정 */
export function getStagePromptPath(outputType: OutputType, stage: Stage): string {
  // web: prompts/03-wireframe.md, 04-hifi.md, 05-motion.md, 06-review.md
  // ci:  prompts/ci/03-system.md, ci/04-assets.md, ci/06-review.md
  // app: prompts/app/03-flow.md, app/04-screens.md, app/06-review.md
  // print: prompts/print/03-layout.md, print/04-final.md, print/06-review.md
  // ...
}

/** outputType + stage → 산출물 저장 경로 (Tauri saveDesignArtifact relpath) */
export function getStageArtifactPath(
  outputType: OutputType,
  stage: Stage,
  philosophy: Philosophy,
  ext: "html" | "md",
): string {
  // 예: "wireframe/pentagram.html", "ci/pentagram-system.md", "app/pentagram-flow.md"
}
```

---

## 3. 마이그레이션 전략

### 3.1 기존 localStorage 호환 (Backward Compatibility)

이미 사용자 머신에 누적된 프로젝트가 옛 구조로 저장돼 있음. 새 구조로 자동 변환:

```typescript
function loadProject(projectId: string): DesignProject | null {
  const raw = localStorage.getItem(KEY(projectId));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return migrateProject(parsed);
}

function migrateProject(legacy: any): DesignProject {
  // 옛 형식 감지 — wireframes/hifi/ci/app/print 평면 슬롯 존재 시
  if (legacy.wireframes || legacy.hifi || legacy.ci || legacy.app || legacy.print) {
    return {
      ...legacy,
      stage3: legacy.wireframes
        ? {
            variants: Object.fromEntries(
              Object.entries(legacy.wireframes).map(([phi, w]: [string, any]) => [
                phi,
                { path: w.path, philosophy: phi as Philosophy, createdAt: w.createdAt },
              ]),
            ),
            selected: legacy.selectedWireframe,
          }
        : legacy.ci?.systemMd
          ? {
              variants: legacy.selectedWireframe
                ? { [legacy.selectedWireframe]: { content: legacy.ci.systemMd, philosophy: legacy.selectedWireframe, createdAt: legacy.ci.createdAt } }
                : {},
              selected: legacy.selectedWireframe,
            }
          : /* app/print 동일 */ undefined,
      stage4: legacy.hifi
        ? { path: legacy.hifi.path, philosophy: legacy.hifi.basePhilosophy, createdAt: legacy.hifi.createdAt }
        : legacy.ci?.applicationsMd
          ? { path: legacy.ci.applicationsMd, philosophy: legacy.selectedWireframe, createdAt: legacy.ci.createdAt }
          : /* app/print */ undefined,
      stage5: legacy.motion
        ? { path: legacy.motion.path, philosophy: legacy.motion.basePhilosophy, createdAt: legacy.motion.createdAt }
        : undefined,
      stage6: legacy.review
        ? { path: legacy.review.path, content: legacy.review.content, score: legacy.review.score, createdAt: legacy.review.createdAt }
        : undefined,
      // 평면 슬롯 제거
      wireframes: undefined,
      selectedWireframe: undefined,
      hifi: undefined,
      motion: undefined,
      ci: undefined,
      app: undefined,
      print: undefined,
    };
  }
  return legacy as DesignProject;
}
```

**원칙**: 마이그레이션은 **읽기 시점**에만 (lazy). 쓰기는 항상 새 구조로. 기존 평면 슬롯은 삭제.

### 3.2 Tauri 산출물 폴더 호환

기존 폴더 구조:
```
~/Library/Application Support/com.atelier.app/projects/<id>/
├── wireframe/        ← web Stage 3
│   ├── pentagram.html
│   ├── field-io.html
│   └── ...
├── hifi/             ← web Stage 4
├── motion/           ← web Stage 5
├── ci/               ← ci Stage 3+4
├── app/              ← app Stage 3+4
├── print/            ← print Stage 3+4
└── review/           ← Stage 6 공통
```

**유지 결정**: 폴더 구조는 그대로 유지 (가독성 좋음, 외부 스크립트 호환). 타입만 통합.

### 3.3 점진적 적용 (Phased Rollout)

| Phase | 작업 | 영향 |
|-------|------|------|
| **P1** | 새 인터페이스 추가 + helper 함수 (`getStagePromptPath`, `getStageArtifactPath`) — **기존 슬롯 유지** | 0 (추가만) |
| **P2** | `migrateProject` 추가 + `loadProject` 호출 시 자동 변환 | 기존 프로젝트 자동 마이그레이션 (1회) |
| **P3** | 컴포넌트 1개씩 새 슬롯(`stage3`/`stage4`)으로 전환 (예: HiFi → stage4 사용) | 컴포넌트당 ~10라인 변경 |
| **P4** | 모든 컴포넌트 전환 완료 후 옛 슬롯(`wireframes`/`hifi`/`motion`/`ci`/`app`/`print`) 인터페이스에서 제거 | 옛 슬롯 참조 0건 확인 후 |
| **P5** | 새 출력 종류 추가 (예: 영상·인포그래픽) — 인터페이스 변경 X, prompt + helper만 추가 | helper 1줄 + prompt 파일 |

**P3·P4가 가장 큰 작업** — 9개 컴포넌트 변경. 그러나 한 컴포넌트씩 점진 마이그레이션 가능 (옛/새 슬롯 공존 기간 존재).

---

## 4. 영향 범위 (Impact Scope)

### 4.1 변경 필요 파일 (예상)

| 파일 | 변경 종류 | 라인 추정 |
|------|----------|----------|
| `useDesignProject.ts` | 인터페이스 + 마이그레이션 helper | +120 / -80 |
| `utils.ts` | `getStagePromptPath`, `getStageArtifactPath` 추가 | +60 |
| `Wireframe.tsx` | wireframes → stage3.variants | -10 |
| `HiFi.tsx` | hifi → stage4 | -10 |
| `Motion.tsx` | motion → stage5 | -10 |
| `CIBrandSystem.tsx` | ci.systemMd → stage3.variants[selected].content | -15 |
| `CIAssets.tsx` | ci.applicationsMd → stage4.path | -15 |
| `AppFlow.tsx` | app.flowMd → stage3.variants[selected].content | -15 |
| `AppScreens.tsx` | app.screensPath → stage4.path | -10 |
| `PrintLayout.tsx` | print.layoutMd → stage3.variants[selected].content | -15 |
| `PrintFinal.tsx` | print.finalPath → stage4.path | -10 |
| `Review.tsx` | outputType별 4-way 분기 → 단일 stage4 접근 | -50 |
| `Gallery.tsx` | 6슬롯 분리 표시 → stage 단위 표시 | -30 |
| `AutoOverlay.tsx` | done 조건 outputType 분기 → stage 단위 | -20 |
| `DesignWizard/index.tsx` | isStageDone outputType 분기 → 단일 함수 | -25 |

**총 예상**: ~+180 추가 / ~-285 삭제 = **순감소 ~105라인** + outputType 분기 코드 8곳 제거

### 4.2 회귀 위험 (Regression Risk)

| 위험 | 대응 |
|------|------|
| 기존 프로젝트 마이그레이션 실패 (잘못된 데이터 변환) | `migrateProject` 단위 테스트 작성 (기존 6슬롯 → 새 4슬롯 매핑 검증) |
| 마이그레이션 도중 산출물 손실 | 마이그레이션은 읽기 전용, 원본은 그대로. 새 구조로 쓸 때 옛 슬롯 명시적 삭제 |
| 컴포넌트 점진 전환 중 옛/새 슬롯 충돌 | P3에서 한 컴포넌트씩 전환 + 양쪽 슬롯 fallback 코드 추가 |
| Tauri 폴더 경로 호환 X | 폴더 구조 그대로 유지 (helper에서 매핑만 분리) |
| autoMode 자동 파이프라인 깨짐 | useAutoTrigger/Advance hook은 stage 단위 boolean이라 영향 X |

### 4.3 코드 모드 영향 — **0**

`Main.tsx` (코드 모드 PTY 터미널)는 `DesignProject` 타입을 사용하지 않음. 디자인 모드 전용 변경. 코드 모드와의 충돌 가능성은 없음.

---

## 5. 실행 시 의사결정 트리거

이 설계는 다음 조건 중 하나가 충족될 때 실행:

1. **디자인 모드 활성 사용 재개** — 사용자가 디자인 모드를 본격 사용 시작
2. **새 출력 종류 추가 요구** — 영상·인포그래픽·소셜 카드 등 5번째 outputType 필요할 때
3. **6개 슬롯이 9~10개로 늘어났을 때** — 슬롯 추가가 부담되어 통합 압박 발생
4. **명확한 회귀** — 평면 슬롯 구조에서 발생하는 명백한 버그·유지보수 비용

위 조건이 안 되는 한 보류 유지.

---

## 6. 대안 (Alternative)

### 6.1 옵션 A — 통합 (이 설계)
- 장점: 확장성 ↑, 분기 코드 ↓, localStorage 슬림화
- 단점: 마이그레이션 부담, 점진 적용 도중 양쪽 슬롯 공존 기간

### 6.2 옵션 B — 현 구조 유지
- 장점: 변경 0, 즉시 작동
- 단점: 출력 종류 추가마다 슬롯 늘어남, 분기 코드 누적

### 6.3 옵션 C — 디자인 모드 전체 분리 (별도 도구)
- 디자인 모드를 atelier에서 떼어내 별도 패키지/스킬로
- 장점: atelier 단순화
- 단점: 통합 워크플로우 가치 손실

**Stella 결정**: 옵션 A. 활성화 재개 시 실행.

---

## 7. 구현 우선순위 (재개 시 즉시 적용 가능)

```
P1: 새 인터페이스 추가 (1~2시간)         ← 가장 먼저
P2: migrateProject helper (1~2시간)
P3: 컴포넌트 점진 전환 (9개 × 30분 = 5시간)
P4: 옛 슬롯 인터페이스 제거 (30분)
P5: 새 출력 종류 추가 검증 (선택, 1시간)
─────────────────────────────────────
총: 약 1~2일 (디자인 모드 활성 사용 검증 시간 별도)
```

---

## 부록 A — 기존 vs 새 구조 코드 비교

### 컴포넌트에서 산출물 접근

**As-Is (현재)**:
```typescript
// Review.tsx 안의 4-way 분기
if (project.outputType === "ci") {
  promptPath = "prompts/ci/06-review.md";
  const ciSystemMd = project.ci?.systemMd ?? "(미수행)";
  const ciAssetsHtml = project.ci?.applicationsMd ? await readTextFile(project.ci.applicationsMd) : "(미수행)";
  // ...
} else if (project.outputType === "app") {
  promptPath = "prompts/app/06-review.md";
  const appFlowMd = project.app?.flowMd ?? "(미수행)";
  // ...
} else if (project.outputType === "print") {
  // ...
} else {
  promptPath = "prompts/06-review.md";
  const wireframe = project.wireframes[phi];
  // ...
}
```

**To-Be (통합)**:
```typescript
// Review.tsx — 단일 경로
const promptPath = getStagePromptPath(project.outputType, 6);
const stage3Content = project.stage3?.variants[phi]?.content ?? "(미수행)";
const stage4Path = project.stage4?.path;
const stage4Html = stage4Path ? await readTextFile(stage4Path) : "(미수행)";
```

분기 사라짐, 한 줄 접근.

---

## 부록 B — 새 출력 종류 추가 시 작업

**As-Is**: 인터페이스 새 슬롯 + 새 ArtifactType + 9개 컴포넌트 분기 + isStageDone 분기 + AutoOverlay 분기 = 약 200라인

**To-Be**: prompt 파일 추가 + `getStagePromptPath` 1줄 추가 + 결정축 카탈로그 (`decision-axes/<type>.md`) = 약 0 코드 변경 (prompt만)

---

## 결론

**현재**: 보류 유지. 코드 변경 없음.

**활성화 재개 시**:
- P1·P2부터 시작 (인터페이스 + 마이그레이션) — 4시간
- P3부터 9개 컴포넌트 점진 전환 — 5시간
- 회귀 위험 낮음 (마이그레이션 helper만 검증되면 안전)

이 문서는 활성화 시점에 즉시 실행 가능한 **Implementation-Ready Spec**으로 보관.
