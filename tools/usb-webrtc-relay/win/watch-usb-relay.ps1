param(
  [string]$Serial = 'auto',
  [int]$Port = 18787,
  [int]$RelayUdpPort = 18189,
  [int]$IntervalSeconds = 2,
  [string]$AdbPath = '',
  [string]$LogPath = '',
  [switch]$Once
)

# Thin shim kept for path compatibility: the real watcher lives one level up,
# next to relay-common.ps1 and server.mjs. This copy only forwards the call so
# there is a single source of truth for the recovery logic.
$realWatcher = Join-Path (Split-Path -Parent $PSScriptRoot) 'watch-usb-relay.ps1'
& $realWatcher @PSBoundParameters
