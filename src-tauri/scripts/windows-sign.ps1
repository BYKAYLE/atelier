param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$File
)

$ErrorActionPreference = "Stop"

$requiredEnv = @(
  "AZURE_TRUSTED_SIGNING_ENDPOINT",
  "AZURE_TRUSTED_SIGNING_ACCOUNT_NAME",
  "AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME"
)

$missing = @()
foreach ($name in $requiredEnv) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    $missing += $name
  }
}

if ($missing.Count -gt 0) {
  throw "Missing Windows code-signing environment variable(s): $($missing -join ', ')"
}

if (-not (Test-Path -LiteralPath $File)) {
  throw "File to sign does not exist: $File"
}

function Find-SignTool {
  if (-not [string]::IsNullOrWhiteSpace($env:SIGNTOOL_PATH)) {
    if (Test-Path -LiteralPath $env:SIGNTOOL_PATH) {
      return (Resolve-Path -LiteralPath $env:SIGNTOOL_PATH).Path
    }
    throw "SIGNTOOL_PATH is set but does not exist: $env:SIGNTOOL_PATH"
  }

  $kitsRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
  if (Test-Path -LiteralPath $kitsRoot) {
    $candidate = Get-ChildItem -LiteralPath $kitsRoot -Recurse -Filter "signtool.exe" |
      Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.FullName
    }
  }

  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "signtool.exe was not found. Install Windows SDK 10.0.26100.0 or set SIGNTOOL_PATH."
}

function Get-TrustedSigningClient {
  $version = $env:AZURE_TRUSTED_SIGNING_CLIENT_VERSION
  if ([string]::IsNullOrWhiteSpace($version)) {
    $version = "1.0.95"
  }

  $cacheRoot = Join-Path $env:LOCALAPPDATA "Atelier\trusted-signing-client\$version"
  $dlib = Join-Path $cacheRoot "bin\x64\Azure.CodeSigning.Dlib.dll"
  if (Test-Path -LiteralPath $dlib) {
    return $dlib
  }

  New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
  $package = Join-Path $cacheRoot "Microsoft.Trusted.Signing.Client.$version.nupkg"
  $url = "https://www.nuget.org/api/v2/package/Microsoft.Trusted.Signing.Client/$version"

  Invoke-WebRequest -Uri $url -OutFile $package

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $extractPath = Join-Path $cacheRoot "package"
  if (Test-Path -LiteralPath $extractPath) {
    Remove-Item -LiteralPath $extractPath -Recurse -Force
  }
  [System.IO.Compression.ZipFile]::ExtractToDirectory($package, $extractPath)

  $extracted = Join-Path $extractPath "bin\x64\Azure.CodeSigning.Dlib.dll"
  if (-not (Test-Path -LiteralPath $extracted)) {
    throw "Azure.CodeSigning.Dlib.dll was not found in Microsoft.Trusted.Signing.Client $version"
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dlib) | Out-Null
  Copy-Item -LiteralPath $extracted -Destination $dlib -Force
  return $dlib
}

$signTool = Find-SignTool
$dlib = Get-TrustedSigningClient
$tempRoot = $env:RUNNER_TEMP
if ([string]::IsNullOrWhiteSpace($tempRoot)) {
  $tempRoot = $env:TEMP
}
$metadataPath = Join-Path $tempRoot "atelier-trusted-signing-metadata.json"

$metadata = @{
  Endpoint = $env:AZURE_TRUSTED_SIGNING_ENDPOINT
  CodeSigningAccountName = $env:AZURE_TRUSTED_SIGNING_ACCOUNT_NAME
  CertificateProfileName = $env:AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME
}

$metadata | ConvertTo-Json -Compress | Set-Content -Path $metadataPath -Encoding UTF8

$description = $env:AZURE_TRUSTED_SIGNING_DESCRIPTION
if ([string]::IsNullOrWhiteSpace($description)) {
  $description = "Atelier"
}

& $signTool sign `
  /v `
  /fd SHA256 `
  /tr "http://timestamp.acs.microsoft.com" `
  /td SHA256 `
  /dlib $dlib `
  /dmdf $metadataPath `
  /d $description `
  $File

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& $signTool verify /pa /v $File
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
