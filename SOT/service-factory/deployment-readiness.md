# Stella Factory Deployment Readiness

generated_at: 2026-05-31T14:20:00+09:00

## Verdict

local_staging_ready

## Release Evidence

- `npm run tauri:build` produced:
  - `src-tauri/target/release/bundle/macos/Atelier.app`
  - `src-tauri/target/release/bundle/dmg/Atelier_0.1.45_aarch64.dmg`
- `/Applications/Atelier.app` was updated from the freshly built bundle.
- `codesign --verify --deep --strict --verbose=2 /Applications/Atelier.app`
  passed.
- `/Applications/Atelier.app/Contents/Info.plist` reports version `0.1.45`.

## Boundaries

- No production deployment or external publication was performed.
- This is local macOS app readiness, not App Store or Windows Store release
  readiness.

## Rollback

- The previous installed app can be replaced by a prior bundle if needed.
- Source and generated SOT changes remain visible in the working tree for review.
