param(
  [string]$BundleRoot = "src-tauri/target/release/bundle",
  [string]$ExpectedVersion = "",
  [string]$EvidenceDir = "artifacts/windows-package-verification",
  [int]$StartupTimeoutSec = 45,
  [ValidateSet("nsis", "msi")]
  [string]$InstallerKind = "nsis"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $package = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
  $ExpectedVersion = [string]$package.version
}
$ExpectedVersion = $ExpectedVersion.TrimStart("v")

function Invoke-AtelierProbe {
  param(
    [string]$ExePath,
    [string]$Argument,
    [int]$TimeoutSec = 30
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $ExePath
  $startInfo.Arguments = $Argument
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit($TimeoutSec * 1000)) {
    try { $process.Kill() } catch { }
    throw "Atelier probe timed out after ${TimeoutSec}s: $Argument"
  }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) {
    throw "Atelier probe failed with exit code $($process.ExitCode): $Argument`n$stderr"
  }
  return $stdout.Trim()
}

function Get-AtelierExecutableIdentity {
  param([string]$Path)

  $markers = [ordered]@{
    unknown = "__TAURI_BUNDLE_TYPE_VAR_UNK"
    nsis = "__TAURI_BUNDLE_TYPE_VAR_NSS"
    msi = "__TAURI_BUNDLE_TYPE_VAR_MSI"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  $ascii = [Text.Encoding]::ASCII.GetString($bytes)
  $matches = @()

  foreach ($entry in $markers.GetEnumerator()) {
    $needle = [Text.Encoding]::ASCII.GetBytes([string]$entry.Value)
    $offset = $ascii.IndexOf([string]$entry.Value, [StringComparison]::Ordinal)
    while ($offset -ge 0) {
      $matches += [pscustomobject]@{ Name = [string]$entry.Key; Offset = $offset; Length = $needle.Length }
      $offset = $ascii.IndexOf([string]$entry.Value, $offset + 1, [StringComparison]::Ordinal)
    }
  }

  if ($matches.Count -ne 1) {
    throw "Expected exactly one Tauri bundle marker in $Path, found $($matches.Count)."
  }

  $canonicalMarker = [Text.Encoding]::ASCII.GetBytes([string]$markers.unknown)
  [Array]::Copy($canonicalMarker, 0, $bytes, $matches[0].Offset, $canonicalMarker.Length)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $normalizedHash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }

  return [pscustomobject]@{
    Path = [IO.Path]::GetFullPath($Path)
    Length = $bytes.Length
    Marker = $matches[0].Name
    MarkerOffset = $matches[0].Offset
    RawSha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    NormalizedSha256 = $normalizedHash
  }
}

function ConvertFrom-RegistryPathValue {
  param(
    [string]$Value,
    [switch]$StripIconIndex
  )

  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $normalized = [Environment]::ExpandEnvironmentVariables($Value.Trim())
  if ($StripIconIndex) {
    $normalized = $normalized -replace ',\s*-?\d+\s*$', ''
  }
  return $normalized.Trim().Trim([char]34)
}

function Get-RegistryInstallCandidates {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  $candidates = @()
  foreach ($root in $roots) {
    foreach ($entry in @(Get-ItemProperty -Path $root -ErrorAction SilentlyContinue)) {
      if ([string]$entry.DisplayName -notmatch "(?i)^Atelier(?: Agent)?$") { continue }
      if ($entry.InstallLocation) {
        $installLocation = ConvertFrom-RegistryPathValue ([string]$entry.InstallLocation)
        if ($installLocation) {
          $candidates += Join-Path -Path $installLocation -ChildPath "Atelier.exe"
        }
      }
      if ($entry.DisplayIcon) {
        $iconPath = ConvertFrom-RegistryPathValue ([string]$entry.DisplayIcon) -StripIconIndex
        if ($iconPath) { $candidates += $iconPath }
      }
    }
  }
  return $candidates
}

