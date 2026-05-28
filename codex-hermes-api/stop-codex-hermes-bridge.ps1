$ErrorActionPreference = "Stop"

$BridgeDir = $PSScriptRoot
$PidFile = Join-Path $BridgeDir "codex-hermes-bridge.pid"
$Port = 8010

$processIds = @()

if (Test-Path -LiteralPath $PidFile) {
    $pidText = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($pidText -match "^\d+$") {
        $processIds += [int]$pidText
    }
}

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
    $processIds += [int]$listener.OwningProcess
}

$bridgeProcesses = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -like "python*" -and
        $_.CommandLine -like "*codex-hermes-api*" -and
        $_.CommandLine -like "*server.py*"
    }

foreach ($bridgeProcess in $bridgeProcesses) {
    $processIds += [int]$bridgeProcess.ProcessId
}

$processIds = $processIds | Sort-Object -Unique

if (-not $processIds -or $processIds.Count -eq 0) {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "Codex Hermes bridge is not running."
    exit 0
}

foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $processId -Force
        Write-Host "Stopped Codex Hermes bridge process PID $processId."
    }
}

Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
