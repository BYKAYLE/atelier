---
name: navigation
description: 헤더 네비게이션 + 모바일 메뉴 + footer nav. 학파별 시그니처 헤더 패턴.
---

# Navigation — 학파별 Base Style

## Base 구조 (모든 학파 공통)
```html
<header class="sticky top-0 z-50">
  <div class="container max-w-7xl mx-auto flex items-center justify-between h-16 px-6">
    <a href="/" class="font-bold">로고</a>
    <nav class="hidden md:flex items-center gap-6">
      <a href="#products">제품</a>
      <a href="#about">회사</a>
      <a href="#contact">문의</a>
    </nav>
    <button class="md:hidden">☰</button>
  </div>
</header>
```

## 학파별 Variant

### Pentagram (Swiss 12-col, 1px hairline 하단)
```html
<header class="sticky top-0 z-50 bg-zinc-50 border-b border-zinc-200">
  <div class="max-w-7xl mx-auto flex items-center justify-between h-16 px-6 lg:px-12">
    <a href="/" class="text-xl font-extrabold text-zinc-900 tracking-tight">bykayle</a>
    <nav class="hidden md:flex items-center gap-8 text-sm">
      <a href="#products" class="text-zinc-700 hover:text-[#c96442] transition duration-150">제품</a>
      <a href="#cases" class="text-zinc-700 hover:text-[#c96442] transition duration-150">사례</a>
      <a href="#about" class="text-zinc-700 hover:text-[#c96442] transition duration-150">회사</a>
    </nav>
    <a href="#demo" class="hidden md:inline-flex items-center h-9 px-4 text-sm font-semibold bg-zinc-900 text-white hover:bg-[#c96442] transition duration-150 rounded-none">
      데모 신청
    </a>
  </div>
</header>
```

### Field.io (검정 + backdrop blur + scroll padding 축소)
```html
<header class="sticky top-0 z-50 bg-zinc-950/85 backdrop-blur-md border-b border-white/5 transition-all duration-300">
  <div class="max-w-7xl mx-auto flex items-center justify-between h-16 px-6 lg:px-12">
    <a href="/" class="text-2xl font-bold text-white tracking-tight">
      bykayle<span class="text-[#c96442]">.</span>
    </a>
    <nav class="hidden md:flex items-center gap-8 text-sm font-medium uppercase tracking-[0.04em]">
      <a href="#products" class="text-white/70 hover:text-white transition duration-300">PRODUCTS</a>
      <a href="#cases" class="text-white/70 hover:text-white transition duration-300">CASES</a>
      <a href="#about" class="text-white/70 hover:text-white transition duration-300">ABOUT</a>
    </nav>
    <a href="#demo" class="hidden md:inline-flex items-center h-10 px-6 text-xs font-semibold uppercase tracking-[0.04em] bg-[#c96442] text-white rounded-full transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-[#b3553a]">
      DEMO →
    </a>
  </div>
</header>
```

### Kenya Hara (여백 + 가는 weight + minimal nav)
```html
<header class="sticky top-0 z-50 bg-stone-50/90 backdrop-blur">
  <div class="max-w-6xl mx-auto flex items-center justify-between h-20 px-6 lg:px-12">
    <a href="/" class="text-base font-light tracking-[0.16em] uppercase text-stone-900">bykayle</a>
    <nav class="hidden md:flex items-center gap-12 text-xs font-light tracking-[0.24em] uppercase">
      <a href="#products" class="text-stone-500 hover:text-stone-900 transition duration-700">제품</a>
      <a href="#about" class="text-stone-500 hover:text-stone-900 transition duration-700">회사</a>
    </nav>
    <a href="#demo" class="hidden md:inline-flex text-xs font-light tracking-wide text-stone-900 border-b border-stone-900 pb-1 hover:text-[#c96442] hover:border-[#c96442] transition duration-700">
      데모 안내
    </a>
  </div>
</header>
```

