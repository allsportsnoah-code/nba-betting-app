param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("grade", "mlb-slate", "nba-slate", "nba-hourly", "nba-impact-rankings", "soccer-slate", "slate", "all")]
  [string]$Task,

  [ValidateSet("today", "tomorrow")]
  [string]$Day = "today",

  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $ProjectRoot ".env.local"
$LogDir = Join-Path $ProjectRoot "logs"
$LogPath = Join-Path $LogDir "automation.log"
$PowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

function Write-AutomationLog {
  param([string]$Message)

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $Message"

  for ($attempt = 1; $attempt -le 6; $attempt++) {
    try {
      if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -ErrorAction Stop | Out-Null
      }

      Add-Content -Path $LogPath -Value $line -ErrorAction Stop
      return
    } catch {
      if ($attempt -eq 6) {
        Write-Warning "Could not write automation log after retries: $($_.Exception.Message)"
        return
      }

      Start-Sleep -Milliseconds (150 * $attempt)
    }
  }
}

function Import-LocalEnv {
  if (-not (Test-Path $EnvPath)) {
    throw ".env.local was not found at $EnvPath"
  }

  Get-Content $EnvPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $equalsIndex = $line.IndexOf("=")
    if ($equalsIndex -lt 1) {
      return
    }

    $name = $line.Substring(0, $equalsIndex).Trim()
    $value = $line.Substring($equalsIndex + 1).Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Test-AppIsRunning {
  try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 5
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Start-LocalAppIfNeeded {
  if (Test-AppIsRunning) {
    Write-AutomationLog "App already running at $BaseUrl."
    return
  }

  Write-AutomationLog "App was not running. Starting local Next dev server on port 3000."
  Start-Process $PowerShellPath -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "cd '$ProjectRoot'; npm run dev -- -p 3000"
  ) | Out-Null

  for ($i = 1; $i -le 24; $i++) {
    Start-Sleep -Seconds 5
    if (Test-AppIsRunning) {
      Write-AutomationLog "App started successfully at $BaseUrl."
      return
    }
  }

  throw "Timed out waiting for the local app to start at $BaseUrl"
}

try {
  Import-LocalEnv

  if (-not $env:AUTO_SYNC_SECRET) {
    throw "AUTO_SYNC_SECRET is missing from .env.local"
  }

  Start-LocalAppIfNeeded

  $encodedTask = [uri]::EscapeDataString($Task)
  $encodedDay = [uri]::EscapeDataString($Day)
  $url = "$BaseUrl/api/auto-sync?task=$encodedTask&day=$encodedDay"
  $headers = @{ "x-auto-sync-secret" = $env:AUTO_SYNC_SECRET }

  Write-AutomationLog "Running auto-sync task '$Task' for '$Day'."
  $result = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -TimeoutSec 900
  $resultJson = $result | ConvertTo-Json -Depth 10 -Compress
  Write-AutomationLog "Task '$Task' finished: $resultJson"
} catch {
  Write-AutomationLog "Task '$Task' failed: $($_.Exception.Message)"
  throw
}
