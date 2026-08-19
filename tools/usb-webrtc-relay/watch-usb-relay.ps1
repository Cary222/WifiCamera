param(
  [string]$Serial = 'auto',
  [int]$Port = 18787,
  [int]$RelayUdpPort = 18189,
  [int]$IntervalSeconds = 2,
  [string]$AdbPath = '',
  [string]$LogPath = '',
  [switch]$Once
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir 'relay-common.ps1')

$RequestedSerial = $Serial
$adb = Resolve-RelayAdb -AdbPath $AdbPath
Initialize-RelayAdbEnvironment -Adb $adb | Out-Null
if (-not $LogPath) { $LogPath = Join-Path $scriptDir 'watch-usb-relay.log' }
$log = New-RelayLogger -Prefix 'usb-relay-watch' -LogPath $LogPath
$mutex = [Threading.Mutex]::new($false, 'WifiCameraUsbRelayWatcher')
$ownsMutex = $false
$lastTransportId = ''
$lastHealthSummary = ''
$recoveryFailures = 0

function Format-LinkHealth($health) {
  return "control=$($health.Control.Ok) whep=$($health.Whep.Ok) relay=$($health.Relay.Ok)"
}

function Start-RelayIfMissing {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) { return $false }

  $env:USB_RELAY_PORT = "$Port"
  $env:BOARD_WHEP_HOST = '127.0.0.1'
  $env:BOARD_WHEP_PORT = '18889'
  $env:BOARD_WEBRTC_TUNNEL_HOST = '127.0.0.1'
  $env:BOARD_WEBRTC_TUNNEL_PORT = '18190'
  $env:RELAY_WEBRTC_BIND_HOST = '0.0.0.0'
  $env:RELAY_WEBRTC_ADVERTISE_HOST = '10.0.2.2'
  $env:RELAY_WEBRTC_UDP_PORT = "$RelayUdpPort"

  Start-Process -FilePath 'node' -ArgumentList @('server.mjs') `
    -WorkingDirectory $scriptDir -WindowStyle Hidden | Out-Null
  & $log "relay was not listening; started server.mjs on $Port"
  Start-Sleep -Milliseconds 600
  return $true
}

function Restart-Relay {
  $processIds = @()
  $tcpOwners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  if ($tcpOwners) { $processIds += $tcpOwners }
  $udpOwners = Get-NetUDPEndpoint -LocalPort $RelayUdpPort -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  if ($udpOwners) { $processIds += $udpOwners }

  foreach ($processId in ($processIds | Select-Object -Unique)) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 200
  Start-RelayIfMissing | Out-Null
}

function Reset-RelayClients {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$Port/relay-reset" -Method Post `
      -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null
    & $log 'relay clients reset'
  }
  catch {
    & $log "relay client reset failed: $($_.Exception.Message)"
  }
}

function Get-AutoBoardSwitch {
  $online = @(Get-RelayOnlinePhysicalSerials -Adb $adb)
  return Get-RelayAutoBoardDecision -CurrentSerial $Serial -OnlineSerials $online
}

function Restore-Link([bool]$ForceForward = $false) {
  Clear-RelayStaleEndpoints -Adb $adb -Logger $log | Out-Null

  $restore = Restore-RelayForwards -Adb $adb -Serial $Serial -Logger $log -Force:$ForceForward
  if ($restore.StillMissing.Count -gt 0 -or $restore.Failed.Count -gt 0) {
    & $log 'forward recovery incomplete; asking adb to reconnect the board'
    $reconnect = Invoke-RelayAdb -Adb $adb -Arguments @('-s', $Serial, 'reconnect', 'device') -TimeoutSeconds 8
    if ($reconnect.ExitCode -ne 0) {
      & $log "adb reconnect failed: $($reconnect.Error.Trim())"
    }
    Start-Sleep -Milliseconds 700
    $restore = Restore-RelayForwards -Adb $adb -Serial $Serial -Logger $log -Force
  }

  Start-RelayIfMissing | Out-Null
  $health = Test-RelayLinkHealth -RelayPort $Port
  if ($health.Ok) { return $health }

  # A listed forward can still point at a stale transport after USB re-enumeration.
  # Re-issue all three once before touching the relay process.
  if (-not $health.Control.Ok -or -not $health.Whep.Ok) {
    & $log "link probe failed ($(Format-LinkHealth $health)); refreshing all forwards"
    Restore-RelayForwards -Adb $adb -Serial $Serial -Logger $log -Force | Out-Null
    Start-Sleep -Milliseconds 300
    $health = Test-RelayLinkHealth -RelayPort $Port
  }

  if (-not $health.Relay.Ok) {
    & $log "relay health failed ($($health.Relay.Detail)); restarting relay"
    Restart-Relay
    Start-Sleep -Milliseconds 500
    $health = Test-RelayLinkHealth -RelayPort $Port
  }
  elseif (-not $health.Ok) {
    Reset-RelayClients
  }

  return $health
}

