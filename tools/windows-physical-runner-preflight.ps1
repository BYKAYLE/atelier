param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseTag,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedVersion,
  [Parameter(Mandatory = $true)]
  [string]$SourceSha,
  [Parameter(Mandatory = $true)]
  [string]$RunId,
  [Parameter(Mandatory = $true)]
  [string]$RunAttempt,
  [string]$EvidencePath = "artifacts/windows-runner-preflight/windows-runner-preflight.json",
  [int]$MinFreeSpaceGiB = 6,
  [switch]$AllowInitialSignedChannel,
  [switch]$RequireSmartAppControlEvidence,
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$ExpectedVersion = $ExpectedVersion.TrimStart("v")
$script:Failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure {
  param([string]$Message)
  if (-not [string]::IsNullOrWhiteSpace($Message) -and -not $script:Failures.Contains($Message)) {
    $script:Failures.Add($Message)
  }
}

function Test-WritableDirectory {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
  try {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
    $probe = Join-Path $Path ("atelier-preflight-{0}.tmp" -f [Guid]::NewGuid().ToString("N"))
    [IO.File]::WriteAllText($probe, "atelier-release-preflight")
    Remove-Item -LiteralPath $probe -Force
    return $true
  } catch {
    return $false
  }
}

function Get-CommandEvidence {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string[]]$FallbackPaths = @()
  )
  $path = $null
  try {
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) {
      $path = if ($command.Source) { [string]$command.Source } else { [string]$command.Path }
    }
  } catch {}
  if ([string]::IsNullOrWhiteSpace($path)) {
    foreach ($candidate in $FallbackPaths) {
      if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $path = [IO.Path]::GetFullPath($candidate)
        break
      }
    }
  }
  return [pscustomobject][ordered]@{
    name = $Name
    found = -not [string]::IsNullOrWhiteSpace($path)
    path = $path
  }
}

function Get-DriveEvidence {
  param([string]$Path, [string]$Label)
  $result = [ordered]@{
    label = $Label
    path = $Path
    root = $null
    exists = $false
    freeBytes = $null
    freeGiB = $null
    meetsMinimum = $false
  }
  try {
    if ([string]::IsNullOrWhiteSpace($Path)) { return [pscustomobject]$result }
    $fullPath = [IO.Path]::GetFullPath($Path)
    $root = [IO.Path]::GetPathRoot($fullPath)
    $drive = [IO.DriveInfo]::new($root)
    $freeGiB = [Math]::Round($drive.AvailableFreeSpace / 1GB, 2)
    $result.path = $fullPath
    $result.root = $root
    $result.exists = $drive.IsReady
    $result.freeBytes = [int64]$drive.AvailableFreeSpace
    $result.freeGiB = $freeGiB
    $result.meetsMinimum = $drive.IsReady -and $freeGiB -ge $MinFreeSpaceGiB
  } catch {}
  return [pscustomobject]$result
}

function Get-DefaultBrowserEvidence {
  $result = [ordered]@{
    progId = $null
    command = $null
    executable = $null
    defaultBrowserProcessNames = @()
    resolved = $false
    ok = $false
  }
  try {
    $choice = Get-ItemProperty -LiteralPath "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice" -ErrorAction Stop
    $result.progId = [string]$choice.ProgId
  } catch {
    return [pscustomobject]$result
  }
  if ([string]::IsNullOrWhiteSpace($result.progId)) { return [pscustomobject]$result }

  foreach ($registryPath in @(
    "Registry::HKEY_CURRENT_USER\Software\Classes\$($result.progId)\shell\open\command",
    "Registry::HKEY_CLASSES_ROOT\$($result.progId)\shell\open\command",
    "Registry::HKEY_LOCAL_MACHINE\Software\Classes\$($result.progId)\shell\open\command"
  )) {
    try {
      $command = [string](Get-Item -LiteralPath $registryPath -ErrorAction Stop).GetValue("")
      if ([string]::IsNullOrWhiteSpace($command)) { continue }
      $result.command = $command
      $match = [regex]::Match($command.Trim(), '^(?:"([^"]+)"|([^\s]+))')
      if (-not $match.Success) { continue }
      $candidate = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
      $candidate = [Environment]::ExpandEnvironmentVariables($candidate)
      $result.executable = $candidate
      $result.resolved = Test-Path -LiteralPath $candidate -PathType Leaf
      if ($result.resolved) { break }
    } catch {}
  }
  $names = [System.Collections.Generic.List[string]]::new()
  if ($result.progId -match "(?i)edge") { $names.Add("msedge") }
  if ($result.progId -match "(?i)chrome") { $names.Add("chrome") }
  if ($result.progId -match "(?i)firefox") { $names.Add("firefox") }
  if ($result.progId -match "(?i)brave") { $names.Add("brave") }
  if ($result.progId -match "(?i)opera") { $names.Add("opera") }
  if ($result.progId -match "(?i)arc") { $names.Add("arc") }
  if ($result.executable) {
    $executableName = [IO.Path]::GetFileNameWithoutExtension([string]$result.executable)
    if ($executableName -and $executableName -notmatch "(?i)^(launchwinapp|rundll32|explorer)$") {
      $names.Add($executableName.ToLowerInvariant())
    }
  }
  $result.defaultBrowserProcessNames = @($names | Select-Object -Unique)
  $result.ok = $result.resolved -and $result.defaultBrowserProcessNames.Count -gt 0
  return [pscustomobject]$result
}

