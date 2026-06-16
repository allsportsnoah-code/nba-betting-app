param(
  [string]$BaseUrl = "http://localhost:3000",
  [switch]$InstallIfMissing,
  [switch]$EmailScheduler
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $ProjectRoot ".env.local"
$EmailSettingsPath = Join-Path $ProjectRoot "config\tunnel-link-email-settings.json"
$ToolsDir = Join-Path $ProjectRoot "tools"
$CloudflaredPath = Join-Path $ToolsDir "cloudflared.exe"
$LogDir = Join-Path $ProjectRoot "logs"
$TunnelOutLog = Join-Path $LogDir "cloudflare-tunnel.out.log"
$TunnelErrLog = Join-Path $LogDir "cloudflare-tunnel.err.log"
$TunnelPidPath = Join-Path $LogDir "cloudflare-tunnel.pid"
$TunnelUrlPath = Join-Path $LogDir "cloudflare-tunnel.url.txt"
$TunnelStartLog = Join-Path $LogDir "cloudflare-tunnel.start.log"
$TunnelEmailSchedulerPidPath = Join-Path $LogDir "tunnel-email-scheduler.pid"
$TunnelEmailSentStatePath = Join-Path $LogDir "tunnel-email-sent-state.txt"
$PowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$LocalEnv = @{}

function Write-Step {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] [cloudflare] $Message"
  Write-Host "[cloudflare] $Message"
  Add-Content -Path $TunnelStartLog -Value $line -ErrorAction SilentlyContinue
}

function Import-LocalEnv {
  $script:LocalEnv = @{}

  if (-not (Test-Path $EnvPath)) {
    return
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
    $script:LocalEnv[$name] = $value
  }
}

function Get-OptionalEnvValue {
  param([string]$Name)

  if ($script:LocalEnv.ContainsKey($Name)) {
    $value = $script:LocalEnv[$Name]
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }
  }

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $null
  }

  return $value.Trim()
}

function Clear-TunnelEmailProcessEnv {
  @(
    "TUNNEL_LINK_EMAIL_TO",
    "TUNNEL_LINK_EMAIL_FROM",
    "TUNNEL_LINK_SMTP_SERVER",
    "TUNNEL_LINK_SMTP_PORT",
    "TUNNEL_LINK_SMTP_USERNAME",
    "TUNNEL_LINK_SMTP_PASSWORD",
    "TUNNEL_LINK_SMTP_USE_SSL",
    "TUNNEL_LINK_EMAIL_SUBJECT",
    "TUNNEL_LINK_EMAIL_TIMES",
    "TUNNEL_LINK_EMAIL_DELIVERY_MODE"
  ) | ForEach-Object {
    [Environment]::SetEnvironmentVariable($_, $null, "Process")
  }
}

function Test-AppIsRunning {
  try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/mlb" -UseBasicParsing -TimeoutSec 5
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Start-LocalAppIfNeeded {
  if (Test-AppIsRunning) {
    Write-Step "App is already running at $BaseUrl."
    return
  }

  Write-Step "Starting local Next dev server on port 3000."
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
      Write-Step "App started successfully."
      return
    }
  }

  throw "Timed out waiting for the local app to start at $BaseUrl"
}

function Resolve-Cloudflared {
  $systemCloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($systemCloudflared) {
    return $systemCloudflared.Source
  }

  if (Test-Path $CloudflaredPath) {
    return $CloudflaredPath
  }

  if (-not $InstallIfMissing) {
    throw "cloudflared was not found. Re-run with -InstallIfMissing to download the local tunnel binary."
  }

  if (-not (Test-Path $ToolsDir)) {
    New-Item -ItemType Directory -Path $ToolsDir | Out-Null
  }

  $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  Write-Step "Downloading cloudflared to $CloudflaredPath."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $CloudflaredPath -UseBasicParsing
  return $CloudflaredPath
}

function Stop-ExistingTunnel {
  if (Test-Path $TunnelPidPath) {
    $existingPid = Get-Content $TunnelPidPath -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
      Write-Step "Stopping existing tunnel process $existingPid."
      Stop-Process -Id $existingPid -Force
    }
    Remove-Item $TunnelPidPath -Force -ErrorAction SilentlyContinue
  }

  try {
    $existing = Get-CimInstance Win32_Process |
      Where-Object {
        $_.Name -ieq "cloudflared.exe" -and
        $_.CommandLine -like "*tunnel*" -and
        $_.CommandLine -like "*$BaseUrl*"
      }

    foreach ($process in $existing) {
      Write-Step "Stopping existing tunnel process $($process.ProcessId)."
      Stop-Process -Id $process.ProcessId -Force
    }
  } catch {
    Write-Step "Could not inspect existing tunnel command lines, continuing with PID-based cleanup."
  }
}

