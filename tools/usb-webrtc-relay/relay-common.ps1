# Shared host-side helpers for the USB WebRTC relay tooling.
#
# Dot-source this file from start-usb-relay.ps1 / watch-usb-relay.ps1:
#   . (Join-Path $PSScriptRoot 'relay-common.ps1')
#
# Everything here only touches *host-side* temporary state (adb forwards, the
# relay process). It never modifies files on the board.

Set-StrictMode -Version Latest

# The three host->board forwards the App depends on. 18999 carries control /
# WebSocket, 18889 carries WHEP signalling, 18190 carries the UDP media tunnel.
# Losing any single one breaks preview, so they are always asserted as a set.
$script:RelayForwards = @(
  @{ Local = 18999; Remote = 8999 },
  @{ Local = 18889; Remote = 8889 },
  @{ Local = 18190; Remote = 18190 }
)

function Get-RelayForwardSpecs {
  return $script:RelayForwards
}

<#
.SYNOPSIS
Resolves the single adb.exe that all relay tooling must use.

.DESCRIPTION
Multiple adb clients exist on this host (an old one on PATH, the Android SDK
one, and MuMu's bundled one). Whichever version talks to the adb server first
wins, and a mismatched client makes the server restart -- which silently drops
every `adb forward`. Pinning one binary removes that failure source.
#>
function Resolve-RelayAdb {
  param([string]$AdbPath = '')

  $candidates = @()
  if ($AdbPath) { $candidates += $AdbPath }
  if ($env:ANDROID_SDK_ROOT) { $candidates += (Join-Path $env:ANDROID_SDK_ROOT 'platform-tools\adb.exe') }
  $candidates += 'D:\app\AndroidSDK\platform-tools\adb.exe'

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }
  throw "adb.exe not found. Tried: $($candidates -join ', ')"
}

<#
.SYNOPSIS
Pins the adb server environment so every child process agrees on one client.
#>
function Initialize-RelayAdbEnvironment {
  param([Parameter(Mandatory)][string]$Adb)

  $sdkRoot = Split-Path -Parent (Split-Path -Parent $Adb)
  $env:ANDROID_SDK_ROOT = $sdkRoot
  if (-not $env:ADB_SERVER_SOCKET) { $env:ADB_SERVER_SOCKET = 'tcp:5037' }
  return $sdkRoot
}

<#
.SYNOPSIS
Invokes adb and returns stdout plus the real exit code.

.DESCRIPTION
The previous implementation used `Start-Process ... | Out-Null`, which discarded
both output and exit status -- a failed `adb forward` was indistinguishable from
a successful one. Everything here goes through this function so failures are
observable.
#>
function Invoke-RelayAdb {
  param(
    [Parameter(Mandatory)][string]$Adb,
    [Parameter(Mandatory)][string[]]$Arguments,
    [int]$TimeoutSeconds = 10
  )

  # ProcessStartInfo is used instead of Start-Process -PassThru because the
  # latter does not reliably surface ExitCode when streams are redirected on
  # Windows PowerShell 5.1 -- a null exit code was being read as failure and
  # made every adb query look broken.
  # .NET Framework (Windows PowerShell 5.1) has no ArgumentList collection, so
  # build the argument string and quote each token defensively. adb arguments
  # here are internal (ports, serials, subcommands) but quoting keeps a serial
  # containing unexpected characters from splitting into two arguments.
  $quoted = foreach ($argument in $Arguments) {
    if ($argument -match '[\s"]') { '"' + ($argument -replace '"', '\"') + '"' } else { $argument }
  }

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $Adb
  $startInfo.Arguments = ($quoted -join ' ')
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  try {
    [void]$process.Start()

    # Read both streams asynchronously; a synchronous ReadToEnd on one stream
    # can deadlock when the other fills its pipe buffer.
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()

    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      try { $process.Kill() } catch {}
      return [pscustomobject]@{
        ExitCode = -1
        Output   = ''
        Error    = "adb $($Arguments -join ' ') timed out after ${TimeoutSeconds}s"
        TimedOut = $true
      }
    }

    $outText = $stdoutTask.GetAwaiter().GetResult()
    $errText = $stderrTask.GetAwaiter().GetResult()
    if ($null -eq $outText) { $outText = '' }
    if ($null -eq $errText) { $errText = '' }

    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      Output   = $outText
      Error    = $errText
      TimedOut = $false
    }
  }
  catch {
    return [pscustomobject]@{
      ExitCode = -1
      Output   = ''
      Error    = "adb $($Arguments -join ' ') failed to start: $($_.Exception.Message)"
      TimedOut = $false
    }
  }
  finally {
    $process.Dispose()
  }
}

