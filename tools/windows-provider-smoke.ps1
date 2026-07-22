param(
  [switch]$Install,
  [switch]$Login,
  [switch]$Strict,
  [switch]$RestartApplication,
  [switch]$RequireAuthenticode,
  [switch]$RequireSmartAppControlEvidence,
  [switch]$ProbeBrowserHandoff,
  [switch]$RequireBrowserProcessEvidence,
  [switch]$RequireVisibleBrowserWindowEvidence,
  [switch]$RequireRendererReadyEvidence,
  [switch]$SelfTest,
  [int]$InstallTimeoutSec = 1800,
  [int]$BrowserProbeTimeoutSec = 20,
  [string]$AtelierExe = "",
  [string]$ExpectedVersion = "",
  [string]$ReleaseTag = "",
  [string]$SourceSha = "",
  [string]$RunId = "",
  [string]$LogDir = "$env:LOCALAPPDATA\Atelier\diagnostics"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function New-DirectoryIfMissing {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Refresh-Path {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $extra = @(
    "$env:APPDATA\npm",
    "$env:USERPROFILE\.local\bin",
    "$env:USERPROFILE\.claude\local",
    "$env:USERPROFILE\.claude\local\bin",
    "$env:LOCALAPPDATA\Programs\nodejs",
    "$env:LOCALAPPDATA\hermes\hermes-agent",
    "$env:LOCALAPPDATA\hermes\hermes-agent\venv\Scripts",
    "$env:LOCALAPPDATA\hermes\node",
    "$env:ProgramFiles\nodejs",
    "$env:ProgramFiles\Git\bin",
    "$env:ProgramFiles\Git\cmd",
    "${env:ProgramFiles(x86)}\nodejs",
    "${env:ProgramFiles(x86)}\Git\bin",
    "${env:ProgramFiles(x86)}\Git\cmd"
  ) | Where-Object { $_ -and $_.Trim() -ne "" }
  $env:Path = (($extra + $userPath + $machinePath) -join ";")
}

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "==== $Title ===="
}

function Redact-Line {
  param([string]$Text)
  if ($null -eq $Text) { return "" }
  $redacted = $Text -replace '(?i)(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret)["'':=\s]+[^,"''\s]+', '$1=<redacted>'
  $redacted = $redacted -replace 'sk-[A-Za-z0-9_\-]{12,}', 'sk-<redacted>'
  return $redacted
}

function ConvertTo-NativeArgument {
  param([AllowEmptyString()][string]$Value)
  if ($Value -eq "") { return '""' }
  if ($Value -notmatch '[\s"]') { return $Value }

  $builder = [System.Text.StringBuilder]::new()
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

function Set-ProcessEnvironmentValue {
  param(
    [System.Diagnostics.ProcessStartInfo]$ProcessStartInfo,
    [string]$Name,
    [string]$Value
  )

  # PowerShell 5.1 enumerates EnvironmentVariables when it is returned from an
  # expression, turning the dictionary into an array. Write to the native store
  # directly so string keys are never interpreted as array indexes.
  if ($ProcessStartInfo.PSObject.Properties.Name -contains "Environment") {
    $ProcessStartInfo.Environment[$Name] = $Value
  } else {
    $ProcessStartInfo.EnvironmentVariables[$Name] = $Value
  }
}

function Test-ProcessEnvironmentValue {
  param(
    [System.Diagnostics.ProcessStartInfo]$ProcessStartInfo,
    [string]$Name
  )

  if ($ProcessStartInfo.PSObject.Properties.Name -contains "Environment") {
    return $ProcessStartInfo.Environment.ContainsKey($Name)
  }
  return $ProcessStartInfo.EnvironmentVariables.ContainsKey($Name)
}

function Resolve-CapturedTextTask {
  param(
    [object]$Task,
    [int]$WaitMilliseconds = 2000
  )

  if ($null -eq $Task) { return "" }
  try {
    if (-not $Task.IsCompleted) {
      [void]$Task.Wait($WaitMilliseconds)
    }
  } catch {
    # A cancelled or faulted read is diagnostic-only. The process result still
    # carries the authoritative timeout/exit state.
  }
  if (-not $Task.IsCompleted) { return "" }
  try {
    return [string]$Task.GetAwaiter().GetResult()
  } catch {
    return ""
  }
}

function Stop-CapturedProcessTree {
  param([System.Diagnostics.Process]$Process)

  if ($null -eq $Process) { return }
  try {
    if ($Process.HasExited) { return }
  } catch {
    return
  }

  # Windows PowerShell 5.1 runs on .NET Framework, where Process.Kill(true)
  # does not exist. taskkill /T closes descendants as well, preventing a child
  # installer from retaining the redirected stdout/stderr pipe forever.
  $taskkill = if ($env:SystemRoot) {
    Join-Path $env:SystemRoot "System32\taskkill.exe"
  } else {
    "taskkill.exe"
  }
  try {
    & $taskkill /PID $Process.Id /T /F 1>$null 2>$null
  } catch {
    # Fall through to a parent-only kill when taskkill is unavailable.
  }
  try {
    if (-not $Process.HasExited) { $Process.Kill() }
  } catch {}
  try { [void]$Process.WaitForExit(2000) } catch {}
}

function Invoke-Captured {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments = @(),
    [int]$TimeoutSec = 60
  )
  Write-Host "> $Name"
  Write-Host "  $FilePath $($Arguments -join ' ')"
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FilePath
  if ($psi.PSObject.Properties.Name -contains "ArgumentList") {
    foreach ($arg in $Arguments) { [void]$psi.ArgumentList.Add($arg) }
  } else {
    # Windows PowerShell 5.1 runs on .NET Framework and has no ArgumentList.
    # Quote each argument using the CommandLineToArgvW rules instead of
    # concatenating unescaped values through cmd.exe.
    $psi.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
  }
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  Set-ProcessEnvironmentValue -ProcessStartInfo $psi -Name "PATH" -Value $env:Path
  if (-not (Test-ProcessEnvironmentValue -ProcessStartInfo $psi -Name "CLAUDE_CODE_GIT_BASH_PATH")) {
    foreach ($candidate in @("$env:ProgramFiles\Git\bin\bash.exe", "${env:ProgramFiles(x86)}\Git\bin\bash.exe")) {
      if (Test-Path -LiteralPath $candidate) {
        Set-ProcessEnvironmentValue -ProcessStartInfo $psi -Name "CLAUDE_CODE_GIT_BASH_PATH" -Value $candidate
        break
      }
    }
  }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  try {
    [void]$process.Start()
  } catch {
    Write-Host "  spawn failed: $($_.Exception.Message)"
    return [pscustomobject]@{ ok = $false; exitCode = $null; timedOut = $false; stdout = ""; stderr = $_.Exception.Message }
  }

  # Drain both pipes while the process is running. Waiting first can deadlock
  # when an installer or provider writes more than the Windows pipe buffer.
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()

  if (-not $process.WaitForExit($TimeoutSec * 1000)) {
    Stop-CapturedProcessTree $process
    $stdout = Redact-Line (Resolve-CapturedTextTask $stdoutTask 2000)
    $stderr = Redact-Line (Resolve-CapturedTextTask $stderrTask 2000)
    Write-Host "  timed out after ${TimeoutSec}s"
    $process.Dispose()
    return [pscustomobject]@{ ok = $false; exitCode = $null; timedOut = $true; stdout = $stdout; stderr = $(if ($stderr.Trim()) { $stderr } else { "timeout" }) }
  }

  $stdout = Redact-Line (Resolve-CapturedTextTask $stdoutTask 2000)
  $stderr = Redact-Line (Resolve-CapturedTextTask $stderrTask 2000)
  $exitCode = $process.ExitCode
  if ($stdout.Trim()) { Write-Host ($stdout.Trim() -split "`r?`n" | Select-Object -First 20 | ForEach-Object { "  out: $_" }) }
  if ($stderr.Trim()) { Write-Host ($stderr.Trim() -split "`r?`n" | Select-Object -First 20 | ForEach-Object { "  err: $_" }) }
  Write-Host "  exit: $exitCode"
  $process.Dispose()
  return [pscustomobject]@{ ok = ($exitCode -eq 0); exitCode = $exitCode; timedOut = $false; stdout = $stdout; stderr = $stderr }
}

function Find-Exe {
  param([string]$Command)
  Refresh-Path
  $commands = @(Get-Command $Command -All -ErrorAction SilentlyContinue | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_.Source)
  })
  if ($commands.Count -gt 0) {
    # npm packages often expose both .cmd and .ps1 shims. Hermes also keeps an
    # extensionless POSIX launcher before venv\Scripts\hermes.exe on PATH.
    # Prefer native executables and Windows launchers so a valid installation
    # is not misreported as Win32 error 193.
    $ranked = $commands | Sort-Object @{ Expression = {
      switch ([IO.Path]::GetExtension($_.Source).ToLowerInvariant()) {
        ".exe" { 0 }
        ".com" { 1 }
        ".cmd" { 2 }
        ".bat" { 3 }
        ".ps1" { 4 }
        default { 5 }
      }
    } }, @{ Expression = { $_.Source.Length } }
    return $ranked[0].Source
  }
  return $null
}