function Read-TunnelUrl {
  $logs = ""
  if (Test-Path $TunnelOutLog) {
    $logs += (Get-Content $TunnelOutLog -Raw -ErrorAction SilentlyContinue)
  }
  if (Test-Path $TunnelErrLog) {
    $logs += "`n" + (Get-Content $TunnelErrLog -Raw -ErrorAction SilentlyContinue)
  }

  $matches = [regex]::Matches($logs, "https://[-a-z0-9]+\.trycloudflare\.com")
  if ($matches.Count -gt 0) {
    return $matches[$matches.Count - 1].Value
  }

  return $null
}

function Get-TunnelEmailSettings {
  $settings = [ordered]@{
    enabled = $true
    sendTimeLocal = "09:00"
    sendTimesLocal = @("09:00")
    waitUntilSendTime = $true
    deliveryMode = "together"
    recipientEmails = @()
    recipients = $null
    from = $null
    subject = $null
    bodyTemplate = $null
  }

  if (-not (Test-Path $EmailSettingsPath)) {
    return [pscustomobject]$settings
  }

  try {
    $raw = Get-Content -LiteralPath $EmailSettingsPath -Raw -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($raw)) {
      return [pscustomobject]$settings
    }

    $parsed = $raw | ConvertFrom-Json
    foreach ($key in @("enabled", "sendTimeLocal", "sendTimesLocal", "waitUntilSendTime", "deliveryMode", "recipientEmails", "recipients", "from", "subject", "bodyTemplate")) {
      if ($parsed.PSObject.Properties.Name -contains $key) {
        $settings[$key] = $parsed.$key
      }
    }
  } catch {
    Write-Step "Could not read tunnel email owner settings; using .env defaults."
  }

  return [pscustomobject]$settings
}

function Get-TunnelEmailSetting {
  param(
    $Settings,
    [string]$PropertyName,
    [string]$EnvName,
    [string]$Fallback
  )

  $value = $null
  if ($Settings -and ($Settings.PSObject.Properties.Name -contains $PropertyName)) {
    $value = $Settings.$PropertyName
  }

  if ($value -is [string]) {
    $value = $value.Trim()
  }

  if ($value) {
    return $value
  }

  if ($EnvName) {
    $envValue = Get-OptionalEnvValue $EnvName
    if ($envValue) {
      return $envValue
    }
  }

  return $Fallback
}

function Get-DefaultTunnelEmailBody {
  return @"
Betting Lab is up.

MLB board:
{{mlbLink}}

Owner controls:
{{ownerLink}}

Base link:
{{baseLink}}

Sent automatically at {{sentAt}}.
"@
}

function Resolve-TunnelEmailTemplate {
  param(
    [string]$Template,
    [string]$Url
  )

  $body = $Template
  if ([string]::IsNullOrWhiteSpace($body)) {
    $body = Get-DefaultTunnelEmailBody
  }

  $sentAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $replacements = @{
    "{{baseLink}}" = $Url
    "{{mlbLink}}" = "$Url/mlb"
    "{{ownerLink}}" = "$Url/owner"
    "{{sentAt}}" = $sentAt
  }

  foreach ($token in $replacements.Keys) {
    $body = $body.Replace($token, $replacements[$token])
  }

  return $body
}

