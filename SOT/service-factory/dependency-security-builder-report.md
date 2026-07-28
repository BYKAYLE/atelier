# 작업 보고서 — PostCSS 보안 회귀 해소

Date: 2026-07-25 KST

## 판단 기록

- PostCSS를 취약점 수정 최초 버전(8.5.18)에 고정하지 않고 현재 안정
  호환 버전인 8.5.23 범위로 올렸다.
  - 이유: npm의 현재 `latest`가 8.5.23이고, GitHub Advisory의 수정
    경계는 8.5.18이므로 기존 8.x 호환 범위 안에서 보안 수정과 후속
    패치를 함께 반영할 수 있다.
  - 참조 규칙: high 의존성 취약점은 새 소스 후보 전에 해결한다.
  - 다른 선택지: `map: false` 우회만 적용하는 방식은 transitive 사용
    경로를 모두 보장하지 못하므로 채택하지 않았다.

## 구현 요약

- `package.json`의 direct devDependency를 `postcss ^8.5.23`으로 변경했다.
- `package-lock.json`과 로컬 설치 트리를 8.5.23으로 동기화했다.
- 다른 direct dependency 버전은 변경하지 않았다.

## 검증 결과

| 조건 | 결과 | 비고 |
|---|---|---|
| direct PostCSS 버전 | PASS | `postcss@8.5.23` |
| high/critical npm audit | PASS | `found 0 vulnerabilities` |
| install/lock consistency | PASS | `npm install --ignore-scripts` exit 0 |

## 미해결 이슈

- 직접 npm 취약점은 없다. RustSec는 알려진 취약점 0건이지만 upstream
  maintenance/quality warning은 남아 있으며 이를 clean dependency graph로
  과장하지 않는다.

## 통합 검증

- Atelier `0.2.13` 통합 게이트에서 `npm audit` 0건을 재확인했다.
- 같은 후보에서 RustSec known vulnerability는 0건이며 18 unmaintained,
  2 unsound upstream warning은 계속 노출된다.
- provider-capability 통합을 포함한 최종 source gate에서 dependency gate도
  통과했다.
- 전체 후보 판정은 `supervised local candidate, public release blocked`다.
- 이번 작업은 공개 publish, signing, notarization을 수행하지 않았다.
