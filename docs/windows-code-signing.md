# Windows Code Signing

Atelier keeps a SignPath Foundation workflow for direct GitHub installers, but
the primary Windows trust path is now Microsoft Store distribution. See
`docs/microsoft-store-release.md` for the Store MSIX workflow.

The SignPath path builds on GitHub-hosted Windows runners, uploads the unsigned
installer as a GitHub Actions artifact, submits it to SignPath, and keeps the
returned signed installers in a private draft. A separate interactive Windows
gate installs that exact draft candidate. Publication is a distinct,
approval-protected workflow and is never performed by the tag build.

This keeps the SignPath origin-verification chain intact if the project is
approved. New projects can be declined for insufficient public reputation, so
Microsoft Store/MSIX is the preferred route for normal Windows users.

## SignPath Foundation Application

Apply here: <https://signpath.org/apply.html>

Use these project values when applying:

- Project name: `Atelier`
- Repository URL: `https://github.com/BYKAYLE/atelier`
- License: MIT
- Download/release page: `https://github.com/BYKAYLE/atelier/releases`
- Code signing policy: `docs/code-signing-policy.md`

SignPath's free Foundation certificate is not automatic. The project must be
approved first, then a SignPath organization, project, signing policy and CI API
token become available.

## GitHub Configuration After Approval

Add this repository secret:

- `SIGNPATH_API_TOKEN`

Add these repository variables:

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG` defaults to `release-signing`
- `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` optional, use it if SignPath creates a
  specific artifact configuration for Tauri Windows installers
- `SIGNPATH_WAIT_TIMEOUT_SECONDS` optional, defaults to `3600`

The production updater and release workflow both publish to
`BYKAYLE/atelier`. Keep `RELEASE_OWNER` and `RELEASE_REPO` unset unless the
updater endpoint in `src-tauri/tauri.conf.json` is migrated at the same time.

## Workflow

The direct-download release has three independent stages:

1. `.github/workflows/release.yml` runs only for a version tag. It builds a
   Developer ID signed and notarized macOS app, builds Windows MSI/NSIS
   installers, sends the Windows payload to SignPath, and uploads every asset
   to a **private draft**. It then seals the exact asset hashes, updater
   signatures, tag, version, and source commit in `release-manifest.json`.
2. `.github/workflows/windows-physical-release-gate.yml` runs on an interactive
   self-hosted Windows x64 runner. It downloads that private draft, verifies
   the manifest and Authenticode signatures, extracts both MSI and NSIS payloads
   with 7-Zip, installs the exact MSI, restarts the installed executable, and
   proves version persistence, renderer startup, visible Claude/Codex browser
   login, CLI authentication, and Smart App Control actively enforcing in the
   `On` state. Merely reading `Off` or `Evaluation` is not release evidence. This evidence is
   mandatory for direct GitHub publication and cannot be disabled at dispatch.
   Dispatch the workflow from the exact release tag; a branch-dispatched run is refused.
   Before creating a tag, `.github/workflows/windows-release-runner-doctor.yml`
   exercises the same host checks without a candidate. The runner must be
   started with `run.cmd` in the logged-in, unlocked desktop, not installed as
   a Windows service.
3. `.github/workflows/publish-release.yml` downloads the evidence from one
   explicitly selected successful physical-gate run. The protected
   `production-release` environment and an exact `PUBLISH <tag>` confirmation
   are both required. Every receipt must bind to that run ID and source SHA,
   and the remote draft is re-downloaded and reverified immediately before its
   draft flag is removed. This is the only workflow allowed to remove draft
   state.

See `docs/release-process.md` for the complete operator checklist.

## SignPath Project Notes

For the SignPath project configuration:

- Enable GitHub as a trusted build system.
- Restrict release signing to this repository and release tags/branches.
- Configure the Windows artifact to sign the Tauri MSI and NSIS installer.
- If SignPath offers nested signing for the Tauri app executable inside the
  installers, enable it.
- Enforce file metadata restrictions with product name `Atelier`.

The release workflow intentionally does not use Azure Artifact Signing anymore.

The workflows have no unsigned fallback. If SignPath, Developer ID,
notarization, updater signing, physical-runner evidence, or release approval is
missing, the candidate stays private or the run fails. Tauri updater
signatures verify update integrity, but they do not replace Windows
Authenticode trust for Smart App Control.
