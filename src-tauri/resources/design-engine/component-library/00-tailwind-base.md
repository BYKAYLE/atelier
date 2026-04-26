---
name: tailwind-base
description: Tailwind CSS utility 클래스 카탈로그. hi-fi HTML 출력 시 Tailwind CDN 로딩하면 모든 클래스 사용 가능. 학파별 Base Style의 토대.
---

# Tailwind Base Catalog

Atelier hi-fi 단계에서 Tailwind를 사용해 일관된 utility 시스템을 구축한다.
**모든 hi-fi HTML은 다음 CDN을 `<head>`에 포함해야 한다:**

```html
<script src="https://cdn.tailwindcss.com"></script>
```

## 색상 — Tailwind palette + bykayle 액센트
Tailwind 기본 팔레트(`zinc`, `stone`, `slate`, `gray`, `neutral`)를 base로 사용하고, 액센트는 `[#c96442]` arbitrary value로 사용.

### Neutral 선택 (학파별)
- Pentagram → `zinc` (geometric, 차가움)
- Field.io → `stone` (warm, 검정 베이스에 어울림)
- Kenya Hara → `stone` (off-white 톤)
- Linear → `neutral` (functional, 중립)

### Bykayle accent 사용
```html
<button class="bg-[#c96442] hover:bg-[#b3553a] text-white">CTA</button>
```

## Spacing scale (Tailwind 기본 = 4px baseline)

| Token | px | 사용처 |
|-------|-----|--------|
| `p-1` | 4 | 라벨 내 padding |
| `p-2` | 8 | 작은 버튼 |
| `p-3` | 12 | 중간 버튼·인풋 |
| `p-4` | 16 | 카드 내부 small |
| `p-6` | 24 | 카드 내부 default |
| `p-8` | 32 | 큰 카드, 섹션 작음 |
| `p-12` | 48 | 섹션 medium |
| `p-16` | 64 | 섹션 large |
| `p-24` | 96 | 섹션 데스크탑 default |
| `p-32` | 128 | hero 큰 여백 |

학파별 default section padding (Y):
- Pentagram: `py-24` (96px)
- Field.io: `py-32` (128px) — dramatic 여백
- Kenya Hara: `py-48` (192px) — 거대 여백
- Linear: `py-24` (96px)

## Typography

### Font family
- 한국어: `font-['Pretendard']` 또는 `font-sans` (Tailwind 기본)
- Latin Display (Field.io·Pentagram): `font-['Inter']` 또는 `font-['PP_Mori']`
- Serif (Kenya Hara): `font-['Noto_Serif_KR']` 또는 `font-serif`
- Mono: `font-mono`

### Type scale (학파 무관 base)
- `text-xs` 11~12px → label
- `text-sm` 14px → caption
- `text-base` 16px → body
- `text-lg` 18px → body-large
- `text-xl` 20px → h4
- `text-2xl` 24px → h3
- `text-3xl` 30px → h2 small
- `text-4xl` 36px → h2 medium
- `text-5xl` 48px → h2 large / hero mobile
- `text-6xl` 60px → hero
- `text-7xl` 72px → hero large
- `text-8xl` 96px → Field.io hero
- `text-9xl` 128px → Field.io ultra hero

### Font weight
- `font-light` 300 → Kenya Hara body
- `font-normal` 400 → default body
- `font-medium` 500 → label, button
- `font-semibold` 600 → h3, h4
- `font-bold` 700 → h1, h2 default
- `font-extrabold` 800 → Pentagram h1
- `font-black` 900 → Field.io extreme

### Letter spacing
- `tracking-tighter` -0.05em → Field.io 거대 typography
- `tracking-tight` -0.025em → h1 일반
- `tracking-normal` 0 → body
- `tracking-wide` 0.025em → button
- `tracking-wider` 0.05em → label small
- `tracking-widest` 0.1em → label uppercase
- arbitrary `tracking-[0.16em]` → Field.io label
- arbitrary `tracking-[0.32em]` → Kenya Hara label

## Border radius (학파별)

| 학파 | 기본 | Tailwind 클래스 |
|------|------|-----------------|
| Pentagram | 0~4px | `rounded-none`, `rounded-sm` |
| Field.io | 0 또는 999px (extreme) | `rounded-none`, `rounded-full` |
| Kenya Hara | 0~2px | `rounded-none`, `rounded-sm` |
| Linear | 6~8px | `rounded-md`, `rounded-lg` |

## Shadow

| 학파 | 사용 | 클래스 |
|------|------|--------|
| Pentagram | 절제 | `shadow-none`, 1px stroke 대신 |
| Field.io | hover 강조 | `shadow-2xl` (hover lift 시) |
| Kenya Hara | 금지 | `shadow-none` 강제 |
| Linear | subtle | `shadow-sm`, `shadow` |

## Layout (Grid / Flex)

### 12-column grid (Pentagram·Field.io)
```html
<div class="grid grid-cols-12 gap-6">
  <div class="col-span-7">...</div>
  <div class="col-span-5">...</div>
</div>
```

### Flex 일반
```html
<div class="flex items-center justify-between gap-4">...</div>
```

### Container
```html
<div class="max-w-7xl mx-auto px-6 lg:px-12">...</div>
```

## Transition / Animation

### 학파별 transition curve
- Pentagram: `transition duration-150 ease-in-out` (150ms, 색만)
- Field.io: `transition duration-300` + `ease-[cubic-bezier(0.22,1,0.36,1)]` (관성 강조)
- Kenya Hara: `transition duration-700 ease-in-out` (느림)
- Linear: `transition duration-150 ease-in-out` (snappy)

### Hover 패턴
- Pentagram: `hover:bg-zinc-100` (색만)
- Field.io: `hover:-translate-y-1 hover:scale-[1.02]` (lift + scale)
- Kenya Hara: `hover:text-[#c96442] hover:border-[#c96442]` (색·border만 천천히)
- Linear: `hover:bg-zinc-50` (snappy 색)

## Focus ring (모든 학파 공통, 접근성 필수)
```html
class="focus-visible:outline-2 focus-visible:outline-[#c96442] focus-visible:outline-offset-2"
```

## Responsive breakpoints (Tailwind 기본)
- `sm:` 640px (모바일 가로)
- `md:` 768px (태블릿)
- `lg:` 1024px (작은 데스크탑)
- `xl:` 1280px (데스크탑)
- `2xl:` 1536px (큰 화면)

기본 모바일 first → `class="text-base md:text-lg lg:text-xl"`

## 출력 시 필수 적용 규칙
1. `<script src="https://cdn.tailwindcss.com"></script>`를 `<head>`에 포함
2. 학파에 맞는 neutral palette·radius·shadow·transition curve 일관 사용
3. 액센트 `[#c96442]`는 학파 doc의 등장 빈도 가이드 준수
4. 모바일 first — 기본 클래스 + `md:` `lg:` 책임지는 변형
5. 모든 인터랙티브 요소에 `focus-visible:` 클래스 필수
