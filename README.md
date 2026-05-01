# Atelier

> 당신의 명령어, 당신의 작업실.

이미지 붙여넣기가 되는 GUI 터미널. Tauri 기반 경량 데스크톱 앱.

## 핵심 기능

- **스크린샷 붙여넣기** — macOS `⌘+V` / Windows `Ctrl+V`로 클립보드 이미지를 현재 세션에 바로 첨부
  - macOS 캡처: `⌘+Shift+4` / `⌘+Shift+5` (클립보드 저장은 `Ctrl` 옵션 병행)
  - Windows 캡처: `Win+Shift+S`
- **라이브 프리뷰** — 세션이 HTML/Markdown/이미지를 쓰면 우측 패널에 자동 렌더 (v0.2 예정)
- **멀티 세션** — 플랫폼별 프로파일 자동 필터
  - macOS: Claude Code / Zsh / Bash / Node (+ PowerShell 설치 시)
  - Windows: Claude Code / PowerShell / Bash / cmd / Node
- **Claude Code 퍼스트파티 호환** — `claude` CLI를 subprocess로 실행 → Pro/Max 구독 합법 경로

## 전제조건

### 공통
| 도구 | 버전 | 확인 |
|------|------|------|
| Node | 18+ | `node -v` |
| Rust | 1.77+ | `cargo --version` |

### macOS
| 도구 | 비고 |
|------|------|
| Xcode Command Line Tools | `xcode-select --install` |
| Apple Silicon 또는 Intel | 기본값: 호스트 아키텍처 네이티브 빌드 |

### Windows
| 도구 | 비고 |
|------|------|
| MSVC Build Tools | Tauri Windows 빌드용 |
| WebView2 | Windows 10/11 기본 설치됨 |

## 빠른 시작

### macOS

```bash
# 의존성 설치
npm install

# 개발 모드 (라이브 리로드)
npm run tauri:dev

# 릴리스 빌드 (.app 번들 + .dmg 디스크 이미지)
npm run tauri:build
```

산출물 경로:
- `.app` 번들: `src-tauri/target/release/bundle/macos/Atelier.app`
- `.dmg` 이미지: `src-tauri/target/release/bundle/dmg/Atelier_0.1.0_aarch64.dmg`

설치: `.dmg` 더블클릭 → `/Applications`로 드래그. 또는 `.app`을 직접 실행.

> 미서명 빌드이므로 첫 실행 시 macOS가 "확인되지 않은 개발자" 경고를 띄울 수 있습니다.
> 시스템 설정 → 개인정보 보호 및 보안 → "Atelier 실행 허용" 버튼으로 해제하세요.

### Windows

```bash
npm install
npm run tauri:dev
npm run tauri:build   # MSI + NSIS installer
```

산출물 경로: `src-tauri\target\release\bundle\{msi,nsis}\`.

## 프로젝트 구조

```
atelier/
├── src/                      # React + TypeScript 프론트엔드
│   ├── components/
│   │   ├── App.tsx           # 루트, 화면 전환
│   │   ├── TopChrome.tsx     # 상단 세그먼트 + 테마 토글
│   │   ├── Welcome.tsx       # 홈 화면
│   │   ├── Main.tsx          # 터미널 + 프리뷰 스플릿 (xterm.js + PTY)
│   │   ├── Settings.tsx      # 설정 (터미널/외관/프로필/단축키/프리뷰)
│   │   └── Icons.tsx
│   ├── lib/
│   │   ├── tokens.ts         # 액센트·프로필·기본값
│   │   ├── useTweaks.ts      # 설정 영속화
│   │   └── tauri.ts          # IPC 래퍼 (pty_*, clipboard_*)
│   ├── main.tsx
│   └── index.css
├── src-tauri/                # Rust 백엔드
│   ├── src/
│   │   ├── lib.rs            # Tauri 앱 엔트리, 커맨드 등록
│   │   ├── pty.rs            # portable-pty 기반 세션 관리
│   │   └── clipboard.rs      # 클립보드 PNG → 임시파일
│   ├── Cargo.toml
│   └── tauri.conf.json
└── index.html
```

## 주요 IPC 커맨드

| 커맨드 | 설명 |
|--------|------|
| `pty_spawn(profile, cols, rows)` | 세션 생성 → 세션 id 반환 |
| `pty_write(id, data)` | stdin 전송 |
| `pty_resize(id, cols, rows)` | 터미널 크기 변경 |
| `pty_kill(id)` | 세션 종료 |
| `pty_list()` | 활성 세션 목록 |
| `clipboard_save_image(png_base64)` | 클립보드 PNG → 임시파일 경로 |

이벤트:
- `pty://{id}/data` — stdout 청크
- `pty://{id}/exit` — 종료 코드

## Code signing policy

Windows release signing is prepared for SignPath Foundation open-source code
signing.

- Code signing policy: [docs/code-signing-policy.md](docs/code-signing-policy.md)
- Windows signing workflow notes: [docs/windows-code-signing.md](docs/windows-code-signing.md)

## 로드맵

- [x] v0.1 — 프로토타입 (홈/코드/설정) + PTY + 클립보드 이미지
- [ ] v0.2 — 라이브 프리뷰 (파일 watcher + HTML/MD 렌더)
- [ ] v0.3 — 탭 드래그/분할, 명령 팔레트
- [ ] v0.4 — 자동 업데이트, 설정 동기화

## 라이선스

[MIT License](LICENSE) — Copyright (c) 2026 BYKAYLE
