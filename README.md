# Atelier

> 명령을 맡기고, 진행과 증거를 확인하는 로컬 자율 개발 워크스페이스.

Atelier는 Claude Code, Codex, Hermes, Gajae Code를 하나의 구조화된 작업
화면에서 실행하는 Tauri/Rust 데스크톱 앱입니다. 터미널 기능을 유지하면서
세션 재연결, 작업 격리, 변경사항 리뷰, 라이브 프리뷰 검증, 구독 로그인,
업데이트를 하나의 로컬 작업 기록으로 묶습니다.

현재 개발 기준은 `0.2.14`입니다. 소스, 패키지, 설치 앱, 실제 Windows
동작은 서로 다른 증거로 관리하며, 교차 컴파일 성공을 물리 Windows 검증으로
간주하지 않습니다.

## 주요 기능

- **구조화된 에이전트 작업**
  - Claude Code, Codex, Hermes, Gajae Code 프로파일
  - 실행 중 후속 메시지 큐, 중지, 재개, 백그라운드 작업
  - 제공자별 원본 로그와 공통 실행 상태 분리
  - 대화, 코드, 변경사항을 하나의 작업 화면에서 전환하는 로컬 워크벤치
- **재연결 가능한 터미널**
  - 앱 화면이 다시 로드되어도 살아 있는 PTY 세션
  - 좌우/상하 분할, 드래그 및 키보드 크기 조절, 레이아웃 복원
  - 숨긴 작업의 출력 보존과 명시적 프로세스 종료
- **작업 격리와 변경사항 리뷰**
  - 선택형 Git worktree 격리
  - 후보 작업 비교와 충돌 검사 후 명시적 반영
  - 파일별 diff, 줄 번호, 리뷰 댓글, 에이전트 후속 수정 요청
- **프리뷰와 Probe**
  - 별도로 신뢰해 실행한 localhost 서비스의 URL 연결과 상태 확인
  - 앱이 직접 시동하는 관리형 프리뷰는 현재 보안 정책상 비활성임을 명시
  - HTTP, DOM, 스크린샷, 콘솔, 런타임, 네트워크 실패 증거 수집
  - 화면 요소 선택 후 안전한 selector, geometry, CSS 증거 첨부
  - 쿠키, 저장소, 요청 헤더, URL query, 응답 본문 전체는 수집하지 않음
- **스크린샷 붙여넣기**
  - macOS `Cmd+V`, Windows `Ctrl+V`로 작업에 이미지 첨부
- **스텔라 모드**
  - 자연어 목표를 분석, 계획, 구현, Probe, 보안 검토, 최종 감사로 연결
  - 작업 상태와 검증 근거를 프로젝트 `SOT/`에 기록
  - 필요할 때만 명시적으로 켜는 실행 모드
- **크로스플랫폼 배포 기반**
  - GitHub Release 기반 업데이트
  - macOS 패키지와 설치본 검증
  - Windows normal/Store 빌드, 서명 및 물리 장치 검증 워크플로
  - Claude/Codex 로그인 URL을 검증하는 서명된 Atelier 브라우저 도우미

## 안전 경계

Atelier의 기본 권한은 작업공간 범위입니다. 다음 작업은 사용자 승인 없이
자동 실행하지 않습니다.

- 데이터베이스 또는 사용자 데이터 삭제
- 프로덕션 배포
- 결제 또는 유료 작업
- 자격증명 노출
- 외부 게시와 외부 통신

제공자 인증은 각 공식 CLI가 소유합니다. Atelier는 Claude Code나 Codex의
외부 자격증명 저장소를 직접 읽거나 비공개 OAuth 프로토콜을 모방하지
않습니다.

## 설치 사용자 흐름

1. 설정의 **프로필**에서 사용할 CLI를 설치하거나 기존 설치를 확인합니다.
2. 설정의 **연결**에서 Claude 또는 Codex 구독 로그인을 시작합니다.
3. **새 작업**에서 에이전트와 작업 폴더를 선택합니다.
4. 일반 요청은 바로 보내고, 장기 자율 개발 목표는 **스텔라 모드**를 켭니다.
5. 변경 파일, Probe, 프리뷰 증거를 확인한 뒤 필요한 후보만 반영합니다.

