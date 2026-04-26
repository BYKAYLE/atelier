# Atelier Design Tab — Spec v1

**작성**: 스텔라 / **승인 대기**: 대표님 / **위임 대상**: 릴리스 (autonomous-dev)
**날짜**: 2026-04-25

## 1. 한 줄
Atelier 좌측 사이드바 상단에 **"디자인" 탭**을 추가, Claude Design급 단계별 디자인 워크플로우를 wizard UI로 구현. huashu-design skill을 hi-fi 엔진으로 활용 + 단계 1~2(brief/system)는 별도 skill 묶음 + 단계 3~6은 huashu 모드별 호출.

## 2. 사용자 시나리오
대표님이 "바이케일 새 랜딩 만들어줘" 입력 → Design 탭 wizard:
1. **Brief**: 목표/타겟/브랜드 자산 자동 주입 (바이케일 logo/색상) → 검수
2. **시스템**: 색상 토큰/타입스케일/spacing 정의 → 검수
3. **Wireframe**: 3개 학파에서 lo-fi 시안 3종 병렬 → 1개 선택
4. **Hi-fi 반복**: huashu Junior Designer로 hi-fi → 피드백 → 반복
5. **인터랙션/모션**: 필요 시 huashu motion 모드로 MP4/GIF
6. **평가 + 핸드오프**: huashu 5차원 평가 + PPTX export

각 단계 산출물은 우측 preview iframe (모바일/태블릿/데스크탑 토글로 즉시 확인 가능).

## 3. UI 구조
```
좌측 사이드바 상단 탭: [세션] [파일] [디자인]   ← 디자인 신규
디자인 탭 본문:
  ┌─ 진행 단계 (6 steps stepper) ───────────┐
  │ ●1.Brief ─ ○2.시스템 ─ ○3.Wireframe ─ ... │
  ├──────────────────────────────────────────┤
  │ 현재 단계 입력 + 산출물 미리보기           │
  │ - 단계별 prompt input                    │
  │ - 단계 산출물 (텍스트/시안/평가표)        │
  │ - [이전] [재생성] [다음 단계 →]           │
  └──────────────────────────────────────────┘
중앙: claude TUI (작업 중인 단계의 진행 로그)
우측: HTML preview (모바일/태블릿/데스크탑 토글 — 기존 유지)
```

## 4. 기술 스택
- **Frontend**: 기존 React + Tailwind, 새 컴포넌트 `DesignWizard.tsx`
- **상태**: Zustand 또는 useState (단계별 산출물 + 진행 상태)
- **Persist**: localStorage (`atelier.designWizard.{projectId}`) — 세션 복원
- **엔진**: 단계별 적절한 skill을 claude PTY로 호출
  - 단계 1: show-me-the-prd (인터뷰 → PRD)
  - 단계 2: ui-ux-pro-max + taste-skill (디자인 시스템)
  - 단계 3-5: huashu-design (advisor → Junior Designer → motion)
  - 단계 6: huashu 5차원 평가 + 자체 PPTX export
- **자산**: 바이케일 brand 파일 `~/.claude/skills/huashu-design/references/bykayle-brand.md` 추가 + SKILL.md fork(`bykayle-design`)로 회사 사용 라이선스 회피
- **무거움 회피**: huashu scripts/ (Playwright/ffmpeg)는 사용자 명시 export 시에만 lazy 호출. design 탭 React 컴포넌트는 lazy import.

## 5. MVP 범위 (Phase 1)
**포함:**
- 디자인 탭 UI shell (사이드바 상단 탭 + stepper + 단계별 폼 + 진행 표시)
- 단계 1 (Brief) + 단계 3 (Wireframe lo-fi 3안) — 제일 많이 쓸 두 단계 우선
- 산출물 우측 preview 자동 로드 (file:// 또는 dev server URL)
- 바이케일 brand 자산 파일 (`bykayle-brand.md`) 자동 주입
- 진행 상태 localStorage persist
- 단계 간 [이전] [다음] 이동

**제외 (Phase 2):**
- 단계 2 (시스템) — Phase 1.5
- 단계 4-5 (hi-fi 반복 + 모션) — Phase 2
- 단계 6 (평가 + PPTX export) — Phase 2
- huashu fork (bykayle-design) — Phase 1에서는 huashu 그대로, Phase 2에서 fork

## 6. DoD (Definition of Done) — Phase 1
1. ✅ Atelier에 "디자인" 탭 추가, 클릭 시 wizard UI 표시
2. ✅ 단계 1: 대표님이 brief 입력 → claude PTY가 PRD 초안 생성 → 단계 산출물에 표시
3. ✅ 단계 3: Brief 기반 wireframe 3안 병렬 생성 → 우측 preview에 토글로 비교
4. ✅ 1안 선택 시 다음 단계로 이동 (Phase 1에서는 단계 4 stub만)
5. ✅ 새로고침/재실행 후 진행 상태 복원 (localStorage)
6. ✅ 터미널 모드 회귀 없음 — 한글 IME (Canvas), 사이드바 토글, claude 탭 모두 정상
7. ✅ probe 자동 검증 PASS (UI 산출물 확인)
8. ✅ Palette 폴더 삭제 (대표님 명시 결정)

## 7. 주의 사항 (대표님 USER.md 반영)
- 라이선스: huashu Personal Use Only → Phase 2에서 fork (`bykayle-design`)으로 회사 사용 정당화
- 의존성 업그레이드 시 롤백 금지 — migration으로 해결
- QC = mechanical + 런타임 + 패키징 smoke까지
- 실사용 경로 전체 자동 E2E (앱 열기 → 디자인 탭 클릭 → brief 입력 → wireframe 생성 → preview 확인)
- 검증을 대표님께 떠넘기지 X — probe 자동 호출

## 8. 스코어링 (스텔라 검증 — 기능 추가 / sisyphus-workflow 가중치)
| 축 | 가중치 | DoD 매핑 |
|----|--------|---------|
| 기능 완성도 | 50% | DoD 1-5 동작 |
| 품질 | 20% | 코드 리뷰 (Pattern 5) |
| 검증 | 20% | DoD 6 회귀 + DoD 7 probe + 빌드 exit 0 |
| 회귀 | 10% | 기존 터미널 동작 회귀 없음 |

**85+ 통과까지 자율 고도화. 미달 시 라운드 5번 후 에스컬레이션.**

