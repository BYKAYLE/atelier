param(
  [Parameter(Mandatory = $true)]
  [string]$BundleRoot,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedVersion,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseTag,
  [Parameter(Mandatory = $true)]
  [string]$SourceSha,
  [Parameter(Mandatory = $true)]
  [string]$RunId,
  [Parameter(Mandatory = $true)]
  [string]$RunAttempt,
  [string]$EvidenceDir = "artifacts/windows-release-candidate",
  [int]$StartupTimeoutSec = 45,
  [switch]$AllowInitialSignedChannel,
  [switch]$VerifyInstalledOnly,
  [string]$UpdaterEvidencePath = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$ExpectedVersion = $ExpectedVersion.TrimStart("v")

if ($ReleaseTag -ne "v$ExpectedVersion") {
  throw "Release tag $ReleaseTag does not match expected version $ExpectedVersion."
}
if ($SourceSha -notmatch "^[0-9a-fA-F]{40}$") {
  throw "SourceSha must be a full 40-character Git commit SHA."
}
if ($RunId -notmatch "^[0-9]+$") {
  throw "RunId must be the numeric GitHub Actions run ID."
}
if ($RunAttempt -notmatch "^[1-9][0-9]*$") {
  throw "RunAttempt must be a positive GitHub Actions run attempt."
}
if ($env:GITHUB_RUN_ID -and $env:GITHUB_RUN_ID -ne $RunId) {
  throw "RunId does not match GITHUB_RUN_ID."
}
if ($env:GITHUB_RUN_ATTEMPT -and $env:GITHUB_RUN_ATTEMPT -ne $RunAttempt) {
  throw "RunAttempt does not match GITHUB_RUN_ATTEMPT."
}
if ([string]::IsNullOrWhiteSpace($env:RUNNER_NAME)) {
  throw "RUNNER_NAME is required for physical release evidence."
}
if (-not [Environment]::UserInteractive -or [System.Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) {
  throw "The Windows physical release gate must run in an interactive desktop session, not a service session."
}

function Invoke-AtelierProbe {
  param(
    [Parameter(Mandatory = $true)][string]$ExePath,
    [Parameter(Mandatory = $true)][string]$Argument,
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
  $stdout = $stdoutTask.GetAwaiter().GetResult().Trim()
  $stderr = $stderrTask.GetAwaiter().GetResult().Trim()
  if ($process.ExitCode -ne 0) {
    throw "Atelier probe failed with exit code $($process.ExitCode): $Argument`n$stderr"
  }
  return $stdout
}

function ConvertFrom-RegistryPathValue {
  param([string]$Value, [switch]$StripIconIndex)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $normalized = [Environment]::ExpandEnvironmentVariables($Value.Trim())
  if ($StripIconIndex) { $normalized = $normalized -replace ',\s*-?\d+\s*$', '' }
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
        $location = ConvertFrom-RegistryPathValue ([string]$entry.InstallLocation)
        if ($location) { $candidates += Join-Path $location "Atelier.exe" }
      }
      if ($entry.DisplayIcon) {
        $icon = ConvertFrom-RegistryPathValue ([string]$entry.DisplayIcon) -StripIconIndex
        if ($icon) { $candidates += $icon }
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
  return $null
}

function Get-ExactAtelierProcesses {
  param([string]$ExePath)
  if ([string]::IsNullOrWhiteSpace($ExePath)) { return @() }
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
  foreach ($process in @(Get-ExactAtelierProcesses $ExePath)) {
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

function Get-AuthenticodeEvidence {
  param([Parameter(Mandatory = $true)][string]$Path)
  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  $signer = $signature.SignerCertificate
  $timestamper = $signature.TimeStamperCertificate
  return [pscustomobject][ordered]@{
    status = [string]$signature.Status
    statusMessage = [string]$signature.StatusMessage
    signerSubject = if ($signer) { [string]$signer.Subject } else { $null }
    signerIssuer = if ($signer) { [string]$signer.Issuer } else { $null }
    signerThumbprint = if ($signer) { [string]$signer.Thumbprint } else { $null }
    signerSerialNumber = if ($signer) { [string]$signer.SerialNumber } else { $null }
    signerNotBefore = if ($signer) { $signer.NotBefore.ToUniversalTime().ToString("o") } else { $null }
    signerNotAfter = if ($signer) { $signer.NotAfter.ToUniversalTime().ToString("o") } else { $null }
    timestamped = ($null -ne $timestamper)
    timestamperSubject = if ($timestamper) { [string]$timestamper.Subject } else { $null }
    timestamperIssuer = if ($timestamper) { [string]$timestamper.Issuer } else { $null }
    timestamperThumbprint = if ($timestamper) { [string]$timestamper.Thumbprint } else { $null }
    timestamperNotBefore = if ($timestamper) { $timestamper.NotBefore.ToUniversalTime().ToString("o") } else { $null }
    timestamperNotAfter = if ($timestamper) { $timestamper.NotAfter.ToUniversalTime().ToString("o") } else { $null }
  }
}

$msiCandidates = @(Get-ChildItem -LiteralPath $BundleRoot -Recurse -File -Filter "*.msi" -ErrorAction SilentlyContinue)
if ($msiCandidates.Count -ne 1) {
  throw "Expected exactly one signed MSI candidate below $BundleRoot, found $($msiCandidates.Count)."
}
$installer = $msiCandidates[0]
$installerSignature = Get-AuthenticodeEvidence $installer.FullName
if ($installerSignature.status -ne "Valid") {
  throw "Candidate MSI Authenticode signature is not valid: $($installerSignature.status)"
}
if (-not $installerSignature.timestamped) {
  throw "Candidate MSI Authenticode signature is valid but is not timestamped."
}

$installerHash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$baselineExe = $null
$baselineVersion = $null
$baselineIsOlder = $false
$waiverUsed = $false
$updaterEvidence = $null

if ($VerifyInstalledOnly) {
  if ($AllowInitialSignedChannel) {
    throw "VerifyInstalledOnly cannot be combined with AllowInitialSignedChannel."
  }
  if ([string]::IsNullOrWhiteSpace($UpdaterEvidencePath) -or -not (Test-Path -LiteralPath $UpdaterEvidencePath -PathType Leaf)) {
    throw "VerifyInstalledOnly requires a Windows updater canary receipt."
  }
  $updaterEvidence = Get-Content -LiteralPath $UpdaterEvidencePath -Raw | ConvertFrom-Json
  if ($updaterEvidence.schemaVersion -ne 1 -or $updaterEvidence.status -ne "passed") {
    throw "The Windows updater canary receipt is not a passing schema version 1 receipt."
  }
  if (
    $updaterEvidence.releaseTag -ne $ReleaseTag -or
    ([string]$updaterEvidence.sourceSha).ToLowerInvariant() -ne $SourceSha.ToLowerInvariant() -or
    $updaterEvidence.expectedVersion -ne $ExpectedVersion -or
    ([string]$updaterEvidence.githubRunId) -ne $RunId -or
    ([int]$updaterEvidence.githubRunAttempt) -ne ([int]$RunAttempt) -or
    $updaterEvidence.runnerName -ne ([string]$env:RUNNER_NAME)
  ) {
    throw "The Windows updater canary receipt identity does not match this physical gate run."
  }
  if (
    $updaterEvidence.mode -ne "upgrade" -or
    $updaterEvidence.initialSignedChannelWaiverUsed -eq $true -or
    $updaterEvidence.upgradePersistenceProved -ne $true -or
    $updaterEvidence.updater.signatureVerifiedByTauriUpdater -ne $true -or
    $updaterEvidence.updater.installerLaunchRequested -ne $true -or
    $updaterEvidence.updater.updaterDrivenRelaunch -ne $true
  ) {
    throw "The Windows updater canary did not prove a real signed in-app upgrade and relaunch."
  }
  if (
    ([string]$updaterEvidence.candidate.sha256).ToLowerInvariant() -ne $installerHash -or
    ([long]$updaterEvidence.candidate.bytes) -ne ([long]$installer.Length)
  ) {
    throw "The Windows updater canary receipt refers to a different MSI candidate."
  }
  $baselineVersion = [string]$updaterEvidence.fromVersion
  if (([version]$baselineVersion) -ge ([version]$ExpectedVersion)) {
    throw "The Windows updater canary baseline is not older than the candidate."
  }
  $baselineIsOlder = $true
  $installedExe = [IO.Path]::GetFullPath([string]$updaterEvidence.installed.path)
  if (-not (Test-Path -LiteralPath $installedExe -PathType Leaf)) {
    throw "The updater-installed Atelier.exe could not be located: $installedExe"
  }
  Write-Host "Verifying the candidate installed by Atelier's in-app updater: $installedExe"
} else {
  $baselineExe = Find-InstalledAtelier
  if ($baselineExe) {
    $baselineVersion = Invoke-AtelierProbe -ExePath $baselineExe -Argument "--atelier-version-probe"
  }
  if ($baselineVersion) {
    $baselineIsOlder = ([version]$baselineVersion) -lt ([version]$ExpectedVersion)
    if (([version]$baselineVersion) -gt ([version]$ExpectedVersion)) {
      throw "Refusing to downgrade Atelier from $baselineVersion to $ExpectedVersion."
    }
  }
  $waiverUsed = -not $baselineIsOlder
  if ($waiverUsed -and -not $AllowInitialSignedChannel) {
    $state = if ($baselineVersion) { "installed version is $baselineVersion" } else { "no direct-channel baseline is installed" }
    throw "A real older-version upgrade baseline is required ($state). Use AllowInitialSignedChannel only for the first signed channel release."
  }

  if ($baselineExe) { Stop-ExactAtelierProcesses $baselineExe }
  Write-Host "Installing signed candidate MSI: $($installer.FullName)"
  $arguments = "/i `"$($installer.FullName)`" /qn /norestart"
  $install = Start-Process -FilePath "msiexec.exe" -ArgumentList $arguments -Wait -PassThru -NoNewWindow
  if ($install.ExitCode -notin @(0, 3010)) {
    throw "Candidate MSI installation failed with exit code $($install.ExitCode)."
  }

  $installedExe = $null
  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    $installedExe = Find-InstalledAtelier
    if ($installedExe) { break }
    Start-Sleep -Seconds 1
  }
  if (-not $installedExe) {
    throw "The candidate MSI completed, but installed Atelier.exe could not be located."
  }
}

$installedSignature = Get-AuthenticodeEvidence $installedExe
if ($installedSignature.status -ne "Valid") {
  throw "Installed Atelier Authenticode signature is not valid: $($installedSignature.status)"
}
if (-not $installedSignature.timestamped) {
  throw "Installed Atelier Authenticode signature is valid but is not timestamped."
}
$installedVersion = Invoke-AtelierProbe -ExePath $installedExe -Argument "--atelier-version-probe"
if ($installedVersion -ne $ExpectedVersion) {
  throw "Installed version mismatch: expected $ExpectedVersion, found $installedVersion."
}

$installedRoot = Split-Path -Parent $installedExe
$designEngine = Get-ChildItem -LiteralPath $installedRoot -Recurse -Directory -Filter "design-engine" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $designEngine) {
  throw "Installed candidate is missing resources/design-engine."
}

Stop-ExactAtelierProcesses $installedExe
$started = Start-Process -FilePath $installedExe -PassThru
$rendererReceipt = $null
try {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $running = @(Get-ExactAtelierProcesses $installedExe)
    if ($running.Count -gt 0) {
      try {
        $receipt = (Invoke-AtelierProbe -ExePath $installedExe -Argument "--atelier-renderer-ready-probe") | ConvertFrom-Json
        $runningIds = @($running | ForEach-Object { $_.Id })
        if ($receipt.windowLabel -eq "main" -and $receipt.pid -in $runningIds) {
          $rendererReceipt = $receipt
          break
        }
      } catch {
        Write-Host "Renderer is not ready yet: $($_.Exception.Message)"
      }
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $rendererReceipt) {
    $detail = if ($started.HasExited) { "exit code $($started.ExitCode)" } else { "no matching renderer receipt" }
    throw "Installed candidate failed the renderer-ready restart proof: $detail"
  }
} finally {
  Stop-ExactAtelierProcesses $installedExe
}

$postRestartVersion = Invoke-AtelierProbe -ExePath $installedExe -Argument "--atelier-version-probe"
if ($postRestartVersion -ne $ExpectedVersion) {
  throw "Candidate version did not persist after restart: expected $ExpectedVersion, found $postRestartVersion."
}

$mode = if ($VerifyInstalledOnly) {
  "in-app-upgrade"
} elseif ($baselineIsOlder) {
  "direct-upgrade"
} elseif ($baselineVersion) {
  "direct-reinstall"
} else {
  "direct-clean-install"
}
$evidencePath = [IO.Path]::GetFullPath($EvidenceDir)
New-Item -ItemType Directory -Force -Path $evidencePath | Out-Null
$summary = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  releaseTag = $ReleaseTag
  sourceSha = $SourceSha.ToLowerInvariant()
  expectedVersion = $ExpectedVersion
  githubRunId = $RunId
  githubRunAttempt = [int]$RunAttempt
  runnerName = [string]$env:RUNNER_NAME
  mode = $mode
  installationPath = if ($VerifyInstalledOnly) { "in-app-updater" } else { "direct-msi" }
  interactiveDesktop = $true
  baseline = [ordered]@{
    executable = $baselineExe
    version = $baselineVersion
    olderThanCandidate = $baselineIsOlder
  }
  initialSignedChannelWaiverUsed = $waiverUsed
  installer = [ordered]@{
    path = $installer.FullName
    sha256 = $installerHash
    signature = $installerSignature
  }
  installed = [ordered]@{
    path = $installedExe
    sha256 = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash.ToLowerInvariant()
    version = $installedVersion
    signature = $installedSignature
    resourcesPresent = $true
  }
  rendererReady = $true
  rendererReceipt = $rendererReceipt
  postRestartVersion = $postRestartVersion
  upgradePersistenceProved = if ($VerifyInstalledOnly) {
    $updaterEvidence.upgradePersistenceProved -eq $true -and $postRestartVersion -eq $ExpectedVersion
  } else {
    $baselineIsOlder -and $postRestartVersion -eq $ExpectedVersion
  }
  updaterEvidence = if ($VerifyInstalledOnly) {
    [ordered]@{
      path = [IO.Path]::GetFullPath($UpdaterEvidencePath)
      sha256 = (Get-FileHash -LiteralPath $UpdaterEvidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
      mode = $updaterEvidence.mode
      signatureVerifiedByTauriUpdater = $updaterEvidence.updater.signatureVerifiedByTauriUpdater
      updaterDrivenRelaunch = $updaterEvidence.updater.updaterDrivenRelaunch
    }
  } else {
    $null
  }
}
$jsonPath = Join-Path $evidencePath "windows-release-candidate.json"
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
Set-Content -LiteralPath (Join-Path $evidencePath "installed-executable-path.txt") -Value $installedExe -Encoding UTF8

if ($env:GITHUB_OUTPUT) {
  "atelier_exe=$installedExe" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
  "evidence_json=$jsonPath" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
}

Write-Host "Windows signed candidate gate passed: $mode"
Write-Host "Installed executable: $installedExe"
Write-Host "Installed version: $installedVersion"
Write-Host "Renderer PID: $($rendererReceipt.pid)"
