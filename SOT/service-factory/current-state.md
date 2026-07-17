# Stella Factory Current State

> Historical snapshot generated on 2026-05-31. It is retained as execution
> evidence and is not the current release baseline. The active baseline is
> Atelier 0.2.8 source and installed macOS baseline in
> `SOT/L1-project-summary.md`, `SOT/tasks.md`, and
> `SOT/service-factory/orca-adoption-roadmap.md`.

active_baseline_at: 2026-07-14T14:40:43+09:00

## Active Baseline

- Source and package metadata: `0.2.8`.
- Installed application: `/Applications/Atelier.app`, version `0.2.8`, strict
  local signature valid.
- Integrated local workbench: Conversation, Code, and Source control remain
  inside the structured task workspace while Preview is independently
  toggleable. The editor keeps task-rooted multi-tab drafts and explicit safe
  saves; source control supports stage, unstage, branch/upstream state, recent
  history, unified diff navigation, and explicit manual commits.
- Unified Quick Open: `Cmd/Ctrl+P` searches tasks, active task/worktree files,
  and workspace commands without replacing Atelier's compact task/composer UI.
- Workbench shell: Terminal appears once in global navigation, the structured
  workspace omits the duplicate cwd control, purpose-specific icons distinguish
  sessions/profiles/reports/plugins/code/changes/worktrees, and hidden terminal
  renderers wait for a measurable host and respond to host resize observation.
- Runtime: detached reconnectable PTY supervisor, normalized provider lifecycle,
  optional isolated task worktrees, conflict-checked candidate adoption, and
  bounded localhost preview evidence. The restored Terminal navigation opens a
  persistent nested pane tree: the active CLI can split right or down, resize
  by pointer or keyboard, survive reload, and collapse cleanly after close.
- Change review is line-aware: unified diffs expose old/new line numbers,
  bounded comments persist with the task, and unresolved comments can be sent
  back to the active agent through the normal or queued follow-up path.
- Preview inspection is element-aware: the localhost Tauri bridge can arm a
  visible click target, suppress its original action, and return only bounded,
  redacted selector/geometry/allowlisted-CSS evidence. The next request owns an
  immutable normalized snapshot that survives queue persistence and remains
  correct when execution is delayed, backgrounded, or parallelized.
- Preview evidence automatically arms against the matching origin and captures
  HTTP/service/DOM/screenshot/console/runtime/network state when a provider turn
  completes, including failed turns unless the user explicitly stops or
  interrupts them. It excludes bodies, headers, cookies, storage, URL queries,
  and credential material.
- Long-task rendering isolates the one-second elapsed clock inside a memoized
  activity row, keeps normal composer typing ref-backed, and applies
  `content-visibility` only to completed transcript messages. The dedicated
  performance contract smoke is enforced by all release workflows.
- Automated baseline: frontend build; native and Store Rust suites at 90/90;
  strict native and Store Clippy; fixture, workbench, performance,
  element-picker, terminal-layout, diff-review, preview-URL, updater, release
  audit, and source PTY reconnect smokes pass. Existing Windows PE and physical
  platform evidence remains a separate release surface.
- Windows provider login now sets the installed signed Atelier executable as
  the CLI browser helper. The helper validates provider URLs and exits before
  UI startup; physical browser appearance and completed login remain separate
  Windows evidence gates.
- Windows smoke source now records a newly observed browser process and the
  physical gate requires a visible browser window. This source contract passes
  actionlint and release audit, but has not run on Windows from this worktree.
- Live GitHub configuration currently exposes only Tauri updater signing
  secrets, no release variables, and no self-hosted Windows runner.
- External validation still required: physical Windows browser authentication,
  Smart App Control and signed restart evidence, public Windows signing, and
  Developer ID notarization/stapling.
- Fresh installed-app verification exposed an on-screen Atelier window at
  1600x900 and exercised Sessions, Code, and Changes. A separate 900x720 pass
  collapsed navigation to the compact icon rail without incoherent overlap.
  This is direct macOS evidence and is not used as physical Windows proof.
- The signed package and installed app now publish an exact renderer-readiness
  receipt after the top-level React root mounts. Native verification rejects a
  stale, dead-process, wrong-version, wrong-executable, non-main-window, or
  non-ready receipt, so package startup no longer relies on process-only or
  accessibility evidence.

historical_generated_at: 2026-05-31T19:45:33+09:00

## Goal

Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## Historical Baseline Summary

- Project: `/Users/kansic/Service/atelier`
- Package: `atelier` 0.1.45
- Scripts: build, dev, harness:agent, harness:claude, harness:fixture, preview, smoke:windows-providers, store:msix, tauri, tauri:build, tauri:build:release, tauri:dev, tauri:store:msi, tauri:trust
- SOT exists: true
- Service Factory state exists: true
- Service Factory artifact dir exists: true
- Installed Atelier.app exists: true
- Installed Atelier.app version: 0.1.45

## Working Tree