function Get-TunnelEmailScheduleTimes {
  param($Settings)

  $candidates = @()

  if ($Settings -and ($Settings.PSObject.Properties.Name -contains "sendTimesLocal") -and $Settings.sendTimesLocal) {
    foreach ($item in @($Settings.sendTimesLocal)) {
      if ($item -is [string]) {
        $candidates += ($item -split "[,\n]" | ForEach-Object { $_.Trim() })
      }
    }
  }

  if ($candidates.Count -eq 0 -and $Settings -and ($Settings.PSObject.Properties.Name -contains "sendTimeLocal") -and $Settings.sendTimeLocal) {
    $candidates += [string]$Settings.sendTimeLocal
  }

  if ($candidates.Count -eq 0) {
    $envTimes = Get-OptionalEnvValue "TUNNEL_LINK_EMAIL_TIMES"
    if ($envTimes) {
      $candidates += ($envTimes -split "[,\n]" | ForEach-Object { $_.Trim() })
    }
  }

  $times = @(
    $candidates |
      Where-Object { $_ -and $_ -match "^(?:[01]\d|2[0-3]):[0-5]\d$" } |
      Sort-Object -Unique |
      Select-Object -First 8
  )

  if ($times.Count -eq 0) {
    return @("09:00")
  }

  return $times
}

function Get-TunnelEmailDeliveryMode {
  param($Settings)

  $mode = Get-TunnelEmailSetting $Settings "deliveryMode" "TUNNEL_LINK_EMAIL_DELIVERY_MODE" "together"
  if ($mode -and $mode.ToLowerInvariant() -eq "individual") {
    return "individual"
  }

  return "together"
}

function Get-TunnelEmailRecipients {
  param($Settings)

  $candidates = @()

  if ($Settings -and ($Settings.PSObject.Properties.Name -contains "recipientEmails") -and $Settings.recipientEmails) {
    foreach ($item in @($Settings.recipientEmails)) {
      if ($item -is [string]) {
        $candidates += ($item -split "[,;`n]" | ForEach-Object { $_.Trim() })
      }
    }
  }

  if ($candidates.Count -eq 0) {
    $recipientsValue = Get-TunnelEmailSetting $Settings "recipients" "TUNNEL_LINK_EMAIL_TO" $null
    if ($recipientsValue) {
      $candidates += ($recipientsValue -split "[,;`n]" | ForEach-Object { $_.Trim() })
    }
  }

  return @(
    $candidates |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Select-Object -First 20
  )
}

function Get-TunnelEmailScheduleTargets {
  param([string[]]$SendTimes)

  $targets = @()
  $today = (Get-Date).Date

  foreach ($sendTime in $SendTimes) {
    if ($sendTime -match "^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$") {
      $targets += [pscustomobject]@{
        Time = $sendTime
        Target = $today.AddHours([int]$Matches.hour).AddMinutes([int]$Matches.minute)
      }
    }
  }

  return @($targets | Sort-Object Target)
}

function Send-TunnelLinkEmailMessage {
  param(
    [string[]]$Recipients,
    [string]$From,
    [string]$Subject,
    [string]$Body,
    [string]$Server,
    [int]$Port,
    [string]$Username,
    [string]$Password,
    [bool]$UseSsl,
    [string]$DeliveryMode
  )

  $emailJob = Start-Job -ScriptBlock {
    param(
      [string[]]$Recipients,
      [string]$From,
      [string]$Subject,
      [string]$Body,
      [string]$Server,
      [int]$Port,
      [string]$Username,
      [string]$Password,
      [bool]$UseSsl,
      [string]$DeliveryMode
    )

    $client = $null

    try {
      $client = New-Object System.Net.Mail.SmtpClient($Server, $Port)
      $client.EnableSsl = $UseSsl
      $client.Timeout = 15000
      $client.Credentials = New-Object System.Net.NetworkCredential($Username, $Password)

      if ($DeliveryMode -eq "individual") {
        $sentCount = 0
        foreach ($recipient in $Recipients) {
          $message = $null
          try {
            $message = New-Object System.Net.Mail.MailMessage
            $message.From = $From
            $message.To.Add($recipient)
            $message.Subject = $Subject
            $message.Body = $Body
            $client.Send($message)
            $sentCount += 1
          } finally {
            if ($message) {
              $message.Dispose()
            }
          }
        }

        "sent:individual:$sentCount"
      } else {
        $message = $null
        try {
          $message = New-Object System.Net.Mail.MailMessage
          $message.From = $From
          foreach ($recipient in $Recipients) {
            $message.To.Add($recipient)
          }
          $message.Subject = $Subject
          $message.Body = $Body
          $client.Send($message)
          "sent:together:$($Recipients.Count)"
        } finally {
          if ($message) {
            $message.Dispose()
          }
        }
      }
    } catch {
      "failed: $($_.Exception.Message)"
    } finally {
      if ($client) {
        $client.Dispose()
      }
    }
  } -ArgumentList $Recipients, $From, $Subject, $Body, $Server, $Port, $Username, $Password, $UseSsl, $DeliveryMode

  try {
    if (Wait-Job $emailJob -Timeout 25) {
      $result = (Receive-Job $emailJob | Select-Object -Last 1)
      if ($result -like "sent:individual:*") {
        $sentCount = $result.Split(":")[-1]
        Write-Step "Tunnel link email sent individually to $sentCount recipient(s)."
        return $true
      } elseif ($result -like "sent:together:*") {
        Write-Step "Tunnel link email sent together to $($Recipients -join ', ')."
        return $true
      } else {
        Write-Step "Tunnel link email $result"
        return $false
      }
    } else {
      Stop-Job $emailJob -ErrorAction SilentlyContinue
      Write-Step "Tunnel link email timed out after 25 seconds."
      return $false
    }
  } finally {
    Remove-Job $emailJob -Force -ErrorAction SilentlyContinue
  }
}

