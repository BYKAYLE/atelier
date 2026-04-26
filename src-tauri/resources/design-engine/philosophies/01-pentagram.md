---
name: pentagram
display: 정보 건축 (Information Architecture)
stage: any
---

# Pentagram — 정보 건축의 학파

## 시각 시그니처 (한눈에 알아볼 신호)
끝없이 정렬된 12-column grid. 직각 모서리. 굵은 sans-serif h1과 가는 body의 1.5배 이상 차이. 색은 검정 베이스에 단일 액센트만. hover는 0.15초 이내 색 변화 — 움직임은 없다. 처음 보는 사람도 0.5초 안에 "이건 정확하게 만든 정보 시스템이다"라고 느낀다.

## 핵심 신념
디자인은 "보이는 그림"이 아니라 "조직된 정보"다. 한 화면이 100개의 사실을 담아도,
사용자가 가장 중요한 1개를 0.5초 안에 인지하지 못하면 실패다.
근거: Massimo Vignelli, Paula Scher, Michael Bierut 류의 Swiss-International typography
계보 + 정보 위계 우선의 모더니즘.

## 신호 체크리스트 (출력 전 자가 검증)
✅ DO — 이게 빠지면 Pentagram 아님
1. 12-column 그리드를 최소 한 섹션에서 명시적으로 사용 (`grid-template-columns: repeat(12, 1fr)`)
2. h1 ≥ 64px, body 16~18px — 위계 비율 ≥ 1.5x
3. label은 11px uppercase + letter-spacing 0.08em (눈에 띄는 시그니처)
4. 색상 ≤ 3종: 검정/회색 + 액센트 1개. 액센트는 1~2번만 등장
5. border-radius 0~4px만 (8px 이상 금지)
6. 카드 사이 1px 검정 stroke 또는 1px hairline (e8e6df) — 그림자 대신
7. 숫자는 `font-variant-numeric: tabular-nums` (정렬되는 자릿수)
8. `tabular-nums` 통계 카드 1개 이상 (impressive 숫자 + uppercase 라벨)
9. transition은 150ms cubic-bezier(0.4,0,0.2,1) 색·배경만
10. semantic HTML: `<section>`, `<article>`, `<table>` — div soup 금지

❌ DON'T — 발견 즉시 Pentagram 아님
- 그라디언트 배경 (`linear-gradient(...)`) — 단 1픽셀도 금지
- box-shadow 카드 lift (전부 1px stroke로 대체)
- 둥근 모서리 ≥ 12px
- 형광색·파스텔 (Field.io 톤)
- emoji 또는 아이콘 폰트 장식
- 거대 fade/slide 애니메이션
- 비대칭 의도된 어긋남 — 모든 것이 grid에 정렬돼야 한다

## 시각 어휘
- **Grid**: Swiss 12-column, 베이스라인 8px. 모든 요소가 grid에 정렬.
- **Type**: Sans-serif (Inter, Söhne, Helvetica Now) — geometric, 중립적. Display는 굵게(700~900),
  body는 가볍게(400). 행간 1.4~1.6.
