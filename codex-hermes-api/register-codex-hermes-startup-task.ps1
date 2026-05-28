$ErrorActionPreference = "Stop"

$TaskName = "Codex Hermes Bridge"
$TaskDescription = "Starts the local Codex OpenAI-compatible bridge for Hermes at user logon."
$StartScript = Join-Path $PSScriptRoot "start-codex-hermes-bridge.ps1"
$PowerShellExe = Join-Path $PSHOME "powershell.exe"
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path -LiteralPath $StartScript)) {
    throw "Startup script not found: $StartScript"
}

$action = New-ScheduledTaskAction `
    -Execute $PowerShellExe `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser

$principal = New-ScheduledTaskPrincipal `
    -UserId $CurrentUser `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description $TaskDescription `
    -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' for $CurrentUser."
