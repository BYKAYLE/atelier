# Atelier module boundary contract

Status: active architecture contract
Source target: 0.2.12

## Purpose

Atelier keeps its current user workflows and Tauri command names while replacing the
internals behind stable contracts. New capabilities must not be added to the existing
large coordinator files by default.

## Patch lanes

### New feature patch

A new feature starts as an independent module with:

1. one owning module or feature directory;
2. an explicit input/output contract;
3. a compatibility adapter at the current Tauri or React boundary;
4. focused unit or contract tests;
5. a feature flag or capability check when the runtime dependency is optional;
6. no direct access to another feature's private state.

New features may extend a shared contract, but they must not make unrelated modules
depend on their implementation details.

### Existing feature enhancement patch

An enhancement stays inside the module that already owns the behavior. It must:

1. preserve the external command and persisted-data contract unless a migration is explicit;
2. add a regression test for the changed behavior;
3. avoid introducing a new cross-module dependency;
4. prove the current user flow before release packaging.

If an enhancement needs a responsibility that the current module does not own, extract
that responsibility first and make the enhancement in a second patch.

## Backend ownership

| Module | Owns | Does not own |
| --- | --- | --- |
| `agent.rs` | provider coordination compatibility facade during migration | Git implementation, PTY persistence, worktree implementation |
| `agent_git.rs` | Git discovery, status, staging, unstaging, commit, reverse-patch operations | provider execution, preview lifecycle |
| `agent_changes.rs` | run baselines, changed-file summaries, diff evidence | Git mutations, provider execution |
| `agent_preview.rs` | local app discovery, preview process lifecycle, health evidence, redacted preview logs | provider execution, source-control state |
| `agent_worktree.rs` | isolated worktree creation and safe adoption | general Git UI state |
| `pty.rs` / `pty_supervisor.rs` | terminal sessions, process lifetime, reconnectable output | provider authentication |
| `credentials.rs` | provider credentials and sign-in lifecycle | agent transcript rendering |

Planned extractions from `agent.rs`: provider execution adapters and plugin/skill
installation.

## Frontend ownership

The current `AgentWorkspace.tsx` remains a compatibility composition root while the
following feature boundaries are extracted: session list, conversation transcript,
composer, provider/model controls, workbench, preview, source control, and terminal.
Each extracted feature receives state through typed props or a feature-scoped store;
it must not read or mutate another feature's local state through DOM queries.

| Module | Owns | Does not own |
| --- | --- | --- |
| `AgentWorkspace.tsx` | session orchestration and compatibility composition during migration | provider-specific popover state or viewport positioning |
| `agent-composer/CodexModelMenu.tsx` | Codex model, reasoning, and speed menu interaction and portal placement | session persistence, provider execution, runtime model discovery |
| `ComposerSelectMenu.tsx` | generic single-select composer menu interaction | provider-specific business rules |
| `workbench/*` | code, change review, and workspace-mode surfaces | agent execution lifecycle |

## Removable feature packages

These are compile-time detachable packages, not runtime hot-plug extensions.
Removing one changes the distribution build and requires rebuilding the app, but
does not require editing the core composition implementation or leaving the
disabled feature code in the shipped frontend/backend binaries.

Orca-benchmark capabilities are mounted through a generated feature manifest.
Every package owns both `src/components/<feature>/feature.tsx` and
`src/components/<feature>/feature.manifest.json`. The package manifest declares
its stable id, matching Rust feature/module, smoke test, and explicit package
dependencies. `vite.config.ts` discovers these package-owned files at build time,
expands declared dependencies, and emits static imports through
`virtual:atelier-feature-modules`.
`src/features/featureRegistry.tsx` consumes only that generated manifest. Each
removable frontend package contributes through a declared slot, source-control
integration, or control-task adapter; composition roots must not import those
implementations directly.

The matching Rust implementation is guarded by an independent Cargo feature in
`src-tauri/Cargo.toml`. Tauri command registration and shutdown cleanup use the
same guard. This keeps a disabled module out of the backend binary instead of
merely hiding its UI.

| Package id | Frontend contribution | Rust feature |
| --- | --- | --- |
| `atelier-cli` | control-task adapter | `orca-atelier-cli` |
| `github-workflows` | source-control panel | `orca-github-workflows` |
| `linear-workflows` | source-control panel | `orca-linear-workflows` |
| `ssh-workspaces` | connection panel | `orca-ssh-workspaces` |
| `provider-usage` | connection panel | `orca-provider-usage` |
| `remote-followup` | remote settings panel | `orca-remote-followup` |
| `mobile-control` | remote settings panel | `orca-mobile-control` |
| `computer-use` | remote settings panel | `orca-computer-use` |
| `dev-services` | local service settings and workspace panel | `orca-dev-services` |
| `automations` | settings navigation page and scheduler | `orca-automations` |

`orca-mobile-control` explicitly depends on `orca-remote-followup`; the build
automatically includes that dependency when a mobile-only distribution is
requested. No other package in this set has a private cross-feature dependency.

Removal rules:

1. Remove or omit a frontend feature directory/descriptor/manifest, or exclude its id
   with `VITE_ATELIER_FEATURES`. The generated manifest then omits the static
   import without editing a composition root.
2. Disable the matching Cargo feature. The Rust module, commands, and cleanup
   hooks are excluded at compile time.
3. Run `npm run gate:orca-features`. The gate discovers every package and its
   smoke/Rust feature from package-owned manifests. The restricted production build fails if
   an excluded feature directory leaks into any output chunk, and emits
   `dist/atelier-feature-manifest.json` as inclusion evidence.

The frontend distribution id and matching Cargo feature are the two public
switches for one package. They must be changed together so that a removed UI
does not leave an unused backend command set, or vice versa.

`VITE_ATELIER_FEATURES` is a build-time distribution profile. It controls the
generated imports, so excluded frontend feature implementations are physically
absent from the bundle rather than merely hidden at registration time.

This contract currently covers the ten packages above. Core session,
conversation, composer, preview, terminal, and older workspace modules are not
yet claimed as independently removable packages.

## Release gates

Every extraction keeps command names and serialized field names stable, then passes:

- Rust unit tests;
- frontend production build;
- workbench contract smoke;
- PTY supervisor smoke when terminal code is touched;
- physical macOS and Windows installed-app checks for authentication or updater changes.

Source, package, installed app, and user-visible runtime are recorded as separate proof
surfaces. A source-level pass does not claim installed-app completion.
