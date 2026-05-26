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

function Get-TauriUpdaterSignature {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RawOutput,
    [Parameter(Mandatory = $true)]
    [string]$File
  )

  $text = $RawOutput.Trim()
  $match = [regex]::Match(
    $text,
    "Public signature:\s*(?<signature>[A-Za-z0-9+/=]+)",
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
  if ($match.Success) {
    $text = $match.Groups["signature"].Value.Trim()
  }

  if ([string]::IsNullOrWhiteSpace($text)) {
    throw "Tauri updater signature was empty for $File"
  }
  if ($text -notmatch "^[A-Za-z0-9+/=]+$") {
    throw "Tauri updater signature contains non-base64 text for $File"
  }
  if ($text.Length -lt 80) {
    throw "Tauri updater signature is unexpectedly short for $File"
  }
  return $text
}

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

  $signatureOutput = (& npm run --silent tauri -- signer sign "$destination" | Out-String)
  $signature = Get-TauriUpdaterSignature -RawOutput $signatureOutput -File $destination

  Set-Content -Path "$destination.sig" -Value $signature -Encoding UTF8 -NoNewline
}

Write-Host "Prepared signed Windows release assets:"
Get-ChildItem -LiteralPath $outputRootPath -File | Sort-Object Name | ForEach-Object {
  Write-Host " - $($_.Name)"
}
