# Code Signing Policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate
by [SignPath Foundation](https://signpath.org/).

## Project

Atelier is an open-source Tauri desktop application for running local CLI coding
agents and terminal sessions with image paste support and preview-oriented
workflows.

Repository: <https://github.com/BYKAYLE/atelier>

Release downloads: <https://github.com/BYKAYLE/atelier-releases/releases>

## Team Roles

- Committers and reviewers: [BYKAYLE](https://github.com/BYKAYLE)
- Signing approvers: [BYKAYLE](https://github.com/BYKAYLE)

## Release Signing

Windows release installers are built by GitHub Actions from the public source
repository and submitted to SignPath for signing. Release signing is limited to
official release builds created from the repository's release workflow.

Signed release files are expected to be published on the GitHub Releases page.
Each signed binary should be traceable to the corresponding Git tag and workflow
run.

## Privacy Policy

This program will not transfer information to networked systems unless
specifically requested by the user or by the person installing or operating it.

Atelier can launch local command-line tools selected by the user. Those tools
may connect to their own services depending on their configuration and terms.
Users are responsible for the credentials and network behavior of tools they
choose to run inside Atelier.

## System Changes

Atelier installs as a desktop application and can be removed using the operating
system's standard uninstall flow. It does not intentionally modify system
security settings.
