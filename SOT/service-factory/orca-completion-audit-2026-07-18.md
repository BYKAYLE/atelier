# Orca modular completion audit

> Historical 0.2.9 audit. Current package count, current-head evidence, and
> installed-app truth are maintained in `orca-live-parity-audit-2026-07-18.md`.

Date: 2026-07-18 KST
Audited source head: `8987a55498d61eadfaaae791e358bca769d6b744`
Distribution version: `0.2.9`

## Verdict

The eight requested Orca-benchmark capabilities are implemented as compile-time
detachable frontend and Rust packages. Their source contracts, isolated builds,
security boundaries, regression tests, macOS installed reflection, and Windows
NSIS installed reflection are proven at the audited source head.

This is a distribution-module contract, not a runtime plugin contract. Removing
a package requires excluding its frontend id and matching Cargo feature, then
rebuilding the application. The implementation is absent from the resulting
frontend chunks and backend binary instead of merely being hidden in the UI.

Physical-machine assertions remain separate from package truth. GitHub-hosted
Windows proves that the installed native helper starts Edge processes, but it
cannot prove that a browser window was visible to a signed-in desktop user,
that provider authentication completed, or how Smart App Control behaves on a
specific user's machine. Those claims are deliberately not marked complete.

## Requirement matrix

| Requirement | Package id / backend feature | Current implementation evidence | Safety and regression evidence | Status |
| --- | --- | --- | --- | --- |
| Atelier CLI | `atelier-cli` / `orca-atelier-cli` | Generated control-task adapter and `src-tauri/src/atelier_cli.rs` | Explicit command takeover only; options cannot execute shell syntax; contract smoke and isolated Cargo build pass | Proven |
| GitHub workflows | `github-workflows` / `orca-github-workflows` | Source-control contribution with issue, pull request, checks, reviewer, and prepared mutation flows | Mutations are allowlisted and payload-bound; unknown response fields are not trusted; smoke and isolated build pass | Proven |
| SSH remote workspaces | `ssh-workspaces` / `orca-ssh-workspaces` | Connection contribution with remote inspection, workspace setup, branch/worktree, and task execution | Hosts/users reject shell metacharacters; paths and refs are bounded; exact payload approval hash; smoke and isolated build pass | Proven |
| Provider usage | `provider-usage` / `orca-provider-usage` | Connection contribution for normalized local provider status/version and OpenRouter usage | Read-only normalization; documented response-shape parsing; bounded printable version output; smoke and isolated build pass | Proven |
| Linear workflows | `linear-workflows` / `orca-linear-workflows` | Source-control contribution with workspace/team/project/issue snapshot and prepared mutations | Credentials are not returned; mutation variables keep user text as data; allowlisted mutation and exact payload hash; smoke and isolated build pass | Proven |
| Mobile pairing | `mobile-control` / `orca-mobile-control` | Remote settings contribution with pairing, device state, local HTTPS service, and control-plane receipt flow | Loopback default; LAN is HTTPS-only; six-digit pairing; exact secret comparison; TLS health integration test; smoke and isolated build pass | Proven |
| Remote monitoring and follow-up | `remote-followup` / `orca-remote-followup` | Remote proposal, status, approval, and dispatch flow; mobile package declares this dependency | Prompt length bounded; provider and permission allowlists; approval bound to exact payload; smoke and isolated build pass | Proven |
| Approval-based Computer Use | `computer-use` / `orca-computer-use` | Remote settings contribution with prepared browser/preview actions and explicit approval execution | Action allowlist rejects arbitrary automation; URLs are browser/preview scoped; approval hash binds exact action; smoke and isolated build pass | Proven |

## Current-head gates

| Gate | Evidence | Result |
| --- | --- | --- |
| Feature boundary contract | `npm run smoke:feature-boundaries` | PASS, 8 removable modules |
| Combined Orca release gate | `npm run gate:orca-features` | PASS, 11 contract smokes and 8 isolated Rust features |
| Restricted frontend distribution | `npm run smoke:feature-bundle` inside the release gate | PASS, 1 included and 7 physically excluded |
| Core workbench regression | `npm run smoke:workbench` inside the release gate | PASS, including one terminal surface and duplicate-surface checks |
| Rust regression | `cargo test --manifest-path src-tauri/Cargo.toml` | PASS, 141 tests |
| Rust format and lint | `cargo fmt --check` and `cargo clippy --all-targets --all-features -- -D warnings` | PASS |
| Release security | `npm run audit:release` | PASS, credential boundary checks and 0 RustSec vulnerabilities on release target graphs |
| Windows package/install | GitHub Actions run `29604739825` at `8987a554` | PASS, MSI and NSIS built; NSIS 0.2.9 installed; resources present; renderer ready |
| Windows executable identity | `windows-installed-package.json` from run `29604739825` | PASS, normalized built/installed executable SHA-256 matches; bundle marker delta only |
| Windows OAuth browser handoff | `atelier-provider-smoke-20260717-184903.json` from run `29604739825` | PASS, installed native helper accepted the URL and three Edge processes appeared |
| Windows provider CLI execution | GitHub Actions run `29604748251` at `8987a554` | PASS, bounded process-tree timeout; Claude `.exe`, Codex `.cmd`, and Hermes venv `.exe` installed and returned versions; no Win32 error 193 |
| Windows provider diagnostics | `atelier-provider-smoke-20260717-185123.json` from run `29604748251` | PASS, all three providers report `exists=true` and `versionOk=true`; hosted runner has no Claude/Codex user login and does not claim one |
| macOS package/install | packaged and `/Applications/Atelier.app` executable comparison | PASS, version 0.2.9 and SHA-256 `0b8f2c6b48a2bf1088c7988e2aa8c6f9246631d2ed0b3f4bd3ddfa1bc5ee338a` match |
| macOS installed renderer | `/Applications/Atelier.app/Contents/MacOS/atelier --atelier-renderer-ready-probe` | PASS, live PID, `main` window, status `ready` |

## Removal contract

1. Exclude a frontend package id with `VITE_ATELIER_FEATURES`, or remove its
   `src/components/<feature>/feature.tsx` descriptor.
2. Disable the matching `orca-*` Cargo feature.
3. Rebuild and run `npm run gate:orca-features`.
4. The gate rejects direct imports from core composition roots and rejects an
   excluded feature if it leaks into a production chunk.
5. `mobile-control` is the only declared cross-package dependency and requires
   `remote-followup`.

## Truth surfaces and remaining external proof

- **Source/build truth:** proven for all eight requested packages at the audited
  head.
- **macOS installed truth:** proven for the local 0.2.9 application, including
  executable identity and renderer readiness. The local certificate is not a
  public Developer ID/notarization proof.
- **Windows package/installed truth:** proven by GitHub-hosted NSIS installation,
  executable normalization, resources, and renderer receipt.
- **Windows user-visible OAuth truth:** native handoff and browser-process creation
  are proven. Visible interactive browser UI and completed Claude/Codex login are
  not proven by a headless hosted runner.
- **Windows trust-policy truth:** the hosted runner reported Smart App Control
  `Off`; public signing and Smart App Control behavior on an end-user device are
  not proven.
- **Historical core removability:** sessions, conversation, composer, preview,
  terminal, and older workspace modules remain core compatibility surfaces and
  are outside this eight-package completion claim.