<#
.SYNOPSIS
Parses `adb devices -l` into structured entries.
#>
function Get-RelayDeviceEntries {
  param([Parameter(Mandatory)][string]$Adb)

  $result = Invoke-RelayAdb -Adb $Adb -Arguments @('devices', '-l')
  if ($result.ExitCode -ne 0) { return @() }

  $entries = @()
  foreach ($line in ($result.Output -split "`r?`n")) {
    if ($line -match '^(?<serial>\S+)\s+(?<state>device|offline|unauthorized)(?:\s+(?<rest>.*))?$') {
      # Preserve the outer match before the transport-id regex overwrites
      # PowerShell's automatic $Matches hashtable.
      $deviceSerial = $Matches['serial']
      $deviceState = $Matches['state']
      $rest = $Matches['rest']
      $transportId = ''
      if ($rest -and $rest -match 'transport_id:(?<tid>\d+)') { $transportId = $Matches['tid'] }
      $entries += [pscustomobject]@{
        Serial      = $deviceSerial
        State       = $deviceState
        TransportId = $transportId
        IsEmulator  = ($deviceSerial -match '^emulator-')
        IsNetwork   = ($deviceSerial -match '^\d{1,3}(\.\d{1,3}){3}:\d+$')
      }
    }
  }
  return $entries
}

function Get-RelayOnlinePhysicalSerials {
  param([Parameter(Mandatory)][string]$Adb)

  return @(
    Get-RelayDeviceEntries -Adb $Adb |
      Where-Object { $_.State -eq 'device' -and -not $_.IsEmulator -and -not $_.IsNetwork } |
      ForEach-Object { $_.Serial }
  )
}

function Get-RelayAutoBoardDecision {
  param(
    [string]$CurrentSerial = '',
    [string[]]$OnlineSerials = @()
  )

  $online = @($OnlineSerials | Where-Object { $_ } | Select-Object -Unique)
  if ($CurrentSerial -and ($online -contains $CurrentSerial)) {
    return [pscustomobject]@{ State = 'current'; Serial = $CurrentSerial; Candidates = $online }
  }
  if ($online.Count -eq 1) {
    $state = if ($CurrentSerial) { 'changed' } else { 'selected' }
    return [pscustomobject]@{ State = $state; Serial = $online[0]; Candidates = $online }
  }
  if ($online.Count -eq 0) {
    return [pscustomobject]@{ State = 'waiting'; Serial = ''; Candidates = $online }
  }
  return [pscustomobject]@{ State = 'ambiguous'; Serial = ''; Candidates = $online }
}

<#
.SYNOPSIS
Returns the board's current transport_id, or '' when it is not enumerated.

.DESCRIPTION
A changed transport_id means the device re-enumerated (USB brown-out / replug).
Every forward is dropped at that moment, so this is the cheapest early signal
that a full recovery is needed.
#>
function Get-RelayTransportId {
  param(
    [Parameter(Mandatory)][string]$Adb,
    [Parameter(Mandatory)][string]$Serial
  )

  $entry = Get-RelayDeviceEntries -Adb $Adb | Where-Object { $_.Serial -eq $Serial } | Select-Object -First 1
  if (-not $entry) { return '' }
  return $entry.TransportId
}

<#
.SYNOPSIS
Resolves the board serial, tolerating transient enumeration gaps.

