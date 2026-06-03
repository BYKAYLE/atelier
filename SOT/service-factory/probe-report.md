# Stella Factory Probe Report

generated_at: 2026-05-31T14:20:00+09:00

## Commands

- `python3 -m py_compile ~/.claude/skills/release/scripts/service_factory.py ~/.claude/skills/release/scripts/service_factory_local_worker.py ~/.claude/skills/stella/scripts/stella_service_factory.py` -> 0
- `python3 ~/.claude/skills/release/scripts/service_factory.py validate --project /Users/kansic/Service/atelier --pretty` -> 0
- `python3 ~/.claude/skills/release/scripts/service_factory.py assess --project /Users/kansic/Service/atelier --write-report --pretty` -> 0
- `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture` -> 0
- `npm run build` -> 0
- `npm run tauri:build` -> 0
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app` -> 0

## Result

The local control-loop, frontend types/build, Rust backend, release bundle, and
installed macOS app all passed the checks above. The installed binary contains
both `stella_factory_bootstrap` and `stella_factory_autopilot`.