try {
  try {
    $ownsMutex = $mutex.WaitOne(0)
  }
  catch [Threading.AbandonedMutexException] {
    # The previous hidden watcher was killed without releasing the mutex. The
    # caller owns an abandoned mutex after this exception and may continue.
    $ownsMutex = $true
    & $log 'claimed abandoned watcher mutex'
  }

  if (-not $ownsMutex) {
    & $log 'another watcher is already running'
    exit 0
  }

  $Serial = Resolve-RelayBoardSerial -Adb $adb -Serial $Serial -RetrySeconds 30
  $version = Invoke-RelayAdb -Adb $adb -Arguments @('version')
  $versionLine = ($version.Output -split "`r?`n" | Where-Object { $_ -match '^Version ' } | Select-Object -First 1)
  & $log "started for board $Serial; adb=$adb; $versionLine; interval=${IntervalSeconds}s"

  while ($true) {
    try {
      $boardChanged = $false
      if ($RequestedSerial -eq 'auto') {
        $decision = Get-AutoBoardSwitch
        if ($decision.State -eq 'changed') {
          $oldSerial = $Serial
          & $log "board serial changed $oldSerial->$($decision.Serial); removing old forwards"
          Remove-RelayForwards -Adb $adb -Serial $oldSerial -Logger $log | Out-Null
          $Serial = $decision.Serial
          $lastTransportId = ''
          $lastHealthSummary = ''
          $boardChanged = $true
        }
        elseif ($decision.State -eq 'waiting') {
          if ($lastHealthSummary -ne 'waiting') { & $log 'no physical ADB board online; waiting for board' }
          $lastHealthSummary = 'waiting'
          throw 'No physical ADB board is online; waiting for auto selection'
        }
        elseif ($decision.State -eq 'ambiguous') {
          $candidateText = $decision.Candidates -join ', '
          if ($lastHealthSummary -ne 'ambiguous') {
            & $log "multiple physical ADB boards online; specify -Serial explicitly: $candidateText"
          }
          $lastHealthSummary = 'ambiguous'
          throw "Multiple physical ADB boards are online: $candidateText"
        }
      }

      $transportId = Get-RelayTransportId -Adb $adb -Serial $Serial
      $transportChanged = $lastTransportId -and $transportId -and $transportId -ne $lastTransportId
      if ($transportChanged) {
        & $log "board transport changed $lastTransportId->$transportId; refreshing all forwards"
      }
      if ($transportId) { $lastTransportId = $transportId }

      $missing = @(Get-RelayMissingForwards -Adb $adb -Serial $Serial)
      $health = Test-RelayLinkHealth -RelayPort $Port
      $needsRecovery = $boardChanged -or $transportChanged -or $missing.Count -gt 0 -or -not $health.Ok

      if ($needsRecovery) {
        $missingText = if ($missing.Count) {
          ($missing | ForEach-Object { "$($_.Local)->$($_.Remote)" }) -join ', '
        } else { '<none>' }
        & $log "recovery triggered: transport=$transportId missing=$missingText $(Format-LinkHealth $health)"
        $health = Restore-Link -ForceForward:($boardChanged -or $transportChanged)
      }

      $summary = Format-LinkHealth $health
      if ($health.Ok) {
        if ($lastHealthSummary -ne $summary -or $needsRecovery) {
          & $log "link healthy: $summary transport=$lastTransportId"
        }
        $recoveryFailures = 0
      }
      else {
        $recoveryFailures += 1
        & $log "link still unhealthy after recovery: $summary failures=$recoveryFailures"
      }
      $lastHealthSummary = $summary
    }
    catch {
      $recoveryFailures += 1
      & $log "watch iteration failed: $($_.Exception.Message) failures=$recoveryFailures"
    }

    if ($Once) { break }
    $baseDelay = [Math]::Max(1, $IntervalSeconds)
    $delay = if ($recoveryFailures -gt 3) {
      [Math]::Min(15, $baseDelay * [Math]::Pow(2, [Math]::Min(3, $recoveryFailures - 3)))
    } else { $baseDelay }
    Start-Sleep -Seconds ([int]$delay)
  }
}
finally {
  if ($ownsMutex) {
    try { $mutex.ReleaseMutex() } catch {}
  }
  $mutex.Dispose()
}
