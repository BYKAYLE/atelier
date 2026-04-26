---
name: linear
display: 기능 정밀 (Functional Polish)
stage: any
---

# Linear — 기능 정밀의 학파

## 시각 시그니처 (한눈에 알아볼 신호)
배경은 거의 검정에 가까운 깊은 다크(#08090a) 또는 매끈한 라이트(#fafbfc). 인터페이스 자체가 제품의 데모처럼 보이는, 고밀도·정밀·기능 위주의 인터페이스. 모든 요소에 1px 미세 hairline + 8px radius + subtle 그라디언트 + 그림자 ≤1단. 폰트는 Inter 또는 SF Pro Display 가벼운 weight(400~600). 0.5초 안에 "이건 진지한 SaaS 도구다"라는 인상을 준다. Pentagram의 정보 위계 우선과 Field.io의 드라마틱함 사이 — 정밀한 기능 데모 중심.

## 핵심 신념
인터페이스가 제품 자체다. 페이지가 곧 기능 데모. 카피보다 실제 동작 화면이 더 강력하게 말한다.
근거: Linear / Vercel / Raycast / Arc 류 SaaS landing 트렌드. 제품 내부 UI 스크린샷을 그대로 hero에 박는 패턴.

## 신호 체크리스트 (출력 전 자가 검증)
✅ DO — 이게 빠지면 Linear 아님
1. 배경: 다크 `#08090a` 또는 라이트 `#fafbfc` 중 택1 (둘 사이 어중간 색 금지)
2. 폰트: Inter 또는 SF Pro Display, weight 400~600 (700 이상 매우 절제)
3. h1: 56~72px / weight 600 / letter-spacing -0.02em (Field.io의 700/거대보다 작고 가볍게)
4. 모든 카드/버튼 border-radius **6~8px 고정** (4px 또는 16px 금지)
5. **subtle 그라디언트** 1~2개 — hero 배경 또는 큰 카드에 `linear-gradient(180deg, rgba(255,255,255,0.04), transparent)` 류 미세 광택
6. 1px hairline 보더 어디에나 (`border: 1px solid rgba(255,255,255,0.06)` 또는 `rgba(0,0,0,0.06)`)
7. 그림자는 매우 subtle — `0 1px 2px rgba(0,0,0,0.08)` 한 단계만
8. 제품 내부 스크린샷/UI mockup 같은 이미지 hero에 1개 이상 (placeholder 아닌 진짜 인터페이스 이미지)
9. **Keyboard shortcut 표시** — `<kbd>` 태그로 단축키 1개 이상 등장 (예: `⌘K` 검색)
10. 액센트는 단일 컬러 (보통 청보라 #5e6ad2 또는 bykayle #c96442) + 의미색은 절제 사용

❌ DON'T — 발견 즉시 Linear 아님
- 형광색·강한 채도색
- bold weight ≥ 700 hero typography
- 거대 fade/slide animation (kenya-hara 톤)
- 12-col swiss grid에 강박적 정렬 (Pentagram 톤)
- box-shadow 깊은 그림자 (lg/xl)
- 그라디언트 ≥ 3종 (Stripe 톤) — Linear는 절제된 단일 그라디언트
- 둥근 pill 버튼 999px (Field.io 톤)
- 거대 typography 144px (Field.io 톤)

## 적합한 컨텍스트
SaaS 대시보드, 개발자 도구, 데이터 분석 제품, B2B 워크스페이스, 생산성 앱.

## Atelier 사용 시 prompt 변수
- typography_family: `Inter`, `SF Pro Display`, `Pretendard`
- accent_color: `#5e6ad2` (Linear blue) 또는 bykayle `#c96442` 단일
- spacing_system: 4px baseline, scale [4, 8, 12, 16, 24, 32, 48, 64]
- radius: 6~8px 고정 (단일 토큰 권장)
- motion_curve: `cubic-bezier(0.4, 0, 0.2, 1)` ease-in-out
- duration: 150~200ms (snappy, instant)
- composition: 단일 컬럼 hero + grid 섹션 혼합. asymmetric 자제

## Tailwind / inline 클래스 패턴 (5+ 스니펫)

### 스니펫 1 — Hero (다크, 제품 mockup + subtle 그라디언트)
```html
<section style="
  position: relative;
  background: #08090a;
  color: #fafbfc;
  padding: 96px 48px 0;
  overflow: hidden;
">
  <div style="position: absolute; inset: 0; background: radial-gradient(circle at 50% -20%, rgba(94, 106, 210, 0.12), transparent 60%); pointer-events: none;"></div>
  <div style="max-width: 1200px; margin: 0 auto; position: relative; text-align: center;">
    <p style="font: 500 13px/20px Inter, sans-serif; letter-spacing: 0.04em; color: rgba(250,251,252,0.6); margin: 0 0 24px;">의료 시뮬레이터 · bykayle</p>
    <h1 style="font: 600 64px/72px Inter, sans-serif; letter-spacing: -0.02em; margin: 0 0 24px; max-width: 800px; margin-left: auto; margin-right: auto;">임상 그대로의 훈련을<br>한 줄 명령으로</h1>
    <p style="font: 400 18px/28px Inter, sans-serif; color: rgba(250,251,252,0.7); max-width: 600px; margin: 0 auto 40px;">2,000명의 의료진이 검증한 시뮬레이션 시나리오를, 단축키 한 번으로 실행합니다. <kbd style="font: 500 12px/16px ui-monospace, monospace; padding: 3px 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; color: #fff;">⌘K</kbd> 검색.</p>
    <div style="display: inline-flex; gap: 8px;">
      <a href="#demo" style="background: #c96442; color: #fff; padding: 12px 20px; font: 600 14px/20px Inter, sans-serif; border-radius: 6px; text-decoration: none; transition: background 150ms cubic-bezier(0.4,0,0.2,1);" onmouseover="this.style.background='#b3553a'" onmouseout="this.style.background='#c96442'">데모 신청</a>
      <a href="#docs" style="background: rgba(255,255,255,0.06); color: #fafbfc; padding: 12px 20px; font: 500 14px/20px Inter, sans-serif; border-radius: 6px; text-decoration: none; border: 1px solid rgba(255,255,255,0.08); transition: background 150ms;" onmouseover="this.style.background='rgba(255,255,255,0.10)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">문서 →</a>
    </div>
    <div style="margin-top: 80px; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; box-shadow: 0 24px 48px rgba(0,0,0,0.5); background: #0e0f12;">
      <img src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1600&q=85" alt="bykayle 시뮬레이터 인터페이스" loading="lazy" style="display: block; width: 100%; height: auto;">
    </div>
  </div>
</section>
```

### 스니펫 2 — Feature row (좌측 텍스트 + 우측 mockup)
```html
<section style="background: #08090a; padding: 128px 48px;">
  <div style="max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1.3fr; gap: 96px; align-items: center;">
    <div>
      <p style="font: 500 12px/16px Inter; letter-spacing: 0.08em; text-transform: uppercase; color: #5e6ad2; margin: 0 0 16px;">Capability</p>
      <h2 style="font: 600 40px/48px Inter; letter-spacing: -0.015em; color: #fafbfc; margin: 0 0 20px;">손동작을 0.05초 단위로</h2>
      <p style="font: 400 16px/26px Inter; color: rgba(250,251,252,0.65); margin: 0 0 24px;">2,000명의 의료진 데이터로 학습한 모델이 시뮬레이션 중 모든 미세 떨림을 실시간으로 측정합니다.</p>
      <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px;">
        <li style="display: flex; align-items: center; gap: 10px; font: 400 14px/22px Inter; color: rgba(250,251,252,0.85);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5e6ad2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          담낭·맹장·자궁 50종 시나리오
        </li>
        <li style="display: flex; align-items: center; gap: 10px; font: 400 14px/22px Inter; color: rgba(250,251,252,0.85);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5e6ad2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          병원 단위 동시 라이선스
        </li>
        <li style="display: flex; align-items: center; gap: 10px; font: 400 14px/22px Inter; color: rgba(250,251,252,0.85);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5e6ad2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          REST API · CSV export
        </li>
      </ul>
    </div>
    <div style="border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.3);">
      <img src="https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=1200&q=85" alt="훈련 중 손동작 분석 화면" loading="lazy" style="display: block; width: 100%; height: auto;">
    </div>
  </div>
</section>
```

### 스니펫 3 — 3-card 그리드 (1px hairline, subtle hover)
```html
<section style="background: #08090a; padding: 96px 48px; border-top: 1px solid rgba(255,255,255,0.06);">
  <div style="max-width: 1200px; margin: 0 auto;">
    <h2 style="font: 600 32px/40px Inter; letter-spacing: -0.01em; color: #fafbfc; margin: 0 0 48px; text-align: center;">왜 bykayle인가</h2>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
      <article style="padding: 32px; background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; transition: border-color 150ms, background 150ms;" onmouseover="this.style.borderColor='rgba(94,106,210,0.30)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.06)'">
        <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(94,106,210,0.12); display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e6ad2" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <h3 style="font: 600 18px/26px Inter; color: #fafbfc; margin: 0 0 12px;">실시간 분석</h3>
        <p style="font: 400 14px/22px Inter; color: rgba(250,251,252,0.65); margin: 0;">시뮬레이션 중 손동작·시선·반응 시간이 0.05초 단위로 기록됩니다.</p>
      </article>
      <article style="padding: 32px; background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;" onmouseover="this.style.borderColor='rgba(94,106,210,0.30)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.06)'">
        <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(94,106,210,0.12); display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e6ad2" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <h3 style="font: 600 18px/26px Inter; color: #fafbfc; margin: 0 0 12px;">세션 리포트</h3>
        <p style="font: 400 14px/22px Inter; color: rgba(250,251,252,0.65); margin: 0;">훈련 후 PDF·CSV로 자동 export. LMS 연동 가능.</p>
      </article>
      <article style="padding: 32px; background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;" onmouseover="this.style.borderColor='rgba(94,106,210,0.30)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.06)'">
        <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(94,106,210,0.12); display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e6ad2" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        </div>
        <h3 style="font: 600 18px/26px Inter; color: #fafbfc; margin: 0 0 12px;">기관 단위</h3>
        <p style="font: 400 14px/22px Inter; color: rgba(250,251,252,0.65); margin: 0;">병원·수련 기관 단위 라이선스로 전체 의료진 동시 사용.</p>
      </article>
    </div>
  </div>
</section>
```

### 스니펫 4 — 버튼 (Linear 표준 — 6px radius, snappy)
```html
<button style="
  background: #c96442; color: #fff;
  font: 600 14px/20px Inter, sans-serif;
  padding: 10px 16px; border: 0;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  transition: background 150ms cubic-bezier(0.4,0,0.2,1), transform 100ms;
" onmouseover="this.style.background='#b3553a'" onmouseout="this.style.background='#c96442'" onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
  데모 신청
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
</button>
```

### 스니펫 5 — Footer (다크, 다단 nav)
```html
<footer style="background: #08090a; color: rgba(250,251,252,0.7); padding: 80px 48px 32px; border-top: 1px solid rgba(255,255,255,0.06);">
  <div style="max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 32px;">
    <div>
      <div style="font: 600 18px/24px Inter; color: #fafbfc; letter-spacing: -0.01em; margin-bottom: 12px;">bykayle</div>
      <p style="font: 400 13px/20px Inter; color: rgba(250,251,252,0.55); margin: 0; max-width: 280px;">의료의 신뢰 + 디자인의 따뜻함이 만나는 곳.</p>
    </div>
    <nav><p style="font: 600 11px/16px Inter; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(250,251,252,0.4); margin: 0 0 12px;">제품</p><ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;"><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter; transition: color 150ms;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(250,251,252,0.75)'">시뮬레이터</a></li><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter;">애널리틱스</a></li><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter;">통합</a></li></ul></nav>
    <nav><p style="font: 600 11px/16px Inter; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(250,251,252,0.4); margin: 0 0 12px;">회사</p><ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;"><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter;">소개</a></li><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter;">블로그</a></li><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter;">채용</a></li></ul></nav>
    <nav><p style="font: 600 11px/16px Inter; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(250,251,252,0.4); margin: 0 0 12px;">개발자</p><ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;"><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter;">문서</a></li><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter;">API</a></li><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter;">상태</a></li></ul></nav>
    <nav><p style="font: 600 11px/16px Inter; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(250,251,252,0.4); margin: 0 0 12px;">법률</p><ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;"><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter;">약관</a></li><li><a href="#" style="color: rgba(250,251,252,0.75); text-decoration:none; font:400 13px/20px Inter;">개인정보</a></li></ul></nav>
  </div>
  <div style="max-width: 1200px; margin: 64px auto 0; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; font: 400 12px/20px Inter; color: rgba(250,251,252,0.4);">
    <span>© 2026 bykayle</span>
    <span>서울 · Seoul</span>
  </div>
</footer>
```
