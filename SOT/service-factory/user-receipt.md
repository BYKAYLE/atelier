# User Receipt — Atelier v0.2.15 (260728)

## 사용자 전달물 (전달 채널에 실재)
- **릴리스 페이지** (사용자 문서): https://github.com/BYKAYLE/atelier/releases/tag/v0.2.15
  - 설치 3단계(다운로드→드래그→우클릭 열기), 지원 환경(macOS 12+ Apple Silicon), 미지원 플랫폼 사유, 문제 시 v0.1.66 롤백 링크
- **아티팩트**: Atelier_0.2.15_aarch64.dmg (SHA-256 f23b2c19…57ac, 독립 검증 완료)

## 대표님 인수 게이트 (ceo_acceptance) — 유일한 사람 게이트
상태: **인수 완료** — 대표님 발화 "인수" (260729 접수). GitHub Release 채널에서 직접 설치·실행 확인

인수 확인 방법 (5분):
1. https://github.com/BYKAYLE/atelier/releases/tag/v0.2.15 접속 → DMG 다운로드
2. Applications 드래그 → 우클릭 → 열기
3. 앱이 정상 실행되고 기존 워크플로우가 동작하면 인수

인수 발화 접수 시: 이 파일 상태 갱신 + user_receipt 스테이지 done + delivered 판정 → 미션 3관문 검수 → 최종 보고

## H2 정련 결과 (260729)

**실행체 신원 (추적성 — 검수 반려 R1 수리)**: factory request 레인은 `self_elaboration`(orchestration-reviewer)이나, 실제 실행체는 오케스트레이터가 스폰한 표준 함대 `rt-verify`(subagent_type, sonnet/high — ROUTE-ECHO 실측)다. agentId: elaboration-1=ab8e8864f16760fc6, elaboration-2=ae6d9407dda8709fd (세션 897f8084 transcript). **독립성 한계 정직 명시**: 산출자와 다른 개체이나 동일 오케스트레이터 관할의 함대 — 제3자 검증은 아님.
- blocking 0 — 인수기록·전달채널 문서·해시 전부 실측 일치
- non-blocking 2 (후속 릴리스 정리 항목): ①이슈 신고 채널 링크 미고지(사용자=대표님이라 실질 리스크 낮음) ②auto-updater 구성은 active이나 latest.json 매니페스트 미발행(404) — 자동업데이트 미작동 상태, 다음 릴리스 사이클에서 정리

## ceo_acceptance 1차 출처 체인 (검수 반려 R1 수리)
- 발화: "인수" — 260729, 세션 897f8084-ed4b-4d11-8e23-95577a797fe7 (직전 맥락: "깃허브에서 설치를 해보라는건가?" → 설치 절차 안내 → 설치 후 발화)
- append-only 원장 기록 2곳: ①/Users/kansic/bk-wiki/raw/session-events.jsonl 260729 "Atelier v0.2.15 대표님 인수" 라인 ②~/.claude/router/ledger/routing-ledger.jsonl event kind=ceo_acceptance (decision rt-260728-9500fb 연결)
- 미션 원장: SM-260728-3f8093 history의 resume(260729)→report 체인
