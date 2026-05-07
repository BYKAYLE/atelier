param(
  [string]$PackageName = $env:ATELIER_STORE_PACKAGE_NAME,
  [string]$PublisherName = $env:ATELIER_STORE_PUBLISHER_NAME,
  [string]$PackageVersion = $env:ATELIER_STORE_PACKAGE_VERSION,
  [string]$Description = $env:ATELIER_STORE_DESCRIPTION,
  [switch]$SkipTauriBuild
)

$ErrorActionPreference = "Stop"

$isWindowsHost = $env:OS -eq "Windows_NT"
if (-not $isWindowsHost) {
  throw "Microsoft Store MSIX packaging must run on Windows."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

$winapp = Get-Command winapp -ErrorAction SilentlyContinue
if (-not $winapp) {
  throw "winapp CLI was not found. Install it with: npm install -g @microsoft/winappcli"
}

$packageJson = Get-Content -Raw -LiteralPath "package.json" | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($PackageName)) {
  $PackageName = "Atelier"
}

if ([string]::IsNullOrWhiteSpace($PublisherName)) {
  $PublisherName = "CN=BYKAYLE"
  Write-Warning "Using development publisher '$PublisherName'. For final Store upload, set ATELIER_STORE_PUBLISHER_NAME to the Publisher value from Partner Center."
}

if ([string]::IsNullOrWhiteSpace($PackageVersion)) {
  $parts = @($packageJson.version.Split("."))
  while ($parts.Count -lt 4) {
    $parts += "0"
  }
  $PackageVersion = ($parts[0..3] -join ".")
}

if ([string]::IsNullOrWhiteSpace($Description)) {
  $Description = "Atelier desktop coding workspace"
}

if (-not $SkipTauriBuild) {
  npm run tauri -- build --ci --no-bundle
}

$releaseDir = Join-Path $repoRoot "src-tauri\target\release"
$sourceExe = Join-Path $releaseDir "atelier.exe"
if (-not (Test-Path -LiteralPath $sourceExe)) {
  throw "Tauri release executable was not found at $sourceExe"
}

$storeRoot = Join-Path $repoRoot "output\windows-store"
$contentDir = Join-Path $storeRoot "msix-content"
$outputMsix = Join-Path $storeRoot ("Atelier_{0}_x64.msix" -f $PackageVersion)
$devCert = Join-Path $storeRoot "devcert.pfx"

if (Test-Path -LiteralPath $contentDir) {
  Remove-Item -LiteralPath $contentDir -Recurse -Force
}

if (Test-Path -LiteralPath $outputMsix) {
  Remove-Item -LiteralPath $outputMsix -Force
}

New-Item -ItemType Directory -Force -Path $contentDir | Out-Null
Copy-Item -LiteralPath $sourceExe -Destination (Join-Path $contentDir "Atelier.exe") -Force

$iconPath = Join-Path $repoRoot "src-tauri\icons\icon.png"

winapp manifest generate $contentDir `
  --package-name $PackageName `
  --publisher-name $PublisherName `
  --version $PackageVersion `
  --description $Description `
  --executable "Atelier.exe" `
  --logo-path $iconPath `
  --if-exists overwrite

winapp cert generate --publisher $PublisherName --output $devCert --if-exists overwrite
winapp package $contentDir --output $outputMsix --cert $devCert --executable "Atelier.exe"

Write-Host "Prepared Microsoft Store MSIX package:"
Write-Host $outputMsix
Write-Host ""
Write-Host "Package identity used:"
Write-Host "  Package name: $PackageName"
Write-Host "  Publisher:    $PublisherName"
Write-Host "  Version:      $PackageVersion"
