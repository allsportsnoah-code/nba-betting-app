$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $PSScriptRoot "run-auto-sync.ps1"
$PowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)

function Register-BettingLabTask {
  param(
    [string]$TaskName,
    [string]$Description,
    [string]$Task,
    [string]$Time
  )

  $Action = New-ScheduledTaskAction `
    -Execute $PowerShellPath `
    -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$Runner`" -Task $Task -Day today" `
    -WorkingDirectory $ProjectRoot

  $Trigger = New-ScheduledTaskTrigger -Daily -At $Time

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Principal $Principal `
    -Settings $Settings `
    -Description $Description `
    -Force | Out-Null
}

function Register-BettingLabHourlyTask {
  param(
    [string]$TaskName,
    [string]$Task,
    [string]$StartTime24,
    [int]$DurationHours = 14
  )

  $TaskCommand = "`"$PowerShellPath`" -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$Runner`" -Task $Task -Day today"
  $Duration = "{0:D2}:00" -f $DurationHours
  & schtasks.exe /Create /TN $TaskName /TR $TaskCommand /SC DAILY /ST $StartTime24 /RI 60 /DU $Duration /F | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "schtasks failed while creating $TaskName (exit code $LASTEXITCODE)."
  }
}

function Register-BettingLabWeeklyTask {
  param(
    [string]$TaskName,
    [string]$Description,
    [string]$Task,
    [string]$DayOfWeek,
    [string]$Time
  )

  $Action = New-ScheduledTaskAction `
    -Execute $PowerShellPath `
    -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$Runner`" -Task $Task -Day today" `
    -WorkingDirectory $ProjectRoot

  $Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $Time

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Principal $Principal `
    -Settings $Settings `
    -Description $Description `
    -Force | Out-Null
}

if (-not (Test-Path $Runner)) {
  throw "Could not find runner script at $Runner"
}

$LegacySyncTaskName = "Betting Lab - Sync MLB Slate 6AM"
if (Get-ScheduledTask -TaskName $LegacySyncTaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $LegacySyncTaskName -Confirm:$false
}

$LegacyNbaSyncTaskName = "Betting Lab - Sync NBA Slate 6AM"
if (Get-ScheduledTask -TaskName $LegacyNbaSyncTaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $LegacyNbaSyncTaskName -Confirm:$false
}

Register-BettingLabTask `
  -TaskName "Betting Lab - Grade Picks 2AM" `
  -Description "Grades finished NBA/MLB picks every day at 2:00 AM local time." `
  -Task "grade" `
  -Time "2:00AM"

Register-BettingLabTask `
  -TaskName "Betting Lab - Sync NBA Slate 5AM" `
  -Description "Syncs NBA team odds, featured picks, injuries, and prop lanes every day at 5:10 AM local time." `
  -Task "nba-slate" `
  -Time "5:10AM"

Register-BettingLabTask `
  -TaskName "Betting Lab - Sync MLB Slate 5AM" `
  -Description "Syncs MLB odds, team picks, and player props every day at 5:00 AM local time." `
  -Task "mlb-slate" `
  -Time "5:00AM"

Register-BettingLabTask `
  -TaskName "Betting Lab - Sync Soccer Slate 5AM" `
  -Description "Checks today's World Cup and MLS slates, then syncs odds and props only when games are scheduled." `
  -Task "soccer-slate" `
  -Time "5:20AM"

Register-BettingLabHourlyTask `
  -TaskName "Betting Lab - Recheck NBA Injuries Hourly" `
  -Task "nba-hourly" `
  -StartTime24 "10:00" `
  -DurationHours 14

Register-BettingLabWeeklyTask `
  -TaskName "Betting Lab - Refresh NBA Impact Rankings Weekly" `
  -Description "Refreshes NBA team impact rankings from current rosters and stats every Sunday at 4:00 AM local time." `
  -Task "nba-impact-rankings" `
  -DayOfWeek "Sunday" `
  -Time "4:00AM"

Write-Host "Installed local automation tasks for Betting Lab."
Write-Host "Project: $ProjectRoot"
Write-Host "Tasks:"
Write-Host " - Betting Lab - Grade Picks 2AM"
Write-Host " - Betting Lab - Sync NBA Slate 5AM"
Write-Host " - Betting Lab - Sync MLB Slate 5AM"
Write-Host " - Betting Lab - Sync Soccer Slate 5AM"
Write-Host " - Betting Lab - Recheck NBA Injuries Hourly"
Write-Host " - Betting Lab - Refresh NBA Impact Rankings Weekly"
