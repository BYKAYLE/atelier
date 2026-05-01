param(
  [string]$BundleRoot = "src-tauri/target/release/bundle",
  [string]$OutputDir = "signpath-windows-unsigned"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BundleRoot)) {
  throw "Windows bundle directory does not exist: $BundleRoot"
}

if (Test-Path -LiteralPath $OutputDir) {
  Remove-Item -LiteralPath $OutputDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$bundleRootPath = (Resolve-Path -LiteralPath $BundleRoot).Path
$outputRootPath = (Resolve-Path -LiteralPath $OutputDir).Path

$installers = Get-ChildItem -LiteralPath $bundleRootPath -Recurse -File |
  Where-Object { $_.Extension -in @(".exe", ".msi") }

if (-not $installers -or $installers.Count -eq 0) {
  throw "No Windows installers found under $BundleRoot"
}

foreach ($installer in $installers) {
  $relativePath = [System.IO.Path]::GetRelativePath($bundleRootPath, $installer.FullName)
  $destination = Join-Path $outputRootPath $relativePath
  $destinationDir = Split-Path -Parent $destination
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
  Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force
}

Write-Host "Prepared unsigned Windows artifact for SignPath:"
Get-ChildItem -LiteralPath $outputRootPath -Recurse -File | ForEach-Object {
  Write-Host " - $([System.IO.Path]::GetRelativePath($outputRootPath, $_.FullName))"
}
