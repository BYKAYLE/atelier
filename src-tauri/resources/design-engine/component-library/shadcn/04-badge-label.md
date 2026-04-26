---
name: badge-label
description: shadcn Badge + 라벨 시스템. 카테고리 라벨, 상태 뱃지, KBD(키보드 단축키) 패턴.
---

# Badge + Label — 학파별 Base Style

## Use cases
- **Category label**: 섹션 위에 작은 uppercase 라벨 ("CAPABILITY", "TESTIMONIALS")
- **Status badge**: "신규", "베타", "Pass" 같은 상태 표시
- **Tag/Chip**: 분류 태그
- **KBD**: `⌘K` 같은 키보드 단축키 (Linear)

## 학파별 Variant

### Pentagram (uppercase + spaced + 색만)
```html
<!-- Category label -->
<p class="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">— CAPABILITY</p>

<!-- Status badge -->
<span class="inline-flex items-center px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] bg-[#c96442] text-white rounded-none">NEW</span>

<!-- Number stat (label 위에) -->
<div>
  <div class="text-6xl font-extrabold text-zinc-900 tabular-nums tracking-tight">2,847</div>
  <div class="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">검증 의료진</div>
</div>
```

### Field.io (extreme spacing + 액센트 색)
```html
<!-- Category label -->
<p class="text-xs font-medium uppercase tracking-[0.16em] text-[#c96442]">— CAPABILITY</p>

<!-- Status badge -->
<span class="inline-flex items-center px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] bg-[#c96442] text-white rounded-full">DEMO</span>

<!-- Number with accent -->
<div class="text-7xl font-bold text-[#c96442] tabular-nums tracking-tight">01</div>
```

### Kenya Hara (ultra-spaced + light + dash prefix)
```html
<!-- Category label -->
<p class="text-xs font-light uppercase tracking-[0.32em] text-stone-500">— 시뮬레이션</p>

<!-- Section number prefix -->
<p class="text-xs font-light uppercase tracking-[0.24em] text-stone-500">01 — 시뮬레이션</p>

<!-- Single quiet number (centered) -->
<div class="text-center">
  <div class="text-8xl font-extralight text-stone-900 font-serif tabular-nums">2,847</div>
  <div class="mt-8 text-xs font-light uppercase tracking-[0.32em] text-stone-500">— 검증 의료진</div>
</div>
```

### Linear (modest spacing + accent color label + KBD shortcut)
```html
<!-- Category label -->
<p class="text-xs font-medium uppercase tracking-[0.04em] text-[#c96442]">CAPABILITY</p>

<!-- Status badge -->
<span class="inline-flex items-center px-2 py-0.5 text-xs font-semibold bg-[#c96442]/10 text-[#c96442] rounded">베타</span>

<!-- KBD keyboard shortcut (Linear 시그니처) -->
<kbd class="inline-flex items-center px-2 py-0.5 text-xs font-mono font-medium text-white bg-white/[0.08] border border-white/[0.12] rounded">⌘K</kbd>

<!-- Multi-key combo -->
<span class="inline-flex items-center gap-1">
  <kbd class="inline-flex items-center px-2 py-0.5 text-xs font-mono text-white bg-white/[0.08] border border-white/[0.12] rounded">⌘</kbd>
  <kbd class="inline-flex items-center px-2 py-0.5 text-xs font-mono text-white bg-white/[0.08] border border-white/[0.12] rounded">K</kbd>
</span>
```

## Status badge — semantic colors (모든 학파 공통)

| 상태 | 클래스 |
|------|--------|
| Success | `bg-emerald-500/10 text-emerald-600 border border-emerald-500/20` |
| Warn | `bg-amber-500/10 text-amber-600 border border-amber-500/20` |
| Error | `bg-red-500/10 text-red-600 border border-red-500/20` |
| Info | `bg-[#c96442]/10 text-[#c96442] border border-[#c96442]/20` |

학파마다 radius·padding 톤은 다르게:
- Pentagram: `rounded-none px-2 py-1`
- Field.io: `rounded-full px-3 py-1.5`
- Kenya Hara: 사용 자제 (있다면 `rounded-none border-0 text-stone-500`)
- Linear: `rounded px-2 py-0.5`

## 사용 가이드
- Category label은 매 섹션 hero 위에 1개 — 정보 위계의 시작점
- Status badge는 페이지당 3~5개 한정 (남용 시 시각 잡음)
- KBD는 Linear 학파 시그니처 — 다른 학파엔 거의 사용 안 함
- 숫자는 항상 `tabular-nums` + `tracking-tight` (자릿수 정렬)
- letter-spacing 차이가 학파 정체성의 핵심 — Pentagram 0.08em / Field.io 0.16em / Kenya 0.32em / Linear 0.04em