function Find-InstalledAtelier {
  $candidates = @(
    "$env:LOCALAPPDATA\Atelier\Atelier.exe",
    "$env:LOCALAPPDATA\Programs\Atelier\Atelier.exe",
    "$env:ProgramFiles\Atelier\Atelier.exe",
    "${env:ProgramFiles(x86)}\Atelier\Atelier.exe"
  ) + @(Get-RegistryInstallCandidates)

  foreach ($candidate in $candidates | Where-Object { $_ } | Select-Object -Unique) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return [IO.Path]::GetFullPath($candidate)
    }
  }

  foreach ($root in @(
    "$env:LOCALAPPDATA\Atelier",
    "$env:LOCALAPPDATA\Programs\Atelier",
    "$env:ProgramFiles\Atelier",
    "${env:ProgramFiles(x86)}\Atelier"
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) }) {
    $match = Get-ChildItem -LiteralPath $root -Recurse -File -Filter "Atelier.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($match) { return $match.FullName }
  }
  return $null
}

function Get-ExactAtelierProcesses {
  param([string]$ExePath)
  $normalized = [IO.Path]::GetFullPath($ExePath).ToLowerInvariant()
  return @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try {
      $_.Path -and [IO.Path]::GetFullPath($_.Path).ToLowerInvariant() -eq $normalized
    } catch {
      $false
    }
  })
}

function Stop-ExactAtelierProcesses {
  param([string]$ExePath)
  $processes = @(Get-ExactAtelierProcesses $ExePath)
  foreach ($process in $processes) {
    try { [void]$process.CloseMainWindow() } catch { }
  }
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    if (@(Get-ExactAtelierProcesses $ExePath).Count -eq 0) { return }
    Start-Sleep -Milliseconds 500
  }
  foreach ($process in @(Get-ExactAtelierProcesses $ExePath)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
}

$quotedLocationProbe = ConvertFrom-RegistryPathValue '"C:\Program Files\Atelier"'
$quotedIconProbe = ConvertFrom-RegistryPathValue '"C:\Program Files\Atelier\Atelier.exe",0' -StripIconIndex
if ($quotedLocationProbe -ne 'C:\Program Files\Atelier' -or $quotedIconProbe -ne 'C:\Program Files\Atelier\Atelier.exe') {
  throw "Windows registry path normalization self-test failed."
}

$normalizedInstallerKind = $InstallerKind.ToLowerInvariant()
$installerExtension = if ($normalizedInstallerKind -eq "msi") { "*.msi" } else { "*.exe" }
$installerDirectoryPattern = "(?i)[\\/]$([regex]::Escape($normalizedInstallerKind))$"
$installer = Get-ChildItem -LiteralPath $BundleRoot -Recurse -File -Filter $installerExtension -ErrorAction SilentlyContinue |
  Where-Object { $_.DirectoryName -match $installerDirectoryPattern } |
  Select-Object -First 1
if (-not $installer) {
  throw "No $($normalizedInstallerKind.ToUpperInvariant()) installer was found below $BundleRoot"
}

$evidencePath = [IO.Path]::GetFullPath($EvidenceDir)
New-Item -ItemType Directory -Force -Path $evidencePath | Out-Null

