---
name: decision-axes-web
description: Web(랜딩 페이지) 모드 결정축 카탈로그. 질문 생성 LLM이 brief 보고 결정적 4~5개 축 골라 질문화.
---

# Web Decision Axes — 결정축 풀

## 축 카탈로그 (15개 — 우선순위 순)

### 축 1: 페이지 목적 (Primary Goal)
**이 페이지가 1번 하길 바라는 일**
- 전환 (데모 신청·구매·가입 — 강한 CTA)
- 정보 전달 (제품·기능 설명)
- 브랜드 임프레션 (감각·인지도 우선)
- 채용 (입사 지원 유도)

### 축 2: 정보 밀도 (Density)
**한 화면에 담는 정보량**
- Sparse (큰 여백, 한 메시지에 집중)
- Balanced (적정 — 일반 SaaS)
- Dense (많은 정보 — B2B 카탈로그·대시보드)

### 축 3: 페이지 길이 (Page Length)
**스크롤 길이**
- Short (Hero 1화면)
- Medium (5섹션 — 일반 랜딩)
- Long (10+섹션 — 슈퍼 포지셔닝 페이지)

### 축 4: 모션 강도 (Motion)
**페이지의 모션 비중**
- 정적 (transition 없음 — 인쇄 유사)
- 미세 (hover·focus 위주)
- 강함 (scroll reveal·stagger·parallax)

### 축 5: 사진 의존도 (Photography Reliance)
**시각 자료의 비중**
- 사진 중심 (브랜드 사진이 hero)
- 타이포 중심 (글자가 시각 무게)
- 일러스트 중심 (벡터 일러스트)
- 데이터 시각화 중심 (차트·표)

### 축 6: 컨버전 게이트 강도 (CTA Strength)
**전환 유도 강도**
- 강한 게이트 (모달·sticky CTA·상시 노출)
- 부드러운 안내 (자연스럽게 스크롤 후 CTA)
- 정보만 (CTA 없거나 minimal)

### 축 7: 신뢰 확보 우선순위 (Trust Building)
**가장 강하게 보여줄 신뢰 신호**
- Testimonial (의료진/고객 인용)
- Stats (숫자·검증 데이터)
- Logos (도입사·파트너 로고)
- Certifications (인증·수상)

### 축 8: 헤더 전략 (Header Style)
**상단 nav 처리**
- Sticky thin (항상 노출, 얇음)
- Overlay transparent (hero 위 투명, 스크롤 시 채워짐)
- Static (스크롤 시 사라짐)

### 축 9: 카피 톤 (Copy Voice)
**문장 톤**
- 격식 (~합니다 / 공식)
- 비즈니스 (~합니다 / 친근)
- 캐주얼 (~해요 / 대화체)
- 짧고 강한 (헤드라인형 — 동사·명사구만)

### 축 10: 컬러 무드 (Color Mood)
**전체 분위기**
- 라이트 (흰/크림 베이스)
- 다크 (검정 베이스 — 프리미엄·테크)
- 컬러풀 (다채로움)
- 모노+액센트

### 축 11: 시각 디테일 (Visual Detail)
**컴포넌트 정밀도**
- 미니멀 (납작·flat)
- 정밀 (1px hairline·subtle gradient — Linear·Stripe 톤)
- 풍부 (그림자·일러스트·디테일)

### 축 12: 인터랙션 깊이 (Interaction Depth)
**사용자 조작 가능성**
- 정적 (읽기만)
- 가벼운 (hover·tooltip·toggle)
- 인터랙티브 (계산기·시뮬레이터·configurator)

### 축 13: 모바일 우선도 (Mobile Priority)
**예상 사용 환경**
- 데스크탑 우선 (B2B 의사결정)
- 모바일 우선 (B2C·소셜)
- 균형

### 축 14: 1차 noticed 요소 (First Noticed)
**첫 1초에 무엇이 보이게**
- 큰 헤드라인 카피
- 제품 시각 (mockup·photo)
- 브랜드 로고
- 동영상/모션

### 축 15: 섹션 구성 자유도 (Section Composition)
**구조 유연성**
- 표준 (hero / features / testimonial / cta / footer)
- 커스텀 흐름 (브랜드만의 narrative)
- 데이터 중심 (대시보드 미리보기·통계)

## 질문 생성 가이드 (CI와 동일)

1. brief에 이미 명시된 축 묻지 말 것
2. 5±2 한도
3. 일상 언어
4. "Decide for me" 항상 포함
5. 자유 텍스트 1~2개 ("강조하고 싶은 차별점", "피하고 싶은 클리셰")

## 도메인별 가중치

- **B2B SaaS**: 축 1(목적), 축 7(신뢰), 축 10(무드 — 다크/Linear 톤), 축 11(정밀)
- **의료**: 축 2(밀도), 축 7(신뢰), 축 9(격식), 축 11(정밀)
- **F&B/리테일**: 축 5(사진 우선), 축 10(컬러풀), 축 13(모바일)
- **교육**: 축 9(톤), 축 12(인터랙티브), 축 14(첫 noticed)
- **에이전시/포트폴리오**: 축 4(모션), 축 5(이미지), 축 14(임팩트)
