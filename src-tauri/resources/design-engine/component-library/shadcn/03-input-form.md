---
name: input-form
description: shadcn Input + Label + Form 조합. 데모 신청 / 이메일 구독 / 검색 박스 등 폼 패턴.
---

# Input + Form — 학파별 Base Style

## Base 구조 (모든 학파 공통)
```html
<form class="flex flex-col gap-2">
  <label for="email" class="text-xs font-medium tracking-wide">이메일</label>
  <input type="email" id="email" placeholder="you@hospital.com" class="...">
  <p class="text-xs opacity-60">전송된 이메일은 데모 안내에만 사용됩니다.</p>
</form>
```

## 학파별 Variant

### Pentagram (직각 + 1px 보더)
```html
<form class="flex flex-col md:flex-row gap-3 max-w-2xl">
  <div class="flex-1">
    <label for="email" class="block text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 mb-2">이메일</label>
    <input type="email" id="email" placeholder="you@hospital.com" class="w-full h-11 px-4 text-base text-zinc-900 bg-white border border-zinc-900 rounded-none placeholder:text-zinc-400 focus:outline-2 focus:outline-[#c96442] focus:outline-offset-[-2px] transition duration-150">
  </div>
  <button type="submit" class="h-11 px-6 mt-7 text-sm font-semibold bg-zinc-900 text-white hover:bg-[#c96442] transition duration-150 rounded-none whitespace-nowrap">
    데모 신청 →
  </button>
</form>
```

### Field.io (검정 배경 + pill input + dramatic CTA)
```html
<form class="flex flex-col md:flex-row gap-4 items-stretch max-w-2xl">
  <input type="email" placeholder="EMAIL ADDRESS" class="flex-1 h-14 px-6 text-base text-white bg-white/5 border border-white/10 rounded-full placeholder:text-white/40 placeholder:uppercase placeholder:tracking-[0.04em] focus:outline-2 focus:outline-[#c96442] focus:outline-offset-2 transition duration-300 backdrop-blur">
  <button type="submit" class="h-14 px-8 text-sm font-semibold uppercase tracking-[0.04em] bg-[#c96442] text-white rounded-full transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:scale-[1.02] hover:bg-[#b3553a] whitespace-nowrap">
    REQUEST DEMO →
  </button>
</form>
```

### Kenya Hara (밑줄 input + 텍스트 링크 submit)
```html
<form class="flex flex-col gap-8 max-w-md mx-auto text-center">
  <div>
    <label for="email" class="block text-xs font-light tracking-[0.32em] uppercase text-stone-500 mb-6">— 이메일</label>
    <input type="email" id="email" placeholder="" class="w-full text-center text-2xl font-light text-stone-900 bg-transparent border-0 border-b border-stone-300 rounded-none focus:outline-none focus:border-[#c96442] transition duration-700 placeholder:text-stone-300 py-3">
  </div>
  <button type="submit" class="self-center text-sm font-light tracking-wide text-stone-900 border-b border-stone-900 pb-1 transition duration-700 ease-in-out hover:text-[#c96442] hover:border-[#c96442]">
    보내기
  </button>
</form>
```

### Linear (8px radius + dark background + subtle accent)
```html
<form class="flex flex-col gap-3 max-w-md">
  <label for="email" class="text-xs font-medium text-white/70">이메일</label>
  <div class="flex gap-2">
    <input type="email" id="email" placeholder="you@hospital.com" class="flex-1 h-9 px-3 text-sm text-white bg-white/[0.03] border border-white/10 rounded-md placeholder:text-white/30 focus:outline-2 focus:outline-[#c96442] focus:outline-offset-2 focus:border-[#c96442]/40 transition duration-150">
    <button type="submit" class="h-9 px-4 text-sm font-semibold bg-[#c96442] text-white rounded-md hover:bg-[#b3553a] active:scale-[0.98] transition duration-150 whitespace-nowrap">
      신청
    </button>
  </div>
  <p class="text-xs text-white/40">데모는 평일 오전 답변드립니다.</p>
</form>
```

## States (모든 학파 공통)
- **default**: 위 명시
- **focus**: outline-2 [#c96442] (Kenya는 border-bottom 색 변화)
- **hover (input)**: border 색 살짝 진해짐 또는 무변화
- **disabled**: `disabled:opacity-40 disabled:cursor-not-allowed`
- **error**: `aria-invalid:border-red-500 aria-invalid:focus:outline-red-500`
- **success**: `aria-valid:border-emerald-500`

## 추가 패턴

### Floating label (Pentagram·Linear)
```html
<div class="relative">
  <input type="email" id="email" placeholder=" " class="peer w-full h-11 px-3 pt-4 pb-1 ...">
  <label for="email" class="absolute left-3 top-3 text-xs font-medium opacity-60 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-focus:top-1 peer-focus:text-xs">이메일</label>
</div>
```

### Validation message
```html
<input type="email" aria-describedby="email-help" class="...">
<p id="email-help" class="text-xs text-red-500 mt-1" hidden>유효한 이메일을 입력해주세요.</p>
```

## 사용 가이드
- 모든 input에 `<label>` 필수 (접근성). `id`/`for` 매칭
- `placeholder`는 예시용만, 라벨 대체 X
- 학파 톤: Pentagram은 직각 1px stroke / Field.io는 pill backdrop / Kenya는 밑줄만 / Linear는 8px round + 다크
- submit 버튼은 button.md의 학파 variant 따름