Write-Host "Installing $($normalizedInstallerKind.ToUpperInvariant()) package silently: $($installer.FullName)"
if ($normalizedInstallerKind -eq "msi") {
  $msiexec = Join-Path $env:SystemRoot "System32\msiexec.exe"
  $installerProcess = Start-Process `
    -FilePath $msiexec `
    -ArgumentList "/i `"$($installer.FullName)`" /qn /norestart" `
    -Wait `
    -PassThru
} else {
  $installerProcess = Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait -PassThru
}
if ($installerProcess.ExitCode -ne 0) {
  throw "$($normalizedInstallerKind.ToUpperInvariant()) installation failed with exit code $($installerProcess.ExitCode)"
}

$installedExe = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $installedExe = Find-InstalledAtelier
  if ($installedExe) { break }
  Start-Sleep -Seconds 1
}
if (-not $installedExe) {
  throw "$($normalizedInstallerKind.ToUpperInvariant()) completed, but the installed Atelier.exe could not be located."
}

$builtExe = [IO.Path]::GetFullPath("src-tauri/target/release/atelier.exe")
if (-not (Test-Path -LiteralPath $builtExe -PathType Leaf)) {
  throw "The release executable is missing: $builtExe"
}

$reportedVersion = Invoke-AtelierProbe -ExePath $installedExe -Argument "--atelier-version-probe"
if ($reportedVersion -ne $ExpectedVersion) {
  throw "Installed version mismatch: expected $ExpectedVersion, found $reportedVersion"
}

$builtIdentity = Get-AtelierExecutableIdentity $builtExe
$installedIdentity = Get-AtelierExecutableIdentity $installedExe
Write-Host "Built executable: marker=$($builtIdentity.Marker) raw=$($builtIdentity.RawSha256) normalized=$($builtIdentity.NormalizedSha256)"
Write-Host "Installed executable: marker=$($installedIdentity.Marker) raw=$($installedIdentity.RawSha256) normalized=$($installedIdentity.NormalizedSha256)"

if ($builtIdentity.Marker -ne "unknown") {
  throw "The post-bundle release executable must be restored to the Tauri unknown marker, found $($builtIdentity.Marker)."
}
if ($installedIdentity.Marker -ne $normalizedInstallerKind) {
  throw "The installed executable is not the $($normalizedInstallerKind.ToUpperInvariant()) payload: marker=$($installedIdentity.Marker)."
}
if ($builtIdentity.Length -ne $installedIdentity.Length -or $builtIdentity.NormalizedSha256 -ne $installedIdentity.NormalizedSha256) {
  throw "Installed executable differs from the release executable beyond the required Tauri bundle marker."
}

$installedRoot = Split-Path -Parent $installedExe
$designEngine = Get-ChildItem -LiteralPath $installedRoot -Recurse -Directory -Filter "design-engine" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $designEngine) {
  throw "Installed Atelier is missing resources/design-engine."
}

Stop-ExactAtelierProcesses $installedExe
$started = Start-Process -FilePath $installedExe -PassThru
$rendererReceipt = $null
$rendererReady = $false
try {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $running = @(Get-ExactAtelierProcesses $installedExe)
    if ($running.Count -gt 0) {
      try {
        $receiptJson = Invoke-AtelierProbe -ExePath $installedExe -Argument "--atelier-renderer-ready-probe"
        $receipt = $receiptJson | ConvertFrom-Json
        $runningIds = @($running | ForEach-Object { $_.Id })
        if ($receipt.windowLabel -eq "main" -and $receipt.pid -in $runningIds) {
          $rendererReceipt = $receipt
          $rendererReady = $true
          break
        }
      } catch {
        Write-Host "Renderer is not ready yet: $($_.Exception.Message)"
      }
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $rendererReady) {
    $exitDetail = if ($started.HasExited) { "exit code $($started.ExitCode)" } else { "no matching renderer receipt" }
    throw "Installed Atelier failed the renderer-ready restart proof: $exitDetail"
  }
} finally {
  Stop-ExactAtelierProcesses $installedExe
}

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  expectedVersion = $ExpectedVersion
  installerKind = $normalizedInstallerKind
  installerPath = $installer.FullName
  installerSha256 = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  installedExecutable = $installedExe
  installedVersion = $reportedVersion
  builtExecutableSha256 = $builtIdentity.RawSha256
  installedExecutableSha256 = $installedIdentity.RawSha256
  builtBundleMarker = $builtIdentity.Marker
  installedBundleMarker = $installedIdentity.Marker
  normalizedExecutableSha256 = $installedIdentity.NormalizedSha256
  bundleMarkerDeltaOnly = $true
  resourcesPresent = $true
  rendererReady = $rendererReady
  rendererReceipt = $rendererReceipt
}
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidencePath "windows-installed-package.json") -Encoding UTF8
Set-Content -LiteralPath (Join-Path $evidencePath "installed-executable-path.txt") -Value $installedExe -Encoding UTF8

Write-Host "Installed Atelier proof passed: $installedExe"
Write-Host "Version: $reportedVersion"
Write-Host "Installed raw SHA-256: $($installedIdentity.RawSha256)"
Write-Host "Normalized SHA-256: $($installedIdentity.NormalizedSha256)"
Write-Host "Renderer PID: $($rendererReceipt.pid)"
