param(
  [switch]$Install,
  [switch]$Login,
  [int]$InstallTimeoutSec = 1800,
  [string]$LogDir = "$env:LOCALAPPDATA\Atelier\diagnostics"
)

$ErrorActionPreference = "Continue"
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
  foreach ($arg in $Arguments) { [void]$psi.ArgumentList.Add($arg) }
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $psi.Environment["PATH"] = $env:Path
  if (-not $psi.Environment.ContainsKey("CLAUDE_CODE_GIT_BASH_PATH")) {
    foreach ($candidate in @("$env:ProgramFiles\Git\bin\bash.exe", "${env:ProgramFiles(x86)}\Git\bin\bash.exe")) {
      if (Test-Path -LiteralPath $candidate) {
        $psi.Environment["CLAUDE_CODE_GIT_BASH_PATH"] = $candidate
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

  if (-not $process.WaitForExit($TimeoutSec * 1000)) {
    try { $process.Kill($true) } catch {}
    Write-Host "  timed out after ${TimeoutSec}s"
    return [pscustomobject]@{ ok = $false; exitCode = $null; timedOut = $true; stdout = ""; stderr = "timeout" }
  }

  $stdout = Redact-Line $process.StandardOutput.ReadToEnd()
  $stderr = Redact-Line $process.StandardError.ReadToEnd()
  if ($stdout.Trim()) { Write-Host ($stdout.Trim() -split "`r?`n" | Select-Object -First 20 | ForEach-Object { "  out: $_" }) }
  if ($stderr.Trim()) { Write-Host ($stderr.Trim() -split "`r?`n" | Select-Object -First 20 | ForEach-Object { "  err: $_" }) }
  Write-Host "  exit: $($process.ExitCode)"
  return [pscustomobject]@{ ok = ($process.ExitCode -eq 0); exitCode = $process.ExitCode; timedOut = $false; stdout = $stdout; stderr = $stderr }
}

function Find-Exe {
  param([string]$Command)
  Refresh-Path
  $cmd = Get-Command $Command -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
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
  $r = Invoke-Captured "Install Codex CLI" "cmd.exe" @("/C", "npm", "install", "-g", "@openai/codex") $InstallTimeoutSec
  Refresh-Path
  return $r.ok
}

function Install-Claude {
  $script = "& ([scriptblock]::Create((irm https://claude.ai/install.ps1))) stable"
  $r = Invoke-Captured "Install Claude Code" "powershell.exe" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $script) $InstallTimeoutSec
  Refresh-Path
  return $r.ok
}

function Install-Hermes {
  $script = "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1))) -SkipSetup -NonInteractive"
  $r = Invoke-Captured "Install Hermes Agent" "powershell.exe" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $script) $InstallTimeoutSec
  Refresh-Path
  return $r.ok
}

function Inspect-HermesAuth {
  $candidates = @(
    "$env:LOCALAPPDATA\hermes\auth.json",
    "$env:USERPROFILE\.hermes\auth.json"
  )
  foreach ($path in $candidates) {
    if (Test-Path -LiteralPath $path) {
      try {
        $json = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        $providers = @()
        if ($json.credentials) {
          $providers = $json.credentials.PSObject.Properties.Name
        }
        return [pscustomobject]@{
          found = $true
          path = $path
          activeProvider = $json.active_provider
          credentialProviders = $providers
        }
      } catch {
        return [pscustomobject]@{ found = $true; path = $path; activeProvider = ""; credentialProviders = @("parse-error") }
      }
    }
  }
  return [pscustomobject]@{ found = $false; path = ""; activeProvider = ""; credentialProviders = @() }
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
    generatedAt = (Get-Date).ToString("o")
    installRequested = [bool]$Install
    loginRequested = [bool]$Login
    providers = @()
    hermesAuth = $null
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
        $version = Invoke-Captured "Codex version" "cmd.exe" @("/C", "codex", "--version") 60
        $auth = Invoke-Captured "Codex login status" "cmd.exe" @("/C", "codex", "login", "status") 60
        $status.versionOk = $version.ok
        $status.authOk = $auth.ok
        $status.authNote = if ($auth.ok) { "logged-in-or-status-ok" } else { "not logged in or status failed" }
      } elseif ($p.command -eq "claude") {
        $version = Invoke-Captured "Claude version" "cmd.exe" @("/C", "claude", "--version") 60
        $auth = Invoke-Captured "Claude auth status" "cmd.exe" @("/C", "claude", "auth", "status") 60
        $status.versionOk = $version.ok
        $status.authOk = $auth.ok
        $status.authNote = if ($auth.ok) { "logged-in-or-status-ok" } else { "not logged in or auth status failed" }
      } elseif ($p.command -eq "hermes") {
        $version = Invoke-Captured "Hermes version" "cmd.exe" @("/C", "hermes", "--version") 90
        $status.versionOk = $version.ok
        $hAuth = Inspect-HermesAuth
        $summary.hermesAuth = $hAuth
        $status.authOk = [bool]$hAuth.found
        $status.authNote = if ($hAuth.found) { "auth file found: active=$($hAuth.activeProvider)" } else { "auth file not found" }
      }
    }
    $summary.providers += [pscustomobject]$status
  }

  if ($Login) {
    Write-Section "Interactive subscription login"
    Write-Host "Codex and Claude login may open a browser. Finish the browser sign-in, then return here."
    if (Find-Exe "codex") {
      Invoke-Captured "Start Codex login" "cmd.exe" @("/C", "codex", "login") 900 | Out-Null
    }
    if (Find-Exe "claude") {
      Invoke-Captured "Start Claude login" "cmd.exe" @("/C", "claude", "login") 900 | Out-Null
    }
    Write-Host "Re-checking auth status after interactive login..."
    Invoke-Captured "Codex login status after login" "cmd.exe" @("/C", "codex", "login", "status") 60 | Out-Null
    Invoke-Captured "Claude auth status after login" "cmd.exe" @("/C", "claude", "auth", "status") 60 | Out-Null
  }

  Write-Section "Summary"
  foreach ($p in $summary.providers) {
    $state = if ($p.exists -and $p.versionOk) { "CLI_OK" } else { "CLI_FAIL" }
    $auth = if ($p.authOk) { "AUTH_OK" } else { "AUTH_CHECK" }
    Write-Host "$($p.provider): $state / $auth / $($p.authNote)"
  }
  $summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
  Write-Host "JSON: $jsonPath"
} finally {
  Stop-Transcript | Out-Null
}
