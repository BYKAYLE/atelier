# Orca feature removability audit

Date: 2026-07-18 KST
Status: source, build, frontend physical removal, macOS package, and installed-app
reflection verified; current-head Windows NSIS install and renderer reflection
verified on GitHub-hosted Windows

## Question under test

Can an Orca-derived feature be attached to Atelier as an independent package and
later removed without untangling unrelated core code?

## Result

Yes for the eight registered Orca packages listed in
`module-boundaries.md`, with one declared dependency from mobile control to
remote follow-up. This is not yet true for every historical Atelier feature.

This result means a distribution can omit a package at compile time and ship
without its implementation. It does not mean the installed application can
hot-uninstall that package without a rebuild.

Frontend packages are discovered from `src/components/*/feature.tsx` by the Vite
build, imported through a generated typed registry manifest, and rejected if an
excluded package leaks into an output chunk. Backend modules are compiled and
registered through matching `orca-*` Cargo features. The base Rust application
therefore builds without all eight optional modules, while a restricted frontend
distribution physically omits unselected implementations.

## Evidence

| Surface | Command | Result |
| --- | --- | --- |
| Registry contract | `npm run smoke:feature-boundaries` | PASS, 8 packages |
| Frontend default distribution | `npm run build` and generated feature manifest | PASS, 8 compiled packages |
| Frontend restricted distribution | `VITE_ATELIER_FEATURES=atelier-cli npm run build` plus `npm run smoke:feature-bundle` | PASS, 1 compiled and 7 physically excluded |
| Backend without optional Orca packages | `cargo check --manifest-path src-tauri/Cargo.toml --no-default-features` | PASS |
| Each backend package in isolation | `cargo check --no-default-features --features <orca-feature>` for all 8 features | PASS |
| Backend regression suite | `cargo test --manifest-path src-tauri/Cargo.toml` | PASS, 141 tests |
| Feature contracts | target `smoke:*` scripts for all 8 packages | PASS |
| Workbench regression | `npm run smoke:workbench` | PASS, including single terminal and duplicate-surface checks |
| Cross-platform release gate | `npm run gate:orca-features` | PASS, 11 contract smokes and 8 isolated Cargo features |
| Workflow syntax | `actionlint .github/workflows/*.yml` | PASS |
| macOS bundle | `npm run tauri:build` | PASS, app and DMG for 0.2.9 |
| Installed macOS executable | bundle/installed SHA-256 comparison | MATCH, `0b8f2c6b48a2bf1088c7988e2aa8c6f9246631d2ed0b3f4bd3ddfa1bc5ee338a` |
| Installed macOS renderer | `--atelier-renderer-ready-probe` | PASS, version 0.2.9, live PID, main window, ready |
| Windows browser helper | GitHub Actions run `29601134377` | PASS, native helper launched Edge processes on hosted Windows; visible window not claimed |
| Windows installed package | GitHub Actions run `29602990770` | PASS, NSIS 0.2.9 installed at `%LOCALAPPDATA%\\Atelier`, resources present, renderer ready after install |
| Windows executable identity | `windows-installed-package.json` from run `29602990770` | PASS, only the Tauri bundle marker differs (`unknown` -> `nsis`); normalized SHA-256 matches |
| Windows native browser handoff | package evidence from run `29602990770` | PASS, installed executable helper launched Edge processes; visible window and completed auth not claimed |

## Limits

- `AgentWorkspace.tsx` is still the compatibility composition root for older
  core features. Its remaining responsibilities need separate extraction work.
- The macOS installed application was refreshed and proven separately from the
  source build. A screenshot is not cited because the automated capture did not
  return a usable application image; executable identity, signature, live PID,
  main-window renderer receipt, and bundle hash are the authoritative evidence.
- Windows MSI/NSIS creation, payload inspection, NSIS installation, renderer
  restart, and native browser process handoff pass in the dedicated GitHub-hosted
  workflow. A visible interactive browser window, completed subscription auth,
  Smart App Control behavior on the user's machine, and signed-package evidence
  still require a registered physical Windows runner.
