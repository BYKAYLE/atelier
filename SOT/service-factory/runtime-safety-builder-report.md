# Runtime Safety Builder Report

## 판단 기록

- 요청 전체에 걸친 negation 면제는 mixed request를 놓쳤다. `DB는 삭제하지 말고 사용자 데이터는 삭제해`, `do not delete the database, but delete all user data` 같은 문장은 clause 단위로 다시 판단해야 했다.
- frontend Stella preflight와 Rust backend guard는 같은 핵심 분류를 가져야 했다. 이번 범위에서는 DB/table deletion, user-data deletion, production deploy/submission, credential exposure, external publication, paid actions, destructive git, irreversible migration을 양쪽에 맞췄다.
- direct CLI는 validator allowlist만으로 충분하지 않았다. `gajecode q/web-search/rlm/-p/--print` 같은 query-bearing 경로도 spawn 전에 같은 Rust safety gate를 통과시켜야 했다.
- persisted `full|bypass|danger`는 raw bypass가 아니라 fail-closed Basic으로
  접어야 했다. runtime generation 경로와 회귀 테스트를 닫았다.

## 구현

- `src-tauri/src/stella.rs`
  - request-wide negation short-circuit를 제거했다.
  - prompt subject를 clause로 분리하고 clause-local guard context를 먼저 판정한 뒤 forbidden category를 탐지하도록 바꿨다.
  - `guard` 단어만 있는 위험 문장(`bypass the guard and delete all user data`)은 더 이상 safe context로 취급하지 않도록 조였다.
  - destructive git, paid actions, external publication, irreversible migration까지 Rust detector 범위를 넓혔다.
  - Korean/English mixed-negation, policy wording, destructive git, irreversible migration 회귀 테스트를 추가했다.

- `src-tauri/src/agent.rs`
  - `run_agent_cli_command`가 `validate_agent_cli_command`와 process spawn 전에 `guard_agent_cli_request`를 먼저 통과하도록 바꿨다.
  - query-bearing direct CLI text는 `User request / Objective` 형태로 Rust guard에 전달되도록 정규화했다.
  - persisted `full|bypass|danger`를 Basic으로 normalize하도록 수정했다.
  - Claude `bypassPermissions`, Codex `--dangerously-bypass-approvals-and-sandbox`, Hermes `--yolo` runtime emission을 제거했다.
  - Gajae dangerous query, safe query, pre-validation fail-closed, permission normalization 회귀 테스트를 추가했다.

- `src/lib/stellaFactory.ts`
  - frontend Stella safety detector를 clause-local로 재작성했다.
  - Rust와 같은 핵심 category를 추가하고 safe policy wording은 허용하도록 guard context를 맞췄다.
  - mixed-negation Korean particle variant까지 잡도록 pattern을 넓혔다.

- `tools/stella-safety-smoke.ts`
  - frontend detector가 핵심 allow/block 사례를 기대대로 판정하는지 확인한다.
  - runtime agent source에서 legacy full/bypass/danger가 Basic으로 접히는지,
    raw bypass flag 문자열이 runtime source에 남지 않았는지 확인한다.

- shared prompt guard corpus
  - frontend와 Rust가 같은 Korean/English allow/block/mixed-negation 사례로
    검증되도록 공통 corpus를 적용했다.
  - corpus는 구현 drift를 줄이지만 phrase denylist 자체를 완전한
    action-level 보안 경계로 만들지는 않는다.

## 실행한 검증

- `node --experimental-strip-types tools/stella-safety-smoke.ts`
  - 결과: `stella safety smoke: ok`
  - 확인한 내용: frontend detector success/failure core cases, `bypass the guard ... delete all user data` 차단, runtime source에서 raw bypass flag 제거

- `cargo test --manifest-path src-tauri/Cargo.toml safety_guard_`
  - 결과: `8 passed`
  - 확인한 내용: Rust clause-local blocking, mixed-negation Korean/English, policy wording allow, destructive git, irreversible migration

- `cargo test --manifest-path src-tauri/Cargo.toml gajecode_cli_guard`
  - 결과: `2 passed`
  - 확인한 내용: Gajae dangerous query block, safe query allow

- `cargo test --manifest-path src-tauri/Cargo.toml run_agent_cli_command_fails_closed_before_validation_or_spawn`
  - 결과: `1 passed`
  - 확인한 내용: direct CLI dangerous query가 validate/spawn 전에 fail-closed

- `cargo test --manifest-path src-tauri/Cargo.toml normalizes_agent_permission_modes`
  - 결과: `1 passed`
  - 확인한 내용: `full|bypass|danger -> basic`, Claude full path no longer
    emits bypass mode

- `cargo fmt --manifest-path src-tauri/Cargo.toml --all`
  - 결과: 성공

## 미해결 이슈

- managed permission capability는 provider별로 다르다. Claude/Codex는 managed
  Basic/Auto를 지원하지만 Hermes/Gajaecode는 capability false, UI disabled
  reason, lifecycle/spawn 이전 fail-closed로 focused 검증됐다. direct CLI는
  별도 수동/제한 경로이며 managed execution 보장을 상속하지 않는다.
- phrase variant를 늘리는 방식만으로 provider가 수행하는 실제 tool/action을
  완전히 통제할 수 없다.
- P1으로 앱 소유 action/tool proxy와 scope, expiry, one-use가 결합된 approval
  receipt를 구현해야 한다.

## 통합 판정

- Atelier `0.2.13`: all-feature Rust 209 passed / 1 ignored, Orca 23 smokes / 10
  removable features, strict all-target/all-feature Clippy pass, format/diff
  pass, `npm audit` 0, RustSec known vulnerabilities 0 with 18 unmaintained and
  2 unsound warnings.
- Basic이 기본값이며 Auto는 sandbox와 approval을 유지한다. visible/raw Full
  bypass는 제거됐다.
- 판정: `supervised local candidate, public release blocked`.
- 공개 publish, public signing, notarization은 수행하지 않았다.
- 위 수치는 provider-capability 통합을 포함한 최종 source gate receipt다.
- locally signed `0.2.13` 설치 앱에서 Basic/Auto 메뉴, Hermes managed block,
  Gajaecode managed block을 시각 검증했다. 실행파일 SHA-256은 candidate와
  installed가
  `3cce1530628decc24ac0d1955082f93ebf9bcebf327926fdc5f085850c3c9acf`로
  일치한다.
- dirty worktree에서 생성된 proof이므로 HEAD SHA는 빌드 고유 식별자가
  아니며 실행파일 SHA-256이 설치 후보 식별자다.