function Convert-SmartAppControlRegistryValue {
  param([int]$Value)
  switch ($Value) {
    0 { return "Off" }
    1 { return "On" }
    2 { return "Evaluation" }
    default { return "Unknown($Value)" }
  }
}

function Get-SmartAppControlEvidence {
  $result = [ordered]@{
    available = $false
    state = $null
    source = $null
  }
  try {
    if (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue) {
      $status = Get-MpComputerStatus -ErrorAction Stop
      if ($status.PSObject.Properties.Name -contains "SmartAppControlState") {
        $state = [string]$status.SmartAppControlState
        if (-not [string]::IsNullOrWhiteSpace($state)) {
          $result.available = $true
          $result.state = $state
          $result.source = "Get-MpComputerStatus"
          return [pscustomobject]$result
        }
      }
    }
  } catch {}
  try {
    $policyPath = "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy"
    $policy = Get-ItemProperty -LiteralPath $policyPath -ErrorAction Stop
    if ($policy.PSObject.Properties.Name -contains "VerifiedAndReputablePolicyState") {
      $raw = [int]$policy.VerifiedAndReputablePolicyState
      $result.available = $true
      $result.state = Convert-SmartAppControlRegistryValue $raw
      $result.source = "$policyPath\VerifiedAndReputablePolicyState"
    }
  } catch {}
  return [pscustomobject]$result
}

function Get-PendingRebootEvidence {
  $markers = [System.Collections.Generic.List[string]]::new()
  foreach ($path in @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"
  )) {
    if (Test-Path -LiteralPath $path) { $markers.Add($path) }
  }
  try {
    $sessionManager = Get-ItemProperty -LiteralPath "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager" -ErrorAction Stop
    if ($sessionManager.PSObject.Properties.Name -contains "PendingFileRenameOperations") {
      $markers.Add("PendingFileRenameOperations")
    }
  } catch {}
  return [pscustomobject][ordered]@{
    pending = $markers.Count -gt 0
    markers = @($markers)
  }
}

function Get-InstalledAtelierEvidence {
  $candidates = [System.Collections.Generic.List[string]]::new()
  foreach ($candidate in @(
    "$env:LOCALAPPDATA\Atelier\Atelier.exe",
    "$env:LOCALAPPDATA\Programs\Atelier\Atelier.exe",
    "$env:ProgramFiles\Atelier\Atelier.exe",
    "${env:ProgramFiles(x86)}\Atelier\Atelier.exe"
  )) {
    if ($candidate) { $candidates.Add($candidate) }
  }
  foreach ($root in @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )) {
    foreach ($entry in @(Get-ItemProperty -Path $root -ErrorAction SilentlyContinue)) {
      if ([string]$entry.DisplayName -notmatch "(?i)^Atelier(?: Agent)?$") { continue }
      if ($entry.InstallLocation) { $candidates.Add((Join-Path ([string]$entry.InstallLocation) "Atelier.exe")) }
    }
  }
  $path = $null
  foreach ($candidate in @($candidates | Select-Object -Unique)) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      $path = [IO.Path]::GetFullPath($candidate)
      break
    }
  }
  $processCount = 0
  if ($path) {
    $normalized = $path.ToLowerInvariant()
    $processCount = @(Get-Process -Name "atelier" -ErrorAction SilentlyContinue | Where-Object {
      try { $_.Path -and [IO.Path]::GetFullPath($_.Path).ToLowerInvariant() -eq $normalized } catch { $false }
    }).Count
  }
  return [pscustomobject][ordered]@{
    found = -not [string]::IsNullOrWhiteSpace($path)
    path = $path
    version = if ($path) { [Diagnostics.FileVersionInfo]::GetVersionInfo($path).ProductVersion } else { $null }
    runningProcessCount = $processCount
  }
}