function Send-TunnelLinkEmailNow {
  param(
    [string]$Url,
    [string]$Reason
  )

  $settings = Get-TunnelEmailSettings
  if ($settings.enabled -eq $false) {
    Write-Step "Tunnel link email skipped. Email links are paused in owner settings."
    return $false
  }

  $recipients = Get-TunnelEmailRecipients $settings
  $from = Get-TunnelEmailSetting $settings "from" "TUNNEL_LINK_EMAIL_FROM" $null
  $server = Get-OptionalEnvValue "TUNNEL_LINK_SMTP_SERVER"
  $portValue = Get-OptionalEnvValue "TUNNEL_LINK_SMTP_PORT"
  $username = Get-OptionalEnvValue "TUNNEL_LINK_SMTP_USERNAME"
  $password = Get-OptionalEnvValue "TUNNEL_LINK_SMTP_PASSWORD"

  $missing = @()
  if ($recipients.Count -eq 0) { $missing += "TUNNEL_LINK_EMAIL_TO" }
  if (-not $from) { $missing += "TUNNEL_LINK_EMAIL_FROM" }
  if (-not $server) { $missing += "TUNNEL_LINK_SMTP_SERVER" }
  if (-not $username) { $missing += "TUNNEL_LINK_SMTP_USERNAME" }
  if (-not $password) { $missing += "TUNNEL_LINK_SMTP_PASSWORD" }

  if ($missing.Count -gt 0) {
    Write-Step "Tunnel link email skipped. Missing: $($missing -join ', ')."
    return $false
  }

  $port = 587
  if ($portValue) {
    $parsedPort = 0
    if ([int]::TryParse($portValue, [ref]$parsedPort) -and $parsedPort -gt 0) {
      $port = $parsedPort
    }
  }

  $useSslValue = Get-OptionalEnvValue "TUNNEL_LINK_SMTP_USE_SSL"
  $useSsl = -not ($useSslValue -and ($useSslValue -eq "0" -or $useSslValue.ToLowerInvariant() -eq "false"))
  $subject = Get-TunnelEmailSetting $settings "subject" "TUNNEL_LINK_EMAIL_SUBJECT" "Betting Lab link is ready"
  $bodyTemplate = Get-TunnelEmailSetting $settings "bodyTemplate" $null (Get-DefaultTunnelEmailBody)
  $deliveryMode = Get-TunnelEmailDeliveryMode $settings
  $body = Resolve-TunnelEmailTemplate $bodyTemplate $Url

  if ($Reason) {
    Write-Step "Tunnel link email due for $Reason; sending link."
  }

  return (Send-TunnelLinkEmailMessage $recipients $from $subject $body $server $port $username $password $useSsl $deliveryMode)
}

