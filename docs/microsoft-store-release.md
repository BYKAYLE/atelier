# Microsoft Store Release

Atelier's preferred Windows trust path is Microsoft Store distribution with an
MSIX package. This avoids relying on a paid public code-signing certificate for
the customer-facing download because Store delivery gives users a trusted
install surface.

The older SignPath workflow is still kept for direct GitHub installers, but it
is optional and depends on SignPath approval.

## Current Store Build Paths

Two Windows artifacts are prepared by `.github/workflows/windows-store.yml`:

- `atelier-windows-store-msix`: primary Store package candidate produced with
  Microsoft's `winapp` CLI.
- `atelier-windows-store-msi-candidate`: fallback Win32 MSI candidate produced
  by Tauri with the WebView2 offline installer embedded.

Use MSIX first for Store submission. Use the MSI candidate only if Microsoft
asks for the Win32 installer route, because MSI/EXE distribution outside Store
still needs a trusted code-signing certificate to avoid SmartScreen reputation
problems.

## Partner Center Values Needed

Reserve the app in Partner Center first, then copy these exact values into the
manual GitHub workflow inputs:

- `package_name`: the package identity name reserved by Partner Center.
- `publisher_name`: the publisher value, usually shaped like `CN=...`.
- `package_version`: a four-part MSIX version such as `0.1.16.0`.

If those values are not available yet, the workflow can still create a local
development MSIX with `Atelier` and `CN=BYKAYLE`, but that package identity is
not the final Store identity.

## Build from GitHub

Run:

1. GitHub Actions -> `Windows Store Package`.
2. Select `Run workflow`.
3. Fill the Partner Center identity values.
4. Download the generated `atelier-windows-store-msix` artifact.
5. Upload the `.msix` package in Partner Center for certification.

The workflow installs `@microsoft/winappcli`, builds the Tauri release
executable, generates an MSIX manifest, creates a development certificate for
local packaging, and emits the MSIX artifact under `output/windows-store`.
The development certificate is only for producing and testing the package; the
Store certification flow controls the trusted public distribution surface.

## Build on a Windows PC

Install prerequisites:

```powershell
npm install --legacy-peer-deps
npm install -g @microsoft/winappcli@0.3.1
```

Set the final Partner Center identity when available:

```powershell
$env:ATELIER_STORE_PACKAGE_NAME = "Atelier"
$env:ATELIER_STORE_PUBLISHER_NAME = "CN=YOUR_PARTNER_CENTER_PUBLISHER"
$env:ATELIER_STORE_PACKAGE_VERSION = "0.1.16.0"
npm run store:msix
```

Fallback MSI candidate:

```powershell
npm run tauri:store:msi
```

The MSIX output is written to `output/windows-store`. The MSI output is written
to `src-tauri/target/release/bundle/msi`.

## Store Listing Checklist

- App name: `Atelier`
- Category: Developer tools or Productivity.
- Homepage: `https://github.com/BYKAYLE/atelier`
- Support URL: `https://github.com/BYKAYLE/atelier/issues`
- Privacy policy URL:
  `https://github.com/BYKAYLE/atelier/blob/main/docs/privacy-policy.md`
- Screenshots: add Windows screenshots of the workspace, settings, and preview
  panel.
- Description: explain that Atelier is a desktop workspace for local CLI coding
  agents, terminal sessions, image paste, and preview workflows.
