param(
  [string]$BundleRoot = "src-tauri/target/release/bundle",
  [string]$StoreRoot = "output/windows-store",
  [string]$ExpectedVersion = "",
  [switch]$RequireAuthenticode
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $package = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
  $ExpectedVersion = [string]$package.version
}

function Assert-AtelierPayload {
  param([string]$Root, [string]$Kind)

  $exe = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter "*.exe" |
    Where-Object { $_.Name -match "(?i)^atelier.*\.exe$" } |
    Select-Object -First 1
  if (-not $exe) {
    throw "$Kind does not contain an Atelier executable."
  }
  if ($exe.Length -lt 1MB) {
    throw "$Kind Atelier executable is unexpectedly small: $($exe.FullName)"
  }

  $designEngine = Get-ChildItem -LiteralPath $Root -Recurse -Directory -Filter "design-engine" |
    Select-Object -First 1
  if (-not $designEngine) {
    throw "$Kind is missing resources/design-engine."
  }

  $productVersion = $exe.VersionInfo.ProductVersion
  if ($productVersion -and -not $productVersion.StartsWith($ExpectedVersion)) {
    throw "$Kind executable version mismatch: expected $ExpectedVersion, found $productVersion"
  }
  if ($RequireAuthenticode) {
    $signature = Get-AuthenticodeSignature -LiteralPath $exe.FullName
    if ($signature.Status -ne "Valid") {
      throw "$Kind executable Authenticode signature is not valid: $($signature.Status)"
    }
  }
  Write-Host "$Kind payload OK: $($exe.FullName) version=$productVersion"
}

$msi = Get-ChildItem -LiteralPath $BundleRoot -Recurse -File -Filter "*.msi" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($msi) {
  if ($RequireAuthenticode) {
    $signature = Get-AuthenticodeSignature -LiteralPath $msi.FullName
    if ($signature.Status -ne "Valid") {
      throw "MSI Authenticode signature is not valid: $($signature.Status)"
    }
  }
  $extractRoot = Join-Path $env:RUNNER_TEMP "atelier-msi-admin-image"
  if (Test-Path -LiteralPath $extractRoot) {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
  $arguments = "/a `"$($msi.FullName)`" /qn TARGETDIR=`"$extractRoot`" /norestart"
  $process = Start-Process -FilePath "msiexec.exe" -ArgumentList $arguments -Wait -PassThru -NoNewWindow
  if ($process.ExitCode -ne 0) {
    throw "MSI administrative install failed with exit code $($process.ExitCode): $($msi.FullName)"
  }
  Assert-AtelierPayload -Root $extractRoot -Kind "MSI"
}

$nsis = Get-ChildItem -LiteralPath $BundleRoot -Recurse -File -Filter "*.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.DirectoryName -match "(?i)[\\/]nsis$" } |
  Select-Object -First 1
if ($nsis) {
  if ($nsis.Length -lt 1MB) {
    throw "NSIS installer is unexpectedly small: $($nsis.FullName)"
  }
  if ($RequireAuthenticode) {
    $signature = Get-AuthenticodeSignature -LiteralPath $nsis.FullName
    if ($signature.Status -ne "Valid") {
      throw "NSIS Authenticode signature is not valid: $($signature.Status)"
    }
  }
  Write-Host "NSIS bundle OK: $($nsis.FullName)"
}

$msix = Get-ChildItem -LiteralPath $StoreRoot -File -Filter "*.msix" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($msix) {
  $extractRoot = Join-Path $env:RUNNER_TEMP "atelier-msix-image"
  if (Test-Path -LiteralPath $extractRoot) {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
  $archive = Join-Path $env:RUNNER_TEMP "atelier-msix.zip"
  Copy-Item -LiteralPath $msix.FullName -Destination $archive -Force
  Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot -Force
  $manifestPath = Join-Path $extractRoot "AppxManifest.xml"
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "MSIX is missing AppxManifest.xml."
  }
  [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
  $identityVersion = [string]$manifest.Package.Identity.Version
  if (-not $identityVersion.StartsWith($ExpectedVersion)) {
    throw "MSIX identity version mismatch: expected $ExpectedVersion, found $identityVersion"
  }
  Assert-AtelierPayload -Root $extractRoot -Kind "MSIX"
}

if (-not $msi -and -not $nsis -and -not $msix) {
  throw "No Windows installer package was found."
}

Write-Host "Windows package smoke passed for Atelier $ExpectedVersion."
