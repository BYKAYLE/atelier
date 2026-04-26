---
name: button
description: shadcn Button을 학파별 Base Style로 적용한 카탈로그. 4학파 variant + 4 size + 5 state.
---

# Button — 학파별 Base Style

shadcn 원본 variant(default/destructive/outline/secondary/ghost/link)를 atelier 4학파에 맞춰 재정의.

## Base 구조 (모든 학파 공통)
```html
<button type="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition focus-visible:outline-2 focus-visible:outline-[#c96442] focus-visible:outline-offset-2 disabled:opacity-40 disabled:pointer-events-none">
  텍스트
  <svg .../>  <!-- optional icon -->
</button>
```

## Sizes (학파 무관 공통)
- `sm`: `h-8 px-3 text-xs` (28px)
- `default`: `h-9 px-4 text-sm` (36px)
- `lg`: `h-11 px-6 text-base` (44px)
- `icon`: `h-9 w-9 p-0` (정사각)

## 학파별 Variant

### Pentagram (Swiss 정확)
- **Primary**: `bg-zinc-900 text-white hover:bg-[#c96442] rounded-none duration-150`
- **Secondary**: `bg-white text-zinc-900 border border-zinc-900 hover:bg-zinc-100 rounded-none duration-150`
- **Ghost**: `text-zinc-900 hover:bg-zinc-100 rounded-none duration-150`
- 직각 모서리 강제, 색만 변화, 150ms snappy
- letter-spacing은 `tracking-wide` 또는 그대로

```html
<!-- Pentagram primary -->
<button class="inline-flex items-center justify-center gap-2 h-9 px-4 text-sm font-semibold bg-zinc-900 text-white hover:bg-[#c96442] transition duration-150 rounded-none focus-visible:outline-2 focus-visible:outline-[#c96442] focus-visible:outline-offset-2">
  자세히 보기
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>
```

### Field.io (운동 시학)
- **Primary**: `bg-[#c96442] text-white rounded-full px-8 py-4 hover:-translate-y-1 hover:scale-[1.02] hover:bg-[#b3553a] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`
- **Secondary**: `bg-white/10 backdrop-blur text-white border border-white/20 rounded-full hover:bg-white/20 duration-300`
- **Ghost**: `text-white hover:text-[#c96442] duration-300`
- pill (rounded-full) + lift transform + ease-out-expo
- text-uppercase + letter-spacing 강조

```html
<!-- Field.io primary -->
<button class="inline-flex items-center justify-center gap-2 h-12 px-8 text-sm font-semibold uppercase tracking-[0.04em] bg-[#c96442] text-white rounded-full transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:scale-[1.02] hover:bg-[#b3553a] focus-visible:outline-2 focus-visible:outline-[#c96442] focus-visible:outline-offset-3">
  Demo 신청 →
</button>
```

### Kenya Hara (동방 미니멀)
- **Primary (텍스트 링크 형태)**: `text-stone-900 border-b border-stone-900 pb-1 hover:text-[#c96442] hover:border-[#c96442] duration-700 ease-in-out`
- **채워진 버튼 사용 금지** — primary도 텍스트 링크로
- **Ghost**: `text-stone-500 hover:text-stone-900 duration-700`
- 600ms+ slow transition, font-light
- 둥근 모서리 0~2px

```html
<!-- Kenya Hara primary (link style) -->
<a href="#demo" class="inline-flex items-center gap-2 text-sm font-light tracking-wide text-stone-900 border-b border-stone-900 pb-1 transition duration-700 ease-in-out hover:text-[#c96442] hover:border-[#c96442]">
  자세히
</a>
```

### Linear (기능 정밀)
- **Primary**: `bg-[#c96442] text-white rounded-md hover:bg-[#b3553a] duration-150 px-4 py-2 text-sm font-semibold`
- **Secondary**: `bg-white/5 text-white border border-white/10 rounded-md hover:bg-white/10 duration-150` (다크 mode)
- **Ghost**: `text-zinc-300 hover:text-white duration-150`
- 6~8px radius (`rounded-md`), snappy 150ms, subtle

```html
<!-- Linear primary -->
<button class="inline-flex items-center justify-center gap-2 h-9 px-4 text-sm font-semibold bg-[#c96442] text-white rounded-md transition duration-150 hover:bg-[#b3553a] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#c96442] focus-visible:outline-offset-2">
  데모 신청
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>
```

## States (모든 학파 공통)
- **default**: 위 기본
- **hover**: 학파별 (위 명시)
- **active**: Linear는 `active:scale-[0.98]`, 나머지는 색 darken
- **focus-visible**: `outline-2 outline-[#c96442] outline-offset-2`
- **disabled**: `disabled:opacity-40 disabled:pointer-events-none`
- **loading**: `<svg class="animate-spin">` icon 추가

## 사용 가이드
- 페이지 1개당 primary CTA 1~2개 권장
- icon은 stroke 1.6~2px geometric (이모지 사용 금지)
- 한국어 텍스트 + 영문 화살표 등 보조 기호 OK
