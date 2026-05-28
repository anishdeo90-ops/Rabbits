$ErrorActionPreference = "Stop"

$HealthUrl = "http://127.0.0.1:8010/health"
$ModelsUrl = "http://127.0.0.1:8010/v1/models"
$EnvFile = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path $EnvFile)) {
    throw "Missing bridge .env file: $EnvFile"
}

$ApiKey = Get-Content $EnvFile |
    Where-Object { $_ -match "^HERMES_API_KEY=" } |
    Select-Object -First 1 |
    ForEach-Object { $_ -replace "^HERMES_API_KEY=", "" }

if (-not $ApiKey) {
    throw "HERMES_API_KEY was not found in $EnvFile"
}

$health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 10
$models = Invoke-RestMethod -Uri $ModelsUrl -Headers @{ Authorization = "Bearer $ApiKey" } -TimeoutSec 10

[pscustomobject]@{
    health = $health.status
    service = $health.service
    model = $health.model
    models = ($models.data.id -join ",")
} | Format-List
