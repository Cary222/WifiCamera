param(
  [string]$Serial = "auto",
  [int]$Port = 18787,
  [int]$RelayUdpPort = 18189,
  [int]$IntervalSeconds = 5
)

$ErrorActionPreference = "SilentlyContinue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$adb = if ($env:ANDROID_SDK_ROOT) {
  Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe"
} else {
  "D:\app\AndroidSDK\platform-tools\adb.exe"
}
$mutex = [Threading.Mutex]::new($false, "WifiCameraUsbRelayWatcher")
$ownsMutex = $false

function Write-WatchLog([string]$Message) {
  Write-Host "[usb-relay-watch] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
}

function Get-OnlinePhysicalSerials {
  if (-not (Test-Path $adb)) { return @() }
  $tempFile = [System.IO.Path]::GetTempFileName()
  try {
    Start-Process -FilePath $adb -ArgumentList "devices -l" -RedirectStandardOutput $tempFile -NoNewWindow -Wait
    $lines = Get-Content $tempFile -ErrorAction SilentlyContinue
    @($lines | ForEach-Object {
      if ($_ -match '^([^\s:]+)\s+device(?:\s|$)') {
        $candidate = $Matches[1]
        if ($candidate -notmatch '^emulator-' -and $candidate -notmatch '^127\.0\.0\.1:') {
          $candidate
        }
      }
    })
  } finally {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
  }
}

function Resolve-BoardSerial {
  $online = @(Get-OnlinePhysicalSerials)
  if ($Serial -ne 'auto') {
    if ($online -notcontains $Serial) { throw "Target board is not online: $Serial" }
    return $Serial
  }
  if ($online.Count -eq 1) { return $online[0] }
  if ($online.Count -eq 0) { throw 'No physical ADB board is online' }
  throw "Multiple physical ADB boards are online; specify -Serial explicitly: $($online -join ', ')"
}

$Serial = Resolve-BoardSerial
Write-WatchLog "selected board serial $Serial"

function Test-BoardOnline {
  if (-not (Test-Path $adb)) { return $false }
  return (Get-OnlinePhysicalSerials) -contains $Serial
}

function Ensure-Forward([int]$Local, [int]$Remote) {
  Start-Process -FilePath $adb -ArgumentList @(
    '-s', $Serial, 'forward', "tcp:$Local", "tcp:$Remote"
  ) -NoNewWindow -Wait | Out-Null
}

function Start-RelayIfMissing {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) { return }

  $env:USB_RELAY_PORT = "$Port"
  $env:BOARD_WHEP_HOST = "127.0.0.1"
  $env:BOARD_WHEP_PORT = "18889"
  $env:BOARD_WEBRTC_TUNNEL_HOST = "127.0.0.1"
  $env:BOARD_WEBRTC_TUNNEL_PORT = "18190"
  $env:RELAY_WEBRTC_BIND_HOST = "0.0.0.0"
  $env:RELAY_WEBRTC_ADVERTISE_HOST = "10.0.2.2"
  $env:RELAY_WEBRTC_UDP_PORT = "$RelayUdpPort"
  Start-Process -FilePath "node" -ArgumentList @("$scriptDir\..\server.mjs") -WorkingDirectory "$scriptDir\.." -WindowStyle Hidden
  Write-WatchLog "relay was not listening; started server.mjs"
}

try {
  $ownsMutex = $mutex.WaitOne(0)
  if (-not $ownsMutex) {
    Write-WatchLog "another watcher is already running"
    exit 0
  }

  Write-WatchLog "started for board $Serial"
  while ($true) {
    if (Test-BoardOnline) {
      Ensure-Forward 18999 8999
      Ensure-Forward 18889 8889
      Ensure-Forward 18190 18190
      Start-RelayIfMissing
    }
    Start-Sleep -Seconds ([Math]::Max(2, $IntervalSeconds))
  }
}
finally {
  if ($ownsMutex) {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
  }
}
