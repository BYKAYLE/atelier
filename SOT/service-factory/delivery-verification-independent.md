# atelier v0.2.15 GitHub Release 독립 검증 (G2 rt-verify)

- 검증자: rt-verify (L2, effort high) — 산출자와 독립된 개체
- 검증 시각: 2026-07-28 23:28 (KST 실측 기준, 실행 로그의 UTC 타임스탬프 병기)
- 방법: 반증 자세 — 결함 기반, 점수 미부여. 전 항목 직접 실행·실측(비신뢰 재현).
- 수정 범위: 없음 (read-only). 본 보고 파일 1개만 신규 작성.

## 1. GitHub Release 페이지 HTTP 200

명령: `curl -s -o /dev/null -w "%{http_code}" https://github.com/BYKAYLE/atelier/releases/tag/v0.2.15`

실측 출력:
```
200
```

판정: **PASS**

## 2. gh release view — 태그명·아티팩트 실재

명령: `gh release view v0.2.15 --json tagName,assets,url`

실측 출력:
```json
{"assets":[{"apiUrl":"https://api.github.com/repos/BYKAYLE/atelier/releases/assets/492807105","contentType":"application/x-apple-diskimage","createdAt":"2026-07-28T14:26:12Z","digest":"sha256:f23b2c19cb67afdb8c3774b3d9e8047f2347462cc4c9b2140ad269b8bd3457ac","downloadCount":0,"id":"RA_kwDOSIIy084dX6PB","label":"","name":"Atelier_0.2.15_aarch64.dmg","size":13824422,"state":"uploaded","updatedAt":"2026-07-28T14:26:15Z","url":"https://github.com/BYKAYLE/atelier/releases/download/v0.2.15/Atelier_0.2.15_aarch64.dmg"}],"tagName":"v0.2.15","url":"https://github.com/BYKAYLE/atelier/releases/tag/v0.2.15"}
```

확인 항목:
- tagName = `v0.2.15` — 일치
- asset name = `Atelier_0.2.15_aarch64.dmg` — 일치
- asset size = 13,824,422 bytes (≈13.2 MiB / ≈13.8 MB decimal) — 주장(~13.8MB)과 일치
- GitHub 서버측 digest(sha256) = `f23b2c19cb67afdb8c3774b3d9e8047f2347462cc4c9b2140ad269b8bd3457ac`

판정: **PASS**

## 3. 다운로드 아티팩트 SHA-256 대조 (GitHub 다운로드본 vs 로컬 빌드본 vs 주장 해시)

다운로드 명령: `curl -sL -o rt-verify-dl.dmg https://github.com/BYKAYLE/atelier/releases/download/v0.2.15/Atelier_0.2.15_aarch64.dmg`

실측 출력:
```
http_code=200 size=13824422
```

SHA-256 (다운로드본, `/private/tmp/.../scratchpad/rt-verify-dl.dmg`):
```
f23b2c19cb67afdb8c3774b3d9e8047f2347462cc4c9b2140ad269b8bd3457ac  rt-verify-dl.dmg
```

SHA-256 (로컬 빌드본, `/Users/kansic/Service/atelier/src-tauri/target/release/bundle/dmg/Atelier_0.2.15_aarch64.dmg`, 13,824,422 bytes, mtime Jul 28 16:04):
```
f23b2c19cb67afdb8c3774b3d9e8047f2347462cc4c9b2140ad269b8bd3457ac  /Users/kansic/Service/atelier/src-tauri/target/release/bundle/dmg/Atelier_0.2.15_aarch64.dmg
```

주장 해시(위임 지시문에 명시): `f23b2c19cb67afdb8c3774b3d9e8047f2347462cc4c9b2140ad269b8bd3457ac`

3중 일치 확인: 다운로드본 = 로컬 빌드본 = 주장 해시 = GitHub API digest(항목 2). 4자 소스 전부 동일.

판정: **PASS**

## 4. 태그가 fd47fba 커밋을 가리키는지

명령: `git -C /Users/kansic/Service/atelier tag -l v0.2.15 --format='%(objectname:short) %(refname:short)'`

실측 출력:
```
e19ed81 v0.2.15
```

명령: `git -C /Users/kansic/Service/atelier rev-parse fd47fba`

실측 출력:
```
fd47fbac31f6068bd3005174f8e1e3cd901ef5d0
```

주의: `git tag --format='%(objectname:short)'`는 태그 오브젝트가 annotated tag인 경우 태그 오브젝트 자체의 short SHA(`e19ed81`)를 반환하며, 이는 그 태그가 가리키는 커밋(peeled commit)과 다를 수 있다. `fd47fba`(rev-parse 결과: `fd47fbac31f6068bd3005174f8e1e3cd901ef5d0`)와 `e19ed81`은 서로 다른 오브젝트다. 위임 지시문이 요구한 "태그가 fd47fba 커밋을 가리키는지"를 직접 확인하려면 peeled 커밋 SHA를 별도로 조회해야 한다.