function Invoke-ProviderCaptured {
  param(
    [string]$Name,
    [string]$Command,
    [string[]]$Arguments = @(),
    [int]$TimeoutSec = 60
  )
  $path = Find-Exe $Command
  if (-not $path) {
    return [pscustomobject]@{ ok = $false; exitCode = $null; timedOut = $false; stdout = ""; stderr = "$Command not found" }
  }
  $extension = [IO.Path]::GetExtension($path).ToLowerInvariant()
  if ($extension -in @(".cmd", ".bat")) {
    return Invoke-Captured $Name "cmd.exe" (@("/D", "/Q", "/S", "/C", $path) + $Arguments) $TimeoutSec
  }
  if ($extension -eq ".ps1") {
    return Invoke-Captured $Name "powershell.exe" (@("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $path) + $Arguments) $TimeoutSec
  }
  if ([string]::IsNullOrWhiteSpace($extension)) {
    $firstLine = ""
    try { $firstLine = [string](Get-Content -LiteralPath $path -TotalCount 1 -ErrorAction Stop) } catch {}
    if ($firstLine -match '^#!.*\b(bash|sh)(\.exe)?\b') {
      $bash = Find-Exe "bash"
      if (-not $bash) {
        return [pscustomobject]@{ ok = $false; exitCode = $null; timedOut = $false; stdout = ""; stderr = "$Command requires bash but bash was not found" }
      }
      return Invoke-Captured $Name $bash (@($path) + $Arguments) $TimeoutSec
    }
  }
  return Invoke-Captured $Name $path $Arguments $TimeoutSec
}

function Invoke-ProviderInteractive {
  param(
    [string]$Name,
    [string]$Command,
    [string[]]$Arguments = @()
  )
  $path = Find-Exe $Command
  if (-not $path) {
    Write-Host "$Command missing; $Name cannot run."
    return $false
  }

  Write-Host "> $Name"
  Write-Host "  $path $($Arguments -join ' ')"
  $previousBrowser = $env:BROWSER
  $previousAtelierBrowser = $env:ATELIER_OAUTH_BROWSER
  try {
    # Match the packaged app: leave browser launch ownership with the provider
    # CLI and observe the URL as a native Atelier fallback. A BROWSER override
    # can recursively launch the app or be rejected by Smart App Control.
    Remove-Item Env:BROWSER -ErrorAction SilentlyContinue
    $env:ATELIER_OAUTH_BROWSER = "1"
    & $path @Arguments
    return ($LASTEXITCODE -eq 0)
  } finally {
    $env:BROWSER = $previousBrowser
    $env:ATELIER_OAUTH_BROWSER = $previousAtelierBrowser
  }
}

function Open-SystemBrowserProbe {
  param([string]$Url)
  try {
    $process = Start-Process -FilePath $Url -PassThru -ErrorAction Stop
    Write-Host "Default-browser handoff accepted for $Url"
    return $true
  } catch {
    Write-Host "Default-browser handoff failed for ${Url}: $($_.Exception.Message)"
    return $false
  }
}

$script:BrowserProcessNames = @(
  "brave",
  "chrome",
  "firefox",
  "iexplore",
  "msedge",
  "opera"
)

function Test-IsBrowserProcessName {
  param([string]$Name)
  if ([string]::IsNullOrWhiteSpace($Name)) { return $false }
  return $script:BrowserProcessNames -contains $Name.ToLowerInvariant()
}

function Get-BrowserProcessRecords {
  $records = @()
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    Test-IsBrowserProcessName $_.ProcessName
  } | ForEach-Object {
    try {
      $records += [pscustomobject][ordered]@{
        name = $_.ProcessName
        id = [int]$_.Id
        startedAt = $_.StartTime.ToUniversalTime().ToString("o")
        visibleWindow = ([long]$_.MainWindowHandle -ne 0)
      }
    } catch {}
  }
  return @($records)
}

function Wait-BrowserProcessEvidence {
  param(
    [int[]]$InitialProcessIds = @(),
    [datetime]$ProbeStartedAt,
    [int]$TimeoutSec = 20
  )
  $initial = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($id in $InitialProcessIds) { [void]$initial.Add([int]$id) }
  $deadline = [DateTime]::UtcNow.AddSeconds([Math]::Max(1, $TimeoutSec))
  $observed = @()
  do {
    $current = @(Get-BrowserProcessRecords)
    $observed = @($current | Where-Object {
      $started = [datetime]::Parse($_.startedAt).ToUniversalTime()
      -not $initial.Contains([int]$_.id) -or $started -ge $ProbeStartedAt.AddSeconds(-2)
    })
    if ($observed.Count -gt 0) { break }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)

  return [pscustomobject][ordered]@{
    observed = ($observed.Count -gt 0)
    visibleWindow = (@($observed | Where-Object { $_.visibleWindow }).Count -gt 0)
    timeoutSec = $TimeoutSec
    processes = @($observed)
  }
}

function Find-AtelierExecutable {
  if ($AtelierExe -and (Test-Path -LiteralPath $AtelierExe)) {
    return (Resolve-Path -LiteralPath $AtelierExe).Path
  }
  $candidates = [System.Collections.Generic.List[string]]::new()
  @(
    (Join-Path $PSScriptRoot "..\src-tauri\target\debug\atelier.exe"),
    (Join-Path $PSScriptRoot "..\src-tauri\target\release\atelier.exe"),
    "$env:LOCALAPPDATA\Atelier\Atelier.exe",
    "$env:LOCALAPPDATA\Programs\Atelier\Atelier.exe",
    "$env:LOCALAPPDATA\Programs\Atelier Agent\Atelier.exe",
    "$env:ProgramFiles\Atelier\Atelier.exe",
    "$env:ProgramFiles\Atelier Agent\Atelier.exe"
  ) | ForEach-Object { if ($_) { $candidates.Add($_) } }

  Get-Process -Name "atelier" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      if ($_.Path) { $candidates.Add($_.Path) }
    } catch {}
  }

  if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
    Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object {
      ($_.Name -match "Atelier" -or $_.PackageFullName -match "Atelier") -and $_.InstallLocation
    } | ForEach-Object {
      foreach ($name in @("Atelier.exe", "atelier.exe")) {
        $candidates.Add((Join-Path $_.InstallLocation $name))
      }
    }
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  return $null
}

