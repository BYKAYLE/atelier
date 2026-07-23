# Security Policy

## Supported Versions

Atelier provides security fixes only for the latest non-draft release published
on the official [GitHub Releases page](https://github.com/BYKAYLE/atelier/releases).
Older releases and source snapshots are not supported distribution channels.

## Reporting a Vulnerability

Do not disclose credentials, tokens, private repository contents, terminal
output containing secrets, or an unpatched vulnerability in a public issue.

Send a private report to `indra850@gmail.com` with the subject
`[Atelier Security]`. Include:

- the affected Atelier version and operating system;
- the installation asset name and download source;
- reproduction steps and the expected security boundary;
- the observed impact;
- a minimal, redacted proof of concept when available.

The project will acknowledge the report, reproduce it, and decide whether the
affected release must be withdrawn or replaced. A fix is not considered
released until signed distribution assets and their updater metadata pass the
release evidence gates.

## Security Boundaries

Atelier runs local command-line agents selected by the user. Provider
credentials remain owned by the provider CLI or the operating-system credential
store. Atelier must not copy subscription refresh tokens into its own database
or publish credentials in logs, diagnostics, issues, or release artifacts.

Database deletion, user-data deletion, production deployment, paid actions, and
external publication require explicit user approval.
