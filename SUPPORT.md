# Support

## Official Installation

Use only assets attached to the official
[GitHub Releases page](https://github.com/BYKAYLE/atelier/releases). A source
build, a locally signed package, and an installed application are separate from
a publicly signed release.

## Bug Reports

Use the
[Atelier bug report form](https://github.com/BYKAYLE/atelier/issues/new?template=bug_report.yml)
for reproducible product defects. Include the Atelier version, operating
system, installer channel, steps to reproduce, expected result, and actual
result.

Before attaching logs:

- remove API keys, tokens, authorization codes, email addresses, and private
  repository paths;
- do not attach credential-store exports or complete environment files;
- keep only the smallest log excerpt needed to reproduce the issue.

The in-app **Patch & Report** form copies a redacted report and opens the
official GitHub issue form. Atelier does not transmit the report automatically.
Review the copied text before pasting it. This flow does not replace the private
security-reporting path in `SECURITY.md`.

## Security Reports

Do not file a public issue for a suspected vulnerability or leaked credential.
Follow [SECURITY.md](SECURITY.md).

## Release and Update Problems

For updater failures, include the currently installed version, the target
version, the installer filename, and whether the application restarted from the
same installed path. On Windows, also include the Authenticode or Smart App
Control message after removing personal data.
