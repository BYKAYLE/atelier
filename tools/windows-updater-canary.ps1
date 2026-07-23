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
  [string]$EvidenceDir = "artifacts/windows-updater-canary",
  [int]$StartupTimeoutSec = 45,
  [int]$UpdateTimeoutSec = 600,
  [switch]$AllowInitialSignedChannel
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
  throw "The Windows updater canary must run in an interactive desktop session."
}

function Write-Utf8Json {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$Value,
    [int]$Depth = 10
  )
  $json = $Value | ConvertTo-Json -Depth $Depth
  [IO.File]::WriteAllText($Path, "$json`n", [Text.UTF8Encoding]::new($false))
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

function Assert-Equal {
  param($Actual, $Expected, [string]$Label)
  if ($Actual -ne $Expected) {
    throw "$Label mismatch: expected '$Expected', found '$Actual'."
  }
}

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

$msiCandidates = @(Get-ChildItem -LiteralPath $BundleRoot -Recurse -File -Filter "*.msi" -ErrorAction SilentlyContinue)
if ($msiCandidates.Count -ne 1) {
  throw "Expected exactly one signed MSI candidate below $BundleRoot, found $($msiCandidates.Count)."
}
$installer = $msiCandidates[0]
$signaturePath = "$($installer.FullName).sig"
if (-not (Test-Path -LiteralPath $signaturePath -PathType Leaf)) {
  throw "The exact Tauri updater signature is missing: $signaturePath"
}
$tauriSignature = (Get-Content -LiteralPath $signaturePath -Raw).Trim()
$signatureMatch = [regex]::Match(
  $tauriSignature,
  "Public signature:\s*(?<signature>[A-Za-z0-9+/=]+)",
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)
if ($signatureMatch.Success) {
  $tauriSignature = $signatureMatch.Groups["signature"].Value.Trim()
}
if ($tauriSignature -notmatch "^[A-Za-z0-9+/=]{80,}$") {
  throw "The Tauri updater signature is empty, malformed, or unexpectedly short."
}

$installerSignature = Get-AuthenticodeEvidence $installer.FullName
if ($installerSignature.status -ne "Valid") {
  throw "Candidate MSI Authenticode signature is not valid: $($installerSignature.status)"
}
if (-not $installerSignature.timestamped) {
  throw "Candidate MSI Authenticode signature is valid but is not timestamped."
}

$baselineExe = Find-InstalledAtelier
if (-not $baselineExe) {
  throw "An installed Atelier baseline is required before the in-app updater canary can run."
}
$baselineVersion = Invoke-AtelierProbe -ExePath $baselineExe -Argument "--atelier-version-probe"
$baselineSemver = [version]$baselineVersion
$expectedSemver = [version]$ExpectedVersion
if ($baselineSemver -gt $expectedSemver) {
  throw "Refusing to downgrade Atelier from $baselineVersion to $ExpectedVersion."
}

$mode = if ($baselineSemver -lt $expectedSemver) { "upgrade" } else { "self-reinstall" }
$waiverUsed = $mode -eq "self-reinstall"
if ($waiverUsed -and -not $AllowInitialSignedChannel) {
  throw "The updater canary found version $baselineVersion. A real older-version baseline is required unless the first signed channel waiver is approved."
}

$evidencePath = [IO.Path]::GetFullPath($EvidenceDir)
New-Item -ItemType Directory -Force -Path $evidencePath | Out-Null
$nonce = [guid]::NewGuid().ToString("N")
$configPath = Join-Path $evidencePath "updater-canary-config-$nonce.json"
$handoffPath = Join-Path $evidencePath "updater-canary-handoff-$nonce.json"
$runtimeReceiptPath = Join-Path $evidencePath "updater-canary-runtime-$nonce.json"
$installerHash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$installerBytes = [long]$installer.Length
$config = [ordered]@{
  schemaVersion = 1
  nonce = $nonce
  candidatePath = [IO.Path]::GetFullPath($installer.FullName)
  candidateSignature = $tauriSignature
  candidateSha256 = $installerHash
  candidateBytes = $installerBytes
  expectedVersion = $ExpectedVersion
  releaseTag = $ReleaseTag
  sourceSha = $SourceSha.ToLowerInvariant()
  githubRunId = $RunId
  githubRunAttempt = [int]$RunAttempt
  runnerName = [string]$env:RUNNER_NAME
  mode = $mode
  handoffPath = [IO.Path]::GetFullPath($handoffPath)
  finalReceiptPath = [IO.Path]::GetFullPath($runtimeReceiptPath)
}
Write-Utf8Json -Path $configPath -Value $config