.DESCRIPTION
The device list is briefly empty while the USB device re-enumerates or while the
adb server is being replaced. Failing hard on the first empty read is precisely
the brittleness that made the old watcher give up, so poll for a short window
before concluding the board is really absent.
#>
function Resolve-RelayBoardSerial {
  param(
    [Parameter(Mandatory)][string]$Adb,
    [string]$Serial = 'auto',
    [int]$RetrySeconds = 12
  )

  $deadline = (Get-Date).AddSeconds([Math]::Max(0, $RetrySeconds))
  $online = @()

  while ($true) {
    $online = @(Get-RelayOnlinePhysicalSerials -Adb $Adb)

    if ($Serial -ne 'auto') {
      if ($online -contains $Serial) { return $Serial }
    }
    elseif ($online.Count -eq 1) {
      return $online[0]
    }
    elseif ($online.Count -gt 1) {
      throw "Multiple physical ADB boards are online; specify -Serial explicitly: $($online -join ', ')"
    }

    if ((Get-Date) -ge $deadline) { break }
    Start-Sleep -Milliseconds 1000
  }

  if ($Serial -ne 'auto') {
    $candidates = if ($online.Count) { $online -join ', ' } else { '<none>' }
    throw "Target board is not online: $Serial. Physical candidates: $candidates"
  }
  throw 'No physical ADB board is online. MuMu is not accepted as a board.'
}

<#
.SYNOPSIS
Reads the forwards that actually exist for a serial.

.DESCRIPTION
Asserting on real state matters: issuing `adb forward` and assuming it worked is
what let the old watcher report health while the App had no connectivity.
#>
function Get-RelayActiveForwards {
  param(
    [Parameter(Mandatory)][string]$Adb,
    [Parameter(Mandatory)][string]$Serial
  )

  $result = Invoke-RelayAdb -Adb $Adb -Arguments @('forward', '--list')
  if ($result.ExitCode -ne 0) { return @() }

  $active = @()
  foreach ($line in ($result.Output -split "`r?`n")) {
    if ($line -match '^(?<serial>\S+)\s+tcp:(?<local>\d+)\s+tcp:(?<remote>\d+)\s*$') {
      if ($Matches['serial'] -eq $Serial) {
        $active += [pscustomobject]@{
          Local  = [int]$Matches['local']
          Remote = [int]$Matches['remote']
        }
      }
    }
  }
  return $active
}

<#
.SYNOPSIS
Removes this relay's forwards for a board serial before switching boards.

.DESCRIPTION
ADB keeps forward ownership per serial. During a board swap, the old serial can
still own one or more local ports, preventing the new board from claiming the
same mappings. Only the three mappings owned by this relay are removed.
#>
function Remove-RelayForwards {
  param(
    [Parameter(Mandatory)][string]$Adb,
    [Parameter(Mandatory)][string]$Serial,
    [scriptblock]$Logger = $null
  )

  $active = @(Get-RelayActiveForwards -Adb $Adb -Serial $Serial)
  $removed = @()
  $failed = @()
  foreach ($spec in (Get-RelayForwardSpecs)) {
    $isActive = $active | Where-Object {
      $_.Local -eq $spec.Local -and $_.Remote -eq $spec.Remote
    }
    if (-not $isActive) { continue }

    $result = Invoke-RelayAdb -Adb $Adb -Arguments @(
      '-s', $Serial, 'forward', '--remove', "tcp:$($spec.Local)"
    )
    if ($result.ExitCode -eq 0) {
      $removed += $spec
      if ($Logger) { & $Logger "forward removed for $Serial`: $($spec.Local)->$($spec.Remote)" }
    }
    else {
      $detail = (($result.Error, $result.Output) -join ' ').Trim()
      $failed += "tcp:$($spec.Local)->tcp:$($spec.Remote) exit=$($result.ExitCode) $detail"
      if ($Logger) { & $Logger "forward remove FAILED for $Serial`: $($failed[-1])" }
    }
  }

  return [pscustomobject]@{
    Serial  = $Serial
    Removed = $removed
    Failed  = $failed
  }
}

