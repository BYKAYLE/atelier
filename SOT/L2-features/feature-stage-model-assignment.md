# Feature: Stella Mode 단계별 모델 배정 (정적 매핑 v1.1)

Status: implemented local candidate (0.2.30)
Updated: 2026-08-25 KST

## 0.2.30 (v1.1) — 대표님 실사용 피드백 반영

- **교차 provider 배정**: 단계 행이 provider 셀렉터 + 그 provider 카탈로그의
  모델 셀렉터로 확장됐다. top-level provider 5종(claude/codex/hermes/gajecode/
  grok) 전부 단계별 혼합 가능 — 이 기능의 원래 목적(예: 계획=claude 상급,
  구현=grok/codex)이다. provider 오버라이드는 항상 명시적 모델을 요구한다.
  경계: hermes/gajecode 의 하위 backend 는 계약이 직접 표현하지 않고 **모델
  값에서 유도**된다 (hermes: claude-* → anthropic, vendor/model → openrouter,
  기본 openai-codex; gajecode: 모델 접두사). 미인증/미준비 provider 는 행 아래
  경고(`stage-model-warning-*`)와 실행 전 fail-closed 사유로 노출된다 — 조용한
  비활성화 금지.
- **배정 생존 규칙 명문화** (초기화 결함 수리): 계약 모듈
  `STAGE_ASSIGNMENT_SURVIVAL_RULES` 정본 — ① 배정은 세션 상태와 독립(세션
  모델 변경·provider 전환·패널 재열기·재시작에도 유지) ② 행 단위 갱신만
  (다른 행 초기화 금지) ③ 삭제는 명시 조작(행 "상속" 선택 또는 전체 초기화
  버튼 `stage-model-reset`)뿐 ④ 카탈로그 밖 배정도 "현재 선택: …"으로 표시
  (상속으로 위장하는 표시 붕괴 금지 — "다른 모델 선택하면 초기화돼 보임"
  결함의 근본 원인이 이 표시 붕괴였다). 스모크가 소스 수준으로 고정.
- UI 는 provider+model 오버라이드를 노출한다. effort 오버라이드는 여전히 CLI
  `--stage-models` 경로 전용 (문서화된 경계).

## Goal

Cursor식 "단계마다 다른 AI 모델" 방식을 Stella Mode에 도입한다. 하나의 스텔라
실행을 planning → execution → verification → security → audit 다섯 단계로
분할하고, 단계마다 서로 다른 provider/model/effort 를 정적으로 배정할 수 있게
한다. 예: planning=상급 모델, execution=경량 모델, verification=별도 모델.

## Contract (불변 원칙)

1. **미지정 = 세션 모델 상속.** 단계 오버라이드가 하나도 없으면 기존 단일 세션
   실행 경로를 그대로 탄다. staged payload 자체가 만들어지지 않으므로 CLI 인자
   구성은 기존과 동일하다 (`tools/stella-stage-models-smoke.ts` 가 상속 해석의
   동등성과 배선 게이트를 소스 수준으로 고정).
2. **fail-closed.** 카탈로그에 없는 모델, 지원되지 않는 provider 오버라이드,
   잘못된 effort, 스폰 실패는 해당 단계에서 실행을 중단하고 단계·사유를 UI
   메시지, SOT evidence, receipt 에 남긴다. 다른 모델로의 조용한 대체(coerce
   폴백)는 단계 오버라이드 경로에서 금지된다.
3. **정적 매핑만.** 동적 판정기 없음 (v2 범위 밖). grok 은 기본값에 넣지 않는다
   (선택은 가능).
4. **산출물 명시 전달.** 단계 간 컨텍스트는 provider 대화 승계(resume)가 아니라
   stage handoff 요약(산출물 경로·핵심 결정·다음 단계 지시)으로만 전달된다.
   단계 턴은 `resumeSessionId = null` 로 실행되고 provider 세션 상태를 세션에
   남기지 않는다.

## Implemented shape

- 계약 모듈 `src/lib/stellaStageModels.ts` (순수 모듈, React/Tauri 무의존):
  단계 정본 `STELLA_STAGES`, 배정 타입, 신뢰 불가 입력 파싱
  (`parseStageModelAssignments`), 상속 해석(`resolveStageExecution`), 실행 직전
  카탈로그 검증(`validateStageExecution`), 단계 프롬프트/handoff/receipt 조립,
  단계 상태 전이(`advanceStageRunState`), 영속 직렬화/복원 방어.
