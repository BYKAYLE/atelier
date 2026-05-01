# Windows Code Signing

Atelier's Windows release path is prepared for SignPath Foundation open-source
code signing. The app is built on GitHub-hosted Windows runners, uploaded as a
GitHub Actions artifact, submitted to SignPath, then released only after the
signed installers are returned.

This keeps the SignPath origin-verification chain intact and avoids the Azure
subscription requirement.

## SignPath Foundation Application

Apply here: <https://signpath.org/apply.html>

Use these project values when applying:

- Project name: `Atelier`
- Repository URL: `https://github.com/BYKAYLE/atelier`
- License: MIT
- Download/release page: `https://github.com/BYKAYLE/atelier-releases/releases`
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

If releases should continue to be published to `BYKAYLE/atelier-releases`
instead of the source repository, also add:

- `RELEASE_OWNER=BYKAYLE`
- `RELEASE_REPO=atelier-releases`
- `RELEASE_GITHUB_TOKEN` secret with release write access to that repository

Without `RELEASE_OWNER` and `RELEASE_REPO`, the workflow publishes to the source
repository that runs the workflow.

## Workflow

`.github/workflows/release.yml` now uses three jobs:

- `build-macos` builds and uploads the macOS release with Tauri Action.
- `build-windows-unsigned` builds unsigned Windows MSI/NSIS installers and
  uploads them as a GitHub Actions artifact.
- `sign-windows` submits that artifact to SignPath, waits for completion,
  regenerates Tauri updater `.sig` files from the signed installers, merges the
  Windows entries into `latest.json`, and uploads the signed assets.

## SignPath Project Notes

For the SignPath project configuration:

- Enable GitHub as a trusted build system.
- Restrict release signing to this repository and release tags/branches.
- Configure the Windows artifact to sign the Tauri MSI and NSIS installer.
- If SignPath offers nested signing for the Tauri app executable inside the
  installers, enable it.
- Enforce file metadata restrictions with product name `Atelier`.

The release workflow intentionally does not use Azure Artifact Signing anymore.
