# Stella Factory Mission Charter

Generated: 1780460255

## Goal

스텔라팩토리 장기 실행 상태를 만든다

## Project

- Root: `/Users/kansic/Service/atelier`
- Stack: React, Rust, Tauri, TypeScript, Vite, xterm.js
- Verification candidates: git diff --check, npm run build, cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture, npm run harness:fixture

## Non-Negotiable Boundaries

- Do not delete databases or user data without explicit approval.
- Do not deploy to production, publish externally, or spend money without explicit approval.
- Preserve unrelated user changes.
- Do not claim completion after a single feature unless the user explicitly narrowed the objective.

## Done When

- The factory state is valid and current.
- The current-state and development-plan artifacts are read before broad implementation.
- Research, capability map, agent topology, roadmap, QC matrix, and readiness report exist.
- Each milestone has implementation evidence and independent verification.
- Readiness is promoted to `pilot_ready` or `full_ready`, or a concrete blocker is recorded.
