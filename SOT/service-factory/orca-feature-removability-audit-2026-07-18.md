# Orca feature removability audit

Date: 2026-07-18 KST
Status: source, build, macOS package, and installed-app reflection verified;
Windows package workflow pending execution

## Question under test

Can an Orca-derived feature be attached to Atelier as an independent package and
later removed without untangling unrelated core code?

## Result

Yes for the eight registered Orca packages listed in
`module-boundaries.md`, with one declared dependency from mobile control to
remote follow-up. This is not yet true for every historical Atelier feature.

Frontend packages are discovered from `src/components/**/feature.tsx` and mount
through typed registry contracts. Backend modules are compiled and registered
through matching `orca-*` Cargo features. The base Rust application therefore
builds without all eight optional modules.

## Evidence

| Surface | Command | Result |
| --- | --- | --- |
| Registry contract | `npm run smoke:feature-boundaries` | PASS, 8 packages |
| Frontend default distribution | `npm run build` | PASS |
| Frontend restricted registration | `VITE_ATELIER_FEATURES=atelier-cli npm run build` | PASS |
| Backend without optional Orca packages | `cargo check --manifest-path src-tauri/Cargo.toml --no-default-features` | PASS |
| Each backend package in isolation | `cargo check --no-default-features --features <orca-feature>` for all 8 features | PASS |
| Backend regression suite | `cargo test --manifest-path src-tauri/Cargo.toml` | PASS, 141 tests |
| Feature contracts | target `smoke:*` scripts for all 8 packages | PASS |
| Workbench regression | `npm run smoke:workbench` | PASS, including single terminal and duplicate-surface checks |
| Cross-platform release gate | `npm run gate:orca-features` | PASS, 10 contract smokes and 8 isolated Cargo features |
| Workflow syntax | `actionlint .github/workflows/*.yml` | PASS |
| macOS bundle | `npm run tauri:build` | PASS, app and DMG for 0.2.9 |
| Installed macOS executable | bundle/installed SHA-256 comparison | MATCH, `0b8f2c6b48a2bf1088c7988e2aa8c6f9246631d2ed0b3f4bd3ddfa1bc5ee338a` |
| Installed macOS renderer | `--atelier-renderer-ready-probe` | PASS, version 0.2.9, live PID, main window, ready |
| Windows package source gate | `.github/workflows/windows-package-verify.yml` | actionlint PASS; hosted execution pending |

## Limits

- `VITE_ATELIER_FEATURES` controls registration, but eager discovery means it is
  not by itself proof that disabled frontend code was removed from the bundle.
  A distribution that requires physical removal must omit that feature folder.
- `AgentWorkspace.tsx` is still the compatibility composition root for older
  core features. Its remaining responsibilities need separate extraction work.
- The macOS installed application was refreshed and proven separately from the
  source build. A screenshot is not cited because the automated capture did not
  return a usable application image; executable identity, signature, live PID,
  main-window renderer receipt, and bundle hash are the authoritative evidence.
- Windows MSI/NSIS creation, payload inspection, and native browser handoff now
  have a dedicated GitHub-hosted workflow. Physical installed-app, visible
  browser-window, Smart App Control, and signed-package evidence still require a
  registered self-hosted Windows runner.