- **Color**: 무채색 베이스(#000~#fafafa) + 단일 액센트. 의미가 있을 때만 색을 쓴다.
- **Hierarchy**: 크기 차이 ≥ 1.5x. 같은 위계의 요소는 정확히 같은 크기.

## 거부 패턴
- 그라디언트 (정보를 흐릿하게 만든다)
- 둥근 모서리 ≥ 12px (geometric 정확성을 무너뜨린다)
- 장식적 일러스트 (정보 밀도를 떨어뜨린다)
- 애니메이션 fade/slide (인지 부담)

## 적합한 컨텍스트
대시보드, 보고서, 데이터 시각화, B2B 도구, 문서 시스템.

## Atelier 사용 시 prompt 변수
- typography_family: `Inter`, `Söhne`, `Helvetica Neue`
- accent_color: 단일 (예: 채도 낮은 blue `#2c5282`, 또는 bykayle primary `#c96442`)
- spacing_system: 4px baseline, scale [4, 8, 12, 16, 24, 32, 48, 64, 96]
- radius: 0~4px
- motion_curve: `cubic-bezier(0.4, 0, 0.2, 1)` (linear-ish, 인지 방해 최소)
- duration: 150ms (fast, 거의 instant)

## Tailwind / inline 클래스 패턴 (5+ 스니펫)

### 스니펫 1 — Hero (Swiss grid, geometric)
```html
<section style="
  padding: 96px 64px;
  background: #fafafa;
  border-bottom: 1px solid #1a1a18;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 24px;
">
  <div style="grid-column: 1 / span 7;">
    <p style="font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: #c96442; margin: 0 0 24px;">의료 시뮬레이터 · bykayle</p>
    <h1 style="font: 800 72px/80px Inter; letter-spacing: -0.02em; color: #1a1a18; margin: 0 0 32px;">임상 그대로의<br>훈련 시스템</h1>
    <p style="font: 400 18px/28px Inter; color: #4a4a47; max-width: 560px; margin: 0 0 48px;">2,000명 이상의 의료진이 검증한 시뮬레이션 플랫폼. 실제 임상 변수를 그대로 재현합니다.</p>
    <a href="#demo" style="display: inline-block; background: #1a1a18; color: #fff; padding: 16px 32px; font: 600 16px/24px Inter; border-radius: 0; transition: background 150ms cubic-bezier(0.4,0,0.2,1);" onmouseover="this.style.background='#c96442'" onmouseout="this.style.background='#1a1a18'">데모 신청 →</a>
  </div>
  <div style="grid-column: 8 / span 5;"><img src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&q=85" alt="의료 시뮬레이터" style="width:100%; height:auto; display:block; border-radius: 0;"></div>
</section>
```

### 스니펫 2 — 데이터 카드 그리드 (직각, 1px stroke)
```html
<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #1a1a18; border: 1px solid #1a1a18;">
  <article style="background: #fafafa; padding: 32px; transition: background 150ms;" onmouseover="this.style.background='#fff'" onmouseout="this.style.background='#fafafa'">
    <div style="font: 800 48px/56px Inter; color: #1a1a18; letter-spacing: -0.015em;">2,847</div>
    <div style="font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: #9b9890; margin-top: 8px;">검증 의료진</div>
  </article>
  <!-- 3개 더 동일 패턴 -->
</div>
```

### 스니펫 3 — 본문 typography (크기 비율 1.5x)
```css
.h1 { font: 800 64px/72px Inter; letter-spacing: -0.02em; color: #1a1a18; }
.h2 { font: 700 40px/48px Inter; letter-spacing: -0.015em; color: #1a1a18; }
.h3 { font: 700 24px/32px Inter; letter-spacing: -0.005em; color: #1a1a18; }
.body { font: 400 16px/24px Inter; color: #4a4a47; }
.label { font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: #9b9890; }
```

### 스니펫 4 — 버튼 (geometric, 0 radius)
```html
<button style="
  background: #1a1a18; color: #fff;
  font: 600 14px/20px Inter; letter-spacing: 0.01em;
  padding: 14px 28px;
  border: 0; border-radius: 0;
  cursor: pointer;
  transition: background 150ms cubic-bezier(0.4,0,0.2,1);
" onmouseover="this.style.background='#c96442'" onmouseout="this.style.background='#1a1a18'">자세히 보기 →</button>
```

### 스니펫 5 — 표/데이터 행 (정확한 정렬, 1px line)
```html
<table style="width: 100%; border-collapse: collapse; font: 400 14px/22px Inter;">
  <thead><tr style="border-bottom: 2px solid #1a1a18;"><th style="text-align:left; padding: 16px 0; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; color: #9b9890;">시나리오</th><th style="text-align:right; padding: 16px 0; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; color: #9b9890;">완료율</th></tr></thead>
  <tbody>
    <tr style="border-bottom: 1px solid #e8e6df;"><td style="padding: 16px 0; color: #1a1a18;">복강경 수술 — 담낭절제</td><td style="padding: 16px 0; text-align: right; color: #1a1a18; font-variant-numeric: tabular-nums;">87.3%</td></tr>
  </tbody>
</table>
```

### 스니펫 6 — Feature 섹션 (1px stroke 그리드, 통계 강조)
```html
<section style="background: #fafafa; padding: 96px 64px;">
  <div style="max-width: 1280px; margin: 0 auto;">
    <div style="display: grid; grid-template-columns: repeat(12, 1fr); gap: 24px; margin-bottom: 64px;">
      <p style="grid-column: 1 / span 3; font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: #9b9890; margin: 0;">— 시뮬레이션 능력</p>
      <h2 style="grid-column: 4 / span 8; font: 700 48px/56px Inter; letter-spacing: -0.015em; color: #1a1a18; margin: 0;">임상 변수 50종을<br>한 시간 안에 만난다.</h2>
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #1a1a18; border: 1px solid #1a1a18;">
      <article style="background: #fafafa; padding: 40px 32px;">
        <div style="font: 800 56px/64px Inter; color: #1a1a18; letter-spacing: -0.02em; font-variant-numeric: tabular-nums;">2,847</div>
        <div style="font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: #9b9890; margin-top: 12px;">검증 의료진</div>
        <p style="font: 400 14px/22px Inter; color: #4a4a47; margin: 24px 0 0;">대학병원 수련의·전문의 패널이 직접 임상 시나리오를 검증.</p>
      </article>
      <article style="background: #fafafa; padding: 40px 32px;">
        <div style="font: 800 56px/64px Inter; color: #1a1a18; letter-spacing: -0.02em; font-variant-numeric: tabular-nums;">52</div>
        <div style="font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: #9b9890; margin-top: 12px;">임상 시나리오</div>
        <p style="font: 400 14px/22px Inter; color: #4a4a47; margin: 24px 0 0;">담낭·맹장·자궁 등 핵심 술기를 모두 포함.</p>
      </article>
      <article style="background: #fafafa; padding: 40px 32px;">
        <div style="font: 800 56px/64px Inter; color: #1a1a18; letter-spacing: -0.02em; font-variant-numeric: tabular-nums;">87.3%</div>
        <div style="font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: #9b9890; margin-top: 12px;">완료율</div>
        <p style="font: 400 14px/22px Inter; color: #4a4a47; margin: 24px 0 0;">8주 훈련 후 평균 임상 완료율.</p>
      </article>
      <article style="background: #fafafa; padding: 40px 32px;">
        <div style="font: 800 56px/64px Inter; color: #c96442; letter-spacing: -0.02em; font-variant-numeric: tabular-nums;">−42%</div>
        <div style="font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: #9b9890; margin-top: 12px;">실수율 감소</div>
        <p style="font: 400 14px/22px Inter; color: #4a4a47; margin: 24px 0 0;">시뮬레이터 8주 훈련 후 임상 환경 실수.</p>
      </article>
    </div>
  </div>
</section>
```

### 스니펫 7 — Footer (Swiss, 정렬 엄격)
```html
<footer style="background: #1a1a18; color: #fafafa; padding: 96px 64px 48px;">
  <div style="max-width: 1280px; margin: 0 auto; display: grid; grid-template-columns: repeat(12, 1fr); gap: 24px;">
    <div style="grid-column: 1 / span 4;">
      <div style="font: 800 24px/32px Inter; letter-spacing: -0.01em; margin-bottom: 16px;">bykayle</div>
      <p style="font: 400 14px/22px Inter; color: rgba(255,255,255,0.6); margin: 0; max-width: 280px;">의료의 신뢰 + 디자인의 따뜻함이 만나는 곳.</p>
    </div>
    <nav style="grid-column: 5 / span 2;">
      <p style="font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 0 0 16px;">제품</p>
      <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;"><li><a href="#" style="color:#fafafa; text-decoration:none; font:400 14px/22px Inter;">시뮬레이터</a></li><li><a href="#" style="color:#fafafa; text-decoration:none; font:400 14px/22px Inter;">애널리틱스</a></li></ul>
    </nav>
    <nav style="grid-column: 7 / span 2;">
      <p style="font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 0 0 16px;">회사</p>
      <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;"><li><a href="#" style="color:#fafafa; text-decoration:none; font:400 14px/22px Inter;">소개</a></li><li><a href="#" style="color:#fafafa; text-decoration:none; font:400 14px/22px Inter;">블로그</a></li></ul>
    </nav>
    <div style="grid-column: 9 / span 4;">
      <p style="font: 600 11px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 0 0 16px;">데모 신청</p>
      <p style="font: 400 14px/22px Inter; color: rgba(255,255,255,0.7); margin: 0 0 16px;">병원·기관 단위 도입 문의는 직접 연락드립니다.</p>
      <a href="mailto:hello@bykayle.com" style="font: 600 14px/22px Inter; color:#c96442; text-decoration:none; border-bottom:1px solid #c96442; padding-bottom: 2px;">hello@bykayle.com →</a>
    </div>
    <div style="grid-column: 1 / span 12; border-top: 1px solid rgba(255,255,255,0.12); padding-top: 32px; margin-top: 64px; display:flex; justify-content:space-between;">
      <span style="font: 400 12px/20px Inter; color: rgba(255,255,255,0.5);">© 2026 bykayle</span>
      <span style="font: 400 12px/20px Inter; color: rgba(255,255,255,0.5);">서울특별시</span>
    </div>
  </div>
</footer>
```