Windows 구독 로그인은 기본 브라우저가 실제로 열리고 CLI 인증 상태가
갱신되어야 완료입니다. 브라우저 도우미의 종료 코드만으로 로그인 성공을
판정하지 않습니다.

## 개발 환경

| 도구 | 기준 |
|---|---|
| Node.js | 20 권장 |
| Rust | stable |
| macOS | Xcode Command Line Tools |
| Windows | MSVC Build Tools, WebView2 |

```bash
npm ci --legacy-peer-deps
npm run tauri:dev
```

핵심 검증:

```bash
npm run build
npm run harness:fixture
npm run smoke:pty-supervisor
npm run smoke:terminal-layout
npm run smoke:diff-review
npm run smoke:devscreen-picker
npm run smoke:updater-contract
npm run audit:release
cargo test --manifest-path src-tauri/Cargo.toml
```

## 패키징

### macOS

```bash
npm run tauri:build
npm run tauri:trust
```

로컬 산출물:

- `src-tauri/target/release/bundle/macos/Atelier.app`
- `src-tauri/target/release/bundle/dmg/Atelier_<version>_<arch>.dmg`

로컬 서명은 개발 설치 증거입니다. 공개 배포 완료를 주장하려면 Developer ID,
notarization, stapling 증거가 추가로 필요합니다.

### Windows

```powershell
npm ci --legacy-peer-deps
npm run tauri -- build --ci
powershell -ExecutionPolicy Bypass -File tools/windows-provider-smoke.ps1 -SelfTest
```

Windows normal, Store, SignPath 경로는 서로 다른 워크플로로 검증합니다.
최종 배포에는 서명된 설치본, 실제 브라우저 로그인, 업데이트 후 동일 설치
경로 재시작, Smart App Control 증거가 필요합니다.

- Microsoft Store: [docs/microsoft-store-release.md](docs/microsoft-store-release.md)
- Windows signing: [docs/windows-code-signing.md](docs/windows-code-signing.md)
- Release process: [docs/release-process.md](docs/release-process.md)
- Code signing policy: [docs/code-signing-policy.md](docs/code-signing-policy.md)
- Privacy policy: [docs/privacy-policy.md](docs/privacy-policy.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Support and bug reports: [SUPPORT.md](SUPPORT.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## 프로젝트 구조

```text
atelier/
├── src/
│   ├── components/           # 작업, 터미널, 프리뷰, 설정 UI
│   └── lib/                  # diff, preview, layout, Stella, Tauri IPC
├── src-tauri/
│   └── src/
│       ├── agent*.rs         # 제공자 실행, 상태, registry, worktree
│       ├── pty*.rs           # PTY transport와 detached supervisor
│       ├── credentials.rs    # 제공자 소유 인증과 브라우저 handoff
│       └── stella.rs         # 스텔라 모드 SOT/Probe bridge
├── tools/                    # smoke, package, release audit
├── .github/workflows/        # macOS/Windows/Store/physical gates
└── SOT/                      # 현재 상태, 계획, 증거, 최종 감사
```

## 스텔라 모드

사용자 진입점:

```text
스텔라 모드 <목표>
Stella Mode <objective>
```

`/goal`, `/analyze`, `/probe`, `/audit`는 호환 및 내부 검토 명령으로
유지됩니다. 단일 기능 패치는 장기 목표의 완료가 아니라 하나의 마일스톤으로
기록됩니다.

- 동작 계약: [SOT/autonomous-workspace-contract.md](SOT/autonomous-workspace-contract.md)
- 현재 프로젝트 기준: [SOT/L1-project-summary.md](SOT/L1-project-summary.md)
- Orca 도입 기준: [SOT/service-factory/orca-adoption-roadmap.md](SOT/service-factory/orca-adoption-roadmap.md)
- 사용 설명: [docs/stella-factory.md](docs/stella-factory.md)

## 현재 배포 판정

- macOS 로컬 패키지/설치본: 검증됨
- Windows normal/Store 교차 빌드: 검증됨
- 물리 Windows 브라우저 인증과 Smart App Control: 외부 검증 필요
- 공개 Windows 서명: 외부 검증 필요
- macOS Developer ID notarization: 외부 검증 필요

세부 증거는
[SOT/service-factory/deployment-readiness.md](SOT/service-factory/deployment-readiness.md)에
기록합니다.

## 라이선스

[MIT License](LICENSE) - Copyright (c) 2026 BYKAYLE