Stop-ExactAtelierProcesses $baselineExe
$startedAt = (Get-Date).ToUniversalTime()
Write-Host "Launching the installed Atelier updater canary: $mode ($baselineVersion -> $ExpectedVersion)"
$canaryArguments = "--atelier-updater-canary `"$([IO.Path]::GetFullPath($configPath))`""
$canaryProcess = Start-Process -FilePath $baselineExe -ArgumentList $canaryArguments -WindowStyle Hidden -PassThru

$runtimeReceipt = $null
$deadline = (Get-Date).AddSeconds($UpdateTimeoutSec)
while ((Get-Date) -lt $deadline) {
  if (Test-Path -LiteralPath $runtimeReceiptPath -PathType Leaf) {
    try {
      $runtimeReceipt = Get-Content -LiteralPath $runtimeReceiptPath -Raw | ConvertFrom-Json
      if ($runtimeReceipt.status) { break }
    } catch {
      Write-Host "Updater receipt is not complete yet: $($_.Exception.Message)"
    }
  }
  Start-Sleep -Milliseconds 500
}
if (-not $runtimeReceipt) {
  $initialExit = if ($canaryProcess.HasExited) { "initial process exit code $($canaryProcess.ExitCode)" } else { "initial process still running" }
  throw "The in-app updater canary timed out after ${UpdateTimeoutSec}s ($initialExit)."
}
if ($runtimeReceipt.status -eq "failed") {
  throw "The in-app updater canary failed: $($runtimeReceipt.error)"
}

Assert-Equal $runtimeReceipt.schemaVersion 1 "updater runtime receipt schema"
Assert-Equal $runtimeReceipt.status "relaunch-verified" "updater runtime receipt status"
Assert-Equal $runtimeReceipt.nonce $nonce "updater runtime nonce"
Assert-Equal $runtimeReceipt.releaseTag $ReleaseTag "updater runtime release tag"
Assert-Equal ([string]$runtimeReceipt.sourceSha).ToLowerInvariant() $SourceSha.ToLowerInvariant() "updater runtime source SHA"
Assert-Equal $runtimeReceipt.expectedVersion $ExpectedVersion "updater runtime expected version"
Assert-Equal ([string]$runtimeReceipt.githubRunId) $RunId "updater runtime GitHub run ID"
Assert-Equal ([int]$runtimeReceipt.githubRunAttempt) ([int]$RunAttempt) "updater runtime GitHub run attempt"
Assert-Equal $runtimeReceipt.runnerName ([string]$env:RUNNER_NAME) "updater runtime runner name"
Assert-Equal $runtimeReceipt.mode $mode "updater runtime mode"
Assert-Equal $runtimeReceipt.fromVersion $baselineVersion "updater runtime baseline version"
Assert-Equal $runtimeReceipt.installedVersion $ExpectedVersion "updater runtime installed version"
Assert-Equal ([string]$runtimeReceipt.candidate.sha256).ToLowerInvariant() $installerHash "updater runtime candidate SHA-256"
Assert-Equal ([long]$runtimeReceipt.candidate.bytes) $installerBytes "updater runtime candidate bytes"
Assert-Equal ([long]$runtimeReceipt.downloadedBytes) $installerBytes "updater downloaded bytes"
Assert-True ($runtimeReceipt.metadataRequests -ge 1) "The updater did not request release metadata."
Assert-True ($runtimeReceipt.candidateRequests -ge 1) "The updater did not download the MSI candidate."
Assert-True ($runtimeReceipt.signatureVerifiedByTauriUpdater -eq $true) "Tauri updater signature verification was not proved."
Assert-True ($runtimeReceipt.installerLaunchRequested -eq $true) "The updater did not request MSI installation."
Assert-True ($runtimeReceipt.updaterDrivenRelaunch -eq $true) "The updater-driven application relaunch was not proved."
Assert-True ((Get-Date $runtimeReceipt.generatedAt).ToUniversalTime() -ge $startedAt) "The updater runtime receipt is stale."
Assert-True (Test-Path -LiteralPath $handoffPath -PathType Leaf) "The updater installer handoff receipt is missing."

$installedExe = [IO.Path]::GetFullPath([string]$runtimeReceipt.installedExecutable.path)
if (-not (Test-Path -LiteralPath $installedExe -PathType Leaf)) {
  throw "The updater reported an installed executable that does not exist: $installedExe"
}
$actualInstalledHash = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-Equal ([string]$runtimeReceipt.installedExecutable.sha256).ToLowerInvariant() $actualInstalledHash "updater runtime installed executable SHA-256"

$installedSignature = Get-AuthenticodeEvidence $installedExe
if ($installedSignature.status -ne "Valid") {
  throw "Updater-installed Atelier Authenticode signature is not valid: $($installedSignature.status)"
}
if (-not $installedSignature.timestamped) {
  throw "Updater-installed Atelier Authenticode signature is valid but is not timestamped."
}
$installedVersion = Invoke-AtelierProbe -ExePath $installedExe -Argument "--atelier-version-probe"
if ($installedVersion -ne $ExpectedVersion) {
  throw "Updater-installed version mismatch: expected $ExpectedVersion, found $installedVersion."
}

$installedRoot = Split-Path -Parent $installedExe
$designEngine = Get-ChildItem -LiteralPath $installedRoot -Recurse -Directory -Filter "design-engine" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $designEngine) {
  throw "Updater-installed candidate is missing resources/design-engine."
}

Stop-ExactAtelierProcesses $installedExe
$started = Start-Process -FilePath $installedExe -PassThru
$rendererReceipt = $null
try {
  $rendererDeadline = (Get-Date).AddSeconds($StartupTimeoutSec)
  while ((Get-Date) -lt $rendererDeadline) {
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
    throw "Updater-installed candidate failed the renderer-ready proof: $detail"
  }
} finally {
  Stop-ExactAtelierProcesses $installedExe
}

$postRestartVersion = Invoke-AtelierProbe -ExePath $installedExe -Argument "--atelier-version-probe"
if ($postRestartVersion -ne $ExpectedVersion) {
  throw "Updater-installed version did not persist after restart: expected $ExpectedVersion, found $postRestartVersion."
}

$handoffHash = (Get-FileHash -LiteralPath $handoffPath -Algorithm SHA256).Hash.ToLowerInvariant()
$runtimeReceiptHash = (Get-FileHash -LiteralPath $runtimeReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
$signatureHash = (Get-FileHash -LiteralPath $signaturePath -Algorithm SHA256).Hash.ToLowerInvariant()
$upgradePersistenceProved = $mode -eq "upgrade" -and $baselineSemver -lt $expectedSemver -and $postRestartVersion -eq $ExpectedVersion
$summary = [ordered]@{
  schemaVersion = 1
  status = "passed"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  releaseTag = $ReleaseTag
  sourceSha = $SourceSha.ToLowerInvariant()
  expectedVersion = $ExpectedVersion
  githubRunId = $RunId
  githubRunAttempt = [int]$RunAttempt
  runnerName = [string]$env:RUNNER_NAME
  mode = $mode
  interactiveDesktop = $true
  fromVersion = $baselineVersion
  initialSignedChannelWaiverUsed = $waiverUsed
  candidate = [ordered]@{
    path = $installer.FullName
    sha256 = $installerHash
    bytes = $installerBytes
    authenticode = $installerSignature
    tauriSignaturePath = [IO.Path]::GetFullPath($signaturePath)
    tauriSignatureSha256 = $signatureHash
  }
  updater = [ordered]@{
    metadataRequests = [long]$runtimeReceipt.metadataRequests
    candidateRequests = [long]$runtimeReceipt.candidateRequests
    downloadedBytes = [long]$runtimeReceipt.downloadedBytes
    signatureVerifiedByTauriUpdater = $true
    installerLaunchRequested = $true
    updaterDrivenRelaunch = $true
    handoffReceipt = [ordered]@{
      file = [IO.Path]::GetFileName($handoffPath)
      sha256 = $handoffHash
      bytes = [long](Get-Item -LiteralPath $handoffPath).Length
    }
    runtimeReceipt = [ordered]@{
      file = [IO.Path]::GetFileName($runtimeReceiptPath)
      sha256 = $runtimeReceiptHash
      bytes = [long](Get-Item -LiteralPath $runtimeReceiptPath).Length
    }
  }
  installed = [ordered]@{
    path = $installedExe
    sha256 = $actualInstalledHash
    version = $installedVersion
    signature = $installedSignature
    resourcesPresent = $true
  }
  rendererReady = $true
  rendererReceipt = $rendererReceipt
  postRestartVersion = $postRestartVersion
  upgradePersistenceProved = $upgradePersistenceProved
}
$summaryPath = Join-Path $evidencePath "windows-updater-canary.json"
Write-Utf8Json -Path $summaryPath -Value $summary

if ($env:GITHUB_OUTPUT) {
  "atelier_exe=$installedExe" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
  "evidence_json=$summaryPath" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
}

Write-Host "Windows in-app updater canary passed: $mode"
Write-Host "Installed executable: $installedExe"
Write-Host "Installed version: $installedVersion"
Write-Host "Updater receipt: $summaryPath"
