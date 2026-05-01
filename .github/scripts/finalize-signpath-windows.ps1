param(
  [string]$SignedInputDir = "signed-windows",
  [string]$OutputDir = "release-assets/windows"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SignedInputDir)) {
  throw "Signed Windows artifact directory does not exist: $SignedInputDir"
}

if (Test-Path -LiteralPath $OutputDir) {
  Remove-Item -LiteralPath $OutputDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$signedRootPath = (Resolve-Path -LiteralPath $SignedInputDir).Path
$outputRootPath = (Resolve-Path -LiteralPath $OutputDir).Path

$zipFiles = Get-ChildItem -LiteralPath $signedRootPath -Recurse -File -Filter "*.zip"
if ($zipFiles -and $zipFiles.Count -gt 0) {
  $expandedRoot = Join-Path $signedRootPath "__expanded"
  New-Item -ItemType Directory -Force -Path $expandedRoot | Out-Null
  foreach ($zip in $zipFiles) {
    $zipDestination = Join-Path $expandedRoot ([System.IO.Path]::GetFileNameWithoutExtension($zip.Name))
    New-Item -ItemType Directory -Force -Path $zipDestination | Out-Null
    Expand-Archive -LiteralPath $zip.FullName -DestinationPath $zipDestination -Force
  }
}

$installers = Get-ChildItem -LiteralPath $signedRootPath -Recurse -File |
  Where-Object { $_.Extension -in @(".exe", ".msi") }

if (-not $installers -or $installers.Count -eq 0) {
  throw "No signed Windows installers found under $SignedInputDir"
}

foreach ($installer in $installers) {
  $destination = Join-Path $outputRootPath $installer.Name
  Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force

  $signature = (& npm run --silent tauri -- signer sign "$destination" | Out-String).Trim()
  if ([string]::IsNullOrWhiteSpace($signature)) {
    throw "Tauri updater signature was empty for $destination"
  }

  Set-Content -Path "$destination.sig" -Value $signature -Encoding UTF8
}

Write-Host "Prepared signed Windows release assets:"
Get-ChildItem -LiteralPath $outputRootPath -File | Sort-Object Name | ForEach-Object {
  Write-Host " - $($_.Name)"
}