### Linear (다크 + 6~8px radius CTA + 가벼운 weight)
```html
<header class="sticky top-0 z-50 bg-[#08090a]/80 backdrop-blur-md border-b border-white/[0.06]">
  <div class="max-w-7xl mx-auto flex items-center justify-between h-14 px-6">
    <div class="flex items-center gap-8">
      <a href="/" class="text-lg font-semibold text-white tracking-tight">bykayle</a>
      <nav class="hidden md:flex items-center gap-6 text-sm font-medium">
        <a href="#products" class="text-white/70 hover:text-white transition duration-150">Product</a>
        <a href="#docs" class="text-white/70 hover:text-white transition duration-150">Docs</a>
        <a href="#pricing" class="text-white/70 hover:text-white transition duration-150">Pricing</a>
      </nav>
    </div>
    <div class="flex items-center gap-3">
      <button class="hidden md:flex items-center gap-2 h-8 px-3 text-xs text-white/60 bg-white/[0.04] border border-white/[0.08] rounded-md hover:bg-white/[0.08]">
        검색…
        <kbd class="text-[10px] font-mono px-1 py-0 bg-white/[0.08] border border-white/[0.1] rounded">⌘K</kbd>
      </button>
      <a href="#demo" class="inline-flex items-center h-8 px-3 text-sm font-semibold bg-[#c96442] text-white rounded-md hover:bg-[#b3553a] transition duration-150">
        시작하기
      </a>
    </div>
  </div>
</header>
```

## Footer (학파별 — 간단 패턴)

### Pentagram (12-col grid, 정렬 엄격)
```html
<footer class="bg-zinc-900 text-zinc-50 py-24 px-6 lg:px-12">
  <div class="max-w-7xl mx-auto grid grid-cols-12 gap-6">
    <div class="col-span-12 md:col-span-4">
      <div class="text-2xl font-extrabold tracking-tight">bykayle</div>
      <p class="mt-4 text-sm text-white/60 max-w-xs">의료의 신뢰 + 디자인의 따뜻함이 만나는 곳.</p>
    </div>
    <nav class="col-span-6 md:col-span-2">
      <p class="text-xs font-semibold uppercase tracking-[0.08em] text-white/50 mb-4">제품</p>
      <ul class="space-y-2 text-sm"><li><a href="#" class="text-white hover:text-[#c96442]">시뮬레이터</a></li></ul>
    </nav>
    <!-- 더 ... -->
  </div>
</footer>
```

### Linear (다크 + 5단 nav)
```html
<footer class="bg-[#08090a] text-white/70 py-20 px-6 border-t border-white/[0.06]">
  <div class="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-8">
    <div class="col-span-2">
      <div class="text-lg font-semibold text-white">bykayle</div>
      <p class="mt-3 text-sm text-white/55 max-w-xs">의료 시뮬레이션의 새 기준.</p>
    </div>
    <nav><p class="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Product</p><ul class="space-y-2 text-sm"><li><a href="#" class="text-white/75 hover:text-white">Simulator</a></li></ul></nav>
    <!-- Company / Developer / Legal -->
  </div>
</footer>
```

## States 및 Mobile menu
- Sticky header는 모든 학파 공통
- Mobile (`md:` 미만): hamburger 버튼 + 클릭 시 fullscreen overlay 메뉴
- Active link: `aria-current="page"` 속성 + 학파별 시그니처 (Pentagram: `border-b-2`, Field.io: `bg-[#c96442]/10`, Kenya: `text-stone-900`, Linear: `text-white`)
- Scroll 시 헤더 변형: Field.io는 padding 축소 / Linear는 backdrop opacity 증가 / 다른 학파는 무변화

## 사용 가이드
- 헤더 한 줄 nav 항목은 4~6개 한도
- CTA는 헤더 우측 끝에 1개 (학파 톤 따름)
- 영문/한글 혼용 가능하나 학파 톤 일관 (Field.io는 영문 uppercase, Pentagram·Linear는 한글 권장)
- `bykayle` 영문명 항상 소문자