$evidenceFullPath = [IO.Path]::GetFullPath($EvidencePath)
$evidenceDirectory = Split-Path -Parent $evidenceFullPath
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null

$currentProcess = [Diagnostics.Process]::GetCurrentProcess()
$sessionId = [int]$currentProcess.SessionId
$explorerInSession = @(Get-Process -Name explorer -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $sessionId }).Count -gt 0
$logonUiInSession = @(Get-Process -Name LogonUI -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $sessionId }).Count -gt 0
$isWindows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
$interactiveDesktop = $isWindows -and [Environment]::UserInteractive -and $sessionId -gt 0
$desktopUnlocked = $interactiveDesktop -and $explorerInSession -and -not $logonUiInSession

$toolSpecs = @(
  @{ key = "powershell"; name = "powershell.exe"; fallback = @("$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe") },
  @{ key = "node"; name = "node"; fallback = @() },
  @{ key = "npm"; name = "npm"; fallback = @() },
  @{ key = "git"; name = "git"; fallback = @() },
  @{ key = "bash"; name = "bash"; fallback = @("$env:ProgramFiles\Git\bin\bash.exe") },
  @{ key = "gh"; name = "gh"; fallback = @() },
  @{ key = "msiexec"; name = "msiexec.exe"; fallback = @("$env:WINDIR\System32\msiexec.exe") },
  @{ key = "7z"; name = "7z.exe"; fallback = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") }
)
$tools = [ordered]@{}
foreach ($spec in $toolSpecs) {
  $evidence = Get-CommandEvidence $spec.name $spec.fallback
  $tools[$spec.key] = [ordered]@{
    ok = [bool]$evidence.found
    path = $evidence.path
  }
}

$providerCommands = [ordered]@{}
foreach ($spec in @(
  @{ key = "codex"; name = "codex"; fallback = @("$env:APPDATA\npm\codex.cmd") },
  @{ key = "claude"; name = "claude"; fallback = @("$env:APPDATA\npm\claude.cmd", "$env:USERPROFILE\.local\bin\claude.exe") },
  @{ key = "hermes"; name = "hermes"; fallback = @("$env:LOCALAPPDATA\hermes\hermes-agent\hermes.exe", "$env:LOCALAPPDATA\hermes\hermes-agent\venv\Scripts\hermes.exe") }
)) {
  $evidence = Get-CommandEvidence $spec.name $spec.fallback
  $providerCommands[$spec.key] = [ordered]@{
    installedBeforeGate = [bool]$evidence.found
    path = $evidence.path
  }
}

$hermesInstallerCandidates = @(
  Get-CommandEvidence "uv"
  Get-CommandEvidence "pipx"
  Get-CommandEvidence "py.exe" @("$env:WINDIR\py.exe")
  Get-CommandEvidence "python.exe"
)
$hermesInstaller = @($hermesInstallerCandidates | Where-Object { $_.found } | Select-Object -First 1)
$providerInstallation = [ordered]@{
  codexAndClaude = [ordered]@{
    ok = [bool]$tools.node.ok -and [bool]$tools.npm.ok
    method = "npm"
  }
  hermes = [ordered]@{
    ok = $hermesInstaller.Count -gt 0
    method = if ($hermesInstaller.Count -gt 0) { [string]$hermesInstaller[0].name } else { $null }
    path = if ($hermesInstaller.Count -gt 0) { [string]$hermesInstaller[0].path } else { $null }
  }
}

$workspacePath = if ($env:GITHUB_WORKSPACE) { $env:GITHUB_WORKSPACE } else { (Get-Location).Path }
$runnerTempWritable = Test-WritableDirectory $env:RUNNER_TEMP
$workspaceWritable = Test-WritableDirectory $workspacePath
$localAppDataWritable = Test-WritableDirectory $env:LOCALAPPDATA
$evidenceDirWritable = Test-WritableDirectory $evidenceDirectory
$systemDrive = Get-DriveEvidence $env:WINDIR "system"
$runnerTempDrive = Get-DriveEvidence $env:RUNNER_TEMP "runner-temp"
$requiredFreeBytes = [int64]$MinFreeSpaceGiB * 1GB
$driveFreeBytes = @($systemDrive.freeBytes, $runnerTempDrive.freeBytes) | Where-Object { $null -ne $_ }
$freeBytes = if ($driveFreeBytes.Count -gt 0) { [int64]($driveFreeBytes | Measure-Object -Minimum).Minimum } else { 0 }

$msiService = $null
try { $msiService = Get-CimInstance Win32_Service -Filter "Name='msiserver'" -ErrorAction Stop } catch {}
$msiServiceAvailable = $null -ne $msiService
$msiServiceEnabled = $msiServiceAvailable -and [string]$msiService.StartMode -ne "Disabled"
$pendingReboot = Get-PendingRebootEvidence
$baseline = Get-InstalledAtelierEvidence
$browser = Get-DefaultBrowserEvidence
$smartAppControl = Get-SmartAppControlEvidence

$trustProbeTarget = Join-Path $env:WINDIR "System32\notepad.exe"
$trustProbeStatus = $null
$trustProbeSignerThumbprint = $null
$trustProbeTimestamped = $false
try {
  $signature = Get-AuthenticodeSignature -LiteralPath $trustProbeTarget -ErrorAction Stop
  $trustProbeStatus = [string]$signature.Status
  if ($signature.SignerCertificate) { $trustProbeSignerThumbprint = [string]$signature.SignerCertificate.Thumbprint }
  $trustProbeTimestamped = $null -ne $signature.TimeStamperCertificate
} catch {
  $trustProbeStatus = "Unavailable"
}

if ($ReleaseTag -ne "v$ExpectedVersion") { Add-Failure "Release tag and expected version do not match." }
if ($SourceSha -notmatch "^[0-9a-fA-F]{40}$") { Add-Failure "SourceSha must be a full Git commit SHA." }
if ($RunId -notmatch "^[0-9]+$") { Add-Failure "RunId must be numeric." }
if ($RunAttempt -notmatch "^[1-9][0-9]*$") { Add-Failure "RunAttempt must be a positive integer." }
if ([string]::IsNullOrWhiteSpace($env:RUNNER_NAME)) { Add-Failure "RUNNER_NAME is required." }
if ([string]$env:RUNNER_OS -ne "Windows") { Add-Failure "RUNNER_OS must be Windows." }
if ($env:GITHUB_RUN_ID -and $env:GITHUB_RUN_ID -ne $RunId) { Add-Failure "RunId does not match GITHUB_RUN_ID." }
if ($env:GITHUB_RUN_ATTEMPT -and $env:GITHUB_RUN_ATTEMPT -ne $RunAttempt) { Add-Failure "RunAttempt does not match GITHUB_RUN_ATTEMPT." }
if (-not $isWindows) { Add-Failure "Runner is not Windows." }
if (-not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess) { Add-Failure "Runner OS and PowerShell process must both be x64." }
if (-not $interactiveDesktop) { Add-Failure "Runner is not an interactive user desktop session." }
if (-not $explorerInSession) { Add-Failure "Explorer is not running in the release-gate session." }
if (-not $desktopUnlocked) { Add-Failure "Release-gate desktop is locked or unavailable." }
foreach ($toolName in $tools.Keys) { if (-not $tools[$toolName].ok) { Add-Failure "Required command is missing: $toolName." } }
if (-not $providerInstallation.codexAndClaude.ok) { Add-Failure "Node and npm are required to install Codex and Claude." }
if (-not $providerInstallation.hermes.ok) { Add-Failure "uv, pipx, or Python is required to install Hermes." }
$serviceSession = $sessionId -eq 0
if (-not $runnerTempWritable) { Add-Failure "RUNNER_TEMP is missing or not writable." }
if (-not $workspaceWritable) { Add-Failure "GITHUB_WORKSPACE is missing or not writable." }
if (-not $localAppDataWritable) { Add-Failure "LOCALAPPDATA is missing or not writable." }
if (-not $evidenceDirWritable) { Add-Failure "Evidence directory is not writable." }
if (-not $systemDrive.meetsMinimum) { Add-Failure "System drive has less than $MinFreeSpaceGiB GiB free." }
if (-not $runnerTempDrive.meetsMinimum) { Add-Failure "Runner temp drive has less than $MinFreeSpaceGiB GiB free." }
if (-not $msiServiceAvailable -or -not $msiServiceEnabled) { Add-Failure "Windows Installer service is missing or disabled." }
if ($pendingReboot.pending) { Add-Failure "Windows has pending reboot markers." }
if (-not $baseline.found -and -not $AllowInitialSignedChannel) { Add-Failure "An older direct-channel Atelier baseline is required." }
if ($baseline.runningProcessCount -gt 0) { Add-Failure "Close the installed Atelier baseline before running the release gate." }
if (-not $browser.ok) { Add-Failure "The default HTTPS browser executable and process identity could not be resolved." }
if ($trustProbeStatus -ne "Valid" -or [string]::IsNullOrWhiteSpace($trustProbeSignerThumbprint)) { Add-Failure "Windows Authenticode trust probe is not valid." }
if ($RequireSmartAppControlEvidence -and -not $smartAppControl.available) { Add-Failure "Smart App Control state is unavailable." }

$safeRunAttempt = if ($RunAttempt -match "^[1-9][0-9]*$") { [int]$RunAttempt } else { 0 }
$safeSourceSha = if ($SourceSha) { $SourceSha.ToLowerInvariant() } else { "" }
$normalizedArchitecture = if ([Environment]::Is64BitOperatingSystem -and [Environment]::Is64BitProcess) { "x64" } else { [string]$env:RUNNER_ARCH }
$receipt = [ordered]@{
  schemaVersion = 1
  phase = "windows-runner-preflight"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  status = if ($script:Failures.Count -eq 0) { "ready" } else { "blocked" }
  overall = if ($script:Failures.Count -eq 0) { "ok" } else { "blocked" }
  blockers = @($script:Failures)
  releaseTag = $ReleaseTag
  expectedVersion = $ExpectedVersion
  sourceSha = $safeSourceSha
  githubRunId = $RunId
  githubRunAttempt = $safeRunAttempt
  runner = [ordered]@{
    name = [string]$env:RUNNER_NAME
    os = [string]$env:RUNNER_OS
    architecture = $normalizedArchitecture
    osVersion = [Environment]::OSVersion.VersionString
  }
  desktop = [ordered]@{
    sessionId = $sessionId
    interactive = $interactiveDesktop
    serviceSession = $serviceSession
    explorerInSession = $explorerInSession
    unlocked = $desktopUnlocked
  }
  tools = $tools
  providerCommands = $providerCommands
  providerInstallation = $providerInstallation
  storage = [ordered]@{
    workspaceWritable = $workspaceWritable
    tempWritable = $runnerTempWritable
    localAppDataWritable = $localAppDataWritable
    evidenceWritable = $evidenceDirWritable
    freeBytes = $freeBytes
    requiredFreeBytes = $requiredFreeBytes
    ok = $workspaceWritable -and $runnerTempWritable -and $localAppDataWritable -and $evidenceDirWritable -and $freeBytes -ge $requiredFreeBytes
    drives = @($systemDrive, $runnerTempDrive)
  }
  msiService = [ordered]@{
    installed = $msiServiceAvailable
    status = if ($msiService) { [string]$msiService.State } else { $null }
    startMode = if ($msiService) { [string]$msiService.StartMode } else { $null }
    pendingReboot = $pendingReboot
    ok = $msiServiceAvailable -and $msiServiceEnabled -and -not $pendingReboot.pending
  }
  baseline = [ordered]@{
    installed = $baseline
    initialSignedChannelAllowed = [bool]$AllowInitialSignedChannel
    ok = ($baseline.found -or [bool]$AllowInitialSignedChannel) -and $baseline.runningProcessCount -eq 0
  }
  browser = $browser
  authenticodeProbe = [ordered]@{
    target = $trustProbeTarget
    status = $trustProbeStatus
    trusted = $trustProbeStatus -eq "Valid" -and -not [string]::IsNullOrWhiteSpace($trustProbeSignerThumbprint)
    timestamped = $trustProbeTimestamped
    signerThumbprint = $trustProbeSignerThumbprint
    ok = $trustProbeStatus -eq "Valid" -and -not [string]::IsNullOrWhiteSpace($trustProbeSignerThumbprint)
  }
  smartAppControl = [ordered]@{
    available = [bool]$smartAppControl.available
    state = $smartAppControl.state
    source = $smartAppControl.source
    ok = [bool]$smartAppControl.available
  }
}

$receipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $evidenceFullPath -Encoding UTF8
Write-Host "Windows runner preflight receipt: $evidenceFullPath"
if ($script:Failures.Count -gt 0) {
  foreach ($failure in $script:Failures) { Write-Error $failure -ErrorAction Continue }
  if ($Strict) { throw "Windows physical runner preflight failed with $($script:Failures.Count) blocker(s)." }
  exit 1
}
Write-Host "Windows physical runner preflight passed."
