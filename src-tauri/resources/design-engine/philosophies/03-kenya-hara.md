---
name: kenya-hara
display: 동방 미니멀 (Eastern Minimal)
stage: any
---

# Kenya Hara — 동방 미니멀의 학파

## 시각 시그니처 (한눈에 알아볼 신호)
off-white(#fafaf7) 배경에 화면 70% 이상이 그냥 비어 있다. 중앙 또는 우측에 놓인 작은 한 줄 라벨, 그 아래 가는 weight의 세리프 한 문장. 색은 단 3종(off-white/warm gray/검정)에 액센트가 한 곳만 슬며시 등장. 그림자 없음. 카드 아닌 1px hairline. 모든 transition은 600ms 이상이라 마치 종이 위 잉크가 번지듯 느리다. "비어 있는데 압도된다"는 인상.

## 핵심 신념
"비움"은 결핍이 아니라 가능성이다. 화면의 80%가 비어 있을 때, 남은 20%가 가장 강하게 말한다.
일본 무인양품(MUJI)의 디자인 철학.
근거: Kenya Hara의 "백(白)" 철학 + Naoto Fukasawa의 "without thought" + Jasper Morrison의 "super normal".

## 신호 체크리스트 (출력 전 자가 검증)
✅ DO — 이게 빠지면 Kenya Hara 아님
1. 모든 섹션 padding ≥ 96px (데스크탑) — 거대 여백이 시그니처
2. font-weight 모든 텍스트 200~400 사이만 (500 이상 금지)
3. h1은 'Noto Serif JP' 또는 'Times' 세리프 + weight 200~300
4. body는 Pretendard 300, color: #9b9890 (검정 본문 금지)
5. 색상 정확히 3+1색: #fafaf7 / #9b9890 / #1a1a18 + 액센트 #c96442 1번만
6. 카드 = border-top: 1px solid #e8e6df 만 (border 4면, box-shadow 모두 금지)
7. 라벨에 letter-spacing 0.24em ~ 0.32em (공간이 시간이 된다)
8. transition 600ms cubic-bezier(0.4,0,0.2,1) — 거의 명상적
9. 한 섹션에 자연광 photo 1장 — 그림자가 주인공인 사진 (오브젝트가 작게)
10. CTA는 버튼 아닌 텍스트 링크 + 1px 밑줄 (배경 채운 버튼 금지)

❌ DON'T — 발견 즉시 Kenya Hara 아님
- box-shadow 어떤 값이든
- font-weight ≥ 500
- 풀-블리드 hero 이미지 (사진은 작게, 여백 안에 놓음)
- 여러 색 카드/섹션 (모노톤만)
- transition < 400ms (빨라서 "느슨함" 느낌이 깨짐)
- 섹션 간 vertical spacing < 96px
- emoji, 형광색, 그라디언트
- bold/heavy h1 (거대 타이포 자체가 위반)

## 시각 어휘
- **White space**: 화면의 70~85%가 여백. 요소 간 간격 ≥ 64px.
- **Typography**: Serif(Noto Serif JP, Times) 또는 매우 가벼운 sans(SF Pro Light, Pretendard 200~400).
  weight 200~400만 사용.
- **Color palette**: off-white(#fafaf7), warm gray(#9b9890), 검정 #1a1a18 단 3색.
- **Photography**: 자연광, 단일 오브젝트, 그림자가 주인공.
- **Composition**: 중앙 집중 또는 우측 정렬. 작은 텍스트 + 거대 여백.

## 거부 패턴
- 색상 ≥ 4종
- bold/heavy weight (≥ 600)
- 그림자 box-shadow (시각적 잡음)
- 화면을 가득 채우는 hero 이미지

## 적합한 컨텍스트
프리미엄 브랜드, 명상/웰니스, 갤러리, 책/잡지 디지털판, 일본 시장 타겟.

## Atelier 사용 시 prompt 변수
- typography_family: `Noto Serif JP`, `Times`, `SF Pro Light`, `Pretendard` (weight 200~400)
- font_weight_max: 400
- whitespace_ratio: 0.75
- palette: `["#fafaf7", "#9b9890", "#1a1a18"]` + 액센트 1개 (bykayle `#c96442` 가능)
- composition: centered_or_right
- motion_curve: `cubic-bezier(0.4, 0, 0.2, 1)` (느리고 부드러움)
- duration: 600~800ms (slow, contemplative)
- radius: 0~2px

## Tailwind / inline 클래스 패턴 (5+ 스니펫)

### 스니펫 1 — Hero (centered, 거대 여백)
```html
<section style="
  background: #fafaf7;
  padding: 192px 64px 160px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; min-height: 100vh;
">
  <p style="font: 300 13px/20px 'SF Pro Light', 'Pretendard', system-ui; letter-spacing: 0.32em; text-transform: uppercase; color: #9b9890; margin: 0 0 96px;">— bykayle medical simulator</p>
  <h1 style="font: 200 56px/72px 'Noto Serif JP', 'Times', serif; color: #1a1a18; margin: 0 0 48px; max-width: 720px; letter-spacing: -0.005em;">비어 있어야<br>채울 수 있다.</h1>
  <p style="font: 300 16px/28px 'Pretendard', system-ui; color: #9b9890; max-width: 480px; margin: 0 0 96px;">의료진의 손에서 모든 변수를 비워낸다. 그 자리에 임상의 본질이 들어선다.</p>
  <a href="#demo" style="font: 300 14px/22px 'Pretendard', system-ui; color: #1a1a18; text-decoration: none; letter-spacing: 0.04em; padding-bottom: 4px; border-bottom: 1px solid #1a1a18; transition: color 600ms cubic-bezier(0.4,0,0.2,1), border-color 600ms;" onmouseover="this.style.color='#c96442'; this.style.borderColor='#c96442'" onmouseout="this.style.color='#1a1a18'; this.style.borderColor='#1a1a18'">시뮬레이터 보기</a>
</section>
```

### 스니펫 2 — 미니멀 카드 (그림자 없음, 1px hairline)
```html
<article style="
  border-top: 1px solid #e8e6df;
  padding: 96px 0;
  display: grid; grid-template-columns: 1fr 2fr; gap: 96px;
">
  <p style="font: 300 11px/18px 'Pretendard', system-ui; letter-spacing: 0.24em; text-transform: uppercase; color: #9b9890; margin: 0;">01 — 시뮬레이션</p>
  <div>
    <h3 style="font: 300 28px/40px 'Noto Serif JP', serif; color: #1a1a18; margin: 0 0 32px;">단 하나의 손동작이 전부를 결정합니다.</h3>
    <p style="font: 300 15px/26px 'Pretendard', system-ui; color: #9b9890; margin: 0; max-width: 480px;">2,000명의 의료진 데이터로 학습한 모델이 당신의 미세한 떨림까지 분석합니다.</p>
  </div>
</article>
```

### 스니펫 3 — Typography scale (200~400 only)
```css
.h1-serif { font: 200 64px/80px 'Noto Serif JP', 'Times', serif; color: #1a1a18; letter-spacing: -0.01em; }
.h2-serif { font: 300 40px/56px 'Noto Serif JP', serif; color: #1a1a18; }
.h3-serif { font: 300 28px/40px 'Noto Serif JP', serif; color: #1a1a18; }
.body-light { font: 300 15px/26px 'Pretendard', system-ui; color: #9b9890; }
.label-spaced { font: 300 11px/18px 'Pretendard', system-ui; letter-spacing: 0.24em; text-transform: uppercase; color: #9b9890; }
```

### 스니펫 4 — 텍스트 링크 (밑줄 + 슬로우 transition)
```html
<a href="#" style="
  font: 300 14px/22px 'Pretendard', system-ui;
  color: #1a1a18; text-decoration: none;
  letter-spacing: 0.04em;
  padding-bottom: 4px;
  border-bottom: 1px solid #1a1a18;
  transition: color 600ms cubic-bezier(0.4,0,0.2,1), border-color 600ms;
" onmouseover="this.style.color='#c96442'; this.style.borderColor='#c96442'" onmouseout="this.style.color='#1a1a18'; this.style.borderColor='#1a1a18'">
  자세히 →
</a>
```

### 스니펫 5 — 자연광 이미지 (그림자가 주인공)
```html
<figure style="margin: 128px 0; display: flex; flex-direction: column; align-items: center;">
  <img src="https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=1000&q=90" alt="의료 모니터에 비친 아침 빛" style="max-width: 600px; width: 100%; height: auto; display: block;">
  <figcaption style="font: 300 12px/20px 'Noto Serif JP', serif; color: #9b9890; letter-spacing: 0.04em; margin-top: 32px; text-align: center; max-width: 400px;">— 의료의 본질은 도구 너머에 있다</figcaption>
</figure>
```

### 스니펫 6 — 섹션 separator (1px hairline)
```html
<div style="max-width: 80px; height: 1px; background: #1a1a18; margin: 96px auto;"></div>
```

### 스니펫 7 — Feature 섹션 (수직 리듬, 그림자 없음)
```html
<section style="background: #fafaf7; padding: 192px 64px;">
  <div style="max-width: 960px; margin: 0 auto;">
    <p style="font: 300 11px/18px 'Pretendard', system-ui; letter-spacing: 0.32em; text-transform: uppercase; color: #9b9890; margin: 0 0 64px; text-align: center;">— 시뮬레이터의 손길</p>
    <h2 style="font: 200 56px/72px 'Noto Serif JP', 'Times', serif; color: #1a1a18; margin: 0 0 128px; text-align: center; letter-spacing: -0.005em;">단 하나의 손동작이<br>전부를 결정합니다.</h2>
    <article style="border-top: 1px solid #e8e6df; padding: 96px 0; display: grid; grid-template-columns: 1fr 2fr; gap: 96px;">
      <p style="font: 300 11px/18px 'Pretendard', system-ui; letter-spacing: 0.24em; text-transform: uppercase; color: #9b9890; margin: 0;">01 — 시뮬레이션</p>
      <div>
        <h3 style="font: 300 28px/40px 'Noto Serif JP', serif; color: #1a1a18; margin: 0 0 32px;">시간이 멈춘 듯한 정밀함.</h3>
        <p style="font: 300 15px/26px 'Pretendard', system-ui; color: #9b9890; margin: 0; max-width: 480px;">2,000명의 의료진 데이터로 학습한 모델이 당신의 미세한 떨림까지 0.05초 단위로 분석합니다.</p>
      </div>
    </article>
    <article style="border-top: 1px solid #e8e6df; padding: 96px 0; display: grid; grid-template-columns: 1fr 2fr; gap: 96px;">
      <p style="font: 300 11px/18px 'Pretendard', system-ui; letter-spacing: 0.24em; text-transform: uppercase; color: #9b9890; margin: 0;">02 — 임상 변수</p>
      <div>
        <h3 style="font: 300 28px/40px 'Noto Serif JP', serif; color: #1a1a18; margin: 0 0 32px;">실제와 같은, 다만 안전한.</h3>
        <p style="font: 300 15px/26px 'Pretendard', system-ui; color: #9b9890; margin: 0; max-width: 480px;">담낭, 맹장, 자궁 — 50종의 임상 시나리오가 한 시간 안에 펼쳐집니다.</p>
      </div>
    </article>
    <article style="border-top: 1px solid #e8e6df; padding: 96px 0; display: grid; grid-template-columns: 1fr 2fr; gap: 96px;">
      <p style="font: 300 11px/18px 'Pretendard', system-ui; letter-spacing: 0.24em; text-transform: uppercase; color: #9b9890; margin: 0;">03 — 신뢰</p>
      <div>
        <h3 style="font: 300 28px/40px 'Noto Serif JP', serif; color: #1a1a18; margin: 0 0 32px;">검증되지 않은 변수는 없습니다.</h3>
        <p style="font: 300 15px/26px 'Pretendard', system-ui; color: #9b9890; margin: 0; max-width: 480px;">대학병원 30곳의 패널이 모든 시나리오를 임상 정합성 기준으로 직접 검증했습니다.</p>
      </div>
    </article>
  </div>
</section>
```

### 스니펫 8 — Footer (여백, 텍스트 링크)
```html
<footer style="background: #fafaf7; padding: 192px 64px 96px; border-top: 1px solid #e8e6df;">
  <div style="max-width: 960px; margin: 0 auto; text-align: center;">
    <p style="font: 300 11px/18px 'Pretendard', system-ui; letter-spacing: 0.32em; text-transform: uppercase; color: #9b9890; margin: 0 0 48px;">— 데모 신청</p>
    <h2 style="font: 200 40px/56px 'Noto Serif JP', 'Times', serif; color: #1a1a18; margin: 0 0 64px;">한 번의 손동작을<br>나누고 싶다면.</h2>
    <a href="mailto:hello@bykayle.com" style="font: 300 14px/22px 'Pretendard', system-ui; color: #1a1a18; text-decoration: none; letter-spacing: 0.04em; padding-bottom: 4px; border-bottom: 1px solid #1a1a18; transition: color 600ms cubic-bezier(0.4,0,0.2,1), border-color 600ms;" onmouseover="this.style.color='#c96442'; this.style.borderColor='#c96442'" onmouseout="this.style.color='#1a1a18'; this.style.borderColor='#1a1a18'">hello@bykayle.com</a>
    <div style="max-width: 80px; height: 1px; background: #e8e6df; margin: 128px auto 32px;"></div>
    <div style="display:flex; justify-content:center; gap: 48px; font: 300 12px/20px 'Pretendard', system-ui; color: #9b9890; letter-spacing: 0.04em;"><span>© 2026 bykayle</span><span>서울</span></div>
  </div>
</footer>
```
