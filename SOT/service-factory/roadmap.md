# Stella Factory Roadmap

> Active runtime architecture details and release gates now live in
> `orca-adoption-roadmap.md`. This file keeps the Factory execution sequence.

## Goal

스텔라 모드로 Atelier의 현재 상태를 근거화하고, Orca에서 검증된 런타임
패턴을 선택적으로 도입해 장기 실행 가능한 로컬 개발 워크스페이스를 만든다.

## Milestones

1. Capture the current state baseline: repo, runtime, installed app, SOT, dirty paths, and verification candidates.
2. Write the goal-to-plan strategy: gap analysis, task packets, roles, owned paths, done_when, verification, and rollback.
3. Complete research dossier and capability gap map against the active Orca
   adoption contract.
4. Create agent topology, dispatch queue, and result collection shape.
5. Select bounded implementation task packets, starting with PTY output flow,
   and patch only those boundaries.
6. Run Probe/security/release checks according to touched surfaces.
7. Promote readiness or leave the next executable queue.

## Completion Rule

One feature implementation is a milestone result, not final Factory completion.
