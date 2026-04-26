# Atelier Design Tab — Spec v2 (skill 의존 제거, design intelligence 빌트인)

**작성**: 스텔라 / **승인**: 대표님 / **위임 대상**: 릴리스
**날짜**: 2026-04-25
**v1 → v2 변경**: 외부 skill 의존 완전 제거. Claude Design처럼 design intelligence를 atelier 프로그램 자체에 빌트인. claude CLI는 LLM backend로만 사용 (interchangeable).

## 1. 한 줄
Atelier는 design intelligence(철학·패턴·워크플로우·prompt)를 **자체 리소스로 빌트인**한 데스크탑 디자인 도구. 사용자는 Atelier.app만 install하면 풀 디자인 워크플로우 사용 가능.

## 2. 아키텍처
```
src-tauri/resources/design-engine/    ← 디자인 두뇌 (atelier 저작권)
  philosophies/                         5학파 × 20 철학 (Pentagram/Field.io/Kenya Hara/Sagmeister/Bauhaus 등)
  workflows/                            6단계 wizard 정의 (brief → system → wireframe → hi-fi → motion → review)
  prompts/                              단계별 system prompt (한국어 + 영어)
  components/                           스타터 컴포넌트 (iPhone bezel/slide shell/animation engine)
  templates/                            scene templates (8 시나리오 × 3 스타일)
  brand/bykayle.md                      바이케일 brand 자산

src/components/DesignWizard/          ← UI + 상태 머신
  index.tsx                             진입점, stepper
  steps/Brief.tsx                       단계 1
  steps/Wireframe.tsx                   단계 3 (Phase 1)
  steps/{System,HiFi,Motion,Review}.tsx Phase 2

LLM Backend                            ← claude CLI (인터체인저블)
  - atelier가 design-engine의 prompt + 사용자 input 조립
  - claude PTY로 일반 chat 전송
  - 결과 받아 산출물 저장
  - 향후 codex/gemini로 교체 가능
```

## 3. MVP 범위 (Phase 1)

**포함:**
- Atelier 좌측 사이드바 [세션][파일] 옆에 [디자인] 탭 추가
- DesignWizard UI shell (6단계 stepper, 진행 상태 표시)
- **단계 1 — Brief**: 사용자 자연어 입력 → atelier가 brief prompt 조립 → claude PTY 호출 → PRD 초안 + 페르소나 + 목표 → 우측 markdown viewer
- **단계 3 — Wireframe**: Brief 기반 3개 학파에서 lo-fi HTML 시안 3안 병렬 생성 → 우측 preview에서 viewport 토글로 비교 → 1안 선택 → 다음 단계 stub
- design-engine 빌트인:
  - `philosophies/` 5학파 자체 작성 (huashu 참고하되 우리 표현)
  - `prompts/01-brief.md`, `prompts/03-wireframe.md`
  - `brand/bykayle.md` 바이케일 logo URL/색상/타입 자산
- 진행 상태 localStorage persist (`atelier.design.{projectId}`)
- 단계 산출물 파일 저장: `~/Library/Application Support/com.atelier.app/projects/{projectId}/`

**제외 (Phase 2):**
- 단계 2 (System), 4 (Hi-fi 반복), 5 (Motion MP4), 6 (Review + PPTX export)
- 다국어 backend (codex/gemini 어댑터)
- design-engine 5학파 추가 확장 (Phase 1엔 3학파만)

## 4. DoD (Phase 1)
1. ✅ Atelier에 [디자인] 탭 추가 + wizard 진입
2. ✅ 단계 1 Brief: 입력 → PRD 초안 생성 → 단계 산출물 표시
3. ✅ 단계 3 Wireframe: Brief 기반 3안 lo-fi HTML 병렬 생성 → 우측 preview에서 viewport 토글 비교 → 1안 선택
4. ✅ 새로고침/재실행 후 진행 상태 복원 (localStorage)
5. ✅ 외부 skill 의존 0 — `~/.claude/skills/huashu-design` 없어도 정상 동작 검증
6. ✅ 터미널 모드 회귀 없음 (한글 IME Canvas, 사이드바 토글, claude 탭)
7. ✅ probe 자동 검증 PASS
8. ✅ Palette 폴더 폐기

## 5. 기술 결정
- **DesignWizard lazy import** — `import('./components/DesignWizard')` 동적 로드. 디자인 탭 안 누르면 코드 미실행, 터미널 모드 무거움 X
- **상태 관리**: useState + Context (design wizard 안에서). 새 의존성 추가 X
- **Markdown viewer**: 단계 산출물 (PRD 등)은 `react-markdown` 추가 (~50KB)
- **Wireframe 병렬 생성**: claude PTY 3개 동시 spawn (이미 atelier가 다중 PTY 지원). 또는 단일 PTY로 순차 생성 + UI에 진행 표시
- **결과 HTML 저장 위치**: `~/Library/Application Support/com.atelier.app/projects/{projectId}/{step}/`. 우측 preview에 `file://...` 자동 로드.
- **prompt 파일 형식**: markdown frontmatter (`name`/`description`/`stage`) + 본문. atelier 시작 시 메모리 X (사용 시점 lazy fs::read)

## 6. 라이선스/저작권
- design-engine 콘텐츠 = atelier 자체 저작권. huashu/Claude Design 참고만 (직접 인용 X, 재구성)
- 사용자 install: Atelier.app만 + claude/codex 등 LLM CLI (사용자 자기 plan 인증)
- 외부 skill install 불필요
- 회사 배포 가능

## 7. 회귀 가드 (USER.md 반영)
- "단일 결정적 경로" — wizard 단계마다 명확한 다음 행동
- "검증 떠넘기지 마라" — probe 자동 호출
- "선택지 5개 늘어놓기 금지" — wizard 단계별 단일 prompt + 산출물
- "QC = mechanical + 런타임 + 패키징 smoke" — 빌드 + Atelier.app 실행 + 디자인 탭 클릭 + brief → wireframe E2E 자동
- "롤백 금지" — 의존성 충돌 시 migration

## 8. 스코어링 (sisyphus 기능 추가 가중치)
| 축 | 가중치 | 측정 |
|----|--------|------|
| 기능 완성도 | 50% | DoD 1~5 동작 (자동 E2E + probe) |
| 품질 | 20% | 코드 리뷰, lazy import 확인, design-engine 모듈성 |
| 검증 | 20% | 빌드 exit 0, probe PASS, skill 미설치 환경 동작 검증 |
| 회귀 | 10% | 터미널 모드 한글 IME/사이드바/claude 탭 동작 |

**85+ 자율 고도화. 5라운드 후 미달 시 에스컬레이션.**