function Remove-RelayForwardsForOtherSerials {
  param(
    [Parameter(Mandatory)][string]$Adb,
    [Parameter(Mandatory)][string]$KeepSerial,
    [scriptblock]$Logger = $null
  )

  $result = Invoke-RelayAdb -Adb $Adb -Arguments @('forward', '--list')
  if ($result.ExitCode -ne 0) {
    return @()
  }

  $owners = @()
  foreach ($line in ($result.Output -split "`r?`n")) {
    if ($line -match '^(?<serial>\S+)\s+tcp:(?<local>\d+)\s+tcp:(?<remote>\d+)\s*$') {
      $isRelayForward = Get-RelayForwardSpecs | Where-Object {
        $_.Local -eq [int]$Matches['local'] -and $_.Remote -eq [int]$Matches['remote']
      }
      if ($isRelayForward -and $Matches['serial'] -ne $KeepSerial) {
        $owners += $Matches['serial']
      }
    }
  }

  $cleaned = @()
  foreach ($serial in ($owners | Select-Object -Unique)) {
    $removed = Remove-RelayForwards -Adb $Adb -Serial $serial -Logger $Logger
    if ($removed.Removed.Count -gt 0) { $cleaned += $serial }
  }
  return $cleaned | Select-Object -Unique
}

function Get-RelayMissingForwards {
  param(
    [Parameter(Mandatory)][string]$Adb,
    [Parameter(Mandatory)][string]$Serial
  )

  $active = @(Get-RelayActiveForwards -Adb $Adb -Serial $Serial)
  return @(
    Get-RelayForwardSpecs | Where-Object {
      $spec = $_
      -not ($active | Where-Object { $_.Local -eq $spec.Local -and $_.Remote -eq $spec.Remote })
    }
  )
}

<#
.SYNOPSIS
Creates any missing forwards and re-reads the list to confirm.

.OUTPUTS
Object with Missing (before), Failed (adb rejected), StillMissing (after re-read).
#>
function Restore-RelayForwards {
  param(
    [Parameter(Mandatory)][string]$Adb,
    [Parameter(Mandatory)][string]$Serial,
    [scriptblock]$Logger = $null,
    [switch]$Force
  )

  # Do not assign directly from an `if` expression here: Windows PowerShell
  # unwraps an empty branch to $null even when that branch contains `@(...)`.
  $missing = @()
  if ($Force) {
    # A forward can remain listed while its underlying adb transport is stale.
    # Re-issuing the same mapping is idempotent and refreshes that transport.
    $missing += @(Get-RelayForwardSpecs)
  }
  else {
    $missing += @(Get-RelayMissingForwards -Adb $Adb -Serial $Serial)
  }
  $failed = @()

  foreach ($spec in $missing) {
    $result = Invoke-RelayAdb -Adb $Adb -Arguments @(
      '-s', $Serial, 'forward', "tcp:$($spec.Local)", "tcp:$($spec.Remote)"
    )
    if ($result.ExitCode -ne 0) {
      $detail = (($result.Error, $result.Output) -join ' ').Trim()
      $failed += "tcp:$($spec.Local)->tcp:$($spec.Remote) exit=$($result.ExitCode) $detail"
    }
  }

  $stillMissing = @(Get-RelayMissingForwards -Adb $Adb -Serial $Serial)

  if ($Logger) {
    if ($missing.Count -gt 0) {
      $names = ($missing | ForEach-Object { "$($_.Local)->$($_.Remote)" }) -join ', '
      & $Logger "forward missing: $names"
    }
    foreach ($failure in $failed) { & $Logger "forward create FAILED: $failure" }
    if ($missing.Count -gt 0 -and $stillMissing.Count -eq 0) {
      & $Logger 'forward restored: all 3 mappings present'
    }
  }

  return [pscustomobject]@{
    Missing      = $missing
    Failed       = $failed
    StillMissing = $stillMissing
  }
}

<#
.SYNOPSIS
Removes stale loopback (network) adb entries.

