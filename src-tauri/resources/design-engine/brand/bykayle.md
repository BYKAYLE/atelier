---
name: bykayle
description: 바이케일 brand 자산. Wireframe / Hi-fi 단계에서 톤·색·타입·이미지·메시지에 영향.
---

# 바이케일 (bykayle) Brand Pack

## 한 줄
의료/AI/디자인 영역에서 동작하는 한국 스타트업. 따뜻한 정확함(Medical Warmth)이 톤.

## 영문명 표기 — 절대 규칙
- 항상 소문자 `bykayle`. **`By Kayle`, `Bykayle`, `BYKAYLE` 모두 금지**.
- 한국어 표기는 `바이케일`.

## 핵심 메시지 (5+ 변형, 도메인=의료 시뮬레이터)

1. **임상 그대로의 훈련** — 가장 짧은 한 줄.
2. **실수는 시뮬레이터에서, 자신감은 수술실에서** — 대조 구조.
3. **2,000명의 의료진이 검증한 시뮬레이션** — 신뢰 어필.
4. **훈련은 멈추지 않는다** — 짧고 강한 동사형 (field-io 톤).
5. **의료의 신뢰 + 디자인의 따뜻함이 만나는 곳** — 정체성 선언.
6. **단 하나의 손동작이 전부를 결정합니다** — kenya-hara 톤.
7. **임상 변수 50개를 한 시간에 만난다** — 스펙 어필.

## 컬러 팔레트 (디자인 토큰)

### 메인
- `--bk-primary: #c96442` — Medical Warmth, 따뜻한 테라코타. CTA, 액센트.
- `--bk-primary-hover: #b3553a` — primary darker, hover 상태.
- `--bk-primary-soft: #f5e6df` — primary tinted background.

### 잉크 / 텍스트
- `--bk-ink: #1f1f1d` — 메인 본문, h1~h3.
- `--bk-ink-soft: #4a4a47` — secondary 본문.
- `--bk-sub: #9b9890` — tertiary, caption, label.

### 표면 / 라인
- `--bk-surface: #faf9f5` — 페이지 배경 (cream).
- `--bk-surface-alt: #f3f1ea` — 섹션 alt 배경.
- `--bk-line: #e8e6df` — divider.
- `--bk-white: #ffffff`.

### 다크 (선택)
- `--bk-surface-dark: #1a1a18`.
- `--bk-ink-dark: #faf9f5`.

### 의료 신호색 (의료 도메인 한정)
- `--bk-success: #6b8e6e` — 임상 OK / 정상 범위.
- `--bk-warn: #d4a155` — 주의 / 임상 임계.
- `--bk-error: #b34a3a` — 위험 / 임계 초과.

### 그라디언트 사용 자제 — 단색 액센트 위주
브랜드 정체성상 그라디언트는 hero visual 같은 한 곳 한 번만.

## 타이포그래피 — Pretendard scale