추가 실측(peeled 확인):
```
== tag object type ==
tag
== tag peel to commit ==
fd47fbac31f6068bd3005174f8e1e3cd901ef5d0
== fd47fba full ==
fd47fbac31f6068bd3005174f8e1e3cd901ef5d0
```

`v0.2.15`는 annotated tag(오브젝트 `e19ed81`)이며, `git rev-list -n1 v0.2.15`로 peel한 결과 커밋 `fd47fbac31f6068bd3005174f8e1e3cd901ef5d0`와 `git rev-parse fd47fba`의 full SHA가 정확히 일치. 태그가 fd47fba 커밋을 가리키는 것을 확인.

판정: **PASS**

## 5. 릴리스 노트 미서명 설치 안내 실재

명령: `gh release view v0.2.15 -R BYKAYLE/atelier --json body -q .body`

실측 출력(전문):
```
## Atelier v0.2.15

### 주요 변경 (v0.1.66 이후)
- 260711 결함수리 웨이브: 적대 감사 결함 A-1~A-8 전수 수리 및 실코드 경로 검증 완료
- 에이전트 샌드박스(`agent_sandbox.rs`) 및 프로바이더 런타임 안전성 강화
- OAuth 복구 하드닝, 프리뷰 진실성(preview truth) 검증 체계
- 에이전트 프로바이더 환경설정(`agentProviderPreferences`)

### 설치 (macOS Apple Silicon)
1. 아래 `Atelier_0.2.15_aarch64.dmg` 다운로드 후 열기
2. Atelier.app 을 Applications 로 드래그
3. **최초 실행**: 서명되지 않은 앱이므로 Finder에서 앱을 **우클릭 → 열기** (또는 터미널에서 `xattr -cr /Applications/Atelier.app` 후 실행)

> 배포 채널 정책: GitHub Release 단일 채널 (Apple 공증 미사용)
```

확인: "우클릭 → 열기" 및 `xattr -cr` 안내 실재 확인. 미서명 상태를 명시적으로 고지("서명되지 않은 앱")하고 대체 경로(터미널 xattr)까지 병기.

판정: **PASS**

## 6. 다운로드본 DMG 무결성 (hdiutil verify)

명령: `hdiutil verify rt-verify-dl.dmg`

실측 출력:
```
Protective Master Boot Record(MBR : 0) 체크섬 처리 중…
Protective Master Boot Record(MBR : : 확인됨 CRC32 $069E2B31
GPT Header(Primary GPT Header : 1) 체크섬 처리 중…
  GPT Header(Primary GPT Header : 1): 확인됨 CRC32 $D9F203F3
GPT Partition Data(Primary GPT Table : 2) 체크섬 처리 중…
GPT Partition Data(Primary GPT Table: 확인됨 CRC32 $367A723D
(Apple_Free : 3) 체크섬 처리 중…
                    (Apple_Free : 3): 확인됨 CRC32 $00000000
disk image(Apple_HFS : 4) 체크섬 처리 중…
           disk image(Apple_HFS : 4): 확인됨 CRC32 $1B1F039B
GPT Partition Data(Backup GPT Table : 5) 체크섬 처리 중…
GPT Partition Data(Backup GPT Table : 확인됨 CRC32 $367A723D
GPT Header(Backup GPT Header : 6) 체크섬 처리 중…
   GPT Header(Backup GPT Header : 6): 확인됨 CRC32 $B9A162C7
확인됨 CRC32 $20864BA5
hdiutil: verify: checksum of "rt-verify-dl.dmg" is VALID
```

판정: **PASS**

## 종합

| # | 항목 | 판정 |
|---|---|---|
| 1 | GitHub Release 페이지 HTTP 200 | PASS |
| 2 | gh release view — 태그·아티팩트 실재 | PASS |
| 3 | SHA-256 3중 대조(다운로드본=로컬빌드본=주장해시=GitHub digest) | PASS |
| 4 | 태그 → fd47fba 커밋 peel 일치 | PASS |
| 5 | 미서명 설치 안내(우클릭→열기 / xattr) 실재 | PASS |
| 6 | hdiutil verify — 다운로드본 DMG 무결성 | PASS |

차단결함(blocking defect): **0건**

참고(비차단 관찰): `git tag --format='%(objectname:short)'`가 반환하는 값(`e19ed81`)은 annotated tag 오브젝트 자체의 SHA이며 peeled 커밋 SHA(`fd47fba`)와 다르다. 향후 유사 검증 시 태그 오브젝트 vs peeled 커밋을 혼동하지 않도록 `git rev-list -n1 <tag>`로 peel해서 비교할 것을 권고(결함 아님, 절차 개선 메모).

## 최종 판정

**독립 검증 PASS** — v0.2.15 GitHub Release 전달 주장은 6개 검증 항목 전부에서 직접 실행·실측으로 재현되었으며 차단결함이 발견되지 않았다.