.DESCRIPTION
Offline `127.0.0.1:<port>` entries accumulate and pollute serial resolution.
emulator-* entries are deliberately left alone -- MuMu owns those, and
disconnecting them is not this tool's business.
#>
function Clear-RelayStaleEndpoints {
  param(
    [Parameter(Mandatory)][string]$Adb,
    [scriptblock]$Logger = $null
  )

  $cleared = @()
  foreach ($entry in (Get-RelayDeviceEntries -Adb $Adb)) {
    if ($entry.State -ne 'device' -and $entry.IsNetwork) {
      $result = Invoke-RelayAdb -Adb $Adb -Arguments @('disconnect', $entry.Serial)
      if ($result.ExitCode -eq 0) { $cleared += $entry.Serial }
    }
    elseif ($entry.State -ne 'device' -and $entry.IsEmulator -and $Logger) {
      & $Logger "note: emulator endpoint $($entry.Serial) is $($entry.State) (left untouched)"
    }
  }
  if ($Logger -and $cleared.Count -gt 0) {
    & $Logger "cleared stale endpoints: $($cleared -join ', ')"
  }
  return $cleared
}

# --- End-to-end probes -------------------------------------------------------
# A live relay process and a LISTENing port are not evidence of connectivity.
# These probes exercise the actual paths the App uses.

function Test-RelayHttpProbe {
  param(
    [Parameter(Mandatory)][string]$Uri,
    [int]$TimeoutSeconds = 3
  )

  try {
    $response = Invoke-WebRequest -Uri $Uri -TimeoutSec $TimeoutSeconds -UseBasicParsing -ErrorAction Stop
    return [pscustomobject]@{ Ok = ($response.StatusCode -eq 200); Detail = "http $($response.StatusCode)" }
  }
  catch {
    return [pscustomobject]@{ Ok = $false; Detail = $_.Exception.Message }
  }
}

function Test-RelayTcpProbe {
  param(
    [string]$TargetHost = '127.0.0.1',
    [Parameter(Mandatory)][int]$Port,
    [int]$TimeoutMilliseconds = 3000
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    if (-not $client.ConnectAsync($TargetHost, $Port).Wait($TimeoutMilliseconds)) {
      return [pscustomobject]@{ Ok = $false; Detail = "tcp ${TargetHost}:${Port} timeout" }
    }
    return [pscustomobject]@{ Ok = $true; Detail = "tcp ${TargetHost}:${Port} connected" }
  }
  catch {
    return [pscustomobject]@{ Ok = $false; Detail = "tcp ${TargetHost}:${Port} $($_.Exception.Message)" }
  }
  finally {
    $client.Dispose()
  }
}

<#
.SYNOPSIS
Probes control API, WHEP upstream and the relay's own health endpoint.
#>
function Test-RelayLinkHealth {
  param([int]$RelayPort = 18787)

  $control = Test-RelayHttpProbe -Uri 'http://127.0.0.1:18999/StartUp/GetVersion/'
  $whep = Test-RelayTcpProbe -Port 18889
  $relay = Test-RelayHttpProbe -Uri "http://127.0.0.1:$RelayPort/stream-health"

  return [pscustomobject]@{
    Control = $control
    Whep    = $whep
    Relay   = $relay
    Ok      = ($control.Ok -and $whep.Ok -and $relay.Ok)
  }
}

function New-RelayLogger {
  param(
    [Parameter(Mandatory)][string]$Prefix,
    [string]$LogPath = '',
    [int]$MaxBytes = 1MB
  )

  return {
    param([string]$Message)

    $line = "[$Prefix] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Write-Host $line
    if (-not $LogPath) { return }
    try {
      # Single-generation rotation keeps the log bounded without extra deps.
      if ((Test-Path $LogPath) -and ((Get-Item $LogPath).Length -gt $MaxBytes)) {
        Move-Item $LogPath "$LogPath.1" -Force -ErrorAction SilentlyContinue
      }
      Add-Content -Path $LogPath -Value $line -ErrorAction SilentlyContinue
    }
    catch {}
  }.GetNewClosure()
}