# Microsoft Smart App Control contract: 0=Off, 1=On/enforced, 2=Evaluation.
# This gate only reads the policy; it never changes the user's Windows state.
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
    rawValue = $null
    source = $null
    note = $null
  }

  try {
    if (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue) {
      $status = Get-MpComputerStatus -ErrorAction Stop
      if ($status.PSObject.Properties.Name -contains "SmartAppControlState") {
        $value = [string]$status.SmartAppControlState
        if (-not [string]::IsNullOrWhiteSpace($value)) {
          $result.available = $true
          $result.state = $value
          $result.rawValue = $value
          $result.source = "Get-MpComputerStatus"
          return [pscustomobject]$result
        }
      }
    }
  } catch {
    $result.note = $_.Exception.Message
  }

  $policyPath = "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy"
  try {
    if (Test-Path -LiteralPath $policyPath) {
      $policy = Get-ItemProperty -LiteralPath $policyPath -ErrorAction Stop
      if ($policy.PSObject.Properties.Name -contains "VerifiedAndReputablePolicyState") {
        $raw = [int]$policy.VerifiedAndReputablePolicyState
        $state = Convert-SmartAppControlRegistryValue $raw
        $result.available = $true
        $result.state = $state
        $result.rawValue = $raw
        $result.source = "$policyPath\VerifiedAndReputablePolicyState"
        return [pscustomobject]$result
      }
    }
  } catch {
    $result.note = $_.Exception.Message
  }

  if (-not $result.note) {
    $result.note = "Smart App Control state is not exposed by this Windows installation."
  }
  return [pscustomobject]$result
}