- 영속: 전역 기본값 localStorage `atelier.stella.stageModels.v1`. 실행 시작
  시점에 스냅샷을 `payload.stageRun.assignments` 로 고정 — 실행 중 전역 변경은
  진행 중 런에 영향 없다.
- 오케스트레이션 (AgentWorkspace): 오버라이드가 있는 스텔라 실행은 단계 턴의
  연쇄로 실행된다. 각 단계는 기존 `agent_send` → provider 별 spawn 경로(기존
  `--model` 인자)를 그대로 재사용한다 — 새 spawn 경로 없음. 단계 성공 시 다음
  단계 턴이 handoff 와 함께 세션 큐 맨 앞에 들어가고, 실패/중단 시 남은 단계는
  실행되지 않는다. 단계 오버라이드 모델은 그 턴에만 적용되며 세션 선택 모델을
  덮어쓰지 않는다. 단계별 receipt(provider/model/effort/status/duration/요지)는
  SOT evidence-log 와 CLI 터미널 receipt(`stageReceipts`)에 남는다.
- 단계 분할 런은 자체가 단계 오케스트레이션이므로 managed autopilot 사전
  사이클(stella_service_factory autopilot)은 실행하지 않는다 (이중
  오케스트레이션 방지). bootstrap/analysis preflight 는 그대로 수행한다.
- UI: 스텔라 런처 옆 `단계 모델` 토글(`data-testid="stage-model-toggle"`) →
  단계×모델 5행 패널(`stage-model-panel`, `stage-model-row-<stage>`,
  `stage-model-menu-<stage>`), 각 행 기본값 "세션 모델 상속"
  (기존 `MODEL_OPTIONS`/런타임 카탈로그·`ComposerSelectMenu` 재사용). 실행 중
  현재 단계·사용 모델 상태줄(`stage-model-status`).
- CLI: `atelier task dispatch ... --stella --stage-models '<json>'`.
  Rust `parse_stage_models` 가 JSON 형식·단계 키·필드 타입을 fail-closed 로
  검증하고, 프런트 `normalizeControlTask` 가 계약 모듈로 재검증한다.
  `atelier task status <id>` 의 terminal receipt 에 단계별 `stageReceipts` 가
  실린다. docs/atelier-cli.md 에 계약 문서화.

## Boundaries (v1 명시 경계 — v1.1 에서 갱신됨, 위 0.2.30 절이 정본)

- ~~교차 provider 오버라이드는 `claude`/`codex`/`grok` 만 지원~~ → 0.2.30 부터
  top-level provider 5종 전부 지원. 하위 backend 는 모델 값에서 유도된다.
- ~~UI 패널은 모델 오버라이드만 노출~~ → 0.2.30 부터 provider+model 노출.
  effort 오버라이드는 CLI `--stage-models` 경로 전용.
- 가재코드 세션의 컴포저 UI 에는 스텔라 런처 행 자체가 없으므로(기존 동작)
  단계 패널도 노출되지 않는다. CLI dispatch 로는 가재코드 세션에도 단계 배정이
  적용된다.
- 단계 effort 오버라이드는 세션 effort 와 같은 의미 체계를 탄다: codex/grok
  계열은 네이티브 effort 인자로, claude 계열은 워크로드 프롬프트 규약으로
  적용된다.
- provider cooldown 자동 재시도는 같은 단계를 재시도한다 (단계 건너뜀 없음).
- 탭 렌더링 등 UI 시각 상태는 소스·테스트 게이트로 검증했고, 설치본 실턴은
  CLI 헤드리스 경로로 검증한다 (UI 육안 검증은 미귀환 경계로 보고).

## Verification

- `npm run smoke:stella-stage-models` — 계약 단위 테스트(상속 동등성, fail-closed
  검증, 파싱, 상태 전이, handoff 조립, 직렬화 왕복) + 배선 소스 게이트.
- Rust: `atelier_cli::tests::stage_models_json_is_validated_fail_closed`,
  `stage_models_option_requires_stella_mode`,
  `agent::tests::stage_distinct_models_reach_model_arg_unmerged`.
- 설치본 실턴: `--stage-models` 로 최소 2단계가 서로 다른 모델로 실행되고 단계
  receipt 에 모델명이 찍히는 것을 terminal receipt 로 검증 (changelog 0.2.29
  증빙 참조).
