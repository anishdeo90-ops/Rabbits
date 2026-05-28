$ErrorActionPreference = "Stop"

$BridgeDir = $PSScriptRoot
$PythonExe = Join-Path $BridgeDir ".venv\Scripts\python.exe"
$ServerPy = Join-Path $BridgeDir "server.py"
$PidFile = Join-Path $BridgeDir "codex-hermes-bridge.pid"
$LogDir = Join-Path $BridgeDir "logs"
$StdOutLog = Join-Path $LogDir "bridge.out.log"
$StdErrLog = Join-Path $LogDir "bridge.err.log"
$HealthUrl = "http://127.0.0.1:8010/health"
$Port = 8010

function Test-BridgeHealth {
    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
        return ($response.status -eq "ok")
    } catch {
        return $false
    }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Python venv not found: $PythonExe"
}

if (-not (Test-Path -LiteralPath $ServerPy)) {
    throw "Bridge server not found: $ServerPy"
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    if (Test-BridgeHealth) {
        Set-Content -LiteralPath $PidFile -Value $listener.OwningProcess -Encoding ASCII
        Write-Host "Codex Hermes bridge is already running on $HealthUrl (PID $($listener.OwningProcess))."
        exit 0
    }

    throw "Port $Port is already in use by PID $($listener.OwningProcess), but $HealthUrl is not healthy."
}

$process = Start-Process `
    -FilePath $PythonExe `
    -ArgumentList @("server.py") `
    -WorkingDirectory $BridgeDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdOutLog `
    -RedirectStandardError $StdErrLog `
    -PassThru

Set-Content -LiteralPath $PidFile -Value $process.Id -Encoding ASCII

for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-BridgeHealth) {
        $activeListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        $activeProcessId = if ($activeListener) { $activeListener.OwningProcess } else { $process.Id }
        Set-Content -LiteralPath $PidFile -Value $activeProcessId -Encoding ASCII
        Write-Host "Codex Hermes bridge started on $HealthUrl (PID $activeProcessId)."
        exit 0
    }
}

throw "Started Codex Hermes bridge process $($process.Id), but health check did not pass. Check $StdErrLog."
