$ErrorActionPreference = "Stop"

$TaskName = "Codex Hermes Bridge"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host "Scheduled task '$TaskName' is not registered."
    exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Unregistered scheduled task '$TaskName'."
