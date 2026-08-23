# Delivery Report — Atelier v0.2.15 (260728)

## 전달 채널
GitHub Release (BYKAYLE/atelier, public — 기존 v0.1.6x 관례 연장, 260728 대표님 확정 채널)

## 실행 내역
- 릴리스 커밋: fd47fba (260711 결함수리 A-1~A-8 검증분 + agent sandbox/provider prefs)
- 태그: v0.2.15 (annotated, origin push 완료)
- 릴리스: https://github.com/BYKAYLE/atelier/releases/tag/v0.2.15
- 아티팩트: Atelier_0.2.15_aarch64.dmg (13,824,422 bytes, hdiutil 체크섬 VALID)
- 미서명 설치 안내 포함 (우클릭→열기 / xattr -cr)

## 전달 검증 (delivery_verification)
- 릴리스 페이지 HTTP 200
- gh release view: 태그·아티팩트 실재
- 아티팩트 재다운로드 SHA-256 = 로컬 빌드 해시 일치 (f23b2c19…57ac)

## 승인 소비
- production_deploy 게이트: approved — 대표님 발화 260728 ("파일럿은 A로 진행"+"배포는 깃허브로만"+"3,4도 진행해"), state.approval_gates에 증거 기록

## 리스크
- 미서명 배포: Gatekeeper 경고 발생 — 설치 안내로 완화 (크리덴셜 불사용 정책 260728 확정)
- 브릿지 가드레일 템플릿이 delivery 스테이지 미인지("Do not deploy to production" 일반 문구) — 본 실행은 오케스트레이터가 승인 게이트 소비로 수행. 템플릿 개선은 잔여 항목
