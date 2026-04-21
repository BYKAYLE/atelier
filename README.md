# Atelier

> 당신의 명령어, 당신의 작업실.

이미지 붙여넣기가 되는 GUI 터미널. Tauri 기반 경량 데스크톱 앱.

## 핵심 기능

- **스크린샷 Ctrl+V 붙여넣기** — Windows `Win+Shift+S`로 캡처한 이미지를 현재 세션에 바로 첨부
- **라이브 프리뷰** — 세션이 HTML/Markdown/이미지를 쓰면 우측 패널에 자동 렌더 (v0.2 예정)
- **멀티 세션** — Claude Code / PowerShell / Bash / cmd / Node 프로파일
- **Claude Code 퍼스트파티 호환** — `claude` CLI를 그대로 subprocess로 실행 → Pro/Max 구독 합법 경로

## 전제조건

| 도구 | 버전 | 비고 |
|------|------|------|
| Node | 18+ | `node -v` |
| Rust | 1.77+ | `cargo --version` |
| Windows MSVC Build Tools | — | Tauri Windows 빌드용 |
| WebView2 | 기본 설치됨 | Win 10/11 |

## 빠른 시작

```bash
# 의존성 설치
npm install

# 개발 모드 (라이브 리로드)
npm run tauri:dev

# 릴리스 빌드 (MSI·NSIS)
npm run tauri:build
```

빌드 산출물은 `src-tauri/target/release/bundle/` 에 생성됩니다.

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

## 로드맵

- [x] v0.1 — 프로토타입 (홈/코드/설정) + PTY + 클립보드 이미지
- [ ] v0.2 — 라이브 프리뷰 (파일 watcher + HTML/MD 렌더)
- [ ] v0.3 — 탭 드래그/분할, 명령 팔레트
- [ ] v0.4 — 자동 업데이트, 설정 동기화

## 라이선스

Private.
