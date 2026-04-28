# Windows Code Signing

Atelier signs Windows executables and installers through Tauri's
`bundle.windows.signCommand`. The signing configuration is intentionally kept
in `src-tauri/tauri.windows-signing.conf.json` so local macOS builds are not
forced to use Windows signing tools.

The release workflow uses GitHub OIDC plus Azure Artifact Signing. There is no
long-lived Azure client secret in GitHub.

## Required Azure Setup

Artifact Signing requires three Azure-side resources:

- Artifact Signing account
- Completed identity validation
- Public Trust certificate profile

Microsoft currently requires identity validation to be completed in the Azure
portal.

The Microsoft Entra app or managed identity used by GitHub Actions must have a
federated credential for this repository and permission to sign with the
selected certificate profile.

## GitHub Variables

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`

Optional:

- `AZURE_TRUSTED_SIGNING_DESCRIPTION` defaults to `Atelier`
- `AZURE_TRUSTED_SIGNING_CLIENT_VERSION` defaults to `1.0.95`

These values can be repository variables because they are identifiers, not
passwords. Use environment-scoped variables if release signing needs approval.

## Build Command

The Windows release job runs:

```powershell
npm run tauri -- build --config src-tauri/tauri.windows-signing.conf.json
```

Tauri calls `src-tauri/scripts/windows-sign.ps1` for each Windows executable or
installer it needs to sign. The script downloads Microsoft's Trusted Signing
client package, writes the signing metadata, signs with `signtool.exe`, and
verifies the Authenticode signature before the build continues.