```text
M SOT/evidence-log.md
 M SOT/tasks.md
 M docs/stella-factory.md
 M src-tauri/src/lib.rs
 M src-tauri/src/stella.rs
 M src/components/AgentWorkspace.tsx
 M src/components/App.tsx
 M src/lib/stellaFactory.ts
 M src/lib/tauri.ts
?? .service-factory/
?? SOT/service-factory-state.json
?? SOT/service-factory/
?? src/components/AgentWorkspace.tsx.bak
```

## Important Files

- `runs/sf-run-20260531-135615/architecture-architect/result.json`
- `SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-135615/architecture-architect/local-worker-report.md`
- `SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/events.jsonl`
- `SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/agent-launch.md`
- `SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/result.json`
- `SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-141543/verification-reviewer/local-worker-report.md`
- `SOT/service-factory/runs/sf-run-20260531-135616/gates/service-factory-validate/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135616/gates/service-factory-validate/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-135614/gates/service-factory-validate/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135614/gates/service-factory-validate/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-140018/gates/service-factory-validate/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-140018/gates/service-factory-validate/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/events.jsonl`
- `SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/agent-launch.md`
- `SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/result.json`
- `SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-135619/security_review-security_auditor/local-worker-report.md`
- `SOT/service-factory/runs/sf-run-20260531-135617/gates/service-factory-validate/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135617/gates/service-factory-validate/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/events.jsonl`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/agent-launch.md`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/result.json`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-critic/local-worker-report.md`
- `src-tauri/resources/design-engine/philosophies/01-pentagram.md`
- `src-tauri/resources/design-engine/philosophies/04-linear.md`
- `src-tauri/resources/design-engine/philosophies/02-field-io.md`
- `src-tauri/resources/design-engine/philosophies/03-kenya-hara.md`
- `SOT/service-factory/runs/sf-run-20260531-135618/gates/service-factory-validate/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135618/gates/service-factory-validate/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/events.jsonl`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/agent-launch.md`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/result.json`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-135618/verification-runtime_probe/local-worker-report.md`
- `src-tauri/resources/design-engine/prompts/04-hifi-refine.md`
- `src-tauri/resources/design-engine/prompts/02-system.md`
- `src-tauri/resources/design-engine/prompts/01-brief-questions.md`
- `src-tauri/resources/design-engine/prompts/06-review.md`
- `src-tauri/resources/design-engine/prompts/05-motion.md`
- `src-tauri/resources/design-engine/prompts/01-brief.md`
- `src-tauri/resources/design-engine/components/product-card.html`
- `src-tauri/resources/design-engine/components/hero-variant-b.html`
- `src-tauri/resources/design-engine/components/case-study.html`
- `src-tauri/resources/design-engine/components/hero-variant-a.html`
- `src-tauri/resources/design-engine/components/ecg-widget.html`
- `src-tauri/resources/design-engine/components/testimonial.html`
- `SOT/service-factory/runs/sf-run-20260531-141543/gates/service-factory-validate/stdout.txt`
- `src-tauri/resources/design-engine/prompts/04-hifi.md`
- `src-tauri/resources/design-engine/brand/bykayle.md`
- `SOT/service-factory/runs/sf-run-20260531-141543/gates/service-factory-validate/stderr.txt`
- `src-tauri/resources/design-engine/prompts/03-wireframe.md`
- `src-tauri/resources/design-engine/prompts/app/06-review.md`
- `src-tauri/resources/design-engine/prompts/app/03-flow.md`
- `src-tauri/resources/design-engine/prompts/app/04-screens.md`
- `src-tauri/resources/design-engine/prompts/print/06-review.md`
- `src-tauri/resources/design-engine/prompts/print/04-final.md`
- `src-tauri/resources/design-engine/prompts/print/03-layout.md`
- `SOT/service-factory/runs/sf-run-20260531-135615/gates/service-factory-validate/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135615/gates/service-factory-validate/stdout.txt`
- `src-tauri/resources/design-engine/workflows/atelier-design-flow.md`
- `src-tauri/resources/design-engine/component-library/00-tailwind-base.md`
- `src-tauri/resources/design-engine/component-library/shadcn/04-badge-label.md`
- `src-tauri/resources/design-engine/component-library/shadcn/03-input-form.md`
- `src-tauri/resources/design-engine/component-library/shadcn/01-button.md`
- `src-tauri/resources/design-engine/component-library/shadcn/02-card.md`
- `src-tauri/resources/design-engine/component-library/shadcn/05-navigation.md`
- `src-tauri/resources/design-engine/decision-axes/ci.md`
- `src-tauri/resources/design-engine/decision-axes/web.md`
- `src-tauri/resources/design-engine/decision-axes/app.md`
- `src-tauri/resources/design-engine/decision-axes/print.md`
- `src-tauri/resources/design-engine/prompts/ci/06-review.md`
- `src-tauri/resources/design-engine/prompts/ci/04-assets.md`
- `src-tauri/resources/design-engine/prompts/ci/03-system.md`

## Verification Baseline

- `python3 /Users/kansic/.claude/skills/release/scripts/service_factory.py validate --project .`
- `npm run build` when frontend surfaces change.
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` when Tauri/Rust surfaces change.
- `npm run tauri:build` plus installed-app/codesign verification when packaged behavior changes.