function Test-AtelierInstalledRuntime {
  param([string]$ExePath)

  if (-not $ExePath -or -not (Test-Path -LiteralPath $ExePath)) {
    return [pscustomobject][ordered]@{
      found = $false
      path = $ExePath
      sha256 = $null
      version = $null
      versionOk = $false
      signatureStatus = $null
      signatureOk = $false
      restartOk = $false
      restartProcessIds = @()
      rendererReadyOk = $false
      rendererReadyReceipt = $null
    }
  }

  $versionProbe = Invoke-Captured "Atelier installed version probe" $ExePath @("--atelier-version-probe") 30
  $versionLine = $versionProbe.stdout -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 1
  $version = if ($versionLine) { $versionLine.Trim() } else { "" }
  $versionOk = $versionProbe.ok -and -not [string]::IsNullOrWhiteSpace($version)
  if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $versionOk = $versionOk -and ($version -eq $ExpectedVersion.TrimStart("v"))
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $ExePath
  $installedSha256 = (Get-FileHash -LiteralPath $ExePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $signatureStatus = [string]$signature.Status
  $signatureOk = $signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid

  $restartOk = $false
  $restartProcessIds = @()
  $rendererReadyOk = $false
  $rendererReadyReceipt = $null
  if ($RestartApplication) {
    $normalizedExe = [IO.Path]::GetFullPath($ExePath).ToLowerInvariant()
    $findExactProcesses = {
      @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try {
          $_.Path -and [IO.Path]::GetFullPath($_.Path).ToLowerInvariant() -eq $normalizedExe
        } catch {
          $false
        }
      })
    }
    @(& $findExactProcesses) | ForEach-Object {
      try {
        [void]$_.CloseMainWindow()
      } catch {
        Write-Host "Could not request a graceful Atelier close for PID $($_.Id): $($_.Exception.Message)"
      }
    }
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
      if (@(& $findExactProcesses).Count -eq 0) { break }
      Start-Sleep -Seconds 1
    }
    @(& $findExactProcesses) | ForEach-Object {
      Write-Host "Atelier PID $($_.Id) did not close in 15s; stopping the exact test process."
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
    try {
      $started = Start-Process -FilePath $ExePath -PassThru -ErrorAction Stop
      for ($attempt = 0; $attempt -lt 15; $attempt++) {
        $runningAfterRestart = @(& $findExactProcesses)
        if ($runningAfterRestart.Count -gt 0) {
          $restartProcessIds = @($runningAfterRestart | ForEach-Object { $_.Id })
          $restartOk = $true
          break
        }
        Start-Sleep -Seconds 1
      }
      if (-not $restartOk) {
        $exitDescription = if ($started.HasExited) { "exit code $($started.ExitCode)" } else { "no exact-path process appeared" }
        Write-Host "Atelier failed the restart probe: $exitDescription."
      } else {
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
          $rendererProbe = Invoke-Captured "Atelier renderer readiness probe" $ExePath @("--atelier-renderer-ready-probe") 30
          if ($rendererProbe.ok) {
            try {
              $rendererReadyReceipt = $rendererProbe.stdout | ConvertFrom-Json
              $rendererReadyOk = $rendererReadyReceipt.pid -in $restartProcessIds -and $rendererReadyReceipt.windowLabel -eq "main"
            } catch {
              Write-Host "Atelier renderer receipt was not valid JSON: $($_.Exception.Message)"
            }
          }
          if ($rendererReadyOk) { break }
          Start-Sleep -Milliseconds 500
        }
      }
    } catch {
      Write-Host "Atelier restart probe failed: $($_.Exception.Message)"
    }
  }

  return [pscustomobject][ordered]@{
    found = $true
    path = $ExePath
    sha256 = $installedSha256
    version = $version
    versionOk = [bool]$versionOk
    signatureStatus = $signatureStatus
    signatureOk = [bool]$signatureOk
    restartOk = [bool]$restartOk
    restartProcessIds = @($restartProcessIds)
    rendererReadyOk = [bool]$rendererReadyOk
    rendererReadyReceipt = $rendererReadyReceipt
  }
}