function Send-TunnelLinkEmail {
  param([string]$Url)

  $settings = Get-TunnelEmailSettings
  if ($settings.enabled -eq $false) {
    Write-Step "Tunnel link email skipped. Email links are paused in owner settings."
    return
  }

  $recipients = Get-TunnelEmailRecipients $settings
  $from = Get-TunnelEmailSetting $settings "from" "TUNNEL_LINK_EMAIL_FROM" $null
  $server = Get-OptionalEnvValue "TUNNEL_LINK_SMTP_SERVER"
  $portValue = Get-OptionalEnvValue "TUNNEL_LINK_SMTP_PORT"
  $username = Get-OptionalEnvValue "TUNNEL_LINK_SMTP_USERNAME"
  $password = Get-OptionalEnvValue "TUNNEL_LINK_SMTP_PASSWORD"

  $missing = @()
  if ($recipients.Count -eq 0) { $missing += "TUNNEL_LINK_EMAIL_TO" }
  if (-not $from) { $missing += "TUNNEL_LINK_EMAIL_FROM" }
  if (-not $server) { $missing += "TUNNEL_LINK_SMTP_SERVER" }
  if (-not $username) { $missing += "TUNNEL_LINK_SMTP_USERNAME" }
  if (-not $password) { $missing += "TUNNEL_LINK_SMTP_PASSWORD" }

  if ($missing.Count -gt 0) {
    Write-Step "Tunnel link email skipped. Missing: $($missing -join ', ')."
    return
  }

  $port = 587
  if ($portValue) {
    $parsedPort = 0
    if ([int]::TryParse($portValue, [ref]$parsedPort) -and $parsedPort -gt 0) {
      $port = $parsedPort
    }
  }

  $useSslValue = Get-OptionalEnvValue "TUNNEL_LINK_SMTP_USE_SSL"
  $useSsl = -not ($useSslValue -and ($useSslValue -eq "0" -or $useSslValue.ToLowerInvariant() -eq "false"))
  $subject = Get-TunnelEmailSetting $settings "subject" "TUNNEL_LINK_EMAIL_SUBJECT" "Betting Lab link is ready"
  $bodyTemplate = Get-TunnelEmailSetting $settings "bodyTemplate" $null (Get-DefaultTunnelEmailBody)
  $deliveryMode = Get-TunnelEmailDeliveryMode $settings
  $sendTimes = Get-TunnelEmailScheduleTimes $settings

  if ($recipients.Count -eq 0) {
    Write-Step "Tunnel link email skipped. No valid recipients."
    return
  }

  if ($settings.waitUntilSendTime -eq $false) {
    $body = Resolve-TunnelEmailTemplate $bodyTemplate $Url
    Write-Step "Tunnel link email sending now because schedule waiting is off."
    Send-TunnelLinkEmailMessage $recipients $from $subject $body $server $port $username $password $useSsl $deliveryMode
    return
  }

  $targets = Get-TunnelEmailScheduleTargets $sendTimes
  $now = Get-Date
  $pastTargets = @($targets | Where-Object { $_.Target -le $now })
  $futureTargets = @($targets | Where-Object { $_.Target -gt $now })

  if ($pastTargets.Count -gt 0) {
    $missedTarget = $pastTargets | Select-Object -Last 1
    Write-Step "Scheduled email time $($missedTarget.Time) local time already passed; sending now."
    $body = Resolve-TunnelEmailTemplate $bodyTemplate $Url
    Send-TunnelLinkEmailMessage $recipients $from $subject $body $server $port $username $password $useSsl $deliveryMode
  }

  foreach ($target in $futureTargets) {
    $currentTime = Get-Date
    if ($currentTime -lt $target.Target) {
      $seconds = [int][Math]::Ceiling(($target.Target - $currentTime).TotalSeconds)
      Write-Step "Tunnel ready before scheduled email time $($target.Time) local time; waiting $seconds seconds."
      Start-Sleep -Seconds $seconds
    }

    Write-Step "Scheduled email time $($target.Time) local time reached; sending link."
    $body = Resolve-TunnelEmailTemplate $bodyTemplate $Url
    Send-TunnelLinkEmailMessage $recipients $from $subject $body $server $port $username $password $useSsl $deliveryMode
  }
}

function Get-TunnelEmailDateKey {
  return (Get-Date -Format "yyyy-MM-dd")
}

function Get-TunnelEmailSendKey {
  param(
    [string]$Url,
    [string]$SendTime
  )

  return "$(Get-TunnelEmailDateKey)|$Url|$SendTime"
}

function Test-TunnelEmailSentKey {
  param([string]$Key)

  if (-not (Test-Path $TunnelEmailSentStatePath)) {
    return $false
  }

  $sentKeys = Get-Content -LiteralPath $TunnelEmailSentStatePath -ErrorAction SilentlyContinue
  return $sentKeys -contains $Key
}

function Add-TunnelEmailSentKey {
  param([string]$Key)

  Add-Content -Path $TunnelEmailSentStatePath -Value $Key -ErrorAction SilentlyContinue
}

