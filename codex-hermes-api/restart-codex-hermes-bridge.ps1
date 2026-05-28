$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "stop-codex-hermes-bridge.ps1")
Start-Sleep -Seconds 2
& (Join-Path $PSScriptRoot "start-codex-hermes-bridge.ps1")