function Provider-Status {
  param([string]$Provider, [string]$Command)
  $path = Find-Exe $Command
  $exists = -not [string]::IsNullOrWhiteSpace($path)
  Write-Host "$Provider command: $(if ($exists) { $path } else { 'missing' })"
  return [pscustomobject][ordered]@{ provider = $Provider; command = $Command; exists = $exists; path = $path; versionOk = $false; authOk = $false; authNote = "" }
}

function Install-Codex {
  if (-not (Find-Exe "npm")) {
    Write-Host "npm missing; Codex install cannot run."
    return $false
  }
  $r = Invoke-Captured "Install Codex CLI" "cmd.exe" @("/C", "npm", "install", "-g", "@openai/codex@0.145.0") $InstallTimeoutSec
  Refresh-Path
  return $r.ok
}

function Install-Claude {
  if (-not (Find-Exe "npm")) {
    Write-Host "npm missing; Claude Code install cannot run."
    return $false
  }
  $r = Invoke-Captured "Install Claude Code" "cmd.exe" @("/C", "npm", "install", "-g", "@anthropic-ai/claude-code@2.1.217") $InstallTimeoutSec
  Refresh-Path
  return $r.ok
}

function Install-Hermes {
  $spec = "git+https://github.com/NousResearch/hermes-agent.git@3ef6bbd201263d354fd83ec55b3c306ded2eb72a"
  if (Find-Exe "uv") {
    $r = Invoke-Captured "Install Hermes Agent" "uv" @("tool", "install", "--force", "--python", "3.11", $spec) $InstallTimeoutSec
  } elseif (Find-Exe "pipx") {
    $r = Invoke-Captured "Install Hermes Agent" "pipx" @("install", "--force", $spec) $InstallTimeoutSec
  } elseif (Find-Exe "py") {
    $r = Invoke-Captured "Install Hermes Agent" "py" @("-3.11", "-m", "pip", "install", "--user", "--upgrade", $spec) $InstallTimeoutSec
  } elseif (Find-Exe "python") {
    $r = Invoke-Captured "Install Hermes Agent" "python" @("-m", "pip", "install", "--user", "--upgrade", $spec) $InstallTimeoutSec
  } else {
    Write-Host "uv, pipx, or Python 3.11-3.13 is required for Hermes installation."
    return $false
  }
  Refresh-Path
  return $r.ok
}

