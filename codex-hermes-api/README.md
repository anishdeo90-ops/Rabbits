# Codex Hermes API

OpenAI-compatible local bridge for Hermes, backed by this laptop's Codex CLI subscription.

## Hermes settings

- Provider: `custom`
- Base URL: `http://127.0.0.1:8010/v1`
- API key: value of `HERMES_API_KEY` in `.env`
- Model: `codex`

## Start

```powershell
cd C:\Users\admin\Music\Rabbits-main\codex-hermes-api
.\.venv\Scripts\python.exe server.py
```

## Verify

```powershell
Invoke-RestMethod http://127.0.0.1:8010/health
Invoke-RestMethod http://127.0.0.1:8010/v1/models -Headers @{ Authorization = "Bearer $((Get-Content .env | Where-Object { $_ -like 'HERMES_API_KEY=*' }) -replace '^HERMES_API_KEY=','')" }
```

## Test a completion

```powershell
$body = @{
  model = "codex"
  messages = @(@{ role = "user"; content = "Reply with exactly: api-ok" })
  stream = $false
} | ConvertTo-Json -Depth 5

Invoke-RestMethod http://127.0.0.1:8010/v1/chat/completions `
  -Method Post `
  -Headers @{ Authorization = "Bearer $((Get-Content .env | Where-Object { $_ -like 'HERMES_API_KEY=*' }) -replace '^HERMES_API_KEY=','')"; "Content-Type" = "application/json" } `
  -Body $body
```