function Read-CurrentTunnelUrl {
  if (-not (Test-Path $TunnelUrlPath)) {
    return $null
  }

  $url = Get-Content -LiteralPath $TunnelUrlPath -ErrorAction SilentlyContinue | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($url)) {
    return $null
  }

  return $url.Trim()
}

function Test-TunnelProcessAlive {
  if (-not (Test-Path $TunnelPidPath)) {
    return $true
  }

  $existingPid = Get-Content $TunnelPidPath -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $existingPid) {
    return $true
  }

  return [bool](Get-Process -Id $existingPid -ErrorAction SilentlyContinue)
}

function Invoke-TunnelEmailScheduler {
  Write-Step "Tunnel email scheduler started."

  while ($true) {
    try {
      $url = Read-CurrentTunnelUrl
      if (-not $url -or -not (Test-TunnelProcessAlive)) {
        Start-Sleep -Seconds 30
        continue
      }

      $settings = Get-TunnelEmailSettings
      if ($settings.enabled -eq $false) {
        Start-Sleep -Seconds 30
        continue
      }

      if ($settings.waitUntilSendTime -eq $false) {
        $sendKey = Get-TunnelEmailSendKey $url "immediate"
        if (-not (Test-TunnelEmailSentKey $sendKey)) {
          if (Send-TunnelLinkEmailNow $url "immediate send") {
            Add-TunnelEmailSentKey $sendKey
          }
        }

        Start-Sleep -Seconds 30
        continue
      }

      $sendTimes = Get-TunnelEmailScheduleTimes $settings
      $targets = Get-TunnelEmailScheduleTargets $sendTimes
      $now = Get-Date

      foreach ($target in $targets) {
        if ($target.Target -gt $now) {
          continue
        }

        $sendKey = Get-TunnelEmailSendKey $url $target.Time
        if (Test-TunnelEmailSentKey $sendKey) {
          continue
        }

        if (Send-TunnelLinkEmailNow $url "$($target.Time) local time") {
          Add-TunnelEmailSentKey $sendKey
        }
      }
    } catch {
      Write-Step "Tunnel email scheduler issue: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds 30
  }
}

function Start-TunnelEmailScheduler {
  if (Test-Path $TunnelEmailSchedulerPidPath) {
    $existingPid = Get-Content $TunnelEmailSchedulerPidPath -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
      Write-Step "Stopping existing tunnel email scheduler process $existingPid."
      Stop-Process -Id $existingPid -Force
    }
    Remove-Item $TunnelEmailSchedulerPidPath -Force -ErrorAction SilentlyContinue
  }

  Write-Step "Starting tunnel email scheduler."
  $schedulerProcess = Start-Process $PowerShellPath -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $PSCommandPath,
    "-BaseUrl",
    $BaseUrl,
    "-EmailScheduler"
  ) -PassThru

  Set-Content -Path $TunnelEmailSchedulerPidPath -Value $schedulerProcess.Id
}

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}

Import-LocalEnv
if ($EmailScheduler) {
  Invoke-TunnelEmailScheduler
  exit 0
}

Start-LocalAppIfNeeded
$cloudflared = Resolve-Cloudflared
Stop-ExistingTunnel
Clear-TunnelEmailProcessEnv

Remove-Item -Path $TunnelOutLog, $TunnelErrLog -Force -ErrorAction SilentlyContinue
Remove-Item -Path $TunnelUrlPath -Force -ErrorAction SilentlyContinue

Write-Step "Starting Cloudflare quick tunnel for $BaseUrl."
$process = Start-Process $cloudflared `
  -WindowStyle Hidden `
  -ArgumentList @("tunnel", "--url", $BaseUrl, "--no-autoupdate") `
  -RedirectStandardOutput $TunnelOutLog `
  -RedirectStandardError $TunnelErrLog `
  -PassThru

Set-Content -Path $TunnelPidPath -Value $process.Id

for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 2
  $url = Read-TunnelUrl
  if ($url) {
    Set-Content -Path $TunnelUrlPath -Value $url
    Write-Step "Tunnel is ready: $url"
    Start-TunnelEmailScheduler
    Write-Output $url
    exit 0
  }
}

throw "Timed out waiting for the Cloudflare tunnel URL. Check $TunnelOutLog and $TunnelErrLog."
