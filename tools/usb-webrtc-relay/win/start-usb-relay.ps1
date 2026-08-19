param(
  [string]$Serial = "e2621126569ad4a5",
  [int]$Port = 18787,
  [int]$RelayUdpPort = 18189
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$adb = if ($env:ANDROID_SDK_ROOT) {
  Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe"
} else {
  "D:\app\AndroidSDK\platform-tools\adb.exe"
}

if (-not (Test-Path $adb)) { throw "adb.exe not found: $adb" }
function Get-OnlinePhysicalSerials {
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
    if ($online -notcontains $Serial) {
      $candidates = if ($online.Count) { $online -join ', ' } else { '<none>' }
      throw "Target board is not online: $Serial. Physical candidates: $candidates"
    }
    return $Serial
  }
  if ($online.Count -eq 1) { return $online[0] }
  if ($online.Count -eq 0) {
    throw 'No physical ADB board is online. MuMu is not accepted as a board.'
  }
  throw "Multiple physical ADB boards are online; specify -Serial explicitly: $($online -join ', ')"
}

$Serial = Resolve-BoardSerial
Write-Host "[usb-relay] selected board serial: $Serial"

# All forwards are temporary host-side mappings; this script never changes board files.
foreach ($mapping in @(
  @{ Local = 18999; Remote = 8999 },
  @{ Local = 18889; Remote = 8889 },
  @{ Local = 18190; Remote = 18190 }
)) {
  Start-Process -FilePath $adb -ArgumentList @(
    '-s', $Serial, 'forward', "tcp:$($mapping.Local)", "tcp:$($mapping.Remote)"
  ) -NoNewWindow -Wait
}

$tempBridge = [System.IO.Path]::GetTempFileName()
try {
  Start-Process -FilePath $adb -ArgumentList @('-s', $Serial, 'shell', "busybox netstat -ln 2>/dev/null | grep ':18190'") -RedirectStandardOutput $tempBridge -NoNewWindow -Wait
  $bridge = Get-Content $tempBridge -ErrorAction SilentlyContinue | Out-String
  if ($bridge -notmatch 'LISTEN' -and $bridge -notmatch '18190') {
    Write-Warning "Board UDP bridge 18190 check returned non-listen. Continuing anyway..."
  }
} finally {
  Remove-Item $tempBridge -Force -ErrorAction SilentlyContinue
}

Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Get-NetUDPEndpoint -LocalPort $RelayUdpPort -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

$env:USB_RELAY_PORT = "$Port"
$env:BOARD_WHEP_HOST = "127.0.0.1"
$env:BOARD_WHEP_PORT = "18889"
$env:BOARD_WEBRTC_TUNNEL_HOST = "127.0.0.1"
$env:BOARD_WEBRTC_TUNNEL_PORT = "18190"
$env:RELAY_WEBRTC_BIND_HOST = "0.0.0.0"
$env:RELAY_WEBRTC_ADVERTISE_HOST = "10.0.2.2"
$env:RELAY_WEBRTC_UDP_PORT = "$RelayUdpPort"

Start-Process -FilePath node -ArgumentList @("$PSScriptRoot\..\server.mjs") -WorkingDirectory "$PSScriptRoot\.." -WindowStyle Hidden
Start-Sleep -Milliseconds 800

$health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/stream-health" -TimeoutSec 5
Write-Host "[usb-relay] ready: $($health.mode)"
Write-Host "[usb-relay] WHEP: http://10.0.2.2:$Port/board-webrtc/cam0/whep"
Write-Host "[usb-relay] control/image remain: http://10.0.2.2:18999"

$watcher = Join-Path $PSScriptRoot "watch-usb-relay.ps1"
Start-Process -FilePath "powershell.exe" -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
  "$PSScriptRoot\watch-usb-relay.ps1",
  '-Serial', $Serial, '-Port', $Port, '-RelayUdpPort', $RelayUdpPort
) -WindowStyle Hidden
Write-Host "[usb-relay] forward/relay watcher started"
