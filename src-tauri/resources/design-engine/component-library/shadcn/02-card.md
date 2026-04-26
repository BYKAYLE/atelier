---
name: card
description: shadcn Card를 학파별 Base Style로 적용. Feature card, Stat card, Testimonial card 변형 포함.
---

# Card — 학파별 Base Style

## Base 구조 (모든 학파 공통)
```html
<article class="flex flex-col gap-2 p-6 transition">
  <div class="text-xs uppercase tracking-wider opacity-60">CATEGORY LABEL</div>
  <h3 class="text-lg font-semibold">제목</h3>
  <p class="text-sm leading-relaxed opacity-70">설명 본문</p>
</article>
```

## 학파별 Variant

### Pentagram (1px stroke 그리드)
- **Wrapper**: `bg-zinc-50` 카드 사이 `gap-px bg-zinc-900` 컨테이너로 1px 검정 stroke 분리
- **Radius**: `rounded-none` 강제
- **Shadow**: `shadow-none`, hover에도 shadow 없음
- **Hover**: 색만 변화 `hover:bg-white duration-150`

```html
<!-- Pentagram 4-card stat grid -->
<div class="grid grid-cols-1 md:grid-cols-4 gap-px bg-zinc-900 border border-zinc-900">
  <article class="bg-zinc-50 p-8 hover:bg-white transition duration-150">
    <div class="text-5xl md:text-6xl font-extrabold tracking-tight text-zinc-900 tabular-nums">2,847</div>
    <div class="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">검증 의료진</div>
    <p class="mt-6 text-sm leading-relaxed text-zinc-700">대학병원 수련의·전문의가 직접 임상 시나리오를 검증.</p>
  </article>
  <!-- 3개 더 동일 -->
</div>
```

### Field.io (lift hover + 검정 톤)
- **Wrapper**: `bg-zinc-900` (검정), 카드 내 `bg-zinc-800/80`
- **Radius**: `rounded-none` 또는 `rounded-md`
- **Shadow**: hover 시 `hover:shadow-2xl`
- **Hover**: `hover:-translate-y-3 duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`
- 거대 번호 또는 상징 글자

```html
<!-- Field.io numbered feature card (3개) -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
  <article class="bg-zinc-900/80 p-12 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-3 hover:bg-zinc-800/80">
    <div class="text-7xl font-bold text-[#c96442] tabular-nums tracking-tight">01</div>
    <h3 class="mt-8 text-2xl font-semibold text-white tracking-tight">실시간 변수 50종</h3>
    <p class="mt-4 text-base leading-relaxed text-white/60">담낭·맹장·자궁 — 실제 임상에서 마주치는 모든 분기를 시간 흐름 그대로 재현.</p>
  </article>
  <!-- 02, 03 -->
</div>
```

### Kenya Hara (hairline + 거대 padding)
- **Wrapper 금지** — 박스 X. `border-t` hairline divider만
- **Radius**: 의미 없음 (border만)
- **Shadow**: `shadow-none` 절대 강제
- **Hover**: 거의 없음. 텍스트 링크 색만 600ms로

```html
<!-- Kenya Hara hairline-separated essay 3개 -->
<div class="flex flex-col">
  <article class="border-t border-stone-200 py-24 grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-24">
    <p class="text-xs font-light tracking-[0.24em] uppercase text-stone-500">01 — 시뮬레이션</p>
    <div class="md:col-span-2">
      <h3 class="text-2xl md:text-3xl font-light leading-relaxed text-stone-900 font-serif">시간이 멈춘 듯한 정밀함.</h3>
      <p class="mt-8 text-base font-light leading-loose text-stone-500 max-w-prose">2,000명의 의료진 데이터로 학습한 모델이 당신의 미세한 떨림까지 0.05초 단위로 분석합니다.</p>
    </div>
  </article>
  <!-- 02, 03 동일 -->
</div>
```

### Linear (1px hairline + subtle gradient + lift)
- **Wrapper**: `bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] rounded-lg p-8`
- **Radius**: `rounded-lg` (8px)
- **Shadow**: `shadow-sm`, hover `shadow-md`
- **Hover**: `hover:border-[#c96442]/30 hover:bg-white/[0.05] duration-150`
- 36px 아이콘 박스 + h3 + body 레이아웃

```html
<!-- Linear 3-card feature (다크) -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
  <article class="bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] rounded-lg p-8 transition duration-150 hover:border-[#c96442]/30 hover:bg-white/[0.05]">
    <div class="w-9 h-9 rounded-lg bg-[#c96442]/10 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c96442" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    </div>
    <h3 class="mt-5 text-lg font-semibold text-white">실시간 분석</h3>
    <p class="mt-3 text-sm leading-relaxed text-white/65">시뮬레이션 중 손동작·시선·반응 시간이 0.05초 단위로 기록됩니다.</p>
  </article>
  <!-- 2개 더 -->
</div>
```

## States
- **default**: 위 명시
- **hover**: 학파별 transform·color
- **selected** (선택 가능 카드 시): `ring-2 ring-[#c96442]`
- **focus-visible**: 카드가 button/link면 outline ring

## 사용 가이드
- 카드 grid는 학파마다 그리드 분리 방식 다름 — Pentagram은 1px stroke / Linear는 16px gap / Kenya는 박스 X
- icon은 인라인 SVG (stroke geometric), 이모지 사용 X
- 본문은 학파별 색·weight·line-height 준수 (Pentagram zinc-700 / Field.io white/60 / Kenya stone-500 light / Linear white/65)
