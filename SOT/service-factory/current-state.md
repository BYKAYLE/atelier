# Stella Factory Current State

generated_at: 2026-05-31T19:45:33+09:00

## Goal

Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## Baseline Summary

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
