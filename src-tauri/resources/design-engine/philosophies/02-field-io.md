---
name: field-io
display: 운동 시학 (Motion Poetry)
stage: any
---

# Field.io — 운동 시학의 학파

## 시각 시그니처 (한눈에 알아볼 신호)
검정 캔버스 위에 거대한 PP Mori/Helvetica Now 타이포가 비대칭으로 놓여 있다. h1은 144px 이상, 의도된 들여쓰기/오프셋으로 정형 grid를 깬다. 등장 시 글자가 아래에서 위로 80ms 간격으로 stagger 되고, 버튼은 hover에 -3px 떠오른다. 색은 검정/짙은 회색 + 단일 따뜻한 액센트(#c96442) 또는 형광 1색. 시간 위에서 살아 있는 인터페이스라는 느낌이 즉시 든다.

## 핵심 신념
인터페이스는 정지 화면이 아니다. 시간 위에서 흐르는 매체다.
요소가 어떻게 등장하고 사라지는지가 곧 브랜드의 톤이다.
근거: Field.io / ActiveTheory / Resn 류 모션 디자인 스튜디오 + Apple
WWDC 모션 가이드라인.

## 신호 체크리스트 (출력 전 자가 검증)
✅ DO — 이게 빠지면 Field.io 아님
1. 배경은 검정/짙은 #0a0a0a 톤이 기본 (라이트 톤은 예외적으로만)
2. h1 ≥ 96px, 데스크탑 hero는 ≥ 120px (PP Mori/Helvetica Now/Inter Display)
3. letter-spacing: -0.03em ~ -0.04em (거대 타이포는 공간 압축)
4. `@keyframes fadeUp` 정의 + hero 자식들에 stagger animation-delay 0/80/160/240ms
5. cubic-bezier(0.22, 1, 0.36, 1) ease-out-expo만 사용 (linear/in-out 금지)
6. 버튼 hover: `transform: translateY(-3px) scale(1.02)` + 250ms transition
7. CTA 버튼은 pill (border-radius: 999px) — Pentagram의 직각과 정반대
8. 의도적 비대칭: padding-left 240px 또는 grid-column offset으로 한 요소를 시각 중심에서 비킴
9. backdrop-filter blur 한 곳 이상 (sticky header 또는 floating CTA)
10. 액센트 1색만 — bykayle #c96442 또는 형광(#00ff88, #ff5f1f) 중 택1, 혼용 금지

❌ DON'T — 발견 즉시 Field.io 아님
- 정적 hover (색만 바뀜) — 무조건 transform 동반
- 모든 요소 동시 등장 — stagger 없으면 죽은 화면
- 12-column grid에 요소 전부 정렬 (Pentagram 톤)
- 그림자 없는 평평한 카드 — 호버 시 lift + shadow 필수
- ease-linear, ease-in-out (관성감 없음)
- 페이지 색 ≥ 4종 (액센트는 1개)
- 뉴트럴 회색 long-form 본문 — short, dramatic statements 우선

## 시각 어휘
- **Motion curves**: `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-expo) — 물리적 관성.
- **Stagger**: 같은 위계 항목은 60~100ms 간격으로 순차 등장.
- **Typography in motion**: 글자 자체가 슬라이드 in/out, 크기 변화. type as motion object.
- **Color**: 진한 검정 + 형광 액센트(녹색 #00ff88, 마젠타 #ff00aa). 또는 차가운
  monochrome(#0a0a0a 베이스) + warm 단일 색.
- **Layout**: 비대칭. 큰 여백 + 갑작스런 거대 텍스트. asymmetric tension.

## 거부 패턴
- 정적 hover 효과만 (motion 없음)
- 모든 요소 동시 등장
- ease-linear / ease-in-out (관성감 없음)
- 일관된 grid 정렬 (긴장감 죽음)

## 적합한 컨텍스트
랜딩 페이지, 브랜드 사이트, 프로덕트 런칭, 영상 콘텐츠 sub-UI.

## Atelier 사용 시 prompt 변수
- typography_family: `PP Mori`, `Helvetica Now`, `Inter Display`
- accent_color: 형광 (`#00ff88`, `#ff5f1f`) 또는 깊은 단색 + warm 단일 (bykayle `#c96442`)
- spacing_system: 비대칭 — 자유 (4px baseline 위 큰 점프)
- radius: 0 또는 999px (extreme), 중간값 회피
- motion_curve: `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-expo, 강한 관성)
- duration: 400~600ms (hero), 250ms (interaction)
- stagger_ms: 80
- composition: asymmetric

## Tailwind / inline 클래스 패턴 (5+ 스니펫)

### 스니펫 1 — Hero (asymmetric, oversized type, 형광 액센트)
```html
<section style="
  background: #0a0a0a; color: #fff;
  padding: 128px 48px 96px;
  position: relative; overflow: hidden; min-height: 100vh;
">
  <div style="max-width: 1280px; margin: 0 auto; position: relative;">
    <p style="font: 500 11px/16px 'Helvetica Now', Inter; letter-spacing: 0.16em; text-transform: uppercase; color: #c96442; margin: 0 0 64px; animation: fadeUp 600ms cubic-bezier(0.22,1,0.36,1) both;">bykayle · medical simulation</p>
    <h1 style="font: 700 144px/120px 'PP Mori', 'Helvetica Now', Inter; letter-spacing: -0.04em; margin: 0 0 48px; max-width: 1100px; animation: fadeUp 700ms cubic-bezier(0.22,1,0.36,1) 80ms both;">
      훈련은<br>
      <span style="color: #c96442;">멈추지 않는다.</span>
    </h1>
    <p style="font: 400 22px/32px 'Helvetica Now', Inter; max-width: 600px; color: rgba(255,255,255,0.7); margin: 0 0 64px; margin-left: 240px; animation: fadeUp 700ms cubic-bezier(0.22,1,0.36,1) 160ms both;">의료진이 한 시간 동안 50개의 임상 변수를 만난다. 실수는 시뮬레이터에서, 자신감은 수술실에서.</p>
    <a href="#demo" style="display:inline-block; background:#c96442; color:#fff; padding:24px 48px; font:600 16px/24px 'Helvetica Now',Inter; letter-spacing:0.02em; text-transform:uppercase; border-radius:999px; transition: transform 250ms cubic-bezier(0.22,1,0.36,1), background 250ms; animation: fadeUp 700ms cubic-bezier(0.22,1,0.36,1) 240ms both;" onmouseover="this.style.transform='translateY(-3px) scale(1.02)'; this.style.background='#b3553a'" onmouseout="this.style.transform='none'; this.style.background='#c96442'">DEMO 신청 →</a>
  </div>
</section>
<style>
  @keyframes fadeUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
</style>
```

### 스니펫 2 — Stagger 카드 (등장 순차)
```html
<div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 32px;">
  <article style="background:#1a1a18; padding:48px; border-radius:0; transition: transform 400ms cubic-bezier(0.22,1,0.36,1); animation: fadeUp 600ms cubic-bezier(0.22,1,0.36,1) 0ms both;" onmouseover="this.style.transform='translateY(-12px)'" onmouseout="this.style.transform='none'">...</article>
  <article style="...animation-delay: 80ms;">...</article>
  <article style="...animation-delay: 160ms;">...</article>
</div>
```

### 스니펫 3 — 거대 typography + 비대칭 정렬
```css
.headline-xl { font: 700 144px/120px 'PP Mori', Inter; letter-spacing: -0.04em; }
.headline-lg { font: 700 96px/96px 'PP Mori', Inter; letter-spacing: -0.03em; }
.lead { font: 400 22px/32px 'Helvetica Now', Inter; }
.label-xl { font: 500 11px/16px 'Helvetica Now', Inter; letter-spacing: 0.16em; text-transform: uppercase; }
/* 비대칭: 일부러 좌측 패딩 깨고 우측은 정렬 */
.asymmetric-block { padding-left: 240px; max-width: 600px; }
@media (max-width: 768px) { .asymmetric-block { padding-left: 0; } }
```

### 스니펫 4 — 형광 / pill 버튼 (모션)
```html
<button style="
  background: #c96442; color: #fff;
  font: 600 14px/20px 'Helvetica Now', Inter; letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 18px 40px; border: 0;
  border-radius: 999px; cursor: pointer;
  transition: transform 250ms cubic-bezier(0.22,1,0.36,1), background 250ms;
" onmouseover="this.style.transform='translateY(-3px) scale(1.02)'; this.style.background='#b3553a'" onmouseout="this.style.transform='none'; this.style.background='#c96442'">데모 신청 →</button>
```

### 스니펫 5 — 텍스트 reveal (CSS-only)
```css
@keyframes textReveal {
  from { transform: translateY(110%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.reveal-line { display: inline-block; overflow: hidden; }
.reveal-line > span { display: inline-block; animation: textReveal 800ms cubic-bezier(0.22,1,0.36,1) both; }
.reveal-line:nth-child(1) > span { animation-delay: 0ms; }
.reveal-line:nth-child(2) > span { animation-delay: 80ms; }
.reveal-line:nth-child(3) > span { animation-delay: 160ms; }
```

### 스니펫 6 — Sticky scroll header (축소)
```html
<header style="
  position: sticky; top: 0; z-index: 50;
  background: rgba(10,10,10,0.85); backdrop-filter: blur(12px);
  padding: 24px 48px;
  transition: padding 250ms cubic-bezier(0.22,1,0.36,1);
  display: flex; align-items: center; justify-content: space-between;
">
  <a href="/" style="font: 700 18px/24px 'PP Mori', Inter; color:#fff; letter-spacing:-0.01em;">bykayle</a>
  <nav style="display:flex; gap: 32px;"><a href="#products" style="color:#fff; text-decoration:none; font:500 14px/20px Inter;">제품</a></nav>
</header>
```

### 스니펫 7 — Feature 그리드 (stagger reveal + lift hover)
```html
<section style="background: #0a0a0a; color: #fff; padding: 160px 48px;">
  <div style="max-width: 1280px; margin: 0 auto;">
    <p style="font: 500 11px/16px 'Helvetica Now', Inter; letter-spacing: 0.16em; text-transform: uppercase; color: #c96442; margin: 0 0 32px;">— capability</p>
    <h2 style="font: 700 96px/96px 'PP Mori', 'Helvetica Now', Inter; letter-spacing: -0.03em; margin: 0 0 96px; max-width: 900px;">시간 위에서<br>훈련이 살아 움직인다.</h2>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px;">
      <article style="background: #1a1a18; padding: 48px 40px; border-radius: 0; transition: transform 400ms cubic-bezier(0.22,1,0.36,1), background 400ms; animation: fadeUp 700ms cubic-bezier(0.22,1,0.36,1) 0ms both;" onmouseover="this.style.transform='translateY(-12px)'; this.style.background='#252522'" onmouseout="this.style.transform='none'; this.style.background='#1a1a18'">
        <div style="font: 700 64px/64px 'PP Mori', Inter; color: #c96442; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;">01</div>
        <h3 style="font: 600 24px/32px 'Helvetica Now', Inter; color: #fff; margin: 32px 0 16px; letter-spacing: -0.01em;">실시간 변수 50종</h3>
        <p style="font: 400 16px/26px 'Helvetica Now', Inter; color: rgba(255,255,255,0.6); margin: 0;">담낭·맹장·자궁 — 실제 임상에서 마주치는 모든 분기를 시간 흐름 그대로 재현.</p>
      </article>
      <article style="background: #1a1a18; padding: 48px 40px; border-radius: 0; transition: transform 400ms cubic-bezier(0.22,1,0.36,1), background 400ms; animation: fadeUp 700ms cubic-bezier(0.22,1,0.36,1) 80ms both;" onmouseover="this.style.transform='translateY(-12px)'; this.style.background='#252522'" onmouseout="this.style.transform='none'; this.style.background='#1a1a18'">
        <div style="font: 700 64px/64px 'PP Mori', Inter; color: #c96442; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;">02</div>
        <h3 style="font: 600 24px/32px 'Helvetica Now', Inter; color: #fff; margin: 32px 0 16px; letter-spacing: -0.01em;">손동작 분석 AI</h3>
        <p style="font: 400 16px/26px 'Helvetica Now', Inter; color: rgba(255,255,255,0.6); margin: 0;">2,000명의 의료진 데이터로 학습한 모델이 미세 떨림까지 0.05초 단위로 평가.</p>
      </article>
      <article style="background: #1a1a18; padding: 48px 40px; border-radius: 0; transition: transform 400ms cubic-bezier(0.22,1,0.36,1), background 400ms; animation: fadeUp 700ms cubic-bezier(0.22,1,0.36,1) 160ms both;" onmouseover="this.style.transform='translateY(-12px)'; this.style.background='#252522'" onmouseout="this.style.transform='none'; this.style.background='#1a1a18'">
        <div style="font: 700 64px/64px 'PP Mori', Inter; color: #c96442; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;">03</div>
        <h3 style="font: 600 24px/32px 'Helvetica Now', Inter; color: #fff; margin: 32px 0 16px; letter-spacing: -0.01em;">병원 단위 도입</h3>
        <p style="font: 400 16px/26px 'Helvetica Now', Inter; color: rgba(255,255,255,0.6); margin: 0;">대학병원·수련병원 30곳에서 검증. 기관 단위 라이선스로 전체 수련의 동시 훈련.</p>
      </article>
    </div>
  </div>
</section>
<style>@keyframes fadeUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }</style>
```

### 스니펫 8 — Footer (검정 + 거대 typography signature)
```html
<footer style="background: #0a0a0a; color: #fff; padding: 160px 48px 64px; position: relative; overflow: hidden;">
  <div style="max-width: 1280px; margin: 0 auto;">
    <h2 style="font: 700 144px/120px 'PP Mori', 'Helvetica Now', Inter; letter-spacing: -0.04em; margin: 0 0 96px; max-width: 1100px;">훈련은<br><span style="color:#c96442;">계속된다.</span></h2>
    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 48px; padding-top: 64px; border-top: 1px solid rgba(255,255,255,0.12);">
      <div>
        <a href="mailto:hello@bykayle.com" style="display:inline-block; background:#c96442; color:#fff; padding:24px 48px; font:600 16px/24px 'Helvetica Now',Inter; letter-spacing:0.04em; text-transform:uppercase; border-radius:999px; text-decoration:none; transition: transform 250ms cubic-bezier(0.22,1,0.36,1), background 250ms;" onmouseover="this.style.transform='translateY(-3px) scale(1.02)'; this.style.background='#b3553a'" onmouseout="this.style.transform='none'; this.style.background='#c96442'">DEMO 신청 →</a>
      </div>
      <nav><p style="font: 500 11px/16px 'Helvetica Now', Inter; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 0 0 16px;">PRODUCT</p><ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px;"><li><a href="#" style="color:#fff; text-decoration:none; font:500 14px/22px 'Helvetica Now',Inter;">Simulator</a></li><li><a href="#" style="color:#fff; text-decoration:none; font:500 14px/22px 'Helvetica Now',Inter;">Analytics</a></li></ul></nav>
      <nav><p style="font: 500 11px/16px 'Helvetica Now', Inter; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 0 0 16px;">COMPANY</p><ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px;"><li><a href="#" style="color:#fff; text-decoration:none; font:500 14px/22px 'Helvetica Now',Inter;">About</a></li><li><a href="#" style="color:#fff; text-decoration:none; font:500 14px/22px 'Helvetica Now',Inter;">Press</a></li></ul></nav>
    </div>
    <div style="display:flex; justify-content:space-between; padding-top:48px; margin-top:64px; border-top: 1px solid rgba(255,255,255,0.12);"><span style="font: 400 12px/20px 'Helvetica Now', Inter; color: rgba(255,255,255,0.4); letter-spacing: 0.04em;">© 2026 bykayle</span><span style="font: 400 12px/20px 'Helvetica Now', Inter; color: rgba(255,255,255,0.4); letter-spacing: 0.04em;">Seoul · Tokyo</span></div>
  </div>
</footer>
```
