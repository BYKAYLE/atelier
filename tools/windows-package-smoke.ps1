param(
  [string]$BundleRoot = "src-tauri/target/release/bundle",
  [string]$StoreRoot = "output/windows-store",
  [string]$ExpectedVersion = "",
  [string]$ReleaseTag = "",
  [string]$SourceSha = "",
  [string]$RunId = "",
  [string]$EvidencePath = "",
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
  return [pscustomobject][ordered]@{
    executable = $exe.FullName
    sha256 = (Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    version = [string]$productVersion
    resourcesPresent = $true
    signatureStatus = [string](Get-AuthenticodeSignature -LiteralPath $exe.FullName).Status
  }
}

function Get-PackageProof {
  param(
    [Parameter(Mandatory = $true)][System.IO.FileInfo]$Package,
    [Parameter(Mandatory = $true)]$Payload
  )
  $signature = Get-AuthenticodeSignature -LiteralPath $Package.FullName
  return [pscustomobject][ordered]@{
    fileName = $Package.Name
    path = $Package.FullName
    bytes = $Package.Length
    sha256 = (Get-FileHash -LiteralPath $Package.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    signatureStatus = [string]$signature.Status
    payload = $Payload
  }
}

function Find-7Zip {
  $command = Get-Command "7z.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) { return $command.Source }
  foreach ($candidate in @(
    "$env:ProgramFiles\7-Zip\7z.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
  )) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $candidate }
  }
  return $null
}

$msiProof = $null
$nsisProof = $null
$msixProof = $null

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
  $payloadProof = Assert-AtelierPayload -Root $extractRoot -Kind "MSI"
  $msiProof = Get-PackageProof -Package $msi -Payload $payloadProof
}

$nsisCandidates = @(Get-ChildItem -LiteralPath $BundleRoot -Recurse -File -Filter "*.exe" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.DirectoryName -match "(?i)[\\/]nsis$" -or
    $_.Name -match "(?i)(?:^|[-_])setup\.exe$"
  })
if ($nsisCandidates.Count -gt 1) {
  throw "Expected at most one NSIS installer below $BundleRoot, found $($nsisCandidates.Count)."
}
$nsis = $nsisCandidates | Select-Object -First 1
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
  $sevenZip = Find-7Zip
  if (-not $sevenZip) {
    if ($RequireAuthenticode -or -not [string]::IsNullOrWhiteSpace($EvidencePath)) {
      throw "7-Zip is required to verify the NSIS payload, but 7z.exe was not found."
    }
    Write-Warning "NSIS payload extraction was skipped because 7z.exe was not found."
  } else {
    $extractRoot = Join-Path $env:RUNNER_TEMP "atelier-nsis-image"
    if (Test-Path -LiteralPath $extractRoot) {
      Remove-Item -LiteralPath $extractRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
    $process = Start-Process -FilePath $sevenZip -ArgumentList @(
      "x",
      "-y",
      "-o$extractRoot",
      $nsis.FullName
    ) -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
      throw "NSIS extraction failed with exit code $($process.ExitCode): $($nsis.FullName)"
    }
    $payloadProof = Assert-AtelierPayload -Root $extractRoot -Kind "NSIS"
    $nsisProof = Get-PackageProof -Package $nsis -Payload $payloadProof
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
  $payloadProof = Assert-AtelierPayload -Root $extractRoot -Kind "MSIX"
  $msixProof = Get-PackageProof -Package $msix -Payload $payloadProof
}

if (-not $msi -and -not $nsis -and -not $msix) {
  throw "No Windows installer package was found."
}

if (-not [string]::IsNullOrWhiteSpace($EvidencePath)) {
  if ([string]::IsNullOrWhiteSpace($ReleaseTag) -or
      $SourceSha -notmatch "^[0-9a-fA-F]{40}$" -or
      $RunId -notmatch "^[0-9]+$") {
    throw "EvidencePath requires ReleaseTag, a full SourceSha, and a numeric RunId."
  }
  $evidenceFullPath = [IO.Path]::GetFullPath($EvidencePath)
  $evidenceDirectory = Split-Path -Parent $evidenceFullPath
  New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
  [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    releaseTag = $ReleaseTag
    sourceSha = $SourceSha.ToLowerInvariant()
    expectedVersion = $ExpectedVersion.TrimStart("v")
    githubRunId = $RunId
    packages = [ordered]@{
      msi = $msiProof
      nsis = $nsisProof
      msix = $msixProof
    }
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $evidenceFullPath -Encoding UTF8
  Write-Host "Package evidence: $evidenceFullPath"
}

Write-Host "Windows package smoke passed for Atelier $ExpectedVersion."
