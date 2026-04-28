# Windows Code Signing

Atelier signs Windows installers through Tauri's `bundle.windows.signCommand`.
The signing configuration is intentionally kept in `src-tauri/tauri.windows-signing.conf.json`
so local macOS builds are not forced to use Windows signing tools.

## GitHub Secrets

Add these repository secrets before running the `Release` workflow for Windows:

- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TENANT_ID`
- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`

Optional:

- `AZURE_TRUSTED_SIGNING_DESCRIPTION` defaults to `Atelier`

The Azure application must have permission to sign with the selected Trusted
Signing certificate profile.

## Build Command

The Windows release job runs:

```powershell
npm run tauri -- build --config src-tauri/tauri.windows-signing.conf.json
```

Tauri calls `src-tauri/scripts/windows-sign.ps1` for each Windows executable or
installer it needs to sign.
