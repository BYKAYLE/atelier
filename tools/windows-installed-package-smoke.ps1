param(
  [ValidateSet("msi", "nsis")]
  [string]$BundleType = "msi",
  [string]$BundleRoot = "src-tauri/target/release/bundle",
  [string]$ExpectedVersion = "",
  [string]$EvidenceDir = "artifacts/windows-package-verification",
  [int]$StartupTimeoutSec = 45,
  [int]$InstallerTimeoutSec = 300,
  [switch]$ProbeBrowserHandoff,
  [switch]$SelfTest
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$BundleType = $BundleType.ToLowerInvariant()

$script:BundleMarkers = [ordered]@{
  unknown = "__TAURI_BUNDLE_TYPE_VAR_UNK"
  nsis = "__TAURI_BUNDLE_TYPE_VAR_NSS"
  msi = "__TAURI_BUNDLE_TYPE_VAR_MSI"
}

function ConvertTo-NativeArgument {
  param([AllowEmptyString()][string]$Value)

  if ($Value -eq "") { return '""' }
  if ($Value -notmatch '[\s"]') { return $Value }

  $builder = [Text.StringBuilder]::new()
  [void]$builder.Append('"')
  $slashes = 0
  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq '\') {
      $slashes++
      continue
    }
    if ($character -eq '"') {
      [void]$builder.Append(('\' * (($slashes * 2) + 1)))
      [void]$builder.Append('"')
      $slashes = 0
      continue
    }
    if ($slashes -gt 0) {
      [void]$builder.Append(('\' * $slashes))
      $slashes = 0
    }
    [void]$builder.Append($character)
  }
  if ($slashes -gt 0) {
    [void]$builder.Append(('\' * ($slashes * 2)))
  }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function Invoke-NativeInstallerProcess {
  param(
    [string]$FilePath,
    [string[]]$Arguments = @(),
    [int]$TimeoutSec = 300
  )

  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join " ")
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()
  if (-not $process.WaitForExit($TimeoutSec * 1000)) {
    $taskkill = if ($env:SystemRoot) { Join-Path $env:SystemRoot "System32\taskkill.exe" } else { "taskkill.exe" }
    try { & $taskkill /PID $process.Id /T /F 1>$null 2>$null } catch { }
    try { if (-not $process.HasExited) { $process.Kill() } } catch { }
    throw "Installer process timed out after ${TimeoutSec}s: $FilePath"
  }
  return $process.ExitCode
}

function Assert-SuccessfulInstallerExitCode {
  param(
    [int]$ExitCode,
    [string]$Operation
  )

  if ($ExitCode -notin @(0, 3010)) {
    throw "$Operation failed with exit code $ExitCode"
  }
}

function Get-MsiexecPath {
  if ($env:SystemRoot) {
    $candidate = Join-Path $env:SystemRoot "System32\msiexec.exe"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }
  return "msiexec.exe"
}

function Find-BundleInstaller {
  param(
    [string]$Root,
    [ValidateSet("msi", "nsis")]
    [string]$Type
  )

  if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Bundle root does not exist: $Root"
  }

  $extension = if ($Type -eq "msi") { "*.msi" } else { "*.exe" }
  $matches = @(Get-ChildItem -LiteralPath $Root -Recurse -File -Filter $extension -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -ieq $Type })
  if ($matches.Count -ne 1) {
    throw "Expected exactly one $($Type.ToUpperInvariant()) installer below $Root, found $($matches.Count)."
  }
  return $matches[0]
}

function New-InstallerCommand {
  param(
    [ValidateSet("install", "uninstall")]
    [string]$Operation,
    [ValidateSet("msi", "nsis")]
    [string]$Type,
    [string]$InstallerPath,
    [string]$UninstallerPath = "",
    [string]$LogPath = ""
  )

  if ($Type -eq "msi") {
    $msiAction = if ($Operation -eq "install") { "/i" } else { "/x" }
    $arguments = @($msiAction, $InstallerPath, "/qn", "/norestart")
    if (-not [string]::IsNullOrWhiteSpace($LogPath)) {
      $arguments += @("/L*v", $LogPath)
    }
    return [pscustomobject]@{
      FilePath = (Get-MsiexecPath)
      Arguments = [string[]]$arguments
    }
  }

  if ($Operation -eq "install") {
    return [pscustomobject]@{
      FilePath = $InstallerPath
      Arguments = [string[]]@("/S")
    }
  }
  if ([string]::IsNullOrWhiteSpace($UninstallerPath)) {
    throw "NSIS uninstall requires the installed uninstaller path."
  }
  return [pscustomobject]@{
    FilePath = $UninstallerPath
    Arguments = [string[]]@("/S")
  }
}

function Invoke-AtelierProbe {
  param(
    [string]$ExePath,
    [string]$Argument,
    [int]$TimeoutSec = 30
  )

  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $ExePath
  $startInfo.Arguments = $Argument
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true

  $process = [Diagnostics.Process]::new()
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

  $bytes = [IO.File]::ReadAllBytes($Path)
  $ascii = [Text.Encoding]::ASCII.GetString($bytes)
  $matches = @()

  foreach ($entry in $script:BundleMarkers.GetEnumerator()) {
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

  $canonicalMarker = [Text.Encoding]::ASCII.GetBytes([string]$script:BundleMarkers.unknown)
  [Array]::Copy($canonicalMarker, 0, $bytes, $matches[0].Offset, $canonicalMarker.Length)
  $sha = [Security.Cryptography.SHA256]::Create()
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

function Assert-AtelierExecutableIdentity {
  param(
    [object]$BuiltIdentity,
    [object]$InstalledIdentity,
    [ValidateSet("msi", "nsis")]
    [string]$ExpectedBundle
  )

  if ($BuiltIdentity.Marker -ne "unknown") {
    throw "The post-bundle release executable must be restored to the Tauri unknown marker, found $($BuiltIdentity.Marker)."
  }
  if ($InstalledIdentity.Marker -ne $ExpectedBundle) {
    throw "The installed executable is not the requested $($ExpectedBundle.ToUpperInvariant()) payload: marker=$($InstalledIdentity.Marker)."
  }
  if ($BuiltIdentity.Length -ne $InstalledIdentity.Length -or $BuiltIdentity.NormalizedSha256 -ne $InstalledIdentity.NormalizedSha256) {
    throw "Installed executable differs from the release executable beyond the required Tauri bundle marker."
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

function ConvertFrom-UninstallCommandPath {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $expanded = [Environment]::ExpandEnvironmentVariables($Value.Trim())
  if ($expanded.StartsWith('"')) {
    $closingQuote = $expanded.IndexOf('"', 1)
    if ($closingQuote -gt 1) { return $expanded.Substring(1, $closingQuote - 1) }
  }
  return ($expanded -split '\s+', 2)[0]
}

function Get-AtelierUninstallEntries {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  $entries = @()
  foreach ($root in $roots) {
    foreach ($entry in @(Get-ItemProperty -Path $root -ErrorAction SilentlyContinue)) {
      if ([string]$entry.DisplayName -notmatch "(?i)^Atelier(?: Agent)?$") { continue }
      $entries += [pscustomobject]@{
        RegistryPath = [string]$entry.PSPath
        KeyName = [string]$entry.PSChildName
        DisplayName = [string]$entry.DisplayName
        DisplayVersion = [string]$entry.DisplayVersion
        Publisher = [string]$entry.Publisher
        InstallLocation = [string]$entry.InstallLocation
        DisplayIcon = [string]$entry.DisplayIcon
        UninstallString = [string]$entry.UninstallString
        QuietUninstallString = [string]$entry.QuietUninstallString
        WindowsInstaller = [int]$entry.WindowsInstaller
      }
    }
  }
  return $entries
}

function Get-RegistryInstallCandidates {
  $candidates = @()
  foreach ($entry in @(Get-AtelierUninstallEntries)) {
    if ($entry.InstallLocation) {
      $installLocation = ConvertFrom-RegistryPathValue $entry.InstallLocation
      if ($installLocation) {
        $candidates += Join-Path -Path $installLocation -ChildPath "Atelier.exe"
      }
    }
    if ($entry.DisplayIcon) {
      $iconPath = ConvertFrom-RegistryPathValue $entry.DisplayIcon -StripIconIndex
      if ($iconPath) { $candidates += $iconPath }
    }
  }
  return $candidates
}

function Find-InstalledAtelier {
  $candidates = @(
    "$env:LOCALAPPDATA\Atelier\Atelier.exe",
    "$env:LOCALAPPDATA\Programs\Atelier\Atelier.exe",
    "$env:LOCALAPPDATA\Programs\Atelier Agent\Atelier.exe",
    "$env:ProgramFiles\Atelier\Atelier.exe",
    "$env:ProgramFiles\Atelier Agent\Atelier.exe",
    "${env:ProgramFiles(x86)}\Atelier\Atelier.exe",
    "${env:ProgramFiles(x86)}\Atelier Agent\Atelier.exe"
  ) + @(Get-RegistryInstallCandidates)

  foreach ($candidate in $candidates | Where-Object { $_ } | Select-Object -Unique) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return [IO.Path]::GetFullPath($candidate)
    }
  }

  foreach ($root in @(
    "$env:LOCALAPPDATA\Atelier",
    "$env:LOCALAPPDATA\Programs\Atelier",
    "$env:LOCALAPPDATA\Programs\Atelier Agent",
    "$env:ProgramFiles\Atelier",
    "$env:ProgramFiles\Atelier Agent",
    "${env:ProgramFiles(x86)}\Atelier",
    "${env:ProgramFiles(x86)}\Atelier Agent"
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) }) {
    $match = Get-ChildItem -LiteralPath $root -Recurse -File -Filter "Atelier.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($match) { return $match.FullName }
  }
  return $null
}

function Wait-InstalledAtelier {
  param([int]$TimeoutSec = 30)

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $installedExe = Find-InstalledAtelier
    if ($installedExe) { return $installedExe }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
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

  if ([string]::IsNullOrWhiteSpace($ExePath)) { return }
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
  Start-Sleep -Milliseconds 500
  if (@(Get-ExactAtelierProcesses $ExePath).Count -ne 0) {
    throw "Atelier processes remained after shutdown: $ExePath"
  }
}

function Start-AtelierRendererCycle {
  param(
    [string]$ExePath,
    [string]$Version,
    [int]$Cycle,
    [int]$TimeoutSec
  )

  Stop-ExactAtelierProcesses $ExePath
  $cycleStartedAtUnixMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $started = Start-Process -FilePath $ExePath -PassThru
  $receipt = $null
  try {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
      $running = @(Get-ExactAtelierProcesses $ExePath)
      if ($running.Count -gt 0) {
        try {
          $receiptJson = Invoke-AtelierProbe -ExePath $ExePath -Argument "--atelier-renderer-ready-probe"
          $candidate = $receiptJson | ConvertFrom-Json
          $runningIds = @($running | ForEach-Object { $_.Id })
          if (
            $candidate.windowLabel -eq "main" -and
            $candidate.status -eq "ready" -and
            $candidate.appVersion -eq $Version -and
            [long]$candidate.readyAtUnixMs -ge $cycleStartedAtUnixMs -and
            $candidate.pid -in $runningIds
          ) {
            $receipt = $candidate
            break
          }
        } catch {
          Write-Host "Renderer cycle $Cycle is not ready yet: $($_.Exception.Message)"
        }
      }
      Start-Sleep -Milliseconds 500
    }
    if (-not $receipt) {
      $exitDetail = if ($started.HasExited) { "exit code $($started.ExitCode)" } else { "no matching renderer receipt" }
      throw "Installed Atelier failed renderer-ready cycle ${Cycle}: $exitDetail"
    }
    return $receipt
  } finally {
    Stop-ExactAtelierProcesses $ExePath
  }
}

function Resolve-NsisUninstaller {
  param(
    [string]$InstalledExe,
    [object[]]$RegistryEntries
  )

  $candidates = @((Join-Path (Split-Path -Parent $InstalledExe) "uninstall.exe"))
  foreach ($entry in $RegistryEntries) {
    foreach ($command in @($entry.QuietUninstallString, $entry.UninstallString)) {
      $path = ConvertFrom-UninstallCommandPath $command
      if ($path -and [IO.Path]::GetExtension($path) -ieq ".exe") { $candidates += $path }
    }
  }
  foreach ($candidate in $candidates | Where-Object { $_ } | Select-Object -Unique) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return [IO.Path]::GetFullPath($candidate)
    }
  }
  throw "The installed NSIS uninstaller could not be located."
}

function Wait-AtelierUninstallCleanup {
  param(
    [string]$InstalledExe,
    [string]$InstalledRoot,
    [int]$TimeoutSec = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $processCount = @(Get-ExactAtelierProcesses $InstalledExe).Count
    $executablePresent = Test-Path -LiteralPath $InstalledExe -PathType Leaf
    $rootPresent = Test-Path -LiteralPath $InstalledRoot
    $registrationCount = @(Get-AtelierUninstallEntries).Count
    if ($processCount -eq 0 -and -not $executablePresent -and -not $rootPresent -and $registrationCount -eq 0) {
      return [pscustomobject]@{
        ProcessesRemoved = $true
        ExecutableRemoved = $true
        InstallRootRemoved = $true
        RegistrationRemoved = $true
      }
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "Uninstall cleanup failed: processes=$processCount executablePresent=$executablePresent installRootPresent=$rootPresent registrations=$registrationCount"
}

function Invoke-InstalledBrowserHandoff {
  param(
    [string]$InstalledExe,
    [string]$LogDir
  )

  $providerSmoke = Join-Path $PSScriptRoot "windows-provider-smoke.ps1"
  if (-not (Test-Path -LiteralPath $providerSmoke -PathType Leaf)) {
    throw "Windows provider smoke is missing: $providerSmoke"
  }
  $windowsPowerShell = if ($env:SystemRoot) {
    Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  } else {
    "powershell.exe"
  }
  & $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File $providerSmoke `
    -AtelierExe $InstalledExe `
    -ProbeBrowserHandoff `
    -RequireBrowserProcessEvidence `
    -LogDir $LogDir
  if ($LASTEXITCODE -ne 0) {
    throw "Installed Atelier browser-handoff smoke failed with exit code $LASTEXITCODE"
  }
}

function Write-SyntheticExecutable {
  param(
    [string]$Path,
    [ValidateSet("unknown", "msi", "nsis")]
    [string]$Marker
  )

  $content = "fixture-prefix::$($script:BundleMarkers[$Marker])::fixture-suffix"
  [IO.File]::WriteAllBytes($Path, [Text.Encoding]::ASCII.GetBytes($content))
}

function Invoke-InstalledPackageLogicSelfTest {
  $fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) "atelier-installed-package-$([Guid]::NewGuid().ToString('N'))"
  try {
    $msiRoot = Join-Path $fixtureRoot "msi"
    $nsisRoot = Join-Path $fixtureRoot "nsis"
    New-Item -ItemType Directory -Force -Path $msiRoot, $nsisRoot | Out-Null
    $msiPath = Join-Path $msiRoot "Atelier_fixture_x64_en-US.msi"
    $nsisPath = Join-Path $nsisRoot "Atelier_fixture_x64-setup.exe"
    [IO.File]::WriteAllBytes($msiPath, [byte[]]@(1))
    [IO.File]::WriteAllBytes($nsisPath, [byte[]]@(1))

    if ((Find-BundleInstaller -Root $fixtureRoot -Type msi).FullName -ne $msiPath) {
      throw "MSI installer discovery self-test failed."
    }
    if ((Find-BundleInstaller -Root $fixtureRoot -Type nsis).FullName -ne $nsisPath) {
      throw "NSIS installer discovery self-test failed."
    }

    $installLog = Join-Path $fixtureRoot "install.log"
    $msiInstall = New-InstallerCommand -Operation install -Type msi -InstallerPath $msiPath -LogPath $installLog
    if (
      [IO.Path]::GetFileName($msiInstall.FilePath) -ine "msiexec.exe" -or
      $msiInstall.Arguments[0] -ne "/i" -or
      $msiInstall.Arguments[1] -ne $msiPath -or
      "/qn" -notin $msiInstall.Arguments -or
      "/norestart" -notin $msiInstall.Arguments
    ) {
      throw "MSI silent install command self-test failed."
    }
    $msiUninstall = New-InstallerCommand -Operation uninstall -Type msi -InstallerPath $msiPath -LogPath $installLog
    if ($msiUninstall.Arguments[0] -ne "/x" -or $msiUninstall.Arguments[1] -ne $msiPath) {
      throw "MSI silent uninstall command self-test failed."
    }
    $nsisInstall = New-InstallerCommand -Operation install -Type nsis -InstallerPath $nsisPath
    if ($nsisInstall.FilePath -ne $nsisPath -or @($nsisInstall.Arguments).Count -ne 1 -or $nsisInstall.Arguments[0] -ne "/S") {
      throw "NSIS silent install command self-test failed."
    }
    $nsisUninstall = New-InstallerCommand -Operation uninstall -Type nsis -InstallerPath $nsisPath -UninstallerPath "C:\Program Files\Atelier\uninstall.exe"
    if ($nsisUninstall.Arguments[0] -ne "/S") {
      throw "NSIS silent uninstall command self-test failed."
    }
    Assert-SuccessfulInstallerExitCode -ExitCode 0 -Operation "self-test"
    Assert-SuccessfulInstallerExitCode -ExitCode 3010 -Operation "self-test"
    $failedExitRejected = $false
    try { Assert-SuccessfulInstallerExitCode -ExitCode 1603 -Operation "self-test" } catch { $failedExitRejected = $true }
    if (-not $failedExitRejected) {
      throw "Failed installer exit code was not rejected."
    }

    $builtPath = Join-Path $fixtureRoot "built.exe"
    $msiExePath = Join-Path $fixtureRoot "installed-msi.exe"
    $nsisExePath = Join-Path $fixtureRoot "installed-nsis.exe"
    Write-SyntheticExecutable -Path $builtPath -Marker unknown
    Write-SyntheticExecutable -Path $msiExePath -Marker msi
    Write-SyntheticExecutable -Path $nsisExePath -Marker nsis
    $builtIdentity = Get-AtelierExecutableIdentity $builtPath
    $msiIdentity = Get-AtelierExecutableIdentity $msiExePath
    $nsisIdentity = Get-AtelierExecutableIdentity $nsisExePath
    Assert-AtelierExecutableIdentity -BuiltIdentity $builtIdentity -InstalledIdentity $msiIdentity -ExpectedBundle msi
    Assert-AtelierExecutableIdentity -BuiltIdentity $builtIdentity -InstalledIdentity $nsisIdentity -ExpectedBundle nsis

    $wrongMarkerRejected = $false
    try {
      Assert-AtelierExecutableIdentity -BuiltIdentity $builtIdentity -InstalledIdentity $nsisIdentity -ExpectedBundle msi
    } catch {
      $wrongMarkerRejected = $_.Exception.Message -match "not the requested MSI payload"
    }
    if (-not $wrongMarkerRejected) {
      throw "Wrong bundle marker was not rejected by the identity self-test."
    }

    $quotedLocation = ConvertFrom-RegistryPathValue '"C:\Program Files\Atelier"'
    $quotedIcon = ConvertFrom-RegistryPathValue '"C:\Program Files\Atelier\Atelier.exe",0' -StripIconIndex
    $uninstallPath = ConvertFrom-UninstallCommandPath '"C:\Program Files\Atelier\uninstall.exe" /S'
    if (
      $quotedLocation -ne 'C:\Program Files\Atelier' -or
      $quotedIcon -ne 'C:\Program Files\Atelier\Atelier.exe' -or
      $uninstallPath -ne 'C:\Program Files\Atelier\uninstall.exe'
    ) {
      throw "Windows registry path normalization self-test failed."
    }

    [IO.File]::WriteAllBytes((Join-Path $msiRoot "duplicate.msi"), [byte[]]@(2))
    $duplicateRejected = $false
    try { [void](Find-BundleInstaller -Root $fixtureRoot -Type msi) } catch { $duplicateRejected = $true }
    if (-not $duplicateRejected) {
      throw "Ambiguous MSI installer discovery was not rejected."
    }

    Write-Host "Windows installed-package logic self-test passed."
  } finally {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($SelfTest) {
  Invoke-InstalledPackageLogicSelfTest
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $package = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
  $ExpectedVersion = [string]$package.version
}
$ExpectedVersion = $ExpectedVersion.TrimStart("v")

$preexistingExe = Find-InstalledAtelier
$preexistingEntries = @(Get-AtelierUninstallEntries)
if ($preexistingExe -or $preexistingEntries.Count -gt 0) {
  throw "Refusing to replace a pre-existing Atelier installation. executable=$preexistingExe registrations=$($preexistingEntries.Count)"
}

$installer = Find-BundleInstaller -Root $BundleRoot -Type $BundleType
$evidencePath = [IO.Path]::GetFullPath($EvidenceDir)
New-Item -ItemType Directory -Force -Path $evidencePath | Out-Null
$installLogPath = Join-Path $evidencePath "$BundleType-install.log"
$uninstallLogPath = Join-Path $evidencePath "$BundleType-uninstall.log"
$installedPathEvidence = Join-Path $evidencePath "installed-executable-path-$BundleType.txt"
$summaryPath = Join-Path $evidencePath "windows-installed-package-$BundleType.json"

$installSucceeded = $false
$installExitCode = $null
$uninstallExitCode = $null
$installedExe = $null
$installedRoot = $null
$reportedVersion = $null
$builtIdentity = $null
$installedIdentity = $null
$identityVerified = $false
$resourcesPresent = $false
$registryEntries = @()
$rendererReceipts = @()
$restartPersistence = $false
$browserHandoffPassed = $false
$cleanup = $null
$failureMessages = [Collections.Generic.List[string]]::new()

try {
  $installCommand = New-InstallerCommand `
    -Operation install `
    -Type $BundleType `
    -InstallerPath $installer.FullName `
    -LogPath $installLogPath
  Write-Host "Installing $($BundleType.ToUpperInvariant()) package silently: $($installer.FullName)"
  $installExitCode = Invoke-NativeInstallerProcess `
    -FilePath $installCommand.FilePath `
    -Arguments @($installCommand.Arguments) `
    -TimeoutSec $InstallerTimeoutSec
  Assert-SuccessfulInstallerExitCode -ExitCode $installExitCode -Operation "$($BundleType.ToUpperInvariant()) installation"
  $installSucceeded = $true

  $installedExe = Wait-InstalledAtelier -TimeoutSec 30
  if (-not $installedExe) {
    throw "$($BundleType.ToUpperInvariant()) completed, but the installed Atelier.exe could not be located."
  }
  Set-Content -LiteralPath $installedPathEvidence -Value $installedExe -Encoding UTF8

  $registryEntries = @(Get-AtelierUninstallEntries)
  if ($registryEntries.Count -eq 0) {
    throw "$($BundleType.ToUpperInvariant()) installed Atelier without a discoverable uninstall registration."
  }
  Stop-ExactAtelierProcesses $installedExe

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
  Assert-AtelierExecutableIdentity `
    -BuiltIdentity $builtIdentity `
    -InstalledIdentity $installedIdentity `
    -ExpectedBundle $BundleType
  $identityVerified = $true

  $installedRoot = Split-Path -Parent $installedExe
  $designEngine = Get-ChildItem -LiteralPath $installedRoot -Recurse -Directory -Filter "design-engine" -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $designEngine) {
    throw "Installed Atelier is missing resources/design-engine."
  }
  $resourcesPresent = $true

  for ($cycle = 1; $cycle -le 2; $cycle++) {
    $rendererReceipts += Start-AtelierRendererCycle `
      -ExePath $installedExe `
      -Version $ExpectedVersion `
      -Cycle $cycle `
      -TimeoutSec $StartupTimeoutSec
  }
  if ($rendererReceipts.Count -ne 2 -or $rendererReceipts[0].pid -eq $rendererReceipts[1].pid) {
    throw "Installed Atelier did not produce distinct renderer receipts across restart cycles."
  }
  $restartPersistence = $true

  if ($ProbeBrowserHandoff) {
    Invoke-InstalledBrowserHandoff -InstalledExe $installedExe -LogDir $evidencePath
    $browserHandoffPassed = $true
  }
} catch {
  $failureMessages.Add($_.Exception.Message)
}

if ($installSucceeded) {
  try {
    if (-not $installedExe) { $installedExe = Wait-InstalledAtelier -TimeoutSec 5 }
    if (-not $installedExe) {
      throw "Installed Atelier could not be found for uninstall cleanup."
    }
    if (-not $installedRoot) { $installedRoot = Split-Path -Parent $installedExe }
    Stop-ExactAtelierProcesses $installedExe

    $uninstallerPath = ""
    if ($BundleType -eq "nsis") {
      $uninstallerPath = Resolve-NsisUninstaller -InstalledExe $installedExe -RegistryEntries @(Get-AtelierUninstallEntries)
    }
    $uninstallCommand = New-InstallerCommand `
      -Operation uninstall `
      -Type $BundleType `
      -InstallerPath $installer.FullName `
      -UninstallerPath $uninstallerPath `
      -LogPath $uninstallLogPath
    Write-Host "Uninstalling $($BundleType.ToUpperInvariant()) package silently."
    $uninstallExitCode = Invoke-NativeInstallerProcess `
      -FilePath $uninstallCommand.FilePath `
      -Arguments @($uninstallCommand.Arguments) `
      -TimeoutSec $InstallerTimeoutSec
    Assert-SuccessfulInstallerExitCode -ExitCode $uninstallExitCode -Operation "$($BundleType.ToUpperInvariant()) uninstall"
    $cleanup = Wait-AtelierUninstallCleanup -InstalledExe $installedExe -InstalledRoot $installedRoot
  } catch {
    $failureMessages.Add("Uninstall cleanup: $($_.Exception.Message)")
  }
}

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  bundleType = $BundleType
  expectedVersion = $ExpectedVersion
  installerDiscovered = $true
  installerPath = $installer.FullName
  installerSha256 = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  silentInstall = $installSucceeded
  installExitCode = $installExitCode
  installedExecutable = $installedExe
  installedVersion = $reportedVersion
  versionVerified = ($reportedVersion -eq $ExpectedVersion)
  uninstallRegistrations = @($registryEntries | ForEach-Object {
    [ordered]@{
      keyName = $_.KeyName
      displayName = $_.DisplayName
      displayVersion = $_.DisplayVersion
      publisher = $_.Publisher
      windowsInstaller = $_.WindowsInstaller
    }
  })
  builtExecutableSha256 = if ($builtIdentity) { $builtIdentity.RawSha256 } else { $null }
  installedExecutableSha256 = if ($installedIdentity) { $installedIdentity.RawSha256 } else { $null }
  builtBundleMarker = if ($builtIdentity) { $builtIdentity.Marker } else { $null }
  installedBundleMarker = if ($installedIdentity) { $installedIdentity.Marker } else { $null }
  expectedBundleMarker = $BundleType
  normalizedExecutableSha256 = if ($installedIdentity) { $installedIdentity.NormalizedSha256 } else { $null }
  bundleMarkerDeltaOnly = $identityVerified
  resourcesPresent = $resourcesPresent
  rendererReady = ($rendererReceipts.Count -eq 2)
  rendererReceipts = @($rendererReceipts)
  restartPersistence = $restartPersistence
  browserHandoffRequested = [bool]$ProbeBrowserHandoff
  browserHandoffPassed = $browserHandoffPassed
  uninstallExitCode = $uninstallExitCode
  uninstallCleanup = [bool]$cleanup
  cleanup = $cleanup
  failures = @($failureMessages)
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding UTF8

if ($failureMessages.Count -gt 0) {
  throw ($failureMessages -join "`n")
}

Write-Host "$($BundleType.ToUpperInvariant()) installed-package proof passed and cleanup completed."
Write-Host "Installed path (removed): $installedExe"
Write-Host "Version: $reportedVersion"
Write-Host "Installed bundle marker: $($installedIdentity.Marker)"
Write-Host "Renderer restart PIDs: $($rendererReceipts[0].pid), $($rendererReceipts[1].pid)"
Write-Host "Evidence: $summaryPath"
