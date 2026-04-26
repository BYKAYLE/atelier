---
name: atelier-design-flow
version: 2
description: Atelier Design Tab의 6단계 wizard 정의. Phase 2부터 1, 3, 4 활성. Stage 3는 mid-fi로 격상.
---

# Atelier Design Flow — 6 Stages

## Stage 1 — Brief (active)
- input: 사용자 자연어
- prompt: prompts/01-brief.md
- output: PRD 초안 마크다운 (페르소나 + 시나리오 + 톤 후보 3개)
- next: Stage 2 또는 3 (Phase 2는 3로 점프)

## Stage 2 — System (Phase 3 예정)
- input: Brief + 사용자가 선택한 학파
- output: 디자인 시스템 토큰(JSON) — 색/타이포/spacing/radius
- status: stub

## Stage 3 — Wireframe (active, mid-fi)
- input: Brief, 3개 후보 학파(pentagram/field-io/kenya-hara), brand pack
- prompt: prompts/03-wireframe.md (학파별 변수 주입, 3안 순차 생성)
- output: mid-fi HTML 시안 3개 — 4섹션 + Unsplash 이미지 + hover/transition + 반응형
- ux: 우측 preview에 viewport 토글로 비교, 1안 선택
- next: Stage 4

## Stage 4 — Hi-fi (active in Phase 2)
- input: 선택된 wireframe HTML + bykayle brand + 학파 doc + brief
- prompt: prompts/04-hifi.md (typography scale + spacing system + shadow scale + motion 적용)
- output: hi-fi HTML — Pretendard typography + 토큰 기반 spacing + ECG SVG + 의료 testimonial + footer
- ux: 변환 버튼 누르면 우측 preview에 자동 로드, 재생성 가능
- status: active (Phase 2)

## Stage 5 — Motion (Phase 2)
- input: 선택된 hi-fi
- output: animated HTML or MP4
- status: stub

## Stage 6 — Review (Phase 2)
- input: 모든 단계 산출물
- output: 5축 평가 보고서 + PPTX export
- status: stub

## 진행 상태 persist
- localStorage key: `atelier.design.{projectId}`
- shape: `{ projectId, stage, brief, philosophyChoice, wireframes: {pentagram, fieldIo, kenyaHara}, selectedWireframe, ... }`

## 산출물 파일 저장
- 경로: `~/Library/Application Support/com.atelier.app/projects/{projectId}/{stage}/`
- 예: `wireframe/pentagram.html`, `wireframe/field-io.html`, `wireframe/kenya-hara.html`