if ($SelfTest) {
  $expectedStates = @{
    0 = "Off"
    1 = "On"
    2 = "Evaluation"
    9 = "Unknown(9)"
  }
  foreach ($entry in $expectedStates.GetEnumerator()) {
    $actual = Convert-SmartAppControlRegistryValue ([int]$entry.Key)
    if ($actual -ne $entry.Value) {
      throw "Smart App Control mapping failed for $($entry.Key): expected $($entry.Value), found $actual"
    }
  }
  $secret = "api_key=sk-example-secret-value-123456"
  if ((Redact-Line $secret) -match "example-secret") {
    throw "Diagnostic redaction self-test exposed a synthetic secret"
  }
  $quoted = ConvertTo-NativeArgument 'C:\Program Files\Atelier\Atelier.exe'
  if ($quoted -ne '"C:\Program Files\Atelier\Atelier.exe"') {
    throw "Windows native argument quoting self-test failed: $quoted"
  }
  if (-not (Test-IsBrowserProcessName "msedge") -or (Test-IsBrowserProcessName "explorer")) {
    throw "Windows browser process classification self-test failed"
  }
  $environmentProbe = [System.Diagnostics.ProcessStartInfo]::new()
  Set-ProcessEnvironmentValue -ProcessStartInfo $environmentProbe -Name "ATELIER_SMOKE_SENTINEL" -Value "ready"
  if (-not (Test-ProcessEnvironmentValue -ProcessStartInfo $environmentProbe -Name "ATELIER_SMOKE_SENTINEL")) {
    throw "Windows process environment self-test failed"
  }
  $hostExe = try { (Get-Process -Id $PID).Path } catch { "powershell.exe" }
  $timeoutStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $timeoutProbe = Invoke-Captured "Process-tree timeout self-test" $hostExe @(
    "-NoProfile",
    "-Command",
    "Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile','-Command','Start-Sleep -Seconds 30' -NoNewWindow | Out-Null; Start-Sleep -Seconds 30"
  ) 1
  $timeoutStopwatch.Stop()
  if (-not $timeoutProbe.timedOut -or $timeoutStopwatch.Elapsed.TotalSeconds -gt 8) {
    throw "Windows process-tree timeout self-test did not return within the bounded interval"
  }
  Write-Host "Windows provider smoke self-test passed."
  exit 0
}

New-DirectoryIfMissing $LogDir
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $LogDir "atelier-provider-smoke-$stamp.log"
$jsonPath = Join-Path $LogDir "atelier-provider-smoke-$stamp.json"
Start-Transcript -Path $logPath -Force | Out-Null