### 폰트 패밀리
- 한글 + 영문 통합: `Pretendard` (CDN: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css`)
- 폴백: `Apple SD Gothic Neo`, `Inter`, system-ui, sans-serif.

### Type scale (px / line-height / weight / letter-spacing)
- **Display (h1)**: 64 / 72 / 700 / -0.02em
- **Heading 1 (h2)**: 48 / 56 / 700 / -0.015em
- **Heading 2 (h3)**: 32 / 40 / 600 / -0.01em
- **Heading 3 (h4)**: 24 / 32 / 600 / 0
- **Body Large**: 18 / 28 / 400 / 0
- **Body**: 16 / 24 / 400 / 0
- **Caption**: 13 / 20 / 500 / 0.01em
- **Label**: 11 / 16 / 600 / 0.08em / uppercase

### Pretendard weight 활용 가이드
- 100 / 200 / 300 — 거대 typography에서 우아함 (kenya-hara)
- 400 — 본문 default
- 500 — 메뉴, 강조 안 한 라벨
- 600 — h3~h4, 버튼 텍스트
- 700 — h1~h2 default
- 800 / 900 — 매우 큰 hero (field-io)

## Spacing System (4px baseline)
토큰: `[4, 8, 12, 16, 24, 32, 48, 64, 96, 128]`. 임의값 금지.

### 권장 매핑
- 컴포넌트 내부 padding: 12 ~ 24
- 카드/section padding: 24 ~ 48
- 섹션 간 vertical: 96 (데스크탑) / 64 (태블릿) / 48 (모바일)
- 그리드 gap: 24 (default) / 16 (촘촘) / 48 (여유)

## Border Radius
- `--radius-sm: 4px` — 인풋, 작은 버튼, badge
- `--radius-md: 8px` — 카드, 큰 버튼
- `--radius-lg: 16px` — 모달, hero block
- `--radius-xl: 24px` — 거대 컨테이너
- `--radius-pill: 999px` — pill 버튼

## Shadow Scale
```
--shadow-sm: 0 1px 2px rgba(31, 31, 29, 0.06);
--shadow-md: 0 4px 12px rgba(31, 31, 29, 0.08), 0 2px 4px rgba(31, 31, 29, 0.04);
--shadow-lg: 0 12px 32px rgba(31, 31, 29, 0.10), 0 4px 8px rgba(31, 31, 29, 0.04);
--shadow-xl: 0 24px 64px rgba(31, 31, 29, 0.12), 0 8px 16px rgba(31, 31, 29, 0.06);
```
- 카드 default: sm
- 카드 hover: md
- 모달/floating: lg
- hero key element: xl

## Motion 곡선
- `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` — 강한 ease-out, 자연스러운 관성. default.
- `--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)` — 양방향 부드러움.
- `--ease-pentagram: cubic-bezier(0.4, 0, 0.2, 1)` — Pentagram 톤, 인지 방해 최소.
- `--ease-fieldio: cubic-bezier(0.22, 1, 0.36, 1)` — Field.io 톤, 관성 강조.
- `--ease-hara: cubic-bezier(0.4, 0, 0.2, 1)` — Kenya Hara 톤, 슬로우.
- Duration: fast 150ms / base 250ms / slow 400ms / hero 600~800ms.

## 미세 인터랙션 토큰 (Hover / Active / Focus)

### Lift (카드/버튼이 떠오르는 양)
- `--lift-sm: -2px` — 작은 카드, 인풋 focus
- `--lift-md: -4px` — 일반 카드 hover (Pentagram, kenya-hara)
- `--lift-lg: -12px` — Field.io 드라마틱 hover
- `--press: 1px` — 버튼 active (눌림감)

### Scale (확대 양)
- `--scale-sm: 1.01` — 미세 강조 (Pentagram에선 사용 자제)
- `--scale-md: 1.02` — Field.io 버튼 hover
- `--scale-press: 0.97` — 버튼 active

### Hover 패턴 (학파 무관, 톤만 다르게)
```css
/* Pentagram — 색만 바꿈 */
.btn-pen { transition: background 150ms var(--ease-pentagram); }
.btn-pen:hover { background: #c96442; }

/* Field.io — lift + scale + 색 */
.btn-field { transition: transform 250ms var(--ease-fieldio), background 250ms; }
.btn-field:hover { transform: translateY(-3px) scale(1.02); background: #b3553a; }

/* Kenya Hara — 색·border만 천천히 */
.link-hara { transition: color 600ms var(--ease-hara), border-color 600ms; }
.link-hara:hover { color: #c96442; border-color: #c96442; }
```

### Focus ring (접근성 — 모든 학파 공통)
```css
:focus-visible {
  outline: 2px solid #c96442;
  outline-offset: 3px;
  border-radius: inherit;
}
```

### Stagger reveal (Field.io 전용)
- `@keyframes fadeUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }`
- delay 0ms / 80ms / 160ms / 240ms — 자식 4개까지

## 그리드 / 컴포지션 토큰 (학파 매핑)

### Pentagram — Swiss 12-column
- `grid-template-columns: repeat(12, 1fr); gap: 24px;`
- container `max-width: 1280px; margin: 0 auto; padding: 0 64px;`
- 모든 요소가 grid-column 정수 정렬 (예: `grid-column: 1 / span 7;`)

### Field.io — 비대칭
- 12-column 사용하되 의도된 offset (예: `grid-column: 4 / span 6;` + 옆 요소 padding-left 240px)
- 모바일에선 단일 컬럼 + 자유 padding

### Kenya Hara — 중앙 집중 또는 단일 컬럼
- `max-width: 720~960px; margin: 0 auto; text-align: center;` 또는 우측 정렬
- 12-column 대신 1fr 또는 1fr 2fr (라벨 / 본문)

## 밀도 프리셋 (densities)

같은 컴포넌트도 학파별로 padding 다르게.

| 밀도 | section padding (Y) | card padding | 권장 학파 |
|------|---------------------|--------------|-----------|
| compact | 64px / 48px | 24px | Pentagram (정보 밀도 high) |
| cozy | 96px / 64px | 32~40px | Field.io (default) |
| spacious | 192px / 128px | 64~96px | Kenya Hara (white space ≥70%) |

## 한국어 카피 톤 가드 (3 학파 공용)
- 어휘: "사용자" → "의료진"·"훈련자", "데이터" → "임상 데이터", "테스트" → "시뮬레이션"
- 길이: hero 카피 ≤ 14자 × 2줄. body 카피 ≤ 60자.
- 동사형 우선 ("훈련은 멈추지 않는다") > 명사 나열 ("최고의 훈련 시스템")
- 영문 혼용 시: 영문은 모두 대문자 OR 모두 소문자 (Camel/Title case 금지). 예: "DEMO 신청", "bykayle".

## 의료 도메인 이미지 placeholder (Unsplash)

CDN 형식: `https://images.unsplash.com/{photo-id}?w={width}&q={quality}`

### 핵심 셋
1. **의료 시뮬레이터 (수술 트레이닝)**
   `https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1600&q=85`
2. **의료진 협업 / 의사들**
   `https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200&q=85`
3. **수술실 (clinical environment)**
   `https://images.unsplash.com/photo-1551076805-e1869033e561?w=1600&q=85`
4. **의료 모니터 / 기기**
   `https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=1200&q=85`
5. **트레이닝 / 의료 교육 장면**
   `https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?w=1600&q=85`
6. **의료 도구 / 외과**
   `https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=1200&q=85`
7. **의료진 portrait (testimonial)**
   `https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=600&q=85`
8. **추상 의료 데이터**
   `https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=1200&q=85`

### 사용 규칙
- 모든 `<img>` 태그에 `loading="lazy"`.
- alt 한국어로 의미 있게 ("의료진이 시뮬레이터로 훈련하는 장면" 등).
- hero용은 w=1600 q=85, 카드용은 w=800 q=80, thumbnail은 w=400 q=75.

## ECG / 의료 시각 위젯 (인라인 SVG)

hero 또는 feature 섹션에 도메인 시그니처로 ECG 라인 한 개 권장. `components/ecg-widget.html` 참조.

## Atelier에서 사용 시
- 디자인 학파를 무엇을 선택해도, primary 액센트 색상 변수가 없거나 혼합이 필요하면 `#c96442` 사용.
- 학파 변수가 명시되면 학파 우선. 다만 "bykayle임을 알아볼 수 있는 어딘가 한 군데" (CTA, 헤더 로고, footer)에는 `#c96442`이 등장하는 것이 좋음.
- 의료 도메인 어휘 ("실제" → "임상", "환자 정보" → "환자 데이터", "사용자" → "의료진"/"훈련자").
- 영문명 항상 `bykayle` 소문자.

## 학파별 surface 배정 (절대 규칙 — 같은 brief 3안이 색으로 한눈에 구분되어야 함)

이 표는 wireframe·hi-fi 단계에서 학파가 명시되었을 때 **body background 단일 진실**.

| 학파 | body background | body text default |
|------|-----------------|-------------------|
| pentagram | `#ffffff` (순백) 또는 `#fafafa` (라이트 뉴트럴) | `#1a1a18` |
| field-io | `#0a0a0a` (풀-블랙) | `#fafaf7` 또는 `#ffffff` |
| kenya-hara | `#fafaf7` (따뜻한 off-white) | `#9b9890` (warm gray) — 검정 본문 금지 |
| linear | `#08090a` (딥 다크) 또는 `#fafbfc` (매끈 라이트) | 다크 시 `#fafbfc` / 라이트 시 `#1a1a1c` |

`--bk-surface: #faf9f5`은 **학파 미지정 일반 페이지** 전용. 학파가 명시되면 위 표 우선.
같은 brief의 3안이 같은 background 톤으로 나오면 자동 실패 — 학파 선택의 의미가 사라진다.
