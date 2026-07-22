param(
  [Parameter(Mandatory = $true)]
  [string]$Destination
)

$ErrorActionPreference = "Stop"

$destinationPath = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null

$sourcePath = Join-Path $env:LOCALAPPDATA "Atelier\diagnostics"
if (-not (Test-Path -LiteralPath $sourcePath)) {
  Write-Host "No Atelier provider diagnostics directory exists at $sourcePath"
  exit 0
}

$evidence = Get-ChildItem -LiteralPath $sourcePath -File -Filter "atelier-provider-smoke-*"
foreach ($file in $evidence) {
  Copy-Item -LiteralPath $file.FullName -Destination $destinationPath -Force
}

Write-Host "Collected $($evidence.Count) Atelier provider evidence file(s) in $destinationPath"