try {
  Refresh-Path
  Write-Section "Environment"
  Write-Host "OS: $([Environment]::OSVersion.VersionString)"
  Write-Host "PowerShell: $($PSVersionTable.PSVersion)"
  Write-Host "User: $env:USERNAME"
  Write-Host "Log: $logPath"

  Write-Section "Prerequisites"
  foreach ($cmd in @("node", "npm", "git", "bash", "powershell.exe")) {
    $where = Find-Exe $cmd
    Write-Host "${cmd}: $(if ($where) { $where } else { 'missing' })"
  }

  $summary = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToString("o")
    releaseTag = $ReleaseTag
    sourceSha = $SourceSha.ToLowerInvariant()
    expectedVersion = $ExpectedVersion.TrimStart("v")
    githubRunId = $RunId
    installRequested = [bool]$Install
    loginRequested = [bool]$Login
    providers = @()
    hermesAuth = $null
    browserProbe = $null
    browserHelperProbe = $null
    browserProcessEvidence = $null
    atelierBrowserProbeExe = $null
    installedApp = $null
    smartAppControl = $null
    loginResults = $null
    logPath = $logPath
  }

  Write-Section "Initial provider status"
  $providers = @(
    @{ name = "Claude"; command = "claude"; installer = "claude" },
    @{ name = "Codex"; command = "codex"; installer = "codex" },
    @{ name = "Hermes"; command = "hermes"; installer = "hermes" }
  )

  foreach ($p in $providers) {
    $status = Provider-Status $p.name $p.command
    if ($Install -and -not $status.exists) {
      Write-Section "Install $($p.name)"
      switch ($p.installer) {
        "claude" { Install-Claude | Out-Host }
        "codex" { Install-Codex | Out-Host }
        "hermes" { Install-Hermes | Out-Host }
      }
      $status = Provider-Status $p.name $p.command
    }

    if ($status.exists) {
      if ($p.command -eq "codex") {
        $version = Invoke-ProviderCaptured "Codex version" "codex" @("--version") 60
        $auth = Invoke-ProviderCaptured "Codex login status" "codex" @("login", "status") 60
        $status.versionOk = $version.ok
        $status.authOk = $auth.ok
        $status.authNote = if ($auth.ok) { "logged-in-or-status-ok" } else { "not logged in or status failed" }
      } elseif ($p.command -eq "claude") {
        $version = Invoke-ProviderCaptured "Claude version" "claude" @("--version") 60
        $auth = Invoke-ProviderCaptured "Claude auth status" "claude" @("auth", "status") 60
        $status.versionOk = $version.ok
        $status.authOk = $auth.ok
        $status.authNote = if ($auth.ok) { "logged-in-or-status-ok" } else { "not logged in or auth status failed" }
      } elseif ($p.command -eq "hermes") {
        $version = Invoke-ProviderCaptured "Hermes version" "hermes" @("--version") 90
        $status.versionOk = $version.ok
        $hAuth = Invoke-ProviderCaptured "Hermes Codex auth status" "hermes" @("auth", "status", "openai-codex") 60
        $summary.hermesAuth = [pscustomobject]@{
          provider = "openai-codex"
          providerOwnedStatus = $true
          ok = [bool]$hAuth.ok
          exitCode = $hAuth.exitCode
        }
        $status.authOk = [bool]$hAuth.ok
        $status.authNote = if ($hAuth.ok) { "provider-owned auth status ok" } else { "provider-owned auth status requires attention" }
      }
    }
    $summary.providers += [pscustomobject]$status
  }

  Write-Section "Installed Atelier runtime"
  $atelierExecutable = Find-AtelierExecutable
  $summary.installedApp = Test-AtelierInstalledRuntime $atelierExecutable
  if ($summary.installedApp.found) {
    Write-Host "Atelier executable: $($summary.installedApp.path)"
    Write-Host "Atelier version: $($summary.installedApp.version)"
    Write-Host "Authenticode: $($summary.installedApp.signatureStatus)"
    if ($RestartApplication) {
      Write-Host "Restart probe: $(if ($summary.installedApp.restartOk) { 'OK' } else { 'FAILED' })"
    }
  } else {
    Write-Host "Atelier executable: missing"
  }
  $summary.smartAppControl = Get-SmartAppControlEvidence
  Write-Host "Smart App Control: $(if ($summary.smartAppControl.available) { $summary.smartAppControl.state } else { 'unavailable' })"
  if ($summary.smartAppControl.source) {
    Write-Host "Smart App Control source: $($summary.smartAppControl.source)"
  }

  if ($Login -or $ProbeBrowserHandoff) {
    Write-Section $(if ($Login) { "Interactive subscription login" } else { "Browser handoff probe" })
    Write-Host "Testing the Windows default-browser handoff used by Atelier."
    $atelierBrowserProbeExe = $atelierExecutable
    $summary.atelierBrowserProbeExe = $atelierBrowserProbeExe
    $browserBaseline = @(Get-BrowserProcessRecords)
    $browserProbeStartedAt = [DateTime]::UtcNow
    if ($atelierBrowserProbeExe) {
      $probe = Invoke-Captured "Atelier native browser probe" $atelierBrowserProbeExe @("--atelier-oauth-browser-probe", "codex") 30
      $summary.browserProbe = [bool]$probe.ok
      $helperProbe = Invoke-Captured "Atelier signed browser helper probe" $atelierBrowserProbeExe @("--atelier-oauth-open-url", "https://auth.openai.com/codex/device") 30
      $summary.browserHelperProbe = [bool]$helperProbe.ok
    } else {
      Write-Host "Atelier executable not found; falling back to a PowerShell ShellExecute probe."
      $summary.browserProbe = Open-SystemBrowserProbe "https://auth.openai.com/codex/device"
      $summary.browserHelperProbe = $false
    }
    $summary.browserProcessEvidence = Wait-BrowserProcessEvidence `
      -InitialProcessIds @($browserBaseline | ForEach-Object { $_.id }) `
      -ProbeStartedAt $browserProbeStartedAt `
      -TimeoutSec $BrowserProbeTimeoutSec
    Write-Host "Browser process observed: $($summary.browserProcessEvidence.observed)"
    Write-Host "Visible browser window observed: $($summary.browserProcessEvidence.visibleWindow)"
  }

  if ($Login) {
    Write-Host "Running the same official login flows used by Atelier."
    # setup-token can print an inference token. Pause the transcript so no
    # authentication code or token is persisted in the diagnostic log.
    Stop-Transcript | Out-Null
    $codexLoginStarted = $false
    $claudeLoginStarted = $false
    try {
      if (Find-Exe "codex") {
        $codexLoginStarted = Invoke-ProviderInteractive "Start Codex device login" "codex" @("login", "--device-auth")
      }
      if (Find-Exe "claude") {
        $claudeLoginStarted = Invoke-ProviderInteractive "Start Claude setup-token login" "claude" @("setup-token")
      }
    } finally {
      Start-Transcript -Path $logPath -Append | Out-Null
    }
    Write-Host "Re-checking auth status after interactive login..."
    $codexAuthAfterLogin = Invoke-ProviderCaptured "Codex login status after login" "codex" @("login", "status") 60
    $claudeAuthAfterLogin = Invoke-ProviderCaptured "Claude auth status after login" "claude" @("auth", "status") 60
    $summary.loginResults = [pscustomobject][ordered]@{
      codexFlowExitOk = [bool]$codexLoginStarted
      codexAuthOk = [bool]$codexAuthAfterLogin.ok
      claudeFlowExitOk = [bool]$claudeLoginStarted
      claudeAuthOk = [bool]$claudeAuthAfterLogin.ok
    }
    foreach ($status in $summary.providers) {
      if ($status.command -eq "codex") {
        $status.authOk = [bool]$codexAuthAfterLogin.ok
        $status.authNote = if ($codexAuthAfterLogin.ok) { "authenticated after device login" } else { "device login did not produce an authenticated session" }
      } elseif ($status.command -eq "claude") {
        $status.authOk = [bool]$claudeAuthAfterLogin.ok
        $status.authNote = if ($claudeAuthAfterLogin.ok) { "authenticated after setup-token login" } else { "setup-token login did not produce an authenticated session" }
      }
    }
  }

  Write-Section "Summary"
  foreach ($p in $summary.providers) {
    $state = if ($p.exists -and $p.versionOk) { "CLI_OK" } else { "CLI_FAIL" }
    $auth = if ($p.authOk) { "AUTH_OK" } else { "AUTH_CHECK" }
    Write-Host "$($p.provider): $state / $auth / $($p.authNote)"
  }
  $summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
  Write-Host "JSON: $jsonPath"
  if ($RequireBrowserProcessEvidence -and -not ($Login -or $ProbeBrowserHandoff)) {
    throw "RequireBrowserProcessEvidence requires Login or ProbeBrowserHandoff"
  }
  if ($RequireVisibleBrowserWindowEvidence -and -not ($Login -or $ProbeBrowserHandoff)) {
    throw "RequireVisibleBrowserWindowEvidence requires Login or ProbeBrowserHandoff"
  }
  if ($RequireRendererReadyEvidence -and -not $RestartApplication) {
    throw "RequireRendererReadyEvidence requires RestartApplication"
  }
  if ($RequireBrowserProcessEvidence -and $summary.browserProcessEvidence.observed -ne $true) {
    throw "Windows provider smoke did not observe a browser process after the Atelier handoff"
  }
  if ($RequireVisibleBrowserWindowEvidence -and $summary.browserProcessEvidence.visibleWindow -ne $true) {
    throw "Windows provider smoke did not observe a visible browser window after the Atelier handoff"
  }
  if ($Strict) {
    $failed = @($summary.providers | Where-Object { -not $_.exists -or -not $_.versionOk })
    if ($failed.Count -gt 0) {
      $names = ($failed | ForEach-Object { $_.provider }) -join ", "
      throw "Windows provider smoke failed for: $names"
    }
    $requireInstalledApp = $Login -or $RestartApplication -or $RequireAuthenticode -or -not [string]::IsNullOrWhiteSpace($ExpectedVersion)
    if ($requireInstalledApp) {
      if (-not $summary.installedApp.found -or -not $summary.installedApp.versionOk) {
        throw "Windows provider smoke did not prove the installed Atelier version"
      }
      if ($RequireAuthenticode -and -not $summary.installedApp.signatureOk) {
        throw "Installed Atelier executable does not have a valid Authenticode signature"
      }
      if ($RestartApplication -and -not $summary.installedApp.restartOk) {
        throw "Installed Atelier executable did not survive the restart probe"
      }
      if ($RequireRendererReadyEvidence -and -not $summary.installedApp.rendererReadyOk) {
        throw "Installed Atelier renderer did not report a fresh ready receipt after restart"
      }
    }
    if ($RequireSmartAppControlEvidence -and -not $summary.smartAppControl.available) {
      throw "Smart App Control state evidence is unavailable on this Windows installation"
    }
    if ($Login -or $ProbeBrowserHandoff) {
      if (-not $summary.atelierBrowserProbeExe -or $summary.browserProbe -ne $true -or $summary.browserHelperProbe -ne $true) {
        throw "Windows provider smoke did not prove Atelier's native browser handoff and URL fallback"
      }
    }
    if ($Login) {
      $authFailed = @($summary.providers | Where-Object {
        $_.command -in @("codex", "claude") -and -not $_.authOk
      })
      if ($authFailed.Count -gt 0) {
        $names = ($authFailed | ForEach-Object { $_.provider }) -join ", "
        throw "Windows provider authentication failed after login for: $names"
      }
    }
  }
} finally {
  Stop-Transcript | Out-Null
}
