# Stella Factory Repo Map

generated_at: 2026-05-31T13:56:15+09:00

## Goal

Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## Package

```json
{
  "name": "atelier",
  "version": "0.1.45",
  "scripts": [
    "build",
    "dev",
    "harness:agent",
    "harness:claude",
    "harness:fixture",
    "preview",
    "smoke:windows-providers",
    "store:msix",
    "tauri",
    "tauri:build",
    "tauri:build:release",
    "tauri:dev",
    "tauri:store:msi",
    "tauri:trust"
  ],
  "dependencies": [
    "@tauri-apps/api",
    "@tauri-apps/plugin-clipboard-manager",
    "@tauri-apps/plugin-dialog",
    "@tauri-apps/plugin-fs",
    "@tauri-apps/plugin-process",
    "@tauri-apps/plugin-shell",
    "@tauri-apps/plugin-updater",
    "@xterm/addon-canvas",
    "@xterm/addon-fit",
    "@xterm/addon-unicode11",
    "@xterm/addon-web-links",
    "@xterm/xterm",
    "react",
    "react-dom",
    "react-markdown",
    "remark-gfm"
  ],
  "devDependencies": [
    "@tauri-apps/cli",
    "@types/node",
    "@types/react",
    "@types/react-dom",
    "@vitejs/plugin-react",
    "autoprefixer",
    "postcss",
    "tailwindcss",
    "typescript",
    "vite"
  ]
}
```

## Primary Entry Points

- `src/components/AgentWorkspace.tsx`: chat/agent workspace, command parsing, send flow.
- `src/lib/stellaFactory.ts`: Stella Factory command parsing, prompt contract, preflight formatting.
- `src/lib/tauri.ts`: frontend Tauri command bindings and result types.
- `src-tauri/src/stella.rs`: Stella analysis, probe, evidence, and factory bootstrap backend.
- `src-tauri/src/lib.rs`: Tauri command registration.
- `SOT/service-factory-state.json`: durable factory state for autonomous runs.
- `SOT/service-factory/`: generated run artifacts, prompts, gates, and reports.

## Relevant Files

- `SOT/service-factory/recovery-proof.md`
- `SOT/service-factory/runs/sf-run-20260531-133552/gates/node-test/stderr.txt`
- `SOT/service-factory/antigravity-readiness.md`
- `SOT/evidence-log.md`
- `SOT/L1-project-summary.md`
- `SOT/service-factory/progress.jsonl`
- `SOT/service-factory/product-brief.md`
- `SOT/tasks.md`
- `SOT/service-factory-state.json`
- `SOT/service-factory/handoff-latest.md`
- `tools/atelier-agent-harness.mjs`
- `tools/windows-provider-smoke.ps1`
- `tools/windows-store/build-msix.ps1`
- `SOT/service-factory/agent-prompts/parallel_implementation--agent_runtime_worker.md`
- `SOT/service-factory/agent-prompts/decomposition--decomposer.md`
- `SOT/service-factory/agent-prompts/verification--critic.md`
- `SOT/service-factory/agent-prompts/integration--integrator.md`
- `SOT/service-factory/agent-prompts/security_review--security_auditor.md`
- `SOT/service-factory/agent-prompts/repo_map--repo_mapper.md`
- `SOT/service-factory/agent-prompts/final_audit--final_audit.md`
- `SOT/service-factory/agent-prompts/verification--runtime_probe.md`
- `SOT/service-factory/agent-prompts/verification--reviewer.md`
- `SOT/service-factory/agent-prompts/deployment_readiness--deployment_readiness.md`
- `SOT/service-factory/agent-prompts/architecture--architect.md`
- `SOT/service-factory/agent-prompts/product_brief--product_manager.md`
- `SOT/service-factory/runs/sf-run-20260531-133552/gates/service-factory-validate/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-133552/gates/service-factory-validate/stdout.txt`
- `SOT/service-factory/bridge/sf-run-20260531-133552/product_brief-product_manager/dispatch.md`
- `SOT/service-factory/bridge/sf-run-20260531-133552/product_brief-product_manager/dispatch.json`
- `SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/events.jsonl`
- `SOT/service-factory/runs/sf-run-20260531-135614/repo_map-repo_mapper/agent-launch.md`
- `SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/events.jsonl`
- `SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/agent-launch.md`
- `SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/result.json`
- `SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/stdout.txt`
- `SOT/service-factory/runs/sf-run-20260531-135614/product_brief-product_manager/local-worker-report.md`
- `SOT/service-factory/runs/sf-run-20260531-135614/gates/service-factory-validate/stderr.txt`
- `SOT/service-factory/runs/sf-run-20260531-135614/gates/service-factory-validate/stdout.txt`
- `src-tauri/src/pty.rs`
- `src-tauri/src/agent.rs`
- `src-tauri/src/clipboard.rs`
- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/credentials.rs`
- `src-tauri/src/stella.rs`
- `docs/code-signing-policy.md`
- `docs/windows-code-signing.md`
- `docs/microsoft-store-release.md`
- `docs/atelier-agent-harness.md`
- `docs/privacy-policy.md`
- `docs/stella-factory.md`

## Runbook

- Frontend build: `npm run build`
- Rust/Tauri tests: `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture`
- Factory validation: `python3 /Users/kansic/.claude/skills/release/scripts/service_factory.py validate --project .`
