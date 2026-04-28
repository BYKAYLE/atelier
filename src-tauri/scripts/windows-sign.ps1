param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$File
)

$ErrorActionPreference = "Stop"

$requiredEnv = @(
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
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

if (-not (Get-Command trusted-signing-cli -ErrorAction SilentlyContinue)) {
  throw "trusted-signing-cli is not installed or is not on PATH"
}

$description = $env:AZURE_TRUSTED_SIGNING_DESCRIPTION
if ([string]::IsNullOrWhiteSpace($description)) {
  $description = "Atelier"
}

trusted-signing-cli `
  -e $env:AZURE_TRUSTED_SIGNING_ENDPOINT `
  -a $env:AZURE_TRUSTED_SIGNING_ACCOUNT_NAME `
  -c $env:AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME `
  -d $description `
  $File

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
